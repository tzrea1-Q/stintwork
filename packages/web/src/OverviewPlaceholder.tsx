// SPDX-License-Identifier: Apache-2.0
import { useLanguage } from "./i18n/language";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/Empty";

export function OverviewPlaceholder({ onPipeline }: { onPipeline: () => void }) {
  const { t } = useLanguage();
  return (
    <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6">
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
