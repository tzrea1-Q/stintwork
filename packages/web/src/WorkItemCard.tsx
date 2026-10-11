import type { Milestone, ProjectSnapshot } from "@stintwork/core";
import { Bug, Info, Layers3, LockKeyhole, Sparkles, Zap } from "lucide-react";
import { useId } from "react";
import "./stint-stream.css";

export type BoardWorkItem = ProjectSnapshot["workItems"][number];

export function WorkItemCard({
  item,
  milestone,
  onOpen,
  attentionCount = 0,
  workflowName,
}: {
  item: BoardWorkItem;
  milestone?: Milestone;
  onOpen: (slug: string) => void;
  attentionCount?: number;
  workflowName?: string;
}) {
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
    feature: "Feature",
    bug: "Bug",
    quick: "Quick work item",
    effort: "Effort",
  };
  const TypeIcon = Object.hasOwn(icons, type) ? icons[type] : Sparkles;
  const typeName = Object.hasOwn(labels, type) ? labels[type] : (workflowName ?? item.workflow);
  const reason = item.tickets.length
    ? open.length
      ? "Some tickets are open."
      : "All tickets are resolved."
    : item.spec
      ? "A spec exists, with no tickets yet."
      : "No spec or tickets exist yet.";

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
          aria-label={`Open ${item.slug}: ${item.title}`}
          aria-haspopup="dialog"
          onClick={() => onOpen(item.slug)}
        >
          {item.title}
        </button>
      </h3>
      {item.activeStint?.status === "running" && (
        <span className="stint-running" role="status">
          <span className="stint-running-dot" aria-hidden="true" />
          Stint running
        </span>
      )}
      {item.merged && <span className="badge success">Shipped</span>}
      {(blocked || item.inferred || attentionCount > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {attentionCount > 0 && (
            <span
              role="status"
              className="badge warning"
              aria-label={`${attentionCount} open attention items`}
            >
              Needs you · {attentionCount}
            </span>
          )}
          {blocked && (
            <span className="badge warning">
              <LockKeyhole size={11} aria-hidden="true" />
              Blocked
            </span>
          )}
          {item.inferred && (
            <span className="inference">
              <button type="button" className="badge muted" aria-describedby={tooltipId}>
                <Info size={11} aria-hidden="true" />
                Inferred
              </button>
              <span className="inference-tooltip" role="tooltip" id={tooltipId}>
                Stage inferred from project files because no valid workflow.yaml declares it.{" "}
                {reason}
                {item.workflow === "bug" && " The work item slug selects the Bug workflow."}
              </span>
            </span>
          )}
        </div>
      )}
      <div className="ticket-progress">
        <span>
          {resolved}/{item.tickets.length} <span className="sr-only">resolved </span>tickets
        </span>
        <progress
          aria-label={`${item.slug} resolved tickets`}
          max={Math.max(1, item.tickets.length)}
          value={resolved}
        />
      </div>
    </article>
  );
}
