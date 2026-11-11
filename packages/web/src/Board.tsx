// SPDX-License-Identifier: Apache-2.0
import { builtInWorkflows, type ProjectSnapshot } from "@stintwork/core";
import { CheckCheck, ChevronLeft, ChevronRight, FolderOpen, Layers3 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Column } from "./Column";
import { BoardWorkflowFilter } from "./BoardWorkflowFilter";
import { CommandPalette } from "./CommandPalette";
import { CreateWorkItem } from "./CreateWorkItem";
import { CustomiseWorkflow } from "./CustomiseWorkflow";
import { GithubStatus } from "./GithubStatus";
import { useLanguage } from "./i18n/language";
import { stageName } from "./i18n/workflow-names";
import { NeedsYouQueue } from "./NeedsYouQueue";
import { RoadmapEditor } from "./RoadmapEditor";
import { TopBar } from "./TopBar";
import { Button } from "./ui/Button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/Select";
import { Sheet, SheetContent, SheetTitle } from "./ui/Sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/Tooltip";
import { useAttentionAlerts } from "./useAttentionAlerts";
import type { Connection } from "./useProjectSnapshot";
import { WorkItemCard } from "./WorkItemCard";
import { WorkItemDrawer } from "./WorkItemDrawer";

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
  const githubTracker = snapshot.setup.tracker === "github-issues";
  const repository = snapshot.github?.repository;
  const [selectedMilestone, setSelectedMilestone] = useState("");
  const [openSlug, setOpenSlug] = useState<string | null>(() =>
    new URL(window.location.href).searchParams.get("item"),
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [customiseId, setCustomiseId] = useState<string | null>(null);
  const [needsYouOpen, setNeedsYouOpen] = useState(false);
  const alerts = useAttentionAlerts(snapshot);
  const previousItem = useRef<string | null>(null);
  const scroll = useRef<HTMLElement>(null);
  const stageScroll = useRef<HTMLDivElement>(null);
  const openItem = snapshot.workItems.find((item) => item.slug === openSlug);
  const verifyingItem = !!openSlug && githubTracker && !!snapshot.github?.verifying && !openItem;
  const milestone = snapshot.milestones.some((entry) => entry.id === selectedMilestone)
    ? selectedMilestone
    : "";
  const visible = snapshot.workItems.filter((item) => !milestone || item.milestone === milestone);
  const isShipped = (item: ProjectSnapshot["workItems"][number]) => !!item.merged;
  const active = visible.filter((item) => !isShipped(item));
  const shipped = visible.filter(isShipped);
  const unstaged = active.filter((item) => item.column === undefined);
  const selected = snapshot.milestones.find((entry) => entry.id === milestone);

  function scrollStages(direction: -1 | 1) {
    const viewport = stageScroll.current;
    const columns = viewport?.querySelectorAll<HTMLElement>(".stage-column");
    if (viewport && columns && columns.length > 1)
      viewport.scrollBy({ left: direction * (columns[1].offsetLeft - columns[0].offsetLeft) });
  }

  const openWorkItem = useCallback(
    (slug: string) => {
      if (
        milestone &&
        snapshot.workItems.find((item) => item.slug === slug)?.milestone !== milestone
      )
        setSelectedMilestone("");
      setOpenSlug(slug);
    },
    [milestone, snapshot.workItems],
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    if (openSlug && (openItem || verifyingItem)) url.searchParams.set("item", openSlug);
    else url.searchParams.delete("item");
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
        setPaletteOpen((open) => !open);
        return;
      }
      if (
        openItem ||
        verifyingItem ||
        paletteOpen ||
        needsYouOpen ||
        !(event.target instanceof HTMLElement)
      )
        return;
      if (
        event.target.closest(
          "input, textarea, select, [contenteditable]:not([contenteditable=false]), dialog[open]",
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
      setOpenSlug(new URL(window.location.href).searchParams.get("item"));
    }
    document.addEventListener("keydown", handleKeydown);
    window.addEventListener("popstate", handlePopstate);
    return () => {
      document.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("popstate", handlePopstate);
    };
  }, [openItem, verifyingItem, paletteOpen, needsYouOpen, createOpen, customiseId, githubTracker]);

  return (
    <div className="pipeline-app flex h-dvh min-w-0 flex-col">
      <TopBar
        snapshot={snapshot}
        onOpenNeedsYou={() => setNeedsYouOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      {snapshot.attentionItems.some((item) => item.kind === "permission") && (
        <button
          type="button"
          className="border-b border-attention/30 bg-card px-4 py-2 text-left text-sm text-attention-foreground"
          onClick={() => setNeedsYouOpen(true)}
        >
          {t.needsYou.pendingPermissions}
        </button>
      )}
      <main className="pipeline-main flex min-h-0 min-w-0 flex-1 flex-col">
        <BoardWorkflowFilter snapshot={snapshot} items={visible} openSlug={openSlug}>
          {(filtered, workflowPicker) => {
            const filteredActive = active.filter((item) => filtered.includes(item));
            const filteredShipped = shipped.filter((item) => filtered.includes(item));
            const filteredUnstaged = unstaged.filter((item) => filtered.includes(item));
            return (
              <>
                <div className="pipeline-heading flex flex-wrap items-center justify-between gap-4 px-4 pt-6 pb-3 sm:px-6">
                  <div>
                    <h1 className="mt-1 flex items-center gap-3 text-3xl font-medium tracking-tight">
                      {t.board.pipeline}{" "}
                      <span className="heading-count grid min-w-6 place-items-center rounded-sm border border-input px-1 text-xs text-muted-foreground">
                        {filtered.length}
                      </span>
                    </h1>
                    <p className="mt-1 text-xs muted text-muted-foreground">
                      {t.board.description}
                    </p>
                  </div>
                  <p
                    className="connection-status flex items-center gap-2 text-xs text-muted-foreground"
                    role="status"
                  >
                    <span
                      className={`status-dot size-1 rounded-full ${connection === "live" ? "is-live bg-success" : "is-reconnecting bg-attention"}`}
                    />
                    {connection === "live"
                      ? t.board.live
                      : connection === "connecting"
                        ? t.board.connecting
                        : t.board.reconnecting}
                  </p>
                </div>
                {error && (
                  <p
                    className="connection-error bg-attention-soft px-4 py-3 text-xs text-attention-foreground sm:px-6"
                    role="alert"
                  >
                    {error}
                    {t.board.lastAvailable}
                  </p>
                )}
                <div className="board-toolbar flex flex-col gap-3 px-4 py-3 text-xs text-muted-foreground lg:flex-row lg:items-center lg:justify-between lg:px-6">
                  <div className="board-toolbar-context flex min-w-0 flex-wrap items-center gap-4">
                    <div className="board-milestone-label flex min-w-0 max-w-full items-center gap-2">
                      <Layers3 className="size-icon-sm shrink-0" aria-hidden="true" />
                      <Select
                        value={milestone ? `milestone:${milestone}` : "all"}
                        onValueChange={(value) =>
                          setSelectedMilestone(
                            value === "all" ? "" : value.slice("milestone:".length),
                          )
                        }
                      >
                        <SelectTrigger aria-label={t.topBar.milestone} className="max-w-64">
                          <SelectValue
                            data-truncate
                            title={selected?.name ?? t.board.allMilestones}
                          >
                            {selected?.name ?? t.board.allMilestones}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t.board.allMilestones}</SelectItem>
                          {snapshot.milestones.map((entry) => (
                            <SelectItem
                              key={entry.id}
                              value={`milestone:${entry.id}`}
                              aria-label={entry.name}
                            >
                              {entry.name}
                              <span aria-hidden="true">
                                {" "}
                                ·{" "}
                                {
                                  snapshot.workItems.filter(
                                    (item) => item.milestone === entry.id && item.merged,
                                  ).length
                                }
                                /
                                {
                                  snapshot.workItems.filter((item) => item.milestone === entry.id)
                                    .length
                                }{" "}
                                {t.pipelineBoard.milestoneProgress}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {workflowPicker}
                    {!snapshot.github?.verifying && (
                      <span className="board-stats whitespace-nowrap">
                        {t.board.counts(filteredActive.length, filteredShipped.length)}
                      </span>
                    )}
                  </div>
                  <div className="board-toolbar-actions flex min-w-0 flex-wrap items-center gap-2">
                    <RoadmapEditor snapshot={snapshot} />
                    {!githubTracker && (
                      <Button
                        variant="primary"
                        aria-haspopup="dialog"
                        onClick={() => setCreateOpen(true)}
                      >
                        {t.board.createWorkItem}
                      </Button>
                    )}
                    <TooltipProvider>
                      <nav
                        className="stage-navigation ml-auto flex gap-1 lg:ml-0 min-[1200px]:hidden"
                        aria-label={t.board.stageNavigation}
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t.board.previousStages}
                              onClick={() => scrollStages(-1)}
                            >
                              <ChevronLeft aria-hidden="true" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t.board.previousStages}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t.board.nextStages}
                              onClick={() => scrollStages(1)}
                            >
                              <ChevronRight aria-hidden="true" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t.board.nextStages}</TooltipContent>
                        </Tooltip>
                      </nav>
                    </TooltipProvider>
                  </div>
                </div>
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
                <section
                  className="board-scroll min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain px-4 pb-6 sm:px-6"
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
                        snapshot.workItems.length === 0)) ? null : snapshot.workItems.length ===
                    0 ? (
                    <section className="empty-project flex min-h-[360px] flex-col items-center justify-center text-center leading-relaxed">
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
                      <div
                        className="stage-scroll min-w-0 overflow-x-auto overscroll-x-contain rounded-3xl bg-card p-3 shadow-card max-lg:snap-x max-lg:snap-mandatory max-lg:[mask-image:linear-gradient(to_right,black_95%,transparent)]"
                        ref={stageScroll}
                      >
                        <div className="stage-grid flex min-h-[360px] gap-2 max-lg:min-w-[900px] [&>.stage-column]:snap-start">
                          {builtInWorkflows.feature.stages.map((stage) => (
                            <Column
                              key={stage.id}
                              id={stage.column}
                              name={stageName(builtInWorkflows.feature, stage, t)}
                              items={filteredActive.filter((item) => item.column === stage.column)}
                              milestones={snapshot.milestones}
                              workflows={snapshot.workflows}
                              attentionItems={snapshot.attentionItems}
                              agents={snapshot.agents}
                              selectedSlug={openSlug}
                              onOpen={openWorkItem}
                            />
                          ))}
                        </div>
                      </div>
                      {filteredUnstaged.length > 0 && (
                        <section
                          className="unstaged mt-5"
                          data-card-column="unstaged"
                          aria-label={t.board.unstaged}
                        >
                          <h2 className="mb-3 text-xs muted text-muted-foreground">
                            {t.board.unstagedCount(filteredUnstaged.length)}
                          </h2>
                          <div className="auxiliary-items grid grid-cols-[repeat(auto-fill,minmax(180px,220px))] gap-3">
                            {filteredUnstaged.map((item) => (
                              <WorkItemCard
                                workflow={snapshot.workflows[item.workflow]}
                                key={item.slug}
                                item={item}
                                agents={snapshot.agents}
                                selected={openSlug === item.slug}
                                attentionCount={
                                  snapshot.attentionItems.filter(
                                    (entry) => entry.workItem === item.slug,
                                  ).length
                                }
                                milestone={snapshot.milestones.find(
                                  (entry) => entry.id === item.milestone,
                                )}
                                onOpen={openWorkItem}
                              />
                            ))}
                          </div>
                        </section>
                      )}
                    </>
                  )}
                  <details className="shipped-lane mt-4 rounded-2xl bg-card p-4 shadow-card [&>summary]:flex [&>summary]:w-fit [&>summary]:list-none [&>summary]:items-center [&>summary]:gap-2 [&>summary]:text-xs [&>summary::-webkit-details-marker]:hidden [&[open]_.shipped-chevron]:rotate-90">
                    <summary>
                      <ChevronRight className="shipped-chevron size-icon-sm" aria-hidden="true" />
                      <CheckCheck
                        className="size-icon-sm success text-success-foreground"
                        aria-hidden="true"
                      />
                      <h2>{t.board.shipped}</h2>
                      <span className="count min-w-5 rounded-sm bg-muted px-1 text-center text-xs text-muted-foreground">
                        {filteredShipped.length}
                      </span>
                    </summary>
                    {filteredShipped.length ? (
                      <div
                        className="auxiliary-items grid grid-cols-[repeat(auto-fill,minmax(180px,220px))] gap-3 mt-3"
                        data-card-column="shipped"
                      >
                        {filteredShipped.map((item) => (
                          <WorkItemCard
                            workflow={snapshot.workflows[item.workflow]}
                            key={item.slug}
                            item={item}
                            agents={snapshot.agents}
                            selected={openSlug === item.slug}
                            attentionCount={
                              snapshot.attentionItems.filter(
                                (entry) => entry.workItem === item.slug,
                              ).length
                            }
                            milestone={snapshot.milestones.find(
                              (entry) => entry.id === item.milestone,
                            )}
                            onOpen={openWorkItem}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="py-4 text-xs muted text-muted-foreground">
                        {t.board.emptyShipped}
                      </p>
                    )}
                  </details>
                </section>
              </>
            );
          }}
        </BoardWorkflowFilter>
      </main>
      {needsYouOpen && (
        <NeedsYouQueue
          snapshot={snapshot}
          alerts={alerts}
          openSlug={openSlug}
          onClose={() => setNeedsYouOpen(false)}
          onOpenItem={openWorkItem}
        />
      )}
      {openItem && (
        <WorkItemDrawer
          workflows={snapshot.workflows}
          pendingPermissions={snapshot.attentionItems.some((item) => item.kind === "permission")}
          onOpenNeedsYou={() => setNeedsYouOpen(true)}
          warnings={snapshot.warnings}
          key={openItem.slug}
          item={openItem}
          githubRetryAt={snapshot.github?.retryAt}
          githubReadOnly={
            githubTracker &&
            (!!snapshot.github?.discoveryFailed ||
              !!snapshot.github?.items.find((item) => item.id === openItem.github?.issueId)?.detail
                ?.stale ||
              !!snapshot.github?.items.find((item) => item.id === openItem.github?.issueId)
                ?.detailFailed)
          }
          agents={snapshot.agents}
          milestone={snapshot.milestones.find((entry) => entry.id === openItem.milestone)}
          onClose={() => setOpenSlug(null)}
          onCustomiseWorkflow={setCustomiseId}
        />
      )}
      {verifyingItem && (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) setOpenSlug(null);
          }}
        >
          <SheetContent aria-describedby={undefined}>
            <SheetTitle>{t.board.verifyingGithub}</SheetTitle>
            <Button onClick={() => setOpenSlug(null)}>{t.stints.closeWorkItem}</Button>
          </SheetContent>
        </Sheet>
      )}
      {paletteOpen && (
        <CommandPalette
          onCreateItem={() => setCreateOpen(true)}
          onCustomiseWorkflow={setCustomiseId}
          snapshot={snapshot}
          milestone={milestone}
          onMilestoneChange={setSelectedMilestone}
          onOpenItem={openWorkItem}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {createOpen && !githubTracker && (
        <CreateWorkItem
          snapshot={snapshot}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setSelectedMilestone("");
            setCreateOpen(false);
          }}
        />
      )}
      {customiseId && (
        <CustomiseWorkflow
          key={customiseId}
          id={customiseId}
          onClose={() => setCustomiseId(null)}
        />
      )}
    </div>
  );
}
