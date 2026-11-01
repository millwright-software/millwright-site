// art/paper-props.js — the paper look for the game's props (docs/ART-DIRECTION.md, direction C, phase 2).
//
// props.js re-exports the public half of this module (the C1 contract) and calls the paper* makers from its own factories
// when artMode() is 'paper'; parts.js and trail.js call it directly. Nothing here imports props.js or parts.js.
//
// The pipeline: an SVG in web/art/sprites/ → hex recolour → rasterised once at 1x (512 px drawing size) → edge colour bled
// into the transparent pixels (mipmaps never grow dark fringes) → one DataTexture per sprite name, recolour key and variant,
// shared by every instance. Text (signs, the jar's label) is composited onto a copy of the raster at load, in Fredoka.
// Materials are made at once and filled in when their raster arrives, so every maker here is synchronous; preloadArt() makes
// the rasters arrive before the world is built. A raster that fails to load leaves its material hidden and the old factory
// in charge (props.js asks ready(name) before taking the paper path).
//
// A billboard is root (position, blob shadow) → pivot (turned by updateArt to face the camera's yaw, in world space, whatever
// its parents' rotation) → card group (leans back by a share of the camera pitch; scale.x flips facing) → layer meshes. Card
// normals point straight up, so Lambert lights a sprite like the ground under it. Edges are alpha-to-coverage, alphaTest .5:
// crisp, depth-written, no sorting. root.userData.sprite = { card, pivot, lean, facing, w, h, squashX, spin } (as sprites.js).
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { setRenderer, SPRITE_DIR, FONT, fitText } from './sprites.js';

// ---------- the palette (ART-DIRECTION.md rule 1) ----------
export const PAL = { ink: 0x3b2516, cream: 0xfbf0d4, red: 0xd7262c, yellow: 0xf2c230, blue: 0x3a7bd5, grass: 0x8cc067, sand: 0xe9d09c, stone: 0xb9b2a6, wood: 0xa8743f };
const css = n => '#' + n.toString(16).padStart(6, '0');
export const PAL_CSS = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, css(v)]));

// ---------- the mode ----------
let mode = 'old';
export function setArtMode(m) { mode = m === 'paper' ? 'paper' : 'old'; return mode; }
export function artMode() { return mode; }

// ---------- toon and ink ----------
let grad = null;
function toonGradient() {
  if (grad) return grad; const c = document.createElement('canvas'); c.width = 3; c.height = 1; const g = c.getContext('2d');
  ['#8c8c96', '#d2d2d6', '#ffffff'].forEach((col, i) => { g.fillStyle = col; g.fillRect(i, 0, 1, 1); });
  grad = new THREE.CanvasTexture(c); grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.generateMipmaps = false; return grad;
}
export function toonMat(color = 0xffffff, opts = {}) { return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...opts }); }

// Inverted hull: a copy of the mesh pushed out along smoothed normals (baked into the geometry, so hub.js's Baker can merge
// it like any other mesh), drawn back faces only in ink. One hull geometry per source geometry and width.
let inkMaterial = null;
const inkMat = () => inkMaterial || (inkMaterial = new THREE.MeshBasicMaterial({ color: PAL.ink, side: THREE.BackSide }));
const hulls = new WeakMap();
function hullGeometry(src, width) {
  let per = hulls.get(src); if (!per) { per = new Map(); hulls.set(src, per); } if (per.has(width)) return per.get(width);
  let out = null;
  if (src.attributes.position) {
    if (!src.boundingBox) src.computeBoundingBox(); const s = src.boundingBox.getSize(_v1);
    if (Math.min(s.x, s.y, s.z) > 1e-3) {   // flat things (planes, decals, cards) get no hull
      let g = new THREE.BufferGeometry(); g.setAttribute('position', src.attributes.position.clone()); if (src.index) g.setIndex(src.index.clone());
      g = mergeVertices(g, 1e-3); g.computeVertexNormals(); const p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * width, p.getY(i) + n.getY(i) * width, p.getZ(i) + n.getZ(i) * width);
      g.computeBoundingSphere(); out = g;
    }
  }
  per.set(width, out); return out;
}
const noRay = () => {};
export function addInk(obj, { width = .035 } = {}) {
  const list = [];
  obj.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.userData.ink || o.userData.noInk || o.userData.spriteLayer) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material]; if (mats.some(m => m && (m.transparent || m.alphaTest > 0))) return;
    if (o.children.some(c => c.userData.ink)) return; list.push(o);
  });
  for (const m of list) { const g = hullGeometry(m.geometry, width); if (!g) continue; const h = new THREE.Mesh(g, inkMat()); h.userData.ink = true; h.castShadow = h.receiveShadow = false; h.raycast = noRay; m.add(h); }
  return obj;
}

// ---------- rasters ----------
// name → { aspect (w/h of the viewBox), anchor (ground line up from the bottom, share of the height) }
const SPRITES = {
  moneybag: { aspect: 1, anchor: 16 / 512 }, coin: { aspect: 1, anchor: 12 / 256 }, legobox: { aspect: 1, anchor: 20 / 512 },
  jar: { aspect: .8, anchor: 20 / 640 }, 'jar-back': { aspect: .8, anchor: 20 / 640 }, 'jar-front': { aspect: .8, anchor: 20 / 640 },
  tree: { aspect: .8, anchor: 16 / 640 }, bush: { aspect: 4 / 3, anchor: 8 / 192 }, board: { aspect: 768 / 224, anchor: 0 }, arrow: { aspect: 1, anchor: 0 },
  car: { aspect: 1.6, anchor: 16 / 320 }, gerbil: { aspect: 1, anchor: 16 / 512 }, billionaire: { aspect: 512 / 768, anchor: 16 / 768 }, splash: { aspect: 1, anchor: 0 }, cloud: { aspect: 2, anchor: 0 },
  school: { aspect: 1, anchor: 16 / 512 }, lamp: { aspect: .5, anchor: 16 / 512 }, fountain: { aspect: 1, anchor: 16 / 512 }, road: { aspect: 1, anchor: 16 / 512 }, bell: { aspect: 1, anchor: 16 / 512 },
};
const PRELOAD = ['moneybag', 'coin', 'legobox', 'jar-back', 'jar-front', 'tree', 'bush', 'board', 'arrow', 'car', 'school', 'lamp', 'fountain', 'road', 'bell'];
const SHARED = ['school', 'lamp', 'fountain', 'road', 'bell'];
const info = name => SPRITES[name] || { aspect: 1, anchor: 0 };

