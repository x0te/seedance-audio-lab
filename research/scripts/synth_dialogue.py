"""Build the E3-A dialogue reference: 8.0 s, door knocks at 1.00/1.20 s, TTS line onset at exactly 4.00 s."""
import json, numpy as np, soundfile as sf, librosa
from scipy.signal import butter, sosfilt
SR = 44100
rng = np.random.default_rng(3)
y, sr = librosa.load("stimuli/TTS_line_raw.wav", sr=SR, mono=True)
# speech onset = first frame whose RMS exceeds 10% of max
rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=128)[0]
on = int(np.argmax(rms > 0.1 * rms.max())) * 128
off = len(rms) - int(np.argmax(rms[::-1] > 0.1 * rms.max()))
speech = y[max(0, on - 64):]
speech_dur = (off * 128 - on) / SR

def knock():
    n = int(0.25 * SR); t = np.arange(n) / SR
    body = sum(a * np.sin(2*np.pi*f*t) * np.exp(-t/d) for f, a, d in ((180,1,.05),(310,.6,.035),(520,.35,.02)))
    sos = butter(2, [800, 3000], btype="band", fs=SR, output="sos")
    click = sosfilt(sos, rng.normal(0,1,n)) * np.exp(-t/.004) * .8
    return body + click

buf = np.zeros(int(8.0 * SR))
for t0 in (1.00, 1.20):
    k = knock(); i = int(t0*SR); buf[i:i+len(k)] += 0.7 * k / np.abs(k).max()
i = int(4.0*SR) - 64; seg = speech[: len(buf) - i]
buf[i:i+len(seg)] += 0.9 * seg / np.abs(seg).max()
buf /= np.abs(buf).max() * 1.05
sf.write("stimuli/A_dialogue.wav", buf.astype(np.float32), SR, subtype="PCM_16")
json.dump({"knocks": [1.0, 1.2], "speech_onset": 4.0, "speech_dur": round(speech_dur, 3),
           "speech_offset": round(4.0 + speech_dur, 3), "line": "설마 이걸 진짜 먹으라고?", "duration": 8.0},
          open("stimuli/dialogue_ground_truth.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("speech dur", speech_dur)
