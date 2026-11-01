// places.js — the look of the giants' places. Each arena dresses itself so it reads as HIS place, not a plaza in a
// field: Trump's hollow gold tower, Bezos's warehouse with its belts and drones, Musk's rocket yard, Ellison's data harbor
// (also the place for any boss without his own, with his name on the wall), and from story.place in the data (10/31)
// Bloomberg's campaign stage, Walton's superstore, Zuckerberg's giant phone and Page's giant search box. Everything is merged
// or instanced (one mesh per material), textures are procedural canvases, and nothing stands on the road, the plaza,
// the street footprint, the heap or within reach of the three stalls. The big facade sits on the -z side (z -8 .. -21,
// where env.js still keeps the terrain within ~1 m of flat); props spill around the plaza edges.
//
//   const place = createPlace({ scene });
//   place.build('trump', pile, { streetOrigin, heapCenter, heapRadius });   // pile = world Vector3 of the pile
//   place.update(dt, now);                                                   // belts, drones, blinking lights, steam
//   place.dispose();
//
// The paper look (P.artMode() 'paper'): every standard/physical material a place makes goes through toon (P.toonMat's ramp, the
// same colour and painted map), and the big shapes that throw shadows get an ink hull (BackSide, pushed out .035 m, its own
// merged mesh). No real logos or trademark colour sets anywhere (contract C9): made-up app icons (P.appIconCanvas, else our own
// glyphs), no price tags or money figures on screen.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { roundedBox, MAT } from './props.js';
import * as P_ from './props.js';

const FONT = 'Fredoka, "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color(), _v = new THREE.Vector3(), _axisY = new THREE.Vector3(0, 1, 0);
let seed = 424242; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; const rr = (a, b) => a + (b - a) * rnd();
const TAU = Math.PI * 2, HPI = Math.PI / 2;
const STALLS = [[-3, -5.5], [2, 5.5], [7, -5.5]], STALL_R = 3.0;   // pile-local stall positions (fight.js STALL_AT, moved in front of the camera 10/31); the stall is ~5 m wide, so 3 m from its centre (the brief's 1.5 m minimum, widened)

// ---------- small helpers ----------
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function mkTex(c, { repeat = [1, 1], srgb = true, wrap = true } = {}) { const t = new THREE.CanvasTexture(c); if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
function speckle(g, w, h, n, alpha, light, size = 2) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${light ? '255,255,255' : '0,0,0'},${(alpha * rnd()).toFixed(3)})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * size, 1 + rnd() * size); } }
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
// transform a geometry in place: translate, rotate (Euler xyz), scale (number or Vector3)
function xf(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) { _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); if (typeof s === 'number') _s.setScalar(s); else _s.copy(s); _m.compose(_p, _q, _s); geo.applyMatrix4(_m); return geo; }
const box = (w, h, d, r = 0) => r > 0 ? roundedBox(w, h, d, r, 3) : new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, n = 12) => new THREE.CylinderGeometry(rt, rb, h, n);
const sph = (r, n = 14) => new THREE.SphereGeometry(r, n, Math.max(6, Math.round(n * .7)));
// a quad w×h with its bottom centre at (x,y,z), facing +z then turned ry, uv tiled every (tu, tv) metres
function wall(w, h, tu, tv, x, y, z, ry = 0) { const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tu, uv.getY(i) * h / tv); return xf(g, x, y + h / 2, z, 0, ry); }
// a flat quad on the ground, w (x) × d (z), centred at (x, z), turned ry, lifted y
function flat(w, d, x, z, y = .012, ry = 0) { return xf(new THREE.PlaneGeometry(w, d), x, y, z, -HPI, 0, -ry); }
// a quad whose uv window is a row of an atlas
function atlasQuad(w, h, v0, v1) { const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), v0 + uv.getY(i) * (v1 - v0)); return g; }
// an ellipse, parameterised by arc length: pointAt(s) → position and tangent on the loop
function ellipsePath(cx, cz, a, b, y, N = 160) {
  const pts = [], cum = [0]; for (let i = 0; i <= N; i++) { const t = i / N * TAU; pts.push([cx + a * Math.cos(t), cz + b * Math.sin(t)]); if (i) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); }
  const L = cum[N];
  return { L, y, at(s, pos, tan) { s = ((s % L) + L) % L; let lo = 0, hi = N; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; } const f = (s - cum[lo]) / Math.max(1e-6, cum[lo + 1] - cum[lo]); const p0 = pts[lo], p1 = pts[lo + 1]; pos.set(p0[0] + (p1[0] - p0[0]) * f, y, p0[1] + (p1[1] - p0[1]) * f); if (tan) tan.set(p1[0] - p0[0], 0, p1[1] - p0[1]).normalize(); return pos; } };
}
// a closed ribbon along an ellipse path: `edge(s, side) → Vector3` gives the two rails; uv.x in metres along the loop
function ribbon(path, edge, segs = 96, uvPerM = 1) {
  const pos = [], uv = [], idx = [], A = new THREE.Vector3(), B = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) { const s = i / segs * path.L; edge(s, -1, A); edge(s, 1, B); pos.push(A.x, A.y, A.z, B.x, B.y, B.z); uv.push(s * uvPerM, 0, s * uvPerM, 1); if (i < segs) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// a text atlas: one canvas, one row per entry, one material for every label in the place
function labelAtlas(entries, rowH = 256, w = 1024) {
  const [c, g] = canvas(w, rowH * entries.length); g.textAlign = 'center'; g.textBaseline = 'middle';
  entries.forEach((e, i) => { const y0 = i * rowH; if (e.bg) { g.fillStyle = e.bg; roundRect(g, 0, y0, w, rowH, e.radius ?? 0); g.fill(); }
    const text = e.text; g.font = `${e.weight || 800} 100px ${FONT}`; const tw100 = g.measureText(text).width; const fs = Math.min(rowH * (e.fill ?? .8), w * .92 / tw100 * 100); g.font = `${e.weight || 800} ${fs}px ${FONT}`;
    const cx = w / 2, cy = y0 + rowH / 2 + fs * .04;
    if (e.shadow) { g.fillStyle = e.shadow; g.fillText(text, cx + fs * .035, cy + fs * .05); }
    if (e.stroke) { g.lineWidth = fs * .08; g.strokeStyle = e.stroke; g.lineJoin = 'round'; g.strokeText(text, cx, cy); }
    if (e.gradient) { const gr = g.createLinearGradient(0, y0 + rowH * .15, 0, y0 + rowH * .85); e.gradient.forEach((col, k) => gr.addColorStop(k / (e.gradient.length - 1), col)); g.fillStyle = gr; } else g.fillStyle = e.fg || '#fff';
    g.fillText(text, cx, cy); });
  const t = mkTex(c, { wrap: false }); const n = entries.length;
  return { tex: t, quad: (i, w, h) => atlasQuad(w, h, 1 - (i + 1) / n, 1 - i / n), aspect: w / rowH };
}
function puffCanvas() { const [c, g] = canvas(128, 128); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 60); gr.addColorStop(0, 'rgba(255,255,255,.85)'); gr.addColorStop(.45, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c; }
function scorchCanvas() { const [c, g] = canvas(256, 256); const gr = g.createRadialGradient(128, 128, 10, 128, 128, 124); gr.addColorStop(0, 'rgba(20,16,14,.85)'); gr.addColorStop(.5, 'rgba(30,26,22,.55)'); gr.addColorStop(1, 'rgba(40,36,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 40; i++) { const a = rnd() * TAU, l = 60 + rnd() * 70; g.strokeStyle = `rgba(15,12,10,${(.1 + rnd() * .3).toFixed(2)})`; g.lineWidth = 2 + rnd() * 6; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * l, 128 + Math.sin(a) * l); g.stroke(); } return c; }

// ---------- the paper look ----------
const isPaper = () => P_.artMode?.() === 'paper';
let _grad = null;
function toonGrad() { if (_grad) return _grad; const [c, g] = canvas(3, 1); ['#8c8c96', '#d2d2d6', '#ffffff'].forEach((col, i) => { g.fillStyle = col; g.fillRect(i, 0, 1, 1); }); _grad = new THREE.CanvasTexture(c); _grad.minFilter = _grad.magFilter = THREE.NearestFilter; _grad.generateMipmaps = false; return _grad; }
// a standard/physical material as toon: same colour, maps, emissive, transparency and side; other kinds pass through
function toonOf(m) {
  if (!m || !(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) return m;
  const base = P_.toonMat?.(m.color ? m.color.getHex() : 0xffffff); const t = base?.isMaterial ? base.clone() : new THREE.MeshToonMaterial({ gradientMap: toonGrad() });
  if (m.color) t.color.copy(m.color); if (m.metalness > .5 && m.color) t.color.multiplyScalar(1.08);   // metal reads a touch brighter painted flat
  for (const k of ['map', 'emissiveMap', 'alphaMap', 'transparent', 'opacity', 'alphaTest', 'side', 'depthWrite', 'depthTest', 'vertexColors', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'flatShading', 'name']) if (m[k] !== undefined) t[k] = m[k];
  if (m.emissive) { t.emissive.copy(m.emissive); t.emissiveIntensity = m.emissiveIntensity; }
  m.dispose(); return t;
}
// an ink hull of a (pile-local) piece: positions only, welded, pushed out along the smoothed normals
function hullOf(geo, w = .035) {
  let h = new THREE.BufferGeometry(); h.setAttribute('position', geo.attributes.position.clone()); if (geo.index) h.setIndex(geo.index.clone()); h = mergeVertices(h, 1e-3); h.computeVertexNormals();
  const p = h.attributes.position, n = h.attributes.normal; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * w, p.getY(i) + n.getY(i) * w, p.getZ(i) + n.getZ(i) * w); return h;
}
// the made-up app icons (C9): props' drawings when it has them, else our own glyphs in the palette. One canvas row per kind
const ICON_KINDS = ['seed', 'paw', 'wheel', 'cloud', 'star', 'heart'];
function iconAtlas() {
  const n = ICON_KINDS.length, [c, g] = canvas(256, 256 * n); g.lineCap = g.lineJoin = 'round';
  ICON_KINDS.forEach((kind, i) => { const y0 = i * 256; let art = null; if (kind !== 'heart') { try { art = P_.appIconCanvas?.(kind, 256); } catch (e) { art = null; } }
    if (art) { g.drawImage(art, 0, y0, 256, 256); return; }
    g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineWidth = 18; const cx = 128, cy = y0 + 128;
    if (kind === 'seed') { g.beginPath(); g.ellipse(cx, cy + 8, 52, 78, .35, 0, TAU); g.fill(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 10; g.beginPath(); g.moveTo(cx - 14, cy - 40); g.quadraticCurveTo(cx + 6, cy + 6, cx + 16, cy + 56); g.stroke(); }
    else if (kind === 'paw') { g.beginPath(); g.ellipse(cx, cy + 34, 52, 42, 0, 0, TAU); g.fill(); for (const [dx, dy] of [[-62, -16], [-24, -58], [24, -58], [62, -16]]) { g.beginPath(); g.ellipse(cx + dx, cy + dy, 20, 26, dx * .006, 0, TAU); g.fill(); } }
    else if (kind === 'wheel') { g.beginPath(); g.arc(cx, cy, 80, 0, TAU); g.stroke(); g.beginPath(); g.arc(cx, cy, 18, 0, TAU); g.fill(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 78, cy + Math.sin(a) * 78); g.stroke(); } }
    else if (kind === 'cloud') { for (const [dx, dy, r] of [[-46, 18, 40], [0, -10, 56], [50, 16, 42]]) { g.beginPath(); g.arc(cx + dx, cy + dy, r, 0, TAU); g.fill(); } g.fillRect(cx - 86, cy + 18, 172, 40); }
    else if (kind === 'star') { g.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * TAU - HPI, r = k % 2 ? 36 : 88; g.lineTo(cx + Math.cos(a) * r, cy + 6 + Math.sin(a) * r); } g.closePath(); g.fill(); }
    else { g.beginPath(); g.moveTo(cx, cy + 70); g.bezierCurveTo(cx - 110, cy, cx - 60, cy - 90, cx, cy - 30); g.bezierCurveTo(cx + 60, cy - 90, cx + 110, cy, cx, cy + 70); g.fill(); } });
  return { c, n };
}

// ---------- the place: one group, merged bins, a no-go check, a resource list ----------
class Place {
  constructor(scene, pile, { streetOrigin, heapCenter, heapRadius } = {}) {
    this.scene = scene; this.group = new THREE.Group(); this.group.name = 'place'; this.group.position.copy(pile); scene.add(this.group);
    this.bins = new Map(); this.res = []; this.mats = {}; this.dynamic = []; this.paper = isPaper();
    this.ink = this.paper ? new THREE.MeshBasicMaterial({ color: P_.PAL?.ink ?? 0x3b2516, side: THREE.BackSide }) : null; if (this.ink) { this.ink.userData.ink = true; this.res.push(this.ink); }
    this.street = streetOrigin ? _v.copy(streetOrigin).sub(pile).clone() : new THREE.Vector3(-3, 0, 9);
    this.heap = heapCenter ? _v.copy(heapCenter).sub(pile).clone() : null; this.heapR = heapRadius || 0;
  }
  mat(key, make) { if (!this.mats[key]) { let m = make(); if (this.paper) m = toonOf(m); this.res.push(m); if (m.map) this.res.push(m.map); this.mats[key] = m; } return this.mats[key]; }
  tex(c, o) { const t = mkTex(c, o); this.res.push(t); return t; }
  // queue a geometry for the merged mesh of `mat`; cast = near prop that throws a shadow
  add(mat, geo, cast = false) { let bin = this.bins.get(mat); if (!bin) this.bins.set(mat, bin = { c: [], n: [] }); bin[cast ? 'c' : 'n'].push(geo); return geo; }
  flush() {
    // paper: an ink hull for every big opaque toon shape that throws a shadow (the facades and the big props), merged in one mesh
    if (this.ink) { const hulls = []; for (const [mat, bin] of this.bins) { if (!mat.isMeshToonMaterial || mat.transparent || mat.alphaTest > 0) continue;
        for (const k of ['c', 'n']) for (const g of bin[k]) { if (!g.boundingBox) g.computeBoundingBox(); const b = g.boundingBox, d = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z]; if (Math.max(...d) < (k === 'c' ? 1.2 : 2.5) || Math.min(...d) < .01) continue; const h = hullOf(g); hulls.push(h.index ? h.toNonIndexed() : h); h.dispose(); } }
      if (hulls.length) { const g = mergeGeometries(hulls, false); hulls.forEach(h => h.dispose()); if (g) { const m = new THREE.Mesh(g, this.ink); m.userData.ink = true; this.group.add(m); } } }
    for (const [mat, bin] of this.bins) for (const k of ['c', 'n']) if (bin[k].length) { if (bin[k].some(x => !x.index)) bin[k] = bin[k].map(x => x.index ? x.toNonIndexed() : x);   // extrusions are non-indexed; a merge needs all or none
      const g = mergeGeometries(bin[k], false); if (!g) { console.warn('[places] merge failed', mat.name || mat.type, bin[k].map(x => x.type)); continue; } bin[k].forEach(x => x.dispose()); const m = new THREE.Mesh(g, mat); m.castShadow = k === 'c'; m.receiveShadow = true; this.group.add(m); } this.bins.clear(); }
  // why a disc of radius r at pile-local (x, z) may not stand there; null = free
  blocked(x, z, r = 0) {
    if (Math.abs(z) < 2.4 + r && Math.abs(x) < 30 + r) return 'road';
    if (Math.hypot(x, z) < 4.5 + r) return 'plaza';
    for (const [sx, sz] of STALLS) if (Math.hypot(x - sx, z - sz) < STALL_R + r) return 'stall';
    const s = this.street; if (x > s.x - 15 - r && x < s.x + 15 + r && z > s.z - .5 - r && z < s.z + 19.5 + r) return 'street';
    if (this.heap && Math.hypot(x - this.heap.x, z - this.heap.z) < this.heapR + 1.5 + r) return 'heap';
    return null;
  }
  // the first free candidate [x, z] (or null, with a note); props that find no spot are simply left out
  spot(cands, r, name) { for (const c of cands) if (!this.blocked(c[0], c[1], r)) return c; console.info(`[places] no free spot for ${name} (${cands.map(c => this.blocked(c[0], c[1], r)).join(', ')})`); return null; }
  assert(x, z, r, name) { const why = this.blocked(x, z, r); if (why) console.warn(`[places] ${name} at (${x}, ${z}) r${r} sits on the ${why}`); return !why; }
  dispose() { this.scene.remove(this.group); this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); }); for (const r of this.res) r.dispose?.(); this.res.length = 0; this.mats = {}; }
}

// His name on a board at the west end of his building, facing -x: the camera only looks up the road (+x), so the names on
// the long -z walls are seen edge-on; this one is seen head-on as she walks in (plan B, 10/31). Pile-local:
// [x of the west wall, z centre, depth along z, board height above ground]; Musk has no wall there, so a board on posts.
const NAME_AT = { trump: [-3, -12.5, 7, 6.5], bezos: [-12, -15, 12, 7.5], ellison: [-14, -15, 12, 7.5], musk: [8.6, -14, 8, 3.2, true],
  bloomberg: [-10, -17.5, 7, 8], walton: [-14, -15.5, 13, 6.5], zuckerberg: [-3, -12, 8, 3.2, true], page: [-14, -15, 12, 7.5] };
// the name on screen (C6): display_name || name. fight.js passes { name } (and display_name once it does); walton's display name
// is the data's one, kept here so the board reads 'Rob Walton and family' before it does
const DISPLAY = { walton: 'Rob Walton and family' };
function nameBoard(P, id) {
  const disp = P.display || DISPLAY[id] || '', last = String(P.name || '').split(' ').pop().toUpperCase(); if (!last && !disp) return;
  const [x, z, depth, y, posts] = NAME_AT[id] || NAME_AT.ellison; const w = Math.min(depth * .85, 9), h = w / 4;
  const [c, g] = canvas(1024, 256); const style = { trump: ['#f6cc4e', '#7a4e10'], bezos: ['#1f4e8c', '#ffffff'], musk: ['#2a2b30', '#ffffff'], ellison: ['#c8202a', '#ffffff'], bloomberg: ['#1d2b6a', '#ffffff'], walton: ['#1a5fb4', '#ffffff'], zuckerberg: ['#7b3fc4', '#ffffff'], page: ['#2f9e44', '#ffffff'] }[id] || ['#c8202a', '#ffffff'];
  g.fillStyle = style[0]; roundRect(g, 0, 0, 1024, 256, 28); g.fill(); g.lineWidth = 14; g.strokeStyle = 'rgba(0,0,0,.25)'; roundRect(g, 7, 7, 1010, 242, 24); g.stroke();
  g.fillStyle = style[1]; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (disp) {   // the full display name, on two lines when it is long ('Rob Walton' / 'and family'), as big as fits
    const words = disp.split(' '), cut = words.length > 2 ? Math.ceil(words.length / 2) : words.length, lines = cut < words.length ? [words.slice(0, cut).join(' '), words.slice(cut).join(' ')] : [disp];
    let fs = lines.length > 1 ? 104 : 150; g.font = `900 ${fs}px ${FONT}`; while (fs > 40 && Math.max(...lines.map(l => g.measureText(l).width)) > 940) { fs -= 4; g.font = `900 ${fs}px ${FONT}`; }
    lines.forEach((l, i) => g.fillText(l, 512, 132 + (i - (lines.length - 1) / 2) * fs * 1.02));
  } else { g.font = `900 170px ${FONT}`; g.fillText(last, 512, 136, 960); }
  const m = P.mat(`nameboard-${id}`, () => new THREE.MeshStandardMaterial({ map: P.tex(c, { wrap: false }), roughness: .5, emissive: 0xffffff, emissiveIntensity: .08 }));
  if (posts) { const wood = P.mat('nameboard-post', () => MAT.std(0x3a3b42, { roughness: .6 })); for (const s of [-1, 1]) P.add(wood, xf(box(.18, y + h / 2, .18), x + .15, (y + h / 2) / 2, z + s * (w / 2 - .3)), true); P.add(wood, xf(box(.12, h + .2, w + .2), x + .1, y, z), true); }
  P.add(m, xf(new THREE.PlaneGeometry(w, h), x - .08, y, z, 0, -HPI));
}

