# web/audio — the game's two voices

Rendered offline on 2026-10-29; the game ships these mp3s and needs no server or API at runtime.
20 files, 452 KB total, mono 24 kHz mp3 at 48 kbps.

## Who says what

| Set | Files | Engine | Voice |
|---|---|---|---|
| Narrator (warm, reads the big numbers) | one name-and-fortune clip per boss, named by its id (`trump`, `bloomberg`, `walton`, `ellison`, `zuckerberg`, `page`, `bezos`, `musk`; main.js plays it when its id is in `narrator.json`), `go`, `found`, `pile_gone`, `market_built`, `unroll_still`, `friends_first`, `pouch5`, `td_count_1..3` (the `n10` … `n100000000` number clips were deleted 10/31: nothing played them) | **Kokoro-82M** v1.0 (hexgrad), torch `kokoro==0.9.4` | `af_heart`, speed 0.95. Kokoro's best-graded voice (its only A grade), warm American female. |
| Villain (the giant gerbil) | `v_laugh`, `v_dizzy`; the takedown lines `td_<boss>_*` (three per boss, Ellison's `td_ellison_1..3`); Musk's quote clips `v_musk_q1..q3` (his kid-words quotes) | **Chatterbox** (Resemble AI, `chatterbox-tts==0.1.7`, torch on MPS) | An **original character voice**: the voice prompt is a 10.6 s clip rendered by Kokoro `am_onyx` (speed 0.88) reciting villain lines (`render/refclips.json`, `ref_onyx`), with Chatterbox `exaggeration=0.8`, `cfg_weight=0.3`, `temperature=0.7`. Then pitched down 10 % with ffmpeg (`asetrate=21600,aresample=24000,atempo=1.06`), which drops pitch and formants together: a bigger creature, slightly slower. |

Measured on the finished files (librosa pyin): narrator median pitch 200–237 Hz, villain 93–111 Hz. Every file was
transcribed back with parakeet-tdt-0.6b-v3 (local) and matched its script.

**No real person's voice is in these files.** The villain quotes things billionaires actually said, but the voice
is synthetic from end to end (Kokoro renders the reference; Chatterbox styles it). Cloning Musk, Bezos or Trump
for a public kids' game would raise voice-likeness and state deepfake-law problems and is not something this
pipeline does or should do. Chatterbox *can* clone from any ~10 s clip; keep the reference synthetic or CC0.

## The prologue's narrator lines (10/30)

`render/prologue.json`: the Kokoro `af_heart` lines of the opening cinematic (`p_valley`, `p_jar`, `p_giants`, `p_prices`, `p_jartake`, `p_lies`, `p_zero`, `p_leave`, `p_fall`, `p_call_alex`, `p_call_william`) for the opening cinematic, rendered and encoded the same way (narrator dir only; an empty villain dir). The `p_zero` line reads the sourced tax figures from `data/billionaires.json` → `taxes`; change the data and re-render it.

**10/31 pacing pass** (the opening slowed to about a third of its old speed, one event then a pause): lines that spanned events far apart were split, each half starting with its own event: `p_giants` / `p_giants2`, `p_prices` / `p_prices_trump` / `p_prices_bezos` / `p_prices_musk`, `p_jartake` / `p_jartake2`, `p_lies` / `p_lies2` / `p_lies3`. Every split line, and `p_jar` and `p_zero` (sped to 1.12 and 1.05 to fit the old timing), were re-rendered at 0.95. `c_share` (listed in opening.json, its mp3 never made) was rendered then too.

`render/opening.json` (10/31): the playable opening's and the ending's Kokoro `af_heart` 0.95 lines (`o_buy`, `o_bought`, `o_coin`, `o_school`, `o_flip`, `o_cant`, `o_leave`, `o_fall`, `o_call_alex`, `o_call_william`, `c_share`), the ids prologue.js and celebration.js call. Same render and encode as the prologue set.

`render/cards.json` + `c_<hash>.mp3`: the read-aloud clips (narrate.js), one per sentence of every card, toast, hint and goal line; `render/collect_cards.mjs` lists them and its header has the run (it renders only the missing ones).

## 10/31 round

- `render/villain.json` holds the takedown lines (frozen text, Chatterbox at exag 0.8 / cfg 0.3) and Musk's quote clips; `v_trick1..3`, `v_true1` and seven unused `td_*` lines were deleted with their mp3s.
- `render/prologue.json` adds `p_catchup`, `p_before`, `p_tag_<boss>`, `p_news`, and `p_lies_story` (the news beat's "In our story, their news told lies..."); `p_prices`, `p_lies*`, `p_fall` and `p_call_*` are gone. `render/opening.json` adds `o_saved_*`, `o_press_touch`/`o_press_keys` and the celebration's `cel_*` lines.
- `render/durations.py` writes `render/durations.json` (every mp3's length, by ffprobe; nothing is played). speech.js `clipLength(id)` reads it. **Re-run it after any render or deletion.**
- Card clips: re-run `collect_cards.mjs` after any copy change, render its todo list, then delete the stale `c_<8 hex>` files (its header has the command; `c_share` is a story clip, not a card, and stays).

## 10/31, the eight-boss round

- Four new bosses (`bloomberg`, `walton`, `zuckerberg`, `page`): their name clips in `narrator.json`, their `p_tag_<id>` and `p_story_<id>_1/_2` beat lines in `prologue.json` (the text is prologue.js `STORY`, word for word), and their takedown lines `td_zuckerberg_*`, `td_page_*`, `td_walton_*`, `td_bloomberg_*` in `villain.json` (Chatterbox, same reference and settings). Two Chatterbox takes went wrong and were re-rolled, as Chatterbox sometimes does: `td_bloomberg_one` said its line twice and `td_walton_cleanup` added an "Ow!". **Transcribe new villain takes before shipping them.**
- `render_kokoro.py` has a small `LEXICON`: misaki reads "Bloomberg" as "Bloomerg", so the renderer swaps in Kokoro's `[Bloomberg](/blˈumbɜɹɡ/)` at render time. The text, and so a card clip's hash key, stays as written. Add a name there when the transcription check mishears one.
- `collect_cards.mjs` now reads main.js's bar text both ways (trackpad mode or not: `hintHTML`, `SAY_MOVE` and `MENU_HELP` became functions of `padMode()`), and evaluates every file with each word for A (`Space`, `A`, `Click`), so the touch and trackpad versions of a line get clips too.

## 10/31, the round-3 verify fixes

- "In our story" is spoken for the fiction about real people: the hook (`p3_giants_story`, "Then, in our story, the billionaires came down the road."), the skip tail (`p3_catchup`), every level's tag (`p3_tag3_<id>`, "In our story, <name> took his money to <place>. Go get him!"; Walton's says "their" and "them"), and the celebration's pay-in (`cel3_share`). Kokoro `af_heart` 0.95, in `prologue.json` / `opening.json`, transcribed back clean with parakeet. The takedowns open with a read-aloud toast, "In our story...".
- Retired with their mp3s: `p_tag_*`, `p3_tag_walton`, `p_catchup`, `p3_giants` (unlabelled), `c_share` (replaced by `cel3_share`), and `cel_cars` / `cel_stairs` / `cel_legos` (the "Free cars for everyone!" lines: the jar buys shared things; the celebration names each shared thing as it lights with the opening's `o3_lit_*` clips).
- `v_musk_q2` re-rendered (Chatterbox, same reference and settings, transcribed clean): his kid-words quote keeps the source's hedge, "Maybe someday money won't even matter."
- `render/extra_sentences.json`: lines built at runtime that `collect_cards.mjs` can't evaluate (the True-or-trick card's question and its "This part is true." / "In our story: that line was made up for this game." labels, "In our story..."). The collector always reads it.

## Re-rendering

Everything runs from the vault rehearsal-room venv, which already has kokoro, chatterbox-tts, mlx-audio,
torch 2.6, soundfile, librosa and parakeet-mlx, with the model weights in `~/.cache/huggingface`
(`hexgrad/Kokoro-82M`, `ResembleAI/chatterbox`, `mlx-community/parakeet-tdt-0.6b-v3`). Nothing was installed for this.

```sh
PY=~/Desktop/vault/tools/rehearse/.venv/bin/python
R=web/audio/render; W=/tmp/gerbil-voice; mkdir -p $W
$PY $R/render_kokoro.py     $W/narrator   $R/narrator.json                       # 14 narrator wavs, ~20 s
$PY $R/render_kokoro.py     $W/refs       $R/refclips.json                       # the synthetic villain reference clip
$PY $R/render_chatterbox.py $W/villain_cb $W/refs/ref_onyx.wav $R/villain.json 0.8 0.3   # 6 villain wavs, ~2 min on MPS
$PY $R/encode.py  web/audio $W/norm $W/narrator $W/villain_cb                    # trim, peak-normalize to -1 dBFS, pitch villain, mp3
$PY $R/check.py   $W/narrator $W/villain_cb                                      # optional: transcribe + pitch sanity
```

Kokoro is deterministic, so the narrator and the reference clip re-render identically. Chatterbox samples
(seed 7 is set, but MPS is not bit-reproducible), so villain takes will differ slightly each run; re-run a single
line by trimming `villain.json`. To change a line, edit the json and re-run; to change the villain's character,
change the Kokoro voice in `refclips.json` (`bm_lewis` is graver, `bm_george` more clipped and British).

One patch in `render_chatterbox.py`: Chatterbox stamps its output with Resemble's Perth audio watermark, and that
module fails to import in this venv (`pkg_resources` missing), so the script swaps in Resemble's own
`DummyWatermarker`. The files therefore carry no Perth watermark. Chatterbox also expects CUDA tensors on load;
`torch.load` is wrapped with `map_location` for MPS/CPU (the standard Mac fix).

## Licenses

- Kokoro-82M: Apache-2.0 (model and voices; the `af_heart` and `am_onyx` voice packs are part of the model release).
  Dependencies `misaki` (Apache-2.0), `espeak-ng` not used (English G2P is misaki).
- Chatterbox: MIT (code and weights, Resemble AI). The reference clip is Kokoro output, Apache-2.0.
- Output audio: generated, no third-party voice. Fine to ship under the game's own license.
- Tools: ffmpeg/libmp3lame (LGPL; only used offline, nothing ships), parakeet-mlx for the check (CC-BY-4.0 model, not shipped).

## Recommendation

Keep this split for the final game: **Kokoro for the narrator, Chatterbox for the villain.** Kokoro is the right
narrator engine because it is deterministic, 82M parameters, renders a line in well under a second, says numbers
cleanly and has a warm, non-robotic default (`af_heart`), so new number lines can be added at any time and will
match. Chatterbox is the right villain engine because the character needs a voice Kokoro does not have: the
exaggeration control gives the pompous, theatrical delivery, and the synthetic-reference trick gives an original
character without cloning anyone. Its costs (3 GB of weights, ~3x real time on this Mac, non-deterministic takes)
are fine for six lines rendered once. If the villain ever needs dozens of lines or must be re-rendered on a
machine without the weights, fall back to Kokoro `am_onyx` or `bm_lewis` at speed 0.88 plus the same ffmpeg pitch
drop; it loses the swagger but stays in character.

## Alternatives rejected

- **Chatterbox Turbo (mlx-audio, cached here):** fastest Chatterbox, but Turbo ignores `exaggeration`/`cfg_weight`,
  which is the one control the villain needs.
- **Kokoro alone for the villain:** fixed voices, no emotion control; `am_onyx` reads the lines flatly. Kept as the fallback.
- **Orpheus 3B (mlx 4-bit, cached here):** emotion tags (`<laugh>`) are attractive, but it is a 3B LLM: slower, prone to
  wandering on short lines, and its 8 voices are fixed people-like presets with no character shaping. Not worth the time box.
- **F5-TTS, Fish Speech / OpenAudio, Piper:** not installed here. F5 and Fish are clone-first engines (a reference clip is
  mandatory, so the "no real voice" rule needs the same synthetic-reference trick with no gain over Chatterbox); Fish's
  weights are CC-BY-NC-SA (not usable for a redistributable game asset without care). Piper (MIT, VITS voices) is light and
  fine for a narrator but sounds flatter than Kokoro and brings nothing for the villain.
- **Dia-1.6B (cached):** dialogue-script model, two-speaker `[S1]`/`[S2]` format, nondeterministic voices unless prompted; wrong shape.
- **macOS `say`:** the planned worst-case fallback. Not needed; nothing failed.

## Round 3 (10/31): the voice rule

- **No clip may say a number above ten** (except twenty dollars, sixty dollars, fifteen) or million/billion/trillion. The game enforces it (narrate.js `numberRuleOK`); `collect_cards.mjs` now gives no clip to a sentence that breaks it and lists those sentences (today only the silent grown-ups page).
- **Deleted, with their json entries:** the eight boss name-and-fortune clips (`trump` … `musk`: they said the net worth), `found`, `market_built`, `unroll_still`, `cel_whole`, `o_cant`, `o_flip`, `o_saved_*`, `p_giants`, `p_jartake`, `p_leave`, `p_lies_story`, `p_news`, `p_prices_bezos`, `p_prices_musk`, `p_zero`, `p_tag_walton`, and the old `p_story_*` (replaced by number-free `p3_story_*`), plus 292 card clips whose sentences left the game. The road start now says the name only (a card clip).
- **New:** `o3_*` (the jar, the lights, fair share, the empty jar), `p3_*` (the beats), `cel3_sentence`, `market_built_r3`, `market_built_all` (Trump, whose whole pile is the 15 bags), `lr3_pebble`, and card clips for the Long Road's ratio lines (`collect_cards.mjs` enumerates every pair of rows).
