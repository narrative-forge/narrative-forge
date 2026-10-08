import { locate } from '@forge/core';
import {
  Backdrop,
  EventCard,
  StoryHeader,
  SubtitleBar,
  Timeline,
  TitleCard,
  formatTimeRange,
  formatYearMonth,
  tokens,
} from '@forge/kit';
import type { TimelineLayoutResult } from '@forge/layouts';
import { computeTimelineLayout } from '@forge/layouts';
import type { FC } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { easeInOutCubic, smoothCamera } from './camera.js';
import type { TimelineCompositionProps } from './prepare.js';

/**
 * 相机过渡帧数（30fps 下 0.8 秒）。
 *
 * TASK-012：原为 15 帧（0.5 秒）。一个节点的间距是 251.43px，15 帧移完等于
 * 平坦的 16.8 px/帧（≈503 px/s）—— 这是"猛冲猛停"的直接来源。24 帧把峰值
 * 速度降到约 10.5 px/帧，再叠加 `easeInOutCubic`，起步与刹车都不再有硬边。
 */
const TRANSITION_FRAMES = 24;

/**
 * 卡片相对节点间距的"呼吸系数"。
 *
 * 卡片宽度若恰好等于间距，8 张卡会连成一堵没有缝隙的墙（TASK-011 §3.2）。
 * 乘 0.92 留出约 8% 的间隙。
 */
const CARD_BREATH = 0.92;

/**
 * 时间线主组件。消费 TASK-006 的纯数据布局输出，在渲染层用 `smoothCamera`
 * 补偿"无插值"相机带来的跳切（ADR-004：布局层给确定性目标位置，渲染层平滑）。
 *
 * 性能约束：每帧至多调用 `computeTimelineLayout` 两次（当前 + 上一布局），
 * 不在渲染中调用 `buildSchedule`（已在 `prepareTimelineProps` 预计算并随
 * props 传入），不使用任何 Node IO。相机切换点通过 `locate` + `segments`
 * 的段起点推导，不缓存可变状态。
 *
 * 视觉编排（TASK-013 版式）：三段式版式 —— 上部标题/年份区（`StoryHeader`）、
 * 中部时间轴区（`Timeline` + `EventCard`）、下部字幕区（`SubtitleBar`），
 * 底层是 `Backdrop`。原实现只有一个 `timelineY = height * 0.6` 的硬编码
 * 比例，垂直方向没有任何版式设计，实测 **83.3% 的画面是空载**
 * （TASK-011 §3.1）。
 *
 * TASK-012（平滑度）：切换时刻的一切"强调"都改为**连续量**而非布尔量。
 * 现在统一由 `activeAmount ∈ [0,1]` 驱动，与相机共用 `easeInOutCubic` 曲线。
 */
