import type { FC } from 'react';
import { interpolateColor } from './color.js';
import { tokens } from './tokens.js';

export interface TimelineNode {
  id: string;
  x: number;
  y: number;
  /**
   * 活跃度 [0, 1]，由渲染层逐帧给出（TASK-012）。
   * 替代 TASK-007 的布尔 `active` —— 圆点的尺寸、颜色、光晕原来都在单帧内
   * 硬跳（12→18px、灰→金、无光晕→有光晕），是"闪烁感"的一部分。
   */
  activeAmount: number;
  featured: boolean;
}

export interface TimelineProps {
  /** 时间轴左端视口 x */
  x0: number;
  /** 时间轴右端视口 x */
  x1: number;
  /** 时间轴 y */
  y: number;
  /** 各节点圆点（视口坐标） */
  nodes: TimelineNode[];
}

/** 非强调态圆点直径（像素）。 */
const DOT_BASE_SIZE = 12;
/** 强调态相对非强调态增加的直径（像素）——与 TASK-007 的 18px 保持一致。 */
const DOT_EMPHASIS_GROWTH = 6;
/** 活动圆点光晕的最大 alpha（0x88 ≈ 53%），线性随活跃度淡入。 */
const DOT_GLOW_MAX_ALPHA = 0x88;

/**
 * 时间轴视觉元素：水平线 + 节点圆点。所有坐标均为视口坐标，
 * 由布局层（computeTimelineLayout / smoothCamera）提供。纯展示，无交互。
 */
export const Timeline: FC<TimelineProps> = ({ x0, x1, y, nodes }) => {
  const lineWidth = Math.max(x1 - x0, 1);

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: x0,
          top: y,
          width: lineWidth,
          height: 4,
          backgroundColor: tokens.color.timelineLine,
          borderRadius: 2,
        }}
      />
      {nodes.map((node) => {
        // featured 与 active 都算"强调"，取大值 —— 与 TASK-007 的
        // `active || featured` 语义一致，只是两者现在都是连续量，可以过渡。
        const emphasis = Math.max(node.activeAmount, node.featured ? 1 : 0);
        const size = DOT_BASE_SIZE + DOT_EMPHASIS_GROWTH * emphasis;
        const dotColor = interpolateColor(tokens.color.muted, tokens.color.accent, emphasis);
        const glowAlpha = Math.round(node.activeAmount * DOT_GLOW_MAX_ALPHA);
        return (
          <div
            key={node.id}
            style={{
              position: 'absolute',
              left: node.x,
              top: y,
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              borderRadius: '50%',
              backgroundColor: dotColor,
              border: `2px solid ${tokens.color.background}`,
              boxShadow:
                glowAlpha > 0
                  ? `0 0 16px ${tokens.color.accent}${glowAlpha.toString(16).padStart(2, '0')}`
                  : 'none',
            }}
          />
        );
      })}
    </div>
  );
};
