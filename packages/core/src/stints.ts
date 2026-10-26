// SPDX-License-Identifier: Apache-2.0
import type { Brief, BriefHandoff } from "./brief.js";
import { isReviewFindings, type ReviewFindings } from "./findings.js";
import type { RepoFiles, Warning } from "./work-items.js";
import { isPermissionLevel, type PermissionLevel } from "./permission-levels.js";
import { readCoreTextWire, type CoreTextMessage } from "./core-text.js";
import {
  isRichStintEvent,
  type RichStintEvent,
  type StintToolUpdate,
} from "./rich-stint-events.js";

export type StintStatus = "running" | "finished" | "stopped" | "failed" | "interrupted";
export type StintLaunch = {
  agent: "claude" | "codex";
  source: "installed" | "bundled";
  reason:
    | "compatible"
    | "missing"
    | "below-tested-range"
    | "unparseable"
    | "incompatible"
    | "handshake failed";
  executable: { path: string; version: string; identity: string };
  adapterEntry: string;
  adapterVersion: string;
  cacheKey: string;
  lockDigest: string;
  host: { os: string; arch: string; libc: string; node: string; abi: string };
  permissionLevel: PermissionLevel;
};
export type StintProcessAttempt = {
  id: string;
  owner: { pid: number; startedAt: string; identity?: string };
  pid: number;
  // An observable, unique Node process title; null for launchers without this proof.
  // A PID alone must never authorize signalling a process.
  marker: string | null;
  identity?: string;
  processGroup?: boolean;
};
export type StintPhase = "work" | "handoff" | "findings" | "finalization";
export type StintProgress = {
  phase: StintPhase;
  status?: Exclude<StintStatus, "running">;
  error?: string;
  errorMessage?: CoreTextMessage;
  stopReason?: string;
  handoff?: BriefHandoff | null;
  handoffError?: string;
  findings?: ReviewFindings;
};
export type StintRecovery = {
  version: 1;
  launch?: StintLaunch;
  attempt?: StintProcessAttempt;
  sessionId?: string;
  progress?: StintProgress;
  stopRequestedAt?: string;
  state?: "resuming" | "resumed" | "fallback" | "suspended" | "suspending";
  reason?: string;
};
export type StintRecoveryData =
  | { kind: "launch"; launch: StintLaunch }
  | { kind: "attempt"; attempt: StintProcessAttempt }
  | { kind: "session"; attemptId: string; sessionId: string }
  | { kind: "phase"; attemptId: string; progress: StintProgress }
  | { kind: "cleanup"; attemptId: string }
  | { kind: "stop_requested" }
  | {
      kind: "resume";
      state: "resuming" | "resumed" | "fallback" | "suspended" | "suspending";
      reason?: string;
    };
export type StintRecoveryEntry = {
  type: "recovery";
  version: 1;
  at: string;
} & StintRecoveryData;
export type CheckpointWarning = {
  path: string;
  reasons: ("likely-secret" | "large-file" | "generated-directory")[];
} & ({ excluded: true } | { excluded: false; committed: true; commits: string[] });

export type RiskyPath = Pick<CheckpointWarning, "path" | "reasons"> & { blob: string };

export function isRiskyPaths(value: unknown): value is RiskyPath[] {
  return (
    Array.isArray(value) &&
    value.every(
      (risk) =>
        risk &&
        typeof risk === "object" &&
        typeof risk.blob === "string" &&
        /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(risk.blob) &&
        Object.keys(risk).every((key) => ["path", "reasons", "blob"].includes(key)) &&
        isCheckpointWarnings([{ path: risk.path, reasons: risk.reasons, excluded: true }]),
    )
  );
}

