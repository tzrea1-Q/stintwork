import type { Artifact, DiffFile, DiffLine, Run, RunEvent, StageState, Ticket, WorkbenchState, WorkItem } from './types';
import { workflows } from './workflows';

export const SCENARIO_NOW = '2026-10-09T10:30:00-07:00';
const at = (time: string, day = '09') => `2026-10-${day}T${time}-07:00`;
const artifact = (path: string, title: string, kind: Artifact['kind'], content: string, updatedAt = at('09:00:00')): Artifact => ({ path, title, kind, content, updatedAt });

export const agentsArtifact = artifact('AGENTS.md', 'Agent instructions', 'agents', `# ledgerly — agent instructions

Personal finance for people who want to understand where their money went.
TypeScript, React 18, SQLite. Local-first; never send transaction data to a third party.

## Read first
- Read the work item's spec and ticket before changing code.
- Read GLOSSARY.md and the relevant decision in docs/adr/.
- Keep feature code under src/features/<feature>/ (ADR 0004).
- Use Vitest (ADR 0006). Run pnpm vitest run <changed tests>, pnpm typecheck, and pnpm lint.
- Currency is displayed in the account's locale; rounding must preserve the original total.
- Keep SQLite writes in a transaction. Preview imports without persisting rows.

## Handoff
Record what changed, checks actually run, unresolved work, and the exact next command.
Ticket files are the tracker: update Status: and Blocked by: lines, not a separate database.
Never merge or accept a proposed decision without the user's approval.`);

const adrs: Artifact[] = [
  artifact('docs/adr/0001-sqlite-only-store.md', '0001 · SQLite as the only store', 'adr', `# ADR 0001: SQLite as the only store
Status: Accepted
Date: 2026-09-18

## Context
Private-beta users need an offline ledger and a single portable backup.
## Decision
SQLite is the only durable store. Use transactions for imports and split edits. Do not add a hosted database or duplicate the ledger in localStorage.
## Consequences
Account-scoped queries must be indexed; migrations and restore tests accompany schema changes.`),
  artifact('docs/adr/0004-feature-folders.md', '0004 · Feature folders under src/features', 'adr', `# ADR 0004: Feature folders
Status: Accepted
Date: 2026-09-24

## Decision
Keep UI, services, and tests for a feature together under src/features/<slug>.
Shared money arithmetic lives in src/money. Import another feature through its public index, not its internal files.
## Consequences
CSV preview and mapping components belong to src/features/import; avoid a generic services directory.`),
  artifact('docs/adr/0006-vitest.md', '0006 · Use Vitest', 'adr', `# ADR 0006: Use Vitest
Status: Accepted
Date: 2026-10-01

## Decision
Use Vitest for unit and feature integration tests. Keep regression tests beside the code.
## Validation
Run pnpm vitest run before review. Money tests assert exact totals, not approximate floating-point equality.`),
];

export const importSpec = `# Bank CSV import
Status: Approved — criterion 3 amended on 2026-10-09
Owner: you
Milestone: M2 · Import & auth

## Problem
Users moving from a spreadsheet need to import bank exports without creating duplicate transactions. Banks disagree on headers, date formats, and whether debits are signed.

## Scope
One CSV at a time, into an existing account. A local preview maps date, payee, amount (or debit/credit), and optional category. The preview is reversible; confirmation writes one SQLite transaction.

## Acceptance criteria
1. Parse quoted fields, embedded commas, UTF-8 BOM, and CRLF. Let the user map columns and select DD/MM/YYYY or MM/DD/YYYY; report invalid rows with their original row number.
2. Show a preview before writing. Preserve the sign and exact cents, skip empty rows, and make Cancel leave the ledger unchanged.
3. Flag duplicates in the same account when the signed amount matches, normalized payees match (case, whitespace, punctuation, and common bank suffixes), and booking dates are **within 3 days**, not necessarily the same day. Do not dedupe across accounts. A flagged row can be explicitly included.
4. Category mapping remembers mappings for this account, allows an uncategorized fallback, and never overwrites an existing transaction's category.
5. Confirmation is atomic and retry-safe. The summary reports imported, skipped duplicates, and invalid rows; link to the newly imported transactions.
6. Keyboard users can map columns, inspect row errors, and confirm without a mouse. Never upload bank data.

## Implementation order
- 01 Parse CSV with column mapping
- 02 Dedupe transactions on import
- 03 Category mapping UI (after 02)
- 04 Import summary screen (after 02 and 03)

## Non-goals
OFX, automatic bank sync, multi-currency conversion, and learning categories from other users.

## Changed since r-104
Criterion 3 used to require same-day matches. A Friday card payment can settle on Monday; use an inclusive 3-day window and cover the boundary in tests.`;

