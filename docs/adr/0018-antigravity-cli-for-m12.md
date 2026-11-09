# Use Antigravity CLI for M12

Status: accepted 2026-11-09 by the maintainer.

M12 adds Antigravity CLI over ACP instead of Gemini CLI. Gemini CLI was replaced for unpaid and Google One users on 2026-06-18; Antigravity has an official ACP server. See the [research](../research/2026-11-09-antigravity-acp.md).

Find the developer's installed `agy` on PATH and launch `agy acp`, like Grok's native server. Do not change sandbox defaults or skip permissions. The developer signs in; ADR 0003's no-credentials boundary holds. There is no bundled adapter, so the adapter pins and bundled fallback in ADRs 0002 and 0011 do not apply in the same way. Require a minimum installed CLI version proven by the authenticated probe; a reported v1.5.0 introduction alone is not proof. Missing, unparseable or below-floor versions must not be treated as compatible.

Antigravity starts experimental until the M12 exit. Apply ADR 0012's restart safeguards only if the probe proves recovery; otherwise use its checkpoint fallback. Record the evidence and version floor before enabling support.
