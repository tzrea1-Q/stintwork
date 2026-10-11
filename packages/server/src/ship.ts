// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  indexProject,
  workflowGate,
  workflowMerge,
  workflowPullRequest,
  pullRequestText,
  evidenceStale,
  type PullRequestPreview,
  type MergeRecord,
} from "@stintwork/core";
import {
  dryRunLocalMerge,
  mergeLocalWorkItem,
  LocalMergeRefusal,
  withRepoLock,
  cleanupMergedWorkItem,
  updateMainAfterPullRequest,
} from "@stintwork/git";
import type { Hono } from "hono";
import type { ProjectFilesReader } from "./work-item-files.js";
import type { ReviewEvidenceReader } from "./review-evidence.js";
import { saveWorkItemWorkflow } from "./workflow-writes.js";
import { saveWorkItemReview } from "./review-writes.js";
import { createNodeRepoFiles } from "./repo-files.js";
import { readEvidenceChangedPaths } from "./review-evidence.js";
import {
  githubRepository,
  shipGit,
  createPullRequest,
  findPullRequest,
  fetchPullRequestChecks,
  viewPullRequest,
  mergePullRequest,
  pullRequestMergeMethod,
} from "./pull-requests.js";

export function addShipRoutes(
  app: Hono,
  root: string,
  readProjectFiles: ProjectFilesReader,
  refresh: () => void,
  isStintActive: (slug: string) => boolean,
  writing: Set<string>,
  isChecking: (slug: string) => boolean,
  readReviewEvidence?: ReviewEvidenceReader,
) {
  const previews = new Map<string, { preview: PullRequestPreview; expires: number }>();
  for (const action of [
    "merge-local",
    "send-back",
    "preview-pr",
    "open-pr",
    "pr-checks",
    "preview-merge-pr",
    "merge-pr",
  ] as const) {
    app.post(`/api/work-items/:slug/ship/${action}`, async (context) => {
      const origin = context.req.header("origin");
      if (origin && origin !== new URL(context.req.url).origin)
        return context.json({ reason: "Origin must match the project server." }, 403);
      if (
        context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !==
        "application/json"
      )
        return context.json({ reason: "A JSON Ship action is required." }, 400);
      let body: Record<string, unknown>;
      try {
        body = await context.req.json();
        if (!body || typeof body !== "object" || Array.isArray(body))
          return context.json({ reason: "A JSON Ship action is required." }, 400);
      } catch {
        return context.json({ reason: "Invalid JSON." }, 400);
      }
      const slug = context.req.param("slug");
      if (
        !indexProject(readProjectFiles().files, { name: "" }).workItems.some(
          (item) => item.slug === slug,
        )
      )
        return context.json({ reason: "Work item not found." }, 404);
      if (writing.has(slug))
        return context.json(
          { reason: "A workflow or review write is active for this work item." },
          409,
        );
      writing.add(slug);
      let merged: MergeRecord | undefined;
      function locate() {
        const project = readProjectFiles();
        const snapshot = indexProject(project.files, { name: "" });
        readReviewEvidence?.(project, snapshot);
        const item = snapshot.workItems.find((item) => item.slug === slug);
        if (!item) throw new LocalMergeRefusal("Work item not found.");
        if (
          snapshot.workflows[item.workflow].stages.find(({ id }) => id === item.stage)?.gate !==
            "merge" &&
          action !== "pr-checks"
        )
          throw new LocalMergeRefusal("Merge locally requires the Ship stage.");
        if (
          item.activeStint ||
          item.stints.some(({ status }) => status === "running") ||
          isStintActive(slug)
        )
          throw new LocalMergeRefusal(
            "A stint is running on this work item. Finish or stop it before shipping.",
          );
        if (isChecking(slug))
          throw new LocalMergeRefusal("Cancel or finish checks before shipping.");
        const failure = [...project.warnings, ...snapshot.warnings].find(
          ({ path }) =>
            path === ".git" ||
            path === `.scratch/${slug}/workflow.yaml` ||
            path === `.scratch/${slug}/review.yaml`,
        );
        if (failure || item.reviewEvidenceError || !readReviewEvidence)
          throw new LocalMergeRefusal(
            failure?.message ?? item.reviewEvidenceError ?? "Cannot read Ship evidence.",
          );
        if (item.memoryProposals?.length)
          throw new LocalMergeRefusal(
            "Accept or reject every open memory proposal before shipping.",
          );
        if (action === "merge-local" && item.pullRequest)
          throw new LocalMergeRefusal(
            "Use Merge pull request and passing CI for this work item's pull request.",
          );
        merged =
          item.merged ??
          indexProject(createNodeRepoFiles(root), { name: "" }).workItems.find(
            (item) => item.slug === slug,
          )?.merged;
        return { project, item, workflows: snapshot.workflows };
      }
      try {
        if (
          ["preview-pr", "open-pr", "pr-checks", "preview-merge-pr", "merge-pr"].includes(action)
        ) {
          return await withRepoLock(root, async () => {
            const { project, item, workflows } = locate();
            const worktree = project.worktreePaths.get(slug);
            if (action === "pr-checks") {
              if (!item.pullRequest)
                throw new LocalMergeRefusal("This work item has no pull request.");
              const checks = await fetchPullRequestChecks(root, item.pullRequest);
              refresh();
              return context.json({ checks });
            }
            if (!worktree && !merged)
              throw new LocalMergeRefusal("The work item's worktree is unavailable.");
            const checkout = worktree ?? root;
            let head = await shipGit(checkout, ["rev-parse", "HEAD"]);
            const reviewStage = workflows[item.workflow].stages.find(
              ({ gate }) => gate === "evidence",
            );
            const approval = item.stages[reviewStage?.id ?? "review"]?.approved;
            const approvedCommit =
              approval &&
              typeof approval === "object" &&
              "commit" in approval &&
              typeof approval.commit === "string"
                ? approval.commit
                : undefined;
            if (
              !approvedCommit ||
              evidenceStale(
                {
                  slug,
                  headCommit: head,
                  evidenceChangedPaths: readEvidenceChangedPaths(worktree ?? root, head, [
                    approvedCommit,
                  ]),
                },
                approvedCommit,
              )
            )
              throw new LocalMergeRefusal(
                "Approve the Review gate on current evidence before shipping through GitHub.",
              );
            if (
              worktree &&
              (await shipGit(worktree, ["status", "--porcelain", "--untracked-files=all"]))
            )
              throw new LocalMergeRefusal(
                "Commit worktree changes before shipping through GitHub.",
              );
            const repository = await githubRepository(root);
            if (action === "preview-pr" || action === "open-pr") {
              if (item.pullRequest)
                throw new LocalMergeRefusal("This work item already has a pull request.");
              if (!worktree) throw new LocalMergeRefusal("This work item is already shipped.");
              const branch = await shipGit(checkout, ["symbolic-ref", "--short", "HEAD"]);
              const report = await dryRunLocalMerge(root, slug);
              const base = report.mainBranch;
              if (report.conflicts.length)
                throw new LocalMergeRefusal(
                  "Merge conflicts with the main branch. Send back to resolve them.",
                  report.conflicts,
                );
              if (branch !== `stintwork/${slug}`)
                throw new LocalMergeRefusal(
                  "Shipping requires the work item branch and the main checkout.",
                );
              const details = {
                repo: repository.repo,
                remote: repository.remote,
                remoteUrl: repository.remoteUrl,
                branch,
                base,
                headCommit: head,
                ...pullRequestText(item, workflows),
              };
              if (action === "preview-pr") {
                const preview = { ...details, confirmation: randomUUID() };
                previews.set(slug, { preview, expires: Date.now() + 10 * 60_000 });
                return context.json({ preview });
              }
              const saved = previews.get(slug);
              const expected = saved
                ? { ...details, confirmation: saved.preview.confirmation }
                : undefined;
              if (
                !saved ||
                saved.expires < Date.now() ||
                body.confirmation !== saved.preview.confirmation ||
                JSON.stringify(expected) !== JSON.stringify(saved.preview)
              )
                throw new LocalMergeRefusal(
                  "Explicit push confirmation for this exact preview is required. Preview again if the head or remote changed.",
                );
              previews.delete(slug);
              const existing = await findPullRequest(checkout, details.repo, branch);
              if (
                existing &&
                (existing.headRefOid !== head ||
                  existing.headRefName !== branch ||
                  existing.baseRefName !== base ||
                  existing.state !== "OPEN")
              )
                throw new LocalMergeRefusal(
                  "An existing pull request does not match the confirmed branch and head. Worktree retained; reconcile it before retrying.",
                );
              if (!existing)
                await shipGit(checkout, [
                  "push",
                  "-u",
                  repository.remote,
                  `${head}:refs/heads/${branch}`,
                ]);
              await shipGit(checkout, ["config", `branch.${branch}.remote`, repository.remote]);
              await shipGit(checkout, ["config", `branch.${branch}.merge`, `refs/heads/${branch}`]);
              const opened = existing ?? (await createPullRequest(checkout, details));
              if (
                opened.headRefOid !== head ||
                opened.headRefName !== branch ||
                opened.baseRefName !== base ||
                opened.state !== "OPEN"
              )
                throw new LocalMergeRefusal(
                  "The created pull request does not match the confirmed head and branches. Worktree retained.",
                );
              const { title: _title, body: _body, ...identity } = details;
              const pullRequest = { ...identity, number: opened.number, url: opened.url };
              await saveWorkItemWorkflow(
                checkout,
                slug,
                (text) => workflowPullRequest(text, pullRequest, workflows, item.workflow),
                true,
                `Record pull request #${opened.number} for ${slug}`,
              );
              refresh();
              return context.json({ pullRequest });
            }
            let pr = item.pullRequest;
            if (!pr) throw new LocalMergeRefusal("This work item has no pull request.");
            if (
              pr.repo !== repository.repo ||
              pr.remote !== repository.remote ||
              pr.remoteUrl !== repository.remoteUrl
            )
              throw new LocalMergeRefusal(
                "The GitHub remote changed since the pull request was opened.",
              );
            if (merged) {
              if (action === "preview-merge-pr")
                throw new LocalMergeRefusal("This work item is shipped.");
              await shipGit(root, ["merge-base", "--is-ancestor", merged.commit, "HEAD"]);
              await cleanupMergedWorkItem(root, slug, merged.commit, pr.headCommit);
              refresh();
              return context.json({ merged });
            }
            const checks = await fetchPullRequestChecks(root, pr);
            if (!checks.checks.length || checks.checks.some((check) => check.bucket !== "pass"))
              throw new LocalMergeRefusal(
                "Every pull request CI check must pass before merging; missing, pending, skipped and cancelled checks do not pass.",
              );
            if (
              checks.headCommit !== pr.headCommit ||
              evidenceStale(
                {
                  slug,
                  headCommit: head,
                  evidenceChangedPaths: readEvidenceChangedPaths(checkout, head, [
                    checks.headCommit,
                  ]),
                },
                checks.headCommit,
              )
            )
              throw new LocalMergeRefusal(
                "The PR head differs from the confirmed, reviewed work. Send back and review again.",
              );
            let remote = await viewPullRequest(root, pr, String(pr.number));
            if (
              remote.headRefOid !== checks.headCommit ||
              remote.baseRefName !== pr.base ||
              remote.headRefName !== pr.branch
            )
              throw new LocalMergeRefusal(
                "The pull request changed after reading CI. Refresh again.",
              );
            if (remote.state === "OPEN") {
              const report = await dryRunLocalMerge(root, slug);
              if (report.conflicts.length)
                throw new LocalMergeRefusal(
                  "Merge conflicts with the main branch. Send back to resolve them.",
                  report.conflicts,
                );
              const method = await pullRequestMergeMethod(root, pr, repository);
              if (action === "preview-merge-pr") return context.json({ mergeMethod: method });
              if (body.mergeMethod !== undefined && body.mergeMethod !== method)
                throw new LocalMergeRefusal(
                  "The merge method changed since confirmation. Preview and confirm again.",
                );
              const requested = { ...pr, mergeMethod: method };
              pr = requested;
              await saveWorkItemWorkflow(
                checkout,
                slug,
                (text) => workflowPullRequest(text, requested, workflows, item.workflow),
                true,
                `Record merge method for pull request #${pr.number} for ${slug}`,
              );
              head = await shipGit(checkout, ["rev-parse", "HEAD"]);
              await mergePullRequest(root, pr, checks.headCommit, method);
              remote = await viewPullRequest(root, pr, String(pr.number));
            }
            if (action === "preview-merge-pr")
              throw new LocalMergeRefusal("The pull request is no longer open. Refresh again.");
            if (
              remote.state !== "MERGED" ||
              remote.number !== pr.number ||
              remote.headRefOid !== checks.headCommit ||
              remote.baseRefName !== pr.base ||
              remote.headRefName !== pr.branch ||
              !remote.mergeCommit?.oid ||
              !/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(remote.mergeCommit.oid) ||
              !remote.mergedAt ||
              !Number.isFinite(Date.parse(remote.mergedAt))
            )
              throw new LocalMergeRefusal(
                "GitHub has not completed the merge (it may be queued). Worktree and branch retained; retry after it merges.",
              );
            const localWorkflow = `.scratch/${slug}/workflow.yaml`;
            for (const options of [[], ["--cached"]])
              if (await shipGit(root, ["diff", ...options, "--name-only", "--", localWorkflow]))
                throw new LocalMergeRefusal(
                  "The PR is merged remotely, but main has uncommitted workflow changes. Worktree and branch retained.",
                );
            await updateMainAfterPullRequest(root, pr.remote, pr.base, remote.mergeCommit.oid);
            const record: MergeRecord = {
              at: remote.mergedAt,
              commit: remote.mergeCommit.oid,
              pr: String(pr.number),
              ...(pr.mergeMethod ? { method: pr.mergeMethod } : {}),
            };
            merged = record;
            await saveWorkItemWorkflow(
              root,
              slug,
              (text) =>
                workflowMerge(
                  workflowPullRequest(text, pr, workflows, item.workflow),
                  record,
                  workflows,
                  item.workflow,
                ),
              true,
              `Record merge of ${slug}`,
            );
            if ((await shipGit(checkout, ["rev-parse", "HEAD"])) !== head)
              throw new LocalMergeRefusal(
                "The work item changed during the remote merge. Merge recorded; worktree and branch retained.",
              );
            await cleanupMergedWorkItem(root, slug, merged.commit, pr.headCommit);
            refresh();
            return context.json({ merged });
          });
        }
        if (action === "merge-local") {
          const { workflows, item } = locate();
          const commit = await mergeLocalWorkItem(
            root,
            slug,
            async (commit) => {
              merged = { at: new Date().toISOString(), commit };
              await saveWorkItemWorkflow(
                root,
                slug,
                (text) => workflowMerge(text, merged as MergeRecord, workflows, item.workflow),
                true,
                `Record merge of ${slug}`,
              );
            },
            () => {
              locate();
              return merged?.commit;
            },
          );
          refresh();
          return context.json({ merged, commit });
        }
        return await withRepoLock(root, async () => {
          const { project, item, workflows } = locate();
          if (item.merged) throw new LocalMergeRefusal("This work item is shipped.");
          const report = await dryRunLocalMerge(root, slug);
          if (!report.conflicts.length)
            throw new LocalMergeRefusal("There are no merge conflicts to send back.");
          const implementation = workflows[item.workflow].stages.find(
            (stage) => stage.column === "implement",
          );
          const worktree = project.worktreePaths.get(slug);
          if (!worktree || !implementation)
            throw new LocalMergeRefusal("The implementation worktree is unavailable.");
          let by = "Developer";
          try {
            by =
              execFileSync("git", ["config", "--get", "user.name"], {
                cwd: worktree,
                encoding: "utf8",
              }).trim() || by;
          } catch (error) {
            if ((error as { status?: number }).status !== 1) throw error;
          }
          const at = new Date().toISOString();
          const record = { by, at, commit: report.headCommit };
          const commit = await saveWorkItemReview(worktree, slug, [], undefined, {
            workflow: workflowGate(
              project.files.read(`.scratch/${slug}/workflow.yaml`),
              item,
              implementation.id,
              "reopen",
              record,
              workflows,
            ),
            note: {
              id: `review:${randomUUID()}`,
              at,
              source: "review",
              text: `## Merge conflicts\n\nResolve conflicts with ${report.mainBranch} before shipping:\n${report.conflicts.map((path) => `- ${path}`).join("\n")}`,
            },
          });
          refresh();
          return context.json({ stage: implementation.id, stageName: implementation.name, commit });
        });
      } catch (error) {
        refresh();
        return context.json(
          {
            reason: error instanceof Error ? error.message : String(error),
            ...(error instanceof LocalMergeRefusal
              ? { conflicts: error.conflicts, paths: error.paths }
              : {}),
          },
          409,
        );
      } finally {
        writing.delete(slug);
      }
    });
  }
}
