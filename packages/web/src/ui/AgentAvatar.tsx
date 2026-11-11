// SPDX-License-Identifier: Apache-2.0
import { Avatar, AvatarFallback } from "./Avatar";
import { cn } from "./cn";
const colors: Record<string, string> = {
  claude: "bg-agent-claude-soft text-agent-claude",
  codex: "bg-agent-codex-soft text-agent-codex",
  grok: "bg-agent-grok-soft text-agent-grok",
  antigravity: "bg-agent-antigravity-soft text-agent-antigravity",
};
export function AgentAvatar({
  agent,
  name,
  active = false,
  size = "md",
}: {
  agent: string;
  name: string;
  active?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <Avatar
      role="img"
      aria-label={name}
      className={cn(
        size === "sm" ? "size-5" : "size-7",
        active && "ring-2 ring-running motion-safe:animate-pulse",
      )}
    >
      <AvatarFallback className={colors[agent] ?? "bg-stopped-soft text-stopped-foreground"}>
        {name.trim().charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
