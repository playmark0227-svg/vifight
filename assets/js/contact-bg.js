/* =============================================================
   ViFight — Contact 背景の視線誘導「入力に合わせて光る」
   何も入力していないときは送信ボタンの周りに波紋が広がり、
   入力欄を選ぶとその欄の後ろへ光がなめらかに移る。
   ============================================================= */
(function () {
  'use strict';
  var sec = document.getElementById('contact');
  var form = sec && sec.querySelector('.contact-form');
  var btn = sec && sec.querySelector('.form-submit');
  if (!sec || !form) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  sec.classList.add('has-cbg');
  var cv = document.createElement('canvas');
  cv.className = 'contact-bg';
  cv.setAttribute('aria-hidden', 'true');
  sec.insertBefore(cv, sec.firstChild);
  var ctx = cv.getContext('2d');

  var W = 0, H = 0, dpr = 1, F = null, B = null, focusY = null, glowY = null;
  var COLS = [[16, 196, 147], [31, 169, 232], [79, 107, 255], [154, 77, 255], [240, 80, 159]];
  function col(t, a) {
    t = Math.max(0, Math.min(0.999, t)) * (COLS.length - 1);
    var i = Math.floor(t), f = t - i, c0 = COLS[i], c1 = COLS[i + 1];
    return 'rgba(' + (c0[0] + (c1[0] - c0[0]) * f | 0) + ',' + (c0[1] + (c1[1] - c0[1]) * f | 0) + ',' + (c0[2] + (c1[2] - c0[2]) * f | 0) + ',' + a + ')';
  }
  function rel(el) {
    var s = sec.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height, cx: r.left - s.left + r.width / 2, cy: r.top - s.top + r.height / 2 };
  }
  function measure() {
    F = rel(form);
    B = btn ? rel(btn) : { cx: F.cx, cy: F.y + F.h, w: 120, h: 50 };
  }
  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = sec.offsetWidth; H = sec.offsetHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    measure();
  }

  function draw(t) {
    var target = focusY != null ? focusY : B.cy;
    glowY = glowY == null ? target : glowY + (target - glowY) * 0.08;
    var x = F.cx, y = glowY;
    var g = ctx.createRadialGradient(x, y, 0, x, y, F.w * 0.75);
    g.addColorStop(0, col(0.5 + 0.15 * Math.sin(t * 0.7), 0.22));
    g.addColorStop(0.5, col(0.75, 0.08));
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (focusY == null) {
      var p = (t * 0.5) % 1;
      ctx.beginPath();
      ctx.ellipse(B.cx, B.cy, B.w * (0.55 + p * 0.6), B.h * (0.6 + p * 1.2), 0, 0, 6.283);
      ctx.strokeStyle = col(0.6, 0.45 * (1 - p));
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  form.addEventListener('focusin', function (e) {
    var el = e.target.closest('.form-group') || e.target;
    focusY = rel(el).cy;
  });
  form.addEventListener('focusout', function () {
    setTimeout(function () { if (!form.contains(document.activeElement)) focusY = null; }, 50);
  });

  var running = false, visible = false, tick = 0;
  function frame(now) {
    if (!running) return;
    // re-measure now and then: the form slides in (data-reveal) after the first layout
    if (++tick % 45 === 0) measure();
    ctx.clearRect(0, 0, W, H);
    draw(reduce ? 0 : now / 1000);
    if (reduce) { running = false; return; }
    requestAnimationFrame(frame);
  }
  function start() { if (running || !visible) return; running = true; requestAnimationFrame(frame); }
  function relayout() { layout(); if (!running) { running = true; frame(performance.now()); } }

  new IntersectionObserver(function (e) {
    visible = e[0].isIntersecting;
    if (visible) { relayout(); start(); } else running = false;
  }).observe(sec);
  window.addEventListener('resize', function () { if (visible) relayout(); });
})();
