import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { buildSync } from 'esbuild';

// #992: the listing owner must not deliver a signal twice to an embedding host.
const source = fileURLToPath(new URL('../../../../src/domains/code-intelligence/services/metric-collector/listing-process-owner.ts', import.meta.url));
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

type HostMode = 'none' | 'before' | 'after' | 'once';
async function interruptHost(mode: HostMode, signal: NodeJS.Signals) {
  const root = mkdtempSync(join(tmpdir(), 'aqe-listing-owner-992-'));
  roots.push(root);
  const owned = join(root, 'owned');
  mkdirSync(owned);
  buildSync({ entryPoints: [source], bundle: true, platform: 'node', format: 'esm', outfile: join(root, 'owner.mjs'), logLevel: 'silent' });
  const host = `process.${mode === 'once' ? 'once' : 'on'}(${JSON.stringify(signal)}, () => console.log('HOST_SIGNAL ' + ++count));`;
  writeFileSync(join(root, 'host.mjs'), [
    `import { ownListingProcess } from './owner.mjs';`,
    `let count = 0;`,
    mode === 'before' || mode === 'once' ? host : '',
    `ownListingProcess(${JSON.stringify(owned)}, () => console.log('STOP_TREE'));`,
    mode === 'after' ? host : '',
    `setTimeout(() => { console.log('EXIT_NORMALLY ' + count); process.exit(0); }, 500);`,
    `console.log('READY');`,
  ].join('\n'));
  const child = spawn(process.execPath, [join(root, 'host.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  let stdout = '';
  let sent = false;
  child.stdout.on('data', chunk => {
    stdout += chunk;
    if (!sent && stdout.includes('READY')) { sent = true; child.kill(signal); }
  });
  const [code, exitSignal] = await new Promise<[number | null, NodeJS.Signals | null]>(resolve =>
    child.on('exit', (exitCode, terminatedBy) => resolve([exitCode, terminatedBy])));
  return { lines: stdout.trim().split('\n').filter(line => line !== 'READY'), code, exitSignal, ownedRemoved: !existsSync(owned) };
}

describe('listing process owner signal re-raise (#992)', () => {
  it.each(['before', 'after'] as const)('lets a host listener registered %s the owner receive SIGINT once', async mode => {
    const result = await interruptHost(mode, 'SIGINT');
    expect(result.lines.filter(line => line.startsWith('HOST_SIGNAL'))).toEqual(['HOST_SIGNAL 1']);
    expect(result.lines).toContain('STOP_TREE');
    expect(result.lines).toContain('EXIT_NORMALLY 1');
    expect(result).toMatchObject({ code: 0, exitSignal: null, ownedRemoved: true });
  }, 15_000);

  it('re-raises after a one-shot host listener has consumed its only delivery', async () => {
    const result = await interruptHost('once', 'SIGINT');
    expect(result.lines).toEqual(['HOST_SIGNAL 1', 'STOP_TREE']);
    expect(result).toMatchObject({ code: null, exitSignal: 'SIGINT', ownedRemoved: true });
  }, 15_000);

  it.each(['SIGINT', 'SIGTERM'] as const)('still terminates by %s when no host listener exists', async signal => {
    const result = await interruptHost('none', signal);
    expect(result.lines).toEqual(['STOP_TREE']);
    expect(result).toMatchObject({ code: null, exitSignal: signal, ownedRemoved: true });
  }, 15_000);
});
