// props.js — the props and character art: PBR materials, procedural canvas textures, the bag, the crate, the bar,
// the three stalls, the opening market, the sign, the ten hidden things, the brick, the gerbil's face and run cycle.
// Every maker returns a Group (or Mesh) with its origin at the base centre on y=0, facing +z where facing matters.
import * as THREE from 'three';
import { animateGerbil as gait, makeTail } from './fur.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as A from './art/paper-props.js';
// The paper look (docs/ART-DIRECTION.md, C1): the mode, the palette, toon + ink, the sprite factories. In 'paper' mode the old
// factories below hand over to art/paper-props.js (same names, return types and userData); in 'old' mode nothing changes.
export { setArtMode, artMode, preloadArt, updateArt, PAL, PAL_CSS, toonMat, addInk, spriteGroup, spriteCard, spriteInstanced, makeCoin, makeJarSprite, makeTree, makeBush, makeArrow, makeSharedThing, APP_ICONS, appIconCanvas } from './art/paper-props.js';
const paper = () => A.artMode() === 'paper';

export const PALETTE = { wood: 0xa8743f, woodDark: 0x6b4423, cream: 0xf4e9d2, red: 0xd7262c, yellow: 0xf2c230, blue: 0x2d6fd3, green: 0x3b8f4a, gold: 0xf0c040, metal: 0x9aa3ad, pink: 0xf09aa8, ink: 0x1d1a16, stone: 0xb8b0a0 };

// ---------- helpers ----------
let seed = 1234567; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const clamp = THREE.MathUtils.clamp;
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { repeat = [1, 1], srgb = true, wrap = true } = {}) { const t = new THREE.CanvasTexture(c); if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
const cache = new Map(); const memo = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };
export function shadows(o, cast = true, receive = true) { o.traverse(m => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive; } }); return o; }
const at = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); return m; };
const rot = (m, x = 0, y = 0, z = 0) => { m.rotation.set(x, y, z); return m; };
// Shift a freshly built group so its bounding box sits centred on the origin with its floor on y=0.
function settle(g, centre = true) { g.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(g); const c = b.getCenter(new THREE.Vector3()); for (const ch of g.children) { if (centre) { ch.position.x -= c.x; ch.position.z -= c.z; } ch.position.y -= b.min.y; } return g; }
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function speckle(g, w, h, n, alpha, light, size = 2) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${light ? '255,255,255' : '0,0,0'},${(alpha * rnd()).toFixed(3)})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * size, 1 + rnd() * size); } }
const FONT = 'Fredoka, "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';

// A box with rounded edges: BoxGeometry, every vertex pushed onto the rounded hull. Keeps the six material groups.
export function roundedBox(w, h, d, r = .02, seg = 3) {
  r = Math.min(r, w / 2, h / 2, d / 2); seg = Math.max(3, seg); const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg); const p = g.attributes.position, n = g.attributes.normal;
  const half = [w / 2, h / 2, d / 2], b = half.map(x => x - r); const inner = (seg - 2) / seg; const v = new THREE.Vector3(), c = new THREE.Vector3();
  const remap = (x, i) => { const a = Math.abs(x) / half[i]; if (a > .999) return x; const bf = b[i] / half[i]; const a2 = a <= inner + 1e-6 ? a / inner * bf : bf + (a - inner) / (1 - inner) * (1 - bf); return Math.sign(x) * a2 * half[i]; };
  const uv = g.attributes.uv, perFace = (seg + 1) * (seg + 1), axes = [[2, 1], [2, 1], [0, 2], [0, 2], [0, 1], [0, 1]]; const o = [0, 0, 0], q = [0, 0, 0];
  for (let i = 0; i < p.count; i++) {
    o[0] = p.getX(i); o[1] = p.getY(i); o[2] = p.getZ(i); for (let k = 0; k < 3; k++) q[k] = remap(o[k], k);
    const [ua, va] = axes[Math.floor(i / perFace)]; const ru = Math.abs(o[ua]) > 1e-9 ? q[ua] / o[ua] : 1, rv = Math.abs(o[va]) > 1e-9 ? q[va] / o[va] : 1;
    uv.setXY(i, .5 + (uv.getX(i) - .5) * ru, .5 + (uv.getY(i) - .5) * rv);
    v.set(q[0], q[1], q[2]); c.set(clamp(v.x, -b[0], b[0]), clamp(v.y, -b[1], b[1]), clamp(v.z, -b[2], b[2])); v.sub(c);
    if (v.lengthSq() < 1e-12) v.fromBufferAttribute(n, i); v.normalize(); n.setXYZ(i, v.x, v.y, v.z); p.setXYZ(i, c.x + v.x * r, c.y + v.y * r, c.z + v.z * r);
  }
  return g;
}
// A closed outline with every corner rounded (Chaikin-style quadratic curves); `sharp` lists corner indices to keep.
function roundedShape(pts, sharp = []) {
  const s = new THREE.Shape(); const n = pts.length; const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]); s.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; const m = mid(p, q); if (sharp.includes(i)) { s.lineTo(p[0], p[1]); s.lineTo(m[0], m[1]); } else s.quadraticCurveTo(p[0], p[1], m[0], m[1]); }
  s.closePath(); return s;
}
// A side profile (length along x, height y) extruded to `width`, bevelled, turned so the length runs along +z.
function profile(pts, width, mat, { bevel = .025, sharp = [], segs = 3 } = {}) {
  const shape = roundedShape(pts, sharp); const depth = Math.max(.01, width - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: 5 });
  geo.translate(0, 0, -depth / 2); geo.rotateY(-Math.PI / 2); const sm = mergeVertices(geo, 1e-4); sm.computeVertexNormals(); return new THREE.Mesh(sm, mat);
}

// ---------- materials ----------
export const MAT = {
  std: (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .85, ...o }),
  paint: (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .42, metalness: .05, ...o }),
  gloss: (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: .2, metalness: 0, clearcoat: 1, clearcoatRoughness: .06, ...o }),
  gold: (o = {}) => new THREE.MeshStandardMaterial({ color: 0xf6cc4e, roughness: .3, metalness: .7, emissive: 0x5a4210, emissiveIntensity: .4, ...o }),
  chrome: (o = {}) => new THREE.MeshStandardMaterial({ color: 0xe2e6ea, roughness: .22, metalness: .75, emissive: 0x222426, ...o }),
  glass: (o = {}) => new THREE.MeshPhysicalMaterial({ color: 0x8ec6ea, roughness: .08, metalness: .1, clearcoat: 1, emissive: 0x1a3a55, emissiveIntensity: .35, ...o }),
  rubber: (o = {}) => new THREE.MeshStandardMaterial({ color: 0x232326, roughness: .92, ...o }),
};

