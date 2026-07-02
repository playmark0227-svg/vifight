/* ============================================
   ViFight — Main JavaScript (Optimized)
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ---------- LOADING SCREEN ----------
  const loader = document.getElementById('loader');
  let loaderHidden = false;

  function hideLoader() {
    if (loaderHidden || !loader) return;
    loaderHidden = true;
    loader.classList.add('loaded');
    document.body.style.overflow = '';
    setTimeout(() => {
      const hero = document.getElementById('hero');
      if (hero) hero.classList.add('visible');
    }, 300);
    // Snap hero entrance transitions to their final state shortly after the
    // loader hides. Root cause of the "ghost title": Chrome sometimes froze
    // the data-reveal opacity/translate transitions mid-flight on first
    // paint (title stuck ~20% opacity, 40px low). By 1.2s the reveal is
    // normally finished anyway, so snapping is invisible — but it rescues
    // frozen runs deterministically.
    [1200, 2600].forEach(ms => setTimeout(() => {
      const els = document.querySelectorAll('#hero [data-reveal], #hero .hero-line span');
      els.forEach(el => {
        el.style.transition = 'none';
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        els.forEach(el => { el.style.transition = ''; });
      }));
    }, ms));
  }

  document.body.style.overflow = 'hidden';

  // ---------- PERFORMANCE HELPERS ----------
  // Respect reduced-motion preference and device class to scale heavy effects.
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  const isSmall = window.innerWidth < 768;

  function debounce(fn, wait) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, wait);
    };
  }

  // One debounced resize listener fans out to every component that needs to
  // re-measure, instead of each registering its own window 'resize' handler.
  const resizeFns = [];
  window.addEventListener('resize', debounce(() => {
    for (const fn of resizeFns) fn();
  }, 150), { passive: true });

  // Trigger hideLoader after window load (with a short min display time), OR via safety fallback.
  if (document.readyState === 'complete') {
    setTimeout(hideLoader, 1000);
  } else {
    window.addEventListener('load', () => setTimeout(hideLoader, 1000));
  }
  // Safety fallback: never let the loader hang. Force-hide after 3.5s regardless.
  setTimeout(hideLoader, 3500);

  // ---------- ANIMATED LOW-POLY EDGES (dividers + hero mountains) ----------
  // Peaks gently undulate (per-vertex sine). One shared rAF loop; only visible
  // shapes render; idle when none on screen; static under reduced-motion.
  const motionAnims = [];

  // Register an SVG polygon whose top vertices breathe. `gateEl` controls
  // visibility. Vertices at the very bottom (baseline) stay fixed.
  function registerRidge(svg, poly, W, H, ampRange, speedRange, gateEl) {
    // parse "x,y x,y ..." into vertices; fix those sitting on the baseline
    const verts = poly.getAttribute('points').trim().split(/\s+/).map(p => {
      const [x, y] = p.split(',').map(Number);
      return { x, baseY: y, fixed: y >= H * 0.9, phase: Math.random() * Math.PI * 2,
               amp: ampRange[0] + Math.random() * (ampRange[1] - ampRange[0]),
               speed: speedRange[0] + Math.random() * (speedRange[1] - speedRange[0]) };
    });
    function render(t) {
      let pts = '';
      for (const v of verts) {
        const y = (reduceMotion || v.fixed) ? v.baseY : v.baseY + Math.sin(t * v.speed + v.phase) * v.amp;
        pts += v.x + ',' + y.toFixed(1) + ' ';
      }
      poly.setAttribute('points', pts.trim());
    }
    render(0);
    const entry = { render, visible: false };
    motionAnims.push(entry);
    new IntersectionObserver(([e]) => { entry.visible = e.isIntersecting; if (e.isIntersecting) startMotionLoop(); }, { rootMargin: '80px' }).observe(gateEl || svg);
  }

  // Section dividers: regenerate a random jagged edge, then animate it.
  document.querySelectorAll('.section-divider svg').forEach(svg => {
    const poly = svg.querySelector('polygon');
    if (!poly) return;
    const W = 1440, H = 72;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const segs = 8 + Math.floor(Math.random() * 7);
    let pts = '0,' + H;
    for (let i = 0; i <= segs; i++) pts += ' ' + Math.round((W / segs) * i) + ',' + (H * (0.12 + Math.random() * 0.62)).toFixed(1);
    pts += ' ' + W + ',' + H;
    poly.setAttribute('points', pts);
    registerRidge(svg, poly, W, H, [3, 10], [0.0005, 0.0016], svg);
  });

  // Hero mountains: same breathing motion, gentler & slower (taller viewBox).
  const heroEl = document.getElementById('hero');
  document.querySelectorAll('.hero-ridge').forEach(svg => {
    const poly = svg.querySelector('polygon');
    if (poly) registerRidge(svg, poly, 1440, 400, [4, 13], [0.0003, 0.0009], heroEl);
  });

  let motionLoopRunning = false;
  function startMotionLoop() {
    if (reduceMotion || motionLoopRunning) return;
    motionLoopRunning = true;
    requestAnimationFrame(function loop(t) {
      let anyVisible = false;
      for (const d of motionAnims) {
        if (d.visible) { d.render(t); anyVisible = true; }
      }
      if (anyVisible) requestAnimationFrame(loop);
      else motionLoopRunning = false;
    });
  }

  // ---------- CUSTOM CURSOR ----------
  const cursor = document.getElementById('cursor');
  const follower = document.getElementById('cursor-follower');
  let mouseX = 0, mouseY = 0;
  let followerX = 0, followerY = 0;
  let particles = [];                          // cursor-trail particles (drawn in mainLoop)
  const trailOn = !reduceMotion && !isTouch;
  let lastTrailTime = 0;

  // Single global pointer handler: cursor dot + dark-section test (against
  // cached rects, no layout read) + throttled trail spawn — one listener
  // instead of three separate mousemove handlers.
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    cursor.style.transform = `translate(calc(${mouseX}px - 50%), calc(${mouseY}px - 50%))`;
    if (!document.body.classList.contains('cursor-ready')) document.body.classList.add('cursor-ready');
    checkDark();
    if (trailOn && e.timeStamp - lastTrailTime >= 80) {
      lastTrailTime = e.timeStamp;
      particles.push({ x: mouseX, y: mouseY, life: 1, vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5 });
      if (particles.length > 12) particles.shift();
    }
  }, { passive: true });

  // Cursor interactions (委譲で一括)
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest('[data-cursor-expand], a, button')) {
      cursor.classList.add('expanded'); follower.classList.add('expanded');
    }
    if (e.target.closest('[data-cursor-view]')) {
      follower.classList.add('view'); cursor.style.opacity = '0';
    }
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest('[data-cursor-expand], a, button')) {
      cursor.classList.remove('expanded'); follower.classList.remove('expanded');
    }
    if (e.target.closest('[data-cursor-view]')) {
      follower.classList.remove('view'); cursor.style.opacity = '1';
    }
  });

  // ---------- CANVAS TRAIL ----------
  const trailCanvas = document.createElement('canvas');
  trailCanvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9997;';
  document.body.appendChild(trailCanvas);
  const ctx = trailCanvas.getContext('2d');
  trailCanvas.width = window.innerWidth;
  trailCanvas.height = window.innerHeight;
  resizeFns.push(() => {
    trailCanvas.width = window.innerWidth;
    trailCanvas.height = window.innerHeight;
  });
  // (trail particles are spawned by the unified pointer handler above)

  // ---------- MAGNETIC BUTTONS ----------
  const magneticEls = document.querySelectorAll('[data-magnetic]');
  magneticEls.forEach(el => {
    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      el.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
    }, { passive: true });
    el.addEventListener('mouseleave', () => {
      el.style.transform = 'translate(0,0)';
      el.style.transition = 'transform 0.4s cubic-bezier(0.16,1,0.3,1)';
    });
    el.addEventListener('mouseenter', () => {
      el.style.transition = 'none';
    });
  });

  // ---------- UNIFIED SCROLL LOOP ----------
  const header = document.getElementById('header');
  // True only while the Home (hero) tab is active. Every other tab sits over
  // light sections, so the header must use its solid / dark-text style there.
  let onHomeView = true;
  const progressBar = document.createElement('div');
  progressBar.style.cssText = 'position:fixed;top:0;left:0;height:2px;background:linear-gradient(90deg,var(--aurora-green),var(--aurora-teal),var(--aurora-violet));z-index:10001;width:0%;pointer-events:none;';
  document.body.appendChild(progressBar);

  // Fixed back-to-top button with an aurora scroll-progress ring.
  // Appears past 600px; the ring fills as the page is scrolled.
  const totop = document.createElement('a');
  totop.id = 'totop-ring';
  totop.href = '#';
  totop.setAttribute('aria-label', 'ページ上部へ戻る');
  totop.innerHTML =
    '<svg viewBox="0 0 52 52" aria-hidden="true"><defs><linearGradient id="totop-grad" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#46e2a6"/><stop offset="0.5" stop-color="#5cd6d0"/><stop offset="1" stop-color="#9678d8"/>' +
    '</linearGradient></defs><circle class="ring-bg" cx="26" cy="26" r="24"/><circle class="ring-fg" cx="26" cy="26" r="24"/></svg>' +
    '<svg class="totop-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  document.body.appendChild(totop);
  const totopRing = totop.querySelector('.ring-fg');
  const RING_LEN = 2 * Math.PI * 24;
  totopRing.style.strokeDasharray = RING_LEN;
  totopRing.style.strokeDashoffset = RING_LEN;
  totop.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  });

  const parallaxEls = [...document.querySelectorAll('[data-parallax]')].map(el => ({
    el,
    speed: parseFloat(el.getAttribute('data-parallax'))
  }));

  const scrollMarquee = document.querySelector('[data-scroll-speed]');
  let marqueeWidth = 0;
  let marqueePos = 0;
  let marqueeSkew = 0;          // scroll-velocity skew, decays in mainLoop
  let velScrollY = window.scrollY;
  let currentScrollY = window.scrollY;
  let ticking = false;

  window.addEventListener('scroll', () => {
    currentScrollY = window.scrollY;
    if (!ticking) {
      requestAnimationFrame(onScrollFrame);
      ticking = true;
    }
  }, { passive: true });

  const heroScrollCue = document.querySelector('.hero-scroll');

  function onScrollFrame() {
    const scrollY = currentScrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    header.classList.toggle('scrolled', scrollY > 80 || !onHomeView);
    progressBar.style.width = ((scrollY / docHeight) * 100) + '%';
    // back-to-top: show past 600px, ring tracks page progress
    totop.classList.toggle('show', scrollY > 600);
    totopRing.style.strokeDashoffset = RING_LEN * (1 - Math.min(scrollY / docHeight, 1));
    // hero scroll cue fades once the journey begins
    if (heroScrollCue) heroScrollCue.classList.toggle('faded', scrollY > 120);
    // marquee leans with scroll velocity (decays each frame in mainLoop)
    marqueeSkew = Math.max(-7, Math.min(7, (scrollY - velScrollY) * 0.15));
    velScrollY = scrollY;
    for (const { el, speed } of parallaxEls) {
      const rect = el.getBoundingClientRect();
      const center = rect.top + rect.height / 2 - window.innerHeight / 2;
      el.style.transform = `translateY(${center * speed}px)`;
    }
    // sections shifted under the pointer → refresh dark-cursor rects + state
    computeDarkRects();
    checkDark();
    ticking = false;
  }

  if (scrollMarquee) {
    requestAnimationFrame(() => { marqueeWidth = scrollMarquee.scrollWidth / 4; });
  }

  // ========== 単一メインRAFループ ==========
  function mainLoop() {
    // 1. Cursor follower
    const dx = mouseX - followerX;
    const dy = mouseY - followerY;
    if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
      followerX += dx * 0.12;
      followerY += dy * 0.12;
      follower.style.transform = `translate(calc(${followerX}px - 50%), calc(${followerY}px - 50%))`;
    }

    // 2. Canvas trail (パーティクルがある時だけ描画)
    if (particles.length > 0) {
      ctx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
      particles = particles.filter(p => p.life > 0);
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(139,115,85,${p.life * 0.25})`;
        ctx.fill();
        p.x += p.vx; p.y += p.vy; p.life -= 0.05;
      }
    }

    // 3. Marquee (paused for reduced-motion users); leans with scroll velocity
    if (scrollMarquee && marqueeWidth > 0 && !reduceMotion) {
      marqueePos -= 1;
      if (Math.abs(marqueePos) >= marqueeWidth) marqueePos = 0;
      marqueeSkew *= 0.92;
      scrollMarquee.style.transform = `translateX(${marqueePos}px) skewX(${marqueeSkew.toFixed(2)}deg)`;
    }

    requestAnimationFrame(mainLoop);
  }
  mainLoop();

  // ---------- MOBILE MENU ----------
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');

  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    mobileMenu.classList.toggle('active');
    document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
  });

  mobileMenu.querySelectorAll('[data-menu-link]').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      mobileMenu.classList.remove('active');
      document.body.style.overflow = '';
    });
  });

  // ---------- IN-PAGE ANCHOR LINKS ----------
  // Hash links that map to a tab are handled by the TAB ROUTER below; any
  // remaining in-page anchors fall back to a smooth scroll.

  // ---------- INTERSECTION OBSERVERS (統合) ----------
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      if (el.hasAttribute('data-reveal')) el.classList.add('visible');
      if (el.hasAttribute('data-reveal-title')) el.querySelectorAll('.char').forEach(c => c.classList.add('visible'));
      if (el.hasAttribute('data-reveal-words')) el.querySelectorAll('.word').forEach(w => w.classList.add('visible'));
      if (el.hasAttribute('data-count')) animateCount(el);
      revealObserver.unobserve(el);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('[data-reveal-title]').forEach(title => {
    const frag = document.createDocumentFragment();
    [...title.textContent].forEach((char, i) => {
      const span = document.createElement('span');
      span.className = 'char';
      span.textContent = char === ' ' ? '\u00A0' : char;
      span.style.transitionDelay = `${i * 0.04}s`;
      frag.appendChild(span);
    });
    title.textContent = '';
    title.appendChild(frag);
    revealObserver.observe(title);
  });

  document.querySelectorAll('[data-reveal-words]').forEach(el => {
    const frag = document.createDocumentFragment();
    el.textContent.trim().split(/(\s+)/).forEach((word, i) => {
      if (word.match(/^\s+$/)) {
        frag.appendChild(document.createTextNode(' '));
      } else {
        const span = document.createElement('span');
        span.className = 'word';
        span.textContent = word;
        span.style.transitionDelay = `${i * 0.06}s`;
        frag.appendChild(span);
        frag.appendChild(document.createTextNode(' '));
      }
    });
    el.textContent = '';
    el.appendChild(frag);
    revealObserver.observe(el);
  });

  document.querySelectorAll('[data-reveal], [data-count]').forEach(el => revealObserver.observe(el));

  function animateCount(el) {
    if (el.dataset.counted) return;   // guard: reveal observer + tab router may both call
    el.dataset.counted = '1';
    const target = parseInt(el.getAttribute('data-count'));
    const start = performance.now();
    const duration = 2000;
    // aurora glow on the figure while it counts up
    const holder = el.closest('.home-stat, .stat');
    if (holder) holder.classList.add('counting');
    function update(now) {
      const progress = Math.min((now - start) / duration, 1);
      el.textContent = Math.floor(target * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) requestAnimationFrame(update);
      else {
        el.textContent = target;
        if (holder) setTimeout(() => holder.classList.remove('counting'), 500);
      }
    }
    requestAnimationFrame(update);
  }

  // ---------- NAV HIGHLIGHT ----------
  const navLinks = document.querySelectorAll('.nav-links a');
  const navObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${id}`));
      }
    });
  }, { threshold: 0.3 });
  document.querySelectorAll('section[id]').forEach(s => navObserver.observe(s));

  // ---------- STAGGERED DELAYS ----------
  document.querySelectorAll('.works-grid .work-item').forEach((el, i) => { el.style.transitionDelay = `${i * 0.1}s`; });
  document.querySelectorAll('.service-item').forEach((el, i) => { el.style.transitionDelay = `${i * 0.08}s`; });
  document.querySelectorAll('.flow-step').forEach((el, i) => { el.style.transitionDelay = `${i * 0.12}s`; });

  // Cards that both reveal AND hover-animate: stagger the reveal, then clear
  // the inline delay after the first transition so hover stays instant.
  const staggerGroups = [
    ['.strength-grid .strength-card', 0.09],
    ['.home-services .home-service', 0.07],
    ['.home-works .home-work', 0.1],
    ['.faq-list .faq-item', 0.06],
  ];
  staggerGroups.forEach(([sel, step]) => {
    document.querySelectorAll(sel).forEach((el, i) => {
      if (!i) return;
      el.style.transitionDelay = `${(i * step).toFixed(2)}s`;
      el.dataset.stagger = '1';
    });
  });
  document.addEventListener('transitionend', (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.stagger && el.classList.contains('visible')) {
      el.style.transitionDelay = '';
      delete el.dataset.stagger;
    }
  });

  // ---------- TAB ROUTER (single-page → per-tab views) ----------
  // The long one-pager is split into tabbed views; clicking a nav item shows
  // just that section. Hash routing keeps URLs (/#about) shareable and makes
  // the browser back/forward buttons step through tabs.
  const views = document.querySelectorAll('.view');
  if (views.length) {
    const sectionToView = {
      hero: 'view-home', about: 'view-about', services: 'view-services',
      works: 'view-works', flow: 'view-flow', faq: 'view-faq', contact: 'view-contact'
    };
    const viewToSection = {
      'view-home': 'hero', 'view-about': 'about', 'view-services': 'services',
      'view-works': 'works', 'view-flow': 'flow', 'view-faq': 'faq', 'view-contact': 'contact'
    };
    const viewIdFromHash = (hash) => sectionToView[(hash || '').replace('#', '')] || null;
    let currentView = document.querySelector('.view.is-active') || views[0];

    // Aurora wipe — a soft northern-lights sweep flourishes each tab change.
    // One-shot transform/opacity animation on a fixed overlay (CSS-driven).
    const auroraWipe = document.createElement('div');
    auroraWipe.id = 'aurora-wipe';
    document.body.appendChild(auroraWipe);

    // Reveal every animated element in a freshly-shown view at once; the
    // existing per-element transition delays still cascade them in nicely.
    function revealView(viewEl) {
      viewEl.querySelectorAll('[data-reveal]').forEach(el => { el.classList.add('visible'); revealObserver.unobserve(el); });
      viewEl.querySelectorAll('[data-reveal-title]').forEach(el => { el.querySelectorAll('.char').forEach(c => c.classList.add('visible')); revealObserver.unobserve(el); });
      viewEl.querySelectorAll('[data-reveal-words]').forEach(el => { el.querySelectorAll('.word').forEach(w => w.classList.add('visible')); revealObserver.unobserve(el); });
      viewEl.querySelectorAll('[data-count]').forEach(el => { animateCount(el); revealObserver.unobserve(el); });
    }

    function showView(viewId, isInitial) {
      const target = document.getElementById(viewId);
      if (!target) return;
      views.forEach(v => v.classList.toggle('is-active', v === target));
      currentView = target;

      // sync nav highlight (Home has no nav link → all inactive)
      const sectionId = viewToSection[viewId] || '';
      navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + sectionId));

      // header: solid / dark-text style on every tab except Home (hero)
      onHomeView = (viewId === 'view-home');
      header.classList.toggle('scrolled', window.scrollY > 80 || !onHomeView);

      // close the work modal if a tab change happens while it's open
      const wm = document.getElementById('work-modal');
      if (wm && wm.classList.contains('active')) {
        wm.classList.remove('active');
        wm.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
      }

      // Let the hero keep its scripted first-load entrance; for every other
      // transition, jump to top, bloom the content in, and re-measure canvases.
      const heroEntrance = isInitial && viewId === 'view-home';
      if (!heroEntrance) {
        if (!isInitial) {
          window.scrollTo(0, 0);
          // restart the aurora sweep for this tab change
          auroraWipe.classList.remove('sweep');
          void auroraWipe.offsetWidth;
          auroraWipe.classList.add('sweep');
        }
        revealView(target);
        window.dispatchEvent(new Event('resize'));
      }
    }

    function navigateTo(hash, isInitial) {
      showView(viewIdFromHash(hash) || 'view-home', isInitial);
    }

    // Intercept hash links that map to a tab; push history (no native jump).
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', (e) => {
        const hash = link.getAttribute('href');
        const viewId = viewIdFromHash(hash);
        if (!viewId) return;   // unknown anchor → leave default behaviour
        e.preventDefault();
        if (location.hash !== hash) history.pushState(null, '', hash);
        showView(viewId, false);
      });
    });

    window.addEventListener('popstate', () => navigateTo(location.hash, false));
    navigateTo(location.hash, true);
  }

  // ---------- TILT EFFECT ----------
  document.querySelectorAll('.work-item').forEach(item => {
    item.addEventListener('mousemove', (e) => {
      const rect = item.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      item.style.transform = `perspective(600px) rotateY(${x * 5}deg) rotateX(${-y * 5}deg)`;
    }, { passive: true });
    item.addEventListener('mouseleave', () => {
      item.style.transform = 'perspective(600px) rotateY(0) rotateX(0)';
      item.style.transition = 'transform 0.5s cubic-bezier(0.16,1,0.3,1)';
    });
    item.addEventListener('mouseenter', () => { item.style.transition = 'none'; });
  });

  // ---------- FAQ ACCORDION ----------
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    item.querySelector('.faq-question').addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      faqItems.forEach(i => i.classList.remove('active'));
      if (!isActive) item.classList.add('active');
    });
  });

  // ---------- FORM (FormSubmit AJAX) ----------
  const form = document.querySelector('.contact-form');
  if (form) {
    const btn = form.querySelector('.form-submit');
    const idleMarkup = '<span>送信する</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
    // AJAX endpoint keeps the in-page success state (no redirect to FormSubmit).
    const endpoint = (form.getAttribute('action') || '').replace('formsubmit.co/', 'formsubmit.co/ajax/');
    const resetBtn = (delay) => setTimeout(() => {
      btn.innerHTML = idleMarkup;
      btn.style.background = btn.style.color = btn.style.borderColor = '';
      btn.disabled = false;
    }, delay);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      btn.disabled = true;
      btn.innerHTML = '<span>送信中…</span>';
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Accept': 'application/json' },
          body: new FormData(form)
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && String(data.success) === 'true') {
          btn.innerHTML = '<span>送信完了</span>';
          btn.style.cssText += 'background:var(--accent-warm);color:var(--white);border-color:var(--accent-warm);';
          form.reset();
          resetBtn(3500);
        } else {
          throw new Error('formsubmit failed');
        }
      } catch (err) {
        btn.innerHTML = '<span>送信に失敗しました</span>';
        btn.style.cssText += 'background:#b3402e;color:#fff;border-color:#b3402e;';
        resetBtn(4000);
      }
    });

    form.querySelectorAll('input, textarea, select').forEach(input => {
      input.addEventListener('focus', () => input.parentElement.classList.add('focused'));
      input.addEventListener('blur', () => { if (!input.value) input.parentElement.classList.remove('focused'); });
    });
  }

  // Disable canvas particles entirely for reduced-motion users; scale down on mobile.
  const heroParticleCount = reduceMotion ? 0 : (isSmall ? 22 : 50);
  const phParticleCount = reduceMotion ? 0 : (isSmall ? 14 : 30);

  // ---------- HERO FLOATING PARTICLES ----------
  const heroCanvas = document.getElementById('hero-particles');
  if (heroCanvas && heroParticleCount > 0) {
    const hctx = heroCanvas.getContext('2d');
    const hero = document.getElementById('hero');
    let particles = [];
    let heroVisible = true;   // hero starts in view at top of page
    let heroRunning = false;

    function resizeHeroCanvas() {
      heroCanvas.width = hero.offsetWidth;
      heroCanvas.height = hero.offsetHeight;
    }
    resizeHeroCanvas();
    resizeFns.push(resizeHeroCanvas);

    for (let i = 0; i < heroParticleCount; i++) {
      particles.push({
        x: Math.random() * heroCanvas.width,
        y: Math.random() * heroCanvas.height,
        r: Math.random() * 2 + 0.5,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.2 - 0.1,
        alpha: Math.random() * 0.5 + 0.15,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.02 + 0.005
      });
    }

    // Shooting stars: occasional meteors streaking across the upper sky
    let meteors = [];
    let nextMeteorAt = performance.now() + 2200;

    function drawHeroParticles() {
      if (!heroVisible) { heroRunning = false; return; }  // stop loop when offscreen
      hctx.clearRect(0, 0, heroCanvas.width, heroCanvas.height);
      const w = heroCanvas.width, h = heroCanvas.height;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += p.pulseSpeed;
        const a = p.alpha * (0.6 + 0.4 * Math.sin(p.pulse));

        if (p.x < -10) p.x = w + 10;
        else if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        else if (p.y > h + 10) p.y = -10;

        hctx.beginPath();
        hctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        hctx.fillStyle = `rgba(224, 200, 165, ${a})`;
        hctx.fill();

        hctx.beginPath();
        hctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
        hctx.fillStyle = `rgba(184, 148, 106, ${a * 0.15})`;
        hctx.fill();
      }

      // meteors
      const now = performance.now();
      if (now >= nextMeteorAt && meteors.length < 2) {
        const leftward = Math.random() < 0.5;
        meteors.push({
          x: w * (0.2 + Math.random() * 0.6),
          y: h * (0.04 + Math.random() * 0.28),
          vx: (7 + Math.random() * 5) * (leftward ? -1 : 1),
          vy: 2.2 + Math.random() * 2,
          life: 1
        });
        nextMeteorAt = now + 3500 + Math.random() * 5500;
      }
      meteors = meteors.filter(m => m.life > 0);
      for (const m of meteors) {
        const tailX = m.x - m.vx * 9, tailY = m.y - m.vy * 9;
        const grad = hctx.createLinearGradient(m.x, m.y, tailX, tailY);
        grad.addColorStop(0, `rgba(255, 246, 230, ${0.9 * m.life})`);
        grad.addColorStop(1, 'rgba(255, 246, 230, 0)');
        hctx.strokeStyle = grad;
        hctx.lineWidth = 1.6;
        hctx.lineCap = 'round';
        hctx.beginPath();
        hctx.moveTo(m.x, m.y);
        hctx.lineTo(tailX, tailY);
        hctx.stroke();
        hctx.beginPath();
        hctx.arc(m.x, m.y, 1.7, 0, Math.PI * 2);
        hctx.fillStyle = `rgba(255, 250, 240, ${m.life})`;
        hctx.fill();
        m.x += m.vx;
        m.y += m.vy;
        m.life -= 0.016;
      }

      requestAnimationFrame(drawHeroParticles);
    }
    function startHero() {
      if (!heroRunning && heroVisible) { heroRunning = true; requestAnimationFrame(drawHeroParticles); }
    }

    const heroObserver = new IntersectionObserver(([entry]) => {
      heroVisible = entry.isIntersecting;
      if (heroVisible) startHero();
    }, { threshold: 0 });
    heroObserver.observe(hero);
    startHero();
  }

  // Shared "wind" written by the mobile gyro handler, read by the aurora
  // canvas so tilting the phone drifts the northern lights.
  let auroraWind = 0;

  // ---------- INTERACTIVE AURORA ("Aurora Brush") ----------
  // The hero sky responds to the pointer: glide the cursor (or drag a finger)
  // across the hero and luminous aurora light gathers and rises from it, like
  // stirring the northern lights by hand. Click/tap bursts a ring of light.
  // A gentle idle auto-stir keeps the sky alive between interactions.
  // Disabled for reduced-motion; scaled on mobile.
  const auroraCanvas = document.getElementById('hero-aurora-canvas');
  if (auroraCanvas && !reduceMotion) {
    const actx = auroraCanvas.getContext('2d');
    const heroEl = document.getElementById('hero');
    const MAX_WISPS = isSmall ? 46 : 120;

    // Pre-render one soft radial-glow sprite per aurora hue — far cheaper than
    // rebuilding a gradient for every wisp on every frame.
    const palette = [
      [88, 240, 188],   // emerald
      [120, 232, 214],  // teal
      [150, 212, 232],  // ice blue
      [196, 142, 228],  // violet
      [236, 130, 200]   // magenta
    ];
    function makeGlowSprite(col) {
      const s = document.createElement('canvas');
      s.width = s.height = 128;
      const c = s.getContext('2d');
      const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0,    `rgba(${col[0]},${col[1]},${col[2]},1)`);
      g.addColorStop(0.45, `rgba(${col[0]},${col[1]},${col[2]},0.35)`);
      g.addColorStop(1,    `rgba(${col[0]},${col[1]},${col[2]},0)`);
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 128);
      return s;
    }
    const sprites = palette.map(makeGlowSprite);

    let wisps = [];
    let bursts = [];
    let aVisible = true;
    let aRunning = false;
    let lastX = 0, lastY = 0, haveLast = false;
    let idleTimer = null;

    function resizeAuroraCanvas() {
      auroraCanvas.width = heroEl.offsetWidth;
      auroraCanvas.height = heroEl.offsetHeight;
    }
    resizeAuroraCanvas();
    resizeFns.push(resizeAuroraCanvas);

    function spawnWisp(x, y, drift, intensity) {
      if (wisps.length >= MAX_WISPS) wisps.shift();
      wisps.push({
        x: x + (Math.random() - 0.5) * 22,
        y: y + (Math.random() - 0.5) * 18,
        vx: drift * 0.05 + (Math.random() - 0.5) * 0.5,
        vy: -(0.35 + Math.random() * 0.7),        // light rises through the sky
        r: 14 + Math.random() * 22 + intensity * 7,
        life: 1,
        decay: 0.007 + Math.random() * 0.009,
        sprite: sprites[(Math.random() * sprites.length) | 0],
        sway: Math.random() * Math.PI * 2,
        swaySpeed: 0.02 + Math.random() * 0.03
      });
    }

    function stirAt(clientX, clientY) {
      const rect = heroEl.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
      const dx = haveLast ? x - lastX : 0;
      const dy = haveLast ? y - lastY : 0;
      lastX = x; lastY = y; haveLast = true;
      // densest near the top of the sky, fading out toward the skyline
      const sky = 1 - Math.min(1, y / (rect.height * 0.75));
      if (sky <= 0) return;
      const speed = Math.hypot(dx, dy);
      const n = Math.min(3, Math.round(sky * (0.6 + speed * 0.12)));
      for (let k = 0; k < n; k++) spawnWisp(x, y, dx, sky * (1 + speed * 0.05));
      startAurora();
    }

    // Click / tap → burst a ring of aurora light radiating from the point.
    function burstAt(clientX, clientY) {
      const rect = heroEl.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
      bursts.push({ x, y, r: 0, life: 1 });
      const m = isSmall ? 10 : 16;
      for (let k = 0; k < m; k++) {
        const ang = (Math.PI * 2 * k) / m + Math.random() * 0.4;
        const sp = 2 + Math.random() * 3.4;
        if (wisps.length >= MAX_WISPS) wisps.shift();
        wisps.push({
          x, y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp - 0.4,
          r: 14 + Math.random() * 18,
          life: 1,
          decay: 0.013 + Math.random() * 0.012,
          sprite: sprites[(Math.random() * sprites.length) | 0],
          sway: Math.random() * Math.PI * 2,
          swaySpeed: 0.02 + Math.random() * 0.03
        });
      }
      startAurora();
    }

    heroEl.addEventListener('mousemove', e => stirAt(e.clientX, e.clientY), { passive: true });
    heroEl.addEventListener('touchmove', e => {
      const t = e.touches[0];
      if (t) stirAt(t.clientX, t.clientY);
    }, { passive: true });
    heroEl.addEventListener('pointerdown', e => burstAt(e.clientX, e.clientY), { passive: true });
    heroEl.addEventListener('mouseleave', () => { haveLast = false; });

    function drawAurora() {
      if (!aVisible) { aRunning = false; return; }
      const w = auroraCanvas.width, h = auroraCanvas.height;
      actx.clearRect(0, 0, w, h);
      actx.globalCompositeOperation = 'lighter';   // additive → luminous glow
      for (const p of wisps) {
        p.sway += p.swaySpeed;
        p.x += p.vx + Math.sin(p.sway) * 0.5 + auroraWind * 0.7;
        p.y += p.vy;
        p.vy *= 0.99;
        p.life -= p.decay;
        const a = Math.max(0, p.life);
        const d = (p.r + (1 - p.life) * p.r * 0.5) * 2;
        // taller than wide → vertical aurora rays rather than round blobs
        const wd = d * 0.6, hd = d * 1.7;
        actx.globalAlpha = a * 0.5;
        actx.drawImage(p.sprite, p.x - wd / 2, p.y - hd / 2, wd, hd);
      }
      // expanding rings from click/tap bursts
      for (const b of bursts) {
        b.r += 6;
        b.life -= 0.025;
        actx.globalAlpha = Math.max(0, b.life) * 0.5;
        actx.strokeStyle = 'rgba(126, 240, 200, 1)';
        actx.lineWidth = 2.5;
        actx.beginPath();
        actx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        actx.stroke();
      }
      actx.globalAlpha = 1;
      actx.globalCompositeOperation = 'source-over';

      wisps = wisps.filter(p => p.life > 0 && p.y > -70);
      bursts = bursts.filter(b => b.life > 0);
      // animate only while there is something to draw; otherwise sleep
      if (wisps.length || bursts.length) requestAnimationFrame(drawAurora);
      else aRunning = false;
    }
    function startAurora() {
      if (!aRunning && aVisible) { aRunning = true; requestAnimationFrame(drawAurora); }
    }

    // Gentle idle "breathing" on a sparse timer (not a per-frame loop), so the
    // canvas can sleep between interactions instead of running continuously.
    function scheduleIdle() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (aVisible && !document.hidden) {
          spawnWisp(auroraCanvas.width * (0.12 + Math.random() * 0.76),
                    auroraCanvas.height * (0.05 + Math.random() * 0.28), 0, 1);
          startAurora();
        }
        scheduleIdle();
      }, (isSmall ? 4200 : 3200) + Math.random() * 2200);
    }

    new IntersectionObserver(([entry]) => {
      aVisible = entry.isIntersecting;
      if (aVisible) { startAurora(); scheduleIdle(); }
      else { clearTimeout(idleTimer); idleTimer = null; }
    }, { threshold: 0 }).observe(heroEl);
    startAurora();
    scheduleIdle();
  }

  // ---------- DEVICE TILT (mobile gyro parallax) ----------
  // On phones, tilting the device drifts the aurora and nudges the skyline,
  // bringing the hero's depth-parallax to touch devices. iOS needs a one-time
  // motion permission, requested on the first tap.
  if (isTouch && !reduceMotion) {
    const gAurora = document.querySelector('.hero-aurora');
    const gRidges = Array.prototype.slice.call(document.querySelectorAll('.hero-ridge'));
    let tgx = 0, tgy = 0, cgx = 0, cgy = 0, gRunning = false;

    function onOrient(e) {
      if (e.gamma == null && e.beta == null) return;
      tgx = Math.max(-1, Math.min(1, (e.gamma || 0) / 35));        // left-right
      tgy = Math.max(-1, Math.min(1, ((e.beta || 0) - 40) / 45));  // front-back
      startGyro();
    }
    function gyroLoop() {
      cgx += (tgx - cgx) * 0.08;
      cgy += (tgy - cgy) * 0.08;
      if (gAurora) gAurora.style.transform = `translate(${(cgx * 16).toFixed(1)}px, ${(cgy * 8).toFixed(1)}px)`;
      for (let i = 0; i < gRidges.length; i++) {
        const f = 16 - i * 4;
        gRidges[i].style.transform = `translate(${(cgx * f).toFixed(1)}px, ${(cgy * f * 0.4).toFixed(1)}px)`;
      }
      auroraWind = cgx * 1.4;   // tilt feeds the aurora canvas drift
      if (Math.abs(tgx - cgx) > 0.001 || Math.abs(tgy - cgy) > 0.001) {
        requestAnimationFrame(gyroLoop);
      } else {
        gRunning = false;
      }
    }
    function startGyro() { if (!gRunning) { gRunning = true; requestAnimationFrame(gyroLoop); } }
    function attachOrient() { window.addEventListener('deviceorientation', onOrient, { passive: true }); }

    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      // iOS 13+: must ask from a user gesture
      window.addEventListener('touchend', function () {
        DOE.requestPermission().then(s => { if (s === 'granted') attachOrient(); }).catch(() => {});
      }, { once: true, passive: true });
    } else if (DOE) {
      attachOrient();
    }
  }

  // ---------- AURORA STORM (hidden easter egg) ----------
  // A secret full-screen northern-lights reveal. Triggers: the Konami code
  // (↑↑↓↓←→←→ B A), typing "aurora" / "vifight", or 5 quick taps on the logo.
  (function auroraStorm() {
    const overlay = document.getElementById('aurora-storm-overlay');
    const canvas = document.getElementById('aurora-storm');
    if (!overlay || !canvas) return;
    const sctx = canvas.getContext('2d');
    let active = false;
    let rafId = 0;
    let bands = [];
    let sparks = [];
    let startT = 0;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    // Soft ascending shimmer. User-initiated (a keypress/tap), so this respects
    // browser autoplay policy. Wrapped in try/catch — silent if audio is blocked.
    function chime() {
      try {
        const AC = window.AudioContext;
        if (!AC) return;
        const ac = new AC();
        [392, 523.25, 659.25, 783.99].forEach((f, i) => {   // G4 C5 E5 G5
          const o = ac.createOscillator();
          const g = ac.createGain();
          o.type = 'sine';
          o.frequency.value = f;
          const t0 = ac.currentTime + i * 0.12;
          g.gain.setValueAtTime(0, t0);
          g.gain.linearRampToValueAtTime(0.06, t0 + 0.05);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
          o.connect(g).connect(ac.destination);
          o.start(t0);
          o.stop(t0 + 1.7);
        });
        setTimeout(() => { try { ac.close(); } catch (e) {} }, 2600);
      } catch (e) { /* audio unavailable — no-op */ }
    }

    function build() {
      const w = canvas.width, h = canvas.height;
      const cols = [
        [80, 240, 185], [120, 232, 216], [150, 205, 235], [196, 140, 228], [236, 132, 200]
      ];
      bands = [];
      const n = reduceMotion ? 2 : 4;
      for (let i = 0; i < n; i++) {
        bands.push({
          y: h * (0.12 + i * 0.14),
          h: h * (0.18 + Math.random() * 0.12),
          amp: h * (0.04 + Math.random() * 0.05),
          freq: 0.004 + Math.random() * 0.004,
          speed: 0.5 + Math.random() * 0.8,
          phase: Math.random() * Math.PI * 2,
          c: cols[i % cols.length],
          a: 0.5 + Math.random() * 0.5
        });
      }
      sparks = [];
      const sn = reduceMotion ? 0 : (isSmall ? 40 : 90);
      for (let i = 0; i < sn; i++) {
        sparks.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.8 + 0.4,
          v: 0.3 + Math.random() * 0.9,
          tw: Math.random() * Math.PI * 2
        });
      }
    }

    function frame(now) {
      if (!active) return;
      const w = canvas.width, h = canvas.height;
      const tt = (now - startT) / 1000;
      sctx.clearRect(0, 0, w, h);
      sctx.globalCompositeOperation = 'lighter';

      const step = Math.max(16, w / 48);
      for (const band of bands) {
        const g = sctx.createLinearGradient(0, band.y - band.amp, 0, band.y + band.h + band.amp);
        g.addColorStop(0,    `rgba(${band.c[0]},${band.c[1]},${band.c[2]},0)`);
        g.addColorStop(0.45, `rgba(${band.c[0]},${band.c[1]},${band.c[2]},${0.2 * band.a})`);
        g.addColorStop(1,    `rgba(${band.c[0]},${band.c[1]},${band.c[2]},0)`);
        sctx.fillStyle = g;
        sctx.beginPath();
        sctx.moveTo(0, band.y + band.h);
        for (let x = 0; x <= w; x += step) {
          const y = band.y
            + Math.sin(x * band.freq + tt * band.speed + band.phase) * band.amp
            + Math.sin(x * band.freq * 0.5 - tt * band.speed * 0.7) * band.amp * 0.4;
          sctx.lineTo(x, y);
        }
        for (let x = w; x >= 0; x -= step) {
          const y = band.y + band.h
            + Math.sin(x * band.freq + tt * band.speed + band.phase + 1) * band.amp * 0.8;
          sctx.lineTo(x, y);
        }
        sctx.closePath();
        sctx.fill();
      }

      for (const s of sparks) {
        s.y -= s.v;
        s.tw += 0.05;
        if (s.y < -5) { s.y = h + 5; s.x = Math.random() * w; }
        sctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(s.tw));
        sctx.fillStyle = 'rgba(232, 250, 245, 1)';
        sctx.beginPath();
        sctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        sctx.fill();
      }
      sctx.globalAlpha = 1;
      sctx.globalCompositeOperation = 'source-over';
      rafId = requestAnimationFrame(frame);
    }

    function trigger() {
      if (active) return;
      active = true;
      resize();
      build();
      chime();
      overlay.classList.add('active');
      requestAnimationFrame(() => overlay.classList.add('show-msg'));
      if (!reduceMotion) {
        startT = performance.now();
        rafId = requestAnimationFrame(frame);
      }
      setTimeout(() => overlay.classList.remove('show-msg'), 5600);
      setTimeout(() => overlay.classList.remove('active'), 6500);
      setTimeout(() => {
        active = false;
        if (rafId) cancelAnimationFrame(rafId);
        sctx.clearRect(0, 0, canvas.width, canvas.height);
      }, 7600);
    }

    resizeFns.push(() => { if (active) resize(); });

    // Konami code + typed-word triggers
    const konami = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];
    let kIdx = 0;
    let typed = '';
    document.addEventListener('keydown', (e) => {
      // close work modal on Escape
      const wm = document.getElementById('work-modal');
      if (e.key === 'Escape' && wm && wm.classList.contains('active')) {
        wm.classList.remove('active');
        wm.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        return;
      }
      // never hijack typing in form fields (e.g. the contact form)
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const code = e.keyCode || e.which;
      kIdx = (code === konami[kIdx]) ? kIdx + 1 : (code === konami[0] ? 1 : 0);
      if (kIdx === konami.length) { kIdx = 0; trigger(); }
      if (e.key && e.key.length === 1) {
        typed = (typed + e.key.toLowerCase()).slice(-7);
        if (typed.endsWith('aurora') || typed.endsWith('vifight')) trigger();
      }
    });

    // Mobile-friendly trigger: 5 quick taps on the logo
    const logo = document.querySelector('.nav-logo');
    if (logo) {
      let taps = 0, tapT = 0;
      logo.addEventListener('click', () => {
        const now = performance.now();
        taps = (now - tapT < 600) ? taps + 1 : 1;
        tapT = now;
        if (taps >= 5) { taps = 0; trigger(); }
      });
    }
  })();

  // ---------- PHILOSOPHY PARTICLES ----------
  const phCanvas = document.getElementById('philosophy-particles');
  if (phCanvas && phParticleCount > 0) {
    const phCtx = phCanvas.getContext('2d');
    const phSec = phCanvas.closest('.philosophy');
    let phParticles = [];
    let phActive = false;
    let phRunning = false;

    function resizePhCanvas() {
      phCanvas.width = phSec.offsetWidth;
      phCanvas.height = phSec.offsetHeight;
    }
    resizePhCanvas();
    resizeFns.push(resizePhCanvas);

    for (let i = 0; i < phParticleCount; i++) {
      phParticles.push({
        x: Math.random() * 1400,
        y: Math.random() * 800,
        r: Math.random() * 1.8 + 0.4,
        vx: (Math.random() - 0.5) * 0.15,
        vy: -Math.random() * 0.2 - 0.05,
        alpha: Math.random() * 0.4 + 0.1,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.015 + 0.005
      });
    }

    function drawPhParticles() {
      if (!phActive) { phRunning = false; return; }  // stop loop when offscreen
      phCtx.clearRect(0, 0, phCanvas.width, phCanvas.height);
      const w = phCanvas.width, h = phCanvas.height;
      for (const p of phParticles) {
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += p.pulseSpeed;
        const a = p.alpha * (0.5 + 0.5 * Math.sin(p.pulse));
        if (p.y < -10) p.y = h + 10;
        if (p.x < -10) p.x = w + 10;
        else if (p.x > w + 10) p.x = -10;

        phCtx.beginPath();
        phCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        phCtx.fillStyle = `rgba(224, 200, 165, ${a})`;
        phCtx.fill();
        phCtx.beginPath();
        phCtx.arc(p.x, p.y, p.r * 2.5, 0, Math.PI * 2);
        phCtx.fillStyle = `rgba(184, 148, 106, ${a * 0.12})`;
        phCtx.fill();
      }
      requestAnimationFrame(drawPhParticles);
    }

    // Activate / run only while section is on screen
    const phObserver = new IntersectionObserver(([entry]) => {
      phActive = entry.isIntersecting;
      if (phActive && !phRunning) { phRunning = true; requestAnimationFrame(drawPhParticles); }
    }, { threshold: 0.1 });
    phObserver.observe(phSec);
  }

  // ---------- HERO TITLE 3D TILT ----------
  // Skip entirely on touch devices (no hover) and for reduced-motion users.
  const heroTitle = document.querySelector('.hero-title');
  const heroSectionEl = document.getElementById('hero');
  if (heroTitle && heroSectionEl && !isTouch && !reduceMotion) {
    const maxRotate = 12;
    let tiltX = 0, tiltY = 0, currentX = 0, currentY = 0;
    let tiltVisible = true;
    let tiltRunning = false;

    // Depth-parallax layers: nearer layers travel further with the pointer
    const plxLayers = [
      { el: document.querySelector('.hero-ridge-1'), fx: 26, fy: 12 },
      { el: document.querySelector('.hero-ridge-2'), fx: 16, fy: 8 },
      { el: document.querySelector('.hero-ridge-3'), fx: 9,  fy: 5 },
      { el: document.querySelector('.hero-aurora'),  fx: -14, fy: -7 },
      { el: document.querySelector('.hero-sunset'),  fx: 6,  fy: 3 }
    ].filter(l => l.el);

    heroSectionEl.addEventListener('mousemove', (e) => {
      const rect = heroSectionEl.getBoundingClientRect();
      const cx = (e.clientX - rect.left) / rect.width - 0.5;
      const cy = (e.clientY - rect.top) / rect.height - 0.5;
      tiltX = cy * -maxRotate;
      tiltY = cx * maxRotate;
      startTilt();
    }, { passive: true });

    heroSectionEl.addEventListener('mouseleave', () => {
      tiltX = 0;
      tiltY = 0;
    });

    function animateTilt() {
      // Stop the loop once it has settled back to rest and there's no target.
      if (!tiltVisible) { tiltRunning = false; return; }
      currentX += (tiltX - currentX) * 0.08;
      currentY += (tiltY - currentY) * 0.08;
      heroTitle.style.transform =
        `perspective(800px) rotateX(${currentX.toFixed(2)}deg) rotateY(${currentY.toFixed(2)}deg)`;
      // drive the scenery with the same eased pointer values (-1..1)
      const nx = currentY / maxRotate, ny = -currentX / maxRotate;
      for (const l of plxLayers) {
        l.el.style.transform = `translate(${(nx * l.fx).toFixed(1)}px, ${(ny * l.fy).toFixed(1)}px)`;
      }
      const settled = Math.abs(tiltX - currentX) < 0.01 && Math.abs(tiltY - currentY) < 0.01 &&
                      Math.abs(tiltX) < 0.01 && Math.abs(tiltY) < 0.01;
      if (settled) { tiltRunning = false; return; }
      requestAnimationFrame(animateTilt);
    }
    function startTilt() {
      if (!tiltRunning && tiltVisible) { tiltRunning = true; requestAnimationFrame(animateTilt); }
    }

    const tiltObserver = new IntersectionObserver(([entry]) => {
      tiltVisible = entry.isIntersecting;
      if (tiltVisible) startTilt();
    }, { threshold: 0 });
    tiltObserver.observe(heroSectionEl);
  }

  // ---------- DARK SECTION CURSOR ----------
  // Switch cursor to white when mouse is hovering over a dark-background section.
  // Reuses mouseX / mouseY from CUSTOM CURSOR section above. Any section that
  // sits on a dark background should match here (add .bg-dark to future ones).
  const darkSections = [...document.querySelectorAll('.hero, .philosophy, .footer, .home-section, .bg-dark')];
  let darkRects = [];
  let isOnDark = false;

  // Rects are cached and only refreshed on scroll/resize (see onScrollFrame and
  // the unified resize), so the pointer handler's checkDark() is a cheap
  // arithmetic test with no per-move getBoundingClientRect / layout read.
  function computeDarkRects() {
    darkRects = darkSections
      .map(s => s.getBoundingClientRect())
      .filter(r => r.width > 0 && r.height > 0);
  }
  function checkDark() {
    let onDark = false;
    for (const r of darkRects) {
      if (mouseY >= r.top && mouseY <= r.bottom && mouseX >= r.left && mouseX <= r.right) { onDark = true; break; }
    }
    if (onDark !== isOnDark) {
      isOnDark = onDark;
      document.body.classList.toggle('on-dark', onDark);
    }
  }
  computeDarkRects();
  resizeFns.push(() => { computeDarkRects(); checkDark(); });
  // Initial: assume hero (top) is dark
  document.body.classList.add('on-dark');
  isOnDark = true;

  // ---------- WORKS CURSOR SPOTLIGHT ----------
  // A warm glow inside each work card tracks the pointer (CSS vars --mx/--my).
  const worksGrid = document.querySelector('.works-grid');
  if (worksGrid && !isTouch) {
    worksGrid.addEventListener('mousemove', (e) => {
      const item = e.target.closest('.work-item');
      if (!item) return;
      const img = item.querySelector('.work-image');
      if (!img) return;
      const r = img.getBoundingClientRect();
      img.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
      img.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
    }, { passive: true });
  }

  // ---------- DARK CARD AURORA GLOW ----------
  // Same pattern as the works spotlight: an aurora glow inside the dark home
  // cards follows the pointer (only fires while hovering those grids).
  if (!isTouch) {
    document.querySelectorAll('.strength-grid, .home-services').forEach(grid => {
      grid.addEventListener('mousemove', (e) => {
        const card = e.target.closest('.strength-card, .home-service');
        if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
      }, { passive: true });
    });
  }

  // ---------- CLICK RIPPLE ----------
  // A soft aurora ripple blooms from the click point on primary buttons.
  if (!reduceMotion) {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.home-cta-btn, .tab-callout-btn, .form-submit, .nav-cta, .tab-pager-link');
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const r = document.createElement('span');
      r.className = 'fx-ripple';
      r.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px;`;
      btn.appendChild(r);
      r.addEventListener('animationend', () => r.remove());
    });
  }

  // ---------- PAUSE SKY ANIMATIONS OFFSCREEN ----------
  // Aurora bands keep compositing even offscreen; pause them when their
  // section scrolls out of view.
  document.querySelectorAll('.hero, .philosophy').forEach(sec => {
    new IntersectionObserver(([e]) => {
      sec.classList.toggle('offstage', !e.isIntersecting);
    }, { threshold: 0 }).observe(sec);
  });

  // ---------- WORK MODAL ----------
  const workData = {
    '1': {
      cat: 'ポータルサイト',
      label: 'Portal Site',
      title: '求人ポータルサイト構築・運営',
      year: '2024 — 継続中',
      desc: '地域企業の採用課題に応えるため、求人ポータルサイトを企画・設計・開発から運営まで一貫して担当。応募導線の最適化と検索性の高いUIにより、掲載企業からの継続率を高めています。',
      meta: { Service: 'ポータルサイト構築・運営', Scope: '企画 / 設計 / 開発 / 運営', Period: '2024年〜継続中' },
      img: 'assets/images/works/portal-job.jpg'
    },
    '2': {
      cat: 'HP制作',
      label: 'HP Renewal',
      title: '印刷会社コーポレートサイト',
      year: '2024',
      desc: '徹底したヒアリングをもとに、強みと想いを「自分たちの言葉」で伝えるコーポレートサイトへリニューアル。公開後、月0件だった問い合わせが毎月10件以上へと変化しました。',
      meta: { Service: 'コーポレートサイト制作', Result: '問い合わせ 0 → 10件 / 月', Period: '2024年' },
      img: 'assets/images/works/print-company.jpg'
    },
    '3': {
      cat: '映像制作',
      label: 'Brand Movie',
      title: '飲食店ブランディング映像',
      year: '2024',
      desc: '店主の哲学と料理が生まれる瞬間を、シネマカメラで丁寧に捉えたブランディング映像。映像越しに「行ってみたい」と感じてもらえる空気感を大切に制作しました。',
      meta: { Service: 'ブランディング映像', Equipment: 'シネマカメラ', Period: '2024年' },
      img: 'assets/images/works/restaurant-movie.jpg'
    },
    '4': {
      cat: 'HP制作',
      label: 'Web Site',
      title: '飲食店コーポレートサイト',
      year: '2025',
      desc: '料理の世界観とお店の温度感を一枚一枚に込めたコーポレートサイト。予約導線とSNS連携を整理し、来店までの体験をシームレスに設計しました。',
      meta: { Service: 'コーポレートサイト制作', Scope: '設計 / デザイン / 実装', Period: '2025年' },
      img: 'assets/images/works/restaurant-site.jpg'
    },
    '5': {
      cat: '映像制作',
      label: 'Drone Shoot',
      title: '空撮プロモーション映像',
      year: '2025',
      desc: '国家資格保有者によるドローン撮影で、地域の風景を上空から捉えたプロモーション映像。視点の高さでしか伝えられないスケール感を演出しました。',
      meta: { Service: '空撮プロモーション映像', Equipment: 'ドローン（国家資格）', Period: '2025年' },
      img: 'assets/images/works/drone-aerial.jpg'
    },
    '6': {
      cat: 'ポータルサイト',
      label: 'Portal Site',
      title: '地域情報ポータル開発・運営',
      year: '2025 — 継続中',
      desc: '地域の魅力を発信し続けるための情報ポータルを開発・運営。地元の事業者と訪れる人をつなぐハブとして、継続的にコンテンツと機能を拡張しています。',
      meta: { Service: '地域情報ポータル', Scope: '開発 / コンテンツ / 運営', Period: '2025年〜継続中' },
      img: 'assets/images/works/portal-local.jpg'
    }
  };

  const workModal = document.getElementById('work-modal');
  if (workModal) {
    const modalCat = document.getElementById('work-modal-cat');
    const modalTitle = document.getElementById('work-modal-title');
    const modalYear = document.getElementById('work-modal-year');
    const modalDesc = document.getElementById('work-modal-desc');
    const modalLabel = document.getElementById('work-modal-label');
    const modalMeta = document.getElementById('work-modal-meta');
    const modalImg = document.getElementById('work-modal-img');

    const openWorkModal = (id) => {
      const data = workData[id];
      if (!data) return;
      modalCat.textContent = data.cat;
      modalTitle.textContent = data.title;
      modalYear.textContent = data.year;
      modalDesc.textContent = data.desc;
      modalLabel.textContent = data.label;
      if (modalImg) {
        if (data.img) {
          modalImg.src = data.img;
          modalImg.alt = data.title;
          modalImg.style.display = '';
        } else {
          modalImg.style.display = 'none';
        }
      }
      modalMeta.innerHTML = '';
      for (const [k, v] of Object.entries(data.meta)) {
        const div = document.createElement('div');
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        div.appendChild(dt);
        div.appendChild(dd);
        modalMeta.appendChild(div);
      }
      workModal.classList.add('active');
      workModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    };

    const closeWorkModal = () => {
      workModal.classList.remove('active');
      workModal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
    };

    document.querySelectorAll('.work-item[data-work-id]').forEach(item => {
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => openWorkModal(item.getAttribute('data-work-id')));
    });

    workModal.querySelectorAll('[data-modal-close]').forEach(el => {
      el.addEventListener('click', closeWorkModal);
    });
  }

  // (The Konami code now triggers the full Aurora Storm easter egg — see the
  // AURORA STORM module above. The old hue-rotate flash was removed so the two
  // effects don't fight over the same key sequence.)

});