export function isCheckpointWarnings(value: unknown): value is CheckpointWarning[] {
  return (
    Array.isArray(value) &&
    value.every(
      (warning) =>
        warning &&
        typeof warning === "object" &&
        typeof warning.path === "string" &&
        warning.path.length > 0 &&
        !warning.path.startsWith("/") &&
        !warning.path.includes("\0") &&
        !warning.path.split("/").some((part: string) => part === ".." || part === ".") &&
        (warning.excluded === true ||
          (warning.excluded === false &&
            warning.committed === true &&
            Array.isArray(warning.commits) &&
            warning.commits.length > 0 &&
            warning.commits.every(
              (commit: unknown) =>
                typeof commit === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit),
            ))) &&
        Array.isArray(warning.reasons) &&
        warning.reasons.length > 0 &&
        warning.reasons.every(
          (reason: unknown) =>
            typeof reason === "string" &&
            ["likely-secret", "large-file", "generated-directory"].includes(reason),
        ) &&
        Object.keys(warning).every((key) =>
          (warning.excluded
            ? ["path", "reasons", "excluded"]
            : ["path", "reasons", "excluded", "committed", "commits"]
          ).includes(key),
        ),
    )
  );
}
export type StintEvent =
  | RichStintEvent
  | { type: "message"; id: string; text: string; message?: CoreTextMessage }
  | { type: "thought"; id: string; text: string }
  | {
      type: "permission";
      requestId?: string;
      attemptId?: string;
      toolCallId: string;
      title: string | null;
      kind: string | null;
      automatic: boolean;
      decision:
        | { outcome: "selected"; optionId: string; kind: string }
        | { outcome: "cancelled" }
        | { outcome: "failed"; reason: string };
    }
  | {
      type: "permission_delivery";
      requestId: string;
      attemptId: string;
      outcome: "written" | "failed" | "retired";
    }
  | { type: "other"; kind: string; update: Record<string, unknown> };
export type StintLogEvent =
  | StintToolUpdate
  | { type: "message_delta" | "thought_delta"; id: string; text: string }
  | StintEvent;
export type Stint = {
  id: string;
  workItem: string;
  stage: string;
  ticket: number | null;
  agent: string;
  status: StintStatus;
  startedAt: string;
  endedAt: string | null;
  worktree: { path: string; branch: string };
  baseCommit: string;
  checkpointCommit: string | null;
  checkpointWarnings?: CheckpointWarning[];
  brief: Brief;
  events: StintEvent[];
  handoff: BriefHandoff | null;
  handoffAnswer?: { at: string; note: string | null };
  handoffError?: string;
  handoffErrorMessage?: CoreTextMessage;
  findings?: ReviewFindings;
  recovery?: StintRecovery;
  error?: string;
  errorMessage?: CoreTextMessage;
};
export type StintSummary = Pick<
  Stint,
  | "id"
  | "workItem"
  | "stage"
  | "ticket"
  | "agent"
  | "status"
  | "startedAt"
  | "endedAt"
  | "error"
  | "errorMessage"
  | "checkpointCommit"
  | "checkpointWarnings"
  | "handoff"
  | "handoffError"
  | "handoffErrorMessage"
  | "handoffAnswer"
  | "findings"
  | "recovery"
> & { lastHandoffStintId?: string };
export type StintLogEntry =
  | StintRecoveryEntry
  | {
      type: "started";
      at: string;
      stint: Pick<
        Stint,
        "id" | "workItem" | "stage" | "ticket" | "agent" | "worktree" | "baseCommit" | "brief"
      >;
    }
  | { type: "event"; at: string; event: StintLogEvent }
  | { type: "handoff_answered"; at: string; note: string | null }
  | {
      type: "ended";
      at: string;
      status: Exclude<StintStatus, "running">;
      stopReason?: string;
      error?: string;
      errorMessage?: CoreTextMessage;
      checkpointCommit?: string;
      checkpointWarnings?: CheckpointWarning[];
      handoff?: BriefHandoff | null;
      handoffError?: string;
      handoffErrorMessage?: CoreTextMessage;
      findings?: ReviewFindings;
    };
export type StintLiveMessage = {
  type: "stint";
  stintId: string;
  workItem: string;
  sequence: number;
  entry: StintLogEntry;
};

