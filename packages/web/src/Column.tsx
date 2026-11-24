// SPDX-License-Identifier: Apache-2.0
import type {
  AgentProfile,
  AttentionItem,
  BoardColumn,
  Milestone,
  WorkflowDefinitions,
} from "@stintwork/core";
import { CheckCheck, CircleHelp, GitBranch, ListFilter, Sparkles, Zap } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
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
  expanded,
  onToggle,
  panelOpen,
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
  expanded: boolean;
  onToggle: () => void;
  panelOpen: boolean;
}) {
  const { t } = useLanguage();
  const section = useRef<HTMLElement>(null);
  const toggled = useRef(false);
  useLayoutEffect(() => {
    if (toggled.current) section.current?.querySelector<HTMLButtonElement>("button")?.focus();
    toggled.current = false;
  });
  const rail = !items.length && !expanded;
  const grid = items.length > 6 && !panelOpen;
  const Icon = presentation[id];
  const running = items.filter((item) => item.activeStint?.status === "running").length;
  const waiting = items.filter((item) =>
    attentionItems.some((entry) => entry.workItem === item.slug),
  ).length;
  const stats = `${running} ${t.pipelineBoard.running} · ${waiting} ${t.pipelineBoard.waiting}`;
  return (
    <section
      ref={section}
      className={`stage-column relative snap-start ${rail ? "w-14 shrink-0" : "min-w-[220px] flex-1"}`}
      data-card-column={id}
      data-layout={rail ? "rail" : grid ? "grid" : "single"}
      aria-labelledby={`stage-${id}`}
    >
      <header className="stage-header sticky top-0 z-20 bg-card px-1 pb-4 pt-2 [[data-scrolled=true]_&]:shadow-[0_1px_0_var(--border)]">
        {rail ? (
          <button
            type="button"
            className="flex w-full flex-col items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={t.column.expand(name, items.length)}
            onClick={() => {
              toggled.current = true;
              onToggle();
            }}
          >
            <IconChip icon={Icon} tone={id === "implement" ? "accent" : "neutral"} />
            <h2
              id={`stage-${id}`}
              className="text-[13px] font-semibold [writing-mode:vertical-rl] [text-orientation:mixed]"
            >
              {name}
            </h2>
            <span className="count tabular-nums text-xs text-muted-foreground">{items.length}</span>
          </button>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <IconChip icon={Icon} tone={id === "implement" ? "accent" : "neutral"} />
              <h2
                id={`stage-${id}`}
                title={name}
                className="min-w-0 flex-1 break-words text-[13px] font-semibold"
              >
                {name}
              </h2>
              <span className="count tabular-nums text-xs text-muted-foreground">
                {items.length}
              </span>
              {!items.length && (
                <button
                  type="button"
                  className="rounded text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => {
                    toggled.current = true;
                    onToggle();
                  }}
                >
                  {t.column.collapse(name)}
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{stats}</p>
          </>
        )}
      </header>
      <div
        className={
          grid
            ? "flex flex-col gap-3 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] lg:content-start"
            : "flex flex-col gap-3"
        }
      >
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
