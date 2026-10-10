import { expect, test } from "vitest";
import { codexProfile, claudeProfile, grokProfile } from "../../agents/src/profiles.js";
import {
  createMemoryRepoFiles,
  indexProject,
  permissionLevels,
  permissionPaths,
  permissionPolicy,
  projectPermissionLevel,
  updateProjectPermissionLevel,
} from "./index.js";

test.each([
  [codexProfile, ["read-only", "workspace-write", "workspace-write"]],
  [claudeProfile, ["default", "acceptEdits", "acceptEdits"]],
  [grokProfile, [null, null, null]],
] as const)(
  "%s maps every permission level without disabling the agent's boundary",
  (profile, modes) => {
    for (const [index, level] of permissionLevels.entries()) {
      expect(permissionPolicy(profile, level)).toMatchObject({
        mode: modes[index],
        autoAnswer: level,
      });
      const edit = { kind: "edit", rawInput: { path: "src/file.ts" } };
      const command = { kind: "execute", rawInput: { command: "pnpm test", cwd: "/worktree" } };
      expect(permissionPaths(level, edit, "/worktree") !== null).toBe(level !== "ask");
      expect(permissionPaths(level, command, "/worktree") !== null).toBe(level === "autonomous");
      for (const tool of [
        { ...edit, rawInput: { path: "../outside.ts" } },
        { ...edit, locations: [{ path: "/worktree-sibling/file" }] },
        { ...edit, content: [{ type: "diff", path: "/outside/file" }] },
        { ...command, rawInput: { command: "pnpm test", cwd: "/outside" } },
        { ...command, rawInput: { command: "cat /outside/file", cwd: "/worktree" } },
        { ...command, rawInput: { command: "cat ../outside/file", cwd: "/worktree" } },
        { ...command, rawInput: { command: "cat --file=/outside/file", cwd: "/worktree" } },
        { ...command, rawInput: { command: "cat /outside/file=value", cwd: "/worktree" } },
      ])
        expect(permissionPaths(level, tool, "/worktree")).toBeNull();
    }
  },
);

test("uninspectable commands, expansions, escalation, and unknown targets stay with the developer", () => {
  for (const command of [
    "cat $HOME/file",
    "cat ~/file",
    "cat `pwd`/file",
    "cd src && cat ../../file",
    "sh -c 'cat file'",
    "printf hi > ../outside",
    "node -e 'anything'",
    "curl https://example.invalid",
  ]) {
    expect(
      permissionPaths(
        "autonomous",
        { kind: "execute", rawInput: { command, cwd: "/worktree" } },
        "/worktree",
      ),
    ).toBeNull();
  }
  for (const tool of [
    { kind: "execute" },
    { kind: "edit" },
    { kind: "edit", rawInput: { cwd: "/worktree" } },
    { kind: "edit", rawInput: { path: "link/../file" } },
    { kind: "read", rawInput: { path: "file" } },
    { kind: "execute", rawInput: { command: "pnpm test" } },
    {
      kind: "execute",
      rawInput: {
        command: "pnpm test",
        cwd: "/worktree",
        sandbox_permissions: "require_escalated",
      },
    },
  ]) {
    expect(permissionPaths("autonomous", tool, "/worktree")).toBeNull();
  }
  expect(
    permissionPaths(
      "autonomous",
      { rawInput: { name: "Bash", command: "wc file", cwd: "/worktree" } },
      "/worktree",
    ),
  ).not.toBeNull();
  expect(
    permissionPaths(
      "autonomous",
      { kind: "execute", rawInput: { command: ["pnpm", "test"], cwd: "/worktree" } },
      "/worktree",
    ),
  ).not.toBeNull();
});

test("simple quoted commands are inspectable but unterminated quotes and glob expansion are forwarded", () => {
  expect(
    permissionPaths(
      "autonomous",
      {
        kind: "execute",
        rawInput: { command: "printf 'hello world' > greeting.txt", cwd: "/worktree" },
      },
      "/worktree",
    ),
  ).not.toBeNull();
  for (const command of ["cat 'unterminated", "cat */file", "cat ?/file"])
    expect(
      permissionPaths(
        "autonomous",
        { kind: "execute", rawInput: { command, cwd: "/worktree" } },
        "/worktree",
      ),
    ).toBeNull();
});

test("project defaults are Edit freely, configurable, preserve other settings, and reject invalid configuration", () => {
  expect(projectPermissionLevel()).toBe("edit-freely");
  for (const level of permissionLevels) {
    const text = updateProjectPermissionLevel("other: retained\n", level);
    expect(text).toContain("other: retained");
    expect(projectPermissionLevel(text)).toBe(level);
    expect(
      indexProject(createMemoryRepoFiles({ ".stintwork/config": text }), { name: "Project" })
        .permissionLevel,
    ).toBe(level);
  }
  for (const text of ["permissionLevel: bypass", "[ask]", "permissionLevel: [ask]", "bad: ["])
    expect(() => projectPermissionLevel(text)).toThrow();
  expect(
    indexProject(createMemoryRepoFiles({ ".stintwork/config": "permissionLevel: bypass" }), {
      name: "Project",
    }).warnings,
  ).toContainEqual(expect.objectContaining({ path: ".stintwork/config" }));
});

test("unhonourable levels warn about Codex commands, Grok always-approve and missing modes", () => {
  for (const level of permissionLevels) {
    expect(permissionPolicy(codexProfile, level).warnings.join(" ")).toContain("without asking");
    expect(
      permissionPolicy(
        {
          ...grokProfile,
          capabilities: { ...grokProfile.capabilities, permissionMode: "always-approve" },
        },
        level,
      ).warnings.join(" "),
    ).toContain("always-approve");
    expect(
      permissionPolicy(
        { ...claudeProfile, capabilities: { ...claudeProfile.capabilities, modes: [] } },
        level,
      ).warnings.join(" "),
    ).toContain("cannot honour");
  }
});
