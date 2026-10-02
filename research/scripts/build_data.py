"""Aggregate every result into site/data/data.json and encode web media (videos, posters, strips, spectrograms).

Re-runnable: media already encoded is skipped.
"""
import glob
import json
import os
import subprocess
import sys
from itertools import combinations

import cv2
import librosa
import matplotlib
import numpy as np
from scipy.ndimage import uniform_filter1d

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

sys.path.insert(0, os.path.dirname(__file__))
import metrics  # noqa: E402
import prompts as P  # noqa: E402

ROOT = "."
SITE = f"{ROOT}/site"
FPS = 24.0
rng = np.random.default_rng(0)
for d in ("media/v", "media/p", "media/s", "media/strip", "media/ref", "data"):
    os.makedirs(f"{SITE}/{d}", exist_ok=True)


def sh(*a):
    subprocess.run(list(a), check=True, capture_output=True)


# ---------------------------------------------------------------- media
def encode(run, src):
    v = f"{SITE}/media/v/{run}.mp4"
    if not os.path.exists(v):
        sh("ffmpeg", "-y", "-loglevel", "error", "-i", src, "-vf", "scale=640:-2", "-c:v", "libx264", "-crf", "27",
           "-preset", "slow", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", v)
    cap = cv2.VideoCapture(src)
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    p = f"{SITE}/media/p/{run}.jpg"
    if not os.path.exists(p):
        cap.set(cv2.CAP_PROP_POS_FRAMES, n // 2)
        ok, f = cap.read()
        cv2.imwrite(p, cv2.resize(f, (640, 360)), [cv2.IMWRITE_JPEG_QUALITY, 78])
    s = f"{SITE}/media/strip/{run}.jpg"
    if not os.path.exists(s):
        tiles = []
        dur = n / FPS
        for t in np.arange(0, dur - 0.01, 0.5):  # 2 fps scrub strip
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * FPS))
            ok, f = cap.read()
            if ok:
                tiles.append(cv2.resize(f, (160, 90), interpolation=cv2.INTER_AREA))
        cv2.imwrite(s, np.hstack(tiles), [cv2.IMWRITE_JPEG_QUALITY, 72])
    cap.release()


