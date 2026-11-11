export const stages = ['Clarify', 'Spec', 'Tickets', 'Implement', 'Review', 'Ship'] as const
export type Stage = typeof stages[number]
export const agents = ['Claude Code', 'Codex', 'Grok Build', 'Antigravity CLI'] as const
export type Agent = typeof agents[number]
export type Stint = { agent: Agent; stage: Stage; status: 'running' | 'waiting' | 'stopped' | 'done'; started: string; duration: string; checkpoint: string }
export type WorkItem = { id: string; title: string; workflow: string; milestone: string; stage: Stage; stageStates: Record<Stage, 'done' | 'active' | 'waiting' | 'todo'>; stageAgents: Record<Stage, Agent>; tickets: { id: string; title: string; status: string; blockedBy: string[] }[]; branch: string; worktree: string; handoff: string; history: Stint[]; next: string; shipped?: boolean }
function item(id: string, title: string, stage: Stage, milestone: string, agent: Agent, next: string, status: Stint['status'] = 'done'): WorkItem {
 const index = stages.indexOf(stage), slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '') || id.toLowerCase()
 return { id, title, stage, milestone, workflow: id.startsWith('B') ? 'Bug' : 'Feature', stageStates: Object.fromEntries(stages.map((s, i) => [s, i < index ? 'done' : i === index ? 'active' : 'todo'])) as WorkItem['stageStates'], stageAgents: Object.fromEntries(stages.map(s => [s, agent])) as WorkItem['stageAgents'], tickets: [], branch: `wb/${slug}`, worktree: `.scratch/${slug}/`, handoff: 'The current work is ready for the next stage.', history: [{ agent, stage, status, started: 'Nov 10, 10:24', duration: '12m', checkpoint: 'a41c9e2' }], next }
}
const csv = item('F-12','Bank CSV import','Implement','M2','Grok Build','Resume ticket 02','stopped')
csv.handoff = 'Dedupe key implemented for amount, date and payee. Fuzzy payee matching remains; 3 tests are failing. The spec changed to a three-day window since this stint stopped.'
csv.tickets = [{id:'01',title:'Parse CSV with column mapping',status:'resolved',blockedBy:[]},{id:'02',title:'Dedupe transactions on import',status:'in progress',blockedBy:[]},{id:'03',title:'Category mapping UI',status:'blocked',blockedBy:['02']},{id:'04',title:'Import summary screen',status:'blocked',blockedBy:['02','03']}]
const spec = item('F-14','Sign in with GitHub','Spec','M2','Claude Code','Approve spec'); spec.stageStates.Spec = 'waiting'
const review = item('B-31','Split totals off by one cent','Review','M2','Codex','Allow command','waiting'); review.handoff = 'Review has 3 findings and lint is failing. Permission is needed to run the money tests.'
const recurring = item('F-15','Recurring transactions','Clarify','M3','Claude Code','Answer question','waiting')
const unstarted = (i: WorkItem) => ({...i, history: []})
export const initialItems: WorkItem[] = [csv,spec,review,recurring,unstarted(item('F-16','Multi-currency','Clarify','M3','Antigravity CLI','Start Clarify')),unstarted(item('F-18','交易分类与预算概览','Tickets','M2','Claude Code','Review tickets')),item('F-19','Provide a clear, accessible overview of all imported transactions and their reconciliation history','Implement','M2','Codex','Start stint','running'),{...item('T-40','Upgrade to Vite 7','Ship','M1','Codex','Shipped'),shipped:true},{...item('F-9','Budget envelopes','Ship','M1','Claude Code','Shipped'),shipped:true}]
export type Attention = { id: string; item: string; kind: 'question' | 'permission' | 'approval' | 'review' | 'memory'; title: string; detail: string }
export const initialAttention: Attention[] = [
 {id:'question',item:'F-15',kind:'question',title:'Recurring transactions',detail:'Should past occurrences keep their original amount?'},
 {id:'permission',item:'B-31',kind:'permission',title:'Permission requested',detail:'pnpm vitest run src/money'},
 {id:'approval',item:'F-14',kind:'approval',title:'Spec ready for approval',detail:'Sign in with GitHub · Spec'},
 {id:'review',item:'B-31',kind:'review',title:'Review needs attention',detail:'3 findings · lint failing'},
 {id:'memory',item:'B-31',kind:'memory',title:'Memory proposal',detail:'Store money as integer cents'}]
export const milestones = [{id:'M1',name:'Private beta',progress:100},{id:'M2',name:'Import & auth',progress:62},{id:'M3',name:'Automation',progress:12}]

export function workItemStatus(i:WorkItem, attention:Attention[]) { return i.shipped?'done':attention.some(a=>a.item===i.id)?'waiting':i.history[0]?.stage===i.stage&&i.history[0]?.status==='running'?'running':i.history[0]?.stage===i.stage&&i.history[0]?.status==='stopped'?'stopped':i.history.length?'ready':'not-started' }
