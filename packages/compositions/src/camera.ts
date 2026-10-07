/**
 * @forge/compositions — camera interpolation.
 *
 * `computeTimelineLayout` (TASK-006) produces a **non-interpolated** camera:
 * when the active node changes, the camera jumps instantly and every card's
 * opacity snaps between 1.0 and 0.4. The original project smoothed both inside
 * the Canvas render loop. Per ADR-004 (layout / render separation) the
 * smoothing belongs in the **render** layer, so this module is the pure-data
 * compensation: given the current and the "previous switch" layouts, it
 * interpolates the camera-relevant x coordinates **and the per-item opacity**
 * over `transitionFrames`.
 *
 * TASK-012 added the two pieces the TASK-007 version was missing. They are why
 * the first MP4 read as *flickering* instead of *moving*, and both are measured
 * in `docs/reports/TASK-012-smoothness-report.md`:
 *
 * - **Easing.** The blend factor was linear, i.e. a constant-velocity move that
 *   starts and stops between two consecutive frames — the cheapest-looking
 *   motion a camera can make. Measured on the demo, one node's 251.43 px move
 *   took 15 frames at a flat ~16.8 px/frame. It now runs through
 *   `easeInOutCubic`, so each move accelerates out and settles in.
 * - **Opacity.** Only `items[].x` and `timeline.x0/x1` used to be interpolated;
 *   `opacity` was taken verbatim from `currentLayout`, so a card went from 0.4
 *   to 1.0 in a single frame. That snap was the **largest single-frame delta in
 *   the whole video** (3.14, versus 2.5 for the move that followed it).
 *   Interpolating it turns the snap into a cross-fade.
 *
 * Only `items[].x`, `items[].opacity` and `timeline.x0/x1` are interpolated;
 * `y` and `visible` are taken verbatim from `currentLayout` (per the contract).
 */
import type { TimelineLayoutResult } from '@forge/layouts';

/** Linear interpolation. `t` is expected in [0, 1]. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Symmetric ease-in-out cubic.
 *
 * Shared by this module **and** by `TimelineComposition`, which uses it to
 * derive each card's `activeAmount` from the same frame counter. Sharing one
 * curve is what keeps "the card brightens" and "the card arrives" a single
 * gesture rather than two overlapping animations.
 *
 * Monotonic on [0, 1] and pinned at both ends (`f(0) = 0`, `f(1) = 1`), which
 * is what preserves the C1/C3 contract asserted in `camera.test.ts`.
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Smooth the camera transition between two layouts.
 *
 * - `framesSinceSwitch >= transitionFrames` (or `transitionFrames <= 0`):
 *   returns `currentLayout` **without copying** (steady state).
 * - `framesSinceSwitch === 0`: returns the **x values and opacities** of
 *   `previousLayout` (the camera is still at its old position and the cards are
 *   still at their old brightness), i.e. the start of the transition.
 * - otherwise: ease-in-out blend with `t = min(framesSinceSwitch /
 *   transitionFrames, 1)`.
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
  const eased = easeInOutCubic(t);

  const items = currentLayout.items.map((item, index) => {
    const previous = previousLayout.items[index];
    const previousX = previous !== undefined ? previous.x : item.x;
    const previousOpacity = previous !== undefined ? previous.opacity : item.opacity;
    return {
      ...item,
      x: lerp(previousX, item.x, eased),
      opacity: lerp(previousOpacity, item.opacity, eased),
    };
  });

  const timeline = {
    x0: lerp(previousLayout.timeline.x0, currentLayout.timeline.x0, eased),
    x1: lerp(previousLayout.timeline.x1, currentLayout.timeline.x1, eased),
    y: currentLayout.timeline.y,
  };

  return { ...currentLayout, items, timeline };
}
