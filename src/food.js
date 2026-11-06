// src/food.js — 材質・食器・料理の定義と、料理を粒子で組み立てる処理。画面に依存しない。
(function (root, factory) {
  const E = (typeof require === 'function' && typeof module === 'object') ? require('./engine.js') : root.GohanEngine;
  const api = factory(E);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GohanFood = api;
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  // 材質。fric=摩擦、slip=箸で持てる目安(px。大きいほど持ちやすい)、stiff=つなぎの固さ、breakAt=この倍率に伸びたら切れる、
  // crush=一回噛むごとに減る「かたさ」、rMin=この半径より小さければ割らずにつぶす、taste=おいしさ、liquid=液体、cohesion=液体のまとまり
  const MAT = {
    rice:      { name: 'ごはん', color: '#f7f2e7', dark: '#d7ccb6', hi: '#ffffff', shape: 'grain', r: 6, fric: .62, slip: 11, stiff: .16, breakAt: 1.4, crush: .5, rMin: 3.4, taste: 1.0 },
    onigiri:   { name: 'むすび', color: '#f7f2e7', dark: '#d7ccb6', hi: '#ffffff', shape: 'grain', r: 6.5, fric: .62, slip: 13, stiff: .35, breakAt: 1.6, crush: .5, rMin: 3.4, taste: 1.0 },
    nori:      { name: 'のり', color: '#1d2a1e', dark: '#0b120c', hi: '#4a6a4e', shape: 'flat', r: 4, fric: .55, slip: 12, stiff: .8, breakAt: 2.0, crush: .3, rMin: 2.5, taste: .8 },
    takuan:    { name: 'たくあん', color: '#f2c343', dark: '#c5951b', hi: '#fff0a8', shape: 'cube', r: 5.5, fric: .4, slip: 9, stiff: .8, breakAt: 1.3, crush: .25, rMin: 3, taste: 1.1 },
    salmon:    { name: '鮭の身', color: '#f0906a', dark: '#c2603f', hi: '#ffd7c2', shape: 'flake', r: 6.5, fric: .5, slip: 12, stiff: .5, breakAt: 1.5, crush: .4, rMin: 3.5, taste: 2.0 },
    whitefish: { name: '白身', color: '#f2e9dc', dark: '#c9b9a3', hi: '#ffffff', shape: 'flake', r: 6, fric: .5, slip: 12, stiff: .45, breakAt: 1.45, crush: .45, rMin: 3.5, taste: 1.8 },
    fishSkin:  { name: '皮', color: '#8d8f91', dark: '#4e5052', hi: '#d9dbdd', shape: 'flat', r: 4.5, fric: .4, slip: 8, stiff: .85, breakAt: 1.9, crush: .12, rMin: 2.8, taste: .9 },
    bone:      { name: '骨', color: '#fbf8ee', dark: '#cfc8b5', hi: '#ffffff', shape: 'bone', r: 3, fric: .3, slip: 14, stiff: 1, breakAt: 0, crush: 0, rMin: 2, taste: 0, bone: true },
    miso:      { name: '味噌汁', color: '#b3783f', dark: '#7a4a21', hi: '#e8b683', r: 5, fric: .03, slip: 0, liquid: true, cohesion: .35, crush: 1, rMin: 3, taste: .6 },
    broth:     { name: 'スープ', color: '#8c5a2b', dark: '#55341a', hi: '#d6a56a', r: 5, fric: .03, slip: 0, liquid: true, cohesion: .3, crush: 1, rMin: 3, taste: .6 },
    dashi:     { name: 'つゆ', color: '#c79a52', dark: '#8e6a2d', hi: '#f2d9a3', r: 5, fric: .03, slip: 0, liquid: true, cohesion: .3, crush: 1, rMin: 3, taste: .6 },
    curry:     { name: 'カレー', color: '#8a4a1c', dark: '#4f2608', hi: '#d2904e', r: 5.5, fric: .28, slip: 0, liquid: true, cohesion: .7, crush: 1, rMin: 3, taste: 1.3 },
    stew:      { name: 'シチュー', color: '#b0431c', dark: '#6a2208', hi: '#ff9a63', r: 5.5, fric: .25, slip: 0, liquid: true, cohesion: .6, crush: 1, rMin: 3, taste: 1.2 },
    yolk:      { name: '黄身', color: '#f3a21f', dark: '#b96f08', hi: '#ffe08a', r: 4, fric: .15, slip: 0, liquid: true, cohesion: .6, crush: 1, rMin: 2.5, taste: 2.2 },
    yolkGold:  { name: '金の黄身', color: '#f6b325', dark: '#c27d05', hi: '#fff2b0', r: 4.5, fric: .18, slip: 0, liquid: true, cohesion: .75, crush: 1, rMin: 2.5, taste: 3.0, glow: true },
    tofu:      { name: '豆腐', color: '#fbf8f0', dark: '#d9d2c2', hi: '#ffffff', shape: 'cube', r: 6.5, fric: .3, slip: 4, stiff: .6, breakAt: 1.25, crush: .9, rMin: 3.5, taste: 1.5 },
    wakame:    { name: 'わかめ', color: '#2f5d3a', dark: '#15301c', hi: '#6aa775', shape: 'flat', r: 4, fric: .5, slip: 9, stiff: .9, breakAt: 2.0, crush: .4, rMin: 2.5, taste: .9 },
    negi:      { name: 'ねぎ', color: '#9fd36a', dark: '#5e8f37', hi: '#e6ffc8', shape: 'ring', r: 3.5, fric: .4, slip: 8, stiff: .8, breakAt: 1.6, crush: .5, rMin: 2.5, taste: .7 },
    noodle:    { name: '麺', color: '#f3dfa0', dark: '#c6a860', hi: '#fff6d8', shape: 'line', r: 5, fric: .3, slip: 7, stiff: .95, breakAt: 1.9, crush: .6, rMin: 3, taste: 1.0 },
    udon:      { name: 'うどん', color: '#faf7ee', dark: '#d2cbb7', hi: '#ffffff', shape: 'line', r: 6.5, fric: .22, slip: 5, stiff: .95, breakAt: 2.0, crush: .55, rMin: 3.5, taste: 1.0 },
    menma:     { name: 'メンマ', color: '#c9a04c', dark: '#8c6420', hi: '#f1d58e', shape: 'line', r: 4.5, fric: .4, slip: 9, stiff: .9, breakAt: 1.7, crush: .3, rMin: 2.8, taste: .9 },
    chashu:    { name: 'チャーシュー', color: '#9b5a3a', dark: '#5f3019', hi: '#d9a07c', shape: 'flake', r: 6.5, fric: .5, slip: 10, stiff: .7, breakAt: 1.45, crush: .3, rMin: 3.5, taste: 2.2 },
    eggWhite:  { name: '白身', color: '#fdfbf4', dark: '#dcd6c6', hi: '#ffffff', shape: 'round', r: 6, fric: .35, slip: 7, stiff: .6, breakAt: 1.3, crush: .8, rMin: 3.5, taste: 1.4 },
    potato:    { name: 'じゃがいも', color: '#e8c979', dark: '#a98b3c', hi: '#fff0c0', shape: 'cube', r: 7, fric: .5, slip: 9, stiff: .6, breakAt: 1.3, crush: .8, rMin: 3.5, taste: 1.3 },
    beef:      { name: '牛肉', color: '#6b3a26', dark: '#3a1b0d', hi: '#a8714f', shape: 'flake', r: 6.5, fric: .5, slip: 10, stiff: .75, breakAt: 1.5, crush: .25, rMin: 3.5, taste: 2.0 },
    carrot:    { name: 'にんじん', color: '#ee7b2c', dark: '#a84d0f', hi: '#ffc39b', shape: 'cube', r: 6, fric: .5, slip: 9, stiff: .8, breakAt: 1.25, crush: .6, rMin: 3.5, taste: 1.0 },
    gyozaFill: { name: '餃子のあん', color: '#c08a6a', dark: '#7d5238', hi: '#e8bda4', shape: 'round', r: 6, fric: .5, slip: 10, stiff: .55, breakAt: 1.4, crush: .6, rMin: 3.3, taste: 2.0 },
    gyozaSkin: { name: '餃子の皮', color: '#f1dfb9', dark: '#b5955e', hi: '#fff7e6', shape: 'flat', r: 4.5, fric: .55, slip: 11, stiff: .85, breakAt: 1.75, crush: .3, rMin: 2.8, taste: 1.0 },
    pork:      { name: '豚肉', color: '#e7c9bd', dark: '#a98578', hi: '#fff0ea', shape: 'flake', r: 6.5, fric: .5, slip: 10, stiff: .75, breakAt: 1.5, crush: .22, rMin: 3.5, taste: 2.0 },
    koromo:    { name: '衣', color: '#c98a3e', dark: '#8a561a', hi: '#f2c98a', shape: 'crumb', r: 4.5, fric: .6, slip: 11, stiff: .8, breakAt: 1.5, crush: .35, rMin: 2.8, taste: 1.2 },
    age:       { name: 'おあげ', color: '#c98d4a', dark: '#8c5a24', hi: '#f0c58a', shape: 'flat', r: 6, fric: .35, slip: 8, stiff: .7, breakAt: 1.6, crush: .4, rMin: 3.3, taste: 1.4 },
    omelet:    { name: 'オムレツ', color: '#f6c94d', dark: '#c08f17', hi: '#fff3bf', shape: 'round', r: 7.5, fric: .45, slip: 9, stiff: .3, breakAt: 1.35, crush: .9, rMin: 3.8, taste: 1.6 },
    jelly:     { name: 'ゼリー', color: '#7fd0f0', dark: '#2f8bb8', hi: '#e2f8ff', shape: 'round', r: 7.5, fric: .05, slip: 1.6, stiff: .25, breakAt: 1.7, crush: .95, rMin: 3.8, taste: 1.4, alpha: .78 },
    fgrape:    { name: '浮遊ぶどう', color: '#7a4ca3', dark: '#3e2360', hi: '#d9b8ff', shape: 'round', r: 8.5, fric: .3, slip: 7, stiff: .5, breakAt: 1.3, crush: .7, rMin: 4, taste: 1.8, gravity: -0.012, damp: .975 },
    bread:     { name: 'パンの中身', color: '#f1e3c4', dark: '#c3ab7f', hi: '#fffaf0', shape: 'crumb', r: 8, fric: .6, slip: 12, stiff: .7, breakAt: 1.5, crush: .25, rMin: 4, taste: 1.2 },
    crust:     { name: 'パンの皮', color: '#a35f22', dark: '#5f330b', hi: '#d9955a', shape: 'crumb', r: 6, fric: .6, slip: 12, stiff: .9, breakAt: 1.6, crush: .14, rMin: 3.2, taste: 1.3 },
    lizardMeat:{ name: '火トカゲの肉', color: '#b8482a', dark: '#6c2410', hi: '#ff9d7c', shape: 'flake', r: 7, fric: .5, slip: 10, stiff: .75, breakAt: 1.5, crush: .25, rMin: 3.5, taste: 2.4 },
  };
  for (const k in MAT) { MAT[k].key = k; if (MAT[k].cohesion === undefined) MAT[k].cohesion = 0; if (MAT[k].edible === undefined) MAT[k].edible = !MAT[k].bone; }

  // 食器（横から見た断面）
  const VESSELS = {
    chawan:   { name: '茶碗', wTop: 230, wBot: 100, h: 110, foot: 10, curve: .75, segR: 5, glaze: '#eef0f2', glazeDark: '#aeb7bf', rim: '#ffffff', pattern: 'blue' },
    don:      { name: '丼', wTop: 330, wBot: 150, h: 150, foot: 12, curve: .7, segR: 6, glaze: '#34405c', glazeDark: '#161c2e', rim: '#d8dde8' },
    owan:     { name: 'お椀', wTop: 220, wBot: 95, h: 100, foot: 12, curve: .72, segR: 5, glaze: '#3a2016', glazeDark: '#120905', rim: '#a2362a', inner: '#9b2d1e' },
    sara:     { name: '皿', wTop: 360, wBot: 270, h: 34, foot: 6, curve: 1.2, segR: 4, glaze: '#f4f1ea', glazeDark: '#bdb6a8', rim: '#ffffff' },
    fukazara: { name: '深皿', wTop: 380, wBot: 260, h: 64, foot: 8, curve: 1.0, segR: 5, glaze: '#f1ece2', glazeDark: '#b4ab9b', rim: '#ffffff' },
    ishi:     { name: '石の器', wTop: 300, wBot: 160, h: 120, foot: 14, curve: .6, segR: 8, glaze: '#6e6e69', glazeDark: '#34342f', rim: '#8d8d86' },
    ki:       { name: '木の器', wTop: 360, wBot: 220, h: 80, foot: 10, curve: .8, segR: 7, glaze: '#8a5a2b', glazeDark: '#4a2c12', rim: '#b98350' },
  };

  function makeVessel(type, cx, tableY) {
    const V = VESSELS[type]; const N = 8; const top = tableY - V.h - V.foot; const pts = [];
    const hwAt = t => V.wTop / 2 - (V.wTop - V.wBot) / 2 * Math.pow(t, V.curve);
    for (let i = 0; i <= N; i++) { const t = i / N; pts.push({ x: cx - hwAt(t), y: top + V.h * t }); }
    for (let i = N; i >= 0; i--) { const t = i / N; pts.push({ x: cx + hwAt(t), y: top + V.h * t }); }
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) segs.push(E.seg(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, V.segR, { fric: .45, tag: 'vessel' }));
    // 足（台）
    segs.push(E.seg(cx - V.wBot / 2 + 10, top + V.h, cx - V.wBot / 2 + 10, tableY, V.segR, { fric: .4, tag: 'vessel' }));
    segs.push(E.seg(cx + V.wBot / 2 - 10, top + V.h, cx + V.wBot / 2 - 10, tableY, V.segR, { fric: .4, tag: 'vessel' }));
    return { type, def: V, cx, top, bottom: top + V.h, pts, poly: pts, segs, left: cx - V.wTop / 2, right: cx + V.wTop / 2, tableY, hwAt };
  }

  function clearOf(x, y, r, segs) { for (const s of segs) if (E.segDist(x, y, s) < r + s.r + .5) return false; return true; }
  // 器の中に六角形に詰めて置く。levelFn(x) より下（y が大きい側）だけ。
  function hexFill(vessel, r, levelFn, xRange) {
    const out = []; const sp = r * 2 * .97, dy = sp * .866;
    const x0 = vessel.left + (xRange ? (vessel.right - vessel.left) * xRange[0] : 0), x1 = vessel.left + (xRange ? (vessel.right - vessel.left) * xRange[1] : (vessel.right - vessel.left));
    let row = 0;
    for (let y = vessel.bottom - vessel.def.segR - r - .5; y > vessel.top - 40; y -= dy, row++) {
      for (let x = x0 + r + (row % 2 ? sp / 2 : 0); x < x1 - r; x += sp) {
        if (y < levelFn(x)) continue;
        if (!E.pointInPoly(x, y, vessel.poly)) continue;
        if (!clearOf(x, y, r, vessel.segs)) continue;
        out.push({ x, y });
      }
    }
    return out;
  }
  function ellipseHex(cx, cy, rx, ry, sp, skipFn) {
    const out = []; const dy = sp * .866; let row = 0;
    for (let y = cy - ry; y <= cy + ry; y += dy, row++) for (let x = cx - rx + (row % 2 ? sp / 2 : 0); x <= cx + rx; x += sp) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry; if (nx * nx + ny * ny > 1) continue; if (skipFn && skipFn(x, y)) continue; out.push({ x, y });
    }
    return out;
  }
  function linkNeighbors(world, ps, maxD, stiff, breakAt) {
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { const a = ps[i], b = ps[j]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (d < maxD) world.link(a, b, stiff, breakAt); }
  }
  function nearest(ps, x, y, n) { return ps.slice().sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)).slice(0, n); }

  let clusterId = 1;
  function addParticles(world, mat, positions, r, cl) { const out = []; for (const q of positions) { const p = new E.Particle(q.x, q.y, r, mat); p.cl = cl; p.gAfter = p.g; p.g = 1; p.dampAfter = p.damp; p.damp = 0; world.addParticle(p); out.push(p); } return out; }

  // かたまり（餃子・豆腐・肉・オムレツなど）。skin=まわりの皮、core=中の液体。
  function buildBlob(world, cx, cy, part, rng) {
    const mat = MAT[part.mat]; const r = part.r || mat.r; const cl = clusterId++;
    const skinMat = part.skin ? MAT[part.skin] : null; const skinR = part.skinR || (skinMat && skinMat.r) || 4.5;
    const coreMat = part.core ? MAT[part.core] : null; const cRx = part.coreR || 0, cRy = part.coreRy || part.coreR || 0;
    const rx = part.rx, ry = part.ry; const inner = skinMat ? skinR * 1.1 : 0;
    const inCore = (x, y) => coreMat && (((x - cx) / cRx) ** 2 + ((y - cy) / cRy) ** 2) < 1;
    const body = addParticles(world, mat, ellipseHex(cx, cy, rx - inner, ry - inner, r * 2 * .95, inCore), r, cl);
    for (const p of body) p.hard = 1;
    linkNeighbors(world, body, r * 2 * 1.22, mat.stiff, mat.breakAt);
    if (coreMat) { const core = addParticles(world, coreMat, ellipseHex(cx, cy, cRx - coreMat.r, cRy - coreMat.r, coreMat.r * 2 * .95), coreMat.r, cl); }
    if (skinMat) {
      const per = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry))); const n = Math.max(6, Math.round(per / (skinR * 2 * .95)));
      const pos = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; if (part.skinArc && !(a >= part.skinArc[0] && a <= part.skinArc[1])) continue; pos.push({ x: cx + Math.cos(a) * (rx - skinR * .6), y: cy + Math.sin(a) * (ry - skinR * .6) }); }
      const skin = addParticles(world, skinMat, pos, skinR, cl);
      for (let i = 0; i < skin.length; i++) { const a = skin[i], b = skin[(i + 1) % skin.length]; if (Math.hypot(a.x - b.x, a.y - b.y) < skinR * 2 * 1.6) world.link(a, b, skinMat.stiff, skinMat.breakAt); }
      for (const s of skin) for (const q of nearest(body, s.x, s.y, 2)) world.link(s, q, Math.min(skinMat.stiff, mat.stiff + .2), Math.max(mat.breakAt, 1.3));
      return body.concat(skin);
    }
    return body;
  }
  // 魚の切り身（身・皮・骨）。骨は背骨＋小骨。
  function buildFish(world, cx, cy, part, rng) {
    const flesh = MAT[part.flesh], skin = MAT[part.skin], bone = MAT.bone; const r = flesh.r; const boneR = part.boneR || 3; const cl = clusterId++;
    const rx = part.rx, ry = part.ry; const dense = part.ribs === 'dense';
    // 背骨
    const spinePos = []; for (let x = cx - rx + 14; x <= cx + rx - 14; x += boneR * 2 * 1.05) spinePos.push({ x, y: cy - ry * .05 });
    const spine = addParticles(world, bone, spinePos, boneR, cl);
    for (let i = 0; i < spine.length - 1; i++) world.link(spine[i], spine[i + 1], 1, 0);
    for (let i = 0; i < spine.length - 2; i++) world.link(spine[i], spine[i + 2], .9, 0);
    // 小骨（斜め下に伸びる）
    const ribs = [];
    const ribStep = dense ? 1 : 2, ribLen = dense ? 3 : 2;
    for (let i = 1; i < spine.length - 1; i += ribStep) {
      const s = spine[i]; let prev = s; const dir = (i % 2 ? -1 : 1);
      for (let k = 1; k <= ribLen; k++) {
        const rr = boneR * .85; const x = s.x + dir * k * rr * 1.2, y = s.y + k * rr * 2 * .95;
        if ((((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2) > .92) break;
        const q = addParticles(world, bone, [{ x, y }], rr, cl)[0]; world.link(prev, q, 1, 0); if (prev !== s) world.link(s, q, .8, 0); ribs.push(q); prev = q;
      }
    }
    const bones = spine.concat(ribs);
    const nearBone = (x, y) => { for (const b of bones) if (Math.hypot(b.x - x, b.y - y) < (r + b.r) * .55) return true; return false; };   // .8 だと骨の密な魚に身が1つも入らなかった（試作3で修正）
    const body = addParticles(world, flesh, ellipseHex(cx, cy, rx - 2, ry - 2, r * 2 * .95, nearBone), r, cl);
    linkNeighbors(world, body, r * 2 * 1.25, flesh.stiff, flesh.breakAt);
    for (const b of bones) for (const q of nearest(body, b.x, b.y, 2)) if (Math.hypot(q.x - b.x, q.y - b.y) < r * 2.6) world.link(b, q, .35, 1.3);
    // 皮（上側）
    const pos = []; const n = Math.round(rx * 2 / (skin.r * 2 * .95));
    for (let i = 0; i <= n; i++) { const a = Math.PI + Math.PI * i / n; pos.push({ x: cx + Math.cos(a) * (rx - 3), y: cy + Math.sin(a) * (ry - 2) }); }
    const sk = addParticles(world, skin, pos, skin.r, cl);
    for (let i = 0; i < sk.length - 1; i++) world.link(sk[i], sk[i + 1], skin.stiff, skin.breakAt);
    for (const s of sk) for (const q of nearest(body, s.x, s.y, 2)) world.link(s, q, .5, 1.45);
    return body.concat(bones, sk);
  }
  // 麺（器の汁の中にうねうねと）
  function buildNoodles(world, vessel, part, levelY, rng) {
    const mat = MAT[part.mat]; const r = part.r || mat.r; const sp = r * 2 * .9; const out = [];
    const ok = (x, y) => y > levelY + r && E.pointInPoly(x, y, vessel.poly) && clearOf(x, y, r, vessel.segs) && y < vessel.bottom - vessel.def.segR - r;
    for (let n = 0; n < part.n; n++) {
      const cl = clusterId++; let x, y, tries = 0;
      do { x = rng.range(vessel.left + 30, vessel.right - 30); y = rng.range(levelY + 10, vessel.bottom - 20); tries++; } while (!ok(x, y) && tries < 50);
      if (!ok(x, y)) continue;
      let h = rng.range(0, Math.PI * 2); const pts = [{ x, y }];
      for (let i = 1; i < part.len; i++) {
        let placed = false;
        for (let t = 0; t < 8 && !placed; t++) { h += rng.range(-.7, .7); const nx = x + Math.cos(h) * sp, ny = y + Math.sin(h) * sp; if (ok(nx, ny)) { x = nx; y = ny; pts.push({ x, y }); placed = true; } else h += Math.PI * .6; }
        if (!placed) break;
      }
      const ps = addParticles(world, mat, pts, r, cl);
      for (let i = 0; i < ps.length - 1; i++) world.link(ps[i], ps[i + 1], mat.stiff, mat.breakAt);
      for (let i = 0; i < ps.length - 2; i++) world.link(ps[i], ps[i + 2], .25, mat.breakAt * 1.3);
      out.push(...ps);
    }
    return out;
  }
  function buildChain(world, x, y, part, rng) {
    const mat = MAT[part.mat]; const r = part.r || mat.r; const cl = clusterId++; const pts = []; let h = rng.range(0, Math.PI * 2);
    for (let i = 0; i < part.len; i++) { pts.push({ x, y }); h += rng.range(-.6, .6); x += Math.cos(h) * r * 2 * .9; y += Math.sin(h) * r * 2 * .9; }
    const ps = addParticles(world, mat, pts, r, cl);
    for (let i = 0; i < ps.length - 1; i++) world.link(ps[i], ps[i + 1], mat.stiff, mat.breakAt);
    for (let i = 0; i < ps.length - 2; i++) world.link(ps[i], ps[i + 2], .3, mat.breakAt * 1.3);
    return ps;
  }

  // 料理の定義。vessels の slot は配置の種類（main=手前の器、side=奥の皿、wide=大皿ひとつ）。utensils は食器が選ばれる重み。
  const DISHES = [
    { id: 'sake', name: '白ごはんと焼き鮭', desc: 'ふっくらごはんと、骨のある塩鮭。骨をよけて食べる。', kind: 'real', utensils: { hashi: 70, spoon: 10, fork: 12, hand: 8 }, natural: ['hashi'],
      vessels: [{ slot: 'main', type: 'chawan', parts: [{ kind: 'fill', mat: 'rice', level: .42, dome: 16 }] },
                { slot: 'side', type: 'sara', parts: [{ kind: 'fish', flesh: 'salmon', skin: 'fishSkin', rx: 70, ry: 20, ribs: 'normal' }] }] },
    { id: 'miso', name: '豆腐とわかめの味噌汁', desc: 'あつい汁に、やわらかい豆腐とわかめ。箸では汁がすくえない。', kind: 'real', utensils: { hashi: 35, spoon: 45, fork: 8, hand: 12 }, natural: ['spoon'],
      vessels: [{ slot: 'main', type: 'owan', parts: [{ kind: 'liquid', mat: 'miso', level: .5 }, { kind: 'blob', mat: 'tofu', n: 2, rx: 13, ry: 13, r: 6.5, place: 'float' }, { kind: 'chain', mat: 'wakame', n: 3, len: 5, r: 4, place: 'float' }, { kind: 'singles', mat: 'negi', n: 4, r: 3.5, place: 'float' }] }] },
    { id: 'ramen', name: 'しょうゆラーメン', desc: '麺はすすって食べる。チャーシューと、半分の玉子。', kind: 'real', utensils: { hashi: 65, spoon: 15, fork: 15, hand: 5 }, natural: ['hashi'], slurpOk: true,
      vessels: [{ slot: 'main', type: 'don', parts: [{ kind: 'liquid', mat: 'broth', level: .46 }, { kind: 'noodles', mat: 'noodle', n: 6, len: 14, r: 5 }, { kind: 'blob', mat: 'chashu', n: 1, rx: 30, ry: 11, r: 6.5, place: 'top' }, { kind: 'blob', mat: 'eggWhite', n: 1, rx: 24, ry: 15, r: 6, core: 'yolk', coreR: 11, coreRy: 8, place: 'top' }, { kind: 'chain', mat: 'menma', n: 2, len: 4, r: 4.5, place: 'top' }] }] },
    { id: 'curry', name: 'カレーライス', desc: 'とろみのあるルーと、ごろっとしたじゃがいも。', kind: 'real', utensils: { hashi: 15, spoon: 70, fork: 10, hand: 5 }, natural: ['spoon'],
      vessels: [{ slot: 'wide', type: 'fukazara', parts: [{ kind: 'fill', mat: 'rice', level: .4, dome: 6, xRange: [.04, .52] }, { kind: 'liquid', mat: 'curry', level: .44, xRange: [.5, .97] }, { kind: 'blob', mat: 'potato', n: 1, rx: 16, ry: 14, r: 7, place: 'float', xRange: [.56, .94] }, { kind: 'blob', mat: 'beef', n: 2, rx: 12, ry: 10, r: 6.5, place: 'float', xRange: [.56, .94] }] }] },
    { id: 'gyoza', name: '焼き餃子', desc: '皮はもちっと、中は肉汁。かじるか、丸ごとか。', kind: 'real', utensils: { hashi: 65, spoon: 5, fork: 15, hand: 15 }, natural: ['hashi', 'hand'],
      vessels: [{ slot: 'wide', type: 'sara', parts: [{ kind: 'blob', mat: 'gyozaFill', skin: 'gyozaSkin', n: 3, rx: 28, ry: 13, r: 6, skinR: 4.5, place: 'top' }] }] },
    { id: 'onigiri', name: 'のりむすびと、たくあん', desc: '手で持ってかじるのが正解。箸でもできる……かも。', kind: 'real', utensils: { hashi: 25, spoon: 5, fork: 10, hand: 60 }, natural: ['hand'],
      vessels: [{ slot: 'wide', type: 'sara', parts: [{ kind: 'blob', mat: 'onigiri', skin: 'nori', n: 1, rx: 46, ry: 38, r: 6.5, skinR: 4, place: 'top' }, { kind: 'blob', mat: 'takuan', n: 2, rx: 10, ry: 9, r: 5.5, place: 'top', xRange: [.72, .95] }] }] },
    { id: 'tonkatsu', name: 'とんかつ定食', desc: '衣はザクッ、肉は厚い。よく噛む。', kind: 'real', utensils: { hashi: 65, spoon: 5, fork: 20, hand: 10 }, natural: ['hashi', 'fork'],
      vessels: [{ slot: 'main', type: 'chawan', parts: [{ kind: 'fill', mat: 'rice', level: .4, dome: 14 }] },
                { slot: 'side', type: 'sara', parts: [{ kind: 'blob', mat: 'pork', skin: 'koromo', n: 3, rx: 19, ry: 14, r: 6.5, skinR: 4.5, place: 'top' }] }] },
    { id: 'udon', name: 'きつねうどん', desc: '太くてつるつるの麺。あまいおあげ。', kind: 'real', utensils: { hashi: 60, spoon: 20, fork: 15, hand: 5 }, natural: ['hashi'], slurpOk: true,
      vessels: [{ slot: 'main', type: 'don', parts: [{ kind: 'liquid', mat: 'dashi', level: .44 }, { kind: 'noodles', mat: 'udon', n: 4, len: 12, r: 6.5 }, { kind: 'blob', mat: 'age', n: 1, rx: 34, ry: 9, r: 6, place: 'top' }, { kind: 'singles', mat: 'negi', n: 3, r: 3.5, place: 'top' }] }] },
    { id: 'dragon_egg', name: 'ドラゴンのたまごのオムレツ', desc: 'まくらほどの大きさ。中から金色の黄身がとろりと流れる。', kind: 'fantasy', utensils: { hashi: 30, spoon: 25, fork: 35, hand: 10 }, natural: ['fork', 'spoon'],
      vessels: [{ slot: 'wide', type: 'fukazara', parts: [{ kind: 'blob', mat: 'omelet', n: 1, rx: 86, ry: 30, r: 7.5, core: 'yolkGold', coreR: 44, coreRy: 11, place: 'top' }] }] },
    { id: 'slime', name: 'スライムゼリー', desc: 'つかんでも、ぬるっと逃げる。ぷるぷる。', kind: 'fantasy', utensils: { hashi: 35, spoon: 40, fork: 15, hand: 10 }, natural: ['spoon'],
      vessels: [{ slot: 'main', type: 'ishi', parts: [{ kind: 'blob', mat: 'jelly', n: 1, rx: 66, ry: 44, r: 7.5, place: 'bottom' }] }] },
    { id: 'grapes', name: '浮遊ぶどう', desc: 'ふわふわ浮き上がる。逃げる前につかむ。', kind: 'fantasy', utensils: { hashi: 45, spoon: 15, fork: 15, hand: 25 }, natural: ['hashi', 'hand'],
      vessels: [{ slot: 'main', type: 'ki', parts: [{ kind: 'singles', mat: 'fgrape', n: 7, r: 8.5, place: 'bottom' }] }] },
    { id: 'bonefish', name: 'ホネホネ魚の塩焼き', desc: '骨ばかりの魚。身は少しだけ。骨を飲むと痛い。', kind: 'fantasy', utensils: { hashi: 70, spoon: 5, fork: 15, hand: 10 }, natural: ['hashi'],
      vessels: [{ slot: 'wide', type: 'sara', parts: [{ kind: 'fish', flesh: 'whitefish', skin: 'fishSkin', rx: 88, ry: 19, ribs: 'dense', boneR: 3.4 }] }] },
    { id: 'bread', name: '巨人のパン', desc: 'かたい皮、ぎっしりの中身。かじりとるしかない。', kind: 'fantasy', utensils: { hashi: 20, spoon: 5, fork: 20, hand: 55 }, natural: ['hand'],
      vessels: [{ slot: 'wide', type: 'ki', parts: [{ kind: 'blob', mat: 'bread', skin: 'crust', n: 1, rx: 78, ry: 36, r: 8, skinR: 6, place: 'bottom' }] }] },
    { id: 'stew', name: '火トカゲのシチュー', desc: '骨つきの肉がごろごろ。にんじんも。', kind: 'fantasy', utensils: { hashi: 20, spoon: 55, fork: 20, hand: 5 }, natural: ['spoon'],
      vessels: [{ slot: 'main', type: 'ishi', parts: [{ kind: 'liquid', mat: 'stew', level: .48 }, { kind: 'blob', mat: 'lizardMeat', n: 2, rx: 16, ry: 12, r: 7, place: 'float', bone: true }, { kind: 'blob', mat: 'carrot', n: 2, rx: 9, ry: 9, r: 6, place: 'float' }] }] },
  ];

  // 料理を器に盛る。vessels は slot ごとの makeVessel の結果。
  function buildDish(world, dish, vesselsBySlot, rng) {
    const all = [];
    for (const vd of dish.vessels) {
      const vessel = vesselsBySlot[vd.slot]; if (!vessel) continue;
      for (const s of vessel.segs) world.statics.push(s);
      let surfaceY = x => vessel.bottom; // 現在の表面（y が小さいほど高い）
      let levelY = null;
      for (const part of vd.parts) {
        const H = vessel.bottom - vessel.top;
        if (part.kind === 'fill') {
          const mat = MAT[part.mat]; const lv = vessel.bottom - H * part.level; const cx = vessel.cx;
          const lf = x => lv - (part.dome || 0) * Math.max(0, 1 - ((x - cx) / (vessel.def.wTop * .5)) ** 2);
          const pos = hexFill(vessel, mat.r, lf, part.xRange); const cl = clusterId++;
          const ps = addParticles(world, mat, pos, mat.r, cl); linkNeighbors(world, ps, mat.r * 2 * 1.2, mat.stiff, mat.breakAt);
          const old = surfaceY; surfaceY = x => Math.min(old(x), lf(x)); all.push(...ps);
        } else if (part.kind === 'liquid') {
          const mat = MAT[part.mat]; const lv = vessel.bottom - H * part.level; levelY = lv;
          const pos = hexFill(vessel, mat.r, () => lv, part.xRange); const ps = addParticles(world, mat, pos, mat.r, clusterId++);
          const old = surfaceY; surfaceY = x => Math.min(old(x), lv); all.push(...ps);
        } else if (part.kind === 'blob' || part.kind === 'chain' || part.kind === 'singles') {
          const n = part.n || 1; const rx0 = part.xRange ? vessel.left + (vessel.right - vessel.left) * part.xRange[0] : vessel.left + 40;
          const rx1 = part.xRange ? vessel.left + (vessel.right - vessel.left) * part.xRange[1] : vessel.right - 40;
          const halfW = part.kind === 'blob' ? part.rx : (part.r || MAT[part.mat].r) * 2;
          for (let i = 0; i < n; i++) {
            const x = n === 1 ? (rx0 + rx1) / 2 : rx0 + halfW + (rx1 - rx0 - halfW * 2) * (i + .5) / n + rng.range(-6, 6);
            let y;
            const ry = part.kind === 'blob' ? part.ry : (part.r || MAT[part.mat].r);
            if (part.place === 'float' && levelY !== null) y = rng.range(levelY + ry + 6, vessel.bottom - ry - 10);
            else if (part.place === 'bottom') y = vessel.bottom - vessel.def.segR - ry - 2;
            else y = surfaceY(x) - ry - 4;
            if (part.kind === 'blob') { const ps = buildBlob(world, x, y, part, rng); all.push(...ps); if (part.bone) { const b = addParticles(world, MAT.bone, [{ x: x - 4, y }, { x: x + 4, y }], 3.2, ps[0].cl); world.link(b[0], b[1], 1, 0); for (const bb of b) for (const q of nearest(ps, bb.x, bb.y, 3)) world.link(bb, q, .4, 1.3); all.push(...b); } }
            else if (part.kind === 'chain') all.push(...buildChain(world, x, y, part, rng));
            else { const mat = MAT[part.mat]; all.push(...addParticles(world, mat, [{ x, y }], part.r || mat.r, clusterId++)); }
          }
        } else if (part.kind === 'noodles') {
          all.push(...buildNoodles(world, vessel, part, levelY === null ? vessel.top : levelY, rng));
        } else if (part.kind === 'fish') {
          const cy = vessel.bottom - vessel.def.segR - part.ry - 3; all.push(...buildFish(world, vessel.cx, cy, part, rng));
        }
      }
    }
    // 具と重なった汁の粒は取りのぞく（置いた瞬間にはじけ飛ばないように）
    const solids = all.filter(p => !p.mat.liquid);
    for (const p of all) {
      if (!p.mat.liquid) continue;
      for (const q of solids) { const dx = q.x - p.x, dy = q.y - p.y; const rr = (p.r + q.r) * .62; if (dx * dx + dy * dy < rr * rr) { world.kill(p, 'overlap'); break; } }   // .92 だと麺の入った汁がほとんど消えた（試作3で修正。少しの重なりは settle がほどく）
    }
    world.cleanup(); world.events.length = 0;
    const alive = all.filter(p => !p.dead);
    let edible = 0; for (const p of alive) if (!p.mat.bone) edible += p.r * p.r;
    return { particles: alive, edibleTotal: edible };
  }
  // 盛りつけ後（settle 後）に、本来の重さ（浮遊など）に戻す
  function finishDish(world) { for (const p of world.particles) { if (p.gAfter !== undefined) { p.g = p.gAfter; p.damp = p.dampAfter || 0; } } }

  const UTENSILS = {
    hashi: { name: '箸', len: 420, tipFrom: 290, gap: 46, stickR: 3.2, grip: 1.0 },
    spoon: { name: 'スプーン', back: 22, bowlAt: 165, bowlR: 34, bowlDepth: 20, rimR: 5 },   // 手は柄の端を持つ。すくう部分は手から 212px 先
    fork:  { name: 'フォーク', back: 22, tineFrom: 120, tineTo: 200, r: 3 },
    hand:  { name: '手', fingerLen: 44, fingerR: 10, gap: 64, grip: 2.2 },
  };

  return { MAT, VESSELS, DISHES, UTENSILS, makeVessel, buildDish, finishDish, hexFill };
});
