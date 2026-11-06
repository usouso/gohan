// 器を縮めたとき、今と同じ粒の数になる level を探す（量は半分のまま、器を小さくして満たす）
// 使い方: node tools/dev/tune-vessels.js '{"chawan":0.9,...}'  → 今の寸法での粒の数と、その倍率に縮めたときの提案 level・器の外の粒を表示（食器の種類ごとの倍率。省略時は全部 1）
const dir = require('path').resolve(__dirname, '..', '..') + '/';
const E = require(dir + 'src/engine.js'); const F = require(dir + 'src/food.js');
const SCALE = JSON.parse(process.argv[2] || '{"chawan":1,"don":1,"owan":1,"sara":1,"fukazara":1,"ishi":1,"ki":1}');
const POS = { main: 640, side: 890, wide: 720 };

function build(dish, settle) {
  const w = new E.World({ gravity: 9000, killY: 740, cell: 26, iterations: 2 });
  w.statics.push(E.seg(40, 600, 1400, 600, 2, { fric: .55, tag: 'table' }));
  const vessels = {}; for (const vd of dish.vessels) vessels[vd.slot] = F.makeVessel(vd.type, POS[vd.slot], 600);
  const b = F.buildDish(w, dish, vessels, E.makeRng(1000));
  const m = {}; for (const p of b.particles) m[p.mat.key] = (m[p.mat.key] || 0) + 1;
  let out = 0;
  if (settle) { w.settle(1.2, 3); F.finishDish(w); for (const p of w.particles) { if (p.dead) { out++; continue; } let inV = false; for (const v of Object.values(vessels)) if (p.x > v.left - 10 && p.x < v.right + 10 && p.y > v.top - 90 && (p.y <= v.top + 2 || E.pointInPoly(p.x, p.y, v.poly))) inV = true; if (!inV && !p.mat.gravity) out++; } }
  return { m, out, edible: b.edibleTotal };
}
const fmt = m => Object.entries(m).map(([k, v]) => k + ':' + v).join(' ');
// 今の寸法
const before = {}; for (const d of F.DISHES) before[d.id] = build(d, true);
// 縮める
const oldV = {}; for (const k in F.VESSELS) { const V = F.VESSELS[k]; oldV[k] = { ...V }; const sc = SCALE[k]; const s = typeof sc === 'number' ? sc : sc.w, sh = typeof sc === 'number' ? sc : sc.h; V.wTop = Math.round(V.wTop * s); V.wBot = Math.round(V.wBot * s); V.h = Math.round(V.h * sh);   // 倍率は数（幅と高さ）か {w, h} }
console.log('器:'); for (const k in F.VESSELS) { const V = F.VESSELS[k], O = oldV[k]; console.log('  ' + k.padEnd(9) + O.wTop + '/' + O.wBot + '/' + O.h + ' → ' + V.wTop + '/' + V.wBot + '/' + V.h + '  (×' + JSON.stringify(SCALE[k]) + ')'); }
const proposals = [];
for (const d of F.DISHES) {
  const b0 = before[d.id];
  for (const vd of d.vessels) {
    const sc = SCALE[vd.type]; const s = typeof sc === 'number' ? sc : sc.h;
    for (const part of vd.parts) {
      if (part.kind !== 'fill' && part.kind !== 'liquid') continue;
      if (part.dome) part.dome = Math.round(part.dome * s);
      const target = b0.m[part.mat] || 0; let best = null;
      for (let lv = .3; lv <= .96; lv += .01) { part.level = Math.round(lv * 100) / 100; const c = build(d, false).m[part.mat] || 0; const diff = Math.abs(c - target); if (!best || diff < best.diff) best = { lv: part.level, c, diff }; }
      part.level = best.lv; proposals.push({ dish: d.id, vessel: vd.type, mat: part.mat, level: best.lv, dome: part.dome, count: best.c, target });
    }
  }
}
console.log('\n提案 level:'); for (const p of proposals) console.log('  ' + p.dish.padEnd(11) + p.vessel.padEnd(9) + p.mat.padEnd(7) + 'level ' + p.level + (p.dome ? ' dome ' + p.dome : '') + '  粒 ' + p.count + '（今 ' + p.target + '）');
console.log('\n料理ごとの粒（今 → 縮めた後）。外=置いて settle した後に器の外にある粒（最初からこぼれている）:');
for (const d of F.DISHES) { const a = build(d, true); const b0 = before[d.id]; console.log('  ' + d.id.padEnd(11) + '外 ' + b0.out + '→' + a.out + '  食べられる量 ' + Math.round(b0.edible) + '→' + Math.round(a.edible) + '\n     今: ' + fmt(b0.m) + '\n     後: ' + fmt(a.m)); }
