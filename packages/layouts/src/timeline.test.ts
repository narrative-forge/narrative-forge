import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildSchedule } from '@forge/core';
import { StorySchema } from '@forge/schema';
import type { Node } from '@forge/schema';

import { computeTimelineLayout } from './timeline';
import type { TimelineLayoutOptions, TimelineLayoutResult } from './types';

const HERE = dirname(fileURLToPath(import.meta.url));

// 会宁会师 8 节点为唯一输入源（Decision 4, TASK-004）。通过相对路径运行时读取，
// 与 @forge/schema / @forge/core 的测试保持一致。
function loadHuiningNodes(): Node[] {
  const raw = JSON.parse(
    readFileSync(join(HERE, '..', '..', '..', 'stories', 'demo', 'huining-1936.json'), 'utf-8')
  );
  return StorySchema.parse(raw).nodes;
}

const nodes = loadHuiningNodes();
const schedule = buildSchedule(nodes);
const opts: TimelineLayoutOptions = { width: 1920, height: 1080 };

// 与黄金值生成器完全相同的规范化：浮点保留 6 位小数 + items 按 id 稳定排序。
// 黄金文件即以此形式落盘，故 live 规范化后可直接 toEqual。
function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
function normalize(r: TimelineLayoutResult): unknown {
  return {
    items: r.items
      .map((it) => ({
        id: it.id,
        x: round(it.x),
        y: round(it.y),
        visible: it.visible,
        opacity: round(it.opacity),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    timeline: {
      x0: round(r.timeline.x0),
      x1: round(r.timeline.x1),
      y: round(r.timeline.y),
    },
    activeNodeId: r.activeNodeId,
  };
}

const golden = JSON.parse(
  readFileSync(join(HERE, '..', '..', '..', 'docs', 'reports', 'golden-layout.json'), 'utf-8')
) as unknown[];

describe('computeTimelineLayout — invariants L1–L16', () => {
  const result = computeTimelineLayout(nodes, schedule, schedule.introSec + 1, opts);

  it('L1: items.length === nodes.length', () => {
    expect(result.items).toHaveLength(nodes.length);
  });

  it('L2: items[i].id === nodes[i].id for every i', () => {
    for (const [i, node] of nodes.entries()) {
      expect(result.items[i]?.id).toBe(node.id);
    }
  });

  it('L3: every item.x is finite', () => {
    for (const it of result.items) {
      expect(Number.isFinite(it.x)).toBe(true);
    }
  });

  it('L4: every item.y is finite', () => {
    for (const it of result.items) {
      expect(Number.isFinite(it.y)).toBe(true);
    }
  });

  it('L5: every item.opacity ∈ [0, 1]', () => {
    for (const it of result.items) {
      expect(it.opacity).toBeGreaterThanOrEqual(0);
      expect(it.opacity).toBeLessThanOrEqual(1);
    }
  });

  it('L6: activeNodeId is null or one of the node ids', () => {
    const ids = new Set(nodes.map((n) => n.id));
    expect(result.activeNodeId === null || ids.has(result.activeNodeId)).toBe(true);
  });

  it('L7: JSON.stringify(result) does not throw', () => {
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('L8: JSON.stringify(result) contains no function / arrow syntax', () => {
    const s = JSON.stringify(result);
    expect(s).not.toContain('function');
    expect(s).not.toContain('=>');
  });

  it('L9: two identical calls produce identical JSON', () => {
    const a = computeTimelineLayout(nodes, schedule, schedule.introSec + 1, opts);
    const b = computeTimelineLayout(nodes, schedule, schedule.introSec + 1, opts);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('L10: timeline.x0 < timeline.x1 (N ≥ 2)', () => {
    expect(result.timeline.x0).toBeLessThan(result.timeline.x1);
  });

  it('L11: timeline.y ∈ [0, height]', () => {
    expect(result.timeline.y).toBeGreaterThanOrEqual(0);
    expect(result.timeline.y).toBeLessThanOrEqual(opts.height);
  });

  it('L12: in the content phase the active node x ≈ width/2', () => {
    const content = computeTimelineLayout(nodes, schedule, schedule.introSec + 1, opts);
    expect(content.activeNodeId).not.toBeNull();
    const active = content.items.find((it) => it.id === content.activeNodeId);
    expect(active).toBeDefined();
    expect(active?.x).toBeCloseTo(opts.width / 2, 6);
  });

  it('L13: tSec < 0 behaves like tSec = 0', () => {
    expect(computeTimelineLayout(nodes, schedule, -3, opts)).toEqual(
      computeTimelineLayout(nodes, schedule, 0, opts)
    );
  });

  it('L14: tSec > totalSec behaves like tSec = totalSec', () => {
    expect(computeTimelineLayout(nodes, schedule, schedule.totalSec + 100, opts)).toEqual(
      computeTimelineLayout(nodes, schedule, schedule.totalSec, opts)
    );
  });

  it('L15: tSec <= introSec ⇒ activeNodeId === null', () => {
    expect(computeTimelineLayout(nodes, schedule, schedule.introSec, opts).activeNodeId).toBeNull();
    expect(computeTimelineLayout(nodes, schedule, 0, opts).activeNodeId).toBeNull();
  });

  it('L16: tSec >= totalSec - outroSec ⇒ activeNodeId === null', () => {
    expect(
      computeTimelineLayout(nodes, schedule, schedule.totalSec - schedule.outroSec, opts)
        .activeNodeId
    ).toBeNull();
  });
});

describe('golden layout — huining-1936 (locks layout behaviour)', () => {
  const cases = [
    { label: 't0', tSec: 0 },
    { label: 'intro+1', tSec: schedule.introSec + 1 },
    { label: 'mid', tSec: schedule.totalSec / 2 },
    { label: 'outro-1', tSec: schedule.totalSec - schedule.outroSec - 1 },
    { label: 'total', tSec: schedule.totalSec },
  ];

  cases.forEach((c, i) => {
    it(`live layout at ${c.label} (tSec=${c.tSec}) deep-equals golden-layout.json[${i}]`, () => {
      const live = computeTimelineLayout(nodes, schedule, c.tSec, opts);
      expect(normalize(live)).toEqual(golden[i]);
    });
  });

  it('golden covers 5 cases and all 8 nodes', () => {
    expect(golden).toHaveLength(5);
    for (const entry of golden) {
      const e = entry as { items: unknown[] };
      expect(e.items).toHaveLength(8);
    }
  });
});

describe('computeTimelineLayout — input validation', () => {
  it('throws when nodes.length !== schedule.segments.length', () => {
    const bad = nodes.slice(0, nodes.length - 1);
    expect(() => computeTimelineLayout(bad, schedule, 0, opts)).toThrow();
  });

  it('throws when width <= 0', () => {
    expect(() => computeTimelineLayout(nodes, schedule, 0, { width: 0, height: 1080 })).toThrow();
  });

  it('throws when height <= 0', () => {
    expect(() => computeTimelineLayout(nodes, schedule, 0, { width: 1920, height: 0 })).toThrow();
  });

  it('throws when paddingX*2 >= width', () => {
    expect(() =>
      computeTimelineLayout(nodes, schedule, 0, { width: 160, height: 1080, paddingX: 80 })
    ).toThrow();
  });
});