// ---------- procedural textures ----------
export const T = {
  wood: (key = 'oak', base = '#a8743f', planks = 4, w = 512, h = 512) => memo('wood:' + key, () => {
    const [c, g] = canvas(w, h); g.fillStyle = base; g.fillRect(0, 0, w, h); const pw = w / planks;
    for (let i = 0; i < planks; i++) { g.fillStyle = `rgba(${rnd() < .5 ? '0,0,0' : '255,230,190'},${(.03 + rnd() * .09).toFixed(3)})`; g.fillRect(i * pw, 0, pw, h); }
    g.lineWidth = 1.3; for (let i = 0; i < 170; i++) { const x = rnd() * w, amp = 2 + rnd() * 7; g.strokeStyle = rnd() < .55 ? `rgba(60,30,10,${(.1 + rnd() * .22).toFixed(2)})` : `rgba(255,225,180,${(.06 + rnd() * .12).toFixed(2)})`; g.beginPath(); for (let y = 0; y <= h; y += 16) g.lineTo(x + Math.sin(y / 70 + i) * amp, y); g.stroke(); }
    for (let i = 0; i < 5; i++) { const x = rnd() * w, y = rnd() * h; g.strokeStyle = 'rgba(60,30,10,.28)'; g.lineWidth = 1.5; for (let k = 6; k > 0; k--) { g.beginPath(); g.ellipse(x, y, k * 2.5, k * 4.5, 0, 0, Math.PI * 2); g.stroke(); } }
    g.fillStyle = 'rgba(40,20,5,.6)'; for (let i = 1; i < planks; i++) g.fillRect(i * pw - 1.5, 0, 3, h);
    g.fillStyle = 'rgba(255,230,190,.25)'; for (let i = 1; i < planks; i++) g.fillRect(i * pw + 1.5, 0, 1.5, h);
    speckle(g, w, h, 1500, .12, false, 1); return tex(c);
  }),
  burlap: () => memo('burlap', () => tex(burlapCanvas(512, 512))),
  cardboard: () => memo('cardboard', () => { const [c, g] = canvas(512, 512); cardboardBase(g, 512, 512); return tex(c); }),
  plaster: (key, base) => memo('plaster:' + key, () => { const [c, g] = canvas(256, 256); g.fillStyle = base; g.fillRect(0, 0, 256, 256); speckle(g, 256, 256, 2500, .06, false, 2); speckle(g, 256, 256, 2500, .1, true, 2); return tex(c); }),
  stone: () => memo('stone', () => {
    const [c, g] = canvas(512, 256); g.fillStyle = '#8d8578'; g.fillRect(0, 0, 512, 256);
    for (let row = 0; row < 4; row++) { let x = (row % 2) * -40; while (x < 512) { const sw = 70 + rnd() * 60, sh = 52; const l = 66 + rnd() * 10; g.fillStyle = `hsl(${34 + rnd() * 10},${18 + rnd() * 10}%,${l}%)`; roundRect(g, x + 3, row * 64 + 4, sw - 6, sh, 9); g.fill(); g.fillStyle = 'rgba(255,255,255,.12)'; roundRect(g, x + 6, row * 64 + 6, sw - 12, 14, 6); g.fill(); x += sw; } }
    speckle(g, 512, 256, 2500, .12, false, 2); return tex(c);
  }),
  shingles: (key, base) => memo('shingles:' + key, () => {
    const [c, g] = canvas(256, 256); const col = new THREE.Color(base); g.fillStyle = '#' + col.clone().multiplyScalar(.55).getHexString(); g.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 6; row++) for (let i = -1; i < 5; i++) { const x = i * 64 + (row % 2) * 32, y = row * 44; const cc = col.clone().offsetHSL(0, 0, (rnd() - .5) * .08); g.fillStyle = '#' + cc.getHexString(); roundRect(g, x + 2, y, 60, 50, 8); g.fill(); g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(x + 4, y + 2, 56, 6); }
    speckle(g, 256, 256, 800, .15, false, 2); return tex(c);
  }),
  stripes: (key, a, b, n = 8) => memo('stripes:' + key, () => { const [c, g] = canvas(256, 64); for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 256 / n, 0, 256 / n + 1, 64); } speckle(g, 256, 64, 300, .08, true, 2); return tex(c); }),
  twist: (key, a, b) => memo('twist:' + key, () => { const [c, g] = canvas(128, 128); const A = new THREE.Color(a), B = new THREE.Color(b); const d = g.createImageData(128, 128); for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const f = ((x / 128 + y / 128) % 1 + 1) % 1; const k = f < .5 ? A : B; const i = (y * 128 + x) * 4; d.data[i] = k.r * 255; d.data[i + 1] = k.g * 255; d.data[i + 2] = k.b * 255; d.data[i + 3] = 255; } g.putImageData(d, 0, 0); return tex(c); }),
  scallop: (key, color) => memo('scallop:' + key, () => { const [c, g] = canvas(256, 64); g.fillStyle = color; g.fillRect(0, 0, 256, 32); for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(32 + i * 64, 32, 32, 0, Math.PI); g.fill(); } g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; g.beginPath(); for (let i = 0; i < 4; i++) g.arc(32 + i * 64, 32, 29, 0, Math.PI); g.stroke(); const t = tex(c); t.repeat.set(3, 1); return t; }),
  coin: () => memo('coinsprite', () => makeCoinBurstTexture()),
  pages: () => memo('pages', () => { const [c, g] = canvas(64, 64); g.fillStyle = '#f3eee2'; g.fillRect(0, 0, 64, 64); for (let i = 0; i < 64; i += 3) { g.fillStyle = `rgba(120,100,70,${(.15 + rnd() * .25).toFixed(2)})`; g.fillRect(0, i, 64, 1); } return tex(c); }),
};
function burlapCanvas(w, h) {
  const [c, g] = canvas(w, h); g.fillStyle = '#b8955f'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < Math.max(w, h); i += 5) { const odd = (i / 5) % 2; g.fillStyle = odd ? 'rgba(70,45,15,.36)' : 'rgba(255,235,190,.26)'; if (i < w) g.fillRect(i, 0, 2.6, h); g.fillStyle = odd ? 'rgba(70,45,15,.3)' : 'rgba(255,235,190,.22)'; if (i < h) g.fillRect(0, i, w, 2.6); }
  speckle(g, w, h, w * 6, .28, false, 2); speckle(g, w, h, w * 4, .25, true, 2); return c;
}
function cardboardBase(g, w, h) {
  g.fillStyle = '#c8a06a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { g.strokeStyle = rnd() < .5 ? `rgba(90,60,25,${(.05 + rnd() * .12).toFixed(2)})` : `rgba(255,240,210,${(.05 + rnd() * .12).toFixed(2)})`; g.lineWidth = 1 + rnd(); const x = rnd() * w, y = rnd() * h, l = 6 + rnd() * 30, a = (rnd() - .5) * .6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  speckle(g, w, h, 2500, .1, false, 2);
}
// Text on a canvas: bold, dark on cream, with a wooden frame; `opts.w` pixels wide, the height follows the lines.
export function textCanvas(lines, { w = 1024, size = 0, pad = 56, bg = '#f6ecd4', fg = '#2b2418', frame = '#7a4e26', frameW = 22, font = FONT, weight = 700, arrow = false } = {}) {
  const probe = canvas(8, 8)[1]; probe.font = `${weight} 100px ${font}`;
  let fs = size; if (!fs) { fs = 1000; for (const l of lines) fs = Math.min(fs, (w - pad * 2 - frameW * 2) / Math.max(1, probe.measureText(l).width) * 100); fs = Math.min(fs, (w - pad * 2) / 2.6); }
  const lh = fs * 1.18; const h = Math.round(pad * 2 + lines.length * lh); const [c, g] = canvas(w, h);
  g.fillStyle = frame; roundRect(g, 0, 0, w, h, 28); g.fill(); g.fillStyle = bg; roundRect(g, frameW, frameW, w - frameW * 2, h - frameW * 2, 18); g.fill();
  g.strokeStyle = 'rgba(80,50,20,.25)'; g.lineWidth = 3; roundRect(g, frameW + 8, frameW + 8, w - frameW * 2 - 16, h - frameW * 2 - 16, 14); g.stroke();
  for (const [x, y] of [[frameW + 18, frameW + 18], [w - frameW - 18, frameW + 18], [frameW + 18, h - frameW - 18], [w - frameW - 18, h - frameW - 18]]) { g.fillStyle = '#6b5a40'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `${weight} ${fs}px ${font}`;
  lines.forEach((l, i) => g.fillText(l, w / 2, pad + lh * (i + .5) + fs * .04));
  return c;
}

// ---------- the money bag ----------
export function makeBag(scale = 1) {
  if (paper()) { const p = A.paperBag(scale); if (p) return p; }
  const g = new THREE.Group();
  const bagTex = memo('bagtex', () => { const c = burlapCanvas(1024, 512); const g2 = c.getContext('2d');
    // the stitched "$" on the front (u=.5 is +z with phiStart=-PI; v runs bottom to top)
    g2.save(); g2.translate(512, 345); g2.scale(1.1, .62); g2.font = `900 230px ${FONT}`; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.lineWidth = 20; g2.strokeStyle = '#7a5a10'; g2.strokeText('$', 0, 0); g2.fillStyle = '#e8b530'; g2.fillText('$', 0, 0);
    g2.lineWidth = 6; g2.strokeStyle = '#fff2b0'; g2.setLineDash([14, 12]); g2.strokeText('$', 0, 0); g2.restore(); return tex(c); });
  const prof = [[0, 0], [.1, 0], [.17, .018], [.21, .07], [.22, .15], [.205, .24], [.165, .31], [.11, .355], [.088, .38], [.1, .415], [.128, .445], [.11, .462], [.06, .458], [0, .45]];
  const geo = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), 28, -Math.PI, Math.PI * 2);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const r = Math.hypot(v.x, v.z); if (r > .02 && v.y > .005 && v.y < .35) { const a = Math.atan2(v.x, v.z); const k = 1 + .035 * Math.sin(3 * a + v.y * 14) + .025 * Math.sin(5 * a - v.y * 9 + 1) + .02 * Math.sin(2 * a + 2); p.setXYZ(i, v.x * k, v.y, v.z * k); } }
  geo.computeVertexNormals();
  const sack = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: bagTex, bumpMap: bagTex, bumpScale: .6, roughness: .95 })); g.add(sack);
  const ropeM = new THREE.MeshStandardMaterial({ map: T.twist('rope', '#c9a86a', '#a07c42'), roughness: 1 }); ropeM.map.repeat.set(10, 1);
  const tie = at(new THREE.Mesh(new THREE.TorusGeometry(.094, .016, 8, 24), ropeM), 0, .372, 0); tie.rotation.x = Math.PI / 2; g.add(tie);
  const tie2 = at(new THREE.Mesh(new THREE.TorusGeometry(.092, .014, 8, 24), ropeM), 0, .395, 0); tie2.rotation.x = Math.PI / 2; g.add(tie2);
  const knot = at(new THREE.Mesh(new THREE.SphereGeometry(.028, 10, 8), ropeM), 0, .38, .1); g.add(knot);
  for (const s of [-1, 1]) { const end = at(new THREE.Mesh(new THREE.CapsuleGeometry(.011, .07, 3, 8), ropeM), s * .03, .33, .115); end.rotation.z = s * .4; end.rotation.x = -.3; g.add(end); }
  g.scale.setScalar(scale); return shadows(g);
}

// ---------- the Lego crate ----------
export function makeCrate(size = .5) {
  if (paper()) { const p = A.paperCrate(size); if (p) return p; }
  const g = new THREE.Group();
  const faces = memo('cratefaces', () => {
    const logo = (g2, x, y, s) => { g2.fillStyle = '#d7262c'; roundRect(g2, x, y, s, s, s * .08); g2.fill(); g2.fillStyle = '#fff'; g2.fillRect(x + s * .07, y + s * .07, s * .86, s * .86); g2.fillStyle = '#f2c230'; g2.fillRect(x + s * .11, y + s * .11, s * .78, s * .78); g2.fillStyle = '#d7262c'; g2.fillRect(x + s * .14, y + s * .14, s * .72, s * .72);
      g2.font = `900 ${s * .36}px ${FONT}`; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.lineWidth = s * .07; g2.strokeStyle = '#111'; g2.strokeText('LEGO', x + s / 2, y + s * .53); g2.fillStyle = '#fff'; g2.fillText('LEGO', x + s / 2, y + s * .53); };
    const brick = (g2, x, y, w, h, col, studs) => { g2.fillStyle = col; g2.fillRect(x, y, w, h); g2.fillStyle = 'rgba(0,0,0,.22)'; g2.fillRect(x, y + h - h * .18, w, h * .18); g2.fillStyle = 'rgba(255,255,255,.22)'; g2.fillRect(x, y, w, h * .12); for (let i = 0; i < studs; i++) { const sw = w / studs; g2.fillStyle = col; g2.beginPath(); g2.ellipse(x + sw * (i + .5), y, sw * .3, sw * .14, 0, 0, 7); g2.fill(); g2.fillStyle = 'rgba(0,0,0,.25)'; g2.fillRect(x + sw * (i + .2), y - sw * .18, sw * .6, sw * .18); g2.fillStyle = col; g2.beginPath(); g2.ellipse(x + sw * (i + .5), y - sw * .18, sw * .3, sw * .14, 0, 0, 7); g2.fill(); } };
    const front = () => { const [c, g2] = canvas(512, 512); const gr = g2.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#2a74d8'); gr.addColorStop(1, '#8ec9f0'); g2.fillStyle = gr; g2.fillRect(0, 0, 512, 512);
      g2.fillStyle = 'rgba(255,255,255,.12)'; for (let i = 0; i < 9; i++) { g2.beginPath(); g2.arc(rnd() * 512, rnd() * 512, 20 + rnd() * 60, 0, 7); g2.fill(); }
      // product art: a stack of bricks with a little sparkle
      brick(g2, 120, 330, 272, 70, '#d7262c', 4); brick(g2, 160, 262, 136, 70, '#f2c230', 2); brick(g2, 296, 262, 96, 70, '#3b8f4a', 1); brick(g2, 200, 194, 136, 70, '#2d6fd3', 2);
      g2.fillStyle = '#fff'; g2.font = `700 44px ${FONT}`; g2.textAlign = 'right'; g2.textBaseline = 'alphabetic'; g2.fillText('6+', 486, 70); g2.fillText('1,234', 486, 478); g2.font = `700 24px ${FONT}`; g2.fillText('pieces', 486, 500);
      g2.fillStyle = 'rgba(255,255,255,.95)'; g2.fillRect(0, 430, 300, 82); g2.fillStyle = '#1d1a16'; g2.textAlign = 'left'; g2.font = `700 40px ${FONT}`; g2.fillText('Market Stall', 26, 484);
      logo(g2, 22, 22, 110); return tex(c, { wrap: false }); };
    const side = () => { const [c, g2] = canvas(512, 512); g2.fillStyle = '#2a74d8'; g2.fillRect(0, 0, 512, 512); g2.fillStyle = '#8ec9f0'; g2.fillRect(0, 300, 512, 212); brick(g2, 150, 300, 212, 60, '#d7262c', 4); logo(g2, 22, 22, 90); g2.fillStyle = '#fff'; g2.font = `700 34px ${FONT}`; g2.textAlign = 'left'; g2.fillText('Market Stall', 130, 86); return tex(c, { wrap: false }); };
    const top = () => { const [c, g2] = canvas(512, 512); cardboardBase(g2, 512, 512); g2.fillStyle = 'rgba(240,225,190,.9)'; g2.fillRect(216, 0, 80, 512); g2.fillStyle = 'rgba(255,255,255,.25)'; g2.fillRect(222, 0, 6, 512); g2.fillRect(284, 0, 6, 512); logo(g2, 30, 30, 80); g2.fillStyle = '#5a3a18'; g2.font = `700 30px ${FONT}`; g2.textAlign = 'center'; g2.fillText('THIS SIDE UP', 400, 300); g2.font = `700 90px ${FONT}`; g2.fillText('↑ ↑', 400, 240); return tex(c, { wrap: false }); };
    const bottom = () => { const [c, g2] = canvas(256, 256); cardboardBase(g2, 256, 256); g2.fillStyle = '#fff'; g2.fillRect(60, 90, 136, 70); g2.fillStyle = '#111'; for (let x = 70; x < 186; x += 4) if (rnd() < .6) g2.fillRect(x, 96, 2, 48); g2.font = `12px monospace`; g2.textAlign = 'center'; g2.fillText('4 006 1234', 128, 156); return tex(c, { wrap: false }); };
    const mk = t => new THREE.MeshStandardMaterial({ map: t, roughness: .55 }); const s = mk(side()), f = mk(front());
    return [s, s, mk(top()), new THREE.MeshStandardMaterial({ map: bottom(), roughness: .9 }), f, f];
  });
  const box = new THREE.Mesh(roundedBox(size, size, size, size * .03, 3), faces); box.position.y = size / 2; g.add(box);
  // two plastic straps round the box
  const strapM = MAT.paint(0xf2c230, { roughness: .5 }); for (const x of [-size * .4, size * .4]) { const s = new THREE.Mesh(new THREE.BoxGeometry(.022, size + .006, size + .006), strapM); s.position.set(x, size / 2, 0); g.add(s); }
  return shadows(g);
}

