// src/game.js — ルール（手・食器・口・あご・のど・判定・結果）。画面に依存しない。
// 画面（render.js）はこの状態を描くだけ。ボットも同じ入力 API を使う。
(function (root, factory) {
  const isNode = typeof require === 'function' && typeof module === 'object';
  const E = isNode ? require('./engine.js') : root.GohanEngine;
  const F = isNode ? require('./food.js') : root.GohanFood;
  const D = isNode ? require('./diners.js') : root.GohanDiners;
  const api = factory(E, F, D);
  if (isNode) module.exports = api; else root.GohanGame = api;
})(typeof self !== 'undefined' ? self : this, function (E, F, D) {
  'use strict';
  const W = 1600, H = 760;          // 場面の大きさ（画面はこれを拡大縮小する）
  const TABLE_Y = 600, TABLE_LEFT = 40;
  const UT = F.UTENSILS;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  const mean = arr => arr.reduce((s, v) => s + v, 0) / (arr.length || 1);

  // 出来事 → 画面に残す文
  const STATUS_TEXT = {
    grab: 'つかんだ', slip: 'ぽろっ……落とした', spill_table: 'テーブルにこぼした', spill_floor: '床に落ちた', spill_clothes: '服にこぼした',
    enter_mouth: 'ぱく', chew: 'もぐ', crunch: 'もぐもぐ', clack: 'カチッ（食器を噛んだ）', bone_bite: 'ガリッ（骨を噛んだ）',
    swallow_start: 'ごく……', gulp: 'ごくん', yummy: 'おいしい！', gulp_big: '大口でごくん……苦しい', marunomi: '丸飲みした……',
    choke: 'むせた！', bone_swallow: 'のどに骨が！', swallow_empty: 'つばを飲んだ', face_bump: 'ほっぺに当たった', escaped: 'ぶどうが逃げた',
    full: 'おなかいっぱい', finished: '完食！', gone: '器は空……でも、だいぶこぼした', timeout: '時間切れ', quit: 'ごちそうさま',
    tear: 'ちぎった', bite_off: 'かじり取った', fire: 'ゴオオッ（炎）', charred: 'こがした', tusk: '牙で噛みちぎった',
  };
  const TOAST_TEXT = { slip: 'ぽろっ', spill_table: 'ぽとっ', spill_floor: 'べちゃ', spill_clothes: 'あっ', clack: 'カチッ', bone_bite: 'ガリッ', gulp: 'ごくん', yummy: 'おいしい！', gulp_big: '大口！', marunomi: '丸飲み…', choke: 'むせた！', bone_swallow: 'のどに骨！', crunch: 'もぐ', face_bump: 'ぺち', escaped: 'ふわ…', swallow_empty: 'ごく…', tear: 'ちぎっ', bite_off: 'がぶっ', charred: 'こげた', tusk: 'ガブリ' };

  class Game {
    constructor(opts) {
      opts = opts || {};
      this.seed = (opts.seed === undefined || opts.seed === null) ? (((Date.now() & 0xffffff) ^ Math.floor(Math.random() * 1e9)) >>> 0) : (opts.seed >>> 0);
      this.rng = E.makeRng(this.seed);
      this.diner = (opts.diner && D.DINERS.find(d => d.id === opts.diner)) || this.rng.pick(D.DINERS);
      this.dish = (opts.dish && F.DISHES.find(d => d.id === opts.dish)) || this.rng.pick(F.DISHES);
      this.utensilKey = (opts.utensil && UT[opts.utensil]) ? opts.utensil : this.rng.weighted(this.dish.utensils);
      this.utensil = UT[this.utensilKey];
      this.time = 0; this.state = 'eating'; this.endReason = null; this.events = []; this.toasts = []; this.log = [];
      this.input = { tx: 700, ty: 300, tilt: -1.6, squeeze: false, mouth: false, chew: false, tongue: false, swallow: false, slurp: false, finish: false };
      this._chewEdge = false; this._swallowEdge = false; this.chewId = 0; this.lastStatus = ''; this.lastStatusT = 0;
      this.satisfaction = 0; this.fullness = 0; this.biteMass = 0; this.chewsSinceSwallow = 0; this.subDt = 1 / 240; this.lastMouthEmptyT = 0;
      this.layout(); this.build(); this.initStats();
    }
    layout() {
      const d = this.diner; this.tableY = TABLE_Y;
      this.mainX = 640; this.sideX = 890; this.wideX = 720;   // 試作3.1: 器を小さくしたので奥の皿を少し手前に
      let shoulderX = clamp(this.mainX + d.reach * .72, 900, 1420);
      if (d.kind === 'fairy') { this.shoulder = { x: shoulderX, y: TABLE_Y - 150 }; this.mouth = { x: shoulderX - 62, y: this.shoulder.y - 48 }; }
      else if (d.kind === 'dragon') { this.shoulder = { x: shoulderX, y: TABLE_Y - 30 - 60 * d.hs }; this.mouth = { x: shoulderX - 300 * d.hs, y: this.shoulder.y - 150 * d.hs }; }
      else { this.shoulder = { x: shoulderX, y: TABLE_Y - 30 - 60 * d.hs }; this.mouth = { x: shoulderX - 200 * d.hs, y: this.shoulder.y - 150 * d.hs }; }
      this.tableRight = clamp(this.shoulder.x - 95 * d.hs, 1150, 1480);
      if (d.kind === 'fairy') this.tableRight = 1250;
    }
    build() {
      const w = this.world = new E.World({ gravity: 9000, killY: this.tableY + 140, cell: 26, iterations: 2 });
      w.statics.push(E.seg(TABLE_LEFT, this.tableY, this.tableRight, this.tableY, 2, { fric: .55, tag: 'table' }));
      this.vessels = {};
      for (const vd of this.dish.vessels) { const cx = vd.slot === 'main' ? this.mainX : vd.slot === 'side' ? this.sideX : this.wideX; this.vessels[vd.slot] = F.makeVessel(vd.type, cx, this.tableY); }
      const built = F.buildDish(w, this.dish, this.vessels, this.rng);
      this.edibleTotal = built.edibleTotal; this.hadBones = built.particles.some(p => p.mat.bone);
      let ideal = 0; for (const p of built.particles) if (!p.mat.bone) ideal += p.mat.taste * p.r * p.r; this.idealSat = ideal * .012;
      w.settle(1.2, 3); F.finishDish(w);
      this.vesselList = Object.values(this.vessels);
      this.hand = { x: this.mainX + 20, y: this.tableY - 420, vx: 0, vy: 0 }; this.input.tx = this.hand.x; this.input.ty = this.hand.y;
      this.tilt = 1.3; this.input.tilt = 1.3; this.squeeze = 0; this.aperture = 0; this.chewPhase = 0; this.chewing = false; this.tongue = 0;
      this.swallowT = 0; this.swallowCd = 0; this.cough = 0; this.pressure = 0; this.slurpOn = 0; this.swallowBatch = []; this.mouthCount = 0; this.mouthOcc = 0;
      this.prevKin = new Map(); this.utSegs = []; this.mouthSegs = [];
      this.geom = this.mouthGeom();
    }
    initStats() {
      this.stats = { chews: 0, openChews: 0, crushChews: 0, swallows: [], biteRatios: [], eaten: 0, spillTable: 0, spillFloor: 0, spillClothes: 0, chokes: 0, boneBites: 0, boneSwallows: 0, clacks: 0, slips: 0, grabs: 0, marunomi: 0, slurpTime: 0, bumps: 0, escaped: 0, tears: 0, biteOffs: 0, fireTime: 0, charred: 0, tusks: 0 };
    }
    setInput(partial) {
      for (const k in partial) {
        if (k === 'chew') { if (partial.chew && !this.input.chew) this._chewEdge = true; }
        if (k === 'swallow') { if (partial.swallow && !this.input.swallow) this._swallowEdge = true; }
        this.input[k] = partial[k];
      }
    }
    emit(type, data) {
      const ev = Object.assign({ type, t: this.time }, data || {}); this.events.push(ev); this.log.push(ev);
      if (STATUS_TEXT[type] && type !== 'chew' && type !== 'crunch' && type !== 'enter_mouth' && type !== 'grab') { this.lastStatus = STATUS_TEXT[type]; this.lastStatusT = this.time; }
      if (type === 'crunch' && (this.stats.crushChews % 3) !== 1) return;
      if (TOAST_TEXT[type]) {
        const nearMouth = /gulp|yummy|marunomi|choke|bone|clack|crunch|swallow|face/.test(type);
        const x = nearMouth ? this.mouth.x - 30 : (data && data.p ? data.p.x : this.hand.x), y = nearMouth ? this.mouth.y - 60 * this.diner.hs - 20 : (data && data.p ? data.p.y - 20 : this.hand.y - 30);
        const last = this.toasts[this.toasts.length - 1];
        if (!(last && last.text === TOAST_TEXT[type] && this.time - last.t < .35)) this.toasts.push({ text: TOAST_TEXT[type], x, y, t: this.time, kind: type });
      }
    }

    // ---- 口の形（口の点を原点、+x が口の奥）----
    effAperture() { let a = this.aperture; if (this.cough > 0) a = Math.max(a, .8); if (this.pressure > 1) a = Math.max(a, Math.min(1, (this.pressure - 1) * 1.6)); return a; }
    mouthGeom(apOverride) {
      const d = this.diner, hs = d.hs, G = d.G, Dp = d.D, H0 = d.H0;
      const ap = apOverride === undefined ? this.effAperture() : apOverride; const jc = this.chewing ? Math.sin(Math.PI * this.chewPhase) : 0;
      // あごは、歯の間にある食べ物より先には閉じられない（押しつぶす量は crush() が別に数える）
      const minGap = this.crushMaxDiam ? this.crushMaxDiam * .55 + 10 : 0;
      const jawDrop = Math.max(ap * G + H0 * (1 - jc), minGap); const lipGap = ap * G;
      const upperY = -H0 / 2, lowerY = upperY + jawDrop; const tp = this.tongue || 0;
      const ceiling = [{ x: 0, y: -lipGap / 2 - 2 }, { x: Dp * .18, y: upperY }, { x: Dp * .62, y: upperY }, { x: Dp * .8, y: upperY - 12 * hs }, { x: Dp, y: upperY - 6 * hs }];
      const floor = [{ x: 0, y: lipGap / 2 + 2 }, { x: Dp * .18, y: lowerY - tp * 7 * hs }, { x: Dp * .5, y: lowerY - tp * 3 * hs }, { x: Dp * .62, y: lowerY }, { x: Dp * .8, y: lowerY + 14 * hs }, { x: Dp, y: lowerY + 22 * hs }];
      return { ap, jc, jawDrop, lipGap, upperY, lowerY, ceiling, floor, G, D: Dp, H0, hs, lipR: 9 * hs, lipLen: 30 * hs, tp };
    }
    cavityArea(g) { g = g || this.geom; let a = 0; const n = 24; for (let i = 0; i < n; i++) { const x = g.D * (i + .5) / n; a += Math.max(0, E.polyY(g.floor, x) - E.polyY(g.ceiling, x)) * (g.D / n); } return a; }
    cavityAreaRest() { if (this._restArea === undefined) { const sv = this.chewing; this.chewing = false; this._restArea = this.cavityArea(this.mouthGeom(0)); this.chewing = sv; } return this._restArea; }
    buildMouthSegs() {
      const M = this.mouth, g = this.geom; const segs = []; const mk = (a, b, r, tag) => E.seg(M.x + a.x, M.y + a.y, M.x + b.x, M.y + b.y, r, { fric: .5, tag });
      segs.push(mk({ x: 0, y: -g.lipGap / 2 - g.lipLen }, { x: 0, y: -g.lipGap / 2 }, g.lipR, 'lipU'));
      segs.push(mk({ x: 0, y: g.lipGap / 2 }, { x: 0, y: g.lipGap / 2 + g.lipLen }, g.lipR, 'lipL'));
      segs.push(mk({ x: 7 * g.hs, y: -g.lipGap / 2 - g.lipLen }, { x: 7 * g.hs, y: -g.lipGap / 2 - 2 }, g.lipR * .8, 'lipU2'));
      segs.push(mk({ x: 7 * g.hs, y: g.lipGap / 2 + 2 }, { x: 7 * g.hs, y: g.lipGap / 2 + g.lipLen }, g.lipR * .8, 'lipL2'));
      for (let i = 0; i < g.ceiling.length - 1; i++) { const s = mk(g.ceiling[i], g.ceiling[i + 1], 5, 'ceil' + i); s.oneWay = { x: 0, y: 1 }; segs.push(s); }
      for (let i = 0; i < g.floor.length - 1; i++) { const s = mk(g.floor[i], g.floor[i + 1], 5, 'floor' + i); s.oneWay = { x: 0, y: -1 }; segs.push(s); }
      const gateTop = g.ceiling[g.ceiling.length - 1], gateBot = g.floor[g.floor.length - 1];
      segs.push(mk({ x: g.D, y: gateTop.y - 4 }, { x: g.D, y: gateBot.y + 6 }, 3, 'gate'));
      segs[segs.length - 1].oneWay = { x: -1, y: 0 }; if (this.swallowT > 0) segs[segs.length - 1].solid = false;
      return segs;
    }
    // ---- 食器の形（手を原点、+x が先） ----
    handFrame() { const c = Math.cos(this.tilt), s = Math.sin(this.tilt); const Hd = this.hand; return { toWorld: (lx, ly) => ({ x: Hd.x + lx * c - ly * s, y: Hd.y + lx * s + ly * c }), toLocal: (x, y) => { const dx = x - Hd.x, dy = y - Hd.y; return { x: dx * c + dy * s, y: -dx * s + dy * c }; } }; }
    tipLocal() { const u = this.utensil; switch (this.utensilKey) { case 'hashi': return { x: u.tipFrom, y: 0 }; case 'spoon': return { x: u.bowlAt, y: u.bowlDepth * .5 }; case 'fork': return { x: u.tineTo, y: 0 }; default: return { x: UT.hand.fingerLen, y: 0 }; } }
    tipWorld() { const t = this.tipLocal(); return this.handFrame().toWorld(t.x, t.y); }
    handFor(tipX, tipY, tilt) { const t = this.tipLocal(); const c = Math.cos(tilt), s = Math.sin(tilt); return { x: tipX - (t.x * c - t.y * s), y: tipY - (t.x * s + t.y * c) }; }
    // 挟んでいる粒の太さ（箸や指は、それ以上は閉じられない）
    heldDiam() { let m = 0; for (const h of this.world.holds) if (!h.dead && h.tag === 'pinch' && h.p.r * 2 > m) m = h.p.r * 2; return m; }
    buildUtensilSegs() {
      const u = this.utensil, key = this.utensilKey; const fr = this.handFrame(); const segs = [];
      const mk = (ax, ay, bx, by, r, tag, fric) => { const a = fr.toWorld(ax, ay), b = fr.toWorld(bx, by); return E.seg(a.x, a.y, b.x, b.y, r, { fric: fric || .5, tag, holder: true }); };
      if (key === 'hashi') {
        const tipX = u.tipFrom, backX = u.tipFrom - u.len; const hd = this.heldDiam(); const gap = Math.max(u.gap * (1 - this.squeeze), hd ? hd + u.stickR * 2 - 3 : 0);
        segs.push(mk(backX, 4, tipX, 4, u.stickR, 'stickA', .55)); segs.push(mk(backX, -4, tipX, -4 - gap, u.stickR, 'stickB', .55));
      } else if (key === 'spoon') {
        const hs1 = mk(-u.back, 0, u.bowlAt - u.bowlR + 4, -2, 3, 'handle', .3); hs1.solid = false; segs.push(hs1);   // 柄は当たらない（当てると器の中身をはね飛ばした）
        const cx = u.bowlAt, cy = -u.bowlDepth * .25; const n = 7;   // 線分の名前は1本ずつ別にする（前フレームの位置の対応に使う）
        for (let i = 0; i < n; i++) { const a0 = Math.PI * (.06 + .88 * i / n), a1 = Math.PI * (.06 + .88 * (i + 1) / n); segs.push(mk(cx + Math.cos(a0) * u.bowlR, cy + Math.sin(a0) * u.bowlDepth, cx + Math.cos(a1) * u.bowlR, cy + Math.sin(a1) * u.bowlDepth, u.rimR, 'bowl' + i, .25));  }
      } else if (key === 'fork') {
        segs.push(mk(-u.back, 0, u.tineFrom, 0, 3, 'handle', .3)); segs.push(mk(u.tineFrom, 0, u.tineTo, 0, u.r, 'tines', .3));
      } else {
        const hd = this.heldDiam(); const gap = Math.max(u.gap * (1 - this.squeeze), hd ? hd + u.fingerR * 2 - 8 : 0);
        segs.push(mk(-10, 12, u.fingerLen, 12, u.fingerR, 'stickA', .7)); segs.push(mk(-10, -12, u.fingerLen, -12 - gap, u.fingerR, 'stickB', .7));
      }
      return segs;
    }

    // ---- 更新 ----
    update(dt) {
      if (this.state !== 'eating') return;
      dt = Math.min(dt, 1 / 30); const sub = 4; this.subDt = dt / sub; this.time += dt;
      this.prevHand = { x: this.hand.x, y: this.hand.y }; this.prevTilt = this.tilt;
      this.updateHand(dt); this.updateMouth(dt);
      this.geom = this.mouthGeom();
      const kin = this.buildMouthSegs().concat(this.buildUtensilSegs());
      // 各線分の速さ（前のフレームとの差）
      for (const s of kin) { const key = s.tag; const prev = this.prevKin.get(key); if (prev) { s.vx = ((s.ax + s.bx) / 2 - (prev.ax + prev.bx) / 2) / dt; s.vy = ((s.ay + s.by) / 2 - (prev.ay + prev.by) / 2) / dt; s.pax = prev.ax; s.pay = prev.ay; s.pbx = prev.bx; s.pby = prev.by; } this.prevKin.set(key, { ax: s.ax, ay: s.ay, bx: s.bx, by: s.by }); }
      this.mouthSegs = kin.filter(s => !/stick|bowl|handle|tines/.test(s.tag)); this.utSegs = kin.filter(s => /stick|bowl|handle|tines/.test(s.tag));
      this.world.kinematics = kin;
      this.updateGrabs(); this.tearHeld(); this.applyForces(dt);
      this.world.step(dt, sub);
      this.postStep(dt); this.checkEnd();
      this.toasts = this.toasts.filter(t => this.time - t.t < 1.5);
      if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
    }
    updateHand(dt) {
      const d = this.diner, S = this.shoulder, inp = this.input;
      let tx = inp.tx, ty = inp.ty;
      const dx = tx - S.x, dy = ty - S.y; const dist = Math.hypot(dx, dy); const maxR = d.reach * .97;
      if (dist > maxR) { tx = S.x + dx / dist * maxR; ty = S.y + dy / dist * maxR; }
      tx = clamp(tx, 20, W - 20); ty = clamp(ty, 20, H - 20);
      const k = 1 - Math.exp(-dt * d.dex * 60); const t = this.time;
      const tr = d.tremor * (this.cough > 0 ? 3 : 1);
      const nx = tr * (Math.sin(t * 11.3) * .6 + Math.sin(t * 23.1 + 1.7) * .4), ny = tr * (Math.cos(t * 9.7 + .4) * .6 + Math.sin(t * 19.3) * .4);
      const ox = this.hand.x, oy = this.hand.y;
      let mx = (tx + nx - this.hand.x) * k, my = (ty + ny - this.hand.y) * k;
      const maxStep = 2600 * dt; const ml = Math.hypot(mx, my); if (ml > maxStep) { mx *= maxStep / ml; my *= maxStep / ml; }   // 腕はこれより速く動かない
      this.hand.x += mx; this.hand.y += my;
      const kt = 1 - Math.exp(-dt * 14); this.tilt += angDiff(inp.tilt, this.tilt) * kt;
      this.squeeze += ((inp.squeeze ? 1 : 0) - this.squeeze) * (1 - Math.exp(-dt * 16));
      // 食器の先が顔を突きぬけないように（口が開いていれば口の中へ入れる）
      const tip = this.tipWorld(); const M = this.mouth, g = this.geom;
      const lx = tip.x - M.x, ly = tip.y - M.y;
      if (lx > -2) {
        const insideMouth = ly > E.polyY(g.ceiling, Math.max(0, lx)) - 4 && ly < E.polyY(g.floor, Math.max(0, lx)) + 4;
        const throughLips = Math.abs(ly) < g.lipGap / 2 + 4;
        if (lx > g.D - 12 && insideMouth) { this.hand.x -= lx - (g.D - 12); }
        else if (!insideMouth && !throughLips && lx < 60 * d.hs + 20) {
          const over = lx + 2; this.hand.x -= over; if (over > 14 && this.time - (this.lastBumpT || -9) > .6) { this.lastBumpT = this.time; this.stats.bumps++; this.emit('face_bump'); }
        }
      }
      this.hand.vx = (this.hand.x - ox) / dt; this.hand.vy = (this.hand.y - oy) / dt;
    }
    updateMouth(dt) {
      const d = this.diner, inp = this.input;
      const target = inp.mouth ? 1 : 0; this.aperture += (target - this.aperture) * (1 - Math.exp(-dt * (inp.mouth ? 7 : 9)));
      if (this._chewEdge && this.cough <= 0) {
        if (!this.chewing || this.chewPhase > .7) { this.chewing = true; this.chewPhase = 0.0001; this.chewId++; this.stats.chews++; if (this.effAperture() > .3 && this.mouthCount > 0) this.stats.openChews++; this.emit('chew'); }
      }
      this._chewEdge = false;
      if (this.chewing) { const prev = this.chewPhase; this.chewPhase += dt / d.chewDur; if (prev < .5 && this.chewPhase >= .5) this.crush(); if (this.chewPhase >= 1) { this.chewing = false; this.chewPhase = 0; } }
      this.tongue += ((inp.tongue ? 1 : 0) - this.tongue) * (1 - Math.exp(-dt * 10));
      if (this.swallowCd > 0) this.swallowCd -= dt;
      if (this._swallowEdge && this.swallowT <= 0 && this.swallowCd <= 0 && this.cough <= 0) { this.swallowT = .55; this.swallowBatch = []; this.emit('swallow_start'); }
      this._swallowEdge = false;
      if (this.swallowT > 0) { this.swallowT -= dt; if (this.swallowT <= 0) { this.swallowT = 0; this.finishSwallow(); } }
      if (this.cough > 0) this.cough -= dt;
      const breathOn = (inp.slurp && this.aperture > .25 && this.cough <= 0) ? 1 : 0;
      if (d.special === 'fire') { this.slurpOn = 0; const was = this.fireOn; this.fireOn = breathOn; if (breathOn) this.stats.fireTime += dt; if (breathOn && !was) this.emit('fire'); }
      else { this.slurpOn = breathOn; this.fireOn = 0; if (this.slurpOn) this.stats.slurpTime += dt; }
    }
    // 箸で挟んだまま引っぱると、つなぎが切れて「ちぎれる」（すべる前に、ちぎれる）
    tearHeld() {
      const w = this.world; let torn = 0;
      for (const h of w.holds) {
        if (h.dead || h.tag !== 'pinch' || !h.load || h.load < h.slipTol * .4) continue; const p = h.p;
        for (const c of w.constraints) {
          if (c.dead || (c.a !== p && c.b !== p)) continue; const q = c.a === p ? c.b : c.a; if (q.held) continue;
          const d = Math.hypot(q.x - p.x, q.y - p.y); if (d > c.len * 1.12) { c.dead = true; c.a.ncons--; c.b.ncons--; torn++; }
        }
      }
      if (torn > 0) { this.stats.tears++; if (this.time - (this.lastTearT || -9) > .5) { this.lastTearT = this.time; this.emit('tear', { p: this.hand }); } }
    }
    updateGrabs() {
      const key = this.utensilKey, w = this.world, segs = this.utSegs;
      if (key === 'hashi' || key === 'hand') {
        const A = segs.find(s => s.tag === 'stickA'), B = segs.find(s => s.tag === 'stickB');
        if (this.squeeze < .4) { for (const h of w.holds) if (h.tag === 'pinch') w.release(h, 'open'); return; }
        if (this.squeeze < .6 || this.input.squeeze === false) return;
        const tipLen = key === 'hashi' ? 90 : UT.hand.fingerLen + 16;
        const cut = (s) => { const L = Math.hypot(s.bx - s.ax, s.by - s.ay) || 1; const f = Math.min(1, tipLen / L); return { ax: s.bx + (s.ax - s.bx) * f, ay: s.by + (s.ay - s.by) * f, bx: s.bx, by: s.by, r: s.r }; };
        const tA = cut(A), tB = cut(B); const mid = { x: (A.bx + B.bx) / 2, y: (A.by + B.by) / 2 };
        let n = 0; for (const h of w.holds) if (h.tag === 'pinch' && !h.dead) n++;
        const maxHold = key === 'hashi' ? 7 : 16; const slack = key === 'hashi' ? 2.5 : 4;
        const gapNow = Math.hypot(A.bx - B.bx, A.by - B.by);
        w.forEachNear(mid.x, mid.y, tipLen * .75, p => {
          if (n >= maxHold || p.held || p.mat.slip <= 0) return;
          if (gapNow > p.r * 2 + A.r * 2 + 6) return;   // まだ開きすぎ
          if (E.segDist(p.x, p.y, tA) < p.r + tA.r + slack && E.segDist(p.x, p.y, tB) < p.r + tB.r + slack) { this.pinch(p, 'pinch'); n++; }
        });
      } else if (key === 'fork') {
        if (this.input.squeeze) { for (const h of w.holds) if (h.tag === 'spear') w.release(h, 'open'); return; }
        const T = segs.find(s => s.tag === 'tines'); const ux = T.bx - T.ax, uy = T.by - T.ay; const L = Math.hypot(ux, uy) || 1;
        const speedAlong = (this.hand.vx * ux + this.hand.vy * uy) / L; if (speedAlong < 140) return;
        let n = 0; for (const h of w.holds) if (h.tag === 'spear' && !h.dead) n++;
        w.forEachNear(T.bx, T.by, 14, p => { if (n >= 4 || p.held || p.mat.liquid) return; this.pinch(p, 'spear'); n++; });
      }
    }
    pinch(p, tag) {
      const fr = this.handFrame(); const loc = fr.toLocal(p.x, p.y); const lx = loc.x, ly = loc.y;
      // つかんだ瞬間は、手が「今の位置」にあるものとして、ずれが出ないようにする
      this.prevHand = { x: this.hand.x, y: this.hand.y }; this.prevTilt = this.tilt;
      const g = this.diner.grip * (tag === 'spear' ? 1.3 : (this.utensilKey === 'hand' ? UT.hand.grip : 1));
      const tol = Math.max(1.5, p.mat.slip * g * (this.utensilKey === 'fork' ? 2.2 : (.9 + .6 * this.squeeze)));
      const self = this;
      // サブステップごとに手の位置を補間する（1フレームぶん一気に動くと、それだけで「すべった」になる）
      const h = this.world.hold(p, () => {
        const w = self.world; const ph = self.prevHand || self.hand; const pt = self.prevTilt === undefined ? self.tilt : self.prevTilt;
        const at = f => { const hx = ph.x + (self.hand.x - ph.x) * f, hy = ph.y + (self.hand.y - ph.y) * f; const tl = pt + angDiff(self.tilt, pt) * f; const c = Math.cos(tl), s = Math.sin(tl); return { x: hx + lx * c - ly * s, y: hy + lx * s + ly * c }; };
        const a = at((w.subIndex + 1) / w.subCount), b = at(w.subIndex / w.subCount);   // 回転ぶんも含めた、このサブステップの動き
        return { x: a.x, y: a.y, vx: a.x - b.x, vy: a.y - b.y };
      }, 1.0, tol, tag);
      if (h) { this.stats.grabs++; this.emit('grab', { p, tag }); }
    }
    applyForces(dt) {
      const M = this.mouth, g = this.geom, d = this.diner;
      let charredNow = 0;
      for (const p of this.world.particles) {
        if (!p.inMouth) {
          if (this.slurpOn) { const lx = p.x - M.x, ly = p.y - M.y; const range = 150 * d.hs; if (lx < 0 && lx > -range && Math.abs(ly) < g.lipGap / 2 + 36) { const f = 5600 * d.slurp * (1 - (-lx) / range); p.ax += f; p.ay += -ly * 8; } }
          else if (this.fireOn) {
            // ドラゴンの炎：口の前の食べ物を焼く（こんがり → こげ）。少し吹き飛ばす。
            const lx = p.x - M.x, ly = p.y - M.y; const range = 300 * d.hs;
            if (lx < 0 && lx > -range && Math.abs(ly) < 30 * d.hs + (-lx) * .35) {
              const near = 1 - (-lx) / range; if (!p.mat.liquid) { const before = p.roast || 0; p.roast = before + dt * (1.2 * near + .2); if (before < 2.2 && p.roast >= 2.2) charredNow++; }
              p.ax -= 900 * near; p.ay -= 500 * near * (.5 + Math.sin(this.time * 37 + p.id) * .5);
            }
          }
          continue;
        }
        if (this.tongue > .05) p.ax += 5200 * this.tongue;
        if (this.swallowT > 0) { p.ax += 11000; p.ay += 800; }
        if (this.slurpOn) p.ax += 900;
        if (this.cough > 0) { p.ax -= 9500; p.ay -= 1800; }
      }
      if (charredNow > 0) { this.stats.charred += charredNow; this.emit('charred', { p: { x: M.x - 120 * d.hs, y: M.y } }); }
    }
    postStep(dt) {
      const M = this.mouth, g = this.geom, Dp = this.diner.D, w = this.world; let occ = 0, count = 0;
      for (const p of w.particles) {
        const lx = p.x - M.x, ly = p.y - M.y; let inM = false;
        if (lx > 0 && lx < Dp + 30) { const cy = E.polyY(g.ceiling, Math.min(lx, Dp)), fy = E.polyY(g.floor, Math.min(lx, Dp)); inM = ly > cy - 3 && ly < fy + 3; }
        if (this.swallowT > 0 && lx > Dp * .9 && inM) { this.swallowBatch.push({ r: p.r, hard: p.hard, mat: p.mat, chews: p.chews, roast: p.roast || 0 }); w.kill(p, 'swallowed'); continue; }
        if (inM && !p.inMouth) { p.inMouth = true; p.zone = 'mouth'; this.emit('enter_mouth', { p }); }
        else if (!inM && p.inMouth) { p.inMouth = false; p.zone = 'air'; }
        if (inM) { occ += p.r * p.r * Math.PI * 1.15; count++; continue; }
        if (p.held) { p.zone = 'held'; continue; }
        if (p.y < -40 && p.g < 0) { w.kill(p, 'escaped'); continue; }
        let inVessel = false;
        for (const v of this.vesselList) { if (p.x > v.left - 10 && p.x < v.right + 10 && p.y > v.top - 70 && p.y < v.bottom + 10) { if (p.y <= v.top + 2 || E.pointInPoly(p.x, p.y, v.poly)) { inVessel = true; break; } } }
        if (inVessel) { p.zone = 'dish'; continue; }
        if (p.y > this.tableY - p.r - 5 && p.x > TABLE_LEFT && p.x < this.tableRight) { if (p.zone !== 'table') { p.zone = 'table'; if (!p.spilled && !p.mat.bone) { p.spilled = true; this.stats.spillTable += p.r * p.r; this.emit('spill_table', { p }); } } continue; }
        p.zone = 'air';
      }
      this.mouthCount = count; this.mouthOcc = occ; if (count === 0) this.lastMouthEmptyT = this.time;
      let cmd = 0; for (const p of w.particles) if (p.inMouth && !p.mat.liquid) { const lx = p.x - M.x; if (lx > Dp * .02 && lx < Dp * .64 && p.r * 2 > cmd) cmd = p.r * 2; } this.crushMaxDiam = cmd;
      const cap = this.cavityArea() * this.diner.cheek; this.pressure = occ / Math.max(1, cap);
      for (const ev of w.events) {
        if (ev.type === 'dead' && ev.reason === 'fell') { const p = ev.p; if (p.mat.bone) continue; const mass = p.r * p.r; if (p.spilled) this.stats.spillTable = Math.max(0, this.stats.spillTable - mass); p.spilled = true; if (p.x > this.tableRight - 10) { this.stats.spillClothes += mass; this.emit('spill_clothes', { p }); } else { this.stats.spillFloor += mass; this.emit('spill_floor', { p }); } }
        else if (ev.type === 'dead' && ev.reason === 'escaped') { this.stats.escaped += ev.p.r * ev.p.r; this.emit('escaped', { p: ev.p }); }
        else if (ev.type === 'release' && ev.reason === 'slip') { this.stats.slips++; this.emit('slip', { p: ev.p }); }
      }
      w.events.length = 0;
    }
    crush() {
      const M = this.mouth, g = this.geom, d = this.diner, w = this.world; const Dp = d.D;
      const gap = g.ap * d.G; const x0 = Dp * .02, x1 = Dp * .64; let crushed = 0, boneHit = false, frontCut = 0, tuskCut = 0;
      const power = d.jawPower * (this.pressure > 1 ? .7 : 1);
      const frontX = Dp * .22;   // ここより前は前歯（かじり取る）。オークは牙で、より強く・つなぎごと噛みちぎる
      for (const s of this.utSegs) {
        if (s.tag === 'handle') continue;
        const ex = s.bx - M.x, ey = s.by - M.y;
        if (ex > x0 && ex < x1 && ey > g.upperY - 6 && ey < g.lowerY + 6) { this.stats.clacks++; this.emit('clack'); break; }
      }
      const toSplit = [];
      for (const p of w.particles) {
        if (!p.inMouth) continue; const lx = p.x - M.x; if (lx < x0 || lx > x1) continue;
        if (p.r * 2 <= gap + 1) continue;
        const over = Math.min(1, (p.r * 2 - gap) / (p.r * 2));
        if (p.mat.bone) { boneHit = true; continue; }
        if (p.mat.liquid) continue;
        p.chews++; crushed++;
        const front = lx < frontX; const tusk = front && d.special === 'tusks';
        const roastK = p.roast >= 2.2 ? 1.6 : 1;   // こげた物はもろい
        p.hard -= over * power * p.mat.crush * (1 + .4 * p.mash) * (tusk ? 2.2 : 1) * roastK;
        if (front && p.ncons > 0) {
          // 前歯で噛むと、口の外につながる「つなぎ」が切れて、かじり取れる
          let cut = 0; for (const c of w.constraints) { if (c.dead || (c.a !== p && c.b !== p)) continue; const q = c.a === p ? c.b : c.a; if (!q.inMouth || tusk) { c.dead = true; c.a.ncons--; c.b.ncons--; cut++; } }
          if (cut) { frontCut++; if (tusk) tuskCut++; }
        }
        if (p.hard < .55 && p.ncons > 0) w.breakLinks(p);
        if (p.hard <= 0) toSplit.push(p);
      }
      for (const p of toSplit) w.split(p, this.rng);
      if (boneHit) { this.stats.boneBites++; this.emit('bone_bite'); }
      if (tuskCut > 0) { this.stats.tusks++; this.emit('tusk'); }
      else if (frontCut > 0) { this.stats.biteOffs++; this.emit('bite_off'); }
      if (crushed > 0) { this.stats.crushChews++; this.emit('crunch', { n: crushed }); }
      this.chewsSinceSwallow++;
    }
    finishSwallow() {
      const b = this.swallowBatch; this.swallowBatch = []; this.swallowCd = .3; const d = this.diner;
      if (!b.length) { this.emit('swallow_empty'); return; }
      let vol = 0, hardSum = 0, bones = 0, maxChunk = 0, taste = 0;
      for (const q of b) {
        const a = q.r * q.r; if (q.mat.bone) { bones++; continue; } vol += a; hardSum += q.hard * a;
        // 焼き加減：こんがり（0.6〜2.2）はおいしい。こげ（2.2〜）はまずい。ドラゴンは焼いた物が好き
        const ro = q.roast || 0; const tk = ro >= 2.2 ? .3 : (ro >= .6 ? (d.special === 'fire' ? 1.6 : 1.2) : (d.special === 'fire' ? .8 : 1));
        taste += q.mat.taste * a * tk; if (q.hard > .6 && q.r > maxChunk) maxChunk = q.r;
      }
      const hardAvg = vol > 0 ? hardSum / vol : 0; const capArea = d.throatCap * 49;
      const biteRatio = vol / (d.throatCap * 49);   // のどの容量（一度に楽に飲める量）に対する一口の大きさ
      const rec = { t: this.time, vol, hardAvg, bones, maxChunk, chews: this.chewsSinceSwallow, result: 'ok', biteRatio };
      this.chewsSinceSwallow = 0;
      if (bones > 0) { rec.result = 'bone'; this.stats.boneSwallows += bones; this.cough = 1.6; this.satisfaction -= this.idealSat * .08; this.emit('bone_swallow'); }
      else if (vol > capArea) {
        const ratio = vol / capArea; const chance = Math.min(.95, (ratio - 1) * 1.4 + (hardAvg > .6 ? .25 : 0));
        if (this.rng.chance(chance)) {
          rec.result = 'choke'; this.stats.chokes++; this.cough = 1.1; this.satisfaction -= this.idealSat * .05;
          for (const q of b) { if (q.mat.bone) continue; const p = new E.Particle(this.mouth.x - 8 - this.rng.range(0, 16), this.mouth.y + this.rng.range(-8, 8), q.r, q.mat); p.hard = q.hard; p.mash = Math.max(q.mash || 0, 2); p.chews = q.chews; p.px = p.x + this.rng.range(500, 1200) * this.subDt; p.py = p.y + this.rng.range(-100, 300) * this.subDt; p.zone = 'air'; p.spilled = true; this.world.addParticle(p); }
          this.stats.swallows.push(rec); this.emit('choke'); return;
        }
        rec.result = 'big'; this.satisfaction += taste * .012 * .5; this.fullness += vol / (this.edibleTotal * d.stomach); this.emit('gulp_big');
      }
      else if (maxChunk > d.chunkTol) { rec.result = 'marunomi'; this.stats.marunomi++; this.satisfaction += taste * .012 * .6; this.fullness += vol / (this.edibleTotal * d.stomach); this.emit('marunomi'); }
      else {
        const chewBonus = .6 + .8 * (1 - hardAvg); const like = 1 - Math.min(1, Math.abs(biteRatio - d.likesBite) / .6);
        const gain = taste * .012 * chewBonus * (.8 + .4 * like); rec.gain = gain;
        this.satisfaction += gain; this.fullness += vol / (this.edibleTotal * d.stomach);
        this.emit(gain > this.idealSat * .06 ? 'yummy' : 'gulp', { gain });
      }
      this.stats.eaten += vol; this.stats.swallows.push(rec); this.stats.biteRatios.push(biteRatio);
    }
    remainingEdible() { let m = 0; for (const p of this.world.particles) if (!p.mat.bone && !p.inMouth) m += p.r * p.r; return m; }
    checkEnd() {
      if (this.state !== 'eating') return;
      const remain = this.remainingEdible();
      if (this.input.finish) return this.end('quit');
      if (remain < this.edibleTotal * .06) { if (this.mouthCount === 0 || this.time - this.lastMouthEmptyT > 10) return this.end(this.stats.eaten > this.edibleTotal * .75 ? 'finished' : 'gone'); }
      if (this.fullness >= 1) return this.end('full');
      // 制限時間はなし（2026-11-06 ぼくくんの答え 1A）。「ごちそうさま」を押すまで食べられる。
    }
    end(reason) { this.state = 'result'; this.endReason = reason; this.emit(reason); this.result = this.results(); for (const h of this.world.holds) this.world.release(h, 'end'); }
    results() {
      const s = this.stats, d = this.diner, total = this.edibleTotal;
      const eatenFrac = s.eaten / total; const spilled = s.spillTable + s.spillFloor + s.spillClothes + s.escaped; const spillFrac = spilled / total;
      const sw = s.swallows.filter(r => r.result !== 'choke' && r.result !== 'bone');
      const avgBiteRatio = s.biteRatios.length ? mean(s.biteRatios) : 0; const chewsPerBite = sw.length ? mean(sw.map(r => r.chews)) : 0;
      const summary = { time: this.time, eatenFrac, spillFrac, swallows: sw.length, avgBiteRatio, chewsPerBite, chews: s.chews, openChewFrac: s.chews ? s.openChews / s.chews : 0, chokes: s.chokes, boneSwallows: s.boneSwallows, boneBites: s.boneBites, hadBones: this.hadBones, slurpTime: s.slurpTime, slips: s.slips, clacks: s.clacks, marunomi: s.marunomi, bumps: s.bumps };
      const labels = D.STYLE_LABELS.filter(L => L.when(summary)).map(L => L.text).slice(0, 3);
      const satisfy = clamp(Math.round(this.satisfaction / this.idealSat * 100), 0, 100);
      const clean = clamp(Math.round(100 - spillFrac * 320 - s.chokes * 8), 0, 100);
      let penalty = s.openChews * 2.5 + s.clacks * 3 + s.marunomi * 5 + s.chokes * 6 + s.boneBites * 2 + s.bumps * 1 + (this.dish.slurpOk ? 0 : s.slurpTime * 3);
      const manners = clamp(Math.round(100 - penalty * d.manners), 0, 100);
      const reason = this.endReason; let lineKey = 'ok';
      if (reason === 'full') lineKey = 'full'; else if (reason === 'timeout') lineKey = 'timeout'; else if (s.boneSwallows >= 1) lineKey = 'bone'; else if (s.chokes >= 2) lineKey = 'choke'; else if (satisfy >= 65 && clean >= 65) lineKey = 'good'; else if (satisfy < 35) lineKey = 'bad';
      const line = this.rng.pick(d.lines[lineKey] || d.lines.ok);
      return { summary, labels, satisfy, clean, manners, reason, line, stats: s, edibleTotal: total, spilled, eatenFrac, spillFrac, avgBiteRatio, chewsPerBite };
    }
    // ひじの位置（2本の腕の IK。ひじは下側）
    elbow() {
      const S = this.shoulder, Hd = this.hand, L1 = this.diner.L1, L2 = this.diner.L2;
      const dx = Hd.x - S.x, dy = Hd.y - S.y; let d = Math.hypot(dx, dy); d = clamp(d, Math.abs(L1 - L2) + 1, (L1 + L2) * .999);
      const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)); const base = Math.atan2(dy, dx); const ang = base - a;
      return { x: S.x + Math.cos(ang) * L1, y: S.y + Math.sin(ang) * L1 };
    }
    // 画面の説明に使う、いまの食卓
    menu() { return { diner: this.diner, dish: this.dish, utensil: this.utensil, utensilKey: this.utensilKey, seed: this.seed }; }
  }

  return { Game, W, H, TABLE_Y, TABLE_LEFT, STATUS_TEXT, TOAST_TEXT };
});