def spectro(y, sr, out, dur):
    if os.path.exists(out):
        return
    S = librosa.amplitude_to_db(np.abs(librosa.stft(y, n_fft=1024, hop_length=256)), ref=np.max)
    fig = plt.figure(figsize=(8, 1.6), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.imshow(S[:300], origin="lower", aspect="auto", cmap="gray_r", vmin=-72, vmax=-6,
              extent=[0, len(y) / sr, 0, 1])
    ax.set_xlim(0, dur)
    ax.axis("off")
    fig.savefig(out, pil_kwargs={"quality": 80})
    plt.close(fig)


def load_audio(path, sr=22050):
    tmp = f"{ROOT}/analysis/_tmp.wav"
    sh("ffmpeg", "-y", "-loglevel", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(sr), tmp)
    y, _ = librosa.load(tmp, sr=sr)
    return y


# ---------------------------------------------------------------- stats helpers
def desc(x):
    x = np.array([v for v in x if v is not None and not np.isnan(v)], float)
    if len(x) == 0:
        return None
    bs = [rng.choice(x, len(x)).mean() for _ in range(4000)] if len(x) > 1 else [x.mean()]
    return dict(n=int(len(x)), mean=float(x.mean()), sd=float(x.std(ddof=1)) if len(x) > 1 else 0.0,
                lo=float(np.percentile(bs, 2.5)), hi=float(np.percentile(bs, 97.5)), vals=[float(v) for v in x])


def perm_test(a, b, alternative="less"):
    """Exact permutation test on the difference of means (a - b)."""
    from math import comb
    a, b = np.array(a, float), np.array(b, float)
    pooled = np.r_[a, b]
    obs = a.mean() - b.mean()
    ds = []
    if comb(len(pooled), len(a)) <= 50000:  # exact
        for idx in combinations(range(len(pooled)), len(a)):
            m = np.zeros(len(pooled), bool)
            m[list(idx)] = True
            ds.append(pooled[m].mean() - pooled[~m].mean())
    else:  # Monte-Carlo permutation (100k draws)
        for _ in range(100000):
            pr = rng.permutation(pooled)
            ds.append(pr[:len(a)].mean() - pr[len(a):].mean())
    ds = np.array(ds)
    if alternative == "less":
        p = np.mean(ds <= obs + 1e-12)
    elif alternative == "greater":
        p = np.mean(ds >= obs - 1e-12)
    else:
        p = np.mean(np.abs(ds) >= abs(obs) - 1e-12)
    return dict(diff=float(obs), p=float(p), n_perm=int(len(ds)))


def cliffs_delta(a, b):
    a, b = np.array(a), np.array(b)
    gt = sum((x > y) for x in a for y in b)
    lt = sum((x < y) for x in a for y in b)
    return float((gt - lt) / (len(a) * len(b)))


# ---------------------------------------------------------------- main
manifest = json.load(open(f"{ROOT}/analysis/manifest.json"))
R12 = json.load(open(f"{ROOT}/analysis/results_e12.json"))
R3 = json.load(open(f"{ROOT}/analysis/results_e3.json", encoding="utf-8"))
REV = json.load(open(f"{ROOT}/analysis/reveal.json"))
GT = json.load(open(f"{ROOT}/stimuli/audio_ground_truth.json"))
GTD = json.load(open(f"{ROOT}/stimuli/dialogue_ground_truth.json", encoding="utf-8"))

COND = {
    "E1-T": dict(exp=1, ko="텍스트만", desc="오디오 레퍼런스 없음 · 타이밍 지시 없음", target=None, audio="—"),
    "E1-TT": dict(exp=1, ko="텍스트 + 타임스탬프", desc="오디오 없음 · '정확히 8초에 클라이맥스' 텍스트 지시", target=8.0, audio="—"),
    "E1-N": dict(exp=1, ko="오디오 + 단순 지시", desc="@Audio1(드롭 8초) + 'Match the video to the music'", target=8.0, audio="A_drop8"),
    "E1-R8": dict(exp=1, ko="오디오 + 역할 매핑 (드롭 8초)", desc="@Audio1(드롭 8초) + Audio-as-Master-Clock 템플릿", target=8.0, audio="A_drop8"),
    "E1-R4": dict(exp=1, ko="오디오 + 역할 매핑 (드롭 4초)", desc="@Audio1(드롭 4초) + 동일 템플릿 — 드롭만 4초 앞당김", target=4.0, audio="A_drop4"),
    "E2-U": dict(exp=2, ko="비디오+오디오 · 역할 미분리", desc="@Video1(돌리인) + @Audio1, 역할 지정 없이 'as references'", target=8.0, audio="A_drop8"),
    "E2-S": dict(exp=2, ko="비디오+오디오 · 역할 분리", desc="'@Video1은 카메라만, @Audio1은 템포·에너지만, 경쟁 금지'", target=8.0, audio="A_drop8"),
    "E2-V": dict(exp=2, ko="비디오만 (대조군)", desc="@Video1(돌리인)만, 카메라 전용 지시", target=None, audio="—"),
    "E3-B": dict(exp=3, ko="[AUDIO: Xs] 대괄호 문법", desc="Reddit식 타임스탬프 블록", target=4.0, audio="—"),
    "E3-N": dict(exp=3, ko="자연어 타임라인", desc="'At 1 second… At 4 seconds, she says…'", target=4.0, audio="—"),
    "E3-A": dict(exp=3, ko="대사 오디오 레퍼런스", desc="노크(1.0s)+TTS 대사(4.0s)를 @Audio1로 제공", target=4.0, audio="A_dialogue"),
}
PROMPTS = {"E1-T": P.E1["E1-T"], "E1-TT": P.E1["E1-TT"], "E1-N": P.E1["E1-N"], "E1-R8": P.E1["E1-R"],
           "E1-R4": P.E1["E1-R"], **P.E2, **P.E3}


def model_of(run):
    return "2.5" if run.endswith("v25") else "2.0"


def rep_of(run):
    return int(run.split("_r")[1][0])


runs = {}
for run, o in R12.items():
    src = f"{ROOT}/outputs/{run}.mp4"
    encode(run, src)
    y = load_audio(src)
    spectro(y, 22050, f"{SITE}/media/s/{run}.jpg", 12.0)
    d = np.load(f"{ROOT}/analysis/feat/{run}.npz")
    n = int(d["n"])
    fm = uniform_filter1d(metrics.clean_cuts(d["flow_mag"], d["cuts"].astype(int)), 4)
    t12 = np.arange(0, n / FPS, 1 / 12)
    motion = np.interp(t12, np.arange(n) / FPS, uniform_filter1d(fm, 3))
    rms = d["a_rms"]
    orms = np.interp(t12, np.arange(len(rms)) / 100, uniform_filter1d(rms, 5))
    rv = REV.get(run, {})
    blue = np.interp(t12, np.arange(len(rv.get("series", [0]))) / 12.0, rv.get("series", [0]))
    cond = o["cond"]
    tgt = COND[cond]["target"]
    m = dict(t_hit=o.get("t_hit"), t_cp=o.get("t_cp"), t_max=o.get("t_max"), t_reveal=rv.get("t_reveal"),
             n_cuts=o["n_cuts"], energy_ratio=o["energy_ratio"], r_av_detr=o.get("r_av_detr"),
             R_beat=o.get("R_beat"), p_beat=o.get("p_beat"), R_beat_strong=o.get("R_beat_strong"),
             p2_all=(o.get("period_all") or {}).get("p2"), fpeak=(o.get("period_all") or {}).get("fpeak"),
             out_drop=o.get("out_drop"), fidelity=o.get("fidelity_mean"), r_av_out_detr=o.get("r_av_out_detr"),
             zoom_pos=o.get("zoom_pos"), zoom_pos_first6=o.get("zoom_pos_first6"), cam_speed_cv=o.get("cam_speed_cv"),
             dup_rate=o.get("dup_rate"), audio_tempo=o.get("audio_tempo"), motion_mean=o.get("motion_mean"))
    if tgt is not None:
        for k in ("t_hit", "t_reveal"):
            if m[k] is not None:
                m[k + "_err"] = m[k] - tgt
    runs[run] = dict(cond=cond, model=model_of(run), rep=rep_of(run), exp=COND[cond]["exp"],
                     job=manifest["runs"].get(run), cuts=o["cut_times"], onsets=o.get("onset_times", []),
                     metrics=m, series=dict(t0=0, dt=1 / 12, motion=[round(float(v), 3) for v in motion],
                                            out_rms=[round(float(v), 4) for v in orms],
                                            blue=[round(float(v), 3) for v in blue]),
                     fidelity_curve=o.get("fidelity_curve"))

for run, o in R3.items():
    src = f"{ROOT}/outputs/{run}.mp4"
    encode(run, src)
    y = load_audio(src)
    spectro(y, 22050, f"{SITE}/media/s/{run}.jpg", 8.0)
    e = np.load(f"{ROOT}/analysis/feat/{run}_e3.npz")
    mouth = e["mouth"]
    env = e["env"]
    t12 = np.arange(0, 8.0, 1 / 12)
    ser = dict(t0=0, dt=1 / 12, speech=[round(float(v), 4) for v in np.interp(t12, np.arange(len(env)) / 100, env)])
    if len(mouth):
        ser["mouth"] = [round(float(v), 4) for v in np.interp(t12, np.arange(len(mouth)) / FPS, np.nan_to_num(mouth))]
    on = o.get("speech_on")
    runs[run] = dict(cond=o["cond"], model=model_of(run), rep=rep_of(run), exp=3, job=manifest["runs"].get(run),
                     metrics=dict(transcript=o["transcript"], cer=o["cer"], correct_line=bool(o["cer"] <= 0.3),
                                  knock_t=o.get("knock_t"), knock_err=(o["knock_t"] - 1.0) if o.get("knock_t") is not None else None,
                                  speech_on=on, speech_err=(on - 4.0) if on is not None else None,
                                  speech_off=o.get("speech_off"),
                                  # lip-sync: in-speech window, +-0.25 s lag (refined after inspecting post-line reaction confound)
                                  av_offset=o.get("av_offset_in") if (o.get("av_r_in") or -2) > -1 else None,
                                  av_r=o.get("av_r_in") if (o.get("av_r_in") or -2) > -1 else None,
                                  av_offset_wide=o.get("av_offset"),
                                  face_rate=o.get("face_detect_rate")), series=ser)

# ---------------------------------------------------------------- reference media
refs = {}
for name in ("A_drop8", "A_drop4", "A_dialogue"):
    y, sr = librosa.load(f"{ROOT}/stimuli/{name}.wav", sr=22050)
    spectro(y, sr, f"{SITE}/media/ref/{name}.jpg", len(y) / sr)
    if not os.path.exists(f"{SITE}/media/ref/{name}.mp3"):
        sh("ffmpeg", "-y", "-loglevel", "error", "-i", f"{ROOT}/stimuli/{name}.wav", "-b:a", "160k", f"{SITE}/media/ref/{name}.mp3")
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=220)[0]
    t12 = np.arange(0, len(y) / sr, 1 / 12)
    refs[name] = dict(rms=[round(float(v), 4) for v in np.interp(t12, np.arange(len(rms)) / 100, uniform_filter1d(rms, 5))],
                      dur=len(y) / sr)
