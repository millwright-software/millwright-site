# Listen

Each Season One radio episode plays while the map animates in step with the narration.

    python3 web/listen/serve.py              # serves web/ on port 8804
    open -g http://127.0.0.1:8804/listen/?ep=1

Serving the repo root also works (`python3 web/listen/serve.py 8804 .`, then `/web/listen/?ep=1`): the page sets
`<base href="../">`, so every path resolves from `web/` either way. **Use `serve.py`, not `python3 -m http.server`.**
The plain server ignores HTTP Range requests, so Chrome can't seek in the MP3, and every seek snaps back to 0:00.

Keys: Space plays and pauses, the arrow keys skip ten seconds, and C turns subtitles on and off. `?ep=4&t=550` opens at a time.

## Files

| File | What it is |
|------|-----------|
| `index.html`, `listen.js`, `listen.css` | The player. The engine is copied from `js/story.js` and doesn't import it. |
| `cues/epNN.json` | The exact timeline of each mixed MP3, written by `radio/season1/cues.py`. |
| `scenes/epNN.json` | The hand-cut scene track: what the map shows, and when. |
| `covers/` | The episode covers from `radio/covers/`, resized to 480 px. |
| `audio/epNN.mp3` | Copies of `radio/season1/epNN-chatterbox.mp3`, gitignored. When they're missing, the page falls back to `../radio/season1/epNN-chatterbox.mp3`, which only works when the repo root is served. |

Refresh the audio after a re-render:

    for n in 1 2 3 4 5 6; do cp radio/season1/ep0$n-chatterbox.mp3 web/listen/audio/ep0$n.mp3; done

## Cues

    VENV=/Users/erichey/Desktop/vault/tools/podcast/.venv/bin/python
    $VENV radio/season1/cues.py --verify

`render.mix(ep, engine, want_cues=True)` runs the mixer's own story cursor (`story_timeline`): the same gaps, the
same sfx and music advances, and the same seeded RNG. It stops before the beds and the mixdown. A line's
`t_start`/`t_end` is its audible speech (−40 dBFS). `--verify` cross-correlates eight line WAVs per episode
against the decoded MP3. On 2026-10-28 all six episodes measured 0.000–0.001 s. **Re-export the cues after any
re-render**, because a changed line moves everything after it.

## Scene format

One object per scene. A scene runs until the next scene's `t`.

| Key | Meaning |
|-----|---------|
| `t` | Start, in seconds of audio. The camera takes `move` seconds (default 3.5, at most 45% of the scene) to travel from the previous scene's last view, along Leaflet's flyTo curve. |
| `view` | `{center:[lat,lng], zoom}`, or `{fit:"<id>", maxZoom, pad}`, or `{bounds:[[s,w],[n,e]]}`, or `{follow: zoom}`, which centres on the marker at one fixed zoom, so zoom is monotonic along a leg. Fit ids: `atlantic`, `journey`, `world`, `lake`, `island`, `farm`, `gervais`, `home`, `park`, `route:<leg>`. |
| `view_to` | An optional second view to drift to (eased) over the scene. |
| `base` | Base layers, bottom first: the `config.js` keys (`physical`, `burr1839`, `nicollet1843`, `paper`, `imagery`…) or `y:<year>` for a local tile year (`y:1856`). They crossfade over 1.4 s at scene edges, and the next scene's layers load ahead at opacity 0. |
| `route` | `{leg, from_frac, to_frac, t0?, t1?, linear?, history?, todo?}`. The leg is drawn from `from_frac` to `to_frac` over the scene (eased unless `linear`). Legs: `1`–`9` (`data/journey.geojson`), `sea`, `huron` (`eustache-route.geojson`), `oregon` (Modeste's road, approximate) and `walk-north`. The earlier legs of the same group are drawn in full unless `history:false`. |
| `drawn` | More legs to show in full. |
| `marker` | `{mode, at}` (a fixed `[lat,lng]` or a point id: `house`, `church`, `ring`), `{mode}` (it rides the route), or `{mode, along:{leg, from, to}}`. Modes: ship, canoe, boat, stage, rail, cart, walk, tent, house, boy, letter, star. |
| `pins` | `[{at, label, dir}]`, small labelled dots. |
| `image` | A manifest beat (`img/journey/manifest.json`), shown as a framed picture. |
| `caption`, `date` | The caption card. |
| `season` | A seasons.js phase, **not a calendar fraction**: `.0` spring, `.25` summer, `.5` fall, `.75` winter. Each season holds for the first 70% of its quarter, so mid-August is about `.4`. `[a, b]` runs a to b across the scene; `[Y, Y+0.99]` is one full cycle. |
| `emphasis` | Season strength, 0–1. The default is 0.3. It is 1 only at story moments: the St. Louis winter, the hail, summer on the trail, the Cloquet fire. |
| `fx` | `hail` or `haze`, ramped in and out at the scene's edges. |
| `ribbon` | A generation number (1–6 from `generations.json`, 7–12 from `descendants.json`): the name and years on screen. |
| `trees` | `{from, to}`: the Lauzon trees grow over these years (episode 2). |
| `lake` | `water` or `marsh`: the 1847–48 ring lake. |

## Layout

Each frame, the subtitles, caption, ribbon and picture are placed in the first slot that clears the marker
(plus an 18 px margin), the scene's focus point and the player bar. A picture keeps its slot while that slot stays
clear. `LL.listen.seek(t)` and `LL.listen.state()` are there for tests: the state returns the marker's screen
point and every overlay's rectangle.