// ---------- the hurdle bar ----------
export function makeBar(width = 3, height = .62) {
  const g = new THREE.Group(); const barM = new THREE.MeshStandardMaterial({ map: T.twist('bar', '#d7262c', '#f2c230'), roughness: .4, metalness: .05 }); barM.map = barM.map.clone(); barM.map.repeat.set(1, 14); barM.map.needsUpdate = true;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, width - .2, 20), barM); bar.rotation.x = Math.PI / 2; bar.position.y = height; g.add(bar);
  const postM = MAT.paint(0xf2c230), footM = MAT.paint(0x2a2a2e, { roughness: .6 });
  for (const z of [-width / 2 + .1, width / 2 - .1]) {
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.04, .045, height, 14), postM), 0, height / 2, z));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.14, .16, .035, 18), footM), 0, .018, z));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.075, .06, .06, 14), footM), 0, height + .02, z));
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(.05, 12, 8), MAT.chrome()), 0, height + .07, z));
    const ref = at(new THREE.Mesh(new THREE.CircleGeometry(.03, 12), new THREE.MeshStandardMaterial({ color: 0xff3b2f, emissive: 0xff3b2f, emissiveIntensity: .8 })), -.046, height - .2, z); ref.rotation.y = -Math.PI / 2; g.add(ref);
  }
  return shadows(g);
}

// ---------- Lego bricks ----------
export function legoBrick(cols = 4, rows = 2, unit = .03, color = 0xd7262c) {
  const g = new THREE.Group(); const m = MAT.gloss(color, { roughness: .32, clearcoatRoughness: .2 }); const w = cols * unit, d = rows * unit, h = unit * 1.2;
  const body = new THREE.Mesh(roundedBox(w, h, d, unit * .06, 2), m); body.position.y = h / 2; g.add(body);
  const stud = new THREE.CylinderGeometry(unit * .3, unit * .3, unit * .21, 12); const inst = new THREE.InstancedMesh(stud, m, cols * rows); const mx = new THREE.Matrix4(); let i = 0;
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) { mx.makeTranslation((c + .5) * unit - w / 2, h + unit * .105, (r + .5) * unit - d / 2); inst.setMatrixAt(i++, mx); }
  g.add(inst); return shadows(g);
}
export function makeBrick() { return legoBrick(4, 2, .03, 0xd7262c); }

// ---------- the sign ----------
export function makeSign(lines, { width = 1.6, postHeight = 1.7, post = true } = {}) {
  if (paper()) { const p = A.paperSign(lines, { width, postHeight, post }); if (p) return p; }
  const g = new THREE.Group(); const woodM = new THREE.MeshStandardMaterial({ map: T.wood('sign', '#9a6a3a', 3), roughness: .8 });
  const face = new THREE.MeshStandardMaterial({ roughness: .9 }); let board = null;
  const draw = ls => { const c = textCanvas(ls); if (face.map) face.map.dispose(); face.map = tex(c, { wrap: false }); face.needsUpdate = true; const h = width * c.height / c.width;
    if (board) { board.geometry.dispose(); board.geometry = roundedBox(width, h, .06, .012, 2); } else { board = new THREE.Mesh(roundedBox(width, h, .06, .012, 2), [woodM, woodM, woodM, woodM, face, woodM]); g.add(board); }
    board.position.y = postHeight - h / 2; board.userData.h = h; };
  draw(lines);
  if (post) { g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.045, .055, postHeight, 10), woodM), 0, postHeight / 2, -.05)); for (const s of [-1, 1]) { const br = at(new THREE.Mesh(new THREE.BoxGeometry(.3, .05, .05), woodM), s * width * .25, postHeight - board.userData.h / 2, -.055); g.add(br); } }
  g.userData.setLines = draw; g.userData.board = board; return shadows(g);
}

// ---------- small shared builders: wheels, cars, barrels, crates of produce ----------
function wheel(r = .1, w = .07, rim = 0xd8dde3) { const g = new THREE.Group(); const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 18), MAT.rubber()); tire.rotation.z = Math.PI / 2; g.add(tire);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * .62, r * .62, w + .012, 12), MAT.chrome({ color: rim })); disc.rotation.z = Math.PI / 2; g.add(disc); const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * .18, r * .18, w + .03, 8), MAT.paint(0x444)); hub.rotation.z = Math.PI / 2; g.add(hub); return g; }
// kind: 'race' (low, wing) | 'ev' (rounded hatch) | 'plain' (little coupe). Length `len`, facing +z.
export function smallCar({ kind = 'plain', len = .8, color = 0xd7262c } = {}) {
  const g = new THREE.Group(); const k = len / .9; const bodyM = MAT.gloss(color); const w = .42 * k;
  if (kind === 'race') {
    const body = profile([[-.45, .05], [.45, .05], [.45, .1], [.3, .14], [.12, .17], [0, .2], [-.08, .22], [-.3, .22], [-.45, .18]].map(p => [p[0] * k, p[1] * k]), w, bodyM, { bevel: .028 * k, sharp: [0, 1] }); g.add(body);
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(.11 * k, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.glass({ color: 0x1b2430, emissiveIntensity: .1 })); cockpit.scale.set(.75, .8, 1.2); cockpit.position.set(0, .2 * k, -.08 * k); g.add(cockpit);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(.085 * k, .012 * k, 6, 16, Math.PI), bodyM); halo.position.set(0, .215 * k, -.07 * k); halo.rotation.y = Math.PI / 2; g.add(halo);
    const wing = new THREE.Mesh(roundedBox(.5 * k, .025 * k, .15 * k, .008, 2), bodyM); wing.position.set(0, .34 * k, -.42 * k); wing.rotation.x = -.15; g.add(wing);
    for (const s of [-1, 1]) { g.add(at(new THREE.Mesh(new THREE.BoxGeometry(.02 * k, .14 * k, .1 * k), MAT.paint(0x222)), s * .16 * k, .27 * k, -.42 * k)); g.add(at(new THREE.Mesh(new THREE.BoxGeometry(.03 * k, .1 * k, .16 * k), bodyM), s * .25 * k, .34 * k, -.42 * k)); }
    const splitter = new THREE.Mesh(roundedBox(.5 * k, .02 * k, .12 * k, .006, 2), MAT.paint(0x222)); splitter.position.set(0, .04 * k, .46 * k); g.add(splitter);
    for (const s of [-1, 1]) { const hl = at(new THREE.Mesh(new THREE.SphereGeometry(.025 * k, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff0b0, emissiveIntensity: 1 })), s * .13 * k, .11 * k, .44 * k); g.add(hl); }
    // number roundel on the nose
    const rc = memo('roundel7', () => { const [c, g2] = canvas(128, 128); g2.fillStyle = '#fff'; g2.beginPath(); g2.arc(64, 64, 60, 0, 7); g2.fill(); g2.fillStyle = '#1d1a16'; g2.font = `900 84px ${FONT}`; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText('7', 64, 70); return tex(c, { wrap: false }); });
    const num = new THREE.Mesh(new THREE.CircleGeometry(.07 * k, 20), new THREE.MeshStandardMaterial({ map: rc, roughness: .4, transparent: true })); num.position.set(0, .183 * k, .17 * k); num.rotation.x = -Math.PI / 2 + .25; g.add(num);
    for (const sx of [-1, 1]) for (const z of [.3, -.3]) g.add(at(wheel(.095 * k, .085 * k, 0xd9b640), sx * (w / 2 + .03 * k), .095 * k, z * k));
  } else if (kind === 'ev') {
    const body = profile([[-.42, .08], [.42, .08], [.44, .2], [.36, .27], [.16, .31], [.05, .43], [-.26, .45], [-.4, .4], [-.43, .3]].map(p => [p[0] * k, p[1] * k]), w, bodyM, { bevel: .035 * k, sharp: [0, 1] }); g.add(body);
    const glassM = MAT.glass({ color: 0x24303c, emissiveIntensity: .15 });
    const win = profile([[.17, .315], [.06, .42], [-.25, .435], [-.37, .395], [-.37, .32]].map(p => [p[0] * k, p[1] * k]), w + .012, glassM, { bevel: .012 * k }); g.add(win);
    for (const s of [-1, 1]) { g.add(at(new THREE.Mesh(new THREE.BoxGeometry(.03 * k, .035 * k, .07 * k), bodyM), s * (w / 2 + .01), .3 * k, .18 * k)); const hl = at(new THREE.Mesh(new THREE.BoxGeometry(.09 * k, .03 * k, .03 * k), new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff0b0, emissiveIntensity: 1 })), s * .14 * k, .22 * k, .44 * k); hl.rotation.y = s * .4; g.add(hl); const tl = at(new THREE.Mesh(new THREE.BoxGeometry(.08 * k, .03 * k, .02 * k), new THREE.MeshStandardMaterial({ color: 0xff3b2f, emissive: 0xff2a1f, emissiveIntensity: .8 })), s * .14 * k, .3 * k, -.43 * k); g.add(tl); }
    const port = at(new THREE.Mesh(new THREE.CylinderGeometry(.025 * k, .025 * k, .01, 10), MAT.paint(0x333)), -w / 2 - .003, .26 * k, -.28 * k); port.rotation.z = Math.PI / 2; g.add(port); g.userData.port = port.position.clone();
    for (const sx of [-1, 1]) for (const z of [.28, -.27]) g.add(at(wheel(.105 * k, .08 * k), sx * (w / 2 + .015 * k), .105 * k, z * k));
  } else {
    const body = profile([[-.42, .07], [.42, .07], [.43, .2], [.3, .22], [.15, .36], [-.12, .37], [-.3, .24], [-.43, .2]].map(p => [p[0] * k, p[1] * k]), w, bodyM, { bevel: .03 * k, sharp: [0, 1] }); g.add(body);
    const win = profile([[.16, .235], [.08, .345], [-.14, .355], [-.26, .26]].map(p => [p[0] * k, p[1] * k]), w + .01, MAT.glass({ color: 0x24303c, emissiveIntensity: .15 }), { bevel: .01 * k }); g.add(win);
    for (const s of [-1, 1]) { const hl = at(new THREE.Mesh(new THREE.SphereGeometry(.03 * k, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff0b0, emissiveIntensity: 1 })), s * .13 * k, .17 * k, .43 * k); g.add(hl); }
    for (const sx of [-1, 1]) for (const z of [.27, -.27]) g.add(at(wheel(.1 * k, .08 * k), sx * (w / 2 + .012 * k), .1 * k, z * k));
  }
  return shadows(g);
}
function barrel(r = .22, h = .55) {
  const g = new THREE.Group(); const woodM = new THREE.MeshStandardMaterial({ map: T.wood('barrel', '#8a5a2e', 8), roughness: .85 });
  const prof = [[0, 0], [r * .88, 0], [r, h * .3], [r, h * .7], [r * .88, h], [0, h]].map(p => new THREE.Vector2(p[0], p[1]));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 16), woodM)); const hoopM = MAT.chrome({ color: 0x5a5a60, roughness: .4 });
  for (const y of [h * .18, h * .82]) { const hoop = at(new THREE.Mesh(new THREE.TorusGeometry(r * .985, .012, 6, 20), hoopM), 0, y, 0); hoop.rotation.x = Math.PI / 2; g.add(hoop); }
  return shadows(g);
}
function slatCrate(w = .45, h = .3, d = .35, fill = null) {
  const g = new THREE.Group(); const woodM = new THREE.MeshStandardMaterial({ map: T.wood('crate', '#c49a5a', 1), roughness: .9 }); const t = .025;
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(w, t, d), woodM), 0, t / 2, 0));
  for (const s of [-1, 1]) { for (const y of [h * .28, h * .72]) { g.add(at(new THREE.Mesh(new THREE.BoxGeometry(w, h * .34, t), woodM), 0, y, s * (d / 2 - t / 2))); g.add(at(new THREE.Mesh(new THREE.BoxGeometry(t, h * .34, d), woodM), s * (w / 2 - t / 2), y, 0)); } for (const z of [-1, 1]) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(t * 1.2, h, t * 1.2), woodM), s * (w / 2 - t / 2), h / 2, z * (d / 2 - t / 2))); }
  if (fill) { const m = MAT.paint(fill, { roughness: .5 }); const r = Math.min(w, d) / 7; const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 7, 5), m, 20); const mx = new THREE.Matrix4(); let i = 0; const col = new THREE.Color();
    for (let a = -1.5; a <= 1.5; a++) for (let b = -1; b <= 1; b++) { mx.makeTranslation(a * r * 2.1, h * .75 + (rnd() * .3) * r, b * r * 2.1); inst.setMatrixAt(i, mx); inst.setColorAt(i, col.set(fill).offsetHSL((rnd() - .5) * .04, 0, (rnd() - .5) * .1)); i++; }
    for (let a = -1; a <= 1; a++) for (let b = -.5; b <= .5; b++) { mx.makeTranslation(a * r * 2.1, h * .75 + r * 1.7, b * r * 2.1); inst.setMatrixAt(i, mx); inst.setColorAt(i, col.set(fill).offsetHSL((rnd() - .5) * .04, 0, (rnd() - .5) * .1)); i++; }
    inst.count = i; inst.castShadow = true; g.add(inst); }
  return shadows(g);
}

