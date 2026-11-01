// The bosses (BOSS_IDS) as cartoon humans in suits, T-shirts or sweaters, some carrying a prop (PROPS, mountProps). Built from primitives (no scanned likeness,
// no photographs), animated procedurally. Origin at the feet, facing +z, ~2.05 m tall at scale 1, ~6k triangles each.
//
//   await loadBosses();                       // nothing to fetch today; kept so a glTF base can slot in later
//   const b = makeBoss('trump');              // THREE.Group; b.userData.boss is the controller
//   b.userData.boss.play('walk'); b.userData.boss.setSpeed(1.9); ... each frame: b.userData.boss.update(dt)
//
// Animation names: idle, walk, run, dizzy, cheer, laugh, fall (fall is one-shot and holds its last frame).
import * as THREE from 'three';
import { roundedBox } from './props.js';

export const BOSS_IDS = ['trump', 'bloomberg', 'walton', 'ellison', 'zuckerberg', 'page', 'bezos', 'musk'];   // the ones with a look of their own; any other id gets LOOK.default
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, smooth = THREE.MathUtils.smoothstep;
const PI = Math.PI;

// ---------- looks ----------
const LOOK = {
  trump: { name: 'Trump', skin: 0xf0a35a, jacket: 0x1c2a52, lapel: 0x16213f, pants: 0x1c2a52, shirt: 0xffffff, sleeve: 0x1c2a52, shoe: 0x141414, hair: 0xf5d76e, hands: .052, tie: 0xd7262c, jowls: true, belly: 1.15, chest: 1.0, headShine: false },
  bezos: { name: 'Bezos', skin: 0xe2a67c, jacket: 0x5b6069, lapel: 0x4a4f57, pants: 0x3a5f9a, shirt: 0xffffff, sleeve: 0xf4f4f4, shoe: 0xf2f2f2, hair: null, hands: .07, tie: null, jowls: false, belly: .8, chest: 1.12, headShine: true, glasses: true },
  musk: { name: 'Musk', skin: 0xe8c2a2, jacket: 0x2a2b31, lapel: 0x1a1a1f, pants: 0x1c1c21, shirt: 0x0c0c0e, sleeve: 0x2a2b31, shoe: 0x101012, hair: 0x2b1d14, hands: .07, tie: null, jowls: false, belly: .9, chest: 1.0, headShine: false, pin: true },
  // Ellison: an older man with a sailor's tan, short white hair under a white captain's cap (the yacht), dark suit, open collar
  ellison: { name: 'Ellison', skin: 0xe2a07a, jacket: 0x1b1e26, lapel: 0x12141a, pants: 0x1b1e26, shirt: 0xf4f4f4, sleeve: 0x1b1e26, shoe: 0x141414, hair: null, sideHair: 0xeeece6, captainCap: true, hands: .065, tie: null, jowls: false, belly: .95, chest: 1.0, headShine: false, older: true },
  // Bloomberg (story.look): short and trim, bald on top with a grey fringe, navy suit and tie; a giant megaphone and a VOTE sign
  bloomberg: { name: 'Bloomberg', skin: 0xebb89a, jacket: 0x1f2c4f, lapel: 0x17213c, pants: 0x1f2c4f, shirt: 0xffffff, sleeve: 0x1f2c4f, shoe: 0x141414, hair: null, sideHair: 0xc9c6bf, brow: 0xa9a59d, lines: true, tie: 0x8a2333, hands: .06, jowls: false, belly: .9, chest: .95, size: .9, headShine: true, props: ['megaphone', 'votesign'] },
  // Rob Walton: white hair, glasses, a navy blazer over a blue vest, pushing a giant shopping cart with a football in the seat
  walton: { name: 'Walton', skin: 0xebb595, jacket: 0x1c2747, lapel: 0x141c35, waistcoat: 0x2f6cc0, pants: 0x5a5e66, shirt: 0xffffff, sleeve: 0x1c2747, shoe: 0x2a1c14, hair: 0xf1efea, brow: 0xe6e3dc, lines: true, specs: true, face: 'smile', tie: null, hands: .065, jowls: false, belly: 1.0, chest: 1.0, headShine: false, props: ['cart'] },
  // Zuckerberg: short curly hair, a plain grey T-shirt, a thin gold chain, a giant phone he keeps scrolling, a big grin
  zuckerberg: { name: 'Zuckerberg', skin: 0xf1c9aa, jacket: 0x8f9399, lapel: 0x8f9399, pants: 0x3a4866, shirt: 0x8f9399, sleeve: 0x8f9399, shoe: 0x24262c, hair: 0x4a3122, curls: true, chain: true, bareTee: true, shortSleeve: true, face: 'grin', tie: null, hands: .065, jowls: false, belly: .85, chest: 1.0, headShine: false, props: ['phone'] },
  // Page: short dark hair going grey, stubble, a plain sweater, a giant magnifying glass; quiet, watching
  page: { name: 'Page', skin: 0xe8bb98, jacket: 0x3d4b5e, lapel: 0x3d4b5e, pants: 0x2e3036, shirt: 0x3d4b5e, sleeve: 0x3d4b5e, shoe: 0x1c1c20, hair: 0x3a302a, sideHair: 0x9c978f, stubble: 'rgba(70,62,56,.5)', bareTee: true, sweater: true, face: 'quiet', tie: null, hands: .065, jowls: false, belly: .95, chest: 1.0, headShine: false, props: ['magnifier'] },
  // anyone the data adds before he has a look of his own: a plain grey suit, brown hair, a blue tie
  default: { name: 'Billionaire', skin: 0xe8b890, jacket: 0x4a4e57, lapel: 0x3a3d45, pants: 0x4a4e57, shirt: 0xffffff, sleeve: 0x4a4e57, shoe: 0x141414, hair: 0x5a3a22, hands: .065, tie: 0x2d6fd3, jowls: false, belly: 1.0, chest: 1.0, headShine: false },
};
export const lookFor = id => LOOK[id] || LOOK.default;

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .8, metalness: 0, ...o });
const hex = c => '#' + new THREE.Color(c).getHexString();
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const texCache = new Map(); const memo = (key, fn) => { if (!texCache.has(key)) texCache.set(key, fn()); return texCache.get(key); };
const at = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); return m; };
const ell = (g, x, y, rx, ry, fill, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, PI * 2); g.fillStyle = fill; g.fill(); };
const stroke = (g, w, col) => { g.lineWidth = w; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); };