export function mergeStintEvent(events: readonly StintEvent[], event: StintLogEvent): StintEvent[] {
  if (
    event.type === "other" ||
    event.type === "permission" ||
    event.type === "permission_request" ||
    event.type === "permission_delivery"
  )
    return [...events, event];
  if (
    event.type === "plan" ||
    event.type === "file_edit" ||
    event.type === "tool_call" ||
    event.type === "tool_call_update"
  ) {
    const normalized: StintEvent =
      event.type === "tool_call_update" ? { ...event, type: "tool_call" } : event;
    const index = events.findIndex((previous) =>
      normalized.type === "plan"
        ? previous.type === "plan" && previous.id === normalized.id
        : normalized.type === "file_edit"
          ? previous.type === "file_edit" &&
            previous.toolCallId === normalized.toolCallId &&
            previous.path === normalized.path
          : previous.type === "tool_call" && previous.toolCallId === normalized.toolCallId,
    );
    return index < 0
      ? [...events, normalized]
      : events.map((previous, position) =>
          position === index ? ({ ...previous, ...normalized } as StintEvent) : previous,
        );
  }
  const delta = event.type === "message_delta" || event.type === "thought_delta";
  const type =
    event.type === "message_delta"
      ? "message"
      : event.type === "thought_delta"
        ? "thought"
        : event.type;
  const message: Extract<StintEvent, { text: string }> = {
    type,
    id: event.id,
    text: event.text,
    ...(event.type === "message" && event.message ? { message: event.message } : {}),
  };
  const index = events.findIndex(
    (previous) => previous.type === type && "id" in previous && previous.id === event.id,
  );
  return index < 0
    ? [...events, message]
    : events.map((previous, position) =>
        position === index
          ? {
              ...message,
              text: delta && "text" in previous ? previous.text + event.text : event.text,
            }
          : previous,
      );
}

export function applyStintLogEntry(stint: Stint | null, entry: StintLogEntry): Stint | null {
  if (entry.type === "started") {
    return (
      stint ?? {
        ...entry.stint,
        brief: readCoreTextWire(entry.stint.brief) as Brief,
        status: "running",
        startedAt: entry.at,
        endedAt: null,
        checkpointCommit: null,
        handoff: null,
        events: [],
      }
    );
  }
  if (entry.type === "handoff_answered")
    return stint && stint.status !== "running" && stint.handoff && !stint.handoffAnswer
      ? { ...stint, handoffAnswer: { at: entry.at, note: entry.note } }
      : stint;
  if (stint?.status !== "running") return stint;
  if (entry.type === "recovery") {
    const recovery: StintRecovery = { ...stint.recovery, version: 1 };
    if (entry.kind === "resume") {
      recovery.state = entry.state;
      recovery.reason = entry.reason;
    }
    if (entry.kind === "launch") recovery.launch = entry.launch;
    if (entry.kind === "attempt") recovery.attempt = entry.attempt;
    if (entry.kind === "session") recovery.sessionId = entry.sessionId;
    if (entry.kind === "phase") recovery.progress = { ...recovery.progress, ...entry.progress };
    if (entry.kind === "stop_requested") recovery.stopRequestedAt ??= entry.at;
    return {
      ...stint,
      recovery,
      ...((entry.kind === "resume" &&
        ["resuming", "suspending", "suspended"].includes(entry.state)) ||
      entry.kind === "stop_requested"
        ? {
            events: stint.events.map((event) =>
              event.type === "permission_request"
                ? { ...event, binding: "reconnecting" as const }
                : event,
            ),
          }
        : {}),
      ...(entry.kind === "phase"
        ? {
            ...(entry.progress.handoff === undefined ? {} : { handoff: entry.progress.handoff }),
            ...(entry.progress.handoffError === undefined
              ? {}
              : { handoffError: entry.progress.handoffError }),
            ...(entry.progress.findings === undefined ? {} : { findings: entry.progress.findings }),
          }
        : {}),
    };
  }
  if (entry.type === "event")
    return {
      ...stint,
      events: mergeStintEvent(
        stint.events,
        entry.event.type === "permission_request"
          ? { ...entry.event, raisedAt: entry.event.raisedAt ?? entry.at }
          : entry.event,
      ),
    };
  return {
    ...stint,
    status: entry.status,
    endedAt: entry.at,
    checkpointCommit: entry.checkpointCommit ?? null,
    ...(entry.checkpointWarnings ? { checkpointWarnings: entry.checkpointWarnings } : {}),
    handoff: entry.handoff ?? null,
    ...(entry.findings ? { findings: entry.findings } : {}),
    ...(entry.handoffError ? { handoffError: entry.handoffError } : {}),
    ...(entry.handoffErrorMessage ? { handoffErrorMessage: entry.handoffErrorMessage } : {}),
    ...(entry.error ? { error: entry.error } : {}),
    ...(entry.errorMessage ? { errorMessage: entry.errorMessage } : {}),
  };
}

