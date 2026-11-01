"""Sanity: transcribe each wav with parakeet-mlx (local) and measure median pitch with librosa pyin."""
import sys, glob, numpy as np, soundfile as sf, librosa
from parakeet_mlx import from_pretrained
m = from_pretrained("mlx-community/parakeet-tdt-0.6b-v3")
for d in sys.argv[1:]:
    for p in sorted(glob.glob(d + "/*.wav")):
        y, sr = sf.read(p, dtype="float32")
        if y.ndim > 1: y = y.mean(1)
        f0, vf, _ = librosa.pyin(y, fmin=60, fmax=400, sr=sr)
        med = float(np.nanmedian(f0[vf])) if vf.any() else float("nan")
        txt = m.transcribe(p).text.strip()
        print(f"{p.split('/')[-2]}/{p.split('/')[-1]:16s} {len(y)/sr:5.2f}s  pitch~{med:5.0f}Hz  peak {np.abs(y).max():.2f}  | {txt}")
