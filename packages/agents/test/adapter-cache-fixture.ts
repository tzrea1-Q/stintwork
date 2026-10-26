// SPDX-License-Identifier: Apache-2.0
import { chmod, mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  adapterHost,
  adapterPins,
  nativePackage,
  profileManifest,
  profileName,
} from "../src/adapter-profiles.js";
import type { AgentPreparationEvent, AgentPreparationOptions } from "../src/adapter-cache.js";

export async function script(path: string, source: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `#!${process.execPath}\n${source}`);
  await chmod(path, 0o700);
}

const fakeAdapter = `
const fs = await import('node:fs');
const readline = await import('node:readline');
let cwd;
for await (const line of readline.createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (process.env.TEST_ACP_TRACE) fs.appendFileSync(process.env.TEST_ACP_TRACE, JSON.stringify({pid:process.pid,method:request.method,params:request.params,home:process.env.HOME,token:process.env.TEST_LAUNCH_ENV,claude:process.env.CLAUDE_CODE_EXECUTABLE,codex:process.env.CODEX_PATH})+'\\n');
  if (!('id' in request)) continue;
  if (request.method === 'initialize' && process.env.TEST_SELECTED_AGENT) {
    const {execFileSync} = await import('node:child_process');
    execFileSync(process.env[process.env.TEST_SELECTED_AGENT === 'claude' ? 'CLAUDE_CODE_EXECUTABLE' : 'CODEX_PATH'], ['--version']);
  }
  if (request.method === 'initialize' && process.env.TEST_INITIALIZE && !(process.env.CODEX_PATH || process.env.CLAUDE_CODE_EXECUTABLE).includes('/entries/')) {
    const failures = {
      incompatible: {code:-32601,message:'Method unsupported'},
      auth: {code:-32000,message:'Authentication required'},
      authGeneric: {code:-32000,message:'Invalid request'},
      permission: {code:-32001,message:'Permission denied'},
      provider: {code:-32603,message:'Provider protocol unavailable'},
    };
    process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:failures[process.env.TEST_INITIALIZE]})+'\\n');
    continue;
  }
  if (request.method === 'session/new' && process.env.TEST_HANDSHAKE === 'fail' && !(process.env.CODEX_PATH || process.env.CLAUDE_CODE_EXECUTABLE).includes('/entries/')) {
    process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'Method unsupported'}})+'\\n');
    continue;
  }
  const fault = process.env.TEST_RESUME_FAILURE;
  const target = fault && fault.split(':')[0];
  const action = fault && fault.split(':')[1];
  if (request.method === target) {
    if (action === 'hang') { setInterval(()=>{},1000); continue; }
    if (action === 'exit') process.exit(17);
    if (action === 'transport') { process.stdout.end(); continue; }
    if (['auth','missing','provider','network','reject'].includes(action)) {
      const message = {auth:'Authentication required',missing:'Session not found',provider:'Provider unavailable',network:'ENETUNREACH',reject:'Mode rejected'}[action];
      process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:action === 'auth' ? -32000 : -32001,message}})+'\\n');
      continue;
    }
  }
  let result = {};
  if (request.method === 'initialize') result = { protocolVersion:1,agentCapabilities:{loadSession:true,sessionCapabilities:{additionalDirectories:{}}},authMethods:[] };
  if (request.method === 'initialize' && fault === 'no-load') result.agentCapabilities.loadSession = false;
  if (request.method === 'initialize' && fault === 'no-directories') delete result.agentCapabilities.sessionCapabilities.additionalDirectories;
  if (request.method === 'session/new' || request.method === 'session/load') {
    cwd = request.params.cwd;
    result = { sessionId:'fake-session', modes:{currentModeId:'agent',availableModes:['agent','workspace-write','read-only','default','acceptEdits'].map(id=>({id,name:id}))} };
  }
  if (request.method === 'session/load' && fault === 'no-mode') result.modes.availableModes = [];
  if (request.method === 'session/load') process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'session/update',params:{sessionId:request.params.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'REPLAY MUST NOT APPEND'}}}})+'\\n');
  if (request.method === 'session/prompt') {
    fs.writeFileSync(cwd+'/selected.json',JSON.stringify({claude:process.env.CLAUDE_CODE_EXECUTABLE,codex:process.env.CODEX_PATH}));
    if (process.env.TEST_RECOVERY) {
      const text = request.params.prompt[0].text;
      if (process.env.TEST_RECOVERY === 'crash' || text.startsWith('Continue the interrupted turn'))
        process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'session/update',params:{sessionId:request.params.sessionId,update:{sessionUpdate:'tool_call',toolCallId:'same-tool',title:process.env.TEST_RECOVERY === 'crash' ? 'Old tool' : 'Fresh tool',status:'completed'}}})+'\\n');
      const notify = (text) => process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'session/update',params:{sessionId:request.params.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text}}}})+'\\n');
      if (process.env.TEST_RECOVERY === 'crash') {
        fs.writeFileSync(cwd+'/partial.txt','Before crash');
        notify('Before crash');
        setInterval(()=>{},1000);
        continue;
      }
      if (text.startsWith('Continue the interrupted turn')) {
        fs.writeFileSync(cwd+'/resumed.txt','Continued same session');
        notify('After restart');
      } else if (text.includes('findings')) {
        notify('No findings');
      } else {
        fs.writeFileSync(cwd+'/handoff.txt','Handoff edit');
        notify('## Where I stopped\\nRecovered work.\\n## Unresolved\\nNone\\n## Suggested next\\nReview.');
      }
    }
    result = {stopReason:'end_turn'};
  }
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\\n');
}`;

