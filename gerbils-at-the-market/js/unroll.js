// The Long Road (round 3, 10/31): every billionaire's whole pile as one row of money bags, laid up the valley from the jar.
// Every bag is the same size with the same gap, and every row STAYS laid, so the row lengths keep the real ratios and no
// number is needed. The first row ever laid also sets down Molly's one Lego box and a gerbil family's whole life of work:
// a pebble a few millimetres long, so it gets a glowing ring and the family standing beside it.
//
//   createUnroll(ctx) → U, and U.longRoad (the persistent row manager, contract C2):
//     longRoad = { group, lay(id, { instant = true }), restore(ids[]), clear(), setVisible(bool), has(id),
//                  extent() → { x0, x1, z0, z1 } | null, lookoutShot(from: Vector3) → { pos, look }, rowLength(id) → metres }
//   U.start(stop, { grown })   the walk for that row (it lays the row), then the caption, then U.end() on its own: no card
//   U.update(dt, now); U.skip() (hold A: jumps to the end state); U.end() (calls ctx.onEnd(stop)); U.abort()
//
// ctx: scene, player, camera, hud, play, caption(text, sub, ms), narrate?(text), aWord?(), sfx, data (billionaires.json),
//      longRoad = { x0, z0, laneGap, spacing, order } (lane i = order.indexOf(id), z = z0 - i * laneGap), heightAt?(x, z),
//      gerbilFrom?(opts), onEnd(stop).
// Pacing: bags pop in from start to end in POP_S, Molly walks the row at WALK_MPS (the same for every row, so the walk time is
// the felt length) for at most WALK_CAP_S, then the camera climbs (2.5-8 s, longer for a longer row) to the chart shot: every row
// laid so far, side-on from across the road, from one start line to each row's name post (his face and name in his road-sign
// colour). It holds HOLD_S, then one caption + voice line from the ratio words, and U.end() SAY_S later. lookoutShot() is the
// same chart shot over every row laid (the lookout and the celebration's last shot).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as P from './props.js';
import { gerbilFrom as gerbilFrom0 } from './parts.js';

const POP_S = 1.5;          // the row pops in, start to end
const WALK_MPS = 3;         // Molly's walk, the same for every row
const WALK_CAP_S = 15;      // then the camera takes over
const HOLD_S = 2, END_HOLD_S = 1.2, SAY_S = 3;
const PEBBLE_S = 6;         // the first row's look at the pebble, before the bags pop in
const BAG_H = .42;
const FLAG_H = 1.3;
const _v = new THREE.Vector3(), _look = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const NUMW = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
// each row's colour: his road-sign colour (hub.js ARROW_STYLE), on its ribbon and on the name post at its far end
const ROW_COLOR = { trump: 0xf0c040, bloomberg: 0xf4f1e8, walton: 0xf28c28, ellison: 0x1d2b4a, zuckerberg: 0x7b3fc4, page: 0x2f9e44, bezos: 0x2d6fd3, musk: 0xd7262c };
const ROW_INK = { trump: '#3a2a08', bloomberg: '#1d2b4a' };   // dark letters on the two light boards; white on the rest
// The chart shot (verify round 3): side-on to the rows, from across the road, a little above them, so every row runs left to
// right from one start line at the jar end and their far ends (each with his name post) line up like a bar chart.
const CHART_PITCH = true, CHART_MARGIN = 1.1, CHART_EYE = .32;   // CHART_EYE: the camera's height, x its distance (about the chart's middle)
// Seen from far off a row of bags is thinner than a pixel, so once the camera is high (the climb, the lookout, the last shot)
// each row also stands up as a wall in his colour, from the start line to his end: lane by lane each wall is a step taller,
// and the rows run in ascending order away from the camera, so every wall shows as one band, a bar chart the kids built. The
// name post (his face and name) stands on the top of his wall's far end. Sizes are in "life units" times k, and k grows
// with the camera's distance, so the chart reads the same from any height. Near the ground (the walk) there are no walls
// and each post is life size or POST_K_NEAR x its distance.
const POST_K = .15, POST_K_NEAR = .045, WALL_BASE = .3, WALL_STEP = .33;   // WALL_STEP x k >= the board's height, so the boards never overlap
const CHART_H0 = 14, CHART_H1 = 30;   // the walls fade in as the camera rises from 14 m to 30 m above the ground

