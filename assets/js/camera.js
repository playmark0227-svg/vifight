/* =============================================================
   ViFight — スクロール連動カメラ演出
   -------------------------------------------------------------
   スクロール量 = 映像の再生位置。ページは流れず、動くのはカメラだけ。
   §4-1 の基本モデルと §6 の実装仕様に従う。
   ============================================================= */
'use strict';

/* ---- §4-2 パラメータ ---- */
const PARAMS = {
  EASE: 0.10,        // ?ease= で 0.06〜0.14 を試せる（実機で決定するため）
  MAX_STEP: 0.012,   // 1フレームあたりの進行上限。慣性の暴走止め
};
const q = new URLSearchParams(location.search);
const easeQ = parseFloat(q.get('ease'));
if (easeQ >= 0.06 && easeQ <= 0.14) PARAMS.EASE = easeQ;

const IS_MOBILE = window.matchMedia('(max-width: 759px)').matches;
const SET = IS_MOBILE
  ? { dir: 'assets/frames/mobile', total: 216 }
  : { dir: 'assets/frames/pc',     total: 360 };

const PRIORITY = Math.min(SET.total, Math.ceil(SET.total / 7)); // 第1章ぶん
const CONCURRENCY = 6;

/* ---- 章（§3）。tはフレーム位置に対する割合 ---- */
const CHAPTERS = [
  { n: '00', a: 0.000, b: 0.143 },
  { n: '01', a: 0.143, b: 0.286 },
  { n: '02', a: 0.286, b: 0.429 },
  { n: '03', a: 0.429, b: 0.571 },
  { n: '04', a: 0.571, b: 0.714 },
  { n: '05', a: 0.714, b: 0.857 },
  { n: '06', a: 0.857, b: 1.001 },
];
const ENTER = 0.12, EXIT = 0.10;   // §4-2

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const canvas = $('#cam');
const ctx = canvas.getContext('2d', { alpha: false });
const stage = $('#stage');

const frames = new Array(SET.total).fill(null);   // ImageBitmap
let loadedCount = 0, maxReady = -1;
let target = 0, cur = 0, lastCur = 0, speed = 0;
let curChapter = -1, hintHidden = false, started = false;

/* ---------- 読み込み（§6-2 三段構え） ---------- */
function url(i) { return `${SET.dir}/f_${String(i + 1).padStart(4, '0')}.webp`; }

async function fetchFrame(i) {
  if (frames[i]) return;
  try {
    const res = await fetch(url(i), { cache: 'force-cache' });
    if (!res.ok) throw new Error(res.status);
    const blob = await res.blob();
    /* デコード済みで保持する。<img> のままだと毎回デコードが走る */
    frames[i] = await createImageBitmap(blob);
    loadedCount++;
    while (maxReady + 1 < SET.total && frames[maxReady + 1]) maxReady++;
  } catch (_) { /* 1枚落ちても止めない */ }
}

