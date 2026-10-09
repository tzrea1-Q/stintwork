import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCheck, ChevronDown, CircleHelp, Clock3, FileCode2, FileText, GitBranch, GitMerge, Inbox, ListChecks, LockKeyhole, MessageSquare, Play, RotateCcw, ShieldCheck, Square, Terminal, X } from 'lucide-react';
import { agentsArtifact } from '../../proto/data';
import { useWorkbench } from '../../proto/store';
import type { AgentId, Finding, InboxEntry, Run, Ticket, WorkItem } from '../../proto/types';
import { AgentBadge, DiffView, Kbd, MarkdownView, StatusIcon, TerminalView, relativeTime } from '../../proto/ui';

export const isShipped = (item: WorkItem) => item.pr?.state === 'merged' || item.stages.every(stage => ['done', 'skipped'].includes(stage.status));
export const currentStage = (item: WorkItem) => item.stages.find(stage => stage.status === 'active') ?? item.stages.find(stage => stage.status === 'waiting');
const isLive = (run: Run) => run.status === 'running' || run.status === 'waiting';

export function Overlay({ title, className, children, onClose }: { title: string; className: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = dialog.current!;
    (panel.querySelector<HTMLElement>('[data-autofocus]') ?? panel.querySelector<HTMLElement>('button') ?? panel).focus();
    const keydown = (event: KeyboardEvent) => {
      if (document.querySelector('[cmdk-dialog]') || [...document.querySelectorAll('[data-pipeline-dialog]')].at(-1) !== panel) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key === 'Tab') {
        const focusable = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]')].filter(element => element.getClientRects().length);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first) { event.preventDefault(); panel.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => { document.removeEventListener('keydown', keydown, true); requestAnimationFrame(() => { if (previous?.isConnected) previous.focus(); }); };
  }, []);
  return <div className={`pb-overlay ${className}-overlay`}><div className="pb-backdrop" onClick={onClose} /><div ref={dialog} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-pipeline-dialog className={`pb-panel ${className}`} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.stopPropagation(); }}><button className="pb-close" aria-label={`Close ${title}`} onClick={onClose}><X size={18} /></button>{children}</div></div>;
}

function AgentPicker({ value, onChange, label }: { value?: AgentId; onChange: (agent: AgentId) => void; label: string }) {
  const { state } = useWorkbench();
  return <span className="pb-agent-picker">{value && <AgentBadge agent={value} avatar showName={false} />}<select aria-label={label} value={value ?? ''} onChange={event => onChange(event.target.value as AgentId)}><option value="" disabled>Choose agent</option>{state.agents.map(agent => <option key={agent.id} value={agent.id} disabled={!agent.available}>{agent.name}{agent.note ? ` — ${agent.note}` : ''}</option>)}</select><ChevronDown size={11} aria-hidden="true" /></span>;
}

