// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  agentPackageUrl,
  boardResult,
  budgetFailures,
  cleanEnvironment,
  comparableBaseline,
  compareResults,
  countTunnel,
  failedRun,
  networkSnapshot,
  npmProxyEnvironment,
  preparationFailures,
  preparationResult,
  trackSocket,
  tunnelDestination,
} from "./measurement.mjs";

const request = {
  url: "https://registry.npmjs.org/stintwork",
  responseBodyBytes: 123,
  complete: true,
};
const network = () => networkSnapshot([request], [{ sentBytes: 40, receivedBytes: 200 }]);
const board = (changes = {}) => ({
  ...boardResult({
    installMs: 10_000,
    processStartedMs: 10_100,
    readyMs: 11_000,
    network: network(),
    agentCacheEmpty: true,
  }),
  ...changes,
});

test("result shaping separates elapsed clocks, bodies, TLS bytes and local transfer", () => {
  const result = boardResult({
    installMs: 200,
    processStartedMs: 250,
    readyMs: 700,
    network: network(),
    localTarballBytes: 500,
    agentCacheEmpty: true,
    screenshot: "board.png",
  });
  assert.equal(result.installMs, 200);
  assert.equal(result.processStartToUsableMs, 450);
  assert.equal(result.installStartToUsableMs, 700);
  assert.equal(result.budgetBytes, 623);
  assert.deepEqual(result.localTarballTransfer, {
    excludedFromElapsed: true,
    bytesAddedToBudget: 500,
    publicTransferMs: null,
  });
  assert.equal(result.network.requestCount, 1);
  assert.equal(result.network.connectCount, 1);
  assert.equal(result.network.tunnelReceivedBytes, 200);
  assert.match(result.network.accounting, /TLS/);
  assert.equal(result.screenshot, "board.png");
});

test("budget boundaries are inclusive and every independent failure is reported", () => {
  assert.deepEqual(
    budgetFailures(
      board({ installStartToUsableMs: 60_000, budgetBytes: 10 * 1024 * 1024 }),
      100 * 1024 * 1024,
    ),
    [],
  );
  const failures = budgetFailures(
    board({
      installStartToUsableMs: 60_001,
      budgetBytes: 10 * 1024 * 1024 + 1,
      agentCacheEmpty: false,
      agentPackageRequests: [request],
    }),
    100 * 1024 * 1024,
  );
  assert.equal(failures.length, 5);
  for (const bytes of [-1, NaN, undefined])
    assert(budgetFailures(board({ budgetBytes: bytes })).length);
  assert(budgetFailures(board({ installStartToUsableMs: undefined })).length);
  assert(budgetFailures(board(), 0).length);
  assert(
    budgetFailures(board({ network: { requests: [{ ...request, complete: false }] } })).length,
  );
});

test("baseline uses the smallest comparable complete measured run, including a failed baseline budget", () => {
  const metadata = {
    environment: { os: "darwin", arch: "arm64", node: "v22", npm: "10" },
    registry: "https://registry.npmjs.org",
    conditions: "same host/network",
    transport: "proxy",
  };
  const baseline = {
    kind: "first-run",
    schemaVersion: 1,
    requestedRuns: 2,
    finishedAt: "2026-10-17T00:00:00Z",
    ...metadata,
    runs: [board({ budgetBytes: 2000, failures: ["over budget"] }), board({ budgetBytes: 1000 })],
  };
  assert.deepEqual(comparableBaseline(baseline, metadata), {
    budgetBytes: 1000,
    completedRuns: 2,
    failedRuns: 0,
    totalRuns: 2,
  });
  assert.throws(
    () => comparableBaseline(baseline, { ...metadata, conditions: "different" }),
    /conditions/,
  );
  assert.throws(
    () => comparableBaseline({ ...baseline, runs: [{ error: "failed" }] }, metadata),
    /No baseline run completed/,
  );
  assert.equal(
    comparableBaseline({ ...baseline, runs: [board(), { error: "failed" }] }, metadata).failedRuns,
    1,
  );
});

