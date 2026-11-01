// The bosses on a real rig: the KayKit "Mannequin_Medium" body (CC0) driven by KayKit Character Animations 1.1
// clips (CC0), dressed in a suit painted on a canvas, with the game's own procedural caricature head sitting on the
// head bone. Same controller API as bosses.js, so fight.js can swap between the two:
//
//   const ok = await loadBosses2();                       // fetches models/bosses/suit-body.glb once; false if missing
//   const b = ok ? makeBoss2('trump', { scale }) : makeBoss('trump', { scale });
//   b.userData.boss.play('walk'); b.userData.boss.setSpeed(1.9); ... each frame: b.userData.boss.update(dt)
//
// Animation names: idle, walk, run, dizzy, cheer, laugh, fall (fall is one-shot and holds its last frame).
// Origin at the feet, facing +z, ~2.1 m tall at scale 1, ~7k triangles of body plus the head.
//
// How the suit works: the mannequin's own UVs point at a colour-strip palette, useless for tailoring. So at load the
// body, arm and leg meshes get fresh cylindrical UVs from their bind-pose positions (around = u, along = v) packed into
// three bands of one atlas, and the suit is painted into those bands: jacket, lapels, shirt, tie, belt, sleeves, cuffs,
// hands, trousers, shoes. The mannequin's own head mesh is hidden; the caricature head is a child of the `head` bone.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { makeFace, BOSS_IDS, addHeadExtras, mountProps } from './bosses.js';
import { roundedBox } from './props.js';

export { BOSS_IDS };
const PI = Math.PI, clamp = THREE.MathUtils.clamp, smooth = THREE.MathUtils.smoothstep;
const MODEL_URL = new URL('../models/bosses/suit-body.glb', import.meta.url).href;
const BODY_SCALE = 1.15;          // mannequin is 1.24 m to the neck; ×1.15 plus the head gives ~2.1 m
const HEAD_SCALE = 1.08;          // the caricature head relative to the body's scale (1 = the bosses.js head ×1.15)

