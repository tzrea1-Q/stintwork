// SPDX-License-Identifier: Apache-2.0

import type {
  EvidenceContext,
  ReviewDecision,
  RiskyPath,
  Stint,
  StintSummary,
} from "@stintwork/core";
import type { DiffFile, DiffLine, WorkItemDiff } from "@stintwork/git";
import { X } from "lucide-react";
import { Fragment, type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { CheckpointWarnings } from "./CheckpointWarnings";
import { CoreTextError, readResponseJson, useErrorText, useLanguage } from "./i18n/language";
import { FindingCard, FindingsRail, reviewFindings } from "./ReviewFindings";
import { RiskyPaths } from "./RiskyPaths";
import { Button } from "./ui/Button";
import { cn } from "./ui/cn";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/Dialog";

type ReviewSlots = {
  findings?: ReactNode;
  checks?: ReactNode;
  lineFindings?: (file: DiffFile, line: DiffLine, headCommit: string) => ReactNode;
  fileFindings?: (file: DiffFile) => ReactNode;
  outsideDiff?: { path: string; content: ReactNode }[];
};
type ReviewPane = "files" | "diff" | "findings";

function Counts({ file }: { file: DiffFile }) {
  const { t } = useLanguage();
  return (
    <span className="review-counts inline-flex gap-2 whitespace-nowrap font-mono">
      {file.binary ? (
        <span className="muted text-muted-foreground">{t.review.diff.binary}</span>
      ) : (
        <>
          <span className="success text-success-foreground">
            <span aria-hidden="true">+{file.additions}</span>
            <span className="sr-only">{t.review.diff.addedLines(file.additions)}</span>
          </span>
          <span className="review-removed-count text-destructive">
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
  pane = "diff",
  onSelectFile,
}: { diff: WorkItemDiff; pane?: ReviewPane; onSelectFile?: () => void } & Pick<
  ReviewSlots,
  "lineFindings" | "fileFindings" | "outsideDiff"
>) {
  const { t } = useLanguage();
  const id = useId();
  if (!diff.files.length && !outsideDiff.length)
    return (
      <p
        className={cn("review-empty p-8 md:col-span-2", pane !== "diff" && "hidden md:block")}
        role="status"
      >
        {t.review.diff.empty}
      </p>
    );
  return (
    <>
      <nav
        className={cn(
          "review-files p-4 [&_h3]:mb-3 [&_h3]:text-sm [&_ul]:m-0 [&_ul]:list-none [&_ul]:p-0 [&_a]:grid [&_a]:gap-1 [&_a]:border-b [&_a]:border-border [&_a]:px-1 [&_a]:py-3 [&_a]:text-foreground [&_a]:no-underline [&_a]:[overflow-wrap:anywhere] [&_a:hover]:bg-secondary [&_small]:text-muted-foreground min-w-0 overflow-auto border-b border-border md:border-b-0 md:border-r",
          pane !== "files" && "hidden md:block",
        )}
        aria-label={t.review.diff.changedFiles}
      >
        <h3>
          {t.review.diff.changedFiles}{" "}
          <span className="count min-w-5 rounded-sm bg-muted px-1 text-center text-xs text-muted-foreground">
            {diff.files.length}
          </span>
        </h3>
        <ul>
          {diff.files.map((file, index) => (
            <li key={file.path}>
              <a href={`#${id}-file-${index}`} onClick={onSelectFile}>
                <code>{file.path}</code>
                <small>{t.review.diff.fileStatuses[file.status]}</small>
                <Counts file={file} />
              </a>
            </li>
          ))}
          {outsideDiff.map((file, index) => (
            <li key={file.path}>
              <a href={`#${id}-outside-${index}`} onClick={onSelectFile}>
                <code>{file.path}</code>
                <small>{t.review.diff.outside}</small>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <section
        className={cn("review-diff min-w-0 overflow-auto", pane !== "diff" && "hidden md:block")}
        aria-label={t.review.diff.workItemDiff}
      >
        {diff.files.map((file, fileIndex) => (
          <section
            key={file.path}
            id={`${id}-file-${fileIndex}`}
            data-diff-path={file.path}
            tabIndex={-1}
          >
            <header className="review-file-header flex flex-wrap items-center gap-3 bg-muted p-4 [&_h3]:m-0 [&_h3]:min-w-0 [&_h3]:flex-1 [&_h3]:text-sm [&_h3]:[overflow-wrap:anywhere]">
              <h3>
                <code>{file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}</code>
              </h3>
              <span className="muted text-muted-foreground">
                {t.review.diff.fileStatuses[file.status]}
              </span>
              <Counts file={file} />
            </header>
            {fileFindings?.(file)}
            {file.status === "renamed" && (
              <p className="review-file-note m-0 px-4 py-5 text-muted-foreground">
                {t.review.diff.renamed}
              </p>
            )}
            {file.binary && (
              <p className="review-file-note m-0 px-4 py-5 text-muted-foreground">
                {t.review.diff.binaryHidden}
              </p>
            )}
            {file.contentsHidden && (
              <p className="review-file-note m-0 px-4 py-5 text-muted-foreground">
                {t.review.diff.riskyHidden}
              </p>
            )}
            {!file.contentsHidden &&
              !file.binary &&
              file.status !== "renamed" &&
              !file.hunks.length && (
                <p className="review-file-note m-0 px-4 py-5 text-muted-foreground">
                  {t.review.diff.metadataOnly}
                </p>
              )}
            {file.hunks.map((hunk) => (
              <div
                className="review-hunk [&_h4]:m-0 [&_h4]:whitespace-pre [&_h4]:py-2 [&_h4]:text-xs [&_h4]:text-muted-foreground [&_table]:w-full [&_table]:border-collapse [&_table]:font-mono [&_table]:text-sm [&_table]:leading-relaxed overflow-x-auto focus-visible:outline-ring"
                key={`${hunk.oldStart}:${hunk.newStart}`}
              >
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
                    <tr className="bg-accent">
                      <td colSpan={3} />
                      <td className="px-2">
                        <h4>
                          <code>{hunk.header}</code>
                        </h4>
                      </td>
                    </tr>
                    {hunk.lines.map((line) => {
                      const finding = lineFindings?.(file, line, diff.headCommit);
                      return (
                        <Fragment key={`${line.kind}:${line.oldLine}:${line.newLine}`}>
                          <tr
                            className={`review-line [&_td]:px-2 [&_td]:py-0 [&_td]:align-top review-line-${line.kind} ${line.kind === "added" ? "bg-success-soft" : line.kind === "removed" ? "bg-destructive/10" : ""}`}
                            data-old-line={line.oldLine ?? undefined}
                            data-new-line={line.newLine ?? undefined}
                          >
                            <td className="review-line-number w-[4ch] select-none text-right text-muted-foreground">
                              {line.oldLine}
                            </td>
                            <td className="review-line-number w-[4ch] select-none text-right text-muted-foreground">
                              {line.newLine}
                            </td>
                            <td
                              className="review-line-marker w-[1ch] select-none"
                              aria-label={t.review.diff.lineKinds[line.kind]}
                            >
                              {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}
                            </td>
                            <td className="review-line-text whitespace-pre">
                              <code>{line.text}</code>
                              {line.noNewline && (
                                <span className="review-no-newline block italic text-muted-foreground">
                                  {t.review.diff.noNewline}
                                </span>
                              )}
                            </td>
                          </tr>
                          {finding && (
                            <tr className="review-line-findings [&_td]:px-4 [&_td]:py-3">
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
          <section
            key={file.path}
            id={`${id}-outside-${index}`}
            data-diff-path={file.path}
            tabIndex={-1}
          >
            <header className="review-file-header flex flex-wrap items-center gap-3 bg-muted p-4 [&_h3]:m-0 [&_h3]:min-w-0 [&_h3]:flex-1 [&_h3]:text-sm [&_h3]:[overflow-wrap:anywhere]">
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
    activeStint?: Stint | null;
    reviewDecisions?: ReviewDecision[];
    riskyPaths?: RiskyPath[];
    stage?: string | null;
  };
  onClose: () => void;
  reviewStageId?: string;
} & ReviewSlots) {
  const { t } = useLanguage();
  const closeButton = useRef<HTMLButtonElement>(null);
  const findingId = useId();
  const detailsId = useId();
  const [pane, setPane] = useState<ReviewPane>("diff");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [diff, setDiff] = useState<WorkItemDiff | null>(null);
  const [error, setError] = useErrorText();
  const [decisions, setDecisions] = useState<ReviewDecision[]>(item.reviewDecisions ?? []);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useErrorText();
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
  const stintActive =
    !!item.activeStint || !!item.stints?.some((stint) => stint.status === "running");
  async function act(action: "decision" | "send-back" | "accept-risky-path", body: object) {
    if (stintActive) return false;
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
      const result = await readResponseJson(response);
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
            saving={saving || stintActive}
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
      <section
        className="review-outside m-3 min-w-0 rounded-md border border-border p-3 [overflow-wrap:anywhere]"
        aria-label={t.review.diff.outsideLabel(file.path)}
      >
        <h4>{t.review.diff.outsideFindings}</h4>
        {matches.map((finding) => (
          <FindingCard
            key={finding.id}
            finding={finding}
            anchor={anchor(finding)}
            onDecision={onDecision}
            saving={saving || stintActive}
          />
        ))}
      </section>
    ) : null;
  };

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
      const body = await readResponseJson(response);
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

  const outsideFiles =
    outsideDiff ??
    [...new Set(evidence.findings.map((finding) => finding.path))]
      .filter((path) => !diff?.files.some((file) => file.path === path))
      .map((path) => ({ path, content: cards(path) }));

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="review-overlay flex h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[min(1600px,calc(100vw-32px))] flex-col p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeButton.current?.focus();
        }}
      >
        <header className="review-header flex shrink-0 flex-wrap justify-between gap-2 border-b border-border p-3 md:gap-4 md:p-6">
          <div className="min-w-0 flex-1 basis-96 [overflow-wrap:anywhere]">
            <p className="eyebrow text-xs uppercase tracking-widest text-muted-foreground">
              {t.review.diff.review} / <code>{item.slug}</code>
            </p>
            <DialogTitle className="my-1 text-sm font-medium md:my-2 md:text-xl">
              {item.title}
            </DialogTitle>
            <Button
              size="sm"
              variant="ghost"
              className="md:hidden"
              aria-expanded={detailsOpen}
              aria-controls={detailsId}
              onClick={() => setDetailsOpen(!detailsOpen)}
            >
              {t.review.diff.details}
            </Button>
            <div id={detailsId} className={cn(!detailsOpen && "hidden md:block")}>
              <DialogDescription className="text-muted-foreground">
                {t.review.diff.readOnly}
              </DialogDescription>
              {diff && (
                <div className="review-range text-xs [overflow-wrap:anywhere]">
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
          </div>
          <div className="review-header-actions flex flex-wrap items-start gap-2">
            <Button
              variant="primary"
              size="sm"
              className="md:min-h-8 md:px-3"
              disabled={
                saving ||
                stintActive ||
                sentBack ||
                item.stage !== reviewStageId ||
                !evidence.findings.some(
                  (finding) => !finding.historical && finding.status === "open",
                )
              }
              onClick={() => void act("send-back", {})}
            >
              {t.review.diff.sendBack}
            </Button>
            <Button
              size="sm"
              className="md:min-h-8 md:px-3"
              onClick={() => {
                setPane("diff");
                void readDiff();
              }}
            >
              {t.review.diff.refresh}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="md:min-h-8 md:px-3"
              ref={closeButton}
              onClick={onClose}
              aria-label={t.review.diff.close}
            >
              <X aria-hidden="true" /> {t.review.diff.close}
            </Button>
          </div>
        </header>
        {actionError && (
          <p role="alert" className="warning text-attention-foreground">
            {actionError}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <fieldset
          aria-label={t.review.diff.panes}
          className="flex min-w-0 shrink-0 gap-1 border-b border-border px-3 py-2 md:hidden"
        >
          {(["files", "diff", "findings"] as const).map((choice) => (
            <Button
              key={choice}
              size="sm"
              variant={pane === choice ? "secondary" : "ghost"}
              aria-pressed={pane === choice}
              disabled={
                choice === "files" &&
                (!diff || (!diff.files.length && !outsideFiles.length) || !!error)
              }
              onClick={() => setPane(choice)}
            >
              {t.review.diff[choice]}
            </Button>
          ))}
        </fieldset>
        <div className="review-grid grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden md:grid-rows-none md:overflow-auto md:grid-cols-[180px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)_260px]">
          {error ? (
            <p
              role="alert"
              className={cn(
                "review-empty p-8 warning text-attention-foreground md:col-span-2",
                pane !== "diff" && "hidden md:block",
              )}
            >
              {error}
            </p>
          ) : diff ? (
            <ReviewDiff
              diff={diff}
              pane={pane}
              onSelectFile={() => setPane("diff")}
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
              outsideDiff={outsideFiles}
            />
          ) : (
            <p
              role="status"
              className={cn(
                "review-empty p-8 muted text-muted-foreground md:col-span-2",
                pane !== "diff" && "hidden md:block",
              )}
            >
              {t.review.diff.reading}
            </p>
          )}
          <aside
            className={cn(
              "review-evidence p-4 [&_h3]:mb-3 [&_h3]:text-sm [&_section+section]:mt-6 [&_section+section]:border-t [&_section+section]:border-border [&_section+section]:pt-5 min-w-0 overflow-auto border-t border-border md:col-span-2 lg:col-span-1 lg:border-l lg:border-t-0",
              pane !== "findings" && "hidden md:block",
            )}
            aria-label={t.review.diff.evidence}
          >
            {item.riskyPaths && (
              <RiskyPaths
                risks={item.riskyPaths}
                decisions={decisions}
                saving={saving || stintActive}
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
              {findings ?? (
                <FindingsRail
                  {...evidence}
                  anchor={anchor}
                  onSelectFinding={() => setPane("diff")}
                />
              )}
            </section>
            <section aria-label={t.review.diff.checks}>
              <h3>{t.review.diff.checks}</h3>
              {checks ?? (
                <p className="muted text-muted-foreground">{t.review.diff.checksPlaceholder}</p>
              )}
            </section>
          </aside>
        </div>
        <footer className="flex shrink-0 flex-wrap justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>{t.review.diff.footer}</span>
          <span>
            <kbd>Esc</kbd>
            {t.review.diff.return}
          </span>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
