// Sound and juice. Every sound is synthesized here (oscillators, noise, envelopes, filters): nothing to license, nothing to load.
// sfx.init() must run on the first user gesture; before that, play() is a silent no-op. Music is three sequenced loops (market, chase, and the opening's quiet minor hook),
// scheduled ahead on AudioContext time so they never drift; tracks crossfade over a second.
// Every synth takes (ac, dest, t0, o) so the same code renders live or into an OfflineAudioContext (test-sfx.html?export=1).
import * as THREE from 'three';

// ---------- context ----------
let ac = null, master = null, sfxBus = null, musicBus = null, duckGain = null;
let muted = false, sfxVol = 0.6, musicVol = 0.25;
const noiseBufs = new WeakMap();   // one second of white noise per context

function noiseBuffer(c) {
  let b = noiseBufs.get(c); if (b) return b;
  b = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseBufs.set(c, b); return b;
}

// ---------- small building blocks ----------
// a tone: type, a frequency curve [[t, hz]...] (t relative to t0, exponential between points), an envelope [[t, gain]...] (linear), optional filter
function tone(c, dest, t0, { type = 'sine', freq, env, filter, detune = 0 }) {
  const o = c.createOscillator(); o.type = type; o.detune.value = detune;
  const f = Array.isArray(freq) ? freq : [[0, freq]];
  o.frequency.setValueAtTime(f[0][1], t0 + f[0][0]); for (let i = 1; i < f.length; i++) o.frequency.exponentialRampToValueAtTime(Math.max(1, f[i][1]), t0 + f[i][0]);
  const g = c.createGain(); g.gain.setValueAtTime(0, t0); for (const [t, v] of env) g.gain.linearRampToValueAtTime(v, t0 + t);
  let node = o; if (filter) { const fl = c.createBiquadFilter(); fl.type = filter.type || 'lowpass'; fl.Q.value = filter.Q ?? .7; const fc = Array.isArray(filter.freq) ? filter.freq : [[0, filter.freq]];
    fl.frequency.setValueAtTime(fc[0][1], t0 + fc[0][0]); for (let i = 1; i < fc.length; i++) fl.frequency.exponentialRampToValueAtTime(Math.max(10, fc[i][1]), t0 + fc[i][0]); o.connect(fl); node = fl; }
  node.connect(g); g.connect(dest); const end = env[env.length - 1][0]; o.start(t0); o.stop(t0 + end + .02); return o;
}
// a noise burst through a filter whose centre can sweep
function noise(c, dest, t0, { env, filter = { type: 'bandpass', freq: 1000, Q: 1 } }) {
  const s = c.createBufferSource(); s.buffer = noiseBuffer(c); s.loop = true;
  const fl = c.createBiquadFilter(); fl.type = filter.type; fl.Q.value = filter.Q ?? 1; const fc = Array.isArray(filter.freq) ? filter.freq : [[0, filter.freq]];
  fl.frequency.setValueAtTime(fc[0][1], t0 + fc[0][0]); for (let i = 1; i < fc.length; i++) fl.frequency.exponentialRampToValueAtTime(Math.max(10, fc[i][1]), t0 + fc[i][0]);
  const g = c.createGain(); g.gain.setValueAtTime(0, t0); for (const [t, v] of env) g.gain.linearRampToValueAtTime(v, t0 + t);
  s.connect(fl); fl.connect(g); g.connect(dest); const end = env[env.length - 1][0]; s.start(t0); s.stop(t0 + end + .02);
}
// a vibrato LFO on an oscillator's frequency (returns nothing; it is stopped with the tone)
function wobble(c, osc, t0, { rate, depth, end }) { const l = c.createOscillator(); l.frequency.value = rate; const g = c.createGain(); g.gain.setValueAtTime(depth, t0); g.gain.linearRampToValueAtTime(0, t0 + end); l.connect(g); g.connect(osc.frequency); l.start(t0); l.stop(t0 + end + .02); }
// a soft "pluck" note: triangle + a quiet detuned partner through a lowpass that opens then closes
function pluck(c, dest, t0, hz, len, vol = .5, { type = 'triangle' } = {}) {
  tone(c, dest, t0, { type, freq: hz, env: [[0, 0], [.008, vol], [len * .3, vol * .5], [len, 0]], filter: { freq: [[0, hz * 6], [len, hz * 1.5]], Q: .8 } });
  tone(c, dest, t0, { type: 'sine', freq: hz * 2, env: [[0, 0], [.005, vol * .18], [len * .5, 0]] });
}
// a rounded "bell" note: sine fundamental with a quiet 2nd and a tiny slightly-off 3rd partial
function bell(c, dest, t0, hz, len, vol = .5) {
  tone(c, dest, t0, { type: 'sine', freq: hz, env: [[0, 0], [.004, vol], [len, 0]] });
  tone(c, dest, t0, { type: 'sine', freq: hz * 2, env: [[0, 0], [.003, vol * .35], [len * .55, 0]] });
  tone(c, dest, t0, { type: 'sine', freq: hz * 3.01, env: [[0, 0], [.002, vol * .12], [len * .3, 0]] });
}
const NOTE = (n, base = 261.63) => base * Math.pow(2, n / 12);   // semitones above C4
const PENTA = [0, 4, 7, 9, 12];                                 // C E G A C: the delivery ladder

