// SPDX-License-Identifier: Apache-2.0
import type { Milestone, ProjectSnapshot, WorkflowDefinition } from "@stintwork/core";
import { Bug, Info, Layers3, LockKeyhole, Sparkles, Zap } from "lucide-react";
import { useId } from "react";
import "./stint-stream.css";
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
  const tooltipId = useId();
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
    <article className="work-item" aria-label={`${item.slug}: ${item.title}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="work-item-id" title={typeName}>
          <TypeIcon size={13} aria-hidden="true" />
          <span className="sr-only">{typeName}: </span>
          <span className="break-all">{item.slug}</span>
        </span>
        {item.milestone && (
          <span className="milestone-tag" title={milestone?.name}>
            {milestone?.id ?? item.milestone}
          </span>
        )}
      </div>
      <h3 className="my-3 text-[13px] leading-5 font-medium break-words">
        <button
          type="button"
          className="work-item-open"
          data-work-item={item.slug}
          aria-label={t.card.open(item.slug, item.title)}
          aria-haspopup="dialog"
          onClick={() => onOpen(item.slug)}
        >
          {item.title}
        </button>
      </h3>
      {item.activeStint?.status === "running" && (
        <span className="stint-running" role="status">
          <span className="stint-running-dot" aria-hidden="true" />
          {t.card.running}
        </span>
      )}
      {item.merged && <span className="badge success">{t.card.shipped}</span>}
      {(blocked || item.inferred || attentionCount > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {attentionCount > 0 && (
            <span
              role="status"
              className="badge warning"
              aria-label={t.card.attention(attentionCount)}
            >
              {t.card.needsYou(attentionCount)}
            </span>
          )}
          {blocked && (
            <span className="badge warning">
              <LockKeyhole size={11} aria-hidden="true" />
              {t.card.blocked}
            </span>
          )}
          {item.inferred && (
            <span className="inference">
              <button type="button" className="badge muted" aria-describedby={tooltipId}>
                <Info size={11} aria-hidden="true" />
                {t.card.inferred}
              </button>
              <span className="inference-tooltip" role="tooltip" id={tooltipId}>
                {t.card.inference}
                {reason}
                {item.workflow === "bug" && t.card.bugInference}
              </span>
            </span>
          )}
        </div>
      )}
      <div className="ticket-progress">
        <span>
          {resolved}/{item.tickets.length} <span className="sr-only">{t.card.resolved}</span>
          {t.card.tickets}
        </span>
        <progress
          aria-label={t.card.progress(item.slug)}
          max={Math.max(1, item.tickets.length)}
          value={resolved}
        />
      </div>
    </article>
  );
}
