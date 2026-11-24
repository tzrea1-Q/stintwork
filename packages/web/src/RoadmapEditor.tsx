// SPDX-License-Identifier: Apache-2.0
import { m } from "motion/react";
import { useId } from "react";
import { spring, useReducedMotionSafe } from "./ui/motion";
import type { Milestone, ProjectSnapshot, RoadmapChange } from "@stintwork/core";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { en } from "./i18n/en";
import { CoreTextError, readResponseJson, useErrorText, useLanguage } from "./i18n/language";
import { workItemDone } from "./overview-data";
import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/Dialog";
import { Progress } from "./ui/Progress";
import { SelectField } from "./ui/SelectField";
import { StatusChip } from "./ui/StatusChip";
import { ToggleGroup, ToggleGroupItem } from "./ui/ToggleGroup";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/Tooltip";

export function RoadmapEditor({ snapshot }: { snapshot: ProjectSnapshot }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        aria-haspopup="dialog"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        {t.planning.roadmap.title}
      </Button>
      {mounted && (
        <RoadmapSheet
          snapshot={snapshot}
          open={open}
          onClose={() => setOpen(false)}
          onExitComplete={() => setMounted(false)}
        />
      )}
    </>
  );
}

function RoadmapSheet({
  snapshot,
  open,
  onClose,
  onExitComplete,
}: {
  snapshot: ProjectSnapshot;
  open: boolean;
  onClose: () => void;
  onExitComplete: () => void;
}) {
  const { t } = useLanguage();
  const labels = t.planning.roadmap;
  const [milestones, setMilestones] = useState(snapshot.milestones);
  const indicatorId = useId();
  const reduced = useReducedMotionSafe();
  const [selected, setSelected] = useState(snapshot.milestones[0]?.id ?? "");
  const milestone = milestones.find((item) => item.id === selected);
  const [name, setName] = useState(milestone?.name ?? "");
  const [status, setStatus] = useState<Milestone["status"]>(milestone?.status ?? "planned");
  const [target, setTarget] = useState(milestone?.target ?? "");
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useErrorText();
  const [message, setMessage] = useState<"committed" | "unchanged" | "">("");
  useEffect(() => {
    setMilestones(snapshot.milestones);
  }, [snapshot.milestones]);
  useEffect(() => {
    if (!selected && milestones.length) {
      const first = milestones[0];
      setSelected(first.id);
      setName(first.name);
      setStatus(first.status);
      setTarget(first.target ?? "");
    }
  }, [milestones, selected]);
  const dirty =
    !!milestone &&
    (name !== milestone.name ||
      status !== milestone.status ||
      target !== (milestone.target ?? "") ||
      Object.keys(moves).length > 0);
  function discard() {
    return !dirty || window.confirm(labels.discardConfirm);
  }
  function select(id: string) {
    if (id !== selected && discard()) {
      const next = milestones.find((entry) => entry.id === id);
      if (!next) return;
      setSelected(id);
      setName(next.name);
      setStatus(next.status);
      setTarget(next.target ?? "");
      setMoves({});
    }
  }
  function close() {
    if (!saving && discard()) onClose();
  }
  async function save(change: RoadmapChange) {
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      const result = await readResponseJson(response);
      if (!response.ok) throw new CoreTextError(result, en.planning.roadmap.errors.save);
      setMilestones(result.milestones);
      if (change.kind === "batch") {
        const saved = (result.milestones as Milestone[]).find((entry) => entry.id === change.id);
        if (saved) {
          setName(saved.name);
          setStatus(saved.status);
          setTarget(saved.target ?? "");
        }
        setMoves({});
      }
      if (change.kind === "add") {
        setNewName("");
        setAdding(false);
      }
      setMessage(result.commit ? "committed" : "unchanged");
      toast.success(t.actionToast.roadmapSaved);
    } catch (cause) {
      toast.error(t.actionToast.failed);
      setError(cause instanceof Error ? cause : en.planning.roadmap.errors.save);
    } finally {
      setSaving(false);
    }
  }
  function reorder(index: number, offset: number) {
    const ids = milestones.map(({ id }) => id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    void save({ kind: "reorder", ids });
  }
  function saveMilestone() {
    if (!milestone) return;
    const changes: Extract<RoadmapChange, { kind: "batch" }>["changes"] = [];
    if (name !== milestone.name) changes.push({ kind: "rename", id: selected, name });
    if (status !== milestone.status || target !== (milestone.target ?? ""))
      changes.push({ kind: "update", id: selected, status, target: target || null });
    for (const [workItem, destination] of Object.entries(moves))
      changes.push({ kind: "move", workItem, milestone: destination || null });
    void save({ kind: "batch", id: selected, changes });
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        onExitComplete={onExitComplete}
        className="roadmap-editor w-[960px] [&_input]:w-full [&_input]:rounded-sm [&_input]:border [&_input]:border-border [&_input]:bg-card [&_input]:p-2"
        onEscapeKeyDown={(event) => {
          if (saving || adding) event.preventDefault();
          if (adding && !saving) {
            setAdding(false);
            setNewName("");
          }
        }}
        onPointerDownOutside={(event) => {
          if (saving) event.preventDefault();
        }}
      >
        <header className="mb-2 flex items-center justify-between gap-3">
          <DialogTitle className="text-xl font-medium">{labels.title}</DialogTitle>
          <Button disabled={saving} onClick={close}>
            {labels.close}
          </Button>
        </header>
        <DialogDescription className="text-muted-foreground">
          {labels.description}
        </DialogDescription>
        {error && (
          <p role="alert" className="text-attention-foreground">
            {Object.entries(en.planning.roadmap.errors).reduce(
              (text, [key, original]) =>
                text === original
                  ? labels.errors[key as keyof typeof en.planning.roadmap.errors]
                  : text,
              error,
            )}
          </p>
        )}
        {message && <p role="status">{labels[message]}</p>}
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="min-w-0">
            {adding ? (
              <form
                className="mb-2 flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save({ kind: "add", name: newName });
                }}
              >
                <label className="min-w-0 flex-1 text-sm">
                  {labels.newName}
                  <input
                    required
                    disabled={saving}
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                  />
                </label>
                <Button disabled={saving || !newName.trim()} type="submit">
                  {labels.add}
                </Button>
                <Button
                  disabled={saving}
                  onClick={() => {
                    setAdding(false);
                    setNewName("");
                  }}
                >
                  {labels.cancel}
                </Button>
              </form>
            ) : (
              <Button className="mb-2" disabled={saving} onClick={() => setAdding(true)}>
                {labels.newMilestone}
              </Button>
            )}
            <div className="flex items-center gap-1 md:hidden">
              <SelectField
                className="min-w-0 flex-1"
                aria-label={labels.milestones}
                value={selected}
                onValueChange={select}
                options={milestones.map(({ id, name }) => ({ value: id, label: name }))}
                disabled={saving || !milestones.length}
              />
              {milestone && (
                <TooltipProvider>
                  {([-1, 1] as const).map((offset) => {
                    const index = milestones.findIndex((entry) => entry.id === selected);
                    const label =
                      offset < 0 ? labels.up(milestone.name) : labels.down(milestone.name);
                    return (
                      <Tooltip key={offset}>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={label}
                            disabled={
                              saving || (offset < 0 ? index === 0 : index === milestones.length - 1)
                            }
                            onClick={() => reorder(index, offset)}
                          >
                            {offset < 0 ? (
                              <ChevronUp aria-hidden="true" />
                            ) : (
                              <ChevronDown aria-hidden="true" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{label}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                </TooltipProvider>
              )}
            </div>
            <div className="hidden md:block">
              <TooltipProvider>
                {milestones.map((item, index) => {
                  const total = item.workItemSlugs.length;
                  const done = snapshot.workItems.filter(
                    (workItem) =>
                      item.workItemSlugs.includes(workItem.slug) && workItemDone(workItem),
                  ).length;
                  return (
                    <m.section
                      layout={!reduced}
                      transition={spring.layout}
                      key={item.id}
                      aria-label={item.name}
                      className="flex min-w-0 items-center gap-1 border-b border-border py-0.5"
                    >
                      <button
                        type="button"
                        aria-pressed={selected === item.id}
                        disabled={saving}
                        onClick={() => select(item.id)}
                        className="relative isolate flex min-w-0 flex-1 items-center gap-1 rounded-sm text-left"
                      >
                        {selected === item.id && (
                          <m.span
                            aria-hidden="true"
                            data-slot="milestone-indicator"
                            layoutId={reduced ? undefined : indicatorId}
                            transition={spring.selection}
                            className="absolute inset-0 -z-10 rounded-sm bg-accent"
                          />
                        )}
                        <span
                          className="min-w-0 flex-1 truncate font-semibold"
                          data-truncate
                          title={item.name}
                        >
                          {item.name}
                        </span>
                        <small
                          className="max-w-16 truncate text-muted-foreground"
                          data-truncate
                          title={item.id}
                        >
                          {item.id}
                        </small>
                        <StatusChip
                          status={
                            item.status === "shipped"
                              ? "success"
                              : item.status === "active"
                                ? "running"
                                : "stopped"
                          }
                        >
                          {labels[item.status]}
                        </StatusChip>
                      </button>
                      {total > 0 && (
                        <div className="flex items-center gap-1">
                          <Progress
                            value={done}
                            max={total}
                            aria-label={item.name}
                            className="w-8 [&_[data-slot=progress-indicator]]:bg-running"
                          />
                          <span className="text-xs tabular-nums">
                            {done}/{total}
                          </span>
                        </div>
                      )}
                      {([-1, 1] as const).map((offset) => {
                        const label = offset < 0 ? labels.up(item.name) : labels.down(item.name);
                        return (
                          <Tooltip key={offset}>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={label}
                                disabled={
                                  saving ||
                                  (offset < 0 ? index === 0 : index === milestones.length - 1)
                                }
                                onClick={() => reorder(index, offset)}
                              >
                                {offset < 0 ? (
                                  <ChevronUp aria-hidden="true" />
                                ) : (
                                  <ChevronDown aria-hidden="true" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{label}</TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </m.section>
                  );
                })}
              </TooltipProvider>
            </div>
          </div>
          {milestone && (
            <fieldset disabled={saving} className="min-w-0 space-y-3">
              <legend className="font-semibold">{milestone.name}</legend>
              <label className="block text-sm">
                {labels.nameLabel}
                <input
                  aria-label={labels.name(milestone.name)}
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <div>
                <span className="text-sm">{labels.statusLabel}</span>
                <ToggleGroup
                  type="single"
                  className="rounded-full border border-border bg-card p-1"
                  spacing={1}
                  aria-label={labels.status(milestone.name)}
                  value={status}
                  onValueChange={(value) => {
                    if (value) setStatus(value as Milestone["status"]);
                  }}
                >
                  {(["planned", "active", "shipped"] as const).map((value) => (
                    <ToggleGroupItem
                      key={value}
                      value={value}
                      className="rounded-full text-muted-foreground data-[state=on]:text-primary-foreground [&_[data-slot=toggle-indicator]]:bg-primary"
                    >
                      {labels[value]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <label className="block text-sm">
                {labels.targetLabel}
                <input
                  type="date"
                  aria-label={labels.target(milestone.name)}
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                />
              </label>
              <div>
                <h3 className="font-semibold">{labels.workItems}</h3>
                {snapshot.workItems
                  .filter(
                    (item) =>
                      milestone.workItemSlugs.includes(item.slug) ||
                      !milestones.some((entry) => entry.workItemSlugs.includes(item.slug)),
                  )
                  .map((item) => {
                    const original =
                      milestones.find((entry) => entry.workItemSlugs.includes(item.slug))?.id ?? "";
                    return (
                      <div
                        key={item.slug}
                        className="flex min-w-0 flex-col gap-2 py-1 md:flex-row md:items-center"
                      >
                        <span
                          className="min-w-0 break-words md:flex-1 md:truncate"
                          data-truncate
                          title={item.title}
                        >
                          {item.title}
                        </span>
                        <div className="flex min-w-0 w-full items-center gap-2 md:w-auto">
                          <span className="shrink-0 text-sm">{labels.moveTo}</span>
                          <SelectField
                            className="min-w-0 flex-1 md:w-44 md:flex-none"
                            aria-label={labels.moveItem(item.title, milestone.name)}
                            value={moves[item.slug] ?? original}
                            onValueChange={(value) =>
                              setMoves((previous) => {
                                const next = { ...previous };
                                if (value === original) delete next[item.slug];
                                else next[item.slug] = value;
                                return next;
                              })
                            }
                            options={[
                              { value: "", label: labels.noMilestone },
                              ...milestones
                                .filter((entry) => original || entry.id === selected)
                                .map((entry) => ({ value: entry.id, label: entry.name })),
                            ]}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
              <div className="flex gap-2">
                <Button variant="primary" disabled={!dirty || !name.trim()} onClick={saveMilestone}>
                  {labels.save}
                </Button>
                <Button
                  variant="secondary"
                  disabled={!dirty}
                  onClick={() => {
                    setName(milestone.name);
                    setStatus(milestone.status);
                    setTarget(milestone.target ?? "");
                    setMoves({});
                  }}
                >
                  {labels.cancel}
                </Button>
              </div>
            </fieldset>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