export function InboxCard({ entry, onReview, onItem }: { entry: InboxEntry; onReview?: (id: string) => void; onItem?: (id: string) => void }) {
  const { state, actions, select } = useWorkbench();
  const [answer, setAnswer] = useState(entry.options?.[0]?.id ?? '');
  const [freeText, setFreeText] = useState('');
  const item = select.item(entry.itemId);
  const proposal = state.proposals.find(candidate => candidate.id === entry.proposalId);
  const review = select.review(entry.itemId);
  const Icon = entry.kind === 'question' ? CircleHelp : entry.kind === 'permission' ? Terminal : entry.kind === 'memory' ? BookOpen : entry.kind === 'review' ? ShieldCheck : FileText;
  return <article className={`pb-inbox-card pb-inbox-${entry.kind}`}><div className="pb-inbox-meta"><Icon size={14} /><span>{entry.kind === 'permission' ? 'Command approval' : entry.kind === 'memory' ? 'Memory proposal' : entry.kind}</span><button disabled={!onItem} onClick={() => onItem?.(entry.itemId)}>{entry.itemId}</button>{entry.agent && <AgentBadge agent={entry.agent} avatar showName={false} />}</div><h3>{entry.kind === 'review' && review ? `${review.findings.filter(finding => finding.status === 'open').length} open findings · ${review.checks.some(check => check.status === 'fail') ? 'checks failing' : review.commit !== review.checksCommit ? 'stale evidence' : 'checks passing'}` : entry.title}</h3>{entry.detail && <p className="pb-inbox-detail">{entry.detail}</p>}
    {entry.kind === 'question' && <form onSubmit={event => { event.preventDefault(); actions.answerQuestion(entry.id, freeText.trim() || answer); }}><div className="pb-answer-options">{entry.options?.map(option => <label key={option.id} className={answer === option.id && !freeText.trim() ? 'pb-option-selected' : ''}><input type="radio" name={entry.id} checked={answer === option.id && !freeText.trim()} onChange={() => { setAnswer(option.id); setFreeText(''); }} /><span>{option.label}{option.description && <small>{option.description}</small>}</span></label>)}</div>{entry.allowFreeText && <textarea aria-label={`Custom answer for ${entry.itemId}`} placeholder="Or tell the agent in your own words…" value={freeText} onChange={event => setFreeText(event.target.value)} rows={2} />}<button className="pb-button pb-primary" disabled={!answer && !freeText.trim()} type="submit">Send answer<ArrowRight size={13} /></button></form>}
    {entry.kind === 'permission' && <><pre className="pb-command-preview"><code>$ {entry.command}</code></pre>{item?.worktree && <p className="pb-path">{item.worktree}</p>}<div className="pb-inline-actions"><button className="pb-button pb-primary" onClick={() => actions.decidePermission(entry.id, true)}><Check size={13} />Allow command</button><button className="pb-button" onClick={() => actions.decidePermission(entry.id, false)}>Deny</button></div></>}
    {entry.kind === 'approval' && <><details className="pb-artifact-details"><summary><FileText size={13} />Read {entry.stageId === 'tickets' ? 'ticket plan' : 'spec'}<ChevronDown size={13} /></summary>{entry.stageId === 'tickets' ? item?.tickets.map(ticket => <div key={ticket.id}><p className="pb-path">{ticket.path}</p><MarkdownView content={ticket.body} /></div>) : item?.artifacts.filter(file => file.kind === 'spec').map(file => <div key={file.path}><p className="pb-path">{file.path}</p><MarkdownView content={file.content} /></div>)}</details><button className="pb-button pb-primary" onClick={() => actions.approveStage(entry.itemId, entry.stageId ?? 'spec')}><Check size={13} />Approve {entry.stageId ?? 'spec'}</button></>}
    {entry.kind === 'memory' && proposal && <><p className="pb-path">{proposal.target}</p><details className="pb-artifact-details"><summary><FileCode2 size={13} />View proposed diff<ChevronDown size={13} /></summary><DiffView diff={proposal.diff} /></details><div className="pb-inline-actions"><button className="pb-button pb-primary" onClick={() => actions.decideProposal(proposal.id, true)}><Check size={13} />Accept proposal</button><button className="pb-button" onClick={() => actions.decideProposal(proposal.id, false)}>Reject</button></div></>}
    {entry.kind === 'review' && <button className="pb-button pb-primary" onClick={() => onReview?.(entry.itemId)} disabled={!onReview}><ShieldCheck size={13} />Open review<ArrowRight size={13} /></button>}
    <div className="pb-inbox-time">{entry.runId && <code>{entry.runId} · </code>}{relativeTime(entry.createdAt, state.now)}</div>
  </article>;
}

function HandoffCard({ run }: { run: Run }) {
  if (!run.handoff) return null;
  return <div className={`pb-handoff ${run.status === 'stopped' ? 'pb-handoff-stopped' : ''}`}><div className="pb-section-label"><AgentBadge agent={run.agent} avatar /> <span>Handoff · <code>{run.id}</code></span><StatusIcon status={run.status} /></div><p>{run.handoff.stoppedAt}</p>{run.handoff.unresolved.length > 0 && <ul>{run.handoff.unresolved.map(text => <li key={text}>{text}</li>)}</ul>}<div className="pb-handoff-next"><ArrowRight size={13} /><code>{run.handoff.suggestedNext}</code></div></div>;
}

