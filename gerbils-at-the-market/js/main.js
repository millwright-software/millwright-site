// The Gerbil Market — the arena game. Pick a gerbil, pick a suit, run into his pile, carry the bags to the market, bonk him off you.
import * as THREE from 'three';
import { loadHamster, gerbilFrom, spawnBurst, updateBursts, textSprite } from './parts.js';
import { buildEnvironment, makeComposer } from './env.js';
import { makeSign, dressGerbil } from './props.js';
import * as P from './props.js';   // the art layer's newer calls (setArtMode, preloadArt, updateArt) through ?. so the game runs before they land
import { furify, addPaws, animateGerbil, gerbilHop } from './fur.js';
import { createFight, BAG_SETS } from './fight.js';
import { placeEggs } from './eggs.js';
import { createUnroll } from './unroll.js';
import { sfx, juice } from './sfx.js';
import { createApproach } from './approach.js';
import { createHub, footHeight } from './hub.js';
import { createCity } from './city.js';
import { createCelebration } from './celebration.js';
import { createPrologue } from './prologue.js';
import { createTrail } from './trail.js';
import { makeBoss } from './bosses.js';
import { loadBosses2, makeBoss2 } from './bosses2.js';
const bosses2 = await loadBosses2().catch(() => false);
import { say, play, preload, numberWords, setVoiceOn, voiceOn, hush } from './speech.js';
import * as speech from './speech.js';   // the newer calls (clipLength, pauseVoice, resumeVoice) through ?. so a missing export never breaks the game
import { narrate, narrateCard, narrateToast, narrateHint, narrateGoal, goalShown, noteHeard, stopNarration, watchCard, setDucking, setNarration, narrationOn, narrationViolations } from './narrate.js';
import { createStick, createPad, moveState, stepMove, padMove, RUN_MPS } from './stick.js';

// The look (docs/ART-DIRECTION.md, direction C): 'paper' = the hand-drawn sprites, toon shading and Neutral tone mapping;
// 'old' = the look before round 3, exactly. ?art=old or ?art=paper picks one; ART_DEFAULT is the one line to flip.
const ART_DEFAULT = 'paper';
const artParam = new URLSearchParams(location.search).get('art');
const artMode = artParam === 'old' ? 'old' : artParam === 'paper' ? 'paper' : ART_DEFAULT;
P.setArtMode?.(artMode);   // before anything builds


const LEGO = 20;          // dollars per Lego set
const BOX = 0.3;          // metres per Lego set box (the skyline cubes)
const SAVE_KEY = 'gatm2';
const NAMES = { alex: 'Molly', william: 'William' };
const COLORS = { alex: 0xf0d2a0, william: 0xc08a52 };
// The arenas along the road, one per boss in data order (net worth ascending, the biggest last). The first stands at 130 m;
// each next one is 120 m of road plus room for both heaps (1.7 x their radii), rounded to 10 m (10/31, eight bosses: was 190 m,
// which ran Musk out to 1,670 m). Today: 130 / 260 / 400 / 550 / 700 / 850 / 1010 / 1180. His road in starts 64 m before his
// arena and the last arena's heap ends ~50 m before it, so the levels never overlap. A new boss slots in and pushes the rest along.
const FIRST_X = 130, GAP = 120, HEAP_ROOM = 1.7, RING_N = 15;
const heapRadius = total => total > RING_N ? Math.sqrt((total - RING_N) * .42 / Math.PI) + .6 : 0;   // fight.js's cone rule
// (Round 3: the boss-name clips in web/audio/<id>.mp3 say the net worth, so they are never played: the road start says the name only.)

// ---------- helpers ----------
const $ = id => document.getElementById(id);
// (verify) the old words()/money()/sets() formatters (trillion, billion, Lego-set counts) are gone: nothing in play may show them
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const params = new URLSearchParams(location.search);
let forcePrologue = params.get('prologue') === '1';   // ?prologue=1 plays it once, then a skip really skips
const skipIntro = params.get('intro') === 'skip' || params.get('prologue') === '0';   // test: start in the town, prologue marked seen for this session only
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; } };
const PER_PLAYER = ['eggs', 'beaten', 'tricksSeen', 'returned', 'friends', 'celebrated', 'prologueSeen', 'homeN'];
// any test param keeps the run out of the real save (?player= alone is normal use: it picks the gerbil)
const testRun = ['beaten', 'at', 'fight', 'unroll', 't', 'cel', 'win', 'prologue', 'beat', 'nolook', 'voice', 'art', 'lookout', 'grownups'].some(k => params.has(k)) || skipIntro;
function save(st) { if (testRun) return; if (st.player) { st.saves = st.saves || {}; const mine = st.saves[st.player] = st.saves[st.player] || {}; for (const k of PER_PLAYER) mine[k] = st[k]; } localStorage.setItem(SAVE_KEY, JSON.stringify(st)); }
function switchPlayer(st, who) { st.player = who; const mine = (st.saves || {})[who] || {}; st.eggs = mine.eggs || {}; st.beaten = mine.beaten || {}; st.tricksSeen = mine.tricksSeen || {}; st.returned = mine.returned || 0; st.friends = mine.friends || {}; st.celebrated = !!mine.celebrated; st.prologueSeen = !!mine.prologueSeen || skipIntro;
  // homeN: how many homecomings have played. An old save has none: count its beaten bosses as already home, so it doesn't replay them all
  st.homeN = mine.homeN ?? stops.filter(s => st.beaten[s.id]).length; }

// ---------- world ----------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, .15, 7000);
// The pixel ratio: 2 at most, 1.5 on a touch-first screen. An iPad mini (A15, 2266x1488 at 2x) draws the 4x MSAA half-float
// target, the bloom and the SMAA pass over every pixel, and 1.5 is 44% fewer of them. ?dpr=N sets it for a test.
const pixelRatio = () => { const q = Number(params.get('dpr')); if (q > 0) return q; return Math.min(devicePixelRatio || 1, matchMedia?.('(pointer: coarse)').matches || params.get('touch') ? 1.5 : 2); };
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true }); renderer.setPixelRatio(pixelRatio()); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; document.body.prepend(renderer.domElement);
try { await P.preloadArt?.(renderer); } catch (e) { console.warn('preloadArt failed', e); }   // the sprites, before the stops' signs and the env build

const data = await (await fetch('data/billionaires.json')).json();

// the suits: an arena each along the road, his cube of Lego sets far back as the skyline
const stops = []; let prevX = null, prevR = 0, prevFront = -1e9, prevSide = 0;
for (const b of data.bosses) {
  const n = Math.round(b.net_worth_usd / LEGO); const side = Math.cbrt(n); const sideM = side * BOX;
  const bagsTotal = Math.max(RING_N, Math.round(n / BAG_SETS)), heapR = heapRadius(bagsTotal);
  const x0 = prevX === null ? FIRST_X : Math.round((prevX + GAP + HEAP_ROOM * (prevR + heapR)) / 10) * 10; prevX = x0; prevR = heapR;
  // each cube's front steps back from the one before (15% of its depth, 40 m at least; Musk front 896 m, was 613): at 120-150 m spacing the
  // cubes overlap in x, and with fronts only metres apart eight of them read as one slab (Ellison 385 m, Zuckerberg 390 m)
  const zOff = Math.max(60 + sideM * .5, prevFront + Math.max(40, prevSide * .15)); prevFront = zOff; prevSide = sideM; const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sideM, sideM, sideM), new THREE.MeshStandardMaterial({ color: 0xd9a514, roughness: .8 })); mesh.position.set(sideM / 2, sideM / 2, sideM / 2); mesh.visible = false;   /* (verify) no texture for a mesh that is never shown */ group.add(mesh);   // (integrate) the old skyline cubes stay hidden: the Long Road is the one scale device (decision 1); seen from the town they were a flat brown slab
  group.position.set(x0 + 20, 0, zOff); group.userData.w = group.userData.d = sideM; scene.add(group);
  const sign = makeSign([b.display_name || b.name], { width: 2.4 }); sign.position.set(x0 - 22, 0, -3); scene.add(sign);   // the name only: no money figure or set count on screen in play (C7)
  stops.push({ id: b.id, boss: b, sets: n, x: x0, z: zOff, size: sideM, group, sign, triggerX: x0 - 1.4, bags: bagsTotal, heapR });
}
const hubStop = { id: 'hub', x: 0, z: 0 };
const arenas = stops.map(s => [s.x - 42, s.x + s.size]);
// The Long Road (contract C2): one row of equal bags per billionaire, laid up the valley from x0, a lane each (z = z0 - i*laneGap).
// The road runs past the end of the longest row, 100 m spare, at least 1800 m.
const LONG_ROAD = { x0: 34, z0: -2.6, laneGap: 1.5, spacing: .5, order: data.bosses.map(b => b.id) };
const maxBags = Math.max(0, ...data.bosses.map(b => Math.round(b.net_worth_usd / data.bag_usd)));
const roadEnd = Math.max(1800, Math.ceil((LONG_ROAD.x0 + maxBags * LONG_ROAD.spacing + 100) / 100) * 100);
const BOSS_N = stops.length;
const env = buildEnvironment(scene, renderer, { roadEnd, arenas, laneHalf: 1.6, market: false, hub: { x0: -42, x1: 42, z0: -32, z1: 32 }, cubeZones: stops.map(s => ({ x: s.group.position.x, w: s.group.userData.w, z: s.z, d: s.group.userData.d })) });
const post = makeComposer(renderer, scene, camera);
// the tone mapping goes with the look: Neutral keeps the painted colours true; the old look keeps ACES
if (artMode === 'paper') { renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0; } else { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; }

