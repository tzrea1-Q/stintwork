// SPDX-License-Identifier: Apache-2.0
import { readResponseJson, useLanguage } from "./i18n/language";
import { en } from "./i18n/en";
import {
  applyStintLogEntry,
  parseWorkflowDefinition,
  isStintLogEntry,
  isCheckpointWarnings,
  isRiskyPaths,
  isStintEvent,
  isBriefHandoff,
  isReviewFindings,
  summarizeStint,
  deriveAttentionItems,
  isCheckExecution,
  type ProjectSnapshot,
  readCoreTextWire,
  type WorkflowStage,
} from "@stintwork/core";
import { useEffect, useState } from "react";

export type Connection = "connecting" | "live" | "reconnecting";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStintSummary(value: unknown) {
  return (
    isRecord(value) &&
    ["id", "workItem", "stage", "agent", "startedAt"].every(
      (key) => typeof value[key] === "string",
    ) &&
    (value.ticket === null || Number.isSafeInteger(value.ticket)) &&
    ["running", "finished", "stopped", "failed", "interrupted"].includes(String(value.status)) &&
    (value.endedAt === null || typeof value.endedAt === "string") &&
    (value.error === undefined || typeof value.error === "string") &&
    (value.checkpointCommit == null || typeof value.checkpointCommit === "string") &&
    (value.worktree === undefined ||
      (isRecord(value.worktree) &&
        typeof value.worktree.path === "string" &&
        typeof value.worktree.branch === "string")) &&
    (value.checkpointWarnings === undefined || isCheckpointWarnings(value.checkpointWarnings)) &&
    (value.handoff == null || isBriefHandoff(value.handoff)) &&
    (value.findings === undefined || isReviewFindings(value.findings)) &&
    (value.handoffAnswer === undefined ||
      (isRecord(value.handoffAnswer) &&
        typeof value.handoffAnswer.at === "string" &&
        !Number.isNaN(Date.parse(value.handoffAnswer.at)) &&
        (value.handoffAnswer.note === null ||
          (typeof value.handoffAnswer.note === "string" &&
            value.handoffAnswer.note.trim().length > 0))))
  );
}

function isAttentionItem(value: unknown, stages: readonly WorkflowStage[]) {
  return (
    isRecord(value) &&
    ["id", "title", "details", "raisedAt"].every((key) => typeof value[key] === "string") &&
    (value.ticket === null ||
      (Number.isSafeInteger(value.ticket) && (value.ticket as number) > 0)) &&
    !Number.isNaN(Date.parse(value.raisedAt as string)) &&
    ((value.kind === "login-required" &&
      value.workItem === null &&
      value.ticket === null &&
      value.stintId === null &&
      typeof value.agent === "string" &&
      typeof value.loginCommand === "string" &&
      value.loginCommand.trim().length > 0) ||
      (typeof value.workItem === "string" &&
        (((value.kind === "gate-ready" || value.kind === "approval-stale") &&
          value.ticket === null &&
          (value.stintId === null ||
            (value.kind === "gate-ready" && typeof value.stintId === "string")) &&
          (value.agent === null ||
            (value.kind === "gate-ready" && typeof value.agent === "string")) &&
          stages.some((stage) => stage.id === value.stage)) ||
          (typeof value.stintId === "string" &&
            typeof value.agent === "string" &&
            (value.kind === "handoff-unresolved" ||
              (value.kind === "checkpoint-warning" && isCheckpointWarnings(value.warnings)) ||
              (value.kind === "memory-proposal" &&
                ["path", "diff", "baseCommit", "checkpointCommit"].every(
                  (key) => typeof value[key] === "string",
                )) ||
              (value.kind === "permission" &&
                typeof value.requestId === "string" &&
                Array.isArray(value.options) &&
                value.options.every(
                  (option) =>
                    isRecord(option) &&
                    ["optionId", "name", "kind"].every((key) => typeof option[key] === "string"),
                )))))))
  );
}