const authSpec = `# Sign in with GitHub
Status: Draft — awaiting approval
Milestone: M2 · Import & auth

## Problem
Private-beta users need a recognizable identity without maintaining another password. Signing in must not change where their financial data is stored.

## Proposed flow
Settings → Sign in with GitHub → browser authorization → callback → return to the original screen. Request only read:user; show the display name and avatar. Store the session token in an HttpOnly, Secure, SameSite=Lax cookie, never localStorage.

## Acceptance criteria
1. Generate a one-use OAuth state value, expire it after ten minutes, and reject missing or mismatched state before exchanging a code.
2. Exchange the code server-side. No client secret or access token appears in a URL, browser storage, log, or SQLite ledger backup.
3. Link by stable GitHub user ID, not mutable email or login. Signing in never merges or uploads ledgers.
4. Preserve the return path only when it is a same-origin relative path. Reject open redirects.
5. Cancel, denied consent, network failure, and expired state show an actionable retry without discarding the user's current ledger.
6. Sign out invalidates the session and returns to local mode. Existing account data remains readable offline.
7. Add integration coverage for a successful callback, invalid state, replayed code, and sign-out. Use stubbed GitHub responses.

## Decisions needing approval
GitHub identity is optional; the beta remains local-first. No repository scope, email scope, or cloud synchronization.

## Read first
AGENTS.md; docs/adr/0001-sqlite-only-store.md; src/features/auth/index.ts.
## Non-goals
Team accounts, password login, and ledger sharing.`;

function stages(type: WorkItem['type'], statuses: StageState['status'][], commits: Record<string, string> = {}, approvedAt = type === 'bug' ? at('09:18:00') : type === 'quick' ? at('11:20:00', '07') : at('12:30:00', '07')): StageState[] {
  return workflows.find(workflow => workflow.id === type)!.stages.map((stage, index) => ({
    stageId: stage.id, status: statuses[index], agent: stage.defaultAgent,
    ...(statuses[index] === 'done' ? { approvedBy: 'you', approvedAt, approvedCommit: commits[stage.id] ?? '90e5b2a' } : {}),
  }));
}

function ticket(id: string, slug: string, title: string, status: Ticket['status'], blockedBy: string[], description: string, agent?: Ticket['agent']): Ticket {
  return {
    id, slug, title, status, blockedBy, agent, path: `.scratch/bank-csv-import/issues/${id}-${slug}.md`,
    body: `# ${id} · ${title}\nStatus: ${status}\nBlocked by: ${blockedBy.join(', ') || 'none'}\n\n${description}`,
    comments: [],
  };
}

