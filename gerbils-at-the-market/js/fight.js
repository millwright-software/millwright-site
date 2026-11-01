// The fight: a giant bearded gerbil on his pile of money bags. Bricks knock bags loose, cheeks carry them to THE JAR (the share
// he skipped), and every bag in the jar lights one shared thing (school, lamp, fountain, road, bell). At 15 carrying stops and
// the camera pulls back: "Look how much he still has." Then the takedown and the shatter, and straight on to the Long Road.
// No dying, no timer, no end card, no ending choices (round 3, 10/31).
//
// CONTRACT with main.js (round 3, 10/31):
//   F.focus        the arena jar {x, z} while carrying, the pile while the cheeks are empty, null when done
//   F.delivered, F.need (=15)   the goal line's count
//   F.cinematic    true from the 15th bag (pull-back, takedown, shatter) until ctx.onEnd; F.skipCinematic() jumps to ctx.onEnd
//   F.cameraTarget()  {pos, look} while fight owns the camera (the pull-back at 15), null otherwise (main checks it first)
//   F.cameraBoxes()   THREE.Box3[] world: the two stalls, the jar stand, the place's facade when places.js exposes one
//   ctx.onEnd(stop, { grown, grownUSD, playSeconds })   grown = bags his heap grew in real time (fractional), grownUSD the dollars,
//                  playSeconds the live play time; no card in between
//   ctx.ordinary   data.ordinary (the teacher, for the Musk line); ctx.asking?.() a card is up (growth pauses)
//   ctx.aWord?.()  the written word for the A button ('Space' on a keyboard); ctx.looking?.() pauses the opening and growth
// Radii (E scales the player ~1.5x; F retunes these after): DELIVER_R, GRAB_R, PICKUP_R, the boss's CHASE_* and BUMP_*.
import * as THREE from 'three';
import { createTrail } from './trail.js';
import { openTrick } from './tricks.js';
import { textSprite, spawnBurst } from './parts.js';
import { makeBag, makeStall, makeBrick } from './props.js';
import * as Props from './props.js';   // round-3 factories (makeSharedThing) are read with ?. and a fallback
import { makeJar } from './prologue.js';
import { makeBoss } from './bosses.js';
import { loadBosses2, makeBoss2 } from './bosses2.js';
let bosses2Ready = false; loadBosses2().then(ok => { bosses2Ready = !!ok; }).catch(() => { bosses2Ready = false; });
import { createTakedown } from './takedowns.js';
import { createShatter } from './shatter.js';
import { createCity } from './city.js';
import { createPlace } from './places.js';
import { gerbilFrom } from './parts.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export const BAG_SETS = 21.7e6;   // Lego sets in one bag: Trump's $6.5B is 15 bags; the market needs 15

// Bricks (son's request 10/30: farther): aimed at the boss inside AIM_R on a solved arc that leads him; otherwise straight ahead.
const GRAV = 5;            // brick gravity, m/s^2 (was 9): a flatter arc
const AIM_R = 40;          // auto-aim range at the boss, m (was 22)
const VH_MIN = 14, VH_MAX = 26, VH_PER_M = 1.3;   // aimed horizontal speed: 1.3 x distance, clamped (was max(8, 1.1 d))
const FREE_V = 18, FREE_VY = 2.2;                 // un-aimed throw: ~17 m before the bounce (was 10 / 2.5, ~6 m)
const BRICK_LIFE = 4;      // s (was 3)
// The stun (son's request 10/30: stunned for several seconds): one dizzy state for brick hits and the trick card.
const STUN_HIT = 3.5, STUN_ADD = 1.2, STUN_CAP = 6, STUN_TRICK = 8, RECOVER = .6;
const BOSS_CARRY = 2;      // bags he can carry back to the pile on his head
// A fair boss (plan B): he walks slower than she does, chases only briefly, and bumps at most once per chase.
const BOSS_WALK = 1.5;     // m/s, going for loose bags or circling the pile (was 1.9)
const CHASE_V = 1.3, CHASE_START_M = 5, CHASE_MAX_S = 3, CHASE_GIVEUP_M = 6, CHASE_REST_S = 3;   // chase speed, start range, give up after 3 s or past 6 m, then rest
const BUMP_R = 1.4, BUMP_COOLDOWN_S = 5, BUMP_STALL_SAFE = 3;   // one bump per chase, 5 s apart, never within 3 m of a stall
// Easy for kids (plan B): generous reach. E scales the player ~1.5x and F retunes after.
const DELIVER_R = 3.5;     // m from the jar's centre (was a stall's)
const GRAB_R = 1.7;        // m from a pile bag (was 1.1, then 1.45; F scaled it for the 1.5x player)
const PICKUP_R = 1.4;      // F: 1.2 before the 1.5x player; loose bags inside this are picked up at once (was .75); MAGNET_R pulls them in
const MAGNET_R = 2.0;
const ARENA_Z = 9;         // the arena's edge: |z| <= 9, x from pile.x - 16 to past the heap
// The stalls, pile-local, all in front of the fixed camera (it looks up the road, +x) and clear of the heap. Round 3: the
// middle slot (places.js keeps it clear) holds the jar; the other two stalls are scenery only.
const STALL_AT = [[-3, -5.5], [2, 5.5], [7, -5.5]];
const JAR_AT = STALL_AT[1], JAR_SCALE = 1.5, PLINTH_H = .22;
// The 15 shared things: an arc behind the jar (as the camera sees it, +x), just outside the delivery ring.
const SHARED_KINDS = ['school', 'lamp', 'fountain', 'road', 'bell'];
const SHARED_R = 4.2;                                  // m from the jar: DELIVER_R + .7, so none stands inside the ring
const SHARED_A0 = -1.25, SHARED_A1 = 1.75;             // radians from +x: from the pile side round to the arena's far edge
const SHARED_H = 1.7, SHARED_W = .95;                  // each one fitted into this height and width
const PULL_S = 4;                                      // the pull-back at 15 takes this long
const LOOK_LINE = 'Look how much he still has.';
const ALL_LINE = "That was his whole pile. Even the smallest one had a whole street's worth.";   // (integrate) Trump's heap is 15 bags: nothing is left to look at
const NUMW = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
// takedowns.js builds a finisher for each of these; any other boss borrows Bezos's delivery box.
const TAKEDOWN_IDS = ['trump', 'bezos', 'musk', 'ellison', 'zuckerberg', 'page', 'walton', 'bloomberg'], TAKEDOWN_LIKE = {};
const takedownFor = id => TAKEDOWN_IDS.includes(id) ? id : TAKEDOWN_LIKE[id] || 'bezos';
// The heap grows while you play, in REAL time (round 3): gain.usd_per_day / 86400 dollars each live second, and one bag on
// the heap only when the total passes a whole bag. Honest and silent: no counter, no sign. Musk's level says it once, at 15.
const GROW_ROOM_S = 7200;
const GROWS = new Set(['musk']);     // heap room pre-allocated for two hours of real-time growth
const _camP = new THREE.Vector3(), _camL = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _bossPrev = new THREE.Vector3(), _bossVel = new THREE.Vector3();