// ---------- state, player ----------
const state = Object.assign({ player: null, beaten: {}, eggs: {}, returned: 0 }, load()); if (state.player) switchPlayer(state, state.player);
await loadHamster();
const player = gerbilFrom({ color: 0xd9b07a }); dressGerbil(player, { color: 0xd9b07a });
furify(player, { color: 0xd9b07a }); addPaws(player); scene.add(player);
// She is drawn 1.5x life size so a 5-year-old can read which way she faces (about 100 px tall at 1280x720 on the road).
// fur.js lengthens her stride with the scale so the feet still keep pace with the ground. Reach and push radii in
// fight.js, approach.js and hub.js are theirs (PLAYER_SCALE is the factor to widen them by).
const PLAYER_SCALE = 1.5; player.scale.setScalar(PLAYER_SCALE);
player.position.set(2, 0, 0); let heading = Math.PI / 2, camYaw = Math.PI / 2;
let menuOpen = false, mode = 'hub', asking = false, currentStop = null, throttle = 0, gateT = null, look = false, lookT = 0, lookA = 0, lookKind = 'orbit', lookShot = null;
let clipDist = Infinity, roadVis = null, fightCam = null, cloudsHidden = false;   // the wall clip's eased distance; the Long Road's last visibility; fight.js's camera this frame
// The follow camera: a fixed angle behind and above, looking up the road. Closer in the town and on the road (she is the
// thing to watch), farther in the heist (the giant and his pile need room). It leads her: the framing slides ahead the way
// she walks (CAM_LEAD seconds of her velocity, eased), so she sits a little behind centre instead of dead in the middle.
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camLead = new THREE.Vector3(), camAim = new THREE.Vector3();
// One look target for every camera (camLookS), eased the same way, so a hand-back from a wide shot or a cinematic glides
// instead of snapping its aim. The shake is added to a copy of the eased position (camBase), never into it.
const CAM = { near: { back: 3.2, up: 1.8 }, hub: { back: 3.8, up: 2.3 }, fight: { back: 4.0, up: 2.5 } }, CAM_LEAD = .4, CAM_LEAD_MAX = 1.0, LOOK_AHEAD = 1.8, LOOK_Y = .25;
let camBack = CAM.near.back, camUp = CAM.near.up, camCut = true;
const camBase = new THREE.Vector3(), camWritten = new THREE.Vector3(), camLookS = new THREE.Vector3(), _aimT = new THREE.Vector3();
function aimCam(pos, look, rate, dt) {
  if (camCut || camera.position.distanceToSquared(camBase) > 1e-8) { camBase.copy(pos); camLookS.copy(look); camCut = false; }   // a cut (or a module snapped the camera)
  else { camBase.lerp(pos, 1 - Math.exp(-dt * rate)); camLookS.lerp(look, 1 - Math.exp(-dt * 6)); }
  camera.position.copy(camBase); camera.lookAt(camLookS);
}
// her walking (stick.js), the touch joystick, and the town's click-to-walk ring
const m1 = moveState(), stick1 = createStick({ dom: document.body, corner: 'left', color: '#e0b53a' });
// the trackpad stick (stick.js createPad): the main control on a laptop. ?pad=0 turns it off (a click is A again, and
// in the town a click on open ground walks her there)
const PAD_ON = params.get('pad') !== '0', pad1 = createPad({ dom: document.body, color: '#e0b53a' });
let padLocked = false, padLockPending = false, padWanted = false, padSelfUnlock = false, mouseHeld = false, padMenuAt = -1e9;
let walkTo = null;   // { x, z, best, stuckT }
const ring = new THREE.Mesh(new THREE.RingGeometry(.22, .34, 32), new THREE.MeshBasicMaterial({ color: 0xf2c230, transparent: true, opacity: .9, depthWrite: false }));
ring.rotation.x = -Math.PI / 2; ring.visible = false; ring.renderOrder = 3; scene.add(ring);
function clearWalk() { walkTo = null; ring.visible = false; }
// input state the loop and the handlers share (declared before anything can run them)
let bHeld = false, aBtnHeld = false;   // the on-screen B (run) and A (held: hold-to-skip)
let lastPrompt, poked = false;         // the town prompt last shown; any input this frame (the idle re-prompt)
function resetMove() { m1.vx = m1.vz = 0; m1.speed = m1.turn = 0; m1.sameT = 0; m1.heading = heading; throttle = 0; stick1.reset(); pad1.reset(); clearWalk(); }

// ---------- HUD + cards + toasts ----------
// Her coat matches her face on the title: the model's texture is orange, and a tint multiplies it, so the tint is the
// title colour divided by the texture's mean colour (per channel, capped), not the title colour itself.
let texMean;
function coatTint(hex) {
  const want = new THREE.Color(hex), map = player.userData.mat?.map;
  if (texMean === undefined) { texMean = null; const im = map?.image; if (im?.width) try { const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 16, 16); const d = g.getImageData(0, 0, 16, 16).data; let r = 0, gg = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; } if (n) texMean = new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace); } catch {} }
  if (!texMean) return want;
  const k = .9;   // a touch under: the texture's white patches would otherwise burn out
  return new THREE.Color(Math.min(2.5, k * want.r / Math.max(.05, texMean.r)), Math.min(2.5, k * want.g / Math.max(.05, texMean.g)), Math.min(2.5, k * want.b / Math.max(.05, texMean.b)));
}
function showHUD() { for (const id of ['who', 'hint']) $(id).classList.remove('hidden'); $('whoName').textContent = `${NAMES[state.player]} the gerbil`; const t = coatTint(COLORS[state.player]); player.userData.mat?.color.copy(t); player.userData.fur?.setColor(t); }
// Console-style controls on every device (Eric, 10/31: "four controls tops", "something simpler for running like the
// Shift key"): Move, A (do the thing), Shift / B (run while held), Start (the menu). Keyboard: arrows or W A S D, Space or
// Enter, Shift, Esc or P. A laptop's trackpad is a stick (stick.js createPad: glide to walk, click is A; Esc the menu). Gamepad: stick or d-pad, A, B (run; Back on a card), Start. Touch: the
// joystick (stick.js) and the A, B and menu buttons. Each line has both words (keyboard / touch); CSS shows one.
// On a laptop the trackpad is the main control (padMode: the body has class "pad" since the last glide or click on the
// game; a key press turns it off), and the keyboard words give way to its own: "Glide your finger to walk · Click to do it".
const padMode = () => document.body.classList.contains('pad');
const K = (onKeys, onPad, onTrack = 'Click') => `<span class="mouseOnly"><kbd>${padMode() ? onTrack : onKeys}</kbd></span><span class="touchOnly"><kbd>${onPad}</kbd></span>`;
// one verb for A ("do it"); in the town the verb of what is in reach replaces it (hubPrompt)
const moveHint = (verb = 'do it') => padMode() ? `<span class="mouseOnly">Glide your finger to walk · <kbd>Click</kbd> to ${verb}</span><span class="touchOnly"><kbd>Pad</kbd> walk · <kbd>A</kbd> ${verb} · <kbd>B</kbd> run</span>`
  : `${K('Arrows', 'Pad')} walk · ${K('Space', 'A')} ${verb} · ${K('Shift', 'B')} run`;
const hintHTML = k => ({
  hub: moveHint(), road: moveHint(),
  fight: `Grab bags from the pile · bring them to the jar · ${K('Space', 'A')} bonk him`,
  skip: `Hold ${K('Space', 'A', 'the click')} to skip`, unroll: `Hold ${K('Space', 'A', 'the click')} to skip`, prologue: `Hold ${K('Space', 'A', 'the click')} to skip`,
  look: `${K('Space', 'A')} to go back`,
})[k];
const SILENT_HINTS = new Set(['prologue', 'unroll', 'look', 'fight', 'skip']);   // shown, never read aloud
// what the bar says aloud (once a session): whole sentences in the device's words, not the bar's shorthand
const SAY_MOVE = () => padMode() ? `<span class="mouseOnly">Glide your finger on the trackpad to walk. Click to do things.</span><span class="touchOnly">Walk with the pad. Press A to do things. Hold B to run.</span>`
  : `Walk with the ${K('arrow keys', 'pad')}. Press ${K('Space', 'A')} to do things. Hold ${K('Shift', 'B')} to run.`;
const HINT_SAY = { hub: SAY_MOVE, road: SAY_MOVE };
// the menu's help line: the four controls
const MENU_HELP = () => padMode() ? `<p class="menuHelp"><span class="mouseOnly">Glide your finger to walk · <kbd>Click</kbd> do it · <kbd>Esc</kbd> menu · keys work too</span><span class="touchOnly"><kbd>Pad</kbd> walk · <kbd>A</kbd> do it · <kbd>B</kbd> run · <kbd>☰</kbd> menu</span></p>`
  : `<p class="menuHelp">${K('Arrows', 'Pad')} walk · ${K('Space', 'A')} do it · ${K('Shift', 'B')} run · ${K('Esc', '☰')} menu</p>`;
const aWord = () => touchUI() ? 'A' : padMode() ? 'Click' : 'Space';
let hintKey = null;
function setHint(k, { silent = false, html = null } = {}) { hintKey = k; const h = html ?? hintHTML(k) ?? ''; $('hint').innerHTML = h; if (!silent && !SILENT_HINTS.has(k)) narrateHint(HINT_SAY[k]?.() ?? h, k); }   // spoken once per mode per session (narrate.js)
// the money panel: the beaten count and the town's prompt; the note line is the town's only (fight.js and unroll.js fill the rest)
function hud({ money: m, sets: s, note }) { $('stop').classList.remove('hidden'); $('stopMoney').textContent = m; $('stopSets').textContent = s; $('stopNote').textContent = mode === 'hub' ? note || '' : ''; }
// A card: a choice with sel:true is highlighted; with none, a lone button is; with two or more and no sel, nothing is
// (the first A only highlights). For CARD_GRACE ms after it opens, and for any A pressed before it opened, A and clicks
// do nothing, and the buttons fade in over the same time (game.css), so a mashed A never picks an answer unseen.
const CARD_GRACE = 900; let cardOpenedAt = 0, aDownAt = 0;
const cardFresh = () => !$('ask').classList.contains('hidden') && (performance.now() - cardOpenedAt < CARD_GRACE || aDownAt < cardOpenedAt);
// card(title, bodyHTML, choices, { silent }): silent = not read aloud (the grown-ups' pages). A choice with silent:true is
// never read in "You can pick". Any element with class "grownups" is never spoken and shows collapsed under a small
// "For grown-ups" pill (<details class="grownups">, game.css).
function card(title, bodyHTML, choices, { silent = false } = {}) {
  asking = true; cardOpenedAt = performance.now(); resetMove(); $('askTitle').textContent = title; const body = $('askBody'); body.innerHTML = bodyHTML; const box = $('askChoices'); box.innerHTML = '';
  for (const el of [...body.querySelectorAll('.grownups')]) if (el.tagName !== 'DETAILS' && !el.closest('details.grownups')) {
    const d = document.createElement('details'); d.className = 'grownups'; const sm = document.createElement('summary'); sm.textContent = 'For grown-ups'; d.appendChild(sm); el.replaceWith(d); el.classList.remove('grownups'); d.appendChild(el); }
  else if (el.tagName === 'DETAILS' && !el.querySelector(':scope > summary')) { const sm = document.createElement('summary'); sm.textContent = 'For grown-ups'; el.prepend(sm); }
  let selB = null;
  for (const c of choices) { const b = document.createElement('button'); b.innerHTML = c.label; if (c.go) b.classList.add('go'); if (c.silent) b.dataset.silent = '1'; b.onclick = () => { if (performance.now() - cardOpenedAt < CARD_GRACE) return; c.on(b); }; box.appendChild(b); if (c.sel && !selB) selB = b; }
  $('ask').classList.remove('hidden'); document.activeElement?.blur?.();
  if (!selB && choices.length === 1) selB = box.querySelector('button'); if (selB) selB.classList.add('sel');
  narrateCard(title, bodyHTML, choices, { silent });   // silent: narrate.js only takes the card as read (so watchCard stays quiet), says nothing
}
// the grown-ups' page: the hub's card (real figures, sources), or the sources page in a new tab before the hub has one
function openGrownups() { if (hub?.openGrownups) hub.openGrownups(); else window.open('sources.html', '_blank', 'noopener'); }
function closeCard() { $('ask').classList.add('hidden'); asking = false; menuOpen = false; stopNarration(); }
let captionT = null;
// one text layer at a time (verify): a caption hides the toast, a toast hides the caption
function caption(text, sub = '', ms = 5000) { const c = $('caption'); clearTimeout(captionT); if (!text && !sub) { c.classList.remove('show'); return; } $('toast').classList.remove('show'); toastUntil = 0; $('captionText').textContent = text; $('captionSub').textContent = sub; c.classList.remove('hidden'); requestAnimationFrame(() => c.classList.add('show')); if (ms > 0) captionT = setTimeout(() => c.classList.remove('show'), ms); }
let toastT = null, toastUntil = 0; const toastOnce = {};
function toast(text, { sub = '', ms = 2600, once = null, ambient = false } = {}) { if (once) { if (toastOnce[once]) return; toastOnce[once] = true; } toastUntil = performance.now() + ms + 400; $('caption').classList.remove('show'); clearTimeout(captionT); narrateToast(text, sub, { response: !ambient }); sfx.play('toast'); const t = $('toast'); t.innerHTML = text + (sub ? `<small>${sub}</small>` : ''); t.classList.remove('hidden'); requestAnimationFrame(() => t.classList.add('show')); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }

