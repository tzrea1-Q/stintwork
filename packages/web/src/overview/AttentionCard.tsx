// SPDX-License-Identifier: Apache-2.0
import { CircleAlert } from "lucide-react";
import { Button } from "../ui/Button";
import { Card, CardContent, CardHeader, CardTitle, Eyebrow } from "../ui/Card";
import { IconChip } from "../ui/IconChip";
import { Item, ItemContent, ItemMedia } from "../ui/Item";
import { attentionStageName, attentionTitle } from "../useAttentionAlerts";
import type { CardProps } from "./types";

export function AttentionCard({ data, snapshot, t, language, onNeedsYou }: CardProps) {
  return (
    <>
      {data.attention.length > 0 && (
        <Card className="min-w-0">
          <CardHeader>
            <Eyebrow>{t.overview.eyebrows.attention}</Eyebrow>
            <CardTitle>
              {t.overview.attention}{" "}
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
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
    </>
  );
}
