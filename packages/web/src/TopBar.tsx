// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "@stintwork/core";
import { GitBranch, Inbox, Search, Settings } from "lucide-react";
import { useRef, useState } from "react";
import { SetupGuide } from "./SetupGuide";
import { useLanguage } from "./i18n/language";
import { LanguageMenu } from "./i18n/LanguageMenu";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/DropdownMenu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/Tooltip";

export function TopBar({
  snapshot,
  onOpenPalette,
  onOpenNeedsYou,
}: {
  snapshot: ProjectSnapshot;
  onOpenPalette: () => void;
  onOpenNeedsYou: () => void;
}) {
  const { t } = useLanguage();
  const [setupOpen, setSetupOpen] = useState(false);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const setup = snapshot.setup;
  const checks = [
    setup.hasIssueTracker,
    setup.usesLocalMarkdown,
    setup.hasAgents || setup.hasClaude,
    setup.hasGlossary,
    setup.hasAdrs,
  ];
  const ready = checks.filter(Boolean).length;
  const warnings = snapshot.warnings.length;

  return (
    <header className="top-bar flex shrink-0 items-center gap-2 border-b border-border bg-surface px-4 py-3 sm:gap-4 xl:px-6">
      <div className="top-project flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <strong
          className="min-w-0 truncate text-sm tracking-tight"
          data-truncate
          title={snapshot.name}
        >
          {snapshot.name}
        </strong>
        {snapshot.branch && (
          <span
            className="flex min-w-0 max-w-[40%] shrink-0 items-center gap-1 border-l border-border-strong pl-2 font-mono text-xs text-muted sm:pl-3"
            data-truncate
            title={snapshot.branch}
          >
            <GitBranch className="size-icon-sm shrink-0" aria-hidden="true" />
            <span className="truncate">{snapshot.branch}</span>
          </span>
        )}
      </div>
      <div className="top-actions flex shrink-0 items-center gap-1 sm:gap-2">
        <Button
          id="needs-you-trigger"
          variant="secondary"
          size="sm"
          className="whitespace-nowrap"
          aria-label={`${t.topBar.needsYou} ${snapshot.attentionItems.length}${warnings ? ` · ${t.warningCallout.title(warnings)}` : ""}`}
          aria-haspopup="dialog"
          onClick={onOpenNeedsYou}
        >
          <Inbox aria-hidden="true" />
          {t.topBar.needsYou}
          <span
            className={`rounded-sm bg-surface-raised px-1 text-xs ${snapshot.attentionItems.length ? "text-warning" : "text-muted"}`}
          >
            {snapshot.attentionItems.length}
          </span>
          {warnings > 0 && (
            <span
              data-warning-dot
              className="size-1 shrink-0 rounded-full bg-warning"
              aria-hidden="true"
            />
          )}
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                id="command-palette-trigger"
                variant="ghost"
                size="icon"
                className="sm:w-auto sm:px-2"
                aria-label={t.topBar.openPalette}
                aria-haspopup="dialog"
                onClick={onOpenPalette}
              >
                <Search aria-hidden="true" />
                <span className="hidden sm:inline">{t.topBar.jumpTo}</span>
                <kbd className="hidden text-xs lg:inline">⌘K / Ctrl+K</kbd>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t.topBar.openPalette}</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    id="settings-trigger"
                    ref={settingsTrigger}
                    variant="ghost"
                    size="icon"
                    className="relative sm:w-auto sm:px-2"
                    aria-label={t.topBar.settings}
                    aria-describedby={ready < checks.length ? "setup-status" : undefined}
                  >
                    <Settings aria-hidden="true" />
                    <span className="hidden sm:inline">{t.topBar.settings}</span>
                    {ready < checks.length && (
                      <span
                        data-warning-dot
                        className="absolute right-1 top-1 size-1 rounded-full bg-warning"
                        aria-hidden="true"
                      />
                    )}
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{t.topBar.settings}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent
              align="end"
              aria-label={t.topBar.settings}
              onFocus={(event) => {
                if (event.target === event.currentTarget) {
                  event.preventDefault();
                  event.currentTarget.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
                }
              }}
              onCloseAutoFocus={(event) => {
                if (setupOpen) event.preventDefault();
              }}
            >
              <LanguageMenu />
              <DropdownMenuSeparator className="my-1 border-t border-border" />
              <DropdownMenuItem aria-haspopup="dialog" onSelect={() => setSetupOpen(true)}>
                {t.topBar.projectSetup}{" "}
                <span className="ml-auto pl-4 text-muted">
                  {ready}/{checks.length}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TooltipProvider>
        {ready < checks.length && (
          <span id="setup-status" className="sr-only">
            {t.topBar.setupIncomplete}
          </span>
        )}
        <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
          {setupOpen && (
            <SetupGuide
              workflows={snapshot.workflows}
              onClose={() => setSetupOpen(false)}
              returnFocusRef={settingsTrigger}
            />
          )}
        </Dialog>
      </div>
    </header>
  );
}
