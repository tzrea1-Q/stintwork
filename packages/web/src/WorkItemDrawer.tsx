// SPDX-License-Identifier: Apache-2.0

import {
  type AgentProfile,
  briefAvailability,
  builtInWorkflows,
  type Milestone,
  stageAgent,
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
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import { MotionGlobalConfig, m, usePresence } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { StageBriefPreview, TicketBriefPreview } from "./BriefPreview";
import { ChecksPanel } from "./ChecksPanel";
import { GateView } from "./GateView";
import { GithubRefreshConflict, refreshGithubItem } from "./github-refresh";
import { ticketStatus, useErrorText, useLanguage } from "./i18n/language";
import { stageName, workflowName } from "./i18n/workflow-names";
import { becameResolved } from "./moments";
import { MarkShipped } from "./MarkShipped";
import { FindingCard, FindingsRail, reviewFindings } from "./ReviewFindings";
import { ReviewOverlay } from "./ReviewOverlay";
import { ShipActions } from "./ShipActions";
import { StageAgentRail } from "./StageAgentRail";
import { StintHistory } from "./StintHistory";
import { recoveryStatus } from "./StintRecovery";
import { StintStream } from "./StintStream";
import { StopStint } from "./StopStint";
import { AgentAvatar } from "./ui/AgentAvatar";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Markdown } from "./ui/Markdown";
import { spring, tween, useReducedMotionSafe } from "./ui/motion";
import { PropertyList, PropertyRow } from "./ui/PropertyRow";
import { ResizeHandle } from "./ui/ResizeHandle";
import { Sheet, SheetContent, SheetTitle } from "./ui/Sheet";
import { StatusChip } from "./ui/StatusChip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/Tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/Tooltip";
import type { BoardWorkItem } from "./WorkItemCard";