const importTickets: Ticket[] = [
  ticket('01', 'parse-csv', 'Parse CSV with column mapping', 'resolved', [], `## Scope
Build parseCsv and the column-mapping preview under src/features/import.
## Acceptance
- [x] Quoted commas, escaped quotes, BOM, and CRLF fixtures pass.
- [x] Date order is explicit; invalid rows preserve source row numbers.
- [x] Preview does not write to SQLite.
## Verification
pnpm vitest run src/features/import/import.parse.test.ts — 14 passed.`, 'claude'),
  ticket('02', 'dedupe-transactions', 'Dedupe transactions on import', 'in-progress', [], `## Scope
Compare preview rows against existing transactions in the selected account.
## Acceptance
- [x] Compare signed amount in cents and scope by account.
- [ ] Normalize bank payee suffixes and punctuation before matching.
- [ ] Match dates in the inclusive 3-day window (spec criterion 3 amended today).
- [ ] User can opt in to a flagged duplicate; confirm remains retry-safe.
## Current state
Grok stopped after adding the exact amount/date/payee key. Three tests fail in import.dedupe.test.ts. Read r-104's handoff before continuing.`, 'grok'),
  ticket('03', 'category-mapping', 'Category mapping UI', 'open', ['02'], `## Scope
Add a compact category selector to the preview. Reuse the envelope picker.
## Acceptance
- [ ] Per-account mapping defaults survive the next import.
- [ ] Unknown categories stay uncategorized until the user chooses.
- [ ] Duplicate rows do not mutate the original category.
- [ ] Selector has an accessible name and keyboard navigation.`),
  ticket('04', 'import-summary', 'Import summary screen', 'open', ['02', '03'], `## Scope
Show the result of confirmation without retaining the uploaded file.
## Acceptance
- [ ] Display imported, duplicate-skipped, and invalid counts.
- [ ] Link to the imported transaction IDs in date order.
- [ ] Retrying confirmation does not duplicate the batch.
- [ ] Announce completion and restore focus to the summary heading.`),
];
importTickets[0].comments = [{ author: 'Claude Code', at: at('14:12:00', '08'), text: 'Parser and mapping preview committed as 832ab91. All 14 parser tests pass; no ledger writes on preview.' }];
importTickets[1].comments = [
  { author: 'Grok Build', at: at('16:19:00', '08'), text: 'Exact-key dedupe is implemented. Fuzzy payee normalization still missing; 3 regression tests fail. Leaving a handoff, not claiming completion.' },
  { author: 'you', at: at('09:15:00'), text: 'Updated criterion 3: duplicates can settle within 3 days. Include Friday → Monday and a 4-day non-match in the tests.' },
];
importTickets[2].comments = [{ author: 'you', at: at('09:18:00'), text: 'Wait for 02 so the selector operates on the final duplicate preview model.' }];

