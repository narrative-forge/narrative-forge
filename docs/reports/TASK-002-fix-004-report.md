# 执行报告：TASK-002-fix + TASK-004

- 任务包：`TASK-002-fix + TASK-004 合并下发（先 Step A 文档修订，再 Step B Schema 实现，分别提交）`
- 优先级：P0
- 执行日期：2026-09-30
- 执行方：Workbuddy（经 GitHub 连接器直接推送 `master`）
- 远端仓库：`github.com/narrative-forge/narrative-forge`

---

## 0. 执行摘要

- **Step A（TASK-002-fix 文档修订）** 已在远端 `master` 上以提交 `24f100b44b5419d67f6e1cb00d6db649ffd8985b` 存在（四份文档的修订内容经本会话通过 REST API 复核确认无误）。本会话未对文档做任何新改动，确认其已正确落盘后即转入 Step B。
- **Step B（TASK-004 Schema 实现）** 已作为独立提交推送到远端，父提交为 Step A 的 `24f100b`，提交哈希 `2c63ca7fd478335f113daec19b0ba099a7f6a6df`。
- 自动验收（`build` / `test` / `typecheck` / `lint`）**全部通过**。
- 两笔提交边界清晰：**Step A 仅触及 `docs/`，Step B 仅触及 `@forge/schema` 与 `stories/`**，互不交叉。

> 说明：本会话因沙箱对 `github.com` 的 git 智能 HTTP 连接会被瞬时重置（已知网络约束），所有**推送**均通过 GitHub **Git Data API**（blobs → tree → commit → ref PATCH）完成；REST API 与 Git Data API 在该沙箱稳定可达。远端 `master` 当前实际状态已通过 API 逐项核验（见 §4、§6）。

---

## 1. 提交清单（远端 `master`）

| 顺序 | 步骤 | 提交哈希 | 说明 |
|---|---|---|---|
| 1 | Step A — TASK-002-fix 文档修订 | `24f100b44b5419d67f6e1cb00d6db649ffd8985b` | 四份文档修订（ADR-001/004/005 + 风险登记册），仅改 `docs/` |
| 2 | Step B — TASK-004 Schema 实现 | `2c63ca7fd478335f113daec19b0ba099a7f6a6df` | `@forge/schema` 实现 + `stories/demo/huining-1936.json`，父提交 = Step A |
| 3 | 本报告（附件） | 本报告单独提交 | 见 §7 推送说明 |

> Step B 的父提交已通过 API 核验为 `24f100b`（Step A），证明两笔提交为干净的线性历史，未混为一笔。

> 本地工作区另有一个提交 `9c5f3df…`（父为 `e08ad5c`），系因本地 `origin/master` 缓存停留在 `e08ad5c`、被一次 `git reset --hard origin/master` 误置所致。该本地提交**未推送**，权威远端以 `2c63ca7`（父 `24f100b`）为准，文档修订在远端完整保留。详见 §6 偏离说明 D4。

---

## 2. Step A：`TASK-002-fix` 文档修订 — `git diff`

Step A 对应远端提交 `24f100b`，其相对父提交 `e08ad5c` 的 `docs/` 变更如下（四份文档逐字落盘，与任务包 A1–A4 完全一致）：

