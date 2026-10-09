import { diffFile, initialState } from './data';
import type { AgentId, Artifact, Brief, Check, DiffFile, Handoff, MemoryProposal, Run, RunEvent, Ticket, WorkItem } from './types';

type EventPayload<Event = RunEvent> = Event extends RunEvent ? Omit<Event, 'id' | 'at'> : never;
export type ScriptStep =
  | { kind: 'event'; event: EventPayload; delayMs?: number }
  | { kind: 'pause'; reason: 'question' | 'permission'; title: string; command?: string; options?: { id: string; label: string }[]; delayMs?: number }
  | { kind: 'finish'; handoff: Handoff; ticketId?: string; artifact?: Omit<Artifact, 'updatedAt'>; tickets?: Ticket[]; proposal?: Omit<MemoryProposal, 'id' | 'runId' | 'agent' | 'itemId' | 'status'>; checks?: Check[]; checksCommit?: string; reviewFiles?: DiffFile[]; delayMs?: number };

const emit = (event: EventPayload): ScriptStep => ({ kind: 'event', event });
const message = (text: string) => emit({ kind: 'message', text });
const tool = (input: string, output: string, status: 'ok' | 'error' = 'ok') => emit({ kind: 'tool', tool: 'shell', input, output, status });
const plan = (steps: string[], completed: number) => emit({ kind: 'plan', steps: steps.map((text, index) => ({ text, done: index < completed })) });
const finish = (stoppedAt: string, suggestedNext: string, effects: Partial<Extract<ScriptStep, { kind: 'finish' }>> = {}): ScriptStep => ({ kind: 'finish', handoff: { stoppedAt, unresolved: [], suggestedNext }, ...effects });
const passingChecks: Check[] = [
  { name: 'typecheck', status: 'pass', detail: 'pnpm typecheck — no errors', durationSec: 2.1 },
  { name: 'test', status: 'pass', detail: 'pnpm vitest run — 21 tests passed', durationSec: 0.9 },
  { name: 'lint', status: 'pass', detail: 'pnpm lint — no errors', durationSec: 1.2 },
];

function correctedMoneyDiff(): DiffFile[] {
  return initialState.reviews[0].files.map(file => {
    const lines = file.hunks.flatMap(hunk => hunk.lines);
    const before = lines.filter(line => line.kind !== 'add').map(line => line.text);
    let after = lines.filter(line => line.kind !== 'del').map(line => line.text);
    if (file.path === 'src/money/split.ts') after = ['import { CENTS_PER_UNIT } from "./constants";', '', ...after.map(line => line.replace('amount * 100', 'amount * CENTS_PER_UNIT').replace('/ 100', '/ CENTS_PER_UNIT').replace('const remainderIndex = 0;', 'const remainderIndex = weights.indexOf(Math.max(...weights));'))];
    else {
      after = after.map(line => line.replace('it("works"', 'it("preserves totals and breaks equal-weight ties by original order"'));
      after.splice(16, 0, '  it("assigns the remainder to the largest split", () => {', '    expect(splitAmount(0.11, [2, 3, 5])).toEqual([0.02, 0.03, 0.06]);', '  });', '');
    }
    return diffFile(file.path, before, after);
  });
}

