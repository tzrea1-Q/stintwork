// SPDX-License-Identifier: Apache-2.0
function template<const Shape extends Record<string, "string" | readonly string[]>>(
  shape: Shape,
  render: (
    params: {
      [Key in keyof Shape]: Shape[Key] extends readonly string[] ? Shape[Key][number] : string;
    },
  ) => string,
) {
  return Object.assign(render, { shape });
}
export const coreTextEnglish = {
  "recovery.legacy": "Missing recovery metadata (legacy or incomplete stint log).",
  "recovery.grok":
    "Grok Build is experimental; restart recovery uses a checkpoint and a new stint.",
  "recovery.ownershipMetadata":
    "Missing process ownership metadata in the recorded attempt; restart recovery uses a checkpoint and a new stint.",
  "recovery.blocked": template({ detail: "string" }, ({ detail }) => detail),
  "agent.cliChanged": "Agent CLI changed during inspection. Retry preparation.",
  "recovery.antigravity":
    "Antigravity CLI is experimental; restart recovery uses a checkpoint and a new stint.",
  "agent.antigravityLogin":
    "Antigravity CLI requires authentication. Run agy once and sign in yourself, then start another stint.",
  "agent.antigravityMissing":
    "Antigravity CLI not found. Install it, run agy once and sign in yourself.",
  "agent.antigravityVersionTimeout":
    "Antigravity CLI version check timed out after 5 seconds. Refresh agent availability to retry.",
  "agent.antigravityVersion": template(
    { reason: "string" },
    ({ reason }) =>
      `Antigravity CLI version is unavailable or incompatible (${({ missing: "version missing", unparseable: "version unparseable", "below-tested-range": "below tested range", incompatible: "incompatible major version" } as Record<string, string>)[reason] ?? reason}); install a stable version from 1.5.3 up to 2.0.0.`,
  ),
  "agent.grokMissing": "Grok Build not found. Install Grok Build and sign in with grok login.",
  "agent.source.installed": "Agent source: Installed",
  "agent.source.bundled": "Agent source: Bundled",
  "agent.reason.compatible": "Installed CLI is within the tested range; confirmed at stint start.",
  "agent.reason.missing":
    "A compatible installed CLI could not be verified. Use the pinned bundled agent with your existing login.",
  "agent.reason.below-tested-range":
    "Installed CLI is below the tested range. Use the pinned bundled agent.",
  "agent.reason.unparseable": "Installed CLI version is unverified. Use the pinned bundled agent.",
  "agent.reason.incompatible": "Installed CLI is incompatible. Use the pinned bundled agent.",
  "agent.reason.handshake failed":
    "Installed CLI handshake failed. Use the pinned bundled agent for this stint.",
  "agent.reason.unverified":
    "Source is provisional until stint start checks the installed CLI version.",
  "agent.reason.native": "Uses your separately installed agent CLI and login.",
  "agent.preparation.selected": "Selected executable source",
  "agent.preparation.confirm": "Review Agent source before preparation",
  "agent.preparation.waiting": "Waiting for the selected adapter cache",
  "agent.preparation.installing": "Downloading the selected pinned adapter and dependencies",
  "agent.preparation.verifying": "Verifying the selected adapter",
  "agent.preparation.smoke": "Checking executable startup",
  "agent.preparation.ready": "Packages prepared; checking stint readiness",
  "agent.preparationCancelled": "Agent preparation cancelled. You can retry.",
  "agent.downloadSizeUnavailable":
    "Released download size is missing or stale. Ask the maintainer for matching agent profiles, then retry.",
  "agent.executableDetails": template(
    { path: "string", version: "string", adapter: "string" },
    ({ path, version, adapter }) =>
      `Executable: ${path} · Version: ${version}${adapter ? ` · Adapter: ${adapter}` : ""}`,
  ),

  "creation.invalidSlug":
    "Folder name must use lowercase English letters, digits and single hyphens, with at most 48 characters.",
  "creation.exists": template(
    { slug: "string" },
    ({ slug }) => `Work item ${slug} already exists.`,
  ),
  "creation.existsInGit": template(
    { slug: "string" },
    ({ slug }) => `Work item ${slug} already exists in Git.`,
  ),
  "creation.scratchDirectory": ".scratch must be a real directory.",
  "creation.githubTracker":
    "GitHub work items are issues created through agent skills, such as to-spec.",
  "creation.commitPaths": "Commit or discard hand edits to the creation paths first.",
  "creation.roadmapEdits": "Commit or discard hand edits to roadmap.md first.",
  "workItem.shipped": "This work item is shipped.",
  "gate.noApproval": "This stage has no approval gate.",
  "gate.running": "A stint is running on this work item. Finish or stop it before approving.",
  "gate.ticketsUnresolved": "Every ticket must be resolved before approving.",
  "gate.stintUnfinished": "The stage stint must finish before approving.",
  "gate.reviewRestart": "Start a new Review stint after reopening or entering Review.",
  "gate.handoffMissing": "The finished stage stint needs a handoff before approving.",
  "gate.manualApproval": "Developer approval; no file output required",
  "gate.approve": "Review the stage and approve when satisfied.",
  "gate.specOutput": "spec.md exists and parses",
  "gate.githubSpecOutput": "The GitHub parent issue body is not empty",
  "gate.githubSpecRequired":
    "The GitHub parent issue body is empty. Edit it on GitHub, then refresh GitHub evidence.",
  "gate.writeSpec": template(
    { path: "string", warning: "string" },
    ({ path, warning }) =>
      `Write or edit ${path} with a nonempty # heading.${warning ? ` ${warning}` : ""}`,
  ),
  "gate.ticketsOutput": "At least one ticket, no ticket warnings, valid dependency order",
  "gate.githubTicketsOutput": "At least one ticket with known status and no unresolved blockers",
  "gate.githubTicketsRequired":
    "Add a direct ticket and resolve any unknown statuses or blockers before approving.",
  "gate.writeTickets": template(
    { path: "string", warning: "string" },
    ({ path, warning }) =>
      `Write or fix ${path} tickets with Status and Blocked by lines and valid dependencies.${warning ? ` ${warning}` : ""}`,
  ),
  "gate.reviewFinished": "Latest Review stint finished",
  "gate.recordFindings": "Start a new Review stint to record findings, or explicit no findings.",
  "gate.findingsDecided": "Every finding resolved or accepted",
  "gate.decideFindings":
    "Resolve or accept each current finding; sent-back findings need a new Review stint.",
  "gate.checksPassing": "Every configured check passing",
  "gate.runChecks": "Run all configured checks and fix failures before checking again.",
  "gate.evidenceFresh": "No stale evidence",
  "gate.refreshEvidence": "Start a new Review stint and rerun checks on the current head.",
  "gate.memoryDecided": "No open memory proposals",
  "gate.decideMemory": "Accept or reject every open memory proposal in Needs you.",
  "gate.riskyPathsHandled": "No risky files on the branch",
  "gate.handleRiskyPaths":
    "Remove risky files in a follow-up commit and add them to .gitignore, or explicitly Accept each path with a reason in Review. If secrets were real, rotate them and clean Git history before publishing.",
  "brief.noStage": "This work item has no stint stage.",
  "brief.conventions": "Project conventions and agent instructions",
  "brief.vocabulary": "Project vocabulary; use its terms in code and UI copy",
  "brief.scope": "Work item scope and acceptance criteria",
  "brief.ticketScope": "This ticket's scope, status, blockers and comments",
  "brief.reviewScope": "Review against this ticket's scope and acceptance criteria",
  "brief.decision": template({ title: "string" }, ({ title }) => `Decision record: ${title}`),
  "brief.noSkill": "This stage has no stint skill.",
  "brief.ticketResolved": "This ticket is resolved.",
  "brief.ticketCancelled": "This ticket is cancelled.",
  "brief.ticketUnknown": "This ticket has an unknown state.",
  "brief.blockedBy": template(
    { tickets: "string" },
    ({ tickets }) => `Blocked by ticket ${tickets}.`,
  ),
  "permission.codexSandbox":
    "Codex’s sandbox can execute commands without asking. Stintwork only controls requests Codex sends; commands and access outside the worktree may not produce a request.",
  "permission.unsupportedMode": template(
    { agent: "string", mode: "string" },
    ({ agent, mode }) =>
      `${agent} does not offer the required ${mode} mode; it cannot honour this permission level.`,
  ),
  "permission.alwaysApprove": template(
    { agent: "string" },
    ({ agent }) =>
      `${agent} has an always-approve config and never asks. Stintwork can only answer requests the agent sends and cannot enforce the worktree boundary.`,
  ),
  "permission.grokAlwaysApprove":
    'Grok Build has permission_mode = "always-approve" in its config. Grok won’t ask for permissions, regardless of the stint’s permission level. Stintwork never changes this config.',
  "permission.grokConfigUnreadable":
    "Could not read Grok Build’s permission config. Its permission behaviour is unknown.",
  "agent.internalError": "Internal error",
  "agent.internalErrorDetail": template(
    { detail: "string" },
    ({ detail }): string => `${coreTextEnglish["agent.internalError"]}${detail}`,
  ),
  "agent.notRegistered": template(
    { agent: "string" },
    ({ agent }) => `Agent is not registered: ${agent}.`,
  ),
  "agent.loginRequired": template(
    { agent: "string", command: "string" },
    ({ agent, command }) =>
      `${agent} authentication required. Sign in with ${command}, then start another stint.`,
  ),
  "agent.unavailable": template(
    { agent: "string", command: "string" },
    ({ agent, command }) => `${agent} is unavailable. ${command}`,
  ),
  "stream.wroteWorkflow": template(
    { agent: "string" },
    ({ agent }) => `Wrote workflow.yaml with the workflow, stage and ${agent} for this stage.\n`,
  ),
  "stream.installDependencies": template(
    { manager: "string", connection: ["offline", "online"] },
    ({ manager, connection }) =>
      `Installing worktree dependencies with ${manager} (${connection}).\n`,
  ),
  "server.jsonShip": "A JSON Ship action is required.",
  "server.diffFailed": template(
    { detail: "string" },
    ({ detail }) => `Could not read the work item diff: ${detail}`,
  ),
  "server.reviewDiffFailed": template(
    { detail: "string" },
    ({ detail }) => `Could not prepare the Review diff: ${detail}`,
  ),
  "server.checkpointCompareFailed": template(
    { detail: "string" },
    ({ detail }) => `Could not compare the last checkpoint: ${detail}`,
  ),
  "server.recoveryFailed": template(
    { detail: "string" },
    ({ detail }) => `Stint recovery failed: ${detail}`,
  ),
  "server.jsonAgent": "A JSON agent choice is required.",
  "server.jsonFinding": "A JSON finding action is required.",
  "server.jsonGate": "A JSON gate action is required.",
  "server.jsonHandoff": "A JSON handoff answer is required.",
  "server.jsonMemory": "A JSON memory proposal decision is required.",
  "server.jsonPermission": "A JSON permission answer is required.",
  "server.jsonPermissionLevel": "A JSON permission level is required.",
  "server.jsonRoadmap": "A JSON roadmap action is required.",
  "server.jsonSetup": "A JSON setup selection is required.",
  "server.jsonStart": "A JSON start request is required.",
  "server.jsonWorkItem": "A JSON work item creation is required.",
  "server.jsonWorkflow": "A JSON workflow action is required.",
  "stint.alreadyActive": "A stint is already active for this work item.",
  "ship.running": "A stint is running on this work item. Finish or stop it before shipping.",
  "memory.activeWrite": "A stint or review write is active for this work item.",
  "agent.activeWrite": "A stint or workflow write is already active for this work item.",
  "review.activeWrite": "A stint, check or review write is active for this work item.",
  "github.labelledChildExcluded": template(
    { issue: "string" },
    ({ issue }) => `Issue #${issue}: labelled child excluded.`,
  ),
  "github.childrenExcluded": template(
    { issue: "string" },
    ({ issue }) => `Issue #${issue}: cross-repository or nested children excluded.`,
  ),
  "github.relationshipCap": template(
    { issue: "string" },
    ({ issue }) => `Issue #${issue}: relationship safety cap reached.`,
  ),
  "github.relationshipIncomplete": template(
    { issue: "string" },
    ({ issue }) => `Issue #${issue}: relationship unavailable or incomplete.`,
  ),
  "gate.identityAmbiguous":
    "The GitHub account or repository no longer matches Stintwork's records. Check which account gh is signed in to and whether the repository was renamed or transferred, then refresh GitHub evidence.",
  "gate.detailUnavailable": "Complete GitHub evidence is unavailable.",
  "gate.evidenceChanged": "GitHub evidence changed since review.",
  "gate.headChanged": "The worktree HEAD changed since review.",
  "gate.activeWrite": "A stint, check or workflow write is active for this work item.",
  "ship.activeWrite": "A workflow or review write is active for this work item.",
  "ship.memoryUndecided": "Accept or reject every open memory proposal before shipping.",
  "ship.existingPrMismatch":
    "An existing pull request does not match the confirmed branch and head. Worktree retained; reconcile it before retrying.",
  "ship.reviewRequired":
    "Approve the Review gate on current evidence before shipping through GitHub.",
  "ship.checksActive": "Cancel or finish checks before shipping.",
  "stint.checksActive": "Cancel or finish checks before starting a stint.",
  "server.branchesUnavailable": "Cannot discover work item branches.",
  "permission.chooseLevel": "Choose Ask, Edit freely or Autonomous.",
  "workflow.chooseBuiltIn": "Choose a built-in workflow to customise.",
  "review.chooseFinding":
    "Choose a finding id and open, resolved or accepted status; acceptance needs a reason.",
  "memory.chooseDecision": "Choose a proposal id and accepted or rejected status.",
  "agent.chooseRegistered": "Choose a registered agent.",
  "review.chooseRisk": "Choose a risky path and its blob; acceptance needs a reason.",
  "stint.chooseStart":
    "Choose a work item, an optional positive ticket number and a registered agent.",
  "permission.chooseOption": "Choose an offered permission option.",
  "agent.claudeLoginCheckFailed":
    "Claude Code login check failed. Check claude auth status, then refresh agent availability.",
  "agent.claudeInvalidLogin":
    "Claude Code returned an invalid login status. Check claude auth status, then refresh agent availability.",
  "ship.commitLocal": "Commit worktree changes before merging locally.",
  "ship.commitGitHub": "Commit worktree changes before shipping through GitHub.",
  "setup.confirmFiles": "Confirm a selection of proposed setup files.",
  "ship.ciRequired":
    "Every pull request CI check must pass before merging; missing, pending, skipped and cancelled checks do not pass.",
  "ship.confirmPush":
    "Explicit push confirmation for this exact preview is required. Preview again if the head or remote changed.",
  "checks.activeStint": "Finish the active stint or workflow write before checking a commit.",
  "ship.pendingGitOperation": "Finish the main checkout's pending Git operation before merging.",
  "ship.mergeQueued":
    "GitHub has not completed the merge (it may be queued). Worktree and branch retained; retry after it merges.",
  "server.invalidJson": "Invalid JSON.",
  "ship.conflicts": "Merge conflicts with the main branch. Send back to resolve them.",
  "ship.stageRequired": "Merge locally requires the Ship stage.",
  "ship.mainBranchRequired": "Merge locally requires the main checkout on its main branch.",
  "checks.notActive": "No active checks for this work item.",
  "ship.riskyPaths":
    "No risky files on the branch: remove them in a follow-up commit and add them to .gitignore, or Accept each path with a reason in Review.",
  "gate.reopenEarlier": "Only an approved earlier stage can be reopened.",
  "memory.notFound": "Open memory proposal not found.",
  "server.originMismatch": "Origin must match the project server.",
  "permission.undecided": "Permission could not be decided.",
  "review.validFilesRequired": "Review and workflow files must be valid before changing findings.",
  "review.sendBackStages": "Send back requires Review and an implementation stage.",
  "ship.checkoutsRequired": "Shipping requires the work item branch and the main checkout.",
  "server.stageNotFound": "Stage not found.",
  "server.stintNotFound": "Stint not found.",
  "ship.remoteChanged": "The GitHub remote changed since the pull request was opened.",
  "ship.headChanged":
    "The PR head differs from the confirmed, reviewed work. Send back and review again.",
  "ship.workflowUncommitted":
    "The PR is merged remotely, but main has uncommitted workflow changes. Worktree and branch retained.",
  "ship.branchesChanged": "The branches changed during the merge. Try again.",
  "ship.createdPrMismatch":
    "The created pull request does not match the confirmed head and branches. Worktree retained.",
  "ship.implementationUnavailable": "The implementation worktree is unavailable.",
  "ship.mainUncommitted": "The main checkout has uncommitted changes to files this merge touches.",
  "ship.methodChanged": "The merge method changed since confirmation. Preview and confirm again.",
  "server.stopping": "The project server is stopping.",
  "ship.baseMismatch":
    "The pull request base must match the main checkout's branch. Retarget or close the pull request before retrying.",
  "ship.prChanged": "The pull request changed after reading CI. Refresh again.",
  "ship.mainDiverged":
    "The pull request is merged remotely, but local main has diverged. Worktree and branch retained; reconcile main and retry.",
  "ship.prClosed": "The pull request is no longer open. Refresh again.",
  "review.riskyPathChanged":
    "The risky path changed or is no longer on the branch. Refresh Review.",
  "stint.stageChanged": "The stage changed. Refresh the brief before starting a stint.",
  "ship.unpublishedChanges":
    "The work item branch contains unpublished changes; worktree and branch retained.",
  "ship.workItemChanged":
    "The work item changed during the remote merge. Merge recorded; worktree and branch retained.",
  "server.worktreeUnavailable": "The work item's worktree is unavailable.",
  "ship.noConflicts": "There are no merge conflicts to send back.",
  "handoff.alreadyAnswered": "This handoff was already answered.",
  "memory.alreadyDecided": "This memory proposal was already decided.",
  "permission.answering": "This permission request is already being answered.",
  "handoff.noneUnresolved": "This stint has no unresolved handoff.",
  "stint.notRunning": "This stint is no longer running.",
  "ship.prExists": "This work item already has a pull request.",
  "ship.prMissing": "This work item has no pull request.",
  "checks.worktreeMissing": "This work item has no worktree to check.",
  "review.worktreeMissing": "This work item has no worktree to review.",
  "ship.alreadyShipped": "This work item is already shipped.",
  "server.ticketNotFound": "Ticket not found.",
  "ship.usePr": "Use Merge pull request and passing CI for this work item's pull request.",
  "server.workItemNotFound": "Work item not found.",
  "handoff.writeNote": "Write a developer note, or use null to dismiss.",
  "memory.validReviewRequired": "review.yaml must be valid before recording a decision.",
  "gate.validWorkflowRequired": "workflow.yaml must be valid before changing a gate.",
  "agent.validWorkflowRequired": "workflow.yaml must be valid before choosing an agent.",
  "review.findingNotFound": "Finding not found.",
  "review.noOpenFindings": "There are no open findings to send back.",
  "review.riskyPathsUnreadable": "Cannot inspect risky paths.",
  "gate.notCurrentStage": "This is not the current stage.",
  "ship.evidenceUnreadable": "Cannot read Ship evidence.",
  "permission.stintEnded": "This permission request's stint has ended.",
  "permission.notPending": "This permission request is no longer pending.",
  "permission.attemptRequired": "Include the current attemptId to answer this permission request.",
  "permission.alreadyAnswered": "This permission request was already answered.",
  "agent.authenticationRequired": "Authentication required",
  "agent.codexTimeout": "Codex availability check timed out. Refresh agent availability.",
  "agent.codexMissing":
    "Codex not found. Install Codex and sign in with codex login. Stintwork prepares @agentclientprotocol/codex-acp@2.1.1.",
  "agent.claudeMissing":
    "Claude Code not found. Install Claude Code and sign in with claude auth login. Stintwork prepares @agentclientprotocol/claude-agent-acp@0.88.0.",
  "stint.reviewEndedEarly": "The Review stint ended before findings were collected.",
  "stint.findingsIncomplete": "The findings request did not complete.",
  "stint.handoffTimeout": "Handoff timed out.",
  "stint.stopReason": template(
    { reason: "string" },
    ({ reason }) => `Agent ended the stint with stop reason: ${reason}.`,
  ),
  "stint.receiptTimeout": "Receipt timed out.",
  "stream.offlineUnavailable": "Offline dependency install unavailable; trying online.\n",
  "stream.dependenciesReady": "Worktree dependencies are ready.\n",
  "workItem.titleSingleLine": "Title must be nonempty, single-line text.",
  "workItem.titleSlug": "Title must produce a valid ASCII work item slug.",
  "workItem.creationRequired": "A work item creation is required.",
  "workItem.titleRequired": "A title is required.",
  "workItem.workflowLoaded": "Choose a loaded workflow.",
  "workItem.firstStage": "The workflow needs a first stage.",
  "workItem.intentText": "Intent must be text.",
  "workItem.milestoneChoice": "Choose a milestone or no milestone.",
  "roadmap.nameSingleLine": "Milestone name must be nonempty, single-line text.",
  "roadmap.slugSingleLine": "Work item slug must be nonempty, single-line text.",
  "roadmap.fixWarnings": "Fix roadmap warnings before editing it.",
  "roadmap.handwrittenText": "Removing milestones would discard hand-written text.",
  "roadmap.invalidEdit": "The edited roadmap is invalid.",
  "roadmap.actionRequired": "A roadmap action is required.",
  "roadmap.milestoneMissing": "Milestone not found.",
  "roadmap.statusOrDate": "Choose a status or target date.",
  "roadmap.statusChoice": "Choose planned, active or shipped.",
  "roadmap.targetDate": "Target must be a valid YYYY-MM-DD date or null.",
  "roadmap.reorder": "Provide every milestone id exactly once.",
  "roadmap.unknownAction": "Unknown roadmap action.",
  "roadmap.regularFile": "roadmap.md must be a regular file.",
  "roadmap.commitHandEdits":
    "Commit or discard hand edits to roadmap.md before changing the roadmap.",
  "roadmap.worktreesUnreadable": "Cannot discover work item worktrees.",
  "roadmap.declaredMilestone":
    "This work item's workflow.yaml declares its milestone. Remove that declaration before moving it from the roadmap.",
  "gate.noCurrentApproval": "This stage has no current approval gate.",
  "checks.alreadyActive": "Checks are already active for this work item.",
  "checks.worktreeBranch": "The worktree is not on the work item branch.",
  "checks.commitChanges": "Commit worktree changes before checking a commit.",
  "checks.noneConfigured": "No checks are configured for this project.",
  "checks.worktreeChanged":
    "The worktree changed during checks; commit the changes and check again.",
  "checks.logDirectories": "Check log directories must be real directories.",
  "review.decisionRequired": "A review decision is required.",
  "setup.distinctFiles": "Select distinct proposed setup files.",
  "ship.validWorkflowPr": "A valid Ship workflow is required before recording a pull request.",
  "ship.validWorkflowMerge": "A valid Ship workflow is required before recording a merge.",
  "ship.pushUrl": "Shipping requires one push URL for the origin remote.",
  "ship.credentialFree": "Use a credential-free remote URL and the developer's own gh login.",
  "ship.sameRemoteUrl": "Shipping requires the same fetch and push URL for origin.",
  "ship.githubRepository":
    "The origin remote must resolve to a GitHub repository through gh repo view.",
  "ship.mergeMethods": "The repository has no allowed pull request merge method.",
  "ship.linearHistoryRule": "Cannot read the base branch's required linear history rule.",
  "ship.prIdentity": "Cannot read the pull request identity and head commit.",
  "ship.ciUnreadable": "Cannot read pull request CI checks.",
  "ship.changedCi": "The pull request changed while reading CI checks. Refresh again.",
  "ship.ciDirectories": "CI evidence directories must be real directories.",
  "ship.recordedCiInvalid": "Invalid recorded pull request CI evidence.",
  "workflow.regularFile": "workflow.yaml must be a regular file.",
  "workflow.resolveIndexConflict": "Resolve workflow.yaml's index conflict before changing it.",
  "workflow.dirtyFile": "Commit or discard changes to workflow.yaml before changing it.",
  "workflow.commitIgnored":
    "workflow.yaml could not be committed. Check whether it is ignored by Git.",
  "workflow.invalidId": "Invalid workflow id.",
  "server.workItemDirectories": "Work item directories must be real directories.",
  "server.localDirectories": "Local data directories must be real directories.",
  "server.localIgnoreRegular": "The local .gitignore must be a regular file.",
  "server.projectDirectory": ".stintwork must be a real directory.",
  "server.configRegular": ".stintwork/config must be a regular file.",
  "stint.logDirectories": "Stint log directories must be real directories.",
  "stint.invalidLog": "The stint log has invalid entries.",
  "agent.absolutePaths": "Agent file paths must be absolute.",
  "agent.pathOutside": "Agent file path is outside the worktree and its additional directories.",
  "agent.stintEnded": "The stint has ended.",
  "agent.permissionOption": "Permission decision must select an offered option.",
  "agent.permissionCancelled": "Permission request was cancelled.",
  "agent.permissionForwardingEnded": "The stint ended before the permission was forwarded.",
  "agent.stintCancelled": "Stint cancelled.",
  "git.invalidCommit": "Invalid commit.",
  "git.invalidSlug": "Invalid work item slug.",
  "git.invalidBase": "Invalid base commit.",
  "git.worktreeMissing": "The work item's worktree is missing or is on a different branch.",
  "git.worktreeSymlink": "Worktree directory must not be a symlink.",
  "git.reviewFiles": "Review and project memory paths must be regular files in real directories.",
  "git.worktreeBranch": "The worktree is not on the work item's branch.",
  "git.memoryPath": "Invalid project memory path.",
  "git.decideChanges": "Commit or discard changes to the review or proposed file before deciding.",
  "git.baseRegular": "The base project memory file must be regular.",
  "git.invalidCheckpoint": "Invalid checkpoint commit.",
  "git.invalidSetupFile": "Invalid Stintwork setup file.",
  "git.riskyMetadata": "Cannot read risky path metadata.",
  "git.riskySize": "Cannot read risky path size.",
} as const;

