/* =============================================================
   ViFight — Works 背景のスクロール演出
   カードの間を縫って下りていく光の線が、スクロールに合わせて伸びる。
   いちばん下まで来ると線は札幌に届き、点で描いた北海道が
   西から東へ灯って現れる。
   ============================================================= */
(function () {
  'use strict';
  var sec = document.getElementById('works');
  if (!sec) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  sec.classList.add('has-wbg');
  var wrap = document.createElement('div');
  wrap.className = 'works-bg';
  wrap.setAttribute('aria-hidden', 'true');
  var cv = document.createElement('canvas');
  wrap.appendChild(cv);
  sec.insertBefore(wrap, sec.firstChild);
  var ctx = cv.getContext('2d');

  var COLS = [[16, 196, 147], [31, 169, 232], [79, 107, 255], [154, 77, 255], [240, 80, 159]];
  function col(t, a) {
    t = Math.max(0, Math.min(0.999, t)) * (COLS.length - 1);
    var i = Math.floor(t), f = t - i, c0 = COLS[i], c1 = COLS[i + 1];
    return 'rgba(' + (c0[0] + (c1[0] - c0[0]) * f | 0) + ',' + (c0[1] + (c1[1] - c0[1]) * f | 0) + ',' + (c0[2] + (c1[2] - c0[2]) * f | 0) + ',' + a + ')';
  }

  var W = 0, H = 0, dpr = 1, secTop = 0, secH = 0;
  var line = [], hkDots = [], map = null; // map: { x, y, s } in section coordinates
  var SAPPORO = [321, 504];

  function buildDots() {
    hkDots = [];
    var path = window.ViFightMap && window.ViFightMap.path;
    if (!path) return;
    var off = document.createElement('canvas'); off.width = 1000; off.height = 860;
    var o = off.getContext('2d'), p2 = new Path2D(path);
    for (var y = 0; y < 860; y += 14) for (var x = 0; x < 1000; x += 14)
      if (o.isPointInPath(p2, x, y)) hkDots.push({ x: x, y: y, t: x / 1000 * 0.8 + y / 860 * 0.2, ph: Math.random() * 6.28 });
  }

  function build() {
    // Hokkaido sits in the last screenful of the section
    // on wide screens it sits in the empty right side, clear of the "View All" button
    var wide = W >= 900;
    var mw = Math.min(W * (wide ? 0.48 : 0.92), H * 0.82 * 1000 / 860), s = mw / 1000;
    map = { x: wide ? W - mw - W * 0.01 : (W - mw) / 2, y: secH - H * (wide ? 0.6 : 0.52) - 860 * s / 2, s: s };
    var sx = map.x + SAPPORO[0] * s, sy = map.y + SAPPORO[1] * s;
    // the light line zig-zags down between the cards, then curves into Sapporo
    line = [];
    var yEnd = Math.max(H, sy - H * 0.35), turns = Math.max(3, Math.round(yEnd / 900)), n = turns * 40, i, u;
    for (i = 0; i <= n; i++) {
      u = i / n;
      line.push([W * (0.5 + 0.44 * Math.sin(u * turns * Math.PI)), u * yEnd]);
    }
    var a = line[line.length - 1], c1 = [a[0], a[1] + (sy - a[1]) * 0.6], c2 = [sx, sy - (sy - a[1]) * 0.5];
    for (i = 1; i <= 30; i++) {
      u = i / 30;
      var v = 1 - u;
      line.push([v * v * v * a[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * sx,
                 v * v * v * a[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * sy]);
    }
  }

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = sec.offsetWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    secTop = sec.getBoundingClientRect().top + window.scrollY; secH = sec.offsetHeight;
    if (!hkDots.length) buildDots();
    build();
  }

  function draw(t) {
    var raw = window.scrollY - secTop;
    var o = Math.max(0, Math.min(secH - H, raw));                // canvas offset inside the section
    var p = Math.max(0, Math.min(1, raw / Math.max(1, secH - H))); // 0 at the top, 1 at the bottom
    cv.style.transform = 'translateY(' + o + 'px)';

    // ----- Hokkaido: appears over the last stretch, lighting west → east -----
    var rv = Math.max(0, Math.min(1, (p - 0.8) / 0.18));
    if (rv > 0 && map) {
      if (!hkDots.length) buildDots();
      var lit = rv * 1.25;
      for (var i = 0; i < hkDots.length; i++) {
        var d = hkDots[i], on = Math.max(0, Math.min(1, (lit - d.t) * 6));
        var y = map.y + d.y * map.s - o;
        if (y < -10 || y > H + 10) continue;
        var a = (0.1 + on * (0.5 + 0.12 * Math.sin(t * 1.5 + d.ph))) * Math.min(1, rv * 2);
        ctx.beginPath();
        ctx.arc(map.x + d.x * map.s, y, (1.6 + on * 1.6) * Math.max(0.8, map.s * 1.5), 0, 6.283);
        ctx.fillStyle = on > 0 ? col(d.t, a) : 'rgba(79,107,255,' + a + ')';
        ctx.fill();
      }
    }

    // ----- the light line -----
    var headY = o + H * 0.62 + (raw < 0 ? raw : 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var j = 0; j < line.length; j++) { var q = line[j]; j ? ctx.lineTo(q[0], q[1] - o) : ctx.moveTo(q[0], q[1] - o); }
    ctx.strokeStyle = 'rgba(79,107,255,0.12)'; ctx.lineWidth = 2; ctx.stroke();
    var last = null, endY = line.length ? line[line.length - 1][1] : 1;
    for (var k = 1; k < line.length; k++) {
      var A = line[k - 1], B = line[k];
      if (A[1] > headY) break;
      if (B[1] - o < -20 && A[1] - o < -20) { last = B; continue; }
      ctx.beginPath(); ctx.moveTo(A[0], A[1] - o); ctx.lineTo(B[0], B[1] - o);
      ctx.strokeStyle = col(B[1] / endY, 0.85); ctx.lineWidth = 4; ctx.stroke();
      last = B;
    }
    if (last) {
      var hx = last[0], hy = last[1] - o, R = 60;
      var g = ctx.createRadialGradient(hx, hy, 0, hx, hy, R);
      g.addColorStop(0, col(last[1] / endY, 0.75)); g.addColorStop(1, col(last[1] / endY, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, R, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy, 5 + Math.sin(t * 4), 0, 6.283); ctx.fill();
    }
  }

  var running = false, visible = false, tick = 0;
  function frame(now) {
    if (!running) return;
    // the section grows as cards reveal / images load: re-measure now and then
    if (++tick % 60 === 0) {
      var h = sec.offsetHeight;
      secTop = sec.getBoundingClientRect().top + window.scrollY;
      if (Math.abs(h - secH) > 4) { secH = h; build(); }
    }
    ctx.clearRect(0, 0, W, H);
    draw(reduce ? 0 : now / 1000);
    requestAnimationFrame(frame);
  }
  function start() { if (running || !visible) return; running = true; requestAnimationFrame(frame); }
  new IntersectionObserver(function (e) {
    visible = e[0].isIntersecting;
    if (visible) { layout(); start(); } else running = false;
  }).observe(sec);
  window.addEventListener('resize', function () { if (visible) layout(); });
})();