refs["A_drop8"]["gt"] = GT["A_drop8"]
refs["A_drop4"]["gt"] = GT["A_drop4"]
refs["A_dialogue"]["gt"] = GTD
for name, src in (("I1_character", "I1_character.png"), ("I2_environment", "I2_environment.png")):
    out = f"{SITE}/media/ref/{name}.jpg"
    if not os.path.exists(out):
        im = cv2.imread(f"{ROOT}/stimuli/{src}")
        h, w = im.shape[:2]
        s = 900 / max(h, w)
        cv2.imwrite(out, cv2.resize(im, (int(w * s), int(h * s))), [cv2.IMWRITE_JPEG_QUALITY, 82])
encode("V1_dolly", f"{ROOT}/stimuli/V1_dolly.mp4")
v1 = metrics.analyse(f"{ROOT}/analysis/feat/V1_dolly.npz")
refs["V1_dolly"] = dict(zoom_pos=v1["zoom_pos"], cam_speed_cv=v1["cam_speed_cv"], n_cuts=v1["n_cuts"])

# ---------------------------------------------------------------- statistics
stats = {"by_cond": {}, "tests": {}}
METRICS = ["t_hit", "t_reveal", "t_hit_err", "t_reveal_err", "n_cuts", "energy_ratio", "R_beat", "R_beat_strong", "p2_all",
           "out_drop", "fidelity", "r_av_detr", "r_av_out_detr", "zoom_pos", "zoom_pos_first6", "cam_speed_cv", "dup_rate",
           "cer", "knock_t", "knock_err", "speech_on", "speech_err", "av_offset", "av_r"]