// ---------- the face: a canvas wrapped on the head sphere. Front of the sphere is u=.25; eyes sit a little above the equator. ----------
// mood: 'smug' (default), 'happy' (open laugh), 'dizzy' (spiral eyes)
export function makeFace(id, mood = 'smug') {
  const L = lookFor(id); const W = 1024, H = 512; const [c, g] = canvas(W, H); const skin = new THREE.Color(L.skin);
  g.fillStyle = hex(skin); g.fillRect(0, 0, W, H);
  // soft shading: darker toward the chin, a warm cheek on each side
  const grad = g.createLinearGradient(0, H * .55, 0, H); grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(80,30,10,.35)'); g.fillStyle = grad; g.fillRect(0, H * .55, W, H * .45);
  const cx = W * .25, eyeY = H * .5, dx = W * .06; const dark = L.brow != null ? hex(L.brow) : id === 'musk' ? '#2a1d14' : id === 'bezos' ? '#3a2a1a' : id === 'trump' ? '#e3b94a' : L.older ? '#d9d5cc' : '#4a3020';
  if (id === 'trump') for (const s of [-1, 1]) ell(g, cx + s * dx, eyeY + 6, 84, 58, 'rgba(255,236,205,.5)'); // the tan line goggles
  for (const s of [-1, 1]) ell(g, cx + s * dx * 1.6, H * .61, 44, 26, id === 'trump' ? 'rgba(255,120,80,.25)' : 'rgba(255,120,120,.18)');
  if (L.lines && !L.older) { // the years without Ellison's white stubble: forehead lines, crow's feet
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(cx - 70 + i * 6, eyeY - 96 - i * 18); g.quadraticCurveTo(cx, eyeY - 106 - i * 18, cx + 70 - i * 6, eyeY - 96 - i * 18); stroke(g, 3, 'rgba(110,50,25,.3)'); }
    for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(cx + s * (dx + 40), eyeY + i * 8); g.lineTo(cx + s * (dx + 62), eyeY + i * 16); stroke(g, 2.5, 'rgba(110,50,25,.35)'); }
  }
  if (L.stubble) { // short beard stubble: a speckle over the jaw and upper lip
    g.fillStyle = L.stubble; for (let i = 0; i < 1600; i++) { const a = PI * (.08 + .84 * ((i * 37) % 101) / 101), r = 95 + ((i * 53) % 70); const x = cx + Math.cos(a) * r * 1.1, y = H * .48 + Math.sin(a) * r * 1.0; if (y > H * .6) g.fillRect(x, y, 3, 3); }
  }
  if (L.older) { // the years: forehead lines, crow's feet, a neat white stubble along the jaw
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(cx - 70 + i * 6, eyeY - 96 - i * 18); g.quadraticCurveTo(cx, eyeY - 106 - i * 18, cx + 70 - i * 6, eyeY - 96 - i * 18); stroke(g, 3, 'rgba(110,50,25,.35)'); }
    for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(cx + s * (dx + 40), eyeY + i * 8); g.lineTo(cx + s * (dx + 62), eyeY + i * 16); stroke(g, 2.5, 'rgba(110,50,25,.4)'); }
    g.fillStyle = 'rgba(240,238,230,.55)'; for (let i = 0; i < 700; i++) { const a = PI * (.15 + .7 * ((i * 37) % 100) / 100), r = 120 + ((i * 53) % 40); const x = cx + Math.cos(a) * r * 1.05, y = H * .5 + Math.sin(a) * r * .95; if (y > H * .66) g.fillRect(x, y, 2, 2); }
  }
  if (mood === 'happy') {
    // eyes squeezed shut with glee, brows high, a wide open laugh with teeth and a tongue
    for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * dx, eyeY + 14, 26, PI * 1.15, PI * 1.85); stroke(g, 9, '#2b1a12'); }
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * dx - 40, eyeY - 44); g.quadraticCurveTo(cx + s * dx, eyeY - 66, cx + s * dx + 40, eyeY - 44); stroke(g, id === 'trump' ? 16 : 10, dark); }
    const my = H * .7; g.beginPath(); g.moveTo(cx - 72, my - 22); g.quadraticCurveTo(cx, my - 36, cx + 72, my - 22); g.quadraticCurveTo(cx + 40, my + 62, cx, my + 66); g.quadraticCurveTo(cx - 40, my + 62, cx - 72, my - 22); g.closePath(); g.fillStyle = '#5a1515'; g.fill(); g.save(); g.clip();
    g.fillStyle = '#fff'; g.fillRect(cx - 80, my - 40, 160, 32); g.strokeStyle = '#d9d0c4'; g.lineWidth = 2; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(cx + i * 18, my - 40); g.lineTo(cx + i * 18, my - 8); g.stroke(); }
    ell(g, cx, my + 58, 42, 26, '#e0607a'); g.restore();
    g.beginPath(); g.moveTo(cx - 72, my - 22); g.quadraticCurveTo(cx, my - 36, cx + 72, my - 22); g.quadraticCurveTo(cx + 40, my + 62, cx, my + 66); g.quadraticCurveTo(cx - 40, my + 62, cx - 72, my - 22); g.closePath(); stroke(g, 5, '#3a1010');
    return tex(c);
  }
  if (mood === 'dizzy') {
    for (const s of [-1, 1]) { ell(g, cx + s * dx, eyeY, 30, 26, '#fff'); g.beginPath(); for (let a = 0; a < PI * 5; a += .15) { const r = 2 + a * 4; g.lineTo(cx + s * dx + Math.cos(a) * r, eyeY + Math.sin(a) * r); } stroke(g, 4, '#1a1a1a'); }
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * dx - 42, eyeY - 48); g.quadraticCurveTo(cx + s * dx, eyeY - 78, cx + s * dx + 42, eyeY - 50); stroke(g, id === 'trump' ? 15 : 9, dark); }
    const my = H * .69; g.beginPath(); for (let x = -56; x <= 56; x += 4) g.lineTo(cx + x, my + Math.sin(x / 9) * 9); stroke(g, 8, '#5a1515');
    return tex(c);
  }
  // ---- smug: the resting face, each his own ----
  if (id === 'trump') {
    for (const s of [-1, 1]) { const x = cx + s * dx; ell(g, x, eyeY, 34, 17, '#fff'); ell(g, x + s * 4, eyeY + 2, 13, 13, '#4a7cc9'); ell(g, x + s * 4, eyeY + 2, 6.5, 6.5, '#101010'); ell(g, x + s * 1, eyeY - 3, 2.5, 2.5, '#fff');
      ell(g, x, eyeY - 14, 40, 14, hex(skin)); // heavy upper lid = the squint
      g.beginPath(); g.moveTo(x - s * 46, eyeY - 40); g.lineTo(x + s * 38, eyeY - 24); stroke(g, 18, dark); } // brows slanting in and down
    // the pout: small puckered mouth, grumpy corners, a shadow under the lower lip
    const my = H * .675; ell(g, cx, my, 38, 23, '#b5473a'); ell(g, cx, my - 3, 22, 11, '#6a2a22'); ell(g, cx, my + 28, 32, 8, 'rgba(90,30,10,.25)');
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 34, my - 2); g.quadraticCurveTo(cx + s * 50, my + 10, cx + s * 52, my + 30); stroke(g, 4, 'rgba(90,30,10,.5)'); }
  } else if (id === 'bezos') {
    for (const s of [-1, 1]) { const x = cx + s * dx; ell(g, x, eyeY, 26, 24, '#fff'); ell(g, x + s * 3, eyeY + 3, 12, 12, '#5a4a3a'); ell(g, x + s * 3, eyeY + 3, 6, 6, '#101010'); ell(g, x - s * 2, eyeY - 4, 3, 3, '#fff');
      g.beginPath(); g.moveTo(x - s * 36, eyeY - 44); g.quadraticCurveTo(x, eyeY - 76, x + s * 34, eyeY - 52); stroke(g, 9, dark); } // the arched brows
    // the grin: ear to ear, all teeth
    const my = H * .685; g.beginPath(); g.moveTo(cx - 92, my - 18); g.quadraticCurveTo(cx, my + 4, cx + 92, my - 18); g.quadraticCurveTo(cx + 60, my + 54, cx, my + 56); g.quadraticCurveTo(cx - 60, my + 54, cx - 92, my - 18); g.closePath(); g.fillStyle = '#4a1414'; g.fill(); g.save(); g.clip();
    g.fillStyle = '#fff'; g.fillRect(cx - 100, my - 30, 200, 44); g.strokeStyle = '#cfc6ba'; g.lineWidth = 2; for (let i = -5; i <= 5; i++) { g.beginPath(); g.moveTo(cx + i * 17, my - 30); g.lineTo(cx + i * 17, my + 14); g.stroke(); } g.restore();
    g.beginPath(); g.moveTo(cx - 92, my - 18); g.quadraticCurveTo(cx, my + 4, cx + 92, my - 18); g.quadraticCurveTo(cx + 60, my + 54, cx, my + 56); g.quadraticCurveTo(cx - 60, my + 54, cx - 92, my - 18); g.closePath(); stroke(g, 4, '#2a0a0a');
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 98, my - 30); g.quadraticCurveTo(cx + s * 112, my - 10, cx + s * 100, my + 20); stroke(g, 3, 'rgba(90,30,10,.45)'); } // laugh lines
  } else if (L.face === 'grin') { // Zuckerberg: wide round eyes, short straight brows, a big closed-teeth grin
    for (const s of [-1, 1]) { const x = cx + s * dx; ell(g, x, eyeY, 28, 26, '#fff'); ell(g, x + s * 2, eyeY + 2, 13, 13, '#5c7186'); ell(g, x + s * 2, eyeY + 2, 6.5, 6.5, '#101010'); ell(g, x - s * 3, eyeY - 4, 3, 3, '#fff');
      g.beginPath(); g.moveTo(x - s * 32, eyeY - 46); g.lineTo(x + s * 32, eyeY - 50); stroke(g, 9, dark); }
    const my = H * .685; const grin = () => { g.beginPath(); g.moveTo(cx - 80, my - 16); g.quadraticCurveTo(cx, my + 2, cx + 80, my - 16); g.quadraticCurveTo(cx + 52, my + 40, cx, my + 42); g.quadraticCurveTo(cx - 52, my + 40, cx - 80, my - 16); g.closePath(); };
    grin(); g.fillStyle = '#4a1414'; g.fill(); g.save(); g.clip(); g.fillStyle = '#fff'; g.fillRect(cx - 90, my - 26, 180, 36); g.strokeStyle = '#cfc6ba'; g.lineWidth = 2; for (let i = -4; i <= 4; i++) { g.beginPath(); g.moveTo(cx + i * 17, my - 26); g.lineTo(cx + i * 17, my + 10); g.stroke(); } g.restore();
    grin(); stroke(g, 4, '#2a0a0a');
  } else if (L.face === 'smile') { // Walton: soft eyes, a kind closed smile, the cheeks lifted
    for (const s of [-1, 1]) { const x = cx + s * dx; ell(g, x, eyeY, 26, 15, '#fff'); ell(g, x, eyeY + 1, 11, 11, '#5b7fa6'); ell(g, x, eyeY + 1, 5.5, 5.5, '#101010'); ell(g, x - s * 2, eyeY - 3, 2.5, 2.5, '#fff');
      ell(g, x, eyeY - 12, 32, 9, hex(skin));
      g.beginPath(); g.moveTo(x - s * 34, eyeY - 34); g.quadraticCurveTo(x, eyeY - 46, x + s * 34, eyeY - 36); stroke(g, 10, dark); }
    const my = H * .69; g.beginPath(); g.moveTo(cx - 58, my - 8); g.quadraticCurveTo(cx, my + 24, cx + 58, my - 8); stroke(g, 6, '#8a3a2e');
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 66, my - 20); g.quadraticCurveTo(cx + s * 74, my - 6, cx + s * 66, my + 6); stroke(g, 3, 'rgba(110,50,25,.4)'); }
  } else if (L.face === 'quiet') { // Page: eyes looking off to one side, level brows, a small flat mouth: watching
    for (const s of [-1, 1]) { const x = cx + s * dx; ell(g, x, eyeY, 27, 19, '#fff'); ell(g, x + 9, eyeY + 1, 12, 12, '#4f6a52'); ell(g, x + 9, eyeY + 1, 6, 6, '#101010'); ell(g, x + 6, eyeY - 3, 2.5, 2.5, '#fff');
      ell(g, x, eyeY - 16, 32, 8, hex(skin));
      g.beginPath(); g.moveTo(x - s * 36, eyeY - 36); g.lineTo(x + s * 34, eyeY - 36); stroke(g, 10, dark); }
    const my = H * .7; g.beginPath(); g.moveTo(cx - 34, my); g.lineTo(cx + 34, my - 2); stroke(g, 6, '#7a3a30');
  } else if (L.older) {
    // narrow, pleased-with-himself eyes under straight white brows; a tight closed-mouth smile, one corner higher
    for (const s of [-1, 1]) { const x = cx + s * dx; ell(g, x, eyeY, 28, 13, '#fff'); ell(g, x + s * 2, eyeY + 1, 11, 11, '#5b7fa6'); ell(g, x + s * 2, eyeY + 1, 5.5, 5.5, '#101010'); ell(g, x - s * 2, eyeY - 3, 2.5, 2.5, '#fff');
      ell(g, x, eyeY - 13, 34, 11, hex(skin)); ell(g, x, eyeY + 15, 30, 7, hex(skin));
      g.beginPath(); g.moveTo(x - s * 40, eyeY - 34); g.lineTo(x + s * 34, eyeY - 38); stroke(g, 11, dark); }
    const my = H * .69; g.beginPath(); g.moveTo(cx - 54, my + 2); g.quadraticCurveTo(cx, my + 18, cx + 58, my - 10); stroke(g, 6, '#8a3a2e');
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 70, my - 40); g.quadraticCurveTo(cx + s * 84, my - 10, cx + s * 72, my + 20); stroke(g, 3, 'rgba(110,50,25,.4)'); }
  } else {
    for (const s of [-1, 1]) { const x = cx + s * dx; ell(g, x, eyeY, 30, 15, '#fff'); ell(g, x + s * 2, eyeY + 1, 12, 12, '#6b5a4a'); ell(g, x + s * 2, eyeY + 1, 6, 6, '#101010'); ell(g, x - s * 2, eyeY - 4, 2.5, 2.5, '#fff');
      ell(g, x, eyeY - 15, 36, 12, hex(skin)); // half-lidded
      const lift = s < 0 ? -22 : 0; g.beginPath(); g.moveTo(x - s * 40, eyeY - 36 + lift * .3); g.quadraticCurveTo(x, eyeY - 56 + lift, x + s * 36, eyeY - 38 + lift * .6); stroke(g, 10, dark); } // one brow up
    // the smirk: thin, lifted on one side, a dimple at the lifted end
    const my = H * .69; g.beginPath(); g.moveTo(cx - 44, my + 10); g.quadraticCurveTo(cx, my + 22, cx + 48, my - 8); stroke(g, 7, '#7a3a30');
    g.beginPath(); g.moveTo(cx + 50, my - 12); g.quadraticCurveTo(cx + 62, my - 4, cx + 56, my + 10); stroke(g, 3, 'rgba(90,30,10,.5)');
  }
  return tex(c);
}

