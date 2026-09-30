import path from 'node:path';
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setConcurrency(4);

// ADR-004 ESM interop (Studio bundling): the workspace packages are emitted by
// `tsc` with extensionless relative imports and published as `"type": "module"`,
// which Webpack's strict resolution rejects (`fullySpecified`) inside the Studio
// bundler. Rather than relaxing `fullySpecified` (which Remotion re-asserts),
// we alias each `@forge/*` package to its **source** entry so Webpack resolves
// the extensionless `.ts`/`.tsx` imports through its TS loader. No published
// source is modified. When Studio is launched from packages/compositions, the
// sibling packages live one level up under packages/.
const srcOf = (pkg: string) => path.resolve(process.cwd(), '..', pkg, 'src', 'index.ts');

Config.overrideWebpackConfig((config) => {
  config.resolve = config.resolve ?? {};
  config.resolve.alias = {
    ...(config.resolve.alias as Record<string, string> | undefined),
    '@forge/kit': srcOf('kit'),
    '@forge/layouts': srcOf('layouts'),
    '@forge/core': srcOf('core'),
    '@forge/schema': srcOf('schema'),
  } as Record<string, string>;
  return config;
});
