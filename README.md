# Narrative Forge

> Monorepo skeleton — Phase 1 scaffold.

This repository is the initial **monorepo skeleton** for the Narrative Forge
project. It defines the workspace structure, shared tooling, and seven empty
packages. No business logic has been implemented yet.

The full project overview will be written at the end of Phase 1.

## Structure (ADR-003)

```
packages/
  schema/          # @forge/schema      — shared type/contract definitions
  core/            # @forge/core        — core domain logic
  layouts/         # @forge/layouts     — layout primitives
  kit/             # @forge/kit         — reusable UI/content kit
  compositions/    # @forge/compositions— composition building blocks
  render/          # @forge/render      — rendering pipeline
  cli/             # @forge/cli         — command-line interface
```

## Tooling

- **Package manager:** pnpm `8.15.0` (pinned via `packageManager`)
- **Runtime:** Node.js `>=18.17`
- **Language:** TypeScript `5.3.3`, `strict` mode
- **Lint / Format:** Biome `1.5.3` (single tool)
- **Tests:** Vitest `1.2.2`

## Quick start

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
pnpm lint
```

## References

- Engineering baseline: `docs/engineering-baseline.md`
- Monorepo structure decision: `docs/adr/ADR-003-monorepo-structure.md`

> These documents are produced by the engineering-baseline task (TASK-002)
> and are not part of this skeleton task.
