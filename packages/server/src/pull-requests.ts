import { execFile } from "node:child_process";
import { lstat, mkdir, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type { PullRequest, PullRequestChecks, MergeMethod } from "@stintwork/core";
import { createNodeRepoFiles } from "./repo-files.js";

const execute = promisify(execFile);
export async function shipGit(root: string, args: string[]) {
  return (
    await execute("git", args, {
      cwd: root,
      timeout: 60_000,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    })
  ).stdout.trim();
}
async function gh(root: string, args: string[], checks = false) {
  return (
    await execute("gh", args, {
      cwd: root,
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, GH_PROMPT_DISABLED: "1" },
    }).catch((error: { code?: number; stdout?: string }) => {
      if (!checks || ![1, 8].includes(error.code ?? -1) || !error.stdout) throw error;
      return { stdout: error.stdout };
    })
  ).stdout.trim();
}
export async function githubRepository(root: string, remote = "origin") {
  const urls = (await shipGit(root, ["remote", "get-url", "--push", "--all", remote])).split("\n");
  if (urls.length !== 1 || !urls[0] || urls[0].startsWith("-"))
    throw new Error("Shipping requires one push URL for the origin remote.");
  const remoteUrl = urls[0];
  if (remoteUrl.includes("://")) {
    const parsed = new URL(remoteUrl);
    if (parsed.password || (parsed.username && parsed.protocol !== "ssh:"))
      throw new Error("Use a credential-free remote URL and the developer's own gh login.");
  }
  if ((await shipGit(root, ["remote", "get-url", remote])) !== remoteUrl)
    throw new Error("Shipping requires the same fetch and push URL for origin.");
  const info = JSON.parse(
    await gh(root, [
      "repo",
      "view",
      remoteUrl,
      "--json",
      "nameWithOwner,url,mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed,viewerDefaultMergeMethod",
    ]),
  );
  if (
    typeof info.nameWithOwner !== "string" ||
    !/^[\w.-]+\/[\w.-]+$/.test(info.nameWithOwner) ||
    info.url !== `https://github.com/${info.nameWithOwner}`
  )
    throw new Error("The origin remote must resolve to a GitHub repository through gh repo view.");
  const allowed = (["merge", "squash", "rebase"] as const).filter(
    (method) => info[method === "merge" ? "mergeCommitAllowed" : `${method}MergeAllowed`] === true,
  );
  const preferred =
    typeof info.viewerDefaultMergeMethod === "string"
      ? info.viewerDefaultMergeMethod.toLowerCase()
      : "";
  const method = allowed.find((method) => method === preferred) ?? allowed[0];
  if (!method) throw new Error("The repository has no allowed pull request merge method.");
  return { repo: info.nameWithOwner as string, remote, remoteUrl, method };
}

export async function viewPullRequest(
  root: string,
  pr: Pick<PullRequest, "repo">,
  selector: string,
) {
  const info = JSON.parse(
    await gh(root, [
      "pr",
      "view",
      selector,
      "--repo",
      pr.repo,
      "--json",
      "number,url,state,headRefOid,headRefName,baseRefName,mergeCommit,mergedAt,isCrossRepository",
    ]),
  );
  if (
    !Number.isSafeInteger(info.number) ||
    info.number < 1 ||
    info.url !== `https://github.com/${pr.repo}/pull/${info.number}` ||
    !["OPEN", "CLOSED", "MERGED"].includes(info.state) ||
    typeof info.headRefOid !== "string" ||
    !/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(info.headRefOid) ||
    typeof info.headRefName !== "string" ||
    typeof info.baseRefName !== "string" ||
    info.isCrossRepository !== false
  )
    throw new Error("Cannot read the pull request identity and head commit.");
  return info as {
    number: number;
    url: string;
    state: string;
    headRefOid: string;
    headRefName: string;
    baseRefName: string;
    mergeCommit: { oid: string } | null;
    mergedAt: string | null;
  };
}

