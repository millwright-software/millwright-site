/* Lambert Lake for kids. One fixed Leaflet map under a big painted "plate"; the scroll drives the camera, the
   pictures, the year medallion and the journey. Data, tiles, pictures and Leaflet are the grown-up page's own
   (this page sets <base href="../">). The camera keeps the grown-up page's rules:
   - every move is _moveStart/_move/_moveEnd, never an unanimated setView (a view reset throws away the tiles);
   - after a move that only changes the centre, fire 'zoom' so the tile layers re-place their tiles;
   - on a travel leg the zoom only goes one way (eased in, then held);
   - the traveller sits exactly at the centre of the part of the screen the map has to itself. */
window.LL = window.LL || {};

/* ---- easy to change: the Ramsey County park at 2394 Edgerton St, Little Canada (2.48 of its 4.15 acres lie on
   Abraham's 1849 lots), which the family calls Abraham's Park, and its playground pin.
   PLAYGROUND: [lat, lon], or null to put the pin in the middle of Abraham's 1849 farm lots. ---- */
const PARK_NAME = "Abraham's Park"; // the family's own name for the Ramsey County park at 2394 Edgerton St
const PLAYGROUND = [45.01333, -93.07546]; // OSM playground, about 20 m south of the 1849 lot line

(function () {
  const RM = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = id => document.getElementById(id);
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const smooth = (p, a, b) => { const t = clamp01((p - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, f) => L.latLng(a.lat + (b.lat - a.lat) * f, a.lng + (b.lng - a.lng) * f);
  const ll = c => L.latLng(c[1], c[0]);
  const DAY = 86400000;
  const fmtN = n => n.toLocaleString("en-US");
  const asList = v => (v == null ? [] : Array.isArray(v) ? v : [v]);

  document.querySelectorAll(".park-name").forEach(e => e.textContent = PARK_NAME);

  // ---------- seasons: web/js/seasons.js when it exists, else a soft tint of our own ----------
  let SEAS = null;
  (function loadSeasons() {
    const s = document.createElement("script");
    s.src = "js/seasons.js"; s.async = true;
    s.onload = () => { if (window.LLkids && window.LLkids.map) attachSeasons(window.LLkids.map); };
    s.onerror = () => {};
    document.head.appendChild(s);
  })();
  function attachSeasons(map) {
    if (SEAS || !window.Seasons || typeof window.Seasons.attach !== "function") return;
    try { const h = window.Seasons.attach(map, { reducedMotion: RM }); SEAS = h && typeof h.setTime === "function" ? h : window.Seasons; SEAS.setIntensity && SEAS.setIntensity(0); }
    catch (e) { SEAS = null; console.warn("seasons overlay not attached", e); }
  }
  const seasonOf = y => { const f = ((y % 1) + 1) % 1; return f < 0.2 || f >= 0.92 ? "winter" : f < 0.42 ? "spring" : f < 0.7 ? "summer" : "fall"; };
  const TINT = { winter: "#ffffff", spring: "#b5d98f", summer: "#6e9b46", fall: "#e07b2a" };
  let seasonNow = "", intensityNow = -1;
  function seasons(yearFloat, intensity) {
    intensity = RM ? 0 : clamp01(intensity);
    if (SEAS) { try { SEAS.setTime(yearFloat); SEAS.setIntensity(intensity); } catch (e) { /* the overlay is optional */ } }
    else {
      const t = $("tint"), s = seasonOf(yearFloat);
      if (s !== seasonNow) { t.style.backgroundColor = TINT[s]; }
      if (intensity !== intensityNow) t.style.opacity = String(0.6 * intensity);
    }
    seasonNow = seasonOf(yearFloat); intensityNow = intensity;
  }

  // ---------- the trees in the medallion: they grow as the years go by and change with the seasons ----------
  const treeSvg = $("trees");
  const TREES = [[14, "pine", 0.9], [40, "round", 1], [70, "pine", 1.15], [100, "round", 0.85], [128, "pine", 1]];
  treeSvg.innerHTML = TREES.map(([x, kind], k) => kind === "pine"
    ? `<g data-k="${k}" transform="translate(${x} 38)"><rect x="-1.6" y="-6" width="3.2" height="6" fill="#6a4426"/><path class="crown" d="M0-34L-10-6H10Z"/><path class="snow" d="M0-34L-5-20H5Z" fill="#fff"/></g>`
    : `<g data-k="${k}" transform="translate(${x} 38)"><rect x="-1.8" y="-12" width="3.6" height="12" fill="#6a4426"/><circle class="crown" cy="-20" r="11"/><path class="bare" d="M0-12V-26M0-18L-7-25M0-20L6-27" stroke="#6a4426" stroke-width="1.6" fill="none"/></g>`).join("");
  const treeEls = Array.from(treeSvg.querySelectorAll("g"));
  function trees(growth, yearFloat, on) {
    treeSvg.classList.toggle("off", !on);
    if (!on) return;
    let s = seasonOf(yearFloat);
    if (SEAS && SEAS.state) { try { s = SEAS.state().season || s; } catch (e) { /* keep ours */ } }
    treeEls.forEach((g, k) => {
      const [x, kind, big] = TREES[k], sc = (0.25 + 0.75 * clamp01(growth * 1.3 - k * 0.06)) * big;
      g.setAttribute("transform", `translate(${x} 38) scale(${sc.toFixed(3)})`);
      const crown = g.querySelector(".crown");
      if (kind === "pine") { crown.setAttribute("fill", s === "winter" ? "#4d7a5a" : "#3f7a46"); g.querySelector(".snow").style.display = s === "winter" ? "" : "none"; }
      else { crown.setAttribute("fill", s === "fall" ? (k % 2 ? "#e07b2a" : "#c9502c") : s === "spring" ? "#9ccc6c" : "#6e9b46"); crown.style.display = s === "winter" ? "none" : ""; g.querySelector(".bare").style.display = s === "winter" ? "" : "none"; }
    });
  }

  // ---------- the year medallion ----------
  let medalKey = "";
  function medal(year, sub, pop) {
    const key = year + "|" + sub; if (key === medalKey) return; medalKey = key;
    const m = $("medal");
    m.classList.toggle("off", !year);
    const y = String(year || "");
    $("m-year").innerHTML = /^about /.test(y) ? `<small>about</small>${y.slice(6)}` : y === "today" ? "Today" : y;
    const s = $("m-sub"), had = s.textContent;
    s.textContent = sub || "";
    if (pop && sub && sub !== had && !RM) { s.classList.remove("pop"); void s.offsetWidth; s.classList.add("pop"); }
  }

  async function boot() {
    LL.tileIndex = await LL.loadData("tile-index.json");
    const get = n => LL.loadData(n);
    const [years, parcels, points, journey, places, basemaps, lake, itinerary, eustache, generations, descendants, drainage, manifest] = await Promise.all([
      get("years.json"), get("parcels.geojson"), get("points.geojson"), get("journey.geojson"), get("journey-places.geojson"), get("basemaps.json"),
      get("lake-1855.geojson"), get("itinerary.json"), get("eustache-route.geojson"), get("generations.json"), get("descendants.json"), get("drainage.geojson"),
      fetch("img/journey/manifest.json").then(r => r.ok ? r.json() : []).catch(() => [])
    ]);
    if (Array.isArray(basemaps)) LL.applyBasemapMeta(basemaps);
    await LL.probeBasemaps();
    build({ years: years || [], parcels, points, journey, places, lake, itinerary, eustache, generations, descendants, drainage, manifest: Array.isArray(manifest) ? manifest : [] });
  }

  function build(D) {
    const C = LL.CONFIG;
    const el = $("kmap");
    const map = L.map(el, {
      zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      boxZoom: false, keyboard: false, touchZoom: false, tap: false, zoomSnap: 0, zoomAnimation: false, fadeAnimation: !RM,
      markerZoomAnimation: false, inertia: false, worldCopyJump: false
    });
    map.createPane("base").style.zIndex = 200;
    map.createPane("period").style.zIndex = 220;
    map.createPane("hist").style.zIndex = 250;
    map.setView([45.06, -93.07], 14);
    window.LLkids = { map };
    attachSeasons(map);

    // ---------- geometry helpers ----------
    function pathOf(latlngs) {
      const cum = [0];
      for (let i = 1; i < latlngs.length; i++) cum.push(cum[i - 1] + map.distance(latlngs[i - 1], latlngs[i]));
      return { latlngs, cum, len: cum[cum.length - 1] };
    }
    function partial(path, p) {
      const { latlngs, cum, len } = path, target = p * len;
      if (p <= 0) return [];
      if (p >= 1) return latlngs;
      const out = [latlngs[0]];
      for (let i = 1; i < latlngs.length; i++) {
        if (cum[i] <= target) out.push(latlngs[i]);
        else { out.push(lerp(latlngs[i - 1], latlngs[i], (target - cum[i - 1]) / (cum[i] - cum[i - 1]))); break; }
      }
      return out;
    }
    const at = (path, f) => { const pts = partial(path, Math.max(1e-6, Math.min(1, f))); return pts[pts.length - 1]; };
    const fracNear = (path, p) => { let bi = 0, bd = Infinity; path.latlngs.forEach((q, i) => { const d = map.distance(q, p); if (d < bd) { bd = d; bi = i; } }); return path.cum[bi] / path.len; };
    const anchor = p => L.marker(p, { icon: L.divIcon({ className: "", iconSize: [0, 0] }), interactive: false, keyboard: false });
    const tip = (layer, text, cls, dir, off) => layer.bindTooltip(text, { permanent: true, direction: dir || "right", offset: off || [12, 0], className: "kl " + (cls || ""), interactive: false });
    const dot = (p, cls) => L.marker(p, { icon: L.divIcon({ className: "kdot " + (cls || ""), iconSize: [16, 16] }), interactive: false, keyboard: false });
    const base = { lineJoin: "round", lineCap: "round", interactive: false };
    const PAGE = "#fffdf7", INK = "#2d2b55", BARN = "#b8472e", LAKE = "#2e6f9e";

    // ---------- base maps and year layers (the neighbours' layers stay loaded at opacity 0) ----------
    const bases = {};
    function baseLayer(key) {
      if (key in bases) return bases[key];
      const b = C.basemaps[key];
      return bases[key] = LL.baseLayer(key, { pane: b && b.probe ? "period" : "base", opacity: 0 });
    }
    const yearsById = {}; D.years.forEach(e => yearsById[e.year] = e);
    const groups = {};
    function yearGroup(year) {
      if (groups[year]) return groups[year];
      const e = yearsById[year], parts = [];
      const live = LL.liveLayer(year, { pane: "hist", opacity: 0, attribution: "" });
      if (live) parts.push(live);
      if (e) parts.push(LL.tileLayer(C.tiles(year), Object.assign(C.tileOptions(e), { pane: "hist", opacity: 0, attribution: "" })));
      return groups[year] = { year, parts, on: false };
    }
    const liveBases = new Set(), liveYears = new Set();
    function layers(keepB, showB, keepY, showY) {
      for (const k of keepB) { const l = baseLayer(k); if (l && !liveBases.has(k)) { l.addTo(map); liveBases.add(k); } }
      for (const k of Array.from(liveBases)) if (!keepB.has(k)) { map.removeLayer(bases[k]); liveBases.delete(k); }
      let z = 1; for (const k of liveBases) { const l = bases[k]; if (l.setZIndex) l.setZIndex(showB.includes(k) ? 10 + showB.indexOf(k) : z++); l.setOpacity(showB.includes(k) ? 1 : 0); }
      for (const k in UNDER) if (UNDER[k] && k !== "physical") UNDER[k].setOpacity(showB.includes(k) ? 1 : 0);
      for (const y of keepY) { const g = yearGroup(y); if (!g.on) { g.parts.forEach(l => l.addTo(map)); g.on = true; } liveYears.add(y); }
      for (const y of Array.from(liveYears)) if (!keepY.has(y)) { const g = groups[y]; g.parts.forEach(l => map.removeLayer(l)); g.on = false; liveYears.delete(y); }
      for (const y of liveYears) { const i = showY.indexOf(y); groups[y].parts.forEach(l => { l.setOpacity(i < 0 ? 0 : 1); if (l.setZIndex) l.setZIndex(i < 0 ? 1 : 2 + i); }); }
    }
    // always loaded, low native zoom: a long jump of the camera shows a soft map while sharp tiles load, never bare paper
    const UNDER = {};
    (function underlay() {
      const mk = (key, nz, pane) => { const l = LL.baseLayer(key, { pane, opacity: 1, maxNativeZoom: nz, maxZoom: 11, keepBuffer: 8, attribution: "" }); if (l) { l.addTo(map); l.setZIndex(0); } return l; };
      UNDER.physical = mk("physical", 5, "base");
      UNDER.burr1839 = mk("burr1839", 5, "period");
      UNDER.nicollet1843 = mk("nicollet1843", 6, "period");
      for (const k in UNDER) if (UNDER[k] && k !== "physical") UNDER[k].setOpacity(0);
    })();

    // ---------- the lake, the island, the farm ----------
    const feats = (D.parcels && D.parcels.features) || [];
    const byGroup = g => feats.filter(f => f.properties.group === g);
    const islandLots = byGroup("abraham-island").map(f => f.geometry.coordinates[0].map(ll));
    const islandBounds = L.latLngBounds(islandLots.flat());
    function outerRing(rings) {
      if (rings.length !== 2) return rings.flat();
      const key = p => p.lat.toFixed(7) + "," + p.lng.toFixed(7);
      const clean = r => (key(r[0]) === key(r[r.length - 1]) ? r.slice(0, -1) : r);
      const [a, b] = rings.map(clean);
      const inB = new Set(b.map(key)), shared = a.filter(p => inB.has(key(p)));
      if (shared.length !== 2) return rings.flat();
      const walk = (r, from, to) => {
        const i = r.findIndex(p => key(p) === key(from));
        const fwd = []; for (let k = 0; k < r.length; k++) { const p = r[(i + k) % r.length]; fwd.push(p); if (k && key(p) === key(to)) break; }
        if (fwd.length > 2) return fwd;
        const back = []; for (let k = 0; k < r.length; k++) { const p = r[(i - k + r.length) % r.length]; back.push(p); if (k && key(p) === key(to)) break; }
        return back;
      };
      const [A, Bp] = shared;
      return walk(a, A, Bp).concat(walk(b, Bp, A).slice(1));
    }
    const ring = outerRing(islandLots); ring.push(ring[0]);
    const islandPath = pathOf(ring);
    const islandCenter = islandBounds.getCenter();
    const V = {};
    const islandHalo = L.polyline([], Object.assign({ color: PAGE, weight: 11, opacity: .9 }, base));
    const islandLine = L.polyline([], Object.assign({ color: BARN, weight: 5 }, base));
    const islandSet = pts => { islandHalo.setLatLngs(pts); islandLine.setLatLngs(pts); };
    V.island = L.featureGroup([islandHalo, islandLine]);
    V.islandFill = L.polygon(ring, { stroke: false, fillColor: "#e2a32b", fillOpacity: .45, interactive: false });
    V.islandLbl = tip(anchor(islandCenter), "the island", "", "center", [0, 0]);
    const lakeGeo = D.lake && (D.lake.features ? D.lake : { type: "FeatureCollection", features: [D.lake] });
    const LAKE_FILL = .5;
    const lakeMain = lakeGeo ? L.geoJSON(lakeGeo, { style: { color: LAKE, weight: 4, opacity: 1, fillColor: LAKE, fillOpacity: LAKE_FILL, interactive: false } }) : null;
    V.lake = lakeGeo ? L.featureGroup([L.geoJSON(lakeGeo, { style: { color: PAGE, weight: 10, opacity: .8, fill: false, interactive: false } }), lakeMain]) : L.layerGroup();
    const lakeWater = (o, line) => { if (lakeMain) lakeMain.setStyle({ fillOpacity: o, opacity: line == null ? 1 : line, dashArray: line != null && line < 1 ? "6 9" : null }); };
    const lakeBounds = lakeGeo ? V.lake.getBounds() : islandBounds.pad(1.2);
    const farmGeo = { type: "FeatureCollection", features: byGroup("abraham-gervais") };
    V.farm = L.geoJSON(farmGeo, { style: { color: BARN, weight: 4, fillColor: "#e2a32b", fillOpacity: .3, interactive: false } });
    const farmBounds = V.farm.getBounds();
    V.farmLbl = tip(anchor(farmBounds.getCenter()), "Abraham's farm", "", "center", [0, 0]);
    const pts = {}; ((D.points && D.points.features) || []).forEach(f => pts[f.properties.id || f.properties.kind] = ll(f.geometry.coordinates));
    const churchPt = pts.church || L.latLng(45.0210715, -93.0847900);
    V.church = tip(dot(churchPt), "the church", "", "right");
    const housePt = pts.house || L.latLng(45.0595622, -93.0891043);
    V.house = tip(dot(housePt, "home"), "Woodview Court", "", "top", [0, -12]);
    const playPt = PLAYGROUND ? L.latLng(PLAYGROUND[0], PLAYGROUND[1]) : farmBounds.getCenter();
    V.play = tip(dot(playPt, "play"), PARK_NAME, "", "right");
    V.lakeLbl = tip(anchor(L.latLng(lakeBounds.getNorth(), lakeBounds.getCenter().lng)), "Lambert Lake", "big", "top", [0, -6]);

    // the canals and ditches (data/drainage.geojson): each draws itself in its turn
    const drains = ((D.drainage && D.drainage.features) || []).filter(f => f.geometry && /LineString/.test(f.geometry.type)).map(f => {
      const g = f.geometry, lines = g.type === "MultiLineString" ? g.coordinates : [g.coordinates];
      const path = pathOf(lines.flat().map(ll));
      const halo = L.polyline([], Object.assign({ color: PAGE, weight: 10, opacity: .85 }, base));
      const line = L.polyline([], Object.assign({ color: "#7a4a26", weight: 5 }, base));
      return { id: f.properties.id, year: +f.properties.year, path, halo, line, group: L.layerGroup([halo, line]) };
    });
    V.drain = L.layerGroup(drains.map(d => d.group));
    const creek = drains.find(d => d.id === "lambert-creek-today");
    V.creek = creek ? L.layerGroup([L.polyline(creek.path.latlngs, Object.assign({ color: PAGE, weight: 11, opacity: .9 }, base)), L.polyline(creek.path.latlngs, Object.assign({ color: LAKE, weight: 6 }, base))]) : L.layerGroup();
    V.creekLbl = creek ? tip(anchor(at(creek.path, 0.5)), "Lambert Creek", "", "right") : L.layerGroup();
    function drainage(y0, y1, p) {
      const news = drains.filter(d => d.year > y0 && d.year <= y1);
      for (const d of drains) {
        const k = news.indexOf(d), n = news.length;
        const q = d.year <= y0 ? 1 : k < 0 ? 0 : RM ? 1 : smooth(p, 0.1 + 0.6 * k / n, 0.1 + 0.6 * (k + 1) / n);
        const pts = partial(d.path, q); d.line.setLatLngs(pts); d.halo.setLatLngs(pts);
      }
      lakeWater(LAKE_FILL + (0.04 - LAKE_FILL) * (RM ? 1 : smooth(p, 0.12, 0.8)));
    }

    // ---------- Eustache: the sea and the canoe route; Modeste's road to Oregon ----------
    const euFeat = leg => ((D.eustache && D.eustache.features) || []).find(f => f.properties.leg === leg);
    const euPts = (leg, fb) => { const f = euFeat(leg); return f ? f.geometry.coordinates.map(ll) : fb.map(c => L.latLng(c[0], c[1])); };
    const euSea = pathOf(euPts("sea", [[50.73, 1.61], [49.3, -12], [47.2, -45], [48.6, -62.5], [46.81, -71.21]]));
    const euHuron = pathOf(euPts("huron", [[46.81, -71.21], [45.5, -73.55], [46.3, -78.7], [46.0, -80.6], [44.73, -79.85]]));
    const routeLine = () => [L.polyline([], Object.assign({ color: PAGE, weight: 12, opacity: .9 }, base)), L.polyline([], Object.assign({ color: BARN, weight: 5, dashArray: "12 10" }, base))];
    V.euSea = L.layerGroup(routeLine()); V.euHuron = L.layerGroup(routeLine());
    const draw = (grp, path, p) => grp.getLayers().forEach(l => l.setLatLngs(partial(path, p)));
    V.lblFrance = tip(dot(L.latLng(50.73, 1.61)), "France", "big", "right");
    V.lblQuebec = tip(dot(L.latLng(46.81, -71.21)), "Quebec", "big", "right");
    V.lblHuron = tip(dot(L.latLng(44.73, -79.85)), "the mission", "", "left", [-12, 0]);
    V.lblFarm = tip(dot(L.latLng(46.80, -71.18)), "the farm", "big", "right");
    const oregonPts = [[46.81, -71.21], [45.5, -73.55], [46.3, -79.4], [48.4, -89.2], [49.6, -94.5], [49.89, -97.12], [52.1, -106.6], [53.5, -113.5], [52.6, -118.1], [49.0, -118.5], [46.2, -119.1], [45.62, -122.67]].map(c => L.latLng(c[0], c[1]));
    const oregonPath = pathOf(oregonPts);
    V.oregonLine = L.layerGroup(routeLine());
    V.oregon = L.layerGroup([tip(dot(L.latLng(46.81, -71.21)), "home", "", "right"), tip(dot(L.latLng(45.4, -122.7)), "Oregon", "big", "right")]);
    V.lblCloquet = tip(dot(L.latLng(46.7216, -92.4591)), "Cloquet", "big", "right");
    V.hotel = tip(dot(L.latLng(46.7222, -92.4612)), "the island hotel", "", "right");

    // ---------- the vehicles ----------
    const ICON = {
      boat: `<path d="M1.8 14.6h20.4l-3 4.4H4.8z"/><path d="M4.6 11.2h12.6v3.4H4.6z"/><path d="M14 4.6h2.4v6.6H14z"/><path d="M5.6 14.6a3.9 3.9 0 0 1 7.8 0z" fill="${PAGE}" stroke="currentColor" stroke-width="1.3"/><circle cx="18.2" cy="3.2" r="1.3"/><circle cx="20.6" cy="2.2" r=".9"/>`,
      stage: `<path d="M4.4 5.2h13.2v1.2H4.4z"/><path d="M4.2 6.4h13.6l1.6 8.4H2.6z"/><path d="M6.4 8.2h3.6v3H6.4zM11.8 8.2h3.6v3h-3.6z" fill="${PAGE}"/><circle cx="6.4" cy="18" r="2.9" fill="${PAGE}" stroke="currentColor" stroke-width="1.7"/><circle cx="16.8" cy="18" r="2.9" fill="${PAGE}" stroke="currentColor" stroke-width="1.7"/>`,
      rail: `<path d="M3.2 5.4h17.6v1.5H3.2z"/><path d="M4 6.9h16v8.6H4z"/><path d="M6 8.8h3v3H6zM10.5 8.8h3v3h-3zM15 8.8h3v3h-3z" fill="${PAGE}"/><circle cx="8" cy="17.4" r="2"/><circle cx="16" cy="17.4" r="2"/><path d="M1.5 20.2h21" stroke="currentColor" stroke-width="1.3"/>`,
      cart: `<circle cx="17" cy="14.2" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M17 8.6v11.2M11.4 14.2h11.2M13 10.2l8 8M21 10.2l-8 8" stroke="currentColor" stroke-width=".9"/><path d="M12.2 7.6h9.6v2.6h-9.6z"/><path d="M8.6 11.2l4-1.4" stroke="currentColor" stroke-width="1.3"/><path d="M1 10.6l1.5-1.6.9 1.1h4.6c1.4 0 2.2.9 2.2 2.2v1.6h-.8v3.6H8.2v-3.2H4.4v3.2H3.2v-3.4c-1-.3-1.7-1-1.8-1.9z"/>`,
      walk: `<circle cx="12.6" cy="3.6" r="2.1"/><path d="M12.4 7l-1.2 6.4-3 6.2M11.2 13.4l3.6 6M11.8 8.4l-3.6 3.4M12.4 8.6l3.6 2.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
      tent: `<path d="M2.4 19.4L12 4.4l9.6 15z"/><path d="M12 4.4V2.6" stroke="currentColor" stroke-width="1.2"/><path d="M9.6 19.4l2.4-6 2.4 6z" fill="${PAGE}"/>`,
      ship: `<path d="M2 15.2h20l-2.6 4.2H5.2z"/><path d="M11.4 2.4h1.3v12.8h-1.3z"/><path d="M12.9 3.6c3.4 1.4 5.8 4.4 6.4 9.6h-6.4z"/><path d="M11.2 4.4c-2.8 1.6-5 4.6-5.8 8.8h5.8z" opacity=".75"/><path d="M12.7 2.4l3 1-3 1z"/>`,
      canoe: `<path d="M1.2 13.4c3 2.6 6.8 3.8 10.8 3.8s7.8-1.2 10.8-3.8c-.4 2.4-1.2 3.6-2.4 4.4H3.6c-1.2-.8-2-2-2.4-4.4z"/><circle cx="9" cy="8.6" r="1.6"/><path d="M8.2 10.4h1.8l.6 4.4H7.6z"/><path d="M12.6 5.2l-4 13" stroke="currentColor" stroke-width="1.2"/><circle cx="15.6" cy="9.2" r="1.5"/><path d="M14.8 10.9h1.7l.6 3.9h-3z"/>`,
      house: `<path d="M2.6 11.6L12 4l9.4 7.6-1 1.2L12 6 3.6 12.8z"/><path d="M5 11.4L12 5.8l7 5.6v8H5z"/><path d="M10.4 14h3.2v5.4h-3.2z" fill="${PAGE}"/><path d="M15.4 5.4h1.8v3.4l-1.8-1.4z"/>`
    };
    const WORD = { ship: "a sailing ship", canoe: "a canoe", boat: "a steamboat", stage: "a stagecoach", rail: "a train", cart: "an ox cart", walk: "on foot", tent: "staying a while", house: "home" };
    const vIcon = m => L.divIcon({ className: "kveh" + (/ship|canoe|boat/.test(m) && !RM ? " bob" : ""), html: `<div class="disc" title="${WORD[m] || ""}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICON[m]}</svg></div>`, iconSize: [66, 66], iconAnchor: [33, 33] });
    V.veh = L.marker(islandCenter, { icon: vIcon("house"), interactive: false, keyboard: false, zIndexOffset: 1000 });
    let vehNow = "house";
    const vehicle = m => { if (!ICON[m] || m === vehNow) return; vehNow = m; V.veh.setIcon(vIcon(m)); };
    V.ship = L.marker(euSea.latlngs[0], { icon: vIcon("ship"), interactive: false, keyboard: false, zIndexOffset: 1000 });
    let shipNow = "ship";
    const shipMode = m => { if (m === shipNow) return; shipNow = m; V.ship.setIcon(vIcon(m)); };

    // ---------- the journey (data/journey.geojson + data/itinerary.json), as on the grown-up page ----------
    const legsAll = ((D.journey && D.journey.features) || []).filter(f => f.geometry && f.geometry.type === "LineString" && !f.properties.alternative && !/alternative/i.test(f.properties.confidence || ""))
      .sort((a, b) => (a.properties.leg || 0) - (b.properties.leg || 0));
    const legs = legsAll.map(f => {
      const latlngs = f.geometry.coordinates.map(ll);
      return { f, path: pathOf(latlngs), done: -1,
        halo: L.polyline(latlngs, Object.assign({ color: PAGE, weight: 11, opacity: .8 }, base)),
        todo: L.polyline(latlngs, Object.assign({ color: INK, weight: 3.5, opacity: .35, dashArray: "2 9" }, base)),
        poly: L.polyline([], Object.assign({ color: BARN, weight: 6 }, base)) };
    });
    const legByNo = {}; legs.forEach(l => legByNo[l.f.properties.leg] = l);
    V.route = L.layerGroup(legs.flatMap(l => [l.halo, l.todo, l.poly]));
    const MODE_SWITCH = {
      2: { first: "stage", at: [[45.43, -73.67, "boat"], [45.36, -74.0, "stage"], [45.30, -74.18, "boat"], [45.02, -74.73, "stage"], [44.98, -74.95, "boat"]] },
      3: { first: "boat", at: [[43.17, -79.05, "rail"]] }
    };
    const modeWord = s => { s = String(s || "").toLowerCase(); return /foot|walk/.test(s) ? "walk" : /cart/.test(s) ? "cart" : /rail/.test(s) ? "rail" : /stage|wagon/.test(s) ? "stage" : "boat"; };
    const legSpans = {};
    function spansOf(n) {
      if (n in legSpans) return legSpans[n];
      const sw = MODE_SWITCH[n], l = legByNo[n];
      if (!sw || !l) return legSpans[n] = null;
      return legSpans[n] = [{ f: 0, m: sw.first }, ...sw.at.map(([la, ln, m]) => ({ f: fracNear(l.path, L.latLng(la, ln)), m }))].sort((a, b) => a.f - b.f);
    }
    function modeAt(e, f) {
      if (e.kind !== "travel") return /home|settled/i.test(e.mode || "") ? "house" : "tent";
      const sp = spansOf(e.leg); if (sp) { let m = sp[0].m; for (const x of sp) if (f >= x.f) m = x.m; return m; }
      return modeWord(e.mode);
    }
    function setLegDone(l, p) { p = clamp01(p); if (p === l.done) return; l.done = p; l.poly.setLatLngs(partial(l.path, p)); }
    const placeFeats = (D.places && D.places.features) || [];
    const placeByLabel = {}; placeFeats.forEach(f => placeByLabel[f.properties.label] = ll(f.geometry.coordinates));
    const norm = t => String(t || "").toLowerCase().replace(/\s*\(.*$/, "").replace(/\s*\/.*$/, "").trim();
    const placeFor = name => { const n = norm(name); let best = null; for (const [lab, p] of Object.entries(placeByLabel)) { const m = norm(lab); if (n.startsWith(m) || m.startsWith(n)) if (!best || m.length > best.len) best = { p, len: m.length }; } return best && best.p; };
    const parseDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };
    const IT = (D.itinerary && D.itinerary.entries) || [];
    const itById = {}; IT.forEach(e => itById[e.id] = e);
    const lastDate = s => { const parts = String(s || "").split("/"); return parseDate(parts[parts.length - 1]); };
    for (const e of IT) { e.t0 = lastDate(e.start_est); e.t1 = lastDate(e.end_est); if (e.t1 == null && e.t0 != null) e.t1 = e.t0 + ((+e.days_est) || 1) * DAY; if (e.t0 == null) e.t0 = e.t1; }
    const origin = IT.find(e => e.kind === "stay" && (e.mode === "home" || /lévis|levis/i.test(e.from || ""))) || IT[0];
    const depart = origin ? origin.t1 : null;
    const dayOf = t => depart == null ? null : Math.max(1, Math.round((t - depart) / DAY));
    // the day numbers in the story text come from the itinerary, never typed in
    document.querySelectorAll("[data-day]").forEach(s => { const e = itById[s.dataset.day]; if (e && dayOf(e.t0)) s.textContent = fmtN(dayOf(e.t0)); });
    const legFrac = {};
    for (const e of IT) {
      if (e.kind !== "travel" || !e.leg || !legByNo[e.leg]) continue;
      const l = legByNo[e.leg], prev = IT.filter(x => x.kind === "travel" && x.leg === e.leg && x.t0 < e.t0).map(x => legFrac[x.id] ? legFrac[x.id][1] : 0);
      const a0 = prev.length ? Math.max(...prev) : 0;
      const dest = e.leg_segment ? placeFor(e.to) : null;
      const a1 = dest ? Math.max(a0, fracNear(l.path, dest)) : 1;
      legFrac[e.id] = [a0, e.leg_segment && IT.some(x => x.leg === e.leg && x.t0 > e.t0) ? a1 : 1];
    }
    const travelIT = IT.filter(e => e.kind === "travel" && legByNo[e.leg] && legFrac[e.id]);
    const weight = e => e.kind === "travel" ? 2 : (/documented/i.test(e.confidence || "") ? 1.4 : 0.6);
    function slice(ids) {
      const es = ids.map(id => itById[id]).filter(Boolean); if (!es.length) return null;
      const W = es.map(weight).reduce((x, y) => x + y, 0);
      let acc = 0; const span = es.map(e => { const a = acc / W; acc += weight(e); return [a, acc / W]; });
      return { es, span };
    }
    function locate(sl, p) {
      const u = clamp01(p);
      let i = sl.es.length - 1; for (let k = 0; k < sl.es.length; k++) if (u <= sl.span[k][1]) { i = k; break; }
      const [a, b] = sl.span[i];
      return { e: sl.es[i], i, q: b > a ? clamp01((u - a) / (b - a)) : 1 };
    }
    const stayAt = (e, prev) => prev ? at(legByNo[prev.leg].path, legFrac[prev.id][1]) : placeFor(e.to || e.from);
    let lastEntry = "";
    function itinerary(ids, p) {
      const sl = slice(ids); if (!sl) return;
      const { e: cur, i, q } = locate(sl, p);
      const minLeg = Math.min(...sl.es.filter(x => x.leg).map(x => x.leg), Infinity), maxLeg = Math.max(...sl.es.filter(x => x.leg).map(x => x.leg), 0);
      legs.forEach(l => { const n = l.f.properties.leg; if (n < minLeg) setLegDone(l, 1); else if (n > maxLeg) setLegDone(l, 0); });
      for (let k = 0; k < i; k++) { const x = sl.es[k]; if (x.kind === "travel" && legByNo[x.leg]) setLegDone(legByNo[x.leg], legFrac[x.id][1]); }
      for (let k = i + 1; k < sl.es.length; k++) { const x = sl.es[k]; if (x.kind === "travel" && legByNo[x.leg]) setLegDone(legByNo[x.leg], legFrac[x.id][0]); }
      let pos = null;
      if (cur.kind === "travel" && legByNo[cur.leg]) {
        const [a0, a1] = legFrac[cur.id], f = a0 + (a1 - a0) * q;
        setLegDone(legByNo[cur.leg], f); pos = at(legByNo[cur.leg].path, f); vehicle(modeAt(cur, f));
      } else {
        vehicle(modeAt(cur, 0));
        pos = stayAt(cur, travelIT.filter(x => x.t0 <= cur.t0).pop());
      }
      if (pos) V.veh.setLatLng(pos);
      const now = cur.t0 + (cur.t1 - cur.t0) * q, d = new Date(now);
      const yf = d.getUTCFullYear() + (now - Date.UTC(d.getUTCFullYear(), 0, 1)) / (365.25 * DAY);
      const longStay = cur.kind === "stay" && (cur.t1 - cur.t0) / DAY > 60;
      const n = dayOf(now);
      medal(String(d.getUTCFullYear()), n ? `Day ${fmtN(n)}${longStay && q > 0.5 ? "!" : ""}` : "", cur.id !== lastEntry || (longStay && q > 0.5));
      lastEntry = cur.id;
      seasons(yf, longStay ? smooth(q, 0, 0.1) * (1 - smooth(q, 0.9, 1)) : 0);
      trees(longStay ? q : 0, yf, longStay);
    }

    // ---------- the layout: where the picture goes, and the part of the screen the map has to itself ----------
    const W = () => map.getSize().x, H = () => map.getSize().y;
    const portrait = () => W() / H() <= 1 || W() <= 700;
    function layout(mode, hasPic) {
      const w = W(), h = H();
      if (portrait()) {
        if (mode === "pic") return { plate: [0.04 * w, 0.1 * h, 0.92 * w, 0.44 * h, "c"], region: [0, 0, w, 0.56 * h] };
        if (mode === "split") return { plate: [0.04 * w, 0.1 * h, 0.92 * w, 0.24 * h, "c"], region: [0, 0.34 * h, w, 0.57 * h] };
        return { plate: hasPic ? [0.6 * w, 0.03 * h, 0.36 * w, 0.2 * h, "c"] : null, region: [0, hasPic ? 0.1 * h : 0, w, 0.56 * h] };
      }
      const T = Math.min(460, 0.34 * w), right = Math.min(36, Math.max(14, 0.022 * w));
      const x0 = 0.025 * w, x1 = w - T - right - 0.025 * w, aw = x1 - x0;
      if (mode === "pic") return { plate: [x0, 0.1 * h, aw, 0.82 * h, "c"], region: [x0, 0, x1, h] };
      if (mode === "split") { const pw = 0.54 * aw; return { plate: [x0, 0.2 * h, pw, 0.66 * h, "c"], region: [x0 + pw + 0.015 * w, 0, x1, h] }; }
      if (hasPic) { const pw = 0.21 * w; return { plate: [x0, 0.58 * h, pw, 0.36 * h, "bl"], region: [x0 + pw * 0.9, 0, x1, h] }; }
      return { plate: null, region: [x0, 0, x1, h] };
    }

    // ---------- the camera ----------
    function resolveIn(v, R) {
      if (v.bounds) {
        const pad = 26, w = W(), h = H();
        const cz = map._getBoundsCenterZoom(v.bounds, { maxZoom: v.maxZoom || 18, paddingTopLeft: [R[0] + pad, R[1] + pad], paddingBottomRight: [w - R[2] + pad, h - R[3] + pad] });
        return { center: cz.center, zoom: cz.zoom };
      }
      return centreIn(v, R);
    }
    // a view {center, zoom} meant for the middle of region R -> the map's own centre
    function centreIn(v, R) {
      const off = L.point((R[0] + R[2]) / 2 - W() / 2, (R[1] + R[3]) / 2 - H() / 2);
      return { center: map.unproject(map.project(v.center, v.zoom).subtract(off), v.zoom), zoom: v.zoom };
    }
    const VIEWS = {
      ring: () => ({ bounds: lakeBounds.pad(0.12), maxZoom: 16 }),
      boulogne: () => ({ center: L.latLng(50.3, 0.6), zoom: 6.2 }),
      levy: () => ({ center: L.latLng(46.79, -71.2), zoom: 9 }),
      lauzon: () => ({ center: L.latLng(46.76, -71.24), zoom: 9.4 }),
      west: () => ({ bounds: L.latLngBounds([[42, -125], [54, -69]]) }),
      arrive: () => ({ center: farmBounds.getCenter(), zoom: 13.2 }),
      littleCanada: () => ({ bounds: L.latLngBounds([farmBounds.getSouthWest(), farmBounds.getNorthEast(), churchPt]).pad(0.35), maxZoom: 15 }),
      frame: () => ({ bounds: lakeBounds.pad(0.3), maxZoom: 15 }),
      cloquet: () => ({ center: L.latLng(46.72, -92.46), zoom: 10 }),
      hotel: () => ({ center: L.latLng(46.7222, -92.4612), zoom: 15.3 }),
      metro: () => ({ bounds: L.latLngBounds([housePt, islandCenter, farmBounds.getCenter()]).pad(0.3), maxZoom: 14.5 }),
      park: () => ({ bounds: L.latLngBounds([farmBounds.getSouthWest(), farmBounds.getNorthEast(), playPt]).pad(0.45), maxZoom: 16 }),
      home: () => ({ bounds: L.latLngBounds([housePt, islandCenter]).extend(lakeBounds).pad(0.1), maxZoom: 16 })
    };
    function flyPath(a, b) {
      const z0 = a.zoom, z1 = b.zoom;
      const from = map.project(a.center, z0), to = map.project(b.center, z0), size = map.getSize();
      const w0 = Math.max(size.x, size.y), w1 = w0 * map.getZoomScale(z0, z1), u1 = to.distanceTo(from) || 1, rho = 1.42, rho2 = rho * rho;
      const r = i => { const s1 = i ? -1 : 1, s2 = i ? w1 : w0, t1 = w1 * w1 - w0 * w0 + s1 * rho2 * rho2 * u1 * u1, b1 = 2 * s2 * rho2 * u1, bb = t1 / b1, sq = Math.sqrt(bb * bb + 1) - bb; return sq < 1e-9 ? -18 : Math.log(sq); };
      const sinh = n => (Math.exp(n) - Math.exp(-n)) / 2, cosh = n => (Math.exp(n) + Math.exp(-n)) / 2, tanh = n => sinh(n) / cosh(n);
      const r0 = r(0), S = (r(1) - r0) / rho;
      if (!isFinite(S) || Math.abs(S) < 1e-6) return t => (t < 1 ? { center: lerp(a.center, b.center, t), zoom: z0 + (z1 - z0) * t } : b);
      const w = s => w0 * (cosh(r0) / cosh(r0 + rho * s)), u = s => w0 * (cosh(r0) * tanh(r0 + rho * s) - sinh(r0)) / rho2;
      return t => {
        if (t <= 0) return a; if (t >= 1) return b;
        const s = t * S;
        return { center: map.unproject(from.add(to.subtract(from).multiplyBy(u(s) / u1)), z0), zoom: map.getScaleZoom(w0 / w(s), z0) };
      };
    }
    const lerpView = (a, b, w) => ({ center: lerp(a.center, b.center, w), zoom: a.zoom + (b.zoom - a.zoom) * w });
    function applyView(c) {
      if (LL.kidsCamLog) LL.kidsCamLog.push(+c.zoom.toFixed(4));
      const zoomChanged = map.getZoom() !== c.zoom;
      map._moveStart(true, false)._move(c.center, c.zoom);
      // _move with the same zoom fires no 'zoom', and the tile layers only re-place their tiles on 'zoom'/'viewreset'
      if (!zoomChanged) map.fire("zoom");
      map._moveEnd(true);
    }
    let camLast = "";
    function setCam(v) {
      const sig = v.center.lat.toFixed(7) + v.center.lng.toFixed(7) + v.zoom.toFixed(4);
      if (sig === camLast) return; camLast = sig; applyView(v);
    }

    // ---------- the steps ----------
    const steps = Array.from(document.querySelectorAll("#steps .step"));
    const J = C.journeyBase;
    const LAKES = ["lake", "island", "islandFill"];
    let ringDrawn = false;
    // Eustache's legs: the zoom only goes out on the sea and only in on the rivers
    const SEA_Z = 4.3, CANOE_Z = 6.3;
    let euK = null;
    const euKnots = () => euK || (euK = { fa: fracNear(euSea, L.latLng(49.0, -8.0)) });
    const ACTS = {
      title: { base: ["physical"], years: [1856], view: "ring", vec: ["lake", "island", "lakeLbl"], enter() {
          if (ringDrawn || RM) { islandSet(ring); return; }
          ringDrawn = true; const t0 = performance.now();
          const tick = now => { const q = smooth((now - t0) / 2600, 0, 1); islandSet(partial(islandPath, q)); if (q < 1) requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
        } },
      france: { base: ["physical"], view: "boulogne", vec: ["lblFrance"] },
      sea: { base: ["physical"], vec: ["lblFrance", "lblQuebec", "euSea", "ship"], picAt: 0.9,
        track(p, i) {
          const K = euKnots(), f = clamp01((p - 0.06) / 0.86), z0 = endView(i - 1).zoom;
          const zoom = f < K.fa ? z0 + (SEA_Z - z0) * smooth(f, 0, K.fa) : SEA_Z;
          let v = centreIn({ center: at(euSea, f), zoom }, regionOf(i));
          if (p < 0.06) v = lerpView(endView(i - 1), v, smooth(p, 0, 0.06));
          return { view: v, pos: at(euSea, f), mode: "ship", draw: () => draw(V.euSea, euSea, f) };
        } },
      canoe: { base: J.overview, vec: ["lblQuebec", "lblHuron", "euSea", "euHuron", "ship"], enter() { draw(V.euSea, euSea, 1); },
        track(p, i) {
          const f = clamp01((p - 0.05) / 0.85), zoom = SEA_Z + (CANOE_Z - SEA_Z) * smooth(f, 0, 0.3);
          return { view: centreIn({ center: at(euHuron, f), zoom }, regionOf(i)), pos: at(euHuron, f), mode: "canoe", draw: () => draw(V.euHuron, euHuron, f) };
        } },
      war: { base: J.overview, vec: ["lblQuebec", "lblHuron", "euSea", "euHuron", "ship"], enter() { draw(V.euSea, euSea, 1); draw(V.euHuron, euHuron, 1); },
        track(p, i) {
          const f = 1 - smooth(p, 0.3, 0.95);
          return { view: centreIn({ center: at(euHuron, f), zoom: CANOE_Z }, regionOf(i)), pos: at(euHuron, f), mode: "canoe" };
        } },
      farm: { base: ["physical"], view: "levy", vec: ["lblFarm"] },
      years: { base: ["physical"], view: "lauzon", vec: ["lblFarm"] },
      abraham: { base: ["physical"], view: "lauzon", vec: ["lblFarm"] },
      hard: { base: ["physical"], view: "lauzon", vec: ["lblFarm"] },
      oregon: { base: ["physical"], view: "west", vec: ["oregon", "oregonLine"], progress(p) { draw(V.oregonLine, oregonPath, RM ? 1 : smooth(p, 0.1, 0.6)); } },
      "j-river": { base: J.overview, vec: ["route", "veh"] },
      "j-lakes": { base: J.overview, vec: ["route", "veh"] },
      "j-river2": { base: J.trail, vec: ["route", "veh"] },
      "j-cart": { base: J.trail, vec: ["route", "veh"] },
      "j-boniface": { base: J.trail, vec: ["route", "veh"] },
      "j-trail": { base: J.trail, vec: ["route", "veh"] },
      arrive: { base: ["physical"], years: [1856], view: "arrive", vec: ["farm"] },
      island: { base: ["physical"], years: [1856], view: "ring", vec: ["lake", "island", "lakeLbl"], enter() { lakeWater(LAKE_FILL); },
        progress(p) { islandSet(partial(islandPath, RM ? 1 : smooth(p, 0.1, 0.55))); if ((p > 0.6 || RM) !== map.hasLayer(V.islandFill)) p > 0.6 || RM ? V.islandFill.addTo(map) : map.removeLayer(V.islandFill); } },
      church: { base: ["physical"], years: [1856], view: "littleCanada", vec: ["farm", "farmLbl", "church"] },
      chair: { base: ["physical"], years: [1856], view: "littleCanada", vec: ["farm", "farmLbl", "church"], progress(p) { steps[cur].classList.toggle("chair-open", p > 0.15); } },
      drain: { base: ["physical"], years: [1856], view: "frame", vec: [...LAKES, "drain"], progress(p) { drainage(1869, 1899, p); } },
      cloquet: { base: ["physical"], view: "cloquet", vec: ["lblCloquet"] },
      hotel: { base: ["physical", "imagery"], view: "hotel", vec: ["hotel"] },
      eric: { base: ["physical", "imagery"], view: "metro", vec: [...LAKES, "farm", "house"] },
      park: { base: ["physical", "imagery"], view: "park", vec: ["farm", "play"] },
      home: { base: ["physical", "imagery"], view: "home", vec: [...LAKES, "creek", "creekLbl", "house"] }
    };
    const actOf = i => ACTS[steps[i] && steps[i].dataset.act] || {};
    const modeOf = i => (steps[i] && steps[i].dataset.mode) || "map";
    const picsOf = i => { const s = steps[i] && steps[i].dataset.pic; return s ? s.split("|") : []; };
    const regionOf = i => layout(modeOf(i), picsOf(i).length > 0).region;
    const itOf = i => { const d = steps[i] && steps[i].dataset; return d && d.it ? d.it.split(",") : null; };
    function entryZoom(e, R) {
      const l = legByNo[e.leg], [a0, a1] = legFrac[e.id], len = Math.max(1, (a1 - a0) * l.path.len), mid = at(l.path, (a0 + a1) / 2);
      return Math.max(5.2, Math.min(8.0, Math.log2(156543.034 * Math.cos(mid.lat * Math.PI / 180) * 0.7 * (R[2] - R[0]) / len)));
    }
    function followTarget(i, p) {
      const sl = slice(itOf(i)), R = regionOf(i);
      const { e, q } = locate(sl, p);
      let v;
      if (e.kind === "travel" && travelIT.includes(e)) {
        const k = travelIT.indexOf(e), z1 = entryZoom(e, R), z0 = k > 0 ? entryZoom(travelIT[k - 1], R) : z1;
        const [a0, a1] = legFrac[e.id];
        v = { center: at(legByNo[e.leg].path, a0 + (a1 - a0) * q), zoom: z0 + (z1 - z0) * smooth(q, 0, 0.5) };
      } else {
        const prev = travelIT.filter(x => x.t0 <= e.t0).pop(), here = stayAt(e, prev);
        v = { center: here || L.latLng(46.8, -71.2), zoom: prev ? entryZoom(prev, R) : entryZoom(travelIT[0], R) };
      }
      v = centreIn(v, R);
      if (i > 0 && !itOf(i - 1)) v = lerpView(endView(i - 1), v, smooth(p, 0, 0.12));
      return v;
    }
    const endCache = {};
    function endView(i) {
      if (i < 0) i = 0;
      if (endCache[i]) return endCache[i];
      const a = actOf(i);
      let v;
      if (a.track) v = a.track(1, i).view;
      else if (itOf(i)) v = followTarget(i, 1);
      else if (a.view) v = resolveIn(VIEWS[a.view](), regionOf(i));
      else v = endView(i - 1);
      return endCache[i] = v;
    }
    const flyCache = {};
    function camFor(i, p) {
      const a = actOf(i);
      if (a.track) return a.track(RM ? 1 : p, i);
      if (itOf(i)) return { view: followTarget(i, RM ? 1 : p) };
      if (!flyCache[i]) flyCache[i] = flyPath(endView(i - 1), endView(i));
      return { view: i === 0 ? endView(0) : flyCache[i](RM ? 1 : smooth(p, 0, 0.55)) };
    }

    // ---------- the picture plate ----------
    const MAN = {}; D.manifest.forEach(m => { if (m && m.beat) MAN[m.beat] = m; });
    const SPECIAL = {
      patent: { file_asis: "img/1849-patent-island-page.jpg", title: "The land paper for the island, 1849", artist: "The government land office", date: "25 March 1849", what_it_shows: "The paper that gave Abraham the island. The clerk spelled his name \"Abraham Lombert.\"" },
      lidar: { file_asis: "img/lambert-basin-lidar.png", title: "The lake's hollow today", what_it_shows: "The ground where the lake was, from the state's height survey: the ring-shaped hollow and the island hill." }
    };
    const metaOf = k => MAN[k] || SPECIAL[k];
    const srcOf = k => { const m = metaOf(k); return m ? (m.file_asis || m.file) : null; };
    const aspect = {};
    const plate = $("plate"), pimg = $("plate-img"), bubble = $("bubble");
    let picNow = "", plateMode = "", plateHas = false;
    function placePlate() {
      const L0 = layout(plateMode, plateHas).plate;
      if (!L0 || !picNow) { plate.classList.remove("on"); return; }
      const [x, y, bw, bh, anchorAt] = L0, pad = Math.min(16, Math.max(8, 0.011 * W())) * 2;
      const asp = aspect[picNow] || 1.4;
      let iw = Math.min(bw - pad, (bh - pad) * asp), ih = iw / asp;
      const ow = iw + pad, oh = ih + pad;
      const left = anchorAt === "bl" ? x : x + (bw - ow) / 2, top = anchorAt === "bl" ? y + bh - oh : y + (bh - oh) / 2;
      Object.assign(plate.style, { left: left + "px", top: top + "px", width: ow + "px", height: oh + "px" });
      plate.dataset.mode = plateMode;
      plate.classList.add("on");
    }
    function picture(k, i) {
      if (k === picNow) return;
      picNow = k || "";
      if (!k) { plate.classList.remove("on"); return; }
      const src = srcOf(k), m = metaOf(k);
      const show = () => { if (picNow !== k) return; pimg.src = src; pimg.alt = m.what_it_shows || m.title || ""; pimg.classList.remove("swap"); placePlate(); };
      if (aspect[k]) { pimg.classList.add("swap"); setTimeout(show, RM ? 0 : 180); }
      else { const im = new Image(); im.onload = () => { aspect[k] = im.naturalWidth / im.naturalHeight; pimg.classList.add("swap"); show(); }; im.src = src; }
      // the question for this picture, if the step has one
      const pr = (steps[i] && steps[i].dataset.prompt) || "";
      let text = "";
      if (pr) { const m2 = /^([a-z0-9-]+):(.*)$/.exec(pr); text = m2 ? (m2[1] === k ? m2[2] : "") : pr; }
      bubble.textContent = text; bubble.hidden = !text;
    }
    // warm the picture sizes so the plate never jumps
    steps.forEach((s, i) => picsOf(i).forEach(k => { const src = srcOf(k); if (src && !aspect[k]) { const im = new Image(); im.onload = () => { aspect[k] = im.naturalWidth / im.naturalHeight; if (k === picNow) placePlate(); }; im.src = src; } }));

    // ---------- the lightbox: tap the picture; tap, scroll or Esc to close ----------
    const lb = $("lb"), lbImg = $("lb-img"), lbCap = $("lb-cap");
    let lbOpen = false, swallowUntil = 0, lastFocus = null, touchY = null;
    const esc = t => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    function openLB() {
      const m = metaOf(picNow); if (!m) return;
      lbImg.src = srcOf(picNow); lbImg.alt = m.what_it_shows || m.title || "";
      const who = [m.artist, m.date].filter(Boolean).join(", ");
      lbCap.innerHTML = `<b>${esc(m.title || "")}</b>${m.what_it_shows ? "<br>" + esc(m.what_it_shows) : ""}${who ? `<small>${esc(who)}</small>` : ""}`;
      lastFocus = document.activeElement; lbOpen = true; lb.hidden = false;
      requestAnimationFrame(() => lb.classList.add("in"));
      $("lb-close").focus({ preventScroll: true });
    }
    function closeLB() {
      if (!lbOpen) return; lbOpen = false; swallowUntil = Date.now() + 450; lb.classList.remove("in");
      setTimeout(() => { if (!lbOpen) lb.hidden = true; }, RM ? 0 : 250);
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
    $("plate-btn").addEventListener("click", openLB);
    lb.addEventListener("click", closeLB);
    addEventListener("wheel", e => {
      if (lbOpen) { e.preventDefault(); if (Math.abs(e.deltaY) > 2) closeLB(); return; }
      if (Date.now() < swallowUntil) { e.preventDefault(); swallowUntil = Date.now() + 150; }
    }, { passive: false, capture: true });
    addEventListener("touchstart", e => { if (lbOpen) touchY = e.touches[0].clientY; }, { passive: true, capture: true });
    addEventListener("touchmove", e => { if (!lbOpen) return; e.preventDefault(); if (touchY != null && Math.abs(e.touches[0].clientY - touchY) > 24) closeLB(); }, { passive: false, capture: true });
    addEventListener("keydown", e => {
      if (!lbOpen) return;
      if (["Escape", "ArrowDown", "ArrowUp", "PageDown", "PageUp", " "].includes(e.key)) { e.preventDefault(); closeLB(); }
    }, { capture: true });

    // ---------- the rolling year ----------
    const yr = s => { const m = /\d{4}/.exec(String(s || "")); return m ? +m[0] : null; };
    function yearBefore(i) { for (let k = i - 1; k >= 0; k--) { const d = steps[k].dataset; if (d.it) { const ids = d.it.split(","), e = itById[ids[ids.length - 1]]; if (e) return new Date(e.t1).getUTCFullYear(); } const y = yr(d.year); if (y != null) return y; } return null; }
    function rollOf(i) {
      const d = steps[i].dataset;
      if (d.roll) { const [a, b] = d.roll.split(",").map(Number); return { a, b, p0: 0.05, p1: 0.85 }; }
      const Y = yr(d.year), P = yearBefore(i);
      return Y != null && P != null && Y - P >= 3 ? { a: P, b: Y, p0: 0, p1: 0.35 } : null;
    }

    // ---------- preload: the tiles the neighbouring steps will show ----------
    const fetched = new Set();
    function tilesFor(layer, v) {
      const o = layer.options || {}, size = map.getSize();
      let z = Math.round(v.zoom); z = Math.max(o.minZoom || 0, Math.min(o.maxNativeZoom != null ? o.maxNativeZoom : (o.maxZoom || 18), z));
      const c = map.project(v.center, z), half = size.divideBy(2).multiplyBy(Math.pow(2, z - v.zoom) * 1.15);
      const x0 = Math.floor((c.x - half.x) / 256), x1 = Math.floor((c.x + half.x) / 256), y0 = Math.floor((c.y - half.y) / 256), y1 = Math.floor((c.y + half.y) / 256);
      const out = [], n = Math.pow(2, z);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        if (y < 0 || y >= n || out.length > 80) continue;
        const t = { x: ((x % n) + n) % n, y, z };
        if (layer instanceof LL.Indexed && !LL.hasTile(o.indexKey, t)) continue;
        if (o.bounds) { const b = L.latLngBounds(o.bounds), nw = map.unproject([x * 256, y * 256], z), se = map.unproject([(x + 1) * 256, (y + 1) * 256], z); if (!b.intersects(L.latLngBounds(nw, se))) continue; }
        out.push(layer instanceof LL.Export ? layer.getTileUrl(t) : L.Util.template(layer._url, L.extend({ s: (o.subdomains || "abc")[0] }, o, t)));
      }
      return out;
    }
    function preload(i) {
      if (i < 0 || i >= steps.length) return;
      const a = actOf(i), views = [];
      for (let p = 0; p <= 1; p += (a.track || itOf(i)) ? 0.0625 : 0.25) views.push(camFor(i, p).view);
      const ls = [...asList(a.base).map(baseLayer), ...asList(a.years).flatMap(y => yearGroup(y).parts)].filter(Boolean);
      for (const v of views) for (const l of ls) for (const u of tilesFor(l, v)) if (!fetched.has(u)) { fetched.add(u); const im = new Image(); im.decoding = "async"; im.src = u; }
    }
    setTimeout(() => { // the underlay at its native levels over the whole journey
      const box = L.latLngBounds([...legs.flatMap(l => l.path.latlngs), ...euSea.latlngs, ...euHuron.latlngs, ...oregonPts]).pad(0.1);
      for (const l of Object.values(UNDER)) {
        if (!l) continue; const o = l.options;
        for (const z of [3, 4, o.maxNativeZoom]) {
          const nw = map.project(box.getNorthWest(), z).divideBy(256).floor(), se = map.project(box.getSouthEast(), z).divideBy(256).floor();
          for (let x = nw.x; x <= se.x; x++) for (let y = nw.y; y <= se.y; y++) {
            const t = { x, y, z };
            if (l instanceof LL.Indexed && !LL.hasTile(o.indexKey, t)) continue;
            if (o.bounds) { const b = L.latLngBounds(o.bounds), tb = L.latLngBounds(map.unproject([x * 256, y * 256], z), map.unproject([(x + 1) * 256, (y + 1) * 256], z)); if (!b.intersects(tb)) continue; }
            const u = l instanceof LL.Export ? l.getTileUrl(t) : L.Util.template(l._url, L.extend({ s: (o.subdomains || "abc")[0] }, o, t));
            if (!fetched.has(u)) { fetched.add(u); const im = new Image(); im.src = u; }
          }
        }
      }
    }, 50);

    // ---------- drive it ----------
    const ALL = Object.keys(V);
    function vectors(on) {
      const set = new Set(on);
      for (const k of ALL) { const has = map.hasLayer(V[k]); if (set.has(k) && !has) V[k].addTo(map); else if (!set.has(k) && has) map.removeLayer(V[k]); }
    }
    let cur = 0, preloadTimer = 0;
    LL.scroller({
      steps,
      onEnter(step, i) {
        cur = i;
        const a = actOf(i);
        clearTimeout(preloadTimer);
        preloadTimer = setTimeout(() => { preload(i); preload(i + 1); preload(i - 1); preload(i + 2); }, 120);
        $("stage").dataset.mode = modeOf(i);
        const keepB = new Set([...asList(actOf(i - 1).base), ...asList(a.base), ...asList(actOf(i + 1).base)]);
        const keepY = new Set([...asList(actOf(i - 1).years), ...asList(a.years), ...asList(actOf(i + 1).years)]);
        layers(keepB, asList(a.base), keepY, asList(a.years));
        vectors(a.vec || []);
        // the lake: full on the old maps, a ghost of itself once it is gone
        const drainIdx = steps.findIndex(s => s.dataset.act === "drain");
        if (a.vec && a.vec.includes("lake") && i !== drainIdx) lakeWater(i > drainIdx ? 0.06 : LAKE_FILL, i > drainIdx ? 0.7 : null);
        if (i > drainIdx && a.vec && a.vec.includes("island")) { islandSet(ring); }
        if (a.enter) a.enter();
        plateMode = modeOf(i); plateHas = picsOf(i).length > 0;
        if (!plateHas) picture("", i);
        if (!itOf(i)) { lastEntry = ""; medal(steps[i].dataset.year || "", "", false); }
        if (!rollOf(i) && !itOf(i)) { seasons(yr(steps[i].dataset.year) || 1800, 0); trees(0, 0, false); }
        placePlate();
      },
      onProgress(step, i, p) {
        cur = i;
        const a = actOf(i), c = camFor(i, p);
        setCam(c.view);
        if (c.draw) c.draw();
        if (c.pos) { V.ship.setLatLng(c.pos); shipMode(c.mode); }
        const it = itOf(i);
        if (it) itinerary(it, RM ? 1 : p);
        else {
          const r = rollOf(i);
          if (r) {
            const t = RM ? 1 : smooth(p, r.p0, r.p1), yf = r.a + (r.b - r.a) * t, rolling = t > 0 && t < 1;
            medal(rolling ? String(Math.floor(yf)) : (step.dataset.year || String(r.b)), "", false);
            seasons(yf, rolling ? 1 : 0);
            trees(t, yf, step.dataset.roll ? t > 0 : rolling);
          }
        }
        if (a.progress) a.progress(RM ? 1 : p);
        const pics = picsOf(i);
        if (pics.length) {
          const split = a.picAt, r = clamp01((p - 0.05) / 0.9);
          const k = pics.length === 1 ? 0 : split != null ? (p < split ? 0 : 1) : Math.min(pics.length - 1, Math.floor(r * pics.length));
          picture(pics[k], i);
        }
      }
    });
    function relayout() {
      map.invalidateSize();
      for (const k in endCache) delete endCache[k];
      for (const k in flyCache) delete flyCache[k];
      camLast = ""; placePlate();
    }
    addEventListener("resize", relayout);
    new ResizeObserver(() => relayout()).observe(el);
    LL.kidsMap = map;
  }

  boot().catch(e => console.error("kids page failed", e));
})();
