// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "@stintwork/core";
import { useEffect, useId, useRef, useState } from "react";
import "./create-work-item.css";

export function CreateWorkItem({
  snapshot,
  onClose,
  onCreated,
}: {
  snapshot: ProjectSnapshot;
  onClose: () => void;
  onCreated: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [title, setTitle] = useState("");
  const [workflow, setWorkflow] = useState(Object.keys(snapshot.workflows)[0] ?? "");
  const [milestone, setMilestone] = useState("");
  const [intent, setIntent] = useState("");
  const [preview, setPreview] = useState<{ input: string; slug: string } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const input = JSON.stringify({ title, workflow, milestone: milestone || null, intent });
  const slug = preview?.input === input ? preview.slug : null;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    element?.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    setPreview(null);
    setError("");
    if (!JSON.parse(input).title.trim()) return;
    const controller = new AbortController();
    let disposed = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/work-items/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: input,
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.reason ?? "Could not preview the work item.");
        if (typeof result.slug !== "string" || !result.slug)
          throw new Error("Invalid slug preview.");
        if (!disposed) setPreview({ input, slug: result.slug });
      } catch (cause) {
        if (!disposed)
          setError(cause instanceof Error ? cause.message : "Could not preview the work item.");
      }
    }, 150);
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [input]);

  async function create() {
    if (saving || !slug) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/work-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: input,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.reason ?? "Could not create the work item.");
      onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the work item.");
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="create-work-item"
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
      <h2 id={titleId}>Create work item</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <fieldset disabled={saving}>
          <label>
            Title
            <input required value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            Workflow
            <select value={workflow} onChange={(event) => setWorkflow(event.target.value)}>
              {Object.values(snapshot.workflows).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Milestone (optional)
            <select value={milestone} onChange={(event) => setMilestone(event.target.value)}>
              <option value="">No milestone</option>
              {snapshot.milestones.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Intent (optional)
            <textarea rows={4} value={intent} onChange={(event) => setIntent(event.target.value)} />
          </label>
          <p role="status">
            {slug ? (
              <>
                Folder: <code>.scratch/{slug}/</code>
              </>
            ) : error ? (
              "Folder preview unavailable."
            ) : title.trim() ? (
              "Checking the folder name…"
            ) : (
              "Enter a title to preview the folder name."
            )}
          </p>
          {error && (
            <p role="alert" className="warning">
              {error}
            </p>
          )}
          <p className="muted">
            Creates workflow.yaml and, if selected, updates the roadmap in one commit.
          </p>
          <footer>
            <button type="button" className="top-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="top-button" disabled={!slug}>
              {saving ? "Creating…" : "Create work item"}
            </button>
          </footer>
        </fieldset>
      </form>
    </dialog>
  );
}