let aniso = 8, theRenderer = null;
const rasters = new Map(), pending = new Map(), failed = new Set();
const rkey = (name, recolor) => recolor ? name + '|' + JSON.stringify(recolor) : name;
export function ready(name, recolor = null) { return rasters.has(rkey(name, recolor)); }

function loadRaster(name, recolor = null, scale = 1) {
  const k = rkey(name, recolor); if (pending.has(k)) return pending.get(k);
  const p = (async () => {
    const res = await fetch(SPRITE_DIR + name + '.svg'); if (!res.ok) throw new Error(`${name}.svg: ${res.status}`);
    let svg = await res.text(); if (recolor) for (const [a, b] of Object.entries(recolor)) svg = svg.split(a).join(b);
    const vb = svg.match(/viewBox="([^"]+)"/)[1].trim().split(/[\s,]+/).map(Number);
    const w = Math.round(vb[2] * scale), h = Math.round(vb[3] * scale);
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode();
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, w, h);
    const data = g.getImageData(0, 0, w, h).data; bleed(data, w, h, 8);
    const r = { name, w, h, data, aspect: w / h, anchor: info(name).anchor }; rasters.set(k, r); fill(k); return r;
  })();
  p.catch(e => { failed.add(k); console.warn('[art] sprite missing; the old prop stays', name, e?.message || e); });
  pending.set(k, p); return p;
}

// Copy colour outward into fully transparent pixels (alpha stays 0), one ring per pass, touching only the frontier.
function bleed(d, w, h, passes) {
  const n = w * h, filled = new Uint8Array(n), mark = new Uint8Array(n); for (let i = 0; i < n; i++) filled[i] = d[i * 4 + 3] > 0 ? 1 : 0;
  const near = i => { const x = i % w; return (x > 0 && filled[i - 1]) || (x < w - 1 && filled[i + 1]) || (i >= w && filled[i - w]) || (i < n - w && filled[i + w]); };
  let front = []; for (let i = 0; i < n; i++) if (!filled[i] && near(i)) { front.push(i); mark[i] = 1; }
  for (let p = 0; p < passes && front.length; p++) {
    const col = new Float32Array(front.length * 3);
    for (let k = 0; k < front.length; k++) {
      const i = front[k], x = i % w; let r = 0, g = 0, b = 0, c = 0;
      const take = j => { r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; c++; };
      if (x > 0 && filled[i - 1]) take(i - 1); if (x < w - 1 && filled[i + 1]) take(i + 1); if (i >= w && filled[i - w]) take(i - w); if (i < n - w && filled[i + w]) take(i + w);
      if (c) { col[k * 3] = r / c; col[k * 3 + 1] = g / c; col[k * 3 + 2] = b / c; }
    }
    const next = [];
    for (let k = 0; k < front.length; k++) { const i = front[k]; d[i * 4] = col[k * 3]; d[i * 4 + 1] = col[k * 3 + 1]; d[i * 4 + 2] = col[k * 3 + 2]; filled[i] = 1; }
    for (let k = 0; k < front.length; k++) { const i = front[k], x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < n && !filled[j] && !mark[j]) { mark[j] = 1; next.push(j); } }
    front = next;
  }
}

// canvas-order RGBA → a DataTexture (rows flipped: canvas row 0 is the top, UV v=0 the bottom)
function dataTexture(w, h, src, { mips = true } = {}) {
  const out = new Uint8Array(w * h * 4), row = w * 4; for (let y = 0; y < h; y++) out.set(src.subarray(y * row, (y + 1) * row), (h - 1 - y) * row);
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat); t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = mips; t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = aniso;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; t.userData.aspect = w / h; return t;
}

// the "off" look of a shared thing: every colour mapped onto a dark grey-blue ramp by its brightness (ink stays ink)
function offData(r) {
  const d = new Uint8ClampedArray(r.data), lo = [40, 46, 60], hi = [124, 136, 156];
  for (let i = 0; i < d.length; i += 4) { const l = (d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11) / 255, k = l * l; d[i] = lo[0] + (hi[0] - lo[0]) * k; d[i + 1] = lo[1] + (hi[1] - lo[1]) * k; d[i + 2] = lo[2] + (hi[2] - lo[2]) * k; }
  return d;
}

const textures = new Map();
function texture(name, recolor = null, variant = '') {
  const k = rkey(name, recolor), tk = k + '#' + variant; if (textures.has(tk)) return textures.get(tk);
  const r = rasters.get(k); if (!r) return null;
  const t = dataTexture(r.w, r.h, variant === 'off' ? offData(r) : r.data); t.userData.name = name; textures.set(tk, t); return t;
}

// Materials, one per (sprite, recolour, variant, kind), made at once and filled when the raster lands.
const mats = new Map(); const waiting = new Map();   // raster key → [fill callbacks]
function fill(k) { const list = waiting.get(k); if (!list) return; waiting.delete(k); for (const f of list) f(); }
function whenReady(name, recolor, fn) {
  const k = rkey(name, recolor); if (rasters.has(k)) { fn(); return; }
  if (!waiting.has(k)) waiting.set(k, []); waiting.get(k).push(fn); if (!pending.has(k)) loadRaster(name, recolor);
}
function spriteMat(name, { recolor = null, variant = '', unlit = false, glow = false, flat = false } = {}) {
  const key = [rkey(name, recolor), variant, unlit ? 'u' : '', glow ? 'g' : '', flat ? 'f' : ''].join('|'); if (mats.has(key)) return mats.get(key);
  const o = { alphaTest: .5, alphaToCoverage: true, side: THREE.DoubleSide };
  if (flat) Object.assign(o, { side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = unlit ? new THREE.MeshBasicMaterial(o) : new THREE.MeshLambertMaterial(o);
  m.visible = false;
  whenReady(name, recolor, () => { const t = texture(name, recolor, variant); m.map = t; if (glow) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = t; m.emissiveIntensity = .3; } m.visible = true; m.needsUpdate = true; });
  mats.set(key, m); return m;
}

// ---------- geometry ----------
const _v1 = new THREE.Vector3();
const geos = new Map();
// a card w × h with its ground line at y=0 (anchor = share of h below the line), facing +z, normals straight up
function cardGeo(w, h, anchor = 0) {
  const k = `${w.toFixed(4)}|${h.toFixed(4)}|${anchor.toFixed(4)}`; if (geos.has(k)) return geos.get(k);
  const g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2 - anchor * h, 0); const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  g.userData.shared = true; geos.set(k, g); return g;   // (verify) shared: callers must not dispose it (prologue disposeOwnGeo skips it)
}
function flatGeo(size) {
  const k = 'flat|' + size; if (geos.has(k)) return geos.get(k);
  const g = new THREE.PlaneGeometry(size, size); g.rotateX(-Math.PI / 2); g.userData.shared = true; geos.set(k, g); return g;   // image right = +x, image top = -z
}

