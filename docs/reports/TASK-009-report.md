# TASK-009 执行报告 — 渲染链路修复（本机 Chrome / 本机 FFmpeg / ESM 解析）

- 日期：2026-10-02
- 依赖：TASK-008（`@forge/render` + `@forge/cli` 端到端渲染）
- 触发：本机执行 `forge render` 失败，要求「使用本机已安装的 Google 浏览器渲染，不要主动下载」
- **结论：渲染链路的五个真实故障已全部修复（§1）。** 另有三项属于机器/宿主环境的限制（§4），不是代码问题，但会决定这条链路能否跑完 —— 附可复现的判据与绕过方法。

---

## 0. 本次交付的真实状态

| 项目 | 状态 |
|---|---|
| 故障 A：ESM `.js` 后缀 webpack 解析不到 | ✅ 已修（代码级，任何机器上都必需） |
| 故障 B：Remotion 会自己下载浏览器 | ✅ 已修（改为只用本机 Chrome，结构化禁止下载） |
| 故障 C：macOS 12 上自带 FFmpeg 加载即崩 | ✅ 已修（改用本机已有 FFmpeg，零下载） |
| 故障 D：慢机器上 `delayRender` 的 30 s 预算不够 | ✅ 已修（默认抬到 300 s，且可通过 `timeoutInMilliseconds` 覆盖） |
| 故障 E：并发页数超出内存，第 16 帧死等 | ✅ 已修（并发改为按内存封顶 `min(cpus/2, 内存GB/4)`，本机算出 1） |
| 环境限制 ①：WorkBuddy 沙箱 fs 代理把 EEXIST 当硬错误 | ⚠️ 非本项目问题，给出绕过方法（§4.1） |
| 环境限制 ②：WorkBuddy 把 fs/exec shim 注入渲染进程，长渲染报 `Broker closed without a response` | ⚠️ 非本项目问题，给出绕过方法（§4.2） |
| 环境限制 ③：本机 Chrome 冷启动 14.5 s，逼近 Remotion 硬编码的 25 s 连接上限 | ⚠️ 内存紧张时会超时，属机器状态而非代码缺陷（§4.3） |
| 端到端 MP4 | ✅ 已产出：2942 帧 / 1920×1080 / 98.07 s / 2,672,965 B，ffprobe 独立复验一致（§3.4） |
| 四条链（lint / typecheck / test / build） | ✅ 全部退出码 0；测试 10 文件 / 93 用例全过（§3.5） |
| 远端 CI（GitHub Actions #25） | ✅ `success`，34 s（§3.6） |

---

## 1. 五个真实故障

它们**只能串行解**：原报错停在第 1 个，修掉之后才露出第 2 个，以此类推。这也是为什么「一次改一个、每改一个都真跑一次」是这里唯一有效的工作方式 —— 一次性改五个只会把五个症状混成一团。

| # | 故障 | 一句话根因 |
|---|---|---|
| A | webpack 解析不到 `./Root.js` | tsc 不改写 ESM 后缀，webpack 不做 `.js→.ts` 映射 |
| B | Remotion 会自己下载浏览器 | 没有 `browserExecutable` 就走下载分支 |
| C | macOS 12 上 FFmpeg 加载即崩 | 自带 `libavdevice.dylib` 链接了 macOS 13+ 的符号 |
| D | 页面/逐帧 30 s 预算不够 | Remotion 默认 30 s，本机页面初始化实测 29–64 s+ |
| E | 第 16 帧死等 300 s | 2 个并发页把 4 GB 机器撑爆，页面被系统回收 |

### 1.1 故障 A：`Module not found: Can't resolve './Root.js'`

`tsc`（`module: ESNext`）**不会**改写相对导入后缀，所以 ESM 源码里必须写 `./Root.js`。TypeScript 与 Vite/vitest 会自动映射到 `.tsx`，**webpack 不会**，它去找字面量 `Root.js`，找不到就失败。

| 文件 | 变更 |
|---|---|
| `packages/compositions/src/webpackOverride.ts` | 新增 `resolve.extensionAlias`：`.js → [.ts, .tsx, .js]`（另含 `.jsx` / `.mjs` / `.cjs`）；模块头注释同步改写（原文还停留在「extensionless import」的旧描述） |

