# 01 — Help, version and unknown options

Status: ready-for-agent
Blocked by: none

## What to build

Implement acceptance criteria 1–4 in `.scratch/cli-help/spec.md` in the CLI package. Keep argument parsing in a small exported function with unit tests, as `project.ts` and `port.ts` do. Don't add an argument-parsing dependency.

## Acceptance checks

- Vitest: `prints help and exits 0 without starting the server`; `prints the version and exits 0`; `rejects an unknown option with usage on stderr and exit code 2`; `--no-open still prevents opening the browser`.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass.
