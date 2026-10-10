import { builtInWorkflows, type Milestone, type AgentProfile } from "@stintwork/core";
import { CheckCircle2, Circle, Copy, LockKeyhole, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TicketBriefPreview } from "./BriefPreview";
import { StintStream } from "./StintStream";
import { StopStint } from "./StopStint";
import { StintHistory } from "./StintHistory";
import type { BoardWorkItem } from "./WorkItemCard";

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
}: {
  item: BoardWorkItem;
  milestone?: Milestone;
  onClose: () => void;
  agents?: AgentProfile[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const workflow = builtInWorkflows[item.workflow];
  const type = item.type === "effort" ? "Effort" : workflow.name;

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
          </div>
        )}
      </header>
      {item.stage ? (
        <ol className="stage-rail" aria-label={`${workflow.name} workflow stages`}>
          {workflow.stages.map((stage) => (
            <li key={stage.id} aria-current={stage.id === item.stage ? "step" : undefined}>
              <span>{stage.name}</span>
              {stage.id === item.stage && item.inferred && <small>Inferred</small>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="drawer-stage-note muted">No stage declared for this work item.</p>
      )}
      <nav className="drawer-sections" aria-label="Work item sections">
        <a href="#drawer-spec">Spec</a>
        <a href="#drawer-tickets">
          Tickets <span className="count">{item.tickets.length}</span>
        </a>
      </nav>
      <div className="drawer-content">
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
                    <TicketBriefPreview item={item} ticket={ticket} />
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
      </div>
      <footer className="drawer-footer">
        <span>Local Markdown tracker</span>
        <span>
          <kbd>Esc</kbd> to return to Pipeline
        </span>
      </footer>
    </dialog>
  );
}
