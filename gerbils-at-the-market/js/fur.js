// The realistic-gerbil layer: shell fur on the Poly hamster, four running paws + a tail, and a trot cycle.
// Owns nothing in parts.js: it takes the group gerbilFrom() returns and adds to it. Transforms only, no skeleton.
//
//   furify(group, { color, length, layers, density, windStrength, shading })  -> { setVelocity, setTime, setColor, setLength, dispose }   (also group.userData.fur)
//     shading: 'toon' (default, matches the game's MeshToonMaterial palette) or 'standard' (softer, PBR)
//   addPaws(group, { color })                                        -> { paws, tail, whiskers }                     (also group.userData.paws)
//   animateGerbil(group, { speed, airborne, dt, now })               per frame, no allocations
//
// Shell fur: N instances of the body mesh's geometry (one InstancedBufferGeometry, one draw call), each pushed out along a
// smoothed normal by length * h (h = shell height 0..1). A follicle noise texture is thresholded per fragment (discard where
// noise < h), so each strand is a tapered column of surviving fragments. Inner shells are darkened (ambient occlusion down
// the hair), tips lightened. Opaque discard, no blending, so bloom and the logarithmic depth buffer behave; the base mesh
// keeps casting the shadow. Outer shells bend with gravity and lag behind the run direction (setVelocity) and ripple with
// time (setTime). No fur grows where the model's palette is pink (ears, feet, nose) or black (eyes).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- noise: follicles as soft dots, brighter = longer hair ----------
let follicleTex = null;
function follicles() {
  if (follicleTex) return follicleTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  // deterministic scatter so screenshots repeat
  let seed = 1234; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 1300; i++) {
    const x = rnd() * S, y = rnd() * S, r = 3.0 + rnd() * 4.5, peak = 0.45 + rnd() * 0.55;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${peak})`); gr.addColorStop(0.45, `rgba(255,255,255,${peak * 0.55})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    // draw with wrap so the tile is seamless
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { g.save(); g.translate(dx, dy); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.restore(); }
  }
  // a dim undercoat so the lowest shells are dense (the skin never shows as a bald grid)
  g.globalCompositeOperation = 'lighten'; g.fillStyle = 'rgba(255,255,255,0.42)'; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true;
  follicleTex = t; return t;
}

let whiteTex = null;
const white = () => whiteTex || (whiteTex = (() => { const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); t.needsUpdate = true; return t; })());

function firstMesh(root) { let m = null; root.traverse(o => { if (!m && o.isMesh) m = o; }); return m; }

