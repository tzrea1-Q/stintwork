// SPDX-License-Identifier: Apache-2.0

import type { HandoffUnresolvedAttentionItem } from "@stintwork/core";
import { useId, useRef, useState } from "react";
import { CoreTextError, readResponseJson, useLanguage } from "./i18n/language";
import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/Dialog";
import { Markdown } from "./ui/Markdown";

export function HandoffAnswer({
  item,
  onError,
  showDetails = true,
}: {
  item: HandoffUnresolvedAttentionItem;
  showDetails?: boolean;
  onError: (reason: string | Error) => void;
}) {
  const { t } = useLanguage();
  const noteId = useId();
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLParagraphElement>(null);

  async function answer(text: string | null, resolve = false) {
    setSending(true);
    onError("");
    try {
      const response = await fetch(
        `/api/stints/${encodeURIComponent(item.stintId)}/${resolve ? "resolve-handoff" : "handoff-answer"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: text }),
        },
      );
      if (!response.ok) {
        const body = await readResponseJson(response);
        throw new CoreTextError(body, t.needsYou.handoffFailed);
      }
      setSubmitted(true);
      setConfirming(false);
    } catch (cause) {
      setConfirming(false);
      onError(
        cause instanceof CoreTextError && cause.reasonMessage !== undefined
          ? cause
          : cause instanceof Error
            ? cause.message
            : t.needsYou.handoffFailed,
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {showDetails && <Markdown>{item.details}</Markdown>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (note.trim() && !sending && !submitted) void answer(note);
        }}
      >
        <label htmlFor={noteId}>{t.needsYou.developerNote}</label>
        <textarea
          id={noteId}
          value={note}
          disabled={sending || submitted}
          onChange={(event) => setNote(event.target.value)}
        />
        <p className="muted text-muted-foreground">{t.needsYou.noteHelp}</p>
        <div className="stint-permission-actions flex flex-wrap gap-2 [&_span]:text-xs">
          <Button variant="primary" type="submit" disabled={!note.trim() || sending || submitted}>
            {t.needsYou.saveNote}
          </Button>
          <Button
            type="button"
            ref={trigger}
            variant="danger"
            disabled={sending || submitted}
            onClick={() => setConfirming(true)}
          >
            {t.needsYou.markResolved}
          </Button>
          <Button type="button" disabled={sending || submitted} onClick={() => void answer(null)}>
            {t.needsYou.dismiss}
          </Button>
        </div>
      </form>
      <Dialog open={confirming} onOpenChange={(open) => !sending && setConfirming(open)}>
        <DialogContent
          returnFocusRef={trigger}
          onCloseAutoFocus={(event) => {
            if (status.current) {
              event.preventDefault();
              status.current.focus();
            }
          }}
          onEscapeKeyDown={(event) => sending && event.preventDefault()}
          onPointerDownOutside={(event) => sending && event.preventDefault()}
        >
          <DialogTitle className="text-lg font-medium">{t.needsYou.confirmResolve}</DialogTitle>
          <DialogDescription className="my-3">{t.needsYou.resolveWarning}</DialogDescription>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={sending} onClick={() => setConfirming(false)}>
              {t.needsYou.cancelResolve}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={sending}
              onClick={() => void answer(null, true)}
            >
              {t.needsYou.confirmResolve}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {submitted && (
        <p ref={status} tabIndex={-1} role="status">
          {t.needsYou.handoffAnswered}
        </p>
      )}
    </>
  );
}
