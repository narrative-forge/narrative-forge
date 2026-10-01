/**
 * @forge/render — story.json → MP4 (TASK-008 Step B).
 *
 * Pipeline: load story → prepare timeline props → bundle the Remotion entry →
 * select the composition → renderMedia → stat → clean up the temp dir.
 *
 * Deliberate choices:
 *
 * - **No React here.** Per the task constraint, this package only *consumes*
 *   `@forge/compositions`; component definitions live in `@forge/kit` and
 *   `@forge/compositions` (ADR-004).
 * - **The Webpack override is imported, not re-implemented.** `bundle()` does
 *   not read `remotion.config.ts`, so a programmatic bundle would otherwise
 *   lose the ADR-004 ESM alias fix from TASK-007 and fail to resolve
 *   `@forge/*` (风险二). Importing `forgeWebpackOverride` from
 *   `@forge/compositions/webpack-override` gives the CLI path and this path
 *   one single definition.
 * - **The temp dir is always removed.** `bundle()` writes to an explicit
 *   `mkdtemp` dir which is deleted in `finally`, so a failed render leaves no
 *   residue (task constraint).
 * - **Progress is a single [0, 1] stream.** Bundling gets the first 15% and
 *   frame rendering the remaining 85%; callers never see two different scales.
 */

import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';

import { TIMELINE_COMPOSITION_ID, prepareTimelineProps } from '@forge/compositions/prepare';
import { COMPOSITION_ENTRY, forgeWebpackOverride } from '@forge/compositions/webpack-override';
import { bundle, type WebpackOverrideFn } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

import { loadStory } from './loadStory';
import type { RenderOptions, RenderResult } from './types';

/** Share of the progress bar given to webpack bundling. */
const BUNDLE_PROGRESS_SHARE = 0.15;

/**
 * `forgeWebpackOverride` is intentionally Remotion-agnostic (`unknown` in,
 * `unknown` out) so `@forge/compositions` does not depend on `@remotion/*`.
 * The cast adapts it to Remotion's `WebpackOverrideFn` at this boundary.
 */
const webpackOverride = forgeWebpackOverride as unknown as WebpackOverrideFn;

function defaultConcurrency(): number {
  return Math.max(1, Math.floor(cpus().length / 2));
}

export async function renderStory(options: RenderOptions): Promise<RenderResult> {
  const startedAt = Date.now();
  const { onProgress } = options;

  // R1 (missing file) / R2 (schema violation).
  const story = loadStory(options.storyPath);

  // R3: an unknown viewId throws inside prepareTimelineProps.
  const fps = options.fps ?? story.meta.fps;
  const props = prepareTimelineProps(story, options.viewId, fps);

  const width = options.resolution?.width ?? props.width;
  const height = options.resolution?.height ?? props.height;
  const concurrency = options.concurrency ?? defaultConcurrency();
  const durationInFrames = props.durationInFrames;

  const outDir = mkdtempSync(join(tmpdir(), 'forge-render-'));
  try {
    const serveUrl = await bundle({
      entryPoint: COMPOSITION_ENTRY,
      outDir,
      webpackOverride,
      onProgress: (progress: number) => {
        onProgress?.(progress * BUNDLE_PROGRESS_SHARE);
      },
    });

    const base = await selectComposition({
      serveUrl,
      id: TIMELINE_COMPOSITION_ID,
      inputProps: props as unknown as Record<string, unknown>,
    });

    // The registered composition carries the demo's own fps/size/duration;
    // override them with what the caller asked for so `fps` / `resolution`
    // are honoured and durationInFrames always matches the schedule.
    const composition = { ...base, width, height, fps, durationInFrames };

    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      imageFormat: 'jpeg',
      outputLocation: options.outputPath,
      inputProps: props as unknown as Record<string, unknown>,
      concurrency,
      overwrite: true,
      onProgress: ({ progress }) => {
        onProgress?.(BUNDLE_PROGRESS_SHARE + progress * (1 - BUNDLE_PROGRESS_SHARE));
      },
    });

    onProgress?.(1);

    return {
      outputPath: options.outputPath,
      durationInFrames,
      durationInSec: durationInFrames / fps,
      fileSizeBytes: statSync(options.outputPath).size,
      renderTimeMs: Date.now() - startedAt,
    };
  } finally {
    // Constraint: no residue, even when bundling or rendering throws.
    rmSync(outDir, { recursive: true, force: true });
  }
}