// ---------- the stalls (the fight's buildings) ----------
const STALL = {
  lego: { name: 'Lego store', color: 0xd7262c, trim: 0xf2c230, wall: '#f6e7b8', wallH: 1.8 },
  cars: { name: 'Car store', color: 0x2d6fd3, trim: 0xf4e9d2, wall: '#dfe8ee', wallH: 1.8 },
  house: { name: 'House with stairs', color: 0x3b8f4a, trim: 0xf4e9d2, wall: '#f4e3cf', wallH: 2.2 },
};
export function makeStall(kind = 'lego', opts = {}) {
  if (paper() && STALL[kind]) return A.paperStall(kind, { ...STALL[kind], ...opts }, makeSign);
  const d = { ...STALL[kind] || STALL.lego, ...opts }; const g = new THREE.Group(); const parts = []; const W = 2.6, H = d.wallH, F = .3;
  const woodM = new THREE.MeshStandardMaterial({ map: T.wood('stall', '#9a6a3a', 6), roughness: .85 }); const trimM = MAT.paint(d.trim, { roughness: .55 }); const colM = MAT.paint(d.color, { roughness: .5 });
  // 1 foundation: stone base with a plank deck and a doorstep
  const found = new THREE.Group(); const stoneM = new THREE.MeshStandardMaterial({ map: T.stone(), roughness: .95 }); stoneM.map = stoneM.map.clone(); stoneM.map.repeat.set(3, 1); stoneM.map.needsUpdate = true;
  const deckM = new THREE.MeshStandardMaterial({ map: T.wood('deck', '#a8743f', 10), roughness: .85 });
  found.add(at(new THREE.Mesh(roundedBox(3, F, 3, .02, 2), [stoneM, stoneM, deckM, stoneM, stoneM, stoneM]), 0, F / 2, 0));
  found.add(at(new THREE.Mesh(roundedBox(1, .1, .5, .01, 2), stoneM), 0, .05, 1.7)); parts.push(found);
  // 2 walls: plaster box, corner posts, door, windows with boxes of flowers
  const walls = new THREE.Group(); const plasterM = new THREE.MeshStandardMaterial({ map: T.plaster(kind, d.wall), roughness: .9 });
  walls.add(at(new THREE.Mesh(new THREE.BoxGeometry(W, H, W), plasterM), 0, F + H / 2, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) walls.add(at(new THREE.Mesh(new THREE.BoxGeometry(.14, H + .02, .14), trimM), sx * W / 2, F + H / 2, sz * W / 2));
  walls.add(at(new THREE.Mesh(new THREE.BoxGeometry(W + .16, .1, .1), trimM), 0, F + H, W / 2));
  const door = (x, y, z, ry = 0, sc = 1) => { const dg = new THREE.Group(); dg.scale.setScalar(sc); dg.add(at(new THREE.Mesh(new THREE.BoxGeometry(.72, 1.35, .08), woodM), 0, .675, .02)); dg.add(at(new THREE.Mesh(new THREE.BoxGeometry(.86, .08, .12), trimM), 0, 1.38, .02)); for (const s of [-1, 1]) dg.add(at(new THREE.Mesh(new THREE.BoxGeometry(.08, 1.4, .12), trimM), s * .4, .7, .02)); dg.add(at(new THREE.Mesh(new THREE.SphereGeometry(.035, 10, 8), MAT.gold()), .25, .7, .08)); dg.add(at(new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .02), MAT.paint(d.color, { roughness: .6 })), 0, .95, .065)); dg.position.set(x, y, z); dg.rotation.y = ry; return dg; };
  walls.add(door(0, F, W / 2));
  const win = (x, y, z, ry = 0) => { const wg = new THREE.Group(); wg.add(at(new THREE.Mesh(new THREE.BoxGeometry(.6, .6, .04), MAT.glass()), 0, 0, .0)); wg.add(at(new THREE.Mesh(new THREE.BoxGeometry(.7, .07, .1), trimM), 0, .33, .02)); wg.add(at(new THREE.Mesh(new THREE.BoxGeometry(.7, .07, .14), trimM), 0, -.33, .04)); for (const s of [-1, 1]) wg.add(at(new THREE.Mesh(new THREE.BoxGeometry(.07, .66, .1), trimM), s * .33, 0, .02)); wg.add(at(new THREE.Mesh(new THREE.BoxGeometry(.03, .6, .06), trimM), 0, 0, .02)); wg.add(at(new THREE.Mesh(new THREE.BoxGeometry(.6, .03, .06), trimM), 0, 0, .02));
    const box = at(new THREE.Mesh(new THREE.BoxGeometry(.66, .14, .16), woodM), 0, -.44, .1); wg.add(box); const fm = new THREE.InstancedMesh(new THREE.SphereGeometry(.045, 8, 6), MAT.paint(0xffffff, { roughness: .6 }), 5); const mx = new THREE.Matrix4(); const col = new THREE.Color(); for (let i = 0; i < 5; i++) { mx.makeTranslation(-.24 + i * .12, -.33, .1); fm.setMatrixAt(i, mx); fm.setColorAt(i, col.setHSL([.0, .12, .85, .55, .95][i], .8, .6)); } fm.castShadow = true; wg.add(fm);
    wg.position.set(x, y, z); wg.rotation.y = ry; return wg; };
  walls.add(win(-.85, F + 1.1, W / 2), win(.85, F + 1.1, W / 2), win(0, F + 1.1, -W / 2, Math.PI), win(-W / 2, F + 1.1, 0, -Math.PI / 2));
  if (kind !== 'house') walls.add(win(W / 2, F + 1.1, 0, Math.PI / 2));
  parts.push(walls);
  // 3 roof: two shingled slabs over gable ends, a ridge, a chimney for the house
  const roof = new THREE.Group(); const shM = new THREE.MeshStandardMaterial({ map: T.shingles(kind, d.color), roughness: .85 }); shM.map = shM.map.clone(); shM.map.repeat.set(5, 3); shM.map.needsUpdate = true;
  const rise = .95, half = W / 2 + .35, slope = Math.hypot(rise, half), ang = Math.atan2(rise, half); const eaveY = F + H + .02;
  const soffitM = MAT.std(d.trim, { emissive: 0x2a2520, roughness: .9 });
  for (const s of [-1, 1]) { const slab = new THREE.Mesh(new THREE.BoxGeometry(W + .7, .08, slope + .05), [colM, colM, shM, soffitM, colM, colM]); slab.position.set(0, eaveY + rise / 2 + .02, s * half / 2); slab.rotation.x = s * ang; roof.add(slab); }
  const gableM = plasterM.clone(); gableM.side = THREE.DoubleSide;
  for (const s of [-1, 1]) { const sh = new THREE.Shape(); sh.moveTo(-W / 2 - .02, 0); sh.lineTo(W / 2 + .02, 0); sh.lineTo(0, rise + .02); sh.closePath(); const gable = new THREE.Mesh(new THREE.ShapeGeometry(sh), gableM); gable.position.set(s * (W / 2 - .01), eaveY - .02, 0); gable.rotation.y = s * Math.PI / 2; roof.add(gable); }
  roof.add(at(new THREE.Mesh(roundedBox(W + .8, .1, .2, .03, 2), colM), 0, eaveY + rise + .04, 0));
  if (kind === 'house') { const chim = at(new THREE.Mesh(new THREE.BoxGeometry(.36, .7, .36), new THREE.MeshStandardMaterial({ map: T.stone(), roughness: .95 })), -.7, eaveY + rise - .05, -.5); roof.add(chim); roof.add(at(new THREE.Mesh(new THREE.BoxGeometry(.44, .08, .44), MAT.paint(0x6b6560)), -.7, eaveY + rise + .3, -.5)); }
  parts.push(roof);
  // 4 the hanging sign
  const signG = new THREE.Group(); const beamY = eaveY - .06; signG.add(at(new THREE.Mesh(new THREE.BoxGeometry(.08, .08, .9), woodM), 0, beamY, W / 2 + .4)); signG.add(at(new THREE.Mesh(new THREE.BoxGeometry(.3, .08, .08), woodM), 0, beamY, W / 2 + .8));
  const sign = makeSign([d.name], { width: 1.4, post: false, postHeight: 1 }); const bh = sign.userData.board.userData.h; sign.position.set(0, beamY - 1.14, W / 2 + .55); signG.add(sign);
  const chainM = MAT.chrome({ color: 0x888 }); for (const s of [-1, 1]) signG.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .16, 6), chainM), s * .55, beamY - .08, W / 2 + .55));
  parts.push(signG); g.userData.sign = sign;
  // 5 the flag on the ridge
  const flag = new THREE.Group(); const topY = eaveY + rise + .08; flag.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.02, .025, 1.1, 8), MAT.chrome({ color: 0xcfd4d8 })), 0, topY + .55, 0)); flag.add(at(new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 8), MAT.gold()), 0, topY + 1.12, 0));
  const pen = new THREE.Shape(); pen.moveTo(0, 0); pen.lineTo(.75, .17); pen.lineTo(0, .34); pen.closePath(); const pg = new THREE.ShapeGeometry(pen); const pm = new THREE.Mesh(pg, MAT.paint(d.color, { side: THREE.DoubleSide })); pm.position.set(.02, topY + .72, 0); flag.add(pm); flag.userData.pennant = pm;
  parts.push(flag);
  // 6 extras
  const extras = new THREE.Group();
  if (kind === 'lego') { const b1 = legoBrick(4, 2, .14, 0xd7262c); b1.position.set(-1.05, F, 1.05); b1.rotation.y = .3; extras.add(b1); const b2 = legoBrick(2, 2, .14, 0xf2c230); b2.position.set(-1.05, F + .168, 1.0); b2.rotation.y = .3; extras.add(b2); const b3 = legoBrick(2, 2, .14, 0x2d6fd3); b3.position.set(1.1, F, 1.1); b3.rotation.y = -.4; extras.add(b3); const b4 = legoBrick(1, 2, .14, 0x3b8f4a); b4.position.set(1.0, F, 1.4); b4.rotation.y = .5; extras.add(b4);
    const awnM = new THREE.MeshStandardMaterial({ map: T.stripes('legoawn', '#d7262c', '#fff8e7', 10), roughness: .8, side: THREE.DoubleSide }); const awn = new THREE.Mesh(new THREE.BoxGeometry(1.2, .03, .55), awnM); awn.position.set(.85, F + 1.5, W / 2 + .3); awn.rotation.x = .35; extras.add(awn); const awn2 = awn.clone(); awn2.position.x = -.85; extras.add(awn2); }
  if (kind === 'cars') { const plinth = at(new THREE.Mesh(new THREE.CylinderGeometry(.55, .6, .22, 20), new THREE.MeshStandardMaterial({ map: T.stone(), roughness: .9 })), 1.05, F + .11, 1.05); extras.add(plinth); const car = smallCar({ kind: 'plain', len: .85, color: 0xf2c230 }); car.position.set(1.05, F + .22, 1.05); car.rotation.y = .6; extras.add(car); car.userData.spin = true; extras.userData.car = car;
    const tyreM = MAT.rubber(); for (let i = 0; i < 3; i++) { const t = at(new THREE.Mesh(new THREE.TorusGeometry(.17, .07, 8, 16), tyreM), -1.15, F + .07 + i * .14, 1.15); t.rotation.x = Math.PI / 2; extras.add(t); } }
  if (kind === 'house') {
    // the exterior staircase up the right side to a landing and an upper door, with a railing
    const x0 = W / 2, sw = .62, landY = F + 1.2, railM = MAT.paint(0xffffff, { roughness: .6 }); const xr = x0 + sw - .03;
    extras.add(at(new THREE.Mesh(new THREE.BoxGeometry(sw, .08, .7), woodM), x0 + sw / 2, landY - .04, -1.0));
    const stepZ = i => -.5 + i * .3, stepTop = i => landY - .15 * (i + 1);
    for (let i = 0; i < 7; i++) { extras.add(at(new THREE.Mesh(new THREE.BoxGeometry(sw, .07, .32), woodM), x0 + sw / 2, stepTop(i) - .035, stepZ(i))); extras.add(at(new THREE.Mesh(new THREE.BoxGeometry(sw - .06, .11, .04), trimM), x0 + sw / 2, stepTop(i) - .09, stepZ(i) - .14)); }
    for (let i = 0; i < 7; i += 2) extras.add(at(new THREE.Mesh(new THREE.BoxGeometry(.06, stepTop(i) - F, .06), woodM), xr, (stepTop(i) + F) / 2, stepZ(i) + .1));
    for (const z of [-1.33, -.67]) extras.add(at(new THREE.Mesh(new THREE.BoxGeometry(.06, landY - F, .06), woodM), xr, (landY + F) / 2, z));
    for (let i = 0; i < 7; i += 2) extras.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .9, 8), railM), xr, stepTop(i) + .45, stepZ(i)));
    for (const z of [-1.33, -.67]) extras.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .9, 8), railM), xr, landY + .45, z));
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 2.05, 8), railM); rail.position.set(xr, (stepTop(0) + stepTop(6)) / 2 + .9, (stepZ(0) + stepZ(6)) / 2); rail.rotation.x = -Math.atan2(1.8, .9); extras.add(rail);
    extras.add(at(rot(new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .72, 8), railM), Math.PI / 2, 0, 0), xr, landY + .9, -1.0));
    extras.add(at(rot(new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, sw, 8), railM), 0, 0, Math.PI / 2), x0 + sw / 2, landY + .9, -1.35));
    extras.add(door(x0, landY, -1.0, Math.PI / 2, .85));
    extras.add(at(new THREE.Mesh(new THREE.SphereGeometry(.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff1c0, emissive: 0xffd080, emissiveIntensity: .9 })), x0 + .14, landY + 1.05, -.45));
    extras.add(at(new THREE.Mesh(new THREE.BoxGeometry(.2, .03, .03), MAT.paint(0x333)), x0 + .08, landY + 1.15, -.45)); extras.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .1, 6), MAT.paint(0x333)), x0 + .14, landY + 1.13, -.45));
  }
  parts.push(extras);
  parts.forEach(p => { p.visible = false; g.add(p); }); g.userData.parts = parts; g.userData.kind = kind; g.userData.name = d.name;
  g.userData.reveal = n => parts.forEach((p, i) => { p.visible = i < n; });
  return shadows(g);
}

