import type { AttentionItem, BoardColumn, Milestone } from "@stintwork/core";
import { CheckCheck, CircleHelp, GitBranch, ListFilter, Sparkles, Zap } from "lucide-react";
import { type BoardWorkItem, WorkItemCard } from "./WorkItemCard";

const presentation = {
  clarify: { icon: CircleHelp, hint: "Find the right problem" },
  spec: { icon: Sparkles, hint: "Agree on the outcome" },
  tickets: { icon: ListFilter, hint: "Slice the implementation" },
  implement: { icon: Zap, hint: "Make it work" },
  review: { icon: CheckCheck, hint: "Prove it is ready" },
  ship: { icon: GitBranch, hint: "Ready to merge" },
};

export function Column({
  id,
  name,
  items,
  milestones,
  onOpen,
  attentionItems = [],
}: {
  id: BoardColumn;
  name: string;
  items: BoardWorkItem[];
  milestones: Milestone[];
  onOpen: (slug: string) => void;
  attentionItems?: AttentionItem[];
}) {
  const { icon: Icon, hint } = presentation[id];
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
        <p className="mt-2 text-[10px] muted">{hint}</p>
      </header>
      <div className="flex flex-col gap-3">
        {items.length ? (
          items.map((item) => (
            <WorkItemCard
              key={item.slug}
              item={item}
              attentionCount={attentionItems.filter((entry) => entry.workItem === item.slug).length}
              milestone={milestones.find((milestone) => milestone.id === item.milestone)}
              onOpen={onOpen}
            />
          ))
        ) : (
          <p className="empty-column">No work items in {name}.</p>
        )}
      </div>
    </section>
  );
}
