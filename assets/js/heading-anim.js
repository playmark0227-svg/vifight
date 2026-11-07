/* =============================================================
   ViFight — Services / Flow / FAQ 見出し画像のアニメーション（比較用）
   ?anim=S1,F1,Q1 のように付けて開いたときだけ動く。
   ============================================================= */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  if (!params.has('anim')) return;
  var pick = { S: 'S1', F: 'F1', Q: 'Q1' };
  (params.get('anim') || '').toUpperCase().split(',').forEach(function (k) { if (/^[SFQ][123]$/.test(k)) pick[k[0]] = k; });
  var root = document.documentElement;
  function apply() {
    root.className = root.className.replace(/\banim-[SFQ][123]\b/g, '').trim();
    ['S', 'F', 'Q'].forEach(function (g) { root.classList.add('anim-' + pick[g]); });
    var u = new URL(location.href); u.searchParams.set('anim', [pick.S, pick.F, pick.Q].join(',')); history.replaceState(null, '', u);
  }
  // F2 needs the photo's on-screen width and the band height
  var fh = document.querySelector('.flow .section-header');
  function measure() {
    if (!fh || !fh.offsetWidth) return;
    var cs = getComputedStyle(fh, '::before'), bh = parseFloat(cs.height) || 470;
    fh.style.setProperty('--bh', bh + 'px');
    fh.style.setProperty('--imgw', (bh * 958 / 468) + 'px');
  }
  window.addEventListener('resize', measure);
  window.addEventListener('hashchange', function () { setTimeout(measure, 150); });
  setInterval(measure, 1500);

  var NAMES = {
    S1: 'ゆっくりズーム', S2: '光の反射が流れる', S3: 'オーロラ色が巡る',
    F1: '光がステップ順に流れる', F2: 'ステップが順に光る', F3: 'ゆっくり横に流れる',
    Q1: 'ふわっと浮かぶ', Q2: 'ガラスがきらめく', Q3: '色が移ろう'
  };
  var TAB = { S: '#services', F: '#flow', Q: '#faq' }, LABEL = { S: 'Services', F: 'Flow', Q: 'FAQ' };
  var bar = document.createElement('div'); bar.className = 'hpa-panel';
  ['S', 'F', 'Q'].forEach(function (g) {
    var grp = document.createElement('div'); grp.className = 'grp';
    var b0 = document.createElement('b'); b0.textContent = LABEL[g]; grp.appendChild(b0);
    [1, 2, 3].forEach(function (n) {
      var k = g + n, b = document.createElement('button');
      b.type = 'button'; b.textContent = n + ' ' + NAMES[k]; b.dataset.k = k;
      b.addEventListener('click', function () {
        pick[g] = k; apply(); paint();
        if (location.hash !== TAB[g]) { var a = document.querySelector('a[href="' + TAB[g] + '"]'); if (a) a.click(); }
      });
      grp.appendChild(b);
    });
    bar.appendChild(grp);
  });
  function paint() { bar.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', pick[b.dataset.k[0]] === b.dataset.k); }); }
  document.body.appendChild(bar);
  apply(); paint(); measure();
})();
