import { spawn } from 'node:child_process';
import { access, mkdir, realpath, writeFile } from 'node:fs/promises';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { inside, lockIdentity, nativePackage, PINS } from './lib/prefix.mjs';

export async function preparePrefix({ agent, profile, dir, registry, cache }, install = runNpm) {
  if (!PINS[agent]) throw new Error('agent must be claude or codex');
  if (!['installed', 'bundled'].includes(profile)) throw new Error('profile must be installed or bundled');
  if (!dir || !cache || !registry) throw new Error('--dir, --registry and a separate --cache are required');
  const url = new URL(registry);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('registry must be an HTTP(S) URL without credentials, query or fragment');
  }
  const prefix = resolve(dir);
  const cacheDir = resolve(cache);
  if (inside(prefix, cacheDir) || inside(cacheDir, prefix)) throw new Error('cache and prefix must be separate directories');
  const pin = PINS[agent];
  const dependencies = { [pin.adapter]: pin.version, [pin.dependency]: pin.dependencyVersion };
  if (profile === 'bundled') {
    const native = nativePackage(agent);
    dependencies[native.name] = native.version;
  }
  const manifest = {
    name: `acp-probe-${agent}-${profile}`, private: true, type: 'module', dependencies,
    overrides: { [pin.dependency]: pin.dependencyVersion },
  };
  await mkdir(dirname(prefix), { recursive: true });
  await mkdir(prefix);
  await mkdir(cacheDir, { recursive: true });
  const canonicalPrefix = await realpath(prefix);
  const canonicalCache = await realpath(cacheDir);
  if (inside(canonicalPrefix, canonicalCache) || inside(canonicalCache, canonicalPrefix)) {
    throw new Error('cache and prefix must not overlap through symlinks');
  }
  await writeFile(join(prefix, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(prefix, '.npmrc'), '');
  await writeFile(join(prefix, '.global-npmrc'), '');
  const args = [
    'install', '--no-audit', '--no-fund', '--ignore-scripts', '--omit=optional',
    '--workspaces=false', '--package-lock=true', '--global=false',
    '--prefix', prefix, '--registry', url.href, '--cache', cacheDir,
    '--userconfig', join(prefix, '.npmrc'), '--globalconfig', join(prefix, '.global-npmrc'),
  ];
  await install(args, { cwd: prefix, env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key))) });
  const lock = await lockIdentity(join(prefix, 'package-lock.json'));
  await writeFile(join(prefix, 'package-lock.sha256'), `${lock.digest}  package-lock.json\n`);
  return { agent, profile, prefix, lock };
}

export async function npmEntry(env = process.env, platform = process.platform) {
  const candidates = [];
  if (env.npm_execpath && basename(env.npm_execpath) === 'npm-cli.js') candidates.push(env.npm_execpath);
  for (const directory of (env.PATH ?? env.Path ?? '').split(delimiter)) {
    try {
      const shim = await realpath(join(directory, platform === 'win32' ? 'npm.cmd' : 'npm'));
      candidates.push(basename(shim) === 'npm-cli.js' ? shim : join(dirname(shim), 'node_modules/npm/bin/npm-cli.js'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  candidates.push(join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'));
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return await realpath(candidate);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw new Error('Cannot find npm-cli.js; put npm on PATH or set npm_execpath to its JS entry');
}

async function runNpm(args, options) {
  const entry = await npmEntry(options.env);
  return new Promise((resolveInstall, reject) => {
    const child = spawn(process.execPath, [entry, ...args], { ...options, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0 ? resolveInstall() : reject(new Error(`npm install failed: ${signal ?? code}`)));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: Object.fromEntries(['agent', 'profile', 'dir', 'registry', 'cache'].map((key) => [key, { type: 'string' }])) });
    console.log(JSON.stringify(await preparePrefix(values), null, 2));
  } catch (error) {
    console.error(`Prepare prefix: ${error.message}`);
    process.exitCode = 1;
  }
}