// Smooth normals across the model's split vertices (the low-poly hamster has 932 verts for 488 tris: every edge is hard).
// Shells pushed along hard normals crack open at every edge; pushed along position-averaged normals they stay closed.
function smoothNormals(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, n = pos.count;
  const out = new Float32Array(n * 3), buckets = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 50)},${Math.round(pos.getY(i) * 50)},${Math.round(pos.getZ(i) * 50)}`;
    let b = buckets.get(k); if (!b) { b = { x: 0, y: 0, z: 0, ids: [] }; buckets.set(k, b); }
    b.x += nor.getX(i); b.y += nor.getY(i); b.z += nor.getZ(i); b.ids.push(i);
  }
  for (const b of buckets.values()) { const l = Math.hypot(b.x, b.y, b.z) || 1; for (const i of b.ids) { out[i * 3] = b.x / l; out[i * 3 + 1] = b.y / l; out[i * 3 + 2] = b.z / l; } }
  return new THREE.BufferAttribute(out, 3);
}

// Which vertices sit on bare palette colours (black eyes, pink ears/nose/feet). Read from the model's own texture, so the
// fur can stay short in a rim around them; the fragment shader does the final discard on the sampled texel.
function bareVertices(geo, map, box) {
  const uv = geo.attributes.uv, pos = geo.attributes.position, n = pos.count, bare = new Uint8Array(n);
  const img = map && map.image; if (!img || !uv) return bare;
  const len = box.max.z - box.min.z, hh = (box.max.y - box.min.y) / 2, cy = (box.max.y + box.min.y) / 2;
  let data; try { const c = document.createElement('canvas'); const w = img.width || 32, h = img.height || 32; c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h); data = g.getImageData(0, 0, w, h); } catch (e) { return bare; }
  const { width: w, height: h } = data;
  for (let i = 0; i < n; i++) {
    const u = uv.getX(i) - Math.floor(uv.getX(i)); let v = uv.getY(i) - Math.floor(uv.getY(i)); if (map.flipY) v = 1 - v;
    const px = Math.min(w - 1, Math.floor(u * w)), py = Math.min(h - 1, Math.floor(v * h)); const k = (py * w + px) * 4;
    const r = data.data[k] / 255, gg = data.data[k + 1] / 255, b = data.data[k + 2] / 255; const lum = 0.3 * r + 0.59 * gg + 0.11 * b;
    const pink = (r - gg) > 0.12 && b > gg * 0.68;
    // pink is ears (crown), nose (tip) and feet (floor): bare. Pink elsewhere (the cheek patch) is velvet: short fur, code 3.
    const y = pos.getY(i), zf = (pos.getZ(i) - box.min.z) / len;
    const pinkBare = pink && (y > cy + hh * 0.3 || zf > 0.93 || y < cy - hh * 0.7);
    bare[i] = lum < 0.25 ? 2 : pinkBare ? 1 : pink ? 3 : 0;
  }
  return bare;
}

// Per-vertex length multiplier in the model's own space (z = length, head at +z, y up): longer on cheeks and belly, short on the snout.
function tuftFactors(geo, box, bare) {
  const pos = geo.attributes.position, n = pos.count, out = new Float32Array(n);
  // rim: a furred vertex that shares a position with a bare one gets short fur (eye rims, ear roots, around the nose)
  const keyOf = i => `${Math.round(pos.getX(i) * 50)},${Math.round(pos.getY(i) * 50)},${Math.round(pos.getZ(i) * 50)}`;
  const keys = new Array(n); for (let i = 0; i < n; i++) keys[i] = keyOf(i);
  // ring 0: the bare vertex's own position. ring 1: any vertex of a triangle touching ring 0. rings 2, 3: one triangle further out each.
  const ring = new Map(); for (let i = 0; i < n; i++) if (bare[i] === 1 || bare[i] === 2) ring.set(keys[i], 0);
  const idx = geo.index ? geo.index.array : null, triN = idx ? idx.length / 3 : n / 3; const vid = t => idx ? idx[t] : t;
  for (let r = 1; r <= 3; r++) { const add = [];
    for (let t = 0; t < triN; t++) { const a = vid(t * 3), b = vid(t * 3 + 1), c = vid(t * 3 + 2); const ra = ring.get(keys[a]), rb = ring.get(keys[b]), rc = ring.get(keys[c]);
      if (ra === r - 1 || rb === r - 1 || rc === r - 1) { if (ra === undefined) add.push(keys[a]); if (rb === undefined) add.push(keys[b]); if (rc === undefined) add.push(keys[c]); } }
    for (const k of add) if (!ring.has(k)) ring.set(k, r); }
  const len = box.max.z - box.min.z, hw = (box.max.x - box.min.x) / 2, hh = (box.max.y - box.min.y) / 2, cy = (box.max.y + box.min.y) / 2;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); let f = 1;
    const zf = (z - box.min.z) / len;                       // 0 tail .. 1 nose
    if (y < cy - hh * 0.35) f *= 1.35;                        // belly
    if (zf > 0.6 && zf < 0.86 && Math.abs(x) > hw * 0.45 && y < cy - hh * 0.05) f *= 1.5; // cheeks, below the eye line
    if (zf > 0.9) f *= 0.45;                                  // snout
    if (zf > 0.7 && zf < 0.92 && y > cy + hh * 0.4) f *= 0.4;  // crown, so the ears stand clear
    if (zf < 0.08) f *= 0.7;                                  // rump end
    if (bare[i] === 1 || bare[i] === 2) f = 0;
    else { const r = ring.get(keys[i]); if (r === 1) f = Math.min(f, 0.12); else if (r === 2) f = Math.min(f, 0.3); else if (r === 3) f = Math.min(f, 0.6); if (bare[i] === 3) f = Math.min(f, 0.55); }
    out[i] = f;
  }
  return new THREE.BufferAttribute(out, 1);
}

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _g = new THREE.Vector3();

export function furify(group, opts = {}) {
  const { length = 0.012, layers = 12, density = 5, windStrength = 1, color, shading = 'toon' } = opts;
  const body = group.userData.body || group; const mesh = firstMesh(body);
  if (!mesh) return null;
  if (group.userData.fur) group.userData.fur.dispose();
  const src = mesh.geometry; src.computeBoundingBox(); const box = src.boundingBox;
  // local-unit fur length: the body mesh is scaled k = 0.4 / 111.67; meters -> model units
  mesh.updateWorldMatrix(true, false); _v.setFromMatrixScale(mesh.matrixWorld); const groupScale = group.getWorldScale(_g).x || 1;
  const unit = _v.x / groupScale;                           // model units per meter at group scale 1
  const lengthLocal = length / unit;

  const geo = new THREE.InstancedBufferGeometry();
  geo.index = src.index; geo.setAttribute('position', src.attributes.position); geo.setAttribute('normal', src.attributes.normal); geo.setAttribute('uv', src.attributes.uv);
  const baseMat0 = group.userData.mat || mesh.material; const bare = bareVertices(src, baseMat0 && baseMat0.map, box);
  const stats = { black: 0, pinkBare: 0, velvet: 0, img: baseMat0 && baseMat0.map && baseMat0.map.image ? (baseMat0.map.image.constructor.name + ' flipY=' + baseMat0.map.flipY) : 'none' }; for (const v of bare) { if (v === 2) stats.black++; else if (v === 1) stats.pinkBare++; else if (v === 3) stats.velvet++; }
  geo.setAttribute('furNormal', smoothNormals(src)); geo.setAttribute('furTuft', tuftFactors(src, box, bare));
  const shellH = new Float32Array(layers); for (let i = 0; i < layers; i++) shellH[i] = (i + 1) / layers;
  geo.setAttribute('instanceShell', new THREE.InstancedBufferAttribute(shellH, 1)); geo.instanceCount = layers;
  geo.boundingSphere = new THREE.Sphere(box.getCenter(new THREE.Vector3()), box.getSize(new THREE.Vector3()).length() / 2 + lengthLocal * 2.5);
  geo.boundingBox = box.clone().expandByScalar(lengthLocal * 2);

  const baseMat = group.userData.mat || mesh.material; const map = (baseMat && baseMat.map) || white();
  const tint = new THREE.Color(color !== undefined ? color : (baseMat && baseMat.color ? baseMat.color : 0xffffff));
  const u = {
    uFurLen: { value: lengthLocal }, uFurNoise: { value: follicles() }, uFurDensity: { value: density },
    uBend: { value: new THREE.Vector3(0, -0.25, 0) }, uTime: { value: 0 }, uWind: { value: 0.12 * windStrength },
    uFurShade: { value: shading === 'toon' ? new THREE.Vector2(0.58, 1.22) : new THREE.Vector2(0.9, 1.6) }, // root .. tip brightness
  };
  const mat = shading === 'toon'
    ? new THREE.MeshToonMaterial({ map, color: tint, gradientMap: (baseMat && baseMat.gradientMap) || null, side: THREE.FrontSide })
    : new THREE.MeshStandardMaterial({ map, color: tint, roughness: 0.95, metalness: 0, side: THREE.FrontSide });
  mat.customProgramCacheKey = () => 'gerbil-shell-fur-' + shading;
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float instanceShell; attribute vec3 furNormal; attribute float furTuft;
        uniform float uFurLen; uniform vec3 uBend; uniform float uTime; uniform float uWind;
        varying float vFurH; varying float vFurTuft;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        objectNormal = normalize(furNormal);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float h = instanceShell; vFurH = h; vFurTuft = furTuft; float L = uFurLen * furTuft; vec3 fn = normalize(furNormal);
          transformed += fn * L * h;
          transformed += vec3(0.0, -0.15, -0.55) * h * L;        // combed back along the body
          transformed += uBend * (h * h) * L;
          float w = sin(uTime * 6.0 + position.z * 0.21 + position.x * 0.33) * 0.6 + sin(uTime * 9.7 + position.y * 0.4 - position.z * 0.15) * 0.4;
          transformed += vec3(w, 0.35 * w, -0.5 * w) * (h * h) * L * uWind; }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uFurNoise; uniform float uFurDensity; uniform vec2 uFurShade; varying float vFurH; varying float vFurTuft;`)
      .replace('#include <map_fragment>', `
        vec4 furTex = texture2D( map, vMapUv );
        { // the palette: black (eyes) grows no fur; pink (ears, feet, nose) none where the vertex pass marked it bare
          if (vFurTuft < 0.04) discard;
          float lum = dot(furTex.rgb, vec3(0.3, 0.59, 0.11));
          bool pink = (furTex.r - furTex.g) > 0.12 && furTex.b > furTex.g * 0.68;
          if (lum < 0.25 || (pink && vFurTuft < 0.5)) discard; }
        float furN = texture2D( uFurNoise, vMapUv * uFurDensity ).r;
        if (furN < vFurH) discard;
        diffuseColor *= furTex;
        // ambient occlusion down the hair, lighter tips; the strand's own edge (noise barely above h) darkens a touch
        float edge = smoothstep(0.0, 0.12, furN - vFurH);
        diffuseColor.rgb *= mix(uFurShade.x, uFurShade.y, vFurH) * mix(0.88, 1.0, edge);`);
  };
  const shell = new THREE.Mesh(geo, mat); shell.name = 'fur'; shell.castShadow = false; shell.receiveShadow = true; shell.frustumCulled = true;
  mesh.add(shell);
  // skin under the coat is a shade darker than the tips (what shows between hairs)
  const skinColor0 = baseMat && baseMat.color ? baseMat.color.clone() : null; if (skinColor0) baseMat.color.copy(tint).multiplyScalar(0.8);

  const handle = {
    mesh: shell, material: mat, stats, triangles: (src.index ? src.index.count / 3 : src.attributes.position.count / 3) * layers,
    // world-space velocity (m/s) -> bend in model space: gravity droop + lag behind the run
    setVelocity(vel) {
      mesh.getWorldQuaternion(_q).invert();
      _g.set(0, -1, 0).applyQuaternion(_q).multiplyScalar(0.25);
      _v.copy(vel).applyQuaternion(_q); const s = _v.length(); if (s > 0) _v.multiplyScalar(-Math.min(0.9, s * 0.17) / s);
      u.uBend.value.copy(_g).add(_v); return handle;
    },
    setTime(t) { u.uTime.value = t; return handle; },
    setColor(c) { tint.set(c); mat.color.copy(tint); if (skinColor0) baseMat.color.copy(tint).multiplyScalar(0.8); return handle; },
    setLength(m) { u.uFurLen.value = m / unit; return handle; },
    dispose() { mesh.remove(shell); geo.dispose(); mat.dispose(); if (skinColor0) baseMat.color.copy(skinColor0); if (group.userData.fur === handle) delete group.userData.fur; },
  };
  group.userData.fur = handle; return handle;
}

