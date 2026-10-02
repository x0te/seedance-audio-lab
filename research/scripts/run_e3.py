"""Experiment 3 metrics for every E3 run on disk -> analysis/results_e3.json (+ per-run series npz)."""
import glob, json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import dialogue_metrics as dm
ROOT = "."
out_p = f"{ROOT}/analysis/results_e3.json"
res = json.load(open(out_p, encoding="utf-8")) if os.path.exists(out_p) else {}
for p in sorted(glob.glob(f"{ROOT}/outputs/*E3-*.mp4")):
    run = os.path.basename(p)[:-4]
    if run in res and "--force" not in sys.argv:
        continue
    o, mouth, env = dm.analyse(p)
    o["cond"] = run.split("_r")[0]
    res[run] = o
    np.savez_compressed(f"{ROOT}/analysis/feat/{run}_e3.npz", mouth=mouth if mouth is not None else np.array([]), env=env)
    print(run, json.dumps({k: o.get(k) for k in ["transcript", "cer", "knock_t", "speech_on", "speech_off", "av_offset", "av_r", "face_detect_rate", "mouth_out_in_ratio"]}, ensure_ascii=False))
json.dump(res, open(out_p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
