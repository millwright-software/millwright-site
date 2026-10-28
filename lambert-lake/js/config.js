/* Lambert Lake: configuration. Base maps, live services, data paths. Swapping a map is a one-line change here. */
window.LL = window.LL || {};

(function (LL) {
  const R = 20037508.342789244;

  // ArcGIS export services as XYZ tiles: one 256 px web-mercator tile per request
  // (the approach from family/template.html). Used for the county air photos and the GLO plats.
  LL.Export = L.TileLayer.extend({
    // the county and state servers drop requests under load (Chrome reports ERR_BLOCKED_BY_ORB); retry a tile twice before giving up
    createTile(coords, done) {
      const tile = document.createElement("img");
      tile.alt = ""; tile.setAttribute("role", "presentation");
      const url = this.getTileUrl(coords); let tries = 0;
      tile.onload = () => this._tileOnLoad(done, tile);
      tile.onerror = e => { if (tries < 2) { tries++; setTimeout(() => { tile.src = url + "&retry=" + tries; }, 700 * tries); } else this._tileOnError(done, tile, e); };
      tile.src = url;
      return tile;
    },
    getTileUrl(c) {
      const res = 2 * R / 256 / 2 ** c.z, x0 = -R + c.x * 256 * res, y1 = R - c.y * 256 * res;
      const fmt = this.options.fmt || "jpg";
      return `${this._url}?bbox=${x0},${y1 - 256 * res},${x0 + 256 * res},${y1}&bboxSR=3857&imageSR=3857&size=256,256&format=${fmt}&transparent=${fmt === "png"}&f=image`;
    }
  });

  // the local tile pyramids are irregular (warped sheets, clipped frames): data/tile-index.json lists what exists,
  // and a tile outside it is an empty div, not a request that 404s (fade/tile_index.py writes the index)
  LL.tileIndex = null;
  const parsed = {};
  LL.hasTile = function (key, c) {
    const I = LL.tileIndex; if (!I || !key) return true;
    const L1 = I[key]; if (!L1) return true;
    const k = key + "/" + c.z + "/" + c.x;
    if (!(k in parsed)) {
      const r = L1[c.z] && L1[c.z][c.x];
      parsed[k] = r ? r.split(",").map(s => { const [a, b] = s.split("-").map(Number); return [a, b == null ? a : b]; }) : [];
    }
    return parsed[k].some(([a, b]) => c.y >= a && c.y <= b);
  };
  LL.Indexed = L.TileLayer.extend({
    createTile(coords, done) {
      if (!LL.hasTile(this.options.indexKey, coords)) { const d = document.createElement("div"); setTimeout(() => done(null, d), 0); return d; }
      return L.TileLayer.prototype.createTile.call(this, coords, done);
    }
  });
  LL.tileLayer = function (url, opts) {
    const m = /^tiles\/([^/]+)\//.exec(url);
    return m ? new LL.Indexed(url, Object.assign({ indexKey: m[1] }, opts)) : L.tileLayer(url, opts);
  };

  const RAMSEY = y => `https://maps.co.ramsey.mn.us/arcgis/rest/services/OrthoPhotos/Aerial${y}/${y >= 2018 ? "ImageServer/exportImage" : "MapServer/export"}`;

  LL.CONFIG = {
    // data files: the real ones first, the mocks when a real one is missing
    data: { primary: "data/", mock: "data/mock/" },
    // the historical tile pyramids, Web Mercator XYZ, transparent outside the data
    tiles: year => `tiles/${year}/{z}/{x}/{y}.webp`,
    tileOptions: e => ({ minZoom: e.minZoom || 12, maxNativeZoom: e.maxNativeZoom, maxZoom: 19, bounds: e.bounds, noWrap: true, keepBuffer: 3, updateWhenZooming: false }),

    // base maps. type: xyz (tile URL template) | export (ArcGIS export service) | image (a file in maps/ with corner bounds)
    basemaps: {
      // CARTO's basemaps now answer "API KEY REQUIRED" without a key, so the key-free Esri services stand in.
      paper:    { type: "xyz", url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", options: { maxZoom: 20, maxNativeZoom: 16 }, attribution: "Base map: Esri, HERE, Garmin, OpenStreetMap contributors" },
      physical: { type: "xyz", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}", options: { maxZoom: 20, maxNativeZoom: 8 }, attribution: "Base map: Esri, US National Park Service" },
      streets:  { type: "xyz", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", options: { maxZoom: 20, maxNativeZoom: 19 }, attribution: "Streets: Esri, HERE, Garmin, OpenStreetMap contributors" },
      imagery:  { type: "xyz", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", options: { maxZoom: 20, maxNativeZoom: 19 }, attribution: "Imagery: Esri, Maxar, Earthstar Geographics" },
      glo:      { type: "export", url: "https://feat.gisdata.mn.gov/arcgis/rest/services/MnGeo/MN_GLO_Plats_cached/MapServer/export", options: { maxZoom: 19, fmt: "jpg" }, attribution: "GLO survey plats: MnGeo / Minnesota Historical Society" },
      // the period maps for the journey, warped to Web Mercator and tiled by another agent (tiles/<id>/); data/basemaps.json
      // may override minZoom, maxNativeZoom, bounds and credit. Probed at load: if the tiles are not there yet the layer is skipped.
      burr1839:     { type: "xyz", url: "tiles/burr1839/{z}/{x}/{y}.webp", probe: true, options: { minZoom: 3, maxNativeZoom: 7, maxZoom: 20, bounds: [[16.0, -133.0], [51.9, -60.6]], noWrap: true }, attribution: "Burr 1839, Library of Congress" },
      nicollet1843: { type: "xyz", url: "tiles/nicollet1843/{z}/{x}/{y}.webp", probe: true, options: { minZoom: 5, maxNativeZoom: 9, maxZoom: 20, bounds: [[38.4, -101.3], [48.75, -88.55]], noWrap: true }, attribution: "Nicollet 1843, Library of Congress" }
    },
    // which base the journey uses for the continental overview and for the 1845 cart trail
    // bottom first. CARTO light was the planned fallback; it now needs an API key, so Esri's physical map stands under the period sheets.
    journeyBase: { overview: ["physical", "burr1839"], trail: ["physical", "burr1839", "nicollet1843"] },

    // live services by year: the county's own air photo for that year (fills in where the tiles end), and the plats for the 1850s
    live: Object.assign({ 1856: "glo", 1859: "glo" },
      Object.fromEntries([1940, 1953, 1974, 1985, 1991, 2003, 2006, 2011, 2017, 2024].map(y => [y, RAMSEY(y)]))),

    // colors for the family's land, matched to the stylesheet
    colors: { "abraham-island": "#8a2a22", "abraham-gervais": "#8a2a22", "louis-gervais": "#a4853f", route: "#3f6873", ink: "#251e15" },

    reducedMotion: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  };

  // merge data/basemaps.json ([{id, title, credit, license, minZoom, maxNativeZoom, bounds}]) into the basemap entries
  LL.applyBasemapMeta = function (list) {
    for (const m of list || []) {
      const key = String(m.id || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
      const b = LL.CONFIG.basemaps[key]; if (!b) continue;
      if (m.minZoom != null) b.options.minZoom = m.minZoom;
      if (m.maxNativeZoom != null) b.options.maxNativeZoom = m.maxNativeZoom;
      if (m.bounds) b.options.bounds = m.bounds;
      if (m.credit) b.attribution = m.credit;
      b.title = m.title;
    }
  };
  // which probed tile sets exist (filled by LL.probeBasemaps)
  LL.available = {};
  LL.probeBasemaps = async function () {
    const jobs = Object.entries(LL.CONFIG.basemaps).filter(([, b]) => b.probe).map(async ([key, b]) => {
      const z = b.options.minZoom || 3, n = 2 ** z, bb = b.options.bounds;
      const lat = (bb[0][0] + bb[1][0]) / 2, lng = (bb[0][1] + bb[1][1]) / 2;
      const x = Math.floor((lng + 180) / 360 * n), y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
      try { const r = await fetch(b.url.replace("{z}", z).replace("{x}", x).replace("{y}", y), { method: "HEAD" }); LL.available[key] = r.ok; }
      catch (e) { LL.available[key] = false; }
    });
    await Promise.all(jobs);
    return LL.available;
  };

  // build a Leaflet layer from a basemap entry (null when a probed tile set is not there yet)
  LL.baseLayer = function (key, extra) {
    const b = LL.CONFIG.basemaps[key];
    if (!b) throw new Error("no basemap " + key);
    if (b.probe && LL.available[key] === false) return null;
    const opts = Object.assign({ attribution: b.attribution }, b.options || {}, extra || {});
    if (b.type === "xyz") return LL.tileLayer(b.url, opts);
    if (b.type === "export") return new LL.Export(b.url, opts);
    if (b.type === "image") return L.imageOverlay(b.url, b.bounds, opts);
    throw new Error("unknown basemap type " + b.type);
  };

  // a live layer for a year: a basemap key or an export URL
  LL.liveLayer = function (year, extra) {
    const v = LL.CONFIG.live[year];
    if (!v) return null;
    if (LL.CONFIG.basemaps[v]) return LL.baseLayer(v, extra);
    return new LL.Export(v, Object.assign({ maxZoom: 19, attribution: "Ramsey County GIS" }, extra || {}));
  };

  // fetch a data file, falling back to the mock of the same name
  LL.loadData = async function (name) {
    const c = LL.CONFIG.data;
    for (const dir of [c.primary, c.mock]) {
      try {
        const r = await fetch(dir + name, { cache: "no-cache" });
        if (!r.ok) continue;
        const j = await r.json();
        j.__source = dir === c.mock ? "mock" : "data";
        return j;
      } catch (e) { /* try the next */ }
    }
    return null;
  };
})(window.LL);
