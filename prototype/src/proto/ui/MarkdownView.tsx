import { Fragment, type ReactNode } from 'react';

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^\s)]+\))/g).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
    if (link && /^(https?:\/\/|\/|#)/.test(link[2])) return <a key={index} href={link[2]} rel="noreferrer">{link[1]}</a>;
    return part;
  });
}

export interface MarkdownViewProps { content?: string; markdown?: string; className?: string }
export function MarkdownView({ content, markdown, className = '' }: MarkdownViewProps) {
  const lines = (content ?? markdown ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const key = index;
    if (!line.trim()) { index += 1; continue; }
    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<pre key={key}><code data-language={language}>{code.join('\n')}</code></pre>);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const Heading = `h${heading[1].length}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      blocks.push(<Heading key={key}>{inline(heading[2])}</Heading>);
      index += 1;
      continue;
    }
    const list = line.match(/^\s*(?:[-*+]\s+|\d+\.\s+)/);
    if (list) {
      const ordered = /^\s*\d+\./.test(line);
      const entries: ReactNode[] = [];
      while (index < lines.length && (ordered ? /^\s*\d+\.\s+/ : /^\s*[-*+]\s+/).test(lines[index])) {
        const text = lines[index].replace(/^\s*(?:[-*+]\s+|\d+\.\s+)/, '');
        const checkbox = text.match(/^\[([ xX])\]\s+(.+)$/);
        entries.push(<li key={index} className={checkbox ? 'markdown-task' : undefined}>{checkbox ? <><input type="checkbox" checked={checkbox[1].toLowerCase() === 'x'} readOnly aria-label={checkbox[2]} /> <span>{inline(checkbox[2])}</span></> : inline(text)}</li>);
        index += 1;
      }
      blocks.push(ordered ? <ol key={key} start={Number(line.trim().match(/^\d+/)?.[0] ?? 1)}>{entries}</ol> : <ul key={key}>{entries}</ul>);
      continue;
    }
    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+\.\s)/.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={key}>{paragraph.map((text, position) => <Fragment key={position}>{position > 0 && <br />}{inline(text)}</Fragment>)}</p>);
  }
  return <div className={`markdown-view ${className}`}>{blocks}</div>;
}
