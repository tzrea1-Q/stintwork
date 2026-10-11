// SPDX-License-Identifier: Apache-2.0
import { builtInWorkflows } from "@stintwork/core";
import { useEffect, useId, useRef, useState } from "react";
import "./create-work-item.css";

export function CustomiseWorkflow({ id, onClose }: { id: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [preview, setPreview] = useState<{ path: string; yaml: string } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const endpoint = `/api/workflows/${encodeURIComponent(id)}/customise`;
  const name = builtInWorkflows[id as keyof typeof builtInWorkflows]?.name ?? id;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    element?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    setPreview(null);
    setError("");
    void (async () => {
      try {
        const response = await fetch(`${endpoint}/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.reason ?? "Could not preview the workflow.");
        if (typeof result.path !== "string" || typeof result.yaml !== "string" || !result.yaml)
          throw new Error("Invalid workflow preview.");
        if (!disposed) setPreview(result);
      } catch (cause) {
        if (!disposed)
          setError(cause instanceof Error ? cause.message : "Could not preview the workflow.");
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [endpoint]);

  async function customise() {
    if (saving || !preview) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.reason ?? "Could not customise the workflow.");
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not customise the workflow.");
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="create-work-item customise-workflow"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (!saving) onClose();
        }
      }}
    >
      <h2 id={titleId}>Customise {name} workflow</h2>
      <fieldset disabled={saving}>
        {preview ? (
          <>
            <p>
              Creates <code>{preview.path}</code> in the main checkout. Edit this copy to change
              skills, agents or stages.
            </p>
            <section aria-label="Built-in workflow YAML">
              <pre>
                <code>{preview.yaml}</code>
              </pre>
            </section>
            <p className="muted">
              Commits as “Customise workflow {id}”. Existing files are never overwritten.
            </p>
          </>
        ) : (
          <p role="status">{error ? "Preview unavailable." : "Loading built-in workflow YAML…"}</p>
        )}
        {error && (
          <p role="alert" className="warning">
            {error}
          </p>
        )}
        <footer>
          <button type="button" className="top-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="top-button"
            disabled={!preview}
            onClick={() => void customise()}
          >
            {saving ? "Customising…" : "Confirm customisation"}
          </button>
        </footer>
      </fieldset>
    </dialog>
  );
}
