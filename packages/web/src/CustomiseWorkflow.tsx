// SPDX-License-Identifier: Apache-2.0

import { builtInWorkflows, type AgentProfile } from "@stintwork/core";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { agentName } from "./agent-name";
import { en } from "./i18n/en";
import { CoreTextError, readResponseJson, useErrorText, useLanguage } from "./i18n/language";
import { stageName, workflowName } from "./i18n/workflow-names";
import { AgentAvatar } from "./ui/AgentAvatar";
import { Button } from "./ui/Button";
import { CodeBlock } from "./ui/CodeBlock";
import { Dialog, DialogContent, DialogTitle } from "./ui/Dialog";
import { Item, ItemContent, ItemMedia } from "./ui/Item";
import { Skeleton } from "./ui/Skeleton";
import { StatusChip } from "./ui/StatusChip";

export function CustomiseWorkflow({
  id,
  open,
  onClose,
  onExitComplete,
}: {
  id: string;
  open?: boolean;
  onClose: () => void;
  onExitComplete?: () => void;
}) {
  const { t } = useLanguage();
  const [internalOpen, setInternalOpen] = useState(true);
  const close = () => {
    setInternalOpen(false);
    onClose();
  };
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [preview, setPreview] = useState<{ path: string; yaml: string } | null>(null);
  const [error, setError] = useErrorText();
  const [saving, setSaving] = useState(false);
  const isOpen = open ?? internalOpen;
  const endpoint = `/api/workflows/${encodeURIComponent(id)}/customise`;
  const workflow = builtInWorkflows[id as keyof typeof builtInWorkflows];
  const name = workflow ? workflowName(workflow, t) : id;

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    let disposed = false;
    setPreview(null);
    void fetch("/api/agents", { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        if (!disposed && Array.isArray(data.agents)) setAgents(data.agents);
      })
      .catch(() => {});
    setError("");
    void (async () => {
      try {
        const response = await fetch(`${endpoint}/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          signal: controller.signal,
        });
        const result = await readResponseJson(response);
        if (!response.ok) throw new CoreTextError(result, en.planning.customise.errors.preview);
        if (typeof result.path !== "string" || typeof result.yaml !== "string" || !result.yaml)
          throw new Error(en.planning.customise.errors.invalidPreview);
        if (!disposed) setPreview(result);
      } catch (cause) {
        if (!disposed)
          setError(cause instanceof Error ? cause : en.planning.customise.errors.preview);
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [endpoint, isOpen, setError]);

  async function customise() {
    if (saving || !preview) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await readResponseJson(response);
      if (!response.ok) throw new CoreTextError(result, en.planning.customise.errors.save);
      toast.success(t.actionToast.workflowSaved);
      setSaving(false);
      close();
    } catch (cause) {
      toast.error(t.actionToast.failed);
      setError(cause instanceof Error ? cause : en.planning.customise.errors.save);
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !saving) close();
      }}
    >
      <DialogContent
        onExitComplete={onExitComplete}
        aria-describedby={undefined}
        className="customise-workflow flex flex-col overflow-hidden p-0"
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (saving) event.preventDefault();
        }}
      >
        <DialogTitle className="shrink-0 px-6 pt-6 text-xl font-medium">
          {t.planning.customise.title(name)}
        </DialogTitle>
        <div className="customise-body min-h-0 min-w-0 flex-1 overflow-auto px-6 pt-5">
          <fieldset disabled={saving} className="min-w-0 space-y-4">
            {preview ? (
              <>
                <p>
                  {t.planning.customise.creates}
                  <code>{preview.path}</code>
                  {t.planning.customise.description}
                </p>
                {workflow && (
                  <ol className="space-y-2">
                    {workflow.stages.map((stage, index) => {
                      const agent = stage.agent ?? workflow.defaultAgent;
                      return (
                        <li key={stage.id}>
                          <Item variant="outline">
                            <ItemMedia>
                              <span className="flex size-7 items-center justify-center rounded-full bg-muted">
                                {index + 1}
                              </span>
                            </ItemMedia>
                            <ItemContent>
                              <span>{stageName(workflow, stage, t)}</span>
                              <code>{stage.skill ?? "—"}</code>
                            </ItemContent>
                            <StatusChip status="stopped">
                              {t.planning.customise.gateKinds[stage.gate]}
                            </StatusChip>
                            <AgentAvatar agent={agent} name={agentName(agent, agents)} />
                            <span>{agentName(agent, agents)}</span>
                          </Item>
                        </li>
                      );
                    })}
                  </ol>
                )}
                <section aria-label={t.planning.customise.yaml} className="min-w-0">
                  <CodeBlock className="max-h-[50dvh] overflow-auto rounded-xl border border-border bg-muted p-3 text-sm focus-visible:outline-ring">
                    <code>{preview.yaml}</code>
                  </CodeBlock>
                </section>
                <p className="muted text-muted-foreground">{t.planning.customise.commit(id)}</p>
              </>
            ) : (
              <p role="status">
                {error ? t.planning.customise.unavailable : t.planning.customise.loading}
                {!error && <Skeleton aria-hidden="true" className="mt-3 h-24 w-full" />}
              </p>
            )}
            {error && (
              <p role="alert" className="warning text-attention-foreground">
                {Object.entries(en.planning.customise.errors).reduce(
                  (message, [key, original]) =>
                    message === original
                      ? t.planning.customise.errors[
                          key as keyof typeof en.planning.customise.errors
                        ]
                      : message,
                  error,
                )}
              </p>
            )}
          </fieldset>
        </div>
        <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-border bg-card px-6 py-4">
          <Button disabled={saving} onClick={close}>
            {t.planning.customise.cancel}
          </Button>
          <Button variant="primary" disabled={!preview || saving} onClick={() => void customise()}>
            {saving ? t.planning.customise.saving : t.planning.customise.confirm}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
