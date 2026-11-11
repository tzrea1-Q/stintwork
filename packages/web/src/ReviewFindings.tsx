// SPDX-License-Identifier: Apache-2.0

import {
  type EvidenceContext,
  evidenceStale,
  latestReviewStint,
  type ReviewDecision,
  type ReviewFinding,
  type ReviewFindings,
  type StintSummary,
} from "@stintwork/core";
import { useId, useState } from "react";
import { useLanguage } from "./i18n/language";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { CodeBlock } from "./ui/CodeBlock";
import { SelectField } from "./ui/SelectField";

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
    <article
      className="review-finding m-3 min-w-0 rounded-md border border-border p-3 [overflow-wrap:anywhere] [&_h4]:my-2 [&_p]:my-2"
      id={anchor}
      aria-label={finding.title}
      tabIndex={-1}
    >
      <h4>{finding.title}</h4>
      <p>
        {t.review.findings.axes[finding.axis]} · {t.review.findings.severities[finding.severity]} ·{" "}
        <Badge
          variant={
            finding.status === "resolved"
              ? "success"
              : finding.status === "accepted"
                ? "accent"
                : "warning"
          }
        >
          {t.review.findings.statuses[finding.status]}
        </Badge>
      </p>
      <p>
        <code>
          {finding.path}:{finding.line}
        </code>
      </p>
      <p className="review-finding-body whitespace-pre-wrap">{finding.body}</p>
      {finding.reason && (
        <p>
          {t.review.findings.reasonPrefix}
          {finding.reason}
        </p>
      )}
      <p className="muted text-muted-foreground">
        {t.review.findings.reviewedCommit}
        <code>{finding.commit}</code>
        {finding.stale && t.review.findings.stale}
        {finding.historical && t.review.findings.history}
      </p>
      {onDecision && !finding.historical && (
        <div className="review-finding-actions flex flex-wrap gap-2 [&_form]:grid [&_form]:w-full [&_form]:gap-2 [&_label]:grid [&_label]:w-full [&_label]:gap-2 [&_textarea]:min-h-20 [&_textarea]:rounded-sm [&_textarea]:border [&_textarea]:border-border [&_textarea]:bg-background [&_textarea]:p-2">
          {finding.status !== "resolved" && (
            <Button
              type="button"
              disabled={saving}
              onClick={() => void onDecision(finding.id, "resolved")}
            >
              {t.review.findings.resolve}
            </Button>
          )}
          {finding.status !== "accepted" && (
            <Button type="button" disabled={saving} onClick={() => setAccepting(true)}>
              {t.review.findings.accept}
            </Button>
          )}
          {finding.status !== "open" && (
            <Button
              type="button"
              disabled={saving}
              onClick={() => void onDecision(finding.id, "open")}
            >
              {t.review.findings.reopen}
            </Button>
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
              <Button type="submit" disabled={saving || !reason.trim()}>
                {t.review.findings.save}
              </Button>
              <Button type="button" disabled={saving} onClick={() => setAccepting(false)}>
                {t.review.findings.cancel}
              </Button>
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
  onSelectFinding,
}: {
  findings: readonly DisplayFinding[];
  reports: readonly (ReviewFindings & { stintId: string; stale: boolean; historical: boolean })[];
  anchor: (finding: DisplayFinding) => string;
  onSelectFinding?: () => void;
}) {
  const { t } = useLanguage();
  const selectId = useId();
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
      <div className="review-filters mb-3 grid gap-2 [&_label]:grid [&_label]:min-w-0 [&_label]:gap-2">
        <label htmlFor={`${selectId}-axis`}>
          {t.review.findings.axis}
          <SelectField
            id={`${selectId}-axis`}
            aria-label={t.review.findings.axis}
            value={axis}
            onValueChange={setAxis}
            options={[
              { value: "", label: t.review.findings.allAxes },
              ...(["Standards", "Spec"] as const).map((value) => ({
                value,
                label: t.review.findings.axes[value],
              })),
            ]}
          />
        </label>
        <label htmlFor={`${selectId}-severity`}>
          {t.review.findings.severity}
          <SelectField
            id={`${selectId}-severity`}
            aria-label={t.review.findings.severity}
            value={severity}
            onValueChange={setSeverity}
            options={[
              { value: "", label: t.review.findings.allSeverities },
              ...(["blocker", "major", "minor", "nit"] as const).map((value) => ({
                value,
                label: t.review.findings.severities[value],
              })),
            ]}
          />
        </label>
        <label htmlFor={`${selectId}-status`}>
          {t.review.findings.status}
          <SelectField
            id={`${selectId}-status`}
            aria-label={t.review.findings.status}
            value={status}
            onValueChange={setStatus}
            options={[
              { value: "", label: t.review.findings.allStatuses },
              ...(["open", "resolved", "accepted", "sent-back"] as const).map((value) => ({
                value,
                label: t.review.findings.statuses[value],
              })),
            ]}
          />
        </label>
      </div>
      {!reports.length && <p className="muted text-muted-foreground">{t.review.findings.empty}</p>}
      {reports.map((report) =>
        report.error || report.findings?.length === 0 ? (
          <div
            key={report.stintId}
            className="review-finding m-3 min-w-0 rounded-md border border-border p-3 [overflow-wrap:anywhere] [&_h4]:my-2 [&_p]:my-2"
          >
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
                    <CodeBlock>{report.rawReply}</CodeBlock>
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
      <ul className="review-findings-rail m-0 list-none p-0 [&_li]:border-b [&_li]:border-border [&_li]:py-3 [&_li]:[overflow-wrap:anywhere] [&_a]:text-foreground">
        {filtered.map((finding) => (
          <li key={finding.id}>
            <a href={`#${anchor(finding)}`} onClick={onSelectFinding}>
              {finding.title}
            </a>
            <p>
              {t.review.findings.axes[finding.axis]} ·{" "}
              {t.review.findings.severities[finding.severity]} ·{" "}
              <Badge
                variant={
                  finding.status === "resolved"
                    ? "success"
                    : finding.status === "accepted"
                      ? "accent"
                      : "warning"
                }
              >
                {t.review.findings.statuses[finding.status]}
              </Badge>
            </p>
            <p>
              <code>
                {finding.path}:{finding.line}
              </code>
            </p>
            <p>
              {t.review.findings.reviewedCommit}
              <code>{finding.commit}</code>
              {finding.stale && (
                <span className="warning text-attention-foreground">{t.review.findings.stale}</span>
              )}
              {finding.historical && t.review.findings.history}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
