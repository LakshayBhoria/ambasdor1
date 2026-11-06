(function () {
  const T = TKA, $ = id => document.getElementById(id);
  $('formlink').href = 'https://docs.google.com/forms/d/e/1FAIpQLScTRbUOw4FHh3KwtpyeXcAsyXCVqWudVkkVqPsYQIP2fzAdnA/viewform';
  function mode(m) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.m === m));
    $('login').style.display = m === 'login' ? '' : 'none'; $('signup').style.display = m === 'signup' ? '' : 'none'; $('err').classList.remove('show');
    $('ttl').textContent = m === 'login' ? 'Welcome back' : 'Apply to become an ambassador';
    $('sbt').textContent = m === 'login' ? 'Log in to see your referrals and rewards.' : 'Apply once, then log in here with the details we email you.';
  }
  document.querySelectorAll('.auth-tab').forEach(t => { t.onclick = () => mode(t.dataset.m); t.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') mode(t.dataset.m); }; });
  if (new URLSearchParams(location.search).get('mode') === 'signup') mode('signup');
  function dest(user) {
    const r = new URLSearchParams(location.search).get('redirect');
    if (r && /^[a-z-]+\.html(#[\w-]*)?$/i.test(r) && !(user.role !== 'admin' && r.startsWith('admin'))) return r;
    return user.role === 'admin' ? 'admin.html' : 'index.html';
  }
  function done(d) { T.setSession(d.user, d.token); location.href = dest(d.user); }
  $('login').onsubmit = async e => {
    e.preventDefault(); const b = $('lbtn'); b.disabled = true; b.textContent = 'Logging in…'; $('err').classList.remove('show');
    try { done(await T.api('/api/auth/login', { method: 'POST', body: { email: $('le').value, password: $('lp').value }, auth: false })); }
    catch (err) { $('err').textContent = err.message; $('err').classList.add('show'); b.disabled = false; b.textContent = 'Log in'; }
  };
  if (T.isLoggedIn() && T.getUser()) done({ user: T.getUser(), token: T.getToken() });
})();