export async function adapterCacheFixture(agent: "claude" | "codex" = "codex") {
  const root = await realpath(await mkdtemp(join(tmpdir(), "stintwork-cache-test-")));
  const cwd = join(root, "project");
  await mkdir(cwd);
  const profilesDirectory = join(root, "profiles");
  const host = adapterHost();
  for (const source of ["installed", "bundled"] as const) {
    const manifest = profileManifest(agent, source, host);
    const packages: Record<string, object> = {
      "": { name: manifest.name, dependencies: manifest.dependencies },
    };
    for (const [name, version] of Object.entries(manifest.dependencies)) {
      const alias = version.startsWith("npm:");
      packages[`node_modules/${name}`] = {
        ...(alias ? { name: "@openai/codex" } : {}),
        version: alias ? version.slice(version.lastIndexOf("@") + 1) : version,
        resolved: `https://registry.npmjs.org/${name}/-/fixture.tgz`,
        integrity: `sha512-${Buffer.alloc(64, 1).toString("base64")}`,
      };
    }
    const pin = adapterPins[agent];
    Object.assign(packages[`node_modules/${pin.adapter}`], {
      dependencies: { [pin.dependency]: `^${pin.dependencyVersion}` },
    });
    Object.assign(packages[`node_modules/${pin.dependency}`], {
      peerDependencies: { "fixture-peer": "^1.0.0" },
    });
    packages["node_modules/fixture-peer"] = {
      version: "1.0.0",
      resolved: "https://registry.npmjs.org/fixture-peer/-/fixture-peer-1.0.0.tgz",
      integrity: `sha512-${Buffer.alloc(64, 2).toString("base64")}`,
    };
    const directory = join(profilesDirectory, profileName(agent, source, host));
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "package.json"), JSON.stringify(manifest));
    await writeFile(
      join(directory, "package-lock.json"),
      JSON.stringify({ lockfileVersion: 3, packages }),
    );
  }
  const installed = join(root, "installed agent");
  await script(
    installed,
    `console.log(${JSON.stringify(agent === "codex" ? "codex-cli 0.163.0" : "2.1.295 (Claude Code)")})`,
  );
  const home = join(root, "home");
  await mkdir(home);
  await writeFile(join(home, ".npmrc"), "developer-config-must-survive");
  await writeFile(join(home, "credentials"), "fixture-login-secret");
  const npm = join(root, "npm-cli.js");
  await script(
    npm,
    `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const cache = args[args.indexOf('--cache')+1];
fs.mkdirSync(cache,{recursive:true});
fs.writeFileSync(path.join(cache,'download.tgz'),'fixture tarball');
const lock = JSON.parse(fs.readFileSync('package-lock.json'));
const packages = Object.keys(lock.packages).filter(key=>key && !lock.packages[key].optional);
fs.appendFileSync(${JSON.stringify(join(root, "npm-calls.jsonl"))},JSON.stringify({pid:process.pid,args,cache,packages,lock,configs:['--userconfig','--globalconfig'].map(flag=>fs.readFileSync(args[args.indexOf(flag)+1],'utf8')),npmConfigKeys:Object.keys(process.env).filter(k=>/^npm_config_/i.test(k))})+'\\n');
if (['fail','offline','integrity','disk-full'].includes(process.env.TEST_NPM)) { console.error(process.env.TEST_NPM === 'integrity' ? 'EINTEGRITY' : process.env.TEST_NPM === 'disk-full' ? 'ENOSPC' : 'ENETUNREACH'); console.error('private-registry-token'); process.exit(1); }
if (process.env.TEST_NPM === 'hang') { setInterval(()=>{},1000); }
else {
  for (const [key,value] of Object.entries(lock.packages)) {
    if (!key || value.optional || (process.env.TEST_NPM === 'missing-native' && key === 'node_modules/${nativePackage(agent, host).name}')) continue;
    fs.mkdirSync(key,{recursive:true});
    const name = value.name || key.slice(key.lastIndexOf('node_modules/')+13);
    fs.writeFileSync(path.join(key,'package.json'),JSON.stringify({name,version:value.version,type:'module'}));
  }
  if (process.env.TEST_NPM === 'modify-lock') fs.writeFileSync('package-lock.json','{}');
  if (process.env.TEST_NPM === 'wrong-version') fs.writeFileSync('node_modules/fixture-peer/package.json',JSON.stringify({name:'fixture-peer',version:'9.0.0'}));
  if (process.env.TEST_NPM === 'escape') fs.symlinkSync(process.env.TEST_ESCAPE,'escaped');
  const entry = 'node_modules/${adapterPins[agent].adapter}/dist/index.js';
  fs.mkdirSync(path.dirname(entry),{recursive:true});
  fs.writeFileSync(entry,${JSON.stringify(fakeAdapter)});
  const native = 'node_modules/${nativePackage(agent, host).name}';
  if (fs.existsSync(native)) {
    const target = '${host.arch === "arm64" ? "aarch64" : "x86_64"}-${host.os === "darwin" ? "apple-darwin" : host.os === "win32" ? "pc-windows-msvc" : "unknown-linux-musl"}';
    const binary = ${agent === "claude" ? `path.join(native,${JSON.stringify(host.os === "win32" ? "claude.exe" : "claude")})` : `path.join(native,'vendor',target,'bin',${JSON.stringify(host.os === "win32" ? "codex.exe" : "codex")})`};
    fs.mkdirSync(path.dirname(binary),{recursive:true});
    fs.writeFileSync(binary,${JSON.stringify(`#!${process.execPath}\nconsole.log(${JSON.stringify(agent === "codex" ? "codex-cli 0.159.3" : "2.1.293 (Claude Code)")})`)});
    fs.chmodSync(binary,0o700);
  }
}
`,
  );
  const events: AgentPreparationEvent[] = [];
  const options: AgentPreparationOptions = {
    agent,
    cwd,
    profilesDirectory,
    cacheDirectory: join(root, "cache"),
    env: {
      HOME: home,
      USERPROFILE: home,
      PATH: "",
      npm_execpath: npm,
      npm_config_userconfig: "must-not-read",
      npm_config_cache: "must-not-use",
      [agent === "claude" ? "CLAUDE_CODE_EXECUTABLE" : "CODEX_PATH"]: installed,
    },
    onProgress: (event) => events.push(event),
  };
  const calls = async () =>
    (await readFile(join(root, "npm-calls.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
  return { root, options, installed, events, calls };
}
