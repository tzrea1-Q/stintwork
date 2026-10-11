// SPDX-License-Identifier: Apache-2.0
export type FindingAxis = "Standards" | "Spec";
export type FindingSeverity = "blocker" | "major" | "minor" | "nit";
export type ReviewFinding = {
  id: string;
  axis: FindingAxis;
  severity: FindingSeverity;
  path: string;
  line: number;
  title: string;
  body: string;
};
export type ReviewFindings = {
  commit: string;
  findings: ReviewFinding[] | null;
  error?: string;
  rawReply?: string;
};

export function isFindingContent(value: unknown): value is Omit<ReviewFinding, "id"> {
  if (!value || typeof value !== "object") return false;
  const finding = value as Record<string, unknown>;
  return (
    (finding.axis === "Standards" || finding.axis === "Spec") &&
    typeof finding.severity === "string" &&
    ["blocker", "major", "minor", "nit"].includes(finding.severity) &&
    ["path", "title", "body"].every(
      (key) => typeof finding[key] === "string" && !!finding[key].trim(),
    ) &&
    typeof finding.path === "string" &&
    !finding.path.startsWith("/") &&
    !finding.path.includes("\\") &&
    !/^[a-z]:/i.test(finding.path) &&
    !finding.path.split("/").some((part) => !part || part === "." || part === "..") &&
    Number.isSafeInteger(finding.line) &&
    (finding.line as number) > 0
  );
}

export function isReviewFindings(value: unknown): value is ReviewFindings {
  if (!value || typeof value !== "object") return false;
  const report = value as Record<string, unknown>;
  return (
    typeof report.commit === "string" &&
    !!report.commit.trim() &&
    (report.rawReply === undefined || typeof report.rawReply === "string") &&
    (report.findings === null
      ? typeof report.error === "string" && !!report.error.trim()
      : report.error === undefined &&
        Array.isArray(report.findings) &&
        report.findings.every(
          (finding) =>
            isFindingContent(finding) &&
            "id" in finding &&
            typeof finding.id === "string" &&
            !!finding.id.trim(),
        ) &&
        new Set(report.findings.map((finding) => finding.id)).size === report.findings.length)
  );
}
