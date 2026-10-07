/**
 * @forge/render — public contracts (TASK-008 Step B).
 *
 * Kept free of any Remotion type: callers of `@forge/render` describe *what*
 * they want, never *how* Remotion produces it. That is what lets
 * `@forge/cli` depend on `@forge/render` without ever importing
 * `@remotion/*` (task constraint).
 */

export interface RenderOptions {
  /** Absolute (or cwd-relative) path to a story.json file. */
  storyPath: string;
  /** Id of the view to render, as declared in `story.views[].id`. */
  viewId: string;
  /** Where the MP4 should be written. */
  outputPath: string;
  /** Frame rate. Defaults to the story's own `meta.fps`, then 30. */
  fps?: number;
  /** Output resolution. Defaults to the story's own `meta.resolution`. */
  resolution?: { width: number; height: number };
  /** Remotion worker concurrency. Defaults to half the CPU cores (>= 1). */
  concurrency?: number;
  /**
   * Path to the Chrome/Chromium binary used for rendering.
   *
   * Optional: when omitted, the locally installed Google Chrome is auto-detected
   * (`@forge/compositions/chrome`). Remotion's own browser download is disabled
   * unconditionally — a missing browser is an error, never a fetch.
   */
  browserExecutable?: string;
  /**
   * Directory holding the `ffmpeg` / `ffprobe` binaries Remotion should encode
   * with, instead of the ones it bundles.
   *
   * Optional: when omitted it is resolved by `@forge/compositions/ffmpeg`, which
   * only steps in on macOS versions where Remotion's bundled FFmpeg cannot be
   * loaded. Never triggers a download.
   */
  binariesDirectory?: string;
  /**
   * Budget for Remotion's internal `delayRender()` calls, in milliseconds.
   *
   * Page setup, loading the root component and "setting the current frame to N"
   * during rendering all share this one budget. Defaults to `300000`.
   *
   * Remotion's own default is `30000`. That is fine on a fast machine, but this
   * project targets a 4 GB MacBook Air where page setup alone has been measured
   * well past 30 s, so the stock budget fails intermittently. Raising it costs
   * nothing when the machine *is* fast: it is an upper bound, not a wait.
   */
  timeoutInMilliseconds?: number;
  /** Progress callback, values in [0, 1]. */
  onProgress?: (progress: number) => void;
}

export interface RenderResult {
  outputPath: string;
  durationInFrames: number;
  durationInSec: number;
  fileSizeBytes: number;
  renderTimeMs: number;
}
