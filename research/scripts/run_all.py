"""Compute metrics for every E1/E2 run on disk -> analysis/results_e12.json"""
import glob
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import metrics  # noqa: E402

ROOT = "."
F = f"{ROOT}/analysis/feat/"

COND = {
    "E1-T": dict(ref="A_drop8", t_drop=8.0, audio_in=False, label="Text only"),
    "E1-TT": dict(ref="A_drop8", t_drop=8.0, audio_in=False, label="Text + timestamps"),
    "E1-N": dict(ref="A_drop8", t_drop=8.0, audio_in=True, label="Audio + naive prompt"),
    "E1-R8": dict(ref="A_drop8", t_drop=8.0, audio_in=True, label="Audio (drop 8 s) + role-mapped"),
    "E1-R4": dict(ref="A_drop4", t_drop=4.0, audio_in=True, label="Audio (drop 4 s) + role-mapped"),
    "E2-U": dict(ref="A_drop8", t_drop=8.0, audio_in=True, label="Video+Audio, unseparated"),
    "E2-S": dict(ref="A_drop8", t_drop=8.0, audio_in=True, label="Video+Audio, role-separated"),
    "E2-V": dict(ref="A_drop8", t_drop=8.0, audio_in=False, label="Video only"),
}


def clean(o):
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return None if np.isnan(o) else float(o)
    if isinstance(o, np.integer):
        return int(o)
    return o


res = {}
for p in sorted(glob.glob(F + "E[12]-*.npz")):
    run = os.path.basename(p)[:-4]
    if run.endswith("_e3"):
        continue
    cond = run.split("_r")[0]
    c = COND[cond]
    o = metrics.analyse(p, F + f"ref_{c['ref']}.npz", c["t_drop"])
    o.update(cond=cond, model="Seedance 2.5" if run.endswith("v25") else "Seedance 2.0", **c)
    res[run] = clean(o)
json.dump(res, open(f"{ROOT}/analysis/results_e12.json", "w"), indent=1)

keys = ["zoom_pos", "zoom_pos_first6", "cam_speed_cv", "n_cuts", "t_cp", "t_hit", "t_max", "energy_ratio", "r_av_detr", "R_beat", "p_beat", "R_beat_strong",
        "out_drop", "fidelity_mean", "r_av_out_detr", "vis_minus_outdrop"]
print("run".ljust(11) + " ".join(k[:9].rjust(9) for k in keys) + "   p2post p4post")
for r, o in res.items():
    vals = []
    for k in keys:
        v = o.get(k)
        vals.append("—".rjust(9) if v is None else f"{v:9.2f}")
    pp = o.get("period_post") or {}
    print(r.ljust(11) + " ".join(vals) + f"   {pp.get('p2', 0):.2f}  {pp.get('p4', 0):.2f}")
