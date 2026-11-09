// SPDX-License-Identifier: Apache-2.0
import {
  coreTextWire,
  createMemoryRepoFiles,
  errorText,
  coreText,
  workflowGate,
  workflowMerge,
  workflowPullRequest,
  pullRequestText,
  evidenceStale,
  riskyPathAccepted,
  readWorkflow,
  loadWorkflows,
  type PullRequestPreview,
  type MergeRecord,
} from "@stintwork/core";

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

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
import { type ReviewEvidenceReader, readEvidenceChangedPaths } from "./review-evidence.js";
import {
  assertWorkflowUnchanged,
  saveGithubWorkflow,
  saveWorkItemWorkflow,
} from "./workflow-writes.js";
import { saveWorkItemReview } from "./review-writes.js";
import { createNodeRepoFiles } from "./repo-files.js";
import { resolveProjectSnapshot } from "./project-snapshot.js";
import { resolveGithubWorkflow } from "./github-snapshot.js";
import { validateGithubIdentities } from "./github-discovery.js";
import { requireCurrentGithubApproval } from "./github-gates.js";
import { githubRateLimitCoolingDown, readGithubTickets } from "./github-tickets.js";
import { githubGateIgnoresBody, githubGateIncludesTickets } from "./github-evidence-scope.js";
import type { GithubBriefSource } from "./brief-preview.js";