// ---------- the sounds. each: (c, dest, t0, o) -> length in seconds ----------
export const synths = {
  grab: (c, d, t, o) => { const r = o.rate; tone(c, d, t, { type: 'sine', freq: [[0, 420 * r], [.09 / r, 180 * r]], env: [[0, 0], [.006, .55], [.12 / r, 0]] }); noise(c, d, t, { env: [[0, 0], [.004, .18], [.03, 0]], filter: { type: 'bandpass', freq: 2200, Q: 1.2 } }); return .14 / r; },
  deliver: (c, d, t, o) => { const r = o.rate; const hz = NOTE(PENTA[Math.max(0, Math.min(4, o.step ?? 0))] + 12) * r;   // coin: two quick dings, the second a fifth up
    bell(c, d, t, hz, .5 / r, .45); bell(c, d, t + .07 / r, hz * 1.5, .6 / r, .4); return .7 / r; },
  built: (c, d, t, o) => { const r = o.rate; const q = .13 / r; const seq = [[0, 0], [1, 4], [2, 7], [3, 12]];                         // C E G C'
    for (const [i, n] of seq) { pluck(c, d, t + i * q, NOTE(n + 12) * r, i === 3 ? .9 / r : .22 / r, .42); }
    for (const n of [4, 7]) tone(c, d, t + 3 * q, { type: 'triangle', freq: NOTE(n + 12) * r, env: [[0, 0], [.02, .16], [.6 / r, .1], [.95 / r, 0]], filter: { freq: 2400 } });   // the chord under the last note
    for (let i = 0; i < 4; i++) noise(c, d, t + i * q, { env: [[0, 0], [.003, .08], [.04, 0]], filter: { type: 'highpass', freq: 6000 } });
    return 3 * q + 1 / r; },
  fire: (c, d, t, o) => { const r = o.rate; noise(c, d, t, { env: [[0, 0], [.03, .35], [.22 / r, 0]], filter: { type: 'bandpass', freq: [[0, 400 * r], [.2 / r, 2600 * r]], Q: 1.4 } });
    tone(c, d, t, { type: 'sine', freq: [[0, 180 * r], [.08 / r, 60 * r]], env: [[0, 0], [.005, .4], [.1 / r, 0]] }); return .26 / r; },
  bonk: (c, d, t, o) => { const r = o.rate; tone(c, d, t, { type: 'sine', freq: [[0, 140 * r], [.12 / r, 45 * r]], env: [[0, 0], [.005, .7], [.18 / r, 0]] });                   // thud
    noise(c, d, t, { env: [[0, 0], [.003, .2], [.05, 0]], filter: { type: 'lowpass', freq: 900 } });
    const b = tone(c, d, t + .04 / r, { type: 'triangle', freq: [[0, 420 * r], [.45 / r, 240 * r]], env: [[0, 0], [.01, .3], [.5 / r, 0]], filter: { freq: 1800 } });            // boing
    wobble(c, b, t + .04 / r, { rate: 14 * r, depth: 90 * r, end: .5 / r }); return .58 / r; },
  oops: (c, d, t, o) => { const r = o.rate; tone(c, d, t, { type: 'triangle', freq: [[0, 480 * r], [.6 / r, 170 * r]], env: [[0, 0], [.02, .4], [.4 / r, .3], [.65 / r, 0]], filter: { type: 'bandpass', freq: [[0, 1400 * r], [.6 / r, 300 * r]], Q: 2.2 } });
    tone(c, d, t, { type: 'sine', freq: [[0, 480 * r], [.6 / r, 170 * r]], env: [[0, 0], [.02, .22], [.65 / r, 0]] }); return .7 / r; },
  stun: (c, d, t, o) => { const r = o.rate; const a = tone(c, d, t, { type: 'sine', freq: 620 * r, env: [[0, 0], [.02, .35], [.6 / r, .25], [.9 / r, 0]] }); wobble(c, a, t, { rate: 7 * r, depth: 70 * r, end: .9 / r });
    const b = tone(c, d, t, { type: 'triangle', freq: 930 * r, env: [[0, 0], [.03, .12], [.9 / r, 0]], filter: { freq: 2200 } }); wobble(c, b, t, { rate: 7 * r, depth: 110 * r, end: .9 / r }); return .95 / r; },
  right: (c, d, t, o) => { const r = o.rate; bell(c, d, t, 1318 * r, .55 / r, .4); bell(c, d, t + .09 / r, 1760 * r, .7 / r, .32); return .8 / r; },
  wrong: (c, d, t, o) => { const r = o.rate; for (const [hz, v] of [[165, .3], [171, .22], [247, .1]]) tone(c, d, t, { type: 'triangle', freq: hz * r, env: [[0, 0], [.03, v], [.25 / r, v * .7], [.38 / r, 0]], filter: { freq: 700 * r, Q: .5 } }); return .4 / r; },
  win: (c, d, t, o) => { const r = o.rate; const q = .11 / r; const arp = [0, 4, 7, 12, 16];                                                            // C E G C' E' then the chord rings
    arp.forEach((n, i) => pluck(c, d, t + i * q, NOTE(n + 12) * r, .25 / r, .4));
    for (const n of [0, 4, 7, 12]) tone(c, d, t + 5 * q, { type: 'triangle', freq: NOTE(n + 12) * r, env: [[0, 0], [.03, .17], [.7 / r, .14], [1.5 / r - 5 * q, 0]], filter: { freq: [[0, 3000], [1.5 / r - 5 * q, 900]] } });
    for (const n of [12, 19]) tone(c, d, t + 5 * q, { type: 'sine', freq: NOTE(n + 12) * r, env: [[0, 0], [.02, .12], [1.5 / r - 5 * q, 0]] });
    for (let i = 0; i < 6; i++) bell(c, d, t + 5 * q + .08 * i / r, NOTE(24 + PENTA[i % 5]) * r, .4 / r, .1);                                        // sparkle on top
    for (let i = 0; i < 5; i++) noise(c, d, t + i * q, { env: [[0, 0], [.003, .07], [.04, 0]], filter: { type: 'highpass', freq: 7000 } });
    return 1.5 / r; },
  secret: (c, d, t, o) => { const r = o.rate; const seq = [0, 7, 4, 12, 9, 16, 19]; seq.forEach((n, i) => bell(c, d, t + i * .055 / r, NOTE(n + 24) * r, (.3 + i * .05) / r, .22));
    noise(c, d, t, { env: [[0, 0], [.1, .05], [.5 / r, 0]], filter: { type: 'highpass', freq: 8000 } }); return .75 / r; },
  toast: (c, d, t, o) => { const r = o.rate; tone(c, d, t, { type: 'sine', freq: [[0, 1300 * r], [.04 / r, 1000 * r]], env: [[0, 0], [.003, .3], [.05 / r, 0]] }); noise(c, d, t, { env: [[0, 0], [.002, .1], [.012, 0]], filter: { type: 'highpass', freq: 5000 } }); return .07 / r; },
  whoosh: (c, d, t, o) => { const r = o.rate; const s = Math.max(0, Math.min(1, o.speed ?? .5)); const f = (200 + s * 1600) * r;
    noise(c, d, t, { env: [[0, 0], [.08 / r, .12 + s * .3], [.42 / r, 0]], filter: { type: 'bandpass', freq: [[0, f * .6], [.15 / r, f], [.42 / r, f * .5]], Q: 1.1 } }); return .45 / r; },
  count: (c, d, t, o) => { const r = o.rate; tone(c, d, t, { type: 'sine', freq: 900 * r, env: [[0, 0], [.003, .22], [.035 / r, 0]] }); return .05 / r; },
  step: (c, d, t, o) => { const r = o.rate; noise(c, d, t, { env: [[0, 0], [.006, .14], [.06 / r, 0]], filter: { type: 'lowpass', freq: 420 * r, Q: .8 } }); tone(c, d, t, { type: 'sine', freq: [[0, 110 * r], [.05 / r, 70 * r]], env: [[0, 0], [.004, .12], [.06 / r, 0]] }); return .08 / r; },
};
export const SOUND_NAMES = Object.keys(synths);

