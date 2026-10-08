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
import type { TimelineLayoutItem, TimelineLayoutOptions, TimelineLayoutResult } from './types.js';

/**
 * 水平内边距。
 *
 * 原为 80，此时 8 节点的间距 = (1920 − 160) / 7 = **251.43px**，而卡片宽
 * 320px —— 非活动卡缩放到贴合间距后**相邻间隙恰好为 0px**，8 张卡连成一堵
 * 没有呼吸的文字墙（TASK-011 §3.2 附带问题）。
 *
 * 120 把间距压到 240px，配合渲染层 0.92 的呼吸系数与收窄后的 260px 卡宽，
 * 实际间隙约 19px。
 */
const DEFAULT_PADDING_X = 120;

/**
 * 时间轴在画布上的相对高度。
 *
 * 原为 `height * 0.6`：卡片带（高 180）落在 y = 252–432，**上方 23.3%、
 * 下方 40% 全是空白**，有效像素只占 16.7%（TASK-011 §3.1）。
 * 上移到 0.52 后，上方让给标题区（`StoryHeader`）、下方让给字幕条
 * （`SubtitleBar`），三段式版式才立得住。
 */
const DEFAULT_TIMELINE_Y_RATIO = 0.52;

/**
 * 非活动节点的透明度。
 *
 * 原为 0.4。实测它把非活动 featured 节点的金色标记压到 **2.25 : 1** ——
 * 八张卡里唯一该被看见的两张，在大部分时间里是最看不清的两张
 * （TASK-011 §3.6）。"降透明 = 表达聚焦"的意图没错，错在把**可读性**
 * 当成层级手段。0.72 时正文对比度 8.52 : 1，达标；层级改由边框亮度、
 * 光晕与背景明度表达（见 `EventCard`）。
 */
const INACTIVE_OPACITY = 0.72;
/** intro / outro 阶段所有节点的统一透明度。 */
const AMBIENT_OPACITY = 0.62;

function resolveOptions(options: TimelineLayoutOptions): {
  width: number;
  height: number;
  paddingX: number;
  timelineY: number;
} {
  const width = options.width;
  const height = options.height;
  const paddingX = options.paddingX ?? DEFAULT_PADDING_X;
  const timelineY = options.timelineY ?? height * DEFAULT_TIMELINE_Y_RATIO;
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
    const opacity =
      inIntro || inOutro
        ? AMBIENT_OPACITY
        : node.id === activeNodeId
          ? 1.0
          : INACTIVE_OPACITY;
    return { id: node.id, x, y: worldY, visible, opacity };
  });

  const timeline = {
    x0: (worldX[0] ?? 0) - camWorldX + width / 2,
    x1: (worldX[n - 1] ?? 0) - camWorldX + width / 2,
    y: worldY,
  };

  return { items, timeline, activeNodeId };
}
