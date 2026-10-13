// SPDX-License-Identifier: Apache-2.0
import {
  evidenceStale,
  latestReviewStint,
  type EvidenceContext,
  type ReviewDecision,
  type ReviewFinding,
  type ReviewFindings,
  type StintSummary,
} from "@stintwork/core";
import { useState } from "react";
import { useLanguage } from "./i18n/language";

export type DisplayFinding = ReviewFinding & {
  commit: string;
  status: ReviewDecision["status"];
  reason: string;
  stale: boolean;
  historical: boolean;
};

export function reviewFindings(
  stints: readonly StintSummary[] = [],
  decisions: readonly ReviewDecision[] = [],
  context: EvidenceContext,
  stageId = "review",
) {
  const latest = latestReviewStint(stints, stageId);
  const reports = stints.flatMap((stint) =>
    stint.findings
      ? [
          {
            ...stint.findings,
            stintId: stint.id,
            stale: evidenceStale(context, stint.findings.commit),
            historical: stint.id !== latest?.id,
          },
        ]
      : [],
  );
  const findings: DisplayFinding[] = reports.flatMap((report) =>
    (report.findings ?? []).map((finding) => {
      const decision = decisions.find(
        (entry) => entry.kind === "finding" && entry.id === finding.id,
      );
      return {
        ...finding,
        commit: report.commit,
        status: decision?.status ?? "open",
        reason: decision?.reason ?? "",
        stale: report.stale,
        historical: report.historical,
      };
    }),
  );
  return { reports, findings };
}

export function FindingCard({
  finding,
  anchor,
  onDecision,
  saving = false,
}: {
  finding: DisplayFinding;
  anchor: string;
  onDecision?: (
    id: string,
    status: "open" | "resolved" | "accepted",
    reason?: string,
  ) => Promise<boolean>;
  saving?: boolean;
}) {
  const { t } = useLanguage();
  const [accepting, setAccepting] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <article className="review-finding" id={anchor} aria-label={finding.title}>
      <h4>{finding.title}</h4>
      <p>
        {t.review.findings.axes[finding.axis]} · {t.review.findings.severities[finding.severity]} ·{" "}
        {t.review.findings.statuses[finding.status]}
      </p>
      <p>
        <code>
          {finding.path}:{finding.line}
        </code>
      </p>
      <p className="review-finding-body">{finding.body}</p>
      {finding.reason && (
        <p>
          {t.review.findings.reasonPrefix}
          {finding.reason}
        </p>
      )}
      <p className="muted">
        {t.review.findings.reviewedCommit}
        <code>{finding.commit}</code>
        {finding.stale && t.review.findings.stale}
        {finding.historical && t.review.findings.history}
      </p>
      {onDecision && !finding.historical && (
        <div className="review-finding-actions">
          {finding.status !== "resolved" && (
            <button
              type="button"
              className="top-button"
              disabled={saving}
              onClick={() => void onDecision(finding.id, "resolved")}
            >
              {t.review.findings.resolve}
            </button>
          )}
          {finding.status !== "accepted" && (
            <button
              type="button"
              className="top-button"
              disabled={saving}
              onClick={() => setAccepting(true)}
            >
              {t.review.findings.accept}
            </button>
          )}
          {finding.status !== "open" && (
            <button
              type="button"
              className="top-button"
              disabled={saving}
              onClick={() => void onDecision(finding.id, "open")}
            >
              {t.review.findings.reopen}
            </button>
          )}
          {accepting && (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (reason.trim() && (await onDecision(finding.id, "accepted", reason.trim())))
                  setAccepting(false);
              }}
            >
              <label>
                {t.review.findings.reason}
                <textarea
                  required
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <button type="submit" className="top-button" disabled={saving || !reason.trim()}>
                {t.review.findings.save}
              </button>
              <button
                type="button"
                className="top-button"
                disabled={saving}
                onClick={() => setAccepting(false)}
              >
                {t.review.findings.cancel}
              </button>
            </form>
          )}
        </div>
      )}
    </article>
  );
}

export function FindingsRail({
  findings,
  reports,
  anchor,
}: {
  findings: readonly DisplayFinding[];
  reports: readonly (ReviewFindings & { stintId: string; stale: boolean; historical: boolean })[];
  anchor: (finding: DisplayFinding) => string;
}) {
  const { t } = useLanguage();
  const [axis, setAxis] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const filtered = findings.filter(
    (finding) =>
      (!axis || finding.axis === axis) &&
      (!severity || finding.severity === severity) &&
      (!status || finding.status === status),
  );
  return (
    <>
      <div className="review-filters">
        <label>
          {t.review.findings.axis}
          <select value={axis} onChange={(event) => setAxis(event.target.value)}>
            <option value="">{t.review.findings.allAxes}</option>
            {(["Standards", "Spec"] as const).map((value) => (
              <option key={value} value={value}>
                {t.review.findings.axes[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.review.findings.severity}
          <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
            <option value="">{t.review.findings.allSeverities}</option>
            {(["blocker", "major", "minor", "nit"] as const).map((value) => (
              <option key={value} value={value}>
                {t.review.findings.severities[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.review.findings.status}
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">{t.review.findings.allStatuses}</option>
            {(["open", "resolved", "accepted", "sent-back"] as const).map((value) => (
              <option key={value} value={value}>
                {t.review.findings.statuses[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!reports.length && <p className="muted">{t.review.findings.empty}</p>}
      {reports.map((report) =>
        report.error || report.findings?.length === 0 ? (
          <div key={report.stintId} className="review-finding">
            <p>
              {t.review.findings.reviewedCommit}
              <code>{report.commit}</code>
              {report.stale && t.review.findings.stale}
              {report.historical && t.review.findings.history}
            </p>
            {report.error ? (
              <>
                <p role="alert">
                  {t.review.findings.unavailable}
                  {report.error}
                </p>
                {report.rawReply !== undefined && (
                  <details>
                    <summary>{t.review.findings.rawReply}</summary>
                    <pre>{report.rawReply}</pre>
                  </details>
                )}
              </>
            ) : (
              <p role="status">{t.review.findings.none}</p>
            )}
          </div>
        ) : null,
      )}
      {!!findings.length && !filtered.length && <p role="status">{t.review.findings.noMatches}</p>}
      <ul className="review-findings-rail">
        {filtered.map((finding) => (
          <li key={finding.id}>
            <a href={`#${anchor(finding)}`}>{finding.title}</a>
            <p>
              {t.review.findings.axes[finding.axis]} ·{" "}
              {t.review.findings.severities[finding.severity]} ·{" "}
              {t.review.findings.statuses[finding.status]}
            </p>
            <p>
              <code>
                {finding.path}:{finding.line}
              </code>
            </p>
            <p>
              {t.review.findings.reviewedCommit}
              <code>{finding.commit}</code>
              {finding.stale && <span className="warning">{t.review.findings.stale}</span>}
              {finding.historical && t.review.findings.history}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