const items: WorkItem[] = [
  {
    id: 'F-12', slug: 'bank-csv-import', type: 'feature', title: 'Bank CSV import', milestoneId: 'M2', workflowId: 'feature',
    stages: stages('feature', ['done', 'done', 'done', 'active', 'todo', 'todo'], { clarify: '45dd908', spec: '63cd120', tickets: '71faa03' }),
    tickets: importTickets, artifacts: [{ ...artifact('.scratch/bank-csv-import/spec.md', 'Bank CSV import spec', 'spec', importSpec, at('09:15:00')), changedSinceLastRun: true }, artifact('.scratch/bank-csv-import/map.md', 'Import code map', 'map', '# Import code map\n- src/features/import/import.parse.ts — CSV parser\n- src/features/import/import.dedupe.ts — account-scoped duplicate matching\n- src/features/import/import.dedupe.test.ts — regression fixtures\n- src/features/import/ImportPreview.tsx — column and category mapping\n- src/money/ — shared arithmetic')],
    branch: 'wb/bank-csv-import', worktree: '../ledgerly-worktrees/bank-csv-import', nextAction: 'Resume ticket 02 — Grok stopped mid-way; spec changed since', updatedAt: at('09:18:00'),
  },
  {
    id: 'F-14', slug: 'github-sign-in', type: 'feature', title: 'Sign in with GitHub', milestoneId: 'M2', workflowId: 'feature',
    stages: stages('feature', ['done', 'waiting', 'todo', 'todo', 'todo', 'todo'], { clarify: 'da189fb' }), tickets: [],
    artifacts: [artifact('.scratch/github-sign-in/spec.md', 'GitHub sign-in spec', 'spec', authSpec, at('09:42:00'))],
    branch: 'wb/github-sign-in', worktree: '../ledgerly-worktrees/github-sign-in', nextAction: 'Approve spec — Claude has drafted the GitHub sign-in flow', updatedAt: at('09:42:00'),
  },
  {
    id: 'B-31', slug: 'split-cent-rounding', type: 'bug', title: 'Split transactions total off by one cent', milestoneId: 'M2', workflowId: 'bug',
    stages: stages('bug', ['done', 'done', 'active', 'todo'], { diagnose: '8844bc1', fix: 'a41c9e2' }), tickets: [],
    artifacts: [artifact('.scratch/split-cent-rounding/spec.md', 'Split rounding reproduction', 'spec', `# Split transactions: preserve the total
Status: Reproduced
## Reproduction
Split $10.00 into 20%, 30%, and 50%. Floating-point accumulation can leave the persisted total at $9.99.
## Acceptance
1. The sum of integer-cent splits equals the original amount, including refunds.
2. Distribute any rounding remainder to the **largest split**; use original order only to break ties.
3. Reject non-finite amounts and invalid weights before writing. Cover zero and three-way splits.
## Evidence
src/money/split.test.ts reproduces the bug. Fix commit a41c9e2 preserves totals but needs review against criterion 2.`)],
    branch: 'wb/split-cent-rounding', worktree: '../ledgerly-worktrees/split-cent-rounding', pr: { number: 42, url: 'https://github.com/you/ledgerly/pull/42', state: 'open' },
    nextAction: 'Review 3 findings — allow Codex to run the money tests', updatedAt: at('10:24:00'),
  },
  {
    id: 'F-15', slug: 'recurring-transactions', type: 'feature', title: 'Recurring transactions', milestoneId: 'M3', workflowId: 'feature',
    stages: stages('feature', ['active', 'todo', 'todo', 'todo', 'todo', 'todo']), tickets: [],
    artifacts: [artifact('.scratch/recurring-transactions/notes.md', 'Recurring transaction questions', 'other', '# Recurring transactions\nA Series owns a schedule and defaults. Individual occurrences remain real transactions.\n\nOpen question: should a subscription price change rewrite historical occurrences?\nMonthly, weekly, and yearly schedules are in scope; bank sync and automatic payments are not.')],
    branch: 'wb/recurring-transactions', worktree: '../ledgerly-worktrees/recurring-transactions', nextAction: 'Answer Claude — should past occurrences keep their original amount?', updatedAt: at('10:27:00'),
  },
  {
    id: 'F-16', slug: 'multi-currency', type: 'feature', title: 'Multi-currency', milestoneId: 'M3', workflowId: 'feature',
    stages: stages('feature', ['active', 'todo', 'todo', 'todo', 'todo', 'todo']), tickets: [], artifacts: [], nextAction: 'Start Clarify', updatedAt: at('08:40:00'),
  },
  {
    id: 'T-40', slug: 'vite-7', type: 'quick', title: 'Upgrade to Vite 7', milestoneId: 'M1', workflowId: 'quick',
    stages: stages('quick', ['done', 'done', 'done']), tickets: [], artifacts: [artifact('.scratch/vite-7/handoff.md', 'Upgrade handoff', 'other', '# Vite 7 upgrade\nDependency upgrade and plugin compatibility verified on Node 22. Build and smoke check passed. PR #38 merged; no user-visible changes.')],
    pr: { number: 38, url: 'https://github.com/you/ledgerly/pull/38', state: 'merged' }, nextAction: 'Shipped', updatedAt: at('11:30:00', '07'),
  },
  {
    id: 'F-9', slug: 'budget-envelopes', type: 'feature', title: 'Budget envelopes', milestoneId: 'M1', workflowId: 'feature',
    stages: stages('feature', ['done', 'done', 'done', 'done', 'done', 'done'], {}, at('15:00:00', '06')), tickets: [], artifacts: [artifact('.scratch/budget-envelopes/spec.md', 'Budget envelopes spec', 'spec', '# Budget envelopes\nStatus: Shipped\nAssign each transaction to an Envelope. Monthly targets show available cents after spending. Refunds return money to the same envelope. Keyboard and zero-budget scenarios verified in PR #31.')],
    pr: { number: 31, url: 'https://github.com/you/ledgerly/pull/31', state: 'merged' }, nextAction: 'Shipped', updatedAt: at('15:20:00', '06'),
  },
];

