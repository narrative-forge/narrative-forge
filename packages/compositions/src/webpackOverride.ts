/**
 * @forge/compositions — shared Webpack override.
 *
 * ADR-004 ESM interop: every `@forge/*` package is emitted by `tsc` with
 * **relative `.js` specifiers** (`export * from './Timeline.js'`) while being
 * published as `"type": "module"` and authored as `.ts`/`.tsx`. Webpack's
 * strict resolution (`fullySpecified`) then has two problems, and this module
 * fixes both — see `EXTENSION_ALIAS` below for the `.js` → `.ts` mapping and
 * the aliases for the workspace package boundaries:
 *
 *   1. `./Root.js` must resolve to `./Root.tsx` (TypeScript/Vite do this
 *      implicitly; Webpack needs `resolve.extensionAlias`).
 *   2. `@forge/<pkg>` must resolve to that package's **source** entry, so the
 *      bundler does not depend on a pre-built `dist/`.
 *
 * This module is the single definition of that override (TASK-008). Both
 * consumers use it:
 *
 *   - `remotion.config.ts` — for `remotion studio` / `remotion render` (CLI)
 *   - `@forge/render`      — for programmatic `bundle()` (TASK-008 Step B)
 *
 * Keeping one definition is what prevents 风险二: if the override had been
 * duplicated, the CLI path and the programmatic path could silently drift and
 * only one of them would keep working.
 *
 * Paths are resolved from this module's own location, never from `process.cwd()`,
 * so the bundler works no matter which directory the caller runs from.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Root of `@forge/compositions` — `<repo>/packages/compositions`.
 *
 * Works both when this module runs from `src/` (via the Remotion config loader
 * or a future ts-node path) and from `dist/` (compiled output).
 */
const packageRoot = join(here, '..');

/** The Remotion entry point: `src/index.ts` calls `registerRoot()`. */
export const COMPOSITION_ENTRY = join(packageRoot, 'src', 'index.ts');

/** Alias target for a sibling `@forge/<pkg>` workspace package. */
const srcOf = (pkg: string): string => join(packageRoot, '..', pkg, 'src', 'index.ts');

/**
 * `resolve.extensionAlias` — the piece that makes **TypeScript-style `.js`
 * specifiers** resolvable by Webpack.
 *
 * Every source file in this monorepo writes relative imports the way Node ESM
 * requires them at runtime (`./Root.js`, `./TimelineComposition.js`), because
 * `tsc` with `module: ESNext` does **not** rewrite extensionless specifiers.
 * TypeScript and Vite/vitest resolve `./Root.js` → `./Root.tsx` on their own;
 * plain Webpack does not, it looks for a literal `Root.js` on disk and fails
 * with `Module not found: Can't resolve './Root.js'`.
 *
 * `extensionAlias` is Webpack's built-in (5.74+) equivalent of that mapping:
 * for a request ending in `.js`, try each candidate in order. `.tsx`/`.ts`
 * come first on purpose — when a sibling `dist/` sits next to `src/`, the
 * source file is the one we want to bundle.
 */
const EXTENSION_ALIAS: Record<string, string[]> = {
  '.js': ['.ts', '.tsx', '.js'],
  '.jsx': ['.tsx', '.jsx'],
  '.mjs': ['.mts', '.mjs'],
  '.cjs': ['.cts', '.cjs'],
};

/**
 * Remotion's `WebpackOverrideFn`: receives the config, returns the config.
 * Typed loosely on purpose — Remotion's own `WebpackOverrideFn` type is tied to
 * its bundled webpack version, and we only ever touch `resolve`.
 */
export function forgeWebpackOverride(config: unknown): unknown {
  const cfg = config as {
    resolve?: { alias?: Record<string, string>; extensionAlias?: Record<string, string[]> };
  };
  cfg.resolve = cfg.resolve ?? {};
  cfg.resolve.alias = {
    ...(cfg.resolve.alias ?? {}),
    '@forge/kit': srcOf('kit'),
    '@forge/layouts': srcOf('layouts'),
    '@forge/core': srcOf('core'),
    '@forge/schema': srcOf('schema'),
  };
  cfg.resolve.extensionAlias = {
    ...(cfg.resolve.extensionAlias ?? {}),
    ...EXTENSION_ALIAS,
  };
  return cfg;
}