// ---------- the goal: one line, top centre, in every playing mode, with a live count ----------
// (decision 15) In the town it sits top-left under the 'who' panel, clear of the road sign's boards; on the road and in the heist
// it stays top centre (game.css #goal, #goal.town).
const goalEl = document.createElement('div'); goalEl.id = 'goal'; goalEl.className = 'panel hidden'; goalEl.setAttribute('aria-live', 'polite');
document.body.appendChild(goalEl); let goalText = null;
let signOpened = false;   // the road sign has been opened this session: the town's goal names the pick, not the walk
function goalFor() {
  if (!$('title').classList.contains('hidden')) return '';
  if (mode === 'hub') return BOSS_N && beatenN() >= BOSS_N ? 'You got the valley\'s money back!' : signOpened ? 'Pick the next billionaire at the road sign.' : 'Walk up to the road sign.';   // "follow the arrows" is the call clip's alone
  if (mode === 'approach') { const f = approach.friendCount?.() || { freed: 0, total: 0 }; if (approach.phase === 'road') return f.freed < f.total ? `Free your friends: ${f.freed} of ${f.total}` : 'Get to the door.'; if (approach.phase === 'gate') return 'Spot the trick to open the door.'; return 'Go in!'; }
  if (mode === 'fight' && fight.active && !fight.done) return `Bring ${fight.need || 15} bags to the jar: ${fight.delivered || 0} of ${fight.need || 15}`;   // spoken only at 0, 5, 10 and the last (spokenGoal): never a count over ten but fifteen
  return '';
}
// a new goal is read aloud once, 0.7 s after it settles (five quick deliveries say only the last count), never in a beat
// or over a card (it waits for the card to close); narrate.js never says the same goal twice in a row. The town's goals
// are said at most once a session each; the heist's count only at 0, 5, 10 and the last bag ("One more bag!").
let goalPend = null, goalPendAt = 0, goalPendFor = null; const townGoalsSaid = new Set();
function spokenGoal(t) {
  if (!t) return null;
  if (mode === 'hub') { if (townGoalsSaid.has(t)) return null; townGoalsSaid.add(t); return t; }
  if (mode === 'fight') { const d = fight.delivered || 0, need = fight.need || 15; return d === need - 1 ? 'One more bag!' : d === 0 || d === 5 || d === 10 ? t : null; }
  return t;
}
function updateGoal() { const t = goalFor(); goalEl.classList.toggle('town', mode === 'hub' || mode === 'home');
  if (t !== goalText) { goalText = t; goalEl.textContent = t || ''; goalEl.classList.toggle('hidden', !t); goalShown(t); goalPend = spokenGoal(t); goalPendFor = t; goalPendAt = performance.now(); }
  if (goalPend && performance.now() - goalPendAt > 700 && !asking && mode !== 'beat' && mode !== 'prologue') { if (goalPendFor === goalText) narrateGoal(goalPend); goalPend = null; } }

// ---------- the level screen ----------
function showLevels() { enterHub(); }
const beatenN = () => stops.filter(s => state.beaten?.[s.id]).length;   // only bosses still in the data count
function enterHub() {
  clearTimeout(gateT); closeCard(); mode = 'hub'; sfx.music.start('market'); currentStop = null; $('levels').classList.add('hidden');
  heading = camYaw = Math.PI / 2; resetMove(); setLook(false); hub.enter(); camCut = true; townPanel(); lastPrompt = undefined; setHint('hub', { silent: true });   // read aloud below, once nothing else takes over
  hubTrail.show(true); roadTrail.show(false);
  if (!state.prologueSeen || forcePrologue) { forcePrologue = false; startPrologue(); return; }   // prologueSeen is set when it ends (or by goMarket)
  // a short homecoming for each boss beaten since the last one played (hub.js): the town rebuilds while she watches
  const from = state.homeN || 0, to = beatenN();
  if (to > from && hub.startHomecoming) { hub.sync?.(from); homeDoneOnce = false;
    if (hub.startHomecoming({ from, to, onDone: homeDone })) { mode = 'home'; hubTrail.show(false); setHint('skip'); return; } }
  if (state.homeN !== to) { state.homeN = to; save(state); }
  const celebrate = BOSS_N && beatenN() >= BOSS_N && !state.celebrated;
  hub.sync?.(to); setHint('hub', { silent: !!celebrate });   // F: the bar's spoken help never runs on into the celebration
  if (celebrate) { state.celebrated = true; save(state); setTimeout(() => { setLook(false); mode = 'celebration'; setHint('unroll'); cel.start({ onDone: r => { mode = 'hub'; if (r?.again) { state.beaten = {}; state.celebrated = false; state.homeN = 0; save(state); for (const st of stops) st.group.scale.setScalar(1); unroll.longRoad?.clear?.(); } enterHub(); } }); }, 800); }
}
let homeDoneOnce = true;
function homeDone() { if (homeDoneOnce) return; homeDoneOnce = true; state.homeN = beatenN(); save(state); if (mode === 'home') { mode = 'hub'; enterHub(); } }
// the money panel in the town: how many are beaten (or the win), and what is in reach
function townPanel(prompt = null) {
  const all = BOSS_N && beatenN() >= BOSS_N;
  hud({ money: 'Gerbil Valley', sets: all ? 'You got the valley\'s money back!' : `${beatenN()} of ${BOSS_N} billionaires`, note: !prompt ? '' : /^act: /.test(prompt) ? `${aWord()}: ${prompt.replace(/^act: /, '')}` : prompt });
}
// the town's prompt: shown in the panel and on the bar (the verb of what is in reach), and said once a minute per spot
function hubPrompt(now) {
  const spot = 'promptSpot' in hub ? hub.promptSpot : hub.prompt ? { label: hub.prompt, say: /^act: /.test(hub.prompt) ? hub.prompt.replace(/^act: (.)/, (m, c) => c.toUpperCase()) + '.' : null } : null;
  const label = spot?.label ?? null; if (label === lastPrompt) return; lastPrompt = label;
  townPanel(label); setHint('hub', { silent: true, html: label && /^act: /.test(label) ? moveHint(label.replace(/^act: /, '')) : moveHint() });
  if (spot?.say) { const t = spotSaidAt[spot.say]; if (t === undefined || now - t > 60000) { spotSaidAt[spot.say] = now;
    // F: the device's word ('Press Space.' on a keyboard), and no 'Press' at all where A does nothing yet (the bell before it is hung)
    const line = /^act: /.test(label || '') ? spot.say.replace(/\bPress A\b/, aWord() === 'Click' ? 'Click' : `Press ${aWord()}`) : spot.say.replace(/\s*Press A\.?\s*$/, '');
    narrate(line, { interrupt: false, stale: 2000 }); sfx.play('toast'); } }
}
function startPrologue() {
  if (mode === 'prologue') return; closeCard(); mode = 'prologue'; $('hint').innerHTML = ''; hubTrail.show(false); setLook(false);
  // seen once it ends, skipped or not (r.skipped): a kid who skips never gets the hook again on every launch
  pro.start({ onDone: () => { state.prologueSeen = true; save(state); mode = 'hub'; caption('', '', 0); enterHub(); } });
  if (!pro.playable) setHint('prologue');   // the playable part shows its own prompt (tick)
  const at = Number(params.get('t') || 0); for (let i = 0; i < at * 30 && pro.active; i++) { hub.update(1 / 30, performance.now() + i * 33); pro.update(1 / 30, performance.now() + i * 33); }   // test: jump into it
  camCut = true;   // the first frame cuts straight to the opening's shot (no swoop from the town camera)
}
// The wide shots. kind 'orbit': the slow circle round her and the pile (the menu's Look, the heist's opening). kind 'lookout':
// a still shot from the lookout hill over every Long Road row laid so far (unroll.longRoad.lookoutShot); no Long Road yet = the orbit.
function setLook(on, kind = 'orbit') {
  if (on === look && (!on || kind === lookKind)) return; look = on; lookT = 0; lookA = camYaw; lookKind = on ? kind : 'orbit'; lookShot = null;
  if (on && kind === 'lookout') { const from = hub.hillTop ?? new THREE.Vector3(-25, 2.2, -18); unroll.longRoad?.setVisible?.(true); roadVis = true;
    try { const sh = unroll.longRoad?.lookoutShot?.(from); if (sh?.pos && sh?.look) lookShot = { pos: sh.pos.clone(), look: sh.look.clone() }; } catch (e) { console.warn('lookoutShot failed', e); } }
  if (on) { resetMove(); sfx.play('whoosh'); setHint('look'); } else { setHint(mode === 'fight' ? 'fight' : mode === 'approach' ? 'road' : 'hub'); lastPrompt = undefined; } }
