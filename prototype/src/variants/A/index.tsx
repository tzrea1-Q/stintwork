import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Command, FileCode2, FileText, FolderGit2, GitBranch, GitMerge, GitPullRequest, Inbox, Layers2, ListFilter, LockKeyhole, Play, Plus, Search, ShieldCheck, Square, Terminal, X } from 'lucide-react';
import { useWorkbench, type StartRunInput } from '../../proto/store';
import { agentsArtifact } from '../../proto/data';
import type { AgentId, Artifact, Brief, Finding, InboxEntry, InboxKind, ItemType, Run, RunEvent, WorkItem } from '../../proto/types';
import { AgentBadge, CommandPalette, DiffView, Kbd, MarkdownView, StatusIcon, TerminalView, relativeTime, type PaletteCommand } from '../../proto/ui';
import './styles.css';

export const variantName = 'Lists';

type Page = { kind: 'needs' | 'project' } | { kind: 'item' | 'review'; itemId: string } | { kind: 'run'; runId: string };
type Navigate = (page: Page) => void;
type Tab = 'Spec' | 'Tickets' | 'Runs' | 'Files';
const kinds: InboxKind[] = ['question', 'permission', 'approval', 'review', 'memory'];
const kindLabels = { question: 'Questions', permission: 'Permissions', approval: 'Approvals', review: 'Reviews', memory: 'Memory proposals' };
const kindIcons = { question: CircleHelp, permission: LockKeyhole, approval: FileText, review: GitPullRequest, memory: Layers2 };
const isShipped = (item: WorkItem) => item.pr?.state === 'merged' || item.stages.every(stage => stage.status === 'done' || stage.status === 'skipped');
const currentStage = (item: WorkItem) => item.stages.find(stage => stage.status === 'active') ?? item.stages.find(stage => stage.status === 'waiting') ?? item.stages.find(stage => stage.status === 'todo');
const blockedBy = (item: WorkItem, ticket: WorkItem['tickets'][number]) => ticket.blockedBy.filter(id => item.tickets.find(candidate => candidate.id === id)?.status !== 'resolved');
const isTyping = (target: EventTarget | null) => target instanceof Element && !!target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [cmdk-dialog]');

function useListKeys(ids: string[], selected: string, setSelected: (id: string) => void, open: (id: string) => void) {
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target) || document.querySelector('[cmdk-dialog], .lists-dialog')) return;
      if (!ids.length) return;
      const index = Math.max(0, ids.indexOf(selected));
      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        const id = ids[Math.max(0, Math.min(ids.length - 1, index + (event.key === 'j' ? 1 : -1)))];
        setSelected(id);
        document.querySelector<HTMLElement>('.lists-main')?.focus({ preventScroll: true });
        document.querySelector<HTMLElement>(`[data-list-row="${id}"]`)?.scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'Enter' && (!(event.target instanceof Element && event.target.closest('button, a, summary')) || event.target instanceof Element && event.target.closest('.lists-inbox-row-main'))) {
        event.preventDefault();
        open(ids[index]);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [ids.join('|'), selected, setSelected, open]);
}

function AgentPicker({ value, onChange, label }: { value?: AgentId; onChange: (agent: AgentId) => void; label: string }) {
  const { state } = useWorkbench();
  return <span className="lists-agent-picker"><AgentBadge agent={value ?? 'claude'} showName={false} /><select aria-label={label} value={value ?? 'claude'} onChange={event => onChange(event.target.value as AgentId)}>{state.agents.map(agent => <option key={agent.id} value={agent.id} disabled={!agent.available}>{agent.name}{!agent.available ? ` — ${agent.note}` : ''}</option>)}</select><ChevronDown size={11} /></span>;
}

function HandoffCard({ handoff, title = 'Handoff' }: { handoff: NonNullable<Run['handoff']>; title?: string }) {
  return <section className="lists-handoff"><div className="lists-eyebrow"><ArrowRight size={13} />{title}</div><p>{handoff.stoppedAt}</p>{handoff.unresolved.length > 0 && <><h4>Still unresolved</h4><ul>{handoff.unresolved.map(text => <li key={text}>{text}</li>)}</ul></>}<h4>Suggested next</h4><code>{handoff.suggestedNext}</code></section>;
}

function Modal({ title, subtitle, children, footer, onClose }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; onClose: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (container.current?.querySelector<HTMLElement>('.lists-field input, .lists-resume-agent select') ?? container.current?.querySelector<HTMLElement>('button, input, select, textarea'))?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = [...(container.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, a[href], [tabindex="0"]') ?? [])];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown, true);
    return () => { document.removeEventListener('keydown', keydown, true); previous?.isConnected && previous.focus(); };
  }, []);
  return <div className="lists-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="lists-dialog" ref={container} role="dialog" aria-modal="true" aria-labelledby="lists-dialog-title"><header><div><h2 id="lists-dialog-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="lists-icon-button" onClick={onClose} aria-label="Close dialog"><X size={16} /></button></header><div className="lists-dialog-content">{children}</div>{footer && <footer>{footer}</footer>}</div></div>;
}

function ResumeDialog({ input, onClose, onStarted }: { input: StartRunInput; onClose: () => void; onStarted: (id: string) => void }) {
  const { state, actions, select } = useWorkbench();
  const [agent, setAgent] = useState(input.agent);
  const [error, setError] = useState('');
  const brief = select.brief({ ...input, agent });
  const item = select.item(input.itemId)!;
  const activeRun = select.activeRun(item.id);
  const stage = select.workflow(item).stages.find(stage => stage.id === input.stageId)!;
  const lastAgent = brief.lastHandoff?.agent;
  function start() {
    try { onStarted(actions.startRun({ ...input, agent })); } catch (error) { setError(error instanceof Error ? error.message : 'Unable to start this run.'); }
  }
  return <Modal title={`${brief.lastHandoff ? 'Resume' : 'Start'} ${input.ticketId ? `ticket ${input.ticketId}` : stage.name}`} subtitle={`${item.id} · ${item.title}`} onClose={onClose} footer={<><span className="lists-muted">Brief in. Handoff out. Nothing lost.</span><button className="lists-button" onClick={onClose}>Cancel</button><button className="lists-button primary" disabled={!!activeRun} onClick={start}><Play size={13} />Start run<ArrowRight size={13} /></button></>}>
    <div className="lists-resume-agent"><div><span className="lists-eyebrow">Run with</span><p>{lastAgent && agent !== lastAgent ? 'A different agent. The same project context.' : 'Choose the agent for this session.'}</p></div><AgentPicker value={agent} onChange={setAgent} label="Agent for new run" /></div>
    {activeRun && <div className="lists-warning">A run is already active. Open {activeRun.id} before starting another.</div>}
    {error && <div className="lists-warning" role="alert">{error}</div>}
    <BriefContent brief={brief} />
    <div className="lists-muted lists-small">Gemini CLI unavailable — {state.agents.find(agent => agent.id === 'gemini')?.note}. No installation required for the other detected agents.</div>
  </Modal>;
}

