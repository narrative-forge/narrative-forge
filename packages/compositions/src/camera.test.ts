import type { TimelineLayoutResult } from '@forge/layouts';
import { describe, expect, it } from 'vitest';
import { easeInOutCubic, smoothCamera } from './camera.js';

/**
 * Build a minimal {@link TimelineLayoutResult} with `n` items placed at the
 * given x positions. Only the fields exercised by `smoothCamera` are set.
 */
function makeLayout(xs: number[], activeNodeId: string | null, opacity = 1): TimelineLayoutResult {
  return {
    items: xs.map((x, index) => ({
      id: `n${index}`,
      x,
      y: 600,
      visible: true,
      opacity,
    })),
    timeline: {
      x0: xs[0] ?? 0,
      x1: xs[xs.length - 1] ?? 0,
      y: 600,
    },
    activeNodeId,
  };
}

/** Same as {@link makeLayout} but gives every item its own opacity. */
function makeLayoutWithOpacities(
  xs: number[],
  activeNodeId: string | null,
  opacities: number[]
): TimelineLayoutResult {
  return {
    items: xs.map((x, index) => ({
      id: `n${index}`,
      x,
      y: 600,
      visible: true,
      opacity: opacities[index] ?? 1,
    })),
    timeline: {
      x0: xs[0] ?? 0,
      x1: xs[xs.length - 1] ?? 0,
      y: 600,
    },
    activeNodeId,
  };
}

const TRANSITION_FRAMES = 24;

describe('smoothCamera — C1–C6', () => {
  const previous = makeLayout([0, 100, 200], 'n0');
  const current = makeLayout([960, 1060, 1160], 'n1');

  it('C1: framesSinceSwitch = 0 → x part equals previousLayout', () => {
    const result = smoothCamera(current, previous, 0, TRANSITION_FRAMES);
    result.items.forEach((item, index) => {
      expect(item.x).toBe(previous.items[index]?.x);
    });
    expect(result.timeline.x0).toBe(previous.timeline.x0);
    expect(result.timeline.x1).toBe(previous.timeline.x1);
  });

  it('C2: framesSinceSwitch >= transitionFrames → equals currentLayout', () => {
    const result = smoothCamera(current, previous, TRANSITION_FRAMES, TRANSITION_FRAMES);
    expect(result).toBe(current);
    expect(result.items[1]?.x).toBe(current.items[1]?.x);
  });

  it('C3: item.x interpolates monotonically from previous to current', () => {
    const early = smoothCamera(current, previous, 3, TRANSITION_FRAMES);
    const late = smoothCamera(current, previous, 20, TRANSITION_FRAMES);
    early.items.forEach((item, index) => {
      const cur = current.items[index]?.x ?? 0;
      const prev = previous.items[index]?.x ?? 0;
      // When current > previous, earlier frame is closer to previous (smaller).
      if (cur > prev) {
        expect(item.x).toBeLessThan(late.items[index]?.x ?? 0);
        expect(item.x).toBeGreaterThanOrEqual(prev);
      }
    });
  });

  it('C4: items.length preserved', () => {
    const result = smoothCamera(current, previous, 5, TRANSITION_FRAMES);
    expect(result.items.length).toBe(current.items.length);
  });

  it('C5: activeNodeId equals currentLayout.activeNodeId', () => {
    const result = smoothCamera(current, previous, 5, TRANSITION_FRAMES);
    expect(result.activeNodeId).toBe(current.activeNodeId);
  });

  it('C6: result is JSON-serialisable and free of functions', () => {
    const result = smoothCamera(current, previous, 7, TRANSITION_FRAMES);
    const json = JSON.stringify(result);
    expect(() => json).not.toThrow();
    expect(json).not.toContain('function');
    expect(json).not.toContain('=>');
  });
});

describe('easeInOutCubic — TASK-012', () => {
  it('C9: pinned at both ends, symmetric at the midpoint', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
  });

  it('C10: monotonic and never overshoots [0, 1]', () => {
    let previousValue = -1;
    for (let step = 0; step <= 100; step += 1) {
      const value = easeInOutCubic(step / 100);
      expect(value).toBeGreaterThanOrEqual(previousValue);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      previousValue = value;
    }
  });
});

describe('smoothCamera — TASK-012 平滑度回归', () => {
  const previous = makeLayoutWithOpacities([0, 100, 200], 'n0', [1, 0.4, 0.4]);
  const current = makeLayoutWithOpacities([960, 1060, 1160], 'n1', [0.4, 1, 0.4]);

  it('C7: opacity 在过渡中插值，不再单帧硬跳', () => {
    const mid = smoothCamera(current, previous, TRANSITION_FRAMES / 2, TRANSITION_FRAMES);
    // 上交棒的卡：1.0 → 0.4，中点必须严格落在两者之间
    const outgoing = mid.items[0]?.opacity ?? 0;
    expect(outgoing).toBeGreaterThan(0.4);
    expect(outgoing).toBeLessThan(1);
    // 接棒的卡：0.4 → 1.0
    const incoming = mid.items[1]?.opacity ?? 0;
    expect(incoming).toBeGreaterThan(0.4);
    expect(incoming).toBeLessThan(1);
    // 两张都是非活动卡，保持不变
    expect(mid.items[2]?.opacity).toBe(0.4);
  });

  it('C7b: framesSinceSwitch = 0 时 opacity 仍等于 previousLayout', () => {
    const start = smoothCamera(current, previous, 0, TRANSITION_FRAMES);
    expect(start.items[0]?.opacity).toBe(1);
    expect(start.items[1]?.opacity).toBe(0.4);
  });

  it('C8: 起步被缓动压低 —— 1/4 处进度等于 eased(0.25)，远低于线性 0.25', () => {
    const quarterFrames = TRANSITION_FRAMES / 4;
    const result = smoothCamera(current, previous, quarterFrames, TRANSITION_FRAMES);
    const previousX = previous.items[0]?.x ?? 0;
    const currentX = current.items[0]?.x ?? 0;
    const actualProgress = ((result.items[0]?.x ?? 0) - previousX) / (currentX - previousX);
    expect(actualProgress).toBeCloseTo(easeInOutCubic(0.25), 10);
    expect(actualProgress).toBeLessThan(0.25);
  });

  it('C8b: 同一个缓动曲线也作用于 opacity，两者同步', () => {
    const quarterFrames = TRANSITION_FRAMES / 4;
    const result = smoothCamera(current, previous, quarterFrames, TRANSITION_FRAMES);
    const xProgress =
      ((result.items[1]?.x ?? 0) - (previous.items[1]?.x ?? 0)) /
      ((current.items[1]?.x ?? 0) - (previous.items[1]?.x ?? 0));
    const opacityProgress = ((result.items[1]?.opacity ?? 0) - 0.4) / (1 - 0.4);
    expect(xProgress).toBeCloseTo(opacityProgress, 10);
  });
});
