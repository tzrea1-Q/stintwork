import { Fragment, type ReactNode } from 'react';
import type { DiffFile, DiffLine } from '../types';

export function parseUnifiedDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | undefined;
  let hunk: DiffFile['hunks'][number] | undefined;
  let oldNo = 0;
  let newNo = 0;
  for (const line of diff.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('+++ ')) {
      file = { path: line.slice(4).replace(/^b\//, ''), added: 0, removed: 0, hunks: [] };
      files.push(file);
      hunk = undefined;
      continue;
    }
    const header = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (header && file) {
      oldNo = Number(header[1]); newNo = Number(header[2]);
      hunk = { header: line, lines: [] }; file.hunks.push(hunk);
    } else if (hunk && file && /^[ +\-]/.test(line)) {
      const kind = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : 'context';
      hunk.lines.push({ kind, text: line.slice(1), ...(kind !== 'add' ? { oldNo: oldNo++ } : {}), ...(kind !== 'del' ? { newNo: newNo++ } : {}) });
      if (kind === 'add') file.added += 1;
      if (kind === 'del') file.removed += 1;
    }
  }
  return files;
}

export interface DiffViewProps {
  file?: DiffFile;
  diff?: DiffFile | string;
  files?: DiffFile[];
  className?: string;
  renderLineContent?: (newLine: number, path: string, line: DiffLine) => ReactNode;
  renderAfterLine?: (line: DiffLine, path: string) => ReactNode;
  slots?: Record<number, ReactNode>;
}
export function DiffView({ file, diff, files, className = '', renderLineContent, renderAfterLine, slots }: DiffViewProps) {
  const resolved = files ?? (file ? [file] : typeof diff === 'string' ? parseUnifiedDiff(diff) : diff ? [diff] : []);
  return <div className={`diff-view ${className}`}>
    {resolved.map(file => <section key={file.path} aria-label={`Diff for ${file.path}`}>
      <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 font-mono text-xs"><span className="min-w-0 break-all">{file.path}</span><span className="ml-auto text-[var(--success)]">+{file.added}</span><span className="text-[var(--danger)]">−{file.removed}</span></header>
      {file.hunks.map((hunk, hunkIndex) => <div key={hunkIndex}>
        <div className="diff-hunk">{hunk.header}</div>
        {hunk.lines.map((line, lineIndex) => <Fragment key={lineIndex}>
          <div className={`diff-line diff-${line.kind}`} data-new-line={line.newNo}>
            <span className="diff-number" aria-label={line.oldNo ? `Old line ${line.oldNo}` : undefined}>{line.oldNo ?? ''}</span>
            <span className="diff-number" aria-label={line.newNo ? `New line ${line.newNo}` : undefined}>{line.newNo ?? ''}</span>
            <span className="diff-sign" aria-hidden="true">{line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '}</span><code>{line.text || ' '}</code>
          </div>
          {line.newNo !== undefined && (renderLineContent?.(line.newNo, file.path, line) ?? slots?.[line.newNo])}
          {renderAfterLine?.(line, file.path)}
        </Fragment>)}
      </div>)}
    </section>)}
  </div>;
}
