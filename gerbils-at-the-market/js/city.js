// city.js — the city that rebuilds. A T-shaped street of 15 burned-out lots behind the market stalls; every bag the kid
// delivers (setProgress) crumbles one ruin, pops up a cheerful house and brings a gerbil townsperson home. As the street
// fills it brightens: lamps light one by one, flowers appear, bunting at 60%, the fountain runs at 100%.
// Local frame: origin = the street entrance (the arena side), the street runs along +z, x across; the whole city fits in
// x ∈ [-15, 15], z ∈ [-.5, 19.5] (30 m × 20 m). Everything is instanced or merged: the static city is ~30 draw calls.
// The paper look (P.artMode() 'paper', docs/ART-DIRECTION.md): toon materials in the palette, no PBR textures, and an ink twin per
// house InstancedMesh (BackSide, the shape pushed out .035 m along its normals, sharing the house's instance matrices).
// cameraBoxes() → world Box3 per built house (the town camera keeps out of them).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { roundedBox, MAT, PALETTE, textCanvas, makeSign, shadows, animateGerbil } from './props.js';
import * as P from './props.js';

// ---------- constants ----------
const HOUSE_W = 2.4, HOUSE_D = 2.0, HOUSE_H = 2.1, FOUND = .2;   // the house unit: walls W wide (across the front), D deep, on a FOUND-high slab
const STREET_HALF = 2.4, STEM_LEN = 11, BAR_Z0 = 11, BAR_Z1 = 15, SQUARE = new THREE.Vector3(0, 0, 12.8), FOUNTAIN_R = 1.0;
const POP_T = .8, CRUMBLE_T = .55, FALL_T = .9, LANE = .25, PERSONAL = .5;   // LANE: walkers keep right by this much; PERSONAL: two gerbils never stand closer
const ROOF_COLORS = [PALETTE.red, PALETTE.blue, PALETTE.green, 0xe07a2a, 0x8a5bb5, 0x2a9d8f, PALETTE.yellow, 0xc44d6e];
const BODY_TINTS = [0xffffff, 0xfff4e2, 0xf6fbff, 0xfff9ec, 0xf8f3ff];
// townsfolk coats: blue tints over the orange-and-white hamster texture (the coat multiplies it; ~#5a87ff cancels the orange to
// grey), so they read grey and slate. None in Molly's tan (#f0d2a0, her title icon) or a rust orange near it, so she never gets lost in a crowd
const COATS = [0x5a87ff, 0x6f8fe8, 0x80a0ff, 0x3a4a80, 0x8a9ae0, 0x4a70d8, 0x6a7ab8, 0x50608f, 0x7090f0, 0x465a9a];
const FLAG_COLORS = [PALETTE.red, PALETTE.yellow, PALETTE.blue, PALETTE.green, PALETTE.pink, 0xffffff];
const GROUND_SAD = new THREE.Color(0x8c8a84), GROUND_HAPPY = new THREE.Color(0x9fbb78);
const STREET_SAD = new THREE.Color(0x615e5a), STREET_HAPPY = new THREE.Color(0xc9b99c);
const WIN_UNLIT = new THREE.Color(0x7d98ad), WIN_LIT = new THREE.Color(2.0, 1.35, .5);
const LAMP_UNLIT = new THREE.Color(0x5a6065), LAMP_LIT = new THREE.Color(1.7, 1.15, .38);

// the paper look's mood colours: the grass and sand of the palette when the street is full
const GROUND_SAD_P = new THREE.Color(0x9a978c), GROUND_HAPPY_P = new THREE.Color(0x8cc067), STREET_SAD_P = new THREE.Color(0x77736c), STREET_HAPPY_P = new THREE.Color(0xe9d09c);
let _grad = null;
function toonGrad() { if (_grad) return _grad; const c = document.createElement('canvas'); c.width = 3; c.height = 1; const g = c.getContext('2d'); ['#8c8c96', '#d2d2d6', '#ffffff'].forEach((col, i) => { g.fillStyle = col; g.fillRect(i, 0, 1, 1); }); _grad = new THREE.CanvasTexture(c); _grad.minFilter = _grad.magFilter = THREE.NearestFilter; _grad.generateMipmaps = false; return _grad; }
// my own MeshToonMaterial (cloned from props' when it has one, so a cached material is never changed under someone else)
function toonM(color, extra = {}) { const base = P.toonMat?.(color); const m = base?.isMaterial ? base.clone() : new THREE.MeshToonMaterial({ color, gradientMap: toonGrad() }); m.color.set(color); m.setValues(extra); return m; }
// an ink hull of a local-space shape: positions only, welded, pushed out along the smoothed normals
function hullGeometry(geo, w = .035) {
  let h = new THREE.BufferGeometry(); h.setAttribute('position', geo.attributes.position.clone()); if (geo.index) h.setIndex(geo.index.clone()); h = mergeVertices(h, 1e-4); h.computeVertexNormals();
  const p = h.attributes.position, n = h.attributes.normal; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * w, p.getY(i) + n.getY(i) * w, p.getZ(i) + n.getZ(i) * w); return h;
}
// the house's outline shape: the slab, the walls and the chimney (the small trim would only blot)
function houseHullGeometry() { const W = HOUSE_W, D = HOUSE_D, H = HOUSE_H, F = FOUND; const parts = [new THREE.BoxGeometry(W + .3, F, D + .3).translate(0, F / 2, 0), new THREE.BoxGeometry(W, H, D).translate(0, F + H / 2, 0), new THREE.BoxGeometry(.34, 1.25, .34).translate(-.72, F + H + .45, -.45)];
  const hs = parts.map(g => { const h = hullGeometry(g); g.dispose(); return h.toNonIndexed(); }); const out = mergeGeometries(hs, false); hs.forEach(h => h.dispose()); return out; }

// scratch (no allocations per frame)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _axisY = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const smooth = t => t * t * (3 - 2 * t);

// ---------- canvases ----------
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function cobbleTexture(r) {
  const [c, g] = canvas(256, 256); g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) for (let i = -1; i < 9; i++) { const x = i * 32 + (row % 2) * 16, y = row * 32; const l = 190 + r() * 60; g.fillStyle = `rgb(${l},${l - 4},${l - 8})`; g.beginPath(); g.roundRect(x + 2, y + 2, 28, 28, 9); g.fill(); g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.roundRect(x + 5, y + 4, 22, 8, 5); g.fill(); }
  for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(0,0,0,${(r() * .12).toFixed(3)})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;   // greyscale: linear, the material colour carries the mood
}
function shingleTexture(r) {
  const [c, g] = canvas(256, 256); g.fillStyle = '#a8a8a8'; g.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 6; row++) for (let i = -1; i < 5; i++) { const x = i * 64 + (row % 2) * 32, y = row * 44; const l = 232 + (r() - .5) * 30; g.fillStyle = `rgb(${l},${l},${l})`; g.beginPath(); g.roundRect(x + 2, y, 60, 50, 8); g.fill(); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + 4, y + 2, 56, 6); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
