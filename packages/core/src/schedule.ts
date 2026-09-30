/**
 * @forge/core — rhythm scheduling (节奏调度).
 *
 * Ported from javaeer/story-timeline-view `src/composables/useTimeline.js`
 * (`buildSchedule` / `locate`). Behaviour is kept byte-for-byte consistent
 * with the original wherever the TASK-005 contract allows it; the few deltas
 * are called out inline below and consolidated in TASK-005-report.md.
 *
 * Verified original defaults: introSec = 0.8, outroSec = 1.0, baseSec = 10,
 * perCharSec = 0.05.
 *
 * All functions are pure: no `let`, no module-level mutable state, no side
 * effects (per the TASK-005 review criteria). Iteration/scans use array
 * methods (reduce / find / indexOf) rather than mutable loop counters.
 */

import type { Node } from '@forge/schema';

export interface ScheduleOptions {
  introSec?: number;
  outroSec?: number;
  baseSec?: number;
  perCharSec?: number;
}

export interface ScheduleSegment {
  nodeId: string;
  startSec: number;
  endSec: number;
  durationSec: number;
}

export interface Schedule {
  totalSec: number;
  introSec: number;
  outroSec: number;
  segments: ScheduleSegment[];
}

export interface LocateResult {
  travel: number;
  nodeIndex: number;
  intra: number;
}

const DEFAULTS = {
  introSec: 0.8,
  outroSec: 1.0,
  baseSec: 10,
  perCharSec: 0.05,
} as const;

type ResolvedOptions = {
  introSec: number;
  outroSec: number;
  baseSec: number;
  perCharSec: number;
};

function resolveOptions(options: ScheduleOptions = {}): ResolvedOptions {
  return {
    introSec: options.introSec ?? DEFAULTS.introSec,
    outroSec: options.outroSec ?? DEFAULTS.outroSec,
    baseSec: options.baseSec ?? DEFAULTS.baseSec,
    perCharSec: options.perCharSec ?? DEFAULTS.perCharSec,
  };
}

// Per-node dwell time. The original computed
//   baseSec + perCharSec * (title.length + desc.length)
// where `title`/`desc` are the node's label and description. In @forge/schema
// those map to `label` and `metadata.description` (TASK-004 B5), so the same
// formula applies with the field names translated.
//
// NOTE (P8): the original project allowed an explicit `duration` override on a
// node; @forge/schema's `Node` has no such field, so we always compute. P8 is
// therefore intentionally skipped — documented in TASK-005-report.md.
function nodeDurationSec(node: Node, opts: ResolvedOptions): number {
  const labelLen = node.label.length;
  const description = node.metadata?.description;
  const descLen = typeof description === 'string' ? description.length : 0;
  return opts.baseSec + opts.perCharSec * (labelLen + descLen);
}

export function buildSchedule(nodes: Node[], options: ScheduleOptions = {}): Schedule {
  const opts = resolveOptions(options);
  const { acc, segments } = nodes.reduce(
    (state, node) => {
      const durationSec = nodeDurationSec(node, opts);
      const startSec = state.acc;
      const endSec = state.acc + durationSec;
      return {
        acc: endSec,
        segments: [...state.segments, { nodeId: node.id, startSec, endSec, durationSec }],
      };
    },
    { acc: opts.introSec, segments: [] as ScheduleSegment[] }
  );
  const contentSec = acc - opts.introSec;
  const totalSec = contentSec + opts.introSec + opts.outroSec;
  return {
    totalSec,
    introSec: opts.introSec,
    outroSec: opts.outroSec,
    segments,
  };
}

export function locate(schedule: Schedule, tSec: number): LocateResult {
  const n = schedule.segments.length;

  // Empty schedule: nothing to locate. Clamp nodeIndex into [0, n-1] (P14) by
  // reporting the (non-existent) single node at index 0, mirroring the
  // boundaries below.
  if (n === 0) {
    const atEnd = tSec >= schedule.introSec;
    return { travel: atEnd ? 1 : 0, nodeIndex: 0, intra: atEnd ? 1 : 0 };
  }

  const { introSec, outroSec } = schedule;
  const contentSec = schedule.totalSec - introSec - outroSec;

  if (tSec <= introSec) {
    // Intro region: the original returned `node: -1`. We clamp to 0 so that
    // nodeIndex always satisfies the contract (P14: 0..n-1). travel/intra are
    // unchanged from the source.
    return { travel: 0, nodeIndex: 0, intra: 0 };
  }
  if (tSec >= introSec + contentSec) {
    return { travel: 1, nodeIndex: n - 1, intra: 1 };
  }

  const local = tSec - introSec;
  // First segment whose end boundary is at or past `local` — equivalent to the
  // original `while (i < n-1 && local > ends[i]-intro) i++` loop, but expressed
  // without a mutable counter.
  const target = schedule.segments.find((seg) => local <= seg.endSec - introSec);
  if (!target) {
    return { travel: 1, nodeIndex: n - 1, intra: 1 };
  }
  const segStart = target.startSec - introSec;
  const segEnd = target.endSec - introSec;
  const seg = segEnd - segStart;
  const intra = seg > 0 ? Math.min(Math.max((local - segStart) / seg, 0), 1) : 1;
  const travel = contentSec > 0 ? local / contentSec : 1;
  const nodeIndex = schedule.segments.indexOf(target);
  return { travel, nodeIndex, intra };
}
