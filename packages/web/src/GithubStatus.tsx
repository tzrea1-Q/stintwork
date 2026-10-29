// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "@stintwork/core";
import { useCallback, useEffect, useState } from "react";
import { renderCoreText, useLanguage } from "./i18n/language";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";

export function GithubStatus({ github }: { github?: ProjectSnapshot["github"] }) {
  const { t, language } = useLanguage();
  const copy = t.board.githubStatus;
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryAction, setRetryAction] = useState<"refresh" | "load-more">();
  const [waiting, setWaiting] = useState<{
    action: "refresh" | "load-more";
    attempts: number;
    snapshot: typeof github;
  }>();
  const [now, setNow] = useState(Date.now());
  const retryAt = github?.retryAt ? Date.parse(github.retryAt) : 0;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function tick() {
      const current = Date.now();
      setNow(current);
      if (retryAt > current) timer = setTimeout(tick, Math.min(retryAt - current, 2_147_483_647));
    }
    tick();
    return () => clearTimeout(timer);
  }, [retryAt]);
  const time = (value: string) => new Date(value).toLocaleString(language);
  const code = github?.errorCode;
  const error =
    code && Object.hasOwn(copy.errors, code)
      ? copy.errors[code as keyof typeof copy.errors]
      : undefined;
  const warnings = (github?.warnings ?? []) as unknown[];
  const incompleteCount = github?.items.filter((item) => !item.complete).length ?? 0;
  const unavailable = !!github?.error && !github.fetchedAt && !github.repositoryId;
  const act = useCallback(
    async (action: "refresh" | "load-more", attempts = 1) => {
      setPending(true);
      setFailed(false);
      setRetryAction(undefined);
      try {
        const response = await fetch(`/api/github/discovery/${action}`, { method: "POST" });
        if (response.status === 409 && attempts < 3) {
          setWaiting({ action, attempts, snapshot: github });
          return;
        }
        if (!response.ok) throw new Error();
        window.dispatchEvent(new Event("stintwork:refresh-project"));
      } catch {
        setFailed(true);
        setRetryAction(action);
      }
      setPending(false);
    },
    [github],
  );
  useEffect(() => {
    const retry = waiting;
    if (!retry) return;
    if (retry.action === "load-more" && !github?.cursor) {
      setWaiting(undefined);
      setPending(false);
      return;
    }
    const run = () => {
      setWaiting(undefined);
      void act(retry.action, retry.attempts + 1);
    };
    if (retry.snapshot !== github) {
      run();
      return;
    }
    const timer = setTimeout(run, retry.attempts === 1 ? 2000 : 5000);
    return () => clearTimeout(timer);
  }, [waiting, github, act]);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={copy.label}
      className="min-w-0 space-y-3 px-4 py-3 text-sm text-muted sm:px-6"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {unavailable && <strong>{copy.unavailable}</strong>}
          {github?.discoveryFailed && github.fetchedAt && (
            <p>{copy.stale.replace("{time}", time(github.fetchedAt))}</p>
          )}
          {github && !unavailable && !github.discoveryFailed && github.fetchedAt && (
            <p>
              {copy.fetched
                .replace("{time}", time(github.fetchedAt))
                .replace("{count}", String(github.scanned))}
            </p>
          )}
          {github && !unavailable && (github.discoveryFailed || !github.fetchedAt) && (
            <p>{copy.scanned.replace("{count}", String(github.scanned))}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button disabled={pending || retryAt > now} onClick={() => void act("refresh")}>
            {pending ? copy.pending : github?.discoveryFailed ? copy.retry : copy.refresh}
          </Button>
          {github?.cursor && (
            <Button disabled={pending || retryAt > now} onClick={() => void act("load-more")}>
              {copy.loadMore}
            </Button>
          )}
        </div>
      </div>
      {github &&
        !unavailable &&
        (!github.complete || github.cursor || warnings.length > 0 || incompleteCount > 0) && (
          <div className="min-w-0 space-y-1">
            <p className="min-w-0 [overflow-wrap:anywhere]">
              <Badge variant="warning" className="mr-2">
                {copy.errors.incomplete}
              </Badge>
              {warnings.length || incompleteCount
                ? copy.connectionsFailed
                : github.cursor
                  ? copy.morePages
                  : copy.errors.incomplete}
            </p>
            {incompleteCount > 0 && (
              <p>{copy.incompleteItems.replace("{count}", String(incompleteCount))}</p>
            )}
            {warnings.length > 0 && (
              <ul className="list-disc pl-4 [overflow-wrap:anywhere]">
                {warnings.map((warning) => {
                  const text =
                    typeof warning === "string"
                      ? warning
                      : ((warning as { text?: string }).text ?? "");
                  return <li key={text}>{renderCoreText(warning, text, t)}</li>;
                })}
              </ul>
            )}
          </div>
        )}
      {error && !(error === copy.errors.incomplete && !unavailable) && <p>{error}</p>}
      {failed && <p>{copy.requestFailed}</p>}
      {retryAction && <Button onClick={() => void act(retryAction)}>{copy.retry}</Button>}
      {retryAt > now && github?.retryAt && (
        <p>{copy.retryAt.replace("{time}", time(github.retryAt))}</p>
      )}
    </div>
  );
}
