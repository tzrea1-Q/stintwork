import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, dirname, relative, resolve, delimiter } from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import type { RequestPermissionRequest, RequestPermissionResponse } from "@agentclientprotocol/sdk";
import type { StintEvent, StintLogEvent } from "@stintwork/core";
import { toAcpReadable } from "./stdio.js";

export type AgentStintOptions = {
  agent: string;
  cwd: string;
  prompt: string;
  onEvent: (event: StintLogEvent) => void;
  onPermission?: (request: RequestPermissionRequest) => Promise<RequestPermissionResponse>;
};
export type AgentStint = { done: Promise<{ stopReason: string }>; cancel: () => Promise<void> };
export type AgentLauncher = (options: AgentStintOptions) => AgentStint;
export type AdapterLauncher = (cwd: string) => ChildProcessWithoutNullStreams;

export function createAgentLauncher(launchAdapter: AdapterLauncher): AgentLauncher {
  return ({ agent, cwd, prompt, onEvent, onPermission }) => {
    let child: ChildProcessWithoutNullStreams | undefined;
    let connection: import("@agentclientprotocol/sdk").ClientSideConnection | undefined;
    let acpId: string | undefined;
    let cancelled = false;
    let settled = false;
    let rejectFailure: (error: Error) => void = () => {};
    const failure = new Promise<never>((_resolve, reject) => {
      rejectFailure = reject;
    });
    void failure.catch(() => {});
    let chunk: { type: "message_delta" | "thought_delta"; id: string } | undefined;
    let nextMessage = 0;

    async function safePath(path: string) {
      if (!isAbsolute(path)) throw new Error("Agent file paths must be absolute.");
      const root = await realpath(cwd);
      const target = resolve(path);
      let existing = target;
      while (
        !(await lstat(existing).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
          return undefined;
        }))
      )
        existing = dirname(existing);
      for (const [base, candidate] of [
        [resolve(cwd), target],
        [root, await realpath(existing)],
      ]) {
        const inside = relative(base, candidate);
        if (inside === ".." || inside.startsWith("../") || isAbsolute(inside))
          throw new Error("Agent file path is outside the worktree.");
      }
      return target;
    }

    const done = (async () => {
      if (agent !== "codex") throw new Error("Only Codex is available in M2.");
      const { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } = await import(
        "@agentclientprotocol/sdk"
      );
      if (cancelled) return { stopReason: "cancelled" };
      child = launchAdapter(cwd);
      const fail = (error: Error) => {
        if (!settled) rejectFailure(error);
      };
      child.on("error", (error: NodeJS.ErrnoException) =>
        fail(
          error.code === "ENOENT"
            ? new Error(
                "Codex adapter not found. Install @agentclientprotocol/codex-acp@2.1.1 and sign in with codex login.",
              )
            : error,
        ),
      );
      child.on("exit", (code, signal) =>
        fail(new Error(`Codex exited before the stint ended (${code ?? signal}).`)),
      );
      child.stdin.on("error", fail);
      child.stdout.on("error", fail);
      child.stderr.resume();
      const acp = new ClientSideConnection(
        () => ({
          async sessionUpdate({ update }) {
            try {
              const kind = update.sessionUpdate;
              if (
                (kind === "agent_message_chunk" || kind === "agent_thought_chunk") &&
                update.content.type === "text"
              ) {
                const type = kind === "agent_message_chunk" ? "message_delta" : "thought_delta";
                chunk = chunk?.type === type ? chunk : { type, id: String(++nextMessage) };
                onEvent({ ...chunk, text: update.content.text });
              } else {
                chunk = undefined;
                onEvent({ type: "other", kind, update: { ...update } });
              }
            } catch (error) {
              fail(error instanceof Error ? error : new Error(String(error)));
            }
          },
          async requestPermission(request) {
            const event: Extract<StintEvent, { type: "permission" }> = {
              type: "permission",
              toolCallId: request.toolCall.toolCallId,
              title: request.toolCall.title ?? null,
              kind: request.toolCall.kind ?? null,
              automatic: !onPermission,
              decision: { outcome: "failed", reason: "Permission could not be decided." },
            };
            let response: RequestPermissionResponse;
            try {
              if (onPermission) response = await onPermission(request);
              else {
                const rejected =
                  request.options.find((option) => option.kind === "reject_once") ??
                  request.options.find((option) => option.kind.startsWith("reject"));
                if (!rejected) throw new Error("Agent permission request has no reject option.");
                response = { outcome: { outcome: "selected", optionId: rejected.optionId } };
              }
              if (response.outcome.outcome === "selected") {
                const optionId = response.outcome.optionId;
                const selected = request.options.find((option) => option.optionId === optionId);
                if (!selected)
                  throw new Error("Permission decision must select an offered option.");
                event.decision = { outcome: "selected", optionId, kind: selected.kind };
              } else event.decision = { outcome: "cancelled" };
            } catch (error) {
              const failure = error instanceof Error ? error : new Error(String(error));
              event.decision = { outcome: "failed", reason: failure.message };
              onEvent(event);
              fail(failure);
              throw failure;
            }
            try {
              onEvent(event);
            } catch (error) {
              fail(error instanceof Error ? error : new Error(String(error)));
              throw error;
            }
            return response;
          },
          async readTextFile({ path, line, limit }) {
            if (line != null && (!Number.isInteger(line) || line < 1))
              throw new Error("line must be positive");
            if (limit != null && (!Number.isInteger(limit) || limit < 0))
              throw new Error("limit must be non-negative");
            const content = await readFile(await safePath(path), "utf8");
            if (line == null && limit == null) return { content };
            const start = (line ?? 1) - 1;
            return {
              content: (content.match(/[^\n]*\n|[^\n]+$/g) ?? [])
                .slice(start, limit == null ? undefined : start + limit)
                .join(""),
            };
          },
          async writeTextFile({ path, content }) {
            const target = await safePath(path);
            await mkdir(dirname(target), { recursive: true });
            await writeFile(target, content, "utf8");
            return {};
          },
        }),
        ndJsonStream(Writable.toWeb(child.stdin), toAcpReadable(child.stdout)),
      );
      connection = acp;
      void acp.closed.then(
        () => fail(new Error("Codex ACP transport closed before the stint ended.")),
        fail,
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const ready = (async () => {
          await acp.initialize({
            protocolVersion: PROTOCOL_VERSION,
            clientCapabilities: {
              fs: { readTextFile: true, writeTextFile: true },
              terminal: false,
            },
            clientInfo: { name: "stintwork", version: "0.0.0" },
          });
          const opened = await acp.newSession({ cwd, mcpServers: [] });
          acpId = opened.sessionId;
          await acp.setSessionMode({ sessionId: acpId, modeId: "workspace-write" });
        })();
        const timeout = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("Codex did not become ready within 15 seconds.")),
            15_000,
          );
        });
        await Promise.race([ready, failure, timeout]);
        clearTimeout(timer);
        if (cancelled) return { stopReason: "cancelled" };
        return await Promise.race([
          acp.prompt({
            sessionId: acpId as string,
            prompt: [{ type: "text", text: prompt }],
          }),
          failure,
        ]);
      } catch (error) {
        if (cancelled) return { stopReason: "cancelled" };
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          message.includes("Authentication required")
            ? "Codex authentication required. Sign in with codex login, then start another stint."
            : message,
        );
      } finally {
        clearTimeout(timer);
        settled = true;
        child.kill("SIGTERM");
        const killTimer = setTimeout(() => child?.kill("SIGKILL"), 300);
        killTimer.unref();
        child.once("exit", () => clearTimeout(killTimer));
        child.stdin.destroy();
        child.stdout.destroy();
      }
    })();
    return {
      done,
      async cancel() {
        cancelled = true;
        if (connection && acpId) {
          await Promise.race([
            connection.cancel({ sessionId: acpId }).catch(() => {}),
            new Promise<void>((resolveCancel) => setTimeout(resolveCancel, 100)),
          ]);
        }
        rejectFailure(new Error("Stint cancelled."));
      },
    };
  };
}

export const startAgentStint: AgentLauncher = createAgentLauncher((cwd) =>
  spawn("codex-acp", [], {
    cwd,
    stdio: "pipe",
    env: {
      ...process.env,
      PATH: `${fileURLToPath(new URL("../node_modules/.bin", import.meta.url))}${delimiter}${process.env.PATH ?? ""}`,
    },
  }),
);
