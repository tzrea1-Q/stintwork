// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "@stintwork/core";
import { useEffect, useState } from "react";
import { useLanguage } from "./i18n/language";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";

export function GithubStatus({ github }: { github?: ProjectSnapshot["github"] }) {
  const { t, language } = useLanguage();
  const copy = t.board.githubStatus;
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
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
  const unavailable = !!github?.error && !github.fetchedAt && !github.repositoryId;
  async function act(action: "refresh" | "load-more") {
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/github/discovery/${action}`, { method: "POST" });
      if (!response.ok) throw new Error();
      window.dispatchEvent(new Event("stintwork:refresh-project"));
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={copy.label}
      className="flex min-w-0 flex-wrap items-center gap-3 px-4 py-3 text-sm text-muted sm:px-6"
    >
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
      {github && !unavailable && (!github.complete || github.cursor) && (
        <Badge variant="warning">{copy.errors.incomplete}</Badge>
      )}
      {error && !(error === copy.errors.incomplete && !unavailable) && <p>{error}</p>}
      {failed && <p>{copy.requestFailed}</p>}
      {retryAt > now && github?.retryAt && (
        <p>{copy.retryAt.replace("{time}", time(github.retryAt))}</p>
      )}
      <Button disabled={pending || retryAt > now} onClick={() => void act("refresh")}>
        {pending ? copy.pending : github?.discoveryFailed ? copy.retry : copy.refresh}
      </Button>
      {github?.cursor && (
        <Button disabled={pending || retryAt > now} onClick={() => void act("load-more")}>
          {copy.loadMore}
        </Button>
      )}
    </div>
  );
}
