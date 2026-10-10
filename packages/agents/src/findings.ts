import { isFindingContent, type ReviewFinding } from "@stintwork/core";
import type { AfterTurnRequest } from "./after-turn.js";

export const findingsFormat = `Reply with one Markdown block per finding, using exactly this format:
## Finding
Axis: Standards or Spec
Severity: blocker, major, minor or nit
Path: repository-relative file path
Line: positive new-side line number
Title: short finding title
### Body
Explain the finding and why it matters. The body may contain Markdown.

Repeat the block for each finding. If there are none, reply with exactly "No findings".`;

export const findingsRequest: AfterTurnRequest = {
  name: "Findings",
  prompt: `The Review stint's work turn has ended. Report the review findings, not the handoff. Do not continue implementation.\n\n${findingsFormat}`,
  parse: parseFindings,
  resultField: "findings",
  errorField: "findingsError",
  rawReplyField: "findingsRawReply",
  parseError: "Findings did not match the required Markdown format or explicit No findings.",
};

export function parseFindings(text: string): Omit<ReviewFinding, "id">[] | null {
  const blocks: string[][] = [];
  let fence = "";
  let noFindings = false;
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (!fence && /^## Finding\s*$/.test(line)) blocks.push([]);
    else if (!fence && /^No findings\s*$/i.test(line)) {
      if (noFindings || blocks.length) return null;
      noFindings = true;
    } else if (noFindings && line.trim()) return null;
    else if (blocks.length) blocks.at(-1)?.push(line);
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = "";
    }
  }
  if (noFindings) return blocks.length ? null : [];
  if (!blocks.length || fence) return null;
  const findings: Omit<ReviewFinding, "id">[] = [];
  for (const lines of blocks) {
    const match =
      /^\s*Axis: (Standards|Spec)\nSeverity: (blocker|major|minor|nit)\nPath: (.+)\nLine: ([1-9]\d*)\nTitle: (.+)\n### Body\s*\n([\s\S]+)$/.exec(
        lines.join("\n").trim(),
      );
    if (!match) return null;
    const finding = {
      axis: match[1],
      severity: match[2],
      path: match[3].trim(),
      line: Number(match[4]),
      title: match[5].trim(),
      body: match[6].trim(),
    };
    if (!isFindingContent(finding)) return null;
    findings.push(finding);
  }
  return findings;
}
