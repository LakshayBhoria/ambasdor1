(function () {
  const T = TKA, S = T.site, $ = id => document.getElementById(id);
  S.nav('gallery'); S.footer();
  let all = [], cats = [], cur = new URLSearchParams(location.search).get('c') || 'All';
  function render() {
    const items = cur === 'All' ? all : all.filter(i => i.category === cur);
    $('filters').innerHTML = ['All', ...cats].map(c => `<button class="pill ${c === cur ? 'active' : ''}" role="tab" aria-selected="${c === cur}" data-c="${c}">${c}</button>`).join('');
    $('filters').querySelectorAll('.pill').forEach(b => b.onclick = () => { cur = b.dataset.c; history.replaceState(null, '', cur === 'All' ? 'gallery.html' : 'gallery.html?c=' + encodeURIComponent(cur)); render(); });
    $('gal').innerHTML = items.length ? items.map((it, n) => S.galItem(it, n)).join('') : '<div class="empty">Nothing in this category yet.</div>';
    S.bindGallery($('gal'), items);
  }
  T.api('/api/gallery', { auth: false }).then(d => { all = d.items; cats = d.categories; render(); })
    .catch(e => { $('gal').innerHTML = `<div class="empty">${T.escapeHtml(e.message)}</div>`; });
})();
