// Core ambassador logic shared by all routes.
const crypto = require('crypto');
const config = require('./config');
const store = require('./store');
const auth = require('./auth');
const mailer = require('./mailer');
const rewards = require('./rewards');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rand = (n) => Array.from(crypto.randomBytes(n), b => ALPHABET[b % ALPHABET.length]).join('');
const norm = (e) => String(e || '').trim().toLowerCase();
const clean = (v, max = 120) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

async function getSettings() {
  let s = await store.findBy('settings', 'key', 'main');
  if (!s) s = await store.insert('settings', { key: 'main', commissionPerReferral: config.COMMISSION_PER_REFERRAL, tiers: rewards.DEFAULT_TIERS });
  else if (!Array.isArray(s.tiers) || !s.tiers.length) s = await store.updateById('settings', s.id, { tiers: rewards.DEFAULT_TIERS });
  return s;
}

async function uniqueCode(name, preferred) {
  const want = String(preferred || '').trim().toUpperCase();
  if (/^[A-Z0-9-]{4,20}$/.test(want) && !(await store.findBy('ambassadors', 'refCode', want))) return want;
  const letters = (String(name).toUpperCase().replace(/[^A-Z]/g, '') + 'XXX').slice(0, 3);
  for (;;) {
    const code = `TKX-${letters}${100 + crypto.randomInt(900)}`;
    if (!(await store.findBy('ambassadors', 'refCode', code))) return code;
  }
}

async function createAmbassador({ name, email, password, phone, college, startDate, duration, referredBy, refCode: preferredCode, source }) {
  email = norm(email); name = clean(name, 80);
  if (!name || !email) throw new Error('Name and email are required.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Invalid email.');
  if (await store.findBy('ambassadors', 'email', email)) throw new Error('This email is already registered as an ambassador. Please log in.');
  const user = await auth.createUser({ name, email, password, role: 'ambassador' });
  const refCode = await uniqueCode(name, preferredCode);
  const ref = String(referredBy || '').trim().toUpperCase();
  const referrer = ref && await store.findBy('ambassadors', 'refCode', ref);
  const amb = await store.insert('ambassadors', {
    userId: user.id, name, email, phone: clean(phone, 20), college: clean(college), refCode, clicks: 0, source: source || 'website',
    startDate: clean(startDate, 40), duration: clean(duration, 40), referredBy: referrer ? referrer.refCode : ''
  });
  return { user, ambassador: amb };
}

// Pure computation so list views can load each collection once.
function computeStats(amb, refs, payouts, settings, claims = []) {
  const mine = refs.filter(r => r.ambassadorId === amb.id);
  const paidRefs = mine.filter(r => r.status === 'paid');
  const myPayouts = payouts.filter(p => p.ambassadorId === amb.id);
  const myClaims = claims.filter(c => c.ambassadorId === amb.id);
  const earned = paidRefs.reduce((s, r) => s + (r.commission || 0), 0);
  const paidOut = myPayouts.reduce((s, p) => s + (p.amount || 0), 0);
  const target = rewards.targetOf(settings.tiers);
  return {
    totalReferrals: mine.length, paid: paidRefs.length, pending: mine.length - paidRefs.length,
    target, commissionPerReferral: settings.commissionPerReferral,
    commissionEarned: earned, paidOut, balance: earned - paidOut, targetReached: paidRefs.length >= target,
    clicks: amb.clicks || 0, refs: mine, payouts: myPayouts, claims: myClaims
  };
}

async function statsFor(amb) {
  const [settings, refs, payouts, claims] = await Promise.all([
    getSettings(), store.filterBy('referrals', 'ambassadorId', amb.id),
    store.filterBy('payouts', 'ambassadorId', amb.id), store.filterBy('claims', 'ambassadorId', amb.id)
  ]);
  return { ...computeStats(amb, refs, payouts, settings, claims), settings };
}

