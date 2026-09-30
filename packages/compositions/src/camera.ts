/**
 * @forge/compositions — camera interpolation.
 *
 * `computeTimelineLayout` (TASK-006) produces a **non-interpolated** camera:
 * when the active node changes, the camera jumps instantly. The original
 * project smoothed this with per-frame easing inside the Canvas render loop.
 * Per ADR-004 (layout / render separation) the smoothing belongs in the
 * **render** layer, so this module is the pure-data compensation: given the
 * current and the "previous switch" layouts, it linearly interpolates the
 * camera-relevant x coordinates over `transitionFrames`.
 *
 * Only `items[].x` and `timeline.x0/x1` are interpolated; `y`, `opacity`
 * and `visible` are taken verbatim from `currentLayout` (per the contract).
 */
import type { TimelineLayoutResult } from '@forge/layouts';

/** Linear interpolation. `t` is expected in [0, 1]. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Smooth the camera transition between two layouts.
 *
 * - `framesSinceSwitch >= transitionFrames` (or `transitionFrames <= 0`):
 *   returns `currentLayout` **without copying** (steady state).
 * - `framesSinceSwitch === 0`: returns `currentLayout` with the **x values**
 *   replaced by `previousLayout`'s (the camera is still at its old position),
 *   i.e. the start of the transition.
 * - otherwise: linear blend with `t = min(framesSinceSwitch / transitionFrames, 1)`.
 */
export function smoothCamera(
  currentLayout: TimelineLayoutResult,
  previousLayout: TimelineLayoutResult,
  framesSinceSwitch: number,
  transitionFrames: number
): TimelineLayoutResult {
  if (framesSinceSwitch >= transitionFrames || transitionFrames <= 0) {
    return currentLayout;
  }

  const t = Math.min(framesSinceSwitch / transitionFrames, 1);

  const items = currentLayout.items.map((item, index) => {
    const previous = previousLayout.items[index];
    const previousX = previous !== undefined ? previous.x : item.x;
    return { ...item, x: lerp(previousX, item.x, t) };
  });

  const timeline = {
    x0: lerp(previousLayout.timeline.x0, currentLayout.timeline.x0, t),
    x1: lerp(previousLayout.timeline.x1, currentLayout.timeline.x1, t),
    y: currentLayout.timeline.y,
  };

  return { ...currentLayout, items, timeline };
}
