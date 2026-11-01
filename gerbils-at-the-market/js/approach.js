// approach.js — beats 1 and 2 of a level (docs/ADVENTURE.md): the road in and the gate.
//
//   const ap = createApproach({ scene, player, gerbilFrom, spawnBurst, textSprite, makeBoss, card, closeCard, toast, play, sfx, say, state, save });
//   ap.start(stop, { onGate, onOpen });    // the player stands at stop.x - 60; the road runs +x to the gate at stop.x - 14
//   ap.update(dt, now); ap.act();          // act = the one button: free a friend in reach (true) or nothing (false)
//   ap.active, ap.phase ('road' | 'gate' | 'opening' | 'open' | 'done'), ap.dispose()
//
// Beat 1, the road in (x from stop.x-60 to stop.x-14): the road dressed in the giant's style, a few obstacles to walk
// around (never the whole road: they push the player aside), three trapped townsfolk freed with act() who then follow
// in a line, one secret off the road (state.eggs['approach-<id>']), a sign at the start.
// Beat 2, the gate (x = stop.x-14): his door across the road, him in front of it bragging. Crossing x >= gate - 4.8 at any z
// with every friend free: onGate(), he cheers, the trick card (tricks.js). With a friend still trapped she is pushed back,
// he says "Free your friends first!" and a trail points to the nearest cage. Right → dizzy, the door opens over 1.2 s,
// onOpen(), he walks through to his pile. Wrong → the narrator says why, then the right button lights up.
// Edges: |z| <= 6 and x >= stop.x - 64; near the gate z eases toward the middle. Friends are freed by touch (1 m) or act().
// Everything lives in one group; dispose() removes it. No per-frame allocs.
import * as THREE from 'three';
import { roundedBox, MAT, PALETTE, makeSign, makeBar, T, animateGerbil, shadows } from './props.js';
import { createTrail } from './trail.js';
import { openTrick } from './tricks.js';
import * as Props from './props.js';   // round 3: P.appIconCanvas (made-up icons) read with ?. and a palette fallback

const PI = Math.PI, clamp = THREE.MathUtils.clamp;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _Y = new THREE.Vector3(0, 1, 0);
const FONT = 'Fredoka, "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';
const START = -60, GATE = -14, PILE = -9;     // x offsets from stop.x
const REACH = 2.0, TOUCH = 1.3, OPEN_S = 1.2;   // F: was 1.6 / 1.0, scaled for the 1.5x player
const GATE_LINE = 4.8;        // crossing gateX - 4.8 at any z opens the card (when every friend is free)
const ROAD_HALF = 6, BACK = -64; // the road's edges: |z| <= 6, x >= stop.x - 64
const NAG_S = 8;              // "Free your friends first!" at most every 8 s

// ---------- the levels (eight, 10/31): friends (name, role, trap, [dx, z]), the secret, the brag, the sign ----------
const LEVELS = {
  trump: { place: 'the Golden Tower', brag: 'Nobody gets through my golden door. Nobody!',
    friends: [{ name: 'Ms. Pip', role: 'the teacher', trap: 'cage', at: [-48, 1.3], color: 0xe9d6ad }, { name: 'Mr. Nib', role: 'the builder', trap: 'pen', at: [-36, -1.35], color: 0xb67a46 }, { name: 'Dot', role: 'a kid', trap: 'box', at: [-26, 1.15], color: 0xf0d2a0, scale: .66 }],
    secret: { title: 'a gold crown', text: 'Gold paint on cardboard. It weighs nothing.', at: [-40, 5.6] } /* behind the second statue's plinth */ },
  bezos: { place: 'the Warehouse', brag: 'Everything behind this door is mine. Smile!',
    friends: [{ name: 'Wrench', role: 'the mechanic', trap: 'box', at: [-47, -1.3], color: 0x8f6a4a }, { name: 'Granny Thimble', role: 'the baker', trap: 'cage', at: [-37, 1.3], color: 0xd9c3a6 }, { name: 'Bo', role: 'a kid', trap: 'pen', at: [-25, -1.15], color: 0xc08a52, scale: .66 }],
    secret: { title: 'a lost package', text: 'Addressed to Gerbil Valley. It never got there.', at: [-38, 5.6] } /* behind a box stack */ },
  musk: { place: 'the Rocket Yard', brag: 'This door only opens for geniuses. Like me.',
    friends: [{ name: 'Dr. Quill', role: 'the doctor', trap: 'cage', at: [-49, 1.3], color: 0xf3e6cf }, { name: 'Fern', role: 'the farmer', trap: 'pen', at: [-35, -1.3], color: 0xa8743f }, { name: 'Zip', role: 'a kid', trap: 'box', at: [-24, 1.2], color: 0xd9b07a, scale: .66 }],
    secret: { title: 'a toy rocket', text: 'Red, wooden, no engine. It flies if you hold it up.', at: [-29, 5.9] } /* behind the nose cone */ },
  ellison: { place: 'the Data Harbor', brag: 'My computers remember everything. Except how to share.',
    friends: [{ name: 'Mr. Tumble', role: 'the mail carrier', trap: 'cage', at: [-48, 1.3], color: 0xd9c3a6 }, { name: 'Ms. Willow', role: 'the librarian', trap: 'pen', at: [-36, -1.3], color: 0xb67a46 }, { name: 'Kit', role: 'a kid', trap: 'box', at: [-25, 1.15], color: 0xf0d2a0, scale: .66 }],
    secret: { title: 'a toy sailboat', text: 'A paper sail and a cork. It floats better than his yacht.', at: [-33, 5.7] } /* behind a server box */ },
  // the four from the 10/31 data round: each road is his story's place (boss.story.place in the data)
  bloomberg: { place: 'the Campaign Stage', brag: 'Every sign on this road has my name on it.',
    friends: [{ name: 'Mr. Fig', role: 'the firefighter', trap: 'cage', at: [-48, 1.3], color: 0xc98f4e }, { name: 'Ms. Rosie', role: 'the vet', trap: 'pen', at: [-36, -1.3], color: 0xf0dcc0 }, { name: 'Lu', role: 'a kid', trap: 'box', at: [-25, 1.15], color: 0xd9b07a, scale: .66 }],
    secret: { title: 'a seashell', text: 'From American Samoa, islands in the Pacific Ocean: the one place he won.', at: [-44, -5.6] } /* out past the bunting, under the balloons */ },
  walton: { place: 'the Superstore', brag: 'My family owns this whole store.',
    friends: [{ name: 'Ms. Juniper', role: 'the cashier', trap: 'cage', at: [-48, 1.3], color: 0xe8c9a0 }, { name: 'Mr. Barley', role: 'the stocker', trap: 'pen', at: [-36, -1.3], color: 0x8c6a4e }, { name: 'Tad', role: 'a kid', trap: 'box', at: [-25, 1.15], color: 0xf2e2d2, scale: .66 }],
    secret: { title: 'a tiny football', text: 'His family bought a whole football team, the Broncos.', at: [-39, 5.7] } /* behind a shelf */ },
  zuckerberg: { place: 'the Giant Phone', brag: 'Got a fun new app? I will buy it.',
    friends: [{ name: 'Ms. Poppy', role: 'the painter', trap: 'cage', at: [-48, 1.3], color: 0xdca96a }, { name: 'Mr. Bolt', role: 'the electrician', trap: 'pen', at: [-36, -1.3], color: 0x6e5440 }, { name: 'Sky', role: 'a kid', trap: 'box', at: [-25, 1.15], color: 0xf0d2a0, scale: .66 }],
    secret: { title: 'a cup phone', text: 'Two paper cups and a string. It works, and nobody can buy it.', at: [-34, 5.7] } /* behind an icon stack */ },
  page: { place: 'the Search Tower', brag: 'Every road goes to my door.',
    friends: [{ name: 'Mrs. Sage', role: 'the crossing guard', trap: 'cage', at: [-48, 1.3], color: 0xb8b0a8 }, { name: 'Mr. Hops', role: 'the gardener', trap: 'pen', at: [-36, -1.3], color: 0xa87a4a }, { name: 'Nell', role: 'a kid', trap: 'box', at: [-25, 1.15], color: 0xe9d6ad, scale: .66 }],
    secret: { title: 'a paper map', text: 'It shows every road in the valley, not just the one to his door.', at: [-33, 5.7] } /* behind a magnifying glass */ },
};
// a boss the data adds before he has a level of his own: his name on the sign, the Data Harbor's look, three more townsfolk
const levelFor = stop => LEVELS[stop.id] || { place: `${stop.boss.display_name || stop.boss.name}'s place`, brag: 'Everything behind this door is mine.', style: 'ellison',
  friends: [{ name: 'Mrs. Hazel', role: 'the nurse', trap: 'cage', at: [-48, 1.3], color: 0xe9d6ad }, { name: 'Mr. Oak', role: 'the bus driver', trap: 'pen', at: [-36, -1.3], color: 0x8f6a4a }, { name: 'Pip', role: 'a kid', trap: 'box', at: [-25, 1.15], color: 0xd9b07a, scale: .66 }],
  secret: { title: 'a toy sailboat', text: 'A paper sail and a cork. Somebody lost it on the way to the market.', at: [-33, 5.7] } };
const STYLES = ['trump', 'bezos', 'musk', 'ellison', 'bloomberg', 'walton', 'zuckerberg', 'page'];   // the looks this file can dress a road, a trap and a gate in

// ---------- small builders ----------
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const tex = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const at = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); return m; };
function triPrism(w, h, d, mat) { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(w, 0); s.lineTo(0, h); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2); return new THREE.Mesh(g, mat); }