export function createPlace(ctx) {
  const { scene } = ctx; let place = null, tick = null;
  const api = { group: null, id: null };
  api.build = (id, pile, opts = {}) => { api.dispose(); seed = 424242 + id.length * 977; place = new Place(scene, pile, opts); api.group = place.group; api.id = id;
    place.name = opts.name || ''; place.display = opts.display_name || opts.displayName || opts.boss?.display_name || ''; const builder = { trump: buildTrump, bezos: buildBezos, musk: buildMusk, ellison: buildEllison, bloomberg: buildBloomberg, walton: buildWalton, zuckerberg: buildZuckerberg, page: buildPage }[id] || buildEllison; tick = builder(place) || null; nameBoard(place, id); place.flush(); return place.group; };   // a boss without his own place gets the Data Harbor with his name on it
  api.update = (dt, now) => { if (tick) tick(dt, now); };
  api.dispose = () => { if (place) place.dispose(); place = null; tick = null; api.group = null; api.id = null; };
  return api;
}

// =====================================================================================================================
// TRUMP — the Golden Tower. Gold-plated and hollow: a tall gold facade with his name, gold-painted everything, a dry
// fountain, a gold statue of himself, doors with his name on them that open onto nothing, panels fallen off showing
// the cardboard behind. Gold, white marble, red.
// =====================================================================================================================
function goldPanelCanvas() {   // one tile = 8 m × 4 m: a gold spandrel band (bottom 2 m) and a dark glass band (top 2 m), four panels across
  const [c, g] = canvas(512, 256);
  for (let i = 0; i < 4; i++) { const x = i * 128; const gr = g.createLinearGradient(x, 0, x + 128, 0); gr.addColorStop(0, '#e9bd3e'); gr.addColorStop(.35, '#ffe38a'); gr.addColorStop(.6, '#f1c94d'); gr.addColorStop(1, '#d9a92d'); g.fillStyle = gr; g.fillRect(x, 128, 128, 128);
    const gl = g.createLinearGradient(x, 0, x + 128, 128); gl.addColorStop(0, '#2b3f58'); gl.addColorStop(.4, '#4d6f93'); gl.addColorStop(.55, '#9dc4e0'); gl.addColorStop(.7, '#3d5a7c'); gl.addColorStop(1, '#22344a'); g.fillStyle = gl; g.fillRect(x, 0, 128, 128);
    g.fillStyle = 'rgba(255,245,200,.35)'; g.fillRect(x + 6, 134, 116, 5); g.fillStyle = 'rgba(80,50,0,.35)'; g.fillRect(x + 6, 247, 116, 4); }
  g.fillStyle = '#b8880f'; for (let i = 0; i <= 4; i++) g.fillRect(i * 128 - 3, 0, 6, 256); g.fillRect(0, 125, 512, 6); g.fillRect(0, 0, 512, 4); g.fillRect(0, 252, 512, 4);
  g.fillStyle = '#fff2c0'; for (let i = 0; i <= 4; i++) g.fillRect(i * 128 + 3, 0, 2, 256);
  speckle(g, 512, 256, 600, .08, true, 2); return c;
}
function marbleCanvas() {
  const [c, g] = canvas(512, 512); g.fillStyle = '#f3f0ea'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(120,120,135,${(.12 + rnd() * .25).toFixed(2)})`; g.lineWidth = .8 + rnd() * 2.2; g.beginPath(); let x = rnd() * 512, y = rnd() * 512; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - .5) * 180; y += (rnd() - .5) * 180; g.quadraticCurveTo(x + (rnd() - .5) * 60, y + (rnd() - .5) * 60, x, y); } g.stroke(); }
  speckle(g, 512, 512, 3000, .05, false, 2); speckle(g, 512, 512, 1500, .2, true, 2); return c;
}
function carpetCanvas() { const [c, g] = canvas(256, 128); g.fillStyle = '#b3121c'; g.fillRect(0, 0, 256, 128); speckle(g, 256, 128, 1500, .18, false, 1); speckle(g, 256, 128, 500, .08, true, 1); g.fillStyle = '#e8b53a'; g.fillRect(0, 4, 256, 6); g.fillRect(0, 118, 256, 6); g.fillStyle = '#7a0b12'; g.fillRect(0, 0, 256, 3); g.fillRect(0, 125, 256, 3); return c; }
function cardboardCanvas(tape = true, swoosh = false) {
  const [c, g] = canvas(256, 256); g.fillStyle = '#c9a068'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 500; i++) { g.strokeStyle = rnd() < .5 ? `rgba(90,60,25,${(.05 + rnd() * .12).toFixed(2)})` : `rgba(255,240,210,${(.05 + rnd() * .12).toFixed(2)})`; g.lineWidth = 1 + rnd(); const x = rnd() * 256, y = rnd() * 256, l = 6 + rnd() * 30, a = (rnd() - .5) * .6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  speckle(g, 256, 256, 1200, .1, false, 2); g.fillStyle = 'rgba(80,50,20,.45)'; g.fillRect(0, 0, 256, 5); g.fillRect(0, 251, 256, 5); g.fillRect(0, 0, 5, 256); g.fillRect(251, 0, 5, 256);
  if (tape) { g.fillStyle = 'rgba(150,110,60,.7)'; g.fillRect(104, 0, 48, 256); g.fillStyle = 'rgba(255,230,180,.25)'; g.fillRect(108, 0, 6, 256); g.fillRect(138, 0, 6, 256); }
  if (swoosh) { g.strokeStyle = '#f08a2c'; g.lineWidth = 11; g.lineCap = 'round'; g.beginPath(); g.moveTo(70, 150); g.quadraticCurveTo(128, 200, 186, 150); g.stroke(); g.beginPath(); g.moveTo(186, 150); g.lineTo(168, 141); g.moveTo(186, 150); g.lineTo(182, 170); g.stroke(); }
  return c;
}
// a gold figure of the giant: round body, big head, the hair swoop, one arm pointing ahead (+z), a long red tie. ~2.2 m tall at s = 1
function giantFigure(P, gold, red, x, z, ry, s, cast = true) {
  const parts = [];
  const pose = (g) => xf(g, x, 0, z, 0, ry, 0, s);
  parts.push(xf(sph(.56, 18), 0, .95, 0, 0, 0, 0, new THREE.Vector3(1, 1.15, .9)));          // body
  parts.push(xf(sph(.47, 18), 0, 1.86, .02));                                                   // head
  parts.push(xf(sph(.2, 10), 0, 1.72, .42, 0, 0, 0, new THREE.Vector3(1.2, .8, 1)));             // muzzle
  for (const sd of [-1, 1]) { parts.push(xf(sph(.17, 10), sd * .4, 2.2, -.05)); parts.push(xf(cyl(.1, .1, .62, 8), sd * .62, 1.1, .05, 0, 0, sd * .25)); parts.push(xf(cyl(.09, .12, .36, 8), sd * .26, .18, 0)); parts.push(xf(sph(.15, 8), sd * .27, .06, .12, 0, 0, 0, new THREE.Vector3(1, .55, 1.4))); }
  parts.push(xf(box(.95, .24, .85, .1), 0, 2.27, .1, .15, 0, .06)); parts.push(xf(box(.5, .18, .5, .08), .22, 2.38, .25, .35, .3, 0));  // the hair swoop
  parts.push(xf(cyl(.09, .1, .74, 8), .52, 1.42, .44, -1.35, 0, -.2)); parts.push(xf(sph(.12, 8), .58, 1.46, .86));                  // the pointing arm
  for (const g of parts) P.add(gold, pose(g), cast);
  P.add(red, pose(xf(box(.16, .95, .06, .02), 0, 1.0, .53, -.12, 0, 0)), cast); P.add(red, pose(xf(box(.22, .16, .07, .02), 0, 1.5, .5)), cast);   // the tie
}
function buildTrump(P) {
  const gold = P.mat('gold', () => MAT.gold({ roughness: .28 }));
  const marble = P.mat('marble', () => new THREE.MeshStandardMaterial({ map: P.tex(marbleCanvas(), { repeat: [1, 1] }), roughness: .3, metalness: .05 }));
  const red = P.mat('red', () => MAT.paint(0xc8202a, { roughness: .55 }));
  const glass = P.mat('glass', () => new THREE.MeshStandardMaterial({ color: 0x1c2c40, roughness: .12, metalness: .7 }));
  const facade = P.mat('facade', () => new THREE.MeshStandardMaterial({ map: P.tex(goldPanelCanvas()), roughness: .3, metalness: .55, emissive: 0x3a2a08, emissiveIntensity: .35 }));
  const card = P.mat('card', () => new THREE.MeshStandardMaterial({ map: P.tex(cardboardCanvas(false)), roughness: .95 }));
  const dust = P.mat('dust', () => MAT.std(0xb9b2a4));
  const carpet = P.mat('carpet', () => new THREE.MeshStandardMaterial({ map: P.tex(carpetCanvas(), { repeat: [1, 1] }), roughness: .95, polygonOffset: true, polygonOffsetFactor: -2 }));
  const labels = labelAtlas([
    { text: 'TRUMP', gradient: ['#fff3b0', '#f6c431', '#c9921a', '#ffe17a'], stroke: '#6e4a06', shadow: 'rgba(60,35,0,.55)', weight: 900 },
    { text: 'TOWER', gradient: ['#fff3b0', '#f6c431', '#c9921a'], stroke: '#6e4a06', weight: 800, fill: .6 },
    { text: 'TRUMP', fg: '#4a2e08', weight: 900, fill: .7 },
  ]); P.res.push(labels.tex);
  const labelMat = P.mat('labels', () => new THREE.MeshStandardMaterial({ map: labels.tex, transparent: true, alphaTest: .25, roughness: .35, metalness: .5, emissive: 0x6a4a10, emissiveIntensity: .35, side: THREE.DoubleSide }));

  // --- the facade: podium (x -8..20, z -16..-9, 10 m) and tower (x -2..14, z -16..-10, up to 36 m), crown and spire
  const FZ = -9, PX0 = -3, PX1 = 25, PD = 7, PH = 10, TX0 = 3, TX1 = 19, TH = 36, EX = 11;   // EX: the entrance's x
  const pcx = (PX0 + PX1) / 2, pw = PX1 - PX0, tcx = (TX0 + TX1) / 2, tw = TX1 - TX0;
  P.add(facade, wall(pw, PH, 8, 4, pcx, 0, FZ)); P.add(facade, wall(PD, PH, 8, 4, PX0, 0, FZ - PD / 2, -HPI)); P.add(facade, wall(PD, PH, 8, 4, PX1, 0, FZ - PD / 2, HPI)); P.add(facade, wall(pw, PH, 8, 4, pcx, 0, FZ - PD, Math.PI));
  P.add(gold, xf(box(pw + .4, .5, PD + .4), pcx, PH + .2, FZ - PD / 2));   // podium cap
  P.add(facade, wall(tw, TH - PH, 8, 4, tcx, PH, FZ - 1)); P.add(facade, wall(PD - 1, TH - PH, 8, 4, TX0, PH, FZ - 1 - (PD - 1) / 2, -HPI)); P.add(facade, wall(PD - 1, TH - PH, 8, 4, TX1, PH, FZ - 1 - (PD - 1) / 2, HPI)); P.add(facade, wall(tw, TH - PH, 8, 4, tcx, PH, FZ - PD, Math.PI));
  P.add(gold, xf(box(tw + .4, .6, PD - 1 + .4), tcx, TH + .25, FZ - 1 - (PD - 1) / 2));
  P.add(gold, xf(box(tw - 4, 3, PD - 3), tcx, TH + 1.9, FZ - 1 - (PD - 1) / 2)); P.add(gold, xf(new THREE.ConeGeometry(5.2, 4.5, 4), tcx, TH + 5.6, FZ - 1 - (PD - 1) / 2, 0, Math.PI / 4)); P.add(gold, xf(cyl(.08, .25, 6, 8), tcx, TH + 10.5, FZ - 1 - (PD - 1) / 2)); P.add(gold, xf(sph(.45, 10), tcx, TH + 13.6, FZ - 1 - (PD - 1) / 2));
  for (let i = 0; i < 5; i++) P.add(gold, xf(box(.5, .9, .3), TX0 + 1.4 + i * 3.3, TH + .9, FZ - 1 + .05));   // crown teeth
  // marble base band, the entrance: dark glass between gold pilasters under a gold awning, three marble steps
  P.add(marble, xf(box(pw + .3, 1.3, .25), pcx, .65, FZ + .1)); P.add(marble, xf(box(.25, 1.3, PD), PX0 - .1, .65, FZ - PD / 2)); P.add(marble, xf(box(.25, 1.3, PD), PX1 + .1, .65, FZ - PD / 2));
  P.add(glass, xf(box(7, 6.6, .3), EX, 3.3, FZ + .05)); for (const sx of [EX - 3.9, EX + 3.9]) P.add(gold, xf(box(.6, 7.6, .7), sx, 3.8, FZ + .2), true); P.add(gold, xf(box(8.4, .7, .7), EX, 7.4, FZ + .2)); P.add(gold, xf(box(8.4, .25, 2.4), EX, 7.0, FZ + 1.4));
  for (const sx of [EX - 2.6, EX + 2.6]) P.add(gold, xf(box(.12, 6.2, .34), sx, 3.1, FZ + .1)); P.add(gold, xf(box(3.0, .14, .36), EX, 4.0, FZ + .1)); P.add(gold, xf(box(.08, 3.8, .4), EX, 1.9, FZ + .12));   // door mullions
  P.add(labelMat, xf(labels.quad(2, 2.4, 2.4 / labels.aspect), EX, 5.0, FZ + .22));   // his name over the entrance
  for (let i = 0; i < 3; i++) P.add(marble, xf(box(24 - i * 1.0, .36, .6), EX, .18 + i * .35, FZ + 1.95 - i * .58), true);
  { const mx = 17, mz = -5.4; if (!P.blocked(mx - 4, mz, .8) && !P.blocked(mx + 4, mz, .8)) { P.add(marble, xf(box(8.6, 1.1, .7, .03), mx, .55, mz), true); P.add(gold, xf(box(8.8, .12, .8), mx, 1.14, mz)); P.add(gold, xf(box(8.8, .12, .8), mx, 3.42, mz)); P.add(marble, xf(box(8.4, 2.2, .4), mx, 2.25, mz), true); P.add(labelMat, xf(labels.quad(0, 8, 8 / labels.aspect), mx, 2.25, mz + .22)); P.add(labelMat, xf(labels.quad(0, 8, 8 / labels.aspect), mx, 2.25, mz - .22, 0, Math.PI)); } }   // his name at eye level: a monument sign by the road
  // the name: huge on the podium parapet, again on the tower, TOWER under it
  P.add(labelMat, xf(labels.quad(0, 16, 16 / labels.aspect), EX, PH + 1.6 + 16 / labels.aspect / 2, FZ + .25)); P.add(gold, xf(box(16.6, .35, .5), EX, PH + 1.45, FZ + .1));
  P.add(labelMat, xf(labels.quad(0, 12, 12 / labels.aspect), tcx, TH - 3.4, FZ - 1 + .2)); P.add(labelMat, xf(labels.quad(1, 8, 8 / labels.aspect), tcx, TH - 6.2, FZ - 1 + .2));
  // gold railings on the podium roof
  const rail = (x0, x1, z, y) => { const L = x1 - x0; P.add(gold, xf(box(L, .06, .06), (x0 + x1) / 2, y + .55, z)); P.add(gold, xf(box(L, .06, .06), (x0 + x1) / 2, y + 1.0, z)); for (let x = x0; x <= x1 + .01; x += 1.5) { P.add(gold, xf(box(.1, 1.05, .1), x, y + .52, z)); P.add(gold, xf(sph(.09, 6), x, y + 1.1, z)); } };
  rail(PX0 + .2, TX0 - .4, FZ + .05, PH + .45); rail(TX1 + .4, PX1 - .2, FZ + .05, PH + .45);
  // hollow gold: panels fallen off showing cardboard, the panels lying below
  const hole = (x, y, z) => { P.add(card, xf(new THREE.PlaneGeometry(1.9, 1.9), x, y, z + .03)); P.add(glass, xf(box(2.0, 2.0, .04), x, y, z + .01)); };
  hole(0, 7, FZ); hole(22, 3, FZ); hole(7, 25, FZ - 1); hole(15.5, 31, FZ - 1); hole(17.8, 15, FZ - 1);
  const panel = (x, y, z, rx, ry, rz) => { P.add(gold, xf(box(1.9, 1.9, .08), x, y, z, rx, ry, rz), true); const back = xf(new THREE.PlaneGeometry(1.85, 1.85), 0, 0, .05); P.add(card, xf(back, x, y, z, rx, ry, rz), false); };
  panel(-.2, .05, FZ + 2.9, -HPI, 0, .3); panel(22.6, .9, FZ + .95, -1.2, 0, 0); panel(17.4, .05, FZ + 2.6, -HPI, 0, -1.1); panel(1.2, 0.04, FZ + 3.6, HPI, 0, .9);
  // gold statue of himself on a marble plinth, facing the pile; gold topiary flanking the steps
  const st = P.spot([[0, -6.6], [-1, -7.2]], 1.0, 'statue'); if (st) { P.add(marble, xf(box(1.7, 1.5, 1.7, .04), st[0], .75, st[1]), true); P.add(marble, xf(box(2.0, .2, 2.0, .04), st[0], 1.6, st[1]), true); P.add(gold, xf(box(1.9, .12, 1.9, .03), st[0], .06, st[1])); giantFigure(P, gold, red, st[0], st[1] + 0, Math.atan2(-st[0], -st[1]), 1.35); P.group.userData.statue = st; }
  for (const tx of [EX - 6.3, EX + 6.3]) { const z = FZ + 3.4; if (P.blocked(tx, z, .7)) continue; P.add(marble, xf(cyl(.55, .4, .8, 10), tx, .4, z), true); P.add(gold, xf(cyl(.07, .09, .7, 6), tx, 1.1, z)); P.add(gold, xf(sph(.62, 12), tx, 1.95, z), true); P.add(gold, xf(sph(.38, 10), tx, 2.75, z), true); }
  // the fountain with no water
  const ft = P.spot([[24.5, -5.3], [19, -5.2], [-18, -5.2]], 2.1, 'fountain'); if (ft) { const [fx, fz] = ft; P.add(marble, xf(cyl(2.1, 2.2, .7, 28), fx, .35, fz), true); P.add(marble, xf(new THREE.TorusGeometry(2.05, .2, 8, 28), fx, .7, fz, HPI)); P.add(dust, xf(new THREE.CircleGeometry(1.9, 24), fx, .66, fz, -HPI));
    P.add(gold, xf(cyl(.32, .42, 1.3, 10), fx, 1.3, fz), true); P.add(gold, xf(sph(.95, 16), fx, 2.05, fz, 0, 0, 0, new THREE.Vector3(1, .42, 1)), true); P.add(gold, xf(cyl(.14, .2, .8, 8), fx, 2.6, fz)); P.add(gold, xf(sph(.28, 10), fx, 3.1, fz), true); P.add(dust, xf(new THREE.CircleGeometry(.9, 16), fx, 2.42, fz, -HPI));
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + .4; P.add(gold, xf(sph(.17, 8), fx + Math.cos(a) * 2.1, .95, fz + Math.sin(a) * 2.1)); } }
  // doors with his name that open onto nothing: a gold frame, both leaves swung wide, sky through the gap
  const door = (x, z, ry) => { const g = []; const put = (geo, m, cast) => P.add(m, xf(geo, x, 0, z, 0, ry, 0), cast);
    put(xf(box(3.4, .14, 1.2), 0, .07, 0), marble, true); for (const sd of [-1, 1]) put(xf(box(.26, 3.7, .32), sd * 1.45, 1.85, 0), gold, true); put(xf(box(3.2, .34, .36), 0, 3.85, 0), gold, true); put(xf(box(3.6, .3, .5), 0, 4.15, 0), gold, true); put(xf(labels.quad(2, 2.6, 2.6 / labels.aspect), 0, 3.85, .19), labelMat, false); put(xf(labels.quad(2, 2.6, 2.6 / labels.aspect), 0, 3.85, -.19, 0, Math.PI), labelMat, false); put(xf(new THREE.ConeGeometry(.5, .6, 4), 0, 4.6, 0, 0, Math.PI / 4), gold, false); put(xf(sph(.14, 8), 0, 4.95, 0), gold, false);
    for (const sd of [-1, 1]) { const open = sd * 1.9; const leaf = xf(box(1.3, 3.5, .08), sd * .65, 1.75, 0); xf(leaf, 0, 0, 0, 0, open); xf(leaf, sd * 1.3, 0, .1); put(leaf, gold, true); const tag = xf(labels.quad(2, .95, .95 / labels.aspect), sd * .65, 2.4, .06); xf(tag, 0, 0, 0, 0, open); xf(tag, sd * 1.3, 0, .1); put(tag, labelMat, false); const knob = xf(sph(.07, 6), sd * .12, 1.7, .1); xf(knob, 0, 0, 0, 0, open); xf(knob, sd * 1.3, 0, .1); put(knob, gold, false); } };
  for (const [cands, ry] of [[[[12, 5.6], [10, 6.2]], -HPI], [[[29.5, -5.4], [31, -5.6], [-21, 5.4]], -HPI], [[[-17, -5.8], [-19, -6]], -HPI]]) { const d = P.spot(cands, 1.9, 'door'); if (d) door(d[0], d[1], ry); }
  // gold lamp posts along the road, outside its edge
  for (const z of [-3.2, 3.2]) for (const x of [-27, -20, -5.5, 3, 11, 19, 27]) { if (P.blocked(x, z, .5)) continue; P.add(gold, xf(cyl(.07, .1, 4.2, 8), x, 2.1, z), true); P.add(gold, xf(cyl(.3, .4, .25, 10), x, .12, z)); P.add(gold, xf(box(.46, .22, .46), x, 4.3, z)); P.add(glass, xf(box(.4, .6, .4), x, 4.7, z)); P.add(gold, xf(new THREE.ConeGeometry(.38, .4, 4), x, 5.2, z, 0, Math.PI / 4)); P.add(gold, xf(sph(.08, 6), x, 5.45, z)); }
  // the red carpet along the road into the plaza, gold stanchions and red rope outside the road's edge
  const cx0 = -36, cx1 = -4.6; const carp = flat(cx1 - cx0, 1.6, (cx0 + cx1) / 2, 0, .03); const uv = carp.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (cx1 - cx0) / 2.2, uv.getY(i)); P.add(carpet, carp);
  for (const z of [-2.75, 2.75]) { let prev = null; for (let x = -34; x <= -7; x += 3) { P.add(gold, xf(cyl(.05, .05, 1.0, 6), x, .5, z)); P.add(gold, xf(cyl(.18, .2, .06, 8), x, .03, z)); P.add(gold, xf(sph(.09, 8), x, 1.03, z));
      if (prev !== null) { const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(prev, .92, z), new THREE.Vector3((prev + x) / 2, .62, z), new THREE.Vector3(x, .92, z)); P.add(red, new THREE.TubeGeometry(curve, 6, .035, 5)); } prev = x; } }
  for (const cand of [[-6.5, 6.4], [17.5, 6.6], [27, 6.2], [-20, -6], [30, -6.2], [-24, 5.8]]) { if (P.blocked(cand[0], cand[1], 1.6)) continue; const [tx, tz] = cand; P.add(gold, xf(cyl(.16, .28, 2.6, 8), tx, 1.3, tz), true); P.add(gold, xf(sph(1.5, 14), tx, 3.9, tz, 0, 0, 0, new THREE.Vector3(1, 1.15, 1)), true); P.add(gold, xf(sph(1.0, 12), tx + .9, 3.2, tz + .5), true); P.add(gold, xf(sph(.9, 12), tx - .8, 3.4, tz - .6), true); P.add(gold, xf(sph(.7, 10), tx + .2, 5.1, tz), true); P.add(marble, xf(cyl(.5, .6, .3, 10), tx, .15, tz)); }   // even the trees are gold
  return null;   // nothing moves at Trump's: the stillness is the point
}

// =====================================================================================================================
// BEZOS — the Warehouse. A huge corrugated wall with a taped-box mark under a blank, roller doors onto a loading dock,
// cardboard towers, a conveyor loop with boxes gliding on it, drones on slow patrol, yellow paint on the floor.
// Cardboard tan, grey, safety yellow, orange.
// =====================================================================================================================
function corrugatedCanvas(hM) {   // one tile = 2 m wide × the wall's full height: ribs, panel seams, grime at the foot
  const w = 128, h = Math.round(hM * 48); const [c, g] = canvas(w, h); g.fillStyle = '#a9adb2'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x++) { const f = (Math.sin(x / w * TAU * 8) + 1) / 2; const l = 150 + f * 55; g.fillStyle = `rgb(${l},${l + 3},${l + 7})`; g.fillRect(x, 0, 1, h); }
  g.fillStyle = 'rgba(40,40,45,.35)'; for (let y = 0; y < h; y += 96) g.fillRect(0, y, w, 3); g.fillStyle = 'rgba(255,255,255,.15)'; for (let y = 3; y < h; y += 96) g.fillRect(0, y, w, 1);
  const gr = g.createLinearGradient(0, h - 90, 0, h); gr.addColorStop(0, 'rgba(60,50,40,0)'); gr.addColorStop(1, 'rgba(60,50,40,.5)'); g.fillStyle = gr; g.fillRect(0, h - 90, w, 90);
  speckle(g, w, h, 900, .1, false, 2); return c;
}
function hazardCanvas() { const [c, g] = canvas(128, 64); g.fillStyle = '#f2c230'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#1d1a16'; for (let i = -1; i < 4; i++) { g.beginPath(); g.moveTo(i * 32, 64); g.lineTo(i * 32 + 32, 0); g.lineTo(i * 32 + 48, 0); g.lineTo(i * 32 + 16, 64); g.fill(); } return c; }
function slatCanvas() { const [c, g] = canvas(256, 256); for (let y = 0; y < 256; y += 18) { const gr = g.createLinearGradient(0, y, 0, y + 18); gr.addColorStop(0, '#8e949a'); gr.addColorStop(.4, '#c5cad0'); gr.addColorStop(1, '#6f757b'); g.fillStyle = gr; g.fillRect(0, y, 256, 18); } g.fillStyle = 'rgba(30,30,35,.4)'; for (let y = 0; y < 256; y += 18) g.fillRect(0, y, 256, 2); speckle(g, 256, 256, 500, .12, false, 2); return c; }
function logoCanvas() {   // the blank and the smile: a white nameplate with nothing on it, the orange swoosh-arrow under it
  const [c, g] = canvas(1024, 384); g.fillStyle = '#3b3f45'; roundRect(g, 0, 0, 1024, 384, 24); g.fill(); g.fillStyle = '#2a2d32'; roundRect(g, 14, 14, 996, 356, 18); g.fill();
  g.fillStyle = '#f6f4ee'; roundRect(g, 70, 48, 884, 170, 22); g.fill(); g.fillStyle = 'rgba(0,0,0,.08)'; roundRect(g, 70, 190, 884, 28, 10); g.fill();
  g.fillStyle = '#f08a2c'; roundRect(g, 150, 252, 724, 34, 17); g.fill(); return c;   // (integrate, C9) a plain orange stripe, no smile-arrow
}
function smileCanvas() { const [c, g] = canvas(512, 256); g.strokeStyle = '#f08a2c'; g.lineWidth = 26; g.lineJoin = 'round'; g.strokeRect(176, 40, 160, 160); g.beginPath(); g.moveTo(256, 40); g.lineTo(256, 110); g.stroke(); return c; }   // (integrate, C9) a made-up mark: a taped box, not the smile-arrow
function beltCanvas() { const [c, g] = canvas(128, 64); g.fillStyle = '#2a2b2e'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#3d3f43'; for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 14, 64); g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(0, 2, 128, 2); g.fillRect(0, 60, 128, 2); speckle(g, 128, 64, 300, .15, true, 1); return c; }
function bladeCanvas() { const [c, g] = canvas(128, 128); g.fillStyle = 'rgba(40,40,45,.22)'; g.beginPath(); g.arc(64, 64, 62, 0, TAU); g.fill(); g.fillStyle = 'rgba(30,30,35,.85)'; g.beginPath(); g.ellipse(64, 64, 60, 9, .5, 0, TAU); g.fill(); g.beginPath(); g.ellipse(64, 64, 60, 9, .5 + HPI, 0, TAU); g.fill(); g.fillStyle = '#f08a2c'; g.beginPath(); g.arc(64, 64, 9, 0, TAU); g.fill(); return c; }

function buildBezos(P) {
  const wallM = P.mat('wall', () => new THREE.MeshStandardMaterial({ map: P.tex(corrugatedCanvas(12)), roughness: .55, metalness: .35 }));
  const concrete = P.mat('concrete', () => MAT.std(0x9b9a95, { roughness: .95 }));
  const dark = P.mat('dark', () => MAT.std(0x1a1b1f, { roughness: .9 }));
  const steel = P.mat('steel', () => MAT.std(0x6f747a, { roughness: .5, metalness: .45 }));
  const yellow = P.mat('yellow', () => MAT.paint(0xf2c230, { emissive: 0x3a2a00, emissiveIntensity: .25 }));
  const paint = P.mat('paint', () => new THREE.MeshStandardMaterial({ color: 0xf5c531, roughness: .9, emissive: 0x4a3600, emissiveIntensity: .25, polygonOffset: true, polygonOffsetFactor: -2 }));
  const orange = P.mat('orange', () => MAT.paint(0xf08a2c));
  const hazard = P.mat('hazard', () => new THREE.MeshStandardMaterial({ map: P.tex(hazardCanvas()), roughness: .8 }));
  const slats = P.mat('slats', () => new THREE.MeshStandardMaterial({ map: P.tex(slatCanvas()), roughness: .5, metalness: .4 }));
  const logo = P.mat('logo', () => new THREE.MeshStandardMaterial({ map: P.tex(logoCanvas(), { wrap: false }), roughness: .6 }));
  const card = P.mat('card', () => new THREE.MeshStandardMaterial({ map: P.tex(cardboardCanvas(true, true)), roughness: .95 }));
  const smile = P.mat('smile', () => new THREE.MeshStandardMaterial({ map: P.tex(smileCanvas(), { wrap: false }), transparent: true, alphaTest: .3, roughness: .6 }));
  const pallet = P.mat('pallet', () => MAT.std(0xb08a5a));
  const beltM = P.mat('belt', () => new THREE.MeshStandardMaterial({ map: P.tex(beltCanvas()), roughness: .9 }));
  const droneM = P.mat('drone', () => MAT.std(0x3a3d42, { roughness: .5, metalness: .4 }));
  const bladeM = P.mat('blade', () => new THREE.MeshBasicMaterial({ map: P.tex(bladeCanvas(), { wrap: false }), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  const labels = labelAtlas([
    { text: 'DOCK 1', fg: '#f6f4ee', bg: '#2a2d32', radius: 20, weight: 800, size: 92 }, { text: 'DOCK 2', fg: '#f6f4ee', bg: '#2a2d32', radius: 20, weight: 800, size: 92 }, { text: 'DOCK 3', fg: '#f6f4ee', bg: '#2a2d32', radius: 20, weight: 800, size: 92 },
    { text: 'KEEP CLEAR', fg: '#f5c531', weight: 900, size: 96 }, { text: 'SHIPPING →', fg: '#f6f4ee', bg: '#f08a2c', radius: 20, weight: 800, size: 88 }, { text: '← RECEIVING', fg: '#f6f4ee', bg: '#f08a2c', radius: 20, weight: 800, size: 88 },
  ], 192); P.res.push(labels.tex);
  const labelMat = P.mat('labels', () => new THREE.MeshStandardMaterial({ map: labels.tex, transparent: true, alphaTest: .3, roughness: .7, side: THREE.DoubleSide }));

  // --- the wall: x -12..26, z -21..-9, 12 m; flat roof, parapet, vents; the logo high over the middle door
  const FZ = -9, X0 = -12, X1 = 26, D = 12, H = 12, cx = (X0 + X1) / 2, W = X1 - X0;
  P.add(wallM, wall(W, H, 2, H, cx, 0, FZ)); P.add(wallM, wall(D, H, 2, H, X0, 0, FZ - D / 2, -HPI)); P.add(wallM, wall(D, H, 2, H, X1, 0, FZ - D / 2, HPI)); P.add(wallM, wall(W, H, 2, H, cx, 0, FZ - D, Math.PI));
  P.add(concrete, xf(box(W + .5, .5, D + .5), cx, H + .2, FZ - D / 2)); P.add(concrete, xf(box(W + .5, .7, .35), cx, H + .75, FZ + .1));
  for (const x of [-7, 2, 12, 21]) { P.add(steel, xf(cyl(.5, .55, 1.3, 10), x, H + 1.1, FZ - 3)); P.add(steel, xf(cyl(.75, .5, .35, 10), x, H + 1.9, FZ - 3)); } P.add(steel, xf(box(3, 1.5, 2), 7, H + 1.2, FZ - 7)); P.add(steel, xf(box(2.2, 1.2, 1.6), -4, H + 1.0, FZ - 8));
  for (const x of [X0 + .6, X1 - .6]) P.add(steel, xf(cyl(.1, .1, H, 6), x, H / 2, FZ + .15));
  P.add(orange, xf(box(W, .55, .06), cx, 6.9, FZ + .04));   // the brand stripe
  P.add(logo, xf(new THREE.PlaneGeometry(14, 14 * 384 / 1024), 7, 9.45, FZ + .12));
  // the loading dock: concrete platform with a hazard stripe, bumpers, bollards, steps at the left end
  P.add(concrete, xf(box(W, 1.2, 1.8), cx, .6, FZ + .9)); P.add(hazard, wall(W, .5, 1.6, .5, cx, .5, FZ + 1.81)); P.add(concrete, xf(box(W, .1, 1.9), cx, 1.2, FZ + .9));
  for (let i = 0; i < 3; i++) P.add(concrete, xf(box(1.6, .4, 1.2 - i * .4), X0 + .8, .2 + i * .4, FZ + 1.8 + (1.2 - i * .4) / 2), true);
  for (const x of [-9, 1.5, 11, 24.5]) { if (P.blocked(x, FZ + 2.2, .3)) continue; P.add(yellow, xf(cyl(.14, .16, 1.1, 10), x, .55, FZ + 2.2), true); P.add(dark, xf(box(.36, .12, .36), x, 1.12, FZ + 2.2)); }
  // the roller doors: 1 and 2 closed, 3 half up with a dark bay behind it and the belt coming out
  const doors = [[-6, false], [7, false], [20, true]];
  doors.forEach(([x, open], i) => { for (const sd of [-1, 1]) { P.add(steel, xf(box(.25, 4.6, .3), x + sd * 2.45, 1.2 + 2.3, FZ + .1)); P.add(dark, xf(box(.5, .5, .25), x + sd * 1.6, .9, FZ + 1.85)); } P.add(steel, xf(box(5.2, .5, .5), x, 5.85, FZ + .15));
    if (open) { P.add(slats, wall(4.6, 1.9, 4.6, 1.9, x, 3.7, FZ + .02)); P.add(dark, xf(box(4.6, 2.5, 4), x, 2.45, FZ - 2.0)); }
    else { P.add(slats, wall(4.6, 4.4, 4.6, 4.4, x, 1.2, FZ + .02)); P.add(smile, xf(new THREE.PlaneGeometry(4.0, 2.0), x, 3.1, FZ + .06)); }
    P.add(labelMat, xf(labels.quad(i, 2.4, 2.4 / labels.aspect), x, 6.25, FZ + .35)); });
  P.add(labelMat, xf(labels.quad(5, 5, 5 / labels.aspect), -6, 8.9, FZ + .1)); P.add(labelMat, xf(labels.quad(4, 5, 5 / labels.aspect), 20, 8.9, FZ + .1));
  // --- boxes: one instanced mesh; towers on pallets round the plaza, boxes on the dock, in the bay, on two racks
  const boxGeo = new THREE.BoxGeometry(1, .8, 1); const inst = []; const putBox = (x, y, z, ry, s) => inst.push([x, y, z, ry, s]);
  const stack = (x, z, cols, rows, levels, s = 1, ry = 0, name = 'stack') => { const w = cols * s * 1.02, d = rows * s * 1.02; if (P.blocked(x, z, Math.hypot(w, d) / 2 + .2)) { console.info(`[places] ${name} skipped at (${x}, ${z})`); return; }
    const cs = Math.cos(ry), sn = Math.sin(ry); P.add(pallet, xf(box(w + .25, .14, d + .25), x, .07, z, 0, ry), true); for (let k = 0; k < 3; k++) P.add(pallet, xf(box(w + .25, .12, .14), x + (k - 1) * (d / 2) * -sn, .14, z + (k - 1) * (d / 2) * cs, 0, ry));
    for (let l = 0; l < levels; l++) for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { if (l === levels - 1 && rnd() < .3) continue; const lx = (i - (cols - 1) / 2) * s * 1.02, lz = (j - (rows - 1) / 2) * s * 1.02; putBox(x + lx * cs - lz * sn, .2 + l * s * .8 + s * .4, z + lx * sn + lz * cs, ry + rr(-.06, .06), s); } };
  stack(-5.6, -6.6, 2, 2, 3, 1, .1); stack(0, -7.0, 2, 1, 4, .9, -.15); stack(-16.5, -6.3, 3, 2, 2, 1.0, .2); stack(25, -6.8, 2, 2, 3, 1, 0); stack(-7, 6.4, 2, 2, 2, 1, .3); stack(4, 6.6, 3, 1, 3, .95, 0); stack(-21.5, 5, 2, 2, 3, 1, .1); stack(10, 5.3, 2, 2, 3, .95, .2, 'road-side stack'); stack(14.5, 5.8, 2, 1, 2, .9, .2, 'heap-side stack');
  for (const [x, z, s] of [[-10.5, -8.1, .9], [-9.3, -8.3, .7], [13, -8.2, .9], [14.1, -8.1, .8], [23.5, -8.2, 1], [16, -8.3, .6]]) putBox(x, 1.2 + s * .4, z, rr(-.4, .4), s);
  for (const [x, z, s] of [[18.6, -10.6, 1], [21.2, -10.8, .9], [19.8, -11.6, .8], [18.8, -9.9, .6]]) putBox(x, 1.2 + s * .4, z, rr(-.3, .3), s);
  const rack = (x, z) => { for (const dz of [-3, 0, 3]) for (const dx of [-.6, .6]) P.add(yellow, xf(box(.14, 5, .14), x + dx, 2.5, z + dz)); for (const y of [.25, 1.95, 3.65]) for (const dx of [-.6, .6]) P.add(orange, xf(box(.1, .14, 6.1), x + dx, y, z)); for (const y of [.3, 2.0, 3.7]) P.add(steel, xf(box(1.15, .05, 6.1), x, y, z));
    for (const y of [.33, 2.03, 3.73]) for (let k = 0; k < 6; k++) { if (rnd() < .25) continue; const s = rr(.65, .9); putBox(x, y + s * .4, z - 2.5 + k * 1.0, rr(-.1, .1) + HPI, s); } };
  rack(-14.6, -12); rack(28.6, -12);
  // --- the conveyor loop, out of dock 3 and round in front of it; boxes glide on it
  const path = ellipsePath(17.5, -5.6, 5.4, 1.4, .9); const E = new THREE.Vector3(), Tn = new THREE.Vector3();
  const edgeAt = (hw, y) => (s, side, out) => { path.at(s, E, Tn); out.set(E.x - Tn.z * side * hw, y, E.z + Tn.x * side * hw); };
  P.add(beltM, ribbon(path, edgeAt(.6, .9), 110, .5)); P.add(steel, ribbon(path, (s, side, out) => { path.at(s, E, Tn); out.set(E.x - Tn.z * .72 * (side > 0 ? 1 : 1), .9 - (side > 0 ? 0 : .28), E.z + Tn.x * .72); }, 110));
  P.add(steel, ribbon(path, (s, side, out) => { path.at(s, E, Tn); out.set(E.x + Tn.z * .72, .9 - (side > 0 ? 0 : .28), E.z - Tn.x * .72); }, 110));
  P.add(yellow, ribbon(path, edgeAt(.78, 1.08), 110)); for (let k = 0; k < 12; k++) { path.at(k / 12 * path.L, E); P.add(steel, xf(cyl(.05, .05, .62, 6), E.x, .31, E.z)); }
  P.add(steel, xf(box(.9, .9, .9), 12.3, .45, -7.3)); P.add(orange, xf(box(.94, .2, .94), 12.3, .95, -7.3));
  // --- drones: one instanced body (with its own hanging package), one instanced rotor sheet × 4 each
  const droneGeo = mergeGeometries([xf(box(.7, .18, .7, .04), 0, 0, 0), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].flatMap(([a, b]) => [xf(box(.62, .05, .09), a * .38, .02, b * .38, 0, Math.atan2(b, a)), xf(cyl(.08, .08, .1, 8), a * .55, .06, b * .55)]), xf(box(.06, .34, .06), 0, -.24, 0), xf(box(.5, .06, .5), 0, -.4, 0), xf(sph(.07, 8), 0, -.04, .36)], false);
  const drones = new THREE.InstancedMesh(droneGeo, droneM, 4); drones.instanceMatrix.setUsage(THREE.DynamicDrawUsage); drones.castShadow = true; drones.frustumCulled = false; P.group.add(drones);
  const rotors = new THREE.InstancedMesh(xf(new THREE.PlaneGeometry(.95, .95), 0, .12, 0, -HPI), bladeM, 16); rotors.instanceMatrix.setUsage(THREE.DynamicDrawUsage); rotors.frustumCulled = false; P.group.add(rotors);
  const DR = [{ c: [1, 1.5], r: 8.5, h: 4.6, w: .22, ph: 0 }, { c: [16, -2], r: 5.5, h: 5.4, w: -.3, ph: 2 }, { c: [-11, -1], r: 6, h: 6.2, w: .26, ph: 4 }, { c: [7, 3], r: 11, h: 7.2, w: -.17, ph: 1 }];
  // --- a forklift parked by the road, forks toward the plaza
  { const fx = 26.5, fz = -4.3, ry = HPI; if (!P.blocked(fx, fz, 1.3)) { const put = (geo, m, cast) => P.add(m, xf(geo, fx, 0, fz, 0, ry), cast);
    put(xf(box(1.5, .7, 1.2, .04), .2, .75, 0), yellow, true); put(xf(box(1.0, .5, 1.1, .04), -.3, 1.3, 0), yellow, true); put(xf(box(.6, .45, .8, .03), .3, 1.3, 0), dark, false); for (const [dx, dz] of [[-.55, -.62], [-.55, .62], [.55, -.62], [.55, .62]]) put(xf(cyl(.3, .3, .22, 12), dx, .3, dz, HPI), dark, true);
    for (const dx of [-.05, .05]) put(xf(box(.06, 2.4, .06), 1.05 + dx * 0, 1.2, dx > 0 ? .36 : -.36), steel, false); put(xf(box(.08, .08, .8), 1.05, 2.4, 0), steel, false); for (const dz of [-.28, .28]) put(xf(box(1.1, .05, .12), 1.6, .08, dz), steel, true);
    for (const [dx, dz] of [[-.35, -.55], [-.35, .55], [.45, -.55], [.45, .55]]) put(xf(box(.06, 1.1, .06), dx, 1.9, dz), steel, false); put(xf(box(1.0, .05, 1.3), .05, 2.45, 0), steel, false); put(xf(box(.5, .08, .4), -.4, 1.56, 0), dark, false); } }
  // --- yellow paint on the floor: lane lines beside the road, a ring round the plaza, hatching and arrows at dock 1
  P.add(paint, flat(56, .16, 0, -2.95)); P.add(paint, flat(42, .16, -7, 2.95)); for (let k = 0; k < 24; k++) P.add(paint, xf(new THREE.RingGeometry(4.85, 5.05, 4, 1, k / 24 * TAU, TAU / 24 * .6), 0, .012, 0, -HPI));
  for (let i = 0; i < 7; i++) { const x = -6 + (i - 3) * .62; P.add(paint, flat(.14, 2.6, x, FZ + 3.2, .012, .55)); } P.add(paint, flat(4.6, .14, -6, FZ + 1.95)); P.add(paint, flat(4.6, .14, -6, FZ + 4.4)); P.add(labelMat, xf(labels.quad(3, 3.2, 3.2 / labels.aspect), -6, .014, FZ + 5.4, -HPI));
  for (const x of [-26, -21, -16]) { P.add(paint, flat(1.6, .22, x, -3.6)); P.add(paint, flat(.7, .22, x + 1.0, -3.4, .012, .6)); P.add(paint, flat(.7, .22, x + 1.0, -3.8, .012, -.6)); }
  for (const [x, z] of [[-9, -6.9], [1.5, -6.9], [11, -6.9], [24.5, -6.9]]) P.add(paint, xf(new THREE.RingGeometry(.3, .42, 12), x, .012, z, -HPI));
  // the box instances: static ones first, then the belt's and the drones' (the moving tail of the same mesh)
  const BELT_N = 9, N = inst.length + BELT_N + 4; const boxes = new THREE.InstancedMesh(boxGeo, card, N); boxes.instanceMatrix.setUsage(THREE.DynamicDrawUsage); boxes.castShadow = true; boxes.receiveShadow = true; boxes.frustumCulled = false; P.group.add(boxes);
  inst.forEach(([x, y, z, ry, s], i) => { _q.setFromAxisAngle(_axisY, ry); _s.setScalar(s); _p.set(x, y, z); _m.compose(_p, _q, _s); boxes.setMatrixAt(i, _m); });
  const belt = []; for (let k = 0; k < BELT_N; k++) belt.push({ s: k / BELT_N * path.L + rr(-.3, .3), sc: rr(.5, .8), ry: rr(-.3, .3) });
  let beltS = 0; const BELT_V = 1.1; const pos = new THREE.Vector3(), tan = new THREE.Vector3(), up = _axisY;
  return (dt, now) => {
    beltS += BELT_V * dt; beltM.map.offset.x = -(beltS * .5) % 1;
    belt.forEach((b, k) => { path.at(b.s + beltS, pos, tan); _q.setFromAxisAngle(up, Math.atan2(tan.x, tan.z) + b.ry); _s.setScalar(b.sc); pos.y = .9 + b.sc * .4; _m.compose(pos, _q, _s); boxes.setMatrixAt(inst.length + k, _m); });
    DR.forEach((d, i) => { const a = now * .001 * d.w + d.ph; const x = d.c[0] + Math.cos(a) * d.r, z = d.c[1] + Math.sin(a) * d.r, y = d.h + Math.sin(now * .0017 + d.ph * 2) * .35;
      const yaw = Math.atan2(-Math.sin(a) * Math.sign(d.w), Math.cos(a) * Math.sign(d.w)); _e.set(0, yaw, 0); _q.setFromEuler(_e); _e.set(.06, 0, -.12 * Math.sign(d.w)); _q2.setFromEuler(_e); _q.multiply(_q2); _p.set(x, y, z); _s.setScalar(1); _m.compose(_p, _q, _s); drones.setMatrixAt(i, _m);
      _m2.makeTranslation(0, -.64, 0); _m2.premultiply(_m); boxes.setMatrixAt(inst.length + BELT_N + i, _m2);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a2, b2], k) => { _p.set(a2 * .55, 0, b2 * .55); _q2.setFromAxisAngle(up, now * .03 * (k % 2 ? 1 : -1) + k); _m2.compose(_p, _q2, _s); _m2.premultiply(_m); rotors.setMatrixAt(i * 4 + k, _m2); }); });
    boxes.instanceMatrix.needsUpdate = true; drones.instanceMatrix.needsUpdate = true; rotors.instanceMatrix.needsUpdate = true;
  };
}

// =====================================================================================================================
// MUSK — the Rocket Yard. A launch pad with a tall white-and-red cartoon rocket steaming on its mount, a gantry beside
// it, a second rocket on its side with a dent, pad lights chasing round the slab, a big angular grey truck, a MARS → sign,
// scorch marks. White, red, concrete grey, dark steel.
// =====================================================================================================================
function rocketCanvas() {   // wraps once round the body: white panels, seams, a red band, a row of portholes, a thin red pinstripe
  const [c, g] = canvas(512, 1024); g.fillStyle = '#f4f3ee'; g.fillRect(0, 0, 512, 1024); speckle(g, 512, 1024, 1500, .05, false, 2);
  g.fillStyle = 'rgba(0,0,0,.1)'; for (let y = 0; y < 1024; y += 128) g.fillRect(0, y, 512, 3); for (let x = 0; x < 512; x += 128) g.fillRect(x, 0, 2, 1024);
  g.fillStyle = '#d7262c'; g.fillRect(0, 430, 512, 110); g.fillRect(0, 60, 512, 18); g.fillStyle = '#ffffff'; g.fillRect(0, 475, 512, 12);
  for (let i = 0; i < 4; i++) { const x = 64 + i * 128; g.fillStyle = '#5a6068'; g.beginPath(); g.arc(x, 300, 34, 0, TAU); g.fill(); g.fillStyle = '#1c2a3a'; g.beginPath(); g.arc(x, 300, 26, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(x - 8, 290, 9, 6, -.6, 0, TAU); g.fill(); }
  g.fillStyle = '#2b2f36'; g.fillRect(0, 980, 512, 44); g.fillStyle = 'rgba(0,0,0,.12)'; const gr = g.createLinearGradient(0, 900, 0, 1024); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(30,25,20,.6)'); g.fillStyle = gr; g.fillRect(0, 900, 512, 124);
  return c;
}
function concreteCanvas() {   // the slab's top: panel seams, stains, a scorch bloom off-centre where the rocket stands
  const [c, g] = canvas(1024, 1024); g.fillStyle = '#9c9b96'; g.fillRect(0, 0, 1024, 1024); speckle(g, 1024, 1024, 9000, .08, false, 3); speckle(g, 1024, 1024, 5000, .1, true, 2);
  g.fillStyle = 'rgba(40,40,40,.35)'; for (let i = 0; i <= 4; i++) { g.fillRect(i * 256 - 2, 0, 4, 1024); g.fillRect(0, i * 256 - 2, 1024, 4); }
  for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(60,50,40,${(.05 + rnd() * .12).toFixed(2)})`; g.beginPath(); g.ellipse(rnd() * 1024, rnd() * 1024, 20 + rnd() * 90, 10 + rnd() * 50, rnd() * 3, 0, TAU); g.fill(); }
  const sc = g.createRadialGradient(448, 544, 20, 448, 544, 300); sc.addColorStop(0, 'rgba(18,15,13,.92)'); sc.addColorStop(.45, 'rgba(30,26,22,.6)'); sc.addColorStop(1, 'rgba(40,36,30,0)'); g.fillStyle = sc; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 60; i++) { const a = rnd() * TAU, l = 150 + rnd() * 260; g.strokeStyle = `rgba(15,12,10,${(.08 + rnd() * .25).toFixed(2)})`; g.lineWidth = 3 + rnd() * 12; g.beginPath(); g.moveTo(448, 544); g.lineTo(448 + Math.cos(a) * l, 544 + Math.sin(a) * l); g.stroke(); }
  return c;
}
function steamMaterial(P) {
  const map = P.tex(puffCanvas(), { wrap: false });
  return new THREE.ShaderMaterial({ uniforms: { uMap: { value: map }, uScale: { value: 700 } }, transparent: true, depthWrite: false,
    vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / max(1.0, -mv.z); vA = aAlpha; }`,
    fragmentShader: `uniform sampler2D uMap; varying float vA; void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(t.rgb * 0.95, t.a * vA); if (gl_FragColor.a < 0.01) discard; }` });
}
function buildMusk(P) {
  const rocketM = P.mat('rocket', () => new THREE.MeshStandardMaterial({ map: P.tex(rocketCanvas(), { wrap: false }), roughness: .35, metalness: .1 }));
  const white = P.mat('white', () => MAT.paint(0xf4f3ee, { roughness: .35 }));
  const red = P.mat('red', () => MAT.paint(0xd7262c, { roughness: .4 }));
  const slabM = P.mat('slab', () => new THREE.MeshStandardMaterial({ map: P.tex(concreteCanvas(), { wrap: false }), roughness: .95 }));
  const concrete = P.mat('concrete', () => MAT.std(0x95948f, { roughness: .95 }));
  const steel = P.mat('steel', () => MAT.std(0x3a3f46, { roughness: .45, metalness: .6 }));
  const dark = P.mat('dark', () => MAT.std(0x15171b, { roughness: .9 }));
  const body = P.mat('truck', () => new THREE.MeshStandardMaterial({ color: 0xa3a8ad, roughness: .28, metalness: .85, flatShading: true }));
  const glass = P.mat('glass', () => new THREE.MeshStandardMaterial({ color: 0x0f1318, roughness: .1, metalness: .6 }));
  const lightsM = P.mat('lights', () => new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const decalM = P.mat('decal', () => new THREE.MeshStandardMaterial({ map: P.tex(scorchCanvas(), { wrap: false }), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
  const steamM = steamMaterial(P); P.res.push(steamM);
  const labels = labelAtlas([{ text: 'MARS  →', fg: '#f6f4ee', weight: 900 }, { text: 'LAUNCH PAD 1', fg: '#f6f4ee', weight: 800, fill: .6 }, { text: 'NO STOPPING', fg: '#d7262c', weight: 900, fill: .7 }], 192); P.res.push(labels.tex);
  const labelMat = P.mat('labels', () => new THREE.MeshStandardMaterial({ map: labels.tex, transparent: true, alphaTest: .3, roughness: .6, side: THREE.DoubleSide }));

  // --- the launch pad: a slab x 9..25, z -21..-7.5, top at y 1.2, with its scorched top; a mount ring on four legs
  const SX = 17, SZ = -14.25, SW = 16, SD = 13.5, TOP = 1.2; const RX = 16, RZ = -14.5;
  P.add(concrete, xf(box(SW, 2.6, SD), SX, TOP - 1.3 - .02, SZ)); P.add(slabM, xf(new THREE.PlaneGeometry(SW, SD), SX, TOP, SZ, -HPI));
  P.add(concrete, xf(box(3.2, .4, 1.2), SX - SW / 2 + 1.6, TOP - .2, SZ + SD / 2 + .6)); P.add(concrete, xf(box(3.2, .4, 1.2), SX - SW / 2 + 1.6, TOP - .6, SZ + SD / 2 + 1.8)); P.add(concrete, xf(box(3.2, .4, 1.2), SX - SW / 2 + 1.6, TOP - 1.0, SZ + SD / 2 + 3.0));   // steps down to the plaza side
  P.add(dark, xf(new THREE.CircleGeometry(2.6, 24), RX, TOP + .01, RZ, -HPI));
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + Math.PI / 4; P.add(steel, xf(box(.4, 1.6, .4), RX + Math.cos(a) * 2.1, TOP + .8, RZ + Math.sin(a) * 2.1)); } P.add(steel, xf(new THREE.TorusGeometry(2.05, .22, 8, 28), RX, TOP + 1.6, RZ, HPI));
  // --- the rocket: 17 m of body, red ogive nose, four red fins, three engine bells, an antenna
  const BODY_Y = TOP + 1.7, BODY_H = 17, RR = 1.7;
  P.add(rocketM, xf(new THREE.CylinderGeometry(RR, RR, BODY_H, 28, 1, true), RX, BODY_Y + BODY_H / 2, RZ), true);
  P.add(dark, xf(new THREE.CircleGeometry(RR, 28), RX, BODY_Y, RZ, HPI));
  const ogive = new THREE.LatheGeometry(Array.from({ length: 12 }, (_, i) => { const t = i / 11; return new THREE.Vector2(RR * Math.pow(1 - t, .55) * (1 - t * .05) + (i === 11 ? .001 : 0), t * 5.2); }), 28); P.add(red, xf(ogive, RX, BODY_Y + BODY_H, RZ), true);
  P.add(white, xf(new THREE.TorusGeometry(RR + .05, .1, 6, 28), RX, BODY_Y + BODY_H, RZ, HPI)); P.add(red, xf(cyl(.04, .06, 1.4, 6), RX, BODY_Y + BODY_H + 5.8, RZ)); P.add(white, xf(sph(.14, 8), RX, BODY_Y + BODY_H + 6.5, RZ));
  const finShape = new THREE.Shape([[0, 0], [2.7, 0], [2.7, .9], [.5, 4.2], [0, 4.2]].map(([a, b]) => new THREE.Vector2(a, b)));
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: .28, bevelEnabled: true, bevelThickness: .05, bevelSize: .05, bevelSegments: 2 }); finGeo.translate(0, 0, -.14);
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + Math.PI / 4; P.add(red, xf(finGeo.clone(), RX + Math.cos(a) * (RR - .1), BODY_Y - .3, RZ + Math.sin(a) * (RR - .1), 0, -a), true); }
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; P.add(steel, xf(cyl(.3, .62, 1.1, 14), RX + Math.cos(a) * .85, BODY_Y - .5, RZ + Math.sin(a) * .85)); }
  // --- the gantry: a lattice tower, crane boom over the nose, two swing arms to the body, a beacon on top
  const GX = 21.6, GZ = RZ, GH = 24, GW = 2.6;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.add(steel, xf(box(.22, GH, .22), GX + a * GW / 2, TOP + GH / 2, GZ + b * GW / 2));
  for (let y = TOP + 3; y < TOP + GH; y += 3) { const lvl = Math.round((y - TOP) / 3); const m = lvl % 2 ? red : white;
    for (const [dx, dz, ry] of [[0, -GW / 2, 0], [0, GW / 2, 0], [-GW / 2, 0, HPI], [GW / 2, 0, HPI]]) { P.add(m, xf(box(GW, .14, .14), GX + dx, y, GZ + dz, 0, ry)); P.add(steel, xf(box(Math.hypot(GW, 3), .08, .08), GX + dx, y - 1.5, GZ + dz, 0, ry, (lvl % 2 ? 1 : -1) * Math.atan2(3, GW))); } }
  P.add(steel, xf(box(GW + 1.4, .25, GW + 1.4), GX, TOP + GH + .1, GZ)); P.add(red, xf(box(GW + 1.6, .12, .12), GX, TOP + GH + .8, GZ + GW / 2 + .7)); for (const dz of [-1, 1]) for (const dx of [-1, 0, 1]) P.add(red, xf(box(.08, .7, .08), GX + dx * (GW / 2 + .6), TOP + GH + .5, GZ + dz * (GW / 2 + .7)));
  P.add(steel, xf(box(8.5, .35, .35), GX - 3.2, TOP + GH + 1.2, GZ)); P.add(steel, xf(box(.5, 1.6, .5), GX, TOP + GH + 1.1, GZ)); P.add(steel, xf(cyl(.03, .03, 1.6, 5), RX, BODY_Y + BODY_H + 5.0, RZ)); P.add(steel, xf(box(.3, .3, .3), RX, BODY_Y + BODY_H + 5.9, RZ));
  for (const y of [BODY_Y + 4, BODY_Y + 12]) { P.add(steel, xf(box(GX - GW / 2 - (RX + RR) + .3, .3, .5), (GX - GW / 2 + RX + RR) / 2, y, GZ)); P.add(steel, xf(new THREE.TorusGeometry(RR + .12, .12, 6, 24, Math.PI), RX, y, RZ, HPI, 0, HPI)); }
  // --- fuel tanks on saddles beyond the slab, a pipe to the pad
  for (const z of [-11.5, -15.5]) { if (P.blocked(29, z, 2.8)) continue; P.add(white, xf(cyl(1.1, 1.1, 5, 18), 29, 1.5, z, 0, 0, HPI), true); for (const sd of [-1, 1]) { P.add(red, xf(sph(1.1, 16), 29 + sd * 2.5, 1.5, z, 0, 0, 0, new THREE.Vector3(.45, 1, 1)), true); P.add(steel, xf(box(.5, .6, 2.5), 29 + sd * 1.6, .3, z)); } P.add(steel, xf(cyl(.09, .09, 4, 6), 27, .5, z, 0, 0, HPI)); }
  // --- the second rocket, on its side with a dent, nose toward the plaza; debris and a scorch under it
  { const FX = 33, FZ2 = -6.2, FR = 1.45, FL = 12.5, FY = FR + .45; if (!P.blocked(FX, FZ2, FR + 1)) {
    const g = new THREE.CylinderGeometry(FR, FR, FL, 28, 10, true); xf(g, FX, FY, FZ2, .18, 0, HPI);
    const pos = g.attributes.position, dc = new THREE.Vector3(FX + 1.5, FY + FR, FZ2 - .3), DR = 2.6, DEPTH = .9;
    for (let i = 0; i < pos.count; i++) { _v.fromBufferAttribute(pos, i); const d = _v.distanceTo(dc); if (d < DR) { const f = Math.pow(1 - (d / DR) ** 2, 2); _v.y -= DEPTH * f; _v.z += .25 * f; pos.setXYZ(i, _v.x, _v.y, _v.z); } } g.computeVertexNormals(); P.add(rocketM, g, true);
    const nose = new THREE.LatheGeometry(Array.from({ length: 12 }, (_, i) => { const t = i / 11; return new THREE.Vector2(FR * Math.pow(1 - t, .55) + (i === 11 ? .001 : 0), t * 4.4); }), 28); P.add(red, xf(nose, FX - FL / 2, FY, FZ2, .18, 0, HPI), true); P.add(dark, xf(new THREE.CircleGeometry(FR, 28), FX + FL / 2, FY, FZ2, 0, HPI, 0));
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + .5; const f = finGeo.clone(); xf(f, 0, -FL / 2 + .2, 0); xf(f, (FR - .1) * Math.cos(a), 0, (FR - .1) * Math.sin(a), 0, -a, 0); xf(f, FX, FY, FZ2, .18, 0, HPI); P.add(red, f, true); }
    for (let i = 0; i < 2; i++) { const a = i / 2 * TAU + 1; P.add(steel, xf(cyl(.26, .55, 1.0, 12), FX + FL / 2 + .4, FY + Math.cos(a) * .75, FZ2 + Math.sin(a) * .75, 0, 0, HPI)); }
    P.add(decalM, xf(new THREE.PlaneGeometry(FL + 6, 7), FX, .011, FZ2, -HPI)); for (let k = 0; k < 6; k++) P.add(steel, xf(box(rr(.3, .9), rr(.15, .4), rr(.3, .7)), FX + rr(-8, 8), .15, FZ2 + rr(-3, 3) * (rnd() < .5 ? -1 : 1), rr(0, .5), rr(0, 3), rr(0, .4)), true); } }
  P.add(decalM, xf(new THREE.PlaneGeometry(7, 7), -7, .011, -6.5, -HPI)); P.add(decalM, xf(new THREE.PlaneGeometry(5, 5), 21, .011, 6.5, -HPI));
  // --- the MARS → sign, facing the road, the arrow pointing at the pad
  { const sx = 1.5, sz = -6.6; if (!P.blocked(sx, sz, 1.5)) { for (const dx of [-1.45, 1.45]) P.add(steel, xf(box(.14, 4.2, .14), sx + dx, 2.1, sz), true); P.add(steel, xf(box(3.5, 1.5, .1), sx, 3.5, sz), true); P.add(red, xf(box(3.6, .12, .14), sx, 4.3, sz)); P.add(labelMat, xf(labels.quad(0, 3.3, 3.3 / labels.aspect), sx, 3.55, sz + .07)); P.add(labelMat, xf(labels.quad(1, 2.6, 2.6 / labels.aspect), sx, 2.55, sz + .07)); } }
  // --- the big angular grey truck
  { const tx = 4, tz = 6.5, ry = -.12; if (!P.blocked(tx, tz, 1.4)) { const prof = new THREE.Shape([[2.75, .5], [2.75, .98], [.55, 1.82], [-2.7, 1.22], [-2.7, .5]].map(([a, b]) => new THREE.Vector2(a, b)));
    const bodyGeo = new THREE.ExtrudeGeometry(prof, { depth: 2.2, bevelEnabled: false }); bodyGeo.translate(0, 0, -1.1); P.add(body, xf(bodyGeo, tx, 0, tz, 0, ry), true);
    for (const [dx, dz] of [[1.75, 1.05], [1.75, -1.05], [-1.7, 1.05], [-1.7, -1.05]]) { const w = xf(cyl(.46, .46, .36, 16), 0, 0, 0, HPI); xf(w, dx, .46, dz); xf(w, tx, 0, tz, 0, ry); P.add(dark, w, true); const hub = xf(cyl(.2, .2, .4, 8), 0, 0, 0, HPI); xf(hub, dx, .46, dz); xf(hub, tx, 0, tz, 0, ry); P.add(steel, hub); }
    const ws = xf(new THREE.PlaneGeometry(1.9, .9), 1.68, 1.42, 0, 0, HPI, 0); xf(ws, 0, 0, 0, 0, 0, Math.atan2(1.82 - .98, .55 - 2.75) + Math.PI); P.add(glass, xf(ws, tx, 0, tz, 0, ry));
    for (const sd of [-1, 1]) { const g = xf(box(2.6, .4, .04), -.85, 1.42, sd * 1.12, .0, 0, .0); xf(g, tx, 0, tz, 0, ry); P.add(glass, g); }
    const bar = xf(box(2.0, .07, .07), 2.76, .98, 0); xf(bar, tx, 0, tz, 0, ry); P.add(lightsM, bar); const tail = xf(box(.06, .1, 2.0), -2.72, 1.1, 0); xf(tail, tx, 0, tz, 0, ry); P.add(red, tail);
    for (const sd of [-1, 1]) { const step = xf(box(3.6, .08, .25), 0, .5, sd * 1.2); xf(step, tx, 0, tz, 0, ry); P.add(steel, step); } } }
  for (const bx of [9, 13.5, 18, 22.5]) { if (P.blocked(bx, -3.3, .9)) continue; for (const sd of [-1, 1]) for (const lz of [-.3, .3]) P.add(steel, xf(box(.08, 1.1, .08), bx + sd * .8, .55, -3.3 + lz, lz * .9)); P.add(white, xf(box(2.0, .3, .1), bx, .95, -3.3), true); for (let k = 0; k < 4; k++) P.add(red, xf(box(.25, .32, .12), bx - .75 + k * .5, .95, -3.3, 0, 0, 0)); }
  P.add(labelMat, xf(labels.quad(2, 2.4, 2.4 / labels.aspect), 13.5, .5, -3.0));
  // --- the lights: a chasing ring round the slab, two runway rows into the plaza, the gantry beacon; one instanced mesh
  const L = []; const ringN = 18; for (let i = 0; i < ringN; i++) { const t = i / ringN; const per = 2 * (SW + SD); let d = t * per, x, z; if (d < SW) { x = SX - SW / 2 + d; z = SZ - SD / 2; } else if ((d -= SW) < SD) { x = SX + SW / 2; z = SZ - SD / 2 + d; } else if ((d -= SD) < SW) { x = SX + SW / 2 - d; z = SZ + SD / 2; } else { d -= SW; x = SX - SW / 2; z = SZ + SD / 2 - d; } x = Math.min(SX + SW / 2 - .5, Math.max(SX - SW / 2 + .5, x)); z = Math.min(SZ + SD / 2 - .5, Math.max(SZ - SD / 2 + .5, z)); L.push({ x, y: TOP + .55, z, s: [.22, .22, .22], kind: 'ring', i }); P.add(steel, xf(cyl(.04, .05, .45, 6), x, TOP + .22, z)); }
  for (const zs of [-2.9, 2.9]) for (let x = -33; x <= -5.5; x += 2.5) { if (P.blocked(x, zs, .2)) continue; L.push({ x, y: .09, z: zs, s: [.3, .12, .3], kind: 'run', i: Math.round((x + 33) / 2.5) }); }
  L.push({ x: GX, y: TOP + GH + 2.1, z: GZ, s: [.3, .3, .3], kind: 'beacon', i: 0 });
  const lights = new THREE.InstancedMesh(sph(1, 10), lightsM, L.length); lights.frustumCulled = false; L.forEach((l, k) => { _p.set(l.x, l.y, l.z); _q.identity(); _s.set(l.s[0], l.s[1], l.s[2]); _m.compose(_p, _q, _s); lights.setMatrixAt(k, _m); lights.setColorAt(k, _c.setRGB(.3, .1, .1)); }); P.group.add(lights);
  // --- steam at the rocket's foot: points with their own size and alpha
  const SN = 18; const sgeo = new THREE.BufferGeometry(); const spos = new Float32Array(SN * 3), ssize = new Float32Array(SN), salpha = new Float32Array(SN); const sph0 = Array.from({ length: SN }, () => ({ ph: rnd(), a: rnd() * TAU, r: rr(1.6, 3.2), sp: rr(.09, .14), sw: rnd() * TAU }));
  sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3)); sgeo.setAttribute('aSize', new THREE.BufferAttribute(ssize, 1)); sgeo.setAttribute('aAlpha', new THREE.BufferAttribute(salpha, 1)); const steam = new THREE.Points(sgeo, steamM); steam.frustumCulled = false; P.group.add(steam);
  const COL = { on: { ring: [1.9, .25, .2], run: [1.7, 1.6, 1.3], beacon: [2.2, .2, .1] }, off: { ring: [.25, .08, .08], run: [.35, .32, .25], beacon: [.3, .05, .05] } };
  return (dt, now) => {
    const t = now * .001;
    L.forEach((l, k) => { let on; if (l.kind === 'ring') on = ((l.i - Math.floor(now / 110)) % ringN + ringN) % ringN < 4; else if (l.kind === 'run') on = ((l.i - Math.floor(now / 140)) % 6 + 6) % 6 < 2; else on = (now % 1000) < 450; const c = (on ? COL.on : COL.off)[l.kind]; lights.setColorAt(k, _c.setRGB(c[0], c[1], c[2])); }); lights.instanceColor.needsUpdate = true;
    for (let i = 0; i < SN; i++) { const s = sph0[i]; const life = (t * s.sp + s.ph) % 1; const r = s.r + life * 3.5, y = TOP + .3 + life * 2.6 + Math.sin(t * .7 + s.sw) * .2; const a = s.a + Math.sin(t * .4 + s.sw) * .25;
      spos[i * 3] = RX + Math.cos(a) * r; spos[i * 3 + 1] = y; spos[i * 3 + 2] = RZ + Math.sin(a) * r; ssize[i] = 1.6 + life * 4.2; salpha[i] = Math.min(1, life * 6) * (1 - life) * .9; }
    sgeo.attributes.position.needsUpdate = true; sgeo.attributes.aSize.needsUpdate = true; sgeo.attributes.aAlpha.needsUpdate = true;
  };
}

// =====================================================================================================================
// ELLISON — the Data Harbor (and the place any boss without his own gets). In kid terms: a giant grey building full of
// computers that "remember everything" (big server boxes, rows of blinking lights, humming fans) on the edge of a harbor
// where his yacht is tied up and a racing sailboat leans in the wind. The name on the wall is the boss's own. Grey, white,
// navy, blinking green and blue.
// =====================================================================================================================
function serverCanvas() {   // one rack face, 1 m × 2 m: dark bezel, twelve drive slots, vent grilles
  const [c, g] = canvas(128, 256); g.fillStyle = '#23262c'; g.fillRect(0, 0, 128, 256); g.fillStyle = '#2f333a'; g.fillRect(6, 6, 116, 244);
  for (let i = 0; i < 12; i++) { const y = 14 + i * 19; g.fillStyle = '#1a1c21'; g.fillRect(12, y, 104, 14); g.fillStyle = '#3c414a'; g.fillRect(14, y + 2, 70, 3); g.fillStyle = 'rgba(255,255,255,.06)'; for (let x = 18; x < 80; x += 6) g.fillRect(x, y + 7, 3, 5); }
  speckle(g, 128, 256, 300, .1, true, 1); return c;
}
function dcWallCanvas(hM) {   // one tile = 4 m × the wall's height: pale grey panels with a dark window band
  const [c, g] = canvas(256, 512); g.fillStyle = '#c9ccd1'; g.fillRect(0, 0, 256, 512); g.fillStyle = 'rgba(0,0,0,.12)'; for (let x = 0; x <= 256; x += 64) g.fillRect(x - 1, 0, 2, 512); for (let y = 0; y <= 512; y += 128) g.fillRect(0, y - 1, 256, 2);
  g.fillStyle = '#2a3442'; g.fillRect(0, 150, 256, 70); g.fillStyle = 'rgba(120,200,255,.25)'; g.fillRect(0, 152, 256, 8);
  const gr = g.createLinearGradient(0, 440, 0, 512); gr.addColorStop(0, 'rgba(60,55,50,0)'); gr.addColorStop(1, 'rgba(60,55,50,.35)'); g.fillStyle = gr; g.fillRect(0, 440, 256, 72); speckle(g, 256, 512, 900, .06, false, 2); return c;
}
function waterCanvas() { const [c, g] = canvas(256, 256); g.fillStyle = '#2f6f9a'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(255,255,255,${(.08 + rnd() * .18).toFixed(2)})`; g.lineWidth = 2; const x = rnd() * 256, y = rnd() * 256, l = 10 + rnd() * 30; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 4, x + l, y); g.stroke(); } return c; }
function sailCanvas(name) { const [c, g] = canvas(256, 512); g.fillStyle = '#f7f6f1'; g.fillRect(0, 0, 256, 512); g.fillStyle = 'rgba(0,0,0,.06)'; for (let y = 0; y < 512; y += 48) g.fillRect(0, y, 256, 2); g.fillStyle = '#d7262c'; g.font = `900 120px ${FONT}`; g.textAlign = 'center'; g.fillText(String(name || '1').slice(0, 1).toUpperCase(), 128, 300); return c; }
function buildEllison(P) {
  const name = (P.name || 'HIS').toUpperCase();
  const wallM = P.mat('dcwall', () => new THREE.MeshStandardMaterial({ map: P.tex(dcWallCanvas(12)), roughness: .6, metalness: .2 }));
  const rackM = P.mat('rack', () => new THREE.MeshStandardMaterial({ map: P.tex(serverCanvas(), { wrap: false }), roughness: .5, metalness: .3 }));
  const grey = P.mat('grey', () => MAT.std(0x54595f, { roughness: .55, metalness: .4 }));
  const concrete = P.mat('concrete', () => MAT.std(0x9b9a95, { roughness: .95 }));
  const dark = P.mat('dark', () => MAT.std(0x17191d, { roughness: .9 }));
  const white = P.mat('white', () => MAT.paint(0xf4f3ee, { roughness: .3 }));
  const navy = P.mat('navy', () => MAT.paint(0x1d2b4a, { roughness: .35 }));
  const red = P.mat('red', () => MAT.paint(0xc8202a, { roughness: .45 }));
  const wood = P.mat('wood', () => MAT.std(0x9a7550, { roughness: .9 }));
  const glass = P.mat('glass', () => new THREE.MeshStandardMaterial({ color: 0x1b2633, roughness: .1, metalness: .6 }));
  const water = P.mat('water', () => new THREE.MeshStandardMaterial({ map: P.tex(waterCanvas(), { repeat: [6, 4] }), roughness: .15, metalness: .3, polygonOffset: true, polygonOffsetFactor: -2 }));
  const sailM = P.mat('sail', () => new THREE.MeshStandardMaterial({ map: P.tex(sailCanvas(name), { wrap: false }), roughness: .7, side: THREE.DoubleSide }));
  const lightsM = P.mat('lights', () => new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const labels = labelAtlas([
    { text: name, fg: '#ffffff', bg: '#c8202a', radius: 24, weight: 900 },
    { text: 'IT REMEMBERS EVERYTHING', fg: '#1d2b4a', weight: 800, fill: .55 },
    { text: 'DO NOT UNPLUG', fg: '#f2c230', bg: '#17191d', radius: 18, weight: 900, fill: .6 },
    { text: 'PRIVATE DOCK', fg: '#ffffff', bg: '#1d2b4a', radius: 18, weight: 800, fill: .6 },
  ], 192); P.res.push(labels.tex);
  const labelMat = P.mat('labels', () => new THREE.MeshStandardMaterial({ map: labels.tex, transparent: true, alphaTest: .3, roughness: .6, side: THREE.DoubleSide }));

  // --- the building: x -14..18, z -21..-9, 12 m tall, flat roof with big cooling fans; his name in red over the door
  const FZ = -9, X0 = -14, X1 = 18, D = 12, H = 12, cx = (X0 + X1) / 2, W = X1 - X0;
  P.add(wallM, wall(W, H, 4, H, cx, 0, FZ)); P.add(wallM, wall(D, H, 4, H, X0, 0, FZ - D / 2, -HPI)); P.add(wallM, wall(D, H, 4, H, X1, 0, FZ - D / 2, HPI)); P.add(wallM, wall(W, H, 4, H, cx, 0, FZ - D, Math.PI));
  P.add(concrete, xf(box(W + .5, .5, D + .5), cx, H + .2, FZ - D / 2)); P.add(navy, xf(box(W + .1, .45, .12), cx, 4.1, FZ + .06));
  const fans = []; for (const x of [-9, -2, 5, 12]) { P.add(grey, xf(box(4.4, 1.4, 4.4), x, H + 1.1, FZ - 5)); P.add(dark, xf(cyl(1.75, 1.75, .1, 20), x, H + 1.85, FZ - 5)); fans.push([x, H + 1.95, FZ - 5]); }
  P.add(labelMat, xf(labels.quad(0, 10, 10 / labels.aspect), cx, 9.2, FZ + .1)); P.add(labelMat, xf(labels.quad(1, 14, 14 / labels.aspect), cx, 7.2, FZ + .1));
  P.add(glass, xf(box(4.2, 3.4, .2), cx, 1.7, FZ + .05)); P.add(grey, xf(box(4.8, .3, 1.6), cx, 3.55, FZ + .8)); P.add(labelMat, xf(labels.quad(2, 3.6, 3.6 / labels.aspect), cx, 2.7, FZ + .3));
  // --- the servers: big grey boxes in rows along the wall and round the plaza edges; each with a column of lights
  const L = []; const rack = (x, z, ry = 0, h = 2.2) => { if (P.blocked(x, z, .9)) return false; P.add(rackM, xf(box(1.1, h, 1.0), x, h / 2, z, 0, ry), true); P.add(dark, xf(box(1.2, .12, 1.1), x, h + .06, z, 0, ry));
    const fx = Math.sin(ry) * .52, fz = Math.cos(ry) * .52; for (let i = 0; i < 6; i++) L.push({ x: x + fx + Math.cos(ry) * .38, y: .35 + i * (h - .6) / 5, z: z + fz - Math.sin(ry) * .38, ph: rnd() * 10, sp: rr(2, 7), blue: rnd() < .35 }); return true; };
  for (let x = X0 + 1; x <= X1 - 1; x += 1.3) { if (Math.abs(x - cx) < 3) continue; rack(x, FZ + 1.3, 0); }
  for (const [x, z] of [[-8, -6], [-5.5, -6.2], [8, -6.2], [10.5, -6], [-20, -5.5], [-22, 5.5], [-6.5, 6.4], [-4, 6.6], [24, 6], [26, 6.2]]) rack(x, z, z > 0 ? Math.PI : 0, 1.8);
  // the cables: fat black tubes from the racks across to the building
  for (const x of [-8, 8]) { const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, 1.8, -6), new THREE.Vector3(x, 3.4, -7.5), new THREE.Vector3(x, 4.5, FZ + .1)); P.add(dark, new THREE.TubeGeometry(curve, 10, .07, 6)); }
  // --- the harbor: water beyond the building's right end, a wooden dock out into it, the yacht tied up, a racing sailboat
  const HX0 = 20, HX1 = 44, HZ0 = -24, HZ1 = -6;
  P.add(water, flat(HX1 - HX0, HZ1 - HZ0, (HX0 + HX1) / 2, (HZ0 + HZ1) / 2, .02));
  P.add(concrete, xf(box(HX1 - HX0, .4, .5), (HX0 + HX1) / 2, .2, HZ1 + .25)); P.add(concrete, xf(box(.5, .4, HZ1 - HZ0), HX0 - .25, .2, (HZ0 + HZ1) / 2));
  P.add(wood, xf(box(2.2, .2, 12), 26, .32, -12)); for (let z = -17.5; z <= -6.5; z += 2.2) for (const sx of [-1, 1]) P.add(wood, xf(cyl(.14, .14, 1.2, 8), 26 + sx * 1.0, .1, z));
  P.add(labelMat, xf(labels.quad(3, 3.2, 3.2 / labels.aspect), 26, 1.1, -6.2));
  { // the yacht: long white hull with a navy stripe, three stepped decks, dark windows, a mast with a radar dish
    const yx = 33.5, yz = -13.5; const hull = new THREE.Shape([[-7, 0], [6, 0], [8.2, 1.6], [-7.2, 1.6]].map(([a, b]) => new THREE.Vector2(a, b)));
    const hg = new THREE.ExtrudeGeometry(hull, { depth: 3.4, bevelEnabled: false }); hg.translate(0, -.5, -1.7); P.add(white, xf(hg, yx, 0, yz, 0, HPI), true);
    P.add(navy, xf(box(3.46, .3, 14), yx, .55, yz - .4)); for (let i = 0; i < 3; i++) { const w = 3.0 - i * .5, l = 9 - i * 2.4; P.add(white, xf(box(w, 1.0, l), yx, 1.6 + i * 1.0, yz + 1 + i * .6), true); P.add(glass, xf(box(w + .04, .4, l - .6), yx, 1.7 + i * 1.0, yz + 1 + i * .6)); }
    P.add(grey, xf(cyl(.07, .1, 3, 8), yx, 5.6, yz + 2.4)); P.add(white, xf(sph(.4, 10), yx, 7.2, yz + 2.4)); P.add(red, xf(box(.05, .5, .8), yx, 6.6, yz + 2.7));
  }
  { // the racing sailboat, leaning in the wind
    const sx = 40, sz = -19, lean = -.22; const hull = xf(box(1.4, .7, 6, .2), 0, .25, 0); P.add(navy, xf(hull, sx, 0, sz, 0, 0, lean), true);
    const mast = xf(cyl(.06, .08, 9, 8), 0, 5, 0); P.add(grey, xf(mast, sx, 0, sz, 0, 0, lean));
    const sail = new THREE.BufferGeometry(); sail.setAttribute('position', new THREE.Float32BufferAttribute([0, .8, -.1, 0, 9.2, -.1, 0, .9, -3.6], 3)); sail.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, .5, 1, 1, 0], 2)); sail.computeVertexNormals();
    P.add(sailM, xf(sail, sx, 0, sz, 0, 0, lean));
  }
  // --- lamp posts along the road with little blue lights
  for (const z of [-3.2, 3.2]) for (const x of [-26, -16, -6, 4, 14, 24]) { if (P.blocked(x, z, .4)) continue; P.add(grey, xf(cyl(.06, .08, 3.6, 8), x, 1.8, z), true); P.add(grey, xf(box(.5, .14, .3), x, 3.65, z)); L.push({ x, y: 3.55, z, ph: x * .3, sp: 0, lamp: true }); }
  // the lights: one instanced mesh, blinking like a busy computer
  const lights = new THREE.InstancedMesh(sph(1, 8), lightsM, Math.max(1, L.length)); lights.frustumCulled = false;
  L.forEach((l, k) => { _p.set(l.x, l.y, l.z); _q.identity(); _s.setScalar(l.lamp ? .14 : .05); _m.compose(_p, _q, _s); lights.setMatrixAt(k, _m); lights.setColorAt(k, _c.setRGB(.2, .2, .2)); }); P.group.add(lights);
  // the fan blades: one instanced mesh of crosses that spin
  const blades = new THREE.InstancedMesh(mergeGeometries([box(3.2, .06, .4), box(.4, .06, 3.2)]), dark, fans.length); blades.instanceMatrix.setUsage(THREE.DynamicDrawUsage); blades.frustumCulled = false; P.group.add(blades);
  return (dt, now) => {
    const t = now * .001;
    L.forEach((l, k) => { if (l.lamp) { lights.setColorAt(k, _c.setRGB(.55, .8, 1.1)); return; } const on = Math.sin(t * l.sp + l.ph) > .2; if (l.blue) lights.setColorAt(k, on ? _c.setRGB(.3, .7, 1.4) : _c.setRGB(.05, .1, .25)); else lights.setColorAt(k, on ? _c.setRGB(.3, 1.4, .4) : _c.setRGB(.05, .25, .07)); });
    if (lights.instanceColor) lights.instanceColor.needsUpdate = true;
    fans.forEach(([x, y, z], k) => { _q.setFromAxisAngle(_axisY, t * 4 + k); _p.set(x, y, z); _s.setScalar(1); _m.compose(_p, _q, _s); blades.setMatrixAt(k, _m); }); blades.instanceMatrix.needsUpdate = true;
  };
}