// ---------- the jacket texture: lathe UV, front at u=.5 (we lathe from phiStart=-PI), v=0 hem .. v=1 collar ----------
function jacketTexture(id) {
  const L = lookFor(id); const W = 1024, H = 512; const [c, g] = canvas(W, H); const cx = W / 2;
  g.fillStyle = hex(L.jacket); g.fillRect(0, 0, W, H);
  // fabric: faint diagonal weave
  g.strokeStyle = 'rgba(255,255,255,.035)'; g.lineWidth = 2; for (let x = -H; x < W + H; x += 14) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + H, H); g.stroke(); }
  // the shirt V (or t-shirt) seen between the lapels: collar at top (v≈1), point near the belt
  const vTop = 0.98, vPoint = id === 'musk' ? .72 : .3; const yTop = (1 - vTop) * H, yPt = (1 - vPoint) * H; const half = id === 'musk' ? 70 : 78;
  const shade = '#' + new THREE.Color(L.jacket).multiplyScalar(.78).getHexString();
  if (L.bareTee) { // a plain T-shirt or sweater: no jacket, a round neck, a ribbed hem when it's a sweater
    g.fillStyle = shade; g.beginPath(); g.ellipse(cx, yTop, 92, 38, 0, 0, PI); g.fill(); g.fillStyle = hex(L.jacket); g.beginPath(); g.ellipse(cx, yTop, 74, 26, 0, 0, PI); g.fill();
    if (L.sweater) { g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 3; for (let x = 0; x < W; x += 12) { g.beginPath(); g.moveTo(x, H - 70); g.lineTo(x, H); g.stroke(); } }
    g.fillStyle = shade; g.fillRect(0, H - 22, W, 22); return tex(c);
  }
  if (L.waistcoat) { // Walton: the blue vest shows between the blazer's lapels, a white shirt open at the neck
    g.fillStyle = hex(L.waistcoat); g.beginPath(); g.moveTo(cx - half - 30, yTop); g.lineTo(cx + half + 30, yTop); g.lineTo(cx + 70, H - 22); g.lineTo(cx - 70, H - 22); g.closePath(); g.fill();
    g.fillStyle = hex(L.shirt); g.beginPath(); g.moveTo(cx - 60, yTop); g.lineTo(cx + 60, yTop); g.lineTo(cx, yTop + 150); g.closePath(); g.fill();
    g.fillStyle = '#f2f2f2'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 22, yTop); g.lineTo(cx + s * 70, yTop); g.lineTo(cx + s * 40, yTop + 56); g.closePath(); g.fill(); }
    for (let i = 0; i < 4; i++) ell(g, cx, yTop + 190 + i * 62, 7, 7, '#e8e8ee');
    g.fillStyle = hex(L.lapel); for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * (half + 30), yTop); g.lineTo(cx + s * (half + 80), yTop); g.lineTo(cx + s * 100, H - 22); g.lineTo(cx + s * 70, H - 22); g.closePath(); g.fill(); }
    g.fillStyle = '#15151a'; g.fillRect(0, H - 22, W, 22); return tex(c);
  }
  if (id === 'bezos') { // vest: the shirt shows wide and deep, with a collar
    g.fillStyle = hex(L.shirt); g.beginPath(); g.moveTo(cx - 118, yTop); g.lineTo(cx + 118, yTop); g.lineTo(cx, yPt + 40); g.closePath(); g.fill();
    g.fillStyle = '#e9e3d8'; g.beginPath(); g.moveTo(cx - 118, yTop); g.lineTo(cx - 40, yTop + 70); g.lineTo(cx - 70, yTop + 90); g.lineTo(cx - 130, yTop + 20); g.closePath(); g.fill(); g.beginPath(); g.moveTo(cx + 118, yTop); g.lineTo(cx + 40, yTop + 70); g.lineTo(cx + 70, yTop + 90); g.lineTo(cx + 130, yTop + 20); g.closePath(); g.fill();
    g.fillStyle = '#f7f7f7'; g.beginPath(); g.moveTo(cx - 118, yTop); g.lineTo(cx - 40, yTop + 70); g.lineTo(cx - 70, yTop + 90); g.lineTo(cx - 130, yTop + 20); g.closePath(); g.fill(); g.beginPath(); g.moveTo(cx + 118, yTop); g.lineTo(cx + 40, yTop + 70); g.lineTo(cx + 70, yTop + 90); g.lineTo(cx + 130, yTop + 20); g.closePath(); g.fill();
    g.fillStyle = hex(L.lapel); for (let i = 0; i < 4; i++) ell(g, cx, yPt - 10 - i * 34, 7, 7, '#2a2d33'); // vest buttons
    // the pale shirt also wraps the whole top band (sleeves are separate meshes, this is the collar line)
    g.fillStyle = hex(L.shirt); g.fillRect(0, 0, W, 10);
  } else {
    g.fillStyle = hex(L.shirt); g.beginPath(); g.moveTo(cx - half, yTop); g.lineTo(cx + half, yTop); g.lineTo(cx, yPt); g.closePath(); g.fill();
    // lapels: a darker band along each edge of the V, folding out to the shoulder
    g.fillStyle = hex(L.lapel); for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * half, yTop); g.lineTo(cx + s * (half + 46), yTop); g.lineTo(cx + s * 22, yPt + 30); g.lineTo(cx, yPt); g.closePath(); g.fill(); }
    if (id === 'trump') { // shirt collar points
      g.fillStyle = '#f2f2f2'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 28, yTop); g.lineTo(cx + s * 76, yTop); g.lineTo(cx + s * 50, yTop + 48); g.closePath(); g.fill(); }
    } else { // Musk: black t-shirt with a round neck line, a hint of grey
      g.fillStyle = '#33343a'; g.beginPath(); g.ellipse(cx, yTop + 10, 62, 26, 0, 0, PI); g.fill();
    }
    ell(g, cx + 8, yPt + 56, 7, 7, '#101010'); ell(g, cx + 8, yPt + 96, 7, 7, '#101010'); // jacket buttons
  }
  // hem: a dark belt band at the very bottom
  g.fillStyle = id === 'bezos' ? '#3a2a1a' : '#15151a'; g.fillRect(0, H - 22, W, 22); ell(g, cx, H - 11, 14, 8, id === 'bezos' ? '#d8b25a' : '#9a9aa0'); // buckle
  return tex(c);
}

