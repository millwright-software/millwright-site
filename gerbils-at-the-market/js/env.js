// env.js — the world around the road: warm light, a sky with a sun in it, rolling hills, the sandy path,
// thousands of instanced trees, bushes, grass and flowers, puffy clouds, birds and butterflies, and the
// post-processing chain (bloom + SMAA). Everything is procedural: no image downloads, no build step.
//
//   buildEnvironment(scene, renderer, opts) -> { update(dt, nowMs, playerPosition), sun, heightAt(x, z), fog }
//   makeComposer(renderer, scene, camera)   -> { render(dt), setSize(w, h), composer, bloom }
//
// Coordinates follow the game: the road runs along +x at z = 0, the ground is y = 0 on and beside the road.
//
// The paper look (P.artMode() 'paper', or opts.art; docs/ART-DIRECTION.md direction C): palette grass in vertex colours with no
// texture, bump or PBR; a flat sand road; no environment map; trees and bushes as instanced crossed sprite cards
// (P.spriteCard, today's geometry in toon when props has none); one sun from the upper left; a painted backdrop of hills on a
// cylinder that follows the player. Tone mapping is set here only in the old look (ACES); main sets it after either way.
import * as THREE from 'three';
import * as P from './props.js';
import { spriteTexture } from './art/sprites.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

// ---------- deterministic randomness + smooth noise ----------
let seedState = 1234567;
const rnd = () => { seedState = (seedState + 0x6D2B79F5) | 0; let t = seedState; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rr = (a, b) => a + rnd() * (b - a);
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function hash2(ix, iy) { let h = (ix * 374761393 + iy * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
// value noise, quintic interpolation, in [-1, 1]; `period` (in cells) makes it tile along x
function vnoise(x, y, period = 0) {
  let ix = Math.floor(x), iy = Math.floor(y); const fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  let ix1 = ix + 1; if (period) { ix = ((ix % period) + period) % period; ix1 = (ix + 1) % period; }
  const a = hash2(ix, iy), b = hash2(ix1, iy), c = hash2(ix, iy + 1), d = hash2(ix1, iy + 1);
  return (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy) * 2 - 1;
}
function fbm(x, y, oct = 4) {
  let s = 0, amp = 1, f = 1, norm = 0, px = x, py = y;
  for (let i = 0; i < oct; i++) { s += vnoise(px * f, py * f) * amp; norm += amp; amp *= .5; f *= 2.07; const rx = px * .8 - py * .6 + 13.7, ry = px * .6 + py * .8 + 7.1; px = rx; py = ry; }
  return s / norm;
}

// ---------- canvas textures ----------
let maxAniso = 8;
function canvasTex(w, h, draw, { wrap = true, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t;
}
// draw fn at (x, y) and at the wrapped copies so the tile has no seam
function wrapped(g, w, h, x, y, r, fn) { for (const ox of [0, -w, w]) for (const oy of [0, -h, h]) { const xx = x + ox, yy = y + oy; if (xx > -r && xx < w + r && yy > -r && yy < h + r) fn(xx, yy); } }

function grassTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#5d9440'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) { const x = rnd() * w, y = rnd() * h, r = rr(6, 26); g.fillStyle = `hsla(${rr(88, 118)},${rr(38, 55)}%,${rr(30, 46)}%,.18)`; wrapped(g, w, h, x, y, r, (xx, yy) => { g.beginPath(); g.ellipse(xx, yy, r, r * .6, rnd() * 3, 0, 6.3); g.fill(); }); }
    g.lineCap = 'round';
    for (let i = 0; i < 9000; i++) {
      const x = rnd() * w, y = rnd() * h, len = rr(7, 20), a = rr(-.5, .5), light = rnd() < .25;
      g.strokeStyle = light ? `hsla(${rr(78, 100)},${rr(50, 65)}%,${rr(52, 66)}%,.55)` : `hsla(${rr(92, 122)},${rr(42, 60)}%,${rr(22, 42)}%,.7)`; g.lineWidth = rr(1, 2.2);
      wrapped(g, w, h, x, y, len, (xx, yy) => { g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + Math.sin(a) * len, yy - Math.cos(a) * len); g.stroke(); });
    }
  });
}
function bumpTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h); const d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = 128 + 60 * vnoise(x / 16, y / 16, 16) + 30 * vnoise(x / 5, y / 5, 51.2); const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    g.putImageData(img, 0, 0);
  }, { srgb: false });
}
// u = along the road (tiles every 8 m), v = across (4.4 m, soft irregular edges in alpha, two faint ruts)
function roadTexture() {
  return canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#cbb286'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) { const x = rnd() * w, y = rnd() * h, r = rr(2, 11); g.fillStyle = `hsla(${rr(30, 44)},${rr(25, 40)}%,${rr(58, 74)}%,.11)`; wrapped(g, w, h, x, y, r, (xx, yy) => { g.beginPath(); g.ellipse(xx, yy, r * 1.6, r * .7, 0, 0, 6.3); g.fill(); }); }
    for (let i = 0; i < 12000; i++) { const x = rnd() * w, y = rnd() * h, r = rr(.5, 1.5); g.fillStyle = rnd() < .5 ? `hsla(${rr(25, 40)},${rr(20, 35)}%,${rr(40, 54)}%,.35)` : `hsla(${rr(35, 50)},${rr(20, 35)}%,${rr(74, 86)}%,.4)`; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill(); }
    const img = g.getImageData(0, 0, w, h); const d = img.data;
    for (let y = 0; y < h; y++) {
      const zz = (y / h - .5) * 4.4, az = Math.abs(zz);
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4; const u = x / w;
        const wobble = .25 * vnoise(u * 16, zz > 0 ? 3.3 : 9.9, 16) + .12 * vnoise(u * 48, zz > 0 ? 5.5 : 7.7, 48);
        const edge = 1.3 + wobble; const alpha = 1 - smooth(edge, edge + .55, az);
        // ruts: two soft darker bands, wandering a little along the road
        const rutC = .62 + .08 * vnoise(u * 8, 1.5, 8); const rut = Math.exp(-Math.pow((az - rutC) / .2, 2)) * .14; const grain = (hash2(x * 7 + 1, y * 13 + 5) - .5) * 14;
        const dust = smooth(1.0, 1.7, az) * .18;  // lighter, dustier toward the verge
        d[i] = Math.min(255, d[i] * (1 - rut) + 255 * dust + grain); d[i + 1] = Math.min(255, d[i + 1] * (1 - rut) + 240 * dust + grain); d[i + 2] = Math.min(255, d[i + 2] * (1 - rut * .8) + 200 * dust + grain);
        d[i + 3] = Math.round(255 * alpha);
      }
    }
    g.putImageData(img, 0, 0);
  });
}

