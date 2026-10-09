import { useState } from 'react';
import { ArrowRight, Check, ChevronRight, FileText, GitBranch, HelpCircle, ShieldCheck, Sparkles, Terminal } from 'lucide-react';
import { useWorkbench } from '../../proto/store';
import type { AgentId, Brief, Finding, InboxEntry, Review, Run, RunEvent } from '../../proto/types';
import { AgentBadge, DiffView, MarkdownView, StatusIcon, relativeTime } from '../../proto/ui';

export function AgentPicker({ value, onChange, label, compact = false, disabled = false }: { value: AgentId; onChange: (agent: AgentId) => void; label: string; compact?: boolean; disabled?: boolean }) {
  const { state } = useWorkbench();
  return <label className={`c-agent-picker ${compact ? 'is-compact' : ''}`}><AgentBadge agent={value} showName={false} /><select aria-label={label} value={value} disabled={disabled} onChange={event => onChange(event.target.value as AgentId)}>{state.agents.map(agent => <option key={agent.id} value={agent.id} disabled={!agent.available}>{compact && agent.available ? agent.name.replace(' Code', '').replace(' Build', '') : agent.name}{!agent.available ? ` — ${agent.note}` : ''}</option>)}</select></label>;
}

export function InboxCard({ entry, openItem, openReview }: { entry: InboxEntry; openItem: (id: string) => void; openReview: (id: string) => void }) {
  const { state, actions, select } = useWorkbench();
  const [answer, setAnswer] = useState('');
  const [read, setRead] = useState(false);
  const item = select.item(entry.itemId);
  const proposal = state.proposals.find(candidate => candidate.id === entry.proposalId);
  const files = item?.artifacts.filter(artifact => entry.stageId === 'spec' ? artifact.kind === 'spec' : true) ?? [];
  const icons = { question: HelpCircle, permission: ShieldCheck, approval: FileText, review: GitBranch, memory: Sparkles };
  const Icon = icons[entry.kind];
  return <article className={`c-attention-card c-kind-${entry.kind}`} aria-label={`${entry.itemId}: ${entry.title}`}>
    <header><span className="c-card-kind"><Icon size={14} />{entry.kind === 'approval' ? 'Approval' : entry.kind === 'memory' ? 'Memory proposal' : entry.kind}</span><button className="c-item-reference" onClick={() => openItem(entry.itemId)} title={item?.title}>{entry.itemId}<ChevronRight size={11} /></button><small>{relativeTime(entry.createdAt, state.now)}</small></header>
    <div className="c-card-byline">{entry.agent && <AgentBadge agent={entry.agent} />}<span>{item?.title}</span>{entry.runId && <code>{entry.runId}</code>}</div>
    <h2>{entry.title}</h2>{entry.detail && <p className="c-card-detail">{entry.detail}</p>}
    {entry.kind === 'question' && <form onSubmit={event => { event.preventDefault(); if (answer.trim()) actions.answerQuestion(entry.id, answer); }}><div className="c-answer-options" role="group" aria-label="Suggested answers">{entry.options?.map(option => <button className="c-answer-option" key={option.id} type="button" onClick={() => actions.answerQuestion(entry.id, option.id)}><span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span><ArrowRight size={14} /></button>)}</div>{entry.allowFreeText && <div className="c-free-answer"><input aria-label={`Custom answer for ${entry.itemId}`} value={answer} onChange={event => setAnswer(event.target.value)} placeholder="Or answer in your own words…" /><button type="submit" className="c-button" disabled={!answer.trim()}>Answer <ArrowRight size={12} /></button></div>}</form>}
    {entry.kind === 'permission' && <><div className="c-command"><Terminal size={13} /><code>{entry.command}</code></div><div className="c-card-actions"><span>One-time permission · local execution</span><button className="c-button" onClick={() => actions.decidePermission(entry.id, false)}>Deny</button><button className="c-button c-primary" onClick={() => actions.decidePermission(entry.id, true)}><Check size={13} />Allow command</button></div></>}
    {entry.kind === 'approval' && <><details className="c-spec-preview" onToggle={event => { if (event.currentTarget.open) setRead(true); }}><summary><FileText size={13} /><span>Read {entry.stageId === 'tickets' ? 'ticket scope' : 'spec & acceptance criteria'}</span><ChevronRight size={13} /></summary>{files.map(file => <section key={file.path}><code className="c-path">{file.path}</code><MarkdownView content={file.content} /></section>)}{entry.stageId === 'tickets' && item?.tickets.map(ticket => <section key={ticket.id}><code className="c-path">{ticket.path}</code><MarkdownView content={ticket.body} /></section>)}</details><div className="c-card-actions"><span>{read ? 'Scope opened. Your approval is the gate.' : 'Read the scope before approving.'}</span><button className="c-button c-primary" disabled={!read || !entry.stageId} onClick={() => { if (entry.stageId) actions.approveStage(entry.itemId, entry.stageId); }}><Check size={13} />Approve {entry.stageId}</button></div></>}
    {entry.kind === 'memory' && proposal && <><code className="c-path">{proposal.target}</code><DiffView diff={proposal.diff} /><div className="c-card-actions"><span>Never written without your approval</span><button className="c-button" onClick={() => actions.decideProposal(proposal.id, false)}>Reject</button><button className="c-button c-primary" onClick={() => actions.decideProposal(proposal.id, true)}>Accept change <Check size={13} /></button></div></>}
    {entry.kind === 'review' && <div className="c-card-actions"><span>Spec + standards · commit {select.review(entry.itemId)?.commit}</span><button className="c-button c-primary" onClick={() => openReview(entry.itemId)}>Open review <ArrowRight size={13} /></button></div>}
  </article>;
}

