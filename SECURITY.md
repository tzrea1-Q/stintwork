# Security

## Report privately

Report security problems through [GitHub private vulnerability reporting](https://github.com/tzrea1-Q/stintwork/security/advisories/new). Include the affected version, steps to reproduce and impact. Do not open a public issue or include credentials in a report.

## Supported versions

Only the latest published version is supported. Update before checking whether a problem still occurs.

## Local agents and permissions

Stintwork runs locally with the developer's own installed agent CLIs and logins. It does not handle credentials or provide model access. See [decision record 0003](docs/adr/0003-use-the-developers-own-agents-and-logins.md).

Permission levels depend on requests the agent sends. They are not an independent security boundary; Codex can run commands without asking. See the [v0.1.1 known limitations](docs/release-notes/0.1.1.md#known-limitations). Only run agents on projects you trust and can safely change.
