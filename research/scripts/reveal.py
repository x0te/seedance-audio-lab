"""Semantic 'reveal' detector: share of frame covered by the blue-hour cityscape (hue 100-135 in OpenCV 0-180 scale,
S>60, V>40). t_reveal = instant of steepest sustained rise of that share (0.5 s smoothing).
Usage: python reveal.py  (processes every E1/E2 output, writes analysis/reveal.json)"""
import glob
import json
import os

import cv2
import numpy as np
from scipy.ndimage import uniform_filter1d

ROOT = "."
FPS = 24.0


def blue_share(path):
    cap = cv2.VideoCapture(path)
    vals = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        hsv = cv2.cvtColor(cv2.resize(f, (160, 90)), cv2.COLOR_BGR2HSV)
        h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
        vals.append(float(np.mean((h >= 100) & (h <= 135) & (s > 60) & (v > 40))))
    cap.release()
    return np.array(vals)


out_p = f"{ROOT}/analysis/reveal.json"
res = json.load(open(out_p)) if os.path.exists(out_p) else {}
for p in sorted(glob.glob(f"{ROOT}/outputs/E[12]-*.mp4")):
    run = os.path.basename(p)[:-4]
    if run in res:
        continue
    b = blue_share(p)
    bs = uniform_filter1d(b, 12)
    slope = np.gradient(bs) * FPS  # share per second
    lo, hi = int(0.5 * FPS), len(b) - int(0.25 * FPS)
    k = lo + int(np.argmax(slope[lo:hi]))
    res[run] = dict(t_reveal=k / FPS, rise=float(slope[k]), b_start=float(bs[:24].mean()), b_end=float(bs[-24:].mean()),
                    series=[round(float(x), 3) for x in bs[::2]])
    print(run, round(k / FPS, 2), round(float(slope[k]), 3), round(res[run]["b_start"], 2), round(res[run]["b_end"], 2))
json.dump(res, open(out_p, "w"), indent=0)
