// SPDX-License-Identifier: Apache-2.0
import { AgentAvatar } from "../ui/AgentAvatar";
import { Card, CardAction, CardContent, CardHeader, CardTitle, Eyebrow } from "../ui/Card";
import { Item, ItemContent, ItemMedia } from "../ui/Item";
import { StatusChip } from "../ui/StatusChip";
import { RollingNumber } from "../ui/RollingNumber";
import type { CardProps } from "./types";

function relativeTime(at: string, now: number, language: string) {
  const seconds = (Date.parse(at) - now) / 1000;
  const magnitude = Math.abs(seconds);
  const [divisor, unit] =
    magnitude < 60
      ? [1, "second"]
      : magnitude < 3600
        ? [60, "minute"]
        : magnitude < 86400
          ? [3600, "hour"]
          : magnitude < 604800
            ? [86400, "day"]
            : magnitude < 4838400
              ? [604800, "week"]
              : magnitude < 31557600
                ? [2629800, "month"]
                : [31557600, "year"];
  return new Intl.RelativeTimeFormat(language, { numeric: "auto" }).format(
    Math.round(seconds / (divisor as number)),
    unit as Intl.RelativeTimeFormatUnit,
  );
}

export function ActivityCard({
  data,
  snapshot,
  t,
  language,
  days,
  weekTotal,
  maxDay,
  stageLabel,
  now,
  onOpenItem,
}: CardProps) {
  return (
    <>
      {data.activity.length > 0 && (
        <Card className="min-w-0">
          <CardHeader>
            <Eyebrow>{t.overview.eyebrows.activity}</Eyebrow>
            <CardTitle>{t.overview.lastSevenDays}</CardTitle>
            <CardAction className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
              <RollingNumber value={weekTotal} /> {t.overview.stintCount}
            </CardAction>
          </CardHeader>
          <CardContent>
            {weekTotal === 0 && (
              <p className="text-xs text-muted-foreground">{t.overview.noStintsThisWeek}</p>
            )}
            {weekTotal > 0 && (
              <ul
                className="mt-4 flex h-overview-chart items-end gap-3"
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
                        className={`w-full max-w-8 rounded-t ${index === 6 ? "bg-running" : "bg-muted-foreground/40"}`}
                        style={{ height: count ? `${(count / maxDay) * 100}%` : "2px" }}
                      />
                      <span className="text-xs text-muted-foreground">
                        {date.toLocaleDateString(language, { weekday: "short" })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <h3 className="mt-4">{t.overview.recentStints}</h3>
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
                      <time dateTime={at} title={new Date(at).toLocaleString(language)}>
                        {relativeTime(at, now, language)}
                      </time>
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
    </>
  );
}