// =====================================================================================================================
// The four built from data (story.place in billionaires.json, 10/31): each the same recipe as the four above, a kid-level
// landmark with his name on it and one thing that moves. Shared bits first.
// =====================================================================================================================
// a rounded-rectangle slab in the xy plane, centred, depth d along z (roundedBox caps its radius at d/2; a phone or a pill needs more)
function slab(w, h, d, r) { r = Math.min(r, w / 2 - .001, h / 2 - .001); const s = new THREE.Shape(), x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -HPI, 0); s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, HPI); s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, HPI, Math.PI); s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 10 }); g.translate(0, 0, -d / 2); return g; }
const lastName = (P) => String(P.name || '').split(' ').pop().toUpperCase();
// a balloon cluster, a confetti shower: Bloomberg's, but written to be reused
function heartGeo(s = 1) { const h = new THREE.Shape(); h.moveTo(0, -.5); h.bezierCurveTo(-.15, -.3, -.55, -.1, -.55, .2); h.bezierCurveTo(-.55, .5, -.2, .58, 0, .32); h.bezierCurveTo(.2, .58, .55, .5, .55, .2); h.bezierCurveTo(.55, -.1, .15, -.3, 0, -.5);
  const g = new THREE.ExtrudeGeometry(h, { depth: .12, bevelEnabled: true, bevelThickness: .04, bevelSize: .04, bevelSegments: 2 }); g.translate(0, 0, -.06); g.scale(s, s, s); return g; }