export function createFight(ctx) {
  const { scene, player, state, save, card, closeCard, toast, hud, shuffle, sfx, juice } = ctx;
  const F = { active: false, stop: null, done: false };
  const aWord = () => ctx.aWord?.() || 'Space';
  const looking = () => !!ctx.looking?.();
  let cin = false, told = {}, trail = null, trailT = 0, pouchTold = false;
  Object.defineProperty(F, 'cinematic', { get: () => cin });
  const takedown = createTakedown({ scene, spawnBurst, textSprite, play: ctx.play, toast, onShake: a => ctx.juice?.shake(a) }); F.takedown = takedown;
  const shatter = createShatter({ scene, sfx: ctx.sfx, spawnBurst, toast }); F.shatter = shatter;
  const city = createCity({ scene, hamsterReady: true, gerbilFrom, spawnBurst, sfx: ctx.sfx }); F.city = city;
  const place = createPlace({ scene }); F.place = place;
  let group, boss, bags, bricks, stalls, pile, stunned, popCount, lastDrop, bagSets, recoverT = 0, dizzyVoiced = false, bossBags = [];
  let jar = null, jarStand = null, jarSpot = new THREE.Vector3(), shared = [], delivered = 0, pull = null, label = null;
  F.jarSpot = jarSpot;   // main.js frames the heist's opening shot on the pile and the jar
  // (verify) the pile's name label is its own canvas texture and material: freed with the level (the shared sprite materials
  // of the paper props are cached in props.js and never come through here, since only this label is disposed by name)
  function freeLabel() { if (!label) return; label.parent?.remove(label); label.material?.map?.dispose?.(); label.material?.dispose?.(); label = null; }
  const displayName = () => F.stop?.boss?.display_name || F.stop?.boss?.name || '';
  // The gerbil's cheeks: P.carrying (count), P.carried (the bags), and her timers P.grabT / P.deliverT / P.lastShot.
  const P = { group: player, carrying: 0, carried: [] };
  const carryingAny = () => P.carrying > 0;
  let grow = null;   // { perDay, bagUSD, cap, slot() } while his heap grows
  const STALL_DEFS = [
    { id: 'lego', name: 'Lego store', color: 0xd7262c, line: 'Free Legos for everyone' },
    { id: 'cars', name: 'Car store', color: 0x2d6fd3, line: 'Free cars for everyone' },
    { id: 'house', name: 'House with stairs', color: 0x3b8f4a, line: 'A house with stairs for everyone' },
  ];

  F.start = stop => {
    F.active = true; F.done = false; F.aborted = false; F.stop = stop; group = new THREE.Group(); scene.add(group);
    bags = []; bricks = []; stalls = []; shared = []; delivered = 0; pull = null; F.grown = 0; F.grownUSD = 0; F.playSeconds = 0; F.ended = false; stunned = 0; popCount = 0; lastDrop = 0; recoverT = 0;
    emptyCheeks(P); dizzyVoiced = false; bossBags = []; F.bonked = false; cin = false; told = {}; F.introPending = true; F.firstDelivery = false; F.endShown = false; F.saved = false; F.chasing = false; F.chaseT = 0; F.chaseRest = 0; F.bumped = false; F.grabbed = false;
    F.pouch = Object.values(state.friends || {}).some(list => (list || []).some(f => /builder/i.test(f))) ? 5 : 3;
    const x0 = stop.x; pile = new THREE.Vector3(x0 - 9, 0, 0);
    const N = 15; bagSets = BAG_SETS; const total = Math.max(15, Math.round(stop.sets / BAG_SETS)); F.total = total;
    // the pile: rings of bags
    let i = 0; for (let ring = 0; i < N; ring++) { const count = ring === 0 ? 1 : ring * 6; for (let k = 0; k < count && i < N; k++, i++) {
      const a = k / count * Math.PI * 2, r = ring * .55; const b = makeBag(1); b.position.set(pile.x + Math.cos(a) * r, 0, pile.z + Math.sin(a) * r); b.rotation.y = a; group.add(b);
      bags.push({ mesh: b, state: 'pile', home: b.position.clone(), v: new THREE.Vector3() }); } }
    let R = 0; F.heap = null; F.heapCenter = pile.clone(); F.heapR = 1.2;
    const perDay = Number(stop.boss.gain?.usd_per_day) || 0, bagUSD = ctx.bagUSD || BAG_SETS * 20;
    // (verify) real-time growth is Musk's level only (decision 2c and the plan's table); Bezos and Page grew with no line to say why
    const growCap = perDay > 0 && GROWS.has(stop.id) ? Math.min(20000, Math.ceil(perDay * GROW_ROOM_S / 86400 / bagUSD) + 1) : 0;
    grow = null;
    if (total > N || growCap > 0) { // the rest of his pile, as a heap behind the ring (and the room it grows into while you play)
      const sack = new THREE.SphereGeometry(.22, 8, 6); sack.scale(1, 1.15, 1); sack.translate(0, .24, 0); const neck = new THREE.CylinderGeometry(.06, .1, .12, 6); neck.translate(0, .5, 0);
      const geo = mergeGeometries([sack, neck]); const heap = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x9c6a3a, roughness: .95 }), Math.max(1, total - N + growCap)); heap.castShadow = true;
      R = Math.max(1.2, Math.sqrt(Math.max(0, total - N) * .21 / Math.PI) + .6);   // rings .42 m apart radially, a bag every .5 m round each: a full cone holds ~pi*R^2/.21 bags (integrate: was /.42, twice too wide, so the bags only reached a hollow ring wall)
      const cx = pile.x + 14 + R, cz = R + 2.5; const slot = heapSlots(cx, cz, R); let k = 0;
      for (; k < total - N; k++) { if (!slot(heap, k)) break; }
      heap.count = k; heap.computeBoundingSphere(); group.add(heap); F.heap = heap; F.heapCenter = new THREE.Vector3(cx, 0, cz); F.heapR = R; if (k < total - N) console.warn('heap truncated', k, total - N);
      if (growCap > 0) grow = { perDay, bagUSD, cap: total - N + growCap, slot };
    }
    // the boss
    boss = bosses2Ready ? makeBoss2(stop.id, { scale: 1.15 }) : makeBoss(stop.id, { scale: 1.2 }); boss.position.set(pile.x - 2, 0, 2.5); group.add(boss); boss.userData.boss.play('idle'); F.anim = 'idle'; _bossPrev.copy(boss.position); _bossVel.set(0, 0, 0);
    label = textSprite([displayName()], { scale: 1.6 }); label.position.set(pile.x, 3.4, pile.z); group.add(label);
    // the two stalls: scenery only (no beacon, ring, meter or sign count); the middle slot holds the jar
    [[STALL_DEFS[0], STALL_AT[0]], [STALL_DEFS[2], STALL_AT[2]]].forEach(([d, at]) => {
      const x = pile.x + at[0], z = pile.z + at[1]; const g = new THREE.Group(); g.position.set(x, 0, z);
      const stall = makeStall(d.id, { name: d.name }); g.add(stall); stall.rotation.y = Math.atan2(pile.x - 6 - x, pile.z - z);   // face the way she comes in, so the camera sees the fronts
      (stall.userData.parts || []).forEach(p => { p.visible = true; }); stall.userData.sign?.userData.setLines?.([d.name]);
      group.add(g); stalls.push({ ...d, group: g });
    });
    // THE JAR on a low stand, its sign toward the camera, and the delivery ring round it (DELIVER_R)
    jarSpot.set(pile.x + JAR_AT[0], 0, pile.z + JAR_AT[1]);
    jarStand = new THREE.Group(); jarStand.position.copy(jarSpot); group.add(jarStand);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, PLINTH_H, 28), new THREE.MeshStandardMaterial({ color: 0xa8743f, roughness: .9 })); plinth.position.y = PLINTH_H / 2; plinth.castShadow = plinth.receiveShadow = true; jarStand.add(plinth);
    jar = makeJar(); jar.scale.setScalar(JAR_SCALE); jar.position.y = PLINTH_H; jar.rotation.y = -Math.PI / 2; jarStand.add(jar); jar.userData.setFill?.(0);
    const lot = new THREE.Mesh(new THREE.RingGeometry(DELIVER_R - .18, DELIVER_R, 48), new THREE.MeshBasicMaterial({ color: 0xf2c230, transparent: true, opacity: .55, depthWrite: false })); lot.rotation.x = -Math.PI / 2; lot.position.y = .03; lot.renderOrder = 2; jarStand.add(lot);
    // the 15 shared things behind the jar, all dark until a bag lands in the jar
    for (let k = 0; k < N; k++) {
      const kind = SHARED_KINDS[k % SHARED_KINDS.length]; let o = null;
      try { o = Props.makeSharedThing?.(kind) || null; } catch (e) { console.warn('makeSharedThing', kind, e); o = null; }
      if (!o || typeof o.userData?.setLit !== 'function') o = lampPost();
      fitInto(o, SHARED_H, SHARED_W);
      const a = SHARED_A0 + (k / (N - 1)) * (SHARED_A1 - SHARED_A0);
      o.position.set(jarSpot.x + Math.cos(a) * SHARED_R, 0, jarSpot.z + Math.sin(a) * SHARED_R);
      o.userData.setLit(false); o.userData.kind = kind; group.add(o); shared.push(o);
    }
    city.build(new THREE.Vector3(pile.x - 3, 0, 9), { houses: N, seed: stop.id.length * 7 + 3 });
    place.build(stop.id, pile, { name: displayName(), display_name: stop.boss?.display_name, streetOrigin: new THREE.Vector3(pile.x - 3, 0, 9), heapCenter: F.heap ? F.heapCenter.clone() : null, heapRadius: F.heap ? R : 0 });
    // the gerbil walks in from the road, launcher in hand
    player.position.set(pile.x - 6, 0, 0);
    // the opening's one voiced toast waits for main.js's Look shot to end (update: F.introPending)
    trail = createTrail(group, { max: 14, pitch: 1.6, size: .9 }); trailT = 0;
    // polish 10/30: with empty cheeks a gold arrow bobs over the bags, the same arrow the stalls get when you carry, so 'where now?' always has an answer
    F.pileMarker = new THREE.Mesh(new THREE.ConeGeometry(.3, .6, 12), new THREE.MeshStandardMaterial({ color: 0xf2c230, emissive: 0x7a5a00 })); F.pileMarker.rotation.x = Math.PI; F.pileMarker.position.set(pile.x, 1.7, pile.z); group.add(F.pileMarker);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(4.5, 40), new THREE.MeshStandardMaterial({ color: 0xd8c39a, roughness: 1 })); plaza.rotation.x = -Math.PI / 2; plaza.position.set(pile.x, .015, pile.z); plaza.receiveShadow = true; group.add(plaza);
    refreshHud();
  };

  Object.defineProperty(F, 'delivered', { get: () => delivered }); F.need = 15;   // the goal line's count
  const dots = n => `${'●'.repeat(n)}${'○'.repeat(Math.max(0, F.pouch - n))}`;
  function refreshHud() { if (!F.stop) return; hud({ money: displayName(), sets: `Cheeks ${dots(P.carrying)} · Jar ${delivered} of ${F.need}`, note: '' }); }
  // the fallback shared thing: a lamp post whose bulb glows when lit
  function lampPost() {
    const g = new THREE.Group(); const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .07, 1.25, 8), new THREE.MeshStandardMaterial({ color: 0x3b2516, roughness: .6 })); pole.position.y = .625; g.add(pole);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(.14, .17, .1, 10), pole.material); foot.position.y = .05; g.add(foot);
    const bulbM = new THREE.MeshStandardMaterial({ color: 0x6e675c, emissive: 0xffd36a, emissiveIntensity: 0, roughness: .4 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.17, 16, 12), bulbM); bulb.position.y = 1.38; g.add(bulb);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(.2, .12, 12), pole.material); cap.position.y = 1.58; g.add(cap);
    g.userData.setLit = on => { bulbM.emissiveIntensity = on ? 1.8 : 0; bulbM.color.setHex(on ? 0xfff2c0 : 0x6e675c); };
    return g;
  }
  // scale an object so it fits inside h tall and w wide (feet stay on the ground)
  function fitInto(o, h, w) {
    const b = new THREE.Box3().setFromObject(o); if (b.isEmpty()) return; const sz = b.getSize(_a);
    const k = Math.min(h / Math.max(.01, sz.y), w / Math.max(.01, Math.max(sz.x, sz.z))); if (isFinite(k) && k > 0) o.scale.multiplyScalar(k);
  }
  function setCheeks(p) { const n = p.carrying; p.group?.userData.cheeks?.forEach(c => { c.visible = n > 0; c.scale.setScalar(.6 + n * (F.pouch === 5 ? .22 : .35)); }); }
  function emptyCheeks(p) { p.carrying = 0; p.carried.length = 0; p.grabT = 0; p.deliverT = 0; setCheeks(p); }
  // drop one carried bag loose at p's feet, flying away from `from`
  function dropCarried(p, from) {
    if (p.carried.length) { const b = p.carried.pop(); p.carrying = p.carried.length; b.state = 'loose'; b.mesh.visible = true; b.mesh.position.copy(p.group.position);
      const away = p.group.position.clone().sub(from).setY(0); if (away.lengthSq() < 1e-6) away.set(-1, 0, 0);
      b.v.copy(away.normalize().multiplyScalar(3)).add(new THREE.Vector3(0, 3, 0)); }
    setCheeks(p);
  }

  F.fire = () => {
    if (!F.active || F.done) return;
    const p = P, me = player;
    if (performance.now() - (p.lastShot || 0) < 250) return; p.lastShot = F.lastShot = performance.now(); sfx?.play('fire');
    const m = makeBrick(); m.position.copy(me.position); m.position.y += .6; m.rotation.y = me.rotation.y; group.add(m);
    const v = new THREE.Vector3(); const bd = boss.position.distanceTo(me.position);
    if (bd < AIM_R) {   // solve the arc to where he will be: lead by his current velocity, once
      let vh = THREE.MathUtils.clamp(bd * VH_PER_M, VH_MIN, VH_MAX), T = bd / vh;
      _a.copy(boss.position).addScaledVector(_bossVel, T); _a.y = 1.0; _a.sub(m.position); const dy = _a.y; _a.y = 0;
      const D = _a.length(); vh = THREE.MathUtils.clamp(D * VH_PER_M, VH_MIN, VH_MAX); T = Math.max(.05, D / vh);
      if (D > .01) _a.multiplyScalar(vh / D); v.set(_a.x, (dy + .5 * GRAV * T * T) / T, _a.z);
    } else v.set(Math.sin(me.rotation.y) * FREE_V, FREE_VY, Math.cos(me.rotation.y) * FREE_V);
    const spin = new THREE.Vector3(6 + Math.random() * 6, (Math.random() - .5) * 8, (Math.random() - .5) * 4);
    bricks.push({ mesh: m, v, spin, t: 0, bounced: false, from: me });
  };

  // Drop the bags he is carrying: they fall loose around him, grabbable.
  function dropBossBags() {
    for (const b of bossBags) { b.state = 'loose'; b.mesh.position.y = Math.max(b.mesh.position.y, 1.5);
      const a = Math.random() * Math.PI * 2; b.v.set(Math.cos(a) * 3, 3, Math.sin(a) * 3); }
    bossBags.length = 0;
  }
  // The dizzy state: a brick hit (extends a running stun a little, capped) or a right trick-card answer (long). One path.
  function stun(kind) {
    const fresh = stunned <= 0;
    if (kind === 'trick') stunned = Math.max(stunned, STUN_TRICK);
    else stunned = fresh ? Math.max(stunned, STUN_HIT) : Math.max(stunned, Math.min(STUN_CAP, stunned + STUN_ADD));
    recoverT = 0; boss.position.y = 0; dropBossBags();
    if (fresh) dizzyVoiced = false;
    if (!dizzyVoiced) { dizzyVoiced = true; ctx.play?.('v_dizzy'); }
    if (kind !== 'trick' && !F.bonked) { F.bonked = true; toast("Bonk! He's dizzy. Grab bags while you can.", { ms: 2600 }); }
  }

  function popBag(b, from) {
    b.state = 'loose'; popCount++; spawnBurst(scene, b.mesh.position); if (popCount === 1) toast('A bag came loose! Run over it.', { ms: 2400 }); const away = b.mesh.position.clone().sub(from).setY(0).normalize(); if (away.length() < .1) away.set(-1, 0, 0);
    b.v.copy(away.multiplyScalar(3.5)).add(new THREE.Vector3((Math.random() - .5) * 2, 3.5, (Math.random() - .5) * 2));
  }

  function trickCard() {
    openTrick({ stop: F.stop, card, closeCard, play: ctx.play, say: ctx.say, sfx, toast, state, save, words, title: 'Spot the trick', rightTail: "He's dizzy. Grab the bags!",
      onRight: (q, finish) => finish('Go!', () => { sfx?.play('stun'); stun('trick'); let k = 0; for (const bg of bags) if (bg.state === 'pile' && k < 4) { popBag(bg, boss.position); k++; } popCount = 0; }) });
  }
  F.trickCard = trickCard;

  // his heap's slots, in the cone's own layer rule: rings .5 m apart round the axis, layers .42 m in and .36 m up, bottom first.
  // When the cone is full the next bag starts a new shell one layer-step wider, so a growing heap gets wider and taller.
  function heapSlots(cx, cz, R0) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    let Rs = R0, layer = 0, i = 0, count = Math.max(1, Math.floor(R0 * 2 * Math.PI / .5));
    return (heap, k) => {
      if (k >= heap.instanceMatrix.count) return false;
      while (i >= count) { layer++; i = 0; let r = Rs - layer * .42; if (r < .5) { Rs += .42; layer = 0; r = Rs; } count = Math.max(1, Math.floor(r * 2 * Math.PI / .5)); }
      const r = Rs - layer * .42, a = i / count * Math.PI * 2 + layer * .3, rr = r - Math.random() * .3; i++;
      v.set(cx + Math.cos(a) * rr, layer * .36, cz + Math.sin(a) * rr); q.setFromAxisAngle(up, a); m.compose(v, q, sc); heap.setMatrixAt(k, m); return true;
    };
  }
  // real-time growth: only while play is live (no Look shot, no card)
  function stepGrow(dt) {
    if (looking() || ctx.asking?.()) return;
    F.playSeconds += dt;
    if (!grow) return;
    F.grownUSD += grow.perDay / 86400 * dt; F.grown = F.grownUSD / grow.bagUSD;
    const heap = F.heap; if (!heap) return;
    const want = Math.min(grow.cap, F.total - 15 + Math.floor(F.grown)); let added = false;
    while (heap.count < want && grow.slot(heap, heap.count)) { heap.count++; added = true; }
    if (added) { heap.instanceMatrix.needsUpdate = true; heap.computeBoundingSphere(); }
  }
  // the Musk level's one growth line, in teacher-pay words (no numbers above ten)
  function growthLine() {
    const t = (ctx.ordinary || ctx.data?.ordinary || []).find?.(o => o.id === 'teacher') || {};
    const usd = Number(t.usd) || 72030, life = Number(t.life_years) || 40;
    const years = (F.grownUSD || 0) / usd, f = years / life; let what;
    if (years < 1 / 12) what = "a few weeks of a teacher's pay";              // honest for a very short game (skips, tests)
    else if (years < .4) what = "a few months of a teacher's pay";
    else if (years < .75) what = "almost a year of a teacher's pay";
    else if (years < 9.5) { const n = Math.round(years); what = n === 1 ? "about one year of a teacher's pay" : `about ${NUMW[n]} years of a teacher's pay`; }
    else if (f < .4) what = "about a quarter of a teacher's whole life of teaching";
    else if (f < .65) what = "about half of a teacher's whole life of teaching";
    else if (f < .9) what = "almost all of a teacher's whole life of teaching";
    else if (f < 1.15) what = "about all of a teacher's whole life of teaching";
    else { const n = Math.round(f); what = n >= 2 && n <= 10 ? `about ${NUMW[n]} teachers' whole lives of teaching` : n > 10 ? "more than ten teachers' whole lives of teaching" : "more than all of a teacher's whole life of teaching"; }
    return `While you played, his pile grew by ${what}.`;
  }

  // the 15th bag: carrying stops, the camera pulls back, "Look how much he still has."
  function reachFifteen() {
    if (F.done) return;
    F.done = true; cin = true; stunned = 999; dropBossBags(); ctx.onFinish?.(); sfx?.play('win'); if (label) label.visible = false;   // his name over the takedown's speech bubble read as a second caption
    trail?.show(false); if (F.pileMarker) F.pileMarker.visible = false; refreshHud();
    pull = { t: 0, said: false, grewSaid: false, next: PULL_S + 1.5, pos0: new THREE.Vector3(), look0: new THREE.Vector3(), pos1: new THREE.Vector3(), look1: new THREE.Vector3() };
    pull.pos0.copy(player.position).add(_a.set(-6.5, 3.4, 0)); pull.look0.copy(player.position).add(_a.set(4, .8, 0));
    // the end shot: one sphere round the jar, the shared arc, the pile and his whole heap, seen from behind and above
    const box = new THREE.Box3(); const add = (c, r, h = r) => { box.expandByPoint(_b.set(c.x - r, 0, c.z - r)); box.expandByPoint(_b.set(c.x + r, h, c.z + r)); };
    add(jarSpot, SHARED_R + .6, 2.6); add(pile, 1.6, 3);
    if (F.heap) { const hh = F.heapR / .42 * .36 + .6; add(F.heapCenter, F.heapR + .3, hh); }
    const sph = box.getBoundingSphere(new THREE.Sphere()); const pitch = (F.total || 0) > F.need ? .5 : .85, yaw = .3, d = sph.radius / Math.sin(THREE.MathUtils.degToRad(58) / 2) * .82;   // (integrate) no heap left (Trump): the small sphere put the camera among his gold lamps, so it looks down over them
    const dir = _c.set(Math.cos(pitch) * Math.cos(yaw), -Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw));
    pull.look1.copy(sph.center); pull.look1.y = Math.max(.5, sph.center.y * .6); pull.pos1.copy(pull.look1).addScaledVector(dir, -d);
    if (F.stop?.id === 'musk') pull.next = PULL_S + 9;   // room for the growth line
  }
  function stepPull(dt, now) {
    pull.t += dt;
    for (const b of bags) if (b.state === 'loose' || b.state === 'boss' || b.state === 'pile') {   // anything still loose fades out
      const k = Math.max(0, b.mesh.scale.x - dt * 1.5); b.mesh.scale.setScalar(k); if (k <= 0) { b.mesh.visible = false; b.state = 'gone'; } }
    if (!pull.said && pull.t > .8) { pull.said = true; const all = (F.total || 0) <= F.need, line = all ? ALL_LINE : LOOK_LINE; ctx.play?.(all ? 'market_built_all' : 'market_built_r3', line); toast(line, { ms: 4200 }); }
    if (!pull.grewSaid && F.stop?.id === 'musk' && pull.t > PULL_S + .6) { pull.grewSaid = true; toast(growthLine(), { ms: 7500 }); }
    boss?.userData.boss?.update(dt); city.update(dt, now); place.update(dt, now);
    if (pull.t >= pull.next) startTakedown();
  }
  F.growthLine = growthLine;
  // then the takedown and the shatter as before, and on to the Long Road with no card
  function startTakedown() {
    pull = null; const stop = F.stop;
    takedown.start(takedownFor(stop.id), boss, pile.clone(), { facing: 0, onDone: () => { if (F.aborted) return;
      shatter.start({ heap: null, center: pile.clone(), radius: 1.1, count: 0, restoreHeap: true, roadDir: new THREE.Vector3(-1, 0, 0), player, bagSets: BAG_SETS,
        toast: { text: 'Legos for everybody!' }, onDone: () => finishLevel() }); } });
  }
  function finishLevel() {
    if (F.aborted || F.ended || !F.active) return; F.ended = true; cin = false; pull = null;
    const stop = F.stop; const total = delivered * bagSets;
    if (!F.saved) { F.saved = true; state.beaten = state.beaten || {}; state.beaten[stop.id] = { ...(state.beaten[stop.id] || {}), bags: delivered, sets: total, on: new Date().toISOString().slice(0, 10), ending: 'jar' }; state.returned = (state.returned || 0) + total; save(state); }
    F.end();
  }
  F.skipCinematic = () => { if (!cin) return; if (pull) { finishLevel(); return; } if (takedown.active) takedown.skip(); if (shatter.active) shatter.skip(); if (cin) finishLevel(); };
  F.cameraTarget = () => {
    if (!F.active || !pull || takedown.active || shatter.active) return null;
    const k = THREE.MathUtils.smoothstep(Math.min(1, pull.t / PULL_S), 0, 1);
    return { pos: _camP.lerpVectors(pull.pos0, pull.pos1, k), look: _camL.lerpVectors(pull.look0, pull.look1, k) };
  };
  F.cameraBoxes = () => {
    if (!F.active || !group) return [];
    const out = []; for (const st of stalls || []) out.push(new THREE.Box3().setFromObject(st.group));
    if (jarStand) out.push(new THREE.Box3().setFromObject(jarStand));
    const fb = place.facadeBox?.() ?? place.cameraBoxes?.() ?? null; if (Array.isArray(fb)) out.push(...fb.filter(b => b?.isBox3)); else if (fb?.isBox3) out.push(fb);
    return out;
  };
  Object.defineProperty(F, 'focus', { get: () => {
    if (!F.active || F.done || !pile) return null;
    if (P.carrying > 0) return { x: jarSpot.x, z: jarSpot.z };
    return { x: pile.x, z: pile.z };
  } });

  F.end = () => { F.active = false; cin = false; pull = null; shatter.dispose(); trail?.dispose(); trail = null; scene.remove(group); freeLabel(); jar?.userData.dispose?.(); jar = null; city.dispose(); place.dispose(); emptyCheeks(P); ctx.onEnd?.(F.stop, { grown: F.grown || 0, grownUSD: F.grownUSD || 0, playSeconds: F.playSeconds || 0 }); };
  F.abort = () => { if (!F.active) return; F.aborted = true; cin = false; pull = null; trail?.dispose(); trail = null; if (takedown.active) takedown.skip(); if (shatter.active) shatter.skip(); shatter.dispose(); F.aborted = false; F.active = false; scene.remove(group); freeLabel(); jar?.userData.dispose?.(); jar = null; city.dispose(); place.dispose(); emptyCheeks(P); };
  // fill the jar to 15 and light everything; the next update reaches 15 (the pull-back)
  F.debugWin = () => { if (!F.active || F.done) return; for (const b of bags) if (b.state !== 'delivered') { b.state = 'delivered'; b.mesh.visible = false; }
    emptyCheeks(P); delivered = F.need; jar?.userData.setFill?.(1); for (const o of shared) o.userData.setLit?.(true); city.setProgress(delivered); refreshHud(); };

  // (verify) the jar's stand and the two stalls step out of the picture while they stand between the camera and who it is
  // watching (Molly in play, the boss in the takedown); the boss himself is never hidden
  const _oc = new THREE.Vector3(), _ot = new THREE.Vector3(), _op = new THREE.Vector3();
  function clearSightline() {
    const cam = ctx.camera; if (!cam || !group) return; const target = takedown.active || shatter.active || pull ? boss : player; if (!target) return;
    _oc.copy(cam.position); target.getWorldPosition(_ot); _ot.y += 1.0; const L = _ot.distanceTo(_oc);
    const test = (obj, r) => { if (!obj) return; obj.getWorldPosition(_op); _op.y = Math.min(Math.max(_op.y + 1, Math.min(_oc.y, _ot.y)), Math.max(_oc.y, _ot.y));
      const k = THREE.MathUtils.clamp(_op.clone().sub(_oc).dot(_ot.clone().sub(_oc)) / Math.max(1e-6, L * L), 0, 1); const d = _op.distanceTo(_oc.clone().lerp(_ot, k));
      obj.visible = !(k > .02 && k < .92 && d < r); };
    test(jarStand, 1.5); for (const st of stalls || []) test(st.group, 2.2);
  }
  F.update = (dt, now) => {
    clearSightline();
    if (takedown.active) { takedown.update(dt); city.update(dt, now); place.update(dt, now); return; }
    if (shatter.active) { shatter.update(dt); city.update(dt, now); place.update(dt, now); return; }
    if (F.active && pull) { stepPull(dt, now); return; }
    if (!F.active || F.done) return;
    if (delivered >= F.need) { reachFifteen(); return; }
    // the opening: one voiced toast once main.js's Look shot is over
    if (F.introPending && !looking()) { F.introPending = false; toast('Grab bags from his pile and take them to the jar.', { ms: 5200 }); }
    // the arena's edge: a soft push back, no voice
    { const pp = player.position, k = Math.min(1, dt * 12), xMin = pile.x - 16, xMax = Math.max(pile.x + 12, F.heapCenter.x + F.heapR + 4);
      if (pp.z > ARENA_Z) pp.z -= (pp.z - ARENA_Z) * k; else if (pp.z < -ARENA_Z) pp.z -= (pp.z + ARENA_Z) * k;
      if (pp.x < xMin) pp.x += (xMin - pp.x) * k; else if (pp.x > xMax) pp.x -= (pp.x - xMax) * k; }
    // bricks: fly, spin, bonk the boss, knock pile bags loose, bounce once on the ground
    _c.copy(boss.position); _c.y = 1.0;
    for (let i = bricks.length - 1; i >= 0; i--) { const br = bricks[i], p = br.mesh.position;
      br.t += dt; br.v.y -= GRAV * dt; p.addScaledVector(br.v, dt);
      br.mesh.rotation.x += br.spin.x * dt; br.mesh.rotation.y += br.spin.y * dt; br.mesh.rotation.z += br.spin.z * dt;
      let gone = br.t > BRICK_LIFE;
      if (!gone && !br.bounced && p.distanceTo(_c) < 1.3) { gone = true; sfx?.play('bonk'); juice?.shake(.35); stun('hit');
        _a.copy(boss.position).sub(br.from.position).setY(0); if (_a.lengthSq() > 1e-4) { _a.normalize().multiplyScalar(3); boss.userData.push = (boss.userData.push || new THREE.Vector3()).copy(_a); }
        _b.copy(boss.position); _b.y += .8; spawnBurst(scene, _b, 0xff6a3a, 16); }
      if (!gone) for (const b of bags) if (b.state === 'pile') { const bp = b.mesh.position, dx = p.x - bp.x, dz = p.z - bp.z;
        if (p.y < .9 && dx * dx + dz * dz < .36) { popBag(b, pile); gone = true; break; } }
      if (!gone && p.y < 0) {
        if (br.bounced) gone = true;
        else { br.bounced = true; p.y = 0; br.v.y = Math.abs(br.v.y) * .35; br.v.x *= .45; br.v.z *= .45; br.spin.multiplyScalar(.5);
          // landing in the pile still knocks the nearest bag loose
          let near = null, nd = 1.0; for (const b of bags) if (b.state === 'pile') { const d = Math.hypot(p.x - b.mesh.position.x, p.z - b.mesh.position.z); if (d < nd) { nd = d; near = b; } }
          if (near) { popBag(near, pile); gone = true; } }
      }
      if (gone) { group.remove(br.mesh); bricks[i] = bricks[bricks.length - 1]; bricks.pop(); } }
    // loose bags: she hoovers up the ones at her feet
    for (const b of bags) if (b.state === 'loose') { b.v.y -= 9.8 * dt; b.mesh.position.addScaledVector(b.v, dt);
      if (b.mesh.position.y < 0) { b.mesh.position.y = 0; b.v.y = -b.v.y * .3; b.v.x *= .6; b.v.z *= .6; if (b.v.length() < .3) b.v.set(0, 0, 0); }
      { const p = P, pos = p.group.position, dp = b.mesh.position.distanceTo(pos); if (p.carrying < F.pouch && dp < MAGNET_R && dp > .5 && b.v.length() < .5) b.mesh.position.lerp(_b.copy(pos).setY(b.mesh.position.y), Math.min(1, dt * 6));
        if (p.carrying < F.pouch && dp < PICKUP_R && b.mesh.position.y < 1.2) { b.state = 'carried'; b.mesh.visible = false; p.carried.push(b); p.carrying = p.carried.length; setCheeks(p); refreshHud(); sfx?.play('grab');
          if (p.carrying === 1 && !told.gotOne) { told.gotOne = true; toast('Got one! Carry it to the jar.', { ms: 2200 }); } else if (p.carrying === F.pouch && !told.full) { told.full = true; toast(`Cheeks full: ${F.pouch} bags. Run to the jar!`, { ms: 2000 }); } } } }
    {
      const p = P, pos = p.group.position;
      // grab from the pile by touching it
      p.grabT = (p.grabT || 0) - dt; if (p.carrying < F.pouch && p.grabT <= 0) { let near = null, nd = GRAB_R; for (const b of bags) if (b.state === 'pile') { const d = b.mesh.position.distanceTo(pos); if (d < nd) { nd = d; near = b; } }
        if (near) { near.state = 'carried'; near.mesh.visible = false; p.carried.push(near); p.carrying = p.carried.length; p.grabT = .3; setCheeks(p); refreshHud(); sfx?.play('grab'); spawnBurst(scene, near.mesh.position, 0xf2c230, 8); if (p.carrying === 1 && !F.grabbed) { F.grabbed = true; told.gotOne = true;
            if (F.pouch === 5 && !pouchTold) { pouchTold = true; ctx.play?.('pouch5', 'Mr. Nib made your cheeks bigger. Five bags a trip.'); }   // once a session, at the moment it matters
            else toast('Got one! Carry it to the jar.', { ms: 2600 }); }
          else if (p.carrying === F.pouch && !told.full) { told.full = true; toast(`Cheeks full: ${F.pouch} bags. Run to the jar!`, { ms: 1800 }); } } }
      // deliver: one bag into the jar every .25 s inside the ring; each lights the next shared thing
      p.deliverT = (p.deliverT || 0) - dt;
      if (p.carrying > 0 && p.deliverT <= 0 && delivered < F.need && Math.hypot(jarSpot.x - pos.x, jarSpot.z - pos.z) < DELIVER_R) {
        const b = p.carried.pop(); p.carrying = p.carried.length; b.state = 'delivered'; b.mesh.visible = false; delivered++; F.firstDelivery = true; p.deliverT = .25; setCheeks(p);
        jar?.userData.setFill?.(delivered / F.need); spawnBurst(scene, _b.copy(jarSpot).setY(PLINTH_H + 1.5 * JAR_SCALE), 0xf2c230, 10);
        const o = shared[delivered - 1]; if (o) { o.userData.setLit?.(true); spawnBurst(scene, _b.copy(o.position).setY(1.2), 0xfff2a0, 14); }
        sfx?.play('built'); city.setProgress(delivered); refreshHud();
      }
    }
    // the trail: from her to the jar while she carries, refreshed every .3 s
    if (trail) { trailT -= dt; const f = P.carrying > 0 ? F.focus : null;
      if (!f) { if (trail.mesh.visible) trail.show(false); }
      else if (trailT <= 0) { trailT = .3; const d = Math.hypot(f.x - player.position.x, f.z - player.position.z); trail.setPath(player.position.x, player.position.z, f.x, f.z).show(d > DELIVER_R); }
      trail.update(now); }
    // the gold arrow: over the jar while she carries, over the next bag (loose first, else the pile) while her cheeks are empty
    if (F.pileMarker) { let near = null; if (P.carrying === 0) for (const b of bags) if (b.state === 'pile' || b.state === 'loose') { near = b; if (b.state === 'loose') break; }
      const atJar = P.carrying > 0; F.pileMarker.visible = atJar || !!near;
      if (atJar) F.pileMarker.position.set(jarSpot.x, PLINTH_H + 1.55 * JAR_SCALE + .6 + Math.sin(now / 200) * .2, jarSpot.z);
      else if (near) { const p = near.state === 'loose' ? near.mesh.position : pile; F.pileMarker.position.set(p.x, 1.7 + Math.sin(now / 200) * .2, p.z); } }
    stepGrow(dt);
    // the boss
    const B = boss.userData.boss; const act = n => { if (F.anim !== n) { F.anim = n; B.play(n); } };
    if (boss.userData.push) { boss.position.addScaledVector(boss.userData.push, dt); boss.userData.push.multiplyScalar(Math.max(0, 1 - dt * 5)); if (boss.userData.push.length() < .2) boss.userData.push = null; }
    if (stunned > 0) { stunned -= dt; act('dizzy'); if (stunned <= 0) { recoverT = RECOVER; act('idle'); } }
    else if (recoverT > 0) { recoverT -= dt; act('idle'); }
    else {
      boss.position.y = 0; let target = null, bd = 1e9;
      if (bossBags.length >= BOSS_CARRY) target = pile;
      else for (const b of bags) if (b.state === 'loose') { const d = b.mesh.position.distanceTo(boss.position); if (d < bd) { bd = d; target = b.mesh.position; } }
      if (!target && bossBags.length) target = pile;
      // he chases her when she has bags in her cheeks: briefly (3 s, or until she is 6 m away), then he rests
      F.chaseRest = Math.max(0, F.chaseRest - dt); const toPlayer = Math.hypot(player.position.x - boss.position.x, player.position.z - boss.position.z); let chasing = false;
      if (!target && P.carrying > 0 && F.chaseRest <= 0) {
        if (!F.chasing && toPlayer < CHASE_START_M) { F.chasing = true; F.chaseT = 0; F.bumped = false; }
        if (F.chasing) { F.chaseT += dt; if (F.chaseT > CHASE_MAX_S || toPlayer > CHASE_GIVEUP_M) { F.chasing = false; F.chaseRest = CHASE_REST_S; } else { target = player.position; chasing = true; } }
      } else F.chasing = false;
      if (!target) { const a = now / 2500; target = _b.set(pile.x + Math.cos(a) * 4, 0, pile.z + Math.sin(a) * 4); }
      const d = _a.copy(target).sub(boss.position).setY(0); const dist = d.length(); if (dist > .3) { d.normalize(); boss.position.addScaledVector(d, (chasing ? CHASE_V : BOSS_WALK) * dt); boss.rotation.y = Math.atan2(d.x, d.z); if (F.laughT > 0) act('laugh'); else act(chasing ? 'run' : 'walk'); } else act('idle');
      F.laughT = Math.max(0, (F.laughT || 0) - dt);
      // he picks loose bags up and carries them back on his head (a brick makes him drop them)
      for (const b of bags) if (b.state === 'loose' && bossBags.length < BOSS_CARRY && b.mesh.position.distanceTo(boss.position) < 1.0) { b.state = 'boss'; b.v.set(0, 0, 0); bossBags.push(b); }
      if (bossBags.length && Math.hypot(boss.position.x - pile.x, boss.position.z - pile.z) < 1.6) { for (const b of bossBags) { b.state = 'pile'; b.mesh.position.copy(b.home); } bossBags.length = 0; }
      // one bump per chase, 5 s apart, only while he is chasing her, and never next to the jar (she is nearly there)
      const nearStall = Math.hypot(jarSpot.x - player.position.x, jarSpot.z - player.position.z) < BUMP_STALL_SAFE + 1;
      if (chasing && !F.bumped && !nearStall && toPlayer < BUMP_R && now - lastDrop > BUMP_COOLDOWN_S * 1000) { lastDrop = now; F.bumped = true; F.chasing = false; F.chaseRest = CHASE_REST_S; dropCarried(P, boss.position);
        if (!told.bump) { told.bump = true; toast('He bumped a bag out of your cheeks!', { sub: `Press ${aWord()} to bonk him with a brick.`, ms: 2600 }); } sfx?.play('oops'); ctx.play?.('v_laugh'); F.laughT = 1.5; refreshHud(); }
    }
    for (let k = 0; k < bossBags.length; k++) { const bp = bossBags[k].mesh.position; bp.copy(boss.position); bp.y = 2.7 + k * .45; }
    if (dt > 0) { _bossVel.subVectors(boss.position, _bossPrev).divideScalar(dt); _bossVel.y = 0; } _bossPrev.copy(boss.position);
    // tricks live at the gate now (approach.js); F.trickCard stays available for a mid-fight variant if Eric wants both
    F.trickCard = trickCard;
    B.update(dt); city.update(dt, now); place.update(dt, now);
    if (delivered >= F.need) reachFifteen();
  };
  return F;
}
