import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { agentsArtifact, initialState } from './data';
import { continuationFor, scriptFor, type ScriptStep } from './simulator';
import type { AgentId, Artifact, Brief, Finding, InboxEntry, InboxKind, ItemType, MemoryProposal, Run, RunEvent, StageState, WorkbenchState, WorkItem } from './types';

export interface StartRunInput { itemId: string; stageId: string; agent: AgentId; ticketId?: string }
export interface WorkbenchActions {
  answerQuestion(entryId: string, answer: string): void;
  decidePermission(entryId: string, allow: boolean): void;
  approveStage(itemId: string, stageId: string): void;
  setStageAgent(itemId: string, stageId: string, agent: AgentId): void;
  startRun(input: StartRunInput): string;
  stopRun(runId: string): void;
  decideProposal(proposalId: string, accept: boolean): void;
  setFindingStatus(findingId: string, status: Finding['status']): void;
  sendBack(itemId: string): void;
  merge(itemId: string): void;
  createItem(input: { title: string; type: ItemType }): void;
  reset(): void;
}

export function buildBrief(state: WorkbenchState, input: StartRunInput): Brief {
  const item = state.items.find(candidate => candidate.id === input.itemId);
  if (!item) throw new Error(`Unknown work item: ${input.itemId}`);
  const stage = state.workflows.find(workflow => workflow.id === item.workflowId)?.stages.find(candidate => candidate.id === input.stageId);
  if (!stage) throw new Error(`Unknown stage: ${input.stageId}`);
  const ticket = input.ticketId ? item.tickets.find(candidate => candidate.id === input.ticketId) : undefined;
  if (input.ticketId && !ticket) throw new Error(`Unknown ticket: ${input.ticketId}`);
  const relevant = state.runs.filter(run => run.itemId === item.id && run.handoff);
  const matching = relevant.filter(run => run.stageId === input.stageId && (!input.ticketId || run.ticketId === input.ticketId));
  const lastRun = [...(matching.length ? matching : relevant)].sort((left, right) => Date.parse(right.endedAt ?? right.startedAt) - Date.parse(left.endedAt ?? left.startedAt))[0];
  const pointers = [
    { path: agentsArtifact.path, why: 'Project conventions, checks, and handoff rules' },
    { path: 'GLOSSARY.md', why: `Domain language: ${state.glossary.map(entry => entry.term).join(', ')}` },
    ...state.adrs.map(adr => ({ path: adr.path, why: adr.title })),
    ...item.artifacts.map(file => ({ path: file.path, why: file.title })),
    ...(ticket ? [{ path: ticket.path, why: `Ticket ${ticket.id}: ${ticket.title}; blocking dependencies: ${ticket.blockedBy.join(', ') || 'none'}` }] : []),
  ];
  const changedSince = item.artifacts.filter(file => file.changedSinceLastRun).map(file => `${file.path} changed since ${lastRun?.id ?? 'the last run'}${item.id === 'F-12' && file.kind === 'spec' ? ': criterion 3 now requires duplicates within a 3-day window, not the same day' : ''}.`);
  const lastHandoff = lastRun?.handoff ? { runId: lastRun.id, agent: lastRun.agent, handoff: lastRun.handoff } : undefined;
  const command = `${stage.skill ?? 'Implement'} ${ticket?.path ?? `.scratch/${item.slug}/${input.stageId === 'spec' || input.stageId === 'clarify' ? '' : 'spec.md'}`}`;
  const agentName = state.agents.find(agent => agent.id === lastRun?.agent)?.name ?? lastRun?.agent;
  const prompt = `${command}\n\nRead first:\n${pointers.map(pointer => `- ${pointer.path} — ${pointer.why}`).join('\n')}\n\n${lastHandoff ? `Last handoff (${lastHandoff.runId}, ${agentName}):\n${lastHandoff.handoff.stoppedAt}\nUnresolved: ${lastHandoff.handoff.unresolved.join('; ') || 'none'}\nSuggested next: ${lastHandoff.handoff.suggestedNext}` : 'Last handoff: none — start from the project conventions and work item scope.'}\n\nChanged since:\n${changedSince.length ? changedSince.map(change => `- ${change}`).join('\n') : '- No changed artifacts recorded.'}\n\nWork in ${item.worktree ?? `../ledgerly-worktrees/${item.slug}`} on ${item.branch ?? `wb/${item.slug}`}. Record actual checks and leave a handoff; do not merge or accept memory proposals.`;
  return { itemId: item.id, stageId: input.stageId, ticketId: input.ticketId, skill: stage.skill, pointers, lastHandoff, changedSince, prompt };
}

