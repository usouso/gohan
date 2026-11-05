// tools/check.js — ヘッドレス Chrome で自動プレイし、画面写真・エラー・文字の重なり/はみ出し・スクロールを検査する。
// 使い方: node tools/check.js [--seed N] [--sizes 1920x910,1366x650] [--maxsec 150] [--diner id] [--dish id] [--utensil key]
// 終了コード 0 = 合格。1 = 例外/pageerror、要求周回未完、重なり/はみ出し、スクロール違反のどれかあり。
const path = require('path'); const fs = require('fs');
const puppeteer = require('puppeteer-core');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
function arg(name, def) { const i = process.argv.indexOf('--' + name); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def; }
const seed = arg('seed', '1000'); const sizes = arg('sizes', '1920x910,1366x650').split(',').map(s => s.split('x').map(Number)); const maxSec = parseFloat(arg('maxsec', '150'));
const extra = ['diner', 'dish', 'utensil'].map(k => arg(k, null) ? `&${k}=${arg(k)}` : '').join('');
const outDir = path.join(__dirname, '..', 'shots'); fs.mkdirSync(outDir, { recursive: true });
const url = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/') + `?auto=1&mute=1&bg=1&fast=4&seed=${seed}${extra}`;

// ページ内で動かす検査：文字の行ごとの範囲を集めて、交差とはみ出しを数える
const TEXT_CHECK = `(() => {
  const rects = []; const vw = innerWidth, vh = innerHeight;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node; while ((node = walker.nextNode())) {
    if (!node.nodeValue.trim()) continue; const el = node.parentElement; if (!el) continue;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < .3) continue;
    let hidden = false; for (let a = el; a; a = a.parentElement) { const s = getComputedStyle(a); if (s.display === 'none' || parseFloat(s.opacity) < .3) { hidden = true; break; } } if (hidden) continue;
    const range = document.createRange(); range.selectNodeContents(node);
    // overflow で切り取られる範囲は、その親の範囲で切る（見えない部分は数えない）
    let clip = { x: -1e9, y: -1e9, r: 1e9, b: 1e9 }; for (let a = el; a; a = a.parentElement) { const s = getComputedStyle(a); if (/(hidden|auto|scroll)/.test(s.overflow + s.overflowX + s.overflowY)) { const cr = a.getBoundingClientRect(); clip = { x: Math.max(clip.x, cr.left), y: Math.max(clip.y, cr.top), r: Math.min(clip.r, cr.right), b: Math.min(clip.b, cr.bottom) }; } }
    for (const r0 of range.getClientRects()) { const x = Math.max(r0.left, clip.x), y = Math.max(r0.top, clip.y), r = Math.min(r0.right, clip.r), b = Math.min(r0.bottom, clip.b); if (r - x < 1 || b - y < 1) continue; rects.push({ x, y, w: r - x, h: b - y, t: node.nodeValue.trim().slice(0, 20), el }); }
  }
  let overlaps = 0, overflow = 0; const pairs = [];
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i]; if (a.x < -1 || a.y < -1 || a.x + a.w > vw + 1 || a.y + a.h > vh + 1) { overflow++; pairs.push('はみ出し:' + a.t); }
    for (let j = i + 1; j < rects.length; j++) { const b = rects[j]; if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ix > 3 && iy > 3) { overlaps++; pairs.push(a.t + ' × ' + b.t); } }
  }
  const scrollX = document.documentElement.scrollWidth - vw, scrollY = document.documentElement.scrollHeight - vh;
  return { texts: rects.length, overlaps, overflow, scrollX: Math.max(0, scrollX), scrollY: Math.max(0, scrollY), pairs: pairs.slice(0, 8) };
})()`;

