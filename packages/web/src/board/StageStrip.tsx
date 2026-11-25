// SPDX-License-Identifier: Apache-2.0
import { builtInWorkflows, type ProjectSnapshot } from "@stintwork/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { useLanguage } from "../i18n/language";
import { stageName } from "../i18n/workflow-names";
import { Button } from "../ui/Button";

const stages = builtInWorkflows.feature.stages;
export function StageStrip({
  items,
  enabled,
  openItem,
  scrollRef,
  children,
}: {
  items: ProjectSnapshot["workItems"];
  enabled: boolean;
  openItem?: ProjectSnapshot["workItems"][number];
  scrollRef: RefObject<HTMLElement>;
  children: (narrow: boolean, stage: string, edges: { left: boolean; right: boolean }) => ReactNode;
}) {
  const { t } = useLanguage();
  const [narrow, setNarrow] = useState(
    () => typeof matchMedia === "function" && matchMedia("(max-width: 767px)").matches,
  );
  const [choice, setChoice] = useState(
    () => new URL(location.href).searchParams.get("stage") ?? "",
  );
  const active = stages.some((stage) => stage.column === choice)
    ? choice
    : (stages.find((stage) => items.some((item) => item.column === stage.column)) ?? stages[0])
        .column;
  const [edges, setEdges] = useState({ overflow: false, left: false, right: false });
  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 767px)");
    if (!media) return;
    const change = () => setNarrow(media.matches);
    change();
    media.addEventListener?.("change", change);
    return () => media.removeEventListener?.("change", change);
  }, []);
  useLayoutEffect(() => {
    if (enabled && narrow && openItem?.slug && openItem.column) setChoice(openItem.column);
  }, [enabled, narrow, openItem?.slug, openItem?.column]);
  useEffect(() => {
    if (!enabled || !narrow) return;
    const url = new URL(location.href);
    url.searchParams.set("stage", active);
    history.replaceState(history.state, "", url);
  }, [active, enabled, narrow]);
  useEffect(() => {
    const pop = () => setChoice(new URL(location.href).searchParams.get("stage") ?? "");
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!enabled || !element || narrow) return;
    const measure = () => {
      const overflow = element.scrollWidth > element.clientWidth;
      const left = element.scrollLeft > 0;
      const right = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
      setEdges((previous) =>
        previous.overflow === overflow && previous.left === left && previous.right === right
          ? previous
          : { overflow, left, right },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    const grid = element.querySelector(".stage-grid");
    if (grid) observer.observe(grid);
    element.addEventListener("scroll", measure);
    measure();
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", measure);
    };
  });
  function scrollStages(direction: -1 | 1) {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const columns = Array.from(
      viewport.querySelectorAll<HTMLElement>('.stage-column:not([data-layout="rail"])'),
    );
    const positions = [...new Set([0, ...columns.map((column) => Math.max(0, column.offsetLeft))])];
    const current = positions.reduce(
      (nearest, position, index) =>
        Math.abs(position - viewport.scrollLeft) <
        Math.abs(positions[nearest] - viewport.scrollLeft)
          ? index
          : nearest,
      0,
    );
    viewport.scrollTo({
      left: positions[Math.max(0, Math.min(current + direction, positions.length - 1))],
    });
  }
  function select(index: number, focus = false) {
    const stage = stages[(index + stages.length) % stages.length];
    setChoice(stage.column);
    if (focus) document.getElementById(`stage-tab-${stage.column}`)?.focus();
  }
  return (
    <>
      {enabled &&
        (narrow ? (
          <div
            role="tablist"
            aria-label={t.board.stages}
            className="stage-switcher flex gap-2 overflow-x-auto pb-2"
          >
            {stages.map((stage, index) => (
              <button
                id={`stage-tab-${stage.column}`}
                type="button"
                role="tab"
                aria-selected={active === stage.column}
                tabIndex={active === stage.column ? 0 : -1}
                key={stage.column}
                className="shrink-0 rounded-lg px-3 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
                onClick={() => select(index)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                    event.preventDefault();
                    select(index + (event.key === "ArrowRight" ? 1 : -1), true);
                  }
                }}
              >
                {stageName(builtInWorkflows.feature, stage, t)}{" "}
                <span>{items.filter((item) => item.column === stage.column).length}</span>
              </button>
            ))}
          </div>
        ) : (
          edges.overflow && (
            <nav
              className="stage-navigation flex justify-end gap-1"
              aria-label={t.board.stageNavigation}
            >
              <Button variant="ghost" disabled={!edges.left} onClick={() => scrollStages(-1)}>
                <ChevronLeft aria-hidden="true" />
                {t.board.previousStages}
              </Button>
              <Button variant="ghost" disabled={!edges.right} onClick={() => scrollStages(1)}>
                {t.board.nextStages}
                <ChevronRight aria-hidden="true" />
              </Button>
            </nav>
          )
        ))}
      {children(narrow, active, {
        left: enabled && edges.left && !narrow,
        right: enabled && edges.right && !narrow,
      })}
    </>
  );
}
