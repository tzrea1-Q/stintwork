// PROTOTYPE — shared contract for all UI variants. Do not change without the coordinator.
// Mirrors the v1 brief: Project → Work items (in .scratch/<slug>/) → Runs (one agent session on one stage).

export type AgentId = 'claude' | 'codex' | 'grok' | 'gemini';

export interface Agent {
  id: AgentId;
  name: string; // "Claude Code"
  available: boolean; // detected on PATH
  via: 'acp' | 'terminal';
  note?: string; // e.g. "not found on PATH"
}

export type WorkflowId = 'feature' | 'bug' | 'quick';

export type GateKind = 'approve' | 'checks' | 'done' | 'merge';

export interface StageDef {
  id: string; // 'clarify' | 'spec' | ...
  name: string; // 'Clarify'
  skill?: string; // '/grill-with-docs'
  produces?: string; // 'spec.md'
  gate: GateKind;
  defaultAgent?: AgentId;
}

export interface WorkflowDef {
  id: WorkflowId;
  name: string;
  stages: StageDef[];
}

export type StageStatus = 'done' | 'active' | 'waiting' | 'todo' | 'skipped';

export interface StageState {
  stageId: string;
  status: StageStatus;
  agent?: AgentId; // agent assigned to this stage for this item
  approvedBy?: string; // 'you'
  approvedAt?: string; // ISO
  approvedCommit?: string; // short sha
}

export type TicketStatus = 'open' | 'claimed' | 'in-progress' | 'resolved';

export interface Ticket {
  id: string; // '02'
  slug: string; // 'dedupe-transactions'
  title: string;
  status: TicketStatus;
  blockedBy: string[]; // ticket ids
  agent?: AgentId;
  path: string; // '.scratch/bank-csv-import/issues/02-dedupe-transactions.md'
  body: string; // markdown
  comments: { author: string; at: string; text: string }[];
}

export interface Artifact {
  path: string; // '.scratch/bank-csv-import/spec.md'
  title: string;
  kind: 'spec' | 'map' | 'adr' | 'glossary' | 'agents' | 'other';
  content: string; // markdown
  updatedAt: string;
  changedSinceLastRun?: boolean; // e.g. requirement edited after the last run
}

export type ItemType = 'feature' | 'bug' | 'quick';

export interface WorkItem {
  id: string; // 'F-12'
  slug: string; // 'bank-csv-import'
  type: ItemType;
  title: string;
  milestoneId?: string;
  workflowId: WorkflowId;
  stages: StageState[]; // one per stage in the workflow, in order
  tickets: Ticket[];
  artifacts: Artifact[]; // spec.md etc. that live in .scratch/<slug>/
  branch?: string; // 'wb/bank-csv-import'
  worktree?: string; // '../ledgerly-worktrees/bank-csv-import'
  pr?: { number: number; url: string; state: 'draft' | 'open' | 'merged' };
  nextAction: string; // human sentence: "Resume ticket 02 — Grok stopped mid-way"
  updatedAt: string;
}

export interface Milestone {
  id: string;
  name: string; // 'M2 · Import & auth'
  target?: string; // ISO date
  status: 'shipped' | 'active' | 'planned';
  description: string;
}

export type RunStatus = 'running' | 'waiting' | 'stopped' | 'done' | 'failed';

export type RunEvent =
  | { id: string; at: string; kind: 'message'; text: string }
  | { id: string; at: string; kind: 'plan'; steps: { text: string; done: boolean }[] }
  | { id: string; at: string; kind: 'tool'; tool: string; input: string; output?: string; status: 'ok' | 'error' | 'pending' }
  | { id: string; at: string; kind: 'file'; path: string; added: number; removed: number }
  | { id: string; at: string; kind: 'question'; questionId: string }
  | { id: string; at: string; kind: 'permission'; questionId: string }
  | { id: string; at: string; kind: 'system'; text: string }; // "Run started in worktree …", "Stopped by you"

export interface Handoff {
  stoppedAt: string; // where it stopped
  unresolved: string[];
  suggestedNext: string; // e.g. "/implement on ticket 02, finish dedupe key"
}

export interface Run {
  id: string; // 'r-108'
  itemId: string;
  stageId: string;
  ticketId?: string;
  agent: AgentId;
  status: RunStatus;
  startedAt: string;
  endedAt?: string;
  tokens?: number;
  events: RunEvent[];
  handoff?: Handoff;
}

/** Things that need the human. Rendered by "Needs you". */
export type InboxKind = 'question' | 'permission' | 'approval' | 'review' | 'memory';

export interface InboxEntry {
  id: string; // same as questionId / proposalId where applicable
  kind: InboxKind;
  itemId: string;
  runId?: string;
  agent?: AgentId;
  title: string; // one line
  detail?: string;
  createdAt: string;
  // question
  options?: { id: string; label: string; description?: string }[];
  allowFreeText?: boolean;
  // permission
  command?: string;
  // approval: which stage gate
  stageId?: string;
  // memory: proposal id
  proposalId?: string;
  resolved?: { at: string; answer: string };
}

/** Proposed durable change (ADR, glossary entry, ticket status) — accept or reject. */
export interface MemoryProposal {
  id: string;
  itemId: string;
  runId: string;
  agent: AgentId;
  target: string; // 'docs/adr/0007-money-as-integer-cents.md' | 'GLOSSARY.md'
  kind: 'adr' | 'glossary' | 'ticket' | 'spec';
  summary: string;
  diff: string; // unified diff text
  status: 'proposed' | 'accepted' | 'rejected';
}

export interface DiffLine {
  kind: 'context' | 'add' | 'del';
  oldNo?: number;
  newNo?: number;
  text: string;
}

export interface DiffFile {
  path: string;
  added: number;
  removed: number;
  hunks: { header: string; lines: DiffLine[] }[];
}

export interface Finding {
  id: string;
  axis: 'standards' | 'spec';
  severity: 'blocker' | 'major' | 'minor' | 'nit';
  path: string;
  line: number; // new-side line number in the diff
  title: string;
  body: string;
  agent: AgentId;
  status: 'open' | 'resolved' | 'accepted' | 'sent-back';
}

export interface Check {
  name: string; // 'test', 'lint', 'typecheck'
  status: 'pass' | 'fail' | 'running' | 'pending';
  detail?: string;
  durationSec?: number;
}

export interface Review {
  itemId: string;
  commit: string; // short sha the findings & checks belong to
  baseBranch: string;
  branch: string;
  files: DiffFile[];
  findings: Finding[];
  checks: Check[];
  checksCommit: string; // equals commit when fresh; differs → evidence is stale
}

/** The compiled "brief in" for starting/resuming a run: pointers, not copied text. */
export interface Brief {
  itemId: string;
  stageId: string;
  ticketId?: string;
  skill?: string;
  pointers: { path: string; why: string }[];
  lastHandoff?: { runId: string; agent: AgentId; handoff: Handoff };
  changedSince: string[]; // human sentences
  prompt: string; // the exact text that would be sent to the agent
}

export interface Project {
  name: string; // 'ledgerly'
  path: string; // '~/code/ledgerly'
  branch: string; // 'main'
  remote?: string; // 'github.com/you/ledgerly'
  tracker: 'local-markdown';
}

export interface WorkbenchState {
  project: Project;
  agents: Agent[];
  workflows: WorkflowDef[];
  milestones: Milestone[];
  items: WorkItem[];
  runs: Run[];
  inbox: InboxEntry[];
  proposals: MemoryProposal[];
  reviews: Review[];
  glossary: { term: string; definition: string }[];
  adrs: Artifact[];
  now: string; // fake "current time" ISO
}
