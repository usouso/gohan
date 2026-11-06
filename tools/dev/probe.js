// drawSurface の途中経過を調べる
const path = require('path'); const fs = require('fs');
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const url = 'file:///C:/dev/gohan/index.html?auto=1&mute=1&bg=1&seed=1000&dish=' + (process.argv[2] || 'ramen') + '&diner=satoshi&utensil=hashi';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--disable-gpu'] });
  const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 900 }); page.on('pageerror', e => console.log('pageerror', e.message)); page.on('console', m => console.log('console', m.text()));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__gohan && window.__gohan.screen === 'play', { timeout: 8000 });
  const r = await page.evaluate(() => {
    const g = window.__gohan.game; const R = window.__R || null;
    // renderer は main.js の中なので、新しく作って調べる
    const cv = document.createElement('canvas'); cv.width = 1600; cv.height = 760; const ren = new GohanRender.Renderer(cv);
    const out = { pending: ren.assets.pending };
    const groups = new Map(); for (const p of g.world.particles) { const k = p.mat.key; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
    out.groups = Array.from(groups.entries()).map(([k, ps]) => k + ':' + ps.length);
    const test = (key) => {
      const ps = groups.get(key); if (!ps) return 'none';
      const mat = ps[0].mat; const opts = GohanRender.FOOD_TEX[key] || {};
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9; for (const p of ps) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
      const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, 1600, 760);
      try { ren.drawSurface(ctx, ps, mat, opts, false); } catch (e) { return 'ERR ' + e.message; }
      const q = ps[Math.floor(ps.length / 2)]; const cx = Math.round(q.x), cy = Math.round(q.y);
      const px = ctx.getImageData(cx, cy, 1, 1).data; const mo = ren.mox.getImageData(Math.round(cx / 2), Math.round(cy / 2), 1, 1).data; const ly = ren.lx.getImageData(cx, cy, 1, 1).data;
      return { n: ps.length, box: [minX | 0, minY | 0, maxX | 0, maxY | 0], center: [cx, cy], mo: Array.from(mo), layer: Array.from(ly), out: Array.from(px) };
    };
    out.tests = {}; for (const k of groups.keys()) out.tests[k] = test(k);
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})();