// ---------- geometry helpers ----------
// body profile: radius as a function of hips-relative height (y=0 at the hip joint, .6 at the shoulder top)
function torsoGeometry(belly = 1, chest = 1) {
  const ctrl = [[-.14, .20], [-.08, .255 * belly], [.02, .29 * belly], [.12, .305 * belly], [.24, .29 * belly * .5 + .29 * chest * .5], [.36, .275 * chest], [.46, .265 * chest], [.52, .25 * chest], [.56, .19 * chest], [.59, .08], [.6, 0]];
  const pts = []; const N = 20; for (let i = 0; i <= N; i++) { const y = -.14 + (.74 * i) / N; let j = 0; while (j < ctrl.length - 2 && ctrl[j + 1][0] < y) j++; const [y0, r0] = ctrl[j], [y1, r1] = ctrl[j + 1]; const t = clamp((y - y0) / (y1 - y0), 0, 1); const r = lerp(r0, r1, smooth(t, 0, 1) * .5 + t * .5); pts.push(new THREE.Vector2(Math.max(r, .001), y)); }
  const g = new THREE.LatheGeometry(pts, 28, -PI, PI * 2); g.computeVertexNormals(); return g;
}
function slab(pts, depth, mat, bevel = .006) { const s = new THREE.Shape(); pts.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath(); const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 }); geo.translate(0, 0, -depth / 2); return new THREE.Mesh(geo, mat); }
function sphere(r, mat, ws = 20, hs = 14) { return new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat); }
function capsule(r, len, mat) { return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 12), mat); }

// ---------- building a boss ----------
const HIP = .92, SHOULDER = { x: .285, y: .49 }, NECK_TOP = .62;
export async function loadBosses() { return true; } // nothing external today; see the file header

