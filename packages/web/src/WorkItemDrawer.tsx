// SPDX-License-Identifier: Apache-2.0
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
import { LanguageSelect } from "./i18n/LanguageSelect";
import { useLanguage } from "./i18n/language";
import { stageName, workflowName } from "./i18n/workflow-names";

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
  const { t } = useLanguage();
  const [message, setMessage] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(path);
      setMessage(t.stints.copied);
    } catch {
      setMessage(t.stints.copyPathFailed);
    }
  }

  return (
    <div className="file-path">
      <code>{path}</code>
      <button type="button" onClick={copy} aria-label={t.stints.copyPath(path)}>
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
  onCustomiseWorkflow,
}: {
  item: BoardWorkItem;
  milestone?: Milestone;
  onClose: () => void;
  agents?: AgentProfile[];
  warnings?: Warning[];
  workflows?: WorkflowDefinitions;
  onCustomiseWorkflow?: (id: string) => void;
}) {
  const { t } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [reviewOpen, setReviewOpen] = useState(false);
  const workflow = workflows[item.workflow];
  const stage = workflow.stages.find(({ id }) => id === item.stage);
  const type = item.type === "effort" ? t.card.effort : workflowName(workflow, t);
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
          <p className="eyebrow min-w-0 break-words">
            {type} / <code>{item.slug}</code>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSelect />
            <button
              type="button"
              className="top-button"
              ref={closeButton}
              onClick={onClose}
              aria-label={t.stints.closeWorkItem}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        <h2 id={titleId} className="mt-3 text-2xl font-medium break-words">
          {item.title}
        </h2>
        <p className="mt-3 text-xs muted">
          {t.stints.milestone} {milestone?.name ?? item.milestone ?? t.stints.noMilestone}
        </p>
        <p className="mt-3 text-xs muted">
          {t.stints.workflow} {workflowName(workflow, t)}{" "}
          {onCustomiseWorkflow && Object.hasOwn(builtInWorkflows, item.workflow) && (
            <button
              type="button"
              className="top-button"
              onClick={() => onCustomiseWorkflow(item.workflow)}
            >
              {t.stints.customise}
            </button>
          )}
        </p>
        {item.worktreePath && (
          <div className="mt-3">
            <p className="text-xs muted">{t.stints.worktreeFiles}</p>
            <FilePath path={item.worktreePath} />
            <button type="button" className="top-button" onClick={() => setReviewOpen(true)}>
              {t.stints.openReview}
            </button>
          </div>
        )}
      </header>
      {item.stage && !item.merged ? (
        <StageAgentRail key={item.slug} item={item} workflows={workflows} />
      ) : !item.merged ? (
        <p className="drawer-stage-note muted">{t.stints.noStage}</p>
      ) : null}
      <nav className="drawer-sections" aria-label={t.stints.sections}>
        <a href="#drawer-spec">{t.stints.spec}</a>
        <a href="#drawer-tickets">
          {t.stints.tickets} <span className="count">{item.tickets.length}</span>
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
          <section aria-label={t.stints.stageStintSection}>
            <h3 className="drawer-section-heading">
              {t.stints.stageStint(stage ? stageName(workflow, stage, t) : "")}
            </h3>
            <StageBriefPreview item={item} workflows={workflows} />
          </section>
        )}
        <section id="drawer-spec" aria-labelledby="drawer-spec-title">
          <h3 id="drawer-spec-title" className="drawer-section-heading">
            {t.stints.spec}
          </h3>
          {item.spec ? (
            <>
              <FilePath path={item.spec.path} />
              <Markdown text={item.spec.text} />
            </>
          ) : (
            <p className="muted">{t.stints.noSpec}</p>
          )}
        </section>
        <section id="drawer-tickets" aria-labelledby="drawer-tickets-title">
          <h3 id="drawer-tickets-title" className="drawer-section-heading">
            {t.stints.tickets} <span className="count">{item.tickets.length}</span>
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
                                {t.stints.blockedBy}{" "}
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
            <p className="muted">{t.stints.noTickets}</p>
          )}
        </section>
        {item.activeStint && (
          <section aria-labelledby="drawer-live-stint-title">
            <h3 id="drawer-live-stint-title" className="drawer-section-heading">
              {t.stints.liveStint}
            </h3>
            <p role="status">
              {item.activeStint.agent} · {t.stints.ticket(item.activeStint.ticket)} ·{" "}
              {t.stints.statuses[item.activeStint.status]}
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
            {t.stints.history}
          </h3>
          <StintHistory stints={item.stints} />
        </section>
        {item.merged && (
          <>
            <section aria-label={t.stints.reviewFindings}>
              <h3 className="drawer-section-heading">{t.stints.reviewFindings}</h3>
              <FindingsRail {...archived} anchor={(finding) => `archived-${finding.id}`} />
              {archived.findings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} anchor={`archived-${finding.id}`} />
              ))}
            </section>
            <section aria-label={t.stints.recordedChecks}>
              <h3 className="drawer-section-heading">{t.stints.checks}</h3>
              <ChecksPanel item={item} />
            </section>
          </>
        )}
      </div>
      <footer className="drawer-footer">
        <span>{t.stints.tracker}</span>
        <span>
          <kbd>Esc</kbd>
          {t.stints.returnToPipeline}
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
