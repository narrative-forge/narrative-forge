import { defineConfig } from 'vitest/config';

// Node-only tests: they spawn no browser, only assert on `run()` output and
// optionally exec the built binary (guarded by existsSync(dist)).
export default defineConfig({
  test: {
    environment: 'node',
  },
});