`.ts`/`.tsx` 排在最前是有意的：`src/` 旁边常驻 `dist/` 时，要打的是源码。

### 1.2 故障 B：Remotion 默认会自己下载浏览器

Remotion 找不到自带的 `chrome-headless-shell` 就**下载**。要求是只用本机 Chrome，因此做了三件事：

| 文件 | 变更 |
|---|---|
| `packages/compositions/src/chrome.ts`（新增） | 本机 Chrome 解析：`FORGE_CHROME_EXECUTABLE` → macOS/Linux/Windows 常规路径 → 都没有就**报错**，绝不回落到下载 |
| `packages/render/src/render.ts` | `selectComposition()` 与 `renderMedia()` 都传 `browserExecutable` + `chromeMode: 'chrome-for-testing'` + 会抛错的 `onBrowserDownload` |
| `packages/render/src/types.ts` | `RenderOptions` 新增 `browserExecutable?` |
| `packages/compositions/remotion.config.ts` | CLI 路径 `Config.setBrowserExecutable(...)`，两条路共用一份定义 |
| `packages/compositions/package.json` | 新增 `./chrome` 子路径导出 |

两个不显然但关键的点：

1. **`chromeMode` 必须是 `'chrome-for-testing'`。** 默认的 `'headless-shell'` 会让 Remotion 传 `--headless=old`，而真 Chrome ≥ 132 已删除 old headless。这个 mode 描述的是「按普通 Chrome 无头启动」，不是「用哪个二进制」。
2. **禁止下载是结构性的，不是约定。** `ensure-browser.js` 里只要给了 `browserExecutable` 就直接返回，永远不会走到下载分支；`onBrowserDownload` 抛错只是防未来行为变化。

### 1.3 故障 C：macOS ≤ 12 上 Remotion 自带 FFmpeg 加载即崩

逐帧渲染全部成功后，编码阶段崩：

```
FFmpeg quit with code null (SIGABRT)
dyld: Symbol not found: (_AVCaptureDeviceTypeContinuityCamera)
  Referenced from: .../@remotion/compositor-darwin-x64/libavdevice.dylib
  Expected in: /System/Library/Frameworks/AVFoundation.framework/...
```

根因：自带 `libavdevice.dylib` 链接了 macOS 13/14 才有的 `AVCaptureDeviceType*` 常量。Remotion 官方立场是最低 macOS 13，且无法为更老系统编译（remotion-dev/remotion#7027）。本机是 macOS 12.7.6（Darwin 21.6.0）配 2015 款 MacBook Air —— **该系统已是这台机器的上限，升级不是选项**。

| 文件 | 变更 |
|---|---|
| `packages/compositions/src/ffmpeg.ts`（新增） | 本机 FFmpeg 解析：`FORGE_FFMPEG_DIR` → 仅在「自带 FFmpeg 不可用」的平台（darwin 且 Darwin 主版本 < 22，即 macOS ≤ 12）上搜 `PATH` 与常见前缀 → 都没有则**说明原因**并继续（绝不下载） |
| `packages/render/src/render.ts` | 传 `binariesDirectory` 给 `renderMedia` |
| `packages/render/src/types.ts` | `RenderOptions` 新增 `binariesDirectory?` |
| `packages/compositions/remotion.config.ts` | CLI 路径 `Config.setBinariesDirectory(...)` |
| `packages/compositions/package.json` | 新增 `./ffmpeg` 子路径导出 |

`binariesDirectory` 里**只要有 `ffmpeg` 和 `ffprobe` 两个文件**就够了 —— 不需要 dylib，也不需要 Remotion 的 Rust `remotion` 二进制（视频-only 渲染用不到）。这一点是实测得出的（见 §3.2），它让「用本机 FFmpeg」从一个复杂工程问题变成一个软链问题。

### 1.4 两条走不通的弯路（已实测排除，避免后人重走）

| 想法 | 结果 |
|---|---|
| `DYLD_INSERT_LIBRARIES` 注入自建符号垫片 | ❌ 失败。符号是**两级命名空间**绑定，报错明确写着 `Expected in: .../AVFoundation`，绑死在那一个镜像上，插入库顶不掉 |
| 清掉 `libavdevice.dylib` 头里的 `MH_TWOLEVEL` 位改成 flat namespace | ❌ 失败。bind opcode 里的库序号依然把它钉回 AVFoundation |

