"""Metric computation for experiments 1 and 2.

Pre-registered metrics (all computed blind to condition by the same code path):
  t_cp      upward energy change-point of visual motion intensity (2-segment least squares, 1-11 s)
  t_max     time of maximum 1-s smoothed motion intensity
  r_av      Pearson r between reference-audio RMS envelope and visual motion envelope (0.5 s smoothing)
  R_beat    Rayleigh mean resultant length of visual-onset phases on the 0.5 s beat grid (+ p-value)
  cut_on_beat  share of hard cuts within +-1 frame of a beat (chance = 3/12 = 25 %)
  rho_audio peak normalised cross-correlation of output-audio onset envelope with the reference
For no-audio conditions the A_drop8 grid / envelope is used as a null reference the model never heard.
"""
import json
import sys

import numpy as np
from scipy.signal import find_peaks
from scipy.ndimage import uniform_filter1d

FPS = 24.0
BEAT = 0.5


def clean_cuts(x, cuts):
    x = x.copy()
    for c in cuts:
        lo, hi = max(0, c - 3), min(len(x), c + 3)
        neigh = np.r_[x[max(0, lo - 4):lo], x[hi:hi + 4]]
        x[lo:hi] = np.median(neigh) if len(neigh) else x[lo:hi]
    return x


def change_point(x, t0=1.0, t1=11.0):
    n = len(x)
    best, kbest = np.inf, None
    for k in range(int(t0 * FPS), min(n - 1, int(t1 * FPS))):
        a, b = x[:k], x[k:]
        sse = ((a - a.mean()) ** 2).sum() + ((b - b.mean()) ** 2).sum()
        if sse < best:
            best, kbest = sse, k
    up = x[kbest:].mean() - x[:kbest].mean()
    return kbest / FPS, float(up)


def rayleigh(phases):
    n = len(phases)
    if n < 3:
        return np.nan, np.nan, np.nan
    C, S = np.cos(phases).sum(), np.sin(phases).sum()
    R = np.sqrt(C * C + S * S) / n
    Z = n * R * R
    p = np.exp(-Z) * (1 + (2 * Z - Z * Z) / (4 * n) - (24 * Z - 132 * Z ** 2 + 76 * Z ** 3 - 9 * Z ** 4) / (288 * n * n))
    return float(R), float(min(max(p, 0.0), 1.0)), float(np.angle(C + 1j * S))


def env_to_fps(env100, n):
    t100 = np.arange(len(env100)) / 100.0
    tv = np.arange(n) / FPS
    return np.interp(tv, t100, env100)


def xcorr_peak(a, b, max_lag):
    a = (a - a.mean()) / (a.std() + 1e-9)
    b = (b - b.mean()) / (b.std() + 1e-9)
    m = min(len(a), len(b))
    a, b = a[:m], b[:m]
    best, lag_best = -np.inf, 0
    for lag in range(-max_lag, max_lag + 1):
        if lag >= 0:
            x, y = a[lag:], b[:m - lag]
        else:
            x, y = a[:m + lag], b[-lag:]
        r = float(np.mean(x * y))
        if r > best:
            best, lag_best = r, lag
    return best, lag_best


def visual_onsets(I):
    d = np.diff(uniform_filter1d(I, 2), prepend=I[0])
    d[d < 0] = 0
    pk, _ = find_peaks(d, prominence=0.5 * d.std(), distance=4)
    return pk


def audio_drop(rms100, onset100=None, t0=1.0, t1=11.0, w=0.75):
    """Drop = instant of maximal energy contrast (mean RMS in next w s minus previous w s),
    refined to the strongest onset within +-0.3 s. Returns (time, contrast / global mean)."""
    x = rms100
    W = int(w * 100)
    best, kb = -np.inf, None
    for k in range(max(W, int(t0 * 100)), min(len(x) - W, int(t1 * 100))):
        c = x[k:k + W].mean() - x[k - W:k].mean()
        if c > best:
            best, kb = c, k
    if kb is None:
        return None, 0.0
    if onset100 is not None:
        lo, hi = max(0, kb - 30), min(len(onset100), kb + 30)
        kb = lo + int(np.argmax(onset100[lo:hi]))
    return kb / 100.0, float(best / (x.mean() + 1e-9))


