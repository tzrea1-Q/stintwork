// SPDX-License-Identifier: Apache-2.0
import { AgentAuthenticationError } from "./authentication.js";
import {
  prepareAgent,
  preparedAgentEnvironment,
  InstalledAgentInitializationError,
  isHandshakeIncompatibility,
  type AgentPreparationOptions,
  type PreparedAgent,
} from "./adapter-cache.js";
import { createAgentLauncher, type AgentLauncher } from "./index.js";
import { claudeProfile, codexProfile } from "./profiles.js";

// Explicit stint-start handshake. This API never sends a prompt or invokes authentication.
export async function prepareAgentForStint(
  options: AgentPreparationOptions,
  launch?: AgentLauncher,
): Promise<PreparedAgent> {
  let prepared: PreparedAgent;
  try {
    prepared = await prepareAgent(options);
  } catch (error) {
    options.signal?.throwIfAborted();
    if (!(error instanceof InstalledAgentInitializationError)) throw error;
    prepared = await prepareAgent(options, { reason: "handshake failed" });
  }
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
    env: preparedAgentEnvironment(prepared, options.env),
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
    if (error instanceof AgentAuthenticationError || !isHandshakeIncompatibility(error))
      throw error;
    prepared = await prepareAgent(options, { reason: "handshake failed" });
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
  }
  options.signal?.throwIfAborted();
  return prepared;
}
