import { locate } from '@forge/core';
import { EventCard, Timeline, TitleCard, tokens } from '@forge/kit';
import type { TimelineLayoutResult } from '@forge/layouts';
import { computeTimelineLayout } from '@forge/layouts';
import type { FC } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { smoothCamera } from './camera.js';
import type { TimelineCompositionProps } from './prepare.js';

/** 相机过渡帧数（30fps 下 0.5 秒），见 TASK-007 任务包。 */
const TRANSITION_FRAMES = 15;

/**
 * 时间线主组件。消费 TASK-006 的纯数据布局输出，在渲染层用 `smoothCamera`
 * 补偿"无插值"相机带来的跳切（ADR-004：布局层给确定性目标位置，渲染层平滑）。
 *
 * 性能约束：每帧至多调用 `computeTimelineLayout` 两次（当前 + 上一布局），
 * 不在渲染中调用 `buildSchedule`（已在 `prepareTimelineProps` 预计算并随
 * props 传入），不使用任何 Node IO。相机切换点通过 `locate` + `segments`
 * 的段起点推导，不缓存可变状态。
 *
 * 视觉编排：intro/outro 阶段整屏标题卡（事件卡不叠在标题上）；内容阶段
 * 时间轴 + 事件卡。事件卡按节点间距自适应缩放（fitScale），保证相邻卡片
 * 不重叠 —— 1920 宽 × 8 节点时间距 ≈251px，卡宽 320px，缩放 ≈0.78。
 */
export const TimelineComposition: FC<TimelineCompositionProps> = (props) => {
  const { story, schedule, width, height, fps } = props;
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

  const isIntro = tSec < schedule.introSec;
  const isOutro = tSec > schedule.totalSec - schedule.outroSec;

  if (isIntro || isOutro) {
    return (
      <AbsoluteFill
        style={{ backgroundColor: tokens.color.background, fontFamily: tokens.font.family }}
      >
        <TitleCard
          title={story.meta.title}
          subtitle={isIntro ? '1934 — 1936 · 长征会师' : '—— 完 ——'}
        />
      </AbsoluteFill>
    );
  }

  // 内容阶段：事件卡缩放至贴合节点间距，避免相邻卡片重叠。
  const itemCount = layout.items.length;
  const span = layout.timeline.x1 - layout.timeline.x0;
  const spacing = itemCount > 1 ? span / (itemCount - 1) : width;
  const fitScale = Math.min(1, spacing / tokens.spacing.eventCardWidth);

  return (
    <AbsoluteFill
      style={{ backgroundColor: tokens.color.background, fontFamily: tokens.font.family }}
    >
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
            active: item.id === activeId,
            featured: node?.featured ?? false,
          };
        })}
      />

      {layout.items
        .filter((item) => item.visible)
        .map((item) => {
          const node = nodes.find((candidate) => candidate.id === item.id);
          const label = node?.label ?? item.id;
          const rawDescription = node?.metadata?.description;
          const description = typeof rawDescription === 'string' ? rawDescription : undefined;
          const featured = node?.featured ?? false;
          const isActive = item.id === activeId;
          // 活动卡保持原尺寸（焦点强调），非活动卡缩放至间距宽度。
          const scale = isActive ? 1 : fitScale;
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
                label={label}
                description={description}
                featured={featured}
                active={isActive}
                scale={scale}
              />
            </div>
          );
        })}
    </AbsoluteFill>
  );
};
