# TASK-010 报告 —— 老 macOS 上的可行性边界（以 Mid-2012 Mac Pro / 10.15 为例）

> 起因：渲染管线在本机（macOS 12.7.6 / 4 GB MacBook Air）已端到端跑通（见 TASK-009）。
> 但换到另一台机器 —— **Mid-2012 Mac Pro，macOS 10.15.7（Catalina）** —— 始终跑不过。
> 本报告回答一个问题：**这台机器到底是"某一处配置错了"，还是"整条链的系统门槛高过它"。**

---

## 0. 结论（先看这段）

**是后者。这不是配置问题，是系统版本问题。**

Remotion 4.0.530 这条链上有一批**原生二进制**，每个 Mach-O 都自己声明了「最低可运行的
macOS 版本」（minos）。系统低于它时，dyld 在进程启动的瞬间就拒绝加载，抛出的却是与源码
毫不相干的错（`Symbol not found` / `Abort trap: 6` / 子进程 spawn 失败），所以看起来像
"配置没对"，实际是"装不上"。

在 macOS 10.15 上，**四个硬门**同时关闭：

| 组件 | 实测 minos | 10.15 结果 |
|---|---|---|
| Node 22（官方预编译包 / WorkBuddy 托管构建） | **11.0** | ✗ 起不来 |
| biome 1.5.3（`pnpm lint`） | **11.0** | ✗ 起不来 |
| esbuild 0.28.1（`@remotion/bundler` 的直接依赖，webpack 链靠它转译 TSX） | **12.0** | ✗ 起不来 |
| Google Chrome（10.15 上的版本上限） | 128 的 minos = 10.15 | ✗ 得降到 128，装不到更新的 |

另有一项**已被本仓库绕过**：Remotion 自带的 ffmpeg/ffprobe minos = **15.0**，在 macOS 15 以下
一律加载不了 —— 这正是 TASK-009 的「故障 C」，本项目用 `binariesDirectory` 换成本机 ffmpeg
解决，已在代码里落地。

**最低可行系统版本 = macOS 12.0**（取所有必需 minos 的最大值，即 esbuild 0.28.1）。
也就是说：**升到 macOS 12 之后，这份代码一行都不用改就能跑。**

---

## 1. 方法：为什么不能看版本号，要看二进制

有两件事容易误判，先说清楚。

### 1.1 Remotion 自己的系统检查只是 warning

`@remotion/renderer` 里有：

```js
var MIN_DARWIN_VERSION = 24;                    // darwin 24 = macOS 15
var MIN_MACOS_DISPLAY_VERSION = '15 (Sequoia)';
var checkMacOSVersion = (logLevel, indent) => {
  if (process.platform !== 'darwin') return;
  const majorVersion = Number(os.release().split('.')[0]);
  if (Number.isNaN(majorVersion) || majorVersion >= MIN_DARWIN_VERSION) return;
  Log.warn({ ... }, `Your macOS version is older than macOS ${MIN_MACOS_DISPLAY_VERSION}. Some features such as rendering may not work.`);
};
```

是 `Log.warn`，**不是抛错**。我们那台 macOS 12.7.6（darwin 21 < 24）就完整渲出了 2942 帧。
所以**不要把这条 warning 当成失败原因**。

### 1.2 真正卡人的是每个二进制自己的 minos

Mach-O 头里有两个字段记录这件事：

- 新工具链产物 → `LC_BUILD_VERSION.minos`
- 老工具链产物（Rust / Go 常见）→ `LC_VERSION_MIN_MACOSX.version`

系统版本低于它，dyld 直接拒绝映射。**判据是「所有必需二进制的 minos 里最大的那个」**，
不是 Remotion 声明的版本，也不是 npm 的 `engines`。

本报告全部数据用 `vtool -show-build` / `otool -l` 从**实际安装的二进制**读出，逐条可复现。

---

## 2. 实测矩阵

测量环境：**macOS 12.7.6 / x86_64 / 4 核 / 4 GB**（TASK-009 跑通的那台）。

