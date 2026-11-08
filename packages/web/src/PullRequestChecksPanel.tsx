// SPDX-License-Identifier: Apache-2.0
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { readResponseJson, CoreTextError, useErrorText, useLanguage } from "./i18n/language";
import {
  type PullRequest,
  type PullRequestChecks,
  evidenceStale,
  type EvidenceContext,
} from "@stintwork/core";
import { useCallback, useEffect, useRef, useState } from "react";

export function PullRequestChecksPanel({
  item,
  paused = false,
}: {
  paused?: boolean;
  item: EvidenceContext & {
    pullRequest?: PullRequest;
    pullRequestChecks?: PullRequestChecks;
    merged?: unknown;
  };
}) {
  const { t } = useLanguage();
  const [checks, setChecks] = useState(item.pullRequestChecks);
  const [error, setError] = useErrorText();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const number = item.pullRequest?.number;
  const endpoint = `/api/work-items/${encodeURIComponent(item.slug)}/ship/pr-checks`;
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (inFlight.current || paused) return;
      inFlight.current = true;
      setBusy(true);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          signal,
        });
        const body = await readResponseJson(response);
        if (!response.ok) throw new CoreTextError(body, t.review.pr.refreshError);
        if (!signal?.aborted) {
          setChecks(body.checks);
          setError("");
        }
      } catch (cause) {
        if (!signal?.aborted) setError(cause instanceof Error ? cause : t.review.pr.refreshError);
      } finally {
        inFlight.current = false;
        if (!signal?.aborted) setBusy(false);
      }
    },
    [endpoint, t.review.pr.refreshError, setError, paused],
  );
  useEffect(() => {
    setChecks(item.pullRequestChecks);
  }, [item.pullRequestChecks]);
  useEffect(() => {
    if (!number || item.merged || paused || busy) return;
    const timer = setTimeout(() => void refresh(), 60_000);
    return () => {
      clearTimeout(timer);
    };
  }, [refresh, number, item.merged, paused, busy]);
  if (!item.pullRequest) return null;
  return (
    <section aria-label={t.review.pr.label}>
      <h4>{t.review.pr.heading(number)}</h4>
      {!item.merged && (
        <Button type="button" disabled={busy || paused} onClick={() => void refresh()}>
          {busy ? t.review.pr.checking : t.review.pr.refresh}
        </Button>
      )}
      {error && (
        <p role="alert" className="warning text-warning">
          {error}
        </p>
      )}
      {!checks && <p className="muted text-muted">{t.review.pr.noEvidence}</p>}
      {checks && (
        <>
          <p>
            {Object.hasOwn(t.review.pr.states, checks.state)
              ? t.review.pr.states[checks.state as keyof typeof t.review.pr.states]
              : checks.state}{" "}
            · <code>{checks.headCommit}</code> ·{" "}
            <time dateTime={checks.fetchedAt}>{checks.fetchedAt}</time>
            {evidenceStale(item, checks.headCommit) && (
              <strong className="warning text-warning">{t.review.pr.stale}</strong>
            )}
          </p>
          {!checks.checks.length && <p>{t.review.pr.empty}</p>}
          <ul aria-label={t.review.pr.results}>
            {checks.checks.map((check) => (
              <li key={`${check.name}:${check.link}`}>
                {check.name} ·{" "}
                <Badge
                  variant={
                    check.bucket === "pass"
                      ? "success"
                      : check.bucket === "fail"
                        ? "danger"
                        : "warning"
                  }
                >
                  {Object.hasOwn(t.review.pr.buckets, check.bucket)
                    ? t.review.pr.buckets[check.bucket as keyof typeof t.review.pr.buckets]
                    : check.bucket}
                </Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
