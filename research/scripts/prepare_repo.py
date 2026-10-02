"""Assemble the public GitHub Pages repo in ./repo: site at root + sanitized research material."""
import json
import os
import re
import shutil

ROOT = "."
OUT = f"{ROOT}/repo"
SCRATCH = "./.cache"

if os.path.exists(f"{OUT}/.git"):
    for name in os.listdir(OUT):  # keep git history, refresh content
        if name != ".git":
            p = f"{OUT}/{name}"
            shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
else:
    os.makedirs(OUT, exist_ok=True)

shutil.copytree(f"{ROOT}/site", OUT, dirs_exist_ok=True)
shutil.copy(f"{ROOT}/README.md", f"{OUT}/README.md")
open(f"{OUT}/.nojekyll", "w").close()


def sanitize(txt):
    txt = txt.replace(SCRATCH, "./.cache").replace(ROOT, ".")
    txt = re.sub(r"https://d8j0ntlcm91z4\.cloudfront\.net/user_[A-Za-z0-9]+/", "<higgsfield-cdn>/", txt)
    txt = re.sub(r"~/\"']+", "~", txt)
    return txt


os.makedirs(f"{OUT}/research/scripts", exist_ok=True)
for f in os.listdir(f"{ROOT}/scripts"):
    if f.endswith(".py") and not f.startswith("_"):
        open(f"{OUT}/research/scripts/{f}", "w", encoding="utf-8").write(sanitize(open(f"{ROOT}/scripts/{f}", encoding="utf-8").read()))

os.makedirs(f"{OUT}/research/analysis", exist_ok=True)
m = json.load(open(f"{ROOT}/analysis/manifest.json"))
m.pop("urls", None)  # CDN URLs carry the account path; job IDs are enough to audit
json.dump(m, open(f"{OUT}/research/analysis/manifest.json", "w"), indent=1)
for f in ("results_e12.json", "results_e3.json", "reveal.json", "prompts_frozen.json"):
    shutil.copy(f"{ROOT}/analysis/{f}", f"{OUT}/research/analysis/{f}")

os.makedirs(f"{OUT}/research/stimuli", exist_ok=True)
for f in ("A_drop8.wav", "A_drop4.wav", "A_dialogue.wav", "audio_ground_truth.json", "dialogue_ground_truth.json",
          "I1_character.png", "I2_environment.png", "V1_dolly.mp4"):
    shutil.copy(f"{ROOT}/stimuli/{f}", f"{OUT}/research/stimuli/{f}")

total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) if ".git" not in dp for f in fs)
print(f"repo assembled: {total / 1e6:.1f} MB")
for dp, _, fs in os.walk(OUT):
    for f in fs:
        p = os.path.join(dp, f)
        if os.path.getsize(p) > 50e6:
            print("WARNING large file", p)