export function scriptFor(item: WorkItem, stageId: string, ticketId: string | undefined, agent: AgentId, brief: Brief): ScriptStep[] {
  const intro = message(`Brief received for ${item.id} / ${stageId} (${agent}).\n${brief.prompt}`);
  if (item.id === 'F-12' && stageId === 'implement' && ticketId === '02') {
    const steps = ['Read r-104 handoff and amended spec', 'Normalize payees and apply the 3-day window', 'Make regression tests pass and hand off'];
    return [intro,
      message('Read handoff from r-104 (Grok): exact key exists; fuzzy payee matching and 3 tests remain. Spec criterion 3 changed to a 3-day window; I will not reuse the same-day assumption.'),
      plan(steps, 1), tool('rg "dedupe|normalizePayee|bookedOn" src/features/import', 'Found exact-key comparison in import.dedupe.ts and the three failing payee fixtures.'),
      emit({ kind: 'file', path: 'src/features/import/import.dedupe.ts', added: 26, removed: 11 }),
      message('Payees now normalize case, punctuation, whitespace, and bank suffixes. Dates compare calendar days in an inclusive ±3-day window; signed cents and account scope still match exactly.'),
      plan(steps, 2), emit({ kind: 'file', path: 'src/features/import/import.dedupe.test.ts', added: 34, removed: 4 }),
      tool('pnpm vitest run src/features/import/import.dedupe.test.ts', '17 tests passed. Former 3 failures pass; Friday → Monday matches, 4 days does not, cross-account and refund cases remain distinct.'),
      tool('pnpm typecheck && pnpm lint', 'Typecheck passed. Lint passed.'),
      tool('git diff --stat', 'import.dedupe.ts | 37; import.dedupe.test.ts | 38; issues/02-dedupe-transactions.md | 2'),
      plan(steps, 3), finish('Ticket 02 resolved. Fuzzy payee normalization and the inclusive 3-day window are implemented; all 17 dedupe tests, typecheck, and lint pass.', '/implement .scratch/bank-csv-import/issues/03-category-mapping.md', {
        ticketId: '02', checks: passingChecks,
        proposal: { kind: 'glossary', target: 'GLOSSARY.md', summary: 'Import batch — an atomic, retry-safe CSV confirmation', diff: '--- a/GLOSSARY.md\n+++ b/GLOSSARY.md\n@@ -4,1 +4,3 @@\n Payee: The merchant or person associated with a transaction.\n+\n+Import batch: The transactions created by one atomic CSV confirmation, identified together so retries cannot duplicate them.' },
      }),
    ];
  }
  if (stageId === 'clarify') {
    return [intro, plan(['Read project conventions', 'Clarify scope and edge cases', 'Record agreed constraints'], 1),
      tool(`rg "${item.slug}" src .scratch`, 'Located existing feature entry points and the local Markdown tracker.'),
      { kind: 'pause', reason: 'question', title: `For ${item.title}, should the first version remain local-only?`, options: [{ id: 'local-only', label: 'Local-only (Recommended)' }, { id: 'include-sync', label: 'Include synchronization' }] },
      message('Recorded your answer as a constraint for the spec; unrelated features remain out of scope.'),
      plan(['Read project conventions', 'Clarify scope and edge cases', 'Record agreed constraints'], 3),
      finish('Clarification complete. User decision recorded in the session; ready to write acceptance criteria.', `/to-spec .scratch/${item.slug}/`),
    ];
  }
  if (stageId === 'spec') {
    return [intro, plan(['Read clarification handoff', 'Write acceptance criteria', 'Check scope against ADRs'], 1),
      message('Separating the user-visible behavior, persistence rules, and non-goals before drafting.'),
      emit({ kind: 'file', path: `.scratch/${item.slug}/spec.md`, added: 22, removed: 0 }),
      plan(['Read clarification handoff', 'Write acceptance criteria', 'Check scope against ADRs'], 3),
      finish('Draft spec is ready for human approval. No implementation started.', `Approve .scratch/${item.slug}/spec.md, then /to-tickets`, {
        artifact: { path: `.scratch/${item.slug}/spec.md`, title: `${item.title} spec`, kind: 'spec', content: `# ${item.title}\nStatus: Draft — awaiting approval\n\n## Goal\nDeliver ${item.title.toLowerCase()} without compromising the local-first ledger.\n\n## Acceptance criteria\n1. The primary flow is keyboard-accessible and explains errors inline.\n2. Cancel leaves existing transactions unchanged; writes are atomic in SQLite.\n3. Validate inputs before persistence and cover boundary cases with Vitest.\n4. Preserve existing account history and exact monetary totals.\n\n## Constraints from clarification\n${brief.lastHandoff?.handoff.stoppedAt ?? 'Use the decisions recorded in the clarification session.'}\n\n## Non-goals\nBank synchronization, team accounts, and unrelated schema changes.\n\n## Read first\nAGENTS.md; GLOSSARY.md; docs/adr/0001-sqlite-only-store.md.` },
      }),
    ];
  }
  if (stageId === 'tickets') {
    const tickets: Ticket[] = ['Core logic and regression coverage', 'Accessible UI and integration'].map((title, index) => ({
      id: `0${index + 1}`, slug: index === 0 ? 'core-logic' : 'ui-integration', title, status: 'open', blockedBy: index === 0 ? [] : ['01'],
      path: `.scratch/${item.slug}/issues/0${index + 1}-${index === 0 ? 'core-logic' : 'ui-integration'}.md`,
      body: `# ${title}\nStatus: open\nBlocked by: ${index === 0 ? 'none' : '01'}\n\n## Acceptance\n- [ ] Implement the approved spec's ${index === 0 ? 'domain behavior and boundary validation' : 'primary UI flow and keyboard interactions'}.\n- [ ] Add focused Vitest coverage and record actual checks in the handoff.`, comments: [],
    }));
    return [intro, plan(['Read approved spec', 'Split into dependency-ordered tickets', 'Check criterion coverage'], 1),
      ...tickets.map(ticket => emit({ kind: 'file', path: ticket.path, added: 10, removed: 0 })),
      plan(['Read approved spec', 'Split into dependency-ordered tickets', 'Check criterion coverage'], 3),
      finish('Two dependency-ordered tickets drafted. Approve the task list before implementation.', `Approve tickets, then /implement ${tickets[0].path}`, { tickets }),
    ];
  }
  if (stageId === 'diagnose') {
    const steps = ['Reproduce the reported behavior', 'Trace the shared caller', 'Record a minimal regression'];
    return [intro, plan(steps, 0), tool(`rg "${item.slug}" src`, 'Traced the feature entry point to the shared domain helper.'),
      tool(`pnpm vitest run src/features/${item.slug}`, 'Regression reproduces the reported mismatch before any fix.', 'error'),
      emit({ kind: 'file', path: `.scratch/${item.slug}/reproduction.md`, added: 12, removed: 0 }), plan(steps, 3),
      finish('Reproduced the bug and traced it to the shared helper; regression is red before the fix.', `/tdd .scratch/${item.slug}/spec.md`, { artifact: { path: `.scratch/${item.slug}/reproduction.md`, title: 'Bug reproduction', kind: 'other', content: `# ${item.title}\nStatus: Reproduced\n\nThe focused regression fails against the current helper. Fix the shared path, rerun its callers, and preserve ledger totals. No fix has been applied yet.` } }),
    ];
  }
  if (stageId === 'review') {
    const command = item.id === 'B-31' ? 'pnpm vitest run src/money --reporter=dot' : `pnpm vitest run src/features/${item.slug}`;
    return [intro, plan(['Read diff against approved spec', 'Check coding standards', 'Run focused checks'], 2),
      tool('git diff main...HEAD --stat', 'Scoped the review to the work item branch.'),
      { kind: 'pause', reason: 'permission', title: 'Allow the agent to run the focused tests?', command },
      tool(command, 'Focused suite passed.'),
      ...(item.id === 'B-31' ? [message('Re-reviewed the follow-up on c07b5d1: largest-split remainder, shared conversion constant, and descriptive unequal-weight regression. No remaining findings on this tree.')] : []),
      plan(['Read diff against approved spec', 'Check coding standards', 'Run focused checks'], 3),
      finish('Review complete. Checks pass; human approval is still required.', 'Approve Review, then start Ship', { checks: passingChecks, ...(item.id === 'B-31' ? { checksCommit: 'c07b5d1', reviewFiles: correctedMoneyDiff() } : {}) }),
    ];
  }
  if (stageId === 'ship') {
    return [intro, tool('git diff main...HEAD --stat', 'Prepared PR summary from approved changes and handoffs.'), message('Opened a draft pull request. Nothing is merged automatically.'), finish('Draft PR is ready to merge after your decision.', 'Merge pull request')];
  }
  const steps = ['Read spec and relevant callers', 'Apply the smallest implementation', 'Run checks and write handoff'];
  const path = item.id === 'B-31' ? 'src/money/split.ts' : `src/features/${item.slug}/index.ts`;
  return [intro, plan(steps, 1), tool(`rg "${item.slug}" src`, 'Read the feature entry point and adjacent tests before editing.'),
    emit({ kind: 'file', path, added: 18, removed: 8 }), plan(steps, 2),
    tool(item.id === 'B-31' ? 'pnpm vitest run src/money' : `pnpm vitest run src/features/${item.slug}`, '21 tests passed, including boundary and regression coverage.'),
    tool('pnpm typecheck && pnpm lint', 'Typecheck passed. Lint passed.'), tool('git diff --stat', `${path} | 26 lines changed`), plan(steps, 3),
    finish('Implementation and focused checks complete. Review the diff before shipping.', 'Start Review', { ticketId, checks: passingChecks }),
  ];
}