async function addReferral({ refCode, studentName, studentEmail, status, source }) {
  const code = String(refCode || '').trim().toUpperCase();
  const amb = await store.findBy('ambassadors', 'refCode', code);
  if (!amb) throw new Error('Unknown referral code.');
  const email = norm(studentEmail);
  if (email && email === amb.email) throw new Error('Ambassadors cannot refer themselves.');
  const dup = email && (await store.filterBy('referrals', 'ambassadorId', amb.id)).find(r => r.studentEmail === email);
  if (dup) return dup;
  const anyDup = email && await store.findBy('referrals', 'studentEmail', email); // one student counts for one ambassador only
  if (anyDup) return anyDup;
  const rec = await store.insert('referrals', {
    ambassadorId: amb.id, refCode: code, studentName: clean(studentName, 80) || 'Student', studentEmail: email,
    status: 'pending', commission: 0, source: source || 'website'
  });
  return status === 'paid' ? setReferralStatus(rec.id, 'paid') : rec;
}

// Commission for the Nth paid referral of an ambassador (slab table in config.COMMISSION_SLABS).
function slabRate(n) {
  const slabs = config.COMMISSION_SLABS;
  const hit = slabs.find(s => n <= s.upTo);
  return (hit || slabs[slabs.length - 1]).rate;
}

async function setReferralStatus(id, status) {
  const paid = status === 'paid';
  let commission = 0;
  if (paid) {
    const ref = await store.findBy('referrals', 'id', id);
    const already = ref && ref.status === 'paid';
    const others = (await store.filterBy('referrals', 'ambassadorId', ref.ambassadorId)).filter(r => r.status === 'paid' && r.id !== id);
    commission = already ? ref.commission : slabRate(others.length + 1);
  }
  return store.updateById('referrals', id, {
    status: paid ? 'paid' : 'pending', commission, paidAt: paid ? new Date().toISOString() : null
  });
}

async function notifyPaid(ref) {
  const amb = await store.findBy('ambassadors', 'id', ref.ambassadorId);
  if (!amb) return;
  const s = await statsFor(amb);
  const unlocked = rewards.sorted(s.settings.tiers).find(t => t.threshold === s.paid);
  const extra = unlocked
    ? `\n\nYou unlocked the ${unlocked.name} reward tier (${unlocked.threshold} paid referrals): ${unlocked.items.join(', ')}.\nClaim it from your dashboard: ${config.APP_URL}/dashboard.html#rewards\n`
    : '';
  await mailer.sendMail({
    to: amb.email, subject: unlocked ? `You unlocked ${unlocked.name}! ${config.COMPANY_NAME}` : `A referral just counted: ${s.paid} paid. ${config.COMPANY_NAME}`,
    text: `Hi ${amb.name},\n\n${ref.studentName}'s payment is confirmed. You now have ${s.paid} paid referrals and ₹${s.commissionEarned} in commission.${extra}\nLog in: ${config.APP_URL}/login.html\n\n- Team ${config.COMPANY_NAME}`
  }).catch(e => console.error('[mail] notifyPaid failed:', e.message));
}

async function leaderboardAll() {
  const [ambs, refs] = await Promise.all([store.readAll('ambassadors'), store.filter('referrals', r => r.status === 'paid')]);
  const counts = {};
  refs.forEach(r => { counts[r.ambassadorId] = (counts[r.ambassadorId] || 0) + 1; });
  return ambs.map(a => ({ id: a.id, name: a.name.split(' ')[0] + (a.college ? ' · ' + a.college : ''), paid: counts[a.id] || 0 }))
    .filter(x => x.paid > 0).sort((a, b) => b.paid - a.paid);
}
async function leaderboard(limit = 10) { return (await leaderboardAll()).slice(0, limit).map(({ id, ...x }) => x); }

module.exports = { norm, clean, rand, getSettings, createAmbassador, computeStats, statsFor, addReferral, setReferralStatus, notifyPaid, leaderboard, leaderboardAll };
