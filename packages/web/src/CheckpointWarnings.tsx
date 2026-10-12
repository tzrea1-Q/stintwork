// SPDX-License-Identifier: Apache-2.0
import type { CheckpointWarning } from "@stintwork/core";

export function CheckpointWarnings({ warnings }: { warnings?: readonly CheckpointWarning[] }) {
  if (!warnings?.length) return null;
  const labels = {
    "likely-secret": "Likely secret",
    "large-file": "Larger than 1 MiB",
    "generated-directory": "Generated directory",
  };
  return (
    <section className="warning" aria-label="Checkpoint warnings">
      <h4>Checkpoint warnings</h4>
      <p>Excluded from the checkpoint and left uncommitted. File contents are not shown.</p>
      <ul>
        {warnings.map(({ path, reasons }) => (
          <li key={path}>
            <code>{path}</code> — {reasons.map((reason) => labels[reason]).join(", ")}
          </li>
        ))}
      </ul>
    </section>
  );
}