export function continuationFor(run: Run, item: WorkItem, decision: string | boolean): ScriptStep[] {
  if (run.id === 'r-110') {
    const choice = typeof decision === 'string' ? decision : 'Keep history unchanged';
    const policy = choice === 'Keep history unchanged (Recommended)' ? 'Past occurrences keep their original amount. Price changes affect future occurrences only.' : `User-selected policy: ${choice}. Carry this explicitly into the spec and ask again before any destructive history rewrite.`;
    return [message(`Recorded: ${policy}`), plan(['Clarify Series ownership', 'Agree history policy', 'Prepare spec handoff'], 2),
      emit({ kind: 'file', path: '.scratch/recurring-transactions/notes.md', added: 9, removed: 1 }),
      message('Schedule edits are separate from actual payments. Cancellation stops future scheduling; an occurrence is still a normal Transaction.'),
      plan(['Clarify Series ownership', 'Agree history policy', 'Prepare spec handoff'], 3),
      finish(`Recurring-transaction clarification complete. ${policy}`, '/to-spec .scratch/recurring-transactions/', {
        artifact: { path: '.scratch/recurring-transactions/notes.md', title: 'Recurring transaction decisions', kind: 'other', content: `# Recurring transactions\nStatus: Clarified\n\n## History policy\n${policy}\n\n## Scope\nWeekly, monthly, and yearly local schedules. A Series groups its template and occurrences. Cancellation stops future occurrences; already booked transactions remain real ledger entries.\n\n## Next\nDraft acceptance criteria before implementation. GLOSSARY.md has a separate Series proposal awaiting your decision.` },
      }),
    ];
  }
  if (decision === false) {
    return [message('Permission denied. Skipping execution; existing checks remain unchanged and are not new evidence.'),
      finish('Review stopped short of test execution because permission was denied.', 'Review existing findings or start a new review with permission', { handoff: { stoppedAt: 'Reviewed the available diff without running the denied command.', unresolved: ['Focused checks were denied; no refreshed evidence'], suggestedNext: 'Review existing findings or rerun with permission' } }),
    ];
  }
  if (run.id === 'r-109') {
    return [tool('pnpm vitest run src/money --reporter=dot', '18 tests passed on a41c9e2; unequal-weight remainder coverage is still missing.'),
      message('Applying the local follow-up: allocate remainder to the largest split, use CENTS_PER_UNIT, and rename the regression. The original findings remain evidence for a41c9e2, not this new tree.'),
      emit({ kind: 'file', path: 'src/money/split.ts', added: 6, removed: 4 }), emit({ kind: 'file', path: 'src/money/split.test.ts', added: 9, removed: 1 }),
      tool('pnpm vitest run src/money --reporter=dot', '21 tests passed, including unequal weights and negative totals.'),
      tool('pnpm typecheck && pnpm lint', 'Typecheck passed; lint passed, 0 errors.'),
      tool('git diff --stat', 'split.ts | 10; split.test.ts | 10. New simulated commit: c07b5d1'),
      finish('Follow-up checks all pass on c07b5d1. Original findings and diff belong to a41c9e2; rereview before approval.', 'Re-review c07b5d1 — previous review evidence is stale', { checks: passingChecks, checksCommit: 'c07b5d1' }),
    ];
  }
  return [tool(`pnpm vitest run src/features/${item.slug}`, 'Focused tests passed.'), finish('Review checks completed after permission was granted; awaiting human approval.', 'Approve Review', { checks: passingChecks })];
}