// ---------- blob shadows ----------
let blobMat = null;
function blob(w, d) {
  if (!blobMat) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(30,24,40,.5)'); gr.addColorStop(.55, 'rgba(30,24,40,.28)'); gr.addColorStop(1, 'rgba(30,24,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }
  const m = new THREE.Mesh(flatGeo(1), blobMat); m.scale.set(w, 1, d); m.position.y = .015; m.renderOrder = 1; m.raycast = noRay; m.userData.noInk = true;
  Object.defineProperty(m, 'castShadow', { get: () => false, set: () => {} });   // a soft disc never casts, whoever traverses
  return m;
}

// ---------- billboards ----------
const live = [];   // WeakRefs to billboard roots; updateArt prunes the collected ones
function spriteRoot({ w, h, lean = .5, blobW = .7, blobDepth = .35 }) {
  const root = new THREE.Group(), pivot = new THREE.Group(), card = new THREE.Group(); pivot.add(card); root.add(pivot);
  if (blobW) { const b = blob(w * blobW, w * blobW * blobDepth * 1.4); root.add(b); root.userData.blob = b; }
  root.userData.sprite = { card, pivot, lean, facing: 1, w, h, squashX: 1, spin: false, phase: 0 };
  live.push(new WeakRef(root)); return root;
}
function layer(root, geo, mat, { z = 0, cast = false, unlit = false } = {}) {
  const m = new THREE.Mesh(geo, mat); m.position.z = z; m.castShadow = cast; m.receiveShadow = !cast && !unlit; m.userData.spriteLayer = true;
  root.userData.sprite.card.add(m); return m;
}

// A billboard of one sprite. height in metres; anchor overrides the sprite's own ground line; recolor = { '#hex': '#hex' }
// as written in the SVG (it gets its own texture, shared by every sprite with the same recolour); cast = a real shadow.
export function spriteGroup(name, { height = 1, anchor, recolor = null, cast = false, lean = .5, blob: blobW = .7, unlit = false } = {}) {
  const I = info(name), w = height * I.aspect, a = anchor ?? I.anchor;
  const root = spriteRoot({ w, h: height, lean, blobW });
  const mesh = layer(root, cardGeo(w, height, a), spriteMat(name, { recolor, unlit }), { cast, unlit });
  if (!SPRITES[name]) whenReady(name, recolor, () => { const r = rasters.get(rkey(name, recolor)); if (!r) return; const w2 = height * r.aspect; mesh.geometry = cardGeo(w2, height, anchor ?? 0); root.userData.sprite.w = w2; });   // a drawing this file doesn't know: fit its shape when it lands
  root.userData.spriteName = name; root.userData.card = mesh; return root;
}

// {geometry, material} for an InstancedMesh: feet at y=0, the card faces -x (cross: plus a second card facing +z).
const cardSets = new Map();
export function spriteCard(name, { height = 1, cross = false } = {}) {
  const k = `${name}|${height}|${cross ? 1 : 0}`; if (cardSets.has(k)) return cardSets.get(k);
  const I = info(name), w = height * I.aspect;
  const a = cardGeo(w, height, I.anchor).clone(); a.rotateY(-Math.PI / 2);
  let geometry = a; if (cross) { const b = cardGeo(w, height, I.anchor).clone(); geometry = mergeGeometries([a, b]); a.dispose(); b.dispose(); }
  const n = geometry.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  const set = { geometry, material: spriteMat(name) }; cardSets.set(k, set); return set;
}
export function spriteInstanced(name, count, { height = 1, cross = false } = {}) {
  const { geometry, material } = spriteCard(name, { height, cross });
  const m = new THREE.InstancedMesh(geometry, material, Math.max(1, count | 0)); m.receiveShadow = true; m.userData.spriteName = name; return m;
}

// ---------- per frame ----------
const _fwd = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _qYaw = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _pos = new THREE.Vector3(), _scl = new THREE.Vector3();
function attached(o) { while (o.parent) o = o.parent; return o.isScene === true; }
export function updateArt(camera) {
  if (!camera) return;
  camera.getWorldDirection(_fwd); const yaw = Math.atan2(-_fwd.x, -_fwd.z), pitch = Math.asin(Math.max(-1, Math.min(1, -_fwd.y)));
  _qYaw.setFromAxisAngle(_up, yaw); const t = performance.now() / 1000;
  let j = 0;
  for (let i = 0; i < live.length; i++) {
    const ref = live[i], r = ref.deref(); if (!r) continue; live[j++] = ref;
    const s = r.userData.sprite; if (!s || !r.parent || !attached(r)) continue;
    r.parent.matrixWorld.decompose(_pos, _qp, _scl); _qp.multiply(r.quaternion).invert(); s.pivot.quaternion.multiplyQuaternions(_qp, _qYaw);
    s.card.rotation.x = -pitch * s.lean;
    if (s.spin) s.squashX = Math.max(.12, Math.abs(Math.cos(t * 2.6 + s.phase)));
    s.card.scale.x = s.facing * (s.squashX || 1);
  }
  live.length = j;
}

