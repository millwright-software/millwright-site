"""Write durations.json: {clip id: seconds} for every web/audio/*.mp3, read with ffprobe (no audio is played).
speech.js clipLength(id) reads it. Run after any render:  python3 web/audio/render/durations.py"""
import json, subprocess
from pathlib import Path
here = Path(__file__).resolve().parent; audio = here.parent
out = {}
for p in sorted(audio.glob("*.mp3")):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(p)],
                       capture_output=True, text=True, check=True)
    out[p.stem] = round(float(r.stdout.strip()), 3)
(here / "durations.json").write_text(json.dumps(out, indent=0, sort_keys=True) + "\n")
print(f"durations.json: {len(out)} clips")
