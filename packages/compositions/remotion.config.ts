import { Config } from '@remotion/cli/config';
import { CHROME_EXECUTABLE_ENV, findChromeExecutable } from './src/chrome.js';
import { resolveFfmpegBinariesDirectory } from './src/ffmpeg.js';
import { forgeWebpackOverride } from './src/webpackOverride.js';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setConcurrency(4);

// ADR-004 ESM interop (Studio bundling): see ./src/webpackOverride.ts for the
// full rationale. The override moved there in TASK-008 so the CLI path
// (`remotion studio`) and the programmatic path (`@forge/render`'s `bundle()`)
// share a single definition instead of two copies that can drift apart.
// Paths are now derived from the module location, not `process.cwd()`, so the
// config also works when Studio is launched from another directory.
Config.overrideWebpackConfig(forgeWebpackOverride);

// Render with the locally installed Chrome, never with a browser Remotion
// downloads for itself. This is the CLI-side half of the same rule that
// `@forge/render` enforces programmatically (see ./src/chrome.ts) — it keeps
// a manual `remotion render` / `remotion still` from pulling ~150 MB.
//
// Deliberately best-effort: `remotion studio` (what `forge preview` runs) never
// launches Puppeteer, and it would be hostile to refuse to open Studio on a
// machine that happens to have no Chrome. So: found → use it; not found →
// leave Remotion's default alone but say so out loud.
const localChrome = findChromeExecutable();
if (localChrome) {
  Config.setBrowserExecutable(localChrome);
} else {
  process.stderr.write(
    [
      '⚠ No local Chrome/Chromium found — a manual `remotion render` would download one.',
      `  Install Google Chrome, or set ${CHROME_EXECUTABLE_ENV} to a Chrome/Chromium binary.`,
      '',
    ].join('\n')
  );
}

// Same rule for the encoder: never a Remotion-downloaded FFmpeg. Only set when
// `resolveFfmpegBinariesDirectory()` actually returns something (i.e. a local
// FFmpeg is needed *and* present); `undefined` leaves Remotion's default alone.
// See ./src/ffmpeg.ts for the macOS-12 background.
const localBinaries = resolveFfmpegBinariesDirectory();
if (localBinaries) {
  Config.setBinariesDirectory(localBinaries);
}