// =====================================================================================================================
// BLOOMBERG — the Campaign Stage. A huge stage under a lighting truss, a giant screen of his face over it, more screens
// and VOTE billboards round the plaza (every one his face), a scoreboard that says how many places he won (one), and
// red-white-blue balloons and confetti cannons round the heap. Moving: confetti falling, balloons bobbing, lights.
// =====================================================================================================================
function campaignFaceCanvas() {   // the caricature on every screen: big round head, bald on top, grey fringe, navy suit
  const [c, g] = canvas(512, 512); const bg = g.createLinearGradient(0, 0, 0, 512); bg.addColorStop(0, '#2b4fa8'); bg.addColorStop(1, '#14275c'); g.fillStyle = bg; g.fillRect(0, 0, 512, 512);
  g.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 18; i++) { const x = 20 + rnd() * 472, y = 20 + rnd() * 200; if (Math.abs(x - 256) < 150 && y > 90) continue; g.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * TAU - HPI, r = k % 2 ? 5 : 12; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.fill(); }
  g.fillStyle = '#1d2b4a'; g.beginPath(); g.ellipse(256, 560, 240, 175, 0, 0, TAU); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(200, 392); g.lineTo(312, 392); g.lineTo(256, 512); g.fill();
  g.fillStyle = '#c8202a'; g.beginPath(); g.moveTo(244, 404); g.lineTo(268, 404); g.lineTo(276, 470); g.lineTo(256, 512); g.lineTo(236, 470); g.fill();
  const skin = '#efc4a2'; g.fillStyle = skin; g.beginPath(); g.ellipse(146, 248, 26, 40, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(366, 248, 26, 40, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(256, 236, 112, 146, 0, 0, TAU); g.fill(); g.fillRect(222, 360, 68, 40);
  g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.ellipse(216, 136, 44, 22, -.45, 0, TAU); g.fill();
  g.fillStyle = '#c4c4c8'; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(256 + sd * 104, 222, 20, 60, sd * .12, 0, TAU); g.fill(); }
  g.strokeStyle = '#9a9aa0'; g.lineWidth = 9; g.lineCap = 'round'; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(256 + sd * 22, 196); g.lineTo(256 + sd * 70, 188); g.stroke(); }
  g.fillStyle = '#2a2420'; for (const sd of [-1, 1]) { g.beginPath(); g.arc(256 + sd * 46, 222, 9, 0, TAU); g.fill(); }
  g.strokeStyle = '#b98a6a'; g.lineWidth = 6; g.beginPath(); g.moveTo(256, 236); g.quadraticCurveTo(246, 280, 262, 286); g.stroke();
  g.strokeStyle = '#7a3a2a'; g.lineWidth = 8; g.beginPath(); g.moveTo(206, 318); g.quadraticCurveTo(256, 356, 306, 318); g.stroke();
  return c;
}
function buildBloomberg(P) {
  const name = lastName(P) || 'HIS';
  const navy = P.mat('navy', () => MAT.paint(0x1d2b6a, { roughness: .45 }));
  const white = P.mat('white', () => MAT.paint(0xf4f3ee, { roughness: .4 }));
  const red = P.mat('red', () => MAT.paint(0xc8202a, { roughness: .45 }));
  const steel = P.mat('steel', () => MAT.std(0x4a4f57, { roughness: .45, metalness: .6 }));
  const dark = P.mat('dark', () => MAT.std(0x16181c, { roughness: .9 }));
  const wood = P.mat('wood', () => MAT.std(0x6b4a30, { roughness: .8 }));
  const faceTex = P.tex(campaignFaceCanvas(), { wrap: false }); const face = P.mat('face', () => new THREE.MeshStandardMaterial({ map: faceTex, roughness: .5, emissive: 0xffffff, emissiveMap: faceTex, emissiveIntensity: .55 }));   // the screens glow
  const lightsM = P.mat('lights', () => new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const labels = labelAtlas([
    { text: name, fg: '#ffffff', bg: '#1d2b6a', radius: 24, weight: 900 },
    { text: 'VOTE', fg: '#ffffff', bg: '#c8202a', radius: 24, weight: 900 },
    { text: 'PLACES WON: 1', fg: '#f2c230', bg: '#16181c', radius: 18, weight: 900, fill: .6 },
    { text: 'AMERICAN SAMOA', fg: '#ffffff', bg: '#16181c', radius: 18, weight: 800, fill: .5 },
    { text: `${name} 2020`, fg: '#ffffff', bg: '#c8202a', radius: 18, weight: 900, fill: .65 },
  ], 192); P.res.push(labels.tex);
  const labelMat = P.mat('labels', () => new THREE.MeshStandardMaterial({ map: labels.tex, transparent: true, alphaTest: .3, roughness: .6, side: THREE.DoubleSide }));

  // --- the backdrop hall: x -10..24, z -21..-14, 13 m; the stage in front of it, z -14..-9, 1.4 m high
  const BZ = -14, X0 = -10, X1 = 24, D = 7, H = 13, cx = (X0 + X1) / 2, W = X1 - X0, SH = 1.4;
  P.add(navy, xf(box(W, H, D), cx, H / 2, BZ - D / 2)); P.add(red, xf(box(W + .1, .6, D + .1), cx, H - .3, BZ - D / 2)); P.add(white, xf(box(W + .12, .25, D + .12), cx, H - .75, BZ - D / 2));
  for (let i = 0; i < 9; i++) P.add(white, xf(box(W / 9 - .5, 1.6, .06), X0 + (i + .5) * W / 9, 1.6 / 2 + .1, BZ + .03));   // white bunting panels along the foot
  P.add(wood, xf(box(26, SH, 5), 7, SH / 2, BZ + 2.5), true); P.add(navy, wall(26, SH, 2, SH, 7, 0, BZ + 5.01)); P.add(white, xf(box(26.2, .12, .2), 7, SH, BZ + 5));
  for (let i = 0; i < 4; i++) P.add(wood, xf(box(.5, .35 * (i + 1), 3), -6.25 - (3 - i) * .5, .175 * (i + 1), BZ + 2.5), true);   // steps up the west end
  // the giant screen of his face, the banner under it, two more screens on the truss towers
  P.add(dark, xf(box(11.4, 11.4, .5), cx, 7.5, BZ + .2)); P.add(face, xf(new THREE.PlaneGeometry(10.6, 10.6), cx, 7.5, BZ + .48));
  P.add(labelMat, xf(labels.quad(4, 12, 12 / labels.aspect), cx, 1.9 + 12 / labels.aspect / 2, BZ + .5));
  // the truss: two lattice towers at the stage ends and a beam across, spotlights on the beam
  const TY = 12.5, towers = [-5, 19];
  for (const tx of towers) { const tz = BZ + 4; for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.add(steel, xf(box(.14, TY, .14), tx + a * .5, TY / 2, tz + b * .5)); for (let y = 1; y < TY; y += 1.2) { P.add(steel, xf(box(1, .06, .06), tx, y, tz - .5)); P.add(steel, xf(box(1, .06, .06), tx, y, tz + .5)); P.add(steel, xf(box(.06, .06, 1), tx - .5, y, tz)); P.add(steel, xf(box(.06, .06, 1), tx + .5, y, tz)); }
    P.add(dark, xf(box(5.2, 3.2, .3), tx, 8.6, tz + .7)); P.add(face, xf(new THREE.PlaneGeometry(4.8, 4.8 * .62).translate(0, 0, 0), tx, 8.6, tz + .87)); }
  { const tz = BZ + 4; for (const dz of [-.5, .5]) for (const dy of [0, 1]) P.add(steel, xf(box(towers[1] - towers[0] + 1, .1, .1), (towers[0] + towers[1]) / 2, TY + dy, tz + dz)); for (let x = towers[0]; x <= towers[1]; x += 1.2) P.add(steel, xf(box(.06, 1, .06), x, TY + .5, tz - .5)); }
  const L = []; for (let i = 0; i < 8; i++) { const x = towers[0] + 2 + i * 2.25, z = BZ + 4.6; P.add(dark, xf(cyl(.28, .36, .7, 10), x, TY - .5, z, .7), true); L.push({ x, y: TY - .78, z: z + .25, i }); }
  // the lectern at the front of the stage, VOTE on it, and a megaphone on the lectern
  P.add(navy, xf(box(1.4, 1.5, .8, .05), cx, SH + .75, BZ + 4), true); P.add(labelMat, xf(labels.quad(1, 1.2, 1.2 / labels.aspect), cx, SH + 1.0, BZ + 4.41));
  P.add(white, xf(cyl(.12, .45, 1.0, 14), cx + .3, SH + 1.75, BZ + 4.1, 0, 0, HPI - .3), true);
  // the scoreboard: how many places he won
  { const sx = 20.5, sz = BZ + .9; P.add(dark, xf(box(7.2, 3.6, .4), sx, SH + 7.6, sz)); P.add(labelMat, xf(labels.quad(2, 6.6, 6.6 / labels.aspect), sx, SH + 8.3, sz + .22)); P.add(labelMat, xf(labels.quad(3, 6.0, 6.0 / labels.aspect), sx, SH + 6.8, sz + .22)); }
  // confetti cannons on the stage corners
  for (const x of [-3, 17]) { P.add(red, xf(cyl(.35, .45, 1.6, 12), x, SH + .9, BZ + 4.3, -.5, 0, x < cx ? -.4 : .4), true); P.add(dark, xf(box(.9, .4, .9), x, SH + .2, BZ + 4.3), true); }
  // VOTE billboards round the plaza: his face on two posts, VOTE under it
  const billboard = (x, z, ry) => { const put = (geo, m, cast) => P.add(m, xf(geo, x, 0, z, 0, ry), cast); for (const sd of [-1, 1]) put(xf(box(.18, 4.4, .18), sd * 1.5, 2.2, -.12), steel, true); put(xf(box(3.8, 3.0, .16), 0, 3.6, -.12), dark, true); put(xf(new THREE.PlaneGeometry(1.9, 1.9), -.85, 3.65, -.03), face, false); put(xf(labels.quad(1, 1.7, 1.7 / labels.aspect), .95, 3.9, -.03), labelMat, false); put(xf(labels.quad(0, 1.7, 1.7 / labels.aspect), .95, 3.2, -.03), labelMat, false); };
  for (const [cands, ry] of [[[[-12, -6], [-14, -6.2]], -.93], [[[-20, 5.6], [-22, 6]], -2.21], [[[27, -5.8], [29, -6]], -.93]]) { const s = P.spot(cands, 2, 'billboard'); if (s) billboard(s[0], s[1], ry); }
  // lawn signs on stakes along both road edges
  for (const z of [-3.1, 3.1]) for (let x = -30; x <= 28; x += 4.5) { if (P.blocked(x, z, .4)) continue; P.add(wood, xf(box(.06, .9, .06), x, .45, z)); P.add(labelMat, xf(labels.quad(Math.abs(Math.round(x / 4.5)) % 2, .9, .9 / labels.aspect), x, .9, z, 0, -HPI)); }
  // balloons: clusters round the heap and on the stage ends, one instanced mesh, bobbing on strings
  const B = []; const cluster = (x, z, y0) => { for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + rnd(), r = k ? .55 : 0; B.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, y: y0 + 2.6 + rnd() * .9 + (k ? 0 : .7), col: [0xc8202a, 0xf4f3ee, 0x2b4fa8][k % 3], ph: rnd() * TAU }); } P.add(steel, xf(cyl(.02, .02, 2.6, 4), x, y0 + 1.3, z)); P.add(dark, xf(box(.4, .2, .4), x, y0 + .1, z)); };
  if (P.heap) { const hx = P.heap.x, hz = P.heap.z, rr2 = P.heapR + 2.2; for (let k = 0; k < 7; k++) { const a = Math.PI + (k / 6 - .5) * 2.6; const x = hx + Math.cos(a) * rr2, z = hz + Math.sin(a) * rr2; if (!P.blocked(x, z, .6)) cluster(x, z, 0); } }
  for (const x of [-6.5, 20.5]) cluster(x, BZ + 1.2, SH);
  const balloons = new THREE.InstancedMesh(xf(sph(.42, 14), 0, 0, 0, 0, 0, 0, new THREE.Vector3(1, 1.18, 1)), P.mat('balloon', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .3, metalness: .05 })), Math.max(1, B.length)); balloons.instanceMatrix.setUsage(THREE.DynamicDrawUsage); balloons.castShadow = true; balloons.frustumCulled = false; B.forEach((b, k) => balloons.setColorAt(k, _c.setHex(b.col))); P.group.add(balloons);
  // the spotlights' bulbs
  const lights = new THREE.InstancedMesh(sph(1, 10), lightsM, L.length); lights.frustumCulled = false; L.forEach((l, k) => { _p.set(l.x, l.y, l.z); _q.identity(); _s.setScalar(.22); _m.compose(_p, _q, _s); lights.setMatrixAt(k, _m); lights.setColorAt(k, _c.setRGB(1, 1, 1)); }); P.group.add(lights);
  // confetti: points falling over the stage and the plaza, recycled at the top
  const CN = 420, cpos = new Float32Array(CN * 3), ccol = new Float32Array(CN * 3), cv = [];
  const PAL = [[.85, .15, .18], [1, 1, 1], [.2, .35, .85], [.98, .78, .2]];
  for (let i = 0; i < CN; i++) { cpos[i * 3] = rr(-8, 26); cpos[i * 3 + 1] = rr(1, 16); cpos[i * 3 + 2] = rr(-12, -3.5); const p = PAL[i % 4]; ccol.set(p, i * 3); cv.push({ v: rr(.8, 1.6), sw: rnd() * TAU }); }
  const cgeo = new THREE.BufferGeometry(); cgeo.setAttribute('position', new THREE.BufferAttribute(cpos, 3)); cgeo.setAttribute('color', new THREE.BufferAttribute(ccol, 3));
  const cmat = new THREE.PointsMaterial({ size: .16, vertexColors: true, sizeAttenuation: true }); P.res.push(cmat); const confetti = new THREE.Points(cgeo, cmat); confetti.frustumCulled = false; P.group.add(confetti);
  return (dt, now) => {
    const t = now * .001;
    B.forEach((b, k) => { _p.set(b.x + Math.sin(t * .9 + b.ph) * .06, b.y + Math.sin(t * 1.3 + b.ph) * .14, b.z); _q.setFromAxisAngle(_axisY, b.ph); _s.setScalar(1); _m.compose(_p, _q, _s); balloons.setMatrixAt(k, _m); }); balloons.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < CN; i++) { const c = cv[i]; let y = cpos[i * 3 + 1] - c.v * dt; if (y < .05) { y = 16; cpos[i * 3] = rr(-8, 26); cpos[i * 3 + 2] = rr(-12, -3.5); } cpos[i * 3 + 1] = y; cpos[i * 3] += Math.sin(t * 2 + c.sw) * dt * .5; } cgeo.attributes.position.needsUpdate = true;
    L.forEach((l, k) => { const on = ((l.i + Math.floor(now / 300)) % 4) < 2; lights.setColorAt(k, on ? _c.setRGB(1.8, 1.7, 1.3) : _c.setRGB(.35, .33, .3)); }); lights.instanceColor.needsUpdate = true;
  };
}

