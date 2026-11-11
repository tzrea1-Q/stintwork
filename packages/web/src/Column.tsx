// SPDX-License-Identifier: Apache-2.0
import type {
  AgentProfile,
  AttentionItem,
  BoardColumn,
  Milestone,
  WorkflowDefinitions,
} from "@stintwork/core";
import { CheckCheck, CircleHelp, GitBranch, ListFilter, Sparkles, Zap } from "lucide-react";
import { useLanguage } from "./i18n/language";
import { IconChip } from "./ui/IconChip";
import { type BoardWorkItem, WorkItemCard } from "./WorkItemCard";

const presentation = {
  clarify: CircleHelp,
  spec: Sparkles,
  tickets: ListFilter,
  implement: Zap,
  review: CheckCheck,
  ship: GitBranch,
};

export function Column({
  id,
  name,
  items,
  milestones,
  workflows,
  onOpen,
  attentionItems = [],
  agents,
  selectedSlug,
}: {
  id: BoardColumn;
  name: string;
  items: BoardWorkItem[];
  milestones: Milestone[];
  workflows: WorkflowDefinitions;
  onOpen: (slug: string) => void;
  attentionItems?: AttentionItem[];
  agents: AgentProfile[];
  selectedSlug: string | null;
}) {
  const { t } = useLanguage();
  const Icon = presentation[id];
  const running = items.filter((item) => item.activeStint?.status === "running").length;
  const waiting = items.filter((item) =>
    attentionItems.some((entry) => entry.workItem === item.slug),
  ).length;
  const stats = [
    running && `${running} ${t.pipelineBoard.running}`,
    waiting && `${waiting} ${t.pipelineBoard.waiting}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section
      className={`stage-column relative min-w-0 snap-start ${items.length ? "min-w-[150px] max-w-[340px] flex-1" : "group flex-[0_0_56px] min-w-14 transition-[flex-basis] hover:basis-[150px] focus-within:basis-[150px]"}`}
      data-card-column={id}
      aria-labelledby={`stage-${id}`}
      tabIndex={items.length ? undefined : 0}
    >
      <header className="stage-header px-1 pb-4 pt-2">
        <div
          className={
            items.length ? "flex flex-wrap items-center gap-2" : "flex flex-col items-center gap-2"
          }
        >
          <IconChip icon={Icon} tone={id === "implement" ? "accent" : "neutral"} />
          <h2
            id={`stage-${id}`}
            title={name}
            className={
              items.length
                ? "min-w-0 break-words text-xs font-medium"
                : "w-full truncate text-center text-xs font-medium"
            }
          >
            {name}
          </h2>
          <span className="count text-xs text-muted-foreground">{items.length}</span>
        </div>
        {stats && <p className="mt-2 text-xs text-muted-foreground">{stats}</p>}
      </header>
      <div className="flex flex-col gap-3">
        {items.length ? (
          items.map((item) => (
            <WorkItemCard
              key={item.slug}
              item={item}
              agents={agents}
              selected={selectedSlug === item.slug}
              workflow={workflows[item.workflow]}
              attentionCount={attentionItems.filter((entry) => entry.workItem === item.slug).length}
              milestone={milestones.find((milestone) => milestone.id === item.milestone)}
              onOpen={onOpen}
            />
          ))
        ) : (
          <span className="sr-only">{t.column.empty(name)}</span>
        )}
      </div>
    </section>
  );
}