function BriefContent({ brief }: { brief: Brief }) {
  return <div className="lists-brief"><h3>Context pointers <span className="lists-count">{brief.pointers.length}</span></h3><p className="lists-muted">Read from the repo, not a copied conversation.</p><div className="lists-pointers">{brief.pointers.map(pointer => <div key={pointer.path}><FileText size={13} /><div><code>{pointer.path}</code><p>{pointer.why}</p></div></div>)}</div>{brief.lastHandoff && <HandoffCard handoff={brief.lastHandoff.handoff} title={`Last handoff · ${brief.lastHandoff.runId} · ${brief.lastHandoff.agent}`} />}{brief.changedSince.length > 0 && <div className="lists-warning"><strong>Changed since the last run</strong>{brief.changedSince.map(change => <p key={change}>{change}</p>)}</div>}<details className="lists-prompt" open><summary>Exact prompt <span className="lists-muted">sent to the selected agent</span></summary><pre>{brief.prompt}</pre></details></div>;
}

function NewItemDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { actions } = useWorkbench();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ItemType>('feature');
  return <Modal title="New work item" subtitle="Start small. The workflow follows the work." onClose={onClose} footer={<><span className="lists-muted">Files live in .scratch/&lt;slug&gt;/</span><button className="lists-button" onClick={onClose}>Cancel</button><button type="submit" form="lists-new-item" disabled={!title.trim()} className="lists-button primary">Create work item<ArrowRight size={13} /></button></>}><form id="lists-new-item" onSubmit={event => { event.preventDefault(); if (!title.trim()) return; actions.createItem({ title: title.trim(), type }); onCreated(); }}><label className="lists-field">Title<input autoFocus placeholder="What would you like to build or fix?" value={title} onChange={event => setTitle(event.target.value)} maxLength={160} required /></label><label className="lists-field">Type<select value={type} onChange={event => setType(event.target.value as ItemType)}><option value="feature">Feature · Clarify → Ship</option><option value="bug">Bug · Diagnose → Ship</option><option value="quick">Quick task · Do → Ship</option></select></label><p className="lists-muted">Created in Project → Unassigned. No agent starts until you choose one.</p></form></Modal>;
}

export default function Variant() {
  const { state, actions, select } = useWorkbench();
  const [history, setHistory] = useState<Page[]>([{ kind: 'needs' }]);
  const [resume, setResume] = useState<StartRunInput>();
  const [newItem, setNewItem] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const requestedPage = history.at(-1)!;
  const page: Page = 'itemId' in requestedPage && !select.item(requestedPage.itemId) ? { kind: 'project' } : requestedPage;
  const needs = select.needsYou();
  const navigate: Navigate = next => setHistory(previous => [...previous, next]);
  const back = () => setHistory(previous => previous.length > 1 ? previous.slice(0, -1) : [{ kind: 'project' }]);
  const selectedItemId = 'itemId' in page ? page.itemId : page.kind === 'run' ? state.runs.find(run => run.id === page.runId)?.itemId : undefined;
  function prepareRun(item: WorkItem, stageId?: string, ticketId?: string) {
    const stage = stageId ? item.stages.find(stage => stage.stageId === stageId) : currentStage(item);
    if (!stage) return;
    const ticket = ticketId ? item.tickets.find(ticket => ticket.id === ticketId) : stage.stageId === 'implement' ? item.tickets.find(ticket => ticket.status !== 'resolved' && !blockedBy(item, ticket).length) : undefined;
    setResume({ itemId: item.id, stageId: stage.stageId, ticketId: ticket?.id, agent: stage.agent ?? 'claude' });
  }
  function nextAction(item: WorkItem) {
    const stage = currentStage(item);
    if (stage?.stageId === 'review' && select.review(item.id)) { navigate({ kind: 'review', itemId: item.id }); return; }
    const run = select.activeRun(item.id);
    if (run) { navigate({ kind: 'run', runId: run.id }); return; }
    if (stage?.stageId === 'ship' && item.pr) { actions.merge(item.id); return; }
    if (stage?.status === 'waiting' && select.workflow(item).stages.find(definition => definition.id === stage.stageId)?.gate === 'approve') { actions.approveStage(item.id, stage.stageId); return; }
    prepareRun(item);
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || paletteOpen || newItem || resume) return;
      if (event.key === 'Escape' && !isTyping(event.target)) { event.preventDefault(); back(); }
      else if (event.key.toLowerCase() === 'c' && !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping(event.target)) { event.preventDefault(); setNewItem(true); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [paletteOpen, newItem, resume]);
  const commands: PaletteCommand[] = [
    { id: 'needs', group: 'Navigate', label: `Needs you · ${needs.length} pending`, run: () => navigate({ kind: 'needs' }) },
    { id: 'project', group: 'Navigate', label: 'Project · all milestones', run: () => navigate({ kind: 'project' }) },
    { id: 'create', group: 'Actions', label: 'Create new work item', shortcut: 'c', run: () => setNewItem(true) },
    ...state.items.map(item => ({ id: item.id, group: 'Work items', label: `${item.id} · ${item.title}`, run: () => navigate({ kind: 'item', itemId: item.id }) })),
    ...state.items.filter(item => !isShipped(item)).map(item => ({ id: `next-${item.id}`, group: 'Actions', label: `${item.id} · ${item.nextAction}`, run: () => nextAction(item) })),
    ...state.runs.filter(run => run.status === 'running' || run.status === 'waiting').map(run => ({ id: `stop-${run.id}`, group: 'Actions', label: `Stop ${run.id} · ${run.agent}`, run: () => actions.stopRun(run.id) })),
  ];
  return <div className="lists-app">
    <aside className="lists-sidebar" aria-label="Project navigation">
      <button className="lists-project-switcher" onClick={() => navigate({ kind: 'project' })}><span className="lists-logo"><Layers2 size={17} /></span><strong>{state.project.name} <span>· {state.project.branch}</span></strong><ChevronDown size={13} /></button>
      <div className="lists-sidebar-scroll"><div className="lists-sidebar-heading">Workspace <span>LOCAL</span></div><button className={`lists-nav-row ${page.kind === 'needs' ? 'active' : ''}`} onClick={() => navigate({ kind: 'needs' })}><Inbox size={15} /><span>Needs you</span><span className="lists-count accent">{needs.length}</span></button><button className={`lists-nav-row ${page.kind === 'project' ? 'active' : ''}`} onClick={() => navigate({ kind: 'project' })}><FolderGit2 size={15} /><span>Project</span></button>
        <div className="lists-sidebar-heading">Milestones<button className="lists-icon-button" aria-label="Create new work item" onClick={() => setNewItem(true)}><Plus size={13} /></button></div>
        {[...state.milestones.filter(milestone => milestone.status === 'active'), ...state.milestones.filter(milestone => milestone.status === 'planned'), ...state.milestones.filter(milestone => milestone.status === 'shipped')].map(milestone => <div className="lists-sidebar-group" key={milestone.id}><div className="lists-milestone-label"><ChevronDown size={11} />{milestone.name}<span>{state.items.filter(item => item.milestoneId === milestone.id).length}</span></div>{state.items.filter(item => item.milestoneId === milestone.id).map(item => <button key={item.id} className={`lists-nav-row item ${selectedItemId === item.id ? 'active' : ''} ${isShipped(item) ? 'shipped' : ''}`} onClick={() => navigate({ kind: 'item', itemId: item.id })} title={`${item.id} · ${item.title}`}><StatusIcon status={isShipped(item) ? 'shipped' : currentStage(item)?.status ?? 'todo'} size={13} /><span>{item.title}</span>{select.activeRun(item.id)?.status === 'running' && <span className="lists-pulse" />}</button>)}</div>)}
        {state.items.some(item => !item.milestoneId) && <div className="lists-sidebar-group"><div className="lists-milestone-label"><ChevronDown size={11} />Unassigned</div>{state.items.filter(item => !item.milestoneId).map(item => <button key={item.id} className={`lists-nav-row item ${selectedItemId === item.id ? 'active' : ''}`} onClick={() => navigate({ kind: 'item', itemId: item.id })}><StatusIcon status={currentStage(item)?.status ?? 'todo'} size={13} /><span>{item.title}</span></button>)}</div>}
        <div className="lists-sidebar-heading agents-heading">Agents <span>DETECTED</span></div>{state.agents.map(agent => <div className={`lists-agent-row ${!agent.available ? 'unavailable' : ''}`} key={agent.id}><AgentBadge agent={agent} /><span>{agent.available ? <span className="lists-available-dot" /> : 'unavailable'}</span>{!agent.available && <small>{agent.note}</small>}</div>)}
      </div><footer className="lists-sidebar-footer"><button onClick={() => setPaletteOpen(true)}><Search size={14} /><span>Search anything</span><Kbd>⌘K</Kbd></button><div><span className="lists-available-dot" />Local files · source of truth</div></footer>
    </aside>
    <main className="lists-main" tabIndex={-1}>
      <div className="lists-topbar"><div><span className="lists-project-dot" />{state.project.name}<ChevronRight size={12} /><span>{page.kind === 'needs' ? 'Needs you' : page.kind === 'project' ? 'Project' : page.kind === 'review' ? `${selectedItemId} / Review` : page.kind === 'run' ? `${selectedItemId} / ${page.runId}` : selectedItemId}</span></div><div><span className="lists-top-path">{state.project.path}</span><button className="lists-icon-button" onClick={() => setNewItem(true)} aria-label="New work item"><Plus size={15} /></button><button className="lists-icon-button" onClick={() => setPaletteOpen(true)} aria-label="Open command palette"><Command size={14} /></button></div></div>
      {page.kind === 'needs' && <NeedsView navigate={navigate} />}
      {page.kind === 'project' && <ProjectView navigate={navigate} create={() => setNewItem(true)} />}
      {page.kind === 'item' && <ItemView key={page.itemId} itemId={page.itemId} navigate={navigate} back={back} nextAction={nextAction} prepareRun={prepareRun} />}
      {page.kind === 'run' && <RunView key={page.runId} runId={page.runId} navigate={navigate} back={back} prepareRun={prepareRun} />}
      {page.kind === 'review' && <ReviewView key={page.itemId} itemId={page.itemId} navigate={navigate} back={back} prepareRun={prepareRun} />}
    </main>
    {!newItem && !resume && <CommandPalette commands={commands} open={paletteOpen} onOpenChange={setPaletteOpen} />}
    {resume && select.item(resume.itemId) && <ResumeDialog input={resume} onClose={() => setResume(undefined)} onStarted={runId => { setResume(undefined); navigate({ kind: 'run', runId }); }} />}
    {newItem && <NewItemDialog onClose={() => setNewItem(false)} onCreated={() => { setNewItem(false); navigate({ kind: 'project' }); }} />}
  </div>;
}

