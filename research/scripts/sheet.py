"""Timestamped contact sheet: python sheet.py video.mp4 out.jpg [fps=2] [cols=8]"""
import sys, cv2, numpy as np
v, out = sys.argv[1], sys.argv[2]
step = float(sys.argv[3]) if len(sys.argv) > 3 else 2.0
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 8
cap = cv2.VideoCapture(v); fps = cap.get(cv2.CAP_PROP_FPS); n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
tiles = []
for i in np.arange(0, n, fps / step).astype(int):
    cap.set(cv2.CAP_PROP_POS_FRAMES, i); ok, f = cap.read()
    if not ok: break
    f = cv2.resize(f, (240, int(240 * f.shape[0] / f.shape[1])))
    cv2.rectangle(f, (0, 0), (62, 18), (0, 0, 0), -1)
    cv2.putText(f, f"{i / fps:.2f}s", (3, 13), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 255), 1)
    tiles.append(f)
while len(tiles) % cols: tiles.append(np.zeros_like(tiles[0]))
rows = [np.hstack(tiles[r:r + cols]) for r in range(0, len(tiles), cols)]
cv2.imwrite(out, np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 85])
