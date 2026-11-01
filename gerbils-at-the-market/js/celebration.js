// celebration.js — the ending, played once, after every billionaire is beaten. It opens on the jar with every shared thing
// dark (hub.setShared(kind, false, { instant })): "In our story, this time everybody put in their share.", the billionaires walk
// in one at a time and put their own share in, and the shared things light again in hub.sharedKinds order (school, lamps,
// fountain, bell), each named as it lights ("The school!"); then "That is what taxes are for."; the jar overflows and the
// fountain leaps; the camera comes down to gerbil height while every townsperson walks to the square. The street's party plays
// silent (cars, new floors, Lego crates: the old "Free cars for everyone!" lines were cut, verify round 3). Then the lookout: ctx.longRoad() restores every
// billionaire's row and the camera eases to its lookoutShot over the valley, where the one sentence is said ("When everybody
// puts a little in the jar, there's enough for everybody. ..."), fireworks over the valley, and the last card (number-free).
// Without a Long Road it falls back to the whole-valley shot. The card defaults to 'Back to the market'; 'Play again' asks
// "Start over?" first, and only its yes wipes the progress. cel.clips lists every clip id it plays. Round 3 cut every count
// (the bags-left number, its labels and its line, the end card's Lego-set total).
// No rule-setting, no quiz: a scripted scene driven by update(dt) on a timeline (no timers), working in the hub
// city's local frame (origin = the street entrance, +z up the street, the square at (0, 0, 12.8)). Everything it adds is
// preallocated at start() (the sparks are one Points pool) and removed by dispose().
//   ctx: { scene, player, camera, city, gerbilFrom, spawnBurst, sfx, play, caption, card, closeCard, toast, state, data, makeBoss,
//          NAMES, hub, longRoad: () => unroll.longRoad, hillTop }
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, animateGerbil, smallCar, makeCrate, makeBag, textCanvas } from './props.js';
import { makeJar } from './prologue.js';
import { makeBoss } from './bosses.js';
import { makeBoss2 } from './bosses2.js';

// ---------- the city's frame (mirrors city.js; the celebration only reads the city, never edits it) ----------
const SQUARE = new THREE.Vector3(0, 0, 12.8), FOUNTAIN_R = 1.0, JUNCTION = new THREE.Vector3(0, 0, 10.0), JAR_L = new THREE.Vector3(0, 0, 10.85);   // the jar for the pay-in: between the basin (1.25 + its .6 stand) and the ring, toward the camera
const HOUSE_W = 2.4, HOUSE_D = 2.0, HOUSE_H = 2.1, FOUND = .2;
const COATS = [0xd9b07a, 0xc98f4e, 0xf0dcc0, 0xa87a4a, 0x8c6a4e, 0xe8c9a0, 0xb8b0a8, 0xf2e2d2, 0x6e5440, 0xdca96a, 0xffe2b8, 0x9a7b5c];
const CAR_COLORS = [PALETTE.red, PALETTE.blue, PALETTE.yellow, PALETTE.green, 0x2fb3a8, 0xe07a2a, 0x8a5bb5, PALETTE.pink];
const FW_PALETTES = [[0xfff3c0, 0xffd04a, 0xff8a2a], [0xff8ad0, 0xc77dff, 0xffffff], [0x7fd8ff, 0x6cff9a, 0xfff8e0]];

// ---------- the timeline (seconds from start) ----------
export const TIMELINE = { payin: 0, gather: 0, fountain: 13.6, down: 15.2, cars: 17, stairs: 23, legos: 29, whole: 35, lookout: 40.5, sentence: 42.5, fireworks: 45, end: 58 };   // payin: the billionaires walk in one at a time and put their bags in the jar (the last lands at about 14.7 s for any count: buildPayin scales the gap); down: the camera to gerbil height; lookout: the camera eases to the Long Road's lookout (LOOK_EASE s)
// the clips, their lengths (ffprobe; cel3_sentence an estimate) and when they play
const CLIPS = ['cel3_share', 'cel_taxes', 'o3_lit_school', 'o3_lit_lamps', 'o3_lit_fountain', 'o3_lit_bell', 'cel3_sentence'];
// (verify) the pay-in is said "in our story" (cel3_share), each shared thing is named as it lights again (the opening's own
// o3_lit_* clips, in the order they went out), and "That is what taxes are for." follows the last one
const SAY = { share: .8, taxes: 16.0 };
const KIND_SAY = { school: 'The school!', lamps: 'The lamps!', fountain: 'The fountain!', bell: 'The bell!' };
const SENTENCE = ['When everybody puts a little in the jar, there\'s enough for everybody.', 'A few billionaires have way more than anybody needs, and they used tricks to put almost nothing in.'];
const LOOK_EASE = 3.0, KINDS = ['school', 'lamps', 'fountain', 'bell'], HILL = new THREE.Vector3(-25, 2.2, -18);
// the pay-in's pace (10/31, the prologue's calmer walk): a billionaire every PAY_GAP s, each walks at PAY_WALK m/s (bosses2 retimes the walk cycle to it),
// stops, and lobs the bag in over PAY_FLY s once he is there (the last bag lands at about PAY_LAST s whatever the count, the jar overflows, the fountain jumps)
const PAY_GAP = 2.8, PAY_WALK = 2.8, PAY_FLY = 1.3, PAY_AIM = .5, PAY_LAST = 14.7;   // PAY_GAP is the slowest gap; buildPayin shortens it so the last bag lands by PAY_LAST (the fountain jumps on it) for any number of billionaires
// (verify) the old "Free cars / A house with stairs / Free Legos for everyone!" lines and their signs are gone: the jar buys
// shared things, not free private ones. The cars, the new floors and the Lego crates still play, silent, as the street's party.
const ENDINGS = [];
const BAGS_OFF = true;
const NEED = 60, BAG_GAP = .21, BAG_ROWS = 3, BAG_Y = 6.2, BAG_Z = 16.2, BAG_X0 = 6.8;   // the row runs toward -x (screen right, looking up the street)   // the whole-valley shot: the 60 bags that came home, then the row the billionaires still have, in the air over the far roofs
const N_EXTRAS = 12, N_CARS = 6, N_CRATES = 10, FW_N = 12, FW_SPARKS = 72, FW_STREAK = 3, FW_TRAIL = 8, CAR_SPEED = 6, RUN_SPEED = 5;

// ---------- scratch (no allocations per frame) ----------
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _m = new THREE.Matrix4(), _c = new THREE.Color(), _qt = new THREE.Quaternion(), _s = new THREE.Vector3(), _axisY = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function colored(geo, hex) { const g = geo.index ? geo.toNonIndexed() : geo; const n = g.attributes.position.count; const a = new Float32Array(n * 3); _c.set(hex); for (let i = 0; i < n; i++) a.set([_c.r, _c.g, _c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g !== geo) geo.dispose(); return g; }
function box(w, h, d, x, y, z, hex) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return colored(g, hex); }
function merge(parts) { const g = mergeGeometries(parts, false); parts.forEach(p => p.dispose()); g.computeVertexNormals(); return g; }
function softDot(inner = .9) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, `rgba(255,255,255,${inner})`); gr.addColorStop(.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); }

