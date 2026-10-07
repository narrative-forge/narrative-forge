import { locate } from '@forge/core';
import { EventCard, Timeline, TitleCard, tokens } from '@forge/kit';
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
 *
 * TASK-012（平滑度）：切换时刻的一切"强调"都改为**连续量**而非布尔量。
 * 原先 `active` 在单帧内同时翻转四件事 —— 卡片透明度（1.0↔0.4）、边框色
 * （`foreground`↔`timelineLine`）、圆点尺寸（18↔12px）、圆点光晕（有↔无）——
 * 实测这是全片最刺眼的帧间突变。现在统一由 `activeAmount ∈ [0,1]` 驱动，
 * 与相机共用 `easeInOutCubic` 曲线。
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

  // TASK-012：把"活跃度"从布尔提升为 [0, 1] 连续量，供 kit 做边框色与圆点的
  // 交叉过渡。它与 `smoothCamera` 里的 opacity 共用同一条 `easeInOutCubic`
  // 曲线 —— 这是"亮起来"与"滑到位"读起来像一个动作、而不是两段各走各的
  // 动画的原因。`framesSinceSwitch` 为 `Infinity`（intro/outro 或稳态）时
  // `transitionProgress` 收敛到 1，回到与 TASK-007 相同的表现。
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
            activeAmount: activeAmountOf(item.id),
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
          // 活动卡保持原尺寸（焦点强调），非活动卡缩放至间距宽度。
          // TASK-012：`scale` 也必须是连续量。它原先是布尔驱动
          // （`isActive ? 1 : fitScale`，即 320px ↔ 251.43px），会在单帧内跳掉
          // **21.4% 的卡片面积** —— 这是 opacity / 边框色 / 圆点都改成连续量之后
          // *残留的最后一处硬跳*：实测该帧的帧差仍有 1.49，而同期纯相机移动
          // 只有 0.33。改用 `activeAmount` 后它与其余全部强调共享同一条缓动曲线。
          const scale = fitScale + (1 - fitScale) * activeAmountOf(item.id);
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
                activeAmount={activeAmountOf(item.id)}
                scale={scale}
              />
            </div>
          );
        })}
    </AbsoluteFill>
  );
};
