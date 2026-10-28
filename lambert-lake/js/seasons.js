/* Seasons: a flip-book of years laid over a Leaflet map. Spring green, summer warmth, fall colour with a few
   falling leaves, winter snow with a drift of flakes, cycling as the year advances.

   Self-contained: no dependency beyond the Leaflet map you hand it (it uses only map methods, not the L global).
   One instance per page (a second attach() detaches the first).

   How it sits on the map: five panes inside Leaflet's map pane, above the tile panes and below the vectors
   (default z-index 300..304; Leaflet's overlayPane is 400, markers 600, tooltips 650). Each pane is a single
   viewport-sized element held still against the map's panning with one transform:
     - a saturation layer (mix-blend-mode: saturation): winter greys the map, fall and summer warm it a touch
     - a multiply layer: the season's colour grade (green, warm, orange-red)
     - a screen layer: winter's light snow wash
     - one canvas: snow, leaves, and the optional trees
   So it grades any base underneath: period maps, plats, air photos.

   API (window.Seasons):
     Seasons.attach(map, opts)    -> Seasons. opts (all optional):
         zIndex: 300              the lowest of the five panes (sat, mul, scr, haze, fx canvas)
         particles: true          snow and leaves (forced off under prefers-reduced-motion)
         reducedMotion: auto      true/false to override the media query
         strength: 1              scales every tint (0..1)
         snow: 140, leaves: 26    particle counts
     Seasons.setTime(yearFloat)   the integer part is the year (it grows the trees); the fractional part is the
                                  season: 0 spring, .25 summer, .5 fall, .75 winter (each season holds for most
                                  of its quarter, then crossfades into the next). Under reduced motion the season
                                  is pinned (opts.staticSeason, default .3: summer) and only a static tint remains.
     Seasons.setIntensity(0..1)   0 = invisible (the panes are display:none, no cost); ramp it at step edges.
     Seasons.setTrees(latlngs, { from, to })   small tree glyphs at these [lat, lng] points that grow from a
                                  sapling in year `from` to full size by year `to`, coloured by the season.
                                  Trees show whenever set, at any intensity. Pass null to clear.
     Seasons.setMood({ storm, smoke, warm })   weather laid over the season, each 0..1 (missing keys are 0):
                                  storm a grey wash, smoke a brown haze from the top, warm a golden high-summer
                                  light. Independent of setIntensity; setMood(null) clears.
     Seasons.setParticles(0..1)   the share of the snow and leaves that fall (default 1, all of opts.snow/leaves);
                                  0 leaves a tint with nothing falling.
     Seasons.state()              { year, season: "spring"|"summer"|"fall"|"winter", intensity, mood, particles } (tests)
     Seasons.detach()             removes the panes and stops the animation loop.
*/
(function (root) {
  "use strict";
  const NAMES = ["spring", "summer", "fall", "winter"];
  // per season: multiply colour [r,g,b] and its strength, screen colour and strength, signed saturation shift
  const P = [
    { mul: [178, 212, 128], ma: .36, scr: [24, 34, 0], sa: .2, sat: .03 },     // spring: fresh green
    { mul: [238, 214, 160], ma: .26, scr: [30, 22, 0], sa: .2, sat: .02 },     // summer: gentle warmth
    { mul: [218, 150, 100], ma: .26, scr: [0, 0, 0], sa: 0, sat: .03 },        // fall: muted orange and red
    { mul: [196, 210, 228], ma: .30, scr: [226, 234, 242], sa: .50, sat: -.55 } // winter: snow wash, greyed
  ];
  const LEAF = ["#b5482a", "#cf7a2c", "#d9a441", "#9a3a22", "#c45f2a"];
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const mix = (a, b, f) => a + (b - a) * f;

  let map = null, O = null, panes = null, ctx = null, cvs = null, raf = 0, last = 0;
  let year = 0, phase = .3, intensity = 0, W = [0, 1, 0, 0];
  let trees = null, treeSpan = [0, 1];
  let flakes = [], leaves = [], size = { x: 0, y: 0 }, dpr = 1;
  let styleSig = "";
  let mood = { storm: 0, smoke: 0, warm: 0 }, partScale = 1;

  function weights(f) { // season weights for a phase in [0,1): hold for 70% of the quarter, then crossfade
    const q = ((f % 1) + 1) % 1 * 4, i = Math.floor(q) % 4, w = sstep(.7, 1, q - i), out = [0, 0, 0, 0];
    out[i] += 1 - w; out[(i + 1) % 4] += w; return out;
  }
  function place() { // keep the panes on the viewport while the map pane pans
    if (!panes) return;
    const p = map.containerPointToLayerPoint([0, 0]), t = `translate3d(${p.x}px,${p.y}px,0)`;
    for (const k in panes) panes[k].style.transform = t;
    if (trees) frame();
  }
  function resize() {
    if (!panes) return;
    const s = map.getSize(); size = { x: s.x, y: s.y }; dpr = Math.min(2, root.devicePixelRatio || 1);
    for (const k in panes) { panes[k].style.width = s.x + "px"; panes[k].style.height = s.y + "px"; }
    cvs.width = Math.round(s.x * dpr); cvs.height = Math.round(s.y * dpr);
    seed(); place(); frame();
  }
  function seed() {
    const n = O.particles ? O.snow : 0, m = O.particles ? O.leaves : 0;
    flakes = Array.from({ length: n }, () => ({ x: Math.random() * size.x, y: Math.random() * size.y, r: 1.1 + Math.random() * 2.3,
      vy: 26 + Math.random() * 46, ph: Math.random() * 6.28, sw: 8 + Math.random() * 16 }));
    leaves = Array.from({ length: m }, () => ({ x: Math.random() * size.x, y: Math.random() * size.y, s: 4 + Math.random() * 4,
      vy: 34 + Math.random() * 40, ph: Math.random() * 6.28, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 3, c: LEAF[Math.floor(Math.random() * LEAF.length)] }));
  }
  function grade() { // the three tint layers, written only when they change
    const I = intensity * O.strength;
    let mr = 0, mg = 0, mb = 0, sr = 0, sg = 0, sb = 0, sat = 0;
    W.forEach((w, i) => {
      const s = P[i];
      mr += w * mix(255, s.mul[0], s.ma); mg += w * mix(255, s.mul[1], s.ma); mb += w * mix(255, s.mul[2], s.ma);
      sr += w * s.scr[0] * s.sa; sg += w * s.scr[1] * s.sa; sb += w * s.scr[2] * s.sa; sat += w * s.sat;
    });
    let r = mix(255, mr, I), g = mix(255, mg, I), b = mix(255, mb, I), s = sat * I;
    let scR = sr * I, scG = sg * I, scB = sb * I;
    const st = mood.storm * O.strength, sm = mood.smoke * O.strength, wm = mood.warm * O.strength;
    // the weather multiplies on top of the season: storm grey-blue and greyed, smoke brown, warm golden
    if (st) { r *= mix(1, 150 / 255, st); g *= mix(1, 156 / 255, st); b *= mix(1, 168 / 255, st); s -= .5 * st; }
    if (sm) { r *= mix(1, 222 / 255, sm); g *= mix(1, 196 / 255, sm); b *= mix(1, 172 / 255, sm); s -= .2 * sm; }
    if (wm) { r *= mix(1, 1, wm); g *= mix(1, 222 / 255, wm); b *= mix(1, 160 / 255, wm); s += .08 * wm; scR += 46 * wm; scG += 28 * wm; }
    const mul = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
    const scr = `rgb(${Math.round(scR)},${Math.round(scG)},${Math.round(scB)})`;
    const satBg = s < 0 ? "rgb(128,128,128)" : "hsl(28,100%,50%)", satOp = Math.min(1, Math.abs(s)).toFixed(3);
    const haze = sm > .002 ? `linear-gradient(180deg, rgba(120,98,78,${(.55 * sm).toFixed(3)}) 0%, rgba(150,128,104,${(.32 * sm).toFixed(3)}) 45%, rgba(170,150,126,${(.14 * sm).toFixed(3)}) 100%)` : "";
    const on = I > .002 || st > .002 || sm > .002 || wm > .002, sig = [on, mul, scr, satBg, satOp, !!trees, haze].join("|");
    if (sig === styleSig) return; styleSig = sig;
    const show = (el, v) => { el.style.display = v ? "block" : "none"; };
    show(panes.mul, on); show(panes.scr, on); show(panes.sat, on && +satOp > .002); show(panes.fx, on || !!trees);
    panes.mul.style.background = mul; panes.scr.style.background = scr;
    panes.sat.style.background = satBg; panes.sat.style.opacity = satOp;
    show(panes.haze, !!haze); panes.haze.style.background = haze;
  }
  function drawTree(x, y, g, w, conifer) { // g: growth 0..1; w: season weights; a crown of blobs, or a fir's tiers
    const a = ctx._a, h = 6 + 16 * g, cr = 2.6 + 6.4 * g, k = Math.abs((x * 7 + y * 13) | 0);
    ctx.globalAlpha = a; ctx.fillStyle = "rgba(78,54,30,.95)";
    ctx.fillRect(x - .6 - .5 * g, y - h * .5, 1.2 + g, h * .5);
    if (conifer) { // firs stay green; winter puts snow on their shoulders
      const col = blendHex([["#5d8a4a", w[0]], ["#3f6638", w[1]], ["#3f6236", w[2]], ["#4d5e48", w[3]]]);
      for (let t = 0; t < 2; t++) {
        const top = y - h * (1.15 - t * .32), wd = cr * (0.75 + t * .3);
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x - wd, top + h * .55); ctx.lineTo(x + wd, top + h * .55); ctx.closePath(); ctx.fill();
        if (w[3] > .05) { ctx.globalAlpha = a * w[3]; ctx.fillStyle = "#f8fbff"; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x - wd * .5, top + h * .27); ctx.lineTo(x + wd * .5, top + h * .27); ctx.closePath(); ctx.fill(); ctx.globalAlpha = a; }
      }
      return;
    }
    const cy = y - h * .5 - cr * .55, leafy = 1 - w[3] * .9;
    if (leafy > .02) {
      const col = blendHex([["#97be5c", w[0]], ["#55803d", w[1]], [LEAF[k % LEAF.length], w[2]], ["#6d6a52", w[3]]]);
      ctx.globalAlpha = a * leafy; ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x - cr * .45, cy + cr * .15, cr * .7, 0, 6.2832); ctx.arc(x + cr * .45, cy + cr * .15, cr * .7, 0, 6.2832); ctx.arc(x, cy - cr * .3, cr * .78, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = a * leafy * .35; ctx.fillStyle = "#2a2010"; ctx.beginPath(); ctx.arc(x + cr * .3, cy + cr * .35, cr * .55, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = a;
    }
    if (w[3] > .05) { // bare branches and a little snow
      ctx.globalAlpha = a * w[3]; ctx.strokeStyle = "rgba(78,54,30,.95)"; ctx.lineWidth = .9; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x, cy + cr * .5); ctx.lineTo(x - cr * .75, cy - cr * .5); ctx.moveTo(x, cy + cr * .3); ctx.lineTo(x + cr * .7, cy - cr * .55); ctx.moveTo(x, cy + cr * .5); ctx.lineTo(x, cy - cr * .9); ctx.stroke();
      ctx.fillStyle = "rgba(250,252,255,.95)"; ctx.beginPath(); ctx.ellipse(x - cr * .4, cy - cr * .45, cr * .35, cr * .14, -.5, 0, 6.2832); ctx.ellipse(x + cr * .4, cy - cr * .5, cr * .35, cr * .14, .5, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = a;
    }
  }
  const hexRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  function blendHex(list) { let r = 0, g = 0, b = 0, t = 0; for (const [h, w] of list) { if (w <= 0) continue; const c = hexRgb(h); r += c[0] * w; g += c[1] * w; b += c[2] * w; t += w; } t = t || 1; return `rgb(${Math.round(r / t)},${Math.round(g / t)},${Math.round(b / t)})`; }

  function frame(now) {
    raf = 0; if (!panes) return;
    now = now || performance.now();
    const dt = Math.min(.05, last ? (now - last) / 1000 : 0); last = now;
    // setParticles thins the fall (fewer flakes and leaves) rather than fading it
    const I = partScale > 0 ? intensity : 0, snowA = W[3] * I, leafA = W[2] * I;
    const nF = Math.round(flakes.length * partScale), nL = Math.round(leaves.length * partScale);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size.x, size.y);
    if (trees) {
      const g = clamp01((year - treeSpan[0]) / Math.max(1, treeSpan[1] - treeSpan[0]));
      const tw = I > .02 ? W.map(w => w * I).map((w, i) => i === 1 ? w + (1 - I) : w) : [0, 1, 0, 0];
      ctx._a = 1; ctx.globalAlpha = 1;
      for (const t of trees) { const p = map.latLngToContainerPoint(t); if (p.x < -20 || p.y < -20 || p.x > size.x + 20 || p.y > size.y + 30) continue; drawTree(p.x, p.y, .15 + .85 * g * (t.k || 1), tw, t.c); }
    }
    if (snowA > .01) {
      ctx.fillStyle = "#fbfdff";
      for (let k = 0; k < nF; k++) { const f = flakes[k];
        f.y += f.vy * dt; f.ph += dt * 1.3; if (f.y > size.y + 4) { f.y = -4; f.x = Math.random() * size.x; }
        // a faint cool rim under each flake, so the snow reads on pale paper maps as well as dark imagery
        const fx = f.x + Math.sin(f.ph) * f.sw, fa = snowA * (.55 + .45 * Math.sin(f.ph * 2));
        ctx.globalAlpha = fa * .5; ctx.fillStyle = "#5d7590"; ctx.beginPath(); ctx.arc(fx + .4, f.y + .6, f.r + .8, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = fa; ctx.fillStyle = "#fbfdff"; ctx.beginPath(); ctx.arc(fx, f.y, f.r, 0, 6.2832); ctx.fill();
      }
    }
    if (leafA > .01) {
      for (let k = 0; k < nL; k++) { const l = leaves[k];
        l.y += l.vy * dt; l.ph += dt * 1.6; l.rot += l.vr * dt; if (l.y > size.y + 8) { l.y = -8; l.x = Math.random() * size.x; }
        ctx.globalAlpha = leafA * .95; ctx.fillStyle = l.c;
        ctx.save(); ctx.translate(l.x + Math.sin(l.ph) * 22, l.y); ctx.rotate(l.rot);
        ctx.beginPath(); ctx.ellipse(0, 0, l.s, l.s * .48, 0, 0, 6.2832); ctx.fill(); ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    if (O.particles && (snowA > .01 || leafA > .01)) raf = requestAnimationFrame(frame); else last = 0;
  }
  const kick = () => { if (!raf && panes) raf = requestAnimationFrame(frame); };
  function update() { if (!panes) return; W = weights(O.reducedMotion ? O.staticSeason : phase); grade(); kick(); }

  const Seasons = {
    attach(m, opts) {
      if (map) Seasons.detach();
      map = m;
      const rm = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
      O = Object.assign({ zIndex: 300, particles: true, strength: 1, snow: 140, leaves: 26, staticSeason: .3 }, opts || {});
      if (O.reducedMotion == null) O.reducedMotion = rm;
      if (O.reducedMotion) O.particles = false;
      const mk = (name, z, blend) => {
        const el = map.createPane(name); el.style.zIndex = z; el.style.pointerEvents = "none"; el.style.display = "none";
        el.style.left = "0"; el.style.top = "0"; el.style.willChange = "transform"; if (blend) el.style.mixBlendMode = blend; return el;
      };
      panes = { sat: mk("seasonsSat", O.zIndex, "saturation"), mul: mk("seasonsMul", O.zIndex + 1, "multiply"),
        scr: mk("seasonsScr", O.zIndex + 2, "screen"), haze: mk("seasonsHaze", O.zIndex + 3, null), fx: mk("seasonsFx", O.zIndex + 4, null) };
      cvs = document.createElement("canvas"); cvs.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none";
      panes.fx.appendChild(cvs); ctx = cvs.getContext("2d");
      map.on("move zoom viewreset", place); map.on("resize", resize);
      styleSig = ""; resize(); update();
      return Seasons;
    },
    setTime(y) {
      if (!isFinite(y)) return Seasons;
      const ny = Math.floor(y), np = y - ny;
      if (ny === year && Math.abs(np - phase) < 1e-4) return Seasons;
      year = ny; phase = np; update(); return Seasons;
    },
    setIntensity(v) {
      v = clamp01(+v || 0); if (O && O.reducedMotion) v = Math.min(v, .5);
      if (Math.abs(v - intensity) < 1e-3 && !(v === 0 && intensity !== 0)) return Seasons;
      intensity = v; update(); return Seasons;
    },
    setTrees(list, span) {
      trees = list && list.length ? list.map(p => { const o = Array.isArray(p) ? { lat: p[0], lng: p[1] } : { lat: p.lat, lng: p.lng }; o.k = .75 + Math.random() * .25; o.c = Math.random() < .3; return o; }) : null;
      if (span) treeSpan = [span.from, span.to];
      styleSig = ""; update(); return Seasons;
    },
    setMood(m) {
      const n = { storm: clamp01(+(m && m.storm) || 0), smoke: clamp01(+(m && m.smoke) || 0), warm: clamp01(+(m && m.warm) || 0) };
      if (Math.abs(n.storm - mood.storm) + Math.abs(n.smoke - mood.smoke) + Math.abs(n.warm - mood.warm) < 1e-3) return Seasons;
      mood = n; update(); return Seasons;
    },
    setParticles(v) { v = clamp01(v == null ? 1 : +v); if (Math.abs(v - partScale) < 1e-3) return Seasons; partScale = v; kick(); return Seasons; },
    state() { const i = W.indexOf(Math.max(...W)); return { year, phase, season: NAMES[i], intensity, mood: Object.assign({}, mood), particles: partScale }; },
    detach() {
      if (!map) return Seasons;
      cancelAnimationFrame(raf); raf = 0;
      map.off("move zoom viewreset", place); map.off("resize", resize);
      for (const k in panes) { const el = panes[k]; el.remove(); for (const n in map._panes) if (map._panes[n] === el) delete map._panes[n]; }
      map = null; panes = null; ctx = null; cvs = null; trees = null; intensity = 0; styleSig = ""; mood = { storm: 0, smoke: 0, warm: 0 }; partScale = 1;
      return Seasons;
    }
  };
  root.Seasons = Seasons;
  if (typeof module === "object" && module.exports) module.exports = Seasons;
})(typeof window !== "undefined" ? window : this);
