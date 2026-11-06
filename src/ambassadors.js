// Core ambassador logic shared by all routes.
const crypto = require('crypto');
const config = require('./config');
const store = require('./store');
const auth = require('./auth');
const mailer = require('./mailer');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rand = (n) => Array.from(crypto.randomBytes(n), b => ALPHABET[b % ALPHABET.length]).join('');
const norm = (e) => String(e || '').trim().toLowerCase();

async function getSettings() {
  let s = await store.find('settings', x => x.key === 'main');
  if (!s) s = await store.insert('settings', {
    key: 'main', commissionPerReferral: config.COMMISSION_PER_REFERRAL, targetReferrals: config.TARGET_REFERRALS
  });
  return s;
}

// Codes look like TKX-RAH101 (same format the application form shows): TKX- + 3 letters of the name + 3 digits.
async function uniqueCode(name, preferred) {
  const want = String(preferred || '').trim().toUpperCase();
  if (/^[A-Z0-9-]{4,20}$/.test(want) && !(await store.find('ambassadors', a => a.refCode === want))) return want;
  const letters = (String(name).toUpperCase().replace(/[^A-Z]/g, '') + 'XXX').slice(0, 3);
  for (;;) {
    const code = `TKX-${letters}${100 + crypto.randomInt(900)}`;
    if (!(await store.find('ambassadors', a => a.refCode === code))) return code;
  }
}

// Creates login (role 'ambassador') + ambassador profile with a unique referral code.
async function createAmbassador({ name, email, password, phone, college, startDate, duration, referredBy, refCode: preferredCode, source }) {
  email = norm(email);
  if (!name || !email) throw new Error('Name and email are required.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Invalid email.');
  const existing = await store.find('ambassadors', a => a.email === email);
  if (existing) throw new Error('This email is already registered as an ambassador. Please log in.');
  const user = await auth.createUser({ name, email, password, role: 'ambassador' });
  const refCode = await uniqueCode(name, preferredCode);
  const ref = String(referredBy || '').trim().toUpperCase();
  const referrer = ref && await store.find('ambassadors', a => a.refCode === ref);
  const amb = await store.insert('ambassadors', {
    userId: user.id, name: name.trim(), email, phone: phone || '', college: college || '',
    refCode, clicks: 0, source: source || 'website',
    startDate: startDate || '', duration: duration || '', referredBy: referrer ? referrer.refCode : ''
  });
  return { user, ambassador: amb };
}

async function statsFor(amb) {
  const [settings, refs, payouts] = await Promise.all([
    getSettings(),
    store.filter('referrals', r => r.ambassadorId === amb.id),
    store.filter('payouts', p => p.ambassadorId === amb.id)
  ]);
  const paid = refs.filter(r => r.status === 'paid');
  const earned = paid.reduce((s, r) => s + (r.commission || 0), 0);
  const paidOut = payouts.reduce((s, p) => s + (p.amount || 0), 0);
  return {
    totalReferrals: refs.length, paid: paid.length, pending: refs.length - paid.length,
    target: settings.targetReferrals, commissionPerReferral: settings.commissionPerReferral,
    commissionEarned: earned, paidOut, balance: earned - paidOut,
    targetReached: paid.length >= settings.targetReferrals,
    clicks: amb.clicks || 0, refs, payouts
  };
}

// Records a student who used a referral code. Idempotent per (code, student email).
async function addReferral({ refCode, studentName, studentEmail, status, source }) {
  const code = String(refCode || '').trim().toUpperCase();
  const amb = await store.find('ambassadors', a => a.refCode === code);
  if (!amb) throw new Error('Unknown referral code.');
  const email = norm(studentEmail);
  const dup = email && await store.find('referrals', r => r.ambassadorId === amb.id && r.studentEmail === email);
  if (dup) return dup;
  const rec = await store.insert('referrals', {
    ambassadorId: amb.id, refCode: code, studentName: studentName || 'Student', studentEmail: email,
    status: 'pending', commission: 0, source: source || 'website'
  });
  return status === 'paid' ? setReferralStatus(rec.id, 'paid') : rec;
}

// Commission is snapshotted when a referral turns paid, so later rate changes don't rewrite history.
async function setReferralStatus(id, status) {
  const settings = await getSettings();
  const paid = status === 'paid';
  return store.updateById('referrals', id, {
    status: paid ? 'paid' : 'pending',
    commission: paid ? settings.commissionPerReferral : 0,
    paidAt: paid ? new Date().toISOString() : null
  });
}

async function notifyPaid(ref) {
  const amb = await store.find('ambassadors', a => a.id === ref.ambassadorId);
  if (!amb) return;
  const s = await statsFor(amb);
  await mailer.sendMail({
    to: amb.email, subject: `A referral just counted! ${s.paid}/${s.target} — ${config.COMPANY_NAME}`,
    text: `Hi ${amb.name},\n\n${ref.studentName}'s payment is confirmed. You now have ${s.paid} of ${s.target} paid referrals ` +
          `and ₹${s.commissionEarned} in commission.\n\nLog in: ${config.APP_URL}/login.html\n\n- Team ${config.COMPANY_NAME}`
  }).catch(e => console.error('[mail] notifyPaid failed:', e.message));
}

async function leaderboard(limit = 10) {
  const [ambs, refs] = await Promise.all([store.readAll('ambassadors'), store.filter('referrals', r => r.status === 'paid')]);
  return ambs.map(a => ({ name: a.name.split(' ')[0] + (a.college ? ' · ' + a.college : ''), paid: refs.filter(r => r.ambassadorId === a.id).length }))
    .filter(x => x.paid > 0).sort((a, b) => b.paid - a.paid).slice(0, limit);
}

module.exports = { norm, rand, getSettings, createAmbassador, statsFor, addReferral, setReferralStatus, notifyPaid, leaderboard };