// ---------- paws, tail, whiskers ----------
// Positions are in the group's space at scale 1 (metres): body 0.4 m long on z, head at +z, belly at y = PAW_CLEARANCE.
// Each paw is a hip (in a socket on a spine bone, so it rides the body's bend), a leg that stretches from the hip to the
// foot, and a foot that stays flat. The foot's place is computed per frame (see the gait), the leg aims at it.
const PAW_SPOTS = [ // [x, z, isFront, hip height above the ground]
  [-0.042, 0.085, true, 0.048], [0.042, 0.085, true, 0.048], [-0.05, -0.125, false, 0.054], [0.05, -0.125, false, 0.054],
];
export const PAW_CLEARANCE = 0.02; // the body is lifted this much so the feet show under the belly
let pawGeos = null;
function pawGeometries() {
  if (pawGeos) return pawGeos;
  const leg = new THREE.CylinderGeometry(0.0062, 0.0078, 1, 7); leg.translate(0, -0.5, 0);   // top at the hip, 1 m long: scale.y = length
  const mk = front => { const parts = [];
    const pad = new THREE.SphereGeometry(0.0125, 10, 7); pad.scale(0.95, 0.5, front ? 1.25 : 1.75); pad.translate(0, 0.004, front ? 0.004 : 0.008); parts.push(pad);
    for (let t = -1; t <= 1; t++) { const toe = new THREE.SphereGeometry(0.0042, 6, 5); toe.translate(t * 0.0068, 0.003, (front ? 0.017 : 0.027) - Math.abs(t) * 0.002); parts.push(toe); }
    return mergeGeometries(parts); };
  pawGeos = { leg, front: mk(true), back: mk(false) }; return pawGeos;
}

