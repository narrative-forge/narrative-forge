import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { NodeId, Story } from './types.js';
import { StorySchema } from './zod.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// Decision 4: the demo story is the single source of truth. We read the
// canonical file via a relative path rather than ESM-importing it, because
// the schema package pins `rootDir: ./src` and `stories/` lives outside
// that root — an ESM import would trip `tsc -b` (TS6059) and break
// `typecheck`/`build`. Reading the same file at runtime keeps one copy.
const huiningPath = join(HERE, '..', '..', '..', 'stories', 'demo', 'huining-1936.json');

function loadHuining(): unknown {
  return JSON.parse(readFileSync(huiningPath, 'utf-8'));
}

/** Minimal valid story used as the base for negative-case tests. */
type RawStory = {
  meta: Record<string, unknown>;
  views: unknown[];
  nodes: Array<Record<string, unknown>>;
  edges: unknown[];
  assets: unknown[];
};

function baseStory(): RawStory {
  return {
    meta: { title: 'T', resolution: '1920x1080', fps: 30 },
    // 0.1.1: `duration` no longer exists on a view — see the rejection test
    // in "StorySchema — 0.1.1 breaking change" below.
    views: [{ id: 'v1', type: 'timeline', layout: 'horizontal' }],
    nodes: [
      { id: 'n1', type: 'event', label: 'A', time: '1936-06-01' },
      { id: 'n2', type: 'event', label: 'B', time: '1936-07-01' },
    ],
    edges: [{ from: 'n1', to: 'n2', type: 'temporal' }],
    assets: [],
  };
}

function issuePaths(raw: unknown): string[] {
  const result = StorySchema.safeParse(raw);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => issue.path.join('.'));
}

describe('StorySchema — huining-1936 demo (B6-1)', () => {
  it('parses the canonical huining-1936 story', () => {
    const story: Story = StorySchema.parse(loadHuining());
    expect(story.views).toHaveLength(1);
    expect(story.views[0]?.type).toBe('timeline');
    expect(story.nodes).toHaveLength(8);
    expect(story.edges).toHaveLength(7);
    // Q-11: featured flags the headline assembly events.
    const featured = story.nodes.filter((node) => node.featured === true);
    expect(featured.length).toBeGreaterThanOrEqual(1);
    // derived NodeId type is usable as a value.
    const ids: NodeId[] = story.nodes.map((node) => node.id);
    expect(ids[0] ?? '').toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
});

describe('StorySchema — negative cases', () => {
  it('rejects a story missing meta.title and points at meta.title (B6-2)', () => {
    const raw = baseStory();
    raw.meta.title = undefined;
    expect(issuePaths(raw)).toContain('meta.title');
  });

  it('reports a malformed time on the offending node (B6-3)', () => {
    const raw = baseStory();
    const bad = raw.nodes[1];
    if (bad) {
      bad.time = '1936/06/01';
    }
    expect(issuePaths(raw)).toContain('nodes.1.time');
  });

  it('rejects a node.media reference with no matching asset (B6-4)', () => {
    const raw = baseStory();
    raw.nodes.push({
      id: 'n3',
      type: 'event',
      label: 'C',
      time: '1936-08-01',
      media: ['asset-missing'],
    });
    expect(issuePaths(raw)).toContain('nodes.2.media');
  });

  it('rejects an empty views array (B6-5)', () => {
    const raw = baseStory();
    raw.views = [];
    expect(issuePaths(raw)).toContain('views');
  });

  it('rejects an unsupported fps value like 25 (B6-6)', () => {
    const raw = baseStory();
    raw.meta.fps = 25;
    expect(issuePaths(raw)).toContain('meta.fps');
  });
});

describe('StorySchema — 0.1.1 breaking change (TASK-008 Step A)', () => {
  it('rejects the removed View seconds field, pointing at views.0.duration', () => {
    const raw = baseStory();
    const view = raw.views[0] as Record<string, unknown>;
    view.duration = 30;
    expect(issuePaths(raw)).toContain('views.0.duration');
  });

  it('does not silently strip the removed View seconds field', () => {
    const raw = baseStory();
    const view = raw.views[0] as Record<string, unknown>;
    view.duration = 30;
    expect(StorySchema.safeParse(raw).success).toBe(false);
  });

  it('still accepts a view that carries no duration at all', () => {
    const raw = baseStory();
    expect(StorySchema.safeParse(raw).success).toBe(true);
  });

  it('parses the demo story after the View seconds field was deleted', () => {
    const story = StorySchema.parse(loadHuining());
    const view = story.views[0];
    expect(view).toBeDefined();
    expect(Object.keys(view ?? {})).not.toContain('duration');
  });
});
