// SPDX-License-Identifier: Apache-2.0
import { readResponseJson, CoreTextError, useErrorText, useLanguage } from "./i18n/language";
import { deriveWorkItemSlug, type ProjectSnapshot } from "@stintwork/core";
import { useEffect, useId, useRef, useState } from "react";
import "./create-work-item.css";
import { workflowName } from "./i18n/workflow-names";
import { en } from "./i18n/en";

export function CreateWorkItem({
  snapshot,
  onClose,
  onCreated,
}: {
  snapshot: ProjectSnapshot;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const slugHintId = useId();
  const [title, setTitle] = useState("");
  const [editedSlug, setEditedSlug] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState(Object.keys(snapshot.workflows)[0] ?? "");
  const [milestone, setMilestone] = useState("");
  const [intent, setIntent] = useState("");
  const [preview, setPreview] = useState<{ input: string; slug: string } | null>(null);
  const [error, setError] = useErrorText();
  const [saving, setSaving] = useState(false);
  let derivedSlug = "";
  try {
    derivedSlug = deriveWorkItemSlug(title);
  } catch {}
  let folderName = editedSlug ?? "";
  let validSlug = false;
  try {
    folderName = deriveWorkItemSlug(title, editedSlug ?? undefined);
    validSlug = true;
  } catch {}
  const input = JSON.stringify({
    title,
    workflow,
    milestone: milestone || null,
    intent,
    ...(editedSlug === null ? {} : { slug: editedSlug }),
  });
  const slug = validSlug && preview?.input === input ? preview.slug : null;

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
    if (!JSON.parse(input).title.trim() || (editedSlug !== null && !validSlug)) return;
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
        const result = await readResponseJson(response);
        if (!response.ok) throw new CoreTextError(result, en.planning.create.errors.preview);
        if (typeof result.slug !== "string" || !result.slug)
          throw new Error(en.planning.create.errors.invalidPreview);
        if (!disposed) setPreview({ input, slug: result.slug });
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause : en.planning.create.errors.preview);
      }
    }, 150);
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [input, validSlug, editedSlug, setError]);

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
      const result = await readResponseJson(response);
      if (!response.ok) throw new CoreTextError(result, en.planning.create.errors.save);
      onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause : en.planning.create.errors.save);
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
      <h2 id={titleId}>{t.planning.create.title}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <fieldset disabled={saving}>
          <label>
            {t.planning.create.titleLabel}
            <input required value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            {t.slugInput.label}
            <input
              required
              value={folderName}
              aria-describedby={derivedSlug ? undefined : slugHintId}
              aria-invalid={editedSlug !== null && !validSlug ? true : undefined}
              onChange={(event) => setEditedSlug(event.target.value)}
            />
          </label>
          {!derivedSlug && (
            <p id={slugHintId} className="muted">
              {t.slugInput.hint}
            </p>
          )}
          <label>
            {t.planning.create.workflow}
            <select value={workflow} onChange={(event) => setWorkflow(event.target.value)}>
              {Object.values(snapshot.workflows).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {workflowName(entry, t)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.planning.create.milestone}
            <select value={milestone} onChange={(event) => setMilestone(event.target.value)}>
              <option value="">{t.planning.create.noMilestone}</option>
              {snapshot.milestones.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.planning.create.intent}
            <textarea rows={4} value={intent} onChange={(event) => setIntent(event.target.value)} />
          </label>
          <p role="status">
            {slug ? (
              <>
                {t.planning.create.folder} <code>.scratch/{slug}/</code>
              </>
            ) : !validSlug && title.trim() ? (
              editedSlug ? (
                t.slugInput.invalid
              ) : (
                t.planning.create.unavailable
              )
            ) : error ? (
              t.planning.create.unavailable
            ) : title.trim() ? (
              t.planning.create.checking
            ) : (
              t.planning.create.enterTitle
            )}
          </p>
          {error && (
            <p role="alert" className="warning">
              {error}
            </p>
          )}
          <p className="muted">{t.planning.create.description}</p>
          <footer>
            <button type="button" className="top-button" onClick={onClose}>
              {t.planning.create.cancel}
            </button>
            <button type="submit" className="top-button" disabled={!slug}>
              {saving ? t.planning.create.saving : t.planning.create.title}
            </button>
          </footer>
        </fieldset>
      </form>
    </dialog>
  );
}