// the paper look's road: flat sand, a darker sand line along each edge, soft alpha edges into the grass (v = across, 4.4 m)
function paperRoadTexture(sand) {
  const col = new THREE.Color(sand); const [r, g, b] = [col.r, col.g, col.b].map(v => Math.round(Math.pow(v, 1 / 2.2) * 255));
  return canvasTex(64, 256, (cx, w, h) => { const img = cx.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) { const az = Math.abs((y / h - .5) * 4.4), line = Math.exp(-Math.pow((az - 1.55) / .07, 2)) * .22, a = 1 - smooth(1.62, 1.78, az);
      for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; d[i] = r * (1 - line); d[i + 1] = g * (1 - line); d[i + 2] = b * (1 - line * .8); d[i + 3] = Math.round(255 * a); } }
    cx.putImageData(img, 0, 0); });
}
function barkTexture(base, streak, light) {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h); g.lineCap = 'round';
    for (let i = 0; i < 260; i++) { const x = rnd() * w, y = rnd() * h, len = rr(14, 70); g.strokeStyle = rnd() < .6 ? streak : light; g.globalAlpha = rr(.25, .6); g.lineWidth = rr(1, 4); wrapped(g, w, h, x, y, len, (xx, yy) => { g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + rr(-3, 3), yy + len); g.stroke(); }); }
    g.globalAlpha = 1;
  });
}
function birchTexture() {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#e6e0d4'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { const x = rnd() * w, y = rnd() * h, len = rr(6, 30); g.fillStyle = `rgba(40,34,30,${rr(.4, .9)})`; wrapped(g, w, h, x, y, len, (xx, yy) => g.fillRect(xx, yy, len, rr(1, 4))); }
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(120,110,100,${rr(.1, .3)})`; g.fillRect(rnd() * w, rnd() * h, rr(1, 3), rr(1, 3)); }
  });
}
// grass tuft: blades fanning from the bottom centre, white → light so instance colour sets the hue
function tuftTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.lineCap = 'round';
    for (let i = 0; i < 60; i++) {
      const x0 = w / 2 + rr(-8, 8), a = rr(-.75, .75), len = rr(50, 120), lw = rr(1, 2.2);
      const grd = g.createLinearGradient(x0, h, x0 + Math.sin(a) * len, h - Math.cos(a) * len); grd.addColorStop(0, 'rgba(150,150,150,1)'); grd.addColorStop(.6, 'rgba(230,230,230,1)'); grd.addColorStop(1, 'rgba(255,255,255,1)');
      g.strokeStyle = grd; g.lineWidth = lw; g.beginPath(); g.moveTo(x0, h); g.quadraticCurveTo(x0 + Math.sin(a) * len * .5, h - Math.cos(a) * len * .6, x0 + Math.sin(a) * len * 1.15, h - Math.cos(a) * len); g.stroke();
    }
  }, { wrap: false });
}
function flowerTexture() {
  return canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = '#4a5a30'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 64); g.quadraticCurveTo(30, 40, 32, 24); g.stroke();
    g.fillStyle = '#5a6a38'; g.beginPath(); g.ellipse(26, 48, 7, 3, -.7, 0, 6.3); g.fill();
    g.fillStyle = '#ffffff'; for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; g.beginPath(); g.ellipse(32 + Math.cos(a) * 11, 20 + Math.sin(a) * 11, 9, 6, a, 0, 6.3); g.fill(); }
    g.fillStyle = '#ffd040'; g.beginPath(); g.arc(32, 20, 6, 0, 6.3); g.fill();
  }, { wrap: false });
}
function butterflyTexture() {
  return canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (const s of [-1, 1]) { g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(32 + s * 15, 24, 15, 13, s * .5, 0, 6.3); g.fill(); g.beginPath(); g.ellipse(32 + s * 11, 44, 10, 9, s * .3, 0, 6.3); g.fill(); g.fillStyle = 'rgba(40,30,30,.9)'; g.beginPath(); g.arc(32 + s * 19, 20, 3.5, 0, 6.3); g.fill(); }
    g.fillStyle = '#332222'; g.fillRect(30, 12, 4, 40);
  }, { wrap: false });
}

// ---------- geometry helpers ----------
function jitter(geo, amt) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) { const k = (rnd() - .5) * 2 * amt; p.setXYZ(i, p.getX(i) + n.getX(i) * k, p.getY(i) + n.getY(i) * k, p.getZ(i) + n.getZ(i) * k); }
  geo.computeVertexNormals(); return geo;
}
// index a primitive by position alone (drop uv/normal first, or the uv seam stays split and jitter tears it open)
function smoothed(geo) { geo.deleteAttribute('uv'); geo.deleteAttribute('normal'); const g = mergeVertices(geo); g.computeVertexNormals(); return g; }
function blob(r, detail = 1, amt = .13, sy = 1) { const g = smoothed(new THREE.IcosahedronGeometry(r, detail)); jitter(g, amt * r); g.scale(1, sy, 1); g.computeVertexNormals(); return g; }
// per-vertex grey ramp (dark low, bright high) that the instance colour tints
function shadeGradient(geo, lo, hi, noise = .1) {
  geo.computeBoundingBox(); const bb = geo.boundingBox; const p = geo.attributes.position; const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const t = (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y || 1); const v = lo + (hi - lo) * Math.pow(t, .8) + (rnd() - .5) * noise; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); return geo;
}
function upNormals(geo) { const n = geo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); return geo; }
function crossQuads(w, h) {
  const a = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), b = a.clone().rotateY(Math.PI / 2);
  return upNormals(mergeGeometries([a, b]));
}

// wind / flap animation injected into any material's vertex shader; `code` runs after begin_vertex with `wph` (a per-instance phase) defined
const uTime = { value: 0 };
function animate(mat, code) {
  mat.onBeforeCompile = shader => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 iw = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 iw = vec3(0.0);
      #endif
      float wph = iw.x * 0.37 + iw.z * 0.53 + iw.y * 1.1;
      ${code}`);
  };
  mat.customProgramCacheKey = () => code; return mat;
}
const SWAY_GRASS = `float bend = max(0.0, position.y) * 1.6; transformed.x += (sin(uTime * 1.7 + wph) * 0.8 + sin(uTime * 2.9 + wph * 1.7) * 0.35) * 0.07 * bend; transformed.z += cos(uTime * 1.3 + wph * .7) * 0.045 * bend;`;
const SWAY_CANOPY = `float bend = smoothstep(1.2, 4.5, position.y); transformed.x += sin(uTime * 1.1 + wph) * 0.05 * bend; transformed.z += cos(uTime * 0.9 + wph * 1.3) * 0.04 * bend;`;
const FLAP_BIRD = `transformed.y += abs(position.z) * sin(uTime * 9.0 + wph * 7.0) * 0.9; transformed.y += sin(uTime * 1.3 + wph) * 0.25;`;
const FLAP_BUTTERFLY = `float fa = sin(uTime * 13.0 + wph * 5.0) * 1.0; transformed.y += abs(position.x) * sin(fa) * 1.4; transformed.x = position.x * cos(fa); transformed += vec3(sin(uTime * 0.9 + wph) * 0.5, sin(uTime * 1.9 + wph * 1.3) * 0.18 + 0.15, cos(uTime * 0.7 + wph) * 0.5);`;

