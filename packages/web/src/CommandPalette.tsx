// SPDX-License-Identifier: Apache-2.0
import { builtInWorkflows, type ProjectSnapshot } from "@stintwork/core";
import { Command } from "cmdk";
import { Check, Search, X } from "lucide-react";
import { useLanguage } from "./i18n/language";
import { workflowName } from "./i18n/workflow-names";
import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogTitle } from "./ui/Dialog";
import { Kbd } from "./ui/Kbd";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/Tooltip";

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

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="command-palette w-xl rounded-[22px] bg-popover text-popover-foreground p-0 focus-within:ring-2 focus-within:ring-ring"
      >
        <DialogTitle className="sr-only">{t.planning.palette.title}</DialogTitle>
        <Command
          label={t.planning.palette.search}
          vimBindings={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-item]]:flex [&_[cmdk-item]]:min-w-0 [&_[cmdk-item]]:cursor-pointer [&_[cmdk-item]]:items-center [&_[cmdk-item]]:gap-3 [&_[cmdk-item]]:rounded-lg [&_[cmdk-item]]:p-2 [&_[cmdk-item]]:text-sm [&_[cmdk-item]]:[overflow-wrap:anywhere] [&_[cmdk-item][data-selected=true]]:bg-accent [&_[cmdk-item][data-selected=true]]:text-accent-foreground [&_[cmdk-item]_code]:text-xs [&_[cmdk-item]_code]:text-muted-foreground"
        >
          <div className="command-search flex items-center gap-3 border-b border-border px-4 py-2">
            <Search className="size-icon-sm shrink-0 text-muted-foreground" aria-hidden="true" />
            <Command.Input
              className="min-w-0 flex-1 bg-transparent p-2 focus-visible:outline-none"
              placeholder={t.planning.palette.placeholder}
              aria-label={t.planning.palette.search}
            />
            <Kbd>Esc</Kbd>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    aria-label={t.planning.palette.close}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.stopPropagation();
                    }}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t.planning.palette.close}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Command.List
            label={t.planning.palette.suggestions}
            className="max-h-[50dvh] overflow-auto overscroll-contain p-2"
          >
            <Command.Empty className="p-5 text-center text-muted-foreground">
              {t.planning.palette.empty}
            </Command.Empty>
            <Command.Group heading={t.planning.palette.actions}>
              {snapshot.setup.tracker !== "github-issues" && (
                <Command.Item
                  value={t.planning.palette.create}
                  onSelect={() => {
                    onClose();
                    onCreateItem();
                  }}
                >
                  {t.planning.palette.create}
                </Command.Item>
              )}
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
                    <Check
                      className="size-icon-sm shrink-0"
                      aria-label={t.planning.palette.selected}
                    />
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
          <footer className="command-footer flex flex-wrap justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <span>{t.planning.palette.navigation}</span>
            <Kbd>Esc</Kbd>
          </footer>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
