// SPDX-License-Identifier: Apache-2.0

import { builtInWorkflows } from "@stintwork/core";
import { Maximize2, Minimize2, MoreHorizontal, X } from "lucide-react";
import { m } from "motion/react";
import { stageName, workflowName } from "../i18n/workflow-names";
import { recoveryStatus } from "../StintRecovery";
import { Button } from "../ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/DropdownMenu";
import { SheetTitle } from "../ui/Sheet";
import { StatusChip } from "../ui/StatusChip";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";
import type { DrawerState } from "./useDrawerState";
export function Header({ state }: { state: DrawerState }) {
  const {
    item,
    milestone,
    onCustomiseWorkflow,
    attentionCount,
    full,
    onFullChange,
    t,
    close,
    refreshing,
    setRefreshAttempt,
    refreshError,
    opener,
    closeButton,
    moreButton,
    customisePending,
    autoFocusing,
    docked,
    workflow,
    stage,
    branch,
    blocked,
  } = state;
  return (
    <m.header
      layout="position"
      className="drawer-header relative max-h-[35%] shrink-0 overflow-y-auto px-4 py-4 sm:px-7"
    >
      <div className="flex min-w-0 items-center gap-2">
        <code
          className="min-w-0 truncate font-mono text-[length:var(--detail-small-text)] text-muted-foreground"
          data-truncate
          title={item.slug}
        >
          {item.slug}
        </code>
        {(item.activeStint?.status === "running" ||
          attentionCount > 0 ||
          blocked ||
          (!item.merged && item.stints[0]?.status === "stopped")) && (
          <StatusChip
            status={
              item.activeStint?.status === "running"
                ? "running"
                : attentionCount
                  ? "attention"
                  : blocked
                    ? "blocked"
                    : item.merged
                      ? "success"
                      : "stopped"
            }
          >
            {item.activeStint?.status === "running"
              ? (recoveryStatus(item.activeStint, t) ?? t.card.running)
              : attentionCount
                ? t.card.needsYou(attentionCount)
                : blocked
                  ? t.card.blocked
                  : item.merged
                    ? t.card.shipped
                    : t.stints.statuses.stopped}
          </StatusChip>
        )}
        <span className="flex-1" />
        {onCustomiseWorkflow && Object.hasOwn(builtInWorkflows, item.workflow) && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    ref={moreButton}
                    variant="ghost"
                    size="icon"
                    aria-label={t.stints.moreActions}
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{t.stints.moreActions}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(event) => {
                if (customisePending.current) {
                  customisePending.current = false;
                  event.preventDefault();
                  moreButton.current?.focus();
                  onCustomiseWorkflow(item.workflow);
                }
              }}
            >
              <DropdownMenuItem
                onSelect={() => {
                  customisePending.current = true;
                }}
              >
                {t.planning.palette.customise(workflowName(workflow, t))}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {docked && onFullChange && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-10 shrink-0"
                aria-label={full ? t.stints.collapseDetail : t.stints.expandDetail}
                onClick={() => onFullChange(!full)}
              >
                {full ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {full ? t.stints.collapseDetail : t.stints.expandDetail}
            </TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger
            asChild
            onFocus={(event) => {
              if (autoFocusing.current || !opener.current) event.preventDefault();
            }}
          >
            <Button
              variant="ghost"
              size="icon"
              className="size-10 shrink-0"
              ref={closeButton}
              aria-label={t.stints.closeWorkItem}
              onClick={close}
            >
              <X aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{`Esc${t.stints.returnToPipeline}`}</TooltipContent>
        </Tooltip>
      </div>

      {refreshing && (
        <p role="status" className="px-4 text-sm text-muted-foreground sm:px-7">
          {t.board.githubStatus.pending}
        </p>
      )}
      {refreshError && (
        <div className="px-4 text-sm text-attention-foreground sm:px-7">
          <p role="alert">{refreshError}</p>
          <Button variant="secondary" onClick={() => setRefreshAttempt((count) => count + 1)}>
            {t.board.githubStatus.retry}
          </Button>
        </div>
      )}
      <div className="drawer-identity my-3 min-w-0">
        {docked ? (
          <h2
            className="truncate text-lg font-semibold leading-tight tracking-[var(--detail-heading-tracking)]"
            data-truncate
            title={item.title}
          >
            {item.title}
          </h2>
        ) : (
          <SheetTitle
            className="truncate text-lg font-semibold leading-tight tracking-[var(--detail-heading-tracking)]"
            data-truncate
            title={item.title}
          >
            {item.title}
          </SheetTitle>
        )}
        <div className="mb-3 mt-2 flex min-w-0 items-center gap-2">
          <p
            className="min-w-0 flex-1 truncate text-[length:var(--detail-small-text)] text-muted-foreground"
            data-truncate
            title={`${workflowName(workflow, t)} · ${milestone?.name ?? item.milestone ?? t.stints.noMilestone}${stage ? ` · ${stageName(workflow, stage, t)}` : ""}`}
          >
            {workflowName(workflow, t)} ·{" "}
            {milestone?.name ?? item.milestone ?? t.stints.noMilestone}
            {stage && <> · {stageName(workflow, stage, t)}</>}
          </p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          {branch && (
            <code
              className="min-w-0 truncate rounded-full bg-card px-2 py-1 font-mono text-[length:var(--detail-tiny-text)]"
              data-truncate
              title={branch}
            >
              {branch}
            </code>
          )}
        </div>
      </div>
    </m.header>
  );
}
