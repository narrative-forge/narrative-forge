# TASK-006 执行报告：时间线布局算法（Timeline Layout）

- **任务**：TASK-006 — `@forge/layouts` 中的 `computeTimelineLayout`
- **依赖**：TASK-004（`@forge/schema`）、TASK-005（`@forge/core`）
- **提交**：`feat(layouts): implement timeline layout algorithm (TASK-006)`
- **产出包**：`@forge/layouts`（纯数据布局层，无渲染依赖）

---

## 1. 实现摘要

TASK-006 是**布局算法**而非渲染组件，输出**纯数据**——每个节点在视口中的 `x/y`、可见性、透明度。实现严格遵循 ADR-004 的接口约束：返回值可 `JSON.stringify` 序列化，不含 React 元素 / CSS 字符串 / 函数，渲染层可整体替换。

### 1.1 三个坐标系（刻意分离，避免混淆）

| 空间 | 定义 | 公式 |
|---|---|---|
| **世界坐标** | 节点沿水平轴均匀分布 | `worldX[i] = i * nodeSpacing`，`nodeSpacing = (width - 2*paddingX) / (N-1)`（N≥2）；N=1 时 `worldX[0]=0`、`nodeSpacing=0`；`worldY = timelineY` |
| **相机** | 聚焦于活动节点 | `camWorldX = worldX[camIndex]`；`camIndex` 来自 `locate(schedule, tSec).nodeIndex`（内容阶段），intro→首节点、outro→末节点（无活动节点时） |
| **视口坐标（输出）** | 将世界坐标平移，使相机落在 `width/2` | `item.x = worldX[i] - camWorldX + width/2`；`item.y = worldY`；`timeline.x0/x1 = worldX[0]/worldX[N-1] - camWorldX + width/2` |

### 1.2 活动节点与 intro/outro

- `tSec <= introSec` → `activeNodeId = null`（intro，相机聚焦首节点）
- `tSec >= totalSec - outroSec` → `activeNodeId = null`（outro，相机聚焦末节点）
- 否则 → `activeNodeId = nodes[locate(schedule, tSec).nodeIndex].id`

> 边界采用含等号的 `<=` / `>=`（见 §6 偏离说明 1），使"内容阶段"为开区间 `(introSec, totalSec - outroSec)`，同时满足不变量 L15 / L16。

### 1.3 可见性与透明度

- 可见性：`visible = item.x >= -width*0.5 && item.x <= width*1.5`（宽松边界，避免闪烁）
- 透明度：intro / outro 阶段所有节点 `0.5`；内容阶段活动节点 `1.0`、非活动 `0.4`

### 1.4 输入校验（不满足即抛错）

`nodes.length !== schedule.segments.length` / `width <= 0` / `height <= 0` / `paddingX*2 >= width`。

### 1.5 纯函数约束

- `timeline.ts` 中**无 `let`、无模块级可变状态**（用 `const` + 数组 `map` / 条件表达式替代循环计数器）。
- `timeline.ts` **未 import** `react` / `remotion` / `three` 等任何渲染依赖。
- `TimelineLayoutResult` 仅含 `number` / `string` / `boolean` / `null`，可被 `JSON.stringify` 序列化且无函数字段（满足 L7 / L8 / L9）。

---

## 2. L1–L16 验收自检表

输入统一为：`nodes = 会宁会师 8 节点`、`schedule = buildSchedule(nodes)`、`options = { width: 1920, height: 1080 }`。

