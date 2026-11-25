// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "@stintwork/core";
import { RefreshCw, WifiOff } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { useLanguage } from "./i18n/language";
import { stageName } from "./i18n/workflow-names";
import { overviewData, stintDays } from "./overview-data";
import { ActivityCard } from "./overview/ActivityCard";
import { AttentionCard } from "./overview/AttentionCard";
import { EmptyOverview } from "./overview/EmptyOverview";
import { assignColumns, type CardId } from "./overview/layout";
import { MilestoneCard } from "./overview/MilestoneCard";
import { NextUpCard } from "./overview/NextUpCard";
import { RunningCard } from "./overview/RunningCard";
import { StagesCard } from "./overview/StagesCard";
import type { Connection } from "./useProjectSnapshot";

export function Overview({
  snapshot,
  connection,
  error,
  onOpenItem,
  onNeedsYou,
  onCreate,
  onMilestone,
}: {
  snapshot: ProjectSnapshot;
  connection: Connection;
  error?: string;
  onPipeline: () => void;
  onOpenItem: (slug: string) => void;
  onNeedsYou: () => void;
  onCreate: () => void;
  onMilestone: (id: string) => void;
}) {
  const { t, language } = useLanguage();
  const [now, setNow] = useState(Date.now);
  const [columns, setColumns] = useState<1 | 2 | 3>(1);
  const container = useRef<HTMLElement>(null);
  const data = overviewData(snapshot, new Date(now));
  const days = stintDays(snapshot, new Date(now));
  const weekTotal = days.reduce((sum, day) => sum + day.count, 0);
  const maxDay = Math.max(1, ...days.map((day) => day.count));
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth;
      if (width) setColumns(width >= 1280 ? 3 : width >= 769 ? 2 : 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!data.running.length) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, [data.running.length]);
  useEffect(() => {
    let timer: number;
    const schedule = () => {
      const current = new Date();
      const midnight = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
      timer = window.setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, midnight.getTime() - current.getTime());
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);
  const stageLabel = (item: ProjectSnapshot["workItems"][number], id: string | undefined) => {
    const workflow = snapshot.workflows[item.workflow];
    const stage = workflow?.stages.find((entry) => entry.id === id);
    return workflow && stage ? stageName(workflow, stage, t) : (id ?? "");
  };
  const props = {
    snapshot,
    data,
    t,
    language,
    now,
    days,
    weekTotal,
    maxDay,
    stageLabel,
    onOpenItem,
    onNeedsYou,
    onMilestone,
  };
  const cards = {
    milestone: data.milestones.length > 0 && <MilestoneCard {...props} />,
    stages: data.columns.some(({ count }) => count > 0) && <StagesCard {...props} />,
    next: !!data.next && <NextUpCard {...props} />,
    attention: data.attention.length > 0 && <AttentionCard {...props} />,
    activity: data.activity.length > 0 && <ActivityCard {...props} />,
    running: data.running.length > 0 && <RunningCard {...props} />,
  };
  const available = (Object.keys(cards) as CardId[]).filter((key) => cards[key]);
  const status =
    connection === "live"
      ? t.board.live
      : connection === "connecting"
        ? t.board.connecting
        : t.board.reconnecting;
  return (
    <main ref={container} className="min-w-0 flex-1 overflow-auto pt-5 pb-5">
      <div className="page-width">
        {connection === "live" && !error ? (
          <p role="status" className="sr-only">
            {status}
          </p>
        ) : (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-attention-soft p-3 text-sm text-attention-foreground">
            {connection === "connecting" ? (
              <RefreshCw className="size-icon-sm shrink-0" aria-hidden="true" />
            ) : (
              <WifiOff className="size-icon-sm shrink-0" aria-hidden="true" />
            )}
            <div>
              <p role="status" className={connection === "live" ? "sr-only" : undefined}>
                {status}
              </p>
              {error && (
                <p role="alert">
                  {error}
                  {t.board.lastAvailable}
                </p>
              )}
            </div>
          </div>
        )}
        {!snapshot.workItems.length && (
          <EmptyOverview github={snapshot.setup.tracker === "github-issues"} onCreate={onCreate} />
        )}
        <div className="flex min-w-0 gap-4" data-overview-columns>
          {assignColumns(columns, available).map((column) => (
            <div
              key={column.join("-")}
              className="flex min-w-0 flex-1 flex-col gap-4"
              data-overview-column
            >
              {column.map((card) => (
                <Fragment key={card}>{cards[card]}</Fragment>
              ))}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
