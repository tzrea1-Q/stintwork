// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "@stintwork/core";
import { Asterisk, GitBranch, Inbox, Search, Settings } from "lucide-react";
import { useRef, useState } from "react";
import { LanguageMenu } from "./i18n/LanguageMenu";
import { useLanguage } from "./i18n/language";
import { SetupGuide } from "./SetupGuide";
import { Button } from "./ui/Button";
import { Kbd } from "./ui/Kbd";
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
  view = "pipeline",
  onViewChange = () => {},
  onOpenPalette,
  onOpenNeedsYou,
}: {
  snapshot: ProjectSnapshot;
  view?: "overview" | "pipeline";
  onViewChange?: (view: "overview" | "pipeline") => void;
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
    <header className="top-bar flex min-h-16 shrink-0 items-center gap-1 bg-background px-2 sm:gap-3 sm:px-4 xl:px-6">
      <div className="top-project flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
        <Asterisk className="size-5 shrink-0 text-foreground" aria-hidden="true" />
        <strong
          className="min-w-0 truncate text-sm tracking-tight"
          data-truncate
          title={snapshot.name}
        >
          {snapshot.name}
        </strong>
        {snapshot.branch && (
          <span
            className="flex min-w-0 max-w-[40%] items-center gap-1 rounded-full bg-card px-2 py-1 font-mono text-xs text-muted-foreground"
            data-truncate
            title={snapshot.branch}
          >
            <GitBranch className="size-icon-sm shrink-0" aria-hidden="true" />
            <span className="truncate">{snapshot.branch}</span>
          </span>
        )}
      </div>
      <nav
        aria-label={t.viewNavigation.label}
        className="flex shrink-0 items-center rounded-full border border-border bg-card p-1"
      >
        {(["overview", "pipeline"] as const).map((entry) => (
          <Button
            key={entry}
            size="sm"
            variant={view === entry ? "primary" : "ghost"}
            aria-current={view === entry ? "page" : undefined}
            onClick={() => onViewChange(entry)}
          >
            {t.viewNavigation[entry]}
          </Button>
        ))}
      </nav>
      <div className="top-actions flex shrink-0 items-center gap-0 sm:flex-1 sm:justify-end sm:gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                id="command-palette-trigger"
                variant="secondary"
                size="icon"
                className="lg:w-auto lg:px-3"
                aria-label={t.topBar.openPalette}
                aria-haspopup="dialog"
                onClick={onOpenPalette}
              >
                <Search aria-hidden="true" />
                <span className="hidden lg:inline">{t.topBar.jumpTo}</span>
                <Kbd className="hidden lg:inline-flex">⌘K</Kbd>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t.topBar.openPalette}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                id="needs-you-trigger"
                variant="secondary"
                size="icon"
                className="relative"
                aria-label={`${t.topBar.needsYou} ${snapshot.attentionItems.length}${warnings ? ` · ${t.warningCallout.title(warnings)}` : ""}`}
                aria-haspopup="dialog"
                onClick={onOpenNeedsYou}
              >
                <Inbox aria-hidden="true" />
                <span
                  className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-attention-soft px-1 text-xs text-attention-foreground"
                  aria-hidden="true"
                >
                  {snapshot.attentionItems.length}
                </span>
                {warnings > 0 && (
                  <span
                    data-warning-dot
                    className="absolute bottom-0 right-0 size-1 rounded-full bg-attention"
                    aria-hidden="true"
                  />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t.topBar.needsYou}</TooltipContent>
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
                    className="relative"
                    aria-label={t.topBar.settings}
                    aria-describedby={ready < checks.length ? "setup-status" : undefined}
                  >
                    <Settings aria-hidden="true" />
                    {ready < checks.length && (
                      <span
                        data-warning-dot
                        className="absolute right-1 top-1 size-1 rounded-full bg-attention"
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
                <span className="ml-auto pl-4 text-muted-foreground">
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
