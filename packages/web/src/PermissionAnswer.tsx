// SPDX-License-Identifier: Apache-2.0

import type { AgentProfile, StintEvent } from "@stintwork/core";
import { useState } from "react";
import { CoreTextError, readResponseJson, useErrorText, useLanguage } from "./i18n/language";
import { PermissionDetails } from "./PermissionDetails";
import { Button } from "./ui/Button";

type PermissionAnswerProps = {
  stintId: string;
  request: Pick<
    Extract<StintEvent, { type: "permission_request" }>,
    "requestId" | "options" | "details" | "attemptId" | "binding"
  > & { answering?: boolean };
  profile?: AgentProfile;
  onError?: (reason: string | Error) => void;
};

export function PermissionAnswer(props: PermissionAnswerProps) {
  return (
    <PermissionAnswerBinding
      key={JSON.stringify([
        props.stintId,
        props.request.requestId,
        props.request.attemptId,
        props.request.binding,
      ])}
      {...props}
    />
  );
}

function PermissionAnswerBinding({ stintId, request, profile, onError }: PermissionAnswerProps) {
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
          body: JSON.stringify({
            optionId,
            ...(request.attemptId ? { attemptId: request.attemptId } : {}),
          }),
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
      {request.binding && !submitted && (
        <p role="status">
          {request.binding === "reconnecting"
            ? t.needsYou.reconnectingPermission
            : t.needsYou.waitingPermission}
        </p>
      )}
      <PermissionDetails details={request.details} />
      {profile?.capabilities.declineEndsTurn && (
        <p className="warning text-attention-foreground">
          {t.needsYou.declineEndsTurn(profile.displayName)}
        </p>
      )}
      <div className="stint-permission-actions flex flex-wrap gap-2 [&_span]:text-xs">
        {request.options.map((option) => (
          <Button
            type="button"
            variant={option.kind === "allow_once" ? "primary" : "secondary"}
            className="h-auto min-h-8 flex-col items-start whitespace-normal py-2 text-left"
            key={option.optionId}
            disabled={
              request.binding === "reconnecting" || request.answering || sending || submitted
            }
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
          </Button>
        ))}
      </div>
      {submitted && <p role="status">{t.needsYou.answerSent}</p>}
      {error && (
        <p role="alert" className="warning text-attention-foreground">
          {error}
        </p>
      )}
    </>
  );
}
