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
  const [accepting, setAccepting] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <article className="review-finding" id={anchor} aria-label={finding.title}>
      <h4>{finding.title}</h4>
      <p>
        {finding.axis} · {finding.severity} · {finding.status}
      </p>
      <p>
        <code>
          {finding.path}:{finding.line}
        </code>
      </p>
      <p className="review-finding-body">{finding.body}</p>
      {finding.reason && <p>Reason: {finding.reason}</p>}
      <p className="muted">
        Reviewed commit <code>{finding.commit}</code>
        {finding.stale && " · Stale"}
        {finding.historical && " · History — not gate evidence"}
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
              Resolve
            </button>
          )}
          {finding.status !== "accepted" && (
            <button
              type="button"
              className="top-button"
              disabled={saving}
              onClick={() => setAccepting(true)}
            >
              Accept with reason
            </button>
          )}
          {finding.status !== "open" && (
            <button
              type="button"
              className="top-button"
              disabled={saving}
              onClick={() => void onDecision(finding.id, "open")}
            >
              Reopen
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
                Acceptance reason
                <textarea
                  required
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <button type="submit" className="top-button" disabled={saving || !reason.trim()}>
                Save acceptance
              </button>
              <button
                type="button"
                className="top-button"
                disabled={saving}
                onClick={() => setAccepting(false)}
              >
                Cancel
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
          Axis
          <select value={axis} onChange={(event) => setAxis(event.target.value)}>
            <option value="">All axes</option>
            {["Standards", "Spec"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Severity
          <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
            <option value="">All severities</option>
            {["blocker", "major", "minor", "nit"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {["open", "resolved", "accepted", "sent-back"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      {!reports.length && <p className="muted">No review findings recorded yet.</p>}
      {reports.map((report) =>
        report.error || report.findings?.length === 0 ? (
          <div key={report.stintId} className="review-finding">
            <p>
              Reviewed commit <code>{report.commit}</code>
              {report.stale && " · Stale"}
              {report.historical && " · History — not gate evidence"}
            </p>
            {report.error ? (
              <>
                <p role="alert">Findings unavailable: {report.error}</p>
                {report.rawReply !== undefined && (
                  <details>
                    <summary>Raw findings reply</summary>
                    <pre>{report.rawReply}</pre>
                  </details>
                )}
              </>
            ) : (
              <p role="status">No findings</p>
            )}
          </div>
        ) : null,
      )}
      {!!findings.length && !filtered.length && (
        <p role="status">No findings match these filters.</p>
      )}
      <ul className="review-findings-rail">
        {filtered.map((finding) => (
          <li key={finding.id}>
            <a href={`#${anchor(finding)}`}>{finding.title}</a>
            <p>
              {finding.axis} · {finding.severity} · {finding.status}
            </p>
            <p>
              <code>
                {finding.path}:{finding.line}
              </code>
            </p>
            <p>
              Reviewed commit <code>{finding.commit}</code>
              {finding.stale && <span className="warning"> · Stale</span>}
              {finding.historical && " · History — not gate evidence"}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
