// End-to-end smoke test: boots the API on a temp data dir and walks the whole referral -> reward flow.
const { spawn } = require('child_process');
const os = require('os'), fs = require('fs'), path = require('path');
const assert = require('assert');
const PORT = 4199, BASE = `http://localhost:${PORT}`, SECRET = 'test-integration-secret-123456';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tka-'));
const srv = spawn('node', ['src/index.js'], { env: { ...process.env, PORT, DATA_DIR: dir, INTEGRATION_SECRET: SECRET, ALLOW_SELF_SIGNUP: 'true', NODE_ENV: 'development', SEED_ADMIN_PASSWORD: 'admin-pass-12345' }, stdio: 'pipe' });
srv.stderr.on('data', d => process.stderr.write(d));
const j = async (p, { method = 'GET', body, token, secret } = {}) => {
  const r = await fetch(BASE + p, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }), ...(secret && { 'x-integration-secret': secret }) }, body: body && JSON.stringify(body) });
  let data = {}; try { data = await r.json(); } catch {} return { status: r.status, data, headers: r.headers };
};
let n = 0; const ok = (name) => console.log(`  ok ${++n}. ${name}`);
(async () => {
  for (let i = 0; i < 50; i++) { try { if ((await j('/api/health')).status === 200) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
  assert.equal((await j('/api/health')).status, 200); ok('health');

  const admin = (await j('/api/auth/login', { method: 'POST', body: { email: 'admin@thinkorix.com', password: 'admin-pass-12345' } })).data;
  assert(admin.token); ok('admin login');
  assert.equal((await j('/api/auth/login', { method: 'POST', body: { email: 'admin@thinkorix.com', password: 'wrong' } })).status, 401); ok('bad password rejected');

  const su = await j('/api/ambassador/signup', { method: 'POST', body: { name: 'Riya Sharma', email: 'Riya@Example.com', password: 'secret-pass-1', college: 'DCRUST, Murthal', phone: '9876543210' } });
  assert.equal(su.status, 201); const tok = su.data.token, code = su.data.refCode; ok('ambassador signup, code ' + code);
  assert.equal((await j('/api/ambassador/signup', { method: 'POST', body: { name: 'X', email: 'riya@example.com', password: 'secret-pass-1' } })).status, 400); ok('duplicate email rejected');
  assert.equal((await j('/api/ambassador/signup', { method: 'POST', body: { name: 'X', email: 'x@example.com', password: 'short' } })).status, 400); ok('short password rejected');

  assert.equal((await j('/api/ambassador/me')).status, 401); ok('me requires login');
  assert.equal((await j('/api/admin/overview', { token: tok })).status, 403); ok('ambassador cannot reach admin');
  assert.equal((await j('/api/ambassador/integrations/referral', { method: 'POST', body: { refCode: code, studentEmail: 'a@b.co' }, secret: 'nope' })).status, 401); ok('bad integration secret rejected');
  assert.equal((await j('/api/ambassador/integrations/referral', { method: 'POST', body: { refCode: code, studentEmail: 'riya@example.com' }, secret: SECRET })).status, 400); ok('self-referral rejected');

  for (let i = 1; i <= 22; i++) {
    const e = `student${i}@college.edu`;
    assert.equal((await j('/api/ambassador/integrations/referral', { method: 'POST', body: { refCode: code, studentName: 'Student Number' + i, studentEmail: e }, secret: SECRET })).status, 201);
    if (i <= 20) assert.equal((await j('/api/ambassador/integrations/paid', { method: 'POST', body: { studentEmail: e }, secret: SECRET })).status, 200);
  }
  ok('22 referrals created, 20 marked paid');
  const dup = await j('/api/ambassador/integrations/referral', { method: 'POST', body: { refCode: code, studentEmail: 'student1@college.edu' }, secret: SECRET });
  assert.equal(dup.status, 201); assert.equal((await j('/api/ambassador/me', { token: tok })).data.stats.totalReferrals, 22); ok('duplicate referral not double counted');

  const me = (await j('/api/ambassador/me', { token: tok })).data;
  assert.equal(me.stats.paid, 20); assert.equal(me.stats.pending, 2); assert.equal(me.stats.commissionEarned, 2000);
  assert.equal(me.tiers.length, 3); assert(me.tiers[0].unlocked && !me.tiers[1].unlocked); assert.equal(me.nextTier.id, 'champion'); assert.equal(me.nextTier.remaining, 10);
  assert.equal(me.rank, 1); assert.equal(me.referrals[0].student.includes('@'), false); ok('dashboard stats, tiers, next tier, rank');

  assert.equal((await j('/api/ambassador/claims', { method: 'POST', token: tok, body: { tierId: 'legend' } })).status, 400); ok('cannot claim locked tier');
  assert.equal((await j('/api/ambassador/claims', { method: 'POST', token: tok, body: { tierId: 'rising', fullName: 'Riya Sharma', phone: '9876543210', address: '12 Model Town', city: 'Sonipat', state: 'Haryana', pincode: '131001' } })).status, 400); ok('t-shirt size required');
  const cl = await j('/api/ambassador/claims', { method: 'POST', token: tok, body: { tierId: 'rising', size: 'M', fullName: 'Riya Sharma', phone: '9876543210', address: '12 Model Town', city: 'Sonipat', state: 'Haryana', pincode: '131001' } });
  assert.equal(cl.status, 201); ok('claim created');
  assert.equal((await j('/api/ambassador/claims', { method: 'POST', token: tok, body: { tierId: 'rising', size: 'M', fullName: 'R', phone: '9876543210', address: 'x', city: 'x', state: 'x', pincode: '131001' } })).status, 400); ok('double claim rejected');
  assert.equal((await j('/api/ambassador/me', { token: tok })).data.tiers[0].claimStatus, 'requested'); ok('claim status shown to ambassador');

  const claims = (await j('/api/admin/claims', { token: admin.token })).data.claims;
  assert.equal(claims.length, 1); assert.equal(claims[0].shipping.pincode, '131001');
  assert.equal((await j('/api/admin/claims/' + claims[0].id, { method: 'PATCH', token: admin.token, body: { status: 'dispatched', note: 'Courier #123' } })).status, 200);
  assert.equal((await j('/api/ambassador/me', { token: tok })).data.tiers[0].claimStatus, 'dispatched'); ok('admin updates claim');

  const g = (await j('/api/gallery')).data; assert(g.items.length >= 5); ok('gallery seeded (' + g.items.length + ' items)');
  assert.equal((await j('/api/gallery?category=Certificates')).data.items.every(i => i.category === 'Certificates'), true); ok('gallery filter');
  assert.equal((await j('/api/admin/gallery', { method: 'POST', token: admin.token, body: { title: 'Bad', imageUrl: 'javascript:alert(1)', category: 'Events' } })).status, 400); ok('unsafe image URL rejected');
  const ni = await j('/api/admin/gallery', { method: 'POST', token: admin.token, body: { title: 'Meetup', imageUrl: 'https://example.com/a.jpg', category: 'Events', featured: true } });
  assert.equal(ni.status, 201); assert.equal((await j('/api/admin/gallery/' + ni.data.item.id, { method: 'DELETE', token: admin.token })).status, 200); ok('admin gallery add/delete');

  const tiers = (await j('/api/admin/overview', { token: admin.token })).data.settings.tiers; tiers[0].cash = 500;
  assert.equal((await j('/api/admin/settings', { method: 'PATCH', token: admin.token, body: { tiers } })).status, 200);
  assert((await j('/api/ambassador/program')).data.tiers[0].items.some(i => i.includes('500'))); ok('admin edits tier cash, shown publicly');
  assert.equal((await j('/api/admin/settings', { method: 'PATCH', token: admin.token, body: { tiers: [] } })).status, 400); ok('invalid tiers rejected');

  const r = await j('/r/' + code); assert.equal(r.status, 302); assert(r.headers.get('location').includes('ref=' + code));
  assert.equal((await j('/api/ambassador/me', { token: tok })).data.stats.clicks, 1); ok('share link redirects and counts click');

  const pr = (await j('/api/ambassador/program')).data; assert.equal(pr.target, 50); assert.equal(pr.paidReferrals, 20); ok('public program info');
  assert.equal((await j('/api/ambassador/leaderboard')).data.leaderboard[0].paid, 20); ok('leaderboard');

  assert.equal((await j('/api/auth/change-password', { method: 'POST', token: tok, body: { currentPassword: 'wrong', newPassword: 'brand-new-pass-1' } })).status, 400);
  assert.equal((await j('/api/auth/change-password', { method: 'POST', token: tok, body: { currentPassword: 'secret-pass-1', newPassword: 'brand-new-pass-1' } })).status, 200);
  assert.equal((await j('/api/auth/login', { method: 'POST', body: { email: 'riya@example.com', password: 'brand-new-pass-1' } })).status, 200); ok('change password');

  const fp = (await j('/api/auth/forgot-password', { method: 'POST', body: { email: 'riya@example.com' } })).data; assert(fp.devResetUrl);
  const u = new URL(fp.devResetUrl);
  assert.equal((await j('/api/auth/reset-password', { method: 'POST', body: { email: 'riya@example.com', token: u.searchParams.get('token'), newPassword: 'reset-pass-12345' } })).status, 200);
  assert.equal((await j('/api/auth/reset-password', { method: 'POST', body: { email: 'riya@example.com', token: u.searchParams.get('token'), newPassword: 'reset-pass-67890' } })).status, 400); ok('password reset works once');

  const pt = await j('/api/ambassador/me', { method: 'PATCH', token: tok, body: { phone: '9999988888', college: 'DCRUST' } }); assert.equal(pt.status, 200); ok('profile update');
  console.log(`\nAll ${n} checks passed.`);
})().then(() => { srv.kill(); process.exit(0); }).catch(e => { console.error('\nFAILED:', e.message); console.error(e.stack.split('\n')[1]); srv.kill(); process.exit(1); });
