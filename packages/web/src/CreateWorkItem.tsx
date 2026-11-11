// SPDX-License-Identifier: Apache-2.0

import { deriveWorkItemSlug, type ProjectSnapshot } from "@stintwork/core";
import { FileText } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { en } from "./i18n/en";
import { CoreTextError, readResponseJson, useErrorText, useLanguage } from "./i18n/language";
import { workflowName } from "./i18n/workflow-names";
import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogTitle } from "./ui/Dialog";
import { Item, ItemContent, ItemMedia } from "./ui/Item";
import { SelectField } from "./ui/SelectField";

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
  const slugHintId = useId();
  const selectId = useId();
  const [title, setTitle] = useState("");
  const [editedSlug, setEditedSlug] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState(Object.keys(snapshot.workflows)[0] ?? "");
  const [milestone, setMilestone] = useState("");
  const [intent, setIntent] = useState("");
  const [preview, setPreview] = useState<{ input: string; slug: string } | null>(null);
  const [error, setError] = useErrorText();
  const [errorField, setErrorField] = useState<"title" | "slug" | "form">("form");
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
    setPreview(null);
    setErrorField("slug");
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
        if (!disposed) {
          const message = cause instanceof Error ? cause.message : "";
          setErrorField(
            message === "Title must produce a valid ASCII work item slug."
              ? "title"
              : /Work item .+ already exists/.test(message)
                ? "slug"
                : "form",
          );
          setError(cause instanceof Error ? cause : en.planning.create.errors.preview);
        }
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
    setErrorField("form");
    setError("");
    try {
      const response = await fetch("/api/work-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: input,
      });
      const result = await readResponseJson(response);
      if (!response.ok) throw new CoreTextError(result, en.planning.create.errors.save);
      toast.success(t.actionToast.created);
      onCreated();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setErrorField(
        message === "Title must produce a valid ASCII work item slug."
          ? "title"
          : /Work item .+ already exists/.test(message)
            ? "slug"
            : "form",
      );
      toast.error(t.actionToast.failed);
      setError(cause instanceof Error ? cause : en.planning.create.errors.save);
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
        className="create-work-item [&_label]:grid [&_label]:gap-1 [&_label]:text-sm [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-border [&_input]:bg-card [&_input]:p-2 [&_textarea]:w-full [&_textarea]:rounded-xl [&_textarea]:border [&_textarea]:border-border [&_textarea]:bg-card [&_textarea]:p-2"
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (saving) event.preventDefault();
        }}
      >
        <DialogTitle className="text-xl font-medium">{t.planning.create.title}</DialogTitle>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <fieldset disabled={saving} className="mt-5 grid min-w-0 gap-4">
            <label>
              {t.planning.create.titleLabel}
              <input required value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            {error && errorField === "title" && (
              <p role="alert" className="warning text-attention-foreground">
                {Object.entries(en.planning.create.errors).reduce(
                  (message, [key, original]) =>
                    message === original
                      ? t.planning.create.errors[key as keyof typeof en.planning.create.errors]
                      : message,
                  error,
                )}
              </p>
            )}
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
            {error && errorField === "slug" && (
              <p role="alert" className="warning text-attention-foreground">
                {Object.entries(en.planning.create.errors).reduce(
                  (message, [key, original]) =>
                    message === original
                      ? t.planning.create.errors[key as keyof typeof en.planning.create.errors]
                      : message,
                  error,
                )}
              </p>
            )}
            {!validSlug && title.trim() && editedSlug !== null && (
              <p role="status" className="text-attention-foreground">
                {t.slugInput.invalid}
              </p>
            )}
            {!derivedSlug && (
              <p id={slugHintId} className="muted text-muted-foreground">
                {t.slugInput.hint}
              </p>
            )}
            <label htmlFor={`${selectId}-workflow`}>
              {t.planning.create.workflow}
              <SelectField
                id={`${selectId}-workflow`}
                aria-label={t.planning.create.workflow}
                value={workflow}
                onValueChange={setWorkflow}
                disabled={saving}
                options={Object.values(snapshot.workflows).map((entry) => ({
                  value: entry.id,
                  label: workflowName(entry, t),
                }))}
              />
            </label>
            <label htmlFor={`${selectId}-milestone`}>
              {t.planning.create.milestone}
              <SelectField
                id={`${selectId}-milestone`}
                aria-label={t.planning.create.milestone}
                value={milestone}
                onValueChange={setMilestone}
                disabled={saving}
                options={[
                  { value: "", label: t.planning.create.noMilestone },
                  ...snapshot.milestones.map((entry) => ({ value: entry.id, label: entry.name })),
                ]}
              />
            </label>
            <label>
              {t.planning.create.intent}
              <textarea
                rows={4}
                value={intent}
                onChange={(event) => setIntent(event.target.value)}
              />
            </label>
            <div role="status">
              {slug ? (
                <>
                  {t.planning.create.folder} <code>.scratch/{slug}/</code>
                  {[
                    `.scratch/${slug}/workflow.yaml`,
                    ...(milestone ? [".stintwork/roadmap.md"] : []),
                  ].map((path) => (
                    <Item key={path} size="sm">
                      <ItemMedia>
                        <FileText aria-hidden="true" className="size-4" />
                      </ItemMedia>
                      <ItemContent>
                        <code className="break-all">{path}</code>
                      </ItemContent>
                    </Item>
                  ))}
                </>
              ) : !validSlug && title.trim() ? (
                editedSlug ? null : (
                  t.planning.create.unavailable
                )
              ) : error ? (
                t.planning.create.unavailable
              ) : title.trim() ? (
                t.planning.create.checking
              ) : (
                t.planning.create.enterTitle
              )}
            </div>
            {error && errorField === "form" && (
              <p role="alert" className="warning text-attention-foreground">
                {Object.entries(en.planning.create.errors).reduce(
                  (message, [key, original]) =>
                    message === original
                      ? t.planning.create.errors[key as keyof typeof en.planning.create.errors]
                      : message,
                  error,
                )}
              </p>
            )}
            <p className="muted text-muted-foreground">{t.planning.create.description}</p>
            <footer className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-border bg-card py-4">
              <Button onClick={onClose}>{t.planning.create.cancel}</Button>
              <Button variant="primary" type="submit" disabled={!slug}>
                {saving ? t.planning.create.saving : t.planning.create.title}
              </Button>
            </footer>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