function event(runId: string, index: number, value: Omit<Extract<RunEvent, { kind: 'message' | 'system' }>, 'id' | 'at'>, startedAt: string): RunEvent {
  return { ...value, id: `${runId}-e${index}`, at: new Date(Date.parse(startedAt) + index * 30_000).toISOString() };
}
function completedRun(id: string, itemId: string, stageId: string, agent: Run['agent'], startedAt: string, summary: string, ticketId?: string): Run {
  return { id, itemId, stageId, agent, ticketId, status: 'done', startedAt, endedAt: new Date(Date.parse(startedAt) + 240_000).toISOString(), tokens: 3200,
    events: [event(id, 0, { kind: 'system', text: `Started in worktree ${items.find(item => item.id === itemId)?.worktree}` }, startedAt), event(id, 1, { kind: 'message', text: summary }, startedAt)],
    handoff: { stoppedAt: summary, unresolved: [], suggestedNext: stageId === 'spec' ? 'Approve spec, then /to-tickets' : 'Continue with the next workflow stage' },
  };
}
const grokStart = at('16:10:00', '08');
const grokEvents: RunEvent[] = [
  { kind: 'system', text: 'Started in worktree ../ledgerly-worktrees/bank-csv-import' },
  { kind: 'message', text: 'Read AGENTS.md, the import spec, and ticket 02. I will keep comparison account-scoped and avoid writing during preview.' },
  { kind: 'plan', steps: [{ text: 'Inspect parser output and transaction model', done: false }, { text: 'Implement exact dedupe key', done: false }, { text: 'Normalize payees and run regression tests', done: false }] },
  { kind: 'tool', tool: 'rg', input: 'rg "dedupe|payee" src/features/import', output: 'import.dedupe.ts, import.dedupe.test.ts, ImportPreview.tsx', status: 'ok' },
  { kind: 'tool', tool: 'read', input: '.scratch/bank-csv-import/issues/02-dedupe-transactions.md', output: 'Compare signed cents + booking date + payee in the selected account.', status: 'ok' },
  { kind: 'tool', tool: 'read', input: 'src/features/import/import.parse.ts', output: 'ParsedRow exposes amountCents, bookedOn, payee, accountId.', status: 'ok' },
  { kind: 'plan', steps: [{ text: 'Inspect parser output and transaction model', done: true }, { text: 'Implement exact dedupe key', done: true }, { text: 'Normalize payees and run regression tests', done: false }] },
  { kind: 'file', path: 'src/features/import/import.dedupe.ts', added: 38, removed: 6 },
  { kind: 'file', path: 'src/features/import/import.dedupe.test.ts', added: 29, removed: 0 },
  { kind: 'tool', tool: 'shell', input: 'pnpm vitest run src/features/import/import.dedupe.test.ts', output: 'Tests: 3 failed | 9 passed. FAIL: bank suffix; punctuation; case-insensitive payee. Expected duplicate=true, received false.', status: 'error' },
  { kind: 'message', text: 'The exact key works. Fuzzy payee matching is still missing; I have not made the three failing regressions green.' },
  { kind: 'system', text: 'Stopped by you' },
].map((value, index) => ({ ...value, id: `r-104-e${index}`, at: new Date(Date.parse(grokStart) + index * 50_000).toISOString() } as RunEvent));

