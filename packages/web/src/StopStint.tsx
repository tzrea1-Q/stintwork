// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { CoreTextError, readResponseJson, useErrorText, useLanguage } from "./i18n/language";
import { Button } from "./ui/Button";

export function StopStint({
  stintId,
  recovering = false,
}: {
  stintId: string;
  recovering?: boolean;
}) {
  const { t } = useLanguage();
  const [requested, setRequested] = useState(false);
  const [error, setError] = useErrorText();

  async function stop() {
    setRequested(true);
    setError("");
    try {
      const response = await fetch(`/api/stints/${encodeURIComponent(stintId)}/stop`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = await readResponseJson(response);
        throw new CoreTextError(body, t.stints.stopFailed);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause : t.stints.stopFailed);
      setRequested(false);
    }
  }

  return (
    <div>
      <Button type="button" onClick={stop} disabled={requested}>
        {requested ? t.stints.stopping : recovering ? t.stints.stopStint : t.stints.stop}
      </Button>
      {error && (
        <p role="alert" className="warning text-attention-foreground">
          {error}
        </p>
      )}
    </div>
  );
}
