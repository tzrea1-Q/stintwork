import type { CheckExecution, ProjectSnapshot, WorkItemChecks } from "@stintwork/core";
import { useEffect, useState } from "react";
import "./checks-panel.css";

type ChecksItem = Pick<
  ProjectSnapshot["workItems"][number],
  "slug" | "headCommit" | "checks" | "checkExecution"
>;

export function ChecksPanel({ item }: { item: ChecksItem }) {
  const [data, setData] = useState<WorkItemChecks | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/work-items/${encodeURIComponent(item.slug)}/checks`;
  const execution = item.checkExecution !== undefined ? item.checkExecution : data?.checkExecution;
  const active = execution != null && execution.endedAt === null;
  const headCommit = item.headCommit ?? data?.headCommit;
  const results = item.checks ?? data?.checks ?? [];

  useEffect(() => {
    let disposed = false;
    let request: AbortController | undefined;
    async function load() {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetch(endpoint, { signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.reason ?? "Could not read checks.");
        if (!disposed && !controller.signal.aborted) {
          setData(body);
          setError("");
        }
      } catch (cause) {
        if (!disposed && !controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
    setData(null);
    void load();
    const poll = setInterval(() => void load(), 5000);
    return () => {
      disposed = true;
      clearInterval(poll);
      request?.abort();
    };
  }, [endpoint]);

  async function action(cancel: boolean) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}${cancel ? "/cancel" : ""}`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.reason ?? "Could not update checks.");
      const next: CheckExecution = body.execution;
      setData((previous) =>
        previous ? { ...previous, checks: next.results, checkExecution: next } : previous,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="checks-panel">
      <p className="muted">Commands execute in the work item worktree, on the recorded commit.</p>
      <div className="checks-actions">
        <button
          type="button"
          className="top-button"
          disabled={busy || active || !data?.commands.length}
          onClick={() => void action(false)}
        >
          Run checks
        </button>
        {active && (
          <button
            type="button"
            className="top-button"
            disabled={busy}
            onClick={() => void action(true)}
          >
            Cancel checks
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="warning">
          {error}
        </p>
      )}
      {!data && !error && <p className="muted">Reading checks…</p>}
      {data && !data.commands.length && <p className="muted">No checks configured.</p>}
      {data && !results.length && data.commands.length > 0 && (
        <p className="muted">No check evidence yet.</p>
      )}
      <ul className="check-results" aria-label="Latest checks">
        {results.map((result) => (
          <li key={result.name}>
            <p>
              <strong>{result.name}</strong> · <span>{result.status}</span>
              {headCommit && result.commit !== headCommit && (
                <strong className="warning"> · Stale</strong>
              )}
            </p>
            <p>
              <code>{result.commit}</code> · {result.durationMs} ms
            </p>
            <details open={result.status === "running" || result.status === "failed"}>
              <summary>Command and output: {result.name}</summary>
              <code>{result.command}</code>
              <div
                role="log"
                aria-label={`Output: ${result.name}`}
                aria-live={result.status === "running" ? "polite" : "off"}
              >
                <pre>{result.outputExcerpt || "No output yet."}</pre>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