// ---------- the opening market ----------
export function makeMarketStart() {
  const g = new THREE.Group(); const woodM = new THREE.MeshStandardMaterial({ map: T.wood('booth', '#a0703c', 5), roughness: .85 }); const postM = MAT.std(0x6b4a2a);
  const booth = (x, z, a, b, fill) => { const bg = new THREE.Group();
    bg.add(at(new THREE.Mesh(roundedBox(1.5, .9, .7, .015, 2), woodM), 0, .45, .25)); bg.add(at(new THREE.Mesh(roundedBox(1.62, .06, .82, .01, 2), MAT.std(0x5a3a1c)), 0, .93, .25));
    for (const sx of [-1, 1]) for (const z2 of [.62, -.5]) bg.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.035, .04, z2 > 0 ? 2.0 : 2.3, 8), postM), sx * .78, (z2 > 0 ? 2.0 : 2.3) / 2, z2));
    const awnM = new THREE.MeshStandardMaterial({ map: T.stripes('awn' + a, a, b, 8), roughness: .85, side: THREE.DoubleSide }); const awn = new THREE.Mesh(new THREE.BoxGeometry(1.8, .035, 1.35), awnM); awn.position.set(0, 2.15, .06); awn.rotation.x = .25; bg.add(awn);
    const val = new THREE.Mesh(new THREE.PlaneGeometry(1.8, .22), new THREE.MeshStandardMaterial({ map: T.scallop('val' + a, a), transparent: true, alphaTest: .5, side: THREE.DoubleSide, roughness: .9 })); val.position.set(0, 1.9, .72); bg.add(val);
    bg.add(at(slatCrate(.5, .26, .38, fill[0]), -.4, .96, .25)); bg.add(at(slatCrate(.4, .22, .34, fill[1]), .38, .96, .2)); bg.position.set(x, 0, z); return bg; };
  g.add(booth(-4.6, -1.3, '#d7262c', '#fff8e7', [0xd7262c, 0x3b8f4a]), booth(-1.6, -1.9, '#2d6fd3', '#fff8e7', [0xf29b20, 0xf2c230]), booth(1.6, -1.9, '#3b8f4a', '#fff8e7', [0x8a4b2a, 0xe8c9a0]), booth(4.6, -1.3, '#f2c230', '#fff8e7', [0xc93c7a, 0x9fd3f5]));
  g.add(at(barrel(), -3.1, 0, -.7)); g.add(at(barrel(.2, .5), -2.65, 0, -1.0)); g.add(at(barrel(), 3.2, 0, -.9));
  const c1 = slatCrate(.5, .35, .5, 0xd7262c); c1.position.set(2.75, 0, .1); c1.rotation.y = .3; g.add(c1); const c2 = slatCrate(.5, .35, .5); c2.position.set(2.75, .35, .1); c2.rotation.y = .3; g.add(c2); const c3 = slatCrate(.45, .3, .45, 0x3b8f4a); c3.position.set(-3.2, 0, .3); c3.rotation.y = -.2; g.add(c3);
  const sign = makeSign(['The Market'], { width: 2.0, postHeight: 2.0 }); sign.position.set(-6.0, 0, -.2); sign.rotation.y = .25; g.add(sign); g.userData.sign = sign;
  // the fountain: a stone basin, water, a column with a bowl
  const f = new THREE.Group(); const stoneM = new THREE.MeshStandardMaterial({ map: T.stone(), roughness: .95 }); stoneM.map = stoneM.map.clone(); stoneM.map.repeat.set(6, 1); stoneM.map.needsUpdate = true;
  const basin = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [1.1, 0], [1.15, .35], [1.0, .42], [.9, .42], [.9, .1], [0, .1]].map(p => new THREE.Vector2(p[0], p[1])), 24), stoneM); f.add(basin);
  const water = new THREE.Mesh(new THREE.CircleGeometry(.92, 24), new THREE.MeshPhysicalMaterial({ color: 0x5fb6e8, roughness: .05, clearcoat: 1, transparent: true, opacity: .85, emissive: 0x1a4a6a, emissiveIntensity: .3 })); water.rotation.x = -Math.PI / 2; water.position.y = .34; f.add(water);
  f.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, .9, 12), stoneM), 0, .55, 0)); f.add(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [.45, 0], [.5, .12], [.42, .14], [0, .06]].map(p => new THREE.Vector2(p[0], p[1])), 20), stoneM).translateY(.95));
  const w2 = new THREE.Mesh(new THREE.CircleGeometry(.4, 20), water.material); w2.rotation.x = -Math.PI / 2; w2.position.y = 1.08; f.add(w2); f.add(at(new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 10), MAT.gold()), 0, 1.3, 0)); f.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.04, .06, .3, 8), stoneM), 0, 1.15, 0));
  f.position.set(0, 0, .9); g.add(f); g.userData.fountain = f; g.userData.water = [water, w2];
  return shadows(g);
}