// ---------- looks ----------
const LOOK = {
  trump: { name: 'Trump', skin: 0xf0a35a, jacket: '#1c2a52', lapel: '#16213f', pants: '#1c2a52', shirt: '#ffffff', sleeve: '#1c2a52', shoe: '#141414', sole: '#2a2a2a', hair: 0xf5d76e, tie: '#d7262c', jowls: true, belly: .22, chest: 0, headShine: false },
  bezos: { name: 'Bezos', skin: 0xe2a67c, jacket: '#5b6069', lapel: '#4a4f57', pants: '#3a5f9a', shirt: '#ffffff', sleeve: '#f4f4f4', shoe: '#f2f2f2', sole: '#d8d0c0', hair: null, tie: null, jowls: false, belly: 0, chest: .1, headShine: true, glasses: true, vest: true },
  musk: { name: 'Musk', skin: 0xe8c2a2, jacket: '#32333b', lapel: '#1e1e24', pants: '#1c1c21', shirt: '#0e0e11', sleeve: '#2a2b31', shoe: '#101012', sole: '#2a2a2e', hair: 0x2b1d14, tie: null, jowls: false, belly: 0, chest: 0, headShine: false, pin: true, tee: true },
  ellison: { name: 'Ellison', skin: 0xe2a07a, jacket: '#1b1e26', lapel: '#12141a', pants: '#1b1e26', shirt: '#f4f4f4', sleeve: '#1b1e26', shoe: '#141414', sole: '#2a2a2a', hair: null, sideHair: 0xeeece6, captainCap: true, tie: null, jowls: false, belly: .06, chest: 0, headShine: false, older: true },
  bloomberg: { name: 'Bloomberg', skin: 0xebb89a, jacket: '#1f2c4f', lapel: '#17213c', pants: '#1f2c4f', shirt: '#ffffff', sleeve: '#1f2c4f', shoe: '#141414', sole: '#2a2a2a', hair: null, sideHair: 0xc9c6bf, brow: 0xa9a59d, lines: true, tie: '#8a2333', jowls: false, belly: 0, chest: 0, size: .9, headShine: true, props: ['megaphone', 'votesign'] },
  walton: { name: 'Walton', skin: 0xebb595, jacket: '#1c2747', lapel: '#141c35', waistcoat: '#2f6cc0', pants: '#5a5e66', shirt: '#ffffff', sleeve: '#1c2747', shoe: '#2a1c14', sole: '#1a1410', hair: 0xf1efea, brow: 0xe6e3dc, lines: true, specs: true, face: 'smile', tie: null, jowls: false, belly: .06, chest: 0, headShine: false, props: ['cart'] },
  zuckerberg: { name: 'Zuckerberg', skin: 0xf1c9aa, jacket: '#8f9399', lapel: '#8f9399', pants: '#3a4866', shirt: '#8f9399', sleeve: '#8f9399', shoe: '#24262c', sole: '#e8e8e8', hair: 0x4a3122, curls: true, chain: true, bareTee: true, shortSleeve: true, face: 'grin', tie: null, jowls: false, belly: 0, chest: 0, headShine: false, props: ['phone'] },
  page: { name: 'Page', skin: 0xe8bb98, jacket: '#3d4b5e', lapel: '#3d4b5e', pants: '#2e3036', shirt: '#3d4b5e', sleeve: '#3d4b5e', shoe: '#1c1c20', sole: '#2a2a2a', hair: 0x3a302a, sideHair: 0x9c978f, stubble: 'rgba(70,62,56,.5)', bareTee: true, sweater: true, face: 'quiet', tie: null, jowls: false, belly: .03, chest: 0, headShine: false, props: ['magnifier'] },
  default: { name: 'Billionaire', skin: 0xe8b890, jacket: '#4a4e57', lapel: '#3a3d45', pants: '#4a4e57', shirt: '#ffffff', sleeve: '#4a4e57', shoe: '#141414', sole: '#2a2a2a', hair: 0x5a3a22, tie: '#2d6fd3', jowls: false, belly: .05, chest: 0, headShine: false },
};
const lookFor = id => LOOK[id] || LOOK.default;

// which GLB clip plays for each boss animation, and how
const CLIP = {
  idle:  { clip: 'Idle_A', loop: THREE.LoopRepeat, mood: 'smug' },
  walk:  { clip: 'Walking_A', loop: THREE.LoopRepeat, mood: 'smug', stride: 1.3 },   // metres per cycle at speed→timeScale
  run:   { clip: 'Running_A', loop: THREE.LoopRepeat, mood: 'smug', stride: 2.2 },
  dizzy: { clip: 'Hit_B', loop: THREE.LoopPingPong, mood: 'dizzy', sway: true, stars: true },
  cheer: { clip: 'Cheering', loop: THREE.LoopRepeat, mood: 'happy' },
  laugh: { clip: 'Skeletons_Taunt_Longer', loop: THREE.LoopRepeat, mood: 'happy', headBack: true },
  fall:  { clip: 'Death_A', loop: THREE.LoopOnce, mood: 'dizzy', stars: true },
};

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .8, metalness: 0, ...o });
const hex = c => '#' + new THREE.Color(c).getHexString();
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = THREE.RepeatWrapping; return t; }
const ell = (g, x, y, rx, ry, fill, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, PI * 2); g.fillStyle = fill; g.fill(); };
const sphere = (r, mat, ws = 20, hs = 14) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat);
const cache = new Map(); const memo = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

// ---------- loading ----------
let gltf = null, loading = null;
export function loadBosses2() {
  if (loading) return loading;
  loading = new Promise(resolve => {
    new GLTFLoader().load(MODEL_URL, g => {
      try { prepare(g); gltf = g; resolve(true); } catch (e) { console.warn('bosses2: prepare failed', e); resolve(false); }
    }, undefined, e => { console.warn('bosses2: no body model', e?.message || e); resolve(false); });
  });
  return loading;
}
export const bosses2Ready = () => !!gltf;

