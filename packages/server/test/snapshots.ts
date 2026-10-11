// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "@stintwork/core";
import type { RawData, WebSocket } from "ws";

// The 1-second Status-update requirement gets 1 second of scheduler slack under heavy load.
// Only measured ticket-update assertions use this allowance, not snapshot-wait deadlines.
export const liveUpdateLimitMs = 1000 + 1000;

export function nextSnapshot(
  socket: WebSocket,
  predicate: (snapshot: ProjectSnapshot) => boolean = () => true,
  deadlineMs = 10_000,
): Promise<ProjectSnapshot> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => fail(new Error(`No matching snapshot within ${deadlineMs} ms`)),
      deadlineMs,
    );
    function cleanup() {
      clearTimeout(timeout);
      socket.off("message", message);
      socket.off("error", fail);
      socket.off("close", closed);
    }
    function fail(error: Error) {
      cleanup();
      reject(error);
    }
    function closed() {
      fail(new Error("WebSocket closed before a matching snapshot"));
    }
    function message(data: RawData) {
      try {
        const snapshot = JSON.parse(data.toString()) as ProjectSnapshot;
        if (!snapshot || !Array.isArray(snapshot.workItems))
          throw new Error("Expected a project snapshot");
        if (predicate(snapshot)) {
          cleanup();
          resolve(snapshot);
        }
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    }
    socket.on("message", message);
    socket.on("error", fail);
    socket.on("close", closed);
  });
}
