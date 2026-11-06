const express = require('express');
const store = require('../store');
const auth = require('../auth');
const amb = require('../ambassadors');

const router = express.Router();
router.use(auth.attachUser, auth.requireRole('admin'));

router.get('/overview', async (req, res) => {
  const [ambs, refs, payouts, settings] = await Promise.all([store.readAll('ambassadors'), store.readAll('referrals'), store.readAll('payouts'), amb.getSettings()]);
  const paid = refs.filter(r => r.status === 'paid');
  const earned = paid.reduce((s, r) => s + (r.commission || 0), 0), out = payouts.reduce((s, p) => s + p.amount, 0);
  res.json({ ambassadors: ambs.length, referrals: refs.length, paid: paid.length, pending: refs.length - paid.length,
    commissionEarned: earned, paidOut: out, owed: earned - out, settings });
});

router.get('/ambassadors', async (req, res) => {
  const ambs = await store.readAll('ambassadors');
  const rows = await Promise.all(ambs.map(async a => { const { refs, payouts, ...s } = await amb.statsFor(a);
    return { id: a.id, name: a.name, email: a.email, phone: a.phone, college: a.college, refCode: a.refCode, source: a.source, referredBy: a.referredBy, duration: a.duration, startDate: a.startDate, joined: a.createdAt, ...s }; }));
  res.json({ ambassadors: rows.sort((a, b) => b.paid - a.paid) });
});

router.get('/referrals', async (req, res) => {
  const [refs, ambs] = await Promise.all([store.readAll('referrals'), store.readAll('ambassadors')]);
  res.json({ referrals: refs.map(r => ({ ...r, ambassador: (ambs.find(a => a.id === r.ambassadorId) || {}).name })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});

router.post('/referrals', async (req, res) => {   // manual entry
  try { res.status(201).json({ referral: await amb.addReferral({ ...req.body, source: 'admin' }) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/referrals/:id', async (req, res) => {
  const { status } = req.body || {};
  if (!['paid', 'pending'].includes(status)) return res.status(400).json({ error: 'status must be paid or pending.' });
  const r = await amb.setReferralStatus(req.params.id, status);
  if (!r) return res.status(404).json({ error: 'Not found.' });
  if (status === 'paid') amb.notifyPaid(r);
  res.json({ referral: r });
});

router.delete('/referrals/:id', async (req, res) => { await store.removeById('referrals', req.params.id); res.json({ ok: true }); });

router.post('/payouts', async (req, res) => {
  const { ambassadorId, amount, note } = req.body || {};
  const a = await store.find('ambassadors', x => x.id === ambassadorId);
  if (!a || !(Number(amount) > 0)) return res.status(400).json({ error: 'Valid ambassadorId and amount required.' });
  res.status(201).json({ payout: await store.insert('payouts', { ambassadorId, amount: Number(amount), note: note || '' }) });
});

// Rate applies to referrals that become paid AFTER the change.
router.patch('/settings', async (req, res) => {
  const s = await amb.getSettings(); const patch = {};
  if (req.body.commissionPerReferral !== undefined) patch.commissionPerReferral = Math.max(0, Number(req.body.commissionPerReferral));
  if (req.body.targetReferrals !== undefined) patch.targetReferrals = Math.max(1, parseInt(req.body.targetReferrals, 10));
  res.json({ settings: await store.updateById('settings', s.id, patch) });
});

module.exports = router;