// ---------- the hidden things ----------
const EGG_BUILDERS = {
  doorbell(g) {
    const jambM = new THREE.MeshStandardMaterial({ map: T.wood('jamb', '#7a4e26', 1), roughness: .8 }); const doorM = new THREE.MeshStandardMaterial({ map: T.wood('door', '#b07a3e', 3), roughness: .75 }); const trim = MAT.paint(0xf4e9d2, { roughness: .6 });
    g.add(at(new THREE.Mesh(roundedBox(.5, .9, .05, .008, 2), doorM), -.2, .45, 0)); g.add(at(new THREE.Mesh(roundedBox(.34, .3, .02, .006, 2), trim), -.2, .62, .03)); g.add(at(new THREE.Mesh(roundedBox(.34, .3, .02, .006, 2), trim), -.2, .25, .03));
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(.028, 10, 8), MAT.gold()), -.02, .45, .05));
    g.add(at(new THREE.Mesh(roundedBox(.14, .95, .12, .012, 2), jambM), .12, .475, 0)); g.add(at(new THREE.Mesh(roundedBox(.64, .07, .12, .012, 2), jambM), -.13, .935, 0));
    g.add(at(new THREE.Mesh(roundedBox(.1, .2, .02, .01, 2), MAT.gold({ roughness: .35 })), .12, .55, .07));
    g.add(at(new THREE.Mesh(new THREE.TorusGeometry(.028, .007, 8, 20), new THREE.MeshStandardMaterial({ color: 0xaee6ff, emissive: 0x5fc8ff, emissiveIntensity: 1.2 })), .12, .53, .081));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .016, 14), new THREE.MeshStandardMaterial({ color: 0xfff8e0, emissive: 0xfff0c0, emissiveIntensity: .6 })).rotateX(Math.PI / 2), .12, .53, .083));
    const plate = memo('ringlabel', () => { const [c, g2] = canvas(128, 48); g2.fillStyle = '#f6cc4e'; g2.fillRect(0, 0, 128, 48); g2.fillStyle = '#4a3608'; g2.font = `700 28px ${FONT}`; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText('RING', 64, 25); return tex(c, { wrap: false }); });
    g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(.08, .03), new THREE.MeshStandardMaterial({ map: plate, roughness: .4 })), .12, .61, .082));
  },
  dogman(g) {
    const cover = memo('dogmancover', () => { const [c, g2] = canvas(512, 656); const gr = g2.createLinearGradient(0, 0, 0, 656); gr.addColorStop(0, '#ffd23f'); gr.addColorStop(1, '#f28a1f'); g2.fillStyle = gr; g2.fillRect(0, 0, 512, 656);
      g2.fillStyle = 'rgba(255,255,255,.22)'; for (let i = 0; i < 24; i++) { g2.beginPath(); g2.moveTo(256, 300); const a = i / 24 * Math.PI * 2; g2.arc(256, 300, 600, a, a + .13); g2.closePath(); g2.fill(); }
      // the dog-headed cop
      const X = 256, Y = 400; g2.fillStyle = '#2d5fb3'; roundRect(g2, X - 95, Y - 10, 190, 230, 40); g2.fill(); g2.fillStyle = '#1b3f80'; g2.fillRect(X - 95, Y + 150, 190, 24); g2.fillStyle = '#f6cc4e'; g2.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 9 : 20, a = -Math.PI / 2 + i * Math.PI / 5; g2.lineTo(X - 48 + Math.cos(a) * r, Y + 50 + Math.sin(a) * r); } g2.closePath(); g2.fill();
      g2.fillStyle = '#8b5a2b'; g2.beginPath(); g2.ellipse(X, Y - 60, 95, 85, 0, 0, 7); g2.fill(); for (const s of [-1, 1]) { g2.beginPath(); g2.ellipse(X + s * 95, Y - 30, 28, 60, s * .3, 0, 7); g2.fill(); }
      g2.fillStyle = '#c9915a'; g2.beginPath(); g2.ellipse(X, Y - 20, 55, 42, 0, 0, 7); g2.fill(); g2.fillStyle = '#1d1a16'; g2.beginPath(); g2.ellipse(X, Y - 38, 22, 15, 0, 0, 7); g2.fill();
      g2.lineWidth = 7; g2.strokeStyle = '#1d1a16'; g2.lineCap = 'round'; g2.beginPath(); g2.arc(X, Y - 20, 30, .15 * Math.PI, .85 * Math.PI); g2.stroke(); g2.fillStyle = '#ff7d9c'; g2.beginPath(); g2.ellipse(X, Y + 8, 14, 10, 0, 0, Math.PI); g2.fill();
      for (const s of [-1, 1]) { g2.fillStyle = '#fff'; g2.beginPath(); g2.ellipse(X + s * 38, Y - 80, 22, 24, 0, 0, 7); g2.fill(); g2.fillStyle = '#1d1a16'; g2.beginPath(); g2.arc(X + s * 34, Y - 76, 10, 0, 7); g2.fill(); g2.fillStyle = '#fff'; g2.beginPath(); g2.arc(X + s * 31, Y - 80, 3.5, 0, 7); g2.fill(); }
      g2.fillStyle = '#2d5fb3'; roundRect(g2, X - 90, Y - 165, 180, 60, 22); g2.fill(); g2.fillStyle = '#1d1a16'; roundRect(g2, X - 100, Y - 115, 200, 16, 8); g2.fill(); g2.fillStyle = '#f6cc4e'; g2.beginPath(); g2.arc(X, Y - 135, 13, 0, 7); g2.fill();
      g2.font = `900 126px ${FONT}`; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.lineWidth = 22; g2.lineJoin = 'round'; g2.strokeStyle = '#1d1a16'; g2.strokeText('Dogman', 256, 120); g2.fillStyle = '#d7262c'; g2.fillText('Dogman', 256, 114); g2.fillStyle = '#fff'; g2.fillText('Dogman', 256, 106);
      g2.font = `700 34px ${FONT}`; g2.fillStyle = '#1d1a16'; g2.fillText('a gerbil favourite', 256, 205); g2.font = `700 30px ${FONT}`; g2.fillStyle = '#fff'; g2.fillText('ALL NEW', 256, 626);
      return tex(c, { wrap: false }); });
    const W = .3, H = .385, D = .035; const pageM = new THREE.MeshStandardMaterial({ map: T.pages(), roughness: .95 }); const coverM = new THREE.MeshStandardMaterial({ map: cover, roughness: .35 }); const backM = MAT.paint(0xf28a1f, { roughness: .4 });
    const book = new THREE.Group(); book.add(at(new THREE.Mesh(roundedBox(W, H, D, .004, 2), [pageM, backM, pageM, pageM, coverM, backM]), 0, 0, 0)); book.rotation.x = -.42; book.position.set(0, H / 2 * Math.cos(.42) + .01, 0); g.add(book);
    // a little stand so it leans and reads
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(.12, .02, .2), MAT.std(0x8a7a60)), 0, .01, -.1));
  },
  motorcycle(g) {
    const red = MAT.gloss(0xd7262c), blk = MAT.paint(0x1d1a16, { roughness: .6 }), chrome = MAT.chrome();
    for (const z of [-.36, .36]) { g.add(at(new THREE.Mesh(new THREE.TorusGeometry(.15, .045, 10, 20), MAT.rubber()).rotateY(Math.PI / 2), 0, .195, z)); g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.11, .11, .03, 14), MAT.paint(0xc9ccd0, { roughness: .35, metalness: .3 })).rotateZ(Math.PI / 2), 0, .195, z)); g.add(at(new THREE.Mesh(new THREE.TorusGeometry(.2, .028, 8, 14, Math.PI * .75), z > 0 ? red : red).rotateY(Math.PI / 2).rotateZ(Math.PI * .125), 0, .21, z)); for (let i = 0; i < 3; i++) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(.02, .02, .24), blk).rotateX(i * Math.PI / 3), 0, .195, z)); }
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(.1, .12, .62), blk), 0, .3, 0)); g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.07, .09, .18, 12), chrome).rotateX(Math.PI / 2), 0, .26, .05));
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(.09, .18, 4, 12), red); tank.rotation.x = Math.PI / 2; tank.position.set(0, .43, .08); tank.scale.set(1, .8, 1); g.add(tank);
    g.add(at(new THREE.Mesh(roundedBox(.16, .06, .26, .02, 2), blk), 0, .43, -.2)); g.add(at(new THREE.Mesh(roundedBox(.17, .05, .1, .015, 2), red), 0, .47, -.36));
    for (const s of [-1, 1]) { g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, .42, 8), chrome).rotateX(-.45), s * .05, .35, .3)); g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.018, .022, .5, 8), chrome).rotateX(Math.PI / 2 + .05), s * .07, .19, -.08)); }
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .44, 8), chrome).rotateZ(Math.PI / 2), 0, .55, .26)); for (const s of [-1, 1]) g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .1, 8), blk).rotateZ(Math.PI / 2), s * .2, .55, .26));
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(.06, 12, 10), new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff0b0, emissiveIntensity: 1 })), 0, .47, .38));
    // the wings and the tail rotor
    for (const s of [-1, 1]) { const ws = new THREE.Shape(); ws.moveTo(0, -.07); ws.lineTo(s * .4, -.02); ws.lineTo(s * .46, .02); ws.lineTo(s * .38, .07); ws.lineTo(0, .08); ws.closePath(); const wg = new THREE.ExtrudeGeometry(ws, { depth: .018, bevelEnabled: true, bevelSize: .006, bevelThickness: .005, bevelSegments: 2 });
      const w = new THREE.Mesh(wg, MAT.paint(0xf4e9d2, { roughness: .35 })); w.rotation.x = -Math.PI / 2; w.position.set(s * .07, .33, .02); w.rotation.z = -s * .08; g.add(w); g.add(at(new THREE.Mesh(new THREE.SphereGeometry(.022, 8, 6), red), s * .5, .33, .0)); g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.01, .01, .14, 6), chrome).rotateZ(Math.PI / 2 + s * .5), s * .12, .3, .02)); }
    const rotor = new THREE.Group(); rotor.add(new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .04, 10), chrome).rotateX(Math.PI / 2)); for (const a of [0, Math.PI / 2]) { const b = new THREE.Mesh(roundedBox(.3, .03, .012, .005, 2), MAT.paint(0xf4e9d2)); b.rotation.z = a; rotor.add(b); } rotor.position.set(0, .5, -.5); g.add(rotor); g.userData.spinner = rotor;
  },
  legoguy(g) {
    const yel = MAT.gloss(0xf2c230, { roughness: .4 }), blue = MAT.gloss(0x2d6fd3, { roughness: .45 }), red = MAT.gloss(0xd7262c, { roughness: .4 }); const S = 1.3;
    const face = memo('legoface', () => { const [c, g2] = canvas(512, 256); g2.fillStyle = '#f2c230'; g2.fillRect(0, 0, 512, 256); g2.fillStyle = '#1d1a16'; for (const s of [-1, 1]) { g2.beginPath(); g2.ellipse(256 + s * 42, 100, 13, 16, 0, 0, 7); g2.fill(); } g2.lineWidth = 11; g2.lineCap = 'round'; g2.strokeStyle = '#1d1a16'; g2.beginPath(); g2.arc(256, 108, 62, .22 * Math.PI, .78 * Math.PI); g2.stroke(); g2.fillStyle = 'rgba(0,0,0,.08)'; return tex(c, { wrap: false }); });
    const shirt = memo('legoshirt', () => { const [c, g2] = canvas(256, 256); g2.fillStyle = '#d7262c'; g2.fillRect(0, 0, 256, 256); g2.fillStyle = '#fff'; roundRect(g2, 52, 70, 152, 120, 18); g2.fill(); g2.fillStyle = '#2d6fd3'; g2.fillRect(78, 112, 100, 48); g2.fillStyle = '#1b4fa8'; g2.fillRect(78, 150, 100, 10); for (const x of [92, 128]) { g2.fillStyle = '#2d6fd3'; g2.fillRect(x, 100, 36, 14); g2.fillStyle = '#5a93e8'; g2.fillRect(x, 100, 36, 4); } g2.fillStyle = '#1d1a16'; g2.fillRect(118, 0, 20, 70); return tex(c, { wrap: false }); });
    // legs and hips
    for (const s of [-1, 1]) { g.add(at(new THREE.Mesh(roundedBox(.095 * S, .18 * S, .11 * S, .006, 2), blue), s * .052 * S, .09 * S, 0)); g.add(at(new THREE.Mesh(new THREE.BoxGeometry(.095 * S, .03 * S, .035 * S), blue), s * .052 * S, .1 * S, -.07 * S)); }
    g.add(at(new THREE.Mesh(roundedBox(.21 * S, .06 * S, .1 * S, .006, 2), blue), 0, .21 * S, 0));
    // torso: a tapered box
    const tg = new THREE.BoxGeometry(.22 * S, .2 * S, .1 * S, 1, 1, 1); { const p = tg.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setX(i, p.getX(i) * .84); tg.computeVertexNormals(); }
    const torso = new THREE.Mesh(tg, [red, red, red, red, new THREE.MeshStandardMaterial({ map: shirt, roughness: .3 }), red]); torso.position.y = .34 * S; g.add(torso);
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.03 * S, .03 * S, .02 * S, 12), yel), 0, .45 * S, 0));
    for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.03 * S, .12 * S, 4, 10), red); arm.position.set(s * .12 * S, .36 * S, .01 * S); arm.rotation.z = s * .2; arm.rotation.x = -.25; g.add(arm); const hand = new THREE.Mesh(new THREE.TorusGeometry(.022 * S, .012 * S, 8, 12, Math.PI * 1.5), yel); hand.position.set(s * .145 * S, .27 * S, .05 * S); hand.rotation.set(Math.PI / 2, 0, -Math.PI / 4); g.add(hand); }
    const head = new THREE.Mesh(new THREE.CylinderGeometry(.075 * S, .075 * S, .13 * S, 24), [new THREE.MeshPhysicalMaterial({ map: face, roughness: .3, clearcoat: 1 }), yel, yel]); head.position.y = .525 * S; head.rotation.y = Math.PI; g.add(head);
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.04 * S, .04 * S, .025 * S, 16), yel), 0, .6 * S, 0));
  },
  truck(g) {
    const woodM = new THREE.MeshStandardMaterial({ map: T.wood('toy', '#d9b47c', 1), roughness: .7 }); const red = MAT.paint(0xd7262c, { roughness: .4 }), blue = MAT.paint(0x2d6fd3, { roughness: .4 });
    g.add(at(new THREE.Mesh(roundedBox(.3, .07, .62, .015, 3), woodM), 0, .145, 0));
    g.add(at(new THREE.Mesh(roundedBox(.3, .26, .22, .03, 3), woodM), 0, .31, .18)); g.add(at(new THREE.Mesh(roundedBox(.31, .04, .24, .01, 2), red), 0, .455, .18));
    for (const s of [-1, 1]) { g.add(at(new THREE.Mesh(roundedBox(.16, .11, .01, .01, 2), MAT.glass({ color: 0x5f8fb8 })), s * .151, .34, .18).rotateY(Math.PI / 2)); g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .02, 12), MAT.gold()).rotateX(Math.PI / 2), s * .09, .3, .3)); }
    g.add(at(new THREE.Mesh(roundedBox(.22, .1, .01, .01, 2), MAT.glass({ color: 0x5f8fb8 })), 0, .36, .292));
    g.add(at(new THREE.Mesh(roundedBox(.3, .06, .03, .01, 2), red), 0, .21, -.295)); for (const s of [-1, 1]) g.add(at(new THREE.Mesh(roundedBox(.03, .06, .4, .008, 2), red), s * .135, .21, -.1));
    for (const sx of [-1, 1]) for (const z of [.17, -.2]) { g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.085, .085, .05, 16), woodM).rotateZ(Math.PI / 2), sx * .165, .085, z)); g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .06, 12), blue).rotateZ(Math.PI / 2), sx * .17, .085, z)); }
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .4, 8), MAT.chrome()).rotateZ(Math.PI / 2), 0, .085, .17)); g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .4, 8), MAT.chrome()).rotateZ(Math.PI / 2), 0, .085, -.2));
    const cargo = legoBrick(2, 2, .09, 0x3b8f4a); cargo.position.set(0, .18, -.12); cargo.rotation.y = .2; g.add(cargo);
  },
  nerf(g) {
    const org = MAT.paint(0xf47c20, { roughness: .45 }), blue = MAT.paint(0x2d6fd3, { roughness: .45 }), white = MAT.paint(0xf4f1ea, { roughness: .5 }), grey = MAT.paint(0x3a3a40, { roughness: .7 });
    const b = new THREE.Group();
    b.add(at(new THREE.Mesh(roundedBox(.08, .15, .38, .02, 3), org), 0, .2, .02)); b.add(at(new THREE.Mesh(roundedBox(.07, .1, .18, .02, 3), org), 0, .19, -.25)); b.add(at(new THREE.Mesh(roundedBox(.075, .13, .04, .015, 2), blue), 0, .19, -.35));
    b.add(at(new THREE.Mesh(roundedBox(.09, .06, .3, .015, 2), white), 0, .26, .05)); b.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.038, .038, .22, 14), blue).rotateX(Math.PI / 2), 0, .22, .3)); b.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .04, 14), org).rotateX(Math.PI / 2), 0, .22, .42));
    b.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .12, 10), org).rotateX(Math.PI / 2), 0, .22, .46)); b.add(at(new THREE.Mesh(new THREE.SphereGeometry(.02, 10, 8), blue), 0, .22, .52));
    const grip = at(new THREE.Mesh(roundedBox(.06, .17, .07, .015, 2), blue), 0, .07, -.08); grip.rotation.x = .3; b.add(grip); b.add(at(new THREE.Mesh(new THREE.TorusGeometry(.035, .008, 6, 12, Math.PI), grey).rotateY(Math.PI / 2).rotateX(Math.PI), 0, .11, .0));
    b.add(at(new THREE.Mesh(roundedBox(.05, .12, .09, .01, 2), org), 0, .09, .1)); for (let i = 0; i < 3; i++) b.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.016, .016, .055, 8), org).rotateZ(Math.PI / 2), 0, .11 + i * .0, .08 + i * .03));
    b.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .09, 12), white).rotateZ(Math.PI / 2), 0, .22, .16)); b.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, .1, 8), grey).rotateZ(Math.PI / 2), 0, .22, .16));
    b.rotation.x = -.35; g.add(b);
  },
  racecar(g) { g.add(smallCar({ kind: 'race', len: .95, color: 0xd7262c })); },
  ev(g) {
    const car = smallCar({ kind: 'ev', len: .85, color: 0x2fb3a8 }); g.add(car); const post = new THREE.Group(); const white = MAT.paint(0xf4f1ea, { roughness: .75 }), green = MAT.paint(0x3b8f4a, { roughness: .6 });
    post.add(at(new THREE.Mesh(roundedBox(.2, .85, .14, .03, 3), white), 0, .425, 0)); post.add(at(new THREE.Mesh(roundedBox(.2, .14, .14, .03, 2), green), 0, .8, 0)); post.add(at(new THREE.Mesh(new THREE.PlaneGeometry(.12, .1), new THREE.MeshStandardMaterial({ color: 0x9fe8c0, emissive: 0x4ad080, emissiveIntensity: .8 })), 0, .62, .071));
    const bolt = memo('bolt', () => { const [c, g2] = canvas(64, 64); g2.fillStyle = '#f2c230'; g2.beginPath(); g2.moveTo(38, 4); g2.lineTo(14, 36); g2.lineTo(30, 36); g2.lineTo(24, 60); g2.lineTo(50, 26); g2.lineTo(34, 26); g2.closePath(); g2.fill(); return tex(c, { wrap: false }); });
    post.add(at(new THREE.Mesh(new THREE.PlaneGeometry(.08, .08), new THREE.MeshStandardMaterial({ map: bolt, transparent: true, roughness: .4 })), 0, .45, .071));
    post.position.set(-.55, 0, -.15); g.add(post);
    const port = car.userData.port; const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-.5, .5, -.08), new THREE.Vector3(-.55, .18, -.15), new THREE.Vector3(-.42, .12, -.25), new THREE.Vector3(port.x - .02, port.y, port.z)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, .012, 6), MAT.paint(0x222, { roughness: .6 }))); g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .04, 10), MAT.paint(0x333)).rotateZ(Math.PI / 2), port.x - .018, port.y, port.z));
  },
  nc(g) {
    const woodM = new THREE.MeshStandardMaterial({ map: T.wood('post', '#8b5a2b', 1), roughness: .85 }); g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.04, .05, 1.6, 10), woodM), 0, .8, 0)); g.add(at(new THREE.Mesh(new THREE.SphereGeometry(.055, 10, 8), woodM), 0, 1.6, 0));
    const bw = 1.15, bh = .34, tip = .18; const sh = new THREE.Shape(); sh.moveTo(-bw / 2, -bh / 2); sh.lineTo(bw / 2 - tip, -bh / 2); sh.lineTo(bw / 2, 0); sh.lineTo(bw / 2 - tip, bh / 2); sh.lineTo(-bw / 2, bh / 2); sh.closePath();
    const [c, g2] = canvas(1024, 304); g2.fillStyle = '#f6ecd4'; g2.fillRect(0, 0, 1024, 304); g2.strokeStyle = '#7a4e26'; g2.lineWidth = 14; g2.strokeRect(0, 0, 1024, 304); g2.fillStyle = '#2b2418'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.font = `700 118px ${FONT}`; g2.fillText('North Carolina →', 480, 100); g2.font = `700 96px ${FONT}`; g2.fillText('1,100 miles', 480, 220);
    const t = tex(c, { wrap: false }); t.repeat.set(1 / bw, 1 / bh); t.offset.set(.5, .5); const faceM = new THREE.MeshStandardMaterial({ map: t, roughness: .7 });
    const board = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: .04, bevelEnabled: true, bevelSize: .008, bevelThickness: .006, bevelSegments: 2 }), [faceM, woodM]); board.position.set(.12, 1.25, .045); g.add(board);
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(.1, .08, .06), MAT.chrome({ color: 0x777 })), 0, 1.25, .02));
  },
  lego(g) { g.add(legoBrick(4, 2, .08, 0xd7262c)); },
};
export const EGG_IDS = Object.keys(EGG_BUILDERS);
const EGG_KEEP_ORIGIN = new Set(['nc', 'ev']);
export function makeEgg(id) { const g = new THREE.Group(); (EGG_BUILDERS[id] || EGG_BUILDERS.lego)(g); settle(g, !EGG_KEEP_ORIGIN.has(id)); g.userData.id = id; return shadows(g); }

