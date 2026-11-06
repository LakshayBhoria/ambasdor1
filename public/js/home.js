(function () {
  const T = TKA, S = T.site, E = T.escapeHtml, $ = id => document.getElementById(id);
  S.nav(); S.footer();
  const user = T.getUser();
  let prog = null;

  function samplePass(target, tiers) {
    $('hero-pass').innerHTML = S.pass({ name: 'Riya Sharma', college: 'DCRUST, Murthal', code: 'TKA7K2MQ', paid: 24 }, target, tiers) +
      '<p class="pass-cap">Sample pass. Yours appears here after you log in.</p>';
  }

  function welcome(me) {
    const first = me.ambassador.name.split(' ')[0], s = me.stats, n = me.nextTier;
    $('hero-copy').innerHTML = `<h1>Welcome back, ${E(first)}.</h1>
      <p class="lead">${n ? `You are ${n.remaining} paid referral${n.remaining === 1 ? '' : 's'} away from the ${E(n.name)} reward.` : 'You have unlocked every reward tier. Our team will be in touch.'}</p>
      <div class="welcome"><div class="welcome-facts">
        <div class="fact"><div class="n">${s.paid}</div><div class="l">Paid referrals</div></div>
        <div class="fact"><div class="n">${s.pending}</div><div class="l">Waiting for payment</div></div>
        <div class="fact"><div class="n">${S.R(s.balance)}</div><div class="l">Balance to be paid</div></div>
        ${me.rank ? `<div class="fact"><div class="n">#${me.rank}</div><div class="l">Leaderboard rank</div></div>` : ''}</div>
      <div class="cta"><a href="dashboard.html" class="btn btn-primary">Open dashboard</a><a href="dashboard.html#rewards" class="btn btn-ghost">${me.tiers.some(t => t.unlocked && !t.claimed) ? 'Claim your reward' : 'See your rewards'}</a></div></div>`;
  }

  function adminHero() {
    $('hero-copy').innerHTML = `<h1>Welcome back, ${E(user.name.split(' ')[0])}.</h1><p class="lead">You are signed in as an admin.</p><div class="cta"><a href="admin.html" class="btn btn-primary">Open admin panel</a></div>`;
  }

  async function init() {
    let program = { target: 50, tiers: [], commissionPerReferral: 100, stipend: '₹9,000+', formUrl: S.FORM };
    try { program = await T.api('/api/ambassador/program', { auth: false }); } catch (e) { /* server may be waking up */ }
    const tiers = program.tiers || [];
    ['cta-apply', 'cta-apply2'].forEach(id => { if ($(id)) $(id).href = program.formUrl || S.FORM; });
    S.footer(program);
    if ($('faq-stip')) $('faq-stip').textContent = program.stipend;

    $('proof').innerHTML = `<div><b>${S.R(program.commissionPerReferral)} to ${S.R(program.commissionMax || program.commissionPerReferral)}</b><span>commission per paid referral</span></div>
      <div><b>${tiers.map(t => t.threshold).join(', ') || '20, 30, 50'}</b><span>referral milestones with rewards</span></div>
      <div><b>${E(program.stipend)}</b><span>internship stipend at ${program.target || 50} referrals</span></div>
      ${program.ambassadors > 0 ? `<div><b>${program.ambassadors}</b><span>ambassadors, ${program.paidReferrals} paid referrals</span></div>` : ''}`;

    if (user && user.role === 'ambassador') {
      try { prog = await T.api('/api/ambassador/me'); } catch (e) { prog = null; if (!T.isLoggedIn()) S.nav(); }
    }
    if (prog) {
      welcome(prog);
      $('hero-pass').innerHTML = S.pass({ name: prog.ambassador.name, college: prog.ambassador.college, code: prog.ambassador.refCode, paid: prog.stats.paid, rank: prog.rank }, prog.stats.target, prog.tiers);
    } else {
      if (user && user.role === 'admin') adminHero();
      samplePass(program.target || 50, tiers);
    }
    const mine = prog ? prog.tiers : tiers;
    if (mine.length) {
      $('ladder').innerHTML = S.ladder(mine, prog ? prog.stats.paid : null, program.target || 50);
      $('tiers').innerHTML = S.tierCards(mine, { personal: !!prog });
      document.querySelectorAll('[data-claim]').forEach(b => b.onclick = () => { location.href = 'dashboard.html#rewards'; });
    } else $('tiers').innerHTML = '<div class="empty">Rewards will appear here once the server is reachable. Please refresh in a moment.</div>';
  }

  T.api('/api/gallery', { auth: false }).then(d => {
    const items = d.items.slice(0, 4);
    if (!items.length) { $('gallery').style.display = 'none'; return; }
    $('gal').innerHTML = items.map((it, n) => S.galItem(it, n)).join(''); S.bindGallery($('gal'), items);
  }).catch(() => { $('gal').innerHTML = '<div class="empty">The gallery could not be loaded. Refresh to try again.</div>'; });

  T.api('/api/ambassador/leaderboard', { auth: false }).then(d => {
    if (d.leaderboard.length) $('lb').innerHTML = d.leaderboard.map((x, i) => `<div class="rowline"><span><b>${i + 1}.</b> ${E(x.name)}</span><span class="tag tag-green">${x.paid} paid</span></div>`).join('');
  }).catch(() => {});

  init();
})();
