// SPDX-License-Identifier: Apache-2.0
import { FolderOpen } from "lucide-react";
import { useLanguage } from "../i18n/language";
import { Button } from "../ui/Button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../ui/Empty";
export function EmptyOverview({ github, onCreate }: { github: boolean; onCreate: () => void }) {
  const { t } = useLanguage();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderOpen aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{t.board.empty}</EmptyTitle>
        <EmptyDescription>
          {github ? t.overview.emptyGithub : t.overview.emptyExplanation}
        </EmptyDescription>
      </EmptyHeader>
      {!github && (
        <EmptyContent>
          <Button variant="primary" onClick={onCreate}>
            {t.overview.newItem}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
