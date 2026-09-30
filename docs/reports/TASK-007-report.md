# TASK-007 执行报告 — 时间线 Remotion 组件

- 提交：`feat(compositions): implement timeline Remotion component (TASK-007)`（单笔提交）
- 依赖：TASK-004（schema）/ TASK-005（core）/ TASK-006（layouts）
- 结论：**全部自动门禁通过；Studio 预览成功并产出 3 张截图；相机平滑过渡有 DOM 实测数据佐证**

---

## 1. 实现摘要

### 1.1 组件结构

```
@forge/kit（纯展示，无布局逻辑）
├── tokens.ts        设计 token（颜色/字体栈/间距/字号，与任务包一致）
├── TitleCard.tsx    片头/片尾标题卡（AbsoluteFill + 金色标题 + 副标题）
├── EventCard.tsx    事件卡（featured 金边+光晕 / active 浅边 / scale 缩放）
└── Timeline.tsx     时间轴（水平线 + 节点圆点，全部视口坐标）

@forge/compositions
├── prepare.ts       story+viewId → TimelineCompositionProps（纯函数，预计算 schedule）
├── camera.ts        smoothCamera（纯数据相机插值，C1–C6）
├── TimelineComposition.tsx  主组件（每帧 ≤2 次布局计算，0 次 buildSchedule，0 IO）
├── Root.tsx         注册 Timeline-huining（1920×1080@30fps，2942 帧）
├── index.ts         registerRoot 入口
└── remotion.config.ts + vitest.config.ts
```

### 1.2 相机插值逻辑

TASK-006 的 `computeTimelineLayout` 是无插值相机（活动节点切换瞬间跳变）。补偿在渲染层：

1. `useCurrentFrame()` → `tSec = frame / fps`；
2. `computeTimelineLayout(nodes, schedule, tSec)` 得当前布局；
3. **切换点检测**：`locate(schedule, tSec).nodeIndex` → `segments[nodeIndex].startSec` 即"上次切换时刻"；
   `framesSinceSwitch = (tSec − startSec) × fps`；上一布局用 `segments[nodeIndex−1].endSec − ε` 时刻重算
   （首节点则用 `introSec − ε`，此时 `activeNodeId = null`、相机指向首节点）；
4. `smoothCamera(current, previous, framesSinceSwitch, 15)`：`t = min(framesSinceSwitch/15, 1)`，
   对 `items[].x` 与 `timeline.x0/x1` 线性插值；`y/opacity/visible` 直接取 current；
5. intro/outro 阶段 `activeNodeId === null`，`framesSinceSwitch = ∞` → 稳定指向首/末节点，无过渡。

**渲染中每帧恰好 2 次 `computeTimelineLayout`（当前 + 上一布局）**，符合性能约束；
`buildSchedule` 仅在 `prepareTimelineProps` 中调用一次并随 props 下发。

### 1.3 视觉编排（两处渲染层决策）

- **intro/outro 只渲染整屏标题卡**（"1934 — 1936 · 长征会师" / "—— 完 ——"），
  事件卡不叠在标题上；内容阶段才渲染时间轴 + 事件卡。
- **事件卡按节点间距自适应缩放**：卡宽 320px，1920 宽 × 8 节点时间距 ≈251.43px，
  `fitScale = min(1, spacing/320) ≈ 0.78`；活动卡保持 1.0（焦点强调）。满足人工审查"不重叠"。

---

## 2. C1–C6 与 P1–P5 验收自检表

### camera.test.ts（6 用例）

| 编号 | 断言 | 状态 |
|---|---|---|
| C1 | `framesSinceSwitch=0` → x 部分等于 previousLayout | ✅ 通过 |
| C2 | `framesSinceSwitch>=transitionFrames` → 返回 currentLayout（同一引用） | ✅ 通过 |
| C3 | 过渡中 item.x 单调从 previous 到 current | ✅ 通过 |
| C4 | items.length 保持 | ✅ 通过 |
| C5 | activeNodeId === currentLayout.activeNodeId | ✅ 通过 |
| C6 | JSON 可序列化、无 function/=> | ✅ 通过 |

### prepare.test.ts（5 用例）

