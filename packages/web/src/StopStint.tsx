// SPDX-License-Identifier: Apache-2.0

import { Square } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CoreTextError, readResponseJson, useErrorText, useLanguage } from "./i18n/language";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader } from "./ui/Card";
import { IconChip } from "./ui/IconChip";

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
      toast.success(t.actionToast.stintStopped);
    } catch (cause) {
      toast.error(t.actionToast.failed);
      setError(cause instanceof Error ? cause : t.stints.stopFailed);
      setRequested(false);
    }
  }

  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center gap-3">
        <IconChip icon={Square} tone="attention" />
        <strong>{t.stints.stopStint}</strong>
      </CardHeader>
      <CardContent>
        <Button variant="primary" type="button" onClick={stop} disabled={requested}>
          {requested ? t.stints.stopping : recovering ? t.stints.stopStint : t.stints.stop}
        </Button>
        {error && (
          <p role="alert" className="warning text-attention-foreground">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
