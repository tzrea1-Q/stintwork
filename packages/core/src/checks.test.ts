import { expect, test } from "vitest";
import { defaultCheckCommands, readProjectConfig } from "./project-config.js";
import { projectPermissionLevel, updateProjectPermissionLevel } from "./permission-levels.js";
import { isCheckExecution, latestCheckResults, type CheckExecution } from "./checks.js";

test("project checks extend the permission reader, and permission edits preserve commands", () => {
  const text =
    "permissionLevel: ask\nchecks:\n  - name: Smoke\n    command: node smoke.js\nother: kept\n";
  expect(readProjectConfig(text)).toEqual({
    permissionLevel: "ask",
    checks: [{ name: "Smoke", command: "node smoke.js" }],
  });
  expect(projectPermissionLevel(text)).toBe("ask");
  const updated = updateProjectPermissionLevel(text, "autonomous");
  expect(readProjectConfig(updated)).toEqual({
    ...readProjectConfig(text),
    permissionLevel: "autonomous",
  });
  expect(updated).toContain("other: kept");
  expect(readProjectConfig()).toEqual({ permissionLevel: "edit-freely" });
  expect(readProjectConfig("checks: []").checks).toEqual([]);
});

test.each([
  "checks: null",
  "checks: test",
  "checks: [test]",
  "checks: [{name: test}]",
  "checks: [{name: '', command: test}]",
  "checks: [{name: test, command: 1}]",
  "checks: [{name: test, command: ' '}]",
  "checks: [{name: test, command: a}, {name: test, command: b}]",
  "permissionLevel: null",
  "[test]",
])("invalid config refuses commands: %s", (text) => {
  expect(() => readProjectConfig(text)).toThrow();
  expect(() => updateProjectPermissionLevel(text, "ask")).toThrow();
});

test("default checks only include present root scripts in the specified order", () => {
  expect(defaultCheckCommands()).toEqual([]);
  expect(
    defaultCheckCommands(
      JSON.stringify({
        scripts: {
          "format:check": "format",
          build: "build",
          test: "test",
          typecheck: "typecheck",
          lint: "lint",
          start: "start",
        },
      }),
      "pnpm",
    ),
  ).toEqual(
    ["test", "lint", "typecheck", "build", "format:check"].map((name) => ({
      name,
      command: `pnpm run ${name}`,
    })),
  );
  expect(defaultCheckCommands('{"scripts":{"test":"yes","lint":1,"build":""}}')).toEqual([
    { name: "test", command: "npm run test" },
  ]);
});

test("latest evidence replaces a name without losing other checks or hiding stale commits", () => {
  const execution: CheckExecution = {
    id: "12345678-1234-1234-1234-123456789abc",
    workItem: "first",
    commit: "a".repeat(40),
    startedAt: "2026-10-10T00:00:00Z",
    endedAt: null,
    results: ["test", "lint"].map((name) => ({
      name,
      command: name,
      commit: "a".repeat(40),
      status: "passed",
      durationMs: 1,
      outputExcerpt: "ok",
    })),
  };
  const next = {
    ...execution,
    commit: "b".repeat(40),
    results: [{ ...execution.results[0], commit: "b".repeat(40), status: "failed" as const }],
  };
  expect(latestCheckResults([execution, next])).toEqual([next.results[0], execution.results[1]]);
  expect(isCheckExecution(execution)).toBe(true);
  for (const invalid of [
    null,
    {},
    { ...execution, commit: "bad" },
    { ...execution, results: [{ ...execution.results[0], durationMs: -1 }] },
    { ...execution, results: [{ ...execution.results[0], status: "unknown" }] },
    { ...execution, results: [null] },
    { ...execution, endedAt: "bad" },
  ])
    expect(isCheckExecution(invalid)).toBe(false);
});
