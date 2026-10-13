// SPDX-License-Identifier: Apache-2.0
import { CodeBlock } from "./ui/CodeBlock";
import { readResponseJson, CoreTextError, useErrorText, useLanguage } from "./i18n/language";
import { builtInWorkflows } from "@stintwork/core";
import { useEffect, useState } from "react";
import { workflowName } from "./i18n/workflow-names";
import { en } from "./i18n/en";
import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogTitle } from "./ui/Dialog";

export function CustomiseWorkflow({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useLanguage();
  const [preview, setPreview] = useState<{ path: string; yaml: string } | null>(null);
  const [error, setError] = useErrorText();
  const [saving, setSaving] = useState(false);
  const endpoint = `/api/workflows/${encodeURIComponent(id)}/customise`;
  const workflow = builtInWorkflows[id as keyof typeof builtInWorkflows];
  const name = workflow ? workflowName(workflow, t) : id;

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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="customise-workflow"
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (saving) event.preventDefault();
        }}
      >
        <DialogTitle className="text-xl font-medium">
          {t.planning.customise.title(name)}
        </DialogTitle>
        <fieldset disabled={saving} className="mt-5 grid min-w-0 gap-4">
          {preview ? (
            <>
              <p>
                {t.planning.customise.creates}
                <code>{preview.path}</code>
                {t.planning.customise.description}
              </p>
              <section aria-label={t.planning.customise.yaml} className="min-w-0">
                <CodeBlock className="max-h-[50dvh] overflow-auto rounded-sm border border-border p-3 text-sm focus-visible:outline-accent">
                  <code>{preview.yaml}</code>
                </CodeBlock>
              </section>
              <p className="muted text-muted">{t.planning.customise.commit(id)}</p>
            </>
          ) : (
            <p role="status">
              {error ? t.planning.customise.unavailable : t.planning.customise.loading}
            </p>
          )}
          {error && (
            <p role="alert" className="warning text-warning">
              {Object.entries(en.planning.customise.errors).reduce(
                (message, [key, original]) =>
                  message === original
                    ? t.planning.customise.errors[key as keyof typeof en.planning.customise.errors]
                    : message,
                error,
              )}
            </p>
          )}
          <footer className="flex flex-wrap justify-end gap-3">
            <Button onClick={onClose}>{t.planning.customise.cancel}</Button>
            <Button variant="primary" disabled={!preview} onClick={() => void customise()}>
              {saving ? t.planning.customise.saving : t.planning.customise.confirm}
            </Button>
          </footer>
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}
