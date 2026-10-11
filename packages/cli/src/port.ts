// SPDX-License-Identifier: Apache-2.0
import type { Server } from "node:net";

export async function listenOnAvailablePort(server: Server, preferredPort = 4317): Promise<number> {
  if (!Number.isInteger(preferredPort) || preferredPort < 1 || preferredPort > 65535) {
    throw new RangeError("Port must be an integer between 1 and 65535.");
  }

  for (let port = preferredPort; port <= 65535; port += 1) {
    try {
      await new Promise<void>((resolve, reject) => {
        function onError(error: NodeJS.ErrnoException) {
          server.off("listening", onListening);
          reject(error);
        }
        function onListening() {
          server.off("error", onError);
          resolve();
        }
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, "127.0.0.1");
      });
      return port;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") {
        throw error;
      }
    }
  }

  throw new Error(`No free port between ${preferredPort} and 65535.`);
}
