import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronRight, FileText, GitBranch, GitMerge, Inbox, Layers, MessageSquare, Plus, Search, Send, Square, Terminal, Workflow, X } from 'lucide-react';
import { useWorkbench } from '../../proto/store';
import type { AgentId, Brief, ItemType, WorkItem } from '../../proto/types';
import { AgentBadge, CommandPalette, DiffView, Kbd, MarkdownView, StatusIcon, TerminalView, relativeTime, type PaletteCommand } from '../../proto/ui';
import { AgentPicker, BriefCard, ChecksPanel, FindingThread, InboxCard, RunEvents } from './panels';
import './cockpit.css';

export const variantName = 'Cockpit';
type View = 'inbox' | 'project' | 'session' | 'review';
type Tab = 'Spec' | 'Tickets' | 'Memory' | 'Checks';
const tabs: Tab[] = ['Spec', 'Tickets', 'Memory', 'Checks'];
const currentStage = (item: WorkItem) => item.stages.find(stage => stage.status === 'active') ?? item.stages.find(stage => stage.status === 'waiting');
const blocked = (item: WorkItem, ticketId: string) => item.tickets.find(ticket => ticket.id === ticketId)?.blockedBy.filter(id => item.tickets.find(ticket => ticket.id === id)?.status !== 'resolved') ?? [];