import {
  githubRepository,
  shipGit,
  createPullRequest,
  findPullRequest,
  fetchPullRequestChecks,
  fetchPullRequestChecksWithView,
  readPullRequestChecks,
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
  githubSource?: GithubBriefSource,
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
        return context.json(
          coreTextWire({ reason: coreText({ code: "server.originMismatch" }) }),
          403,
        );
      if (
        context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !==
        "application/json"
      )
        return context.json(coreTextWire({ reason: coreText({ code: "server.jsonShip" }) }), 400);
      let body: Record<string, unknown>;
      try {
        body = await context.req.json();
        if (!body || typeof body !== "object" || Array.isArray(body))
          return context.json(coreTextWire({ reason: coreText({ code: "server.jsonShip" }) }), 400);
      } catch {
        return context.json(
          coreTextWire({ reason: coreText({ code: "server.invalidJson" }) }),
          400,
        );
      }
      const slug = context.req.param("slug");
      if (/^github-\d+$/.test(slug) && githubSource?.getSnapshot().github?.errorCode === "identity")
        return context.json(
          coreTextWire({ reason: coreText({ code: "gate.identityAmbiguous" }) }),
          409,
        );
      if (
        !resolveProjectSnapshot(readProjectFiles(), githubSource?.getSnapshot).workItems.some(
          (item) => item.slug === slug,
        )
      )
        return context.json(
          coreTextWire({ reason: coreText({ code: "server.workItemNotFound" }) }),
          404,
        );
      if (action !== "pr-checks" && writing.has(slug))
        return context.json(coreTextWire({ reason: coreText({ code: "ship.activeWrite" }) }), 409);
      if (action !== "pr-checks") writing.add(slug);
      let merged: MergeRecord | undefined;
      function locate() {
        const project = readProjectFiles();
        const snapshot = resolveProjectSnapshot(project, githubSource?.getSnapshot);
        readReviewEvidence?.(project, snapshot);
        const item = snapshot.workItems.find((item) => item.slug === slug);
        if (!item) throw new LocalMergeRefusal({ code: "server.workItemNotFound" });
        if (
          snapshot.workflows[item.workflow].stages.find(({ id }) => id === item.stage)?.gate !==
            "merge" &&
          action !== "pr-checks"
        )
          throw new LocalMergeRefusal({ code: "ship.stageRequired" });
        if (
          item.activeStint ||
          item.stints.some(({ status }) => status === "running") ||
          isStintActive(slug)
        )
          throw new LocalMergeRefusal({ code: "ship.running" });
        if (isChecking(slug)) throw new LocalMergeRefusal({ code: "ship.checksActive" });
        const workflowPath = item.github
          ? `.stintwork/github/${item.github.repository.toLowerCase()}/${item.github.number}/workflow.yaml`
          : `.scratch/${slug}/workflow.yaml`;
        const failure = [...project.warnings, ...snapshot.warnings].find(
          ({ path, code }) =>
            code !== "github-workflow-divergence" &&
            (path === ".git" || path === workflowPath || path === `.scratch/${slug}/review.yaml`),
        );
        if (failure || item.reviewEvidenceError || !readReviewEvidence)
          throw new LocalMergeRefusal(
            failure?.message ?? item.reviewEvidenceError ?? { code: "ship.evidenceUnreadable" },
          );
        if (item.memoryProposals?.length)
          throw new LocalMergeRefusal({ code: "ship.memoryUndecided" });
        if (
          action !== "send-back" &&
          (item.riskyPaths === undefined ||
            item.riskyPaths.some((risk) => !riskyPathAccepted(risk, item.reviewDecisions)))
        )
          throw new LocalMergeRefusal({ code: "ship.riskyPaths" });
        if (action === "merge-local" && item.pullRequest)
          throw new LocalMergeRefusal({ code: "ship.usePr" });
        const mainFiles = createNodeRepoFiles(root);
        const mainText = mainFiles.read(workflowPath);
        if (item.github && mainText !== undefined) {
          const github = githubSource?.getGithub();
          const remote = github?.items.find((entry) => entry.number === item.github?.number);
          if (!github || !remote) throw new LocalMergeRefusal({ code: "gate.identityAmbiguous" });
          try {
            validateGithubIdentities(createMemoryRepoFiles({ [workflowPath]: mainText }), {
              ...github,
              complete: false,
              items: [remote],
            });
          } catch {
            throw new LocalMergeRefusal({ code: "gate.identityAmbiguous" });
          }
        }
        merged =
          item.merged ??
          readWorkflow(mainFiles, workflowPath, [], loadWorkflows(mainFiles))?.merged;
        return { project, item, workflows: snapshot.workflows, workflowPath };
      }
      try {
        let initial = locate();
        async function validateGithub() {
          initial = locate();
          const github = githubSource?.getGithub();
          const remote = github?.items.find(
            (entry) =>
              entry.id === initial.item.github?.issueId &&
              entry.number === initial.item.github.number,
          );
          if (initial.item.github) {
            if (
              !githubSource ||
              !github ||
              !remote ||
              !initial.item.github.bound ||
              (action !== "send-back" &&
                (!initial.item.github.complete ||
                  initial.item.github.ticketsStale ||
                  remote.detail?.stale ||
                  remote.detailFailed ||
                  github.discoveryFailed ||
                  githubRateLimitCoolingDown(github) ||
                  githubSource?.discoveryFailed())) ||
              githubSource?.getSnapshot().github?.errorCode === "identity"
            )
              throw new LocalMergeRefusal({ code: "gate.detailUnavailable" });
            const workflowText = resolveGithubWorkflow(
              initial.project,
              initial.workflowPath,
              initial.project.worktreePaths.get(slug),
            );
            if (!workflowText) throw new LocalMergeRefusal({ code: "gate.identityAmbiguous" });
            validateGithubIdentities(
              createMemoryRepoFiles({ [initial.workflowPath]: workflowText }),
              { ...github, complete: false, items: [remote] },
            );
            if (action === "merge-local" || action === "merge-pr")
              assertWorkflowUnchanged(root, initial.workflowPath);
            const stages = initial.workflows[initial.item.workflow].stages;
            const priorStages =
              action === "send-back"
                ? []
                : stages.slice(
                    0,
                    stages.findIndex((stage) => stage.id === initial.item.stage),
                  );
            const detail = priorStages.length
              ? readGithubTickets(
                  initial.project.worktreePaths.get(slug) ?? root,
                  github.repository,
                  remote.id,
                  remote.number,
                )
              : undefined;
            // Attach a handler immediately while identity is checked first for refusal ordering.
            void detail?.catch(() => {});
            let valid = false;
            try {
              valid = await githubSource.verifyIdentity(github);
            } catch {
              /* Fail closed. */
            }
            if (
              !valid ||
              (action !== "send-back" &&
                (githubSource.discoveryFailed() || githubRateLimitCoolingDown(github)))
            )
              throw new LocalMergeRefusal({ code: "gate.identityAmbiguous" });
            const labels = new Map(
              ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"].map(
                (role) => [role, role],
              ),
            );
            for (const line of (
              initial.project.files.read("docs/agents/triage-labels.md") ?? ""
            ).split(/\r?\n/)) {
              const match = /^\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`/.exec(line);
              if (match && labels.has(match[1])) labels.set(match[1], match[2]);
            }
            for (const stage of priorStages) {
              const approval = await requireCurrentGithubApproval(
                initial.project.worktreePaths.get(slug) ?? root,
                github.repository,
                remote.id,
                remote.number,
                githubGateIncludesTickets(stages, stage.id),
                [...labels.values()],
                initial.item.stages[stage.id],
                undefined,
                githubGateIgnoresBody(stages, stage.id),
                detail,
              );
              const projected = initial.item.stages[stage.id]?.approved;
              if (
                !approval.ok ||
                !projected ||
                typeof projected !== "object" ||
                !("remoteState" in projected) ||
                projected.remoteState !== "current"
              )
                throw new LocalMergeRefusal({ code: "gate.evidenceChanged" });
            }
          }
          return { github, remote };
        }
        async function verifyGithubWrite() {
          if (!initial.item.github) return;
          let valid = false;
          try {
            valid = !!github && !!(await githubSource?.verifyIdentity(github, true));
          } catch {
            /* Fail closed. */
          }
          if (!valid) throw new LocalMergeRefusal({ code: "gate.identityAmbiguous" });
        }
        let { github, remote: githubRemote } =
          action === "pr-checks"
            ? await validateGithub()
            : {
                github: githubSource?.getGithub(),
                remote: githubSource
                  ?.getGithub()
                  ?.items.find((entry) => entry.id === initial.item.github?.issueId),
              };
        const saveWorkflow = (
          directory: string,
          item: typeof initial.item,
          update: (text: string | undefined) => string,
          message: string,
        ) =>
          item.github && github && githubRemote
            ? saveGithubWorkflow(
                directory,
                github,
                githubRemote,
                item.workflow,
                item.stage ?? "ship",
                update,
                message,
                directory === root,
              )
            : saveWorkItemWorkflow(directory, slug, update, message);
        if (action === "pr-checks") {
          const { item } = locate();
          if (!item.pullRequest) throw new LocalMergeRefusal({ code: "ship.prMissing" });
          await fetchPullRequestChecks(root, item.pullRequest);
          const checks = readPullRequestChecks(root, item.pullRequest);
          refresh();
          return context.json(coreTextWire({ checks }));
        }
        if (["preview-pr", "open-pr", "preview-merge-pr", "merge-pr"].includes(action)) {
          return await withRepoLock(root, async () => {
            ({ github, remote: githubRemote } = await validateGithub());
            const { project, item, workflows } = locate();
            const worktree = project.worktreePaths.get(slug);
            if (!worktree && !merged)
              throw new LocalMergeRefusal({ code: "server.worktreeUnavailable" });
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
                  github: item.github,
                  headCommit: head,
                  evidenceChangedPaths: readEvidenceChangedPaths(worktree ?? root, head, [
                    approvedCommit,
                  ]),
                },
                approvedCommit,
              )
            )
              throw new LocalMergeRefusal({ code: "ship.reviewRequired" });
            if (
              worktree &&
              (await shipGit(worktree, ["status", "--porcelain", "--untracked-files=all"]))
            )
              throw new LocalMergeRefusal({ code: "ship.commitGitHub" });
            const repository = await githubRepository(root);
            if (action === "preview-pr" || action === "open-pr") {
              if (item.pullRequest) throw new LocalMergeRefusal({ code: "ship.prExists" });
              if (!worktree) throw new LocalMergeRefusal({ code: "ship.alreadyShipped" });
              const branch = await shipGit(checkout, ["symbolic-ref", "--short", "HEAD"]);
              const report = await dryRunLocalMerge(root, slug);
              const base = report.mainBranch;
              if (report.conflicts.length)
                throw new LocalMergeRefusal({ code: "ship.conflicts" }, report.conflicts);
              if (branch !== `stintwork/${slug}`)
                throw new LocalMergeRefusal({ code: "ship.checkoutsRequired" });
              const existing = await findPullRequest(checkout, repository.repo, branch);
              if (existing && existing.baseRefName !== base)
                throw new LocalMergeRefusal({ code: "ship.baseMismatch" });
              if (
                existing &&
                (existing.headRefOid !== head ||
                  existing.headRefName !== branch ||
                  existing.state !== "OPEN")
              )
                throw new LocalMergeRefusal({ code: "ship.existingPrMismatch" });
              const details = {
                repo: repository.repo,
                remote: repository.remote,
                remoteUrl: repository.remoteUrl,
                branch,
                base,
                headCommit: head,
                ...pullRequestText(item, workflows),
              };
              const parent =
                item.github?.repository.toLowerCase() === repository.repo.toLowerCase()
                  ? item.github.number
                  : undefined;
              if (parent) details.body += `\n\nCloses #${parent}`;
              if (
                (existing || parent) &&
                (typeof repository.defaultBranch !== "string" || !repository.defaultBranch)
              )
                throw new LocalMergeRefusal({ code: "ship.githubRepository" });
              const closure = { parentWillNotClose: !!parent && base !== repository.defaultBranch };
              const adoption = existing
                ? {
                    title: existing.title,
                    body: existing.body,
                    base: existing.baseRefName,
                    existingPrNumber: existing.number,
                    existingPrUrl: existing.url,
                    parentNumber: parent,
                  }
                : {};
              if (action === "preview-pr") {
                const preview = { ...details, ...closure, ...adoption, confirmation: randomUUID() };
                previews.set(slug, { preview, expires: Date.now() + 10 * 60_000 });
                return context.json(coreTextWire({ preview }));
              }
              const saved = previews.get(slug);
              const expected = saved
                ? { ...details, ...closure, ...adoption, confirmation: saved.preview.confirmation }
                : undefined;
              if (
                !saved ||
                saved.expires < Date.now() ||
                body.confirmation !== saved.preview.confirmation ||
                JSON.stringify(expected) !== JSON.stringify(saved.preview)
              )
                throw new LocalMergeRefusal({ code: "ship.confirmPush" });
              previews.delete(slug);
              if (!existing) {
                await verifyGithubWrite();
                await shipGit(checkout, [
                  "push",
                  "-u",
                  repository.remote,
                  `${head}:refs/heads/${branch}`,
                ]);
              }
              await shipGit(checkout, ["config", `branch.${branch}.remote`, repository.remote]);
              await shipGit(checkout, ["config", `branch.${branch}.merge`, `refs/heads/${branch}`]);
              await verifyGithubWrite();
              const opened = existing ?? (await createPullRequest(checkout, details));
              if (
                opened.headRefOid !== head ||
                opened.headRefName !== branch ||
                opened.baseRefName !== base ||
                opened.state !== "OPEN"
              )
                throw new LocalMergeRefusal({ code: "ship.createdPrMismatch" });
              const { title: _title, body: _body, ...identity } = details;
              const pullRequest = {
                ...identity,
                base: opened.baseRefName,
                number: opened.number,
                url: opened.url,
              };
              await saveWorkflow(
                checkout,
                item,
                (text) => workflowPullRequest(text, pullRequest, workflows, item.workflow),
                `Record pull request #${opened.number} for ${slug}`,
              );
              refresh();
              return context.json(coreTextWire({ pullRequest }));
            }
            let pr = item.pullRequest;
            if (!pr) throw new LocalMergeRefusal({ code: "ship.prMissing" });
            if (
              pr.repo !== repository.repo ||
              pr.remote !== repository.remote ||
              pr.remoteUrl !== repository.remoteUrl
            )
              throw new LocalMergeRefusal({ code: "ship.remoteChanged" });
            if (merged) {
              if (action === "preview-merge-pr")
                throw new LocalMergeRefusal({ code: "workItem.shipped" });
              await shipGit(root, ["merge-base", "--is-ancestor", merged.commit, "HEAD"]);
              await cleanupMergedWorkItem(
                root,
                slug,
                merged.commit,
                pr.headCommit,
                initial.workflowPath,
              );
              refresh();
              return context.json(coreTextWire({ merged }));
            }
            if (pr.base !== (await shipGit(root, ["symbolic-ref", "--short", "HEAD"])))
              throw new LocalMergeRefusal({ code: "ship.baseMismatch" });
            const methodRead = pullRequestMergeMethod(root, pr, repository);
            void methodRead.catch(() => {});
            const { checks, remote: checkedRemote } = await fetchPullRequestChecksWithView(
              root,
              pr,
            );
            if (!checks.checks.length || checks.checks.some((check) => check.bucket !== "pass"))
              throw new LocalMergeRefusal({ code: "ship.ciRequired" });
            if (
              checks.headCommit !== pr.headCommit ||
              evidenceStale(
                {
                  slug,
                  github: item.github,
                  headCommit: head,
                  evidenceChangedPaths: readEvidenceChangedPaths(checkout, head, [
                    checks.headCommit,
                  ]),
                },
                checks.headCommit,
              )
            )
              throw new LocalMergeRefusal({ code: "ship.headChanged" });
            let remote = checkedRemote;
            if (
              remote.headRefOid !== checks.headCommit ||
              remote.baseRefName !== pr.base ||
              remote.headRefName !== pr.branch
            )
              throw new LocalMergeRefusal({ code: "ship.prChanged" });
            if (remote.state === "OPEN") {
              const report = await dryRunLocalMerge(root, slug);
              if (report.conflicts.length)
                throw new LocalMergeRefusal({ code: "ship.conflicts" }, report.conflicts);
              const method = await methodRead;
              if (action === "preview-merge-pr")
                return context.json(coreTextWire({ mergeMethod: method }));
              if (body.mergeMethod !== undefined && body.mergeMethod !== method)
                throw new LocalMergeRefusal({ code: "ship.methodChanged" });
              const requested = { ...pr, mergeMethod: method };
              pr = requested;
              await verifyGithubWrite();
              await saveWorkflow(
                checkout,
                item,
                (text) => workflowPullRequest(text, requested, workflows, item.workflow),
                `Record merge method for pull request #${pr.number} for ${slug}`,
              );
              head = await shipGit(checkout, ["rev-parse", "HEAD"]);
              await verifyGithubWrite();
              await mergePullRequest(root, pr, checks.headCommit, method);
              remote = await viewPullRequest(root, pr, String(pr.number));
            }
            if (action === "preview-merge-pr")
              throw new LocalMergeRefusal({ code: "ship.prClosed" });
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
              throw new LocalMergeRefusal({ code: "ship.mergeQueued" });
            const localWorkflow = initial.workflowPath;
            for (const options of [[], ["--cached"]])
              if (await shipGit(root, ["diff", ...options, "--name-only", "--", localWorkflow]))
                throw new LocalMergeRefusal({ code: "ship.workflowUncommitted" });
            await updateMainAfterPullRequest(root, pr.remote, pr.base, remote.mergeCommit.oid);
            const record: MergeRecord = {
              at: remote.mergedAt,
              commit: remote.mergeCommit.oid,
              pr: String(pr.number),
              ...(pr.mergeMethod ? { method: pr.mergeMethod } : {}),
            };
            merged = record;
            await saveWorkflow(
              root,
              item,
              (text) =>
                workflowMerge(
                  workflowPullRequest(text, pr, workflows, item.workflow),
                  record,
                  workflows,
                  item.workflow,
                ),
              `Record merge of ${slug}`,
            );
            if ((await shipGit(checkout, ["rev-parse", "HEAD"])) !== head)
              throw new LocalMergeRefusal({ code: "ship.workItemChanged" });
            await cleanupMergedWorkItem(
              root,
              slug,
              merged.commit,
              pr.headCommit,
              initial.workflowPath,
            );
            refresh();
            return context.json(coreTextWire({ merged }));
          });
        }
        if (action !== "merge-local") ({ github, remote: githubRemote } = await validateGithub());
        else await verifyGithubWrite();
        if (action === "merge-local") {
          const { workflows, item } = locate();
          const commit = await mergeLocalWorkItem(
            root,
            slug,
            async (commit) => {
              merged = { at: new Date().toISOString(), commit };
              await saveWorkflow(
                root,
                item,
                (text) => workflowMerge(text, merged as MergeRecord, workflows, item.workflow),
                `Record merge of ${slug}`,
              );
            },
            async () => {
              await validateGithub();
              await verifyGithubWrite();
              return merged?.commit;
            },
          );
          refresh();
          return context.json(coreTextWire({ merged, commit }));
        }
        return await withRepoLock(root, async () => {
          const { project, item, workflows } = locate();
          if (item.merged) throw new LocalMergeRefusal({ code: "workItem.shipped" });
          const report = await dryRunLocalMerge(root, slug);
          if (!report.conflicts.length) throw new LocalMergeRefusal({ code: "ship.noConflicts" });
          const implementation = workflows[item.workflow].stages.find(
            (stage) => stage.column === "implement",
          );
          const worktree = project.worktreePaths.get(slug);
          if (!worktree || !implementation)
            throw new LocalMergeRefusal({ code: "ship.implementationUnavailable" });
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
          await verifyGithubWrite();
          const commit = await saveWorkItemReview(worktree, slug, [], undefined, {
            workflow: workflowGate(
              item.github
                ? resolveGithubWorkflow(project, initial.workflowPath, worktree)
                : project.files.read(initial.workflowPath),
              item,
              implementation.id,
              "reopen",
              record,
              workflows,
            ),
            workflowPath: initial.workflowPath,
            note: {
              id: `review:${randomUUID()}`,
              at,
              source: "review",
              text: `## Merge conflicts\n\nResolve conflicts with ${report.mainBranch} before shipping:\n${report.conflicts.map((path) => `- ${path}`).join("\n")}`,
            },
          });
          refresh();
          return context.json(
            coreTextWire({ stage: implementation.id, stageName: implementation.name, commit }),
          );
        });
      } catch (error) {
        refresh();
        return context.json(
          coreTextWire({
            reason: errorText(error),
            ...(error instanceof LocalMergeRefusal
              ? { conflicts: error.conflicts, paths: error.paths }
              : {}),
          }),
          409,
        );
      } finally {
        if (action !== "pr-checks") writing.delete(slug);
      }
    });
  }
}
