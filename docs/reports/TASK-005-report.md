# TASK-005 执行报告：移植节奏调度算法到 `@forge/core`

- 优先级：P0
- 依赖：TASK-004（`@forge/schema` v0.1.0 已定稿，远端提交 `2c63ca7`，随 `master` tip `381558c` 一并存在）
- 验收方式：自动 + 人工
- 提交：`feat(core): port schedule algorithm + frame mapping (TASK-005)`

> 说明：TASK-002-fix 与 TASK-004 在本次执行前已由前置流程落地于远端 `master`
> （`24f100b` docs + `2c63ca7` schema + `381558c` 执行报告）。本任务**仅**新增
> TASK-005 一笔提交，不触碰 `packages/schema/`、根 `package.json` / `tsconfig` /
> `biome.json` / CI。

---

## 1. 前置调研（Step 0）：原项目算法分析

来源：`https://github.com/javaeer/story-timeline-view.git`，关键文件
`src/composables/useTimeline.js`（通过 GitHub REST API 拉取，内容见下方摘要）。
会宁会师数据来源 `src/data/timeline.js`（7 节点，仅用于量级参照）。

### 1.1 `buildSchedule(nodes, opts = {})`

```js
const introSec  = opts.introSec  ?? 0.8   // 片头淡入
const outroSec  = opts.outroSec  ?? 1.0   // 片尾停留
const baseSec   = opts.baseSec   ?? 10    // 无显式时长时单节点默认停留 10s
const perCharSec = opts.perCharSec ?? 0.05 // 每字追加秒数

const durs = nodes.map((n) =>
  n.duration != null && !Number.isNaN(Number(n.duration)) && Number(n.duration) > 0
    ? Number(n.duration)
    : baseSec + perCharSec * ((n.title?.length || 0) + (n.desc?.length || 0)))

const contentSec = durs.reduce((a, b) => a + b, 0)
const totalSec   = introSec + contentSec + outroSec
// starts/ends 由 acc 从 introSec 累加得到；另返回 startsFrac/endsFrac（内容区间内的分数位置）
```

- **完整参数与默认值**：`introSec=0.8, outroSec=1.0, baseSec=10, perCharSec=0.05`（与研读摘要一致，已逐字确认）。
- **返回值**：`{ introSec, outroSec, contentSec, totalSec, durs[], starts[], ends[], startsFrac[], endsFrac[], n }`。
- **边界**：`durs` 为空时 `contentSec=0`、`totalSec=introSec+outroSec`（不抛错）。
- **摘要未提及、源码独有的逻辑**：
  - 节点级 `duration` 显式覆盖（优先级高于公式）。
  - `startsFrac`/`endsFrac` 分数数组（我们的 `Schedule` 不需要，可从 `segments` 推出）。

### 1.2 `locate(sched, tSec)`

```js
if (tSec <= sched.introSec) return { travel: 0, node: -1, intra: 0 }
if (tSec >= sched.introSec + sched.contentSec) return { travel: 1, node: n - 1, intra: 1 }
const local = tSec - sched.introSec
let i = 0
while (i < n - 1 && local > sched.ends[i] - sched.introSec) i++
const segStart = sched.starts[i] - sched.introSec
const segEnd   = sched.ends[i]   - sched.introSec
const seg = segEnd - segStart
const intra = seg > 0 ? Math.min(Math.max((local - segStart) / seg, 0), 1) : 1
const travel = sched.contentSec > 0 ? local / sched.contentSec : 1
return { travel, node: i, intra }
```

- **返回值结构**：`{ travel, node, intra }`。`travel ∈ [0,1]`、`intra ∈ [0,1]`、`node` 为节点索引。
- **边界行为**：
  - `tSec <= introSec` → `travel=0, node=-1, intra=0`（**intro 区哨兵 `-1`**）。
  - `tSec >= intro+content` → `travel=1, node=n-1, intra=1`。
  - 内容区间内用 `while` 找到包含 `local` 的段，再线性插值 `intra`。