export function foldStintLog(entries: readonly StintLogEntry[]): Stint | null {
  return entries.reduce<Stint | null>(applyStintLogEntry, null);
}

export function summarizeStint(stint: Stint): StintSummary {
  const { id, workItem, stage, ticket, agent, status, startedAt, endedAt, error } = stint;
  return {
    id,
    workItem,
    stage,
    ticket,
    agent,
    status,
    startedAt,
    endedAt,
    checkpointCommit: stint.checkpointCommit,
    ...(stint.checkpointWarnings ? { checkpointWarnings: stint.checkpointWarnings } : {}),
    handoff: stint.handoff,
    ...(stint.findings ? { findings: stint.findings } : {}),
    ...(stint.recovery ? { recovery: stint.recovery } : {}),
    ...(stint.brief.lastHandoff ? { lastHandoffStintId: stint.brief.lastHandoff.stint } : {}),
    ...(stint.handoffAnswer ? { handoffAnswer: stint.handoffAnswer } : {}),
    ...(stint.handoffError ? { handoffError: stint.handoffError } : {}),
    ...(stint.handoffErrorMessage ? { handoffErrorMessage: stint.handoffErrorMessage } : {}),
    ...(error ? { error } : {}),
    ...(stint.errorMessage ? { errorMessage: stint.errorMessage } : {}),
  };
}

export function isStintEvent(value: unknown): value is StintEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  if (isRichStintEvent(event)) return true;
  if (event.type === "permission_delivery")
    return (
      typeof event.requestId === "string" &&
      typeof event.attemptId === "string" &&
      ["written", "failed", "retired"].includes(String(event.outcome))
    );
  if (event.type === "permission") {
    const decision = event.decision as Record<string, unknown> | undefined;
    return (
      typeof event.toolCallId === "string" &&
      (event.title === null || typeof event.title === "string") &&
      (event.kind === null || typeof event.kind === "string") &&
      typeof event.automatic === "boolean" &&
      (event.requestId === undefined || typeof event.requestId === "string") &&
      (event.attemptId === undefined || typeof event.attemptId === "string") &&
      !!decision &&
      (decision.outcome === "cancelled" ||
        (decision.outcome === "failed" && typeof decision.reason === "string") ||
        (decision.outcome === "selected" &&
          typeof decision.optionId === "string" &&
          typeof decision.kind === "string"))
    );
  }
  return event.type === "other"
    ? typeof event.kind === "string" &&
        !!event.update &&
        typeof event.update === "object" &&
        !Array.isArray(event.update)
    : (event.type === "message" || event.type === "thought") &&
        typeof event.id === "string" &&
        typeof event.text === "string";
}

