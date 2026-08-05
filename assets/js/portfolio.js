/* =============================================================
   ViFight — ポートフォリオ（案件一覧）
   ============================================================= */
import { PROJECTS, CATEGORIES } from './portfolio-data.js?v=20260805a';

const $ = (id) => document.getElementById(id);
const gridEl = $('pf-grid');
const filterEl = $('pf-filter');
let activeCat = 'すべて';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* 案件ごとの画像があれば使う。無ければブランド色のデザインカード。
   assets/images/portfolio/<slug>.jpg を置くだけで自動的に差し替わる。 */
function thumbMarkup(p, cls) {
  const src = `assets/images/portfolio/${p.slug}.jpg`;
  return `<img class="${cls}" src="${src}" alt="${esc(p.name)}" loading="lazy" decoding="async"
            onerror="this.remove()">`;
}

function cardMarkup(p, i) {
  return `
  <button type="button" class="pf-card pf-reveal" style="--c1:${p.c1};--c2:${p.c2};--ct:${p.ct};transition-delay:${(i % 3) * 70}ms"
          data-slug="${esc(p.slug)}" aria-label="${esc(p.name)}の詳細を見る">
    <span class="pf-thumb">
      ${thumbMarkup(p, 'pf-thumb-img')}
      <span class="pf-thumb-tag">${esc(p.category)}</span>
      <span class="pf-thumb-name">${esc(p.name)}<span class="pf-thumb-sub">${esc(p.jp)}</span></span>
    </span>
    <span class="pf-body">
      <span class="pf-cat">${esc(p.year)}</span>
      <span class="pf-name">${esc(p.tagline)}</span>
      <span class="pf-desc">${esc(p.summary.length > 82 ? p.summary.slice(0, 82) + '…' : p.summary)}</span>
      <span class="pf-stack">${p.stack.slice(0, 4).map((t) => `<span class="pf-tech">${esc(t)}</span>`).join('')}</span>
      <span class="pf-more">こだわりを見る <span aria-hidden="true">→</span></span>
    </span>
  </button>`;
}

function renderGrid() {
  const items = activeCat === 'すべて' ? PROJECTS : PROJECTS.filter((p) => p.category === activeCat);
  gridEl.innerHTML = items.map(cardMarkup).join('');
  gridEl.querySelectorAll('.pf-card').forEach((c) => {
    c.addEventListener('click', () => openModal(c.dataset.slug));
  });
  observeReveal();
}

function renderFilters() {
  filterEl.innerHTML = CATEGORIES.map((c) => {
    const n = c === 'すべて' ? PROJECTS.length : PROJECTS.filter((p) => p.category === c).length;
    if (!n) return '';
    return `<button type="button" class="pf-chip${c === activeCat ? ' is-active' : ''}" data-cat="${esc(c)}">${esc(c)} <span style="opacity:.6">${n}</span></button>`;
  }).join('');
  filterEl.querySelectorAll('.pf-chip').forEach((b) => {
    b.addEventListener('click', () => { activeCat = b.dataset.cat; renderFilters(); renderGrid(); });
  });
}

/* ---------- reveal ---------- */
let io = null;
function observeReveal() {
  const els = gridEl.querySelectorAll('.pf-reveal');
  if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
  if (!io) {
    io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -60px 0px', threshold: 0.08 });
  }
  els.forEach((e) => io.observe(e));
}

/* ---------- modal ---------- */
const modal = $('pf-modal');
const mBody = $('pf-modal-content');
let lastFocus = null;

function openModal(slug) {
  const p = PROJECTS.find((x) => x.slug === slug);
  if (!p) return;
  lastFocus = document.activeElement;
  mBody.innerHTML = `
    <div class="pf-m-hero" style="--c1:${p.c1};--c2:${p.c2};--ct:${p.ct}">
      ${thumbMarkup(p, 'pf-m-hero-img')}
      <h2 class="pf-m-hero-name">${esc(p.name)}</h2>
    </div>
    <div class="pf-m-body">
      <p class="pf-m-cat">${esc(p.category)}</p>
      <h3 class="pf-m-title">${esc(p.tagline)}</h3>
      <p class="pf-m-year">${esc(p.jp)}　/　${esc(p.year)}</p>
      <p class="pf-m-desc">${esc(p.summary)}</p>

      <section class="pf-m-sec">
        <h3>こだわったところ</h3>
        <div class="pf-points">
          ${p.points.map((pt) => `
            <div class="pf-point">
              <p class="pf-point-h">${esc(pt.h)}</p>
              <p class="pf-point-p">${esc(pt.p)}</p>
            </div>`).join('')}
        </div>
      </section>

      <section class="pf-m-sec">
        <h3>主な機能</h3>
        <ul class="pf-feat">${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      </section>

      <section class="pf-m-sec">
        <h3>使用技術</h3>
        <div class="pf-m-stack">${p.stack.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
      </section>

      <div class="pf-m-actions">
        ${p.url ? `<a class="pf-m-btn" href="${esc(p.url)}" target="_blank" rel="noopener">サイトを見る <span aria-hidden="true">↗</span></a>` : ''}
        <a class="pf-m-btn pf-m-btn--ghost" href="index.html#contact">似た制作を相談する</a>
      </div>
    </div>`;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  $('pf-modal-close').focus();
}

function closeModal() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (lastFocus) lastFocus.focus();
}

modal.querySelectorAll('[data-pf-close]').forEach((b) => b.addEventListener('click', closeModal));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
});

/* ---------- init ---------- */
$('pf-count').textContent = PROJECTS.length;
renderFilters();
renderGrid();
