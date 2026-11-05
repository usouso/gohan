// src/bot.js — 「ふつうの食べ方」をするボット。人と同じ入力 API（setInput）だけを使う。
// 自動確認（?auto=1）と、Node での大量試行（bot/run.js）で共用する。
(function (root, factory) {
  const isNode = typeof require === 'function' && typeof module === 'object';
  const api = factory();
  if (isNode) module.exports = api; else root.GohanBot = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function makeBot(game, opts) {
    opts = opts || {};
    const chewsPerBite = opts.chews === undefined ? 7 : opts.chews;     // 一口に噛む回数
    const bot = { phase: 'aim', phaseT: 0, target: null, fails: 0, chewN: 0, chewTimer: 0, inp: {}, lastTip: null, stuck: 0 };
    const key = game.utensilKey; const M = game.mouth; const d = game.diner;
    const tiltDown = key === "spoon" ? 0.6 : (key === "hand" ? 1.2 : 1.75);
    const tiltCarry = key === 'spoon' ? 0.0 : 0.12;
    function pickTarget() {
      let best = null, bestScore = 1e9;
      for (const p of game.world.particles) {
        if (p.mat.bone || p.inMouth || p.held) continue;
        if (key !== 'spoon' && p.mat.liquid) continue;
        if (p.zone !== 'dish' && !(p.zone === 'table' && key !== 'spoon')) continue;
        // 高い所（y が小さい）を優先。主の器を少し優先。
        // 腕が届く所だけ（スプーンは先が手より前にあるので、遠い側はすくえない）
        const hreq = game.handFor(p.x - (key === 'spoon' ? 34 : 0), p.y, key === 'spoon' ? 0.95 : tiltDown); if (Math.hypot(hreq.x - game.shoulder.x, hreq.y - game.shoulder.y) > d.reach * .95) continue;
        const score = p.y + (p.zone === 'table' ? 60 : 0) + Math.abs(p.x - game.mainX) * .05;
        if (score < bestScore) { bestScore = score; best = p; }
      }
      return best;
    }
    function go(phase) { bot.phase = phase; bot.phaseT = 0; }
    function tipTo(x, y, tilt) { const h = game.handFor(x, y, tilt); bot.inp.tx = h.x; bot.inp.ty = h.y; bot.inp.tilt = tilt; }
    function tipNear(x, y, tol) { const t = game.tipWorld(); return Math.hypot(t.x - x, t.y - y) < tol; }
    function heldCount() { let n = 0; for (const h of game.world.holds) if (!h.dead) n++; return n; }
    function spoonLoad() { const t = game.tipWorld(); let n = 0; for (const p of game.world.particles) if (!p.inMouth && Math.hypot(p.x - t.x, p.y - t.y) < 40) n++; return n; }

    bot.update = function (dt) {
      bot.phaseT += dt;
      const inp = bot.inp; inp.chew = false; inp.swallow = false; inp.finish = false;
      const T = bot.target;
      switch (bot.phase) {
        case 'aim': {
          inp.squeeze = false; inp.mouth = false; inp.tongue = false; inp.slurp = false;
          bot.target = pickTarget();
          if (!bot.target) { if (game.mouthCount > 0) { go('chew'); break; } inp.finish = bot.phaseT > 3; break; }
          // ドラゴンは、最初に少し炎で焼いてから食べる
          if (d.special === 'fire' && !bot.fired && bot.phaseT < 1.6) { inp.mouth = true; inp.slurp = bot.phaseT > .3; tipTo(game.mouth.x - 160 * d.hs, game.mouth.y + 120, tiltDown); if (bot.phaseT > 1.5) bot.fired = true; break; }
          const ax = key === 'spoon' ? bot.target.x - 34 : bot.target.x; tipTo(ax, bot.target.y - 46, tiltDown);
          if (tipNear(ax, bot.target.y - 46, 16) || bot.phaseT > 2.5) { bot.anchor = { x: bot.target.x, y: bot.target.y }; go('dip'); }   // ねらった位置を覚える（運んでいる粒を追いかけない）
          break;
        }
        case 'dip': {
          if (!T || T.dead) { go('aim'); break; }
          const A = bot.anchor;
          if (key === 'fork') { tipTo(A.x, A.y + 10, tiltDown); if (tipNear(A.x, A.y + 10, 10) || bot.phaseT > .5) go('grab'); break; }
          if (key === 'spoon') { tipTo(A.x - 10, A.y + 6, 0.95); if (tipNear(A.x - 10, A.y + 6, 10) || bot.phaseT > 1.2) go('grab'); break; }
          tipTo(A.x, A.y + 3, tiltDown);
          if (tipNear(A.x, A.y + 3, 8) || bot.phaseT > 1.2) go('grab');
          break;
        }
        case 'grab': {
          if (key === 'spoon') { const A = bot.anchor; const f = Math.min(1, bot.phaseT / .7); tipTo(A.x - 10 + 16 * f, A.y + 6 - 10 * f, 0.95 - .95 * f); if (bot.phaseT > .85) go('lift'); break; }   // 手首を返して、その場ですくう   // 横にすべらせてすくう
          inp.squeeze = true; if (key === 'fork') inp.squeeze = false;
          if (bot.phaseT > .35) go('lift');
          break;
        }
        case 'lift': {
          const A = bot.anchor || game.tipWorld(); const f = Math.min(1, bot.phaseT / .5); tipTo(A.x + (key === 'spoon' ? 36 : 0), A.y - 130 * f, key === 'spoon' ? 0 : tiltDown);
          if (bot.phaseT > .7) { const ok = key === 'spoon' ? spoonLoad() > 0 : heldCount() > 0; if (!ok) { bot.fails++; go('aim'); } else go('carry'); }
          break;
        }
        case 'carry': {
          const gx = M.x - 70 * d.hs - 10, gy = M.y;
          tipTo(gx, gy, tiltCarry);
          const t = game.tipWorld(); inp.mouth = Math.hypot(t.x - gx, t.y - gy) < 120;
          if (tipNear(gx, gy, 14) || bot.phaseT > 3) go('insert');
          if (key !== 'spoon' && heldCount() === 0 && bot.phaseT > .3) { bot.fails++; go('aim'); }
          break;
        }
        case 'insert': {
          inp.mouth = true; const gx = M.x + d.D * .32, gy = M.y + 2;
          if (game.aperture > .6) tipTo(gx, gy, tiltCarry); else tipTo(M.x - 70 * d.hs - 10, M.y, tiltCarry);   // 口が開くまで待つ
          if (tipNear(gx, gy, 12) || bot.phaseT > 1.8) go(key === 'spoon' ? 'dump' : 'close');
          break;
        }
        case 'dump': {
          inp.mouth = true; const gx = M.x + d.D * .32, gy = M.y + 2; tipTo(gx, gy, 1.2 * Math.min(1, bot.phaseT / .4));
          if (bot.phaseT > .7) go('withdraw');
          break;
        }
        case 'close': {
          inp.mouth = false; inp.squeeze = key === 'fork';   // 箸を開いて食べ物を口に残す／フォークは振り落とす
          if (bot.phaseT > .3) go('withdraw');
          break;
        }
        case 'withdraw': {
          inp.mouth = key === 'spoon' ? bot.phaseT < .15 : false; inp.squeeze = false;
          const gx = M.x - 110 * d.hs - 20, gy = M.y - 10; tipTo(gx, gy, key === 'spoon' ? 0.2 : tiltCarry);
          if (tipNear(gx, gy, 16) || bot.phaseT > 1.5) { if (game.mouthCount > 0) { bot.chewN = 0; bot.chewTimer = 0; go('chew'); } else { bot.fails++; go('aim'); } }
          break;
        }
        case 'chew': {
          inp.mouth = false; inp.squeeze = false;
          bot.chewTimer -= dt;
          if (bot.chewTimer <= 0 && bot.chewN < chewsPerBite) { inp.chew = true; bot.chewN++; bot.chewTimer = d.chewDur + .08; }
          if (bot.chewN >= chewsPerBite && bot.chewTimer <= 0) go('tongue');
          break;
        }
        case 'tongue': { inp.tongue = true; if (bot.phaseT > .5) go('swallow'); break; }
        case 'swallow': {
          inp.tongue = bot.phaseT < .3; if (bot.phaseT < .05) inp.swallow = true;
          if (bot.phaseT > .8) { if (game.mouthCount > 2 && bot.phaseT < 3) { if (bot.phaseT > 1.0) { go('tongue'); } } else go('aim'); }
          break;
        }
      }
      // 動かないまま長すぎる段階は戻す
      if (bot.phaseT > 4 && bot.phase !== 'chew') { bot.fails++; go('aim'); }
      game.setInput(inp);
    };
    return bot;
  }
  return { makeBot };
});
