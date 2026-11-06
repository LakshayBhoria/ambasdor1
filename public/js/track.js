(function () {
  const $ = (id) => document.getElementById(id);
  const E = (v) => TKA.escapeHtml(String(v == null ? '' : v));
  const R = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const D = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
  const form = $('track-form'), err = $('alert-err'), out = $('result');

  function render(d) {
    const s = d.stats, n = d.nextTier;
    const pct = Math.min(100, Math.round((s.paid / s.target) * 100));
    out.innerHTML =
      `<h3 style="margin-bottom:4px">Hi ${E(d.ambassador.name)}</h3>` +
      `<p class="mut" style="margin-bottom:14px">${E(d.ambassador.college)} · Code <b>${E(d.ambassador.refCode)}</b></p>` +
      `<div class="stats">` +
      `<div class="stat key"><div class="num">${s.paid}</div><div class="lbl">Paid referrals</div></div>` +
      `<div class="stat"><div class="num">${s.pending}</div><div class="lbl">Waiting for payment</div></div>` +
      `<div class="stat"><div class="num">${R(s.commissionEarned)}</div><div class="lbl">Commission earned</div></div>` +
      `<div class="stat"><div class="num">${R(s.balance)}</div><div class="lbl">Balance to be paid</div></div></div>` +
      `<p style="margin:16px 0 6px"><b>Progress to ${s.target} referrals (internship)</b>: ${s.paid}/${s.target}</p>` +
      `<div style="background:#e8ecf3;border-radius:8px;height:12px;overflow:hidden"><div style="width:${pct}%;height:100%;background:#0b3d91"></div></div>` +
      (n ? `<p class="mut" style="margin-top:8px">${n.remaining} more paid referral${n.remaining === 1 ? '' : 's'} to unlock ${E(n.name)} (${n.threshold}).</p>` : `<p style="margin-top:8px"><b>All reward tiers unlocked.</b></p>`) +
      `<p style="margin-top:16px"><b>Rewards</b>: ` + d.tiers.map(t => `${t.unlocked ? '✅' : '🔒'} ${E(t.name)} (${t.threshold})`).join(' · ') + `</p>` +
      `<p class="mut">Share link: <b>${E(d.ambassador.shareLink)}</b> · Link clicks: ${s.clicks}</p>` +
      `<h4 style="margin:18px 0 8px">My referrals</h4><div class="table-wrap"><table><thead><tr><th>Student</th><th>Date</th><th>Status</th><th>Commission</th></tr></thead><tbody>` +
      (d.referrals.length ? d.referrals.map(r => `<tr><td>${E(r.student)}</td><td>${D(r.date)}</td><td><span class="tag ${r.status === 'paid' ? 'tag-green' : 'tag-amber'}">${r.status === 'paid' ? 'Paid' : 'Pending'}</span></td><td>${r.status === 'paid' ? R(r.commission) : '-'}</td></tr>`).join('') : '<tr><td colspan="4" class="mut">No referrals yet. Share your code!</td></tr>') +
      `</tbody></table></div>` +
      (d.payouts.length ? `<h4 style="margin:18px 0 8px">Payouts received</h4><div class="table-wrap"><table><thead><tr><th>Date</th><th>Amount</th><th>Note</th></tr></thead><tbody>${d.payouts.map(p => `<tr><td>${D(p.date)}</td><td>${R(p.amount)}</td><td>${E(p.note || '')}</td></tr>`).join('')}</tbody></table></div>` : '');
    out.style.display = 'block';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.classList.remove('show'); out.style.display = 'none';
    const btn = $('tk-submit'); btn.disabled = true; btn.textContent = 'Checking…';
    try {
      const code = $('tk-code').value.trim().toUpperCase(), email = $('tk-email').value.trim();
      render(await TKA.api('/api/ambassador/track', { method: 'POST', body: { code, email }, auth: false }));
    } catch (ex) { err.textContent = ex.message; err.classList.add('show'); }
    finally { btn.disabled = false; btn.textContent = 'Show my referrals'; }
  });
})();
