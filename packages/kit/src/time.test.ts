import { describe, expect, it } from 'vitest';
import { formatFullDate, formatTimeRange, formatYearMonth } from './time.js';

describe('formatFullDate', () => {
  it('把 ISO 日期渲染成画面上的点分格式', () => {
    expect(formatFullDate('1936-10-09')).toBe('1936.10.09');
    expect(formatFullDate('1935-10-19')).toBe('1935.10.19');
  });

  it('带时间的 ISO 只取日期部分', () => {
    expect(formatFullDate('1936-10-09T10:00:00Z')).toBe('1936.10.09');
  });

  it('missing / 非法值返回空串而不抛错（画面上就是不显示）', () => {
    expect(formatFullDate(undefined)).toBe('');
    expect(formatFullDate('')).toBe('');
    expect(formatFullDate('not-a-date')).toBe('');
    expect(formatFullDate('1936-13-45')).toBe('');
  });
});

describe('formatYearMonth', () => {
  it('只保留年月，供轴线刻度使用', () => {
    expect(formatYearMonth('1936-10-09')).toBe('1936.10');
  });

  it('missing / 非法值返回空串', () => {
    expect(formatYearMonth(undefined)).toBe('');
    expect(formatYearMonth('xx')).toBe('');
  });
});

describe('formatTimeRange', () => {
  it('由节点时间推导区间，与节点在数组中的顺序无关', () => {
    // 数据里节点是按时间正序写的，但推导不该依赖这个假设。
    expect(formatTimeRange(['1936-10-09', '1935-10-19', '1936-10-22'])).toBe('1935.10 — 1936.10');
  });

  it('首尾同月时只显示一个月份', () => {
    expect(formatTimeRange(['1936-10-09', '1936-10-22'])).toBe('1936.10');
  });

  it('空数组 / 全非法值返回空串', () => {
    expect(formatTimeRange([])).toBe('');
    expect(formatTimeRange([undefined, 'nope'])).toBe('');
  });

  it('会宁 demo 的真实区间是 1935.10 — 1936.10', () => {
    // TASK-011 §3.12：片头原先硬编码 '1934 — 1936'，而数据首节点是
    // 1935-10-19 —— 画面上的 1934 在故事里并不存在。这条测试锁住推导结果。
    const times = [
      '1935-10-19',
      '1936-05-01',
      '1936-07-02',
      '1936-07-05',
      '1936-08-01',
      '1936-10-09',
      '1936-10-15',
      '1936-10-22',
    ];
    expect(formatTimeRange(times)).toBe('1935.10 — 1936.10');
  });
});
