import { describe, expect, it } from 'vitest';

import { frameToProgress } from './frame';

describe('frameToProgress — invariants P18–P25', () => {
  it('P18: frameToProgress(0, N) === 0 for N >= 2', () => {
    // N = 1 is excluded here: P24 special-cases a single frame to progress 1
    // ("single frame = complete"), which intentionally overrides P18 at N = 1.
    for (const N of [2, 30, 60, 100]) {
      expect(frameToProgress(0, N)).toBe(0);
    }
  });

  it('P19: frameToProgress(N - 1, N) === 1', () => {
    for (const N of [1, 2, 30, 60, 100]) {
      expect(frameToProgress(N - 1, N)).toBe(1);
    }
  });

  it('P20: frameToProgress(-1, N) === 0 for N >= 2', () => {
    // N = 1 excluded: the single-frame special case (P24) returns 1, which
    // intentionally overrides P20 at N = 1.
    for (const N of [2, 30]) {
      expect(frameToProgress(-1, N)).toBe(0);
    }
  });

  it('P21: frameToProgress(N, N) === 1 (frame at the boundary is clamped to last)', () => {
    for (const N of [1, 2, 30]) {
      expect(frameToProgress(N, N)).toBe(1);
    }
  });

  it('P22: frameToProgress(N + 100, N) === 1 (out-of-range clamps to 1)', () => {
    for (const N of [1, 2, 30]) {
      expect(frameToProgress(N + 100, N)).toBe(1);
    }
  });

  it('P23: monotonic non-decreasing (f1 <= f2 ⇒ progress(f1) <= progress(f2))', () => {
    const N = 30;
    let prev = -Infinity;
    for (let f = -5; f <= N + 5; f++) {
      const p = frameToProgress(f, N);
      expect(p).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = p;
    }
  });

  it('P24: durationInFrames === 1 ⇒ every frame maps to progress 1', () => {
    expect(frameToProgress(0, 1)).toBe(1);
    expect(frameToProgress(5, 1)).toBe(1);
  });

  it('P25: durationInFrames < 1 (or non-finite) throws', () => {
    expect(() => frameToProgress(0, 0)).toThrow();
    expect(() => frameToProgress(0, -3)).toThrow();
    expect(() => frameToProgress(0, Number.NaN)).toThrow();
    expect(() => frameToProgress(0, Number.POSITIVE_INFINITY)).toThrow();
  });
});
