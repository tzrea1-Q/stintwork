// SPDX-License-Identifier: Apache-2.0
import type { AgentProfile, Stint, StintEvent, StintToolContent } from "@stintwork/core";
import { Check, FileCode2, ListChecks, Wrench } from "lucide-react";
import { PermissionAnswer } from "./PermissionAnswer";
import { PermissionDetails } from "./PermissionDetails";
import { readableToolOutput } from "./tool-output";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./stint-stream.css";
import { renderCoreText, stintEventKind, useLanguage } from "./i18n/language";
import type { Catalog } from "./i18n/en";

function toolOutput(content: StintToolContent, t: Catalog): string {
  if (content.type === "text") return readableToolOutput(content.text);
  if (content.type === "diff")
    return `${content.path}\n${content.oldText !== null ? `${t.stints.previousContent}\n${content.oldText}\n` : ""}${t.stints.newContent}\n${content.newText}`;
  if (content.type === "terminal") return t.stints.terminalOutput(content.terminalId);
  return t.stints.content(String(content.content.type ?? t.stints.unknown));
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
  const { t } = useLanguage();
  const decision = stint.events.find(
    (entry) => entry.type === "permission" && entry.requestId === event.requestId,
  );
  const pending = !event.automatic && !replay && !decision && stint.status === "running";

  let outcome = event.automatic
    ? !replay && stint.status === "running"
      ? t.stints.answeringAutomatically
      : t.stints.noAutomaticAnswer
    : replay && stint.status === "running"
      ? t.stints.noAnswer
      : t.stints.noLongerPending;
  if (decision?.type === "permission") {
    if (decision.decision.outcome === "selected") {
      const optionId = decision.decision.optionId;
      outcome = event.options.find((option) => option.optionId === optionId)?.name ?? optionId;
      if (decision.automatic) outcome = t.stints.automaticOutcome(outcome);
    } else
      outcome =
        decision.decision.outcome === "failed"
          ? decision.decision.reason
          : t.stints.permissionCancelled;
  }
  return (
    <section
      className="stint-permission"
      aria-label={t.stints.permissionTitle(event.title ?? event.toolCallId)}
    >
      <strong>{event.title ?? t.stints.permissionRequested}</strong>
      {event.kind && (
        <span className="muted"> · {stintEventKind(event.kind, t.stints.toolKinds)}</span>
      )}
      {pending ? (
        <>
          <p>{t.stints.waitingForAnswer}</p>
          <PermissionAnswer stintId={stint.id} request={event} profile={profile} />
        </>
      ) : (
        <>
          <PermissionDetails details={event.details} />
          <p role="status">{outcome}</p>
        </>
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
  const { t } = useLanguage();
  const waitingForPermission = stint.events.some(
    (event) =>
      event.type === "permission_request" &&
      !event.automatic &&
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
              <section key={event.id} className="stint-plan" aria-label={t.stints.stintPlan}>
                <h4>
                  <ListChecks size={15} aria-hidden="true" />
                  {t.stints.plan}{" "}
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
                        <small>{t.stints.progress[entry.status]}</small>
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
        aria-label={t.stints.messages}
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
                  {event.type === "thought" && <small>{t.stints.agentThought}</small>}
                  <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                    {event.type === "message"
                      ? renderCoreText(event.message, event.text, t)
                      : event.text}
                  </ReactMarkdown>
                </div>
              )}
              {event.type === "tool_call" && (
                <div>
                  <div className="stint-tool-heading">
                    <Wrench size={14} aria-hidden="true" />
                    <strong>{event.title ?? event.toolCallId}</strong>
                    <span>
                      {stintEventKind(event.kind ?? "other", t.stints.toolKinds)} ·{" "}
                      {t.stints.progress[event.status ?? "pending"]}
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
                      <summary>{t.stints.toolOutput}</summary>
                      {!!event.content?.length && (
                        <pre>
                          {event.content.map((content) => toolOutput(content, t)).join("\n\n")}
                        </pre>
                      )}
                      {event.output && <pre>{readableToolOutput(event.output)}</pre>}
                    </details>
                  ) : null}
                </div>
              )}
              {event.type === "file_edit" && (
                <div className="stint-file-edit">
                  <FileCode2 size={14} aria-hidden="true" />
                  <strong>{t.stints.fileEdit}</strong>
                  <code>{event.path}</code>
                </div>
              )}
              {event.type === "permission_request" && (
                <PermissionPrompt stint={stint} event={event} replay={replay} profile={profile} />
              )}
              {event.type === "permission" && (
                <p>
                  {t.stints.permission}
                  {event.automatic ? t.stints.automatic : ""} · {event.title ?? event.toolCallId} ·{" "}
                  {event.decision.outcome === "selected"
                    ? event.decision.optionId
                    : event.decision.outcome === "failed"
                      ? t.stints.progress.failed
                      : t.stints.cancelled}
                </p>
              )}
              {event.type === "other" && (
                <details>
                  <summary>{stintEventKind(event.kind, t.stints.sessionUpdateKinds)}</summary>
                  <pre>{JSON.stringify(event.update, null, 2)}</pre>
                </details>
              )}
            </div>
          );
        })}
        {stint.error && (
          <p role="alert" className="warning">
            {renderCoreText(stint.errorMessage, stint.error, t)}
          </p>
        )}
      </div>
      <p className="stint-stream-status" role="status">
        {stint.status === "running" && !replay ? (
          waitingForPermission ? (
            t.stints.waitingPermission
          ) : (
            t.stints.streaming
          )
        ) : (
          <>
            {t.stints.stint} {t.stints.statuses[stint.status]}
          </>
        )}
      </p>
    </div>
  );
}