function ListHints() {
  return <span className="lists-key-hints"><Kbd>j</Kbd><Kbd>k</Kbd><span>move</span><Kbd>↵</Kbd><span>open</span><Kbd>esc</Kbd><span>back</span></span>;
}

function EntryActions({ entry, navigate, compact = false }: { entry: InboxEntry; navigate: Navigate; compact?: boolean }) {
  const { actions, select } = useWorkbench();
  const [answer, setAnswer] = useState('');
  const item = select.item(entry.itemId)!;
  const busy = !!select.activeRun(item.id);
  if (entry.kind === 'question') return <div className={`lists-entry-actions ${compact ? 'compact' : ''}`}>
    {compact ? <button className="lists-button small" onClick={() => actions.answerQuestion(entry.id, entry.options?.[0]?.id ?? 'Keep history unchanged')}>Use recommended<Check size={12} /></button> : <><div className="lists-question-options">{entry.options?.map((option, index) => <button key={option.id} className="lists-answer-option" onClick={() => actions.answerQuestion(entry.id, option.id)}><span className="lists-option-number">{index + 1}</span><span>{option.label}{option.description && <small>{option.description}</small>}</span><ArrowRight size={13} /></button>)}</div>{entry.allowFreeText && <form onSubmit={event => { event.preventDefault(); if (answer.trim()) actions.answerQuestion(entry.id, answer); }}><label htmlFor={`answer-${entry.id}`} className="lists-eyebrow">Or give your own answer</label><textarea id={`answer-${entry.id}`} value={answer} onChange={event => setAnswer(event.target.value)} placeholder="Add a little more context…" rows={3} /><button className="lists-button primary" disabled={!answer.trim()} type="submit">Send answer<ArrowRight size={13} /></button></form>}</>}
  </div>;
  if (entry.kind === 'permission') return <div className="lists-entry-actions"><button className="lists-button primary small" onClick={() => actions.decidePermission(entry.id, true)}><Check size={12} />Allow command</button><button className="lists-button small" onClick={() => actions.decidePermission(entry.id, false)}>Deny</button></div>;
  if (entry.kind === 'approval') return <div className="lists-entry-actions"><button className="lists-button primary small" disabled={busy} onClick={() => actions.approveStage(entry.itemId, entry.stageId!)}><Check size={12} />Approve {entry.stageId}</button>{compact && <button className="lists-text-button" onClick={() => navigate({ kind: 'item', itemId: entry.itemId })}>Read spec<ArrowUpRight size={11} /></button>}</div>;
  if (entry.kind === 'memory') return <div className="lists-entry-actions"><button className="lists-button primary small" onClick={() => actions.decideProposal(entry.proposalId!, true)}><Check size={12} />Accept</button><button className="lists-button small" onClick={() => actions.decideProposal(entry.proposalId!, false)}>Reject</button></div>;
  return <button className="lists-button primary small" onClick={() => navigate({ kind: 'review', itemId: entry.itemId })}>Open review<ArrowRight size={13} /></button>;
}

function EntryDetail({ entry, navigate }: { entry: InboxEntry; navigate: Navigate }) {
  const { state, select } = useWorkbench();
  const item = select.item(entry.itemId)!;
  const proposal = state.proposals.find(proposal => proposal.id === entry.proposalId);
  const artifact = item.artifacts.find(artifact => artifact.kind === 'spec');
  const Icon = kindIcons[entry.kind];
  const review = select.review(item.id);
  return <section className="lists-entry-detail" key={entry.id} aria-label="Selected entry detail"><div className="lists-detail-meta"><span><Icon size={14} />{kindLabels[entry.kind].replace(/s$/, '')}</span>{entry.agent && <AgentBadge agent={entry.agent} />}</div><button className="lists-text-button lists-item-link" onClick={() => navigate({ kind: 'item', itemId: item.id })}><span>{item.id}</span>{item.title}<ArrowUpRight size={12} /></button><h2>{entry.title}</h2>{entry.detail && <p className="lists-muted">{entry.detail}</p>}
    {entry.kind === 'permission' && <><pre className="lists-command">$ {entry.command}</pre><div className="lists-note"><ShieldCheck size={16} /><span>This command runs locally in <code>{item.worktree ?? state.project.path}</code>. Your permission applies to this request only.</span></div></>}
    {entry.kind === 'approval' && artifact && <div className="lists-artifact-preview"><div className="lists-file-label"><FileText size={13} /><code>{artifact.path}</code></div><MarkdownView content={artifact.content} /></div>}
    {proposal && <><div className="lists-file-label"><FileText size={13} /><code>{proposal.target}</code></div><p className="lists-muted">Proposed by {proposal.agent} in {proposal.runId}. Nothing is written until you accept.</p><DiffView diff={proposal.diff} /></>}
    {entry.kind === 'review' && review && <div className="lists-review-summary"><div><GitBranch size={14} /><code>{review.commit}</code><span>{review.files.length} files changed</span></div>{review.checks.map(check => <div key={check.name}><StatusIcon status={check.status} /><span>{check.name}</span><span className={check.status === 'fail' ? 'lists-danger' : 'lists-muted'}>{check.status}</span></div>)}<p className="lists-muted">{review.findings.filter(finding => finding.status === 'open').length} open findings · standards & spec</p>{review.commit !== review.checksCommit && <div className="lists-warning">Review {review.commit} is stale. Checks now belong to {review.checksCommit}.</div>}</div>}
    <div className="lists-detail-action"><EntryActions entry={entry} navigate={navigate} /></div><div className="lists-detail-footnote">{entry.runId && <button className="lists-text-button" onClick={() => navigate({ kind: 'run', runId: entry.runId! })}>View {entry.runId}<ArrowUpRight size={12} /></button>}<span>{relativeTime(entry.createdAt, state.now)}</span></div>
  </section>;
}

