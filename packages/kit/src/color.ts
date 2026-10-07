/**
 * @forge/kit — colour interpolation.
 *
 * Remotion renders every frame as an independent screenshot, so a CSS
 * `transition` never runs: anything that is supposed to change over time has to
 * be driven by a per-frame number. TASK-012 introduced `interpolateColor` for
 * exactly that reason — the event-card border and the timeline dot used to snap
 * between two hex values inside a single frame, which is visible as a flicker.
 */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse `#rrggbb` into its three channels.
 *
 * Written with named fields rather than a tuple so it stays valid under
 * `noUncheckedIndexedAccess` (see `tsconfig.base.json`).
 */
function parseHex(hex: string): Rgb {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function toHex(channel: number): string {
  const clamped = Math.min(Math.max(Math.round(channel), 0), 255);
  return clamped.toString(16).padStart(2, '0');
}

/**
 * Blend two `#rrggbb` colours. `t` is clamped to [0, 1]; `t = 0` returns `from`
 * verbatim and `t = 1` returns `to` verbatim, so a caller may pass an exact 0/1
 * without drifting off the token value by a rounding step.
 */
export function interpolateColor(from: string, to: string, t: number): string {
  const clamped = Math.min(Math.max(t, 0), 1);
  const a = parseHex(from);
  const b = parseHex(to);
  /** 单通道混合：`t = 0` 得 `x`，`t = 1` 得 `y`。 */
  const mix = (x: number, y: number): string => toHex(x + (y - x) * clamped);
  return `#${mix(a.r, b.r)}${mix(a.g, b.g)}${mix(a.b, b.b)}`;
}
