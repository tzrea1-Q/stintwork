// SPDX-License-Identifier: Apache-2.0
import type { RepoFiles, Warning } from "./work-items.js";

export type SetupReport = {
  tracker: "missing" | "local-markdown" | "github-issues" | "other";
  hasIssueTracker: boolean;
  usesLocalMarkdown: boolean;
  hasAgents: boolean;
  hasClaude: boolean;
  hasGlossary: boolean;
  hasAdrs: boolean;
  warnings: Warning[];
};

export function detectSetup(files: RepoFiles): SetupReport {
  const report: SetupReport = {
    tracker: "missing",
    hasIssueTracker: false,
    usesLocalMarkdown: false,
    hasAgents: false,
    hasClaude: false,
    hasGlossary: false,
    hasAdrs: false,
    warnings: [],
  };
  let paths: readonly string[];
  try {
    paths = files.list("");
  } catch (error) {
    report.warnings.push({ path: "", message: `Cannot list files: ${String(error)}` });
    return report;
  }
  const path = "docs/agents/issue-tracker.md";
  report.hasIssueTracker = paths.includes(path);
  if (report.hasIssueTracker) report.tracker = "other";
  report.hasAgents = paths.includes("AGENTS.md");
  report.hasClaude = paths.includes("CLAUDE.md");
  report.hasGlossary = paths.includes("GLOSSARY.md");
  report.hasAdrs = paths.some((entry) => entry.startsWith("docs/adr/") && entry !== "docs/adr/");
  if (report.hasIssueTracker) {
    try {
      const text = files.read(path);
      if (typeof text !== "string") {
        report.warnings.push({ path, message: "File is missing or is not text" });
      } else if (/[\p{Cc}\uFFFD]/u.test(text.replace(/[\t\r\n]/g, ""))) {
        report.warnings.push({ path, message: "File contains binary or invalid text" });
      } else {
        const declaration = /^#\s+Issue tracker:\s*(.+)$/im.exec(text)?.[1];
        const description = declaration ?? text;
        report.tracker =
          /^github$/i.test(description.trim()) ||
          /\bgithub\s+issues\b|\bgh\s+issue\b/i.test(description)
            ? "github-issues"
            : /\blocal\s+markdown\b|\.scratch\b/i.test(description)
              ? "local-markdown"
              : "other";
        report.usesLocalMarkdown = report.tracker === "local-markdown";
      }
    } catch (error) {
      report.warnings.push({ path, message: `Cannot read file: ${String(error)}` });
    }
  }
  return report;
}