for model in ("2.0", "2.5", "all"):
    for cond in COND:
        rs = [r for r in runs.values() if r["cond"] == cond and (model == "all" or r["model"] == model)]
        if not rs:
            continue
        stats["by_cond"].setdefault(model, {})[cond] = {
            k: desc([r["metrics"].get(k) for r in rs if isinstance(r["metrics"].get(k), (int, float))]) for k in METRICS
            if any(isinstance(r["metrics"].get(k), (int, float)) for r in rs)}
        if cond.startswith("E3"):
            stats["by_cond"][model][cond]["correct_rate"] = float(np.mean([r["metrics"]["correct_line"] for r in rs]))
            stats["by_cond"][model][cond]["abs_speech_err"] = desc([abs(r["metrics"]["speech_err"]) for r in rs if r["metrics"]["speech_err"] is not None])
        if cond.startswith("E1") and COND[cond]["target"] is not None:
            for k in ("t_hit", "t_reveal"):
                stats["by_cond"][model][cond]["abs_" + k + "_err"] = desc(
                    [abs(r["metrics"][k + "_err"]) for r in rs if r["metrics"].get(k + "_err") is not None])


def vals(model, cond, k, absval=False):
    out = []
    for r in runs.values():
        if r["cond"] == cond and (model == "all" or r["model"] == model):
            v = r["metrics"].get(k)
            if isinstance(v, (int, float)):
                out.append(abs(v) if absval else v)
    return out