export default function Variant() {
  const { state, actions, select } = useWorkbench();
  const [view, setView] = useState<View>('inbox');
  const [itemId, setItemId] = useState<string>();
  const [ticketId, setTicketId] = useState<string>();
  const [runId, setRunId] = useState<string>();
  const [stageId, setStageId] = useState<string>();
  const [agent, setAgent] = useState<AgentId>('claude');
  const [tab, setTab] = useState<Tab>('Spec');
  const [expanded, setExpanded] = useState(['F-12']);
  const [terminal, setTerminal] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [notes, setNotes] = useState<{ runId: string; text: string }[]>([]);
  const [briefs, setBriefs] = useState<Record<string, Brief>>({});
  const [notice, setNotice] = useState('');
  const streamRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const item = itemId ? select.item(itemId) : undefined;
  const workflow = item ? select.workflow(item) : undefined;
  const stage = item?.stages.find(candidate => candidate.stageId === stageId) ?? (item ? currentStage(item) : undefined);
  const definition = workflow?.stages.find(candidate => candidate.id === stage?.stageId);
  const active = item ? select.activeRun(item.id) : undefined;
  const runs = item ? select.runsFor(item.id) : [];
  const run = runs.find(candidate => candidate.id === runId) ?? (active?.stageId === stage?.stageId ? active : undefined) ?? (!item?.tickets.length && runs[0]?.stageId === stage?.stageId ? runs[0] : undefined);
  const review = item ? select.review(item.id) : undefined;
  const ticket = item?.tickets.find(candidate => candidate.id === ticketId);
  const ticketHasRun = runs.some(candidate => candidate.ticketId === ticketId);
  const pending = select.needsYou();
  const itemPending = pending.filter(entry => entry.itemId === item?.id);
  const brief = run && briefs[run.id] ? briefs[run.id] : item && stage ? select.brief({ itemId: item.id, stageId: stage.stageId, agent, ticketId }) : undefined;
  const shipped = item?.pr?.state === 'merged';
  const predecessorsDone = !!item && !!stage && item.stages.slice(0, item.stages.findIndex(candidate => candidate.stageId === stage.stageId)).every(candidate => ['done', 'skipped'].includes(candidate.status));
  const canStart = !!item && !!stage && predecessorsDone && !active && !shipped && ['active', 'waiting'].includes(stage.status) && (!ticket || (ticket.status !== 'resolved' && !blocked(item, ticket.id).length)) && !(stage.status === 'waiting' && definition?.gate === 'approve' && stage.stageId !== 'review');
  const fresh = review?.commit === review?.checksCommit;
  const reviewReady = !!review && fresh && !active && review.checks.length > 0 && review.checks.every(check => check.status === 'pass') && review.findings.every(finding => ['accepted', 'resolved'].includes(finding.status));
  const canMerge = reviewReady && !!item?.pr && !shipped && item!.stages.every(candidate => ['review', 'ship'].includes(candidate.stageId) || ['done', 'skipped'].includes(candidate.status));
  const canRereview = !!item && !active && !shipped && item.stages.some(candidate => candidate.stageId === 'review' && ['active', 'waiting'].includes(candidate.status)) && item.stages.every(candidate => ['review', 'ship'].includes(candidate.stageId) || ['done', 'skipped'].includes(candidate.status));
  const nextStage = item && stage?.status === 'done' ? currentStage(item) : undefined;

  function navigate(nextView: View, nextItemId?: string, nextTicketId?: string, nextRunId?: string) {
    const nextItem = nextItemId ? select.item(nextItemId) : undefined;
    const nextRun = state.runs.find(candidate => candidate.id === nextRunId);
    const nextStage = nextRun?.stageId ?? (nextItem ? currentStage(nextItem)?.stageId : undefined);
    const nextTicket = nextTicketId ?? nextRun?.ticketId ?? (nextItem && nextStage === 'implement' ? nextItem.tickets.find(candidate => candidate.status !== 'resolved' && !blocked(nextItem, candidate.id).length)?.id : undefined);
    setView(nextView); setItemId(nextItemId); setTicketId(nextTicket); setRunId(nextRunId); setStageId(nextStage);
    setAgent(nextItem?.stages.find(candidate => candidate.stageId === nextStage)?.agent ?? 'claude');
    setTab(nextView === 'review' ? 'Checks' : nextTicket ? 'Tickets' : 'Spec');
    setTerminal(false); setDraft(''); setNotice(''); followRef.current = true;
    if (nextItemId) setExpanded(previous => previous.includes(nextItemId) ? previous : [...previous, nextItemId]);
    streamRef.current?.scrollTo({ top: 0 });
  }

  function start(override?: string) {
    if (!item || !stage) return;
    const targetStage = override ?? stage.stageId;
    const targetTicket = targetStage === 'implement' ? ticketId : undefined;
    const compiled = select.brief({ itemId: item.id, stageId: targetStage, agent, ticketId: targetTicket });
    const started = actions.startRun({ itemId: item.id, stageId: targetStage, agent, ticketId: targetTicket });
    setBriefs(previous => ({ ...previous, [started]: compiled })); setRunId(started); setStageId(targetStage); setTerminal(false);
    followRef.current = true; setNotice(`Started ${started} with ${state.agents.find(candidate => candidate.id === agent)?.name}.`);
  }

  function pickStage(nextStage: string) {
    if (!item) return;
    setStageId(nextStage); setTicketId(nextStage === 'implement' ? item.tickets.find(candidate => candidate.status !== 'resolved' && !blocked(item, candidate.id).length)?.id : undefined);
    setAgent(item.stages.find(candidate => candidate.stageId === nextStage)?.agent ?? 'claude'); setRunId(undefined); setTerminal(false);
  }

  function sendNote() {
    if (!draft.trim() || !active) return;
    setNotes(previous => [...previous, { runId: active.id, text: draft.trim() }]); setDraft(''); followRef.current = true;
    setNotice('Steering note recorded locally; scripted agent output is unchanged.');
  }

  function sendBack() {
    if (!item) return;
    const fixStage = item.workflowId === 'bug' ? 'fix' : item.workflowId === 'quick' ? 'do' : 'implement';
    if (active) actions.stopRun(active.id);
    actions.sendBack(item.id);
    navigate('session', item.id);
    setStageId(fixStage); setAgent(item.stages.find(candidate => candidate.stageId === fixStage)?.agent ?? 'claude');
    setNotice('Sent back. Resume the fix, then review the new commit.');
  }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || target?.closest('input, textarea, select, [contenteditable], dialog, [cmdk-dialog]') || paletteOpen || newOpen) return;
      if (event.key.toLowerCase() === 'c') { event.preventDefault(); setNewOpen(true); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [paletteOpen, newOpen]);

  useEffect(() => {
    if (followRef.current && run && streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [run?.events.length, notes.length]);

  useEffect(() => {
    if (run?.status === 'done' && run.ticketId && item?.tickets.find(candidate => candidate.id === run.ticketId)?.status === 'resolved') {
      const next = item.tickets.find(candidate => candidate.status !== 'resolved' && !blocked(item, candidate.id).length);
      setNotice(`Ticket ${run.ticketId} resolved. ${next ? `Ticket ${next.id} is now ready — continue below.` : 'All tickets complete.'}`);
    }
  }, [run?.status, item?.tickets]);

  const commands: PaletteCommand[] = [
    { id: 'needs-you', label: `Needs you · ${pending.length} pending`, group: 'Navigate', run: () => navigate('inbox') },
    { id: 'project', label: 'Project overview · milestones & roadmap', group: 'Navigate', run: () => navigate('project') },
    ...state.items.map(candidate => ({ id: candidate.id, label: `${candidate.id} · ${candidate.title}`, group: 'Work items', run: () => navigate('session', candidate.id) })),
    { id: 'new', label: 'Create new work item', group: 'Actions', shortcut: 'c', run: () => setNewOpen(true) },
    { id: 'resume', label: 'Preview resume · F-12 ticket 02', group: 'Actions', run: () => navigate('session', 'F-12', '02') },
    { id: 'review', label: 'Open B-31 review', group: 'Actions', run: () => navigate('review', 'B-31') },
    ...(canStart ? [{ id: 'start', label: `Start ${definition?.name} with ${state.agents.find(candidate => candidate.id === agent)?.name}`, group: 'Actions', run: () => start() }] : []),
    ...(active ? [{ id: 'stop', label: `Stop ${active.id} and leave handoff`, group: 'Actions', run: () => actions.stopRun(active.id) }] : []),
  ];

  function treeItem(candidate: WorkItem) {
    const candidateStage = currentStage(candidate);
    const candidateRun = select.activeRun(candidate.id);
    const candidateShipped = candidate.pr?.state === 'merged';
    const isExpanded = expanded.includes(candidate.id);
    const count = pending.filter(entry => entry.itemId === candidate.id).length;
    return <div key={candidate.id} className="c-tree-item">
      <div className={`c-item-row ${itemId === candidate.id ? 'is-selected' : ''}`}>
        <button className="c-icon-button c-expand" aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${candidate.id}`} aria-expanded={isExpanded} onClick={() => setExpanded(previous => isExpanded ? previous.filter(id => id !== candidate.id) : [...previous, candidate.id])}>{isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button>
        <button className="c-item-link" onClick={() => navigate('session', candidate.id)} aria-current={itemId === candidate.id ? 'page' : undefined} title={candidate.title}>
          <StatusIcon status={candidateShipped ? 'shipped' : candidateRun?.status ?? candidateStage?.status ?? 'todo'} size={13} />
          <span className="c-tree-copy"><span><code>{candidate.id}</code> {candidate.title}</span><small>{candidateShipped ? 'Shipped' : candidateStage?.stageId ?? 'Not started'}{candidate.tickets.some(ticket => blocked(candidate, ticket.id).length) ? ' · blocked tickets' : ''}</small></span>
          {!!count && <span className="c-tree-count">{count}</span>}
        </button>
      </div>
      {isExpanded && <div className="c-tree-children">
        {candidate.tickets.map(candidateTicket => <button key={candidateTicket.id} className={`c-child-row ${itemId === candidate.id && ticketId === candidateTicket.id && !runId ? 'is-selected' : ''}`} onClick={() => navigate('session', candidate.id, candidateTicket.id)} title={candidateTicket.path}><StatusIcon size={12} status={blocked(candidate, candidateTicket.id).length ? 'blocked' : candidateTicket.status} /><span><code>{candidateTicket.id}</code> {candidateTicket.title}</span></button>)}
        {select.runsFor(candidate.id).map(candidateRun => <button key={candidateRun.id} className={`c-child-row c-run-link ${runId === candidateRun.id ? 'is-selected' : ''}`} onClick={() => navigate('session', candidate.id, candidateRun.ticketId, candidateRun.id)}><StatusIcon status={candidateRun.status} size={12} /><code>{candidateRun.id}</code><AgentBadge agent={candidateRun.agent} showName={false} /><small>{candidateRun.status}</small></button>)}
        {!candidate.tickets.length && !select.runsFor(candidate.id).length && <span className="c-tree-empty">No sessions yet</span>}
      </div>}
    </div>;
  }

  const openItem = (id: string) => navigate('session', id);
  const openReview = (id: string) => navigate('review', id);

  return <main className={`c-cockpit ${import.meta.env.DEV ? 'c-development' : ''}`}>
    <header className="c-topbar"><div className="c-brand"><span className="c-brand-mark"><Workflow size={18} /></span><strong>workbench</strong><span className="c-top-divider" /><span className="c-muted">{state.project.name}</span><ChevronRight size={12} /><span>Cockpit</span></div><div className="c-top-actions"><span className="c-local"><span />Local workspace</span><button className="c-search" onClick={() => setPaletteOpen(true)}><Search size={14} /><span>Jump to anything</span><Kbd>⌘ K</Kbd></button><button className="c-icon-button" title="New work item (c)" aria-label="New work item" onClick={() => setNewOpen(true)}><Plus size={17} /></button></div></header>
    <div className="c-layout">
      <nav className="c-tree" aria-label="Project tree">
        <button className={`c-project-header ${view === 'project' ? 'is-selected' : ''}`} onClick={() => navigate('project')}><span className="c-project-avatar">L</span><span><strong>{state.project.name}</strong><code>{state.project.path}</code></span><Layers size={14} /></button>
        <button className={`c-inbox-link ${view === 'inbox' ? 'is-selected' : ''}`} onClick={() => navigate('inbox')}><Inbox size={16} /><span>Needs you</span><span className="c-count">{pending.length}</span></button>
        <div className="c-tree-label"><span>WORKSPACE</span><button className="c-icon-button" aria-label="Create work item" onClick={() => setNewOpen(true)}><Plus size={13} /></button></div>
        <div className="c-tree-scroll">{[...state.milestones].sort((left, right) => Number(left.status === 'shipped') - Number(right.status === 'shipped')).map(milestone => <details className="c-milestone" key={milestone.id} open={milestone.status !== 'shipped'}><summary><ChevronRight size={12} /><span>{milestone.name}</span><small>{state.items.filter(candidate => candidate.milestoneId === milestone.id).length}</small></summary>{state.items.filter(candidate => candidate.milestoneId === milestone.id).map(treeItem)}</details>)}{state.items.some(candidate => !candidate.milestoneId) && <details className="c-milestone" open><summary><ChevronRight size={12} /><span>Unscheduled</span></summary>{state.items.filter(candidate => !candidate.milestoneId).map(treeItem)}</details>}</div>
        <div className="c-tree-footer"><GitBranch size={13} /><code>{state.project.branch}</code><span>Markdown tracker</span></div>
      </nav>
      <section className="c-center" aria-label={view === 'review' ? 'Review diff' : 'Session workspace'}>
        <header className="c-pane-header"><span className="c-eyebrow">{view === 'inbox' ? 'ATTENTION QUEUE' : view === 'project' ? 'PROJECT OVERVIEW' : `${item?.id ?? ''} / ${view === 'review' ? 'REVIEW' : 'SESSION'}`}</span><div className="c-header-actions">{item && review && <button className={`c-text-button ${view === 'review' ? 'is-active' : ''}`} onClick={() => { setView(view === 'review' ? 'session' : 'review'); setTab('Checks'); setTerminal(false); }}>{view === 'review' ? <MessageSquare size={13} /> : <GitBranch size={13} />}{view === 'review' ? 'Session' : 'Review'}</button>}{run && view === 'session' && <button className={`c-text-button ${terminal ? 'is-active' : ''}`} onClick={() => setTerminal(value => !value)} aria-pressed={terminal}><Terminal size={13} />{terminal ? 'Stream' : 'Terminal'}</button>}</div></header>
        <div className="c-stream" ref={streamRef} onScroll={() => { const element = streamRef.current; if (element) followRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100; }}>
          {view === 'inbox' && <div className="c-inbox-stack"><div className="c-page-intro"><span className="c-overline">HUMAN IN THE LOOP</span><h1>Your next move<span className="c-heading-dot">.</span></h1><p>{pending.length ? `${pending.length} decisions waiting. Keep your agents moving.` : 'All caught up. Your agents have what they need.'}</p></div><div className="c-queue-summary"><span><MessageSquare size={13} />{select.counts().question} question</span><span><Square size={12} />{select.counts().permission} permission</span><span><FileText size={13} />{select.counts().approval + select.counts().review} reviews</span><span><Layers size={13} />{select.counts().memory} memory</span></div>{pending.map(entry => <InboxCard key={entry.id} entry={entry} openItem={openItem} openReview={openReview} />)}{!pending.length && <div className="c-empty"><Check size={28} /><h2>Nothing needs you right now</h2><p>Explore the roadmap, or start something new.</p><button className="c-button" onClick={() => navigate('project')}>Open project <ArrowRight size={14} /></button></div>}<details className="c-completed"><summary>{state.inbox.filter(entry => entry.resolved).length} completed decisions</summary>{state.inbox.filter(entry => entry.resolved).map(entry => <div key={entry.id}><Check size={12} /><span>{entry.itemId} · {entry.title}</span><small>{entry.resolved!.answer}</small></div>)}</details></div>}

          {view === 'project' && <div className="c-roadmap"><div className="c-page-intro"><span className="c-overline">{state.project.path}</span><h1>A little more shipped.</h1><p>Clear milestones. A session behind every step.</p></div><div className="c-project-stats"><div><strong>{state.items.filter(candidate => candidate.pr?.state === 'merged').length}</strong><span>Shipped</span></div><div><strong>{state.runs.filter(candidate => ['running', 'waiting'].includes(candidate.status)).length}</strong><span>Live sessions</span></div><div><strong>{pending.length}</strong><span>Need you</span></div></div>{[...state.milestones, { id: undefined, name: 'Unscheduled', description: 'New work awaiting a milestone.', status: 'planned', target: undefined }].filter(milestone => state.items.some(candidate => candidate.milestoneId === milestone.id)).map(milestone => <section className="c-roadmap-milestone" key={milestone.id ?? 'unscheduled'}><header><StatusIcon status={milestone.status === 'shipped' ? 'shipped' : milestone.status === 'active' ? 'active' : 'todo'} /><h2>{milestone.name}</h2><small>{milestone.target ? `Target ${milestone.target}` : milestone.status}</small></header><p>{milestone.description}</p>{state.items.filter(candidate => candidate.milestoneId === milestone.id).map(candidate => <button className="c-roadmap-item" key={candidate.id} onClick={() => navigate('session', candidate.id)}><StatusIcon status={candidate.pr?.state === 'merged' ? 'shipped' : select.activeRun(candidate.id)?.status ?? currentStage(candidate)?.status ?? 'todo'} /><span><code>{candidate.id}</code><strong>{candidate.title}</strong><small>{candidate.nextAction}</small></span><small>{candidate.pr?.state === 'merged' ? 'Shipped' : currentStage(candidate)?.stageId}{candidate.tickets.some(ticket => blocked(candidate, ticket.id).length) ? ' · blocked' : ''}</small><ChevronRight size={14} /></button>)}</section>)}</div>}

          {item && view === 'session' && <div className="c-session"><div className="c-session-title"><div><span className="c-overline">{item.type} · {item.id}{ticket ? ` / ticket ${ticket.id}` : ''}</span><h1>{item.title}</h1>{ticket && <h2 className="c-selected-ticket">{ticket.id} · {ticket.title}</h2>}<p>{item.nextAction}</p></div>{active && <span className="c-session-status"><StatusIcon status={active.status} />{active.status === 'waiting' ? 'Needs you' : 'Streaming'}</span>}{shipped && <span className="c-session-status"><StatusIcon status="shipped" />Shipped</span>}</div>
            {brief && <BriefCard brief={brief} agent={run?.agent ?? agent} />}
            {ticket && <div className={`c-ticket-readiness ${ticket.status === 'resolved' ? 'is-success' : ''}`}><StatusIcon status={blocked(item, ticket.id).length ? 'blocked' : ticket.status} /><span>Ticket {ticket.id} · {ticket.status}{blocked(item, ticket.id).length ? ` · Blocked by ${blocked(item, ticket.id).join(', ')}` : ticket.status !== 'resolved' ? ' · ready to work' : ' · dependency unblocked'}</span></div>}
            {runs.filter(candidate => candidate.id !== run?.id).map(previous => <details className="c-run-history" key={previous.id}><summary><ChevronRight size={12} /><code>{previous.id}</code><AgentBadge agent={previous.agent} /><span>{previous.status} {relativeTime(previous.endedAt ?? previous.startedAt, state.now)}</span><small>expand</small></summary><RunEvents run={previous} openItem={openItem} openReview={openReview} /></details>)}
            {run ? <><div className="c-run-heading"><StatusIcon status={run.status} /><code>{run.id}</code><AgentBadge agent={run.agent} /><span>{run.stageId}{run.ticketId ? ` / ${run.ticketId}` : ''}</span><small>{relativeTime(run.startedAt, state.now)}</small></div>{terminal ? <><TerminalView run={run} className="c-terminal" />{itemPending.filter(entry => entry.runId === run.id && ['question', 'permission'].includes(entry.kind)).map(entry => <InboxCard key={entry.id} entry={entry} openItem={openItem} openReview={openReview} />)}</> : <RunEvents run={run} openItem={openItem} openReview={openReview} />}{notes.filter(note => note.runId === run.id).map((note, index) => <div className="c-your-message" key={index}><span>You · local steering note</span><p>{note.text}</p></div>)}</> : <div className="c-session-ready"><ArrowRight size={16} /><p>{ticket ? `The context is ready. ${ticketHasRun ? 'Resume' : 'Start'} ticket ${ticket.id} below.` : 'The context is ready. Start the next session below.'}</p></div>}
            {itemPending.filter(entry => !run || entry.runId !== run.id || !['question', 'permission'].includes(entry.kind)).map(entry => <InboxCard key={entry.id} entry={entry} openItem={openItem} openReview={openReview} />)}
          </div>}

          {item && view === 'review' && <div className="c-review"><div className="c-session-title"><div><span className="c-overline">REVIEW · PR #{item.pr?.number ?? '—'}</span><h1>{item.title}</h1><p>{review?.files.length ?? 0} files · {review?.findings.filter(finding => finding.status === 'open').length ?? 0} open threads</p></div></div>{review ? <><div className="c-review-commit"><GitBranch size={13} /><code>{review.branch}</code><ArrowRight size={12} /><code>{review.baseBranch}</code><code>{review.commit}</code></div>{!fresh && <div className="c-alert"><strong>Evidence changed. Re-review before merging.</strong><p>These lines and findings belong to <code>{review.commit}</code>. Checks now report <code>{review.checksCommit}</code>.</p><button className="c-button" disabled={!canRereview} onClick={() => start('review')}>Re-review {review.checksCommit} <ArrowRight size={13} /></button></div>}{itemPending.filter(entry => entry.kind === 'permission').map(entry => <InboxCard key={entry.id} entry={entry} openItem={openItem} openReview={openReview} />)}{active && <div className="c-review-live"><StatusIcon status={active.status} /><span>{active.id} · {active.status === 'waiting' ? 'Waiting for permission' : 'Refreshing review evidence'}</span><button className="c-text-button" onClick={() => { setRunId(active.id); setView('session'); }}>Watch session <ArrowRight size={12} /></button></div>}<DiffView files={review.files} renderLineContent={(line, path) => review.findings.filter(finding => finding.line === line && finding.path === path).map(finding => <FindingThread key={finding.id} finding={finding} />)} />{!review.findings.length && <div className="c-success"><Check size={15} />No findings on this reviewed commit. Diff and checks are current.</div>}</> : <div className="c-empty"><GitBranch size={24} /><h2>No review evidence yet</h2><p>Complete implementation, then start a review.</p><button className="c-button" onClick={() => setView('session')}>Back to session</button></div>}</div>}
        </div>

        {item && <footer className="c-composer">
          {notice && <p className="c-notice" role="status">{notice}</p>}
          {view === 'review' ? <><div className="c-review-footer"><span>{shipped ? `PR #${item.pr?.number} merged` : reviewReady ? 'Evidence is fresh. Ready for your decision.' : 'Resolve findings and refresh checks before merge.'}</span><div><button className="c-button" disabled={shipped || (!!active && active.stageId !== 'review')} onClick={sendBack}>Send back</button><button className="c-button c-primary" disabled={!canMerge} onClick={() => { actions.approveStage(item.id, 'review'); actions.merge(item.id); setNotice(`PR #${item.pr?.number} merged. Work item shipped.`); }}><GitMerge size={14} />Merge</button></div></div><div className="c-composer-meta"><AgentPicker value={agent} onChange={setAgent} label="Review agent" disabled={!!active || shipped} />{active && <button className="c-text-button c-danger" onClick={() => actions.stopRun(active.id)}><Square size={11} />Stop</button>}{!active && !shipped && item.stages.find(candidate => candidate.stageId === 'review')?.status === 'waiting' && <button className="c-text-button" disabled={!canRereview} onClick={() => start('review')}>Run another review <ArrowRight size={12} /></button>}</div></> : <><div className="c-composer-heading"><span><StatusIcon status={stage?.status ?? 'todo'} />{definition?.name ?? 'Complete'}{ticket ? ` / ticket ${ticket.id}` : ''}</span><AgentPicker value={agent} onChange={next => { setAgent(next); if (stage) actions.setStageAgent(item.id, stage.stageId, next); }} label="Session agent" disabled={!!active || shipped} /></div><div className="c-composer-input"><textarea ref={composerRef} rows={2} aria-label="Steer the agent" value={draft} disabled={!active} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); sendNote(); } }} placeholder={active ? 'Add direction to this session…  ⌘↵' : shipped ? 'This work item has shipped.' : 'Your brief is ready. Choose an agent and start.'} /><button className="c-icon-button" aria-label="Send steering note" disabled={!active || !draft.trim()} onClick={sendNote}><Send size={16} /></button></div><div className="c-composer-bottom"><div className="c-skill-chips">{workflow?.stages.filter(candidate => candidate.skill && ['active', 'waiting'].includes(item.stages.find(stage => stage.stageId === candidate.id)!.status)).map(candidate => <button key={candidate.id} disabled={!!active} onClick={() => pickStage(candidate.id)} title={`Prepare ${candidate.name} brief`}>{candidate.skill}</button>)}{run && <button onClick={() => setTerminal(value => !value)} aria-pressed={terminal}><Terminal size={12} />{terminal ? 'Stream' : 'Terminal'}</button>}</div>{active ? <button className="c-button c-stop" onClick={() => { actions.stopRun(active.id); setNotice('Stopped. Completed edits remain; handoff saved.'); }}><Square size={11} />Stop</button> : shipped ? <span className="c-muted">Shipped ✓</span> : nextStage && nextStage.stageId !== stage?.stageId ? <button className="c-button c-primary" onClick={() => pickStage(nextStage.stageId)}>Prepare {workflow?.stages.find(candidate => candidate.id === nextStage.stageId)?.name}<ArrowRight size={13} /></button> : ticket?.status === 'resolved' ? <button className="c-button c-primary" disabled={!item.tickets.some(candidate => candidate.status !== 'resolved' && !blocked(item, candidate.id).length)} onClick={() => { const next = item.tickets.find(candidate => candidate.status !== 'resolved' && !blocked(item, candidate.id).length); if (next) navigate('session', item.id, next.id); }}>Next ready ticket <ArrowRight size={13} /></button> : <button className="c-button c-primary" disabled={!canStart} onClick={() => start()}>{ticket ? `${ticketHasRun ? 'Resume' : 'Start'} ticket ${ticket.id}` : `Start ${definition?.name ?? 'session'}`}<ArrowRight size={13} /></button>}</div>{active && <small className="c-demo-note">Steering notes are local to this demo; agent output follows a scripted simulation.</small>}</>}
        </footer>}
      </section>

      <aside className="c-context" aria-label="Selection context">
        <header className="c-pane-header"><span className="c-eyebrow">CONTEXT</span><span className="c-muted">{item?.id ?? state.project.name}</span></header>
        {item && <section className="c-stages" aria-label="Workflow stages"><header><Workflow size={13} /><span>{workflow?.name} workflow</span><small>{item.stages.filter(candidate => candidate.status === 'done').length}/{item.stages.length}</small></header>{workflow?.stages.map(definition => { const stageState = item.stages.find(candidate => candidate.stageId === definition.id)!; return <div className={`c-stage ${stage?.stageId === definition.id ? 'is-current' : ''}`} key={definition.id}><button onClick={() => pickStage(definition.id)} title={stageState.approvedCommit ? `Approved by ${stageState.approvedBy} · ${stageState.approvedCommit}` : definition.skill}><StatusIcon status={stageState.status} size={13} /><span>{definition.name}</span></button><AgentPicker compact value={stageState.agent ?? 'claude'} label={`${definition.name} agent`} disabled={shipped} onChange={next => { actions.setStageAgent(item.id, definition.id, next); if (stage?.stageId === definition.id) setAgent(next); }} /></div>; })}</section>}
        <div className="c-tabs" role="tablist" aria-label="Context tabs">{tabs.map(candidate => <button role="tab" id={`c-tab-${candidate}`} aria-controls="c-context-content" aria-selected={tab === candidate} tabIndex={tab === candidate ? 0 : -1} className={tab === candidate ? 'is-active' : ''} key={candidate} onClick={() => setTab(candidate)} onKeyDown={event => { if (['ArrowRight', 'ArrowLeft'].includes(event.key)) { event.preventDefault(); const next = tabs[(tabs.indexOf(candidate) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; setTab(next); document.getElementById(`c-tab-${next}`)?.focus(); } }}>{candidate}{candidate === 'Tickets' && !!item?.tickets.length && <small>{item.tickets.length}</small>}</button>)}</div>
        <div className="c-context-scroll" id="c-context-content" role="tabpanel" aria-labelledby={`c-tab-${tab}`}>
          {tab === 'Spec' && (item ? item.artifacts.length ? item.artifacts.map(artifact => <section className="c-artifact" key={artifact.path}><header><FileText size={13} /><code>{artifact.path}</code></header>{artifact.changedSinceLastRun && <div className="c-artifact-changed">Changed since last run · reread before resuming</div>}<MarkdownView content={artifact.content} /></section>) : <div className="c-context-empty"><FileText size={24} /><h3>No spec yet</h3><p>Start Clarify to agree the scope. Files arrive as the workflow progresses.</p><code>.scratch/{item.slug}/</code></div> : <><div className="c-context-intro"><span className="c-overline">YOUR WORKSPACE</span><h2>Small steps.<br />Shared context.</h2><p>Sessions come and go. The files remember.</p><code>{state.project.path}</code></div><section className="c-workspace-summary"><h3>In flight</h3>{state.runs.filter(candidate => ['running', 'waiting'].includes(candidate.status)).map(candidate => <button key={candidate.id} onClick={() => navigate('session', candidate.itemId, candidate.ticketId, candidate.id)}><StatusIcon status={candidate.status} /><span>{candidate.itemId}<small>{select.item(candidate.itemId)?.title}</small></span><AgentBadge agent={candidate.agent} showName={false} /></button>)}</section><section className="c-artifact"><header><FileText size={13} /><code>AGENTS.md</code></header><p className="c-muted">TypeScript · React · SQLite<br />Local-first. Markdown is the source of truth.</p><button className="c-text-button" onClick={() => setTab('Memory')}>Explore project memory <ArrowRight size={12} /></button></section></>)}
          {tab === 'Tickets' && <><div className="c-context-heading"><h3>{item?.id ?? 'Project'} tickets</h3><span>Dependency order</span></div>{!item?.tickets.length && <div className="c-context-empty"><Layers size={24} /><h3>No tickets here yet</h3><p>{item ? 'Tickets are generated after spec approval.' : 'Select F-12 to inspect the import task chain.'}</p>{!item && <button className="c-button" onClick={() => navigate('session', 'F-12', '02')}>Open F-12</button>}</div>}{item?.tickets.map(candidate => <details className={`c-context-ticket ${candidate.id === ticketId ? 'is-current' : ''}`} key={candidate.id} open={candidate.id === ticketId}><summary><StatusIcon status={blocked(item, candidate.id).length ? 'blocked' : candidate.status} /><span><strong>{candidate.id} · {candidate.title}</strong><small>{candidate.status === 'resolved' ? 'Resolved' : blocked(item, candidate.id).length ? `Blocked by: ${blocked(item, candidate.id).join(', ')}` : 'Blocked by: none · ready'}</small></span></summary><code className="c-path">{candidate.path}</code><MarkdownView content={candidate.body} />{candidate.comments.map((comment, index) => <div className="c-ticket-comment" key={index}><strong>{comment.author}</strong><small>{relativeTime(comment.at, state.now)}</small><p>{comment.text}</p></div>)}<button className="c-button" onClick={() => navigate('session', item.id, candidate.id)}>{candidate.status === 'resolved' ? 'View session context' : `Prepare ticket ${candidate.id}`}<ArrowRight size={12} /></button></details>)}</>}
          {tab === 'Memory' && <><div className="c-context-heading"><h3>Durable memory</h3><span>Proposals need your approval</span></div>{state.proposals.filter(proposal => !item || proposal.itemId === item.id).map(proposal => <details className="c-memory" key={proposal.id} open={proposal.status === 'proposed'}><summary><StatusIcon status={proposal.status === 'accepted' ? 'done' : proposal.status === 'rejected' ? 'skipped' : 'waiting'} /><span>{proposal.summary}<small>{proposal.status}</small></span></summary><code className="c-path">{proposal.target}</code><DiffView diff={proposal.diff} />{proposal.status === 'proposed' && <div className="c-card-actions"><button className="c-button" onClick={() => actions.decideProposal(proposal.id, false)}>Reject</button><button className="c-button c-primary" onClick={() => actions.decideProposal(proposal.id, true)}>Accept change</button></div>}</details>)}<section className="c-artifact"><header><FileText size={13} /><code>GLOSSARY.md</code></header>{state.glossary.map(entry => <p className="c-glossary" key={entry.term}><strong>{entry.term}</strong>{entry.definition}</p>)}</section>{state.adrs.map(adr => <details className="c-memory" key={adr.path}><summary><FileText size={13} /><span>{adr.title}</span></summary><code className="c-path">{adr.path}</code><MarkdownView content={adr.content} /></details>)}</>}
          {tab === 'Checks' && (review ? <ChecksPanel review={review} /> : <div className="c-context-empty"><Check size={24} /><h3>No check evidence yet</h3><p>{item ? 'Checks arrive with a completed implementation or review.' : 'Select B-31 to inspect checks tied to its commit.'}</p>{!item && <button className="c-button" onClick={() => navigate('review', 'B-31')}>Open B-31 review</button>}</div>)}
        </div>
        <footer className="c-context-footer"><span className="c-local"><span />Files are the source of truth</span>{item?.branch && <code title={item.worktree}>{item.branch}</code>}</footer>
      </aside>
    </div>
    <footer className="c-statusbar"><span><span className="c-status-dot" />{state.project.name}<span>/</span>local-markdown</span><span>{state.runs.filter(candidate => candidate.status === 'running').length} running · {state.proposals.filter(proposal => proposal.status === 'proposed').length} proposed memories</span><span><Kbd>c</Kbd> new item <Kbd>⌘ K</Kbd> commands</span></footer>
    <CommandPalette commands={commands} open={paletteOpen} onOpenChange={setPaletteOpen} />
    {newOpen && <NewItemDialog close={() => setNewOpen(false)} create={(title, type) => { actions.createItem({ title, type }); setNewOpen(false); navigate('project'); }} />}
  </main>;
}

function NewItemDialog({ close, create }: { close: () => void; create: (title: string, type: ItemType) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ItemType>('feature');
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  return <dialog ref={dialogRef} className="c-new-dialog" aria-labelledby="c-new-title" onCancel={close} onClick={event => { if (event.target === dialogRef.current) close(); }}><form onSubmit={event => { event.preventDefault(); if (title.trim()) create(title, type); }}><header><span><Plus size={16} /><h2 id="c-new-title">New work item</h2></span><button type="button" className="c-icon-button" aria-label="Close new item" onClick={close}><X size={16} /></button></header><label htmlFor="c-item-title">What are we building?</label><input id="c-item-title" autoFocus required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} placeholder="A short, clear title" /><label htmlFor="c-item-type">Workflow</label><select id="c-item-type" value={type} onChange={event => setType(event.target.value as ItemType)}><option value="feature">Feature · clarify → ship</option><option value="bug">Bug · diagnose → ship</option><option value="quick">Quick task · do → ship</option></select><p>Starts unscheduled. Context and tickets grow with the workflow.</p><footer><button type="button" className="c-button" onClick={close}>Cancel</button><button className="c-button c-primary" type="submit" disabled={!title.trim()}>Create work item <ArrowRight size={13} /></button></footer></form></dialog>;
}
