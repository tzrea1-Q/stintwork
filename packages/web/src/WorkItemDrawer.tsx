// SPDX-License-Identifier: Apache-2.0
import { Markdown } from "./ui/Markdown";
import { Badge } from "./ui/Badge";
import {
  builtInWorkflows,
  type WorkflowDefinitions,
  type Milestone,
  type AgentProfile,
  type Warning,
} from "@stintwork/core";
import { CheckCircle2, Circle, Copy, LockKeyhole, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GithubRefreshConflict, refreshGithubItem } from "./github-refresh";
import { StageBriefPreview, TicketBriefPreview } from "./BriefPreview";
import { StintStream } from "./StintStream";
import { StopStint } from "./StopStint";
import { StintHistory } from "./StintHistory";
import type { BoardWorkItem } from "./WorkItemCard";
import { StageAgentRail } from "./StageAgentRail";
import { GateView } from "./GateView";
import { ReviewOverlay } from "./ReviewOverlay";
import { ChecksPanel } from "./ChecksPanel";
import { ShipActions } from "./ShipActions";
import { FindingCard, FindingsRail, reviewFindings } from "./ReviewFindings";
import { ticketStatus, useErrorText, useLanguage } from "./i18n/language";
import { stageName, workflowName } from "./i18n/workflow-names";
import { Button } from "./ui/Button";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "./ui/Sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/Tooltip";

function FilePath({ path }: { path: string }) {
  const { t } = useLanguage();
  const [message, setMessage] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(path);
      setMessage(t.stints.copied);
    } catch {
      setMessage(t.stints.copyPathFailed);
    }
  }

  return (
    <div className="file-path mb-4 mt-2 flex flex-wrap items-center gap-2 text-xs text-muted [&_code]:min-w-0 [&_code]:[overflow-wrap:anywhere]">
      <code>{path}</code>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={copy} aria-label={t.stints.copyPath(path)}>
            <Copy aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t.stints.copyPath(path)}</TooltipContent>
      </Tooltip>
      <span className="copy-status text-xs" role="status">
        {message}
      </span>
    </div>
  );
}

