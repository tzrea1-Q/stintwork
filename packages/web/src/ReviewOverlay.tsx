import type { DiffFile, DiffLine, WorkItemDiff } from "@stintwork/git";
import { Fragment, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import "./review-overlay.css";

type ReviewSlots = {
  findings?: ReactNode;
  checks?: ReactNode;
  lineFindings?: (file: DiffFile, line: DiffLine, headCommit: string) => ReactNode;
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
}: { diff: WorkItemDiff } & Pick<ReviewSlots, "lineFindings">) {
  const id = useId();
  if (!diff.files.length)
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
}: {
  item: { slug: string; title: string };
  onClose: () => void;
} & ReviewSlots) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [diff, setDiff] = useState<WorkItemDiff | null>(null);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);

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
            Read-only · committed changes only; staged and uncommitted changes are not included.
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
      <div className="review-grid">
        {error ? (
          <p role="alert" className="review-empty warning">
            {error}
          </p>
        ) : diff ? (
          <ReviewDiff diff={diff} lineFindings={lineFindings} />
        ) : (
          <p role="status" className="review-empty muted">
            Reading the work item diff…
          </p>
        )}
        <aside className="review-evidence" aria-label="Review evidence">
          <section aria-label="Findings">
            <h3>Findings</h3>
            {findings ?? (
              <p className="muted">
                Review findings will appear here, with line findings pinned in the diff.
              </p>
            )}
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
