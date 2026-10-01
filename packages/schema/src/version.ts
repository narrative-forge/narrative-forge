/**
 * @forge/schema — schema versioning.
 *
 * Single source of truth for the Story schema version. As the schema
 * evolves (e.g. when new view types or node kinds are added), a story
 * authored against an older version can be upgraded to the current
 * version through a registered migration hook before validation.
 */

export const SCHEMA_VERSION = '0.1.1' as const;

export type SchemaVersion = typeof SCHEMA_VERSION;

/**
 * Changelog
 *
 * ## 0.1.1 — TASK-008 Step A（破坏性变更）
 *
 * - **移除 `View.duration`**（BREAKING）。视频时长自始由 `buildSchedule()`
 *   单独决定，该字段是第二个真值来源，会宁 demo 上二者相差 68 秒
 *   （声明 30s vs 计算 98.05s）。删除该字段后，时长唯一来源于调度表。
 * - 仍带 `duration` 的旧 story 现在会在 `views.N.duration` 处校验失败，
 *   而非被静默忽略。升级方式：从 story.json 中删掉该键。
 * - 其余字段、类型与不变式与 0.1.0 完全一致；Story / Node / Edge / Asset
 *   未改动。
 *
 * ## 0.1.0 — TASK-004
 *
 * - 首个 Story Schema 版本：timeline 视图的最小字段集（ADR-002，JSON + Zod）。
 */

/**
 * A migration hook upgrades a raw (already-parsed) story object from a
 * previous schema version to the current one. Hooks are keyed by the
 * version they migrate *from*.
 */
export type MigrationHook = (raw: unknown) => unknown;

const migrations = new Map<string, MigrationHook>();

/** Register a migration that upgrades stories authored at `fromVersion`. */
export function registerMigration(fromVersion: string, hook: MigrationHook): void {
  migrations.set(fromVersion, hook);
}

/** Look up the migration hook for a given source version, if any. */
export function getMigration(fromVersion: string): MigrationHook | undefined {
  return migrations.get(fromVersion);
}

/** Currently registered migration source versions (for introspection/tests). */
export function registeredMigrationVersions(): string[] {
  return [...migrations.keys()];
}
