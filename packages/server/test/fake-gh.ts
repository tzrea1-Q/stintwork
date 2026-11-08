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
const deadline = Date.now() + 10000;
while (true) {
  try {
    fs.mkdirSync(lock);
    fs.writeFileSync(lock + '/owner', String(process.pid));
    break;
  }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    try {
      const owner = Number(fs.readFileSync(lock + '/owner', 'utf8'));
      if (Number.isSafeInteger(owner) && owner > 0) {
        try { process.kill(owner, 0); }
        catch (error) {
          if (error.code !== 'ESRCH') throw error;
          // Only one waiter may move a dead owner's lock out of the way.
          const claim = lock + '/reaping';
          let claimed = false;
          try {
            fs.mkdirSync(claim);
            claimed = true;
            if (fs.readFileSync(lock + '/owner', 'utf8') === String(owner)) {
              const stale = lock + '.' + process.pid;
              fs.renameSync(lock, stale);
              fs.rmSync(stale, { recursive: true, force: true });
            } else {
              fs.rmdirSync(claim);
            }
          } catch (error) {
            if (claimed) {
              try { fs.rmdirSync(claim); } catch (cleanup) { if (cleanup.code !== 'ENOENT') throw cleanup; }
            }
            if (error.code !== 'EEXIST' && error.code !== 'ENOENT') throw error;
          }
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (Date.now() >= deadline) throw new Error('Timed out waiting for fake gh lock');
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
  fs.unlinkSync(lock + '/owner');
  while (true) {
    try { fs.rmdirSync(lock); break; }
    catch (error) {
      if (error.code !== 'ENOTEMPTY' && error.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) throw new Error('Timed out releasing fake gh lock');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
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
