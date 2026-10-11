// SPDX-License-Identifier: Apache-2.0
import { Readable } from "node:stream";
import type { ndJsonStream } from "@agentclientprotocol/sdk";

type AcpReadable = Parameters<typeof ndJsonStream>[1];

export function toAcpReadable(input: Readable): AcpReadable {
  // Stdio emits Buffer (Uint8Array) bytes; Node and DOM disagree on the Web reader's done-result type.
  return Readable.toWeb(input) as unknown as AcpReadable;
}