function lookTarget(dt) {
  if (lookShot) return lookShot;
  // (verify) the heist's opening shot: from behind her and up, on the pile and the jar (fight.focus and fight.jarSpot), drifting
  // a little sideways; the orbit round her pointed down at the carpet with neither in frame
  if (mode === 'fight' && lookT > 0 && fight.jarSpot && fight.focus) { const f = fight.focus, j = fight.jarSpot; lookA += dt * .05;
    _lookM.set((f.x + j.x) / 2 + 1, 0, (f.z + j.z) / 2); const back = 11 + (fight.heapR || 0) * .4;
    _lookP.set(_lookM.x - back * Math.cos(lookA - Math.PI / 2) , 6.2, _lookM.z - back * Math.sin(lookA - Math.PI / 2) * .5 - 2.5); _lookL.set(_lookM.x + 1.5, .9, _lookM.z); return { pos: _lookP, look: _lookL }; }
  // a wide shot that frames the gerbil and the giant's whole pile; the skyline cube on the road in
  const s = currentStop; let c, R; if (mode === 'fight' && fight.heapCenter) { c = fight.heapCenter; R = fight.heapR; } else if (s) { c = _lookC.set(s.group.position.x + s.size / 2, 0, s.z + s.size / 2); R = s.size * .7; } else { c = _lookC.set(player.position.x, 0, player.position.z + 12); R = 8; }
  lookA += dt * .12; const dist = R * 2.4 + 9, h = R * 1.0 + 4; _lookM.lerpVectors(player.position, c, .55);
  _lookP.set(_lookM.x + Math.sin(lookA) * dist, h, _lookM.z + Math.cos(lookA) * dist); _lookL.set(_lookM.x, R * .35, _lookM.z); return { pos: _lookP, look: _lookL };
}
const _lookC = new THREE.Vector3(), _lookM = new THREE.Vector3(), _lookP = new THREE.Vector3(), _lookL = new THREE.Vector3();
// A level opens with his beat from the prologue module (prologue.js's playBeat/beatFor, when it has them): mode 'beat', the
// prologue camera, act skips, the Market button ends it. No beat (or the module says no) = straight onto the road.
function startLevel(s) {
  player.position.y = 0; asking = false; currentStop = s; clearTimeout(gateT); setLook(false); hubTrail.show(false); roadTrail.show(false);
  let playing = false;   // ?beat=0 (tests) goes straight to the road
  if (params.get('beat') !== '0') try { playing = !!pro.playBeat?.(pro.beatFor?.(s.id), { bossId: s.id, onDone: () => { if (mode !== 'beat' || currentStop !== s) return; caption('', '', 0); startRoad(s); } }); } catch (e) { console.warn('beat failed', e); playing = false; try { pro.dispose(); } catch {} }
  if (!playing) { startRoad(s); return; }
  mode = 'beat'; setHint('prologue'); camCut = true;
}
function startRoad(s) {
  player.visible = true; player.position.y = 0; asking = false; currentStop = s; mode = 'approach'; setHint('road'); heading = Math.PI / 2; camYaw = Math.PI / 2; resetMove();
  player.position.set(s.x - 60, 0, 0); camera.position.set(s.x - 63, 2, 0); hubTrail.show(false); roadTrail.set(s.x - 56, s.x - 16).show(true); setLook(false);
  hud({ money: s.boss.display_name || s.boss.name, sets: '', note: '' });   // (verify) the panel names the level, not the town's 'pick a billionaire'
  sfx.music.start('market'); narrate(s.boss.display_name || s.boss.name);   // the name only (the old boss-name clips say the net worth: never played)
  clearTimeout(gateT); approach.start(s, { onGate: () => {}, onOpen: () => { clearTimeout(gateT); gateT = setTimeout(() => { if (mode !== 'approach') return; approach.dispose(); roadTrail.show(false); mode = 'fight'; setHint('fight'); sfx.music.start('chase'); fight.start(s); reveal(); }, 1200); } });
}
function reveal() { if (params.get('nolook')) return; setLook(true);   // ?nolook=1: test shots skip the opening wide shot
  lookT = 4.2; }   // the silent orbit: no words over the pile (the lesson plan's cuts)
function startFightDirect(s) { asking = false; currentStop = s; mode = 'fight'; setHint('fight'); hubTrail.show(false); roadTrail.show(false); heading = Math.PI / 2; camYaw = Math.PI / 2; resetMove(); player.position.set(s.x - 15, 0, 0); sfx.music.start('chase'); fight.start(s); reveal(); }

// ---------- the fight + the hidden things ----------
const fight = createFight({ camera, bagUSD: data.bag_usd, ordinary: data.ordinary, data, scene, player, state, save, card, closeCard, toast, hud, shuffle, say, play: (...a) => storyPlay(...a), sfx, juice, asking: () => asking, onFinish: () => setLook(false),
  aWord, looking: () => look,
  // the town catches up in the homecoming (enterHub → hub.startHomecoming), not here
  onEnd: (s, opts) => { state.beaten[s.id] = state.beaten[s.id] || { bags: 15 }; state.beaten[s.id].at = Date.now(); save(state); s.group.scale.setScalar(.3); setLook(false); mode = 'unroll'; setHint('unroll'); unroll.start(s, opts); } });
const approach = createApproach({ scene, player, gerbilFrom, spawnBurst, textSprite, makeBoss: id => bosses2 ? makeBoss2(id, { scale: 1.15 }) : makeBoss(id, { scale: 1.2 }), card, closeCard, toast, play, sfx, say, state, save });
const hubCity = createCity({ scene, hamsterReady: true, gerbilFrom, spawnBurst, sfx });
const hub = createHub({ bossThumbURL: id => bossThumbURL(id), stops, scene, player, state, save, gerbilFrom, spawnBurst, textSprite, card, closeCard, toast, play, sfx, data, city: hubCity, look: (on, kind) => setLook(on, kind), aWord, savePicture: () => savePicture(), onPrologue: () => startPrologue(), onSign: () => { signOpened = true; }, onPick: id => { const s = stops.find(st => st.id === id); if (s) { player.position.y = 0; startLevel(s); } } });
hub.build();
const bossFactory = id => bosses2 ? makeBoss2(id, { scale: 1.35 }) : makeBoss(id, { scale: 1.4 });   // the prologue's and the celebration's billionaires
// Each billionaire's face as a picture (verify round 3: the road sign's picker and the Long Road's name posts were words only,
// and Alex can't read): his 3D caricature drawn once, head and shoulders, to a 256 px canvas with a clear background. Cached.
const thumbCache = {};
function bossThumb(id) {
  if (id in thumbCache) return thumbCache[id]; thumbCache[id] = null;
  let rt = null;
  try {
    const g = bossFactory(id), sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 2.4)); const dl = new THREE.DirectionalLight(0xffffff, 1.8); dl.position.set(-1.5, 2.5, 3); sc.add(dl, g);
    g.userData.boss?.play?.('idle'); g.userData.boss?.update?.(0); g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g), h = box.max.y - box.min.y, c = new THREE.Vector3();
    const head = g.userData.boss?.head; if (head?.getWorldPosition) head.getWorldPosition(c); else c.set((box.min.x + box.max.x) / 2, box.max.y - h * .16, (box.min.z + box.max.z) / 2);
    c.y = Math.min(box.max.y - h * .08, c.y + h * .05);
    const cam = new THREE.PerspectiveCamera(28, 1, .05, 60); cam.position.set(c.x, c.y + h * .03, c.z + h * 1.05); cam.lookAt(c.x, c.y - h * .04, c.z);
    const N = 256; rt = new THREE.WebGLRenderTarget(N, N, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
    const prevTM = renderer.toneMapping, prevC = new THREE.Color(), prevA = renderer.getClearAlpha(); renderer.getClearColor(prevC);
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc, cam);
    const px = new Uint8Array(N * N * 4); renderer.readRenderTargetPixels(rt, 0, 0, N, N, px); renderer.setRenderTarget(null); renderer.setClearColor(prevC, prevA); renderer.toneMapping = prevTM;
    const cv = document.createElement('canvas'); cv.width = cv.height = N; const x = cv.getContext('2d'), im = x.createImageData(N, N);
    for (let y = 0; y < N; y++) im.data.set(px.subarray((N - 1 - y) * N * 4, (N - y) * N * 4), y * N * 4);   // GL rows run bottom-up
    x.putImageData(im, 0, 0); thumbCache[id] = cv;
    g.userData.boss?.mixer?.stopAllAction?.();
  } catch (e) { console.warn('bossThumb', id, e); thumbCache[id] = null; }
  rt?.dispose();
  return thumbCache[id];
}
const thumbURL = {}; const bossThumbURL = id => { if (id in thumbURL) return thumbURL[id]; const c = bossThumb(id); return (thumbURL[id] = c ? c.toDataURL('image/png') : null); };
const cel = createCelebration({ data, hub, longRoad: () => unroll.longRoad, hillTop: hub.hillTop, caption, play, makeBoss: bossFactory, scene, player, camera, city: hubCity, gerbilFrom, spawnBurst, sfx, card, closeCard, toast, state, savePicture: () => savePicture(), NAMES, BAG_SETS });
// the story's clips are noted as heard, so the goal line and a toast don't repeat them ("Follow the arrows up the road")
const storyPlay = (id, text, o) => { noteHeard(text, id); return play(id, text, o); };
const pro = createPrologue({ card, closeCard, narrate, scene, player, camera, hub, city: hubCity, gerbilFrom, makeBoss: bossFactory, spawnBurst, sfx, play: storyPlay, toast, caption, data, name: () => NAMES[state.player] || 'Molly', playerId: () => state.player || 'alex', state: () => state });
const hubTrail = createTrail(scene, { max: 14 }).set(4, hub.signX ?? 29); const roadTrail = createTrail(scene, { max: 24 });
const unroll = createUnroll({ bossThumb: id => bossThumb(id), longRoad: LONG_ROAD, narrate, gerbilFrom, caption, data, heightAt: env.heightAt, aWord, scene, player, camera, card, closeCard, toast, hud, state, save, play, sfx, ordinary: data.ordinary, BAG_SETS, BAG_USD: data.bag_usd, savePicture: () => savePicture(), onEnd: () => showLevels() });
const eggs = placeEggs({ scene, player, state, save, card, closeCard, toast, play, sfx, asking: () => asking, hudSecrets: (n, t, rn, rt) => { $('whoSecrets').textContent = `Secrets found: ${n} of ${t}` + (rn ? ` · road secrets: ${rn} of ${rt}` : ''); } }, [...stops, hubStop]);
for (const s of stops) if (state.beaten[s.id]) s.group.scale.setScalar(.3);

// ---------- input: Move, A, B, Start on keys, mouse, touch and gamepad ----------
const keys = new Set();
const P1_KEY = c => keys.has(c);   // one player, both key sets: arrows or W A S D, Space or Enter, either Shift
const A_KEYS = new Set(['Space', 'Enter', 'NumpadEnter']);
const NAV = { ArrowLeft: -1, ArrowUp: -1, KeyA: -1, KeyW: -1, ArrowRight: 1, ArrowDown: 1, KeyD: 1, KeyS: 1 };
// the touch controls: on when the screen is touch-first (or ?touch=1), or the moment a finger lands
function touchUI() { return document.body.classList.contains('touch'); }
function setTouchUI() { if (!touchUI()) { document.body.classList.add('touch'); if (hintKey) setHint(hintKey); } }
if (matchMedia?.('(pointer: coarse)').matches || params.get('touch')) document.body.classList.add('touch');
// A: do the thing in reach. In a cinematic (the story, the payoff, the homecoming) a press does nothing: holding A skips (frame).
function act() {
  if (asking) return; poked = true; const proPlay = proPlayable();
  if (look) { setLook(false); return; }
  if (cinematic(proPlay)) return;
  if (mode === 'hub' || mode === 'approach' || mode === 'fight' || proPlay) gerbilHop(player, mode === 'fight' ? .6 : 1);
  if (proPlay) { pro.act(); return; }
  if (mode === 'hub') { if (hub.act() === false) sfx.play('step', { volume: .35 }); return; }
  if (mode === 'approach') { approach.act(); return; }
  if (mode === 'fight') fight.fire();
}

