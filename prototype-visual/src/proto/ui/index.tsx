import { CircleDot, CircleHelp, ClipboardCheck, Code2, GitPullRequest, Rocket, type LucideIcon } from 'lucide-react'
import type { Agent, Stage } from '../data'
const colors:Record<Agent,string>={'Claude Code':'#D97757','Codex':'#10A37F','Grok Build':'#8E8E99','Antigravity CLI':'#4285F4'}
export function AgentAvatar({agent,running=false}:{agent:Agent;running?:boolean}) {return <span className={'agent-avatar '+(running?'agent-pulse':'')} style={{backgroundColor:colors[agent]}} title={agent}>{agent[0]}</span>}
export function StatusChip({status,label}:{status:string;label?:string}) {return <span className={'status-chip '+status}><span className="status-dot"/>{label??status}</span>}
export function IconChip({icon:Icon,tone='neutral'}:{icon:LucideIcon;tone?:string}) {return <span className={'icon-chip '+tone}><Icon size={16}/></span>}
export function PropertyRow({icon:Icon,label,value}:{icon:LucideIcon;label:string;value:React.ReactNode}) {return <div className="property"><Icon size={15}/><span>{label}</span><div>{value}</div></div>}
export function SegmentedProgress({value,total}:{value:number;total:number}) {return <span className="segments" aria-label={`${value} / ${total}`}>{Array.from({length:total},(_,i)=><span key={i} className={i<value?'filled':''}/>)}</span>}
const icons:Record<Stage,LucideIcon>={Clarify:CircleHelp,Spec:ClipboardCheck,Tickets:CircleDot,Implement:Code2,Review:GitPullRequest,Ship:Rocket}
export function StageIcon({stage}:{stage:Stage}) {return <IconChip icon={icons[stage]} tone={stage==='Implement'?'violet':'neutral'}/>}