for model in ("2.0", "2.5", "all"):
    T = stats["tests"].setdefault(model, {})
    for k in ("t_reveal", "t_hit"):
        a, b = vals(model, "E1-R4", k), vals(model, "E1-R8", k)
        if len(a) >= 2 and len(b) >= 2:
            T[f"drop_shift_{k}"] = dict(**perm_test(a, b, "less"), delta=cliffs_delta(a, b),
                                        note="H1: moving the drop 8 s -> 4 s moves the visual climax earlier")
    # audio-conditioned vs text-only: |timing error| around 8 s
    for k in ("t_reveal", "t_hit"):
        audio = vals(model, "E1-R8", k + "_err", True) + vals(model, "E1-N", k + "_err", True)
        tt = vals(model, "E1-TT", k + "_err", True)
        if audio and tt:
            T[f"audio_vs_texttime_{k}"] = dict(**perm_test(audio, tt, "two-sided"), delta=cliffs_delta(audio, tt))
    # role-mapped vs naive
    for k in ("t_reveal", "t_hit"):
        a, b = vals(model, "E1-R8", k + "_err", True), vals(model, "E1-N", k + "_err", True)
        if a and b:
            T[f"role_vs_naive_{k}"] = dict(**perm_test(a, b, "less"), delta=cliffs_delta(a, b))
    # E2 dolly adherence: video-only vs video+audio (pooled U,S)
    a, b = vals(model, "E2-V", "zoom_pos_first6"), vals(model, "E2-U", "zoom_pos_first6") + vals(model, "E2-S", "zoom_pos_first6")
    if a and b:
        T["dolly_video_only_vs_with_audio"] = dict(**perm_test(a, b, "greater"), delta=cliffs_delta(a, b))
    a, b = vals(model, "E2-S", "zoom_pos_first6"), vals(model, "E2-U", "zoom_pos_first6")
    if a and b:
        T["dolly_separated_vs_unseparated"] = dict(**perm_test(a, b, "two-sided"), delta=cliffs_delta(a, b))
    # E3 speech timing
    for c1, c2 in (("E3-B", "E3-N"),):
        a, b = vals(model, c1, "speech_err", True), vals(model, c2, "speech_err", True)
        if a and b:
            T["bracket_vs_natural_abs_speech_err"] = dict(**perm_test(a, b, "two-sided"), delta=cliffs_delta(a, b))

# pooled beat-phase analysis (all onsets of all runs in a condition share the same 0.5 s grid)
stats["beat_pooled"] = {}
for model in ("2.0", "2.5"):
    for cond in ("E1-T", "E1-TT", "E1-N", "E1-R8", "E1-R4", "E2-U", "E2-S", "E2-V"):
        ons = [t for r in runs.values() if r["cond"] == cond and r["model"] == model for t in r.get("onsets", [])]
        if len(ons) < 5:
            continue
        ph = 2 * np.pi * (np.array(ons) % 0.5) / 0.5
        R, p, mu = metrics.rayleigh(ph)
        hist = np.histogram(np.array(ons) % 0.5, bins=12, range=(0, 0.5))[0]
        stats["beat_pooled"].setdefault(model, {})[cond] = dict(R=R, p=p, mu_ms=float(mu / (2 * np.pi) * 500), n=len(ons),
                                                                hist=[int(h) for h in hist])