// The upper storey every house grows: a slab over the old roof (which city.sinkRoof flattens under it), cream walls, an upper door,
// and a straight staircase up the front-left to a little landing. The stairs used to climb the right side, where they ran
// through the house's own eaves, its back hedge and the next house along (the far row is 3.3 m apart); the front is clear.
function upperFloorGeometry() {
  const W = HOUSE_W, D = HOUSE_D, y0 = FOUND + HOUSE_H + .05, H = 1.55; const cream = 0xfff4e2, wood = 0x8a5a30, stone = 0x9c968c, glass = 0xffd98a; const P = [];
  const topY = y0 + .14, SX = -.65, sw = .5;   // the floor level up there; the staircase's centre line and width (clear of the door, the path and the mailbox)
  P.push(box(W + .4, .14, D + .4, 0, y0 + .07, 0, stone));
  P.push(box(W, H, D, 0, topY + H / 2, 0, cream));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(box(.12, H, .12, sx * W / 2, topY + H / 2, sz * D / 2, wood));
  P.push(box(.56, .56, .06, .6, topY + H * .55, D / 2 + .02, glass)); P.push(box(.66, .07, .1, .6, topY + H * .55 + .31, D / 2 + .03, wood)); P.push(box(.66, .07, .1, .6, topY + H * .55 - .31, D / 2 + .03, wood));
  P.push(box(.56, .56, .06, 0, topY + H * .55, -D / 2 - .02, glass));
  P.push(box(.5, .9, .06, SX, topY + .45, D / 2 + .02, 0x6b4423)); P.push(box(.2, .18, .02, SX, topY + .55, D / 2 + .06, PALETTE.yellow));   // the upper door
  // the landing in front of it, on one post
  const lz0 = D / 2 + .2, lz1 = D / 2 + .6; P.push(box(sw + .3, .1, lz1 - lz0, SX, topY - .05, (lz0 + lz1) / 2, wood)); P.push(box(.07, topY, .07, SX - sw / 2 - .12, topY / 2, lz1 - .04, wood));
  P.push(box(.06, .75, .06, SX - sw / 2 - .12, topY + .375, lz1 - .04, wood)); P.push(box(.06, .06, lz1 - lz0, SX - sw / 2 - .12, topY + .72, (lz0 + lz1) / 2, wood));
  // the stairs: from the landing straight down toward the street, yellow treads, red risers, two stringers, a rail on the outside
  const steps = 8, rise = (topY - FOUND) / steps, depth = .2, zTop = lz1, zBot = zTop + steps * depth;
  for (let i = 0; i < steps; i++) { const z = zBot - (i + .5) * depth, top = FOUND + (i + 1) * rise; P.push(box(sw, .07, depth + .03, SX, top - .035, z, PALETTE.yellow)); P.push(box(sw, rise, .05, SX, top - rise / 2, z + depth / 2, PALETTE.red)); }
  const run = zBot - zTop, len = Math.hypot(run, topY - FOUND), ang = Math.atan2(topY - FOUND, run);
  for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(.05, .16, len); g.rotateX(ang); g.translate(SX + s * (sw / 2 + .025), (FOUND + topY) / 2 - .08, (zTop + zBot) / 2); P.push(colored(g, wood)); }
  for (let i = 0; i <= steps; i += 2) { const z = zBot - i * depth, y = FOUND + i * rise; P.push(box(.05, .75, .05, SX - sw / 2 - .05, y + .375, z, wood)); }
  const rail = new THREE.BoxGeometry(.05, .05, len); rail.rotateX(ang); rail.translate(SX - sw / 2 - .05, (FOUND + topY) / 2 + .72, (zTop + zBot) / 2); P.push(colored(rail, wood));
  return merge(P);
}
// Its roof: a squat hip, coloured per house by instance colour (W + .4: the far row's roofs no longer overlap their neighbours').
function upperRoofGeometry() { const W = HOUSE_W + .4, D = HOUSE_D + .4, y0 = FOUND + HOUSE_H + .05 + .14 + 1.55 - .04; const g = new THREE.ConeGeometry(1, 1, 4, 1); g.rotateY(Math.PI / 4); g.scale(W / Math.SQRT2 * 1.02, .8, D / Math.SQRT2 * 1.02); g.translate(0, y0 + .4, 0); const cap = new THREE.BoxGeometry(.3, .1, .3); cap.translate(0, y0 + .8, 0); return merge([g.toNonIndexed(), cap.toNonIndexed()]); }
// A parachute canopy: striped half-sphere, vertex-coloured.
function canopyGeometry() { const g = new THREE.SphereGeometry(.7, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed(); const n = g.attributes.position.count, a = new Float32Array(n * 3), pos = g.attributes.position; const c1 = new THREE.Color(PALETTE.red), c2 = new THREE.Color(0xfff6e0), c3 = new THREE.Color(PALETTE.yellow);
  for (let i = 0; i < n; i++) { const ang = Math.atan2(pos.getZ(i), pos.getX(i)); const k = Math.floor((ang / Math.PI / 2 + 1) * 8) % 3; const c = k === 0 ? c1 : k === 1 ? c2 : c3; a.set([c.r, c.g, c.b], i * 3); } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.computeVertexNormals(); return g; }

export function createCelebration(ctx) {
  const { scene, player, city, gerbilFrom, sfx, card, closeCard, toast, state, savePicture, NAMES } = ctx;
  const C = { get active() { return active; }, get done() { return done; }, get t() { return t; }, start, update, cameraTarget, skip, dispose, clips: CLIPS };
  let active = false, done = false, t = 0, root = null, onDone = null, r = rng(31);
  const disposables = [], props = []; const D = o => { disposables.push(o); return o; }; const P = o => { props.push(o); return o; };
  let actors = [], taken = [], cars = [], crates = [], captions = [], fw = null, water = null, floors = null, roofs = null, floorPop = null, fwFlash = [];
  let jar = null, payers = [], jumpT = -1, overflowed = false, bagsHome = null, bagsLeft = null, leftN = 0, said = {}, lit = 0, lr = null, lookShot = null, valleyFw = false;
  const kinds = () => (Array.isArray(ctx.hub?.sharedKinds) && ctx.hub.sharedKinds.length ? ctx.hub.sharedKinds : KINDS);
  const setShared = (k, on, o) => { try { ctx.hub?.setShared?.(k, on, o); } catch (e) { console.warn('setShared', e); } };
  let cheerPlayed = false, finished = false, dusk = null; const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camA = new THREE.Vector3(), camB = new THREE.Vector3(), shoulder = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const lots = () => city?.lots || [];

  // ---------- start: take over the townsfolk, build the props ----------
  function start(opts = {}) {
    if (root) dispose(); onDone = opts.onDone || null; active = true; done = false; finished = false; t = 0; cheerPlayed = false; r = rng(31);
    root = new THREE.Group(); if (city?.group) { city.group.updateMatrixWorld(true); root.position.copy(city.group.position); root.quaternion.copy(city.group.quaternion); } scene.add(root); root.updateMatrixWorld(true);
    sfx?.music?.start?.('market'); said = {}; lit = 0; lookShot = null; valleyFw = false;
    for (const k of kinds()) setShared(k, false, { instant: true });   // dark until they pay in
    lr = null; try { lr = ctx.longRoad?.() || null; } catch (e) { lr = null; }
    // the shoulder shot, in the city's frame: where the kid stands when it starts
    _p.copy(player?.position || root.position); root.worldToLocal(_p); shoulder.pos.set(_p.x, _p.y + 1.0, _p.z - 2.0); shoulder.look.set(_p.x, .5, _p.z + 6);
    // townsfolk: freeze the city's state machine for each (state 'away' returns before it moves them), and route them to the square
    actors = []; taken = [];
    for (const tp of city?.townsfolk || []) { const home = lots()[tp.home]; if (!home || !tp.g.visible) continue; taken.push({ tp, state: tp.state }); tp.state = 'away'; tp.g.rotation.x = 0; tp.g.position.y = 0;
      const a = actor(tp.g, home, false); a.yaw = tp.yaw; a.g.rotation.order = 'YXZ';
      // doorstep → street → spine → (stem: the junction) → the spot
      const sector = home.far ? 0 : Math.PI, spread = home.far ? 2.4 : 1.7; pickSpot(a, sector, spread);
      a.wpN = 0; addWp(a, a.g.position.x, a.g.position.z); seg(a, home.street.x, home.street.z); seg(a, home.spine.x, home.spine.z); if (!home.far) seg(a, JUNCTION.x, JUNCTION.z); seg(a, a.spot.x, a.spot.z); finishRoute(a, 4.0 + r() * 1.4); actors.push(a); }
    // the city's kid stops running round the fountain (his loop crossed the crowd and the crates) and joins the ring
    const kid = city?.kid; if (kid && kid.g.visible && kid.state === 'play') { taken.push({ tp: kid, state: kid.state, kid: true }); kid.state = 'away'; const a = actor(kid.g, null, false); a.busy = true; a.g.rotation.order = 'YXZ'; pickSpot(a, Math.PI, 2.0); a.exit.copy(a.spot); a.wpN = 0; addWp(a, kid.g.position.x, kid.g.position.z); seg(a, a.spot.x, a.spot.z); finishRoute(a, 1.5); actors.push(a); }
    // extra gerbils walk in from the three street ends
    for (let i = 0; i < N_EXTRAS; i++) { const g = gerbilFrom({ color: COATS[Math.floor(r() * COATS.length)], scale: .8 + r() * .2 }); g.rotation.order = 'YXZ'; root.add(g); const a = actor(g, null, true);
      const from = i % 5 === 0 || i % 5 === 1 ? 0 : i % 5 === 2 || i % 5 === 3 ? 1 : 2; const sx = (r() - .5) * 2.4;
      if (from === 0) { g.position.set(sx, 0, -1.6 - r() * 2); pickSpot(a, Math.PI, 1.6); a.wpN = 0; addWp(a, g.position.x, g.position.z); seg(a, sx * .5, 9.4); seg(a, a.spot.x, a.spot.z); a.exit.set(sx, 0, -3); }
      else { const side = from === 1 ? -1 : 1; g.position.set(side * (15.5 + r() * 2), 0, 12.6 + sx); pickSpot(a, side * Math.PI / 2, 1.5); a.wpN = 0; addWp(a, g.position.x, g.position.z); seg(a, a.spot.x, a.spot.z); a.exit.set(side * 17, 0, 13); }
      finishRoute(a, 3.6 + r() * 1.6); actors.push(a); }
    buildWater(); buildCars(); buildFloors(); buildCrates(); buildFireworks(); buildCaptions(); buildPayin(); buildBags();
    return C;
  }
  function actor(g, home, extra) { return { g, home, extra, spot: new THREE.Vector3(), exit: new THREE.Vector3(), angle: 0, wp: new Float32Array(40), wpN: 0, wpI: 0, speed: 2, yaw: g.rotation.y, yawT: g.rotation.y, state: 'walk', hopT: -1, hopLen: .4, hopFrom: new THREE.Vector3(), hopTo: new THREE.Vector3(), look: 0, car: null, crate: null, busy: false, bob: r() * 6.28 }; }
  function pickSpot(a, sector, spread) { for (let k = 0; k < 40; k++) { a.angle = sector + (r() - .5) * spread * (1 + k / 12); const rad = 2.3 + r() * 1.0; a.spot.set(SQUARE.x + Math.sin(a.angle) * rad, 0, SQUARE.z + Math.cos(a.angle) * rad); if (!actors.some(o => o !== a && o.spot.distanceToSquared(a.spot) < .36) && a.spot.distanceToSquared(JAR_L) > 1.2) return; } }   // never on top of another gerbil (they used to share spots)
  function addWp(a, x, z) { if (a.wpN < 20) { a.wp[a.wpN * 2] = x; a.wp[a.wpN * 2 + 1] = z; a.wpN++; } }
  // add a leg, detouring round the fountain if the straight line would cross the basin
  function seg(a, x, z) { const fx = a.wp[(a.wpN - 1) * 2], fz = a.wp[(a.wpN - 1) * 2 + 1]; const dx = x - fx, dz = z - fz, len = Math.hypot(dx, dz); if (len > 1e-3) { const u = clamp(((SQUARE.x - fx) * dx + (SQUARE.z - fz) * dz) / (len * len), 0, 1); const cx = fx + dx * u, cz = fz + dz * u; const d = Math.hypot(cx - SQUARE.x, cz - SQUARE.z); if (d < FOUNTAIN_R + .6 && u > 0 && u < 1) { const k = (FOUNTAIN_R + .9) / Math.max(d, .05); addWp(a, SQUARE.x + (cx - SQUARE.x) * k, SQUARE.z + (cz - SQUARE.z) * k); } } addWp(a, x, z); }
  function routeLen(a) { let L = 0; for (let i = 1; i < a.wpN; i++) L += Math.hypot(a.wp[i * 2] - a.wp[i * 2 - 2], a.wp[i * 2 + 1] - a.wp[i * 2 - 1]); return L; }
  function finishRoute(a, seconds) { a.wpI = 1; a.state = 'walk'; a.speed = clamp(routeLen(a) / seconds, 1.4, 3.4); }
  function walk(a, dt, speed) { if (a.wpI >= a.wpN) return true; const tx = a.wp[a.wpI * 2], tz = a.wp[a.wpI * 2 + 1]; const dx = tx - a.g.position.x, dz = tz - a.g.position.z, d = Math.hypot(dx, dz), step = speed * dt;
    if (d <= step) { a.g.position.x = tx; a.g.position.z = tz; a.wpI++; return a.wpI >= a.wpN; } a.g.position.x += dx / d * step; a.g.position.z += dz / d * step; a.yawT = Math.atan2(dx, dz); return false; }
  function face(a, x, z) { a.yawT = Math.atan2(x - a.g.position.x, z - a.g.position.z); }
  function turn(a, dt, rate) { let d = a.yawT - a.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); a.yaw += d * Math.min(1, dt * rate); a.g.rotation.y = a.yaw; }
  function hop(a, h, len) { a.hopT = 0; a.hopLen = len; a.hopH = h; }

  // ---------- props ----------
  function buildWater() {
    const g = new THREE.Group(); g.position.copy(SQUARE); root.add(g);
    const waterM = D(new THREE.MeshPhysicalMaterial({ color: 0xbfe8ff, transparent: true, opacity: .8, roughness: .05, metalness: .05, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }));
    const col = new THREE.Mesh(D(new THREE.CylinderGeometry(.05, .13, 1, 12, 1, true)), waterM); col.position.y = 1.2; g.add(col);
    const disc = new THREE.Mesh(D(new THREE.SphereGeometry(1, 20, 10)), D(new THREE.MeshBasicMaterial({ color: 0xeaf7ff, transparent: true, opacity: .8, depthWrite: false }))); g.add(disc);   // the splash crown at the top of the jet
    const halo = new THREE.Mesh(D(new THREE.RingGeometry(.8, 1.35, 28)), D(new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: .35, depthWrite: false, side: THREE.DoubleSide }))); halo.rotation.x = -Math.PI / 2; halo.position.y = .45; g.add(halo);
    const n = 110; const geo = D(new THREE.BufferGeometry()); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); const ph = new Float32Array(n * 2); for (let i = 0; i < n; i++) { ph[i * 2] = r(); ph[i * 2 + 1] = (i / n) * Math.PI * 2 + r() * .2; }
    const drops = new THREE.Points(geo, D(new THREE.PointsMaterial({ map: D(softDot()), color: 0xe8f6ff, size: .3, transparent: true, opacity: .95, depthWrite: false }))); drops.frustumCulled = false; g.add(drops);
    water = { g, col, disc, halo, drops, ph, n, rise: 0 }; g.visible = false;
  }
  function buildCars() {
    cars = []; const stem = lots().filter(l => !l.far).sort((a, b) => b.z - a.z);   // the lead car takes the farthest house, so nobody passes a parked car
    for (let i = 0; i < Math.min(N_CARS, stem.length); i++) { const l = stem[i]; const side = l.x < 0 ? -1 : 1; const kind = i % 3 === 0 ? 'plain' : i % 3 === 1 ? 'ev' : 'race';
      const g = P(smallCar({ kind, len: .9, color: CAR_COLORS[i % CAR_COLORS.length] })); g.position.set(side * 1.45, 0, -.2); g.visible = false; root.add(g);
      cars.push({ g, lot: l, lane: side * 1.45, stopZ: l.z, state: 'wait', rider: null, passed: false, at: TIMELINE.cars + Math.floor(i / 2) * .45, pop: 0 }); }   // the street mouth, a pair at a time: they used to queue at z -3.2..-6.4, in the town square's fountain rim and planters
  }
  function buildFloors() {
    const n = lots().length; if (!n) return; floorPop = new Float32Array(n).fill(-1);
    floors = new THREE.InstancedMesh(D(upperFloorGeometry()), D(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85 })), n); roofs = new THREE.InstancedMesh(D(upperRoofGeometry()), D(new THREE.MeshStandardMaterial({ roughness: .8 })), n);
    floors.castShadow = roofs.castShadow = true; floors.frustumCulled = roofs.frustumCulled = false; root.add(floors, roofs);
    lots().forEach((l, i) => { roofs.setColorAt(i, _c.set(l.color)); writeFloor(i, 0); }); roofs.instanceColor.needsUpdate = true;
  }
  function writeFloor(i, s) { const l = lots()[i]; _p.set(l.x, 0, l.z); _qt.setFromAxisAngle(_axisY, l.ry); _s.set(Math.max(.001, l.w * s), Math.max(.001, s), Math.max(.001, s)); _m.compose(_p, _qt, _s); floors.setMatrixAt(i, _m); roofs.setMatrixAt(i, _m); floors.instanceMatrix.needsUpdate = roofs.instanceMatrix.needsUpdate = true; }
  function buildCrates() {
    crates = []; const canopyG = D(canopyGeometry()), canopyM = D(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7, side: THREE.DoubleSide })), lineM = D(new THREE.LineBasicMaterial({ color: 0x5a4a3a }));
    for (let i = 0; i < N_CRATES; i++) { const g = new THREE.Group(); const crate = P(makeCrate(.42)); g.add(crate);
      const chute = new THREE.Group(); const canopy = new THREE.Mesh(canopyG, canopyM); canopy.position.y = 1.5; canopy.castShadow = true; chute.add(canopy);
      const lg = D(new THREE.BufferGeometry()); const lp = []; for (const [x, z] of [[-.6, -.6], [.6, -.6], [.6, .6], [-.6, .6]]) lp.push(x * .3, .44, z * .3, x, 1.52, z); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); chute.add(new THREE.LineSegments(lg, lineM)); g.add(chute);
      const ang = Math.PI + .55 + (i / (N_CRATES - 1)) * (Math.PI * 2 - 1.1), rad = 1.65 + (i % 2) * .2; /* all round except the jar's side, between the basin (1.25) and the ring of gerbils (2.3+) */ g.position.set(SQUARE.x + Math.sin(ang) * rad, 7.6, SQUARE.z + Math.cos(ang) * rad); g.visible = false; root.add(g);
      crates.push({ g, chute, drop: TIMELINE.legos + i * .22, sway: r() * 6.28, landed: false, carrier: null, x: g.position.x, z: g.position.z }); }
  }
  function buildFireworks() {
    const per = FW_SPARKS * FW_STREAK + FW_TRAIL, total = FW_N * per; const geo = D(new THREE.BufferGeometry()); const pos = new Float32Array(total * 3), col = new Float32Array(total * 3); pos.fill(-100);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, D(new THREE.PointsMaterial({ map: D(softDot(1)), size: .62, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }))); pts.frustumCulled = false; root.add(pts);
    const shells = []; for (let i = 0; i < FW_N; i++) { const pal = FW_PALETTES[i % 3]; const cols = new Float32Array(FW_SPARKS * 3); for (let k = 0; k < FW_SPARKS; k++) { _c.set(pal[k % 3 === 0 ? 0 : r() < .7 ? 1 : 2]); cols.set([_c.r, _c.g, _c.b], k * 3); }
      shells.push({ t0: TIMELINE.fireworks + i * .46 + r() * .2, x: (r() - .5) * 15, z: 9 + r() * 9, h: 6.5 + r() * 3.2, rise: .9 + r() * .3, pal, cols, vel: new Float32Array(FW_SPARKS * 3), phase: 0, bt: 0, seed: r() * 100, n: 56 + Math.floor(r() * 17) }); }
    const flashM = D(new THREE.SpriteMaterial({ map: D(softDot(1)), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); fwFlash = [];
    for (let i = 0; i < FW_N; i++) { const s = new THREE.Sprite(flashM); s.visible = false; root.add(s); fwFlash.push(s); }
    fw = { pts, pos: geo.attributes.position, col: geo.attributes.color, shells, per };
    dusk = new THREE.Mesh(D(new THREE.SphereGeometry(260, 24, 12)), D(new THREE.MeshBasicMaterial({ color: 0x6a3f5a, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false, fog: false }))); dusk.visible = false; dusk.frustumCulled = false; dusk.renderOrder = -5; root.add(dusk);   // first of the transparents, so the sparks draw over it
  }
  function buildCaptions() {
    // the boys' words on a framed board over the square (textCanvas fits the font to the width; textSprite's canvas clips a long line)
    captions = ENDINGS.map(e => { const c = textCanvas(e.lines, { w: 1400, pad: 40 }); const tex = D(new THREE.CanvasTexture(c)); tex.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(D(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })));
      const w = 8.5; s.scale.set(w, w * c.height / c.width, 1); s.position.set(SQUARE.x, 5.6, SQUARE.z); s.visible = false; s.userData.w = s.scale.x; s.userData.h = s.scale.y; root.add(s); return { s, ...e }; });
  }

  // ---------- update ----------
  function update(dt, now = performance.now()) {
    if (!active || done || finished) return; dt = Math.min(dt, .1); const prev = t; t += dt;
    stepActors(dt, now, prev); stepPayin(dt, now, prev); stepLookout(); stepWater(dt, now); stepCars(dt, prev); stepFloors(dt, prev); stepCrates(dt, prev); stepFireworks(dt, prev); stepCaptions(dt); stepSay(); stepBags(dt);
    if (t >= TIMELINE.end) finish();
  }

  function stepActors(dt, now, prev) {
    // the cheer: two hop waves round the ring once the fountain leaps
    const cheer = t >= TIMELINE.fountain + .4 && t < TIMELINE.fountain + 3.2;
    if (t >= TIMELINE.fountain && !cheerPlayed) { cheerPlayed = true; sfx?.play?.('built'); }
    const lookUp = t >= TIMELINE.fireworks + .4;
    for (const a of actors) { let speed = 0, air = false;
      if (lookUp && a.state !== 'ride' && a.state !== 'hop') { if (a.state !== 'look') { a.state = 'look'; a.look = 0; } }
      switch (a.state) {
        case 'walk': speed = a.speed; if (walk(a, dt, speed)) { a.state = 'stand'; face(a, SQUARE.x, SQUARE.z); } break;
        case 'run': speed = RUN_SPEED; if (walk(a, dt, speed)) { if (a.car) { a.hopFrom.copy(a.g.position); a.hopTo.set(a.car.g.position.x, .3, a.car.g.position.z - .02); hop(a, .55, .45); a.state = 'hop'; a.next = 'ride'; sfx?.play?.('grab', { rate: 1.3 }); }
            else if (a.crate) { a.state = 'carry'; a.crate.g.visible = true; a.chuteOff = true; routeHome(a); } else a.state = 'stand'; } break;
        case 'carry': speed = 2.4; if (walk(a, dt, speed)) { a.state = 'stand'; if (a.home) { a.yawT = a.home.ry + Math.PI; a.crate.g.position.set(a.g.position.x + Math.sin(a.home.ry) * .4, 0, a.g.position.z + Math.cos(a.home.ry) * .4); a.crate = null; } }
          if (a.crate) a.crate.g.position.set(a.g.position.x, .36 + Math.abs(Math.sin(now / 90)) * .02, a.g.position.z); break;
        case 'hop': { a.hopT += dt; const u = clamp(a.hopT / a.hopLen, 0, 1); a.g.position.lerpVectors(a.hopFrom, a.hopTo, u); a.g.position.y += Math.sin(u * Math.PI) * a.hopH; air = u < .9; if (u >= 1) { a.state = a.next; a.hopT = -1; if (a.state === 'ride') a.yawT = 0; } break; }
        case 'ride': a.g.position.set(a.car.g.position.x, .3 + Math.sin(now / 400 + a.bob) * .01, a.car.g.position.z - .02); if (lookUp) a.look = Math.min(1, a.look + dt * 1.5); break;
        case 'look': a.look = Math.min(1, a.look + dt * 1.2); a.yawT = a.yaw; if (a.crate) a.crate.g.position.set(a.g.position.x, .36, a.g.position.z); if (a.hopT >= 0) { a.hopT += dt; const u = clamp(a.hopT / a.hopLen, 0, 1); a.g.position.y = Math.sin(u * Math.PI) * a.hopH; air = u < .85; if (u >= 1) a.hopT = -1; } else { a.g.position.y = 0; if (r() < dt * .25) hop(a, .2, .4); } break;
        case 'stand': default: {
          if (cheer && a.hopT < 0) { const wave = ((a.angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2); const at1 = TIMELINE.fountain + .4 + wave * 1.1, at2 = at1 + 1.35; if ((prev < at1 && t >= at1) || (prev < at2 && t >= at2)) hop(a, .32, .42); }
          if (a.hopT >= 0) { a.hopT += dt; const u = clamp(a.hopT / a.hopLen, 0, 1); a.g.position.y = Math.sin(u * Math.PI) * a.hopH; air = u < .85; if (u >= 1) a.hopT = -1; } else a.g.position.y = 0;
          if (a.crate && a.state === 'stand') { /* the box set down at the door stays */ }
          break; } }
      turn(a, dt, speed ? 8 : 3); a.g.rotation.x = -.55 * smooth(a.look); animateGerbil(a.g, { speed: speed * 2.2, airborne: air, now, dt }); }
    separate();
  }
  // walkers step round each other and round whoever is standing (riders and hoppers are on their own paths)
  const MOVING = new Set(['walk', 'run', 'carry']), FIXED = new Set(['ride', 'hop']);
  function separate() {
    for (let i = 0; i < actors.length; i++) { const a = actors[i]; if (FIXED.has(a.state)) continue; const pa = a.g.position;
      for (let j = i + 1; j < actors.length; j++) { const b = actors[j]; if (FIXED.has(b.state)) continue; const pb = b.g.position; const dx = pb.x - pa.x, dz = pb.z - pa.z, d = Math.hypot(dx, dz); if (d >= .48) continue;
        const ux = d > 1e-4 ? dx / d : 1, uz = d > 1e-4 ? dz / d : 0, o = .48 - d, wa = MOVING.has(a.state) ? 1 : .15, wb = MOVING.has(b.state) ? 1 : .15, k = o / (wa + wb);
        pa.x -= ux * k * wa; pa.z -= uz * k * wa; pb.x += ux * k * wb; pb.z += uz * k * wb; } }
  }
  function routeHome(a) { a.wpN = 0; addWp(a, a.g.position.x, a.g.position.z);
    if (a.home) { const h = a.home; if (!h.far) seg(a, JUNCTION.x, JUNCTION.z); seg(a, h.spine.x, h.spine.z); seg(a, h.street.x, h.street.z); seg(a, h.door.x, h.door.z); } else seg(a, a.exit.x, a.exit.z);
    a.wpI = 1; }

  // ---------- the pay-in: every billionaire in the data walks in and tosses a big bag into the jar; it overflows, the fountain jumps ----------
  function buildPayin() {
    jar = makeJar(); jar.position.copy(JAR_L); jar.rotation.y = Math.PI; jar.scale.setScalar(.001); jar.visible = false; jar.userData.setFill(.08); root.add(jar);
    let ids = (ctx.data?.bosses || []).map(b => b.id); if (!ids.length) ids = Object.keys(state?.beaten || {}); if (!ids.length) ids = ['trump', 'bezos', 'musk'];
    payers = ids.map((id, k) => { let g = null; try { g = ctx.makeBoss ? ctx.makeBoss(id) : makeBoss2(id, { scale: 1.35 }); } catch (e) { try { g = makeBoss(id, { scale: 1.4 }); } catch (e2) { return null; } }
      const side = k % 2 ? 1 : -1, j = k >> 1, spot = new THREE.Vector3(side * (4.3 + j * 1.6), 0, 12.5 + (j % 2) * .8);   // out on the bar, past the ring of gerbils, clear of the lamps
      g.position.set(side * (16 + j * 1.4), 0, spot.z); g.rotation.y = -side * Math.PI / 2; g.visible = false; root.add(g);
      const bag = makeBag(1.1); bag.visible = false; root.add(bag);
      return { id, g, B: g.userData.boss, spot, bag, side, k, walk: Math.abs(g.position.x - spot.x) / PAY_WALK, enterAt: 0, throwAt: 0, bt: -1, from: new THREE.Vector3() }; }).filter(Boolean);
    // the pace scales with how many there are: the last bag lands by PAY_LAST whatever the count (four keep the old 2.8 s gap; eight come in about every 1.2 s)
    const n = payers.length, lastWalk = n ? payers[n - 1].walk : 0, gap = n > 1 ? Math.min(PAY_GAP, Math.max(.5, (PAY_LAST - .4 - lastWalk - PAY_AIM - PAY_FLY) / (n - 1))) : PAY_GAP;
    payers.forEach((P, i) => { P.enterAt = TIMELINE.payin + .4 + i * gap; P.throwAt = P.enterAt + P.walk + PAY_AIM; });
  }
  function stepPayin(dt, now, prev) {
    if (!jar || t < TIMELINE.payin) return; const u = (t - TIMELINE.payin) / .5;
    if (!jar.visible) { jar.visible = true; sfx?.play?.('deliver', { step: 2 }); ctx.spawnBurst?.(scene, _p.copy(JAR_L).setY(.8).applyMatrix4(root.matrixWorld), 0xfff1d6, 14); }
    jar.scale.setScalar(Math.max(.001, easeOutBack(clamp(u, 0, 1))));
    const n = payers.length;
    for (const P of payers) { const g = P.g, Bc = P.B; if (t < P.enterAt) continue; if (!g.visible) { g.visible = true; Bc?.play?.('walk'); Bc?.setSpeed?.(PAY_WALK); }
      let anim = 'idle'; const dx = P.spot.x - g.position.x, dz = P.spot.z - g.position.z, d = Math.hypot(dx, dz);
      if (d > .05 && P.bt < 0) { const st = Math.min(d, PAY_WALK * dt); g.position.x += dx / d * st; g.position.z += dz / d * st; g.rotation.y = Math.atan2(dx, dz); anim = 'walk'; }
      else { let yd = Math.atan2(JAR_L.x - g.position.x, JAR_L.z - g.position.z) - g.rotation.y; yd = Math.atan2(Math.sin(yd), Math.cos(yd)); g.rotation.y += yd * Math.min(1, dt * 6); }
      if (P.bt < 0 && t >= P.throwAt) { P.bt = 0; P.from.copy(g.position).setY(1.7); P.bag.visible = true; sfx?.play?.('grab', { rate: .9 }); }
      if (P.bt >= 0 && P.bt < 1) { P.bt = Math.min(1, P.bt + dt / PAY_FLY); const k = P.bt; P.bag.position.lerpVectors(P.from, _q.copy(JAR_L).setY(1.5), k); P.bag.position.y += Math.sin(k * Math.PI) * 2.6; P.bag.rotation.y += dt * 3.5; P.bag.scale.setScalar(Math.max(.001, 1.1 * (1 - .55 * k)));
        if (P.bt >= 1) { P.bag.visible = false; jar.userData.setFill(Math.min(1, (jar.userData.fill?.() ?? 0) + .92 / Math.max(1, n)));
          { const K = kinds(), landed = payers.filter(Q => Q.bt >= 1).length, due = Math.min(K.length, Math.floor(landed / Math.max(1, n) * K.length + 1e-6)); while (lit < due) { const k = K[lit++]; setShared(k, true); line('lit_' + k, 0, `o3_lit_${k}`, KIND_SAY[k] || 'A light comes on!', '', 2000); } }   /* the lights come back in the order they went out */ sfx?.play?.('deliver', { step: payers.indexOf(P) % 5, volume: .9 }); ctx.spawnBurst?.(scene, _p.copy(JAR_L).setY(1.5).applyMatrix4(root.matrixWorld), 0xf2c230, 18); } }
      if (P.bt >= 0 && t < P.throwAt + PAY_FLY + 1.0) anim = 'cheer';
      if (Bc && Bc.current?.() !== anim) Bc.play(anim); Bc?.update?.(dt); }
    // the last bag in: the jar overflows, the fountain jumps, the whole ring hops
    if (!overflowed && n && payers.every(P => P.bt >= 1)) { overflowed = true; jumpT = t; sfx?.play?.('win'); for (let i = 0; i < 5; i++) ctx.spawnBurst?.(scene, _p.copy(JAR_L).setY(1.4 + i * .15).applyMatrix4(root.matrixWorld), i % 2 ? 0xf2c230 : 0xfff1d6, 22);
      for (const a of actors) if (a.state === 'stand' && a.hopT < 0) hop(a, .34, .42); }
    if (overflowed && t - jumpT < 2.5 && Math.random() < dt * 10) ctx.spawnBurst?.(scene, _p.copy(JAR_L).setY(1.5).applyMatrix4(root.matrixWorld), 0xf2c230, 5);   // coins spilling over the rim
  }
  // ---------- the lines: each voiced and mirrored on the caption, once ----------
  function line(key, at, clip, text, sub, ms) { if (t < at || said[key]) return; said[key] = true; if (ctx.caption) ctx.caption(text, sub, ms); else toast?.(text, { sub, ms }); ctx.play?.(clip, sub ? `${text} ${sub}` : text); }
  function stepSay() {
    line('share', TIMELINE.payin + SAY.share, 'cel3_share', 'In our story, this time everybody put in their share.', '', 3800);
    line('taxes', TIMELINE.payin + SAY.taxes, 'cel_taxes', 'That is what taxes are for.', '', 3400);
    for (const e of ENDINGS) line(e.clip, e.at + .3, e.clip, e.lines[0], '', 5600);
    line('sentence', TIMELINE.sentence, 'cel3_sentence', SENTENCE[0], SENTENCE[1], (TIMELINE.end - TIMELINE.sentence) * 1000);
  }
  // ---------- the picture (no words, no counts): the bright row that came home beside the long dim row they still have ----------
  function buildBags() {
    const bagUSD = ctx.data?.bag_usd || 434e6; const total = (ctx.data?.bosses || []).reduce((n, b) => n + Math.round((b.net_worth_usd || 0) / bagUSD), 0); leftN = Math.max(NEED * 8, total - NEED);
    const geo = D(new THREE.SphereGeometry(.09, 10, 7)); geo.scale(1, 1.15, 1);
    const mk = (n, mat) => { const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); m.frustumCulled = false; m.count = 0; m.visible = false; root.add(m); return m; };
    bagsHome = mk(NEED, D(new THREE.MeshStandardMaterial({ color: 0xf2c230, emissive: 0xb07a00, emissiveIntensity: .7, roughness: .4, metalness: .3 })));
    bagsLeft = mk(leftN, D(new THREE.MeshStandardMaterial({ color: 0x6d655a, roughness: .95, transparent: true, opacity: .55 })));
    const place = (m, i, x0) => { const col = Math.floor(i / BAG_ROWS), row = i % BAG_ROWS; _p.set(x0 - col * BAG_GAP, BAG_Y + row * BAG_GAP, BAG_Z); _m.makeTranslation(_p.x, _p.y, _p.z); m.setMatrixAt(i, _m); };
    for (let i = 0; i < NEED; i++) place(bagsHome, i, BAG_X0);
    const x1 = BAG_X0 - Math.ceil(NEED / BAG_ROWS) * BAG_GAP - .5; for (let i = 0; i < leftN; i++) place(bagsLeft, i, x1);
    bagsHome.instanceMatrix.needsUpdate = bagsLeft.instanceMatrix.needsUpdate = true;
  }
  function stepBags(dt) {
    if (!bagsHome || t < TIMELINE.whole || BAGS_OFF) return; /* (verify) the floating grid of bags read as a glitch in the sky; the lookout's Long Road is the picture */ const u = t - TIMELINE.whole;
    bagsHome.visible = true; bagsHome.count = Math.min(NEED, Math.floor(u / 1.0 * NEED));
    if (u > 1.4) { bagsLeft.visible = true; bagsLeft.count = Math.min(leftN, Math.floor((u - 1.4) / 2.6 * leftN)); }
    if (t >= (lr ? TIMELINE.lookout + .5 : TIMELINE.fireworks - .5)) bagsHome.visible = bagsLeft.visible = false;   // the sky is the fireworks', the lookout the Long Road's
  }
  function stepWater(dt, now) {
    const u = clamp((t - TIMELINE.fountain) / 1.6, 0, 1); if (u <= 0) return; water.g.visible = true; const k = easeOutBack(u) * .9 + .1 * smooth(u); water.rise = k;
    const jmp = jumpT >= 0 ? Math.sin(clamp((t - jumpT) / 1.8, 0, 1) * Math.PI) : 0; const H = 1.2 + 2.3 * k + 2.6 * jmp; water.col.scale.set(1, Math.max(.001, H - 1.2) || .001, 1); water.col.position.y = 1.2 + (H - 1.2) / 2; water.col.material.opacity = .75 * u;
    const cs = .5 * k + .06 * Math.sin(now / 420) * k; water.disc.position.y = H + .05 + Math.sin(now / 300) * .03; water.disc.scale.set(Math.max(.001, cs), Math.max(.001, cs * .5), Math.max(.001, cs)); water.disc.material.opacity = .8 * u;
    water.halo.scale.setScalar(Math.max(.001, k * (1 + .05 * Math.sin(now / 350)))); water.halo.material.opacity = .35 * u;
    const pos = water.drops.geometry.attributes.position, ph = water.ph; const T = t;
    for (let i = 0; i < water.n; i++) { const f = ((T * .8 + ph[i * 2]) % 1 + 1) % 1; const ang = ph[i * 2 + 1] + T * .15; const far = i % 3 === 0 ? 1.6 : 1.0; const rad = .1 + f * (FOUNTAIN_R * far) * k; const y = H - f * f * (H - .45) * 1.0 + Math.sin(f * Math.PI) * (.4 + .5 * far) * k;
      pos.setXYZ(i, Math.sin(ang) * rad, y, Math.cos(ang) * rad); } pos.needsUpdate = true; water.drops.material.opacity = .95 * u;
  }

  function stepCars(dt, prev) {
    if (t < TIMELINE.cars) return;
    for (const c of cars) { const g = c.g;
      if (c.state === 'wait') { if (t < c.at) continue; g.visible = true; c.state = 'drive'; c.pop = 0; }
      if (c.pop < 1) { c.pop = Math.min(1, c.pop + dt / .3); g.scale.setScalar(Math.max(.001, easeOutBack(c.pop))); }
      if (c.state === 'drive') { g.position.z += CAR_SPEED * dt; g.rotation.y = 0; if (!c.passed && g.position.z > -.5) { c.passed = true; sfx?.play?.('whoosh', { speed: .7, pan: c.lane > 0 ? .4 : -.4 }); }
        if (g.position.z >= c.stopZ) { g.position.z = c.stopZ; c.state = 'parked'; const a = actors.find(x => x.home === c.lot && !x.busy); if (a) { a.busy = true; a.car = c; c.rider = a; a.wpN = 0; addWp(a, a.g.position.x, a.g.position.z); seg(a, c.lane - Math.sign(c.lane) * .55, c.stopZ + .1); a.wpI = 1; a.state = 'run'; a.hopT = -1; a.g.position.y = 0; } } }
      else if (c.state === 'parked') { g.position.y = Math.abs(Math.sin(t * 9)) * .004; } }
  }

  function stepFloors(dt, prev) {
    if (!floors) return; const n = lots().length;
    for (let i = 0; i < n; i++) { const at = TIMELINE.stairs + .2 + i * .22; if (t < at) continue;
      if (floorPop[i] < 0) { floorPop[i] = 0; sfx?.play?.('deliver', { step: i % 5, volume: .8 }); ctx.spawnBurst?.(scene, _p.set(lots()[i].x, FOUND + HOUSE_H + 1.6, lots()[i].z).applyMatrix4(root.matrixWorld), 0xffd27a, 14); }
      if (floorPop[i] < .75) { floorPop[i] += dt; const k = clamp(floorPop[i] / .7, 0, 1); writeFloor(i, easeOutBack(k)); city?.sinkRoof?.(i, 1 - smooth(k * 1.6)); if (floorPop[i] >= .75) writeFloor(i, 1); } }   // the old gable sinks flat as the storey lands on it (it poked out of the new walls)
  }

  function stepCrates(dt, prev) {
    for (const c of crates) { if (t < c.drop) continue; const g = c.g;
      if (!g.visible) { g.visible = true; c.chute.scale.setScalar(.001); c.unfold = 0; }
      if (!c.landed) { c.unfold = Math.min(1, c.unfold + dt * 3); c.chute.scale.setScalar(Math.max(.001, easeOutBack(c.unfold))); const v = 1.3 + 3.4 * c.unfold; g.position.y -= v * dt; const sw = Math.sin(t * 2.2 + c.sway) * .06; g.rotation.z = sw * 1.8; g.position.x = c.x + sw * 2.5; g.position.z = c.z + Math.cos(t * 1.7 + c.sway) * .12;
        if (g.position.y <= 0) { g.position.y = 0; g.rotation.z = 0; g.position.x = c.x; g.position.z = c.z; c.landed = true; c.fold = 1; sfx?.play?.('step', { rate: .6, volume: .8 }); ctx.spawnBurst?.(scene, _p.set(c.x, .3, c.z).applyMatrix4(root.matrixWorld), 0xf2c230, 12);
          // the nearest gerbil who is free comes for it
          let best = null, bd = 1e9; for (const a of actors) { if (a.busy || a.state !== 'stand') continue; const d = a.g.position.distanceToSquared(g.position); if (d < bd) { bd = d; best = a; } }
          if (best) { best.busy = true; best.crate = c; c.carrier = best; best.wpN = 0; addWp(best, best.g.position.x, best.g.position.z); addWp(best, c.x, c.z); best.wpI = 1; best.state = 'run'; best.hopT = -1; best.g.position.y = 0; } } }
      else if (c.fold > 0) { c.fold = Math.max(0, c.fold - dt * 3.5); c.chute.scale.set(1, Math.max(.001, c.fold), 1); if (c.fold <= 0) c.chute.visible = false; } }
  }

  function stepFireworks(dt, prev) {
    if (!fw || t < TIMELINE.fireworks - 1.5) return; const pos = fw.pos, col = fw.col, per = fw.per;
    { const u = smooth((t - (TIMELINE.fireworks - 1.5)) / 2.5); dusk.visible = u > 0; dusk.material.opacity = .42 * u; }   // (verify) a warm dusk, not a storm: the sky stays light enough to feel like the answer
    if (t < TIMELINE.fireworks) return;
    for (let i = 0; i < fw.shells.length; i++) { const s = fw.shells[i]; const base = i * per; if (t < s.t0) continue;
      if (s.phase === 0) { if (prev < s.t0) sfx?.play?.('fire', { rate: 1.6, volume: .5, pan: clamp(s.x / 10, -1, 1) }); const u = clamp((t - s.t0) / s.rise, 0, 1); const y = (s.y0 || 0) + s.h * (1 - (1 - u) * (1 - u)); const x = s.x + Math.sin(u * 5 + s.seed) * .15 * (s.k || 1);
        for (let k = 0; k < FW_TRAIL; k++) { const uk = Math.max(0, u - k * .035); const yk = (s.y0 || 0) + s.h * (1 - (1 - uk) * (1 - uk)); pos.setXYZ(base + FW_SPARKS * FW_STREAK + k, x, yk, s.z); const b = (1 - k / FW_TRAIL) * (k ? .5 : 1.3); col.setXYZ(base + FW_SPARKS * FW_STREAK + k, b, b * .85, b * .6); }
        if (u >= 1) { s.phase = 1; s.bt = 0; s.cx = x; s.cy = y; sfx?.play?.('secret', { rate: .85 + r() * .5, volume: .7, pan: clamp(s.x / 10, -1, 1) });
          for (let k = 0; k < FW_SPARKS; k++) { const th = Math.acos(2 * r() - 1), phi = r() * Math.PI * 2; const sp = k < s.n ? (5 + r() * 4.5) * (s.k || 1) : 0; s.vel[k * 3] = Math.sin(th) * Math.cos(phi) * sp; s.vel[k * 3 + 1] = Math.cos(th) * sp; s.vel[k * 3 + 2] = Math.sin(th) * Math.sin(phi) * sp; for (let q = 0; q < FW_STREAK; q++) pos.setXYZ(base + k * FW_STREAK + q, x, y, s.z); }
          for (let k = 0; k < FW_TRAIL; k++) { pos.setXYZ(base + FW_SPARKS * FW_STREAK + k, 0, -100, 0); col.setXYZ(base + FW_SPARKS * FW_STREAK + k, 0, 0, 0); }
          const f = fwFlash[i]; f.visible = true; f.position.set(x, y, s.z); f.scale.setScalar(2.6 * (s.k || 1)); f.material.color.set(s.pal[0]); } }
      else if (s.phase === 1) { s.bt += dt; const life = 2.0, u = s.bt / life; const flash = fwFlash[i]; if (flash.visible) { flash.scale.setScalar(Math.max(.001, 2.6 * (s.k || 1) * (1 - s.bt / .25))); if (s.bt > .25) flash.visible = false; }
        if (u >= 1) { s.phase = 2; for (let k = 0; k < FW_SPARKS * FW_STREAK; k++) { pos.setXYZ(base + k, 0, -100, 0); col.setXYZ(base + k, 0, 0, 0); } }
        else { const fade = Math.pow(1 - u, .9), drag = Math.max(0, 1 - 1.5 * dt); s.shift = (s.shift || 0) + dt;
          for (let k = 0; k < s.n; k++) { const j = k * 3; s.vel[j] *= drag; s.vel[j + 1] = s.vel[j + 1] * drag - 4.0 * (s.k || 1) * dt; s.vel[j + 2] *= drag; const b3 = base + k * FW_STREAK;
            if (s.shift >= .05) { for (let q = FW_STREAK - 1; q > 0; q--) pos.setXYZ(b3 + q, pos.getX(b3 + q - 1), pos.getY(b3 + q - 1), pos.getZ(b3 + q - 1)); }   // the streak: where the head was
            pos.setXYZ(b3, pos.getX(b3) + s.vel[j] * dt, pos.getY(b3) + s.vel[j + 1] * dt, pos.getZ(b3) + s.vel[j + 2] * dt);
            const tw = u > .5 ? .5 + .5 * Math.sin(s.bt * 31 + k * 1.7) : 1; const b = fade * tw * (k % 7 === 0 ? 1.9 : 1.35);
            for (let q = 0; q < FW_STREAK; q++) { const bq = b * (q ? .55 / q : 1); col.setXYZ(b3 + q, s.cols[j] * bq, s.cols[j + 1] * bq, s.cols[j + 2] * bq); } }
          if (s.shift >= .05) s.shift = 0; } } }
    pos.needsUpdate = col.needsUpdate = true;
  }

  function stepCaptions(dt) {
    for (const c of captions) { const inT = (t - c.at) / .6, outT = (c.until - t) / .5; const vis = t >= c.at && t < c.until + .1; c.s.visible = vis; if (!vis) continue;
      const k = Math.min(easeOutBack(clamp(inT, 0, 1)), smooth(clamp(outT, 0, 1))); c.s.scale.set(c.s.userData.w * Math.max(.001, k), c.s.userData.h * Math.max(.001, k), 1); c.s.material.opacity = clamp(outT * 1.5, 0, 1); c.s.material.transparent = true; c.s.position.y = 5.6 + Math.sin(t * 1.3) * .08; }
  }

  // ---------- the camera: shots in the city's frame, blended ----------
  const SHOTS = [
    { at: TIMELINE.payin, pos: [0, 4.4, 3.4], look: [0, 1.5, 11.6], blend: 1.2 },          // the jar, the billionaires coming in from both sides to pay in
    { at: TIMELINE.down, pos: [0, 1.15, 6.4], look: [0, 1.35, 12.8], blend: 2.4 },          // down to gerbil height: the crowd round the leaping fountain
    { at: TIMELINE.cars, pos: [2.2, 1.5, -2.8], look: [0, .8, 7.0], blend: 2 },             // the cars come up the street past us
    { at: TIMELINE.stairs, pos: [1.5, 6.4, -5.5], look: [-.5, 1.8, 11], blend: 2.2 },
    { at: TIMELINE.legos, pos: [0, 5.0, .5], look: [0, 3.6, 12.8], blend: 2 },
    { at: TIMELINE.whole, pos: [1.0, 3.8, 5.0], look: [-.6, 5.5, 16.0], blend: 2.2 },      // the 60 bags and the row going off past the roofs
    { at: TIMELINE.fireworks, pos: [0, 4.0, -6], look: [0, 7.0, 13], blend: 2.5 },
  ];
  function shotAt(i, pos, look) { const k = Math.max(0, i); pos.fromArray(SHOTS[k].pos); look.fromArray(SHOTS[k].look); }   // (verify) it opens on the jar shot: the old shoulder shot framed only the Lego store
  // the scripted shot at time tt, in world coordinates
  function baseShot(tt) {
    let i = SHOTS.length - 1; while (i > 0 && SHOTS[i].at > tt) i--; const s = SHOTS[i]; const u = smooth((tt - s.at) / s.blend);
    shotAt(i - 1, camA, camB); camPos.copy(camA); camLook.copy(camB); shotAt(i, camA, camB); camPos.lerp(camA, u); camLook.lerp(camB, u);
    // a slow breath so a held shot is never dead
    camPos.x += Math.sin(tt * .35) * .25; camPos.y += Math.sin(tt * .5 + 1) * .08;
    root.localToWorld(camPos); root.localToWorld(camLook);
  }
  function cameraTarget() {
    if (!root) return null;
    if (lookShot && t >= TIMELINE.lookout) { const u = smooth((t - TIMELINE.lookout) / LOOK_EASE); camPos.lerpVectors(lookShot.fromP, lookShot.pos, u); camLook.lerpVectors(lookShot.fromL, lookShot.look, u); return { pos: camPos, look: camLook }; }
    baseShot(t); return { pos: camPos, look: camLook };
  }
  // the lookout: every billionaire's row on the Long Road, seen from the hill (world coords from lr.lookoutShot), eased in over LOOK_EASE s;
  // the fireworks move over the valley, scaled to the distance
  function stepLookout() {
    if (!lr || lookShot || t < TIMELINE.lookout) return;
    try {
      const ids = (ctx.data?.bosses || []).map(b => b.id); lr.restore?.(ids.length ? ids : Object.keys(state?.beaten || {})); lr.setVisible?.(true);
      const from = ctx.hillTop?.isVector3 ? ctx.hillTop : ctx.hub?.hillTop?.isVector3 ? ctx.hub.hillTop : HILL; const s = lr.lookoutShot?.(from);
      if (!s?.pos || !s?.look) { lr = null; return; }
      baseShot(TIMELINE.lookout); lookShot = { pos: s.pos.clone(), look: s.look.clone(), fromP: camPos.clone(), fromL: camLook.clone() };
    } catch (e) { console.warn('lookout', e); lr = null; lookShot = null; return; }
    if (fw) { const c = root.worldToLocal(lookShot.look.clone()), cam = root.worldToLocal(lookShot.pos.clone()); const k = clamp(lookShot.pos.distanceTo(lookShot.look) / 14, 1, 8); valleyFw = true;
      _s.copy(c).sub(cam).setY(0); const span = Math.max(14, _s.length() * .9); const side = new THREE.Vector3(-_s.z, 0, _s.x).normalize(); _s.normalize();
      for (const sh of fw.shells) { const a = (r() - .5) * span, b = (r() - .2) * span * .5; sh.x = c.x + side.x * a + _s.x * b; sh.z = c.z + side.z * a + _s.z * b; sh.y0 = c.y; sh.h *= k * .8; sh.k = k; }
      fw.pts.material.size = .62 * k; if (dusk) dusk.position.copy(cam); }
  }

  // ---------- the end ----------
  function skip() { if (!active || finished) return; t = Math.max(t, TIMELINE.end); finish(); }
  function finish() {
    if (finished) return; finished = true; sfx?.play?.('win');
    const friends = Object.values(state?.friends || {}).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0); const secrets = Object.keys(state?.eggs || {}).length; const name = NAMES?.[state?.player] || 'The gerbil';
    const body = `<p>There's enough for everybody now.</p>
<p><b>${name}</b> went all the way up the road and back.<br>You freed ${friends ? 'your friends' : 'the market'}${secrets ? ' and found secrets' : ''}.</p>
<p class="sub">The street is back, the fountain runs, and everyone is home.</p>
<p><b>${SENTENCE[0]}</b> ${SENTENCE[1]}</p>`;
    const n = payers.length || 4, nWord = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][n] || String(n);
    const end = again => { closeCard?.(); if (again) { if (state) state.beaten = {}; } done = true; active = false; dispose(); onDone?.({ again }); };
    // 'Back to the market' is the default; 'Play again' only opens a confirm, and only its yes wipes the progress
    const ask = () => card('Start over?', `<p>All ${nWord} billionaires come back.</p>`, [{ label: 'No, keep my market', sel: true, on: () => { closeCard?.(); show(); } }, { label: 'Yes, start over', on: () => end(true) }]);
    // (verify) silent: the one sentence, said at the lookout, stays the last thing the child hears; the card shows it again as its last line
    const show = () => card('Everybody put in.', body, [{ label: 'Back to the market', sel: true, go: true, on: () => end(false) }, { label: 'Play again', on: () => ask() }], { silent: true });
    if (card) show(); else end(false);
  }

  function dispose() {
    if (!root) return; scene.remove(root);
    for (const a of actors) if (a.extra) a.g.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m?.dispose?.()); });   // the hamster geometry is shared: keep it
    for (const o of props) o.traverse(m => { if (m.isMesh) { m.geometry?.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x?.dispose?.()); } });   // props' textures are memoised in props.js: materials only
    if (floorPop) for (let i = 0; i < floorPop.length; i++) if (floorPop[i] >= 0) city?.sinkRoof?.(i, 1);
    for (const { tp, kid } of taken) { if (kid) { tp.state = 'play'; tp.g.rotation.set(0, 0, 0); tp.g.rotation.order = 'XYZ'; tp.g.position.y = 0; continue; } const home = lots()[tp.home]; tp.g.rotation.set(0, 0, 0); tp.g.rotation.order = 'XYZ'; tp.g.position.y = 0; if (home) { tp.g.position.set(home.door.x, 0, home.door.z); tp.yaw = tp.yawT = home.ry + Math.PI; tp.g.rotation.y = tp.yaw; } tp.state = 'idle'; tp.t = 1 + r() * 3; tp.hop = 0; tp.hopT = 1 + r() * 2; }
    for (const d of disposables) { if (d.isObject3D) d.traverse(o => { if (o.isMesh || o.isLine || o.isPoints) { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m?.map?.dispose?.(); m?.dispose?.(); }); } }); else { d.map?.dispose?.(); d.dispose?.(); } }
    for (const P of payers) { P.g.userData.boss?.mixer?.stopAllAction?.(); P.bag.traverse(o => { if (o.isMesh) o.geometry?.dispose(); }); } payers = []; jar?.userData.dispose?.(); jar = null; jumpT = -1; overflowed = false;
    disposables.length = 0; props.length = 0; actors = []; taken = []; cars = []; crates = []; captions = []; fwFlash = []; fw = water = floors = roofs = floorPop = dusk = null; bagsHome = bagsLeft = null; lookShot = null; lr = null; root = null; active = false;
  }
  return C;
}
