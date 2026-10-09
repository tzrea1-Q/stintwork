import { builtInWorkflows, type ProjectSnapshot, type WorkflowStage } from "@stintwork/core";
import { useEffect, useState } from "react";

export type Connection = "connecting" | "live" | "reconnecting";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readSnapshot(value: unknown): ProjectSnapshot {
  const stages = Object.values(builtInWorkflows).flatMap<WorkflowStage>(
    (workflow) => workflow.stages,
  );
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
        Object.hasOwn(builtInWorkflows, String(item.workflow)) &&
        typeof item.inferred === "boolean" &&
        (item.column === undefined || stages.some((stage) => stage.column === item.column)) &&
        (item.stage === undefined || stages.some((stage) => stage.id === item.stage)) &&
        (item.milestone === undefined || typeof item.milestone === "string") &&
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
    throw new Error("The project server returned an invalid snapshot.");
  return value as ProjectSnapshot;
}

export function useProjectSnapshot() {
  const [snapshot, setSnapshot] = useState<ProjectSnapshot>();
  const [connection, setConnection] = useState<Connection>("connecting");
  const [error, setError] = useState<string>();

  useEffect(() => {
    let disposed = false;
    let live = false;
    let version = 0;
    let attempts = 0;
    let socket: WebSocket | undefined;
    let request: AbortController | undefined;
    let requestTimeout: ReturnType<typeof setTimeout> | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;

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
        if (!response.ok) throw new Error(`Project request failed (${response.status}).`);
        const next = readSnapshot(await response.json());
        if (!disposed && startedAt === version) {
          setSnapshot(next);
          setError(undefined);
        }
      } catch (cause) {
        if (!disposed && startedAt === version) {
          setError(
            controller.signal.aborted
              ? "Project request timed out."
              : cause instanceof Error
                ? cause.message
                : "Could not reach the project server.",
          );
        }
      } finally {
        clearTimeout(timeout);
        requestTimeout = undefined;
        request = undefined;
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
            const next = readSnapshot(JSON.parse(event.data));
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
    const poll = setInterval(() => {
      if (!live) void load();
    }, 5000);
    return () => {
      disposed = true;
      clearInterval(poll);
      clearTimeout(reconnect);
      clearTimeout(requestTimeout);
      disconnect();
      request?.abort();
    };
  }, []);

  return { snapshot, connection, error };
}