| 编号 | 断言 | 状态 |
|---|---|---|
| P1 | viewId 不存在 → 抛错 | ✅ 通过 |
| P2 | view.type ≠ timeline → 抛错 | ✅ 通过 |
| P3 | 时长一致性（见 §6 偏离 1 的解释） | ✅ 通过 |
| P4 | `durationInFrames === Math.ceil(schedule.totalSec × fps)` | ✅ 通过 |
| P5 | 同输入两次调用深度相等 | ✅ 通过 |

**测试数：11 / 11 通过（≥11 达标）**。kit 本身无测试要求（任务包未列）。

---

## 3. Studio 预览截图

启动方式：`cd packages/compositions && pnpm exec remotion studio src/index.ts --port 3000`
→ `Server ready - Local: http://localhost:3000`，webpack `Built in ~2s`，**无编译错误**。

截图位于 `docs/reports/screenshots/`（已随本提交入库）：

| 文件 | 帧 | 画面 | Studio 时间码 |
|---|---|---|---|
| `intro.png` | 5 | 整屏标题卡"红军三大主力会师"+ 副标题 | 00:00.03 |
| `content.png` | 1470 | 活动卡「红二方面军成立」居中高亮；featured 卡金色；时间轴圆点对齐 | 00:49.00 |
| `outro.png` | 2930 | 片尾"—— 完 ——"整屏标题卡 | 01:37.20 |

截图为 **Playwright + 系统 Chromium 驱动的真实 Studio 页面整页截图**（含 Studio UI 与 Inspector，
可证实是 Studio 预览而非渲染管道产物）。取帧方式见 §6 偏离 7。

---

## 4. 人工确认清单

- [x] Studio 在 `localhost:3000` 启动，无编译错误（`Server ready`，webpack 无 ERROR）
- [x] 侧边栏出现 `Timeline-huining` composition（Inspector 显示 1920×1080 / 30fps / 2942 帧）
- [x] 标题卡在开头出现（intro 阶段，见 intro.png）
- [x] 8 个事件卡按顺序出现；`featured: true`（会宁会师、三大主力会师完成）为**金色边框 + 光晕 + 金色标签**（见 content.png）
- [x] 相机切换**平滑过渡，非跳切** —— DOM 实测数据见 §4.1
- [x] 片尾在结尾出现（outro 阶段，见 outro.png）
- [x] 中文文本正常渲染，**无方块字/乱码**（见 §7 R-04）

### 4.1 相机平滑过渡实测（节点 0 → 节点 1，切换时刻 t=13.15s ≈ 帧 394.5）

在 Studio 运行页面上用 `remotion_setFrame` 逐帧定位，读取 DOM 中
「红军西征战役发起」（节点 1）卡片包裹层的视口 `left`：

| 帧 | t（切换进度） | 活动卡视口 x |
|---|---|---|
| 394 | 切换前（相机在节点 0） | 1211.43 |
| 395 | 0.5/15 | 1203.05 |
| 398 | 3.5/15 | 1152.76 |
| 401 | 6.5/15 | 1102.48 |
| 404 | 9.5/15 | 1052.19 |
| 407 | 12.5/15 | 1001.90 |
| 410 | ≥15（稳态） | **960.00**（居中） |
| 413 | 稳态 | 960.00 |

每 3 帧步进 ≈50.29px = (3/15)×251.43，**严格线性单调**，15 帧后精确收敛到 `width/2`。
即：若无插值，x 会在帧 394→395 间从 1211.43 直接跳到 960（跳切）；实测为 15 帧线性滑动。

### 4.2 布局核对（L12 的 Studio 实证）

- 活动节点稳态时卡片中心恒为 **960 = width/2**（上表 410/413 帧）；
- 非活动卡以 0.78 缩放后宽 ≈250px ≈ 间距 251.43px，**相邻卡片不重叠**；
- 画布左右边缘的节点卡被合成边界裁切（如 content.png 右缘「三大主力红军会师完成」），
  这是相机平移滑动视口的预期行为，与原项目一致。

---

## 5. 命令输出

| 命令 | 结果 |
|---|---|
| `pnpm --filter @forge/kit build` | EXIT 0 |
| `pnpm --filter @forge/compositions build` | EXIT 0 |
| `pnpm --filter @forge/compositions typecheck` | EXIT 0 |
| `pnpm --filter @forge/compositions test` | EXIT 0 — **Test Files 2 passed (2)，Tests 11 passed (11)** |
| `pnpm lint` | EXIT 0 — `Checked 42 file(s)`，无 error |

（完整原始输出见执行机 `/tmp/task007_commands.log`；core 测试中 4 处 `!` 为 TASK-005 既有 warn，不计入失败。）

