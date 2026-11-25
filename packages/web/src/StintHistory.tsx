// SPDX-License-Identifier: Apache-2.0

import type { AgentProfile, Stint, StintSummary } from "@stintwork/core";
import { useEffect, useId, useState } from "react";
import { agentName } from "./agent-name";
import { formatDuration } from "./duration";
import { HandoffCard } from "./HandoffCard";
import {
  CoreTextError,
  readResponseJson,
  renderCoreText,
  useErrorText,
  useLanguage,
} from "./i18n/language";
import { StintRecovery } from "./StintRecovery";
import { StintStream } from "./StintStream";
import { shortStintId } from "./short-id";
import { fullTime, relativeTime } from "./time";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Empty, EmptyDescription } from "./ui/Empty";

function StintHistoryEntry({
  stint,
  github,
  agents,
}: {
  stint: StintSummary;
  github: boolean;
  agents: AgentProfile[];
}) {
  const { t, language } = useLanguage();
  const replayId = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [replay, setReplay] = useState<Stint | null>(null);
  const [error, setError] = useErrorText({
    readHistoryFailed: t.stints.readHistoryFailed,
    staleHistory: t.stints.staleHistory,
  });

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setReplay(null);
    void (async () => {
      let fallback: "readHistoryFailed" | "staleHistory" = "readHistoryFailed";
      try {
        const response = await fetch(`/api/stints/${encodeURIComponent(stint.id)}`, {
          signal: controller.signal,
          ...(stint.recovery?.state ? { cache: "no-store" as const } : {}),
        });
        const body = await readResponseJson(response);
        if (!response.ok) throw new CoreTextError(body, "");
        if (stint.status !== "running" && body.stint.status === "running") {
          fallback = "staleHistory";
          throw new Error();
        }
        if (!controller.signal.aborted) setReplay(body.stint);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error && cause.message ? cause : { key: fallback });
          setOpen(false);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [open, stint.id, stint.status, stint.recovery?.state, setError]);

  const recorded = open && replay?.status === stint.status ? replay : stint;
  const now = Date.now();
  return (
    <li className="border-t border-border py-4">
      <p>
        {agentName(recorded.agent, agents)} ·{" "}
        {recorded.ticket === null
          ? t.stints.noTicket
          : t.stints.briefTicket(recorded.ticket, github)}{" "}
        ·{" "}
        <Badge
          variant={
            recorded.status === "finished"
              ? "success"
              : recorded.status === "failed" || recorded.status === "preparation-failed"
                ? "danger"
                : "secondary"
          }
        >
          {t.stints.statuses[recorded.status]}
        </Badge>
      </p>
      <p className="muted text-muted-foreground">
        {t.stints.started}{" "}
        <time dateTime={recorded.startedAt} title={fullTime(recorded.startedAt, language)}>
          {relativeTime(recorded.startedAt, now, language)}
        </time>
        {recorded.endedAt && (
          <>
            {" "}
            ·{" "}
            <time dateTime={recorded.endedAt} title={fullTime(recorded.endedAt, language)}>
              {formatDuration(
                (Date.parse(recorded.endedAt) - Date.parse(recorded.startedAt)) / 60000,
                t,
              )}
            </time>
          </>
        )}
        {!recorded.endedAt && (
          <> · {formatDuration((now - Date.parse(recorded.startedAt)) / 60000, t)}</>
        )}
      </p>
      {!(open && replay) && <StintRecovery stint={stint} />}
      {recorded.error && recorded.recovery?.state !== "fallback" && (
        <p className="warning text-attention-foreground" role="alert">
          {renderCoreText(recorded.errorMessage, recorded.error, t)}
        </p>
      )}
      <Button
        type="button"
        aria-expanded={open}
        aria-label={
          loading
            ? t.stints.readingStint
            : open
              ? t.stints.closeStint(stint.id)
              : t.stints.openStint(stint.id)
        }
        aria-controls={replayId}
        disabled={loading}
        onClick={() => setOpen(!open)}
      >
        {loading
          ? t.stints.readingStint
          : open
            ? t.stints.closeStint(shortStintId(stint.id))
            : t.stints.openStint(shortStintId(stint.id))}
      </Button>
      {error && (
        <p className="warning text-attention-foreground" role="alert">
          {error}
        </p>
      )}
      <div id={replayId} hidden={!open}>
        {open && replay && <StintStream stint={replay} replay />}
      </div>
      {recorded.status !== "running" ? (
        <HandoffCard stint={recorded} />
      ) : (
        <p className="muted text-muted-foreground">{t.stints.noCheckpoint}</p>
      )}
    </li>
  );
}

export function StintHistory({
  stints,
  github = false,
  agents = [],
}: {
  stints: StintSummary[];
  github?: boolean;
  agents?: AgentProfile[];
}) {
  const { t } = useLanguage();
  return stints.length ? (
    <ol aria-label={t.stints.history}>
      {stints.map((stint) => (
        <StintHistoryEntry key={stint.id} stint={stint} github={github} agents={agents} />
      ))}
    </ol>
  ) : (
    <Empty>
      <EmptyDescription>{t.stints.noStints}</EmptyDescription>
    </Empty>
  );
}
