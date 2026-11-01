"""Render the narrator set (and audition villain reference clips) with Kokoro-82M (torch kokoro package)."""
import sys, re, json, numpy as np, soundfile as sf
from pathlib import Path
from kokoro import KPipeline
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
spec = json.load(open(sys.argv[2]))   # {"filename": ["voice", speed, "text"], ...}
pipes = {}
# Names misaki's dictionary gets wrong, fixed at render time with Kokoro's [word](/phonemes/) syntax, so the text (and a
# card clip's hash key) stays as written. misaki alone reads Bloomberg as "Bloomerg" (blˈumɜɹɡ).
LEXICON = {r"\bBloomberg's\b": "[Bloomberg's](/blˈumbɜɹɡz/)", r"\bBloomberg\b(?!')": "[Bloomberg](/blˈumbɜɹɡ/)"}
def say_as(text):
    for pat, rep in LEXICON.items(): text = re.sub(pat, rep, text)
    return text
for name, (voice, speed, text) in spec.items():
    lang = voice[0]
    if lang not in pipes:
        pipes[lang] = KPipeline(lang_code=lang, repo_id="hexgrad/Kokoro-82M")
    a = np.concatenate([x.numpy() if hasattr(x, "numpy") else np.asarray(x) for _, _, x in pipes[lang](say_as(text) if lang == 'a' else text, voice=voice, speed=speed, split_pattern=None)])
    sf.write(out / f"{name}.wav", a.astype(np.float32), 24000)
    print(f"{name}.wav {len(a)/24000:.2f}s", flush=True)
