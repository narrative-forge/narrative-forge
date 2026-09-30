/**
 * @forge/kit — design tokens.
 *
 * Single source of visual constants for Narrative Forge compositions.
 * Phase 1 deliberately ships **no font files**; the `font.family` stack
 * relies on system-installed CJK fonts (see TASK-007-report §7 for the
 * R-04 mitigation status). Keep this object the single place where colours,
 * type and spacing live so the kit components stay presentation-agnostic.
 */
export const tokens = {
  color: {
    background: '#0a0e1a',
    foreground: '#e8eaf0',
    accent: '#d4a259', // 关键节点金色
    muted: '#6b7280',
    timelineLine: '#2a3144',
  },
  font: {
    family: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
    titleSize: 72,
    eventLabelSize: 32,
    eventDescSize: 20,
  },
  spacing: {
    eventCardWidth: 320,
    eventCardHeight: 180,
  },
} as const;