function softDot() {
  const [c, g] = canvas(64, 64); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(.5, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ---------- geometry helpers: coloured boxes merged into one vertex-coloured geometry ----------
function colored(geo, hex) { const n = geo.attributes.position.count; const a = new Float32Array(n * 3); _c.set(hex); for (let i = 0; i < n; i++) a.set([_c.r, _c.g, _c.b], i * 3); geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; }
function box(w, h, d, x, y, z, hex, ry = 0, rz = 0, rx = 0) { const g = new THREE.BoxGeometry(w, h, d); if (rx || ry || rz) { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); } g.translate(x, y, z); return colored(g, hex); }
function merge(parts) { const g = mergeGeometries(parts, false); parts.forEach(p => p.dispose()); return g; }

// The house body: slab, walls, posts, door, window frames and boxes, chimney, doorstep. One vertex-coloured geometry, base at y=0, door toward +z.
function houseBodyGeometry() {
  const W = HOUSE_W, D = HOUSE_D, H = HOUSE_H, F = FOUND; const cream = PALETTE.cream, wood = 0x8a5a30, door = 0x6b4423, stone = 0x9c968c, dark = 0x6b655f; const P = [];
  P.push(box(W + .3, F, D + .3, 0, F / 2, 0, stone));
  P.push(box(W, H, D, 0, F + H / 2, 0, cream));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(box(.12, H + .02, .12, sx * W / 2, F + H / 2, sz * D / 2, wood));
  P.push(box(W + .14, .09, .1, 0, F + H, D / 2, wood));
  P.push(box(.72, 1.3, .08, 0, F + .65, D / 2 + .03, door)); P.push(box(.86, .08, .12, 0, F + 1.33, D / 2 + .03, wood)); for (const s of [-1, 1]) P.push(box(.08, 1.36, .12, s * .4, F + .68, D / 2 + .03, wood));
  P.push(box(.34, .3, .02, 0, F + .95, D / 2 + .075, 0xf2c230));   // a little panel on the door
  const win = (x, y, z, ry) => { const g = new THREE.Group(); const parts = []; const add = (w, h, d, px, py, pz, hex) => parts.push(box(w, h, d, px, py, pz, hex)); add(.7, .07, .1, 0, .33, .02, wood); add(.7, .07, .14, 0, -.33, .04, wood); for (const s of [-1, 1]) add(.07, .66, .1, s * .33, 0, .02, wood); add(.03, .6, .05, 0, 0, .02, wood); add(.6, .03, .05, 0, 0, .02, wood); add(.66, .14, .16, 0, -.45, .1, wood);
    const m = merge(parts); m.rotateY(ry); m.translate(x, y, z); return m; };
  P.push(win(-.72, F + 1.25, D / 2, 0), win(.72, F + 1.25, D / 2, 0), win(-W / 2, F + 1.25, 0, -Math.PI / 2), win(W / 2, F + 1.25, 0, Math.PI / 2));
  P.push(box(.34, 1.25, .34, -.72, F + H + .45, -.45, stone)); P.push(box(.42, .08, .42, -.72, F + H + 1.08, -.45, dark));
  P.push(box(1.0, .1, .5, 0, .05, D / 2 + .3, stone));
  const g = merge(P); g.computeVertexNormals(); return g;
}
// Roofs: a closed solid (so the gable ends are roof-coloured boards), overhanging .3; three shapes.
function roofGeometry(kind) {
  const W = HOUSE_W + .6, D = HOUSE_D + .6, y0 = FOUND + HOUSE_H - .05;
  if (kind === 2) { // hip: a squat pyramid
    const g = new THREE.ConeGeometry(1, 1, 4, 1); g.rotateY(Math.PI / 4); g.scale(W / Math.SQRT2 * 1.02, .95, D / Math.SQRT2 * 1.02); g.translate(0, y0 + .475, 0);
    const cap = new THREE.BoxGeometry(.3, .1, .3); cap.translate(0, y0 + .95, 0); const m = merge([g.toNonIndexed(), cap.toNonIndexed()]); m.computeVertexNormals(); return m;
  }
  const rise = kind === 1 ? 1.45 : .95; const sh = new THREE.Shape(); sh.moveTo(-W / 2, 0); sh.lineTo(W / 2, 0); sh.lineTo(0, rise); sh.closePath();
  const prism = new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false }); prism.translate(0, 0, -D / 2);
  const ridge = new THREE.BoxGeometry(.22, .1, D + .1); ridge.translate(0, rise + .02, 0);   // along the ridge line (z): a bar across x stuck out of both slopes
  const g = merge([prism, ridge.toNonIndexed()]); g.translate(0, y0, 0); g.computeVertexNormals();
  const uv = g.attributes.uv, pos = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * .8, (pos.getY(i) + pos.getZ(i) * .5) * .8); return g;
}
// Window panes (2 front, 2 side): unlit glass or warm glow by instance colour.
function windowGeometry() { const P = []; const pane = (x, y, z, ry) => { const g = new THREE.PlaneGeometry(.6, .6); g.rotateY(ry); g.translate(x, y, z); return colored(g, 0xffffff); };
  P.push(pane(-.72, FOUND + 1.25, HOUSE_D / 2 + .005, 0), pane(.72, FOUND + 1.25, HOUSE_D / 2 + .005, 0), pane(-HOUSE_W / 2 - .005, FOUND + 1.25, 0, -Math.PI / 2), pane(HOUSE_W / 2 + .005, FOUND + 1.25, 0, Math.PI / 2)); return merge(P); }
// Garden: a lawn, stepping stones to the street, a red mailbox on a post, a little hedge at the back corners.
function gardenGeometry() { const P = []; const D = HOUSE_D; const lawn = 0x7fb15a, stone = 0xb5ab98, wood = 0x7a5a3a, red = PALETTE.red;
  P.push(box(HOUSE_W + .7, .012, D + 3.2, 0, .008, .9, lawn));
  for (let i = 0; i < 4; i++) P.push(box(.5 - i * .03, .035, .34, (i % 2 ? .06 : -.06), .03, D / 2 + .75 + i * .42, stone));
  const MZ = D / 2 + 1.0; P.push(box(.06, .85, .06, 1.05, .43, MZ, wood)); P.push(box(.24, .2, .34, 1.05, .95, MZ, red)); P.push(box(.03, .14, .06, 1.19, 1.1, MZ + .07, PALETTE.yellow));   // the mailbox sits back from the street (at D/2 + 1.45 walkers on the far row's lane brushed it, and it met the first lamp)
  for (const s of [-1, 1]) P.push(box(.5, .4, .5, s * (HOUSE_W / 2 + .45), .2, -D / 2 + .2, 0x4e8f3a));
  const g = merge(P); g.computeVertexNormals(); return g; }
function lampGeometry() { const P = []; const g1 = new THREE.CylinderGeometry(.12, .15, .16, 10); g1.translate(0, .08, 0); P.push(colored(g1, 0x2f4a3a));
  const g2 = new THREE.CylinderGeometry(.035, .05, 2.5, 8); g2.translate(0, 1.4, 0); P.push(colored(g2, 0x2f4a3a)); P.push(box(.3, .06, .3, 0, 2.66, 0, 0x2f4a3a)); P.push(box(.22, .06, .22, 0, 3.02, 0, 0x2f4a3a));
  for (const s of [-1, 1]) { P.push(box(.03, .36, .03, s * .14, 2.84, .14, 0x2f4a3a)); P.push(box(.03, .36, .03, s * .14, 2.84, -.14, 0x2f4a3a)); }
  const g = merge(P.map(p => p.index ? p.toNonIndexed() : p)); g.computeVertexNormals(); return g; }