| 组件 | 来源包 | 最低 macOS（实测） | 10.15 | 12 | 判定方式 |
|---|---|---|---|---|---|
| Remotion Rust 合成器 `remotion` | `@remotion/compositor-darwin-x64@4.0.530` | 10.12 | ✓ | ✓ | `LC_VERSION_MIN_MACOSX` |
| Remotion 自带 `ffmpeg` | 同上 | **15.0** | ✗ | ✗ | `LC_BUILD_VERSION` |
| Remotion 自带 `ffprobe` | 同上 | **15.0** | ✗ | ✗ | `LC_BUILD_VERSION` |
| `biome` 1.5.3 | `@biomejs/cli-darwin-x64@1.5.3` | **11.0** | ✗ | ✓ | `LC_BUILD_VERSION` |
| `esbuild` 0.21.5（vite / vitest） | `@esbuild/darwin-x64@0.21.5` | 10.13 | ✓ | ✓ | `LC_BUILD_VERSION` |
| `esbuild` 0.28.1（webpack 链） | `@esbuild/darwin-x64@0.28.1` | **12.0** | ✗ | ✓ | `LC_BUILD_VERSION` |
| `rollup` 4.63.5 | `@rollup/rollup-darwin-x64@4.63.5` | 10.13 | ✓ | ✓ | `LC_VERSION_MIN_MACOSX` |
| `rspack` binding 1.7.11 | `@rspack/binding-darwin-x64@1.7.11` | 10.12 | ✓ | ✓ | `LC_VERSION_MIN_MACOSX` |
| `fsevents` 2.3.3 | `fsevents@2.3.3` | x86_64: 10.15 / arm64: 11.0（fat） | ✓ x64 | ✓ | `LC_BUILD_VERSION` ×2 |
| `node` 22.22.2 | WorkBuddy 托管构建 | **11.0** | ✗ | ✓ | `LC_BUILD_VERSION` |
| Google Chrome 150 | 本机 `/Applications` | 12.0 | ✗ | ✓ | `LC_BUILD_VERSION` |
| 本机可用 ffmpeg / ffprobe | `/Applications/微信秒剪特效.app/...` | 12.0 | ✗ | ✓ | `LC_BUILD_VERSION` |

两个观察：

1. **npm 的 `engines` 完全帮不上忙。** 仓库声明 `node >=18.17`，而 Node 22 的二进制本身
   要求 macOS 11 —— 声明是「允许用」，二进制是「装不上」，两回事。
2. **Rust / Go 产的二进制反而宽容**（10.12、10.13）。最先崩的是 Node、biome、esbuild 这三个
   用新 LLVM 工具链构建的。

---

## 3. 10.15 上的四个硬门，逐个对策

### 门 1：Node

- 事实：Node 22 的预编译包为 **macOS 11.0** 构建（nodejs/build#3876 明确记录
  「Node 20 / 22 在 macOS 11 上测试与发布」；我们手上这份二进制实测 minos 11.0 与之吻合）。
- 对策：**装 Node 20**（最后一代支持 Catalina 的 LTS，满足仓库 `>=18.17`）。
  只跑渲染的话 Node 20 完全够。

### 门 2：biome 1.5.3（只影响 `pnpm lint`）

- 事实：minos 11.0，10.15 上起不来。
- 对策：**要么在那台机器上不跑 lint**（CI 在 GitHub 上跑，不影响渲染），
  **要么把 biome 降到 minos ≤ 10.15 的版本** —— 具体哪一版能过，用 `scripts/preflight.mjs`
  换版本后实测，不靠猜。

### 门 3：esbuild 0.28.1（影响 `bundle()`，这是渲染的必经步骤）

- 事实：`@remotion/bundler@4.0.530` 的**直接依赖就是 `esbuild: 0.28.1`**（精确版本），
  而它的 webpack 配置用 `esbuild-loader` 转译 TSX：

  ```js
  // @remotion/bundler/dist/webpack-config.js
  const esbuildLoaderOptions = { target: 'chrome85', loader: 'tsx', implementation: esbuild, remotionRoot };
  ```

  minos 12.0 → 10.15 上 `bundle()` 必挂。
- 对策：**改走 rspack 打包链。** Remotion 4.0.530 的 bundler 同时带了 `webpack` 和
  `@rspack/core`，且 `rspack` 是公开选项：

  ```ts
  // @remotion/bundler/dist/bundle.d.ts
  type MandatoryBundleInternalsOptions = {
    rspack: boolean;
    webpackOverride: WebpackOverrideFn;
    rspackOverride: RspackOverrideFn;
    ...
  };
  export type BundleOptions = { entryPoint: string } & Partial<NewBundleOptions> & Partial<MandatoryBundleInternalsOptions>;
  ```

  rspack 链（`rspack-config.js`）**只用 `@rspack/core`，不 require esbuild** ——
  已核对：bundler 全量 dist 里 require esbuild 的只有 `esbuild-loader/index.js`、
  `index.js`、`webpack-config.js` 三个文件，rspack 路径不在其中。
  而 `@rspack/binding-darwin-x64@1.7.11` 的 minos 是 **10.12** —— 10.15 上能跑。

  ⚠️ 这条**尚未端到端验证**（无法在本机模拟 10.15）。要用就得在那台机器上真跑一遍。

