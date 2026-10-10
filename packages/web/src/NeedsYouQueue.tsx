import type { ProjectSnapshot } from "@stintwork/core";
import { Bell, Inbox, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { PermissionAnswer } from "./PermissionAnswer";
import { HandoffAnswer } from "./HandoffAnswer";
import { GateView } from "./GateView";
import type { useAttentionAlerts } from "./useAttentionAlerts";
import "./needs-you.css";
import "./stint-stream.css";

export function NeedsYouQueue({
  snapshot,
  alerts,
  onClose,
  onOpenItem,
}: {
  snapshot: ProjectSnapshot;
  alerts: ReturnType<typeof useAttentionAlerts>;
  onClose: () => void;
  onOpenItem: (slug: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [now, setNow] = useState(Date.now);
  const [answerError, setAnswerError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  async function refreshAvailability() {
    setRefreshing(true);
    setAnswerError("");
    try {
      const response = await fetch("/api/agents?refresh=true");
      if (!response.ok) throw new Error("Could not refresh agent availability.");
    } catch {
      setAnswerError("Could not refresh agent availability. Try again.");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    closeButton.current?.focus();
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      clearInterval(timer);
      element?.close();
      document.getElementById("needs-you-trigger")?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="needs-you-queue"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="needs-you-heading">
        <div>
          <p className="eyebrow">Your attention</p>
          <h2 id={titleId}>
            <Inbox size={20} aria-hidden="true" />
            Needs you <span className="count">{snapshot.attentionItems.length}</span>
          </h2>
        </div>
        <button
          type="button"
          ref={closeButton}
          className="top-button"
          aria-label="Close Needs you"
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="needs-you-content">
        {snapshot.attentionItems.length === 0 && (
          <p role="status" className="needs-you-empty">
            Nothing needs you right now.
          </p>
        )}
        {snapshot.attentionItems.map((item) => {
          const profile = snapshot.agents.find((agent) => agent.id === item.agent);
          if (item.kind === "login-required")
            return (
              <article key={item.id} className="attention-item" aria-label={item.title}>
                <p className="eyebrow">Login required · {profile?.displayName ?? item.agent}</p>
                <h3>{item.title}</h3>
                <p>{item.details}</p>
                <pre>
                  <code>{item.loginCommand}</code>
                </pre>
                <button
                  type="button"
                  className="top-button"
                  disabled={refreshing}
                  onClick={() => void refreshAvailability()}
                >
                  {refreshing ? "Checking login…" : "Refresh agent availability"}
                </button>
              </article>
            );
          const workItem = snapshot.workItems.find((entry) => entry.slug === item.workItem);
          const minutes = Math.max(0, Math.floor((now - Date.parse(item.raisedAt)) / 60_000));
          return (
            <article key={item.id} className="attention-item" aria-label={item.title}>
              <p className="eyebrow">
                {item.kind === "permission"
                  ? "Permission"
                  : item.kind === "handoff-unresolved"
                    ? "Handoff"
                    : "Gate ready"}
                {item.agent && ` · ${profile?.displayName ?? item.agent}`}
              </p>
              <h3>{item.title}</h3>
              <button
                type="button"
                className="attention-work-item"
                onClick={() => {
                  onClose();
                  onOpenItem(item.workItem);
                }}
              >
                {workItem?.title ?? item.workItem} · {item.workItem}
              </button>
              <p className="muted">
                {item.ticket === null ? "No ticket" : `Ticket ${item.ticket}`}
                {item.stintId && (
                  <>
                    {" "}
                    · Stint <code>{item.stintId}</code>
                  </>
                )}
              </p>
              <p className="muted">
                <time dateTime={item.raisedAt} title={item.raisedAt}>
                  {item.raisedAt === "1970-01-01T00:00:00.000Z"
                    ? "No readiness time recorded"
                    : `Waiting ${minutes ? `${minutes} min` : "less than a minute"}`}
                </time>
              </p>
              {item.kind === "permission" && (
                <PermissionAnswer
                  stintId={item.stintId}
                  request={item}
                  profile={profile}
                  onError={(reason) => setAnswerError(reason ? `${item.title}: ${reason}` : "")}
                />
              )}
              {item.kind === "handoff-unresolved" && (
                <HandoffAnswer
                  item={item}
                  onError={(reason) => setAnswerError(reason ? `${item.title}: ${reason}` : "")}
                />
              )}
              {item.kind === "gate-ready" && workItem && (
                <GateView item={workItem} warnings={snapshot.warnings} />
              )}
            </article>
          );
        })}
      </div>
      <footer className="needs-you-footer">
        {answerError && (
          <p role="alert" className="warning">
            {answerError}
          </p>
        )}
        <button
          type="button"
          className="top-button"
          disabled={!alerts.supported || alerts.requesting}
          aria-pressed={alerts.enabled}
          onClick={() => void alerts.toggle()}
        >
          <Bell size={14} aria-hidden="true" />
          {alerts.enabled ? "Disable browser notifications" : "Enable browser notifications"}
        </button>
        {!alerts.supported && (
          <p className="muted">Browser notifications are not supported here.</p>
        )}
        {alerts.error && (
          <p role="alert" className="warning">
            {alerts.error}
          </p>
        )}
      </footer>
    </dialog>
  );
}
