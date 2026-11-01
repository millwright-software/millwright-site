// The takedowns: the slapstick finisher each boss gets when his pile is gone. Cartoon, no gore, and he always lands back on his
// feet grumbling, so it is repeatable (docs/DESIGN.md, "The takedowns"). The hamster is never in the shot getting hurt.
//
//   const td = createTakedown({ scene, spawnBurst, textSprite, play, toast, onShake });
//   td.start('trump', bossGroup, pileCenter, { onDone, facing });   // facing: the yaw the boss faces at the end (default 0 = +z)
//   each frame: td.update(dt); camera.lerp(td.cameraTarget().pos); camera.lookAt(td.cameraTarget().look)
//   td.active / td.done / td.phase / td.t; td.skip() ends it at once.
//
// Pacing (Eric 10/31: "a third or a quarter of that speed, and the audio should match"): every phase plays its motion at half
// speed (SLOW), then holds its last pose until its line has finished: a phase lasts max(dur * 2, clip length + .3 s), the clip
// length from speech.clipLength (D's durations.json) or about .07 s a character until that lands. A phase names its line as
// line: [id, text, at] (at = when in the phase it is said, in motion seconds). Two or three spoken lines per boss, all from the
// frozen table; Ellison has his own (td_ellison_*), and so do Zuckerberg, Page, Walton and Bloomberg (td_<id>_*): the phone
// that bursts, the search that spins, the cart with no brakes, the confetti cannon.
//
// Each takedown is a timeline of phases driven only by update(dt): no timers, so it can be pre-rolled or paused. It calls the boss's
// own controller (userData.boss.update) itself, since the fight stops updating him when it finishes. Everything it adds to the
// scene is removed and disposed on finish; the boss is left at the origin, upright, at his starting scale, in 'idle'.
import * as THREE from 'three';
import * as speech from './speech.js';
import * as Props from './props.js';   // round 3: P.appIconCanvas (made-up icons), read with ?. and a palette fallback

const PI = Math.PI, clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, smooth = THREE.MathUtils.smoothstep;
const UP = new THREE.Vector3(0, 1, 0);
const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tC = new THREE.Vector3();
const easeOut = k => 1 - (1 - k) * (1 - k), easeIn = k => k * k, easeInOut = k => smooth(k, 0, 1);
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .8, ...o });
const rnd = (a, b) => a + Math.random() * (b - a);
const SLOW = 2;            // motion plays at half speed
const CAM_K = .78;         // close shots sit ~22% nearer than before: the boss fills about a third of the screen height
const BUBBLE_K = 2;        // the speech sprite, twice its old size
const lineLen = (id, text) => { const L = speech.clipLength?.(id); return (L != null && L > 0) ? L : String(text || '').length * .07; };
// a phase's length on the clock: half-speed motion, held until its line is over
const wallDur = ph => Math.max(ph.dur * SLOW, ph.line ? ph.line[2] * SLOW + lineLen(ph.line[0], ph.line[1]) + .3 : 0);

const STORY_LINE = 'In our story...', STORY_LEAD = 1.6;   // said (a toast, read aloud) before each takedown: the slapstick and his lines are fiction
const GRUMBLE = {
  trump: '"...I meant to do that. Best landing ever. I\'ll be back."',
  bezos: '"...Return to sender. I\'ll be back. With a bigger box."',
  musk: '"...That was a controlled landing. I\'ll be back."',
  ellison: '"...My cloud. I\'ll be back. With a bigger cloud."',
  zuckerberg: '"...Phone full. I\'ll be back. With a bigger phone."',
  page: '"...Zero results. I\'ll be back. Try again later."',
  walton: '"...My cart needs brakes. I\'ll be back."',
  bloomberg: '"...One place. I\'ll be back."',
};

