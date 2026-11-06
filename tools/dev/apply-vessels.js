// 器を縮めて food.js に書き込む（量＝粒の数は今のまま。level と dome を合わせ直す）
// 使い方: node tools/dev/apply-vessels.js '{"chawan":0.9,"don":1,...}'  → VESSELS の寸法をその倍率にして、fill/liquid の level と dome を粒の数が変わらないように合わせ、food.js に書き込む
const fs = require('fs');
const dir = require('path').resolve(__dirname, '..', '..') + '/';
const E = require(dir + 'src/engine.js'); const F = require(dir + 'src/food.js');
const SCALE = JSON.parse(process.argv[2]);
const POS = { main: 640, side: 890, wide: 720 };
function build(dish) {
  const w = new E.World({ gravity: 9000, killY: 740, cell: 26, iterations: 2 });
  w.statics.push(E.seg(40, 600, 1400, 600, 2, { fric: .55, tag: 'table' }));
  const vessels = {}; for (const vd of dish.vessels) vessels[vd.slot] = F.makeVessel(vd.type, POS[vd.slot], 600);
  const b = F.buildDish(w, dish, vessels, E.makeRng(1000));
  const m = {}; for (const p of b.particles) m[p.mat.key] = (m[p.mat.key] || 0) + 1; return m;
}
const before = {}; for (const d of F.DISHES) before[d.id] = build(d);
let src = fs.readFileSync(dir + 'src/food.js', 'utf8');
const oldV = {};
for (const k in F.VESSELS) {
  const V = F.VESSELS[k]; oldV[k] = { ...V }; const sc = SCALE[k]; const s = typeof sc === 'number' ? sc : sc.w, sh = typeof sc === 'number' ? sc : sc.h;   // 倍率は数（幅と高さ）か {w, h}
  V.wTop = Math.round(V.wTop * s); V.wBot = Math.round(V.wBot * s); V.h = Math.round(V.h * sh);
  const re = new RegExp("(\\n\\s+" + k + ":\\s*\\{ name: '[^']*', wTop: )\\d+(, wBot: )\\d+(, h: )\\d+");
  if (!re.test(src)) throw new Error('vessel line not found: ' + k);
  src = src.replace(re, '$1' + V.wTop + '$2' + V.wBot + '$3' + V.h);
  console.log(k.padEnd(9) + oldV[k].wTop + '/' + oldV[k].wBot + '/' + oldV[k].h + ' → ' + V.wTop + '/' + V.wBot + '/' + V.h + ' (×' + JSON.stringify(sc) + ')');
}
for (const d of F.DISHES) {
  for (const vd of d.vessels) {
    const sc = SCALE[vd.type]; const s = typeof sc === 'number' ? sc : sc.h;
    for (const part of vd.parts) {
      if (part.kind !== 'fill' && part.kind !== 'liquid') continue;
      const oldLevel = part.level, oldDome = part.dome;
      if (part.dome) part.dome = Math.round(part.dome * s);
      const target = before[d.id][part.mat] || 0; let best = null;
      for (let lv = .3; lv <= .96; lv += .01) { part.level = Math.round(lv * 100) / 100; const c = build(d)[part.mat] || 0; const diff = Math.abs(c - target); if (!best || diff < best.diff) best = { lv: part.level, c, diff }; }
      part.level = best.lv;
      // その料理の行の中だけ書き換える
      const li = src.indexOf("{ id: '" + d.id + "'"); const le = src.indexOf('\n', src.indexOf('vessels:', li)); const le2 = src.indexOf('\n', le + 1);
      const seg = src.slice(li, le2);
      const re = new RegExp("(kind: '" + part.kind + "', mat: '" + part.mat + "', level: )[\\d.]+(, dome: )?(\\d+)?");
      if (!re.test(seg)) throw new Error('part not found: ' + d.id + ' ' + part.mat);
      const seg2 = seg.replace(re, (m0, a, b) => a + String(best.lv).replace(/^0\./, '.') + (b ? b + part.dome : ''));
      src = src.slice(0, li) + seg2 + src.slice(li + seg.length);
      console.log(d.id.padEnd(11) + part.mat.padEnd(7) + 'level ' + oldLevel + ' → ' + best.lv + (oldDome ? '  dome ' + oldDome + ' → ' + part.dome : '') + '  粒 ' + target + ' → ' + best.c);
    }
  }
}
fs.writeFileSync(dir + 'src/food.js', src);
console.log('food.js written');
