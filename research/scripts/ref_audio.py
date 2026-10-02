import librosa, numpy as np
SR, HOP = 22050, 220
for n in ["A_drop8", "A_drop4", "A_dialogue"]:
    y, _ = librosa.load(f"stimuli/{n}.wav", sr=SR)
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=HOP)[0]
    on = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    np.savez_compressed(f"analysis/feat/ref_{n}.npz", rms=rms, onset=on, y=y.astype(np.float32))
    print(n, len(rms))