type Command =
  | { type: 'reset' }
  | { type: 'start'; run: Run }
  | { type: 'step'; runId: string; step: ScriptStep; at: string }
  | { type: 'answer'; entryId: string; answer: string; permission?: boolean; at: string }
  | { type: 'stop'; runId: string; at: string }
  | { type: 'approve'; itemId: string; stageId: string; at: string }
  | { type: 'agent'; itemId: string; stageId: string; agent: AgentId }
  | { type: 'proposal'; proposalId: string; accept: boolean; at: string }
  | { type: 'finding'; findingId: string; status: Finding['status'] }
  | { type: 'send-back'; itemId: string; at: string }
  | { type: 'merge'; itemId: string; at: string }
  | { type: 'create'; item: WorkItem };

const isLive = (run: Run) => run.status === 'running' || run.status === 'waiting';
const resolve = (entry: InboxEntry, at: string, answer: string) => ({ ...entry, resolved: { at, answer } });
const updateItem = (state: WorkbenchState, itemId: string, update: (item: WorkItem) => WorkItem) => ({ ...state, items: state.items.map(item => item.id === itemId ? update(item) : item) });
const addEvent = (run: Run, event: RunEvent) => ({ ...run, events: [...run.events, event] });
const eventId = (run: Run) => `${run.id}-e${run.events.length}`;
const commitForRun = (run: Run) => (0x7cd0000 + Number(run.id.slice(2))).toString(16).slice(-7);

function advance(item: WorkItem, stageId: string, at: string, commit: string, approvedBy?: string): WorkItem {
  const index = item.stages.findIndex(stage => stage.stageId === stageId);
  return { ...item, updatedAt: at,
    stages: item.stages.map((stage, position) => position === index ? { ...stage, status: 'done', ...(approvedBy ? { approvedBy, approvedAt: at, approvedCommit: commit } : {}) } : position === index + 1 ? { ...stage, status: 'active' } : stage),
    nextAction: index < item.stages.length - 1 ? `Start ${item.stages[index + 1].stageId.charAt(0).toUpperCase()}${item.stages[index + 1].stageId.slice(1)}` : 'Shipped',
  };
}

function proposedContent(proposal: MemoryProposal) {
  return proposal.diff.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1)).join('\n').trim();
}

