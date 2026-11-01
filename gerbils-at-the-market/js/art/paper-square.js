// art/paper-square.js — the town square in the recommended hybrid look (docs/ART-DIRECTION.md, direction C):
// solid 3D for the things you walk on and around (ground, road, plaza, fountain, stall bodies, lamps), toon-shaded in one
// palette with an ink outline; painted 2D sprites for everything with a face or a story (gerbils, the billionaire, bags,
// brick boxes, coins, the jar, trees, bushes, signs, the fountain's spray, road arrows).
// Layout copies hub.js's world frame: road along x at z = 0, plaza x ∈ [-11, 11] z ∈ [-6.5, 7.6], fountain (0, 0, 4),
// Lego store (-6.8, 0, 4.6) and Car store (6.8, 0, 4.6) facing -z, the jar at (0, 0, -5.3).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { spriteTexture, billboard, faceCamera, faceFrom, fitText, FONT, setRenderer } from './sprites.js';

// ---------- one palette (the whole look is these hexes) ----------
export const PAL = {
  ink: 0x3b2516, grass: 0x8cc067, cobble: 0xe6d6b6, sand: 0xe9d09c, stone: 0xb9b2a6, stoneDark: 0x8f877c,
  red: 0xd7262c, blue: 0x3a7bd5, yellow: 0xf2c230, cream: 0xfbf0d4, wood: 0xa8743f, iron: 0x2f4a3a, water: 0x7cc8ee,
};
const hex = n => '#' + n.toString(16).padStart(6, '0');

let gradient = null;
function toonGrad() {
  if (gradient) return gradient; const c = document.createElement('canvas'); c.width = 3; c.height = 1; const g = c.getContext('2d');
  ['#8c8c96', '#d2d2d6', '#ffffff'].forEach((col, i) => { g.fillStyle = col; g.fillRect(i, 0, 1, 1); });
  gradient = new THREE.CanvasTexture(c); gradient.minFilter = gradient.magFilter = THREE.NearestFilter; gradient.generateMipmaps = false; return gradient;
}
const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: toonGrad(), ...extra });

// inverted-hull ink outline: a back-face copy pushed out along smoothed normals
const inkMat = new THREE.MeshBasicMaterial({ color: PAL.ink, side: THREE.BackSide });
inkMat.onBeforeCompile = sh => { sh.uniforms.thick = { value: .035 }; sh.vertexShader = 'uniform float thick;\n' + sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * thick;'); };
function outlined(mesh, parent) {
  let g = mesh.geometry.clone(); for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g = mergeVertices(g, 1e-3); g.computeVertexNormals();
  const o = new THREE.Mesh(g, inkMat); o.position.copy(mesh.position); o.rotation.copy(mesh.rotation); o.scale.copy(mesh.scale); (parent || mesh.parent).add(o); return mesh;
}
function add(parent, geo, mat, x = 0, y = 0, z = 0, { ink = true, cast = true, receive = true, ry = 0 } = {}) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = cast; m.receiveShadow = receive; parent.add(m); if (ink) outlined(m, parent); return m;
}

