import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Bug, Check, CheckCheck, ChevronRight, CircleHelp, GitBranch, Inbox, Layers3, ListFilter, LockKeyhole, Plus, Sparkles, Workflow, Zap } from 'lucide-react';
import { useWorkbench } from '../../proto/store';
import type { ItemType, WorkItem } from '../../proto/types';
import { AgentBadge, CommandPalette, Kbd, type PaletteCommand } from '../../proto/ui';
import { InboxCard, ItemDrawer, Overlay, ReviewOverlay, currentStage, isShipped } from './panels';
import './pipeline.css';

export const variantName = 'Pipeline';
const columns = [
  { id: 'clarify', label: 'Clarify', hint: 'Find the right problem', icon: CircleHelp },
  { id: 'spec', label: 'Spec', hint: 'Agree on the outcome', icon: Sparkles },
  { id: 'tickets', label: 'Tickets', hint: 'Break it into steps', icon: ListFilter },
  { id: 'implement', label: 'Implement', hint: 'Make it work', icon: Zap },
  { id: 'review', label: 'Review', hint: 'Prove it’s ready', icon: CheckCheck },
  { id: 'ship', label: 'Ship', hint: 'Put it in people’s hands', icon: GitBranch },
];
const boardStage = (item: WorkItem) => {
  const stage = currentStage(item)?.stageId;
  return stage === 'diagnose' || stage === 'do' ? 'clarify' : stage === 'fix' ? 'implement' : stage;
};
const typeIcons = { feature: Sparkles, bug: Bug, quick: Zap };

