import type { Health } from "@stintwork/core";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

function App() {
  const [repo, setRepo] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    async function loadHealth() {
      try {
        const response = await fetch("/api/health", { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Health request failed (${response.status}).`);
        }
        const health: Health = await response.json();
        if (health.ok !== true || typeof health.repo !== "string") {
          throw new Error("The server returned an invalid health response.");
        }
        setRepo(health.repo);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Could not connect to the server.");
        }
      }
    }
    void loadHealth();
    return () => controller.abort();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
      <section className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-8">
        <h1 className="text-3xl font-semibold tracking-tight">Stintwork</h1>
        <p className="mt-2 text-slate-400">Your local project workbench.</p>
        <p className="mt-6 text-lg" role="status">
          {repo ? `Project: ${repo}` : error ? "Connection failed." : "Opening project…"}
        </p>
        {error && (
          <p className="mt-2 text-red-300" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("The page is missing its root element.");
}
createRoot(root).render(<App />);
