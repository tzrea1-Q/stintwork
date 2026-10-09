import type { WorkflowDef } from './types';

export const workflows: WorkflowDef[] = [
  {
    id: 'feature', name: 'Feature', stages: [
      { id: 'clarify', name: 'Clarify', skill: '/grill-with-docs', gate: 'done', defaultAgent: 'claude' },
      { id: 'spec', name: 'Spec', skill: '/to-spec', produces: 'spec.md', gate: 'approve', defaultAgent: 'claude' },
      { id: 'tickets', name: 'Tickets', skill: '/to-tickets', produces: 'issues/NN-*.md', gate: 'approve', defaultAgent: 'claude' },
      { id: 'implement', name: 'Implement', skill: '/implement', gate: 'checks', defaultAgent: 'grok' },
      { id: 'review', name: 'Review', skill: '/code-review', gate: 'approve', defaultAgent: 'codex' },
      { id: 'ship', name: 'Ship', skill: '/pr', gate: 'merge' },
    ],
  },
  {
    id: 'bug', name: 'Bug', stages: [
      { id: 'diagnose', name: 'Diagnose', skill: '/diagnosing-bugs', gate: 'done', defaultAgent: 'claude' },
      { id: 'fix', name: 'Fix', skill: '/tdd', gate: 'checks', defaultAgent: 'codex' },
      { id: 'review', name: 'Review', skill: '/code-review', gate: 'approve', defaultAgent: 'codex' },
      { id: 'ship', name: 'Ship', skill: '/pr', gate: 'merge' },
    ],
  },
  {
    id: 'quick', name: 'Quick task', stages: [
      { id: 'do', name: 'Do', gate: 'checks', defaultAgent: 'claude' },
      { id: 'review', name: 'Review', skill: '/code-review', gate: 'approve', defaultAgent: 'codex' },
      { id: 'ship', name: 'Ship', skill: '/pr', gate: 'merge' },
    ],
  },
];