export type CoreTextMessage = {
  [Code in keyof typeof coreTextEnglish]: (typeof coreTextEnglish)[Code] extends (
    params: infer Params,
  ) => string
    ? { code: Code; params: Params }
    : { code: Code };
}[keyof typeof coreTextEnglish];

export type CoreText = { text: string } & (CoreTextMessage | { code?: undefined });

export function coreText(message: CoreTextMessage): CoreText {
  const entry = coreTextEnglish[message.code];
  const text =
    typeof entry === "string"
      ? entry
      : Reflect.apply(entry, undefined, ["params" in message ? message.params : undefined]);
  return { text, ...message };
}

export function isCoreTextMessage(value: unknown): value is CoreTextMessage {
  if (
    !value ||
    typeof value !== "object" ||
    !("code" in value) ||
    typeof value.code !== "string" ||
    !Object.hasOwn(coreTextEnglish, value.code)
  )
    return false;
  const entry = coreTextEnglish[value.code as CoreTextMessage["code"]];
  if (typeof entry === "string") return true;
  if (
    !("params" in value) ||
    !value.params ||
    typeof value.params !== "object" ||
    Array.isArray(value.params)
  )
    return false;
  return Object.entries(entry.shape).every(([key, type]) => {
    if (!Object.hasOwn(value.params as object, key)) return false;
    const parameter = (value.params as Record<string, unknown>)[key];
    return (
      typeof parameter === "string" &&
      (type === "string" || type.some((allowed) => allowed === parameter))
    );
  });
}

