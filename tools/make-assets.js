// tools/make-assets.js — src/textures.js の素材を assets/tex/*.png に書き出し、一覧 assets/tex/preview.png も作る。
// 使い方: node tools/make-assets.js [--only wood,cloth]
const path = require('path'); const fs = require('fs');
const puppeteer = require('puppeteer-core');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
const only = (() => { const i = process.argv.indexOf('--only'); return i >= 0 ? process.argv[i + 1].split(',') : null; })();
const outDir = path.join(__dirname, '..', 'assets', 'tex'); fs.mkdirSync(outDir, { recursive: true });
(async () => {
  if (!CHROME) { console.error('Chrome が見つからない'); process.exit(2); }
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--disable-gpu'] });
  const page = await browser.newPage(); page.on('pageerror', e => console.error('pageerror', e.message));
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ path: path.join(__dirname, '..', 'src', 'textures.js') });
  const names = await page.evaluate(() => GohanTextures.NAMES);
  const list = only || names; const t0 = Date.now(); const sizes = {};
  for (const name of list) {
    const t1 = Date.now();
    const url = await page.evaluate(n => GohanTextures.make(n).toDataURL('image/png'), name);
    const buf = Buffer.from(url.split(',')[1], 'base64'); fs.writeFileSync(path.join(outDir, name + '.png'), buf); sizes[name] = buf.length;
    console.log(`${name.padEnd(12)} ${(buf.length / 1024).toFixed(0).padStart(5)} KB  ${Date.now() - t1} ms`);
  }
  // 一覧（名前つき）
  const preview = await page.evaluate((list) => {
    const cell = 200, cols = 6, rows = Math.ceil(list.length / cols); const c = document.createElement('canvas'); c.width = cols * cell; c.height = rows * (cell + 26); const x = c.getContext('2d');
    x.fillStyle = '#333'; x.fillRect(0, 0, c.width, c.height); x.font = '16px sans-serif'; x.fillStyle = '#fff';
    list.forEach((n, i) => { const tex = GohanTextures.make(n); const px = (i % cols) * cell, py = Math.floor(i / cols) * (cell + 26); x.drawImage(tex, 0, 0, tex.width, tex.height, px, py, cell, cell); x.fillText(n + ' ' + tex.width, px + 4, py + cell + 18); });
    return c.toDataURL('image/png');
  }, list);
  fs.writeFileSync(path.join(outDir, 'preview.png'), Buffer.from(preview.split(',')[1], 'base64'));
  await browser.close();
  const total = Object.values(sizes).reduce((s, v) => s + v, 0);
  console.log(`合計 ${(total / 1024).toFixed(0)} KB, ${list.length} 枚, ${Date.now() - t0} ms → ${outDir}`);
})().catch(e => { console.error(e); process.exit(1); });