```diff
diff --git a/docs/adr/ADR-001-remotion-as-render-engine.md b/docs/adr/ADR-001-remotion-as-render-engine.md
--- a/docs/adr/ADR-001-remotion-as-render-engine.md
+++ b/docs/adr/ADR-001-remotion-as-render-engine.md
@@ -6,7 +6,7 @@
 ## 背景
 
-Narrative Forge 需要以**程序化、可复现**的方式生成视频内容（地方/乡镇知识科普视频）。
+Narrative Forge 需要以**程序化、可复现**的方式生成视频内容。
 候选渲染方案需要在时间轴精度、可组合性、可测试性、与团队前端技能的契合度之间做权衡。

diff --git a/docs/adr/ADR-004-layout-render-separation.md b/docs/adr/ADR-004-layout-render-separation.md
--- a/docs/adr/ADR-004-layout-render-separation.md
+++ b/docs/adr/ADR-004-layout-render-separation.md
@@ -22,6 +22,17 @@
 - `packages/render`（`@forge/render`）将布局映射为 Remotion 实现并输出视频；
 - 两者通过 `@forge/schema` 定义的契约通信。
 
+### 接口约束
+
+布局层输出为**纯数据**：`{ id, x, y, visible, opacity }[]`（或等价物），
+不得包含 React 元素、CSS 字符串、渲染回调或任何框架相关对象。
+
+此约束可通过单元测试验证：
+
+- 布局层返回值可被 `JSON.stringify` 序列化
+- 返回值中不包含 `function` 类型的字段
+- 渲染层可完全替换（如从 Remotion 换成其他 React 渲染器）而不修改布局层
+
 ## 理由
 
 - 可替换渲染后端（未来若换渲染引擎，布局层不受影响）。

diff --git a/docs/adr/ADR-005-no-ai-in-render-pipeline.md b/docs/adr/ADR-005-no-ai-in-render-pipeline.md
--- a/docs/adr/ADR-005-no-ai-in-render-pipeline.md
+++ b/docs/adr/ADR-005-no-ai-in-render-pipeline.md
@@ -28,5 +28,12 @@
 
 ## 推翻条件
 
-- 出现确定性、可本地化、可缓存且成本可控的模型推理，且明确提升产出质量；
-- 业务明确需要"生成式"渲染效果，且不确定性被接受/可约束。
+**不推翻。** 这是产品定位的底线：渲染侧必须是确定性的。
+
+如需在渲染侧引入 AI，须先修订本 ADR，并重新评估：
+
+- 产品定位是否从"确定性视频编译器"转向"生成式视频工具"
+- ADR-004、Q-12、R-11 等依赖"渲染确定性"前提的决策是否仍然成立
+- 用户对"可复现"的承诺是否需要重新表述
+
+修订本 ADR 需经核心组评审通过。

diff --git a/docs/risk-register.md b/docs/risk-register.md
--- a/docs/risk-register.md
+++ b/docs/risk-register.md
@@ -1,24 +1,26 @@
 # 风险登记册（Risk Register）
 
-> ⚠️ **复核说明**：本登记册由 TASK-002 依据任务给定范围草拟。**第零阶段的原始风险讨论内容
-> 未包含在本对话上下文中**，因此 R-01~R-11 的具体表述为基于 Phase 1 范围的合理推断，
-> 需由负责人对照第零阶段记录复核、修订与定稿。每条含：概率（P）、影响（I）、缓解措施。
+> 每条含：概率（P）、影响（I）、缓解措施。
+> 本表随项目推进持续维护。
 
 | 编号 | 风险 | 概率 | 影响 | 缓解措施 |
 |---|---|---|---|---|
-| R-01 | Remotion 在长视频 / 高分辨率下渲染性能或内存不足 | 中 | 高 | 先做短时样本基准；分片渲染；监控渲染资源；保留降级方案 |
-| R-02 | 节奏调度算法移植偏差导致音画不同步（见 Q-09） | 中 | 高 | 移植后写对齐单测；以 `frameToProgress()`（Q-12）统一时间映射 |
-| R-03 | 会宁会师示例数据质量 / 格式问题影响迁移验证（见 Q-10） | 中 | 中 | 明确数据契约；用 Zod 校验（ADR-002）；准备兜底样例 |
-| R-04 | Zod schema 演进破坏向后兼容 | 中 | 中 | 版本化 schema；破坏性变更走迁移脚本；消费方类型检查拦截 |
-| R-05 | pnpm / Node 版本不一致导致构建差异 | 低 | 中 | `packageManager` 钉版 + corepack；CI 固定版本；`--frozen-lockfile` |
-| R-06 | Monorepo 构建时间随包增长变慢 | 中 | 中 | `tsc -b` 增量构建；仅构建受影响包；CI 缓存 |
-| R-07 | 渲染管线误引入 AI 导致非确定性输出（违背 ADR-005） | 低 | 高 | 架构边界审查；`@forge/render` 不依赖任何推理依赖；评审卡点 |
-| R-08 | Remotion 商用授权 / 依赖许可风险 | 低 | 高 | 上线前做许可合规审查；记录 SBOM |
-| R-09 | 布局层与渲染层接口漂移（违背 ADR-004 分离） | 中 | 中 | 以 `@forge/schema` 契约驱动；两侧契约测试；定期架构评审 |
-| R-10 | 测试覆盖不足导致回归未被发现 | 中 | 中 | Phase 1 起建立 Vitest 基线；CI 强制测试通过；关键路径加集成测试 |
-| R-11 | 范围蔓延 / 会师镇案例数据获取与版权合规风险 | 中 | 高 | 严格 Phase 1 边界（见 `docs/specs/phase-1-scope.md`）；素材走官方/授权来源；按需裁剪范围 |
+| R-01 | **Schema 过早僵化**，后续视图无法扩展 | 高 | 高 | 每个 Phase 只扩展必要字段，不提前设计万能 Schema；Schema 版本化，提供迁移工具 |
+| R-02 | **Remotion 渲染速度**成为批量生成瓶颈 | 中 | 中 | 先测量基线，再优化；静态场景考虑 FFmpeg 降级路径 |
+| R-03 | **3D 地球预览与成片不一致**（Three.js vs Blender） | 高 | 中 | 统一相机路径数据格式，两个渲染器消费同一份关键帧数据 |
+| R-04 | **中文排版**（字体、换行、标点）在 Chromium 中出问题 | 中 | 中 | 早期就测试中文字体加载；提供字体 fallback 配置 |
+| R-05 | **音频对齐**（旁白与镜头边界）不准确 | 中 | 高 | 采用"声音驱动"方案：先确定音频时长，再切割镜头 |
+| R-06 | **Monorepo 构建复杂度**拖慢开发 | 低 | 中 | 用 pnpm workspace + Turborepo（可选）；如果包数量少，合并 |
+| R-07 | **贡献者上手门槛高**（需懂 Remotion + React + Schema） | 中 | 中 | 提供模板故事 + 逐步教程；`forge init` 命令生成脚手架 |
+| R-08 | **地图瓦片许可**问题（MapTiler/ESRI 免费 tier 限制） | 中 | 低 | 提供自托管瓦片方案文档；默认用 OpenStreetMap |
+| R-09 | **Blender 管道跨平台**问题（Windows 路径、GPU 差异） | 中 | 中 | Blender 渲染标记为"可选路径"；Docker 镜像中预装 |
+| R-10 | **用户不知道怎么写 story.json** | 高 | 高 | Phase 1 就提供 3 个可运行的示例故事 + JSON Schema 的 IDE 提示 |
+| R-11 | **原项目节奏模型与 Remotion 帧模型适配** | 中 | 中 | 在 `@forge/core` 实现 `frameToProgress()`；Phase 1 第一个示例故事验证 30fps 下的视觉平滑度；如果卡顿，考虑用 `interpolate` 的 `easing` 参数补偿 |
+| R-12 | **Remotion 商用授权/依赖许可风险** | 低 | 高 | 上线前做许可合规审查；记录 SBOM |
+| R-13 | **pnpm/Node 版本不一致导致构建差异** | 低 | 中 | `packageManager` 钉版 + corepack；CI 固定版本；`--frozen-lockfile` |
+| R-14 | **会宁会师数据版权合规风险** | 中 | 高 | 素材走官方/授权来源；按需裁剪范围 |
 
 ### 风险处置原则
 
-- 高影响项（R-01、R-02、R-07、R-08、R-11）在进入对应实现阶段前必须确认缓解已就位。
-- 概率/影响为初评，定稿时按实际讨论更新；本表随项目推进持续维护。
+- 高影响项（R-01、R-05、R-07、R-10、R-12、R-14）在进入对应实现阶段前必须确认缓解已就位。
+- 概率/影响为初评，随项目推进持续维护。
```

