import { type Brief, briefUnavailableReason, type Ticket } from "@stintwork/core";
import { Copy, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { BoardWorkItem } from "./WorkItemCard";
import "./brief-preview.css";

export function TicketBriefPreview({ item, ticket }: { item: BoardWorkItem; ticket: Ticket }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const reasonId = useId();
  const reason = item.activeStint
    ? "A stint is already active for this work item."
    : briefUnavailableReason(item, ticket);

  useEffect(() => {
    if (reason) setOpen(false);
  }, [reason]);

  return (
    <div className="brief-action">
      <button
        type="button"
        className="top-button"
        ref={trigger}
        disabled={reason !== null}
        aria-describedby={reason ? reasonId : undefined}
        onClick={() => setOpen(true)}
      >
        Start stint
      </button>
      {reason && (
        <p id={reasonId} className="muted">
          {reason}
        </p>
      )}
      {open && !reason && (
        <BriefPreviewSheet
          slug={item.slug}
          ticketNumber={ticket.number}
          onClose={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        />
      )}
    </div>
  );
}

function BriefPreviewSheet({
  slug,
  ticketNumber,
  onClose,
}: {
  slug: string;
  ticketNumber: number;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const agentAvailabilityId = useId();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    closeButton.current?.focus();
    return () => element?.close();
  }, []);

  useEffect(() => {
    const request = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          `/api/work-items/${encodeURIComponent(slug)}/tickets/${ticketNumber}/brief-preview`,
          { signal: request.signal, cache: "no-store" },
        );
        if (!response.ok) {
          const failure: { reason?: string } = await response.json();
          throw new Error(failure.reason ?? "Could not load the brief preview.");
        }
        const preview: Brief = await response.json();
        if (!request.signal.aborted) setBrief(preview);
      } catch (cause) {
        if (!request.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Could not load the brief preview.");
        }
      }
    }
    void load();
    return () => request.abort();
  }, [slug, ticketNumber]);

  async function copy() {
    if (!brief) return;
    try {
      await navigator.clipboard.writeText(brief.prompt);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Could not copy. Select the prompt to copy it manually.");
    }
  }

  async function start() {
    if (!brief || starting) return;
    setStarting(true);
    setStartError("");
    try {
      const response = await fetch("/api/stints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workItem: slug, ticket: ticketNumber, agent: "codex" }),
      });
      if (!response.ok) {
        const failure: { reason?: string } = await response.json();
        throw new Error(failure.reason ?? "Could not start the stint.");
      }
      onClose();
    } catch (cause) {
      setStartError(cause instanceof Error ? cause.message : "Could not start the stint.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="brief-preview-sheet"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
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
          <h2 id={titleId} className="text-xl font-medium">
            Brief preview
          </h2>
          <button
            type="button"
            className="top-button"
            ref={closeButton}
            aria-label="Close brief preview"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="mt-3 muted">
          {slug} · Ticket {String(ticketNumber).padStart(2, "0")}
        </p>
      </header>
      <div className="brief-preview-content">
        <section>
          <h3>Agent</h3>
          <label>
            <span className="sr-only">Agent</span>
            <select defaultValue="codex" aria-describedby={agentAvailabilityId}>
              <option value="codex">Codex</option>
              <option value="claude" disabled>
                Claude Code — coming in M3
              </option>
              <option value="grok" disabled>
                Grok Build — coming in M3
              </option>
            </select>
          </label>
          <p id={agentAvailabilityId} className="muted">
            Codex is available. Claude Code and Grok Build are coming in M3.
          </p>
        </section>
        {error ? (
          <p role="alert" className="warning">
            {error}
          </p>
        ) : !brief ? (
          <p role="status" className="muted">
            Reading the brief…
          </p>
        ) : (
          <>
            <section>
              <h3>Skill</h3>
              <code>{brief.skill ? brief.prompt.split("\n")[0] : "None — Do has no skill."}</code>
            </section>
            <section>
              <h3>Read first</h3>
              <ul>
                {brief.pointers.map(({ path, reason }) => (
                  <li key={path}>
                    <code>{path}</code> — {reason}
                  </li>
                ))}
              </ul>
            </section>
            {brief.checkpointCommit && (
              <section>
                <h3>Checkpoint commit</h3>
                <code>{brief.checkpointCommit}</code>
              </section>
            )}
            <section>
              <h3>
                Last handoff
                {brief.lastHandoff && ` (${brief.lastHandoff.stint}, ${brief.lastHandoff.agent})`}
              </h3>
              {brief.lastHandoff ? (
                <dl className="brief-handoff">
                  <dt>Where it stopped</dt>
                  <dd>{brief.lastHandoff.stoppedAt}</dd>
                  <dt>What is unresolved</dt>
                  <dd>{brief.lastHandoff.unresolved}</dd>
                  <dt>Suggested next step</dt>
                  <dd>{brief.lastHandoff.nextStep}</dd>
                </dl>
              ) : (
                <p>None — start from the project conventions and work item scope.</p>
              )}
            </section>
            <section>
              <h3>Changed since the last handoff</h3>
              {brief.changedPaths.length ? (
                <ul>
                  {brief.changedPaths.map((path) => (
                    <li key={path}>
                      <code>{path}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>None.</p>
              )}
              <p className="muted">Where the handoff and the files disagree, the files win.</p>
            </section>
            <section>
              <div className="flex items-center justify-between gap-3">
                <h3>Full prompt</h3>
                <button type="button" className="top-button" onClick={copy}>
                  <Copy size={13} aria-hidden="true" /> Copy prompt
                </button>
              </div>
              <span role="status" className="copy-status">
                {copyStatus}
              </span>
              <pre className="brief-prompt">{brief.prompt}</pre>
            </section>
          </>
        )}
      </div>
      <footer className="drawer-footer">
        {startError && (
          <p role="alert" className="warning">
            {startError}
          </p>
        )}
        <button
          type="button"
          className="top-button"
          disabled={!brief || starting || !!error}
          onClick={() => void start()}
        >
          {starting ? "Starting…" : "Start"}
        </button>
      </footer>
    </dialog>
  );
}
