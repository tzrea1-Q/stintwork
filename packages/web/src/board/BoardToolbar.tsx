// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "@stintwork/core";
import type { ReactNode } from "react";
import { Layers3 } from "lucide-react";
import { useLanguage } from "../i18n/language";
import { workItemDone } from "../overview-data";
import { RoadmapEditor } from "../RoadmapEditor";
import { Button } from "../ui/Button";
import { RollingNumber } from "../ui/RollingNumber";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/Select";
import type { Connection } from "../useProjectSnapshot";

export function BoardToolbar({
  snapshot,
  milestone,
  selected,
  setSelectedMilestone,
  workflowPicker,
  connection,
  filteredActive,
  filteredShipped,
  filteredMilestoneShipped,
  githubTracker,
  onCreate,
}: {
  snapshot: ProjectSnapshot;
  milestone: string;
  selected: ProjectSnapshot["milestones"][number] | undefined;
  setSelectedMilestone: (value: string) => void;
  workflowPicker: ReactNode;
  connection: Connection;
  filteredActive: ProjectSnapshot["workItems"];
  filteredShipped: ProjectSnapshot["workItems"];
  filteredMilestoneShipped: ProjectSnapshot["workItems"];
  githubTracker: boolean;
  onCreate: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="board-toolbar flex min-w-0 flex-col gap-3 px-4 py-4 text-xs text-muted-foreground lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:px-6">
      <div className="board-toolbar-context flex min-w-0 items-center gap-2">
        <div className="board-milestone-label flex min-w-0 max-w-full flex-1 items-center gap-2 lg:flex-none">
          <Layers3 className="size-icon-sm shrink-0" aria-hidden="true" />
          <Select
            value={milestone ? `milestone:${milestone}` : "all"}
            onValueChange={(value) =>
              setSelectedMilestone(value === "all" ? "" : value.slice("milestone:".length))
            }
          >
            <SelectTrigger aria-label={t.topBar.milestone} className="max-w-64">
              <SelectValue data-truncate title={selected?.name ?? t.board.allMilestones}>
                {selected?.name ?? t.board.allMilestones}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.board.allMilestones}</SelectItem>
              {snapshot.milestones.map((entry) => {
                const total = snapshot.workItems.filter(
                  (item) => item.milestone === entry.id,
                ).length;
                const done = snapshot.workItems.filter(
                  (item) => item.milestone === entry.id && workItemDone(item),
                ).length;
                const progress = `${done}/${total} ${t.pipelineBoard.milestoneProgress}`;
                return (
                  <SelectItem
                    key={entry.id}
                    value={`milestone:${entry.id}`}
                    title={entry.name}
                    aria-description={progress}
                    data-progress={progress}
                    className="gap-2 after:shrink-0 after:text-xs after:text-muted-foreground after:content-[attr(data-progress)]"
                  >
                    {entry.name}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        {workflowPicker}
        <p className="connection-status hidden items-center gap-2 lg:flex" role="status">
          <span
            aria-hidden="true"
            className={`size-1 rounded-full ${connection === "live" ? "bg-success" : "bg-attention"}`}
          />
          {connection === "live"
            ? t.board.live
            : connection === "connecting"
              ? t.board.connecting
              : t.board.reconnecting}
        </p>
      </div>
      <div className="board-toolbar-actions flex min-w-0 items-center gap-2">
        {!snapshot.github?.verifying && (
          <span className="board-stats whitespace-nowrap">
            {(() => {
              const [before, middle, after] = t.board.counts(-12345, -67890).split(/-12345|-67890/);
              return (
                <>
                  {before}
                  <RollingNumber value={filteredActive.length} />
                  {middle}
                  <RollingNumber value={filteredShipped.length + filteredMilestoneShipped.length} />
                  {after}
                </>
              );
            })()}
          </span>
        )}
        <RoadmapEditor snapshot={snapshot} />
        {!githubTracker && (
          <Button variant="primary" aria-haspopup="dialog" onClick={() => onCreate()}>
            {t.board.createWorkItem}
          </Button>
        )}
      </div>
    </div>
  );
}
