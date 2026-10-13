// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "@stintwork/core";
import {
  AlertTriangle,
  Check,
  Circle,
  GitBranch,
  Inbox,
  Layers3,
  Search,
  Settings2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SetupGuide } from "./SetupGuide";
import { useLanguage } from "./i18n/language";
import { LanguageSelect } from "./i18n/LanguageSelect";

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
  const { t, language } = useLanguage();
  const [panel, setPanel] = useState<"warnings" | "setup" | "language" | null>(null);
  const panels = useRef<HTMLDivElement>(null);
  const setup = snapshot.setup;
  const checks = [
    {
      label: t.topBar.ticketGuide,
      path: "docs/agents/issue-tracker.md",
      ready: setup.hasIssueTracker,
    },
    {
      label: t.topBar.markdownTracking,
      path: `.scratch/${t.topBar.convention}`,
      ready: setup.usesLocalMarkdown,
    },
    {
      label: t.topBar.agentInstructions,
      path: `AGENTS.md${t.topBar.or}CLAUDE.md`,
      ready: setup.hasAgents || setup.hasClaude,
    },
    { label: t.topBar.glossary, path: "GLOSSARY.md", ready: setup.hasGlossary },
    { label: t.topBar.decisionRecords, path: "docs/adr/", ready: setup.hasAdrs },
  ];
  const ready = checks.filter((check) => check.ready).length;

  useEffect(() => {
    if (!panel) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !panels.current?.contains(event.target)) setPanel(null);
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        panels.current?.querySelector<HTMLButtonElement>(`#${panel}-trigger`)?.focus();
        setPanel(null);
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [panel]);

  return (
    <header className="top-bar">
      <div className="flex min-w-0 items-center gap-3">
        <span className="project-icon">
          <Layers3 size={17} aria-hidden="true" />
        </span>
        <strong className="truncate text-sm tracking-tight" title={snapshot.name}>
          {snapshot.name}
        </strong>
        {snapshot.branch && (
          <span className="branch" title={snapshot.branch}>
            <GitBranch size={12} aria-hidden="true" />
            <span className="truncate">{snapshot.branch}</span>
          </span>
        )}
      </div>
      <div className="top-actions">
        <button
          type="button"
          id="needs-you-trigger"
          className={`top-button ${snapshot.attentionItems.length ? "warning" : ""}`}
          aria-haspopup="dialog"
          onClick={onOpenNeedsYou}
        >
          <Inbox size={14} aria-hidden="true" />
          {t.topBar.needsYou} <span className="count">{snapshot.attentionItems.length}</span>
        </button>
        <button
          type="button"
          id="command-palette-trigger"
          className="top-button"
          aria-label={t.topBar.openPalette}
          aria-haspopup="dialog"
          onClick={onOpenPalette}
        >
          <Search size={13} aria-hidden="true" />
          <span>{t.topBar.jumpTo}</span>
          <kbd>⌘K / Ctrl+K</kbd>
        </button>
        <label className="milestone-filter">
          <span className="muted text-[11px]">{t.topBar.milestone}</span>
          <select
            aria-label={t.topBar.milestone}
            value={milestone}
            onChange={(event) => onMilestoneChange(event.target.value)}
          >
            <option value="">{t.topBar.all}</option>
            {snapshot.milestones.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <div className="relative flex items-center gap-2" ref={panels}>
          <button
            type="button"
            className="top-button"
            id="language-trigger"
            aria-label={t.topBar.language}
            aria-haspopup="listbox"
            aria-expanded={panel === "language"}
            aria-controls="language-panel"
            onClick={() => setPanel(panel === "language" ? null : "language")}
          >
            <span lang={language}>{language === "en" ? "English" : "简体中文"}</span>
          </button>
          {panel === "language" && (
            <div className="project-popover" id="language-panel">
              <LanguageSelect
                size={2}
                onChange={() => {
                  setPanel(null);
                  panels.current?.querySelector<HTMLButtonElement>("#language-trigger")?.focus();
                }}
              />
            </div>
          )}
          <button
            type="button"
            className={`top-button ${snapshot.warnings.length ? "warning" : "muted"}`}
            id="warnings-trigger"
            aria-expanded={panel === "warnings"}
            aria-controls="warnings-panel"
            onClick={() => setPanel(panel === "warnings" ? null : "warnings")}
          >
            <AlertTriangle size={13} aria-hidden="true" />
            {t.topBar.warnings} <span className="count">{snapshot.warnings.length}</span>
          </button>
          <button
            type="button"
            className="top-button"
            id="setup-trigger"
            aria-expanded={panel === "setup"}
            aria-controls="setup-panel"
            onClick={() => setPanel(panel === "setup" ? null : "setup")}
          >
            <Settings2 size={13} aria-hidden="true" />
            {t.topBar.setup}{" "}
            <span className={ready === checks.length ? "success" : "muted"}>
              {ready}/{checks.length}
            </span>
          </button>
          {(panel === "warnings" || panel === "setup") && (
            <section
              className="project-popover"
              id={`${panel}-panel`}
              aria-label={panel === "warnings" ? t.topBar.projectWarnings : t.topBar.projectSetup}
            >
              <h2 className="mb-4 text-xs font-semibold">
                {panel === "warnings" ? t.topBar.projectWarnings : t.topBar.projectSetup}
              </h2>
              {panel === "warnings" ? (
                snapshot.warnings.length ? (
                  <ul className="space-y-4">
                    {snapshot.warnings.map((warning) => (
                      <li key={JSON.stringify([warning.path, warning.message])}>
                        <code className="text-[11px] muted break-all">
                          {warning.path || t.topBar.project}
                        </code>
                        <p className="mt-1 leading-5">{warning.message}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">{t.topBar.noWarnings}</p>
                )
              ) : (
                <ul className="space-y-4">
                  {checks.map((check) => (
                    <li key={check.label} className="flex gap-2">
                      {check.ready ? (
                        <Check size={14} className="success mt-0.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <Circle size={14} className="muted mt-0.5 shrink-0" aria-hidden="true" />
                      )}
                      <div>
                        <p>
                          {check.label}
                          <span className="sr-only">
                            : {check.ready ? t.topBar.found : t.topBar.missing}
                          </span>
                        </p>
                        <code className="text-[10px] muted">{check.path}</code>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {panel === "setup" ? (
                <SetupGuide workflows={snapshot.workflows} />
              ) : (
                <p className="mt-4 border-t border-(--border) pt-3 text-[10px] muted">
                  {t.topBar.readOnly}
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </header>
  );
}
