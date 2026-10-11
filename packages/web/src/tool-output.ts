// SPDX-License-Identifier: Apache-2.0
export function readableToolOutput(text: string): string {
  try {
    const value: unknown = JSON.parse(text);
    if (
      value &&
      typeof value === "object" &&
      "output" in value &&
      Array.isArray(value.output) &&
      value.output.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    ) {
      const { output, ...metadata } = value;
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(output));
      return Object.keys(metadata).length
        ? `${decoded}\n${JSON.stringify(metadata, null, 2)}`
        : decoded;
    }
  } catch {}
  return text;
}
