// SPDX-License-Identifier: Apache-2.0

import { Copy } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "../i18n/language";
import { Button } from "../ui/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";

export function FilePath({ path, compact = false }: { path: string; compact?: boolean }) {
  const { t } = useLanguage();
  const [message, setMessage] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(path);
      setMessage(t.stints.copied);
    } catch {
      setMessage(t.stints.copyPathFailed);
    }
  }

  return (
    <div
      className={
        compact
          ? "file-path flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
          : "file-path mb-4 mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground [&_code]:min-w-0 [&_code]:[overflow-wrap:anywhere]"
      }
    >
      <code
        className={compact ? "min-w-0 flex-1 truncate" : "block max-w-full truncate"}
        data-truncate
        title={path}
      >
        {path}
      </code>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={compact ? "shrink-0" : undefined}
            onClick={copy}
            aria-label={t.stints.copyPath(path)}
          >
            <Copy aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t.stints.copyPath(path)}</TooltipContent>
      </Tooltip>
      <span className="copy-status text-xs" role="status">
        {message}
      </span>
    </div>
  );
}
