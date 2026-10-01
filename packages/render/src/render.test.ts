import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSchedule } from '@forge/core';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { loadStory } from './loadStory';
import { renderStory } from './render';

// Remotion is mocked out: the unit tests cover the *pipeline* (loading,
// validation, prop preparation, result metrics), not actual frame encoding.
// R4 (file on disk) and R6 (determinism) are proven by the manual end-to-end
// run in TASK-008-report.md Step D, as the task package prescribes.
vi.mock('@remotion/bundler', () => ({
  bundle: vi.fn(async (_options?: unknown) => '/tmp/forge-fake-serve-url'),
}));

vi.mock('@remotion/renderer', () => ({
  selectComposition: vi.fn(async (_options?: unknown) => ({
    id: 'Timeline-huining',
    width: 1920,
    height: 1080,
    fps: 30,
    durationInFrames: 2942,
  })),
  renderMedia: vi.fn(async (options?: { outputLocation?: string | null }) => {
    const target = options?.outputLocation;
    if (typeof target === 'string') {
      // Stand in for the encoder so `statSync` in renderStory has a file.
      writeFileSync(target, Buffer.alloc(4096, 7));
    }
  }),
}));

const bundleMock = vi.mocked(bundle);
const selectCompositionMock = vi.mocked(selectComposition);
const renderMediaMock = vi.mocked(renderMedia);

const HERE = dirname(fileURLToPath(import.meta.url));
const HUINING = join(HERE, '..', '..', '..', 'stories', 'demo', 'huining-1936.json');

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'forge-render-test-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function tempStory(name: string, contents: unknown): string {
  const path = join(workDir, name);
  writeFileSync(path, JSON.stringify(contents));
  return path;
}

describe('loadStory — R1 / R2', () => {
  it('R1: throws with the offending path when storyPath does not exist', () => {
    const missing = join(workDir, 'nope', 'story.json');
    expect(() => loadStory(missing)).toThrow(missing);
  });

  it('R2: throws with the Zod path when the story violates the schema', () => {
    const bad = tempStory('bad-time.json', {
      meta: { title: 'T', resolution: '1920x1080', fps: 30 },
      views: [{ id: 'v1', type: 'timeline' }],
      nodes: [{ id: 'n1', type: 'event', label: 'A', time: '1936/06/01' }],
      edges: [],
      assets: [],
    });
    expect(() => loadStory(bad)).toThrow(/nodes\.0\.time/);
  });

  it('R2b: throws when the file is not JSON at all', () => {
    const path = join(workDir, 'not-json.json');
    writeFileSync(path, '{ this is not json');
    expect(() => loadStory(path)).toThrow(/not valid JSON/);
  });
});

describe('renderStory — R3 / R5 / progress', () => {
  it('R3: throws when viewId does not exist', async () => {
    await expect(
      renderStory({
        storyPath: HUINING,
        viewId: 'does-not-exist',
        outputPath: join(workDir, 'out.mp4'),
      })
    ).rejects.toThrow(/view "does-not-exist"/);
  });

  it('R5: durationInSec matches the schedule within 0.1s', async () => {
    const outputPath = join(workDir, 'huining.mp4');
    const result = await renderStory({
      storyPath: HUINING,
      viewId: 'main-timeline',
      outputPath,
    });

    const story = loadStory(HUINING);
    const schedule = buildSchedule(story.nodes);

    expect(Math.abs(result.durationInSec - schedule.totalSec)).toBeLessThan(0.1);
    expect(result.durationInFrames).toBe(Math.ceil(schedule.totalSec * 30));
    expect(result.outputPath).toBe(outputPath);
    expect(result.fileSizeBytes).toBeGreaterThan(0);
    expect(result.renderTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('wires Remotion: bundles the composition entry, selects it, renders h264', async () => {
    renderMediaMock.mockClear();
    bundleMock.mockClear();
    selectCompositionMock.mockClear();

    await renderStory({
      storyPath: HUINING,
      viewId: 'main-timeline',
      outputPath: join(workDir, 'huining2.mp4'),
    });

    expect(bundleMock).toHaveBeenCalledTimes(1);
    const bundleArgs = bundleMock.mock.calls[0]?.[0] as { entryPoint: string; outDir?: string };
    expect(bundleArgs.entryPoint).toMatch(/packages\/compositions\/src\/index\.ts$/);
    expect(bundleArgs.outDir).toBeTruthy();

    expect(selectCompositionMock).toHaveBeenCalledTimes(1);
    expect(renderMediaMock).toHaveBeenCalledTimes(1);
    const mediaArgs = renderMediaMock.mock.calls[0]?.[0] as {
      codec: string;
      imageFormat: string;
      outputLocation: string;
    };
    expect(mediaArgs.codec).toBe('h264');
    expect(mediaArgs.imageFormat).toBe('jpeg');
    expect(mediaArgs.outputLocation).toContain('huining2.mp4');
  });

  it('reports progress in [0, 1] and finishes at exactly 1', async () => {
    const seen: number[] = [];
    await renderStory({
      storyPath: HUINING,
      viewId: 'main-timeline',
      outputPath: join(workDir, 'huining3.mp4'),
      onProgress: (progress) => seen.push(progress),
    });

    expect(seen.length).toBeGreaterThan(0);
    for (const value of seen) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(seen.at(-1)).toBe(1);
  });
});
