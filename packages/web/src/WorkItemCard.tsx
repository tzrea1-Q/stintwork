// SPDX-License-Identifier: Apache-2.0

import {
  stageAgent,
  type AgentProfile,
  type Milestone,
  type ProjectSnapshot,
  type WorkflowDefinition,
} from "@stintwork/core";
import { Bug, Layers3, Sparkles, Zap } from "lucide-react";
import { useLanguage } from "./i18n/language";
import { uncustomisedBuiltIn, workflowName } from "./i18n/workflow-names";
import { recoveryStatus } from "./StintRecovery";
import { AgentAvatar } from "./ui/AgentAvatar";
import { SegmentedProgress } from "./ui/SegmentedProgress";
import { StatusChip } from "./ui/StatusChip";
import { Button } from "./ui/Button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/Tooltip";

export type BoardWorkItem = ProjectSnapshot["workItems"][number];

export function WorkItemCard({
  item,
  milestone,
  onOpen,
  attentionCount = 0,
  workflow,
  agents = [],
  selected = false,
}: {
  item: BoardWorkItem;
  milestone?: Milestone;
  onOpen: (slug: string) => void;
  attentionCount?: number;
  workflow?: WorkflowDefinition;
  agents?: AgentProfile[];
  selected?: boolean;
}) {
  const { t } = useLanguage();
  const resolved = item.tickets.filter((ticket) => ticket.resolved).length;
  const open = item.tickets.filter((ticket) => !ticket.resolved);
  const blocked =
    !item.github?.ticketsStale && open.length > 0 && open.every((ticket) => ticket.blocked);
  const running = item.activeStint?.status === "running";
  const stopped =
    !item.merged &&
    !item.activeStint &&
    item.stints[0]?.status === "stopped" &&
    item.stints[0].stage === item.stage;
  const status = running
    ? "running"
    : attentionCount > 0
      ? "attention"
      : blocked
        ? "blocked"
        : stopped
          ? "stopped"
          : undefined;
  const agentId =
    item.stage && workflow
      ? stageAgent(item, item.stage, agents, { [workflow.id]: workflow })
      : undefined;
  const agent =
    agents.find((entry) => entry.id === agentId) ??
    (agentId ? { id: agentId, displayName: agentId } : undefined);
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
      className={`work-item relative min-w-0 rounded-2xl border border-transparent p-3 hover:border-ring has-[.work-item-open:focus-visible]:outline-2 has-[.work-item-open:focus-visible]:outline-offset-2 has-[.work-item-open:focus-visible]:outline-ring ${running ? "bg-running-soft" : attentionCount > 0 ? "bg-attention-soft" : blocked ? "bg-blocked-soft" : "bg-muted"} ${selected ? "ring-2 ring-ring" : ""}`}
      aria-label={`${item.slug}: ${item.title}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="work-item-id inline-flex min-w-0 items-center gap-2 font-mono text-xs text-muted-foreground [&_svg]:size-icon-sm [&_svg]:shrink-0"
          title={typeName}
        >
          <TypeIcon className="size-icon-sm shrink-0" aria-hidden="true" />
          <span className="sr-only">{typeName}: </span>
          <span className="break-all">{item.slug}</span>
        </span>
        {item.milestone && (
          <span
            className="milestone-tag min-w-0 break-all rounded-sm border border-border px-1 font-mono text-xs text-muted-foreground"
            title={milestone?.name}
          >
            {milestone?.id ?? item.milestone}
          </span>
        )}
      </div>
      <h3 className="my-3 text-[length:var(--type-item-title)] leading-5 font-[620] break-words">
        <Button
          variant="link"
          type="button"
          className="work-item-open h-auto w-full justify-start whitespace-normal p-0 text-left text-[length:var(--type-item-title)] font-[620] after:absolute after:inset-0 after:rounded-2xl"
          data-work-item={item.slug}
          aria-label={t.card.open(item.slug, item.title)}
          aria-haspopup="dialog"
          onClick={() => onOpen(item.slug)}
        >
          <span className="line-clamp-3 break-words" data-truncate title={item.title}>
            {item.title}
          </span>
        </Button>
      </h3>
      {status && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {running || attentionCount > 0 ? (
            <span
              role="status"
              aria-label={!running ? t.card.attention(attentionCount) : undefined}
            >
              <StatusChip status={status} pulse={running}>
                {running
                  ? ((item.activeStint && recoveryStatus(item.activeStint, t)) ?? t.card.running)
                  : t.card.needsYou(attentionCount)}
              </StatusChip>
            </span>
          ) : (
            <StatusChip status={status}>
              {blocked ? t.card.blocked : t.overview.stintStatus.stopped}
            </StatusChip>
          )}
          {running && attentionCount > 0 && (
            <span className="text-xs" role="status" aria-label={t.card.attention(attentionCount)}>
              {t.card.needsYou(attentionCount)}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {agent &&
          (item.inferred ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="relative z-10 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    aria-label={`${agent.displayName} · ${t.card.inferred}`}
                  >
                    <AgentAvatar
                      agent={agent.id}
                      name={agent.displayName}
                      active={running}
                      size="sm"
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {t.card.inference}
                  {reason}
                  {item.workflow === "bug" && t.card.bugInference}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <AgentAvatar agent={agent.id} name={agent.displayName} active={running} size="sm" />
          ))}
        <div className="ticket-progress ml-auto flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          {item.github && (!item.github.ticketsKnown || item.github.ticketsStale) ? (
            <span>
              {item.github.ticketsKnown ? t.card.ticketsOutdated : t.card.ticketsNotLoaded}
            </span>
          ) : (
            <>
              <span>
                {resolved}/{item.tickets.length} <span className="sr-only">{t.card.resolved}</span>
                {t.card.tickets}
              </span>
              <div className="w-11 shrink-0">
                <SegmentedProgress
                  label={t.card.progress(item.slug)}
                  total={item.tickets.length}
                  value={resolved}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
