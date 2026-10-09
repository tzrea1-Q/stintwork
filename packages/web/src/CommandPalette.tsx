import type { ProjectSnapshot } from "@stintwork/core";
import { Command } from "cmdk";
import { Check, Search, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

export function CommandPalette({
  snapshot,
  milestone,
  onMilestoneChange,
  onOpenItem,
  onClose,
}: {
  snapshot: ProjectSnapshot;
  milestone: string;
  onMilestoneChange: (milestone: string) => void;
  onOpenItem: (slug: string) => void;
  onClose: () => void;
}) {
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
        Command palette
      </h2>
      <Command label="Search work items and milestones" vimBindings={false}>
        <div className="command-search">
          <Search size={16} className="muted" aria-hidden="true" />
          <Command.Input
            ref={input}
            placeholder="Find a work item or milestone…"
            aria-label="Search work items and milestones"
          />
          <button
            type="button"
            className="top-button"
            onClick={onClose}
            aria-label="Close command palette"
            onKeyDown={(event) => {
              if (event.key === "Enter") event.stopPropagation();
            }}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
        <Command.List>
          <Command.Empty>No work items or milestones found.</Command.Empty>
          <Command.Group heading="Work items">
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
          <Command.Group heading="Milestone filter">
            {[{ id: "", name: "All" }, ...snapshot.milestones].map((entry) => (
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
                {entry.id === milestone && <Check size={14} aria-label="Selected milestone" />}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
        <footer className="command-footer">
          <span>↑ ↓ to navigate · Enter to select</span>
          <kbd>Esc</kbd>
        </footer>
      </Command>
    </dialog>
  );
}
