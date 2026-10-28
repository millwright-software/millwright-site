# The Lambert journey, 1841–1845

Data for the scroll-animated "journey" section. Companion files: `journey.geojson` (one LineString per leg, properties `leg`, `from`, `to`, `year`, `mode`, `est_days`, `est_days_range`, `confidence`, `note`, `sources`, `length_mi`, `alternative`) and `journey-places.geojson` (points with `label`, `note`, `year`, `role`, `confidence`).

What is **documented** about the trip fits in four sentences. Neill (1881): "Abram Lambert with his family of wife and three sons and three daughters left Lower Canada, in 1841 and went to St. Louis by boat and spent the winter. They came via boat to St. Paul, then to Red River with the idea of seeking a home in Oregon. They were persuaded to give up the trip on account of the dangers that beset their way. They remained in Red River until 1845, when they returned and settled on section 8, of this town" [1]. The gravestone compresses it: "came to St. Boniface on the Red River in 1841 and to Little Canada in 1845" [3]. Wall (1964), from the Belland family manuscript, adds that Rose Angélique Lambert married Alexander Ducharme at St. Boniface on 26 November 1844 and that the couple "brought along Rose's mother and father, Abraham and Angelique DeMers Lambert and their children" [2]. No source names a road, a boat, a trail or a date of departure. Everything else below is reconstruction from period travel guides and trail histories, and is labelled as such in the text.

## Beats for the scroll story

**1. 1841, Lévis.** Abraham Lambert, born in the Lauzon seigneury across the river from Quebec in 1792, leaves Lower Canada in 1841 with his wife Angélique Demers and six children, three sons and three daughters [1][3]. Rose Angélique, the eldest known, is eighteen; Joseph Modeste, the youngest known, is three [4].

**2. Up the St. Lawrence and over the lakes (reconstructed).** Neill says only that they "went to St. Louis by boat" [1]. The 1840–41 travellers' guides describe one westbound chain from Montreal: stage to Lachine, steamer to the Cascades, stage to Coteau du Lac, steamer to Cornwall, stage past the Long Sault, steamer to Prescott and Kingston, then a Lake Ontario steamer to Lewiston and the 22-mile railroad to Buffalo, "the alternating between steamers and stage coaches, rendered necessary by the frequent rapids in the St. Lawrence" [5][6]. Montreal to Buffalo was 436–451 miles and $17.50–19.50 a cabin fare [5].

**3. Buffalo to Chicago, about a week (reconstructed).** In 1841 "six boats of the largest class ran from Buffalo to Chicago, making fifteen day trips" (round trips), a line built on "emigrants with their household furniture and farming implements" [7]. One dated passage survives: Wilford Woodruff left Buffalo on the Chesapeake on 21 September 1841, touched at Cleveland, Detroit and the Manitou Islands, and reached Chicago on the 28th, steerage $10 a head [8]. Buffalo to Detroit alone took "about 36 hours" [5].

**4. Chicago to St. Louis, then winter (route reconstructed; the winter documented).** The canal from Chicago to the Illinois River did not open until 1848. In 1841 "stages also leave daily ... for Peru, the head of steamboat navigation on the Illinois river, passing through Juliette [Joliet] ... 30 miles distant; Ottawa ... 53 miles farther; whence to Peru is 17 miles," and "from Peru, steamboats are taken ... for Alton, on the Mississippi ... whence to St. Louis is 21 miles" [5]. At St. Louis the family "spent the winter" of 1841–42 [1].

**5. Spring 1842, up the Mississippi (documented route, reconstructed timing).** "They came via boat to St. Paul" [1]: about 660 river miles past Galena, Prairie du Chien and Lake Pepin to the landing under Fort Snelling, where Mendota's fur post and a few cabins at Pig's Eye were all there was of St. Paul. Boats that far up were rare before 1844, "not likely ... more than twenty-five a year," and "trips were made only when a sufficient cargo was offered" [9]; Galena packets were regular, so a family probably changed boats and waited there [9]. Allow two to three weeks.

**6. North to Red River and the Oregon idea (reconstructed trail; the Oregon plan documented).** The Lamberts went "to Red River with the idea of seeking a home in Oregon" and "were persuaded to give up the trip on account of the dangers that beset their way" [1]. The Red River emigration to Oregon had already gone: James Sinclair led 121 people out of Fort Garry on 3 June 1841 and reached Fort Vancouver after 130 days [10], and the Hudson's Bay Company sponsored no second party until 1854 [11]. The only established cart road north from Mendota in 1842 was the Minnesota Valley trail, by Traverse des Sioux, Lac qui Parle and Lake Traverse to the plains ridge west of the Red, Pembina and St. Boniface [12]; "the down trip would generally consume from 30 to 40 days" at "an average day's travel [of] 15 miles" [13].

