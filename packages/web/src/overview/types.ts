// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "@stintwork/core";
import type { overviewData, stintDays } from "../overview-data";
import type { useLanguage } from "../i18n/language";
export type CardProps = {
  snapshot: ProjectSnapshot;
  data: ReturnType<typeof overviewData>;
  t: ReturnType<typeof useLanguage>["t"];
  language: ReturnType<typeof useLanguage>["language"];
  now: number;
  days: ReturnType<typeof stintDays>;
  weekTotal: number;
  maxDay: number;
  stageLabel: (item: ProjectSnapshot["workItems"][number], id: string | undefined) => string;
  onOpenItem: (slug: string) => void;
  onNeedsYou: (id?: string) => void;
  onMilestone: (id: string) => void;
};
