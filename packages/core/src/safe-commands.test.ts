// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { permissionPaths } from "./permission-levels.js";

test.each([
  "cat README.md",
  "cat file; git status",
  "git status;git diff&&pnpm test",
  'echo "literal text" /outside/file',
  "echo EXIT $?",
  'echo "exit=$?"',
  'echo "exit=$?" 2>&1 | head',
  'pnpm test 2>&1; echo "exit=$?"',
  "node --version",
  "node -v",
  "pnpm --version",
  "pnpm -v",
  "git --version",
  ["echo", "literal text"],
  ["node", "--version"],
  "cat 'file with spaces'",
  'cat "file with spaces"',
  "cat src/'file with spaces'",
  "ls -la src",
  "head -n 20 README.md",
  "tail --lines=10 README.md",
  "sed -n '1,80p' src/index.ts",
  "grep -n pattern src/index.ts",
  "rg -n 'first|second' src",
  "rg --files src",
  "wc -l README.md",
  "git status --short --branch",
  "git diff --stat",
  "git diff --cached -- src/index.ts",
  "git log --oneline -5",
  "git show HEAD -- src/index.ts",
  "cat README.md | head -n 10 | wc -l",
  "git status && git diff",
  "git status&&git diff|head -n 10",
  "pnpm test",
  "pnpm test 2>&1 | tail -20",
  "pnpm test 2>&1",
  "pnpm test 2>&1|tail -20",
  "pnpm test 2>&1 && pnpm lint 2>&1",
  "pnpm run lint",
  "pnpm typecheck",
  "pnpm format:check",
  "pnpm build",
  "pnpm -r build",
  "pnpm --config.verify-deps-before-run=false test",
  "pnpm vitest run packages/core/src/permission-levels.test.ts",
  "pnpm exec vitest run",
  "vitest --run src/example.test.ts",
  "tsc --noEmit",
  "pnpm exec tsc --noEmit -p tsconfig.json",
  "pnpm tsc --noEmit --project tsconfig.json",
  "biome lint .",
  "pnpm biome format .",
  "pnpm exec biome check src",
  ["cat", "file with spaces"],
  ["pnpm", "test"],
  ["pnpm", "exec", "vitest", "run"],
])("Edit freely auto-answers a literal safe command: %s", (command) => {
  for (const rawInput of [
    { command, cwd: "/worktree/src" },
    { name: "Bash", command, cwd: "/worktree/src" },
  ]) {
    const tool = { kind: rawInput.name ? undefined : "execute", rawInput };
    expect(permissionPaths("edit-freely", tool, "/worktree")).not.toBeNull();
    expect(permissionPaths("ask", tool, "/worktree")).toBeNull();
  }
});

