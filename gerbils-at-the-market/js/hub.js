// hub.js — the town. Gerbil Valley Market is the game's hub: no level screen. Molly walks the square, up Gerbil Street
// (the city that rebuilds), into the school for the facts board, up the lookout hill to look at the valley, and to the
// road sign at the east edge to pick the next giant.
//
// World frame (y = 0 is assumed flat for x ∈ [-40, 40], z ∈ [-30, 30]; the only relief is the lookout mound, and
// `heightAt` is the hub's own ground so the player can stand on it):
//   the road runs along +x at z = 0 (|z| < 1.6) and continues east to the giants
//   the square: a cobbled plaza x ∈ [-11, 11], z ∈ [-6.5, 7.6] straddling the road; the fountain at (0, 0, 4)
//   the stalls (props.makeStall): Lego store (-6.8, 0, 4.6), Car store (6.8, 0, 4.6), House with stairs (-7.5, 0, -5)
//   Gerbil Street (city.js): origin (0, 0, 8), running +z to z ≈ 28, progress = giants beaten × 5
//   the school: (6, 0, -14), door at z = -11.9, the bell tower at (9.6, 0, -13.5); a path south from the square
//   the lookout hill: mound at (-25, 0, -18), r 7, 2.2 m high; a path from the square's SW corner; "Lookout" sign at (-12.8, 0, -3.6)
//   the road sign: an arch across the road at x = 30 (signX), posts at z = ±3.6, one board per stop hung under the beam;
//     walking in under it (x >= 28, |z| < 4) opens the picker
//   the town's edges: a rounded box x ∈ [-34, 31.5], z ∈ [-26, 30] (hub.box); she is held inside it
//   the banner over the road at x = 10, hung high (its rod at 5.45 m) so it never covers the road sign from the spawn
//   the market board: (14, 0, -9.5) on the north side, facing -x (the camera looks up the road), clear of the road and the sign
// Everything static (including the stalls, which arrive as ~70 small meshes each) is baked into one mesh per material
// signature with the colour in the vertices, so the whole town is ~40 draw calls beyond the city.
//
// The look (round 3, docs/ART-DIRECTION.md direction C): P.artMode() 'paper' bakes toon materials (one palette, P.PAL) and an
// ink hull per big piece (BackSide, pushed out .035 m, its own bucket: never merged into a lit mesh), flat palette ground,
// the stalls straight from P.makeStall (already toon and ink, not baked) and a few sprite trees; 'old' is HEAD's look exactly.
// Shared things (contract C4): sharedKinds = school, lamps, fountain, bell; setShared(kind, on, { instant }) lights or
// darkens each (a .5 s pop with a burst when not instant); sync(n) lights the first round(n / BOSS_N * 4). The market board
// is the 10-coins picture (market.new_money: 7 roll uphill to the big gold houses, 3 down to the street). Every real
// number lives behind openGrownups() (a silent card); the cards a kid hears carry none above ten.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeStall, roundedBox, MAT, PALETTE, textCanvas, animateGerbil } from './props.js';
import * as P from './props.js';
import { makeJar, JAR_POS } from './prologue.js';

// ---------- layout ----------
const ROAD_HALF = 1.6;
const SQUARE = { x0: -11, x1: 11, z0: -6.5, z1: 7.6, r: 3 };
const FOUNTAIN = new THREE.Vector3(0, 0, 4.0);
const STREET = new THREE.Vector3(0, 0, 8);
const SCHOOL = new THREE.Vector3(6, 0, -14); const SCHOOL_W = 5.2, SCHOOL_D = 4.2, SCHOOL_H = 3.0; const TOWER = new THREE.Vector3(9.6, 0, -13.5);
const HILL = new THREE.Vector3(-25, 0, -18); const HILL_R = 7, HILL_H = 2.2;
const SIGN_X = 30, ARCH_HALF = 3.6, ARCH_H = 4.7;   // the road sign: an arch across the road at x = SIGN_X, its posts at z = ±ARCH_HALF
const SIGN = new THREE.Vector3(SIGN_X, 0, 0);
const SIGN_IN = 28, SIGN_REARM = 3;   // walking in at x >= SIGN_IN with |z| < 4 opens the picker once; it re-arms when she is SIGN_REARM m back
const BOX = { x0: -34, x1: 31.5, z0: -26, z1: 30 }, BOX_R = 4;   // the town's edges: a box with rounded corners; she is held inside it
const BANNER_X = 10, BANNER_Y = 5.45;   // the banner's rod height: high enough that, from the spawn, it hangs above the road sign's boards instead of in front of them
const SPAWN = new THREE.Vector3(-6, 0, 0.8);
const REACH = 2.3;   // F: was 2, scaled for the 1.5x player
const ARROW_STYLE = { trump: { name: 'Golden Tower', color: 0xf0c040, ink: '#3a2a08' }, bezos: { name: 'Warehouse', color: 0x2d6fd3, ink: '#ffffff' }, musk: { name: 'Rocket Yard', color: 0xd7262c, ink: '#ffffff' }, ellison: { name: 'Data Harbor', color: 0x1d2b4a, ink: '#ffffff' },
  bloomberg: { name: 'Campaign Stage', color: 0xf4f1e8, ink: '#1d2b4a' }, walton: { name: 'Superstore', color: 0xf28c28, ink: '#ffffff' }, zuckerberg: { name: 'Giant Phone', color: 0x7b3fc4, ink: '#ffffff' }, page: { name: 'Search Tower', color: 0x2f9e44, ink: '#ffffff' } };
const OLD_STOPS = [{ id: 'trump', x: 130 }, { id: 'bezos', x: 340 }, { id: 'musk', x: 580 }];   // when the game passes no ctx.stops
const KID_SPOTS = [new THREE.Vector3(-3.6, 0, -3.6), new THREE.Vector3(3.0, 0, -3.6)];
const MARKET = new THREE.Vector3(14, 0, -9.5), MARKET_YAW = -Math.PI / 2;   // the market board on the north side, its face toward -x: read face-on by the camera looking up the road
const MB = { w: 7.4, y0: .2, h: 4.2, base: .55 };   // its width, bottom, height; the shelf's top y
const PLAYER_R = .36;   // the gerbil is .6 m nose to tail at PLAYER_SCALE 1.5 (F: was .24)
const KEEPERS = [[-6.8, 2.5, Math.PI, 0x5a87ff], [6.8, 2.5, Math.PI, 0x3a4a80], [-7.5, -3.1, 0, 0x8a9ae0]];   // x, z, facing, coat
// townsfolk coats: blue tints over the orange-and-white hamster texture (the coat multiplies it; ~#5a87ff cancels the orange to
// grey), so they read grey and slate. Never Molly's tan (#f0d2a0, her title icon) or a rust orange near it
const FOLK_COATS = [0x5a87ff, 0x6f8fe8, 0x80a0ff, 0x3a4a80, 0x8a9ae0, 0x4a70d8, 0x6a7ab8, 0x50608f];
const HOME_LINE = 'Look! New homes on Gerbil Street.';
const SHARED_KINDS = ['school', 'lamps', 'fountain', 'bell'];   // they light in this order (the opening), go out in it (the hook), come back in it
const HILL_TOP = new THREE.Vector3(-25, 2.2, -18);   // the lookout's top: main frames every Long Road row from here
const LAMP_XZ = [[-3.4, 2.3], [3.4, 2.3], [-3.4, 6.3], [3.4, 6.3], [-9.5, -2.6], [9.5, -2.6]];   // the six square lamps
const SHARED_T = .5;   // a shared thing's pop or fade, seconds

