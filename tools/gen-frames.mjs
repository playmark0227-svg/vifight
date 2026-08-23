/* フレーム列を書き出す。指示書 §5-3 の仕様に従い WebP 連番で出力する。 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ROOT = '/home/user/vifight';
const sets = {
  pc:     { w: 1600, h: 900,  n: 360, q: 0.78, cap: 45 },
  mobile: { w: 900,  h: 1200, n: 216, q: 0.72, cap: 18 },
};
const only = process.argv.slice(2).find(a => !a.startsWith('--'));
const probe = process.argv.includes('--probe');

const browser = await chromium.launch({ executablePath: EXEC });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
await page.goto('http://127.0.0.1:8199/tools/render.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, { timeout: 20000 });

for (const [name, s] of Object.entries(sets)) {
  if (only && only !== name) continue;
  const dir = path.join(ROOT, 'assets/frames', name);
  fs.mkdirSync(dir, { recursive: true });
  const count = probe ? 6 : s.n;
  let total = 0, max = 0;
  const t0 = Date.now();
  for (let i = 0; i < count; i++) {
    const t = probe ? i / (count - 1) : i / (s.n - 1);
    const durl = await page.evaluate(([t, w, h, q]) => window.__frame(t, w, h, q), [t, s.w, s.h, s.q]);
    const buf = Buffer.from(durl.split(',')[1], 'base64');
    const idx = probe ? Math.round(t * (s.n - 1)) : i;
    fs.writeFileSync(path.join(dir, `f_${String(idx + 1).padStart(4, '0')}.webp`), buf);
    total += buf.length; max = Math.max(max, buf.length);
    if (!probe && i % 60 === 0) process.stdout.write(`  ${name} ${i}/${s.n}\n`);
  }
  const avg = total / count / 1024;
  console.log(`${name}: ${count}枚 平均${avg.toFixed(1)}KB 最大${(max/1024).toFixed(1)}KB ` +
              `想定合計${(avg * s.n / 1024).toFixed(2)}MB 上限${s.cap}KB ${max/1024 <= s.cap ? '✓' : '✗超過'} ` +
              `(${((Date.now()-t0)/1000).toFixed(0)}s)`);
}
await browser.close();
