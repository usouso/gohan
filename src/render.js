// src/render.js — 画面の描写。game.js の状態を読んで描くだけ（状態は変えない）。
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

  class Renderer {
    constructor(canvas) {
      this.cv = canvas; this.ctx = canvas.getContext('2d'); this.sprites = new Map();
      this.liq = document.createElement('canvas'); this.liq.width = Math.ceil(W / 3); this.liq.height = Math.ceil(H / 3); this.lctx = this.liq.getContext('2d', { willReadFrequently: true });
      this.liqOut = document.createElement('canvas'); this.liqOut.width = this.liq.width; this.liqOut.height = this.liq.height; this.loctx = this.liqOut.getContext('2d');
      this.bg = null; this.t = 0; this.shakeSeed = 0;
    }
    // ---- 背景（1回だけ描いて使いまわす） ----
    background(game) {
      if (this.bg && this.bgKey === game.tableRight) return this.bg;
      const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#f1e7d6'); g.addColorStop(.6, '#dccbb3'); g.addColorStop(1, '#b89f84'); x.fillStyle = g; x.fillRect(0, 0, W, H);
      // 窓の光（左上）
      const lg = x.createRadialGradient(260, 120, 20, 260, 120, 700); lg.addColorStop(0, 'rgba(255,250,235,.55)'); lg.addColorStop(1, 'rgba(255,250,235,0)'); x.fillStyle = lg; x.fillRect(0, 0, W, H);
      // 壁の板目（うすく）
      x.strokeStyle = 'rgba(120,90,60,.06)'; x.lineWidth = 2; for (let yy = 40; yy < game.tableY - 60; yy += 46) { x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke(); }
      // テーブル（木の板）
      const ty = game.tableY, tl = 0, tr = game.tableRight + 40, th = 38;
      const wg = x.createLinearGradient(0, ty, 0, ty + th); wg.addColorStop(0, '#a9743f'); wg.addColorStop(.08, '#8f5e2f'); wg.addColorStop(1, '#5e3a18'); x.fillStyle = wg; x.fillRect(tl, ty, tr - tl, th);
      // 木目
      let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < 70; i++) { const yy = ty + 3 + rnd() * (th - 6); x.strokeStyle = `rgba(60,30,10,${.05 + rnd() * .14})`; x.lineWidth = .6 + rnd() * 1.6; x.beginPath(); const amp = rnd() * 2.5; for (let xx = tl; xx <= tr; xx += 18) x.lineTo(xx, yy + Math.sin(xx * .013 + i) * amp); x.stroke(); }
      x.fillStyle = 'rgba(255,230,190,.45)'; x.fillRect(tl, ty, tr - tl, 2);
      // テーブルの下（床は暗く）
      const fg = x.createLinearGradient(0, ty + th, 0, H); fg.addColorStop(0, '#3a2a1e'); fg.addColorStop(1, '#241810'); x.fillStyle = fg; x.fillRect(0, ty + th, W, H - ty - th);
      x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(tl, ty + th, tr - tl, 10);
      this.bg = c; this.bgKey = game.tableRight; return c;
    }
    // ---- 器 ----
    drawVessel(ctx, v) {
      const V = v.def; const pts = v.pts;
      // 影
      ctx.save(); const sg = ctx.createRadialGradient(v.cx, v.tableY + 4, 10, v.cx, v.tableY + 4, V.wBot * .9); sg.addColorStop(0, 'rgba(0,0,0,.35)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(v.cx, v.tableY + 4, V.wBot * .9, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      // 足
      ctx.fillStyle = shade(V.glazeDark, .9); ctx.beginPath(); ctx.moveTo(v.cx - V.wBot / 2 + 10, v.bottom); ctx.lineTo(v.cx + V.wBot / 2 - 10, v.bottom); ctx.lineTo(v.cx + V.wBot / 2 - 6, v.tableY); ctx.lineTo(v.cx - V.wBot / 2 + 6, v.tableY); ctx.closePath(); ctx.fill();
      // 内側（断面なので、器のうしろ半分の内面が見える）
      ctx.save(); ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath();
      const inner = V.inner || V.glaze; const ig = ctx.createLinearGradient(0, v.top, 0, v.bottom); ig.addColorStop(0, shade(inner, 1.02)); ig.addColorStop(.55, shade(inner, .82)); ig.addColorStop(1, shade(inner, .55)); ctx.fillStyle = ig; ctx.fill();
      // 内面の横の光（丸みを出す）
      const hg = ctx.createLinearGradient(v.left, 0, v.right, 0); hg.addColorStop(0, 'rgba(0,0,0,.22)'); hg.addColorStop(.3, 'rgba(255,255,255,.08)'); hg.addColorStop(.7, 'rgba(255,255,255,0)'); hg.addColorStop(1, 'rgba(0,0,0,.18)'); ctx.fillStyle = hg; ctx.fill();
      if (V.pattern === 'blue') { ctx.strokeStyle = 'rgba(40,70,140,.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(v.left + 14, v.top + 26); ctx.lineTo(v.right - 14, v.top + 26); ctx.stroke(); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(v.left + 18, v.top + 34); ctx.lineTo(v.right - 18, v.top + 34); ctx.stroke(); }
      ctx.restore();
      // 壁（断面の厚み）
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = shade(V.glazeDark, .7); ctx.lineWidth = V.segR * 2 + 2; ctx.stroke();
      const wg = ctx.createLinearGradient(0, v.top, 0, v.bottom); wg.addColorStop(0, shade(V.glaze, 1.08)); wg.addColorStop(1, shade(V.glaze, .72)); ctx.strokeStyle = wg; ctx.lineWidth = V.segR * 2 - 1; ctx.stroke();
      // ふち（切り口は明るく）
      ctx.fillStyle = V.rim; for (const p of [pts[0], pts[pts.length - 1]]) { ctx.beginPath(); ctx.ellipse(p.x, p.y, V.segR + 1, V.segR * .6 + 1, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    // ---- 粒の見た目（種類・大きさごとに1回だけ描く） ----
    sprite(mat, r, mash) {
      const key = mat.key + '|' + Math.round(r * 2) / 2 + '|' + Math.min(mash, 3); let s = this.sprites.get(key); if (s) return s;
      const pad = 3, size = Math.ceil(r * 2.8 + pad * 2); const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); const cx = size / 2, cy = size / 2;
      const m = Math.min(mash, 3); const base = m ? mix(mat.color, mat.dark, .25 * m) : mat.color; const dark = m ? shade(mat.dark, 1 - .15 * m) : mat.dark; const hi = mat.hi;
      const grad = (rx) => { const g = x.createRadialGradient(cx - rx * .35, cy - rx * .35, rx * .1, cx, cy, rx * 1.05); g.addColorStop(0, mix(base, hi, .45)); g.addColorStop(.55, base); g.addColorStop(1, dark); return g; };
      x.globalAlpha = mat.alpha || 1;
      const shape = m >= 3 ? 'mash' : (mat.shape || 'round');
      switch (shape) {
        case 'grain': { x.fillStyle = grad(r); x.beginPath(); x.ellipse(cx, cy, r * 1.22, r * .82, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.ellipse(cx - r * .35, cy - r * .3, r * .32, r * .18, -.5, 0, Math.PI * 2); x.fill(); break; }
        case 'flat': { x.fillStyle = grad(r); x.beginPath(); x.ellipse(cx, cy, r * 1.35, r * .62, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = rgba(hi, .35); x.beginPath(); x.ellipse(cx - r * .2, cy - r * .18, r * .6, r * .14, 0, 0, Math.PI * 2); x.fill(); break; }
        case 'cube': { x.fillStyle = grad(r); const s2 = r * 1.7; x.beginPath(); x.roundRect(cx - s2 / 2, cy - s2 / 2, s2, s2, r * .3); x.fill(); x.fillStyle = rgba(hi, .4); x.fillRect(cx - s2 / 2 + 2, cy - s2 / 2 + 2, s2 - 4, r * .35); break; }
        case 'flake': { x.fillStyle = grad(r); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); x.strokeStyle = rgba(hi, .55); x.lineWidth = 1.2; x.beginPath(); x.moveTo(cx - r * .6, cy + r * .1); x.lineTo(cx + r * .2, cy - r * .55); x.moveTo(cx - r * .3, cy + r * .6); x.lineTo(cx + r * .6, cy - r * .1); x.stroke(); break; }
        case 'crumb': { x.fillStyle = grad(r); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; x.beginPath(); x.arc(cx + Math.cos(a) * r * .45, cy + Math.sin(a) * r * .45, r * .62, 0, Math.PI * 2); x.fill(); } x.beginPath(); x.arc(cx, cy, r * .8, 0, Math.PI * 2); x.fill(); x.fillStyle = rgba(dark, .5); for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(cx + Math.cos(i * 1.9) * r * .5, cy + Math.sin(i * 1.9) * r * .5, r * .12, 0, Math.PI * 2); x.fill(); } break; }
        case 'ring': { x.strokeStyle = base; x.lineWidth = r * .9; x.beginPath(); x.arc(cx, cy, r * .55, 0, Math.PI * 2); x.stroke(); x.strokeStyle = rgba(hi, .6); x.lineWidth = r * .25; x.beginPath(); x.arc(cx, cy, r * .55, 0, Math.PI * 2); x.stroke(); break; }
        case 'bone': { x.fillStyle = grad(r); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); break; }
        case 'mash': { x.fillStyle = rgba(mix(base, dark, .3), .9); x.beginPath(); x.ellipse(cx, cy, r * 1.15, r * .9, 0, 0, Math.PI * 2); x.fill(); break; }
        default: { x.fillStyle = grad(r); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.ellipse(cx - r * .3, cy - r * .35, r * .3, r * .18, -.6, 0, Math.PI * 2); x.fill(); }
      }
      s = { c, size }; this.sprites.set(key, s); return s;
    }
    // ---- 液体（粒をぼかして、しきい値で切り出す） ----
    drawLiquids(ctx, game) {
      const groups = new Map();
      for (const p of game.world.particles) if (p.mat.liquid) { let a = groups.get(p.mat); if (!a) { a = []; groups.set(p.mat, a); } a.push(p); }
      if (!groups.size) return;
      const L = this.lctx, cw = this.liq.width, ch = this.liq.height; const k = 1 / 3;
      for (const [mat, ps] of groups) {
        L.clearRect(0, 0, cw, ch); L.fillStyle = '#000';
        for (const p of ps) { const r = p.r * 1.75 * k; const g = L.createRadialGradient(p.x * k, p.y * k, 0, p.x * k, p.y * k, r); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.5, 'rgba(0,0,0,.75)'); g.addColorStop(1, 'rgba(0,0,0,0)'); L.fillStyle = g; L.beginPath(); L.arc(p.x * k, p.y * k, r, 0, Math.PI * 2); L.fill(); }
        let minX = cw, maxX = 0, minY = ch, maxY = 0; for (const p of ps) { minX = Math.min(minX, p.x * k - 12); maxX = Math.max(maxX, p.x * k + 12); minY = Math.min(minY, p.y * k - 12); maxY = Math.max(maxY, p.y * k + 12); }
        minX = clamp(Math.floor(minX), 0, cw - 1); maxX = clamp(Math.ceil(maxX), 0, cw); minY = clamp(Math.floor(minY), 0, ch - 1); maxY = clamp(Math.ceil(maxY), 0, ch); if (maxX <= minX || maxY <= minY) continue;
        const img = L.getImageData(minX, minY, maxX - minX, maxY - minY); const d = img.data; const w = img.width, h = img.height;
        const [cr, cg, cb] = hexToRgb(mat.color), [hr, hg, hb] = hexToRgb(mat.hi), [dr, dg, db] = hexToRgb(mat.dark);
        const TH = 120; const alive = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) alive[i] = d[i * 4 + 3] > TH ? 1 : 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = y * w + x; const o = i * 4;
          if (!alive[i]) { d[o + 3] = 0; continue; }
          const above = y >= 2 ? alive[i - 2 * w] : 0; const below = y < h - 2 ? alive[i + 2 * w] : 0;
          if (!above) { d[o] = hr; d[o + 1] = hg; d[o + 2] = hb; }           // 表面の光
          else if (!below) { d[o] = dr; d[o + 1] = dg; d[o + 2] = db; }      // 底の影
          else { d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; }
          d[o + 3] = 235;
        }
        this.loctx.clearRect(0, 0, cw, ch); this.loctx.putImageData(img, minX, minY);
        ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalAlpha = mat.glow ? .95 : .92; ctx.drawImage(this.liqOut, 0, 0, cw, ch, 0, 0, W, H); ctx.restore();
        if (mat.glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .25; ctx.drawImage(this.liqOut, 0, 0, cw, ch, -2, -2, W + 4, H + 4); ctx.restore(); }
      }
    }
    drawFood(ctx, game) {
      const w = game.world;
      this.drawLiquids(ctx, game);
      // 麺・わかめなど「線」のつながり、骨のつながり
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const c of w.constraints) {
        if (c.dead) continue; const a = c.a, b = c.b; const sa = a.mat.shape, sb = b.mat.shape;
        if (sa === 'line' && sb === 'line' && a.mat === b.mat && c.len < a.r * 2.3) { ctx.strokeStyle = a.mat.color; ctx.lineWidth = a.r * 1.9; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.strokeStyle = rgba(a.mat.hi, .45); ctx.lineWidth = a.r * .55; ctx.beginPath(); ctx.moveTo(a.x - 1, a.y - 1.5); ctx.lineTo(b.x - 1, b.y - 1.5); ctx.stroke(); }
        else if (sa === 'bone' && sb === 'bone') { ctx.strokeStyle = '#cfc8b5'; ctx.lineWidth = Math.min(a.r, b.r) * 1.6 + 1.5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.strokeStyle = '#fbf8ee'; ctx.lineWidth = Math.min(a.r, b.r) * 1.6 - .5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
      ctx.restore();
      // 粒
      for (const p of w.particles) {
        if (p.mat.liquid) continue;
        const s = this.sprite(p.mat, p.r, p.mash); const sh = p.mat.shape;
        if (sh === 'grain' || sh === 'flat' || sh === 'cube') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + (sh === 'cube' ? 0 : 0)); ctx.drawImage(s.c, -s.size / 2, -s.size / 2); ctx.restore(); }
        else ctx.drawImage(s.c, p.x - s.size / 2, p.y - s.size / 2);
        if (p.roast > .4) { const k = Math.min(1, (p.roast - .4) / 1.8); ctx.fillStyle = p.roast >= 2.2 ? 'rgba(20,12,8,.82)' : 'rgba(90,45,10,' + (.12 + .45 * k).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.02, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    // ---- 食べる人 ----
    headPoints(game) {
      const d = game.diner, f = d.face, hs = d.hs; const g = game.geom; const open = g.lipGap; const jawRise = (g.jc || 0) * d.H0 * .4;
      const J = open * .95 - jawRise;  // 下あごの動き
      if (d.kind === 'dragon') {
        const s = hs * .52;
        const up = [{ x: -8, y: -60 * s - 6 }, { x: 20, y: -120 * s }, { x: 120, y: -150 * s }, { x: 230, y: -200 * s }, { x: 300, y: -250 * s }, { x: 400, y: -330 * s }, { x: 470, y: -360 * s }, { x: 560, y: -300 * s }, { x: 640, y: -200 * s }, { x: 660, y: -60 * s }, { x: 620, y: 60 * s }];
        const low = [{ x: 560, y: 150 * s + J * .4 }, { x: 420, y: 190 * s + J * .8 }, { x: 260, y: 170 * s + J }, { x: 120, y: 140 * s + J }, { x: 30, y: 100 * s + J }, { x: -8, y: 60 * s + J + 4 }];
        return { outline: up.concat(low), eye: { x: 280 * s * 1.9, y: -170 * s, r: 18 * s }, nostril: { x: 30, y: -90 * s }, ear: null, kind: 'dragon', s };
      }
      const s = hs;
      const n = f.nose, jw = f.jaw, ch = f.chin, fh = f.forehead;
      const outline = [
        { x: 150 * s, y: -300 * s * fh }, { x: 40 * s, y: -285 * s * fh }, { x: -8 * s, y: -228 * s }, { x: -22 * s * f.brow, y: -185 * s }, { x: -16 * s, y: -150 * s },
        { x: -58 * s * n, y: -88 * s }, { x: -40 * s * n, y: -62 * s }, { x: -14 * s, y: -40 * s }, { x: -12 * s, y: -14 * s }, { x: 0, y: 0 },
        { x: -10 * s, y: 14 * s + J }, { x: -3 * s, y: 36 * s + J }, { x: 2 * s, y: 66 * s * ch + J }, { x: 42 * s, y: 86 * s + J }, { x: 150 * s * jw, y: 92 * s + J * .8 },
        { x: 205 * s, y: 78 * s + J * .4 }, { x: 222 * s, y: 150 * s }, { x: 300 * s, y: 140 * s }, { x: 330 * s, y: -60 * s }, { x: 305 * s, y: -230 * s }, { x: 235 * s, y: -296 * s * fh }];
      return { outline, eye: { x: 12 * s, y: -168 * s, r: 11 * s * f.eye }, brow: { x: 6 * s, y: -192 * s }, ear: { x: 212 * s, y: -150 * s, w: 36 * s * f.ear, h: 58 * s * f.ear }, nostril: { x: -40 * s, y: -66 * s }, kind: d.kind, s, J };
    }
    drawDinerBack(ctx, game) {
      const d = game.diner, L = d.look, hs = d.hs; const S = game.shoulder, M = game.mouth; const hp = this.headPoints(game);
      ctx.save();
      if (game.cough > 0) { ctx.translate(Math.sin(game.time * 90) * 3, Math.cos(game.time * 70) * 2); }
      // 羽（妖精）
      if (L.wings) { ctx.save(); ctx.globalAlpha = .55; const flap = Math.sin(game.time * 14) * .25; for (const sgn of [-1, 1]) { ctx.fillStyle = 'rgba(190,240,255,.75)'; ctx.strokeStyle = 'rgba(120,200,230,.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(S.x + 30 + sgn * 10, S.y - 40 + sgn * 18, 70, 30 + flap * 40, sgn * .6 + .2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } ctx.restore(); }
      // 体
      const torsoW = (d.kind === 'dragon' ? 300 : 170) * hs, torsoH = 420;
      const tg = ctx.createLinearGradient(S.x - torsoW * .4, 0, S.x + torsoW * .6, 0); tg.addColorStop(0, L.cloth); tg.addColorStop(1, L.clothDark); ctx.fillStyle = tg;
      ctx.beginPath(); ctx.roundRect(S.x - torsoW * .42, S.y - 36 * hs, torsoW, torsoH, 40 * hs); ctx.fill();
      if (d.kind === 'dragon') { ctx.fillStyle = L.belly; ctx.beginPath(); ctx.roundRect(S.x - torsoW * .42, S.y + 40, torsoW * .4, torsoH - 60, 30); ctx.fill(); }
      // 首
      const neckW = 48 * hs * (d.face.neck || 1); ctx.fillStyle = L.skin; ctx.beginPath(); ctx.roundRect(M.x + (hp.kind === 'dragon' ? 520 * hp.s : 215 * hs), M.y + (hp.kind === 'dragon' ? 20 * hp.s : 60 * hs), neckW * (hp.kind === 'dragon' ? 2.2 : 1), 140 * hs, 10); ctx.fill();
      // 上腕（体のうしろ側）
      const el = game.elbow(); ctx.strokeStyle = L.cloth; ctx.lineCap = 'round'; ctx.lineWidth = 46 * hs; ctx.beginPath(); ctx.moveTo(S.x, S.y); ctx.lineTo(el.x, el.y); ctx.stroke();
      ctx.strokeStyle = rgba(L.clothDark, .5); ctx.lineWidth = 46 * hs; ctx.beginPath(); ctx.moveTo(S.x + 6, S.y + 8); ctx.lineTo(el.x + 6, el.y + 8); ctx.stroke();
      // 頭（肌）
      ctx.save(); ctx.translate(M.x, M.y);
      const fg = ctx.createLinearGradient(-60 * hs, -250 * hs, 300 * hs, 120 * hs); fg.addColorStop(0, shade(L.skin, 1.05)); fg.addColorStop(.6, L.skin); fg.addColorStop(1, L.skinDark);
      ctx.fillStyle = fg; ctx.beginPath(); smooth(ctx, hp.outline, true); ctx.fill();
      ctx.strokeStyle = rgba(L.skinDark, .6); ctx.lineWidth = 2; ctx.stroke();
      if (hp.kind === 'dragon') { // うろこ
        ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1.5; const st = 26 * hp.s;
        for (let yy = -400 * hp.s; yy < 220 * hp.s; yy += st) for (let xx = -20; xx < 700; xx += st) { const ox = ((yy / st) | 0) % 2 ? st / 2 : 0; ctx.beginPath(); ctx.arc(xx + ox, yy, st * .5, Math.PI * .15, Math.PI * .85); ctx.stroke(); }
        ctx.restore();
      }
      // ほお（赤み）
      if (L.cheekColor) { const cg = ctx.createRadialGradient(60 * hs, -40 * hs, 2, 60 * hs, -40 * hs, 70 * hs); cg.addColorStop(0, rgba(L.cheekColor, .45)); cg.addColorStop(1, rgba(L.cheekColor, 0)); ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(60 * hs, -40 * hs, 70 * hs, 0, Math.PI * 2); ctx.fill(); }
      // 口の中（切り欠き）
      const g = game.geom; const cav = []; for (const p of g.ceiling) cav.push({ x: p.x, y: p.y }); for (let i = g.floor.length - 1; i >= 0; i--) cav.push({ x: g.floor[i].x, y: g.floor[i].y });
      cav[0].x = 0; cav[cav.length - 1].x = 0;
      ctx.beginPath(); ctx.moveTo(cav[0].x, cav[0].y); for (let i = 1; i < cav.length; i++) ctx.lineTo(cav[i].x, cav[i].y); ctx.closePath();
      const mg = ctx.createLinearGradient(0, g.upperY - 40, 0, g.lowerY + 40); mg.addColorStop(0, '#5a1b22'); mg.addColorStop(.5, '#7a2a33'); mg.addColorStop(1, '#4a151c'); ctx.fillStyle = mg; ctx.fill();
      // 上あご（口蓋）
      ctx.fillStyle = '#b86a72'; ctx.beginPath(); ctx.moveTo(g.D * .15, g.upperY); ctx.quadraticCurveTo(g.D * .5, g.upperY - 30 * hs, g.D * .95, g.upperY - 6 * hs); ctx.lineTo(g.D * .95, g.upperY + 2); ctx.lineTo(g.D * .15, g.upperY + 2); ctx.closePath(); ctx.fill();
      // 舌
      ctx.fillStyle = '#d4737f'; ctx.beginPath(); ctx.moveTo(g.D * .08, g.floor[1].y + 2); for (let i = 1; i < g.floor.length; i++) ctx.lineTo(g.floor[i].x, g.floor[i].y + 1); ctx.lineTo(g.D, g.lowerY + 60 * hs); ctx.lineTo(g.D * .3, g.lowerY + 60 * hs); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.ellipse(g.D * .4, g.floor[2].y + 6 * hs, g.D * .2, 4 * hs, 0, 0, Math.PI * 2); ctx.fill();
      // 歯
      const teethN = Math.max(3, Math.round(g.D * .52 / (14 * hs))); const tw = g.D * .52 / teethN; const th = 9 * hs;
      for (let i = 0; i < teethN; i++) { const x0 = g.D * .1 + i * tw; const tg2 = ctx.createLinearGradient(0, g.upperY, 0, g.upperY + th); tg2.addColorStop(0, '#f6f1e4'); tg2.addColorStop(1, '#d8cfbc'); ctx.fillStyle = tg2; ctx.beginPath(); ctx.roundRect(x0 + 1, g.upperY - 2, tw - 2, th, [0, 0, 3, 3]); ctx.fill(); ctx.fillStyle = '#efe7d6'; ctx.beginPath(); ctx.roundRect(x0 + 1, g.lowerY - th + 2, tw - 2, th, [3, 3, 0, 0]); ctx.fill(); }
      if (L.tusks) { ctx.fillStyle = '#f3ead6'; for (const tx of [g.D * .06, g.D * .16]) { ctx.beginPath(); ctx.moveTo(tx, g.lowerY + 4); ctx.lineTo(tx + 8 * hs, g.lowerY + 4); ctx.lineTo(tx + 3 * hs, g.lowerY - 30 * hs); ctx.closePath(); ctx.fill(); } }
      ctx.restore(); ctx.restore();
    }
    drawDinerFront(ctx, game) {
      const d = game.diner, L = d.look, hs = d.hs; const M = game.mouth; const hp = this.headPoints(game); const g = game.geom;
      ctx.save(); if (game.cough > 0) ctx.translate(Math.sin(game.time * 90) * 3, Math.cos(game.time * 70) * 2);
      ctx.translate(M.x, M.y);
      // ほおの皮（半透明。中が見える）
      const cav = []; for (const p of g.ceiling) cav.push({ x: Math.max(p.x, 10), y: p.y - 3 }); for (let i = g.floor.length - 1; i >= 0; i--) cav.push({ x: Math.max(g.floor[i].x, 10), y: g.floor[i].y + 3 });
      ctx.beginPath(); ctx.moveTo(cav[0].x, cav[0].y); for (let i = 1; i < cav.length; i++) ctx.lineTo(cav[i].x, cav[i].y); ctx.closePath();
      ctx.fillStyle = rgba(L.skin, .5); ctx.fill();
      // ほおのふくらみ
      if (game.pressure > .5) { const b = Math.min(1.6, game.pressure); ctx.fillStyle = rgba(L.skin, .35); ctx.beginPath(); ctx.ellipse(g.D * .45, (g.upperY + g.lowerY) / 2, g.D * .3 * b, (g.lowerY - g.upperY) * .5 * b + 10 * hs, 0, 0, Math.PI * 2); ctx.fill(); }
      // くちびる
      const lipC = L.lips; const lr = g.lipR * 1.2;
      const lg1 = ctx.createRadialGradient(-6 * hs, -g.lipGap / 2 - lr * .6, 1, -4 * hs, -g.lipGap / 2 - lr * .6, lr * 1.6); lg1.addColorStop(0, shade(lipC, 1.15)); lg1.addColorStop(1, shade(lipC, .8)); ctx.fillStyle = lg1;
      ctx.beginPath(); ctx.ellipse(-5 * hs, -g.lipGap / 2 - lr * .55, lr * 1.25, lr * .95, -.15, 0, Math.PI * 2); ctx.fill();
      const lg2 = ctx.createRadialGradient(-5 * hs, g.lipGap / 2 + lr * .5, 1, -4 * hs, g.lipGap / 2 + lr * .55, lr * 1.6); lg2.addColorStop(0, shade(lipC, 1.2)); lg2.addColorStop(1, shade(lipC, .78)); ctx.fillStyle = lg2;
      ctx.beginPath(); ctx.ellipse(-4 * hs, g.lipGap / 2 + lr * .6, lr * 1.2, lr * 1.0, .1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.ellipse(-6 * hs, g.lipGap / 2 + lr * .35, lr * .5, lr * .22, 0, 0, Math.PI * 2); ctx.fill();
      // 鼻の穴・目・まゆ・耳・髪
      if (hp.nostril) { ctx.fillStyle = rgba(L.skinDark, .7); ctx.beginPath(); ctx.ellipse(hp.nostril.x, hp.nostril.y, 5 * hs, 3 * hs, .4, 0, Math.PI * 2); ctx.fill(); }
      const e = hp.eye;
      ctx.save(); ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 1.5, e.r, 0, 0, Math.PI * 2); ctx.fillStyle = '#fbfbf7'; ctx.fill(); ctx.clip();
      const squint = game.cough > 0 ? .3 : (game.chewing ? .85 : 1);
      ctx.fillStyle = L.eye; ctx.beginPath(); ctx.arc(e.x - e.r * .25, e.y, e.r * .75 * squint, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(e.x - e.r * .3, e.y, e.r * .38 * squint, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(e.x - e.r * .5, e.y - e.r * .3, e.r * .18, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = rgba(L.skinDark, .8); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 1.5, e.r, 0, Math.PI, Math.PI * 2); ctx.stroke();
      if (hp.brow) { ctx.strokeStyle = L.hair === '#000000' ? '#222' : L.hair; ctx.lineWidth = 4.5 * hs * d.face.brow; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hp.brow.x - 22 * hs, hp.brow.y + 2); ctx.quadraticCurveTo(hp.brow.x + 8 * hs, hp.brow.y - 8 * hs, hp.brow.x + 34 * hs, hp.brow.y - 2); ctx.stroke(); }
      if (L.wrinkles) { ctx.strokeStyle = rgba(L.skinDark, .5); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(10 * hs, -230 * hs); ctx.lineTo(90 * hs, -236 * hs); ctx.moveTo(14 * hs, -250 * hs); ctx.lineTo(80 * hs, -256 * hs); ctx.moveTo(30 * hs, -60 * hs); ctx.quadraticCurveTo(50 * hs, -20 * hs, 30 * hs, 20 * hs); ctx.stroke(); }
      if (hp.ear) { ctx.fillStyle = L.skin; ctx.strokeStyle = rgba(L.skinDark, .7); ctx.lineWidth = 1.5; ctx.beginPath(); if (L.pointedEars) { ctx.moveTo(hp.ear.x - hp.ear.w * .4, hp.ear.y + hp.ear.h * .4); ctx.quadraticCurveTo(hp.ear.x + hp.ear.w * 1.6, hp.ear.y - hp.ear.h * .5, hp.ear.x + hp.ear.w * 2.4, hp.ear.y - hp.ear.h * 1.1); ctx.quadraticCurveTo(hp.ear.x + hp.ear.w * .9, hp.ear.y - hp.ear.h * .2, hp.ear.x + hp.ear.w * .4, hp.ear.y + hp.ear.h * .6); } else ctx.ellipse(hp.ear.x, hp.ear.y, hp.ear.w * .55, hp.ear.h * .55, -.15, 0, Math.PI * 2); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.strokeStyle = rgba(L.skinDark, .5); ctx.beginPath(); ctx.ellipse(hp.ear.x + 3 * hs, hp.ear.y + 2 * hs, hp.ear.w * .3, hp.ear.h * .32, -.15, .4, Math.PI * 1.6); ctx.stroke(); }
      if (L.beard) { ctx.fillStyle = 'rgba(220,216,205,.9)'; ctx.beginPath(); ctx.moveTo(-6 * hs, 30 * hs + hp.J); ctx.quadraticCurveTo(10 * hs, 120 * hs + hp.J, 70 * hs, 95 * hs + hp.J); ctx.quadraticCurveTo(40 * hs, 60 * hs + hp.J, 30 * hs, 36 * hs + hp.J); ctx.closePath(); ctx.fill(); }
      this.drawHair(ctx, game, hp);
      if (L.horns) { ctx.fillStyle = '#e9dcc0'; ctx.strokeStyle = '#8d7b5a'; ctx.lineWidth = 2; for (const [bx, by, dir] of [[450 * hp.s, -350 * hp.s, 1], [540 * hp.s, -330 * hp.s, 1]]) { ctx.beginPath(); ctx.moveTo(bx - 20 * hp.s, by + 10); ctx.quadraticCurveTo(bx + 60 * hp.s * dir, by - 120 * hp.s, bx + 120 * hp.s * dir, by - 170 * hp.s); ctx.quadraticCurveTo(bx + 80 * hp.s * dir, by - 60 * hp.s, bx + 30 * hp.s, by + 14); ctx.closePath(); ctx.fill(); ctx.stroke(); } }
      // 吸っている時の線
      if (game.slurpOn) { ctx.strokeStyle = 'rgba(80,80,120,.5)'; ctx.lineWidth = 2.5; for (let i = 0; i < 3; i++) { const yy = (i - 1) * 16 * hs; const ph = (game.time * 6 + i) % 1; ctx.beginPath(); ctx.moveTo(-120 * hs + ph * 60, yy * (1 + ph)); ctx.lineTo(-80 * hs + ph * 60, yy * (1 + ph * .5)); ctx.stroke(); } }
      // ドラゴンの炎
      if (game.fireOn) {
        ctx.save(); const L = 300 * hs, t = game.time;
        for (let i = 0; i < 3; i++) {
          const col = ['rgba(200,40,10,.75)', 'rgba(255,120,20,.8)', 'rgba(255,220,90,.85)'][i]; const len = L * (1 - i * .25) * (.9 + .1 * Math.sin(t * 23 + i)); const wid = (24 * hs + len * .32) * (1 - i * .3);
          ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-6 * hs, 0);
          for (let k = 0; k <= 8; k++) { const f = k / 8; ctx.lineTo(-6 * hs - len * f, -wid * f * (1 + .25 * Math.sin(t * 31 + f * 9 + i))); }
          for (let k = 8; k >= 0; k--) { const f = k / 8; ctx.lineTo(-6 * hs - len * f, wid * f * (1 + .25 * Math.cos(t * 29 + f * 7 + i))); }
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();
    }
    drawHair(ctx, game, hp) {
      const d = game.diner, L = d.look, hs = d.hs; const st = L.hairStyle;
      if (st === 'none') return;
      ctx.fillStyle = L.hair; ctx.beginPath();
      if (st === 'short') { smooth(ctx, [{ x: -12 * hs, y: -236 * hs }, { x: 20 * hs, y: -300 * hs }, { x: 150 * hs, y: -325 * hs }, { x: 270 * hs, y: -300 * hs }, { x: 340 * hs, y: -200 * hs }, { x: 335 * hs, y: -90 * hs }, { x: 300 * hs, y: -120 * hs }, { x: 290 * hs, y: -230 * hs }, { x: 200 * hs, y: -280 * hs }, { x: 60 * hs, y: -255 * hs }, { x: 10 * hs, y: -218 * hs }], true); ctx.fill(); }
      else if (st === 'bob') { smooth(ctx, [{ x: -20 * hs, y: -230 * hs }, { x: 10 * hs, y: -300 * hs }, { x: 150 * hs, y: -328 * hs }, { x: 280 * hs, y: -300 * hs }, { x: 350 * hs, y: -180 * hs }, { x: 355 * hs, y: -20 * hs }, { x: 330 * hs, y: 60 * hs }, { x: 290 * hs, y: 20 * hs }, { x: 300 * hs, y: -150 * hs }, { x: 230 * hs, y: -270 * hs }, { x: 90 * hs, y: -262 * hs }, { x: 0, y: -210 * hs }], true); ctx.fill(); }
      else if (st === 'long') { smooth(ctx, [{ x: -16 * hs, y: -236 * hs }, { x: 20 * hs, y: -300 * hs }, { x: 150 * hs, y: -328 * hs }, { x: 280 * hs, y: -300 * hs }, { x: 350 * hs, y: -180 * hs }, { x: 370 * hs, y: 120 * hs }, { x: 330 * hs, y: 230 * hs }, { x: 280 * hs, y: 170 * hs }, { x: 300 * hs, y: -150 * hs }, { x: 230 * hs, y: -270 * hs }, { x: 90 * hs, y: -262 * hs }, { x: 0, y: -214 * hs }], true); ctx.fill(); }
      else if (st === 'bald') { ctx.fillStyle = L.hair; smooth(ctx, [{ x: 250 * hs, y: -270 * hs }, { x: 320 * hs, y: -200 * hs }, { x: 340 * hs, y: -80 * hs }, { x: 300 * hs, y: -110 * hs }, { x: 290 * hs, y: -210 * hs }], true); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.ellipse(120 * hs, -280 * hs, 50 * hs, 14 * hs, -.2, 0, Math.PI * 2); ctx.fill(); }
      else if (st === 'mohawk') { smooth(ctx, [{ x: 60 * hs, y: -270 * hs }, { x: 120 * hs, y: -380 * hs }, { x: 200 * hs, y: -400 * hs }, { x: 270 * hs, y: -360 * hs }, { x: 300 * hs, y: -260 * hs }, { x: 200 * hs, y: -300 * hs }, { x: 110 * hs, y: -285 * hs }], true); ctx.fill(); }
    }
    // ---- 腕・手・食器 ----
    drawArmAndUtensil(ctx, game) {
      const d = game.diner, L = d.look, hs = d.hs; const Hd = game.hand; const el = game.elbow(); const key = game.utensilKey, u = game.utensil;
      ctx.save(); ctx.lineCap = 'round';
      // 前腕（袖を少し、あとは肌）
      const fg = ctx.createLinearGradient(el.x, el.y - 20, el.x, el.y + 20); fg.addColorStop(0, shade(L.skin, 1.05)); fg.addColorStop(1, L.skinDark);
      ctx.strokeStyle = fg; ctx.lineWidth = 34 * hs; ctx.beginPath(); ctx.moveTo(el.x, el.y); ctx.lineTo(Hd.x, Hd.y); ctx.stroke();
      ctx.strokeStyle = L.cloth; ctx.lineWidth = 42 * hs; ctx.beginPath(); ctx.moveTo(el.x, el.y); ctx.lineTo(el.x + (Hd.x - el.x) * .22, el.y + (Hd.y - el.y) * .22); ctx.stroke();
      ctx.fillStyle = L.cloth; ctx.beginPath(); ctx.arc(el.x, el.y, 23 * hs, 0, Math.PI * 2); ctx.fill();
      // 食器
      const c = Math.cos(game.tilt), s = Math.sin(game.tilt); const tf = (lx, ly) => ({ x: Hd.x + lx * c - ly * s, y: Hd.y + lx * s + ly * c });
      ctx.save(); ctx.translate(Hd.x, Hd.y); ctx.rotate(game.tilt);
      if (key === 'hashi') {
        const hd = game.heldDiam(); const gap = Math.max(u.gap * (1 - game.squeeze), hd ? hd + u.stickR * 2 - 3 : 0); const backX = u.tipFrom - u.len, tipX = u.tipFrom;
        const stick = (y0, y1) => { const wg = ctx.createLinearGradient(backX, 0, tipX, 0); wg.addColorStop(0, '#b9834a'); wg.addColorStop(.6, '#a06a35'); wg.addColorStop(1, '#6f4520'); ctx.fillStyle = wg; ctx.beginPath(); ctx.moveTo(backX, y0 - 4.2); ctx.lineTo(tipX, y1 - 2.2); ctx.lineTo(tipX, y1 + 2.2); ctx.lineTo(backX, y0 + 4.2); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(40,20,5,.45)'; ctx.lineWidth = 1; ctx.stroke(); ctx.strokeStyle = 'rgba(255,230,190,.35)'; ctx.beginPath(); ctx.moveTo(backX + 10, y0 - 2); ctx.lineTo(tipX - 20, y1 - 1); ctx.stroke(); };
        stick(4, 4); stick(-4, -4 - gap);
      } else if (key === 'spoon') {
        const mg = ctx.createLinearGradient(0, -8, 0, 8); mg.addColorStop(0, '#f4f4f6'); mg.addColorStop(.5, '#b9bcc2'); mg.addColorStop(1, '#6f737a');
        ctx.fillStyle = mg; ctx.beginPath(); ctx.moveTo(-u.back, -6); ctx.lineTo(u.bowlAt - u.bowlR + 6, -3); ctx.lineTo(u.bowlAt - u.bowlR + 6, 3); ctx.lineTo(-u.back, 8); ctx.closePath(); ctx.fill();
        const cx = u.bowlAt, cy = -u.bowlDepth * .25;
        const bg = ctx.createLinearGradient(cx - u.bowlR, cy, cx + u.bowlR, cy + u.bowlDepth); bg.addColorStop(0, '#9fa3aa'); bg.addColorStop(.5, '#e8e9ec'); bg.addColorStop(1, '#7a7e86'); ctx.fillStyle = bg;
        ctx.beginPath(); ctx.ellipse(cx, cy, u.bowlR + u.rimR, u.bowlDepth + u.rimR, 0, .05 * Math.PI, .95 * Math.PI); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(60,62,70,.55)'; ctx.beginPath(); ctx.ellipse(cx, cy + 2, u.bowlR - 2, u.bowlDepth - 4, 0, .1 * Math.PI, .9 * Math.PI); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#f7f7f9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy, u.bowlR + u.rimR, u.bowlDepth + u.rimR, 0, .05 * Math.PI, .95 * Math.PI); ctx.stroke();
      } else if (key === 'fork') {
        const mg = ctx.createLinearGradient(0, -8, 0, 8); mg.addColorStop(0, '#f4f4f6'); mg.addColorStop(.5, '#b9bcc2'); mg.addColorStop(1, '#6f737a'); ctx.fillStyle = mg;
        ctx.beginPath(); ctx.moveTo(-u.back, -6); ctx.lineTo(u.tineFrom, -7); ctx.lineTo(u.tineFrom, 7); ctx.lineTo(-u.back, 8); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#d5d7dc'; ctx.lineWidth = 3; ctx.lineCap = 'round'; for (const yy of [-4, 0, 4]) { ctx.beginPath(); ctx.moveTo(u.tineFrom, yy * 1.6); ctx.lineTo(u.tineTo, yy); ctx.stroke(); }
      } else {
        const hd = game.heldDiam(); const gap = Math.max(u.gap * (1 - game.squeeze), hd ? hd + u.fingerR * 2 - 8 : 0);
        ctx.fillStyle = L.skin; ctx.strokeStyle = rgba(L.skinDark, .7); ctx.lineWidth = 1.5;
        capsule(ctx, -10, 12, u.fingerLen, 12, u.fingerR); ctx.fill(); ctx.stroke(); capsule(ctx, -10, -12, u.fingerLen, -12 - gap, u.fingerR); ctx.fill(); ctx.stroke();
      }
      // 手（にぎり）
      const pg = ctx.createRadialGradient(-6, -6, 4, 0, 0, 30 * hs); pg.addColorStop(0, shade(L.skin, 1.06)); pg.addColorStop(1, L.skinDark); ctx.fillStyle = pg; ctx.strokeStyle = rgba(L.skinDark, .7); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(-8 * hs, 2, 26 * hs, 20 * hs, .2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (key !== 'hand') { for (let i = 0; i < 3; i++) { capsule(ctx, 4 * hs + i * 7 * hs, -6 - i * 1.5, 14 * hs + i * 5 * hs, 6 + i * 2, 7 * hs); ctx.fill(); ctx.stroke(); } capsule(ctx, -4 * hs, -14 * hs, 16 * hs, -8 * hs, 6 * hs); ctx.fill(); ctx.stroke(); }
      ctx.restore(); ctx.restore();
    }
    drawToasts(ctx, game) {
      ctx.save(); ctx.font = 'bold 34px "Noto Sans JP", "Yu Gothic UI", "Meiryo", sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
      for (const t of game.toasts) {
        const age = game.time - t.t; const a = age < 1.0 ? 1 : Math.max(0, 1 - (age - 1.0) / .5); const y = t.y - age * 28;
        ctx.globalAlpha = a; ctx.strokeStyle = 'rgba(40,20,10,.9)'; ctx.lineWidth = 7; ctx.strokeText(t.text, t.x, y);
        const warn = /choke|bone|spill|slip|clack|escaped/.test(t.kind); ctx.fillStyle = warn ? '#ffd27a' : '#fffaf0'; ctx.fillText(t.text, t.x, y);
      }
      ctx.restore();
    }
    draw(game) {
      const ctx = this.ctx; const bg = this.background(game);
      ctx.drawImage(bg, 0, 0);
      this.drawDinerBack(ctx, game);
      for (const v of game.vesselList) this.drawVessel(ctx, v);
      this.drawFood(ctx, game);
      this.drawArmAndUtensil(ctx, game);
      this.drawDinerFront(ctx, game);
      this.drawToasts(ctx, game);
    }
  }
  root.GohanRender = { Renderer, W, H };
})(typeof self !== 'undefined' ? self : this);
