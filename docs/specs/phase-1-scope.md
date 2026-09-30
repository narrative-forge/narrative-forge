# Phase 1 范围（Phase 1 Scope）

> 定义 Phase 1 做什么、不做什么、完成定义（DoD），并记录 Q-09~Q-12 决策。
> 与 `docs/engineering-baseline.md`、`docs/risk-register.md` 配套使用。

## 1. Phase 1 做什么

- **Monorepo 骨架**（TASK-001，已完成）：pnpm 工作区、7 个 `@forge/*` 空包、
  统一工具链（TS/Biome/Vitest）、CI 工作流。
- **决策文档落盘**（TASK-002，本任务）：5 份 ADR、工程基线、风险登记册、Phase 1 范围。
- **Schema 规范**（TASK-004）：基于 ADR-002 的 JSON + Zod 契约定义。
- **渲染管线雏形**（TASK-003 起）：引入 Remotion，搭建 `@forge/render` 最小可运行管线。
- **迁移验证示例**：以**会宁会师数据**作为首个端到端验证样例（见 Q-10）。

## 2. Phase 1 不做什么

- 不实现完整业务逻辑（骨架与规范优先）。
- 不引入 `three` / `@react-three/fiber`（Phase 2 才需要）。
- 不引入 `@remotion/bundler` / `@remotion/renderer`（TASK-003 按需安装，非骨架阶段）。
- 不写完整 README 项目介绍（Phase 1 结束时统一写）。
- 不写 View 规范文档（Phase 2 再写）。
- **不在渲染管线接入 AI**（见 ADR-005）。

## 3. 完成定义（Definition of Done）

- 仓库可通过 `pnpm install` / `lint` / `typecheck` / `test` / `build` 五项自动验收。
- `docs/` 决策文档齐全，作为后续任务设计依据。
- Schema 规范（TASK-004）落地，可通过 Zod 校验示例数据。
- 会宁会师示例数据可在最小渲染管线下端到端跑通（验证迁移与节奏调度）。

## 4. 决策记录（Q-09 ~ Q-12）

| 编号 | 议题 | 决定 |
|---|---|---|
| Q-09 | 是否移植原项目"节奏调度算法" | **移植**：将既有节奏/时间调度算法迁移到 `@forge/core`，保持其确定性语义 |
| Q-10 | 迁移验证示例数据集 | **采用会宁会师数据**：作为首个端到端迁移验证样例（契合地方知识科普方向） |
| Q-11 | 字段命名 `key` 是否保留 | **重命名**：原 `key` 字段重命名为 `featured`，避免与框架保留字/语义冲突 |
| Q-12 | 是否需要帧-进度映射工具 | **实现 `frameToProgress()`**：提供 `frame -> 0..1 进度` 的纯函数工具，统一时间映射 |

### Q-12 补充说明

`frameToProgress(frame: number, fps: number, durationInFrames: number): number` 计划落在
`@forge/core`（或 `@forge/render` 的工具模块），要求：纯函数、无副作用、可被 Vitest 单测覆盖，
并在 Q-09 的节奏调度中被复用，以降低 R-02（音画同步）风险。

> 注：Q-09~Q-12 的议题与决定取自任务给定范围；若第零阶段有更细的背景讨论，请在此补充引用。
