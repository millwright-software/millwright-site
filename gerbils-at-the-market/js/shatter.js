// shatter.js — the giant's heap of money bags gets knocked apart (Eric: "knock their piles apart, and they break apart into
// large blocks and then eventually smaller blocks until everybody can have Legos"). A ~9 s set piece in three stages, driven
// only by update(dt) on a timeline (no timers, so it can be pre-rolled or skipped). It plays in slow motion at SLOW (0.6x,
// so ~15 s on the clock; Eric 10/31: slow enough that a kid can follow the boxes); the stage times below are story time:
//
//   stage 1  burst  0–2.5 s   the heap (hidden at start) bursts into ~48 big blocks, burlap-brown, that flash to Lego colours
//                             as they tumble outward and bounce
//   stage 2  split  2.5–5 s   each big block splits into 8 small cubes (≤ 400) that scatter further and bounce
//   stage 3  river  5–9 s     the small cubes pop into Lego set boxes (0.3 m, one box = one Lego set) and stream in a happy
//                             river along roadDir past the player toward town, bobbing, shrinking away once 40 m down the road
//
//   const sh = createShatter({ scene, sfx, spawnBurst, toast });
//   sh.start({ heap, center, radius, count, roadDir, player, onDone, restoreHeap, bagSets, toast: { text }, slow });   // world coords
//   count 0 = ring mode (the market's 15 bags round the pile); toast.text overrides the river's line ('Legos for everybody!', never a count); slow overrides SLOW
//   each frame: sh.update(dt); const c = sh.cameraTarget(); camera.position.lerp(c.pos, k); camera.lookAt(c.look);
//   sh.active; sh.skip() ends it at once (onDone once); sh.dispose() removes everything.
//
// Instancing only: three InstancedMeshes (big blocks, small cubes, Lego boxes), Float32Array state, scratch vectors at module
// scope, nothing allocated per frame except the confetti bursts at the three beats (spawnBurst is the game's own).
import * as THREE from 'three';
import { legoBoxTexture } from './parts.js';

export const TIMELINE = { burst: 0, split: 2.5, river: 5, end: 9 };
const N_BIG = 48, N_BIG_RING = 16, MAX_SMALL = 400, BOX = .3, BAG_SETS = 21.7e6, G = 9.8;
const BURLAP = 0x9c6a3a, FLASH = 0xfff6d0, LEGO = [0xd7262c, 0xf2c230, 0x2d6fd3, 0x3b8f4a, 0xf4f4f4, 0xe07a2a];
const FADE_FROM = 34, FADE_AT = 40;              // metres down the road from the heap's centre: boxes shrink between these and are gone past the second
const RIVER_SPEED = 14, RIVER_HALF_WIDTH = 2.4, DEPART_SPREAD = 1.2;
const SLOW = .6;                                   // story seconds per clock second: 9 s of story takes 15 s
const TOAST_MS = 7000;                             // the river's line stays up long enough to be read and heard
// per-body state, one Float32Array per pool: position, velocity, euler, spin, size, colour index, flash time / depart time, lane, phase
const S = 16, X = 0, Y = 1, Z = 2, VX = 3, VY = 4, VZ = 5, RX = 6, RY = 7, RZ = 8, WX = 9, WY = 10, WZ = 11, SIZE = 12, COL = 13, T0 = 14, LANE = 15;

const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color(), _c2 = new THREE.Color();
const _side = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const rnd = (a, b) => a + Math.random() * (b - a);

