# Journey illustrations

Period images for the scroll story in `web/data/journey.md`, plus a second set showing the
family's likely surroundings. `manifest.json` is the machine-readable list (one entry per
image, `set` = `journey` or `life`, `beat` = the slug used in the page). Each image exists
three ways:

- `originals/` — the best-resolution file the source offered, untouched (JP2 for the Internet
  Archive book scans; open them with OpenCV or any JPEG 2000 reader).
- `<beat>.jpg` — ~1400 px long side, grayscale ink, warm sepia duotone onto the page paper
  (#f3ecda). Opaque.
- `<beat>-feathered.png` — the same with an alpha vignette that fades into the paper, so it can
  sit on the page without a hard box.

Treatment: grayscale, 0.5–99.5 percentile levels, a light unsharp pass to keep engraved lines
crisp, then an ink-to-paper duotone (#2e241c ink) with a faint sepia multiply in the midtones.
Nothing is enlarged past its source except where noted (Kane's Red River view is 1200 px; the
Krieghoff Lévis view and the St. Paul chapel photo are enlarged 1.3–1.5x).

## Journey set

| beat | image | date | how close | rights |
|---|---|---|---|---|
| levis | W. H. Bartlett, *Quebec, from the opposite shore of the St. Lawrence*, Canadian Scenery vol. 1 | 1840–42 | the Pointe-Lévy shore itself, drawn c. 1838 | PD; IA/U of Toronto scan |
| lawrence | Bartlett, *The Three Rivers*, Canadian Scenery vol. 1 | 1840–42 | the Quebec–Montreal steamer run, same decade | PD |
| rapids | Bartlett, *Long Sault Rapid, on the St. Lawrence*, vol. 1 | 1840–42 | the rapids the stage went round | PD |
| lakes | W. J. Bennett after F. K. Grain, *City of Detroit… from the Canada Shore*, aquatint | 1837 | first big call on the Buffalo–Chicago run, 4 years earlier | CC0, National Gallery of Art |
| illinois | Henry Lewis, *Alton, Illinois*, Das illustrirte Mississippithal | 1854–57 (sketched 1848) | the Alton landing where Illinois River boats met the Mississippi | No Known Copyright, Missouri Historical Society |
| stlouis | J. C. Wild, *Southeast View of St. Louis… with the steamer St. Louis* | 1840 | same waterfront, the year before their winter there | NoC-US, Missouri Historical Society |
| mississippi | Henry Lewis, *Fort Snelling* | 1854–57 (sketched 1848) | the landing where the 1842 boat trip ended | No Known Copyright, Missouri Historical Society |
| redriver | Paul Kane, *Fort Garry and St. Boniface* | 1851–56 (sketched 1846) | St. Boniface a year after they left | PD, National Gallery of Canada |
| camp | Paul Kane, *Camping on the Prairie* | 1846 | a cart camp on the Red River prairie, one year after | PD, Stark Museum of Art |
| trail | *Red River Ox Carts on Main Street in St. Anthony*, photo of a daguerreotype | 1850s | the Woods Trail's last miles, a decade later | NoC-US, Hennepin County Library |
| arrive | Henry Lewis, *St. Paul's im Menesotah Territorium* | 1854–57 (sketched 1848) | St. Paul three years after they settled | PD, Internet Archive |

## Life set

| beat | image | date | how close | rights |
|---|---|---|---|---|
| life-lauzon-church | Bartlett, *Church at Point Levi*, Canadian Scenery vol. 2 | 1840–42 | the Lamberts' own parish church, drawn the year before they left | PD; IA/U of Toronto scan |
| life-lauzon-levis | Cornelius Krieghoff, *Québec vu de la Pointe de Lévy* | 1863 | their shore, two decades on | PD, Montreal Museum of Fine Arts |
| life-lauzon-farm | Krieghoff, *Settler's Log House* | 1856 | a habitant household near Quebec, 15 years on | PD, Art Gallery of Ontario (Google Art Project) |
| life-lauzon-winter | Krieghoff, *Winter Landscape, Laval* | 1862 | Quebec farm winter, two decades on | PD, National Gallery of Canada |
| life-boniface-cariole | Peter Rindisbacher, *A Dog Cariole…* | 1825 | Red River winter, drawn at the settlement 17 years before | PD, Art Gallery of Ontario |
| life-boniface-hunt | Paul Kane, *Half-Breeds Running Buffalo* | 1846 | the Métis summer hunt out of Red River, one year after | PD, Royal Ontario Museum |
| life-canada-dakota | Seth Eastman / J. C. McRae, *Indian Sugar Camp* | 1853 (drawn 1840s) | Dakota life in the Fort Snelling country as they settled | PD, Library of Congress |
| life-canada-stpaul | Strobel / Queen / Duval, *City of St. Paul, Capital of Minesota* | 1853 | the town seven miles south, 8 years on | PD, Library of Congress |
| life-canada-chapel | *Chapel of St. Paul* (Galtier's 1841 log chapel), photograph | c. 1851 | their first Minnesota parish church | PD-US; holder not confirmed |

Full credit lines, source URLs and the rights statement checked for each are in `manifest.json`.

Not found: a period image of the Chicago–Peru stage road (1841), or of Peru, Illinois; a
pre-1860 view of St. Boniface at usable resolution (Napier's 1858 sketch and Rindisbacher's
1822 settlement views exist at Library and Archives Canada, but LAC blocks downloads and the
Commons copies are 640–760 px); Minnesota Historical Society items (their site could not be
reached from here; the Eastman watercolours of Kaposia and the Whitefield 1850s farm sketches
are the ones to get).
