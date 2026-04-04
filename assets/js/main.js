/* ============================================
   ViFight — Main JavaScript (Optimized)
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ---------- LOADING SCREEN ----------
  const loader = document.getElementById('loader');

  window.addEventListener('load', () => {
    setTimeout(() => {
      loader.classList.add('loaded');
      document.body.style.overflow = '';
      setTimeout(() => {
        document.getElementById('hero').classList.add('visible');
      }, 300);
    }, 2500);
  });

  document.body.style.overflow = 'hidden';

  // ---------- CUSTOM CURSOR ----------
  const cursor = document.getElementById('cursor');
  const follower = document.getElementById('cursor-follower');
  let mouseX = 0, mouseY = 0;
  let followerX = 0, followerY = 0;

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    cursor.style.transform = `translate(calc(${mouseX}px - 50%), calc(${mouseY}px - 50%))`;
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
  let particles = [];
  trailCanvas.width = window.innerWidth;
  trailCanvas.height = window.innerHeight;
  window.addEventListener('resize', () => {
    trailCanvas.width = window.innerWidth;
    trailCanvas.height = window.innerHeight;
  }, { passive: true });

  let lastTrailTime = 0;
  document.addEventListener('mousemove', (e) => {
    const now = Date.now();
    if (now - lastTrailTime < 80) return;
    lastTrailTime = now;
    particles.push({ x: e.clientX, y: e.clientY, life: 1, vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5 });
    if (particles.length > 12) particles.shift();
  }, { passive: true });

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
  const progressBar = document.createElement('div');
  progressBar.style.cssText = 'position:fixed;top:0;left:0;height:2px;background:linear-gradient(90deg,var(--accent-warm),var(--accent));z-index:10001;width:0%;pointer-events:none;';
  document.body.appendChild(progressBar);

  const parallaxEls = [...document.querySelectorAll('[data-parallax]')].map(el => ({
    el,
    speed: parseFloat(el.getAttribute('data-parallax'))
  }));

  const scrollMarquee = document.querySelector('[data-scroll-speed]');
  let marqueeWidth = 0;
  let marqueePos = 0;
  let lastScrollY = window.scrollY;
  let currentScrollY = lastScrollY;
  let ticking = false;

  window.addEventListener('scroll', () => {
    currentScrollY = window.scrollY;
    if (!ticking) {
      requestAnimationFrame(onScrollFrame);
      ticking = true;
    }
  }, { passive: true });

  function onScrollFrame() {
    const scrollY = currentScrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    header.classList.toggle('scrolled', scrollY > 80);
    progressBar.style.width = ((scrollY / docHeight) * 100) + '%';
    for (const { el, speed } of parallaxEls) {
      const rect = el.getBoundingClientRect();
      const center = rect.top + rect.height / 2 - window.innerHeight / 2;
      el.style.transform = `translateY(${center * speed}px)`;
    }
    lastScrollY = scrollY;
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

    // 3. Marquee
    if (scrollMarquee && marqueeWidth > 0) {
      marqueePos -= 1;
      if (Math.abs(marqueePos) >= marqueeWidth) marqueePos = 0;
      scrollMarquee.style.transform = `translateX(${marqueePos}px)`;
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

  // ---------- SMOOTH SCROLL ----------
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
      }
    });
  });

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
    const target = parseInt(el.getAttribute('data-count'));
    const start = performance.now();
    const duration = 2000;
    function update(now) {
      const progress = Math.min((now - start) / duration, 1);
      el.textContent = Math.floor(target * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) requestAnimationFrame(update);
      else el.textContent = target;
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

  // ---------- FORM ----------
  const form = document.querySelector('.contact-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = form.querySelector('.form-submit');
      btn.innerHTML = '<span>送信完了</span>';
      btn.style.cssText += 'background:var(--accent-warm);color:var(--white);border-color:var(--accent-warm);';
      setTimeout(() => {
        btn.innerHTML = `<span>送信する</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
        btn.style.background = btn.style.color = btn.style.borderColor = '';
        form.reset();
      }, 3000);
    });
    form.querySelectorAll('input, textarea, select').forEach(input => {
      input.addEventListener('focus', () => input.parentElement.classList.add('focused'));
      input.addEventListener('blur', () => { if (!input.value) input.parentElement.classList.remove('focused'); });
    });
  }

  // ---------- EASTER EGG: KONAMI CODE ----------
  const konamiCode = [38,38,40,40,37,39,37,39,66,65];
  let konamiIndex = 0;
  document.addEventListener('keydown', (e) => {
    konamiIndex = e.keyCode === konamiCode[konamiIndex] ? konamiIndex + 1 : 0;
    if (konamiIndex === konamiCode.length) {
      document.body.style.cssText += 'transition:filter 0.5s;filter:hue-rotate(180deg);';
      setTimeout(() => { document.body.style.filter = ''; }, 3000);
      konamiIndex = 0;
    }
  });

});
