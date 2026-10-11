// SPDX-License-Identifier: Apache-2.0
import type { SessionUpdate, ToolCallUpdate } from "@agentclientprotocol/sdk";
import type { StintLogEvent, StintToolContent, StintToolFields } from "@stintwork/core";

export function normalizeStintUpdate(
  update: SessionUpdate,
  toolKinds: Map<string, string>,
): StintLogEvent[] {
  if (update.sessionUpdate === "plan")
    return [
      {
        type: "plan",
        id: "plan",
        entries: update.entries.map(({ content, priority, status }) => ({
          content,
          priority,
          status,
        })),
      },
    ];
  if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update")
    return [{ type: "other", kind: update.sessionUpdate, update: { ...update } }];
  if (update.kind != null) toolKinds.set(update.toolCallId, update.kind);
  return normalizeToolCall(update, update.sessionUpdate, toolKinds.get(update.toolCallId));
}

function normalizeToolCall(
  update: ToolCallUpdate,
  type: "tool_call" | "tool_call_update",
  kind?: string,
): StintLogEvent[] {
  const fields: StintToolFields = {};
  if (update.title != null) fields.title = update.title;
  if (update.kind != null) fields.kind = update.kind;
  if (update.status != null) fields.status = update.status;
  if (update.rawOutput != null)
    fields.output =
      typeof update.rawOutput === "string" ? update.rawOutput : JSON.stringify(update.rawOutput);
  if (update.content != null)
    fields.content = update.content.map((content): StintToolContent => {
      if (content.type === "diff")
        return {
          type: "diff",
          path: content.path,
          oldText: content.oldText ?? null,
          newText: content.newText,
        };
      if (content.type === "terminal") return { type: "terminal", terminalId: content.terminalId };
      if (content.content.type === "text") return { type: "text", text: content.content.text };
      if (content.content.type === "resource" && "text" in content.content.resource)
        return { type: "text", text: content.content.resource.text };
      return { type: "other", content: { ...content.content } };
    });
  if (update.locations != null)
    fields.locations = update.locations.map(({ path, line }) => ({
      path,
      ...(line != null ? { line } : {}),
    }));
  const events: StintLogEvent[] = [{ type, toolCallId: update.toolCallId, ...fields }];
  for (const content of fields.content ?? [])
    if (content.type === "diff")
      events.push({
        type: "file_edit",
        toolCallId: update.toolCallId,
        path: content.path,
        oldText: content.oldText,
        newText: content.newText,
      });
  if (kind === "edit")
    for (const location of fields.locations ?? [])
      if (!events.some((event) => event.type === "file_edit" && event.path === location.path))
        events.push({ type: "file_edit", toolCallId: update.toolCallId, path: location.path });
  return events;
}
