/* =============================================================
   ViFight — Works 背景のスクロール演出（比較用プレビュー）
   ?wbg=N〜R を付けて開いたときだけ動く。
   N 北海道が灯っていく / O オーロラの色が移ろう / P 光の線が伸びる
   Q ガラスの図形が浮かぶ / R 等高線が流れる
   ============================================================= */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var mode = (params.get('wbg') || '').toUpperCase();
  var MODES = ['N', 'O', 'P', 'Q', 'R'];
  if (MODES.indexOf(mode) < 0) return;

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
    t = ((t % 1) + 1) % 1 * (COLS.length - 1);
    var i = Math.floor(t), f = t - i, c0 = COLS[i], c1 = COLS[Math.min(i + 1, COLS.length - 1)];
    return 'rgba(' + (c0[0] + (c1[0] - c0[0]) * f | 0) + ',' + (c0[1] + (c1[1] - c0[1]) * f | 0) + ',' + (c0[2] + (c1[2] - c0[2]) * f | 0) + ',' + a + ')';
  }

  var W = 0, H = 0, dpr = 1, secTop = 0, secH = 0;
  var hkDots = [], shapes = [], line = [];
  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = sec.offsetWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var r = sec.getBoundingClientRect();
    secTop = r.top + window.scrollY; secH = sec.offsetHeight;
    buildN(); buildQ(); buildP();
  }
  // progress through the section: 0 when its top reaches the viewport, 1 at its end
  function prog() { return Math.max(0, Math.min(1, (window.scrollY - secTop) / Math.max(1, secH - H))); }
  function offs() { return window.scrollY - secTop; }

  // ---------- N: 北海道が灯っていく ----------
  function buildN() {
    hkDots = [];
    var path = window.ViFightMap && window.ViFightMap.path;
    if (!path) return;
    var off = document.createElement('canvas'); off.width = 1000; off.height = 860;
    var o = off.getContext('2d'), p2 = new Path2D(path);
    for (var y = 0; y < 860; y += 14) for (var x = 0; x < 1000; x += 14)
      if (o.isPointInPath(p2, x, y)) hkDots.push({ x: x, y: y, t: x / 1000 * 0.8 + y / 860 * 0.2, ph: Math.random() * 6.28 });
  }
  function drawN(p, t) {
    if (!hkDots.length) buildN();
    var sc = Math.min(W * 0.9 / 1000, H * 0.95 / 860), ox = W - 1000 * sc * 0.92, oy = (H - 860 * sc) / 2;
    var lit = p * 1.15;
    for (var i = 0; i < hkDots.length; i++) {
      var d = hkDots[i], on = Math.max(0, Math.min(1, (lit - d.t) * 6));
      var a = 0.08 + on * (0.42 + 0.12 * Math.sin(t * 1.5 + d.ph));
      ctx.beginPath(); ctx.arc(ox + d.x * sc, oy + d.y * sc, (1.6 + on * 1.4) * Math.max(0.7, sc * 1.4), 0, 6.283);
      ctx.fillStyle = on > 0 ? col(d.t, a) : 'rgba(79,107,255,' + a + ')'; ctx.fill();
    }
  }

  // ---------- O: オーロラの色が移ろう ----------
  function drawO(p, t) {
    var blobs = [[0.15, 0.25, 0.0], [0.8, 0.2, 0.3], [0.55, 0.75, 0.6], [0.1, 0.85, 0.85]];
    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i];
      var x = W * (b[0] + 0.12 * Math.sin(p * 6 + i * 1.7 + t * 0.15));
      var y = H * (b[1] + 0.1 * Math.cos(p * 5 + i * 2.1 + t * 0.12));
      var r = Math.max(W, H) * (0.32 + 0.06 * Math.sin(p * 4 + i));
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col(b[2] + p * 1.2, 0.2)); g.addColorStop(1, col(b[2] + p * 1.2, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------- P: 光の線が伸びる ----------
  function buildP() {
    line = [];
    var turns = Math.max(4, Math.round(secH / 900));
    for (var i = 0; i <= turns * 40; i++) {
      var u = i / (turns * 40);
      line.push([W * (0.5 + 0.44 * Math.sin(u * turns * Math.PI)), u * secH]);
    }
  }
  function drawP(p, t) {
    var o = offs(), headY = o + H * 0.62;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // faint full guide
    ctx.beginPath();
    for (var i = 0; i < line.length; i++) { var q = line[i]; i ? ctx.lineTo(q[0], q[1] - o) : ctx.moveTo(q[0], q[1] - o); }
    ctx.strokeStyle = 'rgba(79,107,255,0.06)'; ctx.lineWidth = 2; ctx.stroke();
    // lit part up to the head
    var last = null;
    for (var j = 1; j < line.length; j++) {
      var a = line[j - 1], b = line[j];
      if (a[1] > headY) break;
      ctx.beginPath(); ctx.moveTo(a[0], a[1] - o); ctx.lineTo(b[0], b[1] - o);
      ctx.strokeStyle = col(b[1] / secH, 0.55); ctx.lineWidth = 3; ctx.stroke();
      last = b;
    }
    if (last) {
      var g = ctx.createRadialGradient(last[0], last[1] - o, 0, last[0], last[1] - o, 40);
      g.addColorStop(0, col(last[1] / secH, 0.6)); g.addColorStop(1, col(last[1] / secH, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(last[0], last[1] - o, 40, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(last[0], last[1] - o, 4 + Math.sin(t * 4), 0, 6.283); ctx.fill();
    }
  }

  // ---------- Q: ガラスの図形が浮かぶ ----------
  function buildQ() {
    shapes = [];
    var n = W < 700 ? 16 : 30, kinds = ['circle', 'diamond', 'tri', 'ring'];
    for (var i = 0; i < n; i++) shapes.push({ x: Math.random(), y: Math.random() * (secH + H), z: 0.25 + Math.random() * 0.9, s: 30 + Math.random() * 80, k: kinds[i % 4], c: Math.random(), r: Math.random() * 6.28 });
  }
  function drawQ(p, t) {
    var o = offs();
    for (var i = 0; i < shapes.length; i++) {
      var s = shapes[i];
      var y = ((s.y - o * s.z) % (secH + H) + (secH + H)) % (secH + H) - s.s * 2;
      if (y < -s.s * 2 || y > H + s.s * 2) continue;
      var x = s.x * W, rot = s.r + o * 0.0015 * (s.z + 0.3) + t * 0.05;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      var g = ctx.createLinearGradient(-s.s, -s.s, s.s, s.s);
      g.addColorStop(0, col(s.c, 0.3)); g.addColorStop(1, col(s.c + 0.35, 0.12));
      ctx.fillStyle = g; ctx.strokeStyle = col(s.c + 0.2, 0.5); ctx.lineWidth = 1.4;
      ctx.beginPath();
      if (s.k === 'circle') ctx.arc(0, 0, s.s * 0.6, 0, 6.283);
      else if (s.k === 'ring') { ctx.arc(0, 0, s.s * 0.6, 0, 6.283); ctx.moveTo(s.s * 0.35, 0); ctx.arc(0, 0, s.s * 0.35, 0, 6.283, true); }
      else if (s.k === 'diamond') { ctx.moveTo(0, -s.s * 0.7); ctx.lineTo(s.s * 0.5, 0); ctx.lineTo(0, s.s * 0.7); ctx.lineTo(-s.s * 0.5, 0); ctx.closePath(); }
      else { ctx.moveTo(0, -s.s * 0.6); ctx.lineTo(s.s * 0.55, s.s * 0.4); ctx.lineTo(-s.s * 0.55, s.s * 0.4); ctx.closePath(); }
      ctx.fill('evenodd'); ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- R: 等高線が流れる ----------
  function drawR(p, t) {
    var o = offs(), n = 16, gap = H / (n - 4);
    for (var i = 0; i < n; i++) {
      var base = ((i * gap - o * 0.35) % (n * gap) + n * gap) % (n * gap) - gap * 2;
      ctx.beginPath();
      for (var x = -20; x <= W + 20; x += 16) {
        var u = x / W;
        var y = base + Math.sin(u * 5 + i * 0.7 + o * 0.002) * 26 + Math.sin(u * 11 + i * 1.3 - t * 0.2) * 9;
        x > -20 ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = col(i / n + p * 0.6, 0.26); ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  var DRAW = { N: drawN, O: drawO, P: drawP, Q: drawQ, R: drawR };
  var running = false, visible = false, tick = 0;
  function frame(now) {
    if (!running) return;
    if (++tick % 60 === 0) { var r = sec.getBoundingClientRect(), h = sec.offsetHeight; secTop = r.top + window.scrollY; if (Math.abs(h - secH) > 4) { secH = h; buildP(); } }
    // keep the viewport-sized canvas in view while the section scrolls (sticky is clipped by overflow)
    cv.style.transform = 'translateY(' + Math.max(0, Math.min(secH - H, offs())) + 'px)';
    ctx.clearRect(0, 0, W, H);
    DRAW[mode](prog(), reduce ? 0 : now / 1000);
    requestAnimationFrame(frame);
  }
  function start() { if (running || !visible) return; running = true; requestAnimationFrame(frame); }
  new IntersectionObserver(function (e) {
    visible = e[0].isIntersecting;
    if (visible) { layout(); start(); } else running = false;
  }).observe(sec);
  window.addEventListener('resize', function () { if (visible) layout(); });

  // ---------- preview switcher ----------
  var NAMES = { N: '北海道が灯る', O: 'オーロラが移ろう', P: '光の線が伸びる', Q: 'ガラスの図形', R: '等高線が流れる' };
  var bar = document.createElement('div');
  bar.className = 'wbg-panel';
  MODES.forEach(function (m) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = m + ' ' + NAMES[m]; b.className = m === mode ? 'on' : '';
    b.addEventListener('click', function () {
      mode = m;
      bar.querySelectorAll('button').forEach(function (x) { x.className = x === b ? 'on' : ''; });
      var u = new URL(location.href); u.searchParams.set('wbg', m); history.replaceState(null, '', u);
    });
    bar.appendChild(b);
  });
  document.body.appendChild(bar);
})();
