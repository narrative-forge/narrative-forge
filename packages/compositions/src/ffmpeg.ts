/**
 * @forge/compositions — local FFmpeg resolution (no download, by design).
 *
 * Remotion ships its own FFmpeg inside `@remotion/compositor-<platform>`. On
 * macOS that binary is built against macOS 14 SDK symbols that older systems do
 * not have, so on macOS 12 (Monterey) loading it aborts immediately:
 *
 *   dyld: Symbol not found: (_AVCaptureDeviceTypeContinuityCamera)
 *     Referenced from: .../libavdevice.dylib
 *     Expected in: /System/Library/Frameworks/AVFoundation.framework/...
 *
 * Remotion's position is that macOS 13 (Ventura) is the minimum, and that they
 * cannot compile for older targets (remotion-dev/remotion#7027). A 2015 MacBook
 * Air cannot be upgraded past macOS 12, so "upgrade your OS" is not an answer.
 *
 * The `binariesDirectory` escape hatch is: Remotion accepts a directory that
 * contains its own `ffmpeg` / `ffprobe` instead of the bundled ones. Point it at
 * an FFmpeg you already have and everything else — the browser, the bundler,
 * the encoder arguments — stays exactly the same.
 *
 * Resolution order (never a download):
 *
 *   1. `FORGE_FFMPEG_DIR` — explicit, and a wrong value is an error, not a
 *      silent fallback.
 *   2. Only where the bundled FFmpeg is known to be unusable (macOS ≤ 12):
 *      the first directory holding both `ffmpeg` and `ffprobe`, searched on
 *      `PATH` and in the usual install prefixes.
 *   3. Otherwise `undefined` — Remotion's own binaries, untouched.
 *
 * Why it lives in `@forge/compositions`: like `chrome.ts` and
 * `webpackOverride.ts`, it is shared render tooling that two entry points must
 * agree on — `remotion.config.ts` (the `remotion` CLI) and `@forge/render` (the
 * programmatic path). One definition, no drift (风险二).
 */

import { existsSync } from 'node:fs';
import { release } from 'node:os';
import { delimiter, join } from 'node:path';

/** Escape hatch: point this at any directory containing `ffmpeg` + `ffprobe`. */
export const FFMPEG_DIR_ENV = 'FORGE_FFMPEG_DIR';

/** Remotion's minimum supported macOS is 13 (Darwin 22). */
const MIN_SUPPORTED_DARWIN_MAJOR = 22;

/** Directories probed after `PATH` in step 2. */
const EXTRA_SEARCH_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', '/usr/bin'];

/** Remotion looks for these two files inside `binariesDirectory`. */
function ffmpegBinaryNames(): { ffmpeg: string; ffprobe: string } {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  return { ffmpeg: `ffmpeg${suffix}`, ffprobe: `ffprobe${suffix}` };
}

/** True when `dir` looks like something Remotion can use as `binariesDirectory`. */
export function isFfmpegBinariesDirectory(dir: string): boolean {
  const { ffmpeg, ffprobe } = ffmpegBinaryNames();
  return existsSync(join(dir, ffmpeg)) && existsSync(join(dir, ffprobe));
}

/**
 * True on platforms where Remotion's bundled FFmpeg cannot be loaded.
 *
 * macOS reports its version through the Darwin kernel release, so the mapping is
 * `22 → macOS 13`, `21 → macOS 12`, and so on. Everything else is assumed fine.
 */
export function needsLocalFfmpeg(): boolean {
  if (process.platform !== 'darwin') {
    return false;
  }
  const major = Number.parseInt(release().split('.')[0] ?? '', 10);
  return Number.isFinite(major) && major < MIN_SUPPORTED_DARWIN_MAJOR;
}

/** First directory in the search list that holds both binaries, or `null`. */
function findOnSystem(): string | null {
  const seen = new Set<string>();
  const fromPath = (process.env.PATH ?? '').split(delimiter);
  for (const dir of [...fromPath, ...EXTRA_SEARCH_DIRS]) {
    if (!dir || seen.has(dir)) {
      continue;
    }
    seen.add(dir);
    if (isFfmpegBinariesDirectory(dir)) {
      return dir;
    }
  }
  return null;
}

/** Warn once per process: callers may resolve this on every render. */
let hasWarnedAboutMissingFfmpeg = false;

/**
 * `binariesDirectory` for Remotion, or `undefined` to keep Remotion's Default.
 *
 * When the bundled FFmpeg is unusable and nothing local is found, this warns
 * once on stderr and returns `undefined` — the render will then fail at the
 * encoding step with Remotion's own dyld error. Failing with an explanation
 * beats either a silent download or a mystery.
 */
export function resolveFfmpegBinariesDirectory(): string | undefined {
  const override = process.env[FFMPEG_DIR_ENV]?.trim();
  if (override) {
    if (!isFfmpegBinariesDirectory(override)) {
      const { ffmpeg, ffprobe } = ffmpegBinaryNames();
      throw new Error(
        [
          `${FFMPEG_DIR_ENV} points at "${override}", which does not contain both`,
          `${ffmpeg} and ${ffprobe}.`,
        ].join(' ')
      );
    }
    return override;
  }

  if (!needsLocalFfmpeg()) {
    return undefined;
  }

  const found = findOnSystem();
  if (found) {
    return found;
  }

  if (!hasWarnedAboutMissingFfmpeg) {
    hasWarnedAboutMissingFfmpeg = true;
    process.stderr.write(
      [
        `⚠ macOS ${release()} predates Remotion's minimum (macOS 13), so its bundled FFmpeg cannot load.`,
        '  Encoding will fail until you provide a local one — Narrative Forge never downloads:',
        `    ${FFMPEG_DIR_ENV}=/path/with/ffmpeg-and-ffprobe pnpm forge render …`,
        '',
      ].join('\n')
    );
  }
  return undefined;
}
