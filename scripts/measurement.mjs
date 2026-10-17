// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { createRequire } from "node:module";
import { release } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";

export const execute = promisify(execFile);
export const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
export const saveJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

export function argumentsFor(names) {
  const { values } = parseArgs({
    options: Object.fromEntries(names.map((name) => [name, { type: "string" }])),
  });
  return values;
}

export function cleanEnvironment(source = process.env) {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key]) =>
        !/^npm_config_|^GIT_|^(?:https?|all|no)_proxy$/i.test(key) &&
        !["NODE_OPTIONS", "NODE_PATH", "INIT_CWD", "STINTWORK_SKIP_AGENT_DETECTION"].includes(key),
    ),
  );
}

export function environment(npmVersion) {
  const report = process.platform === "linux" ? process.report.getReport() : undefined;
  return {
    os: process.platform,
    osRelease: release(),
    arch: process.arch,
    libc: !report
      ? "none"
      : report.header.glibcVersionRuntime
        ? `glibc-${report.header.glibcVersionRuntime}`
        : report.sharedObjects.some((path) => /ld-musl|libc\.musl/.test(path))
          ? "musl"
          : "unknown",
    node: process.version,
    npm: npmVersion.trim(),
  };
}

export async function npmEntry(env) {
  // Match the product's JS-entry lookup so npm never runs through a shell shim.
  if (env.npm_execpath && basename(env.npm_execpath) === "npm-cli.js")
    return realpath(env.npm_execpath);
  const require = createRequire(import.meta.url);
  let path;
  try {
    path = require.resolve("npm/bin/npm-cli.js");
  } catch {
    const { stdout } = await execute(
      process.platform === "win32" ? "where.exe" : "which",
      ["npm"],
      { env },
    );
    const shim = await realpath(stdout.trim().split(/\r?\n/)[0]);
    path = shim.endsWith("npm-cli.js")
      ? shim
      : join(resolve(shim, ".."), "node_modules/npm/bin/npm-cli.js");
  }
  return path;
}

export async function npmCommand(env) {
  const path = await npmEntry(env);
  return (args, options) =>
    execute(process.execPath, [path, ...args], {
      timeout: 1_800_000,
      maxBuffer: 32 * 1024 * 1024,
      env,
      ...options,
    });
}

export async function npmProxyEnvironment(directory, env, proxyEnv) {
  const entry = await npmEntry(env);
  await mkdir(directory);
  await saveJson(join(directory, "package.json"), { type: "commonjs" });
  const wrapper = join(directory, "npm-cli.js");
  // npm reads cafile at runtime; NODE_EXTRA_CA_CERTS is read before this wrapper starts.
  await writeFile(
    wrapper,
    `Object.assign(process.env, ${JSON.stringify({ ...proxyEnv, npm_config_cafile: proxyEnv.NODE_EXTRA_CA_CERTS })});\nprocess.argv[1] = ${JSON.stringify(entry)};\nrequire(${JSON.stringify(entry)});\n`,
  );
  return { ...env, npm_execpath: wrapper };
}

export async function isolatedNpm(directory, env) {
  await mkdir(directory, { recursive: true });
  const cache = join(directory, "npm-cache");
  await mkdir(cache);
  for (const name of ["npmrc", "global-npmrc"]) await writeFile(join(directory, name), "");
  return {
    ...env,
    npm_config_cache: cache,
    npm_config_userconfig: join(directory, "npmrc"),
    npm_config_globalconfig: join(directory, "global-npmrc"),
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
    npm_config_logs_max: "0",
    npm_config_global: "false",
    npm_config_workspaces: "false",
  };
}

