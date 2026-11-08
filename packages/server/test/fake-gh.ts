// SPDX-License-Identifier: Apache-2.0
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";

export type GhReply = { stdout?: unknown; code?: number; effect?: string };

export async function fakeGh(directory: string, beforePublish = "", beforeRead = "") {
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
${beforeRead}
const lock = script + '.lock';
const temporaryLock = lock + '.' + process.pid;
fs.writeFileSync(temporaryLock, JSON.stringify({ pid: process.pid, time: Date.now() }));
const deadline = Date.now() + 15000;
while (true) {
  try {
    fs.linkSync(temporaryLock, lock);
    fs.unlinkSync(temporaryLock);
    break;
  }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    try {
      const stat = fs.statSync(lock);
      let owner;
      try { owner = JSON.parse(fs.readFileSync(lock, 'utf8')); } catch {}
      const valid = Number.isSafeInteger(owner?.pid) && owner.pid > 0 && Number.isFinite(owner.time);
      // ponytail: assumes fake gh critical sections finish within 10 seconds; use a renewable lease if they grow longer.
      let stale = Date.now() - stat.mtimeMs > (valid ? 10000 : 1000);
      if (valid && !stale) {
        try { process.kill(owner.pid, 0); }
        catch (error) { if (error.code === 'ESRCH') stale = true; else if (error.code !== 'EPERM') throw error; }
      }
      if (stale) {
        const retired = lock + '.stale.' + process.pid;
        fs.renameSync(lock, retired);
        const moved = fs.statSync(retired);
        if (moved.ino !== stat.ino || moved.dev !== stat.dev) {
          try { fs.linkSync(retired, lock); } catch (error) { if (error.code !== 'EEXIST') throw error; }
        }
        fs.unlinkSync(retired);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (Date.now() >= deadline) { fs.unlinkSync(temporaryLock); throw new Error('Timed out waiting for fake gh lock'); }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
}
let next;
try {
const replies = JSON.parse(fs.readFileSync(script, 'utf8'));
const key = args.slice(0, 2).join(' ');
const reply = replies[key];
if (!reply) throw new Error('Unscripted gh invocation: ' + args.join(' '));
next = Array.isArray(reply) ? (reply.length > 1 ? reply.shift() : reply[0]) : reply;
if (Array.isArray(reply)) {
  const temporary = script + '.' + process.pid;
  fs.writeFileSync(temporary, JSON.stringify(replies));
  ${beforePublish}
  fs.renameSync(temporary, script);
}
} finally {
  fs.unlinkSync(lock);
}
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
