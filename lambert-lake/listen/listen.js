/* Lambert Lake, Listen: a Season One episode plays and the map animates in step with the narration.
   Everything on screen is a pure function of the audio clock: render(audio.currentTime) every animation frame.
   So a seek lands on the exact state at that time in one frame, with no camera travel to get there.
     cues/epNN.json    the mixer's own timeline (radio/season1/cues.py): every line, sfx and music cue, in seconds
     scenes/epNN.json  the hand-cut scene track: time ranges -> view, base maps, route progress, marker, picture,
                       caption, date, season, emphasis, generation ribbon (README.md has the format)
   Engine rules carried over from js/story.js (read-only there; copied here):
     - the camera moves with _moveStart/_move/_moveEnd, never an unanimated setView (a view reset drops every tile)
     - after a centre-only move, fire 'zoom' so the tile layers re-place their tiles
     - zoom is monotonic inside a leg: a follow scene holds one zoom; only scene changes travel
     - the tiles of the next scenes' views are fetched ahead of time
     - an always-loaded low-zoom underlay, so a jump never shows a blank frame */
window.LL = window.LL || {};

(function () {
  const C = LL.CONFIG, $ = id => document.getElementById(id);
  const RM = C.reducedMotion;
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const ease = t => { t = clamp01(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const lerpLL = (a, b, f) => L.latLng(a.lat + (b.lat - a.lat) * f, a.lng + (b.lng - a.lng) * f);
  const ll = c => L.latLng(c[1], c[0]);
  const esc = t => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const fmtT = s => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const TITLES = ["The Boy from Boulogne", "The Canoe and the Farm", "The Hail and the Letter", "Steamboats and a Moving House",
    "Squeaky Wheels and the Oregon Dream", "The Lake with an Island"];
  const EPS = TITLES.length;
  const pad2 = n => String(n).padStart(2, "0");

  // ---------- the map ----------
  const map = L.map("map", {
    zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
    boxZoom: false, keyboard: false, touchZoom: false, tap: false, zoomSnap: 0, zoomAnimation: false, fadeAnimation: !RM,
    markerZoomAnimation: false, inertia: false, worldCopyJump: false
  });
  map.attributionControl.setPrefix("");
  map.createPane("base").style.zIndex = 200; map.getPane("base").classList.add("pane-base");
  map.createPane("period").style.zIndex = 220; map.getPane("period").classList.add("pane-period");
  map.createPane("hist").style.zIndex = 250;
  map.setView([47, -40], 3);
  const SEA = window.Seasons ? window.Seasons.attach(map, { reducedMotion: RM }) : null;

  function applyView(c) {
    if (!map._loaded) return map.setView(c.center, c.zoom, { animate: false });
    const zoomChanged = Math.abs(map.getZoom() - c.zoom) > 1e-9;
    map._moveStart(zoomChanged, false)._move(c.center, c.zoom);
    if (!zoomChanged) map.fire("zoom");       // a centre-only _move fires no 'zoom'; the tiles need it to re-place
    map._moveEnd(zoomChanged);
  }
  // Leaflet's flyTo curve (van Wijk and Nuij) as a function of t in [0, 1] (from story.js)
  function flyPath(a, b) {
    const z0 = a.zoom, z1 = b.zoom;
    const from = map.project(a.center, z0), to = map.project(b.center, z0), size = map.getSize();
    const w0 = Math.max(size.x, size.y), w1 = w0 * map.getZoomScale(z0, z1), u1 = to.distanceTo(from) || 1, rho = 1.42, rho2 = rho * rho;
    const r = i => { const s1 = i ? -1 : 1, s2 = i ? w1 : w0, t1 = w1 * w1 - w0 * w0 + s1 * rho2 * rho2 * u1 * u1, b1 = 2 * s2 * rho2 * u1, bb = t1 / b1, sq = Math.sqrt(bb * bb + 1) - bb; return sq < 1e-9 ? -18 : Math.log(sq); };
    const sinh = n => (Math.exp(n) - Math.exp(-n)) / 2, cosh = n => (Math.exp(n) + Math.exp(-n)) / 2, tanh = n => sinh(n) / cosh(n);
    const r0 = r(0), S = (r(1) - r0) / rho;
    if (!isFinite(S) || Math.abs(S) < 1e-6 || u1 < 2) return t => (t <= 0 ? a : t >= 1 ? b : { center: lerpLL(a.center, b.center, t), zoom: z0 + (z1 - z0) * t });
    const w = s => w0 * (cosh(r0) / cosh(r0 + rho * s)), u = s => w0 * (cosh(r0) * tanh(r0 + rho * s) - sinh(r0)) / rho2;
    return t => {
      if (t <= 0) return a; if (t >= 1) return b;
      const s = t * S;
      return { center: map.unproject(from.add(to.subtract(from).multiplyBy(u(s) / u1)), z0), zoom: map.getScaleZoom(w0 / w(s), z0) };
    };
  }
  // a gentle drift inside a scene: centre and zoom both eased, zoom strictly one way
  const drift = (a, b) => t => { const f = ease(t), pa = map.project(a.center, 0), pb = map.project(b.center, 0); return { center: map.unproject(pa.add(pb.subtract(pa).multiplyBy(f)), 0), zoom: a.zoom + (b.zoom - a.zoom) * f }; };

  // ---------- data ----------
  let D = {}, routes = {}, FIT = {}, MANI = {}, GEN = {};
  const ROUTE_GROUPS = [["sea", "huron"], [1, 2, 3, 4, 5, 6, 7, 8, 9], ["oregon"]];
  function pathOf(latlngs) {
    const cum = [0];
    for (let i = 1; i < latlngs.length; i++) cum.push(cum[i - 1] + latlngs[i - 1].distanceTo(latlngs[i]));
    return { latlngs, cum, len: cum[cum.length - 1] };
  }
  function partial(path, p) {
    const { latlngs, cum, len } = path, target = p * len;
    if (p <= 0) return [latlngs[0]];
    if (p >= 1) return latlngs;
    const out = [latlngs[0]];
    for (let i = 1; i < latlngs.length; i++) {
      if (cum[i] <= target) out.push(latlngs[i]);
      else { out.push(lerpLL(latlngs[i - 1], latlngs[i], (target - cum[i - 1]) / (cum[i] - cum[i - 1]))); break; }
    }
    return out;
  }
  const pointAt = (path, p) => { const pts = partial(path, clamp01(p)); return pts[pts.length - 1]; };
  const yr = s => { const m = /\d{4}/.exec(String(s || "")); return m ? m[0] : ""; };

  async function loadAll() {
    const j = async u => { try { const r = await fetch(u, { cache: "no-cache" }); return r.ok ? r.json() : null; } catch (e) { return null; } };
    const [journey, eu, lake, parcels, points, places, gens, desc, mani, bm, ti] = await Promise.all([
      j("data/journey.geojson"), j("data/eustache-route.geojson"), j("data/lake-1855.geojson"), j("data/parcels.geojson"),
      j("data/points.geojson"), j("data/journey-places.geojson"), j("data/generations.json"), j("data/descendants.json"),
      j("img/journey/manifest.json"), j("data/basemaps.json"), j("data/tile-index.json")]);
    if (bm) LL.applyBasemapMeta(bm);
    if (ti) LL.tileIndex = ti;
    await LL.probeBasemaps();
    for (const f of (journey && journey.features) || []) {
      const p = f.properties; if (p.alternative || f.geometry.type !== "LineString") continue;
      routes[p.leg] = { path: pathOf(f.geometry.coordinates.map(ll)), water: /^(steam|boat)/i.test(p.mode || ""), label: `${p.from} to ${p.to}` };
    }
    for (const f of (eu && eu.features) || []) routes[f.properties.leg] = { path: pathOf(f.geometry.coordinates.map(ll)), water: true, label: f.properties.note };
    // Modeste's road to the Oregon Country, 1838: Red River, the Rockies, Fort Vancouver, the Willamette. Approximate.
    routes.oregon = { path: pathOf([[46.81, -71.21], [45.5, -73.55], [46.3, -78.7], [46.5, -84.4], [48.4, -89.2], [49.89, -97.12], [51.0, -105], [51.6, -113.5], [52.1, -118.2], [49.0, -118.0], [46.2, -119.0], [45.63, -122.67], [45.21, -122.98]].map(c => L.latLng(c[0], c[1]))), water: false, dashed: true, label: "Modeste's road to Oregon, 1838, approximate" };
    const B = pts => L.latLngBounds(pts);
    const ringOf = f => f.geometry.coordinates[0].map(ll);
    const pf = (parcels && parcels.features) || [];
    const grp = g => pf.filter(f => f.properties.group === g).flatMap(ringOf);
    const lakeRing = lake && lake.features[0] ? (lake.features[0].geometry.type === "Polygon" ? lake.features[0].geometry.coordinates[0] : lake.features[0].geometry.coordinates[0][0]).map(ll) : [];
    D.lakeRing = lakeRing; D.islandRing = pf.filter(f => f.properties.group === "abraham-island").map(ringOf);
    D.farmRing = pf.filter(f => f.properties.group === "abraham-gervais").map(ringOf);
    const pts = {}; for (const f of (points && points.features) || []) pts[f.properties.id] = ll(f.geometry.coordinates);
    D.pts = pts;
    FIT = {
      atlantic: B([[41, -76], [53, 6]]),
      journey: B(Object.keys(routes).filter(k => /^\d$/.test(k)).flatMap(k => routes[k].path.latlngs)),
      lake: lakeRing.length ? B(lakeRing) : null, island: B(grp("abraham-island")), farm: B(grp("abraham-gervais")),
      gervais: B(grp("abraham-gervais").concat(grp("louis-gervais"), grp("abraham-island"))),
      home: B([pts.house, pts.ring].filter(Boolean)).extend(B(grp("abraham-island")))
    };
    // Abraham's imagined autumn walk, from his farm north through the woods to the ring lake (episode 6)
    if (pts.ring) routes["walk-north"] = { path: pathOf([FIT.farm.getCenter(), L.latLng(45.052, -93.079), L.latLng(45.0605, -93.0765)]), water: false, dashed: true };
    FIT.park = B([[45.01333, -93.07546]]).extend(FIT.farm);
    FIT.world = B([[36, -125], [54, 4]]);
    for (const k in routes) FIT["route:" + k] = B(routes[k].path.latlngs);
    for (const m of (Array.isArray(mani) ? mani : (mani && (mani.images || mani.items)) || [])) if (m && m.beat) MANI[m.beat] = m;
    for (const g of [...(Array.isArray(gens) ? gens : (gens && gens.generations) || []), ...(Array.isArray(desc) ? desc : [])])
      GEN[+g.gen] = { name: String(g.name || "").replace(/\s*\(.*?\)\s*/g, " ").replace(/,?\s*"[^"]*"/g, "").trim(), years: `${yr(g.born) || "?"}–${yr(g.died) || ""}` };
    D.places = ((places && places.features) || []).map(f => ({ at: ll(f.geometry.coordinates), label: f.properties.label }));
  }

  // ---------- base maps: the scene's set, crossfaded at scene edges; the next scene's set loaded at opacity 0 ----------
  const bases = {};
  function baseLayer(key) {
    if (key in bases) return bases[key];
    let l = null;
    const ym = /^y:(\d{4})$/.exec(key);
    if (ym) {
      const e = (LL.yearsList || []).find(x => x.year === +ym[1]) || { year: +ym[1] };
      l = LL.tileLayer(C.tiles(e.year), Object.assign(C.tileOptions(e), { pane: "hist", opacity: 0, attribution: e.credit || "" }));
    } else if (C.basemaps[key]) l = LL.baseLayer(key, { pane: C.basemaps[key].probe ? "period" : "base", opacity: 0 });
    return bases[key] = l;
  }
  const UNDER = {};
  function underlay() {
    const mk = (key, nz, pane) => { const l = LL.baseLayer(key, { pane, opacity: 1, maxNativeZoom: nz, maxZoom: 13, keepBuffer: 8, attribution: "" }); if (l) { l.addTo(map); l.setZIndex(0); } return l; };
    UNDER.physical = mk("physical", 5, "base");
    UNDER.burr1839 = mk("burr1839", 5, "period");
    for (const k in UNDER) if (UNDER[k] && k !== "physical") UNDER[k].setOpacity(0);
  }
  const live = new Set();
  function setBases(want) { // want: Map key -> opacity
    for (const [k, o] of want) { const l = baseLayer(k); if (!l) continue; if (!live.has(k)) { l.addTo(map); live.add(k); } }
    for (const k of Array.from(live)) if (!want.has(k)) { map.removeLayer(bases[k]); live.delete(k); }
    let z = 1;
    for (const [k, o] of want) { const l = bases[k]; if (!l) continue; if (l.setZIndex) l.setZIndex(z++); if (l.options.opacity !== o) l.setOpacity(o); }
    if (UNDER.burr1839) { const o = want.get("burr1839") || 0; if (UNDER.burr1839.options.opacity !== o) UNDER.burr1839.setOpacity(o); }
  }

  // ---------- vectors: routes, marker, pins, the lake ----------
  const INK = { water: "#2f5f7a", land: "#8a2a22", halo: "#f6f0e1" };
  const routeLayers = {};
  function routeLayer(k) {
    if (routeLayers[k]) return routeLayers[k];
    const r = routes[k]; if (!r) return null;
    const ink = r.water ? INK.water : INK.land, dash = r.dashed ? "12 10" : null;
    const g = {
      todo: L.polyline(r.path.latlngs, { color: ink, weight: 3, opacity: .35, dashArray: "4 8", interactive: false }),
      halo: L.polyline([], { color: INK.halo, weight: 13, opacity: .9, interactive: false }),
      line: L.polyline([], { color: ink, weight: 6, opacity: 1, dashArray: dash, interactive: false }), done: -1, on: false
    };
    return routeLayers[k] = g;
  }
  function drawRoute(k, p, showTodo) {
    const g = routeLayer(k); if (!g) return;
    if (!g.on) { g.todo.addTo(map); g.halo.addTo(map); g.line.addTo(map); g.on = true; }
    g.todo.setStyle({ opacity: showTodo ? .35 : 0 });
    if (Math.abs(p - g.done) > 1e-5) { g.done = p; const pts = partial(routes[k].path, p); g.halo.setLatLngs(pts); g.line.setLatLngs(pts); }
  }
  function hideRoute(k) { const g = routeLayers[k]; if (g && g.on) { map.removeLayer(g.todo); map.removeLayer(g.halo); map.removeLayer(g.line); g.on = false; g.done = -1; } }

  const PAPER = "#f3ecda";
  const ICON = { // the vehicles, from story.js
    boat: `<path d="M1.8 14.6h20.4l-3 4.4H4.8z"/><path d="M4.6 11.2h12.6v3.4H4.6z"/><path d="M14 4.6h2.4v6.6H14z"/><path d="M5.6 14.6a3.9 3.9 0 0 1 7.8 0z" fill="${PAPER}" stroke="currentColor" stroke-width="1.3"/><circle cx="18.2" cy="3.2" r="1.3"/><circle cx="20.6" cy="2.2" r=".9"/>`,
    stage: `<path d="M4.4 5.2h13.2v1.2H4.4z"/><path d="M4.2 6.4h13.6l1.6 8.4H2.6z"/><path d="M6.4 8.2h3.6v3H6.4zM11.8 8.2h3.6v3h-3.6z" fill="${PAPER}"/><circle cx="6.4" cy="18" r="2.9" fill="${PAPER}" stroke="currentColor" stroke-width="1.7"/><circle cx="16.8" cy="18" r="2.9" fill="${PAPER}" stroke="currentColor" stroke-width="1.7"/>`,
    rail: `<path d="M3.2 5.4h17.6v1.5H3.2z"/><path d="M4 6.9h16v8.6H4z"/><path d="M6 8.8h3v3H6zM10.5 8.8h3v3h-3zM15 8.8h3v3h-3z" fill="${PAPER}"/><circle cx="8" cy="17.4" r="2"/><circle cx="16" cy="17.4" r="2"/><path d="M1.5 20.2h21" stroke="currentColor" stroke-width="1.3"/>`,
    cart: `<circle cx="17" cy="14.2" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M17 8.6v11.2M11.4 14.2h11.2M13 10.2l8 8M21 10.2l-8 8" stroke="currentColor" stroke-width=".9"/><path d="M12.2 7.6h9.6v2.6h-9.6z"/><path d="M8.6 11.2l4-1.4" stroke="currentColor" stroke-width="1.3"/><path d="M1 10.6l1.5-1.6.9 1.1h4.6c1.4 0 2.2.9 2.2 2.2v1.6h-.8v3.6H8.2v-3.2H4.4v3.2H3.2v-3.4c-1-.3-1.7-1-1.8-1.9z"/>`,
    walk: `<circle cx="12.6" cy="3.6" r="2.1"/><path d="M12.4 7l-1.2 6.4-3 6.2M11.2 13.4l3.6 6M11.8 8.4l-3.6 3.4M12.4 8.6l3.6 2.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
    tent: `<path d="M2.4 19.4L12 4.4l9.6 15z"/><path d="M12 4.4V2.6" stroke="currentColor" stroke-width="1.2"/><path d="M9.6 19.4l2.4-6 2.4 6z" fill="${PAPER}"/>`,
    ship: `<path d="M2 15.2h20l-2.6 4.2H5.2z"/><path d="M11.4 2.4h1.3v12.8h-1.3z"/><path d="M12.9 3.6c3.4 1.4 5.8 4.4 6.4 9.6h-6.4z"/><path d="M11.2 4.4c-2.8 1.6-5 4.6-5.8 8.8h5.8z" opacity=".75"/><path d="M12.7 2.4l3 1-3 1z"/>`,
    canoe: `<path d="M1.2 13.4c3 2.6 6.8 3.8 10.8 3.8s7.8-1.2 10.8-3.8c-.4 2.4-1.2 3.6-2.4 4.4H3.6c-1.2-.8-2-2-2.4-4.4z"/><circle cx="9" cy="8.6" r="1.6"/><path d="M8.2 10.4h1.8l.6 4.4H7.6z"/><path d="M12.6 5.2l-4 13" stroke="currentColor" stroke-width="1.2"/><circle cx="15.6" cy="9.2" r="1.5"/><path d="M14.8 10.9h1.7l.6 3.9h-3z"/>`,
    house: `<path d="M2.6 11.6L12 4l9.4 7.6-1 1.2L12 6 3.6 12.8z"/><path d="M5 11.4L12 5.8l7 5.6v8H5z"/><path d="M10.4 14h3.2v5.4h-3.2z" fill="${PAPER}"/><path d="M15.4 5.4h1.8v3.4l-1.8-1.4z"/>`,
    letter: `<path d="M2.5 6h19v12.5h-19z"/><path d="M2.5 6l9.5 7.2L21.5 6" fill="none" stroke="${PAPER}" stroke-width="1.5"/>`,
    star: `<path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z"/>`,
    boy: `<circle cx="12" cy="4.6" r="2.6"/><path d="M8.4 9.2h7.2l-1 6.4h-1.6l-.4 5.6h-2.2l-.4-5.6H8.4z"/>`
  };
  const MARKER_PX = 46;
  const marker = L.marker([0, 0], { interactive: false, keyboard: false, zIndexOffset: 2000, icon: L.divIcon({ className: "traveller", html: "", iconSize: [MARKER_PX, MARKER_PX] }) });
  let markerMode = "", markerOn = false;
  function setMarker(at, mode) {
    if (!at) { if (markerOn) { map.removeLayer(marker); markerOn = false; } return; }
    if (!markerOn) { marker.addTo(map); markerOn = true; }
    if (mode !== markerMode) { markerMode = mode; marker.setIcon(L.divIcon({ className: "traveller m-" + mode, html: `<span class="halo"></span><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICON[mode] || ICON.star}</svg>`, iconSize: [MARKER_PX, MARKER_PX] })); }
    const cur = marker.getLatLng(); if (cur.lat !== at.lat || cur.lng !== at.lng) marker.setLatLng(at);
  }
  const pinLayer = L.layerGroup().addTo(map); let pinSig = "";
  function setPins(pins) {
    const sig = JSON.stringify(pins || []); if (sig === pinSig) return; pinSig = sig; pinLayer.clearLayers();
    for (const p of pins || []) {
      const at = Array.isArray(p.at) ? L.latLng(p.at[0], p.at[1]) : (D.pts[p.at] || null); if (!at) continue;
      L.marker(at, { interactive: false, keyboard: false, icon: L.divIcon({ className: "pin", iconSize: [12, 12] }) })
        .bindTooltip(esc(p.label), { permanent: true, direction: p.dir || "right", offset: p.dir === "left" ? [-8, 0] : [8, 0], className: "pin-lbl", interactive: false }).addTo(pinLayer);
    }
  }
  let lakeLayer = null, lakeOn = false;
  function setLake(mode) { // "water": the 1855 ring full of water; "marsh": the drained ring; null: off
    if (!D.lakeRing || !D.lakeRing.length) return;
    if (!lakeLayer) lakeLayer = L.polygon([D.lakeRing, ...D.islandRing.map(r => r.slice().reverse())], { color: "#2f5f7a", weight: 2, fillColor: "#6f9fb5", fillOpacity: .55, interactive: false });
    if (!mode) { if (lakeOn) { map.removeLayer(lakeLayer); lakeOn = false; } return; }
    if (!lakeOn) { lakeLayer.addTo(map); lakeOn = true; }
    const st = mode === "marsh" ? { fillColor: "#8a9a5b", fillOpacity: .45, color: "#6b7a3f" } : { fillColor: "#6f9fb5", fillOpacity: .55, color: "#2f5f7a" };
    if (lakeLayer.options.fillColor !== st.fillColor) lakeLayer.setStyle(st);
  }

  // ---------- the scene track ----------
  let S = [], CUES = [], EP = 1, DUR = 0;
  const MOVE = 3.5; // seconds a scene change takes, on the audio clock
  function resolveView(v, sc) {
    if (!v) return null;
    if (v.follow != null) return { follow: true, zoom: v.follow };
    if (v.center) return { center: L.latLng(v.center[0], v.center[1]), zoom: v.zoom };
    let b = null;
    if (v.fit && FIT[v.fit]) b = FIT[v.fit];
    else if (v.bounds) b = L.latLngBounds(v.bounds);
    if (!b) return { center: map.getCenter(), zoom: map.getZoom() };
    const sz = map.getSize(), side = Math.max(60, sz.x * 0.08);
    const cz = map._getBoundsCenterZoom(b.pad(v.pad != null ? v.pad : 0.08), { maxZoom: v.maxZoom || 16, paddingTopLeft: [side, 120], paddingBottomRight: [side, 170] });
    return { center: cz.center, zoom: cz.zoom };
  }
  let viewCache = {};
  function sceneViews(i) {
    if (viewCache[i]) return viewCache[i];
    const sc = S[i];
    return viewCache[i] = { a: resolveView(sc.view, sc), b: sc.view_to ? resolveView(sc.view_to, sc) : null };
  }
  const moveOf = i => Math.min(S[i].move != null ? S[i].move : MOVE, (S[i].until - S[i].t) * 0.45);
  function routeProgress(i, t) {
    const sc = S[i], r = sc.route; if (!r) return null;
    const t0 = r.t0 != null ? r.t0 : sc.t + (i > 0 ? moveOf(i) : 0), t1 = r.t1 != null ? r.t1 : sc.until;
    const q = t1 > t0 ? clamp01((t - t0) / (t1 - t0)) : 1;
    const f = r.from_frac + (r.to_frac - r.from_frac) * (r.linear ? q : ease(q));
    return { leg: r.leg, f };
  }
  function markerAt(i, t) {
    const sc = S[i], m = sc.marker; if (!m) return null;
    if (m.at) return Array.isArray(m.at) ? L.latLng(m.at[0], m.at[1]) : D.pts[m.at] || null;
    if (m.along && routes[m.along.leg]) { // the marker travels a route without drawing it (a letter coming home)
      const t0 = sc.t + (i > 0 ? moveOf(i) : 0), q = clamp01((t - t0) / Math.max(1, sc.until - t0));
      return pointAt(routes[m.along.leg].path, m.along.from + (m.along.to - m.along.from) * ease(q));
    }
    const rp = routeProgress(i, t); if (rp && routes[rp.leg]) return pointAt(routes[rp.leg].path, rp.f);
    return null;
  }
  // the camera inside scene i (no transition)
  function inScene(i, t) {
    const v = sceneViews(i), sc = S[i];
    if (v.a.follow) { const at = markerAt(i, t) || map.getCenter(); return { center: at, zoom: v.a.zoom }; }
    if (v.b) { const t0 = sc.t + (i > 0 ? moveOf(i) : 0); return drift(v.a, v.b)(clamp01((t - t0) / Math.max(1, sc.until - t0))); }
    return v.a;
  }
  const flyCache = {};
  function viewAt(t) {
    const i = sceneIndex(t), sc = S[i];
    const m = moveOf(i), tt = t - sc.t;
    if (i === 0 || tt >= m) return inScene(i, t);
    const a = inScene(i - 1, sc.t), b = inScene(i, sc.t + m);
    const key = i + "|" + a.center.lat.toFixed(5) + a.center.lng.toFixed(5) + a.zoom.toFixed(3) + "|" + b.center.lat.toFixed(5) + b.center.lng.toFixed(5) + b.zoom.toFixed(3);
    const f = flyCache[key] || (flyCache[key] = flyPath(a, b));
    return f(ease(tt / m));
  }
  // ---------- the traveller's spot when a picture shows: the corridor between the words and the picture ----------
  // The caption card sits top left and the picture on the right. With both on screen, the marker is aimed at the
  // middle of the corridor between them: x halfway from the caption's right edge to the picture's left edge, y the
  // middle of the screen, kept AIM_PAD clear of the edges and the subtitle band. The camera carries the offset, so a
  // follow scene still holds one zoom (the shift is centre-only) and a centred scene keeps its zoom. A corridor under
  // CORRIDOR px, or a scene framed on bounds (several places at once), leaves the camera alone; the overlay placement
  // then keeps the picture off the marker as before.
  const AIM_PAD = 60, CORRIDOR = 160;
  function aimOf(i) {
    const sc = S[i]; if (!sc || !sc.image || !sc.marker || sc.marker.along) return null;
    if (!sc.marker.at && !sceneViews(i).a.follow) return null;   // a marker riding across a fixed view stays put
    if (sc.view && (sc.view.fit || sc.view.bounds)) return null;   // a framed view holds several places; shifting it would crop them
    const W = window.innerWidth, H = window.innerHeight, bar = $("bar").getBoundingClientRect().top, m = 18;
    const narrow = W <= 760, figW = narrow ? 0.46 * W : Math.min(400, 0.33 * W), figL = W - figW - m;
    const capR = sc.caption || sc.date ? m + (narrow ? 0.6 * W : Math.min(380, 0.4 * W)) : 0;
    if (figL - capR < CORRIDOR) return null;
    const subTop = bar - 14 - 90;                                  // room for two lines of subtitles over the bar
    const y = Math.max(AIM_PAD, Math.min(subTop - AIM_PAD, H / 2));
    return L.point((capR + figL) / 2, y);
  }
  // the pixel shift that puts scene i's marker on its aim, for that scene's own view at time t
  function offOf(i, t) {
    const a = aimOf(i); if (!a) return null;
    const at = markerAt(i, t); if (!at) return null;
    const v = inScene(i, t), half = map.getSize().divideBy(2);
    return a.subtract(map.project(at, v.zoom).subtract(map.project(v.center, v.zoom)).add(half));
  }
  // the camera at time t with the aim applied; across a scene change the shift eases with the move
  function cameraAt(t) {
    const v = viewAt(t), i = sceneIndex(t), sc = S[i], m = moveOf(i), tt = t - sc.t;
    let off = offOf(i, Math.max(t, sc.t + (i > 0 ? Math.min(m, tt) : 0)));
    if (i > 0 && tt < m) {
      const a = offOf(i - 1, sc.t) || L.point(0, 0), b = off || L.point(0, 0), f = ease(tt / m);
      off = L.point(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
    }
    if (!off || (Math.abs(off.x) < 0.01 && Math.abs(off.y) < 0.01)) return v;
    return { center: map.unproject(map.project(v.center, v.zoom).subtract(off), v.zoom), zoom: v.zoom };
  }
  function sceneIndex(t) { let i = 0; for (let k = 0; k < S.length; k++) if (t >= S[k].t) i = k; return i; }
  const asList = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
  function baseMix(i, t) {
    const want = new Map(), f = i > 0 ? clamp01((t - S[i].t) / 1.4) : 1;
    const prev = i > 0 ? asList(S[i - 1].base) : [], cur = asList(S[i].base), next = i + 1 < S.length ? asList(S[i + 1].base) : [];
    for (const k of next) want.set(k, 0);                     // preloaded, invisible
    for (const k of prev) if (!cur.includes(k)) want.set(k, 1 - f);
    for (const k of cur) want.set(k, prev.includes(k) ? 1 : f);
    // stack order: what is leaving or still to come underneath, the current scene's set on top in its own order
    const res = new Map();
    for (const k of [...prev, ...next]) if (!cur.includes(k) && want.has(k)) res.set(k, want.get(k));
    for (const k of cur) res.set(k, want.get(k));
    return res;
  }

  // ---------- overlays: picture, caption, ribbon, subtitles, placed in the free space around the marker ----------
  const fig = $("art"), figImg = $("art-img"), figCap = $("art-cap"), cap = $("caption"), rib = $("ribbon"), sub = $("subs");
  let figBeat = null, figSlot = -1;
  function overlap(a, b) { return Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)); }
  const box = (l, t, w, h) => ({ l, t, r: l + w, b: t + h });
  const grow = (r, p) => ({ l: r.l - p, t: r.t - p, r: r.r + p, b: r.b + p });
  const rectOf = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  let keepOut = [];
  function placeEl(el, slots, avoid) { // slots: [[left, top]] in px; picks the first that clears every avoid rect
    const w = el.offsetWidth, h = el.offsetHeight;
    let best = null, bestCost = Infinity, bi = -1;
    slots.forEach(([l, t], i) => {
      const r = box(l, t, w, h); let cost = 0;
      for (const a of avoid) cost += overlap(r, a.r) * a.w;
      cost += i * 0.01; if (cost < bestCost) { bestCost = cost; best = [l, t]; bi = i; }
    });
    if (best) { el.style.left = best[0] + "px"; el.style.top = best[1] + "px"; }
    return { slot: bi, rect: best ? box(best[0], best[1], w, h) : null, clear: bestCost < 1 };
  }
  function layoutOverlays(markerPt, focusPt) {
    const W = window.innerWidth, H = window.innerHeight, bar = $("bar").getBoundingClientRect().top;
    const avoid = [];
    if (markerPt) avoid.push({ r: grow(box(markerPt.x - MARKER_PX / 2, markerPt.y - MARKER_PX / 2, MARKER_PX, MARKER_PX), 18), w: 1000 });
    if (focusPt) avoid.push({ r: grow(box(focusPt.x, focusPt.y, 0, 0), 70), w: 30 });
    avoid.push({ r: box(0, bar, W, H - bar), w: 1000 });
    const out = { };
    const m = 18;
    if (sub.classList.contains("on")) {
      const w = sub.offsetWidth, h = sub.offsetHeight;
      out.sub = placeEl(sub, [[(W - w) / 2, bar - h - 14], [(W - w) / 2, 78]], avoid); if (out.sub.rect) avoid.push({ r: out.sub.rect, w: 400 });
    }
    if (cap.classList.contains("on")) {
      const w = cap.offsetWidth;
      out.cap = placeEl(cap, [[m, m], [W - w - m, m], [m, bar - cap.offsetHeight - 90]], avoid); if (out.cap.rect) avoid.push({ r: out.cap.rect, w: 400 });
    }
    if (rib.classList.contains("on")) {
      const w = rib.offsetWidth, h = rib.offsetHeight;
      out.rib = placeEl(rib, [[(W - w) / 2, bar - h - 80], [(W - w) / 2, m + 70], [W - w - m, bar - h - 80], [m, bar - h - 80]], avoid); if (out.rib.rect) avoid.push({ r: out.rib.rect, w: 400 });
    }
    if (fig.classList.contains("on")) {
      const w = fig.offsetWidth, h = fig.offsetHeight;
      const slots = [[W - w - m, m + 60], [m, m + 90], [W - w - m, bar - h - m], [m, bar - h - m], [W - w - m, (bar - h) / 2], [m, (bar - h) / 2]];
      // keep the slot it has while it is still clear (no hopping), else take the best free one
      if (figSlot >= 0) { const [l, t] = slots[figSlot], r = box(l, t, w, h); if (avoid.every(a => overlap(r, a.r) * a.w < 1)) { fig.style.left = l + "px"; fig.style.top = t + "px"; out.fig = { slot: figSlot, rect: r, clear: true }; return out; } }
      out.fig = placeEl(fig, slots, avoid); figSlot = out.fig.slot;
      fig.classList.toggle("squeezed", !out.fig.clear);
    }
    return out;
  }
  function setArt(beat) {
    const m = beat && MANI[beat];
    if (!m) { if (figBeat) { fig.classList.remove("on"); figBeat = null; figSlot = -1; } return; }
    if (beat === figBeat) return;
    figBeat = beat; figSlot = -1;
    figImg.src = m.file_asis || m.file; figImg.alt = m.what_it_shows || m.title || "";
    const t = m.short_title || String(m.title || "").replace(/\s*\(.*?\)\s*/g, " ").trim();
    figCap.innerHTML = `<b>${esc(t.length > 60 ? t.slice(0, 58).replace(/\s+\S*$/, "") + "…" : t)}</b>${m.artist ? `<br>${esc(String(m.artist).slice(0, 60))}` : ""}${m.date ? `, ${esc(m.date)}` : ""}`;
    fig.classList.add("on");
  }
  let capSig = "";
  function setCaption(text, date) {
    const sig = (text || "") + "|" + (date || ""); if (sig === capSig) return; capSig = sig;
    cap.innerHTML = (date ? `<div class="date">${esc(date)}</div>` : "") + (text ? `<div class="what">${esc(text)}</div>` : "");
    cap.classList.toggle("on", !!(text || date));
  }
  let ribSig = "";
  function setRibbon(g) {
    const sig = g == null ? "" : String(g); if (sig === ribSig) return; ribSig = sig;
    const x = g != null && GEN[+g];
    rib.innerHTML = x ? `<span class="gen">Generation ${+g}</span><span class="name">${esc(x.name)}</span><span class="yrs">${esc(x.years)}</span>` : "";
    rib.classList.toggle("on", !!x);
  }
  let subOn = localStorage.getItem("ll-listen-subs") !== "0", subSig = "";
  function setSub(t) {
    let c = null;
    if (subOn) for (const x of CUES) { if (x.kind === "line" && t >= x.t_start - 0.15 && t <= x.t_end + 0.4) { c = x; } if (x.t_start > t + 1) break; }
    // a long line shows a sentence or two at a time, timed by its share of the characters
    let text = c ? c.text : "", part = 0;
    if (c && text.length > 150) {
      const sents = text.match(/[^.!?]+[.!?]+["”)]?\s*|[^.!?]+$/g) || [text], chunks = [];
      let cur = ""; for (const x of sents) { if (cur && (cur + x).length > 150) { chunks.push(cur.trim()); cur = x; } else cur += x; } if (cur.trim()) chunks.push(cur.trim());
      const total = chunks.reduce((n, x) => n + x.length, 0), f = clamp01((t - c.t_start) / Math.max(0.1, c.t_end - c.t_start)) * total;
      let acc = 0; for (let k = 0; k < chunks.length; k++) { acc += chunks[k].length; if (f <= acc || k === chunks.length - 1) { part = k; text = chunks[k]; break; } }
    }
    const sig = c ? c.cue_id + ":" + part : ""; if (sig === subSig) return; subSig = sig;
    sub.innerHTML = c ? `${c.speaker !== "NARRATOR" ? `<span class="who">${esc(c.speaker === "FRENCH" ? "En français" : c.speaker.toLowerCase().replace(/\b\w/g, s => s.toUpperCase()))}</span> ` : ""}${esc(text)}` : "";
    sub.classList.toggle("on", !!c);
  }

  // ---------- weather beyond the seasons: hail and fire haze ----------
  const fx = $("fx"), fctx = fx.getContext("2d"); let fxKind = "", fxAmt = 0, stones = [];
  function sizeFx() { const d = window.devicePixelRatio || 1; fx.width = innerWidth * d; fx.height = innerHeight * d; fctx.setTransform(d, 0, 0, d, 0, 0); }
  function drawFx(kind, amt, now) {
    fx.style.opacity = String(kind === "haze" ? amt : 1);
    document.body.classList.toggle("haze", kind === "haze" && amt > 0);
    $("haze").style.opacity = kind === "haze" ? String(amt) : "0";
    fctx.clearRect(0, 0, innerWidth, innerHeight);
    if (kind !== "hail" || amt <= 0 || RM) return;
    const n = Math.round(260 * amt);
    while (stones.length < n) stones.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, v: 900 + Math.random() * 700, r: 1.2 + Math.random() * 2.2 });
    stones.length = n;
    const dt = Math.min(0.05, (now - (drawFx.last || now)) / 1000); drawFx.last = now;
    fctx.fillStyle = "rgba(240,246,255,.92)"; fctx.strokeStyle = "rgba(220,232,250,.5)"; fctx.lineWidth = 1;
    for (const s of stones) {
      s.y += s.v * dt; s.x += s.v * dt * 0.12; if (s.y > innerHeight) { s.y = -10; s.x = Math.random() * innerWidth; }
      fctx.beginPath(); fctx.moveTo(s.x - s.v * .012, s.y - s.v * .03); fctx.lineTo(s.x, s.y); fctx.stroke();
      fctx.beginPath(); fctx.arc(s.x, s.y, s.r, 0, 6.283); fctx.fill();
    }
  }

  // the trees of the Lauzon shore, which grow over the generations: a seeded scatter south of the river (from story.js)
  const LZ_TREES = (() => {
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, out = [];
    const river = lng => lng < -71.41 ? 46.70 + (lng + 71.41) * 0.17 : lng < -71.13 ? 46.70 + (lng + 71.41) * 0.43 : 46.82 + (lng + 71.13) * 0.1;
    while (out.length < 60) { const lng = -71.95 + rnd() * 0.85, lat = river(lng) - 0.03 - rnd() * 0.2; out.push([lat, lng]); }
    return out;
  })();
  let treeSig = "";

  // ---------- render: the whole state at audio time t ----------
  let lastSceneIdx = -1;
  const dbg = { frames: 0 };
  function render(t, now) {
    if (!S.length) return;
    const i = sceneIndex(t), sc = S[i];
    if (i !== lastSceneIdx) { lastSceneIdx = i; document.body.dataset.scene = sc.id || String(i); }
    // bases
    setBases(baseMix(i, t));
    // routes: earlier legs of the group in full, this leg to its fraction, others hidden
    const rp = routeProgress(i, t), drawn = new Set(asList(sc.drawn));
    const showing = new Set();
    if (rp) {
      showing.add(String(rp.leg)); drawRoute(rp.leg, rp.f, sc.route.todo !== false);
      const grp = ROUTE_GROUPS.find(g => g.map(String).includes(String(rp.leg)));
      if (grp && sc.route.history !== false) for (const k of grp) { if (String(k) === String(rp.leg)) break; drawn.add(k); }
    }
    for (const k of drawn) { if (showing.has(String(k))) continue; showing.add(String(k)); drawRoute(k, 1, false); }
    for (const k in routeLayers) if (!showing.has(String(k))) hideRoute(k);
    // marker, pins, lake
    const at = markerAt(i, t);
    setMarker(at, (sc.marker && sc.marker.mode) || "star");
    setPins(sc.pins);
    setLake(sc.lake || null);
    // camera
    const v = cameraAt(t);
    const sig = v.center.lat.toFixed(7) + v.center.lng.toFixed(7) + v.zoom.toFixed(4);
    if (sig !== dbg.lastSig) { dbg.lastSig = sig; applyView(v); }
    // seasons: the real season of the story date; strength = the scene's emphasis, ramped at its edges
    if (SEA) {
      const s = sc.season;
      let time = null;
      if (Array.isArray(s)) time = s[0] + (s[1] - s[0]) * clamp01((t - sc.t) / Math.max(1, sc.until - sc.t));
      else if (typeof s === "number") time = s;
      const em = sc.emphasis != null ? sc.emphasis : 0.3;
      const edge = Math.min(clamp01((t - sc.t) / 1.5), clamp01((sc.until - t) / 1.5));
      const prevEm = i > 0 && S[i - 1].season != null ? (S[i - 1].emphasis != null ? S[i - 1].emphasis : 0.3) : 0;
      const nextEm = i + 1 < S.length && S[i + 1].season != null ? (S[i + 1].emphasis != null ? S[i + 1].emphasis : 0.3) : 0;
      let k = time == null ? 0 : em;
      if (time != null) { if (t - sc.t < 1.5) k = prevEm + (em - prevEm) * clamp01((t - sc.t) / 1.5); else if (sc.until - t < 1.5) k = em + (nextEm - em) * (1 - clamp01((sc.until - t) / 1.5)); }
      if (time != null) SEA.setTime(time);
      const tr = sc.trees ? JSON.stringify(sc.trees) : "";
      if (tr !== treeSig) { treeSig = tr; SEA.setTrees(sc.trees ? LZ_TREES : null, sc.trees || undefined); }
      SEA.setIntensity(RM ? Math.min(k, .4) : k);
    }
    // fx
    const fk = sc.fx || "", famt = fk ? Math.min(clamp01((t - sc.t) / 1.2), clamp01((sc.until - t) / 1.2)) * (sc.fx_amount || 1) : 0;
    drawFx(fk, famt, now || performance.now());
    // overlays
    setArt(sc.image || null);
    setCaption(sc.caption, sc.date);
    setRibbon(sc.ribbon);
    setSub(t);
    const mp = at ? map.latLngToContainerPoint(at) : null;
    const fp = map.latLngToContainerPoint(sc.focus ? L.latLng(sc.focus[0], sc.focus[1]) : (at || v.center));
    dbg.aim = aimOf(i); dbg.layout = layoutOverlays(mp, fp); dbg.marker = mp; dbg.scene = i; dbg.t = t; dbg.frames++;
    // the clock
    $("now").textContent = fmtT(t); if (!scrubbing) $("scrub").value = String(t);
  }

  // ---------- preload: the tiles the coming scenes will need ----------
  const fetched = new Set();
  function tilesFor(layer, v) {
    const o = layer.options || {}, size = map.getSize();
    let z = Math.round(v.zoom); z = Math.max(o.minZoom || 0, Math.min(o.maxNativeZoom != null ? o.maxNativeZoom : (o.maxZoom || 18), z));
    const c = map.project(v.center, z), half = size.divideBy(2).multiplyBy(Math.pow(2, z - v.zoom) * 1.15);
    const x0 = Math.floor((c.x - half.x) / 256), x1 = Math.floor((c.x + half.x) / 256), y0 = Math.floor((c.y - half.y) / 256), y1 = Math.floor((c.y + half.y) / 256);
    const out = [], n = Math.pow(2, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= n || out.length > 80) continue;
      const tt = { x: ((x % n) + n) % n, y, z };
      if (layer instanceof LL.Indexed && !LL.hasTile(o.indexKey, tt)) continue;
      if (o.bounds) { const b = L.latLngBounds(o.bounds), nw = map.unproject([x * 256, y * 256], z), se = map.unproject([(x + 1) * 256, (y + 1) * 256], z); if (!b.intersects(L.latLngBounds(nw, se))) continue; }
      out.push(layer instanceof LL.Export ? layer.getTileUrl(tt) : L.Util.template(layer._url, L.extend({ s: (o.subdomains || "abc")[0] }, o, tt)));
    }
    return out;
  }
  let lastPre = -99;
  function preload(t, force) {
    if (!force && Math.abs(t - lastPre) < 1.5) return; lastPre = t;
    for (let dt = 0; dt <= 16; dt += 2) {
      const tt = Math.min(DUR || 1e9, t + dt), i = sceneIndex(tt), v = cameraAt(tt);
      for (const k of asList(S[i].base)) { const l = baseLayer(k); if (!l) continue; for (const u of tilesFor(l, v)) if (!fetched.has(u)) { fetched.add(u); const im = new Image(); im.decoding = "async"; im.src = u; } }
    }
  }

  // ---------- the player ----------
  const audio = $("audio");
  let scrubbing = false, raf = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const t = audio.currentTime || 0;
    render(t, now);
    if (!audio.paused) preload(t);
  }
  function srcFor(n) { return [`listen/audio/ep${pad2(n)}.mp3`, `../radio/season1/ep${pad2(n)}-chatterbox.mp3`]; }
  async function loadEpisode(n, autoplay) {
    EP = Math.max(1, Math.min(EPS, n | 0 || 1));
    const u = new URL(location.href); u.searchParams.set("ep", EP); history.replaceState(null, "", u);
    document.title = `Listen: S1E${pad2(EP)} ${TITLES[EP - 1]} | Lambert Lake`;
    $("ep-title").innerHTML = `<span class="no">Season One, Episode ${EP}</span>${esc(TITLES[EP - 1])}`;
    $("start-cover").src = `listen/covers/s1e${pad2(EP)}.jpg`;
    $("start-title").innerHTML = `<span class="no">Season One · Episode ${EP}</span>${esc(TITLES[EP - 1])}`;
    document.querySelectorAll("#eps .ep").forEach(b => b.classList.toggle("cur", +b.dataset.ep === EP));
    const [cues, scenes] = await Promise.all([fetch(`listen/cues/ep${pad2(EP)}.json`).then(r => r.json()), fetch(`listen/scenes/ep${pad2(EP)}.json`).then(r => r.json())]);
    CUES = cues;
    const list = Array.isArray(scenes) ? scenes : scenes.scenes;
    S = list.map((s, k) => Object.assign({}, s, { until: s.until != null ? s.until : (k + 1 < list.length ? list[k + 1].t : 1e6) }));
    viewCache = {}; lastSceneIdx = -1; figSlot = -1;
    // audio: the copied HQ file first, the repo's render when the whole repo is served
    audio.innerHTML = srcFor(EP).map(s => `<source src="${s}" type="audio/mpeg">`).join("");
    audio.load();
    await new Promise(res => { if (audio.readyState >= 1) return res(); audio.addEventListener("loadedmetadata", res, { once: true }); audio.addEventListener("error", res, { once: true }); setTimeout(res, 8000); });
    DUR = audio.duration || (CUES.length ? CUES[CUES.length - 1].t_end || 0 : 0);
    S[S.length - 1].until = Math.max(S[S.length - 1].until === 1e6 ? DUR : S[S.length - 1].until, S[S.length - 1].t + 1);
    $("scrub").max = String(DUR); $("dur").textContent = fmtT(DUR);
    render(0); preload(0, true);
    $("next").classList.remove("on");
    if (autoplay) play(); else { document.body.classList.add("idle"); $("start").classList.add("on"); }
  }
  function play() {
    $("start").classList.remove("on"); document.body.classList.remove("idle");
    const p = audio.play(); if (p && p.catch) p.catch(() => { $("start").classList.add("on"); document.body.classList.add("idle"); });
  }
  function toggle() { if (audio.paused) play(); else audio.pause(); }
  audio.addEventListener("play", () => document.body.classList.add("playing"));
  audio.addEventListener("pause", () => document.body.classList.remove("playing"));
  let nextTimer = 0;
  audio.addEventListener("ended", () => {
    if (EP >= EPS) return;
    $("next-title").textContent = `Episode ${EP + 1}: ${TITLES[EP]}`; $("next-cover").src = `listen/covers/s1e${pad2(EP + 1)}.jpg`;
    $("next").classList.add("on");
    let n = 10; $("next-count").textContent = n;
    clearInterval(nextTimer); nextTimer = setInterval(() => { n--; $("next-count").textContent = n; if (n <= 0) { clearInterval(nextTimer); loadEpisode(EP + 1, true); } }, 1000);
  });
  $("next-go").onclick = () => { clearInterval(nextTimer); loadEpisode(EP + 1, true); };
  $("next-stay").onclick = () => { clearInterval(nextTimer); $("next").classList.remove("on"); };
  $("bigplay").onclick = play;
  $("pp").onclick = toggle;
  const scrub = $("scrub");
  scrub.addEventListener("input", () => { scrubbing = true; audio.currentTime = +scrub.value; render(+scrub.value); });
  scrub.addEventListener("change", () => { scrubbing = false; preload(+scrub.value, true); });
  $("cc").onclick = () => { subOn = !subOn; localStorage.setItem("ll-listen-subs", subOn ? "1" : "0"); $("cc").classList.toggle("on", subOn); subSig = "?"; };
  $("cc").classList.toggle("on", subOn);
  $("eps-btn").onclick = () => $("eps").classList.toggle("on");
  window.addEventListener("keydown", e => {
    if (e.code === "Space") { e.preventDefault(); toggle(); }
    else if (e.code === "ArrowRight") audio.currentTime = Math.min(DUR, audio.currentTime + 10);
    else if (e.code === "ArrowLeft") audio.currentTime = Math.max(0, audio.currentTime - 10);
    else if (e.key === "c") $("cc").click();
  });
  window.addEventListener("resize", () => { viewCache = {}; for (const k in flyCache) delete flyCache[k]; sizeFx(); });

  (async function boot() {
    $("eps").innerHTML = TITLES.map((t, k) => `<button class="ep" data-ep="${k + 1}"><img src="listen/covers/s1e${pad2(k + 1)}.jpg" alt=""><span><b>Episode ${k + 1}</b>${esc(t)}</span></button>`).join("");
    $("eps").querySelectorAll(".ep").forEach(b => b.onclick = () => { $("eps").classList.remove("on"); audio.pause(); loadEpisode(+b.dataset.ep, false); });
    sizeFx();
    await loadAll();
    try { LL.yearsList = await (await fetch("data/years.json")).json(); } catch (e) { LL.yearsList = []; }
    underlay();
    const q = new URLSearchParams(location.search);
    await loadEpisode(+q.get("ep") || 1, false);
    if (q.has("t")) { const t = +q.get("t"); audio.currentTime = t; render(t); }
    raf = requestAnimationFrame(loop);
    document.body.classList.add("ready");
  })();

  // for tests: jump the whole state to a time, and read back where things are
  LL.listen = {
    seek(t) { audio.currentTime = t; render(t); return dbg; },
    state() {
      const r = el => el.classList.contains("on") ? rectOf(el) : null;
      return { t: audio.currentTime, scene: dbg.scene, sceneId: S[dbg.scene] && S[dbg.scene].id, marker: dbg.marker, zoom: map.getZoom(), center: map.getCenter(),
        rects: { art: r(fig), caption: r(cap), ribbon: r(rib), subs: r(sub) }, image: figBeat, caption: cap.textContent, sub: sub.textContent,
        season: SEA ? SEA.state() : null, ready: document.body.classList.contains("ready") };
    },
    scenes: () => S, cues: () => CUES, load: loadEpisode
  };
})();