// Give the body, arm and leg meshes cylindrical UVs in the atlas bands (done once, on the shared geometry); record bounds.
const BAND = { body: [.5, 1], arm: [.25, .5], leg: [0, .25] };   // v ranges in the atlas (v=1 is the canvas top)
const PART = { Mannequin_Medium_Body: 'body', Mannequin_Medium_ArmLeft: 'arm', Mannequin_Medium_ArmRight: 'arm', Mannequin_Medium_LegLeft: 'leg', Mannequin_Medium_LegRight: 'leg', Mannequin_Medium_Head: 'head' };
const BOUNDS = { body: [.376, 1.244], arm: [.089, .989], leg: [0, .529] };  // along-axis extents in bind pose (metres)
function prepare(g) {
  g.scene.traverse(m => {
    if (!m.isMesh) return; const part = PART[m.name]; m.userData.part = part; if (!part || part === 'head') return;
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); const p = geo.attributes.position; const n = p.count; const uv = new Float32Array(n * 2);
    const [b0, b1] = BOUNDS[part], [v0, v1] = BAND[part]; const centre = { x: 0, y: 0, z: 0 };
    if (part === 'arm') { centre.y = 1.108; centre.z = 0; } if (part === 'leg') { centre.x = m.name.endsWith('Left') ? .171 : -.171; centre.z = .03; }
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i); let u, along;
      if (part === 'body') { u = .5 + Math.atan2(x, z) / (2 * PI); along = (b1 - y) / (b1 - b0); }   // 0 at the neck, 1 at the crotch
      else if (part === 'arm') { u = .5 + Math.atan2(y - centre.y, z) / (2 * PI); along = (Math.abs(x) - b0) / (b1 - b0); }
      else { u = .5 + Math.atan2(x - centre.x, z - centre.z) / (2 * PI); along = 1 - y / b1; }   // legs: v grows downward, shoe at the bottom
      uv[i * 2] = u; uv[i * 2 + 1] = v1 - (v1 - v0) * along;   // along=0 at the top of the band (canvas v=1 is the top)
    }
    // seam fix: a triangle straddling u=0/1 gets its low-u corners pushed past 1 (RepeatWrapping handles it)
    for (let t = 0; t < n; t += 3) { const us = [uv[t * 2], uv[t * 2 + 2], uv[t * 2 + 4]]; const mx = Math.max(...us), mn = Math.min(...us); if (mx - mn > .5) for (let k = 0; k < 3; k++) if (us[k] < .5) uv[(t + k) * 2] += 1; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); m.geometry = geo;
  });
  g.byName = {}; g.animations.forEach(c => { g.byName[c.name] = c; });
  for (const k in CLIP) if (!g.byName[CLIP[k].clip]) throw new Error(`clip ${CLIP[k].clip} missing for ${k}`);
}