### 门 4：Chrome

- 事实：Chrome 128 是最后支持 macOS 10.15 的版本，Chrome 129（2024-09-17 发布）起要求
  macOS 11+。Google 官方帮助中心 2024-08-09 的公告与维基百科版本表一致。
- 对策：装 **Chrome for Testing 128.0.6613.x (mac-x64)**。
  已实测该包可下载（HTTP 200）：

  ```
  https://storage.googleapis.com/chrome-for-testing-public/128.0.6613.119/mac-x64/chrome-mac-x64.zip
  https://storage.googleapis.com/chrome-for-testing-public/128.0.6613.137/mac-x64/chrome-mac-x64.zip
  ```

  下载后解压，用本仓库已有的 `FORGE_CHROME_EXECUTABLE` 指过去即可，无需改代码。

### 已绕过项：Remotion 自带 ffmpeg / ffprobe

- 事实：minos **15.0**。这意味着**不只是 10.15 不行 —— macOS 12/13/14 也都不行**。
  Remotion 4.0.530 发布的 FFmpeg 就是按 macOS 15 构建的。
- 对策：已在 TASK-009 落地 —— `binariesDirectory` + `FORGE_FFMPEG_DIR` 指向本机 ffmpeg。
  注意本机那份（`微信秒剪特效.app` 里的）minos 是 **12.0**，所以它在 10.15 上同样不能用，
  Mac Pro 需要另找一份 minos ≤ 10.15 的静态 ffmpeg。

---

## 4. 三条出路

### 路线 A（推荐）：OCLP 升到 macOS 12 Monterey

**理由：macOS 12 恰好是「本仓库当前这份代码零改动即可运行」的最低版本。**

升到 12 之后四个硬门全开：

| 门 | 10.15 | 12 |
|---|---|---|
| node 22（需 11） | ✗ | ✓ |
| biome 1.5.3（需 11） | ✗ | ✓ |
| esbuild 0.28.1（需 12） | ✗ | ✓ |
| Chrome | 上限 128 | 上限 150 |

- 方法：OpenCore Legacy Patcher（社区方案，非 Apple 官方）。
- **前提：必须换一块 Metal 显卡。** Mac Pro 5,1 原装的 Radeon HD 5770 是 TeraScale 2，
  不支持 Metal，而 macOS 12 起非 Metal 显卡无法正常驱动。经典可选项：Mac 版 HD 7950、
  Mac-flashed HD 7970、Radeon RX 580（注意 8-pin 供电转接）。
- 注意：Mac Pro 5,1 原生最高就是 10.15.7 —— **这台机器已经跑到官方支持的天花板了**，
  再往上必须靠 OCLP。
- 升级前务必完整备份。

### 路线 B：装 Linux（Ubuntu 22.04 LTS）当专用渲染机

- Remotion 官方支持 Linux（要求 libc ≥ 2.35，即 Ubuntu 22.04+），**不需要换显卡**。
- 2012 Mac Pro 的 6 核 Xeon + 大内存很适合做渲染节点，且从此不再有系统版本天花板。
- 代价：macOS 上的编辑工作流与 Linux 渲染机分离，需要两边同步仓库。

### 路线 C：留在 10.15，逐项降级锁定

需要同时做四件事：Node 20、Chrome 128、biome 降版、esbuild 换 rspack、另找老版 ffmpeg。
每一环都在对抗仓库固定版本与 CI，且 Remotion 官方不支持 macOS 10.15。
**除非完全不能动机器的系统，否则不建议。**

---

## 5. 自检工具

新增 `scripts/preflight.mjs`（零依赖，可在任意 macOS 上直接跑）：

```bash
# 以当前系统为基准
node scripts/preflight.mjs

# 问「这台机器放到 10.15 上会怎样」
node scripts/preflight.mjs --target=10.15

# 机器可读
node scripts/preflight.mjs --json
```

它只读不写、不联网：解析每个原生二进制的 Mach-O 头，读出 minos，与目标系统逐项比对，
最后给出「几项无法加载、哪几项、有没有现成绕行」。退出码 0 = 全通过，1 = 有硬阻断。

