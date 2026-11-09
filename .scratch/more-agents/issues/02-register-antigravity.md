# 02 — Register Antigravity CLI

Status: ready-for-agent
Blocked by: 01

## What to build

Register Antigravity CLI using installed `agy` on PATH and the version floor proven by ticket 01. Provide its observed capability profile and launch `agy acp` without `--dangerously-skip-permissions` or sandbox changes. Follow the existing native Grok detection and preparation flow where applicable. Show an authentication-required message directing the developer to sign in with `agy`, and setup/readiness copy in English and zh-CN. Mark it experimental.

## Acceptance criteria

- [ ] Missing, unparseable and below-floor versions are clearly unavailable; a compatible installed executable is selected and launched without a bundled adapter.
- [ ] Fake-process tests cover detection, version floor, launch arguments, authentication and localized readiness messages. No credentials are read.

## Comments

None yet.
