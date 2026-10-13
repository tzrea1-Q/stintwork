// SPDX-License-Identifier: Apache-2.0
import { builtInWorkflows, type ProjectSnapshot } from "@stintwork/core";
import { Command } from "cmdk";
import { Check, Search, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { workflowName } from "./i18n/workflow-names";
import { useLanguage } from "./i18n/language";

export function CommandPalette({
  snapshot,
  milestone,
  onMilestoneChange,
  onOpenItem,
  onCreateItem,
  onCustomiseWorkflow,
  onClose,
}: {
  snapshot: ProjectSnapshot;
  milestone: string;
  onMilestoneChange: (milestone: string) => void;
  onOpenItem: (slug: string) => void;
  onCreateItem: () => void;
  onCustomiseWorkflow: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previousFocus = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    input.current?.focus();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="command-palette"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <h2 className="sr-only" id={titleId}>
        {t.planning.palette.title}
      </h2>
      <Command label={t.planning.palette.search} vimBindings={false}>
        <div className="command-search">
          <Search size={16} className="muted" aria-hidden="true" />
          <Command.Input
            ref={input}
            placeholder={t.planning.palette.placeholder}
            aria-label={t.planning.palette.search}
          />
          <button
            type="button"
            className="top-button"
            onClick={onClose}
            aria-label={t.planning.palette.close}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.stopPropagation();
            }}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
        <Command.List label={t.planning.palette.suggestions}>
          <Command.Empty>{t.planning.palette.empty}</Command.Empty>
          <Command.Group heading={t.planning.palette.actions}>
            <Command.Item
              value={t.planning.palette.create}
              onSelect={() => {
                onClose();
                onCreateItem();
              }}
            >
              {t.planning.palette.create}
            </Command.Item>
            {Object.values(builtInWorkflows).map((workflow) => (
              <Command.Item
                key={workflow.id}
                value={t.planning.palette.customise(workflowName(workflow, t))}
                keywords={[workflow.id]}
                onSelect={() => {
                  onClose();
                  onCustomiseWorkflow(workflow.id);
                }}
              >
                {t.planning.palette.customise(workflowName(workflow, t))}
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading={t.planning.palette.workItems}>
            {snapshot.workItems.map((item) => (
              <Command.Item
                key={item.slug}
                value={`item ${item.slug}`}
                keywords={[item.title]}
                onSelect={() => {
                  onClose();
                  onOpenItem(item.slug);
                }}
              >
                <code>{item.slug}</code>
                <span>{item.title}</span>
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading={t.planning.palette.milestones}>
            {[{ id: "", name: t.planning.palette.all }, ...snapshot.milestones].map((entry) => (
              <Command.Item
                key={entry.id}
                value={`milestone ${entry.id}`}
                keywords={[entry.name]}
                onSelect={() => {
                  onMilestoneChange(entry.id);
                  onClose();
                }}
              >
                <span>{entry.name}</span>
                {entry.id === milestone && (
                  <Check size={14} aria-label={t.planning.palette.selected} />
                )}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
        <footer className="command-footer">
          <span>{t.planning.palette.navigation}</span>
          <kbd>Esc</kbd>
        </footer>
      </Command>
    </dialog>
  );
}
