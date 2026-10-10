import { expect, test } from "vitest";
import { collectAfterTurnRequests } from "./after-turn.js";
import { findingsFormat, findingsRequest, parseFindings } from "./findings.js";

const block = `## Finding
Axis: Standards
Severity: major
Path: src/example.ts
Line: 12
Title: Validate the input
### Body
Unchecked input reaches the writer.

Use the existing validator.`;

test.each(["blocker", "major", "minor", "nit"])("supports %s severity", (severity) => {
  expect(
    parseFindings(block.replace("Severity: major", `Severity: ${severity}`))?.[0].severity,
  ).toBe(severity);
});

test("parses multiple finding blocks and ignores a preamble, including fenced headings", () => {
  const reply = `Let me check the change first.\n\n\`\`\`md\n## Finding\n\`\`\`\n${block}\n\n${block.replace("Standards", "Spec").replace("major", "blocker")}`;
  expect(parseFindings(reply.replaceAll("\n", "\r\n"))).toEqual([
    {
      axis: "Standards",
      severity: "major",
      path: "src/example.ts",
      line: 12,
      title: "Validate the input",
      body: "Unchecked input reaches the writer.\n\nUse the existing validator.",
    },
    {
      axis: "Spec",
      severity: "blocker",
      path: "src/example.ts",
      line: 12,
      title: "Validate the input",
      body: "Unchecked input reaches the writer.\n\nUse the existing validator.",
    },
  ]);
  expect(parseFindings(`${block}\n\n\`\`\`md\n## Finding\n\`\`\``)?.[0].body).toContain(
    "## Finding",
  );
  expect(findingsRequest.prompt).toContain(findingsFormat);
});

test.each(["No findings", "Review complete.\n\nNo findings\n", "No findings\r\n"])(
  "an explicit empty review is valid: %s",
  (reply) => expect(parseFindings(reply)).toEqual([]),
);

test.each([
  "",
  "All looks good",
  "No findings\nExtra text",
  `No findings\n${block}`,
  `${block}\nNo findings`,
  `${block}\n## Finding\nMissing metadata`,
  block.replace("Standards", "Style"),
  block.replace("major", "critical"),
  block.replace("Line: 12", "Line: 0"),
  block.replace("Line: 12", "Line: 1.5"),
  block.replace("Line: 12", "Line: 9007199254740992"),
  block.replace("src/example.ts", "../private.txt"),
  block.replace("src/example.ts", "/tmp/private.txt"),
  block.replace("src/example.ts", "C:\\private.txt"),
  block.slice(0, block.indexOf("### Body") + 8),
])("rejects malformed or contradictory findings: %s", (reply) => {
  expect(parseFindings(reply)).toBeNull();
});

test.each(["Not formatted", "No findings"])(
  "records the raw reply and parse outcome: %s",
  async (reply) => {
    const results = await collectAfterTurnRequests([findingsRequest], {
      timeoutMs: 1000,
      prompt: async () => reply,
      failure: new Promise<never>(() => {}),
      retryAfterCancel: () => false,
      cancel: async () => {},
    });
    expect(results).toEqual({
      findings: reply === "No findings" ? [] : null,
      findingsRawReply: reply,
      ...(reply === "No findings" ? {} : { findingsError: findingsRequest.parseError }),
    });
  },
);