| 编号 | 断言 | 结果 |
|---|---|---|
| L1 | `items.length === nodes.length` | ✅ PASS |
| L2 | `items[i].id === nodes[i].id`（全部 i） | ✅ PASS |
| L3 | 所有 `item.x` 为有限数 | ✅ PASS |
| L4 | 所有 `item.y` 为有限数 | ✅ PASS |
| L5 | 所有 `item.opacity ∈ [0,1]` | ✅ PASS |
| L6 | `activeNodeId === null` 或属于某节点 id | ✅ PASS |
| L7 | `JSON.stringify(result)` 不抛错 | ✅ PASS |
| L8 | `JSON.stringify(result)` 不含 `function` / `=>` | ✅ PASS |
| L9 | 相同输入两次调用结果一致 | ✅ PASS |
| L10 | `timeline.x0 < timeline.x1`（N≥2） | ✅ PASS |
| L11 | `timeline.y ∈ [0, height]` | ✅ PASS |
| L12 | 内容阶段活动节点 `x ≈ width/2` | ✅ PASS（实测活动节点 x 恒为 960） |
| L13 | `tSec < 0` 等价于 `tSec = 0` | ✅ PASS |
| L14 | `tSec > totalSec` 等价于 `tSec = totalSec` | ✅ PASS |
| L15 | `tSec <= introSec` ⇒ `activeNodeId === null` | ✅ PASS |
| L16 | `tSec >= totalSec - outroSec` ⇒ `activeNodeId === null` | ✅ PASS |

**L1–L16 全部通过。**

---

## 3. 黄金值摘要（5 个 tSec）

`golden-layout.json` 由临时生成脚本落盘（浮点保留 6 位小数、items 按 id 稳定排序），测试读取后 `toEqual` 断言。**关键发现：凡存在活动节点的时刻，活动节点视口 x 恒为 `960 = width/2`**，这正是 L12 的实证——证明坐标系统自洽、活动节点确实居中。

| # | tSec | 阶段 | `activeNodeId` | 活动/聚焦节点视口 x |
|---|---|---|---|---|
| 1 | `0` | intro | `null`（相机聚焦首节点） | `960.000000`（首节点） |
| 2 | `1.8` (`introSec+1`) | 内容（节点 0） | `red-first-front-reaches-north-shaanxi` | `960.000000` |
| 3 | `49.025` (`totalSec/2`) | 内容（节点 3） | `red-second-front-formed` | `960.000000` |
| 4 | `96.05` (`totalSec-outroSec-1`) | 内容（节点 7） | `three-main-forces-assembly` | `960.000000` |
| 5 | `98.05` (`totalSec`) | outro | `null`（相机聚焦末节点） | `960.000000`（末节点） |

> 备注：tSec=0 与 tSec=98.05 无活动节点（`activeNodeId=null`），上表"活动/聚焦节点"指相机所对准的节点，其 x 同样为 960，印证相机始终居中。

---

## 4. 坐标验证（tSec = totalSec/2 = 49.025）

- `nodeSpacing = (1920 - 2*80) / (8-1) = 1760 / 7 = 251.428571…`
- `camIndex = 3`，`camWorldX = worldX[3] = 754.285714…`
- `timelineY = 1080 * 0.6 = 648`

| 节点 | 世界 x | 视口 x = `worldX[i] - camWorldX + 960` |
|---|---|---|
| 首节点（`red-first-front-reaches-north-shaanxi`，i=0） | `0` | **`205.714286`** |
| 活动节点（`red-second-front-formed`，i=3） | `754.285714` | **`960.000000`** |
| 末节点（`three-main-forces-assembly`，i=7） | `1760` | **`1965.714286`** |

时间轴视口范围：`timeline.x0 = 205.714286`，`timeline.x1 = 1965.714286`，`timeline.y = 648`。

该截图与 `golden-layout.json` 第 3 项（mid）完全一致，且与 §3 中活动节点 x=960 互为印证。

---

## 5. 命令输出

### 5.1 build / typecheck / test / lint 完整输出

```
===== BUILD =====
> @forge/layouts@0.0.0 build /workspace/packages/layouts
> tsc -b
EXIT_BUILD=0

===== TYPECHECK =====
> @forge/layouts@0.0.0 typecheck /workspace/packages/layouts
> tsc -b
EXIT_TYPECHECK=0

===== TEST =====
> @forge/layouts@0.0.0 test /workspace/packages/layouts
> vitest run

 RUN  v1.2.2 /workspace/packages/layouts

 ✓ src/timeline.test.ts  (26 tests) 12ms

 Test Files  1 passed (1)
      Tests  26 passed (26)
   Start at 19:01:04
   Duration 1.28s
EXIT_TEST=0

===== LINT =====
> narrative-forge@0.0.0 lint /workspace
> biome check .
Checked 32 file(s) in 4ms
EXIT_LINT=0
```

