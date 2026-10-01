import { defineConfig } from 'vitest/config';

// Package-scoped test config, mirroring @forge/schema: the repo-root vitest
// config uses a root-relative glob that only matches when vitest runs from the
// monorepo root, so `pnpm --filter @forge/cli test` needs its own.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
