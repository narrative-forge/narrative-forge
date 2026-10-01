/**
 * @forge/cli — command surface (TASK-008 Step C).
 *
 * `run()` is exported as a plain function so the CLI invariants (CLI1–CLI5)
 * can be asserted in-process, without spawning a subprocess and without
 * `process.exit()` killing the test runner. `src/index.ts` is a thin bin
 * wrapper that forwards `process.argv` and turns the returned code into the
 * process exit code.
 *
 * Constraint honoured: this package never imports `@remotion/*` — rendering
 * goes through `@forge/render`, and Studio is launched as an external process.
 */

import { constants, accessSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareTimelineProps } from '@forge/compositions/prepare';
import { loadStory, renderStory } from '@forge/render';
import chalk from 'chalk';
import { Command } from 'commander';
import { execa } from 'execa';
import ora from 'ora';

/** CLI4: `forge --version` prints exactly this. */
export const CLI_VERSION = '0.0.1';

export interface CliIO {
  out: (line: string) => void;
  err: (line: string) => void;
}

const defaultIO: CliIO = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
};

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Root of `@forge/compositions` — resolved from this module's location, so it
 * works from `dist/` (compiled) and from `src/` (tsx) alike, and no matter
 * which directory the user invokes `forge` from.
 */
const COMPOSITIONS_DIR = resolve(here, '..', '..', 'compositions');

/**
 * pnpm binary used to launch Studio. Overridable because `pnpm` is not always
 * on PATH (CI images, nvm/corepack shells); defaults to plain `pnpm`.
 */
const PNPM_BIN = process.env.FORGE_PNPM_BIN ?? 'pnpm';

/** CLI3: refuse early and loudly when the output path cannot be written. */
function assertWritableOutput(outputPath: string): void {
  const dir = dirname(resolve(outputPath));
  if (!existsSync(dir)) {
    throw new Error(`output directory does not exist: ${dir}`);
  }
  try {
    accessSync(dir, constants.W_OK);
  } catch {
    throw new Error(`output directory is not writable: ${dir}`);
  }
}

async function renderCommand(
  storyPath: string,
  opts: { view: string; out: string; fps?: string },
  io: CliIO
): Promise<number> {
  assertWritableOutput(opts.out);

  // Validated before any Remotion work starts (R1/R2 live in @forge/render).
  const story = loadStory(storyPath);
  const fps = opts.fps === undefined ? story.meta.fps : Number(opts.fps);
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`--fps must be a positive number, received "${opts.fps ?? ''}"`);
  }

  const spinner = ora({ text: 'Preparing composition…', stream: process.stderr }).start();
  try {
    const result = await renderStory({
      storyPath,
      viewId: opts.view,
      outputPath: resolve(opts.out),
      fps,
      onProgress: (progress) => {
        spinner.text = `Rendering ${Math.round(progress * 100)}%`;
      },
    });
    spinner.succeed(`Rendered ${result.durationInFrames} frames`);
    io.out(chalk.green(`✔ Output: ${result.outputPath}`));
    io.out(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    spinner.fail('Render failed');
    throw error;
  }
}

async function previewCommand(
  storyPath: string,
  opts: { view: string },
  io: CliIO
): Promise<number> {
  // CLI5: an invalid story must fail *before* a long-running Studio starts.
  const story = loadStory(storyPath);
  const props = prepareTimelineProps(story, opts.view, story.meta.fps);

  const propsDir = mkdtempSync(join(tmpdir(), 'forge-props-'));
  const propsPath = join(propsDir, 'props.json');
  writeFileSync(propsPath, JSON.stringify(props));

  io.out(chalk.cyan(`Starting Remotion Studio in ${COMPOSITIONS_DIR} …`));
  io.out(chalk.dim(`props: ${propsPath}`));
  io.out(chalk.dim('Press Ctrl+C to stop.'));

  try {
    await execa(PNPM_BIN, ['exec', 'remotion', 'studio', 'src/index.ts', '--props', propsPath], {
      cwd: COMPOSITIONS_DIR,
      stdio: 'inherit',
    });
    return 0;
  } finally {
    rmSync(propsDir, { recursive: true, force: true });
  }
}

/**
 * Run the CLI.
 *
 * @returns the process exit code — never calls `process.exit()` itself.
 */
export async function run(argv: string[], io: CliIO = defaultIO): Promise<number> {
  // CLI4
  if (argv.includes('--version') || argv.includes('-V')) {
    io.out(CLI_VERSION);
    return 0;
  }

  const program = new Command();
  program
    .name('forge')
    .description('Narrative Forge CLI — compile a story.json into an MP4.')
    .configureOutput({ writeOut: (s) => io.out(s.trimEnd()), writeErr: (s) => io.err(s.trimEnd()) })
    .exitOverride()
    .showHelpAfterError();

  program
    .command('render')
    .description('Render a story view to MP4')
    .argument('<story>', 'path to story.json')
    .requiredOption('--view <viewId>', 'view id to render')
    .requiredOption('--out <file>', 'output MP4 path')
    .option('--fps <number>', 'frame rate (defaults to meta.fps)')
    .action(async (story: string, opts) => {
      await renderCommand(story, opts, io);
    });

  program
    .command('preview')
    .description('Open the story in Remotion Studio')
    .argument('<story>', 'path to story.json')
    .option('--view <viewId>', 'view id to preview', 'main-timeline')
    .action(async (story: string, opts) => {
      await previewCommand(story, opts, io);
    });

  // CLI1: with no arguments the help must name the registered subcommands, so
  // this runs after they are attached.
  if (argv.length === 0) {
    program.outputHelp();
    return 0;
  }

  try {
    await program.parseAsync(argv, { from: 'user' });
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.err(chalk.red(`✖ ${message}`));
    return 1;
  }
}