(async () => {
  if (!CHROME) { console.error('Chrome が見つからない'); process.exit(2); }
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--disable-gpu', '--no-first-run'] });
  let fail = 0; const report = { seed, sizes: [] };
  for (const [w, h] of sizes) {
    const page = await browser.newPage(); await page.setViewport({ width: w, height: h });
    const errors = []; page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    const t0 = Date.now(); const tag = `${w}x${h}`; const res = { size: tag, errors, text: { overlaps: 0, overflow: 0, scroll: 0, pairs: [] }, shots: [] };
    const textAgg = (r) => { res.text.overlaps += r.overlaps; res.text.overflow += r.overflow; if (r.scrollX > 0 || r.scrollY > 0) res.text.scroll++; for (const p of r.pairs) if (res.text.pairs.length < 10 && !res.text.pairs.includes(p)) res.text.pairs.push(p); };
    await page.goto(url, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 150));
    textAgg(await page.evaluate(TEXT_CHECK)); const shot = async name => { const f = path.join(outDir, `${name}-${tag}.png`); await page.screenshot({ path: f }); res.shots.push(path.relative(path.join(__dirname, '..'), f)); };
    await shot('01-title');
    await page.waitForFunction(() => window.__gohan && window.__gohan.screen === 'reveal', { timeout: 5000 }).catch(() => { });
    textAgg(await page.evaluate(TEXT_CHECK)); await shot('02-reveal');
    await page.waitForFunction(() => window.__gohan && window.__gohan.screen === 'play', { timeout: 5000 }).catch(() => { });
    // 食べている間：100ms ごとに文字検査、途中で写真2枚
    let shots = 0; let state = null;
    while (Date.now() - t0 < maxSec * 1000) {
      state = await page.evaluate(() => window.__gohan.state()); if (state.screen !== 'play') break;
      if (shots === 0 && state.time > 1.5) { await shot('03-eating-a'); shots++; }
      if (shots === 1 && state.time > 14) { await shot('04-eating-b'); shots++; }
      textAgg(await page.evaluate(TEXT_CHECK)); await new Promise(r => setTimeout(r, 100));
    }
    await new Promise(r => setTimeout(r, 300)); textAgg(await page.evaluate(TEXT_CHECK)); await shot('05-result');
    state = await page.evaluate(() => window.__gohan.state()); res.final = state;
    // コマ送り（0.05秒ごと 10 コマ）は結果の前に撮れないので、新しい食卓を開いて撮る
    await page.evaluate(() => window.__gohan.again()); await page.evaluate(() => window.__gohan.go());
    await new Promise(r => setTimeout(r, 400));
    const frames = await page.evaluate(() => { for (let i = 0; i < 60; i++) window.__gohan.step(1 / 60); return window.__gohan.capture(10, 50); });
    if (frames) { const f = path.join(outDir, `06-frames-${tag}.png`); fs.writeFileSync(f, Buffer.from(frames.split(',')[1], 'base64')); res.shots.push(path.relative(path.join(__dirname, '..'), f)); }
    const finished = state && state.screen === 'result' && state.result;
    const ok = errors.length === 0 && res.text.overlaps === 0 && res.text.overflow === 0 && res.text.scroll === 0 && finished;
    res.ok = ok; if (!ok) fail = 1; report.sizes.push(res);
    console.log(`[${tag}] ${ok ? '合格' : '失敗'}  errors=${errors.length} overlaps=${res.text.overlaps} overflow=${res.text.overflow} scroll=${res.text.scroll} finished=${!!finished} ` + (state && state.result ? `end=${state.result.reason} eaten=${Math.round(state.eaten * 100)}% time=${Math.round(state.time)}s diner=${state.diner} dish=${state.dish} utensil=${state.utensil}` : `state=${JSON.stringify(state)}`));
    if (errors.length) console.log('  ' + errors.slice(0, 5).join('\n  ')); if (res.text.pairs.length) console.log('  重なり/はみ出し: ' + res.text.pairs.join(' | '));
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'check-report.json'), JSON.stringify(report, null, 2));
  process.exit(fail);
})().catch(e => { console.error(e); process.exit(1); });
