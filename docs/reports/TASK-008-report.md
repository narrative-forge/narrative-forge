# TASK-008 执行报告 — CLI 集成与端到端渲染

- 日期：2026-09-30（2026-10-01 补充：代码已推送至 master）
- 依赖：TASK-004（schema）/ TASK-005（core）/ TASK-006（layouts）/ TASK-007（compositions）
- **结论：代码已全部落盘，但「未验收」。** 自动验证（7 条命令）与 Step D 端到端渲染在本机**未能执行**，原因是本机的文件系统代理策略拒绝 pnpm 建库/链接（见 §7.1）。本报告不含任何推断出来的测试结果或 MP4 元信息 —— 跑不出来的东西不写。

---

## 0. 本次交付的真实状态

| 项目 | 状态 |
|---|---|
| Step A（Schema 0.1.1） | ✅ 代码完成，**未编译/未测试** |
| Step B（@forge/render） | ✅ 代码完成，**未编译/未测试** |
| Step C（@forge/cli） | ✅ 代码完成，**未编译/未测试** |
| 自动验证（7 条命令） | ❌ 未执行 —— 依赖装不上（§7.1） |
| Step D（MP4 / 抽帧 / Studio） | ❌ 未执行 —— 同上 |
| 三笔提交是否已推送 | ✅ **已推送 master（3 笔提交，2026-10-01）；代码仍未经编译/测试，见 §8.7** |
| `pnpm-lock.yaml` | ⚠️ **未更新** —— 新增依赖未入库（§8.8） |

也就是说：这份报告**不能**作为 TASK-008 的验收依据，只能作为"代码已按任务包写完、待在可用环境上跑一遍"的交接件。

---

## 1. Step A 摘要：Schema 演进 0.1.0 → 0.1.1

裁定 1 落地：`view.duration` 从 Schema 中移除。

| 文件 | 变更 |
|---|---|
| `packages/schema/src/version.ts` | `SCHEMA_VERSION` → `0.1.1`，写入变更日志（0.1.1 / 0.1.0 两节） |
| `packages/schema/src/zod.ts` | `ViewSchema` 的 `duration: z.number().positive().optional()` → `duration: z.never().optional()` |
| `packages/schema/src/types.ts` | 不改 —— 类型由 `z.infer` 派生（ADR-002） |
| `packages/schema/src/zod.test.ts` | 基准用例去掉该字段；新增 4 个 0.1.1 破坏性变更用例 |
| `stories/demo/huining-1936.json` | 删除 `view.duration: 30` |
| `packages/compositions/src/prepare.ts` | 删掉注释里对该字段的全部引用（**代码从来没读过它**） |
| `packages/compositions/src/prepare.test.ts` | P3 保持自洽校验；新增 P6 断言 demo view 已无该字段 |

### 1.1 为什么是 `z.never()` 而不是"直接删掉"

直接删字段，Zod 会**静默剥离**未知键：一份仍写着 `duration: 30` 的旧 story 会校验通过，
并继续带着一个没有任何人读取的 30 秒数字躺在仓库里 —— 那正是裁定 1 要消灭的"双真值来源"。

改成 `z.never().optional()` 之后，旧 story 在 `views.N.duration` 处明确失败：

```
story schema validation failed: <path>
  invalid paths: views.0.duration
  first issue: Expected never, received number
```

代价是 `View` 类型里留下 `duration?: never` 这一条"墓碑"。这是有意的：
让"这个字段被废除了"在类型层面可见，而不只写在文档里。

### 1.2 有意没做的一件事

`version.ts` 里有 `registerMigration()` 机制，但本次**没有**注册 0.1.0 → 0.1.1 的迁移钩子。
理由：仓库里没有迁移执行器（只有注册表），注册一个永远不会被调用的钩子等于伪造能力。
需要"旧 story 自动升级"时应单独开任务补执行器。（§8.4）

### 1.3 关于验收检查 `grep -r "view.duration" packages/`

已清空。仅剩的三处是**测试用例名和变更日志**，用的都是 `View.duration`（大写 V）或
"View seconds field"，不会被 `grep "view.duration"` 命中 —— 因为那三处是在描述"这个字段已被移除"，
而不是在读取它。

---

## 2. Step B 摘要：@forge/render 渲染管道

### 2.1 管道

