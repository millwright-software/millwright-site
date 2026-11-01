// prologue.js — the opening and the level beats (round 3: docs/LESSON-PLAN.md's arc).
//
// THE OPENING (pro.start): Molly is in the square, in control, with $20 over her head.
//  1) BUY: "Buy a Lego set at the Lego store": at the stall A buys one (the set pops into her arms: "$20 = one Lego set").
//  2) THE JAR, playable: four townsgerbils line up at the jar. Each A lets the next one drop a coin, and each coin lights one
//     shared thing, in hub.sharedKinds order (school, lamps, fountain, bell): a ~2.5 s cinematic aims the camera at it
//     (hub.sharedPos), then control comes back. After the four, Molly's own A drops her coin, and only then "This jar has a
//     grown-up name: taxes."
//  3) FAIR SHARE, cinematic, ~15 s, said "in our story": a gerbil with one coin stack drops one coin, one with two drops two.
//  4) THE HOOK: "Then the billionaires came down the road." They walk to the jar, Musk tips it into his sack, coins fly into
//     the others' sacks, and they walk off up the road with the loot. The townsfolk run.
//  5) CONTROL COMES BACK: "Look in the jar." Molly walks to it and presses A: nothing comes out (a shake, 'oops'). The lights go
//     out one at a time in the same order, the street falls, "Molly, go get it back." It ends with every shared thing off,
//     the jar empty at JAR_POS and the city at progress 0. A skip (hold A) anywhere after her coin jumps to the catch-up tail
//     (p3_catchup, "In our story, ..."), then onDone({ skipped: true }).
// CUT this round (never played again; their mp3s say cut lines): the price flip in the opening and its clips, the hook's
// fact lists, the four-billionaires line, the other bosses' price lines. Prices belong to Trump's level now.
//
// THE BEATS (pro.playBeat(id, { bossId, onDone }), pro.beatFor(bossId)): a flashback before each level ("Before, at the
// market...", a warm tint), then ONE trick, then the tag (the picked billionaire alone, walking up the road: "<name> took his
// money to the <place>. Go get him!"). Only the picked billionaire is cast. beatFor: trump → prices, ellison → market,
// bezos → news (all three playable), musk → jar, bloomberg / walton / zuckerberg / page → story (cinematic).
//  prices (Trump): Molly has $20 and her one Lego box. A at the Lego stall: the sign flips $20 → $60, three box outlines appear on
//    the counter and her one box fills only one. "In our story, Trump made things cost more."
//  market (Ellison): A at the market crate: ten coins pop out, seven roll up to three gold houses on the lookout mound and three
//    trickle down Gerbil Street (the Fed's new-money split, market.new_money: "the richest gerbils", never his name). Then
//    "Is that fair?" (the beat clock pauses while the card is open); either answer: "You get to decide."
//  news (Bezos): "This part is true: Jeff Bezos bought a newspaper." "In our story, his paper said the jar was fine." The stand
//    shows a full, smiling jar. Molly looks at the real (empty) jar, then A at the stand flips the paper to the true picture.
//  jar (Musk): the teacher drops her coin (clink). Musk opens his hand over the jar and nothing falls. "This part is true. One
//    year, Elon Musk put in zero dollars. The rules let him."
//  story: he walks into the square alone and the narrator says what he did in two number-free lines (STORY below).
// A playable phase sets playable/prompt/walkTarget exactly like the opening, puts Molly at a start spot once (player.visible =
// true), and never writes her position after that: main.js moves, turns and animates her, and walks her toward walkTarget.
// Clip lengths are estimates until audio/render/durations.json has them (read at start-up). pro.clips lists only the clip
// ids this file plays (main.js preloads them); every new line has a new id (p3_/o3_) and falls back to the browser voice.
//
//   const pro = createPrologue({ scene, player, camera, hub, city, gerbilFrom, makeBoss, spawnBurst, sfx, play, toast, caption, card, closeCard, data, name, playerId, state });
//   pro.start({ onDone(r) }) with r = { skipped } / pro.playBeat(id, { bossId, onDone }); each frame: hub.update(dt); pro.update(dt, now); camera ← pro.cameraTarget()
//   pro.act(): the A press in a playable phase. pro.skip(): in a playable phase it is act(); in the opening's cinematic it
//   jumps to the catch-up tail (a second skip ends it); in a beat it jumps to the tag (a second skip ends it).
//   pro.dispose() removes everything.
//   makeJar() is also the hub's, fight's and celebration's jar: userData.setFill(f) fills it 0..1, userData.fill() reads it.
// World frame = the hub's (hub.js): the square x ∈ [-11, 11], z ∈ [-6.5, 7.6]; the road along +x at z = 0; the fountain (0, 0, 4);
// the Lego stall (-6.8, 0, 4.6), fronts toward -z (keepers at z 2.5); Gerbil Street from (0, 0, 8) north; the jar JAR_POS.
import * as THREE from 'three';
import * as Props from './props.js';
import { textCanvas, makeBag, makeCrate, animateGerbil } from './props.js';

// every clip's length in seconds (ffprobe of web/audio/<id>.mp3 where it exists; ~2.8 words a second for the new lines until
// audio/render/durations.json has them), so each line ends before the next event's line starts
const LEN = { o_buy: 3.37, o_bought: 2.72, o_leave: 1.82, o_fall: 2.36, o_call_alex: 3.07, o_call_william: 3.18, o_press_touch: 1.97, o_press_keys: 1.81,
  p_before: 1.42,
  // ESTIMATES (round 3): replaced by audio/render/durations.json once rendered
  o3_jar: 4.6, o3_lit_school: 1.4, o3_lit_lamps: 1.4, o3_lit_fountain: 1.4, o3_lit_bell: 1.4, o3_your_turn: 2.2, o3_taxes: 2.9, o3_share_1: 4.2, o3_share_2: 3.4,
  p3_giants_story: 3.2, p3_catchup: 4.4, o3_look: 1.4, o3_empty: 1.6, p3_prices_trump: 4.6, p3_market_go: 2.0, p3_market: 9.4, p3_fair_decide: 3.6,
  p3_news_bezos_1: 3.0, p3_news_bezos_2: 3.2, p3_news_go: 1.8, p3_news_look: 1.8, p3_news_fixed: 2.6, p3_jar_musk: 5.6,
  p3_story_bloomberg_1: 6.4, p3_story_bloomberg_2: 4.2, p3_story_walton_1: 6.4, p3_story_walton_2: 5.2, p3_story_zuckerberg_1: 4.4, p3_story_zuckerberg_2: 4.4,
  p3_story_page_1: 6.0, p3_story_page_2: 5.0,
  p3_tag3_trump: 5.0, p3_tag3_ellison: 5.0, p3_tag3_bezos: 4.6, p3_tag3_musk: 4.8, p3_tag3_bloomberg: 5.2, p3_tag3_zuckerberg: 5.2, p3_tag3_page: 5.0, p3_tag3_walton: 5.6 };
if (typeof fetch === 'function') fetch('audio/render/durations.json').then(r => r.ok ? r.json() : {}).then(d => { for (const k in LEN) if (typeof d?.[k] === 'number') LEN[k] = d[k]; }).catch(() => {});
// the hook's clock (seconds from Molly's coin landing)
export const TIMELINE = { taxes: .9, share: 4.4, share2: 9.6, giants: 18.6, tip: 26.4, leave: 33.4, look: 39.0 };
const H = TIMELINE;
// the dark (seconds from her A on the empty jar): the shake, the lights out one at a time, the street falls, the call
const DARK = { empty: .3, out0: 2.2, gap: 1.4, fall: 8.2, call: 13.2, end: 17.2 };
const JAR_CINE = 4.4;   // each townsgerbil's coin: the cinematic's length (the coin into the jar, then a cut to what it lights, held)
const CINE_CUT = 1.1, CINE_LIGHT = 1.4;   // in the coin cinematic: the cut from the jar to the shared thing, and when it lights
// the jar shot (round 3 verify): the jar centred, Molly beside it, the line of townsgerbils in front. It looks the way the play
// camera does (toward -x), so Up still means away from the viewer. Used for the playable jar and look phases once she is near.
const JAR_SHOT = { pos: [3.3, 2.3, -3.2], look: [-.25, .85, -5.15] }, JAR_SHOT_R = 4.2;
const PACE = { go: 2.0, flee: 2.6, tipLen: 5.5, lotGap: .3, press: 12, idle: 9, tagPad: 1.0, catchPad: 1.2 };   // press: the idle press prompt at most this often
const GIANT_WALK = 2.8;   // m/s; bosses2's setSpeed retimes the walk cycle to it (stride 1.3 m), so the feet don't slide
export const JAR_POS = new THREE.Vector3(0, 0, -5.3);
const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);
const SPAWN = V(-6, .8), START = V(-3.2, -1.4), LOOK_START = V(-3.4, -2.4);
// the playable part's camera: a fixed direction (it pans and zooms, never turns); PLAY_YAW is main's movement basis then
const PLAY_YAW = -Math.PI / 2, PLAY_DX = Math.sin(PLAY_YAW), PLAY_DZ = Math.cos(PLAY_YAW);
const BUY = V(-7.5, 1.85), COIN = V(-1.25, -4.55);   // where she buys, where she stands at the jar
const FONT = 'Fredoka, "Arial Rounded MT Bold", sans-serif';
const KINDS = ['school', 'lamps', 'fountain', 'bell'];   // hub.sharedKinds when the hub doesn't say
const KIND_POS = { school: V(6, -14, 1.6), lamps: V(-3.4, 2.3, 2.2), fountain: V(0, 4, 1.2), bell: V(9.6, -13.5, 6.05) };   // where to look when the hub has no sharedPos
const KIND_SAY = { school: 'The school!', lamps: 'The lamps!', fountain: 'The fountain!', bell: 'The bell!' };
export { KIND_SAY };
const LINE = [V(.45, -4.45), V(.45, -3.9), V(.45, -3.35), V(.45, -2.8)];   // the townsgerbils' line at the jar (north-east of it)
// the price signs over each front (only the Lego sign flips, in Trump's beat)
const STALLS = { lego: { sign: V(-6.8, 2.7, 4.0), lines: ['Lego set', '$20'], after: ['Lego set', '$60'] } };   // (integrate, decision 5) the house's $100 and the car's $50 tags are gone: $20 and $60 are the only prices on screen
const COUNTER = V(-8.6, 2.55);   // Trump's beat: a little counter in front of the Lego stall's left side, the three box outlines on it
const MARKET_AT = V(-2.2, -2.6), MARKET_START = V(1.8, -1.6);   // Ellison's beat: the market crate; where Molly starts
const STAND = V(-3.8, -6.0), STAND_AT = V(-2.5, -6.0), NEWS_START = V(1.6, -1.4);   // Bezos's beat: the newspaper stand (facing +x), where she fixes it
const HILL = V(-25, -18, 2.2);   // the lookout mound when the hub has no hillTop
// the billionaires: where they wait up the road, their spot at the jar in the hook (with waypoints), the lane out
const GIANTS = {
  trump: { start: V(13, -.9), jar: [V(-2.7, -6.8)], out: 0 },
  bezos: { start: V(15, .9), jar: [V(-1.4, -4.3), V(-1.3, -6.2), V(-.2, -7.4)], out: .9 },
  musk: { start: V(14, .9), jar: [V(2.5, -6.7)], out: -.9 },
  ellison: { start: V(18.5, -.9), jar: [V(1.6, -3.6), V(-1.4, -7.7)], out: 1.8 },
};
const STORY_AT = V(2.4, -1.0);
const TEACH_TAG_Y = .62;   // the teacher's badge, just over her head
for (const id of ['bloomberg', 'walton', 'zuckerberg', 'page']) GIANTS[id] = { start: V(14, 0), jar: [STORY_AT], out: 0 };
// (verify) all eight walk into the hook, so every face on the road sign was seen taking the jar's money: the first four lead
// (Musk tips the jar), the other four follow up the road to their own spots round it (HOOK_MORE), then all leave together
const HOOK_MORE = {
  bloomberg: { start: V(15.5, -.9), jar: [V(3.0, -4.3)], out: -1.8, at: .6 },
  walton: { start: V(16.0, .9), jar: [V(-1.9, -3.6), V(-3.1, -4.7)], out: 1.2, at: 1.0 },
  zuckerberg: { start: V(17.0, -.9), jar: [V(3.4, -7.6), V(1.3, -8.5)], out: -1.2, at: 1.6 },
  page: { start: V(17.5, .9), jar: [V(-2.0, -8.6), V(-3.8, -7.6)], out: .3, at: 2.0 },
};
const IDS = ['trump', 'bezos', 'musk', 'ellison', ...Object.keys(HOOK_MORE)];   // the hook's eight
// where each beat's billionaire stands (and looks) while it plays
const BEAT_SPOT = { trump: [V(-11.0, 1.9), V(-6.5, -.5)], ellison: [V(-3.9, -3.9), MARKET_AT], bezos: [V(-3.0, -7.8), V(0, -4.0)], musk: [V(.75, -6.55), V(-.4, -2.0)] };
// the tag's places (hub.js ARROW_STYLE's arrow names)
const PLACES = { trump: 'the Golden Tower', ellison: 'the Data Harbor', bezos: 'the Warehouse', musk: 'the Rocket Yard', bloomberg: 'the Campaign Stage', walton: 'the Superstore', zuckerberg: 'the Giant Phone', page: 'the Search Tower' };
const NAMES0 = { trump: 'Donald Trump', ellison: 'Larry Ellison', bezos: 'Jeff Bezos', musk: 'Elon Musk', bloomberg: 'Michael Bloomberg', walton: 'Rob Walton and family', zuckerberg: 'Mark Zuckerberg', page: 'Larry Page' };
// where the townsfolk stand to watch: off every path the billionaires and Molly take
const WATCH = [[-1.9, 2.3], [1.9, 2.3], [-.8, 2.2], [.8, 2.2], [-1.4, 6.9], [1.4, 6.9], [-9.6, .2], [-10.2, 2.4], [10.2, 2.4], [-4.8, -6.2], [6.2, -5.6], [8.8, -4.2], [-9.4, -1.6], [7.4, -2.0]].map(([x, z]) => V(x, z));
// round obstacles (centre, radius) that walkers are pushed out of: stalls, stairs, fountain, lamps, benches
const OBST = [[-6.8, 4.6, 1.75], [6.8, 4.6, 1.75], [-7.5, -5, 1.75], [-5.9, -4.6, .55], [0, 4, 1.45], [-3.4, 2.3, .15], [3.4, 2.3, .15], [-3.4, 6.3, .15], [3.4, 6.3, .15], [-9.5, -2.6, .15], [9.5, -2.6, .15], [-3, 4, .75], [3, 4, .75]];
const COATS = [0xd9b07a, 0xc98f4e, 0xf0dcc0, 0xa87a4a, 0x8c6a4e, 0xe8c9a0, 0xb8b0a8, 0xf2e2d2, 0x6e5440, 0xdca96a];
const N_FOLK = 14, N_COINS = 40, HOOK_JAR = .75;   // HOOK_JAR: the jar's level once everybody has put in
const PLAYABLE = new Set(['buy', 'jar', 'look', 'bplay']);
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _m = new THREE.Matrix4(), _qt = new THREE.Quaternion(), _s = new THREE.Vector3();
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const easeOutBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// (verify) free a prop's own geometry, never the paper sprites' shared cards (paper-props caches them; userData.shared marks them,
// and every paper sprite group is userData.paper): disposing those made three.js re-upload them on the next frame
function disposeOwnGeo(g) { g?.traverse?.(o => { if (!o.isMesh || o.isSprite || o.userData?.paper || o.parent?.userData?.paper || o.geometry?.userData?.shared) return; o.geometry?.dispose?.(); }); }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