// scratch (no per-frame allocations)
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _c = new THREE.Color(), _c2 = new THREE.Color(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
const clamp = THREE.MathUtils.clamp;
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

// ---------- the paper look: toon materials and ink hulls (props.js's when it has them, a local fallback otherwise) ----------
const PAL_ = () => P.PAL || { ink: 0x3b2516, cream: 0xfbf0d4, red: 0xd7262c, yellow: 0xf2c230, blue: 0x3a7bd5, grass: 0x8cc067, sand: 0xe9d09c, stone: 0xb9b2a6, wood: 0xa8743f };
let _grad = null;
function toonGrad() { if (_grad) return _grad; const c = document.createElement('canvas'); c.width = 3; c.height = 1; const g = c.getContext('2d'); ['#8c8c96', '#d2d2d6', '#ffffff'].forEach((col, i) => { g.fillStyle = col; g.fillRect(i, 0, 1, 1); }); _grad = new THREE.CanvasTexture(c); _grad.minFilter = _grad.magFilter = THREE.NearestFilter; _grad.generateMipmaps = false; return _grad; }
// my own MeshToonMaterial (a clone, so a cached props material is never changed under someone else)
function toonM(color, extra = {}) { const base = P.toonMat?.(color); const m = base?.isMaterial ? base.clone() : new THREE.MeshToonMaterial({ color, gradientMap: toonGrad() }); m.color.set(color); m.setValues(extra); return m; }
// an ink hull of a world-space piece: positions only, welded, pushed out along the smoothed normals
function hullOf(g, w) {
  let h = new THREE.BufferGeometry(); h.setAttribute('position', g.attributes.position.clone()); h = mergeVertices(h, 1e-4); h.computeVertexNormals();
  const p = h.attributes.position, n = h.attributes.normal; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * w, p.getY(i) + n.getY(i) * w, p.getZ(i) + n.getZ(i) * w);
  const out = h.toNonIndexed(); h.dispose(); out.computeVertexNormals(); return out;
}
function glowCanvas(inner = 'rgba(255,226,150,.95)', mid = 'rgba(255,200,110,.35)') { const [c, g] = canvas(128, 128); const gr = g.createRadialGradient(64, 64, 2, 64, 64, 62); gr.addColorStop(0, inner); gr.addColorStop(.4, mid); gr.addColorStop(1, 'rgba(255,190,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c; }

// the ground under a gerbil standing at (x, z): the highest of her centre and four paw spots (.13 m out), so on the mound's slope no paw sinks in
export function footHeight(x, z, r = .13) { let h = heightAt(x, z); if (h <= 0 && Math.hypot(x - HILL.x, z - HILL.z) > HILL_R + r) return h; for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) h = Math.max(h, heightAt(x + dx, z + dz)); return h; }
// the hub's ground: flat, with the lookout mound
export function heightAt(x, z) { const d = Math.hypot(x - HILL.x, z - HILL.z); return d < HILL_R ? HILL_H * .5 * (1 + Math.cos(Math.PI * d / HILL_R)) : 0; }

// ---------- canvases ----------
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function srgb(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function cobbleCanvas() {
  let s = 99; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const [c, g] = canvas(256, 256); g.fillStyle = '#8f8a80'; g.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) for (let i = -1; i < 9; i++) { const x = i * 32 + (row % 2) * 16, y = row * 32; const l = 185 + r() * 60; g.fillStyle = `rgb(${l},${l - 5},${l - 12})`; g.beginPath(); g.roundRect(x + 2, y + 2, 28, 28, 9); g.fill(); g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.roundRect(x + 5, y + 4, 22, 8, 5); g.fill(); }
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${(r() * .12).toFixed(3)})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
// a road-sign board's label: an arrow pointing up the road, the place and its distance, a green check when he is beaten
function arrowCanvas(text, ink, done) {
  const [c, g] = canvas(1024, 120); g.fillStyle = ink; g.beginPath(); g.moveTo(26, 62); g.lineTo(62, 14); g.lineTo(98, 62); g.lineTo(74, 62); g.lineTo(74, 104); g.lineTo(50, 104); g.lineTo(50, 62); g.closePath(); g.fill();
  let px = 72; g.font = `700 ${px}px Fredoka, "Arial Rounded MT Bold", sans-serif`; while (px > 44 && g.measureText(text).width > 780) { px -= 4; g.font = `700 ${px}px Fredoka, "Arial Rounded MT Bold", sans-serif`; }   // long names shrink to fit beside the check
  g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(text, 124, 64, 800);
  if (done) { g.fillStyle = '#3b8f4a'; g.beginPath(); g.arc(962, 60, 48, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 13; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(936, 62); g.lineTo(956, 84); g.lineTo(990, 40); g.stroke(); }
  return c;
}
// the floating A over whatever A works on: a round yellow button (a pill when the key is a word, 'Space')
function markerCanvas(word) {
  const wide = word.length > 1, w = wide ? 512 : 256, [c, g] = canvas(w, 256); g.fillStyle = '#f2c230'; g.strokeStyle = '#3a2a08'; g.lineWidth = 14;
  g.beginPath(); g.roundRect(10, 10, w - 20, 236, 118); g.fill(); g.stroke(); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.roundRect(40, 30, w - 80, 70, 35); g.fill();
  g.fillStyle = '#2b2418'; g.font = `700 ${wide ? 120 : 170}px Fredoka, "Arial Rounded MT Bold", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(word, w / 2, 140);
  return c;
}
function bannerCanvas() {
  const [c, g] = canvas(1536, 288); g.fillStyle = '#d7262c'; g.beginPath(); g.roundRect(0, 0, 1536, 288, 30); g.fill();
  for (let i = 0; i < 24; i++) { g.fillStyle = i % 2 ? '#fff3d6' : '#f2c230'; g.beginPath(); g.arc(32 + i * 64, 262, 22, 0, 7); g.fill(); }
  g.fillStyle = '#fff8e7'; g.beginPath(); g.roundRect(26, 26, 1484, 206, 22); g.fill();
  g.fillStyle = '#2b2418'; g.font = `700 150px Fredoka, "Arial Rounded MT Bold", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Gerbil Valley Market', 768, 134);
  return c;
}

// ---------- baking: every static piece lands in a bucket keyed by its material's look; one mesh per bucket ----------
// the key holds the material's type, side and toon ramp, so a toon piece never merges with a standard one and a BackSide ink
// hull never lands in a lit mesh's bucket
function keyOf(m) { const r = Math.round((m.roughness ?? .85) * 4) / 4, mt = Math.round((m.metalness ?? 0) * 4) / 4; return [m.type, r, mt, m.emissive ? m.emissive.getHex() : 0, m.emissiveIntensity ?? 1, m.map ? m.map.uuid : '-', m.side, m.transparent ? 1 : 0, m.alphaTest ?? 0, m.clearcoat ?? 0, m.opacity ?? 1, m.depthWrite === false ? 0 : 1, m.gradientMap ? m.gradientMap.uuid : '-', m.userData?.ink ? 'ink' : '-'].join('|'); }
const isInk = o => !!(o.userData?.ink || (o.material && !Array.isArray(o.material) && (o.material.userData?.ink || (o.material.side === THREE.BackSide && o.material.isMeshBasicMaterial))));
function slice(g, start, count) {
  const out = new THREE.BufferGeometry(); for (const name of ['position', 'normal', 'uv']) { const a = g.attributes[name]; if (!a) continue; out.setAttribute(name, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize)); }
  return out;
}
// a normalised piece: position/normal/uv/color, in the bake frame
function finish(g, matrix, color) {
  const n = g.attributes.position.count; if (!g.attributes.normal) g.computeVertexNormals(); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  const col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b; } g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (matrix) g.applyMatrix4(matrix); return g;
}
class Baker {
  // inkMat: the BackSide ink material (paper look); while `inking` is on, every big piece added also gets an ink hull in its own bucket
  constructor({ inkMat = null, inkW = .035 } = {}) { this.buckets = new Map(); this.sourceMats = new Set(); this.inkMat = inkMat; this.inkW = inkW; this.inking = false; this._ink = new THREE.Color(inkMat ? inkMat.color.getHex() : 0); }
  // a hull for a finished (world-space) piece when inking, skipping the small and the flat (knobs, panes, flowers)
  hull(g) { if (!this.inking || !this.inkMat) return; g.computeBoundingBox(); const b = g.boundingBox, dx = b.max.x - b.min.x, dy = b.max.y - b.min.y, dz = b.max.z - b.min.z;
    if (Math.max(dx, dy, dz) < .3 || Math.min(dx, dy, dz) < .005) return; this.bucket(this.inkMat).geos.push(finish(hullOf(g, this.inkW), null, this._ink)); }
  bucket(mat) { const k = keyOf(mat); let b = this.buckets.get(k); if (!b) { const m = mat.clone(); m.vertexColors = true; if (m.color) m.color.set(0xffffff); if ('roughness' in m) m.roughness = Math.round(m.roughness * 4) / 4; if ('metalness' in m) m.metalness = Math.round(m.metalness * 4) / 4; b = { mat: m, geos: [] }; this.buckets.set(k, b); } return b; }
  // a geometry of my own: colour hex, placed by (x, y, z, rotation, scale)
  add(mat, geo, hex, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _q.setFromEuler(_e.set(rx, ry, rz)); _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz)); const g = geo.index ? geo.toNonIndexed() : geo; if (g !== geo) geo.dispose();
    const fg = finish(g, _m, _c.set(hex)); this.bucket(mat).geos.push(fg); if (mat !== this.inkMat && !mat.transparent) this.hull(fg); return this;
  }
  // every visible mesh under `root` (a props group), split by material group, instances expanded
  addObject(root) {
    root.updateMatrixWorld(true);
    root.traverseVisible(o => { if (!o.isMesh) return; if (this.inkMat && isInk(o)) { o.geometry.dispose(); return; }   // their hulls are re-made here, in world space
      const mats = Array.isArray(o.material) ? o.material : [o.material]; mats.forEach(m => this.sourceMats.add(m));
      const ni = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); const total = ni.attributes.position.count;
      // paper: one ink hull per solid toon mesh, made from the whole shape in world space (not per material group: a box's faces
      // one by one are flat and would get none); never for see-through or two-sided pieces (an awning would get a dark twin)
      if (this.inking && !o.isInstancedMesh && mats.every(m => m.isMeshToonMaterial && !m.transparent && !(m.alphaTest > 0) && m.side !== THREE.DoubleSide)) { const wg = new THREE.BufferGeometry(); wg.setAttribute('position', ni.attributes.position.clone()); wg.applyMatrix4(o.matrixWorld); this.hull(wg); wg.dispose(); }
      const groups = mats.length > 1 && ni.groups.length ? ni.groups : [{ start: 0, count: total, materialIndex: 0 }];
      for (const gr of groups) { const m = mats[Math.min(gr.materialIndex, mats.length - 1)]; const count = Math.min(gr.count === Infinity ? total : gr.count, total - gr.start); if (count <= 0) continue; const sub = slice(ni, gr.start, count); const b = this.bucket(m);
        if (o.isInstancedMesh) { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, _m); _m.premultiply(o.matrixWorld); _c.copy(m.color || _c.set(0xffffff)); if (o.instanceColor) { o.getColorAt(i, _c2); _c.multiply(_c2); } b.geos.push(finish(sub.clone(), _m, _c)); } sub.dispose(); }
        else b.geos.push(finish(sub, o.matrixWorld, m.color || _c.set(0xffffff))); }
      ni.dispose(); o.geometry.dispose(); });
    return this;
  }
  // the baked meshes, added to `group`; returns the disposables
  bake(group) {
    const out = []; for (const b of this.buckets.values()) { if (!b.geos.length) continue; const g = mergeGeometries(b.geos, false); b.geos.forEach(x => x.dispose()); if (!g) continue;
      const mesh = new THREE.Mesh(g, b.mat); const see = b.mat.transparent || b.mat.depthWrite === false, ink = b.mat.side === THREE.BackSide; mesh.castShadow = !see && !ink; mesh.receiveShadow = !ink; group.add(mesh); out.push(g, b.mat); }
    for (const m of this.sourceMats) m.dispose(); this.buckets.clear(); return out;
  }
}

