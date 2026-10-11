// SPDX-License-Identifier: Apache-2.0
import { EventEmitter } from "node:events";
import { afterEach, expect, test, vi } from "vitest";
import type { WebSocket } from "ws";
import { nextSnapshot } from "./snapshots.js";

afterEach(() => vi.useRealTimers());

function socketFixture() {
  vi.useFakeTimers();
  return new EventEmitter() as WebSocket;
}

function expectCleanedUp(socket: WebSocket) {
  expect(socket.listenerCount("message")).toBe(0);
  expect(socket.listenerCount("error")).toBe(0);
  expect(socket.listenerCount("close")).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
}

test("snapshot waiting tolerates delayed and nonmatching frames, then resolves immediately", async () => {
  const socket = socketFixture();
  const update = nextSnapshot(socket, (snapshot) => snapshot.workItems.length === 0);
  socket.emit("message", Buffer.from(JSON.stringify({ workItems: [{ slug: "old" }] })));
  await vi.advanceTimersByTimeAsync(1500);
  expect(socket.listenerCount("message")).toBe(1);
  socket.emit("message", Buffer.from(JSON.stringify({ workItems: [] })));
  await expect(update).resolves.toEqual({ workItems: [] });
  expectCleanedUp(socket);
});

test("snapshot waiting rejects wrong data after its default 10-second deadline", async () => {
  const socket = socketFixture();
  const update = nextSnapshot(socket, () => false);
  const rejected = expect(update).rejects.toThrow("No matching snapshot within 10000 ms");
  socket.emit("message", Buffer.from(JSON.stringify({ workItems: [] })));
  await vi.advanceTimersByTimeAsync(9999);
  expect(socket.listenerCount("message")).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  await rejected;
  expectCleanedUp(socket);
});

test("snapshot waiting honors an explicit deadline", async () => {
  const socket = socketFixture();
  const update = nextSnapshot(socket, () => true, 50);
  const rejected = expect(update).rejects.toThrow("No matching snapshot within 50 ms");
  await vi.advanceTimersByTimeAsync(50);
  await rejected;
  expectCleanedUp(socket);
});

test.each(["error", "close", "invalid JSON", "invalid snapshot", "predicate error"])(
  "snapshot waiting fails immediately and cleans up on %s",
  async (failure) => {
    const socket = socketFixture();
    const update = nextSnapshot(socket, () => {
      throw new Error("Predicate failed");
    });
    const rejected = expect(update).rejects.toThrow();
    if (failure === "error") socket.emit("error", new Error("Socket failed"));
    else if (failure === "close") socket.emit("close");
    else
      socket.emit(
        "message",
        Buffer.from(
          failure === "invalid JSON"
            ? "{"
            : JSON.stringify(failure === "invalid snapshot" ? {} : { workItems: [] }),
        ),
      );
    await rejected;
    expectCleanedUp(socket);
  },
);