// ---------- music: two loops, 8 bars of 16ths each ----------
// notes are semitones above C4 (negative for the bass); a pattern is [[step, note, lengthInSteps], ...]
const A = -3;   // A3
const D = -10;  // D3, the hook's key
function bassLine(prog, pattern) { const out = []; prog.forEach((root, bar) => { for (const [s, iv, len] of pattern) out.push([bar * 16 + s, root + iv, len]); }); return out; }
export const TRACKS = {
  market: { bpm: 100, steps: 128, key: 'C major',
    // I V vi IV, two bars each; the bass bounces root–octave–fifth
    bass: bassLine([0, 0, 7, 7, 9, 9, 5, 5].map(n => n - 24), [[0, 0, 3], [4, 12, 2], [8, 7, 3], [12, 12, 2], [14, 7, 2]]),
    melody: [[0, 12, 2], [2, 16, 2], [4, 19, 4], [8, 16, 2], [10, 12, 2], [12, 14, 4],   [16, 16, 2], [18, 19, 2], [20, 21, 4], [24, 19, 2], [26, 16, 2], [28, 19, 4],
             [32, 23, 2], [34, 19, 2], [36, 16, 4], [40, 19, 2], [42, 23, 2], [44, 24, 4], [48, 21, 2], [50, 19, 2], [52, 16, 4], [56, 14, 2], [58, 16, 2], [60, 12, 4],
             [64, 12, 2], [66, 16, 2], [68, 19, 4], [72, 16, 2], [74, 12, 2], [76, 14, 4],   [80, 16, 2], [82, 19, 2], [84, 21, 4], [88, 19, 2], [90, 16, 2], [92, 19, 4],
             [96, 21, 2], [98, 19, 2], [100, 16, 2], [102, 14, 2], [104, 12, 4], [108, 16, 2], [110, 19, 2], [112, 17, 2], [114, 16, 2], [116, 14, 2], [118, 12, 2], [120, 12, 8]],
    hats: s => s % 4 === 2 ? .5 : s % 8 === 0 ? .25 : 0, kick: s => s % 8 === 0, hatHz: 7000, melodyType: 'triangle', melodyVol: .22, bassVol: .5 },
  chase: { bpm: 142, steps: 128, key: 'A minor',
    // i VI iv V, two bars each; the bass runs on every eighth with a chromatic lift into the next bar
    bass: bassLine([A, A, A - 4, A - 4, A - 7, A - 7, A - 5, A - 5].map(n => n - 12), [[0, 0, 2], [2, 0, 1], [4, 7, 2], [6, 0, 1], [8, 0, 2], [10, 12, 1], [12, 7, 2], [14, 11, 1]]),
    melody: [[0, A + 12, 2], [2, A + 15, 1], [3, A + 12, 1], [4, A + 19, 2], [8, A + 17, 2], [10, A + 15, 2], [12, A + 12, 3],   [16, A + 20, 2], [18, A + 19, 1], [19, A + 17, 1], [20, A + 15, 2], [24, A + 12, 2], [26, A + 15, 2], [28, A + 14, 3],
             [32, A + 8, 2], [34, A + 12, 1], [35, A + 15, 1], [36, A + 20, 2], [40, A + 19, 2], [42, A + 17, 2], [44, A + 15, 3],   [48, A + 10, 2], [50, A + 12, 1], [51, A + 14, 1], [52, A + 15, 2], [56, A + 17, 2], [58, A + 14, 2], [60, A + 11, 3],
             [64, A + 12, 2], [66, A + 15, 1], [67, A + 12, 1], [68, A + 19, 2], [72, A + 17, 2], [74, A + 15, 2], [76, A + 12, 3],   [80, A + 20, 2], [82, A + 19, 1], [83, A + 17, 1], [84, A + 15, 2], [88, A + 12, 2], [90, A + 15, 2], [92, A + 14, 3],
             [96, A + 8, 2], [98, A + 12, 1], [99, A + 15, 1], [100, A + 20, 2], [104, A + 24, 2], [106, A + 20, 2], [108, A + 19, 3],   [112, A + 11, 1], [113, A + 12, 1], [114, A + 14, 1], [115, A + 15, 1], [116, A + 17, 1], [117, A + 19, 1], [118, A + 20, 1], [119, A + 23, 1], [120, A + 24, 6]],
    hats: s => s % 2 === 0 ? (s % 4 === 2 ? .5 : .3) : .12, kick: s => s % 4 === 0, hatHz: 8000, melodyType: 'square', melodyVol: .1, bassVol: .45 },
  hook: { bpm: 72, steps: 128, key: 'D minor',
    // the opening's trouble: i VI III VII, two bars each, slow and quiet. The bass holds roots on the bar and the fifth after; a sparse falling melody, no drums but a soft tick
    bass: bassLine([D, D, D - 4, D - 4, D + 3, D + 3, D - 2, D - 2].map(n => n - 12), [[0, 0, 6], [8, 7, 6]]),
    melody: [[0, D + 24, 4], [6, D + 22, 2], [8, D + 19, 6],   [16, D + 17, 4], [22, D + 15, 2], [24, D + 12, 8],
             [32, D + 20, 4], [38, D + 19, 2], [40, D + 17, 6],   [48, D + 15, 4], [54, D + 17, 2], [56, D + 15, 8],
             [64, D + 22, 4], [70, D + 20, 2], [72, D + 19, 6],   [80, D + 15, 4], [86, D + 19, 2], [88, D + 22, 8],
             [96, D + 22, 4], [102, D + 20, 2], [104, D + 19, 6],  [112, D + 17, 4], [118, D + 14, 2], [120, D + 12, 8]],
    hats: s => s % 8 === 4 ? .18 : 0, kick: () => false, hatHz: 6000, melodyType: 'triangle', melodyVol: .14, bassVol: .32 },
};

