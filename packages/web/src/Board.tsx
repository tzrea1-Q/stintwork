import { builtInWorkflows, type ProjectSnapshot } from "@stintwork/core";
import { CheckCheck, ChevronLeft, ChevronRight, FolderOpen, Layers3 } from "lucide-react";
import { useRef, useState } from "react";
import { Column } from "./Column";
import { TopBar } from "./TopBar";
import type { Connection } from "./useProjectSnapshot";
import { WorkItemCard } from "./WorkItemCard";

export function Board({
  snapshot,
  connection = "live",
  error,
}: {
  snapshot: ProjectSnapshot;
  connection?: Connection;
  error?: string;
}) {
  const [selectedMilestone, setSelectedMilestone] = useState("");
  const scroll = useRef<HTMLElement>(null);
  const milestone = snapshot.milestones.some((entry) => entry.id === selectedMilestone)
    ? selectedMilestone
    : "";
  const visible = snapshot.workItems.filter((item) => !milestone || item.milestone === milestone);
  const isShipped = (item: ProjectSnapshot["workItems"][number]) =>
    (item.stage === "ship" && item.tickets.every((ticket) => ticket.resolved)) ||
    snapshot.milestones.some((entry) => entry.id === item.milestone && entry.status === "shipped");
  const active = visible.filter((item) => !isShipped(item));
  const shipped = visible.filter(isShipped);
  const unstaged = active.filter((item) => item.column === undefined);
  const selected = snapshot.milestones.find((entry) => entry.id === milestone);

  return (
    <div className="pipeline-app">
      <TopBar snapshot={snapshot} milestone={milestone} onMilestoneChange={setSelectedMilestone} />
      <main className="pipeline-main">
        <div className="pipeline-heading">
          <div>
            <p className="eyebrow">Stintwork · Project workbench</p>
            <h1 className="mt-1 flex items-center gap-3 text-[26px] font-medium tracking-tight">
              Pipeline <span className="heading-count">{visible.length}</span>
            </h1>
            <p className="mt-1 text-xs muted">Your work, from first question to shipped.</p>
          </div>
          <p className="connection-status" role="status">
            <span
              className={`status-dot ${connection === "live" ? "is-live" : "is-reconnecting"}`}
            />
            {connection === "live"
              ? "Live"
              : connection === "connecting"
                ? "Connecting live updates"
                : "Reconnecting · Reading project periodically"}
          </p>
        </div>
        {error && (
          <p className="connection-error" role="alert">
            {error} Showing the last available project; retrying automatically.
          </p>
        )}
        <div className="board-toolbar">
          <span className="flex items-center gap-2">
            <Layers3 size={13} aria-hidden="true" />
            {selected?.name ?? "All milestones"}
          </span>
          <span>
            {active.length} active · {shipped.length} shipped · Read-only
          </span>
          <nav className="stage-navigation" aria-label="Stage navigation">
            <button
              type="button"
              aria-label="Previous stages"
              onClick={() => scroll.current?.scrollBy({ left: -240 })}
            >
              <ChevronLeft size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next stages"
              onClick={() => scroll.current?.scrollBy({ left: 240 })}
            >
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </nav>
        </div>
        <section className="board-scroll" ref={scroll} aria-label="Pipeline stages">
          {snapshot.workItems.length === 0 ? (
            <section className="empty-project">
              <FolderOpen size={27} className="muted" aria-hidden="true" />
              <h2 className="mt-4 text-base font-medium">No work items yet</h2>
              <p className="mt-2 muted">
                Start with a spec in <code>.scratch/&lt;work-item&gt;/spec.md</code>.
              </p>
              <p className="mt-2 text-xs muted">
                Add tickets in <code>.scratch/&lt;work-item&gt;/issues/</code>. The Pipeline updates
                as you edit.
              </p>
            </section>
          ) : (
            <>
              {visible.length === 0 && (
                <p className="mt-4 muted" role="status">
                  No work items in this milestone.
                </p>
              )}
              <div className="stage-grid">
                {builtInWorkflows.feature.stages.map((stage) => (
                  <Column
                    key={stage.id}
                    id={stage.column}
                    name={stage.name}
                    items={active.filter((item) => item.column === stage.column)}
                    milestones={snapshot.milestones}
                  />
                ))}
              </div>
              {unstaged.length > 0 && (
                <section className="unstaged" aria-label="Work items without a stage">
                  <h2 className="mb-3 text-xs muted">
                    Work items without a stage · {unstaged.length}
                  </h2>
                  <div className="auxiliary-items">
                    {unstaged.map((item) => (
                      <WorkItemCard
                        key={item.slug}
                        item={item}
                        milestone={snapshot.milestones.find((entry) => entry.id === item.milestone)}
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
              <h2>Shipped</h2>
              <span className="count">{shipped.length}</span>
            </summary>
            {shipped.length ? (
              <div className="auxiliary-items mt-3">
                {shipped.map((item) => (
                  <WorkItemCard
                    key={item.slug}
                    item={item}
                    milestone={snapshot.milestones.find((entry) => entry.id === item.milestone)}
                  />
                ))}
              </div>
            ) : (
              <p className="py-4 text-xs muted">No shipped work items yet.</p>
            )}
          </details>
        </section>
      </main>
    </div>
  );
}