// ---------- little shared pieces ----------
let puffTex = null;
function getPuffTex() {
  if (puffTex) return puffTex; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.55, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); puffTex = new THREE.CanvasTexture(c); return puffTex;
}
// A round badge with one big word on it (the countdown digits, the whistle).
function badge(text, { fill = '#fff8e7', ink = '#2b2418', ring = '#d7262c', size = 180, scale = 1 } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.beginPath(); g.arc(128, 128, 118, 0, PI * 2); g.fillStyle = fill; g.fill(); g.lineWidth = 14; g.strokeStyle = ring; g.stroke();
  g.fillStyle = ink; g.font = `bold ${size}px Fredoka, "Arial Rounded MT Bold", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 138);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.setScalar(scale); s.renderOrder = 20; return s;
}

// Smoke, dust and balloon-air: a pool of soft sprites that drift, grow and fade.
function makePuffs(n, scene) {
  const tex = getPuffTex(); const group = new THREE.Group(); scene.add(group); const items = []; let next = 0;
  for (let i = 0; i < n; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; group.add(s); items.push({ s, v: new THREE.Vector3(), age: 0, life: 1, size: 1, grow: 1, alpha: .8 }); }
  return {
    emit(pos, vx, vy, vz, size, life, color, grow = 1.5, alpha = .5) {   /* (verify) lighter dust: at .8 a landing cloud over his legs read as a see-through boss */  const it = items[next++ % n]; it.s.visible = true; it.s.position.copy(pos); it.v.set(vx, vy, vz); it.age = 0; it.life = life; it.size = size; it.grow = grow; it.alpha = alpha; it.s.material.color.set(color); it.s.scale.set(size, size, 1); it.s.material.opacity = alpha; },
    update(dt) { for (const it of items) { if (!it.s.visible) continue; it.age += dt; const k = it.age / it.life; if (k >= 1) { it.s.visible = false; continue; } it.s.position.addScaledVector(it.v, dt); it.v.multiplyScalar(Math.max(0, 1 - dt * 1.6)); const sz = it.size * (1 + it.grow * k); it.s.scale.set(sz, sz, 1); it.s.material.opacity = it.alpha * (1 - k) * (1 - k * .5); } },
    dispose() { scene.remove(group); for (const it of items) it.s.material.dispose(); },
  };
}
// Money falling out: a pool of little bags and coins with gravity, a bounce, a rest and a shrink-away.
function makeDebris(n, scene, S) {
  const group = new THREE.Group(); scene.add(group); const items = []; let next = 0;
  const sackG = new THREE.SphereGeometry(.2, 10, 8), neckG = new THREE.CylinderGeometry(.05, .09, .1, 8), tieG = new THREE.TorusGeometry(.06, .018, 6, 10), coinG = new THREE.CylinderGeometry(.16, .16, .04, 18);
  const sackM = std(0x9c6a3a, { roughness: .95 }), tieM = std(0xd7262c), coinM = std(0xf2c230, { roughness: .35, metalness: .6, emissive: 0x5a4210, emissiveIntensity: .3 });
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    if (i % 3 !== 2) { const sack = new THREE.Mesh(sackG, sackM); sack.scale.y = 1.15; sack.position.y = .2; g.add(sack); const neck = new THREE.Mesh(neckG, sackM); neck.position.y = .44; g.add(neck); const tie = new THREE.Mesh(tieG, tieM); tie.position.y = .42; tie.rotation.x = PI / 2; g.add(tie); }
    else { const coin = new THREE.Mesh(coinG, coinM); coin.position.y = .02; g.add(coin); }   /* flat: stood on its edge with its centre at .02, every landed coin was half in the ground */
    g.traverse(m => { if (m.isMesh) m.castShadow = true; }); g.visible = false; const sc = S * .8; g.scale.setScalar(sc); group.add(g); items.push({ g, v: new THREE.Vector3(), w: new THREE.Vector3(), age: 0, ground: 0, scale: sc });
  }
  return {
    emit(pos, vx, vy, vz) { const it = items[next++ % n]; it.g.visible = true; it.g.position.copy(pos); it.v.set(vx, vy, vz); it.w.set(rnd(-4, 4), rnd(-4, 4), rnd(-4, 4)); it.age = 0; it.ground = 0; it.g.scale.setScalar(it.scale); it.g.rotation.set(0, rnd(0, 6.28), 0); },
    update(dt) {
      for (const it of items) { if (!it.g.visible) continue; it.age += dt; const p = it.g.position;
        if (it.ground > 0) { it.ground += dt; if (it.ground > 1.6) { const s = it.scale * Math.max(0, 1 - (it.ground - 1.6) / .35); it.g.scale.setScalar(Math.max(.001, s)); if (s <= 0) it.g.visible = false; } continue; }
        it.v.y -= 11 * dt; p.addScaledVector(it.v, dt); it.g.rotation.x += it.w.x * dt; it.g.rotation.y += it.w.y * dt; it.g.rotation.z += it.w.z * dt;
        if (p.y < 0) { p.y = 0; if (it.v.y < -2.5) { it.v.y = -it.v.y * .3; it.v.x *= .5; it.v.z *= .5; } else { it.ground = .001; it.g.rotation.set(0, it.g.rotation.y, 0); } } }
    },
    dispose() { scene.remove(group); [sackG, neckG, tieG, coinG].forEach(g => g.dispose()); [sackM, tieM, coinM].forEach(m => m.dispose()); },
  };
}
// Cardboard with a wide smile-arrow (front) or shipping stamps (sides). Canvases, nothing fetched.
function cardboardTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#c99a5e'; g.fillRect(0, 0, 512, 512); g.strokeStyle = 'rgba(120,80,30,.12)'; g.lineWidth = 3; for (let y = 8; y < 512; y += 18) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  g.fillStyle = 'rgba(255,240,200,.35)'; g.fillRect(0, 232, 512, 48); // a strip of packing tape
  if (kind === 'front') {
    g.lineCap = 'round'; g.lineWidth = 34; g.strokeStyle = '#1d1a16'; g.beginPath(); g.moveTo(80, 300); g.quadraticCurveTo(256, 440, 420, 310); g.stroke();
    g.beginPath(); g.moveTo(420, 310); g.lineTo(372, 290); g.moveTo(420, 310); g.lineTo(404, 362); g.stroke();
    g.fillStyle = '#1d1a16'; g.font = 'bold 54px Fredoka, "Arial Rounded MT Bold", sans-serif'; g.textAlign = 'center'; g.fillText('one-day delivery', 256, 150);
  } else {
    g.save(); g.translate(256, 150); g.rotate(-.12); g.strokeStyle = '#b5201f'; g.lineWidth = 10; g.strokeRect(-190, -58, 380, 116); g.fillStyle = '#b5201f'; g.font = 'bold 84px Fredoka, "Arial Rounded MT Bold", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FRAGILE', 0, 4); g.restore();
    g.fillStyle = '#1d1a16'; g.font = 'bold 52px Fredoka, "Arial Rounded MT Bold", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText('THIS SIDE UP', 256, 440);
    g.lineWidth = 22; g.lineCap = 'round'; g.strokeStyle = '#1d1a16'; g.beginPath(); g.moveTo(256, 380); g.lineTo(256, 310); g.moveTo(256, 310); g.lineTo(216, 350); g.moveTo(256, 310); g.lineTo(296, 350); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createTakedown(ctx) {
  const { scene, spawnBurst, textSprite } = ctx; const play = ctx.play || (() => {}); const toast = ctx.toast || (() => {}); const onShake = ctx.onShake || (() => {});
  const cam = { pos: new THREE.Vector3(0, 3, 10), look: new THREE.Vector3() };
  const T = { active: false, done: false, id: null, phase: '', t: 0 };
  let boss, B, origin, S, H, onDone, phases, pi, pt, yaw, bossParent;
  const fwd = new THREE.Vector3(0, 0, 1), right = new THREE.Vector3(1, 0, 0);
  const added = [];        // every object this takedown put in the scene (removed + disposed on finish)
  const pools = [];        // puffs/debris pools (disposed on finish)
  let bubble = null, bubbleAnchor = null, bubbleDy = 0; // the speech bubble and what it floats over

  const add = o => { scene.add(o); added.push(o); return o; };
  const disposeTree = o => o.traverse?.(m => { if (m.geometry) m.geometry.dispose(); const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []; for (const mt of mats) { if (mt.map && mt.map !== puffTex) mt.map.dispose(); mt.dispose(); } });
  // camera: a point to frame, how far back (along the facing direction), how high, and where to look relative to the point
  function frame(tx, ty, tz, dist, height, lookDy = 0, side = .3) { dist *= CAM_K; height *= CAM_K; cam.pos.set(tx, ty, tz).addScaledVector(fwd, dist * Math.cos(side)).addScaledVector(right, dist * Math.sin(side)); cam.pos.y = ty + height; cam.look.set(tx, ty + lookDy, tz); }
  function say(text, id) { if (bubble) { scene.remove(bubble); disposeTree(bubble); bubble = null; } if (!text) return; bubble = textSprite([text], { size: Math.min(78, Math.floor(1750 / Math.max(1, text.length))), scale: 1.55 * BUBBLE_K * Math.max(1, S * .9), depthTest: false });   /* a long line gets a smaller font so it fits the 1024 px canvas */ bubble.renderOrder = 15; scene.add(bubble); if (id) play(id, text.replace(/[.…]+$/, '')); }
  function anchorBubble(obj, dy) { bubbleAnchor = obj; bubbleDy = dy; }
  function placeBubble() { if (!bubble) return; const a = bubbleAnchor || B.head; a.getWorldPosition(tA); const extra = bubbleAnchor ? 0 : Math.max(0, boss.scale.y / S - 1) * .45 * S; bubble.position.set(tA.x, tA.y + bubbleDy + extra, tA.z); }
  function bossStand(x, z) { boss.position.set(x, 0, z); boss.rotation.set(0, yaw, 0); boss.scale.setScalar(S); boss.visible = true; }
  function dustRing(puffs, x, z, n, size, color = 0xd8c39a) { for (let i = 0; i < n; i++) { const a = i / n * PI * 2; tB.set(x + Math.cos(a) * .3, .2, z + Math.sin(a) * .3); puffs.emit(tB, Math.cos(a) * 2.6, .9, Math.sin(a) * 2.6, size, 1.1, color, 1.4, .85); } }

  // ---------- the runner ----------
  T.start = (id, bossGroup, originV3, { onDone: cb, facing = 0 } = {}) => {
    if (T.active) T.skip();
    boss = bossGroup; B = boss.userData.boss; origin = originV3.clone(); onDone = cb; yaw = facing; S = boss.scale.x || 1; H = (B.height || 2.05) * S; bossParent = boss.parent;
    fwd.set(Math.sin(yaw), 0, Math.cos(yaw)); right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    T.active = true; T.done = false; T.id = id; T.t = 0; pi = 0; pt = 0;
    phases = (BUILD[id] || BUILD.bezos)(); frame(origin.x, 0, origin.z, 9, 2.5, 1.2);
    // (verify) everything he says and does from here is made up: the narrator says so first, then his first line
    lead = STORY_LEAD; toast(STORY_LINE, { ms: STORY_LEAD * 1000 + 400 });
  };
  let lead = 0;
  // pt is clock time inside the phase; the motion sees m = min(pt / SLOW, dur) and holds the last pose while the line finishes
  function enterPhase() { const ph = phases[pi]; ph.wall = wallDur(ph); ph.said = false; T.phase = ph.name; ph.enter?.(); sayLine(ph, 0); }
  function sayLine(ph, m) { if (ph.line && !ph.said && m >= ph.line[2]) { ph.said = true; say(ph.line[1], ph.line[0]); ph.onLine?.(); } }
  T.update = (dt) => {
    if (!T.active) return; dt = clamp(dt || 0, 0, .1); T.t += dt;
    if (lead > 0) { lead -= dt; B.update(dt / SLOW); if (lead <= 0) enterPhase(); return; }
    pt += dt;
    while (pt >= phases[pi].wall) { pt -= phases[pi].wall; pi++; if (pi >= phases.length) { finish(); return; } enterPhase(); }
    const ph = phases[pi], m = Math.min(pt / SLOW, ph.dur), md = pt / SLOW > ph.dur ? 0 : dt / SLOW; sayLine(ph, m);
    ph.tick?.(m / ph.dur, m, md);
    B.update(dt / SLOW); ph.post?.(m / ph.dur, m, md);
    for (const p of pools) p.update(dt / SLOW); placeBubble();
  };
  T.cameraTarget = () => cam;
  T.skip = () => { if (T.active) finish(); };
  function finish() {
    if (bossParent && boss.parent !== bossParent) bossParent.attach(boss);
    for (const o of added) { scene.remove(o); disposeTree(o); } added.length = 0; for (const p of pools) p.dispose(); pools.length = 0;
    if (bubble) { scene.remove(bubble); disposeTree(bubble); bubble = null; } bubbleAnchor = null;
    bossStand(origin.x, origin.z); B.setSpeed(1.9); B.play('idle', { fade: .35 }); B.update(0); onShake(0);
    toast(GRUMBLE[T.id] || GRUMBLE.trump, { ms: 3200 }); frame(origin.x, 0, origin.z, 6, 1.8, 1.1);
    T.active = false; T.done = true; T.phase = 'done'; const cb = onDone; onDone = null; cb?.();
  }

  // ---------- Trump: brags, puffs up, floats off like a balloon, money raining out, plops back on the empty pile ----------
  function trump() {
    const puffs = makePuffs(40, scene), debris = makeDebris(24, scene, S); pools.push(puffs, debris);
    let tie = null; boss.traverse(o => { if (!tie && o.isGroup && Math.abs(o.position.y - .5) < 1e-4 && Math.abs(o.position.z - .215) < 1e-4) tie = o; });
    let tieExtra = 0, spin = 0, emitT = 0, burstT = 0, puffT = 0; const from = new THREE.Vector3(), far = origin.clone().addScaledVector(fwd, -8).addScaledVector(right, 4);
    const balloon = (w, h, t) => boss.scale.set(S * w * (1 + .035 * Math.sin(t * 21)), S * h * (1 - .03 * Math.sin(t * 21)), S * w * (1 + .035 * Math.cos(t * 19)));
    const pockets = (t, dt) => { emitT -= dt; burstT -= dt; if (emitT <= 0) { emitT = .12; const s = Math.random() < .5 ? -1 : 1; tB.copy(boss.position).addScaledVector(right, s * .55 * S * 1.5); tB.y += .95 * S * 1.3; debris.emit(tB, right.x * s * 1.6 + rnd(-.6, .6), rnd(-1, .5), right.z * s * 1.6 + rnd(-.6, .6)); } if (burstT <= 0) { burstT = .32; tB.copy(boss.position); tB.y += .8 * S; spawnBurst(scene, tB, 0xf2c230, 14); } };
    return [
      { name: 'brag', dur: 2.6, line: ['td_trump_brag1', 'The best pile. Tremendous.', 0], enter() { bossStand(boss.position.x, boss.position.z); B.play('laugh'); anchorBubble(null, 1.05 * S); this.second = false; },
        tick(k, t) { if (t > 1.3 && !this.second) { this.second = true; B.play('cheer'); } const puff = 1 + .06 * Math.floor(t / .65) + .04 * Math.max(0, Math.sin(t * 9.7)); boss.scale.set(S * puff * 1.04, S * puff, S * puff * 1.04); tieExtra = -.35 * Math.max(0, Math.sin(t * 9.7)); frame(boss.position.x, 1.1 * S, boss.position.z, 5.6 * S, 1.3 * S, .2); },
        post() { if (tie) tie.rotation.x += tieExtra; } },
      { name: 'inflate', dur: 1.5, enter() { B.play('cheer'); say(null); },
        tick(k, t) { const e = easeInOut(k); balloon(1.18 + .92 * e, 1.18 + .32 * e, t); tieExtra = -.4 - .35 * Math.sin(t * 26); boss.rotation.z = .07 * Math.sin(t * 14); boss.rotation.x = -.25 * e; boss.rotation.y = yaw + .05 * Math.sin(t * 11); boss.position.y = .9 * S * Math.max(0, (k - .6) / .4) ** 2; frame(boss.position.x, 1.5 * S, boss.position.z, (6 + 3 * e) * S, (1.4 + 1.2 * e) * S, .5 * S); },
        post() { if (tie) tie.rotation.x += tieExtra; } },
      { name: 'float', dur: 3.0, line: ['td_trump_float', 'This is on purpose!', 0], enter() { from.copy(boss.position); B.play('dizzy'); anchorBubble(null, .55 * S); },
        tick(k, t, dt) { const e = .55 * easeIn(k) + .45 * k; boss.position.x = lerp(from.x, far.x, e); boss.position.z = lerp(from.z, far.z, e); boss.position.y = from.y + (10 - from.y) * e + .25 * Math.sin(t * 3.1); spin += dt * 2.0; boss.rotation.y = yaw + spin; boss.rotation.z = .18 * Math.sin(t * 2.4); boss.rotation.x = -.25 + .1 * Math.sin(t * 1.7); balloon(2.1, 1.5, t); tieExtra = -.9 - .4 * Math.sin(t * 15); pockets(t, dt);
          // wide: the camera backs off and tilts up as he drifts over the trees; the pile stays in the bottom of the frame
          cam.pos.copy(origin).addScaledVector(fwd, (8 + 4 * e) * S).addScaledVector(right, 2.5 * S); cam.pos.y = (2.2 + 2.5 * e) * S; cam.look.copy(origin).lerp(boss.position, .7 + .15 * e); cam.look.y = Math.max(cam.look.y, 1.5); },
        post() { if (tie) tie.rotation.x += tieExtra; } },
      { name: 'pfft', dur: 1.0, enter() { from.copy(boss.position); say(null); puffT = 0; },
        tick(k, t, dt) { const e = easeOut(k); const w = 2.1 - 1.1 * e, h = 1.5 - .5 * e; const zig = (1 - k) * .9; boss.position.x = lerp(from.x, origin.x, e) + zig * Math.sin(t * 28); boss.position.z = lerp(from.z, origin.z, e) + zig * Math.cos(t * 23); boss.position.y = lerp(from.y, 7.5, e) + zig * .6 * Math.sin(t * 19); boss.rotation.y += dt * 9 * (1 - k); boss.rotation.z = .5 * Math.sin(t * 30) * (1 - k); boss.rotation.x = .3 * Math.sin(t * 25) * (1 - k); boss.scale.set(S * w, S * h, S * w);
          puffT -= dt; if (puffT <= 0) { puffT = .05; tB.copy(boss.position); tB.y += .6 * S; puffs.emit(tB, rnd(-2, 2), rnd(-1, 2), rnd(-2, 2), .6 * S, .5, 0xffffff, 1.2, .7); }
          cam.pos.copy(origin).addScaledVector(fwd, 12 * S).addScaledVector(right, 2.5 * S); cam.pos.y = 3.5 * S; cam.look.copy(origin).lerp(boss.position, .6); } },
      { name: 'plop', dur: .75, enter() { from.copy(boss.position); boss.rotation.set(0, yaw, 0); boss.scale.setScalar(S); B.play('dizzy'); },
        tick(k) { const e = easeIn(k); boss.position.set(lerp(from.x, origin.x, e), lerp(from.y, 0, e), lerp(from.z, origin.z, e)); boss.rotation.z = .25 * (1 - k); boss.scale.set(S * (1 - .15 * e), S * (1 + .25 * e), S * (1 - .15 * e)); frame(origin.x, .9 * S, origin.z, 7.5 * S, 1.8 * S, .6 * S); } },
      { name: 'dizzy', dur: 1.9, line: ['td_trump_landed', '...Best landing ever.', .2], enter() { boss.position.set(origin.x, 0, origin.z); boss.rotation.set(0, yaw, 0); dustRing(puffs, origin.x, origin.z, 14, 1.0 * S); tB.copy(origin); spawnBurst(scene, tB, 0xd8c39a, 26); onShake(.6); anchorBubble(null, 1.0 * S); },
        tick(k, t) { const sq = Math.max(0, 1 - t / .45); const wob = Math.sin(t * 22) * sq; boss.scale.set(S * (1 + .45 * sq + .08 * wob), S * (1 - .5 * sq - .08 * wob), S * (1 + .45 * sq + .08 * wob)); onShake(.5 * Math.max(0, 1 - t / .5)); frame(origin.x, 1.0 * S, origin.z, 5.2 * S, 1.3 * S, .25 * S, .35); } },
    ];
  }

  // ---------- Bezos: his own drones box him up in a giant smiling carton, fly off wobbling, the box bursts over the market ----------
  function makeDrone() {
    const g = new THREE.Group(); const dark = std(0x33363c, { roughness: .5, metalness: .3 }), light = std(0xe9e9ec, { roughness: .4 }), blade = std(0x222226, { transparent: true, opacity: .75 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(.5, .16, .5), light); g.add(body); const belly = new THREE.Mesh(new THREE.BoxGeometry(.3, .1, .3), dark); belly.position.y = -.1; g.add(belly);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 8), std(0xd7262c, { emissive: 0x7a1010 })); eye.position.set(0, 0, .26); g.add(eye); g.userData.rotors = [];
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(.6, .05, .07), dark); arm.position.set(sx * .3, .02, sz * .3); arm.rotation.y = -Math.atan2(sz, sx); g.add(arm);
      const hub = new THREE.Group(); hub.position.set(sx * .52, .08, sz * .52); g.add(hub); const motor = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, .08, 10), dark); hub.add(motor);
      const rotor = new THREE.Group(); rotor.position.y = .06; hub.add(rotor); for (const r of [0, PI / 2]) { const bl = new THREE.Mesh(new THREE.BoxGeometry(.5, .012, .06), blade); bl.rotation.y = r; rotor.add(bl); } g.userData.rotors.push(rotor);
    }
    g.traverse(m => { if (m.isMesh) m.castShadow = true; }); return g;
  }
  function makeBox(w, h) {
    const g = new THREE.Group(); const front = cardboardTex('front'), side = cardboardTex('side'); const cm = std(0xc99a5e, { roughness: .95, side: THREE.DoubleSide }); const d = .06;
    const panels = []; const mk = (geo, mat, x, y, z, ry) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; g.add(m); panels.push(m); return m; };
    mk(new THREE.BoxGeometry(w, h, d), std(0xffffff, { map: front, roughness: .95, side: THREE.DoubleSide }), 0, h / 2, w / 2, 0);
    mk(new THREE.BoxGeometry(w, h, d), std(0xffffff, { map: side, roughness: .95, side: THREE.DoubleSide }), 0, h / 2, -w / 2, PI);
    mk(new THREE.BoxGeometry(w, h, d), std(0xffffff, { map: side, roughness: .95, side: THREE.DoubleSide }), w / 2, h / 2, 0, PI / 2);
    mk(new THREE.BoxGeometry(w, h, d), cm, -w / 2, h / 2, 0, -PI / 2);
    const lids = []; for (const s of [-1, 1]) { const hinge = new THREE.Group(); hinge.position.set(s * w / 2, h, 0); g.add(hinge); const flap = new THREE.Mesh(new THREE.BoxGeometry(w / 2, d, w), cm); flap.position.x = -s * w / 4; flap.castShadow = true; hinge.add(flap); hinge.userData.s = s; lids.push(hinge); }
    g.userData = { panels, lids, w, h, setLid(open) { for (const l of lids) l.rotation.z = -l.userData.s * open * (PI / 2 + .35); } }; g.userData.setLid(1); return g;
  }
  // a cardboard piece that hits the ground lies down flat on it (frozen mid-tumble, half of each panel sank into the ground)
  function layFlat(m) { const p = m.geometry.parameters || {}; const ry = m.rotation.y; if ((p.depth ?? 1) <= (p.height ?? 1)) { m.rotation.set(-PI / 2, 0, ry); m.position.y = (p.depth ?? .06) / 2 + .01; } else { m.rotation.set(0, ry, 0); m.position.y = (p.height ?? .06) / 2 + .01; } }
  function bezos() {
    const puffs = makePuffs(40, scene), debris = makeDebris(24, scene, S); pools.push(puffs, debris);
    const W = 1.75 * S, HB = 2.45 * S; const box = add(makeBox(W, HB)); box.visible = false; const bx = boss.position.x, bz = boss.position.z;
    const drones = []; const slots = [], starts = [], flee = []; const n = 4;
    for (let i = 0; i < n; i++) { const d = add(makeDrone()); d.scale.setScalar(S * .9); drones.push(d); const a = i / n * PI * 2 + PI / 4; slots.push(new THREE.Vector3(bx + Math.cos(a) * 1.6 * S, H + 1.5 * S, bz + Math.sin(a) * 1.6 * S)); starts.push(origin.clone().addScaledVector(fwd, -11 - i * 2).addScaledVector(right, (i - 1.5) * 4).setY(8 + i)); flee.push(new THREE.Vector3(rnd(-1, 1), 1.2, -1).normalize().multiplyScalar(rnd(5, 8))); d.position.copy(starts[i]); }
    const strings = []; const strM = std(0x5a4a3a); for (let i = 0; i < n; i++) { const s = add(new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, 1, 6), strM)); s.visible = false; strings.push(s); }
    const corner = (i, out) => { out.set((i % 2 ? 1 : -1) * W / 2, HB, (i < 2 ? 1 : -1) * W / 2); return box.localToWorld(out); };
    const stringTo = (s, a, b) => { s.position.copy(a).add(b).multiplyScalar(.5); tC.copy(b).sub(a); s.scale.y = Math.max(.01, tC.length()); s.quaternion.setFromUnitVectors(UP, tC.normalize()); };
    const shards = []; const from = new THREE.Vector3(); let tumble = 0, landed = false;
    const spinRotors = (dt) => { for (const d of drones) for (const r of d.userData.rotors) r.rotation.y += dt * 42; };
    const dronesOverCorners = (t, k) => { for (let i = 0; i < n; i++) { const d = drones[i]; corner(i, tA); tA.y += 1.15 * S; tA.x += .12 * Math.sin(t * 5 + i); tA.z += .12 * Math.cos(t * 4.3 + i); d.position.lerp(tA, k); d.rotation.z = .25 * Math.sin(t * 4 + i) * k; d.rotation.x = .18 * Math.cos(t * 3.3 + i) * k; corner(i, tB); tA.copy(d.position); tA.y -= .12 * S; strings[i].visible = true; stringTo(strings[i], tA, tB); } };
    return [
      { name: 'arrive', dur: 1.8, line: ['td_bezos_delivery', 'Ooh, a delivery. For me!', .7], enter() { bossStand(bx, bz); B.play('idle'); anchorBubble(null, 1.05 * S); }, onLine() { B.play('laugh'); },
        tick(k, t, dt) { const e = easeInOut(k); for (let i = 0; i < n; i++) { const d = drones[i]; d.position.lerpVectors(starts[i], slots[i], e); d.position.y += .12 * Math.sin(t * 5 + i); d.rotation.x = .35 * (1 - e); d.rotation.y = yaw + PI; } spinRotors(dt); frame(bx, 1.4 * S, bz, 7 * S, 2.2 * S, .5 * S); } },
      { name: 'drop', dur: 1.2, enter() { box.visible = true; box.position.set(bx, 8 * S, bz); box.rotation.y = yaw; box.userData.setLid(1); say(null); B.play('cheer'); },
        tick(k, t, dt) { const e = easeIn(Math.min(1, k * 1.05)); box.position.y = 8 * S * (1 - e); box.rotation.z = .06 * Math.sin(t * 7) * (1 - e); for (let i = 0; i < n; i++) { const d = drones[i]; d.position.copy(slots[i]); d.position.y += .12 * Math.sin(t * 5 + i); } spinRotors(dt); frame(bx, 1.3 * S, bz, 8.5 * S, 2.6 * S, .9 * S); } },
      { name: 'close', dur: .9, line: ['td_bezos_who', 'Hey! Who ordered THIS?', 0], enter() { box.position.y = 0; dustRing(puffs, bx, bz, 10, .7 * S); boss.visible = false; anchorBubble(box, HB + .5 * S); onShake(.3); },
        tick(k, t, dt) { box.userData.setLid(1 - easeInOut(Math.min(1, k * 1.4))); box.scale.set(1 + .05 * Math.sin(t * 16) * (1 - k), 1 - .05 * Math.sin(t * 16) * (1 - k), 1 + .05 * Math.sin(t * 16) * (1 - k)); dronesOverCorners(t, Math.min(1, dt * 7)); spinRotors(dt); frame(bx, 1.3 * S, bz, 7.5 * S, 2.4 * S, .6 * S); } },
      { name: 'lift', dur: 2.1, enter() { from.copy(box.position); box.scale.setScalar(1); },
        tick(k, t, dt) { const e = easeInOut(k); box.position.set(lerp(from.x, origin.x, e), 7.5 * S * e, lerp(from.z, origin.z, e)); const w = e * (.6 + .4 * e); box.rotation.z = .28 * Math.sin(t * 4.2) * w; box.rotation.x = .2 * Math.sin(t * 3.1) * w; dronesOverCorners(t, 1); spinRotors(dt); for (const d of drones) d.rotation.y = yaw + PI + .4 * Math.sin(t * 2);
          cam.pos.copy(origin).addScaledVector(fwd, (9 + 5 * e) * S).addScaledVector(right, 2.5 * S); cam.pos.y = (2 + 6 * e) * S; cam.look.copy(from).lerp(box.position, .7 + .3 * e); cam.look.y += .8 * S; } },
      { name: 'burst', dur: 1.35, enter() { say(null); box.getWorldPosition(from); from.y += HB * .5; for (const p of [...box.userData.panels, ...box.userData.lids]) { const m = p.isGroup ? p.children[0] : p; m.getWorldPosition(tA); scene.attach(m); added.push(m); m.userData.v = new THREE.Vector3().copy(tA).sub(from).setY(0).normalize().multiplyScalar(rnd(4, 6)); m.userData.v.y = rnd(3, 6); m.userData.w = new THREE.Vector3(rnd(-5, 5), rnd(-5, 5), rnd(-5, 5)); shards.push(m); }
          box.visible = false; for (const c of [0xf2c230, 0xfff1d6, 0xd7262c]) spawnBurst(scene, from, c, 24); for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2; debris.emit(from, Math.cos(a) * rnd(1.5, 4), rnd(1, 5), Math.sin(a) * rnd(1.5, 4)); } for (let i = 0; i < 10; i++) { puffs.emit(from, rnd(-3, 3), rnd(-1, 3), rnd(-3, 3), 1.4 * S, .9, 0xfff3dc, 1.2, .9); }
          boss.visible = true; boss.position.copy(from); boss.position.y -= .9 * S; boss.rotation.set(0, yaw, 0); B.play('fall', { fade: .05 }); tumble = 0; landed = false; onShake(.8); },
        tick(k, t, dt) { for (let i = 0; i < n; i++) { const d = drones[i]; d.position.addScaledVector(flee[i], dt); d.rotation.z += dt * 3 * Math.sin(t * 7); d.position.y += .2 * Math.sin(t * 9) * dt; strings[i].visible = false; } spinRotors(dt);
          for (const m of shards) { m.userData.v.y -= 10 * dt; m.position.addScaledVector(m.userData.v, dt); m.rotation.x += m.userData.w.x * dt; m.rotation.y += m.userData.w.y * dt; m.rotation.z += m.userData.w.z * dt; if (m.position.y < .05 && m.userData.v.y < 0) { layFlat(m); m.userData.v.set(0, 0, 0); m.userData.w.set(0, 0, 0); } }
          if (!landed) { const fy = from.y - .9 * S; const y = fy - 6 * t * t; if (y <= 0) { landed = true; boss.position.set(origin.x, 0, origin.z); boss.rotation.set(0, yaw, 0); dustRing(puffs, origin.x, origin.z, 14, 1.0 * S); tB.copy(origin); spawnBurst(scene, tB, 0xd8c39a, 22); onShake(.7); play('v_dizzy'); } else { tumble += dt * 7; boss.position.lerp(tB.set(origin.x, y, origin.z), Math.min(1, dt * 4)); boss.position.y = y; boss.rotation.x = tumble; boss.rotation.y = yaw + .6 * Math.sin(tumble); } }
          else { const sq = Math.max(0, 1 - (t - Math.sqrt((from.y - .9 * S) / 6)) / .4); boss.scale.set(S * (1 + .3 * sq), S * (1 - .3 * sq), S * (1 + .3 * sq)); onShake(.5 * sq); }
          cam.pos.copy(origin).addScaledVector(fwd, 13 * S).addScaledVector(right, 2.5 * S); cam.pos.y = lerp(7.5 * S, 3 * S, k); cam.look.set(origin.x, lerp(from.y * .95, .8 * S, easeInOut(k)), origin.z); } },
      { name: 'dizzy', dur: 1.9, line: ['td_bezos_box', "Where's my box?!", .1], enter() { boss.position.set(origin.x, 0, origin.z); boss.rotation.set(0, yaw, 0); boss.scale.setScalar(S); B.play('dizzy', { fade: .35 }); anchorBubble(null, 1.05 * S); },
        tick(k, t, dt) { for (let i = 0; i < n; i++) { drones[i].position.addScaledVector(flee[i], dt); drones[i].rotation.z += dt * 2; } spinRotors(dt); for (const m of shards) { if (m.userData.v.y < 0) { m.userData.v.y -= 10 * dt; m.position.addScaledVector(m.userData.v, dt); m.rotation.x += m.userData.w.x * dt; m.rotation.z += m.userData.w.z * dt; if (m.position.y < .05) { layFlat(m); m.userData.v.set(0, 0, 0); m.userData.w.set(0, 0, 0); } } else if (m.position.y <= .12) m.scale.multiplyScalar(Math.max(0, 1 - dt * 1.4)); } frame(origin.x, 1.0 * S, origin.z, 5.2 * S, 1.3 * S, .25 * S, .35); } },
    ];
  }

  // ---------- Musk: strapped to his own rocket, countdown, launch, and it comes straight back down into the empty pile ----------
  function makeRocket() {
    const g = new THREE.Group(); const white = std(0xf4f4f0, { roughness: .35 }), red = std(0xd7262c, { roughness: .4 }), dark = std(0x3a3a40, { roughness: .5, metalness: .4 });
    const r = .52 * S, h = 3.0 * S, base = .35 * S; const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * .92, h, 24), white); body.position.y = base + h / 2; g.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(r, 1.25 * S, 24), red); nose.position.y = base + h + .62 * S; g.add(nose);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, .18 * S, 24), red); band.position.y = base + .5 * S; g.add(band);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(r * .5, r * .8, .42 * S, 16), dark); bell.position.y = base * .55; g.add(bell);
    const fin = new THREE.Shape(); fin.moveTo(0, .15 * S); fin.lineTo(0, 1.35 * S); fin.lineTo(.55 * S, .5 * S); fin.lineTo(.95 * S, .05 * S); fin.lineTo(.8 * S, -.05 * S); fin.closePath();
    const finG = new THREE.ExtrudeGeometry(fin, { depth: .07 * S, bevelEnabled: false }); finG.translate(r * .92 - .05 * S, 0, -.035 * S);
    for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(finG, red); f.rotation.y = -(PI / 6 + i * PI * 2 / 3); f.position.y = base; g.add(f); }
    const win = new THREE.Mesh(new THREE.TorusGeometry(.2 * S, .05 * S, 10, 24), dark); win.position.set(0, base + h * .86, r * 1.0); g.add(win);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(.19 * S, 20), std(0x8ec6ea, { emissive: 0x1a3a55, emissiveIntensity: .5, roughness: .2 })); glass.position.set(0, base + h * .86, r * 1.03); g.add(glass);
    const flame = new THREE.Group(); flame.position.y = base * .3; g.add(flame); const fo = new THREE.Mesh(new THREE.ConeGeometry(r * .7, 1.5 * S, 14), std(0xff7a1a, { emissive: 0xff5a00, emissiveIntensity: 1.2 })); fo.rotation.x = PI; fo.position.y = -.75 * S; flame.add(fo); const fi = new THREE.Mesh(new THREE.ConeGeometry(r * .4, 1.0 * S, 12), std(0xffe066, { emissive: 0xffd040, emissiveIntensity: 1.5 })); fi.rotation.x = PI; fi.position.y = -.5 * S; flame.add(fi); flame.visible = false;
    const straps = new THREE.Group(); straps.visible = false; g.add(straps); for (const y of [1.25 * S, .55 * S]) { const s = new THREE.Mesh(new THREE.TorusGeometry(.78 * S, .045 * S, 8, 36), std(0x3a2a1a, { roughness: .9 })); s.rotation.x = PI / 2; s.position.set(0, y, .32 * S); s.scale.set(.75, 1, 1); straps.add(s); }
    g.traverse(m => { if (m.isMesh) m.castShadow = true; }); g.userData = { flame, straps, r, h, base, tip: base + h + 1.25 * S }; return g;
  }
  function musk() {
    const puffs = makePuffs(60, scene); pools.push(puffs);
    const rocket = add(makeRocket()); const R = rocket.userData; const pad = origin.clone().addScaledVector(right, 2.0 * S); const seat = pad.clone().addScaledVector(fwd, R.r + .3 * S);
    rocket.position.copy(pad); rocket.position.y = 14; rocket.rotation.y = yaw; let digit = null, whistle = null, smokeT = 0, strapped = false; const from = new THREE.Vector3(); const bx = boss.position.x, bz = boss.position.z;
    const flicker = (t, on) => { R.flame.visible = on; if (on) R.flame.scale.set(1 + .15 * Math.sin(t * 40), .8 + .3 * Math.abs(Math.sin(t * 31)), 1 + .15 * Math.cos(t * 37)); };
    const exhaust = (dt, rate, big) => { smokeT -= dt; while (smokeT <= 0) { smokeT += rate; tB.copy(rocket.position); tB.y = Math.max(.1, rocket.position.y - .2 * S); puffs.emit(tB, rnd(-2.5, 2.5) * big, rnd(.2, 1.2), rnd(-2.5, 2.5) * big, (.8 + .5 * big) * S, 1.5, 0xc9c9c9, 1.8, .85); } };
    const showDigit = (txt) => { if (digit) { scene.remove(digit); disposeTree(digit); } digit = add(badge(txt, { scale: 2.4 * S })); };
    return [
      { name: 'land', dur: 1.8, enter() { bossStand(bx, bz); B.play('idle'); this.cheered = false; },
        tick(k, t, dt) { const e = easeOut(k); rocket.position.y = 14 * (1 - e); rocket.rotation.z = .04 * Math.sin(t * 9) * (1 - e); flicker(t, k < .95); if (k > .35) exhaust(dt, .05, 1 - e * .5); if (t > .5 && !this.cheered) { this.cheered = true; B.play('cheer'); } const sq = Math.max(0, (k - .9) / .1) * .06; rocket.scale.set(1 + sq, 1 - sq, 1 + sq); frame((bx + pad.x) / 2, 1.5 * S, (bz + pad.z) / 2, 9 * S, 2.6 * S, .9 * S); } },
      { name: 'walk', dur: 1.25, line: ['td_musk_strap', 'Strap me in!', 1.0], enter() { anchorBubble(null, 1.05 * S); from.copy(boss.position); rocket.scale.setScalar(1); rocket.rotation.z = 0; B.play('walk'); B.setSpeed(2.2); say(null); this.strap = false; },
        tick(k, t, dt) { const e = Math.min(1, k * 1.25); if (!this.strap) boss.position.lerpVectors(from, seat, easeInOut(e)); if (e < 1) { tA.copy(seat).sub(from); boss.rotation.y = Math.atan2(tA.x, tA.z); } else if (!this.strap) { this.strap = true; boss.rotation.y = yaw; B.play('cheer'); R.straps.visible = true; rocket.attach(boss); strapped = true; } frame(pad.x, 1.4 * S, pad.z, 7 * S, 2.0 * S, .6 * S, .5); } },
      { name: 'count', dur: 2.1, enter() { this.n = 0; say(null); }, tick(k, t, dt) { const n = Math.min(3, Math.floor(t / .7) + 1); if (n !== this.n) { this.n = n; showDigit(String(4 - n)); play('td_count_' + (4 - n), String(4 - n)); } const tt = t - (n - 1) * .7; const pop = 1 + .5 * Math.max(0, 1 - tt / .22); digit.scale.set(2.4 * S * pop, 2.4 * S * pop, 1); digit.position.copy(pad).addScaledVector(right, -2.4 * S); digit.position.y = R.tip - .4 * S; if (t > 1.3) { rocket.rotation.z = .01 * Math.sin(t * 60); onShake(.08); flicker(t, true); exhaust(dt, .06, .5); } frame(pad.x, 2.2 * S, pad.z, 10 * S, 3.0 * S, 1.4 * S, .45); } },
      { name: 'launch', dur: 1.9, line: ['td_musk_mars', 'To Mars!', 0], enter() { if (digit) { scene.remove(digit); disposeTree(digit); digit = null; } rocket.rotation.z = 0; anchorBubble(null, 1.05 * S); },
        tick(k, t, dt) { const y = 9 * t * t; rocket.position.y = y; rocket.rotation.z = .02 * Math.sin(t * 50); flicker(t, true); exhaust(dt, .025, 1.2); onShake(1.0 * Math.max(0, 1 - k * 1.2));
          cam.pos.copy(origin).addScaledVector(fwd, 13 * S).addScaledVector(right, 1.5 * S); cam.pos.y = 2.5 * S; tA.copy(rocket.position); tA.y = Math.min(tA.y + 1.5 * S, 11 * S); cam.look.copy(pad).lerp(tA, Math.min(1, k * 2)); if (k > .6) cam.look.y = lerp(11 * S, 7 * S, (k - .6) / .4); } },
      { name: 'quiet', dur: .8, enter() { say(null); rocket.visible = false; whistle = add(badge('fweee', { size: 72, ring: '#2d6fd3', scale: 1.8 * S })); onShake(0); },
        tick(k, t) { whistle.position.copy(origin); whistle.position.y = (9 - 5 * k) * S; whistle.material.opacity = Math.min(1, k * 4) * (1 - k * .3); whistle.scale.set(1.8 * S * (1 + .3 * k), 1.8 * S * (1 + .3 * k), 1); frame(origin.x, 2 * S, origin.z, 12 * S, 3.5 * S, 3.5 * S, .25); } },
      { name: 'fall', dur: .75, enter() { rocket.visible = true; rocket.rotation.set(PI, yaw, 0); rocket.position.set(origin.x, 12 * S, origin.z); if (whistle) { scene.remove(whistle); disposeTree(whistle); whistle = null; } R.flame.visible = false; },
        tick(k, t, dt) { rocket.position.y = lerp(12 * S, R.tip - .7 * S, Math.pow(k, 1.3)); rocket.rotation.y += dt * 2; rocket.rotation.z = .06 * Math.sin(t * 20); cam.pos.copy(origin).addScaledVector(fwd, 16 * S).addScaledVector(right, 1.5 * S); cam.pos.y = 3 * S; cam.look.set(origin.x, (7 - 6 * k) * S, origin.z); } },
      { name: 'crash', dur: 1.9, line: ['td_musk_closed', '...Mars was closed.', .2], enter() { rocket.position.y = R.tip - .7 * S; rocket.rotation.set(PI + .32, yaw, .12); /* the nose leans away from him: leaning toward him it stuck into the ground where he lands */ if (strapped) { bossParent.attach(boss); strapped = false; } R.straps.visible = false; bossStand(origin.x + fwd.x * 1.4 * S + right.x * .5 * S, origin.z + fwd.z * 1.4 * S + right.z * .5 * S); from.copy(boss.position);
          this.poof = false; B.play('dizzy', { fade: .05 }); for (const c of [0xf2c230, 0xd8c39a, 0xff7a1a]) { tB.copy(origin); spawnBurst(scene, tB, c, 26); } dustRing(puffs, origin.x, origin.z, 18, 1.4 * S, 0xcfc4ad); for (let i = 0; i < 8; i++) { tB.copy(origin); tB.y = .5; puffs.emit(tB, rnd(-1, 1), rnd(2, 5), rnd(-1, 1), 1.6 * S, 1.5, 0x9a9a9a, 2, .9); } onShake(1.3); anchorBubble(null, 1.05 * S); },
        tick(k, t) { const sq = Math.max(0, 1 - t / .45); boss.scale.set(S * (1 + .4 * sq), S * (1 - .45 * sq), S * (1 + .4 * sq)); boss.position.copy(from).addScaledVector(right, .35 * S * Math.sin(t * 4)); onShake(1.2 * Math.max(0, 1 - t / .6)); if (t > 1.3) { const s = Math.max(.001, 1 - (t - 1.3) / .45); rocket.scale.setScalar(s); if (!this.poof) { this.poof = true; tB.copy(origin); tB.y = 1.5 * S; for (let i = 0; i < 6; i++) puffs.emit(tB, rnd(-2, 2), rnd(0, 2), rnd(-2, 2), 1.5 * S, .8, 0xffffff, 1.5, .8); } } frame(origin.x, 1.1 * S, origin.z, 6.0 * S, 1.6 * S, .5 * S, .4); } },
    ];
  }

  // ---------- Ellison: a cloud full of his computers floats down, he cheers, it floats away, he jumps for it and misses ----------
  function makeCloud() {
    const g = new THREE.Group(); const white = std(0xffffff, { roughness: 1, emissive: 0x9fb4c8, emissiveIntensity: .15 }), grey = std(0x5a5f66, { roughness: .5, metalness: .4 }), dark = std(0x1d1f24, { roughness: .8 });
    const puff = new THREE.SphereGeometry(1, 16, 12);
    for (const [x, y, z, r] of [[0, 0, 0, 1.25], [1.25, -.15, .2, 1.0], [-1.2, -.1, -.1, 1.05], [.5, .55, -.3, .95], [-.55, .5, .35, .9], [2.1, -.3, -.2, .7], [-2.0, -.3, .25, .72], [0, -.35, .9, .8], [.2, -.3, -.9, .85]]) { const m = new THREE.Mesh(puff, white); m.position.set(x, y, z); m.scale.setScalar(r); g.add(m); }
    const lights = [];
    for (const [x, z, ry] of [[-.7, .1, .2], [.1, -.15, -.1], [.9, .15, .15]]) { const sv = new THREE.Group(); sv.position.set(x, 1.05, z); sv.rotation.y = ry; const b = new THREE.Mesh(new THREE.BoxGeometry(.5, .9, .45), grey); b.position.y = .45; sv.add(b); const f = new THREE.Mesh(new THREE.BoxGeometry(.44, .8, .02), dark); f.position.set(0, .45, .235); sv.add(f);
      for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 6), std(0x40ff60, { emissive: 0x20ff40, emissiveIntensity: 1 })); l.position.set(.14, .2 + i * .22, .25); sv.add(l); lights.push(l); } g.add(sv); }
    g.traverse(m => { if (m.isMesh) m.castShadow = true; }); g.userData.lights = lights; return g;
  }
  function ellison() {
    const puffs = makePuffs(40, scene); pools.push(puffs);
    const cloud = add(makeCloud()); cloud.scale.setScalar(S * .9); const bx = boss.position.x, bz = boss.position.z;
    const hover = new THREE.Vector3(bx, H + 1.6 * S, bz), high = new THREE.Vector3(bx, 18 * S, bz), away = origin.clone().addScaledVector(fwd, -9 * S).addScaledVector(right, 5 * S).setY(H + 4.5 * S);
    const from = new THREE.Vector3(), reach = new THREE.Vector3(); cloud.position.copy(high);
    const blink = t => { cloud.userData.lights.forEach((l, i) => { l.material.emissiveIntensity = Math.sin(t * 6 + i * 1.7) > 0 ? 1.4 : .15; }); };
    const bob = t => { cloud.rotation.z = .05 * Math.sin(t * 1.3); cloud.rotation.x = .04 * Math.cos(t * 1.1); };
    return [
      { name: 'arrive', dur: 2.0, line: ['td_ellison_1', 'So many computers. All mine!', .9], enter() { bossStand(bx, bz); B.play('idle'); anchorBubble(null, 1.05 * S); }, onLine() { B.play('cheer'); },
        tick(k, t) { cloud.position.lerpVectors(high, hover, easeOut(k)); cloud.position.y += .15 * Math.sin(t * 2); bob(t); blink(t); frame(bx, 1.6 * S, bz, 8 * S, 2.4 * S, 1.2 * S); } },
      { name: 'drift', dur: 2.4, line: ['td_ellison_2', 'Hey! My cloud is floating away!', .4], enter() { from.copy(cloud.position); B.play('laugh'); }, onLine() { B.play('dizzy'); },
        tick(k, t) { const e = easeInOut(k); cloud.position.lerpVectors(from, away, e); cloud.position.y += .2 * Math.sin(t * 2.2); bob(t); blink(t); tA.copy(cloud.position).sub(boss.position); boss.rotation.y = yaw + .6 * Math.sin(k * PI) * Math.sign(tA.x || 1);
          frame(bx, 1.6 * S, bz, (8 + 2 * e) * S, (2.4 + 1 * e) * S, (1.2 + 1.2 * e) * S); } },
      { name: 'chase', dur: 2.2, line: ['td_ellison_3', 'Wait for me!', .1], enter() { from.copy(boss.position); reach.copy(away).setY(0).lerp(origin, .45); B.play('run'); B.setSpeed?.(2.4); this.jumped = false; },
        tick(k, t, dt) { const run = Math.min(1, k / .6); boss.position.lerpVectors(from, reach, easeInOut(run)); tA.copy(reach).sub(from); boss.rotation.y = Math.atan2(tA.x, tA.z);
          if (k > .6) { const j = (k - .6) / .4; boss.position.y = Math.sin(j * PI) * 1.8 * S; if (!this.jumped) { this.jumped = true; B.play('cheer'); } }
          cloud.position.copy(away).addScaledVector(fwd, -3 * S * k); cloud.position.y += 2 * S * k + .2 * Math.sin(t * 2.2); bob(t); blink(t);
          cam.pos.copy(origin).addScaledVector(fwd, 11 * S * CAM_K).addScaledVector(right, 2.5 * S); cam.pos.y = 3.2 * S; cam.look.copy(boss.position).lerp(cloud.position, .35); } },
      { name: 'plop', dur: .75, enter() { from.copy(boss.position); B.play('fall', { fade: .05 }); say(null); },
        tick(k, t, dt) { const e = easeIn(k); boss.position.set(lerp(from.x, origin.x, e), Math.max(0, lerp(from.y, 0, e) + Math.sin(k * PI) * 1.2 * S), lerp(from.z, origin.z, e)); boss.rotation.x = k * PI * 2; cloud.position.y += dt * 4; cloud.position.addScaledVector(fwd, -dt * 3); frame(origin.x, .9 * S, origin.z, 7.5 * S, 1.8 * S, .6 * S); } },
      { name: 'dizzy', dur: 2.2, enter() { boss.position.set(origin.x, 0, origin.z); boss.rotation.set(0, yaw, 0); B.play('dizzy', { fade: .05 }); dustRing(puffs, origin.x, origin.z, 14, 1.0 * S); tB.copy(origin); spawnBurst(scene, tB, 0xd8c39a, 24); onShake(.6); play('v_dizzy'); },
        tick(k, t, dt) { const sq = Math.max(0, 1 - t / .45); boss.scale.set(S * (1 + .4 * sq), S * (1 - .45 * sq), S * (1 + .4 * sq)); onShake(.5 * Math.max(0, 1 - t / .5)); cloud.position.y += dt * 3; cloud.scale.multiplyScalar(Math.max(0, 1 - dt * .6)); frame(origin.x, 1.0 * S, origin.z, 5.2 * S, 1.3 * S, .25 * S, .35); } },
    ];
  }

  // ---------- shared by the four newer takedowns ----------
  // a hop from a to b with a bump of `peak` in the middle
  const arc = (out, a, b, k, peak) => { out.lerpVectors(a, b, k); out.y += 4 * peak * k * (1 - k); return out; };
  // a fan of bags and coins thrown out of a point
  const rainMoney = (debris, at, n, up = 4, out = 3) => { for (let i = 0; i < n; i++) { const a = rnd(0, PI * 2), s = rnd(.5, 1) * out; debris.emit(at, Math.cos(a) * s, rnd(.4, 1) * up, Math.sin(a) * s); } };
  // flung pieces (app tiles): gravity, tumble, lie flat on landing, then shrink away
  const flingShards = (list, dt) => { for (const m of list) { if (!m.visible) continue; const u = m.userData; if (u.rest) { u.rest += dt; if (u.rest > 1.2) { m.scale.multiplyScalar(Math.max(0, 1 - dt * 2.5)); if (m.scale.x < .01) m.visible = false; } continue; }
    u.v.y -= 10 * dt; m.position.addScaledVector(u.v, dt); m.rotation.x += u.w.x * dt; m.rotation.y += u.w.y * dt; m.rotation.z += u.w.z * dt; if (m.position.y < .05 && u.v.y < 0) { layFlat(m); u.rest = .001; } } };
  // the last beat every one of them shares: back on the empty pile, squashed, dizzy, one line
  function landing(puffs, line, more = {}) {
    return { name: 'dizzy', dur: 1.9, line, enter() { boss.visible = true; boss.position.set(origin.x, 0, origin.z); boss.rotation.set(0, yaw, 0); boss.scale.setScalar(S); B.play('dizzy', { fade: .05 }); dustRing(puffs, origin.x, origin.z, 14, 1.0 * S); tB.copy(origin); spawnBurst(scene, tB, 0xd8c39a, 24); onShake(.6); anchorBubble(null, 1.05 * S); more.enter?.(); },
      tick(k, t, dt) { const sq = Math.max(0, 1 - t / .45); boss.scale.set(S * (1 + .4 * sq), S * (1 - .45 * sq), S * (1 + .4 * sq)); onShake(.5 * Math.max(0, 1 - t / .5)); more.tick?.(k, t, dt); frame(origin.x, 1.0 * S, origin.z, 5.2 * S, 1.3 * S, .25 * S, .35); } };
  }

  // ---------- Zuckerberg: the apps fly into his phone one after another, it swells over his head, buzzes, and bursts ----------
  // (story: "When new apps got popular, he bought them"; AP 2025-11-18). Round 3: made-up icons only (P.appIconCanvas kinds
  // seed, paw, wheel, cloud, star), else a palette tile with a simple shape; no camera square, chat bubble, heart or play button.
  function appTex(color, glyph) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    let art = null; try { art = Props.appIconCanvas?.(glyph, 256) || null; } catch (e) { art = null; }
    if (art) { g.drawImage(art, 0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
    g.fillStyle = '#1d1f24'; g.fillRect(0, 0, 128, 128); g.beginPath(); g.roundRect(8, 8, 112, 112, 28); g.fillStyle = color; g.fill();
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
    if (glyph === 'paw') { g.beginPath(); g.ellipse(64, 74, 24, 20, 0, 0, PI * 2); g.fill(); for (const [x, y] of [[36, 46], [54, 32], [74, 32], [92, 46]]) { g.beginPath(); g.arc(x, y, 9, 0, PI * 2); g.fill(); } }
    else if (glyph === 'wheel') { g.beginPath(); g.arc(64, 64, 34, 0, PI * 2); g.stroke(); for (let i = 0; i < 6; i++) { const a = i * PI / 3; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 34, 64 + Math.sin(a) * 34); g.stroke(); } }
    else if (glyph === 'cloud') { for (const [x, y, rr] of [[46, 70, 18], [66, 58, 24], [86, 72, 16]]) { g.beginPath(); g.arc(x, y, rr, 0, PI * 2); g.fill(); } g.fillRect(46, 70, 40, 18); }
    else if (glyph === 'seed') { g.beginPath(); g.ellipse(64, 66, 18, 32, .5, 0, PI * 2); g.fill(); }
    else { g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 16 : 38, a = -PI / 2 + i * PI / 5; g.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r); } g.closePath(); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const APP_COLS = ['#8cc067', '#d7262c', '#3a7bd5', '#a8743f', '#f2c230'], APP_GLYPHS = (Props.APP_ICONS?.length ? Props.APP_ICONS : null) || ['seed', 'paw', 'wheel', 'cloud', 'star'];
  function makeApp(i) { const m = new THREE.Mesh(new THREE.BoxGeometry(.32, .32, .06), new THREE.MeshStandardMaterial({ map: appTex(APP_COLS[i % APP_COLS.length], APP_GLYPHS[i % APP_GLYPHS.length]), roughness: .5 })); m.castShadow = true; return m; }
  function makePhone() {
    const g = new THREE.Group(); const c = document.createElement('canvas'); c.width = 256; c.height = 512; const x = c.getContext('2d');
    x.fillStyle = '#1d2433'; x.fillRect(0, 0, 256, 512);
    for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) { x.fillStyle = APP_COLS[(r * 3 + q) % APP_COLS.length]; x.beginPath(); x.roundRect(28 + q * 72, 60 + r * 84, 56, 56, 14); x.fill(); }
    x.fillStyle = 'rgba(255,255,255,.8)'; x.fillRect(96, 20, 64, 10);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.9, .12), std(0x1d1f24, { roughness: .35, metalness: .4 })); g.add(body);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(.88, 1.74), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .45, roughness: .4 })); screen.position.z = .065; g.add(screen);
    g.traverse(m => { if (m.isMesh) m.castShadow = true; }); return g;
  }
  function zuckerberg() {
    const puffs = makePuffs(40, scene), debris = makeDebris(30, scene, S); pools.push(puffs, debris);
    const phone = add(makePhone()); const bx = boss.position.x, bz = boss.position.z, home = new THREE.Vector3(origin.x, 0, origin.z);
    const from = new THREE.Vector3(), start = new THREE.Vector3(bx, 0, bz);
    const held = new THREE.Vector3(bx, 1.25 * S, bz).addScaledVector(fwd, .75 * S), over = new THREE.Vector3(bx, H + 2.0 * S, bz).addScaledVector(fwd, .25 * S);   // the swollen phone's bottom edge just over his head
    const N = 8, apps = [], appFrom = [], shards = []; let grow = 1, tumble = 0, emitT = 0;
    for (let i = 0; i < N; i++) { const a = add(makeApp(i)); a.scale.setScalar(S * 1.4); const ang = i / N * PI * 2 + .3; appFrom.push(new THREE.Vector3(bx + Math.cos(ang) * 5 * S, (1.2 + (i % 3) * 1.1) * S, bz + Math.sin(ang) * 5 * S)); a.position.copy(appFrom[i]); a.visible = false; a.userData.in = false; apps.push(a); }
    const phoneAt = (p, sc, t) => { phone.position.copy(p); phone.rotation.set(-.15, yaw, .04 * Math.sin(t * 2)); phone.scale.setScalar(S * .7 * sc); };
    return [
      { name: 'scroll', dur: 2.8, line: ['td_zuckerberg_buy', "I'll buy that one. And that one!", .5], enter() { bossStand(bx, bz); B.play('laugh'); anchorBubble(null, 1.05 * S); phoneAt(held, grow, 0); },
        tick(k, t) {
          for (let i = 0; i < N; i++) { const a = apps[i], u = (t - (.15 + i * .28)) / .7; if (u < 0 || a.userData.in) continue;
            if (u >= 1) { a.userData.in = true; a.visible = false; grow += .07; tB.copy(held); spawnBurst(scene, tB, 0xf2c230, 8); continue; }
            a.visible = true; const e = easeIn(u); a.position.lerpVectors(appFrom[i], held, e); a.position.y += Math.sin(u * PI) * 1.2 * S; a.rotation.set(t * 3 + i, t * 4, 0); a.scale.setScalar(S * 1.4 * (1 - .75 * e)); }
          phoneAt(held, grow + .03 * Math.sin(t * 9), t); frame(bx, 1.3 * S, bz, 7 * S, 1.9 * S, .5 * S); } },
      { name: 'swell', dur: 1.5, enter() { B.play('cheer'); say(null); from.copy(phone.position); this.g0 = grow; },
        tick(k, t) { const e = easeInOut(k); tA.lerpVectors(from, over, e); phoneAt(tA, lerp(this.g0, 2.6, e) * (1 + .03 * Math.sin(t * 30)), t); frame(bx, (1.8 + .8 * e) * S, bz, (8.5 + 3 * e) * S, 2.4 * S, (1.1 + .5 * e) * S); } },
      { name: 'buzz', dur: 1.6, line: ['td_zuckerberg_full', 'Uh oh. My phone is too full!', .1], enter() { B.play('dizzy'); anchorBubble(phone, 2.5 * S); emitT = 0; },
        tick(k, t, dt) { const j = .12 * S * (.4 + k); tA.copy(over); tA.x += j * Math.sin(t * 61); tA.y += j * Math.abs(Math.sin(t * 47)); tA.z += j * Math.cos(t * 53); phoneAt(tA, 2.6 + .3 * k + .06 * Math.sin(t * 40), t); phone.rotation.z = .12 * Math.sin(t * 57) * (.4 + k);
          boss.position.set(bx, .25 * S * Math.abs(Math.sin(t * 13)) * (.3 + k), bz); boss.rotation.y = yaw + .15 * Math.sin(t * 29);
          emitT -= dt; if (emitT <= 0) { emitT = .1; tB.copy(phone.position); tB.y += 1.6 * S; debris.emit(tB, rnd(-2, 2), rnd(2, 4), rnd(-2, 2)); }
          onShake(.15 * k); frame(bx, 2.6 * S, bz, 11.5 * S, 2.4 * S, 1.6 * S); } },
      { name: 'pop', dur: 1.5, enter() { say(null); anchorBubble(null, 1.05 * S); phone.getWorldPosition(from); phone.visible = false; onShake(.9);
          for (let i = 0; i < 12; i++) { const a = add(makeApp(i)); a.scale.setScalar(S * 1.2); a.position.copy(from); const ang = rnd(0, PI * 2); a.userData = { v: new THREE.Vector3(Math.cos(ang) * rnd(2, 5), rnd(3, 7), Math.sin(ang) * rnd(2, 5)), w: new THREE.Vector3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)), rest: 0 }; shards.push(a); }
          for (const c of [0xf2c230, 0x1c7ed6, 0xe64980, 0xfff1d6]) spawnBurst(scene, from, c, 22); rainMoney(debris, from, 18, 5, 4); for (let i = 0; i < 8; i++) puffs.emit(from, rnd(-3, 3), rnd(-1, 3), rnd(-3, 3), 1.3 * S, .9, 0xffffff, 1.2, .85);
          start.set(bx, boss.position.y, bz); B.play('fall', { fade: .05 }); tumble = 0; },
        tick(k, t, dt) { flingShards(shards, dt); arc(boss.position, start, home, k, 4.5 * S); boss.position.y = Math.max(0, boss.position.y); tumble += dt * 8; boss.rotation.set(tumble, yaw + .5 * Math.sin(tumble * .5), 0);
          cam.pos.copy(origin).addScaledVector(fwd, 9 * S).addScaledVector(right, 2.5 * S); cam.pos.y = 3.8 * S; cam.look.set(origin.x, lerp(3.5 * S, .9 * S, easeInOut(k)), origin.z); } },   /* 9 m, not 12: farther back, a built stall's roof filled the shot */
      landing(puffs, ['td_zuckerberg_phone', '...Can I buy a new phone?', .2], { tick: (k, t, dt) => flingShards(shards, dt) }),
    ];
  }

  // ---------- Page: he searches for his pile with a giant magnifying glass, the loading wheel spins him like a top, no results ----------
  // (story: Google has "almost all the searching to itself", AP 2024-08-05)
  function makeGlass() {
    const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.TorusGeometry(.7, .09, 12, 40), std(0x2b2f36, { roughness: .35, metalness: .6 })));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(.68, 36), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: .3, roughness: .05, side: THREE.DoubleSide, depthWrite: false })); g.add(lens);
    const shine = new THREE.Mesh(new THREE.RingGeometry(.42, .5, 24, 1, 2.2, .9), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .6, side: THREE.DoubleSide, depthWrite: false })); shine.position.z = .01; g.add(shine);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(.09, .11, 1.0, 12), std(0x6b3f1f)); handle.position.set(.85, -.85, 0); handle.rotation.z = PI / 4; g.add(handle);
    g.traverse(m => { if (m.isMesh && m !== lens && m !== shine) m.castShadow = true; }); return g;
  }
  function makeSpinner() { const g = new THREE.Group(); const cols = [0x3a7bd5, 0xf2c230]; for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; const s = new THREE.Mesh(new THREE.SphereGeometry(.16 * (1 - i * .07), 12, 8), std(cols[i % cols.length], { emissive: cols[i % cols.length], emissiveIntensity: .35 })); s.position.set(Math.cos(a) * .7, Math.sin(a) * .7, 0); g.add(s); } return g; }
  function page() {
    const puffs = makePuffs(40, scene), debris = makeDebris(30, scene, S); pools.push(puffs, debris);
    const glass = add(makeGlass()), spin = add(makeSpinner()); spin.visible = false; const bx = boss.position.x, bz = boss.position.z, home = new THREE.Vector3(origin.x, 0, origin.z);
    const eye = new THREE.Vector3(bx, H * .8, bz).addScaledVector(fwd, .9 * S), offL = eye.clone().addScaledVector(right, -7 * S).setY(4 * S), rest = home.clone().addScaledVector(right, 2.0 * S).addScaledVector(fwd, -.4 * S).setY(.12);   // the dropped glass lies beside him, not between him and the camera
    glass.scale.setScalar(S * 1.1); glass.position.copy(offL);
    let ang = 0, orb = 0, emitT = 0; const from = new THREE.Vector3(), gFrom = new THREE.Vector3();
    const fling = (dt, every, sp) => { emitT -= dt; while (emitT <= 0) { emitT += every; const a = rnd(0, PI * 2); tB.copy(boss.position); tB.y += .9 * S; debris.emit(tB, Math.cos(a) * sp, rnd(1.5, 3.5), Math.sin(a) * sp); } };
    const spinnerOver = (t, sc) => { spin.visible = true; spin.position.copy(boss.position); spin.position.y += H + .95 * S; spin.rotation.set(0, yaw, -t * 6); spin.scale.setScalar(Math.max(.001, 1.3 * S * sc)); };
    const orbit = (dt, r, rate) => { orb += rate * dt; glass.position.set(boss.position.x + Math.cos(orb) * r, boss.position.y + H * .6, boss.position.z + Math.sin(orb) * r); glass.rotation.set(0, -orb, .3 * Math.sin(orb * 2)); };
    return [
      { name: 'search', dur: 2.6, line: ['td_page_search', 'Let me search for my pile.', .6], enter() { bossStand(bx, bz); B.play('idle'); anchorBubble(null, 1.25 * S); },
        tick(k, t) { const w = Math.min(1, k * 2), e = easeOut(Math.min(1, k * 1.8)); glass.position.lerpVectors(offL, eye, e); glass.position.addScaledVector(right, .35 * S * Math.sin(t * 2.2) * w); glass.position.y += .08 * S * Math.sin(t * 3.1); glass.rotation.set(0, yaw, .15 * Math.sin(t * 1.7));
          boss.rotation.y = yaw + .25 * Math.sin(t * 2.2) * w; frame(bx, 1.5 * S, bz, 6.2 * S, 1.6 * S, .4 * S); } },
      { name: 'loading', dur: 2.4, line: ['td_page_loading', 'Loading... loading...', .2], enter() { gFrom.copy(glass.position); B.play('dizzy'); ang = 0; emitT = 0; anchorBubble(null, 3.3 * S); orb = Math.atan2(glass.position.z - bz, glass.position.x - bx); },
        tick(k, t, dt) { spinnerOver(t, Math.min(1, k * 4) * (1 + .1 * Math.sin(t * 8))); ang += (2 + 14 * k * k) * dt; boss.rotation.y = yaw + ang;
          orbit(dt, 1.7 * S, 1.5 + 6 * k); tA.copy(glass.position); glass.position.lerpVectors(gFrom, tA, easeInOut(Math.min(1, k * 2.5)));
          if (k > .25) fling(dt, lerp(.25, .06, k), 2 + 3 * k); frame(bx, 1.7 * S, bz, 8 * S, 2.2 * S, .9 * S); } },
      { name: 'whirl', dur: 1.6, enter() { say(null); anchorBubble(null, 1.25 * S); },
        tick(k, t, dt) { ang += 16 * dt; boss.rotation.y = yaw + ang; boss.position.set(bx, 4.2 * S * easeOut(k), bz); boss.rotation.z = .2 * Math.sin(t * 7); orbit(dt, 1.7 * S, 7.5); spinnerOver(t, 1); fling(dt, .04, 5);
          cam.pos.copy(origin).addScaledVector(fwd, 9 * S).addScaledVector(right, 2.5 * S); cam.pos.y = 3.2 * S; cam.look.set(bx, (1 + 3 * easeOut(k)) * S, bz); } },
      { name: 'drop', dur: .8, enter() { from.copy(boss.position); gFrom.copy(glass.position); B.play('fall', { fade: .05 }); },
        tick(k, t, dt) { const e = easeIn(k); boss.position.lerpVectors(from, home, e); ang += 16 * (1 - k) * dt; boss.rotation.set(0, yaw + ang, .3 * (1 - k)); spinnerOver(t, 1 - k);
          glass.position.lerpVectors(gFrom, rest, e); glass.rotation.set(-PI / 2 * e, yaw + .5, 0); frame(origin.x, .9 * S, origin.z, 7.5 * S, 1.8 * S, .6 * S); } },
      landing(puffs, ['td_page_none', '...No results found.', .2], { enter: () => { spin.visible = false; glass.position.copy(rest); glass.rotation.set(-PI / 2, yaw + .5, 0); } }),
    ];
  }

  // ---------- Walton: a ride in his own giant shopping cart, no brakes, round and round the pile, and it tips him out ----------
  // (story: his dad started Walmart; the football in the child seat is his Broncos, AP 2022-06-08)
  function wireTex() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.strokeStyle = '#d9dee4'; g.lineWidth = 4;
    for (let i = 4; i < 128; i += 17) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
    g.strokeStyle = '#2d6fd3'; g.lineWidth = 12; g.strokeRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function rod(parent, a, b, r, mat) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 8), mat); m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(UP, tC.copy(b).sub(a).normalize()); parent.add(m); return m; }
  function makeCart() {
    // the group's origin is the front axle (so it can tip forward over its front wheels); the basket sits behind it, along -z
    const g = new THREE.Group(), inner = new THREE.Group(); inner.position.z = -1.0; g.add(inner); const wheels = [];
    const wm = new THREE.MeshStandardMaterial({ map: wireTex(), transparent: true, alphaTest: .35, side: THREE.DoubleSide, roughness: .4, metalness: .5 });
    const metal = std(0xc9ced6, { roughness: .35, metalness: .7 }), blue = std(0x2d6fd3, { roughness: .5 }), black = std(0x1d1f24);
    const W = 1.3, L = 2.0, Hh = .9, y0 = .6;
    const panel = (w, h, x, y, z, ry, rx = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wm); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); inner.add(m); };
    panel(W, Hh, 0, y0 + Hh / 2, L / 2, 0); panel(W, Hh, 0, y0 + Hh / 2, -L / 2, 0); panel(L, Hh, W / 2, y0 + Hh / 2, 0, PI / 2); panel(L, Hh, -W / 2, y0 + Hh / 2, 0, PI / 2); panel(W, L, 0, y0, 0, 0, -PI / 2);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const x = sx * (W / 2 - .1), z = sz * (L / 2 - .15); rod(inner, new THREE.Vector3(x, .14, z), new THREE.Vector3(x, y0, z), .03, metal);
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .08, 14), black); wh.rotation.z = PI / 2; wh.position.set(x, .12, z); inner.add(wh); wheels.push(wh); }
    const hy = y0 + Hh + .15, hz = -L / 2 - .25; const handle = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, W + .1, 10), blue); handle.rotation.z = PI / 2; handle.position.set(0, hy, hz); inner.add(handle);
    for (const sx of [-1, 1]) rod(inner, new THREE.Vector3(sx * W / 2, y0 + Hh, -L / 2), new THREE.Vector3(sx * W / 2, hy, hz), .03, metal);
    const ball = new THREE.Group(); ball.add(new THREE.Mesh(new THREE.SphereGeometry(.2, 16, 12), std(0xfb4f14, { roughness: .7 }))); ball.children[0].scale.set(1, .62, .62);
    const lace = new THREE.Mesh(new THREE.BoxGeometry(.18, .02, .03), std(0xffffff)); lace.position.y = .125; ball.add(lace); const stripe = new THREE.Mesh(new THREE.TorusGeometry(.115, .015, 6, 18), std(0x0b2265)); stripe.rotation.y = PI / 2; stripe.position.x = .12; ball.add(stripe);
    ball.position.set(0, y0 + Hh + .08, -L / 2 + .25); ball.rotation.y = .4; inner.add(ball);
    g.traverse(m => { if (m.isMesh) m.castShadow = true; }); g.userData = { wheels, ball, seat: new THREE.Vector3(0, y0 + .02, -1.0) }; return g;
  }
  function walton() {
    const puffs = makePuffs(40, scene), debris = makeDebris(30, scene, S); pools.push(puffs, debris);
    const cart = add(makeCart()), C = cart.userData, cs = 1.35 * S; cart.scale.setScalar(cs); const bx = boss.position.x, bz = boss.position.z, home = new THREE.Vector3(origin.x, 0, origin.z);
    const heading = yaw - PI / 2;   // rolling toward -right, across the shot
    const park = new THREE.Vector3(bx, 0, bz).addScaledVector(right, .6 * S), enter0 = park.clone().addScaledVector(right, 9 * S);
    cart.position.copy(enter0); cart.rotation.set(0, heading, 0);
    const seatW = new THREE.Vector3(), seat = () => { cart.updateMatrixWorld(true); return seatW.copy(C.seat).applyMatrix4(cart.matrixWorld); };
    const roll = (d) => { for (const w of C.wheels) w.rotation.x += d / (.12 * cs); };
    const from = new THREE.Vector3(), prev = new THREE.Vector3(); let a0 = 0, r0 = 0, h0 = 0, emitT = 0, ballV = null;
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    return [
      { name: 'cart', dur: 1.8, line: ['td_walton_ride', 'Ooh, a ride in my cart!', .8], enter() { bossStand(bx, bz); B.play('idle'); anchorBubble(null, 1.05 * S); }, onLine() { B.play('cheer'); },
        tick(k, t, dt) { prev.copy(cart.position); cart.position.lerpVectors(enter0, park, easeOut(k)); roll(prev.distanceTo(cart.position)); cart.rotation.z = .03 * Math.sin(t * 17) * (1 - k); frame(bx + right.x * 1.5 * S, 1.4 * S, bz + right.z * 1.5 * S, 8 * S, 2.3 * S, .6 * S); } },
      { name: 'hop', dur: 1.0, enter() { say(null); from.copy(boss.position); B.play('run'); },
        tick(k) { arc(boss.position, from, seat(), easeInOut(k), 1.4 * S); boss.rotation.y = yaw - .6 * k; frame(bx + right.x * 1.5 * S, 1.6 * S, bz + right.z * 1.5 * S, 8 * S, 2.4 * S, .8 * S); } },
      { name: 'roll', dur: 2.8, line: ['td_walton_brakes', 'Where are the brakes?!', .3], enter() { B.play('dizzy'); anchorBubble(null, 1.05 * S); a0 = Math.atan2(cart.position.z - home.z, cart.position.x - home.x); r0 = Math.hypot(cart.position.x - home.x, cart.position.z - home.z); h0 = cart.rotation.y; emitT = 0;
          // a bit over a lap, ending on the far side of the pile so the tip-over and his flight back face the camera
          const aEnd = Math.atan2(-fwd.z, -fwd.x); this.sweep = ((a0 - aEnd) % (PI * 2) + PI * 2) % (PI * 2) + PI * 2; },
        tick(k, t, dt) { const a = a0 - this.sweep * easeIn(k), r = lerp(r0, 4.6 * S, smooth(k, 0, .35)); prev.copy(cart.position); cart.position.set(home.x + Math.cos(a) * r, 0, home.z + Math.sin(a) * r);
          const want = Math.atan2(Math.sin(a), -Math.cos(a)); cart.rotation.y = h0 + wrap(want - h0) * smooth(k, 0, .15); cart.rotation.z = .28 * Math.sin(t * 6) * k; roll(prev.distanceTo(cart.position));
          boss.position.copy(seat()); boss.position.y += .1 * S * Math.abs(Math.sin(t * 15)); boss.rotation.set(0, cart.rotation.y, cart.rotation.z);
          emitT -= dt; if (emitT <= 0 && k > .2) { emitT = lerp(.18, .06, k); tB.copy(seat()); tB.y += 1.0 * S; const hx = Math.sin(cart.rotation.y), hz = Math.cos(cart.rotation.y); debris.emit(tB, -hx * 2 + rnd(-1, 1), rnd(2.5, 4.5), -hz * 2 + rnd(-1, 1)); }
          cam.pos.copy(origin).addScaledVector(fwd, 9 * S).addScaledVector(right, 2 * S); cam.pos.y = 5 * S; cam.look.set(origin.x, .8 * S, origin.z); } },
      { name: 'tip', dur: 1.4, enter() { say(null); from.copy(seat()); cart.rotation.z = 0; B.play('fall', { fade: .05 }); onShake(.8); tB.copy(from); tB.y += .8 * S;
          for (const c of [0xf2c230, 0xfff1d6]) spawnBurst(scene, tB, c, 24); rainMoney(debris, tB, 16, 5, 3.5);
          const b = C.ball; b.getWorldPosition(tA); scene.attach(b); added.push(b); const hx = Math.sin(cart.rotation.y), hz = Math.cos(cart.rotation.y); ballV = new THREE.Vector3(hx * 3.5, 4, hz * 3.5); },
        tick(k, t, dt) { cart.rotation.x = 1.25 * easeOut(Math.min(1, k * 2.2)) - .12 * Math.sin(Math.min(1, k * 2.2) * PI); arc(boss.position, from, home, k, 3.8 * S); boss.rotation.set(k * PI * 2.2, yaw, 0);
          const b = C.ball; ballV.y -= 10 * dt; b.position.addScaledVector(ballV, dt); b.rotation.z += dt * 9; if (b.position.y < .17 * S && ballV.y < 0) { b.position.y = .17 * S; ballV.y = -ballV.y * .5; ballV.x *= .7; ballV.z *= .7; }
          cam.pos.copy(origin).addScaledVector(fwd, 8.5 * S).addScaledVector(right, 2.2 * S); cam.pos.y = 3.6 * S; cam.look.copy(from).lerp(home, .5); cam.look.y = 1.4 * S; } },
      landing(puffs, ['td_walton_cleanup', '...Clean-up in aisle five.', .2], { tick: (k, t, dt) => { const b = C.ball; if (!ballV) return; ballV.y -= 10 * dt; b.position.addScaledVector(ballV, dt); if (b.position.y < .17 * S) { b.position.y = .17 * S; ballV.y = Math.abs(ballV.y) * .5; ballV.x *= .7; ballV.z *= .7; } } }),
    ];
  }

  // ---------- Bloomberg: VOTE FOR ME through a giant megaphone, a big-entrance confetti cannon, money confetti, back down with one win ----------
  // (story: more than $1 billion of his own money in about 100 days, and he won only American Samoa, ABC News 2020-04-21)
  function starTex() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#d7262c'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#ffffff'; for (let i = 0; i < 8; i++) { const cx = 32 + i * 64, cy = i % 2 ? 80 : 176; g.beginPath(); for (let j = 0; j < 10; j++) { const r = j % 2 ? 11 : 26, a = -PI / 2 + j * PI / 5; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function makeMegaphone() {
    const g = new THREE.Group(); const horn = new THREE.Mesh(new THREE.CylinderGeometry(.42, .13, .95, 22, 1, true), std(0xf4f4f0, { side: THREE.DoubleSide, roughness: .4 })); horn.rotation.x = PI / 2; horn.position.z = .48; g.add(horn);
    const band = new THREE.Mesh(new THREE.TorusGeometry(.42, .045, 8, 28), std(0x2d6fd3)); band.position.z = .95; g.add(band);
    const mouth = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .16, 14), std(0xd7262c)); mouth.rotation.x = PI / 2; mouth.position.z = -.04; g.add(mouth);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(.09, .32, .12), std(0x1d1f24)); grip.position.set(0, -.22, .25); g.add(grip);
    g.traverse(m => { if (m.isMesh) m.castShadow = true; }); return g;
  }
  function makeCannon() {
    const g = new THREE.Group(); const gold = std(0xf2c230, { roughness: .3, metalness: .6 }), wood = std(0x6b3f1f), dark = std(0x1d1f24);
    const tilt = new THREE.Group(); tilt.position.y = .9; g.add(tilt);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.8, .95, 3.0, 26), std(0xffffff, { map: starTex(), roughness: .45 })); barrel.position.y = 1.2; tilt.add(barrel);
    for (const y of [-.25, 1.2, 2.62]) { const b = new THREE.Mesh(new THREE.TorusGeometry(y > 2 ? .83 : y < 0 ? .97 : .9, .07, 8, 30), gold); b.rotation.x = PI / 2; b.position.y = y; tilt.add(b); }
    const hole = new THREE.Mesh(new THREE.CircleGeometry(.74, 24), dark); hole.rotation.x = -PI / 2; hole.position.y = 2.705; tilt.add(hole);
    for (const sx of [-1, 1]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(.85, .85, .2, 24), wood); wh.rotation.z = PI / 2; wh.position.set(sx * 1.08, .85, 0); g.add(wh); const hub = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .26, 12), gold); hub.rotation.z = PI / 2; hub.position.copy(wh.position); g.add(hub); }
    tilt.rotation.x = -.3;   // the muzzle points up and a little away from the camera
    g.traverse(m => { if (m.isMesh) m.castShadow = true; }); g.userData = { tilt, muzzle: new THREE.Vector3(0, 2.8, 0) }; return g;
  }
  function bloomberg() {
    const puffs = makePuffs(60, scene), debris = makeDebris(40, scene, S); pools.push(puffs, debris);
    const mega = add(makeMegaphone()); mega.scale.setScalar(S); const cannon = add(makeCannon()), Cn = cannon.userData; const bx = boss.position.x, bz = boss.position.z;
    const spot = new THREE.Vector3(bx, 0, bz).addScaledVector(right, 2.6 * S); cannon.scale.setScalar(S * .85); cannon.position.copy(spot).setY(14); cannon.rotation.y = yaw; cannon.visible = false;
    const turn = yaw + 1.0, dir = new THREE.Vector3(Math.sin(turn), 0, Math.cos(turn));   // he turns a little so the megaphone doesn't hide his face
    const rings = []; for (let i = 0; i < 4; i++) { const r = add(new THREE.Mesh(new THREE.TorusGeometry(.5, .05, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }))); r.visible = false; rings.push({ r, age: 9 }); }
    let ringT = 0, ringN = 0, emitT = 0; const from = new THREE.Vector3(), mouth = new THREE.Vector3(), muzzle = new THREE.Vector3(), top = new THREE.Vector3(), shot = new THREE.Vector3();
    const muzzleAt = out => { cannon.updateMatrixWorld(true); return out.copy(Cn.muzzle).applyMatrix4(Cn.tilt.matrixWorld); };
    const CONF = [0xd7262c, 0x2d6fd3, 0xffffff, 0xf2c230];
    const confettiRain = (dt, every) => { emitT -= dt; while (emitT <= 0) { emitT += every; tB.set(origin.x + rnd(-4, 4) * S, 9 * S, origin.z + rnd(-4, 4) * S); debris.emit(tB, rnd(-.5, .5), rnd(-1, 0), rnd(-.5, .5)); if (Math.random() < .4) spawnBurst(scene, tB, CONF[Math.floor(rnd(0, 3.99))], 10); } };
    return [
      { name: 'speech', dur: 2.4, line: ['td_bloomberg_vote', 'Vote for me! Vote for me!', .3], enter() { bossStand(bx, bz); B.play('laugh'); anchorBubble(null, 1.2 * S); },
        tick(k, t, dt) { boss.rotation.y = turn; B.head.getWorldPosition(mouth); mouth.y -= .12 * S; mega.position.copy(mouth).addScaledVector(dir, .3 * S); mega.rotation.set(-.1 + .05 * Math.sin(t * 9), turn, 0);
          ringT -= dt; if (ringT <= 0 && t > .3) { ringT = .3; const R = rings[ringN++ % rings.length]; R.age = 0; R.r.visible = true; }
          for (const R of rings) { if (!R.r.visible) continue; R.age += dt; const u = R.age / .9; if (u >= 1) { R.r.visible = false; continue; } R.r.position.copy(mega.position).addScaledVector(dir, (.9 + u * 1.6) * S); R.r.rotation.set(0, turn, 0); R.r.scale.setScalar(S * (.9 + u * 1.1)); R.r.material.opacity = .85 * (1 - u); }
          frame(bx, 1.5 * S, bz, 7 * S, 1.9 * S, .5 * S, .1); } },
      { name: 'cannon', dur: 1.5, line: ['td_bloomberg_big', 'Time for a big entrance!', .9], enter() { cannon.visible = true; mega.visible = false; for (const R of rings) R.r.visible = false; B.play('idle'); boss.rotation.y = yaw; this.thud = false; say(null); },
        tick(k) { const e = easeIn(Math.min(1, k / .55)); cannon.position.y = 14 * (1 - e); if (k >= .55 && !this.thud) { this.thud = true; onShake(.5); dustRing(puffs, spot.x, spot.z, 10, .9 * S); B.play('cheer'); }
          const sq = this.thud ? Math.max(0, 1 - (k - .55) / .2) * .12 : 0; cannon.scale.set(S * .85 * (1 + sq), S * .85 * (1 - sq), S * .85 * (1 + sq)); frame((bx + spot.x) / 2, 1.6 * S, (bz + spot.z) / 2, 9 * S, 2.4 * S, .9 * S); } },
      { name: 'climb', dur: 1.1, enter() { say(null); from.copy(boss.position); cannon.scale.setScalar(S * .85); cannon.position.copy(spot); B.play('run'); muzzleAt(top); },
        tick(k) { const e = easeInOut(k); arc(boss.position, from, top, e, 2.2 * S); tA.copy(top).sub(from); boss.rotation.set(1.2 * Math.max(0, (k - .5) / .5), Math.atan2(tA.x, tA.z), 0);
          boss.scale.setScalar(S * (k > .8 ? Math.max(.05, 1 - (k - .8) / .2) : 1)); boss.visible = k < .98; frame(spot.x, 2.2 * S, spot.z, 9.5 * S, 2.6 * S, 1.2 * S, .3); } },
      { name: 'fuse', dur: 1.3, enter() { boss.visible = false; emitT = 0; },
        tick(k, t, dt) { const j = .06 * S * k; cannon.position.set(spot.x + j * Math.sin(t * 50), 0, spot.z + j * Math.cos(t * 43)); Cn.tilt.rotation.x = -.3 + .03 * Math.sin(t * 37) * k;
          emitT -= dt; if (emitT <= 0) { emitT = .12; tB.copy(spot).addScaledVector(fwd, -1.1 * S); tB.y = .9 * S; spawnBurst(scene, tB, 0xffb020, 6); } onShake(.1 * k); frame(spot.x, 2.0 * S, spot.z, 9 * S, 2.4 * S, 1.3 * S, .3); } },
      { name: 'boom', dur: 2.6, enter() { cannon.position.copy(spot); Cn.tilt.rotation.x = -.3; muzzleAt(shot); boss.visible = true; boss.scale.setScalar(S); boss.position.copy(shot); boss.rotation.set(0, yaw, 0); B.play('fall', { fade: .05 }); onShake(1.2); emitT = .6;
          for (const c of CONF) spawnBurst(scene, shot, c, 30); for (let i = 0; i < 10; i++) puffs.emit(shot, rnd(-2, 2), rnd(1, 4), rnd(-2, 2), 1.5 * S, 1.2, 0xe8e8e8, 1.8, .9); rainMoney(debris, shot, 14, 6, 3); },
        tick(k, t, dt) { boss.position.copy(shot).addScaledVector(fwd, -1.2 * t * S); boss.position.y = shot.y + 16 * t * S; boss.rotation.x = t * 9; boss.visible = boss.position.y < 16 * S;
          cannon.position.copy(spot).addScaledVector(fwd, .5 * S * Math.sin(Math.min(1, t / .5) * PI)); Cn.tilt.rotation.x = -.3 - .15 * Math.max(0, 1 - t / .4);
          if (t > .6) confettiRain(dt, .07);
          cam.pos.copy(origin).addScaledVector(fwd, 9 * S).addScaledVector(right, 2.5 * S); cam.pos.y = 3 * S; cam.look.set(lerp(spot.x, origin.x, k), lerp(4 * S, 2.2 * S, easeInOut(k)), lerp(spot.z, origin.z, k)); } },
      { name: 'plop', dur: .8, enter() { boss.visible = true; boss.position.set(origin.x, 12 * S, origin.z); boss.rotation.set(0, yaw, 0); },
        tick(k, t, dt) { boss.position.y = lerp(12 * S, 0, easeIn(k)); boss.rotation.x = k * PI * 2; confettiRain(dt, .12); frame(origin.x, (.9 + 2 * (1 - k)) * S, origin.z, 9 * S, 2 * S, .6 * S); } },
      landing(puffs, ['td_bloomberg_one', '...I won one place!', .2]),
    ];
  }

  const BUILD = { trump, bezos, musk, ellison, zuckerberg, page, walton, bloomberg };
  return T;
}