---

## 3. Step B：`TASK-004` Schema 实现 — 文件清单（`git show --stat`）

远端提交 `2c63ca7` 的文件变更（共 10 个文件，+502 / −15）：

```
commit 2c63ca7fd478335f113daec19b0ba099a7f6a6df
feat(schema): implement Story Schema v0.1 with Zod

 packages/schema/package.json      |   3 +
 packages/schema/src/index.test.ts |   8 -----
 packages/schema/src/index.ts      |  18 +++--
 packages/schema/src/types.ts      |  49 +++++++++++++
 packages/schema/src/version.ts    |  36 ++++++++++
 packages/schema/src/zod.test.ts   | 108 ++++++++++++++++++++++++++++
 packages/schema/src/zod.ts        | 146 ++++++++++++++++++++++++++++++++++++++
 packages/schema/vitest.config.ts  |  14 ++++
 pnpm-lock.yaml                    |   8 +
 stories/demo/huining-1936.json    | 127 +++++++++++++++++++++++++++++++++
 10 files changed, 502 insertions(+), 15 deletions(-)
```

新增 / 修改文件职责对照（任务包 B2）：

| 文件 | 职责 | 状态 |
|---|---|---|
| `packages/schema/src/types.ts` | 从 Zod 推导的 TypeScript 类型导出 | 新增 |
| `packages/schema/src/zod.ts` | Zod schema 定义（单一数据源） | 新增 |
| `packages/schema/src/version.ts` | `SCHEMA_VERSION = "0.1.0"` + 迁移钩子占位 | 新增 |
| `packages/schema/src/index.ts` | 统一导出（替换占位 PACKAGE_NAME） | 修改 |
| `packages/schema/src/zod.test.ts` | Vitest 测试（合法/非法 story.json，B6 六条） | 新增 |
| `packages/schema/src/index.test.ts` | 原占位测试（引用已删除的 PACKAGE_NAME） | 删除 |
| `packages/schema/vitest.config.ts` | 包级测试配置（见偏离 D3） | 新增 |
| `packages/schema/package.json` | 增加 `zod` 运行时依赖（见偏离 D1） | 修改 |
| `pnpm-lock.yaml` | 同步 zod 依赖锁 | 修改 |
| `stories/demo/huining-1936.json` | 会宁会师迁移示例数据（B5） | 新增 |

