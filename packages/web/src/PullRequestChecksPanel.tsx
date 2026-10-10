import {
  type PullRequest,
  type PullRequestChecks,
  evidenceStale,
  type EvidenceContext,
} from "@stintwork/core";
import { useCallback, useEffect, useState } from "react";

export function PullRequestChecksPanel({
  item,
}: {
  item: EvidenceContext & {
    pullRequest?: PullRequest;
    pullRequestChecks?: PullRequestChecks;
    merged?: unknown;
  };
}) {
  const [checks, setChecks] = useState(item.pullRequestChecks);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const number = item.pullRequest?.number;
  const endpoint = `/api/work-items/${encodeURIComponent(item.slug)}/ship/pr-checks`;
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      setBusy(true);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.reason ?? "Could not refresh PR CI checks.");
        if (!signal?.aborted) {
          setChecks(body.checks);
          setError("");
        }
      } catch (cause) {
        if (!signal?.aborted)
          setError(cause instanceof Error ? cause.message : "Could not refresh PR CI checks.");
      } finally {
        if (!signal?.aborted) setBusy(false);
      }
    },
    [endpoint],
  );
  useEffect(() => {
    setChecks(item.pullRequestChecks);
  }, [item.pullRequestChecks]);
  useEffect(() => {
    if (!number || item.merged) return;
    const controller = new AbortController();
    const timer = setInterval(() => void refresh(controller.signal), 60_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [refresh, number, item.merged]);
  if (!item.pullRequest) return null;
  return (
    <section aria-label="Pull request CI checks">
      <h4>Pull request #{number} · CI checks</h4>
      {!item.merged && (
        <button type="button" className="top-button" disabled={busy} onClick={() => void refresh()}>
          Refresh PR checks
        </button>
      )}
      {error && (
        <p role="alert" className="warning">
          {error}
        </p>
      )}
      {!checks && <p className="muted">No PR CI evidence yet. Refresh to fetch checks.</p>}
      {checks && (
        <>
          <p>
            {checks.state} · <code>{checks.headCommit}</code> ·{" "}
            <time dateTime={checks.fetchedAt}>{checks.fetchedAt}</time>
            {evidenceStale(item, checks.headCommit) && (
              <strong className="warning"> · Stale</strong>
            )}
          </p>
          {!checks.checks.length && <p>No PR CI checks reported; merging is blocked.</p>}
          <ul aria-label="PR CI results">
            {checks.checks.map((check) => (
              <li key={`${check.name}:${check.link}`}>
                {check.name} · {check.bucket}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
