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
      {warnings.some((warning) => warning.excluded) && (
        <p>Excluded from the checkpoint and left uncommitted. File contents are not shown.</p>
      )}
      {warnings.some((warning) => !warning.excluded) && (
        <p>
          Already committed on the branch; not excluded by the checkpoint. Remove these files in a
          follow-up commit and add them to .gitignore, or deliberately Accept each path with a
          reason in Review. Rotate real secrets and clean Git history before publishing. File
          contents are not shown.
        </p>
      )}
      <ul>
        {warnings.map((warning) => (
          <li key={`${warning.path}:${warning.excluded}`}>
            <code>{warning.path}</code> —{" "}
            {warning.reasons.map((reason) => labels[reason]).join(", ")}
            {!warning.excluded && (
              <span>
                {" "}
                · Committed:{" "}
                {warning.commits.map((commit) => (
                  <code key={commit}>{commit} </code>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
