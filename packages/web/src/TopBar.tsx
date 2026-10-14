// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "@stintwork/core";
import { AlertTriangle, GitBranch, Inbox, Layers3, Search, Settings2 } from "lucide-react";
import { SetupGuide } from "./SetupGuide";
import { useLanguage } from "./i18n/language";
import { LanguageMenu } from "./i18n/LanguageMenu";
import { Button } from "./ui/Button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/Popover";
import { Dialog, DialogTrigger } from "./ui/Dialog";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/Select";

export function TopBar({
  snapshot,
  milestone,
  onMilestoneChange,
  onOpenPalette,
  onOpenNeedsYou,
}: {
  snapshot: ProjectSnapshot;
  milestone: string;
  onMilestoneChange: (id: string) => void;
  onOpenPalette: () => void;
  onOpenNeedsYou: () => void;
}) {
  const { t } = useLanguage();
  const [setupOpen, setSetupOpen] = useState(false);
  const setup = snapshot.setup;
  const checks = [
    setup.hasIssueTracker,
    setup.usesLocalMarkdown,
    setup.hasAgents || setup.hasClaude,
    setup.hasGlossary,
    setup.hasAdrs,
  ];
  const ready = checks.filter(Boolean).length;

  const selectedMilestone =
    snapshot.milestones.find((entry) => entry.id === milestone)?.name ?? t.topBar.all;

  return (
    <header className="top-bar flex shrink-0 flex-col gap-3 border-b border-border bg-surface px-4 py-3 xl:flex-row xl:items-center xl:px-6">
      <div className="top-project flex min-w-0 items-center gap-3 xl:flex-1">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-raised text-muted">
          <Layers3 className="size-icon-sm" aria-hidden="true" />
        </span>
        <strong
          className="min-w-0 truncate text-sm tracking-tight"
          data-truncate
          title={snapshot.name}
        >
          {snapshot.name}
        </strong>
        {snapshot.branch && (
          <span
            className="flex min-w-0 max-w-[40%] items-center gap-1 border-l border-border-strong pl-3 font-mono text-xs text-muted"
            data-truncate
            title={snapshot.branch}
          >
            <GitBranch className="size-icon-sm shrink-0" aria-hidden="true" />
            <span className="truncate">{snapshot.branch}</span>
          </span>
        )}
      </div>
      <div className="top-actions flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Button
            id="needs-you-trigger"
            variant="secondary"
            aria-haspopup="dialog"
            onClick={onOpenNeedsYou}
          >
            <Inbox aria-hidden="true" />
            {t.topBar.needsYou}{" "}
            <span
              className={`rounded-sm bg-surface-raised px-1 text-xs ${snapshot.attentionItems.length ? "text-warning" : "text-muted"}`}
            >
              {snapshot.attentionItems.length}
            </span>
          </Button>
          <Button
            id="command-palette-trigger"
            variant="ghost"
            aria-label={t.topBar.openPalette}
            aria-haspopup="dialog"
            onClick={onOpenPalette}
          >
            <Search aria-hidden="true" />
            <span>{t.topBar.jumpTo}</span>
            <kbd className="hidden text-xs lg:inline">⌘K / Ctrl+K</kbd>
          </Button>
        </div>
        <div className="top-milestone order-last flex w-full min-w-0 items-center gap-2 md:order-none md:w-56">
          <span className="text-xs text-muted">{t.topBar.milestone}</span>
          <Select
            value={milestone ? `milestone:${milestone}` : "all"}
            onValueChange={(value) =>
              onMilestoneChange(value === "all" ? "" : value.slice("milestone:".length))
            }
          >
            <SelectTrigger aria-label={t.topBar.milestone} className="flex-1">
              <SelectValue data-truncate title={selectedMilestone} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.topBar.all}</SelectItem>
              {snapshot.milestones.map((entry) => (
                <SelectItem key={entry.id} value={`milestone:${entry.id}`}>
                  {entry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="top-utilities flex w-full flex-wrap items-center gap-2 lg:w-auto">
          <LanguageMenu />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" id="warnings-trigger">
                <AlertTriangle aria-hidden="true" />
                {t.topBar.warnings}{" "}
                <span className={snapshot.warnings.length ? "text-warning" : "text-muted"}>
                  {snapshot.warnings.length}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-96 [overflow-wrap:anywhere]"
              aria-label={t.topBar.projectWarnings}
            >
              <h2 className="mb-4 text-xs font-semibold">{t.topBar.projectWarnings}</h2>
              {snapshot.warnings.length ? (
                <ul className="space-y-4">
                  {snapshot.warnings.map((warning) => (
                    <li key={JSON.stringify([warning.path, warning.message])}>
                      <code className="text-xs text-muted break-all">
                        {warning.path || t.topBar.project}
                      </code>
                      <p className="mt-1 leading-5">{warning.message}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">{t.topBar.noWarnings}</p>
              )}
              <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
                {t.topBar.readOnly}
              </p>
            </PopoverContent>
          </Popover>
          <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" id="setup-trigger">
                <Settings2 aria-hidden="true" />
                {t.topBar.setup}{" "}
                <span className={ready === checks.length ? "text-success" : "text-muted"}>
                  {ready}/{checks.length}
                </span>
              </Button>
            </DialogTrigger>
            {setupOpen && (
              <SetupGuide workflows={snapshot.workflows} onClose={() => setSetupOpen(false)} />
            )}
          </Dialog>
        </div>
      </div>
    </header>
  );
}