// schedule one 16th step of a track at absolute time t (shared by the live sequencer and the offline render)
export function scheduleStep(c, dest, track, s, t, stepLen) {
  for (const [st, n, len] of track.bass) if (st === s) pluck(c, dest, t, NOTE(n), stepLen * len * .9, track.bassVol);
  for (const [st, n, len] of track.melody) if (st === s) {
    if (track.melodyType === 'square') tone(c, dest, t, { type: 'square', freq: NOTE(n), env: [[0, 0], [.01, track.melodyVol], [stepLen * len * .8, track.melodyVol * .6], [stepLen * len, 0]], filter: { freq: [[0, 1800], [stepLen * len, 900]], Q: .8 } });   // a lowpassed square, kept quiet: the game's one edge
    else pluck(c, dest, t, NOTE(n), stepLen * len, track.melodyVol, { type: 'triangle' });
  }
  const h = track.hats(s); if (h) noise(c, dest, t, { env: [[0, 0], [.002, .09 * h], [.045, 0]], filter: { type: 'highpass', freq: track.hatHz } });
  if (track.kick(s)) tone(c, dest, t, { type: 'sine', freq: [[0, 130], [.07, 48]], env: [[0, 0], [.004, .35], [.1, 0]] });
}

const LOOKAHEAD = .18, TICK_MS = 40;
let current = null;   // { name, gain, step, nextTime, timer }
function startTrack(name) {
  const track = TRACKS[name]; if (!track || !ac) return;
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, ac.currentTime); g.gain.linearRampToValueAtTime(1, ac.currentTime + 1); g.connect(musicBus);
  const stepLen = 60 / track.bpm / 4; const T = { name, gain: g, step: 0, nextTime: ac.currentTime + .05, timer: 0 };
  T.timer = setInterval(() => { while (T.nextTime < ac.currentTime + LOOKAHEAD) { scheduleStep(ac, g, track, T.step, T.nextTime, stepLen); T.step = (T.step + 1) % track.steps; T.nextTime += stepLen; } }, TICK_MS);
  return T;
}
function fadeOut(T) { if (!T) return; clearInterval(T.timer); const g = T.gain; g.gain.cancelScheduledValues(ac.currentTime); g.gain.setValueAtTime(g.gain.value, ac.currentTime); g.gain.linearRampToValueAtTime(0, ac.currentTime + 1); setTimeout(() => g.disconnect(), 1300); }

