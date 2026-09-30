/**
 * @forge/core — frame → progress mapping.
 *
 * Maps a frame index to a normalised progress value in [0, 1] using Remotion's
 * frame convention: there are `durationInFrames` frames, valid indices are
 * [0, durationInFrames - 1], and the LAST valid frame maps to progress 1.
 *
 * `fps` deliberately does NOT appear as a parameter: progress depends only on
 * the frame's position within [0, durationInFrames - 1] (TASK-004 decision 5 —
 * `frame / fps / (durationInFrames / fps)` ≡ `frame / durationInFrames`, so fps
 * is redundant and would mislead callers into thinking it participates).
 *
 * Note on the formula: the brief's inline doc described the mapping as
 * "frame / durationInFrames", but that places the last valid frame at
 * (N-1)/N ≠ 1, contradicting the required invariant P19
 * (frameToProgress(N-1, N) === 1). We therefore map over [0, N-1] so the final
 * frame is exactly 1, and clamp out-of-range frames. See TASK-005-report.md.
 *
 * Pure function: no side effects, no module-level mutable state.
 */

export function frameToProgress(frame: number, durationInFrames: number): number {
  if (!Number.isFinite(durationInFrames) || durationInFrames < 1) {
    throw new Error(
      `frameToProgress: durationInFrames must be a finite number >= 1, received ${durationInFrames}`
    );
  }
  // A single frame represents the entire clip: progress is always complete.
  if (durationInFrames === 1) return 1;
  const clamped = Math.min(Math.max(frame, 0), durationInFrames - 1);
  return clamped / (durationInFrames - 1);
}