export async function createPullRequest(
  root: string,
  preview: { repo: string; branch: string; base: string; title: string; body: string },
) {
  const url = await gh(root, [
    "pr",
    "create",
    "--repo",
    preview.repo,
    "--head",
    preview.branch,
    "--base",
    preview.base,
    "--title",
    preview.title,
    "--body",
    preview.body,
  ]);
  return viewPullRequest(root, preview, url);
}

export async function findPullRequest(root: string, repo: string, branch: string) {
  try {
    return await viewPullRequest(root, { repo }, branch);
  } catch (error) {
    const failure = error as { code?: number; stderr?: string; stdout?: string };
    if (
      failure.code === 1 &&
      /no pull requests found|no pull requests associated/i.test(
        `${failure.stderr ?? ""}\n${failure.stdout ?? ""}`,
      )
    )
      return undefined;
    throw error;
  }
}

export async function fetchPullRequestChecks(
  root: string,
  pr: PullRequest,
): Promise<PullRequestChecks> {
  const before = await viewPullRequest(root, pr, String(pr.number));
  const checks: unknown = JSON.parse(
    await gh(
      root,
      ["pr", "checks", String(pr.number), "--repo", pr.repo, "--json", "name,bucket,link"],
      true,
    ).catch((error: { code?: number; stderr?: string; stdout?: string }) => {
      // Real gh exits 1 with plain text when no CI has reported; record no checks, which never pass.
      if (
        error.code === 1 &&
        /no checks reported/i.test(`${error.stderr ?? ""}\n${error.stdout ?? ""}`)
      )
        return "[]";
      throw error;
    }),
  );
  if (
    !Array.isArray(checks) ||
    !checks.every(
      (check) =>
        check &&
        typeof check.name === "string" &&
        typeof check.link === "string" &&
        ["pass", "fail", "pending", "skipping", "cancel"].includes(check.bucket),
    )
  )
    throw new Error("Cannot read pull request CI checks.");
  const after = await viewPullRequest(root, pr, String(pr.number));
  if (
    before.headRefOid !== after.headRefOid ||
    before.number !== pr.number ||
    after.number !== pr.number ||
    before.state !== after.state ||
    before.headRefName !== pr.branch ||
    before.baseRefName !== pr.base
  )
    throw new Error("The pull request changed while reading CI checks. Refresh again.");
  const result = {
    number: pr.number,
    headCommit: after.headRefOid,
    fetchedAt: new Date().toISOString(),
    state: after.state,
    checks,
  } as PullRequestChecks;
  let directory = root;
  for (const part of [".stintwork", "local", "pr-checks"]) {
    directory = join(directory, part);
    await mkdir(directory, { recursive: true });
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("CI evidence directories must be real directories.");
  }
  const path = join(directory, `${pr.number}.json`);
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(result), { flag: "wx" });
  await rename(temporary, path);
  return result;
}

export function readPullRequestChecks(root: string, pr: PullRequest) {
  const text = createNodeRepoFiles(root).read(`.stintwork/local/pr-checks/${pr.number}.json`);
  if (!text) return undefined;
  const value = JSON.parse(text) as PullRequestChecks;
  if (
    value.number !== pr.number ||
    typeof value.headCommit !== "string" ||
    !/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(value.headCommit) ||
    !Number.isFinite(Date.parse(value.fetchedAt)) ||
    !["OPEN", "CLOSED", "MERGED"].includes(value.state) ||
    !Array.isArray(value.checks) ||
    !value.checks.every(
      (check) =>
        typeof check.name === "string" &&
        typeof check.link === "string" &&
        ["pass", "fail", "pending", "skipping", "cancel"].includes(check.bucket),
    )
  )
    throw new Error("Invalid recorded pull request CI evidence.");
  return value;
}

export async function mergePullRequest(
  root: string,
  pr: PullRequest,
  head: string,
  method: MergeMethod,
) {
  await gh(root, [
    "pr",
    "merge",
    String(pr.number),
    "--repo",
    pr.repo,
    `--${method}`,
    "--match-head-commit",
    head,
  ]);
}
