import { Board } from "./Board";
import { useProjectSnapshot } from "./useProjectSnapshot";

export function App() {
  const { snapshot, connection, error } = useProjectSnapshot();

  if (snapshot) return <Board snapshot={snapshot} connection={connection} error={error} />;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <section className="connection-panel">
        <p className="eyebrow">Stintwork · Local project workbench</p>
        <h1 className="mt-3 text-xl font-semibold">Opening your project</h1>
        <p className="mt-3 muted" role="status">
          {error ? "Connection unavailable. Retrying automatically…" : "Reading project files…"}
        </p>
        {error && (
          <p className="mt-3 warning" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
