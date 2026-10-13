// SPDX-License-Identifier: Apache-2.0
import {
  translateCoreText,
  readResponseJson,
  CoreTextError,
  useErrorText,
  useLanguage,
} from "./i18n/language";

import {
  builtInWorkflows,
  type AgentProfile,
  agentUnavailable,
  type Brief,
  briefAvailability,
  type Ticket,
  defaultPermissionLevel,
  isPermissionLevel,
  permissionPolicy,
  permissionLevels,
  type PermissionLevel,
  type WorkflowDefinitions,
} from "@stintwork/core";
import { Copy, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { BoardWorkItem } from "./WorkItemCard";
import "./brief-preview.css";

import { stageName as translatedStageName } from "./i18n/workflow-names";

export function TicketBriefPreview({
  item,
  ticket,
  workflows,
}: {
  item: BoardWorkItem;
  ticket: Ticket;
  workflows?: WorkflowDefinitions;
}) {
  return (
    <StintBriefAction
      key={`${item.slug}:${item.stage}:${ticket.number}`}
      item={item}
      ticket={ticket}
      workflows={workflows}
    />
  );
}

export function StageBriefPreview({
  item,
  workflows,
}: {
  item: BoardWorkItem;
  workflows?: WorkflowDefinitions;
}) {
  return <StintBriefAction key={`${item.slug}:${item.stage}`} item={item} workflows={workflows} />;
}

function StintBriefAction({
  item,
  ticket,
  workflows = builtInWorkflows,
}: {
  item: BoardWorkItem;
  ticket?: Ticket;
  workflows?: WorkflowDefinitions;
}) {
  const { t } = useLanguage();
  const workflow = workflows[item.workflow];
  const stage = workflow.stages.find(({ id }) => id === item.stage);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const reasonId = useId();
  const availability = briefAvailability(item, ticket, workflows);
  const reason = item.activeStint
    ? t.stints.alreadyActive
    : availability === null
      ? null
      : translateCoreText(availability, t);

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
        {t.stints.startStint}
      </button>
      {reason && (
        <p id={reasonId} className="muted">
          {reason}
        </p>
      )}
      {open && !reason && (
        <BriefPreviewSheet
          slug={item.slug}
          ticketNumber={ticket?.number ?? null}
          stageName={stage ? translatedStageName(workflow, stage, t) : ""}
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
  stageName,
  onClose,
}: {
  slug: string;
  ticketNumber: number | null;
  stageName: string;
  onClose: () => void;
}) {
  const { t, language } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const agentAvailabilityId = useId();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [agent, setAgent] = useState("");
  const [permissionLevel, setPermissionLevel] = useState<PermissionLevel>(defaultPermissionLevel);
  const [projectDefault, setProjectDefault] = useState<PermissionLevel>(defaultPermissionLevel);
  const [savingDefault, setSavingDefault] = useState(false);
  const [defaultError, setDefaultError] = useErrorText();
  const [error, setError] = useErrorText({
    loadBriefFailed: t.stints.loadBriefFailed,
    loadAgentsFailed: t.stints.loadAgentsFailed,
  });
  const [copyStatus, setCopyStatus] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useErrorText();
  const selectedAgent = agents.find(({ id }) => id === agent);
  const availability = selectedAgent ? agentUnavailable(selectedAgent) : null;
  const unavailable = selectedAgent
    ? availability === null
      ? null
      : translateCoreText(availability, t)
    : t.stints.agentNotRegistered;
  const policy = selectedAgent ? permissionPolicy(selectedAgent, permissionLevel) : null;
  const warnings = policy?.warnings ?? brief?.warnings ?? [];

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    closeButton.current?.focus();
    return () => element?.close();
  }, []);

  useEffect(() => {
    const request = new AbortController();
    async function load() {
      let fallback: "loadBriefFailed" | "loadAgentsFailed" = "loadBriefFailed";
      try {
        const [response, registryResponse] = await Promise.all([
          fetch(
            `/api/work-items/${encodeURIComponent(slug)}${ticketNumber === null ? "" : `/tickets/${ticketNumber}`}/brief-preview`,
            { signal: request.signal, cache: "no-store" },
          ),
          fetch("/api/agents", { signal: request.signal, cache: "no-store" }),
        ]);
        if (!response.ok) {
          const failure: { reason?: string } = await readResponseJson(response);
          throw new CoreTextError(failure, "");
        }
        if (!registryResponse.ok) {
          fallback = "loadAgentsFailed";
          const failure: { reason?: string } = await readResponseJson(registryResponse);
          throw new CoreTextError(failure, "");
        }
        const preview: Brief = await readResponseJson(response);
        const registry: { agents: AgentProfile[] } = await readResponseJson(registryResponse);
        if (!request.signal.aborted) {
          setBrief(preview);
          setAgents(registry.agents);
          setAgent(preview.agent ?? registry.agents[0]?.id ?? "");
          setPermissionLevel(preview.permissionLevel ?? defaultPermissionLevel);
          setProjectDefault(preview.permissionLevel ?? defaultPermissionLevel);
        }
      } catch (cause) {
        if (!request.signal.aborted) {
          setError(cause instanceof Error && cause.message ? cause : { key: fallback });
        }
      }
    }
    void load();
    return () => request.abort();
  }, [slug, ticketNumber, setError]);

  async function copy() {
    if (!brief) return;
    try {
      await navigator.clipboard.writeText(brief.prompt);
      setCopyStatus(t.stints.copied);
    } catch {
      setCopyStatus(t.stints.copyPromptFailed);
    }
  }

  async function start() {
    if (!brief || !agent || starting || unavailable) return;
    setStarting(true);
    setStartError("");
    try {
      const response = await fetch("/api/stints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workItem: slug, ticket: ticketNumber, agent, permissionLevel }),
      });
      if (!response.ok) {
        const failure: { reason?: string } = await readResponseJson(response);
        throw new CoreTextError(failure, t.stints.startFailed);
      }
      onClose();
    } catch (cause) {
      setStartError(cause instanceof Error ? cause : t.stints.startFailed);
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
            {t.stints.briefPreview}
          </h2>
          <button
            type="button"
            className="top-button"
            ref={closeButton}
            aria-label={t.stints.closeBrief}
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="mt-3 muted">
          {slug} · {ticketNumber === null ? stageName : t.stints.briefTicket(ticketNumber)}
        </p>
      </header>
      <div className="brief-preview-content">
        <section>
          <h3>{t.stints.agent}</h3>
          <label>
            <span className="sr-only">{t.stints.agent}</span>
            <select
              value={agent}
              onChange={(event) => setAgent(event.target.value)}
              aria-describedby={agentAvailabilityId}
              disabled={!agents.length || starting}
            >
              {agent && !selectedAgent && (
                <option value={agent} disabled>
                  {agent} — {t.stints.notRegistered}
                </option>
              )}
              {agents.map((candidate) => {
                const availability = agentUnavailable(candidate);
                const reason = availability === null ? null : translateCoreText(availability, t);
                return (
                  <option key={candidate.id} value={candidate.id} disabled={!!reason}>
                    {candidate.displayName}
                    {reason ? ` — ${reason}` : ""}
                  </option>
                );
              })}
            </select>
          </label>
          <p id={agentAvailabilityId} className="muted">
            {brief
              ? agents.length
                ? (unavailable ?? t.stints.chooseAgent)
                : t.stints.noAgents
              : t.stints.readingAgents}
          </p>
          {warnings.map((warning) => (
            <p key={warning.text} role="alert" className="warning">
              {translateCoreText(warning, t)}
            </p>
          ))}
        </section>
        <section>
          <h3>{t.stints.permissionLevel}</h3>
          <label>
            <span className="sr-only">{t.stints.permissionLevel}</span>
            <select
              value={permissionLevel}
              disabled={!brief || starting || savingDefault}
              onChange={(event) => {
                if (isPermissionLevel(event.target.value)) setPermissionLevel(event.target.value);
              }}
            >
              {permissionLevels.map((level) => (
                <option key={level} value={level}>
                  {t.stints.permissionLevels[level]}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            {t.stints.projectDefault} {t.stints.permissionLevels[projectDefault]}
          </p>
          <button
            type="button"
            className="top-button"
            disabled={!brief || starting || savingDefault || permissionLevel === projectDefault}
            onClick={async () => {
              setSavingDefault(true);
              setDefaultError("");
              try {
                const response = await fetch("/api/project/permission-level", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ permissionLevel }),
                });
                if (!response.ok) {
                  const body = await readResponseJson(response);
                  throw new CoreTextError(body, t.stints.saveDefaultFailed);
                }
                setProjectDefault(permissionLevel);
              } catch (error) {
                setDefaultError(error instanceof Error ? error : String(error));
              } finally {
                setSavingDefault(false);
              }
            }}
          >
            {t.stints.useProjectDefault}
          </button>
          {defaultError && (
            <p role="alert" className="warning">
              {defaultError}
            </p>
          )}
        </section>
        {error ? (
          <p role="alert" className="warning">
            {error}
          </p>
        ) : !brief ? (
          <p role="status" className="muted">
            {t.stints.readingBrief}
          </p>
        ) : (
          <>
            <section>
              <h3>{t.stints.skill}</h3>
              <code>{brief.skill ? brief.prompt.split("\n")[0] : t.stints.noSkill}</code>
            </section>
            <section>
              <h3>{t.stints.readFirst}</h3>
              <ul>
                {brief.pointers.map(({ path, reason }) => (
                  <li key={path}>
                    <code>{path}</code> — {translateCoreText(reason, t)}
                  </li>
                ))}
              </ul>
            </section>
            {brief.checkpointCommit && (
              <section>
                <h3>{t.stints.checkpointCommit}</h3>
                <code>{brief.checkpointCommit}</code>
              </section>
            )}
            <section>
              <h3>
                {t.stints.lastHandoff}
                {brief.lastHandoff && ` (${brief.lastHandoff.stint}, ${brief.lastHandoff.agent})`}
              </h3>
              {brief.lastHandoff ? (
                <dl className="brief-handoff">
                  <dt>{t.stints.whereStopped}</dt>
                  <dd>{brief.lastHandoff.stoppedAt}</dd>
                  <dt>{t.stints.whatUnresolved}</dt>
                  <dd>{brief.lastHandoff.unresolved}</dd>
                  <dt>{t.stints.nextStep}</dt>
                  <dd>{brief.lastHandoff.nextStep}</dd>
                </dl>
              ) : (
                <p>{t.stints.firstHandoff}</p>
              )}
            </section>
            {(brief.developerNotes ?? []).length > 0 && (
              <section>
                <h3>{t.stints.developerNotes}</h3>
                {brief.developerNotes?.map((note) => (
                  <div key={note.id}>
                    <time dateTime={note.at}>
                      {language === "en"
                        ? note.at
                        : new Intl.DateTimeFormat(language, {
                            dateStyle: "medium",
                            timeStyle: "medium",
                          }).format(new Date(note.at))}
                    </time>
                    <pre className="brief-prompt">{note.text}</pre>
                  </div>
                ))}
              </section>
            )}
            <section>
              <h3>{t.stints.changedPaths}</h3>
              {brief.changedPaths.length ? (
                <ul>
                  {brief.changedPaths.map((path) => (
                    <li key={path}>
                      <code>{path}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{t.stints.none}</p>
              )}
              <p className="muted">{t.stints.filesWin}</p>
            </section>
            <section>
              <div className="flex items-center justify-between gap-3">
                <h3>{t.stints.fullPrompt}</h3>
                <button type="button" className="top-button" onClick={copy}>
                  <Copy size={13} aria-hidden="true" /> {t.stints.copyPrompt}
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
          disabled={!brief || !agent || starting || !!error || !!unavailable}
          onClick={() => void start()}
        >
          {starting ? t.stints.starting : t.stints.start}
        </button>
      </footer>
    </dialog>
  );
}
