// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "@stintwork/core";
import { CheckCheck } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useLanguage } from "../i18n/language";
import { Button } from "../ui/Button";
import { Disclosure } from "../ui/Disclosure";
import { WorkItemCard } from "../WorkItemCard";
export function ShippedLane({
  snapshot,
  filteredShipped,
  filteredMilestoneShipped,
  openSlug,
  openWorkItem,
  showWorkflow,
}: {
  snapshot: ProjectSnapshot;
  filteredShipped: ProjectSnapshot["workItems"];
  filteredMilestoneShipped: ProjectSnapshot["workItems"];
  openSlug: string | null;
  openWorkItem: (slug: string) => void;
  showWorkflow: boolean;
}) {
  const { t } = useLanguage();
  return (
    <Disclosure
      className="shipped-lane mt-4 rounded-2xl bg-card p-4 shadow-card"
      label={
        <>
          <CheckCheck className="size-icon-sm text-success-foreground" aria-hidden="true" />
          <h2>{t.board.shipped}</h2>
          <span className="count min-w-5 rounded-sm bg-muted px-1 text-center text-xs text-muted-foreground">
            {filteredShipped.length + filteredMilestoneShipped.length}
          </span>
        </>
      }
    >
      {filteredShipped.length + filteredMilestoneShipped.length ? (
        <>
          {filteredShipped.length > 0 && <h3 className="mt-3 text-xs">{t.board.shipped}</h3>}
          <div className="auxiliary-items mt-3 grid gap-3" data-card-column="shipped">
            <AnimatePresence mode="popLayout">
              {filteredShipped.map((item, index) => (
                <WorkItemCard
                  showWorkflow={showWorkflow}
                  workflow={snapshot.workflows[item.workflow]}
                  key={item.slug}
                  item={item}
                  index={index}
                  agents={snapshot.agents}
                  selected={openSlug === item.slug}
                  attentionCount={
                    snapshot.attentionItems.filter((entry) => entry.workItem === item.slug).length
                  }
                  milestone={snapshot.milestones.find((entry) => entry.id === item.milestone)}
                  onOpen={openWorkItem}
                />
              ))}
            </AnimatePresence>
          </div>
          {filteredMilestoneShipped.length > 0 && (
            <section>
              <h3 className="mt-3 text-xs">{t.board.milestoneShipped}</h3>
              <div className="auxiliary-items mt-3 grid gap-3">
                {filteredMilestoneShipped.map((item, index) => (
                  <div key={item.slug}>
                    <WorkItemCard
                      showWorkflow={showWorkflow}
                      workflow={snapshot.workflows[item.workflow]}
                      item={item}
                      index={index}
                      agents={snapshot.agents}
                      selected={openSlug === item.slug}
                      attentionCount={
                        snapshot.attentionItems.filter((entry) => entry.workItem === item.slug)
                          .length
                      }
                      milestone={snapshot.milestones.find((entry) => entry.id === item.milestone)}
                      onOpen={openWorkItem}
                    />
                    <Button variant="link" type="button" onClick={() => openWorkItem(item.slug)}>
                      {t.markShipped.mark}
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <p className="py-4 text-xs muted text-muted-foreground">{t.board.emptyShipped}</p>
      )}
    </Disclosure>
  );
}