export function workbenchReducer(state: WorkbenchState, command: Command): WorkbenchState {
  if (command.type === 'reset') return structuredClone(initialState);
  if (command.type === 'create') return { ...state, items: [...state.items, command.item] };
  if (command.type === 'start') {
    const run = command.run;
    if (state.runs.some(existing => existing.itemId === run.itemId && isLive(existing))) return state;
    return updateItem({ ...state, now: run.startedAt, runs: [...state.runs, run] }, run.itemId, item => ({ ...item, branch: item.branch ?? `wb/${item.slug}`, worktree: item.worktree ?? `../ledgerly-worktrees/${item.slug}`, updatedAt: run.startedAt, nextAction: `Watch ${run.agent} ${run.stageId}`, stages: item.stages.map(stage => stage.stageId === run.stageId ? { ...stage, agent: run.agent, status: 'active' } : stage), tickets: item.tickets.map(ticket => ticket.id === run.ticketId ? { ...ticket, status: 'in-progress', agent: run.agent, body: ticket.body.replace(/^Status:.*$/m, 'Status: in-progress') } : ticket) }));
  }
  if (command.type === 'answer') {
    const entry = state.inbox.find(candidate => candidate.id === command.entryId && !candidate.resolved);
    if (!entry || !['question', 'permission'].includes(entry.kind)) return state;
    const resumed = state.runs.find(run => run.id === entry.runId && run.status === 'waiting');
    const next: WorkbenchState = { ...state, now: command.at, inbox: state.inbox.map(candidate => candidate.id === entry.id ? resolve(candidate, command.at, command.answer) : candidate),
      runs: state.runs.map(run => {
        if (run.id !== entry.runId || run.status !== 'waiting') return run;
        const event: RunEvent = command.permission !== undefined ? { id: eventId(run), at: command.at, kind: 'tool', tool: 'permission', input: entry.command ?? entry.title, output: command.permission ? 'Allowed by you' : 'denied by you', status: command.permission ? 'ok' : 'error' } : { id: eventId(run), at: command.at, kind: 'message', text: `You answered: ${command.answer}` };
        return { ...addEvent(run, event), status: 'running' };
      }),
    };
    return resumed ? updateItem(next, entry.itemId, item => ({ ...item, updatedAt: command.at, nextAction: `Watch ${resumed.agent} ${resumed.stageId}` })) : next;
  }
  if (command.type === 'stop') {
    const run = state.runs.find(candidate => candidate.id === command.runId && isLive(candidate));
    if (!run) return state;
    return updateItem({ ...state, now: command.at, inbox: state.inbox.map(entry => entry.runId === run.id && !entry.resolved && ['question', 'permission'].includes(entry.kind) ? resolve(entry, command.at, 'Run stopped by you') : entry),
      runs: state.runs.map(candidate => candidate.id === run.id ? { ...addEvent(candidate, { id: eventId(candidate), at: command.at, kind: 'system', text: 'Stopped by you' }), status: 'stopped', endedAt: command.at,
        handoff: { stoppedAt: [...candidate.events].reverse().find(event => event.kind === 'message')?.text ?? `Stopped during ${candidate.stageId}`, unresolved: ['Run interrupted; completed edits remain, but final checks and stage completion are not confirmed'], suggestedNext: `Resume ${candidate.ticketId ? `ticket ${candidate.ticketId}` : candidate.stageId} from this handoff` } } : candidate),
    }, run.itemId, item => ({ ...item, nextAction: `Resume ${run.ticketId ? `ticket ${run.ticketId}` : run.stageId} — ${run.agent} stopped mid-way`, updatedAt: command.at }));
  }
  if (command.type === 'agent') {
    if (!state.agents.some(agent => agent.id === command.agent && agent.available)) return state;
    return updateItem(state, command.itemId, item => ({ ...item, stages: item.stages.map(stage => stage.stageId === command.stageId ? { ...stage, agent: command.agent } : stage) }));
  }
  if (command.type === 'finding') return { ...state, reviews: state.reviews.map(review => ({ ...review, findings: review.findings.map(finding => finding.id === command.findingId ? { ...finding, status: command.status } : finding) })) };
  if (command.type === 'proposal') {
    const proposal = state.proposals.find(candidate => candidate.id === command.proposalId && candidate.status === 'proposed');
    if (!proposal) return state;
    const content = proposedContent(proposal);
    let next = { ...state, now: command.at, proposals: state.proposals.map(candidate => candidate.id === proposal.id ? { ...candidate, status: command.accept ? 'accepted' as const : 'rejected' as const } : candidate), inbox: state.inbox.map(entry => entry.proposalId === proposal.id && !entry.resolved ? resolve(entry, command.at, command.accept ? 'Accepted' : 'Rejected') : entry) };
    if (!command.accept) return next;
    if (proposal.kind === 'adr') {
      const adr: Artifact = { path: proposal.target, title: proposal.summary, kind: 'adr', content, updatedAt: command.at };
      next = { ...next, adrs: [...next.adrs.filter(existing => existing.path !== adr.path), adr] };
    } else if (proposal.kind === 'glossary') {
      const colon = content.indexOf(':');
      const term = colon >= 0 ? content.slice(0, colon).trim() : proposal.summary.split(' — ')[0];
      const definition = colon >= 0 ? content.slice(colon + 1).trim() : content;
      next = { ...next, glossary: [...next.glossary.filter(existing => existing.term !== term), { term, definition }] };
    }
    return next;
  }
  if (command.type === 'approve') {
    const item = state.items.find(candidate => candidate.id === command.itemId);
    const stage = item?.stages.find(candidate => candidate.stageId === command.stageId);
    if (!item || !stage || stage.status === 'done' || stage.status === 'todo' || state.runs.some(run => run.itemId === item.id && isLive(run))) return state;
    const review = state.reviews.find(candidate => candidate.itemId === item.id);
    if (command.stageId === 'review' && review && (review.commit !== review.checksCommit || review.findings.some(finding => ['open', 'sent-back'].includes(finding.status)) || review.checks.some(check => check.status !== 'pass'))) return state;
    const lastRun = state.runs.filter(run => run.itemId === item.id).at(-1);
    const commit = review?.checksCommit ?? (lastRun ? commitForRun(lastRun) : '7cd0000');
    return updateItem({ ...state, now: command.at, inbox: state.inbox.map(entry => entry.itemId === item.id && entry.stageId === command.stageId && !entry.resolved && ['approval', 'review'].includes(entry.kind) ? resolve(entry, command.at, 'Approved by you') : entry) }, item.id, current => advance(current, command.stageId, command.at, commit, 'you'));
  }
  if (command.type === 'send-back') {
    const item = state.items.find(candidate => candidate.id === command.itemId);
    if (!item || item.pr?.state === 'merged') return state;
    const reviewRun = state.runs.find(run => run.itemId === item.id && run.stageId === 'review' && isLive(run));
    const snapshot = reviewRun ? workbenchReducer(state, { type: 'stop', runId: reviewRun.id, at: command.at }) : state;
    if (snapshot.runs.some(run => run.itemId === item.id && isLive(run))) return state;
    const implementId = item.workflowId === 'bug' ? 'fix' : item.workflowId === 'quick' ? 'do' : 'implement';
    return updateItem({ ...snapshot, now: command.at, reviews: snapshot.reviews.map(review => review.itemId === item.id ? { ...review, findings: review.findings.map(finding => finding.status === 'open' ? { ...finding, status: 'sent-back' as const } : finding) } : review), inbox: snapshot.inbox.map(entry => entry.itemId === item.id && entry.kind === 'review' && !entry.resolved ? resolve(entry, command.at, 'Sent back for changes') : entry) }, item.id, current => ({ ...current, updatedAt: command.at, stages: current.stages.map(stage => stage.stageId === 'review' ? { stageId: stage.stageId, agent: stage.agent, status: 'waiting' } : stage.stageId === implementId ? { stageId: stage.stageId, agent: stage.agent, status: 'active' } : stage), nextAction: 'Address sent-back findings, then re-review' }));
  }
  if (command.type === 'merge') {
    const item = state.items.find(candidate => candidate.id === command.itemId);
    const review = state.reviews.find(candidate => candidate.itemId === command.itemId);
    if (!item?.pr || item.pr.state === 'merged' || state.runs.some(run => run.itemId === item.id && isLive(run)) || item.stages.some(stage => stage.stageId !== 'ship' && !['done', 'skipped'].includes(stage.status)) || (review && (review.commit !== review.checksCommit || review.checks.some(check => check.status !== 'pass') || review.findings.some(finding => ['open', 'sent-back'].includes(finding.status))))) return state;
    return updateItem({ ...state, now: command.at, inbox: state.inbox.map(entry => entry.itemId === item.id && !entry.resolved && ['approval', 'review'].includes(entry.kind) ? resolve(entry, command.at, 'Merged') : entry) }, item.id, current => ({ ...current, pr: { ...current.pr!, state: 'merged' }, updatedAt: command.at, nextAction: 'Shipped', stages: current.stages.map(stage => ({ ...stage, status: 'done' })) }));
  }
  if (command.type !== 'step') return state;
  const run = state.runs.find(candidate => candidate.id === command.runId);
  const item = state.items.find(candidate => candidate.id === run?.itemId);
  if (!run || !item || run.status !== 'running') return state;
  const step = command.step;
  const at = command.at;
  if (step.kind === 'event') return { ...state, now: at, runs: state.runs.map(candidate => candidate.id === run.id ? addEvent(candidate, { ...step.event, id: eventId(candidate), at } as RunEvent) : candidate) };
  if (step.kind === 'pause') {
    const id = `${step.reason}-${run.id}-${run.events.length}`;
    const entry: InboxEntry = { id, kind: step.reason, itemId: item.id, runId: run.id, agent: run.agent, title: step.title, command: step.command, options: step.options, allowFreeText: step.reason === 'question', createdAt: at };
    return updateItem({ ...state, now: at, inbox: [...state.inbox, entry], runs: state.runs.map(candidate => candidate.id === run.id ? { ...addEvent(candidate, { id: eventId(candidate), at, kind: step.reason, questionId: id }), status: 'waiting' } : candidate) }, item.id, current => ({ ...current, nextAction: step.reason === 'question' ? 'Answer the agent’s question' : 'Allow or deny the requested command' }));
  }
  let next: WorkbenchState = { ...state, now: at, runs: state.runs.map(candidate => candidate.id === run.id ? { ...addEvent(candidate, { id: eventId(candidate), at, kind: 'system', text: `Run complete. ${step.handoff.stoppedAt}` }), status: 'done', endedAt: at, handoff: step.handoff } : candidate) };
  const stageDef = state.workflows.find(workflow => workflow.id === item.workflowId)!.stages.find(stage => stage.id === run.stageId)!;
  next = updateItem(next, item.id, current => {
    let updated: WorkItem = { ...current, updatedAt: at, artifacts: current.artifacts.map(file => ({ ...file, changedSinceLastRun: false })) };
    if (step.artifact) updated.artifacts = [...updated.artifacts.filter(file => file.path !== step.artifact!.path), { ...step.artifact, updatedAt: at }];
    if (step.tickets) updated.tickets = step.tickets;
    if (step.ticketId) {
      updated.tickets = updated.tickets.map(ticket => ({ ...ticket, ...(ticket.id === step.ticketId ? { status: 'resolved' as const, agent: run.agent, comments: [...ticket.comments, { author: run.agent, at, text: step.handoff.stoppedAt }] } : {}), blockedBy: ticket.blockedBy.filter(id => id !== step.ticketId) }));
      updated.tickets = updated.tickets.map(ticket => ({ ...ticket, body: ticket.body.replace(/^Status:.*$/m, `Status: ${ticket.status}`).replace(/^Blocked by:.*$/m, `Blocked by: ${ticket.blockedBy.join(', ') || 'none'}`) }));
    }
    if (run.stageId === 'ship') {
      const number = Math.max(42, ...state.items.map(candidate => candidate.pr?.number ?? 0)) + 1;
      return { ...updated, pr: updated.pr ?? { number, url: `https://github.com/you/ledgerly/pull/${number}`, state: 'draft' as const }, stages: updated.stages.map(stage => stage.stageId === run.stageId ? { ...stage, status: 'waiting' as const } : stage), nextAction: 'Merge pull request' };
    }
    if (run.stageId === 'implement' && updated.tickets.some(ticket => ticket.status !== 'resolved')) {
      const ticket = updated.tickets.find(ticket => ticket.status !== 'resolved' && !ticket.blockedBy.length);
      return { ...updated, nextAction: ticket ? `Start ticket ${ticket.id} — ${ticket.title}` : 'Resolve blocking tickets before continuing' };
    }
    if (stageDef.gate === 'approve') return { ...updated, stages: updated.stages.map(stage => stage.stageId === run.stageId ? { ...stage, status: 'waiting' as const } : stage), nextAction: step.checksCommit && step.checksCommit !== state.reviews.find(review => review.itemId === item.id)?.commit ? step.handoff.suggestedNext : `Approve ${stageDef.name}` };
    return advance(updated, run.stageId, at, step.checksCommit ?? commitForRun(run));
  });
  if (stageDef.gate === 'approve') {
    const kind = run.stageId === 'review' ? 'review' : 'approval';
    if (!next.inbox.some(entry => entry.itemId === item.id && entry.stageId === run.stageId && !entry.resolved && entry.kind === kind)) next.inbox = [...next.inbox, { id: `${kind}-${run.id}`, kind, itemId: item.id, runId: run.id, stageId: run.stageId, agent: run.agent, title: `${kind === 'review' ? 'Review' : 'Approve'} ${stageDef.name} for ${item.id}`, createdAt: at }];
  }
  if (step.checks) {
    const existing = next.reviews.find(review => review.itemId === item.id);
    const checksCommit = step.checksCommit ?? commitForRun(run);
    if (existing) next.reviews = next.reviews.map(review => review.itemId === item.id ? { ...review, checks: step.checks!, checksCommit, ...(run.stageId === 'review' && run.id !== 'r-109' ? { commit: checksCommit, findings: [], files: step.reviewFiles ?? review.files } : {}) } : review);
    else next.reviews = [...next.reviews, { itemId: item.id, commit: checksCommit, checksCommit, baseBranch: state.project.branch, branch: item.branch ?? `wb/${item.slug}`, files: [], findings: [], checks: step.checks }];
  }
  if (step.proposal) {
    const proposal: MemoryProposal = { ...step.proposal, id: `proposal-${run.id}`, runId: run.id, itemId: item.id, agent: run.agent, status: 'proposed' };
    next.proposals = [...next.proposals, proposal];
    next.inbox = [...next.inbox, { id: proposal.id, kind: 'memory', itemId: item.id, runId: run.id, agent: run.agent, proposalId: proposal.id, title: proposal.summary, createdAt: at }];
  }
  return next;
}