export function makeBoss(id = 'trump', { scale = 1 } = {}) {
  const L = lookFor(id); const root = new THREE.Group(); root.name = `boss-${id}`;
  const rig = new THREE.Group(); root.add(rig); const hips = new THREE.Group(); hips.position.y = HIP; rig.add(hips);
  const skinM = L.headShine ? new THREE.MeshPhysicalMaterial({ color: L.skin, roughness: .45, clearcoat: .5, clearcoatRoughness: .3 }) : std(L.skin, { roughness: .7 });
  const skinPlain = std(L.skin, { roughness: .7 }); const jacketM = std(0xffffff, { map: memo(`jacket-${id}`, () => jacketTexture(id)), roughness: .85 }); const sleeveM = std(L.sleeve); const pantsM = std(L.pants, { roughness: .9 }); const shoeM = std(L.shoe, { roughness: L.shoe > 0x800000 ? .6 : .35 });
  const P = {}; // the named pivots
  // --- legs ---
  for (const side of [1, -1]) {
    const hip = new THREE.Group(); hip.position.set(side * .13, -.02, 0); hips.add(hip); const upper = capsule(.1, .22, pantsM); upper.position.y = -.2; hip.add(upper);
    const knee = new THREE.Group(); knee.position.y = -.4; hip.add(knee); const lower = capsule(.085, .24, pantsM); lower.position.y = -.2; knee.add(lower);
    const foot = new THREE.Group(); foot.position.y = -.4; knee.add(foot); const shoe = new THREE.Mesh(roundedBox(.17, .11, .32, .045, 3), shoeM); shoe.position.set(0, -.045, .05); foot.add(shoe);
    if (id === 'bezos') { const sole = new THREE.Mesh(roundedBox(.175, .035, .33, .015, 3), std(0xd8d0c0)); sole.position.set(0, -.085, .05); foot.add(sole); const stripe = new THREE.Mesh(roundedBox(.18, .02, .12, .008, 2), std(0x2d6fd3)); stripe.position.set(0, -.04, .02); foot.add(stripe); }
    P[side > 0 ? 'hipL' : 'hipR'] = hip; P[side > 0 ? 'kneeL' : 'kneeR'] = knee; P[side > 0 ? 'footL' : 'footR'] = foot;
  }
  const crotch = new THREE.Mesh(new THREE.CylinderGeometry(.235, .22, .18, 24), pantsM); crotch.position.y = -.13; hips.add(crotch);
  // --- torso ---
  const spine = new THREE.Group(); hips.add(spine); P.spine = spine;
  const torso = new THREE.Mesh(torsoGeometry(L.belly, L.chest), jacketM); torso.scale.z = .9; spine.add(torso);
  const belly = sphere(.2, std(L.jacket), 20, 14); belly.position.set(0, .09, .1 * L.belly); belly.scale.set(1.25 * L.belly, .9, 1.0 * L.belly); if (id !== 'bezos') spine.add(belly);
  if (L.tie) { // Trump's tie: knot, a blade draped over the belly, then hanging well past the belt
    const tieM = std(L.tie, { roughness: .45 }); const tie = new THREE.Group(); tie.position.set(0, .5, .215); spine.add(tie); P.tie = tie;
    const knot = new THREE.Mesh(roundedBox(.085, .075, .05, .02, 3), tieM); knot.position.set(0, -.015, .02); tie.add(knot);
    const upper = slab([[-.03, 0], [.03, 0], [.065, -.42], [-.065, -.42]], .022, tieM); upper.position.set(0, -.04, .035); upper.rotation.x = -.3; tie.add(upper);
    const lower = new THREE.Group(); lower.position.set(0, -.44, .16); tie.add(lower); P.tieLow = lower;
    const blade = slab([[-.065, 0], [.065, 0], [.075, -.3], [0, -.4], [-.075, -.3]], .022, tieM); blade.position.set(0, .0, .0); blade.rotation.x = .12; lower.add(blade); if (id !== 'trump') lower.scale.y = .4;   // only Trump's hangs past the belt
    const shine = new THREE.Mesh(new THREE.PlaneGeometry(.02, .3), new THREE.MeshBasicMaterial({ color: 0xff8a7a, transparent: true, opacity: .35 })); shine.position.set(-.025, -.17, .013); shine.rotation.x = .12; lower.add(shine);
  }
  if (L.pin) { const pin = new THREE.Group(); pin.position.set(.12, .4, .255); pin.rotation.x = -.5; spine.add(pin); pin.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .035, 10), std(0xf2f2f2, { roughness: .3 })), 0, 0, 0)); pin.add(at(new THREE.Mesh(new THREE.ConeGeometry(.013, .02, 10), std(0xd7262c, { roughness: .3 })), 0, .027, 0)); for (const s of [-1, 1]) pin.add(at(new THREE.Mesh(new THREE.ConeGeometry(.007, .014, 6), std(0xd7262c, { roughness: .3 })), s * .013, -.012, 0)); }
  for (const side of [1, -1]) { const sh = sphere(.095, std(L.jacket), 16, 12); sh.position.set(side * SHOULDER.x * .95, SHOULDER.y, 0); sh.scale.set(1.1, .8, 1); spine.add(sh); }
  // --- arms ---
  const handM = std(L.skin, { roughness: .7 });
  for (const side of [1, -1]) {
    const sh = new THREE.Group(); sh.position.set(side * SHOULDER.x, SHOULDER.y, 0); spine.add(sh);
    const upper = capsule(.078, .2, sleeveM); upper.position.y = -.16; sh.add(upper);
    const el = new THREE.Group(); el.position.y = -.33; sh.add(el); const fore = capsule(.068, .18, L.shortSleeve ? handM : sleeveM); fore.position.y = -.14; el.add(fore);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.072, .072, .035, 16), std(L.bareTee ? new THREE.Color(L.sleeve).multiplyScalar(.78) : L.shirt)); cuff.position.y = -.265; if (id !== 'bezos' && !L.shortSleeve) el.add(cuff);
    if (L.shortSleeve) { const up = capsule(.07, .2, handM); up.position.y = -.16; sh.add(up); upper.scale.set(1.12, .45, 1.12); upper.position.y = -.08; }   // T-shirt: the sleeve stops above the elbow
    const hand = new THREE.Group(); hand.position.y = -.3; el.add(hand); const palm = sphere(L.hands, handM, 14, 10); palm.scale.set(1, 1.15, .75); palm.position.y = -L.hands * .6; hand.add(palm);
    const thumb = sphere(L.hands * .42, handM, 8, 6); thumb.position.set(side * -L.hands * .8, -L.hands * .5, L.hands * .4); hand.add(thumb);
    P[side > 0 ? 'shL' : 'shR'] = sh; P[side > 0 ? 'elL' : 'elR'] = el; P[side > 0 ? 'handL' : 'handR'] = hand;
  }
  // --- neck and head ---
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.085, .1, .14, 16), skinPlain); neck.position.y = NECK_TOP - .05; spine.add(neck);
  const head = new THREE.Group(); head.position.y = NECK_TOP; spine.add(head); P.head = head;
  const face = mood => memo(`face-${id}-${mood}`, () => makeFace(id, mood)); const faces = { smug: face('smug'), happy: face('happy'), dizzy: face('dizzy') };
  const faceM = L.headShine ? new THREE.MeshPhysicalMaterial({ map: faces.smug, roughness: .45, clearcoat: .45, clearcoatRoughness: .3 }) : std(0xffffff, { map: faces.smug, roughness: .7 });
  const skull = new THREE.Mesh(new THREE.SphereGeometry(.24, 30, 20), faceM); skull.position.y = .24; skull.scale.set(1, 1.04, .96); head.add(skull);
  if (L.jowls) { for (const s of [-1, 1]) { const j = sphere(.09, skinPlain, 16, 12); j.position.set(s * .16, .09, .03); j.scale.set(.9, .75, .9); head.add(j); } const chin = sphere(.08, skinPlain, 14, 10); chin.position.set(0, .035, .1); chin.scale.set(1.2, .6, .9); head.add(chin); }
  else if (id === 'bezos') { const chin = sphere(.12, skinM, 16, 12); chin.position.set(0, .025, .05); chin.scale.set(.9, .7, .85); head.add(chin); }
  else { const jaw = sphere(.15, skinPlain, 16, 12); jaw.position.set(0, .05, .02); jaw.scale.set(1.05, .62, .9); head.add(jaw); }
  const nose = sphere(.045, skinPlain, 14, 10); nose.position.set(0, .18, .235); if (id === 'trump') { nose.scale.set(.95, 1.25, 1.3); nose.rotation.x = .35; nose.position.set(0, .17, .24); } else if (id === 'bezos') nose.scale.set(1.0, .9, 1.1); else nose.scale.set(.9, 1.05, 1.15); head.add(nose);
  for (const s of [-1, 1]) { const ear = sphere(.055, skinPlain, 12, 10); ear.position.set(s * .235, .24, -.01); ear.scale.set(.45, 1, .8); head.add(ear); }
  if (L.hair) {
    const hairM = std(L.hair, { roughness: id === 'trump' ? .55 : .85 });
    if (id === 'trump') { // the sweep: a flattened helmet, a shelf jutting forward over the brow, wings combed back over the ears
      const cap = new THREE.Mesh(new THREE.SphereGeometry(.265, 28, 14, 0, PI * 2, 0, PI / 1.95), hairM); cap.position.set(0, .33, -.01); cap.scale.set(1.05, .8, 1.08); cap.rotation.x = -.2; head.add(cap);
      const brim = sphere(.17, hairM, 24, 12); brim.position.set(.02, .375, .15); brim.scale.set(1.2, .3, .9); brim.rotation.x = .22; brim.rotation.z = -.08; head.add(brim);
      const swoop = sphere(.13, hairM, 18, 10); swoop.position.set(-.1, .42, .15); swoop.scale.set(1.05, .34, .95); swoop.rotation.z = .4; swoop.rotation.x = .2; head.add(swoop);
      const crest = sphere(.21, hairM, 20, 10); crest.position.set(.02, .47, .03); crest.scale.set(1.12, .55, 1.12); head.add(crest);
      const flip = sphere(.11, hairM, 16, 10); flip.position.set(.15, .43, .1); flip.scale.set(.7, .32, 1.0); flip.rotation.z = -.5; flip.rotation.x = .15; head.add(flip);
      for (const s of [-1, 1]) { const wing = sphere(.12, hairM, 16, 10); wing.position.set(s * .21, .3, -.03); wing.scale.set(.5, .95, 1.05); head.add(wing); }
    } else { // Musk: dark, neat, a fringe lobe lifted at one side
      const cap = new THREE.Mesh(new THREE.SphereGeometry(.255, 28, 14, 0, PI * 2, 0, PI / 2), hairM); cap.position.set(0, .33, -.01); cap.scale.set(1.03, .78, 1.05); cap.rotation.x = -.32; head.add(cap);
      const fringe = sphere(.12, hairM, 18, 10); fringe.position.set(.06, .41, .17); fringe.scale.set(1.35, .4, .75); fringe.rotation.z = -.2; fringe.rotation.x = .45; head.add(fringe);
      const side2 = sphere(.09, hairM, 14, 8); side2.position.set(-.14, .4, .14); side2.scale.set(1.0, .4, .8); side2.rotation.z = .55; side2.rotation.x = .3; head.add(side2);
      for (const s of [-1, 1]) { const wing = sphere(.1, hairM, 14, 10); wing.position.set(s * .215, .3, -.04); wing.scale.set(.4, .9, 1.0); head.add(wing); }
    }
  }
  if (L.glasses) { // aviator-ish sunglasses riding the nose
    const lensM = new THREE.MeshPhysicalMaterial({ color: 0x0f1216, roughness: .15, metalness: .2, clearcoat: 1, clearcoatRoughness: .05 }); const frameM = std(0x2a2a2e, { roughness: .35, metalness: .5 });
    for (const s of [-1, 1]) { const lens = new THREE.Mesh(roundedBox(.13, .09, .03, .03, 3), lensM); lens.position.set(s * .095, .245, .222); lens.rotation.y = s * .42; lens.rotation.x = .05; head.add(lens); const arm = new THREE.Mesh(roundedBox(.012, .014, .2, .005, 2), frameM); arm.position.set(s * .2, .25, .1); arm.rotation.y = s * .32; head.add(arm); const hinge = new THREE.Mesh(roundedBox(.03, .014, .014, .005, 2), frameM); hinge.position.set(s * .158, .25, .18); hinge.rotation.y = s * .6; head.add(hinge); }
    const bridge = new THREE.Mesh(roundedBox(.05, .016, .016, .006, 2), frameM); bridge.position.set(0, .255, .25); head.add(bridge);
  }
  addHeadExtras(L, head, std);
  // dizzy stars: a ring of little yellow stars that orbit the head while he staggers
  const stars = new THREE.Group(); stars.position.y = .56; head.add(stars); const starM = new THREE.MeshBasicMaterial({ color: 0xffd84a }); for (let i = 0; i < 5; i++) { const st = new THREE.Mesh(new THREE.OctahedronGeometry(.035, 0), starM); const a = i / 5 * PI * 2; st.position.set(Math.cos(a) * .3, Math.sin(a * 2) * .03, Math.sin(a) * .3); st.scale.y = 1.6; stars.add(st); } stars.visible = false;
  root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); stars.traverse(m => { if (m.isMesh) m.castShadow = false; });
  root.scale.setScalar(scale * (L.size || 1));
  root.userData.boss = makeController(id, { root, rig, hips, P, stars, faceM, faces, head });
  root.userData.boss.name = L.name; root.userData.boss.height = 2.05 * (L.size || 1);
  mountProps(L, root, { r: P.handR, l: P.handL, off: new THREE.Vector3(0, -L.hands * .9, 0) }, std);
  return root;
}

