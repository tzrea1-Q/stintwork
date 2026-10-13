// SPDX-License-Identifier: Apache-2.0
import { Markdown } from "./ui/Markdown";
import { Button } from "./ui/Button";
import { readResponseJson, CoreTextError, useLanguage } from "./i18n/language";
import type { HandoffUnresolvedAttentionItem } from "@stintwork/core";
import { useId, useState } from "react";

export function HandoffAnswer({
  item,
  onError,
}: {
  item: HandoffUnresolvedAttentionItem;
  onError: (reason: string | Error) => void;
}) {
  const { t } = useLanguage();
  const noteId = useId();
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function answer(text: string | null) {
    setSending(true);
    onError("");
    try {
      const response = await fetch(
        `/api/stints/${encodeURIComponent(item.stintId)}/handoff-answer`,
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
    } catch (cause) {
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
      <Markdown>{item.details}</Markdown>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (note.trim() && !sending && !submitted) void answer(note.trim());
        }}
      >
        <label htmlFor={noteId}>{t.needsYou.developerNote}</label>
        <textarea
          id={noteId}
          value={note}
          disabled={sending || submitted}
          onChange={(event) => setNote(event.target.value)}
        />
        <p className="muted text-muted">{t.needsYou.noteHelp}</p>
        <div className="stint-permission-actions flex flex-wrap gap-2 [&_span]:text-xs">
          <Button variant="primary" type="submit" disabled={!note.trim() || sending || submitted}>
            {t.needsYou.saveNote}
          </Button>
          <Button type="button" disabled={sending || submitted} onClick={() => void answer(null)}>
            {t.needsYou.dismiss}
          </Button>
        </div>
      </form>
      {submitted && <p role="status">{t.needsYou.handoffAnswered}</p>}
    </>
  );
}