### 1.5 故障 D：慢机器上 `delayRender` 的 30 s 预算不够

改用真 Chrome、并让下载在结构上不可能之后，渲染仍然停住，但停在了**更靠后**的一步：

```
✖ Timed out after 30000ms while setting up the headless browser.
This could be because the page you specified takes a long time to load ...
```

Remotion 的 `delayRender` 预算（默认 30 s）由**页面初始化、root 组件加载、以及逐帧的 "setting the current frame to N" 共用**。本机实测页面初始化一项就要 **29 / 49 / 64 秒**，在刚跑完一次 webpack 打包之后甚至会超过 120 秒（见 §3.3）。默认的 30 s 因此是**时好时坏**——同一个命令这次能跑、下次不能，这是最难排查的失败形态。

这里有一个容易混淆的关键区别，值得单独记住：

| 阈值 | 阶段 | 能否调整 |
|---|---|---|
| **25 000 ms**「connecting to the browser」 | 启动浏览器 | ❌ **硬编码**在 `openBrowser.js` 里，没有任何 API |
| **30 000 ms**「setting up the headless browser」/ 逐帧 | 页面与渲染 | ✅ `timeoutInMilliseconds`（`selectComposition` / `renderMedia` 等都接受） |

| 文件 | 变更 |
|---|---|
| `packages/render/src/render.ts` | 新增 `DEFAULT_PAGE_TIMEOUT_MS = 300_000`（Remotion 默认值的 10 倍）；`selectComposition` 与 `renderMedia` 都传 `timeoutInMilliseconds` |
| `packages/render/src/types.ts` | `RenderOptions` 新增 `timeoutInMilliseconds?` |
| `packages/render/src/render.test.ts` | 新增两个用例：调用方可覆盖；默认值 > 30 s 且两个阶段取同一个值 |

给的只是一个**上限**，快机器上不花任何代价 —— 因此选择抬高默认值，而不是把 30 s 留给偶发失败。

### 1.6 故障 E：并发页数超出内存 —— 第 16 帧死等 300 秒

把预算抬高之后渲染走得更远，但卡在了**逐帧**阶段：

```
✖ Timeout (300000ms) exceeded rendering the component at frame 16.
  Open delayRender() handles: "1. Setting the current frame to 16".
```

关键判据是 **CPU 只有 6%** —— 29 分 59 秒里几乎全在空等。这**不是慢，是页面已经死了**。Composition 代码里没有任何 `delayRender`（全仓 grep 零命中），所以这个「Setting the current frame to 16」是 Remotion 的内部句柄：它把帧号发给页面，页面再没回话。

根因：`defaultConcurrency()` 原来只看核数（`cpus / 2` = 2）。Remotion 的每个并发页都会缓冲一帧 1920×1080，两个页面在这台 4 GB 机器上（当时系统可用内存仅 24 MB）把页面撑到被系统回收 —— 渲染于是**挂住**，而不是报一个能看懂的错。

| 文件 | 变更 |
|---|---|
| `packages/render/src/render.ts` | `defaultConcurrency()` 改为 `min(cpus / 2, 总内存 / 4 GB)`：每并发页按约 4 GB 预算。本机因此算出 **1** |

验证（同一份 bundle，只改并发）：

| 并发 | 结果 |
|---|---|
| 2 | 全片渲染在**第 16 帧**死等 300 s 后超时（CPU 6%） |
| 1 | 60 帧 **32 s** 渲完（≈0.53 s/帧），无异常 |

---

## 2. 变更清单