function RunStream({ run, item, onReview }: { run: Run; item: WorkItem; onReview: (id: string) => void }) {
  const { actions, select } = useWorkbench();
  const [terminal, setTerminal] = useState(false);
  const [follow, setFollow] = useState(true);
  const log = useRef<HTMLDivElement>(null);
  const plan = [...run.events].reverse().find(event => event.kind === 'plan');
  const pending = select.needsYou().filter(entry => entry.runId === run.id && ['question', 'permission'].includes(entry.kind));
  useEffect(() => { if (follow && log.current) log.current.scrollTop = log.current.scrollHeight; }, [run.events.length, follow]);
  const completedTicket = item.tickets.find(ticket => ticket.id === run.ticketId && ticket.status === 'resolved');
  return <div className="pb-run"><div className="pb-run-toolbar"><div><StatusIcon status={run.status} /><code>{run.id}</code><AgentBadge agent={run.agent} /><span className="pb-muted">{run.stageId}{run.ticketId ? ` · ticket ${run.ticketId}` : ''}</span></div><div><button className={`pb-button pb-button-small ${terminal ? 'pb-toggle-active' : ''}`} aria-pressed={terminal} onClick={() => setTerminal(value => !value)}><Terminal size={13} />{terminal ? 'Stream' : 'Terminal'}</button>{isLive(run) && <button className="pb-button pb-button-small pb-danger-button" onClick={() => actions.stopRun(run.id)}><Square size={11} />Stop</button>}</div></div>
    {pending.map(entry => <InboxCard key={entry.id} entry={entry} onReview={onReview} />)}
    {completedTicket && <div className="pb-completion" role="status"><CheckCheck size={18} /><div><strong>Ticket {completedTicket.id} resolved</strong><p>{item.tickets.filter(ticket => ticket.status !== 'resolved' && !ticket.blockedBy.length).map(ticket => `Ticket ${ticket.id} is unblocked and ready to start.`).join(' ') || 'All implementation tickets are complete.'}</p></div></div>}
    {terminal ? <TerminalView run={run} className="pb-terminal" autoScroll={follow} /> : <>{plan?.kind === 'plan' && <div className="pb-run-plan"><div className="pb-section-label"><ListChecks size={14} />Plan<span>{plan.steps.filter(step => step.done).length}/{plan.steps.length}</span></div>{plan.steps.map((step, index) => <div key={step.text} className={step.done ? 'pb-step-done' : ''}>{step.done ? <Check size={13} /> : <span className="pb-plan-number">{index + 1}</span>}<span>{step.text}</span></div>)}</div>}<div className="pb-run-log" ref={log} role="log" aria-label={`Live stream for ${run.id}`} aria-live="polite" tabIndex={0}>{run.events.filter(event => event.kind !== 'plan').map(event => <div key={event.id} className={`pb-event pb-event-${event.kind}`}>
      {event.kind === 'message' && <><AgentBadge agent={run.agent} avatar showName={false} /><div>{event.text.length > 450 ? <details><summary>{event.text.split('\n')[0]}<span className="pb-muted"> · expand context</span></summary><pre>{event.text}</pre></details> : <p>{event.text}</p>}</div></>}
      {event.kind === 'system' && <><Clock3 size={12} /><p>{event.text}</p></>}
      {event.kind === 'tool' && <><Terminal size={13} /><div><div className="pb-tool-heading"><code>{event.input}</code><StatusIcon status={event.status === 'ok' ? 'pass' : event.status === 'error' ? 'fail' : 'pending'} /></div>{event.output && <pre>{event.output}</pre>}</div></>}
      {event.kind === 'file' && <><FileCode2 size={14} /><div className="pb-file-event"><code>{event.path}</code><span className="pb-success">+{event.added}</span><span className="pb-danger">−{event.removed}</span></div></>}
      {(event.kind === 'question' || event.kind === 'permission') && <><CircleHelp size={13} /><p>{pending.some(entry => entry.id === event.questionId) ? 'Waiting for your decision above.' : 'Human checkpoint answered.'}</p></>}
    </div>)}{run.status === 'running' && <div className="pb-streaming"><span className="pb-pulse" />Agent is working…</div>}</div></>}
    <div className="pb-stream-footer"><span><span className={`pb-dot ${run.status === 'done' ? 'pb-success-dot' : ''}`} />{run.status === 'running' ? 'Streaming live' : run.status === 'waiting' ? 'Paused at a human checkpoint' : `Run ${run.status}`}</span><button aria-pressed={follow} onClick={() => setFollow(value => !value)}>{follow ? 'Following output' : 'Follow output'}<ChevronDown size={12} /></button></div><HandoffCard run={run} />
  </div>;
}