export default function Pipeline() {
  const { state, actions, select } = useWorkbench();
  const [milestone, setMilestone] = useState('All');
  const [swimlanes, setSwimlanes] = useState(false);
  const [shippedOpen, setShippedOpen] = useState(false);
  const [panel, setPanel] = useState<'queue' | 'item' | 'review' | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [initialStage, setInitialStage] = useState<string>();
  const [queueFilter, setQueueFilter] = useState('all');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ItemType>('feature');
  const [notice, setNotice] = useState('');
  const workspace = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const cardPositions = useRef(new Map<string, { left: number; top: number }>());
  const previousStages = useRef(new Map(state.items.map(item => [item.id, isShipped(item) ? 'shipped' : boardStage(item)])));
  const entries = select.needsYou();
  const selected = selectedId ? select.item(selectedId) : undefined;
  const visible = state.items.filter(item => milestone === 'All' || item.milestoneId === milestone);
  const shipped = visible.filter(isShipped);
  const liveRuns = state.runs.filter(run => ['running', 'waiting'].includes(run.status));
  const lanes = swimlanes ? [...state.milestones.filter(candidate => milestone === 'All' || candidate.id === milestone).map(candidate => candidate.id), ...(visible.some(item => !item.milestoneId) ? ['unassigned'] : [])] : ['all'];

  function openItem(id: string, stage?: string) {
    setSelectedId(id); setInitialStage(stage); setPanel('item');
  }
  function openReview(id: string) {
    setSelectedId(id); setPanel('review');
  }

  useLayoutEffect(() => {
    const nextPositions = new Map(cardPositions.current);
    board.current?.querySelectorAll<HTMLElement>('[data-work-card]').forEach(card => {
      const id = card.dataset.workCard!;
      const bounds = card.getBoundingClientRect();
      const position = { left: bounds.left + (board.current?.scrollLeft ?? 0), top: bounds.top + (board.current?.scrollTop ?? 0) };
      const previous = cardPositions.current.get(id);
      nextPositions.set(id, position);
      if (previous && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const deltaX = previous.left - position.left;
        const deltaY = previous.top - position.top;
        if (deltaX || deltaY) card.animate([{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: 'translate(0, 0)' }], { duration: 180, easing: 'ease-out' });
      }
    });
    cardPositions.current = nextPositions;
  });

  useEffect(() => {
    if (workspace.current) workspace.current.inert = !!panel || newOpen || paletteOpen;
  }, [panel, newOpen, paletteOpen]);

  useEffect(() => {
    if (visible.length && visible.every(isShipped)) {
      setShippedOpen(true);
      requestAnimationFrame(() => board.current?.scrollTo({ left: board.current.scrollWidth, behavior: 'smooth' }));
    } else board.current?.scrollTo({ left: 0, behavior: 'smooth' });
  }, [milestone]);

  useEffect(() => {
    for (const item of state.items) {
      const next = isShipped(item) ? 'shipped' : boardStage(item);
      const previous = previousStages.current.get(item.id);
      if (previous && previous !== next) {
        setNotice(`${item.id} moved to ${next === 'shipped' ? 'Shipped' : columns.find(column => column.id === next)?.label ?? next}`);
        if (next === 'shipped') {
          setShippedOpen(true);
          requestAnimationFrame(() => board.current?.scrollTo({ left: board.current.scrollWidth, behavior: 'smooth' }));
        }
      }
      previousStages.current.set(item.id, next);
    }
  }, [state.items]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.repeat || paletteOpen || newOpen) return;
      if ((event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key.toLowerCase() === 'c') { event.preventDefault(); setNewOpen(true); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [panel, paletteOpen, newOpen]);

  const commands: PaletteCommand[] = [
    { id: 'pipeline', label: 'Go to Pipeline board', group: 'Navigate', run: () => setPanel(null) },
    { id: 'needs-you', label: `Open Needs you · ${entries.length} decisions`, group: 'Navigate', run: () => { setQueueFilter('all'); setPanel('queue'); } },
    ...state.items.map(item => ({ id: item.id, label: `${item.id} · ${item.title}`, group: 'Work items', run: () => openItem(item.id) })),
    ...state.milestones.map(candidate => ({ id: candidate.id, label: `Filter ${candidate.name}`, group: 'Navigate', run: () => { setMilestone(candidate.id); setPanel(null); } })),
    { id: 'all-milestones', label: 'Show all milestones', group: 'Navigate', run: () => { setMilestone('All'); setPanel(null); } },
    { id: 'create', label: 'Create new work item', group: 'Actions', shortcut: 'c', run: () => setNewOpen(true) },
    { id: 'resume', label: 'Preview & resume F-12 implementation', group: 'Actions', run: () => openItem('F-12', 'implement') },
    { id: 'review', label: 'Review B-31 · diff, findings & checks', group: 'Actions', run: () => openReview('B-31') },
    { id: 'approve-spec', label: 'Read & approve F-14 spec', group: 'Actions', run: () => openItem('F-14', 'spec') },
    ...liveRuns.map(run => ({ id: `stop-${run.id}`, label: `Stop ${run.id} · ${run.itemId} (${run.agent})`, group: 'Actions', run: () => { actions.stopRun(run.id); setNotice(`${run.id} stopped · handoff saved`); } })),
  ];

  function workCard(item: WorkItem) {
    const stage = currentStage(item);
    const run = select.activeRun(item.id);
    const needs = entries.filter(entry => entry.itemId === item.id).length;
    const blocked = item.tickets.filter(ticket => ticket.status !== 'resolved' && ticket.blockedBy.some(id => item.tickets.find(candidate => candidate.id === id)?.status !== 'resolved')).length;
    const complete = item.tickets.filter(ticket => ticket.status === 'resolved').length;
    const TypeIcon = typeIcons[item.type];
    return <button key={item.id} data-work-card={item.id} className={`pb-card ${run ? 'pb-card-live' : ''} ${isShipped(item) ? 'pb-card-shipped' : ''}`} onClick={() => openItem(item.id)} aria-label={`${item.id} ${item.title}, ${isShipped(item) ? 'Shipped' : stage?.stageId}${run ? `, ${run.status}` : ''}${blocked ? `, ${blocked} blocked tickets` : ''}${needs ? `, ${needs} need you` : ''}`}>
      <span className="pb-card-top"><span className="pb-type"><TypeIcon size={13} /><span>{item.id}</span></span><span className="pb-milestone-tag">{item.milestoneId ?? 'No milestone'}</span></span>
      <span className="pb-card-title">{item.title}</span>
      <span className="pb-card-note">{isShipped(item) ? `PR #${item.pr?.number} merged` : item.id === 'F-12' && !run && complete === 1 ? 'Grok stopped · ready to resume' : item.nextAction}</span>
      {(needs > 0 || blocked > 0) && <span className="pb-card-badges">{needs > 0 && <span className="pb-tag pb-attention"><Inbox size={11} />{needs} need you</span>}{blocked > 0 && <span className="pb-tag"><LockKeyhole size={10} />{blocked} blocked</span>}</span>}
      {item.tickets.length > 0 && <span className="pb-card-progress"><span className="pb-progress-track"><span style={{ width: `${complete / item.tickets.length * 100}%` }} /></span><span>{complete}/{item.tickets.length}</span></span>}
      <span className="pb-card-bottom">{stage?.agent ? <AgentBadge agent={stage.agent} avatar showName={false} size="md" /> : isShipped(item) ? <Check size={16} className="pb-success" /> : <span className="pb-unassigned">—</span>}<span>{run ? <><span className={`pb-pulse ${run.status === 'waiting' ? 'pb-pulse-waiting' : ''}`} />{run.status === 'waiting' ? 'Waiting for you' : 'Running'}</> : isShipped(item) ? 'Shipped' : stage?.agent ? state.agents.find(agent => agent.id === stage.agent)?.name : 'Choose an agent'}</span><ArrowRight size={13} /></span>
    </button>;
  }

  return <div className="pb-app">
    <div className="pb-workspace" ref={workspace}>
    <header className="pb-topbar">
      <div className="pb-project"><span className="pb-project-icon"><Layers3 size={19} /></span><strong>{state.project.name}</strong><span className="pb-divider" /><span className="pb-branch"><GitBranch size={13} />{state.project.branch}</span></div>
      <nav className="pb-milestone-filter" aria-label="Milestone filter">{['All', ...state.milestones.map(candidate => candidate.id)].map(id => <button key={id} className={milestone === id ? 'pb-selected' : ''} onClick={() => setMilestone(id)} aria-pressed={milestone === id} title={state.milestones.find(candidate => candidate.id === id)?.name ?? 'All milestones'}>{id}</button>)}</nav>
      <div className="pb-top-actions"><button className="pb-needs-button" onClick={() => { setQueueFilter('all'); setPanel('queue'); }}><Inbox size={15} />Needs you<span>{entries.length}</span></button><span className="pb-divider" /><details className="pb-agents"><summary aria-label="Agent availability">{state.agents.map(agent => <AgentBadge key={agent.id} agent={agent} showName={false} />)}</summary><div className="pb-agent-popover"><strong>Detected agents</strong>{state.agents.map(agent => <div key={agent.id}><AgentBadge agent={agent} /><small>{agent.available ? `${agent.via.toUpperCase()} · ready` : agent.note}</small></div>)}</div></details><button className="pb-command" aria-label="Open command palette" onClick={() => setPaletteOpen(true)}><Kbd>⌘ K</Kbd></button></div>
    </header>

    <main className="pb-main">
      <div className="pb-heading"><div><div className="pb-eyebrow"><Workflow size={13} />PROJECT WORKFLOW</div><h1>Pipeline<span className="pb-heading-count">{visible.filter(item => !isShipped(item)).length}</span></h1><p>From intent to shipped. One stage at a time.</p></div><button className="pb-button" onClick={() => setNewOpen(true)}><Plus size={14} />New item<Kbd>c</Kbd></button></div>
      <div className="pb-board-toolbar"><div className="pb-milestone-description">{milestone === 'All' ? <><span className="pb-dot pb-success-dot" />All milestones<span className="pb-muted">· {state.items.filter(item => !isShipped(item)).length} in flight</span></> : <><span className={`pb-dot ${milestone === 'M1' ? 'pb-success-dot' : ''}`} />{state.milestones.find(candidate => candidate.id === milestone)?.name}<span className="pb-muted">· {state.milestones.find(candidate => candidate.id === milestone)?.status}</span>{state.milestones.find(candidate => candidate.id === milestone)?.target && <span className="pb-muted">· Target Oct 24</span>}</>}</div><div className="pb-toolbar-actions"><span className="pb-muted"><span className="pb-pulse" />{liveRuns.length} live sessions</span><button className={`pb-button pb-button-small ${swimlanes ? 'pb-toggle-active' : ''}`} aria-pressed={swimlanes} onClick={() => setSwimlanes(value => !value)}><Layers3 size={13} />Milestone swimlanes</button></div></div>
      <div className="pb-board-scroll" ref={board} aria-label="Pipeline workflow board" tabIndex={0} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); board.current?.scrollBy({ left: event.key === 'ArrowRight' ? 251 : -251, behavior: 'smooth' }); } }}>
        <div className="pb-board">
          {columns.map((column, index) => <section key={column.id} className="pb-column" aria-label={`${column.label} column`}><header className="pb-column-header"><div><column.icon size={15} /><h2>{column.label}</h2><span className="pb-column-count">{visible.filter(item => !isShipped(item) && boardStage(item) === column.id).length}</span><span className="pb-stage-number">0{index + 1}</span></div><p>{column.hint}</p></header>{lanes.map(lane => {
            const items = visible.filter(item => !isShipped(item) && boardStage(item) === column.id && (lane === 'all' || (item.milestoneId ?? 'unassigned') === lane));
            return <div key={lane} className={`pb-column-lane ${swimlanes ? 'pb-swimlane' : ''}`}>
              {swimlanes && <div className="pb-lane-label">{state.milestones.find(candidate => candidate.id === lane)?.name ?? 'Unassigned'}<span>{items.length}</span></div>}
              {items.map(workCard)}
              {!items.length && <div className="pb-empty-column"><span>—</span><p>{column.id === 'ship' ? 'Ready when you are' : 'Room for what’s next'}</p></div>}
            </div>;
          })}<footer className="pb-column-footer">{column.id === 'clarify' ? 'Clarify · Diagnose · Do' : column.id === 'implement' ? 'Implement · Fix' : column.id === 'spec' ? 'spec.md' : column.id === 'tickets' ? 'issues/NN-*.md' : column.id === 'review' ? 'Standards + spec' : 'Pull request → main'}</footer></section>)}
          <section className={`pb-shipped ${shippedOpen ? 'pb-shipped-open' : ''}`} aria-label="Shipped lane"><button className="pb-shipped-toggle" aria-expanded={shippedOpen} onClick={() => setShippedOpen(value => !value)}><CheckCheck size={16} /><span>Shipped</span><span className="pb-column-count">{shipped.length}</span><ChevronRight size={14} className={shippedOpen ? 'pb-rotate' : ''} /></button>{shippedOpen && <div className="pb-shipped-cards">{shipped.map(workCard)}{!shipped.length && <p className="pb-muted">No shipped items in this milestone yet.</p>}</div>}</section>
        </div>
      </div>
      <footer className="pb-board-footer"><span><span className="pb-dot pb-success-dot" />Local workbench<span className="pb-footer-divider">/</span><code>{state.project.path}</code></span><span>Files are the source of truth<span className="pb-footer-divider">·</span><code>.scratch/</code></span></footer>
    </main>
    </div>

    {panel === 'queue' && <Overlay title="Needs you" className="pb-queue" onClose={() => setPanel(null)}><header className="pb-panel-heading"><div className="pb-eyebrow">HUMAN CHECKPOINTS</div><h2>Needs you <span className="pb-heading-count">{entries.length}</span></h2><p>A decision from you keeps the pipeline moving.</p></header><div className="pb-queue-filters">{['all', 'question', 'permission', 'approval', 'review', 'memory'].map(kind => <button key={kind} className={queueFilter === kind ? 'pb-selected' : ''} onClick={() => setQueueFilter(kind)} aria-pressed={queueFilter === kind}>{kind === 'all' ? 'All' : kind === 'question' ? 'Questions' : kind === 'permission' ? 'Commands' : kind === 'approval' ? 'Approvals' : kind === 'review' ? 'Reviews' : 'Memory'}</button>)}</div><div className="pb-queue-content">{entries.filter(entry => queueFilter === 'all' || entry.kind === queueFilter).map(entry => <InboxCard key={entry.id} entry={entry} onReview={openReview} onItem={openItem} />)}{!entries.some(entry => queueFilter === 'all' || entry.kind === queueFilter) && <div className="pb-empty-state"><CheckCheck size={30} /><h3>You’re all caught up</h3><p>{entries.length ? 'No decisions of this kind. The other filters have more.' : 'The agents can take it from here.'}</p><button className="pb-button" onClick={() => setPanel(null)}>Back to Pipeline<ArrowRight size={14} /></button></div>}<div className="pb-queue-note"><LockKeyhole size={12} />Agents never approve specs, merge, or accept memory for you.</div></div></Overlay>}
    {panel === 'item' && selected && <ItemDrawer key={`${selected.id}-${initialStage ?? ''}`} item={selected} initialStage={initialStage} onClose={() => setPanel(null)} onReview={openReview} />}
    {panel === 'review' && selected && <ReviewOverlay item={selected} onClose={() => setPanel(null)} onRerun={() => openItem(selected.id, 'review')} />}
    {newOpen && <Overlay title="New work item" className="pb-create" onClose={() => setNewOpen(false)}><form onSubmit={event => { event.preventDefault(); if (!title.trim()) return; actions.createItem({ title: title.trim(), type }); setTitle(''); setNewOpen(false); setPanel(null); setMilestone('All'); setNotice('Work item created · ready to clarify'); board.current?.scrollTo({ left: 0, behavior: 'smooth' }); }}><div className="pb-eyebrow"><Plus size={13} />A PLACE TO START</div><h2>New work item</h2><p className="pb-muted">A title is enough. Work out the details with an agent.</p><label className="pb-field-label" htmlFor="pb-new-title">Title</label><input id="pb-new-title" data-autofocus value={title} onChange={event => setTitle(event.target.value)} placeholder="What do you want to build or fix?" maxLength={180} required /><label className="pb-field-label" htmlFor="pb-new-type">Workflow</label><select id="pb-new-type" value={type} onChange={event => setType(event.target.value as ItemType)}><option value="feature">Feature · Clarify → Spec → Tickets → Implement → Review → Ship</option><option value="bug">Bug · Diagnose → Fix → Review → Ship</option><option value="quick">Quick task · Do → Review → Ship</option></select><div className="pb-create-footer"><button type="button" className="pb-button" onClick={() => setNewOpen(false)}>Cancel</button><button className="pb-button pb-primary" disabled={!title.trim()} type="submit">Create item<ArrowRight size={14} /></button></div></form></Overlay>}
    <CommandPalette commands={commands} open={paletteOpen} onOpenChange={setPaletteOpen} />
    <div className={`pb-toast ${notice ? 'pb-toast-visible' : ''}`} role="status" aria-live="polite">{notice && <><Check size={14} />{notice}</>}</div>
  </div>;
}