test.each([
  "cat /outside/file",
  "cat ../file",
  "cat /worktree-sibling/file",
  "cat /worktree/src/../../outside/file",
  "cat ''",
  "cat 'unterminated",
  'cat "unterminated',
  "cat file > output",
  "pnpm test 2>file",
  "pnpm test >out",
  "cat x 2>&1>y",
  "pnpm test 2>&1 extra",
  "pnpm test 2>&1 2>&1",
  "pnpm test 2>&1suffix",
  "pnpm test 22>&1",
  "pnpm test 2 >&1",
  "2>&1 pnpm test",
  "cat '2>&1'",
  ["pnpm", "test", "2>&1"],
  "cat file >> /outside/file",
  "cat file 2>/outside/file",
  "cat file < /outside/file",
  "cat file | tee /outside/file",
  "git status && rm file",
  "git status && curl https://example.invalid",
  "cd /outside && cat file",
  "cd src && cat file",
  "pnpm test; rm x",
  "pnpm test & rm x",
  "pnpm test || rm x",
  "pnpm test;;pnpm lint",
  ";pnpm test",
  "pnpm test;",
  "echo $(id)",
  `echo \${HOME}`,
  "echo $HOME",
  "echo $?suffix",
  "echo '$?'",
  'echo "exit=$?"$?',
  'cat "exit=$?"',
  "cat $?",
  "node --version file",
  "node --version -e code",
  "node -v file",
  "pnpm --version test",
  "pnpm -v test",
  "pnpm -r --version",
  "git --version status",
  "git -v",
  "cat file\ngit status",
  "cat file & git status",
  "cat file || git status",
  "cat file |",
  "&& cat file",
  "cat file | | wc",
  "cat $HOME/file",
  "cat ~/file",
  "cat $(pwd)/file",
  "cat `pwd`/file",
  "cat file\\ name",
  "cat *.md",
  "cat <(cat file)",
  "cat file # comment",
  "cat file\0",
  "cat file\r",
  "git\u00a0status",
  "pnpm\u2028test",
  "pnpm test\u00a0&& git status",
  "sh -c 'git status'",
  "bash -lc 'pnpm test'",
  "env pnpm test",
  "PATH=outside pnpm test",
  "/bin/cat file",
  "unknown file",
  "git -C /outside status",
  "git -c core.pager=anything log",
  "git diff --output=/outside/file",
  "git diff --ext-diff",
  "git show --textconv",
  "git checkout file",
  "git push",
  "sed -i '1p' file",
  "sed -n '1w /outside/file' file",
  "sed -n '1e' file",
  "sed -n -f script file",
  "rg --pre command file",
  "rg --pre=command file",
  "rg --follow pattern .",
  "rg -L pattern .",
  "ls -LR .",
  "grep -R pattern .",
  "grep -f /outside/file file",
  "wc --files0-from=/outside/file",
  "head -n anything file",
  "pnpm install",
  "pnpm",
  "pnpm exec",
  "pnpm run",
  "pnpm run exec vitest run",
  "pnpm run vitest run",
  "pnpm dlx vitest run",
  "pnpm exec unknown",
  "pnpm --dir /outside test",
  "pnpm test --update",
  "pnpm vitest run --update",
  "vitest",
  "tsc --outDir /outside",
  "tsc --noEmit --project /outside/tsconfig.json",
  "biome check --write .",
  "biome format --write .",
  "pnpm exec biome lint /outside",
  "pnpm exec biome check --config-path=/outside .",
  ["bash", "-lc", "git status"],
  ["cat", "../outside"],
  ["cat", "file", "&&", "rm", "file"],
  ["cat", "file", ">", "/outside/file"],
  ["pnpm", 1],
  [],
  null,
  {},
  "",
])("Edit freely leaves unsafe or ambiguous commands manual: %s", (command) => {
  expect(
    permissionPaths(
      "edit-freely",
      { kind: "execute", rawInput: { command, cwd: "/worktree" } },
      "/worktree",
    ),
  ).toBeNull();
});

test.each([
  {
    command:
      "cat package.json .gitignore .scratch/wordcount/workflow.yaml .stintwork/roadmap.md; git log --oneline -3; node --version; pnpm --version",
    automatic: true,
  },
  {
    command: 'pnpm test; echo "exit=$?"; pnpm lint; echo "exit=$?"; pnpm build; echo "exit=$?"',
    automatic: true,
  },
  { command: 'node count.test.js; echo "exit=$?"', automatic: false },
  {
    command: `sed -i '' 's/.../.../' package.json && cat package.json && pnpm test; echo "exit=$?"`,
    automatic: false,
  },
  { command: "pnpm test; echo EXIT $?; node -e '...'", automatic: false },
  {
    command: "sed -i '' ... .scratch/wordcount/issues/01-count.md && cat >> ... <<'EOF' ...",
    automatic: false,
  },
])("captured Claude command is classified conservatively: %j", ({ command, automatic }) => {
  for (const tool of [
    { rawInput: { command, description: "Inspect and check the work item", name: "Bash" } },
    { kind: "execute", rawInput: { command, description: "Inspect and check the work item" } },
  ]) {
    expect(permissionPaths("edit-freely", tool, "/worktree") !== null).toBe(automatic);
    expect(permissionPaths("ask", tool, "/worktree")).toBeNull();
  }
});

