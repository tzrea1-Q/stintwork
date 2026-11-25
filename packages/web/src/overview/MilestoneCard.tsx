// SPDX-License-Identifier: Apache-2.0
import { m } from "motion/react";
import { useState } from "react";
import { milestonePercent } from "../overview-data";
import { Card, CardAction, CardContent, CardHeader, CardTitle, Eyebrow } from "../ui/Card";
import { Disclosure } from "../ui/Disclosure";
import { tween, useReducedMotionSafe } from "../ui/motion";
import { Progress } from "../ui/Progress";
import { StatusChip } from "../ui/StatusChip";
import type { CardProps } from "./types";

type Milestone = CardProps["data"]["milestones"][number];
function MilestoneRows({
  rows,
  t,
  onMilestone,
}: Pick<CardProps, "t" | "onMilestone"> & { rows: Milestone[] }) {
  return rows.map(({ milestone, resolved, total, incomplete }) => (
    <div key={milestone.id} className="py-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left hover:underline"
          data-truncate
          title={milestone.name}
          onClick={() => onMilestone(milestone.id)}
        >
          {milestone.name}
        </button>
        <StatusChip
          status={
            milestone.status === "shipped"
              ? "success"
              : milestone.status === "active"
                ? "running"
                : "stopped"
          }
        >
          {t.planning.roadmap[milestone.status]}
        </StatusChip>
        <span className="text-right text-sm tabular-nums">
          {resolved}/{total} {t.overview.workItems}
        </span>
      </div>
      {incomplete && (
        <p className="text-xs text-muted-foreground">{t.overview.progressIncomplete}</p>
      )}
    </div>
  ));
}
function MilestoneDisclosure({
  label,
  rows,
  t,
  onMilestone,
}: Pick<CardProps, "t" | "onMilestone"> & { label: string; rows: Milestone[] }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const reduced = useReducedMotionSafe();
  const toggle = () => {
    if (open) setClosing(true);
    else setClosing(false);
    setOpen(!open);
  };
  return (
    <Disclosure
      label={
        <button
          type="button"
          aria-expanded={open}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            toggle();
          }}
        >
          {label}
        </button>
      }
      open={open || closing}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("summary")) {
          event.preventDefault();
          toggle();
        }
      }}
    >
      <m.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={reduced ? tween.fade : tween.disclosure}
        onAnimationComplete={() => {
          if (!open) setClosing(false);
        }}
        className="overflow-hidden"
      >
        <MilestoneRows rows={rows} t={t} onMilestone={onMilestone} />
      </m.div>
    </Disclosure>
  );
}
export function MilestoneCard({ data, t, onMilestone }: CardProps) {
  const featured = data.featured;
  const other = data.milestones.filter(
    ({ milestone }) => milestone.status !== "shipped" && milestone.id !== featured?.milestone.id,
  );
  const shipped = data.milestones.filter(({ milestone }) => milestone.status === "shipped");
  if (!data.milestones.length) return null;
  return (
    <Card className="min-w-0">
      {featured && (
        <CardHeader>
          <Eyebrow>{t.overview.eyebrows.milestones}</Eyebrow>
          <CardTitle className="min-w-0">
            <button
              type="button"
              className="block max-w-full truncate text-left hover:underline"
              data-truncate
              title={featured.milestone.name}
              onClick={() => onMilestone(featured.milestone.id)}
            >
              {featured.milestone.name}
            </button>
          </CardTitle>
          <CardAction>
            <StatusChip
              status={
                featured.milestone.status === "active"
                  ? "running"
                  : featured.milestone.status === "shipped"
                    ? "success"
                    : "stopped"
              }
            >
              {t.planning.roadmap[featured.milestone.status]}
            </StatusChip>
          </CardAction>
        </CardHeader>
      )}
      <CardContent>
        {featured && (
          <>
            {featured.incomplete && (
              <p className="text-xs text-muted-foreground">{t.overview.progressIncomplete}</p>
            )}
            <div className="mt-8 text-display leading-none font-display tracking-display tabular-nums">
              {milestonePercent(featured.unitsDone, featured.units)}
              <span className="text-display-unit">%</span>
            </div>
            <Progress
              className="mt-5 h-2.5 [&_[data-slot=progress-indicator]]:bg-[var(--overview-chart-today)]"
              value={featured.unitsDone}
              max={featured.units || 1}
              aria-label={featured.milestone.name}
            />
            <div className="mt-2 flex justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {milestonePercent(featured.unitsDone, featured.units)}% {t.overview.completed}
              </span>
              {featured.milestone.target && (
                <span>
                  {t.overview.target} {featured.milestone.target}
                </span>
              )}
            </div>
            <div className="mt-6 space-y-0 text-xs">
              <div className="flex justify-between gap-2 border-t border-border py-3">
                <span className="text-muted-foreground">{t.overview.workItemMetric}</span>
                <strong className="tabular-nums">
                  {featured.resolved}/{featured.total}
                </strong>
              </div>
              <div className="flex justify-between gap-2 border-t border-border py-3">
                <span className="text-muted-foreground">{t.overview.tickets}</span>
                <strong className="tabular-nums">
                  {featured.unitsDone}/{featured.units}
                </strong>
              </div>
              <div className="flex justify-between gap-2 border-t border-border py-3">
                <span className="text-muted-foreground">{t.overview.stintsThisWeek}</span>
                <strong className="tabular-nums">{featured.stintsThisWeek}</strong>
              </div>
            </div>
          </>
        )}
        {other.length > 0 && (
          <MilestoneDisclosure
            rows={other}
            t={t}
            onMilestone={onMilestone}
            label={`${other.length} ${other.length === 1 ? t.overview.moreMilestone : t.overview.moreMilestones}`}
          />
        )}
        {shipped.length > 0 && (
          <MilestoneDisclosure
            rows={shipped}
            t={t}
            onMilestone={onMilestone}
            label={`${shipped.length} ${shipped.length === 1 ? t.overview.shippedMilestone : t.overview.shippedMilestones}`}
          />
        )}
      </CardContent>
    </Card>
  );
}
