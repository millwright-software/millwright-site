// Shared pieces: textures, text signs, the gerbil, the money bag.
import * as THREE from 'three';
import { artMode, paperLegoBoxTexture, paperTextSprite } from './art/paper-props.js';

export function legoBoxTexture(repeat) {
  if (artMode() === 'paper') return paperLegoBoxTexture(repeat);
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#f2c230'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#d7262c'; g.fillRect(0, 0, 128, 28);
  g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif'; g.fillText('LEGO', 8, 22);
  g.fillStyle = '#2d6fd3'; g.fillRect(14, 44, 100, 70);
  g.fillStyle = '#f2c230'; for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(28 + i * 24, 60 + j * 22, 7, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 4; g.strokeRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; return t;
}

function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

export function textSprite(lines, opts = {}) {
  if (artMode() === 'paper') return paperTextSprite(lines, opts);
  const size = opts.size || 48, pad = 24, w = 1024; const c = document.createElement('canvas'); const g = c.getContext('2d');
  const h = pad * 2 + lines.length * size * 1.25; c.width = w; c.height = h;
  g.fillStyle = opts.bg || 'rgba(255,248,231,.95)'; roundRect(g, 0, 0, w, h, 28); g.fill();
  g.strokeStyle = opts.stroke || '#8a7a58'; g.lineWidth = 6; roundRect(g, 3, 3, w - 6, h - 6, 26); g.stroke();
  g.fillStyle = '#2b2418'; g.textAlign = 'center';
  lines.forEach((l, i) => { g.font = `${i === 0 ? 'bold' : 'normal'} ${i === 0 ? size : size * 0.8}px sans-serif`; g.fillText(l, w / 2, pad + size + i * size * 1.25); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: opts.depthTest !== false }));
  const scale = opts.scale || 1; m.scale.set(scale * 2.2, scale * 2.2 * h / w, 1); return m;
}

// A gerbil, facing +z, about 0.35 m long at scale 1. opts.beard adds a beard, a mustache and hair (the boys' spec for the giants).
export function makeGerbil(color = 0xc98f4e, scale = 1, opts = {}) {
  const g = new THREE.Group(); const mat = new THREE.MeshStandardMaterial({ color, roughness: .9 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.07, .12, 6, 12), mat); body.rotation.x = Math.PI / 2; body.position.y = .09; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.065, 16, 12), mat); head.position.set(0, .13, .13); g.add(head);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.015, 8, 8), new THREE.MeshStandardMaterial({ color: 0x4a2a1a })); nose.position.set(0, .12, .195); g.add(nose);
  const eyeM = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.012, 8, 8), eyeM); eye.position.set(s * .035, .15, .175); g.add(eye);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(.025, 10, 8), mat); ear.position.set(s * .045, .19, .11); ear.scale.z = .5; g.add(ear);
    for (const z of [.06, -.06]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, .05, 8), mat); leg.position.set(s * .045, .025, z); g.add(leg); }
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(.006, .012, .16, 8), mat); tail.position.set(0, .07, -.17); tail.rotation.x = Math.PI / 2 + .5; g.add(tail);
  if (opts.beard) {
    const hairM = new THREE.MeshStandardMaterial({ color: opts.hair || 0x3a2a1a, roughness: 1 });
    const beard = new THREE.Mesh(new THREE.ConeGeometry(.045, .09, 10), hairM); beard.position.set(0, .07, .16); beard.rotation.x = Math.PI; g.add(beard);
    for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(.008, .03, 4, 8), hairM); m.position.set(s * .025, .105, .19); m.rotation.z = Math.PI / 2 + s * .35; g.add(m); }
    const hair = new THREE.Mesh(new THREE.SphereGeometry(.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), hairM); hair.position.set(0, .165, .12); hair.rotation.x = -.3; g.add(hair);
  }
  // cheek pouches (the fight: bags carried); hidden until used
  g.userData.cheeks = [];
  for (const s of [-1, 1]) { const ch = new THREE.Mesh(new THREE.SphereGeometry(.035, 10, 8), mat); ch.position.set(s * .06, .115, .14); ch.visible = false; g.add(ch); g.userData.cheeks.push(ch); }
  g.userData.mat = mat; g.scale.setScalar(scale); return g;
}