export class CoreTextError extends Error {
  readonly coreText: CoreText;
  constructor(message: CoreTextMessage | CoreText | string, options?: ErrorOptions) {
    const text =
      typeof message === "string"
        ? { text: message }
        : "text" in message
          ? message
          : coreText(message);
    super(text.text, options);
    this.coreText = text;
  }
}

export function errorText(error: unknown, stringify = false): CoreText {
  if (error instanceof Error && "coreText" in error && isCoreTextMessage(error.coreText))
    return { ...coreText(error.coreText), text: stringify ? String(error) : error.message };
  return { text: !stringify && error instanceof Error ? error.message : String(error) };
}

export function coreTextFields<Field extends string>(
  field: Field,
  value: CoreText,
): Record<Field, string> &
  Partial<Record<Field extends "text" ? "message" : `${Field}Message`, CoreTextMessage>>;
export function coreTextFields(field: string, value: CoreText | null): Record<string, unknown>;
export function coreTextFields(field: string, value: CoreText | null) {
  if (!value) return { [field]: null };
  const { text, ...message } = value;
  return {
    [field]: text,
    ...(value.code ? { [field === "text" ? "message" : `${field}Message`]: message } : {}),
  };
}

export function coreTextWire(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(coreTextWire);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      if (
        ["reason", "label", "action", "error", "handoffError"].includes(key) &&
        entry &&
        typeof entry === "object" &&
        "text" in entry &&
        typeof entry.text === "string"
      )
        return Object.entries(coreTextFields(key, entry as CoreText));
      if (
        key === "warnings" &&
        Array.isArray(entry) &&
        entry.every(
          (warning) => warning && typeof warning === "object" && typeof warning.text === "string",
        )
      )
        return [
          [key, entry.map((warning) => warning.text)],
          [
            "warningMessages",
            entry.map(({ text: _text, ...message }) => (message.code ? message : null)),
          ],
        ];
      return [[key, coreTextWire(entry)]];
    }),
  );
}

export function readCoreTextWire(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(readCoreTextWire);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record)
      .filter(
        ([key]) =>
          !["reasonMessage", "labelMessage", "actionMessage", "warningMessages"].includes(key),
      )
      .map(([key, entry]) => {
        if (
          ["reason", "label", "action"].includes(key) &&
          typeof entry === "string" &&
          (Object.hasOwn(record, `${key}Message`) ||
            "available" in record ||
            ("path" in record && !("status" in record)))
        ) {
          const message = record[`${key}Message`];
          return [key, { text: entry, ...(isCoreTextMessage(message) ? message : {}) }];
        }
        if (
          key === "warnings" &&
          Array.isArray(entry) &&
          entry.every((warning) => typeof warning === "string")
        ) {
          const messages = record.warningMessages;
          return [
            key,
            entry.map((text, index) => ({
              text,
              ...(Array.isArray(messages) && isCoreTextMessage(messages[index])
                ? messages[index]
                : {}),
            })),
          ];
        }
        return [key, readCoreTextWire(entry)];
      }),
  );
}