// ---------- preload ----------
export async function preloadArt(renderer) {
  try { if (renderer) { theRenderer = renderer; setRenderer(renderer); aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy()); } } catch (e) { /* keep 8 */ }
  try { await Promise.race([document.fonts.load(`700 40px ${FONT}`), new Promise(r => setTimeout(r, 1500))]); } catch (e) { /* the fallback font */ }
  const res = await Promise.allSettled(PRELOAD.map(n => loadRaster(n)));
  const ok = PRELOAD.filter((n, i) => res[i].status === 'fulfilled');
  try {
    for (const n of ok) { const t = texture(n); if (SHARED.includes(n)) texture(n, null, 'off'); if (theRenderer?.initTexture && t) theRenderer.initTexture(t); }
    coinsTexture();
  } catch (e) { console.warn('[art] warm-up', e); }
  return { ok, failed: PRELOAD.filter(n => !ok.includes(n)) };
}

// ---------- text onto a raster (signs, the jar's label) ----------
// draw(g, w, h) writes on a transparent canvas the size of the raster; the result is composited over the raster's pixels
function textTexture(r, draw) {
  const c = document.createElement('canvas'); c.width = r.w; c.height = r.h; const g = c.getContext('2d', { willReadFrequently: true }); draw(g, r.w, r.h);
  const t = g.getImageData(0, 0, r.w, r.h).data, d = new Uint8ClampedArray(r.data);
  for (let i = 0; i < d.length; i += 4) { const a = t[i + 3]; if (!a) continue; const k = a / 255, ik = 1 - k; d[i] = t[i] * k + d[i] * ik; d[i + 1] = t[i + 1] * k + d[i + 1] * ik; d[i + 2] = t[i + 2] * k + d[i + 2] * ik; d[i + 3] = Math.max(d[i + 3], a); }
  return dataTexture(r.w, r.h, d);
}
// the board's cream face is x 52-716, y 40-184 of 768 × 224; at most two short lines read at a glance
function boardTexture(lines) {
  const r = rasters.get('board'); if (!r) return null; const ls = (lines || []).map(String).filter(Boolean); const n = Math.max(1, ls.length);
  return textTexture(r, (g, w, h) => { const sx = w / 768, sy = h / 224, top = 46 * sy, inner = 132 * sy, lh = inner / n;
    ls.forEach((l, i) => fitText(g, l, w / 2, top + lh * (i + .5), 640 * sx, Math.min(lh * .84, 96 * sy), { color: PAL_CSS.ink, weight: i === 0 ? 700 : 600 })); });
}

// ---------- the new props ----------
export function makeCoin({ height = .32, spin = true } = {}) {
  const g = spriteGroup('coin', { height, lean: .2, blob: .6 }); const s = g.userData.sprite; s.spin = spin; s.phase = Math.random() * 6.28; return g;
}
export function makeTree(s = 1) { return spriteGroup('tree', { height: 3 * s, cast: true, lean: .25, blob: .45 }); }
export function makeBush(s = 1) { return spriteGroup('bush', { height: .75 * s, lean: .35, blob: .7 }); }
// a painted arrow lying on the ground, pointing +x, 1.5 m long
export function makeArrow({ size = 1.5 } = {}) {
  const g = new THREE.Group(); const m = new THREE.Mesh(flatGeo(size), spriteMat('arrow', { flat: true })); m.position.y = .03; m.receiveShadow = true; m.userData.spriteLayer = true; m.renderOrder = 2;
  g.add(m); g.userData.mesh = m; return g;
}
// trail.js: the same arrow as an InstancedMesh's parts (unlit, so instance colours read as painted); null until it loads
let trailParts = null;
export function arrowTrailParts() {
  if (!ready('arrow')) return null; if (trailParts) return trailParts;
  const material = new THREE.MeshBasicMaterial({ map: texture('arrow'), alphaTest: .5, alphaToCoverage: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  trailParts = { geometry: flatGeo(1.1), material, shared: true }; return trailParts;
}

// The jar: glass, then coins that rise with setFill(f), then the outline, shine, lid and label. The coins layer stores, in its
// alpha, the fill at which each pixel appears; the material's alphaTest = 1 - f shows exactly the coins below the line.
let coinsTex = null;
const JAR_INSIDE = 'M150 214 C 128 236 120 270 120 330 L 120 556 C 120 590 148 612 190 612 L 322 612 C 364 612 392 590 392 556 L 392 330 C 392 270 384 236 362 214 Z';
function coinsTexture() {
  if (coinsTex) return coinsTex; const w = 512, h = 640, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true });
  g.save(); g.clip(new Path2D(JAR_INSIDE)); g.fillStyle = '#e9a823'; g.fillRect(0, 0, w, h);
  g.lineWidth = 4; g.strokeStyle = PAL_CSS.ink; let row = 0;
  for (let y = 606; y > 200; y -= 22, row++) for (let x = 120 + (row % 2) * 30; x < 400; x += 60) { g.fillStyle = (row + x) % 3 ? '#f8cf45' : '#f2c230'; g.beginPath(); g.ellipse(x + Math.sin(row * 7 + x) * 6, y, 32, 11, 0, 0, 7); g.fill(); g.stroke(); }
  g.restore();
  const d = g.getImageData(0, 0, w, h).data; bleed(d, w, h, 6);
  const top = 214, bot = 612;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (!d[i + 3]) continue;
    const level = Math.max(0, Math.min(1, (bot - y) / (bot - top) + Math.sin(x * .045) * .018)); d[i + 3] = Math.max(1, Math.round((1 - level) * 254)); }
  coinsTex = dataTexture(w, h, d, { mips: false }); return coinsTex;
}
const labelTex = new Map();
function jarFrontTexture(label) {
  if (!label) return texture('jar-front'); if (labelTex.has(label)) return labelTex.get(label); const r = rasters.get('jar-front'); if (!r) return null;
  const t = textTexture(r, (g, w, h) => { const s = w / 512; fitText(g, label, 256 * s, 340 * s, 144 * s, 40 * s, { color: PAL_CSS.ink }); }); labelTex.set(label, t); return t;
}
export function makeJarSprite({ height = 1.45, label = 'THE JAR' } = {}) {
  const I = info('jar-back'), w = height * I.aspect, geo = cardGeo(w, height, I.anchor);
  const root = spriteRoot({ w, h: height, lean: .3, blobW: .55 });
  layer(root, geo, spriteMat('jar-back'));
  const coinsM = new THREE.MeshLambertMaterial({ map: coinsTexture(), alphaTest: .996, side: THREE.DoubleSide });
  const coins = layer(root, geo, coinsM, { z: .004 }); coins.visible = false;
  let frontM = null;
  const front = layer(root, geo, spriteMat('jar-front'), { z: .008 });
  whenReady('jar-front', null, () => { const t = jarFrontTexture(label); if (!t) return; frontM = new THREE.MeshLambertMaterial({ map: t, alphaTest: .5, alphaToCoverage: true, side: THREE.DoubleSide }); front.material = frontM; });
  let f = 0;
  root.userData.setFill = v => { f = Math.max(0, Math.min(1, +v || 0)); coins.visible = f > .002; coinsM.alphaTest = Math.max(.004, Math.min(.996, 1 - f)); };
  root.userData.fill = () => f;
  root.userData.coins = coins;
  root.userData.dispose = () => { root.parent?.remove(root); coinsM.dispose(); if (frontM) frontM.dispose(); };
  return root;
}