// The gerbil's tail: as long as her body, three tapering segments and a dark tuft, held a little off the ground.
export function makeTail(mat, len = 0.2) {
  const root = new THREE.Group(); root.name = 'tail'; const segs = []; let parent = root; const n = 3, L = len / n;
  for (let i = 0; i < n; i++) {
    const r0 = 0.0085 * (1 - i / n * 0.6), r1 = 0.0085 * (1 - (i + 1) / n * 0.6);
    const g = new THREE.CylinderGeometry(r1, r0, L * 1.1, 7); g.rotateX(-Math.PI / 2); g.translate(0, 0, -L / 2);
    if (i === n - 1) { const tuft = new THREE.SphereGeometry(0.011, 8, 6); tuft.scale(0.9, 0.9, 2.2); tuft.translate(0, 0, -L - 0.012); const m = mergeGeometries([g.toNonIndexed(), tuft.toNonIndexed()]); g.dispose(); tuft.dispose(); segs.push(addSeg(m)); }
    else segs.push(addSeg(g));
  }
  function addSeg(g) { const seg = new THREE.Group(); seg.position.z = segs.length ? -L : 0; parent.add(seg); const m = new THREE.Mesh(g, mat); m.castShadow = true; seg.add(m); parent = seg; return seg; }
  // at rest: up off the rump, then curving down so the tip trails along the ground
  [0.32, -0.2, -0.18].forEach((rx, i) => { segs[i].rotation.x = segs[i].userData.rx = rx; });
  root.userData.segs = segs; return root;
}

export function addPaws(group, opts = {}) {
  if (group.userData.paws) return group.userData.paws;
  const ud = group.userData; const color = opts.color !== undefined ? opts.color : 0xf0bfa4;
  const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.9 }); const G = pawGeometries();
  const paws = [];
  for (const [x, z, front, h] of PAW_SPOTS) {
    const hip = new THREE.Group(); hip.position.set(x, h, z); hip.name = front ? 'frontPaw' : 'backPaw';
    const leg = new THREE.Mesh(G.leg, skin); leg.scale.y = h - 0.004; hip.add(leg);
    const foot = new THREE.Group(); foot.position.y = -h; hip.add(foot); foot.add(new THREE.Mesh(front ? G.front : G.back, skin));
    Object.assign(hip.userData, { front, side: Math.sign(x), h, leg, foot });
    group.add(hip); paws.push(hip);
  }
  // the tail: dressGerbil's own if she is dressed, else ours (pinkish and furred like the paws)
  let tail = ud.tail || null, ownTail = false;
  if (!tail) { tail = makeTail(new THREE.MeshStandardMaterial({ color: new THREE.Color(ud.mat?.color ?? 0xd9b07a).multiplyScalar(0.85), roughness: 0.95 })); tail.position.set(0, 0.045, -0.18); group.add(tail); ud.tail = tail; ownTail = true; }
  // whiskers: dressGerbil's if dressed, else three a side at the nose
  let whiskers = ud.whiskers ? [ud.whiskers] : [];
  if (!whiskers.length) {
    const wM = new THREE.LineBasicMaterial({ color: 0x7a5a40, transparent: true, opacity: 0.75 });
    for (const s of [-1, 1]) {
      const pts = []; for (let i = 0; i < 3; i++) { const a = (i - 1) * 0.35; pts.push(new THREE.Vector3(s * 0.014, 0.05 + i * 0.004, 0.197), new THREE.Vector3(s * 0.064, 0.048 + a * 0.05 + 0.012, 0.168 + Math.abs(a) * 0.01)); }
      const w = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), wM); w.userData.side = s; group.add(w); whiskers.push(w);
    }
  }
  // lift the body (and the face that sits on it) so the paws are visible under it
  const body = ud.body; if (body) { body.userData.restY = body.position.y; body.position.y += PAW_CLEARANCE; }
  if (ud.face) ud.face.position.y += PAW_CLEARANCE;
  for (const c of ud.cheeks || []) if (c.parent === group) c.position.y += PAW_CLEARANCE;
  for (const w of whiskers) if (w.parent === group) w.position.y += PAW_CLEARANCE;
  if (ownTail) tail.position.y += PAW_CLEARANCE;
  const handle = { paws, tail, whiskers, material: skin, dispose() { for (const p of paws) p.parent?.remove(p); if (ownTail) { tail.parent?.remove(tail); delete ud.tail; } if (body) body.position.y = body.userData.restY; delete ud.paws; } };
  ud.paws = handle; return handle;
}

