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

/**
 * 节点描述（`metadata.description`）的字符上限。
 *
 * TASK-011 §3.13：描述原先渲染在被 `fitScale` 缩放的事件卡里，卡高固定且
 * `overflow: hidden` —— 超过三行就**静默消失**，不报错也不告警。现在描述
 * 由底部字幕条承载（未被缩放，两行排版），超过上限即必然被裁。把上限放进
 * 校验，让"写数据时"就失败，而不是等到渲染。
 */
export const MAX_DESCRIPTION_CHARS = 120;

export const MetaSchema = z.object({
  title: z.string().min(1, 'meta.title is required'),
  resolution: z.enum(['1920x1080', '1280x720', '3840x2160']),
  fps: z.union([z.literal(24), z.literal(30), z.literal(60)]),
  bgm: AssetIdSchema.optional(),
  /**
   * 全屏背景图资产 id（可选）。
   *
   * 参照项目 `story-timeline-view` 的"沉浸式背景 + Ken Burns 缓推"是该片
   * 观感的主要来源；demo 数据没有素材，缺省时 `Backdrop` 降级为程序化
   * 渐变背景。有素材后填这个字段即可，无需改渲染层。
   */
  backdrop: AssetIdSchema.optional(),
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

  // REMOVED in Schema 0.1.1 (TASK-008 Step A, 裁定 1).
  //
  // `duration` used to declare how long a view plays, but the rhythm schedule
  // produced by `buildSchedule` was always the real source of truth — the two
  // disagreed on the 会宁 demo (declared 30s vs. computed 98.05s). Two sources
  // of truth for one quantity is a permanent inconsistency, so the field is
  // gone.
  //
  // It is declared as `z.never()` rather than simply deleted: a plain deletion
  // would make Zod *silently strip* the key, so a legacy story still carrying
  // `duration: 30` would validate clean and quietly keep its stale number.
  // `never` turns that into a loud failure at path `views.N.duration`.
  duration: z.never().optional(),
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

    // meta.backdrop must reference an existing image asset.
    if (story.meta.backdrop !== undefined) {
      const backdrop = story.assets.find((asset) => asset.id === story.meta.backdrop);
      if (backdrop === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['meta', 'backdrop'],
          message: `meta.backdrop references unknown asset id "${story.meta.backdrop}"`,
        });
      } else if (backdrop.type !== 'image') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['meta', 'backdrop'],
          message: `meta.backdrop must reference an image asset, got "${backdrop.type}"`,
        });
      }
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

      // 描述过长会在渲染期被无声裁掉（TASK-011 §3.13），改在校验期报错。
      const description = node.metadata?.description;
      if (typeof description === 'string' && description.length > MAX_DESCRIPTION_CHARS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['nodes', index, 'metadata', 'description'],
          message: `description is ${description.length} chars, exceeds the ${MAX_DESCRIPTION_CHARS}-char subtitle limit`,
        });
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