**7. St. Boniface, 1842–1845 (documented).** The family lived in Bishop Provencher's parish for three or four years. On 26 November 1844 Rose Angélique married Louis Alexander Ducharme, a ward of the bishop, at St. Boniface [2]. That same year Norman Kittson sent the first six "Pembina carts" of furs south to Mendota, and a summer clash between Dakota and Métis closed the plains road long enough for stranded traders to cut a new "Woods Trail" home through Ojibwe country by way of Crow Wing [12][13].

**8. 1845, carts squeal south (reconstructed trail; the move documented).** "Alexander and his wife, Rose, brought along Rose's mother and father ... and their children" [2]; the Lamberts "returned and settled on section 8" in 1845 [1]. No source says which trail. The GeoJSON draws the Woods Trail, down the east side of the Red valley, over the Old Crossing of the Red Lake River, past Detroit and Otter Tail lakes and down the Leaf River to the Mississippi ford at Crow Wing, then the east bank by Sauk Rapids to St. Anthony Falls and St. Paul [12][14][15][16]. Williams, writing in 1876 from Kittson-era memory, gives "the nearest traveled route those days" as 448 miles "via Otter Tail and Sauk Rapids," caravans starting "early in June, as soon [as] there was sufficient pasturage for the cattle," arriving "early in July" [13]. The alternative, Kittson's own Minnesota Valley route "via Big Stone Lake and Traverse de Sioux" [13], is included as a dashed line.

**9. Lake Gervais.** Abraham took section 8 on the south shore of Lake Gervais, seven miles north of St. Paul, with the Ducharmes on section 18 [1][2]. On 25 March 1849 he patented the two lake lots there and, as "Abraham Lombert," lots 6 and 7 of section 29 to the north, the whole of the island in the lake that would carry his name [17].

## Travel times, with sources

| Leg | Mode | Period figure | Source |
|---|---|---|---|
| Montreal–Buffalo | steamer + stage + rail | 436–451 mi; fare $17.50–19.50 (1840); guides imply 3–4 days | Davison 1840 [5]; Dwight 1841 [6] |
| Buffalo–Detroit | lake steamer | "about 36 hours" (1840) | Davison 1840 [5] |
| Buffalo–Chicago | lake steamer | 7 days, 21–28 Sept 1841, steerage $10 per adult; 1841 line of six boats "making fifteen day trips" (round trip); by 1850 "three or four days" | Woodruff journal [8]; Mansfield 1899 [7] |
| Detroit–Chicago | lake steamer | "once a fortnight, by way of Lake Huron" (1840 schedule) | Davison 1840 [5] |
| Chicago–Peru | stage | 100 mi via Joliet and Ottawa, daily stages (1840) | Davison 1840 [5] |
| Peru–St. Louis | Illinois River steamboat | 60 + 149 + 21 = 230 mi; 2–3 days at steamboat speeds (estimate) | Davison 1840 [5] |
| St. Louis–Fort Snelling | Mississippi steamboat | no 1842 day-count found; boats irregular, ≤ 25 a year before 1844, 41 in 1844; allow 2–3 weeks including a wait at Galena | Petersen 1937 [9] |
| Pembina/Red River–St. Paul | ox cart | 448 mi "via Otter Tail and Sauk Rapids"; 30–40 days; 15 mi/day; start early June, arrive early July | Williams 1876, pp. 304–05 [13] |
| Red River cart, pace | ox cart | "about twenty miles a day, of ten travelling hours, the load averaging about eight hundred pounds per cart" | Hargrave 1871, p. 60 [18] |
| Red River–St. Paul round trip | ox cart | "two months to make the trip from Red River to St. Paul and back, travelling at the rate of twenty miles per day" (Charles Mair, 1868) | Hargrave 1871, p. 452 [18] |
| Red River–St. Paul, light horse carts | horse cart | "three weeks travelling across the plains to St. Paul," spring 1848 | Healy 1923, pp. 26–27 (Harriet Cowan) [19] |
| Pembina–Crow Wing | ox cart | about 400 mi in "fifteen days' journey," October 1860 | Schultz 1894 [14] |
| Red River–St. Paul | ox cart | "about six weeks on the trail" (summary of Gilman 1979) | [15] |
| Pace, general | ox cart | 15–20 mi/day (North Dakota State Historical Society); 15 mi/day, 400 mi (Minnesota marker) | [20][21] |

