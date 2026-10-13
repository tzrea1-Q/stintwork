// SPDX-License-Identifier: Apache-2.0
import { readResponseJson, CoreTextError, useErrorText, useLanguage } from "./i18n/language";
import { builtInWorkflows } from "@stintwork/core";
import { useEffect, useId, useRef, useState } from "react";
import "./create-work-item.css";
import { workflowName } from "./i18n/workflow-names";
import { en } from "./i18n/en";

export function CustomiseWorkflow({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [preview, setPreview] = useState<{ path: string; yaml: string } | null>(null);
  const [error, setError] = useErrorText();
  const [saving, setSaving] = useState(false);
  const endpoint = `/api/workflows/${encodeURIComponent(id)}/customise`;
  const workflow = builtInWorkflows[id as keyof typeof builtInWorkflows];
  const name = workflow ? workflowName(workflow, t) : id;

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
        const result = await readResponseJson(response);
        if (!response.ok) throw new CoreTextError(result, en.planning.customise.errors.preview);
        if (typeof result.path !== "string" || typeof result.yaml !== "string" || !result.yaml)
          throw new Error(en.planning.customise.errors.invalidPreview);
        if (!disposed) setPreview(result);
      } catch (cause) {
        if (!disposed)
          setError(cause instanceof Error ? cause : en.planning.customise.errors.preview);
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [endpoint, setError]);

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
      const result = await readResponseJson(response);
      if (!response.ok) throw new CoreTextError(result, en.planning.customise.errors.save);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause : en.planning.customise.errors.save);
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
      <h2 id={titleId}>{t.planning.customise.title(name)}</h2>
      <fieldset disabled={saving}>
        {preview ? (
          <>
            <p>
              {t.planning.customise.creates}
              <code>{preview.path}</code>
              {t.planning.customise.description}
            </p>
            <section aria-label={t.planning.customise.yaml}>
              <pre>
                <code>{preview.yaml}</code>
              </pre>
            </section>
            <p className="muted">{t.planning.customise.commit(id)}</p>
          </>
        ) : (
          <p role="status">
            {error ? t.planning.customise.unavailable : t.planning.customise.loading}
          </p>
        )}
        {error && (
          <p role="alert" className="warning">
            {Object.entries(en.planning.customise.errors).reduce(
              (message, [key, original]) =>
                message === original
                  ? t.planning.customise.errors[key as keyof typeof en.planning.customise.errors]
                  : message,
              error,
            )}
          </p>
        )}
        <footer>
          <button type="button" className="top-button" onClick={onClose}>
            {t.planning.customise.cancel}
          </button>
          <button
            type="button"
            className="top-button"
            disabled={!preview}
            onClick={() => void customise()}
          >
            {saving ? t.planning.customise.saving : t.planning.customise.confirm}
          </button>
        </footer>
      </fieldset>
    </dialog>
  );
}