// =====================================================================================================================
// WALTON — the Superstore. A long blue-and-grey big box with his name on the band, glass doors, shelves stacked to the
// sky out front, a checkout lane with its belt running, rows of shopping carts, a parking lot, and the big smiley price
// sign by the heap. Blue, grey, yellow. Moving: the checkout belt and the things riding it.
// =====================================================================================================================
function storeWallCanvas() {   // one tile = 4 m × 10 m: pale ribbed panels, a deep blue band across the top third
  const [c, g] = canvas(256, 640); g.fillStyle = '#d9dbdd'; g.fillRect(0, 0, 256, 640); for (let x = 0; x < 256; x += 16) { g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(x, 0, 3, 640); }
  g.fillStyle = '#1a5fb4'; g.fillRect(0, 0, 256, 220); g.fillStyle = '#0f3f80'; g.fillRect(0, 214, 256, 10); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 6, 256, 6);
  const gr = g.createLinearGradient(0, 560, 0, 640); gr.addColorStop(0, 'rgba(60,55,50,0)'); gr.addColorStop(1, 'rgba(60,55,50,.35)'); g.fillStyle = gr; g.fillRect(0, 560, 256, 80); speckle(g, 256, 640, 700, .06, false, 2); return c;
}
function smileySignCanvas() { const [c, g] = canvas(512, 512); g.fillStyle = '#f5c400'; g.beginPath(); g.arc(256, 256, 250, 0, TAU); g.fill(); g.lineWidth = 14; g.strokeStyle = '#d9a600'; g.stroke();
  g.fillStyle = '#3a2a00'; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(256 + sd * 80, 190, 26, 44, 0, 0, TAU); g.fill(); }
  g.strokeStyle = '#3a2a00'; g.lineWidth = 30; g.lineCap = 'round'; g.beginPath(); g.arc(256, 250, 150, .2 * Math.PI, .8 * Math.PI); g.stroke(); return c; }
