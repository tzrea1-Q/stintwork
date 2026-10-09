import type { Agent, AgentId } from '../types';

export const agentColors: Record<AgentId, string> = { claude: '#D97757', codex: '#10A37F', grok: '#A1A1AA', gemini: '#4285F4' };
const names: Record<AgentId, string> = { claude: 'Claude Code', codex: 'Codex', grok: 'Grok Build', gemini: 'Gemini CLI' };

export interface AgentBadgeProps { agent: AgentId | Agent; size?: 'sm' | 'md' | 'lg'; showName?: boolean; avatar?: boolean; className?: string }
export function AgentBadge({ agent, size = 'sm', showName = true, avatar = false, className = '' }: AgentBadgeProps) {
  const id = typeof agent === 'string' ? agent : agent.id;
  const name = typeof agent === 'string' ? names[id] : agent.name;
  const available = typeof agent === 'string' || agent.available;
  const diameter = avatar ? ({ sm: 18, md: 24, lg: 32 }[size]) : ({ sm: 6, md: 8, lg: 10 }[size]);
  return <span className={`inline-flex items-center gap-1.5 ${className}`} title={typeof agent === 'string' ? name : `${name}${agent.note ? ` — ${agent.note}` : ''}`} style={{ opacity: available ? 1 : 0.5 }}>
    <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-full font-medium" style={{ width: diameter, height: diameter, background: agentColors[id], color: '#101114', fontSize: diameter * 0.5 }}>{avatar ? name[0] : null}</span>
    {showName ? <span>{name}</span> : <span className="sr-only">{name}</span>}
  </span>;
}
