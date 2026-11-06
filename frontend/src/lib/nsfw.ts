import type { NSFWJS, PredictionType } from 'nsfwjs';

/** Explicit = Porn + Hentai probability. "Sexy" is ignored: it fires far too often on normal video. */
export const EXPLICIT_THRESHOLD = 0.7;

export function explicitScore(predictions: Pick<PredictionType, 'className' | 'probability'>[]): number {
  return predictions
    .filter((p) => p.className === 'Porn' || p.className === 'Hentai')
    .reduce((sum, p) => sum + p.probability, 0);
}

let modelPromise: Promise<NSFWJS> | null = null;

const defaultLoader = async (): Promise<NSFWJS> => (await import('nsfwjs')).load('MobileNetV2');

/**
 * The classifier model is loaded once per page and shared by every call. A model per call would
 * re-download/parse it on every Next and keep the old weights (and WebGL memory) alive.
 * A failed load is not cached, so the next call can retry.
 */
export function loadNsfwModel(loader: () => Promise<NSFWJS> = defaultLoader): Promise<NSFWJS> {
  if (!modelPromise) {
    modelPromise = loader().catch((err) => {
      modelPromise = null;
      throw err;
    });
  }
  return modelPromise;
}

/** Warm the model while the user is on the camera preview, so the first call is scanned straight away. */
export function preloadNsfwModel(): void {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return; // respect data-saver mode; scanning will load it lazily instead
  void loadNsfwModel().catch(() => undefined);
}

/** Test helper. */
export function _resetNsfwModelForTests(): void {
  modelPromise = null;
}

interface Options {
  getVideo: () => HTMLVideoElement | null;
  /** Called once when two consecutive samples are explicit. */
  onExplicit: (score: number) => void;
  /** Called when two consecutive samples are clean again. */
  onClear: () => void;
  intervalMs?: number;
}

/**
 * Samples the stranger's video every few seconds and classifies it on this device with a small
 * MobileNet model (no frames leave the browser unless a report is sent). Two consecutive hits are
 * required to cut false positives. The model is lazy-loaded the first time a call starts.
 */
export class NsfwScanner {
  private model: NSFWJS | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private hits = 0;
  private clears = 0;
  private explicit = false;
  private stopped = false;

  constructor(private readonly opts: Options) {}

  async start(): Promise<void> {
    this.stopped = false;
    try {
      this.model = await loadNsfwModel();
    } catch {
      return; // scanning is best-effort; the manual Report button still works
    }
    if (this.stopped) return;
    this.timer = setInterval(() => void this.tick(), this.opts.intervalMs ?? 3000);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.hits = this.clears = 0;
    this.explicit = false;
  }

  private async tick(): Promise<void> {
    const video = this.opts.getVideo();
    if (this.busy || !this.model || !video || video.paused || !video.videoWidth || document.hidden) return;
    this.busy = true;
    try {
      const score = explicitScore(await this.model.classify(video, 5));
      if (score >= EXPLICIT_THRESHOLD) {
        this.clears = 0;
        if (++this.hits >= 2 && !this.explicit) {
          this.explicit = true;
          this.opts.onExplicit(score);
        }
      } else {
        this.hits = 0;
        if (++this.clears >= 2 && this.explicit) {
          this.explicit = false;
          this.opts.onClear();
        }
      }
    } catch {
      /* ignore a failed frame */
    } finally {
      this.busy = false;
    }
  }
}