export function isStintLogEntry(value: unknown): value is StintLogEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.at !== "string") return false;
  if (entry.type === "recovery") return isStintRecoveryEntry(entry);
  if (entry.type === "handoff_answered")
    return (
      !Number.isNaN(Date.parse(entry.at)) &&
      (entry.note === null || (typeof entry.note === "string" && entry.note.trim().length > 0))
    );
  if (entry.type === "event") {
    if (isStintEvent(entry.event)) return true;
    if (!entry.event || typeof entry.event !== "object") return false;
    const event = entry.event as Record<string, unknown>;
    if (isRichStintEvent(event, true)) return true;
    return (
      (event.type === "message_delta" || event.type === "thought_delta") &&
      typeof event.id === "string" &&
      typeof event.text === "string"
    );
  }
  if (entry.type === "ended")
    return (
      ["finished", "stopped", "failed", "interrupted"].includes(String(entry.status)) &&
      (entry.checkpointWarnings === undefined || isCheckpointWarnings(entry.checkpointWarnings)) &&
      (entry.findings === undefined || isReviewFindings(entry.findings)) &&
      ["error", "stopReason", "checkpointCommit", "handoffError"].every(
        (key) => entry[key] === undefined || typeof entry[key] === "string",
      ) &&
      (entry.handoff === undefined || entry.handoff === null || isBriefHandoff(entry.handoff))
    );
  if (entry.type !== "started" || !entry.stint || typeof entry.stint !== "object") return false;
  const stint = entry.stint as Record<string, unknown>;
  const worktree = stint.worktree as Record<string, unknown> | undefined;
  const brief = stint.brief as Record<string, unknown> | undefined;
  return (
    ["id", "workItem", "stage", "agent", "baseCommit"].every(
      (key) => typeof stint[key] === "string",
    ) &&
    (stint.ticket === null ||
      (Number.isSafeInteger(stint.ticket) && (stint.ticket as number) > 0)) &&
    typeof worktree?.path === "string" &&
    typeof worktree.branch === "string" &&
    typeof brief?.prompt === "string" &&
    (brief.permissionLevel === undefined || isPermissionLevel(brief.permissionLevel)) &&
    (brief.developerNotes === undefined ||
      (Array.isArray(brief.developerNotes) &&
        brief.developerNotes.every(
          (note) =>
            note &&
            typeof note === "object" &&
            ["id", "at", "text"].every((key) => typeof note[key] === "string") &&
            (note.source === undefined || note.source === "review"),
        ))) &&
    (brief.checkpointCommit == null || typeof brief.checkpointCommit === "string") &&
    (brief.skill === null || typeof brief.skill === "string") &&
    (brief.lastHandoff === null || isBriefHandoff(brief.lastHandoff)) &&
    Array.isArray(brief.changedPaths) &&
    brief.changedPaths.every((path) => typeof path === "string") &&
    Array.isArray(brief.pointers) &&
    brief.pointers.every(
      (pointer) =>
        pointer &&
        typeof pointer === "object" &&
        typeof pointer.path === "string" &&
        (typeof pointer.reason === "string" ||
          (pointer.reason &&
            typeof pointer.reason === "object" &&
            "text" in pointer.reason &&
            typeof pointer.reason.text === "string")),
    )
  );
}

export function isBriefHandoff(value: unknown): value is BriefHandoff {
  return (
    !!value &&
    typeof value === "object" &&
    ["stint", "agent", "stoppedAt", "unresolved", "nextStep"].every(
      (key) => typeof (value as Record<string, unknown>)[key] === "string",
    )
  );
}

