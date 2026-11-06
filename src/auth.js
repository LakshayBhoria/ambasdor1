const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('./config');
const store = require('./store');

const COLLECTION = 'users';
const MIN_PASSWORD = 8;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10); // keeps login timing equal for unknown emails

const normEmail = (e) => String(e || '').trim().toLowerCase();
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hashPassword = (plain) => bcrypt.hash(plain, 10);
async function checkPassword(plain, hash) { return bcrypt.compare(String(plain), hash || DUMMY_HASH); }

function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (pw.length > 128) return 'Password is too long.';
  return null;
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email, name: user.name }, config.JWT_SECRET, { expiresIn: '7d' });
}
function verifyToken(token) { try { return jwt.verify(token, config.JWT_SECRET); } catch { return null; } }

async function getUserByEmail(email) {
  const e = normEmail(email);
  return (await store.findBy(COLLECTION, 'email', e)) ||
         (await store.find(COLLECTION, u => normEmail(u.email) === e)); // legacy mixed-case records
}
const getUserById = (id) => store.findBy(COLLECTION, 'id', id);

function sanitize(user) {
  if (!user) return null;
  const { passwordHash, resetToken, resetTokenExpiry, ...rest } = user;
  return rest;
}

async function createUser({ name, email, password, role }) {
  email = normEmail(email);
  if (await getUserByEmail(email)) throw new Error('An account with that email already exists.');
  const user = await store.insert(COLLECTION, { name, email, passwordHash: await hashPassword(password), role });
  return sanitize(user);
}

function attachUser(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) { const payload = verifyToken(token); if (payload) req.user = payload; }
  next();
}
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Login required.' });
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Login required.' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission to do that.' });
    next();
  };
}

// Reset tokens are stored hashed, so a database leak cannot be used to take over accounts.
const RESET_TTL_MS = 60 * 60 * 1000;
async function createResetToken(user) {
  const token = crypto.randomBytes(32).toString('hex');
  await store.updateById(COLLECTION, user.id, { resetToken: sha256(token), resetTokenExpiry: Date.now() + RESET_TTL_MS });
  return token;
}
async function consumeResetToken(email, token) {
  const user = await getUserByEmail(email);
  if (!user || !user.resetToken || !user.resetTokenExpiry || Date.now() > user.resetTokenExpiry) return null;
  const a = Buffer.from(user.resetToken), b = Buffer.from(sha256(String(token)));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? user : null;
}
async function resetPassword(user, newPassword) {
  await store.updateById(COLLECTION, user.id, { passwordHash: await hashPassword(newPassword), resetToken: null, resetTokenExpiry: null });
}

async function seedAdminIfMissing() {
  if (await store.findBy(COLLECTION, 'role', 'admin')) return;
  await createUser({ name: 'Admin', email: config.SEED_ADMIN_EMAIL, password: config.SEED_ADMIN_PASSWORD, role: 'admin' });
  console.log(`[auth] Seeded admin account ${config.SEED_ADMIN_EMAIL}. Change its password after first login.`);
}

module.exports = {
  normEmail, hashPassword, checkPassword, passwordProblem, issueToken, verifyToken,
  getUserByEmail, getUserById, createUser, sanitize, attachUser, requireAuth, requireRole,
  seedAdminIfMissing, createResetToken, consumeResetToken, resetPassword
};
