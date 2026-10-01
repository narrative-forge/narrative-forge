import type { FC } from 'react';
import { tokens } from './tokens.js';

export interface TimelineNode {
  id: string;
  x: number;
  y: number;
  active: boolean;
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
        const dotColor = node.active || node.featured ? tokens.color.accent : tokens.color.muted;
        const size = node.active || node.featured ? 18 : 12;
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
              boxShadow: node.active ? `0 0 16px ${tokens.color.accent}` : 'none',
            }}
          />
        );
      })}
    </div>
  );
};
