// SPDX-License-Identifier: Apache-2.0
import { ticketsUnavailable } from "../overview-data";
import { Button } from "../ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { SegmentedProgress } from "../ui/SegmentedProgress";
import type { CardProps } from "./types";

export function NextUpCard({ data, snapshot, t, stageLabel, onOpenItem }: CardProps) {
  const nextMilestone = snapshot.milestones.find(
    (milestone) => milestone.id === data.next?.milestone,
  );
  return (
    <>
      {data.next && (
        <Card className="min-w-0 border-0 bg-[radial-gradient(circle_at_95%_95%,var(--overview-focus-glow),transparent_45%),linear-gradient(135deg,var(--overview-focus-start),var(--overview-focus-middle)_52%,var(--overview-focus-end))] text-overview-focus-text">
          <CardHeader>
            <span className="w-fit rounded-full border border-overview-focus-text/20 bg-overview-focus-text/15 px-3 py-2 text-xs">
              {t.overview.next}
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            <CardTitle
              className="truncate text-hero-title leading-tight font-normal"
              data-truncate
              title={data.next.title}
            >
              {data.next.title}
            </CardTitle>
            <p className="text-sm text-overview-focus-muted [overflow-wrap:anywhere]">
              {data.next.slug} · {stageLabel(data.next, data.next.stage)}
              {nextMilestone && <> · {nextMilestone.name}</>}
            </p>
            {ticketsUnavailable(data.next) ? (
              <p className="text-sm text-overview-focus-muted">
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
              className="bg-overview-focus-button text-overview-focus-button-foreground hover:bg-overview-focus-button/90"
              onClick={() => {
                if (data.next) onOpenItem(data.next.slug);
              }}
            >
              {t.overview.open}
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}