function readSnapshot(value: unknown): ProjectSnapshot {
  if (!isRecord(value) || !isRecord(value.workflows) || Array.isArray(value.workflows))
    throw new Error(en.connection.errors.invalidWorkflows);
  const workflows = Object.fromEntries(
    Object.entries(value.workflows).map(([id, definition]) => {
      const workflow = parseWorkflowDefinition(JSON.stringify(definition));
      if (workflow.id !== id) throw new Error(en.connection.errors.invalidWorkflowId);
      return [id, workflow];
    }),
  );
  const stages = Object.values(workflows).flatMap((workflow) => workflow.stages);
  const warningsValid = (warnings: unknown) =>
    Array.isArray(warnings) &&
    warnings.every(
      (warning) =>
        isRecord(warning) &&
        typeof warning.path === "string" &&
        typeof warning.message === "string",
    );
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    !Array.isArray(value.attentionItems) ||
    !value.attentionItems.every((item) => isAttentionItem(item, stages)) ||
    !Array.isArray(value.agents) ||
    !value.agents.every(
      (agent) =>
        isRecord(agent) &&
        typeof agent.id === "string" &&
        typeof agent.displayName === "string" &&
        isRecord(agent.capabilities) &&
        (agent.capabilities.declineEndsTurn === null ||
          typeof agent.capabilities.declineEndsTurn === "boolean"),
    ) ||
    (value.branch !== undefined && typeof value.branch !== "string") ||
    !warningsValid(value.warnings) ||
    !isRecord(value.setup) ||
    ![
      "hasIssueTracker",
      "usesLocalMarkdown",
      "hasAgents",
      "hasClaude",
      "hasGlossary",
      "hasAdrs",
    ].every((key) => typeof (value.setup as Record<string, unknown>)[key] === "boolean") ||
    !warningsValid(value.setup.warnings) ||
    !isRecord(value.workflows) ||
    !Array.isArray(value.milestones) ||
    !value.milestones.every(
      (milestone) =>
        isRecord(milestone) &&
        typeof milestone.id === "string" &&
        typeof milestone.name === "string" &&
        ["planned", "active", "shipped"].includes(String(milestone.status)),
    ) ||
    !Array.isArray(value.workItems) ||
    !value.workItems.every(
      (item) =>
        isRecord(item) &&
        typeof item.slug === "string" &&
        typeof item.title === "string" &&
        ["feature", "effort"].includes(String(item.type)) &&
        typeof item.workflow === "string" &&
        Object.hasOwn(workflows, item.workflow) &&
        typeof item.inferred === "boolean" &&
        (item.column === undefined || stages.some((stage) => stage.column === item.column)) &&
        (item.stage === undefined ||
          workflows[item.workflow].stages.some(
            (stage) => stage.id === item.stage && stage.column === item.column,
          )) &&
        (item.milestone === undefined || typeof item.milestone === "string") &&
        (item.headCommit === undefined || typeof item.headCommit === "string") &&
        (item.reviewEvidenceError === undefined || typeof item.reviewEvidenceError === "string") &&
        (item.riskyPaths === undefined || isRiskyPaths(item.riskyPaths)) &&
        (item.checkCommands === undefined ||
          (Array.isArray(item.checkCommands) &&
            item.checkCommands.every(
              (command: unknown) =>
                isRecord(command) &&
                typeof command.name === "string" &&
                typeof command.command === "string",
            ))) &&
        (item.evidenceChangedPaths === undefined ||
          (isRecord(item.evidenceChangedPaths) &&
            !Array.isArray(item.evidenceChangedPaths) &&
            Object.values(item.evidenceChangedPaths).every(
              (paths) =>
                paths === null ||
                (Array.isArray(paths) && paths.every((path) => typeof path === "string")),
            ))) &&
        Array.isArray(item.stints) &&
        item.stints.every(isStintSummary) &&
        (item.activeStint === null ||
          (isRecord(item.activeStint) &&
            isStintSummary(item.activeStint) &&
            item.activeStint.status === "running" &&
            Array.isArray(item.activeStint.events) &&
            item.activeStint.events.every(isStintEvent))) &&
        (item.spec === null ||
          (isRecord(item.spec) &&
            typeof item.spec.path === "string" &&
            typeof item.spec.text === "string")) &&
        Array.isArray(item.tickets) &&
        item.tickets.every(
          (ticket: unknown) =>
            isRecord(ticket) &&
            Number.isSafeInteger(ticket.number) &&
            typeof ticket.slug === "string" &&
            typeof ticket.title === "string" &&
            typeof ticket.status === "string" &&
            typeof ticket.body === "string" &&
            typeof ticket.path === "string" &&
            Array.isArray(ticket.blockedBy) &&
            ticket.blockedBy.every((number: unknown) => Number.isSafeInteger(number)) &&
            typeof ticket.resolved === "boolean" &&
            typeof ticket.blocked === "boolean",
        ),
    )
  )
    throw new Error(en.connection.errors.invalidSnapshot);
  return readCoreTextWire(value) as ProjectSnapshot;
}