// Every big scattered thing (env.js's instanced trees, bushes and rocks; grass is too small to count) standing in the strip is
// shrunk to nothing, so the camera never starts inside a tree. Returns the undo.
function clearCameraStrip(scene, keep, x0, x1, z0 = -.5, z1 = 8.5) {
  const hidden = [];
  scene.traverse(o => {
    if (!o.isInstancedMesh || keep.includes(o)) return; let p = o.parent; while (p) { if (keep.includes(p)) return; p = p.parent; }
    const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); if (!g.boundingSphere || g.boundingSphere.radius < .9) return;
    let any = false;
    for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, _m); const e = _m.elements, x = e[12], z = e[14];
      if (x < x0 || x > x1 || z < z0 || z > z1) continue; hidden.push([o, i, _m.clone()]); o.setMatrixAt(i, ZERO); any = true; }
    if (any) o.instanceMatrix.needsUpdate = true;
  });
  return () => { const touched = new Set(); for (const [o, i, m] of hidden) { o.setMatrixAt(i, m); touched.add(o); } for (const o of touched) o.instanceMatrix.needsUpdate = true; hidden.length = 0; };
}

// The ratio words: this row against the longest row already laid. Honest comparisons only, from the data at load.
function timesWord(k) { return k === 2 ? 'twice' : `${NUMW[k] || 'ten'} times`; }
function ratioLine(name, prevName, r) {
  if (!prevName) return `That is all of ${name}'s money, in one row.`;
  if (r >= 10) return `${prevName}'s row looks like a tiny stub next to this one.`;
  if (r >= 1.7) { const k = Math.max(2, Math.min(10, Math.round(r))); const q = r < k - .1 ? 'almost' : r > k + .1 ? 'more than' : 'about';
    return `This row is ${q} ${timesWord(k)} as long as ${prevName}'s row.`; }   // (verify) from 1.7 it is "almost twice": 1.75 is not "one and a half"
  if (r >= 1.4) return `This row is about one and a half times as long as ${prevName}'s row.`;
  if (r >= 1.1) return `This row is a good bit longer than ${prevName}'s row.`;
  if (r >= .9) return `This row is about as long as ${prevName}'s row.`;
  return `This row is shorter than ${prevName}'s row.`;
}

