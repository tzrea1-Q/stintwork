import { useState } from "react";
import type { BoardWorkItem } from "./WorkItemCard";

export function ShipActions({ item }: { item: BoardWorkItem }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paths, setPaths] = useState<string[]>([]);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  if (item.stage !== "ship" && !item.merged) return null;
  const blockers = [
    ...(item.activeStint || item.stints.some(({ status }) => status === "running")
      ? ["Finish or stop the running stint before shipping."]
      : []),
    ...(item.memoryProposals?.length
      ? ["Accept or reject every open memory proposal before shipping."]
      : []),
    ...(item.checkExecution?.endedAt === null ? ["Cancel or finish checks before shipping."] : []),
    ...(item.reviewEvidenceError ? [item.reviewEvidenceError] : []),
  ];
  async function action(name: "merge-local" | "send-back") {
    setBusy(true);
    setError("");
    setPaths([]);
    setConflicts([]);
    try {
      const response = await fetch(
        `/api/work-items/${encodeURIComponent(item.slug)}/ship/${name}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setConflicts(result.conflicts ?? []);
        setPaths(result.paths ?? []);
        throw new Error(result.reason ?? "Could not ship the work item.");
      }
      setMessage(
        name === "merge-local"
          ? `Shipped locally at ${result.merged.commit}.`
          : `Sent back to ${result.stageName}.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not ship the work item.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Ship actions" className="handoff-card">
      <h3 className="drawer-section-heading">{item.merged ? "Shipped" : "Ship"}</h3>
      {item.merged ? (
        <p>
          Merged at <time dateTime={item.merged.at}>{item.merged.at}</time> ·{" "}
          <code>{item.merged.commit}</code>
        </p>
      ) : (
        <>
          <p>
            Merge into the main checkout, record the merge, then remove the worktree and branch.
          </p>
          {blockers.length > 0 && (
            <ul aria-label="Shipping refusals">
              {blockers.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="top-button"
            disabled={busy || blockers.length > 0 || !!message}
            onClick={() => void action("merge-local")}
          >
            {busy ? "Working…" : "Merge locally"}
          </button>
          {conflicts.length > 0 && (
            <section aria-label="Merge conflicts">
              <h4>Merge conflicts</h4>
              <ul>
                {conflicts.map((path) => (
                  <li key={path}>
                    <code>{path}</code>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="top-button"
                disabled={busy}
                onClick={() => void action("send-back")}
              >
                Send back
              </button>
            </section>
          )}
        </>
      )}
      {paths.length > 0 && (
        <ul aria-label="Uncommitted merge paths">
          {paths.map((path) => (
            <li key={path}>
              <code>{path}</code>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="warning">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