function cartAt(P, wire, handle, dark, x, z, ry, s = 1) {   // a shopping cart, handle to -x local, ~1.1 m tall at s = 1
  const put = (geo, m, cast = true) => P.add(m, xf(geo, x, 0, z, 0, ry, 0, s), cast);
  put(xf(box(1.0, .04, .62), 0, .55, 0), wire); for (const sd of [-1, 1]) put(xf(box(1.0, .5, .03), 0, .8, sd * .3), wire); put(xf(box(.03, .5, .62), .5, .8, 0), wire); put(xf(box(.03, .55, .62), -.5, .82, 0), wire);
  put(xf(cyl(.035, .035, .66, 8), -.62, 1.12, 0, HPI), handle); for (const sd of [-1, 1]) put(xf(box(.03, .3, .03), -.56, .98, sd * .3, 0, 0, -.3), wire);
  for (const [dx, dz] of [[-.42, -.26], [-.42, .26], [.42, -.26], [.42, .26]]) { put(xf(box(.04, .5, .04), dx, .3, dz), wire, false); put(xf(cyl(.07, .07, .05, 10), dx, .07, dz, HPI), dark); }
}
function buildWalton(P) {
  const name = lastName(P) || 'HIS';
  const wallM = P.mat('storewall', () => new THREE.MeshStandardMaterial({ map: P.tex(storeWallCanvas()), roughness: .6, metalness: .15 }));
  const blue = P.mat('blue', () => MAT.paint(0x1a5fb4, { roughness: .4 }));
  const yellow = P.mat('yellow', () => MAT.paint(0xf5c400, { emissive: 0x3a2a00, emissiveIntensity: .25 }));
  const concrete = P.mat('concrete', () => MAT.std(0x9b9a95, { roughness: .95 }));
  const asphalt = P.mat('asphalt', () => new THREE.MeshStandardMaterial({ color: 0x3d3e42, roughness: .95, polygonOffset: true, polygonOffsetFactor: -1 }));
  const paint = P.mat('paint', () => new THREE.MeshStandardMaterial({ color: 0xf4f3ee, roughness: .9, polygonOffset: true, polygonOffsetFactor: -2 }));
  const steel = P.mat('steel', () => MAT.std(0x9aa3ad, { roughness: .4, metalness: .6 }));
  const dark = P.mat('dark', () => MAT.std(0x17191d, { roughness: .9 }));
  const glass = P.mat('glass', () => new THREE.MeshStandardMaterial({ color: 0x24384f, roughness: .1, metalness: .6 }));
  const orange = P.mat('orange', () => MAT.paint(0xf08a2c));
  const smileM = P.mat('smiley', () => new THREE.MeshStandardMaterial({ map: P.tex(smileySignCanvas(), { wrap: false }), transparent: true, alphaTest: .3, roughness: .5, emissive: 0x332600, emissiveIntensity: .3, side: THREE.DoubleSide }));
  const beltM = P.mat('belt', () => new THREE.MeshStandardMaterial({ map: P.tex(beltCanvas()), roughness: .9 }));
  const goods = P.mat('goods', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .7 }));
  const labels = labelAtlas([
    { text: name, fg: '#ffffff', weight: 900 },
    { text: 'WELCOME', fg: '#ffffff', bg: '#0f3f80', radius: 18, weight: 800, fill: .6 },
    { text: 'LOW PRICES!', fg: '#1a5fb4', bg: '#ffffff', radius: 22, weight: 900, fill: .7 },
    { text: 'CHECKOUT 1', fg: '#ffffff', bg: '#1a5fb4', radius: 18, weight: 800, fill: .6 },
    { text: 'CARTS', fg: '#ffffff', bg: '#0f3f80', radius: 18, weight: 800, fill: .6 },
  ], 192); P.res.push(labels.tex);
  const labelMat = P.mat('labels', () => new THREE.MeshStandardMaterial({ map: labels.tex, transparent: true, alphaTest: .3, roughness: .6, side: THREE.DoubleSide }));

  // --- the store: x -14..28, z -22..-9, 10 m, flat roof; the name huge on the blue band, two glass entrances
  const FZ = -9, X0 = -14, X1 = 28, D = 13, H = 10, cx = (X0 + X1) / 2, W = X1 - X0;
  P.add(wallM, wall(W, H, 4, H, cx, 0, FZ)); P.add(wallM, wall(D, H, 4, H, X0, 0, FZ - D / 2, -HPI)); P.add(wallM, wall(D, H, 4, H, X1, 0, FZ - D / 2, HPI)); P.add(wallM, wall(W, H, 4, H, cx, 0, FZ - D, Math.PI));
  P.add(concrete, xf(box(W + .5, .5, D + .5), cx, H + .2, FZ - D / 2)); P.add(blue, xf(box(W + .3, .6, .4), cx, H + .5, FZ + .1));
  P.add(labelMat, xf(labels.quad(0, 18, 18 / labels.aspect), 7, 8.2, FZ + .1));
  P.add(smileM, xf(new THREE.PlaneGeometry(2.6, 2.6), 17.8, 8.2, FZ + .1));   // the smiley beside the name
  const doorsX = [-2, 16];
  for (const dx of doorsX) { P.add(glass, xf(box(5.4, 3.6, .2), dx, 1.8, FZ + .05)); P.add(steel, xf(box(.12, 3.6, .3), dx, 1.8, FZ + .1)); for (const sd of [-1, 1]) P.add(blue, xf(box(.6, 4.4, .8), dx + sd * 3, 2.2, FZ + .3), true); P.add(blue, xf(box(7, .6, 2.4), dx, 4.4, FZ + 1.1)); P.add(labelMat, xf(labels.quad(1, 3.6, 3.6 / labels.aspect), dx, 4.4, FZ + 2.32)); }
  P.add(concrete, xf(box(W, .18, 3.0), cx, .09, FZ + 1.5));   // the sidewalk along the front
  // --- shelves stacked to the sky: tall shelf units against the wall between the doors and at the ends, boxes of every colour
  const G = []; const shelf = (x, z, ry, levels = 7, len = 4) => { const cs = Math.cos(ry), sn = Math.sin(ry); const at = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
    for (const lx of [-len / 2, len / 2]) { const [ux, uz] = at(lx, 0); P.add(orange, xf(box(.14, levels * 1.05 + .3, .9), ux, (levels * 1.05 + .3) / 2, uz, 0, ry), true); }
    for (let l = 0; l < levels; l++) { const y = .25 + l * 1.05; const [sx, sz] = at(0, 0); P.add(steel, xf(box(len, .06, .9), sx, y, sz, 0, ry));
      for (let k = 0; k < Math.round(len / .55); k++) { if (rnd() < .15) continue; const w = rr(.32, .5), h = rr(.4, .85); const [bx, bz] = at(-len / 2 + .3 + k * .55, rr(-.15, .15)); G.push({ x: bx, y: y + .03 + h / 2, z: bz, w, h, d: rr(.3, .6), ry: ry + rr(-.08, .08), col: [0xe8384f, 0x1a5fb4, 0xf5c400, 0x2fa84f, 0xf08a2c, 0x8e5bd6, 0xf4f3ee][(rnd() * 7) | 0] }); } } };
  for (const x of [4.5, 8.5, 11, -9, 23]) shelf(x, FZ + .75, 0, x === 8.5 ? 8 : 7, 3.4);
  for (const [x, z, ry] of [[-21, -6.2, 0], [-26, -6.2, 0], [-22, 6.2, Math.PI]]) if (!P.blocked(x, z, 2.3)) shelf(x, z, ry, 4, 4);
  // --- the checkout lane at the plaza edge: a counter, a belt that runs, a register, a lane light
  const CX = -11.5, CZ = -6.6, CL = 4.4; let lane = !P.blocked(CX, CZ, 2.3);
  if (lane) { P.add(blue, xf(box(CL, .9, .9, .04), CX, .45, CZ), true); P.add(steel, xf(box(CL + .1, .05, 1.0), CX, .92, CZ)); const bg = new THREE.PlaneGeometry(CL - .4, .62); const uv = bg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (CL - .4) / 1.2, uv.getY(i)); P.add(beltM, xf(bg, CX, .955, CZ, -HPI));
    P.add(dark, xf(box(.7, .5, .6, .04), CX + CL / 2 + .1, 1.2, CZ), true); P.add(glass, xf(box(.5, .35, .04), CX + CL / 2 + .1, 1.6, CZ + .2, -.4)); P.add(steel, xf(cyl(.04, .04, 2.4, 6), CX - CL / 2 + .2, 1.2, CZ - .35)); P.add(labelMat, xf(labels.quad(3, 1.8, 1.8 / labels.aspect), CX - CL / 2 + .2, 2.55, CZ - .35)); }
  // --- carts: a corral of nested carts, a few loose ones; the big smiley price sign on its pole, by the heap
  const cartBlue = P.mat('cartblue', () => MAT.paint(0x1a5fb4)); const wire = steel;
  { const s = P.spot([[24, -5.8], [26, -6], [-17, -5.6]], 2.2, 'cart corral'); if (s) { for (let k = 0; k < 6; k++) cartAt(P, wire, cartBlue, dark, s[0] - 2 + k * .62, s[1], 0); P.add(steel, xf(box(4.6, .08, .08), s[0] - .5, 1.0, s[1] - .5)); P.add(steel, xf(box(4.6, .08, .08), s[0] - .5, 1.0, s[1] + .5)); P.add(labelMat, xf(labels.quad(4, 1.6, 1.6 / labels.aspect), s[0] - 3.2, 1.5, s[1], 0, -HPI)); P.add(steel, xf(box(.08, 1.5, .08), s[0] - 3.1, .75, s[1])); } }
  for (const [x, z, ry] of [[-7.5, 6.4, 2.6], [10.5, 5.6, -.5], [-16, -4.2, .4]]) if (!P.blocked(x, z, .8)) cartAt(P, wire, cartBlue, dark, x, z, ry);
  { const s = P.spot([[P.heap ? P.heap.x - P.heapR - 3 : 12, 5.6], [12, 5.6], [27, 5.6], [30, -5.6]], .8, 'smiley sign'); if (s) { const [x, z] = s; P.add(steel, xf(cyl(.18, .24, 7.5, 10), x, 3.75, z), true); P.add(yellow, xf(cyl(2.05, 2.05, .25, 32), x, 8.6, z, 0, 0, HPI), true); P.add(smileM, xf(new THREE.PlaneGeometry(4, 4), x - .14, 8.6, z, 0, -HPI)); P.add(smileM, xf(new THREE.PlaneGeometry(4, 4), x + .14, 8.6, z, 0, HPI)); P.add(labelMat, xf(labels.quad(2, 3.6, 3.6 / labels.aspect), x - .2, 5.9, z, 0, -HPI)); P.add(blue, xf(box(.1, 1.0, 3.8), x, 5.9, z)); } }
  // --- the parking lot: asphalt with white bays west of the plaza, both sides of the road
  for (const sd of [-1, 1]) { const z0 = sd * 3.0, z1 = sd * 8.2, zc = (z0 + z1) / 2; if (sd > 0) continue; P.add(asphalt, flat(18, Math.abs(z1 - z0), -26, zc, .015)); for (let x = -34; x <= -17; x += 2.6) P.add(paint, flat(.12, 4.2, x, zc, .02)); }
  for (const [x, z, ry, col] of [[-30.7, -5.6, HPI, 0xc8202a], [-22.9, -5.7, HPI + .05, 0xf4f3ee]]) { const car = P.mat(`car${col}`, () => MAT.paint(col, { roughness: .3 })); P.add(car, xf(box(1.8, .7, 3.8, .2), x, .55, z, 0, ry - HPI), true); P.add(car, xf(box(1.6, .6, 2.0, .2), x, 1.15, z, 0, ry - HPI), true); P.add(glass, xf(box(1.62, .45, 1.9), x, 1.18, z, 0, ry - HPI)); for (const [a, b] of [[-.8, -1.2], [.8, -1.2], [-.8, 1.2], [.8, 1.2]]) P.add(dark, xf(cyl(.34, .34, .25, 12), x + a, .34, z + b, 0, 0, HPI)); }
  // the shelf goods and the belt's riders: one instanced mesh, the belt's tail moves
  const BN = 6, goodsMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), goods, G.length + BN); goodsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); goodsMesh.castShadow = true; goodsMesh.receiveShadow = true; goodsMesh.frustumCulled = false; P.group.add(goodsMesh);
  G.forEach((b, i) => { _q.setFromAxisAngle(_axisY, b.ry); _s.set(b.w, b.h, b.d); _p.set(b.x, b.y, b.z); _m.compose(_p, _q, _s); goodsMesh.setMatrixAt(i, _m); goodsMesh.setColorAt(i, _c.setHex(b.col)); });
  const riders = Array.from({ length: BN }, (_, k) => ({ o: k / BN, w: rr(.25, .45), h: rr(.2, .5), col: [0xe8384f, 0xf5c400, 0x2fa84f, 0xf4f3ee, 0x8e5bd6, 0xf08a2c][k] }));
  riders.forEach((r, k) => goodsMesh.setColorAt(G.length + k, _c.setHex(r.col)));
  let beltS = 0; const BV = .6, run = CL - .8;
  return (dt) => {
    beltS += BV * dt; beltM.map.offset.x = -(beltS / 1.2) % 1;
    riders.forEach((r, k) => { const f = (r.o + beltS / run) % 1; if (lane) { _p.set(CX - run / 2 + f * run, .96 + r.h / 2, CZ); _s.set(r.w, r.h, r.w); } else { _p.set(0, -5, 0); _s.setScalar(.01); } _q.identity(); _m.compose(_p, _q, _s); goodsMesh.setMatrixAt(G.length + k, _m); });
    goodsMesh.instanceMatrix.needsUpdate = true;
  };
}

