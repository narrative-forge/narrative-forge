import type { TimelineLayoutResult } from '@forge/layouts';
import { describe, expect, it } from 'vitest';
import { smoothCamera } from './camera';

/**
 * Build a minimal {@link TimelineLayoutResult} with `n` items placed at the
 * given x positions. Only the fields exercised by `smoothCamera` are set.
 */
function makeLayout(xs: number[], activeNodeId: string | null): TimelineLayoutResult {
  return {
    items: xs.map((x, index) => ({
      id: `n${index}`,
      x,
      y: 600,
      visible: true,
      opacity: 1,
    })),
    timeline: {
      x0: xs[0] ?? 0,
      x1: xs[xs.length - 1] ?? 0,
      y: 600,
    },
    activeNodeId,
  };
}

const TRANSITION_FRAMES = 15;

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
    const late = smoothCamera(current, previous, 12, TRANSITION_FRAMES);
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
