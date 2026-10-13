// SPDX-License-Identifier: Apache-2.0
import type { AgentSkillAvailability, SetupPlan, WorkflowDefinitions } from "@stintwork/core";
import { useEffect, useState } from "react";
import "./setup-guide.css";
import { en } from "./i18n/en";
import { CoreTextError, useCoreTextError, useLanguage } from "./i18n/language";
import { stageName, uncustomisedBuiltIn, workflowName } from "./i18n/workflow-names";

type Guide = SetupPlan & { skills: AgentSkillAvailability[] };

export function SetupGuide({ workflows = {} }: { workflows?: WorkflowDefinitions }) {
  const { t } = useLanguage();
  const [guide, setGuide] = useState<Guide | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useCoreTextError();
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/setup", { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new CoreTextError(result, en.planning.setup.errors.load);
        if (
          !Array.isArray(result.changes) ||
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
      }
    })();
    return () => controller.abort();
  }, [setError]);

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
      const result = await response.json();
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

  return (
    <div className="setup-guide">
      <p>{t.planning.setup.description}</p>
      {error && (
        <p role="alert">
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
      {guide && (
        <>
          {guide.warnings.map((warning) => (
            <p role="alert" key={`${warning.path}:${warning.message}`}>
              {warning.path}: {warning.message}
            </p>
          ))}
          {guide.changes.length ? (
            <>
              <fieldset disabled={saving || confirming}>
                <legend>{t.planning.setup.changes}</legend>
                {guide.changes.map((change) => (
                  <section key={change.path} aria-label={t.planning.setup.changeLabel(change.path)}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.includes(change.path)}
                        onChange={(event) => {
                          setSelected(
                            event.target.checked
                              ? [...selected, change.path]
                              : selected.filter((path) => path !== change.path),
                          );
                        }}
                      />
                      {change.path} (
                      {change.before === null ? t.planning.setup.create : t.planning.setup.change})
                    </label>
                    <details>
                      <summary>{t.planning.setup.preview(change.path)}</summary>
                      {change.before !== null && (
                        <>
                          <h3>{t.planning.setup.current}</h3>
                          <pre>{change.before}</pre>
                        </>
                      )}
                      <h3>{t.planning.setup.proposed}</h3>
                      <pre>{change.content}</pre>
                    </details>
                  </section>
                ))}
              </fieldset>
              {confirming ? (
                <section aria-label={t.planning.setup.confirm}>
                  <h3>{t.planning.setup.confirm}</h3>
                  <p>
                    {t.planning.setup.write(selected.length)}
                    <strong>Set up Stintwork</strong>?
                  </p>
                  <ul>
                    {selected.map((path) => (
                      <li key={path}>
                        <code>{path}</code>
                      </li>
                    ))}
                  </ul>
                  <p>{t.planning.setup.refusal}</p>
                  <button
                    type="button"
                    className="top-button"
                    disabled={saving}
                    onClick={() => void apply()}
                  >
                    {t.planning.setup.apply}
                  </button>
                  <button
                    type="button"
                    className="top-button"
                    disabled={saving}
                    onClick={() => setConfirming(false)}
                  >
                    {t.planning.setup.back}
                  </button>
                </section>
              ) : (
                <button
                  type="button"
                  className="top-button"
                  disabled={!selected.length}
                  onClick={() => setConfirming(true)}
                >
                  {t.planning.setup.review}
                </button>
              )}
            </>
          ) : (
            <p>{t.planning.setup.noChanges}</p>
          )}
          <h3>{t.planning.setup.skills}</h3>
          <p>{t.planning.setup.skillExplanation}</p>
          {guide.skills.map((agent) => (
            <section key={agent.agent} aria-label={t.planning.setup.agentSkills(agent.displayName)}>
              <h4>{agent.displayName}</h4>
              {agent.skills.length ? (
                <ul>
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
        </>
      )}
    </div>
  );
}