// The shared things the bags pay for. Off: dark grey-blue. Lit: the drawing's colours, a little self-glow and a halo.
const SHARED_H = { school: 1.6, lamp: 1.5, fountain: 1.3, road: 1.25, bell: 1.45 };
let haloMat = null;
function halo() {
  if (!haloMat) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 6, 64, 64, 63);
    gr.addColorStop(0, 'rgba(255,236,150,.7)'); gr.addColorStop(.4, 'rgba(255,222,120,.32)'); gr.addColorStop(1, 'rgba(255,214,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; haloMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  }
  const m = new THREE.Mesh(cardGeo(1, 1, 0), haloMat); m.userData.spriteLayer = true; m.raycast = noRay; m.renderOrder = 3; return m;
}
export function makeSharedThing(kind = 'school') {
  const k = kind === 'lamps' ? 'lamp' : (SHARED.includes(kind) ? kind : 'school'); const H = SHARED_H[k], I = info(k), w = H * I.aspect, geo = cardGeo(w, H, I.anchor);
  const root = spriteRoot({ w, h: H, lean: .35, blobW: k === 'lamp' ? 1.2 : .7 });
  const offM = spriteMat(k, { variant: 'off' }), onM = spriteMat(k, { glow: true });
  const mesh = layer(root, geo, offM);
  const hl = halo(); const hs = Math.max(w, H) * 1.15; hl.scale.set(hs, hs, 1); hl.position.set(0, H * .5 - hs * .5, -.03); hl.visible = false; root.userData.sprite.card.add(hl);
  root.userData.kind = k; root.userData.lit = false; root.userData.card = mesh; root.userData.halo = hl;
  root.userData.setLit = on => { on = !!on; root.userData.lit = on; mesh.material = on ? onM : offM; hl.visible = on; return root; };
  return root;
}

// ---------- made-up app icons (C9): never a real logo ----------
export const APP_ICONS = ['seed', 'paw', 'wheel', 'cloud', 'star'];
const ICON_TILE = { seed: PAL_CSS.yellow, paw: PAL_CSS.grass, wheel: PAL_CSS.red, cloud: PAL_CSS.blue, star: PAL_CSS.wood };
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
export function appIconCanvas(kind = 'seed', px = 256) {
  const k = APP_ICONS.includes(kind) ? kind : 'seed'; const c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d'); g.scale(px / 256, px / 256);
  const ink = PAL_CSS.ink, cream = PAL_CSS.cream; g.lineJoin = 'round'; g.lineCap = 'round';
  // the tile: palette colour, a light-to-dark wash from the upper left, ink outline
  rr(g, 10, 10, 236, 236, 54); const base = new THREE.Color(ICON_TILE[k]); const gr = g.createLinearGradient(10, 10, 246, 246);
  gr.addColorStop(0, '#' + base.clone().lerp(new THREE.Color(0xffffff), .22).getHexString()); gr.addColorStop(1, '#' + base.clone().multiplyScalar(.82).getHexString());
  g.fillStyle = gr; g.fill(); g.lineWidth = 9; g.strokeStyle = ink; g.stroke();
  g.lineWidth = 8;
  const inked = (path, fillStyle) => { g.fillStyle = fillStyle; g.fill(path); g.stroke(path); };
  if (k === 'seed') {   // a sunflower seed, striped
    g.save(); g.translate(128, 132); g.rotate(-.5);
    const p = new Path2D('M0 -84 C 48 -50 50 40 0 84 C -50 40 -48 -50 0 -84 Z'); inked(p, ink);
    g.strokeStyle = cream; g.lineWidth = 7; for (const x of [-20, 0, 20]) { g.beginPath(); g.moveTo(x * .7, -60 + Math.abs(x)); g.quadraticCurveTo(x * 1.25, 0, x * .7, 62 - Math.abs(x)); g.stroke(); }
    g.restore();
  } else if (k === 'paw') {   // a gerbil paw: one pad, four toes
    const pad = new Path2D(); pad.ellipse(128, 160, 50, 40, 0, 0, 7); inked(pad, cream);
    for (const [x, y, r] of [[70, 102, 20], [104, 70, 21], [152, 70, 21], [186, 102, 20]]) { const t = new Path2D(); t.arc(x, y, r, 0, 7); inked(t, cream); }
  } else if (k === 'wheel') {   // an exercise wheel on its stand
    g.beginPath(); g.moveTo(86, 214); g.lineTo(128, 120); g.lineTo(170, 214); g.lineWidth = 18; g.strokeStyle = ink; g.stroke(); g.lineWidth = 8; g.strokeStyle = cream; g.stroke();
    g.beginPath(); g.arc(128, 116, 74, 0, 7); g.lineWidth = 30; g.strokeStyle = ink; g.stroke(); g.lineWidth = 16; g.strokeStyle = cream; g.stroke();
    g.lineWidth = 7; g.strokeStyle = ink; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.beginPath(); g.moveTo(128, 116); g.lineTo(128 + Math.cos(a) * 62, 116 + Math.sin(a) * 62); g.stroke(); }
    const hub = new Path2D(); hub.arc(128, 116, 15, 0, 7); g.lineWidth = 7; inked(hub, PAL_CSS.yellow);
  } else if (k === 'cloud') {   // a puffy cloud (the ink pass first, wider)
    const p = new Path2D(); for (const [x, y, r] of [[92, 140, 38], [134, 112, 50], [178, 140, 36]]) { p.moveTo(x + r, y); p.arc(x, y, r, 0, 7); } p.moveTo(70, 150); p.rect(62, 136, 132, 42);
    g.lineWidth = 18; g.strokeStyle = ink; g.stroke(p); g.fillStyle = ink; g.fill(p); g.fillStyle = cream; g.fill(p);
    g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(118, 96, 18, 9, -.5, 0, 7); g.fill();
  } else {   // a five-point star
    const p = new Path2D(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 40 : 92; const x = 128 + Math.cos(a) * r, y = 134 + Math.sin(a) * r; i ? p.lineTo(x, y) : p.moveTo(x, y); } p.closePath();
    inked(p, PAL_CSS.yellow);
  }
  g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.ellipse(64, 50, 30, 13, -.6, 0, 7); g.fill();   // the highlight, upper left
  return c;
}

