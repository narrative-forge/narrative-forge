import type { FC } from 'react';
import { tokens } from './tokens.js';

export interface StoryHeaderProps {
  /** 片子主标题（story.meta.title） */
  title: string;
  /**
   * 由 nodes[].time 推导的年份区间，如 `1935.10 — 1936.10`。
   *
   * 原画面上方 **23.3% 是纯空白**（TASK-011 §3.1），而观众全程看不到这条
   * 时间轴的起止年份 —— 时间信息零呈现（§3.7）。这里把年份区间常驻在左上
   * 角，配合卡片上的完整日期与轴线刻度，"时间线"才成立。
   */
  range: string;
  /** 副标题（可选，如栏目名） */
  kicker?: string;
}

/**
 * 画面左上角的常驻标题区。
 *
 * 与底部字幕条、中部时间轴共同构成**三段式版式**：上部标题/年份区、中部
 * 时间轴区、下部字幕区。原实现只有 `timelineY = height * 0.6` 一个硬编码
 * 比例，垂直方向没有任何版式设计（TASK-011 §3.1）。
 */
export const StoryHeader: FC<StoryHeaderProps> = ({ title, range, kicker }) => {
  return (
    <div
      style={{
        position: 'absolute',
        left: 80,
        top: 64,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        fontFamily: tokens.font.family,
      }}
    >
      {kicker !== undefined && kicker !== '' ? (
        <div style={{ fontSize: 26, letterSpacing: 4, color: tokens.color.muted }}>
          {kicker}
        </div>
      ) : null}
      <div
        style={{
          fontSize: 46,
          fontWeight: 700,
          color: tokens.color.foreground,
          textShadow: '0 2px 14px rgba(0, 0, 0, 0.6)',
        }}
      >
        {title}
      </div>
      {range !== '' ? (
        <div
          style={{
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: 2,
            color: tokens.color.accent,
          }}
        >
          {range}
        </div>
      ) : null}
    </div>
  );
};
