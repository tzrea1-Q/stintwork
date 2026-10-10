# 01 — Help, version and unknown options

Status: resolved
Blocked by: none

## What to build

Implement acceptance criteria 1–4 in `.scratch/cli-help/spec.md` in the CLI package. Keep argument parsing in a small exported function with unit tests, as `project.ts` and `port.ts` do. Don't add an argument-parsing dependency.

## Acceptance checks

- Vitest: `prints help and exits 0 without starting the server`; `prints the version and exits 0`; `rejects an unknown option with usage on stderr and exit code 2`; `--no-open still prevents opening the browser`.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass.

## Comments

- Implemented help, version and unknown-option handling; help and version exit before server startup, and `--no-open` remains supported.
- Checks passed: `pnpm exec vitest run packages/cli` (8 tests); `pnpm format:check`; `pnpm lint`; `pnpm typecheck`; `pnpm build`; `env -u CLAUDE_CODE_EXECUTABLE pnpm exec vitest run --reporter=verbose --maxWorkers=2` (69 files, 658 tests). Built CLI smoke: `--version` printed `0.0.0`; `--help` printed usage; `--no-opne` printed usage to stderr and exited 2.
