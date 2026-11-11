// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";
import { useLanguage } from "../i18n/language";
import { CodeBlock } from "./CodeBlock";
import { Disclosure } from "./Disclosure";
import { unifiedLineDiff } from "./line-diff";

export function DiffPreview({
  before,
  content,
  open = false,
}: {
  before: string | null;
  content: string;
  open?: boolean;
}) {
  const { t } = useLanguage();
  const hunks = useMemo(() => unifiedLineDiff(before, content), [before, content]);
  return (
    <Disclosure label={t.planning.setup.previewDiff} open={open}>
      {hunks.length ? (
        <CodeBlock className="max-h-64 p-0">
          {hunks.map((hunk) => (
            <code key={hunk.header} className="block min-w-max">
              <span className="block px-3 py-1 text-muted-foreground">
                {hunk.header}
                {"\n"}
              </span>
              {hunk.lines.map((line) => (
                <span key={line.key} className="block">
                  <span
                    data-diff-kind={line.kind}
                    className={`block px-3 ${line.kind === "added" ? "bg-success-soft text-success-foreground" : line.kind === "removed" ? "bg-destructive/10 text-destructive" : ""}`}
                  >
                    {line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "}
                    {line.text}
                    {"\n"}
                  </span>
                  {line.noNewline && (
                    <span className="block px-3 italic text-muted-foreground">
                      {t.review.diff.noNewline}
                      {"\n"}
                    </span>
                  )}
                </span>
              ))}
            </code>
          ))}
        </CodeBlock>
      ) : (
        <p className="text-sm text-muted-foreground">{t.planning.setup.noContentChanges}</p>
      )}
    </Disclosure>
  );
}