// ---------- the rig: the pose node, the spine bones, the sockets ----------
// parts.js gives the body a SkinnedMesh with four bones along the spine (root at the hips, spine, chest, head). The rig
// gathers the gerbil's own parts under one `pose` node (it leans, tilts, hops, rears up about the back feet) and hangs
// each part from the bone it belongs to: the paws from the hips and the chest, the eyes, ears, nose, cheeks and whiskers
// from the head, the tail from the hips. A socket is a bone's child scaled back to metres, so parts keep metre offsets.
const _P = new THREE.Vector3(), _Q = new THREE.Quaternion(), _E = new THREE.Euler(), _S = new THREE.Vector3(), _W = new THREE.Vector3();
function ensureRig(group) {
  const ud = group.userData; if (ud.rig !== undefined) return ud.rig;
  let sk = null; ud.body?.traverse(o => { if (!sk && o.isSkinnedMesh && o.name !== 'fur') sk = o; });
  if (!sk) { ud.rig = null; return null; }
  if (!ud.paws) addPaws(group);
  const [root, spine, chest, head] = sk.skeleton.bones;
  // build in the group's own frame: identity for a moment, so world = local
  const saved = { p: group.position.clone(), q: group.quaternion.clone(), s: group.scale.clone(), parent: group.parent };
  group.position.set(0, 0, 0); group.quaternion.identity(); group.scale.set(1, 1, 1); group.updateMatrixWorld(true);
  const pose = new THREE.Group(); pose.name = 'pose'; group.add(pose); pose.updateMatrixWorld(true);
  const poseScale = pose.getWorldScale(new THREE.Vector3());
  const socket = bone => { const s = new THREE.Object3D(); bone.add(s); bone.updateMatrixWorld(true); bone.getWorldScale(_W); s.scale.set(poseScale.x / _W.x, poseScale.y / _W.y, poseScale.z / _W.z); s.updateMatrixWorld(true); return s; };
  const S = { root: socket(root), chest: socket(chest), head: socket(head) };
  pose.attach(ud.body);
  const sockFor = z => z > 0.1 ? S.head : z < -0.11 ? S.root : S.chest;
  const hang = (o, sock) => { o.updateMatrixWorld(true); sock.attach(o); };
  for (const hip of ud.paws.paws) hang(hip, hip.userData.front ? S.chest : S.root);
  // the face (dressGerbil): each piece to its bone; then the cheeks, whiskers, the tail, any loose mesh (a primitive beard)
  if (ud.face) { ud.face.updateMatrixWorld(true); for (const c of [...ud.face.children]) { c.getWorldPosition(_W); pose.worldToLocal(_W); hang(c, c === ud.tail ? S.root : c === ud.hair || c === ud.whiskers ? S.head : sockFor(_W.z)); } }
  for (const c of [...group.children]) if (c !== pose) { if (c === ud.tail) hang(c, S.root); else if (c.isLineSegments) hang(c, S.head); else if (c.isMesh || (ud.cheeks || []).includes(c)) { c.getWorldPosition(_W); pose.worldToLocal(_W); hang(c, sockFor(_W.z)); } }
  if (ud.face && ud.face.parent) { ud.face.parent.remove(ud.face); }
  // the hips and feet keep their rest numbers in their sockets' frames
  for (const hip of ud.paws.paws) { hip.userData.rest = hip.position.clone(); hip.userData.restQ = hip.quaternion.clone(); }
  const bones = { root, spine, chest, head }; for (const b of Object.values(bones)) { b.userData.p0 = b.position.clone(); }
  group.position.copy(saved.p); group.quaternion.copy(saved.q); group.scale.copy(saved.s); group.updateMatrixWorld(true);
  const unitsPerM = 1 / (ud.body.getWorldScale(_W).x / saved.s.x || 1);   // model units per metre (bone positions are in model units)
  const g = { phase: 0, speed: 0, bound: 0, move: 0, turn: 0, lastYaw: null, t: Math.random() * 10, still: 0, act: null, actT: 0, nextAct: 2.5 + Math.random() * 3,
    wStand: 0, wGroom: 0, look: { y: 0, x: 0, ty: 0, tx: 0, t: 0 }, squash: 0, wasAir: false, hopT: -1, hopK: 1, settle: -1, peak: 0, sniff: 0, flick: 0, accel: 0, lastV: 0, cheekPop: 0, tailV: 0 };
  ud.rig = { pose, bones, sockets: S, g, unitsPerM, tail: ud.tail || null }; return ud.rig;
}

// ---------- the gaits ----------
// Two gaits blended by speed: a trot-like walk (diagonal pairs, the body bobbing twice a stride, swaying, the tail
// balancing) and, from about 2 m/s, a bound (front pair, then hind pair, the spine gathering and stretching, a little flight,
// ears laid back). The cycle advances with distance travelled, never with time, and a planted foot moves back under the
// body exactly as fast as the ground goes by, so the feet do not slide (within the legs' reach).
export const GAIT = {
  walkStride: [0.08, 0.19],  // m per cycle, slow .. 1.5 m/s
  boundStride: 0.38,         // m per cycle at a run (3 m/s: 7.9 strides a second; the walk is 7.9 too)
  walkStance: 0.5, boundStance: 0.24,
  boundFrom: 1.9, boundTo: 2.5,   // m/s: the walk becomes the bound across this band
  hop: 0.34, hopHeight: 0.075,    // the A hop: seconds, metres
  settle: 0.45,                   // the stop: a little sit back, seconds
  stand: 3.0, groom: 2.6,         // idle actions, seconds
};
const WALK_OFF = { FL: 0, BR: 0.04, FR: 0.5, BL: 0.54 }, BOUND_OFF = { FL: 0.42, FR: 0.48, BL: 0.78, BR: 0.84 };
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x, sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (cur, to, rate, dt) => cur + (to - cur) * (1 - Math.exp(-rate * dt));
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const _fwd = new THREE.Vector3(), _vel = new THREE.Vector3(), _hw = new THREE.Vector3(), _hg = new THREE.Vector3(), _ft = new THREE.Vector3(), _fl = new THREE.Vector3(), _sl = new THREE.Vector3(), _ld = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0), _gq = new THREE.Quaternion(), _hq = new THREE.Quaternion();

// A hop now (the player's A). strength scales the height.
export function gerbilHop(group, strength = 1) { const r = ensureRig(group); if (!r) return; if (r.g.hopT < 0 || r.g.hopT > GAIT.hop * 0.7) { r.g.hopT = 0; r.g.hopK = strength; } }