export function createUnroll(ctx) {
  const { scene, player, camera, hud, play } = ctx;
  const U = { active: false, stop: null };
  Object.defineProperty(U, 'phase', { get: () => phase });   // for tests: 'pebble' | 'pop' | 'walk' | 'climb' | 'hold' | 'atEnd' | 'say' | null
  const L = { x0: 34, z0: -2.6, laneGap: .6, spacing: .5, order: [], ...(ctx.longRoad || {}) };
  const bagUSD = Number(ctx.data?.bag_usd || ctx.BAG_USD) || 434e6;
  const bosses = ctx.data?.bosses || [];
  if (!L.order?.length) L.order = bosses.map(b => b.id);
  // bags per row and the shown names, computed once at load from billionaires.json
  const BAGS = {}, NAME = {};
  for (const b of bosses) { BAGS[b.id] = Math.max(1, Math.round(Number(b.net_worth_usd) / bagUSD)); NAME[b.id] = b.display_name || b.name; }
  const bagsFor = (id, boss) => BAGS[id] ?? Math.max(1, Math.round(Number(boss?.net_worth_usd || 0) / bagUSD) || 15);
  const nameFor = (id, boss) => NAME[id] || boss?.display_name || boss?.name || id;
  const heightAt = (x, z) => { const h = ctx.heightAt?.(x, z); return Number.isFinite(h) ? h : 0; };
  const laneOf = id => { let i = L.order.indexOf(id); if (i < 0) { L.order.push(id); i = L.order.length - 1; } return i; };
  const laneZ = id => L.z0 - laneOf(id) * L.laneGap;
  const family = (ctx.ordinary || ctx.data?.ordinary || []).find?.(o => o.id === 'family') || { usd: 83730, life_years: 40 };
  const skipWord = () => `Hold ${ctx.aWord?.() || 'Space'} to skip`;

  // ---------- the persistent row manager ----------
  const group = new THREE.Group(); group.name = 'longRoad'; scene.add(group);
  const rows = new Map();            // id → { id, n, z, x1, mesh, flag, popT, popping, shown }
  let pebble = null;                 // { group, ring, x, z } once the first row is laid
  const undos = [];
  let sackGeo = null, sackMat = null;
  function bagMesh(n) {
    let m = null;
    if (P.artMode?.() !== 'old') { try { m = P.spriteInstanced?.('moneybag', n, { height: BAG_H, cross: true }) || null; } catch (e) { console.warn('spriteInstanced moneybag', e); m = null; } }
    if (!m) {
      if (!sackGeo) { const sack = new THREE.SphereGeometry(.2, 8, 6); sack.scale(1, 1.15, 1); sack.translate(0, .22, 0); const neck = new THREE.CylinderGeometry(.055, .09, .11, 6); neck.translate(0, .46, 0); sackGeo = mergeGeometries([sack, neck]); sackMat = new THREE.MeshStandardMaterial({ color: 0x9c6a3a, roughness: .95 }); }
      m = new THREE.InstancedMesh(sackGeo, sackMat, n); m.castShadow = true; m.userData.sack = true;
    }
    m.frustumCulled = false; return m;
  }
  function placeBag(row, i, k) {   // k = scale (0..1+, the pop)
    const x = L.x0 + i * L.spacing, z = row.z;
    if (row.mesh.userData.sack) _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, i * .7); else _q.identity();
    _m.compose(_v.set(x, heightAt(x, z), z), _q, _s.setScalar(Math.max(1e-4, k))); row.mesh.setMatrixAt(i, _m);
  }
  // a ground ribbon under each row, so from high up every row reads as one line (a bar chart they walk); same length as the row
  const RIB_STEP = 2;
  function makeRibbon(x0, x1, z) {
    const n = Math.max(1, Math.ceil((x1 - x0) / RIB_STEP)), pos = new Float32Array((n + 1) * 2 * 3), idx = [];
    for (let i = 0; i <= n; i++) { const x = Math.min(x1, x0 + i * RIB_STEP); for (let s = 0; s < 2; s++) { const zz = z + (s ? .18 : -.18), o = (i * 2 + s) * 3; pos[o] = x; pos[o + 1] = heightAt(x, zz) + .025; pos[o + 2] = zz; } }
    for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xf2c230, transparent: true, opacity: .85, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.renderOrder = 1; m.frustumCulled = false; m.userData.segs = n; return m;
  }
  function buildPebble(firstZ = L.z0) {
    // (verify) at the head of the first row laid, just before its first bag, so the pebble and the row read as one comparison
    const g = new THREE.Group(); const x = L.x0 - .6, z = firstZ, y = heightAt(x, z); g.position.set(x, y, z);
    // the family's whole life of work at the row's scale: a few millimetres. Drawn at least 3 cm with a dark ink rim and a
    // twinkle over it, so a child looking into the ring finds it (the size of the marker is not the size of the money)
    const len = Math.max(.03, (Number(family.usd) || 83730) * (Number(family.life_years) || 40) / bagUSD * L.spacing);
    const stone = new THREE.Mesh(new THREE.SphereGeometry(.5, 14, 10), new THREE.MeshStandardMaterial({ color: 0xffd447, emissive: 0xf2c230, emissiveIntensity: .9, roughness: .4 }));
    stone.scale.set(len, len * .7, len * .8); stone.position.y = len * .35; g.add(stone);
    const ink = new THREE.Mesh(stone.geometry, new THREE.MeshBasicMaterial({ color: 0x3b2516, side: THREE.BackSide })); ink.scale.copy(stone.scale).multiplyScalar(1.35); ink.position.copy(stone.position); g.add(ink);
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), transparent: true, depthWrite: false, color: 0xfff3b0 })); glint.position.set(0, len * .7 + .06, 0); glint.scale.setScalar(.12); glint.renderOrder = 4; g.add(glint);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.32, .03, 10, 48), new THREE.MeshStandardMaterial({ color: 0xf2c230, emissive: 0xffd24a, emissiveIntensity: 1.4, roughness: .4 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .04; g.add(ring);
    // the family: three gerbils standing beside it
    const gf = ctx.gerbilFrom || gerbilFrom0; const fam = [[-.62, .25, 0xc98f4e, 1.15], [-.55, -.35, 0xb57a43, 1.05], [-.95, -.05, 0xe0b27e, .8]];
    for (const [dx, dz, color, s] of fam) { let gb = null; try { gb = gf({ color, scale: s }); } catch (e) { gb = null; }
      if (gb) { gb.position.set(dx, 0, dz); gb.rotation.y = Math.atan2(-dx, -dz); g.add(gb); } }
    // Molly's one Lego box, at the row's start
    let box = null; try { box = P.makeCrate?.(.32) || null; } catch (e) { box = null; }
    if (!box) { box = new THREE.Mesh(new THREE.BoxGeometry(.32, .24, .2), new THREE.MeshStandardMaterial({ color: 0xd7262c })); box.position.y = .12; }
    const bg = new THREE.Group(); bg.add(box); bg.position.set(.2, 0, -.72); bg.rotation.y = .3; g.add(bg);   // beside the ring on the far side (the pebble shot looks over the ring at it), at the row's head
    group.add(g); pebble = { group: g, ring, glint, x, z, y };
  }
  let glintTex = null;
  function glintTexture() {   // a four-point star, soft
    if (glintTex) return glintTex; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,240,170,.8)'); gr.addColorStop(1, 'rgba(255,240,170,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,.95)'; for (const [w, h] of [[3, 30], [30, 3]]) { g.beginPath(); g.ellipse(32, 32, w, h, 0, 0, 7); g.fill(); }
    glintTex = new THREE.CanvasTexture(c); glintTex.colorSpace = THREE.SRGBColorSpace; return glintTex;
  }
  // the name post at a row's far end: a pole and a board with his face (ctx.bossThumb, the 3D boss drawn once to a canvas) and his
  // name, in his road-sign colour. update() scales it with the camera distance so it reads from the lookout.
  function makePost(id, x, z) {
    const g = new THREE.Group(); const y = heightAt(x, z); g.position.set(x, y, z); const col = ROW_COLOR[id] ?? 0xd7262c;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.03, .035, 1, 8), new THREE.MeshBasicMaterial({ color: 0x3b2516 })); pole.position.y = .5; g.add(pole);
    const c = document.createElement('canvas'); c.width = 512; c.height = 200; const x2 = c.getContext('2d'); const hex = '#' + col.toString(16).padStart(6, '0');
    x2.fillStyle = '#3b2516'; x2.beginPath(); x2.roundRect(0, 0, 512, 200, 36); x2.fill(); x2.fillStyle = hex; x2.beginPath(); x2.roundRect(10, 10, 492, 180, 28); x2.fill();
    let face = null; try { face = ctx.bossThumb?.(id) || null; } catch (e) { face = null; }
    const fx = 20; if (face) { x2.fillStyle = '#fbf0d4'; x2.beginPath(); x2.arc(fx + 80, 100, 82, 0, 7); x2.fill(); x2.save(); x2.beginPath(); x2.arc(fx + 80, 100, 78, 0, 7); x2.clip(); x2.drawImage(face, fx + 2, 22, 156, 156); x2.restore(); }
    const tx = face ? 190 : 24, tw = 512 - tx - 22; const nm = nameFor(id); const words = nm.split(' '); const lines = words.length > 2 ? [words.slice(0, 2).join(' '), words.slice(2).join(' ')] : [nm];
    x2.fillStyle = ROW_INK[id] || '#ffffff'; x2.textAlign = 'left'; x2.textBaseline = 'middle'; let fs = 64; x2.font = `700 ${fs}px Fredoka, "Arial Rounded MT Bold", sans-serif`; while (fs > 26 && Math.max(...lines.map(l => x2.measureText(l).width)) > tw) { fs -= 2; x2.font = `700 ${fs}px Fredoka, "Arial Rounded MT Bold", sans-serif`; }
    lines.forEach((l, i) => x2.fillText(l, tx, 100 + (i - (lines.length - 1) / 2) * fs * 1.05));
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const board = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false })); board.renderOrder = 6; g.add(board);
    g.userData = { pole, board, lane: laneOf(id), aspect: 512 / 200 }; sizePost(g, 1, FLAG_H); return g;
  }
  function makeWall(id) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: ROW_COLOR[id] ?? 0xd7262c, side: THREE.DoubleSide, fog: false }));   // opaque: the depth test stacks the walls, front ones over back ones
    m.visible = false; m.renderOrder = 2; m.frustumCulled = false; return m;
  }
  function sizePost(g, k, h) {   // k: world metres per "life size" unit; h: the pole's height in metres
    const { pole, board, aspect } = g.userData, bw = .9 * k, bh = bw / aspect;
    pole.scale.set(Math.max(1, k * .6), h, Math.max(1, k * .6)); pole.position.y = h / 2; board.scale.set(bw, bh, 1); board.position.set(0, h + bh / 2, 0);
  }
  const _pc = new THREE.Vector3();
  const _cc = new THREE.Vector3();
  function scalePosts() {
    const cam = ctx.camera || camera; if (!cam || !rows.size) return;
    const xa = pebble ? pebble.x : L.x0, xb = maxRowX(), zm = L.z0 - L.laneGap * 3.5; _cc.set((xa + xb) / 2, heightAt((xa + xb) / 2, zm), zm);
    const alt = cam.position.y - Math.max(0, heightAt(cam.position.x, cam.position.z)), f = Math.min(1, Math.max(0, (alt - CHART_H0) / (CHART_H1 - CHART_H0)));
    const kc = Math.max(1, cam.position.distanceTo(_cc) * POST_K);
    for (const r of rows.values()) {
      const lane = laneOf(r.id), wallH = (WALL_BASE + lane * WALL_STEP) * kc;
      if (r.wall) { r.wall.visible = f > 0; if (f > 0) { const x0w = L.x0 - L.spacing * .5, x1w = r.x1 + L.spacing * .5, gy = Math.min(heightAt(x0w, r.z), heightAt((x0w + x1w) / 2, r.z), heightAt(x1w, r.z)) - .3;
        r.wall.scale.set(x1w - x0w, wallH * f + .01, 1); r.wall.position.set((x0w + x1w) / 2, gy + (wallH * f) / 2, r.z); } }
      if (!r.flag) continue; r.flag.getWorldPosition(_pc);
      const kn = Math.max(1, cam.position.distanceTo(_pc) * POST_K_NEAR), k = kn + (kc - kn) * f, h = FLAG_H * kn + ((wallH + .2 * kc) - FLAG_H * kn) * f;
      sizePost(r.flag, k, Math.max(FLAG_H, h));
    }
  }
  function lay(id, { instant = true } = {}) {
    const boss = bosses.find(b => b.id === id) || U.stop?.boss;
    let row = rows.get(id); if (row) { if (instant) finishPop(row); return row; }
    const n = bagsFor(id, boss), z = laneZ(id), x1 = L.x0 + (n - 1) * L.spacing;
    if (!pebble) buildPebble(z);
    row = { id, n, z, x1, mesh: bagMesh(n), popT: 0, popping: !instant, shown: 0 };
    for (let i = 0; i < n; i++) { if (instant) placeBag(row, i, 1); else row.mesh.setMatrixAt(i, ZERO); }
    row.shown = instant ? n : 0; row.mesh.instanceMatrix.needsUpdate = true; row.mesh.count = n;
    row.mesh.onBeforeRender = () => stepPop(row);
    group.add(row.mesh);
    row.flag = makePost(id, x1 + L.spacing * .8, z); group.add(row.flag); row.wall = makeWall(id); group.add(row.wall);
    row.ribbon = makeRibbon(L.x0 - L.spacing * .5, x1 + L.spacing * .5, z); if (!instant) row.ribbon.geometry.setDrawRange(0, 0); group.add(row.ribbon); tint(row, false);
    rows.set(id, row);
    if (!batching) clearStrip(x1); else batchX1 = Math.max(batchX1, x1);
    if (!instant) row.popStart = performance.now();
    return row;
  }
  // (verify) each ribbon in his road-sign colour; the row being walked is drawn solid, the others a little see-through
  function tint(row, current) { if (!row?.ribbon) return; row.ribbon.material.color.setHex(ROW_COLOR[row.id] ?? 0xf2c230); row.ribbon.material.opacity = current ? 1 : .8; }
  // The camera strip (trees cleared so no shot starts inside one, and the chart shot from across the road sees the rows): it only
  // ever grows, so a row inside the strip already cleared costs nothing, and restore() clears once for all its rows (verify:
  // each lay used to traverse the whole scene).
  let stripX1 = -Infinity, batching = false, batchX1 = -Infinity;
  function clearStrip(x1) {
    const want = x1 + 8; if (want <= stripX1) return; const from = stripX1 === -Infinity ? L.x0 - 16 : stripX1;
    undos.push(clearCameraStrip(scene, [group, player], from, want, L.z0 - L.laneGap * 8 - 1, 1));
    undos.push(clearCameraStrip(scene, [group, player], Math.max(from, 44), want, 1, 16));   // across the road, past the town: the chart shot looks over it
    stripX1 = want;
  }
  function stepPop(row) {
    if (!row.popping) return;
    const t = (performance.now() - row.popStart) / 1000, n = row.n, win = Math.max(1, Math.ceil(n * .2 / POP_S));
    const want = Math.min(n, Math.ceil(n * Math.min(1, t / POP_S)));
    for (let i = Math.max(0, row.shown - win); i < want; i++) { const age = (t - i / n * POP_S) / .2; placeBag(row, i, age >= 1 ? 1 : Math.max(.01, Math.sin(Math.min(1, age) * Math.PI * .6) / Math.sin(Math.PI * .6) * 1.15)); }
    row.shown = want; row.mesh.instanceMatrix.needsUpdate = true;
    if (row.ribbon) row.ribbon.geometry.setDrawRange(0, Math.ceil(row.ribbon.userData.segs * want / n) * 6);
    if (t > POP_S + .25) finishPop(row);
  }
  function finishPop(row) { if (!row.popping) return; row.popping = false; for (let i = 0; i < row.n; i++) placeBag(row, i, 1); row.shown = row.n; row.mesh.instanceMatrix.needsUpdate = true; row.ribbon?.geometry.setDrawRange(0, Infinity); }
  function clear() {
    for (const row of rows.values()) { group.remove(row.mesh); group.remove(row.flag); if (row.wall) { group.remove(row.wall); row.wall.geometry.dispose(); row.wall.material.dispose(); } row.flag?.traverse?.(o => { if (o.material) { o.material.map?.dispose?.(); o.material.dispose?.(); } o.geometry?.dispose?.(); }); if (row.ribbon) { group.remove(row.ribbon); row.ribbon.geometry.dispose(); } row.mesh.dispose?.(); }
    rows.clear(); if (pebble) { group.remove(pebble.group); pebble = null; }
    while (undos.length) undos.pop()(); stripX1 = -Infinity;
  }
  function extent() {
    if (!rows.size && !pebble) return null;
    let x1 = L.x0, z0 = Infinity, z1 = -Infinity;
    for (const r of rows.values()) { x1 = Math.max(x1, r.x1 + L.spacing); z0 = Math.min(z0, r.z); z1 = Math.max(z1, r.z); }
    if (pebble) { z0 = Math.min(z0, pebble.z); z1 = Math.max(z1, pebble.z); }
    return { x0: pebble ? pebble.x - 1 : L.x0, x1, z0, z1 };
  }
  // the chart shot over every row laid (or the rows in ids): side-on from across the road, the start line at the left edge, the
  // longest row's post at the right, a little above so the lanes stack (verify round 3: the old shot looked along the rows, so
  // perspective squeezed them into hairlines with staggered ends)
  function chartShot(xEnd) {
    const cam = ctx.camera || camera, fov = THREE.MathUtils.degToRad(cam?.fov || 58), aspect = cam?.aspect || 1.6;
    const xa = (pebble ? pebble.x : L.x0) - 1.5, xb = xEnd + 1.5, w = Math.max(6, xb - xa) * CHART_MARGIN, hf = 2 * Math.atan(Math.tan(fov / 2) * aspect);
    // the end posts' boards hang half their width (.45 k, k = POST_K d) past each end: leave room for them on both sides
    const d = (w / 2) / Math.max(.2, Math.tan(hf / 2) - .45 * POST_K * 1.15), zm = L.z0 - L.laneGap * 3.5, cx = (xa + xb) / 2, gy = Math.max(0, heightAt(cx, zm));
    const pos = new THREE.Vector3(cx, gy + d * CHART_EYE, zm + d);   // level with the middle of the chart: the posts stand straight, none splays off the edge
    // above any hill on the way to the rows
    for (let i = 1; i < 16; i++) { const k = i / 16, z = pos.z + (zm - pos.z) * k, hy = heightAt(cx, z), ly = pos.y + (gy - pos.y) * k; if (hy > ly - 1) pos.y += (hy - ly + 1) / (1 - k); }
    const look = new THREE.Vector3(cx, pos.y - d * .02, zm);
    return { pos, look };
  }
  function lookoutShot(from) {
    const e = extent(); const f = from?.isVector3 ? from : new THREE.Vector3(-25, 2.2, -18);
    if (!e) return { pos: f.clone().add(new THREE.Vector3(0, 4, 0)), look: new THREE.Vector3(L.x0, 0, L.z0) };
    if (CHART_PITCH) return chartShot(e.x1);
    // (integrate) framed on the rows, not from the hill top itself: from the hill the lanes were thin lines 60 m off behind the
    // school. The camera stands back and up on the far side of the pebble, so the pebble, the stubs and the long rows running
    // off up the valley all read in one picture (about 17 degrees down).
    const zm = (e.z0 + e.z1) / 2, len = e.x1 - e.x0;
    const pos = new THREE.Vector3(e.x0 - 12, 0, zm - 20); pos.y = Math.max(heightAt(pos.x, pos.z), 0) + 14;
    const lx = e.x0 + Math.min(len, 90) * .4; const look = new THREE.Vector3(lx, heightAt(lx, zm), zm);
    return { pos, look };
  }
  // the pebble's ring pulses
  function pulse(now) { if (pebble) { const k = 1 + .1 * Math.sin(now / 220); pebble.ring.scale.set(k, k, 1); pebble.ring.material.emissiveIntensity = 1.1 + .5 * Math.sin(now / 220);
    if (pebble.glint) { const g = .09 + .05 * Math.abs(Math.sin(now / 300)); pebble.glint.scale.setScalar(g); pebble.glint.material.rotation = now / 900; } }
    if (group.visible) scalePosts(); }
  const longRoad = {
    group, lay, clear, has: id => rows.has(id), extent, lookoutShot,
    restore(ids = []) { batching = true; batchX1 = -Infinity; try { for (const id of ids || []) if (id) lay(id, { instant: true }); } finally { batching = false; } if (batchX1 > -Infinity) clearStrip(batchX1); },
    setVisible(on) { group.visible = !!on; },
    rowLength: id => { const r = rows.get(id); const boss = bosses.find(b => b.id === id); return (r ? r.n : bagsFor(id, boss)) * L.spacing; },
    update: (dt, now = performance.now()) => pulse(now),
  };
  U.longRoad = longRoad;
  { const tick = () => { pulse(performance.now()); requestAnimationFrame(tick); }; requestAnimationFrame(tick); }   // the ring pulses wherever it is seen (the lookout too)

  // ---------- the walk ----------
  let phase = null, t = 0, pt = 0, row = null, lz = 0, xs = 0, xe = 0, prevId = null, ratio = 0, line = '', said = false, firstEver = false;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  function longestOther(id) { let best = null; for (const r of rows.values()) if (r.id !== id && (!best || r.n > best.n)) best = r; return best; }

  U.start = (stop, opts = {}) => {
    U.active = true; U.stop = stop; t = 0; pt = 0; said = false; ctx.sfx?.music?.stop?.(); group.visible = true;
    const id = stop.id; const prev = longestOther(id); prevId = prev?.id || null;
    firstEver = !pebble;
    row = lay(id, { instant: true });   // laid now; the pop below re-runs it from nothing
    row.popping = true; row.popStart = Infinity; row.shown = 0; for (let i = 0; i < row.n; i++) row.mesh.setMatrixAt(i, ZERO); row.mesh.instanceMatrix.needsUpdate = true; row.ribbon?.geometry.setDrawRange(0, 0);
    for (const r of rows.values()) tint(r, r === row);
    ratio = prev ? row.n / prev.n : 0;
    line = ratioLine(nameFor(id, stop.boss), prev ? nameFor(prev.id) : null, ratio);
    lz = row.z; xs = L.x0 - (firstEver ? 2.3 : 1); xe = row.x1 + .6;   // the first time she waits behind the family, out of the pebble's shot
    player.visible = true; player.position.set(xs, heightAt(xs, lz + .3), lz + .3); player.rotation.set(0, Math.PI / 2, 0);
    hud({ money: `${nameFor(id, stop.boss)}'s row`, sets: '', note: '' });
    if (firstEver) {
      phase = 'pebble';
      const PEB = 'This is one gerbil family\'s whole life of work. It\'s the tiny pebble in the ring.';
      play?.('lr3_pebble', PEB); ctx.caption?.(PEB, '', PEBBLE_S * 1000);
      camPos.set(pebble.x + .15, pebble.y + .8, pebble.z + 1.3); camLook.set(pebble.x - .12, pebble.y + .03, pebble.z + .12);   // close: into the ring, the family and her box around it
    } else { phase = 'pop'; row.popStart = performance.now(); setPopCam(true); }
    camera.position.copy(camPos); camera.lookAt(camLook);
  };
  function setPopCam(snap) { camPos.set(L.x0 - 5.5, heightAt(L.x0, lz) + 2.6, lz + 3.6); camLook.set(L.x0 + 6, heightAt(L.x0 + 6, lz) + .3, lz); if (snap) { camera.position.copy(camPos); camera.lookAt(camLook); } }
  function walkCam() { const mx = player.position.x, h = heightAt(mx, lz); camPos.set(mx - 4.5, h + 2.3, lz + 2.8); camLook.set(mx + 5, heightAt(mx + 5, lz) + .3, lz - .7); }
  // a row she walked to the end: frame it whole, from the pebble at the start to the flag
  function wholeRowCam() { const a = (pebble ? pebble.x : L.x0) - 1, b = xe + 1, mid = (a + b) / 2, span = b - a, h = heightAt(mid, lz);
    camPos.set(mid - span * .35, h + 2 + span * .35, lz + 2.4 + span * .3); camLook.set(mid, h + .2, lz - .2); }
  function sayLine() {
    if (said) return; said = true; phase = 'say'; pt = 0;
    ctx.caption?.(line, '', (SAY_S + 2) * 1000);
    if (ctx.narrate) ctx.narrate(line); else play?.(`lr3_row_${U.stop.id}`, line);
    hud({ money: `${nameFor(U.stop.id, U.stop.boss)}'s row`, sets: '', note: '' });
  }

  U.update = (dt, now) => {
    if (!U.active || !phase) return; t += dt; pt += dt; pulse(now);
    const k = 1 - Math.exp(-dt * 4);
    if (phase === 'pebble') { if (pt >= PEBBLE_S) { phase = 'pop'; pt = 0; row.popStart = performance.now(); setPopCam(false); } }
    else if (phase === 'pop') { if (pt >= POP_S + .2) { finishPop(row); phase = 'walk'; pt = 0; hud({ money: `${nameFor(U.stop.id, U.stop.boss)}'s row`, sets: '', note: skipWord() }); } }
    else if (phase === 'walk') {
      const x = Math.min(xe, player.position.x + WALK_MPS * dt); player.position.x = x; player.position.y = heightAt(x, lz + .3) + Math.abs(Math.sin(now / 90)) * .02;
      walkCam();
      if (x >= xe) { phase = 'atEnd'; pt = 0; player.position.y = heightAt(x, lz + .3); wholeRowCam(); }
      else if (pt >= WALK_CAP_S) { startClimb(); player.position.y = heightAt(x, lz + .3); }
    }
    else if (phase === 'atEnd') { if (pt >= END_HOLD_S + 1) sayLine(); }
    else if (phase === 'climb') {   // (verify) up and out to the chart shot: every row laid so far side-on, the new end and the old ends in one frame
      const u = smooth01(pt / climb.T), lift = Math.sin(u * Math.PI) * climb.arc;
      camPos.lerpVectors(climb.p0, climb.p1, u); camPos.y += lift; camLook.lerpVectors(climb.l0, climb.l1, u);
      camera.position.copy(camPos); camera.lookAt(camLook);
      if (pt >= climb.T) { phase = 'hold'; pt = 0; }
    }
    else if (phase === 'hold') { if (pt >= HOLD_S) sayLine(); }
    else if (phase === 'say') { if (pt >= SAY_S) { U.end(); return; } }
    if (phase !== 'climb' && phase !== 'hold' && phase !== 'say') { camera.position.lerp(camPos, k); _look.copy(camLook); camera.lookAt(_look); }
    else if (phase !== 'climb') { camera.position.copy(camPos); camera.lookAt(camLook); }
  };
  const climb = { p0: new THREE.Vector3(), p1: new THREE.Vector3(), l0: new THREE.Vector3(), l1: new THREE.Vector3(), T: 3, arc: 0 };
  const smooth01 = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  function maxRowX() { let m = L.x0; for (const r of rows.values()) m = Math.max(m, r.x1 + L.spacing); return m; }
  // the climb's length grows with the row (the felt length: a longer row, a longer climb), 2.5 to 8 s
  function startClimb() { phase = 'climb'; pt = 0; const sh = chartShot(maxRowX()); climb.p0.copy(camera.position); climb.l0.copy(camLook); climb.p1.copy(sh.pos); climb.l1.copy(sh.look);
    const len = row.x1 - L.x0; climb.T = Math.min(8, Math.max(2.5, 2.5 + len / 160)); climb.arc = Math.min(40, climb.p0.distanceTo(climb.p1) * .12); }
  // hold A: the end state at once (the row laid, Molly at her stop, the camera where it would land, the caption up)
  U.skip = () => {
    if (!U.active || !phase || said || t < .8) return;
    finishPop(row);
    const walkEnd = Math.min(xe, xs + WALK_MPS * WALK_CAP_S); player.position.x = walkEnd; player.position.y = heightAt(walkEnd, lz + .3);
    if (walkEnd >= xe) wholeRowCam(); else walkCam();
    if (walkEnd < xe) { const sh = chartShot(maxRowX()); camPos.copy(sh.pos); camLook.copy(sh.look); }   // where the climb lands
    camera.position.copy(camPos); camera.lookAt(camLook);
    sayLine();
  };
  U.end = () => { if (!U.active) return; U.active = false; phase = null; if (row) { finishPop(row); tint(row, false); } ctx.onEnd?.(U.stop); };
  U.abort = () => { if (!U.active) return; U.active = false; phase = null; if (row) { finishPop(row); tint(row, false); } };
  return U;
}