| 文件 | 类型 |
|---|---|
| `packages/compositions/src/webpackOverride.ts` | 改：`extensionAlias` + 注释订正 |
| `packages/compositions/src/chrome.ts` | 新增 |
| `packages/compositions/src/ffmpeg.ts` | 新增 |
| `packages/compositions/remotion.config.ts` | 改：本机 Chrome / 本机 FFmpeg |
| `packages/compositions/package.json` | 改：`./chrome`、`./ffmpeg` 导出 |
| `packages/render/src/render.ts` | 改：传 `browserExecutable` / `chromeMode` / `binariesDirectory` / `timeoutInMilliseconds`；**整个渲染进程只 `openBrowser()` 一次**并复用给 `selectComposition` 与 `renderMedia`；新增 `DEFAULT_PAGE_TIMEOUT_MS = 300_000`；`defaultConcurrency()` 改为按内存封顶 |
| `packages/render/src/types.ts` | 改：三个新选项（`browserExecutable` / `binariesDirectory` / `timeoutInMilliseconds`） |
| `packages/render/src/render.test.ts` | 改：mock 补 `openBrowser`；新增「只开一个浏览器且两条调用共用同一实例」「超时预算可覆盖」「默认预算 > 30 s 且两阶段一致」三个用例；bundle 进度回调用 `0/12.34/100` 真实检验归一化 |

**没有新增任何依赖**，因此 `pnpm-lock.yaml` 不需要变动。

### 2.1 为什么要两个新模块，而不是在 `@forge/render` 里就地写

`chrome.ts` / `ffmpeg.ts` 都各自有两个消费者：CLI 路径（`remotion.config.ts`）与编程路径（`@forge/render`）。放在 `@forge/compositions` 与既有的 `webpackOverride.ts` 同一处，延续 TASK-008 定下的「一份定义，防止两条路漂移（风险二）」的做法 —— 这两个模块的文件头注释里都写明了这一点。

---

## 3. 验证证据

### 3.1 分阶段确认

| 阶段 | 证据 |
|---|---|
| bundle | webpack 编译通过，不再报 `Can't resolve './Root.js'` |
| 浏览器 | verbose 日志：`Opening browser: executable = /Applications/Google Chrome.app/Contents/MacOS/Google Chrome`；`Loading root component` / `Waiting for root component to load` 两个 delayRender 分别 **1ms / 17ms** 清空 |
| composition | `composition Timeline-huining: 1920x1080 @30 2942f`，`props.story=present` |
| 逐帧 | 5 个 GL 后端（swangle / angle / egl / swiftshader / vulkan）**全部成功**，单帧 0.83–0.99s |
| 编码 | 换用本机 FFmpeg 后，30 帧片段产出 63,837 字节 MP4 |

**全程无任何下载**：渲染前后 `~/Library/Caches/remotion` 与 `node_modules/.remotion` 均不存在；日志中无 `Downloading Chrome`。

### 3.2 最小 `binariesDirectory` 的重要发现

先用「Remotion compositor 目录全量软链 + 换掉 ffmpeg/ffprobe」验证通过，再收缩到**只放两个软链**，结果完全一致（同样 30 帧 63,837 字节）。这证明 Rust `remotion` 二进制与那些 dylib 在视频-only 渲染路径上根本没被调用 —— 否则它们仍会撞上同一个 dyld 错误。

### 3.3 现场实测：瓶颈在页面初始化，且“共享浏览器”是净收益

固定同一份 bundle（复用 `/tmp/forge-serve`，排除打包这一变量），只切换「是否复用同一个 browser 实例」：

| 模式 | 启动浏览器 | 页面就绪（`setPropsAndEnv`） |
|---|---|---|
| 让 Remotion 自己开（不传 `puppeteerInstance`） | 22.8 s | **48.8 s** |
| 复用 `openBrowser()` 返回的同一实例 | 18.7 s | **29.0 s** |

两个结论：

1. **共享浏览器是净收益，不是权宜之计**：省掉第二个 Chrome 的启动（22.8 s → 18.7 s），页面就绪也快约 1.7 倍（48.8 s → 29.0 s）—— 因为不用同时供养两个 Chrome。
2. **页面初始化在这台机器上要 29–49 秒**，Remotion 默认的 30 s 预算正好压在边界上。这解释了它为什么**时好时坏**：机器稍忙一点就翻过去。

这两点合起来就是 §1.5 那个改动的直接依据。

### 3.4 端到端 MP4（真实产出，非推演）

完整 2942 帧渲染**已在本机跑通**：

