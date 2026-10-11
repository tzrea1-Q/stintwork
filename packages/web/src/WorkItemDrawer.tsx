import {
  builtInWorkflows,
  type WorkflowDefinitions,
  type Milestone,
  type AgentProfile,
  type Warning,
} from "@stintwork/core";
import { CheckCircle2, Circle, Copy, LockKeyhole, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { StageBriefPreview, TicketBriefPreview } from "./BriefPreview";
import { StintStream } from "./StintStream";
import { StopStint } from "./StopStint";
import { StintHistory } from "./StintHistory";
import type { BoardWorkItem } from "./WorkItemCard";
import { StageAgentRail } from "./StageAgentRail";
import { GateView } from "./GateView";
import { ReviewOverlay } from "./ReviewOverlay";
import { ChecksPanel } from "./ChecksPanel";
import { ShipActions } from "./ShipActions";
import { FindingCard, FindingsRail, reviewFindings } from "./ReviewFindings";

function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
}

function FilePath({ path }: { path: string }) {
  const [message, setMessage] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(path);
      setMessage("Copied");
    } catch {
      setMessage("Could not copy. Select the path to copy it manually.");
    }
  }

  return (
    <div className="file-path">
      <code>{path}</code>
      <button type="button" onClick={copy} aria-label={`Copy ${path}`}>
        <Copy size={13} aria-hidden="true" />
      </button>
      <span className="copy-status" role="status">
        {message}
      </span>
    </div>
  );
}

