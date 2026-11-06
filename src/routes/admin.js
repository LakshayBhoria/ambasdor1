const express = require('express');
const store = require('../store');
const auth = require('../auth');
const amb = require('../ambassadors');
const rewards = require('../rewards');
const mailer = require('../mailer');
const config = require('../config');
const { CATEGORIES } = require('./gallery');

const router = express.Router();
router.use(auth.attachUser, auth.requireRole('admin'));

router.get('/overview', async (req, res) => {
  const [ambs, refs, payouts, claims, gallery, settings] = await Promise.all([store.readAll('ambassadors'), store.readAll('referrals'), store.readAll('payouts'), store.readAll('claims'), store.readAll('gallery'), amb.getSettings()]);
  const paid = refs.filter(r => r.status === 'paid');
  const earned = paid.reduce((s, r) => s + (r.commission || 0), 0), out = payouts.reduce((s, p) => s + p.amount, 0);
  res.json({ ambassadors: ambs.length, referrals: refs.length, paid: paid.length, pending: refs.length - paid.length,
    commissionEarned: earned, paidOut: out, owed: earned - out, openClaims: claims.filter(c => c.status !== 'completed').length,
    galleryItems: gallery.length, settings: { commissionPerReferral: settings.commissionPerReferral, tiers: settings.tiers } });
});

router.get('/ambassadors', async (req, res) => {
  const [ambs, refs, payouts, claims, settings] = await Promise.all([store.readAll('ambassadors'), store.readAll('referrals'), store.readAll('payouts'), store.readAll('claims'), amb.getSettings()]);
  const rows = ambs.map(a => { const { refs: _r, payouts: _p, claims: _c, ...s } = amb.computeStats(a, refs, payouts, settings, claims);
    return { id: a.id, name: a.name, email: a.email, phone: a.phone, college: a.college, refCode: a.refCode, source: a.source, referredBy: a.referredBy, duration: a.duration, startDate: a.startDate, joined: a.createdAt, ...s }; });
  res.json({ ambassadors: rows.sort((a, b) => b.paid - a.paid) });
});

router.get('/referrals', async (req, res) => {
  const [refs, ambs] = await Promise.all([store.readAll('referrals'), store.readAll('ambassadors')]);
  const byId = Object.fromEntries(ambs.map(a => [a.id, a.name]));
  res.json({ referrals: refs.map(r => ({ ...r, ambassador: byId[r.ambassadorId] })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});

router.post('/referrals', async (req, res) => {
  try { res.status(201).json({ referral: await amb.addReferral({ ...req.body, source: 'admin' }) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/referrals/:id', async (req, res) => {
  const { status } = req.body || {};
  if (!['paid', 'pending'].includes(status)) return res.status(400).json({ error: 'Status must be paid or pending.' });
  const before = await store.findBy('referrals', 'id', req.params.id);
  if (!before) return res.status(404).json({ error: 'Not found.' });
  const r = await amb.setReferralStatus(req.params.id, status);
  if (status === 'paid' && before.status !== 'paid') amb.notifyPaid(r);
  res.json({ referral: r });
});

router.delete('/referrals/:id', async (req, res) => { await store.removeById('referrals', req.params.id); res.json({ ok: true }); });

router.post('/payouts', async (req, res) => {
  const { ambassadorId, amount, note } = req.body || {};
  const a = await store.findBy('ambassadors', 'id', ambassadorId);
  if (!a || !(Number(amount) > 0)) return res.status(400).json({ error: 'Choose an ambassador and enter an amount above zero.' });
  res.status(201).json({ payout: await store.insert('payouts', { ambassadorId, amount: Number(amount), note: amb.clean(note, 120) }) });
});

// Reward claims
router.get('/claims', async (req, res) => {
  const [claims, ambs] = await Promise.all([store.readAll('claims'), store.readAll('ambassadors')]);
  const byId = Object.fromEntries(ambs.map(a => [a.id, a]));
  res.json({ claims: claims.map(c => ({ ...c, ambassador: (byId[c.ambassadorId] || {}).name, email: (byId[c.ambassadorId] || {}).email, refCode: (byId[c.ambassadorId] || {}).refCode }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});
router.patch('/claims/:id', async (req, res) => {
  const { status, note } = req.body || {};
  if (status && !['requested', 'processing', 'dispatched', 'completed'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const patch = {}; if (status) patch.status = status; if (note !== undefined) patch.note = amb.clean(note, 300);
  const c = await store.updateById('claims', req.params.id, patch);
  if (!c) return res.status(404).json({ error: 'Not found.' });
  if (status === 'dispatched' || status === 'completed') {
    const a = await store.findBy('ambassadors', 'id', c.ambassadorId);
    if (a) mailer.sendMail({ to: a.email, subject: `Your ${c.tierName} reward is ${status === 'completed' ? 'complete' : 'on its way'}`,
      text: `Hi ${a.name},\n\nYour ${c.tierName} reward claim is now marked ${status}.${c.note ? '\n\nNote from the team: ' + c.note : ''}\n\n- Team ${config.COMPANY_NAME}` }).catch(() => {});
  }
  res.json({ claim: c });
});

// Gallery
function galleryFields(b, partial) {
  const out = {};
  if (!partial || b.title !== undefined) { out.title = amb.clean(b.title, 80); if (!out.title) throw new Error('Add a title.'); }
  if (!partial || b.imageUrl !== undefined) {
    out.imageUrl = String(b.imageUrl || '').trim();
    if (!/^https:\/\/\S+$/i.test(out.imageUrl) && !/^\/img\/[\w.-]+$/.test(out.imageUrl)) throw new Error('Image URL must start with https://');
  }
  if (!partial || b.category !== undefined) { out.category = CATEGORIES.includes(b.category) ? b.category : (partial ? undefined : 'Events'); if (out.category === undefined) throw new Error('Unknown category.'); }
  if (b.caption !== undefined) out.caption = amb.clean(b.caption, 200);
  if (b.featured !== undefined) out.featured = !!b.featured;
  return out;
}
router.get('/gallery', async (req, res) => res.json({ items: (await store.readAll('gallery')).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), categories: CATEGORIES }));
router.post('/gallery', async (req, res) => {
  try { res.status(201).json({ item: await store.insert('gallery', { featured: false, caption: '', ...galleryFields(req.body || {}, false) }) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.patch('/gallery/:id', async (req, res) => {
  try { const it = await store.updateById('gallery', req.params.id, galleryFields(req.body || {}, true)); if (!it) return res.status(404).json({ error: 'Not found.' }); res.json({ item: it }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/gallery/:id', async (req, res) => { await store.removeById('gallery', req.params.id); res.json({ ok: true }); });

// Settings: commission rate and reward tiers. A new rate applies only to referrals that turn paid afterwards.
router.patch('/settings', async (req, res) => {
  try {
    const s = await amb.getSettings(); const patch = {};
    if (req.body.commissionPerReferral !== undefined) patch.commissionPerReferral = Math.max(0, Number(req.body.commissionPerReferral) || 0);
    if (req.body.tiers !== undefined) patch.tiers = rewards.validateTiers(req.body.tiers);
    const u = await store.updateById('settings', s.id, patch);
    res.json({ settings: { commissionPerReferral: u.commissionPerReferral, tiers: u.tiers } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