在新机器上排查，**第一步就跑它**，而不是逐个组件试错。

### 本机验证记录（macOS 12.7.6，基准 = 当前系统）

```
运行时 / 外部依赖
  ✓  node 22.22.2                  需要 macOS 11.0.0
  ✓  Chrome 150.0.7871.125         需要 macOS 12.0.0
  ?  ffmpeg                        (missing)  未找到；可用 FORGE_FFMPEG_DIR 指定

仓库工具链原生二进制
  ✓  biome 1.5.3                   需要 macOS 11.0.0
  ✓  esbuild 0.21.5                需要 macOS 10.13.0
  ✓  esbuild 0.28.1                需要 macOS 12.0.0
  ✗  Remotion 自带 ffmpeg            需要 macOS 15.0.0   （可绕过）
  ✗  Remotion 自带 ffprobe           需要 macOS 15.0.0   （可绕过）
  ✓  Remotion 自带 remotion          需要 macOS 10.12.0
  ✓  rollup 4.63.5                 需要 macOS 10.13.0
  ✓  rspack 1.7.11                 需要 macOS 10.12.0

结论：当前系统满足全部必需二进制的最低要求。
      另有 2 项 Remotion 自带二进制超出系统要求，但已被 binariesDirectory 机制绕过。
EXIT=0
```

### 同一份工具链，基准换成 10.15

```
运行时 / 外部依赖
  ✗  node 22.22.2                  需要 macOS 11.0.0
  ✗  Chrome 150.0.7871.125         需要 macOS 12.0.0
  ?  ffmpeg                        (missing)

仓库工具链原生二进制
  ✗  biome 1.5.3                   需要 macOS 11.0.0
  ✓  esbuild 0.21.5                需要 macOS 10.13.0
  ✗  esbuild 0.28.1                需要 macOS 12.0.0
  ✗  Remotion 自带 ffmpeg            需要 macOS 15.0.0   （可绕过）
  ✗  Remotion 自带 ffprobe           需要 macOS 15.0.0   （可绕过）
  ✓  Remotion 自带 remotion          需要 macOS 10.12.0
  ✓  rollup 4.63.5                 需要 macOS 10.13.0
  ✓  rspack 1.7.11                 需要 macOS 10.12.0

已知天花板（macOS 10.15）
  Chrome 最高           128
  Node                最高只能用 Node 20

结论：有 4 项在当前系统上无法加载，且无现成绕行。
EXIT=1
```

> 表中 Chrome 那一行读的是**本机实际装着的** Chrome 150，所以在 10.15 基准下自然为 ✗。
> 在 Mac Pro 上换成 Chrome 128 之后，该行会变成 ✓。

---

## 6. 事实来源

| 结论 | 来源 |
|---|---|
| Chrome 128 是最后支持 macOS 10.15 的版本；129（2024-09-17）起要求 macOS 11+ | Google Chrome 帮助中心社区公告（2024-08-09） |
| Chrome 在 10.15 / 11 / 12 上的版本上限 = 128 / 138 / 150 | 维基百科 Google Chrome 版本表 |
| Node 20 / 22 在 macOS 11 上测试与发布；Node 18 在 10.15 上测试 | nodejs/build issue #3876 |
| Node 22 预编译二进制为 macOS 11.0 构建，10.15 装不了 | 同上 + 本机二进制实测 minos 11.0 |
| Remotion 官方要求 macOS 15（Sequoia）或更新 | remotion.dev 官方文档「System requirements」 |
| `MIN_DARWIN_VERSION = 24` 仅是 `Log.warn` | 本机 `@remotion/renderer@4.0.530/dist` 源码 |
| Mac Pro 5,1 做 macOS 12+ 需要 Metal 显卡 | OpenCore Legacy Patcher 支持机型表 |
| Chrome for Testing 128 (mac-x64) 可下载 | HTTP 200 实测（§3 门 4） |

所有 minos 数值均为本机 `vtool -show-build` / `otool -l` 实测，可用 `scripts/preflight.mjs` 复现。

---

## 7. 待办

- [ ] 在 Mac Pro 上跑 `node scripts/preflight.mjs`，把输出留档 —— 这是唯一能确认「实际装机状态」的动作。
- [ ] 确认走哪条路线（A / B / C）。
- [ ] 若走 C：先端到端验 rspack 打包链（`bundle({ rspack: true })`），这是 C 路线最不确定的一环。
- [ ] 若走 A：确认显卡型号，核对 OCLP 支持矩阵。
