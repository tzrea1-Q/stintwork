// SPDX-License-Identifier: Apache-2.0

import { m } from "motion/react";
import { ChecksPanel } from "../ChecksPanel";
import { ReviewOverlay } from "../ReviewOverlay";
import { Tabs, TabsList, TabsTrigger } from "../ui/Tabs";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { OverviewTab } from "./OverviewTab";
import { SpecTab } from "./SpecTab";
import { StintsTab } from "./StintsTab";
import { TicketsTab } from "./TicketsTab";
import type { DrawerState } from "./useDrawerState";
export function DrawerContent({ state }: { state: DrawerState }) {
  const {
    item,
    pendingPermissions,
    onOpenNeedsYou,
    t,
    docked,
    reviewOpen,
    setReviewOpen,
    reviewMounted,
    setReviewMounted,
    shipPaused,
    reviewStageId,
    tabs,
    activeTab,
    changeTab,
  } = state;
  return (
    <>
      {pendingPermissions && !docked && (
        <button
          type="button"
          className="shrink-0 border-b border-attention/30 bg-card px-4 py-2 text-left text-sm text-attention-foreground"
          onClick={onOpenNeedsYou}
        >
          {t.needsYou.pendingPermissions}
        </button>
      )}
      <Header state={state} />
      <m.div layout="position" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Tabs
          value={activeTab}
          onValueChange={changeTab}
          className="min-h-0 min-w-0 flex-1 flex-col gap-0"
        >
          <TabsList
            variant="line"
            aria-label={t.stints.sections}
            className="w-full shrink-0 justify-start overflow-x-auto border-b border-border px-4 sm:px-7"
          >
            {tabs.map((value) => (
              <TabsTrigger key={value} value={value} className="flex-none">
                {t.detailTabs[value as keyof typeof t.detailTabs]}
              </TabsTrigger>
            ))}
          </TabsList>
          {activeTab === "overview" && <OverviewTab state={state} />}
          {activeTab === "spec" && <SpecTab state={state} />}
          {activeTab === "tickets" && <TicketsTab state={state} />}
          {activeTab === "stints" && <StintsTab state={state} />}
        </Tabs>
      </m.div>
      <Footer state={state} />
      {(reviewOpen || reviewMounted) && (
        <ReviewOverlay
          open={reviewOpen}
          onExitComplete={() => setReviewMounted(false)}
          reviewStageId={reviewStageId}
          item={item}
          onClose={() => setReviewOpen(false)}
          checks={<ChecksPanel item={item} shipPaused={shipPaused} />}
        />
      )}
    </>
  );
}
