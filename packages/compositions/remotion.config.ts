import { Config } from '@remotion/cli/config';

import { forgeWebpackOverride } from './src/webpackOverride';

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