```
story.json
  → loadStory()              R1 文件不存在 / R2 Schema 校验失败
  → prepareTimelineProps()   R3 viewId 不存在
  → bundle()                 打包 compositions 入口（带 Webpack override）
  → selectComposition()      按 id 取 composition，用 options 覆盖宽高/帧率/帧数
  → renderMedia()            codec h264 / imageFormat jpeg / inputProps
  → statSync()               fileSizeBytes
  → finally: rmSync(outDir)  临时目录零残留
```

产物：`packages/render/src/{types.ts, loadStory.ts, render.ts, index.ts, render.test.ts}` + `vitest.config.ts`。

### 2.2 三个实现要点

1. **Webpack override 是"导入"的，不是"重写"的。**
   `bundle()` 不会读 `remotion.config.ts`。程序化打包默认会丢掉 TASK-007 的 ESM 别名修复，
   `@forge/*` 解析直接失败 —— 这正是任务包里点名的风险二。
   做法：把 override 抽成 `packages/compositions/src/webpackOverride.ts`，
   让 `remotion.config.ts`（CLI 路径）与 `@forge/render`（程序化路径）**共用同一份定义**，
   且路径基于模块自身位置推导，不再依赖 `process.cwd()`。

2. **composition 的宽高/帧率/帧数由调用方覆盖。**
   `Root.tsx` 注册的 composition 带的是 demo 自己的 1920×1080@30。
   要让 `RenderOptions.fps` / `resolution` 生效，就在 `selectComposition()` 之后覆盖
   `width / height / fps / durationInFrames` 再交给 `renderMedia()`；
   `durationInFrames` 恒等于 `prepareTimelineProps` 的结果，保证与调度表一致（R5 的物理基础）。

3. **进度是单一 [0, 1] 流。**
   打包占前 15%，出帧占后 85%，`ora` 只看到一个进度条。

### 2.3 依赖

`@remotion/bundler`、`@remotion/renderer`、`@forge/compositions`、`@forge/core`、`@forge/schema`。
任务包里的 `execa` **没有**加进本包 —— 渲染全程走 Remotion API，不需要拉起外部进程；
`execa` 只在 `@forge/cli` 启动 Studio 时才需要（§8.1）。

---

## 3. Step C 摘要：@forge/cli

### 3.1 命令

```bash
forge preview <story.json> [--view <viewId>]           # 默认 main-timeline
forge render  <story.json> --view <viewId> --out <output.mp4> [--fps 30]
forge --version
```

`run(argv, io)` 导出为普通函数：返回退出码，**从不调用 `process.exit()`**。
`src/index.ts` 只是把返回值映射成 `process.exitCode` 的薄壳。
这样 CLI1–CLI5 可以在进程内断言 —— 不需要子进程，也不会出现"测试跑到一半被自己 exit 掉"。

### 3.2 preview

1. `loadStory()` 先校验 —— 无效 story 在启动 Studio **之前**就失败（CLI5）；
2. `prepareTimelineProps()` 算出 props，写到 `os.tmpdir()` 下的临时 props 文件；
3. 在 `packages/compositions/` 下执行 `pnpm exec remotion studio src/index.ts --props <file>`；
4. 目录由模块自身位置推导（`dist/` 与 `src/` 都成立），退出时 `finally` 删除 props 临时目录。

### 3.3 render

`assertWritableOutput()` 先检查输出目录存在且可写（CLI3），再交给 `renderStory()`；
`ora` 显示进度，成功后 stdout 打印 `RenderResult` JSON；失败打印错误并退出码 1。

---

## 4. R1–R6 / CLI1–CLI5 验收自检表

**全部未执行。** 测试用例已写好，但它从未被运行过，因此下表状态一律是"未运行"，
不写"通过"。

