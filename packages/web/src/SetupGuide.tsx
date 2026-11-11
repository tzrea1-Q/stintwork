// SPDX-License-Identifier: Apache-2.0

import type {
  AgentSkillAvailability,
  SetupChange,
  SetupCheckId,
  SetupPlan,
  WorkflowDefinitions,
} from "@stintwork/core";
import { Check, Circle } from "lucide-react";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import { en } from "./i18n/en";
import { CoreTextError, readResponseJson, useErrorText, useLanguage } from "./i18n/language";
import { stageName, uncustomisedBuiltIn, workflowName } from "./i18n/workflow-names";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Checkbox } from "./ui/Checkbox";
import { DialogContent, DialogDescription, DialogTitle } from "./ui/Dialog";
import { DiffPreview } from "./ui/DiffPreview";
import { Disclosure } from "./ui/Disclosure";
import { SegmentedProgress } from "./ui/SegmentedProgress";
import { WarningCallout } from "./ui/WarningCallout";

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
  const finished = Boolean(
    message ||
      (guide &&
        !guide.changes.length &&
        !guide.checks.some(({ status }) => status === "needs-change")),
  );
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
          setSelected(
            result.changes
              .filter((change: SetupChange) => change.selectedByDefault && !change.removedLines)
              .map(({ path }: SetupChange) => path),
          );
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
                      : selected.filter(
                          (path) =>
                            path !== change.path &&
                            guide?.changes.find((entry) => entry.path === path)?.requires !==
                              change.path,
                        ),
                  )
                }
              />
              <span className="min-w-0">
                {change.path === "docs/agents/issue-tracker.md" && change.before !== null && (
                  <span className="block text-sm font-medium">
                    {t.planning.setup.switchTracker}
                  </span>
                )}
                <code className="break-all text-xs">{change.path}</code>
              </span>
            </label>
          )}
          <Badge variant={change.removedLines ? "danger" : "secondary"}>
            {change.removedLines
              ? t.planning.setup.replacesLines(change.removedLines)
              : change.before === null
                ? t.planning.setup.create
                : t.planning.setup.change}
          </Badge>
        </div>
        <DiffPreview before={change.before} content={change.content} open={review} />
      </section>
    );
  }

  const groups: { id: "required" | "recommended" | "optional"; checks: SetupCheckId[] }[] = [
    { id: "required", checks: ["tracker", "agents"] },
    { id: "recommended", checks: ["localRunData", "roadmap"] },
    { id: "optional", checks: ["glossary", "adrs"] },
  ];
  const selectedChanges = guide?.changes.filter(({ path }) => selected.includes(path)) ?? [];
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
        <DialogDescription className="mt-2 text-sm text-muted-foreground">
          {message
            ? t.planning.setup.complete
            : guide?.tracker === "github-issues"
              ? t.planning.setup.githubNotice
              : guide?.tracker === "other"
                ? t.planning.setup.otherNotice
                : t.planning.setup.description}
        </DialogDescription>
      </header>
      <div className="setup-body min-h-0 min-w-0 overflow-y-auto px-4 py-4 sm:px-6">
        {error && (
          <p role="alert" className="mb-4 text-attention-foreground">
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
            {!confirming && (
              <div className="mb-5 space-y-2">
                <p className="font-medium">
                  {`${guide.checks.filter((check) => check.status === "ready").length}/${guide.checks.length} ${t.planning.setup.statuses.ready}`}
                </p>
                <SegmentedProgress
                  value={guide.checks.filter((check) => check.status === "ready").length}
                  total={guide.checks.length}
                  label={`${guide.checks.filter((check) => check.status === "ready").length}/${guide.checks.length} ${t.planning.setup.statuses.ready}`}
                />
              </div>
            )}
            {confirming ? (
              <section ref={reviewRef} tabIndex={-1} aria-label={t.planning.setup.confirm}>
                <h3 className="text-base font-medium">{t.planning.setup.confirm}</h3>
                <p className="my-3 text-muted-foreground">
                  {t.planning.setup.write(selected.length)}
                </p>
                {selectedChanges.some(({ removedLines }) => removedLines > 0) && (
                  <section aria-label={t.planning.setup.removesContent} className="my-4">
                    <h4 className="font-medium text-destructive">
                      {t.planning.setup.removesContent}
                    </h4>
                    {selectedChanges
                      .filter(({ removedLines }) => removedLines > 0)
                      .map((change) => fileChange(change, true))}
                  </section>
                )}
                {selectedChanges
                  .filter(({ removedLines }) => !removedLines)
                  .map((change) => fileChange(change, true))}
                <p className="mt-3 text-muted-foreground">{t.planning.setup.refusal}</p>
              </section>
            ) : (
              <>
                {finished && (
                  <p className="mb-4" role="status">
                    {t.planning.setup.noChanges}
                  </p>
                )}
                {!finished && (
                  <fieldset
                    aria-label={t.planning.setup.projectChecks}
                    className="min-w-0 space-y-6"
                  >
                    {groups.map((group) => (
                      <section key={group.id} aria-label={t.planning.setup.groups[group.id]}>
                        <h3 className="mb-3 text-base font-medium">
                          {t.planning.setup.groups[group.id]}
                        </h3>
                        <ul className="space-y-4">
                          {guide.checks
                            .filter(({ id }) => group.checks.includes(id))
                            .map((check) => {
                              const copy =
                                check.id === "localRunData" || check.id === "roadmap"
                                  ? t.planning.setup.reasons[check.id]
                                  : t.planning.setup.checks[check.id];
                              const changes = guide.changes.filter(
                                (change) =>
                                  (change.checkId ?? change.reasonId) === check.id &&
                                  (!change.requires || selected.includes(change.requires)),
                              );
                              return (
                                <li key={check.id} className="rounded-xl border border-border p-4">
                                  <div className="flex flex-wrap items-center gap-2">
                                    {check.status === "ready" ? (
                                      <Check aria-hidden="true" className="size-4 text-success" />
                                    ) : (
                                      <Circle
                                        aria-hidden="true"
                                        className="size-4 text-muted-foreground"
                                      />
                                    )}
                                    <h4 className="text-sm font-medium">{copy.name}</h4>
                                    <Badge
                                      variant={
                                        check.status === "ready"
                                          ? "success"
                                          : check.status === "needs-change"
                                            ? "warning"
                                            : "secondary"
                                      }
                                    >
                                      {t.planning.setup.statuses[check.status]}
                                    </Badge>
                                  </div>
                                  <p className="my-2 text-muted-foreground">{copy.why}</p>
                                  {check.id === "tracker" && guide.tracker === "github-issues" && (
                                    <p className="mb-2 text-sm text-muted-foreground">
                                      {t.planning.setup.githubTracker}
                                    </p>
                                  )}
                                  {changes.map((change) => fileChange(change))}
                                  {(check.id === "glossary" || check.id === "adrs") &&
                                    !check.ready && (
                                      <p className="text-sm text-muted-foreground">
                                        {t.planning.setup.checks[check.id].manual}
                                      </p>
                                    )}
                                  {check.status === "needs-change" && !changes.length && (
                                    <p className="text-sm text-muted-foreground">
                                      {t.planning.setup.noAutomaticFix}
                                    </p>
                                  )}
                                </li>
                              );
                            })}
                        </ul>
                      </section>
                    ))}
                  </fieldset>
                )}
              </>
            )}
            {!confirming && (
              <section
                aria-label={t.planning.setup.skills}
                className="mt-6 border-t border-border pt-4"
              >
                <h3 className="text-base font-medium">{t.planning.setup.skills}</h3>
                <p className="my-3 text-sm text-muted-foreground">
                  {t.planning.setup.skillExplanation}
                </p>
                {!guide.skills.length && <p>{t.planning.setup.noSkills}</p>}
                {guide.skills.map((agent) => {
                  const unavailable = agent.skills.filter(({ status }) => status !== "found");
                  return (
                    <Disclosure
                      key={agent.agent}
                      label={t.planning.setup.skillSummary(
                        agent.displayName,
                        agent.skills.filter(({ status }) => status === "found").length,
                        agent.skills.length,
                        agent.skills.filter(({ status }) => status === "unknown").length,
                      )}
                    >
                      <section
                        aria-label={t.planning.setup.agentSkills(agent.displayName)}
                        className="my-2 pl-4"
                      >
                        {!agent.skills.length ? (
                          <p>{t.planning.setup.noSkills}</p>
                        ) : !unavailable.length ? (
                          <p>{t.planning.setup.allSkillsFound}</p>
                        ) : null}
                        {[...new Set(unavailable.map(({ workflowId }) => workflowId))].map(
                          (workflowId) => {
                            const skills = unavailable.filter(
                              (skill) => skill.workflowId === workflowId,
                            );
                            const workflow = Object.hasOwn(workflows, workflowId)
                              ? workflows[workflowId]
                              : undefined;
                            const builtIn = workflow && uncustomisedBuiltIn(workflow);
                            return (
                              <section key={workflowId} className="my-3">
                                <h4 className="mb-2 text-sm font-medium">
                                  {builtIn ? workflowName(workflow, t) : skills[0].workflow}
                                </h4>
                                <ul className="space-y-3">
                                  {skills.map((skill) => {
                                    const stage = workflow?.stages.find(
                                      ({ id }) => id === skill.stageId,
                                    );
                                    return (
                                      <li key={skill.stageId} className="text-sm">
                                        {builtIn && stage
                                          ? stageName(workflow, stage, t)
                                          : skill.stage}
                                        : <code>{skill.skill}</code> —{" "}
                                        <strong>
                                          {skill.status === "unknown"
                                            ? t.planning.setup.unknown
                                            : t.planning.setup.missing}
                                        </strong>
                                        {skill.installationHint && (
                                          <p className="mt-1 text-muted-foreground">
                                            {installationHint(skill.installationHint)}
                                          </p>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </section>
                            );
                          },
                        )}
                      </section>
                    </Disclosure>
                  );
                })}
              </section>
            )}
          </>
        )}
      </div>
      <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-card px-4 py-4 sm:px-6">
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
