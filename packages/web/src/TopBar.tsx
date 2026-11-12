// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "@stintwork/core";
import { Inbox, Search, Settings } from "lucide-react";
import { useRef, useState } from "react";
import { LanguageMenu } from "./i18n/LanguageMenu";
import { useLanguage } from "./i18n/language";
import { SetupGuide } from "./SetupGuide";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/DropdownMenu";
import { Kbd } from "./ui/Kbd";
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
    <header className="top-bar mx-auto flex min-h-16 w-full max-w-[1500px] shrink-0 items-center gap-1 bg-background px-2 sm:gap-3 sm:px-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:px-7">
      <div className="top-project flex min-w-0 flex-1 items-center gap-2">
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-primary text-[17px] text-primary-foreground"
        >
          ✳
        </span>
        <strong className="hidden font-bold tracking-tight sm:inline">Stintwork</strong>
        <div
          title={[snapshot.name, snapshot.branch].filter(Boolean).join(" · ")}
          className="flex min-w-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs"
        >
          <strong className="min-w-0 truncate" data-truncate title={snapshot.name}>
            {snapshot.name}
          </strong>
          {snapshot.branch && (
            <span
              className="hidden min-w-0 max-w-32 truncate font-mono text-muted-foreground sm:inline"
              data-truncate
              title={snapshot.branch}
            >
              {snapshot.branch}
            </span>
          )}
        </div>
      </div>
      <nav
        aria-label={t.viewNavigation.label}
        className="flex shrink-0 items-center rounded-full border border-border bg-card p-1"
      >
        {(["overview", "pipeline"] as const).map((entry) => (
          <Button
            key={entry}
            id={`${entry}-view-trigger`}
            size="sm"
            className="rounded-full px-2 py-[9px] min-[700px]:px-4"
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
                className="relative size-9"
                aria-label={`${t.topBar.needsYou} ${snapshot.attentionItems.length}${warnings ? ` · ${t.warningCallout.title(warnings)}` : ""}`}
                aria-haspopup="dialog"
                onClick={onOpenNeedsYou}
              >
                <Inbox aria-hidden="true" />
                {snapshot.attentionItems.length > 0 && (
                  <span
                    className="absolute -right-[3px] -top-[3px] grid size-4 place-items-center rounded-full bg-attention text-[9px] tabular-nums text-background"
                    aria-hidden="true"
                  >
                    {snapshot.attentionItems.length}
                  </span>
                )}
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
                    className="relative size-9"
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
