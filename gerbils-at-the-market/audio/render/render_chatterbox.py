"""Villain lines with Chatterbox (ResembleAI, MIT) from a SYNTHETIC reference clip (Kokoro-rendered), exaggeration up."""
import sys, json, time, torch, torchaudio as ta
from pathlib import Path
# Chatterbox ships its conds/weights for CUDA; map to the local device on load (standard Mac patch).
device = "mps" if torch.backends.mps.is_available() else "cpu"
_load = torch.load
def _patched(*a, **k):
    k.setdefault("map_location", torch.device(device)); return _load(*a, **k)
torch.load = _patched
import perth
if perth.PerthImplicitWatermarker is None:   # the implicit watermarker failed to import in this venv
    perth.PerthImplicitWatermarker = perth.DummyWatermarker; print('NOTE: perth watermarker unavailable, using DummyWatermarker', flush=True)
from chatterbox.tts import ChatterboxTTS
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
ref = sys.argv[2]
spec = json.load(open(sys.argv[3]))   # {"filename": "text"}
exag = float(sys.argv[4]) if len(sys.argv) > 4 else 0.8
cfg = float(sys.argv[5]) if len(sys.argv) > 5 else 0.3
t0 = time.time(); m = ChatterboxTTS.from_pretrained(device=device); print(f"loaded in {time.time()-t0:.1f}s on {device}", flush=True)
torch.manual_seed(7)
for name, text in spec.items():
    t0 = time.time()
    wav = m.generate(text, audio_prompt_path=ref, exaggeration=exag, cfg_weight=cfg, temperature=0.7)
    ta.save(str(out / f"{name}.wav"), wav.cpu(), m.sr)
    print(f"{name}.wav {wav.shape[-1]/m.sr:.2f}s  render {time.time()-t0:.1f}s", flush=True)
