/* =============================================================
   ViFight — Contact 背景の視線誘導（比較用プレビュー）
   ?cbg=I〜M を付けて開いたときだけ動く。どれも最後はフォームに
   視線が集まるように、光や模様がフォームへ向かって流れる。
   ============================================================= */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var mode = (params.get('cbg') || '').toUpperCase();
  var MODES = ['I', 'J', 'K', 'L', 'M'];
  if (MODES.indexOf(mode) < 0) return;

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

  var W = 0, H = 0, dpr = 1, F = null, B = null, dots = [], focusY = null, focusT = 0, V = false;
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
  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = sec.offsetWidth; H = sec.offsetHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    F = rel(form); V = F.x < W * 0.2; B = btn ? rel(btn) : { cx: F.cx, cy: F.y + F.h, x: F.x, y: F.y + F.h, w: 0, h: 0 };
    dots = [];
    var g = W < 700 ? 22 : 28;
    for (var y = g / 2; y < H; y += g) for (var x = g / 2; x < W; x += g) dots.push([x, y]);
  }

  // ---------- I: 光の導線 — curves from the edges converge on the form ----------
  var curves = [];
  function buildCurves() {
    curves = [];
    var n = W < 700 ? 5 : 8;
    for (var i = 0; i < n; i++) {
      if (V) {
        var sx = W * (0.04 + 0.92 * i / (n - 1)), tx = F.x + F.w * (0.1 + 0.8 * i / (n - 1));
        curves.push({ p0: [sx, -20], p1: [sx, F.y * 0.35], p2: [tx, F.y - F.y * 0.25], p3: [tx, F.y - 6], off: Math.random(), sp: 0.1 + Math.random() * 0.06, t: i / (n - 1) });
        continue;
      }
      var sy = H * (0.08 + 0.84 * i / (n - 1));
      var ty = F.y + F.h * (0.15 + 0.7 * i / (n - 1));
      curves.push({ p0: [-20, sy], p1: [W * 0.3, sy], p2: [F.x - W * 0.12, ty], p3: [F.x - 6, ty], off: Math.random(), sp: 0.12 + Math.random() * 0.08, t: i / (n - 1) });
    }
  }
  function bez(c, t) {
    var u = 1 - t;
    return [u * u * u * c.p0[0] + 3 * u * u * t * c.p1[0] + 3 * u * t * t * c.p2[0] + t * t * t * c.p3[0],
            u * u * u * c.p0[1] + 3 * u * u * t * c.p1[1] + 3 * u * t * t * c.p2[1] + t * t * t * c.p3[1]];
  }
  function drawI(t) {
    for (var i = 0; i < curves.length; i++) {
      var c = curves[i];
      ctx.beginPath(); ctx.moveTo(c.p0[0], c.p0[1]);
      ctx.bezierCurveTo(c.p1[0], c.p1[1], c.p2[0], c.p2[1], c.p3[0], c.p3[1]);
      ctx.strokeStyle = col(c.t, 0.16); ctx.lineWidth = 1; ctx.stroke();
      var head = (c.off + t * c.sp) % 1;
      for (var k = 0; k < 18; k++) {
        var tt = head - k * 0.012; if (tt < 0) continue;
        var p = bez(c, tt);
        ctx.beginPath(); ctx.arc(p[0], p[1], 2.4 * (1 - k / 18) + 0.4, 0, 6.283);
        ctx.fillStyle = col(c.t, 0.85 * (1 - k / 18)); ctx.fill();
      }
    }
    if (V) glowAt(F.cx, F.y, F.w * 0.5, 0.10 + 0.04 * Math.sin(t * 2)); else glowAt(F.x, F.cy, F.h * 0.6, 0.10 + 0.04 * Math.sin(t * 2));
  }

  // ---------- J: ドットの波 — waves of light roll left → right into the form ----------
  function drawJ(t) {
    var span = F.x + 60, front = ((t * 0.22) % 1.2) * span - 30;
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      if (d[0] > F.x - 8 && d[0] < F.x + F.w + 8 && d[1] > F.y - 8 && d[1] < F.y + F.h + 8) continue;
      var near, wave;
      if (V) {
        var fy = ((t * 0.22) % 1.2) * (F.y + 60) - 30;
        near = Math.max(0, 1 - Math.abs(d[1] - F.y) / (H * 0.5));
        wave = d[1] < F.y ? Math.max(0, 1 - Math.abs(d[1] - fy) / 80) : 0;
      } else {
        near = Math.max(0, 1 - Math.hypot(d[0] - F.x, d[1] - F.cy) / (W * 0.55));
        wave = d[0] < F.x ? Math.max(0, 1 - Math.abs(d[0] - front) / 90) : 0;
      }
      var a = 0.14 + near * 0.18 + wave * 0.7;
      ctx.beginPath(); ctx.arc(d[0], d[1], 1.8 + wave * 1.8, 0, 6.283);
      ctx.fillStyle = col(d[0] / W, a); ctx.fill();
    }
  }

  // ---------- K: オーロラの帯 — a ribbon drifts down into the send button ----------
  function drawK(t) {
    var ex = B.cx, ey = B.cy;
    for (var r = 0; r < 3; r++) {
      ctx.beginPath();
      var steps = 60;
      for (var s = 0; s <= steps; s++) {
        var u = s / steps;
        var x = W + 60 + (ex - W - 60) * (u * u) + Math.sin(u * 4 + t * 0.6 + r) * 40 * (1 - u);
        var y = -40 + (ey + 40) * u;
        s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      var g = ctx.createLinearGradient(W, 0, ex, ey);
      g.addColorStop(0, 'rgba(16,196,147,0)'); g.addColorStop(0.3, col(0.1 + r * 0.2, 0.22)); g.addColorStop(0.75, col(0.5 + r * 0.15, 0.3)); g.addColorStop(1, col(0.95, 0.5));
      ctx.strokeStyle = g; ctx.lineWidth = 34 - r * 10; ctx.lineCap = 'round';
      ctx.filter = 'blur(' + (14 - r * 4) + 'px)'; ctx.stroke(); ctx.filter = 'none';
    }
    glowAt(ex, ey, 120 + 20 * Math.sin(t * 2.2), 0.22);
  }

  // ---------- L: 流れるシェブロン — faint › marks drift toward the form ----------
  function drawL(t) {
    var gap = W < 700 ? 46 : 64, rowH = W < 700 ? 54 : 70;
    var shift = (t * 26) % gap;
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (V) {
      for (var cx = gap / 2, c = 0; cx < W; cx += gap, c++) {
        for (var yy = -rowH + (t * 26) % rowH + (c % 2) * rowH / 2; yy < F.y - 16; yy += rowH) {
          var nv = Math.max(0, yy / Math.max(1, F.y)), av = 0.05 + 0.22 * nv * nv, sv = 7 + 4 * nv;
          ctx.beginPath(); ctx.moveTo(cx - sv, yy - sv * 0.6); ctx.lineTo(cx, yy + sv * 0.6); ctx.lineTo(cx + sv, yy - sv * 0.6);
          ctx.strokeStyle = col(nv, av); ctx.stroke();
        }
      }
      return;
    }
    for (var y = rowH / 2, row = 0; y < H; y += rowH, row++) {
      for (var x = -gap + shift + (row % 2) * gap / 2; x < F.x - 16; x += gap) {
        var near = x / Math.max(1, F.x);
        var a = 0.05 + 0.22 * near * near;
        var s = 7 + 4 * near;
        ctx.beginPath(); ctx.moveTo(x - s * 0.6, y - s); ctx.lineTo(x + s * 0.6, y); ctx.lineTo(x - s * 0.6, y + s);
        ctx.strokeStyle = col(near, a); ctx.stroke();
      }
    }
  }

  // ---------- M: フォーカス連動 — light sits behind the field being filled ----------
  function drawM(t) {
    var target = focusY != null ? focusY : B.cy, k = Math.min(1, (t - focusT) * 2.5);
    drawM.y = drawM.y == null ? target : drawM.y + (target - drawM.y) * 0.08;
    var x = F.cx, y = drawM.y;
    var g = ctx.createRadialGradient(x, y, 0, x, y, F.w * 0.75);
    g.addColorStop(0, col(0.35 + 0.3 * Math.sin(t * 0.7) * 0.5 + 0.15, 0.22));
    g.addColorStop(0.5, col(0.75, 0.08));
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (focusY == null) {
      var p = (t * 0.5) % 1;
      ctx.beginPath(); ctx.ellipse(B.cx, B.cy, B.w * (0.55 + p * 0.6), B.h * (0.6 + p * 1.2), 0, 0, 6.283);
      ctx.strokeStyle = col(0.6, 0.45 * (1 - p)); ctx.lineWidth = 2; ctx.stroke();
    }
    void k;
  }
  form.addEventListener('focusin', function (e) {
    var el = e.target.closest('.form-group') || e.target;
    focusY = rel(el).cy; focusT = performance.now() / 1000;
  });
  form.addEventListener('focusout', function () { setTimeout(function () { if (!form.contains(document.activeElement)) focusY = null; }, 50); });

  function glowAt(x, y, r, a) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col(0.55, a)); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
  }

  var DRAW = { I: drawI, J: drawJ, K: drawK, L: drawL, M: drawM };
  var running = false, visible = false;
  function frame(now) {
    if (!running) return;
    ctx.clearRect(0, 0, W, H);
    DRAW[mode](reduce ? 0 : now / 1000);
    if (reduce) { running = false; return; }
    requestAnimationFrame(frame);
  }
  function start() { if (running || !visible) return; running = true; requestAnimationFrame(frame); }
  function relayout() { layout(); buildCurves(); if (!running) { running = true; frame(performance.now()); } }

  new IntersectionObserver(function (e) { visible = e[0].isIntersecting; if (visible) { relayout(); start(); } else running = false; }).observe(sec);
  window.addEventListener('resize', function () { if (visible) relayout(); });
  // the contact view is a tab: re-measure whenever it becomes visible
  window.addEventListener('hashchange', function () { setTimeout(function () { if (sec.offsetWidth) { relayout(); start(); } }, 120); });

  // ---------- preview switcher ----------
  var NAMES = { I: '光の導線', J: 'ドットの波', K: 'オーロラの帯', L: '流れるシェブロン', M: '入力に合わせて光る' };
  var bar = document.createElement('div');
  bar.className = 'cbg-panel';
  MODES.forEach(function (m) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = m + ' ' + NAMES[m]; b.className = m === mode ? 'on' : '';
    b.addEventListener('click', function () {
      mode = m; drawM.y = null;
      bar.querySelectorAll('button').forEach(function (x) { x.className = x === b ? 'on' : ''; });
      var u = new URL(location.href); u.searchParams.set('cbg', m); history.replaceState(null, '', u);
      relayout(); start();
    });
    bar.appendChild(b);
  });
  document.body.appendChild(bar);
})();