// =====================================================================================================================
// ZUCKERBERG — the Giant Phone. A phone as tall as a tower stands on the -z side, its feed scrolling forever; app icons
// as big as houses are stacked into stairs round the plaza (made-up icons: a seed, a paw, a wheel, a cloud, a star, a heart; no
// real app logo or colour); the two apps he bought sit up front with BOUGHT stamped on them (no price tags: no money figures on
// screen; the real story is on the sources page). Moving: the feed scrolls and hearts float up.
// =====================================================================================================================
function feedCanvas() {   // one tile = three posts; wraps vertically so the feed never ends
  const [c, g] = canvas(512, 1024); g.fillStyle = '#eef0f4'; g.fillRect(0, 0, 512, 1024);
  const pics = [['#8ad0ff', '#4caf50', '#f5c400'], ['#ffd2a8', '#c8202a', '#1a5fb4'], ['#b8e0c8', '#8e5bd6', '#f08a2c']];
  for (let i = 0; i < 3; i++) { const y = 18 + i * 340; g.fillStyle = '#ffffff'; roundRect(g, 24, y, 464, 318, 22); g.fill();
    g.fillStyle = ['#7b3fc4', '#e8384f', '#f2c230'][i]; g.beginPath(); g.arc(70, y + 40, 22, 0, TAU); g.fill(); g.fillStyle = '#c9ccd2'; roundRect(g, 104, y + 28, 180, 12, 6); g.fill(); roundRect(g, 104, y + 46, 110, 10, 5); g.fill();
    const [sky, a, b] = pics[i]; g.fillStyle = sky; g.fillRect(40, y + 76, 432, 180); g.fillStyle = a; g.beginPath(); g.moveTo(40, y + 256); g.lineTo(190, y + 130); g.lineTo(330, y + 256); g.fill(); g.fillStyle = b; g.beginPath(); g.arc(400, y + 120, 28, 0, TAU); g.fill();
    g.fillStyle = '#e8384f'; g.beginPath(); const hx = 64, hy = y + 286; g.moveTo(hx, hy + 12); g.bezierCurveTo(hx - 22, hy - 2, hx - 12, hy - 18, hx, hy - 6); g.bezierCurveTo(hx + 12, hy - 18, hx + 22, hy - 2, hx, hy + 12); g.fill();
    g.fillStyle = '#c9ccd2'; roundRect(g, 96, y + 280, 90, 12, 6); g.fill(); }
  return c;
}
function buildZuckerberg(P) {
  const name = lastName(P) || 'HIS';
  const body = P.mat('phone', () => MAT.std(0x1b1d22, { roughness: .35, metalness: .5 }));
  const rim = P.mat('rim', () => MAT.std(0x9aa3ad, { roughness: .3, metalness: .8 }));
  const feedTex = P.tex(feedCanvas()); const feed = P.mat('feed', () => new THREE.MeshStandardMaterial({ map: feedTex, roughness: .4, emissive: 0xffffff, emissiveMap: feedTex, emissiveIntensity: .45 }));
  const glyphs = iconAtlas(); const glyphTex = P.tex(glyphs.c, { wrap: false }); const glyphM = P.mat('glyphs', () => new THREE.MeshStandardMaterial({ map: glyphTex, transparent: true, alphaTest: .3, roughness: .4, polygonOffset: true, polygonOffsetFactor: -2 }));
  const glyphQuad = (i, s) => atlasQuad(s, s, 1 - (i + 1) / glyphs.n, 1 - i / glyphs.n);
  const ICON = [0xf2c230, 0xa8743f, 0x3a7bd5, 0x7cc8ee, 0xf28c28, 0xe8384f];   // made-up icons in the palette: seed, paw, wheel, cloud, star, heart
  const iconM = ICON.map((col, i) => P.mat(`icon${i}`, () => MAT.paint(col, { roughness: .35 })));
  const white = P.mat('white', () => MAT.paint(0xf4f3ee, { roughness: .4 }));
  const heartM = P.mat('heart', () => MAT.paint(0xe8384f, { emissive: 0x7a0010, emissiveIntensity: .5 }));
  const labels = labelAtlas([
    { text: name, fg: '#ffffff', bg: '#7b3fc4', radius: 0, weight: 900, fill: .6 },
    { text: 'BOUGHT!', fg: '#ffffff', bg: '#c8202a', radius: 22, weight: 900, fill: .7 },
  ], 192); P.res.push(labels.tex);
  const labelMat = P.mat('labels', () => new THREE.MeshStandardMaterial({ map: labels.tex, transparent: true, alphaTest: .3, roughness: .6, side: THREE.DoubleSide }));

  // --- the phone: 15 × 30 m, standing on its edge at z -13, leaning back a little; feed screen, his name as the app bar
  const PX = 6, PZ = -13, PW = 15, PH = 30, PD = 1.4, LEAN = -.09;
  const put = (m, geo, cast = false) => P.add(m, xf(geo, PX, 0, PZ, LEAN, 0, 0), cast);
  put(body, xf(slab(PW, PH, PD, 2.2), 0, PH / 2, 0), true); put(rim, xf(slab(PW + .3, PH + .3, PD - .4, 2.35), 0, PH / 2, 0));
  const SW = PW - 1.4, SH = PH - 4.2; const sg = new THREE.PlaneGeometry(SW, SH - 2.2); const uv = sg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * (SH - 2.2) / SW * .5); put(feed, xf(sg, 0, 2.1 + (SH - 2.2) / 2, PD / 2 + .02));
  put(labelMat, xf(labels.quad(0, SW, 2.2), 0, 2.1 + SH - 1.1, PD / 2 + .03));
  put(body, xf(slab(3.2, .7, .1, .35), 0, PH - 1.1, PD / 2 + .06)); put(rim, xf(cyl(.25, .25, .1, 16), 1.0, PH - 1.1, PD / 2 + .06, HPI));   // the camera notch
  put(white, xf(slab(4.5, .35, .1, .17), 0, 1.0, PD / 2 + .06));   // the home bar
  for (const y of [PH - 7, PH - 9.5]) put(rim, xf(box(.3, 1.8, .5), -PW / 2 - .15, y, 0)); put(rim, xf(box(.3, 3, .5), PW / 2 + .15, PH - 8, 0));
  P.add(body, xf(box(2, 16, .6), PX, 7.6, PZ - 4.2, .5, 0, 0));   // the kickstand
  // --- app icons as big as houses: rounded blocks with a white glyph on the faces, stacked into stairs round the plaza
  const icon = (k, x, y, z, s, ry = 0) => { P.add(iconM[k], xf(roundedBox(s, s, s, s * .22, 3), x, y + s / 2, z, 0, ry), true); for (const f of [0, HPI, -HPI, Math.PI]) { const q = glyphQuad(k, s * .7); xf(q, 0, 0, s / 2 + .01, 0, f); xf(q, x, y + s / 2, z, 0, ry); P.add(glyphM, q); } const top = glyphQuad(k, s * .7); xf(top, 0, s / 2 + .01, 0, -HPI); xf(top, x, y + s / 2, z, 0, ry); P.add(glyphM, top); };
  const stairs = (x0, z, dir, n, s, k0) => { for (let i = 0; i < n; i++) { const x = x0 + dir * i * s; if (P.blocked(x, z, s * .72)) { console.info(`[places] icon stair ${i} skipped at (${x}, ${z})`); continue; } for (let j = 0; j <= i; j++) icon((k0 + i + j) % 6, x, j * s, z, s, rr(-.05, .05)); } };
  stairs(-6.8, -7.4, -1, 4, 1.7, 2); stairs(-20, 6.0, 1, 3, 1.7, 3); stairs(30, -6.5, -1, 3, 1.8, 4); stairs(-24, -6.4, 1, 2, 1.7, 5);
  for (const [k, x, z, s] of [[4, 23.5, -7.2, 1.6], [5, -12, 6.6, 1.4], [3, 15.5, -10.6, 1.9]]) if (!P.blocked(x, z, s * .72)) icon(k, x, 0, z, s, rr(-.3, .3));
  // --- the two apps he bought, up front by the road: big, BOUGHT on the face (made-up icons: the cloud and the paw)
  for (const [k, cands] of [[3, [[-9.5, -6.6], [-11, -6.8]]], [1, [[11.6, -6.9], [13, -7]]]]) { const s = P.spot(cands, 1.7, `bought ${k}`); if (!s) continue; const [x, z] = s, S = 2.6;
    icon(k, x, 0, z, S, 0); P.add(labelMat, xf(labels.quad(1, 2.2, 2.2 / labels.aspect), x, S + .5, z + S / 2 + .02, 0, 0, .18)); }
  // --- hearts floating up off the screen: one instanced mesh
  const HN = 14, hearts = new THREE.InstancedMesh(heartGeo(1), heartM, HN); hearts.instanceMatrix.setUsage(THREE.DynamicDrawUsage); hearts.frustumCulled = false; P.group.add(hearts);
  const HV = Array.from({ length: HN }, () => ({ x: rr(-SW / 2 + 1, SW / 2 - 1), ph: rnd(), sp: rr(.05, .09), s: rr(.7, 1.3), w: rnd() * TAU }));
  const front = new THREE.Vector3(0, Math.sin(-LEAN), Math.cos(LEAN));   // the screen's normal, leaning back
  return (dt, now) => {
    const t = now * .001; feedTex.offset.y = (t * .045) % 1;
    HV.forEach((h, k) => { const life = (t * h.sp + h.ph) % 1; const y = 3 + life * (PH - 4); const out = .8 + life * 2.2; _p.set(PX + h.x + Math.sin(t * 1.2 + h.w) * .4, y * Math.cos(LEAN) + out * front.y, PZ + y * Math.sin(LEAN) + out * front.z);
      const sc = h.s * Math.min(1, life * 8) * (life > .85 ? (1 - life) / .15 : 1); _q.setFromAxisAngle(_axisY, Math.sin(t + h.w) * .4); _s.setScalar(Math.max(.001, sc)); _m.compose(_p, _q, _s); hearts.setMatrixAt(k, _m); });
    hearts.instanceMatrix.needsUpdate = true;
  };
}