export function createShatter(ctx) {
  const { scene, sfx, spawnBurst, toast } = ctx;
  const Sh = { get active() { return active; }, get done() { return finished; }, get t() { return t; }, start, update, cameraTarget, skip, dispose };
  let active = false, finished = false, t = 0, onDone = null, heap = null, restoreHeap = false;
  const center = new THREE.Vector3(), roadDir = new THREE.Vector3(-1, 0, 0), playerPos = new THREE.Vector3(); let player = null, R = 6, count = 0, bagSets = BAG_SETS, ring = false;
  let big = null, small = null, boxes = null, nBig = 0, nSmall = 0, bigS = null, smallS = null, boxS = null, sizeK = 1;
  let splitDone = false, riverDone = false, bonked = false, deliverStep = 0, nextDeliver = 0, slow = SLOW, toastLine = null;
  const disposables = []; const D = o => { disposables.push(o); return o; };
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camA = new THREE.Vector3(), camB = new THREE.Vector3();

  // ---------- start: hide the heap, build the three pools, throw the big blocks ----------
  function start(opts) {
    if (big) dispose(); onDone = opts.onDone || null; heap = opts.heap || null; restoreHeap = !!opts.restoreHeap; active = true; finished = false; t = 0; slow = opts.slow > 0 ? opts.slow : SLOW; toastLine = opts.toast || null;
    splitDone = riverDone = bonked = false; deliverStep = 0; nextDeliver = TIMELINE.river + .4;
    center.copy(opts.center); R = Math.max(.8, opts.radius || 1.1); count = opts.count || 0; ring = count === 0; bagSets = opts.bagSets || BAG_SETS; player = opts.player || null;
    roadDir.copy(opts.roadDir || _a.set(-1, 0, 0)); roadDir.y = 0; if (roadDir.lengthSq() < 1e-6) roadDir.set(-1, 0, 0); roadDir.normalize(); _side.crossVectors(_up, roadDir).normalize();
    if (player) playerPos.copy(player.position); else playerPos.copy(center).addScaledVector(roadDir, R + 10);
    if (heap) heap.visible = false;
    sizeK = ring ? .8 : clamp(R / 6, 1, 2.5);    // the brief's 1–2 m blocks at the test heap (R 6); bigger heaps (Bezos R≈10, Musk R≈18) throw bigger blocks so the burst still fills the shape
    nBig = ring ? N_BIG_RING : N_BIG; nSmall = Math.min(MAX_SMALL, nBig * 8);
    const cube = D(new THREE.BoxGeometry(1, 1, 1));
    big = new THREE.InstancedMesh(cube, D(new THREE.MeshStandardMaterial({ roughness: .8 })), nBig); big.castShadow = true; big.frustumCulled = false; scene.add(big);
    small = new THREE.InstancedMesh(cube, D(new THREE.MeshStandardMaterial({ roughness: .55 })), nSmall); small.castShadow = true; small.frustumCulled = false; small.count = 0; small.visible = false; scene.add(small);
    const tex = legoBoxTexture(1); if (!tex.userData?.shared) D(tex); boxes = new THREE.InstancedMesh(D(new THREE.BoxGeometry(BOX, BOX, BOX)), D(new THREE.MeshStandardMaterial({ map: tex, roughness: .6 })), nSmall); boxes.castShadow = true; boxes.frustumCulled = false; boxes.count = 0; boxes.visible = false; scene.add(boxes);
    bigS = new Float32Array(nBig * S); smallS = new Float32Array(nSmall * S); boxS = new Float32Array(nSmall * S);
    // the big blocks start inside the heap's cone (or round the ring) and fly out from its axis
    const H = ring ? .6 : R / .42 * .36; const outK = 1 + R / 12;
    for (let i = 0; i < nBig; i++) { const o = i * S, a = i / nBig * Math.PI * 2 + rnd(-.2, .2), y = ring ? .3 : rnd(.2, H * .9), rr = ring ? R : rnd(0, R * (1 - y / H) * .9), size = rnd(1, 2) * sizeK;
      bigS[o + X] = center.x + Math.cos(a) * rr; bigS[o + Y] = Math.max(size / 2, y); bigS[o + Z] = center.z + Math.sin(a) * rr;
      const sp = rnd(2.5, 6.5) * outK; bigS[o + VX] = Math.cos(a) * sp + rnd(-1, 1); bigS[o + VZ] = Math.sin(a) * sp + rnd(-1, 1); bigS[o + VY] = rnd(4, 8) + (ring ? 0 : y * .25);
      bigS[o + RX] = rnd(0, 6.28); bigS[o + RY] = rnd(0, 6.28); bigS[o + RZ] = rnd(0, 6.28); bigS[o + WX] = rnd(-4, 4); bigS[o + WY] = rnd(-4, 4); bigS[o + WZ] = rnd(-4, 4);
      bigS[o + SIZE] = size; bigS[o + COL] = Math.floor(Math.random() * LEGO.length); bigS[o + T0] = rnd(.45, 1.3); bigS[o + LANE] = 0;
      big.setColorAt(i, _c.set(BURLAP)); }
    big.instanceColor.needsUpdate = true; writePool(big, bigS, nBig, 1);
    sfx?.play?.('bonk'); spawnBurst?.(scene, _p.set(center.x, H * .5, center.z), 0xf2c230, 30); spawnBurst?.(scene, _p.set(center.x, H * .2, center.z), 0xffffff, 24);
    return Sh;
  }

  // ---------- physics: gravity, a ground bounce at half the body's height, a little spin ----------
  function fall(buf, n, dt, k) {
    for (let i = 0; i < n; i++) { const o = i * S, h = buf[o + SIZE] * k / 2;
      buf[o + VY] -= G * dt; buf[o + X] += buf[o + VX] * dt; buf[o + Y] += buf[o + VY] * dt; buf[o + Z] += buf[o + VZ] * dt;
      if (buf[o + Y] < h) { buf[o + Y] = h; if (buf[o + VY] < -1) { buf[o + VY] = -buf[o + VY] * .38; buf[o + VX] *= .75; buf[o + VZ] *= .75; buf[o + WX] *= .6; buf[o + WY] *= .6; buf[o + WZ] *= .6; } else { buf[o + VY] = 0; const f = Math.max(0, 1 - dt * 3); buf[o + VX] *= f; buf[o + VZ] *= f; buf[o + WX] *= f; buf[o + WY] *= f; buf[o + WZ] *= f; } }
      buf[o + RX] += buf[o + WX] * dt; buf[o + RY] += buf[o + WY] * dt; buf[o + RZ] += buf[o + WZ] * dt; }
  }
  function writePool(mesh, buf, n, k) {
    for (let i = 0; i < n; i++) { const o = i * S; _p.set(buf[o + X], buf[o + Y], buf[o + Z]); _e.set(buf[o + RX], buf[o + RY], buf[o + RZ]); _q.setFromEuler(_e); _s.setScalar(Math.max(.001, buf[o + SIZE] * k)); _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m); }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- stage 2: each big block becomes 8 small cubes at its octants, with its colour and a push outward ----------
  function split() {
    splitDone = true; small.count = nSmall; small.visible = true; big.visible = false; big.count = 0; const per = Math.max(1, Math.floor(nSmall / nBig)); let k = 0;
    for (let i = 0; i < nBig && k < nSmall; i++) { const o = i * S, sz = bigS[o + SIZE]; _e.set(bigS[o + RX], bigS[o + RY], bigS[o + RZ]); _q.setFromEuler(_e);
      for (let j = 0; j < per && k < nSmall; j++, k++) { const q = k * S; _v.set((j & 1 ? .5 : -.5) * sz, (j & 2 ? .5 : -.5) * sz, (j & 4 ? .5 : -.5) * sz).applyQuaternion(_q);
        smallS[q + X] = bigS[o + X] + _v.x * .5; smallS[q + Y] = Math.max(sz / 4, bigS[o + Y] + _v.y * .5); smallS[q + Z] = bigS[o + Z] + _v.z * .5;
        _a.set(_v.x, 0, _v.z).normalize(); const push = rnd(2, 5) * (1 + R / 12);
        smallS[q + VX] = bigS[o + VX] * .5 + _a.x * push + rnd(-1, 1); smallS[q + VZ] = bigS[o + VZ] * .5 + _a.z * push + rnd(-1, 1); smallS[q + VY] = rnd(3, 6.5);
        smallS[q + RX] = bigS[o + RX]; smallS[q + RY] = bigS[o + RY]; smallS[q + RZ] = bigS[o + RZ]; smallS[q + WX] = rnd(-6, 6); smallS[q + WY] = rnd(-6, 6); smallS[q + WZ] = rnd(-6, 6);
        smallS[q + SIZE] = sz; smallS[q + COL] = bigS[o + COL]; smallS[q + T0] = 0; smallS[q + LANE] = 0; small.setColorAt(k, _c.set(LEGO[bigS[o + COL]])); }
      if (i % 8 === 0 && spawnBurst) spawnBurst(scene, _p.set(bigS[o + X], bigS[o + Y], bigS[o + Z]), LEGO[bigS[o + COL]], 16); }
    small.instanceColor.needsUpdate = true; writePool(small, smallS, nSmall, .5); sfx?.play?.('bonk');
  }

  // ---------- stage 3: the small cubes pop into Lego boxes that stream to town ----------
  function river() {
    riverDone = true; boxes.count = nSmall; boxes.visible = true; small.visible = false; small.count = 0; const yaw = Math.atan2(roadDir.x, roadDir.z);
    for (let i = 0; i < nSmall; i++) { const o = i * S; boxS[o + X] = smallS[o + X]; boxS[o + Y] = BOX / 2; boxS[o + Z] = smallS[o + Z];
      boxS[o + VX] = boxS[o + VY] = boxS[o + VZ] = 0; boxS[o + RX] = 0; boxS[o + RY] = yaw + rnd(-.3, .3); boxS[o + RZ] = 0; boxS[o + WX] = rnd(0, 6.28); boxS[o + WY] = 0; boxS[o + WZ] = 0;   // WX holds the bob phase
      boxS[o + SIZE] = 1; boxS[o + COL] = smallS[o + COL]; boxS[o + T0] = TIMELINE.river + rnd(0, DEPART_SPREAD); boxS[o + LANE] = rnd(-RIVER_HALF_WIDTH, RIVER_HALF_WIDTH);
      if (i % 40 === 0 && spawnBurst) spawnBurst(scene, _p.set(smallS[o + X], smallS[o + Y] + .3, smallS[o + Z]), 0xffffff, 14); }
    writeBoxes();
    sfx?.play?.('win');
    toast?.(toastLine?.text || 'Legos for everybody!', { ms: TOAST_MS });   // round 3: no sub, no counts (the number rule)
  }
  function flowBoxes(dt) {
    const endK = 1 - smooth((t - (TIMELINE.end - .6)) / .6);    // everything still on the road shrinks away in the last .6 s
    for (let i = 0; i < nSmall; i++) { const o = i * S; const age = t - boxS[o + T0]; if (age < 0) { boxS[o + SIZE] = 0; continue; }
      _p.set(boxS[o + X] - playerPos.x, 0, boxS[o + Z] - playerPos.z); const lat = _p.dot(_side); const along = (boxS[o + X] - center.x) * roadDir.x + (boxS[o + Z] - center.z) * roadDir.z;
      const go = smooth(age / .8); const sp = RIVER_SPEED * go; const steer = (boxS[o + LANE] - lat) * clamp(go * 3, 0, 2.5);
      boxS[o + X] += (roadDir.x * sp + _side.x * steer) * dt; boxS[o + Z] += (roadDir.z * sp + _side.z * steer) * dt;
      boxS[o + Y] = BOX / 2 + go * Math.abs(Math.sin(t * 7 + boxS[o + WX])) * .35; boxS[o + RZ] = Math.sin(t * 7 + boxS[o + WX]) * .18 * go;
      const pop = age < .5 ? easeOutBack(age / .5) : 1, far = 1 - smooth((along - FADE_FROM) / (FADE_AT - FADE_FROM)); boxS[o + SIZE] = pop * far * endK; }
    writeBoxes();
  }
  function writeBoxes() {
    for (let i = 0; i < nSmall; i++) { const o = i * S; _p.set(boxS[o + X], boxS[o + Y], boxS[o + Z]); _e.set(boxS[o + RX], boxS[o + RY], boxS[o + RZ]); _q.setFromEuler(_e); _s.setScalar(Math.max(.001, boxS[o + SIZE])); _m.compose(_p, _q, _s); boxes.setMatrixAt(i, _m); }
    boxes.instanceMatrix.needsUpdate = true;
  }

  // ---------- update ----------
  function update(dt) {
    if (!active || finished) return; dt = Math.min(dt, .05) * slow; t += dt; if (player) playerPos.copy(player.position);
    if (t < TIMELINE.split) {
      fall(bigS, nBig, dt, 1); writePool(big, bigS, nBig, 1);
      if (t < 1.8) { for (let i = 0; i < nBig; i++) { const o = i * S, f = t - bigS[o + T0]; if (f < 0) _c.set(BURLAP); else if (f < .12) _c.set(FLASH); else _c.set(LEGO[bigS[o + COL]]).lerp(_c2.set(FLASH), Math.max(0, 1 - (f - .12) / .25)); big.setColorAt(i, _c); } big.instanceColor.needsUpdate = true; }
      if (!bonked && t > .8) { bonked = true; sfx?.play?.('bonk'); }
    } else if (t < TIMELINE.river) {
      if (!splitDone) split(); fall(smallS, nSmall, dt, .5); writePool(small, smallS, nSmall, .5);
    } else {
      if (!splitDone) split(); if (!riverDone) river(); flowBoxes(dt);
      if (t >= nextDeliver && deliverStep < 5) { sfx?.play?.('deliver', { step: deliverStep++ }); nextDeliver += .55; }
      if (t >= TIMELINE.end) finish();
    }
  }
  function finish() { if (finished) return; finished = true; active = false; if (big) big.visible = false; if (small) small.visible = false; if (boxes) boxes.visible = false; const cb = onDone; onDone = null; cb?.(); }
  function skip() { if (!active || finished) return; t = Math.max(t, TIMELINE.end); finish(); }

  // ---------- the camera: a wide shot on the heap and the player for the burst and the split, then low along the river ----------
  function cameraTarget() {
    // shot A: from the side of the road, high and back, on a point between the heap and the player
    camA.copy(center).lerp(playerPos, .35); camB.copy(camA); camB.y += R * .25;
    camA.addScaledVector(_side, R * 2.2 + 8); camA.y += R * .9 + 4; camA.addScaledVector(roadDir, R * .15);
    const u = smooth((t - (TIMELINE.river - .7)) / 1.6);
    if (u > 0) {   // shot B: behind the player, low, looking down the road the boxes run along
      _a.copy(playerPos).addScaledVector(roadDir, -(R * .5 + 7)).addScaledVector(_side, 4.5); _a.y += 3.0;
      _b.copy(playerPos).addScaledVector(roadDir, 9); _b.y += .6;
      camA.lerp(_a, u); camB.lerp(_b, u); }
    camPos.copy(camA); camLook.copy(camB); camPos.x += Math.sin(t * .4) * .2; camPos.y += Math.sin(t * .6 + 1) * .08;
    return { pos: camPos, look: camLook };
  }

  function dispose() {
    for (const m of [big, small, boxes]) if (m) { scene.remove(m); m.dispose(); }
    for (const d of disposables) { d.map?.dispose?.(); d.dispose?.(); } disposables.length = 0;
    if (heap && restoreHeap) heap.visible = true;
    big = small = boxes = null; bigS = smallS = boxS = null; heap = null; player = null; active = false; onDone = null;
  }
  return Sh;
}
