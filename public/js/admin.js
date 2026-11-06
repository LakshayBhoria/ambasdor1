(function () {
  const T = TKA, E = T.escapeHtml, R = TKA.site.R, $ = id => document.getElementById(id);
  if (!T.requireLogin({ roles: ['admin'] })) return;
  T.renderAppbar({ title: 'Admin' });
  let AMB = [], CLAIMS = [], GAL = [], TIERS = [];

  document.querySelectorAll('.tab').forEach(t => t.onclick = () => { document.querySelectorAll('.tab,.tab-panel').forEach(x => x.classList.remove('active')); t.classList.add('active'); $(t.dataset.t).classList.add('active'); });
  async function call(p, m, b) { try { return await T.api('/api/admin' + p, { method: m || 'GET', body: b }); } catch (e) { T.toast(e.message, true); throw e; } }

  async function load() {
    const [o, a, r, c, g] = await Promise.all([call('/overview'), call('/ambassadors'), call('/referrals'), call('/claims'), call('/gallery')]);
    AMB = a.ambassadors; CLAIMS = c.claims; GAL = g.items; TIERS = o.settings.tiers;
    $('ov').innerHTML = [['ambassadors', 'Ambassadors'], ['paid', 'Paid referrals'], ['openClaims', 'Open reward claims'], ['owed', 'Commission owed']].map(([k, l]) => `<div class="stat-card"><div class="num">${k === 'owed' ? R(o[k]) : o[k]}</div><div class="lbl">${l}</div></div>`).join('');
    $('clmN').style.display = o.openClaims ? '' : 'none'; $('clmN').textContent = o.openClaims;
    $('sc').value = o.settings.commissionPerReferral;
    $('at').innerHTML = AMB.map(x => `<tr><td>${E(x.name)}<div class="mut">${E(x.email)}${x.phone ? ' · ' + E(x.phone) : ''}${x.referredBy ? ' · referred by ' + E(x.referredBy) : ''}</div></td><td><code>${E(x.refCode)}</code></td><td>${E(x.college)}</td><td>${x.paid}/${x.target}</td><td>${x.pending}</td><td>${R(x.commissionEarned)}</td><td>${R(x.balance)}</td></tr>`).join('') || '<tr><td colspan="7" class="mut">No ambassadors yet.</td></tr>';
    $('pa').innerHTML = AMB.map(x => `<option value="${E(x.id)}">${E(x.name)}, balance ${R(x.balance)}</option>`).join('');
    $('rt').innerHTML = r.referrals.map(x => `<tr><td>${E(x.studentName)}<div class="mut">${E(x.studentEmail)}</div></td><td>${E(x.ambassador || '?')}</td><td><code>${E(x.refCode)}</code></td><td><span class="tag ${x.status === 'paid' ? 'tag-green' : 'tag-amber'}">${x.status}</span></td><td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-act="setref" data-id="${E(x.id)}" data-s="${x.status === 'paid' ? 'pending' : 'paid'}">Mark ${x.status === 'paid' ? 'pending' : 'paid'}</button><button class="btn btn-danger btn-sm" data-act="delref" data-id="${E(x.id)}">Delete</button></div></td></tr>`).join('') || '<tr><td colspan="5" class="mut">No referrals yet.</td></tr>';
    $('ct').innerHTML = CLAIMS.map(c => { const s = c.shipping;
      return `<tr><td>${E(c.ambassador || '?')}<div class="mut">${E(c.email || '')}<br><code>${E(c.refCode || '')}</code></div></td><td><b>${E(c.tierName)}</b><div class="mut">${c.paidAtClaim} paid at claim${c.size ? '<br>T-shirt: ' + E(c.size) : ''}</div></td>
      <td class="mut">${s ? `${E(s.fullName)}, ${E(s.phone)}<br>${E(s.address)}, ${E(s.city)}, ${E(s.state)} ${E(s.pincode)}` : '-'}</td>
      <td><select data-cs="${E(c.id)}" aria-label="Status">${['requested', 'processing', 'dispatched', 'completed'].map(x => `<option ${x === c.status ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
      <td><input data-cn="${E(c.id)}" value="${E(c.note || '')}" maxlength="300" placeholder="Courier or tracking info" aria-label="Note"></td><td><button class="btn btn-primary btn-sm" data-act="saveclaim" data-id="${E(c.id)}">Save</button></td></tr>`; }).join('') || '<tr><td colspan="6" class="mut">No reward claims yet.</td></tr>';
    $('gadm').innerHTML = GAL.map(g => `<div class="card"><img src="${E(T.site.safeImg(g.imageUrl))}" alt="${E(g.title)}" loading="lazy"><div class="in"><b>${E(g.title)}</b><div class="mut">${E(g.category)}${g.featured ? ' · Featured' : ''}</div><div class="row-actions" style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-act="featgal" data-id="${E(g.id)}">${g.featured ? 'Unfeature' : 'Feature'}</button><button class="btn btn-danger btn-sm" data-act="delgal" data-id="${E(g.id)}">Delete</button></div></div></div>`).join('') || '<p class="mut">No photos yet.</p>';
    if (!$('gcat').options.length) $('gcat').innerHTML = g.categories.map(c => `<option>${E(c)}</option>`).join('');
    drawTiers();
  }

  function drawTiers() {
    $('tiered').innerHTML = TIERS.map((t, i) => `<div class="tier-ed" data-i="${i}"><div class="field-row"><div class="field"><label>Referrals needed</label><input type="number" min="1" data-f="threshold" value="${t.threshold}"></div><div class="field"><label>Name</label><input data-f="name" maxlength="40" value="${E(t.name)}"></div><div class="field"><label>Cash (₹, optional)</label><input type="number" min="0" data-f="cash" value="${t.cash || 0}"></div></div>
      <div class="field"><label>Tagline</label><input data-f="tagline" maxlength="80" value="${E(t.tagline)}"></div><div class="field"><label>Rewards, one per line</label><textarea data-f="items">${E(t.items.join('\n'))}</textarea></div>
      <label class="chk"><input type="checkbox" data-f="needsShipping" ${t.needsShipping ? 'checked' : ''}> Ask for delivery address</label><label class="chk"><input type="checkbox" data-f="needsSize" ${t.needsSize ? 'checked' : ''}> Ask for T-shirt size</label><button class="btn btn-danger btn-sm" data-act="deltier" data-i="${i}">Remove tier</button></div>`).join('');
  }
  function readTiers() {
    return [...document.querySelectorAll('.tier-ed')].map((el, i) => { const f = k => el.querySelector(`[data-f="${k}"]`);
      return { id: (TIERS[i] && TIERS[i].id) || ('tier' + (i + 1) + '-' + Math.random().toString(36).slice(2, 6)), threshold: f('threshold').value, name: f('name').value, tagline: f('tagline').value, cash: f('cash').value, items: f('items').value.split('\n'), needsShipping: f('needsShipping').checked, needsSize: f('needsSize').checked }; });
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return; const id = b.dataset.id;
    try {
      switch (b.dataset.act) {
        case 'setref': await call('/referrals/' + id, 'PATCH', { status: b.dataset.s }); T.toast('Updated'); break;
        case 'delref': if (!confirm('Delete this referral? This cannot be undone.')) return; await call('/referrals/' + id, 'DELETE'); T.toast('Deleted'); break;
        case 'addref': await call('/referrals', 'POST', { refCode: $('rc').value, studentName: $('rn').value, studentEmail: $('re').value }); ['rc', 'rn', 're'].forEach(x => $(x).value = ''); T.toast('Referral added'); break;
        case 'addpay': await call('/payouts', 'POST', { ambassadorId: $('pa').value, amount: $('pm').value, note: $('pn').value }); $('pm').value = ''; $('pn').value = ''; T.toast('Payout saved'); break;
        case 'saveclaim': await call('/claims/' + id, 'PATCH', { status: document.querySelector(`[data-cs="${id}"]`).value, note: document.querySelector(`[data-cn="${id}"]`).value }); T.toast('Claim updated'); break;
        case 'addgal': await call('/gallery', 'POST', { title: $('gt').value, category: $('gcat').value, imageUrl: $('gu').value, caption: $('gcap').value, featured: $('gf').checked }); ['gt', 'gu', 'gcap'].forEach(x => $(x).value = ''); $('gf').checked = false; T.toast('Added to gallery'); break;
        case 'featgal': { const g = GAL.find(x => x.id === id); await call('/gallery/' + id, 'PATCH', { featured: !g.featured }); T.toast('Updated'); break; }
        case 'delgal': if (!confirm('Remove this photo from the gallery?')) return; await call('/gallery/' + id, 'DELETE'); T.toast('Removed'); break;
        case 'addtier': TIERS = readTiers().map((t, i) => ({ ...(TIERS[i] || {}), ...t, items: t.items })); TIERS.push({ id: 'tier-' + Math.random().toString(36).slice(2, 6), threshold: 60, name: 'New tier', tagline: '', items: ['Reward'], cash: 0, needsShipping: false, needsSize: false }); drawTiers(); return;
        case 'deltier': if (document.querySelectorAll('.tier-ed').length < 2) { T.toast('Keep at least one tier.', true); return; } TIERS = readTiers(); TIERS.splice(+b.dataset.i, 1); drawTiers(); return;
        case 'savesettings': await call('/settings', 'PATCH', { commissionPerReferral: $('sc').value, tiers: readTiers() }); T.toast('Settings saved'); break;
        case 'csv': csv(); return;
      }
      load();
    } catch (err) { /* call() already showed the error */ }
  });

  function csv() {
    const q = c => '"' + String(c == null ? '' : c).replace(/"/g, '""').replace(/^([=+\-@])/, "'$1") + '"';   // neutralise spreadsheet formulas
    const rows = [['Name', 'Email', 'Phone', 'College', 'Code', 'Paid', 'Pending', 'Earned', 'PaidOut', 'Balance']].concat(AMB.map(x => [x.name, x.email, x.phone, x.college, x.refCode, x.paid, x.pending, x.commissionEarned, x.paidOut, x.balance]));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' })); a.download = 'ambassadors.csv'; a.click();
  }
  load();
})();