The GeoJSON uses: steamboat legs 1–2 days each on the St. Lawrence, 7–10 days Buffalo–Chicago, 2–4 days Peru–St. Louis, 8–21 days St. Louis–Fort Snelling; ox-cart legs 30–40 days (Woods Trail, 1845) and 30–45 days (Minnesota Valley trail, 1842 and the 1845 alternative). The drawn 1845 line measures 463 miles, close to Williams's 448; the real track wandered more than the drawing.

## Which trail in 1845, and why it cannot be settled

Three cart roads existed by summer 1845. The **Minnesota Valley / West Plains trail** was the oldest and Kittson's own until 1854 [12]; the **Middle trail** by Sauk Rapids had been opened "in the early 1840s" but was closed in 1844 by the Dakota–Métis fight [12]; the **Woods trail** by Crow Wing was cut in late 1844 by traders going home from St. Paul, followed south by a party in 1845 and "well-established" by 1846 [12][15]. For a French-Canadian family travelling with Métis in-laws the year after the Dakota fight, the Woods trail is the safer guess, and Williams's 448-mile "nearest traveled route" is that road [13]. But Kittson's 1845 brigade used the plains route, and a family attaching itself to his carts would have gone that way. The Belland manuscripts ("The Abraham Lambert Family"; "The Louis Alexander Charron (dit Ducharme) Family," in Msgr. Durand's possession at St. John's, Little Canada, in 1964 [2]) are the only place a real answer is likely to survive.

One more conflict is left in the data: the stone's "St. Boniface ... in 1841" against Neill's winter at St. Louis, which puts the family on the Red River in 1842 [1][3]. The legs are dated by Neill's itinerary.

## Sources