// cards and the title: Move picks a button (it lights up), A presses it
function screenButtons() {
  if (!$('ask').classList.contains('hidden')) return [...$('askChoices').querySelectorAll('button:not([disabled])')];
  if (!$('title').classList.contains('hidden')) return [...document.querySelectorAll('#title [data-player]')];
  return null;
}
function moveSel(bs, d) { if (!bs.length) return; let i = bs.findIndex(b => b.classList.contains('sel')); bs.forEach(b => b.classList.remove('sel')); i = i < 0 ? (d < 0 ? 0 : bs.length - 1) : (i + d + bs.length) % bs.length; /* (verify) from no pick, Left lands on the left button and Right on the right one */ bs[i].classList.add('sel'); sfx.play('step'); }
// A with nothing picked: every button pulses (no side is favoured), so a mashed A shows where to choose
function pressSel(bs) { if (cardFresh()) return; const b = bs.find(x => x.classList.contains('sel')) || (bs.length === 1 ? bs[0] : null); if (b) { b.click(); return; }
  for (const x of bs) { x.classList.remove('pulse'); void x.offsetWidth; x.classList.add('pulse'); } sfx.play('step'); }
// Back (the pad's B on a card): close the menu, or press the card's Back / Not yet / No / Keep playing
function back() { if (menuOpen) { closeMenu(); return; } if (cardFresh()) return; const b = [...$('askChoices').querySelectorAll('button:not([disabled])')].find(x => /^(Back|Not yet|No|Keep playing)\b/i.test(x.textContent.trim())); if (b) b.click(); }
function pressA() { const bs = screenButtons(); if (bs) pressSel(bs); else act(); }

// Start: the menu. It pauses (a card is open) and holds what the Look, Market and Voice buttons used to do.
// In a cinematic the story's voice pauses with the picture and picks up where it was on "Keep playing".
let voicePaused = false;
function closeMenu() { closeCard(); if (voicePaused) { voicePaused = false; speech.resumeVoice?.(); } }
function openMenu() {
  if (!$('title').classList.contains('hidden')) return;
  if (menuOpen) { closeMenu(); return; } if (asking) return;
  const fc = fightCine(), cine = cinematic(proPlayable());
  if (cine && speech.pauseVoice) { speech.pauseVoice(); voicePaused = true; }
  const canLook = !(fight.active && fight.done) && (mode === 'fight' || mode === 'approach' || mode === 'hub');
  const choices = [{ label: 'Keep playing', go: true, sel: true, on: () => closeMenu() }];
  if (canLook) choices.push({ label: mode === 'hub' ? 'Look around' : 'Look at the pile', on: () => { closeMenu(); setLook(true); } });
  if (fc) choices.push({ label: 'Skip to the end', on: () => { closeMenu(); hush(); if (fight.skipCinematic) fight.skipCinematic(); else doSkip(); } });   // the level is won: never throw it away
  else if (mode !== 'hub') choices.push({ label: 'Back to the market', on: () => { closeMenu(); goMarket(); } });
  choices.push({ label: narrationOn() ? 'Read aloud: on' : 'Read aloud: off', on: () => { setNarration(!narrationOn()); closeMenu(); openMenu(); } });
  choices.push({ label: voiceOn() ? 'Sound: on' : 'Sound: off', on: () => { toggleSound(); closeMenu(); openMenu(); } });
  choices.push({ label: 'For grown-ups', silent: true, on: () => { closeMenu(); openGrownups(); } });   // never read aloud
  setLook(false); card('Paused', MENU_HELP(), choices); menuOpen = true;
}

// the mouse is A. One exception, in the town only: a click on open ground, with nothing in reach to act on, walks her there.
const ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _hit = new THREE.Vector3(), GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundPoint(cx, cy) { _ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(_ndc, camera); return ray.ray.intersectPlane(GROUND, _hit); }
// With the trackpad stick on (PAD_ON), the mouse is the stick instead: a click on the game locks the pointer (that click is
// only the lock), and while locked a click is A and the finger's glide steers (stick.js createPad). Esc gives the pointer
// back and opens the menu; the next click locks again, and so does the click that closes a card. A browser that refuses
// the lock gets press-and-drag: the press point is the stick's centre, a quick click without a drag is A.
const canvasEl = renderer.domElement;
function setPadMode(on) {
  if (on === padMode() || touchUI()) return; document.body.classList.toggle('pad', on);
  if (!on) { pad1.reset(); padUnlock(); }   // the keys take over: no stored tilt walks her on after the key is let go, and the pointer comes back (padUnlock: no menu)
  lastPrompt = undefined; lastProPrompt = null; if (hintKey) setHint(hintKey, { silent: true });   // the town's prompt verb comes back on the next frame (lastPrompt)
  if (on && narrationOn?.()) narrateHint(SAY_MOVE(), 'pad');   // said once a session: Alex can't read the bar
}
function padLock() {
  if (!PAD_ON || touchUI() || padLocked || padLockPending || !canvasEl.requestPointerLock) return; padLockPending = true;   // never on a touch screen (iPad: a tap is not a lock)
  try { const r = canvasEl.requestPointerLock(); r?.catch?.(() => { padLockPending = false; }); } catch { padLockPending = false; }
}
function padUnlock() { if (padLocked || padLockPending) { padSelfUnlock = true; padLockPending = false; document.exitPointerLock?.(); } }
document.addEventListener('pointerlockchange', () => {
  const was = padLocked; padLocked = document.pointerLockElement === canvasEl; padLockPending = false;
  if (padLocked) { pad1.dragEnd(); pad1.reset(); padWanted = true; setPadMode(true); padSelfUnlock = false; return; }
  if (!was) return; pad1.reset(); mouseHeld = false;
  // Esc (the browser keeps the key itself) opens the menu; a lock lost to Cmd-Tab, a banner or a hidden tab does not.
  // The blur can land just after the lock change, so look again a moment later before deciding it was Esc.
  if (!padSelfUnlock) setTimeout(() => { const away = !document.hasFocus() || document.visibilityState !== 'visible' || performance.now() - padBlurAt < 400;
    if (!away && !padLocked && !asking && !menuOpen && $('title').classList.contains('hidden')) { padMenuAt = performance.now(); openMenu(); } }, 150);
  padSelfUnlock = false; });
let padBlurAt = -1e9; addEventListener('blur', () => { padBlurAt = performance.now(); });
document.addEventListener('pointerlockerror', () => { padLockPending = false; });
addEventListener('mousemove', e => { if (padLocked) { pad1.feed(e.movementX, e.movementY); poked = true; } else if (pad1.dragging) { pad1.dragTo(e.clientX, e.clientY); if (pad1.mag > 0) setPadMode(true); } });
addEventListener('pointerup', e => { if (e.pointerType === 'touch' || e.pointerType === 'pen') return; mouseHeld = false; if (pad1.dragging && pad1.dragEnd() === 'tap') pressA(); });
// a click that closes a card (or picks a gerbil on the title) hands the game back: lock again if the mouse was the stick
document.addEventListener('click', e => { if (!PAD_ON || touchUI() || e.pointerType === 'touch' || !e.detail) return;
  if (e.target?.closest?.('#title [data-player]')) padWanted = true;
  if (padWanted && !padLocked && !asking && $('title').classList.contains('hidden') && e.target !== canvasEl && !e.target?.closest?.('#menuBtn, a')) padLock(); });
canvasEl.addEventListener('pointerdown', e => { sfx.init(); if (asking || e.pointerType === 'touch' || e.pointerType === 'pen' || e.button !== 0) return;
  if (PAD_ON && $('title').classList.contains('hidden')) { mouseHeld = true;
    if (padLocked) { pressA(); return; }                                           // locked: the click is A
    pad1.dragStart(e.clientX, e.clientY); padLock(); return; }                    // the lock (and, until it lands, the drag)
  if (mode === 'hub' && !look && !hub.prompt && $('title').classList.contains('hidden')) { const p = groundPoint(e.clientX, e.clientY), bx = hub.box;
    if (p && bx) { p.x = Math.max(bx.x0, Math.min(bx.x1, p.x)); p.z = Math.max(bx.z0, Math.min(bx.z1, p.z)); }   // never a walk off the edge of the town
    if (p && Math.hypot(p.x - player.position.x, p.z - player.position.z) > .6) { walkTo = { x: p.x, z: p.z, best: 1e9, stuckT: 0 }; ring.position.set(p.x, footHeight(p.x, p.z) + .03, p.z); ring.visible = true; return; } }
  act(); });
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
// touch: the first finger is the joystick (it appears where the thumb lands); a quick tap is A
renderer.domElement.addEventListener('touchstart', e => { sfx.init(); e.preventDefault(); setTouchUI(); const now = performance.now();
  for (let i = 0; i < e.changedTouches.length; i++) { stick1.down(e.changedTouches[i], now); } }, { passive: false });
renderer.domElement.addEventListener('touchmove', e => { e.preventDefault(); for (let i = 0; i < e.changedTouches.length; i++) stick1.move(e.changedTouches[i]); }, { passive: false });
const onTouchEnd = e => { e.preventDefault(); const now = performance.now();
  for (let i = 0; i < e.changedTouches.length; i++) { const r = stick1.up(e.changedTouches[i], now); if (r === 'tap') act(); } };   // a drag is only a walk; a long press in a cinematic is the skip hold (frame)
renderer.domElement.addEventListener('touchend', onTouchEnd, { passive: false }); renderer.domElement.addEventListener('touchcancel', onTouchEnd, { passive: false });
// the on-screen A, B and menu buttons (A and B only on touch screens)
const holdBtn = (el, down, up) => { el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); sfx.init(); el.setPointerCapture?.(e.pointerId); el.classList.add('down'); down(); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => { el.classList.remove('down'); up?.(); }); el.addEventListener('contextmenu', e => e.preventDefault()); };
holdBtn($('aBtn'), () => { aBtnHeld = true; aDownAt = performance.now(); pressA(); }, () => { aBtnHeld = false; }); holdBtn($('bBtn'), () => { bHeld = true; }, () => { bHeld = false; });
$('menuBtn').onclick = e => { sfx.init(); e.currentTarget.blur(); openMenu(); };
// iPad: sound may start only inside a gesture iOS counts as one (touchend, pointerup, click, keydown; a touchstart is not).
// Every such gesture resumes Web Audio and unlocks the voice clips made so far (speech.unlock), so the story's clips can
// start on their own timers later. 'playback' keeps Web Audio playing with the iPad's silent mode on (Safari 16.4+).
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
const unlockAudio = () => { sfx.init(); speech.unlock?.(); };
for (const t of ['touchend', 'pointerup', 'click', 'keydown']) addEventListener(t, unlockAudio, { capture: true, passive: true });
addEventListener('keydown', e => { sfx.init(); keys.add(e.code); if (e.repeat) return; poked = true;   // add before the repeat check: a key held through a card still counts as held after it
  if (padMode() && (NAV[e.code] || A_KEYS.has(e.code))) setPadMode(false);   // a key: the bar shows the keys again (not Shift: it runs with the trackpad too, and leaving pad mode drops the glide)
  if (A_KEYS.has(e.code)) aDownAt = performance.now();
  if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); if (performance.now() - padMenuAt < 500) return; openMenu(); return; }   // the Esc that just released the trackpad already opened it
  const bs = screenButtons();
  if (bs) { if (NAV[e.code]) { e.preventDefault(); moveSel(bs, NAV[e.code]); } else if (A_KEYS.has(e.code)) { e.preventDefault(); pressSel(bs); } return; }
  if (A_KEYS.has(e.code)) { e.preventDefault(); act(); } });
