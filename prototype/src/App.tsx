import { useEffect, useState } from 'react';
import { WorkbenchProvider } from './proto/store';
import { PrototypeSwitcher, readVariant, VARIANT_EVENT } from './proto/PrototypeSwitcher';
import VariantA from './variants/A';
import VariantB from './variants/B';
import VariantC from './variants/C';

export default function App() {
  const [variant, setVariant] = useState(readVariant);
  useEffect(() => {
    const changed = () => setVariant(readVariant());
    window.addEventListener('popstate', changed); window.addEventListener(VARIANT_EVENT, changed);
    return () => { window.removeEventListener('popstate', changed); window.removeEventListener(VARIANT_EVENT, changed); };
  }, []);
  const Variant = { A: VariantA, B: VariantB, C: VariantC }[variant];
  return <WorkbenchProvider><Variant /><PrototypeSwitcher /></WorkbenchProvider>;
}
