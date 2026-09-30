import type { Schedule } from '@forge/core';
import type { Node } from '@forge/schema';

/**
 * Options for {@link computeTimelineLayout}.
 *
 * `width`/`height` are the canvas dimensions in pixels. `paddingX` is the
 * horizontal inset of the timeline's usable span; `timelineY` is the vertical
 * position of the (single) track in Phase 1.
 */
export interface TimelineLayoutOptions {
  /** 画布宽度（像素） */
  width: number;
  /** 画布高度（像素） */
  height: number;
  /** 水平内边距（像素），默认 80 */
  paddingX?: number;
  /** 时间轴在画布上的 y 位置，默认 height * 0.6 */
  timelineY?: number;
}

/** Per-node viewport placement and render state for a single frame. */
export interface TimelineLayoutItem {
  /** 节点 id，与 Node.id 一致 */
  id: string;
  /** 视口内 x 坐标（像素） */
  x: number;
  /** 视口内 y 坐标（像素） */
  y: number;
  /** 是否在可视范围内 */
  visible: boolean;
  /** 透明度 [0, 1] */
  opacity: number;
}

/** Pure-data layout for one frame of the timeline. JSON-serialisable only. */
export interface TimelineLayoutResult {
  /** 所有节点的视口内位置与状态 */
  items: TimelineLayoutItem[];
  /** 时间轴的视觉参数（视口坐标） */
  timeline: {
    /** 时间轴左端视口 x */
    x0: number;
    /** 时间轴右端视口 x */
    x1: number;
    /** 时间轴 y */
    y: number;
  };
  /** 当前活动节点 id，intro/outro 阶段为 null */
  activeNodeId: string | null;
}

/** Re-exported here only for documentation parity with the TASK-006 contract. */
export type { Node, Schedule };