function isStintRecoveryEntry(entry: Record<string, unknown>): boolean {
  const record = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === "object" && !Array.isArray(value);
  const keys = (value: Record<string, unknown>, allowed: string[]) =>
    Object.keys(value).every((key) => allowed.includes(key));
  const text = (value: unknown): value is string =>
    typeof value === "string" && !!value.trim() && !value.includes("\0");
  const absolute = (value: unknown) => text(value) && /^(?:\/|[a-z]:[\\/])/i.test(value);
  const pid = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0;
  const date = (value: unknown) => text(value) && !Number.isNaN(Date.parse(value));
  const common = ["type", "version", "at", "kind"];
  if (entry.version !== 1 || !date(entry.at)) return false;
  if (entry.kind === "stop_requested") return keys(entry, common);
  if (entry.kind === "resume")
    return (
      keys(entry, [...common, "state", "reason"]) &&
      ["resuming", "resumed", "fallback", "suspended", "suspending"].includes(
        String(entry.state),
      ) &&
      (entry.reason === undefined || text(entry.reason))
    );
  if (entry.kind === "cleanup")
    return keys(entry, [...common, "attemptId"]) && text(entry.attemptId);
  if (entry.kind === "session")
    return (
      keys(entry, [...common, "attemptId", "sessionId"]) &&
      text(entry.attemptId) &&
      text(entry.sessionId)
    );
  if (entry.kind === "attempt") {
    const attempt = entry.attempt;
    return (
      keys(entry, [...common, "attempt"]) &&
      record(attempt) &&
      keys(attempt, ["id", "owner", "pid", "marker", "identity", "processGroup"]) &&
      text(attempt.id) &&
      pid(attempt.pid) &&
      (attempt.identity === undefined || text(attempt.identity)) &&
      (attempt.processGroup === undefined || typeof attempt.processGroup === "boolean") &&
      (attempt.marker === null || attempt.marker === `stintwork-${attempt.id}`) &&
      record(attempt.owner) &&
      keys(attempt.owner, ["pid", "startedAt", "identity"]) &&
      pid(attempt.owner.pid) &&
      (attempt.owner.identity === undefined || text(attempt.owner.identity)) &&
      date(attempt.owner.startedAt)
    );
  }
  if (entry.kind === "phase") {
    const progress = entry.progress;
    return (
      keys(entry, [...common, "attemptId", "progress"]) &&
      text(entry.attemptId) &&
      record(progress) &&
      keys(progress, [
        "phase",
        "status",
        "error",
        "errorMessage",
        "stopReason",
        "handoff",
        "handoffError",
        "findings",
      ]) &&
      ["work", "handoff", "findings", "finalization"].includes(String(progress.phase)) &&
      (progress.status === undefined ||
        (progress.phase === "finalization" &&
          ["finished", "stopped", "failed", "interrupted"].includes(String(progress.status)))) &&
      (progress.error === undefined || text(progress.error)) &&
      (progress.errorMessage === undefined ||
        (record(progress.errorMessage) && text(progress.errorMessage.code))) &&
      (progress.stopReason === undefined || text(progress.stopReason)) &&
      (progress.handoff === undefined ||
        progress.handoff === null ||
        isBriefHandoff(progress.handoff)) &&
      (progress.handoffError === undefined || text(progress.handoffError)) &&
      (progress.findings === undefined || isReviewFindings(progress.findings))
    );
  }
  if (entry.kind !== "launch" || !keys(entry, [...common, "launch"]) || !record(entry.launch))
    return false;
  const launch = entry.launch;
  return (
    keys(launch, [
      "agent",
      "source",
      "reason",
      "executable",
      "adapterEntry",
      "adapterVersion",
      "cacheKey",
      "lockDigest",
      "host",
      "permissionLevel",
    ]) &&
    ["claude", "codex"].includes(String(launch.agent)) &&
    ["installed", "bundled"].includes(String(launch.source)) &&
    [
      "compatible",
      "missing",
      "below-tested-range",
      "unparseable",
      "incompatible",
      "handshake failed",
    ].includes(String(launch.reason)) &&
    record(launch.executable) &&
    keys(launch.executable, ["path", "version", "identity"]) &&
    absolute(launch.executable.path) &&
    text(launch.executable.version) &&
    text(launch.executable.identity) &&
    absolute(launch.adapterEntry) &&
    text(launch.adapterVersion) &&
    [launch.cacheKey, launch.lockDigest].every(
      (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value),
    ) &&
    record(launch.host) &&
    keys(launch.host, ["os", "arch", "libc", "node", "abi"]) &&
    ["os", "arch", "libc", "node", "abi"].every((key) =>
      text((launch.host as Record<string, unknown>)[key]),
    ) &&
    isPermissionLevel(launch.permissionLevel)
  );
}

export function indexStints(files: RepoFiles): { stints: Stint[]; warnings: Warning[] } {
  const stints: Stint[] = [];
  const warnings: Warning[] = [];
  const prefix = ".stintwork/local/stints/";
  try {
    for (const path of files.list(prefix).filter((path) => path.endsWith(".jsonl"))) {
      try {
        const entries: StintLogEntry[] = [];
        for (const line of (files.read(path) ?? "").split("\n").filter(Boolean)) {
          try {
            const entry: unknown = JSON.parse(line);
            if (!isStintLogEntry(entry)) throw new Error("Invalid stint log entry");
            entries.push(entry);
          } catch {
            warnings.push({ path, message: "Invalid stint log entry; skipped" });
          }
        }
        const stint = foldStintLog(entries);
        if (stint) stints.push(stint);
        else warnings.push({ path, message: "Stint log has no usable start; skipped" });
      } catch (error) {
        warnings.push({ path, message: `Cannot read stint log: ${String(error)}` });
      }
    }
  } catch (error) {
    warnings.push({ path: prefix, message: `Cannot list stint logs: ${String(error)}` });
  }
  stints.sort(
    (first, second) =>
      second.startedAt.localeCompare(first.startedAt) || second.id.localeCompare(first.id),
  );
  return { stints, warnings };
}