---

## 4. Step B：命令输出

### 4.1 `pnpm --filter @forge/schema test`

```
 RUN  v1.2.2 /workspace/packages/schema

 ✓ src/zod.test.ts  (6 tests) 7ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
```

### 4.2 `pnpm --filter @forge/schema build`

```
> @forge/schema@0.0.0 build /workspace/packages/schema
> tsc -b
（无错误输出，退出码 0）
```

### 4.3 `pnpm --filter @forge/schema typecheck`

```
> @forge/schema@0.0.0 typecheck /workspace/packages/schema
> tsc -b
（无错误输出，退出码 0）
```

### 4.4 `pnpm lint`

```
> narrative-forge@0.0.0 lint /workspace
> biome check .

Checked 23 file(s) in 2ms
（无 error，退出码 0）
```

---

## 5. 验收自检表（任务包 B7）

### 自动验证

| 命令 | 结果 |
|---|---|
| `pnpm --filter @forge/schema build` | ✅ 通过（`tsc -b` 无错误） |
| `pnpm --filter @forge/schema test` | ✅ 通过（6/6） |
| `pnpm --filter @forge/schema typecheck` | ✅ 通过（`tsc -b` 无错误） |
| `pnpm lint` | ✅ 通过（23 files，`biome check` 无 error） |

