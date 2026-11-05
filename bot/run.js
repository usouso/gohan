// bot/run.js — 画面なしでボットに食べさせて、数字で確かめる。
// 使い方: node bot/run.js [--seeds N] [--diner id] [--dish id] [--utensil key] [--chews N] [--verbose]
const path = require('path');
const E = require(path.join(__dirname, '../src/engine.js'));
const F = require(path.join(__dirname, '../src/food.js'));
const D = require(path.join(__dirname, '../src/diners.js'));
const G = require(path.join(__dirname, '../src/game.js'));
const B = require(path.join(__dirname, '../src/bot.js'));

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i >= 0 ? (process.argv[i + 1] === undefined || process.argv[i + 1].startsWith('--') ? true : process.argv[i + 1]) : def; }
const seeds = parseInt(arg('seeds', '3'), 10); const dinerId = arg('diner', null); const dishId = arg('dish', null); const utensil = arg('utensil', null);
const chews = parseInt(arg('chews', '7'), 10); const verbose = !!arg('verbose', false); const maxT = parseFloat(arg('maxt', '240'));
const combos = [];
if (arg('all', false)) { for (const dish of F.DISHES) for (const u of Object.keys(F.UTENSILS)) combos.push({ dish: dish.id, utensil: u, diner: dinerId || 'satoshi' }); }
else combos.push({ dish: dishId, utensil, diner: dinerId });

function runOne(c, seed) {
  const g = new G.Game({ seed, diner: c.diner || undefined, dish: c.dish || undefined, utensil: c.utensil || undefined });
  const bot = B.makeBot(g, { chews });
  const dt = 1 / 60; let steps = 0; const t0 = Date.now();
  while (g.state === 'eating' && g.time < maxT) { bot.update(dt); g.update(dt); steps++; }
  if (g.state === 'eating') g.end('timeout');
  const r = g.result; const s = g.stats;
  return { seed, diner: g.diner.id, dish: g.dish.id, utensil: g.utensilKey, reason: r.reason, time: g.time, eaten: r.eatenFrac, spill: r.spillFrac, swallows: r.summary.swallows, chews: s.chews, chokes: s.chokes, bones: s.boneSwallows, slips: s.slips, clacks: s.clacks, grabs: s.grabs, satisfy: r.satisfy, clean: r.clean, manners: r.manners, labels: r.labels.join('・'), fails: bot.fails, ms: Date.now() - t0, steps, particles: g.world.particles.length };
}
const rows = [];
for (const c of combos) for (let i = 0; i < seeds; i++) rows.push(runOne(c, 1000 + i));
const pad = (v, n) => String(v).padStart(n);
console.log(['seed', 'diner   ', 'dish      ', 'uten ', 'end     ', ' time', 'eaten', 'spill', 'swal', 'chew', 'chk', 'bone', 'slip', 'clck', 'grab', 'sat', 'cln', 'man', 'fail', '  ms', 'labels'].join(' '));
for (const r of rows) console.log([pad(r.seed, 4), r.diner.padEnd(8), r.dish.padEnd(10), r.utensil.padEnd(5), r.reason.padEnd(8), pad(r.time.toFixed(0), 5), pad((r.eaten * 100).toFixed(0) + '%', 5), pad((r.spill * 100).toFixed(0) + '%', 5), pad(r.swallows, 4), pad(r.chews, 4), pad(r.chokes, 3), pad(r.bones, 4), pad(r.slips, 4), pad(r.clacks, 4), pad(r.grabs, 4), pad(r.satisfy, 3), pad(r.clean, 3), pad(r.manners, 3), pad(r.fails, 4), pad(r.ms, 4), r.labels].join(' '));
if (rows.length > 1) {
  const avg = k => rows.reduce((s, r) => s + r[k], 0) / rows.length;
  console.log('--- 平均: 食べた ' + (avg('eaten') * 100).toFixed(0) + '%  こぼし ' + (avg('spill') * 100).toFixed(0) + '%  時間 ' + avg('time').toFixed(0) + 's  満足 ' + avg('satisfy').toFixed(0) + '  きれい ' + avg('clean').toFixed(0) + '  マナー ' + avg('manners').toFixed(0) + '  完食率 ' + (rows.filter(r => r.reason === 'finished').length / rows.length * 100).toFixed(0) + '%');
}
if (verbose) { const g = new G.Game({ seed: 1000, diner: combos[0].diner || undefined, dish: combos[0].dish || undefined, utensil: combos[0].utensil || undefined }); const bot = B.makeBot(g, { chews }); let last = ''; while (g.state === 'eating' && g.time < 60) { bot.update(1 / 60); g.update(1 / 60); const ph = bot.phase; if (ph !== last) { console.log(g.time.toFixed(2), ph, 'held', g.world.holds.length, 'mouth', g.mouthCount, 'eaten', (g.stats.eaten / g.edibleTotal * 100).toFixed(0) + '%'); last = ph; } for (const ev of g.events) if (!/chew|crunch|grab|enter_mouth/.test(ev.type)) console.log('   ev', ev.type); g.events.length = 0; } }
