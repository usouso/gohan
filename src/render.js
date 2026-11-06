// src/render.js — 画面の描写。game.js の状態を読んで描くだけ（状態は変えない）。
// 素材（assets/tex/*.png、src/textures.js 製）を模様として使い、食べ物は粒ではなく「面」として描く。
(function (root) {
  'use strict';
  const W = 1600, H = 760;
  const E = root.GohanEngine;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function shade(h, k) { const [r, g, b] = hexToRgb(h); return `rgb(${clamp(Math.round(r * k), 0, 255)},${clamp(Math.round(g * k), 0, 255)},${clamp(Math.round(b * k), 0, 255)})`; }
  function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
  function mix(h1, h2, t) { const a = hexToRgb(h1), b = hexToRgb(h2); return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`; }
  // なめらかな折れ線（Catmull-Rom → ベジェ）
  function smooth(ctx, pts, closed) {
    const n = pts.length; if (n < 2) return;
    const P = i => pts[closed ? (i + n) % n : clamp(i, 0, n - 1)];
    ctx.moveTo(pts[0].x, pts[0].y);
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6, c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
    }
    if (closed) ctx.closePath();
  }
  function capsule(ctx, ax, ay, bx, by, r) { ctx.beginPath(); const ang = Math.atan2(by - ay, bx - ax); ctx.arc(ax, ay, r, ang + Math.PI / 2, ang - Math.PI / 2); ctx.arc(bx, by, r, ang - Math.PI / 2, ang + Math.PI / 2); ctx.closePath(); }
  // 筒の陰影（線分に直交する方向のグラデーション。光は左上から）
  function cylGrad(ctx, ax, ay, bx, by, r, light, base, dark) {
    const dx = bx - ax, dy = by - ay; const L = Math.hypot(dx, dy) || 1; let nx = -dy / L, ny = dx / L;
    if (nx + ny > 0) { nx = -nx; ny = -ny; }   // 法線を光の側（左上）へ
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const g = ctx.createLinearGradient(mx + nx * r, my + ny * r, mx - nx * r, my - ny * r); g.addColorStop(0, light); g.addColorStop(.45, base); g.addColorStop(1, dark); return g;
  }
  function cylinder(ctx, ax, ay, bx, by, r, light, base, dark, outline) { capsule(ctx, ax, ay, bx, by, r); ctx.fillStyle = cylGrad(ctx, ax, ay, bx, by, r, light, base, dark); ctx.fill(); if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 1.5; ctx.stroke(); } }

  // ---- 素材（assets/tex/*.png。読めなければ textures.js で作る） ----
  class Assets {
    constructor() {
      this.img = {}; this.pats = new Map(); this.pending = 0; this.onReady = null;
      const names = (root.GohanTextures && root.GohanTextures.NAMES) || [];
      for (const n of names) {
        const im = new Image(); this.pending++;
        im.onload = () => { this.img[n] = im; this.done(); };
        im.onerror = () => { try { this.img[n] = root.GohanTextures.make(n); } catch (e) { this.img[n] = null; } this.done(); };
        im.src = 'assets/tex/' + n + '.png';
      }
    }
    done() { this.pending--; if (this.pending === 0 && this.onReady) this.onReady(); }
    has(n) { return !!this.img[n]; }
    // 模様（拡大率つき）。ctx ごとに作る必要があるので、ctx をキーに含める
    pat(ctx, name, scale, angle, ox, oy) {
      const im = this.img[name]; if (!im) return null;
      const key = name + '|' + scale; let m = this.pats.get(ctx); if (!m) { m = new Map(); this.pats.set(ctx, m); }
      let p = m.get(key); if (!p) { p = ctx.createPattern(im, 'repeat'); m.set(key, p); }
      if (p.setTransform) { const mt = new DOMMatrix(); mt.translateSelf(ox || 0, oy || 0); if (angle) mt.rotateSelf(angle * 180 / Math.PI); mt.scaleSelf(scale, scale); p.setTransform(mt); }
      return p;
    }
  }

  // 材質 → 模様。tex=色つきの模様（そのまま貼る）、mul=灰色の構造（材質の色に重ねる）、tint=模様の上に色を重ねる、rough=ふちをざらつかせる、gloss=つや
  const FOOD_TEX = {
    salmon: { tex: 'salmon', scale: .42, along: true }, whitefish: { tex: 'whitefish', scale: .4, along: true }, tofu: { tex: 'tofu', scale: .5, gloss: .5 }, nori: { tex: 'nori', scale: .35, gloss: .7 },
    pork: { tex: 'meat_pork', scale: .38, rough: 1 }, chashu: { tex: 'meat_beef', scale: .4, tint: '#c47a52', rough: 1 }, beef: { tex: 'meat_beef', scale: .35, rough: 1 }, lizardMeat: { tex: 'meat_beef', scale: .4, tint: '#d4603c', rough: 1 },
    koromo: { tex: 'koromo', scale: .32, rough: 2 }, bread: { tex: 'bread', scale: .45, rough: 2 }, crust: { tex: 'crust', scale: .4, rough: 1.5 }, omelet: { tex: 'omelet', scale: .5, gloss: .5 }, jelly: { tex: 'jelly', scale: .5, alpha: .82, gloss: 1 },
    gyozaSkin: { tex: 'dough', scale: .4, blobR: 2.3 }, gyozaFill: { tex: 'meat_pork', scale: .3, tint: '#b07a5c', rough: 1 }, eggWhite: { tex: 'tofu', scale: .5, gloss: .6 },
    potato: { tex: 'veg', scale: .4, mul: true }, carrot: { tex: 'veg', scale: .3, mul: true }, takuan: { tex: 'speckle', scale: .35, mul: true, gloss: .5 }, age: { tex: 'koromo', scale: .6, tint: '#e0a55a' }, wakame: { tex: 'nori', scale: .4, tint: '#6aa775', gloss: .8 }, fishSkin: { tex: 'speckle', scale: .25, mul: true, gloss: .9 }, fgrape: { tex: 'speckle', scale: .4, mul: true, gloss: 1, alpha: .92 },
    menma: { tex: 'fiber', scale: .3, mul: true },
    curry: { tex: 'speckle', scale: .5, mul: true, liquid: true }, stew: { tex: 'speckle', scale: .5, mul: true, liquid: true }, miso: { tex: 'speckle', scale: .6, mul: true, liquid: true }, broth: { liquid: true }, dashi: { liquid: true }, yolk: { liquid: true, gloss: 1 }, yolkGold: { liquid: true, gloss: 1, glow: true },
  };
  // 器の見た目（断面）
  const VESSEL_LOOK = {
    chawan: { tex: 'ceramic', scale: .5, inner: '#f3f1ea', wall: '#e6e3d9', deco: 'blue' },
    don: { tex: 'ceramic', scale: .5, inner: '#ece7d8', wall: '#2f3a55', deco: 'band' },
    owan: { tex: 'lacquer', scale: .6, inner: '#9b2d1e', wall: '#2b140d', deco: 'gold' },
    sara: { tex: 'ceramic', scale: .5, inner: '#f7f4ed', wall: '#eeebe3', deco: 'rimline' },
    fukazara: { tex: 'ceramic', scale: .5, inner: '#f3eee3', wall: '#e8e2d4', deco: 'rimline' },
    ishi: { tex: 'stone', scale: .7, inner: '#6c6c66', wall: '#55554f' },
    ki: { tex: 'wood_dark', scale: .6, inner: '#8b5a2d', wall: '#6a4120' },
  };

  class Renderer {
    constructor(canvas) {
      this.cv = canvas; this.ctx = canvas.getContext('2d'); this.sprites = new Map();
      this.assets = new Assets(); this.assets.onReady = () => { this.bg = null; };
      // 食べ物の「面」を作るための下地（半分の解像度）と、合成用の層（そのままの大きさ）
      this.K = .5; this.mk = document.createElement('canvas'); this.mk.width = Math.ceil(W * this.K); this.mk.height = Math.ceil(H * this.K); this.mkx = this.mk.getContext('2d', { willReadFrequently: true });
      this.mo = document.createElement('canvas'); this.mo.width = this.mk.width; this.mo.height = this.mk.height; this.mox = this.mo.getContext('2d');
      this.layer = document.createElement('canvas'); this.layer.width = W; this.layer.height = H; this.lx = this.layer.getContext('2d');
      this.noise = new Uint8Array(4096); let s = 99; for (let i = 0; i < 4096; i++) { s = (s * 16807) % 2147483647; this.noise[i] = s & 255; }
      // ぼかした粒（1回描いて使いまわす。毎回グラデーションを作るより速い）
      this.blob = document.createElement('canvas'); this.blob.width = this.blob.height = 64; { const bx = this.blob.getContext('2d'); const g = bx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.5, 'rgba(0,0,0,.75)'); g.addColorStop(1, 'rgba(0,0,0,0)'); bx.fillStyle = g; bx.fillRect(0, 0, 64, 64); }
      this.alive = new Uint8Array(this.mk.width * this.mk.height);
      this.bg = null; this.lastMs = 0;
    }
    // ---- 背景（1回だけ描いて使いまわす） ----
    background(game) {
      const vl = game.vesselList; const matL = Math.min(...vl.map(v => v.left)) - 70, matR = Math.max(...vl.map(v => v.right)) + 70;   // ランチョンマットは器の端から
      const key = game.tableRight + '|' + game.diner.id + '|' + matL + '|' + matR + '|' + (this.assets.pending === 0);
      if (this.bg && this.bgKey === key) return this.bg;
      const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); const A = this.assets;
      const ty = game.tableY, tr = game.tableRight + 40;
      // 壁（漆喰）
      x.fillStyle = '#e9dfcd'; x.fillRect(0, 0, W, H);
      const pp = A.pat(x, 'plaster', 1); if (pp) { x.fillStyle = pp; x.fillRect(0, 0, W, ty); }
      const g = x.createLinearGradient(0, 0, 0, ty); g.addColorStop(0, 'rgba(255,250,240,.25)'); g.addColorStop(.55, 'rgba(200,180,150,.0)'); g.addColorStop(1, 'rgba(120,90,60,.35)'); x.fillStyle = g; x.fillRect(0, 0, W, ty);
      // 窓（左上）とその光
      x.save(); x.globalAlpha = .9; const wx0 = 70, wy0 = 30, ww = 330, wh = 250;
      const wg = x.createLinearGradient(wx0, wy0, wx0 + ww, wy0 + wh); wg.addColorStop(0, '#fff9ea'); wg.addColorStop(1, '#f1e6cf'); x.fillStyle = wg; x.beginPath(); x.roundRect(wx0, wy0, ww, wh, 6); x.fill();
      x.strokeStyle = '#b89a78'; x.lineWidth = 8; x.strokeRect(wx0, wy0, ww, wh); x.lineWidth = 4; x.beginPath(); x.moveTo(wx0 + ww / 2, wy0); x.lineTo(wx0 + ww / 2, wy0 + wh); x.moveTo(wx0, wy0 + wh * .45); x.lineTo(wx0 + ww, wy0 + wh * .45); x.stroke();
      x.restore();
      const lg = x.createRadialGradient(240, 150, 40, 240, 150, 900); lg.addColorStop(0, 'rgba(255,248,225,.5)'); lg.addColorStop(1, 'rgba(255,248,225,0)'); x.fillStyle = lg; x.fillRect(0, 0, W, ty);
      // 食べる人の影（壁に落ちる。あご閉じの形で固定）
      x.save(); x.filter = 'blur(22px)'; x.fillStyle = 'rgba(70,45,25,.28)'; const M = game.mouth, S = game.shoulder, hs = game.diner.hs;
      x.beginPath(); x.ellipse(M.x + 150 * hs + 50, M.y - 90 * hs + 40, 220 * hs, 230 * hs, 0, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.roundRect(S.x - 70 * hs + 50, S.y + 10, 220 * hs, 400, 60); x.fill(); x.restore();
      // 幅木
      x.fillStyle = '#6b4a30'; x.fillRect(0, ty - 26, W, 12); x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(0, ty - 14, W, 2);
      // テーブル：天板の奥（手前の面より少し明るい）
      const wp = A.pat(x, 'wood', .75, 0, 0, ty - 20);
      x.fillStyle = wp || '#b8834c'; x.fillRect(0, ty - 14, tr, 16);
      x.fillStyle = 'rgba(255,240,210,.22)'; x.fillRect(0, ty - 14, tr, 16);
      // ランチョンマット（麻布）
      const cp = A.pat(x, 'cloth', .9); x.fillStyle = cp || '#cdbb9a'; x.fillRect(matL, ty - 12, matR - matL, 14); x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(matL, ty - 12, matR - matL, 2); x.fillStyle = 'rgba(255,255,255,.15)'; x.fillRect(matL, ty - 10, matR - matL, 2);
      // テーブル：手前の面（厚み）
      const th = 44; const wp2 = A.pat(x, 'wood', .75, 0, 0, ty + 2); x.fillStyle = wp2 || '#9a6433'; x.fillRect(0, ty + 2, tr, th);
      const eg = x.createLinearGradient(0, ty + 2, 0, ty + th); eg.addColorStop(0, 'rgba(255,230,190,.28)'); eg.addColorStop(.12, 'rgba(90,50,20,.08)'); eg.addColorStop(1, 'rgba(40,20,5,.45)'); x.fillStyle = eg; x.fillRect(0, ty + 2, tr, th);
      x.fillStyle = 'rgba(255,240,215,.55)'; x.fillRect(0, ty + 1, tr, 2);
      // テーブルの端（右）
      x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(tr - 6, ty - 14, 6, th + 16); x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(tr - 2, ty - 14, 2, th + 16);
      // 床（暗い板）
      const fp = A.pat(x, 'wood_dark', 1.2); x.fillStyle = fp || '#3a2a1e'; x.fillRect(0, ty + th, W, H - ty - th);
      const fg = x.createLinearGradient(0, ty + th, 0, H); fg.addColorStop(0, 'rgba(0,0,0,.55)'); fg.addColorStop(1, 'rgba(0,0,0,.8)'); x.fillStyle = fg; x.fillRect(0, ty + th, W, H - ty - th);
      x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(0, ty + th, tr, 14);
      // 画面のふち（少し暗く）
      const vg = x.createRadialGradient(W * .45, H * .4, H * .5, W * .5, H * .5, W * .75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(30,15,5,.28)'); x.fillStyle = vg; x.fillRect(0, 0, W, H);
      this.bg = c; this.bgKey = key; return c;
    }
    // ---- 器（断面。奥の内面 → 壁の厚み → ふち） ----
    drawVessel(ctx, v) {
      const V = v.def; const pts = v.pts; const look = VESSEL_LOOK[v.type] || VESSEL_LOOK.sara; const A = this.assets;
      // 影（マットの上）
      ctx.save(); const sg = ctx.createRadialGradient(v.cx + 8, v.tableY + 3, 10, v.cx + 8, v.tableY + 3, V.wBot * 1.0); sg.addColorStop(0, 'rgba(30,15,5,.45)'); sg.addColorStop(.6, 'rgba(30,15,5,.18)'); sg.addColorStop(1, 'rgba(30,15,5,0)'); ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(v.cx + 8, v.tableY + 3, V.wBot * 1.0, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      // 足（高台）
      ctx.fillStyle = shade(look.wall, .78); ctx.beginPath(); ctx.moveTo(v.cx - V.wBot / 2 + 10, v.bottom); ctx.lineTo(v.cx + V.wBot / 2 - 10, v.bottom); ctx.lineTo(v.cx + V.wBot / 2 - 6, v.tableY); ctx.lineTo(v.cx - V.wBot / 2 + 6, v.tableY); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(v.cx - V.wBot / 2 + 10, v.bottom, 6, V.foot);
      // 奥の内面
      ctx.save(); ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath(); ctx.clip();
      const ig = ctx.createLinearGradient(0, v.top, 0, v.bottom); ig.addColorStop(0, shade(look.inner, .9)); ig.addColorStop(.3, shade(look.inner, 1.02)); ig.addColorStop(1, shade(look.inner, .6)); ctx.fillStyle = ig; ctx.fillRect(v.left - 20, v.top - 20, v.right - v.left + 40, v.bottom - v.top + 40);
      const tp = A.pat(ctx, look.tex, look.scale); if (tp) { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = look.tex === 'ceramic' ? .55 : .7; ctx.fillStyle = tp; ctx.fillRect(v.left - 20, v.top - 20, v.right - v.left + 40, v.bottom - v.top + 40); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      // 横方向の丸み（両端が暗い）と、ふちの下の影
      const hg = ctx.createLinearGradient(v.left, 0, v.right, 0); hg.addColorStop(0, 'rgba(0,0,0,.28)'); hg.addColorStop(.22, 'rgba(255,255,255,.1)'); hg.addColorStop(.55, 'rgba(255,255,255,0)'); hg.addColorStop(1, 'rgba(0,0,0,.3)'); ctx.fillStyle = hg; ctx.fillRect(v.left - 20, v.top - 20, v.right - v.left + 40, v.bottom - v.top + 40);
      const rg = ctx.createLinearGradient(0, v.top, 0, v.top + 26); rg.addColorStop(0, 'rgba(0,0,0,.28)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = rg; ctx.fillRect(v.left - 20, v.top - 20, v.right - v.left + 40, 50);
      // 模様
      if (look.deco === 'blue') { ctx.strokeStyle = 'rgba(40,70,150,.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(v.left, v.top + 22); ctx.lineTo(v.right, v.top + 22); ctx.stroke(); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(v.left, v.top + 30); ctx.lineTo(v.right, v.top + 30); ctx.stroke(); ctx.fillStyle = 'rgba(40,70,150,.45)'; for (let xx = v.left + 30; xx < v.right - 20; xx += 34) { ctx.beginPath(); ctx.arc(xx, v.top + 50, 4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(xx + 10, v.top + 58, 7, 3, .6, 0, Math.PI * 2); ctx.fill(); } }
      else if (look.deco === 'band') { ctx.fillStyle = '#2f3a55'; ctx.fillRect(v.left - 20, v.top - 20, v.right - v.left + 40, 34); ctx.strokeStyle = 'rgba(230,220,200,.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(v.left, v.top + 8); ctx.lineTo(v.right, v.top + 8); ctx.stroke(); ctx.strokeStyle = 'rgba(190,60,50,.85)'; ctx.lineWidth = 6; ctx.setLineDash([18, 10]); ctx.beginPath(); ctx.moveTo(v.left, v.top + 22); ctx.lineTo(v.right, v.top + 22); ctx.stroke(); ctx.setLineDash([]); }
      else if (look.deco === 'gold') { ctx.strokeStyle = 'rgba(230,190,90,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(v.left, v.top + 16); ctx.lineTo(v.right, v.top + 16); ctx.stroke(); }
      else if (look.deco === 'rimline') { ctx.strokeStyle = 'rgba(60,90,160,.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(v.left, v.top + 10); ctx.lineTo(v.right, v.top + 10); ctx.stroke(); }
      // つや（左上の光）
      const gl = ctx.createLinearGradient(v.left, v.top, v.cx, v.bottom); gl.addColorStop(0, 'rgba(255,255,255,.22)'); gl.addColorStop(.5, 'rgba(255,255,255,0)'); ctx.fillStyle = gl; ctx.fillRect(v.left - 20, v.top - 20, v.right - v.left + 40, v.bottom - v.top + 40);
      ctx.restore();
      // 壁の厚み（断面）
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = shade(look.wall, .55); ctx.lineWidth = V.segR * 2 + 2.5; ctx.stroke();
      const wg = ctx.createLinearGradient(0, v.top, 0, v.bottom); wg.addColorStop(0, shade(look.wall, 1.1)); wg.addColorStop(1, shade(look.wall, .7)); ctx.strokeStyle = wg; ctx.lineWidth = V.segR * 2 - 1; ctx.stroke();
      if (look.tex !== 'ceramic') { const tp2 = A.pat(ctx, look.tex, look.scale); if (tp2) { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .6; ctx.strokeStyle = tp2; ctx.stroke(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; } }
      // 切り口（ふち）は明るく
      for (const p of [pts[0], pts[pts.length - 1]]) { const cg = ctx.createRadialGradient(p.x - 1, p.y - 1, 1, p.x, p.y, V.segR + 2); cg.addColorStop(0, '#ffffff'); cg.addColorStop(1, shade(look.wall, 1.05)); ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(p.x, p.y, V.segR + 1.5, V.segR * .7 + 1, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    // ---- 粒の見た目（米粒など。種類・大きさごとに1回だけ描く） ----
    sprite(mat, r, mash) {
      const key = mat.key + '|' + Math.round(r * 2) / 2 + '|' + Math.min(mash, 3); let s = this.sprites.get(key); if (s) return s;
      const pad = 4, size = Math.ceil(r * 3 + pad * 2); const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); const cx = size / 2, cy = size / 2;
      const m = Math.min(mash, 3);
      if (m >= 3) { // すりつぶれた粒（ねっとり）
        x.fillStyle = rgba(mix(mat.color, mat.dark, .35), .92); x.beginPath(); x.ellipse(cx, cy, r * 1.2, r * .95, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = 'rgba(255,255,255,.18)'; x.beginPath(); x.ellipse(cx - r * .3, cy - r * .3, r * .4, r * .22, -.5, 0, Math.PI * 2); x.fill();
      } else { // 米粒：半透明で、少し影と光
        x.fillStyle = 'rgba(60,40,20,.22)'; x.beginPath(); x.ellipse(cx + 1.2, cy + 1.6, r * 1.22, r * .78, 0, 0, Math.PI * 2); x.fill();
        const g = x.createRadialGradient(cx - r * .3, cy - r * .3, r * .1, cx, cy, r * 1.3); g.addColorStop(0, '#ffffff'); g.addColorStop(.5, mix(mat.color, mat.dark, .1 + .2 * m)); g.addColorStop(1, mix(mat.dark, mat.color, .3)); x.fillStyle = g;
        x.beginPath(); x.ellipse(cx, cy, r * 1.25, r * .8, 0, 0, Math.PI * 2); x.fill();
        x.strokeStyle = 'rgba(120,100,70,.25)'; x.lineWidth = .8; x.stroke();
        x.fillStyle = 'rgba(255,255,255,.75)'; x.beginPath(); x.ellipse(cx - r * .4, cy - r * .28, r * .34, r * .16, -.4, 0, Math.PI * 2); x.fill();
      }
      s = { c, size }; this.sprites.set(key, s); return s;
    }
    // ---- 食べ物の「面」：粒をぼかして切り出し、模様を貼り、ふちに陰影をつける ----
    // ps: 同じ材質・同じかたまりの粒。opts: FOOD_TEX の項目。paste=すりつぶれた塊として描く
    drawSurface(ctx, ps, mat, opts, paste) {
      const K = this.K, mk = this.mkx, cw = this.mk.width, ch = this.mk.height;
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (const p of ps) { const rr = p.r * 1.8; if (p.x - rr < minX) minX = p.x - rr; if (p.x + rr > maxX) maxX = p.x + rr; if (p.y - rr < minY) minY = p.y - rr; if (p.y + rr > maxY) maxY = p.y + rr; }
      const x0 = clamp(Math.floor(minX * K) - 3, 0, cw - 1), x1 = clamp(Math.ceil(maxX * K) + 3, 0, cw), y0 = clamp(Math.floor(minY * K) - 3, 0, ch - 1), y1 = clamp(Math.ceil(maxY * K) + 3, 0, ch);
      const w = x1 - x0, h = y1 - y0; if (w <= 0 || h <= 0) return;
      mk.clearRect(x0, y0, w, h);
      const liquid = !!opts.liquid; const bk = (opts.blobR || (liquid ? 2.0 : 1.6)) * (paste ? 1.2 : 1) * K;
      for (const p of ps) { const r = p.r * bk; mk.drawImage(this.blob, p.x * K - r, p.y * K - r, r * 2, r * 2); }
      const img = mk.getImageData(x0, y0, w, h); const d = img.data; const alive = this.alive;
      const rough = (opts.rough || 0) * (paste ? 1.2 : 1); const nz = this.noise;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; let th = 120; if (rough) th += (nz[(((x + x0) & 63) << 6) | ((y + y0) & 63)] - 128) * .22 * rough; alive[i] = d[i * 4 + 3] > th ? 1 : 0; }
      const lightK = liquid ? 70 : (opts.gloss ? 46 + 30 * opts.gloss : 40), darkK = liquid ? 55 : 62;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, o = i * 4; if (!alive[i]) { d[o + 3] = 0; continue; }
        const up1 = y >= 1 ? alive[i - w] : 0, up2 = y >= 2 ? alive[i - 2 * w] : 0, lf1 = x >= 1 ? alive[i - 1] : 0, lf2 = x >= 2 ? alive[i - 2] : 0;
        const dn1 = y < h - 1 ? alive[i + w] : 0, dn2 = y < h - 2 ? alive[i + 2 * w] : 0, rt1 = x < w - 1 ? alive[i + 1] : 0, rt2 = x < w - 2 ? alive[i + 2] : 0;
        let v = 128;
        if (!up1) v += lightK; else if (!up2 || !lf1) v += lightK * .55; else if (!lf2) v += lightK * .25;
        if (!dn1) v -= darkK; else if (!dn2 || !rt1) v -= darkK * .55; else if (!rt2) v -= darkK * .25;
        if (liquid && (!up1 || !up2)) v = 128 + lightK;   // 液体の表面は一様に明るく
        d[o] = d[o + 1] = d[o + 2] = clamp(v, 0, 255); d[o + 3] = 255;
      }
      this.mox.putImageData(img, x0, y0);
      // 合成：形 → 色・模様 → 陰影
      const L = this.lx; const sx = x0 / K, sy = y0 / K, sw = w / K, sh = h / K; const A = this.assets;
      L.globalCompositeOperation = 'source-over'; L.globalAlpha = 1; L.clearRect(sx, sy, sw, sh);
      L.drawImage(this.mo, x0, y0, w, h, sx, sy, sw, sh);
      L.globalCompositeOperation = 'source-in';
      let angle = 0; if (opts.along && ps.length > 3) { let mx = 0, my = 0; for (const p of ps) { mx += p.x; my += p.y; } mx /= ps.length; my /= ps.length; let sxx = 0, sxy = 0, syy = 0; for (const p of ps) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; } angle = .5 * Math.atan2(2 * sxy, sxx - syy); }
      const colorPat = (!paste && opts.tex && !opts.mul) ? A.pat(L, opts.tex, opts.scale, angle, (ps[0].cl * 37) % 200, (ps[0].cl * 53) % 200) : null;
      const baseColor = paste ? mix(mat.color, mat.dark, .45) : mat.color;
      L.fillStyle = colorPat || baseColor; L.fillRect(sx, sy, sw, sh);
      const mulPat = (!paste && opts.tex && opts.mul) ? A.pat(L, opts.tex, opts.scale, 0, 0, 0) : null;
      if (mulPat) { L.globalCompositeOperation = 'multiply'; L.globalAlpha = liquid ? .35 : .6; L.fillStyle = mulPat; L.fillRect(sx, sy, sw, sh); L.globalAlpha = 1; L.globalCompositeOperation = 'destination-in'; L.drawImage(this.mo, x0, y0, w, h, sx, sy, sw, sh); }
      if (opts.tint && !paste) { L.globalCompositeOperation = 'multiply'; L.globalAlpha = .5; L.fillStyle = opts.tint; L.fillRect(sx, sy, sw, sh); L.globalAlpha = 1; L.globalCompositeOperation = 'destination-in'; L.drawImage(this.mo, x0, y0, w, h, sx, sy, sw, sh); }
      if (paste) { L.globalCompositeOperation = 'multiply'; L.globalAlpha = .35; L.fillStyle = mat.dark; L.fillRect(sx, sy, sw, sh); L.globalAlpha = 1; L.globalCompositeOperation = 'destination-in'; L.drawImage(this.mo, x0, y0, w, h, sx, sy, sw, sh); }
      L.globalCompositeOperation = 'overlay'; L.drawImage(this.mo, x0, y0, w, h, sx, sy, sw, sh);
      if (liquid && opts.glow) { L.globalCompositeOperation = 'lighter'; L.globalAlpha = .25; L.fillStyle = mat.hi; L.fillRect(sx, sy, sw, sh); L.globalAlpha = 1; L.globalCompositeOperation = 'destination-in'; L.drawImage(this.mo, x0, y0, w, h, sx, sy, sw, sh); }
      L.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.globalAlpha = paste ? .95 : (opts.alpha || (liquid ? .93 : 1)); ctx.drawImage(this.layer, sx, sy, sw, sh, sx, sy, sw, sh); ctx.restore();
    }
    // 麺（つながった粒を1本の線として描く）
    drawNoodles(ctx, game, lineParts) {
      const w = game.world; const adj = new Map();
      for (const c of w.constraints) { if (c.dead) continue; const a = c.a, b = c.b; if (a.mat.shape !== 'line' || a.mat !== b.mat || c.len > a.r * 2.3) continue; if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []); adj.get(a).push(b); adj.get(b).push(a); }
      const seen = new Set(); const chains = [];
      const walk = (start) => { const ch = [start]; seen.add(start); let cur = start, prev = null; for (let k = 0; k < 200; k++) { const ns = adj.get(cur) || []; let nx = null; for (const q of ns) if (q !== prev && !seen.has(q)) { nx = q; break; } if (!nx) break; ch.push(nx); seen.add(nx); prev = cur; cur = nx; } return ch; };
      for (const p of lineParts) { if (seen.has(p)) continue; const ns = adj.get(p) || []; if (ns.length === 1) chains.push(walk(p)); }
      for (const p of lineParts) { if (seen.has(p)) continue; chains.push(walk(p)); }
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const ch of chains) {
        const mat = ch[0].mat; const r = ch[0].r; const mashed = ch.reduce((s, p) => s + p.mash, 0) / ch.length;
        const col = mashed > 1 ? mix(mat.color, mat.dark, .3) : mat.color;
        if (ch.length === 1) { const p = ch[0]; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, r * .95, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = rgba(mat.dark, .5); ctx.lineWidth = 1; ctx.stroke(); continue; }
        const path = () => { ctx.beginPath(); smooth(ctx, ch, false); };
        path(); ctx.strokeStyle = rgba(mat.dark, .55); ctx.lineWidth = r * 2.1; ctx.stroke();
        path(); ctx.strokeStyle = col; ctx.lineWidth = r * 1.8; ctx.stroke();
        ctx.save(); ctx.translate(-r * .2, -r * .45); path(); ctx.strokeStyle = rgba(mat.hi, .55); ctx.lineWidth = r * .6; ctx.stroke(); ctx.restore();
      }
      ctx.restore();
    }
    drawBones(ctx, game, bones) {
      const w = game.world; ctx.save(); ctx.lineCap = 'round';
      for (const c of w.constraints) { if (c.dead) continue; const a = c.a, b = c.b; if (!a.mat.bone || !b.mat.bone) continue; const r = Math.min(a.r, b.r); ctx.strokeStyle = '#a89f8a'; ctx.lineWidth = r * 1.5 + 2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.strokeStyle = '#f7f2e3'; ctx.lineWidth = r * 1.5 - .5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      for (const p of bones) { const g = ctx.createRadialGradient(p.x - p.r * .3, p.y - p.r * .3, 0, p.x, p.y, p.r * 1.1); g.addColorStop(0, '#ffffff'); g.addColorStop(.6, '#efe9d8'); g.addColorStop(1, '#b9b09a'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.05, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    drawFood(ctx, game) {
      const w = game.world;
      // 分ける：液体 → 面（材質・かたまりごと） → 麺 → 骨 → 米粒
      // 材質ごとにまとめる（向きのある魚の身だけ、かたまりごと）。すりつぶれた粒は別のかたまり
      const groups = new Map(); const lines = []; const bones = []; const grains = []; const liquids = new Map(); const grainMass = new Map();
      for (const p of w.particles) {
        const sh = p.mat.shape;
        if (p.mat.liquid) { let a = liquids.get(p.mat); if (!a) { a = []; liquids.set(p.mat, a); } a.push(p); continue; }
        if (sh === 'grain') { grains.push(p); if (p.mash < 3) { let a = grainMass.get(p.mat); if (!a) { a = []; grainMass.set(p.mat, a); } a.push(p); } continue; }
        if (sh === 'bone') { bones.push(p); continue; }
        const paste = p.mash >= 3;
        if (sh === 'line' && !paste) { lines.push(p); continue; }
        const tex = FOOD_TEX[p.mat.key] || {}; const key = p.mat.key + (tex.along ? '|' + p.cl : '') + (paste ? '|p' : '');
        let a = groups.get(key); if (!a) { a = { ps: [], mat: p.mat, paste }; groups.set(key, a); } a.ps.push(p);
      }
      for (const [mat, ps] of liquids) this.drawSurface(ctx, ps, mat, FOOD_TEX[mat.key] || { liquid: true }, false);
      // ごはんは、粒の下に白い「山」を敷く（粒のすき間が見えないように）
      for (const [mat, ps] of grainMass) this.drawSurface(ctx, ps, mat, { blobR: 1.5, gloss: .3, alpha: .85 }, false);
      // 皮（のり・衣・皮）より中身を先に描く
      const list = Array.from(groups.values()); list.sort((a, b) => ((a.mat.shape === 'flat' || a.mat.shape === 'crumb') ? 1 : 0) - ((b.mat.shape === 'flat' || b.mat.shape === 'crumb') ? 1 : 0));
      for (const g of list) this.drawSurface(ctx, g.ps, g.mat, FOOD_TEX[g.mat.key] || {}, g.paste);
      if (lines.length) this.drawNoodles(ctx, game, lines);
      if (bones.length) this.drawBones(ctx, game, bones);
      for (const p of grains) { const s = this.sprite(p.mat, p.r, p.mash); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.drawImage(s.c, -s.size / 2, -s.size / 2); ctx.restore(); }
      // 焼き色（炎）
      ctx.save(); ctx.globalCompositeOperation = 'multiply';
      for (const p of w.particles) { if (!(p.roast > .4)) continue; const k = Math.min(1, (p.roast - .4) / 1.8); ctx.fillStyle = p.roast >= 2.2 ? 'rgba(25,14,8,.85)' : 'rgba(150,80,20,' + (.25 + .55 * k).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.15, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    // ---- 食べる人 ----
    // 口の中の形（天井 → 奥 → 床）。pad で少し外へふくらませる。くちびる側（x=0）は上下に少し伸ばして、丸めても口が閉じないようにする
    cavityPoints(g, pad) {
      const c = g.ceiling, f = g.floor; const pts = [];
      pts.push({ x: 0, y: c[0].y - pad - 6 }); for (let i = 1; i < c.length; i++) pts.push({ x: c[i].x + (i === c.length - 1 ? pad : 0), y: c[i].y - pad });
      pts.push({ x: g.D + pad + 6 * g.hs, y: (c[c.length - 1].y + f[f.length - 1].y) / 2 });
      for (let i = f.length - 1; i >= 1; i--) pts.push({ x: f[i].x + (i === f.length - 1 ? pad : 0), y: f[i].y + pad }); pts.push({ x: 0, y: f[0].y + pad + 6 });
      pts.push({ x: -2, y: (c[0].y + f[0].y) / 2 });
      return pts;
    }
    headPoints(game) {
      const d = game.diner, f = d.face, hs = d.hs; const g = game.geom; const open = g.lipGap; const jawRise = (g.jc || 0) * d.H0 * .4;
      const J = open * .95 - jawRise;  // 下あごの動き
      if (d.kind === 'dragon') {
        const s = hs * .52;
        const up = [{ x: -8, y: -60 * s - 6 }, { x: 24, y: -118 * s }, { x: 110, y: -150 * s }, { x: 230, y: -200 * s }, { x: 300, y: -250 * s }, { x: 400, y: -330 * s }, { x: 470, y: -360 * s }, { x: 560, y: -300 * s }, { x: 640, y: -200 * s }, { x: 660, y: -60 * s }, { x: 620, y: 60 * s }];
        const low = [{ x: 560, y: 150 * s + J * .4 }, { x: 420, y: 190 * s + J * .8 }, { x: 260, y: 170 * s + J }, { x: 120, y: 140 * s + J }, { x: 30, y: 100 * s + J }, { x: -8, y: 60 * s + J + 4 }];
        return { outline: up.concat(low), eye: { x: 280 * s * 1.9, y: -170 * s, r: 18 * s }, nostril: { x: 30, y: -90 * s }, ear: null, kind: 'dragon', s, J };
      }
      const s = hs; const n = f.nose, jw = f.jaw, ch = f.chin, fh = f.forehead;
      const outline = [
        { x: 150 * s, y: -300 * s * fh }, { x: 40 * s, y: -285 * s * fh }, { x: -8 * s, y: -228 * s }, { x: -22 * s * f.brow, y: -185 * s }, { x: -16 * s, y: -150 * s },
        { x: -58 * s * n, y: -88 * s }, { x: -40 * s * n, y: -62 * s }, { x: -14 * s, y: -40 * s }, { x: -12 * s, y: -14 * s }, { x: 0, y: 0 },
        { x: -10 * s, y: 14 * s + J }, { x: -3 * s, y: 36 * s + J }, { x: 2 * s, y: 66 * s * ch + J }, { x: 42 * s, y: 86 * s + J }, { x: 150 * s * jw, y: 92 * s + J * .8 },
        { x: 205 * s, y: 78 * s + J * .4 }, { x: 222 * s, y: 150 * s }, { x: 300 * s, y: 140 * s }, { x: 330 * s, y: -60 * s }, { x: 305 * s, y: -230 * s }, { x: 235 * s, y: -296 * s * fh }];
      return { outline, eye: { x: 12 * s, y: -168 * s, r: 11 * s * f.eye }, brow: { x: 6 * s, y: -192 * s }, ear: { x: 212 * s, y: -150 * s, w: 36 * s * f.ear, h: 58 * s * f.ear }, nostril: { x: -40 * s * n, y: -66 * s }, kind: d.kind, s, J };
    }
    drawClothes(ctx, game) {
      const d = game.diner, L = d.look, hs = d.hs; const S = game.shoulder; const A = this.assets;
      const torsoW = (d.kind === 'dragon' ? 300 : 170) * hs, torsoH = 440;
      ctx.save();
      // 胴（なで肩）
      const x0 = S.x - torsoW * .42, y0 = S.y - 36 * hs;
      ctx.beginPath(); ctx.moveTo(x0 + 20 * hs, y0 + 60 * hs); ctx.quadraticCurveTo(x0, y0 + 10 * hs, x0 + 50 * hs, y0); ctx.lineTo(x0 + torsoW - 50 * hs, y0); ctx.quadraticCurveTo(x0 + torsoW, y0 + 10 * hs, x0 + torsoW - 10 * hs, y0 + 70 * hs); ctx.lineTo(x0 + torsoW, y0 + torsoH); ctx.lineTo(x0, y0 + torsoH); ctx.closePath();
      ctx.save(); ctx.clip();
      const tg = ctx.createLinearGradient(x0, 0, x0 + torsoW, 0); tg.addColorStop(0, shade(L.cloth, 1.12)); tg.addColorStop(.5, L.cloth); tg.addColorStop(1, L.clothDark); ctx.fillStyle = tg; ctx.fillRect(x0 - 10, y0 - 10, torsoW + 20, torsoH + 20);
      if (d.kind === 'dragon') { const sp = A.pat(ctx, 'scales', .32 * hs); if (sp) { ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = .95; ctx.fillStyle = sp; ctx.fillRect(x0 - 10, y0 - 10, torsoW + 20, torsoH + 20); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .35; ctx.fillRect(x0 - 10, y0 - 10, torsoW + 20, torsoH + 20); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; } ctx.fillStyle = L.belly; ctx.beginPath(); ctx.roundRect(x0, y0 + 60, torsoW * .38, torsoH, 34); ctx.fill(); ctx.strokeStyle = 'rgba(80,50,20,.35)'; ctx.lineWidth = 2; for (let yy = y0 + 90; yy < y0 + torsoH; yy += 34) { ctx.beginPath(); ctx.moveTo(x0 + 8, yy); ctx.quadraticCurveTo(x0 + torsoW * .19, yy + 10, x0 + torsoW * .36, yy); ctx.stroke(); } }
      else {
        const fp = A.pat(ctx, 'fabric', .7); if (fp) { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .35; ctx.fillStyle = fp; ctx.fillRect(x0 - 10, y0 - 10, torsoW + 20, torsoH + 20); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
        // しわ
        ctx.strokeStyle = 'rgba(0,0,0,.14)'; ctx.lineWidth = 3 * hs; ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) { const xx = x0 + torsoW * (.25 + i * .18); ctx.beginPath(); ctx.moveTo(xx, y0 + 90 * hs + i * 30); ctx.quadraticCurveTo(xx - 14 * hs, y0 + 220, xx + 10 * hs, y0 + 400); ctx.stroke(); }
        // えり・服の種類
        const cx = x0 + torsoW * .42;
        if (d.kind === 'orc') { ctx.fillStyle = 'rgba(40,25,10,.55)'; ctx.fillRect(x0 + torsoW * .2, y0, 26 * hs, torsoH); ctx.fillRect(x0 + torsoW * .62, y0, 26 * hs, torsoH); ctx.fillStyle = '#b89a5a'; for (const yy of [y0 + 120, y0 + 260]) { ctx.beginPath(); ctx.arc(x0 + torsoW * .2 + 13 * hs, yy, 7 * hs, 0, Math.PI * 2); ctx.fill(); } }
        else if (d.kind === 'elf') { ctx.fillStyle = 'rgba(230,210,150,.75)'; ctx.beginPath(); ctx.moveTo(cx - 30 * hs, y0); ctx.lineTo(cx + 30 * hs, y0); ctx.lineTo(cx + 14 * hs, y0 + torsoH); ctx.lineTo(cx - 14 * hs, y0 + torsoH); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(120,90,40,.5)'; ctx.lineWidth = 2; ctx.stroke(); }
        else if (d.kind === 'fairy') { ctx.strokeStyle = 'rgba(60,120,40,.5)'; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x0 + torsoW * (.2 + i * .3), y0 + 10); ctx.quadraticCurveTo(x0 + torsoW * (.3 + i * .3), y0 + 80, x0 + torsoW * (.15 + i * .3), y0 + 160); ctx.stroke(); } }
        else if (d.id === 'yui') { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.ellipse(cx, y0 + 6 * hs, 44 * hs, 16 * hs, 0, 0, Math.PI); ctx.fill(); ctx.fillStyle = '#fff6e0'; ctx.beginPath(); ctx.moveTo(cx - 36 * hs, y0 + 40 * hs); ctx.quadraticCurveTo(cx, y0 + 30 * hs, cx + 36 * hs, y0 + 40 * hs); ctx.lineTo(cx + 50 * hs, y0 + 200); ctx.quadraticCurveTo(cx, y0 + 230, cx - 50 * hs, y0 + 200); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#e36b8a'; ctx.beginPath(); ctx.arc(cx - 10 * hs, y0 + 120, 12 * hs, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#f6d36b'; ctx.beginPath(); ctx.arc(cx - 10 * hs, y0 + 120, 5 * hs, 0, Math.PI * 2); ctx.fill(); }
        else if (d.id === 'genji') { ctx.fillStyle = shade(L.cloth, .8); ctx.beginPath(); ctx.moveTo(cx - 70 * hs, y0); ctx.lineTo(cx + 10 * hs, y0 + 150); ctx.lineTo(cx + 30 * hs, y0 + 150); ctx.lineTo(cx - 40 * hs, y0); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.moveTo(cx - 60 * hs, y0); ctx.lineTo(cx + 2 * hs, y0 + 130); ctx.lineTo(cx + 12 * hs, y0 + 130); ctx.lineTo(cx - 48 * hs, y0); ctx.closePath(); ctx.fill(); }
        else { ctx.fillStyle = '#f4efe4'; ctx.beginPath(); ctx.moveTo(cx - 44 * hs, y0); ctx.lineTo(cx - 6 * hs, y0 + 46 * hs); ctx.lineTo(cx + 6 * hs, y0 + 46 * hs); ctx.lineTo(cx + 44 * hs, y0); ctx.lineTo(cx + 24 * hs, y0 + 8 * hs); ctx.lineTo(cx, y0 + 34 * hs); ctx.lineTo(cx - 24 * hs, y0 + 8 * hs); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(cx, y0 + 70 * hs + i * 46, 4 * hs, 0, Math.PI * 2); ctx.fill(); } }
      }
      // 胴の陰影（左上の光）
      const sg = ctx.createLinearGradient(x0, y0, x0 + torsoW, y0 + 200); sg.addColorStop(0, 'rgba(255,255,255,.12)'); sg.addColorStop(.6, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,.25)'); ctx.fillStyle = sg; ctx.fillRect(x0 - 10, y0 - 10, torsoW + 20, torsoH + 20);
      ctx.restore();
      ctx.strokeStyle = 'rgba(30,15,5,.35)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
    drawDinerBack(ctx, game) {
      const d = game.diner, L = d.look, hs = d.hs; const S = game.shoulder, M = game.mouth; const hp = this.headPoints(game); const A = this.assets;
      ctx.save();
      if (game.cough > 0) { ctx.translate(Math.sin(game.time * 90) * 3, Math.cos(game.time * 70) * 2); }
      // 羽（妖精）
      if (L.wings) { ctx.save(); const flap = Math.sin(game.time * 14) * .25; for (const sgn of [-1, 1]) { const wx = S.x + 30 + sgn * 10, wy = S.y - 40 + sgn * 18; const wg = ctx.createRadialGradient(wx, wy, 5, wx, wy, 80); wg.addColorStop(0, 'rgba(220,250,255,.85)'); wg.addColorStop(.7, 'rgba(170,230,250,.55)'); wg.addColorStop(1, 'rgba(140,210,240,.15)'); ctx.fillStyle = wg; ctx.strokeStyle = 'rgba(120,200,230,.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(wx, wy, 70, 30 + flap * 40, sgn * .6 + .2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.strokeStyle = 'rgba(120,200,230,.45)'; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + Math.cos(sgn * .6 + .2 + i * .5 - 1) * 70, wy + Math.sin(sgn * .6 + .2 + i * .5 - 1) * (30 + flap * 40)); ctx.stroke(); } } ctx.restore(); }
      // 体
      this.drawClothes(ctx, game);
      // 首
      const neckW = 48 * hs * (d.face.neck || 1) * (hp.kind === 'dragon' ? 2.2 : 1); const nx = M.x + (hp.kind === 'dragon' ? 520 * hp.s : 215 * hs), ny = M.y + (hp.kind === 'dragon' ? 20 * hp.s : 60 * hs);
      const ng = ctx.createLinearGradient(nx, 0, nx + neckW, 0); ng.addColorStop(0, L.skinDark); ng.addColorStop(.4, L.skin); ng.addColorStop(1, L.skinDark); ctx.fillStyle = ng; ctx.beginPath(); ctx.roundRect(nx, ny, neckW, 140 * hs, 10); ctx.fill();
      const nsg = ctx.createLinearGradient(0, ny, 0, ny + 60 * hs); nsg.addColorStop(0, 'rgba(60,30,15,.45)'); nsg.addColorStop(1, 'rgba(60,30,15,0)'); ctx.fillStyle = nsg; ctx.fillRect(nx, ny, neckW, 60 * hs);
      // 上腕（体のうしろ側）
      const el = game.elbow(); cylinder(ctx, S.x, S.y, el.x, el.y, 28 * hs, shade(L.cloth, 1.15), L.cloth, shade(L.clothDark, .8), 'rgba(30,15,5,.3)');
      // 頭（肌）
      ctx.save(); ctx.translate(M.x, M.y);
      ctx.beginPath(); smooth(ctx, hp.outline, true);
      ctx.save(); ctx.clip();
      const fg = ctx.createLinearGradient(-60 * hs, -250 * hs, 300 * hs, 120 * hs); fg.addColorStop(0, shade(L.skin, 1.06)); fg.addColorStop(.55, L.skin); fg.addColorStop(1, shade(L.skinDark, .95)); ctx.fillStyle = fg; ctx.fillRect(-200 * hs, -500 * hs, 1000 * hs, 900 * hs);
      if (hp.kind === 'dragon') { const sp = A.pat(ctx, 'scales', .3 * hs); if (sp) { ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = .95; ctx.fillStyle = sp; ctx.fillRect(-200 * hs, -500 * hs, 1000 * hs, 900 * hs); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .35; ctx.fillRect(-200 * hs, -500 * hs, 1000 * hs, 900 * hs); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; } }
      else { const kp = A.pat(ctx, 'skin', .8); if (kp) { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = d.kind === 'orc' ? .4 : .22; ctx.fillStyle = kp; ctx.fillRect(-200 * hs, -500 * hs, 1000 * hs, 900 * hs); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; } }
      if (d.kind === 'orc') { const mp = A.pat(ctx, 'speckle', 1.2); if (mp) { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .25; ctx.fillStyle = mp; ctx.fillRect(-200 * hs, -500 * hs, 1000 * hs, 900 * hs); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; } }
      // ほお（赤み）・ひたいの光・あごの下の影・目のくぼみ
      const cheekX = (hp.kind === 'dragon' ? 150 : 60) * hs, cheekY = (hp.kind === 'dragon' ? -40 : -40) * hs;
      if (L.cheekColor) { const cg = ctx.createRadialGradient(cheekX, cheekY, 2, cheekX, cheekY, 75 * hs); cg.addColorStop(0, rgba(L.cheekColor, .5)); cg.addColorStop(1, rgba(L.cheekColor, 0)); ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cheekX, cheekY, 75 * hs, 0, Math.PI * 2); ctx.fill(); }
      if (hp.kind !== 'dragon') {
        const hg = ctx.createRadialGradient(90 * hs, -250 * hs, 5, 90 * hs, -250 * hs, 120 * hs); hg.addColorStop(0, 'rgba(255,255,255,.22)'); hg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hg; ctx.fillRect(-200 * hs, -500 * hs, 1000 * hs, 900 * hs);
        const jg = ctx.createLinearGradient(0, 30 * hs + hp.J, 0, 100 * hs + hp.J); jg.addColorStop(0, 'rgba(90,45,20,0)'); jg.addColorStop(1, 'rgba(90,45,20,.38)'); ctx.fillStyle = jg; ctx.fillRect(-200 * hs, 0, 1000 * hs, 200 * hs);
        const eg = ctx.createRadialGradient(hp.eye.x + 10 * hs, hp.eye.y + 2 * hs, 2, hp.eye.x + 10 * hs, hp.eye.y + 2 * hs, 40 * hs); eg.addColorStop(0, 'rgba(90,45,20,.22)'); eg.addColorStop(1, 'rgba(90,45,20,0)'); ctx.fillStyle = eg; ctx.fillRect(-200 * hs, -500 * hs, 1000 * hs, 900 * hs);
        const tg = ctx.createLinearGradient(230 * hs, 0, 330 * hs, 0); tg.addColorStop(0, 'rgba(90,45,20,0)'); tg.addColorStop(1, 'rgba(90,45,20,.3)'); ctx.fillStyle = tg; ctx.fillRect(200 * hs, -500 * hs, 200 * hs, 900 * hs);
      } else {
        const jg = ctx.createLinearGradient(0, 40 * hp.s + hp.J, 0, 200 * hp.s + hp.J); jg.addColorStop(0, 'rgba(40,10,5,0)'); jg.addColorStop(1, 'rgba(40,10,5,.45)'); ctx.fillStyle = jg; ctx.fillRect(-200, 0, 1000, 400);
        const hg = ctx.createRadialGradient(300, -300 * hp.s, 5, 300, -300 * hp.s, 260); hg.addColorStop(0, 'rgba(255,200,170,.25)'); hg.addColorStop(1, 'rgba(255,200,170,0)'); ctx.fillStyle = hg; ctx.fillRect(-200, -600, 1000, 1000);
      }
      // ふちの影（内側に沿って暗く）
      ctx.beginPath(); smooth(ctx, hp.outline, true); ctx.strokeStyle = 'rgba(70,35,15,.16)'; ctx.lineWidth = 22 * hs; ctx.stroke();
      ctx.restore();
      ctx.beginPath(); smooth(ctx, hp.outline, true); ctx.strokeStyle = rgba(L.skinDark, .75); ctx.lineWidth = 2; ctx.stroke();
      // 口の中（切り欠き）
      const g = game.geom; const cav = this.cavityPoints(g, 0);
      ctx.beginPath(); smooth(ctx, cav, true);
      ctx.save(); ctx.clip();
      const mg = ctx.createLinearGradient(0, g.upperY - 40, 0, g.lowerY + 40); mg.addColorStop(0, '#4a141b'); mg.addColorStop(.5, '#6e232c'); mg.addColorStop(1, '#3d1016'); ctx.fillStyle = mg; ctx.fillRect(-10, g.upperY - 200, g.D + 20, 600);
      const tg2 = ctx.createLinearGradient(g.D * .75, 0, g.D, 0); tg2.addColorStop(0, 'rgba(0,0,0,0)'); tg2.addColorStop(1, 'rgba(0,0,0,.5)'); ctx.fillStyle = tg2; ctx.fillRect(g.D * .7, g.upperY - 200, g.D * .3 + 10, 600);   // のどの奥は暗い
      // 上あご（口蓋）とひだ、のどちんこ
      ctx.fillStyle = '#b86a72'; ctx.beginPath(); ctx.moveTo(g.D * .15, g.upperY); ctx.quadraticCurveTo(g.D * .5, g.upperY - 34 * hs, g.D * .95, g.upperY - 6 * hs); ctx.lineTo(g.D * .95, g.upperY + 2); ctx.lineTo(g.D * .15, g.upperY + 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,200,205,.35)'; ctx.lineWidth = 1.5; for (let i = 1; i <= 4; i++) { const xx = g.D * (.2 + i * .1); ctx.beginPath(); ctx.moveTo(xx, g.upperY - 2 * hs); ctx.quadraticCurveTo(xx + 6 * hs, g.upperY - 8 * hs - i * 1.5, xx + 12 * hs, g.upperY - 2 * hs); ctx.stroke(); }
      ctx.fillStyle = '#a2545d'; ctx.beginPath(); ctx.ellipse(g.D * .86, g.upperY + 8 * hs, 4 * hs, 8 * hs, 0, 0, Math.PI * 2); ctx.fill();
      // 舌
      ctx.beginPath(); ctx.moveTo(g.D * .06, g.floor[1].y + 2); for (let i = 1; i < g.floor.length; i++) ctx.lineTo(g.floor[i].x, g.floor[i].y + 1); ctx.lineTo(g.D, g.lowerY + 80 * hs); ctx.lineTo(g.D * .25, g.lowerY + 80 * hs); ctx.closePath();
      const tng = ctx.createLinearGradient(0, g.lowerY - 10 * hs, 0, g.lowerY + 40 * hs); tng.addColorStop(0, '#e0858f'); tng.addColorStop(.5, '#cf6b77'); tng.addColorStop(1, '#9d4650'); ctx.fillStyle = tng; ctx.fill();
      ctx.save(); ctx.clip(); const spk = A.pat(ctx, 'speckle', .5); if (spk) { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .25; ctx.fillStyle = spk; ctx.fillRect(0, g.lowerY - 40 * hs, g.D, 200); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      ctx.strokeStyle = 'rgba(120,40,50,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(g.D * .2, g.floor[2].y + 10 * hs); ctx.quadraticCurveTo(g.D * .5, g.floor[3].y + 8 * hs, g.D * .78, g.lowerY + 16 * hs); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.ellipse(g.D * .38, g.floor[2].y + 6 * hs, g.D * .18, 3.5 * hs, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      // 歯ぐき・歯
      const teethN = Math.max(3, Math.round(g.D * .52 / ((d.kind === 'dragon' ? 30 : 14) * hs))); const tw = g.D * .52 / teethN; const th = 9.5 * hs;
      ctx.fillStyle = '#c9707a'; ctx.fillRect(g.D * .08, g.upperY - 10 * hs, g.D * .56, 9 * hs); ctx.fillRect(g.D * .08, g.lowerY + 1, g.D * .56, 9 * hs);
      for (let i = 0; i < teethN; i++) {
        const x0 = g.D * .1 + i * tw; const front = i <= 1, molar = i >= 3; const hgt = th * (front ? 1.15 : molar ? .85 : 1) * (d.kind === 'orc' ? 1.1 : 1);
        const tg3 = ctx.createLinearGradient(0, g.upperY - 3, 0, g.upperY + hgt); tg3.addColorStop(0, '#d9d0bb'); tg3.addColorStop(.3, '#f8f4ea'); tg3.addColorStop(1, '#cfc4ae'); ctx.fillStyle = tg3;
        if (d.kind === 'dragon') { ctx.beginPath(); ctx.moveTo(x0 + 1, g.upperY - 2); ctx.lineTo(x0 + tw - 1, g.upperY - 2); ctx.lineTo(x0 + tw * .5, g.upperY + hgt * 1.6); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(x0 + 1, g.lowerY + 2); ctx.lineTo(x0 + tw - 1, g.lowerY + 2); ctx.lineTo(x0 + tw * .5, g.lowerY - hgt * 1.4); ctx.closePath(); ctx.fill(); continue; }
        ctx.beginPath(); ctx.roundRect(x0 + 1, g.upperY - 3, tw - 2, hgt, [0, 0, front ? 2 : 4, front ? 2 : 4]); ctx.fill();
        const tg4 = ctx.createLinearGradient(0, g.lowerY - hgt, 0, g.lowerY + 3); tg4.addColorStop(0, '#cfc4ae'); tg4.addColorStop(.7, '#f4efe3'); tg4.addColorStop(1, '#d9d0bb'); ctx.fillStyle = tg4; ctx.beginPath(); ctx.roundRect(x0 + 1, g.lowerY - hgt + 3, tw - 2, hgt, [front ? 2 : 4, front ? 2 : 4, 0, 0]); ctx.fill();
        if (molar) { ctx.strokeStyle = 'rgba(120,100,70,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0 + tw * .3, g.upperY + hgt - 2); ctx.lineTo(x0 + tw * .5, g.upperY + hgt - 5); ctx.lineTo(x0 + tw * .7, g.upperY + hgt - 2); ctx.moveTo(x0 + tw * .3, g.lowerY - hgt + 5); ctx.lineTo(x0 + tw * .5, g.lowerY - hgt + 8); ctx.lineTo(x0 + tw * .7, g.lowerY - hgt + 5); ctx.stroke(); }
        ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x0 + 2.5, g.upperY, 2, hgt * .5);
      }
      // つば（口の中のつや）
      ctx.fillStyle = 'rgba(255,220,225,.12)'; ctx.beginPath(); ctx.ellipse(g.D * .5, (g.upperY + g.lowerY) / 2, g.D * .3, (g.lowerY - g.upperY) * .3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.restore(); ctx.restore();
    }
    drawDinerFront(ctx, game) {
      const d = game.diner, L = d.look, hs = d.hs; const M = game.mouth; const hp = this.headPoints(game); const g = game.geom;
      ctx.save(); if (game.cough > 0) ctx.translate(Math.sin(game.time * 90) * 3, Math.cos(game.time * 70) * 2);
      ctx.translate(M.x, M.y);
      // ほおの皮（半透明。中が見える）と切り口
      const cav = this.cavityPoints(g, 3);
      const cavPath = () => { ctx.beginPath(); smooth(ctx, cav, true); };
      cavPath(); ctx.fillStyle = rgba(L.skin, .4); ctx.fill();
      ctx.save(); cavPath(); ctx.clip(); cavPath(); ctx.strokeStyle = 'rgba(40,10,10,.3)'; ctx.lineWidth = 16; ctx.stroke(); ctx.restore();
      cavPath(); ctx.strokeStyle = rgba(L.skinDark, .5); ctx.lineWidth = 2; ctx.stroke();
      // 牙（オーク）：下くちびるの前から上へ
      if (L.tusks) { for (const [tx, len] of [[-14 * hs, 40], [4 * hs, 30]]) { const by = g.lipGap / 2 + 10 * hs; const kg = ctx.createLinearGradient(tx, by, tx + 6 * hs, by - len * hs); kg.addColorStop(0, '#cdbf9c'); kg.addColorStop(1, '#f9f3e2'); ctx.fillStyle = kg; ctx.beginPath(); ctx.moveTo(tx - 7 * hs, by + 4 * hs); ctx.quadraticCurveTo(tx - 9 * hs, by - len * .6 * hs, tx - 1 * hs, by - len * hs); ctx.quadraticCurveTo(tx + 7 * hs, by - len * .5 * hs, tx + 7 * hs, by + 4 * hs); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(70,50,25,.6)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.ellipse(tx - 3 * hs, by - len * .5 * hs, 1.6 * hs, len * .25 * hs, 0, 0, Math.PI * 2); ctx.fill(); } }
      // ほおのふくらみ
      if (game.pressure > .5) { const b = Math.min(1.6, game.pressure); const bg = ctx.createRadialGradient(g.D * .45, (g.upperY + g.lowerY) / 2, 4, g.D * .45, (g.upperY + g.lowerY) / 2, g.D * .35 * b); bg.addColorStop(0, rgba(L.skin, .55)); bg.addColorStop(1, rgba(L.skin, 0)); ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(g.D * .45, (g.upperY + g.lowerY) / 2, g.D * .32 * b, (g.lowerY - g.upperY) * .5 * b + 12 * hs, 0, 0, Math.PI * 2); ctx.fill(); }
      // くちびる（上は少し前へ、下はふっくら。顔につながる形）
      const lipC = L.lips; const lr = g.lipR * 1.35; const uy = -g.lipGap / 2, ly = g.lipGap / 2;
      const lg1 = ctx.createLinearGradient(-lr, uy - lr * 1.6, 2 * hs, uy); lg1.addColorStop(0, shade(lipC, 1.2)); lg1.addColorStop(.6, lipC); lg1.addColorStop(1, shade(lipC, .7)); ctx.fillStyle = lg1;
      ctx.beginPath(); ctx.moveTo(6 * hs, uy - lr * 1.9); ctx.quadraticCurveTo(-lr * 1.1, uy - lr * 1.7, -lr * 1.15, uy - lr * .7); ctx.quadraticCurveTo(-lr * 1.1, uy, -2 * hs, uy + 1); ctx.lineTo(8 * hs, uy - 2); ctx.closePath(); ctx.fill();
      const lg2 = ctx.createLinearGradient(-lr, ly, 2 * hs, ly + lr * 2); lg2.addColorStop(0, shade(lipC, 1.28)); lg2.addColorStop(.5, lipC); lg2.addColorStop(1, shade(lipC, .68)); ctx.fillStyle = lg2;
      ctx.beginPath(); ctx.moveTo(8 * hs, ly + 2); ctx.lineTo(-2 * hs, ly - 1); ctx.quadraticCurveTo(-lr * 1.3, ly + lr * .3, -lr * 1.1, ly + lr * 1.2); ctx.quadraticCurveTo(-lr * .6, ly + lr * 2.1, 6 * hs, ly + lr * 2.0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.32)'; ctx.beginPath(); ctx.ellipse(-lr * .6, ly + lr * .7, lr * .45, lr * .22, .3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(60,20,15,.28)'; ctx.beginPath(); ctx.ellipse(-lr * .1, ly + lr * 2.3, lr * .9, lr * .35, 0, 0, Math.PI * 2); ctx.fill();   // 下くちびるの下の影
      if (g.lipGap < 3) { ctx.strokeStyle = 'rgba(60,20,15,.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-lr * 1.1, 0); ctx.lineTo(6 * hs, 0); ctx.stroke(); }
      // 鼻
      if (hp.nostril) { ctx.fillStyle = rgba(L.skinDark, .8); ctx.beginPath(); ctx.ellipse(hp.nostril.x, hp.nostril.y, 5 * hs, 3 * hs, .4, 0, Math.PI * 2); ctx.fill(); if (hp.kind !== 'dragon') { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.ellipse(-50 * hs * d.face.nose, -92 * hs, 5 * hs, 3 * hs, -.6, 0, Math.PI * 2); ctx.fill(); } }
      // 目
      const e = hp.eye; const squint = game.cough > 0 ? .3 : (game.chewing ? .85 : 1); const ry = e.r * squint;
      ctx.save(); ctx.beginPath(); ctx.moveTo(e.x - e.r * 1.6, e.y); ctx.quadraticCurveTo(e.x - e.r * .4, e.y - ry * 1.4, e.x + e.r * 1.3, e.y - ry * .2); ctx.quadraticCurveTo(e.x + e.r * .2, e.y + ry * 1.1, e.x - e.r * 1.6, e.y); ctx.closePath();
      const sg = ctx.createLinearGradient(0, e.y - ry, 0, e.y + ry); sg.addColorStop(0, '#dcd6cc'); sg.addColorStop(.4, '#fbfbf7'); sg.addColorStop(1, '#f0ede6'); ctx.fillStyle = sg; ctx.fill(); ctx.clip();
      const ig = ctx.createRadialGradient(e.x - e.r * .3, e.y - e.r * .1, 1, e.x - e.r * .25, e.y, e.r * .8); ig.addColorStop(0, shade(L.eye, 1.6)); ig.addColorStop(.7, L.eye); ig.addColorStop(1, shade(L.eye, .5)); ctx.fillStyle = ig; ctx.beginPath(); ctx.ellipse(e.x - e.r * .25, e.y, e.r * .62, e.r * .8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0d0a08'; ctx.beginPath(); if (hp.kind === 'dragon') ctx.ellipse(e.x - e.r * .3, e.y, e.r * .14, e.r * .7, 0, 0, Math.PI * 2); else ctx.ellipse(e.x - e.r * .3, e.y, e.r * .3, e.r * .4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(e.x - e.r * .5, e.y - e.r * .3, e.r * .17, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(e.x - e.r * .05, e.y + e.r * .3, e.r * .1, 0, Math.PI * 2); ctx.fill();
      const lid = ctx.createLinearGradient(0, e.y - ry, 0, e.y - ry * .3); lid.addColorStop(0, 'rgba(70,35,20,.45)'); lid.addColorStop(1, 'rgba(70,35,20,0)'); ctx.fillStyle = lid; ctx.fillRect(e.x - e.r * 2, e.y - ry * 1.5, e.r * 4, ry * 1.2);
      ctx.restore();
      // まぶた・まつげ・下まぶた
      ctx.strokeStyle = 'rgba(40,20,10,.85)'; ctx.lineWidth = 2.6 * hs; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(e.x - e.r * 1.65, e.y); ctx.quadraticCurveTo(e.x - e.r * .4, e.y - ry * 1.45, e.x + e.r * 1.3, e.y - ry * .2); ctx.stroke();
      ctx.lineWidth = 1.8 * hs; ctx.beginPath(); ctx.moveTo(e.x - e.r * 1.65, e.y); ctx.lineTo(e.x - e.r * 2.0, e.y - ry * .4); ctx.moveTo(e.x - e.r * 1.2, e.y - ry * .9); ctx.lineTo(e.x - e.r * 1.5, e.y - ry * 1.3); ctx.stroke();
      ctx.strokeStyle = 'rgba(40,20,10,.35)'; ctx.lineWidth = 1.2 * hs; ctx.beginPath(); ctx.moveTo(e.x - e.r * 1.4, e.y + ry * .25); ctx.quadraticCurveTo(e.x - e.r * .3, e.y + ry * 1.05, e.x + e.r * 1.0, e.y + ry * .4); ctx.stroke();
      if (hp.kind !== 'dragon') { ctx.strokeStyle = 'rgba(70,35,20,.3)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(e.x - e.r * 1.3, e.y - ry * 1.3); ctx.quadraticCurveTo(e.x - e.r * .2, e.y - ry * 1.9, e.x + e.r * 1.2, e.y - ry * 1.1); ctx.stroke(); }
      // まゆ（太さの変わる形）
      if (hp.brow) { const bw = 5 * hs * d.face.brow; ctx.fillStyle = L.hairStyle === 'bald' ? '#b9b4aa' : (L.hair === '#000000' ? '#222' : L.hair); ctx.beginPath(); ctx.moveTo(hp.brow.x - 24 * hs, hp.brow.y + 4); ctx.quadraticCurveTo(hp.brow.x + 6 * hs, hp.brow.y - 9 * hs - bw, hp.brow.x + 38 * hs, hp.brow.y - 2); ctx.quadraticCurveTo(hp.brow.x + 8 * hs, hp.brow.y - 6 * hs + bw * .3, hp.brow.x - 24 * hs, hp.brow.y + 4 + bw * .4); ctx.closePath(); ctx.fill(); }
      if (L.wrinkles) { ctx.strokeStyle = rgba(L.skinDark, .55); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(10 * hs, -230 * hs); ctx.quadraticCurveTo(50 * hs, -240 * hs, 90 * hs, -236 * hs); ctx.moveTo(14 * hs, -250 * hs); ctx.quadraticCurveTo(50 * hs, -260 * hs, 80 * hs, -256 * hs); ctx.moveTo(30 * hs, -60 * hs); ctx.quadraticCurveTo(50 * hs, -20 * hs, 30 * hs, 20 * hs); ctx.moveTo(e.x + e.r * 1.2, e.y + e.r); ctx.quadraticCurveTo(e.x + e.r * 2, e.y + e.r * 1.6, e.x + e.r * 2.6, e.y + e.r * .9); ctx.stroke(); }
      // 耳（外のふち → 中のくぼみ → 耳たぶ）
      if (hp.ear) {
        const ex = hp.ear.x, ey = hp.ear.y, ew = hp.ear.w, eh = hp.ear.h;
        const earPath = () => {
          ctx.beginPath();
          if (L.pointedEars) { const len = d.kind === 'elf' ? 2.6 : 1.5; ctx.moveTo(ex - ew * .45, ey + eh * .5); ctx.quadraticCurveTo(ex - ew * .6, ey - eh * .3, ex + ew * .2, ey - eh * .5); ctx.quadraticCurveTo(ex + ew * 1.2, ey - eh * .5, ex + ew * len, ey - eh * (len * .42)); ctx.quadraticCurveTo(ex + ew * 1.0, ey - eh * .05, ex + ew * .5, ey + eh * .55); ctx.quadraticCurveTo(ex + ew * .05, ey + eh * .75, ex - ew * .45, ey + eh * .5); }
          else { ctx.moveTo(ex - ew * .45, ey + eh * .35); ctx.bezierCurveTo(ex - ew * .7, ey - eh * .2, ex - ew * .3, ey - eh * .62, ex + ew * .15, ey - eh * .6); ctx.bezierCurveTo(ex + ew * .75, ey - eh * .58, ex + ew * .75, ey + eh * .1, ex + ew * .4, ey + eh * .4); ctx.bezierCurveTo(ex + ew * .25, ey + eh * .62, ex - ew * .2, ey + eh * .65, ex - ew * .45, ey + eh * .35); }
          ctx.closePath();
        };
        earPath(); ctx.fillStyle = L.skin; ctx.fill(); ctx.strokeStyle = rgba(L.skinDark, .8); ctx.lineWidth = 1.6; ctx.stroke();
        ctx.save(); earPath(); ctx.clip();
        const eg = ctx.createRadialGradient(ex + ew * .05, ey + eh * .02, 1, ex + ew * .05, ey, ew * .55); eg.addColorStop(0, rgba(L.skinDark, .55)); eg.addColorStop(.6, rgba(L.skinDark, .2)); eg.addColorStop(1, rgba(L.skinDark, 0)); ctx.fillStyle = eg; ctx.fillRect(ex - 100, ey - 100, 300, 300);
        ctx.strokeStyle = rgba(L.skinDark, .65); ctx.lineWidth = 1.5 * hs; ctx.beginPath(); ctx.moveTo(ex - ew * .2, ey + eh * .3); ctx.bezierCurveTo(ex - ew * .4, ey - eh * .1, ex - ew * .1, ey - eh * .42, ex + ew * .2, ey - eh * .4); ctx.bezierCurveTo(ex + ew * .5, ey - eh * .38, ex + ew * .5, ey - eh * .05, ex + ew * .3, ey + eh * .15); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ex - ew * .38, ey + eh * .05); ctx.quadraticCurveTo(ex - ew * .15, ey - eh * .05, ex - ew * .1, ey + eh * .22); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.ellipse(ex + ew * .05, ey - eh * .3, ew * .22, eh * .08, -.3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      if (L.beard) { ctx.fillStyle = 'rgba(225,221,210,.95)'; ctx.beginPath(); ctx.moveTo(-6 * hs, 30 * hs + hp.J); ctx.quadraticCurveTo(10 * hs, 125 * hs + hp.J, 70 * hs, 98 * hs + hp.J); ctx.quadraticCurveTo(40 * hs, 60 * hs + hp.J, 30 * hs, 36 * hs + hp.J); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(150,145,135,.5)'; ctx.lineWidth = 1.2; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(4 * hs + i * 6 * hs, 44 * hs + hp.J); ctx.quadraticCurveTo(10 * hs + i * 8 * hs, 90 * hs + hp.J, 20 * hs + i * 10 * hs, 110 * hs + hp.J - i * 4); ctx.stroke(); } }
      this.drawHair(ctx, game, hp);
      if (L.horns) { for (const [bx, by] of [[450 * hp.s, -350 * hp.s], [540 * hp.s, -330 * hp.s]]) { const hg = ctx.createLinearGradient(bx, by, bx + 120 * hp.s, by - 170 * hp.s); hg.addColorStop(0, '#c9b58e'); hg.addColorStop(.5, '#efe2c4'); hg.addColorStop(1, '#8d7b5a'); ctx.fillStyle = hg; ctx.strokeStyle = '#6a5a3e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx - 22 * hp.s, by + 12); ctx.quadraticCurveTo(bx + 60 * hp.s, by - 120 * hp.s, bx + 120 * hp.s, by - 170 * hp.s); ctx.quadraticCurveTo(bx + 80 * hp.s, by - 60 * hp.s, bx + 32 * hp.s, by + 16); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.strokeStyle = 'rgba(90,70,40,.45)'; ctx.lineWidth = 1.5; for (let i = 1; i <= 4; i++) { const t = i / 5; const px = bx - 22 * hp.s + (bx + 120 * hp.s - (bx - 22 * hp.s)) * t * .8, py = by + 12 + (by - 170 * hp.s - (by + 12)) * t * .75; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 40 * hp.s * (1 - t), py + 20 * hp.s * (1 - t)); ctx.stroke(); } } }
      // 吸っている時の線
      if (game.slurpOn) { ctx.strokeStyle = 'rgba(80,80,120,.5)'; ctx.lineWidth = 2.5; for (let i = 0; i < 3; i++) { const yy = (i - 1) * 16 * hs; const ph = (game.time * 6 + i) % 1; ctx.beginPath(); ctx.moveTo(-120 * hs + ph * 60, yy * (1 + ph)); ctx.lineTo(-80 * hs + ph * 60, yy * (1 + ph * .5)); ctx.stroke(); } }
      // ドラゴンの炎
      if (game.fireOn) {
        ctx.save(); const FL = 300 * hs, t = game.time;
        ctx.globalCompositeOperation = 'lighter'; const gg = ctx.createRadialGradient(-80 * hs, 0, 10, -80 * hs, 0, FL * .9); gg.addColorStop(0, 'rgba(255,150,40,.35)'); gg.addColorStop(1, 'rgba(255,80,10,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(-80 * hs, 0, FL * .9, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 3; i++) {
          const col = ['rgba(200,40,10,.8)', 'rgba(255,130,20,.85)', 'rgba(255,230,120,.9)'][i]; const len = FL * (1 - i * .25) * (.9 + .1 * Math.sin(t * 23 + i)); const wid = (24 * hs + len * .32) * (1 - i * .3);
          ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-6 * hs, 0);
          for (let k = 0; k <= 8; k++) { const f = k / 8; ctx.lineTo(-6 * hs - len * f, -wid * f * (1 + .25 * Math.sin(t * 31 + f * 9 + i))); }
          for (let k = 8; k >= 0; k--) { const f = k / 8; ctx.lineTo(-6 * hs - len * f, wid * f * (1 + .25 * Math.cos(t * 29 + f * 7 + i))); }
          ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,240,160,.9)'; for (let k = 0; k < 8; k++) { const f = ((t * 3 + k * .37) % 1); const yy = Math.sin(k * 2.1 + t * 7) * (20 + f * 90) * hs; ctx.beginPath(); ctx.arc(-6 * hs - FL * f * 1.1, yy, (3 - f * 2) * hs, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
      ctx.restore();
    }
    drawHair(ctx, game, hp) {
      const d = game.diner, L = d.look, hs = d.hs; const st = L.hairStyle;
      if (st === 'none') return;
      const shapes = {
        short: [{ x: -12 * hs, y: -236 * hs }, { x: 20 * hs, y: -300 * hs }, { x: 150 * hs, y: -325 * hs }, { x: 270 * hs, y: -300 * hs }, { x: 340 * hs, y: -200 * hs }, { x: 335 * hs, y: -90 * hs }, { x: 300 * hs, y: -120 * hs }, { x: 290 * hs, y: -230 * hs }, { x: 200 * hs, y: -280 * hs }, { x: 60 * hs, y: -255 * hs }, { x: 10 * hs, y: -218 * hs }],
        bob: [{ x: -20 * hs, y: -230 * hs }, { x: 10 * hs, y: -300 * hs }, { x: 150 * hs, y: -328 * hs }, { x: 280 * hs, y: -300 * hs }, { x: 350 * hs, y: -180 * hs }, { x: 355 * hs, y: -20 * hs }, { x: 330 * hs, y: 60 * hs }, { x: 290 * hs, y: 20 * hs }, { x: 300 * hs, y: -150 * hs }, { x: 230 * hs, y: -270 * hs }, { x: 90 * hs, y: -262 * hs }, { x: 0, y: -210 * hs }],
        long: [{ x: -16 * hs, y: -236 * hs }, { x: 20 * hs, y: -300 * hs }, { x: 150 * hs, y: -328 * hs }, { x: 280 * hs, y: -300 * hs }, { x: 350 * hs, y: -180 * hs }, { x: 370 * hs, y: 120 * hs }, { x: 330 * hs, y: 230 * hs }, { x: 280 * hs, y: 170 * hs }, { x: 300 * hs, y: -150 * hs }, { x: 230 * hs, y: -270 * hs }, { x: 90 * hs, y: -262 * hs }, { x: 0, y: -214 * hs }],
        bald: [{ x: 250 * hs, y: -270 * hs }, { x: 320 * hs, y: -200 * hs }, { x: 340 * hs, y: -80 * hs }, { x: 300 * hs, y: -110 * hs }, { x: 290 * hs, y: -210 * hs }],
        mohawk: [{ x: 60 * hs, y: -270 * hs }, { x: 120 * hs, y: -380 * hs }, { x: 200 * hs, y: -400 * hs }, { x: 270 * hs, y: -360 * hs }, { x: 300 * hs, y: -260 * hs }, { x: 200 * hs, y: -300 * hs }, { x: 110 * hs, y: -285 * hs }],
      };
      const pts = shapes[st]; if (!pts) return;
      ctx.save();
      ctx.beginPath(); smooth(ctx, pts, true);
      const hg = ctx.createLinearGradient(0, -330 * hs, 300 * hs, 0); hg.addColorStop(0, shade(L.hair, 1.25)); hg.addColorStop(.5, L.hair); hg.addColorStop(1, shade(L.hair, .7)); ctx.fillStyle = hg; ctx.fill();
      ctx.save(); ctx.clip();
      // つや（やわらかい光の帯）と毛の流れ
      ctx.lineCap = 'round'; const hl = ctx.createRadialGradient(140 * hs, -300 * hs, 4, 140 * hs, -290 * hs, 150 * hs); hl.addColorStop(0, 'rgba(255,255,255,.2)'); hl.addColorStop(.5, 'rgba(255,255,255,.07)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hl; ctx.fillRect(-100, -450 * hs, 600, 500);
      ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 1.6 * hs;
      for (let i = 0; i < 9; i++) { const t = i / 8; ctx.beginPath(); if (st === 'mohawk') { ctx.moveTo(80 * hs + t * 200 * hs, -275 * hs); ctx.lineTo(110 * hs + t * 180 * hs, -395 * hs + Math.abs(t - .5) * 60 * hs); } else { ctx.moveTo(10 * hs + t * 300 * hs, -230 * hs - Math.sin(t * Math.PI) * 60 * hs); ctx.quadraticCurveTo(30 * hs + t * 300 * hs, -280 * hs - Math.sin(t * Math.PI) * 40 * hs, 20 * hs + t * 320 * hs, (st === 'long' ? 180 : st === 'bob' ? 20 : -100) * hs); } ctx.stroke(); }
      const sg = ctx.createLinearGradient(0, -100 * hs, 0, 200 * hs); sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,.4)'); ctx.fillStyle = sg; ctx.fillRect(-100, -100 * hs, 600, 400);
      ctx.restore();
      ctx.strokeStyle = shade(L.hair, .6); ctx.lineWidth = 1.5; ctx.stroke();
      if (st === 'bald') { ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.ellipse(120 * hs, -280 * hs, 50 * hs, 14 * hs, -.2, 0, Math.PI * 2); ctx.fill(); }
      if (st === 'bob') { // 前髪（何本かの房。まゆの上で止まる）
        ctx.fillStyle = L.hair; ctx.strokeStyle = shade(L.hair, .6); ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) { const x0 = -14 * hs + i * 30 * hs, x1 = x0 + 34 * hs; const yTop = -262 * hs - (i === 1 ? 10 : 0) * hs, yTip = -205 * hs + (i % 2 ? 8 : 0) * hs; ctx.beginPath(); ctx.moveTo(x0, yTop); ctx.quadraticCurveTo(x0 - 10 * hs, yTip - 20 * hs, x0 + 6 * hs, yTip); ctx.quadraticCurveTo(x0 + 17 * hs, yTip + 8 * hs, x1 - 6 * hs, yTip - 6 * hs); ctx.quadraticCurveTo(x1, yTip - 30 * hs, x1, yTop + 4 * hs); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      }
      ctx.restore();
    }
    // ---- 腕・手・食器 ----
    drawArmAndUtensil(ctx, game) {
      const d = game.diner, L = d.look, hs = d.hs; const Hd = game.hand; const el = game.elbow(); const key = game.utensilKey, u = game.utensil; const A = this.assets;
      ctx.save(); ctx.lineCap = 'round';
      // 手の影（テーブルの上）
      const hAbove = game.tableY - Hd.y; if (hAbove > 0 && hAbove < 420 && Hd.x < game.tableRight) { const k = 1 - hAbove / 420; ctx.fillStyle = 'rgba(30,15,5,' + (.3 * k).toFixed(2) + ')'; ctx.beginPath(); ctx.ellipse(Hd.x + 30, game.tableY + 2, 50 + 60 * (1 - k), 6 + 6 * (1 - k), 0, 0, Math.PI * 2); ctx.fill(); }
      // 前腕（肌）と袖
      cylinder(ctx, el.x, el.y, Hd.x, Hd.y, 21 * hs, shade(L.skin, 1.08), L.skin, shade(L.skinDark, .9), rgba(L.skinDark, .6));
      const sx = el.x + (Hd.x - el.x) * .24, sy = el.y + (Hd.y - el.y) * .24;
      cylinder(ctx, el.x, el.y, sx, sy, 26 * hs, shade(L.cloth, 1.15), L.cloth, shade(L.clothDark, .8), 'rgba(30,15,5,.35)');
      ctx.fillStyle = 'rgba(0,0,0,.18)'; capsule(ctx, sx - (Hd.x - el.x) * .02, sy - (Hd.y - el.y) * .02, sx, sy, 26 * hs); ctx.fill();
      const eg = ctx.createRadialGradient(el.x - 6, el.y - 6, 2, el.x, el.y, 24 * hs); eg.addColorStop(0, shade(L.cloth, 1.2)); eg.addColorStop(1, shade(L.clothDark, .85)); ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(el.x, el.y, 27 * hs, 0, Math.PI * 2); ctx.fill();
      // 食器
      ctx.save(); ctx.translate(Hd.x, Hd.y); ctx.rotate(game.tilt);
      if (key === 'hashi') {
        const hd = game.heldDiam(); const gap = Math.max(u.gap * (1 - game.squeeze), hd ? hd + u.stickR * 2 - 3 : 0); const backX = u.tipFrom - u.len, tipX = u.tipFrom;
        const stick = (y0, y1) => {
          const wg = ctx.createLinearGradient(0, y0 - 5, 0, y0 + 5); wg.addColorStop(0, '#d9a870'); wg.addColorStop(.4, '#b07a44'); wg.addColorStop(1, '#6b4320'); ctx.fillStyle = wg;
          ctx.beginPath(); ctx.moveTo(backX, y0 - 4.4); ctx.lineTo(tipX, y1 - 2.0); ctx.lineTo(tipX, y1 + 2.0); ctx.lineTo(backX, y0 + 4.4); ctx.closePath(); ctx.fill();
          const wp = A.pat(ctx, 'wood', .18); if (wp) { ctx.save(); ctx.clip(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .5; ctx.fillStyle = wp; ctx.fillRect(backX, Math.min(y0, y1) - 6, u.len, 14 + Math.abs(y1 - y0)); ctx.restore(); }
          ctx.strokeStyle = 'rgba(40,20,5,.5)'; ctx.lineWidth = 1; ctx.stroke(); ctx.strokeStyle = 'rgba(255,235,200,.45)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(backX + 8, y0 - 2.4); ctx.lineTo(tipX - 20, y1 - 1); ctx.stroke();
          ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(backX, y0 - 4.4, 2, 8.8);
        };
        stick(4, 4); stick(-4, -4 - gap);
      } else if (key === 'spoon') {
        const mg = ctx.createLinearGradient(0, -8, 0, 8); mg.addColorStop(0, '#fafafc'); mg.addColorStop(.3, '#cfd2d8'); mg.addColorStop(.55, '#8a8f98'); mg.addColorStop(.75, '#d8dbe0'); mg.addColorStop(1, '#5f636b');
        ctx.fillStyle = mg; ctx.beginPath(); ctx.moveTo(-u.back, -7); ctx.quadraticCurveTo(u.bowlAt * .5, -4, u.bowlAt - u.bowlR + 6, -3); ctx.lineTo(u.bowlAt - u.bowlR + 6, 3); ctx.quadraticCurveTo(u.bowlAt * .5, 5, -u.back, 9); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(40,40,50,.5)'; ctx.lineWidth = 1; ctx.stroke();
        const cx = u.bowlAt, cy = -u.bowlDepth * .25;
        const bg = ctx.createLinearGradient(cx - u.bowlR, cy, cx + u.bowlR, cy + u.bowlDepth); bg.addColorStop(0, '#9ba0a8'); bg.addColorStop(.45, '#f2f3f5'); bg.addColorStop(.7, '#b9bdc4'); bg.addColorStop(1, '#6f737a'); ctx.fillStyle = bg;
        ctx.beginPath(); ctx.ellipse(cx, cy, u.bowlR + u.rimR, u.bowlDepth + u.rimR, 0, .05 * Math.PI, .95 * Math.PI); ctx.closePath(); ctx.fill();
        const ig = ctx.createLinearGradient(0, cy, 0, cy + u.bowlDepth); ig.addColorStop(0, 'rgba(50,52,60,.3)'); ig.addColorStop(1, 'rgba(50,52,60,.75)'); ctx.fillStyle = ig; ctx.beginPath(); ctx.ellipse(cx, cy + 2, u.bowlR - 2, u.bowlDepth - 4, 0, .1 * Math.PI, .9 * Math.PI); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(40,40,50,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, cy, u.bowlR + u.rimR, u.bowlDepth + u.rimR, 0, .05 * Math.PI, .95 * Math.PI); ctx.stroke();
      } else if (key === 'fork') {
        const mg = ctx.createLinearGradient(0, -8, 0, 8); mg.addColorStop(0, '#fafafc'); mg.addColorStop(.3, '#cfd2d8'); mg.addColorStop(.55, '#8a8f98'); mg.addColorStop(.75, '#d8dbe0'); mg.addColorStop(1, '#5f636b'); ctx.fillStyle = mg;
        ctx.beginPath(); ctx.moveTo(-u.back, -6); ctx.quadraticCurveTo(u.tineFrom * .5, -4, u.tineFrom - 10, -8); ctx.lineTo(u.tineFrom, -8); ctx.lineTo(u.tineFrom, 8); ctx.lineTo(u.tineFrom - 10, 8); ctx.quadraticCurveTo(u.tineFrom * .5, 5, -u.back, 8); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(40,40,50,.5)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.lineCap = 'round'; for (const yy of [-5, -1.7, 1.7, 5]) { ctx.strokeStyle = '#5f636b'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(u.tineFrom, yy * 1.5); ctx.lineTo(u.tineTo, yy * .8); ctx.stroke(); ctx.strokeStyle = '#e6e8ec'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(u.tineFrom, yy * 1.5 - .5); ctx.lineTo(u.tineTo, yy * .8 - .5); ctx.stroke(); }
      } else {
        const hd = game.heldDiam(); const gap = Math.max(u.gap * (1 - game.squeeze), hd ? hd + u.fingerR * 2 - 8 : 0);
        cylinder(ctx, -10, 12, u.fingerLen, 12, u.fingerR, shade(L.skin, 1.08), L.skin, shade(L.skinDark, .9), rgba(L.skinDark, .7));
        cylinder(ctx, -10, -12, u.fingerLen, -12 - gap, u.fingerR, shade(L.skin, 1.08), L.skin, shade(L.skinDark, .9), rgba(L.skinDark, .7));
        ctx.fillStyle = 'rgba(255,240,235,.8)'; ctx.beginPath(); ctx.ellipse(u.fingerLen + 2, 12, u.fingerR * .5, u.fingerR * .35, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(u.fingerLen + 2, -12 - gap, u.fingerR * .5, u.fingerR * .35, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = rgba(L.skinDark, .5); ctx.lineWidth = 1; for (const yy of [12, -12 - gap]) { ctx.beginPath(); ctx.moveTo(14, yy - u.fingerR * .6); ctx.lineTo(16, yy + u.fingerR * .6); ctx.stroke(); }
      }
      // 手（にぎり）
      const pg = ctx.createRadialGradient(-10 * hs, -8 * hs, 4, -6 * hs, 0, 34 * hs); pg.addColorStop(0, shade(L.skin, 1.1)); pg.addColorStop(.6, L.skin); pg.addColorStop(1, shade(L.skinDark, .9)); ctx.fillStyle = pg; ctx.strokeStyle = rgba(L.skinDark, .75); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(-8 * hs, 2, 26 * hs, 21 * hs, .2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (key !== 'hand') {
        for (let i = 0; i < 3; i++) { const fx0 = 4 * hs + i * 7 * hs, fy0 = -6 - i * 1.5, fx1 = 14 * hs + i * 5 * hs, fy1 = 6 + i * 2; cylinder(ctx, fx0, fy0, fx1, fy1, 7 * hs, shade(L.skin, 1.1), L.skin, shade(L.skinDark, .9), rgba(L.skinDark, .7)); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.arc(fx0 + 1, fy0 - 2, 2.5 * hs, 0, Math.PI * 2); ctx.fill(); }
        cylinder(ctx, -4 * hs, -14 * hs, 16 * hs, -8 * hs, 6 * hs, shade(L.skin, 1.1), L.skin, shade(L.skinDark, .9), rgba(L.skinDark, .7));
        ctx.fillStyle = 'rgba(255,240,235,.8)'; ctx.beginPath(); ctx.ellipse(17 * hs, -8 * hs, 3 * hs, 2.2 * hs, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore(); ctx.restore();
    }
    // スプーンの手前のふち（食べ物の上に重ねる。中身が「入っている」ように見える）
    drawUtensilFront(ctx, game) {
      if (game.utensilKey !== 'spoon') return; const u = game.utensil; const Hd = game.hand;
      ctx.save(); ctx.translate(Hd.x, Hd.y); ctx.rotate(game.tilt); const cx = u.bowlAt, cy = -u.bowlDepth * .25;
      ctx.strokeStyle = 'rgba(245,246,248,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(cx, cy + 1, u.bowlR + u.rimR, u.bowlDepth + u.rimR, 0, .08 * Math.PI, .92 * Math.PI); ctx.stroke();
      ctx.strokeStyle = 'rgba(60,62,70,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, cy + 3, u.bowlR + u.rimR, u.bowlDepth + u.rimR, 0, .1 * Math.PI, .9 * Math.PI); ctx.stroke();
      ctx.restore();
    }
    drawToasts(ctx, game) {
      ctx.save(); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
      for (const t of game.toasts) {
        const age = game.time - t.t; const a = age < 1.0 ? 1 : Math.max(0, 1 - (age - 1.0) / .5); const y = t.y - age * 28; const pop = age < .12 ? 1.35 - age / .12 * .35 : 1;
        ctx.save(); ctx.translate(t.x, y); ctx.scale(pop, pop); ctx.font = 'bold 36px "Noto Sans JP", "Yu Gothic UI", "Meiryo", sans-serif';
        ctx.globalAlpha = a; ctx.strokeStyle = 'rgba(50,25,10,.9)'; ctx.lineWidth = 8; ctx.strokeText(t.text, 0, 0);
        const warn = /choke|bone|spill|slip|clack|escaped/.test(t.kind); ctx.fillStyle = warn ? '#ffd27a' : '#fffaf0'; ctx.fillText(t.text, 0, 0); ctx.restore();
      }
      ctx.restore();
    }
    draw(game) {
      const t0 = performance.now(); const ctx = this.ctx; const bg = this.background(game);
      ctx.drawImage(bg, 0, 0);
      this.drawDinerBack(ctx, game);
      for (const v of game.vesselList) this.drawVessel(ctx, v);
      this.drawArmAndUtensil(ctx, game);
      this.drawFood(ctx, game);
      this.drawUtensilFront(ctx, game);
      this.drawDinerFront(ctx, game);
      this.drawToasts(ctx, game);
      this.lastMs = this.lastMs * .9 + (performance.now() - t0) * .1;
    }
  }
  root.GohanRender = { Renderer, W, H, FOOD_TEX, VESSEL_LOOK };
})(typeof self !== 'undefined' ? self : this);
