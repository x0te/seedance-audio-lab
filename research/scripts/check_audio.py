import librosa, numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
fig, axs = plt.subplots(2, 1, figsize=(10, 5), sharex=True)
for ax, n in zip(axs, ["A_drop8", "A_drop4"]):
    y, sr = librosa.load(f"stimuli/{n}.wav", sr=22050)
    S = librosa.amplitude_to_db(np.abs(librosa.stft(y, n_fft=1024, hop_length=256)), ref=np.max)
    librosa.display.specshow(S, sr=sr, hop_length=256, x_axis="time", y_axis="log", ax=ax)
    rms = librosa.feature.rms(y=y, hop_length=256)[0]
    t = librosa.times_like(rms, sr=sr, hop_length=256)
    ax2 = ax.twinx(); ax2.plot(t, rms, color="w", lw=1)
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
    print(n, "tempo est", tempo, "rms pre/post drop", rms[t<float(n[-1])].mean(), rms[t>=float(n[-1])].mean())
    ax.set_title(n)
plt.tight_layout(); plt.savefig("analysis/_check_audio.png", dpi=80)
