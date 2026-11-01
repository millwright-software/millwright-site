// art/sprites.js — the sprite pipeline for the "paper theatre" hybrid look (docs/ART-DIRECTION.md).
//
// An SVG file in web/art/sprites/ → recoloured by hex swap → rasterised at 2x on a canvas → optional text written on it
// (Fredoka; an SVG drawn as an <img> cannot see page fonts) → edge colour bled into the transparent pixels (so mipmaps
// never grow dark fringes) → a DataTexture with full mipmaps and anisotropy.
//
// A billboard is a Group: root (position, blob shadow) → pivot (yaw: parallel to the image plane, so a row of sprites never
// fans out) → card (lean back by a share of the camera pitch, flip on x for facing). The card's normals all point up, so
// a Lambert material lights it like the ground under it: full sun in the open, darker under a roof, with real shadows.
// Edges are alpha-to-coverage with alphaTest .5: crisp at every distance, written to depth, so no sorting is needed.
import * as THREE from 'three';

const texCache = new Map();
let maxAniso = 8;
export function setRenderer(r) { maxAniso = r.capabilities.getMaxAnisotropy(); }

export const SPRITE_DIR = new URL('../../art/sprites/', import.meta.url).href;
export const FONT = 'Fredoka, "Arial Rounded MT Bold", sans-serif';

// recolor: { '#c98f4e': '#8d8d8d', ... } (hexes as written in the SVG). text: (g, w, h, s) draws on the 2x canvas, s = scale.
export async function spriteTexture(name, { recolor = null, text = null, scale = 2, key = '' } = {}) {
  const k = name + '|' + JSON.stringify(recolor) + '|' + key; if (texCache.has(k)) return texCache.get(k);
  const p = (async () => {
    let svg = await (await fetch(SPRITE_DIR + name + '.svg')).text();
    if (recolor) for (const [a, b] of Object.entries(recolor)) svg = svg.split(a).join(b);
    const vb = svg.match(/viewBox="([^"]+)"/)[1].trim().split(/[\s,]+/).map(Number);
    const w = Math.round(vb[2] * scale), h = Math.round(vb[3] * scale);
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode();
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h); if (text) text(g, w, h, scale);
    const src = g.getImageData(0, 0, w, h).data; bleed(src, w, h, 10);
    const out = new Uint8Array(w * h * 4); const row = w * 4;   // flip rows: canvas row 0 is the top, UV v=0 is the bottom
    for (let y = 0; y < h; y++) out.set(src.subarray(y * row, (y + 1) * row), (h - 1 - y) * row);
    const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat); t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = maxAniso;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; t.userData.aspect = w / h; t.userData.name = name;
    return t;
  })();
  texCache.set(k, p); return p;
}

// Copy colour outward into fully transparent pixels (alpha stays 0), a ring per pass.
function bleed(d, w, h, passes) {
  const filled = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) filled[i] = d[i * 4 + 3] > 0 ? 1 : 0;
  for (let p = 0; p < passes; p++) {
    const add = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (filled[i]) continue; let r = 0, g = 0, b = 0, n = 0;
      if (x > 0 && filled[i - 1]) { r += d[i * 4 - 4]; g += d[i * 4 - 3]; b += d[i * 4 - 2]; n++; }
      if (x < w - 1 && filled[i + 1]) { r += d[i * 4 + 4]; g += d[i * 4 + 5]; b += d[i * 4 + 6]; n++; }
      if (y > 0 && filled[i - w]) { const j = (i - w) * 4; r += d[j]; g += d[j + 1]; b += d[j + 2]; n++; }
      if (y < h - 1 && filled[i + w]) { const j = (i + w) * 4; r += d[j]; g += d[j + 1]; b += d[j + 2]; n++; }
      if (n) add.push(i, r / n, g / n, b / n);
    }
    if (!add.length) break;
    for (let k = 0; k < add.length; k += 4) { const i = add[k]; d[i * 4] = add[k + 1]; d[i * 4 + 1] = add[k + 2]; d[i * 4 + 2] = add[k + 3]; filled[i] = 1; }
  }
}

// ---------- text written onto a sprite (signs, the jar's label) ----------
export function fitText(g, str, cx, cy, maxW, maxH, { color = '#3b2516', weight = 700 } = {}) {
  let size = maxH; g.font = `${weight} ${size}px ${FONT}`; while (g.measureText(str).width > maxW && size > 8) { size -= 2; g.font = `${weight} ${size}px ${FONT}`; }
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(str, cx, cy + size * .04);
}

// ---------- blob shadow ----------
let blobTex = null;
function blobTexture() {
  if (blobTex) return blobTex; const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(30,24,40,.55)'); gr.addColorStop(.55, 'rgba(30,24,40,.32)'); gr.addColorStop(1, 'rgba(30,24,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); blobTex = new THREE.CanvasTexture(c); return blobTex;
}
export function blobShadow(w, d, opacity = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.rotation.x = -Math.PI / 2; m.position.y = .015; m.renderOrder = 1; return m;
}

// ---------- billboards ----------
export const billboards = [];
// height in metres; anchor = how far up from the bottom of the image the ground line sits (0..1); lean = share of camera pitch;
// cast = real shadow from the sun (big sprites; then it does not receive, to avoid self-shadow acne); blob = blob shadow width share.
export function billboard(tex, { height = 1, anchor = 0, lean = .5, cast = false, blob = .7, blobDepth = .35, unlit = false, tint = 0xffffff } = {}) {
  const aspect = tex.userData.aspect || 1, w = height * aspect;
  const geo = new THREE.PlaneGeometry(w, height); geo.translate(0, height / 2 - anchor * height, 0);
  const n = geo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  const mat = unlit ? new THREE.MeshBasicMaterial({ map: tex, color: tint, alphaTest: .5, alphaToCoverage: true, side: THREE.DoubleSide })
    : new THREE.MeshLambertMaterial({ map: tex, color: tint, alphaTest: .5, alphaToCoverage: true, side: THREE.DoubleSide });
  const card = new THREE.Mesh(geo, mat);
  if (cast) { card.castShadow = true; card.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: .5, side: THREE.DoubleSide }); }
  else card.receiveShadow = !unlit;
  const pivot = new THREE.Group(); pivot.add(card);
  const root = new THREE.Group(); root.add(pivot);
  if (blob) { const b = blobShadow(w * blob, w * blob * blobDepth * 1.4); root.add(b); root.userData.blob = b; }
  root.userData.sprite = { card, pivot, lean, facing: 1, w, h: height };
  billboards.push(root); return root;
}

const _f = new THREE.Vector3();
// Call once per frame per camera before rendering it.
export function faceCamera(camera, list = billboards) {
  camera.getWorldDirection(_f); const yaw = Math.atan2(-_f.x, -_f.z); const pitch = Math.asin(THREE.MathUtils.clamp(-_f.y, -1, 1));
  for (const r of list) { const s = r.userData.sprite; if (!s) continue; s.pivot.rotation.y = yaw - (r.parent?.rotation?.y || 0) - r.rotation.y; s.card.rotation.x = -pitch * s.lean; s.card.scale.x = s.facing * (s.squashX || 1); }
}
// facing from a world-space velocity: +1 if it moves to the camera's right
const _r = new THREE.Vector3();
export function faceFrom(root, vx, vz, camera) { camera.getWorldDirection(_f); _r.set(-_f.z, 0, _f.x); const d = vx * _r.x + vz * _r.z; if (Math.abs(d) > 1e-3) root.userData.sprite.facing = d > 0 ? 1 : -1; }
