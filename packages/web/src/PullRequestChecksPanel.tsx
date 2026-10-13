// SPDX-License-Identifier: Apache-2.0
import {
  type PullRequest,
  type PullRequestChecks,
  evidenceStale,
  type EvidenceContext,
} from "@stintwork/core";
import { useCallback, useEffect, useState } from "react";
import { CoreTextError, useCoreTextError, useLanguage } from "./i18n/language";

export function PullRequestChecksPanel({
  item,
}: {
  item: EvidenceContext & {
    pullRequest?: PullRequest;
    pullRequestChecks?: PullRequestChecks;
    merged?: unknown;
  };
}) {
  const { t } = useLanguage();
  const [checks, setChecks] = useState(item.pullRequestChecks);
  const [error, setError] = useCoreTextError();
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
        if (!response.ok) throw new CoreTextError(body, t.review.pr.refreshError);
        if (!signal?.aborted) {
          setChecks(body.checks);
          setError("");
        }
      } catch (cause) {
        if (!signal?.aborted) setError(cause instanceof Error ? cause : t.review.pr.refreshError);
      } finally {
        if (!signal?.aborted) setBusy(false);
      }
    },
    [endpoint, t.review.pr.refreshError, setError],
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
    <section aria-label={t.review.pr.label}>
      <h4>{t.review.pr.heading(number)}</h4>
      {!item.merged && (
        <button type="button" className="top-button" disabled={busy} onClick={() => void refresh()}>
          {t.review.pr.refresh}
        </button>
      )}
      {error && (
        <p role="alert" className="warning">
          {error}
        </p>
      )}
      {!checks && <p className="muted">{t.review.pr.noEvidence}</p>}
      {checks && (
        <>
          <p>
            {Object.hasOwn(t.review.pr.states, checks.state)
              ? t.review.pr.states[checks.state as keyof typeof t.review.pr.states]
              : checks.state}{" "}
            · <code>{checks.headCommit}</code> ·{" "}
            <time dateTime={checks.fetchedAt}>{checks.fetchedAt}</time>
            {evidenceStale(item, checks.headCommit) && (
              <strong className="warning">{t.review.pr.stale}</strong>
            )}
          </p>
          {!checks.checks.length && <p>{t.review.pr.empty}</p>}
          <ul aria-label={t.review.pr.results}>
            {checks.checks.map((check) => (
              <li key={`${check.name}:${check.link}`}>
                {check.name} ·{" "}
                {Object.hasOwn(t.review.pr.buckets, check.bucket)
                  ? t.review.pr.buckets[check.bucket as keyof typeof t.review.pr.buckets]
                  : check.bucket}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
