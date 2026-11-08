// SPDX-License-Identifier: Apache-2.0
import { CodeBlock } from "./ui/CodeBlock";
import { Disclosure } from "./ui/Disclosure";
import {
  translateCoreText,
  readResponseJson,
  CoreTextError,
  useErrorText,
  useLanguage,
} from "./i18n/language";

import {
  builtInWorkflows,
  readCoreTextWire,
  type AgentPreparationProgress,
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
import { Copy, LoaderCircle, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { BoardWorkItem } from "./WorkItemCard";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { SelectField } from "./ui/SelectField";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/Dialog";

import { stageName as translatedStageName } from "./i18n/workflow-names";

export function TicketBriefPreview({
  item,
  ticket,
  workflows,
  githubReadOnly,
}: {
  item: BoardWorkItem;
  githubReadOnly?: boolean;
  ticket: Ticket;
  workflows?: WorkflowDefinitions;
}) {
  return (
    <StintBriefAction
      key={`${item.slug}:${item.stage}:${ticket.number}`}
      item={item}
      ticket={ticket}
      githubReadOnly={githubReadOnly}
      workflows={workflows}
    />
  );
}

export function StageBriefPreview({
  item,
  workflows,
  githubReadOnly,
}: {
  item: BoardWorkItem;
  githubReadOnly?: boolean;
  workflows?: WorkflowDefinitions;
}) {
  return (
    <StintBriefAction
      key={`${item.slug}:${item.stage}`}
      item={item}
      workflows={workflows}
      githubReadOnly={githubReadOnly}
    />
  );
}

function StintBriefAction({
  item,
  ticket,
  workflows = builtInWorkflows,
  githubReadOnly = false,
}: {
  item: BoardWorkItem;
  githubReadOnly?: boolean;
  ticket?: Ticket;
  workflows?: WorkflowDefinitions;
}) {
  const { t } = useLanguage();
  const workflow = workflows[item.workflow];
  const stage = workflow.stages.find(({ id }) => id === item.stage);
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const reasonId = useId();
  const availability = briefAvailability(item, ticket, workflows);
  const reason = githubReadOnly
    ? t.board.githubStatus.readOnly
    : item.activeStint
      ? t.stints.alreadyActive
      : availability === null
        ? null
        : translateCoreText(availability, t);

  useEffect(() => {
    if (reason && !starting) setOpen(false);
  }, [reason, starting]);

  return (
    <div className="brief-action mb-4 flex flex-wrap items-center gap-3 text-sm">
      <Button
        disabled={reason !== null}
        aria-describedby={reason ? reasonId : undefined}
        onClick={() => setOpen(true)}
      >
        {item.stints.some((stint) => stint.recovery?.state === "fallback")
          ? t.stints.startNewStint
          : t.stints.startStint}
      </Button>
      {reason && (
        <p id={reasonId} className="muted text-muted">
          {reason}
        </p>
      )}
      {open && (!reason || starting) && (
        <BriefPreviewSheet
          onStartingChange={setStarting}
          slug={item.slug}
          ticketNumber={ticket?.number ?? null}
          github={!!item.github}
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
  github,
  stageName,
  onClose,
  onStartingChange,
}: {
  onStartingChange: (starting: boolean) => void;
  slug: string;
  ticketNumber: number | null;
  github: boolean;
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
  const [preparation, setPreparation] = useState<AgentPreparationProgress | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const startRequest = useRef<AbortController>();
  useEffect(() => () => startRequest.current?.abort(), []);
  const [stintId, setStintId] = useState<string>();
  const cancelRequested = useRef(false);
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

  async function preparationAction(action: "stop" | "confirm-agent") {
    if (!stintId) return;
    const previous = preparation;
    if (action === "stop") {
      cancelRequested.current = true;
      setCancelled(true);
    } else setPreparation((event) => (event ? { ...event, phase: "waiting" } : event));
    try {
      const response = await fetch(`/api/stints/${encodeURIComponent(stintId)}/${action}`, {
        method: "POST",
      });
      if (!response.ok)
        throw new CoreTextError(await readResponseJson(response), t.stints.startFailed);
    } catch (cause) {
      if (action === "stop") {
        cancelRequested.current = false;
        setCancelled(false);
      } else setPreparation(previous);
      setStartError(cause instanceof Error ? cause : t.stints.startFailed);
    }
  }

  async function start() {
    if (!brief || !agent || starting || unavailable) return;
    setStarting(true);
    onStartingChange(true);
    setPreparation((current) => (current ? { ...current, phase: "waiting" } : null));
    setAgents((current) =>
      current.map((candidate) =>
        candidate.id === agent
          ? {
              ...candidate,
              availability: {
                ...candidate.availability,
                available: false,
                canStart: true,
                kind: "not-prepared",
                reason: undefined,
              },
            }
          : candidate,
      ),
    );
    setCancelled(false);
    cancelRequested.current = false;
    setStintId(undefined);
    startRequest.current = new AbortController();
    setStartError("");
    try {
      const response = await fetch("/api/stints", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        signal: startRequest.current.signal,
        body: JSON.stringify({ workItem: slug, ticket: ticketNumber, agent, permissionLevel }),
      });
      if (!response.ok) {
        const failure: { reason?: string } = await readResponseJson(response);
        throw new CoreTextError(failure, t.stints.startFailed);
      }
      if (response.headers.get("content-type")?.includes("application/x-ndjson")) {
        const reader = response.body?.getReader();
        if (!reader) throw new Error(t.stints.startFailed);
        const decoder = new TextDecoder();
        let pending = "";
        let completed = false;
        for (;;) {
          const { value, done } = await reader.read();
          pending += decoder.decode(value, { stream: !done });
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          for (const line of lines) {
            if (!line) continue;
            const event = JSON.parse(line);
            if (event.type === "availability")
              setAgents((current) =>
                current.map((candidate) =>
                  candidate.id === event.agent
                    ? {
                        ...candidate,
                        availability: readCoreTextWire(
                          event.availability,
                        ) as AgentProfile["availability"],
                      }
                    : candidate,
                ),
              );
            if (event.stintId) setStintId(event.stintId);
            if (event.type === "preparation")
              setPreparation((current) => ({
                ...(!event.progress.source || current?.source === event.progress.source
                  ? current
                  : {}),
                ...event.progress,
              }));
            if (event.type === "result") {
              completed = true;
              if (event.status !== 201) throw new CoreTextError(event.body, t.stints.startFailed);
            }
          }
          if (done) break;
        }
        if (!completed) throw new Error(t.stints.startFailed);
      }
      if (!cancelRequested.current) onClose();
    } catch (cause) {
      if (!cancelRequested.current)
        setStartError(cause instanceof Error ? cause : t.stints.startFailed);
    } finally {
      setStarting(false);
      onStartingChange(false);
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
            {slug} ·{" "}
            {ticketNumber === null ? stageName : t.stints.briefTicket(ticketNumber, github)}
          </DialogDescription>
        </header>
        <div className="brief-preview-content min-h-0 flex-1 overflow-auto overscroll-contain p-4 text-sm leading-relaxed [overflow-wrap:anywhere] sm:p-6 [&_section+section]:mt-6 [&_section+section]:border-t [&_section+section]:border-border [&_section+section]:pt-5 [&_h3]:mb-2 [&_h3]:font-medium [&_ul]:list-disc [&_ul]:pl-5 [&_dt]:mt-2 [&_dt]:font-medium [&_dd]:whitespace-pre-wrap [&_pre]:mt-2">
          <section aria-label={t.stints.agent}>
            <h3>{t.stints.agent}</h3>
            <label htmlFor={`${selectId}-agent`}>
              <span className="sr-only">{t.stints.agent}</span>
              <SelectField
                id={`${selectId}-agent`}
                aria-label={t.stints.agent}
                value={agent}
                onValueChange={(value) => {
                  setAgent(value);
                  setPreparation(null);
                  setStartError("");
                  setCancelled(false);
                }}
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
            {selectedAgent &&
              (() => {
                const selection = preparation ?? selectedAgent.availability?.selection;
                const copy = t.stints.preparation;
                const state = selectedAgent.availability?.available
                  ? "ready"
                  : selectedAgent.availability?.kind === "login-required"
                    ? "login-required"
                    : startError
                      ? "preparation-failed"
                      : (selectedAgent.availability?.kind ?? "not-prepared");
                const phase =
                  preparation?.phase === "ready" && state !== "ready"
                    ? "smoke"
                    : preparation?.phase;
                const activePreparation = starting && !cancelled && state !== "ready";
                return (
                  <div className="mt-3 space-y-2 rounded-md border border-border bg-surface p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {selection && selection.source !== "pending" && (
                        <Badge variant="secondary">
                          {copy.source}: {copy[selection.source]}
                        </Badge>
                      )}
                      <Badge
                        variant={
                          cancelled
                            ? "secondary"
                            : state === "ready"
                              ? "success"
                              : state === "preparation-failed"
                                ? "danger"
                                : "warning"
                        }
                      >
                        {cancelled
                          ? copy.cancelledState
                          : activePreparation
                            ? preparation?.phase === "confirm"
                              ? copy.awaitingConfirmation
                              : copy.preparing
                            : copy.states[state]}
                      </Badge>
                    </div>
                    {selection && (
                      <>
                        <p className="font-medium">
                          {selectedAgent.displayName}
                          {selection.executable?.version && ` ${selection.executable.version}`}
                          {selection.adapterVersion &&
                            ` · ${copy.adapter} ${selection.adapterVersion}`}
                        </p>
                        {!selection.executable?.version && (
                          <p className="text-muted">
                            {copy.version}: {copy.unchecked}
                          </p>
                        )}
                        <p className="text-muted">{copy.reasons[selection.reason]}</p>
                        {selection.reason !== "native" && selection.source !== "pending" && (
                          <p className="text-muted">
                            {selection.source === "bundled"
                              ? selection.downloadBytes
                                ? copy.bundledNotice(
                                    Math.round(selection.downloadBytes / 1_000_000),
                                  )
                                : copy.bundledSizePending
                              : copy.installedNotice}
                          </p>
                        )}
                        {selection.executable?.path && (
                          <Disclosure label={copy.details}>
                            <span className="text-muted">{copy.executable}</span>
                            <CodeBlock>{selection.executable.path}</CodeBlock>
                          </Disclosure>
                        )}
                      </>
                    )}
                    {(activePreparation || cancelled) && (
                      <div role="status">
                        {cancelled
                          ? copy.cancelled
                          : phase
                            ? copy.phases[phase]
                            : copy.phases.smoke}
                        {activePreparation &&
                          phase &&
                          phase !== "selected" &&
                          phase !== "confirm" && (
                            <div
                              role="progressbar"
                              aria-label={copy.progress}
                              aria-valuetext={copy.phases[phase]}
                              className="mt-2 inline-flex text-muted"
                            >
                              <LoaderCircle
                                aria-hidden="true"
                                className="size-icon-sm motion-safe:animate-spin"
                              />
                            </div>
                          )}
                      </div>
                    )}
                    {startError && (
                      <p role="alert" className="warning text-warning">
                        {startError}
                      </p>
                    )}
                    {!unavailable && !startError && selectedAgent.availability?.reason && (
                      <p>{translateCoreText(selectedAgent.availability.reason, t)}</p>
                    )}
                    {selectedAgent.availability?.kind === "login-required" && (
                      <p>
                        {copy.loginHint}{" "}
                        <code>
                          {selectedAgent.capabilities.authenticationRequired.loginCommand}
                        </code>
                      </p>
                    )}
                  </div>
                );
              })()}
            {warnings.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                {warnings.map((warning) => (
                  <p key={warning.text} role="alert" className="warning text-warning">
                    {translateCoreText(warning, t)}
                  </p>
                ))}
              </div>
            )}
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
                        {path.endsWith("/workflow.yaml") && `${t.stints.changedWorkflow}: `}
                        {path.endsWith("/review.yaml") && `${t.stints.changedReview}: `}
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
        <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-border p-4 text-sm text-muted [overflow-wrap:anywhere]">
          {starting && (
            <Button disabled={!stintId || cancelled} onClick={() => void preparationAction("stop")}>
              {t.stints.preparation.cancel}
            </Button>
          )}
          {starting && preparation?.phase === "confirm" && !cancelled && (
            <Button variant="primary" onClick={() => void preparationAction("confirm-agent")}>
              {t.stints.preparation.confirm}
            </Button>
          )}
          {starting && preparation?.phase !== "confirm" && (
            <Button variant="primary" disabled>
              {t.stints.starting}
            </Button>
          )}
          {!starting && (
            <Button
              variant="primary"
              disabled={!brief || !agent || starting || !!error || !!unavailable}
              onClick={() => void start()}
            >
              {startError || cancelled ? t.stints.preparation.retry : t.stints.start}
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
