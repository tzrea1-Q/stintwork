// SPDX-License-Identifier: Apache-2.0
import type {
  AgentProfile,
  AttentionItem,
  BoardColumn,
  Milestone,
  WorkflowDefinitions,
} from "@stintwork/core";
import { CheckCheck, CircleHelp, GitBranch, ListFilter, Sparkles, Zap } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useContext, useLayoutEffect, useRef, useState } from "react";
import { BoardMotionContext } from "./board-motion";
import { spring } from "./ui/motion";
import { RollingNumber } from "./ui/RollingNumber";
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
  narrow,
  showWorkflow,
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
  narrow: boolean;
  showWorkflow: boolean;
}) {
  const { t } = useLanguage();
  const { skip, instant, reduced } = useContext(BoardMotionContext);
  const section = useRef<HTMLElement>(null);
  const toggled = useRef(false);
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const element = section.current;
    if (!element) return;
    const measure = () => {
      const width = element.getBoundingClientRect().width;
      if (width > 0 && element.getClientRects().length > 0)
        setWide(window.innerWidth >= 1024 && width >= 452);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  useLayoutEffect(() => {
    if (toggled.current) section.current?.querySelector<HTMLButtonElement>("button")?.focus();
    toggled.current = false;
  });
  const rail = !narrow && !items.length && !expanded;
  const grid = items.length > 0 && wide && !panelOpen;
  const Icon = presentation[id];
  const running = items.filter((item) => item.activeStint?.status === "running").length;
  const waiting = items.filter((item) =>
    attentionItems.some((entry) => entry.workItem === item.slug),
  ).length;
  const stats = `${running} ${t.pipelineBoard.running} · ${waiting} ${t.pipelineBoard.waiting}`;
  return (
    <m.section
      layout={!skip && !reduced ? "position" : false}
      transition={skip || instant ? { duration: 0 } : spring.layout}
      ref={section}
      className={`stage-column @container relative snap-start ${narrow ? "w-full" : rail ? "w-20 shrink-0" : "stage-column-wide shrink-0 lg:flex-1"}`}
      data-card-column={id}
      data-layout={rail ? "rail" : grid ? "grid" : "single"}
      aria-labelledby={`stage-${id}`}
    >
      {rail ? (
        <m.button
          layout={!skip && !reduced ? "position" : false}
          type="button"
          className="flex h-full w-full flex-col items-center justify-start rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
          aria-label={t.column.expand(name, items.length)}
          onClick={() => {
            toggled.current = true;
            onToggle();
          }}
        >
          <header className="stage-header sticky top-0 z-20 flex h-22 w-full shrink-0 flex-col items-center gap-2 bg-card px-1 pb-4 pt-2 ">
            <span data-stage-icon className="inline-flex shrink-0">
              <IconChip icon={Icon} tone={id === "implement" ? "accent" : "neutral"} />
            </span>
            <span className="count shrink-0 tabular-nums text-xs text-muted-foreground">
              <RollingNumber value={items.length} />
            </span>
          </header>
          <h2
            id={`stage-${id}`}
            title={name}
            className="mt-2 text-[length:var(--type-item-title)] font-semibold text-center break-words"
          >
            {name}
          </h2>
        </m.button>
      ) : (
        <header className="stage-header sticky top-0 z-20 h-22 bg-card px-1 pb-4 pt-2 ">
          <div className="flex flex-wrap items-center gap-2">
            <span data-stage-icon className="inline-flex shrink-0">
              <IconChip icon={Icon} tone={id === "implement" ? "accent" : "neutral"} />
            </span>
            <h2
              id={`stage-${id}`}
              title={name}
              className="min-w-0 flex-1 break-words text-[length:var(--type-item-title)] font-semibold"
            >
              {name}
            </h2>
            <span className="count tabular-nums text-xs text-muted-foreground">
              <RollingNumber value={items.length} />
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
          <p
            aria-hidden={running === 0 && waiting === 0}
            className="mt-2 h-4 text-xs text-muted-foreground"
          >
            {(running > 0 || waiting > 0) && stats}
          </p>
        </header>
      )}
      <m.div
        layout={!skip && !reduced ? "position" : false}
        transition={skip || instant ? { duration: 0 } : spring.layout}
        className={
          items.length > 0 && !panelOpen ? "stage-cards flex flex-col gap-3" : "flex flex-col gap-3"
        }
      >
        <AnimatePresence mode="popLayout">
          {items.map((item, index) => (
            <WorkItemCard
              key={item.slug}
              item={item}
              index={index}
              agents={agents}
              selected={selectedSlug === item.slug}
              showWorkflow={showWorkflow}
              workflow={workflows[item.workflow]}
              attentionCount={attentionItems.filter((entry) => entry.workItem === item.slug).length}
              milestone={milestones.find((milestone) => milestone.id === item.milestone)}
              onOpen={onOpen}
            />
          ))}
        </AnimatePresence>
        {!items.length && <span className="sr-only">{t.column.empty(name)}</span>}
      </m.div>
    </m.section>
  );
}
