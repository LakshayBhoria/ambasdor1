/* Shared site pieces: nav, footer, ambassador pass, reward ladder, tier cards, gallery + lightbox. */
(function (g) {
  const T = g.TKA, E = T.escapeHtml, R = n => '₹' + Number(n || 0).toLocaleString('en-IN');
  const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLScTRbUOw4FHh3KwtpyeXcAsyXCVqWudVkkVqPsYQIP2fzAdnA/viewform';
  const ART = ['gallery-tshirt', 'gallery-goodies', 'gallery-hamper'];
  const safeImg = u => (/^https:\/\/\S+$/i.test(u) || /^\/img\/[\w.-]+$/.test(u)) ? u : 'img/gallery-goodies.svg';
  const pct = (a, b) => Math.max(0, Math.min(100, b ? a / b * 100 : 0));
  const home = u => (u && u.role === 'admin') ? 'admin.html' : 'dashboard.html';

  function nav(active) {
    const el = document.getElementById('appbar'); if (!el) return;
    const u = T.getUser();
    const links = [['how', 'index.html#how', 'How it works'], ['rewards', 'index.html#rewards', 'Rewards'], ['gallery', 'gallery.html', 'Gallery'], ['top', 'index.html#top', 'Leaderboard']];
    el.innerHTML = `<div class="appbar-inner">
      <a href="index.html" class="brand"><img src="logo.jpeg" alt="">ThinKorix <small>Ambassadors</small></a>
      <nav class="nav" aria-label="Main">${links.map(l => `<a href="${l[1]}" class="${active === l[0] ? 'active' : ''}">${l[2]}</a>`).join('')}${u ? '' : `<a class="nav-apply" href="${FORM}" target="_blank" rel="noopener">Apply now</a>`}</nav>
      <div class="appbar-right">${u
        ? `<a class="user-chip" href="${home(u)}" title="Open your ${u.role === 'admin' ? 'admin panel' : 'dashboard'}"><span class="user-avatar">${E(T.initials(u.name))}</span><span class="who"><b>${E(u.name)}</b><span>${E(u.role)}</span></span></a>
           <button class="icon-btn" id="logout-btn" title="Log out" aria-label="Log out"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg></button>`
        : `<a href="login.html" class="btn btn-ghost btn-sm">Log in</a><a href="${FORM}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Apply now</a>`}
        <button class="menu-btn" id="menu-btn" aria-label="Menu" aria-expanded="false"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
      </div></div>`;
    el.classList.add('appbar');
    const lo = document.getElementById('logout-btn'); if (lo) lo.onclick = T.logout;
    const mb = document.getElementById('menu-btn');
    mb.onclick = () => { const o = el.classList.toggle('open'); mb.setAttribute('aria-expanded', o); };
    el.querySelectorAll('.nav a').forEach(a => a.addEventListener('click', () => el.classList.remove('open')));
  }

  function footer(p) {
    const el = document.getElementById('site-footer'); if (!el) return;
    p = p || {};
    el.innerHTML = `<footer class="wrap foot"><div class="foot-grid">
      <div><a href="index.html" class="brand"><img src="logo.jpeg" alt="">ThinKorix <small>Ambassadors</small></a><p class="mut" style="margin-top:10px;max-width:34ch">Refer students to ThinKorix paid internships and earn cash, gifts and an internship of your own.</p></div>
      <div class="foot-links"><a href="index.html#how">How it works</a><a href="index.html#rewards">Rewards</a><a href="gallery.html">Gallery</a><a href="login.html">Log in</a><a href="${E(p.formUrl || FORM)}" target="_blank" rel="noopener">Apply</a>
      ${p.instagram ? `<a href="${E(p.instagram)}" target="_blank" rel="noopener">Instagram</a>` : ''}${p.linkedin ? `<a href="${E(p.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ''}
      <a href="https://www.thinkorix.com" target="_blank" rel="noopener">thinkorix.com</a></div></div>
      <p class="foot-small mut">© ${new Date().getFullYear()} ThinKorix. A referral counts once the student's payment is confirmed. Rewards are issued by the ThinKorix team after verification.</p></footer>`;
  }

  // The ambassador pass: real data when logged in, a clearly labelled sample otherwise.
  function pass(d, target, tiers) {
    const ticks = (tiers || []).filter(t => t.threshold < target).map(t => `<b style="left:${pct(t.threshold, target)}%"></b>`).join('');
    return `<section class="pass" aria-label="Ambassador pass"><div class="pass-top"><img src="logo.jpeg" alt=""><div><b>ThinKorix</b><span>Ambassador pass</span></div></div>
      <div class="pass-name">${E(d.name)}</div><div class="pass-sub">${E(d.college || 'ThinKorix ambassador')}</div>
      <div class="pass-div"></div><div class="pass-lbl">Referral code</div><div class="code">${E(d.code)}</div>
      <div class="prog">${ticks}<i style="width:${pct(d.paid, target)}%"></i></div>
      <div class="pass-meta"><span><b>${d.paid}</b> of ${target} paid referrals</span>${d.rank ? `<span>Rank <b>#${d.rank}</b></span>` : ''}</div></section>`;
  }

  function ladder(tiers, paid, target) {
    const me = paid != null;
    return `<div class="ladder" role="img" aria-label="Reward milestones at ${tiers.map(t => t.threshold).join(', ')} paid referrals">
      <div class="ladder-track"><i style="width:${me ? pct(paid, target) : 0}%"></i>
      ${tiers.map(t => `<span class="node ${me && paid >= t.threshold ? 'on' : ''}" style="left:${pct(t.threshold, target)}%">${t.threshold}<small>${E(t.name)}</small></span>`).join('')}
      ${me && paid > 0 ? `<span class="you" style="left:${pct(paid, target)}%">You: ${paid}</span>` : ''}</div></div>`;
  }

  // opts.personal: show locked/unlocked state and actions. opts.compact: smaller art.
  function tierCards(tiers, opts) {
    opts = opts || {};
    const last = tiers.length - 1;
    return `<div class="tiers ${opts.compact ? 'compact' : ''}">${tiers.map((t, i) => {
      const legend = tiers.length >= 3 && i === last;
      let tag = '', act = '';
      if (opts.personal) {
        if (t.claimed) { tag = `<span class="status ${t.claimStatus}">${t.claimStatus === 'requested' ? 'Claim received' : t.claimStatus[0].toUpperCase() + t.claimStatus.slice(1)}</span>`; }
        else if (t.unlocked) { tag = '<span class="tag tag-green">Unlocked</span>'; act = `<div class="tier-act"><button class="btn ${legend ? 'btn-primary' : 'btn-dark'}" data-claim="${E(t.id)}">Claim this reward</button></div>`; }
        else { tag = `<span class="tag tag-slate">${t.remaining} to go</span>`; }
      }
      const art = `img/${ART[Math.min(i, ART.length - 1)]}.svg`;
      return `<article class="tier ${legend ? 'tier-legend' : ''} ${opts.personal && !t.unlocked ? 'locked' : ''}" id="tier-${E(t.id)}">
        <img class="tier-art" src="${art}" alt="" loading="lazy"><div class="tier-body">
        <div class="tier-head"><span class="tier-n">${t.threshold}</span><span>paid referrals</span>${tag}</div>
        <h3>${E(t.name)}</h3><p class="mut">${E(t.tagline)}</p>
        <ul class="rw ${opts.personal && t.unlocked ? 'on' : ''}">${t.items.map(x => `<li>${E(x)}</li>`).join('')}</ul>${act}</div></article>`;
    }).join('')}</div>`;
  }

  /* ---- gallery grid + lightbox ---- */
  let LB = { items: [], i: 0 };
  function galItem(it, n) {
    return `<button class="gal-item" data-n="${n}" aria-label="Open ${E(it.title)}"><img src="${E(safeImg(it.imageUrl))}" alt="${E(it.title)}" loading="lazy"><div class="gal-cap"><b>${E(it.title)}</b><span>${E(it.caption || it.category)}</span></div></button>`;
  }
  function lightbox() {
    let el = document.getElementById('lightbox');
    if (!el) {
      el = document.createElement('div'); el.id = 'lightbox'; el.className = 'lightbox'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Image viewer');
      el.innerHTML = '<button class="lb-btn lb-x" aria-label="Close">×</button><button class="lb-btn lb-prev" aria-label="Previous">‹</button><figure><img alt=""><figcaption></figcaption></figure><button class="lb-btn lb-next" aria-label="Next">›</button>';
      document.body.appendChild(el);
      el.addEventListener('click', e => { if (e.target === el || e.target.classList.contains('lb-x')) close(); });
      el.querySelector('.lb-prev').onclick = () => step(-1); el.querySelector('.lb-next').onclick = () => step(1);
      document.addEventListener('keydown', e => { if (!el.classList.contains('open')) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1); });
    }
    return el;
  }
  function show() { const el = lightbox(), it = LB.items[LB.i]; el.querySelector('img').src = safeImg(it.imageUrl); el.querySelector('img').alt = it.title; el.querySelector('figcaption').innerHTML = `<b>${E(it.title)}</b><span>${E(it.caption || it.category)}</span>`; }
  function step(d) { LB.i = (LB.i + d + LB.items.length) % LB.items.length; show(); }
  function close() { lightbox().classList.remove('open'); document.body.style.overflow = ''; if (LB.opener) LB.opener.focus(); }
  function bindGallery(root, items) {
    LB.items = items;
    root.querySelectorAll('.gal-item').forEach(b => b.onclick = () => { LB.i = +b.dataset.n; LB.opener = b; show(); lightbox().classList.add('open'); document.body.style.overflow = 'hidden'; lightbox().querySelector('.lb-x').focus(); });
  }

  g.TKA.site = { nav, footer, pass, ladder, tierCards, galItem, bindGallery, safeImg, R, FORM, pct };
})(window);