function NeedsView({ navigate }: { navigate: Navigate }) {
  const { state, select } = useWorkbench();
  const entries = kinds.flatMap(kind => select.needsYou().filter(entry => entry.kind === kind));
  const [selected, setSelected] = useState(entries[0]?.id ?? '');
  const current = entries.find(entry => entry.id === selected) ?? entries[0];
  useListKeys(entries.map(entry => entry.id), current?.id ?? '', setSelected, id => { const entry = entries.find(entry => entry.id === id)!; navigate(entry.kind === 'review' ? { kind: 'review', itemId: entry.itemId } : { kind: 'item', itemId: entry.itemId }); });
  const counts = select.counts();
  return <div className="lists-view"><header className="lists-page-heading"><div><div className="lists-eyebrow">Your attention, in one place</div><h1>Needs you <span className="lists-count">{entries.length}</span></h1><p>Agents keep moving. You make the calls.</p></div><ListHints /></header><div className="lists-inbox-layout"><section className="lists-inbox-list" aria-label="Needs you entries"><div className="lists-list-toolbar"><span><Inbox size={13} />All pending</span><span>{state.inbox.filter(entry => entry.resolved).length} resolved this session</span></div>{entries.length === 0 ? <div className="lists-empty"><CheckCheck size={30} /><h2>You're all caught up</h2><p>The agents have what they need. Check Project for what's moving.</p><button className="lists-button" onClick={() => navigate({ kind: 'project' })}>Open project<ArrowRight size={13} /></button></div> : kinds.filter(kind => counts[kind]).map(kind => { const Icon = kindIcons[kind]; return <section key={kind}><h3 className="lists-group-heading"><Icon size={13} />{kindLabels[kind]}<span>{counts[kind]}</span></h3>{entries.filter(entry => entry.kind === kind).map(entry => <div key={entry.id} className={`lists-inbox-row ${current?.id === entry.id ? 'selected' : ''}`} data-list-row={entry.id}><button className="lists-inbox-row-main" aria-current={current?.id === entry.id} onClick={() => setSelected(entry.id)} onDoubleClick={() => navigate(entry.kind === 'review' ? { kind: 'review', itemId: entry.itemId } : { kind: 'item', itemId: entry.itemId })}><span className="lists-row-type"><Icon size={14} /></span><span className="lists-inbox-row-text"><strong>{entry.title}</strong><small><span className="lists-mono">{entry.itemId}</span><span>·</span>{select.item(entry.itemId)?.title}</small></span>{entry.agent && <AgentBadge agent={entry.agent} showName={false} avatar />}<span className="lists-inbox-time">{relativeTime(entry.createdAt, state.now)}</span></button>{current?.id === entry.id && <div className="lists-inline-actions"><EntryActions entry={entry} navigate={navigate} compact /></div>}</div>)}</section>; })}<div className="lists-list-bottom"><ShieldCheck size={13} />Only human decisions stop here. Everything else stays with the agents.</div></section><aside className="lists-inbox-pane">{current ? <EntryDetail entry={current} navigate={navigate} /> : <div className="lists-empty"><Inbox size={26} /><p>No decisions waiting for you.</p></div>}</aside></div></div>;
}

function ProjectView({ navigate, create }: { navigate: Navigate; create: () => void }) {
  const { state, select } = useWorkbench();
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState('F-12');
  const milestones = [...state.milestones.filter(milestone => milestone.status === 'active'), ...state.milestones.filter(milestone => milestone.status === 'planned'), ...state.milestones.filter(milestone => milestone.status === 'shipped'), { id: '', name: 'Unassigned', description: 'New work, ready to shape', status: 'planned' }];
  const visible = state.items.filter(item => `${item.id} ${item.title}`.toLowerCase().includes(filter.toLowerCase()));
  const ordered = milestones.flatMap(milestone => visible.filter(item => (item.milestoneId ?? '') === milestone.id));
  const selectedId = ordered.some(item => item.id === selected) ? selected : ordered[0]?.id ?? '';
  useListKeys(ordered.map(item => item.id), selectedId, setSelected, itemId => navigate({ kind: 'item', itemId }));
  const running = state.runs.filter(run => run.status === 'running').length;
  return <div className="lists-view"><header className="lists-page-heading"><div><div className="lists-eyebrow">{state.project.name} / Overview</div><h1>Project</h1><p>{state.items.filter(item => !isShipped(item)).length} in progress<span className="lists-separator">·</span>{isFinite(running) && running} running<span className="lists-separator">·</span>{state.items.filter(isShipped).length} shipped</p></div><button className="lists-button" onClick={create}><Plus size={13} />New work item<Kbd>c</Kbd></button></header><div className="lists-project-content"><div className="lists-project-toolbar"><label><Search size={14} /><input aria-label="Filter project items" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter by title or ID…" />{filter && <button aria-label="Clear filter" onClick={() => setFilter('')}><X size={12} /></button>}</label><ListHints /></div><div className="lists-project-columns"><span>Work item</span><span>Stage</span><span>Agents</span><span>Activity</span><span>Updated</span></div>{milestones.map(milestone => { const items = visible.filter(item => (item.milestoneId ?? '') === milestone.id); if (!items.length) return null; return <section className="lists-project-milestone" key={milestone.id}><div className="lists-project-milestone-heading"><StatusIcon status={milestone.status === 'shipped' ? 'shipped' : milestone.status === 'active' ? 'active' : 'todo'} /><strong>{milestone.name}</strong><span className="lists-count">{items.length}</span><span className="lists-muted">{milestone.description}</span>{'target' in milestone && milestone.target && <span className="lists-target">Target {new Date(`${milestone.target}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}</div>{items.map(item => { const stage = currentStage(item); const run = select.activeRun(item.id); const agents = [...new Set(item.stages.map(stage => stage.agent).filter((agent): agent is AgentId => !!agent))]; const blocked = item.tickets.filter(ticket => ticket.status !== 'resolved' && blockedBy(item, ticket).length).length; return <button key={item.id} data-list-row={item.id} className={`lists-project-row ${selectedId === item.id ? 'selected' : ''}`} onFocus={() => setSelected(item.id)} onClick={() => navigate({ kind: 'item', itemId: item.id })}><span className="lists-project-title"><StatusIcon status={isShipped(item) ? 'shipped' : stage?.status ?? 'todo'} /><code>{item.id}</code><strong>{item.title}</strong></span><span className="lists-stage-pill">{isShipped(item) ? 'Shipped' : select.workflow(item).stages.find(definition => definition.id === stage?.stageId)?.name}</span><span className="lists-avatar-stack">{agents.map(agent => <AgentBadge key={agent} agent={agent} avatar showName={false} />)}</span><span className="lists-activity">{run && <span className={run.status === 'running' ? 'lists-accent' : 'lists-warning-text'}>{run.status === 'running' ? <span className="lists-pulse" /> : <CircleHelp size={11} />}{run.status === 'running' ? 'Running' : 'Needs you'}</span>}{blocked > 0 && <span><LockKeyhole size={11} />{blocked} blocked</span>}{!run && !blocked && <span>{isShipped(item) ? 'Merged' : select.needsYou().some(entry => entry.itemId === item.id) ? 'Needs you' : 'Ready'}</span>}</span><span className="lists-updated">{relativeTime(item.updatedAt, state.now)}</span></button>; })}</section>; })}{!ordered.length && <div className="lists-empty"><Search size={24} /><h2>No work items found</h2><p>Try a different title or ID.</p></div>}<div className="lists-project-end"><span>{visible.length} work items</span><span>Tracked in local Markdown · no sync required</span></div></div></div>;
}

