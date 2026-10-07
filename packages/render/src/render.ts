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
 * - **One browser instance for the whole run.** `openBrowser()` is called once
 *   and handed to *both* `selectComposition()` and `renderMedia()`. Left to its
 *   own devices Remotion launches a **separate Chrome per concurrent page**,
 *   and on a small machine (this repo's target is a 4 GB MacBook Air) that is
 *   enough to starve the compositor until Remotion's 30 s `delayRender` budget
 *   expires — the render dies with "Setting the current frame to N was called
 *   but not cleared". Reusing one instance is also what Remotion documents as
 *   the fast path, and it measurably shortens page setup here (29.0 s of
 *   `setPropsAndEnv` versus 48.8 s when Remotion opens its own browser).
 *   Concurrency is capped by memory as well as by CPU — see
 *   `defaultConcurrency()`.
 * - **The `delayRender` budget is raised, not left at Remotion's 30 s.**
 *   Page setup and every rendered frame share one budget. On this project's
 *   target machine page setup alone has been measured past 30 s (and the
 *   per-frame budget was seen to expire at 28 s), so the stock value fails
 *   intermittently — see `DEFAULT_PAGE_TIMEOUT_MS`.
 * - **Progress is a single [0, 1] stream.** Bundling gets the first 15% and
 *   frame rendering the remaining 85%; callers never see two different scales.
 *   (Note that `bundle()`'s own `onProgress` is 0-100, so it is normalised —
 *   see the call site.)
 * - **The browser is the locally installed Chrome, never a download.** Remotion
 *   would otherwise fetch its own `chrome-headless-shell` on first render; we
 *   pass an explicit `browserExecutable` (plus an `onBrowserDownload` hook that
 *   throws) so an offline machine renders and a machine without Chrome gets a
 *   clear error instead of ~150 MB of surprise network traffic. See
 *   `@forge/compositions/chrome`.
 * - **`chromeMode: 'chrome-for-testing'`** is required together with that
 *   choice: it is what makes Remotion launch a full Chrome with modern
 *   `--headless=new`. With the default `'headless-shell'` mode Remotion emits
 *   `--headless=old`, which real Chrome ≥ 132 no longer supports.
 * - **Encoding uses a local FFmpeg where Remotion's is unusable.** On macOS 12
 *   the bundled one aborts on load; `binariesDirectory` lets an FFmpeg that is
 *   already on the machine take over, so the same is true here: no download.
 */

import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { cpus, tmpdir, totalmem } from 'node:os';
import { join } from 'node:path';
import { resolveChromeExecutable } from '@forge/compositions/chrome';
import { resolveFfmpegBinariesDirectory } from '@forge/compositions/ffmpeg';
import { TIMELINE_COMPOSITION_ID, prepareTimelineProps } from '@forge/compositions/prepare';
import { COMPOSITION_ENTRY, forgeWebpackOverride } from '@forge/compositions/webpack-override';
import { bundle } from '@remotion/bundler';
import type { WebpackOverrideFn } from '@remotion/bundler';
import { openBrowser, renderMedia, selectComposition } from '@remotion/renderer';
import { loadStory } from './loadStory.js';
import type { RenderOptions, RenderResult } from './types.js';

/** Share of the progress bar given to webpack bundling. */
const BUNDLE_PROGRESS_SHARE = 0.15;

/**
 * Budget for Remotion's `delayRender()` calls, which page setup and every
 * rendered frame share.
 *
 * Remotion defaults this to 30 s. On this project's target machine (a 4 GB
 * MacBook Air running macOS 12) page setup alone has been measured at 29 s,
 * 49 s and 64 s — and past 120 s when a fresh webpack bundle has just left the
 * machine thrashing. The stock budget therefore fails *intermittently*, which
 * is the worst possible failure mode: the same command works and then does not.
 *
 * 300 s is 10x Remotion's default and comfortably above the worst measurement,
 * while still surfacing a genuine hang well inside the render's own runtime.
 * It is an upper bound, so it costs a fast machine nothing.
 */
const DEFAULT_PAGE_TIMEOUT_MS = 300_000;

/**
 * `'chrome-for-testing'` describes the *mode*, not the binary: "launch a normal
 * Chrome build headlessly". It is the correct pairing for a system-installed
 * Google Chrome (see the module docstring).
 */
const CHROME_MODE = 'chrome-for-testing' as const;

/**
 * Guarantee against a stealth download. With `browserExecutable` set Remotion
 * returns before it would ever call this, so reaching it means Remotion changed
 * its behaviour — throw rather than let a browser be fetched.
 */
function forbidBrowserDownload(): never {
  throw new Error(
    'Remotion attempted to download a browser. Narrative Forge is configured to render with ' +
      'the locally installed Chrome only — install Google Chrome or point ' +
      'FORGE_CHROME_EXECUTABLE at a Chrome/Chromium binary.'
  );
}

/**
 * `forgeWebpackOverride` is intentionally Remotion-agnostic (`unknown` in,
 * `unknown` out) so `@forge/compositions` does not depend on `@remotion/*`.
 * The cast adapts it to Remotion's `WebpackOverrideFn` at this boundary.
 */
const webpackOverride = forgeWebpackOverride as unknown as WebpackOverrideFn;

/**
 * How many Chrome pages may render at once.
 *
 * Two ceilings apply and the *lower* one wins:
 *
 * - **CPU**: half the cores, since each page pins a core while it paints.
 * - **Memory**: ~4 GB of RAM per concurrent 1080p page. Remotion buffers a
 *   decoded frame per page, and this project's target machine has 4 GB in
 *   total.
 *
 * Half the cores alone is the wrong answer on a small machine. At `cpus / 2`
 * this machine ran two pages and the render was *killed by memory pressure
 * part-way through*: the page stops answering Remotion's "Setting the current
 * frame to N" handle, so instead of failing the render simply hangs (measured:
 * 300 s on one frame at 6% CPU, then the timeout fired). One page per ~4 GB is
 * the budget the frame pipeline actually needs.
 */
function defaultConcurrency(): number {
  const byCpu = Math.floor(cpus().length / 2);
  const byMemory = Math.floor(totalmem() / (4 * 1024 ** 3));
  return Math.max(1, Math.min(byCpu, byMemory));
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
  const timeoutInMilliseconds = options.timeoutInMilliseconds ?? DEFAULT_PAGE_TIMEOUT_MS;
  const durationInFrames = props.durationInFrames;

  // Resolved *before* any Remotion work: a missing browser must fail fast and
  // must not be quietly replaced by a download.
  const browserExecutable = options.browserExecutable ?? resolveChromeExecutable();

  // `undefined` on every platform where Remotion's bundled FFmpeg works.
  const binariesDirectory = options.binariesDirectory ?? resolveFfmpegBinariesDirectory();

  const outDir = mkdtempSync(join(tmpdir(), 'forge-render-'));
  // `openBrowser()` takes no `onBrowserDownload` hook (unlike
  // `selectComposition()` / `renderMedia()`); the no-download guarantee here
  // rests on `browserExecutable` being set, which makes Remotion return the
  // user-defined path without ever looking for a browser to fetch.
  const browser = await openBrowser('chrome', {
    browserExecutable,
    chromeMode: CHROME_MODE,
    logLevel: 'error',
  });

  try {
    const serveUrl = await bundle({
      entryPoint: COMPOSITION_ENTRY,
      outDir,
      webpackOverride,
      onProgress: (progress: number) => {
        // Remotion reports **bundling** progress on a 0-100 scale
        // (`onProgress(Number((p * 100).toFixed(2)))` in @remotion/bundler),
        // while every other progress value in this pipeline is 0-1. Normalise,
        // then map onto this stage's share of the bar.
        onProgress?.((progress / 100) * BUNDLE_PROGRESS_SHARE);
      },
    });

    const base = await selectComposition({
      serveUrl,
      id: TIMELINE_COMPOSITION_ID,
      inputProps: props as unknown as Record<string, unknown>,
      browserExecutable,
      chromeMode: CHROME_MODE,
      puppeteerInstance: browser,
      timeoutInMilliseconds,
      onBrowserDownload: forbidBrowserDownload,
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
      browserExecutable,
      chromeMode: CHROME_MODE,
      binariesDirectory,
      puppeteerInstance: browser,
      timeoutInMilliseconds,
      onBrowserDownload: forbidBrowserDownload,
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
    // Constraint: no residue, even when bundling or rendering throws. The
    // browser is closed first so a failed render does not leave Chrome behind
    // holding the machine's memory.
    await browser.close({ silent: true });
    rmSync(outDir, { recursive: true, force: true });
  }
}
