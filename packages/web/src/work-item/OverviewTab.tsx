// SPDX-License-Identifier: Apache-2.0
import { CheckCircle2, FolderGit2, GitBranch, GitPullRequest, LayoutGrid } from "lucide-react";
import { MotionGlobalConfig } from "motion/react";
import { startTransition, useEffect, useState } from "react";
import { GateView } from "../GateView";
import { stageName } from "../i18n/workflow-names";
import { ShipActions } from "../ShipActions";
import { StageAgentRail } from "../StageAgentRail";
import { StintStream } from "../StintStream";
import { StopStint } from "../StopStint";
import { Badge } from "../ui/Badge";
import { PropertyList, PropertyRow } from "../ui/PropertyRow";
import { TabsContent } from "../ui/Tabs";

import { FilePath } from "./FilePath";
import type { DrawerState } from "./useDrawerState";
export function OverviewTab({ state }: { state: DrawerState }) {
  const {
    item,
    warnings,
    workflows,
    githubReadOnly,
    gateAction,
    t,
    setShipPaused,
    activeProfile,
    workflow,
    stage,
  } = state;
  const [details, setDetails] = useState(MotionGlobalConfig.skipAnimations);
  useEffect(() => {
    if (details) return;
    const frame = requestAnimationFrame(() => startTransition(() => setDetails(true)));
    return () => cancelAnimationFrame(frame);
  }, [details]);
  return (
    <TabsContent
      value="overview"
      className="drawer-content relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-4 pb-4 sm:px-7 [&_section+section]:mt-5 [&_.drawer-section-heading]:text-sm [&_.drawer-section-heading]:font-medium"
    >
      <div className="mx-auto w-full max-w-4xl">
        {details && item.activeStint && (
          <section aria-labelledby="drawer-live-stint-title">
            <h3
              id="drawer-live-stint-title"
              className="drawer-section-heading mb-3 flex items-center gap-2 text-base font-semibold"
            >
              {t.stints.liveStint}
            </h3>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <p role="status">
                {activeProfile?.displayName ?? item.activeStint.agent}
                {item.activeStint.ticket !== null && (
                  <> · {t.stints.briefTicket(item.activeStint.ticket, !!item.github)}</>
                )}{" "}
                · <Badge variant="accent">{t.stints.statuses[item.activeStint.status]}</Badge>
              </p>
              <StopStint
                key={`stop:${item.activeStint.id}`}
                stintId={item.activeStint.id}
                recovering={!!item.activeStint.recovery?.state}
              />
            </div>
            <StintStream
              key={`stream:${item.activeStint.id}`}
              stint={item.activeStint}
              profile={activeProfile}
            />
          </section>
        )}
        {item.merged?.outside && (
          <div className="flex min-w-0 items-center gap-2 py-2 text-[length:var(--detail-small-text)] text-muted-foreground">
            <GitBranch aria-hidden="true" className="size-4 shrink-0" />
            <span>
              {t.markShipped.outside} · {item.merged.commit.slice(0, 7)}
            </span>
          </div>
        )}
        <PropertyList className="relative [&_[role=group]]:grid [&_[role=group]]:grid-cols-[1rem_7.75rem_minmax(0,1fr)] [&_[role=group]]:items-center [&_dt]:text-[length:var(--detail-small-text)] [&_dd]:text-[length:var(--detail-small-text)] [&_dd]:whitespace-normal">
          {stage && (
            <PropertyRow
              icon={LayoutGrid}
              label={t.detailPanel.stage}
              value={stageName(workflow, stage, t)}
            />
          )}
          {item.worktreePath && (
            <PropertyRow
              icon={FolderGit2}
              label={<span title={t.stints.worktreeFiles}>{t.stints.worktreeShort}</span>}
              value={<FilePath path={item.worktreePath} compact />}
            />
          )}
          {item.pullRequest && (
            <>
              <PropertyRow
                icon={GitBranch}
                label={t.detailPanel.branch}
                value={
                  <span className="block truncate" data-truncate title={item.pullRequest.branch}>
                    {item.pullRequest.branch}
                  </span>
                }
                fullText={item.pullRequest.branch}
              />
              <PropertyRow
                icon={GitPullRequest}
                label={t.detailPanel.pullRequest}
                value={
                  <a
                    className="block truncate"
                    data-truncate
                    title={item.pullRequest.url}
                    href={item.pullRequest.url}
                  >
                    {item.pullRequest.url}
                  </a>
                }
                fullText={item.pullRequest.url}
              />
            </>
          )}
          {item.pullRequestChecks && (
            <PropertyRow
              icon={CheckCircle2}
              label={t.stints.checks}
              value={`${item.pullRequestChecks.checks.filter((check) => check.bucket === "pass").length}/${item.pullRequestChecks.checks.length} ${t.review.visualRefresh07.passing}`}
            />
          )}
          {details && item.stage && !item.merged && (
            <StageAgentRail key={item.slug} item={item} workflows={workflows} />
          )}
        </PropertyList>
        {!item.stage && !item.merged ? (
          <p className="drawer-stage-note px-4 py-4 sm:px-7 muted text-muted-foreground">
            {t.stints.noStage}
          </p>
        ) : null}
        <ShipActions item={item} workflows={workflows} onPausePolling={setShipPaused} />
        {!item.merged && (
          <GateView
            key={item.github ? item.slug : `${item.slug}:${item.stage}`}
            item={item}
            warnings={warnings}
            githubReadOnly={githubReadOnly}
            workflows={workflows}
            details={details}
            action={gateAction}
            hideApprove
          />
        )}
      </div>
    </TabsContent>
  );
}
