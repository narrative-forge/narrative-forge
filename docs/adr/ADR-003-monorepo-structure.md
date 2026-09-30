# ADR-003：Monorepo 结构

- 状态：已采纳（Accepted）
- 日期：2024 年第零阶段（结构由 TASK-001 落地）
- 决策人：Narrative Forge 核心组

## 背景

项目由多个内部强相关的包组成：类型/契约、核心领域、布局、内容套件、组合、渲染、CLI。
需要在代码共享、统一工具链、原子提交与构建效率之间取得平衡。

## 选项

1. **pnpm Monorepo**：多包同仓，pnpm workspace 管理依赖与构建。
2. **多独立仓库（multirepo）**：各自独立，灵活但共享与版本对齐成本高。
3. **单一大包**：简单，但缺乏边界，长期可维护性差。

## 决定

采用 **pnpm Monorepo**，结构如下（已由 TASK-001 落地）：

```
packages/
  schema/          @forge/schema      共享类型与契约（Zod schema 宿主）
  core/            @forge/core        核心领域逻辑
  layouts/         @forge/layouts     布局原语（框架无关）
  kit/             @forge/kit         可复用内容/UI 套件
  compositions/    @forge/compositions 组合构建块
  render/          @forge/render      Remotion 渲染管线
  cli/             @forge/cli         命令行入口
```

- 包依赖图（tsconfig project references）：
  `schema` ← `core`/`layouts`/`kit` ← `compositions` ← `render` ← `cli`。
- 根 `tsconfig.json` 为 solution 入口，`tsconfig.base.json` 提供 strict + composite 共享选项。
- 工具链统一：TypeScript 5.3.3（strict）、Biome 1.5.3（唯一 lint/format）、Vitest 1.2.2。

## 理由

- 代码与类型在包间直接共享，避免复制与版本漂移。
- 统一工具链（单一 lint/format/test），降低协作摩擦。
- 原子提交使跨包改动可一次性审查与回滚。
- pnpm 的隔离依赖与 workspace 链接兼顾安全与效率。

## 推翻条件

- 包间实际耦合极低，Monorepo 的收益被构建复杂度抵消；
- 出现需要将某包独立发布/分发的强需求，且 multirepo 明显更优。

> 详细工程参数见 `docs/engineering-baseline.md`。