export function createApproach(ctx) {
  const { scene, player, gerbilFrom, spawnBurst, textSprite, makeBoss, card, closeCard, toast, play, sfx, say, state, save } = ctx;
  const A = { active: false, phase: 'idle', stop: null };
  let backArrow = null, backT = 0;   // the "go back" arrow at her feet when a friend is still trapped
  A.sentBack = () => backT > 0 || cageShow > 0 && friends.some(f => f.state === 'trapped');
  function makeBackArrow() {   // a flat orange arrow on the road, pointing down the road (-x), ink-outlined
    const c = document.createElement('canvas'); c.width = 256; c.height = 160; const g = c.getContext('2d'); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(16, 80); g.lineTo(104, 12); g.lineTo(104, 48); g.lineTo(240, 48); g.lineTo(240, 112); g.lineTo(104, 112); g.lineTo(104, 148); g.closePath();
    g.fillStyle = '#ff7a3a'; g.fill(); g.lineWidth = 12; g.strokeStyle = '#3b2516'; g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.PlaneGeometry(1.15, .72), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    m.rotation.order = 'YXZ'; m.rotation.set(-PI / 2 + .95, 0, 0); m.renderOrder = 5; own.push(m); return m;
  }
  let group = null, L = null, X0 = 0, gateX = 0, boss = null, bubble = null, waitBubble = null, waitT = 0, nagAt = -1e9, cageTrail = null, cageT = 0, cageShow = 0, gate = null, friends = [], cols = [], anims = [], hint = null, secret = null, onGate = null, onOpen = null, openT = 0, bossAnim = '', gateDone = false, leaveT = 0;
  const own = [];                                                // meshes built here: their geometry is disposed; model clones keep theirs
  const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; own.push(m); return m; };
  const box = (w, h, d, mat, r = 0) => mesh(r ? roundedBox(w, h, d, r, 3) : new THREE.BoxGeometry(w, h, d), mat);
  const col = (x, z, r) => { const c = { x, z, r }; cols.push(c); return c; };

  // ---------- beat 1 ----------
  function dressTrump() {
    const gold = MAT.gold(), red = MAT.std(0xb3202a, { roughness: .95 }), stone = MAT.std(PALETTE.stone);
    const carpet = mesh(new THREE.PlaneGeometry(gateX - (X0 + START + 2), 1.3), red); carpet.rotation.x = -PI / 2; carpet.position.set((X0 + START + 2 + gateX) / 2, .035, 0); carpet.castShadow = false; carpet.renderOrder = 2; group.add(carpet);
    // gold fence posts with a red rope, both sides
    const n = Math.floor((gateX - 4 - (X0 + START + 2)) / 3) + 1; const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(.06, .07, 1.0, 10), gold, n * 2), balls = new THREE.InstancedMesh(new THREE.SphereGeometry(.11, 12, 8), gold, n * 2), rope = new THREE.InstancedMesh(new THREE.CylinderGeometry(.03, .03, 3, 8), red, (n - 1) * 2);
    let i = 0, k = 0; for (const s of [-1, 1]) for (let j = 0; j < n; j++) { const x = X0 + START + 2 + j * 3; _m.compose(_v.set(x, .5, s * 2.6), _q.identity(), _s.set(1, 1, 1)); posts.setMatrixAt(i, _m); _m.setPosition(x, 1.08, s * 2.6); balls.setMatrixAt(i++, _m);
      if (j < n - 1) { _m.compose(_v.set(x + 1.5, .88, s * 2.6), _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), PI / 2), _s.set(1, 1, 1)); rope.setMatrixAt(k++, _m); } }
    posts.castShadow = balls.castShadow = true; own.push(posts, balls, rope); group.add(posts, balls, rope);
    // hollow gold statues of himself on plinths; the last one has tipped over
    [[-50, -3.5, 0], [-40, 3.5, 0], [-30, -3.5, 0], [-21, 3.5, 1]].forEach(([dx, z, fallen]) => {
      const plinth = box(1.7, .9, 1.7, stone, .03); plinth.position.set(X0 + dx, .45, z); group.add(plinth);
      const st = gerbilFrom({ color: 0xf6cc4e, scale: 3.4 }); st.traverse(o => { if (o.isMesh) { o.material = gold; o.castShadow = true; } }); st.userData.statue = true;
      if (fallen) { st.position.set(X0 + dx + 1.3, .3, z - .3); st.rotation.set(0, -PI / 2, PI / 2 - .1); } else { st.position.set(X0 + dx, .9, z); st.rotation.y = z > 0 ? PI : 0; }
      group.add(st); col(X0 + dx, z, 1.1);
    });
    // velvet ropes across half the road, a gold crate
    // (verify) the ropes and the crate stand beside the carpet, not across it: holding Up along the trail arrows (z = 0) parked Molly
    // against a rope for good. Each rope's near end is .9 m off the middle; the carpet is 1.3 m wide.
    for (const [dx, z] of [[-52, 1.9], [-42, -1.9]]) { const bar = makeBar(2.2, .62); bar.position.set(X0 + dx, 0, z); group.add(bar); for (const dz of [-.8, 0, .8]) col(X0 + dx, z + dz, .55); }
    const crate = box(1.0, 1.0, 1.0, gold, .04); crate.position.set(X0 - 32, .5, 2.6); group.add(crate); col(X0 - 32, 2.6, .85);
  }
  function cardboardMat() { const [c, g] = canvas(256, 256); g.fillStyle = '#c9a06a'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${(Math.random() * .08).toFixed(3)})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    g.fillStyle = '#b08350'; g.fillRect(118, 0, 20, 256); g.strokeStyle = '#1a1a1a'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round'; for (const ax of [78, 178]) { g.beginPath(); g.moveTo(ax, 210); g.lineTo(ax, 150); g.moveTo(ax - 18, 168); g.lineTo(ax, 150); g.lineTo(ax + 18, 168); g.stroke(); }   // (integrate, C9) a plain 'this way up' mark, not the smile-arrow
    return new THREE.MeshStandardMaterial({ map: tex(c), roughness: .9 }); }
  function dressBezos() {
    const cb = cardboardMat(), belt = MAT.std(0x2a2a2e, { roughness: .7 }), steel = MAT.chrome({ color: 0x8a9096 }), yellow = MAT.paint(0xf2c230);
    // stacks of boxes beside the road and on it (the on-road ones half-block)
    const stack = (x, z, sizes, block) => { let y = 0; sizes.forEach((s, i) => { const b = box(s, s, s, cb, .015); b.position.set(x + (i % 2) * .08, y + s / 2, z + (i % 2 ? -.06 : .06)); b.rotation.y = (i * .4) % .7; group.add(b); y += s; }); if (block) col(x, z, sizes[0] * .5 + .35); };
    for (const [dx, z] of [[-56, -3.3], [-53, 3.4], [-45, -3.6], [-38, 3.7], [-33, -3.3], [-27, -3.5], [-20, -3.4]]) stack(X0 + dx, z, [1.1, .8, .6].slice(0, 2 + ((dx + 100) % 2)), false);
    stack(X0 - 50, .95, [.9, .6], true); stack(X0 - 40, -1.0, [1.0, .7, .5], true); stack(X0 - 30, .8, [1.2], true);
    // the conveyor beside the road: belt, legs, rails, boxes gliding +x
    const x1 = X0 + START + 4, x2 = gateX - 4, len = x2 - x1, cz = 3.0; const b = box(len, .12, 1.0, belt); b.position.set((x1 + x2) / 2, .55, cz); group.add(b);
    for (const s of [-1, 1]) { const rail = box(len, .06, .06, yellow); rail.position.set((x1 + x2) / 2, .66, cz + s * .5); group.add(rail); }
    const nl = Math.floor(len / 4) + 1; const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(.1, .5, .9), steel, nl); for (let i = 0; i < nl; i++) { _m.compose(_v.set(x1 + i * 4, .25, cz), _q.identity(), _s.set(1, 1, 1)); legs.setMatrixAt(i, _m); } legs.castShadow = true; own.push(legs); group.add(legs);
    const nr = Math.floor(len / .6); const rollers = new THREE.InstancedMesh(new THREE.CylinderGeometry(.05, .05, 1.0, 8), steel, nr); for (let i = 0; i < nr; i++) { _m.compose(_v.set(x1 + .3 + i * .6, .62, cz), _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), PI / 2), _s.set(1, 1, 1)); rollers.setMatrixAt(i, _m); } own.push(rollers); group.add(rollers);
    for (let i = 0; i < 9; i++) { const s = .45 + (i % 3) * .12; const bx = box(s, s, s, cb, .01); bx.position.set(x1 + i * len / 9, .61 + s / 2, cz); group.add(bx); anims.push({ kind: 'glide', m: bx, x1, x2, v: 1.4 }); }
    // the drone, circling with a parcel
    const dr = new THREE.Group(); const body = box(.5, .12, .5, MAT.paint(0x44484e)); dr.add(body); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const arm = box(.3, .03, .05, steel); arm.position.set(sx * .3, .02, sz * .3); arm.rotation.y = sx * sz * PI / 4; dr.add(arm); const rot = box(.36, .012, .07, MAT.std(0x222222)); rot.position.set(sx * .4, .07, sz * .4); dr.add(rot); anims.push({ kind: 'spin', m: rot }); }
    const parcel = box(.3, .3, .3, cb); parcel.position.y = -.25; dr.add(parcel); group.add(dr); anims.push({ kind: 'orbit', m: dr, cx: X0 - 38, cz: 0, cy: 4.2, r: 7, w: .45 });
  }
  function dressMusk() {
    const white = MAT.paint(0xf2f2f2, { roughness: .35 }), dark = MAT.std(0x2a2b30), grey = MAT.chrome({ color: 0xc3c8cd, roughness: .3 }), redM = MAT.paint(0xd7262c), yellow = MAT.paint(0xf2c230);
    // a rocket stage lying on cradles, its nose cone and fins waiting beside the road
    const stage = mesh(new THREE.CylinderGeometry(.9, .9, 7, 20), white); stage.rotation.z = PI / 2; stage.position.set(X0 - 44, 1.15, -3.9); group.add(stage);
    const band = mesh(new THREE.CylinderGeometry(.92, .92, .6, 20), dark); band.rotation.z = PI / 2; band.position.set(X0 - 42, 1.15, -3.9); group.add(band);
    for (const dx of [-46.5, -41.5]) { const cr = box(.4, .5, 2.2, yellow); cr.position.set(X0 + dx, .25, -3.9); group.add(cr); }
    const nose = mesh(new THREE.ConeGeometry(.9, 2.4, 20), white); nose.rotation.z = -PI / 2; nose.position.set(X0 - 29, .9, 3.9); group.add(nose);
    for (const [dx, z, ry] of [[-34, 3.8, .3], [-24, -3.7, -.4], [-52, 3.6, .1]]) { const fin = triPrism(1.6, 1.8, .12, redM); fin.position.set(X0 + dx, 0, z); fin.rotation.y = ry; fin.castShadow = true; group.add(fin); }
    // launch-pad lights on poles, blinking red and white
    for (let i = 0; i < 8; i++) { const x = X0 + START + 4 + i * 5.5, z = (i % 2 ? 1 : -1) * 2.7; const pole = mesh(new THREE.CylinderGeometry(.04, .05, 2.2, 8), dark); pole.position.set(x, 1.1, z); group.add(pole);
      const lampM = new THREE.MeshStandardMaterial({ color: i % 2 ? 0xffffff : 0xff3030, emissive: i % 2 ? 0xffffff : 0xff2020, emissiveIntensity: 1 }); const lamp = mesh(new THREE.SphereGeometry(.14, 10, 8), lampM); lamp.position.set(x, 2.3, z); group.add(lamp); anims.push({ kind: 'blink', m: lamp, ph: i * .7 }); }
    // the Cybertruck-ish thing: an angular grey wedge on wheels, parked half across the road
    const prof = new THREE.Shape(); [[-1.9, .35], [1.9, .35], [1.9, .75], [.9, .95], [-.3, 1.45], [-1.6, 1.0], [-1.9, .9]].forEach(([x, y], i) => i ? prof.lineTo(x, y) : prof.moveTo(x, y)); prof.closePath();
    const truck = new THREE.Group(); const bodyG = new THREE.ExtrudeGeometry(prof, { depth: 1.5, bevelEnabled: false }); bodyG.translate(0, 0, -.75); truck.add(mesh(bodyG, grey));
    const glass = box(1.1, .02, 1.3, MAT.glass({ color: 0x1b2430 })); glass.position.set(-.5, 1.22, 0); glass.rotation.z = .4; truck.add(glass);
    for (const sx of [-1.2, 1.1]) for (const sz of [-1, 1]) { const wh = mesh(new THREE.CylinderGeometry(.36, .36, .3, 16), MAT.rubber()); wh.rotation.x = PI / 2; wh.position.set(sx, .36, sz * .8); truck.add(wh); }
    truck.position.set(X0 - 44, 0, 1.15); truck.rotation.y = -.25; group.add(truck); col(X0 - 45, 1.0, 1.0); col(X0 - 43, .9, 1.0);
    // a small rocket standing on its pad near the gate
    const pad = mesh(new THREE.CylinderGeometry(1.4, 1.5, .25, 20), MAT.std(0x6a6c72)); pad.position.set(X0 - 19, .12, 5.4); group.add(pad);
    const rk = mesh(new THREE.CylinderGeometry(.42, .42, 3.6, 16), white); rk.position.set(X0 - 19, 2.05, 5.4); group.add(rk); const rn = mesh(new THREE.ConeGeometry(.42, 1.1, 16), white); rn.position.set(X0 - 19, 4.4, 5.4); group.add(rn);
    for (let i = 0; i < 3; i++) { const fin = triPrism(.6, .9, .08, redM); fin.position.set(X0 - 19, .25, 5.4); fin.rotation.y = i * PI * 2 / 3; fin.translateX(.4); group.add(fin); }
    for (let i = 0; i < 3; i++) { const leg = mesh(new THREE.CylinderGeometry(.05, .05, .9, 8), dark); const a = i * PI * 2 / 3 + .5; leg.position.set(X0 - 19 + Math.cos(a) * .7, .6, 5.4 + Math.sin(a) * .7); leg.rotation.z = Math.cos(a) * .35; leg.rotation.x = -Math.sin(a) * .35; group.add(leg); }
    // a tire stack and two fuel barrels on the other side of the road
    for (let i = 0; i < 3; i++) { const t = mesh(new THREE.TorusGeometry(.42, .17, 10, 20), MAT.rubber()); t.rotation.x = PI / 2; t.position.set(X0 - 54, .17 + i * .34, -1.0); group.add(t); } col(X0 - 54, -1.0, .85);
    for (const z of [-.6, -1.3]) { const br = mesh(new THREE.CylinderGeometry(.35, .35, .9, 14), redM); br.position.set(X0 - 32, .45, z); group.add(br); } col(X0 - 32, -.95, .9);
  }

  function dressEllison() {
    const grey = MAT.std(0x5a5f66, { roughness: .5, metalness: .4 }), dark = MAT.std(0x1d1f24, { roughness: .8 }), waterM = MAT.std(0x2f6f9a, { roughness: .15, metalness: .3 }), wood = MAT.std(0x9a7550), navy = MAT.paint(0x1d2b4a);
    // server boxes beside the road (and three half across it), each with a column of blinking lights on the road side
    const server = (x, z, block) => { const b = box(1.0, 1.9, .9, grey, .03); b.position.set(x, .95, z); group.add(b); const face = z > 0 ? -1 : 1; const front = box(.9, 1.7, .02, dark); front.position.set(x, .95, z + face * .46); group.add(front);
      for (let i = 0; i < 4; i++) { const m = new THREE.MeshStandardMaterial({ color: 0x40ff60, emissive: i % 2 ? 0x2060ff : 0x20ff40, emissiveIntensity: 1 }); const l = mesh(new THREE.SphereGeometry(.05, 8, 6), m); l.position.set(x + .3, .5 + i * .35, z + face * .48); group.add(l); anims.push({ kind: 'blink', m: l, ph: x * .7 + i * 1.3 }); }
      if (block) col(x, z, .8); };
    for (const [dx, z] of [[-56, 3.4], [-50, -3.4], [-44, 3.5], [-38, -3.6], [-33, 4.6], [-28, 3.4], [-21, -3.4]]) server(X0 + dx, z, false);
    server(X0 - 52, -1.0, true); server(X0 - 42, 1.0, true); server(X0 - 30, -1.05, true);
    // the harbor on the left: water, a stone edge, mooring posts with a rope, a little sailboat bobbing
    const x1 = X0 + START + 2, x2 = gateX - 3, len = x2 - x1; const w = mesh(new THREE.PlaneGeometry(len, 8), waterM); w.rotation.x = -PI / 2; w.position.set((x1 + x2) / 2, .02, -9); w.castShadow = false; group.add(w);
    const edge = box(len, .3, .4, MAT.std(0x9b9a95)); edge.position.set((x1 + x2) / 2, .15, -5); group.add(edge);
    for (let x = x1 + 2; x < x2; x += 6) { const p = mesh(new THREE.CylinderGeometry(.12, .14, .9, 10), wood); p.position.set(x, .45, -5.2); group.add(p); }
    const boat = new THREE.Group(); const hull = box(.9, .4, 3, navy, .1); hull.position.y = .2; boat.add(hull); const mast = mesh(new THREE.CylinderGeometry(.04, .05, 3.4, 8), MAT.std(0x888888)); mast.position.y = 1.9; boat.add(mast);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute([0, .5, .1, 0, 3.5, .1, 0, .5, 1.4], 3)); sg.computeVertexNormals(); const sail = mesh(sg, new THREE.MeshStandardMaterial({ color: 0xf7f6f1, side: THREE.DoubleSide })); boat.add(sail);
    boat.position.set(X0 - 40, 0, -8.5); boat.rotation.y = PI / 2; group.add(boat); anims.push({ kind: 'bob', m: boat });
  }

  // ---------- the four newer roads (10/31): each from his story (data: boss.story.place) ----------
  // a flat picture on a plane, facing -x (the camera looks up the road): draw(g, w, h) on a w x h canvas, shown W m wide
  function picture(draw, cw, ch, W, o = {}) { const [c, g] = canvas(cw, ch); draw(g, cw, ch); const m = mesh(new THREE.PlaneGeometry(W, W * ch / cw), new THREE.MeshStandardMaterial({ map: tex(c), roughness: .7, transparent: !!o.alpha, alphaTest: o.alpha ? .1 : 0, side: o.double ? THREE.DoubleSide : THREE.FrontSide, emissive: o.glow ? 0xffffff : 0x000000, emissiveIntensity: o.glow || 0 })); if (o.glow) m.material.emissiveMap = m.material.map; m.rotation.y = -PI / 2; m.castShadow = false; return m; }
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  // the app icons (round 3, C9): made-up only, from P.appIconCanvas(kind) when art-props provides it, else a palette tile with a
  // simple drawn shape. No real app's camera square, chat bubble, heart or play button, no app names.
  const APPS = (Props.APP_ICONS?.length ? Props.APP_ICONS : null) || ['seed', 'paw', 'wheel', 'cloud', 'star'];
  const ICON_PAL = { seed: '#8cc067', paw: '#d7262c', wheel: '#3a7bd5', cloud: '#a8743f', star: '#f2c230' };
  function fallbackGlyph(g, kind, cx, cy, s) { g.save(); g.translate(cx, cy); g.scale(s / 100, s / 100); g.fillStyle = g.strokeStyle = '#fbf0d4'; g.lineWidth = 9; g.lineCap = g.lineJoin = 'round';
    if (kind === 'paw') { g.beginPath(); g.ellipse(0, 14, 24, 20, 0, 0, PI * 2); g.fill(); for (const [x, y] of [[-28, -14], [-10, -30], [10, -30], [28, -14]]) { g.beginPath(); g.arc(x, y, 9, 0, PI * 2); g.fill(); } }
    else if (kind === 'wheel') { g.beginPath(); g.arc(0, 0, 34, 0, PI * 2); g.stroke(); for (let i = 0; i < 6; i++) { const a = i * PI / 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 34, Math.sin(a) * 34); g.stroke(); } }
    else if (kind === 'cloud') { for (const [x, y, r] of [[-18, 6, 18], [4, -6, 24], [24, 8, 16]]) { g.beginPath(); g.arc(x, y, r, 0, PI * 2); g.fill(); } g.fillRect(-18, 6, 42, 18); }
    else if (kind === 'star') { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -PI / 2 + k * PI / 5, r = k % 2 ? 16 : 38; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); }
    else { g.beginPath(); g.ellipse(0, 4, 18, 30, .5, 0, PI * 2); g.fill(); g.strokeStyle = 'rgba(59,37,22,.45)'; g.lineWidth = 5; g.beginPath(); g.moveTo(-10, 24); g.lineTo(10, -16); g.stroke(); }   // seed
    g.restore(); }
  const iconCanvases = {};
  function iconCanvas(kind) { if (iconCanvases[kind] !== undefined) return iconCanvases[kind]; let c = null; try { c = Props.appIconCanvas?.(kind, 256) || null; } catch (e) { c = null; } return (iconCanvases[kind] = c); }
  function iconTile(g, kind, x, y, s) {
    const c = iconCanvas(kind); if (c) { g.drawImage(c, x, y, s, s); return; }
    g.fillStyle = ICON_PAL[kind] || '#3a7bd5'; rr(g, x, y, s, s, s * .22); g.fill(); g.strokeStyle = '#3b2516'; g.lineWidth = Math.max(2, s * .04); rr(g, x, y, s, s, s * .22); g.stroke(); fallbackGlyph(g, kind, x + s / 2, y + s / 2, s * .9); }
  const iconMats = {}; const iconMat = kind => iconMats[kind] || (iconMats[kind] = (() => { const [c, g] = canvas(256, 256); g.fillStyle = '#fbf0d4'; g.fillRect(0, 0, 256, 256); iconTile(g, kind, 0, 0, 256); return new THREE.MeshStandardMaterial({ map: tex(c), roughness: .35 }); })());
  function dressZuckerberg() {   // the Giant Phone: app icons stacked like building blocks, a phone as tall as a house, hearts floating up
    const dark = MAT.std(0x1b1c22, { roughness: .4, metalness: .3 });
    const icon = (x, z, s, k, ry = 0, y = 0) => { const b = box(s, s, s, iconMat(APPS[k % APPS.length]), s * .2); b.position.set(x, y + s / 2, z); b.rotation.y = ry; group.add(b); return b; };
    let k = 0; for (const [dx, z] of [[-57, -3.4], [-53, 3.5], [-46, -3.7], [-41, 3.4], [-34, 3.8], [-31, -3.5], [-22, -3.6]]) { icon(X0 + dx, z, 1.2, k++, .2 * (k % 3)); if (k % 2) icon(X0 + dx + .1, z + .05, .8, k++, -.3, 1.2); }
    for (const [dx, z] of [[-52, -1.0], [-42, 1.0], [-30, -1.05]]) { icon(X0 + dx, z, 1.1, k++, .35); col(X0 + dx, z, .85); }
    // the phone, as tall as a house, its screen a grid of apps
    const ph = new THREE.Group(); const body = box(.35, 5.2, 2.6, dark, .3); body.position.y = 2.6; ph.add(body);
    const scr = picture((g, w, h) => { g.fillStyle = '#1d2433'; g.fillRect(0, 0, w, h); for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) iconTile(g, APPS[(r * 3 + c) % APPS.length], 36 + c * 150, 100 + r * 150, 112); }, 512, 880, 2.25, { glow: .45 });
    scr.position.set(-.18, 2.65, 0); ph.add(scr); ph.position.set(X0 - 19, 0, 4.9); group.add(ph); col(X0 - 19, 4.1, .7); col(X0 - 19, 5.3, .7);
    // hearts and chat bubbles floating up out of the icons
    const hm = [iconMat('star'), iconMat('cloud')]; for (let i = 0; i < 6; i++) { const s = box(.32, .32, .06, hm[i % 2], .06); const x = X0 - 56 + i * 7.5, z = (i % 2 ? 1 : -1) * 3.5; s.position.set(x, 1.6, z); s.rotation.y = -PI / 2; s.castShadow = false; group.add(s); anims.push({ kind: 'rise', m: s, y0: 1.4, y1: 4.6, v: .25, ph: i * .17 }); }
  }
  function dressPage() {   // the Search Tower: magnifying glasses, video screens, and every arrow pointing at the one door
    const blue = MAT.paint(0x3a7bd5), yellow = MAT.paint(0xf2c230), white = MAT.paint(0xf7f7f5), dark = MAT.std(0x2a2b30);
    const ringMats = [blue, yellow];   // two palette colours (no one's four-colour set)
    const glass = (x, z, s, i, ry) => { const g = new THREE.Group(); const ring = mesh(new THREE.TorusGeometry(.7 * s, .11 * s, 10, 28), ringMats[i % ringMats.length]); ring.position.y = 2.1 * s; g.add(ring);
      const lens = mesh(new THREE.CircleGeometry(.66 * s, 28), MAT.glass({ color: 0xbfe3ff, transparent: true, opacity: .45, side: THREE.DoubleSide })); lens.position.y = 2.1 * s; lens.castShadow = false; g.add(lens);
      const handle = box(.2 * s, 1.4 * s, .2 * s, dark, .05); handle.position.y = .7 * s; g.add(handle); g.position.set(x, 0, z); g.rotation.y = ry; g.rotation.z = .12; group.add(g); };
    [[-55, 3.8, 1.2], [-44, -3.9, 1.0], [-33, 4.0, 1.4], [-23, -4.0, 1.1]].forEach(([dx, z, s], i) => glass(X0 + dx, z, s, i, PI / 2 + (z > 0 ? -.4 : .4)));
    // screens on posts, a gerbil wheel turning on each (no play button)
    for (const [dx, z] of [[-50, 3.6], [-40, -3.5], [-28, 3.6], [-18, -3.6]]) { const post = mesh(new THREE.CylinderGeometry(.06, .07, 1.4, 8), dark); post.position.set(X0 + dx, .7, z); group.add(post); const fr = box(.12, 1.0, 1.6, dark, .03); fr.position.set(X0 + dx, 1.85, z); group.add(fr);
      const sc = picture((g, w, h) => { g.fillStyle = '#1d2433'; g.fillRect(0, 0, w, h); const cx = w / 2, cy = h / 2 - 6, R = 62; g.strokeStyle = '#f2c230'; g.lineWidth = 10; g.beginPath(); g.arc(cx, cy, R, 0, PI * 2); g.stroke(); g.lineWidth = 5; for (let i = 0; i < 8; i++) { const a = i * PI / 4; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke(); }
        g.fillStyle = '#d9b07a'; g.beginPath(); g.ellipse(cx, cy + R - 18, 22, 13, 0, 0, PI * 2); g.fill(); g.beginPath(); g.arc(cx + 20, cy + R - 24, 9, 0, PI * 2); g.fill(); g.fillStyle = '#8cc067'; g.fillRect(0, h - 14, w * .6, 14); }, 320, 200, 1.5, { glow: .35 }); sc.position.set(X0 + dx - .07, 1.85, z); group.add(sc); }
    // arrows on posts, all pointing up the road to his door
    // side-on to the road, each facing the middle: on the far (+z) side the viewer's left is up the road, so that arrow is drawn pointing left
    const arrowT = left => (g, w, h) => { g.fillStyle = '#fff'; rr(g, 4, 4, w - 8, h - 8, 26); g.fill(); g.strokeStyle = '#3a7bd5'; g.lineWidth = 8; rr(g, 4, 4, w - 8, h - 8, 26); g.stroke(); g.save(); if (left) { g.translate(w, 0); g.scale(-1, 1); }
      g.fillStyle = '#3a7bd5'; g.beginPath(); g.moveTo(30, 62); g.lineTo(190, 62); g.lineTo(190, 30); g.lineTo(250, 85); g.lineTo(190, 140); g.lineTo(190, 108); g.lineTo(30, 108); g.closePath(); g.fill(); g.restore();
      g.fillStyle = '#2b2418'; g.font = `700 54px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('this way', left ? 160 : w - 140, h / 2); };
    for (const [dx, z] of [[-58, -2.4], [-47, 2.5], [-38, -2.5], [-27, 2.5], [-20, -2.4]]) { const post = mesh(new THREE.CylinderGeometry(.04, .05, 1.2, 8), MAT.std(0x8b5a2b)); post.position.set(X0 + dx, .6, z); group.add(post); const a = picture(arrowT(z > 0), 512, 170, 1.0); a.position.set(X0 + dx, 1.3, z); a.rotation.y = z > 0 ? PI : 0; group.add(a); }
    // the search bars lying half across the road
    const barT = (g, w, h) => { g.fillStyle = '#fff'; rr(g, 0, 0, w, h, h / 2); g.fill(); g.strokeStyle = '#9aa0a6'; g.lineWidth = 8; g.beginPath(); g.arc(70, h / 2, 26, 0, PI * 2); g.stroke(); g.beginPath(); g.moveTo(90, h / 2 + 20); g.lineTo(112, h / 2 + 42); g.stroke(); };
    for (const [dx, z] of [[-52, -1.0], [-42, 1.0], [-30, -1.05]]) { const b = box(.5, .55, 2.2, white, .2); b.position.set(X0 + dx, .28, z); group.add(b); const f = picture(barT, 768, 128, 2.1); f.position.set(X0 + dx - .26, .3, z); group.add(f); col(X0 + dx, z - .6, .55); col(X0 + dx, z + .6, .55); }
  }
  function dressWalton() {   // the Superstore: shelves stacked to the sky, shopping carts, a checkout belt, the big smiley sign
    const blue = MAT.paint(0x0071ce), steel = MAT.chrome({ color: 0xb8bec4 }), shelfM = MAT.std(0xd8dde2, { roughness: .6, metalness: .2 }), belt = MAT.std(0x2a2a2e, { roughness: .7 });
    const goodsT = (g, w, h) => { g.fillStyle = '#d8dde2'; g.fillRect(0, 0, w, h); const cols = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#457b9d', '#8ecae6', '#ffb703', '#90be6d']; let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let r = 0; r < 4; r++) { let x = 6; while (x < w - 20) { const bw = 26 + rnd() * 34, bh = 50 + rnd() * 40; g.fillStyle = cols[Math.floor(rnd() * cols.length)]; const y = (r + 1) * h / 4 - 10 - bh; if (rnd() < .3) { g.beginPath(); g.ellipse(x + bw / 2, y + bh / 2, bw / 2, bh / 2, 0, 0, PI * 2); g.fill(); } else g.fillRect(x, y, bw, bh); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x + 4, y + 8, bw - 8, 8); x += bw + 5; } g.fillStyle = '#9aa3ab'; g.fillRect(0, (r + 1) * h / 4 - 10, w, 10); } };
    const shelf = (x, z, len) => { const face = z > 0 ? -1 : 1; const back = box(len, 3.2, .1, shelfM); back.position.set(x, 1.6, z - face * .45); group.add(back); for (const s of [-1, 1]) { const side = box(.08, 3.2, 1.0, shelfM); side.position.set(x + s * len / 2, 1.6, z); group.add(side); }
      const f = picture(goodsT, 512, 400, len); f.rotation.y = face > 0 ? 0 : PI; f.position.set(x, 1.6, z - face * .38); group.add(f); };
    for (const [dx, z] of [[-55, 3.9], [-47, -3.9], [-39, 3.9], [-31, -3.9], [-23, 3.9]]) shelf(X0 + dx, z, 4.2);
    const cart = (x, z, ry) => { const g = new THREE.Group(); const wire = new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: .3, metalness: .7, wireframe: true });
      const basket = mesh(new THREE.BoxGeometry(1.1, .55, .7, 6, 3, 4), wire); basket.position.y = .75; basket.castShadow = false; g.add(basket); const bottom = box(1.1, .03, .7, steel); bottom.position.y = .48; g.add(bottom);
      const handle = mesh(new THREE.CylinderGeometry(.03, .03, .8, 8), blue); handle.rotation.x = PI / 2; handle.position.set(-.62, 1.08, 0); g.add(handle); for (const s of [-1, 1]) { const arm = mesh(new THREE.CylinderGeometry(.02, .02, .4, 6), steel); arm.position.set(-.58, .95, s * .34); arm.rotation.z = .4; g.add(arm); }
      for (const sx of [-.45, .45]) for (const sz of [-.3, .3]) { const leg = mesh(new THREE.CylinderGeometry(.02, .02, .4, 6), steel); leg.position.set(sx, .28, sz); g.add(leg); const wh = mesh(new THREE.CylinderGeometry(.07, .07, .05, 12), MAT.rubber()); wh.rotation.x = PI / 2; wh.position.set(sx, .07, sz); g.add(wh); }
      g.position.set(x, 0, z); g.rotation.y = ry; group.add(g); return g; };
    cart(X0 - 52, -1.0, .3); col(X0 - 52, -1.0, .8); cart(X0 - 50.8, -2.4, -.1); cart(X0 - 44, 2.6, 2.6);
    const cb = cardboardMat(); for (const [dx, z] of [[-42, 1.0], [-30, -1.05]]) { const pal = box(1.2, .14, 1.2, MAT.std(0xa8743f)); pal.position.set(X0 + dx, .07, z); group.add(pal); let y = .14; for (const s of [.55, .55, .5]) { for (const [ox, oz] of [[-.28, -.28], [.28, .28], [.28, -.28]]) { const b = box(s, s * .8, s, cb, .01); b.position.set(X0 + dx + ox * .9, y + s * .4, z + oz * .9); group.add(b); } y += s * .8; if (y > 1.2) break; } col(X0 + dx, z, .9); }
    // the checkout near the gate: a counter, a moving belt, a register
    const cx = X0 - 20, cz = -3.0; const counter = box(3.2, .9, .9, blue, .05); counter.position.set(cx, .45, cz); group.add(counter); const bt = box(2.4, .04, .7, belt); bt.position.set(cx - .3, .92, cz); group.add(bt);
    const reg = box(.5, .45, .5, MAT.std(0x3a3d45)); reg.position.set(cx + 1.2, 1.12, cz); group.add(reg); for (let i = 0; i < 4; i++) { const it = box(.28, .22, .28, i % 2 ? cb : MAT.paint([0xe63946, 0x2a9d8f][i % 2 ? 0 : 1]), .02); it.position.set(cx - 1.4 + i * .6, 1.05, cz); group.add(it); anims.push({ kind: 'glide', m: it, x1: cx - 1.5, x2: cx + .8, v: .5 }); }
    // the big smiley price sign on a tall pole
    const pole = mesh(new THREE.CylinderGeometry(.08, .1, 4.2, 10), steel); pole.position.set(X0 - 26, 2.1, 4.6); group.add(pole);
    const sm = picture((g, w, h) => { g.fillStyle = '#ffc220'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 6, 0, PI * 2); g.fill(); g.strokeStyle = '#3a2a08'; g.lineWidth = 12; g.stroke(); g.fillStyle = '#3a2a08'; g.beginPath(); g.ellipse(w * .36, w * .4, 18, 30, 0, 0, PI * 2); g.fill(); g.beginPath(); g.ellipse(w * .64, w * .4, 18, 30, 0, 0, PI * 2); g.fill(); g.lineWidth = 16; g.lineCap = 'round'; g.beginPath(); g.arc(w / 2, w * .5, w * .25, .25 * PI, .75 * PI); g.stroke();
      g.fillStyle = '#0071ce'; rr(g, 10, w + 10, w - 20, h - w - 20, 24); g.fill(); g.fillStyle = '#fff'; g.font = `700 64px ${FONT}`; g.textAlign = 'center'; g.fillText('SUPERSTORE', w / 2, w + 82); }, 512, 640, 2.0, { alpha: true, double: true });
    sm.position.set(X0 - 26.1, 4.1, 4.6); group.add(sm);
  }
  function dressBloomberg() {   // the Campaign Stage: VOTE signs, billboards with his face, balloons, bunting, a confetti cannon
    const navy = MAT.paint(0x1d2b4a), red = MAT.paint(0xc8202a), white = MAT.paint(0xf4f1e8), dark = MAT.std(0x2a2b30);
    const signT = (g, w, h) => { g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, w, h); g.fillStyle = '#1d3f8a'; g.fillRect(0, 0, w, h * .42); g.fillStyle = '#fff'; g.font = `900 92px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('VOTE', w / 2, h * .22);
      g.fillStyle = '#1d2b4a'; g.font = `800 64px ${FONT}`; g.fillText('BLOOMBERG', w / 2, h * .6, w - 30); g.fillStyle = '#c8202a'; for (let i = 0; i < 5; i++) { const x = w * (.2 + i * .15), y = h * .86; g.beginPath(); for (let k = 0; k < 10; k++) { const a = -PI / 2 + k * PI / 5, r = k % 2 ? 9 : 22; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.fill(); } };
    for (const [dx, z] of [[-58, -2.6], [-55, 2.7], [-50, -2.6], [-45, 2.7], [-39, -2.6], [-33, 2.7], [-27, -2.6], [-21, 2.7]]) { const st = mesh(new THREE.CylinderGeometry(.025, .025, .9, 6), MAT.std(0x8b5a2b)); st.position.set(X0 + dx, .45, z); group.add(st); const s = picture(signT, 512, 330, .9); s.material.side = THREE.DoubleSide; s.position.set(X0 + dx, 1.05, z); s.rotation.y = -PI / 2 + (z > 0 ? -.5 : .5); group.add(s); }
    // billboards on tall legs: a cartoon of him (bald on top, a grey fringe, a big smile) and the year he ran
    const bbT = (g, w, h) => { g.fillStyle = '#1d3f8a'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8202a'; g.fillRect(0, h - 70, w, 70); const cx = 230, cy = 230;
      g.fillStyle = '#f1c9a5'; g.beginPath(); g.ellipse(cx, cy, 120, 145, 0, 0, PI * 2); g.fill(); for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 122, cy + 10, 22, 34, 0, 0, PI * 2); g.fill(); }
      g.strokeStyle = '#c9c6c0'; g.lineWidth = 30; g.lineCap = 'round'; for (const s of [-1, 1]) { g.beginPath(); g.arc(cx, cy - 10, 118, s < 0 ? PI * .78 : PI * .02, s < 0 ? PI * .98 : PI * .22); g.stroke(); }
      g.fillStyle = '#2b2418'; for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * 42, cy - 10, 11, 0, PI * 2); g.fill(); } g.strokeStyle = '#2b2418'; g.lineWidth = 9; g.beginPath(); g.arc(cx, cy + 40, 52, .15 * PI, .85 * PI); g.stroke();
      g.fillStyle = '#fff'; g.font = `900 120px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BLOOMBERG', 700, 190, 560); g.font = `800 110px ${FONT}`; g.fillText('2020', 700, 330); g.font = `700 44px ${FONT}`; g.fillText('★ ★ ★ ★ ★', w / 2, h - 35); };
    for (const [dx, z] of [[-48, 4.6], [-29, -4.6]]) { for (const s of [-1, 1]) { const leg = mesh(new THREE.CylinderGeometry(.08, .1, 3.2, 8), dark); leg.position.set(X0 + dx, 1.6, z + s * 1.6); group.add(leg); } const b = picture(bbT, 1024, 512, 4.0); b.position.set(X0 + dx - .06, 4.1, z); b.rotation.y = -PI / 2 + (z > 0 ? -.35 : .35); group.add(b); const back = box(.1, 2.05, 4.1, navy); back.position.set(X0 + dx + .06, 4.1, z); back.rotation.y = z > 0 ? -.35 : .35; group.add(back); }
    // balloons on strings, bobbing
    const bc = [0xc8202a, 0xf4f1e8, 0x1d3f8a]; for (const [dx, z] of [[-56, -4.4], [-41, 4.3], [-35, -4.5], [-19, 4.4]]) for (let i = 0; i < 3; i++) { const bl = new THREE.Group(); const ball = mesh(new THREE.SphereGeometry(.32, 14, 10), MAT.gloss(bc[i])); ball.scale.y = 1.2; ball.position.y = 2.4 + i * .25; bl.add(ball); const str = mesh(new THREE.CylinderGeometry(.006, .006, 2.2 + i * .25, 4), MAT.std(0xffffff)); str.position.y = (2.2 + i * .25) / 2; bl.add(str); bl.position.set(X0 + dx + (i - 1) * .45, 0, z + (i % 2) * .3); bl.rotation.z = (i - 1) * .15; group.add(bl); anims.push({ kind: 'sway', m: bl, ph: dx + i, r0: (i - 1) * .15 }); }
    // bunting along both edges: red, white and blue flags on a rope
    { const n = 26, flags = new THREE.InstancedMesh(new THREE.ConeGeometry(.18, .36, 3), MAT.std(0xffffff, { roughness: .8 }), n * 2); const cc = new THREE.Color(); let i = 0;
      for (const s of [-1, 1]) for (let j = 0; j < n; j++) { const x = X0 + START + 3 + j * ((GATE - START - 6) / (n - 1)); _m.compose(_v.set(x, 2.1 - Math.abs(Math.sin(j * .9)) * .12, s * 5.4), _q.setFromAxisAngle(_w.set(1, 0, 0), PI), _s.set(1, 1, .2)); flags.setMatrixAt(i, _m); flags.setColorAt(i++, cc.set(bc[j % 3])); }
      own.push(flags); group.add(flags); for (const s of [-1, 1]) { const rope = box(GATE - START - 5, .02, .02, MAT.std(0xeeeeee)); rope.position.set(X0 + (START + GATE) / 2, 2.25, s * 5.4); group.add(rope); for (let x = X0 + START + 3; x <= X0 + GATE - 2; x += 11) { const p = mesh(new THREE.CylinderGeometry(.04, .05, 2.3, 8), white); p.position.set(x, 1.15, s * 5.4); group.add(p); } } }
    // podiums half across the road, a star on each
    const starT = (g, w, h) => { g.fillStyle = '#1d3f8a'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.beginPath(); for (let k = 0; k < 10; k++) { const a = -PI / 2 + k * PI / 5, r = k % 2 ? 34 : 84; g.lineTo(w / 2 + Math.cos(a) * r, h * .45 + Math.sin(a) * r); } g.fill(); g.fillStyle = '#c8202a'; g.fillRect(0, h - 40, w, 40); };
    for (const [dx, z] of [[-52, -1.0], [-42, 1.0], [-30, -1.05]]) { const p = box(.8, 1.15, 1.0, navy, .04); p.position.set(X0 + dx, .58, z); group.add(p); const top = box(.95, .08, 1.1, white); top.position.set(X0 + dx - .05, 1.18, z); top.rotation.z = .15; group.add(top); const f = picture(starT, 256, 320, .9); f.position.set(X0 + dx - .41, .6, z); group.add(f); col(X0 + dx, z, .85); }
    // a confetti cannon aimed over the gate
    const cn = mesh(new THREE.CylinderGeometry(.22, .3, 1.4, 14), red); cn.position.set(X0 - 20, 1.0, -4.6); cn.rotation.z = -.7; group.add(cn); const base = box(.8, .5, .8, navy); base.position.set(X0 - 20.3, .25, -4.6); group.add(base);
  }


  // the newer styles' trap looks: bars, the box, the pen's walls
  const TRAP = { bloomberg: { bar: () => MAT.paint(0x1d2b4a), box: () => MAT.paint(0x1d3f8a), wall: () => MAT.paint(0xc8202a) }, walton: { bar: () => MAT.chrome({ color: 0xb8bec4 }), box: () => cardboardMat(), wall: () => MAT.paint(0x0071ce) },
    zuckerberg: { bar: () => MAT.paint(0x7b3fc4), box: () => iconMat(APPS[0]), wall: () => MAT.std(0x1b1c22, { roughness: .4 }) }, page: { bar: () => MAT.paint(0x3a7bd5), box: () => MAT.paint(0xf4f4f2), wall: () => MAT.paint(0xf4f4f2) } };
  function makeTrap(f, style) {
    const TS = TRAP[style];
    const barM = TS ? TS.bar() : style === 'trump' ? MAT.gold() : style === 'bezos' ? MAT.chrome({ color: 0x8a9096 }) : style === 'ellison' ? MAT.chrome({ color: 0x9aa3ad }) : MAT.std(0x3a3b42, { roughness: .5 });
    const g = new THREE.Group(); const x = X0 + f.at[0], z = f.at[1]; g.position.set(x, 0, z);
    if (f.trap === 'cage') { for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2; const bar = mesh(new THREE.CylinderGeometry(.022, .022, .8, 6), barM); bar.position.set(Math.cos(a) * .42, .4, Math.sin(a) * .42); g.add(bar); }
      const top = mesh(new THREE.TorusGeometry(.43, .03, 8, 20), barM); top.rotation.x = PI / 2; top.position.y = .8; g.add(top); const base = mesh(new THREE.CylinderGeometry(.48, .5, .06, 20), barM); base.position.y = .03; g.add(base); const knob = mesh(new THREE.SphereGeometry(.07, 10, 8), barM); knob.position.y = .88; g.add(knob); }
    else if (f.trap === 'box') { const lid = TS ? box(1.0, 1.0, 1.0, TS.box(), style === 'zuckerberg' ? .2 : .02) : style === 'bezos' ? box(1.0, 1.0, 1.0, cardboardMat(), .015) : style === 'trump' ? box(1.0, 1.0, 1.0, MAT.gold(), .04) : style === 'ellison' ? box(1.0, 1.0, 1.0, MAT.std(0x5a5f66, { roughness: .5, metalness: .4 }), .03) : box(1.0, 1.0, 1.0, MAT.paint(0xe8e8e8), .02); lid.position.y = .5; lid.rotation.y = .25; g.add(lid);
      if (style === 'musk') { const stripe = box(1.02, .18, 1.02, MAT.paint(0xd7262c)); stripe.position.y = .5; stripe.rotation.y = .25; g.add(stripe); }
    }
    else { const wallM = TS ? TS.wall() : style === 'trump' ? MAT.gold() : style === 'bezos' ? cardboardMat() : style === 'ellison' ? MAT.std(0x5a5f66, { roughness: .5, metalness: .4 }) : MAT.std(0x3a3b42, { roughness: .5 }); const toRoad = z > 0 ? -1 : 1;   // the open side (with bars) faces the road
      const back = box(1.3, .7, .1, wallM); back.position.set(0, .35, -toRoad * .6); g.add(back); for (const s of [-1, 1]) { const side = box(.1, .7, 1.2, wallM); side.position.set(s * .6, .35, 0); g.add(side); }
      for (let i = -2; i <= 2; i++) { const bar = mesh(new THREE.CylinderGeometry(.022, .022, .75, 6), barM); bar.position.set(i * .25, .375, toRoad * .6); g.add(bar); } const rail = box(1.3, .05, .05, barM); rail.position.set(0, .74, toRoad * .6); g.add(rail); }
    // every trapped friend calls out, bigger than before, so a kid sees all three from the start of the road (polish 10/30)
    const help = textSprite(['help!'], { scale: 1.0, size: 64, bg: 'rgba(255,236,200,.97)', stroke: '#d7262c' }); help.position.y = 1.7; g.add(help); g.userData.help = help;
    group.add(g); return g;
  }
  function makeSecret() {
    const s = L.secret; const g = new THREE.Group(); g.position.set(X0 + s.at[0], 0, s.at[1]);
    if (A.style === 'trump') { const gold = MAT.gold(); const ring = mesh(new THREE.CylinderGeometry(.22, .2, .16, 12, 1, true), gold); ring.material = MAT.gold({ side: THREE.DoubleSide }); ring.position.y = .08; g.add(ring); for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; const sp = mesh(new THREE.ConeGeometry(.05, .14, 6), gold); sp.position.set(Math.cos(a) * .2, .22, Math.sin(a) * .2); g.add(sp); } const inside = mesh(new THREE.CylinderGeometry(.19, .19, .02, 12), MAT.std(0xc9a06a)); inside.position.y = .02; g.add(inside); }
    else if (A.style === 'bloomberg') { const sh = mesh(new THREE.SphereGeometry(.2, 16, 10, 0, PI * 2, 0, PI / 2), MAT.paint(0xf6d7c3, { side: THREE.DoubleSide })); sh.scale.set(1, .5, 1.2); sh.position.y = .02; g.add(sh); for (let i = -2; i <= 2; i++) { const rib = box(.012, .05, .44, MAT.paint(0xe0a98a)); rib.position.set(i * .07, .1 - Math.abs(i) * .015, 0); rib.rotation.z = i * .2; g.add(rib); } }
    else if (A.style === 'walton') { const ball = mesh(new THREE.SphereGeometry(.13, 16, 10), MAT.paint(0xf47c20)); ball.scale.set(1.6, 1, 1); ball.position.y = .14; g.add(ball); const lace = box(.16, .02, .03, MAT.paint(0x1d3f8a)); lace.position.set(0, .27, 0); g.add(lace); }
    else if (A.style === 'zuckerberg') { const cupM = MAT.paint(0xf4f1e8); for (const s of [-1, 1]) { const cup = mesh(new THREE.CylinderGeometry(.1, .07, .18, 14, 1, true), cupM); cup.material.side = THREE.DoubleSide; cup.position.set(s * .32, .09, 0); cup.rotation.z = s * PI / 2; g.add(cup); } const str = mesh(new THREE.CylinderGeometry(.005, .005, .5, 4), MAT.std(0xd7262c)); str.rotation.z = PI / 2; str.position.y = .09; g.add(str); }
    else if (A.style === 'page') { const map = picture((c, w, h) => { c.fillStyle = '#f3ead2'; c.fillRect(0, 0, w, h); c.strokeStyle = '#3b8f4a'; c.lineWidth = 10; c.beginPath(); c.moveTo(10, 200); c.bezierCurveTo(80, 120, 160, 220, 246, 60); c.stroke(); c.strokeStyle = '#d7262c'; c.lineWidth = 7; c.beginPath(); c.moveTo(20, 40); c.lineTo(230, 230); c.moveTo(130, 10); c.lineTo(110, 250); c.stroke(); c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 3; for (const x of [85, 170]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } }, 256, 256, .5, { double: true }); map.rotation.set(-PI / 2, 0, 0); map.position.y = .02; g.add(map); }
    else if (A.style === 'ellison') { const hull = box(.4, .1, .16, MAT.std(0xc9a06a), .03); hull.position.y = .06; g.add(hull); const mast = mesh(new THREE.CylinderGeometry(.008, .008, .34, 6), MAT.std(0x8b5a2b)); mast.position.y = .27; g.add(mast); const sail = mesh(new THREE.PlaneGeometry(.16, .24), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide })); sail.position.set(.06, .27, 0); g.add(sail); }
    else if (A.style === 'bezos') { const b = box(.45, .32, .35, cardboardMat(), .01); b.position.y = .16; b.rotation.y = .5; g.add(b); const [c, gg] = canvas(256, 128); gg.fillStyle = '#fff'; gg.fillRect(0, 0, 256, 128); gg.fillStyle = '#222'; gg.font = `700 34px ${FONT}`; gg.fillText('TO: Gerbil Valley', 14, 52); gg.font = `400 26px ${FONT}`; gg.fillText('never delivered', 14, 96); const lbl = mesh(new THREE.PlaneGeometry(.3, .15), new THREE.MeshStandardMaterial({ map: tex(c) })); lbl.position.set(.1, .33, .05); lbl.rotation.x = -PI / 2; lbl.rotation.z = -.5; g.add(lbl); }
    else { const body = mesh(new THREE.CylinderGeometry(.09, .09, .5, 12), MAT.paint(0xd7262c)); body.rotation.z = PI / 2; body.position.y = .12; g.add(body); const tip = mesh(new THREE.ConeGeometry(.09, .22, 12), MAT.paint(0xf2f2f2)); tip.rotation.z = -PI / 2; tip.position.set(.36, .12, 0); g.add(tip); for (const a of [0, 2.1, 4.2]) { const fin = triPrism(.18, .16, .03, MAT.paint(0xf2f2f2)); fin.position.set(-.25, .12, 0); fin.rotation.x = a; g.add(fin); } }
    group.add(g); return { g, id: `approach-${A.stop.id}`, base: g.position.y };
  }

  // ---------- beat 2: the gates. Each returns { g, open(t) } with t in 0..1 ----------
  // the lintel's name: his surname, or "WALTON FAMILY" for "Rob Walton and family" (the name shown wherever he appears)
  const surname = boss => { const last = String(boss?.name || '').split(' ').pop(); return (/\band family\b/i.test(boss?.display_name || '') ? `${last} family` : last).toUpperCase(); };
  function plaqueTex(draw, w = 1024, h = 256) { const [c, g] = canvas(w, h); draw(g, w, h); return tex(c); }
  function gateTrump() {
    const g = new THREE.Group(); const gold = MAT.gold(), cream = MAT.std(0xf4e9d2);
    for (const s of [-1, 1]) { const pillar = box(.8, 5.2, .8, gold, .05); pillar.position.set(0, 2.6, s * 3.8); g.add(pillar); const ball = mesh(new THREE.SphereGeometry(.45, 16, 12), gold); ball.position.set(0, 5.4, s * 3.8); g.add(ball); const wall = box(.6, 2.6, 2.2, cream, .03); wall.position.set(0, 1.3, s * 5.3); g.add(wall); const trim = box(.7, .2, 2.2, gold); trim.position.set(0, 2.7, s * 5.3); g.add(trim); }
    const lintel = box(.9, 1.0, 8.4, gold, .05); lintel.position.y = 5.0; g.add(lintel);
    const nameT = plaqueTex((c, w, h) => { c.fillStyle = '#f6cc4e'; c.fillRect(0, 0, w, h); c.fillStyle = '#7a4e10'; c.font = `900 190px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('TRUMP', w / 2, h / 2 + 8); });
    const plaque = mesh(new THREE.PlaneGeometry(6.4, 1.0), new THREE.MeshStandardMaterial({ map: nameT, roughness: .5, metalness: .3 })); plaque.rotation.y = -PI / 2; plaque.position.set(-.46, 5.0, 0); plaque.castShadow = false; g.add(plaque);
    const doorT = plaqueTex((c, w, h) => { c.fillStyle = '#e8b93a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#b8860b'; c.lineWidth = 28; c.strokeRect(60, 60, w - 120, h - 120); c.fillStyle = '#b8860b'; c.font = `900 520px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('T', w / 2, h / 2 + 30); }, 768, 1024);
    const doorM = new THREE.MeshStandardMaterial({ map: doorT, roughness: .35, metalness: .5, emissive: 0x3a2a08, emissiveIntensity: .3 }); const hinges = [];
    for (const s of [-1, 1]) { const h = new THREE.Group(); h.position.set(0, 0, s * 3.4); const panel = box(.25, 4.4, 3.35, [gold, gold, gold, gold, gold, gold]); panel.material = [gold, doorM, gold, gold, gold, gold]; panel.position.set(0, 2.2, -s * 1.68); h.add(panel); const knob = mesh(new THREE.SphereGeometry(.12, 10, 8), MAT.chrome()); knob.position.set(-.2, 2.1, -s * 3.05); h.add(knob); g.add(h); hinges.push(h); }
    return { g, open: t => { hinges[0].rotation.y = t * 1.9; hinges[1].rotation.y = -t * 1.9; } };
  }
  function gateBezos() {
    const g = new THREE.Group(); const conc = MAT.std(0x9a9ea4, { roughness: .95 }), blue = MAT.paint(0x1f4e8c), steel = MAT.chrome({ color: 0x8a9096 });
    for (const s of [-1, 1]) { const pillar = box(1.0, 5.2, 1.0, conc); pillar.position.set(0, 2.6, s * 3.9); g.add(pillar); const wall = box(.8, 4.2, 2.0, conc); wall.position.set(0, 2.1, s * 5.4); g.add(wall); const stripe = box(.82, .5, 2.0, blue); stripe.position.set(0, 3.2, s * 5.4); g.add(stripe); }
    const lintel = box(1.0, 1.1, 8.8, blue); lintel.position.y = 4.95; g.add(lintel);
    const logoT = plaqueTex((c, w, h) => { c.fillStyle = '#1f4e8c'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = `700 150px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('warehouse', w / 2, h / 2 - 20); c.strokeStyle = '#ff9900'; c.lineWidth = 22; c.lineCap = 'round'; c.beginPath(); c.moveTo(w * .28, h * .74); c.quadraticCurveTo(w / 2, h * 1.02, w * .72, h * .74); c.stroke(); c.beginPath(); c.moveTo(w * .66, h * .64); c.lineTo(w * .73, h * .74); c.lineTo(w * .62, h * .8); c.stroke(); });
    const logo = mesh(new THREE.PlaneGeometry(7.0, 1.1), new THREE.MeshStandardMaterial({ map: logoT, roughness: .6 })); logo.rotation.y = -PI / 2; logo.position.set(-.51, 4.95, 0); logo.castShadow = false; g.add(logo);
    const corr = T.stripes('roller', '#c9ced3', '#a9b0b7', 16).clone(); corr.repeat.set(1, 6); corr.rotation = PI / 2; corr.center.set(.5, .5); corr.needsUpdate = true;
    const top = new THREE.Group(); top.position.y = 4.4; const panel = box(.14, 4.4, 6.8, new THREE.MeshStandardMaterial({ map: corr, roughness: .45, metalness: .5 })); panel.position.y = -2.2; top.add(panel); g.add(top);
    const drum = mesh(new THREE.CylinderGeometry(.3, .3, 7.0, 16), steel); drum.rotation.x = PI / 2; drum.position.set(0, 4.45, 0); g.add(drum);
    return { g, open: t => { top.scale.y = Math.max(.02, 1 - t); drum.scale.set(1 + t * .9, 1, 1 + t * .9); } };
  }
  function gateMusk() {
    const g = new THREE.Group(); const char = MAT.std(0x3a3b42, { roughness: .6 }), steel = MAT.chrome({ color: 0x9aa0a6 });
    for (const s of [-1, 1]) { const pillar = box(1.0, 5.6, .9, char); pillar.position.set(0, 2.8, s * 3.9); g.add(pillar); const wall = box(.8, 4.6, 2.0, char); wall.position.set(0, 2.3, s * 5.4); g.add(wall); const rib = box(.85, 4.6, .12, steel); rib.position.set(0, 2.3, s * 4.9); g.add(rib);
      const lamp = mesh(new THREE.SphereGeometry(.16, 10, 8), new THREE.MeshStandardMaterial({ color: s > 0 ? 0xff3030 : 0xffffff, emissive: s > 0 ? 0xff2020 : 0xffffff, emissiveIntensity: 1 })); lamp.position.set(0, 5.75, s * 3.9); g.add(lamp); anims.push({ kind: 'blink', m: lamp, ph: s }); }
    const lintel = box(1.0, 1.0, 8.8, char); lintel.position.y = 5.3; g.add(lintel);
    const rocketT = plaqueTex((c, w, h) => { c.fillStyle = '#2a2b30'; c.fillRect(0, 0, w, h); for (let i = 0; i < 9; i++) { c.fillStyle = i % 2 ? '#30313a' : '#2a2b30'; c.fillRect(0, i * h / 9, w, h / 9); }
      c.fillStyle = '#e9e9ec'; const cx = w / 2; c.beginPath(); c.moveTo(cx, h * .08); c.quadraticCurveTo(cx + 110, h * .3, cx + 110, h * .62); c.lineTo(cx + 110, h * .82); c.lineTo(cx - 110, h * .82); c.lineTo(cx - 110, h * .62); c.quadraticCurveTo(cx - 110, h * .3, cx, h * .08); c.fill();
      c.fillStyle = '#d7262c'; c.beginPath(); c.moveTo(cx - 110, h * .62); c.lineTo(cx - 230, h * .9); c.lineTo(cx - 110, h * .84); c.fill(); c.beginPath(); c.moveTo(cx + 110, h * .62); c.lineTo(cx + 230, h * .9); c.lineTo(cx + 110, h * .84); c.fill();
      c.fillStyle = '#ff9a3a'; c.beginPath(); c.moveTo(cx - 70, h * .84); c.lineTo(cx, h * .99); c.lineTo(cx + 70, h * .84); c.fill(); c.fillStyle = '#5aa7e8'; c.beginPath(); c.arc(cx, h * .42, 40, 0, PI * 2); c.fill();
      c.fillStyle = '#fff'; c.font = `700 90px ${FONT}`; c.textAlign = 'center'; c.fillText('ROCKET YARD', cx, h * .97 - 6); }, 1024, 1024);
    const doors = []; for (const s of [-1, 1]) { const t = rocketT.clone(); t.repeat.set(.5, 1); t.offset.set(s < 0 ? 0 : .5, 0); t.needsUpdate = true;   // facing +x, -z is on the viewer's left: that door shows the left half of the picture
      const d = box(.2, 4.8, 3.4, [char, new THREE.MeshStandardMaterial({ map: t, roughness: .55, metalness: .3 }), char, char, char, char]); d.position.set(0, 2.4, s * 1.7); g.add(d); doors.push(d); }
    return { g, open: t => { doors[0].position.z = -1.7 - t * 3.5; doors[1].position.z = 1.7 + t * 3.5; } };
  }

  function gateEllison() {   // grey concrete with a navy band, his name in red on the lintel, glass doors that slide apart
    const g = new THREE.Group(); const conc = MAT.std(0x9a9ea4, { roughness: .9 }), navy = MAT.paint(0x1d2b4a), glassM = MAT.glass ? MAT.glass({ color: 0x9fc7e6 }) : new THREE.MeshStandardMaterial({ color: 0x9fc7e6, transparent: true, opacity: .55, roughness: .05 });
    for (const s of [-1, 1]) { const pillar = box(1.0, 5.2, 1.0, conc); pillar.position.set(0, 2.6, s * 3.9); g.add(pillar); const wall = box(.8, 4.2, 2.0, conc); wall.position.set(0, 2.1, s * 5.4); g.add(wall); const band = box(.82, .4, 2.0, navy); band.position.set(0, 3.4, s * 5.4); g.add(band);
      const lamp = mesh(new THREE.SphereGeometry(.14, 10, 8), new THREE.MeshStandardMaterial({ color: 0x40ff60, emissive: 0x20ff40, emissiveIntensity: 1 })); lamp.position.set(-.55, 4.4, s * 3.9); g.add(lamp); anims.push({ kind: 'blink', m: lamp, ph: s * 2 }); }
    const lintel = box(1.0, 1.1, 8.8, navy); lintel.position.y = 4.95; g.add(lintel);
    const label = surname(A.stop.boss);
    const nameT = plaqueTex((c, w, h) => { c.fillStyle = '#c8202a'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = `900 170px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, w / 2, h / 2 + 8, w * .92); });
    const plaque = mesh(new THREE.PlaneGeometry(6.4, 1.0), new THREE.MeshStandardMaterial({ map: nameT, roughness: .5 })); plaque.rotation.y = -PI / 2; plaque.position.set(-.51, 4.95, 0); plaque.castShadow = false; g.add(plaque);
    const doors = []; for (const s of [-1, 1]) { const d = box(.12, 4.4, 3.4, glassM); d.position.set(0, 2.2, s * 1.7); g.add(d); const frame = box(.16, 4.4, .12, conc); frame.position.set(0, 0, s * 1.65); d.add(frame); doors.push(d); }
    return { g, open: t => { doors[0].position.z = -1.7 - t * 3.5; doors[1].position.z = 1.7 + t * 3.5; } };
  }

  // ---------- the newer gates: one frame (pillars, walls, a lintel with his surname), each in his colours, doors that slide apart ----------
  function gateFrame(o) {
    const g = new THREE.Group(); const pil = o.pillar, wallM = o.wall || o.pillar;
    for (const s of [-1, 1]) { const pillar = box(1.0, 5.2, 1.0, pil, o.round || 0); pillar.position.set(0, 2.6, s * 3.9); g.add(pillar); const wall = box(.8, 4.2, 2.0, wallM); wall.position.set(0, 2.1, s * 5.4); g.add(wall);
      if (o.band) { const band = box(.82, .4, 2.0, o.band); band.position.set(0, 3.4, s * 5.4); g.add(band); } }
    const lintel = box(1.0, 1.1, 8.8, o.lintel); lintel.position.y = 4.95; g.add(lintel);
    const label = surname(A.stop.boss);
    const nameT = plaqueTex((c, w, h) => { c.fillStyle = o.plaqueBg; c.fillRect(0, 0, w, h); if (o.letters) { c.font = `900 170px ${FONT}`; c.textBaseline = 'middle'; const tw = Math.min(w * .92, c.measureText(label).width), k = tw / c.measureText(label).width; let x = (w - tw) / 2; c.save(); c.translate(x, 0); c.scale(k, 1); let xx = 0; [...label].forEach((ch, i) => { c.fillStyle = o.letters[i % o.letters.length]; c.fillText(ch, xx, h / 2 + 8); xx += c.measureText(ch).width; }); c.restore(); }
      else { c.fillStyle = o.plaqueInk; c.font = `900 170px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, w / 2, h / 2 + 8, w * .92); } });
    const plaque = mesh(new THREE.PlaneGeometry(6.4, 1.0), new THREE.MeshStandardMaterial({ map: nameT, roughness: .5 })); plaque.rotation.y = -PI / 2; plaque.position.set(-.51, 4.95, 0); plaque.castShadow = false; g.add(plaque);
    const doors = []; for (const s of [-1, 1]) { const d = box(.14, 4.4, 3.4, o.door(s)); d.position.set(0, 2.2, s * 1.7); g.add(d); doors.push(d); }
    return { g, open: t => { doors[0].position.z = -1.7 - t * 3.5; doors[1].position.z = 1.7 + t * 3.5; } };
  }
  // a door's face, the left or right half of one picture (facing +x, -z is on the viewer's left: that door shows the left half)
  function halfFace(picTex, s, edge) { const t = picTex.clone(); t.repeat.set(.5, 1); t.offset.set(s < 0 ? 0 : .5, 0); t.needsUpdate = true; return [edge, new THREE.MeshStandardMaterial({ map: t, roughness: .4, metalness: .1 }), edge, edge, edge, edge]; }
  function gateZuckerberg() {   // black phone-edge pillars, a purple lintel, doors that are one big screen of apps
    const dark = MAT.std(0x1b1c22, { roughness: .35, metalness: .3 });
    const scr = plaqueTex((g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#2a1a4a'); gr.addColorStop(1, '#0f1530'); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) iconTile(g, APPS[(r + c) % APPS.length], 70 + c * 230, 80 + r * 185, 150); }, 1024, 1024);
    return gateFrame({ pillar: dark, round: .25, wall: MAT.std(0x2a2b33), band: MAT.paint(0x7b3fc4), lintel: MAT.paint(0x7b3fc4), plaqueBg: '#7b3fc4', plaqueInk: '#ffffff', door: s => halfFace(scr, s, dark) });
  }
  function gatePage() {   // white with a yellow band, his name in one palette blue, doors with one big magnifying glass
    const white = MAT.paint(0xf4f4f2), grey = MAT.std(0xd5d8dc);
    const mag = plaqueTex((g, w, h) => { g.fillStyle = '#f7f7f5'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3a7bd5'; g.lineWidth = 60; g.beginPath(); g.arc(w / 2 - 40, h * .42, 200, 0, PI * 2); g.stroke(); g.strokeStyle = '#3b2516'; g.lineWidth = 80; g.lineCap = 'round'; g.beginPath(); g.moveTo(w / 2 + 110, h * .42 + 150); g.lineTo(w / 2 + 260, h * .42 + 310); g.stroke(); }, 1024, 1024);
    return gateFrame({ pillar: white, wall: grey, band: MAT.paint(0xf2c230), lintel: white, plaqueBg: '#ffffff', plaqueInk: '#3a7bd5', door: s => halfFace(mag, s, white) });
  }
  function gateWalton() {   // a blue store front, his name in white, automatic glass doors
    const blue = MAT.paint(0x0071ce), glassM = MAT.glass({ color: 0x9fc7e6 }), frame = MAT.chrome({ color: 0xb8bec4 });
    const gt = gateFrame({ pillar: blue, wall: blue, band: MAT.paint(0xffc220), lintel: blue, plaqueBg: '#0071ce', plaqueInk: '#ffffff', door: () => glassM });
    // the doors' frames and a yellow spark over the middle
    for (const d of gt.g.children.slice(-2)) for (const dz of [-1.65, 1.65]) { const f = box(.18, 4.4, .1, frame); f.position.set(0, 0, dz); d.add(f); }
    const spark = picture((g, w, h) => { g.fillStyle = '#ffc220'; g.lineCap = 'round'; g.strokeStyle = '#ffc220'; g.lineWidth = 34; for (let i = 0; i < 6; i++) { const a = i * PI / 3 - PI / 2; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 30, h / 2 + Math.sin(a) * 30); g.lineTo(w / 2 + Math.cos(a) * 100, h / 2 + Math.sin(a) * 100); g.stroke(); } }, 256, 256, 1.1, { alpha: true }); spark.position.set(-.53, 5.9, 0); gt.g.add(spark);
    return gt;
  }
  function gateBloomberg() {   // a stage: navy frame with stars, red curtains that part
    const navy = MAT.paint(0x1d2b4a), curtain = MAT.std(0xb3141f, { roughness: .9 }); const folds = T.stripes('curtain', '#b3141f', '#8a0f18', 12).clone(); folds.repeat.set(3, 1); folds.needsUpdate = true;
    const cm = new THREE.MeshStandardMaterial({ map: folds, roughness: .9 });
    const gt = gateFrame({ pillar: navy, wall: navy, band: MAT.paint(0xc8202a), lintel: navy, plaqueBg: '#1d2b4a', plaqueInk: '#ffffff', door: () => [curtain, cm, curtain, curtain, curtain, curtain] });
    for (const s of [-1, 1]) { const star = picture((g, w, h) => { g.fillStyle = '#ffffff'; g.beginPath(); for (let k = 0; k < 10; k++) { const a = -PI / 2 + k * PI / 5, r = k % 2 ? 40 : 100; g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); } g.fill(); }, 256, 256, .8, { alpha: true }); star.position.set(-.51, 3.6, s * 3.9); gt.g.add(star); }
    return gt;
  }

  // ---------- start ----------
  A.start = (stop, hooks = {}) => {
    if (A.active) A.dispose(); A.active = true; A.stop = stop; A.phase = 'road'; onGate = hooks.onGate || null; onOpen = hooks.onOpen || null; openT = 0; gateDone = false; leaveT = 0;
    L = levelFor(stop); A.style = STYLES.includes(stop.id) ? stop.id : (L.style || 'ellison'); X0 = stop.x; gateX = X0 + GATE; group = new THREE.Group(); group.name = `approach-${stop.id}`; scene.add(group); friends = []; cols = []; anims = []; own.length = 0;
    const sign = makeSign([`To ${L.place} →`, 'free your friends on the way'], { width: 2.2 }); sign.position.set(X0 + START + 1.5, 0, -2.7); sign.rotation.y = -PI / 2; group.add(sign);
    ({ trump: dressTrump, bezos: dressBezos, musk: dressMusk, ellison: dressEllison, bloomberg: dressBloomberg, walton: dressWalton, zuckerberg: dressZuckerberg, page: dressPage }[A.style])();
    for (const f of L.friends) { const g = gerbilFrom({ color: f.color, scale: f.scale || .9 }); g.position.set(X0 + f.at[0], 0, f.at[1]); g.rotation.y = f.at[1] > 0 ? PI : 0; g.visible = f.trap !== 'box'; group.add(g);
      friends.push({ def: f, g, trap: makeTrap(f, A.style), state: 'trapped', hop: 0, hopT: 1 + Math.random() * 2, yaw: g.rotation.y, speed: 0, c: col(X0 + f.at[0], f.at[1], .8) }); }
    secret = makeSecret();
    hint = textSprite(['Free them!'], { scale: .7, size: 56, bg: 'rgba(59,143,74,.95)', stroke: '#2f7a3d' }); hint.visible = false; group.add(hint);
    gate = ({ trump: gateTrump, bezos: gateBezos, musk: gateMusk, ellison: gateEllison, bloomberg: gateBloomberg, walton: gateWalton, zuckerberg: gateZuckerberg, page: gatePage }[A.style])(); gate.g.position.x = gateX; group.add(gate.g); gate.open(0);
    boss = makeBoss(stop.id); boss.position.set(gateX - 2.4, 0, .6); boss.rotation.y = -PI / 2; group.add(boss); bossAnim = 'idle'; boss.userData.boss.play('idle');
    bubble = textSprite([L.brag], { scale: 1.5, size: 46 }); bubble.position.set(gateX - 2.4, 3.3, .6); group.add(bubble);
    waitBubble = textSprite(['Free your friends first!'], { scale: 1.0, size: 52, bg: 'rgba(255,236,200,.97)', stroke: '#d7262c' }); waitBubble.position.set(gateX - 2.4, 1.6, .6); waitBubble.visible = false; group.add(waitBubble); waitT = 0; nagAt = -1e9;
    backArrow = makeBackArrow(); backArrow.visible = false; group.add(backArrow); backT = 0;
    cageTrail = createTrail(group, { max: 16, color: 0xff7a3a, pitch: 1.6, size: .8 }); cageT = 0; cageShow = 0;
    toast(`The road to ${L.place}.`, { sub: 'Walk up it. Free the gerbils he trapped on the way.', ms: 4200 });
    return A;
  };

  // ---------- act: free a friend in reach ----------
  function nearTrapped() { let best = null, bd = REACH; const pp = player.position; for (const f of friends) if (f.state === 'trapped') { const d = Math.hypot(f.g.position.x - pp.x, f.g.position.z - pp.z); if (d < bd) { bd = d; best = f; } } return best; }
  function free(f) {
    f.state = 'follow'; f.c.r = 0; f.trap.visible = false; f.g.visible = true; f.hop = .45; sfx?.play('built'); spawnBurst(scene, f.trap.position, ({ trump: 0xf6cc4e, bezos: 0xff9900, musk: 0xe9e9ec, ellison: 0x40ff60, bloomberg: 0xc8202a, walton: 0xffc220, zuckerberg: 0x7b3fc4, page: 0x3a7bd5 }[A.style] ?? 0xffffff), 20);
    const who = `${f.def.name}, ${f.def.role}`; toast(`You freed ${who}!`, { sub: friends.filter(x => x.state === 'trapped').length ? 'They follow you. Find the others.' : 'Everyone is free. On to the gate!', ms: 3000 });
    state.friends = state.friends || {}; const list = state.friends[A.stop.id] = state.friends[A.stop.id] || []; if (!list.includes(who)) list.push(who); save(state);
  }
  A.friendCount = () => ({ freed: friends.filter(f => f.state !== 'trapped').length, total: friends.length });   // the goal line's count
  A.act = () => { if (!A.active || A.phase !== 'road') return false; const f = nearTrapped(); if (!f) return false; free(f); return true; };
  A.debugFree = () => { for (const f of friends) if (f.state === 'trapped') free(f); };

  // ---------- the gate card (tricks.js) ----------
  function trickCard() {
    openTrick({ stop: A.stop, card, closeCard, play, say, sfx, toast, state, save, title: 'The gate', rightTail: "He's dizzy, and the door is unlocked.",
      onRight: (q, finish) => { setBoss('dizzy'); play?.('v_dizzy'); finish('Open the door!', startOpen); } });
  }
  function setBoss(n) { if (bossAnim !== n) { bossAnim = n; boss.userData.boss.play(n); } }
  function reachGate() { A.phase = 'gate'; bubble.visible = false; waitBubble.visible = false; cageTrail.show(false); setBoss(Math.random() < .5 ? 'cheer' : 'laugh'); sfx?.play('toast'); onGate?.(); trickCard(); }
  function startOpen() { if (A.phase !== 'gate') return; A.phase = 'opening'; openT = 0; sfx?.play('built'); _v.set(gateX, 2.2, 0); spawnBurst(scene, _v, 0xf2c230, 28); for (const f of friends) if (f.state === 'follow') { f.state = 'wave'; f.t = 1.3; } }
  function finishOpen() { A.phase = 'open'; gate.open(1); sfx?.play('right'); _v.set(gateX, 1, 0); spawnBurst(scene, _v, 0xffffff, 24); toast('The door is open!', { sub: `Your friends run home. Go get the valley's money back.`, ms: 3200 }); boss.rotation.y = PI / 2; boss.userData.boss.setSpeed?.(1.9); setBoss('walk'); onOpen?.(); }
  A.debugGate = () => { if (A.active && A.phase === 'road') reachGate(); };   // tests: open the gate's True-or-trick card now
  A.debugOpen = () => { if (A.phase === 'road') { A.phase = 'gate'; bubble.visible = false; waitBubble.visible = false; cageTrail.show(false); onGate?.(); } setBoss('dizzy'); startOpen(); };

  // ---------- per frame ----------
  function stepFriend(f, i, dt, now) {
    const g = f.g; let speed = 0, air = false;
    if (f.state === 'trapped') { f.hopT -= dt; if (f.hopT <= 0) { f.hop = .36; f.hopT = 1.5 + Math.random() * 2.5; } if (f.trap.userData.help) f.trap.userData.help.position.y = 1.7 + Math.abs(Math.sin(now / 260 + i)) * .2; }
    else if (f.state === 'follow') { let prev = null; for (let k = i - 1; k >= 0; k--) if (friends[k].state === 'follow') { prev = friends[k].g; break; }   // the line: each follows the freed friend ahead, the first follows the player
      const tgt = prev || player; _v.subVectors(tgt.position, g.position); _v.y = 0; const d = _v.length(); const want = tgt === player ? .8 : .65;
      if (d > want) { speed = clamp((d - want) * 3.5, 0, 4.8); _v.multiplyScalar(1 / d); g.position.x += _v.x * speed * dt; g.position.z += _v.z * speed * dt; const yawT = Math.atan2(_v.x, _v.z); let dy = yawT - f.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); f.yaw += dy * Math.min(1, dt * 8); g.rotation.y = f.yaw; } }
    else if (f.state === 'wave') { f.t -= dt; g.position.y = Math.abs(Math.sin((1.3 - f.t) * PI * 2.3)) * .16; air = g.position.y > .08; f.yaw = g.rotation.y = -PI / 2 + Math.sin(now / 120) * .3; speed = 1.2; if (f.t <= 0) { f.state = 'leave'; g.position.y = 0; g.rotation.y = f.yaw = -PI / 2; } }
    else if (f.state === 'leave') { speed = 4.6; g.position.x -= speed * dt; if (g.position.x < gateX - 34) { f.state = 'gone'; g.visible = false; } }
    if (f.hop > 0) { f.hop -= dt; const u = 1 - clamp(f.hop / .36, 0, 1); g.position.y = Math.max(0, Math.sin(u * PI)) * .14; air = f.hop > .04; } else if (f.state !== 'wave') g.position.y = 0;
    animateGerbil(g, { speed: speed * 1.6, airborne: air, now, dt });
  }
  A.update = (dt, now = performance.now()) => {
    if (!A.active) return; dt = clamp(dt || 0, 0, .1);
    // obstacles push the player aside; the closed door and the giant stop them
    { const pp = player.position;
      // pushed out of each round obstacle; walking straight into one she also slides round it (verify: dead centre on, the push
      // has no sideways part and she stood still for good), toward the middle of the road
      for (const c of cols) if (c.r > 0) { const dx = pp.x - c.x, dz = pp.z - c.z; const d2 = dx * dx + dz * dz; if (d2 < c.r * c.r && d2 > 1e-6) { const d = Math.sqrt(d2); pp.x = c.x + dx / d * c.r; pp.z = c.z + dz / d * c.r;
        if (Math.abs(dz) < c.r * .6) pp.z += (Math.abs(c.z) > .05 ? -Math.sign(c.z) : (dz >= 0 ? 1 : -1)) * Math.min(c.r * .6, 2.4 * dt); } }
      // the road's edges (no voice, just a wall) and, near the gate, a gentle pull toward the middle of the road
      if (pp.z > ROAD_HALF) pp.z = ROAD_HALF; else if (pp.z < -ROAD_HALF) pp.z = -ROAD_HALF; if (pp.x < X0 + BACK) pp.x = X0 + BACK;
      if (A.phase === 'road' || A.phase === 'gate' || A.phase === 'opening') { const near = clamp((pp.x - (gateX - 12)) / 7, 0, 1); if (near > 0) pp.z -= pp.z * Math.min(1, dt * 2.2 * near); }
      // (verify) with every friend free the card opens a little before the line too, and when she is up against him: holding Up
      // into his body stopped her just short of the line under "Get to the door."
      const allFree = friends.every(f => f.state !== 'trapped'), atBoss = Math.hypot(pp.x - boss.position.x, pp.z - boss.position.z) < 3.0;
      if (A.phase === 'road' && (pp.x >= gateX - GATE_LINE - (allFree ? .8 : 0) || (allFree && atBoss))) {
        if (allFree) reachGate();
        else { pp.x = Math.min(pp.x, gateX - GATE_LINE - .15); waitBubble.visible = true; bubble.visible = false; waitT = 3.2; cageShow = 8; backT = 3.2;
          if (now - nagAt > NAG_S * 1000) { nagAt = now; play?.('friends_first', 'Free your friends first!'); setBoss('laugh'); } } }
      if (A.phase === 'gate' || A.phase === 'opening') { if (pp.x > gateX - 4.6) pp.x = gateX - 4.6; } }
    // dressing animations
    for (const a of anims) { if (a.kind === 'glide') { a.m.position.x += a.v * dt; if (a.m.position.x > a.x2) a.m.position.x = a.x1; } else if (a.kind === 'spin') a.m.rotation.y += dt * 40; else if (a.kind === 'orbit') { const t = now / 1000 * a.w; a.m.position.set(a.cx + Math.cos(t) * a.r, a.cy + Math.sin(t * 2.3) * .4, a.cz + Math.sin(t) * a.r); a.m.rotation.y = -t; a.m.rotation.z = .12; } else if (a.kind === 'bob') { a.m.position.y = Math.sin(now / 700) * .08; a.m.rotation.z = Math.sin(now / 900) * .06; } else if (a.kind === 'rise') { const u = ((now / 1000 * a.v + a.ph) % 1 + 1) % 1; a.m.position.y = a.y0 + (a.y1 - a.y0) * u; a.m.scale.setScalar(Math.min(1, u * 6, (1 - u) * 6) + .001); } else if (a.kind === 'sway') a.m.rotation.z = a.r0 + Math.sin(now / 800 + a.ph) * .08; else if (a.kind === 'blink') a.m.material.emissiveIntensity = (Math.sin(now / 250 + a.ph) > 0) ? 1.4 : .15; }
    if (secret) { secret.g.position.y = secret.base + Math.sin(now / 420) * .04; secret.g.rotation.y = now / 1400; state.eggs = state.eggs || {};
      if (!state.eggs[secret.id] && Math.hypot(secret.g.position.x - player.position.x, secret.g.position.z - player.position.z) < .9) { state.eggs[secret.id] = true; save(state); sfx?.play('secret'); toast(`You found ${L.secret.title}!`, { sub: L.secret.text, ms: 4200 }); } }
    // friends + the hint over the nearest cage in reach
    for (let i = 0; i < friends.length; i++) stepFriend(friends[i], i, dt, now);
    // free by touch: walking into a trapped friend frees them (A still works, from a little further)
    if (A.phase === 'road') for (const f of friends) if (f.state === 'trapped' && Math.hypot(f.g.position.x - player.position.x, f.g.position.z - player.position.z) < TOUCH) free(f);
    // the "free your friends first" bubble and the trail to the nearest cage
    // (verify) the bubble rides over HER head (over his it was above the top of the frame), and a big orange arrow at her feet
    // points back down the road while she is being sent back; main.js hides the forward arrows meanwhile (A.sentBack)
    if (waitT > 0) { waitT -= dt; waitBubble.position.set(player.position.x + .3, 1.55 + Math.sin(now / 300) * .06, player.position.z); if (waitT <= 0) { waitBubble.visible = false; if (A.phase === 'road') bubble.visible = true; } }
    if (backT > 0 && A.phase === 'road') { backT -= dt; backArrow.visible = true; backArrow.position.set(player.position.x + .2 - Math.abs(Math.sin(now / 220)) * .3, .35, player.position.z - 1.0); }   // beside her, tilted up toward the camera, bobbing back down the road else backArrow.visible = false;
    if (cageShow > 0 && A.phase === 'road') { cageShow -= dt; cageT -= dt; let best = null, bd = 1e9; for (const f of friends) if (f.state === 'trapped') { const d = Math.hypot(f.g.position.x - player.position.x, f.g.position.z - player.position.z); if (d < bd) { bd = d; best = f; } }
      if (!best || cageShow <= 0) cageTrail.show(false); else if (cageT <= 0) { cageT = .3; cageTrail.setPath(player.position.x, player.position.z, best.g.position.x, best.g.position.z).show(bd > 1.4); } }
    else if (cageTrail.mesh.visible) cageTrail.show(false);
    cageTrail.update(now);
    const nt = A.phase === 'road' ? nearTrapped() : null; hint.visible = !!nt; if (nt) hint.position.set(nt.g.position.x, 1.75 + Math.sin(now / 200) * .08, nt.g.position.z);
    // the gate
    if (A.phase === 'opening') { openT += dt / OPEN_S; const t = clamp(openT, 0, 1); gate.open(1 - (1 - t) * (1 - t)); if (openT >= 1) finishOpen(); }
    if (A.phase === 'open') { _v.set(X0 + PILE - 2, 0, 1.5).sub(boss.position); _v.y = 0; const d = _v.length(); if (d > .25) { _v.multiplyScalar(1 / d); boss.position.addScaledVector(_v, 1.9 * dt); boss.rotation.y = Math.atan2(_v.x, _v.z); } else { setBoss('idle'); A.phase = 'done'; } }
    if (bubble.visible) bubble.position.y = 3.3 + Math.sin(now / 500) * .06;
    boss.userData.boss.update(dt);
  };

  A.dispose = () => {
    if (!group) return; scene.remove(group);
    for (const m of own) { m.geometry?.dispose?.(); const mats = Array.isArray(m.material) ? m.material : [m.material]; for (const mt of mats) { if (mt?.map && !mt.userData?.shared) mt.map.dispose?.(); } }
    for (const o of [hint, bubble, waitBubble]) o?.material?.map?.dispose?.(); cageTrail?.dispose(); cageTrail = null;
    for (const f of friends) f.g.traverse(o => { if (o.isMesh) o.material?.dispose?.(); });   // the hamster geometry is shared: keep it
    group = null; boss = null; gate = null; secret = null; friends = []; cols = []; anims = []; own.length = 0; A.active = false; A.phase = 'idle';
  };
  return A;
}