export const music = {
  get current() { return current?.name || null; },
  start(name) { if (!ac || current?.name === name) return; fadeOut(current); current = startTrack(name) || null; },
  stop() { fadeOut(current); current = null; },
  setVolume(v) { musicVol = v; if (musicBus) musicBus.gain.setTargetAtTime(v, ac.currentTime, .05); },
};

// ---------- the public face ----------
export const sfx = {
  synths, music,
  get muted() { return muted; },
  get ready() { return !!ac; },
  get context() { return ac; },
  init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return ac; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ac = new AC(); master = ac.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ac.destination);
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -12; comp.knee.value = 20; comp.ratio.value = 4; comp.attack.value = .003; comp.release.value = .2; comp.connect(master);   // a soft ceiling so a pile-up of coins never clips
    sfxBus = ac.createGain(); sfxBus.gain.value = sfxVol; sfxBus.connect(comp);
    duckGain = ac.createGain(); duckGain.gain.value = 1; duckGain.connect(comp);
    musicBus = ac.createGain(); musicBus.gain.value = musicVol; musicBus.connect(duckGain);
    if (ac.state === 'suspended') ac.resume();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ac.state === 'suspended') ac.resume(); });
    return ac;
  },
  play(name, { volume = 1, rate = 1, pan = 0, ...rest } = {}) {
    if (!ac || muted) return 0; const s = synths[name]; if (!s) { console.warn('sfx: no sound', name); return 0; }
    const g = ac.createGain(); g.gain.value = volume; let dest = g;
    if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(sfxBus); } else g.connect(sfxBus);
    const len = s(ac, dest, ac.currentTime, { rate: Math.max(.25, Math.min(4, rate)), ...rest }); setTimeout(() => g.disconnect(), (len + .3) * 1000); return len;
  },
  setMuted(b) { muted = !!b; if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ac.currentTime, .02); },
  setVolume(v) { sfxVol = v; if (sfxBus) sfxBus.gain.setTargetAtTime(v, ac.currentTime, .05); },
  ducking(on) { if (duckGain) duckGain.gain.setTargetAtTime(on ? .3 : 1, ac.currentTime, on ? .08 : .4); },
  // render a sound (or `bars` bars of a track) into an AudioBuffer offline: the test page's wav export, and a headless check
  async render(name, opts = {}, { bars = 4, sampleRate = 44100 } = {}) {
    const isTrack = !!TRACKS[name]; const len = isTrack ? bars * 16 * (60 / TRACKS[name].bpm / 4) + 1.5 : 2;
    const off = new OfflineAudioContext(1, Math.ceil(len * sampleRate), sampleRate); const g = off.createGain(); g.gain.value = isTrack ? musicVol * 2 : sfxVol; g.connect(off.destination);
    if (isTrack) { const tr = TRACKS[name], sl = 60 / tr.bpm / 4; for (let s = 0; s < bars * 16; s++) scheduleStep(off, g, tr, s % tr.steps, .05 + s * sl, sl); }
    else synths[name](off, g, .02, { rate: 1, ...opts });
    return off.startRendering();
  },
};