// ---------- the city ----------
export function createCity(ctx) {
  const { scene } = ctx; const gerbilFrom = ctx.gerbilFrom, spawnBurst = ctx.spawnBurst;
  let group = null, houses = 15, progress = 0, lots = [], disposables = [], townsfolk = [], kid = null, moodShown = 0, moodTarget = 0, built = 0, r = rng(7);
  let IM = {}, ruin = {}, smoke = null, sign = null, bunting = null, fountain = null, ground = null, street = null, lamps = null, lampGlow = null, flowers = null, stems = null;
  let animating = []; // lots whose matrices change this frame
  let PAPER = false, gSad = GROUND_SAD, gHappy = GROUND_HAPPY, sSad = STREET_SAD, sHappy = STREET_HAPPY, inkMat = null, camBoxes = [], camKey = '';
  const api = { group: null, get progress() { return progress; }, get kid() { return kid; }, mood: () => houses ? progress / houses : 0, lots, townsfolk, build, setProgress, collapse, update, dispose, sinkRoof, cameraBoxes };

  function layout(n) {
    // stem: 3 lots per side facing the street; bar: the far row facing the entrance; everything else is the overflow pattern
    const L = []; const stemZ = [2.2, 5.3, 8.4];
    for (const z of stemZ) { L.push({ x: -5.3, z, ry: Math.PI / 2 }); L.push({ x: 5.3, z, ry: -Math.PI / 2 }); }
    const far = n - L.length, pitch = Math.min(3.3, 29.6 / Math.max(1, far)); for (let i = 0; i < far; i++) L.push({ x: (i - (far - 1) / 2) * pitch, z: 17.6, ry: Math.PI });
    for (const l of L) { l.d2 = l.x * l.x + l.z * l.z; } L.sort((a, b) => a.d2 - b.d2);   // build order: nearest the entrance first
    L.forEach((l, i) => { l.i = i; l.w = .92 + r() * .16; l.roof = i % 3 === 0 ? 2 : (i % 3 === 1 ? 0 : 1); if (i % 5 === 4) l.roof = 0; l.color = ROOF_COLORS[(i * 3) % ROOF_COLORS.length]; l.tint = BODY_TINTS[i % BODY_TINTS.length];
      l.built = false; l.pop = -1; l.crumble = -1; l.fall = -1; l.lit = false; l.flowerFrom = 0; l.flowerN = 0;
      // doorstep, the street point in front of the garden and the spine point (the street's centre line)
      const sn = Math.sin(l.ry), cs = Math.cos(l.ry); const fwd = (k, out) => out.set(l.x + sn * k, 0, l.z + cs * k);
      l.door = fwd(HOUSE_D / 2 + .5, new THREE.Vector3()); l.street = fwd(HOUSE_D / 2 + 2.3, new THREE.Vector3());
      l.spine = l.ry === Math.PI ? new THREE.Vector3(l.x, 0, 14.45) : new THREE.Vector3(0, 0, l.z); l.far = l.ry === Math.PI; });
    return L;
  }

  function build(origin, { houses: n = 15, facing = 0, seed = 7 } = {}) {
    if (group) dispose();
    PAPER = P.artMode?.() === 'paper'; [gSad, gHappy, sSad, sHappy] = PAPER ? [GROUND_SAD_P, GROUND_HAPPY_P, STREET_SAD_P, STREET_HAPPY_P] : [GROUND_SAD, GROUND_HAPPY, STREET_SAD, STREET_HAPPY]; camKey = '';
    // a material: HEAD's in the old look, toon (same colour, maps dropped unless kept) in paper
    const M = (old, paper) => PAPER ? paper() : old();
    r = rng(seed); houses = n; progress = 0; built = 0; moodShown = moodTarget = 0; animating.length = 0; townsfolk.length = 0; kid = null;
    group = new THREE.Group(); group.position.copy(origin); group.rotation.y = facing; scene.add(group); api.group = group; lots = layout(n); api.lots = lots;
    const D = o => { disposables.push(o); return o; };
    // ground: the city's own patch, grey ash to green with the mood
    ground = new THREE.Mesh(D(new THREE.PlaneGeometry(30, 20)), D(M(() => new THREE.MeshStandardMaterial({ color: GROUND_SAD.clone(), roughness: 1 }), () => new THREE.MeshLambertMaterial({ color: gSad.clone() })))); ground.rotation.x = -Math.PI / 2; ground.position.set(0, .005, 9.5); ground.receiveShadow = true; group.add(ground);
    // the street: stem + bar + square in one cobbled geometry
    const cob = D(cobbleTexture(r)); { const stem = new THREE.PlaneGeometry(STREET_HALF * 2, STEM_LEN + 1); stem.rotateX(-Math.PI / 2); stem.translate(0, 0, (STEM_LEN + 1) / 2 - .6);
      const bar = new THREE.PlaneGeometry(30, BAR_Z1 - BAR_Z0); bar.rotateX(-Math.PI / 2); bar.translate(0, 0, (BAR_Z0 + BAR_Z1) / 2); const sq = new THREE.CircleGeometry(3.1, 36); sq.rotateX(-Math.PI / 2); sq.translate(SQUARE.x, 0, SQUARE.z);
      for (const g of [stem, bar, sq]) { const uv = g.attributes.uv, pos = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * .7, pos.getZ(i) * .7); }
      street = new THREE.Mesh(D(merge([stem, bar, sq])), D(M(() => new THREE.MeshStandardMaterial({ map: cob, color: STREET_SAD.clone(), roughness: .95 }), () => new THREE.MeshLambertMaterial({ color: sSad.clone() })))); street.position.y = .02; street.receiveShadow = true; group.add(street); }
    // the sign at the entrance, facing -x: the town's camera always looks up the road (+x), so it reads face-on
    sign = makeSign(['Gerbil Street · 0 homes'], { width: 2.6, postHeight: 1.7 }); sign.position.set(-3.6, 0, -.1); sign.rotation.y = -Math.PI / 2 - facing; group.add(sign); D(sign);
    // lamp posts (instanced) and their glass (instanced, lit by progress)
    const lampPos = [[-2.75, .45], [2.75, .45], [-2.75, 3.75], [2.75, 3.75], [-2.75, 6.85], [2.75, 6.85], [-4.3, 10.6], [4.3, 10.6], [-8.6, 10.6], [8.6, 10.6], [-13, 10.6], [13, 10.6]];
    lamps = new THREE.InstancedMesh(D(lampGeometry()), D(M(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, metalness: .3 }), () => toonM(0xffffff, { vertexColors: true }))), lampPos.length); lamps.castShadow = true; lamps.receiveShadow = true;
    lampGlow = new THREE.InstancedMesh(D(new THREE.SphereGeometry(.11, 10, 8)), D(new THREE.MeshBasicMaterial({ color: 0xffffff })), lampPos.length);
    lampPos.forEach(([x, z], i) => { _m.makeTranslation(x, 0, z); lamps.setMatrixAt(i, _m); _m.makeTranslation(x, 2.84, z); lampGlow.setMatrixAt(i, _m); lampGlow.setColorAt(i, LAMP_UNLIT); }); lampGlow.userData.pos = lampPos; group.add(lamps, lampGlow);
    // bunting: strings of flags between the posts, unfurls at 60%
    bunting = makeBunting(lampPos, D); bunting.scale.y = .001; bunting.visible = false; group.add(bunting);
    // the fountain: a dry stone basin from the start; the column and water at 100%
    fountain = makeFountain(D); fountain.position.copy(SQUARE); group.add(fountain);
    // ruins: wall stumps + a fallen beam, rubble, broken fence, a scorch patch, smoke wisps
    buildRuins(D);
    // houses: body, three roof shapes, windows, gardens, flowers; all instanced with the lot's matrix; scale 0 until built
    IM.body = new THREE.InstancedMesh(D(houseBodyGeometry()), D(M(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85 }), () => toonM(0xffffff, { vertexColors: true }))), n);
    const shingle = D(shingleTexture(r)); IM.roof = [0, 1, 2].map(k => new THREE.InstancedMesh(D(roofGeometry(k)), D(M(() => new THREE.MeshStandardMaterial({ map: shingle, roughness: .8 }), () => toonM(0xffffff))), n));
    IM.win = new THREE.InstancedMesh(D(windowGeometry()), D(new THREE.MeshBasicMaterial({ vertexColors: true })), n);
    IM.garden = new THREE.InstancedMesh(D(gardenGeometry()), D(M(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 }), () => toonM(0xffffff, { vertexColors: true }))), n);
    for (const im of [IM.body, ...IM.roof, IM.win, IM.garden]) { group.add(im); im.frustumCulled = false; }
    // paper: an ink twin per house mesh (body and the three roofs), driven by the same instance matrices (the attribute is shared)
    IM.ink = []; if (PAPER) { inkMat = D(new THREE.MeshBasicMaterial({ color: P.PAL?.ink ?? 0x3b2516, side: THREE.BackSide })); inkMat.userData.ink = true;
      for (const [src, geo] of [[IM.body, houseHullGeometry()], ...IM.roof.map(rm => [rm, hullGeometry(rm.geometry)])]) { const ink = new THREE.InstancedMesh(D(geo), inkMat, n); ink.instanceMatrix = src.instanceMatrix; ink.frustumCulled = false; ink.userData.ink = true; group.add(ink); IM.ink.push(ink); } }
    IM.body.castShadow = IM.body.receiveShadow = true; for (const rm of IM.roof) rm.castShadow = true;
    lots.forEach((l, i) => { IM.body.setColorAt(i, _c.set(l.tint)); IM.roof.forEach((rm, k) => rm.setColorAt(i, _c.set(k === l.roof ? l.color : 0xffffff))); IM.win.setColorAt(i, WIN_UNLIT); });
    for (const im of [IM.body, ...IM.roof, IM.win]) im.instanceColor.needsUpdate = true;
    // flowers: heads (coloured per instance) and stems, 8 per lot in the garden + 5 on each front window box
    const perLot = 18; flowers = new THREE.InstancedMesh(D(new THREE.SphereGeometry(.065, 8, 6)), D(M(() => new THREE.MeshStandardMaterial({ roughness: .6 }), () => toonM(0xffffff))), n * perLot); stems = new THREE.InstancedMesh(D(new THREE.CylinderGeometry(.012, .016, .2, 5)), D(M(() => new THREE.MeshStandardMaterial({ color: 0x4e8f3a, roughness: .9 }), () => toonM(0x4e8f3a))), n * perLot);
    flowers.frustumCulled = stems.frustumCulled = false; flowers.userData.local = new Float32Array(n * perLot * 4);   // x, y, z, threshold per flower, lot-local
    lots.forEach((l, i) => { l.flowerFrom = i * perLot; l.flowerN = perLot; const a = flowers.userData.local; for (let k = 0; k < perLot; k++) { const j = (l.flowerFrom + k) * 4;
      if (k < 10) { const side = k % 2 ? 1 : -1; a[j] = side * (.55 + r() * .9) * (k < 8 ? 1 : .6) + (k >= 8 ? 0 : 0); a[j + 1] = .1; a[j + 2] = HOUSE_D / 2 + .5 + r() * 1.6; if (Math.abs(a[j]) < .4) a[j] = side * .6; }
      else { const w = k - 10; a[j] = (w < 4 ? -.72 : .72) + ((w % 4) - 1.5) * .14; a[j + 1] = FOUND + 1.25 - .36; a[j + 2] = HOUSE_D / 2 + .1; }
      a[j + 3] = k < 10 ? .12 + r() * .85 : 0;   // garden flowers come with the mood; window-box ones with the house
      flowers.setColorAt(l.flowerFrom + k, _c.setHSL(r(), .8, .6, THREE.SRGBColorSpace)); } });
    group.add(flowers, stems);
    for (let i = 0; i < n; i++) writeLot(lots[i], 0, 0);
    for (let k = 0; k < n * perLot; k++) { _m.makeScale(0, 0, 0); flowers.setMatrixAt(k, _m); stems.setMatrixAt(k, _m); }
    flowers.instanceMatrix.needsUpdate = stems.instanceMatrix.needsUpdate = true; flowers.instanceColor.needsUpdate = true;
    // townsfolk: one per house plus the kid, hidden until their house pops
    const myGroup = group; Promise.resolve(ctx.hamsterReady).then(() => { if (group !== myGroup) return; for (let i = 0; i < n; i++) makeTownsperson(i); kid = makeTownsperson(-1);
      for (const l of lots) if (l.lit) { const t = townsfolk[l.i]; routeTo(t, null, l); startWalk(t, 'arrive'); }   // houses lit before the model was ready
      if (built >= 3) { kid.state = 'play'; kid.g.visible = true; } });
    return api;
  }

  function makeTownsperson(home) {
    const sc = home < 0 ? .6 : .85 + r() * .15; const g = gerbilFrom({ color: COATS[Math.floor(r() * COATS.length)], scale: sc }); g.visible = false; group.add(g);
    const t = { g, home, state: 'away', t: 0, wp: new Float32Array(32), wpN: 0, wpI: 0, speed: 1.5 + r() * .5, yaw: 0, yawT: 0, hop: 0, hopT: 1 + r() * 3, partner: -1, scale: sc, moving: false, wait: 0, loop: r() * 6.28 };
    if (home >= 0) townsfolk.push(t); return t;
  }
  function addWp(t, x, z) { if (t.wpN < 16) { t.wp[t.wpN * 2] = x; t.wp[t.wpN * 2 + 1] = z; t.wpN++; } }
  function routeTo(t, from, to) { // from/to: lots (or null = the entrance). Doorstep → street → spine → (junction) → spine → street → doorstep.
    t.wpN = 0; t.wpI = 0;
    if (from) { addWp(t, from.street.x, from.street.z); addWp(t, from.spine.x, from.spine.z); } else addWp(t, 0, -1.5);
    const fromFar = from ? from.far : false, toFar = to.far;
    // stem ↔ far: round the fountain on the far lot's side (the old side came from the other lot and cut through the basin)
    const farLot = toFar ? to : from, sgn = ((farLot && farLot.x) || (to.x || (from ? from.x : 1))) >= 0 ? 1 : -1, AX = sgn * 2.7, TOP = 14.45;
    if (fromFar !== toFar) { if (!fromFar) { addWp(t, 0, 10.2); addWp(t, AX, SQUARE.z); addWp(t, AX, TOP); } else { addWp(t, AX, TOP); addWp(t, AX, SQUARE.z); addWp(t, 0, 10.2); } }
    else if (!from && !toFar) {/* straight up the stem */}
    addWp(t, to.spine.x, to.spine.z); addWp(t, to.street.x, to.street.z); addWp(t, to.door.x, to.door.z);
  }
  function startWalk(t, state) { t.state = state; t.moving = true; t.g.visible = true; t.g.position.set(t.wp[0], 0, t.wp[1]); t.wpI = 1; }

  // ---------- ruins ----------
  function buildRuins(D) {
    const n = lots.length; const stumpsPer = 9, rubblePer = 9, fencePer = 11;
    const std = (o, c) => PAPER ? toonM(c ?? 0xffffff) : new THREE.MeshStandardMaterial(o);
    ruin.stumps = new THREE.InstancedMesh(D(new THREE.BoxGeometry(1, 1, 1)), D(std({ roughness: 1 })), n * stumpsPer);
    ruin.rubble = new THREE.InstancedMesh(D(new THREE.DodecahedronGeometry(1, 0)), D(std({ roughness: 1 })), n * rubblePer);
    ruin.fence = new THREE.InstancedMesh(D(new THREE.BoxGeometry(1, 1, 1)), D(std({ color: 0x6a6158, roughness: 1 }, 0x6a6158)), n * fencePer);
    ruin.scorch = new THREE.InstancedMesh(D(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2)), D(std({ color: 0x46423e, roughness: 1 }, 0x46423e)), n);
    ruin.stumps.castShadow = ruin.rubble.castShadow = ruin.fence.castShadow = true; ruin.stumps.receiveShadow = true;
    for (const im of [ruin.stumps, ruin.rubble, ruin.fence, ruin.scorch]) { im.frustumCulled = false; group.add(im); }
    // base transforms per instance (lot-local): pos(3) quat(4) scale(3) = 10 floats
    const base = (im, per) => { im.userData.per = per; im.userData.base = new Float32Array(n * per * 10); }; base(ruin.stumps, stumpsPer); base(ruin.rubble, rubblePer); base(ruin.fence, fencePer); base(ruin.scorch, 1);
    const put = (im, idx, x, y, z, sx, sy, sz, rx, ry, rz) => { const b = im.userData.base; const o = idx * 10; _q.setFromEuler(_e.set(rx, ry, rz)); b[o] = x; b[o + 1] = y; b[o + 2] = z; b[o + 3] = _q.x; b[o + 4] = _q.y; b[o + 5] = _q.z; b[o + 6] = _q.w; b[o + 7] = sx; b[o + 8] = sy; b[o + 9] = sz; };
    const W = HOUSE_W, Dd = HOUSE_D;
    lots.forEach((l, i) => {
      let k = i * stumpsPer; // back wall in three pieces, a side wall in two, a door-post stump, a corner, the fallen beam
      const pieces = [[-.8, -Dd / 2, .75, 1.15], [0, -Dd / 2, .6, .55], [.8, -Dd / 2, .7, .9], [-W / 2, -.4, .2, .95, 1], [-W / 2, .5, .2, .5, 1], [W / 2, -.5, .2, .7, 1], [.45, Dd / 2, .3, .5], [-.5, Dd / 2, .3, .3]];
      for (const [x, z, w, h, side] of pieces) { const hh = h * (.8 + r() * .4); put(ruin.stumps, k, x, hh / 2, z, side ? .22 : w, hh, side ? w : .22, 0, (r() - .5) * .08, (r() - .5) * .06); ruin.stumps.setColorAt(k, _c.setHSL(.07, .08, .12 + r() * .1, THREE.SRGBColorSpace)); k++; }
      put(ruin.stumps, k, .2, .45, -.1, .14, .14, 2.4, -.5 + r() * .2, .4 + r() * .3, 0); ruin.stumps.setColorAt(k, _c.set(0x2b2622));
      k = i * rubblePer; for (let j = 0; j < rubblePer; j++) { const s = .12 + r() * .22; const x = (r() - .5) * (W + 1.2), z = (r() - .5) * (Dd + .6) + (j > 5 ? Dd / 2 + .6 : 0); put(ruin.rubble, k + j, x, s * .7, z, s, s * .7, s, r() * 3, r() * 3, 0); ruin.rubble.setColorAt(k + j, _c.setHSL(.08, .05, .3 + r() * .25, THREE.SRGBColorSpace)); }
      k = i * fencePer; let fx = -1.89; for (let j = 0; j < fencePer; j++) { if (j < 8) { fx += .42; const missing = r() < .3; const h = missing ? 0 : .5 + r() * .15; put(ruin.fence, k + j, fx, h / 2, Dd / 2 + 1.75, .07, h, .07, (r() - .5) * .2, 0, (r() - .5) * .5); }
        else if (j < 10) { const x = -.8 + (j - 8) * 1.6; put(ruin.fence, k + j, x, .32 + (r() - .5) * .15, Dd / 2 + 1.72, 1.1, .05, .04, 0, 0, (r() - .5) * .4); } else put(ruin.fence, k + j, .5, .04, Dd / 2 + 1.6, 1.3, .05, .05, 0, .5, 0); }
      put(ruin.scorch, i, 0, .009, .15, (W + 1.3) / 2, 1, (Dd + 1.6) / 2, 0, 0, 0);
    });
    for (const im of [ruin.stumps, ruin.rubble, ruin.fence, ruin.scorch]) { im.instanceColor && (im.instanceColor.needsUpdate = true); }
    // smoke: three slow wisps per lot as one Points cloud
    const geo = D(new THREE.BufferGeometry()); const pos = new Float32Array(n * 3 * 3); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const ph = new Float32Array(n * 3); for (let i = 0; i < ph.length; i++) ph[i] = r();
    smoke = new THREE.Points(geo, D(new THREE.PointsMaterial({ map: D(softDot()), color: 0xc9c5c0, size: 2.4, transparent: true, opacity: .5, depthWrite: false, sizeAttenuation: true }))); smoke.userData.phase = ph; smoke.frustumCulled = false; group.add(smoke);
    lots.forEach(l => writeRuin(l, 1));
  }
  const _e = new THREE.Euler();
  // write the ruin instances of a lot at crumble factor f (1 = intact, 0 = gone)
  function writeRuin(l, f) {
    const sn = Math.sin(l.ry), cs = Math.cos(l.ry);
    for (const im of [ruin.stumps, ruin.rubble, ruin.fence, ruin.scorch]) { const per = im.userData.per, b = im.userData.base;
      for (let j = 0; j < per; j++) { const idx = l.i * per + j, o = idx * 10; const lx = b[o], ly = b[o + 1], lz = b[o + 2];
        _p.set(l.x + sn * lz + cs * lx, ly * f - (1 - f) * .5, l.z + cs * lz - sn * lx); _q.set(b[o + 3], b[o + 4], b[o + 5], b[o + 6]); _q.premultiply(_qy.setFromAxisAngle(_axisY, l.ry)); _s.set(b[o + 7] * f, b[o + 8] * f, b[o + 9] * f);
        _m.compose(_p, _q, _s); im.setMatrixAt(idx, _m); }
      im.instanceMatrix.needsUpdate = true; }
  }
  const _qy = new THREE.Quaternion();
  // write the house instances of a lot at pop scale (sxz, sy); 0 = hidden
  function writeLot(l, sxz, sy) {
    _p.set(l.x, 0, l.z); _q.setFromAxisAngle(_axisY, l.ry); _s.set(l.w * sxz, sy, sxz); _m.compose(_p, _q, _s);
    IM.body.setMatrixAt(l.i, _m); IM.win.setMatrixAt(l.i, _m); IM.garden.setMatrixAt(l.i, _m); IM.roof.forEach((rm, k) => { if (k === l.roof) rm.setMatrixAt(l.i, _m); else { _m2.makeScale(0, 0, 0); rm.setMatrixAt(l.i, _m2); } });
    IM.body.instanceMatrix.needsUpdate = IM.win.instanceMatrix.needsUpdate = IM.garden.instanceMatrix.needsUpdate = true; for (const rm of IM.roof) rm.instanceMatrix.needsUpdate = true;
    writeFlowers(l, sxz, sy);
  }
  const _m2 = new THREE.Matrix4();
  // squash a built lot's roof toward its eaves (s = 1 whole, 0 flat): the celebration's upper storey sits where the gable was
  function sinkRoof(i, s) {
    const l = lots[i]; if (!l || !IM.roof) return; const rm = IM.roof[l.roof], y0 = FOUND + HOUSE_H - .05; s = clamp(s, .001, 1);
    _p.set(l.x, y0 * (1 - s), l.z); _q.setFromAxisAngle(_axisY, l.ry); _s.set(l.w, s, 1); _m.compose(_p, _q, _s); rm.setMatrixAt(l.i, _m); rm.instanceMatrix.needsUpdate = true;
  }
  function writeFlowers(l, sxz, sy) {
    const a = flowers.userData.local; const sn = Math.sin(l.ry), cs = Math.cos(l.ry);
    for (let k = 0; k < l.flowerN; k++) { const idx = l.flowerFrom + k, j = idx * 4; const th = a[j + 3]; const show = th === 0 ? 1 : clamp((moodShown - th) / .08, 0, 1); const s = sxz * show * (th === 0 ? 1 : .9 + .2 * ((k * 7) % 5) / 5);
      const lx = a[j] * l.w * sxz, lz = a[j + 2] * sxz; _p.set(l.x + sn * lz + cs * lx, a[j + 1] * sy + (th ? .08 : 0), l.z + cs * lz - sn * lx);
      _s.set(s, s, s); _m.compose(_p, _q0, _s); flowers.setMatrixAt(idx, _m);
      _p.y = a[j + 1] * sy - .1 + (th ? .08 : 0); _s.set(s, s * sy, s); _m.compose(_p, _q0, _s); stems.setMatrixAt(idx, _m); }
    flowers.instanceMatrix.needsUpdate = stems.instanceMatrix.needsUpdate = true;
  }
  const _q0 = new THREE.Quaternion();

  // ---------- bunting, fountain ----------
  function makeBunting(lampPos, D) {
    const pairs = [[0, 2], [2, 4], [1, 3], [3, 5], [0, 1], [4, 5], [10, 8], [8, 6], [6, 7], [7, 9], [9, 11]]; const P = []; const lineP = []; const H = 2.95;
    pairs.forEach(([a, b], pi) => { const [ax, az] = lampPos[a], [bx, bz] = lampPos[b]; const len = Math.hypot(bx - ax, bz - az); const nFlags = Math.max(4, Math.round(len / .55)); const sag = Math.min(.9, len * .09);
      const dx = (bx - ax) / len, dz = (bz - az) / len; let prevX = ax, prevY = H, prevZ = az;
      for (let i = 0; i <= nFlags * 2; i++) { const u = i / (nFlags * 2); const x = ax + (bx - ax) * u, z = az + (bz - az) * u, y = H - sag * 4 * u * (1 - u); lineP.push(prevX, prevY, prevZ, x, y, z); prevX = x; prevY = y; prevZ = z;
        if (i % 2 === 1 && i < nFlags * 2) { const tri = new THREE.BufferGeometry(); const hw = .13; tri.setAttribute('position', new THREE.Float32BufferAttribute([x - dx * hw, y, z - dz * hw, x + dx * hw, y, z + dz * hw, x, y - .3, z], 3)); tri.computeVertexNormals(); P.push(colored(tri, FLAG_COLORS[(pi + (i >> 1)) % FLAG_COLORS.length])); } } });
    const g = new THREE.Group(); const flags = new THREE.Mesh(D(mergeGeometries(P, false)), D(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }))); P.forEach(p => p.dispose()); g.add(flags);
    const lg = D(new THREE.BufferGeometry()); lg.setAttribute('position', new THREE.Float32BufferAttribute(lineP, 3)); g.add(new THREE.LineSegments(lg, D(new THREE.LineBasicMaterial({ color: 0x5a4a3a }))));
    g.position.y = H; for (const ch of g.children) ch.position.y = -H;   // scale about the string height so the flags unfurl downward
    return g;
  }
  function makeFountain(D) {
    const g = new THREE.Group(); const T = (o, c) => PAPER ? toonM(c, o.side ? { side: o.side } : {}) : new THREE.MeshStandardMaterial({ color: c, ...o }); const stoneM = D(T({ roughness: .95 }, PAPER ? 0xb9b2a6 : 0x8f8880));
    const basin = new THREE.Mesh(D(new THREE.CylinderGeometry(FOUNTAIN_R + .15, FOUNTAIN_R + .25, .42, 24, 1, false)), stoneM); basin.position.y = .21; basin.castShadow = basin.receiveShadow = true; g.add(basin);
    const inner = new THREE.Mesh(D(new THREE.CylinderGeometry(FOUNTAIN_R, FOUNTAIN_R, .3, 24, 1, true)), D(T({ roughness: 1, side: THREE.BackSide }, 0x7a746d))); inner.position.y = .28; g.add(inner);
    const floor = new THREE.Mesh(D(new THREE.CircleGeometry(FOUNTAIN_R, 24)), D(T({ roughness: 1 }, 0x6f6a64))); floor.rotation.x = -Math.PI / 2; floor.position.y = .14; g.add(floor);
    const run = new THREE.Group(); run.scale.setScalar(0.001); g.add(run); g.userData.run = run;
    const col = new THREE.Mesh(D(new THREE.CylinderGeometry(.1, .14, .9, 10)), stoneM); col.position.y = .55; col.castShadow = true; run.add(col);
    const bowl = new THREE.Mesh(D(new THREE.CylinderGeometry(.42, .3, .14, 16)), stoneM); bowl.position.y = 1.0; bowl.castShadow = true; run.add(bowl);
    const top = new THREE.Mesh(D(new THREE.SphereGeometry(.12, 10, 8)), D(T({ roughness: .1, metalness: .1 }, 0x8ec6ea))); top.position.y = 1.22; run.add(top);
    const water = new THREE.Mesh(D(new THREE.CircleGeometry(FOUNTAIN_R - .02, 24)), D(PAPER ? toonM(0x7cc8ee, { emissive: 0x1a4a6a, emissiveIntensity: .25 }) : new THREE.MeshPhysicalMaterial({ color: 0x5fb7ea, transparent: true, opacity: .62, roughness: .05, metalness: .1, clearcoat: 1, depthWrite: false }))); water.rotation.x = -Math.PI / 2; water.position.y = .4; run.add(water); g.userData.water = water;
    const water2 = new THREE.Mesh(D(new THREE.CircleGeometry(.38, 14)), water.material); water2.rotation.x = -Math.PI / 2; water2.position.y = 1.08; run.add(water2); g.userData.water2 = water2;
    return g;
  }

  // ---------- progress ----------
  function setProgress(n, { instant = false } = {}) {
    if (!group) return; n = clamp(Math.round(n), 0, houses); if (n === progress) return;
    if (instant && n > progress) { // the prologue: the whole street standing at once, everyone home, no animation
      for (let i = progress; i < n; i++) { const l = lots[i]; l.built = true; l.pop = POP_T; l.crumble = -1; l.fall = -1; l.lit = true; writeLot(l, 1, 1); writeRuin(l, 0); hideSmoke(l); IM.win.setColorAt(i, WIN_LIT); built++;
        const t = townsfolk[i]; if (t) { t.state = 'idle'; t.t = 1 + r() * 4; t.g.visible = true; t.g.position.set(l.door.x, 0, l.door.z); t.yaw = t.yawT = l.ry + Math.PI; t.g.rotation.y = t.yaw; t.hopT = 1 + r() * 3; } }
      IM.win.instanceColor.needsUpdate = true; progress = n; if (kid && built >= 3) { kid.state = 'play'; kid.g.visible = true; }
      moodTarget = progress / houses; moodShown = moodTarget; ground.material.color.lerpColors(gSad, gHappy, smooth(moodShown)); street.material.color.lerpColors(sSad, sHappy, smooth(moodShown));
      for (const l of lots) if (l.built) writeFlowers(l, 1, 1);
      refreshMood(); if (bunting.visible) { bunting.scale.y = 1; bunting.userData.t = 9; } if (fountain.userData.on) { fountain.userData.run.scale.setScalar(1); fountain.userData.t = 9; } return; }
    if (n < progress) { // rewind (debug): hard reset of the lots above n
      for (let i = n; i < progress; i++) { const l = lots[i]; l.built = false; l.pop = -1; l.crumble = -1; l.fall = -1; l.lit = false; writeLot(l, 0, 0); writeRuin(l, 1); IM.win.setColorAt(i, WIN_UNLIT); const t = townsfolk[i]; if (t) { t.state = 'away'; t.g.visible = false; } }
      IM.win.instanceColor.needsUpdate = true; progress = n; built = n; if (kid && n < 3) { kid.state = 'away'; kid.g.visible = false; } }
    else { for (let i = progress; i < n; i++) { const l = lots[i]; l.crumble = 0; l.pop = -.35; l.fall = -1; l.built = true; if (!animating.includes(l)) animating.push(l);
        _w.set(l.x, .6, l.z).applyMatrix4(group.matrixWorld); spawnBurst?.(scene, _w, 0x9a958f, 26); }
      progress = n; }
    refreshMood();
  }
  // a built house falls to a ruin again (the prologue, when the giants leave with the jar); the lot animates in update()
  function collapse(i) {
    if (!group) return; const l = lots[i]; if (!l || !l.built) return;
    l.built = false; l.fall = 0; l.pop = -1; l.crumble = -1; l.lit = false; IM.win.setColorAt(l.i, WIN_UNLIT); IM.win.instanceColor.needsUpdate = true; if (!animating.includes(l)) animating.push(l);
    const t = townsfolk[l.i]; if (t) { t.state = 'away'; t.g.visible = false; t.g.rotation.x = 0; t.g.position.y = 0; }
    built = lots.filter(x => x.built).length; progress = built; if (kid && built < 3) { kid.state = 'away'; kid.g.visible = false; }
    _w.set(l.x, 1.2, l.z).applyMatrix4(group.matrixWorld); spawnBurst?.(scene, _w, 0x6a6158, 24); ctx.sfx?.play?.('bonk', { volume: .5 });
    refreshMood();
  }
  function refreshMood() {
    moodTarget = progress / houses; sign.userData.setLines([`Gerbil Street · ${progress} ${progress === 1 ? 'home' : 'homes'}`]);
    // lamps light one by one
    const pos = lampGlow.userData.pos; const litN = Math.round(moodTarget * pos.length); for (let i = 0; i < pos.length; i++) lampGlow.setColorAt(i, i < litN ? LAMP_LIT : LAMP_UNLIT); lampGlow.instanceColor.needsUpdate = true;
    if (moodTarget >= .6 && !bunting.visible) { bunting.visible = true; bunting.userData.t = 0; }
    if (moodTarget >= 1 && !fountain.userData.on) { fountain.userData.on = true; fountain.userData.t = 0; _w.copy(SQUARE).setY(.8).applyMatrix4(group.matrixWorld); spawnBurst?.(scene, _w, 0x8ec6ea, 30); }
    if (moodTarget < .6) { bunting.visible = false; bunting.scale.y = .001; } if (moodTarget < 1) { fountain.userData.on = false; fountain.userData.run.scale.setScalar(.001); }
  }

  // ---------- per frame ----------
  function update(dt, now = performance.now()) {
    if (!group) return; dt = Math.min(dt, .1);
    // mood eases toward the target; the ground and street warm up, flowers come out
    if (Math.abs(moodShown - moodTarget) > 1e-4) { moodShown += clamp(moodTarget - moodShown, -dt * .5, dt * .5); ground.material.color.lerpColors(gSad, gHappy, smooth(moodShown)); street.material.color.lerpColors(sSad, sHappy, smooth(moodShown));
      for (const l of lots) if (l.built && l.pop >= POP_T) writeFlowers(l, 1, 1); }
    // the lots that are crumbling or popping
    for (let i = animating.length - 1; i >= 0; i--) { const l = animating[i]; let done = true;
      if (l.fall >= 0) { l.fall += dt; const u = clamp(l.fall / FALL_T, 0, 1); const k = 1 - u; const wob = Math.sin(u * Math.PI * 4) * u * .18; writeLot(l, Math.max(.001, k * (1 + wob)), Math.max(.001, k * k)); writeRuin(l, Math.sqrt(u));
        if (u >= 1) { l.fall = -1; writeLot(l, 0, 0); writeRuin(l, 1); } else done = false; }
      if (l.crumble >= 0) { l.crumble += dt; const f = 1 - clamp(l.crumble / CRUMBLE_T, 0, 1); writeRuin(l, f * f); if (l.crumble >= CRUMBLE_T) { l.crumble = -1; hideSmoke(l); } else done = false; }
      if (l.pop > -1) { l.pop += dt; const s = clamp(l.pop / POP_T, 0, 1); if (l.pop >= 0) { const k = easeOutBack(s); const wob = Math.sin(s * Math.PI * 3) * (1 - s); writeLot(l, Math.max(.001, k * (1 - .22 * wob)), Math.max(.001, k * (1 + .3 * wob))); }
        if (s >= .55 && !l.lit) { l.lit = true; IM.win.setColorAt(l.i, WIN_LIT); IM.win.instanceColor.needsUpdate = true; _w.set(l.x, FOUND + HOUSE_H + .8, l.z).applyMatrix4(group.matrixWorld); spawnBurst?.(scene, _w, 0xffd27a, 16); ctx.sfx?.play?.('whoosh');
          const t = townsfolk[l.i]; if (t && t.state === 'away') { routeTo(t, null, l); startWalk(t, 'arrive'); } built++;
          if (built >= 3 && kid && kid.state === 'away') { kid.state = 'play'; kid.g.visible = true; } }
        if (s >= 1) { l.pop = POP_T; writeLot(l, 1, 1); } else done = false; }
      if (done) animating.splice(i, 1); }
    // smoke drifts up and wraps
    { const pos = smoke.geometry.attributes.position, ph = smoke.userData.phase; const T = now / 1000; let any = false;
      for (let i = 0; i < lots.length; i++) { const l = lots[i]; if (l.built) continue; any = true; for (let k = 0; k < 3; k++) { const j = i * 3 + k; const u = ((T * .11 + ph[j]) % 1 + 1) % 1; const sn = Math.sin(l.ry), cs = Math.cos(l.ry); const lx = (k - 1) * .7 + Math.sin(T * .7 + ph[j] * 9) * .15, lz = -HOUSE_D / 2 + .1 + k * .25;
        pos.setXYZ(j, l.x + sn * lz + cs * lx, 1.0 + u * 2.4, l.z + cs * lz - sn * lx); } }
      pos.needsUpdate = true; smoke.material.opacity = .5 * (1 - .4 * moodShown); smoke.visible = any; }
    // bunting unfurls, the fountain runs
    if (bunting.visible && bunting.scale.y < 1) { bunting.userData.t += dt; bunting.scale.y = Math.max(.001, Math.min(1, easeOutBack(clamp(bunting.userData.t / .9, 0, 1)))); }
    if (fountain.userData.on) { fountain.userData.t += dt; const s = clamp(fountain.userData.t / .8, 0, 1); fountain.userData.run.scale.setScalar(Math.max(.001, easeOutBack(s))); const w = fountain.userData.water; w.position.y = .4 + Math.sin(now / 420) * .02; w.scale.setScalar(1 + Math.sin(now / 300) * .015); fountain.userData.water2.position.y = 1.08 + Math.sin(now / 350 + 1) * .015; }
    // townsfolk
    for (let i = 0; i < townsfolk.length; i++) stepTownsperson(townsfolk[i], dt, now);
    if (kid && kid.state === 'play') stepKid(kid, dt, now);
    separate();
  }
  // nobody walks through anybody: overlapping pairs are pushed apart (the kid on his loop only pushes, he is never pushed)
  const WALKING = new Set(['arrive', 'visit', 'home']);
  function separate() {
    const n = townsfolk.length;
    for (let i = 0; i < n; i++) { const a = townsfolk[i]; if (!a.g.visible || a.state === 'away') continue; const pa = a.g.position;
      for (let j = i + 1; j <= n; j++) { const b = j < n ? townsfolk[j] : kid; if (!b || !b.g.visible || b.state === 'away') continue; const pb = b.g.position;
        const dx = pb.x - pa.x, dz = pb.z - pa.z, d = Math.hypot(dx, dz); if (d >= PERSONAL) continue; const ux = d > 1e-4 ? dx / d : 1, uz = d > 1e-4 ? dz / d : 0, o = PERSONAL - d;
        if (j === n) { pa.x -= ux * o; pa.z -= uz * o; continue; }
        const wa = WALKING.has(a.state) ? 1 : .35, wb = WALKING.has(b.state) ? 1 : .35, k = o / (wa + wb);   // the one standing gives way less
        pa.x -= ux * k * wa; pa.z -= uz * k * wa; pb.x += ux * k * wb; pb.z += uz * k * wb; } }
  }
  function hideSmoke(l) { const pos = smoke.geometry.attributes.position; for (let k = 0; k < 3; k++) pos.setXYZ(l.i * 3 + k, 0, -50, 0); pos.needsUpdate = true; }

  // ---------- townsfolk state machines: away → arrive → idle ⇄ wander/visit → chat → home ----------
  function faceToward(t, x, z) { t.yawT = Math.atan2(x - t.g.position.x, z - t.g.position.z); }
  function turn(t, dt, rate = 6) { let d = t.yawT - t.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); t.yaw += d * Math.min(1, dt * rate); t.g.rotation.y = t.yaw; }
  function walk(t, dt) { // follow the waypoints; returns true when the last is reached
    if (t.wpI >= t.wpN) return true; let tx = t.wp[t.wpI * 2], tz = t.wp[t.wpI * 2 + 1];
    if (t.wpI > 0 && t.wpI < t.wpN - 1) { const sx = tx - t.wp[t.wpI * 2 - 2], sz = tz - t.wp[t.wpI * 2 - 1], L = Math.hypot(sx, sz); if (L > .01) { tx -= sz / L * LANE; tz += sx / L * LANE; } }   // keep right: the middle legs run LANE off the centre line
    const dx = tx - t.g.position.x, dz = tz - t.g.position.z; const d = Math.hypot(dx, dz); const step = t.speed * dt;
    if (d <= step) { t.g.position.set(tx, 0, tz); t.wpI++; if (t.wpI >= t.wpN) return true; return false; }
    t.g.position.x += dx / d * step; t.g.position.z += dz / d * step; t.yawT = Math.atan2(dx, dz); return false;
  }
  function stepTownsperson(t, dt, now) {
    const home = lots[t.home]; let speed = 0, air = false;
    switch (t.state) {
      case 'away': return;
      case 'arrive': case 'visit': case 'home': {
        speed = t.speed; if (walk(t, dt)) { if (t.state === 'visit') { const host = townsfolk[t.target]; const hl = lots[t.target];
            if (host && host.state === 'idle') { // chat: stand a little apart, face each other
              const sn = Math.sin(hl.ry), cs = Math.cos(hl.ry); t.g.position.set(hl.door.x + sn * .35 - cs * .5, 0, hl.door.z + cs * .35 + sn * .5); faceToward(t, host.g.position.x, host.g.position.z); faceToward(host, t.g.position.x, t.g.position.z);
              t.state = host.state = 'chat'; t.t = host.t = 4 + r() * 3; t.partner = t.target; host.partner = townsfolk.indexOf(t); }
            else { t.state = 'idle'; t.t = 2 + r() * 2; t.yawT = hl.ry + Math.PI; } }
          else { t.state = 'idle'; t.t = 1 + r() * 4; t.yawT = home.ry + Math.PI; }   // on the doorstep, looking out at the street
          t.hopT = .6 + r() * 2; } break; }
      case 'idle': {
        t.t -= dt; t.hopT -= dt;
        if (t.hopT <= 0) { t.hop = .36; t.hopT = 1.8 + r() * 3.5; t.yawT += (r() - .5) * 1.4; }   // a little hop, then look somewhere else
        if (t.hop > 0) { t.hop -= dt; const u = 1 - clamp(t.hop / .36, 0, 1); t.g.position.y = Math.max(0, Math.sin(u * Math.PI)) * .13; air = t.hop > .04; } else t.g.position.y = 0;
        if (t.t <= 0) { const atHome = t.g.position.distanceToSquared(home.door) < .6;
          if (!atHome) { routeTo(t, lots[t.target], home); t.state = 'home'; }
          else if (built >= 3 && r() < .5) { // visit a built neighbour
            let tries = 6, tgt = -1; while (tries-- > 0) { const j = Math.floor(r() * progress); if (j !== t.home && lots[j].built && lots[j].pop >= POP_T) { tgt = j; break; } }
            if (tgt >= 0) { t.target = tgt; routeTo(t, home, lots[tgt]); t.state = 'visit'; } else t.t = 2 + r() * 3; }
          else t.t = 2 + r() * 4; }
        break; }
      case 'chat': {
        t.t -= dt; const nod = Math.sin(now / 180 + t.home) * .5 + .5; t.g.position.y = nod * .02; t.g.rotation.x = Math.sin(now / 260 + t.home * 2) * .06;
        if (t.t <= 0) { t.g.rotation.x = 0; t.g.position.y = 0; const p = townsfolk[t.partner]; if (p && p.state === 'chat') { p.g.rotation.x = 0; p.state = 'idle'; p.t = 1 + r() * 2; }
          if (t.g.position.distanceToSquared(home.door) < .6) { t.state = 'idle'; t.t = 2 + r() * 3; } else { routeTo(t, lots[t.target], home); t.state = 'home'; } }
        break; }
    }
    turn(t, dt, speed ? 8 : 3); animateGerbil(t.g, { speed: speed * 2.2, airborne: air, now, dt });
  }
  function stepKid(k, dt, now) {
    const R = FOUNTAIN_R + .9; k.loop += dt * 2.6 / R; const rr = R + Math.sin(k.loop * 2) * .25; const px = SQUARE.x + Math.sin(k.loop) * rr, pz = SQUARE.z + Math.cos(k.loop) * rr;
    k.g.position.set(px, 0, pz); k.yaw = Math.atan2(Math.cos(k.loop), -Math.sin(k.loop)); k.g.rotation.y = k.yaw;
    animateGerbil(k.g, { speed: 3.2, airborne: (now % 1900) < 260, now, dt });
  }

  // the town camera's no-go boxes: one world Box3 per built house (walls, roof overhang and chimney), cached until a lot changes
  function cameraBoxes() {
    if (!group) return []; let key = ''; for (const l of lots) key += l.built ? '1' : '0'; if (key === camKey) return camBoxes; camKey = key; group.updateMatrixWorld(true);
    camBoxes = lots.filter(l => l.built).map(l => { const q = Math.abs(Math.sin(l.ry)) > .5, hx = (q ? HOUSE_D + .6 : (HOUSE_W + .6) * l.w) / 2, hz = (q ? (HOUSE_W + .6) * l.w : HOUSE_D + .6) / 2;
      return new THREE.Box3(new THREE.Vector3(l.x - hx, 0, l.z - hz), new THREE.Vector3(l.x + hx, FOUND + HOUSE_H + 1.55, l.z + hz)).applyMatrix4(group.matrixWorld); });
    return camBoxes;
  }

  function dispose() {
    if (!group) return; scene.remove(group);
    for (const t of kid ? [...townsfolk, kid] : townsfolk) t.g.traverse(o => { if (o.isMesh) o.material?.dispose?.(); });   // geometry is the shared hamster model: keep it
    for (const d of disposables) { if (d.isObject3D) d.traverse(o => { if (o.isMesh) { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.map?.dispose?.(); m.dispose?.(); }); } }); else { d.map?.dispose?.(); d.dispose?.(); } }
    disposables.length = 0; townsfolk.length = 0; kid = null; group = null; inkMat = null; camBoxes = []; camKey = ''; api.group = null; lots = []; api.lots = lots; animating.length = 0; IM = {}; ruin = {}; smoke = sign = bunting = fountain = ground = street = lamps = lampGlow = flowers = stems = null;
  }
  return api;
}
