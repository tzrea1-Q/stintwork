// SPDX-License-Identifier: Apache-2.0
import type { Stint, StintSummary } from "@stintwork/core";
import { useEffect, useId, useState } from "react";
import { HandoffCard } from "./HandoffCard";
import { StintStream } from "./StintStream";

function StintHistoryEntry({ stint }: { stint: StintSummary }) {
  const replayId = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [replay, setReplay] = useState<Stint | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setReplay(null);
    void (async () => {
      try {
        const response = await fetch(`/api/stints/${encodeURIComponent(stint.id)}`, {
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            typeof body.reason === "string" ? body.reason : "Could not read stint history.",
          );
        if (stint.status !== "running" && body.stint.status === "running")
          throw new Error("Stint history is not up to date. Try again.");
        if (!controller.signal.aborted) setReplay(body.stint);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Could not read stint history.");
          setOpen(false);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [open, stint.id, stint.status]);

  const recorded = open && replay?.status === stint.status ? replay : stint;
  return (
    <li>
      <p>
        {recorded.agent} · {recorded.ticket === null ? "No ticket" : `Ticket ${recorded.ticket}`} ·{" "}
        <strong>{recorded.status}</strong>
      </p>
      <p className="muted">
        Started <time dateTime={recorded.startedAt}>{recorded.startedAt}</time>
        {recorded.endedAt && (
          <>
            {" "}
            · Ended <time dateTime={recorded.endedAt}>{recorded.endedAt}</time>
          </>
        )}
      </p>
      {recorded.error && (
        <p className="warning" role="alert">
          {recorded.error}
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
        {loading ? "Reading stint…" : `${open ? "Close" : "Open"} stint ${stint.id}`}
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
        <p className="muted">No checkpoint recorded.</p>
      )}
    </li>
  );
}

export function StintHistory({ stints }: { stints: StintSummary[] }) {
  return stints.length ? (
    <ol aria-label="Stint history">
      {stints.map((stint) => (
        <StintHistoryEntry key={stint.id} stint={stint} />
      ))}
    </ol>
  ) : (
    <p className="muted">No stints yet.</p>
  );
}