export function useProjectSnapshot() {
  const { t } = useLanguage();
  const [snapshot, setSnapshot] = useState<ProjectSnapshot>();
  const [connection, setConnection] = useState<Connection>("connecting");
  const [failure, setError] = useState<string | number>();
  const error =
    typeof failure === "number"
      ? t.connection.errors.requestFailed(failure)
      : Object.entries(en.connection.errors).reduce(
          (message, [key, original]) =>
            message === original
              ? t.connection.errors[
                  key as Exclude<keyof typeof en.connection.errors, "requestFailed">
                ]
              : message,
          failure,
        );

  useEffect(() => {
    let disposed = false;
    let live = false;
    let version = 0;
    let attempts = 0;
    let socket: WebSocket | undefined;
    let request: AbortController | undefined;
    let reloadRequested = false;
    let requestTimeout: ReturnType<typeof setTimeout> | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const sequences = new Map<string, number>();

    async function load() {
      if (disposed || request) return;
      const controller = new AbortController();
      request = controller;
      const startedAt = version;
      const timeout = setTimeout(() => controller.abort(), 8000);
      requestTimeout = timeout;
      try {
        const response = await fetch("/api/project", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw response.status;
        const next = readSnapshot(await readResponseJson(response));
        if (!disposed && startedAt === version) {
          setSnapshot(next);
          setError(undefined);
        }
      } catch (cause) {
        if (!disposed && startedAt === version) {
          setError(
            controller.signal.aborted
              ? en.connection.errors.timeout
              : typeof cause === "number"
                ? cause
                : cause instanceof TypeError ||
                    (cause instanceof Error && cause.name === "NetworkError")
                  ? en.connection.errors.unreachable
                  : cause instanceof SyntaxError
                    ? en.connection.errors.invalidSnapshot
                    : cause instanceof Error
                      ? cause.message
                      : en.connection.errors.unreachable,
          );
        }
      } finally {
        clearTimeout(timeout);
        requestTimeout = undefined;
        request = undefined;
        if (reloadRequested) {
          reloadRequested = false;
          void load();
        }
      }
    }

    function disconnect() {
      if (socket) {
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
        socket = undefined;
      }
      clearTimeout(deadline);
    }

    function retry() {
      if (disposed) return;
      disconnect();
      live = false;
      setConnection("reconnecting");
      void load();
      reconnect = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 30_000));
    }

    function connect() {
      try {
        const url = new URL("/api/live", window.location.href);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        socket = new WebSocket(url);
        deadline = setTimeout(retry, 8000);
        socket.onmessage = (event) => {
          try {
            const message: unknown = JSON.parse(event.data);
            if (isRecord(message) && message.type === "checks") {
              if (!isCheckExecution(message.execution)) throw new Error("Invalid check evidence.");
              const execution = message.execution;
              version++;
              setSnapshot((current) =>
                current
                  ? {
                      ...current,
                      workItems: current.workItems.map((item) =>
                        item.slug !== execution.workItem
                          ? item
                          : {
                              ...item,
                              checks: [
                                ...(item.checks ?? []).filter(
                                  (check) =>
                                    !execution.results.some((result) => result.name === check.name),
                                ),
                                ...execution.results,
                              ],
                              checkExecution: execution,
                            },
                      ),
                    }
                  : current,
              );
              return;
            }
            if (isRecord(message) && message.type === "stint") {
              if (
                typeof message.stintId !== "string" ||
                typeof message.workItem !== "string" ||
                !Number.isSafeInteger(message.sequence) ||
                (message.sequence as number) < 1 ||
                !isStintLogEntry(message.entry)
              )
                throw new Error("Invalid stint event.");
              const sequence = message.sequence as number;
              if (sequence <= (sequences.get(message.stintId) ?? 0)) return;
              sequences.set(message.stintId, sequence);
              version++;
              const entry = message.entry;
              if (
                entry.type === "started" &&
                (entry.stint.id !== message.stintId || entry.stint.workItem !== message.workItem)
              )
                throw new Error("Stint identity mismatch.");
              setSnapshot((current) => {
                if (!current) return current;
                const next = {
                  ...current,
                  workItems: current.workItems.map((item) => {
                    if (item.slug !== message.workItem) return item;
                    const previous =
                      item.activeStint?.id === message.stintId ? item.activeStint : null;
                    const stint = applyStintLogEntry(previous, entry);
                    if (!stint || stint.id !== message.stintId) return item;
                    const summary = summarizeStint(stint);
                    return {
                      ...item,
                      ...(entry.type === "ended" ? { riskyPaths: undefined } : {}),
                      activeStint: stint.status === "running" ? stint : null,
                      stints: [
                        summary,
                        ...item.stints.filter((existing) => existing.id !== stint.id),
                      ],
                    };
                  }),
                };
                return { ...next, attentionItems: deriveAttentionItems(next) };
              });
              return;
            }
            const next = readSnapshot(message);
            clearTimeout(deadline);
            version++;
            attempts = 0;
            live = true;
            setSnapshot(next);
            setError(undefined);
            setConnection("live");
          } catch {
            retry();
          }
        };
        socket.onerror = retry;
        socket.onclose = retry;
      } catch {
        retry();
      }
    }

    void load();
    connect();
    const refresh = () => {
      if (request) reloadRequested = true;
      else void load();
    };
    window.addEventListener("stintwork:refresh-project", refresh);
    const poll = setInterval(() => {
      if (!live) void load();
    }, 5000);
    return () => {
      disposed = true;
      window.removeEventListener("stintwork:refresh-project", refresh);
      clearInterval(poll);
      clearTimeout(reconnect);
      clearTimeout(requestTimeout);
      disconnect();
      request?.abort();
    };
  }, []);

  return { snapshot, connection, error };
}
