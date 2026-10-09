import { useEffect, useState } from 'react';
import { useWorkbench } from './store';

export type VariantKey = 'A' | 'B' | 'C';
export const VARIANT_EVENT = 'workbench:variant-change';
const keys: VariantKey[] = ['A', 'B', 'C'];
const labels: Record<VariantKey, string> = { A: 'Lists', B: 'Pipeline', C: 'Cockpit' };
export function readVariant(): VariantKey {
  const value = new URLSearchParams(window.location.search).get('variant');
  return keys.includes(value as VariantKey) ? value as VariantKey : 'A';
}

function JsonNode({ name, value }: { name: string; value: unknown }) {
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    return <details className="ml-3 border-l border-white/15 pl-2"><summary className="cursor-pointer py-1"><strong>{name}</strong> <span className="text-white/50">{Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}</span></summary>{entries.map(([key, entry]) => <JsonNode key={key} name={key} value={entry} />)}</details>;
  }
  return <div className="ml-3 break-all py-0.5"><span className="text-white/60">{JSON.stringify(name)}: </span>{JSON.stringify(value)}</div>;
}

export function PrototypeSwitcher() {
  const { state, actions } = useWorkbench();
  const [variant, setVariant] = useState(readVariant);
  const [inspect, setInspect] = useState(false);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const changed = () => setVariant(readVariant());
    const cycle = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [cmdk-root], [cmdk-dialog], [data-command-palette]')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); changeVariant(event.key === 'ArrowLeft' ? -1 : 1); }
    };
    window.addEventListener('popstate', changed); window.addEventListener(VARIANT_EVENT, changed); window.addEventListener('keydown', cycle);
    return () => { window.removeEventListener('popstate', changed); window.removeEventListener(VARIANT_EVENT, changed); window.removeEventListener('keydown', cycle); };
  }, []);
  function changeVariant(direction: number) {
    const url = new URL(window.location.href);
    url.searchParams.set('variant', keys[(keys.indexOf(readVariant()) + direction + keys.length) % keys.length]);
    window.history.replaceState(window.history.state, '', url);
    window.dispatchEvent(new Event(VARIANT_EVENT));
  }
  if (!import.meta.env.DEV) return null;
  return <>
    {inspect && <aside id="prototype-state" aria-label="Prototype state inspector" className="fixed bottom-20 left-1/2 z-[100] max-h-[65vh] w-[min(800px,calc(100vw-32px))] -translate-x-1/2 overflow-auto rounded-lg border border-white/20 bg-[#14151a] p-4 font-mono text-xs text-white shadow-2xl"><div className="mb-3 flex items-center justify-between"><strong>In-memory state · {state.now}</strong><button onClick={() => setInspect(false)} aria-label="Close state inspector">✕</button></div>{Object.entries(state).map(([key, value]) => <JsonNode key={key} name={key} value={value} />)}</aside>}
    <nav aria-label="Prototype variants" className="prototype-switcher fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/20 bg-[#f4f4f5] p-1.5 text-[#17171b] shadow-[0_8px_40px_#0008]">
      <button onClick={() => changeVariant(-1)} aria-label="Previous variant" className="rounded-full px-3 py-1.5 hover:bg-black/10">←</button>
      <span className="min-w-28 text-center text-xs font-semibold">{variant} · {labels[variant]}</span>
      <button onClick={() => changeVariant(1)} aria-label="Next variant" className="rounded-full px-3 py-1.5 hover:bg-black/10">→</button>
      <span className="mx-1 h-4 border-l border-black/20" />
      <button onClick={() => setInspect(value => !value)} aria-expanded={inspect} aria-controls="prototype-state" className="rounded-full px-2 py-1.5 text-xs hover:bg-black/10">state</button>
      <button onClick={actions.reset} className="rounded-full px-2 py-1.5 text-xs hover:bg-black/10">reset</button>
    </nav>
  </>;
}
