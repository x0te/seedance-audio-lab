"""Experiment 3 metrics: SFX timing, speech timing, transcript accuracy and lip-sync offset.

  knock_t     time of the strongest broadband transient before speech (target 1.00 s)
  speech_on   acoustic speech onset (speech-band energy crossing, located with Whisper) (target 4.00 s)
  cer         character error rate of the Whisper transcript vs. the scripted line
  av_offset   lag (s) maximising corr(mouth-opening, speech envelope); + = mouth lags audio
  av_r        that peak correlation
  mouth_out   mean mouth opening outside the speech window / inside it (spurious lip motion)
"""
import json
import os
import re
import subprocess
import sys
import tempfile

import cv2
import librosa
import numpy as np
from scipy.ndimage import uniform_filter1d
from scipy.signal import butter, sosfiltfilt

SCRATCH = "./.cache"
os.environ.setdefault("HF_HOME", SCRATCH + "/hf")
LINE = "설마 이걸 진짜 먹으라고?"
SR = 16000
FPS = 24.0
_whisper = None
_landmarker = None


def load_audio(video):
    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, "a.wav")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", video, "-vn", "-ac", "1", "-ar", str(SR), wav], check=True)
        y, _ = librosa.load(wav, sr=SR)
    return y


def norm_text(s):
    return re.sub(r"[^\w]", "", s)


def cer(hyp, ref):
    h, r = norm_text(hyp), norm_text(ref)
    dp = np.arange(len(r) + 1)
    for i, ch in enumerate(h, 1):
        prev, dp[0] = dp[0], i
        for j, cr in enumerate(r, 1):
            prev, dp[j] = dp[j], min(dp[j] + 1, dp[j - 1] + 1, prev + (ch != cr))
    return dp[len(r)] / max(1, len(r))


def transcribe(y):
    global _whisper
    if _whisper is None:
        from faster_whisper import WhisperModel
        _whisper = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")
    segs, _ = _whisper.transcribe(y, language="ko", word_timestamps=True, vad_filter=False,
                                  initial_prompt=None, condition_on_previous_text=False)
    segs = list(segs)
    return segs


def speech_env(y):
    sos = butter(4, [250, 3500], btype="band", fs=SR, output="sos")
    yb = sosfiltfilt(sos, y)
    rms = librosa.feature.rms(y=yb, frame_length=640, hop_length=160)[0]  # 100 Hz
    return uniform_filter1d(rms, 3)


def speech_onset(env, ws, we):
    lo, hi = max(0, int((ws - 0.6) * 100)), min(len(env), int((we + 0.3) * 100))
    seg = env[lo:hi]
    if len(seg) == 0:
        return None, None
    thr = 0.15 * seg.max()
    above = np.where(seg > thr)[0]
    return (lo + above[0]) / 100.0, (lo + above[-1]) / 100.0


def knock_time(y, before):
    on = librosa.onset.onset_strength(y=y, sr=SR, hop_length=160)
    hi = int(max(0.3, before - 0.3) * 100)
    if hi < 5:
        return None, 0.0
    seg = on[:hi]
    k = int(np.argmax(seg))
    return k / 100.0, float(seg[k] / (np.median(on) + 1e-9))


def mouth_series(video):
    global _landmarker
    import mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    if _landmarker is None:
        opts = vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=SCRATCH + "/face_landmarker.task"),
                                            running_mode=vision.RunningMode.IMAGE, num_faces=1)
        _landmarker = vision.FaceLandmarker.create_from_options(opts)
    cap = cv2.VideoCapture(video)
    vals = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(f, cv2.COLOR_BGR2RGB))
        res = _landmarker.detect(img)
        if res.face_landmarks:
            lm = res.face_landmarks[0]
            open_ = abs(lm[14].y - lm[13].y)
            face_h = abs(lm[152].y - lm[10].y) + 1e-6
            vals.append(open_ / face_h)
        else:
            vals.append(np.nan)
    cap.release()
    return np.array(vals)


def analyse(video):
    y = load_audio(video)
    segs = transcribe(y)
    text = "".join(s.text for s in segs).strip()
    words = [w for s in segs for w in (s.words or [])]
    out = dict(transcript=text, cer=float(cer(text, LINE)) if text else 1.0)
    env = speech_env(y)
    if words:
        # pick the contiguous Whisper span that best matches the line
        ws, we = words[0].start, words[-1].end
        on, off = speech_onset(env, ws, we)
        out.update(whisper_start=ws, whisper_end=we, speech_on=on, speech_off=off)
    else:
        out.update(speech_on=None, speech_off=None)
    kt, ksal = knock_time(y, out["speech_on"] if out.get("speech_on") else 8.0)
    out.update(knock_t=kt, knock_salience=ksal)

    mouth = mouth_series(video)
    out["face_detect_rate"] = float(np.mean(~np.isnan(mouth)))
    m = mouth.copy()
    if np.isnan(m).all():
        out.update(av_offset=None, av_r=None)
        return out, None, env
    idx = np.arange(len(m))
    m[np.isnan(m)] = np.interp(idx[np.isnan(m)], idx[~np.isnan(m)], m[~np.isnan(m)])
    m = uniform_filter1d(m, 2)
    env_v = np.interp(idx / FPS, np.arange(len(env)) / 100.0, env)
    if out.get("speech_on") is not None:
        a, b = out["speech_on"], out["speech_off"]
        w0, w1 = max(0, int((a - 0.5) * FPS)), min(len(m), int((b + 0.5) * FPS))
        best, lag_best = -np.inf, 0
        for lag in range(-12, 13):  # +-0.5 s
            i0, i1 = w0 + lag, w1 + lag
            if i0 < 0 or i1 > len(m):
                continue
            r = np.corrcoef(m[i0:i1], env_v[w0:w1])[0, 1]
            if r > best:
                best, lag_best = r, lag
        out.update(av_offset=lag_best / FPS, av_r=float(best))
        ins = (idx >= a * FPS) & (idx <= b * FPS)
        outs = ~((idx >= (a - 0.3) * FPS) & (idx <= (b + 0.3) * FPS))
        out["mouth_out_in_ratio"] = float(m[outs].mean() / max(m[ins].mean(), 1e-6))
    return out, m, env


if __name__ == "__main__":
    o, m, env = analyse(sys.argv[1])
    print(json.dumps(o, ensure_ascii=False, indent=1))
