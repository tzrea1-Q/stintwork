import type { HandoffUnresolvedAttentionItem } from "@stintwork/core";
import { useId, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./handoff-answer.css";

export function HandoffAnswer({
  item,
  onError,
}: {
  item: HandoffUnresolvedAttentionItem;
  onError: (reason: string) => void;
}) {
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
        throw new Error(
          typeof body.reason === "string" ? body.reason : "Could not answer handoff.",
        );
      }
      setSubmitted(true);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not answer handoff.");
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
        <label htmlFor={noteId}>Developer note</label>
        <textarea
          id={noteId}
          value={note}
          disabled={sending || submitted}
          onChange={(event) => setNote(event.target.value)}
        />
        <p className="muted">
          Included in the next brief for this work item, then consumed when that stint starts.
        </p>
        <div className="stint-permission-actions">
          <button type="submit" disabled={!note.trim() || sending || submitted}>
            Save developer note
          </button>
          <button type="button" disabled={sending || submitted} onClick={() => void answer(null)}>
            Dismiss
          </button>
        </div>
      </form>
      {submitted && <p role="status">Handoff answered.</p>}
    </>
  );
}
