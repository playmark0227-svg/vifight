/* =============================================================
   ViFight — 実績ページ（公開ギャラリー）
   Firestore から投稿を読み込み、既存実績と合わせてインスタ風に表示。
   Firebase 未設定でも、既存実績だけで動作する。
   ============================================================= */
import { firebaseConfig, isConfigured, WORKS_COLLECTION } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

/* 既存の常設実績（Firebase 未設定でも必ず表示される土台） */
const BASE_WORKS = [
  { image: 'assets/images/works/portal-job.jpg',      category: 'ポータルサイト', title: '求人ポータルサイト構築・運営', meta: '2024 — 継続中' },
  { image: 'assets/images/works/print-company.jpg',   category: 'HP制作',        title: '印刷会社コーポレートサイト',   meta: '2024 — 問い合わせ0→月10件' },
  { image: 'assets/images/works/restaurant-movie.jpg', category: '映像制作',      title: '飲食店ブランディング映像',     meta: '2024' },
  { image: 'assets/images/works/restaurant-site.jpg',  category: 'HP制作',        title: '飲食店コーポレートサイト',     meta: '2025' },
  { image: 'assets/images/works/drone-aerial.jpg',     category: '映像制作',      title: '空撮プロモーション映像',       meta: '2025' },
  { image: 'assets/images/works/portal-local.jpg',     category: 'ポータルサイト', title: '地域情報ポータル開発・運営',   meta: '2025 — 継続中' },
];

const gridEl   = document.getElementById('works-grid');
const statusEl  = document.getElementById('works-status');
const filterEl = document.getElementById('works-filter');

let ALL = [];
let activeCat = 'すべて';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

async function loadFirestoreWorks() {
  if (!isConfigured()) return [];
  try {
    const [{ initializeApp }, fs] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    const app = initializeApp(firebaseConfig);
    const db = fs.getFirestore(app);
    const q = fs.query(fs.collection(db, WORKS_COLLECTION), fs.orderBy('createdAt', 'desc'));
    const snap = await fs.getDocs(q);
    return snap.docs.map((d) => {
      const v = d.data() || {};
      return {
        image: v.imageUrl || '',
        category: v.category || 'その他',
        title: v.caption || v.title || '',
        meta: v.client ? `${v.client}` : (v.date || ''),
      };
    }).filter((w) => w.image);
  } catch (err) {
    console.warn('Firestore の読み込みに失敗しました:', err);
    return [];
  }
}

function buildFilters() {
  const cats = ['すべて', ...Array.from(new Set(ALL.map((w) => w.category)))];
  filterEl.innerHTML = cats.map((c) =>
    `<button type="button" class="wf-chip${c === activeCat ? ' is-active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`
  ).join('');
  filterEl.querySelectorAll('.wf-chip').forEach((b) => {
    b.addEventListener('click', () => { activeCat = b.dataset.cat; buildFilters(); renderGrid(); });
  });
}

function renderGrid() {
  const items = activeCat === 'すべて' ? ALL : ALL.filter((w) => w.category === activeCat);
  if (!items.length) { gridEl.innerHTML = '<p class="works-empty">まだ実績がありません。</p>'; return; }
  gridEl.innerHTML = items.map((w, i) => `
    <button type="button" class="work-tile" data-i="${ALL.indexOf(w)}" aria-label="${esc(w.title)}">
      <img src="${esc(w.image)}" alt="${esc(w.title)}" loading="lazy" decoding="async">
      <span class="work-tile-overlay">
        <span class="work-tile-cat">${esc(w.category)}</span>
        <span class="work-tile-title">${esc(w.title)}</span>
      </span>
    </button>`).join('');
  gridEl.querySelectorAll('.work-tile').forEach((t) => {
    t.addEventListener('click', () => openLightbox(parseInt(t.dataset.i, 10)));
  });
}

/* ---------- Lightbox ---------- */
const lb = document.getElementById('lightbox');
const lbImg = document.getElementById('lb-img');
const lbCat = document.getElementById('lb-cat');
const lbTitle = document.getElementById('lb-title');
const lbMeta = document.getElementById('lb-meta');
let lbIndex = -1;

function openLightbox(i) {
  lbIndex = i;
  const w = ALL[i];
  if (!w) return;
  lbImg.src = w.image; lbImg.alt = w.title;
  lbCat.textContent = w.category;
  lbTitle.textContent = w.title;
  lbMeta.textContent = w.meta || '';
  lbMeta.style.display = w.meta ? '' : 'none';
  lb.classList.add('open');
  lb.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  lb.classList.remove('open');
  lb.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}
function step(dir) {
  if (lbIndex < 0) return;
  lbIndex = (lbIndex + dir + ALL.length) % ALL.length;
  openLightbox(lbIndex);
}
lb.querySelectorAll('[data-lb-close]').forEach((b) => b.addEventListener('click', closeLightbox));
document.getElementById('lb-prev').addEventListener('click', () => step(-1));
document.getElementById('lb-next').addEventListener('click', () => step(1));
document.addEventListener('keydown', (e) => {
  if (!lb.classList.contains('open')) return;
  if (e.key === 'Escape') closeLightbox();
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
});

/* ---------- init ---------- */
(async function init() {
  // まず既存実績で即描画（体感速度）
  ALL = [...BASE_WORKS];
  buildFilters(); renderGrid();
  statusEl.textContent = isConfigured() ? '最新の投稿を読み込み中…' : '';

  const posts = await loadFirestoreWorks();
  if (posts.length) {
    ALL = [...posts, ...BASE_WORKS];   // 新しい投稿を先頭に
    buildFilters(); renderGrid();
  }
  statusEl.textContent = '';
})();
