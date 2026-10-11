import type { Milestone, ProjectSnapshot, RoadmapChange } from "@stintwork/core";
import { useEffect, useId, useRef, useState } from "react";
import "./roadmap-editor.css";

export function RoadmapEditor({ snapshot }: { snapshot: ProjectSnapshot }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        type="button"
        className="top-button"
        ref={trigger}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        Edit roadmap
      </button>
      {open && (
        <RoadmapSheet
          snapshot={snapshot}
          onClose={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        />
      )}
    </>
  );
}

function RoadmapSheet({ snapshot, onClose }: { snapshot: ProjectSnapshot; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [milestones, setMilestones] = useState(snapshot.milestones);
  const [name, setName] = useState("");
  const [workItem, setWorkItem] = useState(snapshot.workItems[0]?.slug ?? "");
  const [destination, setDestination] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    setMilestones(snapshot.milestones);
  }, [snapshot.milestones]);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    element?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => element?.close();
  }, []);

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
      const result = await response.json();
      if (!response.ok) throw new Error(result.reason ?? "Could not change the roadmap.");
      setMilestones(result.milestones);
      if (change.kind === "add") setName("");
      setMessage(result.commit ? "Roadmap committed." : "Roadmap unchanged.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change the roadmap.");
    } finally {
      setSaving(false);
    }
  }

  function reorder(index: number, offset: number) {
    const ids = milestones.map(({ id }) => id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    void save({ kind: "reorder", ids });
  }

  return (
    <dialog
      className="roadmap-editor"
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <header>
        <h2 id={titleId}>Edit roadmap</h2>
        <button type="button" className="top-button" disabled={saving} onClick={onClose}>
          Close roadmap
        </button>
      </header>
      <p className="muted">
        Each change is one commit to .stintwork/roadmap.md. Commit hand edits first.
      </p>
      {error && (
        <p role="alert" className="warning">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <fieldset disabled={saving}>
        <legend>Milestones</legend>
        {milestones.map((milestone, index) => (
          <MilestoneFields
            key={`${milestone.id}:${milestone.name}:${milestone.status}:${milestone.target ?? ""}`}
            milestone={milestone}
            first={index === 0}
            last={index === milestones.length - 1}
            onSave={save}
            onReorder={(offset) => reorder(index, offset)}
          />
        ))}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save({ kind: "add", name });
          }}
        >
          <label>
            New milestone name
            <input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <button className="top-button" type="submit" disabled={!name.trim()}>
            Add milestone
          </button>
        </form>
      </fieldset>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save({ kind: "move", workItem, milestone: destination || null });
        }}
      >
        <fieldset disabled={saving || !snapshot.workItems.length}>
          <legend>Move a work item</legend>
          <label>
            Work item
            <select value={workItem} onChange={(event) => setWorkItem(event.target.value)}>
              {snapshot.workItems.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Destination milestone
            <select value={destination} onChange={(event) => setDestination(event.target.value)}>
              <option value="">No milestone</option>
              {milestones.map((milestone) => (
                <option key={milestone.id} value={milestone.id}>
                  {milestone.name}
                </option>
              ))}
            </select>
          </label>
          <button className="top-button" type="submit">
            Move work item
          </button>
        </fieldset>
      </form>
    </dialog>
  );
}

function MilestoneFields({
  milestone,
  first,
  last,
  onSave,
  onReorder,
}: {
  milestone: Milestone;
  first: boolean;
  last: boolean;
  onSave: (change: RoadmapChange) => Promise<void>;
  onReorder: (offset: number) => void;
}) {
  const [name, setName] = useState(milestone.name);
  const [status, setStatus] = useState(milestone.status);
  const [target, setTarget] = useState(milestone.target ?? "");
  return (
    <section className="roadmap-milestone" aria-label={milestone.name}>
      <h3>
        {milestone.name} <small className="muted">{milestone.id}</small>
      </h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({ kind: "rename", id: milestone.id, name });
        }}
      >
        <label>
          Name for {milestone.name}
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <button
          className="top-button"
          type="submit"
          disabled={!name.trim() || name === milestone.name}
        >
          Rename {milestone.name}
        </button>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({ kind: "update", id: milestone.id, status });
        }}
      >
        <label>
          Status for {milestone.name}
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as Milestone["status"])}
          >
            <option value="planned">Planned</option>
            <option value="active">Active</option>
            <option value="shipped">Shipped</option>
          </select>
        </label>
        <button className="top-button" type="submit" disabled={status === milestone.status}>
          Set status for {milestone.name}
        </button>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({ kind: "update", id: milestone.id, target: target || null });
        }}
      >
        <label>
          Target for {milestone.name}
          <input type="date" value={target} onChange={(event) => setTarget(event.target.value)} />
        </label>
        <button className="top-button" type="submit" disabled={target === (milestone.target ?? "")}>
          Set target for {milestone.name}
        </button>
      </form>
      <div className="roadmap-order">
        <button className="top-button" type="button" disabled={first} onClick={() => onReorder(-1)}>
          Move {milestone.name} up
        </button>
        <button className="top-button" type="button" disabled={last} onClick={() => onReorder(1)}>
          Move {milestone.name} down
        </button>
      </div>
    </section>
  );
}
