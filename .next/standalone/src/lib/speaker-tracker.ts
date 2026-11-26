/**
 * 🎯 SPEAKER TRACKER — deteksi wajah/pembicara aktif (BARU!)
 * =====================================================================
 * Modul ini SENGAJA dipisah dari auto-reframe.ts supaya backend deteksi
 * wajah mudah diganti tanpa menyentuh logika FFmpeg/crop sama sekali.
 *
 * 🔁 CARA MENGGANTI BACKEND DETEKSI (mis. pakai model lain yang lebih
 *    akurat seperti MediaPipe / DNN / layanan pihak ketiga):
 *    1. Tulis fungsi baru dengan signature `SpeakerTrackerBackend`.
 *    2. Daftarkan di map `BACKENDS` di bawah dengan key baru.
 *    3. Set `AUTO_REFRAME_BACKEND=<key-baru>` di Railway Variables.
 *    Tidak perlu mengubah file lain — auto-reframe.ts hanya memanggil
 *    `detectSpeakerTrack()` dan tidak peduli backend apa yang dipakai.
 *
 * Backend default ("opencv") memakai Haar Cascade bawaan OpenCV lewat
 * script Python kecil (scripts/face_track.py) karena ringan, tidak perlu
 * GPU, dan paket `opencv-python-headless` + `python3` sudah terpasang di
 * Dockerfile (lihat komentar di Dockerfile bagian Auto-Reframe). Heuristik
 * "pembicara aktif" = wajah dengan area terbesar pada tiap sample frame
 * (asumsi umum: pembicara utama paling dekat ke kamera / paling dominan).
 */
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import type { AutoReframeConfig } from "@/lib/reframe-config";

export interface FaceBox {
  /** Waktu relatif terhadap awal klip (detik) */
  t: number;
  /** Titik tengah wajah, dinormalisasi 0..1 terhadap lebar/tinggi frame */
  cx: number;
  cy: number;
  /** Lebar/tinggi wajah, dinormalisasi 0..1 terhadap lebar/tinggi frame */
  w: number;
  h: number;
}

export interface SpeakerTrackResult {
  faces: FaceBox[];
  frameWidth: number;
  frameHeight: number;
  backend: string;
  /** Diisi kalau backend gagal / tidak ada wajah — dipakai untuk logging & fallback */
  warning?: string;
}

export type SpeakerTrackerBackend = (
  videoPath: string,
  startTime: number,
  endTime: number,
  cfg: AutoReframeConfig
) => Promise<SpeakerTrackResult>;

const PROJECT_ROOT = process.cwd();
const FACE_TRACK_SCRIPT = path.join(PROJECT_ROOT, "scripts", "face_track.py");

/** Backend default: OpenCV Haar Cascade via Python (lihat scripts/face_track.py) */
const runOpenCvBackend: SpeakerTrackerBackend = async (videoPath, startTime, endTime, cfg) => {
  if (!fs.existsSync(FACE_TRACK_SCRIPT)) {
    return { faces: [], frameWidth: 0, frameHeight: 0, backend: "opencv", warning: "script_not_found" };
  }

  const args = [
    FACE_TRACK_SCRIPT,
    "--video", videoPath,
    "--start", String(startTime),
    "--end", String(endTime),
    "--fps", String(cfg.sampleFps),
    "--min-face-size", String(cfg.minFaceSize),
    "--max-faces", String(cfg.maxFaces),
  ];

  const stdout = await runPython(args, cfg.timeoutMs);
  const parsed = JSON.parse(stdout) as {
    frameWidth: number;
    frameHeight: number;
    faces: { t: number; cx: number; cy: number; w: number; h: number }[];
    error?: string;
  };

  if (parsed.error) {
    return {
      faces: [],
      frameWidth: parsed.frameWidth || 0,
      frameHeight: parsed.frameHeight || 0,
      backend: "opencv",
      warning: parsed.error,
    };
  }

  return {
    faces: parsed.faces || [],
    frameWidth: parsed.frameWidth,
    frameHeight: parsed.frameHeight,
    backend: "opencv",
  };
};

/** Backend "none": selalu kosong → auto-reframe.ts akan langsung fallback ke crop statis. */
const runNoneBackend: SpeakerTrackerBackend = async () => ({
  faces: [],
  frameWidth: 0,
  frameHeight: 0,
  backend: "none",
  warning: "backend_disabled",
});

// 👉 Tambahkan backend baru di sini untuk menggantinya dengan mudah.
const BACKENDS: Record<string, SpeakerTrackerBackend> = {
  opencv: runOpenCvBackend,
  none: runNoneBackend,
};

function runPython(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const pythonBin = process.env.PYTHON_BIN || "python3";
    const child = spawn(pythonBin, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`speaker-tracker timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`speaker-tracker exited with code ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Titik masuk tunggal yang dipakai auto-reframe.ts. Tidak pernah throw —
 * kalau backend gagal, mengembalikan hasil kosong supaya pemanggil bisa
 * fallback dengan aman ke crop statis.
 */
export async function detectSpeakerTrack(
  videoPath: string,
  startTime: number,
  endTime: number,
  cfg: AutoReframeConfig
): Promise<SpeakerTrackResult> {
  const backendFn = BACKENDS[cfg.backend] || BACKENDS.opencv;
  try {
    return await backendFn(videoPath, startTime, endTime, cfg);
  } catch (err) {
    console.warn(`[speaker-tracker] Backend "${cfg.backend}" gagal, fallback ke crop statis:`, err);
    return {
      faces: [],
      frameWidth: 0,
      frameHeight: 0,
      backend: cfg.backend,
      warning: err instanceof Error ? err.message : String(err),
    };
  }
}
