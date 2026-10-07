/**
 * @forge/compositions — local Chrome resolution (no download, by design).
 *
 * Remotion, by default, renders with a browser it manages itself: it looks for
 * its own `chrome-headless-shell` build and **downloads it if missing**. That
 * is unacceptable for us on two counts:
 *
 *   - renders must work on a machine that is offline or behind a proxy, and
 *   - a browser silently appearing inside `node_modules` / the Remotion cache
 *     is a supply-chain and reproducibility surprise, not a convenience.
 *
 * So resolving the browser is an explicit, local-only operation:
 *
 *   `FORGE_CHROME_EXECUTABLE`  →  platform default locations  →  hard error.
 *
 * It never falls through to a download. `@forge/render` additionally passes an
 * `onBrowserDownload` hook that throws, so even if a future Remotion release
 * decided to fetch a browser anyway, the render would fail loudly instead of
 * quietly pulling ~150 MB from the network.
 *
 * Why it lives in `@forge/compositions`: exactly like `webpackOverride.ts`, it
 * is build/render tooling that two consumers must agree on — `remotion.config.ts`
 * (the `remotion` CLI path) and `@forge/render` (the programmatic path).
 * Duplicating it would let the two paths drift apart (风险二).
 *
 * Paths are probed with `existsSync`, never `process.cwd()`-relative.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Escape hatch: point this at any Chrome/Chromium binary to skip probing. */
export const CHROME_EXECUTABLE_ENV = 'FORGE_CHROME_EXECUTABLE';

/** Conventional locations, most-preferred first, per platform. */
function candidatePaths(): string[] {
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      join(homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }

  if (process.platform === 'win32') {
    const roots = [
      process.env.PROGRAMFILES,
      process.env['PROGRAMFILES(X86)'],
      process.env.LOCALAPPDATA,
    ].filter((root): root is string => Boolean(root));

    return [
      ...roots.map((root) => join(root, 'Google', 'Chrome', 'Application', 'chrome.exe')),
      ...roots.map((root) => join(root, 'Chromium', 'Application', 'chrome.exe')),
    ];
  }

  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/opt/google/chrome/chrome',
  ];
}

/**
 * First locally installed Chrome/Chromium, or `null` when there is none.
 *
 * A set-but-invalid `FORGE_CHROME_EXECUTABLE` throws rather than being ignored:
 * silently rendering with a different browser than the one the user asked for
 * is the kind of surprise that costs an afternoon.
 */
export function findChromeExecutable(): string | null {
  const override = process.env[CHROME_EXECUTABLE_ENV]?.trim();
  if (override) {
    if (!existsSync(override)) {
      throw new Error(
        [
          `${CHROME_EXECUTABLE_ENV} points at "${override}", which does not exist.`,
          'Fix the path, or unset the variable to fall back to auto-detection.',
        ].join(' ')
      );
    }
    return override;
  }

  return candidatePaths().find((candidate) => existsSync(candidate)) ?? null;
}

/**
 * Same as {@link findChromeExecutable}, but a missing browser is fatal.
 *
 * The error text is the whole UX for "you have no Chrome": it says what was
 * searched, what to do about it, and that downloading is deliberately off — so
 * nobody has to read Remotion's source to find out why nothing happened.
 */
export function resolveChromeExecutable(): string {
  const found = findChromeExecutable();
  if (found) {
    return found;
  }

  throw new Error(
    [
      'No local Chrome or Chromium was found, and Narrative Forge never downloads a browser.',
      `Install Google Chrome, or set ${CHROME_EXECUTABLE_ENV} to a Chrome/Chromium executable.`,
      `Searched: ${candidatePaths().join(', ')}`,
    ].join(' ')
  );
}