// ---------- the beats: their clocks and lines ----------
// every beat: p_before at .3, its trick, then the tag. A playable beat (play: when control comes) times its trick from the A
// press (B.actT) and sets B.tag then; a cinematic beat has B.tag fixed here.
const BEATS = {
  prices: { before: .3, play: 2.2, tag: Infinity },
  market: { before: .3, play: 2.2, tag: Infinity, say: .7, roll: 1.6, card: 0 },   // card: set from the line's length at the press
  news: { before: .3, walk: .8, buy: 3.6, say1: 3.8, lie: 7.4, play: 11.4, tag: Infinity },
  jar: { before: .3, teacher: 1.0, clink: 3.6, musk: 4.2, hand: 7.6, say: 8.0, tag: 0 },   // the teacher's coin first, in her own shot; then he walks in
  story: { before: .3, walk: 2.4, say1: 7.6, gap: 1.0, tagGap: 1.6, tag: 0 },
};
BEATS.jar.tag = BEATS.jar.say + LEN.p3_jar_musk + 1.4;
const BEAT_FOR = { trump: 'prices', bloomberg: 'story', walton: 'story', ellison: 'market', zuckerberg: 'story', page: 'story', bezos: 'news', musk: 'jar' };
// the story beat's two lines (every line here is sourced: boss.story.source), number-free, and when each event starts, in
// seconds into its line (e1 in line 1, e2 in line 2)
const STORY = {
  bloomberg: { lines: ['This part is true. Michael Bloomberg spent a giant pile of his own money trying to be president, in just a few months.', 'He won only one place: some little islands far out in the ocean.'], e1: 1.6, e2: 1.0 },
  walton: { lines: ["This part is true. Rob Walton's dad started Walmart, and Rob was born into the family that owns it.", 'But some people who work in its stores need help from the jar to buy food.'], e1: 1.4, e2: .3 },
  zuckerberg: { lines: ['This part is true. When new apps got popular, Mark Zuckerberg bought them.', 'He bought a photo app, and then a chat app, for giant piles of money.'], e1: 1.2, e2: .9, e2b: 2.1 },
  page: { lines: ["This part is true. Larry Page's company, Google, paid Apple a giant pile of money, so iPhones would use Google.", 'A judge said Google is a monopoly. It has almost all the searching to itself.'], e1: 2.2, e2: .4 },
};
// every clip this file plays (main.js preloads them)
const CLIPS = ['o_buy', 'o_bought', 'o_press_touch', 'o_press_keys', 'o3_jar', ...KINDS.map(k => `o3_lit_${k}`), 'o3_your_turn', 'o3_taxes', 'o3_share_1', 'o3_share_2', 'p3_giants_story', 'o_leave',
  'o3_look', 'o3_empty', 'o_fall', 'o_call_alex', 'o_call_william', 'p3_catchup', 'p_before', ...Object.keys(NAMES0).map(id => `p3_tag3_${id}`),
  'p3_prices_trump', 'p3_market_go', 'p3_market', 'p3_fair_decide', 'p3_news_bezos_1', 'p3_news_bezos_2', 'p3_news_go', 'p3_news_look', 'p3_news_fixed', 'p3_jar_musk', ...Object.keys(STORY).flatMap(id => [`p3_story_${id}_1`, `p3_story_${id}_2`])];

// ---------- the jar: glass on a stone stand, coins inside, a sign (the paper sprite in paper art mode) ----------
export function makeJar() {
  if (Props.artMode?.() === 'paper' && typeof Props.makeJarSprite === 'function') {
    const g = Props.makeJarSprite();
    if (g?.userData?.setFill) {
      if (typeof g.userData.fill !== 'function') { let f = 0; const set = g.userData.setFill; g.userData.setFill = v => { f = clamp(v, 0, 1); set(f); }; g.userData.fill = () => f; }
      if (typeof g.userData.dispose !== 'function') g.userData.dispose = () => {};
      return g;
    }
  }
  const g = new THREE.Group(); const stone = new THREE.MeshStandardMaterial({ color: 0x8f8880, roughness: .95 });
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(.5, .6, .5, 16), stone); stand.position.y = .25; stand.castShadow = stand.receiveShadow = true; g.add(stand);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(.42, .36, .9, 24, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xcfe9f5, transparent: true, opacity: .32, roughness: .05, metalness: 0, transmission: 0, side: THREE.DoubleSide, depthWrite: false })); glass.position.y = .5 + .45; g.add(glass);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(.36, 24), new THREE.MeshStandardMaterial({ color: 0x9fb8c4, roughness: .3, side: THREE.DoubleSide })); bottom.rotation.x = -Math.PI / 2; bottom.position.y = .505; g.add(bottom);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.42, .035, 10, 28), new THREE.MeshStandardMaterial({ color: 0xd9c08a, roughness: .35, metalness: .4 })); rim.rotation.x = Math.PI / 2; rim.position.y = 1.4; g.add(rim);
  const coins = new THREE.Mesh(new THREE.CylinderGeometry(.33, .33, 1, 20), new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: .35, metalness: .6, emissive: 0x6a4a00, emissiveIntensity: .25 })); coins.position.y = .51; coins.scale.y = .001; g.add(coins);
  const board = textCanvas(['THE JAR', 'everybody puts in a little'], { w: 900, pad: 40 }); const tex = new THREE.CanvasTexture(board); tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5 * board.height / board.width), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })); sign.position.set(0, .34, .62); sign.rotation.x = -.35; g.add(sign);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5 * board.height / board.width), sign.material); label.position.set(0, .34, -.62); label.rotation.set(.35, Math.PI, 0); g.add(label);
  g.userData.coins = coins; g.userData.glass = glass; g.userData.setFill = f => { f = clamp(f, 0, 1); coins.scale.y = Math.max(.001, f * .84); coins.position.y = .51 + coins.scale.y / 2; };
  g.userData.fill = () => coins.scale.y <= .0011 ? 0 : coins.scale.y / .84;
  g.userData.dispose = () => { for (const o of [stand, glass, bottom, rim, coins, sign]) { o.geometry.dispose(); o.material.dispose(); } tex.dispose(); };
  return g;
}

