/**
 * @forge/schema — schema versioning.
 *
 * Single source of truth for the Story schema version. As the schema
 * evolves (e.g. when new view types or node kinds are added), a story
 * authored against an older version can be upgraded to the current
 * version through a registered migration hook before validation.
 */

export const SCHEMA_VERSION = '0.1.0' as const;

export type SchemaVersion = typeof SCHEMA_VERSION;

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
