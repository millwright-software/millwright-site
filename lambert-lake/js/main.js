/* Load the data, then build the story map and the atlas. */
// the journey's illustrations: img/journey/manifest.json (another agent), else the placeholder manifest
LL.loadIllustrations = async function () {
  for (const url of ["img/journey/manifest.json", "data/mock/journey-illustrations.json"]) {
    try { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) continue; const j = await r.json(); j.__source = url.includes("mock") ? "mock" : "data"; return j; } catch (e) { /* next */ }
  }
  return [];
};
function renderIllustrationCredits(list) {
  const ol = document.getElementById("illus-credits"); if (!ol) return;
  const real = (list || []).filter(m => m && m.file && m.rights !== "mock");
  if (!real.length) { ol.innerHTML = "<li>The period illustrations are being gathered; their credits will appear here.</li>"; return; }
  ol.innerHTML = real.map(m => {
    const who = [m.title ? `<i>${m.title}</i>` : "", m.artist, m.date].filter(Boolean).join(", ");
    if (m.set === "life" && m.caption) return `<li>${who}. ${m.caption} ${m.credit_line || ""}${m.rights ? ` (${m.rights})` : ""}${m.source_url ? ` <a href="${m.source_url}" target="_blank" rel="noopener">source</a>` : ""}</li>`;
    const link = m.source_url ? ` <a href="${m.source_url}" target="_blank" rel="noopener">source</a>` : "";
    return `<li>${who}. ${m.what_it_shows || ""} ${m.how_close || ""} ${m.credit_line || ""}${m.rights ? ` (${m.rights})` : ""}${link}</li>`;
  }).join("");
}
(async function () {
  LL.tileIndex = await LL.loadData("tile-index.json");
  const [years, parcels, points, journey, places, basemaps, lake, illus, itinerary, eustache, generations, descendants, drainage] = await Promise.all([
    LL.loadData("years.json"), LL.loadData("parcels.geojson"), LL.loadData("points.geojson"),
    LL.loadData("journey.geojson"), LL.loadData("journey-places.geojson"), LL.loadData("basemaps.json"),
    LL.loadData("lake-1855.geojson"), LL.loadIllustrations(), LL.loadData("itinerary.json"),
    LL.loadData("eustache-route.geojson"), LL.loadData("generations.json"), LL.loadData("descendants.json"), LL.loadData("drainage.geojson")
  ]);
  renderIllustrationCredits(illus);
  if (basemaps && Array.isArray(basemaps)) LL.applyBasemapMeta(basemaps);
  await LL.probeBasemaps();
  const D = { years: years || [], parcels, points, journey, places, lake, illus: Array.isArray(illus) ? illus : [], itinerary,
    eustache, generations: Array.isArray(generations) ? generations : [], descendants: Array.isArray(descendants) ? descendants : [], drainage };
  const srcs = { years, parcels, points, journey, places, illus, itinerary, eustache, generations, descendants, drainage };
  const mocks = Object.entries(srcs).filter(([, v]) => v && v.__source === "mock").map(([k]) => k);
  if (mocks.length) console.info("Lambert Lake: using mock data for", mocks.join(", "));
  try { LL.story(D); } catch (e) { console.error("story map failed", e); }
  if (D.years.length >= 2) { try { LL.timemap(D); } catch (e) { console.error("time map failed", e); } }
  else document.getElementById("atlas").querySelector(".lead").textContent = "The year-by-year tiles have not been built yet; this map lights up when web/data/years.json and web/tiles/ exist.";
})();