1. Edward D. Neill, *History of Ramsey County and the City of St. Paul* (Minneapolis, 1881), p. 289 (New Canada chapter). https://archive.org/details/historyoframseyc00warn
2. Mary D. Wall, "Little Canada: a 'Petit Canada' in Minnesota," *Ramsey County History* 1, no. 2 (Fall 1964), pp. 10–12, citing George Belland, "The Abraham Lambert Family" and "The Louis Alexander Charron (dit Ducharme) Family," unpublished manuscripts. https://rchs.com/wp-content/uploads/2015/11/RCHS_Fall1964_Wall.pdf
3. Find a Grave memorial 50657843, Abraham Lambert, St. John's Cemetery, Little Canada, gravestone inscription as transcribed. https://www.findagrave.com/memorial/50657843/abraham-lambert
4. Children's dates from the linked Find a Grave memorials (uncited there); see `notes/abraham-lambert.md`.
5. G. M. Davison, *The Traveller's Guide through the Middle and Northern States and the Provinces of Canada* (Saratoga Springs, 1840 ed.), routes Montreal–Buffalo, Buffalo–Detroit, Detroit–Chicago, Chicago–Peru–St. Louis. https://archive.org/details/cihm_33368
6. Theodore Dwight, *The Northern Traveller* (New York, 1841), Montreal–Lewiston table. https://archive.org/details/northerntravelle00dwig
7. J. B. Mansfield, *History of the Great Lakes*, vol. 1 (Chicago, 1899), quoting the contemporary lake-trade reports for 1839–41 and the c. 1850 line. https://archive.org/details/historyofgreatla01mans
8. Wilford Woodruff, journal, 19–28 September 1841 (steamboat Chesapeake, Buffalo to Chicago). https://wilfordwoodruffpapers.org/documents/a9d1a2cb-18fe-445d-a5e4-350caaf63442
9. William J. Petersen, *Steamboating on the Upper Mississippi* (Iowa City, 1937), pp. 143–44, 235–36. https://archive.org/details/steamboatingonup00pete
10. Lawrence J. Barkwell, "Sinclair Expedition to the Oregon Territory," Louis Riel Institute (2007), Métis Museum resource 07187. https://www.metismuseum.ca/resource.php/07187
11. "Sinclair, James," *Dictionary of Canadian Biography*, vol. 8. https://www.biographi.ca/en/bio/sinclair_james_8E.html
12. Demian and Jeffrey A. Hess, "Minnesota Red River Trails, 1835–1871," National Register of Historic Places Multiple Property Documentation Form (Minnesota SHPO, July 1989), section E. https://npgallery.nps.gov/NRHP/GetAsset/NRHP/64500284_text
13. J. Fletcher Williams, *A History of the City of Saint Paul, and of the County of Ramsey, Minnesota* (St. Paul, 1876), pp. 304–05. https://archive.org/details/historyofcityofs00will
14. John C. Schultz, "The Old Crow Wing Trail," *Transactions of the Manitoba Historical and Scientific Society*, ser. 1, no. 45 (1894). https://mhs.mb.ca/docs/transactions/1/crowwingtrail.shtml
15. Rhoda R. Gilman, Carolyn Gilman and Deborah M. Stultz, *The Red River Trails: Oxcart Routes between St. Paul and the Selkirk Settlement, 1820–1870* (St. Paul: Minnesota Historical Society Press, 1979), pp. 9–10, 34–50, 55–68, 79–87; not openly online, used through the page-cited summary at https://en.wikipedia.org/wiki/Red_River_Trails and the NRHP forms.
16. NRHP nominations 90002201, "Red River Trail (Woods Trail): Crow Wing Section" (Crow Wing State Park, T44N R32W secs. 23 and 26), and 90002202, "Red River Trail (Woods Trail): Goose Lake Swamp Section" (Polk Centre Twp., Pennington County, T152N R45W; UTM 14 687880 5317030 = 47.979 N, 96.482 W), both 1990. https://npgallery.nps.gov/AssetDetail/NRIS/90002201 ; https://npgallery.nps.gov/NRHP/GetAsset/NRHP/90002202_text
17. BLM General Land Office patents, Falls St. Croix certificates 59 and 137, 25 March 1849 (accessions MN2090__.005 and .032); images in `sources/records/`. https://glorecords.blm.gov/
18. Joseph James Hargrave, *Red River* (Montreal, 1871), pp. 60 (cart pace and load) and 452 (Charles Mair letter). https://archive.org/details/redriver00harggoog
19. W. J. Healy, *Women of Red River* (Winnipeg, 1923), pp. 26–27 (Harriet Goldsmith Sinclair Cowan on her 1848 trip). https://archive.org/details/womenofredriverb00unse
20. State Historical Society of North Dakota, "Backstage Pass" blog, Red River trails and carts. https://blog.statemuseum.nd.gov/blog/70
21. Minnesota historical marker "Red River Ox Cart Trails," as transcribed. https://readtheplaque.com/plaque/red-river-ox-cart-trails
22. Route geometry: the lines follow OpenStreetMap waterways and rail corridors, Natural Earth 10m river centerlines (`rivers_lake_centerlines`, `rivers_north_america`, public domain), and roads traced from the 1850s–70s GLO survey plats; gaps are hand-routed by terrain. Each feature carries a `geometry_source`. The 1845 Woods Trail as drawn measures 468 miles (Williams 1876 gives 448). Route lines: © OpenStreetMap contributors (ODbL).

## Map layers

No georeferenced tile service could be found or used for any 1835–50 map: Allmaps holds no annotations for the LOC, UMN or Leventhal scans (image-id lookups return 404 and `allmaps.xyz` serves a 4 KB placeholder tile), and David Rumsey's Georeferencer pages, item pages and API sit behind Cloudflare and need a per-site key, so no `maps.georeferencer.com/.../{z}/{x}/{y}.png` template could be obtained or tested. Two full-resolution Library of Congress scans were downloaded instead; control points and graticule pixel positions are in `map-layers.json` for a GCP warp (`gdal_translate -gcp ...; gdalwarp -tps -t_srs EPSG:3857`, then tile). Both are conic projections, so a plain corner-bounds overlay is only approximate.

