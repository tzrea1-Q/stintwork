// SPDX-License-Identifier: Apache-2.0
import type { AgentSkillAvailability, SetupPlan } from "@stintwork/core";
import { useEffect, useState } from "react";
import "./setup-guide.css";

type Guide = SetupPlan & { skills: AgentSkillAvailability[] };

export function SetupGuide() {
  const [guide, setGuide] = useState<Guide | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/setup", { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.reason ?? "Could not load setup.");
        if (
          !Array.isArray(result.changes) ||
          !Array.isArray(result.warnings) ||
          !Array.isArray(result.skills)
        )
          throw new Error("Could not load setup.");
        if (!controller.signal.aborted) {
          setGuide(result);
          setSelected(result.changes.map(({ path }: { path: string }) => path));
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Could not load setup.");
      }
    })();
    return () => controller.abort();
  }, []);

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
      if (!response.ok) throw new Error(result.reason ?? "Could not apply setup.");
      setGuide(result);
      setSelected([]);
      setConfirming(false);
      setMessage(`Setup committed: ${result.commit.slice(0, 7)}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not apply setup.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="setup-guide">
      <p>No files change until you select changes and confirm. Only project files are written.</p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!guide && !error && <p role="status">Loading setup…</p>}
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
                <legend>Proposed file changes</legend>
                {guide.changes.map((change) => (
                  <section key={change.path} aria-label={`Change ${change.path}`}>
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
                      {change.path} ({change.before === null ? "create" : "change"})
                    </label>
                    <details>
                      <summary>Preview {change.path}</summary>
                      {change.before !== null && (
                        <>
                          <h3>Current content</h3>
                          <pre>{change.before}</pre>
                        </>
                      )}
                      <h3>Proposed content</h3>
                      <pre>{change.content}</pre>
                    </details>
                  </section>
                ))}
              </fieldset>
              {confirming ? (
                <section aria-label="Confirm setup">
                  <h3>Confirm setup</h3>
                  <p>
                    Write {selected.length} selected files in one commit:{" "}
                    <strong>Set up Stintwork</strong>?
                  </p>
                  <ul>
                    {selected.map((path) => (
                      <li key={path}>
                        <code>{path}</code>
                      </li>
                    ))}
                  </ul>
                  <p>Uncommitted target files are refused. Other files are left alone.</p>
                  <button
                    type="button"
                    className="top-button"
                    disabled={saving}
                    onClick={() => void apply()}
                  >
                    Confirm and apply setup
                  </button>
                  <button
                    type="button"
                    className="top-button"
                    disabled={saving}
                    onClick={() => setConfirming(false)}
                  >
                    Back to selection
                  </button>
                </section>
              ) : (
                <button
                  type="button"
                  className="top-button"
                  disabled={!selected.length}
                  onClick={() => setConfirming(true)}
                >
                  Review selected changes
                </button>
              )}
            </>
          ) : (
            <p>No setup file changes needed.</p>
          )}
          <h3>Stage skill availability</h3>
          <p>
            Read-only check of declared skill locations. Found means a file exists, not that the
            skill was tested. Other layouts are not checked. Stintwork never installs skills or
            changes agent configuration.
          </p>
          {guide.skills.map((agent) => (
            <section key={agent.agent} aria-label={`${agent.displayName} skills`}>
              <h4>{agent.displayName}</h4>
              {agent.skills.length ? (
                <ul>
                  {agent.skills.map((skill) => (
                    <li key={JSON.stringify([skill.workflowId, skill.stageId])}>
                      {skill.workflow} / {skill.stage}: <code>{skill.skill}</code> —{" "}
                      <strong>
                        {skill.status === "unknown"
                          ? "Can't tell"
                          : skill.status === "found"
                            ? "Found"
                            : "Missing"}
                      </strong>
                      {skill.installationHint && <p>{skill.installationHint}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No stage skills in the loaded workflows.</p>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