// ---------- the suit atlas: body band on top (collar at the top edge), arm band, leg band ----------
function suitTexture(id) {
  const L = lookFor(id); const W = 1024, H = 1024; const [c, g] = canvas(W, H); const cx = W / 2;
  const weave = (y0, y1, col) => { g.save(); g.beginPath(); g.rect(0, y0, W, y1 - y0); g.clip(); g.strokeStyle = col; g.lineWidth = 2; for (let x = -H; x < W + H; x += 14) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (y1 - y0), y1); g.stroke(); } g.restore(); };
  // ---- body band: y 0..512; y=0 collar (v=1 → top of the mesh), y=512 the crotch. Belt at along≈.17 from the bottom.
  const B0 = 0, B1 = 512; const yOf = along => B1 - along * (B1 - B0); const yBelt = yOf(.19), yPt = yOf(L.vest ? .5 : L.tee ? .62 : .42), yTop = B0;
  g.fillStyle = L.pants; g.fillRect(0, yBelt, W, B1 - yBelt); weave(yBelt, B1, 'rgba(255,255,255,.03)');
  g.fillStyle = L.jacket; g.fillRect(0, B0, W, yBelt - B0); weave(B0, yBelt, 'rgba(255,255,255,.035)');
  const half = L.tee ? 110 : L.vest ? 150 : 130;
  const shade = '#' + new THREE.Color(L.jacket).multiplyScalar(.78).getHexString();
  if (L.bareTee) { // a plain T-shirt or sweater: no jacket, a round neck; a sweater gets a ribbed hem
    g.fillStyle = shade; g.beginPath(); g.ellipse(cx, yTop, 120, 46, 0, 0, PI); g.fill(); g.fillStyle = L.jacket; g.beginPath(); g.ellipse(cx, yTop, 100, 32, 0, 0, PI); g.fill();
    if (L.sweater) { g.strokeStyle = 'rgba(0,0,0,.14)'; g.lineWidth = 3; for (let x = 0; x < W; x += 12) { g.beginPath(); g.moveTo(x, yBelt - 70); g.lineTo(x, yBelt); g.stroke(); } }
  } else if (L.waistcoat) { // Walton: the blue vest between the blazer's lapels, a white shirt open at the neck
    const yHem = yBelt - 12; g.fillStyle = L.waistcoat; g.beginPath(); g.moveTo(cx - 160, yTop); g.lineTo(cx + 160, yTop); g.lineTo(cx + 90, yHem); g.lineTo(cx - 90, yHem); g.closePath(); g.fill();
    g.fillStyle = L.shirt; g.beginPath(); g.moveTo(cx - 80, yTop); g.lineTo(cx + 80, yTop); g.lineTo(cx, yTop + 150); g.closePath(); g.fill();
    g.fillStyle = '#f2f2f2'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 30, yTop); g.lineTo(cx + s * 100, yTop); g.lineTo(cx + s * 60, yTop + 60); g.closePath(); g.fill(); }
    for (let i = 0; i < 4; i++) ell(g, cx, yTop + 180 + i * 56, 7, 7, '#e8e8ee');
    g.fillStyle = L.lapel; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 160, yTop); g.lineTo(cx + s * 230, yTop); g.lineTo(cx + s * 130, yHem); g.lineTo(cx + s * 90, yHem); g.closePath(); g.fill(); }
  } else if (L.vest) { // Bezos: pale shirt shows in a deep wide V, vest edges, buttons
    g.fillStyle = L.shirt; g.beginPath(); g.moveTo(cx - half, yTop); g.lineTo(cx + half, yTop); g.lineTo(cx, yPt + 40); g.closePath(); g.fill();
    g.fillStyle = '#e9e3d8'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 60, yTop); g.lineTo(cx + s * 110, yTop); g.lineTo(cx + s * 70, yTop + 70); g.closePath(); g.fill(); }
    for (let i = 0; i < 4; i++) ell(g, cx, yPt - 6 - i * 30, 6, 6, '#2a2d33');
  } else {
    g.fillStyle = L.shirt; g.beginPath(); g.moveTo(cx - half, yTop); g.lineTo(cx + half, yTop); g.lineTo(cx, yPt); g.closePath(); g.fill();
    g.fillStyle = L.lapel; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * half, yTop); g.lineTo(cx + s * (half + 70), yTop); g.lineTo(cx + s * 30, yPt + 40); g.lineTo(cx, yPt); g.closePath(); g.fill(); }
    if (L.tee) { g.fillStyle = '#3a3b42'; g.beginPath(); g.ellipse(cx, yTop + 8, 90, 30, 0, 0, PI); g.fill(); }
    else { g.fillStyle = '#f2f2f2'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 34, yTop); g.lineTo(cx + s * 110, yTop); g.lineTo(cx + s * 70, yTop + 60); g.closePath(); g.fill(); } }
    if (L.tie) { // knot at the collar, blade down to the belt
      g.fillStyle = L.tie; g.beginPath(); g.moveTo(cx - 22, yTop + 14); g.lineTo(cx + 22, yTop + 14); g.lineTo(cx + 46, yBelt - 40); g.lineTo(cx, yBelt - 8); g.lineTo(cx - 46, yBelt - 40); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(cx - 10, yTop + 50); g.lineTo(cx + 2, yTop + 50); g.lineTo(cx + 14, yBelt - 50); g.lineTo(cx + 2, yBelt - 46); g.closePath(); g.fill();
      ell(g, cx, yTop + 20, 28, 18, L.tie); ell(g, cx, yTop + 18, 14, 8, 'rgba(0,0,0,.25)');
    }
    ell(g, cx + 14, yPt + 56, 9, 9, '#101010'); ell(g, cx + 14, yPt + 100, 9, 9, '#101010');
  }
  if (L.bareTee) { g.fillStyle = shade; g.fillRect(0, yBelt - 14, W, 16); }   // the shirt's hem hangs over the belt
  else { g.fillStyle = L.vest ? '#3a2a1a' : '#15151a'; g.fillRect(0, yBelt - 10, W, 20); ell(g, cx, yBelt, 14, 8, L.vest ? '#d8b25a' : '#9a9aa0'); }
  // ---- arm band: y 512..768; y=512 shoulder, y=768 fingertips. Wrist at along≈.69.
  const A0 = 512, A1 = 768; const ay = along => A0 + along * (A1 - A0); const yWrist = ay(.69);
  const ySleeve = L.shortSleeve ? ay(.27) : yWrist;   // a T-shirt sleeve stops above the elbow
  g.fillStyle = hex(L.skin); g.fillRect(0, A0, W, A1 - A0);
  g.fillStyle = L.sleeve; g.fillRect(0, A0, W, ySleeve - A0); if (!L.bareTee) weave(A0, ySleeve, 'rgba(255,255,255,.035)');
  if (L.bareTee) { g.fillStyle = shade; g.fillRect(0, ySleeve - 12, W, 12); }
  else if (!L.vest) { g.fillStyle = L.tee ? L.sleeve : '#f2f2f2'; g.fillRect(0, yWrist - 12, W, 12); }
  // ---- leg band: y 768..1024; y=768 hip, y=1024 sole. Ankle at along≈.73.
  const G0 = 768, G1 = 1024; const ly = along => G0 + along * (G1 - G0); const yAnkle = ly(.74);
  g.fillStyle = L.pants; g.fillRect(0, G0, W, yAnkle - G0); weave(G0, yAnkle, 'rgba(255,255,255,.03)');
  g.fillStyle = L.shoe; g.fillRect(0, yAnkle, W, G1 - yAnkle); g.fillStyle = L.sole; g.fillRect(0, G1 - 18, W, 18);
  if (L.vest) { g.fillStyle = '#2d6fd3'; g.fillRect(0, yAnkle + 22, W, 14); }   // the sneaker stripe
  return tex(c);
}

