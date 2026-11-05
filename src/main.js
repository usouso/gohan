// src/main.js — 画面・入力・進行。URL の切り替え: ?auto=1(ボットが遊ぶ) ?bg=1(タイマー駆動) ?fast=N(N倍速) ?mute=1 ?seed=N ?diner= ?dish= ?utensil=
(function () {
  'use strict';
  const params = new URLSearchParams(location.search);
  const AUTO = params.get('auto') === '1', BG = params.get('bg') === '1', FAST = Math.max(1, parseInt(params.get('fast') || '1', 10));
  const MUTE = params.get('mute') === '1' || AUTO; const SEED = params.has('seed') ? parseInt(params.get('seed'), 10) : null;
  const forced = { diner: params.get('diner') || undefined, dish: params.get('dish') || undefined, utensil: params.get('utensil') || undefined };
  const W = GohanGame.W, H = GohanGame.H;
  const $ = id => document.getElementById(id);
  const cv = $('cv'); const renderer = new GohanRender.Renderer(cv); const audio = GohanAudio.create();
  let game = null, bot = null, screen = 'title', scale = 1, dpr = 1, lastT = 0, acc = 0, rounds = 0, lastSeed = SEED; let slurping = false;
  const UT_NAME = { hashi: '箸', spoon: 'スプーン', fork: 'フォーク', hand: '手' };

  function resize() {
    const stage = $('stage'); const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    scale = Math.min(w / W, h / H); dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * scale * dpr); cv.height = Math.round(H * scale * dpr); cv.style.width = Math.round(W * scale) + 'px'; cv.style.height = Math.round(H * scale) + 'px';
    renderer.ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }
  window.addEventListener('resize', resize); resize();

  function show(id) { for (const s of ['title', 'reveal', 'result']) $(s).style.display = s === id ? 'flex' : 'none'; screen = id || 'play'; $('btnFinish').style.display = screen === 'play' ? '' : 'none'; }
  function newGame(seed) {
    const g = new GohanGame.Game({ seed: seed === null ? undefined : seed, diner: forced.diner, dish: forced.dish, utensil: forced.utensil });
    game = g; lastSeed = g.seed; bot = AUTO ? GohanBot.makeBot(g) : null;
    const m = g.menu();
    $('menuText').textContent = m.diner.name + '　｜　' + m.dish.name + '　｜　' + UT_NAME[m.utensilKey];
    $('rvDinerName').textContent = m.diner.name; $('rvDinerSub').textContent = m.diner.sub; $('rvDishName').textContent = m.dish.name; $('rvDishDesc').textContent = m.dish.desc;
    $('rvUtensil').textContent = UT_NAME[m.utensilKey]; $('rvUtensilNote').textContent = m.dish.natural.includes(m.utensilKey) ? 'この料理に合う食器' : '合わない食器……どう食べる？';
    $('rvSeed').textContent = '食卓 No. ' + g.seed; $('status').textContent = g.rng.pick(m.diner.lines.start);
    if (m.diner.specialName) $('rvDinerSub').textContent = m.diner.sub + '　とくぎ：' + m.diner.specialName;
    const slurpLabel = m.diner.special === 'fire' ? '炎を吐く' : '吸う';
    $('chipSlurp').innerHTML = '<kbd>I</kbd>' + slurpLabel; $('padChipSlurp').innerHTML = '<kbd>LT / LB</kbd>' + slurpLabel;
    padTarget = null;
    $('fullFill').style.width = '0%'; $('fullNum').textContent = '0%'; $('timer').textContent = '0:00';
    renderer.draw(g); show('reveal');
  }
  function startEating() { show(null); audio.unlock(); lastT = performance.now(); acc = 0; }
  function showResult() {
    const r = game.result, m = game.menu(); rounds++;
    const REASON = { finished: '完食！', gone: '器は空になった（こぼれた分が多い）', full: 'おなかいっぱい', timeout: '時間切れ', quit: 'ごちそうさま（途中でやめた）' };
    $('rsReason').textContent = REASON[r.reason] || r.reason; $('rsLine').textContent = '「' + r.line + '」'; $('rsWho').textContent = m.diner.name + ' ／ ' + m.dish.name + ' ／ ' + UT_NAME[m.utensilKey];
    $('rsSat').textContent = r.satisfy; $('rsClean').textContent = r.clean; $('rsMan').textContent = r.manners;
    const lab = $('rsLabels'); lab.innerHTML = ''; for (const t of (r.labels.length ? r.labels : ['ふつうの食べ方'])) { const sp = document.createElement('span'); sp.className = 'label'; sp.textContent = t; lab.appendChild(sp); }
    const s = r.stats; const rows = [['食べた時間', Math.floor(game.time / 60) + '分' + Math.round(game.time % 60) + '秒'], ['食べた量', Math.round(r.eatenFrac * 100) + '%'], ['こぼした量', Math.round(r.spillFrac * 100) + '%（テーブル ' + Math.round(s.spillTable / r.edibleTotal * 100) + '% ／ 床 ' + Math.round(s.spillFloor / r.edibleTotal * 100) + '% ／ 服 ' + Math.round(s.spillClothes / r.edibleTotal * 100) + '%）'], ['飲みこんだ回数', r.summary.swallows + '回'], ['一口の大きさ（のどの容量に対して）', Math.round(r.avgBiteRatio * 100) + '%'], ['一口あたり噛んだ回数', r.chewsPerBite.toFixed(1) + '回'], ['むせた', s.chokes + '回'], ['丸飲み', s.marunomi + '回'], ['骨', '飲んだ ' + s.boneSwallows + '／噛んだ ' + s.boneBites], ['食器を噛んだ', s.clacks + '回'], ['箸からこぼれた', s.slips + '回'], ['かじり取った・ちぎった', s.biteOffs + '回・' + s.tears + '回']];
    if (m.diner.special === 'fire') rows.push(['炎で焼いた', Math.round(s.fireTime) + '秒（こがした ' + s.charred + '）']); if (m.diner.special === 'tusks') rows.push(['牙で噛みちぎった', s.tusks + '回']);
    const tb = $('rsTable'); tb.innerHTML = ''; for (const [k, v] of rows) { const r = document.createElement('div'); r.className = 'r'; const a = document.createElement('span'); a.textContent = k; const b = document.createElement('b'); b.textContent = v; r.appendChild(a); r.appendChild(b); tb.appendChild(r); }
    show('result'); audio.play(r.reason === 'finished' ? 'finished' : 'full');
  }

  // ---- 入力 ----
  function toScene(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }; }
  const stage = $('stage');
  stage.addEventListener('mousemove', e => { if (!game || screen !== 'play' || AUTO) return; const p = toScene(e); game.setInput({ tx: p.x, ty: p.y }); });
  stage.addEventListener('mousedown', e => { if (!game || screen !== 'play' || AUTO) return; audio.unlock(); if (e.button === 0) game.setInput({ squeeze: true }); if (e.button === 2) game.setInput({ mouth: true }); e.preventDefault(); });
  window.addEventListener('mouseup', e => { if (!game || AUTO) return; if (e.button === 0) game.setInput({ squeeze: false }); if (e.button === 2) game.setInput({ mouth: false }); });
  stage.addEventListener('contextmenu', e => e.preventDefault());
  stage.addEventListener('wheel', e => { if (!game || screen !== 'play' || AUTO) return; e.preventDefault(); const d = Math.sign(e.deltaY) * 0.14; game.setInput({ tilt: game.input.tilt + d }); }, { passive: false });
  const keyHold = {};
  window.addEventListener('keydown', e => {
    if (e.repeat) { if (e.code === 'KeyA' || e.code === 'KeyD') return; }
    if (screen === 'title' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); $('btnStart').click(); return; }
    if (screen === 'reveal' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); $('btnGo').click(); return; }
    if (screen === 'result' && e.code === 'Enter') { e.preventDefault(); $('btnAgain').click(); return; }
    if (!game || screen !== 'play' || AUTO) return; audio.unlock();
    switch (e.code) {
      case 'Space': game.setInput({ mouth: true }); e.preventDefault(); break;
      case 'KeyJ': if (!e.repeat) game.setInput({ chew: true }); break;
      case 'KeyK': game.setInput({ tongue: true }); break;
      case 'KeyL': if (!e.repeat) game.setInput({ swallow: true }); break;
      case 'KeyI': game.setInput({ slurp: true }); break;
      case 'KeyA': keyHold.a = true; break;
      case 'KeyD': keyHold.d = true; break;
      case 'Enter': if (game.time > 2) game.setInput({ finish: true }); break;
    }
  });
  window.addEventListener('keyup', e => {
    if (!game || AUTO) return;
    switch (e.code) { case 'Space': game.setInput({ mouth: false }); break; case 'KeyJ': game.setInput({ chew: false }); break; case 'KeyK': game.setInput({ tongue: false }); break; case 'KeyL': game.setInput({ swallow: false }); break; case 'KeyI': game.setInput({ slurp: false }); break; case 'KeyA': keyHold.a = false; break; case 'KeyD': keyHold.d = false; break; }
  });
  $('btnStart').addEventListener('click', () => { audio.unlock(); newGame(lastSeed === null ? null : (rounds === 0 ? lastSeed : null)); });
  $('btnGo').addEventListener('click', startEating);
  $('btnAgain').addEventListener('click', () => newGame(null));
  $('btnSame').addEventListener('click', () => newGame(game ? game.seed : null));
  $('btnFinish').addEventListener('click', () => { if (game && screen === 'play') game.setInput({ finish: true }); });
  $('vol').addEventListener('input', e => audio.setVolume(parseInt(e.target.value, 10) / 100)); audio.setVolume(parseInt($('vol').value, 10) / 100); if (MUTE) { audio.setMuted(true); $('vol').value = 0; }

  // ---- ゲームパッド（標準配置：左スティック=手、右スティック=かたむき、RT/RB=つかむ、A=口、X=噛む、Y=舌、B=飲む、LT/LB=吸う、Start=ごちそうさま）----
  let padTarget = null; const padPrev = {}; let padSeen = false;
  function padButton(gp, i) { const b = gp.buttons[i]; return !!(b && (b.pressed || b.value > .5)); }
  function pollPad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []; let gp = null; for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) return;
    if (!padSeen) { padSeen = true; $('padbar').style.display = 'flex'; resize(); }
    const dz = v => Math.abs(v) < .18 ? 0 : v;
    const start = padButton(gp, 9), a = padButton(gp, 0);
    const edge = (name, v) => { const was = !!padPrev[name]; padPrev[name] = v; return v && !was; };
    const startEdge = edge('start', start), aEdge = edge('a', a);
    if (screen === 'title') { if (startEdge || aEdge) $('btnStart').click(); return; }
    if (screen === 'reveal') { if (startEdge || aEdge) $('btnGo').click(); return; }
    if (screen === 'result') { if (startEdge || aEdge) $('btnAgain').click(); return; }
    if (!game || AUTO) return;
    if (!padTarget) padTarget = { x: game.hand.x, y: game.hand.y };
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0); const sp = 1000 * dt;
    if (lx || ly) { padTarget.x = Math.max(0, Math.min(W, padTarget.x + lx * sp)); padTarget.y = Math.max(0, Math.min(H, padTarget.y + ly * sp)); game.setInput({ tx: padTarget.x, ty: padTarget.y }); }
    const rx = dz(gp.axes[2] || 0); if (rx) game.setInput({ tilt: game.input.tilt + rx * 2.4 * dt });
    game.setInput({ squeeze: padButton(gp, 7) || padButton(gp, 5), mouth: a, tongue: padButton(gp, 3), slurp: padButton(gp, 6) || padButton(gp, 4) });
    if (edge('x', padButton(gp, 2))) game.setInput({ chew: true });
    if (edge('b', padButton(gp, 1))) game.setInput({ swallow: true });
    if (startEdge && game.time > 2) game.setInput({ finish: true });
  }
  window.addEventListener('gamepadconnected', () => { padSeen = true; $('padbar').style.display = 'flex'; resize(); });

  // ---- 進行 ----
  function stepGame(dt) {
    if (keyHold.a) game.setInput({ tilt: game.input.tilt - 1.8 * dt }); if (keyHold.d) game.setInput({ tilt: game.input.tilt + 1.8 * dt });
    if (bot) bot.update(dt);
    game.update(dt);
    if (game.input.chew) game.input.chew = false; if (game.input.swallow) game.input.swallow = false;
    for (const ev of game.events) {
      if (ev.type === 'crunch') audio.play('crunch', { hard: .5 }); else if (ev.type === 'chew') { /* 噛みくだく音は crunch で */ } else audio.play(ev.type, ev);
    }
    game.events.length = 0;
    const sl = !!(game.slurpOn || game.fireOn); if (sl !== slurping) { slurping = sl; audio.play(sl ? 'slurp_start' : 'slurp_stop'); }
  }
  function updateHud() {
    const t = game.time; $('timer').textContent = Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
    const f = Math.min(100, Math.round(game.fullness * 100)); $('fullFill').style.width = f + '%'; $('fullNum').textContent = f + '%';
    const eaten = Math.round(game.stats.eaten / game.edibleTotal * 100); $('eatenNum').textContent = eaten + '%';
    if (game.lastStatus) $('status').textContent = game.lastStatus;
  }
  function frame(now) {
    if (!BG) requestAnimationFrame(frame);
    let dt = (now - lastT) / 1000; lastT = now; if (dt > .1) dt = .1;
    pollPad(dt);
    if (!game || screen !== 'play') return;
    acc += dt;
    const step = 1 / 60; let n = 0;
    while (acc >= step && n < 4 * FAST) { for (let i = 0; i < FAST && game.state === 'eating'; i++) stepGame(step); acc -= step; n++; }
    if (acc > step * 4) acc = 0;
    renderer.draw(game); updateHud();
    if (game.state === 'result') { if (slurping) { slurping = false; audio.play('slurp_stop'); } showResult(); }
  }
  if (BG) setInterval(() => frame(performance.now()), 16); else requestAnimationFrame(frame);

  // ---- 自動確認（?auto=1）：タイトル → 食卓 → 食べる → 結果 まで自分で進む ----
  if (AUTO) {
    setTimeout(() => $('btnStart').click(), 300);
    setTimeout(() => { if (screen === 'reveal') $('btnGo').click(); }, 1200);
  }
  window.__gohan = {
    get game() { return game; }, get screen() { return screen; }, get rounds() { return rounds; },
    state() { return game ? { screen, state: game.state, time: game.time, eaten: game.stats.eaten / game.edibleTotal, seed: game.seed, diner: game.diner.id, dish: game.dish.id, utensil: game.utensilKey, particles: game.world.particles.length, result: game.result || null } : { screen }; },
    start() { $('btnStart').click(); }, go() { $('btnGo').click(); }, again() { $('btnAgain').click(); },
    step(dt) { if (game && screen === 'play') { stepGame(dt || 1 / 60); renderer.draw(game); updateHud(); } },
    // コマ送り画像：n コマを dtMs ごとに進めて横に並べる
    capture(n, dtMs) { if (!game) return null; const c = document.createElement('canvas'); const w = 320, h = Math.round(320 * H / W); c.width = w * n; c.height = h; const x = c.getContext('2d'); for (let i = 0; i < n; i++) { for (let k = 0; k < Math.round(dtMs / 1000 * 60); k++) stepGame(1 / 60); renderer.draw(game); x.drawImage(cv, i * w, 0, w, h); } return c.toDataURL('image/png'); },
  };
  show('title');
})();