// ---------- the hub ----------
export function createHub(ctx) {
  const { scene, player, state, data, city } = ctx;
  const group = new THREE.Group(); group.name = 'hub'; let built = false; const disposables = []; const D = o => { disposables.push(o); return o; };
  const bosses = data.bosses, bagUSD = data.bag_usd || 434e6, teacher = (data.ordinary || []).find(o => o.id === 'teacher'), family = (data.ordinary || []).find(o => o.id === 'family');
  const shownName = b => b?.display_name || b?.name || '';
  // one arrow per stop on the road (ctx.stops: { id, x, boss }); unknown ids get a grey arrow with the boss's surname. The board
  // says the place only (no distance: no numbers on screen in play), and a check once he is beaten
  const STOPS = ctx.stops?.length ? ctx.stops : OLD_STOPS.map(s => ({ ...s, boss: bosses.find(b => b.id === s.id) })).filter(s => s.boss);
  const ARROWS = STOPS.map(s => { const st = ARROW_STYLE[s.id] || { name: (s.boss?.name || s.id).split(' ').pop(), color: 0x6a6f78, ink: '#fff' }; return { id: s.id, text: st.name, color: st.color, ink: st.ink }; });
  const BOSS_N = Math.max(1, STOPS.length);
  const beatenCount = () => STOPS.filter(b => state.beaten?.[b.id]).length;
  let jar = null, bell = null, bellT = -1, bellHung = false, arrowMats = [], ball = null, kid = null, kidTarget = 0, kidWait = 0, ballV = new THREE.Vector3(), keepers = [], water = [];
  let current = null, market = null, shown = -1, arrowsKey = '', signArmed = true, bumpCD = 0, marker = null, markerWord = '', home = null, lastUpd = 0, homeFolk = [];
  const housesFor = n => Math.round(n / BOSS_N * 15);
  const litFor = n => clamp(Math.round(n / BOSS_N * SHARED_KINDS.length), 0, SHARED_KINDS.length);   // how many shared things n beaten bosses light
  const colliders = [];   // the player is pushed out of these: { x, z, r } circles and { x, z, hx, hz, ry } boxes
  const spots = [];   // interactables: { p, r, label(), act() }
  // the shared things: their state survives a rebuild; u is how lit each is right now (0..1), t >= 0 while it pops or fades
  const shared = Object.fromEntries(SHARED_KINDS.map(k => [k, { on: true, u: 1, from: 1, t: -1 }]));
  let schoolGlass = null, schoolGlow = null, bulbMat = null, halos = [], waterScale = 1, staticBoxes = [], camBoxes = [], camKey = '';

  // ---------- materials of my own (made at build: the art mode is read then) ----------
  let PAPER = false, STD, PAINT, GOLD, GLOW, COBBLE, WATER, INK, cobble = null;
  function makeMats() {
    PAPER = P.artMode?.() === 'paper'; const pal = PAL_();
    if (PAPER) {
      STD = toonM(0xffffff, { vertexColors: true }); PAINT = STD; GOLD = toonM(0xffffff, { vertexColors: true, emissive: 0x3a2a08, emissiveIntensity: .5 }); GLOW = toonM(0xffffff, { vertexColors: true, emissive: 0xffd27a, emissiveIntensity: .9 });
      COBBLE = STD; cobble = null; WATER = toonM(0x7cc8ee, { emissive: 0x1a4a6a, emissiveIntensity: .25 });
      INK = new THREE.MeshBasicMaterial({ color: pal.ink, side: THREE.BackSide }); INK.userData.ink = true;
    } else {
      STD = MAT.std(0xffffff, { vertexColors: true }); PAINT = MAT.paint(0xffffff, { vertexColors: true }); GOLD = MAT.gold({ vertexColors: true, color: 0xffffff }); GLOW = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffd27a, emissiveIntensity: 1.1, roughness: .4 });
      cobble = cobbleCanvas(); COBBLE = new THREE.MeshStandardMaterial({ map: cobble, roughness: .95, vertexColors: true });
      WATER = new THREE.MeshPhysicalMaterial({ color: 0x5fb6e8, roughness: .05, clearcoat: 1, transparent: true, opacity: .8, emissive: 0x1a4a6a, emissiveIntensity: .3, depthWrite: false }); INK = null;
    }
  }
  // a painted sign plane's material: HEAD's in the old look, Lambert (no PBR) in paper
  const signMat = (map, roughness = .85) => PAPER ? new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: .3 }) : new THREE.MeshStandardMaterial({ map, roughness });   // paper: a painted board, a little self-lit so its colours hold in any light
  // the palette in paper, HEAD's colours in the old look
  const col = (old, paper) => PAPER ? paper : old;

  function build() {
    if (built) dispose(); makeMats(); built = true; scene.add(group); const bk = new Baker({ inkMat: INK });
    staticBoxes = []; camKey = '';
    buildGround(bk); buildFountain(bk); buildFurniture(bk); buildStalls(bk); buildSchool(bk); buildLookout(bk); buildRoadSign(bk); buildBanner(bk); buildMarket(bk); buildColliders(); buildTrees();
    disposables.push(...bk.bake(group));
    // the bell: its own mesh so it can swing; a rope stub hangs in the empty belfry while it is gone
    const cup = new THREE.LatheGeometry([[0, 0], [.1, 0], [.22, -.12], [.3, -.34], [.34, -.44], [.3, -.46], [.12, -.4], [0, -.4]].map(p => new THREE.Vector2(p[0], p[1])), 18).toNonIndexed(); const clap = new THREE.SphereGeometry(.06, 8, 6).toNonIndexed(); clap.translate(0, -.42, 0);
    const bellG = D(mergeGeometries([cup, clap], false)); cup.dispose(); clap.dispose(); bell = new THREE.Mesh(bellG, D(PAPER ? toonM(0xf2c230, { emissive: 0x3a2a08, emissiveIntensity: .5 }) : MAT.gold())); bell.castShadow = true; bell.position.set(TOWER.x, 6.05, TOWER.z); group.add(bell);
    if (PAPER) { const ink = new THREE.Mesh(D(hullOf(bellG, .03)), INK); bell.add(ink); }
    // the square's life: a kid and a ball, three shopkeepers at their doors
    const bg = D(new THREE.SphereGeometry(.14, 14, 10).toNonIndexed()); { const p = bg.attributes.position, n = p.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { _c.set(Math.abs(p.getY(i)) < .035 ? 0xfff8e7 : 0xd7262c); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; } bg.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
    ball = new THREE.Mesh(bg, D(PAPER ? toonM(0xffffff, { vertexColors: true }) : MAT.paint(0xffffff, { vertexColors: true }))); ball.castShadow = true; ball.position.copy(KID_SPOTS[0]).setY(.14); group.add(ball);
    kid = ctx.gerbilFrom({ color: 0x80a0ff, scale: .6 }); kid.position.copy(KID_SPOTS[1]); group.add(kid); kidTarget = 0; kidWait = 0;
    keepers = KEEPERS.map(([x, z, ry, coat]) => { const g = ctx.gerbilFrom({ color: coat, scale: .9 }); g.position.set(x, 0, z); g.rotation.y = ry; g.userData.hop = 1 + Math.random() * 3; group.add(g); return g; });
    // the jar: what everybody puts a little into; empty until the giants are beaten
    jar = makeJar(); jar.position.copy(JAR_POS); group.add(jar);
    staticBoxes.push(new THREE.Box3(new THREE.Vector3(JAR_POS.x - .62, 0, JAR_POS.z - .62), new THREE.Vector3(JAR_POS.x + .62, 2.0, JAR_POS.z + .62)));   // the jar's stand
    // the interactables
    spots.length = 0;
    spots.push({ p: JAR_POS.clone(), r: REACH, mh: 2.0, say: 'The jar! Press A.', label: () => 'act: look in the jar', act: openJar });
    spots.push({ p: new THREE.Vector3(SIGN_X - 2.2, 0, 0), r: REACH + 1, mh: 1.6, say: 'The road sign! Press A.', label: () => 'act: pick a billionaire', act: openSign });
    spots.push({ p: new THREE.Vector3(SCHOOL.x, 0, SCHOOL.z + SCHOOL_D / 2 + .7), r: REACH, mh: 1.6, say: 'The facts board! Press A.', label: () => 'act: read the facts board', act: openFacts });
    spots.push({ p: new THREE.Vector3(TOWER.x, 0, TOWER.z + 1.4), r: REACH, mh: 1.6, say: 'The bell! Press A.', label: () => bellHung ? 'act: ring the bell' : 'the bell is gone — fill the jar to bring it back', act: ringBell });
    spots.push({ p: market.front.clone(), r: REACH + .4, mh: 1.6, say: 'The board! Press A.', label: () => 'act: read the market board', act: openMarket });
    spots.push({ p: HILL.clone(), r: REACH + .5, mh: 1.6, say: 'The lookout! Press A.', label: () => 'act: look at the valley', act: lookout });
    for (const sp of spots) sp.ps = { label: '', say: sp.say, p: sp.p };   // what promptSpot hands out: one object per spot, so a change of spot is a change of object
    // the floating A over the spot in reach
    const mk = D(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false })); marker = new THREE.Sprite(mk); marker.renderOrder = 20; marker.visible = false; group.add(marker); markerWord = '';
    // Gerbil Street
    city.build(STREET, { houses: 15, seed: 7 });
    for (const k of SHARED_KINDS) applyShared(k, shared[k].u);
    sync(startCount()); return api;
  }

  // ---------- the ground: plaza, paths, the mound ----------
  function buildGround(bk) {
    const tint = col(0xc9b99c, 0xf4e8cc), uvs = g => { const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) * .7, p.getZ(i) * .7); return g; };
    // the plaza: a rounded rectangle straddling the road
    const S = SQUARE, sh = new THREE.Shape(); sh.moveTo(S.x0 + S.r, S.z0); sh.lineTo(S.x1 - S.r, S.z0); sh.quadraticCurveTo(S.x1, S.z0, S.x1, S.z0 + S.r); sh.lineTo(S.x1, S.z1 - S.r); sh.quadraticCurveTo(S.x1, S.z1, S.x1 - S.r, S.z1); sh.lineTo(S.x0 + S.r, S.z1); sh.quadraticCurveTo(S.x0, S.z1, S.x0, S.z1 - S.r); sh.lineTo(S.x0, S.z0 + S.r); sh.quadraticCurveTo(S.x0, S.z0, S.x0 + S.r, S.z0);
    const plaza = new THREE.ShapeGeometry(sh, 6); plaza.rotateX(Math.PI / 2); plaza.scale(1, 1, -1); plaza.computeVertexNormals(); bk.add(COBBLE, uvs(plaza), tint, 0, .012, 0);
    if (PAPER) { const e = .28, sh2 = new THREE.Shape(), x0 = S.x0 - e, x1 = S.x1 + e, z0 = S.z0 - e, z1 = S.z1 + e, r = S.r + e;   // a darker sand rim under the plaza, so its edge reads
      sh2.moveTo(x0 + r, z0); sh2.lineTo(x1 - r, z0); sh2.quadraticCurveTo(x1, z0, x1, z0 + r); sh2.lineTo(x1, z1 - r); sh2.quadraticCurveTo(x1, z1, x1 - r, z1); sh2.lineTo(x0 + r, z1); sh2.quadraticCurveTo(x0, z1, x0, z1 - r); sh2.lineTo(x0, z0 + r); sh2.quadraticCurveTo(x0, z0, x0 + r, z0);
      const pr = new THREE.ShapeGeometry(sh2, 6); pr.rotateX(Math.PI / 2); pr.scale(1, 1, -1); pr.computeVertexNormals(); bk.add(COBBLE, pr, 0xc2a476, 0, .007, 0); }
    // the school path
    const fz0 = SCHOOL.z + SCHOOL_D / 2 + .2; const sp = new THREE.PlaneGeometry(1.1, S.z0 - fz0); sp.rotateX(-Math.PI / 2); sp.translate(SCHOOL.x, .012, (S.z0 + fz0) / 2); bk.add(COBBLE, uvs(sp), tint);
    // the hill path: a ribbon on a curve from the plaza's SW corner to the top
    const P0 = new THREE.Vector2(S.x0 + .2, -4.2), C = new THREE.Vector2(-19, -6), P1 = new THREE.Vector2(HILL.x, HILL.z); const N = 26, pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) { const t = i / N; const x = (1 - t) * (1 - t) * P0.x + 2 * (1 - t) * t * C.x + t * t * P1.x, z = (1 - t) * (1 - t) * P0.y + 2 * (1 - t) * t * C.y + t * t * P1.y; const tx = 2 * (1 - t) * (C.x - P0.x) + 2 * t * (P1.x - C.x), tz = 2 * (1 - t) * (C.y - P0.y) + 2 * t * (P1.y - C.y); const L = Math.hypot(tx, tz) || 1; const nx = -tz / L * .5, nz = tx / L * .5;
      for (const s of [-1, 1]) { const px = x + nx * s, pz = z + nz * s; pos.push(px, heightAt(px, pz) + .02, pz); uv.push(px * .7, pz * .7); } if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
    const ribbon = new THREE.BufferGeometry(); ribbon.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ribbon.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ribbon.setIndex(idx); ribbon.computeVertexNormals(); if (ribbon.attributes.normal.getY(0) < 0) { idx.reverse(); ribbon.setIndex(idx); ribbon.computeVertexNormals(); } bk.add(COBBLE, ribbon, tint);
    // the mound: a disc of rings, greener and lighter toward the top, its rim on the ground
    const RINGS = 14, SEGS = 40, R = HILL_R + .3; const hpos = [], hcol = [], hidx = []; const base = new THREE.Color(col(0x7fa84f, 0x80b75c)), top = new THREE.Color(col(0xa9c86a, 0xa6d27c));
    for (let r = 0; r <= RINGS; r++) for (let sg = 0; sg < SEGS; sg++) { const d = R * r / RINGS, a = sg / SEGS * Math.PI * 2; const x = HILL.x + Math.sin(a) * d, z = HILL.z + Math.cos(a) * d; const h = heightAt(x, z); hpos.push(x, h + .006, z); _c.copy(base).lerp(top, h / HILL_H); hcol.push(_c.r, _c.g, _c.b); }
    for (let r = 0; r < RINGS; r++) for (let sg = 0; sg < SEGS; sg++) { const a = r * SEGS + sg, b = r * SEGS + (sg + 1) % SEGS, c = a + SEGS, d = b + SEGS; hidx.push(a, c, b, b, c, d); }
    const hill = new THREE.BufferGeometry(); hill.setAttribute('position', new THREE.Float32BufferAttribute(hpos, 3)); hill.setAttribute('color', new THREE.Float32BufferAttribute(hcol, 3)); hill.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(hpos.length / 3 * 2), 2)); hill.setIndex(hidx); hill.computeVertexNormals();
    if (hill.attributes.normal.getY(SEGS) < 0) { hidx.reverse(); hill.setIndex(hidx); hill.computeVertexNormals(); } const hg = hill.toNonIndexed(); hill.dispose(); bk.bucket(STD).geos.push(hg);
  }

  // ---------- the fountain ----------
  function buildFountain(bk) {
    const F = FOUNTAIN, stone = col(0x9c968c, 0xb9b2a6), dark = col(0x7a746d, 0x8f877c); bk.inking = PAPER;
    bk.add(STD, new THREE.LatheGeometry([[0, 0], [1.35, 0], [1.4, .4], [1.25, .48], [1.12, .48], [1.12, .12], [0, .12]].map(p => new THREE.Vector2(p[0], p[1])), 28), stone, F.x, 0, F.z);
    bk.add(STD, new THREE.CylinderGeometry(.14, .2, 1.0, 12), dark, F.x, .6, F.z);
    bk.add(STD, new THREE.LatheGeometry([[0, 0], [.55, 0], [.6, .14], [.5, .16], [0, .08]].map(p => new THREE.Vector2(p[0], p[1])), 20), stone, F.x, 1.05, F.z);
    bk.add(STD, new THREE.CylinderGeometry(.05, .07, .32, 8), dark, F.x, 1.3, F.z); bk.add(GOLD, new THREE.SphereGeometry(.14, 12, 10), 0xf6cc4e, F.x, 1.56, F.z); bk.inking = false;
    for (const [r, y] of [[1.1, .4], [.5, 1.19]]) { const w = new THREE.Mesh(D(new THREE.CircleGeometry(r, 28)), WATER); w.rotation.x = -Math.PI / 2; w.position.set(F.x, y, F.z); group.add(w); w.visible = false; water.push(w); } D(WATER);   // the water is a shared thing (setShared('fountain'))
    staticBoxes.push(new THREE.Box3(new THREE.Vector3(F.x - 1.42, 0, F.z - 1.42), new THREE.Vector3(F.x + 1.42, 1.72, F.z + 1.42)));
  }

  // ---------- benches, lamps, planters ----------
  function buildFurniture(bk) {
    const wood = col(0x8a5a30, 0xa8743f), iron = 0x2f4a3a; bk.inking = PAPER;
    const bench = (x, z, ry) => { for (const s of [-1, 1]) bk.add(STD, new THREE.BoxGeometry(.08, .42, .4), iron, x + Math.cos(ry) * s * .55, .21, z - Math.sin(ry) * s * .55, ry);
      bk.add(STD, roundedBox(1.4, .07, .42, .02, 2), wood, x, .45, z, ry); bk.add(STD, roundedBox(1.4, .36, .06, .02, 2), wood, x - Math.sin(ry) * .2, .72, z - Math.cos(ry) * .2, ry, -.15); };
    bench(-3.0, 4.0, Math.PI / 2); bench(3.0, 4.0, -Math.PI / 2);
    const lamp = (x, z) => { bk.add(STD, new THREE.CylinderGeometry(.13, .17, .18, 10), iron, x, .09, z); bk.add(STD, new THREE.CylinderGeometry(.04, .055, 2.7, 8), iron, x, 1.5, z); bk.add(STD, new THREE.BoxGeometry(.32, .06, .32), iron, x, 2.86, z); bk.add(STD, new THREE.BoxGeometry(.22, .06, .22), iron, x, 3.24, z);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) bk.add(STD, new THREE.BoxGeometry(.03, .38, .03), iron, x + sx * .14, 3.05, z + sz * .14); };
    for (const [x, z] of LAMP_XZ) lamp(x, z);
    bk.inking = false;
    // the bulbs and their halos: a shared thing (setShared('lamps')), so not baked. Lit, the bulbs are HEAD's glow exactly
    bulbMat = D(PAPER ? new THREE.MeshBasicMaterial({ color: 0xffe08a }) : new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffd27a, emissiveIntensity: 1.1, roughness: .4 }));
    const bulbs = D(mergeGeometries(LAMP_XZ.map(([x, z]) => new THREE.SphereGeometry(.12, 10, 8).toNonIndexed().translate(x, 3.03, z)), false)); const bm = new THREE.Mesh(bulbs, bulbMat); bm.castShadow = true; group.add(bm);
    const haloMat = D(new THREE.SpriteMaterial({ map: D(srgb(glowCanvas())), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    halos = LAMP_XZ.map(([x, z]) => { const h = new THREE.Sprite(haloMat); h.position.set(x, 3.03, z); h.scale.setScalar(1.3); h.renderOrder = 3; group.add(h); return h; });
    // planters with flowers at the fountain's corners
    const planter = (x, z, hue) => { bk.add(STD, roundedBox(.7, .4, .7, .03, 2), 0xb0543a, x, .2, z); bk.add(STD, new THREE.BoxGeometry(.6, .06, .6), 0x4e8f3a, x, .42, z); for (let i = 0; i < 5; i++) bk.add(PAINT, new THREE.SphereGeometry(.08, 8, 6), _c.setHSL((hue + i * .07) % 1, .8, .6, THREE.SRGBColorSpace).getHex(), x + Math.sin(i * 2.4) * .2, .52, z + Math.cos(i * 2.4) * .2); };
    planter(-1.9, 2.3, .0); planter(1.9, 2.3, .55); planter(-1.9, 5.8, .85); planter(1.9, 5.8, .15);
  }
  // the town's trees and bushes (paper look only): sprite trees from props round the edges, south of the road and out west, clear
  // of the paths, the street, the school and the lookout's view up the valley
  function buildTrees() {
    if (!PAPER || !P.makeTree) return; let sd = 21; const r = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; }; let placed = 0;
    for (let i = 0; i < 500 && placed < 22; i++) { const x = -32 + r() * 60, z = -24 + r() * 52;
      const south = z > 4 && !(x > -13 && x < 13 && z < 10) && !(x > -16 && x < 16 && z > 6) && !(x > 20) , west = x < -29 && z > -10;
      if (!south && !west) continue; if (Math.abs(z) < 3.4) continue;
      if (colliders.some(o => Math.hypot(o.x - x, o.z - z) < 2.5)) continue;
      const t = P.makeTree(.85 + r() * .4); if (!t) break; t.position.set(x, 0, z); group.add(t); colliders.push({ x, z, r: .35 }); placed++; }
    if (P.makeBush) for (const [x, z] of [[-10, -5.5], [10.6, -5.2], [-10.2, 6.6], [10.2, 6.6], [-11.6, 2.4], [11.6, 2.6]]) { const b = P.makeBush(1); if (!b) break; b.position.set(x, 0, z); group.add(b); }
  }

  // ---------- the stalls from props ----------
  function buildStalls(bk) {
    // baked like everything else (a stall is dozens of meshes). Paper: props' toon stall; its sprites (the sign, the brick boxes,
    // the toy car) move to the town's group whole so they keep facing the camera, its ink hulls are re-made here in world space
    const put = (kind, x, z, ry) => { const s = makeStall(kind); s.userData.reveal?.(6); s.position.set(x, 0, z); s.rotation.y = ry; s.updateMatrixWorld(true); staticBoxes.push(new THREE.Box3().setFromObject(s));
      if (PAPER) { const sprites = []; s.traverse(o => { if (o !== s && o.userData?.sprite && !sprites.some(p => { let q = o.parent; while (q) { if (q === p) return true; q = q.parent; } return false; })) sprites.push(o); });
        scene.add(s); for (const o of sprites) group.attach(o); scene.remove(s); s.updateMatrixWorld(true); bk.inking = true; bk.addObject(s); bk.inking = false; }
      else bk.addObject(s); };
    put('lego', -6.8, 4.6, Math.PI); put('cars', 6.8, 4.6, Math.PI); put('house', -7.5, -5.0, 0);
  }

  // ---------- the school: a bigger house with a bell tower ----------
  function buildSchool(bk) {
    const S = SCHOOL, W = SCHOOL_W, Dd = SCHOOL_D, H = SCHOOL_H, F = .25; const cream = col(0xfff1d8, 0xfbf0d4), wood = col(0x7a4e26, 0x8a5a30), red = col(0xc44d3a, 0xd7262c), stone = col(0x9c968c, 0xb9b2a6), door = 0x6b4423, glass = 0xcfe8ff;
    bk.inking = PAPER;
    bk.add(STD, new THREE.BoxGeometry(W + .5, F, Dd + .5), stone, S.x, F / 2, S.z);
    bk.add(STD, new THREE.BoxGeometry(W, H, Dd), cream, S.x, F + H / 2, S.z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bk.add(STD, new THREE.BoxGeometry(.16, H + .04, .16), wood, S.x + sx * W / 2, F + H / 2, S.z + sz * Dd / 2);
    bk.add(STD, new THREE.BoxGeometry(W + .2, .12, .12), wood, S.x, F + H, S.z + Dd / 2);
    // the gable roof: a prism along x, overhanging
    const rise = 1.5, sh = new THREE.Shape(); sh.moveTo(-Dd / 2 - .4, 0); sh.lineTo(Dd / 2 + .4, 0); sh.lineTo(0, rise); sh.closePath(); const prism = new THREE.ExtrudeGeometry(sh, { depth: W + .8, bevelEnabled: false }); prism.rotateY(Math.PI / 2); prism.translate(-(W + .8) / 2, 0, 0); bk.add(STD, prism, red, S.x, F + H - .02, S.z);
    bk.add(STD, new THREE.BoxGeometry(W + .9, .12, .24), 0x8a3a2c, S.x, F + H + rise, S.z);
    // the door, its step and the two lanterns; windows (lit glass with frames)
    const fz = S.z + Dd / 2; bk.add(STD, new THREE.BoxGeometry(1.1, 1.9, .1), door, S.x, F + .95, fz + .03); bk.add(STD, new THREE.BoxGeometry(1.3, .1, .14), wood, S.x, F + 1.92, fz + .04); for (const s of [-1, 1]) bk.add(STD, new THREE.BoxGeometry(.1, 1.96, .14), wood, S.x + s * .6, F + .98, fz + .04);
    bk.add(GOLD, new THREE.SphereGeometry(.05, 8, 6), 0xf6cc4e, S.x + .38, F + .95, fz + .1); bk.add(STD, new THREE.BoxGeometry(1.6, .1, .7), stone, S.x, .05, fz + .35);
    for (const s of [-1, 1]) bk.add(GLOW, new THREE.SphereGeometry(.07, 8, 6), 0xffe0a0, S.x + s * .85, F + 2.1, fz + .12);
    const panes = [];   // the window glass: a shared thing (setShared('school')), so its own mesh
    const win = (x, y, z, ry) => { const pg = new THREE.PlaneGeometry(.8, .9); pg.rotateY(ry); pg.translate(x, y, z); panes.push(pg.toNonIndexed()); pg.dispose(); const sn = Math.sin(ry), cs = Math.cos(ry); const o = (dx, dy, w, h, d) => bk.add(STD, new THREE.BoxGeometry(w, h, d), wood, x + cs * dx, y + dy, z - sn * dx, ry);
      o(0, .48, .95, .08, .1); o(0, -.48, .95, .08, .16); o(-.44, 0, .08, .98, .1); o(.44, 0, .08, .98, .1); o(0, 0, .04, .9, .06); o(0, 0, .9, .04, .06); o(0, -.6, .9, .16, .2);
      for (let i = 0; i < 6; i++) bk.add(PAINT, new THREE.SphereGeometry(.055, 8, 6), _c.setHSL((i * .17) % 1, .8, .6, THREE.SRGBColorSpace).getHex(), x + cs * (-.35 + i * .14) + sn * .1, y - .5, z - sn * (-.35 + i * .14) + cs * .1); };
    win(S.x - 1.7, F + 1.7, fz + .005, 0); win(S.x + 1.7, F + 1.7, fz + .005, 0); win(S.x - W / 2 - .005, F + 1.7, S.z + .8, -Math.PI / 2); win(S.x - W / 2 - .005, F + 1.7, S.z - .8, -Math.PI / 2);
    // lit, the glass is HEAD's glow (the GLOW bucket's look) exactly; dark, it goes slate. A soft warm glow hangs in front of the door
    schoolGlass = D(PAPER ? new THREE.MeshBasicMaterial({ color: 0xffe9a8 }) : new THREE.MeshStandardMaterial({ color: glass, emissive: 0xffd27a, emissiveIntensity: 1.1, roughness: .4 }));
    const pm = new THREE.Mesh(D(mergeGeometries(panes, false)), schoolGlass); panes.forEach(g => g.dispose()); pm.castShadow = true; pm.receiveShadow = true; group.add(pm);
    schoolGlow = new THREE.Sprite(D(new THREE.SpriteMaterial({ map: D(srgb(glowCanvas('rgba(255,226,150,.8)', 'rgba(255,200,110,.25)'))), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })));
    schoolGlow.position.set(S.x, F + 1.6, fz + .3); schoolGlow.scale.set(5.6, 2.4, 1); schoolGlow.renderOrder = 3; group.add(schoolGlow);
    staticBoxes.push(new THREE.Box3(new THREE.Vector3(S.x - (W + .9) / 2, 0, S.z - (Dd + .8) / 2), new THREE.Vector3(S.x + (W + .9) / 2, F + H + 1.62, S.z + (Dd + .8) / 2 + .2)));
    // the sign over the door and the facts board by it
    const signT = D(srgb(textCanvas(['Gerbil Valley School'], { w: 1024, pad: 40, frameW: 18 }))); const sm = new THREE.Mesh(D(new THREE.PlaneGeometry(2.6, 2.6 * signT.image.height / signT.image.width)), D(signMat(signT, .8))); sm.position.set(S.x - W / 2 - .09, F + H - .32, S.z); sm.rotation.y = -Math.PI / 2; group.add(sm);   // on the west wall, facing -x: the camera looks up the road
    const boardT = D(srgb(textCanvas(['Facts', 'board'], { w: 512, pad: 30, frameW: 16, bg: '#2f5d3a', fg: '#f6ecd4' }))); const bm = new THREE.Mesh(D(new THREE.PlaneGeometry(.9, .9 * boardT.image.height / boardT.image.width)), D(signMat(boardT, .9))); bm.position.set(S.x + 1.2, F + .6, fz + .08); group.add(bm);
    // the bell tower: a square tower, an open belfry, a pyramid roof
    const T = TOWER, TW = 1.4, TH = 5.2; bk.add(STD, new THREE.BoxGeometry(TW + .4, F, TW + .4), stone, T.x, F / 2, T.z); bk.add(STD, new THREE.BoxGeometry(TW, TH, TW), cream, T.x, F + TH / 2, T.z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { bk.add(STD, new THREE.BoxGeometry(.14, TH + .04, .14), wood, T.x + sx * TW / 2, F + TH / 2, T.z + sz * TW / 2); bk.add(STD, new THREE.BoxGeometry(.14, 1.3, .14), wood, T.x + sx * (TW / 2 - .07), F + TH + .65, T.z + sz * (TW / 2 - .07)); }
    bk.add(STD, new THREE.BoxGeometry(TW + .2, .12, TW + .2), wood, T.x, F + TH + 1.3, T.z); bk.add(STD, new THREE.BoxGeometry(TW + .1, .1, TW + .1), wood, T.x, F + TH, T.z);
    const pyr = new THREE.ConeGeometry(TW * .95, 1.1, 4, 1); pyr.rotateY(Math.PI / 4); bk.add(STD, pyr, red, T.x, F + TH + 1.36 + .55, T.z); bk.add(GOLD, new THREE.SphereGeometry(.1, 10, 8), 0xf6cc4e, T.x, F + TH + 2.5, T.z);
    bk.add(STD, new THREE.CylinderGeometry(.02, .02, .25, 6), 0x5a4a3a, T.x, F + TH + 1.18, T.z);   // the hook the bell hangs from
    bk.add(GLOW, new THREE.PlaneGeometry(.5, .7), glass, T.x, F + 3.2, T.z + TW / 2 + .005, 0); bk.add(STD, new THREE.BoxGeometry(.6, .08, .1), wood, T.x, F + 3.58, T.z + TW / 2 + .03); bk.add(STD, new THREE.BoxGeometry(.6, .08, .16), wood, T.x, F + 2.82, T.z + TW / 2 + .04);
    bk.add(STD, new THREE.BoxGeometry(1.1, 1.9, .1), door, T.x, F + .95, T.z + TW / 2 + .03); bk.add(STD, new THREE.BoxGeometry(1.3, .1, .14), wood, T.x, F + 1.92, T.z + TW / 2 + .04);
    bk.inking = false;
    staticBoxes.push(new THREE.Box3(new THREE.Vector3(T.x - .9, 0, T.z - .9), new THREE.Vector3(T.x + .9, F + TH + 2.6, T.z + .9)));
  }

  // ---------- the lookout: a rail on top, the signpost at the path's foot ----------
  function buildLookout(bk) {
    const wood = col(0x8a5a30, 0xa8743f); const dir = Math.atan2(HILL.x * -1, HILL.z * -1); bk.inking = PAPER; // toward the town (the origin)
    const posts = []; for (const a of [-.7, -.35, 0, .35, .7]) { const ang = dir + a; const x = HILL.x + Math.sin(ang) * 1.3, z = HILL.z + Math.cos(ang) * 1.3; const y = heightAt(x, z); posts.push([x, y, z]); bk.add(STD, new THREE.BoxGeometry(.09, .9, .09), wood, x, y + .45, z); }
    for (let i = 0; i < posts.length - 1; i++) { const [ax, ay, az] = posts[i], [bx, by, bz] = posts[i + 1]; const L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az); for (const h of [.5, .85]) bk.add(STD, new THREE.BoxGeometry(.06, .06, L), wood, (ax + bx) / 2, (ay + by) / 2 + h, (az + bz) / 2, ry); }
    const sx = -12.8, sz = -3.6, ry = Math.atan2(0 - sx, 0 - sz); bk.add(STD, new THREE.CylinderGeometry(.05, .06, 1.9, 8), wood, sx, .95, sz);
    const t = D(srgb(textCanvas(['Lookout'], { w: 512, pad: 36, frameW: 16 }))); const m = new THREE.Mesh(D(new THREE.PlaneGeometry(1.3, 1.3 * t.image.height / t.image.width)), D(signMat(t))); m.position.set(sx + Math.sin(ry) * .05, 1.65, sz + Math.cos(ry) * .05); m.rotation.y = ry; group.add(m);
    bk.add(STD, new THREE.BoxGeometry(1.34, 1.3 * t.image.height / t.image.width + .04, .05), 0x7a4e26, sx, 1.65, sz, ry); bk.inking = false;
  }

  // ---------- the road sign: an arch across the road, a board per stop hung under its beam, all facing the town (-x) ----------
  function buildRoadSign(bk) {
    const wood = col(0x8a5a30, 0xa8743f), stone = col(0x9c968c, 0xb9b2a6), X = SIGN_X, A = ARCH_HALF, H = ARCH_H; bk.inking = PAPER;
    for (const sd of [-1, 1]) staticBoxes.push(new THREE.Box3(new THREE.Vector3(X - .5, 0, sd * A - .5), new THREE.Vector3(X + .5, H + .34, sd * A + .5)));   // the posts (the camera keeps out of them)
    for (const sd of [-1, 1]) { bk.add(STD, new THREE.CylinderGeometry(.14, .18, H, 12), wood, X, H / 2, sd * A); bk.add(STD, new THREE.CylinderGeometry(.42, .5, .2, 12), stone, X, .1, sd * A); bk.add(STD, new THREE.SphereGeometry(.2, 12, 10), wood, X, H + .14, sd * A); }
    bk.add(STD, new THREE.BoxGeometry(.26, .3, 2 * A + .5), wood, X, H - .1, 0);   // the beam
    // the header over the beam
    const ht = D(srgb(textCanvas(['To the billionaires'], { w: 1024, pad: 30, frameW: 16 }))); const hw = 5.4, hh = hw * ht.image.height / ht.image.width, hy = H + .08 + hh / 2;
    const hm = new THREE.Mesh(D(new THREE.PlaneGeometry(hw, hh)), D(signMat(ht))); hm.position.set(X - .16, hy, 0); hm.rotation.y = -Math.PI / 2; group.add(hm);
    bk.add(STD, new THREE.BoxGeometry(.06, hh + .06, hw + .06), 0x7a4e26, X - .11, hy, 0);
    // the boards, nearest stop first, on rods down from the beam. Up to five hang in one column; more go in two columns, read
    // left to right, then down (eight stops = four rows), so the lowest board stays well over her head
    arrowMats = []; const n = ARROWS.length, cols = n > 5 ? 2 : 1, rows = Math.ceil(n / cols), BW = cols > 1 ? 3.35 : 5.4, BH = cols > 1 ? .46 : .55, GAPZ = .2;
    const step = Math.min(BH + .06, (H - 2.2) / Math.max(1, rows)), y0 = H - .45 - BH / 2;
    const colZ = c => cols > 1 ? (c ? 1 : -1) * (BW + GAPZ) / 2 : 0;   // the camera looks +x: -z is the viewer's left
    for (let c = 0; c < cols; c++) { const rc = Math.ceil((n - c) / cols), len = (H - .25) - (y0 - (rc - 1) * step); for (const sd of [-1, 1]) bk.add(STD, new THREE.CylinderGeometry(.02, .02, len, 6), 0x3a3a3a, X + .06, H - .25 - len / 2, colZ(c) + sd * (BW / 2 - .3)); }
    ARROWS.forEach((a, i) => { const y = y0 - Math.floor(i / cols) * step, z = colZ(i % cols);
      bk.add(PAINT, roundedBox(.08, BH, BW, .03, 2), a.color, X, y, z);
      const mat = D(PAPER ? new THREE.MeshLambertMaterial({ transparent: true, alphaTest: .1 }) : new THREE.MeshStandardMaterial({ transparent: true, roughness: .8, alphaTest: .1 })); arrowMats.push(mat); const PW = BW - .12; const plane = new THREE.Mesh(D(new THREE.PlaneGeometry(PW, Math.min(BH - .04, PW * 120 / 1024))), mat); plane.position.set(X - .05, y, z); plane.rotation.y = -Math.PI / 2; group.add(plane); });
    bk.inking = false;
  }

  // ---------- the banner over the road ----------
  function buildBanner(bk) {
    const iron = 0x2f4a3a; for (const s of [-1, 1]) { bk.add(STD, new THREE.CylinderGeometry(.06, .08, BANNER_Y + .25, 8), iron, BANNER_X, (BANNER_Y + .25) / 2, s * (ROAD_HALF + 1.2)); bk.add(GOLD, new THREE.SphereGeometry(.1, 10, 8), 0xf6cc4e, BANNER_X, BANNER_Y + .3, s * (ROAD_HALF + 1.2)); }
    bk.add(STD, new THREE.CylinderGeometry(.03, .03, (ROAD_HALF + 1.2) * 2, 6), iron, BANNER_X, BANNER_Y, 0, 0, Math.PI / 2);
    const t = D(srgb(bannerCanvas())); const W = (ROAD_HALF + 1.2) * 2 - .3, H = W * 288 / 1536; const geo = D(new THREE.PlaneGeometry(W, H)); const mat = D(signMat(t));
    for (const s of [-1, 1]) { const m = new THREE.Mesh(geo, mat); m.position.set(BANNER_X + s * .02, BANNER_Y - .04 - H / 2, 0); m.rotation.y = -s * Math.PI / 2; m.castShadow = true; group.add(m); }
  }

  // ---------- what the player can't walk through ----------
  function buildColliders() {
    colliders.length = 0; const c = (x, z, r) => colliders.push({ x, z, r }), b = (x, z, hx, hz, ry = 0) => colliders.push({ x, z, hx, hz, ry });
    c(FOUNTAIN.x, FOUNTAIN.z, 1.42); c(JAR_POS.x, JAR_POS.z, .62);
    b(-6.8, 4.6, 1.55, 1.55); b(6.8, 4.6, 1.55, 1.55); b(-7.5, -5.0, 1.55, 1.55); c(-5.9, -4.6, .55);   // the stalls (3 m foundations) and the house stall's stairs
    b(SCHOOL.x, SCHOOL.z, (SCHOOL_W + .5) / 2, (SCHOOL_D + .5) / 2); b(TOWER.x, TOWER.z, .9, .9);
    for (const [x, z] of [[-3.4, 2.3], [3.4, 2.3], [-3.4, 6.3], [3.4, 6.3], [-9.5, -2.6], [9.5, -2.6]]) c(x, z, .17);   // lamps
    b(-3.0, 4.0, .24, .72); b(3.0, 4.0, .24, .72); for (const [x, z] of [[-1.9, 2.3], [1.9, 2.3], [-1.9, 5.8], [1.9, 5.8]]) b(x, z, .36, .36);   // benches, planters
    for (const sd of [-1, 1]) c(SIGN_X, sd * ARCH_HALF, .5); c(-12.8, -3.6, .1); for (const sz of [-1, 1]) c(BANNER_X, sz * (ROAD_HALF + 1.2), .1);   // the arch's posts (she walks in under the beam), the lookout sign, the banner's poles
    b(MARKET.x, MARKET.z, MB.w / 2 + .3, .55, MARKET_YAW);
  }
  // push a point (radius rad) out of every collider; Gerbil Street's built houses count too
  function pushOut(p, rad) {
    for (const o of colliders) { if (o.r !== undefined) { const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), R = o.r + rad; if (d < R && d > 1e-5) { p.x = o.x + dx / d * R; p.z = o.z + dz / d * R; } } else pushBox(p, rad, o.x, o.z, o.hx, o.hz, o.ry); }
    for (const l of city.lots || []) if (l.built && l.pop >= .8) pushBox(p, rad, STREET.x + l.x, STREET.z + l.z, 1.2 * l.w + .15, 1.15, l.ry);
  }
  // the town's edges: hold a point inside BOX (rounded corners); true when it had to be moved
  function keepIn(p) {
    const B = BOX, r = BOX_R, ix = clamp(p.x, B.x0 + r, B.x1 - r), iz = clamp(p.z, B.z0 + r, B.z1 - r), dx = p.x - ix, dz = p.z - iz, d = Math.hypot(dx, dz);
    if (d <= r) return false; p.x = ix + dx / d * r; p.z = iz + dz / d * r; return true;
  }
  function pushBox(p, rad, x, z, hx, hz, ry) {
    const sn = Math.sin(ry), cs = Math.cos(ry), dx = p.x - x, dz = p.z - z; let lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    const ox = hx + rad - Math.abs(lx), oz = hz + rad - Math.abs(lz); if (ox <= 0 || oz <= 0) return;
    if (ox < oz) lx = Math.sign(lx || 1) * (hx + rad); else lz = Math.sign(lz || 1) * (hz + rad);
    p.x = x + lx * cs + lz * sn; p.z = z - lx * sn + lz * cs;
  }

  // ---------- the market board: the 10-coins picture (market.new_money) ----------
  // A framed board on two posts under a little roof, its face painted: the market stall in the middle, a hill on the right with
  // big gold houses on top, a row of small street houses on the left. Ten big coins pop out of the market, seven roll up the
  // hill to the gold houses and three roll down to the street; they rest, then the loop starts again. Two words on it: 'New
  // coins'. The coins are 3D (an instanced mesh in front of the face) so they can roll; the split comes from the data
  // (market.items new_money: 'the richest 1 family in 10 got $7' of every $10), 7 and 3 when it can't be read.
  function buildMarket(bk) {
    const W = MB.w, Y0 = MB.y0, H = MB.h, wood = col(0x7a4e26, 0x8a5a30), dark = col(0x5a3a1c, 0x3b2516); const sn = Math.sin(MARKET_YAW), cs = Math.cos(MARKET_YAW);
    const g = new THREE.Group(); g.position.copy(MARKET); g.rotation.y = MARKET_YAW; group.add(g);
    const toWorld = (lx, ly, lz) => [MARKET.x + lx * cs + lz * sn, ly, MARKET.z - lx * sn + lz * cs];
    const put = (geo, hex, lx, ly, lz, mat = STD) => { const [x, y, z] = toWorld(lx, ly, lz); bk.add(mat, geo, hex, x, y, z, MARKET_YAW); };
    bk.inking = PAPER;
    for (const sx of [-1, 1]) { put(new THREE.BoxGeometry(.22, Y0 + H + .5, .22), wood, sx * (W / 2 + .14), (Y0 + H + .5) / 2, -.02); put(new THREE.CylinderGeometry(.3, .36, .14, 10), col(0x9c968c, 0xb9b2a6), sx * (W / 2 + .14), .07, -.02); }
    put(new THREE.BoxGeometry(W + .2, H + .2, .1), dark, 0, Y0 + H / 2, -.08);                        // the frame behind the face
    put(new THREE.BoxGeometry(W + .9, .14, .5), col(0xc44d3a, 0xd7262c), 0, Y0 + H + .42, .0);       // a little roof
    bk.inking = false;
    { const box = new THREE.Box3(); for (const lx of [-W / 2 - .45, W / 2 + .45]) for (const lz of [-.3, .3]) for (const ly of [0, Y0 + H + .5]) box.expandByPoint(_v.set(...toWorld(lx, ly, lz))); staticBoxes.push(box); }
    // the split: of every 10 new coins, how many went to the richest
    const nm = (data.market?.items || []).find(i => i.id === 'new_money'); const m7 = /got \$(\d+(?:\.\d+)?)\b/.exec(nm?.line || ''); const RICH = clamp(Math.round(nm?.rich_of_10 ?? (m7 ? +m7[1] : 7)), 0, 10), N = 10;
    // the face: painted at PX px per metre; canvas y runs down from the board's top
    const PX = 200, cw = Math.round(W * PX), ch = Math.round(H * PX); const [cv, cx] = canvas(cw, ch); const inkC = '#3b2516', F = px => `700 ${Math.round(px)}px Fredoka, "Arial Rounded MT Bold", sans-serif`;
    const GROUND = 770, PLATEAU = 360, HILL0 = 900, HILL1 = 1190, R = 34;   // px: the street's ground line, the hilltop, where the hill starts and tops out, a coin's radius
    const groundY = x => { if (x <= HILL0) return GROUND; if (x >= HILL1) return PLATEAU; const u = (x - HILL0) / (HILL1 - HILL0); return GROUND - (GROUND - PLATEAU) * u * u * (3 - 2 * u); };
    cx.lineJoin = cx.lineCap = 'round';
    cx.fillStyle = '#dff0f7'; cx.fillRect(0, 0, cw, ch);                                                   // the sky
    cx.fillStyle = '#fbf0d4'; cx.fillRect(0, 0, cw, 210);                                                    // the title band
    cx.fillStyle = '#2b2418'; cx.font = F(165); cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('New coins', cw / 2, 112, cw - 120);
    cx.strokeStyle = inkC; cx.lineWidth = 8; cx.beginPath(); cx.moveTo(22, 210); cx.lineTo(cw - 22, 210); cx.stroke();
    // the ground: the street on the left, the hill on the right
    cx.fillStyle = '#8cc067'; cx.beginPath(); cx.moveTo(0, ch); cx.lineTo(0, GROUND); for (let x = 0; x <= cw; x += 8) cx.lineTo(x, groundY(x)); cx.lineTo(cw, ch); cx.closePath(); cx.fill();
    cx.strokeStyle = inkC; cx.lineWidth = 8; cx.beginPath(); for (let x = 0; x <= cw; x += 8) x ? cx.lineTo(x, groundY(x)) : cx.moveTo(x, groundY(x)); cx.stroke();
    cx.fillStyle = '#e9d09c'; cx.fillRect(22, GROUND + 6, HILL0 - 60, 30);                                // the street
    const house = (x, base, w, h, wall, roof, door = '#8a5a30') => { cx.lineWidth = 7; cx.strokeStyle = inkC; cx.fillStyle = wall; cx.fillRect(x - w / 2, base - h, w, h); cx.strokeRect(x - w / 2, base - h, w, h);
      cx.fillStyle = roof; cx.beginPath(); cx.moveTo(x - w / 2 - w * .12, base - h); cx.lineTo(x, base - h - h * .75); cx.lineTo(x + w / 2 + w * .12, base - h); cx.closePath(); cx.fill(); cx.stroke();
      cx.fillStyle = door; cx.fillRect(x - w * .1, base - h * .5, w * .2, h * .5); cx.strokeRect(x - w * .1, base - h * .5, w * .2, h * .5);
      cx.fillStyle = '#bfe6f7'; for (const s of [-1, 1]) { cx.fillRect(x + s * w * .3 - w * .09, base - h * .78, w * .18, h * .22); cx.strokeRect(x + s * w * .3 - w * .09, base - h * .78, w * .18, h * .22); } };
    // the big gold houses on the hilltop, the small street houses on the left
    house(1250, PLATEAU, 170, 150, '#f6cc4e', '#d7262c', '#a8743f'); house(1388, PLATEAU, 130, 175, '#f2c230', '#b8860b', '#a8743f');
    for (const [x, w, h, roof] of [[90, 74, 66, '#3a7bd5'], [190, 70, 60, '#d7262c'], [290, 76, 70, '#3b8f4a'], [390, 70, 62, '#f2c230'], [490, 72, 66, '#3a7bd5']]) house(x, GROUND, w, h, '#fbf0d4', roof);
    // the market stall in the middle: a counter under a striped awning
    { const x0 = 650, x1 = 830, top = 600; cx.lineWidth = 7; cx.strokeStyle = inkC; cx.fillStyle = '#a8743f'; cx.fillRect(x0 + 10, top + 70, x1 - x0 - 20, GROUND - top - 70); cx.strokeRect(x0 + 10, top + 70, x1 - x0 - 20, GROUND - top - 70);
      for (let i = 0; i < 6; i++) { cx.fillStyle = i % 2 ? '#fbf0d4' : '#d7262c'; const a = x0 + i * (x1 - x0) / 6, b = a + (x1 - x0) / 6; cx.beginPath(); cx.moveTo(a, top); cx.lineTo(b, top); cx.lineTo(b, top + 50); cx.quadraticCurveTo((a + b) / 2, top + 72, a, top + 50); cx.closePath(); cx.fill(); cx.stroke(); }
      cx.fillStyle = '#d7262c'; cx.fillRect(x0, top - 18, x1 - x0, 20); cx.strokeRect(x0, top - 18, x1 - x0, 20); }
    // dashed trails: uphill and down the street
    cx.setLineDash([18, 22]); cx.lineWidth = 6; cx.strokeStyle = 'rgba(59,37,22,.45)';
    cx.beginPath(); for (let x = 850; x <= 1180; x += 10) x === 850 ? cx.moveTo(x, groundY(x) - 12) : cx.lineTo(x, groundY(x) - 12); cx.stroke();
    cx.beginPath(); cx.moveTo(640, GROUND - 12); cx.lineTo(470, GROUND - 12); cx.stroke(); cx.setLineDash([]);
    cx.strokeStyle = '#7a4e26'; cx.lineWidth = 22; cx.strokeRect(11, 11, cw - 22, ch - 22);
    const face = new THREE.Mesh(D(new THREE.PlaneGeometry(W, H)), D(signMat(D(srgb(cv))))); face.position.set(0, Y0 + H / 2, -.02); g.add(face);
    // the coins: a gold face with a star on each side, rolling on edge in the board's plane (the axle = the board's normal)
    const [kc, kg] = canvas(128, 128); kg.fillStyle = '#f2c230'; kg.beginPath(); kg.arc(64, 64, 62, 0, 7); kg.fill(); kg.lineWidth = 7; kg.strokeStyle = '#b8860b'; kg.beginPath(); kg.arc(64, 64, 46, 0, 7); kg.stroke();
    kg.fillStyle = '#fff2c4'; kg.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? 13 : 30; kg.lineTo(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr); } kg.closePath(); kg.fill(); kg.lineWidth = 5; kg.strokeStyle = '#3b2516'; kg.stroke();
    const kt = D(srgb(kc)); const r = R / PX, thick = .05;
    const coinGeo = D(new THREE.CylinderGeometry(r, r, thick, 28)); coinGeo.rotateX(Math.PI / 2);   // caps face ±z (out of the board)
    const coinMat = D(PAPER ? toonM(0xffffff, { map: kt }) : new THREE.MeshStandardMaterial({ map: kt, roughness: .35, metalness: .45, emissive: 0x5a4210, emissiveIntensity: .3 }));
    const coins = new THREE.InstancedMesh(coinGeo, coinMat, N); coins.castShadow = true; coins.frustumCulled = false; g.add(coins);
    let coinInk = null; if (PAPER) { const ig = D(new THREE.CylinderGeometry(r * 1.16, r * 1.16, thick * .6, 28)); ig.rotateX(Math.PI / 2); ig.translate(0, 0, -.02); coinInk = new THREE.InstancedMesh(ig, D(new THREE.MeshBasicMaterial({ color: PAL_().ink })), N); coinInk.instanceMatrix = coins.instanceMatrix; coinInk.frustumCulled = false; g.add(coinInk); }
    // where each coin starts (a little heap over the stall), and where it comes to rest: the rich pile on the hilltop (bottom row
    // of four, then three on top, and so on), the street's coins in a line in front of the small houses
    const P2L = (px, py) => [px / PX - W / 2, Y0 + H - py / PX];
    const paths = []; for (let i = 0; i < N; i++) { const rich = i < RICH, k = rich ? i : i - RICH; let ex, ey;
      if (rich) { const row = k < 4 ? 0 : k < 7 ? 1 : 2, j = row === 0 ? k : row === 1 ? k - 4 : k - 7; ex = 1200 + row * 34 + j * 68; ey = PLATEAU - R - row * 64; }
      else { ex = 300 + k * 74 - Math.floor(k / 4) * 296; ey = GROUND - R - Math.floor(k / 4) * 64; }
      paths.push({ rich, sx: 700 + (i % 4) * 26, sy: 540 - Math.floor(i / 4) * 40, ex, ey, delay: rich ? .1 + k * .22 : .25 + k * .3 }); }
    market = { g, coins, coinInk, paths, P2L, groundY, R, PX, t: 0, front: new THREE.Vector3(...toWorld(0, 0, 1.6)) };
    placeCoins(0);
  }
  // the coins at loop time t (s): pop out of the stall (0-.7), roll to their spot (.7-3.6, staggered), rest, shrink away (9.4-10)
  const COIN_LOOP = 10;
  function placeCoins(t) {
    const M = market; if (!M) return; const lt = t % COIN_LOOP;
    for (let i = 0; i < M.paths.length; i++) { const p = M.paths[i]; let px, py, spin = 0, sc = 1;
      const pop = clamp(lt / .7, 0, 1), u = clamp((lt - .7 - p.delay) / 2.4, 0, 1), e = u * u * (3 - 2 * u);
      if (u <= 0) { px = p.sx; py = p.sy + (1 - pop) * 120; sc = Math.max(.001, easeOutBack(pop)); }
      else { px = p.sx + (p.ex - p.sx) * e; const ground = M.groundY(px) - M.R, end = p.ey; const hop = Math.sin(Math.min(1, e / .3) * Math.PI) * (e < .3 ? 60 : 0);
        py = e < .3 ? p.sy + (ground - p.sy) * (e / .3) - hop : ground + (end - ground) * clamp((e - .82) / .18, 0, 1);
        spin = -(px - p.sx) / M.R; }
      if (lt > COIN_LOOP - .6) sc = Math.max(.001, (COIN_LOOP - lt) / .6);
      const [lx, ly] = M.P2L(px, py); _m.compose(_v.set(lx, ly, .07), _q.setFromAxisAngle(_w.set(0, 0, 1), spin), _s.setScalar(sc)); M.coins.setMatrixAt(i, _m); }
    M.coins.instanceMatrix.needsUpdate = true;
  }

  // ---------- state → scene ----------
  // sync(n): the town shows n billionaires beaten, at once (no pop-in): the street's homes, the jar, the shared things (the first
  // litFor(n) of school, lamps, fountain, bell lit, the rest dark). Main calls sync(state.homeN) before a homecoming, so nothing
  // here pops a house the homecoming will pop.
  function sync(n) {
    if (!built) return shown; n = typeof n === 'number' && Number.isFinite(n) ? clamp(Math.round(n), 0, BOSS_N) : beatenCount(); shown = n;
    city.setProgress(housesFor(n), { instant: true }); jar?.userData.setFill(n / BOSS_N);
    const lit = litFor(n); SHARED_KINDS.forEach((k, i) => setShared(k, i < lit, { instant: true })); refreshArrows(); camKey = ''; return n;
  }
  // what the town shows on the way in: the homes already welcomed (state.homeN, main's), never more than are beaten
  function startCount() { const b = beatenCount(), h = state.homeN; return typeof h === 'number' ? Math.min(h, b) : b; }
  function refreshArrows() { const key = ARROWS.map(a => state.beaten?.[a.id] ? 1 : 0).join(''); if (key === arrowsKey) return; arrowsKey = key;
    ARROWS.forEach((a, i) => { const m = arrowMats[i]; if (!m) return; const done = !!state.beaten?.[a.id]; m.map?.dispose(); m.map = srgb(arrowCanvas(a.text, a.ink, done)); m.needsUpdate = true; }); }
  function setFountain(on) { setShared('fountain', on, { instant: true }); }
  function enter() { if (!built) build(); if (home) endHome(false); sync(startCount()); player.position.copy(SPAWN); player.rotation.set(0, Math.PI / 2, 0); current = null; signArmed = true; return api; }

  // ---------- the shared things (contract C4) ----------
  // setShared(kind, on, { instant }): school = its windows lit or dark plus a soft glow; lamps = the six square lamps' bulbs and
  // halos; fountain = the water; bell = the bell hung or gone. Not instant: a .5 s pop (or fade) with a burst; the bell rings as
  // it comes back. Works before build too (the state is kept and shown at build).
  function sharedPos(kind) {
    switch (kind) {
      case 'school': return new THREE.Vector3(SCHOOL.x, .25 + 1.7, SCHOOL.z + SCHOOL_D / 2 + .1);
      case 'lamps': return new THREE.Vector3(0, 3.03, 2.3);   // between the front pair of square lamps
      case 'fountain': return new THREE.Vector3(FOUNTAIN.x, 1.2, FOUNTAIN.z);
      case 'bell': return new THREE.Vector3(TOWER.x, 6.05, TOWER.z);
      default: return null;
    }
  }
  function sharedOn(kind) { return !!shared[kind]?.on; }
  function setShared(kind, on, { instant = false } = {}) {
    const s = shared[kind]; if (!s) return false; on = !!on; if (kind === 'bell') bellHung = on;
    if (instant || !built) { s.on = on; s.t = -1; s.u = on ? 1 : 0; s.from = s.u; if (built) applyShared(kind, s.u); return true; }
    if (s.on === on && s.t < 0) return true;   // already there
    s.on = on; s.from = s.u; s.t = 0;
    const burst = on ? (kind === 'fountain' ? 0x8ec6ea : 0xffd27a) : 0x9a958f;
    if (kind === 'lamps') for (const [x, z] of LAMP_XZ) ctx.spawnBurst?.(scene, _w.set(x, 3.03, z), burst, 8); else ctx.spawnBurst?.(scene, sharedPos(kind), burst, kind === 'school' ? 22 : 16);
    if (kind === 'bell' && on) { bellT = 0; ctx.sfx?.play?.('built'); }   // the bell rings as it comes back
    return true;
  }
  // show a shared thing at u (0 dark/gone .. 1 lit/there); rising pops (ease out back), falling fades
  function applyShared(kind, u) {
    const s = shared[kind], pop = s && s.on && s.t >= 0 ? Math.max(0, easeOutBack(clamp((u - s.from) / Math.max(1e-3, 1 - s.from), 0, 1))) * (1 - s.from) + s.from : u;
    if (kind === 'school' && schoolGlass) {
      if (PAPER) schoolGlass.color.lerpColors(_c.set(0x4a5866), _c2.set(0xffe9a8), u); else { schoolGlass.emissiveIntensity = 1.1 * u; schoolGlass.color.lerpColors(_c.set(0x5a6a7a), _c2.set(0xcfe8ff), u); }
      if (schoolGlow) { schoolGlow.material.opacity = .38 * u; schoolGlow.visible = u > .01; schoolGlow.scale.set(5.6 * (.7 + .3 * pop), 2.4 * (.7 + .3 * pop), 1); }
    } else if (kind === 'lamps' && bulbMat) {
      if (PAPER) bulbMat.color.lerpColors(_c.set(0x5d6268), _c2.set(0xffe08a), u); else { bulbMat.emissiveIntensity = 1.1 * u; bulbMat.color.lerpColors(_c.set(0x5d6268), _c2.set(0xffd27a), u); }
      for (const h of halos) { h.material.opacity = .85 * u; h.visible = u > .01; h.scale.setScalar(1.3 * Math.max(.05, pop)); }
    } else if (kind === 'fountain') { waterScale = Math.max(.001, pop); for (const w of water) { w.visible = u > .01; w.scale.setScalar(waterScale); } }
    else if (kind === 'bell' && bell) { bell.visible = u > .01; bell.scale.setScalar(Math.max(.001, pop)); }
  }
  function stepShared(dt) { for (const k of SHARED_KINDS) { const s = shared[k]; if (s.t < 0) continue; s.t += dt; const e = clamp(s.t / SHARED_T, 0, 1); s.u = s.from + ((s.on ? 1 : 0) - s.from) * e; if (e >= 1) { s.u = s.on ? 1 : 0; s.t = -1; } applyShared(k, s.u); } }

  // ---------- the camera's no-go boxes: world Box3s it must not enter (main pulls in or fades) ----------
  // the school, the bell tower, every stall, the fountain basin, the market board, the jar stand, the road sign's posts (static,
  // made at build) and every built house on Gerbil Street (from the city, re-read when the street changes)
  function cameraBoxes() {
    if (!built) return []; const lots = city.lots || []; let key = String(city.progress); for (const l of lots) key += l.built ? '1' : '0';
    if (key === camKey) return camBoxes; camKey = key;
    const houses = city.cameraBoxes?.() ?? lots.filter(l => l.built).map(l => { const q = Math.abs(Math.sin(l.ry)) > .5, hx = q ? 1.3 : 1.5 * l.w, hz = q ? 1.5 * l.w : 1.3, x = STREET.x + l.x, z = STREET.z + l.z; return new THREE.Box3(new THREE.Vector3(x - hx, 0, z - hz), new THREE.Vector3(x + hx, 3.9, z + hz)); });
    camBoxes = [...staticBoxes, ...houses]; return camBoxes;
  }

  // ---------- the cards ----------
  // Kid cards carry no number above ten and no real money; every real figure is behind openGrownups() (a silent card) or in a
  // <details class="grownups"> block (never spoken, shown collapsed).
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const grownups = html => `<details class="grownups"><summary>For grown-ups</summary>${html}</details>`;
  // the road sign's picker: every stop on the road, each with its colour; the next one not yet beaten first and preselected;
  // spoken: 'Next is <Name>. Press A to go.' Names only (display_name || name), no numbers
  // drawn, not written (no text, so the read-aloud never says them): the next one's big arrow, a beaten one's tick
  const NEXT_SVG = '<svg class="signNext" width="54" height="54" viewBox="0 0 54 54" style="vertical-align:middle;margin-right:6px" aria-hidden="true"><path d="M6 16h22V5l21 22-21 22V38H6z" fill="#f2c230" stroke="#3b2516" stroke-width="4" stroke-linejoin="round"/></svg>';
  const TICK_SVG = '<svg width="64" height="64" viewBox="0 0 64 64" style="position:absolute;inset:-4px" aria-hidden="true"><circle cx="46" cy="46" r="15" fill="#2f9e44" stroke="#fff" stroke-width="3"/><path d="M38 46l6 6 10-12" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function openSign() {
    ctx.onSign?.();   // main: the goal now names the pick, however the picker opened (walked in under the arch, or A at the sign)
    const hex = c => '#' + (c >>> 0).toString(16).padStart(6, '0');
    const list = STOPS.map(sp => { const st = ARROW_STYLE[sp.id] || { name: (sp.boss?.name || sp.id).split(' ').pop(), color: 0x6a6f78 }; const b = sp.boss || bosses.find(x => x.id === sp.id); return { id: sp.id, name: shownName(b) || st.name, place: st.name, color: st.color, done: !!state.beaten?.[sp.id] }; });
    const next = list.find(x => !x.done), order = next ? [next, ...list.filter(x => x !== next)] : list;
    // (verify) each button carries his face (main.js draws the 3D caricature to a picture once): Alex can't read the names. The next
    // one gets a big pointing hand; a beaten one a big green tick over his face.
    const face = x => { const u = ctx.bossThumbURL?.(x.id); const ring = hex(x.color);
      return `<span class="signFace" style="position:relative;display:inline-block;width:64px;height:64px;border-radius:50%;background:#fbf0d4;border:4px solid ${ring};box-shadow:0 0 0 2px #3b2516;vertical-align:middle;margin-right:10px;overflow:hidden">${u ? `<img src="${u}" alt="" style="width:100%;height:100%;object-fit:cover">` : ''}${x.done ? TICK_SVG : ''}</span>`; };
    const choices = order.map(x => ({ label: `${x === next ? NEXT_SVG : ''}${face(x)}<span style="display:inline-block;vertical-align:middle;text-align:left"><b>${esc(x.name)}</b><br><span>${x.place}${x.done ? ' · <span style="color:#3b8f4a">✓ beaten</span>' : ''}</span></span>`, sel: x === next, go: x === next, on: () => { ctx.closeCard?.(); ctx.sfx?.play?.('right'); ctx.onPick?.(x.id); } }));
    choices.push({ label: next ? 'Not yet' : 'Back', on: () => ctx.closeCard?.() });
    const body = next ? `<p class="sub">Next is ${esc(next.name)}. Press ${ctx.aWord?.() || 'A'} to go.</p>` : `<p class="sub">You beat them all! Pick one to play again.</p>`;
    ctx.card?.(next ? 'The road sign' : 'You beat them all!', body, choices);
  }
  // the facts board: one kid sentence, no numbers; the real figures behind a silent 'For grown-ups'
  function openFacts() {
    const body = `<p class="sub">Every billionaire has a row on the Long Road. Go to the lookout to see them all.</p>`;
    ctx.card?.('The facts board', body, [{ label: 'For grown-ups', silent: true, on: () => { ctx.closeCard?.(); openGrownups(); } }, { label: 'Back', go: true, sel: true, on: () => ctx.closeCard?.() }]);
  }
  // ---- grown-ups only (a silent card): the real numbers ----
  const money = n => n >= 1e12 ? `$${+(n / 1e12).toFixed(1)} trillion` : n >= 1e9 ? `$${+(n / 1e9).toFixed(1)} billion` : `$${Math.round(n).toLocaleString()}`;
  const big = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)} million` : Math.round(n).toLocaleString();
  const bags = b => Math.round(b.net_worth_usd / bagUSD), years = b => b.net_worth_usd / (teacher?.usd || 72030);
  // openGrownups(): today's full table (money, bags, teacher-years), each row's length against Trump's, the jar's tax facts and the
  // market's facts, and the sources page. ctx.card(..., { silent: true }): never narrated
  function openGrownups() {
    const td = 'padding:5px 7px;border-bottom:1px solid #e2d4b2;text-align:right;white-space:nowrap', th = td + ';text-align:left;font-weight:700', tw = td.replace('white-space:nowrap', 'white-space:normal'), tUSD = teacher?.usd || 72030;
    const trump = bosses.find(b => b.id === 'trump') || [...bosses].sort((a, b) => a.net_worth_usd - b.net_worth_usd)[0], tBags = trump ? Math.max(1, bags(trump)) : 0;
    const rowsVs = b => { if (!tBags) return ''; if (b === trump) return 'the first row'; const r = bags(b) / tBags; return `about ${r >= 10 ? Number(r.toPrecision(2)).toLocaleString() : +r.toFixed(1)} ${trump.name.split(' ').pop()} rows`; };
    const rows = bosses.map(b => `<tr><td style="${th}">${esc(shownName(b))}</td><td style="${td}">${b.net_worth_label || money(b.net_worth_usd)}${b.net_worth_as_of ? `<br><small class="foot">as of ${b.net_worth_as_of}</small>` : ''}</td><td style="${td}">${bags(b).toLocaleString()} bags</td><td style="${td}">${big(years(b))} years</td><td style="${tw}">${rowsVs(b)}</td></tr>`).join('');
    const ord = [teacher, family].filter(Boolean).map(o => `<tr><td style="${th}">${o.name}</td><td style="${td}">${money(o.usd)} a year</td><td style="${td}">too small to see</td><td style="${td}">${o === teacher ? '1 year' : `about ${(o.usd / tUSD).toFixed(1)} years`}</td><td style="${td}"></td></tr>`).join('');
    const tx = data.taxes || {}, taxes = (tx.items || []).map(x => `<li><b>${esc(x.who)}</b> ${esc(x.line)}</li>`).join(''), mk = (data.market?.items || []).filter(i => i && i.line).map(i => `<li>${esc(i.line)}</li>`).join('');
    const ul = '<ul style="margin:6px 0 0 18px;padding:0;font-size:16px;line-height:1.45">';
    const body = `<p class="sub">Money, money bags (one bag = ${money(bagUSD)}), years of a teacher's pay, and how long each row on the Long Road is next to ${trump ? esc(trump.name) : 'the first'}'s.</p>
      <table style="width:100%;border-collapse:collapse;font-size:15px;margin-top:8px"><tr><th style="${th}"></th><th style="${td}">Money</th><th style="${td}">Bags</th><th style="${td}">Teacher years</th><th style="${td}">Row length</th></tr>${rows}${ord}</table>
      ${taxes ? `<p class="sub" style="margin-top:12px">The jar (taxes):</p>${ul}${taxes}</ul>` : ''}
      ${mk ? `<p class="sub" style="margin-top:12px">The market:</p>${ul}${mk}</ul>` : ''}
      <p class="foot">Every number has a source: <a href="sources.html" target="_blank" rel="noopener">where the facts came from</a>.</p>`;
    ctx.card?.('For grown-ups', body, [{ label: 'Back', go: true, sel: true, on: () => ctx.closeCard?.() }], { silent: true });
  }
  // ---- end of grown-ups only ----
  // the jar: kid words only (empty / filling up / full, no counts), the tax facts in a grown-ups block
  function openJar() {
    const tx = data.taxes || {}; const n = shown >= 0 ? shown : beatenCount();
    const rows = (tx.items || []).map(x => `<li><b>${esc(x.who)}</b> ${esc(x.line)}</li>`).join('');
    const trick = String(tx.trick_text || 'The billionaires did tricks so they put in almost nothing.').replace(/\s*This part is true:?\s*$/i, '');
    const body = `<p class="sub">${esc(tx.kid_text || 'Everybody puts a little in the jar. The jar pays for the school, the road and the fountain. That is what taxes are.')}</p>
      <p>${n === 0 ? 'The jar is empty.' : n < BOSS_N ? 'The jar is filling up.' : 'The jar is full.'} ${esc(trick)}</p>
      ${grownups(`<p>This part is true:</p><ul style="margin:6px 0 0 18px;padding:0;font-size:16px;line-height:1.45">${rows}</ul>${tx.ordinary_line ? `<p>${esc(tx.ordinary_line)}</p>` : ''}<p class="foot">Every number has a source: <a href="sources.html#taxes" target="_blank" rel="noopener">where the facts came from</a>.</p>`)}`;
    ctx.card?.('The jar', body, [{ label: 'Watch what happened', on: () => { ctx.closeCard?.(); ctx.onPrologue?.(); } }, { label: 'Back to the square', go: true, sel: true, on: () => ctx.closeCard?.() }]);
  }
  // the market board: the 10-coins sentence, 'This part is true.', and the real item behind the grown-ups block
  function openMarket() {
    const items = (data.market?.items || []).filter(i => i && i.line), nm = items.find(i => i.id === 'new_money');
    const real = (nm ? [nm, ...items.filter(i => i !== nm)] : items).map(i => `<li>${esc(i.line)}</li>`).join('');
    const body = `<p class="sub">When the market grew, out of every 10 new coins, 7 went to the richest gerbils and 3 went to everybody else.</p>
      <p>This part is true.</p>
      ${grownups(`${real ? `<ul style="margin:6px 0 0 18px;padding:0;font-size:16px;line-height:1.45">${real}</ul>` : ''}<p class="foot">Every number has a source: <a href="sources.html#market" target="_blank" rel="noopener">where the facts came from</a>.</p>`)}`;
    ctx.card?.('New coins', body, [{ label: 'Back to the square', go: true, sel: true, on: () => ctx.closeCard?.() }]);
  }
  // the lookout: main frames every Long Road row from the hill (ctx.look(true, 'lookout')); a toast when the game has no Look
  function lookout() { if (ctx.look) { ctx.look(true, 'lookout'); return; } ctx.toast?.('Gerbil Valley, all of it.', { sub: 'The road goes up to the billionaires. Gerbil Street is right below.' }); }
  function ringBell() { if (!bellHung) { ctx.toast?.('The bell is gone.', { sub: 'Fill the jar and it comes home.' }); return; } bellT = 0; ctx.sfx?.play?.('built'); const n = city.progress; ctx.toast?.('Ding dong!', { sub: n >= 15 ? 'Every gerbil on Gerbil Street is home.' : n ? 'More homes are coming back to Gerbil Street.' : 'Fill the jar and the homes come back.' }); ctx.spawnBurst?.(scene, _w.set(TOWER.x, 6.2, TOWER.z), 0xf6cc4e, 20); }   // (integrate, C7) the toast has no count: it ran past ten

  // ---------- the homecoming (5-8 s): after a boss, the camera looks up Gerbil Street while the new homes rise one at a time
  // and his freed friends walk to their doors; then it turns to the jar, which fills, and the bell rings. Main drives it:
  // hub.sync(state.homeN), hub.startHomecoming({ from, to, onDone }), the camera from hub.homecomingCamera() each frame.
  const HC = { pop0: .9, popGap: .55, line: 1.1, folk0: .7, jar: 4.6, turn: .9, jarFill: 1.3, end: 7.6 };
  const HC_STREET = { pos: new THREE.Vector3(0, 6, 3), look: new THREE.Vector3(0, 0, 18) }, HC_JAR = { pos: new THREE.Vector3(1.2, 2.6, -1.2), look: new THREE.Vector3(0, .95, -5.3) };
  const _hp = new THREE.Vector3(), _hl = new THREE.Vector3();
  function startHomecoming({ from = startCount(), to = beatenCount(), onDone } = {}) {
    if (!built || home) return false; from = clamp(Math.round(from) || 0, 0, BOSS_N); to = clamp(Math.round(to) || 0, 0, BOSS_N); if (to <= from) return false;
    sync(from); const h0 = housesFor(from), h1 = housesFor(to);
    home = { t: 0, from, to, onDone, h0, h: h0, h1, said: false, rung: false, light: null, lit: 0, wall: performance.now() };
    spawnHomeFolk(h0, h1); current = null; if (marker) marker.visible = false; return true;
  }
  // the boss just beaten: main's ctx.lastBoss(), else the newest state.beaten[id].at, else the last beaten one along the road
  function homeBoss() {
    const ids = STOPS.filter(sp => state.beaten?.[sp.id]).map(sp => sp.id); if (!ids.length) return null; const named = ctx.lastBoss?.(); if (named && ids.includes(named)) return named;
    let best = ids[ids.length - 1], bt = 0; for (const id of ids) { const at = +state.beaten[id]?.at || 0; if (at > bt) { bt = at; best = id; } } return best;
  }
  // his freed friends (state.friends[id], names) walk up the street to the new homes' doors
  function spawnHomeFolk(h0, h1) {
    const names = (state.friends?.[homeBoss()] || []).slice(0, 6), lots = city.lots || [], nNew = Math.max(1, h1 - h0);
    names.forEach((nm, k) => { const l = lots[h0 + (k % nNew)]; if (!l) return; const sx = STREET.x, sz = STREET.z, side = k >= nNew ? .55 : 0;
      const g = ctx.gerbilFrom({ color: FOLK_COATS[[2, 4, 0, 1, 6, 5][k % 6]], scale: 1.0 }); g.visible = false; g.name = `friend ${nm}`;
      const wp = [[sx + l.spine.x, sz + l.spine.z - 3], [sx + l.spine.x, sz + l.spine.z], [sx + l.street.x, sz + l.street.z], [sx + l.door.x + side, sz + l.door.z]];
      g.position.set(wp[0][0], 0, wp[0][1]); group.add(g); homeFolk.push({ g, wp, i: 1, delay: HC.folk0 + k * .35, speed: 1.9, turned: false }); });
  }
  function stepHome(dt, now) {
    const H = home; H.t += dt; H.wall = performance.now();
    if (H.h < H.h1 && H.t >= HC.pop0 + (H.h - H.h0) * HC.popGap) { H.h++; city.setProgress(H.h); camKey = ''; }   // one house at a time, with the pop
    if (!H.said && H.t >= HC.line) { H.said = true; ctx.toast?.(HOME_LINE, { ms: 3600 }); }
    for (const f of homeFolk) { if (H.t < f.delay) continue; f.g.visible = true; let sp = 0;
      if (f.i < f.wp.length) { const [tx, tz] = f.wp[f.i], dx = tx - f.g.position.x, dz = tz - f.g.position.z, d = Math.hypot(dx, dz), st = f.speed * dt;
        if (d <= st) { f.g.position.x = tx; f.g.position.z = tz; f.i++; } else { f.g.position.x += dx / d * st; f.g.position.z += dz / d * st; f.g.rotation.y = Math.atan2(dx, dz); sp = f.speed; } }
      else if (!f.turned) { f.turned = true; f.g.rotation.y += Math.PI; }   // home: on the doorstep, looking out at the street
      animateGerbil(f.g, { speed: sp * 2.2, airborne: false, now, dt }); }
    if (H.t >= HC.jar) { const u = clamp((H.t - HC.jar - HC.turn) / HC.jarFill, 0, 1), e = u * u * (3 - 2 * u); jar?.userData.setFill((H.from + (H.to - H.from) * e) / BOSS_N); }
    // the jar is full: the shared things the new total lights come back one at a time (the bell rings as it comes back; already
    // hung, it rings anyway, as before)
    const T0 = HC.jar + HC.turn + HC.jarFill;
    if (!H.rung && H.t >= T0) { H.rung = true; H.light = SHARED_KINDS.slice(litFor(H.from), litFor(H.to)); ctx.spawnBurst?.(scene, _w.set(JAR_POS.x, 1.6, JAR_POS.z), 0xf6cc4e, 24);
      if (!H.light.includes('bell') && bellHung) { bellT = 0; ctx.sfx?.play?.('built'); } else if (!H.light.length) ctx.sfx?.play?.('built'); }
    if (H.light?.length && H.t >= T0 + H.lit * .35) { setShared(H.light.shift(), true); H.lit++; }
    if (H.t >= HC.end) endHome(true);
  }
  // the end (or a skip, or an abort): the town shows `to` at once, the friends step out (the street's own townsfolk live there now)
  function endHome(callDone) {
    const H = home; if (!H) return; home = null;
    for (const f of homeFolk) { group.remove(f.g); f.g.traverse(o => { if (o.isMesh) o.material?.dispose?.(); }); } homeFolk.length = 0;
    if (built) sync(H.to); if (callDone) H.onDone?.();
  }
  function skipHomecoming() { if (home) endHome(true); }
  // { pos, look } while the homecoming runs, else null. If main stops calling update() in its homecoming mode, the beat keeps going on the wall clock.
  // { paused: true } (main's Start menu is open): the beat holds still, its wall clock frozen so it does not jump on resume.
  function homecomingCamera({ paused = false } = {}) {
    if (!home) return null; const nowW = performance.now();
    if (paused) home.wall = nowW;
    else if (nowW - lastUpd > 150) { const dt = Math.min(.1, (nowW - home.wall) / 1000); if (dt > 0) { stepHome(dt, nowW); city.update(dt, nowW); } if (!home) return null; }
    const u = clamp((home.t - HC.jar) / HC.turn, 0, 1), e = u * u * (3 - 2 * u);
    _hp.copy(HC_STREET.pos).lerp(HC_JAR.pos, e);
    // F: turn by yaw and pitch (the street is behind the jar: lerping the look point swung the view straight down through the ground)
    const ang = (p, l) => [Math.atan2(l.x - p.x, l.z - p.z), Math.atan2(l.y - p.y, Math.hypot(l.x - p.x, l.z - p.z))];
    const [ya, pa] = ang(HC_STREET.pos, HC_STREET.look), [yb, pb] = ang(HC_JAR.pos, HC_JAR.look); let dy = yb - ya; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const yaw = ya + dy * e, pit = pa + (pb - pa) * e, dl = HC_JAR.pos.distanceTo(HC_JAR.look);
    _hl.set(_hp.x + Math.sin(yaw) * Math.cos(pit) * dl, _hp.y + Math.sin(pit) * dl, _hp.z + Math.cos(yaw) * Math.cos(pit) * dl); return { pos: _hp, look: _hl };
  }

  // ---------- per frame ----------
  function update(dt, now = performance.now()) {
    if (!built) return; dt = Math.min(dt, .1); lastUpd = performance.now(); bumpCD -= dt;
    if (home) stepHome(dt, now);
    stepShared(dt);
    // the player stands on the hub's ground (the mound); the nearest interactable within reach is the prompt
    const pro = !!api.prologueActive;
    if (player.visible) { pushOut(player.position, PLAYER_R);   // the stalls, the fountain, the school, the jar, the board, the street's houses
      if (keepIn(player.position) && !pro && !home && bumpCD <= 0) { bumpCD = .9; ctx.sfx?.play?.('bonk', { volume: .15 }); } }   // the edge: a quiet bump, never a spoken line
    const px = player.position.x, pz = player.position.z, eh = ctx.env?.heightAt?.(px, pz);
    player.position.y = Math.max(footHeight(px, pz), Number.isFinite(eh) ? eh : -Infinity);   // the highest ground under her paws, so none sinks into the mound
    current = home ? null : nearestSpot(px, pz);
    // the road sign: walking in under the arch opens the picker once; backing off SIGN_REARM m re-arms it
    if (!pro && !home && player.visible) { if (signArmed && px >= SIGN_IN && Math.abs(pz) < 4) { signArmed = false; openSign(); } else if (!signArmed && px < SIGN_IN - SIGN_REARM) signArmed = true; }
    // the floating A over the spot in reach
    if (marker) { const show = !!current && !pro && !home && player.visible; marker.visible = show;
      if (show) { const w = String(ctx.aWord?.() || 'A'); if (w !== markerWord) { markerWord = w; const c = markerCanvas(w); marker.material.map?.dispose(); marker.material.map = srgb(c); marker.material.needsUpdate = true; marker.scale.set(.55 * c.width / 256, .55, 1); }
        const p = current.p; marker.position.set(p.x, heightAt(p.x, p.z) + (current.mh || 1.6) + Math.sin(now / 260) * .08, p.z); } }
    // the fountain's water shimmers; the bell swings
    if (water.length && water[0].visible) { water[0].position.y = .4 + Math.sin(now / 420) * .015; water[1].scale.setScalar(waterScale * (1 + Math.sin(now / 300) * .03)); }
    if (bellT >= 0) { bellT += dt; bell.rotation.z = Math.sin(bellT * 13) * .45 * Math.exp(-bellT * 1.6); if (bellT > 3) { bellT = -1; bell.rotation.z = 0; } }
    // the kid chases the ball and kicks it to the other spot
    // the hub kid and his ball step out while the prologue plays (it has its own crowd, and the billionaires cross his ball line)
    if (kid) { kid.visible = ball.visible = !pro; }
    if (market) { market.t += dt; placeCoins(market.t); }   // the ten coins pop out, roll uphill and down the street, rest, and go round again
    if (kid && ball && !pro) {
      ball.position.addScaledVector(ballV, dt); const sp = ballV.length(); if (sp > 0) { ballV.multiplyScalar(Math.max(0, 1 - dt * 1.4)); ball.rotation.x += sp * dt / .14; if (sp < .15) ballV.set(0, 0, 0); }
      const dx = ball.position.x - kid.position.x, dz = ball.position.z - kid.position.z, d = Math.hypot(dx, dz); let run = 0;
      if (kidWait > 0) kidWait -= dt;
      else if (d > .42) { run = 2.4; kid.position.x += dx / d * run * dt; kid.position.z += dz / d * run * dt; kid.rotation.y = Math.atan2(dx, dz); }
      else if (sp < .2) { kidTarget = 1 - kidTarget; const t = KID_SPOTS[kidTarget]; _v.set(t.x - ball.position.x, 0, t.z - ball.position.z); const L = _v.length(); _v.multiplyScalar(1 / L); ballV.copy(_v).multiplyScalar(Math.min(6, L * 1.9)); ballV.x += Math.sin(now / 700) * .3; kidWait = .35; kid.rotation.y = Math.atan2(_v.x, _v.z); ctx.sfx?.play?.('step'); }
      pushOut(kid.position, .2); animateGerbil(kid, { speed: run, airborne: false, now, dt });
    }
    // the shopkeepers breathe and hop now and then
    for (let i = 0; i < keepers.length; i++) { const g = keepers[i]; g.userData.hop -= dt; let air = false; if (g.userData.hop <= 0) { g.userData.hop = 2.5 + ((now / 97 + i * 31) % 3); g.userData.air = .3; } if (g.userData.air > 0) { g.userData.air -= dt; const u = 1 - clamp(g.userData.air / .3, 0, 1); g.position.y = Math.sin(u * Math.PI) * .12; air = g.userData.air > .04; } else g.position.y = 0; animateGerbil(g, { speed: 0, airborne: air, now, dt }); }
    city.update(dt, now);
  }
  function nearestSpot(px, pz) { let best = null, bd = 1e9; for (let i = 0; i < spots.length; i++) { const s = spots[i]; const dx = px - s.p.x, dz = pz - s.p.z; const d2 = dx * dx + dz * dz; if (d2 < s.r * s.r && d2 < bd) { bd = d2; best = s; } } return best; }
  function act() { if (!current) return false; current.act(); return true; }

  function dispose() {
    if (!built) return; built = false; scene.remove(group);
    for (const g of [kid, ...keepers]) if (g) g.traverse(o => { if (o.isMesh) o.material?.dispose?.(); });
    for (const d of disposables) { if (d.isTexture) d.dispose(); else if (d.isMaterial) { d.map?.dispose?.(); d.dispose(); } else d.dispose?.(); } disposables.length = 0;
    for (const m of arrowMats) m.map?.dispose(); arrowMats = []; for (const m of new Set([STD, PAINT, GOLD, GLOW, COBBLE, INK].filter(Boolean))) m.dispose(); cobble?.dispose(); cobble = null;
    if (PAPER) group.traverse(o => { if (o.isMesh && o.geometry && !disposables.includes(o.geometry)) o.geometry.dispose(); });   // the paper stalls' sprites and the trees came in whole
    market = null; colliders.length = 0; if (home) endHome(false); marker?.material.map?.dispose(); marker = null;
    jar?.userData.dispose?.(); group.clear(); spots.length = 0; keepers = []; water = []; halos = []; kid = ball = bell = jar = null; schoolGlass = schoolGlow = bulbMat = null; current = null; shown = -1; arrowsKey = ''; staticBoxes = []; camBoxes = []; camKey = '';
  }

  const api = { build, enter, update, act, dispose, sync, startHomecoming, homecomingCamera, skipHomecoming, group, heightAt, pushOut, keepIn, beatenCount, prologueActive: false, signX: SIGN_X, box: { ...BOX },
    sharedKinds: SHARED_KINDS, setShared, sharedOn, sharedPos, setFountain, hillTop: HILL_TOP.clone(), cameraBoxes, openGrownups, openFacts, openJar, openMarket, openSign,
    bell: () => bell, jar: () => jar, market: () => market, get prompt() { return current ? current.label() : null; }, get current() { return current; }, spots,
    // the spot in reach: { label, say, p } (label starts 'act:' only where A does something now), or null
    get promptSpot() { if (!current) return null; current.ps.label = current.label(); return current.ps; },
    get homecomingActive() { return !!home; }, get shown() { return shown; } };
  return api;
}
