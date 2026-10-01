/**
 * @forge/render — story loading + validation.
 *
 * The only place that touches `story.json` on disk. Split out from the
 * pipeline so both R1 (missing file) and R2 (schema violation) are testable
 * without booting Remotion, and so `@forge/cli` can validate a story before it
 * spends time starting a Studio or a render.
 */

import { existsSync, readFileSync } from 'node:fs';

import { StorySchema } from '@forge/schema';
import type { Story } from '@forge/schema';

/** R1: a missing file must fail with the offending path in the message. */
function failMissing(storyPath: string): never {
  throw new Error(`story file not found: ${storyPath}`);
}
/**
 * Read and validate a story.json file.
 *
 * @throws if the file does not exist (R1) or fails `StorySchema` (R2 — the
 * error message lists the offending Zod paths, e.g. `nodes.1.time`).
 */
export function loadStory(storyPath: string): Story {
  if (!existsSync(storyPath)) {
    return failMissing(storyPath);
  }

  const raw = readFileSync(storyPath, 'utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`story file is not valid JSON: ${storyPath} — ${reason}`);
  }

  const result = StorySchema.safeParse(parsed);
  if (!result.success) {
    const paths = result.error.issues.map((issue) => issue.path.join('.') || '<root>');
    const first = result.error.issues[0]?.message ?? 'unknown validation error';
    throw new Error(
      `story schema validation failed: ${storyPath}\n` +
        `  invalid paths: ${[...new Set(paths)].join(', ')}\n` +
        `  first issue: ${first}`
    );
  }

  return result.data;
}
