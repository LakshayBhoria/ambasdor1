const express = require('express');
const rateLimit = require('express-rate-limit');
const auth = require('../auth');
const mailer = require('../mailer');
const config = require('../config');

const router = express.Router();
const mk = (max) => rateLimit({ windowMs: 15 * 60 * 1000, max, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Please wait a few minutes and try again.' } });
const loginLimiter = mk(15), resetLimiter = mk(8);

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const user = await auth.getUserByEmail(email);
  const ok = await auth.checkPassword(password, user && user.passwordHash);
  if (!user || !ok) return res.status(401).json({ error: 'Invalid email or password.' });
  res.json({ user: auth.sanitize(user), token: auth.issueToken(user) });
});

router.get('/me', auth.attachUser, auth.requireAuth, async (req, res) => {
  const user = await auth.getUserById(req.user.sub);
  if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
  res.json({ user: auth.sanitize(user) });
});

router.post('/change-password', auth.attachUser, auth.requireAuth, resetLimiter, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const problem = auth.passwordProblem(newPassword);
  if (problem) return res.status(400).json({ error: problem });
  const user = await auth.getUserById(req.user.sub);
  if (!user || !(await auth.checkPassword(currentPassword || '', user.passwordHash))) return res.status(400).json({ error: 'Your current password is incorrect.' });
  await auth.resetPassword(user, newPassword);
  res.json({ message: 'Password updated.' });
});

router.post('/forgot-password', resetLimiter, async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  const generic = { message: "If an account exists for that email, we've sent a reset link. Check your inbox and your spam folder." };
  const user = await auth.getUserByEmail(email);
  if (!user) return res.json(generic);
  const token = await auth.createResetToken(user);
  const resetUrl = `${config.APP_URL}/reset-password.html?token=${token}&email=${encodeURIComponent(user.email)}`;
  let result;
  try {
    result = await mailer.sendMail({
      to: user.email, subject: `Reset your ${config.COMPANY_NAME} password`,
      text: `Hi ${user.name},\n\nUse this link to reset your password (valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, ignore this email.`
    });
  } catch (err) {
    console.error(`[auth] forgot-password: sendMail failed for ${user.email}: ${err.message}`);
    return res.json(generic);
  }
  // Only in development, with email switched off, is the link returned directly.
  if (result.skipped && !config.isProd) return res.json({ ...generic, devResetUrl: resetUrl });
  res.json(generic);
});

router.post('/reset-password', resetLimiter, async (req, res) => {
  const { email, token, newPassword } = req.body || {};
  if (!email || !token || !newPassword) return res.status(400).json({ error: 'Email, token and new password are required.' });
  const problem = auth.passwordProblem(newPassword);
  if (problem) return res.status(400).json({ error: problem });
  const user = await auth.consumeResetToken(email, token);
  if (!user) return res.status(400).json({ error: 'That reset link is invalid or has expired. Request a new one.' });
  await auth.resetPassword(user, newPassword);
  res.json({ message: 'Password updated. You can log in now.' });
});

module.exports = router;
