// Hidden things, from the boys' list (10/29): doorbells, books, Dogman comics, fancy race cars, a flying motorcycle, a Lego guy,
// an electric car, a toy wooden truck, a Nerf gun, a Lego, North Carolina. Nobody says where they are.
// `near` is a stop id ('hub' = the town, at x 0), a number (the index into the bosses in data order, 0 = the first road), or a
// list of those: the first that exists. Road eggs sit on his road in (approach.js: stop.x-60 to the gate at stop.x-14), clear
// of its friends, obstacles and dressing: two to a road (Trump: North Carolina, the race car; Ellison: the truck, the Nerf gun;
// Bezos: the doorbell, the Dogman comic; Musk: the motorcycle, the electric car), two in town (the Lego guy, the Lego).
// An egg whose stop is missing is not placed and not counted.
import * as THREE from 'three';
import { textSprite, legoBoxTexture } from './parts.js';
import { makeEgg } from './props.js';

const M = (c, r = .8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c));
const cyl = (r, h, c) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), M(c));
function wheels(g, w, d, r, y) { for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const wh = cyl(r, .08, 0x222222); wh.rotation.z = Math.PI / 2; wh.position.set(sx * w, y, sz * d); g.add(wh); } }

const EGGS = [
  { id: 'doorbell', title: 'A doorbell', text: 'Ding dong. Nobody answers. A whole pile of Lego sets up the road and not one gerbil home.', near: ['bezos', 1], at: s => [s.x - 40, 0, .8], r: .9, build: g => { const plate = box(.12, .18, .04, 0xdddddd); plate.position.y = .45; g.add(plate); const btn = new THREE.Mesh(new THREE.SphereGeometry(.03, 10, 8), M(0xd7262c)); btn.position.set(0, .45, .03); g.add(btn); } },
  { id: 'dogman', title: 'A Dogman comic', text: 'Dropped on the road, a little bent. Somebody was reading it on their break.', near: ['bezos', 2], at: s => [s.x - 33, 0, -.9], r: .9, build: g => { const b = box(.2, .02, .28, 0xf2c230); b.position.y = .01; b.rotation.y = .4; g.add(b); const t = box(.14, .025, .18, 0x2d6fd3); t.position.set(0, .02, 0); t.rotation.y = .4; g.add(t); } },
  { id: 'motorcycle', title: 'A flying motorcycle', text: 'Hovering over the road to the Rocket Yard. Even his motorcycles fly.', near: ['musk', 3], at: s => [s.x - 39, .9, .6], r: .9, fly: true, build: g => { const b = box(.9, .3, .3, 0xd7262c); b.position.y = .3; g.add(b); for (const x of [-.4, .4]) { const w = new THREE.Mesh(new THREE.TorusGeometry(.22, .06, 8, 16), M(0x222222)); w.position.set(x, .22, 0); w.rotation.y = Math.PI / 2; g.add(w); } const bar = cyl(.02, .5, 0x999999); bar.rotation.x = Math.PI / 2; bar.position.set(.35, .6, 0); g.add(bar); } },
  { id: 'legoguy', title: 'A Lego guy', text: 'He has been standing in the road since before the billionaires came. Nobody moved him.', near: 'hub', at: s => [s.x + 20, 0, -.9], r: .9, build: g => { const legs = box(.2, .22, .12, 0x2d6fd3); legs.position.y = .11; g.add(legs); const body = box(.24, .24, .13, 0xd7262c); body.position.y = .34; g.add(body); const head = cyl(.09, .16, 0xf2c230); head.position.y = .54; g.add(head); const knob = cyl(.05, .04, 0xf2c230); knob.position.y = .64; g.add(knob); } },
  { id: 'truck', title: 'A toy wooden truck', text: 'Somebody left it in the road. The wheels still turn.', near: ['ellison', 1], at: s => [s.x - 46, 0, -.9], r: .9, build: g => { const bed = box(.5, .12, .26, 0xc49a5a); bed.position.set(-.1, .2, 0); g.add(bed); const cab = box(.22, .22, .26, 0xc49a5a); cab.position.set(.24, .27, 0); g.add(cab); wheels(g, .2, .15, .07, .07); } },
  { id: 'nerf', title: 'A Nerf gun', text: 'Orange, foam darts, no batteries. Not nearly enough for a billionaire.', near: ['ellison', 1], at: s => [s.x - 27, 0, -.8], r: .9, build: g => { const body = box(.5, .14, .08, 0xf47c20); body.position.y = .12; g.add(body); const barrel = cyl(.035, .3, 0x2d6fd3); barrel.rotation.z = Math.PI / 2; barrel.position.set(.38, .13, 0); g.add(barrel); const grip = box(.08, .16, .07, 0x2d6fd3); grip.position.set(-.14, .02, 0); g.add(grip); } },
  { id: 'racecar', title: 'A fancy race car', text: 'Red, low, fast. It costs more Lego sets than you could count. Parked on the red carpet like it owns the place.', near: ['trump', 0], at: s => [s.x - 45, 0, -.4], r: .9, build: g => { const b = box(.9, .18, .4, 0xd7262c); b.position.y = .2; g.add(b); const top = box(.4, .14, .3, 0x111111); top.position.set(-.05, .36, 0); g.add(top); const wing = box(.08, .04, .44, 0xd7262c); wing.position.set(-.46, .4, 0); g.add(wing); wheels(g, .3, .22, .09, .09); } },
  { id: 'ev', title: 'An electric car', text: 'Parked on the road to the Rocket Yard. Fully charged, going nowhere.', near: ['musk', 3], at: s => [s.x - 27, 0, -1], r: .9, build: g => { const b = box(.8, .24, .4, 0x2d6fd3); b.position.y = .22; g.add(b); const top = box(.45, .16, .34, 0x9fd3f5); top.position.set(0, .42, 0); g.add(top); wheels(g, .28, .22, .09, .09); const post = box(.1, .6, .1, 0x3b8f4a); post.position.set(.7, .3, .3); g.add(post); } },
  { id: 'nc', title: 'North Carolina', text: 'A signpost beside the road, pointing a long, long way off. Nobody knows who put it there.', near: 0, found: 'North Carolina', at: s => [s.x - 53, 0, -3.3], r: .9, build: g => { const post = cyl(.03, 1.4, 0x8b5a2b); post.position.y = .7; g.add(post); const s = textSprite(['North Carolina →', 'a long way'], { scale: .7, size: 56 }); s.position.y = 1.5; g.add(s); } },
  { id: 'lego', title: 'A Lego', text: 'One brick. Red. The billionaires never noticed it.', near: 'hub', at: s => [s.x + 2.2, 0, -9.5], r: .9, build: g => { const b = box(.16, .06, .08, 0xd7262c); b.position.y = .03; g.add(b); for (const x of [-.04, .04]) { const k = cyl(.018, .02, 0xd7262c); k.position.set(x, .07, 0); g.add(k); } } },
];

