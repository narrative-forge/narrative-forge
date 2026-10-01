/**
 * @forge/compositions — shared Webpack override.
 *
 * ADR-004 ESM interop: every `@forge/*` package is emitted by `tsc` with
 * **extensionless** relative imports (`export * from './Timeline'`) while being
 * published as `"type": "module"`. Webpack's strict resolution
 * (`fullySpecified`) rejects that inside the Remotion Studio/bundler, and
 * Remotion re-asserts `fullySpecified`, so relaxing the flag does not stick.
 * The fix is to alias each `@forge/*` package to its **source** entry, letting
 * Webpack resolve the extensionless `.ts`/`.tsx` imports through its TS loader.
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
 * Remotion's `WebpackOverrideFn`: receives the config, returns the config.
 * Typed loosely on purpose — Remotion's own `WebpackOverrideFn` type is tied to
 * its bundled webpack version, and we only ever touch `resolve.alias`.
 */
export function forgeWebpackOverride(config: unknown): unknown {
  const cfg = config as { resolve?: { alias?: Record<string, string> } };
  cfg.resolve = cfg.resolve ?? {};
  cfg.resolve.alias = {
    ...(cfg.resolve.alias ?? {}),
    '@forge/kit': srcOf('kit'),
    '@forge/layouts': srcOf('layouts'),
    '@forge/core': srcOf('core'),
    '@forge/schema': srcOf('schema'),
  };
  return cfg;
}
