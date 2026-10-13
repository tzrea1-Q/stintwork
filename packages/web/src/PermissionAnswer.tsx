// SPDX-License-Identifier: Apache-2.0
import { readResponseJson, CoreTextError, useErrorText, useLanguage } from "./i18n/language";
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
  onError?: (reason: string | Error) => void;
}) {
  const { t } = useLanguage();
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useErrorText();

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
        const body = await readResponseJson(response);
        throw new CoreTextError(body, t.needsYou.permissionFailed);
      }
      setSubmitted(true);
    } catch (cause) {
      const reason =
        cause instanceof CoreTextError && cause.reasonMessage !== undefined
          ? cause
          : cause instanceof Error
            ? cause.message
            : t.needsYou.permissionFailed;
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
        <p className="warning">{t.needsYou.declineEndsTurn(profile.displayName)}</p>
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
                ? t.needsYou.allowOnce
                : option.kind === "allow_always"
                  ? t.needsYou.allowAlways
                  : t.needsYou.deny}
            </strong>
            <span>{option.name}</span>
          </button>
        ))}
      </div>
      {submitted && <p role="status">{t.needsYou.answerSent}</p>}
      {error && (
        <p role="alert" className="warning">
          {error}
        </p>
      )}
    </>
  );
}