// ---------- building a boss ----------
export function makeBoss2(id = 'trump', { scale = 1, raw = false } = {}) {   // raw: the undressed mannequin, for the test page
  if (!gltf) throw new Error('bosses2: call loadBosses2() first');
  const L = lookFor(id); const root = new THREE.Group(); root.name = `boss2-${id}`;
  const sway = new THREE.Group(); root.add(sway);                        // the procedural wobble lives here
  const rig = cloneSkinned(gltf.scene); rig.scale.setScalar(BODY_SCALE * (L.size || 1)); sway.add(rig);
  const suitM = std(0xffffff, { map: memo(`suit-${id}`, () => suitTexture(id)), roughness: .85 });
  const skinPlain = std(L.skin, { roughness: .7 });
  rig.traverse(m => {
    if (!m.isMesh) return; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    if (raw) return;
    if (m.userData.part === 'head') { m.visible = false; return; }
    m.material = suitM;
    if (m.userData.part === 'body' && (L.belly || L.chest)) { // push the torso out in bind pose: belly low and forward, chest high
      const geo = m.geometry.clone(); const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const front = Math.max(0, z) / (Math.hypot(x, z) + 1e-6);
        const belly = L.belly * Math.sin(PI * clamp((y - .5) / .45, 0, 1)) * (.35 + .65 * front); const chest = L.chest * Math.sin(PI * clamp((y - .8) / .4, 0, 1));
        const k = 1 + belly + chest; p.setXYZ(i, x * k, y, z * k); }
      p.needsUpdate = true; m.geometry = geo;   // keep the model's normals (recomputing on the non-indexed mesh flat-shades it)
    }
  });
  const headBone = rig.getObjectByName('head'); if (!headBone) throw new Error('bosses2: no head bone');
  const head = new THREE.Group(); head.scale.setScalar(HEAD_SCALE); headBone.add(head);
  const built = buildHead(id, L, head, skinPlain); if (raw) head.visible = false;
  root.scale.setScalar(scale);
  root.userData.boss = makeController(id, { root, sway, rig, head, ...built });
  root.userData.boss.name = L.name; root.userData.boss.height = 2.1 * (L.size || 1);
  if (!raw) mountProps(L, root, { r: rig.getObjectByName('handr') || rig.getObjectByName('hand.r'), l: rig.getObjectByName('handl') || rig.getObjectByName('hand.l'), off: new THREE.Vector3(0, .07, .02) }, std);
  return root;
}