export function animateGerbil(group, opts = {}) {
  const ud = group.userData;
  if (ud.gaitDriver && !opts.driver) return;   // main.js drives the player itself; a module's second call this frame is ignored
  let { speed = 0, airborne = false, dt = 1 / 60, turn, ground } = opts;
  dt = Math.max(0, Math.min(0.1, dt));
  const rig = ensureRig(group); if (!rig) return simpleBob(group, speed, airborne, dt);
  const { pose, bones, g } = rig; const U = rig.unitsPerM;
  g.t += dt; const t = g.t;
  // the turn rate: given, or read from her own yaw
  const yaw = group.rotation.y; if (turn === undefined) { turn = g.lastYaw === null || dt <= 0 ? 0 : wrapA(yaw - g.lastYaw) / dt; } g.lastYaw = yaw;
  g.turn = ease(g.turn, Math.max(-12, Math.min(12, turn)), 12, dt);
  const v0 = g.speed; g.speed = ease(g.speed, Math.max(0, speed), 14, dt); const v = g.speed;
  g.accel = ease(g.accel, dt > 0 ? (v - v0) / dt : 0, 8, dt);
  const spin = Math.abs(g.turn) * (1 - sstep(0.2, 0.6, v));   // turning on the spot
  g.bound = ease(g.bound, sstep(GAIT.boundFrom, GAIT.boundTo, v), 6, dt); const B = g.bound;
  g.move = ease(g.move, clamp01(v / 0.35 + spin * 0.35), 10, dt); const M = g.move;
  // the cycle: distance over stride; on the spot the feet step as if walking a small circle. The stride is in the
  // group's own units (a gerbil scaled up 1.5x for the camera takes 1.5x longer steps in the world, at the same speed
  // thresholds), so the planted feet keep pace with the ground at any scale.
  const stride = (GAIT.walkStride[0] + (GAIT.walkStride[1] - GAIT.walkStride[0]) * clamp01(v / 1.5)) * (1 - B) + GAIT.boundStride * B;
  const scl = Math.abs(group.scale.x) || 1;
  g.phase += (v / scl * dt + spin * dt * 0.05) / stride; g.phase -= Math.floor(g.phase); const ph = g.phase;

  // landing squash; the A hop; the stop
  if (g.wasAir && !airborne) g.squash = 1; g.wasAir = airborne;
  let hopLift = 0, hopStretch = 0, air = airborne;
  if (g.hopT >= 0) { g.hopT += dt; const u = g.hopT / GAIT.hop; if (u >= 1) { g.hopT = -1; g.squash = Math.max(g.squash, 0.8 * g.hopK); } else { hopLift = Math.sin(Math.PI * u) * GAIT.hopHeight * g.hopK; hopStretch = Math.cos(Math.PI * u) * 0.12; air = true; } }
  g.peak = Math.max(g.peak * Math.exp(-dt * 3), v);
  if (v < 0.12 && g.peak > 0.9 && g.settle < 0 && !air) { g.settle = 0; g.peak = 0; }
  let settleU = 0; if (g.settle >= 0) { g.settle += dt; settleU = g.settle / GAIT.settle; if (settleU >= 1) { g.settle = -1; settleU = 0; } }
  g.squash = Math.max(0, g.squash - dt * 4.5); const sq = Math.sin(g.squash * Math.PI) * 0.2;

  // idle: breathing always; after a moment still, a look around, and now and then a groom or the stand-up scan
  const isStill = v < 0.06 && spin < 0.3 && !air;
  g.still = isStill ? g.still + dt : 0;
  if (!isStill) { g.act = null; g.nextAct = Math.max(g.nextAct, 2 + Math.random() * 2); }
  else if (!g.act && g.still > g.nextAct) { const r = Math.random(); g.act = r < 0.45 ? 'stand' : r < 0.85 ? 'groom' : 'sniff'; g.actT = 0; }
  if (g.act) { g.actT += dt; const len = g.act === 'stand' ? GAIT.stand : g.act === 'groom' ? GAIT.groom : 1.2; if (g.actT > len) { g.act = null; g.nextAct = g.still + 3 + Math.random() * 5; } }
  g.wStand = ease(g.wStand, g.act === 'stand' ? 1 : 0, g.act === 'stand' ? 5 : 9, dt);
  g.wGroom = ease(g.wGroom, g.act === 'groom' ? 1 : 0, g.act === 'groom' ? 6 : 10, dt);
  const wS = g.wStand, wG = g.wGroom, idle = (1 - M) * (isStill ? 1 : 0);
  // the look: quick head turns to a new spot, held, then another (gerbils move their heads in jerks)
  const L = g.look; L.t -= dt;
  if (L.t <= 0) { L.t = 0.7 + Math.random() * 1.8; L.ty = (Math.random() * 2 - 1) * 0.55; L.tx = (Math.random() * 2 - 1) * 0.18 - 0.04; }
  const lookOn = clamp01(idle * 1.3);
  L.y = ease(L.y, L.ty * lookOn, 16, dt); L.x = ease(L.x, L.tx * lookOn, 16, dt);
  // sniffing: nose and whiskers in quick bursts
  g.sniff -= dt; const sniffOn = g.sniff > -0.5 && g.sniff < 0 ? 1 : 0; if (g.sniff < -0.5 - Math.random() * 2.5) g.sniff = 0.35 + (g.act === 'sniff' ? 0.8 : 0);
  const sniffing = g.sniff > 0 ? 1 : 0;

  // ---------- body ----------
  const walkW = M * (1 - B), boundW = M * B;
  const c2 = Math.cos(2 * Math.PI * ph), s2 = Math.sin(2 * Math.PI * ph), c4 = Math.cos(4 * Math.PI * ph);
  // walk: a bob twice a stride, a sway once, a nod
  let lift = walkW * 0.0045 * (1 - c4) * 0.5 * clamp01(v / 0.8);
  let pitch = walkW * 0.025 * Math.sin(4 * Math.PI * ph + 0.6) * clamp01(v / 0.8), roll = walkW * 0.05 * s2 * clamp01(v / 0.6);
  // bound: flight after the hind push, a small one after the front; nose up on the push, down on the front landing
  let bLift = 0; { const p = ph; if (p > 0.02 && p < 0.42) bLift = Math.sin(Math.PI * (p - 0.02) / 0.4) * 0.034; else if (p > 0.66 && p < 0.78) bLift = Math.sin(Math.PI * (p - 0.66) / 0.12) * 0.01; }
  lift += boundW * bLift; pitch += boundW * -0.13 * c2;
  const flex = Math.cos(2 * Math.PI * (ph - 0.72));   // +1 gathered, -1 stretched
  // speeding up leans her forward, braking sits her back a touch; a turn leans her into it
  pitch += Math.max(-0.12, Math.min(0.12, g.accel * 0.025));
  roll += Math.max(-0.3, Math.min(0.3, -g.turn * v * 0.075));
  // ground: the slope she stands on (radians, + = nose up)
  if (ground) { pitch -= ground.pitch || 0; roll += ground.roll || 0; }
  // the idle poses pivot about the back feet
  const sitU = settleU > 0 ? Math.sin(Math.PI * settleU) : 0;
  const rearPitch = -1.0 * wS - 0.42 * wG - 0.16 * sitU;
  const breathe = Math.sin(t * 2 * Math.PI * 1.3) * (1 - M * 0.7);
  let sy = 1 + 0.014 * breathe - sq + hopStretch + boundW * 0.035 * flex, sxz = 1 - 0.006 * breathe + sq * 0.6 - hopStretch * 0.4;
  let sz = sxz - boundW * 0.06 * flex;
  if (airborne && g.hopT < 0) { sy *= 1.06; sz *= 1.04; }
  // compose: scale about the ground under her middle, rotate about the pivot, lift
  _E.set(pitch + rearPitch, 0, roll, 'ZXY'); _Q.setFromEuler(_E);
  const rearW = clamp01(Math.abs(rearPitch) / (Math.abs(rearPitch) + Math.abs(pitch) + 1e-3));
  _P.set(0, 0.05 * (1 - rearW), -0.125 * rearW);
  pose.quaternion.copy(_Q); pose.scale.set(sxz, sy, sz);
  _S.copy(_P).applyQuaternion(_Q); pose.position.set(_P.x - _S.x, _P.y - _S.y + lift + hopLift, _P.z - _S.z);

  // ---------- spine and head ----------
  const a = boundW * (flex > 0 ? 0.13 : 0.07) * flex;   // the hump when gathered, a flatter line when stretched
  bones.spine.rotation.x = -a - 0.1 * wS + 0.05 * sitU;
  bones.chest.rotation.x = 2 * a - 0.12 * wS + 0.06 * wG;
  bones.chest.position.z = bones.chest.userData.p0.z + boundW * -flex * 0.012 * U;
  const headPitchLevel = -(pitch + rearPitch) * (0.55 + 0.25 * wS);   // keep the eyes on the horizon
  bones.head.rotation.x = headPitchLevel + L.x + walkW * 0.05 * Math.sin(4 * Math.PI * ph) + wG * (0.42 + 0.16 * Math.sin(t * 15)) + sniffing * 0.04 * Math.sin(t * 38);
  bones.head.rotation.y = L.y * (1 - wG) + wS * Math.sin(t * 1.6) * 0.55 + Math.max(-0.4, Math.min(0.4, g.turn * 0.09)) + wG * 0.12 * Math.sin(t * 4.5);
  bones.head.rotation.z = wS * 0.08 * Math.sin(t * 1.6 + 1);

  // ---------- paws ----------
  // A foot in stance is planted: pinned to the spot on the ground where it landed (world space), and the leg reaches for
  // it, so it cannot slide while the body goes over it, turns, or is pushed. In swing it travels from where it lifted to
  // its next landing, half a stance ahead of the hip, in an arc. Still, the feet stay planted, and one that was left
  // stretched out steps back under its hip after a moment. In the air the paws tuck; standing up and grooming, the front
  // paws leave the ground (their targets are then in the chest's own frame: at the chest, at the face).
  const paws = ud.paws?.paws || [];
  if (paws.length) {
    group.updateWorldMatrix(true, false); pose.updateMatrixWorld(true); group.getWorldQuaternion(_gq).invert();
    const useBound = B > 0.5, offs = useBound ? BOUND_OFF : WALK_OFF, sF0 = useBound ? GAIT.boundStance : GAIT.walkStance, liftH = useBound ? 0.02 : 0.011;
    const walking = M > 0.3 && !air;
    paws.forEach((hip, idx) => {
      const P = hip.userData, h = P.h, reach = 1.7 * h; const key = (P.front ? 'F' : 'B') + (P.side > 0 ? 'L' : 'R');
      const sF = Math.min(sF0, reach / stride), D = sF * stride;   // a stride longer than the leg can cover: the foot lifts sooner
      const p = ph + offs[key] - Math.floor(ph + offs[key]);
      hip.getWorldPosition(_hw); _hg.copy(_hw); group.worldToLocal(_hg);   // the hip, in the group's frame (ground at y = 0)
      const lifted = P.front && wS + wG > 0.05;   // the front paws in the stand or the groom
      if (!P.plant) { P.plant = new THREE.Vector3(); P.planted = false; P.liftZ = 0; P.stepT = -1; P.from = new THREE.Vector3(); }
      let stance = air ? false : walking ? p < sF : true;
      if (lifted) stance = false;
      if (stance) {
        if (!P.planted) { P.planted = true; _ft.set(_hg.x, 0, _hg.z + (walking ? D * (0.5 - p / sF) : P.liftZ * (1 - M))); group.localToWorld(P.plant.copy(_ft)); P.stepT = -1; }
        // still, a foot left stretched out steps back under its hip (one at a time, after a moment)
        _ft.copy(P.plant); group.worldToLocal(_ft); const off = _ft.z - _hg.z, offX = _ft.x - _hg.x;
        if (!walking && P.stepT < 0 && g.still > 0.25 + idx * 0.09 && (Math.abs(off) > 0.016 || Math.abs(offX) > 0.016)) { P.stepT = 0; P.from.copy(_ft); }
        if (P.stepT >= 0) { P.stepT += dt; const u = Math.min(1, P.stepT / 0.16), e = u * u * (3 - 2 * u);
          _ft.set(P.from.x + (_hg.x - P.from.x) * e, Math.sin(Math.PI * u) * 0.009, P.from.z + (_hg.z - P.from.z) * e); group.localToWorld(P.plant.copy(_ft)); if (u >= 1) P.stepT = -1; }
        _fl.copy(P.plant);
        hip.worldToLocal(_fl);
        if (_fl.length() > 1.5 * h) P.planted = false;   // out of reach (a shove, a teleport): it lets go and lands again next frame
      } else {
        if (P.planted) { _ft.copy(P.plant); group.worldToLocal(_ft); P.liftZ = Math.max(-reach, Math.min(reach, _ft.z - _hg.z)); P.planted = false; }
        let fz, fy;
        if (air) { fz = P.front ? 0.026 : -0.03; fy = _hg.y - h * 0.72; }
        else { const u = (p - sF) / (1 - sF), e = u * u * (3 - 2 * u); fz = P.liftZ + (D * 0.5 - P.liftZ) * e; fy = Math.sin(Math.PI * u) * liftH; if (!walking) { fz = P.liftZ; fy = 0; } }
        _ft.set(_hg.x, fy, _hg.z + fz); group.localToWorld(_ft); _fl.copy(_ft); hip.worldToLocal(_fl);
        if (air) P.liftZ = fz;
      }
      // the front paws' own poses, in the chest's frame: tucked at the chest (stand), up at the face scrubbing (groom)
      if (P.front && wS + wG > 0.001) {
        const tz = 0.012 * wS + (0.05 + 0.006 * Math.sin(t * 15 + P.side)) * wG, ty = -0.022 * wS + (0.012 + 0.008 * Math.sin(t * 15)) * wG, w = Math.min(1, wS + wG);
        _sl.set(0, ty / Math.max(w, 1e-3), tz / Math.max(w, 1e-3)); _fl.lerp(_sl, w);
      }
      const len = _fl.length(); _ld.copy(_fl).divideScalar(Math.max(len, 1e-6));
      P.leg.quaternion.setFromUnitVectors(_down, _ld); P.leg.scale.y = Math.max(0.012, len - 0.004);
      P.foot.position.copy(_fl);
      // the foot lies flat on the ground (the group's level), whatever the body is doing; grooming, palms to the face
      hip.getWorldQuaternion(_hq); _hq.premultiply(_gq).invert(); P.foot.quaternion.copy(_hq);
      if (P.front && wS + wG > 0.001) { _E.set(-1.1 * wG - 0.5 * wS, 0, 0); _Q.setFromEuler(_E); P.foot.quaternion.slerp(_Q, Math.min(1, wS + wG)); }
    });
  }

  // ---------- tail, ears, whiskers, nose, cheeks ----------
  const tail = rig.tail;
  if (tail && tail.userData.segs) {
    const segs = tail.userData.segs;
    // balance: it swings against the sway and the turn, lifts in the bound, lies along the ground when she rears up
    const swing = -roll * 1.6 + walkW * 0.18 * Math.sin(2 * Math.PI * ph + 1.2) + idle * 0.12 * Math.sin(t * 0.9) + g.turn * v * 0.04;
    const lift0 = boundW * (0.25 + 0.2 * Math.sin(2 * Math.PI * ph - 0.8)) - (pitch + rearPitch) * 0.9 * clamp01(wS + wG + sitU) + sq * 0.5 + (air ? 0.25 : 0);
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], lag = i * 0.9;
      s.rotation.y = swing * (0.6 + i * 0.3) * Math.cos(lag * 0.4) + idle * 0.1 * Math.sin(t * 1.3 - lag) + walkW * 0.1 * Math.sin(2 * Math.PI * ph - lag);
      s.rotation.x = s.userData.rx + (i === 0 ? lift0 : lift0 * -0.25) + boundW * 0.12 * Math.sin(2 * Math.PI * ph - lag);
    }
  }
  g.flick -= dt; if (g.flick < -2 - Math.random() * 3) g.flick = 0.25;
  if (ud.ears) ud.ears.forEach((e, i) => { const s = i ? 1 : -1; if (e.userData.rz === undefined) e.userData.rz = e.rotation.z;
    const fl = g.flick > 0 && (i === 0) === (Math.floor(t) % 2 === 0) ? Math.sin(g.flick / 0.25 * Math.PI * 2) * 0.4 : 0;
    e.rotation.z = e.userData.rz + s * (fl - 0.25 * B * M); e.rotation.x = -0.75 * B * M - 0.25 * walkW * clamp01(v) + wS * 0.15; });
  for (const w of ud.paws?.whiskers || []) { w.rotation.x = Math.sin(t * 9) * 0.03 + sniffing * Math.sin(t * 42) * 0.07; w.rotation.y = (w.userData.side || 0) * 0.04 * M; }
  if (ud.nose) { ud.nose.scale.y = 0.8 * (1 + sniffing * 0.15 * Math.sin(t * 42)); }
  if (ud.cheeks) for (const c of ud.cheeks) { if (!c.visible) continue;
    const base = c.scale.x !== c.userData.wrote ? (c.userData.base = c.scale.x) : c.userData.base;
    if (c.userData.lastBase !== undefined && base > c.userData.lastBase + 1e-4) g.cheekPop = 1; c.userData.lastBase = base;
    const s = base * (1 + 0.05 * Math.sin(t * 7 + (c.position.x > 0 ? 1 : 0)) + 0.25 * Math.sin(g.cheekPop * Math.PI) + 0.04 * sq);
    c.scale.set(s, s * 0.95, s); c.userData.wrote = c.scale.x; }
  g.cheekPop = Math.max(0, g.cheekPop - dt * 4);

  const fur = ud.fur;
  if (fur) { _fwd.set(0, 0, 1).applyQuaternion(group.getWorldQuaternion(_Q)); _vel.copy(_fwd).multiplyScalar(v); fur.setVelocity(_vel).setTime(t); }
}

// the primitive gerbil (no model loaded): a breath and a bob
function simpleBob(group, speed, airborne, dt) {
  const ud = group.userData; const b = ud.body || group.children[0]; if (!b) return;
  const g = ud.gait || (ud.gait = { ph: 0, y0: b.position.y }); g.ph += dt * (4 + speed * 5);
  b.position.y = g.y0 + (airborne ? 0 : Math.abs(Math.sin(g.ph)) * 0.02 * Math.min(1, speed));
}