> `pnpm lint` 退出码为 0。输出中仅见 `packages/core/src/schedule.test.ts` 的 `noNonNullAssertion` **告警**（warn 级，属 TASK-005 既有状态，本次依"不修改 packages/core"约束保留，不影响 lint 通过）。

### 5.2 测试构成（≥21 要求：实测 26）

- L1–L16 不变量：16 个用例
- 黄金值测试：5 个（5 个 tSec 各一）+ 1 个"golden 覆盖 5 例 / 8 节点"结构校验
- 输入校验：4 个（`nodes.length` 不匹配 / `width<=0` / `height<=0` / `paddingX*2>=width`）

### 5.3 交付文件清单

| 文件 | 状态 |
|---|---|
| `packages/layouts/src/types.ts` | 新增（Options / Item / Result） |
| `packages/layouts/src/timeline.ts` | 新增（`computeTimelineLayout`） |
| `packages/layouts/src/index.ts` | 替换占位（统一导出） |
| `packages/layouts/src/timeline.test.ts` | 新增（L1–L16 + 黄金值 + 校验） |
| `packages/layouts/src/index.test.ts` | 删除（旧占位） |
| `packages/layouts/vitest.config.ts` | 新增（与 schema/core 同构） |
| `packages/layouts/package.json` | 增加 `@forge/schema` / `@forge/core` 依赖 |
| `docs/reports/golden-layout.json` | 新增（黄金布局数据） |
| `docs/reports/TASK-006-report.md` | 新增（本报告） |

---

## 6. 偏离说明

1. **L15/L16 边界采用含等号判定**：任务包"算法要求"文字用严格 `<` / `>`，而不变量表 L15/L16 用 `<=` / `>=`。为通过不变量，活动节点 `null` 判定采用含端点边界（intro/outro 含端点），内容阶段为开区间 `(introSec, totalSec - outroSec)`。相机聚焦逻辑（intro→首、outro→末）不受影响。黄金值测试的 5 个 tSec 均不落在精确边界上，故两种写法对该 5 点结果一致；边界差异仅在 L15/L16 专用断言中被验证。

2. **golden 的 items 按 id 排序，函数返回保持节点顺序**：为同时满足 L2（`items[i].id === nodes[i].id`，须保持输入顺序）与任务包"golden 稳定排序（按 id）"要求，黄金文件内部 `items` 按 id 排序存储；测试在断言前对 live 结果做"按 id 排序 + 6 位小数舍入"的归一化后再 `toEqual`，二者一致。`computeTimelineLayout` 自身输出仍按节点顺序排列（L2 通过）。

3. **旧占位清理**：删除 `packages/layouts/src/index.test.ts`（原校验 `PACKAGE_NAME` 占位导出），`index.ts` 改为导出真实 API。

4. **无新增运行时依赖**：`@forge/layouts` 仅新增对 `@forge/schema`、`@forge/core` 的 workspace 引用，未引入任何第三方运行时依赖。

5. **`packages/core` 既有 `!` 告警保留**：`pnpm lint` 仅对 `packages/core/src/schedule.test.ts` 报告 `noNonNullAssertion` 告警（warn 级，lint 仍 EXIT 0）。该告警源自 TASK-005 已合入代码，本次严格遵循"不修改 packages/schema 与 packages/core 下任何文件"约束，未改动。如需清零可后续单独处理。

6. **相机无插值（Phase 1 确定性）**：`computeTimelineLayout` 输出相机"目标位置"，不平滑过渡；原项目的 `xAtTravel` 缓动平移由 TASK-007 在渲染层以 Remotion `spring`/`interpolate` 补偿。此分离正是 ADR-004 架构价值所在——布局层提供确定性数据，渲染层负责视觉平滑。