// A money bag: brown sack with a red tie and a gold coin on the front.
export function makeBag(scale = 1) {
  const g = new THREE.Group(); const mat = toon(0x9c6a3a);
  const sack = new THREE.Mesh(new THREE.SphereGeometry(.22, 12, 10), mat); sack.position.y = .22; sack.scale.y = 1.15; g.add(sack);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.06, .1, .12, 8), mat); neck.position.y = .48; g.add(neck);
  const tie = new THREE.Mesh(new THREE.TorusGeometry(.07, .02, 6, 12), toon(0xd7262c)); tie.position.y = .45; tie.rotation.x = Math.PI / 2; g.add(tie);
  const coin = new THREE.Mesh(new THREE.CircleGeometry(.09, 16), toon(0xf2c230)); coin.position.set(0, .24, .215); g.add(coin);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; }); g.scale.setScalar(scale); return g;
}

// ---------- the look: toon materials, the real gerbil model, sky, clouds, trees, bursts ----------
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const toonGradient = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 1; const g = c.getContext('2d'); ['#6a6a6a', '#a8a8a8', '#e0e0e0', '#ffffff'].forEach((col, i) => { g.fillStyle = col; g.fillRect(i, 0, 1, 1); }); const t = new THREE.CanvasTexture(c); t.minFilter = t.magFilter = THREE.NearestFilter; return t; })();
export const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: toonGradient, ...extra });

