import { defineConfig } from 'vitest/config';

// Package-scoped test config so `pnpm --filter @forge/core test` resolves its
// specs from this package's own root (the repo-root vitest config uses a
// root-relative glob that only matches when vitest runs from the monorepo
// root). This does not alter the repo-root config, CI, package.json scripts,
// or tsconfig. Mirrors packages/schema/vitest.config.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