// the extras some heads carry, shared with bosses2.js: short white hair at the sides and a white captain's cap (Ellison)
export function addHeadExtras(L, head, std) {
  if (L.sideHair) { const hm = std(L.sideHair, { roughness: .9 }); for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.SphereGeometry(.1, 14, 10), hm); w.position.set(s * .218, .3, -.05); w.scale.set(.42, .8, 1.05); head.add(w); }
    const back = new THREE.Mesh(new THREE.SphereGeometry(.2, 18, 10), hm); back.position.set(0, .3, -.12); back.scale.set(1.15, .7, .7); head.add(back); }
  if (L.captainCap) {
    const white = std(0xf6f5f0, { roughness: .6 }), navy = std(0x1d2b4a, { roughness: .5 }), gold = std(0xe0b040, { roughness: .35, metalness: .6 }), black = std(0x15161a, { roughness: .3 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, .07, 28), navy); band.position.set(0, .43, -.01); band.rotation.x = -.12; head.add(band);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(.3, .25, .1, 28), white); crown.position.set(0, .51, -.02); crown.rotation.x = -.12; head.add(crown);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .02, 28), white); top.position.set(0, .565, -.03); top.rotation.x = -.12; head.add(top);
    const brim = new THREE.Mesh(new THREE.SphereGeometry(.17, 20, 8, 0, PI * 2, 0, PI / 2), black); brim.position.set(0, .41, .17); brim.scale.set(1.1, .25, .8); brim.rotation.x = .25; head.add(brim);
    const badge = new THREE.Mesh(new THREE.SphereGeometry(.04, 12, 8), gold); badge.position.set(0, .47, .245); badge.scale.set(1.3, 1, .4); head.add(badge);
    for (const s of [-1, 1]) { const leaf = new THREE.Mesh(new THREE.SphereGeometry(.03, 8, 6), gold); leaf.position.set(s * .06, .455, .24); leaf.scale.set(1.5, .6, .4); leaf.rotation.z = s * .4; head.add(leaf); }
  }
  if (L.specs) { // Walton: thin gold-rimmed reading glasses with clear lenses (the eyes show through)
    const rimM = std(0xb8963a, { roughness: .35, metalness: .7 }), glassM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .05, transparent: true, opacity: .18, clearcoat: 1 });
    for (const s of [-1, 1]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(.055, .008, 8, 24), rimM); rim.position.set(s * .09, .245, .226); rim.rotation.y = s * .4; rim.scale.y = .8; head.add(rim);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(.055, 20), glassM); lens.position.copy(rim.position); lens.rotation.y = rim.rotation.y; lens.scale.y = .8; head.add(lens);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(.005, .005, .2, 6), rimM); arm.rotation.x = PI / 2; arm.rotation.y = s * .3; arm.position.set(s * .2, .25, .11); head.add(arm); }
    const bridge = new THREE.Mesh(new THREE.TorusGeometry(.022, .006, 6, 12, PI), rimM); bridge.position.set(0, .248, .245); head.add(bridge);
  }
  if (L.curls) { // Zuckerberg: short curls, a crop of little bumps over the hair cap and along the front
    const cm = std(L.hair, { roughness: .9 }); const g = new THREE.SphereGeometry(.045, 10, 8);
    for (let i = 0; i < 46; i++) { const u = (i * .618034) % 1, v = (i + .5) / 46; const th = u * PI * 2, ph = Math.acos(1 - v * .95); const y = Math.cos(ph), r = Math.sin(ph);
      const z = Math.cos(th) * r; if (z > .55 && y < .5) continue;   // keep the forehead clear
      const b = new THREE.Mesh(g, cm); b.position.set(Math.sin(th) * r * .262, .3 + y * .2, -.01 + z * .262); head.add(b); }
    for (let i = -3; i <= 3; i++) { const b = new THREE.Mesh(g, cm); b.position.set(i * .045, .42 - Math.abs(i) * .012, .19 - Math.abs(i) * .012); head.add(b); }   // the front line
  }
  if (L.chain) { // a thin gold chain that sits on the T-shirt below the neck
    const ch = new THREE.Mesh(new THREE.TorusGeometry(.13, .009, 6, 32), std(0xe0b040, { roughness: .3, metalness: .8 })); ch.position.set(0, -.09, .04); ch.rotation.x = PI / 2 - .5; ch.scale.set(1, 1.1, 1); head.add(ch);
  }
}

// ---------- props: what each boss carries (story.look), built "held upright in front of him, facing forward" ----------
// Grip at the origin, up is +y, the business end faces +z. Hand props follow the hand; the cart stands on the ground in front.
function propCanvas(w, h, draw) { const [c, g] = canvas(w, h); draw(g, w, h); return tex(c); }
const PROPS = {
  megaphone(std) { // Bloomberg: a big red-and-white megaphone with a pistol grip
    const o = new THREE.Group(); const red = std(0xd7262c, { roughness: .45 }), white = std(0xf4f1ea, { roughness: .5 }), dark = std(0x2a2a2e, { roughness: .6 });
    o.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.035, .04, .16, 12), dark), 0, .02, 0));
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(.26, .07, .55, 24, 1, true), white); bell.material.side = THREE.DoubleSide; bell.rotation.x = PI / 2; bell.position.set(0, .16, .25); o.add(bell);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.26, .025, 8, 28), red); rim.position.set(0, .16, .525); o.add(rim);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .14, 16), red); back.rotation.x = PI / 2; back.position.set(0, .16, -.05); o.add(back);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(.172, .16, .06, 20, 1, true), std(0xd7262c, { roughness: .45, side: THREE.DoubleSide })); band.rotation.x = PI / 2; band.position.set(0, .16, .27); o.add(band);
    return o;
  },
  votesign(std) { // Bloomberg: a campaign sign on a stick, VOTE over a little drawing of his own face
    const o = new THREE.Group(); o.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, 1.0, 8), std(0xc8a070)), 0, .3, 0));
    const map = propCanvas(512, 360, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#1f2c4f'; g.fillRect(0, 0, w, 26); g.fillRect(0, h - 26, w, 26);
      ell(g, 130, 190, 78, 92, '#ebb89a'); ell(g, 60, 190, 18, 36, '#c9c6bf'); ell(g, 200, 190, 18, 36, '#c9c6bf'); for (const s of [-1, 1]) ell(g, 130 + s * 28, 175, 8, 8, '#222'); g.beginPath(); g.moveTo(102, 230); g.quadraticCurveTo(130, 250, 158, 228); stroke(g, 6, '#8a3a2e');
      g.fillStyle = '#d7262c'; g.font = 'bold 120px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('VOTE', 360, 190); });
    const face = new THREE.MeshStandardMaterial({ map, roughness: .7 }), edge = std(0xf4f4f4);
    const board = new THREE.Mesh(new THREE.BoxGeometry(.6, .42, .02), [edge, edge, edge, edge, face, face]); board.position.set(0, .95, 0); o.add(board);
    return o;
  },
  phone(std) { // Zuckerberg: a giant phone, its screen a wall of made-up app tiles that keeps scrolling up
    const o = new THREE.Group(); const body = new THREE.Mesh(roundedBox(.34, .62, .05, .04, 3), std(0x1a1b20, { roughness: .3, metalness: .4 })); body.position.set(0, .26, 0); o.add(body);
    const cols = ['#ff5a5f', '#ffb400', '#00a699', '#3b82f6', '#8b5cf6', '#ec4899', '#22c55e', '#f97316'];
    const map = propCanvas(256, 512, (g, w, h) => { g.fillStyle = '#0d1b2a'; g.fillRect(0, 0, w, h); for (let r = 0; r < 8; r++) for (let k = 0; k < 3; k++) { const x = 18 + k * 80, y = 14 + r * 64; g.fillStyle = cols[(r * 3 + k * 5) % cols.length]; g.beginPath(); g.roundRect(x, y, 60, 50, 14); g.fill(); ell(g, x + 30, y + 25, 12, 12, 'rgba(255,255,255,.7)'); } });
    map.wrapT = THREE.RepeatWrapping; map.repeat.set(1, .55);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(.29, .54), new THREE.MeshBasicMaterial({ map })); screen.position.set(0, .26, .027); o.add(screen);
    screen.onBeforeRender = () => { map.offset.y = (performance.now() / 1000 * .25) % 1; };   // the endless scroll
    return o;
  },
  magnifier(std) { // Page: a giant magnifying glass, a wooden handle, a brass ring, a pale lens
    const o = new THREE.Group(); o.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.03, .038, .34, 12), std(0x7a4a26, { roughness: .6 })), 0, .02, 0));
    const brass = std(0xc9a040, { roughness: .3, metalness: .7 }); o.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.042, .042, .06, 12), brass), 0, .2, 0));
    o.add(at(new THREE.Mesh(new THREE.TorusGeometry(.22, .032, 10, 36), brass), 0, .45, 0));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(.215, 32), new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, roughness: .05, transparent: true, opacity: .35, clearcoat: 1, side: THREE.DoubleSide })); lens.position.set(0, .45, 0); o.add(lens);
    return o;
  },
  cart(std) { // Walton: a giant shopping cart, wire basket, a football in the child seat (orange and blue, no logo)
    const o = new THREE.Group(); const wire = std(0xb9bec6, { roughness: .3, metalness: .7 }), handle = std(0x2f6cc0, { roughness: .5 }), tyre = std(0x1a1a1a, { roughness: .8 });
    const map = propCanvas(256, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 7; for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } });
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(2, 1.4);
    const mesh = new THREE.MeshStandardMaterial({ color: 0xb9bec6, map, alphaMap: map, transparent: true, alphaTest: .4, side: THREE.DoubleSide, roughness: .35, metalness: .6 });
    const basket = new THREE.Group(); basket.position.set(0, .78, .55); o.add(basket);   // open on top: four wire sides and a floor
    for (const [w, h, x, y, z, ry, rx] of [[.9, .48, -.33, 0, 0, PI / 2, 0], [.9, .48, .33, 0, 0, PI / 2, 0], [.66, .48, 0, 0, .45, 0, 0], [.66, .48, 0, 0, -.45, 0, 0], [.66, .9, 0, -.24, 0, 0, PI / 2]]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mesh); pl.position.set(x, y, z); pl.rotation.set(rx, ry, 0); basket.add(pl); }
    for (const [len, x, z, ry] of [[.9, -.33, 0, 0], [.9, .33, 0, 0], [.66, 0, .45, PI / 2], [.66, 0, -.45, PI / 2]]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, len, 6), wire); if (ry) r.rotation.z = PI / 2; else r.rotation.x = PI / 2; r.position.set(x, .24, z); basket.add(r); }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .72, 12), handle); bar.rotation.z = PI / 2; bar.position.set(0, 1.1, .02); o.add(bar);
    for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, .2, 8), wire); post.position.set(s * .34, 1.03, .06); post.rotation.x = .3; o.add(post); }
    for (const s of [-1, 1]) for (const z of [.18, .95]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, .5, 6), wire); leg.position.set(s * .28, .3, z); o.add(leg);
      const w = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .04, 14), tyre); w.rotation.z = PI / 2; w.position.set(s * .28, .055, z); o.add(w); }
    const base = new THREE.Mesh(new THREE.BoxGeometry(.6, .025, .85), wire); base.position.set(0, .2, .57); o.add(base);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(.5, .04, .26), std(0xd7262c, { roughness: .6 })); seat.position.set(0, .98, .2); o.add(seat);
    const ball = new THREE.Group(); ball.position.set(0, 1.07, .2); ball.rotation.set(.2, .5, .25); o.add(ball);
    const leather = new THREE.Mesh(new THREE.SphereGeometry(.09, 18, 12), std(0xf26b1d, { roughness: .6 })); leather.scale.set(1.65, 1, 1); ball.add(leather);
    for (const x of [-.09, .09]) { const st = new THREE.Mesh(new THREE.TorusGeometry(.078, .012, 6, 20), std(0x1c2b5a, { roughness: .6 })); st.position.x = x; st.rotation.y = PI / 2; st.scale.setScalar(1 - Math.abs(x) * 1.6); ball.add(st); }
    return o;
  },
};
// Hand props mount on a slot under the hand, turned so the prop stands upright in front of him in the idle pose; the cart
// goes on the root. hands = { r, l, off }: the hand pivots and the fist's offset from the pivot (hand-local).
// The controller gets .props (the prop groups) so a scene can hide them: boss.userData.boss.props?.forEach(p => p.visible = false).
export function mountProps(L, root, hands, std) {
  const list = L.props || [], out = []; if (root.userData.boss) root.userData.boss.props = out; if (!list.length) return out;
  root.updateMatrixWorld(true); const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v = new THREE.Vector3();
  list.forEach((name, i) => {
    const build = PROPS[name]; if (!build) return; const prop = build(std); prop.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    prop.name = `prop-${name}`; out.push(prop);
    if (name === 'cart') { prop.position.set(0, 0, .25); prop.scale.setScalar(1.15); root.add(prop); return; }
    const hand = i === 0 ? hands.r : hands.l; if (!hand) return;
    const slot = new THREE.Group(); slot.position.copy(hands.off); hand.add(slot);
    m.multiplyMatrices(rootInv, hand.matrixWorld); m.decompose(v, q, sc); slot.quaternion.copy(q).invert(); slot.scale.set(1 / sc.x, 1 / sc.y, 1 / sc.z);
    prop.position.set(0, -.03, .1); slot.add(prop);   // a hand's width in front of the fist
  });
  return out;
}

