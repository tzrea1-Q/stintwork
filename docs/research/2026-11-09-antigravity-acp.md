# Antigravity CLI ACP research

2026-11-09. These are coordinator research findings, not an authenticated Antigravity probe. Neither `agy` nor `gemini` was installed on the coordinator machine.

## Why Antigravity

The [Gemini CLI package](https://www.npmjs.com/package/@google/gemini-cli) README said unpaid and Google One users had Gemini CLI replaced by Antigravity CLI on 2026-06-18 and recommended Antigravity for Gemini 4 Argon. The coordinator observed npm latest 0.67.0, modified 2026-11-06. The maintainer selected Antigravity for M12.

## Findings

- The [official ACP documentation](https://antigravity.google/docs/ide/extensions/acp/) describes `agy acp`, a protocol version 1 server over stdio, identifying as “Antigravity ACP Server”. Check `agy acp --help` on the installed version. A [third-party command reference](https://toolsbase.dev/en/reference/antigravity-cli-commands), updated 2026-11-04, says ACP was added in v1.5.0. The CLI itself is the server; an [unofficial integration article](https://2bab.me/en/blog/2026-10-18-antigravity-external-integration/) says it is not an npm package. The command reference gives the [installer](https://antigravity.google/cli/install.sh) and `~/.local/bin/agy` as its install location.
- The official documentation lists `--add-dir`, `--agent`, `--sandbox`, `--dangerously-skip-permissions`, `--process-per-session`, `--ide-mcp-port`, `--login`, `--log-file` and `--disable-telemetry`. Sandbox and skip-permissions default to false. Stintwork must not enable skip-permissions or change sandbox behavior.
- The official documentation describes session loading, resuming, listing and closing, and says resume does not replay history. The command reference agrees, but the unofficial integration article says `session/load` restores full history. Test the actual updates and continuation after a new process; do not assume either account applies to the tested version.
- The official documentation says cancellation ends open tool calls and abandons pending permission requests. It describes Allow/Deny and preserves user permission rules; the unofficial article shows `allow_once` and `reject_once`. The command reference lists `default`, `accept-edits` and `plan` modes. The official documentation also lists per-session model and thinking options and a slash-command menu.
- The official documentation lists personal and business OAuth, Gemini API key, agent platform and terminal login. An interactive `agy` session supplies cached credentials; without them ACP reports “Authentication required” (-32000). It identifies `~/.gemini/antigravity-cli/log/acp-*.log` as a log location. Agents must not sign in or read credentials.
- The unofficial article says the server remains resident without an idle timeout, leaving lifecycle management to the host. This new interface may change.

## Probe and remaining evidence

The coordinator needs the maintainer to install `agy` and sign in. Record the version, platform and the basic, commands, permission, cancel and new-process resume scenarios, including advertised capabilities, mode and option IDs, history updates, cancellation of pending requests and process cleanup. Establish the minimum version that actually passes; v1.5.0 is a reported introduction, not proof of compatibility. Record failures and choose the M10 checkpoint fallback if recovery is not proven. Do not capture credentials.

Grok Build 1.0.62 was installed locally. Its 2026-11-09 basic probe `2026-11-09T12-07-43-010Z-grok` returned “Authentication required; updates=none”; the 2026-10-11 attempt was rate limited. The maintainer will sign in again before the coordinator reruns it.
