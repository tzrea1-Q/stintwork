// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import { evidenceStale, type MergeMethod, type PullRequestPreview } from "@stintwork/core";
import type { BoardWorkItem } from "./WorkItemCard";

export function ShipActions({ item }: { item: BoardWorkItem }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paths, setPaths] = useState<string[]>([]);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<PullRequestPreview | null>(null);
  const [mergeMethod, setMergeMethod] = useState<MergeMethod | null>(null);
  const [opened, setOpened] = useState(item.pullRequest);
  const pullRequest = item.pullRequest ?? opened;
  const ci = item.pullRequestChecks;
  const mergeReady =
    !!item.stages.review?.approved &&
    !!ci &&
    ci.checks.length > 0 &&
    ci.checks.every((check) => check.bucket === "pass") &&
    !evidenceStale(item, ci.headCommit);
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
  async function action(
    name: "merge-local" | "send-back" | "preview-pr" | "open-pr" | "preview-merge-pr" | "merge-pr",
  ) {
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
          body: JSON.stringify(
            name === "open-pr"
              ? { confirmation: preview?.confirmation }
              : name === "merge-pr"
                ? { mergeMethod }
                : {},
          ),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setConflicts(result.conflicts ?? []);
        setPaths(result.paths ?? []);
        throw new Error(result.reason ?? "Could not ship the work item.");
      }
      if (name === "preview-pr") {
        setPreview(result.preview);
        return;
      }
      if (name === "preview-merge-pr") {
        setMergeMethod(result.mergeMethod);
        return;
      }
      if (name === "open-pr") {
        setOpened(result.pullRequest);
        setPreview(null);
        return;
      }
      setMessage(
        name === "merge-local" || name === "merge-pr"
          ? `Shipped ${name === "merge-pr" ? `through pull request #${pullRequest?.number}` : "locally"} at ${result.merged.commit}.`
          : `Sent back to ${result.stageName}.`,
      );
      setMergeMethod(null);
    } catch (cause) {
      if (name === "open-pr") setPreview(null);
      if (name === "merge-pr") setMergeMethod(null);
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
          {item.merged.pr && (
            <>
              {" "}
              · Pull request #{item.merged.pr}
              {item.merged.method && <> ({item.merged.method})</>}
            </>
          )}
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
          {pullRequest ? (
            <>
              <p>
                Pull request #{pullRequest.number} ·{" "}
                <a href={pullRequest.url} target="_blank" rel="noreferrer">
                  View on GitHub
                </a>
              </p>
              <p>Merge rechecks every CI check and the approved Review gate.</p>
              {!mergeReady && (
                <p>Approve the Review gate and refresh passing PR CI checks before merging.</p>
              )}
              <button
                type="button"
                className="top-button"
                disabled={busy || blockers.length > 0 || !!message || !mergeReady}
                onClick={() => void action("preview-merge-pr")}
              >
                Merge pull request
              </button>
              {mergeMethod && (
                <section role="dialog" aria-modal="false" aria-label="Confirm pull request merge">
                  <h4>Confirm pull request merge</h4>
                  <p>
                    Pull request #{pullRequest.number} → <code>{pullRequest.base}</code> · Merge
                    method: <strong>{mergeMethod}</strong>
                  </p>
                  <button
                    type="button"
                    className="top-button"
                    disabled={busy || blockers.length > 0 || !!message || !mergeReady}
                    onClick={() => void action("merge-pr")}
                  >
                    Confirm {mergeMethod} merge
                  </button>
                  <button
                    type="button"
                    className="top-button"
                    disabled={busy}
                    onClick={() => setMergeMethod(null)}
                  >
                    Cancel
                  </button>
                </section>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                className="top-button"
                disabled={busy || blockers.length > 0 || !!message}
                onClick={() => void action("merge-local")}
              >
                {busy ? "Working…" : "Merge locally"}
              </button>
              <button
                type="button"
                className="top-button"
                disabled={busy || blockers.length > 0 || !!message}
                onClick={() => void action("preview-pr")}
              >
                Open pull request
              </button>
            </>
          )}
          {preview && (
            <section role="dialog" aria-modal="false" aria-label="Confirm publishing pull request">
              <h4>Confirm push and pull request</h4>
              <p>Publishing sends this code to the remote. Nothing is pushed until you confirm.</p>
              <p>
                Remote: <code>{preview.remote}</code> · <code>{preview.remoteUrl}</code>
              </p>
              <p>
                Branch: <code>{preview.branch}</code> → <code>{preview.base}</code>
              </p>
              <p>
                Commit: <code>{preview.headCommit}</code>
              </p>
              <p>Title: {preview.title}</p>
              <pre>{preview.body}</pre>
              <button
                type="button"
                className="top-button"
                disabled={busy}
                onClick={() => void action("open-pr")}
              >
                Confirm push and open pull request
              </button>
              <button
                type="button"
                className="top-button"
                disabled={busy}
                onClick={() => setPreview(null)}
              >
                Cancel
              </button>
            </section>
          )}
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
