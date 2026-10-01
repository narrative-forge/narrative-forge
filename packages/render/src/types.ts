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
