const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const store = require('../store');
const auth = require('../auth');
const mailer = require('../mailer');
const amb = require('../ambassadors');
const rewards = require('../rewards');

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });
const maskName = (n) => { const p = String(n || 'Student').split(' '); return p[0] + (p[1] ? ' ' + p[1][0] + '.' : ''); };

router.post('/signup', limiter, async (req, res) => {
  if (!config.ALLOW_SELF_SIGNUP) return res.status(403).json({ error: 'Please apply through the ambassador application form.' });
  const { name, email, password, phone, college } = req.body || {};
  const problem = auth.passwordProblem(password);
  if (problem) return res.status(400).json({ error: problem });
  try {
    const { user, ambassador } = await amb.createAmbassador({ name, email, password, phone, college });
    mailer.sendMail({ to: user.email, subject: `Welcome to the ${config.COMPANY_NAME} Ambassador Program`,
      text: `Hi ${user.name},\n\nYour referral code is ${ambassador.refCode}.\nShare link: ${config.APP_URL}/r/${ambassador.refCode}\nDashboard: ${config.APP_URL}/login.html\n\nA referral counts once the student's payment is confirmed.\n\n- Team ${config.COMPANY_NAME}` })
      .catch(e => console.error('[mail] welcome failed:', e.message));
    res.status(201).json({ user, token: auth.issueToken(user), refCode: ambassador.refCode });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

async function me(req) {
  const a = await store.findBy('ambassadors', 'userId', req.user.sub);
  return a;
}

// Everything the logged-in ambassador's home page and dashboard need.
router.get('/me', auth.attachUser, auth.requireRole('ambassador'), async (req, res) => {
  const mine = await me(req);
  if (!mine) return res.status(404).json({ error: 'Ambassador profile not found.' });
  const s = await amb.statsFor(mine);
  const { refs, payouts, claims, settings, ...stats } = s;
  const board = await amb.leaderboardAll();
  const idx = board.findIndex(b => b.id === mine.id);
  const tiers = rewards.publicTiers(settings.tiers, s.paid, claims);
  const next = tiers.find(t => !t.unlocked) || null;
  res.json({
    ambassador: { name: mine.name, email: mine.email, phone: mine.phone || '', college: mine.college, refCode: mine.refCode,
      shareLink: `${config.APP_URL}/r/${mine.refCode}`, joined: mine.createdAt },
    stats, tiers, nextTier: next && { id: next.id, name: next.name, remaining: next.remaining, threshold: next.threshold },
    referrals: refs.map(r => ({ id: r.id, student: maskName(r.studentName), status: r.status, commission: r.commission, date: r.createdAt, paidAt: r.paidAt }))
      .sort((a, b) => b.date.localeCompare(a.date)),
    payouts: payouts.map(p => ({ amount: p.amount, note: p.note, date: p.createdAt })).sort((a, b) => b.date.localeCompare(a.date)),
    leaderboard: board.slice(0, 10).map(({ id, ...x }) => x), rank: idx >= 0 ? idx + 1 : null
  });
});

router.patch('/me', auth.attachUser, auth.requireRole('ambassador'), async (req, res) => {
  const mine = await me(req);
  if (!mine) return res.status(404).json({ error: 'Ambassador profile not found.' });
  const patch = {};
  if (req.body.name !== undefined) { patch.name = amb.clean(req.body.name, 80); if (!patch.name) return res.status(400).json({ error: 'Name cannot be empty.' }); }
  if (req.body.phone !== undefined) {
    patch.phone = amb.clean(req.body.phone, 20);
    if (patch.phone && !/^[+\d][\d\s-]{7,18}$/.test(patch.phone)) return res.status(400).json({ error: 'Enter a valid phone number.' });
  }
  if (req.body.college !== undefined) patch.college = amb.clean(req.body.college, 120);
  const updated = await store.updateById('ambassadors', mine.id, patch);
  if (patch.name) await store.updateById('users', req.user.sub, { name: patch.name });
  res.json({ ambassador: { name: updated.name, phone: updated.phone, college: updated.college } });
});

// Claim a reward tier once enough paid referrals are reached.
router.post('/claims', auth.attachUser, auth.requireRole('ambassador'), limiter, async (req, res) => {
  const mine = await me(req);
  if (!mine) return res.status(404).json({ error: 'Ambassador profile not found.' });
  const s = await amb.statsFor(mine);
  const tier = s.settings.tiers.find(t => t.id === req.body.tierId);
  if (!tier) return res.status(400).json({ error: 'Unknown reward tier.' });
  if (s.paid < tier.threshold) return res.status(400).json({ error: `You need ${tier.threshold} paid referrals to claim this reward. You have ${s.paid}.` });
  if (s.claims.some(c => c.tierId === tier.id)) return res.status(400).json({ error: 'You have already claimed this reward.' });
  const b = req.body || {};
  const claim = { ambassadorId: mine.id, tierId: tier.id, tierName: tier.name, status: 'requested', note: '', paidAtClaim: s.paid };
  if (tier.needsShipping) {
    const ship = { fullName: amb.clean(b.fullName, 80), phone: amb.clean(b.phone, 20), address: amb.clean(b.address, 240),
      city: amb.clean(b.city, 60), state: amb.clean(b.state, 60), pincode: amb.clean(b.pincode, 10) };
    if (!ship.fullName || !ship.address || !ship.city || !ship.state) return res.status(400).json({ error: 'Add your full name, address, city and state so we can send your gifts.' });
    if (!/^\d{10}$/.test(ship.phone.replace(/\D/g, '').slice(-10)) ) return res.status(400).json({ error: 'Enter a valid 10-digit phone number.' });
    if (!/^\d{6}$/.test(ship.pincode)) return res.status(400).json({ error: 'Enter a valid 6-digit PIN code.' });
    claim.shipping = ship;
  }
  if (tier.needsSize) {
    const size = String(b.size || '').toUpperCase();
    if (!['S', 'M', 'L', 'XL', 'XXL'].includes(size)) return res.status(400).json({ error: 'Choose your T-shirt size.' });
    claim.size = size;
  }
  const saved = await store.insert('claims', claim);
  mailer.sendMail({ to: mine.email, subject: `We received your ${tier.name} reward claim`,
    text: `Hi ${mine.name},\n\nYour claim for the ${tier.name} reward (${tier.threshold} paid referrals) is with our team. We will update you here: ${config.APP_URL}/dashboard.html#rewards\n\n- Team ${config.COMPANY_NAME}` })
    .catch(e => console.error('[mail] claim failed:', e.message));
  res.status(201).json({ claim: { id: saved.id, tierId: saved.tierId, status: saved.status } });
});

// Passwordless tracking: an ambassador enters their referral code and the email they applied with.
const trackLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false });
router.post('/track', trackLimiter, async (req, res) => {
  const code = String((req.body && req.body.code) || '').trim().toUpperCase();
  const email = amb.norm(req.body && req.body.email);
  const a = /^[A-Z0-9-]{4,20}$/.test(code) && email ? await store.findBy('ambassadors', 'refCode', code) : null;
  if (!a || amb.norm(a.email) !== email) return res.status(404).json({ error: 'Referral code and email do not match. Use the email you applied with.' });
  const s = await amb.statsFor(a);
  const tiers = rewards.publicTiers(s.settings.tiers, s.paid, s.claims);
  const next = tiers.find(t => !t.unlocked) || null;
  res.json({
    ambassador: { name: a.name, college: a.college, refCode: a.refCode, shareLink: `${config.APP_URL}/r/${a.refCode}` },
    stats: { paid: s.paid, pending: s.pending, clicks: s.clicks, commissionEarned: s.commissionEarned, paidOut: s.paidOut, balance: s.balance, target: s.target },
    tiers: tiers.map(t => ({ name: t.name, threshold: t.threshold, unlocked: t.unlocked, remaining: t.remaining })),
    nextTier: next && { name: next.name, remaining: next.remaining, threshold: next.threshold },
    referrals: s.refs.map(r => ({ student: maskName(r.studentName), status: r.status, commission: r.commission, date: r.createdAt }))
      .sort((x, y) => y.date.localeCompare(x.date)),
    payouts: s.payouts.map(p => ({ amount: p.amount, note: p.note, date: p.createdAt })).sort((x, y) => y.date.localeCompare(x.date))
  });
});

router.get('/leaderboard', async (req, res) => { res.set('Cache-Control', 'public, max-age=30'); res.json({ leaderboard: await amb.leaderboard(10) }); });

// Public program info for the landing page: tiers, commission, social proof.
router.get('/program', async (req, res) => {
  const [s, ambs, paid] = await Promise.all([amb.getSettings(), store.readAll('ambassadors'), store.filter('referrals', r => r.status === 'paid')]);
  res.set('Cache-Control', 'public, max-age=30');
  res.json({
    target: rewards.targetOf(s.tiers), commissionPerReferral: s.commissionPerReferral, tiers: rewards.publicTiers(s.tiers),
    stipend: config.STIPEND_TEXT, formUrl: config.FORM_URL, instagram: config.INSTAGRAM_URL, linkedin: config.LINKEDIN_URL,
    ambassadors: ambs.length, paidReferrals: paid.length
  });
});

/* ---- Server-to-server integrations (header x-integration-secret) ---- */
function requireSecret(req, res, next) {
  const given = Buffer.from(String(req.headers['x-integration-secret'] || ''));
  const want = Buffer.from(config.INTEGRATION_SECRET || '');
  if (!want.length || given.length !== want.length || !crypto.timingSafeEqual(given, want)) return res.status(401).json({ error: 'Bad integration secret.' });
  next();
}

// Two separate pieces are sent after the application form:
//  1) the MAIL body: login ID (email) + temporary password + links
//  2) the APPOINTMENT LETTER (attached file): referral code and program terms only, no login details.
const escH = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function appointmentLetter(user, a, settings) {
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const link = `${config.APP_URL}/r/${a.refCode}`;
  const ref = `TKX/AMB/${new Date().getFullYear()}/${a.refCode}`;
  const slabs = config.COMMISSION_SLABS; let from = 1;
  const slabLines = slabs.map(s => { const l = `Referrals ${from} to ${s.upTo}: Rs ${s.rate} each`; from = s.upTo + 1; return l; });
  const tierLines = rewards.sorted(settings.tiers).map(t => `${t.threshold} paid referrals (${t.name}): ${t.items.map(i => i.replace('{stipend}', config.STIPEND_TEXT)).join(', ')}`);
  const body = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:24px auto;border:1px solid #ccc;padding:34px;color:#222">
<h2 style="margin:0;color:#0b3d91">${escH(config.COMPANY_NAME)}</h2><p style="margin:4px 0 18px;color:#666">Ambassador Program &middot; Appointment Letter</p>
<p style="font-size:13px;color:#555">Ref No: ${escH(ref)}<br>Date: ${escH(date)}</p>
<p>Dear <b>${escH(user.name)}</b>,</p>
<p>We are pleased to appoint you as a <b>Campus Ambassador</b> of the ${escH(config.COMPANY_NAME)} Ambassador Program${a.college ? ' for <b>' + escH(a.college) + '</b>' : ''}.</p>
<div style="text-align:center;background:#f2f6ff;border:2px dashed #0b3d91;border-radius:8px;padding:16px;margin:18px 0">
<div style="font-size:12px;color:#555;letter-spacing:1px">YOUR REFERRAL CODE</div><div style="font-size:30px;font-weight:bold;letter-spacing:2px;color:#0b3d91">${escH(a.refCode)}</div>
<div style="font-size:13px;margin-top:6px">Share link: <a href="${escH(link)}">${escH(link)}</a></div></div>
<p>Ask students to mention your code when they register for the internship, or share the link above.</p>
<p><b>Commission per paid referral</b></p><ul>${slabLines.map(l => `<li>${escH(l)}</li>`).join('')}</ul>
<p><b>Rewards</b></p><ul>${tierLines.map(l => `<li>${escH(l)}</li>`).join('')}</ul>
<p style="font-size:13px;color:#555">Please keep your referral code safe and use it honestly. Self-referrals and duplicate entries are not counted.</p>
<p>With best wishes,<br><b>Team ${escH(config.COMPANY_NAME)}</b><br>${escH(config.MAIN_SITE)}</p></div>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Appointment Letter - ${escH(user.name)}</title></head><body style="background:#fff">${body}</body></html>`;
}

function credentialsMail(user, a, password) {
  const text = `Hi ${user.name},\n\nWelcome to the ${config.COMPANY_NAME} Ambassador Program! Your appointment letter is attached to this email (open it in any browser, and print or save it as PDF if you need).\n\n` +
    `YOUR LOGIN DETAILS\nPortal: ${config.APP_URL}/login.html\nLogin ID (email): ${user.email}\nTemporary password: ${password}\n(Please change your password after logging in, under Account.)\n\n` +
    `Your referral code: ${a.refCode}\nQuick tracking without login: ${config.APP_URL}/track.html (use your referral code and this email)\n\n- Team ${config.COMPANY_NAME}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#222">
<p>Hi <b>${escH(user.name)}</b>,</p>
<p>Welcome to the ${escH(config.COMPANY_NAME)} Ambassador Program! Your <b>appointment letter is attached</b> to this email. Open it in any browser, and print or save it as PDF if you need.</p>
<div style="background:#f2f6ff;border-radius:8px;padding:16px;margin:16px 0"><b>Your login details</b>
<table style="border-collapse:collapse;font-size:14px;margin-top:8px"><tr><td style="padding:3px 14px 3px 0;color:#555">Portal</td><td><a href="${escH(config.APP_URL)}/login.html">${escH(config.APP_URL)}/login.html</a></td></tr>
<tr><td style="padding:3px 14px 3px 0;color:#555">Login ID (email)</td><td><b>${escH(user.email)}</b></td></tr>
<tr><td style="padding:3px 14px 3px 0;color:#555">Temporary password</td><td><b style="font-family:monospace;font-size:16px">${escH(password)}</b></td></tr></table>
<p style="font-size:13px;color:#555;margin:8px 0 0">Please change your password after logging in, under Account.</p></div>
<p>Your referral code: <b>${escH(a.refCode)}</b><br><span style="font-size:13px;color:#555">Check your numbers without logging in: <a href="${escH(config.APP_URL)}/track.html">${escH(config.APP_URL)}/track.html</a> (referral code + this email).</span></p>
<p>- Team ${escH(config.COMPANY_NAME)}</p></div>`;
  return { text, html };
}


router.post('/integrations/ambassador', requireSecret, async (req, res) => {
  try {
    const { name, email, phone, college, startDate, duration, referredBy, refCode } = req.body || {};
    const password = amb.rand(10).toLowerCase();
    const { user, ambassador } = await amb.createAmbassador({ name, email, password, phone, college, startDate, duration, referredBy, refCode, source: 'google-form' });
    const sendEmail = !(req.body && req.body.sendEmail === false);   // Apps Script can set sendEmail:false and put the login in its own email
    if (sendEmail) {
      const mail = credentialsMail(user, ambassador, password);
      const letterHtml = appointmentLetter(user, ambassador, await amb.getSettings());
      await mailer.sendMail({ to: user.email, subject: `Welcome to the ${config.COMPANY_NAME} Ambassador Program: login details and appointment letter`, text: mail.text, html: mail.html,
        attachments: [{ filename: `Appointment-Letter-${ambassador.refCode}.html`, content: letterHtml, contentType: 'text/html; charset=utf-8' }] })
        .catch(e => console.error('[mail] welcome failed:', e.message));
    }
    const out = { ok: true, refCode: ambassador.refCode, loginEmail: user.email, portalUrl: `${config.APP_URL}/login.html`, trackUrl: `${config.APP_URL}/track.html` };
    if (req.body && req.body.returnPassword === true) out.tempPassword = password;   // only for the secret-protected integration call
    res.status(201).json(out);
  } catch (e) {
    if (/already registered/.test(e.message)) return res.json({ ok: true, duplicate: true });
    res.status(400).json({ error: e.message });
  }
});

router.post('/integrations/referral', requireSecret, async (req, res) => {
  try { res.status(201).json({ ok: true, referral: await amb.addReferral({ ...req.body, source: 'internship-form' }) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

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
