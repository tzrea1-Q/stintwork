# CLI help and version

Status: ready-for-agent

Milestone: M3 · Needs you and every agent. Used as the real ticket for the M3 exit test (`.scratch/needs-you/issues/11-m3-exit.md`).

## Problem

`stintwork` accepts `--no-open` and nothing else. It has no `--help` or `--version`, and an unknown flag is silently ignored, so a typo like `--no-opne` opens the browser anyway.

## Acceptance criteria

1. `stintwork --help` (and `-h`) prints a short usage text listing every option, then exits 0 without starting the server.
2. `stintwork --version` (and `-v`) prints only the version number (for example `0.0.0`), using the CLI package's version, then exits 0 without starting the server.
3. An unknown option prints `Unknown option: <option>` and the usage text to stderr, then exits 2 without starting the server.
4. `--no-open` keeps working.
