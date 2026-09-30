/**
 * @forge/layouts — timeline layout (时间线布局).
 *
 * Pure data layout for the sliding-viewport timeline. Given the node list, a
 * rhythm Schedule, the current playhead time and the canvas size, it returns
 * per-frame layout data (viewport x/y, visibility, opacity) for every node.
 *
 * Coordinate model — three distinct spaces, deliberately kept separate to avoid
 * the classic world/viewport/camera confusion:
 *
 *   1. World coordinates: nodes sit on a horizontal axis, evenly spaced
 *      `nodeSpacing = (width - 2*paddingX) / (N-1)` apart, at `worldY`. The
 *      camera sits at the active node's world x.
 *   2. Camera: `camWorldX = worldX[camIndex]`, where `camIndex` comes from
 *      `locate(schedule, tSec).nodeIndex` during the content phase, and is
 *      clamped to the first (intro) or last (outro) node when there is no
 *      active node.
 *   3. Viewport coordinates (the output): translate world space so the camera
 *      lands at `width/2`. No interpolation in Phase 1 — the camera jumps
 *      directly to the active node (TASK-006 contract); TASK-007 smooths the
 *      motion via Remotion springs/interpolate, keeping layout deterministic.
 *
 * Invariants for reviewers:
 *   - No `let`, no module-level mutable state (pure function).
 *   - No render-layer imports (no react / remotion / three).
 *   - The return value is plain JSON-serialisable data only (ADR-004).
 */

import { locate } from '@forge/core';
import type { Schedule } from '@forge/core';
import type { Node } from '@forge/schema';

import type { TimelineLayoutItem, TimelineLayoutOptions, TimelineLayoutResult } from './types';

const DEFAULT_PADDING_X = 80;

function resolveOptions(options: TimelineLayoutOptions): {
  width: number;
  height: number;
  paddingX: number;
  timelineY: number;
} {
  const width = options.width;
  const height = options.height;
  const paddingX = options.paddingX ?? DEFAULT_PADDING_X;
  const timelineY = options.timelineY ?? height * 0.6;
  return { width, height, paddingX, timelineY };
}

export function computeTimelineLayout(
  nodes: Node[],
  schedule: Schedule,
  tSec: number,
  options: TimelineLayoutOptions
): TimelineLayoutResult {
  const { width, height, paddingX, timelineY } = resolveOptions(options);

  // --- Input validation (throw on contract breach) ---
  if (nodes.length !== schedule.segments.length) {
    throw new Error(
      `nodes.length (${nodes.length}) must equal schedule.segments.length (${schedule.segments.length})`
    );
  }
  if (width <= 0) throw new Error(`options.width must be > 0 (got ${width})`);
  if (height <= 0) throw new Error(`options.height must be > 0 (got ${height})`);
  if (paddingX * 2 >= width) {
    throw new Error(`paddingX*2 (${paddingX * 2}) must be < width (${width})`);
  }

  const n = nodes.length;

  // --- 1. World coordinates ---
  const spacing = n >= 2 ? (width - 2 * paddingX) / (n - 1) : 0;
  const worldX = nodes.map((_, i) => i * spacing);
  const worldY = timelineY;

  // --- 2. Camera focus (active node) ---
  // Intro/outro are inclusive of their endpoints (L15/L16 use `<=`/`>=`), so the
  // "content phase" is the open interval (introSec, totalSec - outroSec).
  const introSec = schedule.introSec;
  const outroBoundary = schedule.totalSec - schedule.outroSec;
  const inIntro = tSec <= introSec;
  const inOutro = tSec >= outroBoundary;
  const camIndex = inIntro ? 0 : inOutro ? n - 1 : locate(schedule, tSec).nodeIndex;
  const activeNode = nodes[camIndex];
  const activeNodeId = inIntro || inOutro ? null : activeNode ? activeNode.id : null;

  // --- 3. Viewport coordinates (output) ---
  const camWorldX = worldX[camIndex] ?? 0;
  const items: TimelineLayoutItem[] = nodes.map((node, i) => {
    const x = (worldX[i] ?? 0) - camWorldX + width / 2;
    const visible = x >= -width * 0.5 && x <= width * 1.5;
    const opacity = inIntro || inOutro ? 0.5 : node.id === activeNodeId ? 1.0 : 0.4;
    return { id: node.id, x, y: worldY, visible, opacity };
  });

  const timeline = {
    x0: (worldX[0] ?? 0) - camWorldX + width / 2,
    x1: (worldX[n - 1] ?? 0) - camWorldX + width / 2,
    y: worldY,
  };

  return { items, timeline, activeNodeId };
}
