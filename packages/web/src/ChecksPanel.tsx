// SPDX-License-Identifier: Apache-2.0

import {
  type CheckExecution,
  evidenceStale,
  type ProjectSnapshot,
  type WorkItemChecks,
} from "@stintwork/core";
import { Check, Circle, LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CoreTextError, readResponseJson, useErrorText, useLanguage } from "./i18n/language";
import { PullRequestChecksPanel } from "./PullRequestChecksPanel";
import { Button } from "./ui/Button";
import { CodeBlock } from "./ui/CodeBlock";
import { IconChip } from "./ui/IconChip";
import { Item, ItemContent, ItemMedia } from "./ui/Item";
import { SegmentedProgress } from "./ui/SegmentedProgress";

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
> &
  Partial<Pick<ProjectSnapshot["workItems"][number], "activeStint" | "stints">>;

export function ChecksPanel({
  item,
  shipPaused = false,
}: {
  item: ChecksItem;
  shipPaused?: boolean;
}) {
  const { t } = useLanguage();
  const [data, setData] = useState<WorkItemChecks | null>(null);
  const [error, setError] = useErrorText();
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
        const body = await readResponseJson(response);
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
      const body = await readResponseJson(response);
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
      <PullRequestChecksPanel item={item} paused={shipPaused} />
      <p className="muted text-muted-foreground">
        {item.merged ? t.review.checks.shippedEvidence : t.review.checks.commandsExplanation}
      </p>
      {!item.merged && (
        <div className="checks-actions my-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            disabled={
              busy ||
              active ||
              !!item.activeStint ||
              item.stints?.some((stint) => stint.status === "running") ||
              !data?.commands.length
            }
            onClick={() => void action(false)}
          >
            {t.review.checks.run}
          </Button>
          {active && (
            <Button type="button" disabled={busy} onClick={() => void action(true)}>
              {t.review.checks.cancel}
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="warning text-attention-foreground">
          {error}
        </p>
      )}
      {!data && !error && !item.merged && (
        <p className="muted text-muted-foreground">{t.review.checks.reading}</p>
      )}
      {data && !data.commands.length && (
        <p className="muted text-muted-foreground">{t.review.checks.notConfigured}</p>
      )}
      {data && !results.length && data.commands.length > 0 && (
        <p className="muted text-muted-foreground">{t.review.checks.noEvidence}</p>
      )}
      {results.length > 0 && (
        <div className="my-3 space-y-2">
          <p>
            {`${results.filter((result) => result.status === "passed").length} ${t.review.visualRefresh07.of} ${results.length} ${t.review.visualRefresh07.passing}`}
          </p>
          <SegmentedProgress
            value={results.filter((result) => result.status === "passed").length}
            total={results.length}
            label={`${results.filter((result) => result.status === "passed").length} ${t.review.visualRefresh07.of} ${results.length} ${t.review.visualRefresh07.passing}`}
            tone="success"
          />
        </div>
      )}
      <ul
        className="check-results list-none p-0 [&>li]:border-t [&>li]:border-border [&>li]:py-3 [&_code]:[overflow-wrap:anywhere] [&_pre]:max-h-60"
        aria-label={t.review.checks.latest}
      >
        {results.map((result) => (
          <li key={result.name}>
            <Item variant="outline" size="sm">
              <ItemMedia>
                <IconChip
                  icon={
                    result.status === "passed"
                      ? Check
                      : result.status === "failed"
                        ? X
                        : result.status === "running"
                          ? LoaderCircle
                          : Circle
                  }
                  tone={
                    result.status === "passed"
                      ? "success"
                      : result.status === "failed"
                        ? "blocked"
                        : result.status === "running"
                          ? "running"
                          : "stopped"
                  }
                  label={t.review.checks.statuses[result.status]}
                />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <strong>{result.name}</strong>
                <span>{t.review.checks.statuses[result.status]}</span>
                {evidenceStale(evidence, result.commit) && (
                  <strong className="rounded bg-attention-soft text-attention-foreground">
                    {t.review.checks.stale}
                  </strong>
                )}
                <p className="font-mono text-xs text-muted-foreground">
                  {result.commit} · {t.review.checks.duration(result.durationMs)}
                </p>
              </ItemContent>
            </Item>
            <details open={result.status === "running" || result.status === "failed"}>
              <summary>{t.review.checks.commandOutput(result.name)}</summary>
              <code>{result.command}</code>
              <div
                role="log"
                aria-label={t.review.checks.output(result.name)}
                aria-live={result.status === "running" ? "polite" : "off"}
              >
                <CodeBlock>{result.outputExcerpt || t.review.checks.noOutput}</CodeBlock>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
