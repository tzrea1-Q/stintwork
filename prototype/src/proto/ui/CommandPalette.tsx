import { Command } from 'cmdk';
import { useEffect, useState } from 'react';
import { Kbd } from './Kbd';

export interface PaletteCommand { id: string; label: string; group: string; shortcut?: string; run: () => void }
export interface CommandPaletteProps { commands: PaletteCommand[]; open?: boolean; onOpenChange?: (open: boolean) => void; placeholder?: string }
export function CommandPalette({ commands, open: controlledOpen, onOpenChange, placeholder = 'Jump to an item or run an action…' }: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => { setInternalOpen(value); onOpenChange?.(value); };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !event.repeat) { event.preventDefault(); setOpen(!open); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [open, onOpenChange]);
  const groups = [...new Set(commands.map(command => command.group))];
  return <Command.Dialog open={open} onOpenChange={setOpen} label="Workbench commands" className="command-palette" data-command-palette>
    <Command.Input placeholder={placeholder} aria-label="Search commands" />
    <Command.List>
      <Command.Empty>No matching commands.</Command.Empty>
      {groups.map(group => <Command.Group key={group} heading={group}>
        {commands.filter(command => command.group === group).map(command => <Command.Item key={command.id} value={`${command.label} ${command.id}`} onSelect={() => { setOpen(false); command.run(); }}><span>{command.label}</span>{command.shortcut && <Kbd>{command.shortcut}</Kbd>}</Command.Item>)}
      </Command.Group>)}
    </Command.List>
  </Command.Dialog>;
}