// ---------- canvases ----------
// the newspaper's front page: a jar, full and smiling (our story's paper) or empty (the true picture)
function jarPageCanvas(full) {
  const [c, g] = canvas(512, 400); g.fillStyle = '#fbf7ec'; g.fillRect(0, 0, 512, 400); g.fillStyle = '#2b2418'; g.fillRect(0, 0, 512, 70);
  g.fillStyle = '#fbf7ec'; g.font = `700 46px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(full ? 'THE JAR IS FINE!' : 'THE JAR IS EMPTY', 256, 37);
  const x = 166, y = 100, w = 180, h = 260;
  if (full) { g.fillStyle = '#f2c230'; g.beginPath(); g.roundRect(x + 10, y + 40, w - 20, h - 50, 26); g.fill(); g.fillStyle = '#d9a514'; for (let i = 0; i < 18; i++) { g.beginPath(); g.arc(x + 32 + (i % 4) * 40 + (i >> 2) % 2 * 18, y + 70 + (i >> 2) * 40, 15, 0, 7); g.fill(); } }
  g.lineWidth = 9; g.strokeStyle = '#3b2516'; g.beginPath(); g.roundRect(x, y + 20, w, h - 20, 30); g.stroke(); g.fillStyle = '#c9a26a'; g.fillRect(x + 20, y, w - 40, 26); g.strokeRect(x + 20, y, w - 40, 26);
  g.fillStyle = '#3b2516'; g.beginPath(); g.arc(x + 62, y + 150, 12, 0, 7); g.arc(x + w - 62, y + 150, 12, 0, 7); g.fill();
  g.lineWidth = 8; g.beginPath(); if (full) g.arc(x + w / 2, y + 180, 42, .15 * Math.PI, .85 * Math.PI); else { g.moveTo(x + w / 2 - 34, y + 205); g.lineTo(x + w / 2 + 34, y + 205); } g.stroke();
  if (full) { g.fillStyle = '#3a9a4a'; g.font = `900 120px ${FONT}`; g.fillText('✓', 430, 230); } else { g.fillStyle = '#b3261e'; g.font = `900 120px ${FONT}`; g.fillText('?', 430, 230); }
  return c;
}
// a made-up app tile: the shared icon from props (P.appIconCanvas), else a plain palette tile with a simple shape
function appTile(kind, bg) {
  const ic = Props.appIconCanvas?.(kind, 256); if (ic) return ic;
  const [c, g] = canvas(256, 256); g.fillStyle = bg; g.beginPath(); g.roundRect(8, 8, 240, 240, 54); g.fill(); g.fillStyle = '#fbf0d4';
  if (kind === 'seed') { g.beginPath(); g.ellipse(128, 132, 46, 70, .5, 0, 7); g.fill(); } else { for (const [x, y, r] of [[128, 150, 46], [80, 92, 22], [128, 72, 22], [176, 92, 22]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } }
  return c;
}
// a phone, no brand: a dark slab with a bright screen
function phoneCanvas() { const [c, g] = canvas(200, 320); g.fillStyle = '#3b2516'; g.beginPath(); g.roundRect(10, 10, 180, 300, 34); g.fill(); g.fillStyle = '#cfe9f5'; g.beginPath(); g.roundRect(26, 40, 148, 236, 12); g.fill(); g.fillStyle = '#fbf0d4'; g.beginPath(); g.arc(100, 292, 9, 0, 7); g.fill(); return c; }

export function createPrologue(ctx) {
  const { scene, player, hub, city, gerbilFrom, makeBoss, play: play0, caption: caption0, data } = ctx;
  // while a skip fast-forwards to a beat's tag, the events in between run quietly (no voice, captions, sounds or bursts)
  let quiet = false;
  const sfx = { play: (...a) => quiet ? undefined : ctx.sfx?.play?.(...a), music: ctx.sfx?.music };
  const spawnBurst = (...a) => quiet ? undefined : ctx.spawnBurst?.(...a);
  const play = (...a) => quiet ? undefined : play0?.(...a);
  const caption = (...a) => quiet ? undefined : caption0?.(...a);
  const P = { get active() { return active; }, get t() { return t; }, get playable() { return active && !finished && PLAYABLE.has(phase); }, get prompt() { return promptText(); }, get kind() { return kind; }, get phase() { return phase; },
    get _dbg() { return { beatX, folk, giants, phase, t, cineT, jarN, darkT, B }; },
    get walkTarget() { return P.playable && walking ? { x: walking.x, z: walking.z } : null; },
    start, playBeat, beatFor, act, update, cameraTarget, playCamera, takeCut, skip, dispose, TIMELINE, BEATS, clips: CLIPS, playYaw: PLAY_YAW };
  let active = false, finished = false, t = 0, root = null, onDone = null, r = rng(11), kind = null, phase = '', B = null;
  let cast = [], chosen = null, lastBoss = null, tagG = null, tint = null, pend = [], clock = 0, lastPress = -1e9, catchT = 0, skipped = false;
  let folk = [], giants = {}, coins = null, coinS = [], jar = null, signs = {}, collapsed = 0, order = [], once = {}, tip = null, jarTarget = new THREE.Vector3(), jarAxis = new THREE.Vector3(), jarFill0 = 0;
  let snapped = false, softUntil = -1, stand = null, sharers = [], jarN = 0, cineT = 0, cineKind = null, darkT = 0, darkKind = null;
  let tag = null, tagTex = {}, legoSet = null, walking = null, idleT = 0, phaseT = 0, shots = null, cardOpen = false, beatX = {};
  let cutCam = false, cutPlay = false;   // cutCam: the next cinematic frame cuts (no ease); cutPlay: main's next playable frame cuts (P.takeCut)
  const lastPos = new THREE.Vector3();
  const later = (sec, fn) => pend.push({ at: clock + sec, fn });   // run fn sec seconds from now (frame clock; no timers)
  const disposables = []; const D = o => { disposables.push(o); return o; };
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camA = new THREE.Vector3(), camB = new THREE.Vector3();
  const name = () => ctx.name?.() || 'Molly';
  const kinds = () => (Array.isArray(hub?.sharedKinds) && hub.sharedKinds.length ? hub.sharedKinds : KINDS);
  const setShared = (k, on, o) => { try { hub?.setShared?.(k, on, o); } catch (e) { console.warn('setShared', e); } };
  const sharedPos = (k, out) => { const p = hub?.sharedPos?.(k); return out.copy(p && p.isVector3 ? p : KIND_POS[k] || _q.copy(JAR_POS).setY(1)); };
  const hillTop = () => (hub?.hillTop?.isVector3 ? hub.hillTop : HILL);
  const boss = id => (data?.bosses || []).find(b => b.id === id);
  const shownName = id => { const b = boss(id); return b?.display_name || b?.name || NAMES0[id] || id; };
  const at = (key, time) => { if (t < time || once[key]) return false; once[key] = true; return true; };   // fire once when t passes time
  const between = (a, b) => t >= a && t < b;
  const say = (id, text, sub = '', ms = 5200) => { caption?.(text, sub, ms); play?.(id, text + (sub ? ' ' + sub : '')); };

  // ---------- the shared set: townsfolk, coins, signs, the billionaires ----------
  function setup(k, ids) {
    if (root) dispose(); kind = k; active = true; finished = false; t = 0; r = rng(11); collapsed = 0; once = {}; snapped = false; softUntil = -1; walking = null; idleT = 0; phaseT = 0; pend = []; clock = 0; lastPress = -1e9; catchT = 0; skipped = false; quiet = false; tagG = null;
    tip = null; jarN = 0; cineT = 0; cineKind = null; darkT = 0; darkKind = null; cardOpen = false; beatX = {}; sharers = [];
    root = new THREE.Group(); root.name = 'prologue'; scene.add(root); hub.prologueActive = true;
    jar = hub.jar?.(); if (jar) { jarFill0 = jar.userData.fill?.() ?? 0; jar.position.copy(JAR_POS); jar.rotation.set(0, 0, 0); }
    folk = []; for (let i = 0; i < N_FOLK; i++) { const g = gerbilFrom({ color: COATS[i % COATS.length], scale: .78 + r() * .24 }); const f = { i, g, state: 'wander', t: r() * 2, spot: new THREE.Vector3(), speed: 1.3 + r() * .6, yaw: 0, yawT: 0, hop: -1, k: -1 };
      pickSpot(f); g.position.copy(f.spot); pickSpot(f); f.yaw = f.yawT = yawTo(g.position, f.spot); g.rotation.y = f.yaw; root.add(g); folk.push(f); }
    coins = new THREE.InstancedMesh(D(new THREE.CylinderGeometry(.09, .09, .022, 14)), D(new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: .3, metalness: .7 })), N_COINS); coins.castShadow = true; coins.frustumCulled = false; root.add(coins);
    coinS = []; for (let i = 0; i < N_COINS; i++) { coinS.push({ live: false, t: 0, out: false, who: null, fill: 0, from: new THREE.Vector3(), to: new THREE.Vector3() }); _m.makeScale(0, 0, 0); coins.setMatrixAt(i, _m); } coins.instanceMatrix.needsUpdate = true;
    signs = {}; for (const key in STALLS) { const S = STALLS[key]; const A = priceSprite(S.lines, '#2b2418', S.sign), Bs = S.after ? priceSprite(S.after, '#b3261e', S.sign) : null; if (Bs) Bs.visible = false; signs[key] = { A, B: Bs, flipAt: Infinity }; }
    giants = {}; for (const id of ids) { const C = GIANTS[id]; const g = makeBoss(id); g.position.copy(C.start); g.rotation.y = -Math.PI / 2; root.add(g);
      const sack = makeBag(1); root.add(sack); giants[id] = { id, C, g, sack, s: 1.2, sT: 1.2, B: g.userData.boss, path: [], speed: 0, yawT: -Math.PI / 2, faceYaw: -Math.PI / 2, gone: false, laugh: [] }; giants[id].B?.play('idle'); placeSack(giants[id], 0); }
    sfx?.music?.start?.('market');
  }
  function placeGiant(G, p, look) { G.g.position.copy(p); G.g.rotation.y = G.yawT = G.faceYaw = yawTo(p, look); G.path = []; placeSack(G, 0); }
  function srgb(c) { const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx; }
  function priceSprite(lines, fg, pos) { const c = textCanvas(lines, { w: 700, pad: 36, fg }); const s = new THREE.Sprite(D(new THREE.SpriteMaterial({ map: D(srgb(c)), transparent: true }))); const w = 2.0; s.scale.set(w, w * c.height / c.width, 1); s.userData.w = w; s.userData.h = s.scale.y; s.position.copy(pos); root.add(s); return s; }
  function labelSprite(lines, pos, w, tc = {}) { const c = textCanvas(lines, { w: 640, pad: 30, ...tc }); const s = new THREE.Sprite(D(new THREE.SpriteMaterial({ map: D(srgb(c)), transparent: true }))); s.scale.set(w, w * c.height / c.width, 1); s.userData.w = w; s.userData.h = s.scale.y; s.position.copy(pos); root.add(s); return s; }
  function pickSpot(f) { let tries = 12; do { f.spot.set(-9 + r() * 18, 0, -5.5 + r() * 12); } while (--tries > 0 && (blocked(f.spot, .5) || f.spot.distanceTo(JAR_POS) < 1.8 || Math.abs(f.spot.z) < .4 || (kind === 'opening' && (f.spot.distanceTo(BUY) < 1.4 || f.spot.distanceTo(COIN) < 1.4 || f.spot.distanceTo(LINE[3]) < 1.4)))); }
  function blocked(p, rad) { for (const [x, z, R] of OBST) if (Math.hypot(p.x - x, p.z - z) < R + rad) return true; return false; }
  // push a walker out of the static obstacles, the jar, the billionaires and Molly
  function pushOut(p, rad, self = null) {
    for (const [x, z, R] of OBST) push(p, x, z, R + rad);
    if (jar && jar.position.y < .05) push(p, JAR_POS.x, JAR_POS.z, .6 + rad);
    for (const id in giants) { const G = giants[id]; if (G === self || G.gone || !G.g.visible) continue; push(p, G.g.position.x, G.g.position.z, (self ? .6 : .55) + rad); }
    if (player.visible && self !== player) push(p, player.position.x, player.position.z, .3 + rad);
  }
  function push(p, x, z, R) { const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz); if (d < R && d > 1e-4) { p.x = x + dx / d * R; p.z = z + dz / d * R; } }

  // the newspaper stand (Bezos's beat): a green kiosk, a header that changes hands, a front page that can be fixed
  function makeStand() {
    const g = new THREE.Group(); const green = D(new THREE.MeshStandardMaterial({ color: 0x2f6b4a, roughness: .7 })), wood = D(new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: .85 })), cream = D(new THREE.MeshStandardMaterial({ color: 0xf4e9d2, roughness: .8 }));
    const box = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(D(new THREE.BoxGeometry(w, h, d)), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    box(1.6, 1.0, .8, 0, .5, 0, green); box(1.7, .06, .9, 0, 1.03, .02, wood);
    for (const sx of [-1, 1]) box(.07, 1.2, .07, sx * .76, 1.66, -.32, wood);
    box(1.9, .08, 1.05, 0, 2.28, -.05, green);
    for (let i = 0; i < 4; i++) box(.48, .03 + i * .004, .34, -.5 + (i % 2) * .05, 1.07 + i * .025, .08, cream);   // a stack of papers on the counter
    const hdrA = D(srgb(textCanvas(['THE NEWSPAPER'], { w: 900, pad: 28, frameW: 16 }))), hdrB = D(srgb(textCanvas(['BEZOS NEWS'], { w: 900, pad: 28, frameW: 16, bg: '#2d3a5a', fg: '#ffffff' })));
    const hm = D(new THREE.MeshStandardMaterial({ map: hdrA, roughness: .8 })); const hdr = new THREE.Mesh(D(new THREE.PlaneGeometry(1.8, 1.8 * hdrA.image.height / hdrA.image.width)), hm); hdr.position.set(0, 2.32 + .9 * hdrA.image.height / hdrA.image.width + .04, .2); g.add(hdr);
    const hdrBack = new THREE.Mesh(hdr.geometry, hm); hdrBack.position.copy(hdr.position).setZ(-.3); hdrBack.rotation.y = Math.PI; g.add(hdrBack);
    // the front page: a big board standing on the counter's front edge, blank until the paper says the jar is fine
    const blank = D(srgb(textCanvas(['THE NEWS'], { w: 512, pad: 40, frameW: 10 }))), lie = D(srgb(jarPageCanvas(true))), truth = D(srgb(jarPageCanvas(false)));
    const pm = D(new THREE.MeshBasicMaterial({ map: blank })); const page = new THREE.Mesh(D(new THREE.PlaneGeometry(1.5, 1.5 * 400 / 512)), pm); page.position.set(0, 1.62, .46); page.userData.popT = -1; g.add(page);
    const face = tex => { pm.map = tex; pm.needsUpdate = true; page.userData.popT = 0; page.scale.y = .01; };
    g.userData.sold = () => { hm.map = hdrB; hm.needsUpdate = true; hdr.scale.y = .01; hdrBack.scale.y = .01; g.userData.popT = 0; };
    g.userData.lie = () => face(lie); g.userData.truth = () => face(truth);
    g.userData.step = dt => { if (page.userData.popT >= 0) { page.userData.popT += dt; page.scale.y = Math.max(.01, easeOutBack(clamp(page.userData.popT / .6, 0, 1))); if (page.userData.popT > .6) page.userData.popT = -1; }
      if (g.userData.popT >= 0) { g.userData.popT += dt; const k = Math.max(.01, easeOutBack(clamp(g.userData.popT / .7, 0, 1))); hdr.scale.y = hdrBack.scale.y = k; if (g.userData.popT > .7) g.userData.popT = -1; } };
    g.userData.popT = -1; g.userData.top = V(0, .1, 1.08);
    return g;
  }

  // ---------- THE OPENING ----------
  function start(opts = {}) {
    setup('opening', IDS); onDone = opts.onDone || null; phase = 'buy'; cast = IDS; chosen = null;
    for (const id in HOOK_MORE) { const G = giants[id]; if (!G) continue; G.C = HOOK_MORE[id]; G.g.position.copy(G.C.start); }
    city.setProgress(15, { instant: true }); jar?.userData.setFill(.12);
    for (const k of kinds()) setShared(k, false, { instant: true });
    for (const id of IDS) { giants[id].g.visible = false; giants[id].sack.visible = false; }
    player.visible = true; player.position.copy(START); player.rotation.set(0, yawTo(START, BUY), 0); lastPos.copy(START);   // where she starts; from here on main.js owns her
    makeTag(); setTag('$20');
    buildSharers();
    order = city.lots.map(l => l.i).sort((a, b) => city.lots[b].d2 - city.lots[a].d2);
    hint();
    const testT = +(new URLSearchParams(location.search).get('t') || 0); if (testT > 0) { buy(true); for (const k of kinds()) setShared(k, true, { instant: true }); jarN = 4; jar?.userData.setFill(.36); dropCoin(true); }   // ?t= jumps into the hook (the game then fast-forwards t)
    return P;
  }
  function makeTag() { tag = new THREE.Sprite(D(new THREE.SpriteMaterial({ transparent: true, depthTest: false }))); tag.renderOrder = 12; tag.visible = false; root.add(tag); }
  function setTag(text) { if (!tagTex[text]) { const c = textCanvas([text], { w: 360, pad: 26, frameW: 12, bg: text === '$20' ? '#e9f7dc' : '#fff4c8' }); tagTex[text] = D(srgb(c)); } tag.material.map = tagTex[text]; tag.material.needsUpdate = true; const im = tagTex[text].image; tag.scale.set(.5, .5 * im.height / im.width, 1); tag.visible = true; }
  function holdLego() { legoSet = makeCrate(.12); legoSet.position.set(0, .1, .19); legoSet.scale.setScalar(.001); player.add(legoSet); legoSet.userData.pop = 0; }   // held against her chest
  function target() {
    if (phase === 'buy') return BUY; if (phase === 'jar' || phase === 'look') return COIN;
    if (phase === 'bplay') { if (kind === 'prices') return BUY; if (kind === 'market') return _q.copy(MARKET_AT).add(_s.set(1.1, 0, .3)); if (kind === 'news') return beatX.sawJar ? STAND_AT : COIN; }
    return null;
  }
  const REACH = 1.6;   // F: was 1.3, scaled for the 1.5x player
  function near(tg = target()) { return tg && Math.hypot(player.position.x - tg.x, player.position.z - tg.z) < REACH; }
  function promptText() {
    if (!P.playable) return null; const n = near();
    if (phase === 'buy') return n ? 'act: buy a Lego set' : 'Buy a Lego set at the Lego store';
    if (phase === 'jar') return n ? (jarN < 4 ? 'act: help a gerbil put a coin in' : 'act: put your coin in') : 'Go to the jar';
    if (phase === 'look') return n ? 'act: look in the jar' : 'Look in the jar';
    if (kind === 'prices') return n ? 'act: buy a Lego set' : 'Buy a Lego set at the Lego store';
    if (kind === 'market') return n ? 'act: grow the market' : 'Go to the market crate';
    if (kind === 'news') return !beatX.sawJar ? 'Look at the jar' : n ? 'act: fix the paper' : 'Go to the newspaper stand';
    return null;
  }
  // the button, said for this device: the touch screen's A, or Space on a keyboard (never "Space or A")
  function pressLine() { return document.body?.classList.contains('touch') ? ['o_press_touch', 'Tap the A button, and you walk there.'] : ['o_press_keys', 'Press Space, and you walk there.']; }
  // each playable phase's first line, and its short form for the idle nudge
  function hintLine() {
    if (phase === 'buy') return ['o_buy', 'Buy a Lego set at the Lego store.', 'You have $20.', 'Buy a Lego set at the Lego store. You have twenty dollars.'];
    if (phase === 'jar') return jarN < 4 ? ['o3_jar', 'Everybody puts a little in the jar.', 'Press, and the next gerbil puts a coin in.', 'Everybody puts a little in the jar. Press, and the next gerbil puts a coin in.'] : ['o3_your_turn', 'Now you.', 'Put your coin in.', 'Now you. Put your coin in.'];
    if (phase === 'look') return ['o3_look', 'Look in the jar.', '', 'Look in the jar.'];
    if (kind === 'prices') return ['o_buy', 'Buy a Lego set at the Lego store.', 'You have $20.', 'Buy a Lego set at the Lego store. You have twenty dollars.'];
    if (kind === 'market') return ['p3_market_go', 'Grow the market at the crate.', '', 'Grow the market at the crate.'];
    if (kind === 'news') return ['p3_news_go', 'Look at the real jar.', '', 'Look at the real jar.'];
    return null;
  }
  function hint(again) {
    const L = hintLine(); if (!L) return; const [pid, ptext] = pressLine();
    if (again) { if (clock - lastPress < PACE.press) return; lastPress = clock; caption(L[1], near() ? '' : ptext, 0); if (!near()) play(pid, ptext); return; }
    caption(L[1], L[2], 0); play(L[0], L[3]);
    const ph = phase, jn = jarN; later((LEN[L[0]] ?? 2.5) + .35, () => { if (phase === ph && jarN === jn && !near()) { lastPress = clock; play(pid, ptext); } });
  }
  // the A press in a playable phase: do it here, or set the walk target (main.js walks her there; update() does the step on arrival)
  function act() {
    if (!P.playable) return false;
    if (near()) { doStep(); return true; }
    walking = target().clone(); idleT = 0; return true;
  }
  function doStep() {
    walking = null;
    if (phase === 'buy') buy();
    else if (phase === 'jar') { if (jarN < 4) helpCoin(); else dropCoin(); }
    else if (phase === 'look') emptyJar();
    else if (phase === 'bplay') beatAct();
  }
  function buy(q) {
    phase = 'jar'; phaseT = 0; tag.visible = false; walking = null; holdLego();
    folk.slice(0, 4).forEach((f, k) => { f.state = 'line'; f.k = k; f.speed = 1.8; });   // four townsgerbils line up at the jar
    if (q) { legoSet.scale.setScalar(1); legoSet.userData.pop = 1; return; }
    sfx.play('built'); spawnBurst(scene, _p.copy(player.position).setY(1.2), 0xf2c230, 18); spawnBurst(scene, _p, 0xd7262c, 10);
    say('o_bought', '$20 = one Lego set.', 'Yay!', 3200); once.jarHint = false; phaseT = -(LEN.o_bought + .4);   // the jar hint follows once the cheer is over
  }
  // one townsgerbil's coin: the cinematic (the camera on what it lights), then control comes back
  function helpCoin() {
    const k = jarN, f = folk.find(x => x.state === 'line' && x.k === k), kind0 = kinds()[k] || KINDS[k];
    phase = 'jarcine'; cineT = 0; cineKind = kind0; walking = null; softUntil = clock + JAR_CINE + 2;
    const from = f ? _p.copy(f.g.position).setY(.4) : _p.copy(LINE[0]).setY(.4);
    if (f) { f.state = 'give'; f.hop = .3; f.yawT = yawTo(f.g.position, JAR_POS); f.t = .6; }
    launchCoin(from, _q.copy(JAR_POS).setY(1.3), false, null, .06);   // the jar fills a little per coin (it must not look full before the hook)
    later(CINE_CUT, () => { cutCam = true; });   // the coin is in: cut to the thing it lights
    later(CINE_LIGHT, () => { setShared(kind0, true); sfx.play('right'); spawnBurst(scene, sharedPos(kind0, _p), 0xf6cc4e, 18); say(`o3_lit_${kind0}`, KIND_SAY[kind0] || 'A light comes on!', '', (JAR_CINE - CINE_LIGHT - .3) * 1000); });
  }
  function dropCoin(q) {
    phase = 'hook'; t = 0; tag.visible = false; walking = null; softUntil = clock + 3;
    launchCoin(_p.copy(player.position).setY(.6), _q.copy(JAR_POS).setY(1.3), false, null, .06);
    if (q) return;
    sfx.play('right', { rate: .6 }); spawnBurst(scene, _p.set(JAR_POS.x, 1.6, JAR_POS.z), 0xf6cc4e, 16);
  }
  // control comes back after they leave: she looks in the jar
  function startLook() {
    phase = 'look'; phaseT = 0; walking = null; idleT = 0;
    for (const id in giants) { giants[id].g.visible = false; giants[id].sack.visible = false; }
    if (jar) { jar.position.copy(JAR_POS); jar.rotation.set(0, 0, 0); jar.userData.setFill(0); }
    player.visible = true; player.rotation.x = 0; player.position.copy(LOOK_START); player.rotation.set(0, yawTo(LOOK_START, JAR_POS), 0); lastPos.copy(LOOK_START);   // once, at the phase start
    hint();
  }
  // her A on the empty jar: nothing comes out, then the dark
  function emptyJar() { phase = 'dark'; darkT = 0; darkKind = null; softUntil = clock + 30; sfx.play('oops'); once.darkOut = 0; }
  // a skip in the hook: the short tail. The lights go out, the street falls at once, one line says what happened, then the town.
  function catchUp() {
    phase = 'catchup'; catchT = 0; skipped = true; tip = null;
    for (const id in giants) { giants[id].g.visible = false; giants[id].sack.visible = false; }
    for (const f of folk) f.g.visible = false; for (const s of sharers) s.g.visible = false;
    if (tag) tag.visible = false; player.visible = false; if (jar) { jar.position.copy(JAR_POS); jar.rotation.set(0, 0, 0); jar.userData.setFill(0); }
    for (const k of kinds()) setShared(k, false, { instant: true });
    say('p3_catchup', 'In our story, the billionaires took the money from the jar,', 'and the street fell down.', (LEN.p3_catchup + PACE.catchPad) * 1000);
  }

  // ---------- fair share: two gerbils, one with one coin stack, one with two ----------
  function buildSharers() {
    const cg = D(new THREE.CylinderGeometry(.11, .11, .035, 16)), cm = D(new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: .3, metalness: .6, emissive: 0x6a4a00, emissiveIntensity: .2 }));
    const mk = (spot, stacks, color) => { const g = gerbilFrom({ color, scale: .95 }); g.position.copy(spot); g.rotation.y = yawTo(spot, JAR_POS); g.visible = false; root.add(g);
      const st = stacks.map(([dx, dz]) => { const s = new THREE.Group(); s.position.set(spot.x + dx, 0, spot.z + dz); for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(cg, cm); c.position.y = .02 + i * .038; c.castShadow = true; s.add(c); } s.visible = false; root.add(s); return s; });
      return { g, stacks: st, hop: -1, pop: -1 }; };
    sharers = [mk(V(-1.15, -3.3), [[-.42, -.12]], 0xc98f4e), mk(V(1.25, -3.3), [[.4, -.2], [.62, .14]], 0xe8c9a0)];
  }
  function startShare() { for (const s of sharers) { s.g.visible = true; s.pop = 0; for (const st of s.stacks) st.visible = true; } sfx.play('toast'); }
  function shareDrop(i, si) { const S = sharers[i], st = S?.stacks[si]; if (!st) return; const top = [...st.children].reverse().find(c => c.visible); if (!top) return; top.visible = false; st.updateMatrixWorld(true);
    S.hop = .3; launchCoin(top.getWorldPosition(_p), _q.copy(JAR_POS).setY(1.3), false, null, .03); sfx.play('grab', { rate: 1.2 }); }
  function stepSharers(dt) { for (const S of sharers) { if (!S.g.visible) continue;
    if (S.pop >= 0) { S.pop += dt; const k = Math.max(.001, easeOutBack(clamp(S.pop / .5, 0, 1))); S.g.scale.setScalar(k * .95 / .95); for (const st of S.stacks) st.scale.setScalar(k); if (S.pop > .5) S.pop = -1; }
    if (S.hop >= 0) { S.hop -= dt; const u = 1 - clamp(S.hop / .3, 0, 1); S.g.position.y = Math.sin(u * Math.PI) * .14; if (S.hop < 0) S.g.position.y = 0; }
    animateGerbil(S.g, { speed: 0, airborne: S.hop > .04, now: performance.now(), dt }); } }

  // ---------- THE BEATS ----------
  function beatFor(bossId) {
    lastBoss = bossId || null;
    if (bossId && BEAT_FOR[bossId]) return BEAT_FOR[bossId];
    const n = hub.beatenCount ? hub.beatenCount() : 0; return ['prices', 'market', 'news', 'jar'][n] || null;
  }
  function setTint(on) {   // the flashback's warm tint, a DOM layer under the captions
    if (on && !tint && typeof document !== 'undefined') { tint = document.createElement('div'); tint.id = 'flashbackTint'; tint.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;background:radial-gradient(ellipse at center, rgba(255,196,120,.10) 45%, rgba(110,70,30,.42) 100%);mix-blend-mode:multiply;'; document.body.appendChild(tint); }
    else if (!on && tint) { tint.remove(); tint = null; }
  }
  function setTagAt(x) { B.tag = x; B.end = x + Math.max(3.5, (LEN[tagClip(chosen)] ?? 3.5) + PACE.tagPad); }
  const tagClip = id => `p3_tag3_${id}`;   // (verify) every tag says "In our story": the place and the getaway are made up
  function playBeat(id, opts = {}) {
    if (!BEATS[id]) return false;
    chosen = opts.bossId || lastBoss || null; if (!GIANTS[chosen]) chosen = null;
    if (!chosen) chosen = { prices: 'trump', market: 'ellison', news: 'bezos', jar: 'musk' }[id] || null;
    if (!chosen || (id === 'story' && !STORY[chosen])) return false;   // the story beat is his own: nobody to tell it about, no beat
    setup(id, [chosen]); onDone = opts.onDone || null; phase = 'beat'; cast = [chosen];
    B = { ...BEATS[id] }; B.acted = false;
    if (id === 'story') { B.say2 = B.say1 + LEN[`p3_story_${chosen}_1`] + B.gap; setTagAt(B.say2 + LEN[`p3_story_${chosen}_2`] + B.tagGap); }
    else setTagAt(B.tag);
    shots = [...(id === 'story' ? storyShots() : SHOTS[id])];
    folk.forEach((f, i) => { f.state = 'watching'; f.g.position.copy(WATCH[i % WATCH.length]); f.spot.copy(f.g.position); });
    setTint(true);
    const G = giants[chosen]; G.g.visible = true;
    if (BEAT_SPOT[chosen] && id !== 'story') { const [p, look] = BEAT_SPOT[chosen]; placeGiant(G, p, look); }
    if (B.play != null) {   // a playable beat: Molly in the square from the start, at her spot (once); main moves her once it is playable
      const st = id === 'prices' ? START : id === 'market' ? MARKET_START : NEWS_START;
      player.visible = true; player.rotation.x = 0; player.position.copy(st); player.rotation.set(0, yawTo(st, id === 'prices' ? BUY : id === 'market' ? MARKET_AT : JAR_POS), 0); lastPos.copy(st);
    } else player.visible = false;
    jar?.userData.setFill(id === 'news' ? 0 : id === 'jar' ? .08 : jarFill0);
    if (id === 'prices') setupPrices();
    if (id === 'market') setupMarket();
    if (id === 'news') { stand = makeStand(); stand.position.copy(STAND); stand.rotation.y = Math.PI / 2; root.add(stand); G.g.position.set(4.2, 0, -2.2); G.g.rotation.y = G.yawT = G.faceYaw = -Math.PI / 2; G.g.visible = false; }
    if (id === 'jar') setupJarBeat();
    if (id === 'story') { G.g.visible = false; G.sT = G.s = 1.4; setupStory(chosen); }
    return true;
  }
  function startPlay() { phase = 'bplay'; phaseT = 0; walking = null; idleT = 0; hint(); }
  function beatAct() {
    if (kind === 'news' && !beatX.sawJar) return;   // her A before she has looked: main walks her (act set the target)
    B.acted = true; B.actT = t; phase = 'bcine'; softUntil = clock + 4;
    if (kind === 'prices') {
      tag.visible = false; signs.lego.flipAt = t + .2; giants.trump.laugh = [t + 1.0, t + 3.6];
      shots.push({ at: t, pos: [-5.0, 3.5, -3.8], look: [-7.8, 2.2, 2.4], blend: 1.2 });   // (verify) the sign, the counter's three outlines and Molly with her box in one frame, above the bar
      setTagAt(t + 1.4 + LEN.p3_prices_trump + 1.6);
    }
    if (kind === 'market') {
      B.cardAt = t + B.say + LEN.p3_market + .6; setTagAt(B.cardAt + LEN.p3_fair_decide + 1.0);
      // (verify) one wide shot holds both ends, the gold houses on the hill (right) and Gerbil Street (left), while the coins go one
      // at a time, so seven and three can be counted; the burst over Molly is gone (they pop out on the crate's far side)
      shots.push({ at: t, pos: [1.2, 2.6, .2], look: [-2.4, .7, -2.6], blend: .8 },
        { at: t + B.roll - .2, pos: [10.7, 15, -21.9], look: [-13, 1.5, -3.0], blend: 1.6 });   // across the hill-to-street line: the hill on one side, the street on the other
      sfx.play('built'); spawnBurst(scene, _p.copy(MARKET_AT).setY(.8), 0xf2c230, 20); beatX.crate.userData.pop = 0;
      beatX.coins.forEach((c, i) => { c.t0 = t + .1 + i * .07; });
    }
    if (kind === 'news') {
      stand.userData.truth(); sfx.play('right'); spawnBurst(scene, _p.copy(STAND).setY(2.2), 0xffffff, 16);
      shots.push({ at: t, pos: [-.6, 2.4, -4.4], look: [-3.8, 1.5, -6.0], blend: 1.0 });
      say('p3_news_fixed', 'Now the paper shows the real jar.', '', (LEN.p3_news_fixed + 1) * 1000); setTagAt(t + LEN.p3_news_fixed + 1.4);
    }
  }
  // Trump: the $20 tag over her head, her one box in her arms, a little counter with three box outlines (hidden until the flip)
  function setupPrices() {
    makeTag(); setTag('$20'); holdLego();
    const wood = D(new THREE.MeshStandardMaterial({ color: 0xa8743f, roughness: .85 })); const top = new THREE.Mesh(D(new THREE.BoxGeometry(2.5, .08, .7)), wood); top.position.set(COUNTER.x, .82, COUNTER.z); top.castShadow = top.receiveShadow = true; root.add(top);
    for (const sx of [-1, 1]) { const leg = new THREE.Mesh(D(new THREE.BoxGeometry(.08, .82, .6)), wood); leg.position.set(COUNTER.x + sx * 1.15, .41, COUNTER.z); root.add(leg); }
    const box = makeCrate(.46); const bb = new THREE.Box3().setFromObject(box); const sz = bb.getSize(new THREE.Vector3()); disposeOwnGeo(box);
    // (verify) each slot is a thick dashed ink outline drawn on a card that faces the camera (the 1 px cream line edges were faint dashes)
    const oc = document.createElement('canvas'); oc.width = 256; oc.height = Math.round(256 * Math.max(.5, sz.y / Math.max(.01, sz.x))); const og = oc.getContext('2d');
    og.fillStyle = 'rgba(251,240,212,.55)'; og.beginPath(); og.roundRect(12, 12, oc.width - 24, oc.height - 24, 22); og.fill(); og.setLineDash([30, 18]); og.lineWidth = 14; og.strokeStyle = '#3b2516'; og.lineCap = 'round'; og.stroke();
    const om = D(new THREE.SpriteMaterial({ map: D(srgb(oc)), transparent: true, depthWrite: false })), ow = sz.x * 1.2, oh = ow * oc.height / oc.width;
    beatX.outlines = [-.8, 0, .8].map(dx => { const l = new THREE.Sprite(om); l.position.set(COUNTER.x + dx, .86 + oh / 2, COUNTER.z); l.userData.w = ow; l.userData.h = oh; l.visible = false; l.scale.set(.001, .001, 1); l.renderOrder = 3; root.add(l); return l; });
    beatX.boxH = sz.y;
  }
  // Ellison: the market crate, ten coins inside, three gold houses on the lookout mound
  function setupMarket() {
    const crate = makeCrate(.6); crate.position.copy(MARKET_AT); root.add(crate); crate.userData.pop = -1; beatX.crate = crate;
    beatX.sign = labelSprite(['THE MARKET'], _p.copy(MARKET_AT).setY(1.45), 1.3);
    const gold = D(new THREE.MeshStandardMaterial({ color: 0xffd447, roughness: .4, metalness: .2, emissive: 0xb07a00, emissiveIntensity: .55 })), roofM = D(new THREE.MeshStandardMaterial({ color: 0xd7262c, roughness: .6 }));
    const body = D(new THREE.BoxGeometry(3.0, 2.4, 2.7)), roof = D(new THREE.ConeGeometry(2.4, 1.6, 4)); roof.rotateY(Math.PI / 4);
    const hl = hillTop(); beatX.houses = [[-3.4, .6], [0, -2.2], [3.4, .3]].map(([dx, dz]) => { const g = new THREE.Group(); const b = new THREE.Mesh(body, gold); b.position.y = 1.2; const rf = new THREE.Mesh(roof, roofM); rf.position.y = 3.2; b.castShadow = rf.castShadow = true; g.add(b, rf); g.position.set(hl.x + dx, hl.y - .25, hl.z + dz); g.rotation.y = .5; root.add(g); return g; });
    // the coins: big, upright, they roll. Seven up the hill to the houses (by the square's west edge), three down Gerbil Street
    const cg = D(new THREE.CylinderGeometry(.55, .55, .12, 22)); cg.rotateZ(Math.PI / 2); const cm = D(new THREE.MeshStandardMaterial({ color: 0xffd447, roughness: .3, metalness: .3, emissive: 0xb07a00, emissiveIntensity: .6 }));
    beatX.coins = []; for (let i = 0; i < 10; i++) { const up = i < 7; const g = new THREE.Group(); const m = new THREE.Mesh(cg, cm); m.position.y = .55; m.castShadow = true; g.add(m); g.visible = false; g.position.copy(MARKET_AT); root.add(g);
      const pop = V(MARKET_AT.x - .9 + Math.cos(i * 2.4) * .45, MARKET_AT.z + Math.sin(i * 2.4) * .8);   // the crate's far side from Molly
      const h = beatX.houses[up ? i % 3 : 0].position, pts = up ? [pop, V(-10.5, -1.2), V(h.x + (i % 2 ? .9 : -.9) * 1.6, h.z + 2.2 + (i >> 1) * .3, hl.y - .25)] : [pop, V(-1.9, 8.5), V(-1.2 + (i - 7) * 1.2, 11 + (i - 7) * 2.2)];
      beatX.coins.push({ g, m, up, pts, t0: Infinity, dur: up ? 3.4 : 2.6, delay: up ? i * .5 : 3.9 + (i - 7) * .55, landed: false }); }   // one at a time: seven up, then three down
  }
  function stepMarket(dt) {
    const X = beatX; if (!X.crate) return;
    if (X.crate.userData.pop >= 0) { X.crate.userData.pop += dt; const u = X.crate.userData.pop; X.crate.scale.set(1 + Math.sin(Math.min(1, u / .5) * Math.PI) * .25, 1 - Math.sin(Math.min(1, u / .5) * Math.PI) * .15, 1 + Math.sin(Math.min(1, u / .5) * Math.PI) * .25); if (u > .5) { X.crate.userData.pop = -1; X.crate.scale.setScalar(1); } }
    for (const c of X.coins) { if (t < c.t0) continue; c.g.visible = true; const u = t - c.t0;
      if (u < .6) { const k = u / .6; c.g.position.lerpVectors(MARKET_AT, c.pts[0], k); c.g.position.y = .6 + Math.sin(k * Math.PI) * 1.4; c.m.rotation.x += dt * 12; continue; }
      const rollStart = B.actT + B.roll; if (t < rollStart) { c.g.position.copy(c.pts[0]); continue; }
      const k = clamp((t - rollStart - c.delay) / c.dur, 0, 1), e = smooth(k);
      const a = c.pts[0], b = c.pts[1], d = c.pts[2]; const L1 = a.distanceTo(b), L2 = b.distanceTo(d), s = e * (L1 + L2);
      if (s < L1) c.g.position.lerpVectors(a, b, s / L1); else c.g.position.lerpVectors(b, d, (s - L1) / Math.max(.01, L2));
      if (k < 1) { _s.copy(s < L1 ? b : d).sub(s < L1 ? a : b); c.g.rotation.y = Math.atan2(_s.x, _s.z); if (k > 0) c.m.rotation.x += dt * (L1 + L2) / c.dur / .4; }
      else if (!c.landed) { c.landed = true; sfx.play('deliver', { step: c.up ? 3 : 1, volume: .6 }); spawnBurst(scene, _p.copy(c.g.position).setY(c.g.position.y + .5), 0xf2c230, 6); } }
    if (B.acted && at('marketSay', B.actT + B.say)) say('p3_market', 'This part is true: when the market grew, the richest gerbils got most of the new coins.', 'Seven went up the hill. Three went down the street.', (LEN.p3_market + .6) * 1000);
    if (B.acted && at('fairCard', B.cardAt)) {
      const decide = () => { if (!cardOpen) return; cardOpen = false; ctx.closeCard?.(); say('p3_fair_decide', 'You get to decide.', 'Lots of grown-ups argue about it.', (LEN.p3_fair_decide + .8) * 1000); };
      if (!quiet && ctx.card) { cardOpen = true; ctx.card('Is that fair?', '<p>Seven coins went up the hill to the big houses. Three went down the street.</p>', [{ label: '👍 Fair', on: decide }, { label: '👎 Not fair', on: decide }]); }
      else say('p3_fair_decide', 'You get to decide.', 'Lots of grown-ups argue about it.', (LEN.p3_fair_decide + .8) * 1000);
    }
  }
  // Musk: the teacher (a townsgerbil with a badge) walks to the jar and drops her coin; he stands over it and opens his hand
  function setupJarBeat() {
    // (verify) drawn at Molly's size so she reads as the teacher, not a speck under a floating word; the badge sits just over her
    const w = gerbilFrom({ color: 0xe8c9a0, scale: 1.45 }); w.position.set(-2.6, 0, -2.6); w.rotation.y = 2.4; root.add(w);
    beatX.teacher = { g: w, state: 'wait', yaw: 2.4 }; beatX.badge = labelSprite(['teacher'], V(-2.6, -2.6, TEACH_TAG_Y), .6, { bg: '#e9f7dc' });
    // the $0 by the jar's lid, beside his hand, never over his face
    beatX.zero = labelSprite(['$0'], _p.copy(JAR_POS).setY(1.55).add(_s.set(.62, 0, .15)), .55, { bg: '#fff4c8', fg: '#b3261e' }); beatX.zero.visible = false;
    const G = giants.musk; G.g.position.set(5.0, 0, -2.6); G.g.rotation.y = G.yawT = G.faceYaw = -Math.PI / 2;
  }
  function stepJarBeat(dt) {
    const X = beatX, W = X.teacher, G = giants.musk; if (!W) return;
    if (at('teacherGo', B.teacher)) W.state = 'go';
    let speed = 0; if (W.state === 'go') { _p.set(-1.05, 0, -5.0).sub(W.g.position); const d = _p.length(); if (d > .06) { speed = 1.4; W.g.position.addScaledVector(_p.normalize(), Math.min(d, speed * dt)); W.yaw = Math.atan2(_p.x, _p.z); } else { W.state = 'jar'; W.yaw = yawTo(W.g.position, JAR_POS); } }
    if (at('clink', B.clink)) { launchCoin(_p.copy(W.g.position).setY(.5), _q.copy(JAR_POS).setY(1.3), false, null, .05); W.hop = .3; }
    if (W.hop >= 0) { W.hop -= dt; W.g.position.y = Math.sin((1 - clamp(W.hop / .3, 0, 1)) * Math.PI) * .12; if (W.hop < 0) W.g.position.y = 0; }
    W.g.rotation.y += Math.atan2(Math.sin(W.yaw - W.g.rotation.y), Math.cos(W.yaw - W.g.rotation.y)) * Math.min(1, dt * 8); X.badge.position.set(W.g.position.x, TEACH_TAG_Y + W.g.position.y, W.g.position.z);
    animateGerbil(W.g, { speed: speed * 2.2, airborne: (W.hop ?? -1) > .04, now: performance.now(), dt });
    if (at('muskGo', B.musk)) { goTo(G, [V(2.8, -6.3), BEAT_SPOT.musk[0]], GIANT_WALK); G.faceYaw = yawTo(BEAT_SPOT.musk[0], BEAT_SPOT.musk[1]); }
    if (at('hand', B.hand)) { X.zero.visible = true; X.zero.userData.popT = 0; sfx.play('oops'); G.laugh = [B.hand + .3, B.hand + 3.5]; spawnBurst(scene, _p.copy(JAR_POS).setY(1.9), 0xcfc6b8, 6); }
    if (X.zero.visible && X.zero.userData.popT >= 0) { X.zero.userData.popT += dt; const k = Math.max(.001, easeOutBack(clamp(X.zero.userData.popT / .6, 0, 1))); X.zero.scale.set(X.zero.userData.w * k, X.zero.userData.h * k, 1); }
    if (at('muskSay', B.say)) say('p3_jar_musk', 'This part is true. One year, Elon Musk put in zero dollars.', 'The rules let him.', (B.tag - B.say - .2) * 1000);
  }
  // Bezos: he walks to the stand and buys it; the true line; then the paper shows the full jar (our story); then control
  function stepNews(dt) {
    const G = giants.bezos; if (!G || !stand) return;
    if (at('bezWalk', B.walk)) { G.g.visible = true; goTo(G, [V(1.9, -7.4), BEAT_SPOT.bezos[0]], GIANT_WALK); G.faceYaw = yawTo(BEAT_SPOT.bezos[0], V(0, -4.0)); }
    if (at('bezBuy', B.buy)) buyProp(G, stand);
    if (at('bez1', B.say1)) say('p3_news_bezos_1', 'This part is true: Jeff Bezos bought a newspaper.', '', (B.lie - B.say1 - .2) * 1000);
    if (at('bezLie', B.lie)) { stand.userData.lie(); sfx.play('wrong'); G.laugh = [B.lie + .4, B.lie + 3.6]; say('p3_news_bezos_2', 'In our story, his paper said the jar was fine.', '', (B.play - B.lie - .2) * 1000); }
    stand.userData.step(dt);
  }
  // the tag: the picked billionaire alone, walking up the road with his sack
  function startTag() {
    setTint(false); endStory(); if (cardOpen) { cardOpen = false; ctx.closeCard?.(); }
    if (beatX.zero) beatX.zero.visible = false;
    const G = giants[chosen]; if (!G) return; tagG = G;
    G.gone = false; G.g.visible = true; G.laugh = []; G.g.position.set(1.0, 0, .2); G.g.rotation.y = G.yawT = G.faceYaw = Math.PI / 2; G.sT = G.s = 2.4;
    goTo(G, [V(60, .2)], GIANT_WALK); placeSack(G, 0);
    shots.push({ at: t, pos: [-2.6, 2.3, -3.6], look: [9, 1.5, .3], blend: .01 });   // the tag: looking up the road at his back
    for (const f of folk) if (f.g.position.z > -1.5 && f.g.position.z < 1.5 && f.g.position.x > 0) f.g.visible = false;   // nobody standing on the road in front of him
    const nm = shownName(chosen), place = PLACES[chosen] || 'his tower', fam = chosen === 'walton';   // "Rob Walton and family": they, them
    say(tagClip(chosen), `In our story, ${nm} took ${fam ? 'their' : 'his'} money to ${place}.`, fam ? 'Go get them!' : 'Go get him!', (B.end - B.tag) * 1000);
  }
  // a skip in a beat: run the events up to the playable part (or the tag) quietly, so the scene is where it would be
  function jumpToTag() {
    skipped = true; const now = performance.now();
    const stepTo = end => { quiet = true; try { while (t < end - 1e-4 && active) { const d = Math.min(1 / 30, end - 1e-4 - t); t += d; stepBeat(d); stepGiants(d); stepFolk(d, now); stepCoins(d); } } finally { quiet = false; } };
    if (B.play != null && !B.acted) { stepTo(B.play); if (phase === 'beat') startPlay(); else if (phase === 'bplay') hint(); return; }
    if (cardOpen) { cardOpen = false; ctx.closeCard?.(); }
    stepTo(B.tag);
  }

  // ---------- per frame ----------
  function update(dt, now = performance.now()) {
    if (!active || finished) return; dt = clamp(dt || 0, 0, .1); clock += dt;
    for (let i = 0; i < pend.length; i++) if (clock >= pend[i].at) { const f = pend[i].fn; pend.splice(i--, 1); f(); }
    if (!active) return;
    if (P.playable) { softUntil = clock + 2; stepPlay(dt); }
    if (kind === 'opening') stepOpening(dt, now); else { if (!cardOpen) t += dt; stepBeat(dt); }
    if (!active) return;   // the hook can finish mid-frame
    stepGiants(dt); stepFolk(dt, now); stepCoins(dt); stepProps(dt); stepSharers(dt);
    if (legoSet && legoSet.userData.pop < 1) { legoSet.userData.pop = Math.min(1, legoSet.userData.pop + dt / .35); legoSet.scale.setScalar(Math.max(.001, easeOutBack(legoSet.userData.pop))); }
    if (tag && tag.visible) tag.position.set(player.position.x, player.position.y + .58 + Math.sin(now / 300) * .02, player.position.z);   // just above her head
    if (kind !== 'opening' && t >= B.end) finish();
  }
  // a playable phase: main.js walks, turns and animates her (toward walkTarget when one is set); here: arrival and prompts
  function stepPlay(dt) {
    phaseT += dt;
    if (kind === 'news' && !beatX.sawJar && near(COIN)) { beatX.sawJar = true; walking = null; sfx.play('oops'); say('p3_news_look', 'The real jar is empty!', '', (LEN.p3_news_look + .6) * 1000); }
    if (walking && near()) doStep();
    if (phase === 'jar' && phaseT >= 0 && !once.jarHint) { once.jarHint = true; hint(); }
    const moved = Math.hypot(player.position.x - lastPos.x, player.position.z - lastPos.z) > .005; lastPos.copy(player.position);
    if (P.playable && !walking && !moved && !near()) { idleT += dt; if (idleT > PACE.idle) { idleT = 0; hint(true); } } else idleT = 0;
  }
  function stepOpening(dt, now) {
    if (phase === 'jarcine') { cineT += dt; if (cineT >= JAR_CINE) { jarN++; phase = 'jar'; phaseT = 0; walking = null; idleT = 0; cutPlay = true; if (jarN === 4) hint(); else lastPress = clock; } }
    else if (phase === 'hook') { t += dt; stepHook(dt); }
    else if (phase === 'dark') stepDark(dt);
    else if (phase === 'catchup') { catchT += dt; const due = Math.min(order.length, Math.floor(catchT / .12) + 1); while (collapsed < due) city.collapse(order[collapsed++]); if (catchT >= LEN.p3_catchup + PACE.catchPad) finish(true); }
  }
  // the hook: taxes, fair share, the billionaires walk in, tip the jar into their sacks and walk off; then control comes back
  function stepHook(dt) {
    if (at('taxes', H.taxes)) say('o3_taxes', 'This jar has a grown-up name: taxes.', '', (H.share - H.taxes - .1) * 1000);
    if (at('share', H.share)) { startShare(); player.visible = false; if (tag) tag.visible = false; for (const f of folk) if (f.state !== 'flee' && Math.hypot(f.g.position.x - JAR_POS.x, f.g.position.z - (JAR_POS.z + 2)) < 2.4) { f.state = 'watch'; f.spot.copy(WATCH[f.i % WATCH.length]); } }   // the two sharers alone with the jar: Molly steps out of the shot (she was a big blur in front of it)
    if (at('share1', H.share + .3)) say('o3_share_1', 'In our story, everybody puts in a piece of what they have.', '', (H.share2 - H.share - .4) * 1000);
    if (at('share2', H.share2)) say('o3_share_2', 'One stack, one coin.', 'Two stacks, two coins.', (H.giants - H.share2 - .4) * 1000);
    if (at('shareA', H.share2 + .5)) shareDrop(0, 0);
    if (at('shareB1', H.share2 + 2.1)) shareDrop(1, 0);
    if (at('shareB2', H.share2 + 2.6)) shareDrop(1, 1);
    if (at('giants', H.giants)) { sfx.music?.start?.('hook');   // a quiet minor track if sfx has one; otherwise start() just fades the market loop out
      say('p3_giants_story', 'Then, in our story, the billionaires came down the road.', '', 3600); /* (verify) the hook is fiction about real people: the label is spoken */ for (const s of sharers) { s.g.visible = false; for (const st of s.stacks) st.visible = false; }
      for (const id of IDS) { const G = giants[id]; G.g.visible = true; if (id !== 'ellison' && !HOOK_MORE[id]) walkInJar(G); } player.visible = false; if (tag) tag.visible = false; }
    if (at('ellisonIn', H.giants + 1.4)) walkInJar(giants.ellison);
    for (const id in HOOK_MORE) if (giants[id] && at('in_' + id, H.giants + HOOK_MORE[id].at)) walkInJar(giants[id]);   // the other four follow
    if (at('tip', H.tip)) { const M = giants.musk; tip = { at: H.tip, len: PACE.tipLen, M }; for (const id of IDS) giants[id].laugh = [H.tip + 1.0, H.tip + PACE.tipLen]; }
    if (between(H.tip + 1.2, H.tip + 4.6)) { const n = Math.floor((t - H.tip - 1.2) / .28); while ((once.coinOut || 0) <= n && (once.coinOut || 0) < 14) { const k = once.coinOut || 0; once.coinOut = k + 1; const G = giants[['trump', 'bezos', 'ellison', 'bloomberg', 'walton', 'zuckerberg', 'page'][k % 7]] || giants.trump; launchCoin(_p.copy(JAR_POS).setY(1.45), sackTop(G, _q), true, G.id); } }
    if (at('leave', H.leave)) say('o_leave', 'They took all the money up the road.', '', 4000);
    if (at('leaveGo', H.leave + PACE.go)) walkOff();
    if (at('flee', H.leave + PACE.flee)) flee();
    if (at('look', H.look)) startLook();
  }
  function walkInJar(G) { const C = G.C; G.g.visible = true; goTo(G, [V(4.5, C.start.z), ...C.jar], HOOK_MORE[G.id] ? GIANT_WALK * 1.3 : GIANT_WALK); G.faceYaw = yawTo(C.jar[C.jar.length - 1], JAR_POS); }
  // the dark: the jar shakes and nothing comes out, the lights go out one at a time, the street falls, the call
  function stepDark(dt) {
    darkT += dt; const K = kinds();
    if (jar) jar.rotation.z = darkT < .9 ? Math.sin(darkT * 30) * .12 * (1 - darkT / .9) : 0;
    if (darkT >= DARK.empty && !once.empty) { once.empty = true; say('o3_empty', 'The jar is empty.', '', (DARK.out0 - DARK.empty + .6) * 1000); }
    while ((once.darkOut || 0) < K.length && darkT >= DARK.out0 + (once.darkOut || 0) * DARK.gap) { const k = K[once.darkOut]; once.darkOut = (once.darkOut || 0) + 1; darkKind = k; setShared(k, false); sfx.play('wrong', { rate: .8, volume: .6 }); }
    if (darkT >= DARK.fall) { const due = Math.min(order.length, Math.floor((darkT - DARK.fall) / PACE.lotGap) + 1); while (collapsed < due) city.collapse(order[collapsed++]); if (!once.fallSay) { once.fallSay = true; say('o_fall', 'With the jar empty, the street fell down.', '', 4500); } }
    if (darkT >= DARK.call && !once.call) { once.call = true; sfx.music?.start?.('market'); player.visible = true; caption(`${name()}, go get it back.`, 'Follow the arrows up the road.', (DARK.end - DARK.call) * 1000); play(`o_call_${ctx.playerId?.() === 'william' ? 'william' : 'alex'}`, `${name()}, go get it back. Follow the arrows up the road.`); }
    if (darkT >= DARK.end) finish(false);
  }
  function stepBeat(dt) {
    if (at('before', B.before)) say('p_before', 'Before, at the market...', '', (LEN.p_before + 1.4) * 1000);
    if (B.play != null && !B.acted && phase === 'beat' && at('play', B.play)) startPlay();
    if (kind === 'prices' && B.acted) {
      const X = beatX;
      if (at('outlines', B.actT + 1.3)) { for (const l of X.outlines) l.visible = true; sfx.play('toast'); }
      const ok = clamp((t - B.actT - 1.3) / .5, 0, 1); for (const l of X.outlines) if (l.visible) { const k = Math.max(.001, easeOutBack(ok)); l.scale.set(l.userData.w * k, l.userData.h * k, 1); }
      if (at('pricesSay', B.actT + 1.4)) say('p3_prices_trump', 'In our story, Trump made things cost more.', 'Your twenty dollars buys less now.', (LEN.p3_prices_trump + 1.2) * 1000);
      if (at('boxFly', B.actT + 2.2) && legoSet) { legoSet.updateMatrixWorld(true); const from = legoSet.getWorldPosition(new THREE.Vector3()); player.remove(legoSet); disposeOwnGeo(legoSet); legoSet = null;
        const b = makeCrate(.46); b.position.copy(from); b.scale.setScalar(.26); root.add(b); X.fly = { g: b, from, to: X.outlines[0].position.clone().setY(.86), t: 0 }; }   // into the first outline; two stay empty
      if (X.fly && X.fly.t < 1) { X.fly.t = Math.min(1, X.fly.t + dt / .9); const k = smooth(X.fly.t); X.fly.g.position.lerpVectors(X.fly.from, X.fly.to, k); X.fly.g.position.y += Math.sin(k * Math.PI) * .9; X.fly.g.scale.setScalar(lerp(.26, 1, k)); if (X.fly.t >= 1) { sfx.play('deliver', { step: 2 }); spawnBurst(scene, _p.copy(X.fly.to).setY(1.2), 0xf2c230, 10); } }
    }
    if (kind === 'market') stepMarket(dt);
    if (kind === 'news') stepNews(dt);
    if (kind === 'jar') stepJarBeat(dt);
    if (kind === 'story') stepStory(dt);
    if (chosen && at('tag', B.tag)) startTag();
  }
  // ---------- the story beat: one billionaire alone in the square, his true story in two number-free lines, one event each ----------
  let story = null;
  function storyShots() { return [
    { at: 0, pos: [-6.8, 4.2, -2.4], look: [4.5, 1.0, -.6], blend: .01 },                         // the square from the west, the road behind it: he walks in toward us
    { at: BEATS.story.say1 - 1.4, pos: [-4.4, 2.7, -2.4], look: [1.4, 1.5, -1.0], blend: 1.8 },   // closer: him and what happens around him
  ]; }
  // a sprite that pops up at P.at (and, with P.fly, flies into his sack)
  function popSprite(lines, pos, w, o = {}) {
    const c = o.canvas || textCanvas(lines, { w: 640, pad: 30, ...(o.tc || {}) }); const sp = new THREE.Sprite(D(new THREE.SpriteMaterial({ map: D(srgb(c)), transparent: true })));
    sp.userData.w = w; sp.userData.h = w * c.height / c.width; sp.position.copy(pos); sp.scale.set(.001, .001, 1); sp.visible = false; root.add(sp);
    const S = { s: sp, at: Infinity, home: pos.clone(), fly: null }; story.props.push(S); return S;
  }
  function setupStory(id) {
    story = { id, props: [], worker: null, qs: [], done: false }; const G = giants[id];
    G.g.position.copy(GIANTS[id].start); G.g.rotation.y = G.yawT = G.faceYaw = -Math.PI / 2; G.path = [];   // waits up the road until B.walk
    const A = STORY_AT;
    story.name = popSprite([shownName(id)], V(A.x - .3, A.z + 1.2, 3.5), 2.0, { tc: { bg: '#fbf0d4' } });   // his name over him once he stops (Walton's: "Rob Walton and family")
    if (id === 'bloomberg') {   // VOTE signs pop up all over the square, a coin from his sack to each; then one small flag for the one place he won
      story.signs = [[-1.4, -2.9], [-1.2, 1.6], [1.0, -3.8], [4.4, -3.3], [4.8, 1.4], [.4, 2.6], [-3.2, -1.0], [6.4, -.6]].map(([x, z]) => popSprite(['VOTE', 'BLOOMBERG'], V(x, z, 1.7), 1.0, { tc: { bg: '#f4f1e8', fg: '#1d3f8a' } }));
      story.flag = popSprite(['Some little islands', 'the one place he won'], V(A.x - .6, A.z + 1.7, 2.3), 1.7, { tc: { bg: '#e9f7dc' } }); }
    if (id === 'walton') {   // the store's name over him and his sack grows; then a worker from the store walks to the jar for help
      story.store = popSprite(['Walmart', 'his family owns it'], V(A.x, A.z, 3.4), 1.8, { tc: { bg: '#dbe9fb', fg: '#0b3d91' } });
      const w = gerbilFrom({ color: 0xc98f4e, scale: .9 }); w.position.set(-2.6, 0, -2.6); w.rotation.y = .6; root.add(w); story.worker = { g: w, state: 'wait', yaw: .6 };
      story.badge = popSprite(['works at the store'], V(-2.6, -2.6, 1.25), 1.2, { tc: { bg: '#dbe9fb', fg: '#0b3d91' } });
      story.help = popSprite(['help to buy food'], V(.9, -4.2, 2.1), 1.4, { tc: { bg: '#e9f7dc' } }); }
    if (id === 'zuckerberg') {   // two made-up apps pop up in the square (no names, no prices); then each flies into his sack
      story.apps = [['seed', '#3a7bd5', [-.3, -3.3]], ['paw', '#d7262c', [-.3, 1.5]]].map(([k, bg, [x, z]]) => ({ tile: popSprite(null, V(x, z, 1.5), 1.0, { canvas: appTile(k, bg) }) })); }
    if (id === 'page') {   // he pays the phones a stream of coins; then everybody's questions fly to him
      story.phone = popSprite(null, V(-.4, -3.6, 1.6), .8, { canvas: phoneCanvas() });
      story.google = popSprite(['Google', 'almost all the searching'], V(A.x, A.z, 4.0), 1.9, { tc: { bg: '#fbf0d4', fg: '#3b2516' } });
      story.qs = folk.filter(f => f.g.visible).slice(0, 10).map(f => popSprite(['?'], V(f.g.position.x, f.g.position.z, 1.4), .5, { tc: { bg: '#ffffff' } })); }
  }
  function flyToSack(S, at0, dur = 1.0) { S.fly = { at: at0, dur, done: false }; if (S.at > at0) S.at = at0 - .01; }
  function stepStory(dt) {
    const S = story; if (!S || S.done) return; const G = giants[S.id], st = STORY[S.id], L1 = B.say1, L2 = B.say2, e1 = L1 + st.e1, e2 = L2 + st.e2;
    if (at('storyWalk', B.walk)) { G.g.visible = true; goTo(G, [STORY_AT], GIANT_WALK); G.faceYaw = -Math.PI / 2; }
    if (at('storyName', L1 - .8)) S.name.at = L1 - .8;
    if (at('story1', L1)) { caption('This part is true.', st.lines[0].replace(/^This part is true\. /, ''), (L2 - L1 - .2) * 1000); play(`p3_story_${S.id}_1`, st.lines[0]); }
    if (at('story2', L2)) { const src = boss(S.id)?.story?.source; caption(st.lines[1], src ? `Source: ${String(src.title).split(':')[0]}` : '', (B.tag - L2 - .2) * 1000); play(`p3_story_${S.id}_2`, st.lines[1]); }
    if (S.id === 'bloomberg') {
      S.signs.forEach((Q, i) => { const tt = e1 + i * .6; if (at('sign' + i, tt)) { Q.at = tt + .5; launchCoin(sackTop(G, _p), _q.copy(Q.home), true, null); G.sT = Math.max(.7, G.sT - .07); } });
      if (at('flag', e2)) { S.flag.at = e2; sfx?.play?.('right'); }
      if (at('bLaugh', e1)) G.laugh = [e1, e1 + 5]; }
    if (S.id === 'walton') {
      if (at('store', e1)) { S.store.at = e1; G.sT = 2.6; G.laugh = [e1 + .4, e1 + 3.4]; sfx?.play?.('count'); spawnBurst?.(scene, sackTop(G, _p), 0xf2c230, 14); }
      const W = S.worker; if (at('workerGo', e2)) { W.state = 'go'; S.badge.at = e2; }
      let speed = 0; if (W.state === 'go') { _p.set(.9, 0, -4.5).sub(W.g.position); const d = _p.length(); if (d > .06) { speed = 1.5; W.g.position.addScaledVector(_p.normalize(), Math.min(d, speed * dt)); W.yaw = Math.atan2(_p.x, _p.z); } else { W.state = 'jar'; W.at = t; W.yaw = Math.atan2(JAR_POS.x - W.g.position.x, JAR_POS.z - W.g.position.z); } }
      if (W.state === 'jar') { for (let i = 0; i < 3; i++) if (at('help' + i, W.at + .3 + i * .45)) { launchCoin(_p.copy(JAR_POS).setY(1.45), _q.copy(W.g.position).setY(.5), true, null); if (jar) jar.userData.setFill(Math.max(.1, jar.userData.fill() - .05)); }
        if (at('helpSign', W.at + 1.6)) S.help.at = W.at + 1.6; }
      W.g.rotation.y += Math.atan2(Math.sin(W.yaw - W.g.rotation.y), Math.cos(W.yaw - W.g.rotation.y)) * Math.min(1, dt * 8); S.badge.home.set(W.g.position.x, 1.25, W.g.position.z);
      animateGerbil(W.g, { speed: speed * 2.2, airborne: false, now: performance.now(), dt }); }
    if (S.id === 'zuckerberg') {
      S.apps.forEach((a, i) => { if (at('app' + i, e1 + i * .9)) { a.tile.at = e1 + i * .9; sfx?.play?.('toast'); } });
      [e2, L2 + st.e2b].forEach((tt, i) => { if (at('buy' + i, tt)) { flyToSack(S.apps[i].tile, tt + .4, 1.1); G.laugh = [tt + .6, tt + 2.0]; sfx?.play?.('grab'); } }); }
    if (S.id === 'page') {
      if (at('phone', e1)) { S.phone.at = e1; sfx?.play?.('toast'); }
      for (let i = 0; i < 8; i++) if (at('pay' + i, e1 + 1.3 + i * .3)) { launchCoin(sackTop(G, _p), _q.copy(S.phone.home).setY(1.2), true, null); G.sT = Math.max(.9, G.sT - .04); }
      S.qs.forEach((Q, i) => { if (at('q' + i, e2 + i * .08)) Q.at = e2 + i * .08; if (at('qf' + i, e2 + 1.4 + i * .3)) flyToSack(Q, e2 + 1.4 + i * .3, .9); });
      const gAt = e2 + 1.4 + S.qs.length * .3 + .4; if (at('google', gAt)) { S.google.at = gAt; G.laugh = [gAt, gAt + 2.5]; } }
    // every prop: pop in, bob, or fly into his sack
    for (const Q of S.props) { if (t < Q.at) continue; const s = Q.s; if (Q.fly?.done) continue; s.visible = true;
      const k = Math.max(.001, easeOutBack(clamp((t - Q.at) / .6, 0, 1))); let sc = 1;
      if (Q.fly && t >= Q.fly.at) { const u = clamp((t - Q.fly.at) / Q.fly.dur, 0, 1); sackTop(G, _q); s.position.lerpVectors(Q.home, _q, smooth(u)); s.position.y += Math.sin(u * Math.PI) * 1.2; sc = Math.max(.001, 1 - u * .8);
        if (u >= 1) { Q.fly.done = true; s.visible = false; G.sT = Math.min(3, G.sT + .25); sfx?.play?.('grab', { rate: 1.2, volume: .5 }); spawnBurst?.(scene, _q, 0xf2c230, 8); } }
      else s.position.set(Q.home.x, Q.home.y + Math.sin(t * 2 + Q.home.x) * .05, Q.home.z);
      s.scale.set(s.userData.w * k * sc, s.userData.h * k * sc, 1); }
  }
  function endStory() { if (!story) return; story.done = true; for (const Q of story.props) Q.s.visible = false; if (story.worker) story.worker.g.visible = false; }
  function walkOff() { for (const id of IDS) { const G = giants[id], C = G.C; goTo(G, [V(6, C.out), V(60, C.out)], GIANT_WALK); } }
  function flee() { for (const f of folk) { f.state = 'flee'; f.spot.set((r() - .5) * 4, 0, 9.5 + r() * 4); f.speed = 1.8 + r() * .6; } }

  // ---------- the townsfolk: wander, line up at the jar, watch from the edges, flee ----------
  function stepFolk(dt, now) {
    const watchT = kind === 'opening' ? H.giants + .6 : -1;
    let fx = 0, fz = 0, fn = 0; for (const id in giants) { const g = giants[id].g; if (!giants[id].gone && g.visible && g.position.x < 14) { fx += g.position.x; fz += g.position.z; fn++; } } if (fn) { fx /= fn; fz /= fn; }
    for (const f of folk) { const g = f.g; let speed = 0;
      if (kind === 'opening' && phase === 'hook' && t >= watchT && f.state !== 'flee' && f.state !== 'watch' && f.state !== 'watching') { f.state = 'watch'; f.spot.copy(WATCH[f.i % WATCH.length]); f.speed = 1.6; }
      let tg = null;
      if (f.state === 'line') { tg = LINE[Math.max(0, f.k - jarN)]; }
      else if (f.state === 'wander' || f.state === 'watch' || f.state === 'flee') tg = f.spot;
      if (tg) { const dx = tg.x - g.position.x, dz = tg.z - g.position.z, d = Math.hypot(dx, dz);
        if (d > .1) { const st = Math.min(d, f.speed * dt); g.position.x += dx / d * st; g.position.z += dz / d * st; f.yawT = Math.atan2(dx, dz); speed = f.speed; }
        else if (f.state === 'flee') g.visible = false;
        else if (f.state === 'wander') { f.state = 'idle'; f.t = 1 + r() * 3; }
        else if (f.state === 'watch') f.state = 'watching';
        else if (f.state === 'line') f.yawT = yawTo(g.position, JAR_POS); }
      else if (f.state === 'give') { f.t -= dt; if (f.t <= 0) { f.state = 'idle'; f.t = .8; } }
      else if (f.state === 'idle') { f.t -= dt; if (f.t <= 0) { f.speed = 1.3 + r() * .6; pickSpot(f); f.state = 'wander'; } }
      if (f.state === 'watching') { if (fn) f.yawT = Math.atan2(fx - g.position.x, fz - g.position.z); if (f.hop < 0 && r() < dt * .4) f.hop = .3; }
      if (f.state !== 'line' && f.state !== 'give') pushOut(g.position, .3);
      if (f.hop >= 0) { f.hop -= dt; const u = 1 - clamp(f.hop / .3, 0, 1); g.position.y = Math.sin(u * Math.PI) * .12; if (f.hop < 0) g.position.y = 0; }
      let d = f.yawT - f.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); f.yaw += d * Math.min(1, dt * 7); g.rotation.y = f.yaw;
      animateGerbil(g, { speed: speed * 2.2, airborne: f.hop > .04, now, dt }); }
    // and nobody walks through anybody
    for (let i = 0; i < folk.length; i++) { const a = folk[i]; if (!a.g.visible || a.state === 'line') continue; for (let j = i + 1; j < folk.length; j++) { const b = folk[j]; if (!b.g.visible || b.state === 'line') continue; const dx = b.g.position.x - a.g.position.x, dz = b.g.position.z - a.g.position.z, d = Math.hypot(dx, dz); if (d < .5 && d > 1e-4) { const o = (.5 - d) / 2; a.g.position.x -= dx / d * o; a.g.position.z -= dz / d * o; b.g.position.x += dx / d * o; b.g.position.z += dz / d * o; } } }
  }

  // ---------- coins: into the jar (everybody), out of the jar (the billionaires) ----------
  function launchCoin(from, to, out, who, fill = 0) { const c = coinS.find(c => !c.live); if (!c) return; c.live = true; c.t = 0; c.out = out; c.who = who; c.fill = fill; c.from.copy(from); c.to.copy(to); }
  function stepCoins(dt) {
    let any = false; for (let i = 0; i < coinS.length; i++) { const c = coinS[i]; if (!c.live) continue; any = true; c.t += dt * (c.out ? .8 : 1.1); const u = clamp(c.t, 0, 1);
      _p.lerpVectors(c.from, c.to, u); _p.y += Math.sin(u * Math.PI) * (c.out ? 1.4 : .8); _qt.setFromAxisAngle(_s.set(1, 0, 0), u * 9); _s.setScalar(1.6); _m.compose(_p, _qt, _s); coins.setMatrixAt(i, _m);
      if (u >= 1) { c.live = false; _m.makeScale(0, 0, 0); coins.setMatrixAt(i, _m);
        if (c.out) { const G = giants[c.who]; if (G) G.sT = Math.min(3, G.sT + .09); sfx?.play?.('grab', { rate: 1.3, volume: .4 }); spawnBurst?.(scene, _p.copy(c.to), 0xf2c230, 3); }
        else { sfx?.play?.('deliver', { step: i % 5, volume: .6 }); if (jar && c.fill) jar.userData.setFill(Math.min(.95, (jar.userData.fill?.() ?? 0) + c.fill)); spawnBurst?.(scene, _p.set(JAR_POS.x, 1.5, JAR_POS.z), 0xf2c230, 6); } } }
    if (any) coins.instanceMatrix.needsUpdate = true;
  }

  // ---------- the billionaires ----------
  function goTo(G, pts, speed) { G.path = pts.map(p => p.clone()); G.speed = speed; G.B?.setSpeed(speed); }
  function sackTop(G, out) { return out.copy(G.sack.position).setY(G.sack.position.y + .44 * G.s); }
  function placeSack(G, dt) {
    G.s += (G.sT - G.s) * Math.min(1, dt * 5 || 1); const g = G.g, yaw = g.rotation.y, s = G.s; const lx = .58 + .23 * s, lz = -.18;
    G.sack.scale.setScalar(s); G.sack.position.set(g.position.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), G.path.length ? Math.abs(Math.sin(t * 7)) * .08 : 0, g.position.z - lx * Math.sin(yaw) + lz * Math.cos(yaw));
    G.sack.rotation.y = yaw; G.sack.visible = g.visible;
  }
  function stepGiants(dt) {
    for (const id in giants) { const G = giants[id], g = G.g, Bc = G.B; if (G.gone || !g.visible) { G.sack.visible = false; continue; } let anim = 'idle';
      if (G.path.length) { const tg = G.path[0]; const dx = tg.x - g.position.x, dz = tg.z - g.position.z, d = Math.hypot(dx, dz);
        if (d < .08) { G.path.shift(); if (!G.path.length && g.position.x >= 59) { G.gone = true; g.visible = false; G.sack.visible = false; continue; } }
        else { const st = Math.min(d, G.speed * dt); g.position.x += dx / d * st; g.position.z += dz / d * st; G.yawT = Math.atan2(dx, dz); }
        anim = 'walk'; }
      else { G.yawT = G.faceYaw; if (G.laugh.length && between(G.laugh[0], G.laugh[1])) anim = 'laugh';
        if (tip && G === tip.M && between(tip.at, tip.at + tip.len)) anim = 'laugh';
        if (kind === 'news' && between(B.buy + .8, B.buy + 3.4)) anim = 'cheer'; }
      if (G.path.length && g.position.x < 14) pushOut(g.position, .5, G);
      if (Bc && Bc.current() !== anim) Bc.play(anim);
      let d = G.yawT - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * Math.min(1, dt * 6);
      placeSack(G, dt); Bc?.update(dt); }
  }

  // ---------- the props: the price flip, the jar tip, the purchase ----------
  let drops = [];
  function stepProps(dt) {
    for (const k in signs) { const S = signs[k], A = S.A, Bs = S.B; if (!Bs) continue;
      if (t >= S.flipAt && A.visible) { const u = (t - S.flipAt) / 1.0; if (u < 1) A.scale.set(A.userData.w * Math.max(.001, 1 - u), A.userData.h * (1 + u * .3), 1);
        else { A.visible = false; Bs.visible = true; sfx?.play?.('wrong'); spawnBurst?.(scene, _p.copy(Bs.position), 0xb3261e, 20); } }
      if (Bs.visible) { const k2 = easeOutBack(clamp((t - S.flipAt - 1.0) / .8, 0, 1)); Bs.scale.set(Bs.userData.w * Math.max(.001, k2), Bs.userData.h * Math.max(.001, k2), 1); Bs.position.y = A.position.y + Math.sin(t * 2 + A.position.x) * .05; } }
    // the hook: Musk lifts the jar, carries it to his sack, tips the rest in and sets it back empty
    if (tip && jar && kind === 'opening') { const M = tip.M; const u = (t - tip.at) / tip.len;
      if (u >= 0 && u < 1) {
        if (at('jarAim', tip.at)) { _s.copy(M.sack.position).sub(M.g.position).setY(0).normalize(); jarTarget.copy(M.sack.position).addScaledVector(_s, 1.25).setY(.45 * M.s + .35); jarAxis.set(0, 1, 0).cross(_q.copy(_s).negate()).normalize(); }
        const lift = smooth(u / .3), tp = smooth((u - .3) / .2), back = smooth((u - .72) / .28), k = lift * (1 - back);
        jar.position.lerpVectors(JAR_POS, jarTarget, k); jar.position.y += Math.sin(k * Math.PI) * .6; jar.quaternion.setFromAxisAngle(jarAxis, tp * (1 - back) * 1.6);
        if (u > .4 && u < .68) { jar.userData.setFill(Math.max(0, (jar.userData.fill?.() ?? 0) - dt * .3)); M.sT = Math.max(M.sT, 2.6); if (Math.random() < dt * 8) spawnBurst?.(scene, sackTop(M, _p), 0xf2c230, 4); if (at('jarSfx', 0)) sfx?.play?.('count'); }
        if (back >= 1 && at('jarBack', 0)) sfx?.play?.('oops'); }
      else if (u >= 1 && at('jarHome', 0)) { jar.position.copy(JAR_POS); jar.rotation.set(0, 0, 0); jar.userData.setFill(0); } }
    for (const b of drops) { if (b.t >= 1) continue; b.t = Math.min(1, b.t + dt / 1.1); b.g.position.lerpVectors(b.from, b.to, b.t); b.g.position.y += Math.sin(b.t * Math.PI) * 1.1; b.g.rotation.y += dt * 3;
      if (b.t >= 1) { b.g.visible = false; b.on.userData.sold(); sfx?.play?.('deliver', { step: 4 }); spawnBurst?.(scene, _p.copy(b.to).setY(b.to.y + 1.5), 0xf2c230, 14); } }
    if (stand && kind !== 'news') stand.userData.step(dt);
  }
  function buyProp(G, on) { const b = makeBag(.75); root.add(b); const from = sackTop(G, new THREE.Vector3()); on.updateMatrixWorld(true); const to = on.localToWorld(on.userData.top.clone()); drops.push({ g: b, t: 0, from, to, on }); G.sT = Math.max(.9, G.sT - .2); sfx?.play?.('grab'); }

  // ---------- the camera ----------
  const SHOTS = {
    hook: [
      { at: 0, pos: [-1.9, 2.0, -2.0], look: [0, 1.1, -5.3], blend: .01 },             // the jar, close: her coin lands, "taxes"
      { at: H.share, pos: [0, 2.0, -.9], look: [0, .6, -4.4], blend: 1.2 },           // the two gerbils and their stacks, the jar behind them, close
      { at: H.giants, pos: [-6.5, 6.8, -2.8], look: [8, .9, .3], blend: 1.8 },          // down the road from high over the square: they walk toward us
      { at: H.giants + 5.0, pos: [-1.2, 6.2, 2.2], look: [0, 1.0, -5.6], blend: 2.2 },  // the jar from the north, high: each to his spot round it
      { at: H.tip - .4, pos: [-3.8, 3.4, -1.2], look: [.6, 1.6, -6.0], blend: 1.4 },    // Musk tips it into his sack
      { at: H.leave, pos: [-17, 9.5, -.5], look: [8, 1.0, -.5], blend: 2.0 },           // they walk off up the road
    ],
    prices: [{ at: 0, pos: [-2.0, 3.6, -2.6], look: [-6.4, 1.6, 2.4], blend: .01 }],
    market: [{ at: 0, pos: [2.6, 3.4, .4], look: [-2.6, .8, -3.0], blend: .01 }],
    news: [
      { at: 0, pos: [1.4, 3.4, -.8], look: [-3.0, 1.2, -5.4], blend: .01 },
      { at: BEATS.news.lie - .6, pos: [-.4, 2.6, -4.6], look: [-3.8, 1.5, -6.0], blend: 1.4 },   // the paper says the jar is fine
    ],
    jar: [
      { at: 0, pos: [-2.4, 2.0, -2.0], look: [-.4, .7, -5.0], blend: .01 },          // the teacher walks to the jar and drops her coin, close
      { at: BEATS.jar.clink + 1.0, pos: [-1.7, 2.7, -.6], look: [.05, 1.05, -5.6], blend: 1.6 },   // then he comes to the jar
      { at: BEATS.jar.hand - .8, pos: [-1.5, 2.5, -1.1], look: [.2, 1.25, -5.8], blend: 1.6 },   // his empty hand over the jar, the teacher beside it
    ],
  };
  const FALL = { pos: [-16, 9, -6], look: [0, 1, 14] }, CALL = { pos: [-10, 1.7, 2.6], look: [-3, .6, .6] };
  function shotAt(list, i, pos, look) { const s = list[Math.max(0, i)]; pos.fromArray(s.pos); look.fromArray(s.look); }
  function listShot(list, time) { let i = list.length - 1; while (i > 0 && list[i].at > time) i--; const s = list[i]; const u = smooth((time - s.at) / s.blend);
    shotAt(list, i - 1, camA, camB); camPos.copy(camA); camLook.copy(camB); shotAt(list, i, camA, camB); camPos.lerp(camA, u); camLook.lerp(camB, u); }
  // the camera by the jar, looking past it at one shared thing (the coin cinematics and the lights going out)
  function aimShared(k, w = .55, back = 5.0) {
    const T = sharedPos(k, camB), J = _p.copy(JAR_POS).setY(1.0); _s.copy(T).sub(J).setY(0); if (_s.lengthSq() < 1e-4) _s.set(0, 0, 1); _s.normalize();
    camPos.copy(J).addScaledVector(_s, -back).add(_q.set(-_s.z, 0, _s.x).multiplyScalar(1.4)); camPos.y = 3.0 + Math.max(0, T.y - 3) * .35; camLook.lerpVectors(J, T, w); camLook.y -= .5;
  }
  function cameraTarget() {
    if (!root) return null;
    if (P.playable) {   // framing Molly and where she is going at a fixed yaw (PLAY_YAW): the shot pans and pulls back, it never orbits
      const tg = target() || player.position; const dx = tg.x - player.position.x, dz = tg.z - player.position.z, d = Math.hypot(dx, dz);
      const mx = player.position.x + dx * .4, mz = player.position.z + dz * .4;
      const back = Math.max(6.5, d * .9); camPos.set(mx - PLAY_DX * back, 4.5, mz - PLAY_DZ * back); camLook.set(mx, .5, mz);
    } else if (kind === 'opening') {
      if (phase === 'jarcine') { if (cineT < CINE_CUT) { camPos.fromArray(JAR_SHOT.pos); camLook.fromArray(JAR_SHOT.look); } else aimShared(cineKind); }
      else if (phase === 'hook') listShot(SHOTS.hook, t);
      else if (phase === 'dark') { if (darkT >= DARK.call) { camPos.fromArray(CALL.pos); camLook.fromArray(CALL.look); } else if (darkT >= DARK.fall - .3) { camPos.fromArray(FALL.pos); camLook.fromArray(FALL.look); } else if (darkKind) aimShared(darkKind, .3, 6.2); else { camPos.set(-1.9, 2.0, -2.0); camLook.set(0, 1.0, -5.3); } }
      else { camPos.fromArray(FALL.pos); camLook.fromArray(FALL.look); }
      if (phase === 'hook') { camPos.x += Math.sin(t * .35) * .2; camPos.y += Math.sin(t * .5 + 1) * .06; }
    } else {
      listShot(shots || SHOTS[kind], t);
      if (tagG && t >= B.tag) camLook.set(tagG.g.position.x * .5 + 4.5, 1.5, .2);   // the tag: his back, walking up the road
      camPos.x += Math.sin(t * .35) * .2; camPos.y += Math.sin(t * .5 + 1) * .06;
    }
    // cut, don't swoop, when the camera is far from the shot (never right after a playable phase or in the jar's shots: those ease),
    // or when a beat asks for a cut (cutCam: the coin cinematic's jump from the jar to the thing it lights)
    if (phase === 'jarcine' && cineT < CINE_CUT && !snapped) cutCam = true;
    if (ctx.camera && (cutCam || !snapped || (clock > softUntil && ctx.camera.position.distanceTo(camPos) > 6))) { snapped = true; cutCam = false; ctx.camera.position.copy(camPos); ctx.camera.lookAt(camLook); }
    return { pos: camPos, look: camLook };
  }

  // the playable jar and look phases: the jar shot once she is near the jar (main.js uses it instead of its follow camera)
  function playCamera() {
    if (!P.playable || kind !== 'opening' || (phase !== 'jar' && phase !== 'look')) return null;
    if (Math.hypot(player.position.x - COIN.x, player.position.z - COIN.z) > JAR_SHOT_R) return null;
    camPos.fromArray(JAR_SHOT.pos); camLook.fromArray(JAR_SHOT.look); return { pos: camPos, look: camLook };
  }
  function takeCut() { const c = cutPlay; cutPlay = false; return c; }

  // ---------- the end ----------
  function skip() {
    if (!active || finished) return;
    if (P.playable) { act(); return; }
    if (kind === 'opening') { if (phase === 'jarcine') return; if (phase === 'hook' || (phase === 'dark' && darkT < DARK.call)) catchUp(); else finish(true); return; }
    if (phase === 'beat' || phase === 'bcine') { if (chosen && t < B.tag) { jumpToTag(); return; } }
    finish(true);
  }
  function finish(sk = skipped) {
    if (finished) return; finished = true; quiet = false; caption('', '', 0); if (cardOpen) { cardOpen = false; ctx.closeCard?.(); }
    if (kind === 'opening') { city.setProgress(0); for (const k of kinds()) setShared(k, false, { instant: true }); if (jar) { jar.position.copy(JAR_POS); jar.rotation.set(0, 0, 0); jar.userData.setFill(0); } player.position.copy(SPAWN); player.rotation.set(0, Math.PI / 2, 0); sfx.music?.start?.('market'); }
    const cb = onDone; onDone = null; dispose(); cb?.({ skipped: !!sk });
  }
  function dispose() {
    setTint(false);
    if (!root) return; scene.remove(root); active = false; hub.prologueActive = false;
    player.visible = true; player.rotation.x = 0; if (legoSet) { player.remove(legoSet); disposeOwnGeo(legoSet); legoSet = null; }
    if (jar) { jar.position.copy(JAR_POS); jar.rotation.set(0, 0, 0); if (kind !== 'opening') jar.userData.setFill(jarFill0); }
    for (const f of folk) f.g.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m?.dispose?.()); });   // the hamster geometry is shared: keep it
    for (const s of sharers) s.g.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m?.dispose?.()); });
    const geoOnly = g => disposeOwnGeo(g);   // bag and crate textures are memoised in props.js
    for (const b of drops) geoOnly(b.g); if (beatX.crate) geoOnly(beatX.crate); if (beatX.fly) geoOnly(beatX.fly.g);
    for (const id in giants) { geoOnly(giants[id].sack); giants[id].g.userData.boss?.mixer?.stopAllAction?.(); }
    if (beatX.teacher) beatX.teacher.g.traverse(o => { if (o.isMesh) o.material?.dispose?.(); });
    for (const d of disposables) { if (d.isObject3D) d.traverse(o => { if (o.isMesh) { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m?.map?.dispose?.(); m?.dispose?.(); }); } }); else d.dispose?.(); }
    disposables.length = 0; story?.worker?.g.traverse(o => { if (o.isMesh) o.material?.dispose?.(); }); story = null; folk = []; giants = {}; coinS = []; drops = []; sharers = []; signs = {}; tagTex = {}; coins = stand = tag = null; root = null; phase = ''; kind = null; pend = []; tagG = null; shots = null; tip = null; beatX = {}; cardOpen = false;
  }
  return P;
}
