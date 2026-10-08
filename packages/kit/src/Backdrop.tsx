import type { FC } from 'react';
import { Img } from 'remotion';
import { tokens } from './tokens.js';

export interface BackdropProps {
  /** 背景图 src（可选的资产引用）。缺省时降级为程序化渐变背景。 */
  src?: string;
  /** 当前帧（Remotion 帧号） */
  frame: number;
  /** 该背景出现的总帧数，用于 Ken Burns 的进度归一化 */
  totalFrames: number;
  width: number;
  height: number;
}

/** Ken Burns 的推进幅度：全片缓慢放大 6%。 */
const KEN_BURNS_GROWTH = 0.06;
/** 无素材时柔光斑的漂移半径（像素）。 */
const GLOW_DRIFT_X = 70;
const GLOW_DRIFT_Y = 46;

/**
 * 全屏背景层。
 *
 * TASK-011 §3.1 实测：原画面 **83.3% 是空载** —— 有效像素只有卡片那一条
 * 横带（180/1080），其余全靠 `AbsoluteFill` 的纯色 `#0a0e1a`。参照项目
 * `story-timeline-view` 的解法是"沉浸式背景图 + 交叉淡入 + Ken Burns 缓推"，
 * 本组件即对应那一层。
 *
 * 关键约束：demo 数据的 `assets` 是空的（`stories/demo/huining-1936.json`
 * 里 `assets: []`、每个节点 `media: []`）。所以**无素材时必须也成立** ——
 * 这里降级为程序化渐变 + 两团缓慢漂移的柔光，保证纯文字内容也不是"黑屏"。
 * 有了素材后传 `src` 即自动切到 Ken Burns，无需改渲染层。
 *
 * 前景可读性由顶部的暗化层保证（背景永远不抢文字）。
 */
export const Backdrop: FC<BackdropProps> = ({ src, frame, totalFrames, width, height }) => {
  const p = totalFrames > 0 ? Math.min(Math.max(frame / totalFrames, 0), 1) : 0;
  const scale = 1 + KEN_BURNS_GROWTH * p;
  const driftX = Math.sin(p * Math.PI * 2) * GLOW_DRIFT_X;
  const driftY = Math.cos(p * Math.PI * 2) * GLOW_DRIFT_Y;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width,
        height,
        overflow: 'hidden',
        backgroundColor: tokens.color.background,
      }}
    >
      {src !== undefined && src !== '' ? (
        <Img
          src={src}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${scale})`,
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(160deg, ${tokens.color.backgroundTop} 0%, ${tokens.color.background} 70%)`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: width * 0.22 + driftX,
              top: height * 0.28 + driftY,
              width: width * 0.62,
              height: width * 0.62,
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(90, 120, 190, 0.20) 0%, rgba(90, 120, 190, 0) 62%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: width * 0.52 - driftX * 0.7,
              top: height * 0.52 - driftY * 0.7,
              width: width * 0.5,
              height: width * 0.5,
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(212, 162, 89, 0.16) 0%, rgba(212, 162, 89, 0) 60%)',
            }}
          />
        </div>
      )}

      {/* 暗化层：保证前景文字在任何背景下都够对比度 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(10, 14, 26, 0.55) 0%, rgba(10, 14, 26, 0.72) 55%, rgba(10, 14, 26, 0.88) 100%)',
        }}
      />
    </div>
  );
};
