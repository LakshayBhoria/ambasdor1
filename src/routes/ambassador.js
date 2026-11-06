const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const store = require('../store');
const auth = require('../auth');
const mailer = require('../mailer');
const amb = require('../ambassadors');

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });

// Self-signup (replaces the Google Form): account + referral code created instantly.
router.post('/signup', limiter, async (req, res) => {
  if (!config.ALLOW_SELF_SIGNUP) return res.status(403).json({ error: 'Please apply through the ambassador application form.' });
  try {
    const { name, email, password, phone, college } = req.body || {};
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const { user, ambassador } = await amb.createAmbassador({ name, email, password, phone, college });
    mailer.sendMail({
      to: user.email, subject: `Welcome to the ${config.COMPANY_NAME} Ambassador Program`,
      text: `Hi ${user.name},\n\nYou're in! Your referral code is ${ambassador.refCode}.\nShare link: ${config.APP_URL}/r/${ambassador.refCode}\n` +
            `Track referrals and commission: ${config.APP_URL}/login.html\n\nA referral counts once the student's payment is confirmed.\n\n- Team ${config.COMPANY_NAME}`
    }).catch(e => console.error('[mail] welcome failed:', e.message));
    res.status(201).json({ user, token: auth.issueToken(user), refCode: ambassador.refCode });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Logged-in ambassador's dashboard data.
router.get('/me', auth.attachUser, auth.requireRole('ambassador'), async (req, res) => {
  const me = await store.find('ambassadors', a => a.userId === req.user.sub);
  if (!me) return res.status(404).json({ error: 'Ambassador profile not found.' });
  const s = await amb.statsFor(me);
  const { refs, payouts, ...stats } = s;
  const board = await amb.leaderboard(10);
  const rank = board.findIndex(b => b.name.startsWith(me.name.split(' ')[0])) + 1 || null;
  res.json({
    ambassador: { name: me.name, email: me.email, college: me.college, refCode: me.refCode, shareLink: `${config.APP_URL}/r/${me.refCode}` },
    stats,
    // student names are masked: ambassadors see first name + initial only
    referrals: refs.map(r => ({ id: r.id, student: (r.studentName || 'Student').split(' ')[0] + ' ' + ((r.studentName || '').split(' ')[1] || '').slice(0, 1) + '.',
      status: r.status, commission: r.commission, date: r.createdAt, paidAt: r.paidAt })).sort((a, b) => b.date.localeCompare(a.date)),
    payouts: payouts.map(p => ({ amount: p.amount, note: p.note, date: p.createdAt })),
    leaderboard: board, rank
  });
});

router.get('/leaderboard', async (req, res) => res.json({ leaderboard: await amb.leaderboard(10) }));
router.get('/program', async (req, res) => {
  const s = await amb.getSettings();
  res.json({ target: s.targetReferrals, commissionPerReferral: s.commissionPerReferral, formUrl: config.FORM_URL });
});

/* ---- Integrations: called server-to-server with header x-integration-secret ---- */
function requireSecret(req, res, next) {
  if (!config.INTEGRATION_SECRET || req.headers['x-integration-secret'] !== config.INTEGRATION_SECRET)
    return res.status(401).json({ error: 'Bad integration secret.' });
  next();
}

// Google Form (Apps Script) → auto-register + email login details.
router.post('/integrations/ambassador', requireSecret, async (req, res) => {
  try {
    const { name, email, phone, college, startDate, duration, referredBy, refCode } = req.body || {};
    const password = amb.rand(8).toLowerCase();
    const { user, ambassador } = await amb.createAmbassador({ name, email, password, phone, college, startDate, duration, referredBy, refCode, source: 'google-form' });
    await mailer.sendMail({
      to: user.email, subject: `Welcome to the ${config.COMPANY_NAME} Ambassador Program`,
      text: `Hi ${user.name},\n\nYou're registered!\n\nReferral code: ${ambassador.refCode}\nShare link: ${config.APP_URL}/r/${ambassador.refCode}\n` +
            `Portal: ${config.APP_URL}/login.html\nLogin: ${user.email}\nTemporary password: ${password}\n(Change it via "Forgot password".)\n\n- Team ${config.COMPANY_NAME}`
    }).catch(e => console.error('[mail] welcome failed:', e.message));
    res.status(201).json({ ok: true, refCode: ambassador.refCode });
  } catch (e) {
    if (/already registered/.test(e.message)) return res.json({ ok: true, duplicate: true });
    res.status(400).json({ error: e.message });
  }
});

// Main ThinKorix internship registration → records a pending referral.
router.post('/integrations/referral', requireSecret, async (req, res) => {
  try { res.status(201).json({ ok: true, referral: await amb.addReferral({ ...req.body, source: 'internship-form' }) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Payment confirmed (gateway webhook / your backend) → referral becomes paid, commission locked in.
router.post('/integrations/paid', requireSecret, async (req, res) => {
  const { refCode, studentEmail } = req.body || {};
  const email = amb.norm(studentEmail);
  const ref = await store.find('referrals', r => r.studentEmail === email && (!refCode || r.refCode === String(refCode).toUpperCase()));
  if (!ref) return res.status(404).json({ error: 'No matching referral.' });
  if (ref.status === 'paid') return res.json({ ok: true, already: true });
  const updated = await amb.setReferralStatus(ref.id, 'paid');
  amb.notifyPaid(updated);
  res.json({ ok: true, referral: updated });
});

module.exports = router;