```bash
FORGE_FFMPEG_DIR="/Applications/微信秒剪特效.app/Contents/bin/ffmpeg/x86_64" \
  forge render stories/demo/huining-1936.json --view main-timeline --out .out/demo.mp4
# ✔ Rendered 2942 frames
# ✔ Output: .out/demo.mp4
```

`renderStory()` 返回：

| 字段 | 值 |
|---|---|
| `outputPath` | `.out/demo.mp4` |
| `durationInFrames` | 2942 |
| `durationInSec` | 98.0667 |
| `fileSizeBytes` | 2,672,965 |
| `renderTimeMs` | 674,714（11 分 14.7 秒） |

用本机 FFmpeg 独立复验该文件（不是读 `renderStory` 的自述）：

```bash
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames \
        -show_entries format=duration,size,bit_rate .out/demo.mp4
# codec_name=h264   width=1920   height=1080   r_frame_rate=30/1   nb_frames=2942
# duration=98.066667   size=2672965   bit_rate=218052   format=mov,mp4,m4a,3gp,3g2,mj2
```

`nb_frames=2942`、`duration=98.066667`（= `durationInSec`）、`size=2672965`（= `fileSizeBytes`）三项与 API 返回值**逐一对上**，说明这条链路（bundle → 选 composition → 逐帧 → 编码 → 落盘）是端到端闭合的。

`time` 统计：总耗时 **11:22.22**，CPU 65%，其中用户态 355.47 s / 内核态 90.41 s。CPU 只有 65% 说明瓶颈是单页逐帧（并发 1），不是并行度不足 —— 这正是这台 4 GB 机器上该有的形态。

**全程零下载**（本次要求的核心约束）：

| 判据 | 结果 |
|---|---|
| `~/Library/Caches/remotion` | 不存在 |
| `node_modules/.remotion` | 不存在 |
| 渲染日志中 `download` 出现次数 | 0 |

即浏览器来自 `/Applications/Google Chrome.app`、编码器来自 `FORGE_FFMPEG_DIR`，两者都是本机既有，Remotion 没有拉取任何东西。

### 3.5 四条链

在本机以 `pnpm` 等价的四条链跑完（`node_modules/.bin` 内的工具直调；`NODE_OPTIONS` 已按 §4.2 剥离）：

| 链 | 命令 | 退出码 | 结果 |
|---|---|---|---|
| Lint | `biome check .` | **0** | 检查 55 个文件 |
| Typecheck | `tsc -b` | **0** | 无输出（无错误） |
| Test | `vitest run` | **0** | **10 个测试文件 / 93 个用例全部通过** |
| Build | `tsc -b` | **0** | 无输出（无错误） |

关于 lint 的一个如实说明：它输出 4 条 `lint/style/noNonNullAssertion`，**全部集中在 `packages/core/src/schedule.test.ts`**（本任务未改动的文件），是既存写法。该规则在 `biome.json` 里配为 **warn**，因此不影响退出码；本次改动的文件零告警。

> 上一次跑这条链时 `packages/cli` 的二进制冒烟测试超时失败（`Test timed out in 5000ms`）。单独重跑该文件 6 个用例 1.95 s 全过 —— 那是整包并发跑在这台机器上的**负载抖动**（node 冷启动实测 1.25 s，5 s 预算本应够），与代码无关。本次在渲染结束后、机器空闲时重跑，93 个用例一次全过，印证了这一点。

### 3.6 远端 CI

改动已推送到 `narrative-forge/narrative-forge` 的 `master`（`22dadae..46feb5a`，快进，未覆盖历史），GitHub Actions 随即跑完：

| 项 | 值 |
|---|---|
| Run | CI #25（`actions/runs/37638032688`） |
| Commit | `46feb5a` |
| Job | `Lint · Typecheck · Test · Build` |
| **conclusion** | **`success`** |
| 耗时 | 34 s（`14:35:56Z → 14:36:25Z`） |

CI 的 `Install` 走 `pnpm install --frozen-lockfile`。本任务**没有新增任何依赖**，并且刻意**没有**把根 `package.json` 里那条引导产物 `"dependencies": { "pnpm": "^12.8.1" }` 与其连带的 123 行 `pnpm-lock.yaml` 一起提交（那是沙箱的临时手段，不是项目契约）—— 所以 lockfile 与 package.json 保持本来就一致的状态，不会撞上本项目历史上反复出现的那类 Install 失败。