type ItemViewProps = { itemId: string; navigate: Navigate; back: () => void; nextAction: (item: WorkItem) => void; prepareRun: (item: WorkItem, stageId?: string, ticketId?: string) => void };

function ItemView({ itemId, navigate, back, nextAction, prepareRun }: ItemViewProps) {
  const { state, actions, select } = useWorkbench();
  const item = select.item(itemId)!;
  const workflow = select.workflow(item);
  const [tab, setTab] = useState<Tab>(item.tickets.length ? 'Tickets' : 'Spec');
  const [ticketId, setTicketId] = useState(item.tickets.find(ticket => ticket.status === 'in-progress')?.id ?? item.tickets[0]?.id ?? '');
  const [filePath, setFilePath] = useState(item.artifacts[0]?.path ?? 'AGENTS.md');
  const [selectedRun, setSelectedRun] = useState(select.runsFor(item.id)[0]?.id ?? '');
  const run = select.activeRun(item.id);
  const stage = currentStage(item);
  const tickets = [...item.tickets].sort((left, right) => left.id.localeCompare(right.id));
  const ticket = tickets.find(ticket => ticket.id === ticketId);
  const runs = select.runsFor(item.id);
  const files: Artifact[] = [...item.artifacts, agentsArtifact, ...state.adrs, { path: 'GLOSSARY.md', title: 'Project language', kind: 'glossary', updatedAt: state.now, content: `# Glossary\n\n${state.glossary.map(entry => `## ${entry.term}\n${entry.definition}`).join('\n\n')}` }, ...item.tickets.map(ticket => ({ path: ticket.path, title: `Ticket ${ticket.id} · ${ticket.title}`, kind: 'other' as const, content: ticket.body, updatedAt: item.updatedAt }))];
  const file = files.find(file => file.path === filePath) ?? files[0];
  useListKeys(tab === 'Tickets' ? tickets.map(ticket => ticket.id) : tab === 'Runs' ? runs.map(run => run.id) : [], tab === 'Tickets' ? ticketId : selectedRun, tab === 'Tickets' ? setTicketId : setSelectedRun, id => { if (tab === 'Runs') navigate({ kind: 'run', runId: id }); else { setTicketId(id); document.getElementById('lists-ticket-detail')?.scrollIntoView({ block: 'nearest' }); } });
  const stoppedRun = runs.find(run => run.status === 'stopped' && run.ticketId === ticketId);
  const stageName = workflow.stages.find(definition => definition.id === stage?.stageId)?.name;
  const buttonLabel = isShipped(item) ? 'Shipped' : stage?.stageId === 'review' && select.review(item.id) ? 'Open review' : run ? `View ${run.agent} run` : stage?.stageId === 'ship' && item.pr ? 'Merge pull request' : stage?.status === 'waiting' ? `Approve ${stageName}` : item.nextAction.split(' — ')[0];
  return <div className="lists-view"><header className="lists-item-heading"><button className="lists-back" onClick={back}><ArrowLeft size={14} /><Kbd>esc</Kbd></button><div className="lists-item-heading-text"><div className="lists-eyebrow"><code>{item.id}</code><span className="lists-stage-pill">{item.type === 'quick' ? 'Quick task' : item.type}</span><span>{state.milestones.find(milestone => milestone.id === item.milestoneId)?.name ?? 'Unassigned'}</span></div><h1>{item.title}</h1></div><button className={`lists-button ${isShipped(item) ? '' : 'primary'}`} disabled={isShipped(item)} onClick={() => nextAction(item)}>{isShipped(item) ? <CheckCheck size={14} /> : <Play size={13} />}{buttonLabel}{!isShipped(item) && <ArrowRight size={13} />}</button></header>
    <div className="lists-stage-rail" aria-label="Workflow stages">{workflow.stages.map((definition, index) => { const stage = item.stages.find(stage => stage.stageId === definition.id)!; return <div key={definition.id} className={`lists-stage-step ${stage.status}`}><div><StatusIcon status={stage.status} /><span>{definition.name}</span>{index < workflow.stages.length - 1 && <ChevronRight className="lists-stage-chevron" size={13} />}</div><AgentPicker value={stage.agent} onChange={agent => actions.setStageAgent(item.id, stage.stageId, agent)} label={`Agent for ${definition.name}`} /></div>; })}</div>
    <div className="lists-item-layout"><section className="lists-item-content"><div className="lists-tabs" role="tablist" aria-label="Work item sections">{(['Spec', 'Tickets', 'Runs', 'Files'] as Tab[]).map(name => <button key={name} role="tab" id={`lists-tab-${name}`} aria-controls="lists-item-panel" aria-selected={tab === name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}{name === 'Tickets' && item.tickets.length > 0 && <span>{item.tickets.filter(ticket => ticket.status === 'resolved').length}/{item.tickets.length}</span>}{name === 'Runs' && <span>{runs.length}</span>}</button>)}</div><div className="lists-tab-content" id="lists-item-panel" role="tabpanel" aria-labelledby={`lists-tab-${tab}`}>
      {tab === 'Spec' && (item.artifacts.find(file => file.kind === 'spec') ? <><div className="lists-file-label"><FileText size={13} /><code>{item.artifacts.find(file => file.kind === 'spec')!.path}</code></div>{item.artifacts.some(file => file.kind === 'spec' && file.changedSinceLastRun) && <div className="lists-warning"><strong>Changed since r-104</strong><p>Criterion 3 now allows duplicates within 3 days. The next run will receive the amended spec.</p></div>}<MarkdownView content={item.artifacts.find(file => file.kind === 'spec')!.content} /></> : <div className="lists-empty"><FileText size={26} /><h2>No spec yet</h2><p>{isShipped(item) ? 'This shipped item has no spec artifact in the scenario.' : 'Start the next stage to shape the work and produce its local artifacts.'}</p>{!isShipped(item) && <button className="lists-button" onClick={() => nextAction(item)}>{buttonLabel}<ArrowRight size={13} /></button>}</div>)}
      {tab === 'Tickets' && (tickets.length ? <><div className="lists-section-title"><span>Implementation order</span><span className="lists-muted">Dependencies before dependents</span></div>{tickets.map(ticket => { const blockers = blockedBy(item, ticket); return <button key={ticket.id} data-list-row={ticket.id} className={`lists-ticket-row ${ticket.id === ticketId ? 'selected' : ''}`} onClick={() => setTicketId(ticket.id)}><StatusIcon status={blockers.length ? 'blocked' : ticket.status} /><code>{ticket.id}</code><span>{ticket.title}</span>{ticket.agent && <AgentBadge agent={ticket.agent} showName={false} avatar />}<small className={ticket.status === 'resolved' ? 'lists-success' : ''}>{blockers.length ? `Blocked by ${blockers.join(', ')}` : ticket.status === 'resolved' ? 'Resolved' : ticket.status === 'in-progress' ? run?.ticketId === ticket.id ? 'Running' : 'Paused' : 'Ready'}</small></button>; })}{ticket && <section className="lists-ticket-detail" id="lists-ticket-detail"><div className="lists-section-title"><h3>Ticket {ticket.id} <span className="lists-stage-pill">{ticket.status}</span></h3>{ticket.status !== 'resolved' && <button className="lists-button small" disabled={!!blockedBy(item, ticket).length || !!run || stage?.stageId !== 'implement'} onClick={() => prepareRun(item, 'implement', ticket.id)}><Play size={12} />{ticket.status === 'in-progress' ? 'Resume' : 'Start'} ticket {ticket.id}</button>}</div><div className="lists-file-label"><FileText size={13} /><code>{ticket.path}</code></div>{ticket.status === 'resolved' && <div className="lists-success-note"><CheckCheck size={14} />Resolved · its dependent tickets can now move forward.</div>}<MarkdownView content={ticket.body} />{stoppedRun?.handoff && ticket.status !== 'resolved' && <><button className="lists-text-button lists-handoff-link" onClick={() => navigate({ kind: 'run', runId: stoppedRun.id })}><AgentBadge agent={stoppedRun.agent} />Stopped {stoppedRun.id} · {relativeTime(stoppedRun.endedAt ?? stoppedRun.startedAt, state.now)}<ArrowUpRight size={12} /></button><HandoffCard handoff={stoppedRun.handoff} title={`Last handoff · ${stoppedRun.id}`} /></>}{ticket.comments.length > 0 && <div className="lists-comments"><h3>Activity</h3>{ticket.comments.map((comment, index) => <div key={index}><div><strong>{comment.author}</strong><span>{relativeTime(comment.at, state.now)}</span></div><p>{comment.text}</p></div>)}</div>}</section>}</> : <div className="lists-empty"><Layers2 size={26} /><h2>No tickets yet</h2><p>{item.type === 'feature' ? 'Tickets appear after the spec is approved and broken into work.' : 'This workflow goes straight from implementation to review.'}</p></div>)}
      {tab === 'Runs' && <><div className="lists-section-title"><span>Run history</span><ListHints /></div>{runs.length ? runs.map(run => <section key={run.id} className="lists-run-history"><button className={`lists-run-row ${selectedRun === run.id ? 'selected' : ''}`} data-list-row={run.id} onClick={() => navigate({ kind: 'run', runId: run.id })} onFocus={() => setSelectedRun(run.id)}><StatusIcon status={run.status} /><code>{run.id}</code><AgentBadge agent={run.agent} /><span>{run.stageId}{run.ticketId ? ` / ticket ${run.ticketId}` : ''}</span><small>{run.status}</small><ArrowUpRight size={13} /></button>{run.handoff && <HandoffCard handoff={run.handoff} title={`${run.id} · handoff`} />}</section>) : <div className="lists-empty"><Terminal size={26} /><h2>No runs yet</h2><p>Choose an agent and start the next stage.</p></div>}</>}
      {tab === 'Files' && <><div className="lists-section-title"><span>Artifacts & project context</span><span className="lists-muted">Local Markdown</span></div><div className="lists-files">{files.map(file => <button key={file.path} className={filePath === file.path ? 'selected' : ''} onClick={() => setFilePath(file.path)}><FileText size={13} /><code>{file.path}</code>{file.changedSinceLastRun && <span className="lists-warning-text">changed</span>}</button>)}</div>{file && <div className="lists-file-content"><div className="lists-file-label"><code>{file.path}</code></div><MarkdownView content={file.content} /></div>}</>}
    </div></section><aside className="lists-properties"><h3>Properties</h3><div className="lists-property"><span>Milestone</span><strong>{state.milestones.find(milestone => milestone.id === item.milestoneId)?.name ?? 'Unassigned'}</strong></div><div className="lists-property"><span>Stage</span><strong><StatusIcon status={isShipped(item) ? 'shipped' : stage?.status ?? 'todo'} />{isShipped(item) ? 'Shipped' : stageName}</strong></div><h3>Stage owners</h3>{workflow.stages.map(definition => { const stage = item.stages.find(stage => stage.stageId === definition.id)!; return <div className="lists-stage-owner" key={definition.id}><span><StatusIcon status={stage.status} size={12} />{definition.name}</span><AgentPicker value={stage.agent} onChange={agent => actions.setStageAgent(item.id, definition.id, agent)} label={`Property agent for ${definition.name}`} /></div>; })}<h3>Development</h3><div className="lists-property"><span><GitBranch size={12} />Branch</span><code>{item.branch ?? 'Created when a run starts'}</code></div><div className="lists-property"><span><FolderGit2 size={12} />Worktree</span><code>{item.worktree ?? 'Created when a run starts'}</code></div><div className="lists-property"><span><GitPullRequest size={12} />Pull request</span>{item.pr ? <a href={item.pr.url} target="_blank" rel="noreferrer">#{item.pr.number} · {item.pr.state}<ArrowUpRight size={11} /></a> : <span className="lists-muted">Not opened</span>}</div><h3>Paths</h3>{item.artifacts.map(file => <button className="lists-property-path" key={file.path} onClick={() => { setTab('Files'); setFilePath(file.path); }}><FileText size={12} /><code>{file.path}</code></button>)}<div className="lists-property-path"><FolderGit2 size={12} /><code>.scratch/{item.slug}/</code></div>{!isShipped(item) && <div className="lists-next-note"><span className="lists-eyebrow">Up next</span><p>{item.nextAction}</p></div>}{select.review(item.id) && <button className="lists-button small" onClick={() => navigate({ kind: 'review', itemId: item.id })}><GitPullRequest size={13} />Open review<ArrowRight size={12} /></button>}</aside></div>
  </div>;
}

function StreamEvent({ event, navigate }: { event: RunEvent; navigate: Navigate }) {
  if (event.kind === 'plan') return <div className="lists-plan"><h3>Plan <span>{event.steps.filter(step => step.done).length}/{event.steps.length}</span></h3>{event.steps.map((step, index) => <div className={step.done ? 'done' : ''} key={index}><StatusIcon status={step.done ? 'done' : 'todo'} /><span>{step.text}</span></div>)}</div>;
  if (event.kind === 'tool') return <details className={`lists-tool ${event.status === 'error' ? 'error' : ''}`} open={event.status === 'error'}><summary><Terminal size={13} /><code>{event.input}</code><StatusIcon status={event.status === 'ok' ? 'pass' : event.status === 'error' ? 'fail' : 'pending'} /></summary><pre>{event.output ?? 'Waiting for output…'}</pre></details>;
  if (event.kind === 'file') return <div className="lists-stream-file"><FileCode2 size={14} /><code>{event.path}</code><span className="lists-success">+{event.added}</span><span className="lists-danger">−{event.removed}</span></div>;
  if (event.kind === 'question' || event.kind === 'permission') return <button className="lists-stream-wait" onClick={() => navigate({ kind: 'needs' })}><CircleHelp size={14} />{event.kind === 'question' ? 'Question recorded in Needs you' : 'Permission requested in Needs you'}<ArrowUpRight size={12} /></button>;
  return <div className={event.kind === 'system' ? 'lists-system-event' : 'lists-message-event'}>{event.text.startsWith('Brief received') ? <details><summary>Brief received · project context loaded</summary><pre>{event.text}</pre></details> : event.text}</div>;
}

function RunView({ runId, navigate, back, prepareRun }: { runId: string; navigate: Navigate; back: () => void; prepareRun: ItemViewProps['prepareRun'] }) {
  const { state, actions, select } = useWorkbench();
  const run = state.runs.find(run => run.id === runId);
  const [terminal, setTerminal] = useState(false);
  const [follow, setFollow] = useState(true);
  const stream = useRef<HTMLDivElement>(null);
  useEffect(() => { if (follow && stream.current) stream.current.scrollTop = stream.current.scrollHeight; }, [run?.events.length, run?.status, follow]);
  if (!run) return <div className="lists-empty"><h2>This run is no longer available</h2><p>The prototype may have been reset.</p><button className="lists-button" onClick={() => navigate({ kind: 'project' })}>Back to project</button></div>;
  const item = select.item(run.itemId)!;
  const waiting = select.needsYou().find(entry => entry.runId === run.id && (entry.kind === 'question' || entry.kind === 'permission'));
  const latestPlan = [...run.events].reverse().find(event => event.kind === 'plan');
  const live = run.status === 'running' || run.status === 'waiting';
  const nextTicket = item.tickets.find(ticket => ticket.status !== 'resolved' && !blockedBy(item, ticket).length);
  const canResume = run.status === 'stopped' && !select.activeRun(item.id) && ['active', 'waiting'].includes(item.stages.find(stage => stage.stageId === run.stageId)?.status ?? '') && (!run.ticketId || item.tickets.find(ticket => ticket.id === run.ticketId)?.status !== 'resolved');
  return <div className="lists-view lists-run-view"><header className="lists-run-heading"><button className="lists-back" onClick={back}><ArrowLeft size={14} /><Kbd>esc</Kbd></button><div><div className="lists-eyebrow"><button onClick={() => navigate({ kind: 'item', itemId: item.id })}>{item.id} · {item.title}</button><ChevronRight size={12} /><code>{run.id}</code></div><h1><AgentBadge agent={run.agent} size="md" /> <span className="lists-muted">/</span> {run.stageId}{run.ticketId && <span className="lists-muted">· ticket {run.ticketId}</span>}</h1></div><span className={`lists-run-status ${run.status}`}><StatusIcon status={run.status} />{run.status}</span><button className={`lists-button ${terminal ? 'pressed' : ''}`} aria-pressed={terminal} onClick={() => setTerminal(value => !value)}><Terminal size={14} />{terminal ? 'Event stream' : 'Terminal'}</button>{live && <button className="lists-button danger" onClick={() => actions.stopRun(run.id)}><Square size={12} />Stop run</button>}{canResume && <button className="lists-button primary" onClick={() => prepareRun(item, run.stageId, run.ticketId)}><Play size={13} />Resume with agent</button>}</header><div className="lists-run-context"><code><FolderGit2 size={12} />{item.worktree}</code><code><GitBranch size={12} />{item.branch}</code><span>{relativeTime(run.startedAt, state.now)}{run.tokens ? ` · ${run.tokens.toLocaleString()} tokens` : ''}</span></div>
    {terminal ? <TerminalView run={run} className="lists-terminal" autoScroll={follow} /> : <div ref={stream} className="lists-run-stream" role="log" aria-live="polite" aria-label={`Events for ${run.id}`} onScroll={() => { const node = stream.current; if (node) setFollow(node.scrollHeight - node.scrollTop - node.clientHeight < 80); }}><div className="lists-stream-inner">{run.events.filter(event => event.kind !== 'plan' || event.id === latestPlan?.id).map(event => <div className="lists-event" key={event.id}><time>{new Date(event.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Los_Angeles' })}</time><StreamEvent event={event} navigate={navigate} /></div>)}{waiting && <div className="lists-run-question"><EntryDetail entry={waiting} navigate={navigate} /></div>}{run.handoff && <HandoffCard handoff={run.handoff} title={`${run.status === 'done' ? 'Completed' : 'Stopped'} · handoff`} />}{run.status === 'done' && run.ticketId && item.tickets.find(ticket => ticket.id === run.ticketId)?.status === 'resolved' && <div className="lists-run-complete"><CheckCheck size={19} /><div><strong>Ticket {run.ticketId} resolved{nextTicket ? ` · ticket ${nextTicket.id} is now ready` : ''}</strong><p>{nextTicket?.title ?? 'Implementation is ready for the next stage.'}</p></div><button className="lists-button" onClick={() => navigate({ kind: 'item', itemId: item.id })}>View tickets<ArrowRight size={13} /></button></div>}{run.status === 'running' && <div className="lists-stream-live"><span className="lists-pulse" />{run.agent} is working<span>Events stream as they happen</span></div>}</div></div>}
    <footer className="lists-run-footer"><span><span className={live ? 'lists-pulse' : 'lists-available-dot'} />{run.status === 'running' ? 'Live session' : run.status === 'waiting' ? 'Waiting for your decision' : 'Session ended'}<span className="lists-separator">·</span>{run.events.length} events</span><button className="lists-text-button" onClick={() => setFollow(value => !value)}><ArrowDown size={12} />{follow ? 'Following latest' : 'Follow latest'}</button></footer>
  </div>;
}

function FindingCard({ finding, pinned = false }: { finding: Finding; pinned?: boolean }) {
  const { actions } = useWorkbench();
  return <section id={pinned ? `lists-pin-${finding.id}` : undefined} className={`lists-finding ${finding.status !== 'open' ? 'closed' : ''}`}><div className="lists-finding-meta"><span className={`lists-severity ${finding.severity}`}>{finding.severity}</span><span>{finding.axis}</span><AgentBadge agent={finding.agent} showName={false} /><span>{finding.status}</span></div><h4>{finding.title}</h4><p>{finding.body}</p><div className="lists-finding-actions">{finding.status === 'open' || finding.status === 'sent-back' ? <><button onClick={() => actions.setFindingStatus(finding.id, 'resolved')}><Check size={12} />Resolve</button><button onClick={() => actions.setFindingStatus(finding.id, 'accepted')}>Accept risk</button></> : <><span><Check size={12} />{finding.status === 'resolved' ? 'Marked resolved' : 'Risk accepted'}</span><button onClick={() => actions.setFindingStatus(finding.id, 'open')}>Reopen</button></>}</div></section>;
}

function ReviewView({ itemId, navigate, back, prepareRun }: { itemId: string; navigate: Navigate; back: () => void; prepareRun: ItemViewProps['prepareRun'] }) {
  const { actions, select } = useWorkbench();
  const item = select.item(itemId)!;
  const review = select.review(item.id);
  const [path, setPath] = useState(review?.files[0]?.path ?? '');
  const [axis, setAxis] = useState('all');
  const [status, setStatus] = useState('all');
  const [focusedFinding, setFocusedFinding] = useState('');
  useEffect(() => { if (focusedFinding) document.getElementById(`lists-pin-${focusedFinding}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [focusedFinding, path]);
  if (!review) return <div className="lists-empty"><GitPullRequest size={24} /><h2>No review yet</h2><button className="lists-button" onClick={back}>Back to work item</button></div>;
  const file = review.files.find(file => file.path === path) ?? review.files[0];
  const stale = review.checksCommit !== review.commit;
  const activeRun = select.activeRun(item.id);
  const permission = select.needsYou().find(entry => entry.itemId === item.id && entry.kind === 'permission');
  const findings = review.findings.filter(finding => (axis === 'all' || finding.axis === axis) && (status === 'all' || finding.status === status));
  const unresolved = review.findings.filter(finding => finding.status === 'open' || finding.status === 'sent-back');
  const passed = review.checks.length > 0 && review.checks.every(check => check.status === 'pass');
  const reviewStage = item.stages.find(stage => stage.stageId === 'review');
  const readyToApprove = !stale && passed && !unresolved.length && !activeRun && !!reviewStage && ['active', 'waiting'].includes(reviewStage.status) && item.stages.filter(stage => stage.stageId !== 'ship' && stage.stageId !== 'review').every(stage => stage.status === 'done' || stage.status === 'skipped');
  const readyToMerge = !stale && passed && !unresolved.length && !activeRun && !!item.pr && item.stages.filter(stage => stage.stageId !== 'ship').every(stage => stage.status === 'done' || stage.status === 'skipped');
  const merged = item.pr?.state === 'merged';
  const canStartReview = !merged && !activeRun && !!reviewStage && ['active', 'waiting'].includes(reviewStage.status) && item.stages.filter(stage => stage.stageId !== 'ship' && stage.stageId !== 'review').every(stage => stage.status === 'done' || stage.status === 'skipped');
  const reason = merged ? `PR #${item.pr?.number} merged · shipped` : stale ? 'Re-review the new commit before approving.' : activeRun ? 'Finish the active run before approval.' : !passed ? 'Checks must pass before approval.' : unresolved.length ? `${unresolved.length} findings need a decision.` : !readyToApprove && !readyToMerge ? 'Complete implementation, then start a fresh review.' : readyToMerge ? 'Approved. Ready to merge.' : 'All evidence is current. Ready for your approval.';
  return <div className="lists-view lists-review-view"><header className="lists-review-heading"><button className="lists-back" onClick={back}><ArrowLeft size={14} /><Kbd>esc</Kbd></button><div><div className="lists-eyebrow"><code>{item.id}</code><span>Review</span>{item.pr && <span>PR #{item.pr.number}</span>}</div><h1>{item.title}</h1></div>{activeRun && <button className="lists-button small" onClick={() => navigate({ kind: 'run', runId: activeRun.id })}><StatusIcon status={activeRun.status} />{activeRun.id}<ArrowUpRight size={12} /></button>}{canStartReview && !stale && <button className="lists-button small" onClick={() => prepareRun(item, 'review')}><Play size={12} />Run fresh review</button>}</header><div className="lists-checks-bar"><span><GitBranch size={13} />Review <code>{review.commit}</code></span><span>Checks <code>{review.checksCommit}</code></span><div>{review.checks.map(check => <span key={check.name} title={`${check.detail ?? ''}${check.durationSec ? ` · ${check.durationSec}s` : ''}`}><StatusIcon status={check.status} />{check.name}<small className={check.status === 'fail' ? 'lists-danger' : 'lists-muted'}>{check.status}</small></span>)}</div></div>
    {permission && <div className="lists-review-permission"><LockKeyhole size={13} /><code>{permission.command}</code><EntryActions entry={permission} navigate={navigate} compact /></div>}
    {stale && <div className="lists-stale"><ShieldCheck size={17} /><div><strong>Stale evidence · the tree changed</strong><p>Diff and findings belong to {review.commit}; refreshed checks belong to {review.checksCommit}. Passing checks do not approve the old review.</p></div><button className="lists-button small" disabled={!!activeRun} onClick={() => prepareRun(item, 'review')}>Re-review {review.checksCommit}<ArrowRight size={13} /></button></div>}
    <div className="lists-review-layout"><aside className="lists-review-files"><h3>Changed files <span>{review.files.length}</span></h3><div className="lists-review-branch"><code>{review.baseBranch}</code><ArrowLeft size={11} /><code>{review.branch}</code></div>{review.files.map(file => <button key={file.path} className={file.path === (review.files.find(file => file.path === path)?.path ?? review.files[0]?.path) ? 'selected' : ''} onClick={() => { setPath(file.path); setFocusedFinding(''); }}><FileCode2 size={14} /><span><strong>{file.path.split('/').at(-1)}</strong><code>{file.path}</code></span><span className="lists-success">+{file.added}</span></button>)}<div className="lists-review-file-note"><ShieldCheck size={14} /><p>Review the spec and the code.<br />Checks are evidence, not approval.</p><code>.scratch/{item.slug}/spec.md</code></div></aside><section className="lists-review-diff" aria-label="Code diff">{file ? <DiffView file={file} renderAfterLine={(line, path) => review.findings.filter(finding => finding.path === path && finding.line === line.newNo).map(finding => <FindingCard key={finding.id} finding={finding} pinned />)} /> : <div className="lists-empty">No diff files were produced by this run.</div>}{file && review.findings.filter(finding => finding.path === file.path && !file.hunks.some(hunk => hunk.lines.some(line => line.newNo === finding.line))).map(finding => <div key={finding.id}><div className="lists-file-label">{finding.path}:{finding.line} · outside visible hunk</div><FindingCard finding={finding} pinned /></div>)}</section><aside className="lists-findings-rail"><h3>Findings <span>{review.findings.length}</span><ListFilter size={13} /></h3><div className="lists-finding-filters"><select aria-label="Filter findings by axis" value={axis} onChange={event => setAxis(event.target.value)}><option value="all">Both axes</option><option value="spec">Spec</option><option value="standards">Standards</option></select><select aria-label="Filter findings by status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option value="open">Open</option><option value="resolved">Resolved</option><option value="accepted">Accepted</option><option value="sent-back">Sent back</option></select></div>{findings.map(finding => <div key={finding.id} className="lists-rail-finding"><button className="lists-finding-location" onClick={() => { setPath(finding.path); setFocusedFinding(finding.id); }}><code>{finding.path}:{finding.line}</code><ArrowUpRight size={11} /></button><FindingCard finding={finding} /></div>)}{findings.length === 0 && <div className="lists-empty"><CheckCheck size={25} /><h2>{review.findings.length ? 'No matching findings' : 'No open findings'}</h2><p>{review.findings.length ? 'Try a different filter.' : `Review evidence is tied to ${review.commit}. Human approval is still required.`}</p></div>}</aside></div><footer className="lists-review-footer"><span className={stale ? 'lists-warning-text' : 'lists-muted'}>{merged ? <CheckCheck size={14} /> : <ShieldCheck size={14} />}{reason}</span><div><button className="lists-button" disabled={merged} onClick={() => { actions.sendBack(item.id); navigate({ kind: 'item', itemId: item.id }); }}><ArrowLeft size={13} />Send back</button>{!merged && !readyToMerge && <button className="lists-button" disabled={!readyToApprove} title={reason} onClick={() => actions.approveStage(item.id, 'review')}><Check size={13} />Approve review</button>}<button className="lists-button primary" disabled={!readyToMerge || merged} title={reason} onClick={() => actions.merge(item.id)}><GitMerge size={14} />{merged ? 'Merged' : 'Merge pull request'}</button></div></footer>
  </div>;
}