### 1.3 `xAtTravel(sched, travel, nodeXArr)`

- **缓动函数**：`fe = f < 0.5 ? 2*f*f : 1 - Math.pow(-2*f + 2, 2) / 2`（二次方缓动，对称）。
- 源码独有修复：末段 `i >= n-1` 时直接返回 `nodeXArr[n-1]`，避免取 `nodeXArr[n]`（undefined）导致 `NaN`。
- **不在本任务移植范围**：`xAtTravel` 是几何坐标映射，属于布局/渲染层（TASK-006/TASK-007），TASK-005 仅移植 `buildSchedule` + `locate` + `frameToProgress`。

### 1.4 拉取结论

源码拉取成功（REST API），算法已逐行核对，无阻断性偏差。移植以源码为权威。

---

## 2. 实现摘要

### `packages/core/src/schedule.ts`

- `buildSchedule(nodes, options?)`：用 `reduce` 累积 `acc`（起始 `introSec`），每节点生成
  `durationSec = baseSec + perCharSec * (label.length + descLen)`，其中 `descLen` 来自
  `metadata.description`（即原项目 `desc` 字段，TASK-004 B5 映射）。返回 `Schedule`
  `{ totalSec, introSec, outroSec, segments[] }`。
- `locate(schedule, tSec)`：intro/outro 边界直接返回常量；内容区用 `find` 定位首个
  `local <= seg.endSec - introSec` 的段（等价原 `while` 循环，但无可变计数器），再计算
  `intra`/`travel`。**无 `let`、无可变状态、纯函数**。
- 全部为纯函数，无模块级可变状态。

### `packages/core/src/frame.ts`

- `frameToProgress(frame, durationInFrames)`：先校验 `durationInFrames`（`NaN`/`<1` 抛错），
  单帧（`===1`）返回 `1`，否则 `clamp(frame,0,N-1)/(N-1)`。**无 `let`**。
- `fps` 不入参（TASK-004 决策 5）。

### `packages/core/src/index.ts`

- 替换骨架占位，统一导出 `buildSchedule` / `locate` / `frameToProgress` 及类型。

### 测试

- `schedule.test.ts`：**19** 个用例（P1–P17 各 1 + 黄金对比 2）。
- `frame.test.ts`：**8** 个用例（P18–P25）。
- 合计 **27** 个用例（≥ 26，满足验收）。
- `docs/reports/golden-schedule.json`：用会宁会师 8 节点运行 `buildSchedule` 生成的黄金数据，
  测试内与实时结果深度相等对比（R-11 缓解措施）。

---

## 3. P1–P25 验收自检表

| 编号 | 不变量 | 覆盖测试 | 结果 |
|---|---|---|---|
| P1 | `totalSec > 0` | schedule.test P1 | ✅ |
| P2 | `segments.length === nodes.length` | schedule.test P2 | ✅ |
| P3 | `segments[i].nodeId === nodes[i].id` | schedule.test P3 | ✅ |
| P4 | `segments[i].endSec === startSec + durationSec` | schedule.test P4 | ✅ |
| P5 | `segments[i+1].startSec === segments[i].endSec` | schedule.test P5 | ✅ |
| P6 | `segments[0].startSec === introSec` | schedule.test P6 | ✅ |
| P7 | `last.endSec + outroSec === totalSec` | schedule.test P7 | ✅ |
| P8 | 显式 `duration` 覆盖（schema 无此字段→跳过，已标注） | schedule.test P8（标注跳过） | ⚠️ 跳过 |
| P9 | `locate(0).travel === 0` | schedule.test P9 | ✅ |
| P10 | `locate(totalSec).travel === 1` | schedule.test P10 | ✅ |
| P11 | `travel` 单调非减 | schedule.test P11 | ✅ |
| P12 | `travel ∈ [0,1]` | schedule.test P12 | ✅ |
| P13 | `intra ∈ [0,1]` | schedule.test P13 | ✅ |
| P14 | `nodeIndex ∈ [0, n-1]` | schedule.test P14 | ✅ |
| P15 | `t < 0` 同 `t = 0` | schedule.test P15 | ✅ |
| P16 | `t > totalSec` 同 `t = totalSec` | schedule.test P16 | ✅ |
| P17 | `buildSchedule([])` 空段、`totalSec=intro+outro` | schedule.test P17 | ✅ |
| P18 | `frameToProgress(0, N) === 0`（N≥2） | frame.test P18 | ✅ |
| P19 | `frameToProgress(N-1, N) === 1` | frame.test P19 | ✅ |
| P20 | `frameToProgress(-1, N) === 0`（N≥2） | frame.test P20 | ✅ |
| P21 | `frameToProgress(N, N) === 1` | frame.test P21 | ✅ |
| P22 | `frameToProgress(N+100, N) === 1` | frame.test P22 | ✅ |
| P23 | 单调非减 | frame.test P23 | ✅ |
| P24 | `durationInFrames===1 ⇒ 1` | frame.test P24 | ✅ |
| P25 | `durationInFrames < 1` 抛错 | frame.test P25 | ✅ |

