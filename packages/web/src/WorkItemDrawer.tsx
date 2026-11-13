// SPDX-License-Identifier: Apache-2.0

import {
  type AgentProfile,
  builtInWorkflows,
  briefAvailability,
  stageAgent,
  type Milestone,
  type Warning,
  type WorkflowDefinitions,
} from "@stintwork/core";
import {
  CheckCircle2,
  Circle,
  Copy,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  LayoutGrid,
  LockKeyhole,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { StageBriefPreview, TicketBriefPreview } from "./BriefPreview";
import { ChecksPanel } from "./ChecksPanel";
import { GateView } from "./GateView";
import { GithubRefreshConflict, refreshGithubItem } from "./github-refresh";
import { ticketStatus, useErrorText, useLanguage } from "./i18n/language";
import { stageName, workflowName } from "./i18n/workflow-names";
import { FindingCard, FindingsRail, reviewFindings } from "./ReviewFindings";
import { ReviewOverlay } from "./ReviewOverlay";
import { ShipActions } from "./ShipActions";
import { StageAgentRail } from "./StageAgentRail";
import { StintHistory } from "./StintHistory";
import { recoveryStatus } from "./StintRecovery";
import { StintStream } from "./StintStream";
import { StopStint } from "./StopStint";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { AgentAvatar } from "./ui/AgentAvatar";
import { Markdown } from "./ui/Markdown";
import { PropertyList, PropertyRow } from "./ui/PropertyRow";
import { Sheet, SheetContent, SheetTitle } from "./ui/Sheet";
import { StatusChip } from "./ui/StatusChip";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/Tooltip";
import type { BoardWorkItem } from "./WorkItemCard";

function FilePath({ path, compact = false }: { path: string; compact?: boolean }) {
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
    <div
      className={
        compact
          ? "file-path flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
          : "file-path mb-4 mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground [&_code]:min-w-0 [&_code]:[overflow-wrap:anywhere]"
      }
    >
      <code
        className={compact ? "min-w-0 flex-1 truncate" : "block max-w-full truncate"}
        data-truncate
        title={path}
      >
        {path}
      </code>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={compact ? "shrink-0" : undefined}
            onClick={copy}
            aria-label={t.stints.copyPath(path)}
          >
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
  pendingPermissions = false,
  attentionCount = 0,
  onOpenNeedsYou,
}: {
  item: BoardWorkItem;
  pendingPermissions?: boolean;
  attentionCount?: number;
  onOpenNeedsYou?: () => void;
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
  const missingShippedDetail = !!item.merged && !!item.github && !item.github.ticketsKnown;
  const ticketNumber = (number: number) =>
    item.github ? `#${number}` : String(number).padStart(2, "0");
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
  const autoFocusing = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const [docked, setDocked] = useState(
    () =>
      typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1024px)").matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDocked(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!docked) return;
    const previous = document.activeElement;
    opener.current = previous instanceof HTMLElement ? previous : null;
    autoFocusing.current = true;
    closeButton.current?.focus();
    autoFocusing.current = false;
    return () => {
      if (
        (document.activeElement === document.body ||
          document.activeElement === closeButton.current) &&
        opener.current?.isConnected
      )
        opener.current.focus();
    };
  }, [docked]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [shipPaused, setShipPaused] = useState(false);
  useEffect(() => {
    if (!docked) return;
    const dismiss = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        reviewOpen ||
        panel.current?.contains(event.target as Node) ||
        document.querySelector('[role="dialog"], [role="menu"], [role="listbox"], [role="tooltip"]')
      )
        return;
      onClose();
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [docked, onClose, reviewOpen]);
  const activeProfile = agents.find((agent) => agent.id === item.activeStint?.agent);
  const workflow = workflows[item.workflow];
  const stage = workflow.stages.find(({ id }) => id === item.stage);
  const [agentChoice, setAgentChoice] = useState<{
    source: BoardWorkItem["stages"];
    slug: string;
    agent: string;
  }>();
  const agent = item.stage
    ? agentChoice?.source === item.stages && agentChoice.slug === item.slug
      ? agentChoice.agent
      : stageAgent(item, item.stage, agents, workflows)
    : undefined;
  const identityAgent = item.activeStint?.status === "running" ? item.activeStint.agent : agent;
  const agentName =
    agents.find((profile) => profile.id === identityAgent)?.displayName ?? identityAgent;
  const branch =
    item.activeStint?.worktree.branch ??
    item.pullRequest?.branch ??
    item.stints[0]?.worktree?.branch ??
    (item.worktreePath ? `stintwork/${item.slug}` : undefined);
  const reviewStageId = workflow.stages.find(({ gate }) => gate === "evidence")?.id;
  const archived = reviewFindings(item.stints, item.reviewDecisions, item, reviewStageId);
  const openTickets = item.tickets.filter((ticket) => !ticket.resolved);
  const blocked =
    !item.github?.ticketsStale &&
    openTickets.length > 0 &&
    openTickets.every((ticket) => ticket.blocked);

  const showStageAction =
    !!item.stage && !item.merged && (!item.tickets.length || stage?.column !== "implement");
  const canStart = !githubReadOnly && !item.activeStint && !item.merged;
  const stageAvailable =
    showStageAction && canStart && briefAvailability(item, null, workflows) === null;
  const candidateTicket =
    !showStageAction && canStart
      ? item.tickets.find((ticket) => briefAvailability(item, ticket, workflows) === null)
      : undefined;
  const selectedTicket = useRef<{ slug: string; stage: string | undefined; number: number }>();
  useEffect(() => {
    if (!item.activeStint)
      selectedTicket.current = candidateTicket
        ? { slug: item.slug, stage: item.stage, number: candidateTicket.number }
        : undefined;
  }, [candidateTicket, item.activeStint, item.slug, item.stage]);
  const nextTicket =
    candidateTicket ??
    (item.activeStint &&
    selectedTicket.current?.slug === item.slug &&
    selectedTicket.current.stage === item.stage
      ? item.tickets.find((ticket) => ticket.number === selectedTicket.current?.number)
      : undefined);
  const reviewPrimary =
    !!item.worktreePath &&
    !item.merged &&
    !githubReadOnly &&
    !stageAvailable &&
    !(canStart && nextTicket);

  const content = (
    <>
      {pendingPermissions && !docked && (
        <button
          type="button"
          className="shrink-0 border-b border-attention/30 bg-card px-4 py-2 text-left text-sm text-attention-foreground"
          onClick={onOpenNeedsYou}
        >
          {t.needsYou.pendingPermissions}
        </button>
      )}
      <header className="drawer-header relative max-h-[35%] shrink-0 overflow-y-auto px-4 py-4 sm:px-7">
        <div className="flex min-w-0 items-center gap-2">
          <code
            className="min-w-0 truncate font-mono text-[11px] text-muted-foreground"
            data-truncate
            title={item.slug}
          >
            {item.slug}
          </code>
          {(item.activeStint?.status === "running" ||
            attentionCount > 0 ||
            blocked ||
            (!item.merged && item.stints[0]?.status === "stopped")) && (
            <StatusChip
              status={
                item.activeStint?.status === "running"
                  ? "running"
                  : attentionCount
                    ? "attention"
                    : blocked
                      ? "blocked"
                      : item.merged
                        ? "success"
                        : "stopped"
              }
            >
              {item.activeStint?.status === "running"
                ? (recoveryStatus(item.activeStint, t) ?? t.card.running)
                : attentionCount
                  ? t.card.needsYou(attentionCount)
                  : blocked
                    ? t.card.blocked
                    : item.merged
                      ? t.card.shipped
                      : t.stints.statuses.stopped}
            </StatusChip>
          )}
          <span className="flex-1" />
          <Tooltip>
            <TooltipTrigger
              asChild
              onFocus={(event) => {
                if (autoFocusing.current || !opener.current) event.preventDefault();
              }}
            >
              <Button
                variant="ghost"
                size="icon"
                className="size-10 shrink-0"
                ref={closeButton}
                aria-label={t.stints.closeWorkItem}
                onClick={onClose}
              >
                <X aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t.stints.closeWorkItem}</TooltipContent>
          </Tooltip>
        </div>
      </header>
      <div className="drawer-content relative min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain px-4 pb-4 sm:px-7 [&_section+section]:mt-5 [&_.drawer-section-heading]:text-sm [&_.drawer-section-heading]:font-medium">
        {refreshing && (
          <p role="status" className="px-4 text-sm text-muted-foreground sm:px-7">
            {t.board.githubStatus.pending}
          </p>
        )}
        {refreshError && (
          <div className="px-4 text-sm text-attention-foreground sm:px-7">
            <p role="alert">{refreshError}</p>
            <Button variant="secondary" onClick={() => setRefreshAttempt((count) => count + 1)}>
              {t.board.githubStatus.retry}
            </Button>
          </div>
        )}
        <div className="drawer-identity my-3 min-w-0 rounded-2xl bg-accent p-4">
          {docked ? (
            <h2
              className="truncate text-lg font-semibold leading-tight tracking-[-0.03em]"
              data-truncate
              title={item.title}
            >
              {item.title}
            </h2>
          ) : (
            <SheetTitle
              className="truncate text-lg font-semibold leading-tight tracking-[-0.03em]"
              data-truncate
              title={item.title}
            >
              {item.title}
            </SheetTitle>
          )}
          <div className="mb-3 mt-2 flex min-w-0 items-center gap-2">
            <p
              className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
              data-truncate
              title={`${workflowName(workflow, t)} · ${milestone?.name ?? item.milestone ?? t.stints.noMilestone}`}
            >
              {workflowName(workflow, t)} ·{" "}
              {milestone?.name ?? item.milestone ?? t.stints.noMilestone}
            </p>
            {onCustomiseWorkflow && Object.hasOwn(builtInWorkflows, item.workflow) && (
              <Button
                variant="ghost"
                size="sm"
                className="text-[11px]"
                onClick={() => onCustomiseWorkflow(item.workflow)}
              >
                {t.stints.customise}
              </Button>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {identityAgent && agentName && (
              <AgentAvatar
                agent={identityAgent}
                name={agentName}
                active={item.activeStint?.status === "running"}
              />
            )}
            {branch && (
              <code
                className="min-w-0 truncate rounded-full bg-card px-2 py-1 font-mono text-[10px]"
                data-truncate
                title={branch}
              >
                {branch}
              </code>
            )}
          </div>
        </div>
        {item.activeStint && (
          <section aria-labelledby="drawer-live-stint-title">
            <h3
              id="drawer-live-stint-title"
              className="drawer-section-heading mb-3 flex items-center gap-2 text-base font-semibold"
            >
              {t.stints.liveStint}
            </h3>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <p role="status">
                {activeProfile?.displayName ?? item.activeStint.agent}
                {item.activeStint.ticket !== null && (
                  <> · {t.stints.briefTicket(item.activeStint.ticket, !!item.github)}</>
                )}{" "}
                · <Badge variant="accent">{t.stints.statuses[item.activeStint.status]}</Badge>
              </p>
              <StopStint
                key={`stop:${item.activeStint.id}`}
                stintId={item.activeStint.id}
                recovering={!!item.activeStint.recovery?.state}
              />
            </div>
            <StintStream
              key={`stream:${item.activeStint.id}`}
              stint={item.activeStint}
              profile={activeProfile}
            />
          </section>
        )}
        <PropertyList className="relative [&_[role=group]]:grid [&_[role=group]]:grid-cols-[1rem_7.75rem_minmax(0,1fr)] [&_[role=group]]:items-center [&_dt]:text-[11px] [&_dd]:text-[11px] [&_dd]:whitespace-normal">
          {stage && (
            <PropertyRow
              icon={LayoutGrid}
              label={t.detailPanel.stage}
              value={stageName(workflow, stage, t)}
            />
          )}
          {item.worktreePath && (
            <PropertyRow
              icon={FolderGit2}
              label={t.stints.worktreeFiles}
              value={<FilePath path={item.worktreePath} compact />}
            />
          )}
          {item.pullRequest && (
            <>
              <PropertyRow
                icon={GitBranch}
                label={t.detailPanel.branch}
                value={
                  <span className="block truncate" data-truncate title={item.pullRequest.branch}>
                    {item.pullRequest.branch}
                  </span>
                }
                fullText={item.pullRequest.branch}
              />
              <PropertyRow
                icon={GitPullRequest}
                label={t.detailPanel.pullRequest}
                value={
                  <a
                    className="block truncate"
                    data-truncate
                    title={item.pullRequest.url}
                    href={item.pullRequest.url}
                  >
                    {item.pullRequest.url}
                  </a>
                }
                fullText={item.pullRequest.url}
              />
            </>
          )}
          {item.pullRequestChecks && (
            <PropertyRow
              icon={CheckCircle2}
              label={t.stints.checks}
              value={`${item.pullRequestChecks.checks.filter((check) => check.bucket === "pass").length}/${item.pullRequestChecks.checks.length} ${t.review.visualRefresh07.passing}`}
            />
          )}
          {item.stage && !item.merged && (
            <StageAgentRail
              key={item.slug}
              item={item}
              workflows={workflows}
              onAgentChange={(agent) =>
                setAgentChoice({ source: item.stages, slug: item.slug, agent })
              }
            />
          )}
        </PropertyList>
        {!item.stage && !item.merged ? (
          <p className="drawer-stage-note px-4 py-4 sm:px-7 muted text-muted-foreground">
            {t.stints.noStage}
          </p>
        ) : null}
        <nav
          className="drawer-sections my-4 flex shrink-0 gap-6 border-b border-border py-3 text-xs [&_a:hover]:text-accent-foreground"
          aria-label={t.stints.sections}
        >
          <a href="#drawer-spec">{t.stints.spec}</a>
          <a href="#drawer-tickets">
            {t.stints.tickets}{" "}
            <span className="count min-w-5 rounded-sm bg-muted px-1 text-center text-xs text-muted-foreground">
              {item.tickets.length}
            </span>
          </a>
        </nav>
        <ShipActions item={item} workflows={workflows} onPausePolling={setShipPaused} />
        {!item.merged && (
          <GateView
            key={item.github ? item.slug : `${item.slug}:${item.stage}`}
            item={item}
            warnings={warnings}
            githubReadOnly={githubReadOnly}
            workflows={workflows}
          />
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
          ) : missingShippedDetail ? (
            <p className="muted text-muted-foreground">{t.board.githubStatus.detailUnavailable}</p>
          ) : (
            <p className="muted text-muted-foreground">{t.stints.noSpec}</p>
          )}
        </section>
        <section id="drawer-tickets" aria-labelledby="drawer-tickets-title">
          <h3
            id="drawer-tickets-title"
            className="drawer-section-heading mb-3 flex items-center gap-2 text-base font-semibold"
          >
            {t.stints.tickets}{" "}
            <span className="count min-w-5 rounded-sm bg-muted px-1 text-center text-xs text-muted-foreground">
              {item.tickets.length}
            </span>
          </h3>
          {item.tickets.length ? (
            <ol className="drawer-tickets">
              {item.tickets.map((ticket) => {
                const blocked = ticket.blocked && ticket.status !== "unknown";
                const StatusIcon = ticket.resolved ? CheckCircle2 : blocked ? LockKeyhole : Circle;
                return (
                  <li key={ticket.path}>
                    <details className="drawer-ticket rounded-md border border-border p-3 [&>summary]:flex [&>summary]:list-none [&>summary]:items-start [&>summary]:gap-3 [&>summary::-webkit-details-marker]:hidden [&>summary::after]:ml-auto [&>summary::after]:text-muted-foreground [&>summary::after]:content-['+'] [&[open]>summary::after]:content-['−']">
                      <summary>
                        <StatusIcon
                          className={
                            ticket.resolved
                              ? "size-icon-sm shrink-0 text-success-foreground"
                              : blocked
                                ? "size-icon-sm shrink-0 text-attention-foreground"
                                : "size-icon-sm shrink-0 text-muted-foreground"
                          }
                          aria-hidden="true"
                        />
                        <span className="ticket-title grid min-w-0 gap-1 [overflow-wrap:anywhere] [&_strong]:text-sm [&_strong]:font-medium [&_small]:text-xs">
                          <strong>
                            {ticketNumber(ticket.number)} · {ticket.title}
                          </strong>
                          <small
                            className={
                              blocked
                                ? "warning text-attention-foreground"
                                : "muted text-muted-foreground"
                            }
                          >
                            <Badge
                              variant={
                                ticket.resolved ? "success" : blocked ? "warning" : "secondary"
                              }
                            >
                              {ticketStatus(ticket.status, t)}
                            </Badge>
                            {ticket.status !== "unknown" && ticket.blockedBy.length > 0 && (
                              <>
                                {" "}
                                {t.stints.blockedBy} {ticket.blockedBy.map(ticketNumber).join(", ")}
                              </>
                            )}
                          </small>
                        </span>
                      </summary>
                      <Markdown>{ticket.body}</Markdown>
                    </details>
                    <FilePath path={ticket.path} />
                    {!item.merged && ticket !== nextTicket && (
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
          ) : missingShippedDetail ? (
            <p className="muted text-muted-foreground">{t.board.githubStatus.detailUnavailable}</p>
          ) : (
            <p className="muted text-muted-foreground">{t.stints.noTickets}</p>
          )}
        </section>
        <section aria-labelledby="drawer-stint-history-title">
          <h3
            id="drawer-stint-history-title"
            className="drawer-section-heading mb-3 flex items-center gap-2 text-base font-semibold"
          >
            {t.stints.history}
          </h3>
          <StintHistory stints={item.stints} github={!!item.github} />
        </section>
        {item.merged && (
          <>
            <section aria-label={t.stints.reviewFindings}>
              <h3 className="drawer-section-heading mb-3 flex items-center gap-2 text-base font-semibold">
                {t.stints.reviewFindings}
              </h3>
              <FindingsRail {...archived} anchor={(finding) => `archived-${finding.id}`} />
              {archived.findings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} anchor={`archived-${finding.id}`} />
              ))}
            </section>
            <section aria-label={t.stints.recordedChecks}>
              <h3 className="drawer-section-heading mb-3 flex items-center gap-2 text-base font-semibold">
                {t.stints.checks}
              </h3>
              <ChecksPanel item={item} shipPaused={shipPaused} />
            </section>
          </>
        )}
      </div>
      <footer className="drawer-footer relative max-h-[40%] shrink-0 overflow-y-auto border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-7">
        <div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 [&_.brief-action]:contents [&_.brief-action>p]:order-last [&_.brief-action>p]:min-w-0 [&_.brief-action>p]:basis-full [&_.brief-action>p]:truncate [&_.brief-action>p]:text-xs">
            {showStageAction && (
              <section
                aria-label={t.stints.stageStintSection}
                className={
                  stageAvailable
                    ? "footer-primary contents [&_.brief-action]:mb-0 [&_.brief-action>button]:border-transparent [&_.brief-action>button]:bg-primary [&_.brief-action>button]:text-primary-foreground"
                    : "contents [&_.brief-action]:mb-0"
                }
              >
                <h3 className="sr-only">
                  {t.stints.stageStint(stage ? stageName(workflow, stage, t) : "")}
                </h3>
                <StageBriefPreview
                  item={item}
                  workflows={workflows}
                  githubReadOnly={githubReadOnly}
                />
              </section>
            )}
            {nextTicket && (
              <div
                className={
                  canStart
                    ? "footer-primary contents [&_.brief-action]:mb-0 [&_.brief-action>button]:border-transparent [&_.brief-action>button]:bg-primary [&_.brief-action>button]:text-primary-foreground"
                    : "contents [&_.brief-action]:mb-0"
                }
              >
                <span
                  className="order-first block min-w-0 basis-full truncate"
                  data-truncate
                  title={`${ticketNumber(nextTicket.number)} · ${nextTicket.title}`}
                >
                  {ticketNumber(nextTicket.number)} · {nextTicket.title}
                </span>
                <TicketBriefPreview
                  item={item}
                  ticket={nextTicket}
                  workflows={workflows}
                  githubReadOnly={githubReadOnly}
                />
              </div>
            )}
            {item.worktreePath && (
              <Button
                variant={reviewPrimary ? "primary" : "secondary"}
                size="sm"
                onClick={() => setReviewOpen(true)}
              >
                {t.stints.openReview}
              </Button>
            )}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap">
            <span className="truncate">
              {item.github ? t.stints.githubTracker : t.stints.tracker}
            </span>
            <span className="truncate">
              <kbd>Esc</kbd>
              {t.stints.returnToPipeline}
            </span>
          </div>
        </div>
      </footer>
      {reviewOpen && (
        <ReviewOverlay
          reviewStageId={reviewStageId}
          item={item}
          onClose={() => setReviewOpen(false)}
          checks={<ChecksPanel item={item} shipPaused={shipPaused} />}
        />
      )}
    </>
  );

  return (
    <TooltipProvider>
      {docked ? (
        <aside
          ref={panel}
          aria-label={item.title}
          className="work-item-drawer relative flex min-h-0 w-[clamp(320px,30vw,440px)] shrink-0 flex-col rounded-2xl bg-card shadow-card"
          onKeyDown={(event) => {
            if (
              event.key === "Escape" &&
              !event.defaultPrevented &&
              !reviewOpen &&
              !(
                event.target instanceof Element &&
                event.target.closest('[role="dialog"], [role="listbox"], [role="menu"]')
              )
            ) {
              event.preventDefault();
              onClose();
            }
          }}
        >
          {content}
        </aside>
      ) : (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) onClose();
          }}
        >
          <SheetContent
            className="work-item-drawer flex w-[60vw] min-w-[min(600px,calc(100vw-32px))] flex-col p-0 [&_button]:min-h-10 [&_button]:min-w-10 [&_summary]:min-h-10"
            aria-describedby={undefined}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              const previous = document.activeElement;
              autoFocusing.current = true;
              closeButton.current?.focus();
              autoFocusing.current = false;
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
            {content}
          </SheetContent>
        </Sheet>
      )}
    </TooltipProvider>
  );
}
