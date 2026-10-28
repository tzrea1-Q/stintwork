// SPDX-License-Identifier: Apache-2.0
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";

export type GhReply = { stdout?: unknown; code?: number; effect?: string };

export async function fakeGh(directory: string) {
  await mkdir(directory, { recursive: true });
  const script = join(directory, "script.json");
  const log = join(directory, "calls.jsonl");
  await writeFile(log, "");
  await writeFile(
    join(directory, "gh"),
    `#!${process.execPath}
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, cwd: process.cwd() }) + '\\n');
const script = ${JSON.stringify(script)};
const replies = JSON.parse(fs.readFileSync(script, 'utf8'));
const key = args.slice(0, 2).join(' ');
const reply = replies[key];
if (!reply) { console.error('Unscripted gh invocation: ' + args.join(' ')); process.exit(99); }
const next = Array.isArray(reply) ? (reply.length > 1 ? reply.shift() : reply[0]) : reply;
if (Array.isArray(reply)) fs.writeFileSync(script, JSON.stringify(replies));
if (next.effect) new Function('execFileSync', 'args', 'fs', 'script', next.effect)(execFileSync, args, fs, script);
process.stdout.write(typeof next.stdout === 'string' ? next.stdout : JSON.stringify(next.stdout ?? {}));
process.exit(next.code ?? 0);
`,
    { mode: 0o755 },
  );
  return {
    path: `${directory}${delimiter}${process.env.PATH}`,
    script: (replies: Record<string, GhReply | GhReply[]>) =>
      writeFile(script, JSON.stringify(replies)),
    calls: async (): Promise<{ args: string[]; cwd: string }[]> =>
      (await readFile(log, "utf8"))
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
  };
}