// =====================================================================================================================
// PAGE — the Giant Search Box. A long white building whose whole front is one search bar (magnifier, blinking cursor),
// his name over it in one green (no search-engine colour set); a giant magnifying glass on a tower sweeping the valley; a maze
// of video screens up the road (our own star-and-triangle thumbnails, no red play button) with every arrow pointing to the
// same door; and a phone with a money sack beside it (the story of the payment is on the sources page; no figure on screen).
// Moving: the glass sweeps, the cursor blinks.
// =====================================================================================================================
function rainbowNameCanvas(text) { const [c, g] = canvas(1024, 256); const cols = ['#2f9e44', '#25803a'];
  g.font = `900 100px ${FONT}`; const fs = Math.min(220, 960 / Math.max(1, g.measureText(text).width) * 100); g.font = `900 ${fs}px ${FONT}`; g.textBaseline = 'middle';
  let x = (1024 - g.measureText(text).width) / 2; [...text].forEach((ch, i) => { g.lineWidth = fs * .08; g.strokeStyle = '#ffffff'; g.lineJoin = 'round'; g.strokeText(ch, x, 138); g.fillStyle = cols[i % cols.length]; g.fillText(ch, x, 138); x += g.measureText(ch).width; }); return c; }
function screensCanvas() {   // four video thumbnails stacked (rows): a picture, a red play button, a progress bar
  const n = 4, [c, g] = canvas(256, 144 * n); const skies = ['#7cc6ff', '#ffcf8a', '#b6e3a8', '#d8b8ff'];
  for (let i = 0; i < n; i++) { const y = i * 144; g.fillStyle = '#111'; g.fillRect(0, y, 256, 144); g.fillStyle = skies[i]; g.fillRect(6, y + 6, 244, 120); g.fillStyle = ['#3b8f4a', '#c8202a', '#1a5fb4', '#f08a2c'][i]; g.beginPath(); g.moveTo(6, y + 126); g.lineTo(90, y + 60); g.lineTo(170, y + 126); g.fill();
    g.fillStyle = '#fbf0d4'; g.strokeStyle = '#3b2516'; g.lineWidth = 5; g.beginPath(); g.arc(128, y + 64, 24, 0, TAU); g.fill(); g.stroke(); g.fillStyle = '#2f9e44'; g.beginPath(); g.moveTo(120, y + 52); g.lineTo(138, y + 64); g.lineTo(120, y + 76); g.closePath(); g.fill(); g.fillStyle = '#f2c230'; g.fillRect(6, y + 128, 80 + i * 40, 8); g.fillStyle = '#555'; g.fillRect(86 + i * 40, y + 128, 164 - i * 40, 8); }
  return { c, n };
}
function phoneSearchCanvas() { const [c, g] = canvas(256, 512); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 512); g.lineWidth = 8; g.strokeStyle = '#c9ccd2'; roundRect(g, 24, 200, 208, 56, 28); g.stroke(); g.strokeStyle = '#2f9e44'; g.lineWidth = 7; g.beginPath(); g.arc(58, 226, 12, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(67, 236); g.lineTo(78, 247); g.stroke();
  g.fillStyle = '#2f9e44'; g.font = `900 64px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 128, 140); return c; }
function buildPage(P) {
  const name = lastName(P) || 'HIS';
  const white = P.mat('white', () => MAT.paint(0xf7f7f5, { roughness: .45 }));
  const grey = P.mat('grey', () => MAT.std(0xc9ccd2, { roughness: .5 }));
  const dark = P.mat('dark', () => MAT.std(0x1b1d22, { roughness: .4, metalness: .4 }));
  const blue = P.mat('blue', () => MAT.paint(0x2f9e44, { roughness: .4 }));   // his place's green (the road sign's), not a search-engine blue
  const glass = P.mat('glass', () => new THREE.MeshStandardMaterial({ color: 0x24384f, roughness: .1, metalness: .6 }));
  const lens = P.mat('lens', () => new THREE.MeshStandardMaterial({ color: 0xbfe3ff, roughness: .05, metalness: .2, transparent: true, opacity: .35, depthWrite: false }));
  const sack = P.mat('sack', () => MAT.std(0x9c6a3a, { roughness: .95 }));
  const paint = P.mat('paint', () => new THREE.MeshStandardMaterial({ color: 0x2f9e44, roughness: .9, emissive: 0x0a3010, emissiveIntensity: .3, polygonOffset: true, polygonOffsetFactor: -2 }));
  const nameM = P.mat('rainbow', () => new THREE.MeshStandardMaterial({ map: P.tex(rainbowNameCanvas(name), { wrap: false }), transparent: true, alphaTest: .3, roughness: .5, emissive: 0xffffff, emissiveIntensity: .06, side: THREE.DoubleSide }));
  const scr = screensCanvas(); const scrTex = P.tex(scr.c, { wrap: false }); const scrM = P.mat('screens', () => new THREE.MeshStandardMaterial({ map: scrTex, roughness: .4, emissive: 0xffffff, emissiveMap: scrTex, emissiveIntensity: .4 }));
  const phoneScr = P.mat('phonescreen', () => new THREE.MeshStandardMaterial({ map: P.tex(phoneSearchCanvas(), { wrap: false }), roughness: .4, emissive: 0xffffff, emissiveIntensity: .2 }));
  const labels = labelAtlas([
    { text: 'SEARCH', fg: '#ffffff', weight: 900, fill: .6 },
    { text: '→', fg: '#ffffff', bg: '#2f9e44', radius: 30, weight: 900, fill: .8 },
    { text: '$', fg: '#7a4e10', bg: '#f2c230', radius: 96, weight: 900, fill: .8 },
    { text: 'DOOR', fg: '#2f9e44', bg: '#ffffff', radius: 22, weight: 900, fill: .6 },
  ], 192); P.res.push(labels.tex);
  const labelMat = P.mat('labels', () => new THREE.MeshStandardMaterial({ map: labels.tex, transparent: true, alphaTest: .3, roughness: .6, side: THREE.DoubleSide }));

  // --- the building: x -14..24, z -21..-9, 11 m, white; the search bar across the front, his name above it
  const FZ = -9, X0 = -14, X1 = 24, D = 12, H = 11, cx = (X0 + X1) / 2, W = X1 - X0;
  P.add(white, xf(box(W, H, D), cx, H / 2, FZ - D / 2)); P.add(grey, xf(box(W + .3, .4, D + .3), cx, H + .2, FZ - D / 2));
  P.add(P.mat('stripe', () => MAT.paint(0x2f9e44, { roughness: .4 })), xf(box(W, .3, .1), cx, H - .4, FZ + .05));   // one green band (no four-colour stripe)
  P.add(nameM, xf(new THREE.PlaneGeometry(16, 4), cx, 8.2, FZ + .08));
  const BY = 4.6, BW = 24, BH = 2.6; P.add(grey, xf(slab(BW + .4, BH + .4, .6, (BH + .4) / 2), cx - 1.5, BY, FZ + .25)); P.add(white, xf(slab(BW, BH, .9, BH / 2), cx - 1.5, BY, FZ + .4), true);
  P.add(blue, xf(new THREE.TorusGeometry(.62, .16, 8, 24), cx - 1.5 - BW / 2 + 1.7, BY + .15, FZ + .88)); P.add(blue, xf(cyl(.14, .14, .9, 8), cx - 1.5 - BW / 2 + 2.35, BY - .55, FZ + .88, 0, 0, Math.PI / 4));
  P.add(blue, xf(slab(4.4, BH, 1.0, BH / 2), cx - 1.5 + BW / 2 + 2.8, BY, FZ + .45), true); P.add(labelMat, xf(labels.quad(0, 3.6, 3.6 / labels.aspect), cx - 1.5 + BW / 2 + 2.8, BY, FZ + .97));
  const cursor = new THREE.Mesh(new THREE.BoxGeometry(.14, 1.6, .06), dark); cursor.position.set(cx - 1.5 - BW / 2 + 3.4, BY, FZ + .88); P.group.add(cursor);
  // the one door, under the bar
  const DX = cx; P.add(glass, xf(box(4.2, 3.0, .2), DX, 1.5, FZ + .05)); P.add(blue, xf(box(5, .35, .5), DX, 3.1, FZ + .25)); P.add(labelMat, xf(labels.quad(3, 2.2, 2.2 / labels.aspect), DX, 3.6, FZ + .5));
  // --- the maze of video screens up the road, both sides; every screen has an arrow to the door
  const screen = (x, z, ry, v) => { const put = (geo, m, cast) => P.add(m, xf(geo, x, 0, z, 0, ry), cast); put(xf(box(3.2, 2.0, .25), 0, 2.0, 0), dark, true); for (const sd of [-1, 1]) put(xf(box(.12, 1.0, .12), sd * 1.2, .5, 0), dark, false); const q = atlasQuad(2.9, 1.65, 1 - (v + 1) / scr.n, 1 - v / scr.n); put(xf(q, 0, 2.0, .13), scrM, false); const q2 = atlasQuad(2.9, 1.65, 1 - (v + 1) / scr.n, 1 - v / scr.n); put(xf(q2, 0, 2.0, -.13, 0, Math.PI), scrM, false); put(xf(labels.quad(1, .9, .9 / labels.aspect * 1.2), 1.1, 3.3, .14), labelMat, false); };
  let v = 0; for (const [x, z, ry] of [[-14, -5, 0], [-18, -7, HPI], [-22, -5, 0], [-26, -7.5, HPI], [-30, -5, 0], [-16, 5, Math.PI], [-24, 6.5, Math.PI], [-28, 5, Math.PI], [-33, 6.8, HPI], [26.5, -5.4, 0], [30, -7, HPI]]) { if (P.blocked(x, z, 1.7)) continue; screen(x, z, ry, v++ % scr.n); }
  // arrows painted on the ground: up the road to the plaza, then to the door
  const chevron = (x, z, a) => { const tx = x + Math.cos(a) * .3, tz = z + Math.sin(a) * .3; for (const sd of [-1, 1]) { const b = a + Math.PI + sd * .75; P.add(paint, flat(.85, .22, tx + Math.cos(b) * .4, tz + Math.sin(b) * .4, .013, b)); } };   // a > pointing along (cos a, sin a)
  for (let x = -32; x <= -6; x += 3.2) for (const z of [-3.4, 3.4]) if (!P.blocked(x, z, .4)) chevron(x, z, 0);
  // --- the giant magnifying glass on its tower, sweeping: a pedestal (merged) and the glass (its own group, turned each frame)
  const mg = P.spot([[-9.5, -6.8], [-11, -6.8], [16, -6.8]], 1.3, 'magnifier'); let glassG = null;
  if (mg) { P.add(white, xf(cyl(1.1, 1.3, 1.2, 20), mg[0], .6, mg[1]), true); P.add(grey, xf(cyl(.3, .4, 7, 12), mg[0], 4.6, mg[1]), true);
    glassG = new THREE.Group(); glassG.position.set(mg[0], 8.1, mg[1]); P.group.add(glassG);
    const parts = [[dark, xf(cyl(.32, .38, 4, 12), 0, 2, 0)], [dark, xf(new THREE.TorusGeometry(2.4, .34, 12, 36), 0, 6.4, 0)], [lens, xf(new THREE.CircleGeometry(2.25, 36), 0, 6.4, 0)], [blue, xf(cyl(.45, .45, .5, 12), 0, 4.1, 0)]];
    for (const [m, g] of parts) { const mesh = new THREE.Mesh(g, m); mesh.castShadow = m !== lens; glassG.add(mesh); } const back = new THREE.Mesh(xf(new THREE.CircleGeometry(2.25, 36), 0, 6.4, 0, 0, Math.PI), lens); glassG.add(back); }
  // --- a phone with the search bar on it, and a money sack leaning on it (a '$' tag, no figure)
  { const s = P.spot([[12.5, -6.8], [26, -6.2], [-20, -6.4]], 1.6, 'phone'); if (s) { const [x, z] = s; P.add(dark, xf(slab(2.4, 4.8, .35, .4), x, 2.45, z, -.08, -.3), true); P.add(phoneScr, xf(new THREE.PlaneGeometry(2.1, 4.2), x, 2.45, z, -.08, -.3).translate(Math.sin(-.3) * .18, 0, Math.cos(-.3) * .18));
    P.add(sack, xf(sph(.8, 14), x + 1.5, .8, z + .6, 0, 0, 0, new THREE.Vector3(1, 1.1, 1)), true); P.add(sack, xf(cyl(.18, .28, .35, 10), x + 1.5, 1.75, z + .6), true); P.add(labelMat, xf(labels.quad(2, 1.9, 1.9 / labels.aspect), x + 1.5, 2.35, z + .6, 0, -.3)); P.add(labelMat, xf(labels.quad(2, 1.9, 1.9 / labels.aspect), x + 1.5, 2.35, z + .6, 0, -.3 - HPI)); } }
  return (dt, now) => { const t = now * .001; cursor.visible = (now % 1000) < 550; if (glassG) { glassG.rotation.y = Math.sin(t * .35) * 1.1 - .3; glassG.rotation.z = Math.sin(t * .5) * .12; } };
}
