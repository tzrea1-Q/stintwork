// SPDX-License-Identifier: Apache-2.0
import {
  evidenceStale,
  type CheckExecution,
  type ProjectSnapshot,
  type WorkItemChecks,
} from "@stintwork/core";
import { useEffect, useState } from "react";
import { CoreTextError, useCoreTextError, useLanguage } from "./i18n/language";
import "./checks-panel.css";
import { PullRequestChecksPanel } from "./PullRequestChecksPanel";

type ChecksItem = Pick<
  ProjectSnapshot["workItems"][number],
  | "slug"
  | "headCommit"
  | "checks"
  | "checkExecution"
  | "evidenceChangedPaths"
  | "merged"
  | "pullRequest"
  | "pullRequestChecks"
>;

export function ChecksPanel({ item }: { item: ChecksItem }) {
  const { t } = useLanguage();
  const [data, setData] = useState<WorkItemChecks | null>(null);
  const [error, setError] = useCoreTextError();
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/work-items/${encodeURIComponent(item.slug)}/checks`;
  const execution = item.checkExecution !== undefined ? item.checkExecution : data?.checkExecution;
  const active = execution != null && execution.endedAt === null;
  const headCommit = item.headCommit ?? data?.headCommit;
  const results = item.checks ?? data?.checks ?? [];
  const evidence = {
    slug: item.slug,
    headCommit,
    evidenceChangedPaths:
      item.evidenceChangedPaths ??
      (data?.headCommit === headCommit ? data?.evidenceChangedPaths : undefined),
  };

  useEffect(() => {
    if (item.merged) return;
    let disposed = false;
    let request: AbortController | undefined;
    async function load() {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetch(endpoint, { signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new CoreTextError(body, t.review.checks.readError);
        if (!disposed && !controller.signal.aborted) {
          setData(body);
          setError("");
        }
      } catch (cause) {
        if (!disposed && !controller.signal.aborted)
          setError(cause instanceof Error ? cause : String(cause));
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
  }, [endpoint, item.merged, t.review.checks.readError, setError]);

  async function action(cancel: boolean) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}${cancel ? "/cancel" : ""}`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new CoreTextError(body, t.review.checks.updateError);
      const next: CheckExecution = body.execution;
      setData((previous) =>
        previous ? { ...previous, checks: next.results, checkExecution: next } : previous,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="checks-panel">
      <PullRequestChecksPanel item={item} />
      <p className="muted">
        {item.merged ? t.review.checks.shippedEvidence : t.review.checks.commandsExplanation}
      </p>
      {!item.merged && (
        <div className="checks-actions">
          <button
            type="button"
            className="top-button"
            disabled={busy || active || !data?.commands.length}
            onClick={() => void action(false)}
          >
            {t.review.checks.run}
          </button>
          {active && (
            <button
              type="button"
              className="top-button"
              disabled={busy}
              onClick={() => void action(true)}
            >
              {t.review.checks.cancel}
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="warning">
          {error}
        </p>
      )}
      {!data && !error && !item.merged && <p className="muted">{t.review.checks.reading}</p>}
      {data && !data.commands.length && <p className="muted">{t.review.checks.notConfigured}</p>}
      {data && !results.length && data.commands.length > 0 && (
        <p className="muted">{t.review.checks.noEvidence}</p>
      )}
      <ul className="check-results" aria-label={t.review.checks.latest}>
        {results.map((result) => (
          <li key={result.name}>
            <p>
              <strong>{result.name}</strong> ·{" "}
              <span>{t.review.checks.statuses[result.status]}</span>
              {evidenceStale(evidence, result.commit) && (
                <strong className="warning">{t.review.checks.stale}</strong>
              )}
            </p>
            <p>
              <code>{result.commit}</code> · {t.review.checks.duration(result.durationMs)}
            </p>
            <details open={result.status === "running" || result.status === "failed"}>
              <summary>{t.review.checks.commandOutput(result.name)}</summary>
              <code>{result.command}</code>
              <div
                role="log"
                aria-label={t.review.checks.output(result.name)}
                aria-live={result.status === "running" ? "polite" : "off"}
              >
                <pre>{result.outputExcerpt || t.review.checks.noOutput}</pre>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