// the caricature head, as bosses.js builds it (that builder isn't exported): skull with the face canvas, jowls/jaw,
// nose, ears, hair, glasses, a tie pin is on the body so it stays there; dizzy stars orbit above
function buildHead(id, L, head, skinPlain) {
  const skinM = L.headShine ? new THREE.MeshPhysicalMaterial({ color: L.skin, roughness: .45, clearcoat: .5, clearcoatRoughness: .3 }) : skinPlain;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.085, .1, .16, 16), skinPlain); neck.position.y = -.04; head.add(neck);
  const face = mood => memo(`face2-${id}-${mood}`, () => makeFace(id, mood)); const faces = { smug: face('smug'), happy: face('happy'), dizzy: face('dizzy') };
  const faceM = L.headShine ? new THREE.MeshPhysicalMaterial({ map: faces.smug, roughness: .45, clearcoat: .45, clearcoatRoughness: .3 }) : std(0xffffff, { map: faces.smug, roughness: .7 });
  const skull = new THREE.Mesh(new THREE.SphereGeometry(.24, 30, 20), faceM); skull.position.y = .24; skull.scale.set(1, 1.04, .96); head.add(skull);
  if (L.jowls) { for (const s of [-1, 1]) { const j = sphere(.09, skinPlain, 16, 12); j.position.set(s * .16, .09, .03); j.scale.set(.9, .75, .9); head.add(j); } const chin = sphere(.08, skinPlain, 14, 10); chin.position.set(0, .035, .1); chin.scale.set(1.2, .6, .9); head.add(chin); }
  else if (id === 'bezos') { const chin = sphere(.12, skinM, 16, 12); chin.position.set(0, .025, .05); chin.scale.set(.9, .7, .85); head.add(chin); }
  else { const jaw = sphere(.15, skinPlain, 16, 12); jaw.position.set(0, .05, .02); jaw.scale.set(1.05, .62, .9); head.add(jaw); }
  const nose = sphere(.045, skinPlain, 14, 10); nose.position.set(0, .18, .235); if (id === 'trump') { nose.scale.set(.95, 1.25, 1.3); nose.rotation.x = .35; nose.position.set(0, .17, .24); } else if (id === 'bezos') nose.scale.set(1.0, .9, 1.1); else nose.scale.set(.9, 1.05, 1.15); head.add(nose);
  for (const s of [-1, 1]) { const ear = sphere(.055, skinPlain, 12, 10); ear.position.set(s * .235, .24, -.01); ear.scale.set(.45, 1, .8); head.add(ear); }
  if (L.hair) {
    const hairM = std(L.hair, { roughness: id === 'trump' ? .55 : .85 });
    if (id === 'trump') {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(.265, 28, 14, 0, PI * 2, 0, PI / 1.95), hairM); cap.position.set(0, .33, -.01); cap.scale.set(1.05, .8, 1.08); cap.rotation.x = -.2; head.add(cap);
      const brim = sphere(.17, hairM, 24, 12); brim.position.set(.02, .375, .15); brim.scale.set(1.2, .3, .9); brim.rotation.x = .22; brim.rotation.z = -.08; head.add(brim);
      const swoop = sphere(.13, hairM, 18, 10); swoop.position.set(-.1, .42, .15); swoop.scale.set(1.05, .34, .95); swoop.rotation.z = .4; swoop.rotation.x = .2; head.add(swoop);
      const crest = sphere(.21, hairM, 20, 10); crest.position.set(.02, .47, .03); crest.scale.set(1.12, .55, 1.12); head.add(crest);
      const flip = sphere(.11, hairM, 16, 10); flip.position.set(.15, .43, .1); flip.scale.set(.7, .32, 1.0); flip.rotation.z = -.5; flip.rotation.x = .15; head.add(flip);
      for (const s of [-1, 1]) { const wing = sphere(.12, hairM, 16, 10); wing.position.set(s * .21, .3, -.03); wing.scale.set(.5, .95, 1.05); head.add(wing); }
    } else {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(.255, 28, 14, 0, PI * 2, 0, PI / 2), hairM); cap.position.set(0, .33, -.01); cap.scale.set(1.03, .78, 1.05); cap.rotation.x = -.32; head.add(cap);
      const fringe = sphere(.12, hairM, 18, 10); fringe.position.set(.06, .41, .17); fringe.scale.set(1.35, .4, .75); fringe.rotation.z = -.2; fringe.rotation.x = .45; head.add(fringe);
      const side2 = sphere(.09, hairM, 14, 8); side2.position.set(-.14, .4, .14); side2.scale.set(1.0, .4, .8); side2.rotation.z = .55; side2.rotation.x = .3; head.add(side2);
      for (const s of [-1, 1]) { const wing = sphere(.1, hairM, 14, 10); wing.position.set(s * .215, .3, -.04); wing.scale.set(.4, .9, 1.0); head.add(wing); }
    }
  }
  if (L.glasses) {
    const lensM = new THREE.MeshPhysicalMaterial({ color: 0x0f1216, roughness: .15, metalness: .2, clearcoat: 1, clearcoatRoughness: .05 }); const frameM = std(0x2a2a2e, { roughness: .35, metalness: .5 });
    for (const s of [-1, 1]) { const lens = new THREE.Mesh(roundedBox(.13, .09, .03, .03, 3), lensM); lens.position.set(s * .095, .245, .222); lens.rotation.y = s * .42; lens.rotation.x = .05; head.add(lens); const arm = new THREE.Mesh(roundedBox(.012, .014, .2, .005, 2), frameM); arm.position.set(s * .2, .25, .1); arm.rotation.y = s * .32; head.add(arm); const hinge = new THREE.Mesh(roundedBox(.03, .014, .014, .005, 2), frameM); hinge.position.set(s * .158, .25, .18); hinge.rotation.y = s * .6; head.add(hinge); }
    const bridge = new THREE.Mesh(roundedBox(.05, .016, .016, .006, 2), frameM); bridge.position.set(0, .255, .25); head.add(bridge);
  }
  addHeadExtras(L, head, std);
  const stars = new THREE.Group(); stars.position.y = .56; head.add(stars); const starM = new THREE.MeshBasicMaterial({ color: 0xffd84a }); for (let i = 0; i < 5; i++) { const st = new THREE.Mesh(new THREE.OctahedronGeometry(.035, 0), starM); const a = i / 5 * PI * 2; st.position.set(Math.cos(a) * .3, Math.sin(a * 2) * .03, Math.sin(a) * .3); st.scale.y = 1.6; stars.add(st); } stars.visible = false;
  head.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); stars.traverse(m => { if (m.isMesh) m.castShadow = false; });
  return { faceM, faces, stars };
}

