(function(){
  const form = document.getElementById('forgot-form');
  const err = document.getElementById('alert-err');
  const ok = document.getElementById('alert-ok');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.classList.remove('show'); ok.classList.remove('show');
    const btn = document.getElementById('fp-submit');
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const email = document.getElementById('fp-email').value.trim();
      const data = await TKA.api('/api/auth/forgot-password', { method: 'POST', body: { email }, auth: false });
      if (data.devResetUrl) {
        // Email sending is off in this local setup, so the link is handed
        // back directly instead of just disappearing into an inbox.
        ok.innerHTML = `Email sending isn't configured locally, so here's your reset link directly:<br><a href="${TKA.escapeHtml(data.devResetUrl)}" style="color:var(--green);word-break:break-all;">${TKA.escapeHtml(data.devResetUrl)}</a>`;
      } else {
        ok.innerHTML = `${TKA.escapeHtml(data.message)}<br><br><b>Don't see it?</b> Check your spam or junk folder — password reset emails sometimes land there.`;
      }
      ok.classList.add('show');
      form.reset();
    } catch (ex) {
      err.textContent = ex.message; err.classList.add('show');
    } finally {
      btn.disabled = false; btn.textContent = 'Send reset link';
    }
  });

})();
