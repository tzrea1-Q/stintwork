// SPDX-License-Identifier: Apache-2.0
import type { CheckCommand } from "./project-config.js";

export type CheckStatus = "pending" | "running" | "passed" | "failed" | "cancelled";
export type CheckResult = CheckCommand & {
  status: CheckStatus;
  commit: string;
  durationMs: number;
  outputExcerpt: string;
};
export type CheckExecution = {
  id: string;
  workItem: string;
  commit: string;
  startedAt: string;
  endedAt: string | null;
  results: CheckResult[];
};
export type CheckLiveMessage = { type: "checks"; execution: CheckExecution };
export type WorkItemChecks = {
  evidenceChangedPaths?: Record<string, string[] | null>;
  headCommit: string;
  commands: CheckCommand[];
  checks: CheckResult[];
  checkExecution: CheckExecution | null;
};

export function isCheckExecution(value: unknown): value is CheckExecution {
  if (!value || typeof value !== "object") return false;
  const execution = value as CheckExecution;
  return (
    typeof execution.id === "string" &&
    /^[a-f\d-]{36}$/i.test(execution.id) &&
    typeof execution.workItem === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(execution.workItem) &&
    typeof execution.commit === "string" &&
    /^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(execution.commit) &&
    typeof execution.startedAt === "string" &&
    Number.isFinite(Date.parse(execution.startedAt)) &&
    (execution.endedAt === null ||
      (typeof execution.endedAt === "string" && Number.isFinite(Date.parse(execution.endedAt)))) &&
    Array.isArray(execution.results) &&
    execution.results.every(
      (result) =>
        result &&
        typeof result.name === "string" &&
        typeof result.command === "string" &&
        ["pending", "running", "passed", "failed", "cancelled"].includes(result.status) &&
        result.commit === execution.commit &&
        Number.isFinite(result.durationMs) &&
        result.durationMs >= 0 &&
        typeof result.outputExcerpt === "string",
    )
  );
}

export function latestCheckResults(executions: readonly CheckExecution[]): CheckResult[] {
  const latest = new Map<string, CheckResult>();
  for (const execution of executions)
    for (const result of execution.results) latest.set(result.name, result);
  return [...latest.values()];
}
