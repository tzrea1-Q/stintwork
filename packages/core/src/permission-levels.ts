// SPDX-License-Identifier: Apache-2.0
import { parse, stringify } from "yaml";
import type { AgentProfile } from "./agents.js";
import { readProjectConfig } from "./project-config.js";
import { safeCommandPaths } from "./safe-commands.js";

export const permissionLevels = ["ask", "edit-freely", "autonomous"] as const;
export type PermissionLevel = (typeof permissionLevels)[number];
export const defaultPermissionLevel: PermissionLevel = "edit-freely";

export function isPermissionLevel(value: unknown): value is PermissionLevel {
  return permissionLevels.some((level) => level === value);
}

export function permissionPolicy(profile: AgentProfile, level: PermissionLevel) {
  const mode =
    profile.id === "codex"
      ? level === "ask"
        ? "read-only"
        : "workspace-write"
      : profile.id === "claude"
        ? // Claude's "default" mode asks before every change; "plan" would forbid changes outright.
          level === "ask"
          ? "default"
          : "acceptEdits"
        : profile.capabilities.defaultMode;
  const supported = mode === null || profile.capabilities.modes.includes(mode);
  const warnings = [...(profile.warnings ?? [])];
  if (!supported)
    warnings.push(
      `${profile.displayName} does not offer the required ${mode} mode; it cannot honour this permission level.`,
    );
  if (profile.id === "codex")
    warnings.push(
      "Codex’s sandbox can execute commands without asking. Stintwork only controls requests Codex sends; commands and access outside the worktree may not produce a request.",
    );
  if (
    profile.capabilities.permissionMode === "always-approve" &&
    !warnings.some((warning) => warning.includes("always-approve"))
  )
    warnings.push(
      `${profile.displayName} has an always-approve config and never asks. Stintwork can only answer requests the agent sends and cannot enforce the worktree boundary.`,
    );
  return { mode, autoAnswer: level, warnings };
}

export function projectPermissionLevel(text?: string): PermissionLevel {
  return readProjectConfig(text).permissionLevel;
}

export function updateProjectPermissionLevel(text: string | undefined, level: PermissionLevel) {
  projectPermissionLevel(text);
  return stringify({ ...(text === undefined ? {} : parse(text)), permissionLevel: level });
}

export type PermissionToolCall = {
  kind?: string | null;
  rawInput?: unknown;
  locations?: readonly { path: string }[] | null;
  content?: readonly { type: string; path?: string }[] | null;
};

function absolutePath(path: string, cwd: string): string {
  const parts: string[] = [];
  for (const part of (path.startsWith("/") ? path : `${cwd}/${path}`).split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return `/${parts.join("/")}`;
}

export function permissionPaths(
  level: PermissionLevel,
  tool: PermissionToolCall,
  worktree: string,
): string[] | null {
  if (level === "ask" || !worktree.startsWith("/")) return null;
  const input =
    tool.rawInput && typeof tool.rawInput === "object" && !Array.isArray(tool.rawInput)
      ? (tool.rawInput as Record<string, unknown>)
      : {};
  const kind = tool.kind ?? (input.name === "Bash" ? "execute" : undefined);
  if (kind !== "edit" && kind !== "execute") return null;
  if (
    input.url !== undefined ||
    input.permissions !== undefined ||
    input.additionalPermissions !== undefined ||
    input.networkApprovalContext !== undefined
  )
    return null;
  const cwd = input.cwd ?? input.working_directory ?? worktree;
  if (typeof cwd !== "string" || !cwd.startsWith("/") || /[\0$`~\\]/.test(cwd)) return null;
  const paths = [cwd];
  for (const location of tool.locations ?? []) paths.push(location.path);
  for (const content of tool.content ?? []) if (content.path) paths.push(content.path);
  for (const [key, value] of Object.entries(input)) {
    if (/^(?:path|file_path|filePath|paths|cwd|working_directory|directory)$/.test(key)) {
      if (typeof value === "string") paths.push(value);
      else if (Array.isArray(value) && value.every((path) => typeof path === "string"))
        paths.push(...value);
      else return null;
    }
  }
  if (kind === "execute" && level === "edit-freely") {
    // Claude keeps its shell inside the project; relative paths safe from the worktree root stay inside from any subdirectory.
    if (input.sandbox_permissions === "require_escalated" || input.network === true) return null;
    const targets = safeCommandPaths(input.command);
    if (targets === null) return null;
    paths.push(...targets);
  } else if (kind === "execute") {
    // ponytail: inspect literal shell paths only; full process confinement needs an agent sandbox.
    if (input.cwd === undefined && input.working_directory === undefined) return null;
    const command =
      Array.isArray(input.command) && input.command.every((part) => typeof part === "string")
        ? input.command.join(" ")
        : input.command;
    if (
      typeof command !== "string" ||
      !command.trim() ||
      /[\0$`~\\\n\r(){}*?[\]]/.test(command) ||
      /\b(?:cd|pushd|popd|eval|exec|sh|bash|zsh|fish|python\d*|node|ruby|perl|curl|wget|ssh)\b/.test(
        command,
      ) ||
      input.sandbox_permissions === "require_escalated" ||
      input.network === true
    )
      return null;
    const tokenPattern = /(?:[^\s"'<>|;&]+|"[^"]*"|'[^']*')+/g;
    const tokens = command.match(tokenPattern) ?? [];
    if (!/^[\s<>|;&]*$/.test(command.replace(tokenPattern, ""))) return null;
    for (const token of tokens) {
      const unquoted = token.replace(/["']/g, "");
      const value = /^(?:--?[\w-]+|[A-Za-z_]\w*)=/.test(unquoted)
        ? unquoted.slice(unquoted.indexOf("=") + 1)
        : unquoted;
      if (value) paths.push(value);
    }
  } else if (paths.length === 1 || input.command !== undefined) return null;
  const boundary = absolutePath(worktree, worktree);
  const targets = paths.map((path) => absolutePath(path, cwd));
  if (kind === "edit" && targets.every((path) => path === absolutePath(cwd, cwd))) return null;
  return paths.every(
    (path) => path.length > 0 && !/[\0$`~\\]/.test(path) && !path.split("/").includes(".."),
  ) && targets.every((path) => path === boundary || path.startsWith(`${boundary}/`))
    ? targets
    : null;
}
