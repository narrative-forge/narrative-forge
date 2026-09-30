import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Story } from '@forge/schema';
import { describe, expect, it } from 'vitest';
import { prepareTimelineProps } from './prepare';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const huining = JSON.parse(
  readFileSync(join(HERE, '..', '..', '..', 'stories', 'demo', 'huining-1936.json'), 'utf8')
) as unknown as Story;

describe('prepareTimelineProps — P1–P5', () => {
  const fps = 30;

  it('P1: throws when viewId is missing', () => {
    expect(() => prepareTimelineProps(huining, 'does-not-exist', fps)).toThrow();
  });

  it('P2: throws when view.type !== "timeline"', () => {
    const spatial = {
      meta: { title: 'x', resolution: '1920x1080', fps: 30 },
      views: [{ id: 'v', type: 'spatial' }],
      nodes: [],
      edges: [],
      assets: [],
    } as unknown as Story;
    expect(() => prepareTimelineProps(spatial, 'v', fps)).toThrow();
  });

  it('P3: schedule.totalSec consistent with effective duration (|Δ| < 1s)', () => {
    const props = prepareTimelineProps(huining, 'main-timeline', fps);
    const effectiveSec = props.durationInFrames / fps;
    expect(Math.abs(props.schedule.totalSec - effectiveSec)).toBeLessThan(1);
  });

  it('P4: durationInFrames === ceil(schedule.totalSec * fps)', () => {
    const props = prepareTimelineProps(huining, 'main-timeline', fps);
    expect(props.durationInFrames).toBe(Math.ceil(props.schedule.totalSec * fps));
  });

  it('P5: idempotent — identical input yields deep-equal output', () => {
    const first = prepareTimelineProps(huining, 'main-timeline', fps);
    const second = prepareTimelineProps(huining, 'main-timeline', fps);
    expect(first).toEqual(second);
  });
});
