/* =============================================================
   ViFight — Flow 見出し画像「ステップが順に光る」の位置合わせ
   画像の表示幅（--imgw）と帯の高さ（--bh）を測って CSS に渡す。
   ============================================================= */
(function () {
  'use strict';
  var fh = document.querySelector('.flow .section-header');
  if (!fh) return;
  function measure() {
    if (!fh.offsetWidth) return;
    var bh = parseFloat(getComputedStyle(fh, '::before').height) || 470;
    fh.style.setProperty('--bh', bh + 'px');
    fh.style.setProperty('--imgw', (bh * 958 / 468) + 'px');
  }
  window.addEventListener('resize', measure);
  window.addEventListener('hashchange', function () { setTimeout(measure, 150); });
  setInterval(measure, 1500);
  measure();
})();
