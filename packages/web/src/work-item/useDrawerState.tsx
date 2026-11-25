// SPDX-License-Identifier: Apache-2.0

import {
  type AgentProfile,
  briefAvailability,
  builtInWorkflows,
  gateReadiness,
  type Milestone,
  type Warning,
  type WorkflowDefinitions,
} from "@stintwork/core";
import { MotionGlobalConfig, usePresence } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGateAction } from "../GateView";
import { GithubRefreshConflict, refreshGithubItem } from "../github-refresh";
import { useErrorText, useLanguage } from "../i18n/language";
import { becameResolved } from "../moments";
import { reviewFindings } from "../ReviewFindings";
import { hadUserInput, isKeyboardInput } from "../ui/input-modality";
import { useReducedMotionSafe } from "../ui/motion";
import type { BoardWorkItem } from "../WorkItemCard";

const maxDetailWidth = () => Math.max(400, Math.floor(window.innerWidth * 0.6));
export function useDrawerState({
  item,
  initialUrlOpen = false,
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
  initialUrlOpen?: boolean;
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
  const skipInitialFocus = useRef(initialUrlOpen && !hadUserInput());
  const opener = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const customisePending = useRef(false);
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
    if (skipInitialFocus.current) {
      skipInitialFocus.current = false;
      return;
    }
    const previous = document.activeElement;
    opener.current = previous instanceof HTMLElement ? previous : null;
    autoFocusing.current = true;
    (isKeyboardInput() ? closeButton.current : panel.current)?.focus({
      focusVisible: isKeyboardInput(),
      preventScroll: true,
    });
    autoFocusing.current = false;
    return () => {
      if (
        (document.activeElement === document.body ||
          document.activeElement === closeButton.current ||
          document.activeElement === panel.current) &&
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
    (item.activeStint?.ticket != null
      ? item.tickets.find((ticket) => ticket.number === item.activeStint?.ticket)
      : undefined) ??
    (item.activeStint &&
    selectedTicket.current?.slug === item.slug &&
    selectedTicket.current.stage === item.stage
      ? item.tickets.find((ticket) => ticket.number === selectedTicket.current?.number)
      : undefined);
  const gate = gateReadiness(item, workflows);
  const gateAction = useGateAction(item, workflows);
  const approvePrimary =
    !!gate.nextStage &&
    gate.ready &&
    stage?.column !== "review" &&
    !githubReadOnly &&
    !item.activeStint &&
    (!item.github || !!(item.github.reviewDigest && item.github.reviewHead));
  const reviewPrimary = stage?.column === "review" && !item.activeStint && !!item.worktreePath;
  const startPrimary = !approvePrimary && !reviewPrimary && !item.activeStint;

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

  return {
    item,
    initialUrlOpen,
    mainHead,
    localTracker,
    milestone,
    onClose,
    agents,
    warnings,
    workflows,
    onCustomiseWorkflow,
    githubReadOnly,
    githubRetryAt,
    pendingPermissions,
    attentionCount,
    onOpenNeedsYou,
    full,
    onFullChange,
    t,
    reduced,
    previousTickets,
    resolvedNow,
    isPresent,
    safeToRemove,
    close,
    refreshing,
    setRefreshing,
    refreshAttempt,
    setRefreshAttempt,
    refreshError,
    setRefreshError,
    refreshed,
    githubNumber,
    missingShippedDetail,
    ticketNumber,
    skipInitialFocus,
    opener,
    closeButton,
    moreButton,
    customisePending,
    autoFocusing,
    panel,
    sheetPanel,
    width,
    setWidth,
    maximum,
    setMaximum,
    changeWidth,
    dismiss,
    docked,
    setDocked,
    reviewOpen,
    setReviewOpen,
    reviewMounted,
    setReviewMounted,
    shipPaused,
    setShipPaused,
    activeProfile,
    workflow,
    stage,
    branch,
    reviewStageId,
    archived,
    openTickets,
    blocked,
    showStageAction,
    canStart,
    candidateTicket,
    selectedTicket,
    nextTicket,
    gate,
    gateAction,
    approvePrimary,
    reviewPrimary,
    startPrimary,
    hasTickets,
    tabs,
    tab,
    setTab,
    activeTab,
    ticketSelection,
    setTicketSelection,
    selected,
    specPanel,
    headings,
    setHeadings,
    captureSpec,
    changeTab,
    contents,
  };
}
export type DrawerState = ReturnType<typeof useDrawerState>;
