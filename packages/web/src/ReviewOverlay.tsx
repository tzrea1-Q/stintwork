// SPDX-License-Identifier: Apache-2.0
import type { DiffFile, DiffLine, WorkItemDiff } from "@stintwork/git";
import type { EvidenceContext, ReviewDecision, StintSummary } from "@stintwork/core";
import { Fragment, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { FindingCard, FindingsRail, reviewFindings } from "./ReviewFindings";
import { CheckpointWarnings } from "./CheckpointWarnings";
import { RiskyPaths } from "./RiskyPaths";
import type { RiskyPath } from "@stintwork/core";
import { CoreTextError, useCoreTextError, useLanguage } from "./i18n/language";
import "./review-overlay.css";

type ReviewSlots = {
  findings?: ReactNode;
  checks?: ReactNode;
  lineFindings?: (file: DiffFile, line: DiffLine, headCommit: string) => ReactNode;
  fileFindings?: (file: DiffFile) => ReactNode;
  outsideDiff?: { path: string; content: ReactNode }[];
};

function Counts({ file }: { file: DiffFile }) {
  const { t } = useLanguage();
  return (
    <span className="review-counts">
      {file.binary ? (
        <span className="muted">{t.review.diff.binary}</span>
      ) : (
        <>
          <span className="success">
            <span aria-hidden="true">+{file.additions}</span>
            <span className="sr-only">{t.review.diff.addedLines(file.additions)}</span>
          </span>
          <span className="review-removed-count">
            <span aria-hidden="true">−{file.deletions}</span>
            <span className="sr-only">{t.review.diff.removedLines(file.deletions)}</span>
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
  const { t } = useLanguage();
  const id = useId();
  if (!diff.files.length && !outsideDiff.length)
    return (
      <p className="review-empty" role="status">
        {t.review.diff.empty}
      </p>
    );
  return (
    <>
      <nav className="review-files" aria-label={t.review.diff.changedFiles}>
        <h3>
          {t.review.diff.changedFiles} <span className="count">{diff.files.length}</span>
        </h3>
        <ul>
          {diff.files.map((file, index) => (
            <li key={file.path}>
              <a href={`#${id}-file-${index}`}>
                <code>{file.path}</code>
                <small>{t.review.diff.fileStatuses[file.status]}</small>
                <Counts file={file} />
              </a>
            </li>
          ))}
          {outsideDiff.map((file, index) => (
            <li key={file.path}>
              <a href={`#${id}-outside-${index}`}>
                <code>{file.path}</code>
                <small>{t.review.diff.outside}</small>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <section className="review-diff" aria-label={t.review.diff.workItemDiff}>
        {diff.files.map((file, fileIndex) => (
          <section key={file.path} id={`${id}-file-${fileIndex}`} data-diff-path={file.path}>
            <header className="review-file-header">
              <h3>
                <code>{file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}</code>
              </h3>
              <span className="muted">{t.review.diff.fileStatuses[file.status]}</span>
              <Counts file={file} />
            </header>
            {fileFindings?.(file)}
            {file.status === "renamed" && (
              <p className="review-file-note">{t.review.diff.renamed}</p>
            )}
            {file.binary && <p className="review-file-note">{t.review.diff.binaryHidden}</p>}
            {file.contentsHidden && <p className="review-file-note">{t.review.diff.riskyHidden}</p>}
            {!file.contentsHidden &&
              !file.binary &&
              file.status !== "renamed" &&
              !file.hunks.length && (
                <p className="review-file-note">{t.review.diff.metadataOnly}</p>
              )}
            {file.hunks.map((hunk) => (
              <div className="review-hunk" key={`${hunk.oldStart}:${hunk.newStart}`}>
                <h4>
                  <code>{hunk.header}</code>
                </h4>
                <table aria-label={`${file.path}: ${hunk.header}`}>
                  <thead className="sr-only">
                    <tr>
                      <th>{t.review.diff.oldLine}</th>
                      <th>{t.review.diff.newLine}</th>
                      <th>{t.review.diff.change}</th>
                      <th>{t.review.diff.content}</th>
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
                            <td
                              className="review-line-marker"
                              aria-label={t.review.diff.lineKinds[line.kind]}
                            >
                              {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}
                            </td>
                            <td className="review-line-text">
                              <code>{line.text}</code>
                              {line.noNewline && (
                                <span className="review-no-newline">{t.review.diff.noNewline}</span>
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
              <span>{t.review.diff.outside}</span>
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
    riskyPaths?: RiskyPath[];
    stage?: string | null;
  };
  onClose: () => void;
  reviewStageId?: string;
} & ReviewSlots) {
  const { t } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const findingId = useId();
  const [diff, setDiff] = useState<WorkItemDiff | null>(null);
  const [error, setError] = useCoreTextError();
  const [decisions, setDecisions] = useState<ReviewDecision[]>(item.reviewDecisions ?? []);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useCoreTextError();
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
  async function act(action: "decision" | "send-back" | "accept-risky-path", body: object) {
    setSaving(true);
    setActionError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/work-items/${encodeURIComponent(item.slug)}/${action === "accept-risky-path" ? "risky-paths/accept" : `findings/${action}`}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new CoreTextError(result, t.review.diff.updateError);
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
          t.review.diff.reopened(result.stageName ?? t.workflows.feature.stages.implement),
        );
      } else
        setMessage(
          t.review.diff.recorded(
            action === "accept-risky-path" ? t.review.diff.riskyPath : t.review.diff.finding,
            t.review.findings.statuses[
              result.decision.status as keyof typeof t.review.findings.statuses
            ],
          ),
        );
      return true;
    } catch (cause) {
      setActionError(cause instanceof Error ? cause : String(cause));
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
      <section className="review-outside" aria-label={t.review.diff.outsideLabel(file.path)}>
        <h4>{t.review.diff.outsideFindings}</h4>
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
      if (!response.ok) throw new CoreTextError(body, t.review.diff.readError);
      if (!controller.signal.aborted) setDiff(body);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause : String(cause));
    }
  }, [item.slug, t.review.diff.readError, setError]);

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
            {t.review.diff.review} / <code>{item.slug}</code>
          </p>
          <h2 id={titleId}>{item.title}</h2>
          <p className="muted">{t.review.diff.readOnly}</p>
          {diff && (
            <div className="review-range">
              <p>
                <code>{diff.branch}</code>
                {t.review.diff.against}
                <code>{diff.mainBranch}</code>
              </p>
              <p>
                {t.review.diff.mergeBase}
                <code>{diff.mergeBase}</code> · {t.review.diff.branchHead}
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
            {t.review.diff.sendBack}
          </button>
          <button type="button" className="top-button" onClick={() => void readDiff()}>
            {t.review.diff.refresh}
          </button>
          <button
            type="button"
            className="top-button"
            ref={closeButton}
            onClick={onClose}
            aria-label={t.review.diff.close}
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
            {t.review.diff.reading}
          </p>
        )}
        <aside className="review-evidence" aria-label={t.review.diff.evidence}>
          {item.riskyPaths && (
            <RiskyPaths
              risks={item.riskyPaths}
              decisions={decisions}
              saving={saving}
              onAccept={(risk, reason) =>
                act("accept-risky-path", { id: risk.path, blob: risk.blob, reason })
              }
            />
          )}
          {item.stints
            ?.filter((stint) => stint.checkpointWarnings?.length)
            .map((stint) => (
              <div key={stint.id}>
                <p>
                  {t.review.diff.stint} <code>{stint.id}</code>
                </p>
                <CheckpointWarnings warnings={stint.checkpointWarnings} />
              </div>
            ))}
          <section aria-label={t.review.diff.findings}>
            <h3>{t.review.diff.findings}</h3>
            {findings ?? <FindingsRail {...evidence} anchor={anchor} />}
          </section>
          <section aria-label={t.review.diff.checks}>
            <h3>{t.review.diff.checks}</h3>
            {checks ?? <p className="muted">{t.review.diff.checksPlaceholder}</p>}
          </section>
        </aside>
      </div>
      <footer className="drawer-footer">
        <span>{t.review.diff.footer}</span>
        <span>
          <kbd>Esc</kbd>
          {t.review.diff.return}
        </span>
      </footer>
    </dialog>
  );
}
