// SPDX-License-Identifier: Apache-2.0
import { AgentAuthenticationError } from "./authentication.js";
import { prepareAgent, type AgentPreparationOptions, type PreparedAgent } from "./adapter-cache.js";
import { createAgentLauncher, type AgentLauncher } from "./index.js";
import { claudeProfile, codexProfile } from "./profiles.js";

// Explicit stint-start handshake. This API never sends a prompt or invokes authentication.
export async function prepareAgentForStint(
  options: AgentPreparationOptions,
  launch?: AgentLauncher,
): Promise<PreparedAgent> {
  let prepared = await prepareAgent(options);
  options.signal?.throwIfAborted();
  if (prepared.source !== "installed") return prepared;
  const profile = options.agent === "claude" ? claudeProfile : codexProfile;
  const handshake = (
    launch ??
    createAgentLauncher(() => {
      throw new Error("A prepared adapter is required.");
    }, profile)
  )({
    agent: options.agent,
    cwd: options.cwd,
    env: options.env,
    preparedAgent: prepared,
    prompt: "",
    checkAvailability: true,
    onEvent: () => {},
  });
  void handshake.done.catch(() => {});
  let cancelling: Promise<void> | undefined;
  const cancel = () =>
    (cancelling ??= Promise.resolve()
      .then(() => handshake.cancel())
      .catch(() => {}));
  const onAbort = () => {
    void cancel();
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    options.signal?.throwIfAborted();
    await handshake.done;
    options.signal?.throwIfAborted();
  } catch (error) {
    await cancel();
    options.signal?.throwIfAborted();
    // Login, policy and provider failures are not evidence of CLI incompatibility.
    const message = error instanceof Error ? error.message : String(error);
    if (
      error instanceof AgentAuthenticationError ||
      /auth|permission|denied|forbidden|provider|rate.limit|quota|network|connect|fetch|credential|login|sign.in|billing|usage.limit/i.test(
        message,
      ) ||
      !/protocol|method.*(?:not found|unsupported)|invalid (?:request|params|response)|does not offer|exited before|transport closed|took longer/i.test(
        message,
      )
    )
      throw error;
    prepared = await prepareAgent(options, { reason: "handshake failed" });
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
  }
  options.signal?.throwIfAborted();
  return prepared;
}
