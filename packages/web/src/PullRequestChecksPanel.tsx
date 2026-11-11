// SPDX-License-Identifier: Apache-2.0

import {
  type EvidenceContext,
  evidenceStale,
  type PullRequest,
  type PullRequestChecks,
} from "@stintwork/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { CoreTextError, readResponseJson, useErrorText, useLanguage } from "./i18n/language";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";

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
  const inFlight = useRef<AbortController | null>(null);
  const number = item.pullRequest?.number;
  const url = item.pullRequest?.url;
  const head = item.pullRequest?.headCommit;
  const prIdentity = JSON.stringify([item.slug, number, url]);
  const identity = JSON.stringify([item.slug, number, url, head]);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const checksIdentity = useRef(prIdentity);
  const endpoint = `/api/work-items/${encodeURIComponent(item.slug)}/ship/pr-checks`;
  const refresh = useCallback(async () => {
    if (inFlight.current || paused) return;
    const controller = new AbortController();
    const { signal } = controller;
    inFlight.current = controller;
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
      if (
        !signal.aborted &&
        currentIdentity.current === identity &&
        body.checks?.number === number
      ) {
        setChecks((current) =>
          current &&
          body.checks &&
          current.number === body.checks.number &&
          Date.parse(current.fetchedAt) >= Date.parse(body.checks.fetchedAt)
            ? current
            : body.checks,
        );
        setError("");
      }
    } catch (cause) {
      if (!signal.aborted && currentIdentity.current === identity)
        setError(cause instanceof Error ? cause : t.review.pr.refreshError);
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        setBusy(false);
      }
    }
  }, [endpoint, t.review.pr.refreshError, setError, paused, identity, number]);
  // The cleanup must also run when the recorded PR identity changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: identity scopes the request lifetime.
  useEffect(() => {
    return () => {
      inFlight.current?.abort();
      inFlight.current = null;
      setBusy(false);
    };
  }, [identity]);
  useEffect(() => {
    const changed = checksIdentity.current !== prIdentity;
    checksIdentity.current = prIdentity;
    setChecks((current) =>
      !changed &&
      current &&
      (!item.pullRequestChecks ||
        (current.number === item.pullRequestChecks.number &&
          Date.parse(current.fetchedAt) >= Date.parse(item.pullRequestChecks.fetchedAt)))
        ? current
        : item.pullRequestChecks,
    );
  }, [prIdentity, item.pullRequestChecks]);
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
        <p role="alert" className="warning text-attention-foreground">
          {error}
        </p>
      )}
      {!checks && <p className="muted text-muted-foreground">{t.review.pr.noEvidence}</p>}
      {checks && (
        <>
          <p>
            {Object.hasOwn(t.review.pr.states, checks.state)
              ? t.review.pr.states[checks.state as keyof typeof t.review.pr.states]
              : checks.state}{" "}
            · <code>{checks.headCommit}</code> ·{" "}
            <time dateTime={checks.fetchedAt}>{checks.fetchedAt}</time>
            {evidenceStale(item, checks.headCommit) && (
              <strong className="warning text-attention-foreground">{t.review.pr.stale}</strong>
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
