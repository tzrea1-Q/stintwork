// SPDX-License-Identifier: Apache-2.0
import { ArrowRight } from "lucide-react";
import { formatDuration } from "../duration";
import { AgentAvatar } from "../ui/AgentAvatar";
import { Card, CardContent, CardHeader, CardTitle, Eyebrow } from "../ui/Card";
import { Item, ItemContent, ItemMedia } from "../ui/Item";
import type { CardProps } from "./types";

export function RunningCard({ data, snapshot, t, now, stageLabel, onOpenItem }: CardProps) {
  const itemRow = (
    item: CardProps["snapshot"]["workItems"][number],
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
    <>
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
                      · {t.overview.elapsed}{" "}
                      {formatDuration(
                        Math.max(0, Math.floor((now - Date.parse(stint.startedAt)) / 60000)),
                        t,
                      )}
                    </>
                  )}
                </>,
                <AgentAvatar agent={stint.agent} name={name} active />,
              );
            })}
          </CardContent>
        </Card>
      )}
    </>
  );
}
