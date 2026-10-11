// SPDX-License-Identifier: Apache-2.0
import { createRequire } from "node:module";

export function adapterEntry(
  adapter: "codex-acp" | "claude-agent-acp",
  from = import.meta.url,
): string {
  return createRequire(from).resolve(`@agentclientprotocol/${adapter}/dist/index.js`);
}
