"""Per-video feature extraction (visual motion, shot cuts, camera motion, audio envelopes).

Usage: python features.py <video.mp4> <out.npz>
All visual series are sampled at the native frame rate (24 fps); audio series at 100 Hz.
"""
import subprocess
import sys
import tempfile
import os

import cv2
import librosa
import numpy as np

W, H = 320, 180  # analysis resolution
AUDIO_SR = 22050
AUDIO_HOP = 220  # 100 Hz envelope


def read_frames(path):
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(cv2.resize(f, (W, H), interpolation=cv2.INTER_AREA))
    cap.release()
    return np.stack(frames), fps


def hsv_hist(bgr):
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h = cv2.calcHist([hsv], [0, 1, 2], None, [16, 8, 8], [0, 180, 0, 256, 0, 256])
    return cv2.normalize(h, h).flatten()


def visual_features(frames):
    n = len(frames)
    gray = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in frames]
    hists = [hsv_hist(f) for f in frames]
    diff = np.zeros(n)
    hdist = np.zeros(n)
    flow_mag = np.zeros(n)      # mean optical-flow magnitude (px/frame @320w)
    cam_tx = np.zeros(n)        # global translation (median flow)
    cam_ty = np.zeros(n)
    cam_zoom = np.zeros(n)      # mean divergence of the flow field (+ = zoom-in / dolly-in)
    resid = np.zeros(n)         # local (non-global) motion = subject motion proxy
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    xx -= W / 2
    yy -= H / 2
    for i in range(1, n):
        diff[i] = np.mean(np.abs(gray[i].astype(np.float32) - gray[i - 1].astype(np.float32)))
        hdist[i] = cv2.compareHist(hists[i - 1], hists[i], cv2.HISTCMP_BHATTACHARYYA)
        fl = cv2.calcOpticalFlowFarneback(gray[i - 1], gray[i], None, 0.5, 3, 21, 3, 5, 1.2, 0)
        u, v = fl[..., 0], fl[..., 1]
        mag = np.sqrt(u * u + v * v)
        flow_mag[i] = mag.mean()
        tx, ty = np.median(u), np.median(v)
        cam_tx[i], cam_ty[i] = tx, ty
        # least-squares isotropic scale about centre: u-tx = s*x, v-ty = s*y
        s = (np.sum((u - tx) * xx) + np.sum((v - ty) * yy)) / (np.sum(xx * xx) + np.sum(yy * yy))
        cam_zoom[i] = s
        ru = u - tx - s * xx
        rv = v - ty - s * yy
        resid[i] = np.sqrt(ru * ru + rv * rv).mean()
    diff[0], hdist[0], flow_mag[0] = diff[1], hdist[1], flow_mag[1]
    return dict(diff=diff, hdist=hdist, flow_mag=flow_mag, cam_tx=cam_tx, cam_ty=cam_ty,
                cam_zoom=cam_zoom, resid=resid)


def detect_cuts(hdist, diff, fps):
    """Hard cut at frame i (between i-1 and i): large colour-histogram jump that is also a local outlier."""
    n = len(hdist)
    cuts = []
    for i in range(1, n):
        lo, hi = max(1, i - 6), min(n, i + 7)
        neigh = np.concatenate([hdist[lo:i], hdist[i + 1:hi]])
        med = np.median(neigh) if len(neigh) else 0
        dneigh = np.concatenate([diff[lo:i], diff[i + 1:hi]])
        dmed = np.median(dneigh) if len(dneigh) else 0
        if hdist[i] > 0.28 and hdist[i] > med + 0.18 and diff[i] > 2.5 * max(dmed, 1.0):
            if not cuts or i - cuts[-1] > 3:
                cuts.append(i)
    return np.array(cuts, dtype=int)


def audio_features(path):
    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, "a.wav")
        r = subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", path, "-vn", "-ac", "1", "-ar",
                            str(AUDIO_SR), wav], capture_output=True)
        if r.returncode != 0 or not os.path.exists(wav):
            return None
        y, _ = librosa.load(wav, sr=AUDIO_SR)
    if len(y) == 0:
        return None
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=AUDIO_HOP)[0]
    onset = librosa.onset.onset_strength(y=y, sr=AUDIO_SR, hop_length=AUDIO_HOP)
    tempo, beats = librosa.beat.beat_track(onset_envelope=onset, sr=AUDIO_SR, hop_length=AUDIO_HOP)
    beat_t = librosa.frames_to_time(beats, sr=AUDIO_SR, hop_length=AUDIO_HOP)
    return dict(y=y, rms=rms, onset=onset, tempo=float(np.atleast_1d(tempo)[0]), beat_t=beat_t)


def main(video, out):
    frames, fps = read_frames(video)
    vf = visual_features(frames)
    cuts = detect_cuts(vf["hdist"], vf["diff"], fps)
    af = audio_features(video)
    payload = dict(fps=fps, n=len(frames), cuts=cuts, **vf)
    if af is not None:
        payload.update(a_y=af["y"].astype(np.float32), a_rms=af["rms"], a_onset=af["onset"],
                       a_tempo=af["tempo"], a_beats=af["beat_t"])
    np.savez_compressed(out, **payload)
    print(f"{os.path.basename(video)}: {len(frames)} frames @ {fps:.2f} fps, cuts={list(np.round(cuts / fps, 3))}, "
          f"audio={'yes' if af is not None else 'no'}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
