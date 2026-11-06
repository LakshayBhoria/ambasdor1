(function(){
  const params = new URLSearchParams(location.search);
  const email = params.get('email');
  const token = params.get('token');
  const form = document.getElementById('reset-form');
  const err = document.getElementById('alert-err');
  const ok = document.getElementById('alert-ok');

  if (!email || !token) {
    document.getElementById('sub').textContent = 'This reset link is missing information.';
    form.style.display = 'none';
    err.textContent = "This link looks incomplete — request a new one from the forgot-password page.";
    err.classList.add('show');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.classList.remove('show'); ok.classList.remove('show');
    const p1 = document.getElementById('rp-password').value;
    const p2 = document.getElementById('rp-password-2').value;
    if (p1 !== p2) { err.textContent = "Passwords don't match."; err.classList.add('show'); return; }
    const btn = document.getElementById('rp-submit');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await TKA.api('/api/auth/reset-password', { method: 'POST', body: { email, token, newPassword: p1 }, auth: false });
      ok.textContent = 'Password updated — redirecting to log in…';
      ok.classList.add('show');
      form.style.display = 'none';
      setTimeout(() => location.href = 'login.html', 1600);
    } catch (ex) {
      err.textContent = ex.message; err.classList.add('show');
      btn.disabled = false; btn.textContent = 'Set new password';
    }
  });

})();