const maxDetailWidth = () => Math.max(400, Math.floor(window.innerWidth * 0.6));

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
  mainHead,
  localTracker = true,
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
  full = false,
  onFullChange,
}: {
  full?: boolean;
  onFullChange?: (full: boolean) => void;
  item: BoardWorkItem;
  mainHead?: string;
  localTracker?: boolean;
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
  const reduced = useReducedMotionSafe();
  const previousTickets = useRef(
    new Map(item.tickets.map((ticket) => [ticket.path, ticket.resolved])),
  );
  const resolvedNow = new Set(
    item.tickets
      .filter((ticket) => becameResolved(previousTickets.current.get(ticket.path), ticket.resolved))
      .map((ticket) => ticket.path),
  );
  useEffect(() => {
    previousTickets.current = new Map(item.tickets.map((ticket) => [ticket.path, ticket.resolved]));
  }, [item.tickets]);
  const [isPresent, safeToRemove] = usePresence();
  useEffect(() => {
    if (!isPresent && MotionGlobalConfig.skipAnimations) safeToRemove?.();
  }, [isPresent, safeToRemove]);
  const close = onClose;
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
  const sheetPanel = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(() => {
    try {
      const stored = localStorage.getItem("stintwork.detailWidth");
      const value = stored === null || stored.trim() === "" ? NaN : Number(stored);
      return Math.max(
        400,
        Math.min(maxDetailWidth(), Number.isFinite(value) && value > 0 ? value : 560),
      );
    } catch {
      return Math.min(560, maxDetailWidth());
    }
  });
  const [maximum, setMaximum] = useState(maxDetailWidth);
  useEffect(() => {
    const resize = () => {
      const max = maxDetailWidth();
      setMaximum(max);
      setWidth((value) => Math.min(value, max));
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  function changeWidth(value: number) {
    setWidth(value);
    try {
      localStorage.setItem("stintwork.detailWidth", String(value));
    } catch {
      /* Storage may be blocked. */
    }
  }
  const dismiss = () => (full ? onFullChange?.(false) : close());
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
  useLayoutEffect(() => {
    if (!isPresent && !docked && sheetPanel.current) {
      sheetPanel.current.setAttribute("data-exiting", "true");
      sheetPanel.current.setAttribute("aria-hidden", "true");
      sheetPanel.current.setAttribute("inert", "");
    }
    if (
      !isPresent &&
      docked &&
      (document.activeElement === document.body || panel.current?.contains(document.activeElement))
    ) {
      opener.current?.focus();
    }
  }, [isPresent, docked]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewMounted, setReviewMounted] = useState(false);
  useEffect(() => {
    if (reviewOpen) setReviewMounted(true);
  }, [reviewOpen]);
  const [shipPaused, setShipPaused] = useState(false);
  useEffect(() => {
    if (!docked) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        reviewOpen ||
        panel.current?.contains(event.target as Node) ||
        document.querySelector(
          '[role="dialog"]:not([data-state="closed"]), [role="menu"], [role="listbox"], [role="tooltip"]',
        )
      )
        return;
      if (full) onFullChange?.(false);
      else close();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [docked, close, onFullChange, full, reviewOpen]);
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

  const hasTickets = workflow.stages.some(({ gate }) => gate === "tickets");
  const tabs = hasTickets
    ? ["overview", "spec", "tickets", "stints"]
    : ["overview", "spec", "stints"];
  const [tab, setTab] = useState(
    () => new URL(window.location.href).searchParams.get("tab") ?? "overview",
  );
  const activeTab = tabs.includes(tab) ? tab : "overview";
  const [ticketSelection, setTicketSelection] = useState<number>();
  const selected = item.tickets.find((ticket) => ticket.number === ticketSelection);
  const specPanel = useRef<HTMLDivElement | null>(null);
  const [headings, setHeadings] = useState<{ text: string; id: number; level: string | null }[]>(
    [],
  );
  const captureSpec = useCallback((node: HTMLDivElement | null) => {
    specPanel.current = node;
    if (node)
      setHeadings(
        Array.from(
          node.querySelectorAll('[data-markdown-heading="h2"], [data-markdown-heading="h3"]'),
          (heading, id) => ({
            text: heading.textContent ?? "",
            id,
            level: heading.getAttribute("data-markdown-heading"),
          }),
        ),
      );
  }, []);
  // Re-read headings when an already open spec changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Markdown is rendered before this effect.
  useEffect(() => {
    if (specPanel.current) captureSpec(specPanel.current);
  }, [captureSpec, item.spec?.text]);
  function changeTab(value: string) {
    setTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    window.history.replaceState(window.history.state, "", url);
  }

  const contents = headings.map((heading) => (
    <button
      type="button"
      key={heading.id}
      className={`text-left hover:text-foreground focus-visible:text-foreground ${heading.level === "h3" ? "pl-4" : ""}`}
      onClick={() => {
        const target = specPanel.current?.querySelectorAll(
          '[data-markdown-heading="h2"], [data-markdown-heading="h3"]',
        )[heading.id] as HTMLElement | undefined;
        if (target && specPanel.current?.parentElement) {
          const scroll = specPanel.current.parentElement;
          scroll.scrollTop +=
            target.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
        }
      }}
    >
      {heading.text}
    </button>
  ));

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
      <m.header
        layout="position"
        className="drawer-header relative max-h-[35%] shrink-0 overflow-y-auto px-4 py-4 sm:px-7"
      >
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
          {docked && onFullChange && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 shrink-0"
                  aria-label={full ? t.stints.collapseDetail : t.stints.expandDetail}
                  onClick={() => onFullChange(!full)}
                >
                  {full ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {full ? t.stints.collapseDetail : t.stints.expandDetail}
              </TooltipContent>
            </Tooltip>
          )}
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
                onClick={close}
              >
                <X aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t.stints.closeWorkItem}</TooltipContent>
          </Tooltip>
        </div>

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
              title={`${workflowName(workflow, t)} · ${milestone?.name ?? item.milestone ?? t.stints.noMilestone}${stage ? ` · ${stageName(workflow, stage, t)}` : ""}`}
            >
              {workflowName(workflow, t)} ·{" "}
              {milestone?.name ?? item.milestone ?? t.stints.noMilestone}
              {stage && <> · {stageName(workflow, stage, t)}</>}
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
      </m.header>
      <m.div layout="position" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Tabs
          value={activeTab}
          onValueChange={changeTab}
          className="min-h-0 min-w-0 flex-1 flex-col gap-0"
        >
          <TabsList
            variant="line"
            aria-label={t.stints.sections}
            className="w-full shrink-0 justify-start overflow-x-auto border-b border-border px-4 sm:px-7"
          >
            {tabs.map((value) => (
              <TabsTrigger key={value} value={value} className="flex-none">
                {t.detailTabs[value as keyof typeof t.detailTabs]}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent
            value="overview"
            className="drawer-content relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-4 pb-4 sm:px-7 [&_section+section]:mt-5 [&_.drawer-section-heading]:text-sm [&_.drawer-section-heading]:font-medium"
          >
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
            {item.merged?.outside && (
              <div className="flex min-w-0 items-center gap-2 py-2 text-[11px] text-muted-foreground">
                <GitBranch aria-hidden="true" className="size-4 shrink-0" />
                <span>
                  {t.markShipped.outside} · {item.merged.commit.slice(0, 7)}
                </span>
              </div>
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
                      <span
                        className="block truncate"
                        data-truncate
                        title={item.pullRequest.branch}
                      >
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
          </TabsContent>
          <TabsContent
            value="spec"
            className="drawer-content min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-4 pb-4 sm:px-7"
          >
            <div ref={captureSpec} className="@container">
              <section
                id="drawer-spec"
                aria-labelledby="drawer-spec-title"
                className={
                  headings.length
                    ? "grid gap-4 @[960px]:grid-cols-[220px_minmax(0,1fr)]"
                    : undefined
                }
              >
                <h3 id="drawer-spec-title" className="sr-only">
                  {t.stints.spec}
                </h3>
                {item.spec ? (
                  <>
                    {headings.length > 0 && (
                      <>
                        <details className="text-xs text-muted-foreground @[960px]:hidden">
                          <summary className="cursor-pointer">{t.detailTabs.contents}</summary>
                          <nav
                            aria-label={t.detailTabs.contents}
                            className="flex flex-col items-start [&>button]:!min-h-7"
                          >
                            {contents}
                          </nav>
                        </details>
                        <nav
                          aria-label={t.detailTabs.contents}
                          className="hidden min-w-0 flex-col items-start gap-1 text-xs text-muted-foreground @[960px]:sticky @[960px]:top-0 @[960px]:flex @[960px]:self-start"
                        >
                          {contents}
                        </nav>
                      </>
                    )}
                    <div className="min-w-0 max-w-[72ch]">
                      <FilePath path={item.spec.path} />
                      <Markdown>{item.spec.text}</Markdown>
                    </div>
                  </>
                ) : missingShippedDetail ? (
                  <p className="muted text-muted-foreground">
                    {t.board.githubStatus.detailUnavailable}
                  </p>
                ) : (
                  <p className="muted text-muted-foreground">{t.stints.noSpec}</p>
                )}
              </section>
            </div>
          </TabsContent>
          {hasTickets && (
            <TabsContent
              value="tickets"
              className="drawer-content min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-4 pb-4 sm:px-7"
            >
              <section id="drawer-tickets" aria-labelledby="drawer-tickets-title">
                <h3 id="drawer-tickets-title" className="sr-only">
                  {t.stints.tickets}{" "}
                  <span className="count min-w-5 rounded-sm bg-muted px-1 text-center text-xs text-muted-foreground">
                    {item.tickets.length}
                  </span>
                </h3>
                {item.tickets.length ? (
                  <>
                    <ol className="drawer-tickets">
                      {item.tickets.map((ticket) => {
                        const blocked = ticket.blocked && ticket.status !== "unknown";
                        const StatusIcon = ticket.resolved
                          ? CheckCircle2
                          : blocked
                            ? LockKeyhole
                            : Circle;
                        return (
                          <li key={ticket.path}>
                            <div className="drawer-ticket rounded-md border border-border p-3">
                              <button
                                type="button"
                                className="flex w-full items-start gap-3 text-left"
                                aria-expanded={ticketSelection === ticket.number}
                                onClick={() =>
                                  setTicketSelection(
                                    ticketSelection === ticket.number ? undefined : ticket.number,
                                  )
                                }
                              >
                                <m.span
                                  data-ticket-check={ticket.path}
                                  key={`${ticket.path}:${ticket.resolved}`}
                                  initial={
                                    resolvedNow.has(ticket.path)
                                      ? reduced
                                        ? { opacity: 0 }
                                        : { scale: 0.5, opacity: 0 }
                                      : false
                                  }
                                  animate={{ scale: 1, opacity: 1 }}
                                  transition={spring.celebrate}
                                  className="inline-flex shrink-0"
                                >
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
                                </m.span>
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
                                        ticket.resolved
                                          ? "success"
                                          : blocked
                                            ? "warning"
                                            : "secondary"
                                      }
                                    >
                                      {ticketStatus(ticket.status, t, ticket.resolved)}
                                    </Badge>
                                    {!ticket.resolved &&
                                      ticket.status !== "unknown" &&
                                      ticket.blockedBy.length > 0 && (
                                        <>
                                          {" "}
                                          {t.stints.blockedBy}{" "}
                                          {ticket.blockedBy.map(ticketNumber).join(", ")}
                                        </>
                                      )}
                                  </small>
                                </span>
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                    {selected && (
                      <div>
                        <Markdown>{selected.body}</Markdown>
                        <FilePath path={selected.path} />
                        {!item.merged &&
                          !selected.resolved &&
                          !selected.blocked &&
                          selected !== nextTicket && (
                            <TicketBriefPreview
                              item={item}
                              ticket={selected}
                              workflows={workflows}
                              githubReadOnly={githubReadOnly}
                            />
                          )}
                      </div>
                    )}
                  </>
                ) : missingShippedDetail ? (
                  <p className="muted text-muted-foreground">
                    {t.board.githubStatus.detailUnavailable}
                  </p>
                ) : (
                  <p className="muted text-muted-foreground">{t.stints.noTickets}</p>
                )}
              </section>
            </TabsContent>
          )}
          <TabsContent
            value="stints"
            className="drawer-content min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-4 pb-4 sm:px-7 [&_section+section]:mt-5"
          >
            <section aria-labelledby="drawer-stint-history-title">
              <h3 id="drawer-stint-history-title" className="sr-only">
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
                  <ChecksPanel item={item} shipPaused={shipPaused} />
                </section>
              </>
            )}
          </TabsContent>
        </Tabs>
      </m.div>
      <m.footer
        layout="position"
        className="drawer-footer relative max-h-[40%] shrink-0 overflow-y-auto border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-7"
      >
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
            {localTracker &&
              !item.github &&
              !item.worktreePath &&
              !item.merged &&
              item.activeStint?.status !== "running" &&
              !item.stints.some((stint) => stint.status === "running") && (
                <MarkShipped slug={item.slug} head={mainHead} />
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
      </m.footer>
      {(reviewOpen || reviewMounted) && (
        <ReviewOverlay
          open={reviewOpen}
          onExitComplete={() => setReviewMounted(false)}
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
        <div
          className="min-h-0 min-w-0 shrink-0 overflow-hidden rounded-2xl"
          style={{ width: full ? "100%" : width }}
        >
          <m.aside
            ref={panel}
            data-exiting={isPresent ? undefined : "true"}
            aria-hidden={isPresent ? undefined : true}
            {...(isPresent ? {} : { inert: "" })}
            onAnimationComplete={() => {
              if (!isPresent) safeToRemove?.();
            }}
            layout={!reduced}
            layoutDependency={full}
            initial={reduced ? { opacity: 0 } : { x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{
              ...(reduced ? { opacity: 0 } : { x: "100%", opacity: 0 }),
              transition: tween.dismiss,
            }}
            transition={{ ...tween.sheet, layout: spring.layout }}
            aria-label={item.title}
            className="work-item-drawer relative flex min-h-0 min-w-0 shrink-0 flex-col rounded-2xl bg-card shadow-card"
            style={{ width: full ? "100%" : width, height: "100%" }}
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
                dismiss();
              }
            }}
          >
            {!full && (
              <ResizeHandle
                value={width}
                min={400}
                max={maximum}
                onChange={changeWidth}
                label={t.stints.resizeDetail}
              />
            )}
            {content}
          </m.aside>
        </div>
      ) : (
        <Sheet
          open={isPresent}
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <SheetContent
            ref={sheetPanel}
            onExitComplete={safeToRemove ?? undefined}
            className="work-item-drawer flex min-h-0 min-w-0 w-[60vw] min-w-[min(600px,calc(100vw-32px))] flex-col overflow-hidden p-0 [&_button]:min-h-10 [&_button]:min-w-10 [&_summary]:min-h-10"
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