// The gerbil is Poly by Google's low-poly hamster (CC-BY), tinted, rigged here with a four-bone spine. Faces +z (FACING = 0:
// the model's nose is at +z, and every heading in the game is atan2(x, z) of the way she goes); 0.4 m long at scale 1.
let hamster = null; const HAMSTER_LEN = 111.67, HAMSTER_MINY = -18.85;
export const FACING = 0;
export async function loadHamster() { try { const gltf = await new GLTFLoader().loadAsync('models/hamster.glb'); hamster = gltf.scene; } catch (e) { console.warn('hamster model missing; primitive gerbil instead', e); } return hamster; }
// The rig: four bones along the spine in the model's own units (z = length, nose at +z), weights by z so the coat bends
// smoothly: the rump to the hips bone, the middle to spine and chest, the head (from just behind the ears) to the head.
// fur.js animates them (animateGerbil). Pivots sit high, along the back, so a bend humps the back and folds the belly.
const RIG_BONES = [[0, 8, -30], [0, 8, -12], [0, 8, 8], [0, 6, 26]];       // root (hips), spine, chest, head: world z in model units
const RIG_KNOTS = [[-34, 0], [-12, 1], [12, 2], [20, 2], [40, 3]];          // [z, bone]: full weight at a knot, smoothstep between
function skinWeights(geo) {
  if (geo.attributes.skinIndex) return;
  const pos = geo.attributes.position, n = pos.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const z = pos.getZ(i); let a = 0, b = 0, t = 0;
    if (z <= RIG_KNOTS[0][0]) { a = b = RIG_KNOTS[0][1]; }
    else if (z >= RIG_KNOTS[RIG_KNOTS.length - 1][0]) { a = b = RIG_KNOTS[RIG_KNOTS.length - 1][1]; }
    else for (let k = 0; k < RIG_KNOTS.length - 1; k++) { const [z0, b0] = RIG_KNOTS[k], [z1, b1] = RIG_KNOTS[k + 1]; if (z >= z0 && z <= z1) { a = b0; b = b1; const u = (z - z0) / (z1 - z0); t = u * u * (3 - 2 * u); break; } }
    si[i * 4] = a; si[i * 4 + 1] = b; sw[i * 4] = a === b ? 1 : 1 - t; sw[i * 4 + 1] = a === b ? 0 : t;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
}
function rigBody(m) {
  let src = null; m.traverse(o => { if (!src && o.isMesh) src = o; }); if (!src) return;
  skinWeights(src.geometry);
  const sk = new THREE.SkinnedMesh(src.geometry, src.material); sk.name = src.name; sk.position.copy(src.position); sk.quaternion.copy(src.quaternion); sk.scale.copy(src.scale); sk.castShadow = true;
  const par = src.parent; par.add(sk); par.remove(src);
  const bones = []; let prev = null, prevW = [0, 0, 0];
  for (const w of RIG_BONES) { const b = new THREE.Bone(); b.position.set(w[0] - prevW[0], w[1] - prevW[1], w[2] - prevW[2]); (prev || sk).add(b); bones.push(b); prev = b; prevW = w; }
  sk.updateMatrixWorld(true); sk.bind(new THREE.Skeleton(bones));
  src.geometry.computeBoundingSphere(); sk.boundingSphere = src.geometry.boundingSphere.clone(); sk.boundingSphere.radius *= 1.5;
}
export function gerbilFrom(opts = {}) {
  if (!hamster) return makeGerbil(opts.color, opts.scale, opts);
  const g = new THREE.Group(); const m = hamster.clone(true); let mat = null;
  rigBody(m);
  m.traverse(o => { if (o.isMesh) { const src = o.material; mat = new THREE.MeshToonMaterial({ map: src.map || null, color: opts.color || 0xffffff, gradientMap: toonGradient }); o.material = mat; o.castShadow = true; } });
  const k = .4 / HAMSTER_LEN; m.scale.setScalar(k); m.position.y = -HAMSTER_MINY * k; m.rotation.y = FACING; g.add(m);
  g.userData.mat = mat; g.userData.body = m; g.userData.cheeks = [];
  for (const s of [-1, 1]) { const ch = new THREE.Mesh(new THREE.SphereGeometry(.035, 10, 8), toon(opts.color || 0xd9b07a)); ch.position.set(s * .055, .1, .13); ch.visible = false; g.add(ch); g.userData.cheeks.push(ch); }
  if (opts.beard) {
    const hairM = toon(opts.hair || 0x3a2a1a);
    const beard = new THREE.Mesh(new THREE.ConeGeometry(.045, .1, 10), hairM); beard.position.set(0, .05, .17); beard.rotation.x = Math.PI; g.add(beard);
    for (const s of [-1, 1]) { const mu = new THREE.Mesh(new THREE.CapsuleGeometry(.008, .035, 4, 8), hairM); mu.position.set(s * .028, .095, .19); mu.rotation.z = Math.PI / 2 + s * .35; g.add(mu); }
    const hair = new THREE.Mesh(new THREE.SphereGeometry(.055, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), hairM); hair.position.set(0, .15, .1); hair.rotation.x = -.3; g.add(hair);
  }
  g.scale.setScalar(opts.scale || 1); return g;
}

