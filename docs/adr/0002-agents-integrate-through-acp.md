# Agents integrate through the Agent Client Protocol

Stintwork talks to agents through ACP: the official adapters for Claude Code (`@agentclientprotocol/claude-agent-acp`) and Codex (`@agentclientprotocol/codex-acp`), and Grok Build's native `grok agent stdio`. An embedded terminal running the agent's own CLI is the fallback. The 2026-10-09 probe showed all three stream structured events, list and invoke skills, cancel within milliseconds, and resume sessions over ACP. That's what the structured UI needs (Needs you, live stints, permission prompts). Each agent's own CLI flags or app-server would mean three integrations to maintain.

## Consequences

Agent support follows the ACP adapters' release cadence, so the probe in `spikes/acp-probe/` should be rerun when adapters update. Capabilities differ per agent (modes, permissions), so Stintwork keeps a per-agent capability profile rather than assuming uniform behaviour.
