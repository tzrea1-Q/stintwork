// SPDX-License-Identifier: Apache-2.0

import { m } from "motion/react";
import { isKeyboardInput } from "../ui/input-modality";
import { spring, tween } from "../ui/motion";
import { ResizeHandle } from "../ui/ResizeHandle";
import { Sheet, SheetContent } from "../ui/Sheet";
import { TooltipProvider } from "../ui/Tooltip";

import { DrawerContent } from "./DrawerContent";
import type { DrawerState } from "./useDrawerState";
export function DrawerContainer({ state }: { state: DrawerState }) {
  const {
    item,
    full,
    t,
    reduced,
    isPresent,
    safeToRemove,
    close,
    skipInitialFocus,
    opener,
    closeButton,
    autoFocusing,
    panel,
    sheetPanel,
    width,
    maximum,
    changeWidth,
    dismiss,
    docked,
    reviewOpen,
  } = state;
  const content = <DrawerContent state={state} />;
  return (
    <TooltipProvider>
      {docked ? (
        <div
          className={`min-h-0 min-w-0 shrink-0 overflow-hidden rounded-2xl ${isPresent ? "" : "absolute inset-y-0 right-0 z-10"}`}
          style={{ width: full ? "100%" : width }}
        >
          <m.aside
            ref={panel}
            tabIndex={-1}
            data-exiting={isPresent ? undefined : "true"}
            aria-hidden={isPresent ? undefined : true}
            {...(isPresent ? {} : { inert: "" })}
            onAnimationComplete={() => {
              if (!isPresent) safeToRemove?.();
            }}
            layout={!reduced && isPresent}
            layoutDependency={full}
            initial={reduced ? { opacity: 0 } : { x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{
              ...(reduced ? { opacity: 0 } : { x: "100%", opacity: 0 }),
              transition: tween.dismiss,
            }}
            transition={{ ...tween.sheet, layout: spring.layout }}
            aria-label={item.title}
            className="work-item-drawer relative outline-none flex min-h-0 min-w-0 shrink-0 flex-col rounded-2xl bg-card shadow-card"
            style={{ width: full ? "100%" : width, height: "100%" }}
            onKeyDown={(event) => {
              if (
                event.key === "Escape" &&
                !event.defaultPrevented &&
                !reviewOpen &&
                !(
                  event.target instanceof Element &&
                  event.target.closest('[role="dialog"], [role="listbox"], [role="menu"]')
                )
              ) {
                event.preventDefault();
                dismiss();
              }
            }}
          >
            {!full && (
              <ResizeHandle
                value={width}
                min={400}
                max={maximum}
                onChange={changeWidth}
                label={t.stints.resizeDetail}
              />
            )}
            {content}
          </m.aside>
        </div>
      ) : (
        <Sheet
          open={isPresent}
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <SheetContent
            ref={sheetPanel}
            tabIndex={-1}
            onExitComplete={safeToRemove ?? undefined}
            className="work-item-drawer outline-none flex min-h-0 min-w-0 w-[60vw] min-w-[var(--detail-sheet-min-width)] flex-col overflow-hidden p-0 [&_button]:min-h-10 [&_button]:min-w-10 [&_summary]:min-h-10"
            aria-describedby={undefined}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              if (skipInitialFocus.current) {
                skipInitialFocus.current = false;
                return;
              }
              const previous = document.activeElement;
              autoFocusing.current = true;
              (isKeyboardInput() ? closeButton.current : sheetPanel.current)?.focus({
                focusVisible: isKeyboardInput(),
                preventScroll: true,
              });
              autoFocusing.current = false;
              opener.current = previous instanceof HTMLElement ? previous : null;
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (document.activeElement === document.body && opener.current?.isConnected)
                opener.current.focus();
            }}
            onEscapeKeyDown={(event) => {
              if (
                reviewOpen ||
                (event.target instanceof Element && event.target.closest("dialog[open]"))
              )
                event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (reviewOpen) event.preventDefault();
            }}
          >
            {content}
          </SheetContent>
        </Sheet>
      )}
    </TooltipProvider>
  );
}
