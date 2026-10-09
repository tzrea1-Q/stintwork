import { Ban, Check, CheckCircle2, Circle, CircleDashed, CircleDot, CircleHelp, Clock3, LoaderCircle, PauseCircle, XCircle } from 'lucide-react';
import type { RunStatus, StageStatus, TicketStatus } from '../types';

export interface StatusIconProps { status: StageStatus | TicketStatus | RunStatus | 'pass' | 'fail' | 'pending' | 'blocked' | 'shipped'; size?: number; className?: string }
export function StatusIcon({ status, size = 14, className = '' }: StatusIconProps) {
  const icons = { done: CheckCircle2, resolved: CheckCircle2, pass: Check, shipped: CheckCircle2, active: CircleDot, 'in-progress': CircleDot, claimed: Clock3, running: LoaderCircle, waiting: CircleHelp, stopped: PauseCircle, failed: XCircle, fail: XCircle, todo: CircleDashed, open: Circle, pending: CircleDashed, skipped: Ban, blocked: Ban };
  const Icon = icons[status];
  const color = ['done', 'resolved', 'pass', 'shipped'].includes(status) ? 'var(--success)' : ['fail', 'failed'].includes(status) ? 'var(--danger)' : ['active', 'running', 'in-progress'].includes(status) ? 'var(--accent)' : 'var(--muted)';
  return <Icon size={size} role="img" aria-label={status} className={`${status === 'running' ? 'animate-spin' : ''} ${className}`} style={{ color, flexShrink: 0 }} />;
}