addEventListener('keyup', e => { keys.delete(e.code); if (A_KEYS.has(e.code) && e.target?.tagName === 'BUTTON') e.preventDefault(); });
// the window lost focus: nothing stays held (no stuck run after alt-tab)
const dropInput = () => { keys.clear(); bHeld = aBtnHeld = mouseHeld = false; resetMove(); };
addEventListener('blur', dropInput); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') dropInput(); });
function toggleSound() { sfx.init(); setVoiceOn(!voiceOn()); if (!voiceOn()) stopNarration(); sfx.setMuted(!voiceOn()); }
function goMarket() { stopNarration(); if (mode === 'home') { hub.skipHomecoming?.(); homeDone(); return; } if (mode === 'approach') approach.dispose(); if (mode === 'fight') fight.abort(); if (mode === 'unroll') unroll.abort(); if (mode === 'celebration') { cel.dispose(); closeCard(); } if (mode === 'prologue') { hush(); pro.dispose(); caption('', '', 0); mode = 'hub'; forcePrologue = false; state.prologueSeen = true; save(state); } if (mode === 'beat') { hush(); pro.dispose(); caption('', '', 0); player.visible = true; mode = 'hub'; } enterHub(); }
function gamepad() { const gp = navigator.getGamepads?.()[0]; if (!gp) return null; const b = i => !!gp.buttons[i]?.pressed; return { gp, move: padMove(gp, .2), a: b(0), b: b(1), start: b(9) }; }
let gpAWas = false, gpBWas = false, gpStartWas = false, gpNavWas = 0;

