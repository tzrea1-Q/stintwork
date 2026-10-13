// SPDX-License-Identifier: Apache-2.0
import {
  readResponseJson,
  CoreTextError,
  renderCoreText,
  useErrorText,
  useLanguage,
} from "./i18n/language";
import type { Stint, StintSummary } from "@stintwork/core";
import { useEffect, useId, useState } from "react";
import { HandoffCard } from "./HandoffCard";
import { StintStream } from "./StintStream";

function StintHistoryEntry({ stint }: { stint: StintSummary }) {
  const { t, language } = useLanguage();
  const date = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "medium" });
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
  }, [open, stint.id, stint.status, setError]);

  const recorded = open && replay?.status === stint.status ? replay : stint;
  return (
    <li>
      <p>
        {recorded.agent} ·{" "}
        {recorded.ticket === null ? t.stints.noTicket : t.stints.ticket(recorded.ticket)} ·{" "}
        <strong>{t.stints.statuses[recorded.status]}</strong>
      </p>
      <p className="muted">
        {t.stints.started}{" "}
        <time dateTime={recorded.startedAt}>
          {language === "en" ? recorded.startedAt : date.format(new Date(recorded.startedAt))}
        </time>
        {recorded.endedAt && (
          <>
            {" "}
            {t.stints.ended}{" "}
            <time dateTime={recorded.endedAt}>
              {language === "en" ? recorded.endedAt : date.format(new Date(recorded.endedAt))}
            </time>
          </>
        )}
      </p>
      {recorded.error && (
        <p className="warning" role="alert">
          {renderCoreText(recorded.errorMessage, recorded.error, t)}
        </p>
      )}
      <button
        type="button"
        className="action"
        aria-expanded={open}
        aria-controls={replayId}
        disabled={loading}
        onClick={() => setOpen(!open)}
      >
        {loading
          ? t.stints.readingStint
          : open
            ? t.stints.closeStint(stint.id)
            : t.stints.openStint(stint.id)}
      </button>
      {error && (
        <p className="warning" role="alert">
          {error}
        </p>
      )}
      <div id={replayId} hidden={!open}>
        {open && replay && <StintStream stint={replay} replay />}
      </div>
      {recorded.status !== "running" ? (
        <HandoffCard stint={recorded} />
      ) : (
        <p className="muted">{t.stints.noCheckpoint}</p>
      )}
    </li>
  );
}

export function StintHistory({ stints }: { stints: StintSummary[] }) {
  const { t } = useLanguage();
  return stints.length ? (
    <ol aria-label={t.stints.history}>
      {stints.map((stint) => (
        <StintHistoryEntry key={stint.id} stint={stint} />
      ))}
    </ol>
  ) : (
    <p className="muted">{t.stints.noStints}</p>
  );
}
