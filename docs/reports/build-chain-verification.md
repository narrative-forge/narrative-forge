# 构建链验证报告 — 2026-10-01

本轮目标：在沙箱环境内装齐依赖，跑通 `build / typecheck / test / lint` 四条链，并把暴露出的真实编译/测试错误在源码层修掉。

## 结论

四条链全绿：

| 链 | 命令 | 结果 |
| --- | --- | --- |
| build | `tsc -b` | ✅ exit 0 |
| typecheck | `tsc -b` | ✅ exit 0 |
| test | `vitest run` | ✅ **10 files / 90 tests 全通过** |
| lint | `biome check .` | ✅ exit 0（仅剩 `noNonNullAssertion` 为 warn 级，按配置不失败） |

## 根因与修复

### 1. 系统性 ESM 相对导入缺扩展名（这是最初唯一的测试失败根因）

`tsconfig.base.json` 使用 `module: ESNext` + `moduleResolution: Bundler`。tsc 在这种配置下**不会**为相对说明符补扩展名，产物 `dist/*.js` 里原样保留：

```js
import { run } from './cli';   // 产物照抄，无扩展名
```

Node 的 ESM 加载器拒绝解析无扩展名的相对导入 → 运行时 `ERR_MODULE_NOT_FOUND`。`packages/cli` 的冒烟测试恰好执行 `node dist/index.js --version`，因此必挂；同一问题也存在于 `@forge/render` 的运行时链路上。

**修复**：为 `packages/*/src/**`（含 `.tsx`）中所有相对 `import` / `export ... from` 补上 `.js`，共 24 个文件。

> 说明：Vite/vitest 能把 `./x.js` 解析回 `./x.ts`（已用 `core/src/schedule.test.ts` 单文件实测确认），因此补 `.js` 不会破坏 89 个既有单测。

### 2. 缺失的导出与类型导入

| 文件 | 缺失内容 |
| --- | --- |
| `packages/render/src/index.ts` | `export const PACKAGE_NAME = '@forge/render'`（`render/src/index.test.ts` 断言需要；与 `@forge/cli` 的写法对称） |
| `packages/layouts/src/timeline.ts` | 类型 `TimelineLayoutItem` |
| `packages/compositions/src/TimelineComposition.tsx` | 类型 `TimelineLayoutResult` |
| `packages/compositions/src/camera.test.ts` | 类型 `TimelineLayoutResult` |
| `packages/compositions/src/prepare.test.ts` | 类型 `Story` |

### 3. Biome 配置与诊断

- `biome.json` 的 `files.ignore` 补入 **`.pnpm-store`**：此前失败的 pnpm 尝试留下的缓存目录，biome 会去 lint 其中的 JSON，是"18 errors"里的绝大部分来源。
- 修 `useLiteralKeys` 3 处：`process.env['FORGE_PNPM_BIN']` → `process.env.FORGE_PNPM_BIN`；`view['duration']` → `view.duration`（×2）。
- 跑 `biome check --apply` 统一了 import 排序与格式。

## 无源码改动的部分

依赖安装所需的临时手段（把子包 `workspace:*` 临时改成 `*`、给根 `package.json` 加 `workspaces` 字段，以便用 npm 绕过本沙箱下失效的 pnpm）**已全部还原**为纯 pnpm 状态；`.npmrc` 未改动。本报告中列出的源码改动不依赖这些临时手段。

## 变更文件

- `packages/*/src/**`：24 个文件补 `.js` 扩展名，另补 5 处缺失的类型导入 / 导出。
- `biome.json`：ignore 补 `.pnpm-store`。
- `packages/cli/src/cli.ts`、`packages/schema/src/zod.test.ts`：`useLiteralKeys`。
- 其余为 biome 自动的 import 排序 / 格式规范化。
