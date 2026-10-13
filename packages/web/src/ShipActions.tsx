// SPDX-License-Identifier: Apache-2.0
import { readResponseJson, CoreTextError, useErrorText, useLanguage } from "./i18n/language";
import { useState } from "react";

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
    <section aria-label={t.review.ship.label} className="handoff-card">
      <h3 className="drawer-section-heading">
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
              <button
                type="button"
                className="top-button"
                disabled={busy || blockers.length > 0 || !!message || !mergeReady}
                onClick={() => void action("preview-merge-pr")}
              >
                {t.review.ship.mergePr}
              </button>
              {mergeMethod && (
                <section role="dialog" aria-modal="false" aria-label={t.review.ship.confirmMerge}>
                  <h4>{t.review.ship.confirmMerge}</h4>
                  <p>
                    {t.review.ship.pullRequest(pullRequest.number)} →{" "}
                    <code>{pullRequest.base}</code> · {t.review.ship.mergeMethod}{" "}
                    <strong>{mergeMethod}</strong>
                  </p>
                  <button
                    type="button"
                    className="top-button"
                    disabled={busy || blockers.length > 0 || !!message || !mergeReady}
                    onClick={() => void action("merge-pr")}
                  >
                    {t.review.ship.confirmMethod(mergeMethod)}
                  </button>
                  <button
                    type="button"
                    className="top-button"
                    disabled={busy}
                    onClick={() => setMergeMethod(null)}
                  >
                    {t.review.ship.cancel}
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
                {busy ? t.review.ship.working : t.review.ship.local}
              </button>
              <button
                type="button"
                className="top-button"
                disabled={busy || blockers.length > 0 || !!message}
                onClick={() => void action("preview-pr")}
              >
                {t.review.ship.openPr}
              </button>
            </>
          )}
          {preview && (
            <section role="dialog" aria-modal="false" aria-label={t.review.ship.confirmPublishing}>
              <h4>{t.review.ship.confirmPushTitle}</h4>
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
              <pre>{preview.body}</pre>
              <button
                type="button"
                className="top-button"
                disabled={busy}
                onClick={() => void action("open-pr")}
              >
                {t.review.ship.confirmPush}
              </button>
              <button
                type="button"
                className="top-button"
                disabled={busy}
                onClick={() => setPreview(null)}
              >
                {t.review.ship.cancel}
              </button>
            </section>
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
              <button
                type="button"
                className="top-button"
                disabled={busy}
                onClick={() => void action("send-back")}
              >
                {t.review.ship.sendBack}
              </button>
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
        <p role="alert" className="warning">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