export async function sampleProject(directory, env) {
  await mkdir(join(directory, ".scratch/first-run"), { recursive: true });
  await writeFile(
    join(directory, ".scratch/first-run/spec.md"),
    "# First run sample\n\nOpen this work item's detail to verify the board.\n",
  );
  const gitEnv = {
    ...env,
    GIT_CONFIG_GLOBAL: join(directory, "empty-gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
  };
  await writeFile(gitEnv.GIT_CONFIG_GLOBAL, "");
  for (const args of [
    ["init", "--quiet", "--initial-branch=main"],
    ["add", "."],
    [
      "-c",
      "user.name=First run measurement",
      "-c",
      "user.email=measurement@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "--quiet",
      "-m",
      "Sample work item",
    ],
  ])
    await execute("git", args, { cwd: directory, env: gitEnv });
  return gitEnv;
}

export async function emptyDirectory(path) {
  try {
    return (await readdir(path)).length === 0;
  } catch (error) {
    if (error.code === "ENOENT") return true;
    throw error;
  }
}

export async function fileHash(path, algorithm = "sha256", encoding = "hex") {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest(encoding);
}

export function countTunnel(client, upstream, head, counts) {
  client.on("data", (chunk) => {
    counts.sentBytes += chunk.length;
  });
  upstream.on("data", (chunk) => {
    counts.receivedBytes += chunk.length;
  });
  counts.sentBytes += head.length;
  if (head.length) upstream.write(head);
  client.pipe(upstream);
  upstream.pipe(client);
  client.on("error", () => upstream.destroy());
  upstream.on("error", () => client.destroy());
  client.on("close", () => upstream.destroy());
  upstream.on("close", () => {
    if (!upstream.readableEnded) client.destroy();
  });
}

export function registryTraffic(url, registry = "https://registry.npmjs.org") {
  // Malformed requests must fail measurement rather than disappear from accounting.
  if (!URL.canParse(url)) return true;
  const hostname = new URL(url).hostname;
  return hostname === new URL(registry).hostname || hostname === "registry.npmjs.org";
}

export function tunnelDestination(authority, registry, securePort) {
  const target = new URL(`https://${authority}`);
  assert(
    !target.username &&
      !target.password &&
      target.pathname === "/" &&
      !target.search &&
      !target.hash,
  );
  return registryTraffic(target.href, registry)
    ? { port: securePort, host: "127.0.0.1" }
    : { port: Number(target.port || 443), host: target.hostname.replace(/^\[|\]$/g, "") };
}

export function networkSnapshot(requests, tunnels, registry = "https://registry.npmjs.org") {
  const registryRequests = requests.filter((request) => registryTraffic(request.url, registry));
  const registryTunnels = tunnels.filter((tunnel) =>
    registryTraffic(`https://${tunnel.authority ?? "registry.npmjs.org"}`, registry),
  );
  const summarize = (requests, tunnels) => ({
    responseBodyBytes: requests.reduce((sum, request) => sum + request.responseBodyBytes, 0),
    requestCount: requests.length,
    requests: structuredClone(requests),
    connectCount: tunnels.length,
    tunnelSentBytes: tunnels.reduce((sum, tunnel) => sum + tunnel.sentBytes, 0),
    tunnelReceivedBytes: tunnels.reduce((sum, tunnel) => sum + tunnel.receivedBytes, 0),
    tunnels: structuredClone(tunnels),
  });
  return {
    ...summarize(registryRequests, registryTunnels),
    agentTraffic: summarize(
      requests.filter((request) => !registryTraffic(request.url, registry)),
      tunnels.filter(
        (tunnel) =>
          !registryTraffic(`https://${tunnel.authority ?? "registry.npmjs.org"}`, registry),
      ),
    ),
    accounting:
      "Registry HTTP response bodies counted before decoding, including metadata, redirects, retries and tarballs. CONNECT bytes in both directions include TLS and HTTP overhead; they are separate and are not added twice to response bodies. Request count counts decrypted HTTP requests; CONNECT count is separate. Non-registry agent traffic is recorded separately, excluded from download budgets and forwarded without TLS interception.",
  };
}

export function agentPackageUrl(url) {
  return /@agentclientprotocol\/(?:claude-agent-acp|codex-acp)|@anthropic-ai\/claude-agent-sdk|@openai\/codex/i.test(
    decodeURIComponent(url),
  );
}

export function boardResult({
  installMs,
  processStartedMs,
  readyMs,
  network,
  localTarballBytes = 0,
  agentCacheEmpty,
  screenshot,
}) {
  return {
    installMs,
    processStartToUsableMs: readyMs - processStartedMs,
    installStartToUsableMs: readyMs,
    network,
    budgetBytes: network.responseBodyBytes + localTarballBytes,
    localTarballTransfer: {
      excludedFromElapsed: localTarballBytes > 0,
      bytesAddedToBudget: localTarballBytes,
      publicTransferMs: null,
    },
    agentCacheEmpty,
    agentPackageRequests: network.requests.filter((request) => agentPackageUrl(request.url)),
    screenshot,
  };
}

export function failedRun(run, error, network, elapsedMs, stage) {
  const result = {
    ...run,
    status: "failed",
    failedStage: stage,
    error: error.message,
    elapsedOnFailureMs: elapsedMs,
    network: run.network ?? network,
    failures: [...(run.failures ?? []), error.message],
  };
  if (stage === "install" || stage === "inspection") {
    result.npmError = {
      code: error.code ?? null,
      signal: error.signal ?? null,
      summary:
        String(error.stderr ?? "")
          .split(/\r?\n/)
          .filter((line) => /^npm (?:error|ERR!)/i.test(line))
          .join("\n") || error.message.split("\n")[0],
    };
    if (stage === "install") result.installMs = elapsedMs;
  }
  return result;
}

export function budgetFailures(run, baselineBytes) {
  const failures = [];
  if (!Number.isFinite(run.installStartToUsableMs) || run.installStartToUsableMs > 60_000)
    failures.push("install-to-usable-board exceeds 60 s or is missing");
  if (
    !Number.isSafeInteger(run.budgetBytes) ||
    run.budgetBytes < 0 ||
    run.budgetBytes > 10 * 1024 * 1024
  )
    failures.push("response-body budget exceeds 10 MiB or is invalid");
  if (
    baselineBytes !== undefined &&
    (!(baselineBytes > 0) || run.budgetBytes > baselineBytes * 0.1)
  )
    failures.push("response-body budget exceeds 10% of the baseline or baseline is invalid");
  if (!run.agentCacheEmpty) failures.push("agent cache changed before board readiness");
  if (run.agentPackageRequests.length)
    failures.push("adapter/native package URL requested before board readiness");
  if (!run.network.requestCount || run.network.responseBodyBytes <= 0)
    failures.push("No registry traffic measured: cold-install accounting is unproven");
  if (run.network.requests.some((request) => request.error || !request.complete))
    failures.push("proxy observed an incomplete/blocked request");
  return failures;
}

function completedRun(run) {
  return (
    (!run.status || run.status === "completed") &&
    !run.error &&
    Number.isFinite(run.installStartToUsableMs) &&
    Number.isSafeInteger(run.budgetBytes) &&
    run.budgetBytes > 0 &&
    run.network?.requestCount > 0 &&
    Array.isArray(run.network.requests)
  );
}

export function comparableBaseline(baseline, current) {
  assert.equal(baseline.kind, "first-run", "Baseline must be a first-run report");
  assert.equal(baseline.schemaVersion, 1, "Unsupported baseline schema");
  for (const key of ["registry", "conditions", "transport"])
    assert.deepEqual(baseline[key], current[key], `Baseline ${key} differs`);
  assert.deepEqual(baseline.environment, current.environment, "Baseline host/Node/npm differs");
  assert(Array.isArray(baseline.runs), "Baseline has no runs");
  const completed = baseline.runs.filter(completedRun);
  assert(completed.length > 0, "No baseline run completed with valid measurements");
  // Every candidate must beat even the smallest baseline, rather than a favourable outlier.
  return {
    budgetBytes: Math.min(...completed.map((run) => run.budgetBytes)),
    completedRuns: completed.length,
    failedRuns: baseline.runs.length - completed.length,
    totalRuns: baseline.runs.length,
  };
}

export function compareResults(candidate, baseline) {
  assert.equal(candidate.kind, "first-run", "Candidate must be a first-run report");
  assert.equal(candidate.schemaVersion, 1, "Unsupported candidate schema");
  const reference = comparableBaseline(baseline, candidate);
  const runs = candidate.runs.map((run) => {
    const completed = completedRun(run);
    return {
      ...run,
      status: completed ? "completed" : "failed",
      failures: completed
        ? budgetFailures(run, reference.budgetBytes)
        : [run.error ?? "Run did not complete with valid measurements"],
    };
  });
  return {
    ...candidate,
    baselineSummary: reference,
    baselineBudgetBytes: reference.budgetBytes,
    runs,
    passed:
      runs.length > 0 &&
      runs.length === candidate.requestedRuns &&
      runs.every((run) => run.failures.length === 0),
  };
}

export function preparationResult(stdout) {
  const result = { phases: [] };
  for (const line of stdout.trim().split("\n").filter(Boolean)) {
    const record = JSON.parse(line);
    if (record.progress) result.phases.push(record.progress);
    else Object.assign(result, record);
  }
  return result;
}

export function preparationFailures(run, agent, source, registry = "https://registry.npmjs.org") {
  const requests = run.network.requests.filter((request) => registryTraffic(request.url, registry));
  const failures = run.error ? [run.error] : [];
  if (!run.prepared) failures.push("No prepared-agent result");
  if (requests.some((request) => request.error || !request.complete))
    failures.push("Proxy observed incomplete/blocked traffic");
  if (source === "bundled" && run.prepared?.source !== "bundled")
    failures.push("Forced bundled source was not selected");
  if (run.temperature === "warm" && requests.length !== 0)
    failures.push("Warm cache made registry requests");
  if (
    run.temperature === "cold" &&
    run.phases?.some((phase) => phase.phase === "installing") &&
    !requests.length
  )
    failures.push("Cold installation had no metered requests");
  for (const request of requests) {
    const url = decodeURIComponent(request.url);
    if (
      (agent === "claude" && /@openai\/codex|@agentclientprotocol\/codex-acp/.test(url)) ||
      (agent === "codex" &&
        /@anthropic-ai\/claude-agent-sdk|@agentclientprotocol\/claude-agent-acp/.test(url))
    )
      failures.push("Other agent's package requested");
    if (
      run.prepared?.source === "installed" &&
      /claude-agent-sdk-(?:darwin|linux|win32)|codex-[^/]*(?:darwin|linux|win32)-(?:arm64|x64)/.test(
        url,
      )
    )
      failures.push("Installed source downloaded a native package");
  }
  return failures;
}

export function trackSocket(sockets, socket) {
  if (sockets.has(socket)) return;
  sockets.add(socket);
  const onError = () => {};
  const onClose = () => {
    sockets.delete(socket);
    socket.off("close", onClose);
    socket.off("error", onError);
  };
  socket.once("close", onClose);
  socket.on("error", onError);
}

export async function startProxy(directory, registry) {
  const registryUrl = new URL(registry);
  assert(
    ["http:", "https:"].includes(registryUrl.protocol) &&
      !registryUrl.username &&
      !registryUrl.password,
    "Registry must be an HTTP(S) URL without credentials",
  );
  const hosts = new Set([registryUrl.hostname, "registry.npmjs.org"]);
  assert(
    [...hosts].every((host) => /^[\w.-]+$/.test(host)),
    "Unsupported registry hostname",
  );
  await mkdir(directory, { mode: 0o700 });
  const key = join(directory, "key.pem");
  const cert = join(directory, "cert.pem");
  const config = join(directory, "openssl.cnf");
  await writeFile(
    config,
    `[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=extensions\n[dn]\nCN=Stintwork measurement only\n[extensions]\nsubjectAltName=${[...hosts].map((host) => `${net.isIP(host) ? "IP" : "DNS"}:${host}`).join(",")}\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n`,
  );
  await execute(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-config",
      config,
      "-keyout",
      key,
      "-out",
      cert,
    ],
    { timeout: 30_000 },
  );
  const requests = [];
  const tunnels = [];
  const sockets = new Set();
  const track = (socket) => trackSocket(sockets, socket);
  function forward(request, response, protocol) {
    const entry = { url: "", method: request.method, responseBodyBytes: 0, complete: false };
    requests.push(entry);
    try {
      const target = new URL(request.url, `${protocol}//${request.headers.host}`);
      entry.url = target.href;
      assert(!target.username && !target.password, "Proxy URL must not contain credentials");
      assert(["http:", "https:"].includes(target.protocol), "Unsupported proxy protocol");
      const headers = { ...request.headers, host: target.host };
      delete headers["proxy-authorization"];
      delete headers["proxy-connection"];
      delete headers.connection;
      const upstream = (target.protocol === "https:" ? https : http).request(
        target,
        { method: request.method, headers },
        (incoming) => {
          entry.status = incoming.statusCode;
          response.writeHead(incoming.statusCode, incoming.headers);
          incoming.on("data", (chunk) => {
            entry.responseBodyBytes += chunk.length;
          });
          incoming.on("end", () => {
            entry.complete = incoming.complete;
          });
          incoming.on("error", (error) => {
            entry.error = error.message;
            response.destroy();
          });
          incoming.pipe(response);
        },
      );
      upstream.on("socket", track);
      upstream.setTimeout(120_000, () => upstream.destroy(new Error("Proxy upstream timeout")));
      upstream.on("error", (error) => {
        entry.error = error.message;
        response.destroy();
      });
      request.on("aborted", () => upstream.destroy());
      response.on("close", () => {
        if (!response.writableFinished) upstream.destroy();
      });
      request.pipe(upstream);
    } catch (error) {
      entry.error = error.message;
      response.writeHead(502).end("Measurement proxy refused request");
    }
  }
  const secure = https.createServer(
    { key: await readFile(key), cert: await readFile(cert) },
    (req, res) => forward(req, res, "https:"),
  );
  const proxy = http.createServer((req, res) => forward(req, res, "http:"));
  for (const server of [secure, proxy]) {
    server.on("connection", track);
    await new Promise((done, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", done);
    });
  }
  proxy.on("connect", (request, client, head) => {
    try {
      const destination = tunnelDestination(request.url, registry, secure.address().port);
      const entry = { authority: request.url, sentBytes: 0, receivedBytes: 0 };
      tunnels.push(entry);
      const upstream = net.connect(destination, () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        countTunnel(client, upstream, head, entry);
      });
      track(upstream);
      upstream.on("error", (error) => {
        entry.error = error.message;
        client.destroy();
      });
    } catch {
      requests.push({
        url: `https://${request.url}`,
        responseBodyBytes: 0,
        complete: false,
        error: "CONNECT host refused",
      });
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    }
  });
  const url = `http://127.0.0.1:${proxy.address().port}`;
  return {
    env: {
      HTTP_PROXY: url,
      HTTPS_PROXY: url,
      http_proxy: url,
      https_proxy: url,
      NO_PROXY: "",
      no_proxy: "",
      NODE_EXTRA_CA_CERTS: cert,
      npm_config_proxy: url,
      npm_config_https_proxy: url,
      npm_config_noproxy: "",
    },
    snapshot: () => networkSnapshot(requests, tunnels, registry),
    async close() {
      for (const socket of sockets) socket.destroy();
      await Promise.all([secure, proxy].map((server) => new Promise((done) => server.close(done))));
    },
  };
}