**A. Burr 1839 — continental overview for the 1841 legs.** `maps/burr-1839-united-states-north-america-loc.jpg`, 14985 × 11114 px, 34.8 MB (downscale or tile before serving). David H. Burr, *Map of the United States of North America with parts of the adjacent countries* (London: J. Arrowsmith, 1839), Library of Congress G3700 1839 .B8, https://www.loc.gov/item/98688304/. Rights: LOC Geography and Map Division, "free to use and reuse unless a Rights Advisory statement is present" (none). Credit: *David H. Burr, "Map of the United States of North America with parts of the adjacent countries" (London: J. Arrowsmith, 1839). Library of Congress, Geography and Map Division.* Sheet covers roughly 51.9 N to 16 N and 133 W to 60.6 W; Quebec, Montreal, the lakes, Chicago, St. Louis, Pembina and "Ft Gerry" with the "Assiniboine Set." are all on it. Checked control points (px → lat, lon): Fort Garry 7300, 820 → 49.889, −97.129; Pembina 7275, 1135 → 48.966, −97.244; Chicago 9600, 3330 → 41.88, −87.63; St. Louis 9045, 4390 → 38.63, −90.20; Quebec 12993, 1463 → 46.81, −71.21; Montreal 12607, 1912 → 45.50, −73.57; Fond du Lac 8380, 1825 → 46.72, −92.10; New Orleans 9225, 7145 → 29.95, −90.07. Affine residuals reach 0.35° at the edges; a sheet fold runs vertically near x ≈ 7520, just east of the Red River.

**B. Nicollet 1843 — the upper Mississippi for the 1842 and 1845 legs.** `maps/nicollet-1843-upper-mississippi-loc.jpg`, 9484 × 11491 px, 11.1 MB. J. N. Nicollet, *Hydrographical Basin of the Upper Mississippi River* (Washington: U.S. Senate, 1843; 1:1,200,000), Library of Congress G4042.M5 1843 .N5, https://www.loc.gov/item/78692260/. Rights: as above (none). Credit: *J. N. Nicollet, "Hydrographical Basin of the Upper Mississippi River" (Washington: U.S. Senate, 1843). Library of Congress, Geography and Map Division.* Neatline 150, 150 – 9333, 11190 px; top edge ≈ 48.75 N at the centre, bottom ≈ 38.4 N, left ≈ 101.3 W, right ≈ 88.55 W (Greenwich). Checked control points: Falls of St. Anthony 6048, 4195 → 44.981, −93.258; Fort Snelling 6118, 4308 → 44.893, −93.180; Prairie du Chien 7757, 6240 → 43.051, −91.141; Crow Wing mouth 5140, 2805 → 46.272, −94.339; mouth of the Missouri 8720, 10700 → 38.811, −90.117; St. Louis 8690, 10890 → 38.627, −90.199. **It stops at 48.75 N: Pembina and St. Boniface are off the sheet**, so the north end of the 1845 leg (and all of the Red River part of the 1842 leg) must sit on the Burr map, or on Pope's 1849 Minnesota map (LOC https://www.loc.gov/item/74696065/, also to ~49 N) if a closer period sheet is wanted.

## Itinerary (working reconstruction, `itinerary.json`)