// ---------- paper versions of the old factories (props.js and parts.js call these in paper mode; null → the old path) ----------
export function paperBag(scale = 1) {
  if (!ready('moneybag')) return null; const g = spriteGroup('moneybag', { height: .6, lean: .35, blob: .75 }); g.scale.setScalar(scale); g.userData.paper = true; return g;
}
export function paperCrate(size = .5) {
  if (!ready('legobox')) return null; const g = spriteGroup('legobox', { height: size * 1.62, lean: .35, blob: .8 }); g.userData.paper = true; return g;
}
// A sign: a painted board that turns to the camera, on a toon post. setLines(lines) rewrites it.
export function paperSign(lines, { width = 1.6, postHeight = 1.7, post = true } = {}) {
  if (!ready('board')) return null;
  const g = new THREE.Group(), bh = width / info('board').aspect;
  const root = spriteRoot({ w: width, h: bh, lean: .3, blobW: 0 }); root.position.y = postHeight - bh; g.add(root);
  const mat = new THREE.MeshLambertMaterial({ alphaTest: .5, alphaToCoverage: true, side: THREE.DoubleSide });
  const board = layer(root, cardGeo(width, bh, 0), mat); board.userData.h = bh;
  const draw = ls => { const t = boardTexture(ls); if (!t) return; const old = mat.map; mat.map = t; mat.needsUpdate = true; if (old) old.dispose(); g.userData.lines = ls; };
  draw(lines);
  if (post) { const wood = toonMat(PAL.wood); const p = new THREE.Mesh(new THREE.CylinderGeometry(.045, .055, postHeight - bh * .4, 10), wood); p.position.set(0, (postHeight - bh * .4) / 2, -.06); p.castShadow = p.receiveShadow = true; g.add(p); addInk(p, { width: .02 }); }
  g.userData.setLines = draw; g.userData.board = board; g.userData.paper = true;
  g.userData.dispose = () => { mat.map?.dispose(); mat.dispose(); };
  return g;
}