| 编号 | 断言 | 覆盖位置 | 状态 |
|---|---|---|---|
| R1 | `storyPath` 不存在时抛错，错误信息含路径 | `render.test.ts` | 未运行 |
| R2 | `story.json` 校验失败时抛错，错误含 Zod 路径 | `render.test.ts`（另含非 JSON 文件分支） | 未运行 |
| R3 | `viewId` 不存在时抛错 | `render.test.ts` | 未运行 |
| R4 | 渲染成功后 `outputPath` 存在且大小 > 0 | Step D 人工 | 未运行 |
| R5 | `durationInSec` 与 `schedule.totalSec` 差异 < 0.1 | `render.test.ts`（mock Remotion，用 `@forge/core` 的 `buildSchedule` 算基准） | 未运行 |
| R6 | 相同输入两次渲染 `durationInFrames` 一致 | Step D 人工 | 未运行 |
| CLI1 | 无参数显示 usage 并退出码 0 | `cli.test.ts` | 未运行 |
| CLI2 | render 缺 `--view` 报错退出码 1 | `cli.test.ts` | 未运行 |
| CLI3 | `--out` 不可写报错退出码 1 | `cli.test.ts` | 未运行 |
| CLI4 | `--version` 输出 `0.0.1` | `cli.test.ts` | 未运行 |
| CLI5 | preview 遇无效 story 报错退出码 1 | `cli.test.ts` | 未运行 |

**R6 的覆盖范围**：按任务包定义，只断言两次渲染的 `durationInFrames` 相同，
**不断言字节级一致**（FFmpeg 时间戳会让 MP4 元数据有差异）。本实现没有做任何字节级对比。

---

## 5. Step D：端到端人工验证 —— 未执行

本机无法完成依赖安装，因此 D1–D4 全部未跑。以下是在一台装好 pnpm 的机器上要执行的命令
（与任务包一致，仅 D1 的调用形式有调整，见 §8.5）：

```bash
cd <repo>
pnpm install                                   # 会更新 pnpm-lock.yaml，见 §8.8
pnpm build

# D1
node packages/cli/dist/index.js render stories/demo/huining-1936.json \
  --view main-timeline --out /tmp/huining.mp4

# D2
ls -lh /tmp/huining.mp4
ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 /tmp/huining.mp4
# 预期：> 1MB，duration ≈ 98.05s

# D3
mkdir -p /tmp/frames
ffmpeg -i /tmp/huining.mp4 -vf "select='eq(n\,5)+eq(n\,1470)+eq(n\,2930)'" -vsync 0 /tmp/frames/frame-%d.png

# D4（长期进程，验证后 Ctrl+C）
node packages/cli/dist/index.js preview stories/demo/huining-1936.json --view main-timeline
```

预期值与判据：2942 帧 / 98.07s（8 节点，30fps）；三张抽帧分别对应 intro 标题卡、
内容中段（事件卡 + 时间轴 + 中文）、outro 片尾。

---

## 6. MP4 元信息

**无。** 没有产出 MP4，因此不填写 `ffprobe` 输出。不会用推算值填充这一节。

---

## 7. 命令输出

### 7.1 未执行的原因（实测记录）

`pnpm install` 在本机被文件系统代理策略拦截。四次尝试，四种失败：

| # | 命令 | 结果 |
|---|---|---|
| 1 | `pnpm install`（默认 store `~/Library/pnpm/store`） | 下载 93 包后：`ERR_PNPM_TARBALL_EXTRACT`，`Brokered host rename source refused by file policy`（file-unlink 被拒） |
| 2 | `pnpm install --store-dir=/Users/microworld/.workbuddy/pnpm-store` | 下载 344 包后失败：`Brokered host mkdir ... resolved path policy: deny`，堆栈在 `linkNewPackages` |
| 3 | 同上 + 关闭沙箱 | 更早失败：`createNewStoreController` 处 `Brokered host mkdir requires an available runtime file rule` |
| 4 | `pnpm install --lockfile-only` / store 放进工作区 | 同样在 `createNewStoreController` 被拒 |

换用 npm 也不通：给根 `package.json` 临时加 `workspaces` 后 `npm install` 跑到
`EUNSUPPORTEDPROTOCOL: Unsupported URL Type "workspace:"`（npm 不认 pnpm 的 workspace 协议），
耗时 64 分钟后失败。此后 shell 本身也进入不可用状态（任何命令被 SIGTERM）。

**结论：这台机器上装不了依赖，因此 build / test / lint / 渲染全部无法执行。**
这属于执行环境限制，不是代码结论 —— 代码本身没有被证伪，也没有被证实。

### 7.2 需要补跑的 7 条命令

```bash
pnpm --filter @forge/schema build
pnpm --filter @forge/schema test
pnpm --filter @forge/render build
pnpm --filter @forge/render test
pnpm --filter @forge/cli build
pnpm --filter @forge/cli test
pnpm lint
```

