// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "@stintwork/core";
import { ArrowRight, CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useLanguage } from "./i18n/language";
import { stageName } from "./i18n/workflow-names";
import { overviewData } from "./overview-data";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "./ui/Empty";
import { Progress } from "./ui/Progress";
import { SegmentedProgress } from "./ui/SegmentedProgress";
import { Item, ItemContent, ItemMedia } from "./ui/Item";
import { IconChip } from "./ui/IconChip";
import { AgentAvatar } from "./ui/AgentAvatar";
import { StatusChip } from "./ui/StatusChip";
import type { Connection } from "./useProjectSnapshot";
import { attentionStageName, attentionTitle } from "./useAttentionAlerts";

export function Overview({
  snapshot,
  connection,
  error,
  onPipeline,
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
  const data = overviewData(snapshot);
  const [now, setNow] = useState(Date.now);
  const shippedMilestones = data.milestones.filter(
    ({ milestone }) => milestone.status === "shipped",
  );
  useEffect(() => {
    if (!data.running.length) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, [data.running.length]);
  const stageLabel = (item: ProjectSnapshot["workItems"][number], id: string | undefined) => {
    const workflow = snapshot.workflows[item.workflow];
    const stage = workflow?.stages.find((entry) => entry.id === id);
    return workflow && stage ? stageName(workflow, stage, t) : (id ?? "");
  };
  const itemRow = (
    item: ProjectSnapshot["workItems"][number],
    detail: React.ReactNode,
    icon: React.ReactNode,
  ) => (
    <Item asChild key={item.slug}>
      <button
        type="button"
        className="text-left hover:bg-muted"
        onClick={() => onOpenItem(item.slug)}
      >
        <ItemMedia>{icon}</ItemMedia>
        <ItemContent className="min-w-0">
          <span className="truncate font-medium" data-truncate title={item.title}>
            {item.title}
          </span>
          <span className="truncate text-xs text-muted-foreground">{detail}</span>
        </ItemContent>
        <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
      </button>
    </Item>
  );
  return (
    <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6">
      <header className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-medium tracking-tight">{t.viewNavigation.overview}</h1>
          <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              aria-hidden="true"
              className={`size-1 rounded-full ${connection === "live" ? "bg-success" : "bg-attention"}`}
            />
            {connection === "live"
              ? t.board.live
              : connection === "connecting"
                ? t.board.connecting
                : t.board.reconnecting}
          </p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t.overview.description}</p>
      </header>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-attention-soft p-3 text-xs text-attention-foreground"
        >
          {error}
          {t.board.lastAvailable}
        </p>
      )}
      <div className="grid min-w-0 items-start grid-cols-1 gap-4 min-[769px]:grid-cols-2 min-[1280px]:grid-cols-12">
        {!snapshot.workItems.length && (
          <Card className="min-[769px]:col-span-2 min-[1280px]:col-span-12">
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t.board.empty}</EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                {snapshot.setup.tracker !== "github-issues" && (
                  <Button variant="primary" onClick={onCreate}>
                    {t.overview.newItem}
                  </Button>
                )}
                <Button onClick={onPipeline}>{t.viewNavigation.pipeline}</Button>
              </EmptyContent>
            </Empty>
          </Card>
        )}
        {data.next && (
          <Card className="min-w-0 min-[769px]:col-span-2 min-[1280px]:col-span-8">
            <CardHeader>
              <CardTitle>{t.overview.next}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <IconChip icon={ArrowRight} tone="accent" />
                <div className="min-w-0">
                  <h2
                    className="truncate text-xl font-medium"
                    data-truncate
                    title={data.next.title}
                  >
                    {data.next.title}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {data.next.slug} · {stageLabel(data.next, data.next.stage)}
                    {data.next.milestone &&
                      snapshot.milestones.find(
                        (milestone) => milestone.id === data.next?.milestone,
                      ) && (
                        <>
                          {" "}
                          ·{" "}
                          {
                            snapshot.milestones.find(
                              (milestone) => milestone.id === data.next?.milestone,
                            )?.name
                          }
                        </>
                      )}
                  </p>
                </div>
              </div>
              {data.next.tickets.length > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between gap-4 text-sm">
                    <span>{t.overview.tickets}</span>
                    <span className="tabular-nums">
                      {data.next.tickets.filter((ticket) => ticket.resolved).length}/
                      {data.next.tickets.length}
                    </span>
                  </div>
                  <SegmentedProgress
                    value={data.next.tickets.filter((ticket) => ticket.resolved).length}
                    total={data.next.tickets.length}
                    label={t.overview.tickets}
                  />
                </div>
              )}
              <Button
                variant="primary"
                onClick={() => {
                  if (data.next) onOpenItem(data.next.slug);
                }}
              >
                {t.overview.open}
              </Button>
            </CardContent>
          </Card>
        )}
        {(data.attention.length > 0 || data.running.length > 0) && (
          <div className="grid min-w-0 gap-4 min-[769px]:col-span-2 min-[769px]:grid-cols-2 min-[1280px]:col-span-4 min-[1280px]:grid-cols-1">
            {data.attention.length > 0 && (
              <Card className="min-w-0 min-[1280px]:col-span-4">
                <CardHeader>
                  <CardTitle>{t.topBar.needsYou}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.attention.map((item) => {
                    const name =
                      snapshot.agents.find((agent) => agent.id === item.agent)?.displayName ??
                      item.agent ??
                      "";
                    const title = attentionTitle(
                      item,
                      t,
                      language,
                      name,
                      attentionStageName(item, snapshot, t),
                    );
                    return (
                      <Item asChild key={item.id}>
                        <button
                          type="button"
                          className="text-left hover:bg-muted"
                          onClick={onNeedsYou}
                        >
                          <ItemMedia>
                            <IconChip icon={CircleAlert} tone="attention" />
                          </ItemMedia>
                          <ItemContent className="min-w-0">
                            <span className="truncate" data-truncate title={title}>
                              {title}
                            </span>
                          </ItemContent>
                        </button>
                      </Item>
                    );
                  })}
                  <Button onClick={onNeedsYou}>{t.overview.openQueue}</Button>
                </CardContent>
              </Card>
            )}
            {data.running.length > 0 && (
              <Card className="min-w-0 min-[1280px]:col-span-4">
                <CardHeader>
                  <CardTitle>{t.overview.running}</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.running.map((item) => {
                    const stint = item.activeStint;
                    if (!stint) return null;
                    const name =
                      snapshot.agents.find((agent) => agent.id === stint.agent)?.displayName ??
                      stint.agent;
                    return itemRow(
                      item,
                      <>
                        {name} · {stageLabel(item, stint.stage)}{" "}
                        {stint.startedAt && Number.isFinite(Date.parse(stint.startedAt)) && (
                          <>
                            · {Math.max(0, Math.floor((now - Date.parse(stint.startedAt)) / 60000))}{" "}
                            {t.overview.elapsed}
                          </>
                        )}
                      </>,
                      <AgentAvatar agent={stint.agent} name={name} active />,
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>
        )}
        {data.milestones.length > 0 && (
          <Card className="min-w-0 min-[1280px]:col-span-7">
            <CardHeader>
              <CardTitle>{t.overview.milestones}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.milestones
                .filter(({ milestone }) => milestone.status !== "shipped")
                .map(({ milestone, resolved, total }) => (
                  <div key={milestone.id} className="py-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
                        data-truncate
                        title={milestone.name}
                        onClick={() => onMilestone(milestone.id)}
                      >
                        {milestone.name}
                      </button>
                      <StatusChip status={milestone.status === "active" ? "running" : "stopped"}>
                        {t.planning.roadmap[milestone.status]}
                      </StatusChip>
                      <span className="text-right text-sm tabular-nums">
                        {resolved}/{total}
                      </span>
                    </div>
                    {total > 0 && (
                      <Progress
                        className="mt-1"
                        value={resolved}
                        max={total}
                        aria-label={milestone.name}
                      />
                    )}
                  </div>
                ))}
              {shippedMilestones.length > 0 && (
                <details className="py-2">
                  <summary className="cursor-pointer text-sm font-medium">
                    {shippedMilestones.length}{" "}
                    {shippedMilestones.length === 1
                      ? t.overview.shippedMilestone
                      : t.overview.shippedMilestones}
                  </summary>
                  <div className="mt-2 space-y-1">
                    {shippedMilestones.map(({ milestone, resolved, total }) => (
                      <div key={milestone.id} className="flex items-center gap-2 py-1">
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left hover:underline"
                          data-truncate
                          title={milestone.name}
                          onClick={() => onMilestone(milestone.id)}
                        >
                          {milestone.name}
                        </button>
                        <StatusChip status="success">{t.planning.roadmap.shipped}</StatusChip>
                        <span className="text-right text-sm tabular-nums">
                          {resolved}/{total}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        )}
        {data.columns.length > 0 && (
          <Card className="min-w-0 min-[1280px]:col-span-5">
            <CardHeader>
              <CardTitle>{t.overview.stages}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.columns.map(({ column, count }) => (
                <div key={column} className="flex items-center gap-3">
                  <span className="w-24 shrink-0">{t.workflows.feature.stages[column]}</span>
                  <Progress
                    value={count}
                    max={data.columns.reduce((sum, entry) => sum + entry.count, 0)}
                    aria-label={t.workflows.feature.stages[column]}
                  />
                  <span className="tabular-nums">{count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        {data.activity.length > 0 && (
          <Card className="min-w-0 min-[769px]:col-span-2 min-[1280px]:col-span-12">
            <CardHeader>
              <CardTitle>{t.overview.activity}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.activity.map(({ item, stint, at }) => (
                <Item asChild key={`${item.slug}-${stint.id}`}>
                  <button
                    type="button"
                    className="text-left hover:bg-muted"
                    onClick={() => onOpenItem(item.slug)}
                  >
                    <ItemMedia>
                      <AgentAvatar
                        agent={stint.agent}
                        name={
                          snapshot.agents.find((agent) => agent.id === stint.agent)?.displayName ??
                          stint.agent
                        }
                      />
                    </ItemMedia>
                    <ItemContent className="min-w-0">
                      <span className="truncate font-medium" data-truncate title={item.title}>
                        {item.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {stageLabel(item, stint.stage)} ·{" "}
                        <time dateTime={at}>{new Date(at).toLocaleString(language)}</time>
                      </span>
                    </ItemContent>
                    <StatusChip
                      status={
                        stint.status === "running"
                          ? "running"
                          : stint.status === "finished"
                            ? "success"
                            : "stopped"
                      }
                    >
                      {t.overview.stintStatus[stint.status]}
                    </StatusChip>
                  </button>
                </Item>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