const runs: Run[] = [
  completedRun('r-101', 'F-12', 'clarify', 'claude', at('10:00:00', '07'), 'Clarified bank formats, preview-only writes, and account-scoped duplicates.'),
  completedRun('r-102', 'F-12', 'spec', 'claude', at('11:00:00', '07'), 'Wrote spec.md with six acceptance criteria; ready for human approval.'),
  completedRun('r-103', 'F-12', 'implement', 'claude', at('14:00:00', '08'), 'Ticket 01 complete: CSV parser and column mapping; 14 tests pass.', '01'),
  { id: 'r-104', itemId: 'F-12', stageId: 'implement', ticketId: '02', agent: 'grok', status: 'stopped', startedAt: grokStart, endedAt: grokEvents[11].at, tokens: 8420, events: grokEvents,
    handoff: { stoppedAt: 'Dedupe key implemented for amount+date+payee; fuzzy payee matching not done; 3 tests failing in import.dedupe.test.ts', unresolved: ['Normalize payees (bank suffixes, punctuation, case)', 'Make 3 failing tests pass', 'Current implementation uses same-day dates; reread updated spec before resuming'], suggestedNext: '/implement ticket 02 — finish fuzzy payee match, make tests pass' } },
  completedRun('r-106', 'F-14', 'spec', 'claude', at('09:38:00'), 'Drafted GitHub OAuth spec: one-use state, server-side exchange, optional local-first identity.'),
  completedRun('r-107', 'B-31', 'diagnose', 'claude', at('08:50:00'), 'Reproduced one-cent loss in float allocation; regression fixture added before fixing.'),
  completedRun('r-108', 'B-31', 'fix', 'codex', at('09:10:00'), 'Integer-cent allocation committed as a41c9e2. Tests and typecheck pass; lint has one error. Proposed ADR 0007.'),
  { id: 'r-109', itemId: 'B-31', stageId: 'review', agent: 'codex', status: 'waiting', startedAt: at('10:20:00'), tokens: 2180,
    events: [{ id: 'r-109-e0', at: at('10:20:00'), kind: 'system', text: 'Started in worktree ../ledgerly-worktrees/split-cent-rounding' }, { id: 'r-109-e1', at: at('10:21:00'), kind: 'message', text: 'Reviewed a41c9e2 against the spec and standards. Found 3 issues; asking before running the money suite.' }, { id: 'r-109-e2', at: at('10:24:00'), kind: 'permission', questionId: 'permission-r-109' }] },
  { id: 'r-110', itemId: 'F-15', stageId: 'clarify', agent: 'claude', status: 'waiting', startedAt: at('10:25:00'), tokens: 1740,
    events: [{ id: 'r-110-e0', at: at('10:25:00'), kind: 'system', text: 'Started in worktree ../ledgerly-worktrees/recurring-transactions' }, { id: 'r-110-e1', at: at('10:26:00'), kind: 'message', text: 'A Series is a recurring template plus its occurrences. Before drafting the spec, we need a rule for price changes.' }, { id: 'r-110-e2', at: at('10:27:00'), kind: 'question', questionId: 'question-r-110' }] },
];

export function diffFile(path: string, before: string[], after: string[]): DiffFile {
  let oldNo = 1;
  let newNo = 1;
  const lines: DiffLine[] = [];
  for (const text of before) lines.push({ kind: 'del', oldNo: oldNo++, text });
  for (const text of after) lines.push({ kind: 'add', newNo: newNo++, text });
  return { path, added: after.length, removed: before.length, hunks: [{ header: `@@ -1,${before.length} +1,${after.length} @@`, lines }] };
}

const splitBefore = [
  'export function splitAmount(amount: number, weights: number[]) {',
  '  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);',
  '  return weights.map(weight => {',
  '    const share = amount * (weight / totalWeight);',
  '    return Math.round(share * 100) / 100;',
  '  });',
  '}',
];
const splitAfter = [
  'export function splitAmount(amount: number, weights: number[]): number[] {',
  '  if (!Number.isFinite(amount)) {',
  '    throw new RangeError("Amount must be finite");',
  '  }',
  '  if (!weights.length || weights.some(weight => !Number.isFinite(weight) || weight < 0)) {',
  '    throw new RangeError("Expected non-negative finite weights");',
  '  }',
  '  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);',
  '  if (totalWeight === 0) throw new RangeError("Weights must sum above zero");',
  '',
  '  const cents = Math.round(amount * 100);',
  '  const sign = Math.sign(cents);',
  '  const absoluteCents = Math.abs(cents);',
  '  const shares = weights.map(weight =>',
  '    Math.floor(absoluteCents * (weight / totalWeight)),',
  '  );',
  '',
  '  const allocated = shares.reduce((sum, share) => sum + share, 0);',
  '  const remainder = absoluteCents - allocated;',
  '  const remainderIndex = 0;',
  '',
  '  if (remainder > 0) {',
  '    shares[remainderIndex] += remainder;',
  '  }',
  '',
  '  return shares.map(share => (sign * share) / 100);',
  '}',
];
const testBefore = [
  'import { expect, it } from "vitest";',
  'import { splitAmount } from "./split";',
  '',
  'it("splits", () => {',
  '  expect(splitAmount(10, [1, 1])).toEqual([5, 5]);',
  '});',
];
const testAfter = [
  'import { describe, expect, it } from "vitest";',
  'import { splitAmount } from "./split";',
  '',
  'describe("splitAmount", () => {',
  '  it("works", () => {',
  '    expect(splitAmount(10, [1, 1, 1])).toEqual([3.34, 3.33, 3.33]);',
  '  });',
  '',
  '  it("preserves the total for refunds", () => {',
  '    expect(splitAmount(-10, [1, 1, 1])).toEqual([-3.34, -3.33, -3.33]);',
  '  });',
  '',
  '  it("keeps zero amounts at zero", () => {',
  '    expect(splitAmount(0, [2, 3, 5])).toEqual([0, 0, 0]);',
  '  });',
  '',
  '  it("rejects an empty allocation", () => {',
  '    expect(() => splitAmount(10, [])).toThrow(RangeError);',
  '  });',
  '});',
];