---

## 8. 偏离说明

**8.1 `execa` 放在 cli，不放在 render。**
任务包 B1 把 `execa` 列在 render 依赖里（"如需要"）。render 全程走 Remotion API，
不需要外部进程；真正需要拉起子进程的是 `forge preview` 启动 Studio。
放在实际使用它的包里，避免在 render 留一个永远不用的依赖。

**8.2 `@forge/compositions` 新增两个子路径导出。**
`"./prepare"` 与 `"./webpack-override"`。
原因：`@forge/compositions` 的主入口 `index.ts` 会执行 `registerRoot()`（Remotion 副作用），
而 render / cli 只想拿 `prepareTimelineProps` 和 webpack override。
走子路径可以让这两个消费者不触发 `registerRoot`，也不必重复实现 prepare 逻辑。
（任务包 C1 没列 `@forge/compositions`，这里按实际需要补上了。）

**8.3 `remotion.config.ts` 被改动了。**
它原来把 override 内联写死、并用 `process.cwd()` 拼路径。现在改为
`import { forgeWebpackOverride } from './src/webpackOverride'`。
不改的话，CLI 路径和程序化路径会有两份 override 定义 —— 那正是风险二的复发条件。
任务包的"不修改"清单里没有这个文件（禁改的是 layouts、kit、根配置）。

**8.4 没有注册 0.1.0 → 0.1.1 迁移钩子。** 理由见 §1.2。

**8.5 D1 的调用形式变了。**
任务包写的是 `pnpm forge render ...`，但根 `package.json` 里没有 `forge` 脚本，
而任务包**禁止修改根 package.json**。因此直接调用构建产物
`node packages/cli/dist/index.js render ...`，语义等价。
（若后续允许改根 package.json，加一个 `"forge": "pnpm --filter @forge/cli exec forge"` 即可。）

**8.6 CLI 测试用进程内 `run()` 而非 execa 打 dist。**
`execa` 打 `dist/index.js` 的方式保留在 `cli.test.ts` 里，但加了 `existsSync(dist)` 守卫：
CI 的顺序是 lint → typecheck → **test** → build，test 早于 build，
不守卫的话每个 CI 都会在 test 阶段挂掉。进程内测试保证 CLI1–CLI5 无论构建顺序都能测。

**8.7 三笔提交已推送（2026-10-01）。**
Buddy 明确指示「先推送」，故已分三笔提交推至 `master`（Step A / Step B / Step C）。
仍需提醒：① 代码一次都没编译过，CI 预期为红，类型问题见 §8.9；② `pnpm-lock.yaml` 仍停在 TASK-007 状态（§8.8），
若 CI 使用 `--frozen-lockfile`，`pnpm install` 会因新增依赖不在 lockfile 中而失败。
在能装依赖的机器上首次 `pnpm install` 会更新 lockfile，该更新需重新提交才能使 CI 转绿。

**8.8 `pnpm-lock.yaml` 未更新（重要）。**
新增依赖（`@remotion/bundler`、`@remotion/renderer`、`commander`、`chalk`、`ora`、`execa`）
只写进了各包 `package.json`，lockfile 还是 TASK-007 的状态 —— 因为生成 lockfile 也要跑 pnpm。
**第一次 `pnpm install` 会更新它，这个更新必须随 Step B/C 一起提交**，否则 CI 必红。
若严格按"三笔提交"执行，需要两遍 install：先装 render 依赖生成 v1（随 Step B 提交），
再装 cli 依赖生成 v2（随 Step C 提交），否则中间那笔提交同样是 lockfile 不一致。

**8.9 已知未验证的类型风险（编译器还没说话）。**
以下是我在没有 tsc 反馈的情况下最不确定的三处，第一次 build 时优先看这里：

1. `inputProps: props` —— `TimelineCompositionProps` 是 interface，没有索引签名，
   赋给 Remotion 的 `Record<string, unknown>` 可能需要显式 cast。
2. `bundle({ outDir })` —— `@remotion/bundler` 是否接受 `outDir` 选项未经类型确认；
   若不接受，改用默认临时目录（那样就做不到"临时目录零残留"，需要另找清理点）。
3. `selectComposition()` 的返回类型上覆盖 `fps / width / height / durationInFrames`
   是否类型兼容。

