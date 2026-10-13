// SPDX-License-Identifier: Apache-2.0
import { readResponseJson, CoreTextError, useErrorText, useLanguage } from "./i18n/language";
import { useState } from "react";

export function StopStint({ stintId }: { stintId: string }) {
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
      <button type="button" className="action" onClick={stop} disabled={requested}>
        {requested ? t.stints.stopping : t.stints.stop}
      </button>
      {error && (
        <p role="alert" className="warning">
          {error}
        </p>
      )}
    </div>
  );
}
