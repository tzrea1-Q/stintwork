import { useEffect, useRef } from 'react';
import type { Run, RunEvent } from '../types';

export function eventTranscript(event: RunEvent): string {
  switch (event.kind) {
    case 'system': return `[workbench] ${event.text}`;
    case 'message': return event.text;
    case 'plan': return event.steps.map(step => `${step.done ? '[x]' : '[ ]'} ${step.text}`).join('\n');
    case 'tool': return `$ ${event.input}\n${event.output ?? (event.status === 'pending' ? 'Waiting…' : '')}${event.status === 'error' ? '\n[exit: error]' : ''}`;
    case 'file': return `${event.path}  +${event.added} -${event.removed}`;
    case 'question': return `[waiting for answer: ${event.questionId}]`;
    case 'permission': return `[permission required: ${event.questionId}]`;
  }
}

export function TerminalView({ run, className = '', autoScroll = true }: { run: Run; className?: string; autoScroll?: boolean }) {
  const terminal = useRef<HTMLDivElement>(null);
  useEffect(() => { if (autoScroll && terminal.current) terminal.current.scrollTop = terminal.current.scrollHeight; }, [run.events.length, autoScroll]);
  return <div ref={terminal} className={`terminal-view overflow-auto rounded p-3 font-mono text-xs ${className}`} role="log" aria-label={`Terminal transcript for ${run.id}`} aria-live="polite" tabIndex={0}>
    {run.events.map(event => <div key={event.id} className="mb-2 whitespace-pre-wrap break-words"><span className="terminal-time">{new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Los_Angeles' }).format(new Date(event.at))} </span><span className={event.kind === 'tool' && event.status === 'error' ? 'terminal-error' : event.kind === 'file' ? 'terminal-file' : ''}>{eventTranscript(event)}</span></div>)}
    {run.handoff && <div className="whitespace-pre-wrap border-t border-[#30343a] pt-2">[handoff] {run.handoff.stoppedAt}{'\n'}Unresolved: {run.handoff.unresolved.join('; ') || 'none'}{'\n'}Next: {run.handoff.suggestedNext}</div>}
    {run.status === 'running' && <span className="terminal-cursor" aria-label="Run is streaming">▌</span>}
  </div>;
}
