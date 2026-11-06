// src/textures.js — 質感の素材（木・布・陶器・肉・衣・パンなど）を手続きで描く。
// tools/make-assets.js がこれで assets/tex/*.png を作る。画面側（render.js）は PNG を読み、無ければこれで作り直す。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GohanTextures = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  // 乱数（seed 固定）
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // つなぎ目のない値ノイズ（period で折り返す）
  function makeNoise(seed, period) {
    const r = rng(seed); const P = period; const g = new Float32Array(P * P); for (let i = 0; i < P * P; i++) g[i] = r();
    const sm = t => t * t * (3 - 2 * t);
    const at = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y); const fx = sm(x - xi), fy = sm(y - yi); const x0 = ((xi % P) + P) % P, y0 = ((yi % P) + P) % P, x1 = (x0 + 1) % P, y1 = (y0 + 1) % P; const a = g[y0 * P + x0], b = g[y0 * P + x1], c = g[y1 * P + x0], d = g[y1 * P + x1]; return lerp(lerp(a, b, fx), lerp(c, d, fx), fy); };
    // fbm: x,y は 0..1（1 周期）
    const fbm = (x, y, oct, lac, gain) => { let v = 0, amp = 1, f = 1, sum = 0; for (let o = 0; o < oct; o++) { v += amp * at(x * P * f, y * P * f); sum += amp; amp *= (gain || .5); f *= (lac || 2); } return v / sum; };
    return { at, fbm, P };
  }
  function canvas(size) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }
  // 画素ごとに色を決める。fn(u,v) → [r,g,b,a]（u,v は 0..1）
  function pixels(size, fn) {
    const c = canvas(size); const x = c.getContext('2d'); const img = x.createImageData(size, size); const d = img.data;
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) { const o = (j * size + i) * 4; const col = fn(i / size, j / size, i, j); d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = col.length > 3 ? col[3] : 255; }
    x.putImageData(img, 0, 0); return c;
  }
  // つなぎ目なしで描くために、同じ描画を 9 回ずらして行う
  function tiled(ctx, size, draw) { for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { ctx.save(); ctx.translate(ox * size, oy * size); draw(); ctx.restore(); } }
  const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  const GEN = {
    // 木の天板（オーク系、横方向の木目）
    wood(size) {
      const n = makeNoise(11, 8), n2 = makeNoise(12, 64);
      const A = hexToRgb('#d2a06a'), B = hexToRgb('#9a6433'), C = hexToRgb('#5e3716');
      return pixels(size, (u, v) => {
        // 年輪を大きくゆがめて、板目らしい流れにする
        const warp = n.fbm(u * .7, v * .5, 3) * .9 + n2.fbm(u * 2, v * 2, 2) * .15;
        const ring = Math.sin((v * 5 + warp * (1 + u * .4)) * Math.PI * 2);
        const fine = n2.fbm(u * 6, v * 60, 2);
        let t = .5 + ring * .22 + (fine - .5) * .45; t = clamp(t, 0, 1);
        let col = t < .5 ? mixc(A, B, t * 2) : mixc(B, C, (t - .5) * 2);
        const pore = n2.at(u * 320, v * 10) > .94 ? .78 : 1;
        return [col[0] * pore, col[1] * pore, col[2] * pore];
      });
    },
    // 濃い木（くるみ系。木の器・箸）
    wood_dark(size) {
      const n = makeNoise(21, 16), n2 = makeNoise(22, 64);
      const A = hexToRgb('#8a5a30'), B = hexToRgb('#5a3415'), C = hexToRgb('#2e180a');
      return pixels(size, (u, v) => {
        const warp = n.fbm(u * .5, v * 2, 3) * .4; const ring = Math.sin((v * 7 + warp) * Math.PI * 2); const fine = n2.fbm(u * 6, v * 30, 2);
        let t = clamp(.5 + ring * .22 + (fine - .5) * .6, 0, 1); const col = t < .5 ? mixc(A, B, t * 2) : mixc(B, C, (t - .5) * 2); return col;
      });
    },
    // 麻布（ランチョンマット）
    cloth(size) {
      const n = makeNoise(31, 32);
      const A = hexToRgb('#d9c7a6'), B = hexToRgb('#a8946f');
      return pixels(size, (u, v, i, j) => {
        const wx = Math.sin(i * Math.PI / 3) * .5 + .5, wy = Math.sin(j * Math.PI / 3) * .5 + .5;
        const weave = ((Math.floor(i / 3) + Math.floor(j / 3)) % 2 ? wx : wy) * .5 + .25;
        const t = clamp(weave * .6 + n.fbm(u, v, 3) * .5, 0, 1); return mixc(A, B, 1 - t);
      });
    },
    // 壁（漆喰）
    plaster(size) {
      const n = makeNoise(41, 32);
      const A = hexToRgb('#f3eadb'), B = hexToRgb('#d9ccb5');
      return pixels(size, (u, v) => { const t = n.fbm(u, v, 5, 2.1, .55); const s = n.at(u * 400, v * 400) > .97 ? .9 : 1; const c = mixc(A, B, clamp((t - .3) * 1.6, 0, 1)); return [c[0] * s, c[1] * s, c[2] * s]; });
    },
    // 白い陶器（釉薬のむら・鉄点）
    ceramic(size) {
      const n = makeNoise(51, 32);
      const A = hexToRgb('#f6f4ee'), B = hexToRgb('#dcd8cd');
      return pixels(size, (u, v) => { const t = n.fbm(u, v, 4); const spot = n.at(u * 220 + 7, v * 220) > .985 ? .55 : 1; const c = mixc(A, B, clamp((t - .35) * 1.4, 0, 1)); return [c[0] * spot, c[1] * spot, c[2] * spot]; });
    },
    // 漆（お椀）
    lacquer(size) {
      const n = makeNoise(61, 16);
      const A = hexToRgb('#4a2418'), B = hexToRgb('#2a110a');
      return pixels(size, (u, v) => { const t = n.fbm(u, v, 3); return mixc(A, B, clamp((t - .3) * 1.5, 0, 1)); });
    },
    // 石の器（御影石）
    stone(size) {
      const n = makeNoise(71, 64);
      const A = hexToRgb('#8c8c86'), B = hexToRgb('#55554f'), C = hexToRgb('#c9c9c2');
      return pixels(size, (u, v) => { const t = n.fbm(u, v, 4, 2.3, .6); const g = n.at(u * 160, v * 160); let c = mixc(A, B, clamp((t - .35) * 1.8, 0, 1)); if (g > .94) c = C; else if (g < .05) c = B; return c; });
    },
    // 鮭の身（白い筋）
    salmon(size) {
      const n = makeNoise(81, 16);
      const A = hexToRgb('#f08a60'), B = hexToRgb('#d9633c'), Wt = hexToRgb('#ffe3d2');
      return pixels(size, (u, v) => {
        const warp = n.fbm(u * 2, v * 2, 3) * .25;
        const stripe = Math.abs(Math.sin((v * 6 + Math.abs(u - .5) * 1.2 + warp) * Math.PI));
        const base = mixc(A, B, n.fbm(u * 3, v * 3, 3));
        const w = stripe > .88 ? (stripe - .88) / .12 : 0; return mixc(base, Wt, w * .9);
      });
    },
    // 白身魚
    whitefish(size) {
      const n = makeNoise(91, 16);
      const A = hexToRgb('#f6efe2'), B = hexToRgb('#dccbb3');
      return pixels(size, (u, v) => { const warp = n.fbm(u * 2, v * 2, 2) * .3; const stripe = Math.abs(Math.sin((v * 7 + warp) * Math.PI)); const base = mixc(A, B, n.fbm(u * 3, v * 3, 3) * .8); return mixc(base, hexToRgb('#ffffff'), stripe > .9 ? .6 : 0); });
    },
    // 豆腐（細かい気泡）
    tofu(size) {
      const n = makeNoise(101, 64);
      const A = hexToRgb('#fbf8f0'), B = hexToRgb('#e3dccb');
      return pixels(size, (u, v) => { const t = n.fbm(u, v, 3); const pore = n.at(u * 200, v * 200) > .975 ? .9 : 1; const c = mixc(A, B, clamp((t - .4) * 1.5, 0, 1)); return [c[0] * pore, c[1] * pore, c[2] * pore]; });
    },
    // のり（黒緑、繊維と光）
    nori(size) {
      const n = makeNoise(111, 32);
      const A = hexToRgb('#1a2a1c'), B = hexToRgb('#0a120b'), C = hexToRgb('#3f6a44');
      return pixels(size, (u, v) => { const t = n.fbm(u * 1, v * 6, 4); const hole = n.at(u * 180, v * 180) > .985; let c = mixc(A, B, clamp((t - .3) * 1.6, 0, 1)); if (t > .62) c = mixc(c, C, (t - .62) * 2.5); if (hole) c = mixc(c, C, .6); return c; });
    },
    // 豚肉（白い脂のさし）
    meat_pork(size) {
      const n = makeNoise(121, 16);
      const A = hexToRgb('#e6bfae'), B = hexToRgb('#c9937f'), F = hexToRgb('#fbf3ec');
      return pixels(size, (u, v) => { const t = n.fbm(u * 2, v * 2, 3); const fiber = Math.sin((u * 40 + n.fbm(u, v * 4, 2) * 3) * Math.PI) * .5 + .5; let c = mixc(A, B, clamp((t - .35) * 1.6, 0, 1) * .8 + fiber * .2); const marble = n.fbm(u * 3 + .3, v * 3, 3); if (marble > .6) c = mixc(c, F, clamp((marble - .6) * 4, 0, 1)); return c; });
    },
    // 牛肉・チャーシュー（濃い繊維）
    meat_beef(size) {
      const n = makeNoise(131, 16);
      const A = hexToRgb('#8a4a30'), B = hexToRgb('#4e2412'), F = hexToRgb('#d6b59a');
      return pixels(size, (u, v) => { const t = n.fbm(u * 2, v * 2, 3); const fiber = Math.sin((u * 36 + n.fbm(u, v * 5, 2) * 4) * Math.PI) * .5 + .5; let c = mixc(A, B, clamp((t - .3) * 1.5, 0, 1) * .7 + fiber * .3); const marble = n.fbm(u * 4 + .6, v * 4, 3); if (marble > .66) c = mixc(c, F, clamp((marble - .66) * 3, 0, 1) * .7); return c; });
    },
    // 衣（パン粉のつぶつぶ）
    koromo(size) {
      const c = canvas(size); const x = c.getContext('2d'); const r = rng(141);
      x.fillStyle = '#b8742c'; x.fillRect(0, 0, size, size);
      tiled(x, size, () => { for (let i = 0; i < 320; i++) { const px = r() * size, py = r() * size, rr = 3 + r() * 7; const t = r(); x.fillStyle = t < .3 ? '#e8b05c' : t < .7 ? '#c98a3e' : '#8f5218'; x.beginPath(); x.ellipse(px, py, rr, rr * (.6 + r() * .5), r() * 3, 0, Math.PI * 2); x.fill(); x.fillStyle = 'rgba(255,230,170,.35)'; x.beginPath(); x.ellipse(px - rr * .25, py - rr * .3, rr * .4, rr * .25, 0, 0, Math.PI * 2); x.fill(); } });
      return c;
    },
    // パンの中身（気泡）
    bread(size) {
      const c = canvas(size); const x = c.getContext('2d'); const r = rng(151);
      x.fillStyle = '#efe0bf'; x.fillRect(0, 0, size, size);
      tiled(x, size, () => { for (let i = 0; i < 260; i++) { const px = r() * size, py = r() * size, rr = 1.5 + r() * 6; x.fillStyle = 'rgba(' + (150 + r() * 40 | 0) + ',' + (110 + r() * 30 | 0) + ',' + (70 + r() * 20 | 0) + ',' + (.35 + r() * .4) + ')'; x.beginPath(); x.ellipse(px, py, rr, rr * (.6 + r() * .6), r() * 3, 0, Math.PI * 2); x.fill(); } });
      return c;
    },
    // パンの皮（焼き色・ひび）
    crust(size) {
      const n = makeNoise(161, 16);
      const A = hexToRgb('#c27a3a'), B = hexToRgb('#7a3f12'), C = hexToRgb('#f0d6a8');
      return pixels(size, (u, v) => { const t = n.fbm(u, v, 4, 2.2, .55); let c = mixc(A, B, clamp((t - .3) * 1.7, 0, 1)); const crack = n.fbm(u * 2 + .5, v * 2, 2); if (Math.abs(crack - .5) < .012) c = mixc(c, C, .7); const flour = n.at(u * 150, v * 150); if (flour > .96) c = mixc(c, C, .5); return c; });
    },
    // オムレツ（焼き目）
    omelet(size) {
      const n = makeNoise(171, 16);
      const A = hexToRgb('#f6c84a'), B = hexToRgb('#e3a41e'), C = hexToRgb('#b86e18');
      return pixels(size, (u, v) => { const t = n.fbm(u, v, 4); let c = mixc(A, B, clamp((t - .35) * 1.6, 0, 1)); const b = n.fbm(u * 2 + .3, v * 2 + .7, 3); if (b > .58) c = mixc(c, C, clamp((b - .58) * 3, 0, 1)); return c; });
    },
    // ゼリー（半透明・泡）
    jelly(size) {
      const n = makeNoise(181, 16);
      const A = hexToRgb('#8fd8f4'), B = hexToRgb('#4fb0dc');
      const c = pixels(size, (u, v) => { const t = n.fbm(u, v, 3); const col = mixc(A, B, clamp((t - .3) * 1.4, 0, 1)); return [col[0], col[1], col[2], 225]; });
      const x = c.getContext('2d'); const r = rng(182);
      tiled(x, size, () => { for (let i = 0; i < 40; i++) { const px = r() * size, py = r() * size, rr = 2 + r() * 6; x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 1.2; x.beginPath(); x.arc(px, py, rr, 0, Math.PI * 2); x.stroke(); x.fillStyle = 'rgba(255,255,255,.5)'; x.beginPath(); x.arc(px - rr * .35, py - rr * .35, rr * .3, 0, Math.PI * 2); x.fill(); } });
      return c;
    },
    // 餃子の皮（粉をふった生地）
    dough(size) {
      const n = makeNoise(191, 32);
      const A = hexToRgb('#f3e2bf'), B = hexToRgb('#d9bf8c'), C = hexToRgb('#b88a46');
      return pixels(size, (u, v) => { const t = n.fbm(u, v, 4); let c = mixc(A, B, clamp((t - .35) * 1.6, 0, 1)); const b = n.fbm(u * 2 + .8, v * 2 + .2, 3); if (b > .62) c = mixc(c, C, clamp((b - .62) * 3, 0, 1)); return c; });
    },
    // 野菜（明暗の構造だけ。色は材質で乗せる）
    veg(size) {
      const n = makeNoise(201, 32);
      return pixels(size, (u, v) => { const t = n.fbm(u * 2, v * 2, 3); const fiber = Math.sin((v * 30 + n.fbm(u * 3, v, 2) * 2) * Math.PI) * .5 + .5; const g = 170 + (t - .5) * 80 + fiber * 40; return [g, g, g]; });
    },
    // 肉・野菜などに重ねる「繊維」（灰色の構造）
    fiber(size) {
      const n = makeNoise(211, 16);
      return pixels(size, (u, v) => { const fiber = Math.sin((u * 44 + n.fbm(u, v * 6, 2) * 5) * Math.PI) * .5 + .5; const t = n.fbm(u * 3, v * 3, 3); const g = 150 + fiber * 60 + (t - .5) * 60; return [g, g, g]; });
    },
    // つぶつぶ（たくあん・じゃがいも・にんじん向けの構造）
    speckle(size) {
      const n = makeNoise(221, 64);
      return pixels(size, (u, v) => { const t = n.fbm(u, v, 4, 2.2, .55); const g = 160 + (t - .5) * 110; return [g, g, g]; });
    },
    // うろこ（ドラゴン）
    scales(size) {
      const c = canvas(size); const x = c.getContext('2d');
      x.fillStyle = '#a7332a'; x.fillRect(0, 0, size, size);
      const st = size / 10; const rows = Math.round(size / (st * .62));   // 行の間隔 = うろこの 6 割（重なる）。位置が周期的なので 1 回で描く
      const scale = (cx, cy) => { x.beginPath(); x.moveTo(cx - st * .5, cy - st * .35); x.bezierCurveTo(cx - st * .58, cy + st * .3, cx - st * .3, cy + st * .62, cx, cy + st * .66); x.bezierCurveTo(cx + st * .3, cy + st * .62, cx + st * .58, cy + st * .3, cx + st * .5, cy - st * .35); x.closePath(); };
      for (let row = -2; row <= rows + 1; row++) for (let col = -1; col <= 11; col++) {
        const ox = (row % 2 ? st / 2 : 0); const cx = col * st + ox, cy = row * st * .62;
        // 下向きの丸い形（上の列に重なる）。中は明るく、下のふちは暗い
        const g = x.createRadialGradient(cx, cy + st * .05, st * .05, cx, cy + st * .15, st * .7); g.addColorStop(0, '#d8664c'); g.addColorStop(.6, '#ad3a2e'); g.addColorStop(1, '#5a120d');
        x.fillStyle = g; scale(cx, cy); x.fill();
        x.strokeStyle = 'rgba(45,6,3,.7)'; x.lineWidth = 1.3; scale(cx, cy); x.stroke();
        x.strokeStyle = 'rgba(255,180,150,.3)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(cx - st * .28, cy + st * .1); x.quadraticCurveTo(cx, cy + st * .3, cx + st * .28, cy + st * .1); x.stroke();
      }
      return c;
    },
    // 服の織り（灰色の構造。服の色を乗せる）
    fabric(size) {
      const n = makeNoise(241, 32);
      return pixels(size, (u, v, i, j) => { const w = ((i % 4) < 2) !== ((j % 4) < 2) ? 1 : 0; const t = n.fbm(u, v, 3); const g = 150 + w * 25 + (t - .5) * 50; return [g, g, g]; });
    },
    // 肌（ごく細かい毛穴）
    skin(size) {
      const n = makeNoise(251, 64);
      return pixels(size, (u, v) => { const t = n.fbm(u, v, 3); const pore = n.at(u * 256, v * 256) > .96 ? -14 : 0; const g = 158 + (t - .5) * 30 + pore; return [g, g, g]; });
    },
    // 和紙（画面の紙）
    paper(size) {
      const n = makeNoise(261, 32);
      const A = hexToRgb('#f9f3e6'), B = hexToRgb('#ebe0cb');
      return pixels(size, (u, v) => { const t = n.fbm(u, v, 5, 2.2, .6); const fib = n.at(u * 300, v * 40) > .95 ? .94 : 1; const c = mixc(A, B, clamp((t - .35) * 1.4, 0, 1)); return [c[0] * fib, c[1] * fib, c[2] * fib]; });
    },
  };
  const SIZES = { wood: 512, plaster: 512, paper: 512 };
  const NAMES = Object.keys(GEN);
  function make(name) { return GEN[name](SIZES[name] || 256); }
  return { make, NAMES, SIZES };
});