export function BriefCard({ brief, agent }: { brief: Brief; agent: AgentId }) {
  return <section className="c-brief"><header><span><Sparkles size={14} />BRIEF IN</span><AgentBadge agent={agent} /></header><p className="c-brief-caption">A new session. No starting from scratch.</p>{brief.lastHandoff && <div className="c-brief-handoff"><span>Last handoff <code>{brief.lastHandoff.runId}</code><AgentBadge agent={brief.lastHandoff.agent} /></span><p>{brief.lastHandoff.handoff.stoppedAt}</p>{brief.lastHandoff.handoff.unresolved.length > 0 && <details><summary>{brief.lastHandoff.handoff.unresolved.length} unresolved points</summary><ul>{brief.lastHandoff.handoff.unresolved.map(point => <li key={point}>{point}</li>)}</ul><code className="c-path">{brief.lastHandoff.handoff.suggestedNext}</code></details>}</div>}{brief.changedSince.length > 0 && <div className="c-brief-changes"><strong>Changed since the last session</strong>{brief.changedSince.map(change => <p key={change}>{change}</p>)}</div>}<details className="c-brief-pointers"><summary><FileText size={12} />{brief.pointers.length} file pointers <span>Read before acting</span></summary>{brief.pointers.map(pointer => <div key={pointer.path}><code>{pointer.path}</code><small>{pointer.why}</small></div>)}</details><details className="c-exact-prompt"><summary><Terminal size={12} />Exact prompt <span>Preview what the agent receives</span></summary><pre>{brief.prompt}</pre></details></section>;
}