export function makeSky() {
  const geo = new THREE.SphereGeometry(5500, 24, 12); const pos = geo.attributes.position; const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x4a9be8), mid = new THREE.Color(0xa8dcf7), low = new THREE.Color(0xf3e9c8);
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 5500; const c = y > 0 ? mid.clone().lerp(top, Math.min(1, y * 1.6)) : low.clone().lerp(mid, Math.min(1, 1 + y * 3)); col.set([c.r, c.g, c.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })); sky.renderOrder = -1;
  const sunC = document.createElement('canvas'); sunC.width = sunC.height = 128; const g = sunC.getContext('2d'); const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(.35, 'rgba(255,240,180,.9)'); gr.addColorStop(1, 'rgba(255,240,180,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(sunC), fog: false, depthWrite: false })); sun.scale.setScalar(900); sun.position.set(-1500, 2600, 1200); sky.add(sun);
  return sky;
}
export function makeClouds(n = 36, xRange = [-100, 3600]) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  for (const [x, y, r] of [[70, 80, 42], [120, 60, 52], [175, 78, 44], [100, 90, 36], [150, 92, 38]]) { const gr = g.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.7, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 128); }
  const tex = new THREE.CanvasTexture(c); const group = new THREE.Group();
  for (let i = 0; i < n; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: .9, depthWrite: false })); const k = 20 + Math.random() * 40; s.scale.set(k * 2, k, 1); s.position.set(xRange[0] + Math.random() * (xRange[1] - xRange[0]), 35 + Math.random() * 60, -80 + Math.random() * 60 * (Math.random() < .5 ? -1 : 1) - 30); s.userData.v = .3 + Math.random() * .5; group.add(s); }
  group.userData.update = dt => { for (const s of group.children) { s.position.x += s.userData.v * dt; } };
  return group;
}
// Trees and bushes as two instanced meshes (trunks, crowns), scattered beside the road but never on it.
export function scatterTrees(scene, count, xRange, avoid = []) {
  const trunkG = new THREE.CylinderGeometry(.06, .09, .7, 7); const crownG = new THREE.IcosahedronGeometry(.5, 1);
  const trunks = new THREE.InstancedMesh(trunkG, toon(0x7a4f2a), count); const crowns = new THREE.InstancedMesh(crownG, toon(0x4e9a3c), count);
  trunks.castShadow = crowns.castShadow = true; const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(); const col = new THREE.Color();
  let i = 0, tries = 0; while (i < count && tries++ < count * 20) {
    const x = xRange[0] + Math.random() * (xRange[1] - xRange[0]); const side = Math.random() < .65 ? -1 : 1; const z = side * (2.6 + Math.random() * 14);
    if (avoid.some(a => x > a[0] && x < a[1] && (side > 0 || z > -2))) continue;
    const k = .7 + Math.random() * 1.1; q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28);
    p.set(x, .35 * k, z); s.set(k, k, k); m.compose(p, q, s); trunks.setMatrixAt(i, m);
    p.set(x, (.75 + Math.random() * .25) * k, z); s.set(k * (0.8 + Math.random() * .5), k * (0.9 + Math.random() * .6), k * (0.8 + Math.random() * .5)); m.compose(p, q, s); crowns.setMatrixAt(i, m);
    crowns.setColorAt(i, col.setHSL(.28 + Math.random() * .08, .55, .32 + Math.random() * .15)); i++;
  }
  trunks.count = crowns.count = i; scene.add(trunks, crowns); return { trunks, crowns };
}
// Flowers: tiny instanced discs in the grass.
export function scatterFlowers(scene, count, xRange) {
  const geo = new THREE.CircleGeometry(.05, 6); const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), count); const m = new THREE.Matrix4(); const col = new THREE.Color();
  for (let i = 0; i < count; i++) { const x = xRange[0] + Math.random() * (xRange[1] - xRange[0]); const z = (Math.random() < .5 ? -1 : 1) * (1.6 + Math.random() * 10); m.makeRotationX(-Math.PI / 2); m.setPosition(x, .02, z); mesh.setMatrixAt(i, m); mesh.setColorAt(i, col.setHSL(Math.random(), .8, .65)); }
  scene.add(mesh); return mesh;
}
// Bursts: a puff of coins or sparkles.
const bursts = [];
export function spawnBurst(scene, pos, color = 0xf2c230, n = 18) {
  const g = new THREE.BufferGeometry(); const p = new Float32Array(n * 3); const v = []; for (let i = 0; i < n; i++) { p.set([pos.x, pos.y + .2, pos.z], i * 3); v.push(new THREE.Vector3((Math.random() - .5) * 3, 1.5 + Math.random() * 2.5, (Math.random() - .5) * 3)); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size: .09, transparent: true, opacity: 1, depthWrite: false })); scene.add(pts); bursts.push({ pts, v, t: 0, scene });
}
export function updateBursts(dt) {
  for (const b of bursts) { b.t += dt; const a = b.pts.geometry.attributes.position; for (let i = 0; i < b.v.length; i++) { b.v[i].y -= 7 * dt; a.setXYZ(i, a.getX(i) + b.v[i].x * dt, Math.max(.02, a.getY(i) + b.v[i].y * dt), a.getZ(i) + b.v[i].z * dt); } a.needsUpdate = true; b.pts.material.opacity = Math.max(0, 1 - b.t / .9); }
  for (let i = bursts.length - 1; i >= 0; i--) if (bursts[i].t > .9) { bursts[i].scene.remove(bursts[i].pts); bursts[i].pts.geometry.dispose(); bursts.splice(i, 1); }
}