P8 跳过说明：`@forge/schema` 的 `Node` 无 `duration` 字段（TASK-004 B3/B4 明确只定义时间线
视图最小集），故原项目的逐节点时长覆盖在 schema 层不可表达；移植版**始终按公式计**，
与原项目公式 `baseSec + perCharSec*(len)` 完全一致，不存在“逻辑分歧”，仅是该能力未开放。

---

## 4. 黄金数值（`buildSchedule` 对会宁会师 8 节点）

- `totalSec = 98.05`（intro 0.8 + 内容 96.25 + outro 1.0）
- `introSec = 0.8`，`outroSec = 1.0`
- 8 段时长（秒）：`12.35, 12.00, 12.10, 11.90, 11.95, 11.95, 11.90, 12.10`
- 量级与原项目（7 节点、`title+desc` 文案相近 → 约 77s）一致，属“几十秒级”，符合预期。
- 完整 JSON 见 `docs/reports/golden-schedule.json`，测试内与实时计算深度相等。

---

## 5. 与原项目对比（行为等价性）

将原始 `buildSchedule` / `locate`（从 `useTimeline.js` 直接导入）与会宁会师 8 节点
（映射为原项目 `title`/`desc` 形态）运行，并与移植版逐项对比，临时对比测试 **5/5 通过**：

- 逐节点 `durationSec` 完全一致；
- `totalSec` 完全一致；
- 各段 `startSec` / `endSec` 边界完全一致；
- `t > introSec` 区间内 `locate` 的 `travel` / `intra` / `nodeIndex` 完全一致；
- intro 区：`travel` / `intra` 一致，仅 `nodeIndex` 不同（见偏离 1）。

**结论：对 `buildSchedule` 与 `locate` 声明“行为等价”（behaviourally equivalent）。**
`frameToProgress` 为 TASK-004 决策 5 新增、原项目无对应物，以 P18–P25 独立验证。

---

## 6. TASK-004 schema 源码审查

> 约束：TASK-005 **不修改** `packages/schema/` 任何文件，仅审查。以下为 5 个源文件
> 在 `381558c` 的**逐字**内容。

### 6.1 `packages/schema/src/zod.ts`

