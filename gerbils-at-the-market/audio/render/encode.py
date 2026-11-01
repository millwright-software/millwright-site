"""Normalize peaks to -1 dBFS, trim edge silence, pitch the villain down 10%, encode mp3 48 kbps mono 24 kHz."""
import sys, glob, subprocess, numpy as np, soundfile as sf
from pathlib import Path
out = Path(sys.argv[1]); norm = Path(sys.argv[2]); norm.mkdir(exist_ok=True)
for d, villain in ((sys.argv[3], False), (sys.argv[4], True)):
    for p in sorted(glob.glob(d + "/*.wav")):
        y, sr = sf.read(p, dtype="float32")
        if y.ndim > 1: y = y.mean(1)
        idx = np.where(np.abs(y) > 0.01)[0]                      # trim silence beyond 80 ms at the edges
        a, b = max(0, idx[0] - int(0.08 * sr)), min(len(y), idx[-1] + int(0.15 * sr))
        y = y[a:b] * (10 ** (-1 / 20) / np.abs(y).max())
        tmp = norm / Path(p).name; sf.write(tmp, y, sr)
        af = "asetrate=21600,aresample=24000,atempo=1.06" if villain else "aresample=24000"
        mp3 = out / (Path(p).stem + ".mp3")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp), "-af", af, "-ac", "1", "-ar", "24000",
                        "-c:a", "libmp3lame", "-b:a", "48k", str(mp3)], check=True)
