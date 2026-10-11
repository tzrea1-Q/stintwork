// SPDX-License-Identifier: Apache-2.0
import type { RequestPermissionResponse, Stream } from "@agentclientprotocol/sdk";
import { expect, test } from "vitest";
import { createPermissionForwarding } from "./permission-forwarding.js";

const response: RequestPermissionResponse = { outcome: { outcome: "selected", optionId: "allow" } };

test("permission delivery waits for the matching ACP response's transport write", async () => {
  let finishWrite: () => void = () => {};
  let writing = false;
  const stream: Stream = {
    readable: new ReadableStream(),
    writable: new WritableStream({
      write() {
        writing = true;
        return new Promise<void>((resolve) => {
          finishWrite = resolve;
        });
      },
    }),
  };
  const forwarding = createPermissionForwarding(stream);
  const receipt = forwarding.prepare();
  receipt.respond(response);
  let delivered = false;
  void receipt.forwarded.then(() => {
    delivered = true;
  });
  const writer = forwarding.stream.writable.getWriter();
  const unrelated = writer.write({ jsonrpc: "2.0", id: 1, result: {} });
  await expect.poll(() => writing).toBe(true);
  finishWrite();
  await unrelated;
  expect(delivered).toBe(false);
  writing = false;
  const selected = writer.write({ jsonrpc: "2.0", id: 2, result: response });
  await expect.poll(() => writing).toBe(true);
  expect(delivered).toBe(false);
  finishWrite();
  await selected;
  await receipt.forwarded;
  expect(delivered).toBe(true);
});

test("a failed transport write rejects the permission delivery receipt", async () => {
  const forwarding = createPermissionForwarding({
    readable: new ReadableStream(),
    writable: new WritableStream({
      write() {
        throw new Error("Agent pipe is closed.");
      },
    }),
  });
  const receipt = forwarding.prepare();
  receipt.respond(response);
  await expect(
    forwarding.stream.writable.getWriter().write({ jsonrpc: "2.0", id: 1, result: response }),
  ).rejects.toThrow("Agent pipe is closed.");
  await expect(receipt.forwarded).rejects.toThrow("Agent pipe is closed.");
});

test("ending the transport rejects unanswered and unwritten permission receipts", async () => {
  const forwarding = createPermissionForwarding({
    readable: new ReadableStream(),
    writable: new WritableStream(),
  });
  const unanswered = forwarding.prepare();
  const unwritten = forwarding.prepare();
  unwritten.respond(response);
  forwarding.close(new Error("The stint ended."));
  await expect(unanswered.forwarded).rejects.toThrow("The stint ended.");
  await expect(unwritten.forwarded).rejects.toThrow("The stint ended.");
});
