import { useState } from "react";

export function StopStint({ stintId }: { stintId: string }) {
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState("");

  async function stop() {
    setRequested(true);
    setError("");
    try {
      const response = await fetch(`/api/stints/${encodeURIComponent(stintId)}/stop`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(typeof body.reason === "string" ? body.reason : "Could not stop stint.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not stop stint.");
      setRequested(false);
    }
  }

  return (
    <div>
      <button type="button" className="action" onClick={stop} disabled={requested}>
        {requested ? "Stopping stint…" : "Stop"}
      </button>
      {error && (
        <p role="alert" className="warning">
          {error}
        </p>
      )}
    </div>
  );
}