test.each([
  { command: "unknown" },
  { command: "pnpm test", cwd: "/outside" },
  { command: "pnpm test", cwd: "/worktree-sibling" },
  { command: "pnpm test", cwd: "src" },
  { command: "pnpm test", cwd: "/worktree", network: true },
  { command: "pnpm test", cwd: "/worktree", sandbox_permissions: "require_escalated" },
  { command: "pnpm test", cwd: "/worktree", permissions: {} },
  { command: "pnpm test", cwd: "/worktree", additionalPermissions: {} },
  { command: "pnpm test", cwd: "/worktree", networkApprovalContext: {} },
  { command: "pnpm test", cwd: "/worktree", url: "https://example.invalid" },
])("Edit freely refuses invalid cwd and broader access: %j", (rawInput) => {
  expect(permissionPaths("edit-freely", { kind: "execute", rawInput }, "/worktree")).toBeNull();
});

test.each([
  {
    command: 'pnpm vitest run packages/cli 2>&1 | grep -E "AssertionError|Expected" | head',
    description: "Show the failing assertion",
  },
  { command: "pnpm format:check 2>&1 | head -30", description: "Show formatting errors" },
])(
  "real Claude commands without cwd use the stint worktree only at Edit freely: %j",
  (rawInput) => {
    for (const tool of [
      { rawInput: { ...rawInput, name: "Bash" } },
      { kind: "execute", rawInput },
    ]) {
      expect(permissionPaths("edit-freely", tool, "/worktree")).not.toBeNull();
      expect(permissionPaths("ask", tool, "/worktree")).toBeNull();
      expect(permissionPaths("autonomous", tool, "/worktree")).toBeNull();
      expect(
        permissionPaths(
          "edit-freely",
          {
            ...tool,
            rawInput: { ...tool.rawInput, cwd: "/outside" },
          },
          "/worktree",
        ),
      ).toBeNull();
    }
  },
);

test("missing cwd still confines Claude relative and absolute operands to the stint worktree", () => {
  const tool = { kind: "execute", rawInput: { command: "cat src/file" } };
  expect(permissionPaths("edit-freely", tool, "/worktree")).toEqual([
    "/worktree",
    "/worktree/src/file",
  ]);
  for (const command of ["cat ../outside", "cat /outside/file"])
    expect(
      permissionPaths("edit-freely", { ...tool, rawInput: { command } }, "/worktree"),
    ).toBeNull();
});

test("safe command targets retain cwd, operand and tool-location boundaries for filesystem checks", () => {
  const tool = {
    kind: "execute",
    rawInput: { command: "cat 'file with spaces' | wc -l", cwd: "/worktree/src" },
  };
  expect(permissionPaths("edit-freely", tool, "/worktree")).toContain(
    "/worktree/src/file with spaces",
  );
  expect(
    permissionPaths(
      "edit-freely",
      { ...tool, locations: [{ path: "/outside/file" }] },
      "/worktree",
    ),
  ).toBeNull();
  expect(
    permissionPaths(
      "edit-freely",
      { ...tool, content: [{ type: "diff", path: "/outside/file" }] },
      "/worktree",
    ),
  ).toBeNull();
});

test.each([
  ["git status", true],
  ["rm -rf /", false],
  ["unknown-command", false],
])("Antigravity CommandLine %s is allowed only when safe", (command, allowed) => {
  const tool = { kind: "execute", rawInput: { CommandLine: command, WaitMsBeforeAsync: 5000 } };
  expect(permissionPaths("edit-freely", tool, "/worktree") !== null).toBe(allowed);
});

test("conflicting command fields require a decision", () => {
  expect(
    permissionPaths(
      "edit-freely",
      { kind: "execute", rawInput: { command: "git status", CommandLine: "rm -rf /" } },
      "/worktree",
    ),
  ).toBeNull();
});
