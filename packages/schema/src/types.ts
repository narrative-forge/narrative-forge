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
} from './zod.js';

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
