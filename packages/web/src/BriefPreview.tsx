// SPDX-License-Identifier: Apache-2.0
import { CodeBlock } from "./ui/CodeBlock";
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
import { Button } from "./ui/Button";
import { SelectField } from "./ui/SelectField";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/Dialog";

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
    <div className="brief-action mb-4 flex flex-wrap items-center gap-3 text-sm">
      <Button
        disabled={reason !== null}
        aria-describedby={reason ? reasonId : undefined}
        onClick={() => setOpen(true)}
      >
        {t.stints.startStint}
      </Button>
      {reason && (
        <p id={reasonId} className="muted text-muted">
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
  const closeButton = useRef<HTMLButtonElement>(null);
  const agentAvailabilityId = useId();
  const selectId = useId();
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="brief-preview-sheet flex h-[calc(100dvh-32px)] w-3xl flex-col p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeButton.current?.focus();
        }}
      >
        <header className="shrink-0 border-b border-border p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <DialogTitle className="text-xl font-medium">{t.stints.briefPreview}</DialogTitle>
            <Button
              variant="ghost"
              ref={closeButton}
              aria-label={t.stints.closeBrief}
              onClick={onClose}
            >
              <X aria-hidden="true" /> {t.stints.closeBrief}
            </Button>
          </div>
          <DialogDescription className="mt-3 break-words text-muted">
            {slug} · {ticketNumber === null ? stageName : t.stints.briefTicket(ticketNumber)}
          </DialogDescription>
        </header>
        <div className="brief-preview-content min-h-0 flex-1 overflow-auto overscroll-contain p-4 text-sm leading-relaxed [overflow-wrap:anywhere] sm:p-6 [&_section+section]:mt-6 [&_section+section]:border-t [&_section+section]:border-border [&_section+section]:pt-5 [&_h3]:mb-2 [&_h3]:font-medium [&_ul]:list-disc [&_ul]:pl-5 [&_dt]:mt-2 [&_dt]:font-medium [&_dd]:whitespace-pre-wrap [&_pre]:mt-2">
          <section>
            <h3>{t.stints.agent}</h3>
            <label htmlFor={`${selectId}-agent`}>
              <span className="sr-only">{t.stints.agent}</span>
              <SelectField
                id={`${selectId}-agent`}
                aria-label={t.stints.agent}
                value={agent}
                onValueChange={setAgent}
                aria-describedby={agentAvailabilityId}
                disabled={!agents.length || starting}
                options={[
                  ...(agent && !selectedAgent
                    ? [
                        {
                          value: agent,
                          disabled: true,
                          label: `${agent} — ${t.stints.notRegistered}`,
                        },
                      ]
                    : []),
                  ...agents.map((candidate) => {
                    const availability = agentUnavailable(candidate);
                    const reason =
                      availability === null ? null : translateCoreText(availability, t);
                    return {
                      value: candidate.id,
                      disabled: !!reason,
                      label: `${candidate.displayName}${reason ? ` — ${reason}` : ""}`,
                    };
                  }),
                ]}
              />
            </label>
            <p id={agentAvailabilityId} className="muted text-muted">
              {brief
                ? agents.length
                  ? (unavailable ?? t.stints.chooseAgent)
                  : t.stints.noAgents
                : t.stints.readingAgents}
            </p>
            {warnings.map((warning) => (
              <p key={warning.text} role="alert" className="warning text-warning">
                {translateCoreText(warning, t)}
              </p>
            ))}
          </section>
          <section>
            <h3>{t.stints.permissionLevel}</h3>
            <label htmlFor={`${selectId}-permissionLevel`}>
              <span className="sr-only">{t.stints.permissionLevel}</span>
              <SelectField
                id={`${selectId}-permissionLevel`}
                aria-label={t.stints.permissionLevel}
                value={permissionLevel}
                disabled={!brief || starting || savingDefault}
                onValueChange={(value) => {
                  if (isPermissionLevel(value)) setPermissionLevel(value);
                }}
                options={permissionLevels.map((level) => ({
                  value: level,
                  label: t.stints.permissionLevels[level],
                }))}
              />
            </label>
            <p className="muted text-muted">
              {t.stints.projectDefault} {t.stints.permissionLevels[projectDefault]}
            </p>
            <Button
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
            </Button>
            {defaultError && (
              <p role="alert" className="warning text-warning">
                {defaultError}
              </p>
            )}
          </section>
          {error ? (
            <p role="alert" className="warning text-warning">
              {error}
            </p>
          ) : !brief ? (
            <p role="status" className="muted text-muted">
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
                      <CodeBlock className="brief-prompt">{note.text}</CodeBlock>
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
                <p className="muted text-muted">{t.stints.filesWin}</p>
              </section>
              <section>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3>{t.stints.fullPrompt}</h3>
                  <Button onClick={copy}>
                    <Copy aria-hidden="true" /> {t.stints.copyPrompt}
                  </Button>
                </div>
                <span role="status" className="copy-status text-xs">
                  {copyStatus}
                </span>
                <CodeBlock className="brief-prompt">{brief.prompt}</CodeBlock>
              </section>
            </>
          )}
        </div>
        <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-border p-4 text-sm text-muted">
          {startError && (
            <p role="alert" className="warning text-warning">
              {startError}
            </p>
          )}
          <Button
            variant="primary"
            disabled={!brief || !agent || starting || !!error || !!unavailable}
            onClick={() => void start()}
          >
            {starting ? t.stints.starting : t.stints.start}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
