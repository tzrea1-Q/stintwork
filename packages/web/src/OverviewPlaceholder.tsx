// SPDX-License-Identifier: Apache-2.0
import { useLanguage } from "./i18n/language";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import type { Connection } from "./useProjectSnapshot";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/Empty";

export function OverviewPlaceholder({
  onPipeline,
  connection,
  error,
}: {
  onPipeline: () => void;
  connection: Connection;
  error?: string;
}) {
  const { t } = useLanguage();
  return (
    <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6">
      <p role="status" className="mb-4 text-xs text-muted-foreground">
        {connection === "live"
          ? t.board.live
          : connection === "connecting"
            ? t.board.connecting
            : t.board.reconnecting}
      </p>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-attention-soft p-3 text-xs text-attention-foreground"
        >
          {error}
          {t.board.lastAvailable}
        </p>
      )}
      <Card>
        <Empty>
          <EmptyHeader>
            <EmptyTitle role="heading" aria-level={1}>
              {t.viewNavigation.overview}
            </EmptyTitle>
            <EmptyDescription>{t.viewNavigation.description}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="secondary" onClick={onPipeline}>
              {t.viewNavigation.pipeline}
            </Button>
          </EmptyContent>
        </Empty>
      </Card>
    </main>
  );
}
