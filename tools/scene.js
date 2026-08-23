/* =============================================================
   ViFight — 工房空間シーンレンダラー
   -------------------------------------------------------------
   指示書 §2「奥へ続く工房」を、canvas 2D の手動透視投影で描く。
   drawScene(ctx, t, W, H) の t は 0..1（通し1本の再生位置）。
   カットもディゾルブも存在しない：カメラのzが単調に進むだけ。
   ============================================================= */

const C = {
  navy900: '#0B1420',
  navy700: '#142337',
  navy500: '#24374F',
  gold500: '#C9A227',
  gold200: '#E8D9A0',
  paper:   '#F2EFE9',
};

/* 章ごとの部屋。zはカメラがその部屋の真横に来る位置 */
const ROOMS = [
  { ch: 1, z: 25.5, side: -1, kind: 'draft'  },  // 製図台
  { ch: 2, z: 46.4, side:  1, kind: 'board'  },  // 基板と端末
  { ch: 3, z: 67.4, side: -1, kind: 'studio' },  // 撮影ブース
  { ch: 4, z: 88.4, side:  1, kind: 'edit'   },  // 編集卓
  { ch: 5, z: 109.3, side: -1, kind: 'rack'  },  // サーバー室
];

const DOOR_Z = 4.5;      // 00 入口の扉
const DESK_Z = 133.5;    // 06 最奥の作業机
const CAM_START = -6;
const CAM_END   = 130.5;
const PULL_START = 0.94; // ここから一度だけ引く（§2-6 F）

const lerp  = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const smooth = (k) => k * k * (3 - 2 * k);
/* 0→1→0 の山。中心 c、幅 w */
const bump = (x, c, w) => {
  const k = clamp(1 - Math.abs(x - c) / w, 0, 1);
  return smooth(k);
};

/* カメラのz。0.94以降は一度だけ後退する（唯一の後退） */
function camZAt(t) {
  if (t <= PULL_START) return lerp(CAM_START, CAM_END, t / PULL_START);
  return CAM_END;   // 引きは合成側で表現し、空間内のカメラは止める
}

/* 通路の断面。03→04のあいだで一度だけ大空間に開ける（§2-6 C） */
function sectionAt(z) {
  const open = bump(z, 79, 9);
  return {
    halfW: lerp(1.85, 7.6, open),
    ceil:  lerp(-1.62, -9.2, open),
    floor: lerp(1.62, 2.2, open),
    open,
  };
}

/* 手持ちの微振動。完全な直線移動は無機質になりすぎる（§2-2） */
function handheld(t) {
  const p = t * 62;
  return {
    x: Math.sin(p * 0.9) * 3.1 + Math.sin(p * 2.3) * 1.4,
    y: Math.cos(p * 0.7) * 2.6 + Math.sin(p * 1.7) * 1.1,
    roll: Math.sin(p * 0.5) * 0.0016,
  };
}

/* 先行する光の位置（§2-6 A）。カメラの数メートル先を走る */
function lightZAt(t) { return camZAt(t) + 11.5; }

function makeProjector(W, H, camZ, shake) {
  const cx = W / 2 + shake.x;
  const cy = H / 2 + shake.y;
  const focal = H * 0.95;
  return (x, y, z) => {
    const dz = z - camZ;
    if (dz <= 0.35) return null;
    const f = focal / dz;
    return { x: cx + x * f, y: cy + y * f, f, dz };
  };
}

/* 奥ほどネイビーに沈む */
function depthTint(dz) { return clamp(Math.pow(1 - clamp(dz / 82, 0, 1), 1.35), 0.05, 1); }

