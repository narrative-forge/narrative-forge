import type { FC } from 'react';
import { AbsoluteFill } from 'remotion';
import { tokens } from './tokens.js';

export interface TitleCardProps {
  /** 主标题，通常取自 story.meta.title */
  title: string;
  /** 可选副标题（如年代范围或“完”） */
  subtitle?: string;
}

/**
 * 片头 / 片尾标题卡：整屏居中，金色主标题 + 浅色副标题。
 * 纯展示组件，不依赖布局层，可在 intro / outro 阶段复用。
 */
export const TitleCard: FC<TitleCardProps> = ({ title, subtitle }) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: tokens.color.background,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        fontFamily: tokens.font.family,
      }}
    >
      <div
        style={{
          color: tokens.color.accent,
          fontSize: tokens.font.titleSize,
          fontWeight: 700,
          textAlign: 'center',
          letterSpacing: 4,
        }}
      >
        {title}
      </div>
      {subtitle !== undefined ? (
        <div
          style={{
            color: tokens.color.foreground,
            fontSize: tokens.font.eventDescSize,
            marginTop: 24,
            textAlign: 'center',
            opacity: 0.85,
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