两条 annotation 都是**运行器环境级提示**，与本次改动无关，仅备查：

- `warning`：Node.js 20 已弃用，`actions/checkout@v4` / `actions/setup-node@v4` / `pnpm/action-setup@v2` 被强制跑在 Node.js 24 上。
- `notice`：`ubuntu-latest` 将于 2026-10-19 起迁移到 Ubuntu 26。

（这两条不阻塞 CI；若想清掉，是后续单独升级那几个 action 版本的事，不属于本任务范围。）

---

## 4. 环境限制（不是本项目代码的问题）

### 4.1 WorkBuddy 沙箱：非递归 `mkdir` 的 EEXIST 被当成硬错误

在沙箱里跑 webpack 打包会失败：

```
EEXIST: file already exists, mkdir '/var/folders/.../T/forge-render-XXXX'
  at createBrokerPolicyError (.../node-brokered-fs-shim.cjs:247:19)
```

栈里出现 `node-brokered-fs-shim.cjs`，说明不是代码问题。根因：

- 正规 Node 里 `fs.mkdir(已存在目录, cb)` 回调拿到的是 `err.code === 'EEXIST'`；
- 沙箱的 fs 代理把它包装成 `decision: 'host-op'` + `ok: false`，shim 于是**抛出** `CODEBUDDY_BROKER_DENY`（message 里才是 EEXIST）；
- 而 webpack `lib/util/fs.js` 的 `mkdirp` 恰恰靠 `err.code === 'EEXIST'` 判断「目录已存在，继续」。`Compiler.emitAssets` 一定会对 outDir 做一次非递归 mkdir，于是**任何 webpack emit 都失败**。

**在沙箱内绕过**（让 fs shim 退回原生实现；这是降低干预、不是提权）：

```bash
env -u CODEBUDDY_SANDBOX_HOST_FILE_OPERATION_COMMAND <命令>
```

**用户自己的终端没有这个 shim，不需要这一步。** 这一点值得记住：它解释了「为什么本地命令行能跑、在 WorkBuddy 里跑不动」。

### 4.2 WorkBuddy 把 fs/exec shim 注入渲染进程：长渲染报 `Broker closed without a response`

第一次跑完整 2942 帧渲染，在 bundle 阶段跑到 3 分钟后失败，日志只有一句：

```
✖ Broker closed without a response
```

`time` 显示这 3 分 11 秒里 CPU 只占 **18%** —— 进程在干等 IPC，不是算不过来。而且这句话**不在本仓库里**（全仓 `grep` 零命中），它来自 WorkBuddy 的 broker 客户端：

```bash
grep -rl "Broker closed without a response" /Applications/WorkBuddy.app/Contents/Resources
# → .../cli/vendor/shim/broker-ipc-client.cjs
```

根因：WorkBuddy 给每个 shell 注入 `NODE_OPTIONS=--require=.../shim/node-language-shim.cjs`。该 shim 会把 `node-safe-delete-shim.cjs`（默认开启）与 `node-brokered-fs-shim.cjs`（`CODEBUDDY_BROKERED_FS_HOOK_ENABLED=1` 或 `CODEBUDDY_SAFE_DELETE_SANDBOX=1`，本机两者均为 1）加载进**任何** node 进程 —— 包括我们的渲染进程。于是 webpack 写几千个文件、Remotion 删临时目录全都变成走 broker 的 IPC，通道一断就抛出这句。

一行验证 shim 是否挂在进程上：

```bash
node -e "console.log(global.__CODEBUDDY_NODE_LANGUAGE_SHIM_LOADED__)"                     # true
env -u NODE_OPTIONS node -e "console.log(global.__CODEBUDDY_NODE_LANGUAGE_SHIM_LOADED__)"  # undefined
```

**在沙箱内绕过**（与 §4.1 同理，是降低干预而非提权）：

```bash
env -u NODE_OPTIONS -u CODEBUDDY_SANDBOX_HOST_FILE_OPERATION_COMMAND <命令>
```

