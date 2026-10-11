// SPDX-License-Identifier: Apache-2.0
import { parse } from "yaml";
import { expect, test } from "vitest";
import { firstStintWorkflow } from "./first-stint-workflow.js";

test("a first stint still defaults to Codex, but can record the selected registered agent", () => {
  expect(parse(firstStintWorkflow(undefined, "feature", "implement"))).toEqual({
    workflow: "feature",
    stage: "implement",
    stages: { implement: { agent: "codex" } },
  });
  const existing =
    "# Keep project choices\nworkflow: feature\nstage: implement\nstages:\n  clarify:\n    agent: planning-agent\n";
  const selected = firstStintWorkflow(existing, "feature", "implement", "second-agent");
  expect(selected).toContain("# Keep project choices");
  expect(parse(selected).stages).toEqual({
    clarify: { agent: "planning-agent" },
    implement: { agent: "second-agent" },
  });
  expect(firstStintWorkflow(selected, "feature", "implement", "second-agent")).toBe(selected);
});
