import type { AgentProfile, Stint, StintEvent, StintToolContent } from "@stintwork/core";
import { Check, FileCode2, ListChecks, Wrench } from "lucide-react";
import { PermissionAnswer } from "./PermissionAnswer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./stint-stream.css";

function toolOutput(content: StintToolContent): string {
  if (content.type === "text") return content.text;
  if (content.type === "diff")
    return `${content.path}\n${content.oldText !== null ? `Previous file content:\n${content.oldText}\n` : ""}New file content:\n${content.newText}`;
  if (content.type === "terminal") return `Terminal output · ${content.terminalId}`;
  return `Content · ${String(content.content.type ?? "unknown")}`;
}

function PermissionPrompt({
  stint,
  event,
  replay,
  profile,
}: {
  stint: Stint;
  event: Extract<StintEvent, { type: "permission_request" }>;
  replay: boolean;
  profile?: AgentProfile;
}) {
  const decision = stint.events.find(
    (entry) => entry.type === "permission" && entry.requestId === event.requestId,
  );
  const pending = !replay && !decision && stint.status === "running";

  let outcome =
    replay && stint.status === "running"
      ? "No answer recorded."
      : "This request is no longer pending.";
  if (decision?.type === "permission") {
    if (decision.decision.outcome === "selected") {
      const optionId = decision.decision.optionId;
      outcome = event.options.find((option) => option.optionId === optionId)?.name ?? optionId;
    } else
      outcome =
        decision.decision.outcome === "failed"
          ? decision.decision.reason
          : "Permission request cancelled.";
  }
  return (
    <section
      className="stint-permission"
      aria-label={`Permission: ${event.title ?? event.toolCallId}`}
    >
      <strong>{event.title ?? "Permission requested"}</strong>
      {event.kind && <span className="muted"> · {event.kind}</span>}
      {pending ? (
        <>
          <p>The stint waits for your answer, even when this drawer is closed.</p>
          <PermissionAnswer stintId={stint.id} request={event} profile={profile} />
        </>
      ) : (
        <p role="status">{outcome}</p>
      )}
    </section>
  );
}

export function StintStream({
  stint,
  replay = false,
  profile,
}: {
  stint: Stint;
  replay?: boolean;
  profile?: AgentProfile;
}) {
  const waitingForPermission = stint.events.some(
    (event) =>
      event.type === "permission_request" &&
      !stint.events.some(
        (decision) => decision.type === "permission" && decision.requestId === event.requestId,
      ),
  );
  return (
    <div className="stint-stream">
      {stint.events
        .filter((event) => event.type === "plan")
        .map((event) => {
          const occurrences = new Map<string, number>();
          return (
            event.type === "plan" && (
              <section key={event.id} className="stint-plan" aria-label="Stint plan">
                <h4>
                  <ListChecks size={15} aria-hidden="true" />
                  Plan{" "}
                  <span className="muted">
                    {event.entries.filter((entry) => entry.status === "completed").length}/
                    {event.entries.length}
                  </span>
                </h4>
                <ol>
                  {event.entries.map((entry) => {
                    const occurrence = (occurrences.get(entry.content) ?? 0) + 1;
                    occurrences.set(entry.content, occurrence);
                    return (
                      <li
                        key={`${entry.content}:${occurrence}`}
                        className={entry.status === "completed" ? "stint-step-completed" : ""}
                      >
                        {entry.status === "completed" && <Check size={14} aria-hidden="true" />}
                        <span>{entry.content}</span>
                        <small>{entry.status.replaceAll("_", " ")}</small>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )
          );
        })}
      <div
        className="stint-messages stint-event-log"
        role="log"
        aria-label="Stint messages"
        aria-live="polite"
      >
        {stint.events.map((event, index) => {
          if (event.type === "plan") return null;
          if (
            event.type === "permission" &&
            event.requestId &&
            stint.events.some(
              (entry) => entry.type === "permission_request" && entry.requestId === event.requestId,
            )
          )
            return null;
          const key =
            "requestId" in event
              ? event.requestId
              : "id" in event
                ? event.id
                : "toolCallId" in event
                  ? `${event.type}:${event.toolCallId}:${"path" in event ? event.path : ""}`
                  : index;
          return (
            <div className={`stint-event stint-event-${event.type}`} key={`${event.type}:${key}`}>
              {(event.type === "message" || event.type === "thought") && (
                <div className={event.type === "thought" ? "markdown muted" : "markdown"}>
                  {event.type === "thought" && <small>Agent thought</small>}
                  <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                    {event.text}
                  </ReactMarkdown>
                </div>
              )}
              {event.type === "tool_call" && (
                <div>
                  <div className="stint-tool-heading">
                    <Wrench size={14} aria-hidden="true" />
                    <strong>{event.title ?? event.toolCallId}</strong>
                    <span>
                      {event.kind ?? "other"} · {(event.status ?? "pending").replaceAll("_", " ")}
                    </span>
                  </div>
                  {event.locations?.map((location) => (
                    <p key={`${location.path}:${location.line}`}>
                      <code>
                        {location.path}
                        {location.line !== undefined ? `:${location.line}` : ""}
                      </code>
                    </p>
                  ))}
                  {event.content?.length || event.output ? (
                    <details className="stint-tool-output">
                      <summary>Tool output</summary>
                      {!!event.content?.length && (
                        <pre>{event.content.map(toolOutput).join("\n\n")}</pre>
                      )}
                      {event.output && <pre>{event.output}</pre>}
                    </details>
                  ) : null}
                </div>
              )}
              {event.type === "file_edit" && (
                <div className="stint-file-edit">
                  <FileCode2 size={14} aria-hidden="true" />
                  <strong>File edit</strong>
                  <code>{event.path}</code>
                </div>
              )}
              {event.type === "permission_request" && (
                <PermissionPrompt stint={stint} event={event} replay={replay} profile={profile} />
              )}
              {event.type === "permission" && (
                <p>
                  Permission · {event.title ?? event.toolCallId} ·{" "}
                  {event.decision.outcome === "selected"
                    ? event.decision.optionId
                    : event.decision.outcome}
                </p>
              )}
              {event.type === "other" && (
                <details>
                  <summary>{event.kind.replaceAll("_", " ")}</summary>
                  <pre>{JSON.stringify(event.update, null, 2)}</pre>
                </details>
              )}
            </div>
          );
        })}
        {stint.error && (
          <p role="alert" className="warning">
            {stint.error}
          </p>
        )}
      </div>
      <p className="stint-stream-status" role="status">
        {stint.status === "running" && !replay
          ? waitingForPermission
            ? "Waiting for your permission answer"
            : "Streaming live · Agent is working"
          : `Stint ${stint.status}`}
      </p>
    </div>
  );
}
