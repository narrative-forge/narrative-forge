/**
 * @forge/kit — 时间格式化。
 *
 * `Node.time` 是 ISO 8601（`1936-10-09`），画面上要显示成 `1936.10.09` /
 * `1936.10`（参照项目 `story-timeline-view` 的 `year` 字段形态）。
 *
 * TASK-011 §3.7：`time` 在 schema 里是**必填**字段，但渲染层此前一次都没
 * 把它传进画面 —— 观众看不到这条线是 1935-10 → 1936-10，"时间线"退化成
 * "一排并行卡片"。这里提供两种粒度的格式化，供卡片与轴线刻度使用。
 */

/** 月份 01–12、日 01–31 的范围校验（不校验大小月，画面不显示非法值即可）。 */
function isPlausibleDate(month: string, day: string): boolean {
  const m = Number(month);
  const d = Number(day);
  return m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

/** `1936-10-09` → `1936.10.09`；无法解析时返回空串（不抛错，不显示）。 */
export function formatFullDate(time: string | undefined): string {
  if (typeof time !== 'string') return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(time);
  if (match === null) return '';
  const year = match[1] ?? '';
  const month = match[2] ?? '';
  const day = match[3] ?? '';
  if (!isPlausibleDate(month, day)) return '';
  return `${year}.${month}.${day}`;
}

/** `1936-10-09` → `1936.10`（轴线刻度用，避免节点密集时互相挤压）。 */
export function formatYearMonth(time: string | undefined): string {
  if (typeof time !== 'string') return '';
  const match = /^(\d{4})-(\d{2})/.exec(time);
  if (match === null) return '';
  const year = match[1] ?? '';
  const month = match[2] ?? '';
  const m = Number(month);
  if (m < 1 || m > 12) return '';
  return `${year}.${month}`;
}

/**
 * 由节点时间推导整条片子的年份区间，如 `1935.10 — 1936.10`。
 *
 * 片头副标题原先是**硬编码**的 `'1934 — 1936 · 长征会师'`，而数据首节点是
 * 1935-10-19 —— 画面上的年份写的是数据里不存在的内容（TASK-011 §3.12）。
 * 改为从数据推导，换数据即换年份，不会说谎。
 */
export function formatTimeRange(times: readonly (string | undefined)[]): string {
  const valid = times
    .filter((t): t is string => typeof t === 'string' && formatYearMonth(t) !== '')
    .sort();
  if (valid.length === 0) return '';
  const first = formatYearMonth(valid[0]);
  const last = formatYearMonth(valid[valid.length - 1] ?? valid[0]);
  return first === last ? first : `${first} — ${last}`;
}
