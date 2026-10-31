// Shared map layers for the proposal page and its static map renders.
// Data: the 1847-48 meander line, Abraham's 1849 lots, the five sites, Lambert Creek, the proposed trail.
const C = { paper: "#f3ecda", ink: "#251e15", seal: "#8a2a22", water: "#5f8793", lake: "#8fc3d1", green: "#5d7f45", gold: "#c9a24a" };

const SITES = {
  elmwood:      { name: "Lambert Island Park", now: "Elmwood Park" },
  community:    { name: "Lambert Lake Park", now: "Community Park" },
  creek:        { name: "Lambert Lake Trail", now: "along Lambert Creek" },
  cemetery:     { name: "St. John's Cemetery", now: "a plaque" },
  "county-park":{ name: "Gervais–Lambert Park", now: "Lake Gervais County Park" },
};

const ll = r => r.map(p => [p[1], p[0]]);
const getJSON = u => fetch(u).then(r => r.json());

function satellite(map) {
  return L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19, attribution: "Imagery: Esri, Maxar · Shoreline: 1847–48 GLO survey · Parcels: Ramsey County" }).addTo(map);
}

// The 1856 GLO township plat (the 1847-48 survey), served from ../tiles when present.
function plat1856() {
  return L.tileLayer("../tiles/1856/{z}/{x}/{y}.webp", { minZoom: 12, maxNativeZoom: 16, maxZoom: 19, opacity: 1,
    bounds: [[45.0426, -93.1035], [45.0734, -93.0049]], attribution: "1847–48 survey plat: MnGeo georeferenced GLO plats" });
}

async function loadLayers(map, opt = {}) {
  const base = opt.base || "../data/";
  const [lake, parcels, targets, drain, trail] = await Promise.all([
    getJSON(base + "lake-1855.geojson"), getJSON(base + "parcels.geojson"), getJSON(base + "naming-targets.geojson"),
    getJSON(base + "drainage.geojson"), getJSON(opt.trail || "trail.geojson")]);
  const out = { sites: {} };
  const rings = lake.features[0].geometry.coordinates;
  // water: outer ring with the island cut out; the island drawn on its own
  out.lake = L.polygon(rings.map(ll), { color: "#cfe9f1", weight: opt.thin ? 2 : 2.5, fillColor: C.lake, fillOpacity: opt.fill ?? .42, interactive: false }).addTo(map);
  out.island = L.polygon(ll(rings[1]), { color: C.paper, weight: 1.5, dashArray: "3 4", fill: false, interactive: false }).addTo(map);
  if (opt.lots !== false)
    out.lots = L.geoJSON(parcels, { filter: f => /^abraham/.test(f.properties.group), interactive: false,
      style: { color: C.gold, weight: 2, dashArray: "6 5", fill: false } }).addTo(map);
  const creek = drain.features.find(f => f.properties.id === "lambert-creek-today");
  out.creek = L.geoJSON(creek, { interactive: false, style: { color: "#2f6f9c", weight: 3, opacity: .9 } }).addTo(map);
  if (opt.trail !== false) {
    out.trail = L.geoJSON(trail, {
      style: f => f.properties.kind === "street"
        ? { color: "#ffffff", weight: 4, dashArray: "2 8", lineCap: "round" }
        : f.properties.kind === "boardwalk" ? { color: C.seal, weight: 6, opacity: .95 } : { color: C.seal, weight: 4, opacity: .95 },
      onEachFeature: (f, l) => l.bindTooltip(f.properties.label, { className: "lbl", sticky: true })
    }).addTo(map);
  }
  L.geoJSON(targets, {
    filter: f => f.properties.role !== "creek" || opt.creekLand !== false,
    style: f => ({ color: f.properties.role === "county-park" ? C.gold : "#e8f0d8", weight: 2,
      fillColor: f.properties.role === "county-park" ? C.gold : C.green, fillOpacity: f.properties.role === "creek" ? .18 : .45 }),
    onEachFeature: (f, l) => {
      const r = f.properties.role;
      (out.sites[r] = out.sites[r] || L.featureGroup()).addLayer(l);
      if (opt.tooltips !== false) l.bindTooltip(`${f.properties.name}, ${f.properties.acres} acres`, { className: "lbl" });
    }
  }).addTo(map);
  return out;
}

function label(map, at, text, cls = "", dir = "right") {
  return L.marker(at, { icon: L.divIcon({ className: "tag " + cls + " " + dir, html: `<span>${text}</span>`, iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(map);
}