export function WorkItemDrawer({
  item,
  milestone,
  onClose,
  agents = [],
  warnings = [],
  workflows = builtInWorkflows,
}: {
  item: BoardWorkItem;
  milestone?: Milestone;
  onClose: () => void;
  agents?: AgentProfile[];
  warnings?: Warning[];
  workflows?: WorkflowDefinitions;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [reviewOpen, setReviewOpen] = useState(false);
  const workflow = workflows[item.workflow];
  const stage = workflow.stages.find(({ id }) => id === item.stage);
  const type = item.type === "effort" ? "Effort" : workflow.name;
  const reviewStageId = workflow.stages.find(({ gate }) => gate === "evidence")?.id;
  const archived = reviewFindings(item.stints, item.reviewDecisions, item, reviewStageId);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    closeButton.current?.focus();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="work-item-drawer"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="drawer-header">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">
            {type} / <code>{item.slug}</code>
          </p>
          <button
            type="button"
            className="top-button"
            ref={closeButton}
            onClick={onClose}
            aria-label="Close work item"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <h2 id={titleId} className="mt-3 text-2xl font-medium break-words">
          {item.title}
        </h2>
        <p className="mt-3 text-xs muted">
          Milestone: {milestone?.name ?? item.milestone ?? "No milestone"}
        </p>
        {item.worktreePath && (
          <div className="mt-3">
            <p className="text-xs muted">Work item files live in this worktree:</p>
            <FilePath path={item.worktreePath} />
            <button type="button" className="top-button" onClick={() => setReviewOpen(true)}>
              Open review
            </button>
          </div>
        )}
      </header>
      {item.stage && !item.merged ? (
        <StageAgentRail key={item.slug} item={item} workflows={workflows} />
      ) : !item.merged ? (
        <p className="drawer-stage-note muted">No stage declared for this work item.</p>
      ) : null}
      <nav className="drawer-sections" aria-label="Work item sections">
        <a href="#drawer-spec">Spec</a>
        <a href="#drawer-tickets">
          Tickets <span className="count">{item.tickets.length}</span>
        </a>
      </nav>
      <div className="drawer-content">
        <ShipActions item={item} workflows={workflows} />
        {!item.merged && (
          <GateView
            key={`${item.slug}:${item.stage}`}
            item={item}
            warnings={warnings}
            workflows={workflows}
          />
        )}
        {item.stage && !item.merged && (!item.tickets.length || stage?.column !== "implement") && (
          <section aria-label="Stage stint">
            <h3 className="drawer-section-heading">
              {workflow.stages.find((stage) => stage.id === item.stage)?.name} stint
            </h3>
            <StageBriefPreview item={item} workflows={workflows} />
          </section>
        )}
        <section id="drawer-spec" aria-labelledby="drawer-spec-title">
          <h3 id="drawer-spec-title" className="drawer-section-heading">
            Spec
          </h3>
          {item.spec ? (
            <>
              <FilePath path={item.spec.path} />
              <Markdown text={item.spec.text} />
            </>
          ) : (
            <p className="muted">No spec yet.</p>
          )}
        </section>
        <section id="drawer-tickets" aria-labelledby="drawer-tickets-title">
          <h3 id="drawer-tickets-title" className="drawer-section-heading">
            Tickets <span className="count">{item.tickets.length}</span>
          </h3>
          {item.tickets.length ? (
            <ol className="drawer-tickets">
              {item.tickets.map((ticket) => {
                const StatusIcon = ticket.resolved
                  ? CheckCircle2
                  : ticket.blocked
                    ? LockKeyhole
                    : Circle;
                return (
                  <li key={ticket.path}>
                    <details className="drawer-ticket">
                      <summary>
                        <StatusIcon
                          size={15}
                          className={
                            ticket.resolved ? "success" : ticket.blocked ? "warning" : "muted"
                          }
                          aria-hidden="true"
                        />
                        <span className="ticket-title">
                          <strong>
                            {String(ticket.number).padStart(2, "0")} · {ticket.title}
                          </strong>
                          <small className={ticket.blocked ? "warning" : "muted"}>
                            {ticket.status}
                            {ticket.blockedBy.length > 0 && (
                              <>
                                {" "}
                                · Blocked by{" "}
                                {ticket.blockedBy
                                  .map((number) => String(number).padStart(2, "0"))
                                  .join(", ")}
                              </>
                            )}
                          </small>
                        </span>
                      </summary>
                      <Markdown text={ticket.body} />
                    </details>
                    <FilePath path={ticket.path} />
                    {!item.merged && (
                      <TicketBriefPreview item={item} ticket={ticket} workflows={workflows} />
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="muted">No tickets yet.</p>
          )}
        </section>
        {item.activeStint && (
          <section aria-labelledby="drawer-live-stint-title">
            <h3 id="drawer-live-stint-title" className="drawer-section-heading">
              Live stint
            </h3>
            <p role="status">
              {item.activeStint.agent} · Ticket {item.activeStint.ticket} ·{" "}
              {item.activeStint.status}
            </p>
            <StopStint key={item.activeStint.id} stintId={item.activeStint.id} />
            <StintStream
              key={item.activeStint.id}
              stint={item.activeStint}
              profile={agents.find((agent) => agent.id === item.activeStint?.agent)}
            />
          </section>
        )}
        <section aria-labelledby="drawer-stint-history-title">
          <h3 id="drawer-stint-history-title" className="drawer-section-heading">
            Stint history
          </h3>
          <StintHistory stints={item.stints} />
        </section>
        {item.merged && (
          <>
            <section aria-label="Review findings">
              <h3 className="drawer-section-heading">Review findings</h3>
              <FindingsRail {...archived} anchor={(finding) => `archived-${finding.id}`} />
              {archived.findings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} anchor={`archived-${finding.id}`} />
              ))}
            </section>
            <section aria-label="Recorded checks">
              <h3 className="drawer-section-heading">Checks</h3>
              <ChecksPanel item={item} />
            </section>
          </>
        )}
      </div>
      <footer className="drawer-footer">
        <span>Local Markdown tracker</span>
        <span>
          <kbd>Esc</kbd> to return to Pipeline
        </span>
      </footer>
      {reviewOpen && (
        <ReviewOverlay
          reviewStageId={reviewStageId}
          item={item}
          onClose={() => setReviewOpen(false)}
          checks={<ChecksPanel item={item} />}
        />
      )}
    </dialog>
  );
}