export const TimelineComposition: FC<TimelineCompositionProps> = (props) => {
  const { story, schedule, width, height, fps, durationInFrames } = props;
  const frame = useCurrentFrame();
  const tSec = frame / fps;

  const nodes = story.nodes;
  const currentLayout: TimelineLayoutResult = computeTimelineLayout(nodes, schedule, tSec, {
    width,
    height,
  });

  // 相机切换检测：活动节点所在段的起点即"上次切换时刻"。
  let framesSinceSwitch = Number.POSITIVE_INFINITY;
  let previousLayout: TimelineLayoutResult = currentLayout;

  const activeId = currentLayout.activeNodeId;
  if (activeId !== null) {
    const locateNow = locate(schedule, tSec);
    const segment = schedule.segments[locateNow.nodeIndex];
    if (segment !== undefined) {
      framesSinceSwitch = (tSec - segment.startSec) * fps;
      const prevSegment =
        locateNow.nodeIndex > 0 ? schedule.segments[locateNow.nodeIndex - 1] : undefined;
      const prevT =
        prevSegment !== undefined ? prevSegment.endSec - 1e-6 : schedule.introSec - 1e-6;
      previousLayout = computeTimelineLayout(nodes, schedule, prevT, { width, height });
    }
  }

  const layout = smoothCamera(currentLayout, previousLayout, framesSinceSwitch, TRANSITION_FRAMES);

  const transitionProgress = easeInOutCubic(Math.min(framesSinceSwitch / TRANSITION_FRAMES, 1));
  const previousActiveId = previousLayout.activeNodeId;
  const activeAmountOf = (id: string): number => {
    const wasActive = id === previousActiveId;
    const isActive = id === currentLayout.activeNodeId;
    if (isActive && wasActive) return 1;
    if (isActive) return transitionProgress;
    if (wasActive) return 1 - transitionProgress;
    return 0;
  };

  const isIntro = tSec < schedule.introSec;
  const isOutro = tSec > schedule.totalSec - schedule.outroSec;

  // 年份区间由数据推导，取代原先硬编码的 '1934 — 1936'（TASK-011 §3.12：
  // 数据首节点是 1935-10-19，画面上的 1934 在故事里不存在）。
  const timeRange = formatTimeRange(nodes.map((node) => node.time));

  // 背景图：meta.backdrop 引用 assets 里的 image 资产。demo 的 assets 为空，
  // 此时 Backdrop 降级为程序化渐变背景（见 kit/Backdrop.tsx）。
  const backdropId = story.meta.backdrop;
  const backdropAsset =
    backdropId === undefined
      ? undefined
      : story.assets.find((asset) => asset.id === backdropId && asset.type === 'image');

  if (isIntro || isOutro) {
    return (
      <AbsoluteFill
        style={{ backgroundColor: tokens.color.background, fontFamily: tokens.font.family }}
      >
        <Backdrop
          src={backdropAsset?.src}
          frame={frame}
          totalFrames={durationInFrames}
          width={width}
          height={height}
        />
        <TitleCard title={story.meta.title} subtitle={isIntro ? timeRange : '—— 完 ——'} />
      </AbsoluteFill>
    );
  }

  // 内容阶段：所有卡片共用同一缩放系数（活动卡不再放大）。
  //
  // TASK-011 §3.2 实测：原实现 `scale = isActive ? 1 : fitScale`，活动卡保持
  // 320px 而间距只有 251px → **向左、右各压住邻居 34.29px**，标题被切掉。
  // 焦点改由边框亮度、金色光晕与卡片背景提亮表达（`EventCard`），尺寸不再
  // 是层级手段 —— 这也顺带消除了 §3.3 的"纵向错落 19.3px"（所有卡片同尺寸，
  // 缩放不再改变各自的中心偏移）。
  const itemCount = layout.items.length;
  const span = layout.timeline.x1 - layout.timeline.x0;
  const spacing = itemCount > 1 ? span / (itemCount - 1) : width;
  const fitScale = Math.min(1, spacing / tokens.spacing.eventCardWidth) * CARD_BREATH;

  // 字幕条：切换时"淡出 → 换字 → 淡入"。
  //
  // 直接按布尔切换会在单帧内换掉整段文字，那是 TASK-012 已清掉的硬跳类型。
  // 这里 opacity 走 |2p − 1|：p = 0 / 1 时全显，p = 0.5 时全隐；过半后
  // 内容切到新节点，于是换字发生在"看不见"的那一帧。
  const switching = Number.isFinite(framesSinceSwitch) && framesSinceSwitch < TRANSITION_FRAMES;
  const subtitleFade = switching ? Math.abs(2 * transitionProgress - 1) : 1;
  const subtitleId =
    switching && transitionProgress < 0.5 && previousActiveId !== null
      ? previousActiveId
      : (activeId ?? previousActiveId);
  const subtitleNode = nodes.find((node) => node.id === subtitleId);
  const subtitleText =
    typeof subtitleNode?.metadata?.description === 'string'
      ? subtitleNode.metadata.description
      : undefined;

  return (
    <AbsoluteFill
      style={{ backgroundColor: tokens.color.background, fontFamily: tokens.font.family }}
    >
      <Backdrop
        src={backdropAsset?.src}
        frame={frame}
        totalFrames={durationInFrames}
        width={width}
        height={height}
      />

      <StoryHeader title={story.meta.title} range={timeRange} />

      <Timeline
        x0={layout.timeline.x0}
        x1={layout.timeline.x1}
        y={layout.timeline.y}
        nodes={layout.items.map((item) => {
          const node = nodes.find((candidate) => candidate.id === item.id);
          return {
            id: item.id,
            x: item.x,
            y: item.y,
            activeAmount: activeAmountOf(item.id),
            featured: node?.featured ?? false,
            year: formatYearMonth(node?.time),
          };
        })}
      />

      {layout.items
        .filter((item) => item.visible)
        .map((item) => {
          const node = nodes.find((candidate) => candidate.id === item.id);
          return (
            <div
              key={item.id}
              style={{
                position: 'absolute',
                left: item.x,
                top: item.y,
                transform: 'translate(-50%, -120%)',
                opacity: item.opacity,
              }}
            >
              <EventCard
                label={node?.label ?? item.id}
                time={node?.time}
                featured={node?.featured ?? false}
                activeAmount={activeAmountOf(item.id)}
                scale={fitScale}
              />
            </div>
          );
        })}

      <SubtitleBar
        title={subtitleNode?.label ?? ''}
        text={subtitleText}
        opacity={subtitleFade}
        width={width}
        top={height * 0.72}
      />
    </AbsoluteFill>
  );
};