function quad(ctx, a, b, c, d, fill) {
  if (!a || !b || !c || !d) return;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function glow(ctx, x, y, r, color, alpha) {
  if (!(r > 0) || alpha <= 0.002) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace('ALPHA', String(alpha)));
  g.addColorStop(0.42, color.replace('ALPHA', String(alpha * 0.34)));
  g.addColorStop(1, color.replace('ALPHA', '0'));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

/* --- 部屋の中身。止まっているものが動き出す瞬間だけを見せる（§2-6 D） --- */
function drawRoomInterior(ctx, P, room, camZ, lightZ, t) {
  const { z, side, kind } = room;
  const s = sectionAt(z);
  const x = side * s.halfW;
  const wIn = 3.3, hTop = s.ceil * 0.92, hBot = s.floor * 0.96;

  /* 光が通過した部屋だけ照明が点く（§2-6 A） */
  const lit = clamp((lightZ - (z - 7)) / 9, 0, 1);
  if (lit <= 0.004) return;
  const wake = smooth(lit);

  const zA = z - wIn / 2, zB = z + wIn / 2;
  const p1 = P(x, hTop, zA), p2 = P(x, hTop, zB);
  const p3 = P(x, hBot, zB), p4 = P(x, hBot, zA);
  if (!p1 || !p2 || !p3 || !p4) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
  ctx.closePath();
  ctx.clip();

  const bx = Math.min(p1.x, p4.x), bw = Math.abs(p2.x - p1.x) + Math.abs(p3.x - p4.x);
  const by = Math.min(p1.y, p2.y), bh = Math.max(p3.y, p4.y) - by;

  /* 奥行きのある室内 */
  const gi = ctx.createLinearGradient(bx, by, bx + bw * side, by + bh);
  gi.addColorStop(0, '#0A1119');
  gi.addColorStop(1, C.navy700);
  ctx.fillStyle = gi;
  ctx.fillRect(bx - bw, by - bh, bw * 3, bh * 3);

  const cxr = bx + bw / 2, cyr = by + bh / 2;
  const unit = bh;
  const gold = 'rgba(201,162,39,ALPHA)';
  const warm = 'rgba(232,217,160,ALPHA)';

  if (kind === 'draft') {
    /* 製図台：図面の平面と、立ち上がる画面 */
    ctx.fillStyle = `rgba(36,55,79,${0.85 * wake})`;
    ctx.fillRect(cxr - unit * 0.42, cyr + unit * 0.10, unit * 0.86, unit * 0.06);
    for (let i = 0; i < 3; i++) {
      const on = clamp((wake - 0.25 - i * 0.16) * 5, 0, 1);
      ctx.fillStyle = `rgba(232,217,160,${0.16 * on})`;
      ctx.fillRect(cxr - unit * 0.30 + i * unit * 0.23, cyr - unit * 0.22, unit * 0.17, unit * 0.24);
    }
    glow(ctx, cxr, cyr - unit * 0.30, unit * 0.85, warm, 0.20 * wake);
  } else if (kind === 'board') {
    /* 基板：実装ランプが順に灯る */
    ctx.fillStyle = `rgba(20,35,55,${0.9 * wake})`;
    ctx.fillRect(cxr - unit * 0.40, cyr - unit * 0.06, unit * 0.80, unit * 0.34);
    for (let i = 0; i < 14; i++) {
      const on = clamp((wake * 1.5 - i / 14), 0, 1) * (0.55 + 0.45 * Math.sin(t * 70 + i));
      ctx.fillStyle = `rgba(201,162,39,${0.75 * on})`;
      ctx.fillRect(cxr - unit * 0.36 + i * unit * 0.055, cyr + unit * 0.02, unit * 0.022, unit * 0.022);
    }
    glow(ctx, cxr, cyr + unit * 0.05, unit * 0.7, gold, 0.16 * wake);
  } else if (kind === 'studio') {
    /* 撮影ブース：ソフトボックスが点く */
    const on = smooth(clamp(wake * 1.3, 0, 1));
    ctx.fillStyle = `rgba(242,239,233,${0.14 * on})`;
    ctx.fillRect(cxr - unit * 0.30, cyr - unit * 0.34, unit * 0.34, unit * 0.44);
    ctx.strokeStyle = `rgba(36,55,79,${0.9 * wake})`;
    ctx.lineWidth = Math.max(1, unit * 0.012);
    ctx.beginPath();
    ctx.moveTo(cxr + unit * 0.20, cyr + unit * 0.34);
    ctx.lineTo(cxr + unit * 0.20, cyr - unit * 0.20);
    ctx.stroke();
    glow(ctx, cxr - unit * 0.13, cyr - unit * 0.12, unit * 1.15, warm, 0.30 * on);
  } else if (kind === 'edit') {
    /* 編集卓：縦型が複数モニタに並ぶ */
    for (let i = 0; i < 3; i++) {
      const on = clamp((wake - i * 0.14) * 4, 0, 1);
      const mw = unit * 0.15, mh = unit * 0.30;
      const mx = cxr - unit * 0.30 + i * unit * 0.22;
      ctx.fillStyle = `rgba(11,20,32,${0.95 * wake})`;
      ctx.fillRect(mx, cyr - unit * 0.16, mw, mh);
      ctx.fillStyle = `rgba(232,217,160,${0.13 * on})`;
      ctx.fillRect(mx + mw * 0.22, cyr - unit * 0.13, mw * 0.56, mh * 0.86);
    }
    glow(ctx, cxr, cyr, unit * 0.8, warm, 0.17 * wake);
  } else {
    /* サーバー室：ラックのインジケータ列。扉は閉じている */
    ctx.fillStyle = `rgba(16,28,44,${0.95 * wake})`;
    ctx.fillRect(cxr - unit * 0.34, cyr - unit * 0.36, unit * 0.68, unit * 0.74);
    for (let r = 0; r < 9; r++) {
      const on = clamp((wake * 1.4 - r / 12), 0, 1) * (0.45 + 0.55 * Math.sin(t * 55 + r * 1.7));
      ctx.fillStyle = `rgba(201,162,39,${0.7 * on})`;
      ctx.fillRect(cxr - unit * 0.28, cyr - unit * 0.30 + r * unit * 0.076, unit * 0.05, unit * 0.018);
    }
    glow(ctx, cxr, cyr, unit * 0.62, gold, 0.13 * wake);
  }
  ctx.restore();

  /* 通路側への光の漏れ */
  const spill = ctx.createLinearGradient(p1.x, p1.y, p1.x + side * bw * 1.6, p1.y);
  spill.addColorStop(0, `rgba(201,162,39,${0.10 * wake})`);
  spill.addColorStop(1, 'rgba(201,162,39,0)');
  ctx.fillStyle = spill;
  ctx.fillRect(Math.min(p1.x, p2.x) - bw, by, bw * 2.4, bh);
}

/* --- 章ごとに1回だけの通過物（§2-6 B） --- */
function drawPassBy(ctx, P, t, camZ, W, H) {
  const events = [
    { c: 0.214, kind: 'paper' },
    { c: 0.357, kind: 'lamp'  },
    { c: 0.500, kind: 'flare' },
    { c: 0.643, kind: 'vert'  },
    { c: 0.786, kind: 'strip' },
  ];
  for (const e of events) {
    const k = (t - (e.c - 0.010)) / 0.020;      // 約0.3〜0.5秒相当
    if (k < 0 || k > 1) continue;
    const a = Math.sin(Math.PI * k);            // 出て消える
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (e.kind === 'paper') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(242,239,233,${0.30 * a})`;
      ctx.save();
      ctx.translate(lerp(-W * 0.15, W * 1.1, k), H * (0.42 + 0.16 * Math.sin(k * 3.4)));
      ctx.rotate(k * 2.6);
      ctx.fillRect(-W * 0.055, -H * 0.05, W * 0.11, H * 0.10);
      ctx.restore();
    } else if (e.kind === 'lamp') {
      glow(ctx, lerp(W * 1.08, -W * 0.08, k), H * 0.55, H * 0.16, 'rgba(201,162,39,ALPHA)', 0.5 * a);
    } else if (e.kind === 'flare') {
      const g = ctx.createLinearGradient(0, H * 0.34, W, H * 0.62);
      g.addColorStop(0, 'rgba(232,217,160,0)');
      g.addColorStop(clamp(k, 0.02, 0.98), `rgba(232,217,160,${0.34 * a})`);
      g.addColorStop(1, 'rgba(232,217,160,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else if (e.kind === 'vert') {
      ctx.globalCompositeOperation = 'source-over';
      const x = lerp(-W * 0.2, W * 1.15, k);
      ctx.fillStyle = `rgba(11,20,32,${0.5 * a})`;
      ctx.fillRect(x, H * 0.16, W * 0.11, H * 0.62);
      ctx.fillStyle = `rgba(232,217,160,${0.13 * a})`;
      ctx.fillRect(x + W * 0.016, H * 0.19, W * 0.078, H * 0.56);
    } else {
      for (let i = 0; i < 12; i++) {
        const x = lerp(W * 1.1, -W * 0.1, k) + i * W * 0.035;
        glow(ctx, x, H * 0.47, H * 0.035, 'rgba(201,162,39,ALPHA)', 0.42 * a);
      }
    }
    ctx.restore();
  }
}

/* --- 00 入口の扉。ドア越しに光 --- */
function drawDoor(ctx, P, camZ, t) {
  const z = DOOR_Z;
  if (camZ > z + 1.4) return;
  const s = sectionAt(z);
  const openK = smooth(clamp((camZ - (z - 9)) / 9, 0, 1));
  const gap = lerp(0.10, 1.0, openK);
  for (const side of [-1, 1]) {
    const inner = side * s.halfW * gap;
    const outer = side * s.halfW;
    const a = P(inner, s.ceil, z), b = P(outer, s.ceil, z);
    const c = P(outer, s.floor, z), d = P(inner, s.floor, z);
    quad(ctx, a, b, c, d, '#070C13');
    if (a && b) {
      ctx.strokeStyle = `rgba(201,162,39,${0.30 + 0.30 * openK})`;
      ctx.lineWidth = Math.max(1, (b.f || 1) * 0.012);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(d.x, d.y); ctx.stroke();
    }
  }
  const cA = P(0, 0, z);
  if (cA) glow(ctx, cA.x, cA.y, cA.f * 1.4, 'rgba(232,217,160,ALPHA)', 0.28 * (1 - openK * 0.55));
}

/* --- 06 最奥の作業机 --- */
function drawDesk(ctx, P, camZ, t) {
  const z = DESK_Z;
  const near = clamp((camZ - (z - 34)) / 34, 0, 1);
  if (near <= 0) return;
  const s = sectionAt(z);
  const a = P(-1.35, 0.28, z), b = P(1.35, 0.28, z);
  const c = P(1.35, s.floor, z), d = P(-1.35, s.floor, z);
  quad(ctx, a, b, c, d, `rgba(28,42,62,${0.92 * near})`);
  const m1 = P(-0.62, -0.52, z - 0.25), m2 = P(0.62, -0.52, z - 0.25);
  const m3 = P(0.62, 0.24, z - 0.25),  m4 = P(-0.62, 0.24, z - 0.25);
  quad(ctx, m1, m2, m3, m4, `rgba(9,15,24,${0.96 * near})`);
  if (m1 && m3) {
    ctx.fillStyle = `rgba(232,217,160,${0.11 * near})`;
    ctx.fillRect(m1.x + (m2.x - m1.x) * 0.05, m1.y + (m4.y - m1.y) * 0.07,
                 (m2.x - m1.x) * 0.90, (m4.y - m1.y) * 0.86);
  }
  const lampP = P(1.02, -0.42, z - 0.9);
  if (lampP) glow(ctx, lampP.x, lampP.y, lampP.f * 1.5, 'rgba(201,162,39,ALPHA)', 0.30 * near);
}

/* =========================================================
   本体
   ========================================================= */
export function drawScene(ctx, t, W, H) {
  t = clamp(t, 0, 1);
  const camZ = camZAt(t);
  const lightZ = lightZAt(t);
  const shake = handheld(t);
  const P = makeProjector(W, H, camZ, shake);

  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.rotate(shake.roll); ctx.translate(-W / 2, -H / 2);

  /* 背景：最暗部 */
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#070C13');
  bg.addColorStop(0.55, C.navy900);
  bg.addColorStop(1, '#060A10');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  /* 通路をスライスで奥から手前へ。
     光は中央に球で置かず、壁と天井を舐めるように通す（§2-6 A） */
  const FAR = 62, STEP = 0.8;
  const FIX_PITCH = 8.4;          // 天井の照明ピッチ
  for (let z = camZ + FAR; z > camZ + 0.9; z -= STEP) {
    const s = sectionAt(z);
    const s2 = sectionAt(z + STEP);
    const dz = z - camZ;
    const tint = depthTint(dz);

    /* 先行する光がこの位置を舐めているか */
    const wash = smooth(clamp(1 - Math.abs(z - lightZ) / 17, 0, 1));
    /* 光が通過したあとは、その区間の照明が点いたままになる */
    const passed = smooth(clamp((lightZ - z) / 6, 0, 1));
    const lum = tint * (0.62 + 0.9 * wash + 0.5 * passed);

    const a1 = P(-s.halfW, s.ceil, z),  b1 = P(s.halfW, s.ceil, z);
    const c1 = P(s.halfW, s.floor, z),  d1 = P(-s.halfW, s.floor, z);
    const a2 = P(-s2.halfW, s2.ceil, z + STEP), b2 = P(s2.halfW, s2.ceil, z + STEP);
    const c2 = P(s2.halfW, s2.floor, z + STEP), d2 = P(-s2.halfW, s2.floor, z + STEP);
    if (!a1 || !b1 || !c1 || !d1) continue;

    /* 床：無垢材。手前ほど明るく、光を反射する */
    quad(ctx, d1, c1, c2, d2, `rgba(38,56,80,${0.66 * lum})`);
    if (wash > 0.02) quad(ctx, d1, c1, c2, d2, `rgba(201,162,39,${0.16 * wash * tint})`);
    /* 天井：最も暗い面 */
    quad(ctx, a1, b1, b2, a2, `rgba(14,24,38,${0.55 * lum})`);
    /* 両壁：マットな金属。片側をわずかに落として陰影の起点を作る */
    quad(ctx, a1, d1, d2, a2, `rgba(30,48,70,${0.60 * lum})`);
    quad(ctx, b1, c1, c2, b2, `rgba(24,40,60,${0.52 * lum})`);
    if (wash > 0.02) {
      quad(ctx, a1, d1, d2, a2, `rgba(201,162,39,${0.10 * wash * tint})`);
      quad(ctx, b1, c1, c2, b2, `rgba(201,162,39,${0.08 * wash * tint})`);
    }

    /* 梁：深度が読める骨格。通った後は縁が真鍮色に光る */
    if (Math.floor(z / 4.2) !== Math.floor((z + STEP) / 4.2) && tint > 0.05) {
      ctx.strokeStyle = `rgba(58,82,112,${0.75 * lum})`;
      ctx.lineWidth = Math.max(0.7, (a1.f || 1) * 0.009);
      ctx.beginPath();
      ctx.moveTo(a1.x, a1.y); ctx.lineTo(b1.x, b1.y);
      ctx.lineTo(c1.x, c1.y); ctx.lineTo(d1.x, d1.y);
      ctx.closePath(); ctx.stroke();
      if (passed > 0.02) {
        ctx.strokeStyle = `rgba(201,162,39,${0.34 * passed * tint})`;
        ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(b1.x, b1.y); ctx.stroke();
      }
    }

    /* 天井の照明。光が通過した区間だけ点灯する */
    if (Math.floor(z / FIX_PITCH) !== Math.floor((z + STEP) / FIX_PITCH)) {
      const on = smooth(clamp((lightZ - (z - 2)) / 5, 0, 1));
      const fa = P(-0.42, s.ceil + 0.05, z), fb = P(0.42, s.ceil + 0.05, z);
      const fc = P(0.42, s.ceil + 0.05, z + 1.5), fd = P(-0.42, s.ceil + 0.05, z + 1.5);
      quad(ctx, fa, fb, fc, fd, `rgba(232,217,160,${(0.06 + 0.55 * on) * tint})`);
      if (on > 0.02 && fa) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        glow(ctx, (fa.x + fb.x) / 2, fa.y, (fa.f || 1) * 0.55,
             'rgba(232,217,160,ALPHA)', 0.30 * on * tint);
        /* 床への落ち込み */
        const rp = P(0, s.floor - 0.02, z + 0.6);
        if (rp) glow(ctx, rp.x, rp.y, (rp.f || 1) * 0.5,
                     'rgba(201,162,39,ALPHA)', 0.15 * on * tint);
        ctx.restore();
      }
    }
  }

  /* 扉・部屋・机（zで奥から手前へ） */
  const objs = [
    { z: DOOR_Z, fn: () => drawDoor(ctx, P, camZ, t) },
    ...ROOMS.map(r => ({ z: r.z, fn: () => drawRoomInterior(ctx, P, r, camZ, lightZ, t) })),
    { z: DESK_Z, fn: () => drawDesk(ctx, P, camZ, t) },
  ].filter(o => o.z > camZ - 3).sort((a, b) => b.z - a.z);
  for (const o of objs) o.fn();

  /* 大空間の抜け（§2-6 C）：中盤で一度だけ輝度の山 */
  const openNow = sectionAt(camZ + 6).open;
  if (openNow > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, W / 2 + shake.x, H * 0.36, H * 1.15, 'rgba(232,217,160,ALPHA)', 0.11 * openNow);
    ctx.restore();
  }

  /* 通過物 */
  drawPassBy(ctx, P, t, camZ, W, H);

  /* 空気中の塵 */
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 46; i++) {
    const seed = i * 12.9898;
    const zz = camZ + 2 + ((seed * 7.31 + t * 40) % 42);
    const px = ((Math.sin(seed) * 43758.5) % 1) * 3.2;
    const py = ((Math.cos(seed * 1.7) * 21344.3) % 1) * 2.6;
    const p = P(px, py, zz);
    if (!p) continue;
    const near = clamp(1 - (zz - camZ) / 42, 0, 1);
    glow(ctx, p.x, p.y, Math.max(1.5, p.f * 0.02), 'rgba(232,217,160,ALPHA)', 0.10 * near);
  }
  ctx.restore();

  ctx.restore();

  /* ヴィネットと粒状感（暗部の帯を消す） */
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.92);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.60)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  /* 06の締め：一度だけ引いて、工房が机上の一台の中にあったと分かる（§2-6 F）
     は合成側（renderFrame）で処理する */
}

export const SCENE = { ROOMS, DOOR_Z, DESK_Z, PULL_START, camZAt, C };