export function ItemDrawer({ item, initialStage, onClose, onReview }: { item: WorkItem; initialStage?: string; onClose: () => void; onReview: (id: string) => void }) {
  const { state, actions, select } = useWorkbench();
  const stage = currentStage(item);
  const workflow = select.workflow(item);
  const runs = select.runsFor(item.id);
  const live = select.activeRun(item.id);
  const nextTicket = item.tickets.find(ticket => ticket.status !== 'resolved' && !ticket.blockedBy.some(id => item.tickets.find(candidate => candidate.id === id)?.status !== 'resolved'));
  const [tab, setTab] = useState(initialStage === 'spec' ? 'Spec' : 'Overview');
  const [previewStage, setPreviewStage] = useState(initialStage && initialStage !== 'spec' && stage?.stageId === initialStage && !live ? initialStage : undefined);
  const [ticketId, setTicketId] = useState(initialStage === 'implement' ? nextTicket?.id : undefined);
  const [agent, setAgent] = useState<AgentId>(item.stages.find(candidate => candidate.stageId === initialStage)?.agent ?? stage?.agent ?? 'claude');
  const [runId, setRunId] = useState(live?.id ?? runs[0]?.id);
  const [startError, setStartError] = useState('');
  const selectedRun = state.runs.find(run => run.id === runId) ?? live ?? runs[0];
  const brief = previewStage ? select.brief({ itemId: item.id, stageId: previewStage, ticketId, agent }) : undefined;
  const stopped = runs.find(run => run.status === 'stopped');
  const complete = item.tickets.filter(ticket => ticket.status === 'resolved').length;
  const readyApproval = stage?.status === 'waiting' && workflow.stages.find(candidate => candidate.id === stage.stageId)?.gate === 'approve' && !live;

  function preview(stageId: string, ticket?: Ticket) {
    if (live) { setRunId(live.id); setTab('Runs'); setPreviewStage(undefined); return; }
    setPreviewStage(stageId); setTicketId(ticket?.id); setAgent(item.stages.find(candidate => candidate.stageId === stageId)?.agent ?? 'claude'); setStartError('');
  }
  function nextAction() {
    if (live) { setRunId(live.id); setTab('Runs'); setPreviewStage(undefined); }
    else if (stage?.stageId === 'review' && select.review(item.id)) onReview(item.id);
    else if (stage?.stageId === 'ship' && item.pr) onReview(item.id);
    else if (readyApproval && stage?.stageId === 'spec') { setTab('Spec'); setPreviewStage(undefined); }
    else if (readyApproval && stage?.stageId === 'tickets') { setTab('Overview'); setPreviewStage(undefined); }
    else if (stage) preview(stage.stageId, stage.stageId === 'implement' ? nextTicket : undefined);
  }
  const actionLabel = live ? 'View live run' : isShipped(item) ? 'Shipped' : stage?.stageId === 'review' && select.review(item.id) ? 'Open review' : stage?.stageId === 'ship' && item.pr ? 'Review & merge' : readyApproval ? `Read & approve ${stage?.stageId}` : stage?.stageId === 'implement' && nextTicket ? `${nextTicket.status === 'in-progress' ? 'Resume' : 'Start'} ticket ${nextTicket.id}` : `Start ${workflow.stages.find(candidate => candidate.id === stage?.stageId)?.name ?? 'work'}`;

  return <Overlay title={`${item.id} ${item.title}`} className="pb-item-drawer" onClose={onClose}>
    <header className="pb-item-header"><div className="pb-eyebrow"><span>{item.type}</span><span>/</span><code>{item.id}</code><span className="pb-milestone-tag">{item.milestoneId ?? 'No milestone'}</span></div><h2>{item.title}</h2><div className="pb-item-branch"><GitBranch size={13} /><code>{item.branch ?? 'Branch created on first run'}</code>{item.pr && <a href={item.pr.url} target="_blank" rel="noreferrer">PR #{item.pr.number} ↗</a>}</div>{item.worktree && <p className="pb-path">{item.worktree}</p>}</header>
    <div className="pb-stage-rail" aria-label="Workflow stages">{workflow.stages.map((definition, index) => {
      const current = item.stages.find(candidate => candidate.stageId === definition.id)!;
      return <div key={definition.id} className={`pb-rail-stage ${current.stageId === stage?.stageId ? 'pb-rail-active' : ''}`}><div title={current.approvedBy ? `Approved by ${current.approvedBy} · ${current.approvedCommit}` : current.status}><StatusIcon status={current.status} /><span>{definition.name}</span><small>{index + 1}</small></div><AgentPicker value={current.agent ?? definition.defaultAgent} label={`Agent for ${definition.name}`} onChange={value => actions.setStageAgent(item.id, definition.id, value)} />{current.approvedCommit && <code className="pb-rail-commit">{current.approvedCommit}</code>}</div>;
    })}</div>
    {!previewStage && <div className="pb-next-action"><div><span className="pb-section-label">{isShipped(item) ? 'DELIVERED' : live ? 'IN FLIGHT' : 'UP NEXT'}</span><p>{item.nextAction}</p></div><button className="pb-button pb-primary" onClick={nextAction} disabled={isShipped(item) || (!stage && !live)}>{live ? <span className="pb-pulse" /> : <Play size={12} />}{actionLabel}<ArrowRight size={13} /></button></div>}
    <nav className="pb-tabs" aria-label="Work item tabs">{['Overview', 'Spec', 'Runs', 'Files'].map(name => <button key={name} className={!previewStage && tab === name ? 'pb-tab-active' : ''} aria-pressed={!previewStage && tab === name} onClick={() => { setTab(name); setPreviewStage(undefined); }}>{name}{name === 'Runs' && <span>{runs.length}</span>}</button>)}</nav>
    <div className="pb-drawer-content">
      {brief && <section className="pb-brief"><button className="pb-text-button" onClick={() => setPreviewStage(undefined)}><ArrowLeft size={13} />Back to work item</button><div className="pb-brief-title"><div className="pb-eyebrow">CONTEXT TRAVELS WITH THE WORK</div><h3>{brief.lastHandoff ? 'Resume' : 'Start'} {ticketId ? `ticket ${ticketId}` : workflow.stages.find(candidate => candidate.id === previewStage)?.name}</h3><p className="pb-muted">A new agent. The same project knowledge. Review what gets sent.</p></div><div className="pb-brief-agent"><label>Run with</label><AgentPicker value={agent} label="Agent for this run" onChange={setAgent} /><span className="pb-muted">ACP · available locally</span></div>
        {brief.changedSince.length > 0 && <div className="pb-warning"><Clock3 size={16} /><div><strong>Changed since the last run</strong>{brief.changedSince.map(change => <p key={change}>{change}</p>)}</div></div>}
        <div className="pb-section-heading"><FileText size={14} /><h4>Read-first pointers</h4><span>{brief.pointers.length} files</span></div><div className="pb-pointer-list">{brief.pointers.map(pointer => <div key={pointer.path}><code>{pointer.path}</code><span>{pointer.why}</span></div>)}</div>
        {brief.lastHandoff && <div className="pb-handoff pb-handoff-stopped"><div className="pb-section-label"><AgentBadge agent={brief.lastHandoff.agent} avatar /><span>Last handoff · <code>{brief.lastHandoff.runId}</code></span></div><p>{brief.lastHandoff.handoff.stoppedAt}</p><ul>{brief.lastHandoff.handoff.unresolved.map(text => <li key={text}>{text}</li>)}</ul><code className="pb-handoff-next">{brief.lastHandoff.handoff.suggestedNext}</code></div>}
        {!brief.changedSince.length && <p className="pb-muted">Changed since: no changed artifacts recorded.</p>}
        <details className="pb-exact-prompt"><summary><Terminal size={14} />Exact prompt sent to {state.agents.find(candidate => candidate.id === agent)?.name}<ChevronDown size={13} /></summary><pre>{brief.prompt}</pre></details><div className="pb-brief-start"><span className="pb-muted">Uses {item.worktree ?? `../ledgerly-worktrees/${item.slug}`}</span><button className="pb-button pb-primary" disabled={!!live} onClick={() => { try { const id = actions.startRun({ itemId: item.id, stageId: brief.stageId, ticketId, agent }); setRunId(id); setTab('Runs'); setPreviewStage(undefined); } catch (error) { setStartError(error instanceof Error ? error.message : 'This stage is not ready to run.'); } }}><Play size={13} />Start run<ArrowRight size={13} /></button></div>{startError && <p className="pb-danger" role="alert">{startError}</p>}
      </section>}
      {!brief && tab === 'Overview' && <>
        <div className="pb-section-heading"><ListChecks size={16} /><h3>Implementation plan</h3><span>{complete}/{item.tickets.length} resolved</span></div>
        {readyApproval && stage?.stageId === 'tickets' && <div className="pb-approval-bar"><p>Review the blocking order before implementation starts.</p><button className="pb-button pb-primary" onClick={() => actions.approveStage(item.id, 'tickets')}><Check size={13} />Approve tickets</button></div>}
        {item.tickets.length ? <div className="pb-ticket-list">{item.tickets.map(ticket => {
          const blocked = ticket.blockedBy.filter(id => item.tickets.find(candidate => candidate.id === id)?.status !== 'resolved');
          return <details key={ticket.id} className={`pb-ticket ${ticket.status === 'resolved' ? 'pb-ticket-resolved' : ''} ${!blocked.length && ticket.status === 'open' ? 'pb-ticket-ready' : ''}`}><summary><span className="pb-ticket-track"><StatusIcon status={blocked.length ? 'blocked' : ticket.status} /></span><span className="pb-ticket-number">{ticket.id}</span><span className="pb-ticket-title">{ticket.title}<small>{blocked.length ? `Blocked by ${blocked.map(id => `${id} · ${item.tickets.find(candidate => candidate.id === id)?.title}`).join('; ')}` : ticket.status === 'resolved' ? 'Resolved' : ticket.status === 'in-progress' ? 'In progress · handoff available' : 'Ready to start'}</small></span>{ticket.agent && <AgentBadge agent={ticket.agent} avatar showName={false} />}<ChevronDown size={13} /></summary><div className="pb-ticket-body"><p className="pb-path">{ticket.path}</p><MarkdownView content={ticket.body} />{ticket.comments.length > 0 && <div className="pb-ticket-comments">{ticket.comments.map((comment, index) => <div key={index}><strong>{comment.author}</strong><span>{relativeTime(comment.at, state.now)}</span><p>{comment.text}</p></div>)}</div>}{!blocked.length && ticket.status !== 'resolved' && stage?.stageId === 'implement' && <button className="pb-button" onClick={() => preview('implement', ticket)} disabled={!!live}><Play size={12} />Preview & {ticket.status === 'in-progress' ? 'resume' : 'start'} ticket {ticket.id}</button>}</div></details>;
        })}</div> : <div className="pb-empty-inline"><ListChecks size={20} /><p>{item.type === 'feature' ? 'Tickets appear after the spec is approved and the task plan is drafted.' : 'This workflow goes straight from diagnosis or work to review.'}</p></div>}
        {stopped && <section className="pb-recent-handoff"><div className="pb-section-heading"><RotateCcw size={14} /><h3>Where the last agent left off</h3><button className="pb-text-button" onClick={() => { setRunId(stopped.id); setTab('Runs'); }}>View {stopped.id}<ArrowRight size={12} /></button></div><HandoffCard run={stopped} /></section>}
        <div className="pb-section-heading"><FileText size={14} /><h3>Working files</h3></div>{item.artifacts.map(file => <button key={file.path} className="pb-file-row" onClick={() => setTab(file.kind === 'spec' ? 'Spec' : 'Files')}><FileText size={14} /><div><strong>{file.title}</strong><code>{file.path}</code></div>{file.changedSinceLastRun && <span className="pb-tag pb-attention">Changed</span>}<ArrowRight size={13} /></button>)}{!item.artifacts.length && <p className="pb-muted">No artifacts yet. The first run will use AGENTS.md and the project’s decisions.</p>}
      </>}
      {!brief && tab === 'Spec' && <>{item.artifacts.filter(file => file.kind === 'spec').map(file => <section key={file.path}><div className="pb-document-heading"><FileText size={15} /><code>{file.path}</code>{file.changedSinceLastRun && <span className="pb-tag pb-attention">Changed since last run</span>}</div><MarkdownView content={file.content} />{readyApproval && stage?.stageId === 'spec' && <div className="pb-approval-bar"><span className="pb-muted">Approval moves this item to Tickets.</span><button className="pb-button pb-primary" onClick={() => actions.approveStage(item.id, 'spec')}><Check size={14} />Approve spec</button></div>}</section>)}{!item.artifacts.some(file => file.kind === 'spec') && <div className="pb-empty-state"><FileText size={28} /><h3>No spec yet</h3><p>Clarify the problem first. Your agent will draft the spec here.</p></div>}</>}
      {!brief && tab === 'Runs' && <>{runs.length > 0 ? <><div className="pb-run-history" aria-label="Run history">{runs.map(run => <button key={run.id} className={selectedRun?.id === run.id ? 'pb-selected' : ''} onClick={() => setRunId(run.id)}><StatusIcon status={run.status} /><span><code>{run.id}</code> · {run.agent}<small>{run.ticketId ? `Ticket ${run.ticketId}` : run.stageId} · {run.status} · {relativeTime(run.startedAt, state.now)}</small></span></button>)}</div>{selectedRun && <RunStream key={selectedRun.id} run={selectedRun} item={item} onReview={onReview} />}</> : <div className="pb-empty-state"><Terminal size={28} /><h3>No runs yet</h3><p>Start with the next action. Each session leaves a handoff.</p><button className="pb-button pb-primary" onClick={nextAction}>Preview first run<ArrowRight size={13} /></button></div>}</>}
      {!brief && tab === 'Files' && <><div className="pb-section-heading"><FileText size={15} /><h3>Files are the source of truth</h3></div><p className="pb-muted pb-files-intro">Work item artifacts, Markdown tickets, and the project context carried into every run.</p>{[...item.artifacts, ...item.tickets.map(ticket => ({ path: ticket.path, title: `Ticket ${ticket.id} · ${ticket.title}`, content: ticket.body })), agentsArtifact, ...state.adrs, { path: 'GLOSSARY.md', title: 'Domain glossary', content: state.glossary.map(entry => `## ${entry.term}\n${entry.definition}`).join('\n\n') }].map(file => <details key={file.path} className="pb-file-details"><summary><FileText size={14} /><span><strong>{file.title}</strong><code>{file.path}</code></span><ChevronDown size={13} /></summary><MarkdownView content={file.content} /></details>)}<div className="pb-section-heading"><FileCode2 size={14} /><h3>Source files touched in runs</h3></div>{[...new Set(runs.flatMap(run => run.events.flatMap(event => event.kind === 'file' ? [event.path] : [])))].map(path => <p key={path} className="pb-source-path"><FileCode2 size={13} /><code>{path}</code></p>)}</>}
    </div>
    <footer className="pb-drawer-footer"><span><LockKeyhole size={11} />Local Markdown tracker</span><span><Kbd>esc</Kbd> to return to Pipeline</span></footer>
  </Overlay>;
}

export function ReviewOverlay({ item, onClose, onRerun }: { item: WorkItem; onClose: () => void; onRerun: () => void }) {
  const { actions, select } = useWorkbench();
  const review = select.review(item.id);
  const live = select.activeRun(item.id);
  const [fileFilter, setFileFilter] = useState('all');
  const [findingFilter, setFindingFilter] = useState<'all' | 'open'>('all');
  const pending = select.needsYou().filter(entry => entry.itemId === item.id && entry.kind === 'permission');
  const stale = !!review && review.commit !== review.checksCommit;
  const unresolved = review?.findings.filter(finding => ['open', 'sent-back'].includes(finding.status)) ?? [];
  const checksPass = !!review?.checks.length && review.checks.every(check => check.status === 'pass');
  const implementationDone = item.stages.filter(stage => !['review', 'ship'].includes(stage.stageId)).every(stage => ['done', 'skipped'].includes(stage.status));
  const mergeReady = !!item.pr && !isShipped(item) && implementationDone && !live && !stale && checksPass && !unresolved.length;
  const reason = isShipped(item) ? 'Already merged' : live ? 'Finish or stop the live review first' : !implementationDone ? 'Finish implementation before merging' : stale ? 'Re-review the new commit before merging' : !checksPass ? 'All checks must pass before merging' : unresolved.length ? 'Resolve or accept every finding before merging' : !item.pr ? 'Run Ship to prepare a pull request first' : 'Approve this review and merge the pull request';
  const diff = useRef<HTMLDivElement>(null);

  function findingCard(finding: Finding, pinned = false) {
    return <article key={finding.id} id={pinned ? `pb-pinned-${finding.id}` : undefined} className={`pb-finding ${pinned ? 'pb-finding-pinned' : ''} pb-finding-${finding.status}`}><div className="pb-finding-meta"><span className={`pb-severity pb-severity-${finding.severity}`}>{finding.severity}</span><span>{finding.axis}</span><span className="pb-finding-state">{finding.status}</span></div><h3>{finding.title}</h3><p>{finding.body}</p><code className="pb-finding-path">{finding.path}:{finding.line}</code><div className="pb-finding-actions"><AgentBadge agent={finding.agent} showName={false} avatar />{['open', 'sent-back'].includes(finding.status) ? <><button disabled={stale || isShipped(item)} title={stale ? 'This finding belongs to an older commit. Re-review first.' : undefined} onClick={() => actions.setFindingStatus(finding.id, 'resolved')}><Check size={12} />Resolve</button><button disabled={stale || isShipped(item)} onClick={() => actions.setFindingStatus(finding.id, 'accepted')}>Accept risk</button></> : <button disabled={stale || isShipped(item)} onClick={() => actions.setFindingStatus(finding.id, 'open')}>Reopen</button>}{!pinned && <button onClick={() => { setFileFilter('all'); requestAnimationFrame(() => diff.current?.querySelector(`#pb-pinned-${finding.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })); }}>Jump to line<ArrowRight size={12} /></button>}</div></article>;
  }

  return <Overlay title={`Review ${item.id}`} className="pb-review" onClose={onClose}><header className="pb-review-header"><div><div className="pb-eyebrow"><ShieldCheck size={13} />REVIEW / {item.id}{item.pr && <span> / PR #{item.pr.number}</span>}</div><h2>{item.title}</h2><div className="pb-review-branch"><GitBranch size={12} /><code>{review?.branch ?? item.branch}</code><ArrowRight size={12} /><code>{review?.baseBranch ?? 'main'}</code></div></div><div className="pb-review-header-actions"><button className="pb-button" disabled={isShipped(item) || !implementationDone} onClick={() => { actions.sendBack(item.id); onClose(); }}><RotateCcw size={13} />Send back</button><button className="pb-button pb-primary" disabled={!mergeReady} title={reason} onClick={() => { if (!mergeReady) return; if (item.stages.find(stage => stage.stageId === 'review')?.status !== 'done') actions.approveStage(item.id, 'review'); actions.merge(item.id); onClose(); }}><GitMerge size={14} />{isShipped(item) ? 'Merged' : 'Merge'}{item.pr ? ` #${item.pr.number}` : ''}</button></div></header>
    {stale && <div className="pb-review-stale" role="alert"><Clock3 size={18} /><div><strong>Evidence is stale — passing checks are not a fresh review.</strong><p>Diff and findings: <code>{review?.commit}</code> · refreshed checks: <code>{review?.checksCommit}</code>. Re-review the new commit before approval or merge.</p></div><button className="pb-button" disabled={!!live} onClick={onRerun}><RotateCcw size={13} />Re-review {review?.checksCommit}</button></div>}
    {!review && <div className="pb-empty-state"><ShieldCheck size={28} /><h3>No review evidence yet</h3><p>Run a review to collect a diff and commit-scoped checks.</p><button className="pb-button pb-primary" onClick={onRerun}>Preview review run<ArrowRight size={13} /></button></div>}
    {review && <div className="pb-review-grid"><aside className="pb-review-files"><div className="pb-section-label">CHANGED FILES <span>{review.files.length}</span></div><button className={fileFilter === 'all' ? 'pb-selected' : ''} onClick={() => setFileFilter('all')}><FileCode2 size={13} />All files</button>{review.files.map(file => <button key={file.path} className={fileFilter === file.path ? 'pb-selected' : ''} onClick={() => setFileFilter(file.path)}><FileCode2 size={13} /><span>{file.path.split('/').at(-1)}<small>{file.path}</small></span><span className="pb-success">+{file.added}</span></button>)}<div className="pb-review-scope"><span className="pb-section-label">REVIEWED COMMIT</span><code>{review.commit}</code><p>{stale ? 'Historical diff. New checks do not certify these findings.' : 'Findings and checks belong to this exact commit.'}</p><p className="pb-path">.scratch/{item.slug}/spec.md</p></div></aside>
      <div className="pb-review-diff" ref={diff}><div className="pb-diff-heading"><span><FileCode2 size={14} />Diff against {review.baseBranch}</span><code>{review.commit}</code></div>{review.files.length ? <DiffView files={review.files.filter(file => fileFilter === 'all' || file.path === fileFilter)} renderLineContent={(line, path) => review.findings.filter(finding => finding.path === path && finding.line === line).map(finding => findingCard(finding, true))} /> : <div className="pb-empty-inline"><p>The simulator provided checks but no diff for this work item.</p></div>}</div>
      <aside className="pb-review-evidence">{pending.map(entry => <InboxCard key={entry.id} entry={entry} />)}<section className="pb-checks"><div className="pb-section-heading"><ShieldCheck size={14} /><h3>Commit checks</h3><code>{review.checksCommit}</code></div>{review.checks.map(check => <div key={check.name} className="pb-check"><StatusIcon status={check.status} /><span><strong>{check.name}</strong><small>{check.detail}</small></span><span>{check.durationSec}s</span></div>)}<p className="pb-evidence-note">{reason}{live && <span className="pb-live-review"><span className="pb-pulse" />{live.id} · {live.status}</span>}</p>{!live && !isShipped(item) && !stale && <button className="pb-text-button" onClick={onRerun}><RotateCcw size={12} />Run review again</button>}</section><div className="pb-findings-heading"><h3>Findings <span>{review.findings.length}</span></h3><button aria-pressed={findingFilter === 'open'} onClick={() => setFindingFilter(value => value === 'all' ? 'open' : 'all')}>{findingFilter === 'open' ? 'Show all' : 'Open only'}</button></div>{review.findings.filter(finding => findingFilter === 'all' || ['open', 'sent-back'].includes(finding.status)).map(finding => findingCard(finding))}{!review.findings.length && <div className="pb-no-findings"><CheckCheck size={24} /><strong>No open findings</strong><p>This commit has a fresh review. Check the evidence, then merge.</p></div>}<details className="pb-review-spec"><summary><FileText size={13} />Acceptance criteria<ChevronDown size={12} /></summary>{item.artifacts.filter(file => file.kind === 'spec').map(file => <div key={file.path}><code className="pb-path">{file.path}</code><MarkdownView content={file.content} /></div>)}</details></aside>
    </div>}
    <footer className="pb-review-footer"><span><LockKeyhole size={11} />Merge requires current evidence, passing checks, and no unresolved findings.</span><span><Kbd>esc</Kbd>Back to Pipeline</span></footer>
  </Overlay>;
}