function savePicture() {
  post.render(0); const src = renderer.domElement; const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d'); g.drawImage(src, 0, 0);
  const s = currentStop; const name = NAMES[state.player] || 'A gerbil';   // number-free (C7): no money figure, set count or years
  const lines = s ? [`${name} took back the jar's share from ${s.boss.display_name || s.boss.name}.`, 'When everybody puts a little in the jar, there\'s enough for everybody.'] : [`${name} at the market`, '$20 = one Lego set'];
  const pad = c.width * .03, fs = c.width * .034; g.font = `bold ${fs}px Fredoka, sans-serif`; const boxH = pad * 2 + fs * 2.6;
  g.fillStyle = 'rgba(255,248,231,.94)'; g.fillRect(0, c.height - boxH, c.width, boxH); g.fillStyle = '#2b2418'; g.textAlign = 'left';
  g.fillText(lines[0], pad, c.height - boxH + pad + fs); g.font = `${fs * .8}px Fredoka, sans-serif`; g.fillText(lines[1], pad, c.height - boxH + pad + fs * 2.1);
  g.textAlign = 'right'; g.font = `${fs * .6}px Fredoka, sans-serif`; g.fillStyle = '#7a6a50'; g.fillText('The Gerbil Market · free · millwrightsoftware.com', c.width - pad, c.height - pad * .6);
  c.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `gerbils-${s ? s.id : 'market'}-${name.toLowerCase()}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }, 'image/png');
}

// ---------- title / test params ----------
// the title: the last player's gerbil (or the first) is highlighted, so the first A starts the game
{ const tb = [...document.querySelectorAll('#title [data-player]')]; (tb.find(b => b.dataset.player === state.player) || tb[0])?.classList.add('sel'); }
// the Long Road shows the rows of the bosses this player has beaten (C2/C5: restore on every player load)
function restoreRoad() { try { unroll.longRoad?.restore?.(stops.filter(s => state.beaten?.[s.id]).map(s => s.id)); } catch (e) { console.warn('longRoad.restore failed', e); } }
for (const b of document.querySelectorAll('#title [data-player]')) b.onclick = () => { sfx.init(); switchPlayer(state, b.dataset.player); save(state); for (const st of stops) st.group.scale.setScalar(state.beaten[st.id] ? .3 : 1); restoreRoad(); eggs.refresh?.(); $('title').classList.add('hidden'); showHUD(); play('go'); showLevels(); };
// the title's small, silent "For grown-ups" button (index.html #grownupsBtn)
$('grownupsBtn')?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); sfx.init(); e.currentTarget.blur(); openGrownups(); });
if (params.get('voice') === '0') { setVoiceOn(false); sfx.setMuted?.(true); }   // ?voice=0: silent (headless shots hang on a playing clip)
const auto = params.get('player'); if (auto === 'alex' || auto === 'william') { switchPlayer(state, auto); save(state); for (const st of stops) st.group.scale.setScalar(state.beaten[st.id] ? .3 : 1); $('title').classList.add('hidden'); showHUD(); const at = stops.find(s => s.id === params.get('at')); const un = stops.find(s => s.id === params.get('unroll')); if (params.get('cel')) { state.beaten = Object.fromEntries(stops.map(s => [s.id, {}])); state.celebrated = false; } if (params.get('beaten')) { state.beaten = {}; for (const id of params.get('beaten').split(',')) if (id) state.beaten[id] = { bags: 15 }; } restoreRoad(); if (un) { currentStop = un; mode = 'unroll'; unroll.start(un); } else if (at) { if (params.get('fight') || params.get('win')) { startFightDirect(at); if (params.get('win')) setTimeout(() => fight.debugWin(), 300); } else startLevel(at); } else { showLevels();
    if ((params.get('lookout') || params.get('grownups')) && mode === 'home') { hub.skipHomecoming?.(); homeDone(); }   // these tests start in the town proper
    if (params.get('lookout') && mode === 'hub') setLook(true, 'lookout');   // test: the lookout shot over the Long Road
    if (params.get('grownups') && mode === 'hub') openGrownups(); } }       // test: the grown-ups' page
// the story's own clip lists (prologue.js, celebration.js) when they publish them; today's hard-coded set until then
// (Round 3, C8: never o_flip, o_cant, p_prices_bezos, p_prices_musk, p_news, p_giants: their mp3s say cut lines)
const PRO_CLIPS = pro.clips || ['p_valley', 'p_jar', 'p_giants2', 'p_prices_trump', 'p_jartake2', 'o_buy', 'o_bought', 'o_coin', 'o_school', 'o_leave', 'o_fall', `o_call_${state.player || 'alex'}`];
preload(['go', 'pile_gone', 'v_laugh', 'v_dizzy', ...PRO_CLIPS, ...(cel.clips || ['cel3_share'])]); setDucking(on => sfx.ducking(on));
watchCard($('askBody'), $('askChoices'));   // read what fight.js / approach.js append to an open card

// ?dbg=…: a handle for test pages and the console (the voice loop test drives town → road → heist → town through it)
// advance(seconds) runs the game loop in fixed 1/60 s steps on a virtual clock (timing checks without wall time)
if (params.get('dbg')) window.__game = { camera, stops, startRoad, startFightDirect, enterHub, fight, approach, unroll, hub, pro, cel, closeCard, act, pressA, openMenu, player, m1, keys, state, pad: pad1, setPadMode, get padLocked() { return padLocked; },
  advance(s) { const n = Math.round(s * 60); for (let i = 0; i < n; i++) { clockOff += 1000 / 60; frame(performance.now() + clockOff, i < n - 1); } return mode; },
  get mode() { return mode; }, get asking() { return asking; }, get throttle() { return throttle; }, get camYaw() { return camYaw; }, get cardOpenedAt() { return cardOpenedAt; }, get look() { return look; }, get lookKind() { return lookKind; }, setLook, openGrownups, artMode,
  get numberViolations() { return narrationViolations(); } };
// ---------- loop ----------
let last = performance.now(), clockOff = 0; const _cf = new THREE.Vector3(), _cr = new THREE.Vector3(), _cl = new THREE.Vector3();
// Her gait, every frame main.js shows her: the speed is how far she really went (input, a push off a stall, the opening
// walking her to the shop), so the feet keep pace with the ground; she faces the way she walks; the ground tilts her.
// Main is her one driver (userData.gaitDriver): a module's own animateGerbil(player) call the same frame is ignored.
let gaitV = 0;
function driveGerbil(dt, now, playing, proPlay, px0, pz0) {
  const mine = mode !== 'prologue' && mode !== 'beat' || proPlay;   // prologue.js poses her itself in its scenes (she is hidden in a beat)
  player.userData.gaitDriver = mine; if (!mine || dt <= 0) return;
  const dx = player.position.x - px0, dz = player.position.z - pz0, d = Math.hypot(dx, dz);
  const v = d / dt > 20 ? 0 : Math.min(3.6, d / dt);   // a teleport (a new level) is not a step; the unroll's sprint shows as her fastest run
  gaitV += (v - gaitV) * (1 - Math.exp(-dt * 20));
  if (playing) {
    // something else walked her (the opening's walk to the shop): turn toward where she went, as the input would
    if (m1.speed < .05 && gaitV > .3) { const want = Math.atan2(dx, dz), dd = Math.atan2(Math.sin(want - m1.heading), Math.cos(want - m1.heading)); m1.heading += dd * (1 - Math.exp(-14 * dt)); heading = m1.heading; }
    player.rotation.set(0, m1.heading, 0);
  }
  let ground = null;
  if (playing && mode !== 'prologue') { const h = mode === 'hub' ? footHeight : (x, z) => Math.max(0, env.heightAt(x, z)), fx = Math.sin(player.rotation.y), fz = Math.cos(player.rotation.y), x = player.position.x, z = player.position.z, r = .12;
    _gr.pitch = Math.atan2(h(x + fx * r, z + fz * r) - h(x - fx * r, z - fz * r), 2 * r); _gr.roll = Math.atan2(h(x + fz * r, z - fx * r) - h(x - fz * r, z + fx * r), 2 * r);
    _gr.pitch = Math.max(-.5, Math.min(.5, _gr.pitch)); _gr.roll = Math.max(-.4, Math.min(.4, _gr.roll)); ground = _gr; }
  animateGerbil(player, { speed: gaitV, airborne: false, now, dt, turn: playing ? m1.turn : undefined, ground, driver: true });
}
function tick(now) { frame(now + clockOff); requestAnimationFrame(tick); }
const _gr = { pitch: 0, roll: 0 }; let dbgS = -1, lastProPlay = false, lastProPrompt = null;
// the cinematic clock (sim time in the current mode), the hold-to-skip, the idle re-prompt
let cineKey = '', cineT = 0, holdT = 0, idleT = 0; const idleSaid = {}, spotSaidAt = {};
const SKIP_HOLD = 1.2, SKIP_WAIT = 2, IDLE_FIRST = 20, IDLE_AGAIN = 60;
const fightCine = () => mode === 'fight' && fight.active && !!(fight.cinematic ?? (fight.done && !asking));
// a playable stretch of the opening or of a level's beat (C5): she walks as in the town, A is pro.act(), pro.prompt is on the bar
const proPlayable = () => (mode === 'prologue' || mode === 'beat') && !!pro.playable;
function cinematic(proPlay) { return (mode === 'prologue' || mode === 'beat') && !proPlay || mode === 'unroll' || mode === 'celebration' || mode === 'home' || fightCine(); }
function aHeld(gp) { for (const k of A_KEYS) if (keys.has(k)) return true; return !!gp?.a || aBtnHeld || mouseHeld || stick1.id >= 0 && stick1.mag === 0; }
function doSkip() {
  holdT = 0; sfx.play('whoosh');
  if (mode === 'prologue' || mode === 'beat') { hush(); stopNarration(); pro.skip(); }
  else if (mode === 'unroll') unroll.skip();
  else if (mode === 'celebration') cel.skip();
  else if (mode === 'home') { hub.skipHomecoming?.(); homeDone(); }
  else if (fightCine()) { hush(); if (fight.skipCinematic) fight.skipCinematic(); else if (fight.takedown?.active) fight.takedown.skip(); else if (fight.shatter?.active) fight.shatter.skip(); }
}
const skipEl = $('skipHold'), skipFill = skipEl?.querySelector('.fill');
function skipUI(show, frac) { if (!skipEl) return; skipEl.classList.toggle('hidden', !show); skipEl.classList.toggle('holding', frac > 0); if (skipFill) skipFill.style.strokeDashoffset = String(100 - Math.min(1, frac) * 100); }
camera.position.copy(player.position).add(new THREE.Vector3(-3, 2, 0));
// The opening's playable part, framed like the town camera (Molly big in the lower middle, not a speck in a wide shot):
// CAM.hub's distance and height behind her along the shot's fixed yaw (pro.playYaw), with the same lead. prologue.js's
// own cameraTarget() is not asked here: it would snap the camera back to its far shot.
const _proAim = new THREE.Vector3();
function proPlayCam(dt, playing) {
  camYaw = pro.playYaw ?? -Math.PI / 2; const fx = Math.sin(camYaw), fz = Math.cos(camYaw), C = CAM.hub;
  if (_proAim.distanceToSquared(player.position) > 25) _proAim.copy(player.position); else _proAim.lerp(player.position, 1 - Math.exp(-dt * 10));
  _cl.set(m1.vx, 0, m1.vz).multiplyScalar(RUN_MPS * CAM_LEAD); if (_cl.length() > CAM_LEAD_MAX) _cl.setLength(CAM_LEAD_MAX); if (!playing) _cl.set(0, 0, 0);
  camLead.lerp(_cl, 1 - Math.exp(-dt * 2.5));
  camPos.copy(_proAim).add(camLead); camPos.x -= fx * C.back; camPos.z -= fz * C.back; camPos.y += C.up;
  camLook.copy(_proAim).add(camLead); camLook.x += fx * LOOK_AHEAD; camLook.z += fz * LOOK_AHEAD; camLook.y = _proAim.y + LOOK_Y;
}
// The wall clip (decision 14): in the follow camera, a ray from her head to where the camera wants to be, against the town's
// (hub.cameraBoxes) or the heist's (fight.cameraBoxes) solid boxes. A box in the way pulls the camera in to just short of it
// (0.25 m, never nearer her than 0.9 m), fast (rate 12); it eases back out slowly (rate 3) once the way is clear. Flush
// against a wall even 0.9 m would be inside it, so the camera first swings a little to the side (or up) to the clearest
// nearby angle, and failing that sits just short of the wall (down to 0.35 m) rather than inside it. The swing is only the
// picture: Up still means up the road (camYaw never changes).
const _wcO = new THREE.Vector3(), _wcD = new THREE.Vector3(), _wcC = new THREE.Vector3(), _wcHit = new THREE.Vector3(), _wcRay = new THREE.Ray(), _wcBest = new THREE.Vector3();
const WC_SWING = [[0, 0], [.45, 0], [-.45, 0], [.9, 0], [-.9, 0], [1.3, 0], [-1.3, 0], [0, .35], [.45, .35], [-.45, .35]];   // [yaw, extra pitch] in radians
let wcSwing = new THREE.Vector3();   // the eased direction actually used
function wcAllow(boxes, dir, want) {
  let allow = want; _wcRay.set(_wcO, dir);
  for (const b of boxes) { if (!b || b.containsPoint(_wcO)) continue; if (!_wcRay.intersectBox(b, _wcHit)) continue; const t = _wcHit.distanceTo(_wcO); if (t < want) allow = Math.min(allow, t - .25); }
  return allow;
}
function wallClip(dt) {
  const boxes = mode === 'fight' ? fight.cameraBoxes?.() : mode === 'hub' || mode === 'home' ? hub.cameraBoxes?.() : null;
  _wcO.copy(player.position); _wcO.y += .4; _wcD.subVectors(camPos, _wcO); const want = _wcD.length(); if (want < 1e-3) return; _wcD.divideScalar(want);
  let allow = want; _wcBest.copy(_wcD);
  if (boxes?.length) {
    allow = wcAllow(boxes, _wcD, want);
    if (allow < Math.min(1.6, want * .5)) {   // tight: look for a clearer angle close by (a small penalty per radian keeps it near the base)
      const yaw0 = Math.atan2(_wcD.x, _wcD.z), pitch0 = Math.asin(Math.max(-1, Math.min(1, _wcD.y))); let bestScore = allow;
      for (const [dy, dp] of WC_SWING) { if (!dy && !dp) continue; const p = Math.min(1.1, pitch0 + dp), y = yaw0 + dy;
        _wcC.set(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)); const al = wcAllow(boxes, _wcC, want), sc = al - (Math.abs(dy) + dp * 2) * .6;
        if (sc > bestScore) { bestScore = sc; allow = al; _wcBest.copy(_wcC); } }
    }
    allow = allow >= .9 ? allow : Math.max(.35, allow);   // 0.9 m from her when the wall allows it; backed flush into a wall, just short of it
  }
  if (camCut || !isFinite(clipDist) || wcSwing.lengthSq() < .5) { clipDist = allow; wcSwing.copy(_wcBest); }
  else { clipDist += (allow - clipDist) * (1 - Math.exp(-dt * (allow < clipDist ? 12 : 3))); wcSwing.lerp(_wcBest, 1 - Math.exp(-dt * (_wcBest.equals(_wcD) ? 3 : 8))).normalize(); }
  clipDist = Math.min(clipDist, want);
  if (clipDist < want - 1e-3 || wcSwing.dot(_wcD) < .9999) {
    camPos.copy(_wcO).addScaledVector(wcSwing, clipDist);
    for (const b of boxes || []) if (b.containsPoint(camPos) && b.max.y - camPos.y < 1.2) camPos.y = b.max.y + .3;   // still inside a low thing (a stall, the fountain): just over its top
    if (!camCut && allow < want) { camBase.lerp(camPos, 1 - Math.exp(-dt * 12)); camera.position.copy(camBase); }   // aimCam eases at 8: keep up with a fast pull-in (moved together, so aimCam doesn't read it as a cut)
  }
}
function frame(now, noRender = false) {
  const dt = Math.max(0, Math.min(.05, (now - last) / 1000)); last = now; const proPlay = proPlayable();   // the opening's playable part: she walks as in the town, A buys / drops the coin
  const fc = fightCine(), titleUp = !$('title').classList.contains('hidden');
  const playing = !asking && !look && !titleUp && !fc && (mode === 'fight' || mode === 'approach' || mode === 'hub' || proPlay);
  const cine = cinematic(proPlay);
  const ck = mode + (fc ? ':cine' : '') + (proPlay ? ':play' : ''); if (ck !== cineKey) { cineKey = ck; cineT = 0; holdT = 0; if (fc) setHint('skip'); } else if (!menuOpen) cineT += dt;
  document.body.classList.toggle('cine', cine || mode === 'prologue');   // the money panel hides in the story, the payoff and the homecoming
  if (proPlay !== lastProPlay) { lastProPlay = proPlay; if (!proPlay) throttle = 0; if (!proPlay && (mode === 'prologue' || mode === 'beat')) setHint('prologue'); lastProPrompt = null; }
  if (proPlay) { const pr = pro.prompt; if (pr !== lastProPrompt) { lastProPrompt = pr; const verb = K('Space', 'A');
    $('hint').innerHTML = !pr ? '' : /^act: /.test(pr) ? `${verb} to ${pr.replace(/^act: /, '')}` : `${pr} · ${verb} and you walk there`; } }   // spoken by the prologue's own clips
  const gp = gamepad(), gpA = !!gp?.a, aEdge = gpA && !gpAWas, gpB = !!gp?.b, bEdge = gpB && !gpBWas; gpAWas = gpA; gpBWas = gpB;
  if (aEdge) aDownAt = performance.now();
  // Start opens the menu; on a card or the title, the pad's Move picks a button, A presses it, B is Back
  if (gp) { if (gp.start && !gpStartWas) openMenu(); gpStartWas = gp.start;
    const bs = screenButtons(); const nv = gp.move ? (Math.abs(gp.move.x) > Math.abs(gp.move.y) ? Math.sign(gp.move.x) : -Math.sign(gp.move.y)) : 0;
    if (bs) { if (nv && nv !== gpNavWas) moveSel(bs, nv); if (aEdge) pressSel(bs); if (bEdge) back(); } gpNavWas = nv; }
  stick1.show(touchUI() && playing);
  // the trackpad stick: eased every frame; its ring shows while she can walk; a card, the menu or the title gives the pointer back
  if (!playing && (pad1.raw.x || pad1.raw.y || pad1.mag)) pad1.reset();   // a glide during a card or a cinematic never carries into play
  pad1.update(dt); pad1.show(PAD_ON && padMode() && playing && !touchUI());
  if ((asking || titleUp) && (padLocked || padLockPending)) padUnlock();
  // hold A to skip a cinematic (taps, clicks and drags do nothing there); not in its first SKIP_WAIT seconds
  const skippable = cine && !asking && !menuOpen && !titleUp;
  holdT = skippable && cineT > SKIP_WAIT && aHeld(gp) ? holdT + dt : 0; skipUI(skippable && cineT > SKIP_WAIT, holdT / SKIP_HOLD);
  if (holdT >= SKIP_HOLD) doSkip();
  const px0 = player.position.x, pz0 = player.position.z;   // where she was: her real motion this frame drives the gait
  if (look) { if (lookT > 0) { lookT -= dt; if (lookT <= 0) setLook(false); } else if (aEdge && !screenButtons()) act(); if (mode === 'fight') fight.update(dt, now); else if (mode === 'approach') approach.update(dt, now); else hub.update(dt, now); }
  if (playing) {
    if (aEdge) act();
    // Move: keys, else the pad, else the joystick, in screen directions (camYaw: up = away from the viewer); with none of
    // those, the town's click-to-walk, or the opening's walk to the stall. Shift, pad B, the B button or an analog stick
    // pushed all the way runs; so does the same way for a second (stick.js AUTO_RUN).
    const cf = _cf.set(Math.sin(camYaw), 0, Math.cos(camYaw)), cr = _cr.set(-cf.z, 0, cf.x);
    const kx = (P1_KEY('ArrowRight') || P1_KEY('KeyD') ? 1 : 0) - (P1_KEY('ArrowLeft') || P1_KEY('KeyA') ? 1 : 0), ky = (P1_KEY('ArrowUp') || P1_KEY('KeyW') ? 1 : 0) - (P1_KEY('ArrowDown') || P1_KEY('KeyS') ? 1 : 0);
    let sx = 0, sy = 0, mag = 0, full = false;
    if (kx || ky) { const l = Math.hypot(kx, ky); sx = kx / l; sy = ky / l; mag = 1; }
    else if (gp?.move) { const l = Math.hypot(gp.move.x, gp.move.y); sx = gp.move.x / l; sy = gp.move.y / l; mag = gp.move.mag; full = mag >= .95; }
    else if (stick1.mag > 0) { sx = stick1.x / stick1.mag; sy = -stick1.y / stick1.mag; mag = stick1.mag; full = mag >= .95; }
    else if (pad1.mag > 0) { sx = pad1.x / pad1.mag; sy = -pad1.y / pad1.mag; mag = pad1.mag; full = pad1.fullT >= 1; }   // the trackpad: full tilt for a second runs
    let wx = cf.x * sy + cr.x * sx, wz = cf.z * sy + cr.z * sx;
    if (mag) { clearWalk(); poked = true; }
    else if (walkTo) { const dx = walkTo.x - player.position.x, dz = walkTo.z - player.position.z, d = Math.hypot(dx, dz);
      if (d < .5 || walkTo.stuckT > 1 || mode !== 'hub') clearWalk(); else { if (d < walkTo.best - .05) { walkTo.best = d; walkTo.stuckT = 0; } else walkTo.stuckT += dt; wx = dx / d; wz = dz / d; mag = 1; ring.scale.setScalar(1 + Math.sin(now / 180) * .12); } }
    else if (proPlay && pro.walkTarget) { const dx = pro.walkTarget.x - player.position.x, dz = pro.walkTarget.z - player.position.z, d = Math.hypot(dx, dz); if (d > .05) { wx = dx / d; wz = dz / d; mag = 1; } }   // A in the opening: she walks to the stall the way the stick would
    const run = P1_KEY('ShiftLeft') || P1_KEY('ShiftRight') || bHeld || gpB || full;
    throttle = stepMove(m1, wx, wz, mag, run, dt); heading = m1.heading;
    player.position.x += m1.vx * RUN_MPS * dt; player.position.z += m1.vz * RUN_MPS * dt;
    if (mode === 'fight' || mode === 'approach') player.position.y = Math.max(0, env.heightAt(player.position.x, player.position.z));
    if (mode === 'fight') fight.update(dt, now); else if (mode === 'approach') approach.update(dt, now); else if (mode === 'hub') { hub.update(dt, now); hubPrompt(now); }
    if (!proPlay) eggs.update(dt, now);
  } else { m1.vx = m1.vz = 0; m1.sameT = 0; throttle = Math.max(0, throttle - dt * 6); }   // nothing carries over behind a card, the menu or a wide shot
  if (fc && !menuOpen) fight.update(dt, now);   // the takedown and the shatter run inside fight.update
  if (mode === 'home' && !menuOpen) hub.update(dt, now);
  if (mode === 'unroll' && !asking) unroll.update(dt, now);
  if (mode === 'celebration' && !menuOpen) { hubCity.update(dt, now); cel.update(dt, now); }
  if ((mode === 'prologue' || mode === 'beat') && !menuOpen) { hub.update(dt, now); pro.update(dt, now); }
  // a kid who stands still in the town or on the road with nothing open hears the goal again: after 20 s, once more 60 s later
  if (playing && !proPlay && (mode === 'hub' || mode === 'approach') && !poked) idleT += dt; else idleT = 0; poked = false;
  if (goalText && idleT > 0) { const n = idleSaid[goalText] || 0; if (n === 0 && idleT >= IDLE_FIRST || n === 1 && idleT >= IDLE_FIRST + IDLE_AGAIN) { idleSaid[goalText] = n + 1; narrate(goalText, { interrupt: false, stale: 4000 }); } }
  if (mode === 'approach' && approach.active) roadTrail.show(approach.phase === 'road' && !approach.sentBack?.());   // (verify) no forward arrows while she is being sent back for a friend
  hubTrail.update(now); roadTrail.update(now); updateGoal();
  if (toastUntil && now > toastUntil) { toastUntil = 0; $('toast').classList.remove('show'); }   // (verify) a toast never outstays its time, whatever happens to its timer
  // the Long Road: hidden on the road in and in the heist (its rows run along the road), shown everywhere else
  { const want = mode !== 'approach' && mode !== 'fight'; if (want !== roadVis) { roadVis = want; unroll.longRoad?.setVisible?.(want); } }
  driveGerbil(dt, now, playing, proPlay, px0, pz0);
  updateBursts(dt); env.update(dt, now, player.position);
  { const hi = camera.position.y > 90; if (hi !== cloudsHidden) { cloudsHidden = hi; for (const m of env.clouds || []) m.visible = !hi; } }   // (verify) the Long Road's chart shot sits at cloud height: no cloud in front of the rows
  // the camera: strip last frame's shake (or take a module's own move as the new base), then one branch aims it
  if (camera.position.distanceToSquared(camWritten) < 1e-10) camera.position.copy(camBase); else { camBase.copy(camera.position); camCut = true; }
  const homeCam = mode === 'home' ? hub.homecomingCamera?.({ paused: menuOpen }) : null;
  if ((mode === 'prologue' || mode === 'beat') && pro.active && !proPlay) { const ct = pro.cameraTarget(); if (ct) aimCam(ct.pos, ct.look, 3, dt); }
  else if (proPlay) { if (pro.takeCut?.()) camCut = true; const pc = pro.playCamera?.(); if (pc) { camYaw = pro.playYaw ?? -Math.PI / 2; aimCam(pc.pos, pc.look, 3, dt); } else { proPlayCam(dt, playing); aimCam(camPos, camLook, 4, dt); } }   // the jar's own shot near the jar (prologue.js playCamera), else framed like the town   // the opening's playable part: framed like the town (its fixed yaw: Up means away from the viewer, and the mapping never turns)
  else if (look) { const ct = lookTarget(dt); aimCam(ct.pos, ct.look, 2.2, dt); }
  else if (homeCam) aimCam(homeCam.pos, homeCam.look, 3, dt);
  else if (mode === 'celebration' && cel.active) { const ct = cel.cameraTarget(); if (ct) aimCam(ct.pos, ct.look, 3, dt); }
  else if (mode === 'fight' && (fightCam = fight.cameraTarget?.())) aimCam(fightCam.pos, fightCam.look, 2.5, dt);   // fight.js frames its own moments (the pull-back at 15)
  else if (fight.takedown?.active) { const ct = fight.takedown.cameraTarget(); if (ct) aimCam(ct.pos, ct.look, 3, dt); }
  else if (fight.shatter?.active) { const ct = fight.shatter.cameraTarget(); if (ct) aimCam(ct.pos, ct.look, 2.5, dt); }
  else if (mode !== 'unroll') { // the follow camera: a fixed angle behind and above, looking up the road (+x); it never turns with her
    camYaw = Math.PI / 2; const C = mode === 'fight' ? CAM.fight : mode === 'hub' || mode === 'home' ? CAM.hub : CAM.near, kz = 1 - Math.exp(-dt * 2);
    // in the heist, frame her and what she is after (fight.focus): aim between them, pull back to fit both
    const f = mode === 'fight' ? fight.focus : null; let back = C.back; _aimT.copy(player.position);
    // F (10/31): lean toward it by at most 3 m and stand at most 1.5 m farther back, so she stays big in the lower middle
    // at the start (aiming at the midpoint of a pile 15 m off pulled the camera so far back she sat at the bottom edge,
    // behind the stalls). Never less than C.back behind her (aiming ahead put the camera on top of her, out of frame).
    if (f) { const dx = f.x - player.position.x, dz = f.z - player.position.z, d = Math.hypot(dx, dz), lean = d > 1e-3 ? Math.min(d * .4, 3) / d : 0;
      _aimT.x += dx * lean; _aimT.z += dz * lean; back = C.back + Math.min(d * .1, 1.5) + Math.max(0, _aimT.x - player.position.x); }
    camBack += (back - camBack) * kz; camUp += (C.up * (back - Math.max(0, _aimT.x - player.position.x)) / C.back - camUp) * kz;   // the height goes with her distance, not the lean
    // the lead: her velocity times CAM_LEAD, capped, eased slowly so a quick wiggle doesn't swing the frame
    _cl.set(m1.vx, 0, m1.vz).multiplyScalar(RUN_MPS * CAM_LEAD); if (_cl.length() > CAM_LEAD_MAX) _cl.setLength(CAM_LEAD_MAX); if (!playing) _cl.set(0, 0, 0);
    camLead.lerp(_cl, 1 - Math.exp(-dt * 2.5));
    camAim.lerp(_aimT, 1 - Math.exp(-dt * 10)); if (camAim.distanceToSquared(_aimT) > 25) { camAim.copy(_aimT); camCut = true; }   // a jump (a new level) cuts
    camPos.copy(camAim).add(camLead); camPos.x -= camBack; camPos.y += camUp;
    camLook.copy(camAim).add(camLead); camLook.x += LOOK_AHEAD; camLook.y = camAim.y + LOOK_Y;
    wallClip(dt);
    aimCam(camPos, camLook, 8, dt); }
  if (params.get('dbg') && params.get('dbg') !== 'voice' && Math.floor(now / 1000) !== dbgS) { dbgS = Math.floor(now / 1000); console.log('dbg', mode, 'look', look, 'cam', camera.position.toArray().map(v => v.toFixed(1)).join(','), 'pro', pro.active, pro.t?.toFixed?.(1)); }
  camera.position.add(juice.update(dt)); camWritten.copy(camera.position);
  P.updateArt?.(camera);   // the sprites face the camera (art layer), once a frame before the render
  if (!noRender) post.render(dt);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); post.setSize(innerWidth, innerHeight); });
requestAnimationFrame(tick);
