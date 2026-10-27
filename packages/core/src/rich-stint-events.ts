// SPDX-License-Identifier: Apache-2.0
export type StintToolContent =
  | { type: "text"; text: string }
  | { type: "diff"; path: string; oldText: string | null; newText: string }
  | { type: "terminal"; terminalId: string }
  | { type: "other"; content: Record<string, unknown> };

export type StintToolFields = {
  title?: string;
  kind?: string;
  status?: "pending" | "in_progress" | "completed" | "failed";
  content?: StintToolContent[];
  output?: string;
  locations?: { path: string; line?: number }[];
};

export type RichStintEvent =
  | {
      type: "plan";
      id: string;
      entries: {
        content: string;
        priority: "high" | "medium" | "low";
        status: "pending" | "in_progress" | "completed";
      }[];
    }
  | ({ type: "tool_call"; toolCallId: string } & StintToolFields)
  | {
      type: "file_edit";
      toolCallId: string;
      path: string;
      oldText?: string | null;
      newText?: string;
    }
  | {
      type: "permission_request";
      requestId: string;
      attemptId?: string;
      logicalRequestId?: string;
      binding?: "live" | "reconnecting";
      raisedAt?: string;
      details?: string;
      toolCallId: string;
      title: string | null;
      kind: string | null;
      automatic: boolean;
      options: { optionId: string; name: string; kind: string }[];
    };

export type StintToolUpdate = { type: "tool_call_update"; toolCallId: string } & StintToolFields;

export function isRichStintEvent(value: Record<string, unknown>, update = false): boolean {
  if (value.type === "plan")
    return (
      typeof value.id === "string" &&
      Array.isArray(value.entries) &&
      value.entries.every(
        (entry) =>
          entry &&
          typeof entry.content === "string" &&
          ["high", "medium", "low"].includes(entry.priority) &&
          ["pending", "in_progress", "completed"].includes(entry.status),
      )
    );
  if (value.type === "file_edit")
    return (
      typeof value.toolCallId === "string" &&
      typeof value.path === "string" &&
      (value.oldText === undefined ||
        value.oldText === null ||
        typeof value.oldText === "string") &&
      (value.newText === undefined || typeof value.newText === "string")
    );
  if (value.type === "permission_request")
    return (
      typeof value.requestId === "string" &&
      (value.binding === undefined ||
        value.binding === "live" ||
        value.binding === "reconnecting") &&
      ["attemptId", "logicalRequestId", "raisedAt", "details"].every(
        (key) => value[key] === undefined || typeof value[key] === "string",
      ) &&
      typeof value.toolCallId === "string" &&
      (value.title === null || typeof value.title === "string") &&
      (value.kind === null || typeof value.kind === "string") &&
      typeof value.automatic === "boolean" &&
      Array.isArray(value.options) &&
      value.options.every(
        (option) =>
          option && ["optionId", "name", "kind"].every((key) => typeof option[key] === "string"),
      )
    );
  if (value.type !== "tool_call" && !(update && value.type === "tool_call_update")) return false;
  return (
    typeof value.toolCallId === "string" &&
    ["title", "kind", "output"].every(
      (key) => value[key] === undefined || typeof value[key] === "string",
    ) &&
    (value.status === undefined ||
      ["pending", "in_progress", "completed", "failed"].includes(String(value.status))) &&
    (value.locations === undefined ||
      (Array.isArray(value.locations) &&
        value.locations.every(
          (location) =>
            location &&
            typeof location.path === "string" &&
            (location.line === undefined ||
              (Number.isInteger(location.line) && location.line >= 0)),
        ))) &&
    (value.content === undefined ||
      (Array.isArray(value.content) &&
        value.content.every((content) => {
          if (!content || typeof content !== "object") return false;
          if (content.type === "text") return typeof content.text === "string";
          if (content.type === "diff")
            return (
              typeof content.path === "string" &&
              (content.oldText === null || typeof content.oldText === "string") &&
              typeof content.newText === "string"
            );
          if (content.type === "terminal") return typeof content.terminalId === "string";
          return (
            content.type === "other" &&
            !!content.content &&
            typeof content.content === "object" &&
            !Array.isArray(content.content)
          );
        })))
  );
}