```ts
/**
 * @forge/schema — Zod schema definitions (single source of truth).
 *
 * Story Schema v0.1: the minimal field set required by the **timeline**
 * view. Per the TASK-004 decision, we deliberately do NOT define the
 * other five view types yet — the timeline field set must first be
 * validated against the 会宁会师 demo data before the schema is extended
 * (this is the mitigation for risk R-01: Schema 过早僵化).
 *
 * All exported TypeScript types are derived from these schemas via
 * `z.infer` (see ./types.ts) — there are no hand-written type aliases,
 * so the type and the validator can never drift apart (ADR-002).
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared identifier formats
// ---------------------------------------------------------------------------

/** Node ids are kebab-case, e.g. `huining-assembly`. */
export const NodeIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Node id must be kebab-case (e.g. "huining-assembly")');

/**
 * Asset ids share the kebab-case format and are what `Node.media` and
 * `meta.bgm` reference. Keeping the format identical to node ids makes
 * the cross-reference check (below) straightforward.
 */
export const AssetIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Asset id must be kebab-case (e.g. "poster-1")');

// ---------------------------------------------------------------------------
// Time — ISO 8601 date or datetime
// ---------------------------------------------------------------------------

// Accepts a date-only value ("2024-01-15") or a full datetime
// ("2024-01-15T10:00:00Z"); rejects anything `Date.parse` cannot read.
const ISO_8601 = /^\d{4}-\d{2}-\d{2}(?:[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})?)?$/;

export const TimeSchema = z
  .string()
  .refine((value) => ISO_8601.test(value) && !Number.isNaN(Date.parse(value)), {
    message: 'time must be a valid ISO 8601 date or datetime (e.g. "1936-06-01")',
  });

// ---------------------------------------------------------------------------
// Leaf schemas
// ---------------------------------------------------------------------------

export const MetaSchema = z.object({
  title: z.string().min(1, 'meta.title is required'),
  resolution: z.enum(['1920x1080', '1280x720', '3840x2160']),
  fps: z.union([z.literal(24), z.literal(30), z.literal(60)]),
  bgm: AssetIdSchema.optional(),
});

export const NodeSchema = z.object({
  id: NodeIdSchema,
  type: z.literal('event'),
  label: z.string().min(1),
  time: TimeSchema,
  track: z.string().optional(),
  featured: z.boolean().optional(),
  media: z.array(AssetIdSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const EdgeSchema = z.object({
  from: NodeIdSchema,
  to: NodeIdSchema,
  type: z.literal('temporal'),
});

export const ViewSchema = z.object({
  id: NodeIdSchema,
  type: z.literal('timeline'),
  tracks: z.array(z.string()).optional(),
  layout: z.literal('horizontal').optional(),
  duration: z.number().positive().optional(),
});

export const AssetSchema = z.object({
  id: AssetIdSchema,
  type: z.enum(['image', 'audio', 'video']),
  src: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Aggregate Story schema + cross-reference invariants
// ---------------------------------------------------------------------------

export const StorySchema = z
  .object({
    meta: MetaSchema,
    views: z.array(ViewSchema).min(1, 'at least one view is required'),
    nodes: z.array(NodeSchema).min(1, 'at least one node is required'),
    edges: z.array(EdgeSchema),
    assets: z.array(AssetSchema),
  })
  .superRefine((story, ctx) => {
    const assetIds = new Set(story.assets.map((asset) => asset.id));
    const nodeIds = new Set(story.nodes.map((node) => node.id));

    // meta.bgm must reference an existing asset.
    if (story.meta.bgm !== undefined && !assetIds.has(story.meta.bgm)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['meta', 'bgm'],
        message: `meta.bgm references unknown asset id "${story.meta.bgm}"`,
      });
    }

    // Every node.media reference must resolve to a declared asset.
    for (const [index, node] of story.nodes.entries()) {
      for (const ref of node.media ?? []) {
        if (!assetIds.has(ref)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['nodes', index, 'media'],
            message: `node "${node.id}" references unknown asset id "${ref}"`,
          });
        }
      }
    }

    // Every edge endpoint must reference a declared node.
    for (const [edgeIndex, edge] of story.edges.entries()) {
      if (!nodeIds.has(edge.from)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges', edgeIndex, 'from'],
          message: `edge references unknown node id "${edge.from}"`,
        });
      }
      if (!nodeIds.has(edge.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges', edgeIndex, 'to'],
          message: `edge references unknown node id "${edge.to}"`,
        });
      }
    }
  });
```