export const moneyAdrContent = `# ADR 0007: Store money as integer cents
Status: Accepted
Date: 2026-10-09

## Context
Floating-point split arithmetic can lose a cent and break ledger totals.
## Decision
Represent ledger amounts as signed integer cents. Convert only at input and display boundaries. Allocate rounding remainders to the largest split, breaking ties by original order.
## Consequences
Validate safe integers at persistence boundaries. Keep refund signs and exact-total regression tests. Multi-currency minor-unit precision needs a separate decision before F-16.`;
export const seriesDefinition = 'A recurring transaction template and all its occurrences.';

export const initialState: WorkbenchState = {
  project: { name: 'ledgerly', path: '~/code/ledgerly', branch: 'main', remote: 'github.com/you/ledgerly', tracker: 'local-markdown' },
  agents: [
    { id: 'claude', name: 'Claude Code', available: true, via: 'acp' },
    { id: 'codex', name: 'Codex', available: true, via: 'acp' },
    { id: 'grok', name: 'Grok Build', available: true, via: 'acp' },
    { id: 'gemini', name: 'Gemini CLI', available: false, via: 'acp', note: 'not found on PATH' },
  ],
  workflows,
  milestones: [
    { id: 'M1', name: 'M1 · Private beta', status: 'shipped', description: 'Local ledger, budget envelopes, and the beta development toolchain.' },
    { id: 'M2', name: 'M2 · Import & auth', target: '2026-10-24', status: 'active', description: 'Bring existing bank history into ledgerly and add optional GitHub identity.' },
    { id: 'M3', name: 'M3 · Automation', status: 'planned', description: 'Recurring series and currency-aware accounts, without bank synchronization.' },
  ],
  items, runs, adrs,
  glossary: [
    { term: 'Transaction', definition: 'A signed amount booked to one account on a date, with a payee and optional envelope.' },
    { term: 'Split', definition: 'A portion of a transaction assigned to an envelope; all splits must equal the original total.' },
    { term: 'Envelope', definition: 'A budgeting category with a monthly target and available balance.' },
    { term: 'Payee', definition: 'The merchant or person associated with a transaction; bank text is preserved separately from the normalized name.' },
  ],
  inbox: [
    { id: 'question-r-110', kind: 'question', itemId: 'F-15', runId: 'r-110', agent: 'claude', title: "When a recurring transaction's amount changes (e.g. a subscription price rise), should past occurrences keep their original amount?", createdAt: at('10:27:00'), allowFreeText: true, options: [{ id: 'keep-history', label: 'Keep history unchanged (Recommended)', description: 'Price changes apply to future occurrences only.' }, { id: 'rewrite-all', label: 'Rewrite all occurrences' }, { id: 'ask-per-series', label: 'Ask per series' }] },
    { id: 'permission-r-109', kind: 'permission', itemId: 'B-31', runId: 'r-109', agent: 'codex', title: 'Allow Codex to run the money test suite?', detail: 'Local Vitest execution in the split-cent-rounding worktree. No network or ledger writes.', command: 'pnpm vitest run src/money --reporter=dot', createdAt: at('10:24:00') },
    { id: 'approval-F-14-spec', kind: 'approval', itemId: 'F-14', runId: 'r-106', agent: 'claude', stageId: 'spec', title: 'Approve spec for F-14', detail: '.scratch/github-sign-in/spec.md — OAuth state, callback validation, optional local-first identity.', createdAt: at('09:42:00') },
    { id: 'review-B-31', kind: 'review', itemId: 'B-31', runId: 'r-109', agent: 'codex', stageId: 'review', title: '3 findings, lint failing', detail: 'Review a41c9e2: one spec mismatch, one standards issue, one nit.', createdAt: at('10:22:00') },
    { id: 'proposal-money-cents', kind: 'memory', itemId: 'B-31', runId: 'r-108', agent: 'codex', proposalId: 'proposal-money-cents', title: 'ADR 0007 · Store money as integer cents', createdAt: at('09:15:00') },
    { id: 'proposal-series', kind: 'memory', itemId: 'F-15', runId: 'r-110', agent: 'claude', proposalId: 'proposal-series', title: 'Add “Series” to GLOSSARY.md', createdAt: at('10:26:30') },
  ],
  proposals: [
    { id: 'proposal-money-cents', itemId: 'B-31', runId: 'r-108', agent: 'codex', target: 'docs/adr/0007-money-as-integer-cents.md', kind: 'adr', summary: 'Store money as integer cents', status: 'proposed', diff: `--- /dev/null\n+++ b/docs/adr/0007-money-as-integer-cents.md\n@@ -0,0 +1,${moneyAdrContent.split('\n').length} @@\n${moneyAdrContent.split('\n').map(line => `+${line}`).join('\n')}` },
    { id: 'proposal-series', itemId: 'F-15', runId: 'r-110', agent: 'claude', target: 'GLOSSARY.md', kind: 'glossary', summary: 'Series — a recurring transaction template and all its occurrences', status: 'proposed', diff: `--- a/GLOSSARY.md\n+++ b/GLOSSARY.md\n@@ -4,1 +4,3 @@\n Payee: The merchant or person associated with a transaction.\n+\n+Series: ${seriesDefinition}` },
  ],
  reviews: [{ itemId: 'B-31', commit: 'a41c9e2', checksCommit: 'a41c9e2', baseBranch: 'main', branch: 'wb/split-cent-rounding',
    files: [diffFile('src/money/split.ts', splitBefore, splitAfter), diffFile('src/money/split.test.ts', testBefore, testAfter)],
    findings: [
      { id: 'finding-remainder', axis: 'spec', severity: 'major', path: 'src/money/split.ts', line: 23, title: 'Remainder goes to first split; spec says largest split', body: 'remainderIndex is always 0. With weights [2, 3, 5], the largest split is index 2. Allocate the remainder there and use original order only for ties. Add an unequal-weight regression before approving.', agent: 'codex', status: 'open' },
      { id: 'finding-cents', axis: 'standards', severity: 'minor', path: 'src/money/split.ts', line: 11, title: 'Magic number 100 — use CENTS_PER_UNIT', body: 'Import CENTS_PER_UNIT from the shared money constants so conversion at input and output uses the same documented unit. Lint reports no-magic-numbers here.', agent: 'codex', status: 'open' },
      { id: 'finding-test-name', axis: 'standards', severity: 'nit', path: 'src/money/split.test.ts', line: 5, title: 'Test name does not describe the invariant', body: '“works” hides the regression. Name the exact-total behavior and tie-break expectation so failures explain what broke.', agent: 'codex', status: 'open' },
    ],
    checks: [{ name: 'typecheck', status: 'pass', detail: 'tsc --noEmit', durationSec: 2.1 }, { name: 'test', status: 'pass', detail: '18 tests pass; largest-split regression missing', durationSec: 0.8 }, { name: 'lint', status: 'fail', detail: '1 error: split.ts:11 no-magic-numbers', durationSec: 1.3 }],
  }],
  now: SCENARIO_NOW,
};
