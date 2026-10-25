#!/usr/bin/env python3
"""
🎯 face_track.py — helper deteksi wajah untuk fitur Auto-Reframe Speaker Tracking
=====================================================================
Dipanggil oleh src/lib/speaker-tracker.ts (backend "opencv"). TIDAK
menyentuh/mengubah fitur lain pada bot — murni skrip baru yang berdiri
sendiri.

Cara kerja (ringkas, mudah diaudit/diganti):
  1. Buka video dengan OpenCV, lompat ke `--start` (detik).
  2. Ambil 1 frame setiap `1/--fps` detik sampai `--end`.
  3. Jalankan Haar Cascade frontal-face bawaan OpenCV pada tiap frame.
  4. Dari semua wajah yang terdeteksi di satu frame, pilih yang area-nya
     terbesar (heuristik sederhana untuk "pembicara aktif" / paling
     dominan di layar) dan abaikan wajah yang lebih kecil dari
     `--min-face-size` (rasio terhadap lebar frame).
  5. Cetak hasil sebagai JSON ke stdout:
     {
       "frameWidth": <int>, "frameHeight": <int>,
       "faces": [ { "t": <detik relatif awal clip>, "cx":0..1, "cy":0..1,
                     "w":0..1, "h":0..1 }, ... ]
     }

Kalau OpenCV tidak terpasang atau video gagal dibuka, skrip tetap keluar
dengan JSON `{"error": "...", "faces": []}` (exit code 0) supaya sisi
Node.js bisa fallback ke crop statis tanpa membuat job gagal.

🔁 Ingin pakai model deteksi lain (mis. DNN/Mediapipe) yang lebih akurat?
   Cukup ganti isi fungsi `detect_faces_in_frame()` di bawah — format
   input/output ke Node.js (JSON di atas) tidak perlu berubah.
"""
import argparse
import json
import sys


def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--start", type=float, default=0.0)
    parser.add_argument("--end", type=float, default=0.0)
    parser.add_argument("--fps", type=float, default=2.0)
    parser.add_argument("--min-face-size", type=float, default=0.03)
    parser.add_argument("--max-faces", type=int, default=1)
    args = parser.parse_args()

    try:
        import cv2  # type: ignore
    except Exception as exc:  # pragma: no cover - environment dependent
        print(json.dumps({"error": f"opencv_not_available: {exc}", "faces": [],
                           "frameWidth": 0, "frameHeight": 0}))
        return

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        print(json.dumps({"error": "video_open_failed", "faces": [],
                           "frameWidth": 0, "frameHeight": 0}))
        return

    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    video_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    video_duration = (total_frames / video_fps) if video_fps > 0 else 0.0

    start = max(0.0, args.start)
    end = args.end if args.end > start else (video_duration or start + 1.0)
    if video_duration:
        end = min(end, video_duration)

    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_cascade = cv2.CascadeClassifier(cascade_path)
    if face_cascade.empty():
        print(json.dumps({"error": "cascade_load_failed", "faces": [],
                           "frameWidth": frame_width, "frameHeight": frame_height}))
        return

    step = 1.0 / max(0.1, args.fps)
    faces_out = []

    t = start
    while t < end:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
        ok, frame = cap.read()
        if not ok or frame is None:
            t += step
            continue

        detections = detect_faces_in_frame(frame, face_cascade)
        if detections:
            fh, fw = frame.shape[0], frame.shape[1]
            # Urutkan berdasarkan area terbesar (wajah paling dominan dulu)
            detections.sort(key=lambda d: d[2] * d[3], reverse=True)
            kept = 0
            for (x, y, w, h) in detections:
                if kept >= max(1, args.max_faces):
                    break
                if (w / fw) < args.min_face_size:
                    continue
                faces_out.append({
                    "t": round(t - start, 3),
                    "cx": round((x + w / 2) / fw, 4),
                    "cy": round((y + h / 2) / fh, 4),
                    "w": round(w / fw, 4),
                    "h": round(h / fh, 4),
                })
                kept += 1

        t += step

    cap.release()
    print(json.dumps({
        "frameWidth": frame_width,
        "frameHeight": frame_height,
        "faces": faces_out,
    }))


def detect_faces_in_frame(frame, face_cascade):
    import cv2  # type: ignore
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    detections = face_cascade.detectMultiScale(
        gray, scaleFactor=1.15, minNeighbors=5, minSize=(40, 40)
    )
    return [tuple(d) for d in detections]


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # pragma: no cover
        print(json.dumps({"error": f"unexpected_error: {exc}", "faces": [],
                           "frameWidth": 0, "frameHeight": 0}))
