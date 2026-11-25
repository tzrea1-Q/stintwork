// SPDX-License-Identifier: Apache-2.0
import { Card, CardAction, CardContent, CardHeader, CardTitle, Eyebrow } from "../ui/Card";
import { RollingNumber } from "../ui/RollingNumber";
import type { CardProps } from "./types";

export function StagesCard({ data, t }: CardProps) {
  const max = Math.max(1, ...data.columns.map((entry) => entry.count));
  return (
    <>
      {data.columns.some(({ count }) => count > 0) && (
        <Card className="min-w-0">
          <CardHeader>
            <Eyebrow>{t.overview.eyebrows.workflow}</Eyebrow>
            <CardTitle>{t.overview.stages}</CardTitle>
            <CardAction className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
              <RollingNumber value={data.columns.reduce((sum, column) => sum + column.count, 0)} />{" "}
              {t.overview.workItems}
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap justify-end gap-3 text-xs text-muted-foreground">
              {[
                [t.overview.runningCount, "bg-running"],
                [t.overview.waitingCount, "bg-attention"],
                [t.overview.otherCount, "bg-stopped"],
              ].map(([label, color]) => (
                <span key={label} className="flex items-center gap-1">
                  <span className="flex size-2 rounded-sm overflow-hidden [&>span]:flex-1">
                    <span data-stage-swatch className={color} />
                  </span>
                  {label}
                </span>
              ))}
            </div>
            {data.columns.map(({ column, count, running, waiting }) => {
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
                    <span className="bg-running" style={{ width: `${(running / max) * 100}%` }} />
                    <span className="bg-attention" style={{ width: `${(waiting / max) * 100}%` }} />
                    <span
                      className="bg-stopped"
                      style={{ width: `${((count - running - waiting) / max) * 100}%` }}
                    />
                  </div>
                  <span className="tabular-nums">
                    <RollingNumber value={count} />
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </>
  );
}
