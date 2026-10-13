// SPDX-License-Identifier: Apache-2.0
import type { AttentionItem, BoardColumn, Milestone, WorkflowDefinitions } from "@stintwork/core";
import { CheckCheck, CircleHelp, GitBranch, ListFilter, Sparkles, Zap } from "lucide-react";
import { type BoardWorkItem, WorkItemCard } from "./WorkItemCard";
import { useLanguage } from "./i18n/language";

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
}: {
  id: BoardColumn;
  name: string;
  items: BoardWorkItem[];
  milestones: Milestone[];
  workflows: WorkflowDefinitions;
  onOpen: (slug: string) => void;
  attentionItems?: AttentionItem[];
}) {
  const { t } = useLanguage();
  const Icon = presentation[id];
  return (
    <section className="stage-column" data-card-column={id} aria-labelledby={`stage-${id}`}>
      <header className="stage-header">
        <div className="flex items-center gap-2">
          <Icon className={id === "implement" ? "accent" : "muted"} size={14} aria-hidden="true" />
          <h2 id={`stage-${id}`} className="text-xs font-medium">
            {name}
          </h2>
          <span className="count">{items.length}</span>
        </div>
        <p className="mt-2 text-[10px] muted">{t.column.hints[id]}</p>
      </header>
      <div className="flex flex-col gap-3">
        {items.length ? (
          items.map((item) => (
            <WorkItemCard
              key={item.slug}
              item={item}
              workflow={workflows[item.workflow]}
              attentionCount={attentionItems.filter((entry) => entry.workItem === item.slug).length}
              milestone={milestones.find((milestone) => milestone.id === item.milestone)}
              onOpen={onOpen}
            />
          ))
        ) : (
          <p className="empty-column">{t.column.empty(name)}</p>
        )}
      </div>
    </section>
  );
}
