// SPDX-License-Identifier: Apache-2.0
import { recoveryStatus } from "./StintRecovery";
import { Button } from "./ui/Button";
import type { Milestone, ProjectSnapshot, WorkflowDefinition } from "@stintwork/core";
import { Bug, Info, Layers3, LockKeyhole, Sparkles, Zap } from "lucide-react";
import { Badge } from "./ui/Badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/Tooltip";
import { useLanguage } from "./i18n/language";
import { uncustomisedBuiltIn, workflowName } from "./i18n/workflow-names";

export type BoardWorkItem = ProjectSnapshot["workItems"][number];

export function WorkItemCard({
  item,
  milestone,
  onOpen,
  attentionCount = 0,
  workflow,
}: {
  item: BoardWorkItem;
  milestone?: Milestone;
  onOpen: (slug: string) => void;
  attentionCount?: number;
  workflow?: WorkflowDefinition;
}) {
  const { t } = useLanguage();
  const resolved = item.tickets.filter((ticket) => ticket.resolved).length;
  const open = item.tickets.filter((ticket) => !ticket.resolved);
  const blocked = open.length > 0 && open.every((ticket) => ticket.blocked);
  const type = item.type === "effort" ? "effort" : item.workflow;
  const icons: Record<string, typeof Sparkles> = {
    feature: Sparkles,
    bug: Bug,
    quick: Zap,
    effort: Layers3,
  };
  const labels: Record<string, string> = {
    feature: t.card.feature,
    bug: t.card.bug,
    quick: t.card.quick,
    effort: t.card.effort,
  };
  const TypeIcon = Object.hasOwn(icons, type) ? icons[type] : Sparkles;
  const typeName =
    workflow && type !== "effort"
      ? uncustomisedBuiltIn(workflow) === "quick"
        ? t.card.quick
        : workflowName(workflow, t)
      : Object.hasOwn(labels, type)
        ? labels[type]
        : item.workflow;
  const reason = item.tickets.length
    ? open.length
      ? t.card.openTickets
      : t.card.resolvedTickets
    : item.spec
      ? t.card.specOnly
      : t.card.noFiles;

  return (
    <article
      className="work-item relative min-w-0 rounded-md border border-border-strong bg-surface p-3 shadow-card hover:border-accent has-[.work-item-open:focus-visible]:outline-2 has-[.work-item-open:focus-visible]:outline-offset-2 has-[.work-item-open:focus-visible]:outline-accent"
      aria-label={`${item.slug}: ${item.title}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="work-item-id inline-flex min-w-0 items-center gap-2 font-mono text-xs text-muted [&_svg]:size-icon-sm [&_svg]:shrink-0"
          title={typeName}
        >
          <TypeIcon className="size-icon-sm shrink-0" aria-hidden="true" />
          <span className="sr-only">{typeName}: </span>
          <span className="break-all">{item.slug}</span>
        </span>
        {item.milestone && (
          <span
            className="milestone-tag shrink-0 rounded-sm border border-border px-1 font-mono text-xs text-muted"
            title={milestone?.name}
          >
            {milestone?.id ?? item.milestone}
          </span>
        )}
      </div>
      <h3 className="my-3 text-base leading-5 font-medium break-words">
        <Button
          variant="link"
          type="button"
          className="work-item-open h-auto w-full justify-start whitespace-normal p-0 text-left after:absolute after:inset-0 after:rounded-md"
          data-work-item={item.slug}
          aria-label={t.card.open(item.slug, item.title)}
          aria-haspopup="dialog"
          onClick={() => onOpen(item.slug)}
        >
          {item.title}
        </Button>
      </h3>
      {item.activeStint?.status === "running" && (
        <span
          className="stint-running mb-3 flex items-center gap-2 text-xs text-accent"
          role="status"
        >
          <span className="stint-running-dot size-1 rounded-full bg-current" aria-hidden="true" />
          {recoveryStatus(item.activeStint, t) ?? t.card.running}
        </span>
      )}
      {item.merged && <Badge variant="success">{t.card.shipped}</Badge>}
      {(blocked || item.inferred || attentionCount > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {attentionCount > 0 && (
            <Badge role="status" variant="warning" aria-label={t.card.attention(attentionCount)}>
              {t.card.needsYou(attentionCount)}
            </Badge>
          )}
          {blocked && (
            <Badge variant="warning">
              <LockKeyhole className="size-icon-sm shrink-0" aria-hidden="true" />
              {t.card.blocked}
            </Badge>
          )}
          {item.inferred && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="relative z-10">
                    <Info aria-hidden="true" />
                    {t.card.inferred}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t.card.inference}
                  {reason}
                  {item.workflow === "bug" && t.card.bugInference}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}
      <div className="ticket-progress flex items-center justify-between gap-2 text-xs text-muted">
        {item.github && (!item.github.ticketsKnown || item.github.ticketsStale) ? (
          <span>{item.github.ticketsKnown ? t.card.ticketsOutdated : t.card.ticketsNotLoaded}</span>
        ) : (
          <>
            <span>
              {resolved}/{item.tickets.length} <span className="sr-only">{t.card.resolved}</span>
              {t.card.tickets}
            </span>
            <progress
              className="h-1 w-11 appearance-none overflow-hidden rounded-sm border-0 bg-surface-hover [&::-webkit-progress-bar]:bg-surface-hover [&::-webkit-progress-value]:bg-accent [&::-moz-progress-bar]:bg-accent"
              aria-label={t.card.progress(item.slug)}
              max={Math.max(1, item.tickets.length)}
              value={resolved}
            />
          </>
        )}
      </div>
    </article>
  );
}
