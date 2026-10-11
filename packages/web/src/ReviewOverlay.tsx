// SPDX-License-Identifier: Apache-2.0
import type { DiffFile, DiffLine, WorkItemDiff } from "@stintwork/git";
import type { EvidenceContext, ReviewDecision, StintSummary } from "@stintwork/core";
import { Fragment, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { FindingCard, FindingsRail, reviewFindings } from "./ReviewFindings";
import "./review-overlay.css";

type ReviewSlots = {
  findings?: ReactNode;
  checks?: ReactNode;
  lineFindings?: (file: DiffFile, line: DiffLine, headCommit: string) => ReactNode;
  fileFindings?: (file: DiffFile) => ReactNode;
  outsideDiff?: { path: string; content: ReactNode }[];
};

function Counts({ file }: { file: DiffFile }) {
  return (
    <span className="review-counts">
      {file.binary ? (
        <span className="muted">Binary</span>
      ) : (
        <>
          <span className="success">
            <span aria-hidden="true">+{file.additions}</span>
            <span className="sr-only">{file.additions} added lines</span>
          </span>
          <span className="review-removed-count">
            <span aria-hidden="true">−{file.deletions}</span>
            <span className="sr-only">{file.deletions} removed lines</span>
          </span>
        </>
      )}
    </span>
  );
}

export function ReviewDiff({
  diff,
  lineFindings,
  fileFindings,
  outsideDiff = [],
}: { diff: WorkItemDiff } & Pick<ReviewSlots, "lineFindings" | "fileFindings" | "outsideDiff">) {
  const id = useId();
  if (!diff.files.length && !outsideDiff.length)
    return (
      <p className="review-empty" role="status">
        No changes between the merge base and the branch head.
      </p>
    );
  return (
    <>
      <nav className="review-files" aria-label="Changed files">
        <h3>
          Changed files <span className="count">{diff.files.length}</span>
        </h3>
        <ul>
          {diff.files.map((file, index) => (
            <li key={file.path}>
              <a href={`#${id}-file-${index}`}>
                <code>{file.path}</code>
                <small>{file.status}</small>
                <Counts file={file} />
              </a>
            </li>
          ))}
          {outsideDiff.map((file, index) => (
            <li key={file.path}>
              <a href={`#${id}-outside-${index}`}>
                <code>{file.path}</code>
                <small>Outside the diff</small>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <section className="review-diff" aria-label="Work item diff">
        {diff.files.map((file, fileIndex) => (
          <section key={file.path} id={`${id}-file-${fileIndex}`} data-diff-path={file.path}>
            <header className="review-file-header">
              <h3>
                <code>{file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}</code>
              </h3>
              <span className="muted">{file.status}</span>
              <Counts file={file} />
            </header>
            {fileFindings?.(file)}
            {file.status === "renamed" && (
              <p className="review-file-note">Renamed file — content not shown.</p>
            )}
            {file.binary && <p className="review-file-note">Binary file — content not shown.</p>}
            {!file.binary && file.status !== "renamed" && !file.hunks.length && (
              <p className="review-file-note">No text hunks (file metadata changed).</p>
            )}
            {file.hunks.map((hunk) => (
              <div className="review-hunk" key={`${hunk.oldStart}:${hunk.newStart}`}>
                <h4>
                  <code>{hunk.header}</code>
                </h4>
                <table aria-label={`${file.path}: ${hunk.header}`}>
                  <thead className="sr-only">
                    <tr>
                      <th>Old line</th>
                      <th>New line</th>
                      <th>Change</th>
                      <th>Content</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hunk.lines.map((line) => {
                      const finding = lineFindings?.(file, line, diff.headCommit);
                      return (
                        <Fragment key={`${line.kind}:${line.oldLine}:${line.newLine}`}>
                          <tr
                            className={`review-line review-line-${line.kind}`}
                            data-old-line={line.oldLine ?? undefined}
                            data-new-line={line.newLine ?? undefined}
                          >
                            <td className="review-line-number">{line.oldLine}</td>
                            <td className="review-line-number">{line.newLine}</td>
                            <td className="review-line-marker" aria-label={line.kind}>
                              {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}
                            </td>
                            <td className="review-line-text">
                              <code>{line.text}</code>
                              {line.noNewline && (
                                <span className="review-no-newline">No newline at end of file</span>
                              )}
                            </td>
                          </tr>
                          {finding && (
                            <tr className="review-line-findings">
                              <td colSpan={4}>{finding}</td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </section>
        ))}
        {outsideDiff.map((file, index) => (
          <section key={file.path} id={`${id}-outside-${index}`} data-diff-path={file.path}>
            <header className="review-file-header">
              <h3>
                <code>{file.path}</code>
              </h3>
              <span>Outside the diff</span>
            </header>
            {file.content}
          </section>
        ))}
      </section>
    </>
  );
}

export function ReviewOverlay({
  item,
  onClose,
  findings,
  checks,
  lineFindings,
  fileFindings,
  outsideDiff,
  reviewStageId = "review",
}: {
  item: EvidenceContext & {
    slug: string;
    title: string;
    stints?: StintSummary[];
    reviewDecisions?: ReviewDecision[];
    stage?: string | null;
  };
  onClose: () => void;
  reviewStageId?: string;
} & ReviewSlots) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const findingId = useId();
  const [diff, setDiff] = useState<WorkItemDiff | null>(null);
  const [error, setError] = useState("");
  const [decisions, setDecisions] = useState<ReviewDecision[]>(item.reviewDecisions ?? []);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [sentBack, setSentBack] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => setDecisions(item.reviewDecisions ?? []), [item.reviewDecisions]);
  const evidence = reviewFindings(
    item.stints,
    decisions,
    {
      slug: item.slug,
      headCommit: item.headCommit ?? diff?.headCommit,
      evidenceChangedPaths: item.evidenceChangedPaths,
    },
    reviewStageId,
  );
  async function act(action: "decision" | "send-back", body: object) {
    setSaving(true);
    setActionError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/work-items/${encodeURIComponent(item.slug)}/findings/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.reason ?? "Could not update findings.");
      const updated: ReviewDecision[] = result.decisions ?? [result.decision];
      setDecisions((previous) => [
        ...previous.filter(
          (entry) =>
            !updated.some((decision) => decision.kind === entry.kind && decision.id === entry.id),
        ),
        ...updated,
      ]);
      if (action === "send-back") {
        setSentBack(true);
        setMessage(
          `${result.stageName ?? "Implement"} reopened. Review findings will be included in the next implement brief.`,
        );
      } else setMessage(`Finding recorded as ${result.decision.status}.`);
      return true;
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setSaving(false);
    }
  }
  const onDecision = (id: string, status: "open" | "resolved" | "accepted", reason = "") =>
    act("decision", { id, status, reason });
  const anchor = (finding: { id: string }) => `${findingId}-${finding.id}`;
  const cards = (path: string, line?: number) => {
    const matches = evidence.findings.filter(
      (finding) => finding.path === path && (line === undefined || finding.line === line),
    );
    return matches.length
      ? matches.map((finding) => (
          <FindingCard
            key={finding.id}
            finding={finding}
            anchor={anchor(finding)}
            onDecision={onDecision}
            saving={saving}
          />
        ))
      : null;
  };
  const outOfDiff = (file: DiffFile) => {
    const lines = new Set(file.hunks.flatMap((hunk) => hunk.lines.map((line) => line.newLine)));
    const matches = evidence.findings.filter(
      (finding) => finding.path === file.path && !lines.has(finding.line),
    );
    return matches.length ? (
      <section className="review-outside" aria-label={`${file.path} findings outside the diff`}>
        <h4>Findings outside the diff</h4>
        {matches.map((finding) => (
          <FindingCard
            key={finding.id}
            finding={finding}
            anchor={anchor(finding)}
            onDecision={onDecision}
            saving={saving}
          />
        ))}
      </section>
    ) : null;
  };

  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    closeButton.current?.focus();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  const readDiff = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setDiff(null);
    setError("");
    try {
      const response = await fetch(`/api/work-items/${encodeURIComponent(item.slug)}/diff`, {
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.reason ?? "Could not read the work item diff.");
      if (!controller.signal.aborted) setDiff(body);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [item.slug]);

  useEffect(() => {
    void readDiff();
    return () => request.current?.abort();
  }, [readDiff]);

  return (
    <dialog
      ref={dialog}
      className="review-overlay"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="review-header">
        <div>
          <p className="eyebrow">
            Review / <code>{item.slug}</code>
          </p>
          <h2 id={titleId}>{item.title}</h2>
          <p className="muted">
            Read-only diff · committed changes only; staged and uncommitted changes are not
            included.
          </p>
          {diff && (
            <div className="review-range">
              <p>
                <code>{diff.branch}</code> against <code>{diff.mainBranch}</code>
              </p>
              <p>
                Merge base <code>{diff.mergeBase}</code> · Branch head{" "}
                <code>{diff.headCommit}</code>
              </p>
            </div>
          )}
        </div>
        <div className="review-header-actions">
          <button
            type="button"
            className="top-button"
            disabled={
              saving ||
              sentBack ||
              item.stage !== reviewStageId ||
              !evidence.findings.some((finding) => !finding.historical && finding.status === "open")
            }
            onClick={() => void act("send-back", {})}
          >
            Send back
          </button>
          <button type="button" className="top-button" onClick={() => void readDiff()}>
            Refresh diff
          </button>
          <button
            type="button"
            className="top-button"
            ref={closeButton}
            onClick={onClose}
            aria-label="Close review"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </header>
      {actionError && (
        <p role="alert" className="warning">
          {actionError}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className="review-grid">
        {error ? (
          <p role="alert" className="review-empty warning">
            {error}
          </p>
        ) : diff ? (
          <ReviewDiff
            diff={diff}
            lineFindings={(file, line, head) => {
              const pinned = line.newLine === null ? null : cards(file.path, line.newLine);
              const supplied = lineFindings?.(file, line, head);
              return pinned || supplied ? (
                <>
                  {pinned}
                  {supplied}
                </>
              ) : null;
            }}
            fileFindings={(file) => (
              <>
                {outOfDiff(file)}
                {fileFindings?.(file)}
              </>
            )}
            outsideDiff={
              outsideDiff ??
              [...new Set(evidence.findings.map((finding) => finding.path))]
                .filter((path) => !diff.files.some((file) => file.path === path))
                .map((path) => ({ path, content: cards(path) }))
            }
          />
        ) : (
          <p role="status" className="review-empty muted">
            Reading the work item diff…
          </p>
        )}
        <aside className="review-evidence" aria-label="Review evidence">
          <section aria-label="Findings">
            <h3>Findings</h3>
            {findings ?? <FindingsRail {...evidence} anchor={anchor} />}
          </section>
          <section aria-label="Checks">
            <h3>Checks</h3>
            {checks ?? <p className="muted">Commit-scoped checks will appear here.</p>}
          </section>
        </aside>
      </div>
      <footer className="drawer-footer">
        <span>Work item review</span>
        <span>
          <kbd>Esc</kbd> to return to the work item
        </span>
      </footer>
    </dialog>
  );
}
