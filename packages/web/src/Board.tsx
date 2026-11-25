// SPDX-License-Identifier: Apache-2.0
import { builtInWorkflows, type ProjectSnapshot } from "@stintwork/core";
import { ChevronRight, FolderOpen, ShieldAlert } from "lucide-react";
import { AnimatePresence, LayoutGroup, MotionConfig, MotionGlobalConfig, m } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BoardToolbar } from "./board/BoardToolbar";
import { ShippedLane } from "./board/ShippedLane";
import { StageStrip } from "./board/StageStrip";
import { UnstagedLane } from "./board/UnstagedLane";
import { BoardWorkflowFilter } from "./BoardWorkflowFilter";
import { BoardMotionContext, countBoardChanges } from "./board-motion";
import { Column } from "./Column";
import { CommandPalette } from "./CommandPalette";
import { CreateWorkItem } from "./CreateWorkItem";
import { CustomiseWorkflow } from "./CustomiseWorkflow";
import { GithubStatus } from "./GithubStatus";
import { useLanguage } from "./i18n/language";
import { stageName } from "./i18n/workflow-names";
import { NeedsYouQueue } from "./NeedsYouQueue";
import { Overview } from "./Overview";
import { viewFromSearch, workItemInFlight } from "./overview-data";
import { TopBar } from "./TopBar";
import { Button } from "./ui/Button";
import { spring, useReducedMotionSafe } from "./ui/motion";
import { Sheet, SheetContent, SheetTitle } from "./ui/Sheet";
import { useAttentionAlerts } from "./useAttentionAlerts";
import type { Connection } from "./useProjectSnapshot";
import { WorkItemDrawer } from "./WorkItemDrawer";

let boardLoaded = false;

