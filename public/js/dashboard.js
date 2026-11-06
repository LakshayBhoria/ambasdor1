(function () {
  const T = TKA, S = T.site, E = T.escapeHtml, R = S.R, $ = id => document.getElementById(id);
  if (!T.requireLogin({ roles: ['ambassador'] })) return;
  S.nav(); S.footer();
  let D = null, claimTier = null, showAll = false;

  const copy = (t, msg) => navigator.clipboard.writeText(t).then(() => T.toast(msg || 'Copied')).catch(() => T.toast('Copy failed. Select the text and copy it manually.', true));

  function paint(d) {
    D = d; const a = d.ambassador, s = d.stats, n = d.nextTier;
    document.title = a.name.split(' ')[0] + "'s dashboard — ThinKorix Ambassadors";
    $('hi').textContent = 'Welcome back, ' + a.name.split(' ')[0];
    $('passbox').innerHTML = S.pass({ name: a.name, college: a.college, code: a.refCode, paid: s.paid, rank: d.rank }, s.target, d.tiers);
    $('pd').textContent = s.paid; $('tg').textContent = s.target;
    $('ladder').innerHTML = S.ladder(d.tiers, s.paid, s.target);
    const toClaim = d.tiers.filter(t => t.unlocked && !t.claimed).length;
    $('pm').textContent = toClaim ? `You have ${toClaim} reward${toClaim > 1 ? 's' : ''} ready to claim.` + (n ? ` ${n.remaining} more paid referral${n.remaining === 1 ? '' : 's'} to reach ${n.name}.` : '')
      : n ? `${n.remaining} more paid referral${n.remaining === 1 ? '' : 's'} to unlock ${n.name}.` : 'You have unlocked every reward tier.';
    $('copylink').onclick = () => copy(a.shareLink, 'Link copied'); $('copycode').onclick = () => copy(a.refCode, 'Code copied');
    $('wa').href = 'https://wa.me/?text=' + encodeURIComponent('Join the ThinKorix paid internship. Use my code ' + a.refCode + ': ' + a.shareLink);
    $('s1').textContent = s.paid; $('s2').textContent = s.pending; $('s3').textContent = R(s.commissionEarned); $('s4').textContent = R(s.balance); $('ck').textContent = s.clicks;
    $('tiers').innerHTML = S.tierCards(d.tiers, { personal: true, compact: true });
    document.querySelectorAll('[data-claim]').forEach(b => b.onclick = () => openClaim(b.dataset.claim));
    const rows = showAll ? d.referrals : d.referrals.slice(0, 10);
    $('rt').innerHTML = d.referrals.length ? rows.map(r => `<tr><td>${E(r.student)}</td><td>${T.fmtDate(r.date)}</td><td><span class="tag ${r.status === 'paid' ? 'tag-green' : 'tag-amber'}">${r.status === 'paid' ? 'Paid' : 'Pending'}</span></td><td>${r.status === 'paid' ? R(r.commission) : '-'}</td></tr>`).join('') + (d.referrals.length > 10 && !showAll ? `<tr><td colspan="4" class="more-row"><button class="btn btn-ghost btn-sm" id="showall">Show all ${d.referrals.length} referrals</button></td></tr>` : '')
      : '<tr><td colspan="4"><div class="empty">No referrals yet. Send your link to a friend who wants an internship.</div></td></tr>';
    if ($('showall')) $('showall').onclick = () => { showAll = true; paint(D); };
    $('po').innerHTML = d.payouts.length ? d.payouts.map(p => `<div class="rowline"><span>${T.fmtDate(p.date)}${p.note ? ' · ' + E(p.note) : ''}</span><b>${R(p.amount)}</b></div>`).join('') : '<p class="mut">No payouts yet. Your balance is paid out by the ThinKorix team.</p>';
    $('lb').innerHTML = d.leaderboard.length ? d.leaderboard.map((x, i) => `<div class="rowline"><span>${i + 1}. ${E(x.name)}</span><b>${x.paid}</b></div>`).join('') : '<p class="mut">No paid referrals on the board yet.</p>';
    $('rk').textContent = d.rank ? 'You are #' + d.rank : '';
    $('an').value = a.name; $('ae').value = a.email; $('ap').value = a.phone || ''; $('ac').value = a.college || '';
  }

  async function load() { try { paint(await T.api('/api/ambassador/me')); if (location.hash === '#rewards') $('rewards').scrollIntoView(); } catch (e) { T.toast(e.message, true); } }

  /* claim modal */
  function openClaim(id) {
    claimTier = D.tiers.find(t => t.id === id); if (!claimTier) return;
    $('mt').textContent = `Claim your ${claimTier.name} reward`;
    $('ms').textContent = 'Tell us where to send your gifts. We use these details only for this reward.';
    $('sizef').style.display = claimTier.needsSize ? '' : 'none'; $('csz').required = !!claimTier.needsSize;
    $('cn').value = D.ambassador.name; $('cph').value = D.ambassador.phone || ''; $('merr').classList.remove('show');
    $('modal').classList.add('open'); $('cn').focus();
  }
  const closeModal = () => $('modal').classList.remove('open');
  $('cx').onclick = closeModal; $('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  $('cf').onsubmit = async e => {
    e.preventDefault(); const b = $('csub'); b.disabled = true; b.textContent = 'Sending…'; $('merr').classList.remove('show');
    try {
      await T.api('/api/ambassador/claims', { method: 'POST', body: { tierId: claimTier.id, fullName: $('cn').value, phone: $('cph').value, address: $('ca').value, city: $('cc').value, state: $('cs').value, pincode: $('cz').value, size: $('csz').value } });
      closeModal(); T.toast('Claim sent. We will update you here and by email.'); load();
    } catch (err) { $('merr').textContent = err.message; $('merr').classList.add('show'); }
    b.disabled = false; b.textContent = 'Send claim';
  };

  /* account */
  $('pf').onsubmit = async e => {
    e.preventDefault(); const b = $('pfb'); b.disabled = true;
    try {
      const r = await T.api('/api/ambassador/me', { method: 'PATCH', body: { name: $('an').value, phone: $('ap').value, college: $('ac').value } });
      const u = T.getUser(); u.name = r.ambassador.name; T.setSession(u, T.getToken()); S.nav(); T.toast('Details saved'); load();
    } catch (err) { T.toast(err.message, true); }
    b.disabled = false;
  };
  $('pw').onsubmit = async e => {
    e.preventDefault(); const b = $('pwb'); b.disabled = true;
    try { await T.api('/api/auth/change-password', { method: 'POST', body: { currentPassword: $('cp').value, newPassword: $('np').value } }); $('pw').reset(); T.toast('Password changed'); }
    catch (err) { T.toast(err.message, true); }
    b.disabled = false;
  };
  load();
})();
