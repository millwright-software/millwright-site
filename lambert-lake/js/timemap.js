/* The atlas: every map of the lake 1856–2026 on one frame, with a timeline, cross-fade, swipe and a looking glass.
   A port of fade/viewer.template.html onto Web Mercator tiles, with live bases under the historical layers. */
window.LL = window.LL || {};

LL.timemap = function (D) {
  const C = LL.CONFIG, RM = C.reducedMotion, COL = C.colors, $ = id => document.getElementById(id);
  const FRAMES = (D.years || []).slice().sort((a, b) => a.year - b.year);
  const N = FRAMES.length;
  const root = $("atlas");
  let map, layers, live, under = {}, underKey = "streets", inited = false, countyOn = true;

  function init() {
    if (inited) return; inited = true;
    const frame = L.latLngBounds(FRAMES[0].bounds);
    map = L.map("time-map", { zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90, maxZoom: 19, minZoom: 10, fadeAnimation: false, zoomAnimation: !RM });
    map.attributionControl.setPrefix("");
    map.createPane("under").style.zIndex = 200;
    map.createPane("county").style.zIndex = 250;
    map.createPane("hist").style.zIndex = 300;
    under.streets = LL.baseLayer("streets", { pane: "under" });
    under.imagery = LL.baseLayer("imagery", { pane: "under" });
    under[underKey].addTo(map);
    map.fitBounds(frame, { padding: [10, 10] });

    layers = FRAMES.map(f => LL.tileLayer(C.tiles(f.year), Object.assign(C.tileOptions(f), { pane: "hist", opacity: 0, attribution: "" })));
    live = FRAMES.map(f => LL.liveLayer(f.year, { pane: "county", opacity: 0, attribution: "" }));
    map.attributionControl.addAttribution("Historical maps and air photos: credits below");

    // the family's land, the house, the church
    const feats = (D.parcels && D.parcels.features) || [];
    const groups = {};
    feats.forEach(f => (groups[f.properties.group] ||= []).push(f));
    const shapes = {};
    for (const [g, fs] of Object.entries(groups)) {
      const p = fs[0].properties;
      shapes[g] = L.geoJSON({ type: "FeatureCollection", features: fs }, {
        style: { color: COL[g] || COL.ink, weight: 3.5, fillColor: COL[g] || COL.ink, fillOpacity: .17, dashArray: g === "louis-gervais" ? "8 6" : null }
      }).bindTooltip(p.label, { permanent: true, direction: "center", className: "lbl ink" + (g.startsWith("abraham") ? " seal" : "") })
        .bindPopup(`<b>${p.owner}</b><br>${p.detail || ""}`);
    }
    // a pale halo under every outline, so the lines read on dark air photos and busy plats alike
    const halo = fs => L.geoJSON({ type: "FeatureCollection", features: fs }, { style: { color: "#f3ecda", weight: 8.5, opacity: .75, fill: false }, interactive: false });
    const parcelLayer = L.layerGroup([...Object.values(groups).map(halo), ...Object.values(shapes)]).addTo(map);
    const pts = {}; ((D.points && D.points.features) || []).forEach(f => pts[f.properties.id || f.properties.kind] = { ll: L.latLng(f.geometry.coordinates[1], f.geometry.coordinates[0]), p: f.properties });
    const DETAIL = {
      house: "<b>3921 Woodview Ct</b><br>Eric's house: section 30, lot 5 on the 1850s survey, about 300 m west of Lambert Lake's west shore.",
      church: "<b>St. John the Evangelist, Little Canada</b><br>Abraham gave the land for the cemetery and logs for the first church, 1851. He is buried in the family lot here.",
      ring: "<b>Lambert Lake</b><br>The ring of water around the island. Drained from 1870 by the city's canal and in 1893–94 by Barnum's ditch; a wetland on Lambert Creek today."
    };
    const mk = (key, cls, label) => pts[key] ? L.marker(pts[key].ll, { icon: L.divIcon({ className: "pin " + cls, iconSize: [16, 16] }) })
      .bindTooltip(label || pts[key].p.label, { permanent: true, direction: "right", offset: [10, 0], className: "lbl ink" + (cls === "house" ? " seal" : "") })
      .bindPopup(DETAIL[key] || pts[key].p.detail || pts[key].p.label) : null;
    const house = mk("house", "house", "3921 Woodview Ct"), church = mk("church", "church", "St. John the Evangelist").addTo(map);
    // the lake as surveyed in 1847–48, over whatever year is showing
    const lakeGeo = D.lake && (D.lake.features ? D.lake : { type: "FeatureCollection", features: [D.lake] });
    const lakeLabel = lakeGeo ? L.marker(L.latLng(L.geoJSON(lakeGeo).getBounds().getNorth(), L.geoJSON(lakeGeo).getBounds().getCenter().lng), { icon: L.divIcon({ className: "anchor", iconSize: [0, 0] }), interactive: false, keyboard: false })
      .bindTooltip("the lake, 1847–48", { permanent: true, direction: "top", offset: [0, -4], className: "lbl ink" }) : null;
    const lake = lakeGeo ? L.featureGroup([L.geoJSON(lakeGeo, { style: { color: "#f3ecda", weight: 9, opacity: .7, fill: false }, interactive: false }), L.geoJSON(lakeGeo, { style: { color: "#2f5a66", weight: 4, opacity: 1, fillColor: "#3f7d8e", fillOpacity: .16, lineJoin: "round" } })])
      .bindPopup("<b>Lambert Lake as surveyed, 1847–48</b><br>About 533 acres of water around a 97-acre island, from the plat's meander lines.").addTo(map) : null;
    if (lakeLabel) lakeLabel.addTo(map);

    // places
    const fit = b => map.flyToBounds(b, { padding: [50, 50], duration: RM ? 0 : 1.1, maxZoom: 17 });
    const add = (title, sub, color, go) => { const b = document.createElement("button"); b.innerHTML = `<i style="color:${color}"></i><span class="t">${title}<span>${sub}</span></span>`; b.onclick = go; $("places").appendChild(b); };
    if (shapes["abraham-island"]) add("Lambert Island", "Abraham's, 1849, 94.39 acres", COL["abraham-island"], () => fit(shapes["abraham-island"].getBounds()));
    if (shapes["abraham-gervais"]) add("Abraham's farm on Lake Gervais", "1849, 91.25 acres", COL["abraham-gervais"], () => fit(shapes["abraham-gervais"].getBounds()));
    if (shapes["louis-gervais"]) add("Louis A. Lambert's 80 acres", "1853, beside his father", COL["louis-gervais"], () => fit(shapes["louis-gervais"].getBounds()));
    if (church) add("St. John the Evangelist", "the church and cemetery, 1851", "#3f6873", () => map.flyTo(church.getLatLng(), 17, { duration: RM ? 0 : 1.1 }));
    if (house) add("3921 Woodview Ct", "Eric's house, today", "#8a2a22", () => { if (!T.house) document.querySelector('#toggles button[data-t="house"]').click(); fit(L.latLngBounds([house.getLatLng(), shapes["abraham-island"] ? shapes["abraham-island"].getBounds().getCenter() : house.getLatLng()]).pad(0.3)); });
    add("The old lake", "the whole frame of maps", "#251e15", () => fit(frame));
    const everything = () => { const g = L.featureGroup([...Object.values(shapes), church].filter(Boolean)); fit(g.getBounds()); };
    add("Everything", "the island, the farms, the church", "#65584a", everything);

    // toggles
    const T = { parcels: true, house: false, labels: true, county: true, lake: true };
    if (lake) { const b = document.createElement("button"); b.dataset.t = "lake"; b.className = "on"; b.textContent = "the lake, 1855"; document.getElementById("toggles").prepend(b); }
    document.querySelectorAll("#toggles button").forEach(b => b.onclick = () => {
      const k = b.dataset.t; T[k] = !T[k]; b.classList.toggle("on", T[k]);
      if (k === "parcels") T[k] ? parcelLayer.addTo(map) : map.removeLayer(parcelLayer);
      if (k === "house" && house) T[k] ? house.addTo(map) : map.removeLayer(house);
      if (k === "lake" && lake) { T[k] ? lake.addTo(map) : map.removeLayer(lake); if (lakeLabel) T[k] ? lakeLabel.addTo(map) : map.removeLayer(lakeLabel); }
      if (k === "labels") $("stage").classList.toggle("nolabels", !T[k]);
      if (k === "county") { countyOn = T[k]; for (const k of liveSet) { map.removeLayer(layers[k]); if (live[k]) map.removeLayer(live[k]); } liveSet = new Set(); mode === "fade" ? render() : showPair(); }
    });
    document.querySelectorAll("#under button").forEach(b => b.onclick = () => {
      map.removeLayer(under[underKey]); underKey = b.dataset.u; under[underKey].addTo(map);
      document.querySelectorAll("#under button").forEach(x => x.classList.toggle("on", x === b));
    });

    // which years have tiles yet: one probe each at the frame's center, z12
    const c = frame.getCenter(), z = 12, n = 2 ** z;
    const tx = Math.floor((c.lng + 180) / 360 * n), ty = Math.floor((1 - Math.log(Math.tan(c.lat * Math.PI / 180) + 1 / Math.cos(c.lat * Math.PI / 180)) / Math.PI) / 2 * n);
    FRAMES.forEach((f, i) => fetch(C.tiles(f.year).replace("{z}", z).replace("{x}", tx).replace("{y}", ty), { method: "HEAD" })
      .then(r => { f.pending = !r.ok; ticks[i].classList.toggle("pending", f.pending); if (Math.round(t) === i) render(); }).catch(() => { f.pending = true; ticks[i].classList.add("pending"); }));

    render();
    map.on("move zoom zoomend resize viewreset", () => { if (mode !== "fade") renderCompare(); });
    if (!RM) setTimeout(() => setPlaying(true), 900);
  }

  // ---------- the timeline ----------
  const ticks = FRAMES.map((f, i) => {
    const el = document.createElement("div");
    el.className = "tick"; el.textContent = f.year; el.style.left = (100 * i / (N - 1)) + "%";
    $("track").appendChild(el); return el;
  });
  let t = 0, playing = false, liveSet = new Set();
  function addK(k) { layers[k].addTo(map); if (live[k] && countyOn) live[k].addTo(map); }
  function remK(k) { map.removeLayer(layers[k]); if (live[k]) map.removeLayer(live[k]); }
  function op(k, o) { layers[k].setOpacity(o); if (live[k]) live[k].setOpacity(o); }
  function zi(k, z) { layers[k].setZIndex(z); if (live[k]) live[k].setZIndex(z); }
  function render() {
    if (!inited) return;
    if (mode !== "fade") return renderCompare();
    const i = Math.min(Math.floor(t), N - 2), f = t - i, want = new Set([i, i + 1]);
    if (i + 2 < N) want.add(i + 2);
    if (i > 0) want.add(i - 1);
    for (const k of liveSet) if (!want.has(k)) { remK(k); liveSet.delete(k); }
    for (const k of want) if (!liveSet.has(k)) { addK(k); liveSet.add(k); }
    zi(i, 1); op(i, 1); zi(i + 1, 2); op(i + 1, f);
    if (i + 2 < N) { zi(i + 2, 0); op(i + 2, 0); }
    if (i > 0) { zi(i - 1, 0); op(i - 1, 0); }
    const near = Math.round(t), fr = FRAMES[near];
    $("year").textContent = fr.year;
    $("caption").textContent = fr.caption + (fr.pending ? " (tiles for this year not built yet)" : "");
    $("history").textContent = fr.history; $("credit").textContent = fr.credit;
    ticks.forEach((el, k) => el.classList.toggle("on", k === near));
    $("knob").style.left = (100 * t / (N - 1)) + "%";
  }
  const FADE = 2200, HOLD = 1500;
  let phase = 0, last = 0;
  function step(now) {
    if (!playing) return;
    phase += now - last; last = now;
    const k = Math.floor(t);
    if (phase > HOLD) t = Math.min(k + (phase - HOLD) / FADE, N - 1);
    if (phase > HOLD + FADE) { t = Math.min(k + 1, N - 1); phase = 0; }
    if (t >= N - 1) setPlaying(false);
    render(); requestAnimationFrame(step);
  }
  function setPlaying(on) {
    playing = on; $("play").innerHTML = on ? "&#10074;&#10074;" : "&#9654;"; $("play").setAttribute("aria-label", on ? "Pause" : "Play");
    if (on) { if (t >= N - 1) t = 0; t = Math.floor(t); phase = 0; last = performance.now(); requestAnimationFrame(step); }
  }
  $("play").onclick = () => { init(); setPlaying(!playing); };
  const track = $("track");
  function seek(e) {
    const r = track.getBoundingClientRect();
    t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (N - 1);
    setPlaying(false); render();
  }
  track.addEventListener("pointerdown", e => { init(); track.setPointerCapture(e.pointerId); seek(e); track.onpointermove = seek; });
  track.addEventListener("pointerup", () => { track.onpointermove = null; });
  track.addEventListener("pointercancel", () => { track.onpointermove = null; });

  // ---------- compare: two years, a divider or a looking glass ----------
  let mode = "fade", over = Math.max(0, FRAMES.findIndex(f => f.year === 1886)), underI = Math.max(0, FRAMES.findIndex(f => f.year === 2024));
  let pos = 0.5, lensPt = null, lensR = 150;
  const selOver = $("selOver"), selUnder = $("selUnder");
  for (const sel of [selOver, selUnder]) FRAMES.forEach((f, i) => sel.add(new Option(f.year, i)));
  selOver.onchange = () => { over = +selOver.value; showPair(); };
  selUnder.onchange = () => { underI = +selUnder.value; showPair(); };
  $("swap").onclick = () => { [over, underI] = [underI, over]; showPair(); };
  const containers = k => [layers[k], live[k]].filter(Boolean).map(l => l.getContainer && l.getContainer()).filter(Boolean);
  function clearClips() { for (let k = 0; k < N; k++) containers(k).forEach(c => c.style.clipPath = ""); }
  function showPair() {
    for (const k of liveSet) remK(k);
    liveSet = new Set([underI, over]);
    addK(underI); zi(underI, 1); op(underI, 1);
    addK(over); zi(over, 2); op(over, 1);
    selOver.value = over; selUnder.value = underI;
    renderCompare();
  }
  function renderCompare() {
    const cs = containers(over); if (!cs.length) return;
    const size = map.getSize(), nw = map.containerPointToLayerPoint([0, 0]), se = map.containerPointToLayerPoint(size);
    const st = $("stage").getBoundingClientRect(), mp = $("time-map").getBoundingClientRect(), ox = mp.left - st.left, oy = mp.top - st.top;
    const dv = $("divider"), bar = $("bar"), grip = $("grip"), lens = $("lens"), A = $("tagA"), B = $("tagB");
    A.textContent = FRAMES[over].year; B.textContent = FRAMES[underI].year;
    dv.style.display = lens.style.display = "none"; A.style.display = B.style.display = "block";
    let clip;
    if (mode === "x") {
      const x = nw.x + pos * size.x;
      clip = `polygon(${nw.x}px ${nw.y}px, ${x}px ${nw.y}px, ${x}px ${se.y}px, ${nw.x}px ${se.y}px)`;
      Object.assign(dv.style, { display: "block", left: ox + pos * size.x + "px", top: oy + "px", width: 0, height: size.y + "px" });
      Object.assign(bar.style, { left: "-1.5px", top: 0, width: "3px", height: size.y + "px" });
      Object.assign(grip.style, { left: 0, top: size.y / 2 + "px" }); grip.innerHTML = "&#8596;";
      Object.assign(A.style, { left: ox + pos * size.x - 62 + "px", top: oy + 12 + "px" });
      Object.assign(B.style, { left: ox + pos * size.x + 14 + "px", top: oy + 12 + "px" });
    } else if (mode === "y") {
      const y = nw.y + pos * size.y;
      clip = `polygon(${nw.x}px ${nw.y}px, ${se.x}px ${nw.y}px, ${se.x}px ${y}px, ${nw.x}px ${y}px)`;
      Object.assign(dv.style, { display: "block", left: ox + "px", top: oy + pos * size.y + "px", width: size.x + "px", height: 0 });
      Object.assign(bar.style, { left: 0, top: "-1.5px", width: size.x + "px", height: "3px" });
      Object.assign(grip.style, { left: size.x / 2 + "px", top: 0 }); grip.innerHTML = "&#8597;";
      Object.assign(A.style, { left: ox + 12 + "px", top: oy + pos * size.y - 32 + "px" });
      Object.assign(B.style, { left: ox + 12 + "px", top: oy + pos * size.y + 10 + "px" });
    } else {
      const p = lensPt || L.point(size.x / 2, size.y / 2), lp = map.containerPointToLayerPoint(p);
      clip = `circle(${lensR}px at ${lp.x}px ${lp.y}px)`;
      Object.assign(lens.style, { display: "block", left: ox + p.x - lensR + "px", top: oy + p.y - lensR + "px", width: 2 * lensR + "px", height: 2 * lensR + "px" });
      Object.assign(A.style, { left: ox + p.x - 20 + "px", top: oy + p.y - lensR - 30 + "px" });
      Object.assign(B.style, { left: ox + 56 + "px", top: oy + 14 + "px" });
    }
    cs.forEach(c => c.style.clipPath = clip);
    $("year").textContent = `${FRAMES[over].year} / ${FRAMES[underI].year}`;
    $("caption").textContent = mode === "lens" ? `${FRAMES[over].year} inside the glass, ${FRAMES[underI].year} around it. Move the mouse; [ and ] resize it.`
      : mode === "x" ? `${FRAMES[over].year} on the left, ${FRAMES[underI].year} on the right. Drag the handle.`
      : `${FRAMES[over].year} above, ${FRAMES[underI].year} below. Drag the handle.`;
    $("history").textContent = FRAMES[over].history;
    $("credit").textContent = FRAMES[over].credit === FRAMES[underI].credit ? FRAMES[over].credit : `${FRAMES[over].credit}; ${FRAMES[underI].credit}`;
  }
  function setMode(m) {
    init(); mode = m;
    document.querySelectorAll("#modes [data-m]").forEach(b => b.classList.toggle("on", b.dataset.m === m));
    root.classList.toggle("compare", m !== "fade");
    $("labOver").textContent = m === "x" ? "left" : m === "y" ? "top" : "glass";
    $("labUnder").textContent = m === "x" ? "right" : m === "y" ? "bottom" : "around";
    clearClips();
    if (m === "fade") {
      $("divider").style.display = $("lens").style.display = $("tagA").style.display = $("tagB").style.display = "none";
      for (const k of liveSet) remK(k);
      liveSet = new Set(); render();
    } else { setPlaying(false); showPair(); }
  }
  document.querySelectorAll("#modes [data-m]").forEach(b => b.onclick = () => setMode(b.dataset.m));
  const grip = $("grip");
  grip.addEventListener("pointerdown", e => {
    e.stopPropagation(); grip.setPointerCapture(e.pointerId); map.dragging.disable();
    grip.onpointermove = ev => {
      const r = $("time-map").getBoundingClientRect();
      pos = mode === "x" ? (ev.clientX - r.left) / r.width : (ev.clientY - r.top) / r.height;
      pos = Math.max(0.02, Math.min(0.98, pos)); renderCompare();
    };
  });
  grip.addEventListener("pointerup", () => { grip.onpointermove = null; map.dragging.enable(); });
  $("time-map").addEventListener("pointermove", e => {
    if (mode !== "lens") return;
    const r = $("time-map").getBoundingClientRect(); lensPt = L.point(e.clientX - r.left, e.clientY - r.top); renderCompare();
  });

  // keys work while the atlas fills the screen
  let inView = false;
  new IntersectionObserver(es => es.forEach(e => { inView = e.intersectionRatio > 0.6; }), { threshold: [0, 0.6, 1] }).observe(root);
  addEventListener("keydown", e => {
    if (!inView || !inited) return;
    const tag = e.target.tagName; if (tag === "SELECT" || tag === "INPUT" || tag === "BUTTON" || tag === "TEXTAREA") return;
    if (e.key === "f") setMode("fade");
    if (e.key === "s") setMode("x");
    if (e.key === "d") setMode("y");
    if (e.key === "l") setMode("lens");
    if (mode !== "fade") {
      if (e.key === "x") $("swap").onclick();
      if (e.key === "]" || e.key === "[") { lensR = Math.max(50, Math.min(450, lensR * (e.key === "]" ? 1.2 : 1 / 1.2))); renderCompare(); }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); over = (over + (e.key === "ArrowRight" ? 1 : N - 1)) % N; showPair(); return; }
      if (e.key === " ") { e.preventDefault(); return; }
    }
    if (e.key === " ") { e.preventDefault(); setPlaying(!playing); }
    if (e.key === "ArrowRight") { e.preventDefault(); setPlaying(false); t = Math.min(N - 1, Math.floor(t + 1e-6) + 1); render(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); setPlaying(false); t = Math.max(0, Math.ceil(t - 1e-6) - 1); render(); }
  });

  // build the map only when the reader gets near it
  new IntersectionObserver((es, obs) => { if (es.some(e => e.isIntersecting)) { init(); obs.disconnect(); } }, { rootMargin: "80% 0px" }).observe(root);
  return { init, get map() { return map; } };
};