export function Board({
  snapshot,
  connection = "live",
  error,
}: {
  snapshot: ProjectSnapshot;
  connection?: Connection;
  error?: string;
}) {
  const { t } = useLanguage();
  const [firstLoad] = useState(() => !boardLoaded);
  const [view, setView] = useState<"overview" | "pipeline">(() =>
    viewFromSearch(window.location.search),
  );
  const previousView = useRef(view);
  const previous = useRef<Map<string, string> | null>(null);
  const next = new Map(
    snapshot.workItems.map((item) => [
      item.slug,
      item.merged ? "shipped" : `${item.column ?? "unstaged"}:${item.stage ?? ""}`,
    ]),
  );
  const prior = previous.current;
  const reduced = useReducedMotionSafe();
  const instant = view === "overview" || previousView.current === "overview";
  const skip =
    MotionGlobalConfig.skipAnimations ||
    document.visibilityState === "hidden" ||
    (prior !== null && countBoardChanges(prior, next) > 12);
  useLayoutEffect(() => {
    boardLoaded = true;
    previous.current = next;
    previousView.current = view;
  });
  const githubTracker = snapshot.setup.tracker === "github-issues";
  const repository = snapshot.github?.repository;
  const [selectedMilestone, setSelectedMilestone] = useState("");
  const [openSlug, setOpenSlug] = useState<string | null>(() =>
    new URL(window.location.href).searchParams.get("item"),
  );
  const [fullDetail, setFullDetail] = useState(
    () => new URL(window.location.href).searchParams.get("detail") === "full",
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteInstance, setPaletteInstance] = useState(0);
  const [verifyingOpen, setVerifyingOpen] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createMounted, setCreateMounted] = useState(false);
  useEffect(() => {
    if (createOpen) setCreateMounted(true);
  }, [createOpen]);
  const [customiseId, setCustomiseId] = useState<string | null>(null);
  const [customiseMounted, setCustomiseMounted] = useState(false);
  const lastCustomiseId = useRef<string | null>(null);
  if (customiseId) lastCustomiseId.current = customiseId;
  useEffect(() => {
    if (customiseId) setCustomiseMounted(true);
  }, [customiseId]);
  const [focusAttentionId, setFocusAttentionId] = useState<string | null>(null);
  const [needsYouOpen, setNeedsYouOpen] = useState(false);
  const [needsYouMounted, setNeedsYouMounted] = useState(false);
  useEffect(() => {
    if (needsYouOpen) setNeedsYouMounted(true);
  }, [needsYouOpen]);
  const [expandedStages, setExpandedStages] = useState<string[]>([]);
  const alerts = useAttentionAlerts(snapshot);
  const previousItem = useRef<string | null>(null);
  const scroll = useRef<HTMLElement>(null);
  const openItem = snapshot.workItems.find((item) => item.slug === openSlug);
  const lastItem = useRef(openItem);
  if (openItem) lastItem.current = openItem;
  const drawerItem = openItem ?? lastItem.current;
  const verifyingItem = !!openSlug && githubTracker && !!snapshot.github?.verifying && !openItem;
  const milestone = snapshot.milestones.some((entry) => entry.id === selectedMilestone)
    ? selectedMilestone
    : "";
  const visible = snapshot.workItems.filter((item) => !milestone || item.milestone === milestone);
  const inFlight = visible.filter((item) => workItemInFlight(item, snapshot));
  const shipped = visible.filter((item) => item.merged);
  const milestoneShipped = visible.filter(
    (item) => !item.merged && !workItemInFlight(item, snapshot),
  );
  const unstaged = inFlight.filter((item) => item.column === undefined);
  const selected = snapshot.milestones.find((entry) => entry.id === milestone);

  const [drawerVersion, setDrawerVersion] = useState(0);
  function openWorkItem(slug: string, overview = false) {
    if (overview) {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "overview");
      window.history.replaceState(window.history.state, "", url);
      setDrawerVersion((version) => version + 1);
    }
    if (view === "overview") changeView("pipeline");
    if (milestone && snapshot.workItems.find((item) => item.slug === slug)?.milestone !== milestone)
      setSelectedMilestone("");
    setOpenSlug(slug);
  }

  useEffect(() => {
    const url = new URL(window.location.href);
    if (openSlug && (openItem || verifyingItem)) url.searchParams.set("item", openSlug);
    else {
      url.searchParams.delete("item");
      url.searchParams.delete("detail");
      url.searchParams.delete("tab");
    }
    window.history.replaceState(window.history.state, "", url);

    if (!openItem && !verifyingItem && previousItem.current) {
      setOpenSlug(null);
      const card = Array.from(
        scroll.current?.querySelectorAll<HTMLButtonElement>("[data-work-item]") ?? [],
      ).find((element) => element.dataset.workItem === previousItem.current);
      const lane = card?.closest("details");
      if (lane) lane.open = true;
      (card ?? document.getElementById("command-palette-trigger"))?.focus();
    }
    if (!verifyingItem) previousItem.current = openItem?.slug ?? null;
  }, [openItem, openSlug, verifyingItem]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (createOpen || customiseId) return;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!paletteOpen) setPaletteInstance((instance) => instance + 1);
        setPaletteOpen(!paletteOpen);
        return;
      }
      if (
        (openItem &&
          (typeof window.matchMedia !== "function" ||
            !window.matchMedia("(min-width: 1024px)").matches ||
            (event.target instanceof Element && event.target.closest(".work-item-drawer")))) ||
        (verifyingItem && verifyingOpen) ||
        paletteOpen ||
        needsYouOpen ||
        !(event.target instanceof HTMLElement)
      )
        return;
      if (
        event.target.closest(
          "input, textarea, select, [contenteditable]:not([contenteditable=false]), dialog[open], [role=dialog], [role=menu], [role=listbox]",
        )
      )
        return;
      if (
        !githubTracker &&
        event.key === "c" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        setCreateOpen(true);
        return;
      }
      const card = event.target.closest<HTMLButtonElement>("button[data-work-item]");
      const column = card?.closest<HTMLElement>("[data-card-column]");
      if (!card || !column || !event.key.startsWith("Arrow")) return;
      const columns = Array.from(
        scroll.current?.querySelectorAll<HTMLElement>("[data-card-column]") ?? [],
      )
        .filter((element) => !element.closest("details:not([open])"))
        .map((element) =>
          Array.from(element.querySelectorAll<HTMLButtonElement>("button[data-work-item]")),
        )
        .filter((cards) => cards.length > 0);
      const columnIndex = columns.findIndex((cards) => cards.includes(card));
      const cards = columns[columnIndex];
      if (!cards) return;
      const row = cards.indexOf(card);
      let target: HTMLButtonElement | undefined;
      if (event.key === "ArrowUp") target = cards[row - 1];
      if (event.key === "ArrowDown") target = cards[row + 1];
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const adjacent = columns[columnIndex + (event.key === "ArrowLeft" ? -1 : 1)];
        target = adjacent?.[Math.min(row, adjacent.length - 1)];
      }
      event.preventDefault();
      target?.focus();
    }
    function handlePopstate() {
      const params = new URL(window.location.href).searchParams;
      setOpenSlug(params.get("item"));
      setFullDetail(params.get("detail") === "full");
    }
    document.addEventListener("keydown", handleKeydown);
    window.addEventListener("popstate", handlePopstate);
    return () => {
      document.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("popstate", handlePopstate);
    };
  }, [
    openItem,
    verifyingItem,
    paletteOpen,
    needsYouOpen,
    createOpen,
    customiseId,
    githubTracker,
    verifyingOpen,
  ]);

  function changeView(next: "overview" | "pipeline") {
    if (next === view) return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.pushState(window.history.state, "", url);
    setView(next);
    document.getElementById(`${next}-view-trigger`)?.focus();
  }

  useEffect(() => {
    const restoreView = () => setView(viewFromSearch(window.location.search));
    window.addEventListener("popstate", restoreView);
    return () => window.removeEventListener("popstate", restoreView);
  }, []);

  return (
    <div
      data-first-load={firstLoad}
      className="pipeline-app flex h-dvh w-full min-w-0 max-w-full flex-col"
    >
      <TopBar
        snapshot={snapshot}
        view={view}
        onViewChange={changeView}
        onOpenNeedsYou={() => {
          setFocusAttentionId(null);
          setNeedsYouOpen(true);
        }}
        onOpenPalette={() => {
          if (!paletteOpen) setPaletteInstance((instance) => instance + 1);
          setPaletteOpen(true);
        }}
      />
      {snapshot.attentionItems.some((item) => item.kind === "permission") && (
        <div className="page-width pt-4">
          <button
            type="button"
            aria-label={t.needsYou.pendingPermissions}
            className="flex w-full items-center gap-2 rounded-lg bg-attention-soft p-3 text-left text-sm text-attention-foreground"
            onClick={() => {
              setFocusAttentionId(null);
              setNeedsYouOpen(true);
            }}
          >
            <ShieldAlert className="size-icon-md shrink-0" aria-hidden="true" />
            <span className="flex-1">{t.needsYou.pendingPermissions}</span>
            <span aria-hidden="true">{t.overview.openQueue}</span>
            <ChevronRight className="size-icon-sm shrink-0" aria-hidden="true" />
          </button>
        </div>
      )}
      {view === "overview" && (
        <Overview
          snapshot={snapshot}
          connection={connection}
          error={error}
          onPipeline={() => changeView("pipeline")}
          onOpenItem={openWorkItem}
          onNeedsYou={(id) => {
            setFocusAttentionId(id ?? null);
            setNeedsYouOpen(true);
          }}
          onCreate={() => setCreateOpen(true)}
          onMilestone={(id) => {
            setSelectedMilestone(id);
            changeView("pipeline");
          }}
        />
      )}
      <div
        hidden={view === "overview"}
        className={`${view === "overview" ? "hidden" : "flex"} relative min-h-0 min-w-0 flex-1 gap-4`}
      >
        <main
          hidden={view === "overview"}
          className={`pipeline-main ${view === "overview" ? "hidden" : "flex"} ${fullDetail && openItem ? "lg:hidden" : ""} min-h-0 min-w-0 flex-1 flex-col`}
        >
          <BoardWorkflowFilter snapshot={snapshot} items={visible} openSlug={openSlug}>
            {(filtered, workflowPicker) => {
              const showWorkflow = new Set(filtered.map((item) => item.workflow)).size > 1;
              const filteredActive = inFlight.filter((item) => filtered.includes(item));
              const filteredShipped = shipped.filter((item) => filtered.includes(item));
              const filteredMilestoneShipped = milestoneShipped.filter((item) =>
                filtered.includes(item),
              );
              const filteredUnstaged = unstaged.filter((item) => filtered.includes(item));
              return (
                <>
                  {error && (
                    <p
                      className="connection-error bg-attention-soft px-4 py-3 text-xs text-attention-foreground sm:px-6"
                      role="alert"
                    >
                      {error}
                      {t.board.lastAvailable}
                    </p>
                  )}
                  <BoardToolbar
                    snapshot={snapshot}
                    milestone={milestone}
                    selected={selected}
                    setSelectedMilestone={setSelectedMilestone}
                    workflowPicker={workflowPicker}
                    connection={connection}
                    filteredActive={filteredActive}
                    filteredShipped={filteredShipped}
                    filteredMilestoneShipped={filteredMilestoneShipped}
                    githubTracker={githubTracker}
                    onCreate={() => setCreateOpen(true)}
                  />
                  {githubTracker && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm text-muted-foreground sm:px-6">
                      <span>{t.board.githubCreation}</span>
                      {repository && /^[a-z\d-]+\/[a-z\d_.-]+$/i.test(repository) && (
                        <a
                          className="underline"
                          href={`https://github.com/${repository}/issues`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t.board.githubIssues}
                        </a>
                      )}
                    </div>
                  )}
                  {githubTracker && (!snapshot.github?.verifying || snapshot.github.error) && (
                    <GithubStatus github={snapshot.github} />
                  )}
                  <BoardMotionContext.Provider
                    value={{ firstLoad, previous: prior, skip, instant, reduced }}
                  >
                    <MotionConfig
                      transition={
                        skip
                          ? { duration: 0 }
                          : { ...spring.layout, layout: instant ? { duration: 0 } : spring.layout }
                      }
                    >
                      <LayoutGroup>
                        <section
                          className="board-scroll relative min-h-0 min-w-0 w-full max-w-full flex-1 overflow-y-auto overscroll-contain px-4 pb-6 sm:px-6"
                          onScroll={(event) => {
                            const grid = event.currentTarget.querySelector(".stage-grid");
                            event.currentTarget.dataset.scrolled = String(
                              !!grid &&
                                grid.getBoundingClientRect().top <
                                  event.currentTarget.getBoundingClientRect().top,
                            );
                          }}
                          ref={scroll}
                          aria-label={t.board.stages}
                        >
                          {githubTracker && snapshot.github?.verifying ? (
                            <p className="mt-4 text-muted-foreground" role="status">
                              {t.board.verifyingGithub}
                            </p>
                          ) : githubTracker &&
                            (!snapshot.github ||
                              (!snapshot.github.fetchedAt &&
                                !snapshot.github.repositoryId &&
                                !!snapshot.github.error) ||
                              (!snapshot.github.complete &&
                                snapshot.workItems.length === 0)) ? null : snapshot.workItems
                              .length === 0 ? (
                            <section className="empty-project flex min-h-64 flex-col items-center justify-center text-center leading-relaxed">
                              <FolderOpen
                                className="size-icon-lg muted text-muted-foreground"
                                aria-hidden="true"
                              />
                              <h2 className="mt-4 text-base font-medium">{t.board.empty}</h2>
                              {!githubTracker && (
                                <>
                                  <p className="mt-2 muted text-muted-foreground">
                                    {t.board.startWithSpec}
                                    <code>.scratch/&lt;work-item&gt;/spec.md</code>.
                                  </p>
                                  <p className="mt-2 text-xs muted text-muted-foreground">
                                    {t.board.addTickets}
                                    <code>.scratch/&lt;work-item&gt;/issues/</code>
                                    {t.board.updatesAsYouEdit}
                                  </p>
                                </>
                              )}
                            </section>
                          ) : (
                            <>
                              {filtered.length === 0 && (
                                <p className="mt-4 muted text-muted-foreground" role="status">
                                  {t.board.emptyMilestone}
                                </p>
                              )}
                              <StageStrip items={filteredActive}>
                                {(narrow, activeStage) => (
                                  <m.div
                                    layout={!skip && !reduced ? "position" : false}
                                    transition={instant || skip ? { duration: 0 } : spring.layout}
                                    className="stage-board w-full rounded-3xl bg-card p-3 shadow-card"
                                  >
                                    <m.div
                                      layout={!skip && !reduced ? "position" : false}
                                      transition={instant || skip ? { duration: 0 } : spring.layout}
                                      className="stage-grid flex justify-start gap-2"
                                    >
                                      {builtInWorkflows.feature.stages
                                        .filter((stage) => !narrow || stage.column === activeStage)
                                        .map((stage) => (
                                          <Column
                                            key={stage.id}
                                            id={stage.column}
                                            name={stageName(builtInWorkflows.feature, stage, t)}
                                            items={filteredActive.filter(
                                              (item) => item.column === stage.column,
                                            )}
                                            milestones={snapshot.milestones}
                                            workflows={snapshot.workflows}
                                            attentionItems={snapshot.attentionItems}
                                            agents={snapshot.agents}
                                            selectedSlug={openSlug}
                                            expanded={expandedStages.includes(stage.column)}
                                            onToggle={() =>
                                              setExpandedStages((current) =>
                                                current.includes(stage.column)
                                                  ? current.filter((id) => id !== stage.column)
                                                  : [...current, stage.column],
                                              )
                                            }
                                            narrow={narrow}
                                            showWorkflow={showWorkflow}
                                            panelOpen={!!openItem}
                                            onOpen={openWorkItem}
                                          />
                                        ))}
                                    </m.div>
                                  </m.div>
                                )}
                              </StageStrip>
                              <UnstagedLane
                                snapshot={snapshot}
                                filteredUnstaged={filteredUnstaged}
                                showWorkflow={showWorkflow}
                                openSlug={openSlug}
                                openWorkItem={openWorkItem}
                              />
                            </>
                          )}
                          <ShippedLane
                            snapshot={snapshot}
                            filteredShipped={filteredShipped}
                            filteredMilestoneShipped={filteredMilestoneShipped}
                            openSlug={openSlug}
                            openWorkItem={openWorkItem}
                            showWorkflow={showWorkflow}
                          />
                        </section>
                      </LayoutGroup>
                    </MotionConfig>
                  </BoardMotionContext.Provider>
                </>
              );
            }}
          </BoardWorkflowFilter>
        </main>
        <AnimatePresence>
          {view === "pipeline" && openItem && drawerItem && (
            <WorkItemDrawer
              mainHead={snapshot.mainHead}
              localTracker={snapshot.setup.tracker === "local-markdown"}
              workflows={snapshot.workflows}
              attentionCount={
                snapshot.attentionItems.filter((entry) => entry.workItem === openItem.slug).length
              }
              pendingPermissions={snapshot.attentionItems.some(
                (item) => item.kind === "permission",
              )}
              onOpenNeedsYou={() => {
                setFocusAttentionId(null);
                setNeedsYouOpen(true);
              }}
              warnings={snapshot.warnings}
              key={`${openItem.slug}:${drawerVersion}`}
              item={drawerItem}
              githubRetryAt={snapshot.github?.retryAt}
              githubReadOnly={
                githubTracker &&
                (!!snapshot.github?.discoveryFailed ||
                  !!snapshot.github?.items.find((item) => item.id === openItem.github?.issueId)
                    ?.detail?.stale ||
                  !!snapshot.github?.items.find((item) => item.id === openItem.github?.issueId)
                    ?.detailFailed)
              }
              agents={snapshot.agents}
              milestone={snapshot.milestones.find((entry) => entry.id === openItem.milestone)}
              full={fullDetail}
              onFullChange={(full) => {
                setFullDetail(full);
                const url = new URL(window.location.href);
                if (full) url.searchParams.set("detail", "full");
                else url.searchParams.delete("detail");
                window.history.replaceState(window.history.state, "", url);
              }}
              onClose={() => {
                setFullDetail(false);
                setOpenSlug(null);
              }}
              onCustomiseWorkflow={setCustomiseId}
            />
          )}
        </AnimatePresence>
      </div>
      {(needsYouOpen || needsYouMounted) && (
        <NeedsYouQueue
          open={needsYouOpen}
          focusAttentionId={focusAttentionId}
          onExitComplete={() => setNeedsYouMounted(false)}
          snapshot={snapshot}
          alerts={alerts}
          openSlug={openSlug}
          onClose={() => setNeedsYouOpen(false)}
          onOpenItem={openWorkItem}
        />
      )}
      {verifyingItem && (
        <Sheet
          open={verifyingOpen}
          onOpenChange={(open) => {
            if (!open) setVerifyingOpen(false);
          }}
        >
          <SheetContent
            aria-describedby={undefined}
            onExitComplete={() => {
              setOpenSlug(null);
              setVerifyingOpen(true);
            }}
          >
            <SheetTitle>{t.board.verifyingGithub}</SheetTitle>
            <Button onClick={() => setVerifyingOpen(false)}>{t.stints.closeWorkItem}</Button>
          </SheetContent>
        </Sheet>
      )}
      <CommandPalette
        key={paletteInstance}
        open={paletteOpen}
        onCreateItem={() => setCreateOpen(true)}
        onCustomiseWorkflow={setCustomiseId}
        snapshot={snapshot}
        milestone={milestone}
        onMilestoneChange={(value) => {
          setSelectedMilestone(value);
          changeView("pipeline");
        }}
        onOpenItem={openWorkItem}
        onClose={() => setPaletteOpen(false)}
      />
      {(createOpen || createMounted) && !githubTracker && (
        <CreateWorkItem
          snapshot={snapshot}
          open={createOpen}
          onExitComplete={() => setCreateMounted(false)}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setSelectedMilestone("");
            setCreateOpen(false);
          }}
        />
      )}
      {(customiseId || customiseMounted) && lastCustomiseId.current && (
        <CustomiseWorkflow
          key={lastCustomiseId.current}
          id={lastCustomiseId.current}
          open={!!customiseId}
          onExitComplete={() => setCustomiseMounted(false)}
          onClose={() => setCustomiseId(null)}
        />
      )}
    </div>
  );
}
