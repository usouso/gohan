// tools/gallery.js — 料理と食べる人を1つずつ、ヘッドレス Chrome で撮って一覧（shots/gallery-*.png）にする。見た目の確認用。
// 使い方: node tools/gallery.js [--what dishes|diners|both] [--t 2.5] [--seed 1000] [--zoom] [--only sake,gyoza]
//   --zoom: 器のまわり（料理）／顔のまわり（食べる人）だけを 2 倍で切り出す
const path = require('path'); const fs = require('fs');
const puppeteer = require('puppeteer-core');
const F = require(path.join(__dirname, '../src/food.js')); const D = require(path.join(__dirname, '../src/diners.js'));
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
function arg(name, def) { const i = process.argv.indexOf('--' + name); return i >= 0 ? (process.argv[i + 1] === undefined || process.argv[i + 1].startsWith('--') ? true : process.argv[i + 1]) : def; }
const what = arg('what', 'both'); const T = parseFloat(arg('t', '2.5')); const seed = arg('seed', '1000'); const zoom = !!arg('zoom', false); const only = arg('only', null) ? String(arg('only')).split(',') : null;
const outDir = path.join(__dirname, '..', 'shots'); fs.mkdirSync(outDir, { recursive: true });
const base = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/') + '?auto=1&mute=1&bg=1&fast=4&seed=' + seed;
const combos = [];
if (what === 'dishes' || what === 'both') for (const d of F.DISHES) { if (only && !only.includes(d.id)) continue; combos.push({ label: d.name, dish: d.id, diner: 'satoshi', utensil: d.natural[0], kind: 'dish' }); }
if (what === 'diners' || what === 'both') for (const d of D.DINERS) { if (only && !only.includes(d.id)) continue; combos.push({ label: d.name, dish: 'gyoza', diner: d.id, utensil: 'hashi', kind: 'diner' }); }
(async () => {
  if (!CHROME) { console.error('Chrome が見つからない'); process.exit(2); }
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--disable-gpu'] });
  const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 900 }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  const shots = [];
  for (const c of combos) {
    await page.goto(base + '&dish=' + c.dish + '&diner=' + c.diner + '&utensil=' + c.utensil, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__gohan && window.__gohan.screen === 'play', { timeout: 8000 }).catch(() => { });
    await page.waitForFunction(t => window.__gohan.state().time >= t, { timeout: 30000 }, T).catch(() => { });
    // 画面（canvas）の画像と、場面の座標 → 画面の座標の倍率
    const info = await page.evaluate(() => { const cv = document.getElementById('cv'); const r = cv.getBoundingClientRect(); const g = window.__gohan.game; return { x: r.left, y: r.top, w: r.width, h: r.height, scale: r.width / 1600, mouth: g.mouth, hs: g.diner.hs, vessels: g.vesselList.map(v => ({ left: v.left, right: v.right, top: v.top, bottom: v.bottom })), drawMs: window.__gohan.state().drawMs, time: g.time }; });
    let clip = { x: info.x, y: info.y, width: info.w, height: info.h };
    if (zoom) {
      if (c.kind === 'dish') { const l = Math.min(...info.vessels.map(v => v.left)) - 40, r = Math.max(...info.vessels.map(v => v.right)) + 40, t = Math.min(...info.vessels.map(v => v.top)) - 160, b = Math.max(...info.vessels.map(v => v.bottom)) + 30; clip = { x: info.x + l * info.scale, y: info.y + t * info.scale, width: (r - l) * info.scale, height: (b - t) * info.scale }; }
      else { const hs = info.hs; const l = info.mouth.x - 180 * hs - 60, r = info.mouth.x + 380 * hs, t = info.mouth.y - 360 * hs, b = info.mouth.y + 200 * hs; clip = { x: info.x + l * info.scale, y: info.y + t * info.scale, width: (r - l) * info.scale, height: (b - t) * info.scale }; }
    }
    const buf = await page.screenshot({ clip, captureBeyondViewport: false });
    const f = path.join(outDir, 'tmp'); fs.mkdirSync(f, { recursive: true }); const fn = path.join(f, `${c.kind}-${c.dish}-${c.diner}.png`); fs.writeFileSync(fn, buf);
    shots.push({ file: fn, label: c.label + '  ' + c.utensil + '  ' + Math.round(info.time) + 's  ' + info.drawMs + 'ms', w: clip.width, h: clip.height });
    console.log(c.kind, c.dish, c.diner, c.utensil, 'time', Math.round(info.time), 'draw', info.drawMs, 'ms');
  }
  // 一覧に並べる（ブラウザーで合成）
  const cols = zoom ? 3 : 2; const cellW = zoom ? 600 : 800;
  const sheet = await page.evaluate(async (shots, cols, cellW) => {
    const imgs = await Promise.all(shots.map(s => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = 'file:///' + s.file.replace(/\\/g, '/'); })));
    const cellH = Math.max(...imgs.map((im, i) => Math.round(im.height * cellW / im.width))) + 26; const rows = Math.ceil(imgs.length / cols);
    const c = document.createElement('canvas'); c.width = cols * cellW; c.height = rows * cellH; const x = c.getContext('2d'); x.fillStyle = '#222'; x.fillRect(0, 0, c.width, c.height); x.font = '18px sans-serif'; x.fillStyle = '#fff';
    imgs.forEach((im, i) => { const px = (i % cols) * cellW, py = Math.floor(i / cols) * cellH; const h = Math.round(im.height * cellW / im.width); x.drawImage(im, px, py, cellW, h); x.fillText(shots[i].label, px + 6, py + h + 19); });
    return c.toDataURL('image/png');
  }, shots, cols, cellW);
  const out = path.join(outDir, `gallery-${what}${zoom ? '-zoom' : ''}.png`); fs.writeFileSync(out, Buffer.from(sheet.split(',')[1], 'base64'));
  await browser.close();
  if (errors.length) console.log('pageerror:', errors.slice(0, 5).join(' | '));
  console.log('→', out);
})().catch(e => { console.error(e); process.exit(1); });
