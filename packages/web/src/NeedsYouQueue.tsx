// SPDX-License-Identifier: Apache-2.0

import type { AttentionItem, ProjectSnapshot } from "@stintwork/core";
import { Bell, BellOff, ChevronRight, CircleHelp, Inbox, X } from "lucide-react";
import { m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { kinds } from "./attention-kinds";
import { CheckpointWarnings } from "./CheckpointWarnings";
import { formatDuration } from "./duration";
import { GateSummary } from "./GateSummary";
import { HandoffAnswer } from "./HandoffAnswer";
import {
  CoreTextError,
  readResponseJson,
  renderCoreText,
  useErrorText,
  useLanguage,
} from "./i18n/language";
import { stageName } from "./i18n/workflow-names";
import { MemoryProposal } from "./MemoryProposal";
import { PermissionAnswer } from "./PermissionAnswer";
import { StintRecovery } from "./StintRecovery";
import { Button } from "./ui/Button";
import { Eyebrow } from "./ui/Card";
import { CodeBlock } from "./ui/CodeBlock";
import { IconChip } from "./ui/IconChip";
import { tween, useReducedMotionSafe } from "./ui/motion";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "./ui/Sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/Tooltip";
import { WarningCallout } from "./ui/WarningCallout";
import { attentionTitle, type useAttentionAlerts } from "./useAttentionAlerts";

const kindOrder = Object.keys(kinds) as AttentionItem["kind"][];
export function sortAttentionItems(items: readonly AttentionItem[]): AttentionItem[] {
  return [...items].sort(
    (a, b) =>
      kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || a.raisedAt.localeCompare(b.raisedAt),
  );
}

export function NeedsYouQueue({
  snapshot,
  open,
  onExitComplete,
  alerts,
  openSlug,
  onClose,
  onOpenItem,
  focusAttentionId,
}: {
  snapshot: ProjectSnapshot;
  open?: boolean;
  onExitComplete?: () => void;
  alerts: ReturnType<typeof useAttentionAlerts>;
  openSlug: string | null;
  onClose: () => void;
  onOpenItem: (slug: string, overview?: boolean) => void;
  focusAttentionId?: string | null;
}) {
  const { t, language } = useLanguage();
  const [internalOpen, setInternalOpen] = useState(true);
  const close = () => {
    setInternalOpen(false);
    onClose();
  };
  const opener = useRef<HTMLElement | null>(null);
  const navigating = useRef(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionSafe();
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const [now, setNow] = useState(Date.now);
  const [answerError, setAnswerError] = useErrorText();
  const [answerItem, setAnswerItem] = useState<AttentionItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const answered = useRef(new Map<string, string>());
  const presentIds = useRef(new Set(snapshot.attentionItems.map(({ id }) => id)));
  presentIds.current = new Set(snapshot.attentionItems.map(({ id }) => id));
  function answeredItem(id: string, message: string) {
    if (presentIds.current.has(id)) answered.current.set(id, message);
    else toast.success(message);
  }
  useEffect(() => {
    for (const [id, message] of answered.current) {
      if (!snapshot.attentionItems.some((item) => item.id === id)) {
        toast.success(message);
        answered.current.delete(id);
      }
    }
  }, [snapshot.attentionItems]);

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
      setAnswerItem(snapshot.attentionItems.find((item) => item.kind === "login-required") ?? null);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!(open ?? internalOpen)) return;
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [open, internalOpen]);

  return (
    <Sheet
      open={open ?? internalOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <TooltipProvider>
        <SheetContent
          onExitComplete={onExitComplete}
          className="needs-you-queue flex w-[560px] flex-col p-0"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const previous = document.activeElement;
            if (focusAttentionId) {
              queueMicrotask(() => {
                const target = itemRefs.current.get(focusAttentionId);
                if (target) {
                  target.scrollIntoView?.({ block: "nearest" });
                  target.focus();
                } else {
                  if (contentRef.current) contentRef.current.scrollTop = 0;
                  closeButton.current?.focus();
                }
              });
            } else {
              if (contentRef.current) contentRef.current.scrollTop = 0;
              closeButton.current?.focus();
            }
            opener.current = previous instanceof HTMLElement ? previous : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!navigating.current && opener.current?.isConnected) opener.current.focus();
          }}
        >
          <header className="needs-you-heading flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card p-4 sm:p-6">
            <div className="min-w-0">
              <Eyebrow>{t.needsYou.yourAttention}</Eyebrow>
              <SheetTitle className="mt-2 flex flex-wrap items-center gap-2 text-xl">
                <Inbox className="size-icon-md shrink-0" aria-hidden="true" />
                {t.needsYou.heading}{" "}
                <span className="count min-w-5 rounded-sm bg-muted px-1 text-center text-xs text-muted-foreground">
                  {snapshot.attentionItems.length}
                </span>
              </SheetTitle>
            </div>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={
                      alerts.enabled
                        ? t.needsYou.disableNotifications
                        : t.needsYou.enableNotifications
                    }
                    aria-pressed={alerts.enabled}
                    aria-describedby={
                      !alerts.supported || alerts.error ? "notification-description" : undefined
                    }
                    aria-disabled={!alerts.supported || alerts.requesting}
                    onClick={() => void alerts.toggle()}
                  >
                    {alerts.enabled ? <Bell aria-hidden="true" /> : <BellOff aria-hidden="true" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {alerts.enabled
                    ? t.needsYou.disableNotifications
                    : t.needsYou.enableNotifications}
                </TooltipContent>
              </Tooltip>
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
            </div>
          </header>
          {(!alerts.supported || alerts.error) && (
            <p
              id="notification-description"
              className="px-4 text-xs text-muted-foreground"
              role={alerts.error ? "alert" : undefined}
            >
              {alerts.error || t.needsYou.notificationsUnsupported}
            </p>
          )}
          <div
            ref={contentRef}
            className="needs-you-content min-h-0 flex-1 overflow-auto overscroll-contain p-4 sm:p-6"
          >
            {snapshot.attentionItems.length === 0 && (
              <p role="status" className="needs-you-empty py-4 text-center text-muted-foreground">
                {t.needsYou.empty}
              </p>
            )}
            {sortAttentionItems(snapshot.attentionItems).map((item) => {
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
              const presentation = kinds[item.kind] ?? {
                icon: CircleHelp,
                tone: "attention" as const,
              };
              const minutes = Math.max(0, Math.floor((now - Date.parse(item.raisedAt)) / 60_000));
              return (
                <m.article
                  key={item.id}
                  ref={(node) => {
                    if (node) itemRefs.current.set(item.id, node);
                    else itemRefs.current.delete(item.id);
                  }}
                  tabIndex={-1}
                  initial={
                    !reduced && focusAttentionId === item.id
                      ? { backgroundColor: "var(--attention-soft)" }
                      : false
                  }
                  animate={{ backgroundColor: "transparent" }}
                  transition={tween.overlay}
                  className="attention-item relative min-w-0 focus:outline focus:outline-2 focus:outline-ring border-b border-border py-3 pl-12 text-xs [overflow-wrap:anywhere] [&_h3]:my-1 [&_h3]:text-sm [&_h3]:font-semibold [&_p]:my-1 [&_textarea]:mt-2 [&_textarea]:block [&_textarea]:min-h-24 [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:border [&_textarea]:border-input [&_textarea]:bg-card [&_textarea]:p-3 [&_textarea]:text-foreground"
                  aria-label={title}
                >
                  <span className="absolute left-0 top-3">
                    <IconChip icon={presentation.icon} tone={presentation.tone} />
                  </span>
                  <h3>{title}</h3>
                  <p className="muted text-muted-foreground" data-queue-metadata>
                    {item.agent && item.kind !== "login-required" && (
                      <>{profile?.displayName ?? item.agent} · </>
                    )}
                    {item.ticket !== null && (
                      <>{t.needsYou.ticket(item.ticket, !!workItem?.github)} · </>
                    )}
                    {item.stintId && (
                      <>
                        {t.needsYou.stint} <code>{item.stintId}</code> ·{" "}
                      </>
                    )}
                    <time dateTime={item.raisedAt} title={item.raisedAt}>
                      {item.raisedAt === "1970-01-01T00:00:00.000Z"
                        ? t.needsYou.noReadinessTime
                        : t.needsYou.waiting(formatDuration(minutes, t))}
                    </time>
                  </p>
                  {item.kind !== "login-required" && (
                    <Button
                      variant="ghost"
                      className="attention-work-item h-auto min-h-8 max-w-full justify-start whitespace-normal py-1 text-left wrap-anywhere"
                      onClick={() => {
                        navigating.current = item.workItem !== openSlug;
                        close();
                        onOpenItem(item.workItem);
                      }}
                    >
                      {workItem?.title ?? item.workItem} · {item.workItem}
                      <ChevronRight aria-hidden="true" />
                    </Button>
                  )}
                  {item.kind === "login-required" && (
                    <>
                      <p>
                        {language === "en"
                          ? item.details
                          : t.needsYou.loginInstructions(item.loginCommand)}
                      </p>
                      {language !== "en" &&
                        profile?.availability?.reason?.code &&
                        profile.availability.reason.text === item.details && (
                          <p>{renderCoreText(profile.availability.reason, item.details, t)}</p>
                        )}
                      <CodeBlock className="max-w-full overflow-x-auto whitespace-pre rounded-sm bg-background p-3 font-mono text-xs [overflow-wrap:normal]">
                        <code>{item.loginCommand}</code>
                      </CodeBlock>
                      <Button
                        className="h-auto min-h-8 whitespace-normal py-1"
                        disabled={refreshing}
                        onClick={() => void refreshAvailability()}
                      >
                        {refreshing ? t.needsYou.checkingLogin : t.needsYou.refreshAvailability}
                      </Button>
                    </>
                  )}
                  {item.kind === "approval-stale" && (
                    <p>
                      {t.needsYou.staleApprovalDetails(
                        workflow && stage ? stageName(workflow, stage, t) : item.stage,
                      )}
                    </p>
                  )}
                  {item.kind === "permission" && stint && (
                    <StintRecovery stint={stint} variant="inline" />
                  )}
                  {item.kind === "checkpoint-warning" && (
                    <CheckpointWarnings warnings={item.warnings} variant="inline" />
                  )}
                  {item.kind === "approval-stale" && (
                    <Button
                      variant="secondary"
                      disabled={saving !== null}
                      onClick={() => void reopen(item)}
                    >
                      {t.needsYou.reopenStage(
                        workflow && stage ? stageName(workflow, stage, t) : item.stage,
                      )}
                    </Button>
                  )}
                  {item.kind === "permission" && (
                    <PermissionAnswer
                      onSuccess={() => answeredItem(item.id, t.actionToast.permissionAnswered)}
                      showContext={false}
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
                      onSuccess={() => answeredItem(item.id, t.needsYou.handoffAnswered)}
                      onError={(reason) => {
                        setAnswerError(reason);
                        setAnswerItem(reason ? item : null);
                      }}
                    />
                  )}
                  {item.kind === "memory-proposal" && (
                    <MemoryProposal
                      variant="inline"
                      item={item}
                      onSuccess={() => answeredItem(item.id, t.review.memory.recorded)}
                      onError={(reason) => {
                        setAnswerError(reason);
                        setAnswerItem(reason ? item : null);
                      }}
                    />
                  )}
                  {item.kind === "gate-ready" && workItem && (
                    <GateSummary
                      item={workItem}
                      onSuccess={() => answeredItem(item.id, t.actionToast.gateChanged)}
                      workflows={snapshot.workflows}
                      onOpen={() => {
                        navigating.current = item.workItem !== openSlug;
                        close();
                        onOpenItem(item.workItem, true);
                      }}
                    />
                  )}
                  {answerError && answerItem?.id === item.id && (
                    <p role="alert" className="text-attention-foreground">
                      {answerError}
                    </p>
                  )}
                </m.article>
              );
            })}
            {answerError &&
              answerItem &&
              !snapshot.attentionItems.some(({ id }) => id === answerItem.id) && (
                <article
                  aria-label={attentionTitle(answerItem, t, language)}
                  className="attention-item py-3"
                >
                  <h3>{attentionTitle(answerItem, t, language)}</h3>
                  <p role="alert" className="text-attention-foreground">
                    {answerError}
                  </p>
                </article>
              )}
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
                <p className="text-xs text-muted-foreground">{t.topBar.readOnly}</p>
              </section>
            )}
          </div>
        </SheetContent>
      </TooltipProvider>
    </Sheet>
  );
}
