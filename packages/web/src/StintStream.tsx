// SPDX-License-Identifier: Apache-2.0
import { CodeBlock } from "./ui/CodeBlock";
import { Markdown } from "./ui/Markdown";
import { Badge } from "./ui/Badge";
import {
  pendingStintPermissions,
  type AgentProfile,
  type Stint,
  type StintEvent,
  type StintToolContent,
} from "@stintwork/core";
import { Check, FileCode2, ListChecks, Wrench } from "lucide-react";
import { PermissionAnswer } from "./PermissionAnswer";
import { PermissionDetails } from "./PermissionDetails";
import { readableToolOutput } from "./tool-output";
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
  const pending =
    !replay &&
    pendingStintPermissions(stint).find((request) => request.requestId === event.requestId);

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
      const failed = stint.events.some(
        (entry) =>
          entry.type === "permission_delivery" &&
          entry.requestId === event.requestId &&
          entry.attemptId === event.attemptId &&
          entry.outcome === "failed",
      );
      outcome = failed
        ? t.needsYou.permissionFailed
        : (event.options.find((option) => option.optionId === optionId)?.name ?? optionId);
      if (decision.automatic && !failed) outcome = t.stints.automaticOutcome(outcome);
    } else
      outcome =
        decision.decision.outcome === "failed"
          ? decision.decision.reason
          : t.stints.permissionCancelled;
  }
  return (
    <section
      className="stint-permission rounded-md border border-warning p-3"
      aria-label={t.stints.permissionTitle(event.title ?? event.toolCallId)}
    >
      <strong>{event.title ?? t.stints.permissionRequested}</strong>
      {event.kind && (
        <span className="muted text-muted">
          {" "}
          · {stintEventKind(event.kind, t.stints.toolKinds)}
        </span>
      )}
      {pending ? (
        <>
          {!pending.binding && <p>{t.stints.waitingForAnswer}</p>}
          <PermissionAnswer stintId={stint.id} request={pending} profile={profile} />
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
  const waitingForPermission = pendingStintPermissions(stint).length > 0;
  return (
    <div className="stint-stream min-w-0 [overflow-wrap:anywhere]">
      {stint.events
        .filter((event) => event.type === "plan")
        .map((event) => {
          const occurrences = new Map<string, number>();
          return (
            event.type === "plan" && (
              <section
                key={event.id}
                className="stint-plan rounded-md border border-border-strong bg-surface-raised p-3 [&_h4]:mb-3 [&_h4]:flex [&_h4]:items-center [&_h4]:gap-2 [&_li]:flex [&_li]:items-center [&_li]:gap-2 [&_li]:py-1 [&_ol]:m-0 [&_ol]:list-none [&_ol]:p-0 [&_small]:ml-auto [&_small]:text-muted"
                aria-label={t.stints.stintPlan}
              >
                <h4>
                  <ListChecks className="size-icon-sm shrink-0" aria-hidden="true" />
                  {t.stints.plan}{" "}
                  <span className="muted text-muted">
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
                        className={
                          entry.status === "completed" ? "stint-step-completed text-success" : ""
                        }
                      >
                        {entry.status === "completed" && (
                          <Check className="size-icon-sm shrink-0" aria-hidden="true" />
                        )}
                        <span>{entry.content}</span>
                        <small>
                          <Badge
                            variant={
                              entry.status === "completed"
                                ? "success"
                                : entry.status === "in_progress"
                                  ? "accent"
                                  : "secondary"
                            }
                          >
                            {t.stints.progress[entry.status]}
                          </Badge>
                        </small>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )
          );
        })}
      <div
        className="stint-messages stint-event-log max-h-[440px] overflow-y-auto"
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
          if (event.type === "permission_delivery") return null;
          const key =
            "requestId" in event
              ? event.requestId
              : "id" in event
                ? event.id
                : "toolCallId" in event
                  ? `${event.type}:${event.toolCallId}:${"path" in event ? event.path : ""}`
                  : index;
          return (
            <div
              className={`stint-event min-w-0 border-b border-border py-3 [overflow-wrap:anywhere] stint-event-${event.type}`}
              key={`${event.type}:${key}`}
            >
              {(event.type === "message" || event.type === "thought") && (
                <div>
                  {event.type === "thought" && <small>{t.stints.agentThought}</small>}
                  <Markdown className={event.type === "thought" ? "text-muted" : undefined}>
                    {event.type === "message"
                      ? renderCoreText(event.message, event.text, t)
                      : event.text}
                  </Markdown>
                </div>
              )}
              {event.type === "tool_call" && (
                <div>
                  <div className="stint-tool-heading flex flex-wrap items-start gap-2 [&>span]:ml-auto [&>span]:text-muted">
                    <Wrench className="size-icon-sm shrink-0" aria-hidden="true" />
                    <strong>{event.title ?? event.toolCallId}</strong>
                    <span>
                      {stintEventKind(event.kind ?? "other", t.stints.toolKinds)} ·{" "}
                      <Badge
                        variant={
                          event.status === "completed"
                            ? "success"
                            : event.status === "failed"
                              ? "danger"
                              : event.status === "in_progress"
                                ? "accent"
                                : "secondary"
                        }
                      >
                        {t.stints.progress[event.status ?? "pending"]}
                      </Badge>
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
                    <details className="stint-tool-output [&_summary]:text-muted">
                      <summary>{t.stints.toolOutput}</summary>
                      {!!event.content?.length && (
                        <CodeBlock>
                          {event.content.map((content) => toolOutput(content, t)).join("\n\n")}
                        </CodeBlock>
                      )}
                      {event.output && <CodeBlock>{readableToolOutput(event.output)}</CodeBlock>}
                    </details>
                  ) : null}
                </div>
              )}
              {event.type === "file_edit" && (
                <div className="stint-file-edit flex flex-wrap items-center gap-2 [&_code]:text-success">
                  <FileCode2 className="size-icon-sm shrink-0" aria-hidden="true" />
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
                  <CodeBlock>{JSON.stringify(event.update, null, 2)}</CodeBlock>
                </details>
              )}
            </div>
          );
        })}
        {stint.error && (
          <p role="alert" className="warning text-warning">
            {renderCoreText(stint.errorMessage, stint.error, t)}
          </p>
        )}
      </div>
      <p className="stint-stream-status text-accent" role="status" aria-label={t.stints.stint}>
        {stint.status === "running" && !replay ? (
          waitingForPermission ? (
            t.stints.waitingPermission
          ) : (
            t.stints.streaming
          )
        ) : (
          <>
            {t.stints.stint}{" "}
            <Badge
              variant={
                stint.status === "finished"
                  ? "success"
                  : stint.status === "failed"
                    ? "danger"
                    : "secondary"
              }
            >
              {t.stints.statuses[stint.status]}
            </Badge>
          </>
        )}
      </p>
    </div>
  );
}
