// SPDX-License-Identifier: Apache-2.0
import type { CheckpointWarning } from "@stintwork/core";
import { useLanguage } from "./i18n/language";

export function CheckpointWarnings({ warnings }: { warnings?: readonly CheckpointWarning[] }) {
  const { t } = useLanguage();
  if (!warnings?.length) return null;
  const labels = {
    "likely-secret": t.needsYou.likelySecret,
    "large-file": t.needsYou.largeFile,
    "generated-directory": t.needsYou.generatedDirectory,
  };
  return (
    <section className="warning" aria-label={t.needsYou.checkpointWarnings}>
      <h4>{t.needsYou.checkpointWarnings}</h4>
      {warnings.some((warning) => warning.excluded) && <p>{t.needsYou.excludedFiles}</p>}
      {warnings.some((warning) => !warning.excluded) && <p>{t.needsYou.committedFiles}</p>}
      <ul>
        {warnings.map((warning) => (
          <li key={`${warning.path}:${warning.excluded}`}>
            <code>{warning.path}</code> —{" "}
            {warning.reasons.map((reason) => labels[reason]).join(", ")}
            {!warning.excluded && (
              <span>
                {t.needsYou.committed}
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
