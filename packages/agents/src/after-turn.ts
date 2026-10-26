// SPDX-License-Identifier: Apache-2.0
export type AfterTurnRequest = {
  name: string;
  prompt: string;
  parse: (text: string) => unknown | null;
  resultField: string;
  errorField: string;
  rawReplyField?: string;
  parseError: string;
};

export function joinAfterTurnMessages(messages: readonly string[]): string {
  return messages
    .map((message, index) =>
      index > 0 && message.startsWith("#") && !messages[index - 1].endsWith("\n")
        ? `\n${message}`
        : message,
    )
    .join("");
}

export async function collectAfterTurnRequests(
  requests: readonly AfterTurnRequest[],
  options: {
    timeoutMs: number;
    prompt: (text: string) => Promise<string>;
    failure: Promise<never>;
    signal?: AbortSignal;
    retryAfterCancel: () => boolean;
    cancel: () => Promise<void>;
    onRequest?: (request: AfterTurnRequest, results: Readonly<Record<string, unknown>>) => void;
    onResult?: (request: AfterTurnRequest, results: Readonly<Record<string, unknown>>) => void;
  },
): Promise<Record<string, unknown>> {
  options.signal?.throwIfAborted();
  const results: Record<string, unknown> = {};
  if (!requests.length) return results;
  let rejectAbort: (reason: unknown) => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => rejectAbort(options.signal?.reason);
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const failure = Promise.race([options.failure, aborted]);
  void failure.catch(() => {});
  const deadline = performance.now() + options.timeoutMs;
  let current = requests[0];
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      expired = true;
      reject(new Error(`${current.name} timed out.`));
    }, options.timeoutMs);
  });
  void timeout.catch(() => {});
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    for (const request of requests) {
      options.signal?.throwIfAborted();
      current = request;
      options.onRequest?.(request, results);
      results[request.resultField] = null;
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          options.signal?.throwIfAborted();
          if (expired || performance.now() >= deadline)
            throw new Error(`${request.name} timed out.`);
          try {
            const text = await Promise.race([options.prompt(request.prompt), failure, timeout]);
            if (request.rawReplyField) results[request.rawReplyField] = text;
            const parsed = request.parse(text);
            results[request.resultField] = parsed;
            if (parsed === null) results[request.errorField] = request.parseError;
            break;
          } catch (error) {
            const backoffMs = 500 * 2 ** attempt;
            if (
              !options.retryAfterCancel() ||
              expired ||
              attempt === 2 ||
              performance.now() + backoffMs >= deadline
            )
              throw error;
            await Promise.race([
              new Promise<void>((resolveRetry) => {
                retryTimer = setTimeout(resolveRetry, backoffMs);
              }),
              failure,
              timeout,
            ]);
          }
        }
      } catch (error) {
        options.signal?.throwIfAborted();
        results[request.resultField] = null;
        results[request.errorField] =
          (error instanceof Error ? error.message : String(error)) ||
          `${request.name} request failed.`;
        await options.cancel();
      } finally {
        clearTimeout(retryTimer);
      }
      options.signal?.throwIfAborted();
      // Persistence failures must escape the request/retry handler and stop later prompts.
      options.onResult?.(request, results);
    }
    return results;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
