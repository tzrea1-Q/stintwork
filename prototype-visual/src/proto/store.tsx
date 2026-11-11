import { createContext, useContext, useRef, useState, type ReactNode } from 'react'
import { initialItems, initialAttention, stages, type Agent, type WorkItem, type Attention } from './data'
export type State = { items: WorkItem[]; attention: Attention[]; selected: string | null }
type Store = { state: State; update: (label: string, fn: (s: State) => State) => void; select: (id: string | null) => void; undo: () => void; toast: string; setToast: (v:string)=>void; start: (id:string)=>void; stop:(id:string)=>void }
const Context = createContext<Store>(null!)
export function WorkbenchProvider({children}:{children:ReactNode}) {
 const [state,setState] = useState<State>({items:structuredClone(initialItems),attention:structuredClone(initialAttention),selected:'F-12'})
 const [toast,setToast] = useState(''); const previous = useRef<State | null>(null); const current = useRef(state); current.current=state
 const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({}); const managed = useRef(new Set<string>())
 function update(label:string, fn:(s:State)=>State) { previous.current = structuredClone(current.current); const next=fn(current.current); current.current=next; setState(next); setToast(label) }
 function select(id:string | null) { const next={...current.current,selected:id}; current.current=next; setState(next) }
 function undo() { if(previous.current) { const restored={...previous.current,selected:current.current.selected}; for(const id of managed.current) { const running=restored.items.find(i=>i.id===id)?.history[0]?.status==='running'; if(!running && timers.current[id]) { clearTimeout(timers.current[id]); delete timers.current[id] } else if(running && !timers.current[id]) schedule(id) } current.current=restored; setState(restored); previous.current=null; setToast('') } }
 function schedule(id:string) { timers.current[id]=setTimeout(()=>{const s=current.current; const next:State={...s,items:s.items.map(i=>i.id===id && i.history[0]?.status==='running'?{...i,history:[{...i.history[0],status:'done',duration:'4s',checkpoint:'c07b5d1'},...i.history.slice(1)],tickets:i.id==='F-12'?i.tickets.map(t=>t.id==='02'?{...t,status:'resolved'}:t.id==='03'?{...t,status:'open',blockedBy:[]}:t):i.tickets}:i)}; current.current=next; setState(next); delete timers.current[id]},4000) }
 function start(id:string) { if(timers.current[id]) clearTimeout(timers.current[id]); managed.current.add(id); update('Stint started',s=>({...s,items:s.items.map(i=>i.id===id?{...i,history:[{agent:i.stageAgents[i.stage],stage:i.stage,status:'running',started:'Just now',duration:'0m',checkpoint:'—'},...i.history]}:i)})); schedule(id) }
 function stop(id:string) { clearTimeout(timers.current[id]); delete timers.current[id]; update('Stint stopped',s=>({...s,items:s.items.map(i=>i.id===id?{...i,history:[{...i.history[0],status:'stopped',duration:'Just now'},...i.history.slice(1)],handoff:'Stopped by you. Continue from the latest checkpoint.'}:i)})) }
 return <Context.Provider value={{state,update,select,undo,toast,setToast,start,stop}}>{children}</Context.Provider>
}
export const useWorkbench=()=>useContext(Context)
export function setAgent(s:State,id:string,agent:Agent):State { return {...s,items:s.items.map(i=>i.id===id?{...i,stageAgents:{...i.stageAgents,[i.stage]:agent}}:i)} }
export function resolve(s:State,id:string):State { return {...s,attention:s.attention.filter(a=>a.id!==id),items:s.items.map(i=>id==='approval'&&i.id==='F-14'?{...i,stage:'Tickets',stageStates:{...i.stageStates,Spec:'done',Tickets:'active'},next:'Start stint'}:i)} }
export { stages }
