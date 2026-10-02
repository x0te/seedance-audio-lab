"""Synthesize ground-truth music stimuli for the Seedance audio-as-input experiment.

Both tracks: 120 BPM (beat period 0.5 s), 12.0 s, 44.1 kHz.
  A_drop8 : intro 0-6 s | build 6-8 s | DROP @ 8.0 s | peak 8-12 s
  A_drop4 : intro 0-2 s | build 2-4 s | DROP @ 4.0 s | peak 4-12 s
The build+drop event is sample-identical between tracks, only shifted by 4.0 s.
A JSON sidecar records every scheduled event (ground truth).
"""
import json
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

SR = 44100
DUR = 12.0
BPM = 120
BEAT = 60.0 / BPM
rng = np.random.default_rng(7)


def env_exp(n, tau):
    t = np.arange(n) / SR
    return np.exp(-t / tau)


def kick(amp=1.0, length=0.35, f0=110, f1=42):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.03)
    ph = 2 * np.pi * np.cumsum(f) / SR
    click = rng.normal(0, 1, n) * env_exp(n, 0.002) * 0.3
    return amp * (np.sin(ph) * env_exp(n, 0.12) + click)


def snare(amp=0.6, length=0.18):
    n = int(length * SR)
    t = np.arange(n) / SR
    noise = rng.normal(0, 1, n)
    sos = butter(2, [1500, 7000], btype="band", fs=SR, output="sos")
    body = np.sin(2 * np.pi * 190 * t) * env_exp(n, 0.04)
    return amp * (0.7 * sosfilt(sos, noise) * env_exp(n, 0.05) + 0.4 * body)


def hat(amp=0.25, length=0.06):
    n = int(length * SR)
    sos = butter(4, 7000, btype="high", fs=SR, output="sos")
    return amp * sosfilt(sos, rng.normal(0, 1, n)) * env_exp(n, 0.015)


def clap(amp=0.7):
    n = int(0.2 * SR)
    out = np.zeros(n)
    sos = butter(2, [900, 4000], btype="band", fs=SR, output="sos")
    for d in (0.0, 0.011, 0.022):
        k = int(d * SR)
        m = n - k
        out[k:] += sosfilt(sos, rng.normal(0, 1, m)) * env_exp(m, 0.03)
    return amp * out


def chord(freqs, length, amp, cutoff):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.12):  # supersaw-ish detune
            ff = f * (1 + det / 100 * 6)
            x += 2 * ((t * ff) % 1.0) - 1
    x /= len(freqs) * 3
    sos = butter(2, cutoff, btype="low", fs=SR, output="sos")
    a = np.minimum(1, t / 0.01) * np.minimum(1, (length - t) / 0.02)
    return amp * sosfilt(sos, x) * a


def impact(amp=1.4, length=2.0):
    n = int(length * SR)
    t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * (35 + 60 * np.exp(-t / 0.08)) * t) * env_exp(n, 0.6)
    sos = butter(2, 3000, btype="high", fs=SR, output="sos")
    crash = sosfilt(sos, rng.normal(0, 1, n)) * env_exp(n, 0.5) * 0.5
    return amp * (boom + crash)


def add(buf, sig, t0):
    i = int(round(t0 * SR))
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i]


AM = [220.0, 261.63, 329.63]  # A minor
FM = [174.61, 220.0, 261.63]  # F major
CM = [196.0, 261.63, 329.63]
GM = [196.0, 246.94, 293.66]
PROG = [AM, FM, CM, GM]


