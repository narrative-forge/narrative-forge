# 工程基线（Engineering Baseline）

> 本文件定义 Narrative Forge 的开发环境、代码规范、CI 策略与文档规范。
> 其中的工具版本与 Monorepo 结构已由 TASK-001 实际落地，是后续所有任务的设计依据。

## 1. 开发环境

| 项目 | 版本 / 取值 | 说明 |
|---|---|---|
| 包管理器 | **pnpm 8.15.0** | 经 `package.json` 的 `packageManager` 字段钉版，corepack 保障一致 |
| 运行时 | **Node.js >= 18.17** | `engines.node` 约束 |
| 语言 | **TypeScript 5.3.3** | `strict` 模式 |
| Lint / Format | **Biome 1.5.3** | 作为**唯一** Linter / Formatter（不引入 ESLint / Prettier） |
| 测试框架 | **Vitest 1.2.2** | 唯一测试框架 |
| 渲染引擎 | Remotion | 主渲染引擎（见 ADR-001；TASK-003 起安装） |

> 沙箱当前运行时为 Node 22，但 `engines` 已声明 `>=18.17`，与钉版工具链兼容。

## 2. 代码规范

- **模块系统**：所有包 `type: module`（ESM），统一 `exports` 字段（区分 `types` / `import`）。
- **类型安全**：`strict: true`；`tsconfig.base.json` 启用 `composite` + `declaration` + `declarationMap`。
- **项目引用**：包间通过 tsconfig `references` 建立依赖图（见 ADR-003），构建顺序由 `tsc -b` 保证。
- **单一工具链**：格式化与静态检查仅用 Biome，禁止并存 ESLint/Prettier。
- **命名**：包名 `@forge/*`；内部目录 `packages/*`。
- **禁止项（Phase 1 边界）**：
  - 不引入 `three`、`@react-three/fiber`（Phase 2 才需要）；
  - 不引入 `@remotion/bundler`、`@remotion/renderer`（TASK-003 再装）；
  - 不写业务逻辑（骨架阶段）；
  - 不写完整 README（Phase 1 结束统一写）。

## 3. CI 策略

- 平台：GitHub Actions（`.github/workflows/ci.yml`）。
- 触发：`push` 到 `main`/`master`、`pull_request`。
- 顺序（与本地一致）：**lint → typecheck → test → build**。
- 依赖安装：`pnpm install --frozen-lockfile`（要求提交 `pnpm-lock.yaml`）。
- 版本固化：CI 使用 `pnpm/action-setup@v2`（version 8.15.0）+ `actions/setup-node@v4`（18.17）。

## 4. 文档规范

- 语言：**中文为主，技术术语保留英文**（如 Monorepo、Schema、Lint）。
- 格式：Markdown；**代码块必须标注语言**（` ```ts `、` ```bash ` 等）。
- ADR：存放于 `docs/adr/`，命名 `ADR-NNN-kebab-case-title.md`，遵循
  `状态 / 背景 / 选项 / 决定 / 理由 / 推翻条件` 模板。
- 目录约定：
  - `docs/adr/`：架构决策记录；
  - `docs/specs/`：范围 / 规格文档；
  - `docs/engineering-baseline.md`：本文件；
  - `docs/risk-register.md`：风险登记册。
- 不写项：Schema 规范（TASK-004）、View 规范（Phase 2）由各自任务负责。

## 5. 提交与交付

- 提交信息：约定式（`chore:` / `docs:` / `feat:` 等）。
- 交付方式：见仓库根 `WORKFLOW.md`（**默认：Agent 直接推送**到
  `narrative-forge/narrative-forge` 的 `master`；仅在连接器/推送不可用时退化为
  源码压缩包，供用户自行推送）。
  > 2026-10-07 修订：原文写作「默认方案 A——Agent 不推送」，与 `WORKFLOW.md` 现行约定
  > （「本约定优先于任何"由用户下载再推送"的隐含假设；直接推送为默认」）矛盾，已更正。
