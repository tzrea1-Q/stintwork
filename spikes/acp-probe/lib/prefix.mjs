import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, relative, isAbsolute, sep } from 'node:path';

export const PINS = {
  claude: { adapter: '@agentclientprotocol/claude-agent-acp', version: '0.88.0', dependency: '@anthropic-ai/claude-agent-sdk', dependencyVersion: '0.3.293' },
  codex: { adapter: '@agentclientprotocol/codex-acp', version: '2.1.1', dependency: '@openai/codex', dependencyVersion: '0.159.3' },
};

export function environment() {
  const report = process.platform === 'linux' ? process.report.getReport() : null;
  return {
    os: process.platform, arch: process.arch,
    libc: report ? (report.header.glibcVersionRuntime ? `glibc-${report.header.glibcVersionRuntime}`
      : report.sharedObjects.some((path) => /(?:ld-musl|libc\.musl)/.test(path)) ? 'musl' : 'unknown') : null,
    node: process.version,
  };
}

export function nativePackage(agent, host = environment()) {
  if (!PINS[agent]) throw new Error('agent must be claude or codex');
  if (!['darwin', 'linux', 'win32'].includes(host.os) || !['arm64', 'x64'].includes(host.arch)) {
    throw new Error(`Unsupported bundled platform: ${host.os}-${host.arch}`);
  }
  if (agent === 'claude' && host.os === 'linux' && !/^(glibc-|musl)/.test(host.libc ?? '')) {
    throw new Error('Cannot select bundled Claude for unknown Linux libc');
  }
  const suffix = `${host.os}-${host.arch}${agent === 'claude' && host.os === 'linux' && host.libc === 'musl' ? '-musl' : ''}`;
  return agent === 'claude'
    ? { name: `@anthropic-ai/claude-agent-sdk-${suffix}`, version: '0.3.293' }
    : { name: `@openai/codex-${suffix}`, version: `npm:@openai/codex@0.159.3-${suffix}` };
}

export function inside(directory, path) {
  const offset = relative(directory, path);
  return offset === '' || (!isAbsolute(offset) && offset !== '..' && !offset.startsWith(`..${sep}`));
}

export async function packageInfo(name, from, prefix) {
  for (const directory of createRequire(from).resolve.paths(name) ?? []) {
    if (prefix && !inside(prefix, directory)) continue;
    const manifest = join(directory, name, 'package.json');
    try {
      const path = await realpath(manifest);
      if (prefix && !inside(prefix, path)) throw new Error(`${name} resolves outside adapter prefix: ${path}`);
      const data = JSON.parse(await readFile(path, 'utf8'));
      return { name, version: data.version, path, data };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return null;
}

export async function lockIdentity(path) {
  return { path, algorithm: 'sha256', digest: createHash('sha256').update(await readFile(path)).digest('hex') };
}
