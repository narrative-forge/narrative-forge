/**
 * @forge/kit — design tokens.
 *
 * Single source of visual constants for Narrative Forge compositions.
 * Phase 1 deliberately ships **no font files**; the `font.family` stack
 * relies on system-installed CJK fonts (see TASK-007-report §7 for the
 * R-04 mitigation status). Keep this object the single place where colours,
 * type and spacing live so the kit components stay presentation-agnostic.
 */
/**
 * 事件卡描述的最大字符数由 **`@forge/schema`** 定义并校验（见
 * `MAX_DESCRIPTION_CHARS`）—— 那是数据契约，不该在渲染层再存一份副本。
 * 这里保留说明：描述由底部字幕条（`SubtitleBar`）承载，超过上限的文本在
 * 故事校验期就会失败，不会等到渲染才被无声裁掉（TASK-011 §3.13）。
 */

export const tokens = {
  color: {
    background: '#0a0e1a',
    /** 背景层渐变的上端色（无素材时也要有纵深，见 Backdrop） */
    backgroundTop: '#141d33',
    foreground: '#e8eaf0',
    accent: '#d4a259', // 关键节点金色
    muted: '#6b7280',
    /**
     * 时间轴线色。
     *
     * 原为 `#2a3144`，对背景 `#0a0e1a` 的对比度仅 **1.49 : 1** —— WCAG 对
     * 非文本图形要求 ≥ 3 : 1，等于"看不见"（TASK-011 §3.5）。`#5a6889`
     * 实测 **3.41 : 1**，达标。
     */
    timelineLine: '#5a6889',
  },
  font: {
    family: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
    titleSize: 88,
    /**
     * 事件标签 / 描述 / 年份的字号。
     *
     * 原值 32 / 20 是按"Studio 预览能看清"定的，不是按"手机上能看清"定的：
     * 以 1920 宽横屏在手机全屏观看，20px 中文物理字高约 0.6 mm，正常阅读
     * 下限 1.5–2 mm，**差约 3 倍**（TASK-011 §3.4）。这里按平台下限重定。
     * 注意卡片整体还会乘 `fitScale`（≈0.85），实际呈现 ≈41px / ≈31px。
     */
    eventLabelSize: 48,
    eventDescSize: 36,
    eventYearSize: 30,
  },
  spacing: {
    /**
     * 事件卡尺寸。
     *
     * 原为 320×180。320 宽 > 8 节点时的间距 240px，是"活动卡必然压住邻居"
     * 的根源（TASK-011 §3.2）。描述已移出卡片交由字幕条承载，卡片只需容纳
     * 年份 + 标签，故收窄到 260×150。
     */
    eventCardWidth: 260,
    eventCardHeight: 150,
  },
} as const;
