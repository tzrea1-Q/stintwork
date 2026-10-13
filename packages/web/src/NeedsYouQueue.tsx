// SPDX-License-Identifier: Apache-2.0
import type { AttentionItem, ProjectSnapshot } from "@stintwork/core";
import { Bell, Inbox, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CheckpointWarnings } from "./CheckpointWarnings";
import { PermissionAnswer } from "./PermissionAnswer";
import { HandoffAnswer } from "./HandoffAnswer";
import { MemoryProposal } from "./MemoryProposal";
import { GateView } from "./GateView";
import { attentionTitle, type useAttentionAlerts } from "./useAttentionAlerts";
import { renderCoreText, useErrorText, useLanguage } from "./i18n/language";
import { stageName } from "./i18n/workflow-names";
import { en } from "./i18n/en";
import { Button } from "./ui/Button";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "./ui/Sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/Tooltip";
import "./needs-you.css";
import "./stint-stream.css";

export function NeedsYouQueue({
  snapshot,
  alerts,
  onClose,
  onOpenItem,
}: {
  snapshot: ProjectSnapshot;
  alerts: ReturnType<typeof useAttentionAlerts>;
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
              <p className="eyebrow">{t.needsYou.yourAttention}</p>
              <SheetTitle className="mt-2 flex flex-wrap items-center gap-2 text-xl">
                <Inbox className="size-icon-md shrink-0" aria-hidden="true" />
                {t.needsYou.heading} <span className="count">{snapshot.attentionItems.length}</span>
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
          <div className="needs-you-content min-h-0 flex-1 overflow-auto overscroll-contain p-4 sm:p-6 [&_pre]:max-w-full [&_pre]:overflow-x-auto">
            {snapshot.attentionItems.length === 0 && (
              <p role="status" className="needs-you-empty">
                {t.needsYou.empty}
              </p>
            )}
            {snapshot.attentionItems.map((item) => {
              const profile = snapshot.agents.find((agent) => agent.id === item.agent);
              const workItem = snapshot.workItems.find((entry) => entry.slug === item.workItem);
              const workflow = workItem && snapshot.workflows[workItem.workflow];
              const stage =
                item.kind === "gate-ready" && workflow
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
                  <article key={item.id} className="attention-item" aria-label={title}>
                    <p className="eyebrow">
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
                    <pre>
                      <code>{item.loginCommand}</code>
                    </pre>
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
                <article key={item.id} className="attention-item" aria-label={title}>
                  <p className="eyebrow">
                    {item.kind === "permission"
                      ? t.needsYou.permission
                      : item.kind === "handoff-unresolved"
                        ? t.needsYou.handoff
                        : item.kind === "checkpoint-warning"
                          ? t.needsYou.checkpoint
                          : item.kind === "memory-proposal"
                            ? t.needsYou.memoryProposal
                            : t.needsYou.gateReady}
                    {item.agent && ` · ${profile?.displayName ?? item.agent}`}
                  </p>
                  <h3>{title}</h3>
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
                      navigating.current = true;
                      onClose();
                      onOpenItem(item.workItem);
                    }}
                  >
                    {workItem?.title ?? item.workItem} · {item.workItem}
                  </Button>
                  <p className="muted">
                    {item.ticket === null ? t.needsYou.noTicket : t.needsYou.ticket(item.ticket)}
                    {item.stintId && (
                      <>
                        {" "}
                        · {t.needsYou.stint} <code>{item.stintId}</code>
                      </>
                    )}
                  </p>
                  <p className="muted">
                    <time dateTime={item.raisedAt} title={item.raisedAt}>
                      {item.raisedAt === "1970-01-01T00:00:00.000Z"
                        ? t.needsYou.noReadinessTime
                        : t.needsYou.waiting(minutes)}
                    </time>
                  </p>
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
          </div>
          <footer className="needs-you-footer shrink-0 border-t border-border bg-surface p-4 text-xs wrap-anywhere sm:p-6 [&_p]:mt-2">
            {answerError && (
              <p role="alert" className="warning">
                {answerItem && `${attentionTitle(answerItem, t, language)}: `}
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
            {!alerts.supported && <p className="muted">{t.needsYou.notificationsUnsupported}</p>}
            {alerts.error && (
              <p role="alert" className="warning">
                {alerts.error}
              </p>
            )}
          </footer>
        </SheetContent>
      </TooltipProvider>
    </Sheet>
  );
}