// ---------- the stalls: toon body, ink, a painted facade, a striped awning (after paper-square.js's stall) ----------
const STALL_LOOK = {
  lego: { wall: ['#fbe9a6', '#f2d27a'], trim: PAL_CSS.red, door: '#8a5a30', roof: PAL.red, awning: [PAL_CSS.red, PAL_CSS.cream] },
  cars: { wall: ['#d6ecf6', '#b4d6e8'], trim: PAL_CSS.blue, door: '#6b4423', roof: PAL.blue, awning: [PAL_CSS.blue, PAL_CSS.cream] },
  house: { wall: ['#fbf0d4', '#efdcb4'], trim: '#4f9440', door: '#8a5a30', roof: 0x4f9440, awning: ['#4f9440', PAL_CSS.cream] },
};
const facades = new Map();
function canvasTex(c, rep = [1, 1]) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); t.anisotropy = aniso; return t; }
// front (door between two windows) or side (one window) of a wall W × H metres
function facadeTex(look, W, H, side) {
  const key = [look.wall.join(), look.trim, look.door, W, H, side ? 's' : 'f'].join('|'); if (facades.has(key)) return facades.get(key);
  const cw = 512, ch = Math.round(512 * H / W), c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d'); const ink = PAL_CSS.ink;
  const gr = g.createLinearGradient(0, 0, cw * .4, ch); gr.addColorStop(0, look.wall[0]); gr.addColorStop(1, look.wall[1]); g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
  g.fillStyle = 'rgba(59,37,22,.07)'; for (let y = 24; y < ch; y += 44) g.fillRect(0, y, cw, 3);
  g.lineJoin = 'round'; g.strokeStyle = ink;
  const winTop = ch * .3, winH = Math.min(120, ch * .36);
  const win = (x, ww) => { g.lineWidth = 7; g.fillStyle = look.trim; g.fillRect(x - 24, winTop, 22, winH); g.strokeRect(x - 24, winTop, 22, winH); g.fillRect(x + ww + 2, winTop, 22, winH); g.strokeRect(x + ww + 2, winTop, 22, winH);
    g.fillStyle = '#bfe6f7'; g.fillRect(x, winTop, ww, winH); g.strokeRect(x, winTop, ww, winH); g.beginPath(); g.moveTo(x + ww / 2, winTop); g.lineTo(x + ww / 2, winTop + winH); g.moveTo(x, winTop + winH / 2); g.lineTo(x + ww, winTop + winH / 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 8; g.beginPath(); g.moveTo(x + 14, winTop + winH * .4); g.lineTo(x + 32, winTop + 14); g.stroke(); g.strokeStyle = ink;
    g.fillStyle = '#b0543a'; g.lineWidth = 6; g.fillRect(x - 8, winTop + winH + 2, ww + 16, 24); g.strokeRect(x - 8, winTop + winH + 2, ww + 16, 24);
    for (let i = 0; i < 6; i++) { g.fillStyle = ['#f05a8a', PAL_CSS.yellow, '#ffffff'][i % 3]; g.beginPath(); g.arc(x + 6 + i * (ww / 5.4), winTop + winH - 4, 10, 0, 7); g.fill(); g.lineWidth = 3; g.stroke(); } };
  if (side) win(cw / 2 - 60, 120);
  else {
    const dTop = ch * .42; g.lineWidth = 8; g.fillStyle = look.door; g.beginPath(); g.moveTo(196, ch); g.lineTo(196, dTop + 60); g.arc(256, dTop + 60, 60, Math.PI, 0); g.lineTo(316, ch); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(59,37,22,.5)'; g.lineWidth = 5; for (const x of [236, 276]) { g.beginPath(); g.moveTo(x, dTop + 30); g.lineTo(x, ch); g.stroke(); }
    g.fillStyle = PAL_CSS.yellow; g.strokeStyle = ink; g.lineWidth = 4; g.beginPath(); g.arc(298, ch * .78, 9, 0, 7); g.fill(); g.stroke();
    win(50, 96); win(366, 96);
  }
  g.lineWidth = 10; g.strokeStyle = ink; g.strokeRect(5, 5, cw - 10, ch - 10);
  const t = canvasTex(c); facades.set(key, t); return t;
}
const awnings = new Map();
function awningTex(a, b) {
  const key = a + b; if (awnings.has(key)) return awnings.get(key); const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 32, 0, 32, 64); } g.fillStyle = PAL_CSS.ink; g.fillRect(0, 0, 256, 5); g.fillRect(0, 57, 256, 7);
  const t = canvasTex(c); awnings.set(key, t); return t;
}
// kind 'lego' | 'cars' | 'house'; d = { name, color, trim, wallH } as props.js's STALL merged with opts. Six parts, built in order
// (foundation, walls, roof, sign, flag, extras), all hidden until reveal(n), exactly like the old stall.
export function paperStall(kind, d, makeSignFn) {
  const look = STALL_LOOK[kind] || STALL_LOOK.lego; const g = new THREE.Group(); const parts = []; const W = 2.6, H = d.wallH || 1.8, F = .3;
  const roofCol = look.roof;
  const add = (parent, geo, mat, x = 0, y = 0, z = 0, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const stone = toonMat(PAL.stone), wood = toonMat(PAL.wood), trim = toonMat(new THREE.Color(look.trim).getHex()), roofM = toonMat(roofCol);
  // 1 foundation
  const found = new THREE.Group(); add(found, new THREE.BoxGeometry(3, F, 3), stone, 0, F / 2, 0); add(found, new THREE.BoxGeometry(1, .1, .5), stone, 0, .05, 1.7); parts.push(found);
  // 2 walls: plaster box, painted front and sides, corner posts, the striped awning over the door
  const walls = new THREE.Group(); const plain = toonMat(0xffffff, { map: facadeTex(look, W, H, true) }), front = toonMat(0xffffff, { map: facadeTex(look, W, H, false) });
  add(walls, new THREE.BoxGeometry(W, H, W), [plain, plain, toonMat(new THREE.Color(look.wall[1]).getHex()), stone, front, plain], 0, F + H / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(walls, new THREE.BoxGeometry(.14, H + .02, .14), trim, sx * W / 2, F + H / 2, sz * W / 2);
  const L = .8, a = .62; const aw = new THREE.Mesh(new THREE.PlaneGeometry(W * .92, L), toonMat(0xffffff, { map: awningTex(...look.awning), side: THREE.DoubleSide }));
  aw.rotation.x = -(Math.PI / 2 - a); aw.position.set(0, F + H - .12 - L / 2 * Math.sin(a), W / 2 + L / 2 * Math.cos(a) + .01); aw.castShadow = aw.receiveShadow = true; walls.add(aw);
  parts.push(walls);
  // 3 roof: a gabled prism, ridge along x, with a ridge cap (and a chimney on the house)
  const roof = new THREE.Group(); const rise = 1.0, half = W / 2 + .35, eaveY = F + H;
  const tri = new THREE.Shape(); tri.moveTo(-half, 0); tri.lineTo(half, 0); tri.lineTo(0, rise); tri.closePath();
  const rg = new THREE.ExtrudeGeometry(tri, { depth: W + .5, bevelEnabled: false }); rg.translate(0, 0, -(W + .5) / 2); rg.rotateY(Math.PI / 2);
  add(roof, rg, roofM, 0, eaveY, 0); add(roof, new THREE.BoxGeometry(W + .62, .12, .18), toonMat(new THREE.Color(roofCol).multiplyScalar(.75).getHex()), 0, eaveY + rise, 0);
  if (kind === 'house') { add(roof, new THREE.BoxGeometry(.34, .7, .34), stone, -.7, eaveY + rise - .05, -.5); add(roof, new THREE.BoxGeometry(.42, .08, .42), toonMat(0x8f877c), -.7, eaveY + rise + .32, -.5); }
  parts.push(roof);
  // 4 the sign: a painted board above the awning, on two short posts against the roof
  const signG = new THREE.Group(); const sign = makeSignFn([d.name], { width: 1.7, post: false, postHeight: eaveY + .6 }); sign.position.set(0, 0, W / 2 + .5); signG.add(sign);
  for (const s of [-1, 1]) add(signG, new THREE.BoxGeometry(.07, .4, .07), wood, s * .6, eaveY, W / 2 + .46);
  parts.push(signG); g.userData.sign = sign;
  // 5 the flag on the ridge
  const flag = new THREE.Group(); const topY = eaveY + rise + .06; add(flag, new THREE.CylinderGeometry(.025, .03, 1.1, 8), toonMat(PAL.cream), .9, topY + .55, 0); add(flag, new THREE.SphereGeometry(.06, 10, 8), toonMat(PAL.yellow), .9, topY + 1.12, 0);
  const pen = new THREE.Shape(); pen.moveTo(0, 0); pen.lineTo(.75, .17); pen.lineTo(0, .34); pen.closePath(); const pm = new THREE.Mesh(new THREE.ShapeGeometry(pen), toonMat(roofCol, { side: THREE.DoubleSide })); pm.position.set(.92, topY + .72, 0); pm.castShadow = true; flag.add(pm); flag.userData.pennant = pm;
  parts.push(flag);
  // 6 extras: boxes of bricks, a toy car on a plinth, or the house's outside stairs
  const extras = new THREE.Group();
  if (kind === 'lego') for (const [x, z, h] of [[-1.05, 1.15, .6], [1.1, 1.2, .55], [-.75, 1.35, .45]]) { const b = spriteGroup('legobox', { height: h, lean: .35, blob: .8 }); b.position.set(x, F, z); extras.add(b); }
  if (kind === 'cars') { add(extras, new THREE.CylinderGeometry(.5, .55, .22, 20), stone, 1.0, F + .11, 1.05); const car = spriteGroup('car', { height: .5, lean: .35, blob: .6, recolor: { '#e0352f': '#f2c230', '#b0221d': '#d6a51f' } }); car.position.set(1.0, F + .22, 1.05); extras.add(car); car.userData.spin = true; extras.userData.car = car;
    for (let i = 0; i < 3; i++) { const t = add(extras, new THREE.TorusGeometry(.16, .07, 8, 16), toonMat(0x3b3b40), -1.1, F + .07 + i * .14, 1.15); t.rotation.x = Math.PI / 2; } }
  if (kind === 'house') {
    const x0 = W / 2, sw = .62, landY = F + 1.2;
    add(extras, new THREE.BoxGeometry(sw, .1, .7), wood, x0 + sw / 2, landY - .05, -1.0);
    for (let i = 0; i < 7; i++) add(extras, new THREE.BoxGeometry(sw, .08, .32), wood, x0 + sw / 2, landY - .15 * (i + 1) - .04, -.5 + i * .3);
    const rail = toonMat(PAL.cream); for (const z of [-1.33, -.67, -.2, .4, .95]) { const y0 = z < -.6 ? landY : landY - .15 * ((z + .5) / .3 + 1); add(extras, new THREE.CylinderGeometry(.025, .025, .8, 8), rail, x0 + sw - .03, y0 + .4, z); }
  }
  parts.push(extras);
  g.add(...parts); addInk(g);
  parts.forEach(p => { p.visible = false; }); g.userData.parts = parts; g.userData.kind = kind; g.userData.name = d.name; g.userData.paper = true;
  g.userData.reveal = n => parts.forEach((p, i) => { p.visible = i < n; });
  return g;
}

// ---------- parts.js in paper mode ----------
let brickSrc = null;
export function paperLegoBoxTexture(repeat = 1) {
  if (!brickSrc) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const ink = PAL_CSS.ink; g.lineJoin = 'round';
    const gr = g.createLinearGradient(0, 0, 256, 256); gr.addColorStop(0, '#f8d968'); gr.addColorStop(1, '#e0ad22'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.fillStyle = PAL_CSS.red; g.fillRect(0, 0, 256, 54); g.strokeStyle = ink; g.lineWidth = 6; g.beginPath(); g.moveTo(0, 54); g.lineTo(256, 54); g.stroke();
    g.fillStyle = PAL_CSS.cream; for (const x of [30, 62, 94]) { g.beginPath(); g.arc(x, 27, 10, 0, 7); g.fill(); }
    rr(g, 30, 78, 196, 150, 18); g.fillStyle = PAL_CSS.blue; g.fill(); g.lineWidth = 6; g.stroke();
    g.fillStyle = PAL_CSS.red; g.fillRect(64, 160, 128, 46); g.strokeRect(64, 160, 128, 46);
    for (const x of [86, 128, 170]) { g.beginPath(); g.ellipse(x, 160, 16, 6, 0, Math.PI, 0); g.lineTo(x + 16, 146); g.ellipse(x, 146, 16, 6, 0, 0, Math.PI, true); g.closePath(); g.fill(); g.lineWidth = 5; g.stroke(); g.beginPath(); g.ellipse(x, 146, 16, 6, 0, 0, 7); g.fill(); g.stroke(); }
    g.fillStyle = PAL_CSS.yellow; g.fillRect(96, 108, 64, 30); g.lineWidth = 5; g.strokeRect(96, 108, 64, 30);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 8; g.beginPath(); g.moveTo(14, 66); g.lineTo(14, 242); g.stroke();
    g.strokeStyle = ink; g.lineWidth = 8; g.strokeRect(4, 4, 248, 248);
    brickSrc = canvasTex(c);
  }
  // (verify) one texture per repeat, cached: in three.js every cloned Texture is its own GPU upload, and these were never freed
  if (brickByRepeat.has(repeat)) return brickByRepeat.get(repeat);
  const t = brickSrc.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.needsUpdate = true; t.userData.shared = true; brickByRepeat.set(repeat, t); return t;
}
const brickByRepeat = new Map();

// A floating label: Fredoka in ink on cream (or opts.bg), an ink frame and an inner line in opts.stroke; same scale rule as the old one.
export function paperTextSprite(lines, opts = {}) {
  const size = opts.size || 48, w = 1024, frame = 14, pad = 26, inner = w - (frame + pad) * 2; const ls = (lines || []).map(String);
  const probe = document.createElement('canvas').getContext('2d');
  const fonts = ls.map((l, i) => { let s = i === 0 ? size : size * .8; const wt = i === 0 ? 700 : 600; probe.font = `${wt} ${s}px ${FONT}`; const mw = probe.measureText(l).width; if (mw > inner) s *= inner / mw; return { s, wt }; });
  const lh = fonts.map(f => f.s * 1.25); const h = Math.round((frame + pad) * 2 + lh.reduce((a, b) => a + b, 0));
  const c = document.createElement('canvas'); c.width = w; c.height = Math.max(h, 60); const g = c.getContext('2d');
  g.fillStyle = PAL_CSS.ink; rr(g, 0, 0, w, c.height, 30); g.fill(); g.fillStyle = opts.bg || PAL_CSS.cream; rr(g, frame, frame, w - frame * 2, c.height - frame * 2, 20); g.fill();
  if (opts.stroke) { g.strokeStyle = opts.stroke; g.lineWidth = 6; rr(g, frame + 8, frame + 8, w - frame * 2 - 16, c.height - frame * 2 - 16, 14); g.stroke(); }
  g.fillStyle = PAL_CSS.ink; g.textAlign = 'center'; g.textBaseline = 'middle'; let y = frame + pad;
  ls.forEach((l, i) => { g.font = `${fonts[i].wt} ${fonts[i].s}px ${FONT}`; g.fillText(l, w / 2, y + lh[i] * .45); y += lh[i]; });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.premultiplyAlpha = true;
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: opts.depthTest !== false, premultipliedAlpha: true, transparent: true }));
  const scale = opts.scale || 1; m.scale.set(scale * 2.2, scale * 2.2 * c.height / w, 1); return m;
}
