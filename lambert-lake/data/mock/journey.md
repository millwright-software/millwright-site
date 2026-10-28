# The journey, 1841–1845 (MOCK)

Placeholder written by the web page agent so the page can be built. The real `web/data/journey.md`
replaces this file. Every line and day count in `journey.geojson` here is a placeholder; the only
documented facts are the stops and the order, from Neill (1881) p. 289 and Wall (1964) p. 10.

## Beats

1. 1841. "Abram Lambert with his family of wife and three sons and three daughters left Lower Canada, in 1841 and went to St. Louis by boat and spent the winter." (Neill 1881, p. 289)
2. 1842. "They came via boat to St. Paul, then to Red River with the idea of seeking a home in Oregon. They were persuaded to give up the trip on account of the dangers that beset their way." (Neill)
3. 26 Nov 1844. Rose Angélique marries Louis Alexander Ducharme at St. Boniface. (Wall 1964, p. 10)
4. 1845. "They remained in Red River until 1845, when they returned and settled on section 8." (Neill) "Alexander and his wife, Rose, brought along Rose's mother and father, Abraham and Angelique DeMers Lambert and their children." (Wall)

## Map layers

None yet. The page falls back to a muted modern base (CARTO light_nolabels, tinted). To add a
historical base map, list it here and in `web/js/config.js` under `basemaps`, either as

- `xyz`: a tile URL template, or
- `image`: a file in `web/maps/<name>.jpg` with corner bounds `[[south, west], [north, east]]`.

Then point `journeyBase.overview` or `journeyBase.trail` at its key.