export function createSelectors(state: WorkbenchState) {
  return {
    needsYou: () => state.inbox.filter(entry => !entry.resolved).sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    item: (id: string) => state.items.find(item => item.id === id),
    workflow: (item: WorkItem) => state.workflows.find(workflow => workflow.id === item.workflowId)!,
    runsFor: (itemId: string) => state.runs.filter(run => run.itemId === itemId).sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt)),
    activeRun: (itemId: string) => state.runs.find(run => run.itemId === itemId && isLive(run)),
    review: (itemId: string) => state.reviews.find(review => review.itemId === itemId),
    brief: (input: StartRunInput) => buildBrief(state, input),
    counts: () => state.inbox.filter(entry => !entry.resolved).reduce((counts, entry) => ({ ...counts, [entry.kind]: counts[entry.kind] + 1 }), { question: 0, permission: 0, approval: 0, review: 0, memory: 0 } as Record<InboxKind, number>),
  };
}

interface Job { itemId: string; steps: ScriptStep[]; index: number; timer?: ReturnType<typeof setTimeout> }
interface WorkbenchContextValue { state: WorkbenchState; actions: WorkbenchActions; select: ReturnType<typeof createSelectors> }
const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workbenchReducer, initialState, value => structuredClone(value));
  const current = useRef(state);
  current.current = state;
  const jobs = useRef(new Map<string, Job>());
  const runCounter = useRef(111);
  const itemCounter = useRef(41);
  const clock = useRef(Date.parse(initialState.now));
  const epoch = useRef(0);
  const timestamp = () => new Date(clock.current += 1000).toISOString();
  const cancelTimers = () => {
    for (const job of jobs.current.values()) { if (job.timer !== undefined) clearTimeout(job.timer); job.timer = undefined; }
  };

  useEffect(() => () => { epoch.current += 1; cancelTimers(); }, []);

  useEffect(() => {
    for (const [runId, job] of jobs.current) {
      const run = state.runs.find(candidate => candidate.id === runId);
      if (!run) continue;
      if (!isLive(run)) { if (job.timer !== undefined) clearTimeout(job.timer); jobs.current.delete(runId); continue; }
      if (run.status !== 'running' || job.index >= job.steps.length || job.timer !== undefined) continue;
      const generation = epoch.current;
      const step = job.steps[job.index];
      job.timer = setTimeout(() => {
        job.timer = undefined;
        if (generation !== epoch.current || !current.current.runs.some(candidate => candidate.id === runId && candidate.status === 'running')) return;
        job.index += 1;
        dispatch({ type: 'step', runId, step, at: timestamp() });
      }, step.delayMs ?? 600 + (job.index % 3) * 100);
    }
  }, [state.runs]);

  const actions = useMemo<WorkbenchActions>(() => {
    const resume = (entryId: string, answer: string, permission?: boolean) => {
      const snapshot = current.current;
      const entry = snapshot.inbox.find(candidate => candidate.id === entryId && !candidate.resolved);
      if (!entry || entry.kind !== (permission === undefined ? 'question' : 'permission')) return;
      const run = snapshot.runs.find(candidate => candidate.id === entry.runId);
      const item = snapshot.items.find(candidate => candidate.id === entry.itemId);
      if (run?.status === 'waiting' && item) {
        const job = jobs.current.get(run.id);
        if (!job || permission === false) jobs.current.set(run.id, { itemId: item.id, steps: continuationFor(run, item, permission ?? answer), index: 0 });
        else if (permission === undefined) job.steps = job.steps.map((step, index) => index >= job.index && step.kind === 'finish' ? { ...step, handoff: { ...step.handoff, stoppedAt: `${step.handoff.stoppedAt} User decision: ${answer}` } } : step);
      }
      dispatch({ type: 'answer', entryId, answer, permission, at: timestamp() });
    };
    return {
      answerQuestion: (entryId, answer) => {
        if (!answer.trim()) return;
        const entry = current.current.inbox.find(candidate => candidate.id === entryId);
        resume(entryId, entry?.options?.find(option => option.id === answer)?.label ?? answer.trim());
      },
      decidePermission: (entryId, allow) => resume(entryId, allow ? 'Allowed' : 'Denied', allow),
      approveStage: (itemId, stageId) => dispatch({ type: 'approve', itemId, stageId, at: timestamp() }),
      setStageAgent: (itemId, stageId, agent) => dispatch({ type: 'agent', itemId, stageId, agent }),
      startRun: input => {
        const snapshot = current.current;
        const item = snapshot.items.find(candidate => candidate.id === input.itemId);
        const stage = item?.stages.find(candidate => candidate.stageId === input.stageId);
        const active = snapshot.runs.find(run => run.itemId === input.itemId && isLive(run));
        if (active) return active.id;
        const pending = [...jobs.current].find(([runId, job]) => job.itemId === input.itemId && !snapshot.runs.some(run => run.id === runId));
        if (pending) return pending[0];
        if (!item || !stage || !snapshot.agents.some(agent => agent.id === input.agent && agent.available)) throw new Error('Choose an existing item, stage, and available agent.');
        if (item.pr?.state === 'merged' || !['active', 'waiting'].includes(stage.status)) throw new Error('This stage is not ready to run.');
        const ticket = input.ticketId ? item.tickets.find(candidate => candidate.id === input.ticketId) : undefined;
        if (input.ticketId && (!ticket || ticket.status === 'resolved' || ticket.blockedBy.some(id => item.tickets.find(candidate => candidate.id === id)?.status !== 'resolved'))) throw new Error('This ticket is resolved, missing, or blocked.');
        const id = `r-${runCounter.current++}`;
        const at = timestamp();
        jobs.current.set(id, { itemId: item.id, steps: scriptFor(item, input.stageId, input.ticketId, input.agent, buildBrief(snapshot, input)), index: 0 });
        dispatch({ type: 'start', run: { id, itemId: item.id, stageId: input.stageId, ticketId: input.ticketId, agent: input.agent, status: 'running', startedAt: at, events: [{ id: `${id}-e0`, at, kind: 'system', text: `Started in worktree ${item.worktree ?? `../ledgerly-worktrees/${item.slug}`}` }] } });
        return id;
      },
      stopRun: runId => {
        const job = jobs.current.get(runId);
        if (job?.timer !== undefined) clearTimeout(job.timer);
        jobs.current.delete(runId);
        dispatch({ type: 'stop', runId, at: timestamp() });
      },
      decideProposal: (proposalId, accept) => dispatch({ type: 'proposal', proposalId, accept, at: timestamp() }),
      setFindingStatus: (findingId, status) => dispatch({ type: 'finding', findingId, status }),
      sendBack: itemId => dispatch({ type: 'send-back', itemId, at: timestamp() }),
      merge: itemId => dispatch({ type: 'merge', itemId, at: timestamp() }),
      createItem: ({ title, type }) => {
        if (!title.trim()) return;
        const workflow = current.current.workflows.find(candidate => candidate.id === type);
        if (!workflow) return;
        const id = `${type === 'feature' ? 'F' : type === 'bug' ? 'B' : 'T'}-${itemCounter.current++}`;
        const slug = `${title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'work-item'}-${id.toLowerCase()}`;
        dispatch({ type: 'create', item: { id, slug, type, title: title.trim(), workflowId: type, stages: workflow.stages.map((stage, index): StageState => ({ stageId: stage.id, status: index === 0 ? 'active' : 'todo', agent: stage.defaultAgent })), tickets: [], artifacts: [], nextAction: `Start ${workflow.stages[0].name}`, updatedAt: timestamp() } });
      },
      reset: () => { epoch.current += 1; cancelTimers(); jobs.current.clear(); clock.current = Date.parse(initialState.now); runCounter.current = 111; itemCounter.current = 41; dispatch({ type: 'reset' }); },
    };
  }, []);
  const select = useMemo(() => createSelectors(state), [state]);
  return <WorkbenchContext.Provider value={{ state, actions, select }}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench() {
  const context = useContext(WorkbenchContext);
  if (!context) throw new Error('useWorkbench must be used inside WorkbenchProvider.');
  return context;
}