### 6.2 `packages/schema/src/types.ts`

```ts
/**
 * @forge/schema — TypeScript types (derived, never hand-written).
 *
 * Every type below is inferred from the Zod schemas in ./zod.ts via
 * `z.infer`. There are intentionally no handwritten `interface`/`type`
 * aliases here: the schema is the single source of truth, so the static
 * types and the runtime validator cannot diverge (ADR-002).
 */

import { z } from 'zod';

import {
  AssetIdSchema,
  AssetSchema,
  EdgeSchema,
  MetaSchema,
  NodeIdSchema,
  NodeSchema,
  StorySchema,
  TimeSchema,
  ViewSchema,
} from './zod';

export type Story = z.infer<typeof StorySchema>;
export type Meta = z.infer<typeof MetaSchema>;
export type Node = z.infer<typeof NodeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type View = z.infer<typeof ViewSchema>;
export type Asset = z.infer<typeof AssetSchema>;

/** Kebab-case node identifier, e.g. `"huining-assembly"`. */
export type NodeId = z.infer<typeof NodeIdSchema>;
/** Kebab-case asset identifier referenced by `Node.media` / `Meta.bgm`. */
export type AssetId = z.infer<typeof AssetIdSchema>;
/** ISO 8601 date or datetime string. */
export type Time = z.infer<typeof TimeSchema>;

/** Supported output resolutions (Phase 1). */
export type Resolution = Meta['resolution'];
/** Supported frame rates (Phase 1). */
export type Fps = Meta['fps'];
/** Supported node kinds (Phase 1 — only `"event"`). */
export type NodeType = Node['type'];
/** Supported view kinds (Phase 1 — only `"timeline"`). */
export type ViewType = View['type'];
/** Supported edge kinds (Phase 1 — only `"temporal"`). */
export type EdgeType = Edge['type'];
/** Supported asset media kinds. */
export type AssetType = Asset['type'];
```

### 6.3 `packages/schema/src/index.ts`

```ts
/**
 * @forge/schema — public API.
 *
 * Re-exports the derived types, the Zod schemas (single source of truth),
 * and the schema versioning helpers. Consumers should import from
 * `@forge/schema` and validate untrusted input with `StorySchema.parse`.
 */

export * from './types';
export * from './zod';
export * from './version';
```

### 6.4 `packages/schema/src/version.ts`

```ts
/**
 * @forge/schema — schema versioning.
 *
 * Single source of truth for the Story schema version. As the schema
 * evolves (e.g. when new view types or node kinds are added), a story
 * authored against an older version can be upgraded to the current
 * version through a registered migration hook before validation.
 */

export const SCHEMA_VERSION = '0.1.0' as const;

export type SchemaVersion = typeof SCHEMA_VERSION;

/**
 * A migration hook upgrades a raw (already-parsed) story object from a
 * previous schema version to the current one. Hooks are keyed by the
 * version they migrate *from*.
 */
export type MigrationHook = (raw: unknown) => unknown;

const migrations = new Map<string, MigrationHook>();

/** Register a migration that upgrades stories authored at `fromVersion`. */
export function registerMigration(fromVersion: string, hook: MigrationHook): void {
  migrations.set(fromVersion, hook);
}

/** Look up the migration hook for a given source version, if any. */
export function getMigration(fromVersion: string): MigrationHook | undefined {
  return migrations.get(fromVersion);
}

/** Currently registered migration source versions (for introspection/tests). */
export function registeredMigrationVersions(): string[] {
  return [...migrations.keys()];
}
```

### 6.5 `packages/schema/src/zod.test.ts`

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { NodeId, Story } from './types';
import { StorySchema } from './zod';

const HERE = dirname(fileURLToPath(import.meta.url));

// Decision 4: the demo story is the single source of truth. We read the
// canonical file via a relative path rather than ESM-importing it, because
// the schema package pins `rootDir: ./src` and `stories/` lives outside
// that root — an ESM import would trip `tsc -b` (TS6059) and break
// `typecheck`/`build`. Reading the same file at runtime keeps one copy.
const huiningPath = join(HERE, '..', '..', '..', 'stories/demo/huining-1936.json');

