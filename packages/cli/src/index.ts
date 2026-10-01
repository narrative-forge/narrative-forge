#!/usr/bin/env node
/**
 * @forge/cli — bin entry point.
 *
 * Thin wrapper: forwards argv to `run()` and maps its return value onto the
 * process exit code. All behaviour lives in `./cli` so it stays testable.
 */

import { run } from './cli.js';

export const PACKAGE_NAME = '@forge/cli';

run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
);