# frame-index periodicity of visual onsets (artifact check for the 0.5 s = 12-frame beat grid)
stats["frame_mod"] = {}
for model in ("2.0", "2.5"):
    fr = [int(round(t * FPS)) for r in runs.values() if r["model"] == model and r["exp"] != 3 for t in r.get("onsets", [])]
    stats["frame_mod"][model] = {}
    for P in (6, 8, 11, 12, 13, 24):
        Rr, pp, _ = metrics.rayleigh(2 * np.pi * (np.array(fr) % P) / P)
        stats["frame_mod"][model][str(P)] = dict(R=Rr, p=pp, n=len(fr))
    stats["frame_mod"][model]["mod3_hist"] = [int(np.sum(np.array(fr) % 3 == k)) for k in range(3)]

# model comparison table (pooled over conditions where meaningful)
cmp_rows = []
def add_row(label, cond_list, k, absval=False, lower_better=True):
    a = [v for c in cond_list for v in vals("2.0", c, k, absval)]
    b = [v for c in cond_list for v in vals("2.5", c, k, absval)]
    if a and b:
        cmp_rows.append(dict(label=label, k=k, conds=cond_list, m20=float(np.mean(a)), m25=float(np.mean(b)), n20=len(a), n25=len(b),
                             delta=cliffs_delta(b, a), lower_better=lower_better, **perm_test(b, a, "two-sided")))

add_row("텍스트 타임스탬프 정밀도 |리빌−8s|", ["E1-TT"], "t_reveal_err", True)
add_row("오디오 드롭 추종 |리빌−드롭|", ["E1-N", "E1-R8", "E1-R4"], "t_reveal_err", True)
add_row("오디오 드롭 추종 |모션 히트−드롭|", ["E1-N", "E1-R8", "E1-R4"], "t_hit_err", True)
add_row("출력 오디오 보존도 (엔벨로프 r)", ["E1-N", "E1-R8", "E1-R4", "E2-U", "E2-S"], "fidelity", False, False)
add_row("비트 위상 고정 R", ["E1-N", "E1-R8", "E1-R4"], "R_beat", False, False)
add_row("돌리인 추종 (첫 6초 줌인 비율)", ["E2-U", "E2-S", "E2-V"], "zoom_pos_first6", False, False)
add_row("카메라 속도 변동계수", ["E2-U", "E2-S", "E2-V"], "cam_speed_cv", False, True)
add_row("컷 수 / 12초", ["E1-T", "E1-TT", "E1-N", "E1-R8", "E1-R4"], "n_cuts", False, True)
add_row("중복 프레임 비율 (카덴스)", ["E1-T", "E1-TT", "E1-N", "E1-R8", "E1-R4", "E2-U", "E2-S", "E2-V"], "dup_rate", False, True)
add_row("대사 발화 시점 |오차| (B·N)", ["E3-B", "E3-N"], "speech_err", True)
add_row("노크 SFX 시점 |오차| (B·N)", ["E3-B", "E3-N"], "knock_err", True)
add_row("립싱크 오프셋 |s|", ["E3-B", "E3-N"], "av_offset", True)
stats["model_cmp"] = cmp_rows


def clean(o):
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (float, np.floating)):
        return None if np.isnan(o) else round(float(o), 4)
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, np.bool_):
        return bool(o)
    return o


credits = manifest.get("credits", {})
data = dict(meta=dict(date="2026-10-02", n_runs=len(runs), n_e12=len(R12), n_e3=len(R3),
                      models={"2.0": "seedance_2_0 · mode std · 720p · 16:9", "2.5": "seedance_2_5 · mode omni_reference · 720p · 16:9"}),
            conditions={k: dict(**v, prompt=PROMPTS[k]) for k, v in COND.items()}, runs=runs, refs=refs, stats=stats)
json.dump(clean(data), open(f"{SITE}/data/data.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("runs:", len(runs), "| size KB:", os.path.getsize(f"{SITE}/data/data.json") // 1024)
for model, T in stats["tests"].items():
    for k, v in T.items():
        print(model, k, {kk: (round(vv, 3) if isinstance(vv, float) else vv) for kk, vv in v.items() if kk != "note"})
