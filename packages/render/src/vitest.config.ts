import { defineConfig } from 'vitest/config';

// Node-only tests: they touch the filesystem (mkdtempSync, readFileSync) and
// import `import.meta.url`; no DOM is needed.
export default defineConfig({
  test: {
    environment: 'node',
  },
});
