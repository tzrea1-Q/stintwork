// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import { toast } from "sonner";
import { CoreTextError, readResponseJson, useErrorText, useLanguage } from "./i18n/language";
import { Button } from "./ui/Button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./ui/Dialog";

export function MarkShipped({ slug, head }: { slug: string; head?: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [commit, setCommit] = useState(head ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useErrorText();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/work-items/${encodeURIComponent(slug)}/mark-shipped`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commit }),
      });
      const result = await readResponseJson(response);
      if (!response.ok) throw new CoreTextError(result, t.markShipped.error);
      setOpen(false);
      toast.success(t.markShipped.success);
    } catch (cause) {
      setError(cause instanceof Error ? cause : t.markShipped.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setOpen(next);
          if (next) {
            setCommit(head ?? "");
            setError("");
          }
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          {t.markShipped.mark}
        </Button>
      </DialogTrigger>
      <DialogContent className="[&_label]:grid [&_label]:gap-1 [&_label]:text-sm [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-border [&_input]:bg-card [&_input]:p-2">
        <DialogTitle className="text-xl font-medium">{t.markShipped.mark}</DialogTitle>
        <DialogDescription className="text-muted-foreground">
          {t.markShipped.explanation}
        </DialogDescription>
        <form onSubmit={submit} className="mt-4 grid gap-3">
          <label>
            {t.markShipped.commit}
            <input
              className="min-w-0 font-mono"
              value={commit}
              onChange={(event) => setCommit(event.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="warning text-attention-foreground">
              {error}
            </p>
          )}
          <footer className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-border bg-card py-4">
            <DialogClose asChild>
              <Button variant="secondary" type="button" disabled={busy}>
                {t.markShipped.cancel}
              </Button>
            </DialogClose>
            <Button variant="primary" type="submit" disabled={busy}>
              {t.markShipped.confirm}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