const metadata = {
  kind: "first-run",
  schemaVersion: 1,
  requestedRuns: 3,
  environment: { os: "darwin", arch: "arm64", node: "v22", npm: "10" },
  registry: "https://registry.npmjs.org",
  conditions: "same host/network",
  transport: "proxy",
};
const failed = () => ({
  index: 1,
  error: "npm error ECONNRESET",
  elapsedOnFailureMs: 1_800_000,
  network: networkSnapshot([{ ...request, responseBodyBytes: 253_000_000, complete: false }], []),
});
const mixedBaseline = () => ({
  ...metadata,
  finishedAt: "2026-10-17T00:00:00Z",
  runs: [
    failed(),
    { ...failed(), index: 2, status: "failed" },
    board({
      index: 3,
      installStartToUsableMs: 1_347_000,
      budgetBytes: 175_787_982,
      failures: ["over budget"],
    }),
  ],
});

test("a baseline with two failed installs and one completed run remains comparable", () => {
  const baseline = mixedBaseline();
  const before = structuredClone(baseline);
  assert.deepEqual(comparableBaseline(baseline, metadata), {
    budgetBytes: 175_787_982,
    completedRuns: 1,
    failedRuns: 2,
    totalRuns: 3,
  });
  assert.deepEqual(baseline, before);
  assert.throws(
    () => comparableBaseline({ ...baseline, runs: [failed(), failed()] }, metadata),
    /No baseline run completed/,
  );
  const retried = board({
    status: "completed",
    network: networkSnapshot(
      [{ ...request, error: "retried connection reset", complete: false }, request],
      [],
    ),
  });
  assert.equal(comparableBaseline({ ...metadata, runs: [retried] }, metadata).completedRuns, 1);
});

test("failed installs retain status, partial bytes, elapsed time and npm summary without losing the raw error", () => {
  const partial = failed().network;
  const error = Object.assign(new Error("Command failed: npm install\nfull captured output"), {
    code: 1,
    signal: null,
    stderr:
      "npm http fetch GET 200 https://registry.npmjs.org/stintwork\nnpm error code ECONNRESET\nnpm error network connection reset\n",
  });
  const result = failedRun({ index: 1 }, error, partial, 1_800_000, "install");
  assert.equal(result.status, "failed");
  assert.equal(result.network.responseBodyBytes, 253_000_000);
  assert.equal(result.installMs, 1_800_000);
  assert.equal(result.elapsedOnFailureMs, 1_800_000);
  assert.equal(result.error, error.message);
  assert.deepEqual(result.npmError, {
    code: 1,
    signal: null,
    summary: "npm error code ECONNRESET\nnpm error network connection reset",
  });
  assert.deepEqual(result.failures, [error.message]);
  const boardError = failedRun(
    { installMs: 100 },
    new Error("board timeout"),
    partial,
    500,
    "board",
  );
  assert.equal(boardError.installMs, 100);
  assert.equal(boardError.npmError, undefined);
});

test("saved-result comparison recalculates each budget, keeps failed candidates failed and checks all requested runs", () => {
  const candidate = {
    ...metadata,
    runs: [
      board({ index: 1, budgetBytes: 10 * 1024 * 1024 + 1 }),
      { ...failed(), index: 2 },
      board({ index: 3, installStartToUsableMs: 60_001 }),
    ],
  };
  const before = structuredClone(candidate);
  const result = compareResults(candidate, mixedBaseline());
  assert.equal(result.passed, false);
  assert.match(result.runs[0].failures.join(), /10 MiB/);
  assert.equal(result.runs[1].status, "failed");
  assert.match(result.runs[1].failures.join(), /ECONNRESET/);
  assert.match(result.runs[2].failures.join(), /60 s/);
  assert.deepEqual(candidate, before);
  const smallBaseline = { ...metadata, runs: [board({ budgetBytes: 1000 })] };
  assert.match(
    compareResults(
      { ...metadata, requestedRuns: 1, runs: [board({ budgetBytes: 101 })] },
      smallBaseline,
    ).runs[0].failures.join(),
    /10%/,
  );
  assert.equal(compareResults({ ...metadata, runs: [board()] }, mixedBaseline()).passed, false);
});

