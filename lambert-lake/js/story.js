/* The story map: one sticky Leaflet map that the scroll drives through the chapters.
   - Every step declares the base maps and year layers it needs; the layers of the step before and after
     are kept on the map at opacity 0, so nothing is ever added at the moment it is needed.
   - The camera is a function of scroll: keyframes per step, interpolated along Leaflet's flyTo curve,
     so slow scrolling moves slowly and scrolling back reverses.
   - The journey is driven by data/itinerary.json: dates, day counts, stays, and camera points per leg. */
window.LL = window.LL || {};

LL.story = function (D) {
  const C = LL.CONFIG, RM = C.reducedMotion, COL = C.colors, $ = id => document.getElementById(id);
  const el = $("story-map");
  const map = L.map(el, {
    zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
    boxZoom: false, keyboard: false, touchZoom: false, tap: false, zoomSnap: 0, zoomAnimation: false, fadeAnimation: !RM,
    markerZoomAnimation: false, inertia: false, worldCopyJump: false
  });
  map.attributionControl.setPrefix("");
  map.createPane("base").style.zIndex = 200; map.getPane("base").classList.add("pane-base");
  map.createPane("period").style.zIndex = 220; map.getPane("period").classList.add("pane-period");
  map.createPane("hist").style.zIndex = 250;
  // the traveller (the cart, the ship): its own pane above the season overlay (300s), the vectors (400), the pins
  // (600) and the labels (650), so nothing on the map is ever drawn over it
  map.createPane("traveller").style.zIndex = 690;
  map.setView([45.06, -93.07], 14);
  // the seasons (js/seasons.js): a colour grade and snow or leaves over the base maps, under the routes and labels,
  // that cycle while the year counter races
  const SEA = window.Seasons ? window.Seasons.attach(map, { reducedMotion: RM, snow: 320, leaves: 44 }) : null;

  // ---------- helpers ----------
  const phone = () => window.innerWidth <= 760;
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const smooth = (p, a, b) => { const t = clamp01((p - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, f) => L.latLng(a.lat + (b.lat - a.lat) * f, a.lng + (b.lng - a.lng) * f);
  const ll = c => L.latLng(c[1], c[0]);
  const B = b => L.latLngBounds(b.getSouthWest(), b.getNorthEast());
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
  const anchor = p => L.marker(p, { icon: L.divIcon({ className: "anchor", iconSize: [0, 0] }), interactive: false, keyboard: false });
  const tip = (layer, text, cls, dir, off) => layer.bindTooltip(text, { permanent: true, direction: dir || "right", offset: off || [10, 0], className: "lbl " + (cls || ""), interactive: false });
  const dot = (p, cls) => L.marker(p, { icon: L.divIcon({ className: "pin " + cls, iconSize: cls === "place" ? [11, 11] : [16, 16] }), interactive: false });
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const parseDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };
  const DAY = 86400000;
  const fmtDate = ms => { const d = new Date(ms); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

  // ---------- base maps and year layers: a registry, with the neighbours preloaded ----------
  const bases = {}; // key -> layer (or null when a probed tile set is missing)
  function baseLayer(key) {
    if (key in bases) return bases[key];
    const b = C.basemaps[key];
    const l = LL.baseLayer(key, { pane: b && b.probe ? "period" : "base", opacity: 0 });
    return bases[key] = l;
  }
  const yearsById = {}; (D.years || []).forEach(e => yearsById[e.year] = e);
  const groups = {};
  function yearGroup(year) {
    if (groups[year]) return groups[year];
    const e = yearsById[year], parts = [];
    const live = LL.liveLayer(year, { pane: "hist", opacity: 0, attribution: "" });
    if (live) parts.push(live);
    if (e) parts.push(LL.tileLayer(C.tiles(year), Object.assign(C.tileOptions(e), { pane: "hist", opacity: 0, attribution: "" })));
    return groups[year] = { year, parts, on: false, op: 0 };
  }
  const liveBases = new Set(), liveYears = new Set();
  const asList = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
  // keep = everything the previous, current and next steps need; show = what the current step shows
  function layers(keepBases, showBases, keepYears, showYears) {
    for (const k of keepBases) { const l = baseLayer(k); if (l && !liveBases.has(k)) { l.addTo(map); liveBases.add(k); } }
    for (const k of Array.from(liveBases)) if (!keepBases.has(k)) { map.removeLayer(bases[k]); liveBases.delete(k); }
    let z = 1; for (const k of liveBases) { const l = bases[k]; if (l.setZIndex) l.setZIndex(showBases.includes(k) ? 10 + showBases.indexOf(k) : z++); }
    for (const k of liveBases) bases[k].setOpacity(showBases.includes(k) ? 1 : 0);
    underlayFor(showBases);
    for (const y of keepYears) { const g = yearGroup(y); if (!g.on) { g.parts.forEach(l => l.addTo(map)); g.on = true; } }
    for (const y of Array.from(liveYears)) if (!keepYears.has(y)) { const g = groups[y]; g.parts.forEach(l => map.removeLayer(l)); g.on = false; liveYears.delete(y); }
    for (const y of keepYears) liveYears.add(y);
    const shown = showYears.map(x => x.year);
    // scanned paper (plats, atlases, the topo) multiplies into the base, so a sheet's white margin is never a blank
    map.getPane("hist").classList.toggle("paper", shown.length > 0 && shown.every(y => y < 1935));
    for (const y of liveYears) {
      const g = groups[y], i = shown.indexOf(y), o = i < 0 ? 0 : (showYears[i].opacity == null ? 1 : showYears[i].opacity);
      g.parts.forEach(l => { l.setOpacity(o); if (l.setZIndex) l.setZIndex(i < 0 ? 1 : 2 + i); });
    }
  }
  // an underlay that is always loaded: the modern base and the two period sheets at a low native zoom, kept on
  // the map for the whole journey and fetched at start. A long jump of the camera (a fast flick of the wheel)
  // then shows a soft map while the sharp tiles load, never bare paper. Off above zoom 11 (no huge upscales).
  const UNDER = {};
  function underlay() {
    const mk = (key, nz, pane) => { const l = LL.baseLayer(key, { pane, opacity: 1, maxNativeZoom: nz, maxZoom: 11, keepBuffer: 8, attribution: "" }); if (l) { l.addTo(map); l.setZIndex(0); } return l; };
    UNDER.physical = mk("physical", 5, "base");
    UNDER.burr1839 = mk("burr1839", 5, "period");
    UNDER.nicollet1843 = mk("nicollet1843", 6, "period");
    for (const k in UNDER) if (UNDER[k] && k !== "physical") UNDER[k].setOpacity(0);
  }
  function underlayFor(showBases) { for (const k in UNDER) if (UNDER[k] && k !== "physical") UNDER[k].setOpacity(showBases.includes(k) ? 1 : 0); }
  const setYearOpacity = (year, o) => { const g = groups[year]; if (g && g.on) g.parts.forEach(l => l.setOpacity(o)); };

  // ---------- small UI ----------
  function hudLayer(text) { const t = $("hud-layer"); t.textContent = text || ""; t.classList.toggle("on", !!text); }
  function legend(on) { $("hud-legend").classList.toggle("on", !!on); const m = $("hud-modes"); if (m) m.classList.toggle("on", !!on); }
  const yearText = y => { const e = yearsById[y]; return e ? `${y}: ${e.credit}` : String(y); };
  const PLAT = "Government survey plat, 1847–48, shown as 1856. MnGeo / Minnesota Historical Society";
  const periodNames = keys => keys.filter(k => C.basemaps[k] && C.basemaps[k].probe && LL.available[k]).map(k => C.basemaps[k].title || C.basemaps[k].attribution);
  const baseText = (keys, lead) => { const n = periodNames(asList(keys)); return lead + ". " + (n.length ? n.join("; ") : "Modern base map, Esri"); };
  let dmTimer = 0, dmKey = "";
  function datemark(year, sub, instant) {
    const key = year + "|" + sub, dm = $("datemark");
    if (key === dmKey) return; dmKey = key;
    const write = () => { $("dm-year").textContent = year || ""; $("dm-sub").innerHTML = sub || ""; dm.classList.toggle("off", !year && !sub); };
    clearTimeout(dmTimer);
    if (RM || instant) return write();
    dm.classList.add("off"); dmTimer = setTimeout(write, 240);
  }
  // ---------- the rolling year: the year counts up between steps, like an odometer, and settles on the step's date ----------
  const yrFirst = t => { const m = /\d{4}/.exec(String(t || "")); return m ? +m[0] : null; };
  const yrLast = t => {
    const all = String(t || "").match(/\d{4}(?:\s*[–-]\s*\d{2,4})?/g); if (!all) return null;
    const r = /(\d{4})(?:\s*[–-]\s*(\d{2,4}))?/.exec(all[all.length - 1]);
    return r[2] ? +(r[1].slice(0, 4 - r[2].length) + r[2]) : +r[1];
  };
  const yrsOf = g => { const b = yrFirst(g.born), d = yrFirst(g.died); return b || d ? `${b || "?"}–${d || ""}` : ""; };
  const esc = t => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const shortName = n => String(n || "").replace(/\s*\(tree[^)]*\)/g, "").replace(/\s*\(the tree's[^)]*\)/g, "");
  const GENS = (D.generations || []).slice().sort((a, b) => (+a.gen || 0) - (+b.gen || 0));
  function rollNow(sub, key) { // the sub line now, the year from progress
    clearTimeout(dmTimer); dmKey = key; $("dm-sub").innerHTML = sub || ""; $("datemark").classList.remove("off");
  }
  function rollYear(text, rolling) { $("dm-year").textContent = text; $("datemark").classList.toggle("rolling", !!rolling); }
  const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
  // a long roll takes more of its step, so the years it covers can be read
  const rollSpan = (P, Y) => (Y - P > 10 ? 0.5 : 0.3);
  // the season comes from the story's own date: a month gives the season (meteorological, with the crossfade
  // straddling the turn of the month), Seasons' phase 0 spring .25 summer .5 fall .75 winter
  const phaseOfMs = ms => { const d = new Date(ms), y = d.getUTCFullYear(), doy = (ms - Date.UTC(y, 0, 1)) / DAY; return { year: y, phase: (((doy - 59 + 14) / 365) % 1 + 1) % 1 }; };
  const MONTH_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/;
  // a step's own date when it names a month ("22 January, Saint-Nicolas"), else null: a bare year has no season
  function stepDateMs(st) {
    const d = st.dataset, y = yrFirst(d.date), t = (d.sub || "") + " " + (d.date || ""), m = MONTH_RE.exec(t);
    if (y == null || !m) return null;
    const day = new RegExp("(\\d{1,2})\\s+" + m[1]).exec(t);
    return Date.UTC(y, MONTHS.indexOf(m[1]), day ? +day[1] : 15);
  }
  // the trees of the Lauzon shore, which grow over the six generations: a seeded scatter south of the river
  const LZ_TREES = (() => {
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, out = [];
    const river = lng => lng < -71.41 ? 46.70 + (lng + 71.41) * 0.17 : lng < -71.13 ? 46.70 + (lng + 71.41) * 0.43 : 46.82 + (lng + 71.13) * 0.1;
    while (out.length < 60) { const lng = -71.95 + rnd() * 0.85, lat = river(lng) - 0.03 - rnd() * 0.2; out.push([lat, lng]); }
    return out;
  })();

  // the journey's illustrations, from the manifest
  const ILL = {}; (D.illus || []).forEach(m => { if (m && m.beat) ILL[m.beat] = m; });
  const fig = $("illus"), figImg = $("illus-img"), figCap = $("illus-cap");
  let figBeat = null;
  const yearOf = d => { const y = /c\. \d{4}|\d{4}s?/.exec(String(d || "")); return y ? y[0] : ""; };
  // the short caption: the manifest's short title if it has one, else the title without its parenthesis or tail
  function shortTitle(m) {
    if (m.short_title) return m.short_title;
    let t = String(m.title || "").replace(/\s*\(.*?\)\s*/g, " ").trim();
    if (t.length > 44 && t.includes(",")) t = t.slice(0, t.indexOf(","));
    if (t.length > 52) t = t.slice(0, 50).replace(/\s+\S*$/, "") + "…";
    return t;
  }
  function fullCaption(m) {
    const who = [m.title ? `<b>${m.title}</b>` : "", m.artist, m.date].filter(Boolean).join(", ");
    const parts = [who + "."];
    if (m.caption) parts.push(m.caption);
    else if (m.what_it_shows) parts.push(m.what_it_shows);
    if (m.how_close && m.how_close !== m.caption) parts.push(`<span class="hc">${m.how_close}</span>`);
    if (m.fit && m.fit !== m.how_close) parts.push(`<span class="hc">${m.fit}</span>`);
    if (m.credit_line) parts.push(`<span class="cr">${m.credit_line}${m.rights ? ` (${m.rights})` : ""}</span>`);
    if (m.source_url) parts.push(`<a href="${m.source_url}" target="_blank" rel="noopener">source</a>`);
    return parts.join(" ");
  }
  function illus(beats, r, pos) {
    const list = beats ? beats.split("|") : [];
    const beat = list.length > 1 ? list[Math.min(list.length - 1, Math.floor(clamp01(r) * list.length))] : list[0];
    if (list.length > 1) r = clamp01(r * list.length - Math.floor(clamp01(r) * list.length));
    const m = beat && ILL[beat];
    if (!m) { if (figBeat) { fig.classList.remove("on"); figBeat = null; } return; }
    if (figBeat !== beat) {
      figBeat = beat;
      figImg.src = m.file_asis || m.file; figImg.alt = m.what_it_shows || m.title || "";
      // on the page only a short caption: the title and a year; everything else is in the lightbox on click
      figCap.innerHTML = `<b>${shortTitle(m)}</b>${yearOf(m.date) ? `, ${yearOf(m.date)}` : ""} <span class="more-cue" aria-hidden="true">ⓘ details</span>`;
      figImg.title = "Click for details";
      figImg._enlarge = () => ({ src: m.file_asis || m.file, alt: figImg.alt, caption: fullCaption(m) });
      figCap._enlarge = figImg._enlarge;
      fig.classList.add("on");
    }
    fig.classList.toggle("at-left", pos === "right");   // the picture takes the side the words leave free
    fig.style.setProperty("--r", String(Math.round((RM ? 1 : clamp01(r * 4)) * 100)));
  }

  // ---------- the family's land, the lake ----------
  const feats = (D.parcels && D.parcels.features) || [];
  const byGroup = g => feats.filter(f => f.properties.group === g);
  const ringOf = f => f.geometry.coordinates[0].map(ll);
  const islandLots = byGroup("abraham-island").map(ringOf);
  const islandBounds = L.latLngBounds(islandLots.flat());
  const islandCenter = islandBounds.getCenter();
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
  const island = { ring: outerRing(islandLots) };
  island.ring.push(island.ring[0]);
  island.path = pathOf(island.ring);
  const V = {};
  const HALO0 = "#f3ecda";
  const islandLine = L.polyline([], { color: COL["abraham-island"], weight: 4.5, opacity: 1, lineJoin: "round", lineCap: "round", interactive: false });
  const islandHalo = L.polyline([], { color: HALO0, weight: 10, opacity: .8, lineJoin: "round", lineCap: "round", interactive: false });
  V.island = L.featureGroup([islandHalo, islandLine]);
  const islandSet = pts => { islandHalo.setLatLngs(pts); islandLine.setLatLngs(pts); };
  V.islandFill = L.polygon(island.ring, { stroke: false, fillColor: COL["abraham-island"], fillOpacity: .16, interactive: false });
  V.islandLabel = tip(anchor(islandCenter), "Lambert Island", "ink big seal", "center", [0, 0]);
  const sharedPts = (() => { const key = p => p.lat.toFixed(7) + "," + p.lng.toFixed(7); const s = new Set(islandLots[1].map(key)); return islandLots[0].filter(p => s.has(key(p))); })();
  const lotCenter = i => L.polygon(islandLots[i]).getBounds().getCenter();
  const lotBy = {}; byGroup("abraham-island").forEach((f, i) => lotBy[(f.properties.SECDIVLAB || "").replace(/\D/g, "")] = i);
  V.lots = L.layerGroup([
    L.polyline(sharedPts.slice(0, 2), { color: COL["abraham-island"], weight: 1.5, dashArray: "3 5", interactive: false }),
    tip(anchor(lotCenter(lotBy["6"] ?? 1)), "<b>6</b>58.69 a.", "lot", "top", [0, -8]),
    tip(anchor(lotCenter(lotBy["7"] ?? 0)), "<b>7</b>35.70 a.", "lot", "top", [0, -8])
  ]);
  const haloed = (fc, style) => L.featureGroup([L.geoJSON(fc, { style: { color: HALO0, weight: style.weight + 5, opacity: .75, fill: false, interactive: false } }), L.geoJSON(fc, { style })]);
  V.farm = haloed({ type: "FeatureCollection", features: byGroup("abraham-gervais") }, { color: COL["abraham-gervais"], weight: 3.5, fillColor: COL["abraham-gervais"], fillOpacity: .18, interactive: false });
  const farmBounds = V.farm.getBounds();
  V.farmLabel = tip(anchor(farmBounds.getCenter()), "Abraham's farm<br>lots 1 and 2, 91.25 acres", "ink seal", "center", [0, 0]);
  V.louis = haloed({ type: "FeatureCollection", features: byGroup("louis-gervais") }, { color: COL["louis-gervais"], weight: 3.5, dashArray: "8 6", fillColor: COL["louis-gervais"], fillOpacity: .16, interactive: false });
  const louisBounds = V.louis.getBounds();
  V.louisLabel = tip(anchor(louisBounds.getCenter()), "Louis A. Lambert<br>80 acres, 1853", "ink", "center", [0, 0]);
  const pts = {}; ((D.points && D.points.features) || []).forEach(f => pts[f.properties.id || f.properties.kind] = ll(f.geometry.coordinates));
  const churchPt = pts.church || L.latLng(45.0210715, -93.0847900);
  V.church = tip(dot(churchPt, "church"), "St. John the Evangelist", "ink");
  const lakeGeo = D.lake && (D.lake.features ? D.lake : { type: "FeatureCollection", features: [D.lake] });
  const LAKE_FILL = .22;
  const lakeMain = lakeGeo ? L.geoJSON(lakeGeo, { style: { color: "#2f5a66", weight: 4, opacity: 1, fillColor: "#3f7d8e", fillOpacity: LAKE_FILL, interactive: false, lineJoin: "round" } }) : null;
  V.lake = lakeGeo ? L.featureGroup([L.geoJSON(lakeGeo, { style: { color: HALO0, weight: 9, opacity: .7, fill: false, interactive: false } }), lakeMain]) : L.layerGroup();
  const lakeWater = o => { if (lakeMain) lakeMain.setStyle({ fillOpacity: o }); };
  const lakeBounds = lakeGeo ? V.lake.getBounds() : islandBounds.pad(1.2);
  V.lakeLabel = tip(anchor(L.latLng(lakeBounds.getNorth(), lakeBounds.getCenter().lng)), "the lake, 1847–48", "ink", "top", [0, -4]);
  const INK = "#1d1712", HALO = "#f3ecda";
  // a hand-coloured atlas: the water ways in blue ink, the land ways in earth brown, both dark enough to read as ink
  const WATER = "#22506b", LAND = "#5c3a1d";
  const base = { lineJoin: "round", lineCap: "round", interactive: false };
  // Eustache: reconstructed routes (data/eustache-route.geojson), else the old approximate lines
  const euFeat = leg => ((D.eustache && D.eustache.features) || []).find(f => f.properties.leg === leg);
  const euPts = (leg, fb) => { const f = euFeat(leg); return (f ? f.geometry.coordinates.map(ll) : fb.map(c => L.latLng(c[0], c[1]))); };
  const euSea = pathOf(euPts("sea", [[50.73, 1.61], [49.3, -12], [47.2, -45], [48.6, -62.5], [46.81, -71.21]]));
  const euHuron = pathOf(euPts("huron", [[46.81, -71.21], [45.5, -73.55], [46.3, -78.7], [46.0, -80.6], [44.73, -79.85]]));
  const euLine = (path, w, col, op, dashA) => L.polyline([], Object.assign({ color: col, weight: w, opacity: op, dashArray: dashA }, base));
  V.euSea = L.layerGroup([euLine(euSea, 12, HALO, .85), euLine(euSea, 5, WATER, .95, "14 10")]);
  V.euHuron = L.layerGroup([euLine(euHuron, 12, HALO, .85), euLine(euHuron, 5, WATER, .95, "14 10")]);
  const euDraw = (grp, path, p) => grp.getLayers().forEach(l => l.setLatLngs(partial(path, p)));
  V.euPlaces = L.layerGroup([
    tip(dot(L.latLng(50.73, 1.61), "place"), "Boulogne", "ink", "right"),
    tip(dot(L.latLng(44.73, -79.85), "place"), "Sainte-Marie among the Hurons", "ink", "right"),
    tip(dot(L.latLng(46.81, -71.21), "place"), "Québec", "ink", "left", [-8, 0])
  ]);
  V.levy = tip(dot(L.latLng(46.80, -71.18), "place"), "Pointe-Lévy", "ink big", "right");
  V.quebec = L.layerGroup([
    tip(dot(L.latLng(46.80, -71.18), "place"), "Pointe-Lévy, Lauzon", "ink big", "right", [10, 0]),
    tip(anchor(L.latLng(46.814, -71.208)), "Québec", "ink", "left", [-8, -6])
  ]);
  V.lauzon = L.layerGroup([
    tip(dot(L.latLng(46.665, -71.355), "place"), "Saint-Nicolas", "ink", "left", [-8, 0]),
    tip(dot(L.latLng(46.715, -71.255), "place"), "Saint-Jean-Chrysostome", "ink", "bottom", [0, 8])
  ]);
  // ---------- Chapter V: the canals and ditches dig themselves (data/drainage.geojson) ----------
  const RUST = "#8b3a1a";
  const DLABEL = { "canal-1870": "the 1870 canal's right-of-way, as drawn in 1886", "barnum-ditch-1894": "Barnum's ditch, 1893–94", "county-ditch-14-1916": "County Ditch 14, 1916",
    "lateral-west-1927": "laterals, 1927", "lambert-lake-pond-2005": "the pond, 2005", "meander-2021": "the meander, 2021", "lambert-creek-today": "Lambert Creek today" };
  const drains = ((D.drainage && D.drainage.features) || []).filter(f => f.geometry).map(f => {
    const pr = f.properties, approx = /approx/i.test(pr.confidence || ""), g = f.geometry;
    const label = pr.short_label || DLABEL[pr.id] || (pr.id && /mock/.test(pr.traced_from || "") ? `${pr.label}, ${pr.year}` : "");
    if (g.type === "Polygon" || g.type === "MultiPolygon") {
      const poly = L.geoJSON(f, { style: { color: RUST, weight: 2.5, fillColor: "#3f7d8e", fillOpacity: .45, interactive: false } });
      const lab = label ? tip(anchor(poly.getBounds().getCenter()), label, "ink drain", "right", [12, 0]) : null;
      return { pr, year: +pr.year, poly, lab, group: L.layerGroup([poly]) };
    }
    const lines = g.type === "MultiLineString" ? g.coordinates : [g.coordinates];
    const path = pathOf(lines.flat().map(ll));
    const halo = L.polyline([], Object.assign({ color: HALO0, weight: 9, opacity: .8 }, { lineJoin: "round", lineCap: "round", interactive: false }));
    const line = L.polyline([], { color: RUST, weight: 4.5, opacity: 1, dashArray: approx ? "9 7" : null, lineJoin: "round", lineCap: "round", interactive: false });
    const mid = (pts => pts[pts.length - 1])(partial(path, 0.5));
    const lab = label ? tip(anchor(mid), label, "ink drain", "right", [10, 0]) : null;
    return { pr, year: +pr.year, path, halo, line, lab, group: L.layerGroup([halo, line]) };
  });
  V.drain = L.layerGroup(drains.map(d => d.group));
  V.drainLabels = L.layerGroup();
  // until: the last year drawn at the end of a step; earlier ones stay, faint, as the later ones are dug
  const DRAIN_UNTIL = { "ch-5": 1869, "v-depth": 1869, "drain-1870": 1870, "drain-1881": 1870, "drain-1894": 1894, "drain-1902": 1894, "drain-1916": 1927, "drain-1957": 1927, "drain-1974": 1927, "drain-2024": 2024 };
  function drainage(from, until, p) {
    for (const d of drains) {
      const fresh = d.year > from && d.year <= until, shown = d.year <= until;
      // the new ones of this step draw one after another over the first two thirds of it
      const news = drains.filter(x => x.year > from && x.year <= until), k = news.indexOf(d), n = news.length;
      const q = !shown ? 0 : !fresh ? 1 : RM ? 1 : smooth(p, 0.08 + 0.5 * k / Math.max(1, n), 0.08 + 0.5 * (k + 1) / Math.max(1, n));
      const op = fresh ? 1 : 0.45;
      if (d.path) {
        const pts = partial(d.path, q); d.line.setLatLngs(pts); d.halo.setLatLngs(pts);
        d.line.setStyle({ opacity: op }); d.halo.setStyle({ opacity: .8 * op });
      } else if (d.poly) d.poly.setStyle({ opacity: q * op, fillOpacity: .45 * q * op });
      if (d.lab) { const on = fresh && q > 0.5; if (on !== V.drainLabels.hasLayer(d.lab)) on ? V.drainLabels.addLayer(d.lab) : V.drainLabels.removeLayer(d.lab); }
    }
    // the 1855 water fades as the lake drains: full before the canal, nearly gone after Barnum's ditch
    const y = from + (until - from) * (RM ? 1 : smooth(p, 0.08, 0.6));
    lakeWater(y < 1870 ? LAKE_FILL : y >= 1900 ? 0.03 : LAKE_FILL + (0.03 - LAKE_FILL) * (y - 1870) / 30);
  }

  // ---------- the ending: the Lamberts of northern Minnesota, Mary, and Eric (data/descendants.json) ----------
  const DESC = (D.descendants || []).slice().sort((a, b) => (+a.gen || 0) - (+b.gen || 0));
  const placesOf = d => Array.isArray(d.places) ? d.places.filter(x => x && x.lat != null) : (d.lat != null ? [{ name: d.place, lat: d.lat, lon: d.lon }] : []);
  const ROUTINE = /census|household|listed|with his mother|at home|registration|still in/i;
  (function renderDesc() {
    document.querySelectorAll("ol.desc").forEach(ol => {
      const want = (ol.dataset.gens || "").split(",").map(Number);
      ol.innerHTML = DESC.filter(d => want.includes(+d.gen)).map(d => {
        let evs = (d.events || []).slice().sort((a, b) => (yrFirst(a.year) || 0) - (yrFirst(b.year) || 0));
        if (evs.length > 4) evs = evs.filter(e => !ROUTINE.test(e.text)).slice(0, 4);
        const ev = evs.map(e => `<li class="on"><span class="ey">${esc(e.year)}</span> ${esc(e.text)}${e.age != null && e.age !== "" ? ` <span class="age">age ${esc(e.age)}</span>` : ""}</li>`).join("");
        return `<li><div class="g-head"><b>${esc(shortName(d.name))}</b> <span class="g-yrs">${yrsOf(d)}</span></div>${d.life ? `<p class="g-life">${esc(d.life)}</p>` : ""}${d.life_basis ? `<p class="basis">${esc(d.life_basis)}</p>` : ""}${ev ? `<ul class="g-ev">${ev}</ul>` : ""}</li>`;
      }).join("");
    });
    // the sources, for the Sources section
    const ul = $("gen-sources"); if (ul) {
      const seen = new Set(), out = [];
      [...GENS, ...DESC].forEach(g => (g.sources || []).forEach(x => { const t = typeof x === "string" ? x : (x.citation || x.title || JSON.stringify(x)); if (!seen.has(t)) { seen.add(t); out.push(t); } }));
      ul.innerHTML = out.length ? out.map(t => `<li>${esc(t).replace(/(https?:\/\/[^\s,;)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')}</li>`).join("") : "<li>Being gathered.</li>";
    }
  })();
  // pins for a set of generations; one per place
  function descPins(gens) {
    const by = {};
    DESC.filter(d => gens.includes(+d.gen)).forEach(d => placesOf(d).forEach(x => { const k = (+x.lat).toFixed(3) + "," + (+x.lon).toFixed(3); (by[k] ||= { p: L.latLng(+x.lat, +x.lon), name: x.name }); }));
    const list = Object.values(by);
    return { list, layer: L.layerGroup(list.map(x => tip(dot(x.p, "place"), esc(String(x.name || "").replace(/\s*\(.*$/, "").replace(/, (Minnesota|Carlton County)$/, "")), "ink", "right"))) };
  }
  const PN = descPins([7, 8]), PC = descPins([9, 10]);
  V.pinsNorth = PN.layer; V.pinsCloquet = PC.layer;
  const boundsOf = (list, fb) => list.length ? L.latLngBounds(list.map(x => x.p)) : L.latLngBounds([fb, fb]);
  const housePt = pts.house || L.latLng(45.0595622, -93.0891043);
  const homeMiles = map.distance(housePt, islandCenter) / 1609.344;
  V.home = L.layerGroup([
    L.polyline([housePt, islandCenter], Object.assign({ color: HALO0, weight: 8, opacity: .8 }, { interactive: false, lineCap: "round" })),
    L.polyline([housePt, islandCenter], { color: "#8a2a22", weight: 3.5, opacity: 1, dashArray: "1 9", lineCap: "round", interactive: false }),
    tip(L.marker(housePt, { icon: L.divIcon({ className: "pin house", iconSize: [16, 16] }), interactive: false }), "3921 Woodview Ct", "ink seal", "left", [-10, 0]),
    tip(anchor(lerp(housePt, islandCenter, 0.5)), `${homeMiles.toFixed(2)} miles`, "ink", "top", [0, -6])
  ]);
  // Abraham's Park (the family's name for the county park at 2394 Edgerton St): its playground, on the 1849 farm
  const parkPt = L.latLng(45.01333, -93.07546);
  V.park = tip(L.marker(parkPt, { icon: L.divIcon({ className: "pin park", iconSize: [16, 16] }), interactive: false }), "Abraham's Park", "ink park", "right", [10, 0]);
  { const e = $("home-dist"); if (e) e.textContent = `about ${homeMiles.toFixed(2)} miles`; }

  // 1759: the British batteries on the Lévis heights, firing across at Quebec
  V.siege = L.layerGroup([
    L.polyline([[46.808, -71.170], [46.822, -71.195], [46.814, -71.212]], Object.assign({ color: "#8a2a22", weight: 3, opacity: .85, dashArray: "2 8" }, base)),
    L.polyline([[46.803, -71.160], [46.818, -71.190], [46.811, -71.207]], Object.assign({ color: "#8a2a22", weight: 3, opacity: .85, dashArray: "2 8" }, base)),
    tip(dot(L.latLng(46.805, -71.165), "place"), "Wolfe's guns, 1759", "ink seal", "bottom", [0, 8])
  ]);
  // Modeste's road west, 1838: schematic, the stops only (Quebec, Red River, Fort Vancouver, the Willamette)
  const oregonPts = [[46.81, -71.21], [45.5, -73.55], [46.3, -79.4], [48.4, -89.2], [49.6, -94.5], [49.89, -97.12], [52.1, -106.6], [53.5, -113.5], [52.6, -118.1], [49.0, -118.5], [46.2, -119.1], [45.62, -122.67]].map(c => L.latLng(c[0], c[1]));
  const oregonPath = pathOf(oregonPts);
  V.oregonLine = L.layerGroup([euLine(oregonPath, 12, HALO, .85), euLine(oregonPath, 5, INK, .95, "14 10")]);
  V.oregon = L.layerGroup([
    tip(dot(L.latLng(46.81, -71.21), "place"), "Quebec", "ink", "right"),
    tip(dot(L.latLng(49.89, -97.12), "place"), "Red River", "ink", "top", [0, -8]),
    tip(dot(L.latLng(45.62, -122.67), "place"), "Fort Vancouver", "ink", "right"),
    tip(dot(L.latLng(45.21, -122.98), "place"), "the Willamette settlement", "ink", "bottom", [0, 8])
  ]);

  // ---------- the journey: legs, drawn three ways (paper halo, the way still to come, the way travelled) ----------
  const legsAll = ((D.journey && D.journey.features) || []).filter(f => f.geometry && f.geometry.type === "LineString")
    .sort((a, b) => (a.properties.leg || 0) - (b.properties.leg || 0) || (a.properties.alternative ? 1 : -1));
  const isAlt = f => !!f.properties.alternative || /alternative/i.test(f.properties.confidence || "");
  const documented = f => /^documented/i.test(f.properties.confidence || "");
  const dash = (f, w) => documented(f) ? null : (w > 5 ? "20 12" : "14 10");
  const legInk = f => (/^(steam|boat|ship|canoe)/i.test(f.properties.mode || "") ? WATER : LAND);
  const mkLeg = f => {
    const latlngs = f.geometry.coordinates.map(ll), INK = legInk(f);
    return { f, path: pathOf(latlngs), done: 0,
      halo: L.polyline(latlngs, Object.assign({ color: HALO, weight: 11, opacity: .8 }, base)),
      todo: L.polyline(latlngs, Object.assign({ color: INK, weight: 3.5, opacity: .4, dashArray: dash(f, 3.5) }, base)),
      glow: L.polyline([], Object.assign({ color: HALO, weight: 15, opacity: .95 }, base)),
      poly: L.polyline([], Object.assign({ color: INK, weight: 6, opacity: 1, dashArray: dash(f, 6) }, base)) };
  };
  const legs = legsAll.filter(f => !isAlt(f)).map(mkLeg);
  const legByNo = {}; legs.forEach(l => legByNo[l.f.properties.leg] = l);
  const altLegs = legsAll.filter(isAlt).map(f => L.layerGroup([
    L.polyline(f.geometry.coordinates.map(ll), Object.assign({ color: HALO, weight: 12, opacity: .8 }, base)),
    L.polyline(f.geometry.coordinates.map(ll), Object.assign({ color: legInk(f), weight: 6, opacity: .85, dashArray: "0.1 13" }, base))]));
  V.routeUnder = L.layerGroup(legs.flatMap(l => [l.halo, l.todo]));
  V.routeDone = L.layerGroup(legs.flatMap(l => [l.glow, l.poly]));
  V.routeAlt = L.layerGroup(altLegs);

  V.cart = L.marker(legs.length ? legs[0].path.latlngs[0] : islandCenter, { pane: "traveller", icon: L.divIcon({ className: "cart", iconSize: [24, 24] }), interactive: false, zIndexOffset: 1000 });
  // ---------- the vehicle: the cart marker becomes the way they travelled on this stretch ----------
  const PAPER = "#f3ecda";
  const ICON = {
    boat: `<path d="M1.8 14.6h20.4l-3 4.4H4.8z"/><path d="M4.6 11.2h12.6v3.4H4.6z"/><path d="M14 4.6h2.4v6.6H14z"/><path d="M5.6 14.6a3.9 3.9 0 0 1 7.8 0z" fill="${PAPER}" stroke="currentColor" stroke-width="1.3"/><circle cx="18.2" cy="3.2" r="1.3"/><circle cx="20.6" cy="2.2" r=".9"/>`,
    stage: `<path d="M4.4 5.2h13.2v1.2H4.4z"/><path d="M4.2 6.4h13.6l1.6 8.4H2.6z"/><path d="M6.4 8.2h3.6v3H6.4zM11.8 8.2h3.6v3h-3.6z" fill="${PAPER}"/><circle cx="6.4" cy="18" r="2.9" fill="${PAPER}" stroke="currentColor" stroke-width="1.7"/><circle cx="16.8" cy="18" r="2.9" fill="${PAPER}" stroke="currentColor" stroke-width="1.7"/>`,
    rail: `<path d="M3.2 5.4h17.6v1.5H3.2z"/><path d="M4 6.9h16v8.6H4z"/><path d="M6 8.8h3v3H6zM10.5 8.8h3v3h-3zM15 8.8h3v3h-3z" fill="${PAPER}"/><circle cx="8" cy="17.4" r="2"/><circle cx="16" cy="17.4" r="2"/><path d="M1.5 20.2h21" stroke="currentColor" stroke-width="1.3"/>`,
    cart: `<circle cx="17" cy="14.2" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M17 8.6v11.2M11.4 14.2h11.2M13 10.2l8 8M21 10.2l-8 8" stroke="currentColor" stroke-width=".9"/><path d="M12.2 7.6h9.6v2.6h-9.6z"/><path d="M8.6 11.2l4-1.4" stroke="currentColor" stroke-width="1.3"/><path d="M1 10.6l1.5-1.6.9 1.1h4.6c1.4 0 2.2.9 2.2 2.2v1.6h-.8v3.6H8.2v-3.2H4.4v3.2H3.2v-3.4c-1-.3-1.7-1-1.8-1.9z"/>`,
    walk: `<circle cx="12.6" cy="3.6" r="2.1"/><path d="M12.4 7l-1.2 6.4-3 6.2M11.2 13.4l3.6 6M11.8 8.4l-3.6 3.4M12.4 8.6l3.6 2.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
    tent: `<path d="M2.4 19.4L12 4.4l9.6 15z"/><path d="M12 4.4V2.6" stroke="currentColor" stroke-width="1.2"/><path d="M9.6 19.4l2.4-6 2.4 6z" fill="${PAPER}"/>`,
    ship: `<path d="M2 15.2h20l-2.6 4.2H5.2z"/><path d="M11.4 2.4h1.3v12.8h-1.3z"/><path d="M12.9 3.6c3.4 1.4 5.8 4.4 6.4 9.6h-6.4z"/><path d="M11.2 4.4c-2.8 1.6-5 4.6-5.8 8.8h5.8z" opacity=".75"/><path d="M12.7 2.4l3 1-3 1z"/>`,
    canoe: `<path d="M1.2 13.4c3 2.6 6.8 3.8 10.8 3.8s7.8-1.2 10.8-3.8c-.4 2.4-1.2 3.6-2.4 4.4H3.6c-1.2-.8-2-2-2.4-4.4z"/><circle cx="9" cy="8.6" r="1.6"/><path d="M8.2 10.4h1.8l.6 4.4H7.6z"/><path d="M12.6 5.2l-4 13" stroke="currentColor" stroke-width="1.2"/><circle cx="15.6" cy="9.2" r="1.5"/><path d="M14.8 10.9h1.7l.6 3.9h-3z"/>`,
    house: `<path d="M2.6 11.6L12 4l9.4 7.6-1 1.2L12 6 3.6 12.8z"/><path d="M5 11.4L12 5.8l7 5.6v8H5z"/><path d="M10.4 14h3.2v5.4h-3.2z" fill="${PAPER}"/><path d="M15.4 5.4h1.8v3.4l-1.8-1.4z"/>`
  };
  const MODE_WORD = { ship: "sailing ship", canoe: "canoe", boat: "steamboat", stage: "stagecoach", rail: "railroad", cart: "ox cart", walk: "on foot", tent: "a stay" };
  const svgOf = (m, cls) => `<svg viewBox="0 0 24 24" fill="currentColor" class="${cls || ""}" aria-hidden="true">${ICON[m]}</svg>`;
  let vehicleNow = "";
  function vehicle(m) {
    if (!ICON[m] || m === vehicleNow) return; vehicleNow = m;
    V.cart.setIcon(L.divIcon({ className: "vehicle m-" + m, html: svgOf(m), iconSize: [38, 38], iconAnchor: [19, 19] }));
    V.cart.getElement && V.cart.getElement() && V.cart.getElement().setAttribute("title", MODE_WORD[m] || "");
  }
  vehicle("house");
  V.ship = L.marker(euSea.latlngs[0], { pane: "traveller", icon: L.divIcon({ className: "vehicle m-ship", html: svgOf("ship"), iconSize: [38, 38], iconAnchor: [19, 19] }), interactive: false, zIndexOffset: 1000 });
  let shipNow = "ship";
  function shipMode(m) { if (!m || m === shipNow) return; shipNow = m; V.ship.setIcon(L.divIcon({ className: "vehicle m-" + m, html: svgOf(m), iconSize: [38, 38], iconAnchor: [19, 19] })); }
  // where the way of travel changes inside a leg (the St. Lawrence rapids, the railroad at Niagara): named places,
  // matched to the nearest point of whatever route geometry the leg has
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
    const near = (la, ln) => { let bi = 0, bd = Infinity; l.path.latlngs.forEach((q, i) => { const d = map.distance(q, L.latLng(la, ln)); if (d < bd) { bd = d; bi = i; } }); return l.path.cum[bi] / l.path.len; };
    return legSpans[n] = [{ f: 0, m: sw.first }, ...sw.at.map(([la, ln, m]) => ({ f: near(la, ln), m }))].sort((a, b) => a.f - b.f);
  }
  function modeAt(e, f) {
    if (e.kind !== "travel") return /home|settled/i.test(e.mode || "") ? "house" : "tent";
    const sp = spansOf(e.leg); if (sp) { let m = sp[0].m; for (const x of sp) if (f >= x.f) m = x.m; return m; }
    return modeWord(e.mode);
  }
  V.modeMarks = L.layerGroup(legs.map(l => {
    const pts = partial(l.path, 0.5), at = pts[pts.length - 1];
    const sp = (() => { const n = l.f.properties.leg, sw = MODE_SWITCH[n]; return sw ? null : modeWord(l.f.properties.mode); })();
    return sp ? L.marker(at, { icon: L.divIcon({ className: "mode-mark m-" + sp, html: svgOf(sp), iconSize: [18, 18] }), interactive: false, keyboard: false }) : null;
  }).filter(Boolean));
  (() => { const t = $("hud-modes"); if (t) t.innerHTML = ["boat", "stage", "rail", "cart", "tent"].map(m => `<span class="m m-${m}">${svgOf(m)}${MODE_WORD[m]}</span>`).join(""); })();
  function setLegDone(l, p) { // p in [0,1] along the leg
    p = clamp01(p); if (p === l.done) return; l.done = p;
    const pts = partial(l.path, p); l.poly.setLatLngs(pts); l.glow.setLatLngs(pts);
  }
  const drawUpTo = n => legs.forEach(l => setLegDone(l, (l.f.properties.leg || 0) <= n ? 1 : 0));
  const placeFeats = (D.places && D.places.features) || [];
  const placeLayer = filter => L.layerGroup(placeFeats.filter(filter).map(f => tip(dot(ll(f.geometry.coordinates), "place"), f.properties.label, "ink", "right")));
  V.placesEarly = placeLayer(f => (f.properties.year || 0) <= 1842);
  V.placesLate = placeLayer(f => (f.properties.year || 0) > 1842);

  // ---------- the itinerary (data/itinerary.json) ----------
  const IT = (D.itinerary && D.itinerary.entries) || [];
  const itById = {}; IT.forEach(e => itById[e.id] = e);
  const isMockIt = !!(D.itinerary && D.itinerary.__source === "mock");
  const lastDate = s => { const parts = String(s || "").split("/"); return parseDate(parts[parts.length - 1]); };
  for (const e of IT) { e.t0 = lastDate(e.start_est); e.t1 = lastDate(e.end_est); if (e.t1 == null && e.t0 != null) e.t1 = e.t0 + ((+e.days_est) || 1) * DAY; if (e.t0 == null) e.t0 = e.t1; }
  const origin = IT.find(e => e.kind === "stay" && (e.mode === "home" || /lévis|levis/i.test(e.from || ""))) || IT[0];
  const depart = origin ? origin.t1 : null;
  // which part of a leg an entry covers: from the previous entry on that leg to the fraction nearest its destination
  const placeByLabel = {}; placeFeats.forEach(f => placeByLabel[f.properties.label] = ll(f.geometry.coordinates));
  const norm = t => String(t || "").toLowerCase().replace(/\s*\(.*$/, "").replace(/\s*\/.*$/, "").trim();
  const placeFor = name => { const n = norm(name); let best = null; for (const [lab, p] of Object.entries(placeByLabel)) { const m = norm(lab); if (n.startsWith(m) || m.startsWith(n)) if (!best || m.length > best.len) best = { p, len: m.length }; } return best && best.p; };
  const fracNear = (path, p) => { let bi = 0, bd = Infinity; path.latlngs.forEach((q, i) => { const d = map.distance(q, p); if (d < bd) { bd = d; bi = i; } }); return path.cum[bi] / path.len; };
  const legFrac = {};
  for (const e of IT) {
    if (e.kind !== "travel" || !e.leg || !legByNo[e.leg]) continue;
    const l = legByNo[e.leg], prev = IT.filter(x => x.kind === "travel" && x.leg === e.leg && x.t0 < e.t0).map(x => legFrac[x.id] ? legFrac[x.id][1] : 0);
    const a0 = prev.length ? Math.max(...prev) : 0;
    const dest = e.leg_segment ? placeFor(e.to) : null;
    const a1 = dest ? Math.max(a0, fracNear(l.path, dest)) : 1;
    legFrac[e.id] = [a0, e.leg_segment && IT.some(x => x.leg === e.leg && x.t0 > e.t0) ? a1 : 1];
  }
  // scroll weight per entry: a stay does not get a scroll-length proportional to its months
  // the St. Louis winter is an emphasized moment (its snow): it gets the scroll of a long stretch
  const WEIGHT = { "1841-11-st-louis-winter": 2.4 };
  const weight = e => WEIGHT[e.id] || (e.kind === "travel" ? 2 : (/documented/i.test(e.confidence || "") ? 1.4 : 0.6));
  function slice(ids, span) {
    const es = ids.map(id => itById[id]).filter(Boolean); if (!es.length) return null;
    const ws = es.map(weight), W = ws.reduce((x, y) => x + y, 0);
    let acc = 0; const at = es.map(e => { const a = acc / W; acc += weight(e); return [a, acc / W]; });
    return { es, at, span };
  }
  // local progress -> the entry in play and how far through it
  function locate(sl, p) {
    const u = sl.span[0] + (sl.span[1] - sl.span[0]) * clamp01(p);
    let i = sl.es.length - 1; for (let k = 0; k < sl.es.length; k++) if (u <= sl.at[k][1]) { i = k; break; }
    const [a, b] = sl.at[i], q = b > a ? clamp01((u - a) / (b - a)) : 1;
    return { e: sl.es[i], i, q };
  }
  function itinerary(ids, span, p) {
    const sl = slice(ids, span); if (!sl) return;
    const { e: cur, i, q } = locate(sl, p);
    // the route: earlier legs done, earlier entries of this slice done, this one by q
    const firstLeg = Math.min(...IT.filter(x => x.leg).map(x => x.leg));
    const minLeg = Math.min(...sl.es.filter(x => x.leg).map(x => x.leg), Infinity);
    legs.forEach(l => { const n = l.f.properties.leg; if (n < minLeg) setLegDone(l, 1); else if (n >= firstLeg && n > Math.max(...sl.es.filter(x => x.leg).map(x => x.leg), 0)) setLegDone(l, 0); });
    for (let k = 0; k < i; k++) { const x = sl.es[k]; if (x.kind === "travel" && legByNo[x.leg]) setLegDone(legByNo[x.leg], legFrac[x.id][1]); }
    let cartAt = null;
    if (cur.kind === "travel" && legByNo[cur.leg]) {
      const l = legByNo[cur.leg], [a0, a1] = legFrac[cur.id], f = a0 + (a1 - a0) * q;
      setLegDone(l, f);
      const pts = partial(l.path, Math.max(1e-6, f)); cartAt = pts[pts.length - 1];
      vehicle(modeAt(cur, f));
    } else {
      vehicle(modeAt(cur, 0));
      const here = stayAt(cur, travelIT.filter(x => x.t0 <= cur.t0).pop()); if (here) cartAt = here;
      // later legs in this slice are still to come
      for (let k = i + 1; k < sl.es.length; k++) { const x = sl.es[k]; if (x.kind === "travel" && legByNo[x.leg]) setLegDone(legByNo[x.leg], legFrac[x.id][0]); }
    }
    if (cartAt) V.cart.setLatLng(cartAt);
    // the date mark
    const now = cur.t0 + (cur.t1 - cur.t0) * q;
    const daysOut = depart != null ? Math.max(0, Math.round((now - depart) / DAY)) : null;
    let dayLine = daysOut != null ? `<br><b>Day ${daysOut}</b> since Lévis` : "";
    // the 1845 trail south has its own count: day n of about N on the carts
    const trail = IT.filter(x => x.kind === "travel" && /^1845-/.test(x.id));
    if (cur.kind === "travel" && trail.includes(cur) && trail.length) {
      const t0 = trail[0].t0, total = Math.round((trail[trail.length - 1].t1 - t0) / DAY), n = Math.max(1, Math.round((now - t0) / DAY));
      dayLine += `; day ${Math.min(n, total)} of about ${total} on the trail`;
    }
    if (cur.kind === "stay") {
      const y0 = new Date(cur.t0).getUTCFullYear(), y1 = new Date(cur.t1).getUTCFullYear();
      const d = Math.round((cur.t1 - cur.t0) / DAY);
      const how = d >= 330 ? `about ${Math.round(d / 365)} year${Math.round(d / 365) > 1 ? "s" : ""}` : d >= 45 ? `about ${Math.round(d / 30.4)} months` : `about ${Math.max(1, d)} day${d > 1 ? "s" : ""}`;
      const place = (cur.to || cur.id).replace(/\s*\(.*$/, "").replace(/\s*\/.*$/, "");
      datemark(y0 === y1 ? String(y0) : `${y0}–${String(y1).slice(2)}`, `<b>${place}</b>, ${how}${dayLine}`, true);
    } else {
      datemark(String(new Date(now).getUTCFullYear()), `about ${fmtDate(now)}${dayLine}`, true);
    }
    $("dm-sub").title = (cur.basis || "") + (cur.note ? " " + cur.note : "");
    return { cur, q, now };
  }
  // ---------- the camera ----------
  const W = () => map.getSize().x, H = () => map.getSize().y;
  // where the words are decides which side of the screen the subject should keep clear
  function padFor(pos) {
    if (phone()) return { paddingTopLeft: [16, 70], paddingBottomRight: [16, 16] };
    const w = Math.min(600, W() * 0.42);
    if (pos === "right") return { paddingTopLeft: [80, 150], paddingBottomRight: [w, 70] };
    if (pos === "bottom") return { paddingTopLeft: [80, 150], paddingBottomRight: [80, Math.min(360, H() * 0.42)] };
    if (pos === "center") return { paddingTopLeft: [80, 150], paddingBottomRight: [80, 70] };
    return { paddingTopLeft: [w, 150], paddingBottomRight: [80, 70] };
  }
  function offsetFor(pos) { // pixels to shift a centre view so the subject sits in the open side
    if (phone()) return [0, -H() * 0.1];
    if (pos === "right") return [-W() * 0.17, 0];
    if (pos === "bottom") return [0, -H() * 0.14];
    if (pos === "center") return [0, 0];
    return [W() * 0.17, 0];
  }
  const shift = (v, pos) => { const o = offsetFor(pos); return { center: map.unproject(map.project(v.center, v.zoom).subtract(o), v.zoom), zoom: v.zoom }; };
  const VIEWS = {
    ring: () => ({ bounds: lakeBounds.pad(0.18), maxZoom: 16 }),
    ringWide: () => ({ bounds: lakeBounds.pad(0.5), maxZoom: 15.5 }),
    continent: () => ({ bounds: L.latLngBounds([[40.5, -99], [49.5, -66]]) }),
    atlantic: () => ({ bounds: L.latLngBounds([[41, -76], [53, 6]]) }),
    huron: () => ({ bounds: L.latLngBounds([[43.8, -82], [47.6, -70]]) }),
    boulogne: () => ({ center: L.latLng(50.2, 1.0), zoom: phone() ? 6 : 6.8 }),
    levy: () => ({ center: L.latLng(46.78, -71.25), zoom: phone() ? 7.6 : 8.4 }),
    quebec: () => ({ center: L.latLng(46.72, -71.35), zoom: phone() ? 7 : 7.8 }),
    lauzon: () => ({ center: L.latLng(46.74, -71.27), zoom: phone() ? 8.6 : 9.4 }),
    west: () => ({ bounds: L.latLngBounds([[41, -126], [55, -67]]) }),
    overview: () => ({ bounds: legs.length ? L.latLngBounds(legs.flatMap(l => l.path.latlngs)).pad(0.1) : L.latLngBounds([[38, -98], [50, -70]]) }),
    arrive: () => ({ center: farmBounds.getCenter(), zoom: phone() ? 12 : 13 }),
    island: () => ({ bounds: islandBounds.pad(0.35), maxZoom: 16.5 }),
    gervais: () => ({ bounds: B(farmBounds).extend(louisBounds).pad(0.6), maxZoom: 15.5 }),
    littleCanada: () => ({ bounds: B(farmBounds).extend(louisBounds).extend(churchPt).pad(0.3), maxZoom: 15 }),
    both: () => ({ bounds: B(islandBounds).extend(farmBounds).extend(louisBounds).pad(0.15) }),
    frame: () => ({ bounds: lakeBounds.pad(0.45), maxZoom: 15 }),
    // northern Minnesota: the Minnesota pins only (David's 1893 marriage in Quebec stays off this frame)
    north: () => ({ bounds: boundsOf(PN.list.filter(x => x.p.lng < -89 && x.p.lng > -98), L.latLng(47.5, -93)).pad(0.15), maxZoom: 9 }),
    cloquet: () => ({ center: L.latLng(46.7222, -92.4612), zoom: phone() ? 12 : 13 }),
    park: () => ({ bounds: B(farmBounds).extend(parkPt).pad(0.45), maxZoom: 16 }),
    home: () => ({ bounds: L.latLngBounds([housePt, islandCenter]).extend(islandBounds).pad(0.35), maxZoom: 16 }),
    lakeWide: () => ({ bounds: lakeBounds.pad(0.9), maxZoom: 14.5 })
  };
  const viewCache = {};
  function resolve(key, pos) {
    const ck = key + "|" + pos; if (viewCache[ck]) return viewCache[ck];
    const v = VIEWS[key]();
    let out;
    if (v.bounds) { const cz = map._getBoundsCenterZoom(v.bounds, Object.assign({ maxZoom: v.maxZoom || 18 }, padFor(pos))); out = { center: cz.center, zoom: cz.zoom }; }
    else out = shift({ center: v.center, zoom: v.zoom }, pos);
    return viewCache[ck] = out;
  }
  // Leaflet's flyTo curve (van Wijk and Nuij) as a function of t in [0, 1]
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
  // keyframes [{at, view}] -> a function of progress
  function keyframePath(frames) {
    const segs = [];
    for (let i = 1; i < frames.length; i++) segs.push({ a: frames[i - 1].at, b: frames[i].at, f: flyPath(frames[i - 1].view, frames[i].view) });
    return p => {
      if (!segs.length) return frames[0].view;
      if (p <= segs[0].a) return frames[0].view;
      for (const s of segs) if (p <= s.b) return s.f(s.b > s.a ? (p - s.a) / (s.b - s.a) : 1);
      return frames[frames.length - 1].view;
    };
  }
  let camFn = null, camKey = "", camLast = "";
  // the journey's follow loop: a target set from scroll, the camera easing toward it every frame
  let camCur = null, camTgt = null, camRAF = 0;
  LL.camLog = null; // set to [] to record [zoom, step, entry] per applied frame (tests)
  function applyView(c) {
    if (LL.camLog) LL.camLog.push([+c.zoom.toFixed(4), followStep, followEntry]);
    if (!map._loaded) return map.setView(c.center, c.zoom, { animate: false });
    const zoomChanged = map.getZoom() !== c.zoom;
    map._moveStart(true, false)._move(c.center, c.zoom);
    // _move with the same zoom shifts the pixel origin but fires no 'zoom', and the tile layers only re-place their
    // tiles on 'zoom'/'viewreset': without this the routes would slide over a map that stays put
    if (!zoomChanged) map.fire("zoom");
    map._moveEnd(true);
  }
  let followStep = -1, followEntry = "", curStep = 0, travellerOp = 1;
  function follow(t) {
    camTgt = t; camKey = ""; camLast = "";
    if (!camCur) camCur = { center: map.getCenter(), zoom: map.getZoom() };
    if (RM) { camCur = t; applyView(t); return; }
    if (!camRAF) camRAF = requestAnimationFrame(followTick);
  }
  function followTick() {
    camRAF = 0; if (!camTgt) return;
    // zoom follows the target directly (it is already eased along the route, so it never turns back inside a
    // stretch); only the centre is low-passed, which absorbs the shift when the words change sides
    const kc = 0.14, kz = 1, a = camCur, b = camTgt;
    const zoom = a.zoom + (b.zoom - a.zoom) * kz;
    const center = L.latLng(a.center.lat + (b.center.lat - a.center.lat) * kc, a.center.lng + (b.center.lng - a.center.lng) * kc);
    const done = Math.abs(b.zoom - zoom) < 0.003 && map.project(b.center, zoom).distanceTo(map.project(center, zoom)) < 0.6;
    camCur = done ? b : { center, zoom };
    applyView(camCur);
    if (!done) camRAF = requestAnimationFrame(followTick);
  }
  function direct(v) {
    if (camRAF) { cancelAnimationFrame(camRAF); camRAF = 0; } camTgt = null; camKey = "";
    const sig = v.center.lat.toFixed(7) + v.center.lng.toFixed(7) + v.zoom.toFixed(4);
    camCur = v; if (sig === camLast) return; camLast = sig;
    applyView(v);
  }
  function camera(key, frames, p) {
    if (camRAF) { cancelAnimationFrame(camRAF); camRAF = 0; } camTgt = null;
    if (key !== camKey) { camKey = key; camFn = keyframePath(frames); }
    const c = camFn(RM ? 1 : p);
    camCur = c;
    const sig = c.center.lat.toFixed(6) + c.center.lng.toFixed(6) + c.zoom.toFixed(3);
    if (sig === camLast) return; camLast = sig;
    // Not setView: an unanimated setView is a view *reset*, and a reset ("viewprereset") makes every tile layer
    // throw away all its tiles. Under scroll that happened every frame, and when the zoom crossed a tile level
    // nothing was cached for the new level, so every raster went blank at once while the vectors stayed.
    // A plain move keeps the old level's tiles on screen until the new level's have loaded, as flyTo does.
    applyView(c);
  }

  // ---------- states, one per step ----------
  const ALL = Object.keys(V);
  function vectors(on) {
    const set = new Set(on);
    for (const k of ALL) { const has = map.hasLayer(V[k]); if (set.has(k) && !has) V[k].addTo(map); else if (!set.has(k) && has) map.removeLayer(V[k]); }
  }
  function mapOn(on) { el.classList.toggle("on", on); }
  const full = () => islandSet(island.ring);
  const J = C.journeyBase;
  const JV = ["routeUnder", "routeDone", "modeMarks", "placesEarly"];
  // each act: base (keys, bottom first), years ([{year, opacity}]), view, cam [start,end], enter(), progress(p)
  const LZ = () => { mapOn(true); vectors(["quebec", "lauzon"]); hudLayer(baseText(J.overview, "The Lauzon shore, across the St. Lawrence from Quebec")); legend(false); };
  const OR = draw => { mapOn(true); vectors(["oregon", "oregonLine"]); if (!draw) euDraw(V.oregonLine, oregonPath, 1); hudLayer("Quebec to the Oregon Country, the missionaries' road, approximate. Modern base map, Esri"); legend(false); };
  let ringDrawn = false;
  let trailEnd = null;
  function trailStage(end) {
    if (end === trailEnd) return; trailEnd = end; mapOn(true);
    if (end) { vectors(["routeUnder", "routeDone", "placesLate", "cart", "farm"]); hudLayer("Lake Gervais and section 8 on the government survey plat. MnGeo / Minnesota Historical Society"); legend(false); }
    else { vectors([...JV, "routeAlt", "placesLate", "cart"]); hudLayer(baseText(J.trail, "South by the Woods Trail" + (altLegs.length ? "; dotted, the plains road" : ""))); legend(true); }
  }
  const ACTS = {
    ring: { base: "physical", years: [1856], view: "ring", enter() {
        mapOn(true); vectors(["lake", "island"]); hudLayer(PLAT); legend(false);
        if (ringDrawn || RM) { full(); if (!map.hasLayer(V.islandFill)) V.islandFill.addTo(map); return; }
        ringDrawn = true; const t0 = performance.now();
        const tick = now => { const q = smooth((now - t0) / 2600, 0, 1); islandSet(partial(island.path, q)); if (q < 1) requestAnimationFrame(tick); else V.islandFill.addTo(map); };
        requestAnimationFrame(tick);
      } },
    title: { base: "physical", years: [1856], view: "ringWide", enter() { mapOn(true); vectors(["lake", "island", "islandFill", "islandLabel"]); full(); hudLayer(PLAT); legend(false); } },
    "ch-0": { base: "physical", years: [], view: "boulogne", cam: [0, 0.6], enter() { mapOn(true); vectors(["euPlaces"]); euDraw(V.euSea, euSea, 0); hudLayer("Modern base map, Esri"); legend(false); } },
    "eu-france": { base: "physical", years: [], view: "boulogne", enter() { mapOn(true); vectors(["euPlaces"]); euDraw(V.euSea, euSea, 0); hudLayer("Boulogne and the Channel coast. Modern base map, Esri"); legend(false); } },
    // the crossing: the ship stays mid-screen and the ocean scrolls under it
    "eu-sea": { base: "physical", years: [], enter() { mapOn(true); vectors(["euPlaces", "euSea", "ship"]); shipMode("ship"); hudLayer("Boulogne to Quebec, reconstructed: the Atlantic, the Strait of Belle Isle, the Gulf and the river. Modern base map, Esri"); legend(false); },
      track(p, i) {
        const K = euKnots(), f = warp(clamp01((p - 0.06) / 0.88), [[0, 0], [0.14, K.fa], [0.5, K.fb], [1, 1]]);
        const zoom = f < K.fa ? 6.2 + (4.3 - 6.2) * smooth(f, 0, K.fa) : 4.3 + (7.4 - 4.3) * smooth(f, K.fb, 1);
        let v = aimView({ center: at(euSea, f), zoom }, aimAt(i, p));
        if (p < 0.06) v = lerpView(endView(i - 1), v, smooth(p, 0, 0.06));
        return { view: v, pos: at(euSea, f), mode: "ship", draw: () => euDraw(V.euSea, euSea, f) };
      } },
    // up the rivers to the Huron mission by canoe, then back down to Pointe-Lévy
    "eu-levy": { base: J.overview, years: [], view: "levy", enter() { mapOn(true); vectors(["euPlaces", "euSea", "euHuron", "levy", "ship"]); euDraw(V.euSea, euSea, 1); shipMode("canoe"); hudLayer(baseText(J.overview, "Quebec to Sainte-Marie among the Hurons by the canoe route, reconstructed, and Pointe-Lévy")); legend(false); },
      track(p, i) {
        const f = clamp01((p - 0.04) / 0.5);
        const zoom = 7.4 + (6.1 - 7.4) * smooth(f, 0, 0.3);
        let v = aimView({ center: at(euHuron, f), zoom }, aimAt(i, p));
        if (p < 0.04) v = lerpView(endView(i - 1), v, smooth(p, 0, 0.04));
        // then back down the rivers to Pointe-Lévy: the canoe returns along the same way, the camera on it,
        // zooming in only near the end (one direction, so the zoom never turns back)
        const back = RM ? 1 : smooth(p, 0.6, 0.92);
        if (back > 0) {
          const pos = at(euHuron, 1 - back), z = 6.1 + (VIEWS.levy().zoom - 6.1) * smooth(back, 0.55, 1);
          return { view: aimView({ center: pos, zoom: z }, aimAt(i, p)), pos, mode: "canoe", draw: () => euDraw(V.euHuron, euHuron, 1) };
        }
        return { view: v, pos: at(euHuron, f), mode: "canoe", draw: () => euDraw(V.euHuron, euHuron, f) };
      } },
    "ch-1": { base: J.overview, years: [], view: "quebec", cam: [0, 0.6], enter() { mapOn(true); vectors(["quebec"]); hudLayer(baseText(J.overview, "The St. Lawrence at Quebec")); legend(false); } },
    "l-gens": { base: J.overview, years: [], view: "lauzon", cam: [0, 0.3], enter: LZ,
      yearFn(p) {
        const g = genAt(p), Y = Math.floor(g.y); strip(g);
        const siege = Y >= 1758 && Y <= 1760;
        if (siege !== map.hasLayer(V.siege)) siege ? V.siege.addTo(map) : map.removeLayer(V.siege);
        if (!RM) ageBase(1 - (g.y - 1673) / (1792 - 1673));
        const end = p >= G_P1;
        return { y: g.y, phase: g.phase, text: end ? "1792" : String(Math.min(1792, Y)), rolling: p > G_P0 && !end && !siege && g.to - g.from > 1,
          sub: siege ? "the siege of Quebec" : g.x ? `the ${ORD[+g.x.g.gen] || ""} generation: ${esc(firstName(g.x.g.name))}` : "six generations on one shore" };
      } },
    "l-marriage": { base: J.overview, years: [], view: "lauzon", enter: LZ },
    "l-cholera": { base: J.overview, years: [], view: "lauzon", enter: LZ },
    "l-modeste": { base: "physical", years: [], view: "west", cam: [0, 0.3], enter() { OR(true); }, progress(p) { euDraw(V.oregonLine, oregonPath, RM ? 1 : smooth(p, 0.08, 0.45)); } },
    "ch-2": { base: J.overview, years: [], view: "overview", cam: [0, 0.6], enter() { mapOn(true); vectors(JV); drawUpTo(0); hudLayer(baseText(J.overview, "1841–45, from Lower Canada to Red River to Little Canada")); legend(true); } },
    "j-lawrence": { base: J.overview, years: [], enter() { mapOn(true); vectors([...JV, "cart"]); hudLayer(baseText(J.overview, "1841. The St. Lawrence and the Great Lakes")); legend(true); } },
    "j-stlouis": { base: J.trail, years: [], enter() { ACTS["j-lawrence"].enter(); hudLayer(baseText(J.trail, "Chicago to St. Louis")); } },
    "j-stpaul": { base: J.trail, years: [], enter() { ACTS["j-lawrence"].enter(); hudLayer(baseText(J.trail, "Up the Mississippi")); } },
    "j-redriver": { base: J.trail, years: [], enter() { ACTS["j-lawrence"].enter(); hudLayer(baseText(J.trail, "North to Red River")); } },
    "j-boniface": { base: J.trail, years: [], enter() { ACTS["j-lawrence"].enter(); hudLayer(baseText(J.trail, "St. Boniface, across the Red from Fort Garry")); } },
    // the trail south, and at the end the camera comes down onto the farm at Lake Gervais on the survey plat
    "j-trail": { base: J.trail, years: [{ year: 1856, opacity: RM ? 1 : 0 }], view: "arrive", viewAt: [0.8, 0.96],
      enter() { trailEnd = null; trailStage(RM); },
      progress(p) { trailStage(RM || p > 0.86); if (RM) return; const f = smooth(p, 0.86, 0.96); setYearOpacity(1856, f); for (const k of J.trail) if (k !== "physical" && bases[k] && liveBases.has(k)) bases[k].setOpacity(1 - f); for (const k in UNDER) if (UNDER[k] && k !== "physical" && J.trail.includes(k)) UNDER[k].setOpacity(1 - f); } },
    "ch-3": { base: "physical", years: [1856], view: "island", cam: [0.05, 0.95], enter() { mapOn(true); vectors(["island"]); islandSet([]); hudLayer(PLAT); legend(false); } },
    island: { base: "physical", years: [1856], view: "island", enter() { mapOn(true); vectors(["island"]); hudLayer(PLAT); legend(false); },
      progress(p) { islandSet(partial(island.path, RM ? 1 : smooth(p, 0.05, 0.6))); } },
    "island-patent": { base: "physical", years: [1856], view: "island", enter() { mapOn(true); vectors(["island", "islandFill"]); full(); hudLayer(PLAT); legend(false); } },
    "island-lots": { base: "physical", years: [1856], view: "island", enter() { mapOn(true); vectors(["island", "islandFill", "lots"]); full(); hudLayer(PLAT); legend(false); } },
    "ch-4": { base: "physical", years: [1856], view: "gervais", cam: [0.05, 0.95], enter() { mapOn(true); vectors(["farm"]); hudLayer("Government survey plat of T29N R22W: Lake Gervais. MnGeo / Minnesota Historical Society"); legend(false); } },
    "lc-farm": { base: "physical", years: [1856], view: "gervais", enter() { ACTS["ch-4"].enter(); vectors(["farm", "farmLabel"]); } },
    "lc-church": { base: "physical", years: [1856], view: "littleCanada", cam: [0, 0.5], enter() { ACTS["ch-4"].enter(); vectors(["farm", "farmLabel", "church"]); } },
    "lc-chair": { base: "physical", years: [1856], view: "littleCanada", enter() { ACTS["lc-church"].enter(); } },
    "lc-louis": { base: "physical", years: [1856], view: "gervais", cam: [0, 0.5], enter() { ACTS["ch-4"].enter(); vectors(["farm", "farmLabel", "louis", "louisLabel", "church"]); } },
    "lc-island": { base: "physical", years: [1867], view: "ringWide", cam: [0, 0.55], enter() { mapOn(true); vectors(["island"]); full(); hudLayer(yearText(1867)); legend(false); } },
    "lc-death": { base: "physical", years: [1856], view: "littleCanada", cam: [0, 0.55], enter() { ACTS["ch-4"].enter(); vectors(["farm", "farmLabel", "church"]); } },
    "ch-5": { base: "physical", years: [1856], view: "frame", cam: [0.05, 0.95], enter() { mapOn(true); vectors(["lake", "lakeLabel"]); hudLayer(PLAT); legend(false); } },
    "v-depth": { base: "physical", years: [1856], view: "frame", enter() { mapOn(true); vectors(["lake", "lakeLabel"]); hudLayer(PLAT); legend(false); } },
    "drain-1870": drain(1867, 1856),
    "drain-1881": { base: "physical", years: [1886], view: "frame", cam: [0, 0.55], enter() { mapOn(true); vectors(["lake", "lakeLabel"]); hudLayer(yearText(1886)); legend(false); } },
    "drain-1894": { base: "physical", years: [1886], view: "frame", enter() { mapOn(true); vectors(["lake", "lakeLabel"]); hudLayer(yearText(1886)); legend(false); } },
    "drain-1902": drain(1902, 1886),
    "drain-1916": drain(1940, 1902),
    "drain-1957": drain(1957, 1940),
    "drain-1974": drain(1974, 1957),
    "drain-2024": drain(2024, 1974),
    "ch-6": { base: "physical", years: [2024], view: "lakeWide", cam: [0.05, 0.95], enter() { mapOn(true); vectors(["lake", "island", "islandLabel"]); full(); hudLayer(yearText(2024)); legend(false); } },
    name: { base: "physical", years: [2024], view: "lakeWide", enter() { ACTS["ch-6"].enter(); } },
    line: { base: "physical", years: [2024], view: "lakeWide", enter() { ACTS["ch-6"].enter(); } },
    "d-north": { base: "physical", years: [], view: "north", cam: [0, 0.6], enter() { mapOn(true); vectors(["pinsNorth"]); hudLayer("Modern base map, Esri"); legend(false); } },
    "d-cloquet": { base: "imagery", years: [], view: "cloquet", cam: [0, 0.6], enter() { mapOn(true); vectors(["pinsCloquet"]); hudLayer("Cloquet and Dunlap Island. Modern base map, Esri"); legend(false); } },
    "d-mary": { base: "physical", years: [2024], view: "home", cam: [0, 0.6], enter() { mapOn(true); vectors(["lake", "island", "islandFill", "islandLabel"]); full(); hudLayer("Modern base map, Esri"); legend(false); } },
    "d-park": { base: "imagery", years: [2024], view: "park", cam: [0, 0.6], enter() { mapOn(true); vectors(["farm", "farmLabel", "park"]); hudLayer(yearText(2024) + "; Esri imagery around it. Abraham's farm, lots 1 and 2, from the 1849 patent"); legend(false); } },
    "d-eric": { base: "physical", years: [2024], view: "home", cam: [0, 0.6], enter() { mapOn(true); vectors(["lake", "island", "islandFill", "islandLabel", "home"]); full(); hudLayer(yearText(2024)); legend(false); } },
    "line-out": { base: "physical", years: [2024], view: "lakeWide", enter() { ACTS["ch-6"].enter(); } }
  };
  function drain(year, prev) {
    return { base: "physical", years: [{ year: prev }, { year, opacity: RM ? 1 : 0 }], view: "frame",
      enter() { mapOn(true); vectors(["lake", "lakeLabel"]); hudLayer(yearText(year)); legend(false); },
      progress(p) { if (!RM) setYearOpacity(year, smooth(p, 0.05, 0.55)); } };
  }

  // ---------- six generations on one shore: the ribbon (data/generations.json) ----------
  // Eustache's narrative beats, into the prologue
  (function beats() {
    const B = (GENS[0] && GENS[0].beats) || [];
    document.querySelectorAll(".beats[data-beats]").forEach(el => {
      el.innerHTML = el.dataset.beats.split(",").map(Number).filter(k => B[k]).map(k => `<div class="beat"><h4>${esc(B[k].title)}</h4><p>${esc(B[k].text)}</p>${B[k].basis ? `<p class="basis">${esc(B[k].basis)}</p>` : ""}</div>`).join("");
    });
  })();
  // One slow turn of the seasons per generation, spring to winter, keyed to the scroll through that generation's
  // share of the step (each gets the same share, so each year-turn reads at the same pace). A generation's span runs
  // from its birth (Gabriel's from 1673, when he inherits) to the next one's; Abraham's is 1792, the year he is born.
  const G_P0 = 0.05, G_P1 = 0.95;
  const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth"];
  const firstName = n => shortName(n).replace(/\s*\(.*$/, "").replace(/\s*".*$/, "").replace(/\s+Lambert.*$/, "").replace(/^(\S+)\s+\(tree:.*$/, "$1");
  const GRACE = GENS.filter(g => +g.gen >= 2 && yrFirst(g.born)).map(g => ({ g, born: yrFirst(g.born) }));
  GRACE.forEach((x, k) => { x.from = Math.max(1673, x.born); x.to = k < GRACE.length - 1 ? Math.max(x.from, GRACE[k + 1].born) : x.from + 0.999; });
  function genAt(p) {
    const n = GRACE.length; if (!n) return { y: 1673 + 119 * clamp01(p), phase: 0.3, k: -1, from: 1673, to: 1792 };
    const u = clamp01((p - G_P0) / (G_P1 - G_P0)) * n, k = Math.min(n - 1, Math.floor(u)), local = u - k, x = GRACE[k];
    return { y: x.from + (x.to - x.from) * local, phase: Math.min(0.999, local), k, local, x, from: x.from, to: x.to };
  }
  // the generation ribbon: a strip along the bottom of the map that slides as the years advance; the current
  // generation sits on the middle line, the earlier ones recede to the left
  const WORLD = /general reference/i, BIG = /siege|war\b|war of|treaty|fleet|army|occupation|rebellion|cholera|peace|wolfe|royal|lower canada/i;
  const clip = t => { t = String(t || "").split(/;\s|\s\(|:\s(?=[a-z])/)[0]; return t.length > 74 ? t.slice(0, 72).replace(/\s+\S*$/, "") + "…" : t; };
  function worldEvents(g) {
    const evs = (g.events || []).filter(e => yrFirst(e.year) != null).sort((a, b) => yrFirst(a.year) - yrFirst(b.year));
    const pick = evs.filter(e => WORLD.test(e.source || ""));
    for (const e of evs) if (pick.length < 2 && !pick.includes(e) && BIG.test(e.text)) pick.push(e);
    return pick.slice(0, 2).sort((a, b) => yrFirst(a.year) - yrFirst(b.year));
  }
  const stripEl = $("gen-strip"), trackEl = $("gs-track"), segs = [];
  if (trackEl) {
    trackEl.innerHTML = GRACE.map(x => `<li class="gs-seg"><div class="gs-head"><b>${esc(firstName(x.g.name))}</b> <span class="g-yrs">${yrsOf(x.g)}</span></div><ul>${worldEvents(x.g).map(e =>
      `<li data-y="${yrFirst(e.year)}"><span class="ey">${esc(e.year)}</span> ${esc(clip(e.text))}${e.age != null && e.age !== "" ? ` <span class="age">age ${esc(e.age)}</span>` : ""}</li>`).join("")}</ul></li>`).join("");
    trackEl.querySelectorAll(".gs-seg").forEach(li => segs.push({ li, ev: Array.from(li.querySelectorAll("li[data-y]")).map(e => ({ e, y: +e.dataset.y })) }));
  }
  const genStripH = () => (phone() ? 96 : 128);
  let stripSig = "";
  function strip(g) {
    if (!trackEl || !segs.length || g.k < 0) return;
    const sw = segs[0].li.offsetWidth || 380, x = W() / 2 - (g.k + g.local) * sw;
    trackEl.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
    const sig = g.k + "|" + Math.floor(g.y);
    if (sig === stripSig) return; stripSig = sig;
    segs.forEach((s, k) => { s.li.classList.toggle("now", k === g.k); s.li.classList.toggle("past", k < g.k); s.li.classList.toggle("later", k > g.k);
      s.ev.forEach(e => e.e.classList.toggle("on", k < g.k || e.y <= g.y)); });
  }
  // the base map ages with the years: older and browner at 1673, the Burr map's own look by 1792
  let ageNow = 0;
  function ageBase(a) {
    a = Math.round(clamp01(a) * 20) / 20; if (a === ageNow) return; ageNow = a;
    map.getPane("base").style.filter = a ? `sepia(${(.55 + .4 * a).toFixed(2)}) saturate(${(.45 - .25 * a).toFixed(2)}) brightness(${(1.04 - .06 * a).toFixed(2)}) contrast(${(.88 + .1 * a).toFixed(2)})` : "";
    map.getPane("period").style.filter = a ? `contrast(${(1.32 - .22 * a).toFixed(2)}) saturate(${(.95 - .6 * a).toFixed(2)}) sepia(${(.65 * a).toFixed(2)}) brightness(${(.97 - .05 * a).toFixed(2)})` : "";
  }

  // labels that would sit on top of one another: the earlier one in the file wins
  const labelLayers = () => ["placesEarly", "placesLate", "quebec", "lauzon", "oregon"].flatMap(k => map.hasLayer(V[k]) ? V[k].getLayers() : []);
  let declutterPending = 0;
  function declutter() {
    declutterPending = 0;
    const taken = [];
    for (const m of labelLayers()) {
      const tt = m.getTooltip && m.getTooltip(); const e = tt && tt.getElement(); if (!e) continue;
      e.style.visibility = "visible";
      const r = e.getBoundingClientRect();
      const hit = taken.some(q => !(r.right < q.left - 12 || r.left > q.right + 12 || r.bottom < q.top - 4 || r.top > q.bottom + 4));
      if (hit) e.style.visibility = "hidden"; else taken.push(r);
    }
  }
  map.on("moveend zoomend layeradd", () => { if (!declutterPending) declutterPending = setTimeout(declutter, 60); });

  // ---------- drive it ----------
  const steps = Array.from(document.querySelectorAll("#steps .step"));
  // the year a step leaves the counter at: its own date, or for a journey step the last of its itinerary
  steps.forEach(st => { const d = st.dataset; if (d.it && !d.end) { const t = Math.max(...d.it.split(",").map(id => itById[id] ? itById[id].t1 : -Infinity)); if (isFinite(t)) d.end = String(new Date(t).getUTCFullYear()); } });
  function drainFrom(i) { for (let k = i - 1; k >= 0; k--) { const u = DRAIN_UNTIL[steps[k].dataset.act]; if (u != null) return u; } return 1869; }
  function rollFrom(i) { // the year to roll from, when this step's year is later; null when it should not roll
    if (RM) return null;
    const Y = yrFirst(steps[i].dataset.date); if (Y == null || itOf(i)) return null;
    for (let k = i - 1; k >= 0; k--) { const d = steps[k].dataset, P = yrLast(d.end || d.date); if (P != null) return P < Y ? P : null; }
    return null;
  }
  const actOf = i => ACTS[steps[i] && steps[i].dataset.act] || {};
  const posOf = i => (steps[i] && steps[i].dataset.pos) || "left";
  // a view centred on one point keeps it mid-screen when a period picture takes the side the words leave free
  const viewPos = (i, key) => (steps[i] && steps[i].dataset.beat && key && !VIEWS[key]().bounds ? "center" : posOf(i));
  const itOf = i => { const d = steps[i] && steps[i].dataset; if (!d || !d.it) return null; const span = d.span ? d.span.split(",").map(Number) : [0, 1]; return { ids: d.it.split(","), span }; };
  const yearsOf = a => asList(a.years).map(y => (typeof y === "number" ? { year: y } : y));

  // ---------- the seasons: the story's date gives the season; only the emphasized moments get the strong effects ----------
  // emphasis(p, ctx) -> { at: ms | phase, strength 0..1, particles 0..1, storm, smoke, warm, wintry } or null.
  // ctx is { cur, q, now } on a journey step. Everywhere else the season is a faint tint (SUBTLE), or none.
  const SUBTLE = 0.2;
  const ISLAND_THAW = { at: Date.UTC(1849, 2, 25), phase: 0.955, strength: 0.85, particles: 0.35 }; // late winter, the thaw starting
  const EMPHASIS = {
    // the St. Louis winter of 1841–42: through the stay the year turns fall, deep winter, then the thaw
    "j-stlouis": (p, c) => c && c.cur && /st-louis-winter/.test(c.cur.id) ? {
      phase: warp(c.q, [[0, 0.55], [0.18, 0.8], [0.78, 0.87], [1, 0.97]]), strength: smooth(c.q, 0, 0.12) * (1 - 0.6 * smooth(c.q, 0.86, 1)),
      particles: 1, wintry: c.q > 0.14 && c.q < 0.86 } : null,
    // 1832–34, cholera and three hungry years; the hail of 1834
    "l-cholera": p => ({ at: Date.UTC(1834, 6, 10), strength: 0.45, particles: 0, storm: smooth(p, 0.04, 0.3) }),
    // the cart trail in high summer, June and July 1845: warm light until the camera comes down on the farm
    "j-trail": p => ({ strength: 0.5, particles: 0, warm: smooth(p, 0.03, 0.15) * (1 - smooth(p, 0.8, 0.9)) }),
    "ch-3": () => ISLAND_THAW, island: () => ISLAND_THAW, "island-patent": () => ISLAND_THAW,
    // Cloquet, October 1918: autumn, and the smoke of the fire in the picture's second half
    "d-cloquet": p => ({ at: Date.UTC(1918, 9, 12), strength: 0.7, particles: 0.6, smoke: 0.35 + 0.65 * smooth(p, 0.45, 0.7) })
  };
  for (const k in EMPHASIS) if (ACTS[k]) ACTS[k].emphasis = EMPHASIS[k];
  let wintry = false;
  function seasons(i, p, ctx, gen) {
    if (!SEA) return;
    const st = steps[i], a = actOf(i);
    let year = null, phase = 0.3, I = 0, parts = 0, mood = null;
    if (gen) { // the generations: one turn per generation, strong, with its snow and leaves
      year = Math.floor(gen.y); phase = gen.phase; I = 0.85 * smooth(p, 0.02, G_P0) * (1 - 0.75 * smooth(p, G_P1, 1)); parts = 0.5;
    } else {
      const ms = ctx && ctx.now != null ? ctx.now : stepDateMs(st);
      if (ms != null) { const s = phaseOfMs(ms); year = s.year; phase = s.phase; I = SUBTLE; }
      const e = a.emphasis && a.emphasis(p, ctx);
      if (e) {
        if (e.at != null) { const s = phaseOfMs(e.at); year = s.year; phase = s.phase; }
        if (e.phase != null) phase = e.phase;
        // the strong effect eases in and out at the step's edges, unless the neighbour shares it
        const same = k => actOf(k).emphasis === a.emphasis;
        const edge = (same(i - 1) ? 1 : smooth(p, 0, 0.1)) * (same(i + 1) ? 1 : 1 - smooth(p, 0.9, 1));
        I = Math.max(year != null ? SUBTLE : 0, (e.strength || 0) * edge); parts = (e.particles || 0) * edge;
        mood = { storm: (e.storm || 0) * edge, smoke: (e.smoke || 0) * edge, warm: (e.warm || 0) * edge };
        const w = !!e.wintry && edge > 0.5; if (w !== wintry) { wintry = w; document.body.classList.toggle("mood-winter", w); }
      }
    }
    if (!(a.emphasis) && wintry) { wintry = false; document.body.classList.remove("mood-winter"); }
    if (year != null) SEA.setTime(year + phase);
    SEA.setParticles(parts); SEA.setMood(RM ? null : mood); SEA.setIntensity(RM ? Math.min(I, SUBTLE) : I);
  }
  // ---------- the open map: where the traveller and a step's focus can sit with nothing laid over them ----------
  // Per step, a model of what covers the map once the step is on screen: the words (a column the full height of
  // the screen when they scroll through it, the bottom band when they are held), the period picture, the date
  // mark, the map notes and legends, and the generation ribbon. The camera's aim for the marker is the middle of
  // the largest rectangle that stays PAD clear of all of them. The model, not the live page, so a step's views
  // are the same whenever they are computed (endView of the step before must equal where this step starts).
  // When nothing usable is left (narrow screens), the picture shrinks, never the marker.
  const PAD = 60, EDGE = 24, MIN_FREE = 56;
  const aspect = {}; // beat -> height / width of its picture
  Object.values(ILL).forEach(m => { const im = new Image(); im.onload = () => { if (im.naturalWidth) { aspect[m.beat] = im.naturalHeight / im.naturalWidth; clearLayout(); } }; im.src = m.file_asis || m.file; });
  let layoutCache = {};
  function clearLayout() { layoutCache = {}; for (const k in focusCache) delete focusCache[k]; camLast = ""; camKey = ""; }
  const legendOn = i => /^(ch-2|j-)/.test(steps[i].dataset.act);
  const vw = () => window.innerWidth, vh = () => window.innerHeight;
  // rectangles in map-container pixels
  function figRect(i, scale) {
    const beats = (steps[i].dataset.beat || "").split("|").filter(b => ILL[b]); if (!beats.length || scale <= 0) return null;
    const w = W(), h = H(), ph = phone(), left = posOf(i) === "right" && !ph;
    const fw = (ph ? 0.40 * vw() : Math.min(0.34 * vw(), 520)) * scale;
    const ar = Math.max(...beats.map(b => aspect[b] || 0.8));
    const imgH = Math.min((ph ? 0.24 : 0.46) * vh() * scale, (fw - 20) * ar + 20), capH = ph ? 0 : 58;
    const x0 = ph ? w - 10 - fw : left ? 0.05 * vw() : w - 0.05 * vw() - fw, y0 = ph ? 10 : left ? 0.29 * vh() : 0.09 * vh();
    return { l: x0, t: y0, r: x0 + fw, b: y0 + imgH + capH };
  }
  function obstacles(i, figScale) {
    const w = W(), h = H(), out = [], ph = phone(), st = steps[i], act = st.dataset.act;
    // the date mark: the logo, the year and up to three lines under it
    const fs = ph ? 38 : Math.max(54, Math.min(92, 0.062 * vw())), sfs = ph ? 13 : Math.max(16, Math.min(21, 0.0135 * vw()));
    const dx = ph ? 12 : 0.05 * vw(), dy = ph ? 10 : 0.05 * vh();
    out.push({ k: "datemark", l: dx, t: dy, r: dx + Math.max(ph ? 190 : 34 * sfs * 0.52, 2.6 * fs), b: dy + (ph ? 34 : 59) + 1.1 * fs + 11 + 3 * 1.3 * sfs });
    // the map notes and legends, bottom right (bottom left when the words are on the right)
    if (!(act === "l-gens")) {
      const hw = Math.min(360, w * 0.5), hh = legendOn(i) ? 118 : 58, onLeft = !ph && posOf(i) === "right";
      const x0 = onLeft ? 18 : w - (ph ? 8 : 18) - hw, y1 = h - (ph ? 22 : 26);
      out.push({ k: "hud", l: x0, t: y1 - hh, r: x0 + hw, b: y1 });
    }
    if (act === "l-gens") { const gh = genStripH(); out.push({ k: "ribbon", l: 0, t: h - gh, r: w, b: h }); }
    const f = figRect(i, figScale); if (f) { f.k = "figure"; out.push(f); }
    // the words: a column the full height of the screen, since even words held at the bottom rise through it when
    // the step ends. Where the next step also carries the traveller, its words' arrival band (the bottom half)
    // too, since the hand-over starts from this step's aim. The last step's words fade as the step changes.
    // On a phone the words scroll under the map, not over it.
    const col = (k, t, b) => { const e = steps[k] && steps[k].querySelector(".prose"); if (!e) return; const r = e.getBoundingClientRect(); out.push({ k: "prose", l: r.left, r: r.right, t, b }); };
    if (!ph) { col(i, 0, h); if (hasMarker(i + 1)) col(i + 1, 0.5 * h, h); }
    return out.map(r => ({ k: r.k, l: Math.max(0, r.l), t: Math.max(0, r.t), r: Math.min(w, r.r), b: Math.min(h, r.b) })).filter(r => r.r > r.l && r.b > r.t);
  }
  // the largest axis-aligned rectangle that keeps PAD from every obstacle and EDGE from the screen's edge.
  // Long thin slivers score low: a rectangle counts at most 2.2 times as wide as it is tall, and the reverse.
  function largestFree(obs) {
    const w = W(), h = H(), R = obs.map(r => ({ l: r.l - PAD, t: r.t - PAD, r: r.r + PAD, b: r.b + PAD }));
    const xs = [EDGE, w - EDGE], ys = [EDGE, h - EDGE];
    for (const r of R) { if (r.l > EDGE && r.l < w - EDGE) xs.push(r.l); if (r.r > EDGE && r.r < w - EDGE) xs.push(r.r); if (r.t > EDGE && r.t < h - EDGE) ys.push(r.t); if (r.b > EDGE && r.b < h - EDGE) ys.push(r.b); }
    const X = [...new Set(xs)].sort((a, b) => a - b), Y = [...new Set(ys)].sort((a, b) => a - b);
    let best = null;
    for (let a = 0; a < X.length; a++) for (let b = a + 1; b < X.length; b++) for (let c = 0; c < Y.length; c++) for (let d = c + 1; d < Y.length; d++) {
      const x0 = X[a], x1 = X[b], y0 = Y[c], y1 = Y[d];
      if (R.some(r => !(r.r <= x0 || r.l >= x1 || r.b <= y0 || r.t >= y1))) { if (d === c + 1) break; continue; }
      // and, other things equal, the middle of the screen: a rectangle off at an edge loses up to a third
      const fw = x1 - x0, fh = y1 - y0, cx = (x0 + x1) / 2 / w - 0.5, cy = (y0 + y1) / 2 / h - 0.5;
      const score = Math.min(fw, 2.2 * fh) * Math.min(fh, 2.2 * fw) * (1 - 0.66 * Math.hypot(cx, cy));
      if (!best || score > best.score) best = { x: x0, y: y0, w: fw, h: fh, score };
    }
    return best;
  }
  function layout(i) {
    const key = i + "|" + W() + "|" + H(); if (layoutCache[key]) return layoutCache[key];
    let out = null;
    for (const s of [1, 0.8, 0.64, 0.5, 0]) {
      const obs = obstacles(i, s), free = largestFree(obs);
      out = { obs, free, figScale: s };
      if (free && Math.min(free.w, free.h) >= MIN_FREE) break;
    }
    if (!out.free) out.free = { x: W() / 2 - 1, y: H() / 2 - 1, w: 2, h: 2 };
    out.aim = L.point(out.free.x + out.free.w / 2, out.free.y + out.free.h / 2);
    return layoutCache[key] = out;
  }
  LL.layout = i => layout(i == null ? curStep : i); // tests
  // the aim eases from the last step's open spot to this one's over the first part of the step
  const hasMarker = k => k >= 0 && !!(itOf(k) || actOf(k).track);
  function aimAt(i, p) {
    const b = layout(i).aim; if (i <= 0 || RM || !hasMarker(i - 1)) return b;
    // over about 0.4 of a screen of scroll, whatever the step's length
    const a = layout(i - 1).aim, t = smooth(p, 0, Math.min(0.3, 0.4 * vh() / Math.max(1, steps[i].offsetHeight)));
    if (t >= 1) return b;
    // the hand-over goes round the corner that is clear of this step's words and picture: across then down, or
    // down then across (a straight line can clip the corner of a column)
    const inside = q => layout(i).obs.some(r => q.x > r.l - 24 && q.x < r.r + 24 && q.y > r.t - 24 && q.y < r.b + 24);
    const xFirst = !inside(L.point(b.x, a.y)) || inside(L.point(a.x, b.y));
    const tx = xFirst ? smooth(t, 0, 0.6) : smooth(t, 0.4, 1), ty = xFirst ? smooth(t, 0.4, 1) : smooth(t, 0, 0.6);
    return L.point(a.x + (b.x - a.x) * tx, a.y + (b.y - a.y) * ty);
  }
  // shift a view centred on the subject so the subject lands on the aim point instead of mid-screen
  const aimView = (v, a) => { const o = L.point(a.x - W() / 2, a.y - H() / 2); return { center: map.unproject(map.project(v.center, v.zoom).subtract(o), v.zoom), zoom: v.zoom }; };
  // the focus of a view, where a step has one: the island, the farm, the park, the Lauzon shore, Pointe-Lévy
  const FOCUS = {
    island: () => ({ bounds: islandBounds, maxZoom: 16.5 }),
    gervais: () => ({ bounds: B(farmBounds).extend(louisBounds), maxZoom: 15.5 }),
    littleCanada: () => ({ bounds: B(farmBounds).extend(louisBounds).extend(churchPt), maxZoom: 15 }),
    park: () => ({ bounds: L.latLngBounds([parkPt, parkPt]).extend(farmBounds), maxZoom: 16 }),
    arrive: () => ({ point: farmBounds.getCenter() }),
    levy: () => ({ point: L.latLng(46.80, -71.18) }),
    lauzon: () => ({ point: L.latLng(46.74, -71.27) })
  };
  const focusCache = {};
  function viewOf(i, key) {
    if (!FOCUS[key]) return resolve(key, viewPos(i, key));
    const ck = i + "|" + key + "|" + W() + "|" + H(); if (focusCache[ck]) return focusCache[ck];
    const f = FOCUS[key](), base = resolve(key, viewPos(i, key)), lay = layout(i);
    let v;
    if (f.bounds) {
      // fit the feature into the open rectangle (it may reach into the padding), never more than a level and a
      // half wider than the old framing
      const z0 = base.zoom, nw = map.project(f.bounds.getNorthWest(), z0), se = map.project(f.bounds.getSouthEast(), z0);
      const bw = Math.max(1, se.x - nw.x), bh = Math.max(1, se.y - nw.y);
      const fit = z0 + Math.log2(Math.min((lay.free.w + PAD) / bw, (lay.free.h + PAD) / bh));
      const zoom = Math.max(z0 - 1.5, Math.min(f.maxZoom || 18, fit));
      v = aimView({ center: f.bounds.getCenter(), zoom }, lay.aim);
    } else v = aimView({ center: f.point, zoom: VIEWS[key]().zoom }, lay.aim);
    return focusCache[ck] = v;
  }

  const endView = i => {
    for (let k = i; k >= 0; k--) {
      const a = actOf(k); if (a.track) return a.track(1, k).view;
      if (a.view) return viewOf(k, a.view);
      if (itOf(k)) return followTarget(k, 1);
    }
    return resolve("ring", "left");
  };
  // ---------- the journey camera: centred on the cart, a little ahead of it along the route ----------
  // Zoom comes from each stretch's length (a long lake crossing is wide, a stage road close), eased in over the
  // first half of the stretch and then held; a stay holds the camera still where the last stretch ended.
  const travelIT = IT.filter(e => e.kind === "travel" && legByNo[e.leg] && legFrac[e.id]);
  const at = (path, f) => { const pts = partial(path, Math.max(1e-6, Math.min(1, f))); return pts[pts.length - 1]; };
  // where the family is during a stay: where the last stretch ended, else the named place
  const stayAt = (e, prev) => prev ? at(legByNo[prev.leg].path, legFrac[prev.id][1]) : placeFor(e.to || e.from);
  const mpp = (z, lat) => 156543.034 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);
  const zCache = {};
  function entryZoom(e) {
    const k = e.id + "|" + W(); if (zCache[k] != null) return zCache[k];
    const l = legByNo[e.leg], [a0, a1] = legFrac[e.id], len = Math.max(1, (a1 - a0) * l.path.len), mid = at(l.path, (a0 + a1) / 2);
    return zCache[k] = Math.max(5.4, Math.min(8.0, Math.log2(156543.034 * Math.cos(mid.lat * Math.PI / 180) * 0.6 * W() / len)));
  }
  const lerpView = (a, b, w) => ({ center: lerp(a.center, b.center, w), zoom: a.zoom + (b.zoom - a.zoom) * w });
  // piecewise-linear time warp: knots [[p, f], ...]
  const warp = (p, K) => { for (let k = 1; k < K.length; k++) if (p <= K[k][0]) return K[k - 1][1] + (K[k][1] - K[k - 1][1]) * (p - K[k - 1][0]) / (K[k][0] - K[k - 1][0]); return K[K.length - 1][1]; };
  let euK = null;
  const euKnots = () => euK || (euK = { fa: fracNear(euSea, L.latLng(49.0, -8.0)), fb: fracNear(euSea, L.latLng(51.82, -55.35)) });
  // a flyTo-curve blend between two views, cached per key while its ends stay put
  const flyCache = {};
  function flyBetween(key, a, b, t) {
    if (t <= 0) return a;
    const c = flyCache[key], sig = b.center.lat + "," + b.center.lng + "," + b.zoom;
    if (!c || c.sig !== sig || c.a.center.distanceTo(a.center) > 1) flyCache[key] = { sig, a, f: flyPath(a, b) };
    return flyCache[key].f(t);
  }
  function followTarget(i, p, log) {
    const it = itOf(i), sl = it && slice(it.ids, it.span), a = actOf(i);
    if (!sl) return a.view ? viewOf(i, a.view) : resolve("overview", posOf(i));
    const { e, q } = locate(sl, p);
    let v;
    if (e.kind === "travel" && travelIT.includes(e)) {
      // the camera is centred on the cart itself, exactly: no look-ahead, so the cart never drifts on screen
      const k = travelIT.indexOf(e), z1 = entryZoom(e), z0 = k > 0 ? entryZoom(travelIT[k - 1]) : z1;
      const zoom = z0 + (z1 - z0) * smooth(q, 0, 0.5);
      const l = legByNo[e.leg], [a0, a1] = legFrac[e.id];
      v = { center: at(l.path, a0 + (a1 - a0) * q), zoom };
    } else {
      const prev = travelIT.filter(x => x.t0 <= e.t0).pop();
      const here = stayAt(e, prev);
      v = here ? { center: here, zoom: prev ? entryZoom(prev) : resolve("overview", "center").zoom } : resolve("overview", "center");
    }
    // the cart sits in the open: the middle of the largest stretch of map nothing covers (aimAt)
    v = aimView(v, aimAt(i, p));
    if (i > 0 && !itOf(i - 1)) v = lerpView(endView(i - 1), v, smooth(p, 0, 0.15));
    if (a.view) { const w = a.viewAt || [0.45, 0.85]; v = lerpView(v, viewOf(i, a.view), smooth(p, w[0], w[1])); }
    if (log) followEntry = e.id;
    return v;
  }
  const framesOf = i => {
    const a = actOf(i), start = i > 0 ? endView(i - 1) : endView(i), span = a.cam || [0, 0.6];
    if (a.frames) return [{ at: 0, view: start }, ...a.frames.map(([t, k]) => ({ at: t, view: viewOf(i, k) }))];
    return [{ at: span[0], view: start }, { at: span[1], view: endView(i) }];
  };

  // ---------- preload: the tiles the neighbouring steps will need, at the views they will show ----------
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
    const a = actOf(i), views = [endView(i)];
    if (itOf(i)) for (let p = 0; p < 1; p += 0.125) views.push(followTarget(i, p));
    if (a.track) for (let p = 0; p <= 1; p += 0.0625) views.push(a.track(p, i).view);
    const ls = [...asList(a.base).map(baseLayer), ...yearsOf(a).flatMap(y => yearGroup(y.year).parts)].filter(Boolean);
    for (const v of views) for (const l of ls) for (const u of tilesFor(l, v)) if (!fetched.has(u)) { fetched.add(u); const im = new Image(); im.decoding = "async"; im.src = u; }
  }
  underlay();
  // the underlay at every native level it draws during the journey (its own maxNativeZoom), over the whole route
  setTimeout(() => {
    const box = L.latLngBounds([...legs.flatMap(l => l.path.latlngs), ...euSea.latlngs, ...euHuron.latlngs, L.latLng(36, -100)]).pad(0.1);
    for (const l of Object.values(UNDER)) {
      if (!l) continue; const o = l.options, zs = [4, o.maxNativeZoom];
      for (const z of zs) {
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
  let preloadTimer = 0;
  LL.scroller({
    steps,
    onEnter(step, i) {
      clearTimeout(preloadTimer);
      preloadTimer = setTimeout(() => { preload(i); preload(i + 1); preload(i - 1); preload(i + 2); }, 120);
      const a = actOf(i);
      $("graphic").dataset.pos = posOf(i);
      $("graphic").classList.toggle("on-imagery", asList(a.base).includes("imagery"));
      const keepB = new Set([...asList(actOf(i - 1).base), ...asList(a.base), ...asList(actOf(i + 1).base)]);
      const keepY = new Set([...yearsOf(actOf(i - 1)), ...yearsOf(a), ...yearsOf(actOf(i + 1))].map(y => y.year));
      layers(keepB, asList(a.base), keepY, yearsOf(a));
      if (a.enter) a.enter();
      if (DRAIN_UNTIL[step.dataset.act] != null) { V.drain.addTo(map); V.drainLabels.addTo(map); }
      else lakeWater(i > steps.findIndex(x => x.dataset.act === "drain-2024") ? 0.03 : LAKE_FILL);
      if (!itOf(i)) {
        if (a.yearFn || rollFrom(i) != null) rollNow(step.dataset.sub || "", "roll|" + i);
        else { datemark(step.dataset.date || "", step.dataset.sub || ""); $("datemark").classList.remove("rolling"); }
        $("dm-sub").title = "";
      }
      { const fsc = layout(i).figScale; fig.style.setProperty("--fs", String(fsc || 1)); fig.classList.toggle("squeezed", fsc === 0); }
      illus(step.dataset.beat, 0, posOf(i));
      if (SEA) SEA.setTrees(/^l-(gens|marriage|cholera)$/.test(step.dataset.act) ? LZ_TREES : null, { from: 1673, to: 1792 });
      const gens = step.dataset.act === "l-gens"; $("graphic").classList.toggle("gens-on", gens); if (!gens) ageBase(0);
    },
    onProgress(step, i, p) {
      const a = actOf(i), it = itOf(i);
      followStep = i; curStep = i;
      // the journey and Eustache's crossing: the camera sits on the traveller, set in the same frame as the marker
      // arriving from a step without the traveller, the marker shows once the camera has landed on it
      { const arrive = i > 0 && !hasMarker(i - 1) && !RM ? smooth(p, it ? 0.135 : 0.045, it ? 0.155 : 0.065) : 1;
        if (arrive !== travellerOp) { travellerOp = arrive; [V.cart, V.ship].forEach(m => m.setOpacity(arrive)); } }
      if (it) direct(followTarget(i, RM ? 1 : p, true));
      else if (a.track) { const t = a.track(RM ? 1 : p, i); direct(t.view); if (t.draw) t.draw(); if (t.pos) { V.ship.setLatLng(t.pos); shipMode(t.mode); } }
      else camera(i + "|" + posOf(i), framesOf(i), p);
      const ctx = it ? itinerary(it.ids, it.span, RM ? 1 : p) : null;
      let gen = null;
      if (!it && a.yearFn) {
        const y = a.yearFn(RM ? 1 : p); rollYear(y.text, y.rolling); if (y.sub != null) $("dm-sub").innerHTML = y.sub;
        gen = { y: y.y, phase: y.phase };
      } else if (!it) {
        const P = rollFrom(i);
        if (P != null) {
          const Y = yrFirst(step.dataset.date), sp = rollSpan(P, Y), e = easeOut(p / sp);
          rollYear(e < 1 ? String(Math.round(P + (Y - P) * e)) : step.dataset.date, e < 1);
        }
      }
      // the seasons follow the story's date, not the scroll; strong only where a step asks for emphasis
      seasons(i, RM ? 1 : p, ctx, gen);
      if (a.progress) a.progress(p);
      if (DRAIN_UNTIL[step.dataset.act] != null) drainage(drainFrom(i), DRAIN_UNTIL[step.dataset.act], p);
      if (step.dataset.beat) illus(step.dataset.beat, step.dataset.beat.includes("|") ? clamp01((p - 0.05) / 0.9) : smooth(p, 0.05, 0.6), posOf(i));
    }
  });
  addEventListener("resize", () => { map.invalidateSize(); for (const k in viewCache) delete viewCache[k]; for (const k in zCache) delete zCache[k]; for (const k in flyCache) delete flyCache[k]; clearLayout(); camKey = ""; camLast = ""; });
  // the sticky graphic can change height when the browser chrome comes and goes
  new ResizeObserver(() => { map.invalidateSize(); camLast = ""; }).observe(el);
  LL.storyMap = map;
  return { map };
};
