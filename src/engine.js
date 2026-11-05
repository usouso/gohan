// src/engine.js — 粒子ベースの2D物理（Verlet 積分 + 位置ベース拘束）。画面に依存しない。
// 食べ物は「粒子」と「粒子どうしのつなぎ（拘束）」で表す。食器・口・箸は「線分コライダー」。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GohanEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 乱数（seed 固定で再現できる）
  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    const rng = {
      next() { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; },
      range(a, b) { return a + (b - a) * rng.next(); },
      int(n) { return Math.floor(rng.next() * n); },
      pick(arr) { return arr[Math.floor(rng.next() * arr.length)]; },
      chance(p) { return rng.next() < p; },
      weighted(obj) { let total = 0; for (const k in obj) total += obj[k]; let r = rng.next() * total; for (const k in obj) { r -= obj[k]; if (r <= 0) return k; } return Object.keys(obj)[0]; },
    };
    return rng;
  }

  const TMP = { x: 0, y: 0, t: 0 };
  function closestOnSeg(px, py, ax, ay, bx, by, out) {
    const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    out.x = ax + dx * t; out.y = ay + dy * t; out.t = t; return out;
  }
  function segDist(px, py, s) { const o = closestOnSeg(px, py, s.ax, s.ay, s.bx, s.by, TMP); return Math.hypot(px - o.x, py - o.y); }
  function pointInPoly(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  // 折れ線 pts（x が単調増加）上で x に対応する y
  function polyY(pts, x) {
    if (x <= pts[0].x) return pts[0].y;
    for (let i = 1; i < pts.length; i++) { if (x <= pts[i].x) { const a = pts[i - 1], b = pts[i]; const t = (x - a.x) / ((b.x - a.x) || 1); return a.y + (b.y - a.y) * t; } }
    return pts[pts.length - 1].y;
  }

  let nextId = 1;
  class Particle {
    constructor(x, y, r, mat) {
      this.id = nextId++;
      this.x = x; this.y = y; this.px = x; this.py = y; this.ax = 0; this.ay = 0;
      this.r = r; this.mat = mat; this.m = r * r; this.inv = 1 / this.m;
      this.g = (mat.gravity === undefined) ? 1 : mat.gravity; this.damp = mat.damp || 0;
      this.hard = mat.liquid ? 0 : 1;   // 1 = かたまりのまま, 0 = 噛みくだけた
      this.mash = 0;                     // 噛んで分かれた回数
      this.chews = 0; this.cl = 0; this.held = null; this.dead = false;
      this.inMouth = false; this.zone = 'dish'; this.ncons = 0; this.crushMark = -1; this.spilled = false; this.touchedTable = false;
      this.rot = (this.id * 2.399) % 6.283;
    }
  }
  class Constraint {
    constructor(a, b, stiff, breakAt) { this.a = a; this.b = b; this.len = Math.hypot(a.x - b.x, a.y - b.y); this.stiff = stiff; this.breakAt = breakAt || 0; this.dead = false; a.ncons++; b.ncons++; }
  }
  function seg(ax, ay, bx, by, r, opts) { return Object.assign({ ax, ay, bx, by, r, vx: 0, vy: 0, fric: 0.5, tag: '', solid: true }, opts || {}); }

  class World {
    constructor(opts) {
      opts = opts || {};
      this.particles = []; this.constraints = []; this.statics = []; this.kinematics = []; this.holds = [];
      this.gravity = opts.gravity || 9000; this.killY = opts.killY || 1e9; this.events = [];
      this.cell = opts.cell || 26; this.damping = 0.998; this.time = 0; this.iterations = opts.iterations || 2;
      this._grid = new Map(); this.liquidPack = 0.9; this.maxV = 12; this.subIndex = 0; this.subCount = 1;   // 1サブステップで動ける最大(px)。爆発を防ぐ
    }
    addParticle(p) { this.particles.push(p); return p; }
    link(a, b, stiff, breakAt) { const c = new Constraint(a, b, stiff, breakAt); this.constraints.push(c); return c; }
    breakLinks(p) { let n = 0; for (const c of this.constraints) if (!c.dead && (c.a === p || c.b === p)) { c.dead = true; c.a.ncons--; c.b.ncons--; n++; } return n; }
    linksOf(p) { const out = []; for (const c of this.constraints) if (!c.dead && (c.a === p || c.b === p)) out.push(c); return out; }
    hold(p, target, strength, slipTol, tag) { if (p.held) return null; const h = { p, target, strength, slipTol, tag, t: this.time, dead: false, maxErr: 0 }; p.held = h; this.holds.push(h); return h; }
    release(h, reason) { if (!h || h.dead) return; h.dead = true; if (h.p.held === h) h.p.held = null; this.events.push({ type: 'release', p: h.p, reason, tag: h.tag }); }
    kill(p, reason) { if (p.dead) return; p.dead = true; if (p.held) this.release(p.held, 'dead'); this.events.push({ type: 'dead', p, reason }); }
    // 粒子を2つに割る（面積は保つ）。小さすぎれば「すりつぶし」にする。
    split(p, rng) {
      const nr = p.r * 0.7071;
      if (nr < (p.mat.rMin || 3)) { p.mash = Math.max(p.mash, 3); p.hard = 0; this.breakLinks(p); return [p]; }
      const ang = rng ? rng.range(0, Math.PI) : Math.PI / 2; const ox = Math.cos(ang) * nr * 0.9, oy = Math.sin(ang) * nr * 0.9;
      const vx = p.x - p.px, vy = p.y - p.py;
      const out = [];
      for (let i = 0; i < 2; i++) {
        const q = new Particle(p.x + (i ? ox : -ox), p.y + (i ? oy : -oy), nr, p.mat);
        q.px = q.x - vx; q.py = q.y - vy; q.hard = Math.min(1, 0.85 + 0.15 * p.hard); q.mash = p.mash + 1; q.chews = p.chews; q.cl = p.cl; q.inMouth = p.inMouth; q.zone = p.zone; q.spilled = p.spilled; q.touchedTable = p.touchedTable; q.g = p.g;
        this.particles.push(q); out.push(q);
      }
      this.breakLinks(p); this.kill(p, 'split');
      return out;
    }
    forEachNear(x, y, rad, fn) {
      const c = this.cell; const x0 = Math.floor((x - rad) / c), x1 = Math.floor((x + rad) / c), y0 = Math.floor((y - rad) / c), y1 = Math.floor((y + rad) / c);
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const arr = this._grid.get(((cx + 32768) * 65536) + (cy + 32768)); if (arr) for (const q of arr) if (!q.dead && Math.hypot(q.x - x, q.y - y) <= rad + q.r) fn(q); }
    }

    step(dt, substeps) {
      substeps = substeps || 1; const h = dt / substeps;
      this.subCount = substeps;
      // 動く線分（箸・口）は、サブステップごとに前の位置から補間する（速く動いてもすり抜けない）
      const kin = this.kinematics; for (const k of kin) if (k.pax !== undefined) { k.cax = k.ax; k.cay = k.ay; k.cbx = k.bx; k.cby = k.by; }
      for (let s = 0; s < substeps; s++) {
        this.subIndex = s; const f = (s + 1) / substeps;
        for (const k of kin) if (k.pax !== undefined) { k.ax = k.pax + (k.cax - k.pax) * f; k.ay = k.pay + (k.cay - k.pay) * f; k.bx = k.pbx + (k.cbx - k.pbx) * f; k.by = k.pby + (k.cby - k.pby) * f; }
        this.integrate(h); this.buildGrid(); this.collideParticles();
        for (let it = 0; it < this.iterations; it++) this.solveConstraints();
        this.collideSegments(h); this.applyHolds(); this.time += h;
      }
      for (const k of kin) if (k.pax !== undefined) { k.ax = k.cax; k.ay = k.cay; k.bx = k.cbx; k.by = k.cby; }
      this.cleanup();
    }
    integrate(h) {
      const g = this.gravity, d = this.damping;
      for (const p of this.particles) {
        if (p.dead) continue;
        const dd = p.damp || d;
        let vx = (p.x - p.px) * dd, vy = (p.y - p.py) * dd; p.px = p.x; p.py = p.y;
        const sp = vx * vx + vy * vy; if (sp > this.maxV * this.maxV) { const f = this.maxV / Math.sqrt(sp); vx *= f; vy *= f; }
        p.x += vx + p.ax * h * h; p.y += vy + (p.ay + g * p.g) * h * h; p.ax = 0; p.ay = 0; p.ix = p.x; p.iy = p.y;
        if (p.y > this.killY) this.kill(p, 'fell');
      }
    }
    buildGrid() {
      const g = this._grid; g.clear(); const c = this.cell;
      for (const p of this.particles) { if (p.dead) continue; const key = ((Math.floor(p.x / c) + 32768) * 65536) + (Math.floor(p.y / c) + 32768); let arr = g.get(key); if (!arr) { arr = []; g.set(key, arr); } arr.push(p); }
    }
    collideParticles() {
      const g = this._grid, c = this.cell;
      for (const p of this.particles) {
        if (p.dead) continue;
        const cx = Math.floor(p.x / c), cy = Math.floor(p.y / c);
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          const arr = g.get(((cx + ox + 32768) * 65536) + (cy + oy + 32768)); if (!arr) continue;
          for (const q of arr) { if (q.id <= p.id || q.dead) continue; this.resolvePair(p, q); }
        }
      }
    }
    resolvePair(p, q) {
      let dx = q.x - p.x, dy = q.y - p.y; const bothLiquid = p.mat.liquid && q.mat.liquid;
      const rr = (p.r + q.r) * (bothLiquid ? this.liquidPack : 1); const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) {
        if (bothLiquid && d2 < rr * rr * 1.69) { const d = Math.sqrt(d2) || 1e-6; const k = (p.mat.cohesion + q.mat.cohesion) * 0.5 * 0.035; const f = (d - rr) * k / d; p.x += dx * f * 0.5; p.y += dy * f * 0.5; q.x -= dx * f * 0.5; q.y -= dy * f * 0.5; }
        return;
      }
      let d = Math.sqrt(d2); if (d < 1e-6) { dx = 0.01 * ((p.id & 1) ? 1 : -1); dy = 0.005; d = Math.hypot(dx, dy); }
      const nx = dx / d, ny = dy / d; const overlap = rr - d; const wp = p.inv / (p.inv + q.inv), wq = 1 - wp;
      p.x -= nx * overlap * wp; p.y -= ny * overlap * wp; q.x += nx * overlap * wq; q.y += ny * overlap * wq;
      const fr = Math.min(p.mat.fric, q.mat.fric);
      if (fr > 0) {
        const rvx = (p.x - p.px) - (q.x - q.px), rvy = (p.y - p.py) - (q.y - q.py); const vn = rvx * nx + rvy * ny; const tx = rvx - vn * nx, ty = rvy - vn * ny;
        p.x -= tx * fr * wp; p.y -= ty * fr * wp; q.x += tx * fr * wq; q.y += ty * fr * wq;
      }
    }
    solveConstraints() {
      for (const c of this.constraints) {
        if (c.dead) continue; const a = c.a, b = c.b;
        if (a.dead || b.dead) { c.dead = true; a.ncons--; b.ncons--; continue; }
        const dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1e-6;
        if (c.breakAt && d > c.len * c.breakAt) { c.dead = true; a.ncons--; b.ncons--; this.events.push({ type: 'break', a, b }); continue; }
        const diff = (d - c.len) / d * c.stiff; const wa = a.inv / (a.inv + b.inv);
        a.x += dx * diff * wa; a.y += dy * diff * wa; b.x -= dx * diff * (1 - wa); b.y -= dy * diff * (1 - wa);
      }
    }
    collideSegments(h) {
      const segs = this.statics.concat(this.kinematics);
      for (const s of segs) { s.minX = Math.min(s.ax, s.bx) - s.r - 12; s.maxX = Math.max(s.ax, s.bx) + s.r + 12; s.minY = Math.min(s.ay, s.by) - s.r - 12; s.maxY = Math.max(s.ay, s.by) + s.r + 12; }
      for (const p of this.particles) {
        if (p.dead) continue;
        for (const s of segs) {
          if (!s.solid) continue;
          if (p.held && s.holder) continue;   // 持っている食器自体は、持っている粒を押さない
          if (p.x < s.minX || p.x > s.maxX || p.y < s.minY || p.y > s.maxY) continue;
          if (s.filter && !s.filter(p)) continue;
          this.collideSeg(p, s, h);
        }
      }
    }
    collideSeg(p, s, h) {
      const c = closestOnSeg(p.x, p.y, s.ax, s.ay, s.bx, s.by, TMP); let dx = p.x - c.x, dy = p.y - c.y; const minD = p.r + s.r; const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD) return false;
      let d = Math.sqrt(d2); let nx, ny;
      if (s.oneWay) {
        // 向きの決まった壁（あごの上下・のどの入口）。中心が線を越えても、決まった向きに押し返す（すり抜け防止）
        nx = s.oneWay.x; ny = s.oneWay.y; const ds = dx * nx + dy * ny; if (ds >= minD) return false; d = ds;
        if (d < -minD * 2) return false;   // 大きく反対側にある粒は無関係
      } else if (d < 1e-4) { const sx = s.bx - s.ax, sy = s.by - s.ay; const L = Math.hypot(sx, sy) || 1; nx = -sy / L; ny = sx / L; const side = ((p.px - s.ax) * nx + (p.py - s.ay) * ny) < 0 ? -1 : 1; nx *= side; ny *= side; d = 0; } else { nx = dx / d; ny = dy / d; }
      const vx0 = p.x - p.px, vy0 = p.y - p.py;
      const push = minD - d; p.x += nx * push; p.y += ny * push;
      const svx = s.vx * h, svy = s.vy * h; const rvx = vx0 - svx, rvy = vy0 - svy; const vn = rvx * nx + rvy * ny;
      let vx = vx0, vy = vy0;
      if (vn < 0) { vx -= nx * vn; vy -= ny * vn; }
      const fr = s.fric * (0.25 + 0.75 * p.mat.fric); const tvx = rvx - vn * nx, tvy = rvy - vn * ny; vx -= tvx * fr; vy -= tvy * fr;
      p.px = p.x - vx; p.py = p.y - vy;
      if (s.onHit) s.onHit(p, s);
      return true;
    }
    applyHolds() {
      for (const hd of this.holds) {
        if (hd.dead) continue; const p = hd.p; if (p.dead) { hd.dead = true; continue; }
        const t = hd.target(hd); const ex = t.x - p.x, ey = t.y - p.y;
        // 「すべり」は、手の動きではなく、外から押された量（衝突・つなぎの引っぱり）で決める。しばらく続くと積み上がる。
        const ext = Math.hypot(p.x - (p.ix === undefined ? p.x : p.ix), p.y - (p.iy === undefined ? p.y : p.iy)) + .1 * Math.hypot((t.vx || 0) - (hd.pvx || 0), (t.vy || 0) - (hd.pvy || 0));
        hd.pvx = t.vx || 0; hd.pvy = t.vy || 0; hd.load = (hd.load || 0) * .75 + ext; if (hd.load > hd.maxErr) hd.maxErr = hd.load;
        if (hd.load > hd.slipTol) { this.release(hd, 'slip'); continue; }
        p.x += ex * hd.strength; p.y += ey * hd.strength;
        // 手の速さに合わせる（持っている物が手と一緒に動く）
        p.px = p.x - (t.vx || 0); p.py = p.y - (t.vy || 0);
      }
    }
    cleanup() {
      let anyDead = false; for (const p of this.particles) if (p.dead) { anyDead = true; break; }
      if (anyDead) { this.particles = this.particles.filter(p => !p.dead); this.constraints = this.constraints.filter(c => !c.dead && !c.a.dead && !c.b.dead); }
      else if (this.constraints.some(c => c.dead)) this.constraints = this.constraints.filter(c => !c.dead);
      if (this.holds.some(hd => hd.dead)) this.holds = this.holds.filter(hd => !hd.dead);
    }
    settle(seconds, substeps) {
      const n = Math.round(seconds * 60); const saved = this.maxV; this.maxV = 2.5;
      for (let i = 0; i < n; i++) { if (i === Math.floor(n / 2)) this.maxV = 6; this.step(1 / 60, substeps || 3); }
      this.maxV = saved; for (const p of this.particles) { p.px = p.x; p.py = p.y; } this.events.length = 0;
    }
  }

  return { makeRng, closestOnSeg, segDist, pointInPoly, polyY, Particle, Constraint, World, seg };
});
