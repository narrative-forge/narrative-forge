import type { FC } from 'react';
import { interpolateColor } from './color.js';
import { formatFullDate } from './time.js';
import { tokens } from './tokens.js';

export interface EventCardProps {
  /** 节点标签（通常为 Node.label） */
  label: string;
  /**
   * 节点时间（Node.time，ISO 8601），渲染为 `1936.10.09`。
   *
   * TASK-011 §3.7：此前这个必填字段一次都没进过画面，观众看不到这条线
   * 是 1935-10 → 1936-10，"时间线"退化成"一排并行卡片"。
   */
  time?: string;
  /** 是否关键节点：金色边框 + 光晕 + 金色标签 */
  featured: boolean;
  /**
   * 活跃度 [0, 1]，由渲染层按过渡帧逐帧给出（TASK-012）。
   * 1 = 当前活动节点；0 = 完全非活动；中间值用于交叉过渡。
   */
  activeAmount?: number;
  /**
   * 缩放系数（默认 1）。由宿主根据节点间距计算，保证相邻卡片不重叠。
   *
   * **所有卡片共用同一个 `scale`** —— 活动卡不再单独放大到 1。
   * TASK-011 §3.2 实测：8 节点 / 1920 宽时间距 251px，活动卡保持 320px 原
   * 尺寸会**向左、右各压住邻居 34.29px**，是必然发生的遮挡。焦点改由边框
   * 亮度、光晕与背景提亮表达（本文件），尺寸不再是层级手段。
   */
  scale?: number;
}

/**
 * 单个事件卡：固定尺寸卡片，由父组件（TimelineComposition）绝对定位于
 * 视口坐标。featured 节点获得金色边框与光晕，active 节点获得浅色边框。
 * 不读取任何布局坐标，保持与布局层解耦（ADR-004）。
 *
 * 卡片内容只有**年份 + 标签**两行；描述已移至底部字幕条（`SubtitleBar`），
 * 因为卡片整体要乘 `fitScale`（≈0.85），把正文塞进被缩放的卡片里怎么调
 * 都够不到平台可读下限（TASK-011 §3.4）。
 */
export const EventCard: FC<EventCardProps> = ({
  label,
  time,
  featured,
  activeAmount = 0,
  scale = 1,
}) => {
  const borderColor = featured
    ? tokens.color.accent
    : interpolateColor(tokens.color.timelineLine, tokens.color.foreground, activeAmount);
  const year = formatFullDate(time);

  return (
    <div
      style={{
        width: tokens.spacing.eventCardWidth,
        height: tokens.spacing.eventCardHeight,
        boxSizing: 'border-box',
        border: `2px solid ${borderColor}`,
        borderRadius: 12,
        // 活动卡背景提亮：替代原先"放大"的焦点表达（见 scale 的说明）。
        backgroundColor: featured
          ? 'rgba(38, 30, 14, 0.94)'
          : `rgba(${Math.round(20 + 18 * activeAmount)}, ${Math.round(
              26 + 20 * activeAmount
            )}, ${Math.round(42 + 24 * activeAmount)}, 0.94)`,
        color: tokens.color.foreground,
        fontFamily: tokens.font.family,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 6,
        overflow: 'hidden',
        transform: `scale(${scale})`,
        boxShadow: featured
          ? `0 0 24px ${tokens.color.accent}66`
          : activeAmount > 0
            ? `0 0 20px rgba(212, 162, 89, ${(activeAmount * 0.34).toFixed(3)})`
            : 'none',
      }}
    >
      {year !== '' ? (
        <div
          style={{
            fontSize: tokens.font.eventYearSize,
            fontWeight: 500,
            color: featured
              ? tokens.color.accent
              : interpolateColor(tokens.color.muted, tokens.color.foreground, activeAmount),
            letterSpacing: 1,
          }}
        >
          {year}
        </div>
      ) : null}
      <div
        style={{
          fontSize: tokens.font.eventLabelSize,
          fontWeight: 700,
          lineHeight: 1.25,
          color: featured ? tokens.color.accent : tokens.color.foreground,
          // 标签过长时显式省略号，而不是被 overflow:hidden 无声吞掉。
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </div>
    </div>
  );
};
