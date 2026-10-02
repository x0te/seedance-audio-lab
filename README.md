# Audio as Input — Seedance 2.0 / 2.5 controlled study

**Researcher:** 이진형 · Content Engineer · bppd.me@gmail.com

Interactive report: **https://x0te.github.io/seedance-audio-lab/**

A controlled test of the Reddit claim that Seedance 2.0's audio reference can act as a "master clock" for video
generation (beat sync, build→drop structure, dialogue/SFX timing). 66 generations (33 × Seedance 2.0, 33 × Seedance 2.5,
via Higgsfield) across 11 conditions, measured frame-by-frame against synthetic stimuli whose ground truth is known.

## Layout

| Path | What |
|---|---|
| `index.html`, `assets/`, `data/data.json`, `media/` | The published report (GitHub Pages root) |
| `research/scripts/synth_music.py`, `synth_dialogue.py` | Ground-truth stimuli: 120 BPM EDM with drop @ 8 s / 4 s, knock + TTS dialogue |
| `research/scripts/prompts.py` | Frozen prompt set for every condition |
| `research/scripts/features.py` | Optical flow (Farnebäck), camera model, hard-cut detection, audio envelopes |
| `research/scripts/metrics.py` | Change points, drop detection, Rayleigh beat-phase test, periodicity, camera metrics |
| `research/scripts/reveal.py` | Semantic "cityscape reveal" detector |
| `research/scripts/dialogue_metrics.py` | Whisper large-v3-turbo transcript/CER, speech & knock onsets, MediaPipe lip-sync offset |
| `research/scripts/build_data.py` | Aggregation, statistics (exact / Monte-Carlo permutation tests, bootstrap CIs), web media |
| `research/analysis/` | Per-run results (`results_e12.json`, `results_e3.json`, `reveal.json`) and job manifest |
| `research/stimuli/` | Input images, audio stimuli and their ground-truth JSON |

## Reproduce the analysis

```bash
python -m venv venv && venv/Scripts/pip install numpy scipy matplotlib opencv-python-headless librosa soundfile faster-whisper mediapipe
python research/scripts/synth_music.py research/stimuli
python research/scripts/features.py <video.mp4> <out.npz>
python research/scripts/run_all.py && python research/scripts/run_e3.py && python research/scripts/build_data.py
```

Scripts were written against absolute paths on the authoring machine; adjust `ROOT` at the top of each script.

All videos and images in this repository are AI-generated (Seedance 2.0/2.5, GPT Image 2.5, Seed Audio via Higgsfield).
