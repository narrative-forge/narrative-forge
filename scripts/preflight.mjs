#!/usr/bin/env node
/**
 * preflight.mjs —— 渲染环境自检（零依赖，可在任意 macOS 上直接运行）
 *
 * 为什么需要它
 * ------------
 * Remotion 4.0.530 这条链上有一批**原生二进制**：Rust 合成器、FFmpeg、
 * esbuild（webpack 打包用）、biome（lint 用）、rspack、rollup。每个 Mach-O
 * 都自己声明了一个「最低可运行的 macOS 版本」（minos）。系统低于它时，dyld
 * 会在进程启动的瞬间拒绝加载，抛出的却是与源码毫不相干的错
 * （`Symbol not found` / `Abort trap: 6` / 子进程 spawn 失败）。
 *
 * 所以「这台机器能不能跑」不取决于 Remotion 的版本检查（它只会 print 一条
 * warning），而取决于**所有原生二进制的 minos 里最大的那一个**。
 *
 * 本脚本只读不写、不联网：解析 Mach-O 头，逐项与目标系统版本比对。
 *
 * 用法
 * ----
 *   node scripts/preflight.mjs                  # 以当前系统为基准
 *   node scripts/preflight.mjs --target=10.15   # 以指定 macOS 版本为基准
 *   node scripts/preflight.mjs --json           # 机器可读输出
 *   node scripts/preflight.mjs --repo=/path/to/narrative-forge
 */

import { execFileSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { cpus, release, tmpdir, totalmem } from 'node:os';
import { basename, join } from 'node:path';

// ---------------------------------------------------------------------------
// Mach-O：读出二进制自己声明的最低系统版本
// ---------------------------------------------------------------------------

const MH_MAGIC = 0xfeedface;
const MH_CIGAM = 0xcefaedfe;
const MH_MAGIC_64 = 0xfeedfacf;
const MH_CIGAM_64 = 0xcffaedfe;
const FAT_MAGIC = 0xcafebabe;
const FAT_MAGIC_64 = 0xcafebabf;
const LC_VERSION_MIN_MACOSX = 0x24;
const LC_BUILD_VERSION = 0x32;

const CPU_X86_64 = 0x01000007;
const CPU_ARM64 = 0x0100000c;

const PLATFORM_NAMES = {
  1: 'macOS',
  2: 'iOS',
  3: 'tvOS',
  4: 'watchOS',
  6: 'macCatalyst',
};

const SLICE_HEADER_BYTES = 32;
const SLICE_HEADER_BYTES_32 = 28;

function formatLoadVersion(raw) {
  return `${(raw >>> 16) & 0xffff}.${(raw >>> 8) & 0xff}.${raw & 0xff}`;
}

function archName(cpuType) {
  if (cpuType === CPU_X86_64) return 'x86_64';
  if (cpuType === CPU_ARM64) return 'arm64';
  if (cpuType === 7) return 'i386';
  if (cpuType === 12) return 'arm';
  return `cpu-${cpuType}`;
}

function parseSlice(fd, offset) {
  const header = Buffer.alloc(SLICE_HEADER_BYTES);
  readSync(fd, header, 0, SLICE_HEADER_BYTES, offset);

  const magic = header.readUInt32LE(0);
  const is64 = magic === MH_MAGIC_64 || magic === MH_CIGAM_64;
  const is32 = magic === MH_MAGIC || magic === MH_CIGAM;
  if (!is64 && !is32) return null;

  const littleEndian = magic === MH_MAGIC_64 || magic === MH_MAGIC;
  const readU32 = (buf, at) => (littleEndian ? buf.readUInt32LE(at) : buf.readUInt32BE(at));

  const cpuType = readU32(header, 4);
  const ncmds = readU32(header, 16);
  const sizeofcmds = readU32(header, 20);
  if (sizeofcmds <= 0 || sizeofcmds > 64 * 1024 * 1024) return null;

  const commands = Buffer.alloc(sizeofcmds);
  readSync(
    fd,
    commands,
    0,
    sizeofcmds,
    offset + (is64 ? SLICE_HEADER_BYTES : SLICE_HEADER_BYTES_32)
  );

  const slice = {
    arch: archName(cpuType),
    platform: null,
    minos: null,
    sdk: null,
    legacy: false,
  };

  let cursor = 0;
  for (let i = 0; i < ncmds; i += 1) {
    if (cursor + 8 > commands.length) break;
    const cmd = readU32(commands, cursor);
    const cmdsize = readU32(commands, cursor + 4);
    if (cmdsize < 8) break;

    if (cmd === LC_BUILD_VERSION && cursor + 24 <= commands.length) {
      const platform = readU32(commands, cursor + 8);
      slice.platform = PLATFORM_NAMES[platform] ?? `platform-${platform}`;
      slice.minos = formatLoadVersion(readU32(commands, cursor + 12));
      slice.sdk = formatLoadVersion(readU32(commands, cursor + 16));
    } else if (cmd === LC_VERSION_MIN_MACOSX && cursor + 16 <= commands.length) {
      // 老工具链（Rust/Go）产出的二进制走的是这条
      slice.platform = 'macOS';
      slice.minos = formatLoadVersion(readU32(commands, cursor + 8));
      slice.sdk = formatLoadVersion(readU32(commands, cursor + 12));
      slice.legacy = true;
    }

    cursor += cmdsize;
  }

  return slice;
}

function readMachO(file) {
  let fd = null;
  try {
    fd = openSync(file, 'r');
    const head = Buffer.alloc(8);
    readSync(fd, head, 0, 8, 0);
    const magic = head.readUInt32BE(0);

    if (magic === FAT_MAGIC || magic === FAT_MAGIC_64) {
      const count = head.readUInt32BE(4);
      const entrySize = magic === FAT_MAGIC_64 ? 32 : 20;
      if (count <= 0 || count > 64) return { error: '可疑的 fat 头' };

      const table = Buffer.alloc(count * entrySize);
      readSync(fd, table, 0, table.length, 8);

      const slices = [];
      for (let i = 0; i < count; i += 1) {
        const base = i * entrySize;
        const sliceOffset =
          magic === FAT_MAGIC_64
            ? Number(table.readBigUInt64BE(base + 8))
            : table.readUInt32BE(base + 8);
        const slice = parseSlice(fd, sliceOffset);
        if (slice) slices.push(slice);
      }
      return { fat: true, slices };
    }

    const slice = parseSlice(fd, 0);
    if (!slice) return { error: '不是 Mach-O' };
    return { fat: false, slices: [slice] };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

/** 取与本机架构匹配的那一片（fat 二进制里 x86_64 / arm64 的 minos 可能不同）。 */
function pickSlice(result) {
  if (!result || result.error || !result.slices || result.slices.length === 0) return null;
  const wanted = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  return result.slices.find((s) => s.arch === wanted) ?? result.slices[0];
}

function readMinimumOs(file) {
  if (!existsSync(file)) return { state: 'missing' };
  let target = file;
  try {
    target = realpathSync(file);
  } catch {
    // 软链断掉也无所谓，按原路径读
  }
  const result = readMachO(target);
  if (!result || result.error) return { state: 'error', reason: result?.error ?? '未知' };

  const slice = pickSlice(result);
  if (!slice || !slice.minos) return { state: 'error', reason: '未找到 minos' };

  return {
    state: 'ok',
    minos: slice.minos,
    arch: slice.arch,
    platform: slice.platform,
    sdk: slice.sdk,
    slices: result.slices.map((s) => `${s.arch}:${s.minos ?? '?'}`),
  };
}

// ---------------------------------------------------------------------------
// 版本比较
// ---------------------------------------------------------------------------

function parseVersion(text) {
  const parts = String(text)
    .split('.')
    .map((piece) => Number.parseInt(piece, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// 本机系统信息
// ---------------------------------------------------------------------------

const DARWIN_TO_MACOS = {
  19: '10.15 Catalina',
  20: '11 Big Sur',
  21: '12 Monterey',
  22: '13 Ventura',
  23: '14 Sonoma',
  24: '15 Sequoia',
  25: '26 Tahoe',
};

function commandOutput(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function detectSystem() {
  const darwinMajor = Number.parseInt(release().split('.')[0], 10);
  const fromSwVers = commandOutput('/usr/bin/sw_vers', ['-productVersion']);
  const productVersion = fromSwVers || '0.0';
  return {
    productVersion,
    displayName: DARWIN_TO_MACOS[darwinMajor] ?? `darwin ${darwinMajor}`,
    darwinMajor,
    arch: process.arch,
    cpuCount: cpus().length,
    memoryGb: Math.round(totalmem() / 1024 ** 3),
    tmpdir: tmpdir(),
  };
}

function detectNode() {
  return {
    version: process.version.replace(/^v/, ''),
    executable: process.execPath,
  };
}

function readPlistValue(plistPath, key) {
  const viaBuddy = commandOutput('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plistPath]);
  if (viaBuddy) return viaBuddy;
  return '';
}

const BROWSER_BUNDLES = [
  'Google Chrome.app/Contents/MacOS/Google Chrome',
  'Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  'Chromium.app/Contents/MacOS/Chromium',
  'Brave Browser.app/Contents/MacOS/Brave Browser',
  'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

function chromeCandidatePaths() {
  const home = process.env.HOME ?? '';
  const candidates = [];
  if (process.env.FORGE_CHROME_EXECUTABLE) candidates.push(process.env.FORGE_CHROME_EXECUTABLE);
  for (const bundle of BROWSER_BUNDLES) {
    candidates.push(`/Applications/${bundle}`);
    if (home) candidates.push(`${home}/Applications/${bundle}`);
  }
  return candidates;
}

function detectChrome() {
  for (const candidate of chromeCandidatePaths()) {
    if (!existsSync(candidate)) continue;
    const infoPlist = join(candidate, '..', '..', 'Info.plist');
    return {
      path: candidate,
      version: readPlistValue(infoPlist, 'CFBundleShortVersionString'),
      declaredMinimum: readPlistValue(infoPlist, 'LSMinimumSystemVersion'),
    };
  }
  return null;
}

const FFMPEG_DIR_CANDIDATES = ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', '/usr/bin'];

function detectFfmpeg() {
  const dirs = [];
  if (process.env.FORGE_FFMPEG_DIR) dirs.push(process.env.FORGE_FFMPEG_DIR);
  dirs.push(...FFMPEG_DIR_CANDIDATES);

  for (const dir of dirs) {
    const ffmpeg = join(dir, 'ffmpeg');
    const ffprobe = join(dir, 'ffprobe');
    if (existsSync(ffmpeg) || existsSync(ffprobe)) {
      return { dir, ffmpeg: existsSync(ffmpeg), ffprobe: existsSync(ffprobe) };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 工具链扫描
// ---------------------------------------------------------------------------

const INTERESTING_BASENAMES = new Set(['esbuild', 'biome', 'remotion', 'ffmpeg', 'ffprobe']);
const MAX_WALK_DEPTH = 7;

function findRepoRoot(startDir, explicit) {
  if (explicit) return existsSync(explicit) ? explicit : null;
  let dir = startDir;
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function walkForNativeBinaries(root) {
  const found = [];
  const visit = (dir, depth) => {
    if (depth > MAX_WALK_DEPTH) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      // 只扫 darwin 平台包：这样就排除了 .bin 软链、JS 包装脚本等非二进制。
      if (!full.includes('darwin')) continue;
      const name = entry.name;
      const isNativeModule = name.endsWith('.node');
      if (!INTERESTING_BASENAMES.has(name) && !isNativeModule) continue;
      try {
        if (statSync(full).size < 1024) continue; // 跳过 shell 包装
      } catch {
        continue;
      }
      found.push(full);
    }
  };
  visit(root, 0);
  return found;
}

/** 从 `.pnpm` 路径里抽出版本号，让报告更能读懂。 */
function describePackage(fullPath) {
  const marker = '/.pnpm/';
  const at = fullPath.indexOf(marker);
  if (at < 0) return basename(fullPath);
  const segment = fullPath.slice(at + marker.length).split('/')[0];
  return segment;
}

/** 把 `.pnpm` 里的包名映射成「干什么用的」，好用来看懂报告。 */
function classify(fullPath) {
  const pkg = describePackage(fullPath);
  const name = basename(fullPath);
  const version = pkg.split('@').pop();

  if (pkg.startsWith('@esbuild+darwin-x64@')) {
    return { group: '打包', label: `esbuild ${version}`, note: 'webpack 链用它转译 TSX' };
  }
  if (pkg.startsWith('@biomejs+cli-darwin-x64@')) {
    return { group: 'lint', label: `biome ${version}`, note: 'pnpm lint 用' };
  }
  if (pkg.startsWith('@rspack+binding-darwin-x64@')) {
    return { group: '打包', label: `rspack ${version}`, note: '另一条打包链（不用 esbuild）' };
  }
  if (pkg.startsWith('@rollup+rollup-darwin-x64@')) {
    return { group: '打包', label: `rollup ${version}`, note: 'vitest 用' };
  }
  if (pkg.startsWith('@remotion+compositor-darwin-x64@')) {
    const isCompositor = name === 'remotion';
    return {
      group: '渲染',
      label: `Remotion 自带 ${name}`,
      note: isCompositor ? 'Rust 合成器' : '可用 binariesDirectory 换成本机 ffmpeg',
      bypassable: !isCompositor,
    };
  }
  return { group: '其他', label: name, note: pkg };
}

// ---------------------------------------------------------------------------
// 各系统的已知天花板（静态参考资料，来源见 docs/reports/TASK-010）
// ---------------------------------------------------------------------------

function chromeCeilingFor(macosVersion) {
  if (compareVersions(macosVersion, '13') >= 0) return '最新版';
  if (compareVersions(macosVersion, '12') >= 0) return '150（macOS 12 已停止更新）';
  if (compareVersions(macosVersion, '11') >= 0) return '138';
  return '128';
}

function nodeAdviceFor(macosVersion) {
  if (compareVersions(macosVersion, '11') >= 0) return 'Node 22 及以上可用';
  return '最高只能用 Node 20（Node 22 的预编译包要求 macOS 11+）';
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = { target: null, json: false, repo: null };
  for (const arg of argv) {
    if (arg === '--json') options.json = true;
    else if (arg.startsWith('--target=')) options.target = arg.slice('--target='.length);
    else if (arg.startsWith('--repo=')) options.repo = arg.slice('--repo='.length);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const system = detectSystem();
  const target = options.target ?? system.productVersion;

  const components = [];

  // --- 运行时 ---
  const node = detectNode();
  const nodeBinary = readMinimumOs(node.executable);
  components.push({
    group: '运行时',
    label: `node ${node.version}`,
    state: nodeBinary.state,
    minos: nodeBinary.minos ?? null,
    detail: node.executable,
  });

  // --- 浏览器 ---
  const chrome = detectChrome();
  if (chrome) {
    const chromeBinary = readMinimumOs(chrome.path);
    components.push({
      group: '浏览器',
      label: `Chrome ${chrome.version || '?'}`,
      state: chromeBinary.state,
      minos: chromeBinary.minos ?? chrome.declaredMinimum ?? null,
      detail: chrome.path,
    });
  } else {
    components.push({
      group: '浏览器',
      label: 'Chrome',
      state: 'missing',
      minos: null,
      detail: '未找到；可用 FORGE_CHROME_EXECUTABLE 指定',
    });
  }

  // --- 编码器 ---
  const ffmpeg = detectFfmpeg();
  if (ffmpeg) {
    const ffmpegBinary = readMinimumOs(join(ffmpeg.dir, 'ffmpeg'));
    components.push({
      group: '编码器',
      label: `ffmpeg（${ffmpeg.dir}）`,
      state: ffmpegBinary.state,
      minos: ffmpegBinary.minos ?? null,
      detail: `ffprobe: ${ffmpeg.ffprobe ? '有' : '缺'}`,
    });
  } else {
    components.push({
      group: '编码器',
      label: 'ffmpeg',
      state: 'missing',
      minos: null,
      detail: '未找到；可用 FORGE_FFMPEG_DIR 指定（Remotion 自带那份在 macOS 15 以下加载不了）',
    });
  }

  // --- 仓库工具链 ---
  const repoRoot = findRepoRoot(process.cwd(), options.repo);
  const toolchain = [];
  if (repoRoot) {
    const pnpmDir = join(repoRoot, 'node_modules', '.pnpm');
    if (existsSync(pnpmDir)) {
      const natives = walkForNativeBinaries(pnpmDir).sort();
      const seen = new Set();
      for (const native of natives) {
        const binary = readMinimumOs(native);
        if (binary.state !== 'ok') continue; // 非 Mach-O（软链 / JS 包装）不计
        const info = classify(native);
        if (seen.has(info.label)) continue;
        seen.add(info.label);
        toolchain.push({
          group: info.group,
          label: info.label,
          note: info.note,
          minos: binary.minos,
          bypassable: info.bypassable === true,
        });
      }
    }
  }

  // --- 判定 ---
  const runtimeBlockers = components.filter(
    (c) => c.state === 'ok' && c.minos && compareVersions(target, c.minos) < 0
  );
  const toolchainBlockers = toolchain.filter(
    (c) => c.minos && compareVersions(target, c.minos) < 0
  );
  const blocking = toolchainBlockers.filter((c) => !c.bypassable);
  const bypassable = toolchainBlockers.filter((c) => c.bypassable);

  const report = {
    system,
    target,
    node,
    chrome,
    ffmpeg,
    repoRoot,
    components,
    toolchain,
    blockers: {
      runtime: runtimeBlockers.map((c) => `${c.label}（需要 macOS ${c.minos}）`),
      toolchain: blocking.map((c) => `${c.label}（需要 macOS ${c.minos}）`),
      bypassable: bypassable.map((c) => `${c.label}（需要 macOS ${c.minos}）`),
    },
    ceilings: {
      chrome: chromeCeilingFor(target),
      node: nodeAdviceFor(target),
    },
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = runtimeBlockers.length + blocking.length > 0 ? 1 : 0;
    return;
  }

  const line = (label, value) => process.stdout.write(`${label.padEnd(22, ' ')}${value}\n`);
  const rule = () => process.stdout.write(`${'-'.repeat(78)}\n`);

  process.stdout.write('\n渲染环境自检 · forge preflight\n');
  rule();
  line('系统', `${system.productVersion}（${system.displayName}）`);
  line('架构 / CPU', `${system.arch} / ${system.cpuCount} 核`);
  line('内存', `${system.memoryGb} GB`);
  line('判定基准', target === system.productVersion ? '当前系统' : `macOS ${target}`);
  rule();

  const verdictOf = (row) => {
    if (!row.minos) return '?';
    return compareVersions(target, row.minos) < 0 ? '✗' : '✓';
  };
  const minosOf = (row) => (row.minos ? `需要 macOS ${row.minos}` : `(${row.state})`);

  process.stdout.write('\n运行时 / 外部依赖\n');
  for (const component of components) {
    process.stdout.write(
      `  ${verdictOf(component)}  ${component.label.padEnd(30, ' ')}${minosOf(component).padEnd(
        22,
        ' '
      )}${component.detail}\n`
    );
  }

  if (toolchain.length > 0) {
    process.stdout.write('\n仓库工具链原生二进制\n');
    for (const row of toolchain) {
      const tag = row.bypassable ? '（可绕过）' : '';
      process.stdout.write(
        `  ${verdictOf(row)}  ${row.label.padEnd(30, ' ')}${minosOf(row).padEnd(22, ' ')}${
          row.note
        }${tag}\n`
      );
    }
  } else if (repoRoot) {
    process.stdout.write(
      '\n仓库工具链原生二进制\n  未在 node_modules/.pnpm 下找到原生二进制，先执行 pnpm install。\n'
    );
  } else {
    process.stdout.write(
      '\n仓库工具链原生二进制\n  未定位到仓库根（缺 pnpm-workspace.yaml），跳过。可用 --repo= 指定。\n'
    );
  }

  rule();
  process.stdout.write(`已知天花板（macOS ${target}）\n`);
  line('  Chrome 最高', report.ceilings.chrome);
  line('  Node', report.ceilings.node);
  rule();

  const blockerCount = runtimeBlockers.length + blocking.length;
  if (blockerCount === 0) {
    process.stdout.write('结论：当前系统满足全部必需二进制的最低要求。\n');
    if (bypassable.length > 0) {
      process.stdout.write(
        `      另有 ${bypassable.length} 项 Remotion 自带二进制超出系统要求，但已被本仓库的 binariesDirectory 机制绕过。\n`
      );
    }
    process.stdout.write('\n');
  } else {
    process.stdout.write(`结论：有 ${blockerCount} 项在当前系统上无法加载，且无现成绕行。\n`);
    for (const item of report.blockers.runtime) process.stdout.write(`  ✗ ${item}\n`);
    for (const item of report.blockers.toolchain) process.stdout.write(`  ✗ ${item}\n`);
    if (bypassable.length > 0) {
      process.stdout.write('\n以下项超出系统要求，但本仓库已绕过（binariesDirectory）：\n');
      for (const item of report.blockers.bypassable) process.stdout.write(`  ~ ${item}\n`);
    }
    process.stdout.write('\n');
  }

  process.exitCode = blockerCount > 0 ? 1 : 0;
}

main();
