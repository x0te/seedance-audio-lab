"""Download every run listed in manifest['urls'] that is not on disk yet and extract its features."""
import json
import os
import subprocess
import sys
import urllib.request

ROOT = "."
PY = sys.executable
m = json.load(open(f"{ROOT}/analysis/manifest.json"))
for k, u in m["urls"].items():
    mp4 = f"{ROOT}/outputs/{k}.mp4"
    npz = f"{ROOT}/analysis/feat/{k}.npz"
    if not os.path.exists(mp4) or os.path.getsize(mp4) < 10000:
        urllib.request.urlretrieve(u, mp4)
    if not os.path.exists(npz) and not k.startswith("E3"):
        subprocess.run([PY, f"{ROOT}/scripts/features.py", mp4, npz], check=True)