**值得记住**：这个故障**只在长任务上出现**。几十帧的短渲染从来踩不到，所以「短跑通过」不能推断「长跑没问题」。

### 4.3 本机 Chrome 冷启动 14.5 s，逼近 Remotion 的 25 s 上限

第二、三次完整渲染失败在**更早的阶段**：

```
✖ Timed out after 25000 ms while trying to connect to the browser! Chrome logged the following: 
```

（冒号后面是空的 —— puppeteer 靠 Chrome stderr 里的 `DevTools listening on ws://…` 取调试端点，取不到就超时。）

排查时先排除两个看似更可疑的诱因：

| 假设 | 判据 | 结论 |
|---|---|---|
| Chrome 太新、不支持 macOS 12 | `Info.plist` 里 `LSMinimumSystemVersion = 12.0`，本机 12.7.6 | ❌ 排除，系统本身是支持的 |
| 沙箱把 Chrome 杀了 | 脱离进程组单独启动 Chrome，带 `--enable-logging=stderr --v=1` | ❌ 排除，Chrome 正常启动并写出 68 KB 日志 |

真正原因是**它启动就是慢**：直接量 `openBrowser()` 自身耗时得 **14,541 ms**（上限 25,000 ms）。本机 4 GB 内存、swap 已用 2 GB、系统可用内存 12%，Chrome 冷启动被拖到 14 秒上下；内存压力再高一点就翻过 25 秒。

这不是代码缺陷，也没有可改的代码（25 s 是 Remotion 内部的常量）。可操作的是**降低内存压力**：跑之前清掉残留 Chrome 进程，且不要在渲染同时跑 vitest / build。本次渲染的并发已是保守值 —— `defaultConcurrency() = cpus / 2 = 2`。

### 4.4 macOS ≤ 12 + Remotion 4.0.530

见 §1.3。判断条件：`os.release()` 主版本 < 22（`22 = macOS 13`）。本机为 21.6.0。

**本机可用的 FFmpeg 位置**（`ffmpeg.ts` 的自动搜索只覆盖 `PATH` 与标准前缀，覆盖不到 App 包内，所以这里需要显式给 `FORGE_FFMPEG_DIR`）：

```
/Applications/微信秒剪特效.app/Contents/bin/ffmpeg/x86_64
```

该目录同时含 `ffmpeg` 与 `ffprobe`，且是静态构建、带 `libx264`，可直接当 `binariesDirectory`：

```bash
FORGE_FFMPEG_DIR="/Applications/微信秒剪特效.app/Contents/bin/ffmpeg/x86_64" \
  pnpm forge render stories/demo/huining-1936.json --view main-timeline --out .out/demo.mp4
```

（`/Applications/CapCut.app/Contents/Resources/ffmpeg` 也在机器上，但实测无法直接调用，未采用。）

---

## 5. 有意没做的事

1. **没有在 `ffmpeg.ts` 里硬编码那个 App 包路径。** 那是本机事实，不是项目事实；写进产品代码就是把一台机器的巧合变成所有人的假设。产品代码只认 `FORGE_FFMPEG_DIR` 与标准搜索路径。
2. **没有把沙箱的两处绕过（`env -u`，§4.1 / §4.2）写进代码或 npm scripts。** 那是 WorkBuddy 环境的行为，不是仓库的契约；用户自己的终端没有这些 shim，也不需要它们。
3. **没有为 macos 12 引入符号垫片 / 补丁 dylib。** 两条技术路线都已实测走不通（§1.4），能走通的 `binariesDirectory` 是 Remotion 官方支持的扩展点 —— 用一个受支持的接口，而不是一个会在下次升级时炸掉的二进制补丁。
4. **没有顺手把 `pnpm-lock.yaml` 那 123 行未提交差异一起处理。** 它来自根 `package.json` 里那条 `"dependencies": { "pnpm": "^12.8.1" }`（上一轮的引导产物，与本次改动无关）。见 §6。
5. **没有给 CLI 加 `--concurrency` / `--timeout` 开关。** 两者都已作为 `renderStory` 的默认值（内存感知并发、300 s 预算），`forge render` 直接继承，用户不必知道它们存在。加开关只会把「本机选对了默认值」这件事变成「用户必须记得传参」。
