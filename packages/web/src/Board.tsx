// SPDX-License-Identifier: Apache-2.0
import { builtInWorkflows, type ProjectSnapshot } from "@stintwork/core";
import { CheckCheck, ChevronLeft, ChevronRight, FolderOpen, Layers3 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Column } from "./Column";
import { CommandPalette } from "./CommandPalette";
import { TopBar } from "./TopBar";
import type { Connection } from "./useProjectSnapshot";
import { WorkItemCard } from "./WorkItemCard";
import { WorkItemDrawer } from "./WorkItemDrawer";
import { NeedsYouQueue } from "./NeedsYouQueue";
import { useAttentionAlerts } from "./useAttentionAlerts";
import { RoadmapEditor } from "./RoadmapEditor";
import { CreateWorkItem } from "./CreateWorkItem";
import { CustomiseWorkflow } from "./CustomiseWorkflow";
import { useLanguage } from "./i18n/language";
import { stageName } from "./i18n/workflow-names";

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
  const [selectedMilestone, setSelectedMilestone] = useState("");
  const [openSlug, setOpenSlug] = useState<string | null>(() =>
    new URL(window.location.href).searchParams.get("item"),
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [customiseId, setCustomiseId] = useState<string | null>(null);
  const [needsYouOpen, setNeedsYouOpen] = useState(false);
  const alerts = useAttentionAlerts(snapshot.attentionItems, snapshot.name);
  const previousItem = useRef<string | null>(null);
  const scroll = useRef<HTMLElement>(null);
  const openItem = snapshot.workItems.find((item) => item.slug === openSlug);
  const milestone = snapshot.milestones.some((entry) => entry.id === selectedMilestone)
    ? selectedMilestone
    : "";
  const visible = snapshot.workItems.filter((item) => !milestone || item.milestone === milestone);
  const isShipped = (item: ProjectSnapshot["workItems"][number]) => !!item.merged;
  const active = visible.filter((item) => !isShipped(item));
  const shipped = visible.filter(isShipped);
  const unstaged = active.filter((item) => item.column === undefined);
  const selected = snapshot.milestones.find((entry) => entry.id === milestone);

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
    if (openItem) url.searchParams.set("item", openItem.slug);
    else url.searchParams.delete("item");
    window.history.replaceState(window.history.state, "", url);

    if (!openItem && previousItem.current) {
      setOpenSlug(null);
      const card = Array.from(
        scroll.current?.querySelectorAll<HTMLButtonElement>("[data-work-item]") ?? [],
      ).find((element) => element.dataset.workItem === previousItem.current);
      const lane = card?.closest("details");
      if (lane) lane.open = true;
      (card ?? document.getElementById("command-palette-trigger"))?.focus();
    }
    previousItem.current = openItem?.slug ?? null;
  }, [openItem]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (createOpen || customiseId) return;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (openItem || paletteOpen || needsYouOpen || !(event.target instanceof HTMLElement)) return;
      if (
        event.target.closest(
          "input, textarea, select, [contenteditable]:not([contenteditable=false]), dialog[open]",
        )
      )
        return;
      if (event.key === "c" && !event.metaKey && !event.ctrlKey && !event.altKey) {
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
  }, [openItem, paletteOpen, needsYouOpen, createOpen, customiseId]);

  return (
    <div className="pipeline-app">
      <TopBar
        snapshot={snapshot}
        onOpenNeedsYou={() => setNeedsYouOpen(true)}
        milestone={milestone}
        onMilestoneChange={setSelectedMilestone}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <main className="pipeline-main">
        <div className="pipeline-heading">
          <div>
            <p className="eyebrow">{t.board.workbench}</p>
            <h1 className="mt-1 flex items-center gap-3 text-[26px] font-medium tracking-tight">
              {t.board.pipeline} <span className="heading-count">{visible.length}</span>
            </h1>
            <p className="mt-1 text-xs muted">{t.board.description}</p>
          </div>
          <p className="connection-status" role="status">
            <span
              className={`status-dot ${connection === "live" ? "is-live" : "is-reconnecting"}`}
            />
            {connection === "live"
              ? t.board.live
              : connection === "connecting"
                ? t.board.connecting
                : t.board.reconnecting}
          </p>
        </div>
        {error && (
          <p className="connection-error" role="alert">
            {error}
            {t.board.lastAvailable}
          </p>
        )}
        <div className="board-toolbar">
          <span className="flex items-center gap-2">
            <Layers3 size={13} aria-hidden="true" />
            {selected?.name ?? t.board.allMilestones}
          </span>
          <span>{t.board.counts(active.length, shipped.length)}</span>
          <RoadmapEditor snapshot={snapshot} />
          <button
            type="button"
            className="top-button"
            aria-haspopup="dialog"
            onClick={() => setCreateOpen(true)}
          >
            {t.board.createWorkItem}
          </button>
          <nav className="stage-navigation" aria-label={t.board.stageNavigation}>
            <button
              type="button"
              aria-label={t.board.previousStages}
              onClick={() => scroll.current?.scrollBy({ left: -240 })}
            >
              <ChevronLeft size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={t.board.nextStages}
              onClick={() => scroll.current?.scrollBy({ left: 240 })}
            >
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </nav>
        </div>
        <section className="board-scroll" ref={scroll} aria-label={t.board.stages}>
          {snapshot.workItems.length === 0 ? (
            <section className="empty-project">
              <FolderOpen size={27} className="muted" aria-hidden="true" />
              <h2 className="mt-4 text-base font-medium">{t.board.empty}</h2>
              <p className="mt-2 muted">
                {t.board.startWithSpec}
                <code>.scratch/&lt;work-item&gt;/spec.md</code>.
              </p>
              <p className="mt-2 text-xs muted">
                {t.board.addTickets}
                <code>.scratch/&lt;work-item&gt;/issues/</code>
                {t.board.updatesAsYouEdit}
              </p>
            </section>
          ) : (
            <>
              {visible.length === 0 && (
                <p className="mt-4 muted" role="status">
                  {t.board.emptyMilestone}
                </p>
              )}
              <div className="stage-grid">
                {builtInWorkflows.feature.stages.map((stage) => (
                  <Column
                    key={stage.id}
                    id={stage.column}
                    name={stageName(builtInWorkflows.feature, stage, t)}
                    items={active.filter((item) => item.column === stage.column)}
                    milestones={snapshot.milestones}
                    workflows={snapshot.workflows}
                    attentionItems={snapshot.attentionItems}
                    onOpen={openWorkItem}
                  />
                ))}
              </div>
              {unstaged.length > 0 && (
                <section
                  className="unstaged"
                  data-card-column="unstaged"
                  aria-label={t.board.unstaged}
                >
                  <h2 className="mb-3 text-xs muted">{t.board.unstagedCount(unstaged.length)}</h2>
                  <div className="auxiliary-items">
                    {unstaged.map((item) => (
                      <WorkItemCard
                        workflow={snapshot.workflows[item.workflow]}
                        key={item.slug}
                        item={item}
                        attentionCount={
                          snapshot.attentionItems.filter((entry) => entry.workItem === item.slug)
                            .length
                        }
                        milestone={snapshot.milestones.find((entry) => entry.id === item.milestone)}
                        onOpen={openWorkItem}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          <details className="shipped-lane">
            <summary>
              <ChevronRight size={13} className="shipped-chevron" aria-hidden="true" />
              <CheckCheck size={14} className="success" aria-hidden="true" />
              <h2>{t.board.shipped}</h2>
              <span className="count">{shipped.length}</span>
            </summary>
            {shipped.length ? (
              <div className="auxiliary-items mt-3" data-card-column="shipped">
                {shipped.map((item) => (
                  <WorkItemCard
                    workflow={snapshot.workflows[item.workflow]}
                    key={item.slug}
                    item={item}
                    attentionCount={
                      snapshot.attentionItems.filter((entry) => entry.workItem === item.slug).length
                    }
                    milestone={snapshot.milestones.find((entry) => entry.id === item.milestone)}
                    onOpen={openWorkItem}
                  />
                ))}
              </div>
            ) : (
              <p className="py-4 text-xs muted">{t.board.emptyShipped}</p>
            )}
          </details>
        </section>
      </main>
      {needsYouOpen && (
        <NeedsYouQueue
          snapshot={snapshot}
          alerts={alerts}
          onClose={() => setNeedsYouOpen(false)}
          onOpenItem={openWorkItem}
        />
      )}
      {openItem && (
        <WorkItemDrawer
          workflows={snapshot.workflows}
          warnings={snapshot.warnings}
          key={openItem.slug}
          item={openItem}
          agents={snapshot.agents}
          milestone={snapshot.milestones.find((entry) => entry.id === openItem.milestone)}
          onClose={() => setOpenSlug(null)}
          onCustomiseWorkflow={setCustomiseId}
        />
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
      {createOpen && (
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
