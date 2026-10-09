import type { HTMLAttributes } from 'react';

export function Kbd({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <kbd className={`inline-flex min-w-4 items-center justify-center rounded border border-[var(--border)] bg-[var(--surface-raised)] px-1 py-px font-mono text-[10px] leading-4 text-[var(--muted)] ${className}`} {...props} />;
}
