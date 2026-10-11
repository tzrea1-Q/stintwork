import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test, vi } from "vitest";
import { ensureWorktree, listWorkItemWorktrees } from "@stintwork/git";
import type { PullRequestPreview, ProjectSnapshot } from "@stintwork/core";
import { fakeGh } from "../test/fake-gh.js";
import { createProjectServer } from "./index.js";

const fixtures: { directory: string; project: ReturnType<typeof createProjectServer> }[] = [];
const endpoint = "/api/work-items/first/ship";
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
async function write(root: string, path: string, text: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}
async function fixture(method = "merge") {
  const directory = await mkdtemp(join(tmpdir(), "stintwork-pr-"));
  const fake = await fakeGh(join(directory, "bin"));
  vi.stubEnv("PATH", fake.path);
  const root = join(directory, "project");
  git(directory, "init", "--quiet", "--initial-branch=main", root);
  git(root, "config", "user.name", "Developer Tests");
  git(root, "config", "user.email", "tests@example.invalid");
  for (const [path, text] of Object.entries({
    "web/index.html": "<!doctype html><title>Tests</title>",
    ".gitignore": ".stintwork/local/\n",
    ".stintwork/config": "checks: []\n",
    ".scratch/first/spec.md": "# First change\n\nPublish carefully.",
    ".scratch/first/issues/01-first.md": "# First ticket\nStatus: resolved\nBlocked by: none",
    ".scratch/first/workflow.yaml": "workflow: feature\nstage: ship\n",
    "code.txt": "base\n",
    "unrelated.txt": "keep\n",
  }))
    await write(root, path, text);
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "Fixture");
  const base = git(root, "rev-parse", "HEAD");
  const bare = join(directory, "remote.git");
  git(directory, "clone", "--quiet", "--bare", root, bare);
  git(bare, "config", "user.name", "Remote Tests");
  git(bare, "config", "user.email", "remote@example.invalid");
  git(root, "remote", "add", "origin", bare);
  const worktree = await ensureWorktree(root, "first");
  await write(worktree.path, "code.txt", "feature\n");
  git(worktree.path, "add", "code.txt");
  git(worktree.path, "commit", "--quiet", "-m", "Feature");
  const reviewed = git(worktree.path, "rev-parse", "HEAD");
  await write(
    worktree.path,
    ".scratch/first/workflow.yaml",
    `workflow: feature\nstage: ship\nstages:\n  review:\n    approved: { by: Developer, at: '2026-10-10T10:00:00Z', commit: ${reviewed} }\n`,
  );
  git(worktree.path, "add", ".scratch/first/workflow.yaml");
  git(worktree.path, "commit", "--quiet", "-m", "Approve Review");
  const head = git(worktree.path, "rev-parse", "HEAD");
  const prView = {
    number: 12,
    url: "https://github.com/example/project/pull/12",
    state: "OPEN",
    headRefOid: head,
    headRefName: worktree.branch,
    baseRefName: "main",
    mergeCommit: null,
    mergedAt: null,
    isCrossRepository: false,
  };
  const script = {
    "repo view": {
      stdout: {
        nameWithOwner: "example/project",
        url: "https://github.com/example/project",
        mergeCommitAllowed: method === "merge",
        squashMergeAllowed: method === "squash",
        rebaseMergeAllowed: method === "rebase",
      },
    },
    "pr create": { stdout: prView.url },
    "pr view": { stdout: prView },
    "pr checks": { stdout: [{ name: "CI", bucket: "pass", link: "" }], code: 0 },
    "pr merge": {
      stdout: "",
      effect: `
      const bare = ${JSON.stringify(bare)};
      const head = ${JSON.stringify(head)};
      const method = ${JSON.stringify(method)};
      let commit = head;
      if (method !== 'merge') {
        const tree = execFileSync('git', ['rev-parse', head + '^{tree}'], {cwd: bare, encoding: 'utf8'}).trim();
        const parent = execFileSync('git', ['rev-parse', 'main'], {cwd: bare, encoding: 'utf8'}).trim();
        commit = execFileSync('git', ['commit-tree', tree, '-p', parent, '-m', 'Remote squash'], {cwd: bare, encoding: 'utf8'}).trim();
      }
      execFileSync('git', ['update-ref', 'refs/heads/main', commit], {cwd: bare});
      const replies = JSON.parse(fs.readFileSync(script, 'utf8'));
      const view = Array.isArray(replies['pr view']) ? replies['pr view'].at(-1) : replies['pr view'];
      view.stdout.state = 'MERGED';
      view.stdout.mergeCommit = {oid: commit};
      view.stdout.mergedAt = '2026-10-10T10:10:00Z';
      fs.writeFileSync(script, JSON.stringify(replies));
    `,
    },
  };
  await fake.script({
    ...script,
    "pr view": [{ code: 1, stdout: "no pull requests found for branch" }, script["pr view"]],
  });
  const project = createProjectServer(root, join(root, "web"));
  fixtures.push({ directory, project });
  const post = (action: string, body: unknown = {}) =>
    project.app.request(`${endpoint}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  async function preview(): Promise<PullRequestPreview> {
    const response = await post("preview-pr");
    expect(response.status, await response.clone().text()).toBe(200);
    return (await response.json()).preview;
  }
  async function open() {
    const confirmation = (await preview()).confirmation;
    const response = await post("open-pr", { confirmation });
    expect(response.status, await response.clone().text()).toBe(200);
    return (await response.json()).pullRequest;
  }
  return { root, bare, head, base, worktree, fake, script, project, post, preview, open };
}
afterEach(async () => {
  for (const { directory, project } of fixtures.splice(0)) {
    await project.stop();
    await rm(directory, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("preview and missing, forged or expired confirmation never push or create a PR", async () => {
  const { post, preview, fake, bare } = await fixture();
  const details = await preview();
  expect(details).toMatchObject({
    remote: "origin",
    remoteUrl: bare,
    branch: "stintwork/first",
    title: "First change",
  });
  expect(details.body).toContain("First ticket");
  for (const confirmation of [undefined, "forged"])
    expect((await post("open-pr", { confirmation })).status).toBe(409);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 11 * 60_000);
  expect((await post("open-pr", { confirmation: details.confirmation })).status).toBe(409);
  vi.restoreAllMocks();
  expect((await fake.calls()).some(({ args }) => args[0] === "pr")).toBe(false);
  expect(git(bare, "branch", "--list", "stintwork/first")).toBe("");
});

test.each(["head", "remote", "body"])(
  "a changed %s invalidates push confirmation",
  async (change) => {
    const { root, worktree, preview, post, bare, fake } = await fixture();
    const { confirmation } = await preview();
    if (change === "remote") {
      const other = `${bare}-other`;
      git(root, "clone", "--quiet", "--bare", bare, other);
      git(root, "remote", "set-url", "origin", other);
    } else {
      await write(
        worktree.path,
        change === "body" ? ".scratch/first/spec.md" : "code.txt",
        "Changed\n",
      );
      git(worktree.path, "add", ".");
      git(worktree.path, "commit", "--quiet", "-m", "Change");
    }
    expect((await post("open-pr", { confirmation })).status).toBe(409);
    expect(git(bare, "branch", "--list", "stintwork/first")).toBe("");
    expect((await fake.calls()).some(({ args }) => args[1] === "create")).toBe(false);
  },
);

test("confirmed opening pushes exactly the previewed head and records the generated title/body and PR identity", async () => {
  const { head, bare, worktree, preview, post, fake, project } = await fixture();
  const details = await preview();
  const response = await post("open-pr", { confirmation: details.confirmation });
  expect(response.status, await response.clone().text()).toBe(200);
  expect(git(bare, "rev-parse", "stintwork/first")).toBe(head);
  const call = (await fake.calls()).find(({ args }) => args[1] === "create");
  expect(call?.args).toEqual([
    "pr",
    "create",
    "--repo",
    "example/project",
    "--head",
    "stintwork/first",
    "--base",
    "main",
    "--title",
    details.title,
    "--body",
    details.body,
  ]);
  expect(git(worktree.path, "log", "-1", "--format=%s")).toBe("Record pull request #12 for first");
  expect(git(worktree.path, "rev-parse", "--abbrev-ref", "@{upstream}")).toBe(
    "origin/stintwork/first",
  );
  const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
  expect(snapshot.workItems[0].pullRequest).toMatchObject({ number: 12, headCommit: head });
  expect((await post("open-pr", { confirmation: details.confirmation })).status).toBe(409);
  expect((await post("merge-local")).status).toBe(409);
});

test("on-demand CI evidence is persisted with the remote PR head, not the newer local bookkeeping commit", async () => {
  const { open, post, script, fake, head, root, project, worktree } = await fixture();
  await open();
  script["pr checks"] = { stdout: [{ name: "CI", bucket: "pending", link: "" }], code: 8 };
  await fake.script(script);
  const response = await post("pr-checks");
  expect(response.status, await response.clone().text()).toBe(200);
  expect((await response.json()).checks).toMatchObject({
    headCommit: head,
    checks: [{ name: "CI", bucket: "pending" }],
  });
  expect(git(worktree.path, "rev-parse", "HEAD")).not.toBe(head);
  expect(
    JSON.parse(await readFile(join(root, ".stintwork/local/pr-checks/12.json"), "utf8")).headCommit,
  ).toBe(head);
  const snapshot = await (await project.app.request("/api/project")).json();
  expect(snapshot.workItems[0].pullRequestChecks.headCommit).toBe(head);
});

test("a PR with no reported CI records no checks and refuses merge, as real gh reports it", async () => {
  const { open, post, script, fake } = await fixture();
  await open();
  // Real gh exits 1 and prints plain text on stderr, not JSON, when no CI has reported.
  await fake.script({
    ...script,
    "pr checks": {
      stdout: "",
      code: 1,
      effect: "process.stderr.write(\"no checks reported on the 'stintwork/first' branch\\n\");",
    },
  });
  const response = await post("pr-checks");
  expect(response.status, await response.clone().text()).toBe(200);
  expect((await response.json()).checks).toMatchObject({ checks: [] });
  const merge = await post("merge-pr");
  expect(merge.status).toBe(409);
  expect((await merge.json()).reason).toContain("Every pull request CI check");
  expect((await fake.calls()).some(({ args }) => args[1] === "merge")).toBe(false);
});

test.each(["fail", "pending", "skipping", "cancel", "empty"])(
  "merge refuses %s CI, without gh merge or cleanup",
  async (bucket) => {
    const { open, post, script, fake, root, base } = await fixture();
    await open();
    script["pr checks"] = {
      stdout: bucket === "empty" ? [] : [{ name: "CI", bucket, link: "" }],
      code: bucket === "pending" ? 8 : 1,
    };
    await fake.script(script);
    const response = await post("merge-pr");
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toContain("Every pull request CI check");
    expect((await fake.calls()).some(({ args }) => args[1] === "merge")).toBe(false);
    expect(git(root, "rev-parse", "HEAD")).toBe(base);
    expect(listWorkItemWorktrees(root).worktrees.size).toBe(1);
  },
);

test.each(["merge", "squash", "rebase"])(
  "%s merges non-interactively, fast-forwards main, records method and PR, cleans up and ships",
  async (method) => {
    const { open, post, fake, root, bare, project, head } = await fixture(method);
    await open();
    await write(root, "unrelated.txt", "staged unrelated\n");
    git(root, "add", "unrelated.txt");
    const response = await post("merge-pr");
    expect(response.status, await response.clone().text()).toBe(200);
    const { merged } = await response.json();
    expect(merged).toMatchObject({ pr: "12", method, commit: git(bare, "rev-parse", "main") });
    expect(git(root, "merge-base", "HEAD", merged.commit)).toBe(merged.commit);
    expect(git(root, "log", "-1", "--format=%s")).toBe("Record merge of first");
    expect(git(root, "diff", "--cached", "--name-only")).toBe("unrelated.txt");
    expect(listWorkItemWorktrees(root).worktrees.size).toBe(0);
    expect(git(root, "branch", "--list", "stintwork/first")).toBe("");
    const call = (await fake.calls()).find(({ args }) => args[1] === "merge");
    expect(call?.args).toContain(`--${method}`);
    expect(call?.args).toContain("--match-head-commit");
    expect(call?.args.at(-1)).toBe(head);
    expect(call?.args).not.toContain("--admin");
    expect(call?.args).not.toContain("--auto");
    const snapshot = await (await project.app.request("/api/project")).json();
    expect(snapshot.workItems[0].stage).toBe("ship");
    expect(snapshot.workItems[0].merged).toEqual(merged);
    const restarted = createProjectServer(root, join(root, "web"));
    try {
      const persisted = await (await restarted.app.request("/api/project")).json();
      expect(persisted.workItems[0].merged).toEqual(merged);
      expect(persisted.workItems[0].pullRequestChecks.headCommit).toBe(
        snapshot.workItems[0].pullRequest.headCommit,
      );
    } finally {
      await restarted.stop();
    }
  },
);

test.each(["diverged", "dirty"])(
  "remote merge retains work for %s main; dirty-main retry avoids another remote merge",
  async (failure) => {
    const { open, post, root, bare, fake, worktree } = await fixture();
    await open();
    if (failure === "diverged") {
      await write(root, "local.txt", "Local main\n");
      git(root, "add", "local.txt");
      git(root, "commit", "--quiet", "-m", "Local main");
    } else await write(root, "code.txt", "Dirty main\n");
    const main = git(root, "rev-parse", "HEAD");
    const response = await post("merge-pr");
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toContain(
      failure === "diverged" ? "diverged" : "uncommitted",
    );
    expect(git(root, "rev-parse", "HEAD")).toBe(main);
    expect(listWorkItemWorktrees(root).worktrees.size).toBe(1);
    expect(git(bare, "rev-parse", "main")).not.toBe(main);
    if (failure === "dirty") {
      await write(root, "code.txt", "base\n");
      const retried = await post("merge-pr");
      expect(retried.status, await retried.clone().text()).toBe(200);
      expect((await fake.calls()).filter(({ args }) => args[1] === "merge")).toHaveLength(1);
    } else expect(await readFile(join(worktree.path, "code.txt"), "utf8")).toBe("feature\n");
  },
);

test.each(["approval", "head", "remote-head", "remote-check-race", "queued"])(
  "merge refuses %s and retains the worktree",
  async (failure) => {
    const { open, post, worktree, script, fake, root } = await fixture();
    await open();
    if (failure === "approval") {
      const path = join(worktree.path, ".scratch/first/workflow.yaml");
      await writeFile(path, (await readFile(path, "utf8")).replace(/ {4}approved:.*\n/, ""));
      git(worktree.path, "add", ".");
      git(worktree.path, "commit", "--quiet", "-m", "Revoke approval");
    } else if (failure === "head") {
      await write(worktree.path, "code.txt", "Unreviewed\n");
      git(worktree.path, "add", ".");
      git(worktree.path, "commit", "--quiet", "-m", "Unreviewed");
    } else {
      if (failure === "remote-head") script["pr view"].stdout.headRefOid = "b".repeat(40);
      if (failure === "remote-check-race") {
        await fake.script({
          ...script,
          "pr view": [
            script["pr view"],
            { stdout: { ...script["pr view"].stdout, headRefOid: "b".repeat(40) } },
          ],
        });
      } else {
        if (failure === "queued") script["pr merge"].effect = "";
        await fake.script(script);
      }
    }
    const response = await post("merge-pr");
    expect(response.status).toBe(409);
    expect(listWorkItemWorktrees(root).worktrees.size).toBe(1);
    if (failure !== "queued")
      expect((await fake.calls()).some(({ args }) => args[1] === "merge")).toBe(false);
  },
);

test.each(["SQUASH", "MERGE", "REBASE"])(
  "uses allowed gh default %s before the fallback order",
  async (preferred) => {
    const method = preferred.toLowerCase();
    const { open, post, fake, script } = await fixture(method);
    await open();
    await fake.script({
      ...script,
      "repo view": {
        stdout: {
          ...script["repo view"].stdout,
          viewerDefaultMergeMethod: preferred,
          mergeCommitAllowed: true,
          squashMergeAllowed: true,
          rebaseMergeAllowed: true,
        },
      },
    });
    const response = await post("merge-pr");
    expect(response.status, await response.clone().text()).toBe(200);
    expect((await response.json()).merged.method).toBe(method);
    expect((await fake.calls()).find(({ args }) => args[1] === "merge")?.args).toContain(
      `--${method}`,
    );
  },
);

test("an externally completed PR fast-forwards and cleans up without claiming an unobserved merge method", async () => {
  const { open, post, fake, script, bare, head } = await fixture();
  await open();
  git(bare, "update-ref", "refs/heads/main", head);
  await fake.script({
    ...script,
    "pr view": {
      stdout: {
        ...script["pr view"].stdout,
        state: "MERGED",
        mergeCommit: { oid: head },
        mergedAt: "2026-10-10T10:10:00Z",
      },
    },
  });
  const response = await post("merge-pr");
  expect(response.status, await response.clone().text()).toBe(200);
  const { merged } = await response.json();
  expect(merged.pr).toBe("12");
  expect(merged.method).toBeUndefined();
  expect((await fake.calls()).some(({ args }) => args[1] === "merge")).toBe(false);
});

test.each(["record", "cleanup"])(
  "%s failure retains the PR work; retry ships without repeating the remote merge or recording",
  async (failure) => {
    const { open, post, worktree, root, fake } = await fixture("squash");
    await open();
    const hook = join(root, ".git/hooks/pre-commit");
    if (failure === "record")
      await writeFile(
        hook,
        "#!/bin/sh\nif git diff --cached -- .scratch/first/workflow.yaml | grep -q '^+merged:'; then exit 1; fi\nexit 0\n",
        { mode: 0o755 },
      );
    else git(root, "worktree", "lock", worktree.path);
    const response = await post("merge-pr");
    expect(response.status).toBe(409);
    expect(listWorkItemWorktrees(root).worktrees.size).toBe(1);
    if (failure === "record") await rm(hook);
    else git(root, "worktree", "unlock", worktree.path);
    const retry = await post("merge-pr");
    expect(retry.status, await retry.clone().text()).toBe(200);
    expect((await retry.json()).merged).toMatchObject({ method: "squash", pr: "12" });
    expect((await fake.calls()).filter(({ args }) => args[1] === "merge")).toHaveLength(1);
    expect(
      git(root, "log", "--format=%s")
        .split("\n")
        .filter((subject) => subject === "Record merge of first"),
    ).toHaveLength(1);
    expect(listWorkItemWorktrees(root).worktrees.size).toBe(0);
  },
);

test("a created PR is recovered after a failed local recording, without another push or create", async () => {
  const { post, preview, root, worktree, fake } = await fixture();
  const hook = join(root, ".git/hooks/pre-commit");
  await writeFile(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  const first = await post("open-pr", { confirmation: (await preview()).confirmation });
  expect(first.status).toBe(409);
  await rm(hook);
  const retry = await post("open-pr", { confirmation: (await preview()).confirmation });
  expect(retry.status, await retry.clone().text()).toBe(200);
  expect((await fake.calls()).filter(({ args }) => args[1] === "create")).toHaveLength(1);
  expect(git(worktree.path, "log", "-1", "--format=%s")).toBe("Record pull request #12 for first");
});

test("origin with embedded credentials or several push URLs is refused without invoking gh", async () => {
  const { root, post, fake } = await fixture();
  git(
    root,
    "remote",
    "set-url",
    "origin",
    "https://user:example-test-secret@github.com/example/project.git",
  );
  let response = await post("preview-pr");
  expect(response.status).toBe(409);
  expect((await response.json()).reason).toContain("credential-free");
  git(root, "remote", "set-url", "--add", "--push", "origin", "/tmp/first-local-remote");
  git(root, "remote", "set-url", "--add", "--push", "origin", "/tmp/second-local-remote");
  response = await post("preview-pr");
  expect(response.status).toBe(409);
  expect((await fake.calls()).length).toBe(0);
});

test("PR actions reject foreign origins, malformed JSON, no remote, gh failure and wrong stage without publishing", async () => {
  const { project, root, post, fake, script } = await fixture();
  for (const action of ["preview-pr", "open-pr", "pr-checks", "merge-pr"]) {
    expect(
      (
        await project.app.request(`${endpoint}/${action}`, {
          method: "POST",
          headers: { origin: "https://foreign.invalid" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await project.app.request(`${endpoint}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        })
      ).status,
    ).toBe(400);
    expect((await project.app.request(`${endpoint}/${action}`, { method: "POST" })).status).toBe(
      400,
    );
  }
  await fake.script({ ...script, "repo view": { code: 1, stdout: "" } });
  expect((await post("preview-pr")).status).toBe(409);
  git(root, "remote", "remove", "origin");
  expect((await post("preview-pr")).status).toBe(409);
  expect((await fake.calls()).some(({ args }) => args[1] === "create")).toBe(false);
});
