// SPDX-License-Identifier: Apache-2.0
import { gateReadiness, type WorkflowDefinitions } from "@stintwork/core";
import { useGateAction } from "./GateView";
import { translateCoreText, useLanguage } from "./i18n/language";
import { stageName } from "./i18n/workflow-names";
import { Button } from "./ui/Button";
import { SegmentedProgress } from "./ui/SegmentedProgress";
import type { BoardWorkItem } from "./WorkItemCard";

export function GateSummary({
  item,
  workflows,
  onOpen,
  onSuccess,
}: {
  item: BoardWorkItem;
  workflows: WorkflowDefinitions;
  onOpen: () => void;
  onSuccess?: () => void;
}) {
  const { t } = useLanguage();
  const { saving, message, error, refreshNeeded, act } = useGateAction(
    item,
    workflows,
    false,
    onSuccess,
  );
  const gate = gateReadiness(item, workflows);
  const stage = workflows[item.workflow].stages.find(({ id }) => id === item.stage);
  if (!stage) return null;
  const name = stageName(workflows[item.workflow], stage, t);
  const met = gate.conditions.filter((condition) => condition.ready).length;
  return (
    <section className="my-3 space-y-2">
      <h4 className="font-semibold">{name}</h4>
      <p>{t.needsYou.conditionsMet(met, gate.conditions.length)}</p>
      <SegmentedProgress
        value={met}
        total={gate.conditions.length}
        label={t.stints.gateConditions(name)}
      />
      <ul>
        {gate.conditions
          .filter((condition) => !condition.ready)
          .map((condition) => (
            <li key={condition.id}>
              <strong>{translateCoreText(condition.label, t)}</strong> ·{" "}
              {translateCoreText(condition.action, t)}
            </li>
          ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {gate.nextStage && (
          <Button
            variant="primary"
            aria-busy={saving}
            disabled={
              !gate.ready ||
              saving ||
              !!message ||
              refreshNeeded ||
              (!!item.github && !(item.github.reviewDigest && item.github.reviewHead))
            }
            onClick={() => void act(stage.id, "approve")}
          >
            {t.stints.approve(name)}
            {saving && <span aria-hidden="true"> · {t.stints.approving}</span>}
          </Button>
        )}
        <Button onClick={onOpen}>{t.needsYou.openGate}</Button>
      </div>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="text-attention-foreground">
          {error}
        </p>
      )}
    </section>
  );
}