// ---------- animation: clips write a pose, poses crossfade, the pose drives the pivots ----------
const POSE0 = { rootY: 0, rootRX: 0, rootRY: 0, rootRZ: 0, hipsY: 0, hipsRX: 0, hipsRY: 0, hipsRZ: 0, spineRX: 0, spineRY: 0, spineRZ: 0, headRX: 0, headRY: 0, headRZ: 0,
  armFwdL: 0, armFwdR: 0, armOutL: .14, armOutR: .14, armTwistL: 0, armTwistR: 0, elbowL: .18, elbowR: .18, handL: 0, handR: 0,
  legFwdL: 0, legFwdR: 0, legOutL: .03, legOutR: .03, kneeL: .04, kneeR: .04, footL: 0, footR: 0, tie: 0, tieLow: 0, stars: 0 };
const KEYS = Object.keys(POSE0);
const sin = Math.sin, cos = Math.cos, pos = x => Math.max(0, x);

const CLIPS = {
  idle: { loop: true, mood: 'smug', fn(t, ph, p, F) {
    const br = sin(t * 2.0); p.spineRX = -.1 + .015 * br; p.headRX = -.14 + .02 * br; p.headRY = .3 * sin(t * .6) ; p.headRZ = .04 * sin(t * .9);
    p.hipsRZ = .025 * sin(t * 1.1); p.hipsY = .006 * br; p.hipsRY = .05 * sin(t * .6);
    // hands in front of the belly, the pompous little pump
    const pump = sin(t * 3.1); p.armOutL = p.armOutR = .34; p.armFwdL = .55 + .05 * pump; p.armFwdR = .55 - .05 * pump; p.elbowL = 1.4 + .12 * pump; p.elbowR = 1.4 - .12 * pump; p.armTwistL = -.35; p.armTwistR = .35; p.handL = -.3 + .2 * pump; p.handR = -.3 - .2 * pump;
    p.legOutL = p.legOutR = .1; p.kneeL = p.kneeR = .06; p.tie = .03 * br;
    if (F === 'bezos') { p.headRX = -.2; p.armFwdL = p.armFwdR = .15; p.elbowL = p.elbowR = .35; p.armOutL = p.armOutR = .3; p.handL = p.handR = .4; p.spineRX = -.14; } // chest out, arms wide, grinning at you
    if (F === 'musk') { p.armFwdL = .2; p.elbowL = .3; p.armFwdR = .7; p.elbowR = 1.9; p.armTwistR = .6; p.handR = .6; p.headRZ = .1 + .04 * sin(t * .9); p.headRY = .2 + .25 * sin(t * .6); } // one hand up at the chin, head tilted
  } },
  walk: { loop: true, mood: 'smug', fn(t, ph, p) {
    const L = sin(ph), R = sin(ph + PI); p.legFwdL = .55 * L; p.legFwdR = .55 * R; p.kneeL = .14 + .85 * pos(cos(ph)); p.kneeR = .14 + .85 * pos(cos(ph + PI)); p.footL = .25 * pos(-L); p.footR = .25 * pos(-R);
    p.hipsY = .022 * cos(2 * ph) - .012; p.hipsRY = .14 * L; p.spineRY = -.1 * L; p.hipsRZ = .05 * cos(ph); p.spineRZ = -.03 * cos(ph);
    p.spineRX = -.14; p.headRX = -.12 + .03 * cos(2 * ph); p.headRY = .05 * L; p.headRZ = .03 * cos(ph);
    p.armFwdL = -.5 * L; p.armFwdR = -.5 * R; p.elbowL = .35 + .3 * pos(-L); p.elbowR = .35 + .3 * pos(-R); p.armOutL = p.armOutR = .3; p.handL = p.handR = -.2;
    p.tie = -.08 - .1 * pos(cos(2 * ph)); p.tieLow = -.1 * sin(2 * ph);
  } },
  run: { loop: true, mood: 'smug', fn(t, ph, p) {
    const L = sin(ph), R = sin(ph + PI); p.legFwdL = .95 * L; p.legFwdR = .95 * R; p.kneeL = .3 + 1.5 * pos(cos(ph)); p.kneeR = .3 + 1.5 * pos(cos(ph + PI)); p.footL = .3 * pos(-L); p.footR = .3 * pos(-R);
    p.rootY = .06 * pos(cos(2 * ph)); p.hipsY = .03 * cos(2 * ph); p.hipsRY = .22 * L; p.spineRY = -.15 * L; p.hipsRZ = .06 * cos(ph);
    p.spineRX = .32; p.headRX = -.32 + .04 * cos(2 * ph); p.headRY = .04 * L;
    p.armFwdL = -.9 * L + .3; p.armFwdR = -.9 * R + .3; p.elbowL = p.elbowR = 1.6; p.armOutL = p.armOutR = .32; p.armTwistL = -.3; p.armTwistR = .3; p.handL = p.handR = .5;
    p.tie = -.5 - .3 * pos(cos(2 * ph)); p.tieLow = -.6 - .3 * sin(2 * ph);
  } },
  dizzy: { loop: true, mood: 'dizzy', fn(t, ph, p) {
    p.hipsRZ = .2 * sin(2.1 * t); p.hipsRX = .1 * sin(1.7 * t); p.hipsRY = .3 * sin(1.3 * t); p.spineRZ = .15 * sin(2.1 * t + 1); p.spineRX = .08 * cos(1.7 * t);
    p.headRY = .6 * sin(3.2 * t); p.headRZ = .35 * cos(3.2 * t); p.headRX = -.15 + .18 * sin(2.5 * t);
    p.hipsY = -.12 + .02 * sin(4 * t); p.kneeL = .5 + .15 * sin(2.6 * t); p.kneeR = .5 - .15 * sin(2.6 * t); p.legOutL = p.legOutR = .22; p.legFwdL = .15 * sin(1.3 * t) + .2; p.legFwdR = -.15 * sin(1.3 * t) + .2;
    p.armOutL = 1.25 + .25 * sin(2.7 * t); p.armOutR = 1.25 - .25 * sin(2.7 * t + .7); p.armFwdL = .25 * sin(2 * t); p.armFwdR = -.25 * sin(2 * t + 1); p.elbowL = .45 + .35 * sin(3 * t); p.elbowR = .45 + .35 * cos(3.4 * t); p.handL = .5 * sin(5 * t); p.handR = .5 * cos(5 * t);
    p.tie = -.25 - .25 * sin(3 * t); p.tieLow = -.3 * sin(3.4 * t); p.stars = 1;
  } },
  cheer: { loop: true, mood: 'happy', fn(t, ph, p) {
    const hop = sin(t * 5.5), up = pos(hop); p.rootY = .14 * up; p.kneeL = p.kneeR = .08 + .3 * pos(-hop); p.footL = p.footR = -.25 * up; p.legOutL = p.legOutR = .12;
    p.armFwdL = 2.65 + .3 * hop; p.armFwdR = 2.65 - .3 * hop; p.armOutL = p.armOutR = .45; p.elbowL = .5 + .35 * pos(hop); p.elbowR = .5 + .35 * pos(-hop); p.handL = p.handR = .3; p.armTwistL = .3; p.armTwistR = -.3;
    p.headRX = -.4 + .06 * hop; p.headRY = .12 * sin(t * 2); p.headRZ = .06 * sin(t * 2.7); p.spineRX = -.18; p.hipsRZ = .05 * sin(t * 2.75); p.hipsY = -.03 * pos(-hop);
    p.tie = -.3 - .5 * up; p.tieLow = -.4 - .4 * up;
  } },
  laugh: { loop: true, mood: 'happy', fn(t, ph, p) {
    const sh = sin(t * 14); p.headRX = -.42 + .03 * sh; p.headRZ = .05 * sh; p.spineRX = -.16 + .04 * sh; p.spineRY = .03 * sh; p.hipsY = .012 * sh; p.rootY = 0;
    p.armFwdL = .65; p.armFwdR = .65; p.elbowL = 1.45 + .08 * sh; p.elbowR = 1.45 - .08 * sh; p.armOutL = p.armOutR = .36; p.armTwistL = -.5; p.armTwistR = .5; p.handL = p.handR = -.4;
    p.legOutL = p.legOutR = .12; p.kneeL = .1; p.kneeR = .1 + .4 * pos(sin(t * 3)); p.legFwdR = .35 * pos(sin(t * 3)); p.tie = -.06 - .04 * sh;
  } },
  fall: { loop: false, dur: 1.5, mood: 'dizzy', fn(t, ph, p) {
    const k = smooth(t, 0, .62), k2 = Math.pow(k, 1.7); const land = smooth(t, .6, .78); const bounce = sin(PI * clamp((t - .62) / .3, 0, 1));
    p.rootRX = -1.47 * k2 + .08 * bounce; p.rootY = .3 * k2 + .14 * bounce; p.spineRX = -.12 * k; p.hipsY = 0;
    p.headRX = .55 * k * (1 - land) - .1 * land; p.headRZ = .1 * land * sin(t * 9); // tries to look up, then flops
    p.armFwdL = 1.1 * k - .3 * land; p.armFwdR = 1.0 * k - .3 * land; p.armOutL = .5 + 1.1 * land; p.armOutR = .5 + 1.3 * land; p.elbowL = .35; p.elbowR = .3; p.handL = p.handR = .5 * k;
    const kick = sin(PI * clamp((t - .6) / .55, 0, 1)); p.legFwdL = .25 * k + 1.1 * kick + .55 * land; p.legFwdR = .25 * k + .8 * kick + .35 * land; p.kneeL = .2 + .9 * land; p.kneeR = .2 + 1.2 * land; p.legOutL = p.legOutR = .1 + .25 * land; p.footL = p.footR = .3 * land;
    p.tie = -.15 * k - 2.2 * land; p.tieLow = -.4 * land; p.stars = land; // the tie lands on his face
  } },
};