// ---------- painted canvas textures ----------
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function rand(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function tex(c, rep = [1, 1]) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); t.anisotropy = 8; return t; }
function grassTex() {
  const [c, g] = canvas(256, 256); const r = rand(7); g.fillStyle = hex(PAL.grass); g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) { const x = r() * 256, y = r() * 256, rr = 10 + r() * 26; g.fillStyle = r() < .5 ? 'rgba(120,170,84,.35)' : 'rgba(160,206,116,.35)'; for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) { g.beginPath(); g.arc(x + dx, y + dy, rr, 0, 7); g.fill(); } }
  g.strokeStyle = 'rgba(92,140,64,.55)'; g.lineWidth = 2; g.lineCap = 'round'; for (let i = 0; i < 90; i++) { const x = r() * 256, y = r() * 256; g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x - 1, y - 6); g.moveTo(x + 1, y); g.lineTo(x + 3, y - 7); g.stroke(); }
  return tex(c, [60, 60]);
}
function cobbleTex() {
  const [c, g] = canvas(512, 512); const r = rand(3); g.fillStyle = '#cdb994'; g.fillRect(0, 0, 512, 512);
  const rows = 8, rh = 512 / rows;
  for (let j = 0; j < rows; j++) { const off = (j % 2) * 32; for (let i = -1; i < 9; i++) { const x = i * 64 + off + 3, y = j * rh + 3, w = 58, h = rh - 6; const v = r();
    g.fillStyle = v < .33 ? '#ead9b8' : v < .66 ? '#e2cfab' : '#efe0c3'; g.beginPath(); g.roundRect(x, y, w, h, 14); g.fill(); g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.roundRect(x + 6, y + 5, w - 22, 9, 5); g.fill(); } }
  return tex(c);
}
function roadTex() {
  const [c, g] = canvas(512, 128); const r = rand(11); g.fillStyle = hex(PAL.sand); g.fillRect(0, 0, 512, 128);
  g.fillStyle = 'rgba(176,138,84,.35)'; g.fillRect(0, 0, 512, 12); g.fillRect(0, 116, 512, 12);
  for (let i = 0; i < 120; i++) { g.fillStyle = r() < .5 ? 'rgba(176,138,84,.35)' : 'rgba(255,248,226,.5)'; g.beginPath(); g.ellipse(r() * 512, 16 + r() * 96, 2 + r() * 4, 1.5 + r() * 2.5, 0, 0, 7); g.fill(); }
  return tex(c);
}
function facadeTex(wall, trim, door) {
  const W = 512, H = 432; const [c, g] = canvas(W, H); const ink = hex(PAL.ink);
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, wall[0]); gr.addColorStop(1, wall[1]); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,.07)'; for (let y = 24; y < H; y += 48) g.fillRect(0, y, W, 3);
  g.lineWidth = 8; g.strokeStyle = ink; g.lineJoin = 'round';
  // door
  g.fillStyle = door; g.beginPath(); g.moveTo(196, H); g.lineTo(196, 230); g.arc(256, 230, 60, Math.PI, 0); g.lineTo(316, H); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(59,37,22,.5)'; g.lineWidth = 5; for (const x of [236, 276]) { g.beginPath(); g.moveTo(x, 200); g.lineTo(x, H); g.stroke(); }
  g.fillStyle = '#f2c230'; g.strokeStyle = ink; g.lineWidth = 4; g.beginPath(); g.arc(298, 330, 9, 0, 7); g.fill(); g.stroke();
  // windows with shutters and flower boxes
  for (const x of [56, 356]) { g.lineWidth = 7; g.fillStyle = trim; g.fillRect(x - 26, 176, 24, 120); g.strokeRect(x - 26, 176, 24, 120); g.fillRect(x + 102, 176, 24, 120); g.strokeRect(x + 102, 176, 24, 120);
    g.fillStyle = '#bfe6f7'; g.fillRect(x, 176, 100, 120); g.strokeRect(x, 176, 100, 120); g.beginPath(); g.moveTo(x + 50, 176); g.lineTo(x + 50, 296); g.moveTo(x, 236); g.lineTo(x + 100, 236); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 8; g.beginPath(); g.moveTo(x + 14, 220); g.lineTo(x + 34, 190); g.stroke(); g.strokeStyle = ink;
    g.fillStyle = '#b0543a'; g.lineWidth = 6; g.fillRect(x - 8, 298, 116, 26); g.strokeRect(x - 8, 298, 116, 26);
    for (let i = 0; i < 6; i++) { g.fillStyle = ['#f05a8a', '#ffd23a', '#ffffff'][i % 3]; g.beginPath(); g.arc(x + 6 + i * 18, 292, 10, 0, 7); g.fill(); g.lineWidth = 3; g.stroke(); } }
  g.lineWidth = 10; g.strokeStyle = ink; g.strokeRect(5, 5, W - 10, H - 10);
  const t = tex(c); return t;
}
function awningTex(a, b) { const [c, g] = canvas(256, 64); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 32, 0, 32, 64); } g.fillStyle = hex(PAL.ink); g.fillRect(0, 58, 256, 6); return tex(c); }
function rippleTex() {
  const [c, g] = canvas(256, 256); g.fillStyle = hex(PAL.water); g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 6; g.lineCap = 'round'; const r = rand(5);
  for (let i = 0; i < 18; i++) { const x = r() * 256, y = r() * 256; g.beginPath(); g.arc(x, y, 14 + r() * 18, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
  return tex(c, [2, 2]);
}
function skyTex() { const [c, g] = canvas(4, 256); const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#5aa8ec'); gr.addColorStop(.55, '#a9dbf6'); gr.addColorStop(1, '#f6ecd0'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

function roundedRect(x0, z0, x1, z1, r) { const s = new THREE.Shape(); s.moveTo(x0 + r, z0); s.lineTo(x1 - r, z0); s.quadraticCurveTo(x1, z0, x1, z0 + r); s.lineTo(x1, z1 - r); s.quadraticCurveTo(x1, z1, x1 - r, z1); s.lineTo(x0 + r, z1); s.quadraticCurveTo(x0, z1, x0, z1 - r); s.lineTo(x0, z0 + r); s.quadraticCurveTo(x0, z0, x0 + r, z0); return s; }
function flatShape(shape, mat, y, uvScale) {   // shape drawn in (x, -z); laid flat facing up
  const geo = new THREE.ShapeGeometry(shape, 12); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / uvScale, p.getZ(i) / uvScale);
  const m = new THREE.Mesh(geo, mat); m.position.y = y; m.receiveShadow = true; return m;
}

// ---------- the build ----------
export async function buildPaperSquare(renderer) {
  setRenderer(renderer);
  const scene = new THREE.Scene(); scene.background = skyTex(); scene.fog = new THREE.Fog(0xd8ecf4, 60, 150);
  const sprites = [];   // billboards in this scene (faceCamera list)
  const anim = [];      // per-frame updaters

  // light: warm sun from behind the camera's left shoulder, cool sky fill; the sprites take the same light
  scene.add(new THREE.HemisphereLight(0xfff4e2, 0x8aa868, 1.35));
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.5); sun.position.set(-10, 18, -12); sun.target.position.set(0, 0, 1);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0006; sun.shadow.normalBias = .03;
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 70 }); scene.add(sun, sun.target);

  // ground, plaza, road
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ map: grassTex() })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  scene.add(flatShape(roundedRect(-11.25, -7.85, 11.25, 6.75, 3.2), new THREE.MeshLambertMaterial({ color: 0xa9906a }), .006, 4));
  scene.add(flatShape(roundedRect(-11, -7.6, 11, 6.5, 3), new THREE.MeshLambertMaterial({ map: cobbleTex() }), .01, 2.4));
  const rt = roadTex(); rt.repeat.set(400 / 4, 1); const road = new THREE.Mesh(new THREE.PlaneGeometry(400, 3.2), new THREE.MeshLambertMaterial({ map: rt })); road.rotation.x = -Math.PI / 2; road.position.set(100, .02, 0); road.receiveShadow = true; scene.add(road);
  const arrowT = await spriteTexture('arrow'); const arrowM = new THREE.MeshLambertMaterial({ map: arrowT, alphaTest: .5, alphaToCoverage: true, polygonOffset: true, polygonOffsetFactor: -1 });
  for (let x = -38; x <= 70; x += 7) { const a = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), arrowM); a.rotation.x = -Math.PI / 2; a.position.set(x, .03, 0); a.receiveShadow = true; scene.add(a); }

  // backdrop: the painted valley on a big cylinder, clouds
  const hillsT = await spriteTexture('hills', { scale: 1 }); hillsT.wrapS = THREE.RepeatWrapping; hillsT.repeat.set(4, 1);
  const hills = new THREE.Mesh(new THREE.CylinderGeometry(130, 130, 34, 64, 1, true), new THREE.MeshBasicMaterial({ map: hillsT, side: THREE.BackSide, fog: false, transparent: true, depthWrite: false })); hills.position.set(0, 11, 0); hills.renderOrder = -1; scene.add(hills);
  const cloudT = await spriteTexture('cloud', { scale: 1 });
  for (const [x, y, z, h] of [[-40, 26, 95, 10], [25, 30, 100, 13], [70, 24, 80, 9], [-80, 28, 60, 11]]) { const cl = billboard(cloudT, { height: h, blob: 0, unlit: true, lean: 0 }); cl.position.set(x, y, z); cl.userData.sprite.card.material.fog = false; scene.add(cl); sprites.push(cl); }

  // the fountain: 3D stone, cartoon water, a sprite spray
  const stoneM = toon(PAL.stone), stoneD = toon(PAL.stoneDark), F = new THREE.Vector3(0, 0, 4);
  const lathe = pts => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), 40);
  add(scene, lathe([[0, 0], [1.35, 0], [1.42, .38], [1.3, .5], [1.12, .5], [1.12, .12], [0, .12]]), stoneM, F.x, 0, F.z);
  add(scene, new THREE.CylinderGeometry(.16, .22, 1.0, 16), stoneD, F.x, .6, F.z);
  add(scene, lathe([[0, 0], [.58, 0], [.64, .15], [.52, .18], [0, .1]]), stoneM, F.x, 1.05, F.z);
  const rip = rippleTex(); const waterM = toon(0xffffff, { map: rip });
  for (const [r, y] of [[1.12, .42], [.52, 1.21]]) { const w = new THREE.Mesh(new THREE.CircleGeometry(r, 40), waterM); w.rotation.x = -Math.PI / 2; w.position.set(F.x, y, F.z); w.receiveShadow = true; scene.add(w); }
  anim.push((dt, t) => { rip.offset.set(t * .03, t * .02); });
  const spray = billboard(await spriteTexture('splash'), { height: 1.5, blob: 0, lean: .3 }); spray.position.set(F.x, 1.15, F.z); scene.add(spray); sprites.push(spray);
  anim.push((dt, t) => { spray.userData.sprite.card.scale.y = 1 + Math.sin(t * 6) * .05; });

  // lamps: 3D iron, a glowing lantern
  const ironM = toon(PAL.iron), glowM = new THREE.MeshBasicMaterial({ color: 0xffe08a });
  for (const [x, z] of [[-3.4, 2.3], [3.4, 2.3], [-3.4, 6.3], [3.4, 6.3]]) {
    add(scene, new THREE.CylinderGeometry(.15, .2, .22, 12), ironM, x, .11, z); add(scene, new THREE.CylinderGeometry(.05, .06, 2.7, 10), ironM, x, 1.5, z);
    add(scene, new THREE.BoxGeometry(.36, .07, .36), ironM, x, 2.86, z); add(scene, new THREE.ConeGeometry(.3, .26, 4), ironM, x, 3.3, z, { ry: Math.PI / 4 });
    add(scene, new THREE.BoxGeometry(.24, .32, .24), glowM, x, 3.04, z, { cast: false });
  }

  // stalls: a 3D body with a painted facade, a toon roof, a striped awning, a painted board, a counter with sprites
  const boardT = name => spriteTexture('board', { key: name, text: (g, w, h) => fitText(g, name, w / 2, h / 2 + 2, w * .78, h * .5) });
  async function stall(name, x, z, { wall, trim, door, roof, awning }) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.PI; scene.add(g);
    add(g, new THREE.BoxGeometry(3, .3, 3), toon(PAL.stone), 0, .15, 0);
    const plaster = toon(new THREE.Color(wall[1]).getHex()); const front = toon(0xffffff, { map: facadeTex(wall, trim, door) });
    add(g, new THREE.BoxGeometry(2.6, 2.2, 2.6), [plaster, plaster, plaster, plaster, front, plaster], 0, 1.4, 0);
    const tri = new THREE.Shape(); tri.moveTo(-1.75, 0); tri.lineTo(1.75, 0); tri.lineTo(0, 1.25); tri.closePath();
    const rg = new THREE.ExtrudeGeometry(tri, { depth: 3.2, bevelEnabled: false }); rg.translate(0, 0, -1.6); add(g, rg, toon(roof), 0, 2.5, 0);
    add(g, new THREE.BoxGeometry(.3, .5, .3), toon(0x9a8f84), .7, 3.35, -.5);
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.0), toon(0xffffff, { map: awningTex(...awning), side: THREE.DoubleSide })); aw.position.set(0, 2.25, 1.62); aw.rotation.x = -1.05; aw.castShadow = true; aw.receiveShadow = true; g.add(aw);
    const bt = await boardT(name); const bw = 2.5, bh = bw / bt.userData.aspect;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshLambertMaterial({ map: bt, alphaTest: .5, alphaToCoverage: true })); board.position.set(0, 3.1, 1.75); board.rotation.x = -.12; board.castShadow = true; g.add(board);
    add(g, new THREE.BoxGeometry(2.4, .7, .5), toon(PAL.wood), 0, .65, 1.75);
    return g;
  }
  await stall('Lego store', -6.8, 4.6, { wall: ['#fbe9a6', '#f2d27a'], trim: '#d7262c', door: '#8a5a30', roof: PAL.red, awning: ['#d7262c', '#fbf0d4'] });
  await stall('Car store', 6.8, 4.6, { wall: ['#d6ecf6', '#b4d6e8'], trim: '#3a7bd5', door: '#6b4423', roof: PAL.blue, awning: ['#3a7bd5', '#fbf0d4'] });

  // ---------- the sprites ----------
  const put = (b, x, y, z) => { b.position.set(x, y, z); scene.add(b); sprites.push(b); return b; };
  const legoT = await spriteTexture('legobox'), carT = await spriteTexture('car'), bagT = await spriteTexture('moneybag'), coinT = await spriteTexture('coin');
  // counters: boxes on the Lego counter, cars on the Car counter (the stall faces -z, so its counter sits at z - 1.75)
  for (const dx of [-.75, 0, .75]) put(billboard(legoT, { height: .55, blob: 0 }), -6.8 + dx, 1.0, 4.6 - 1.75);
  for (const dx of [-.6, .6]) put(billboard(carT, { height: .42, blob: 0 }), 6.8 + dx, 1.0, 4.6 - 1.75);
  // a stack of brick boxes on the plaza, by the Lego store
  for (const [x, y, z, h] of [[-4.6, 0, 1.9, .9], [-5.4, 0, 2.3, .9], [-5.0, .62, 2.1, .8]]) put(billboard(legoT, { height: h, blob: y ? 0 : .8 }), x, y, z);

  // the jar on a 3D stone stand, its label written in Fredoka
  const J = new THREE.Vector3(0, 0, -5.3);
  add(scene, new THREE.CylinderGeometry(.42, .5, .45, 24), toon(PAL.stoneDark), J.x, .225, J.z);
  const jarT = await spriteTexture('jar', { text: (g, w, h, s) => { fitText(g, 'THE JAR', 256 * s, 330 * s, 140 * s, 34 * s); fitText(g, 'everybody puts in', 256 * s, 362 * s, 140 * s, 18 * s, { weight: 600 }); } });
  put(billboard(jarT, { height: 1.35, blob: 0, anchor: 20 / 640 }), J.x, .45, J.z);

  // the billionaire, his bags, the coins
  const boss = put(billboard(await spriteTexture('billionaire'), { height: 2.7, anchor: 16 / 768, cast: true, blob: .7, lean: .35 }), 4.2, 0, -2.0);
  anim.push((dt, t) => { const c = boss.userData.sprite.card; c.rotation.z = Math.sin(t * 1.6) * .035; c.position.y = Math.abs(Math.sin(t * 1.6)) * .03; });
  const bags = [[5.3, -2.8], [5.9, -2.1], [5.1, -1.2], [6.2, -3.0]].map(([x, z], i) => put(billboard(bagT, { height: .85 - i * .05, anchor: 16 / 512, blob: .75 }), x, 0, z));
  anim.push((dt, t) => bags.forEach((b, i) => { b.userData.sprite.card.position.y = Math.max(0, Math.sin(t * 2.4 + i * 1.3)) * .04; }));
  const coins = [[-.9, -3.6], [.8, -3.9], [1.6, -3.2], [-1.8, -3.4]].map(([x, z]) => put(billboard(coinT, { height: .4, blob: .6, lean: .2 }), x, .1, z));
  anim.push((dt, t) => coins.forEach((c, i) => { const s = c.userData.sprite; s.squashX = Math.max(.12, Math.abs(Math.cos(t * 2.6 + i))); s.card.position.y = .08 + Math.sin(t * 3 + i) * .05; }));

  // gerbils: the player (golden) and three townsfolk, wandering and hopping
  const FUR = {
    golden: null,
    grey: { '#e8bb80': '#e4e0d8', '#c98f4e': '#aaa49b', '#93602f': '#736d64', '#f7e8cc': '#fbf7ee' },
    snow: { '#e8bb80': '#fffaf0', '#c98f4e': '#f1e6d2', '#93602f': '#cbb99c', '#f7e8cc': '#ffffff' },
    cocoa: { '#e8bb80': '#8a6a52', '#c98f4e': '#5e4433', '#93602f': '#3c2a1f', '#f7e8cc': '#d9c3a6' },
  };
  const folk = [];
  for (const [fur, x, z, h] of [['golden', -1.6, -2.4, 1.0], ['grey', 2.2, -4.4, .8], ['snow', -3.2, -4.6, .75], ['cocoa', 1.4, .9, .8]]) {
    const b = put(billboard(await spriteTexture('gerbil', { recolor: FUR[fur] }), { height: h, anchor: 16 / 512, blob: .65 }), x, 0, z);
    folk.push({ b, home: new THREE.Vector3(x, 0, z), target: new THREE.Vector3(x, 0, z), wait: Math.random() * 2, hop: Math.random() * 6 });
  }
  let cam = null;
  anim.push((dt, t) => { for (const f of folk) { const p = f.b.position, s = f.b.userData.sprite; const d = f.target.clone().sub(p); d.y = 0;
    if (d.length() < .05) { f.wait -= dt; s.card.position.y = 0; s.card.scale.y = 1; if (f.wait <= 0) { f.target.set(f.home.x + (Math.random() - .5) * 3, 0, f.home.z + (Math.random() - .5) * 2); f.wait = 1 + Math.random() * 2.5; } continue; }
    const step = Math.min(d.length(), dt * 1.1); d.normalize(); p.addScaledVector(d, step); if (cam) faceFrom(f.b, d.x, d.z, cam);
    f.hop += dt * 10; const k = Math.abs(Math.sin(f.hop)); s.card.position.y = k * .07; s.card.scale.y = .94 + k * .1; } });

  // trees and bushes: painted sprites round the plaza edge
  const treeT = await spriteTexture('tree'), bushT = await spriteTexture('bush');
  const r = rand(21); let placed = 0;
  for (let i = 0; i < 400 && placed < 34; i++) { const x = -34 + r() * 70, z = -22 + r() * 46;
    if (Math.abs(z) < 3.2) continue; if (z < -10 && Math.abs(x) < 18) continue; if (x > -13 && x < 13 && z > -8.5 && z < 9.5) continue;
    put(billboard(treeT, { height: 4 + r() * 1.8, anchor: 16 / 640, cast: true, blob: .5, lean: .25 }), x, 0, z); placed++; }
  for (const [x, z] of [[-1.9, 2.3], [1.9, 2.3], [-1.9, 5.8], [1.9, 5.8], [-10, -5.5], [10, -5.5], [-10.2, 6.6], [10.2, 6.6], [-9.8, -2.4], [9.8, -2.4]])
    put(billboard(bushT, { height: .75, anchor: 8 / 192, blob: .7 }), x, 0, z);

  function update(dt, t, camera) { cam = camera; for (const f of anim) f(dt, t); faceCamera(camera, sprites); }
  return { scene, update, sprites, sun };
}
