import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { StorySchema } from '@forge/schema';
import type { Node } from '@forge/schema';

import { buildSchedule, locate } from './schedule.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// Decision 4 (TASK-004): the demo story is the single source of truth. We read
// the canonical file via a relative path at runtime (not an ESM import) so the
// schema package's rootDir constraint is respected and tests + story stay in
// sync. Same path strategy as @forge/schema's own test.
function loadHuiningNodes(): Node[] {
  const raw = JSON.parse(
    readFileSync(join(HERE, '..', '..', '..', 'stories', 'demo', 'huining-1936.json'), 'utf-8')
  );
  const story = StorySchema.parse(raw);
  return story.nodes;
}

describe('buildSchedule — invariants P1–P8', () => {
  const nodes = loadHuiningNodes();

  it('P1: totalSec > 0', () => {
    expect(buildSchedule(nodes).totalSec).toBeGreaterThan(0);
  });

  it('P2: segments.length === nodes.length', () => {
    expect(buildSchedule(nodes).segments).toHaveLength(nodes.length);
  });

  it('P3: segments[i].nodeId === nodes[i].id, in the same order', () => {
    const { segments } = buildSchedule(nodes);
    nodes.forEach((node, i) => {
      expect(segments[i]?.nodeId).toBe(node.id);
    });
  });

  it('P4: segments[i].endSec === startSec + durationSec', () => {
    for (const seg of buildSchedule(nodes).segments) {
      expect(seg.endSec).toBeCloseTo(seg.startSec + seg.durationSec, 9);
    }
  });

  it('P5: segments[i+1].startSec === segments[i].endSec (no gaps)', () => {
    const { segments } = buildSchedule(nodes);
    for (let i = 0; i < segments.length - 1; i++) {
      expect(segments[i + 1]?.startSec).toBeCloseTo(segments[i]!.endSec, 9);
    }
  });

  it('P6: segments[0].startSec === introSec', () => {
    const s = buildSchedule(nodes);
    expect(s.segments[0]?.startSec).toBeCloseTo(s.introSec, 9);
  });

  it('P7: last segment endSec + outroSec === totalSec', () => {
    const s = buildSchedule(nodes);
    const last = s.segments[s.segments.length - 1]!;
    expect(last.endSec + s.outroSec).toBeCloseTo(s.totalSec, 9);
  });

  it('P8: per-node duration override not supported by schema — always computed (annotated/skipped)', () => {
    // @forge/schema's Node has no `duration` field, so buildSchedule always
    // computes. We assert the computed value equals base + perChar*(label+desc)
    // and that an explicit override is impossible to express — P8 is skipped per
    // the TASK-005 contract, not silently diverging from the source formula.
    const node = nodes[0]!;
    const s = buildSchedule([node]);
    const expected =
      10 +
      0.05 *
        (node.label.length +
          (typeof node.metadata?.description === 'string' ? node.metadata.description.length : 0));
    expect(s.segments[0]!.durationSec).toBeCloseTo(expected, 9);
  });
});

describe('locate — invariants P9–P17', () => {
  const nodes = loadHuiningNodes();
  const schedule = buildSchedule(nodes);

  it('P9: locate(0).travel === 0', () => {
    expect(locate(schedule, 0).travel).toBe(0);
  });

  it('P10: locate(totalSec).travel === 1', () => {
    expect(locate(schedule, schedule.totalSec).travel).toBe(1);
  });

  it('P11: monotonic travel (t1 <= t2 ⇒ travel non-decreasing)', () => {
    let prev = -Infinity;
    const step = schedule.totalSec / 200;
    for (let t = 0; t <= schedule.totalSec; t += step) {
      const travel = locate(schedule, t).travel;
      expect(travel).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = travel;
    }
  });

  it('P12: travel ∈ [0, 1] across the full range', () => {
    const step = schedule.totalSec / 100;
    for (let t = -5; t <= schedule.totalSec + 5; t += step) {
      const travel = locate(schedule, t).travel;
      expect(travel).toBeGreaterThanOrEqual(0);
      expect(travel).toBeLessThanOrEqual(1);
    }
  });

  it('P13: intra ∈ [0, 1]', () => {
    const step = schedule.totalSec / 100;
    for (let t = 0; t <= schedule.totalSec; t += step) {
      const intra = locate(schedule, t).intra;
      expect(intra).toBeGreaterThanOrEqual(0);
      expect(intra).toBeLessThanOrEqual(1);
    }
  });

  it('P14: nodeIndex ∈ [0, segments.length - 1]', () => {
    const step = schedule.totalSec / 100;
    for (let t = -5; t <= schedule.totalSec + 5; t += step) {
      const idx = locate(schedule, t).nodeIndex;
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(schedule.segments.length - 1);
    }
  });

  it('P15: t < 0 behaves like t = 0', () => {
    expect(locate(schedule, -3)).toEqual(locate(schedule, 0));
  });

  it('P16: t > totalSec behaves like t = totalSec', () => {
    expect(locate(schedule, schedule.totalSec + 100)).toEqual(locate(schedule, schedule.totalSec));
  });

  it('P17: buildSchedule([]) returns empty segments, totalSec = intro + outro (matches source)', () => {
    const empty = buildSchedule([]);
    expect(empty.segments).toHaveLength(0);
    expect(empty.totalSec).toBeCloseTo(empty.introSec + empty.outroSec, 9);
  });
});

describe('golden schedule — huining-1936 (locks algorithm behaviour)', () => {
  const nodes = loadHuiningNodes();
  const live = buildSchedule(nodes);
  const golden = JSON.parse(
    readFileSync(join(HERE, '..', '..', '..', 'docs', 'reports', 'golden-schedule.json'), 'utf-8')
  );

  it('live buildSchedule output deep-equals golden-schedule.json', () => {
    expect(live).toEqual(golden);
  });

  it('golden covers all 8 nodes with a positive total', () => {
    expect(golden.segments).toHaveLength(8);
    expect(golden.totalSec).toBeGreaterThan(0);
    expect(golden.introSec).toBeCloseTo(0.8, 9);
    expect(golden.outroSec).toBeCloseTo(1.0, 9);
  });
});
