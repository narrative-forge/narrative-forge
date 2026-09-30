import type { FC } from 'react';
import { tokens } from './tokens';

export interface EventCardProps {
  /** 节点标签（通常为 Node.label） */
  label: string;
  /** 节点描述（Node.metadata.description），可选 */
  description?: string;
  /** 是否关键节点：金色边框 + 光晕 + 金色标签 */
  featured: boolean;
  /** 是否为当前活动节点：浅色边框强调 */
  active: boolean;
  /**
   * 缩放系数（默认 1）。由宿主根据节点间距计算，保证相邻卡片不重叠：
   * Phase 1 在 1920×8 节点下间距 ≈251px < 卡宽 320px，需缩小到 ≈0.78。
   */
  scale?: number;
}

/**
 * 单个事件卡：固定尺寸卡片，由父组件（TimelineComposition）绝对定位于
 * 视口坐标。featured 节点获得金色边框与光晕，active 节点获得浅色边框。
 * 不读取任何布局坐标，保持与布局层解耦（ADR-004）。
 */
export const EventCard: FC<EventCardProps> = ({
  label,
  description,
  featured,
  active,
  scale = 1,
}) => {
  const borderColor = featured
    ? tokens.color.accent
    : active
      ? tokens.color.foreground
      : tokens.color.timelineLine;

  return (
    <div
      style={{
        width: tokens.spacing.eventCardWidth,
        height: tokens.spacing.eventCardHeight,
        boxSizing: 'border-box',
        border: `2px solid ${borderColor}`,
        borderRadius: 12,
        backgroundColor: 'rgba(20, 26, 42, 0.92)',
        color: tokens.color.foreground,
        fontFamily: tokens.font.family,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        overflow: 'hidden',
        transform: `scale(${scale})`,
        boxShadow: featured ? `0 0 24px ${tokens.color.accent}55` : 'none',
      }}
    >
      <div
        style={{
          fontSize: tokens.font.eventLabelSize,
          fontWeight: 700,
          color: featured ? tokens.color.accent : tokens.color.foreground,
        }}
      >
        {label}
      </div>
      {description !== undefined ? (
        <div
          style={{
            fontSize: tokens.font.eventDescSize,
            marginTop: 10,
            opacity: 0.8,
            lineHeight: 1.4,
          }}
        >
          {description}
        </div>
      ) : null}
    </div>
  );
};