def render(t_drop):
    """intro: [0, t_drop-2), build: [t_drop-2, t_drop), peak: [t_drop, 12)."""
    buf = np.zeros(int(DUR * SR))
    events = []
    t_build = t_drop - 2.0
    beats = np.arange(0, DUR, BEAT)

    # --- INTRO: soft pulse, filtered pad ---
    for b in beats[beats < t_build]:
        add(buf, kick(0.28, f0=80, f1=45), b)
        add(buf, hat(0.05), b + BEAT / 2)
        events.append({"t": round(b, 4), "type": "beat", "section": "intro"})
    for bar_i, b0 in enumerate(np.arange(0, t_build, 2.0)):
        add(buf, chord(PROG[bar_i % 4], min(2.0, t_build - b0), 0.12, 700), b0)

    # --- BUILD: accelerating snare roll + riser, kick drops out last half-beat ---
    roll = []
    t = t_build
    while t < t_drop - 0.25:
        roll.append(t)
        rel = (t - t_build) / 2.0
        step = BEAT / 2 if rel < 0.5 else (BEAT / 4 if rel < 0.75 else BEAT / 8)
        t += step
    for i, rt in enumerate(roll):
        rel = (rt - t_build) / 2.0
        add(buf, snare(0.18 + 0.55 * rel), rt)
    for b in beats[(beats >= t_build) & (beats < t_drop - 0.5)]:
        add(buf, kick(0.45, f0=90, f1=45), b)
        events.append({"t": round(b, 4), "type": "beat", "section": "build"})
    for b in beats[(beats >= t_drop - 0.5) & (beats < t_drop)]:
        events.append({"t": round(b, 4), "type": "beat", "section": "build_gap"})
    n = int(2.0 * SR)
    tt = np.arange(n) / SR
    riser = rng.normal(0, 1, n)
    # sweeping band-pass approximated by blending HP-filtered noise with rising gain
    sos = butter(2, 2500, btype="high", fs=SR, output="sos")
    riser = sosfilt(sos, riser) * (tt / 2.0) ** 2 * 0.45
    tone = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (tt / 2.0 * 2)) / SR) * (tt / 2.0) * 0.12
    seg = riser + tone
    seg[int(1.75 * SR):] *= np.linspace(1, 0, n - int(1.75 * SR))  # 250 ms pre-drop gap
    add(buf, seg, t_build)
    add(buf, chord(AM, 1.75, 0.14, 2500), t_build)
    events.append({"t": round(t_build, 4), "type": "build_start"})

    # --- DROP + PEAK: impact, four-on-floor, claps, hats, bass, stabs ---
    add(buf, impact(), t_drop)
    events.append({"t": round(t_drop, 4), "type": "drop"})
    for k, b in enumerate(beats[beats >= t_drop]):
        add(buf, kick(1.0), b)
        add(buf, hat(0.22), b + BEAT / 2)
        if k % 2 == 1:
            add(buf, clap(0.6), b)
        bar_i = int((b - t_drop) // 2.0)
        root = PROG[bar_i % 4][0] / 4
        nb = int(BEAT * SR)
        tb = np.arange(nb) / SR
        bass = (2 * ((tb * root) % 1.0) - 1) * np.minimum(1, tb / 0.06) * env_exp(nb, 0.25)
        sosb = butter(2, 400, btype="low", fs=SR, output="sos")
        add(buf, 0.5 * sosfilt(sosb, bass), b)
        add(buf, chord(PROG[bar_i % 4], 0.22, 0.35, 5000), b)
        events.append({"t": round(b, 4), "type": "beat", "section": "peak"})

    buf /= np.max(np.abs(buf)) * 1.05
    events.sort(key=lambda e: e["t"])
    return buf.astype(np.float32), events


if __name__ == "__main__":
    import sys
    out = sys.argv[1]
    meta = {}
    for name, td in (("A_drop8", 8.0), ("A_drop4", 4.0)):
        y, ev = render(td)
        sf.write(f"{out}/{name}.wav", y, SR, subtype="PCM_16")
        meta[name] = {"bpm": BPM, "beat_period": BEAT, "duration": DUR, "t_drop": td,
                      "t_build": td - 2.0, "events": ev}
    with open(f"{out}/audio_ground_truth.json", "w") as f:
        json.dump(meta, f, indent=1)
    print("ok")
