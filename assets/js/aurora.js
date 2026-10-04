/* ============================================
   ViFight — WebGL aurora borealis
   Auto-mounts on <canvas data-aurora>. Public API: window.ViFightAurora
   ============================================ */
(function () {
  'use strict';

  var VERT = [
    'attribute vec2 a_pos;',
    'varying vec2 v_uv;',
    'void main() {',
    '  v_uv = a_pos * 0.5 + 0.5;',
    '  gl_Position = vec4(a_pos, 0.0, 1.0);',
    '}'
  ].join('\n');

  // 'precision highp float;' is prepended at build time; GPUs without fp32 fragment highp keep the CSS fallback.
  var FRAG = [
    'varying vec2 v_uv;',
    'uniform vec2 u_res;',
    'uniform float u_time;',
    'uniform float u_intensity;',
    'uniform vec2 u_fade;',
    'uniform float u_seed;',
    'uniform vec2 u_pointer;',

    // sine-free hashes: stable across GPUs, no large-argument sin() artifacts
    'float hash11(float p) {',
    '  p = fract(p * 0.1031);',
    '  p *= p + 33.33;',
    '  p *= p + p;',
    '  return fract(p);',
    '}',
    'float hash12(vec2 p) {',
    '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
    '  p3 += dot(p3, p3.yzx + 33.33);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    'float vnoise1(float x) {',
    '  float i = floor(x);',
    '  float f = fract(x);',
    '  return mix(hash11(i), hash11(i + 1.0), f * f * (3.0 - 2.0 * f));',
    '}',
    'float vnoise2(vec2 p) {',
    '  vec2 i = floor(p);',
    '  vec2 f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  float a = hash12(i);',
    '  float b = hash12(i + vec2(1.0, 0.0));',
    '  float c = hash12(i + vec2(0.0, 1.0));',
    '  float d = hash12(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);',
    '}',
    // each octave drifts at its own speed/direction so the folds evolve instead of just sliding
    'float fbm(float x, float t) {',
    '  float v = 0.0;',
    '  float a = 0.5;',
    '  for (int i = 0; i < 3; i++) {',
    '    v += a * vnoise1(x + t);',
    '    x = x * 2.07 + 13.7;',
    '    t *= -1.7;',
    '    a *= 0.5;',
    '  }',
    '  return v * 1.142857;',
    '}',
    'vec3 ramp(float h) {',
    '  vec3 c = mix(vec3(0.36, 0.92, 0.66), vec3(0.31, 0.84, 0.82), smoothstep(0.10, 0.45, h));',
    '  c = mix(c, vec3(0.60, 0.42, 1.00), smoothstep(0.40, 0.80, h));',
    '  return mix(c, vec3(0.75, 0.42, 0.85), smoothstep(0.75, 1.0, h));',
    '}',

    // shape: x = lower-edge y (from top), y = ray height, z = fold amplitude, w = fold frequency
    // look:  x = brightness, y = seed, z = pink fringe amount, w = tilt
    'vec3 curtain(vec2 p, float t, vec4 shape, vec4 look, float aa) {',
    '  float s = look.y;',
    '  float xs = p.x * shape.w + s;',
    '  float drift = t * 0.021;',
    '  float f0 = fbm(xs, drift);',
    '  float f1 = fbm(xs + 0.05, drift);',
    '  float slope = abs(f1 - f0) * shape.z * shape.w * 40.0;',
    '  float yb = shape.x + shape.z * (f0 - 0.5) * 2.0 + look.w * p.x + 0.05 * p.x * p.x',
    '           + 0.012 * sin(p.x * 2.1 + t * 0.05 + s * 4.0);',

    // rays converge slightly with height, like field lines seen in perspective
    '  float d0 = yb - p.y;',
    '  float rx = p.x * (1.0 + 0.5 * max(d0, 0.0));',
    '  float pulse = vnoise1(p.x * 1.7 - t * 0.19 + s * 3.1);',
    '  float seg = smoothstep(0.12, 0.55, vnoise1(p.x * 0.6 + t * 0.011 + s * 5.3));',
    '  float bundle = vnoise1(rx * 9.0 - t * 0.08 + s * 2.3);',
    '  float env = (0.5 + 0.8 * pulse * pulse) * (0.45 + 1.1 * bundle * bundle) * seg * look.x * (1.0 + 0.6 * smoothstep(0.15, 1.4, slope));',
    '  vec3 col = vec3(0.20, 0.80, 0.62) * (exp(-abs(d0 - shape.y * 0.3) * 6.0) * env * 0.05);',
    // well below the lower edge only the soft glow remains; skip the ray work
    '  if (d0 < -0.09) return col;',

    '  float r1 = vnoise2(vec2(rx * 34.0 + s * 5.0 + t * 0.30, p.y * 1.1 - t * 0.04));',
    '  float rays = r1 * r1 * r1 * r1;',
    '  if (aa > 0.0) {',
    '    float r2 = vnoise2(vec2(rx * 92.0 - s * 3.0 - t * 0.75, p.y * 3.0 + t * 0.6));',
    '    r2 *= r2;',
    '    rays = mix(rays, 0.55 * rays + 0.45 * r2 * r2, aa);',
    '  }',
    '  rays *= 5.0;',

    '  float d = d0 + (r1 - 0.5) * 0.004;',
    '  float dp = max(d, 0.0);',
    '  float h = clamp(dp / (shape.y * 2.0), 0.0, 1.0);',
    // ray length varies with the coarse ray field: bright rays reach higher
    '  float tail = exp(-dp / (shape.y * (0.35 + 1.3 * r1)));',
    '  float prof = exp(min(d, 0.0) * 140.0) * (1.3 * exp(-dp * 22.0) + 0.6 * tail);',
    '  float shade = mix(1.0, rays, mix(0.3, 0.9, smoothstep(0.0, 0.3, h)));',
    '  col += ramp(h) * (prof * shade * env);',
    '  col += vec3(1.0, 0.30, 0.55) * (exp(-abs(d + 0.016) * 140.0) * look.z * (0.35 + 0.65 * rays) * env * 0.5);',
    '  return col;',
    '}',

    'void main() {',
    '  float y = 1.0 - v_uv.y;',
    '  if (y >= u_fade.y) { gl_FragColor = vec4(0.0); return; }',
    // reference length: wide canvases (footer) get a longer one so rays/folds aren't crammed,
    // portrait ones a shorter one so a phone still sees several folds
    '  float L = min(max(u_res.y, u_res.x * 0.5), u_res.x * 1.4);',
    '  float aspect = u_res.x / L;',
    '  vec2 p = vec2((v_uv.x - 0.5) * aspect, y);',
    '  float t = u_time;',
    // fade out the fine ray octave when it would be under ~4px per period (aliasing shimmer)
    '  float aa = smoothstep(2.5, 5.0, L / 92.0);',
    '  vec2 par = u_pointer * vec2(0.02 * aspect, 0.012);',
    '  float sd = u_seed * 7.31;',
    '  float base = u_fade.x - 0.02;',
    '  vec3 col = curtain(p + par, t, vec4(base, 0.18, 0.15, 1.25), vec4(1.0, sd, 1.0, -0.05), aa);',
    '  col += curtain(p + par * 0.75, t, vec4(base * 0.72, 0.15, 0.11, 1.7), vec4(0.7, sd + 3.7, 0.0, 0.07), aa);',
    '  col += curtain(p + par * 0.5, t, vec4(base * 0.50, 0.12, 0.08, 2.2), vec4(0.42, sd + 8.1, 0.0, -0.03), aa);',
    '  col += curtain(p + par * 0.3, t, vec4(base * 0.30, 0.09, 0.05, 2.8), vec4(0.26, sd + 12.9, 0.0, 0.04), aa);',
    '  float mask = 1.0 - smoothstep(u_fade.x, u_fade.y, y);',
    '  float breath = 0.85 + 0.3 * vnoise1(t * 0.045 + u_seed * 3.0);',
    '  col *= u_intensity * breath * mask * mix(0.6, 1.0, smoothstep(0.0, 0.12, y));',
    '  col = 1.0 - exp(-col * 1.8);',
    '  float m = max(col.r, max(col.g, col.b));',
    '  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));',
    '  col = mix(vec3(l), col, mix(0.8, 1.0, smoothstep(0.03, 0.4, m)));',
    '  col = max(col + (hash12(gl_FragCoord.xy) - 0.5) / 255.0, 0.0);',
    // premultiplied: alpha = max channel keeps rgb <= a, so CSS screen blend == backdrop + col * (1 - backdrop)
    '  gl_FragColor = vec4(col, max(col.r, max(col.g, col.b)));',
    '}'
  ].join('\n');

  var mqSmall = window.matchMedia ? window.matchMedia('(max-width: 768px)') : null;
  var mqCoarse = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
  var mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var instances = [];
  var warned = false;

  function lowPower() { return !!((mqSmall && mqSmall.matches) || (mqCoarse && mqCoarse.matches)); }
  function reducedMotion() { return !!(mqReduce && mqReduce.matches); }
  function onMq(mq, fn) {
    if (!mq) return function () {};
    if (mq.addEventListener) { mq.addEventListener('change', fn); return function () { mq.removeEventListener('change', fn); }; }
    mq.addListener(fn);
    return function () { mq.removeListener(fn); };
  }
  function warnOnce(msg) {
    if (warned) return;
    warned = true;
    console.warn('[ViFightAurora] ' + msg);
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function attr(el, name, def) {
    var v = parseFloat(el.getAttribute('data-aurora-' + name));
    return isFinite(v) ? v : def;
  }
  function pick(opts, key, el, name, def) {
    return opts && isFinite(opts[key]) ? +opts[key] : attr(el, name, def);
  }

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh) || 'shader compile failed';
      gl.deleteShader(sh);
      throw new Error(log);
    }
    return sh;
  }

  function build(gl) {
    // value-noise hashes need fp32; on mediump-only GPUs (Mali-400/450/470, Tegra 2-4) they collapse to 0
    var hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    if (!hp || hp.precision < 23) throw new Error('no fragment highp; keeping CSS aurora fallback.');
    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs;
    try { fs = compile(gl, gl.FRAGMENT_SHADER, 'precision highp float;\n' + FRAG); }
    catch (e) { gl.deleteShader(vs); throw e; }
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'a_pos');
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      var log = gl.getProgramInfoLog(prog) || 'program link failed';
      gl.deleteProgram(prog);
      throw new Error(log);
    }
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var u = {};
    ['u_res', 'u_time', 'u_intensity', 'u_fade', 'u_seed', 'u_pointer'].forEach(function (n) {
      u[n] = gl.getUniformLocation(prog, n);
    });
    // time ping-pongs over 2h of on-screen time; fp32 keeps sub-pixel precision across that span
    return { prog: prog, buf: buf, u: u, period: 7200 };
  }

  function mount(canvas, opts) {
    if (!canvas || !canvas.getContext) return null;
    for (var i = 0; i < instances.length; i++) if (instances[i].canvas === canvas) return instances[i];

    var gl = null;
    var glAttrs = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true };
    try { gl = canvas.getContext('webgl', glAttrs) || canvas.getContext('experimental-webgl', glAttrs); } catch (e) { gl = null; }
    if (!gl) { warnOnce('WebGL unavailable; keeping CSS aurora fallback.'); return null; }

    var res;
    try { res = build(gl); } catch (e) { warnOnce(e && e.message ? e.message : String(e)); return null; }

    var cfg = {
      intensity: Math.max(0, pick(opts, 'intensity', canvas, 'intensity', 1.0)),
      fadeStart: clamp(pick(opts, 'fadeStart', canvas, 'fade-start', 0.35), 0, 0.98),
      fadeEnd: 0,
      scale: opts && isFinite(opts.scale) ? +opts.scale : (canvas.hasAttribute('data-aurora-scale') ? attr(canvas, 'scale', 0.5) : null),
      seed: pick(opts, 'seed', canvas, 'seed', 0.0),
      speed: pick(opts, 'speed', canvas, 'speed', 1.0)
    };
    cfg.fadeEnd = clamp(pick(opts, 'fadeEnd', canvas, 'fade-end', 0.75), cfg.fadeStart + 0.02, 1.0);

    var host = canvas.closest ? (canvas.closest('[data-aurora-host]') || canvas.closest('section, footer')) : null;
    var STATIC_TIME = 140 + (Math.abs(cfg.seed) % 10) * 23;
    var elapsed = 60 + (Math.abs(cfg.seed) % 10) * 37;
    var pTarget = [0, 0], pCur = [0, 0];
    var enabled = true, inView = !window.IntersectionObserver, docVisible = !document.hidden;
    var lost = false, destroyed = false, shown = false, hasSize = false;
    var raf = 0, lastTime = 0, lastDraw = 0, resizeTimer = 0;
    var io = null, ro = null, unbind = [];

    function setOn(on) {
      canvas.classList.toggle('gl-aurora-on', on);
      if (host) host.classList.toggle('gl-aurora-on', on);
    }

    function wrapTime(e) {
      var P = res.period, m = ((e % (2 * P)) + 2 * P) % (2 * P);
      return m < P ? m : 2 * P - m;
    }

    function draw(time) {
      if (lost || !res || !canvas.width || !canvas.height) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(res.prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.buf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(res.u.u_res, canvas.width, canvas.height);
      gl.uniform1f(res.u.u_time, wrapTime(time));
      gl.uniform1f(res.u.u_intensity, cfg.intensity);
      gl.uniform2f(res.u.u_fade, cfg.fadeStart, cfg.fadeEnd);
      gl.uniform1f(res.u.u_seed, cfg.seed);
      gl.uniform2f(res.u.u_pointer, pCur[0], pCur[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!shown) { shown = true; setOn(true); }
    }

    function drawStill() {
      pCur[0] = pCur[1] = 0;
      draw(STATIC_TIME);
    }

    function resize() {
      resizeTimer = 0;
      if (destroyed || lost) return;
      var w = canvas.clientWidth, h = canvas.clientHeight;
      var had = hasSize; hasSize = !!(w && h);
      if (!hasSize) { if (had) update(); return; }
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      var s = cfg.scale == null ? 0.5 : cfg.scale;
      if (lowPower()) s = Math.min(s, 0.35);
      s = clamp(s, 0.1, 1);
      var cw = Math.max(1, Math.round(w * dpr * s)), ch = Math.max(1, Math.round(h * dpr * s));
      var changed = cw !== canvas.width || ch !== canvas.height;
      if (changed) { canvas.width = cw; canvas.height = ch; }
      // the buffer was cleared and the throttled loop may skip its next tick: repaint now
      if (changed || !raf) { if (reducedMotion()) drawStill(); else draw(elapsed); }
      if (!had) update();
    }
    function scheduleResize() {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 120);
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      var interval = lowPower() ? 1000 / 30 : 1000 / 60;
      var delta = now - lastDraw;
      if (delta < interval - 1.5) return;
      // a tick up to 1.5ms early re-anchors at now; only a late tick carries its overshoot
      lastDraw = (delta > 250 || delta < interval) ? now : now - (delta % interval);
      var dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      elapsed += dt * cfg.speed;
      var k = 1 - Math.exp(-dt * 2.5);
      pCur[0] += (pTarget[0] - pCur[0]) * k;
      pCur[1] += (pTarget[1] - pCur[1]) * k;
      draw(elapsed);
    }

    function update() {
      var run = enabled && hasSize && !destroyed && !lost && inView && docVisible && !reducedMotion();
      if (run && !raf) {
        lastTime = lastDraw = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (!run && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (!run && reducedMotion() && !destroyed && !lost && inView && hasSize) drawStill();
    }

    function onVisibility() { docVisible = !document.hidden; update(); }
    function onLost(e) {
      e.preventDefault();
      lost = true;
      res = null;
      shown = false;
      setOn(false);
      update();
    }
    function onRestored() {
      try { res = build(gl); } catch (e) { warnOnce(e && e.message ? e.message : String(e)); return; }
      lost = false;
      resize();
      update();
    }

    canvas.addEventListener('webglcontextlost', onLost, false);
    canvas.addEventListener('webglcontextrestored', onRestored, false);
    document.addEventListener('visibilitychange', onVisibility, false);
    unbind.push(onMq(mqReduce, update), onMq(mqSmall, scheduleResize), onMq(mqCoarse, scheduleResize));

    // a devicePixelRatio change alone (moving between displays) resizes nothing, so watch it directly
    var unDpr = function () {};
    function watchDpr() {
      unDpr();
      if (!window.matchMedia) return;
      unDpr = onMq(window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)'), function () { watchDpr(); scheduleResize(); });
    }
    watchDpr();

    if (window.ResizeObserver) {
      ro = new ResizeObserver(scheduleResize);
      ro.observe(canvas);
    } else {
      window.addEventListener('resize', scheduleResize, false);
    }
    if (window.IntersectionObserver) {
      io = new IntersectionObserver(function (entries) {
        inView = entries[entries.length - 1].isIntersecting;
        update();
      }, { rootMargin: '100px' });
      io.observe(canvas);
    }

    var inst = {
      canvas: canvas,
      start: function () { enabled = true; update(); },
      stop: function () { enabled = false; update(); },
      setPointer: function (nx, ny) {
        pTarget[0] = clamp(+nx || 0, -1, 1);
        pTarget[1] = clamp(+ny || 0, -1, 1);
      },
      setIntensity: function (f) {
        cfg.intensity = Math.max(0, +f || 0);
        if (!raf && !lost && !destroyed) { if (reducedMotion()) drawStill(); else draw(elapsed); }
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        update();
        if (resizeTimer) clearTimeout(resizeTimer);
        if (io) io.disconnect();
        if (ro) ro.disconnect(); else window.removeEventListener('resize', scheduleResize, false);
        canvas.removeEventListener('webglcontextlost', onLost, false);
        canvas.removeEventListener('webglcontextrestored', onRestored, false);
        document.removeEventListener('visibilitychange', onVisibility, false);
        unbind.forEach(function (fn) { fn(); });
        unDpr();
        if (res && !gl.isContextLost()) {
          gl.deleteBuffer(res.buf);
          gl.deleteProgram(res.prog);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        res = null;
        setOn(false);
        var idx = instances.indexOf(inst);
        if (idx >= 0) instances.splice(idx, 1);
      }
    };

    instances.push(inst);
    resize();
    update();
    return inst;
  }

  function autoMount() {
    var list = document.querySelectorAll('canvas[data-aurora]');
    for (var i = 0; i < list.length; i++) mount(list[i]);
  }

  window.ViFightAurora = {
    mount: mount,
    instances: instances,
    setPointerAll: function (nx, ny) { instances.forEach(function (it) { it.setPointer(nx, ny); }); },
    setIntensityAll: function (f) { instances.forEach(function (it) { it.setIntensity(f); }); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount, false);
  else autoMount();
})();