export function WorkItemDrawer({
  item,
  milestone,
  onClose,
  agents = [],
  warnings = [],
  workflows = builtInWorkflows,
  onCustomiseWorkflow,
  githubReadOnly = false,
  githubRetryAt,
}: {
  item: BoardWorkItem;
  githubReadOnly?: boolean;
  githubRetryAt?: string;
  milestone?: Milestone;
  onClose: () => void;
  agents?: AgentProfile[];
  warnings?: Warning[];
  workflows?: WorkflowDefinitions;
  onCustomiseWorkflow?: (id: string) => void;
}) {
  const { t } = useLanguage();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshAttempt, setRefreshAttempt] = useState(0);
  const [refreshError, setRefreshError] = useErrorText();
  const refreshed = useRef<number>();
  const githubNumber = item.github?.number;
  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry intentionally restarts this effect.
  useEffect(() => {
    if (githubNumber === undefined || refreshed.current === githubNumber) return;
    const number = githubNumber;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function attempt(count: number) {
      const delay = githubRetryAt ? Date.parse(githubRetryAt) - Date.now() : 0;
      if (delay > 0) {
        setRefreshing(false);
        timer = setTimeout(() => void attempt(count), Math.min(delay, 2_147_483_647));
        return;
      }
      setRefreshing(true);
      setRefreshError("");
      try {
        await refreshGithubItem(number, t.stints.changeGateFailed);
        if (!cancelled) refreshed.current = number;
      } catch (cause) {
        if (cancelled) return;
        if (cause instanceof GithubRefreshConflict && count < 3) {
          timer = setTimeout(() => void attempt(count + 1), 250 * count);
          return;
        }
        setRefreshError(cause instanceof Error ? cause : t.stints.changeGateFailed);
      }
      if (!cancelled) setRefreshing(false);
    }
    void attempt(1);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [githubNumber, githubRetryAt, refreshAttempt, setRefreshError, t.stints.changeGateFailed]);
  const opener = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const activeProfile = agents.find((agent) => agent.id === item.activeStint?.agent);
  const workflow = workflows[item.workflow];
  const stage = workflow.stages.find(({ id }) => id === item.stage);
  const type = item.type === "effort" ? t.card.effort : workflowName(workflow, t);
  const reviewStageId = workflow.stages.find(({ gate }) => gate === "evidence")?.id;
  const archived = reviewFindings(item.stints, item.reviewDecisions, item, reviewStageId);

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <TooltipProvider>
        <SheetContent
          className="work-item-drawer flex w-[60vw] min-w-[min(600px,calc(100vw-32px))] flex-col p-0"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const previous = document.activeElement;
            closeButton.current?.focus();
            opener.current = previous instanceof HTMLElement ? previous : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (document.activeElement === document.body && opener.current?.isConnected)
              opener.current.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (
              reviewOpen ||
              (event.target instanceof Element && event.target.closest("dialog[open]"))
            )
              event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (reviewOpen) event.preventDefault();
          }}
        >
          <header className="drawer-header shrink-0 px-4 py-6 sm:px-7">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow text-xs uppercase tracking-widest text-muted min-w-0 break-words">
                {type} / <code>{item.slug}</code>
              </p>
              <div className="flex shrink-0 items-center gap-2">
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
                        aria-label={t.stints.closeWorkItem}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </SheetClose>
                  </TooltipTrigger>
                  <TooltipContent>{t.stints.closeWorkItem}</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <SheetTitle
              className="mt-3 text-xl font-medium truncate"
              data-truncate
              title={item.title}
            >
              {item.title}
            </SheetTitle>
            <p className="mt-3 text-xs text-muted wrap-anywhere">
              {t.stints.milestone} {milestone?.name ?? item.milestone ?? t.stints.noMilestone}
            </p>
            <p className="mt-3 text-xs text-muted wrap-anywhere">
              {t.stints.workflow} {workflowName(workflow, t)}{" "}
              {onCustomiseWorkflow && Object.hasOwn(builtInWorkflows, item.workflow) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onCustomiseWorkflow(item.workflow)}
                >
                  {t.stints.customise}
                </Button>
              )}
            </p>
            {item.worktreePath && (
              <div className="mt-3">
                <p className="text-xs muted text-muted">{t.stints.worktreeFiles}</p>
                <FilePath path={item.worktreePath} />
                <Button size="sm" onClick={() => setReviewOpen(true)}>
                  {t.stints.openReview}
                </Button>
              </div>
            )}
          </header>
          {refreshing && (
            <p role="status" className="px-4 text-sm text-muted sm:px-7">
              {t.board.githubStatus.pending}
            </p>
          )}
          {refreshError && (
            <div className="px-4 text-sm text-warning sm:px-7">
              <p role="alert">{refreshError}</p>
              <Button variant="secondary" onClick={() => setRefreshAttempt((count) => count + 1)}>
                {t.board.githubStatus.retry}
              </Button>
            </div>
          )}
          {item.stage && !item.merged ? (
            <StageAgentRail key={item.slug} item={item} workflows={workflows} />
          ) : !item.merged ? (
            <p className="drawer-stage-note px-4 py-4 sm:px-7 muted text-muted">
              {t.stints.noStage}
            </p>
          ) : null}
          <nav
            className="drawer-sections flex shrink-0 gap-6 border-b border-border px-4 py-3 text-xs sm:px-7 [&_a:hover]:text-accent"
            aria-label={t.stints.sections}
          >
            <a href="#drawer-spec">{t.stints.spec}</a>
            <a href="#drawer-tickets">
              {t.stints.tickets}{" "}
              <span className="count min-w-5 rounded-sm bg-surface-raised px-1 text-center text-xs text-muted">
                {item.tickets.length}
              </span>
            </a>
          </nav>
          <div className="drawer-content min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain px-4 py-6 sm:px-7 [&_section+section]:mt-8 [&_section+section]:border-t [&_section+section]:border-border [&_section+section]:pt-6">
            {item.activeStint && (
              <section aria-labelledby="drawer-live-stint-title">
                <h3
                  id="drawer-live-stint-title"
                  className="drawer-section-heading mb-3 flex items-center gap-2 text-base font-semibold"
                >
                  {t.stints.liveStint}
                </h3>
                <p role="status">
                  {activeProfile?.displayName ?? item.activeStint.agent}
                  {item.activeStint.ticket !== null && (
                    <> · {t.stints.ticket(item.activeStint.ticket)}</>
                  )}{" "}
                  · <Badge variant="accent">{t.stints.statuses[item.activeStint.status]}</Badge>
                </p>
                <StopStint
                  key={`stop:${item.activeStint.id}`}
                  stintId={item.activeStint.id}
                  recovering={!!item.activeStint.recovery?.state}
                />
                <StintStream
                  key={`stream:${item.activeStint.id}`}
                  stint={item.activeStint}
                  profile={activeProfile}
                />
              </section>
            )}
            <ShipActions item={item} workflows={workflows} />
            {!item.merged && (
              <GateView
                key={item.github ? item.slug : `${item.slug}:${item.stage}`}
                item={item}
                warnings={warnings}
                githubReadOnly={githubReadOnly}
                workflows={workflows}
              />
            )}
            {item.stage &&
              !item.merged &&
              (!item.tickets.length || stage?.column !== "implement") && (
                <section aria-label={t.stints.stageStintSection}>
                  <h3 className="drawer-section-heading mb-3 flex items-center gap-2 text-base font-semibold">
                    {t.stints.stageStint(stage ? stageName(workflow, stage, t) : "")}
                  </h3>
                  <StageBriefPreview
                    item={item}
                    workflows={workflows}
                    githubReadOnly={githubReadOnly}
                  />
                </section>
              )}
            <section id="drawer-spec" aria-labelledby="drawer-spec-title">
              <h3
                id="drawer-spec-title"
                className="drawer-section-heading mb-3 flex items-center gap-2 text-base font-semibold"
              >
                {t.stints.spec}
              </h3>
              {item.spec ? (
                <>
                  <FilePath path={item.spec.path} />
                  <Markdown>{item.spec.text}</Markdown>
                </>
              ) : (
                <p className="muted text-muted">{t.stints.noSpec}</p>
              )}
            </section>
            <section id="drawer-tickets" aria-labelledby="drawer-tickets-title">
              <h3
                id="drawer-tickets-title"
                className="drawer-section-heading mb-3 flex items-center gap-2 text-base font-semibold"
              >
                {t.stints.tickets}{" "}
                <span className="count min-w-5 rounded-sm bg-surface-raised px-1 text-center text-xs text-muted">
                  {item.tickets.length}
                </span>
              </h3>
              {item.tickets.length ? (
                <ol className="drawer-tickets">
                  {item.tickets.map((ticket) => {
                    const StatusIcon = ticket.resolved
                      ? CheckCircle2
                      : ticket.blocked
                        ? LockKeyhole
                        : Circle;
                    return (
                      <li key={ticket.path}>
                        <details className="drawer-ticket rounded-md border border-border p-3 [&>summary]:flex [&>summary]:list-none [&>summary]:items-start [&>summary]:gap-3 [&>summary::-webkit-details-marker]:hidden [&>summary::after]:ml-auto [&>summary::after]:text-muted [&>summary::after]:content-['+'] [&[open]>summary::after]:content-['−']">
                          <summary>
                            <StatusIcon
                              className={
                                ticket.resolved
                                  ? "size-icon-sm shrink-0 text-success"
                                  : ticket.blocked
                                    ? "size-icon-sm shrink-0 text-warning"
                                    : "size-icon-sm shrink-0 text-muted"
                              }
                              aria-hidden="true"
                            />
                            <span className="ticket-title grid min-w-0 gap-1 [overflow-wrap:anywhere] [&_strong]:text-sm [&_strong]:font-medium [&_small]:text-xs">
                              <strong>
                                {String(ticket.number).padStart(2, "0")} · {ticket.title}
                              </strong>
                              <small
                                className={
                                  ticket.blocked ? "warning text-warning" : "muted text-muted"
                                }
                              >
                                <Badge
                                  variant={
                                    ticket.resolved
                                      ? "success"
                                      : ticket.blocked
                                        ? "warning"
                                        : "secondary"
                                  }
                                >
                                  {ticketStatus(ticket.status, t)}
                                </Badge>
                                {ticket.blockedBy.length > 0 && (
                                  <>
                                    {" "}
                                    {t.stints.blockedBy}{" "}
                                    {ticket.blockedBy
                                      .map((number) => String(number).padStart(2, "0"))
                                      .join(", ")}
                                  </>
                                )}
                              </small>
                            </span>
                          </summary>
                          <Markdown>{ticket.body}</Markdown>
                        </details>
                        <FilePath path={ticket.path} />
                        {!item.merged && (
                          <TicketBriefPreview
                            item={item}
                            ticket={ticket}
                            workflows={workflows}
                            githubReadOnly={githubReadOnly}
                          />
                        )}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="muted text-muted">{t.stints.noTickets}</p>
              )}
            </section>
            <section aria-labelledby="drawer-stint-history-title">
              <h3
                id="drawer-stint-history-title"
                className="drawer-section-heading mb-3 flex items-center gap-2 text-base font-semibold"
              >
                {t.stints.history}
              </h3>
              <StintHistory stints={item.stints} />
            </section>
            {item.merged && (
              <>
                <section aria-label={t.stints.reviewFindings}>
                  <h3 className="drawer-section-heading mb-3 flex items-center gap-2 text-base font-semibold">
                    {t.stints.reviewFindings}
                  </h3>
                  <FindingsRail {...archived} anchor={(finding) => `archived-${finding.id}`} />
                  {archived.findings.map((finding) => (
                    <FindingCard
                      key={finding.id}
                      finding={finding}
                      anchor={`archived-${finding.id}`}
                    />
                  ))}
                </section>
                <section aria-label={t.stints.recordedChecks}>
                  <h3 className="drawer-section-heading mb-3 flex items-center gap-2 text-base font-semibold">
                    {t.stints.checks}
                  </h3>
                  <ChecksPanel item={item} />
                </section>
              </>
            )}
          </div>
          <footer className="drawer-footer flex shrink-0 flex-wrap justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted sm:px-7">
            <span>{item.github ? t.stints.githubTracker : t.stints.tracker}</span>
            <span>
              <kbd>Esc</kbd>
              {t.stints.returnToPipeline}
            </span>
          </footer>
          {reviewOpen && (
            <ReviewOverlay
              reviewStageId={reviewStageId}
              item={item}
              onClose={() => setReviewOpen(false)}
              checks={<ChecksPanel item={item} />}
            />
          )}
        </SheetContent>
      </TooltipProvider>
    </Sheet>
  );
}