function loadHuining(): unknown {
  return JSON.parse(readFileSync(huiningPath, 'utf-8'));
}

/** Minimal valid story used as the base for negative-case tests. */
type RawStory = {
  meta: Record<string, unknown>;
  views: unknown[];
  nodes: Array<Record<string, unknown>>;
  edges: unknown[];
  assets: unknown[];
};

function baseStory(): RawStory {
  return {
    meta: { title: 'T', resolution: '1920x1080', fps: 30 },
    views: [{ id: 'v1', type: 'timeline', layout: 'horizontal', duration: 30 }],
    nodes: [
      { id: 'n1', type: 'event', label: 'A', time: '1936-06-01' },
      { id: 'n2', type: 'event', label: 'B', time: '1936-07-01' },
    ],
    edges: [{ from: 'n1', to: 'n2', type: 'temporal' }],
    assets: [],
  };
}

function issuePaths(raw: unknown): string[] {
  const result = StorySchema.safeParse(raw);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => issue.path.join('.'));
}

describe('StorySchema — huining-1936 demo (B6-1)', () => {
  it('parses the canonical huining-1936 story', () => {
    const story: Story = StorySchema.parse(loadHuining());
    expect(story.views).toHaveLength(1);
    expect(story.views[0]?.type).toBe('timeline');
    expect(story.nodes).toHaveLength(8);
    expect(story.edges).toHaveLength(7);
    // Q-11: featured flags the headline assembly events.
    const featured = story.nodes.filter((node) => node.featured === true);
    expect(featured.length).toBeGreaterThanOrEqual(1);
    // derived NodeId type is usable as a value.
    const ids: NodeId[] = story.nodes.map((node) => node.id);
    expect(ids[0] ?? '').toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
});

describe('StorySchema — negative cases', () => {
  it('rejects a story missing meta.title and points at meta.title (B6-2)', () => {
    const raw = baseStory();
    raw.meta.title = undefined;
    expect(issuePaths(raw)).toContain('meta.title');
  });

  it('reports a malformed time on the offending node (B6-3)', () => {
    const raw = baseStory();
    const bad = raw.nodes[1];
    if (bad) {
      bad.time = '1936/06/01';
    }
    expect(issuePaths(raw)).toContain('nodes.1.time');
  });

  it('rejects a node.media reference with no matching asset (B6-4)', () => {
    const raw = baseStory();
    raw.nodes.push({
      id: 'n3',
      type: 'event',
      label: 'C',
      time: '1936-08-01',
      media: ['asset-missing'],
    });
    expect(issuePaths(raw)).toContain('nodes.2.media');
  });

  it('rejects an empty views array (B6-5)', () => {
    const raw = baseStory();
    raw.views = [];
    expect(issuePaths(raw)).toContain('views');
  });

  it('rejects an unsupported fps value like 25 (B6-6)', () => {
    const raw = baseStory();
    raw.meta.fps = 25;
    expect(issuePaths(raw)).toContain('meta.fps');
  });
});
```

### 6.6 schema 审计结论

- **类型是否均从 `z.infer` 推导**：✅ 是。`types.ts` 全部为 `z.infer<typeof X>`，无手写 `type`/`interface`。满足 TASK-004 B4 与 ADR-002。
- **`Node` 字段是否与 TASK-004 定义一致**：✅ 一致。`NodeSchema` = `id(NodeId)` / `type:'event'` / `label` / `time(TimeSchema)` / `track?` / `featured?` / `media?` / `metadata?`，与 TASK-004 B3 完全对应。
- **测试用例是否 ≥ 6**：✅ 是。`zod.test.ts` 共 6 个用例（B6-1 ~ B6-6），覆盖合法示例 + 5 条边界（meta.title 缺失、`time` 格式、media 悬空引用、空 views、非法 fps），错误均定位到具体字段路径。
- **未发现需修改的问题**，按约束仅审查、未改动 `packages/schema/`。

---

## 7. 命令输出（TASK-005 B7 自动验证）

| 命令 | 结果 |
|---|---|
| `pnpm --filter @forge/schema build` | EXIT=0 |
| `pnpm --filter @forge/core build` | EXIT=0 |
| `pnpm --filter @forge/core typecheck` | EXIT=0 |
| `pnpm --filter @forge/core test` | EXIT=0，**Test Files 2 passed，Tests 27 passed** |
| `pnpm lint` | EXIT=0（仅 3 处 `noNonNullAssertion` 警告，级别 warn，不阻断） |

> 注：`pnpm lint` 报告的 `noNonNullAssertion` 位于 `schedule.test.ts`（测试文件内的 `segments[0]!` 等），
> 级别为 warn，不影响 `biome check` 退出码（EXIT=0），且不在“schedule.ts/frame.ts 纯函数无 let”的审查范围内。

---

## 8. 偏离说明

1. **`locate` intro 区 `nodeIndex` 钳制**：原项目返回 `node: -1`；移植版钳制为 `0` 以符合
   `LocateResult.nodeIndex ∈ [0, n-1]`（P14）。`travel` 与 `intra` 与源完全一致。这是为符合
   契约而对哨兵值的唯一偏差，已在 `schedule.ts` 与第 5 节注明。
2. **`frameToProgress` 公式**：实现为 `clamp(frame,0,N-1)/(N-1)`，使最后一帧进度为 1（满足 P19/P24）。
   任务书内联注释写的 `frame / durationInFrames` 会把末帧置于 `(N-1)/N ≠ 1`，与 P19 矛盾，故按 P19/P24
   实现并在 `frame.ts` 注明。
3. **P18 / P20 排除 `N=1`**：单帧特例按 P24 返回 1，覆盖 P18/P20 在 `N=1` 处的值；两用例仅对 `N≥2` 断言。
4. **新增 `packages/core/package.json` 依赖 `@forge/schema: workspace:*`**：TASK-005 A3「类型从
   `@forge/schema` 导入」的前提，且 `tsc -b` 需在构建 core 前先构建 schema。属包级文件，未触碰根
   `package.json` / `tsconfig` / `biome.json` / CI。
5. **新增 `packages/core/vitest.config.ts`**：使 `pnpm --filter @forge/core test` 能从包内解析测试
   （根 vitest 配置的 glob 为根相对，从包目录运行时匹配不到）。与 `packages/schema/vitest.config.ts`
   同构，未改根配置/CI。
6. **P8 跳过**：`@forge/schema` 的 `Node` 无 `duration` 字段，逐节点时长覆盖在 schema 层不可表达；
   移植版始终按原项目公式计算，与原公式一致，非逻辑分歧。
7. **未修改 `packages/schema/`**：遵守 TASK-005 约束，仅在第 6 节审查。
8. **TASK-002-fix / TASK-004 已在远端**：本次未重做，仅新增 TASK-005 一笔提交。

---

## 9. 交付物清单

| 文件 | 职责 |
|---|---|
| `packages/core/src/schedule.ts` | `buildSchedule` + `locate`（纯函数，无 `let`） |
| `packages/core/src/frame.ts` | `frameToProgress`（纯函数） |
| `packages/core/src/index.ts` | 替换占位，统一导出 |
| `packages/core/src/schedule.test.ts` | P1–P17 + 黄金对比（19 用例） |
| `packages/core/src/frame.test.ts` | P18–P25（8 用例） |
| `packages/core/vitest.config.ts` | 包内测试解析（偏离 5） |
| `packages/core/package.json` | 新增 `@forge/schema` 依赖（偏离 4） |
| `docs/reports/golden-schedule.json` | 黄金调度数据（R-11 缓解） |
| `docs/reports/TASK-005-report.md` | 本报告 |
