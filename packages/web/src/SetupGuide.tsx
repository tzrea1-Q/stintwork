// SPDX-License-Identifier: Apache-2.0
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Checkbox } from "./ui/Checkbox";
import { Disclosure } from "./ui/Disclosure";
import { DiffPreview } from "./ui/DiffPreview";
import { WarningCallout } from "./ui/WarningCallout";
import { DialogContent, DialogDescription, DialogTitle } from "./ui/Dialog";
import { readResponseJson, CoreTextError, useErrorText, useLanguage } from "./i18n/language";
import type {
  AgentSkillAvailability,
  SetupChange,
  SetupPlan,
  WorkflowDefinitions,
} from "@stintwork/core";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { en } from "./i18n/en";

import { stageName, uncustomisedBuiltIn, workflowName } from "./i18n/workflow-names";

type Guide = SetupPlan & { skills: AgentSkillAvailability[] };

export function SetupGuide({
  workflows = {},
  onClose,
  returnFocusRef,
}: {
  workflows?: WorkflowDefinitions;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement>;
}) {
  const { t } = useLanguage();
  const [guide, setGuide] = useState<Guide | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useErrorText();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const checkboxPrefix = useId();
  const reviewRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const finished = Boolean(message || (guide && !guide.changes.length));
  useEffect(() => {
    if (finished) closeRef.current?.focus();
    else if (confirming) reviewRef.current?.focus();
  }, [confirming, finished]);
  useEffect(() => {
    if (!loading) return;
    const controller = new AbortController();
    setError("");
    void (async () => {
      try {
        const response = await fetch("/api/setup", { signal: controller.signal });
        const result = await readResponseJson(response);
        if (!response.ok) throw new CoreTextError(result, en.planning.setup.errors.load);
        if (
          !Array.isArray(result.changes) ||
          !Array.isArray(result.checks) ||
          !Array.isArray(result.warnings) ||
          !Array.isArray(result.skills)
        )
          throw new Error(en.planning.setup.errors.load);
        if (!controller.signal.aborted) {
          setGuide(result);
          setSelected(result.changes.map(({ path }: { path: string }) => path));
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause : en.planning.setup.errors.load);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [loading, setError]);

  function installationHint(message: string) {
    const hint =
      /^Use npx skills@latest add mattpocock\/skills, select (.+) and (\/[a-zA-Z0-9][a-zA-Z0-9._-]*)\.(?: Expected locations: (.*)\. For a custom skill, use its own source\. Stintwork does not install skills\.)?$/.exec(
        message,
      );
    return hint ? t.planning.setup.installHint(hint[1], hint[2], hint[3]) : message;
  }

  async function apply() {
    if (!guide || saving || !confirming || !selected.length) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          changes: guide.changes.filter(({ path }) => selected.includes(path)),
        }),
      });
      const result = await readResponseJson(response);
      if (!response.ok) throw new CoreTextError(result, en.planning.setup.errors.apply);
      setGuide(result);
      setSelected([]);
      setConfirming(false);
      setMessage(result.commit.slice(0, 7));
    } catch (cause) {
      setError(cause instanceof Error ? cause : en.planning.setup.errors.apply);
    } finally {
      setSaving(false);
    }
  }

  function fileChange(change: SetupChange, review = false) {
    return (
      <section
        key={change.path}
        aria-label={t.planning.setup.changeLabel(change.path)}
        className="min-w-0 border-t border-border py-2"
      >
        <div className="flex items-start gap-2">
          {review ? (
            <code className="min-w-0 flex-1 break-all text-xs">{change.path}</code>
          ) : (
            <label
              htmlFor={`${checkboxPrefix}-${change.path}`}
              className="flex min-w-0 flex-1 cursor-pointer items-start gap-2"
            >
              <Checkbox
                id={`${checkboxPrefix}-${change.path}`}
                checked={selected.includes(change.path)}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? [...selected, change.path]
                      : selected.filter((path) => path !== change.path),
                  )
                }
              />
              <code className="min-w-0 break-all text-xs">{change.path}</code>
            </label>
          )}
          <Badge>
            {change.before === null ? t.planning.setup.create : t.planning.setup.change}
          </Badge>
        </div>
        <DiffPreview before={change.before} content={change.content} open={review} />
      </section>
    );
  }

  const ready = guide?.checks.filter((check) => check.ready) ?? [];
  const attention = guide?.checks.filter((check) => !check.ready) ?? [];
  return (
    <DialogContent
      returnFocusRef={returnFocusRef}
      className="setup-guide flex w-2xl flex-col overflow-hidden p-0 [overflow-wrap:anywhere]"
      onEscapeKeyDown={(event) => {
        if (saving) event.preventDefault();
      }}
      onPointerDownOutside={(event) => {
        if (saving) event.preventDefault();
      }}
      onInteractOutside={(event) => {
        if (saving) event.preventDefault();
      }}
    >
      <header className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
        <DialogTitle className="text-xl font-medium">{t.planning.setup.title}</DialogTitle>
        <DialogDescription className="mt-2 text-sm text-muted">
          {message
            ? t.planning.setup.complete
            : guide
              ? t.planning.setup.summary(attention.length, selected.length)
              : t.planning.setup.description}
        </DialogDescription>
      </header>
      <div className="setup-body min-h-0 min-w-0 overflow-y-auto px-4 py-4 sm:px-6">
        {error && (
          <p role="alert" className="mb-4 text-warning">
            {Object.entries(en.planning.setup.errors).reduce(
              (message, [key, original]) =>
                message === original
                  ? t.planning.setup.errors[key as keyof typeof en.planning.setup.errors]
                  : message,
              error,
            )}
          </p>
        )}
        {message && <p role="status">{t.planning.setup.committed(message)}</p>}
        {!guide && !error && <p role="status">{t.planning.setup.loading}</p>}
        {guide && !message && (
          <>
            <WarningCallout warnings={guide.warnings} />
            {confirming ? (
              <section ref={reviewRef} tabIndex={-1} aria-label={t.planning.setup.confirm}>
                <h3 className="text-base font-medium">{t.planning.setup.confirm}</h3>
                <p className="my-3 text-muted">{t.planning.setup.write(selected.length)}</p>
                {guide.changes
                  .filter(({ path }) => selected.includes(path))
                  .map((change) => fileChange(change, true))}
                <p className="mt-3 text-muted">{t.planning.setup.refusal}</p>
              </section>
            ) : (
              <>
                <ul aria-label={t.planning.setup.projectChecks} className="space-y-4">
                  {attention.map((check) => {
                    const changes = guide.changes.filter(({ checkId }) => checkId === check.id);
                    return (
                      <li key={check.id}>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="warning">{t.planning.setup.needsAttention}</Badge>
                          <h3 className="text-sm font-medium">
                            {t.planning.setup.checks[check.id].name}
                          </h3>
                        </div>
                        <p className="my-2 text-muted">{t.planning.setup.checks[check.id].why}</p>
                        {changes.map((change) => fileChange(change))}
                        {!changes.length && (
                          <p className="text-sm text-muted">
                            {check.id === "glossary" || check.id === "adrs"
                              ? t.planning.setup.checks[check.id].manual
                              : check.id === "markdown" &&
                                  guide.changes.some(({ checkId }) => checkId === "tracker")
                                ? t.planning.setup.trackerFix
                                : t.planning.setup.noAutomaticFix}
                          </p>
                        )}
                      </li>
                    );
                  })}
                  {guide.changes.map(
                    (change) =>
                      change.reasonId && (
                        <li key={change.path}>
                          <h3 className="text-sm font-medium">
                            {t.planning.setup.reasons[change.reasonId].name}
                          </h3>
                          <p className="my-2 text-muted">
                            {t.planning.setup.reasons[change.reasonId].why}
                          </p>
                          {fileChange(change)}
                        </li>
                      ),
                  )}
                </ul>
                {!!ready.length && (
                  <Disclosure
                    label={t.planning.setup.readyCount(ready.length)}
                    className="mt-4 border-t border-border pt-2"
                  >
                    <ul className="space-y-3">
                      {ready.map((check) => (
                        <li key={check.id}>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="success">{t.planning.setup.ready}</Badge>
                            <h3 className="text-sm font-medium">
                              {t.planning.setup.checks[check.id].name}
                            </h3>
                          </div>
                          <p className="mt-2 text-muted">{t.planning.setup.checks[check.id].why}</p>
                        </li>
                      ))}
                    </ul>
                  </Disclosure>
                )}
                {!guide.changes.length && <p className="my-3">{t.planning.setup.noChanges}</p>}
              </>
            )}
            {!confirming && (
              <Disclosure
                label={t.planning.setup.skills}
                className="mt-4 border-t border-border pt-2"
              >
                <p className="my-3 text-muted">{t.planning.setup.skillExplanation}</p>
                {!guide.skills.length && <p>{t.planning.setup.noSkills}</p>}
                {guide.skills.map((agent) => (
                  <section
                    key={agent.agent}
                    aria-label={t.planning.setup.agentSkills(agent.displayName)}
                    className="my-3"
                  >
                    <h4 className="mb-2 font-medium">{agent.displayName}</h4>
                    {agent.skills.length ? (
                      <ul className="space-y-3">
                        {agent.skills.map((skill) => {
                          const workflow = Object.hasOwn(workflows, skill.workflowId)
                            ? workflows[skill.workflowId]
                            : undefined;
                          const builtIn = workflow && uncustomisedBuiltIn(workflow);
                          const stage = workflow?.stages.find(({ id }) => id === skill.stageId);
                          return (
                            <li key={JSON.stringify([skill.workflowId, skill.stageId])}>
                              {builtIn ? workflowName(workflow, t) : skill.workflow} /{" "}
                              {builtIn && stage ? stageName(workflow, stage, t) : skill.stage}:{" "}
                              <code>{skill.skill}</code> —{" "}
                              <strong>
                                {skill.status === "unknown"
                                  ? t.planning.setup.unknown
                                  : skill.status === "found"
                                    ? t.planning.setup.found
                                    : t.planning.setup.missing}
                              </strong>
                              {skill.installationHint && (
                                <p>{installationHint(skill.installationHint)}</p>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p>{t.planning.setup.noSkills}</p>
                    )}
                  </section>
                ))}
              </Disclosure>
            )}
          </>
        )}
      </div>
      <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-surface px-4 py-4 sm:px-6">
        {finished ? (
          <Button ref={closeRef} onClick={onClose}>
            {t.planning.setup.close}
          </Button>
        ) : (
          <>
            <Button disabled={saving} onClick={onClose}>
              {t.planning.setup.cancel}
            </Button>
            {!guide && error ? (
              <Button variant="primary" onClick={() => setLoading(true)}>
                {t.planning.setup.retry}
              </Button>
            ) : confirming ? (
              <>
                <Button disabled={saving} onClick={() => setConfirming(false)}>
                  {t.planning.setup.back}
                </Button>
                <Button variant="primary" disabled={saving} onClick={() => void apply()}>
                  {saving ? t.planning.setup.saving : t.planning.setup.apply}
                </Button>
              </>
            ) : (
              guide && (
                <Button
                  variant="primary"
                  disabled={!selected.length}
                  onClick={() => {
                    setError("");
                    setConfirming(true);
                  }}
                >
                  {t.planning.setup.review(selected.length)}
                </Button>
              )
            )}
          </>
        )}
      </footer>
    </DialogContent>
  );
}
