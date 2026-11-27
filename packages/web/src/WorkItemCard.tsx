// SPDX-License-Identifier: Apache-2.0

import {
  type AgentProfile,
  type Milestone,
  type ProjectSnapshot,
  stageAgent,
  type WorkflowDefinition,
} from "@stintwork/core";
import { Bug, Layers3, Sparkles, Zap } from "lucide-react";
import { m, useInView, useIsPresent } from "motion/react";
import { forwardRef, useContext, useRef, useState } from "react";
import { BoardMotionContext } from "./board-motion";
import { useLanguage } from "./i18n/language";
import { uncustomisedBuiltIn, workflowName } from "./i18n/workflow-names";
import { becameShipped } from "./moments";
import { recoveryStatus } from "./StintRecovery";
import { AgentAvatar } from "./ui/AgentAvatar";
import { Button } from "./ui/Button";
import { blur, scale, shift, spring, staggerDelay, tween, usePress } from "./ui/motion";
import { RollingNumber } from "./ui/RollingNumber";
import { SegmentedProgress } from "./ui/SegmentedProgress";
import { StatusChip } from "./ui/StatusChip";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/Tooltip";

const shippedMoments = new Set<string>();

export type BoardWorkItem = ProjectSnapshot["workItems"][number];

export const WorkItemCard = forwardRef<
  HTMLElement,
  {
    item: BoardWorkItem;
    milestone?: Milestone;
    onOpen: (slug: string) => void;
    attentionCount?: number;
    workflow?: WorkflowDefinition;
    agents?: AgentProfile[];
    selected?: boolean;
    index?: number;
    showWorkflow?: boolean;
  }
>(function WorkItemCard(
  {
    item,
    milestone,
    onOpen,
    attentionCount = 0,
    workflow,
    agents = [],
    selected = false,
    index = 0,
    showWorkflow = false,
  },
  ref,
) {
  const cardRef = useRef<HTMLElement | null>(null);
  const visible = useInView(cardRef, {
    initial: true,
    once: typeof IntersectionObserver === "undefined",
  });
  const { t } = useLanguage();
  const isPresent = useIsPresent();
  const { firstLoad, previous, skip, instant, reduced } = useContext(BoardMotionContext);
  const was = previous?.get(item.slug);
  const moment = useRef(false);
  const [ringDone, setRingDone] = useState(false);
  if (
    !moment.current &&
    !shippedMoments.has(item.slug) &&
    becameShipped(was, item.column === "ship" || !!item.merged)
  ) {
    moment.current = true;
    shippedMoments.add(item.slug);
  }
  const shipped = moment.current && !ringDone;
  const layout = !skip && !reduced && visible ? "position" : false;
  const arrival = !skip && (previous ? !previous.has(item.slug) : firstLoad);
  const { rest, press } = usePress("card", { onClick: () => onOpen(item.slug) });
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
    <m.article
      ref={(node) => {
        cardRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = node;
      }}
      data-exiting={isPresent ? undefined : item.slug}
      aria-hidden={isPresent ? undefined : true}
      layout={layout}
      data-layout={layout || "off"}
      layoutId={skip || reduced || !visible ? undefined : `card-${item.slug}`}
      initial={
        arrival
          ? reduced
            ? { opacity: 0 }
            : { opacity: 0, y: shift.arrive, filter: `blur(${blur.surface}px)` }
          : false
      }
      animate={{ opacity: 1, y: 0, filter: "blur(0px)", scale: press.animate.scale }}
      exit={{
        ...(reduced ? { opacity: 0 } : { opacity: 0, scale: scale.removedCard }),
        transition: skip ? { duration: 0 } : tween.dismiss,
      }}
      transition={{
        ...spring.arrive,
        delay: firstLoad && !previous ? staggerDelay(index) : 0,
        layout: skip || instant ? { duration: 0 } : spring.layout,
        scale: spring.press,
        opacity: skip ? { duration: 0 } : spring.arrive,
      }}
      className={`work-item relative min-w-0 rounded-2xl border border-transparent p-3 hover:border-ring focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring bg-muted ${status ? `status-edge status-edge-${status}` : ""} ${selected ? "ring-2 ring-ring" : ""}`}
      aria-label={`${item.slug}: ${item.title}`}
    >
      {shipped && (
        <m.span
          aria-hidden="true"
          onAnimationComplete={() => setRingDone(true)}
          className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-success"
          initial={reduced ? { opacity: 1 } : { scale: 0.9, opacity: 1 }}
          animate={reduced ? { opacity: 0 } : { scale: 1.06, opacity: 0 }}
          transition={spring.celebrate}
        />
      )}
      <div>
        <div className="flex items-start justify-between gap-2">
          <span
            className="work-item-id inline-flex min-w-0 flex-1 items-center gap-2 font-mono text-xs text-muted-foreground [&_svg]:size-icon-sm [&_svg]:shrink-0"
            title={typeName}
          >
            {showWorkflow && (
              <TypeIcon data-workflow-icon className="size-icon-sm shrink-0" aria-hidden="true" />
            )}
            <span className="sr-only">{typeName}: </span>
            <span className="truncate" data-truncate title={item.slug}>
              {item.slug}
            </span>
          </span>
          {item.milestone && (
            <span
              className="milestone-tag max-w-40 min-w-0 shrink truncate rounded-sm border border-border px-1 text-xs text-muted-foreground"
              data-truncate
              title={
                /^m\d+$/i.test(milestone?.id ?? item.milestone)
                  ? (milestone?.id ?? item.milestone).toUpperCase()
                  : (milestone?.name ?? item.milestone)
              }
            >
              {/^m\d+$/i.test(milestone?.id ?? item.milestone)
                ? (milestone?.id ?? item.milestone).toUpperCase()
                : (milestone?.name ?? item.milestone)}
            </span>
          )}
        </div>
        <h3 className="my-3 text-[length:var(--type-item-title)] leading-5 font-semibold break-words">
          <Button
            variant="link"
            type="button"
            className="work-item-open h-auto w-full justify-start whitespace-normal p-0 text-left text-[length:var(--type-item-title)] font-semibold after:absolute after:inset-0 after:rounded-2xl"
            data-work-item={isPresent ? item.slug : undefined}
            disabled={!isPresent}
            aria-label={t.card.open(item.slug, item.title)}
            aria-haspopup="dialog"
            {...rest}
            onPointerDown={press.onPointerDown}
            onPointerUp={press.onPointerUp}
            onPointerLeave={press.onPointerLeave}
            onPointerCancel={press.onPointerCancel}
            onKeyDown={press.onKeyDown}
            onKeyUp={press.onKeyUp}
            onBlur={press.onBlur}
            data-pressed={press["data-pressed"]}
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
            (item.activeStint || item.stints.length > 0) &&
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
          {(item.tickets.length > 0 ||
            (item.github && (!item.github.ticketsKnown || item.github.ticketsStale))) && (
            <div className="ticket-progress ml-auto flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              {item.github && (!item.github.ticketsKnown || item.github.ticketsStale) ? (
                <span>
                  {item.github.ticketsKnown ? t.card.ticketsOutdated : t.card.ticketsNotLoaded}
                </span>
              ) : (
                <>
                  <span>
                    <RollingNumber value={resolved} />/{item.tickets.length}{" "}
                    <span className="sr-only">{t.card.resolved}</span>
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
          )}
        </div>
      </div>
    </m.article>
  );
});
