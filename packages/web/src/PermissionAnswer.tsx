import type { AgentProfile, StintEvent } from "@stintwork/core";
import { useState } from "react";
import { PermissionDetails } from "./PermissionDetails";

export function PermissionAnswer({
  stintId,
  request,
  profile,
  onError,
}: {
  stintId: string;
  request: Pick<
    Extract<StintEvent, { type: "permission_request" }>,
    "requestId" | "options" | "details"
  >;
  profile?: AgentProfile;
  onError?: (reason: string) => void;
}) {
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function answer(optionId: string) {
    setSending(true);
    setError("");
    onError?.("");
    try {
      const response = await fetch(
        `/api/stints/${encodeURIComponent(stintId)}/permissions/${encodeURIComponent(request.requestId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ optionId }),
        },
      );
      if (!response.ok) {
        const body = await response.json();
        throw new Error(
          typeof body.reason === "string" ? body.reason : "Could not answer permission request.",
        );
      }
      setSubmitted(true);
    } catch (cause) {
      const reason =
        cause instanceof Error ? cause.message : "Could not answer permission request.";
      if (onError) onError(reason);
      else setError(reason);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PermissionDetails details={request.details} />
      {profile?.capabilities.declineEndsTurn && (
        <p className="warning">Declining ends {profile.displayName}’s turn.</p>
      )}
      <div className="stint-permission-actions">
        {request.options.map((option) => (
          <button
            type="button"
            key={option.optionId}
            disabled={sending || submitted}
            onClick={() => void answer(option.optionId)}
          >
            <strong>
              {option.kind === "allow_once"
                ? "Allow once"
                : option.kind === "allow_always"
                  ? "Allow always"
                  : "Deny"}
            </strong>
            <span>{option.name}</span>
          </button>
        ))}
      </div>
      {submitted && <p role="status">Answer sent.</p>}
      {error && (
        <p role="alert" className="warning">
          {error}
        </p>
      )}
    </>
  );
}