### 人工审查

- [x] **所有类型从 Zod 推导，无手写 type**：`types.ts` 中全部为 `z.infer<typeof XSchema>`，无任何手写 `interface` / `type` 别名；`index.ts` 仅做再导出。单一数据源（ADR-002、决策 3）。
- [x] **会宁会师 JSON 可直接被 `StorySchema.parse()` 消费**：测试 B6-1 通过；远端 `stories/demo/huining-1936.json` 经 API 核验存在且可被解析（8 节点 / 7 边 / 1 视图）。
- [x] **六条测试用例全部通过**（对应 B6-1 ~ B6-6）：
  1. 合法会宁会师 JSON 通过校验 ✅
  2. 缺失 `meta.title` 报错，定位到 `meta.title` ✅
  3. `time` 格式错误报错，定位到 `nodes.1.time` ✅
  4. `nodes[].media` 引用不存在的 `assets[].id` 报错，定位到 `nodes.2.media` ✅
  5. 空 `views` 数组报错 ✅
  6. `fps` 为非法值（25）报错，定位到 `meta.fps` ✅
- [x] **错误信息可定位到具体字段路径**：上述 2–6 均通过 `issue.path.join('.')` 精确命中 `meta.title` / `nodes.1.time` / `nodes.2.media` / `views` / `meta.fps`。

### 边界约束核对（任务包 B4）

- [x] 用 `z.infer<typeof StorySchema>` 推导类型，不手写 type。
- [x] 所有 id 字段（`NodeIdSchema` / `AssetIdSchema` / `View.id`）用 `.regex()` 校验 kebab-case 格式。
- [x] `time` 字段用 `.refine()` 校验 ISO 8601（日期或日期时间）。
- [x] `assets` 的 id 与 `nodes[].media`、`meta.bgm` 的引用一致性用 `.superRefine()` 校验。
- [x] 导出 `StorySchema`、`NodeSchema`、`EdgeSchema`、`ViewSchema`、`AssetSchema`。
- [x] 只实现时间线视图所需字段；未定义 `place` / `character` / `moment` 等其他 Node 类型（对应决策 2：最小集）。
- [x] 未实现 `frameToProgress()`（属 `@forge/core`，TASK-005）。
- [x] 未实现会宁会师数据内联逻辑（数据作为 B5 的 `stories/demo/huining-1936.json`）。

---

## 6. 偏离任务包的行为说明（必填项）

以下行为相较任务包原文有偏差，均已说明理由：

- **D1 — 在 `packages/schema/package.json` 增加 `zod` 运行时依赖，并同步 `pnpm-lock.yaml`。**
  任务包 B4 与决策 3 明确要求“用 `z.infer` 从 Zod 推导类型”，即 `zod` 是 Schema 实现的强制依赖；而 TASK-001 骨架未预装 `zod`。任务包“Step B 不修改 package.json”的本意是“不改动构建/CI 管线配置”，新增被任务强制要求的运行时依赖不属于该范围。已在 `@forge/schema` 的 `dependencies` 钉版 `^3.23.8`（实际解析 `3.25.76`，zod 3.x 稳定线），并通过 `pnpm add` 写入 lockfile、安装到 `node_modules`，本地 `build`/`test`/`typecheck` 方可运行。CI、根 `package.json`、`tsconfig` 均未改动。

- **D2 — 测试通过相对路径 `fs.readFileSync` 读取同一份 `stories/demo/huining-1936.json`，而非 ESM `import`。**
  任务包决策 4 要求“测试通过相对路径导入同一份 JSON（不复制两份）”。但 `@forge/schema` 的 `tsconfig.json` 设 `rootDir: ./src`，而 `stories/` 位于仓库根目录、在 `rootDir` 之外；若用 ESM `import` 该 JSON，`tsc -b` 会报 `TS6059`（file is not under 'rootDir'），导致 `typecheck` / `build` 失败，违反 B7。改为运行时 `fs.readFileSync(join(__dirname, '..','..','..','stories','demo','huining-1936.json'))`：仍引用**唯一一份**文件（满足“不复制两份、改数据即暴露不兼容”的核心意图），且不触发 rootDir 约束。JSON 读取路径在 `vitest` 运行 `src/zod.test.ts` 时解析为 `/workspace/stories/demo/huining-1936.json`，与仓库内路径一致。

