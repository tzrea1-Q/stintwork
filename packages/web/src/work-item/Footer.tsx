// SPDX-License-Identifier: Apache-2.0

import { m } from "motion/react";
import { StageBriefPreview, TicketBriefPreview } from "../BriefPreview";
import { stageName } from "../i18n/workflow-names";
import { MarkShipped } from "../MarkShipped";
import { Button } from "../ui/Button";
import type { DrawerState } from "./useDrawerState";
export function Footer({ state }: { state: DrawerState }) {
  const {
    item,
    mainHead,
    localTracker,
    workflows,
    githubReadOnly,
    t,
    ticketNumber,
    setReviewOpen,
    workflow,
    stage,
    showStageAction,
    nextTicket,
    gateAction,
    activeTab,
    approvePrimary,
    reviewPrimary,
    startPrimary,
  } = state;
  return (
    <m.footer
      layout="position"
      className="drawer-footer relative max-h-[40%] shrink-0 overflow-y-auto border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-7"
    >
      <div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 [&_.brief-action]:contents [&_.brief-action>p]:order-last [&_.brief-action>p]:min-w-0 [&_.brief-action>p]:basis-full [&_.brief-action>p]:truncate [&_.brief-action>p]:text-xs">
          {showStageAction && (
            <section
              aria-label={t.stints.stageStintSection}
              className={
                startPrimary
                  ? "footer-primary contents [&_.brief-action]:mb-0 [&_.brief-action>button]:border-transparent [&_.brief-action>button]:bg-primary [&_.brief-action>button]:text-primary-foreground"
                  : "contents [&_.brief-action]:mb-0"
              }
            >
              <h3 className="sr-only">
                {t.stints.stageStint(stage ? stageName(workflow, stage, t) : "")}
              </h3>
              <StageBriefPreview
                item={item}
                workflows={workflows}
                githubReadOnly={githubReadOnly}
              />
            </section>
          )}
          {nextTicket && (
            <div
              className={
                startPrimary
                  ? "footer-primary contents [&_.brief-action]:mb-0 [&_.brief-action>button]:border-transparent [&_.brief-action>button]:bg-primary [&_.brief-action>button]:text-primary-foreground"
                  : "contents [&_.brief-action]:mb-0"
              }
            >
              <span
                className="order-first block min-w-0 basis-full truncate"
                data-truncate
                title={`${t.stints.nextTicket}: ${ticketNumber(nextTicket.number)} · ${nextTicket.title}`}
              >
                {t.stints.nextTicket}: {ticketNumber(nextTicket.number)} · {nextTicket.title}
              </span>
              <TicketBriefPreview
                item={item}
                ticket={nextTicket}
                workflows={workflows}
                githubReadOnly={githubReadOnly}
              />
            </div>
          )}
          {approvePrimary && stage && (
            <Button
              variant="primary"
              size="sm"
              disabled={gateAction.saving || !!gateAction.message || gateAction.refreshNeeded}
              onClick={() => void gateAction.act(stage.id, "approve")}
            >
              {t.stints.approve(stageName(workflow, stage, t))}
            </Button>
          )}
          {(activeTab !== "overview" || item.merged) && gateAction.message && (
            <p role="status">{gateAction.message}</p>
          )}
          {(activeTab !== "overview" || item.merged) && gateAction.error && (
            <p role="alert">{gateAction.error}</p>
          )}
          {localTracker &&
            !item.github &&
            !item.worktreePath &&
            !item.merged &&
            item.activeStint?.status !== "running" &&
            !item.stints.some((stint) => stint.status === "running") && (
              <MarkShipped slug={item.slug} head={mainHead} />
            )}
          {item.worktreePath && (
            <Button
              variant={reviewPrimary ? "primary" : "secondary"}
              size="sm"
              onClick={() => setReviewOpen(true)}
            >
              {t.stints.openReview}
            </Button>
          )}
        </div>
      </div>
    </m.footer>
  );
}
