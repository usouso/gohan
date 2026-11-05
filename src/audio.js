// src/audio.js — 効果音（Web Audio で合成。音源ファイルなし）。行動した瞬間にだけ鳴らす。
(function (root) {
  'use strict';
  function create() {
    let ctx = null, master = null, slurpNode = null, slurpGain = null; let volume = .35; let muted = false;
    function ensure() {
      if (ctx) return true;
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = muted ? 0 : volume; master.connect(ctx.destination); } catch (e) { ctx = null; return false; }
      return true;
    }
    function noiseBuffer(sec) { const n = Math.floor(ctx.sampleRate * sec); const b = ctx.createBuffer(1, n, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; }
    function burst(opts) {
      // ノイズを帯域フィルターに通して短く鳴らす
      const t = ctx.currentTime; const src = ctx.createBufferSource(); src.buffer = noiseBuffer(opts.dur + .05);
      const f = ctx.createBiquadFilter(); f.type = opts.type || 'bandpass'; f.frequency.setValueAtTime(opts.f0, t); if (opts.f1) f.frequency.exponentialRampToValueAtTime(opts.f1, t + opts.dur); f.Q.value = opts.q || 1;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(opts.vol, t + (opts.attack || .005)); g.gain.exponentialRampToValueAtTime(.0001, t + opts.dur);
      src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + opts.dur + .05);
    }
    function tone(opts) {
      const t = ctx.currentTime; const o = ctx.createOscillator(); o.type = opts.type || 'sine'; o.frequency.setValueAtTime(opts.f0, t); if (opts.f1) o.frequency.exponentialRampToValueAtTime(opts.f1, t + opts.dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t + (opts.delay || 0)); g.gain.linearRampToValueAtTime(opts.vol, t + (opts.delay || 0) + .01); g.gain.exponentialRampToValueAtTime(.0001, t + (opts.delay || 0) + opts.dur);
      o.connect(g); g.connect(master); o.start(t + (opts.delay || 0)); o.stop(t + (opts.delay || 0) + opts.dur + .05);
    }
    const api = {
      unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
      setVolume(v) { volume = v; if (master) master.gain.value = muted ? 0 : v; },
      setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : volume; },
      play(type, data) {
        if (!ensure() || (muted && type !== 'slurp_stop')) return;
        const r = Math.random();
        switch (type) {
          case 'crunch': { const hard = data && data.hard !== undefined ? data.hard : .5; burst({ f0: 500 + 900 * hard + r * 200, f1: 250, q: .8, dur: .09 + .04 * hard, vol: .5 }); break; }
          case 'chew': burst({ f0: 320 + r * 80, f1: 180, q: 1.2, dur: .08, vol: .18 }); break;
          case 'gulp': tone({ f0: 260, f1: 120, dur: .22, vol: .35 }); burst({ f0: 400, f1: 150, q: 1, dur: .18, vol: .15, type: 'lowpass' }); break;
          case 'yummy': tone({ f0: 523, dur: .18, vol: .22 }); tone({ f0: 659, dur: .25, vol: .22, delay: .12 }); tone({ f0: 260, f1: 120, dur: .22, vol: .3 }); break;
          case 'gulp_big': tone({ f0: 220, f1: 80, dur: .4, vol: .4 }); burst({ f0: 300, f1: 120, q: 1, dur: .35, vol: .2, type: 'lowpass' }); break;
          case 'marunomi': tone({ f0: 240, f1: 90, dur: .35, vol: .35 }); break;
          case 'swallow_empty': tone({ f0: 300, f1: 180, dur: .12, vol: .12 }); break;
          case 'choke': for (let i = 0; i < 3; i++) setTimeout(() => burst({ f0: 900, f1: 300, q: .7, dur: .14, vol: .5 }), i * 170); break;
          case 'bone_swallow': for (let i = 0; i < 4; i++) setTimeout(() => burst({ f0: 1100, f1: 350, q: .7, dur: .16, vol: .55 }), i * 190); break;
          case 'bone_bite': burst({ f0: 2600, f1: 900, q: 2, dur: .06, vol: .6 }); burst({ f0: 180, dur: .05, vol: .4, type: 'lowpass' }); break;
          case 'clack': burst({ f0: 2200, f1: 1500, q: 3, dur: .035, vol: .5 }); break;
          case 'face_bump': burst({ f0: 240, f1: 120, q: 1, dur: .07, vol: .3, type: 'lowpass' }); break;
          case 'slip': burst({ f0: 700, f1: 300, q: 1.5, dur: .05, vol: .12 }); break;
          case 'spill_table': burst({ f0: 350, f1: 150, q: 1, dur: .07, vol: .22, type: 'lowpass' }); break;
          case 'spill_floor': burst({ f0: 260, f1: 90, q: 1, dur: .12, vol: .3, type: 'lowpass' }); break;
          case 'spill_clothes': burst({ f0: 500, f1: 200, q: 1, dur: .08, vol: .2 }); break;
          case 'grab': burst({ f0: 1800, f1: 1200, q: 3, dur: .02, vol: .08 }); break;
          case 'escaped': tone({ f0: 500, f1: 900, dur: .3, vol: .12 }); break;
          case 'fire': burst({ f0: 250, f1: 900, q: .6, dur: .5, vol: .4, type: 'lowpass' }); break;
          case 'charred': burst({ f0: 1500, f1: 400, q: 1, dur: .12, vol: .25 }); break;
          case 'tear': burst({ f0: 900, f1: 300, q: 1.2, dur: .06, vol: .22 }); break;
          case 'bite_off': burst({ f0: 700, f1: 200, q: 1, dur: .1, vol: .35 }); break;
          case 'tusk': burst({ f0: 500, f1: 150, q: .8, dur: .14, vol: .45 }); break;
          case 'finished': tone({ f0: 523, dur: .25, vol: .25 }); tone({ f0: 659, dur: .25, vol: .25, delay: .15 }); tone({ f0: 784, dur: .5, vol: .28, delay: .3 }); break;
          case 'full': tone({ f0: 330, f1: 220, dur: .5, vol: .25 }); break;
          case 'slurp_start': {
            if (slurpNode) break; slurpNode = ctx.createBufferSource(); slurpNode.buffer = noiseBuffer(1.0); slurpNode.loop = true;
            const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.5; const lfo = ctx.createOscillator(); lfo.frequency.value = 9; const lg = ctx.createGain(); lg.gain.value = 500; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
            slurpGain = ctx.createGain(); slurpGain.gain.setValueAtTime(0, ctx.currentTime); slurpGain.gain.linearRampToValueAtTime(.35, ctx.currentTime + .08);
            slurpNode.connect(f); f.connect(slurpGain); slurpGain.connect(master); slurpNode.start(); slurpNode._lfo = lfo; break;
          }
          case 'slurp_stop': { if (!slurpNode) break; const n = slurpNode, g = slurpGain; slurpNode = null; g.gain.linearRampToValueAtTime(0, ctx.currentTime + .08); setTimeout(() => { try { n.stop(); n._lfo.stop(); } catch (e) { } }, 150); break; }
        }
      },
    };
    return api;
  }
  root.GohanAudio = { create };
})(typeof self !== 'undefined' ? self : this);
