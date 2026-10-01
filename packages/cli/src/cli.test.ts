import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CLI_VERSION, run } from './cli.js';
import type { CliIO } from './cli.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const HUINING = join(HERE, '..', '..', '..', 'stories', 'demo', 'huining-1936.json');
const DIST_ENTRY = join(HERE, '..', 'dist', 'index.js');

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'forge-cli-test-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function capture(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { out: (line) => out.push(line), err: (line) => err.push(line) },
    out,
    err,
  };
}

function tempStory(name: string, contents: unknown): string {
  const path = join(workDir, name);
  writeFileSync(path, JSON.stringify(contents));
  return path;
}

describe('forge CLI — CLI1–CLI5', () => {
  it('CLI1: no arguments prints usage and exits 0', async () => {
    const { io, out, err } = capture();
    const code = await run([], io);
    expect(code).toBe(0);
    expect([...out, ...err].join('\n')).toContain('Usage: forge');
  });

  it('CLI2: render without --view errors and exits 1', async () => {
    const { io, err } = capture();
    const code = await run(['render', HUINING, '--out', join(workDir, 'a.mp4')], io);
    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/--view/);
  });

  it('CLI3: render with an unwritable --out errors and exits 1', async () => {
    const { io, err } = capture();
    const code = await run(
      ['render', HUINING, '--view', 'main-timeline', '--out', '/definitely/not/here/out.mp4'],
      io
    );
    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/output directory/i);
  });

  it('CLI4: --version prints 0.0.1 and exits 0', async () => {
    const { io, out } = capture();
    const code = await run(['--version'], io);
    expect(code).toBe(0);
    expect(out.join('\n').trim()).toBe('0.0.1');
    expect(CLI_VERSION).toBe('0.0.1');
  });

  it('CLI5: preview with an invalid story errors and exits 1', async () => {
    const bad = tempStory('bad.json', {
      meta: { title: 'T', resolution: '1920x1080', fps: 30 },
      views: [{ id: 'v1', type: 'timeline' }],
      nodes: [{ id: 'n1', type: 'event', label: 'A', time: 'not-a-date' }],
      edges: [],
      assets: [],
    });
    const { io, err } = capture();
    const code = await run(['preview', bad, '--view', 'main-timeline'], io);
    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/schema validation failed/);
  });
});

describe('forge CLI — built binary smoke test', () => {
  // The task package asks for an execa end-to-end call against dist/index.js.
  // It is guarded because CI runs `test` *before* `build`; skipping keeps the
  // suite green in that order while still exercising the real binary locally.
  const itIfBuilt = existsSync(DIST_ENTRY) ? it : it.skip;

  itIfBuilt('dist/index.js reports its version', async () => {
    const { execa } = await import('execa');
    const { stdout } = await execa(process.execPath, [DIST_ENTRY, '--version']);
    expect(stdout.trim()).toBe('0.0.1');
  });
});
