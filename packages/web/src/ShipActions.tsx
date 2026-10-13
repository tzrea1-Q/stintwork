// SPDX-License-Identifier: Apache-2.0
import { CodeBlock } from "./ui/CodeBlock";
import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogTitle } from "./ui/Dialog";
import { readResponseJson, CoreTextError, useErrorText, useLanguage } from "./i18n/language";
import { useRef, useState } from "react";

import {
  builtInWorkflows,
  evidenceStale,
  type WorkflowDefinitions,
  type MergeMethod,
  type PullRequestPreview,
} from "@stintwork/core";
import type { BoardWorkItem } from "./WorkItemCard";

export function ShipActions({
  item,
  workflows = builtInWorkflows,
}: {
  item: BoardWorkItem;
  workflows?: WorkflowDefinitions;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useErrorText();
  const [paths, setPaths] = useState<string[]>([]);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<PullRequestPreview | null>(null);
  const [mergeMethod, setMergeMethod] = useState<MergeMethod | null>(null);
  const [opened, setOpened] = useState(item.pullRequest);
  const publishingTrigger = useRef<HTMLButtonElement>(null);
  const mergeTrigger = useRef<HTMLButtonElement>(null);
  const pullRequest = item.pullRequest ?? opened;
  const ci = item.pullRequestChecks;
  const stages = workflows[item.workflow].stages;
  const reviewStage = stages.find(({ gate }) => gate === "evidence");
  const mergeReady =
    !!item.stages[reviewStage?.id ?? "review"]?.approved &&
    !!ci &&
    ci.checks.length > 0 &&
    ci.checks.every((check) => check.bucket === "pass") &&
    !evidenceStale(item, ci.headCommit);
  if (stages.find(({ id }) => id === item.stage)?.gate !== "merge" && !item.merged) return null;
  const blockers = [
    ...(item.activeStint || item.stints.some(({ status }) => status === "running")
      ? [t.review.ship.running]
      : []),
    ...(item.memoryProposals?.length ? [t.review.ship.memory] : []),
    ...(item.checkExecution?.endedAt === null ? [t.review.ship.checks] : []),
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
      const result = await readResponseJson(response);
      if (!response.ok) {
        setConflicts(result.conflicts ?? []);
        setPaths(result.paths ?? []);
        throw new CoreTextError(result, t.review.ship.error);
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
          ? t.review.ship.shippedAt(
              name === "merge-pr" ? pullRequest?.number : undefined,
              result.merged.commit,
            )
          : t.review.ship.sentBack(result.stageName),
      );
      setMergeMethod(null);
    } catch (cause) {
      if (name === "open-pr") setPreview(null);
      if (name === "merge-pr") setMergeMethod(null);
      setError(cause instanceof Error ? cause : t.review.ship.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label={t.review.ship.label}
      className="handoff-card my-3 rounded-sm border border-border bg-surface-raised p-3 [overflow-wrap:anywhere] [&_h4]:font-semibold [&_dt]:font-semibold [&_dl>div]:mt-2 [&>p]:mt-2"
    >
      <h3 className="drawer-section-heading mb-3 flex items-center gap-2 text-base font-semibold">
        {item.merged ? t.review.ship.shipped : t.review.ship.ship}
      </h3>
      {item.merged ? (
        <p>
          {t.review.ship.mergedAt}
          <time dateTime={item.merged.at}>{item.merged.at}</time> ·{" "}
          <code>{item.merged.commit}</code>
          {item.merged.pr && (
            <>
              {" "}
              · {t.review.ship.pullRequest(item.merged.pr)}
              {item.merged.method && <> ({item.merged.method})</>}
            </>
          )}
        </p>
      ) : (
        <>
          <p>{t.review.ship.localExplanation}</p>
          {blockers.length > 0 && (
            <ul aria-label={t.review.ship.refusals}>
              {blockers.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          {pullRequest ? (
            <>
              <p>
                {t.review.ship.pullRequest(pullRequest.number)} ·{" "}
                <a href={pullRequest.url} target="_blank" rel="noreferrer">
                  {t.review.ship.view}
                </a>
              </p>
              <p>{t.review.ship.rechecks}</p>
              {!mergeReady && <p>{t.review.ship.notReady}</p>}
              <Button
                type="button"
                ref={mergeTrigger}
                disabled={busy || blockers.length > 0 || !!message || !mergeReady}
                onClick={() => void action("preview-merge-pr")}
              >
                {t.review.ship.mergePr}
              </Button>
              {mergeMethod && (
                <Dialog
                  open
                  onOpenChange={(open) => {
                    if (!open && !busy) setMergeMethod(null);
                  }}
                >
                  <DialogContent
                    returnFocusRef={mergeTrigger}
                    aria-describedby={undefined}
                    className="[overflow-wrap:anywhere] [&_p]:my-3"
                    onEscapeKeyDown={(event) => {
                      if (busy) event.preventDefault();
                    }}
                    onPointerDownOutside={(event) => {
                      if (busy) event.preventDefault();
                    }}
                  >
                    <DialogTitle className="text-lg font-medium">
                      {t.review.ship.confirmMerge}
                    </DialogTitle>
                    <p>
                      {t.review.ship.pullRequest(pullRequest.number)} →{" "}
                      <code>{pullRequest.base}</code> · {t.review.ship.mergeMethod}{" "}
                      <strong>{mergeMethod}</strong>
                    </p>
                    <Button
                      type="button"
                      variant="danger"
                      className="h-auto min-h-8 whitespace-normal py-1"
                      disabled={busy || blockers.length > 0 || !!message || !mergeReady}
                      onClick={() => void action("merge-pr")}
                    >
                      {t.review.ship.confirmMethod(mergeMethod)}
                    </Button>
                    <Button type="button" disabled={busy} onClick={() => setMergeMethod(null)}>
                      {t.review.ship.cancel}
                    </Button>
                  </DialogContent>
                </Dialog>
              )}
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="primary"
                disabled={busy || blockers.length > 0 || !!message}
                onClick={() => void action("merge-local")}
              >
                {busy ? t.review.ship.working : t.review.ship.local}
              </Button>
              <Button
                type="button"
                ref={publishingTrigger}
                disabled={busy || blockers.length > 0 || !!message}
                onClick={() => void action("preview-pr")}
              >
                {t.review.ship.openPr}
              </Button>
            </>
          )}
          {preview && (
            <Dialog
              open
              onOpenChange={(open) => {
                if (!open && !busy) setPreview(null);
              }}
            >
              <DialogContent
                returnFocusRef={publishingTrigger}
                aria-label={t.review.ship.confirmPublishing}
                aria-describedby={undefined}
                className="[overflow-wrap:anywhere] [&_p]:my-3"
                onEscapeKeyDown={(event) => {
                  if (busy) event.preventDefault();
                }}
                onPointerDownOutside={(event) => {
                  if (busy) event.preventDefault();
                }}
              >
                <DialogTitle className="text-lg font-medium">
                  {t.review.ship.confirmPublishing}
                </DialogTitle>
                <p>{t.review.ship.confirmPushTitle}</p>
                <p>{t.review.ship.pushWarning}</p>
                <p>
                  {t.review.ship.remote}
                  <code>{preview.remote}</code> · <code>{preview.remoteUrl}</code>
                </p>
                <p>
                  {t.review.ship.branch}
                  <code>{preview.branch}</code> → <code>{preview.base}</code>
                </p>
                <p>
                  {t.review.ship.commit}
                  <code>{preview.headCommit}</code>
                </p>
                <p>
                  {t.review.ship.title}
                  {preview.title}
                </p>
                <CodeBlock className="max-h-60">{preview.body}</CodeBlock>
                <Button
                  type="button"
                  variant="danger"
                  className="h-auto min-h-8 whitespace-normal py-1"
                  disabled={busy}
                  onClick={() => void action("open-pr")}
                >
                  {t.review.ship.confirmPush}
                </Button>
                <Button type="button" disabled={busy} onClick={() => setPreview(null)}>
                  {t.review.ship.cancel}
                </Button>
              </DialogContent>
            </Dialog>
          )}
          {conflicts.length > 0 && (
            <section aria-label={t.review.ship.conflicts}>
              <h4>{t.review.ship.conflicts}</h4>
              <ul>
                {conflicts.map((path) => (
                  <li key={path}>
                    <code>{path}</code>
                  </li>
                ))}
              </ul>
              <Button type="button" disabled={busy} onClick={() => void action("send-back")}>
                {t.review.ship.sendBack}
              </Button>
            </section>
          )}
        </>
      )}
      {paths.length > 0 && (
        <ul aria-label={t.review.ship.paths}>
          {paths.map((path) => (
            <li key={path}>
              <code>{path}</code>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="warning text-warning">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