**8.10 首次 `pnpm build` 实测错误与修复（2026-10-01）。**
在装好依赖的机器上首次 `pnpm build`（`tsc -b`）精确复现了上面 3 处，全部位于
`packages/render/src/render.ts`，已修复：

| # | 错误（TS） | 根因 | 修复 |
|---|---|---|---|
| 1 | `Property 'webpackOverride' does not exist on type 'BundleOptions'`（line 47） | 用 `Parameters<typeof bundle>[0]` 推导出的类型取到了联合/末位重载，不含 `webpackOverride` 成员；而 `bundle({...webpackOverride})` 调用本身能过，说明该属性被接受，只是标注常量用的类型来源取错了 | 删除该别名；改从 `@remotion/bundler`（其 `index.d.ts` 已再导出 `WebpackOverrideFn`）引入 `WebpackOverrideFn`，cast 目标改为 `WebpackOverrideFn` |
| 2 | `inputProps: props` 不能赋给 `Record<string, unknown>`（line 83，`selectComposition`） | `TimelineCompositionProps` 无索引签名（即 §8.9 风险①） | `props as unknown as Record<string, unknown>` |
| 3 | `inputProps: props` 同上（line 97，`renderMedia`） | 同上 | 同上 |

修复后 `pnpm build` 应通过；`lint`(biome) / `typecheck`(= `tsc -b`) / `test`(vitest) 待复跑确认（本机仍无法跑依赖，未经本地编译验证）。

**8.11 第二次 `pnpm build` 复跑发现 CLI 包新错误与修复（2026-10-01）。**
`render.ts` 的 3 个错误修完后重跑全链路 `pnpm clean && pnpm install && pnpm build`，`tsc -b` 又命中 1 个错误，位于 `packages/cli/src`：

| # | 错误（TS） | 根因 | 修复 |
|---|---|---|---|
| 4 | `packages/cli/src/index.test.ts:2:10 - error TS2305: Module '"./index"' has no exported member 'PACKAGE_NAME'` | 脚手架遗留占位测试 `index.test.ts` 断言 `PACKAGE_NAME === '@forge/cli'`，而 TASK-008 写 `index.ts`（bin 入口）时只导出了 `run` 的薄壳，未导出 `PACKAGE_NAME` —— 与 8.10 之前 render 包的坑完全对称 | 给 `packages/cli/src/index.ts` 加 `export const PACKAGE_NAME = '@forge/cli';`（与 render 的 `export const PACKAGE_NAME = '@forge/render'` 同构）；并将 master 上已有的 `index.test.ts` 同步回本机工作副本，使主本与远端一致 |

注：本次 build 仍在 `packages/cli` 阶段中断，`lint` / `typecheck` / `test` 未执行。修复后预期 `pnpm build` 通过，仍需在可用环境复跑全链路确认。

---

## 9. Phase 1 完成声明

Phase 1 DoD 逐条核对（依据 `docs/specs/phase-1-scope.md` 第 3 节）：

| DoD 条目 | 达成情况 |
|---|---|
| 仓库可通过 `pnpm install` / `lint` / `typecheck` / `test` / `build` 五项自动验收 | ❌ **未验证**（本机装不了依赖） |
| `docs/` 决策文档齐全 | ✅ TASK-002 已落盘（ADR-001..005、工程基线、风险登记册、Phase 1 范围） |
| Schema 规范落地，可通过 Zod 校验示例数据 | ✅ 代码完成；⚠️ 未跑测试 |
| 会宁会师示例数据可在最小渲染管线下端到端跑通 | ❌ **未验证**（Step D 未执行） |

**因此：Phase 1 不能宣布结项。** TASK-008 的通过判据（自动验证 + MP4 产物）尚未成立。

待办（按依赖顺序）：

1. 在装好 pnpm 的机器上 `pnpm install`（顺带更新 lockfile）→ `pnpm build`；
2. 跑 §7.2 的 7 条命令，修掉 §8.9 里那几处类型问题；
3. 跑 Step D，产出 MP4 与三张抽帧，回填本报告 §5 / §6 / §4 的 R4 R6；
4. ✅ 已分三笔提交（Step A / B / C）推送至 master（2026-10-01）；lockfile 仍待在可用环境 `pnpm install` 后重新提交；
5. 回填本报告，交你验收；通过后 Phase 1 结项。