// ---------- the sky ----------
function skyMaterial(sunDir, paper = false) {
  const c = paper ? [0x5aa8ec, 0xa9dbf6, 0xf3ecd6, 0x9cc27a] : [0x2f6ccf, 0x7dbbee, 0xd3e3ee, 0x9db186];
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uZenith: { value: new THREE.Color(c[0]) }, uMid: { value: new THREE.Color(c[1]) }, uHorizon: { value: new THREE.Color(c[2]) }, uBelow: { value: new THREE.Color(c[3]) }, uSunColor: { value: new THREE.Color(0xfff1d2) }, uSunDir: { value: sunDir.clone() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uZenith, uMid, uHorizon, uBelow, uSunColor, uSunDir; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float y = d.y;
        vec3 col = mix(uHorizon, uMid, pow(smoothstep(0.0, 0.45, y), 0.75)); col = mix(col, uZenith, smoothstep(0.2, 1.0, y));
        if (y < 0.0) col = mix(uHorizon, uBelow, smoothstep(0.0, -0.2, y));
        float s = dot(d, uSunDir); float sp = max(s, 0.0);
        float glow = pow(sp, 24.0) * 0.4 + pow(sp, 5.0) * 0.14; float disc = smoothstep(0.9993, 0.99975, s);
        col += uSunColor * glow + uSunColor * disc * 5.0;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}

// ---------- the environment ----------
export function buildEnvironment(scene, renderer, opts = {}) {
  const roadEnd = opts.roadEnd ?? 3600, arenas = opts.arenas ?? [], cubeZones = opts.cubeZones ?? [], laneHalf = opts.laneHalf ?? 1.6, hub = opts.hub ?? null;   // hub: {x0,x1,z0,z1} flat and tree-free (the town)
  const fogNear = opts.fogNear ?? 60, fogFar = opts.fogFar ?? 3400;
  seedState = opts.seed ?? 1234567;
  maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const paper = (opts.art ?? P.artMode?.()) === 'paper', PAL = P.PAL || { ink: 0x3b2516, grass: 0x8cc067, sand: 0xe9d09c, stone: 0xb9b2a6 };
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; if (!paper) renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const root = new THREE.Group(); root.name = 'environment'; scene.add(root);
  const sunDir = paper ? new THREE.Vector3(-0.4, 0.86, -0.46).normalize() : new THREE.Vector3(-0.52, 0.6, 0.6).normalize();   // paper: from the upper left as the camera looks up the road (+x); (verify) higher (about 55 degrees, was 37), so thin poles no longer throw street-long black lines

  // --- light ---
  const hemi = paper ? new THREE.HemisphereLight(0xfff4e2, 0x8aa868, 1.25) : new THREE.HemisphereLight(0xbfd8ff, 0x7f9150, .5); root.add(hemi);
  const sun = paper ? new THREE.DirectionalLight(0xfff0d6, 2.4) : new THREE.DirectionalLight(0xffdcae, 2.6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 220; sun.shadow.camera.left = sun.shadow.camera.bottom = -24; sun.shadow.camera.right = sun.shadow.camera.top = 24;
  sun.shadow.bias = -.0003; sun.shadow.normalBias = .03; sun.shadow.radius = 3; root.add(sun, sun.target);

  // --- sky + fog + environment map (the sky lit into a PMREM so PBR materials get soft sky/ground reflections) ---
  scene.fog = new THREE.Fog(paper ? 0xe8eedf : 0xd3e3ee, fogNear, fogFar); scene.background = null;
  const skyMat = skyMaterial(sunDir, paper);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4200, 48, 24), skyMat); sky.renderOrder = -10; sky.frustumCulled = false; root.add(sky);
  if (paper) scene.environment = null;   // no environment map: the colours stay the palette's
  else { const envScene = new THREE.Scene(); const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat); dome.frustumCulled = false; envScene.add(dome);
    const pmrem = new THREE.PMREMGenerator(renderer); const envRT = pmrem.fromScene(envScene, 0, .1, 1000); pmrem.dispose(); scene.environment = envRT.texture; if ('environmentIntensity' in scene) scene.environmentIntensity = .45; }

  // --- terrain: a grid dense across the road, sparse far away; heights from noise, forced flat where the game needs it ---
  const xMin = -700, xMax = roadEnd + 700, dx = 4;
  const zHalf = [0, 1.5, 3, 4.5, 6, 8, 10, 13, 16, 20, 25, 31, 38, 46, 56, 68, 82, 100, 120, 145, 175, 210, 250, 300, 360, 430, 520, 620, 740, 880, 1050, 1250, 1500, 1800, 2200];
  const zs = [...zHalf.slice(1).reverse().map(v => -v), ...zHalf]; const nz = zs.length;
  const nx = Math.floor((xMax - xMin) / dx) + 1;
  const boxOutside = (x, z, x0, x1, z0, z1) => Math.hypot(Math.max(x0 - x, x - x1, 0), Math.max(z0 - z, z - z1, 0));
  const flatMask = (x, z) => {   // 1 = free to roll, 0 = must be y = 0
    let m = smooth(4, 42, Math.abs(z));
    for (const [a0, a1] of arenas) m = Math.min(m, smooth(0, 30, boxOutside(x, z, a0 - 6, a1 + 6, -6, 60)));
    if (hub) m = Math.min(m, smooth(0, 30, boxOutside(x, z, hub.x0, hub.x1, hub.z0, hub.z1)));
    for (const c of cubeZones) m = Math.min(m, smooth(0, 40, boxOutside(x, z, c.x - 6, c.x + c.w + 6, c.z - 6, c.z + c.d + 6)));
    m *= 1 - smooth(1500, 2200, Math.abs(z)); m *= smooth(xMin, xMin + 400, x) * (1 - smooth(xMax - 400, xMax, x));
    return m;
  };
  const heightRaw = (x, z) => {
    const az = Math.abs(z); const m = flatMask(x, z); if (m <= 0) return 0;
    const big = Math.pow(clamp01(fbm(x / 260, z / 260, 4) * .5 + .5), 1.2) * (19 * smooth(4, 50, az) + 70 * smooth(50, 600, az));
    const small = (fbm(x / 22, z / 22, 2) * .5 + .5) * .5 * smooth(3, 14, az);
    return (big + small) * m;
  };
  const heights = new Float32Array(nx * nz);
  const terrainGeo = new THREE.BufferGeometry();
  { const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), col = new Float32Array(nx * nz * 3), idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    const c = new THREE.Color(), base = new THREE.Color(paper ? PAL.grass : 0x7aa653), dry = new THREE.Color(paper ? 0xa9cc72 : 0xa8a85a), dark = new THREE.Color(paper ? 0x78ad58 : 0x4e7a38), verge = new THREE.Color(paper ? 0xb7c97c : 0xa9a768), meadow = new THREE.Color(paper ? 0x9bcb6f : 0x9cae55), deep = new THREE.Color(paper ? 0x6fa452 : 0x4a7f3c);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = xMin + i * dx, z = zs[j], k = j * nx + i; const y = heightRaw(x, z); heights[k] = y;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; uv[k * 2] = x / 5; uv[k * 2 + 1] = z / 5;
      const patch = fbm(x / 45 + 3, z / 45, 3) * .5 + .5, patch2 = fbm(x / 9 + 7, z / 9 + 2, 2) * .5 + .5;
      const macro = fbm(x / 230 + 11, z / 230 + 5, 2) * .5 + .5; c.copy(base).lerp(meadow, smooth(.45, .9, macro) * .85).lerp(deep, smooth(.5, .05, macro) * .5).lerp(dry, smooth(.45, .9, patch) * .5).lerp(dark, smooth(.5, 1, patch2) * .35); c.lerp(verge, 1 - smooth(2.2, 5.5, Math.abs(z)));
      c.multiplyScalar(paper ? .97 + .06 * patch2 : .95 + .2 * patch2); col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    let t = 0; for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, cc = a + nx, d = cc + 1; idx[t++] = a; idx[t++] = cc; idx[t++] = b; idx[t++] = b; idx[t++] = cc; idx[t++] = d; }
    terrainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); terrainGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); terrainGeo.setAttribute('color', new THREE.BufferAttribute(col, 3)); terrainGeo.setIndex(new THREE.BufferAttribute(idx, 1)); terrainGeo.computeVertexNormals(); }
  // the exact height of the rendered mesh at (x, z): same grid, same triangles
  const heightAt = (x, z) => {
    if (x <= xMin || x >= xMax - dx || z <= zs[0] || z >= zs[nz - 1]) return 0;
    const fi = (x - xMin) / dx, i = Math.floor(fi), u = fi - i; let lo = 0, hi = nz - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (zs[mid] <= z) lo = mid; else hi = mid; }
    const j = lo, v = (z - zs[j]) / (zs[j + 1] - zs[j]); const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    return u + v <= 1 ? heights[a] + (heights[b] - heights[a]) * u + (heights[c] - heights[a]) * v : heights[d] + (heights[b] - heights[d]) * (1 - v) + (heights[c] - heights[d]) * (1 - u);
  };
  let grassMat; if (paper) grassMat = new THREE.MeshLambertMaterial({ vertexColors: true });   // the palette grass, in the vertices only
  else { grassMat = new THREE.MeshStandardMaterial({ map: grassTexture(), bumpMap: bumpTexture(), bumpScale: .035, vertexColors: true, roughness: .95, metalness: 0 }); grassMat.map.repeat.set(1, 1); grassMat.bumpMap.repeat.set(1, 1); }
  const terrain = new THREE.Mesh(terrainGeo, grassMat); terrain.receiveShadow = true; terrain.name = 'terrain'; root.add(terrain);
  const farGround = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshBasicMaterial({ color: paper ? 0x93c06c : 0x8fb06a })); farGround.rotation.x = -Math.PI / 2; farGround.position.set(roadEnd / 2, -.6, 0); root.add(farGround);

  // --- the road: a strip 2.5 cm above the flat ground, alpha edges fading into the grass ---
  const roadLen = roadEnd + 240; const roadTex = paper ? paperRoadTexture(PAL.sand) : roadTexture(); roadTex.wrapT = THREE.ClampToEdgeWrapping; roadTex.repeat.set(roadLen / 8, 1);
  const roadMat = paper ? new THREE.MeshLambertMaterial({ map: roadTex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    : new THREE.MeshStandardMaterial({ map: roadTex, transparent: true, roughness: .96, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, 4.4, Math.ceil(roadLen / 40), 1), roadMat); road.rotation.x = -Math.PI / 2; road.position.set(-120 + roadLen / 2, .025, 0); road.receiveShadow = true; road.renderOrder = 1; root.add(road);

  // --- vegetation: geometry per species, instances per 200 m chunk so culling works along the road ---
  const CHUNK = 200, chunkX0 = -160; const chunks = [];   // {mesh, cx, range}
  function scatter(geo, mats, items, { cast = true, range = Infinity, color = null }) {
    const groups = new Map(); for (const it of items) { const ci = Math.floor((it.x - chunkX0) / CHUNK); (groups.get(ci) || groups.set(ci, []).get(ci)).push(it); }
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
    for (const [ci, list] of groups) {
      const mesh = new THREE.InstancedMesh(geo, mats, list.length); mesh.castShadow = cast; mesh.receiveShadow = true;
      list.forEach((it, i) => { p.set(it.x, it.y, it.z); e.set(it.tx || 0, it.ry || 0, it.tz || 0); q.setFromEuler(e); s.setScalar(it.s || 1); if (it.sy) s.y *= it.sy; m.compose(p, q, s); mesh.setMatrixAt(i, m); if (color) { color(it, c); mesh.setColorAt(i, c); } });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.computeBoundingSphere();
      mesh.userData.cx = chunkX0 + (ci + .5) * CHUNK; mesh.userData.range = range; chunks.push(mesh); root.add(mesh);
    }
  }
  const inArenaPlus = (x, z) => z > -24 && z < 46 && arenas.some(([a0, a1]) => x > a0 - 3 && x < a1 + 3);   // the giants' facades stand on the -z side too
  const inCube = (x, z, pad = 2.5) => cubeZones.some(c => x > c.x - pad && x < c.x + c.w + pad && z > c.z - pad && z < c.z + c.d + pad);
  const inMarket = (x, z) => x > -14 && x < 44 && z < -1.8 && z > -8;
  const inHub = (x, z) => !!hub && x > hub.x0 - 3 && x < hub.x1 + 3 && z > hub.z0 - 3 && z < hub.z1 + 3;
  const xLo = -140, xHi = roadEnd + 260;
  // density falls off with |z|; `pow` > 1 crowds the road
  function sample(count, zMin, zMax, pow, ok) {
    const out = []; let tries = 0;
    while (out.length < count && tries++ < count * 6) {
      const x = rr(xLo, xHi), side = rnd() < .5 ? -1 : 1, az = zMin + (zMax - zMin) * Math.pow(rnd(), pow), z = side * az;
      if (az < laneHalf + .8 || inCube(x, z) || inHub(x, z) || !ok(x, z, az)) continue;
      out.push({ x, z, y: heightAt(x, z) - .04, ry: rnd() * 6.283 });
    }
    return out;
  }
  const bigOk = (x, z) => !inArenaPlus(x, z) && !inMarket(x, z);
  const grove = (x, z, floor = .3) => rnd() < floor + (1 - floor) * smooth(-.1, .45, fbm(x / 140 + 3, z / 140 + 9, 2));   // woods and clearings, not an even sprinkle

  // paper: toon (no PBR, no bark textures); old: HEAD's materials
  const toonV = (o = {}) => { const base = P.toonMat?.(0xffffff); const m = base?.isMaterial ? base.clone() : new THREE.MeshToonMaterial({ color: 0xffffff }); m.color.set(o.color ?? 0xffffff); m.vertexColors = !!o.vertexColors; return m; };
  const barkMat = paper ? toonV({ color: 0x8a5a30 }) : new THREE.MeshStandardMaterial({ map: barkTexture('#6a4e36', '#3f2c1c', '#8c6d4e'), roughness: .9 });
  const pineBarkMat = paper ? toonV({ color: 0x6b4423 }) : new THREE.MeshStandardMaterial({ map: barkTexture('#5a3f2c', '#352216', '#75573c'), roughness: .9 });
  const birchMat = paper ? toonV({ color: 0xece4d4 }) : new THREE.MeshStandardMaterial({ map: birchTexture(), roughness: .8 });
  const leafMat = animate(paper ? toonV({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, metalness: 0 }), SWAY_CANOPY);
  const needleMat = paper ? toonV({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, metalness: 0 });
  const bushMat = paper ? toonV({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85 });
  const rockMat = paper ? toonV({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, metalness: .05 });
  // paper: trees and bushes as crossed sprite cards (props' drawings), instanced like everything else; null when props has none
  const card = (name, height) => { if (!paper || !P.spriteCard) return null; try { const c = P.spriteCard(name, { height, cross: true }); return c?.geometry && c?.material ? c : null; } catch (e) { console.warn('[env] spriteCard', name, e); return null; } };
  const treeCard = card('tree', 5.2), bushCard = card('bush', 1.1);
  const tint = (lo, hi) => (it, c) => c.setScalar(rr(lo, hi));

  // deciduous: trunk + branches, five lumpy blobs
  const trunkGeo = (() => { const parts = [new THREE.CylinderGeometry(.14, .26, 2.8, 8, 3).translate(0, 1.4, 0)]; for (let k = 0; k < 3; k++) { const a = k * 2.1 + .4; parts.push(new THREE.CylinderGeometry(.04, .1, 1.6, 6).translate(0, .8, 0).rotateZ(.6).rotateY(a).translate(Math.sin(a) * .2, 2.4, Math.cos(a) * .2)); } return mergeGeometries(parts); })();
  const canopyGeo = (() => { const parts = [blob(1.75, 2, .11, .88).translate(0, 3.6, 0)]; for (let k = 0; k < 4; k++) { const a = k * 1.57 + .6; parts.push(blob(rr(1.0, 1.3), 1, .12, .85).translate(Math.cos(a) * 1.15, 3.2 + rr(-.3, .5), Math.sin(a) * 1.15)); } return shadeGradient(mergeGeometries(parts), .5, 1.2, .12); })();
  // pine: tall trunk, four stacked cones
  const pineTrunkGeo = new THREE.CylinderGeometry(.09, .22, 3, 7, 2).translate(0, 1.5, 0);
  const pineGeo = (() => { const parts = []; const tiers = [[1.7, 2.4, 1.9], [1.35, 2.1, 3.1], [1.0, 1.9, 4.2], [.6, 1.7, 5.1]]; for (const [r, h, y] of tiers) { const g = smoothed(new THREE.ConeGeometry(r, h, 9, 1)); jitter(g, .08); g.translate(0, y, 0); parts.push(g); } return shadeGradient(mergeGeometries(parts), .55, 1.15, .1); })();
  // birch: slim pale trunk, three small light blobs
  const birchTrunkGeo = mergeGeometries([new THREE.CylinderGeometry(.06, .12, 3.6, 7, 2).translate(0, 1.8, 0), new THREE.CylinderGeometry(.03, .05, 1.4, 5).translate(0, .7, 0).rotateZ(.5).translate(.1, 2.6, 0), new THREE.CylinderGeometry(.03, .05, 1.3, 5).translate(0, .65, 0).rotateZ(-.55).rotateY(1.2).translate(-.1, 2.9, .1)]);
  const birchCanopyGeo = shadeGradient(mergeGeometries([blob(1.15, 2, .12, .9).translate(0, 4.1, 0), blob(.85, 1, .12, .9).translate(.75, 3.5, .3), blob(.8, 1, .12, .9).translate(-.6, 3.6, -.45)]), .55, 1.25, .12);
  const bushGeo = shadeGradient(mergeGeometries([blob(.8, 2, .12, .72).translate(0, .45, 0), blob(.55, 1, .13, .75).translate(.55, .3, .2), blob(.5, 1, .13, .75).translate(-.45, .32, -.3)]), .5, 1.2, .12);
  const rockGeo = shadeGradient((() => { const g = blob(1, 1, .28, .6); g.scale(1, 1, .8); g.computeVertexNormals(); return g; })(), .55, 1.1, .08);

  const hsl = (c, h, s, l) => c.setHSL(h / 360, s, l, THREE.SRGBColorSpace);
  const trees = sample(1700, 4, 170, 2.2, (x, z) => bigOk(x, z) && grove(x, z, .3)).map(t => ({ ...t, s: rr(.75, 1.4), tx: rr(-.03, .03), tz: rr(-.03, .03) }));
  const pines = sample(1400, 6, 420, 1.5, (x, z, az) => bigOk(x, z) && grove(x, z, .15) && rnd() < .3 + .7 * smooth(0, 14, heightAt(x, z))).map(t => ({ ...t, s: rr(.8, 1.6) }));
  const birches = sample(650, 4, 90, 2, (x, z) => bigOk(x, z) && grove(x, z, .4)).map(t => ({ ...t, s: rr(.8, 1.3) }));
  const bushes = sample(2600, 3.3, 60, 2.2, bigOk).map(t => ({ ...t, s: rr(.55, 1.15) }));
  if (treeCard) { const all = [...trees, ...pines, ...birches].map(t => ({ ...t, y: t.y + .04, tx: 0, tz: 0 })); scatter(treeCard.geometry, treeCard.material, all, { cast: true, color: tint(.86, 1.04) }); }   // the sprite cards stand straight
  else {
    scatter(trunkGeo, barkMat, trees, { cast: true });
    scatter(canopyGeo, leafMat, trees, { cast: true, color: (it, c) => hsl(c, rr(88, 128), rr(.42, .6), rr(.3, .44)) });
    scatter(pineTrunkGeo, pineBarkMat, pines, { cast: true });
    scatter(pineGeo, needleMat, pines, { cast: true, color: (it, c) => hsl(c, rr(130, 165), rr(.3, .45), rr(.2, .3)) });
    scatter(birchTrunkGeo, birchMat, birches, { cast: true });
    scatter(birchCanopyGeo, leafMat, birches, { cast: true, color: (it, c) => hsl(c, rr(72, 100), rr(.45, .6), rr(.4, .52)) });
  }
  if (bushCard) scatter(bushCard.geometry, bushCard.material, bushes.map(t => ({ ...t, y: t.y + .04 })), { cast: true, range: 900, color: tint(.86, 1.04) });
  else scatter(bushGeo, bushMat, bushes, { cast: true, range: 900, color: (it, c) => hsl(c, rr(90, 130), rr(.4, .55), rr(.26, .4)) });
  const rocks = sample(650, 3.2, 220, 1.6, bigOk).map(t => ({ ...t, s: rr(.35, 1.6), y: heightAt(t.x, t.z) - .22 * rr(.35, 1.6) }));
  scatter(rockGeo, rockMat, rocks, { cast: true, range: 1200, color: (it, c) => hsl(c, rr(25, 45), rr(.04, .12), rr(.4, .6)) });

  // far woods on the hills: cheap two-cone pines and single round blobs, big so they read from the road and from the far view
  const farPineGeo = shadeGradient(mergeGeometries([smoothed(new THREE.ConeGeometry(2.4, 4, 7, 1)).translate(0, 2.4, 0), smoothed(new THREE.ConeGeometry(1.6, 3.4, 7, 1)).translate(0, 4.6, 0)]), .5, 1.1, .08);
  const farPines = sample(3200, 160, 1400, 1.1, (x, z) => bigOk(x, z) && grove(x, z, .08)).map(t => ({ ...t, s: rr(1.4, 2.4), y: heightAt(t.x, t.z) - .3 }));
  const farLeafGeo = shadeGradient(blob(2.6, 1, .14, .8), .5, 1.2, .1);
  const farLeaves = sample(2400, 150, 1200, 1.1, (x, z) => bigOk(x, z) && grove(x, z, .1)).map(t => ({ ...t, s: rr(1.1, 2.0), y: heightAt(t.x, t.z) + 1.4 }));
  if (treeCard) scatter(treeCard.geometry, treeCard.material, [...farPines, ...farLeaves].map(t => ({ ...t, y: heightAt(t.x, t.z) - .1, s: t.s * 1.3 })), { cast: false, color: tint(.8, 1) });
  else {
    scatter(farPineGeo, needleMat, farPines, { cast: false, color: (it, c) => hsl(c, rr(130, 160), rr(.3, .42), rr(.2, .3)) });
    scatter(farLeafGeo, bushMat, farLeaves, { cast: false, color: (it, c) => hsl(c, rr(85, 125), rr(.42, .58), rr(.3, .42)) });
  }

  const tuftMat = animate(paper ? new THREE.MeshLambertMaterial({ map: tuftTexture(), alphaTest: .4, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ map: tuftTexture(), alphaTest: .4, side: THREE.DoubleSide, roughness: 1, metalness: 0 }), SWAY_GRASS);
  const tufts = sample(40000, laneHalf + .8, 48, 2.6, (x, z) => !(x > -7 && x < 3 && z < -2.4 && z > -4.6)).map(t => ({ ...t, s: rr(.6, 1.3), sy: rr(.75, 1.2) }));
  scatter(crossQuads(.44, .32), tuftMat, tufts, { cast: false, range: 320, color: (it, c) => hsl(c, rr(78, 108), rr(.48, .65), rr(.42, .6)) });
  const flowerMat = paper ? new THREE.MeshLambertMaterial({ map: flowerTexture(), alphaTest: .4, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ map: flowerTexture(), alphaTest: .4, side: THREE.DoubleSide, roughness: 1 });
  const palette = [0xffffff, 0xffd84a, 0xff7fb0, 0xff6a4a, 0xb98cff, 0xffb347, 0xff4f7a];
  const flowers = []; for (const cl of sample(900, laneHalf + .9, 32, 2.6, (x, z) => !(x > -7 && x < 3 && z < -2.4 && z > -4.6))) { const col = palette[Math.floor(rnd() * palette.length)]; const n = 6 + Math.floor(rnd() * 9); for (let i = 0; i < n; i++) { const a = rnd() * 6.283, r = rr(0, 1.9), x = cl.x + Math.cos(a) * r, z = cl.z + Math.sin(a) * r; if (Math.abs(z) < laneHalf + .8 || inCube(x, z)) continue; flowers.push({ x, z, y: heightAt(x, z) - .02, ry: rnd() * 6.283, s: rr(.8, 1.3), col }); } }
  scatter(crossQuads(.26, .3), flowerMat, flowers, { cast: false, range: 240, color: (it, c) => c.setHex(it.col) });

  // --- the market: picket fence behind the stalls, lamp posts, bunting across the road ---
  if (opts.market !== false) {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xf3ecdc, roughness: .8 }); const parts = [];
    const fenceRun = (x0, x1, z) => { for (let x = x0; x <= x1; x += 2) parts.push(new THREE.BoxGeometry(.1, 1.0, .1).translate(x, .5, z)); for (let x = x0; x <= x1 - .25; x += .3) parts.push(new THREE.BoxGeometry(.08, .85, .03).translate(x + .15, .5, z)); for (const y of [.35, .72]) parts.push(new THREE.BoxGeometry(x1 - x0, .05, .04).translate((x0 + x1) / 2, y, z + .04)); };
    fenceRun(-10, 40, -5.6); fenceRun(-10, 3, 5.4);
    const fence = new THREE.Mesh(mergeGeometries(parts), woodMat); fence.castShadow = fence.receiveShadow = true; root.add(fence);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2f3a3a, roughness: .5, metalness: .6 }); const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffc46a, emissiveIntensity: 1.6, roughness: .4 });
    const poles = [], lamps = []; const lampX = [-6, 4, 14, 24, 34];
    for (const x of lampX) for (const s of [-1, 1]) { const z = s * (laneHalf + 1.15); poles.push(new THREE.CylinderGeometry(.045, .07, 2.9, 10).translate(x, 1.45, z), new THREE.CylinderGeometry(.03, .03, .5, 8).rotateZ(Math.PI / 2).translate(x - .2, 2.9, z), new THREE.TorusGeometry(.1, .025, 8, 16).rotateX(Math.PI / 2).translate(x - .45, 2.86, z)); lamps.push(new THREE.SphereGeometry(.15, 12, 10).translate(x - .45, 2.72, z)); }
    const poleMesh = new THREE.Mesh(mergeGeometries(poles), poleMat); poleMesh.castShadow = true; root.add(poleMesh); root.add(new THREE.Mesh(mergeGeometries(lamps), lampMat));
    const flagCols = [0xe24a3b, 0xf2c230, 0x3d8ee0, 0x4fae5c, 0xf07aa8, 0xffffff]; const flagParts = []; const linePts = [];
    for (const x of [4, 24]) { const zA = -(laneHalf + 1.15), zB = laneHalf + 1.15, n = 20; for (let i = 0; i <= n; i++) { const t = i / n, z = zA + (zB - zA) * t, y = 2.9 - .35 * Math.sin(t * Math.PI); linePts.push(new THREE.Vector3(x, y, z)); if (i < n) { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y, z - .07), new THREE.Vector3(x, y, z + .07), new THREE.Vector3(x, y - .22, z)]); const c = new THREE.Color(flagCols[i % flagCols.length]); g.setAttribute('color', new THREE.Float32BufferAttribute([c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b], 3)); g.computeVertexNormals(); flagParts.push(g); } } linePts.push(null); }
    root.add(new THREE.Mesh(mergeGeometries(flagParts), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .9 })));
    const segs = []; for (let i = 0; i < linePts.length - 1; i++) if (linePts[i] && linePts[i + 1]) segs.push(linePts[i], linePts[i + 1]);
    root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segs), new THREE.LineBasicMaterial({ color: 0x333333 })));
  }

  // --- clouds: lumpy merged spheres with flat bottoms, instanced, lit like everything else, fogged with distance ---
  const cloudMat = paper ? new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8a9aa8, emissiveIntensity: .45 }) : new THREE.MeshStandardMaterial({ color: 0xf6f7f9, roughness: 1, metalness: 0, emissive: 0x3a4250, emissiveIntensity: .35 });
  const cloudGeos = []; for (let v = 0; v < 3; v++) { const parts = []; const n = 7 + v * 2; for (let k = 0; k < n; k++) { const t = k / (n - 1) - .5; const r = rr(7, 13) * (1 - Math.abs(t) * .8); const g = blob(r, 1, .12, .85); g.translate(t * 46 + rr(-4, 4), rr(0, 6), rr(-8, 8)); parts.push(g); } const g = mergeGeometries(parts); const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < -1.5) p.setY(i, -1.5 + (p.getY(i) + 1.5) * .15); g.computeVertexNormals(); cloudGeos.push(g); }
  const cloudMeshes = []; const cloudM = new THREE.Matrix4(), cloudP = new THREE.Vector3(), cloudQ = new THREE.Quaternion(), cloudS = new THREE.Vector3();
  { const per = 16; for (let v = 0; v < 3; v++) { const mesh = new THREE.InstancedMesh(cloudGeos[v], cloudMat, per); for (let i = 0; i < per; i++) { const x = rr(-500, roadEnd + 900), z = (rnd() < .5 ? -1 : 1) * rr(60, 900), y = rr(110, 230) + Math.abs(z) * .05, s = rr(1.6, 3.6); cloudP.set(x, y, z); cloudQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rr(0, 6.283)); cloudS.set(s, s * rr(.7, 1), s); cloudM.compose(cloudP, cloudQ, cloudS); mesh.setMatrixAt(i, cloudM); } mesh.computeBoundingSphere(); mesh.frustumCulled = false; cloudMeshes.push(mesh); root.add(mesh); } }

  // --- birds: a small flock circling ahead of the player, flapping in the shader ---
  const birdGeo = (() => { const g = new THREE.BufferGeometry(); const v = [0, 0, -.08, 0, 0, .1, -.55, .02, -.02, 0, 0, .08, 0, 0, -.1, .55, .02, .02]; const vv = []; for (let i = 0; i < v.length; i += 3) vv.push(v[i], v[i + 1], v[i + 2]); g.setAttribute('position', new THREE.Float32BufferAttribute(vv, 3)); g.rotateY(Math.PI / 2); g.computeVertexNormals(); return g; })();
  const birds = new THREE.InstancedMesh(birdGeo, animate(new THREE.MeshBasicMaterial({ color: 0x24262c, side: THREE.DoubleSide }), FLAP_BIRD), 14); birds.frustumCulled = false; root.add(birds);
  const birdDummy = new THREE.Object3D(); const birdDir = new THREE.Vector3();

  // --- butterflies near the flowers, all motion in the shader ---
  const bfMat = animate(new THREE.MeshBasicMaterial({ map: butterflyTexture(), alphaTest: .4, side: THREE.DoubleSide }), FLAP_BUTTERFLY);
  const bfGeo = upNormals(new THREE.PlaneGeometry(.17, .13).rotateX(-Math.PI / 2));
  const bfs = []; for (let i = 0; i < flowers.length; i += 90) { const f = flowers[i]; bfs.push({ x: f.x, z: f.z, y: f.y + rr(.4, .9), ry: rnd() * 6.283, col: [0xff9a2e, 0xffd33a, 0x6fb3ff, 0xffffff, 0xff6fa5][Math.floor(rnd() * 5)] }); }
  scatter(bfGeo, bfMat, bfs, { cast: false, range: 200, color: (it, c) => c.setHex(it.col) });

  // --- paper: the painted valley on a cylinder round the player (paper-square.js's backdrop), behind everything, never fogged ---
  let backdrop = null;
  if (paper) {
    const R = 700, BH = 150, mat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, transparent: true, depthWrite: false, opacity: 0 });
    backdrop = new THREE.Mesh(new THREE.CylinderGeometry(R, R, BH, 64, 1, true), mat); backdrop.position.y = BH / 2 - 12; backdrop.renderOrder = -5; backdrop.frustumCulled = false; root.add(backdrop);
    spriteTexture('hills', { scale: 1 }).then(t => { if (!t) return; t.wrapS = THREE.RepeatWrapping; t.repeat.set(6, 1); t.needsUpdate = true; mat.map = t; mat.opacity = 1; mat.needsUpdate = true; }).catch(e => console.warn('[env] backdrop', e));
  }

  // --- per-frame ---
  const sunOffset = sunDir.clone().multiplyScalar(90); let cloudDrift = 0;
  function update(dt, now, p) {
    const t = now > 1e4 ? now * .001 : now; uTime.value = t;
    sun.position.copy(p).add(sunOffset); sun.target.position.copy(p); sky.position.set(p.x, 0, p.z); if (backdrop) backdrop.position.set(p.x, backdrop.position.y, p.z);
    cloudDrift += dt * 1.4; for (const m of cloudMeshes) m.position.x = cloudDrift;
    for (const m of chunks) m.visible = Math.abs(m.userData.cx - p.x) < m.userData.range + CHUNK;
    const cx = p.x + 70 + 45 * Math.cos(t * .11), cz = 70 * Math.sin(t * .11), cy = 22 + 3 * Math.sin(t * .3); birdDir.set(-Math.sin(t * .11) * 45 * .11, 0, Math.cos(t * .11) * 70 * .11).normalize();
    const heading = Math.atan2(-birdDir.z, birdDir.x);
    for (let i = 0; i < 14; i++) { const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1; birdDummy.position.set(cx - birdDir.x * row * 1.6 + birdDir.z * side * row * 1.1, cy + Math.sin(t * 1.7 + i) * .4, cz - birdDir.z * row * 1.6 - birdDir.x * side * row * 1.1); birdDummy.rotation.set(0, heading, 0); birdDummy.updateMatrix(); birds.setMatrixAt(i, birdDummy.matrix); }
    birds.instanceMatrix.needsUpdate = true;
  }
  update(0, 0, new THREE.Vector3(0, 0, 0));
  return { update, sun, hemi, sky, terrain, road, heightAt, fog: scene.fog, root, backdrop, paper, clouds: cloudMeshes };   // clouds: main hides them when the camera is up among them (the Long Road's chart shot)
}

// ---------- post-processing: render → subtle bloom → tone map/sRGB → SMAA ----------
export function makeComposer(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
  const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target); composer.setSize(size.x, size.y);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x * pr, size.y * pr), .25, .5, .85);
  const smaa = new SMAAPass(size.x * pr, size.y * pr);
  composer.addPass(new RenderPass(scene, camera)); composer.addPass(bloom); composer.addPass(new OutputPass()); composer.addPass(smaa);
  return { composer, bloom, render(dt) { composer.render(dt); }, setSize(w, h) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); } };
}
