import type { ReviewDecision, ReviewFinding, ReviewFindings, StintSummary } from "@stintwork/core";
import { useState } from "react";

export type DisplayFinding = ReviewFinding & {
  commit: string;
  status: ReviewDecision["status"];
  reason: string;
};

export function reviewFindings(
  stints: readonly StintSummary[] = [],
  decisions: readonly ReviewDecision[] = [],
) {
  const reports = stints.flatMap((stint) =>
    stint.findings ? [{ ...stint.findings, stintId: stint.id }] : [],
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
      };
    }),
  );
  return { reports, findings };
}

export function FindingCard({
  finding,
  anchor,
  headCommit,
}: {
  finding: DisplayFinding;
  anchor: string;
  headCommit?: string;
}) {
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
        {headCommit && headCommit !== finding.commit && " · Stale"}
      </p>
    </article>
  );
}

export function FindingsRail({
  findings,
  reports,
  anchor,
  headCommit,
}: {
  findings: readonly DisplayFinding[];
  reports: readonly (ReviewFindings & { stintId: string })[];
  anchor: (finding: DisplayFinding) => string;
  headCommit?: string;
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
              {headCommit && headCommit !== report.commit && " · Stale"}
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
            {headCommit && headCommit !== finding.commit && <span className="warning">Stale</span>}
          </li>
        ))}
      </ul>
    </>
  );
}