// ---------- juice: shake, flash, popText, pulse ----------
let trauma = 0, shakeT = 0; const offset = new THREE.Vector3();
let flashDiv = null, popBox = null, cssDone = false;
function css() {
  if (cssDone) return; cssDone = true; const s = document.createElement('style');
  s.textContent = `@keyframes juicePop{0%{transform:translate(-50%,0) scale(.6);opacity:0}15%{transform:translate(-50%,-10px) scale(1.15);opacity:1}100%{transform:translate(-50%,-70px) scale(1);opacity:0}}
  @keyframes juicePulse{0%{transform:scale(1)}35%{transform:scale(1.14)}100%{transform:scale(1)}}
  .juice-pop{position:absolute;font:700 28px/1 'Fredoka',sans-serif;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.35),0 0 12px rgba(0,0,0,.25);white-space:nowrap;animation:juicePop .9s ease-out forwards;pointer-events:none}
  .juice-pulse{animation:juicePulse .32s ease-out}`; document.head.appendChild(s);
}
export const juice = {
  // add energy to the camera shake (0..1); returns the offset vector that update(dt) keeps current: add it to the camera position each frame
  shake(amount = .3) { trauma = Math.min(1, trauma + amount); return offset; },
  update(dt) {
    if (trauma <= 0) { offset.set(0, 0, 0); return offset; } shakeT += dt * 30; const k = trauma * trauma * .22;
    offset.set(Math.sin(shakeT * 1.3) * k, Math.sin(shakeT * 1.7 + 2) * k * .8, Math.cos(shakeT * 1.1 + 4) * k * .6); trauma = Math.max(0, trauma - dt * 1.6); return offset;
  },
  flash(color = '#fff', ms = 160) {
    if (!flashDiv) { flashDiv = document.createElement('div'); flashDiv.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9000;opacity:0;transition:opacity .08s'; document.body.appendChild(flashDiv); }
    flashDiv.style.background = color; flashDiv.style.transition = 'opacity .04s'; flashDiv.style.opacity = '.55';
    clearTimeout(flashDiv._t); flashDiv._t = setTimeout(() => { flashDiv.style.transition = `opacity ${ms}ms ease-out`; flashDiv.style.opacity = '0'; }, 40);
  },
  popText(text, x, y, { color = '#fff8e7', size } = {}) {
    css(); if (!popBox) { popBox = document.createElement('div'); popBox.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9001;overflow:hidden'; document.body.appendChild(popBox); }
    const el = document.createElement('div'); el.className = 'juice-pop'; el.textContent = text; el.style.left = `${x}px`; el.style.top = `${y}px`; el.style.color = color; if (size) el.style.fontSize = `${size}px`;
    popBox.appendChild(el); el.addEventListener('animationend', () => el.remove()); setTimeout(() => el.remove(), 1200); return el;
  },
  pulse(el) { if (!el) return; css(); el.classList.remove('juice-pulse'); void el.offsetWidth; el.classList.add('juice-pulse'); el.addEventListener('animationend', () => el.classList.remove('juice-pulse'), { once: true }); },
};
