// SPDX-License-Identifier: Apache-2.0
import type { AttentionItem, ProjectSnapshot } from "@stintwork/core";
import { Bell, Inbox, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { CheckpointWarnings } from "./CheckpointWarnings";
import { PermissionAnswer } from "./PermissionAnswer";
import { HandoffAnswer } from "./HandoffAnswer";
import { MemoryProposal } from "./MemoryProposal";
import { GateView } from "./GateView";
import { attentionTitle, type useAttentionAlerts } from "./useAttentionAlerts";
import { renderCoreText, useCoreTextError, useLanguage } from "./i18n/language";
import { stageName } from "./i18n/workflow-names";
import { en } from "./i18n/en";
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
  const { t, language } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [now, setNow] = useState(Date.now);
  const [answerError, setAnswerError] = useCoreTextError();
  const [answerItem, setAnswerItem] = useState<AttentionItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function refreshAvailability() {
    setRefreshing(true);
    setAnswerError("");
    setAnswerItem(null);
    try {
      const response = await fetch("/api/agents?refresh=true");
      if (!response.ok) throw new Error(t.needsYou.refreshFailed);
    } catch {
      setAnswerError(t.needsYou.refreshRetry);
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
          <p className="eyebrow">{t.needsYou.yourAttention}</p>
          <h2 id={titleId}>
            <Inbox size={20} aria-hidden="true" />
            {t.needsYou.heading} <span className="count">{snapshot.attentionItems.length}</span>
          </h2>
        </div>
        <button
          type="button"
          ref={closeButton}
          className="top-button"
          aria-label={t.needsYou.close}
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="needs-you-content">
        {snapshot.attentionItems.length === 0 && (
          <p role="status" className="needs-you-empty">
            {t.needsYou.empty}
          </p>
        )}
        {snapshot.attentionItems.map((item) => {
          const profile = snapshot.agents.find((agent) => agent.id === item.agent);
          const workItem = snapshot.workItems.find((entry) => entry.slug === item.workItem);
          const workflow = workItem && snapshot.workflows[workItem.workflow];
          const stage =
            item.kind === "gate-ready" && workflow
              ? workflow.stages.find((stage) => stage.id === item.stage)
              : undefined;
          const title = attentionTitle(
            item,
            t,
            language,
            profile?.displayName ?? item.agent ?? "",
            workflow && stage ? stageName(workflow, stage, t) : undefined,
          );
          if (item.kind === "login-required")
            return (
              <article key={item.id} className="attention-item" aria-label={title}>
                <p className="eyebrow">
                  {t.needsYou.loginRequired} · {profile?.displayName ?? item.agent}
                </p>
                <h3>{title}</h3>
                <p>
                  {language === "en"
                    ? item.details
                    : t.needsYou.loginInstructions(item.loginCommand)}
                </p>
                {language !== "en" &&
                  item.details !== en.needsYou.loginInstructions(item.loginCommand) && (
                    <p>
                      {renderCoreText(
                        profile?.availability?.reason === item.details
                          ? profile.availability.reasonMessage
                          : undefined,
                        item.details,
                        t,
                      )}
                    </p>
                  )}
                <pre>
                  <code>{item.loginCommand}</code>
                </pre>
                <button
                  type="button"
                  className="top-button"
                  disabled={refreshing}
                  onClick={() => void refreshAvailability()}
                >
                  {refreshing ? t.needsYou.checkingLogin : t.needsYou.refreshAvailability}
                </button>
              </article>
            );
          const minutes = Math.max(0, Math.floor((now - Date.parse(item.raisedAt)) / 60_000));
          return (
            <article key={item.id} className="attention-item" aria-label={title}>
              <p className="eyebrow">
                {item.kind === "permission"
                  ? t.needsYou.permission
                  : item.kind === "handoff-unresolved"
                    ? t.needsYou.handoff
                    : item.kind === "checkpoint-warning"
                      ? t.needsYou.checkpoint
                      : item.kind === "memory-proposal"
                        ? t.needsYou.memoryProposal
                        : t.needsYou.gateReady}
                {item.agent && ` · ${profile?.displayName ?? item.agent}`}
              </p>
              <h3>{title}</h3>
              {item.kind === "checkpoint-warning" && (
                <>
                  <p>
                    {language === "en"
                      ? item.details
                      : item.warnings.some((warning) => !warning.excluded)
                        ? t.needsYou.committedRemediation
                        : t.needsYou.excludedRemediation}
                  </p>
                  <CheckpointWarnings warnings={item.warnings} />
                </>
              )}
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
                {item.ticket === null ? t.needsYou.noTicket : t.needsYou.ticket(item.ticket)}
                {item.stintId && (
                  <>
                    {" "}
                    · {t.needsYou.stint} <code>{item.stintId}</code>
                  </>
                )}
              </p>
              <p className="muted">
                <time dateTime={item.raisedAt} title={item.raisedAt}>
                  {item.raisedAt === "1970-01-01T00:00:00.000Z"
                    ? t.needsYou.noReadinessTime
                    : t.needsYou.waiting(minutes)}
                </time>
              </p>
              {item.kind === "permission" && (
                <PermissionAnswer
                  stintId={item.stintId}
                  request={item}
                  profile={profile}
                  onError={(reason) => {
                    setAnswerError(reason);
                    setAnswerItem(reason ? item : null);
                  }}
                />
              )}
              {item.kind === "handoff-unresolved" && (
                <HandoffAnswer
                  item={item}
                  onError={(reason) => {
                    setAnswerError(reason);
                    setAnswerItem(reason ? item : null);
                  }}
                />
              )}
              {item.kind === "memory-proposal" && (
                <MemoryProposal
                  item={item}
                  onError={(reason) => {
                    setAnswerError(reason);
                    setAnswerItem(reason ? item : null);
                  }}
                />
              )}
              {item.kind === "gate-ready" && workItem && (
                <GateView
                  item={workItem}
                  warnings={snapshot.warnings}
                  workflows={snapshot.workflows}
                />
              )}
            </article>
          );
        })}
      </div>
      <footer className="needs-you-footer">
        {answerError && (
          <p role="alert" className="warning">
            {answerItem && `${attentionTitle(answerItem, t, language)}: `}
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
          {alerts.enabled ? t.needsYou.disableNotifications : t.needsYou.enableNotifications}
        </button>
        {!alerts.supported && <p className="muted">{t.needsYou.notificationsUnsupported}</p>}
        {alerts.error && (
          <p role="alert" className="warning">
            {alerts.error}
          </p>
        )}
      </footer>
    </dialog>
  );
}
