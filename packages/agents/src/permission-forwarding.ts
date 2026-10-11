// SPDX-License-Identifier: Apache-2.0
import type { RequestPermissionResponse, Stream } from "@agentclientprotocol/sdk";

export function createPermissionForwarding(stream: Stream) {
  type Receipt = ReturnType<typeof prepare>;
  const waiting = new Set<Receipt>();
  const responses = new Map<RequestPermissionResponse, Receipt>();
  const writer = stream.writable.getWriter();

  function prepare() {
    let delivered: () => void = () => {};
    let failed: (error: Error) => void = () => {};
    const forwarded = new Promise<void>((resolve, reject) => {
      delivered = resolve;
      failed = reject;
    });
    void forwarded.catch(() => {});
    const receipt = {
      forwarded,
      respond(response: RequestPermissionResponse) {
        responses.set(response, receipt);
      },
      delivered() {
        waiting.delete(receipt);
        delivered();
      },
      failed(error: Error) {
        waiting.delete(receipt);
        failed(error);
      },
    };
    waiting.add(receipt);
    return receipt;
  }

  return {
    prepare,
    close(error: Error) {
      for (const receipt of waiting) receipt.failed(error);
      responses.clear();
    },
    stream: {
      readable: stream.readable,
      writable: new WritableStream({
        async write(message) {
          const response = "result" in message ? message.result : undefined;
          const receipt = responses.get(response as RequestPermissionResponse);
          try {
            await writer.write(message);
            receipt?.delivered();
          } catch (error) {
            receipt?.failed(error instanceof Error ? error : new Error(String(error)));
            throw error;
          } finally {
            responses.delete(response as RequestPermissionResponse);
          }
        },
      }),
    } satisfies Stream,
  };
}