def periodicity(I, t0, t1):
    """Share of spectral power (1-6 Hz band) of the detrended motion signal near 2 Hz (beat) and 4 Hz (8th notes)."""
    seg = I[int(t0 * FPS):int(t1 * FPS)]
    if len(seg) < 48:
        return None
    seg = seg - np.polyval(np.polyfit(np.arange(len(seg)), seg, 2), np.arange(len(seg)))
    seg = seg * np.hanning(len(seg))
    nfft = 1024
    P = np.abs(np.fft.rfft(seg, nfft)) ** 2
    f = np.fft.rfftfreq(nfft, 1 / FPS)
    band = (f >= 1.0) & (f <= 6.0)
    tot = P[band].sum() + 1e-12
    near = lambda f0: P[band & (np.abs(f - f0) <= 0.15)].sum() / tot
    fpk = float(f[band][np.argmax(P[band])])
    # chance share for a 0.30 Hz window inside a 5 Hz band is ~6 %
    return dict(p2=float(near(2.0)), p4=float(near(4.0)), fpeak=fpk)


def analyse(feat_path, ref_audio_npz=None, t_drop=None):
    d = np.load(feat_path)
    n = int(d["n"])
    cuts = d["cuts"].astype(int)
    fm = d["flow_mag"]
    # frame-cadence artifact: share of (near-)duplicate frames. A 3:4 pull-up (18 -> 24 fps) gives ~25 %.
    dup_rate = float(np.mean(fm[1:] < 0.15 * np.median(fm[1:])))
    # 4-frame moving average has exact zeros at 6 and 12 Hz -> removes the cadence ripple, keeps the 2 Hz beat band (-1.5 dB)
    I_raw = uniform_filter1d(clean_cuts(fm, cuts), 4)
    I = uniform_filter1d(I_raw, 3)
    I05 = uniform_filter1d(I_raw, 12)
    I1 = uniform_filter1d(I_raw, 24)
    t_cp, step = change_point(I)
    lo, hi = int(0.5 * FPS), n - int(0.5 * FPS)
    t_max = (lo + int(np.argmax(I1[lo:hi]))) / FPS
    # visual "hit": most abrupt upward change of motion (same contrast detector as the audio drop, on 100 Hz-resampled I)
    I100 = np.interp(np.arange(0, n / FPS, 0.01), np.arange(n) / FPS, I_raw)
    t_hit, _ = audio_drop(uniform_filter1d(I100, 5), None)
    out = dict(n=n, dur=n / FPS, n_cuts=int(len(cuts)), cut_times=[round(c / FPS, 3) for c in cuts], t_hit=t_hit,
               t_cp=round(t_cp, 3), step=step, t_max=round(t_max, 3),
               motion_mean=float(I_raw.mean()), dup_rate=dup_rate)

    # camera-motion signature (for the @Video1 dolly-in reference, which has zoom>0 on 100 % of frames, CV 0.14)
    keep = np.ones(n, bool)
    for c in cuts:
        keep[max(0, c - 2):c + 3] = False
    keep[0] = False
    zoom = uniform_filter1d(d["cam_zoom"], 4)
    pan = uniform_filter1d(np.hypot(d["cam_tx"], d["cam_ty"]), 4)
    speed = pan + np.abs(zoom) * 92.0  # px/frame at the mean pixel radius
    out.update(zoom_pos=float(np.mean(zoom[keep] > 0.002)), zoom_mean=float(zoom[keep].mean()),
               zoom_pos_first6=float(np.mean(zoom[keep[:144].nonzero()[0]] > 0.002)),
               cam_speed_cv=float(speed[keep].std() / (speed[keep].mean() + 1e-9)),
               pan_share=float(pan[keep].mean() / (speed[keep].mean() + 1e-9)))

    # energy before / after the drop (reference drop time, or 8 s null)
    td = t_drop if t_drop is not None else 8.0
    k = int(td * FPS)
    out["energy_ratio"] = float(I_raw[k:].mean() / max(I_raw[:k].mean(), 1e-6))

    # visual onsets (+cuts) -> phase on 0.5 s grid
    on = np.unique(np.r_[visual_onsets(I_raw), cuts])
    ph = 2 * np.pi * ((on / FPS) % BEAT) / BEAT
    R, p, mu = rayleigh(ph)
    out.update(n_onsets=int(len(on)), R_beat=R, p_beat=p, mu_beat_ms=(mu / (2 * np.pi) * BEAT * 1000) if not np.isnan(mu) else None,
               onset_times=[round(o / FPS, 3) for o in on])
    if len(cuts):
        m = cuts % 12
        out["cut_on_beat"] = float(np.mean((m == 0) | (m == 1) | (m == 11)))
    else:
        out["cut_on_beat"] = None

    # audio-visual envelope correlation with the reference track
    if ref_audio_npz is not None:
        ra = np.load(ref_audio_npz)
        renv = uniform_filter1d(env_to_fps(ra["rms"], n), 12)
        out["r_av"] = float(np.corrcoef(renv, I05)[0, 1])
        # linear-detrended version: a monotonic "everything gets busier" trend cannot inflate it
        tt = np.arange(n)
        dr = renv - np.polyval(np.polyfit(tt, renv, 1), tt)
        dv = I05 - np.polyval(np.polyfit(tt, I05, 1), tt)
        out["r_av_detr"] = float(np.corrcoef(dr, dv)[0, 1])
        rmax, lag = xcorr_peak(I05, renv, int(1.0 * FPS))
        out["r_av_max"], out["r_av_lag_s"] = rmax, lag / FPS
        if "a_onset" in d.files:
            ro = ra["onset"]
            oo = d["a_onset"]
            rho, lag = xcorr_peak(oo, ro, 100)
            out["rho_audio"], out["rho_audio_lag_s"] = rho, lag / 100.0
            rr, lagr = xcorr_peak(d["a_rms"], ra["rms"], 100)
            out["rho_rms"], out["rho_rms_lag_s"] = rr, lagr / 100.0
    # strong visual onsets only (secondary, exploratory)
    dI = np.diff(uniform_filter1d(I_raw, 2), prepend=I_raw[0])
    dI[dI < 0] = 0
    pk, _ = find_peaks(dI, prominence=1.5 * dI.std(), distance=6)
    on_s = np.unique(np.r_[pk, cuts])
    R_s, p_s, _ = rayleigh(2 * np.pi * ((on_s / FPS) % BEAT) / BEAT)
    out.update(R_beat_strong=R_s, p_beat_strong=p_s, n_onsets_strong=int(len(on_s)))
    # periodicity of motion in the post-drop (high-energy) section and over the whole clip
    out["period_post"] = periodicity(I_raw, td, n / FPS)
    out["period_all"] = periodicity(I_raw, 0.5, n / FPS)
    if "a_rms" in d.files:
        rms = d["a_rms"]
        out["audio_tempo"] = float(d["a_tempo"])
        t_do, c_do = audio_drop(uniform_filter1d(rms, 5), d["a_onset"])
        out["out_drop"], out["out_drop_contrast"] = t_do, c_do
        # coupling between the visual track and the model's *own* output audio
        oenv = uniform_filter1d(env_to_fps(rms, n), 12)
        tt = np.arange(n)
        do = oenv - np.polyval(np.polyfit(tt, oenv, 1), tt)
        dv = I05 - np.polyval(np.polyfit(tt, I05, 1), tt)
        out["r_av_out_detr"] = float(np.corrcoef(do, dv)[0, 1])
        out["vis_minus_outdrop"] = (t_cp - t_do) if t_do is not None else None
        if ref_audio_npz is not None:
            ra = np.load(ref_audio_npz)
            # windowed (2 s) envelope fidelity output-vs-reference at lag 0
            m = min(len(rms), len(ra["rms"]))
            a, b = uniform_filter1d(rms[:m], 5), uniform_filter1d(ra["rms"][:m], 5)
            fid = []
            for s in range(0, m - 200, 50):
                fid.append(float(np.corrcoef(a[s:s + 200], b[s:s + 200])[0, 1]))
            out["fidelity_curve"] = fid
            out["fidelity_mean"] = float(np.nanmean(fid))
        # visual onsets vs the output's *own* tracked beats ("self-sync")
        bt = d["a_beats"]
        if len(bt) > 3 and len(on) > 3:
            period = float(np.median(np.diff(bt)))
            ph2 = []
            for o in on / FPS:
                j = np.searchsorted(bt, o)
                ref = bt[max(0, j - 1)]
                ph2.append(2 * np.pi * ((o - ref) % period) / period)
            R2, p2, _ = rayleigh(np.array(ph2))
            out.update(R_self=R2, p_self=p2, self_period=period)
    return out


if __name__ == "__main__":
    print(json.dumps(analyse(*sys.argv[1:2]), indent=1))