test("proxy tracking installs one listener set across reused sockets and removes only its listeners on close", () => {
  const socket = new EventEmitter();
  const sockets = new Set();
  const existing = () => {};
  socket.on("error", existing);
  socket.on("close", existing);
  for (let request = 0; request < 5; request++) trackSocket(sockets, socket);
  assert.equal(sockets.size, 1);
  assert.equal(socket.listenerCount("close"), 2);
  assert.equal(socket.listenerCount("error"), 2);
  socket.emit("error", new Error("connection reset"));
  socket.emit("close");
  assert.equal(sockets.size, 0);
  assert.deepEqual(socket.listeners("close"), [existing]);
  assert.deepEqual(socket.listeners("error"), [existing]);
});

test("compare CLI consumes legacy mixed baseline and saved candidate files without changing either", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stintwork-saved-comparison-"));
  try {
    const candidate = join(directory, "candidate.json");
    const baseline = join(directory, "baseline.json");
    await writeFile(
      candidate,
      JSON.stringify({
        ...metadata,
        runs: [1, 2, 3].map((index) => board({ index, failures: ["stale budget failure"] })),
      }),
    );
    await writeFile(baseline, JSON.stringify(mixedBaseline()));
    const before = await Promise.all([candidate, baseline].map((path) => readFile(path, "utf8")));
    const output = execFileSync(
      process.execPath,
      [
        new URL("./measure-first-run.mjs", import.meta.url).pathname,
        "--compare",
        candidate,
        "--baseline",
        baseline,
      ],
      { encoding: "utf8" },
    );
    assert.match(output, /1 completed, 2 failed/);
    for (let index = 1; index <= 3; index++) assert.match(output, new RegExp(`Run ${index}: PASS`));
    assert.match(output, /Overall: PASS/);
    await writeFile(
      candidate,
      JSON.stringify({
        ...metadata,
        requestedRuns: 1,
        runs: [board({ index: 1, budgetBytes: 20 * 1024 * 1024 })],
      }),
    );
    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [
            new URL("./measure-first-run.mjs", import.meta.url).pathname,
            "--compare",
            candidate,
            "--baseline",
            baseline,
          ],
          { encoding: "utf8", stdio: "pipe" },
        ),
      (error) =>
        error.status === 1 &&
        /Run 1: FAIL/.test(error.stdout) &&
        /Overall: FAIL/.test(error.stdout),
    );
    await writeFile(candidate, before[0]);
    assert.deepEqual(
      await Promise.all([candidate, baseline].map((path) => readFile(path, "utf8"))),
      before,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("preparation shaping retains progress even if the worker ends before its final record", () => {
  const progress = { phase: "installing", source: "installed", sinceStartMs: 23 };
  const prefix = `${JSON.stringify({ progress })}\n`;
  assert.deepEqual(preparationResult(prefix), { phases: [progress] });
  assert.deepEqual(
    preparationResult(
      `${prefix}${JSON.stringify({ preparationMs: 90, prepared: { source: "installed", reason: "compatible" } })}\n`,
    ),
    {
      phases: [progress],
      preparationMs: 90,
      prepared: { source: "installed", reason: "compatible" },
    },
  );
  assert.deepEqual(preparationResult(""), { phases: [] });
});

test("measured children cannot inherit real npm settings, proxy bypasses or skipped detection", () => {
  assert.deepEqual(
    cleanEnvironment({
      HOME: "/real-home",
      PATH: "/bin",
      CODEX_PATH: "/cli",
      npm_config_cache: "/real-cache",
      NPM_CONFIG_USERCONFIG: "/real-config",
      HTTPS_PROXY: "external",
      no_proxy: "*",
      NODE_OPTIONS: "--require hook",
      GIT_CONFIG_GLOBAL: "/real-gitconfig",
      STINTWORK_SKIP_AGENT_DETECTION: "1",
    }),
    { HOME: "/real-home", PATH: "/bin", CODEX_PATH: "/cli" },
  );
});

test("first-stint checks preserve source selection and reject warm or wrong-native downloads", () => {
  const cold = {
    temperature: "cold",
    prepared: { source: "installed" },
    phases: [{ phase: "installing" }],
    network: network(),
  };
  assert.deepEqual(preparationFailures(cold, "codex", "auto"), []);
  assert(
    preparationFailures({ ...cold, network: networkSnapshot([], []) }, "codex", "auto").length,
  );
  assert(preparationFailures({ ...cold, temperature: "warm" }, "codex", "auto").length);
  assert.deepEqual(
    preparationFailures(
      { ...cold, temperature: "warm", network: networkSnapshot([], []) },
      "codex",
      "auto",
    ),
    [],
  );
  assert(preparationFailures(cold, "codex", "bundled").length);
  for (const url of [
    "https://registry.npmjs.org/@openai/codex/-/codex-0.159.3-darwin-arm64.tgz",
    "https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-darwin-arm64/-/native.tgz",
  ]) {
    assert(
      preparationFailures(
        { ...cold, network: networkSnapshot([{ ...request, url }], []) },
        "codex",
        "auto",
      ).length,
    );
  }
  const bundled = {
    ...cold,
    prepared: { source: "bundled" },
    network: networkSnapshot(
      [
        {
          ...request,
          url: "https://registry.npmjs.org/@openai/codex/-/codex-0.159.3-darwin-arm64.tgz",
        },
      ],
      [],
    ),
  };
  assert.deepEqual(preparationFailures(bundled, "codex", "bundled"), []);
});

test("provider handshake traffic is separate from registry bytes and warm-cache checks", () => {
  const requests = ["api.anthropic.com", "chatgpt.com", "github.com"].map((host) => ({
    url: `https://${host}:443`,
    responseBodyBytes: 20,
    complete: false,
    error: "CONNECT host refused",
  }));
  const tunnels = [{ authority: "chatgpt.com:443", sentBytes: 30, receivedBytes: 40 }];
  const snapshot = networkSnapshot(requests, tunnels);
  assert.equal(snapshot.requestCount, 0);
  assert.equal(snapshot.responseBodyBytes, 0);
  assert.equal(snapshot.connectCount, 0);
  assert.equal(snapshot.agentTraffic.requestCount, 3);
  assert.equal(snapshot.agentTraffic.responseBodyBytes, 60);
  assert.equal(snapshot.agentTraffic.tunnelReceivedBytes, 40);
  const warm = { temperature: "warm", prepared: { source: "installed" }, network: snapshot };
  assert.deepEqual(preparationFailures(warm, "codex", "auto"), []);
  // Legacy snapshots also contain refused provider requests at the top level.
  assert.deepEqual(
    preparationFailures({ ...warm, network: { requests, requestCount: 3 } }, "codex", "auto"),
    [],
  );
  assert.match(
    preparationFailures(
      {
        ...warm,
        temperature: "cold",
        phases: [{ phase: "installing" }],
        network: snapshot,
      },
      "codex",
      "auto",
    ).join(),
    /Cold installation had no metered requests/,
  );
  assert.match(
    preparationFailures(
      { ...warm, network: networkSnapshot([{ ...request, complete: false }], []) },
      "codex",
      "auto",
    ).join(),
    /Proxy observed incomplete\/blocked traffic/,
  );
  assert.match(
    preparationFailures(
      { ...warm, network: networkSnapshot([...requests, request], tunnels) },
      "codex",
      "auto",
    ).join(),
    /Warm cache made registry requests/,
  );
  const mirror = networkSnapshot(
    [{ ...request, url: "https://mirror.example/package" }, ...requests],
    [],
    "https://mirror.example",
  );
  assert.equal(mirror.requestCount, 1);
  assert.equal(mirror.agentTraffic.requestCount, 3);
  assert.match(
    preparationFailures(
      { ...warm, network: mirror },
      "codex",
      "auto",
      "https://mirror.example",
    ).join(),
    /Warm cache made registry requests/,
  );
});

test("non-registry CONNECT uses the original destination, registry CONNECT uses local interception", () => {
  for (const host of ["api.anthropic.com", "chatgpt.com", "github.com"])
    assert.deepEqual(tunnelDestination(`${host}:443`, "https://registry.npmjs.org", 1234), {
      port: 443,
      host,
    });
  assert.deepEqual(tunnelDestination("github.com:8443", "https://registry.npmjs.org", 1234), {
    port: 8443,
    host: "github.com",
  });
  for (const host of ["registry.npmjs.org", "mirror.example"])
    assert.deepEqual(tunnelDestination(`${host}:443`, "https://mirror.example", 1234), {
      port: 1234,
      host: "127.0.0.1",
    });
  assert.throws(() =>
    tunnelDestination("user:password@github.com:443", "https://registry.npmjs.org", 1234),
  );
});

test("only the npm entry receives proxy and runtime CA settings; worker and agent children remain clean", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stintwork-npm-proxy-"));
  try {
    const npm = join(directory, "npm-cli.js");
    const env = { ...cleanEnvironment(), npm_execpath: npm, STINTWORK_AGENT_CACHE: directory };
    const before = { ...env };
    const proxy = {
      HTTP_PROXY: "http://127.0.0.1:1234",
      HTTPS_PROXY: "http://127.0.0.1:1234",
      npm_config_https_proxy: "http://127.0.0.1:1234",
      NODE_EXTRA_CA_CERTS: join(directory, "cert.pem"),
    };
    await writeFile(
      npm,
      `console.log(JSON.stringify({env:process.env,args:process.argv.slice(2)}));process.exitCode=7;`,
    );
    const childEnv = await npmProxyEnvironment(join(directory, "wrapper"), env, proxy);
    assert.deepEqual(env, before);
    for (const key of Object.keys(proxy)) assert.equal(childEnv[key], undefined);
    const agentEnv = JSON.parse(
      execFileSync(process.execPath, ["-e", "console.log(JSON.stringify(process.env))"], {
        env: childEnv,
        encoding: "utf8",
      }),
    );
    for (const key of Object.keys(proxy)) assert.equal(agentEnv[key], undefined);
    assert.throws(
      () =>
        execFileSync(process.execPath, [childEnv.npm_execpath, "ci", "--ignore-scripts"], {
          env: childEnv,
          encoding: "utf8",
          stdio: "pipe",
        }),
      (error) => {
        const result = JSON.parse(error.stdout);
        assert.deepEqual(result.args, ["ci", "--ignore-scripts"]);
        for (const [key, value] of Object.entries(proxy)) assert.equal(result.env[key], value);
        assert.equal(result.env.npm_config_cafile, proxy.NODE_EXTRA_CA_CERTS);
        assert.equal(result.env.STINTWORK_AGENT_CACHE, directory);
        return error.status === 7;
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("agent URL detection covers scoped metadata, tarballs and native npm aliases", () => {
  for (const url of [
    "https://registry.npmjs.org/@agentclientprotocol%2fcodex-acp",
    "https://registry.npmjs.org/@agentclientprotocol/claude-agent-acp/-/claude-agent-acp-0.88.0.tgz",
    "https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-darwin-arm64/-/native.tgz",
    "https://registry.npmjs.org/@openai/codex/-/codex-0.159.3-darwin-arm64.tgz",
  ])
    assert(agentPackageUrl(url), url);
  assert(!agentPackageUrl(request.url));
});

test("proxy counts raw CONNECT bytes in each direction, including buffered head, using fake socket pair", () => {
  class Socket extends EventEmitter {
    written = [];
    pipe(target) {
      this.target = target;
      return target;
    }
    write(chunk) {
      this.written.push(chunk);
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const client = new Socket();
  const upstream = new Socket();
  const counts = { sentBytes: 0, receivedBytes: 0 };
  countTunnel(client, upstream, Buffer.from([0, 1, 255]), counts);
  client.emit("data", Buffer.alloc(17));
  upstream.emit("data", Buffer.alloc(29));
  upstream.emit("data", Buffer.from("TLS overhead"));
  assert.equal(counts.sentBytes, 20);
  assert.equal(counts.receivedBytes, 41);
  assert.deepEqual(upstream.written, [Buffer.from([0, 1, 255])]);
  assert.equal(client.target, upstream);
  assert.equal(upstream.target, client);
  client.emit("error", new Error("fake disconnect"));
  assert(upstream.destroyed);
  upstream.emit("close");
  assert(client.destroyed);
});

test("snapshot includes redirects/retries and stays fixed after later proxy traffic", () => {
  const requests = [
    { ...request, status: 302 },
    { ...request, responseBodyBytes: 456, status: 500 },
    { ...request, status: 200 },
  ];
  const tunnels = [{ sentBytes: 10, receivedBytes: 20 }];
  const snapshot = networkSnapshot(requests, tunnels);
  assert.equal(snapshot.responseBodyBytes, 702);
  assert.equal(snapshot.requestCount, 3);
  requests[0].responseBodyBytes = 999;
  tunnels[0].receivedBytes = 1000;
  assert.equal(snapshot.requests[0].responseBodyBytes, 123);
  assert.equal(snapshot.tunnels[0].receivedBytes, 20);
});
