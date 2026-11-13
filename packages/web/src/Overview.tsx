// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "@stintwork/core";
import { ArrowRight, CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useLanguage } from "./i18n/language";
import { stageName } from "./i18n/workflow-names";
import { milestonePercent, overviewData, stintDays, ticketsUnavailable } from "./overview-data";
import { AgentAvatar } from "./ui/AgentAvatar";
import { Button } from "./ui/Button";
import { Card, CardAction, CardContent, CardHeader, CardTitle, Eyebrow } from "./ui/Card";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "./ui/Empty";
import { IconChip } from "./ui/IconChip";
import { Item, ItemContent, ItemMedia } from "./ui/Item";
import { PageHeader } from "./ui/PageHeader";
import { Progress } from "./ui/Progress";
import { SegmentedProgress } from "./ui/SegmentedProgress";
import { StatusChip } from "./ui/StatusChip";
import { attentionStageName, attentionTitle } from "./useAttentionAlerts";
import type { Connection } from "./useProjectSnapshot";

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
  const days = stintDays(snapshot, new Date(now));
  const weekTotal = days.reduce((sum, day) => sum + day.count, 0);
  const maxDay = Math.max(1, ...days.map((day) => day.count));
  const shippedMilestones = data.milestones.filter(
    ({ milestone }) => milestone.status === "shipped",
  );
  const otherMilestones = data.milestones.filter(
    ({ milestone }) =>
      milestone.status !== "shipped" && milestone.id !== data.featured?.milestone.id,
  );
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
          <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{detail}</span>
        </ItemContent>
        <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
      </button>
    </Item>
  );
  return (
    <main className="min-w-0 flex-1 overflow-auto px-4 pt-[42px] pb-5 min-[700px]:px-7 min-[700px]:pt-[65px] [&>header]:mx-auto [&>header]:max-w-[1320px] [&>div]:mx-auto [&>div]:max-w-[1320px]">
      <PageHeader
        eyebrow={`${snapshot.name} / ${t.viewNavigation.overview}`}
        title={t.viewNavigation.overview}
        description={t.overview.description}
        actions={
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
        }
      />
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-attention-soft p-3 text-xs text-attention-foreground"
        >
          {error}
          {t.board.lastAvailable}
        </p>
      )}
      <div className="grid min-w-0 grid-cols-1 gap-4 min-[769px]:grid-cols-2 min-[1280px]:grid-cols-[1fr_1.15fr_.95fr]">
        {!snapshot.workItems.length && (
          <Card className="min-[769px]:col-span-2 min-[1280px]:col-span-3">
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
        {data.milestones.length > 0 && (
          <Card className="min-w-0">
            <CardContent>
              {data.milestones
                .filter(({ milestone }) => milestone.id === data.featured?.milestone.id)
                .map(({ milestone, resolved, total, incomplete, tickets }) => (
                  <div key={milestone.id} className="py-1">
                    <CardHeader className="px-0">
                      <Eyebrow>{t.overview.eyebrows.milestones}</Eyebrow>
                      <CardTitle className="min-w-0">
                        <button
                          type="button"
                          className="block max-w-full truncate text-left hover:underline"
                          data-truncate
                          title={milestone.name}
                          onClick={() => onMilestone(milestone.id)}
                        >
                          {milestone.name}
                        </button>
                      </CardTitle>
                      <CardAction>
                        <StatusChip
                          status={
                            milestone.status === "active"
                              ? "running"
                              : milestone.status === "shipped"
                                ? "success"
                                : "stopped"
                          }
                        >
                          {t.planning.roadmap[milestone.status]}
                        </StatusChip>
                      </CardAction>
                    </CardHeader>
                    {incomplete && (
                      <p className="text-xs text-muted-foreground">
                        {t.overview.progressIncomplete}
                      </p>
                    )}
                    <div className="mt-8 text-[66px] leading-none font-[650] tracking-[-.08em] tabular-nums">
                      {milestonePercent(resolved, total)}
                      <span className="text-[33px]">%</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{t.overview.completed}</p>
                    <Progress
                      className="mt-5 h-2.5 [&_[data-slot=progress-indicator]]:bg-[var(--overview-chart-today)]"
                      value={resolved}
                      max={total || 1}
                      aria-label={milestone.name}
                    />
                    <div className="mt-2 flex justify-between gap-2 text-xs text-muted-foreground">
                      <span>{t.overview.progress}</span>
                      {milestone.target && (
                        <span>
                          {t.overview.target} · {milestone.target}
                        </span>
                      )}
                    </div>
                    <div className="mt-6 space-y-0 text-xs">
                      <div className="flex justify-between gap-2 border-t border-border py-3">
                        <span className="text-muted-foreground">{t.overview.workItemMetric}</span>
                        <strong className="tabular-nums">
                          {resolved}/{total}
                        </strong>
                      </div>
                      <div className="flex justify-between gap-2 border-t border-border py-3">
                        <span className="text-muted-foreground">{t.overview.tickets}</span>
                        <strong className="tabular-nums">
                          {incomplete
                            ? t.overview.unavailable
                            : `${tickets.filter((ticket) => ticket.resolved).length}/${tickets.length}`}
                        </strong>
                      </div>
                      <div className="flex justify-between gap-2 border-t border-border py-3">
                        <span className="text-muted-foreground">{t.overview.stintsThisWeek}</span>
                        <strong className="tabular-nums">{weekTotal}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              {otherMilestones.length > 0 && (
                <details className="py-2">
                  <summary className="cursor-pointer text-sm font-medium">
                    {otherMilestones.length}{" "}
                    {otherMilestones.length === 1
                      ? t.overview.moreMilestone
                      : t.overview.moreMilestones}
                  </summary>
                  <div className="mt-2 space-y-1">
                    {otherMilestones.map(({ milestone, resolved, total, incomplete }) => (
                      <div key={milestone.id} className="py-1">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left hover:underline"
                            data-truncate
                            title={milestone.name}
                            onClick={() => onMilestone(milestone.id)}
                          >
                            {milestone.name}
                          </button>
                          <StatusChip
                            status={milestone.status === "active" ? "running" : "stopped"}
                          >
                            {t.planning.roadmap[milestone.status]}
                          </StatusChip>
                          <span className="text-right text-sm tabular-nums">
                            {resolved}/{total} {t.overview.workItems}
                          </span>
                        </div>
                        {incomplete && (
                          <p className="text-xs text-muted-foreground">
                            {t.overview.progressIncomplete}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {shippedMilestones.length > 0 && (
                <details className="py-2">
                  <summary className="cursor-pointer text-sm font-medium">
                    {shippedMilestones.length}{" "}
                    {shippedMilestones.length === 1
                      ? t.overview.shippedMilestone
                      : t.overview.shippedMilestones}
                  </summary>
                  <div className="mt-2 space-y-1">
                    {shippedMilestones.map(({ milestone, resolved, total, incomplete }) => (
                      <div key={milestone.id} className="py-1">
                        <div className="flex items-center gap-2">
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
                            {resolved}/{total} {t.overview.workItems}
                          </span>
                        </div>
                        {incomplete && (
                          <p className="text-xs text-muted-foreground">
                            {t.overview.progressIncomplete}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        )}
        {data.columns.some(({ count }) => count > 0) && (
          <Card className="min-w-0">
            <CardHeader>
              <Eyebrow>{t.overview.eyebrows.workflow}</Eyebrow>
              <CardTitle>{t.overview.stages}</CardTitle>
              <CardAction className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                {data.columns.reduce((sum, column) => sum + column.count, 0)} {t.overview.workItems}
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap justify-end gap-3 text-xs text-muted-foreground">
                <span>● {t.overview.runningCount}</span>
                <span>▨ {t.overview.waitingCount}</span>
              </div>
              {data.columns.map(({ column, count, running, waiting }) => {
                const max = Math.max(1, ...data.columns.map((entry) => entry.count));
                const label = t.workflows.feature.stages[column];
                return (
                  <div key={column} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 truncate" data-truncate title={label}>
                      {label}
                    </span>
                    <div
                      role="img"
                      aria-label={`${label}: ${t.overview.runningCount} ${running}, ${t.overview.waitingCount} ${waiting}, ${t.overview.otherCount} ${count - running - waiting}`}
                      className="flex h-3.5 min-w-0 flex-1 overflow-hidden rounded bg-muted"
                    >
                      <span
                        className="bg-[var(--overview-chart-today)]"
                        style={{ width: `${(running / max) * 100}%` }}
                      />
                      <span
                        className="bg-[repeating-linear-gradient(135deg,var(--attention)_0_2px,transparent_2px_5px)]"
                        style={{ width: `${(waiting / max) * 100}%` }}
                      />
                      <span
                        className="bg-muted-foreground/40"
                        style={{ width: `${((count - running - waiting) / max) * 100}%` }}
                      />
                    </div>
                    <span className="tabular-nums">{count}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
        {data.next && (
          <Card className="min-h-[315px] min-w-0 justify-between border-0 bg-[radial-gradient(circle_at_95%_95%,var(--overview-focus-glow),transparent_45%),linear-gradient(135deg,var(--overview-focus-start),var(--overview-focus-middle)_52%,var(--overview-focus-end))] text-white">
            <CardHeader>
              <span className="w-fit rounded-full border border-white/20 bg-white/15 px-3 py-2 text-xs">
                {t.overview.next}
              </span>
            </CardHeader>
            <CardContent className="space-y-4">
              <CardTitle
                className="truncate text-[28px] leading-tight font-normal"
                data-truncate
                title={data.next.title}
              >
                {data.next.title}
              </CardTitle>
              <p className="text-sm text-white/80 [overflow-wrap:anywhere]">
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
              {ticketsUnavailable(data.next) ? (
                <p className="text-sm text-white/80">
                  {t.overview.tickets}: {t.overview.unavailable}
                </p>
              ) : (
                data.next.tickets.length > 0 && (
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
                )
              )}
              <Button
                className="bg-white text-[#29243c] hover:bg-white/90"
                onClick={() => {
                  if (data.next) onOpenItem(data.next.slug);
                }}
              >
                {t.overview.open}
              </Button>
            </CardContent>
          </Card>
        )}

        {data.attention.length > 0 && (
          <Card className="min-w-0">
            <CardHeader>
              <Eyebrow>{t.overview.eyebrows.attention}</Eyebrow>
              <CardTitle>
                {t.overview.attention}{" "}
                <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                  {snapshot.attentionItems.length}
                </span>
              </CardTitle>
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
                    <button type="button" className="text-left hover:bg-muted" onClick={onNeedsYou}>
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
        {data.activity.length > 0 && (
          <Card className="min-w-0">
            <CardHeader>
              <Eyebrow>{t.overview.eyebrows.activity}</Eyebrow>
              <CardTitle>{t.overview.lastSevenDays}</CardTitle>
              <CardAction className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                {weekTotal} {t.overview.stintCount}
              </CardAction>
            </CardHeader>
            <CardContent>
              {weekTotal === 0 && (
                <p className="text-xs text-muted-foreground">{t.overview.noStintsThisWeek}</p>
              )}
              <ul
                className={`mt-4 flex ${weekTotal ? "h-[140px]" : "h-6"} items-end gap-3`}
                aria-label={t.overview.lastSevenDays}
              >
                {days.map(({ date, count }, index) => {
                  const fullDate = date.toLocaleDateString(language, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  });
                  return (
                    <li
                      key={date.toISOString()}
                      aria-label={`${fullDate}: ${count} ${t.overview.stintCount}`}
                      className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
                    >
                      <div
                        className={`w-full max-w-8 rounded-t ${index === 6 ? "bg-[var(--overview-chart-today)]" : "bg-[var(--overview-chart)]"}`}
                        style={{ height: count ? `${(count / maxDay) * 100}%` : "2px" }}
                      />
                      <span className="text-xs text-muted-foreground">
                        {date.toLocaleDateString(language, { weekday: "short" })}
                      </span>
                    </li>
                  );
                })}
              </ul>
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
        {data.running.length > 0 && (
          <Card className="min-w-0">
            <CardHeader>
              <Eyebrow>{t.overview.eyebrows.live}</Eyebrow>
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
    </main>
  );
}