export function placeEggs(ctx, stops) {
  const { scene, player, state, save, toast, play, sfx, hudSecrets } = ctx; const byId = Object.fromEntries(stops.map(s => [s.id, s])), bosses = stops.filter(s => s.boss);
  const live = [];
  for (const e of EGGS) { const s = [].concat(e.near).map(n => typeof n === 'number' ? bosses[n] : byId[n]).find(Boolean); if (!s) continue; const g = new THREE.Group(); try { g.add(makeEgg(e.id)); } catch (err) { console.warn('egg', e.id, err); e.build(g); } const p = e.at(s); g.position.set(p[0], p[1], p[2]); scene.add(g); live.push({ ...e, group: g, base: g.position.clone() }); }
  // state.eggs also holds the road secrets (approach.js, 'approach-<id>'): they are counted on their own, never as eggs
  const OWN = live.map(e => e.id), TOTAL = live.length, ROAD = bosses.map(s => `approach-${s.id}`);
  const count = () => { const got = state.eggs || {}; return OWN.filter(id => got[id]).length; };
  const roadCount = () => { const got = state.eggs || {}; return ROAD.filter(id => got[id]).length; };
  let roadShown = roadCount(); const hud = () => { roadShown = roadCount(); hudSecrets?.(count(), TOTAL, roadShown, ROAD.length); }; hud();
  return { refresh() { state.eggs = state.eggs || {}; hud(); }, roadCount, roadTotal: ROAD.length, update(dt, now) {
    if (roadCount() !== roadShown) hud();
    for (const e of live) { if (e.fly) { e.group.position.y = e.base.y + Math.sin(now / 400) * .12; e.group.rotation.y = now / 900; }
      if ((state.eggs || {})[e.id]) continue;
      const d = e.group.position.distanceTo(player.position.clone().add(new THREE.Vector3(0, e.fly ? .25 : 0, 0))); if (d < e.r) { state.eggs = state.eggs || {}; state.eggs[e.id] = true; save(state); hud();
        sfx?.play('secret'); toast(`You found ${e.found || e.title[0].toLowerCase() + e.title.slice(1)}!`, { sub: `${e.text} Secret ${count()} of ${TOTAL}.`, ms: 4200 }); } }
  }, total: TOTAL };
}