// ---------- the controller: AnimationMixer crossfades, plus the procedural extras (mood, stars, sway, head bob) ----------
function makeController(id, { root, sway, rig, head, faceM, faces, stars }) {
  const mixer = new THREE.AnimationMixer(rig); const actions = {}; let cur = null, curName = 'idle', t = 0, speed = 1.9, mood = 'smug', finished = false, starK = 0;
  mixer.addEventListener('finished', () => { finished = true; });
  function action(name) {
    if (actions[name]) return actions[name]; const c = CLIP[name]; const a = mixer.clipAction(gltf.byName[c.clip]); a.setLoop(c.loop, Infinity);
    if (c.loop === THREE.LoopOnce) a.clampWhenFinished = true; actions[name] = a; return a;
  }
  function retime() { for (const n of ['walk', 'run']) if (actions[n]) { const c = CLIP[n]; actions[n].timeScale = clamp(speed / c.stride, .4, 4.5) * gltf.byName[c.clip].duration; } }
  const api = {
    names: Object.keys(CLIP), current: () => curName,
    play(name, { fade = .2 } = {}) {
      const c = CLIP[name]; if (!c) { console.warn('bosses2: no clip', name); return api; } if (name === curName && cur && c.loop !== THREE.LoopOnce) return api;
      const next = action(name); next.enabled = true; next.reset(); next.setEffectiveWeight(1);
      if (cur && cur !== next) { next.crossFadeFrom(cur, Math.max(.001, fade), false); } else if (cur === next) next.reset();
      next.play(); cur = next; curName = name; t = 0; finished = false; retime(); return api;
    },
    setSpeed(mps) { speed = Math.max(0, mps || 0); retime(); return api; },
    update(dt = 1 / 60) {
      dt = clamp(dt || 0, 0, .1); t += dt; mixer.update(dt); const c = CLIP[curName];
      const want = c.mood; if (want !== mood) { mood = want; faceM.map = faces[want]; }
      // sway: the drunken stagger for dizzy (yaw drift, roll, a slow lean) fades in and out over the crossfade
      const swayK = c.sway ? smooth(t, 0, .35) : 0; sway.rotation.set(.08 * swayK * Math.sin(1.7 * t), .35 * swayK * Math.sin(1.3 * t), .14 * swayK * Math.sin(2.1 * t));
      if (!c.sway && (sway.rotation.x || sway.rotation.y || sway.rotation.z)) { sway.rotation.x *= .85; sway.rotation.y *= .85; sway.rotation.z *= .85; }
      head.rotation.x = c.headBack ? -.35 + .04 * Math.sin(14 * t) : c.sway ? .25 * Math.sin(3.2 * t) : 0; head.rotation.z = c.sway ? .2 * Math.cos(3.2 * t) : c.headBack ? .04 * Math.sin(14 * t) : 0;
      const wantStars = c.stars ? (curName === 'fall' ? (finished ? 1 : 0) : 1) : 0; starK += (wantStars - starK) * Math.min(1, dt * 6);
      stars.visible = starK > .02; if (stars.visible) { stars.scale.setScalar(Math.max(.01, starK)); stars.rotation.y += .07; }
    },
    head, root, mixer, done: () => CLIP[curName].loop === THREE.LoopOnce && finished,
  };
  api.play('idle', { fade: 0 }); api.update(0); return api;
}