function makeController(id, { root, rig, hips, P, stars, faceM, faces, head }) {
  const cur = { name: 'idle', t: 0, ph: 0 }; let prev = null, fadeT = 0, fadeDur = .2, speed = 1.9, mood = 'smug';
  const pa = { ...POSE0 }, pb = { ...POSE0 }, out = { ...POSE0 };
  function evalClip(s, p) { Object.assign(p, POSE0); const c = CLIPS[s.name]; const t = c.loop ? s.t : Math.min(s.t, c.dur); c.fn(t, s.ph, p, id); }
  function advance(s, dt) { s.t += dt; const rate = s.name === 'run' ? speed / 2.2 : speed / 1.3; s.ph += dt * PI * 2 * clamp(rate, .4, 4.5); }
  function apply(p) {
    rig.position.y = p.rootY; rig.rotation.set(p.rootRX, p.rootRY, p.rootRZ); hips.position.y = HIP + p.hipsY; hips.rotation.set(p.hipsRX, p.hipsRY, p.hipsRZ);
    P.spine.rotation.set(p.spineRX, p.spineRY, p.spineRZ); P.head.rotation.set(p.headRX, p.headRY, p.headRZ);
    P.shL.rotation.set(-p.armFwdL, p.armTwistL, p.armOutL); P.shR.rotation.set(-p.armFwdR, -p.armTwistR, -p.armOutR); P.elL.rotation.x = -p.elbowL; P.elR.rotation.x = -p.elbowR; P.handL.rotation.x = -p.handL; P.handR.rotation.x = -p.handR;
    P.hipL.rotation.set(-p.legFwdL, 0, p.legOutL); P.hipR.rotation.set(-p.legFwdR, 0, -p.legOutR); P.kneeL.rotation.x = p.kneeL; P.kneeR.rotation.x = p.kneeR; P.footL.rotation.x = p.footL; P.footR.rotation.x = p.footR;
    if (P.tie) { P.tie.rotation.x = p.tie; P.tieLow.rotation.x = p.tieLow; }
    stars.visible = p.stars > .02; if (stars.visible) { stars.scale.setScalar(Math.max(.01, p.stars)); stars.rotation.y += .07; }
  }
  const api = {
    names: Object.keys(CLIPS), current: () => cur.name,
    play(name, { loop, fade = .2 } = {}) { if (!CLIPS[name]) { console.warn('boss: no clip', name); return api; } if (name === cur.name && CLIPS[name].loop) return api; prev = { ...cur }; cur.name = name; cur.t = 0; fadeT = 0; fadeDur = Math.max(.001, fade); return api; },
    setSpeed(mps) { speed = Math.max(0, mps || 0); return api; },
    update(dt = 1 / 60) {
      dt = clamp(dt || 0, 0, .1); advance(cur, dt); evalClip(cur, pb);
      if (prev) { advance(prev, dt); fadeT += dt; const w = smooth(fadeT / fadeDur, 0, 1); evalClip(prev, pa); for (const k of KEYS) out[k] = lerp(pa[k], pb[k], w); if (w >= 1) prev = null; } else Object.assign(out, pb);
      const want = (prev && fadeT < fadeDur * .5) ? CLIPS[prev.name].mood : CLIPS[cur.name].mood; if (want !== mood) { mood = want; faceM.map = faces[want]; }
      apply(out);
    },
    head, root, done: () => !CLIPS[cur.name].loop && cur.t >= CLIPS[cur.name].dur,
  };
  api.update(0); return api;
}
