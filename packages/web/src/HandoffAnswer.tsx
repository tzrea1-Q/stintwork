// SPDX-License-Identifier: Apache-2.0
import type { HandoffUnresolvedAttentionItem } from "@stintwork/core";
import { useId, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useLanguage } from "./i18n/language";
import "./handoff-answer.css";

export function HandoffAnswer({
  item,
  onError,
}: {
  item: HandoffUnresolvedAttentionItem;
  onError: (reason: string) => void;
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
        const body = await response.json();
        throw new Error(typeof body.reason === "string" ? body.reason : t.needsYou.handoffFailed);
      }
      setSubmitted(true);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : t.needsYou.handoffFailed);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
          {item.details}
        </ReactMarkdown>
      </div>
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
        <p className="muted">{t.needsYou.noteHelp}</p>
        <div className="stint-permission-actions">
          <button type="submit" disabled={!note.trim() || sending || submitted}>
            {t.needsYou.saveNote}
          </button>
          <button type="button" disabled={sending || submitted} onClick={() => void answer(null)}>
            {t.needsYou.dismiss}
          </button>
        </div>
      </form>
      {submitted && <p role="status">{t.needsYou.handoffAnswered}</p>}
    </>
  );
}
