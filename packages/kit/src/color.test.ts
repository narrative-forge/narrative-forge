import { describe, expect, it } from 'vitest';
import { interpolateColor } from './color.js';

describe('interpolateColor — TASK-012', () => {
  it('t = 0 / t = 1 return the endpoints verbatim', () => {
    expect(interpolateColor('#2a3144', '#e8eaf0', 0)).toBe('#2a3144');
    expect(interpolateColor('#2a3144', '#e8eaf0', 1)).toBe('#e8eaf0');
  });

  it('clamps out-of-range t instead of extrapolating', () => {
    expect(interpolateColor('#000000', '#ffffff', -5)).toBe('#000000');
    expect(interpolateColor('#000000', '#ffffff', 5)).toBe('#ffffff');
  });

  it('t = 0.5 lands on the per-channel midpoint', () => {
    expect(interpolateColor('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('moves monotonically along each channel', () => {
    const channels = (hex: string): number[] => [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16),
    ];
    const from = '#2a3144';
    const to = '#e8eaf0';
    let previous = channels(from);
    for (let step = 1; step <= 20; step += 1) {
      const current = channels(interpolateColor(from, to, step / 20));
      current.forEach((channel, index) => {
        expect(channel).toBeGreaterThanOrEqual(previous[index] ?? 0);
      });
      previous = current;
    }
  });

  it('always emits a well-formed #rrggbb string', () => {
    for (let step = 0; step <= 10; step += 1) {
      expect(interpolateColor('#2a3144', '#e8eaf0', step / 10)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