---

## 6. 偏离说明

1. **P3 的解释（重要，请主导者裁定）**：任务包 P3 原文"schedule.totalSec 与 view.duration 差异在 1 秒以内"，
   但会宁 demo `view.duration = 30` 而 `buildSchedule` 产出 `totalSec = 98.05`（差 68 秒），P3 按字面**不可能成立**；
   且"根据 view.duration 与 fps 计算 durationInFrames"与 P4（`ceil(totalSec × fps)`）互相矛盾。
   本实现以 **P4 硬约束为准**：`durationInFrames = ⌈98.05×30⌉ = 2942`（合成时长 98.07s），
   P3 落地为 `|schedule.totalSec − durationInFrames/fps| < 1` 的自洽校验（0.017 < 1，通过）。
   `view.duration` 仅用于确认视图存在与类型，不参与时长裁剪。**建议**：后续将 demo 的 `view.duration`
   修为 ≈98，或在 Schema 中废弃该字段、以调度表为唯一时长来源（属 TASK-008 前的规格决定）。
2. **`remotion.config.ts` 追加 `overrideWebpackConfig`（任务包未写，但 Studio 必需）**：workspace 包由
   `tsc` 产出**无扩展名**相对导入的 ESM dist（`export * from './Timeline'`），且包声明 `"type": "module"`，
   Webpack 严格解析（fullySpecified）直接报 Module not found。先尝试置 `resolve.fullySpecified=false`
   （顶层+逐 rule）无效——Remotion 会重新断言；最终方案是把 `@forge/*` **别名到各包 `src/index.ts`**，
   让 Webpack 经 TS loader 解析扩展名。未改 schema/core/layouts 任何文件，未引入新依赖。
3. **kit 增加 `react-dom` + `@types/react`/`@types/react-dom`**：`react-dom` 本就在任务包依赖清单；
   两个 @types 为 TSX 编译必需（devDependencies，非运行时新增）。
4. **删除 kit 占位 `src/index.test.ts`**：任务包只列了 compositions 的占位删除；kit 占位同样只测
   `PACKAGE_NAME`，保留会让 `pnpm --filter @forge/kit test` 以"无测试"退出非零，故一并删除。
5. **EventCard 增加 `scale` prop、intro/outro 隐藏事件卡**：渲染层视觉决策，为满足人工审查
   "不重叠/布局合理"；布局层输出不变（L1–L16 与 TASK-006 契约不受影响）。
6. **截图为整页 Studio UI**（非纯画布裁剪）：可证实截图来自真实 Studio 预览。
7. **取帧方式**：本版本 Studio 会把 URL 重写为 `/Timeline-huining` 并丢弃 `?frame=` 查询参数，
   deep-link 定帧不可用；改用 Studio 暴露的全局 `window.remotion_setFrame(frame, compositionId, 0)`
   精确定帧后截图。此方法仅用于产出交付截图，不在任何项目代码/依赖中。
8. **未安装** `@remotion/bundler`、`@remotion/renderer`、`three`、`@react-three/fiber`（遵守约束；
   渲染管道留给 TASK-008）。根 `package.json`/`tsconfig`/`biome.json`/CI、schema/core/layouts 均未改动。
9. **Studio 非致命告警**：Inspector 提示 "Can't save default props: Could not find or extract defaultProps"
   —— Studio 无法反序列化我们自定义的 props 对象进入默认 props 编辑器，预览与渲染不受影响，TASK-008 接
   `inputProps` 管道时再处理。

---

## 7. R-04 缓解状态（中文排版）

**状态：部分缓解 —— 字体栈已配置，字体文件加载推迟到 Phase 1 收尾**（与任务包预期一致）。

实际情况：本执行环境为 Ubuntu（无 PingFang SC / Microsoft YaHei）。安装 `fonts-noto-cjk` 后，
token 字体栈 `"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif` 依次回退，最终由
fontconfig 将 `sans-serif` 的中文解析到 **Noto Sans CJK SC**。三张截图中中文全部正常渲染
（标题、卡片标签、描述、时间码），**无方块字**。

遗留：生产渲染机需保证存在任一 CJK 字体（或按计划在 Phase 1 收尾把字体文件随 `@forge/kit`
打包加载），否则会退化为方块字——触发条件与 TASK-007-fix 的判据已在偏离 9/截图清单中可查。