async function runQueue(list) {
  let cursor = 0;
  const worker = async () => {
    while (cursor < list.length) { await fetchFrame(list[cursor++]); }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

async function boot() {
  await fetchFrame(0);            // ここまでが LCP
  draw(true);
  document.body.classList.add('is-first-frame');

  const head = Array.from({ length: PRIORITY }, (_, i) => i).filter(i => i !== 0);
  await runQueue(head);
  started = true;
  document.body.classList.add('is-ready');

  const rest = [];
  for (let i = PRIORITY; i < SET.total; i++) rest.push(i);
  runQueue(rest);                  // 背景で継続。待たない
}

/* ---------- 描画（§6-3） ---------- */
let lastDrawn = -1, dpr = 1;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(stage.clientWidth * dpr);
  canvas.height = Math.round(stage.clientHeight * dpr);
  lastDrawn = -1;
  draw(true);
}

function pickFrame(t) {
  const want = Math.round(t * (SET.total - 1));
  if (frames[want]) return want;
  /* 未取得なら、取得済みの直近を出したまま進捗だけ進める（固まらせない） */
  for (let d = 1; d <= 24; d++) {
    if (frames[want - d]) return want - d;
    if (frames[want + d]) return want + d;
  }
  return maxReady >= 0 ? maxReady : 0;
}

function draw(force) {
  const idx = pickFrame(cur);
  if (!force && idx === lastDrawn) return;
  const bmp = frames[idx];
  if (!bmp) return;
  lastDrawn = idx;

  const cw = canvas.width, chh = canvas.height;
  /* cover 配置 */
  const s = Math.max(cw / bmp.width, chh / bmp.height);
  const w = bmp.width * s, h = bmp.height * s;
  ctx.drawImage(bmp, (cw - w) / 2, (chh - h) / 2, w, h);

  /* §2-6 E 速度で絵が変わる。フレームには焼き込めないので実行時に合成する */
  const sp = clamp(speed / 0.010, 0, 1);
  if (sp > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cw / 2, chh * 0.46, 0, cw / 2, chh * 0.46, chh * 0.9);
    g.addColorStop(0, `rgba(232,217,160,${0.13 * sp})`);
    g.addColorStop(0.5, `rgba(201,162,39,${0.05 * sp})`);
    g.addColorStop(1, 'rgba(201,162,39,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, chh);   // 上限を設け、高速でも白飛びさせない
    ctx.restore();
  }
}

/* ---------- 前景UI（§7） ---------- */
const elCh = $$('.cam-chip');
const elCopy = $('#copy');
const elNum = $('#copy-num');
const elTitle = $('#copy-title');
const elNote = $('#copy-note');
const elBar = $('#bar-fill');
const elHint = $('#hint');
const elLoad = $('#loadbar');
const COPY = JSON.parse($('#chapter-data').textContent);

function chapterAt(t) {
  for (let i = CHAPTERS.length - 1; i >= 0; i--) if (t >= CHAPTERS[i].a) return i;
  return 0;
}

function updateUI(t) {
  const ci = chapterAt(t);
  if (ci !== curChapter) {
    curChapter = ci;
    const c = COPY[ci];
    elCopy.classList.add('is-out');
    setTimeout(() => {
      elNum.textContent = CHAPTERS[ci].n;
      elTitle.textContent = c.title;
      elNote.textContent = c.note;
      elCopy.classList.remove('is-out');
    }, 130);
    elCh.forEach((b, i) => b.classList.toggle('is-on', i === ci));
    document.body.dataset.chapter = CHAPTERS[ci].n;
    try {
      window.dispatchEvent(new CustomEvent('chapter_reach', { detail: { chapter: CHAPTERS[ci].n } }));
    } catch (_) {}
  }
  /* 章内での出入り（§4-2 CHAPTER_ENTER / EXIT） */
  const c = CHAPTERS[ci];
  const local = (t - c.a) / (c.b - c.a);
  let a = 1;
  if (local < ENTER) a = local / ENTER;
  else if (local > 1 - EXIT) a = (1 - local) / EXIT;
  elCopy.style.opacity = String(clamp(a, 0, 1));
  elCopy.style.transform = `translateY(${(1 - clamp(a, 0, 1)) * 7}px)`;

  elBar.style.transform = `scaleY(${t})`;
  if (!hintHidden && t > 0.01) { hintHidden = true; elHint.classList.add('is-gone'); }
  const p = loadedCount / SET.total;
  elLoad.style.transform = `scaleX(${p})`;
  if (p >= 0.999) elLoad.classList.add('is-done');
}

/* ---------- ループ（§6-3 rAF 1本） ---------- */
const spacerEl = document.querySelector('.spacer');
function scrubRange() {
  const h = spacerEl ? spacerEl.offsetHeight : document.documentElement.scrollHeight;
  return Math.max(1, h - window.innerHeight);
}
function readScroll() {
  target = clamp(window.scrollY / scrubRange(), 0, 1);
}

function tick() {
  let d = (target - cur) * PARAMS.EASE;
  if (d > PARAMS.MAX_STEP) d = PARAMS.MAX_STEP;
  else if (d < -PARAMS.MAX_STEP) d = -PARAMS.MAX_STEP;
  cur += d;
  speed = speed * 0.82 + Math.abs(cur - lastCur) * 0.18;
  lastCur = cur;
  const past = window.scrollY > scrubRange() + window.innerHeight * 0.2;
  document.body.classList.toggle('is-past', past);
  if (!past) { draw(false); updateUI(cur); }
  requestAnimationFrame(tick);
}

/* ---------- 章ナビ ---------- */
elCh.forEach((btn, i) => {
  btn.addEventListener('click', () => {
    const mid = CHAPTERS[i].a + (CHAPTERS[i].b - CHAPTERS[i].a) * 0.34;
    window.scrollTo({ top: mid * scrubRange(), behavior: 'smooth' });
  });
});

/* ---------- 起動 ---------- */
let rt;
window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); });
window.addEventListener('scroll', readScroll, { passive: true });

resize();
readScroll();
cur = target;
boot();
requestAnimationFrame(tick);
