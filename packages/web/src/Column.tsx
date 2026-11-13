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
  const stats = `${running} ${t.pipelineBoard.running} · ${waiting} ${t.pipelineBoard.waiting}`;
  return (
    <section
      className="stage-column relative min-w-[150px] max-w-[340px] flex-1 snap-start"
      data-card-column={id}
      aria-labelledby={`stage-${id}`}
      tabIndex={items.length ? undefined : 0}
    >
      <header className="stage-header px-1 pb-4 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <IconChip icon={Icon} tone={id === "implement" ? "accent" : "neutral"} />
          <h2
            id={`stage-${id}`}
            title={name}
            className="min-w-0 flex-1 break-words text-[13px] font-semibold"
          >
            {name}
          </h2>
          <span className="count tabular-nums text-xs text-muted-foreground">{items.length}</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{stats}</p>
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
