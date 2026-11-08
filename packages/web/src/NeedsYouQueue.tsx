// SPDX-License-Identifier: Apache-2.0
import { StintRecovery } from "./StintRecovery";
import { CodeBlock } from "./ui/CodeBlock";
import type { AttentionItem, ProjectSnapshot } from "@stintwork/core";
import { Bell, Inbox, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CheckpointWarnings } from "./CheckpointWarnings";
import { PermissionAnswer } from "./PermissionAnswer";
import { HandoffAnswer } from "./HandoffAnswer";
import { MemoryProposal } from "./MemoryProposal";
import { GateView } from "./GateView";
import { attentionStageName, attentionTitle, type useAttentionAlerts } from "./useAttentionAlerts";
import {
  CoreTextError,
  readResponseJson,
  renderCoreText,
  useErrorText,
  useLanguage,
} from "./i18n/language";
import { stageName } from "./i18n/workflow-names";
import { en } from "./i18n/en";
import { Button } from "./ui/Button";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "./ui/Sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/Tooltip";
import { WarningCallout } from "./ui/WarningCallout";

export function NeedsYouQueue({
  snapshot,
  alerts,
  openSlug,
  onClose,
  onOpenItem,
}: {
  snapshot: ProjectSnapshot;
  alerts: ReturnType<typeof useAttentionAlerts>;
  openSlug: string | null;
  onClose: () => void;
  onOpenItem: (slug: string) => void;
}) {
  const { t, language } = useLanguage();
  const opener = useRef<HTMLElement | null>(null);
  const navigating = useRef(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [now, setNow] = useState(Date.now);
  const [answerError, setAnswerError] = useErrorText();
  const [answerItem, setAnswerItem] = useState<AttentionItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  async function reopen(item: Extract<AttentionItem, { kind: "approval-stale" }>) {
    setSaving(item.id);
    setAnswerError("");
    setAnswerItem(null);
    try {
      const response = await fetch(
        `/api/work-items/${encodeURIComponent(item.workItem)}/gates/${encodeURIComponent(item.stage)}/reopen`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const result = await readResponseJson(response);
      if (!response.ok) throw new CoreTextError(result, t.stints.changeGateFailed);
    } catch (cause) {
      setAnswerError(cause instanceof Error ? cause : t.stints.changeGateFailed);
      setAnswerItem(item);
    } finally {
      setSaving(null);
    }
  }

  async function refreshAvailability() {
    setRefreshing(true);
    setAnswerError("");
    setAnswerItem(null);
    try {
      const response = await fetch("/api/agents?refresh=true");
      if (!response.ok) throw new Error(t.needsYou.refreshFailed);
    } catch {
      setAnswerError(t.needsYou.refreshRetry);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <TooltipProvider>
        <SheetContent
          className="needs-you-queue flex w-[560px] flex-col p-0"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const previous = document.activeElement;
            closeButton.current?.focus();
            opener.current = previous instanceof HTMLElement ? previous : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!navigating.current && opener.current?.isConnected) opener.current.focus();
          }}
        >
          <header className="needs-you-heading flex shrink-0 items-center justify-between gap-4 border-b border-border bg-surface p-4 sm:p-6">
            <div className="min-w-0">
              <p className="eyebrow text-xs uppercase tracking-widest text-muted">
                {t.needsYou.yourAttention}
              </p>
              <SheetTitle className="mt-2 flex flex-wrap items-center gap-2 text-xl">
                <Inbox className="size-icon-md shrink-0" aria-hidden="true" />
                {t.needsYou.heading}{" "}
                <span className="count min-w-5 rounded-sm bg-surface-raised px-1 text-center text-xs text-muted">
                  {snapshot.attentionItems.length}
                </span>
              </SheetTitle>
            </div>
            <Tooltip>
              <TooltipTrigger
                asChild
                onFocus={(event) => {
                  if (!opener.current) event.preventDefault();
                }}
              >
                <SheetClose asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    ref={closeButton}
                    aria-label={t.needsYou.close}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </SheetClose>
              </TooltipTrigger>
              <TooltipContent>{t.needsYou.close}</TooltipContent>
            </Tooltip>
          </header>
          <div className="needs-you-content min-h-0 flex-1 overflow-auto overscroll-contain p-4 sm:p-6">
            {snapshot.attentionItems.length === 0 && (
              <p role="status" className="needs-you-empty py-4 text-center text-muted">
                {t.needsYou.empty}
              </p>
            )}
            {snapshot.attentionItems.map((item) => {
              const profile = snapshot.agents.find((agent) => agent.id === item.agent);
              const workItem = snapshot.workItems.find((entry) => entry.slug === item.workItem);
              const stint =
                workItem?.activeStint?.id === item.stintId
                  ? workItem.activeStint
                  : workItem?.stints.find((entry) => entry.id === item.stintId);
              const workflow = workItem && snapshot.workflows[workItem.workflow];
              const stage =
                (item.kind === "gate-ready" || item.kind === "approval-stale") && workflow
                  ? workflow.stages.find((stage) => stage.id === item.stage)
                  : undefined;
              const title = attentionTitle(
                item,
                t,
                language,
                profile?.displayName ?? item.agent ?? "",
                workflow && stage ? stageName(workflow, stage, t) : undefined,
              );
              if (item.kind === "login-required")
                return (
                  <article
                    key={item.id}
                    className="attention-item mb-4 min-w-0 rounded-lg border border-border-strong bg-surface p-4 text-sm [overflow-wrap:anywhere] [&_h3]:my-3 [&_h3]:text-lg [&_p]:my-2 [&_textarea]:mt-2 [&_textarea]:block [&_textarea]:min-h-24 [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:border [&_textarea]:border-border-strong [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-text"
                    aria-label={title}
                  >
                    <p className="eyebrow text-xs uppercase tracking-widest text-muted">
                      {t.needsYou.loginRequired} · {profile?.displayName ?? item.agent}
                    </p>
                    <h3>{title}</h3>
                    <p>
                      {language === "en"
                        ? item.details
                        : t.needsYou.loginInstructions(item.loginCommand)}
                    </p>
                    {language !== "en" &&
                      item.details !== en.needsYou.loginInstructions(item.loginCommand) && (
                        <p>
                          {renderCoreText(
                            profile?.availability?.reason?.text === item.details
                              ? profile.availability.reason
                              : undefined,
                            item.details,
                            t,
                          )}
                        </p>
                      )}
                    <CodeBlock className="max-w-full overflow-x-auto whitespace-pre rounded-sm bg-bg p-3 font-mono text-xs [overflow-wrap:normal]">
                      <code>{item.loginCommand}</code>
                    </CodeBlock>
                    <Button
                      className="h-auto min-h-8 whitespace-normal py-1"
                      disabled={refreshing}
                      onClick={() => void refreshAvailability()}
                    >
                      {refreshing ? t.needsYou.checkingLogin : t.needsYou.refreshAvailability}
                    </Button>
                  </article>
                );
              const minutes = Math.max(0, Math.floor((now - Date.parse(item.raisedAt)) / 60_000));
              return (
                <article
                  key={item.id}
                  className="attention-item mb-4 min-w-0 rounded-lg border border-border-strong bg-surface p-4 text-sm [overflow-wrap:anywhere] [&_h3]:my-3 [&_h3]:text-lg [&_p]:my-2 [&_textarea]:mt-2 [&_textarea]:block [&_textarea]:min-h-24 [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:border [&_textarea]:border-border-strong [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-text"
                  aria-label={title}
                >
                  <p className="eyebrow text-xs uppercase tracking-widest text-muted">
                    {item.kind === "permission"
                      ? t.needsYou.permission
                      : item.kind === "handoff-unresolved"
                        ? t.needsYou.handoff
                        : item.kind === "checkpoint-warning"
                          ? t.needsYou.checkpoint
                          : item.kind === "memory-proposal"
                            ? t.needsYou.memoryProposal
                            : item.kind === "approval-stale"
                              ? t.needsYou.approvalStale
                              : t.needsYou.gateReady}
                    {item.agent && ` · ${profile?.displayName ?? item.agent}`}
                  </p>
                  <h3>{title}</h3>
                  {item.kind === "approval-stale" && (
                    <p>
                      {t.needsYou.staleApprovalDetails(
                        workflow && stage ? stageName(workflow, stage, t) : item.stage,
                      )}
                    </p>
                  )}
                  {item.kind === "permission" && stint && <StintRecovery stint={stint} />}
                  {item.kind === "checkpoint-warning" && (
                    <>
                      <p>
                        {language === "en"
                          ? item.details
                          : item.warnings.some((warning) => !warning.excluded)
                            ? t.needsYou.committedRemediation
                            : t.needsYou.excludedRemediation}
                      </p>
                      <CheckpointWarnings warnings={item.warnings} />
                    </>
                  )}
                  <Button
                    variant="ghost"
                    className="attention-work-item h-auto min-h-8 max-w-full justify-start whitespace-normal py-1 text-left wrap-anywhere"
                    onClick={() => {
                      navigating.current = item.workItem !== openSlug;
                      onClose();
                      onOpenItem(item.workItem);
                    }}
                  >
                    {workItem?.title ?? item.workItem} · {item.workItem}
                  </Button>
                  <p className="muted text-muted">
                    {item.ticket === null ? t.needsYou.noTicket : t.needsYou.ticket(item.ticket)}
                    {item.stintId && (
                      <>
                        {" "}
                        · {t.needsYou.stint} <code>{item.stintId}</code>
                      </>
                    )}
                  </p>
                  <p className="muted text-muted">
                    <time dateTime={item.raisedAt} title={item.raisedAt}>
                      {item.raisedAt === "1970-01-01T00:00:00.000Z"
                        ? t.needsYou.noReadinessTime
                        : t.needsYou.waiting(minutes)}
                    </time>
                  </p>
                  {item.kind === "approval-stale" && (
                    <Button
                      variant="secondary"
                      disabled={saving !== null}
                      onClick={() => void reopen(item)}
                    >
                      {t.stints.reopen(
                        workflow && stage ? stageName(workflow, stage, t) : item.stage,
                      )}
                    </Button>
                  )}
                  {item.kind === "permission" && (
                    <PermissionAnswer
                      stintId={item.stintId}
                      request={item}
                      profile={profile}
                      onError={(reason) => {
                        setAnswerError(reason);
                        setAnswerItem(reason ? item : null);
                      }}
                    />
                  )}
                  {item.kind === "handoff-unresolved" && (
                    <HandoffAnswer
                      item={item}
                      onError={(reason) => {
                        setAnswerError(reason);
                        setAnswerItem(reason ? item : null);
                      }}
                    />
                  )}
                  {item.kind === "memory-proposal" && (
                    <MemoryProposal
                      item={item}
                      onError={(reason) => {
                        setAnswerError(reason);
                        setAnswerItem(reason ? item : null);
                      }}
                    />
                  )}
                  {item.kind === "gate-ready" && workItem && (
                    <GateView
                      item={workItem}
                      warnings={snapshot.warnings}
                      workflows={snapshot.workflows}
                    />
                  )}
                </article>
              );
            })}
            {snapshot.warnings.length > 0 && (
              <section
                aria-labelledby="project-warnings-heading"
                className={
                  snapshot.attentionItems.length ? "mt-6 border-t border-border pt-4" : "mt-4"
                }
              >
                <h3 id="project-warnings-heading" className="mb-3 text-sm font-medium">
                  {t.topBar.projectWarnings}
                </h3>
                <WarningCallout warnings={snapshot.warnings} />
                <p className="text-xs text-muted">{t.topBar.readOnly}</p>
              </section>
            )}
          </div>
          <footer className="needs-you-footer shrink-0 border-t border-border bg-surface p-4 text-xs wrap-anywhere sm:p-6 [&_p]:mt-2">
            {answerError && (
              <p role="alert" className="warning text-warning">
                {answerItem &&
                  `${attentionTitle(answerItem, t, language, undefined, attentionStageName(answerItem, snapshot, t))}: `}
                {answerError}
              </p>
            )}
            <Button
              className="h-auto min-h-8 max-w-full whitespace-normal py-1"
              disabled={!alerts.supported || alerts.requesting}
              aria-pressed={alerts.enabled}
              onClick={() => void alerts.toggle()}
            >
              <Bell aria-hidden="true" />
              {alerts.enabled ? t.needsYou.disableNotifications : t.needsYou.enableNotifications}
            </Button>
            {!alerts.supported && (
              <p className="muted text-muted">{t.needsYou.notificationsUnsupported}</p>
            )}
            {alerts.error && (
              <p role="alert" className="warning text-warning">
                {alerts.error}
              </p>
            )}
          </footer>
        </SheetContent>
      </TooltipProvider>
    </Sheet>
  );
}