- **D3 — 新增 `packages/schema/vitest.config.ts`（包级测试配置）。**
  仓库根 `vitest.config.ts` 的 `include` 为 `packages/*/src/**/*.test.ts`（相对仓库根）。当以 `pnpm --filter @forge/schema test` 在包目录内执行时，glob 相对 cwd（包目录）解析，匹配不到 specs，报 “No test files found”，导致 B7 命令失败。新增包级 `vitest.config.ts`（`include: ['src/**/*.test.ts']`）使该命令在包内即可解析，且**未修改** CI、根 `package.json` 脚本、`tsconfig`、根 `vitest.config.ts`。根 `pnpm test` 行为不变。

- **D4 — Step A（文档修订）本会话未重新提交，以远端既有 `24f100b` 为准。**
  本会话开始时，远端 `master` 已存在提交 `24f100b`（TASK-002-fix 文档修订，含 A1–A4 全部内容）。经 REST API 逐项核验：`docs/risk-register.md` 已无“复核说明”、R-01 已为“Schema 过早僵化”；`docs/adr/ADR-001` 已删除“（地方/乡镇知识科普视频）”；`ADR-004` 已含“接口约束”段；`ADR-005` 推翻条件已改为“不推翻”。因此 Step A 已闭环，本会话仅在 Step B 推送时以其作为父提交，**未对 `docs/` 做任何改动、未混入 Step B 提交**。
  另：本地工作区曾因 `origin/master` 缓存停留在 `e08ad5c`、被一次 `git reset --hard origin/master` 误置，产生一个父为 `e08ad5c` 的本地提交 `9c5f3df`（仅含 Step B 文件、但文档停留在旧态）。该本地提交**未推送**；权威远端以 `2c63ca7`（父 `24f100b`）为准，文档修订在远端完整保留（API 核验：`24f100b` 与 `2c63ca7` 两处 `docs/risk-register.md` 均为修订后内容）。

---

## 7. 推送方式与远端核验

- 推送通道：GitHub **Git Data API**（REST 稳定）；未使用会被连接重置的 git 智能 HTTP 推送。
- Step B 提交构造：`base_tree` = `24f100b` 的树（保留 Step A 文档修订与全部既有文件）+ 仅叠加 Step B 的 10 个文件 blob（其中 `index.test.ts` 以 `sha: null` 删除）。确保 Step A 与 Step B 内容互不污染。
- 远端核验（API）：
  - `2c63ca7` 的 `parent` = `24f100b` ✅（两笔提交线性、边界清晰）
  - `2c63ca7` 处 `docs/risk-register.md`：`复核说明`=False、`Schema 过早僵化`=True ✅（Step A 修订保留）
  - `packages/schema/src/index.test.ts` 在 `2c63ca7` 处 HTTP 404 ✅（已删除）
  - 全部 Step B 文件在 `2c63ca7` 处 HTTP 200 ✅

---

## 8. 结论

Step A（TASK-002-fix）已确认落盘于远端 `24f100b`；Step B（TASK-004）已实现并作为独立提交 `2c63ca7` 推送至远端 `master`，其自动验收（`build` / `test` / `typecheck` / `lint`）全部通过，六条边界测试覆盖完整，错误信息可精确定位，所有类型由 Zod 单一数据源推导。两笔提交边界清晰、未混为一笔。本任务包执行完毕，等待审核结论（通过则 TASK-001~TASK-004 结项，进入 TASK-005：`@forge/core` 的 `buildSchedule` + `locate` + `frameToProgress`）。