Nothing below is documented except the year anchors (left 1841; wintered at St. Louis; Red River 1842 by Neill's order, 1841 by the stone; wedding at St. Boniface 26 Nov 1844; Little Canada 1845). Every other date is set by the navigation seasons, the 1840–41 guidebook schedules, one dated 1841 lake passage and 1840s cart speeds, and is marked assumed or reconstructed in the file. The scenario is a spring 1841 departure; a post-harvest departure (September–October 1841) is equally consistent with Neill and would shift the 1841 rows about four months later without changing 1842.

| Dates (est.) | Days | Leg or stay | Why these dates |
|---|---|---|---|
| to 10 May 1841 | — | Lévis: departure window 1 May – 15 Jun | St. Lawrence shipping "interrupted between November and May" [23]; spring departure after the thaw assumed |
| 10–11 May | 1 (1–2) | Lévis → Montreal, steamer | daily Quebec–Montreal steamers, 180 mi, timed to the tide [5][6] |
| 11–13 May | 2 (1–3) | Montreal layover | connection to the Lachine stage and the Upper Canada line [5] |
| 13–15 May | 2 (2–3) | Montreal → Kingston, steamer + stage | Dwight: Niagara–Montreal by the lake steamers "performed in about two days" [6] |
| 15–17 May | 2 (1–3) | Kingston → Lewiston → Buffalo | lake steamer ~1 day; stage 7 mi + railroad 22 mi [5] |
| 17–19 May | 2 (1–4) | Buffalo, wait for a Chicago boat | six boats on fifteen-day round trips = a sailing every 2–3 days [7]; Woodruff waited 2 days [8] |
| 19–27 May | 8 (7–10) | Buffalo → Chicago, lake steamer | Woodruff 21–28 Sept 1841 [8]; Buffalo–Detroit 36 h [5]; lakes open from ~24–26 April [24][25] |
| 27–29 May | 2 (1–3) | Chicago | daily stages to Peru; a wagon for the family takes a day to hire [5][8] |
| 29–31 May | 2 (1–4) | Chicago → Peru, stage or wagon | 100 mi by Joliet and Ottawa [5] |
| 31 May – 2 Jun | 2 (1–4) | Peru, wait for a boat | several St. Louis boats a week in season [26] |
| 2–5 Jun | 3 (2–4) | Peru → St. Louis, Illinois River steamer | 230 mi downstream [5] |
| 5 Jun 1841 – 20 Apr 1842 | ~10 months | **St. Louis, the winter (documented)** | Neill [1]; departure set by the upper-river opening: first boat to Fort Snelling "about May 1" 1840, 6 April 1844–45, average 13 April [9][13] |
| 20–25 Apr 1842 | 5 (4–6) | St. Louis → Galena, packet | regular St. Louis–Galena packets [9] |
| 25 Apr – 3 May | 8 (3–14) | Galena, wait for a Fort Snelling boat | boats above Galena "only when a sufficient cargo was offered"; ≤ 25 a year [9] |
| 3–8 May | 5 (3–7) | Galena → Fort Snelling / Mendota | ~300 river miles; Neill: "came via boat to St. Paul" [1][9] |
| 8 May – 25 Jul | ~78 (30–100) | Mendota, waiting for a northbound cart party | Red River traders came to Mendota each summer since 1835 [12], arrived early July, traded ~3 weeks, went home late July [13][15] |
| 25 Jul – 5 Sep 1842 | 42 (30–50) | Mendota → St. Boniface, ox cart, Minnesota Valley trail | 596 mi at 15–20 mi/day [13][18]; the Grey Nuns by the same road reached St. Boniface "late in September" 1850 [19] |
| 5 Sep 1842 – 29 May 1845 | ~2.7 yr | **St. Boniface (documented)**; wedding 26 Nov 1844 | Neill [1]; Wall [2]; stone says from 1841 [3] |
| 29 May – 2 Jun 1845 | 4 (3–5) | St. Boniface → the border | 70 mi; caravans start "early in June, as soon [as] there was sufficient pasturage" [13] |
| 2 Jun – 5 Jul | 33 (30–40) | border → St. Paul, ox cart (Woods Trail; alternative Minnesota Valley) | Williams: 448 mi "via Otter Tail and Sauk Rapids", 30–40 days, 15 mi/day, "arriving here early in July" [13] |
| 6 Jul 1845 | 1 | St. Paul → Lake Gervais | seven miles by Gervais's 1844 trail [2] |
| from 6 Jul 1845 | — | **Little Canada (documented year)** | Neill [1]; Wall [2]; patents 25 Mar 1849 [17] |

Each `itinerary.json` entry carries `basis`, `sources`, `confidence` and a `map_view` (`center`, `zoom`, and 1–6 `path` points for the camera): the Montreal–Kingston rapids corridor, the Niagara portage, the lakes with Detroit and Mackinac, the prairie stage road to Peru, the Illinois, the Keokuk rapids and Galena, Lake Pepin and Fort Snelling, the Minnesota valley and Lake Traverse, the Woods Trail crossings, and Lake Gervais.

Additional sources for the itinerary:

23. Pointe-à-Callière, "The Port of Montreal" (shipping "interrupted between November and May" until the mid-20th century). https://montrealcapitale-simple.pacmusee.qc.ca/en/carousel/3-1/architecture-3/the-port-of-montreal-0
24. Increase A. Lapham, *Geographical and Topographical Description of Wisconsin* (1844): first steamboat at Milwaukee, 25 April 1841 (Great Western); mean 26 April, "about the same time that Lake Erie is opened at Buffalo." https://fromthepage.com/wiscribes/increase-lapham/box-27-folder-1-geographical-and-topographical-description-of-wisconsin-1844
25. Mansfield, *History of the Great Lakes* (1899), chronology: navigation opened at Buffalo 24 April 1840 with the steamer Chesapeake. https://www.maritimehistoryofthegreatlakes.ca/documents/hgl/
26. Illinois State Museum, "The Steamboat Era in Illinois": Peru "the virtual head of navigation"; one captain's 58 St. Louis–Peru trips in 1839. https://www.museum.state.il.us/RiverWeb/landings/Ambot/Archives/vignettes/economy/Steamboat_20Era.html