export function RunEvents({ run, openItem, openReview }: { run: Run; openItem: (id: string) => void; openReview: (id: string) => void }) {
  const { state } = useWorkbench();
  const plans = new Map<string, { firstId: string; event: Extract<RunEvent, { kind: 'plan' }> }>();
  for (const event of run.events) {
    if (event.kind === 'plan') {
      const key = JSON.stringify(event.steps.map(step => step.text));
      plans.set(key, { firstId: plans.get(key)?.firstId ?? event.id, event });
    }
  }
  return <div className="c-events" role="log" aria-label={`${run.id} session events`} aria-live={['running', 'waiting'].includes(run.status) ? 'polite' : 'off'}>
    {run.events.map(event => {
      if (event.kind === 'system') return <div key={event.id} className="c-system-event"><span /><p>{event.text}</p></div>;
      if (event.kind === 'message') return <div className="c-agent-message" key={event.id}><AgentBadge agent={run.agent} avatar /><div>{event.text.startsWith('Brief received') ? <details className="c-received-brief"><summary>Received compiled brief <Check size={12} /></summary><pre>{event.text}</pre></details> : <MarkdownView content={event.text} />}</div></div>;
      if (event.kind === 'plan') {
        const plan = plans.get(JSON.stringify(event.steps.map(step => step.text)))!;
        if (event.id !== plan.firstId) return null;
        return <div className="c-plan" key={event.id}><header><span>PLAN</span><small>{plan.event.steps.filter(step => step.done).length}/{plan.event.steps.length}</small></header>{plan.event.steps.map(step => <div key={step.text} className={step.done ? 'is-done' : ''}><StatusIcon status={step.done ? 'done' : 'todo'} size={13} /><span>{step.text}</span></div>)}</div>;
      }
      if (event.kind === 'tool') return <details className={`c-tool ${event.status === 'error' ? 'has-error' : ''}`} key={event.id}><summary><Terminal size={13} /><code>{event.input}</code><StatusIcon status={event.status === 'ok' ? 'pass' : event.status === 'error' ? 'fail' : 'running'} size={12} /><ChevronRight size={12} /></summary><pre>{event.output ?? 'Waiting for output…'}</pre></details>;
      if (event.kind === 'file') return <div className="c-file-event" key={event.id}><FileText size={13} /><code>{event.path}</code><span>+{event.added}</span><small>−{event.removed}</small></div>;
      const entry = state.inbox.find(candidate => candidate.id === event.questionId);
      return entry ? entry.resolved ? <div key={event.id} className="c-resolved-event"><Check size={13} /><span>{entry.kind === 'permission' ? 'Permission' : 'Answer'}: {entry.resolved.answer}</span></div> : <InboxCard key={event.id} entry={entry} openItem={openItem} openReview={openReview} /> : null;
    })}
    {run.handoff && <section className="c-handoff"><header><StatusIcon status={run.status} /><strong>{run.status === 'stopped' ? 'Paused, not lost.' : 'Handoff out'}</strong><code>{run.id}</code></header><p>{run.handoff.stoppedAt}</p>{run.handoff.unresolved.length > 0 && <ul>{run.handoff.unresolved.map(point => <li key={point}>{point}</li>)}</ul>}<div><span>NEXT</span><code>{run.handoff.suggestedNext}</code></div></section>}
    {run.status === 'running' && <div className="c-streaming"><span /><span /><span /><small>{run.agent} is working</small></div>}
  </div>;
}

export function FindingThread({ finding }: { finding: Finding }) {
  const { actions } = useWorkbench();
  return <article className={`c-finding ${finding.status !== 'open' ? 'is-addressed' : ''}`} aria-label={`Finding at ${finding.path}:${finding.line}`}><header><span>{finding.axis}</span><span className={['major', 'blocker'].includes(finding.severity) ? 'c-danger' : ''}>{finding.severity}</span><code>L{finding.line}</code><small>{finding.status}</small></header><h3>{finding.title}</h3><p>{finding.body}</p><footer><AgentBadge agent={finding.agent} />{['open', 'sent-back'].includes(finding.status) ? <div><button className="c-button" onClick={() => actions.setFindingStatus(finding.id, 'accepted')}>Accept risk</button><button className="c-button" onClick={() => actions.setFindingStatus(finding.id, 'resolved')}><Check size={12} />Resolve</button></div> : <button className="c-text-button" onClick={() => actions.setFindingStatus(finding.id, 'open')}>Reopen thread</button>}</footer></article>;
}

export function ChecksPanel({ review }: { review: Review }) {
  const stale = review.commit !== review.checksCommit;
  return <section className="c-checks"><div className="c-context-heading"><h3>Commit evidence</h3><span>Checks are not transferable</span></div><dl><div><dt>Reviewed commit</dt><dd><code>{review.commit}</code></dd></div><div><dt>Checks commit</dt><dd><code>{review.checksCommit}</code></dd></div><div><dt>Branch</dt><dd><code>{review.branch}</code></dd></div></dl>{stale && <div className="c-alert"><strong>Stale evidence</strong><p>Findings and diff are from {review.commit}, but checks passed on {review.checksCommit}. Re-review the new commit before approval.</p></div>}<div className="c-check-list">{review.checks.map(check => <div key={check.name}><header><StatusIcon status={check.status} /><strong>{check.name}</strong><small>{check.durationSec ? `${check.durationSec}s` : check.status}</small></header><p>{check.detail ?? 'No detail recorded.'}</p></div>)}</div><div className="c-review-axis"><h3>Review threads</h3>{['spec', 'standards'].map(axis => <div key={axis}><span>{axis}</span><small>{review.findings.filter(finding => finding.axis === axis && ['open', 'sent-back'].includes(finding.status)).length} open</small></div>)}</div></section>;
}
