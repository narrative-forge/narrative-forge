import type { FC } from 'react';
import { tokens } from './tokens.js';

export interface SubtitleBarProps {
  /** 当前节点标签（大字号一行） */
  title: string;
  /** 当前节点描述（小字号，最多两行后省略） */
  text?: string;
  /**
   * 淡入淡出系数 [0, 1]。
   *
   * 节点切换时字幕条走"淡出 → 换字 → 淡入"，由宿主按过渡进度给出
   * `|2p − 1|`（p = 过渡进度）：p = 0 或 1 时全显，p = 0.5 时全隐。
   * 直接按布尔切换会在单帧内换掉整段文字，那是 TASK-012 已经清掉的
   * 那类硬跳，不能在这里重新引入。
   */
  opacity: number;
  width: number;
  /** 字幕条顶边 y（像素） */
  top: number;
}

/**
 * 底部字幕条。
 *
 * TASK-011 §3.1 / §3.8：原画面下方 **40% 是纯空白**，而上不了字幕的原因是
 * 描述被塞进了被 `fitScale` 缩放的卡片里 —— 20px 再乘 0.79 只剩 15.7px，
 * 手机上根本读不到（§3.4）。参照项目 `story-timeline-view` 的做法是
 * **字幕独立于时间轴**（节点级字幕 + 全局 srt），本组件对应那一层。
 *
 * 把描述移出卡片、放进未被缩放的字幕条，字号就能按平台下限重定（36px），
 * 一次性解决"正文不可读"与"下方 40% 空载"两件事。
 */
export const SubtitleBar: FC<SubtitleBarProps> = ({ title, text, opacity, width, top }) => {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top,
        width,
        boxSizing: 'border-box',
        padding: '28px 120px',
        opacity,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div
        style={{
          fontSize: 44,
          fontWeight: 700,
          color: tokens.color.accent,
          fontFamily: tokens.font.family,
          letterSpacing: 1,
          textAlign: 'center',
          textShadow: '0 2px 12px rgba(0, 0, 0, 0.6)',
        }}
      >
        {title}
      </div>
      {text !== undefined && text !== '' ? (
        <div
          style={{
            fontSize: tokens.font.eventDescSize,
            lineHeight: 1.5,
            color: tokens.color.foreground,
            fontFamily: tokens.font.family,
            textAlign: 'center',
            maxWidth: width * 0.7,
            // 两行后省略：配合 schema 层的 MAX_DESCRIPTION_CHARS 校验，
            // 超长描述在写数据时就会失败，不会等到渲染才被无声裁掉。
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            textShadow: '0 2px 12px rgba(0, 0, 0, 0.6)',
          }}
        >
          {text}
        </div>
      ) : null}
    </div>
  );
};