// ---------- the coin sprite ----------
export function makeCoinBurstTexture() {
  const [c, g] = canvas(128, 128); const gr = g.createRadialGradient(52, 48, 6, 64, 64, 60); gr.addColorStop(0, '#fff2a8'); gr.addColorStop(.55, '#f2c230'); gr.addColorStop(1, '#b8860b');
  g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill(); g.strokeStyle = '#8a6508'; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 55, 0, 7); g.stroke(); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 46, Math.PI * 1.1, Math.PI * 1.7); g.stroke();
  g.fillStyle = '#8a6508'; g.font = `900 70px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 64, 68); g.fillStyle = '#fff2a8'; g.fillText('$', 61, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- the gerbil: face, fur, beard, crown; run cycle ----------
// The hamster model, scaled by parts.gerbilFrom to 0.4 m: nose tip (0, .045, .20), painted eyes at (±.022, .069, .174),
// ears widest at (±.053, .106, .12), head top y≈.13, body centre y≈.0675 (userData.body.position.y).
export function dressGerbil(group, { color = 0xd9b07a, boss = false, hair = 0x3a2a1a, beard = false } = {}) {
  const ud = group.userData; const body = ud.body; if (!body) return group; if (ud.dressed) return group;
  const baseY = body.position.y; const tint = new THREE.Color(color);
  // gerbilFrom({beard:true}) adds a crude cone beard and hair as loose meshes; ours replace them
  for (const ch of [...group.children]) if (ch.isMesh && !(ud.cheeks || []).includes(ch)) group.remove(ch);
  let map = null; body.traverse(o => { if (o.isMesh) { map = map || o.material.map || null; } });
  const fur = new THREE.MeshStandardMaterial({ map, color: tint, roughness: .9, metalness: 0, emissive: tint.clone().multiplyScalar(.12) });
  body.traverse(o => { if (o.isMesh) { o.material = fur; o.castShadow = true; o.receiveShadow = true; } }); ud.mat = fur;
  const furPlain = new THREE.MeshStandardMaterial({ color: tint.clone().multiply(new THREE.Color(0xc4823d)), roughness: .9, emissive: tint.clone().multiplyScalar(.06) }); ud.furPlain = furPlain;
  // everything on the face lives in one group pivoted like the body so squash/stretch moves it too
  const face = new THREE.Group(); face.position.y = baseY; group.add(face); ud.face = face; const P = (m, x, y, z) => { m.position.set(x, y - baseY, z); face.add(m); return m; };
  for (const ch of ud.cheeks || []) { ch.material = furPlain; const p = ch.position.clone(); P(ch, p.x, p.y, p.z); }
  const eyeM = new THREE.MeshPhysicalMaterial({ color: 0x0a0806, roughness: .08, clearcoat: 1, clearcoatRoughness: .02 }); const glintM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  ud.eyes = []; for (const s of [-1, 1]) { const e = P(new THREE.Mesh(new THREE.SphereGeometry(.0125, 14, 10), eyeM), s * .0245, .07, .1755); ud.eyes.push(e); P(new THREE.Mesh(new THREE.SphereGeometry(.0035, 6, 5), glintM), s * .021, .0755, .186); }
  const noseM = new THREE.MeshStandardMaterial({ color: 0xf09aa8, roughness: .5 }); const nose = P(new THREE.Mesh(new THREE.SphereGeometry(.0125, 12, 8), noseM), 0, .047, .2); nose.scale.set(1.1, .8, .8); ud.nose = nose;
  ud.ears = []; for (const s of [-1, 1]) { const ear = new THREE.Group(); ear.position.set(s * .046, .1, .118); const inner = new THREE.Mesh(new THREE.SphereGeometry(.015, 10, 8), noseM); inner.scale.set(.75, 1, .35); inner.rotation.y = s * .8; inner.position.set(s * .005, .004, .008); ear.add(inner); const outer = new THREE.Mesh(new THREE.SphereGeometry(.019, 10, 8), furPlain); outer.scale.set(.8, 1, .3); outer.rotation.y = s * .8; outer.position.set(s * .0, .0, .0); ear.add(outer); ear.userData.rz = s * .35; ear.rotation.z = ear.userData.rz; ear.position.y -= baseY; face.add(ear); ud.ears.push(ear); }
  const wg = new THREE.BufferGeometry(); const wp = []; for (const s of [-1, 1]) for (const [dy, dz] of [[.012, -.01], [0, -.025], [-.012, -.035]]) wp.push(s * .012, .052, .19, s * .075, .052 + dy * 2.2, .19 + dz - .01); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  const whisk = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x2b2418, transparent: true, opacity: .7 })); whisk.position.y = -baseY; face.add(whisk); ud.whiskers = whisk;
  // the tail: fur.js's makeTail, three segments and a tuft, so the gait can swing and curl it
  const tailPiv = makeTail(furPlain); tailPiv.position.set(0, .045 - baseY, -.18); face.add(tailPiv); ud.tail = tailPiv;
  if (boss || beard) {
    const hairM = new THREE.MeshStandardMaterial({ color: hair, roughness: .95 }); const hairG = new THREE.Group(); face.add(hairG); ud.hair = hairG; const H = (m, x, y, z) => { m.position.set(x, y - baseY, z); hairG.add(m); return m; };
    // beard: a chin tuft with two jowls; moustache: two swept lobes under the nose
    const chin = H(new THREE.Mesh(new THREE.SphereGeometry(.019, 10, 8), hairM), 0, .028, .19); chin.scale.set(1.3, .8, .8);
    const goatee = H(new THREE.Mesh(new THREE.ConeGeometry(.013, .04, 8), hairM), 0, .014, .205); goatee.rotation.x = Math.PI + .5;
    for (const s of [-1, 1]) { const jowl = H(new THREE.Mesh(new THREE.SphereGeometry(.02, 8, 6), hairM), s * .03, .038, .17); jowl.scale.set(.8, 1, 1.1); const mu = H(new THREE.Mesh(new THREE.CapsuleGeometry(.0075, .03, 4, 8), hairM), s * .02, .04, .203); mu.rotation.z = Math.PI / 2 + s * .5; mu.rotation.y = -s * .3; }
    const cap = H(new THREE.Mesh(new THREE.SphereGeometry(.058, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.1), hairM), 0, .082, .09); cap.scale.set(1.0, .85, 1.1); cap.rotation.x = -.2;
    const quiff = H(new THREE.Mesh(new THREE.SphereGeometry(.026, 10, 7), hairM), 0, .126, .125); quiff.scale.set(1.3, .55, 1.1); quiff.rotation.x = .35;
    if (boss) { const crown = new THREE.Group(); const gm = MAT.gold(); crown.add(new THREE.Mesh(new THREE.CylinderGeometry(.024, .021, .018, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xf6cc4e, roughness: .3, metalness: .7, emissive: 0x5a4210, emissiveIntensity: .4, side: THREE.DoubleSide })));
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; crown.add(at(new THREE.Mesh(new THREE.ConeGeometry(.006, .016, 6), gm), Math.cos(a) * .022, .016, Math.sin(a) * .022)); crown.add(at(new THREE.Mesh(new THREE.SphereGeometry(.004, 6, 5), MAT.paint([0xd7262c, 0x2d6fd3, 0x3b8f4a][i % 3], { roughness: .2 })), Math.cos(a) * .0235, .004, Math.sin(a) * .0235)); }
      crown.position.set(.014, .138 - baseY, .085); crown.rotation.z = -.28; crown.rotation.x = -.15; hairG.add(crown); ud.crown = crown; }
  }
  shadows(face); whisk.castShadow = false; ud.dressed = true; return group;
}

// One gait for every gerbil (the player, the townsfolk, the friends on the road, the hub kid): fur.js's.
export function animateGerbil(group, opts) { return gait(group, opts); }

// ---------- a small environment map so clearcoat and metal have something to reflect ----------
export function makeEnvironment(renderer) {
  const scene = new THREE.Scene(); const geo = new THREE.SphereGeometry(10, 16, 10); const pos = geo.attributes.position; const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x3f86d8), mid = new THREE.Color(0xcfe6f6), low = new THREE.Color(0x6f8a45);
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 10; const c = y > 0 ? mid.clone().lerp(top, Math.min(1, y * 1.4)) : low.clone().lerp(mid, Math.min(1, 1 + y * 2.5)); col.set([c.r, c.g, c.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8.5, 7) })); sun.position.set(-5, 6, 4); scene.add(sun);
  const pm = new THREE.PMREMGenerator(renderer); const t = pm.fromScene(scene, .04).texture; pm.dispose(); return t;
}
