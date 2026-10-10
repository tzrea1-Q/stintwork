import { parse } from "yaml";
import {
  defaultPermissionLevel,
  isPermissionLevel,
  type PermissionLevel,
} from "./permission-levels.js";

export type CheckCommand = { name: string; command: string };
export type ProjectConfig = { permissionLevel: PermissionLevel; checks?: CheckCommand[] };

export function readProjectConfig(text?: string): ProjectConfig {
  const config = text === undefined ? {} : parse(text);
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new Error(".stintwork/config must contain a mapping.");
  const permissionLevel =
    config.permissionLevel === undefined ? defaultPermissionLevel : config.permissionLevel;
  if (!isPermissionLevel(permissionLevel)) throw new Error("Invalid project permission level.");
  if (config.checks === undefined) return { permissionLevel };
  if (
    !Array.isArray(config.checks) ||
    !config.checks.every(
      (check: unknown) =>
        check !== null &&
        typeof check === "object" &&
        "name" in check &&
        typeof check.name === "string" &&
        !!check.name.trim() &&
        "command" in check &&
        typeof check.command === "string" &&
        !!check.command.trim() &&
        !check.name.includes("\0") &&
        !check.command.includes("\0"),
    )
  )
    throw new Error("Checks must be a list of named commands.");
  if (new Set(config.checks.map((check: CheckCommand) => check.name)).size !== config.checks.length)
    throw new Error("Check names must be unique.");
  return {
    permissionLevel,
    checks: config.checks.map(({ name, command }: CheckCommand) => ({ name, command })),
  };
}

export function defaultCheckCommands(packageText?: string, manager = "npm"): CheckCommand[] {
  if (packageText === undefined) return [];
  const scripts = JSON.parse(packageText)?.scripts;
  return ["test", "lint", "typecheck", "build", "format:check"]
    .filter((name) => typeof scripts?.[name] === "string" && !!scripts[name].trim())
    .map((name) => ({ name, command: `${manager} run ${name}` }));
}
