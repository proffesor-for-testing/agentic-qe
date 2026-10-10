import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { createServer as createTcpServer, type Server as TcpServer, type Socket } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Step {
  name: string;
  id?: string;
  if?: string;
  run?: string;
  uses?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
  'timeout-minutes'?: number;
}

interface NpmCall {
  parent: string;
  env: Record<string, string>;
  args: string[];
  /** Probe pack directories that exist while this npm process starts. */
  live: string[];
}

const root = resolve(import.meta.dirname, '../../..');
const probe = join(root, 'scripts/probe-npm-tarball.sh');
const workflow = parse(readFileSync(join(root, '.github/workflows/post-publish-canary.yml'), 'utf8'));
const steps: Step[] = workflow.jobs.canary.steps;
const realNpm = spawnSync('sh', ['-c', 'command -v npm'], { encoding: 'utf8' }).stdout.trim();
const fixtures: string[] = [];
const servers: Array<Server | TcpServer> = [];
const sockets: Socket[] = [];
const TEST_TIMEOUT = 90_000;
// Slack for process start-up and scheduling noise. Kept below one extra npm
// call (5 s in the stalled-registry test) so overrunning the deadline fails.
const SLACK_SECONDS = 4;

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  for (const server of servers.splice(0)) {
    await new Promise<void>((done) => server.close(() => done()));
  }
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function cleanroom() {
  const directory = mkdtempSync(join(tmpdir(), 'aqe-canary-probe-'));
  fixtures.push(directory);
  mkdirSync(join(directory, 'home'));
  writeFileSync(join(directory, 'empty.npmrc'), '');
  writeFileSync(join(directory, 'empty-global.npmrc'), '');
  return directory;
}

function cleanEnv(directory: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: join(directory, 'home'),
    TMPDIR: directory,
    CI: 'true',
    npm_config_userconfig: join(directory, 'empty.npmrc'),
    npm_config_globalconfig: join(directory, 'empty-global.npmrc'),
    npm_config_prefix: join(directory, 'prefix'),
  };
}

async function run(command: string, args: string[], directory: string, env: NodeJS.ProcessEnv) {
  const started = Date.now();
  const child = spawn(command, args, { cwd: directory, env });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (data) => { stdout += data; });
  child.stderr.on('data', (data) => { stderr += data; });
  const code = await new Promise<number | null>((done, reject) => {
    child.once('error', reject);
    child.once('close', done);
  });
  return { code, stdout, stderr, seconds: (Date.now() - started) / 1000 };
}

/** A `npm` shim that records the executed argv, parent process and npm env, then runs real npm. */
function npmShim(directory: string) {
  const bin = join(directory, 'shim-bin');
  mkdirSync(bin, { recursive: true });
  const log = join(directory, 'npm-argv.log');
  writeFileSync(join(bin, 'npm'), `#!/bin/sh
{
  printf 'PARENT %s\\n' "$(ps -o comm= -p "$PPID" 2>/dev/null)"
  for dir in "$TMPDIR"/aqe-npm-probe.*/pack-*; do [ -e "$dir" ] && printf 'LIVE %s\\n' "$dir"; done
  env | grep -iE '^(npm_config_[a-z_]+|home|no_update_notifier)=' | sed 's/^/ENV /'
  for arg in "$@"; do printf 'ARG %s\\n' "$arg"; done
  printf 'END\\n'
} >> "$AQE_TEST_NPM_ARGV"
exec "$AQE_TEST_REAL_NPM" "$@"
`, { mode: 0o755 });
  const calls = (): NpmCall[] => {
    if (!existsSync(log)) return [];
    return readFileSync(log, 'utf8').split('END\n').filter((chunk) => chunk.trim()).map((chunk) => {
      const call: NpmCall = { parent: '', env: {}, args: [], live: [] };
      for (const line of chunk.split('\n')) {
        if (line.startsWith('PARENT ')) call.parent = line.slice(7).trim();
        else if (line.startsWith('ENV ')) {
          const [key, ...value] = line.slice(4).split('=');
          call.env[key.toLowerCase()] = value.join('=');
        } else if (line.startsWith('ARG ')) call.args.push(line.slice(4));
        else if (line.startsWith('LIVE ')) call.live.push(line.slice(5));
      }
      return call;
    });
  };
  return { bin, log, calls };
}

interface RegistryOptions {
  /** Packument responses that omit 3.15.1 (npm still processing the publish). */
  hiddenPackuments?: number;
  missingTarballs?: number;
  corrupt?: boolean;
  hangTarball?: boolean;
}

async function registry(directory: string, options: RegistryOptions = {}) {
  const { hiddenPackuments = 0, missingTarballs = 0, corrupt = false, hangTarball = false } = options;
  const packageDir = join(directory, 'package');
  mkdirSync(packageDir);
  const manifest = { name: 'agentic-qe', version: '3.15.1' };
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify(manifest));
  const archive = join(directory, 'package.tgz');
  expect(spawnSync('tar', ['-czf', archive, '-C', directory, 'package']).status).toBe(0);
  const bytes = readFileSync(archive);
  const requests: string[] = [];
  let packumentRequests = 0;
  let tarballRequests = 0;
  let base = '';
  const server = createServer((request, response) => {
    const path = request.url ?? '';
    requests.push(path);
    if (path === '/agentic-qe') {
      packumentRequests++;
      const dist = (version: string) => ({
        tarball: `${base}/agentic-qe-${version}.tgz`,
        shasum: createHash('sha1').update(bytes).digest('hex'),
        integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
      });
      const previous = { name: 'agentic-qe', version: '3.15.0', dist: dist('3.15.0') };
      const versions: Record<string, unknown> = { '3.15.0': previous };
      if (packumentRequests > hiddenPackuments) versions['3.15.1'] = { ...manifest, dist: dist('3.15.1') };
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        name: 'agentic-qe',
        'dist-tags': { latest: '3.15.1' in versions ? '3.15.1' : '3.15.0' },
        versions,
      }));
    } else if (path === '/agentic-qe-3.15.1.tgz') {
      tarballRequests++;
      if (hangTarball) return; // never answer: a blackholed download
      if (tarballRequests <= missingTarballs) {
        response.writeHead(404);
        response.end('tarball unavailable');
      } else {
        response.end(corrupt ? Buffer.from('incorrect tarball bytes') : bytes);
      }
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  server.on('connection', (socket) => sockets.push(socket));
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing registry port');
  base = `http://127.0.0.1:${address.port}`;
  return {
    base,
    requests,
    get packumentRequests() { return packumentRequests; },
    get tarballRequests() { return tarballRequests; },
  };
}

/** Accepts TCP connections and never replies, like a stalled registry. */
async function silentRegistry() {
  const server = createTcpServer((socket) => { sockets.push(socket); });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing silent registry port');
  return `http://127.0.0.1:${address.port}/`;
}

async function runProbe(registryUrl: string, directory: string, env: Record<string, string> = {}) {
  const logs = join(directory, 'retained logs');
  const shim = npmShim(directory);
  const result = await run('/bin/bash', [probe], directory, {
    ...cleanEnv(directory),
    PATH: `${shim.bin}:${process.env.PATH}`,
    AQE_TEST_NPM_ARGV: shim.log,
    AQE_TEST_REAL_NPM: realNpm,
    PACKAGE_VERSION: '3.15.1',
    AQE_NPM_WAIT_SECONDS: '30',
    AQE_NPM_POLL_INITIAL_SECONDS: '0',
    AQE_NPM_POLL_MAX_SECONDS: '1',
    AQE_NPM_PROBE_DELAY_SECONDS: '0',
    AQE_NPM_PROBE_LOG_DIR: logs,
    npm_config_registry: registryUrl,
    ...env,
  });
  const summary = existsSync(join(logs, 'summary.txt')) ? readFileSync(join(logs, 'summary.txt'), 'utf8') : '';
  const resultFile = join(logs, 'result.txt');
  const outcome = existsSync(resultFile)
    ? Object.fromEntries(readFileSync(resultFile, 'utf8').trim().split('\n').map((line) => line.split('=')))
    : {};
  return { ...result, directory, logs, summary, outcome, calls: shim.calls() };
}

async function probeLocal(options: RegistryOptions, env: Record<string, string> = {}) {
  const directory = cleanroom();
  const service = await registry(directory, options);
  return { ...(await runProbe(service.base, directory, env)), service };
}

function diagnostics(logs: string, attempt: number, code: number) {
  const directory = join(logs, `attempt-${attempt}`);
  expect(existsSync(join(directory, 'stdout.log'))).toBe(true);
  expect(existsSync(join(directory, 'stderr.log'))).toBe(true);
  expect(readFileSync(join(directory, 'exit-code.txt'), 'utf8').trim()).toBe(String(code));
  const debugLogs = readdirSync(join(directory, 'npm-logs'));
  expect(debugLogs.some((name) => name.endsWith('-debug-0.log'))).toBe(true);
}

const flag = (call: NpmCall, name: string) =>
  call.args.filter((arg) => arg === name || arg.startsWith(`${name}=`)).map((arg) => arg.split('=').slice(1).join('='));
const command = (call: NpmCall) => call.args.find((arg) => !arg.startsWith('-'));

/** Invariants that must hold for every npm process the probe starts, read from the executed argv/env. */
function expectBoundedIsolatedNpm(calls: NpmCall[]) {
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    // Every npm process is a direct child of coreutils `timeout`.
    expect(call.parent, JSON.stringify(call)).toMatch(/timeout$/);
    expect(call.env.home).toMatch(/aqe-npm-probe\.[^/]+\/home$/);
    expect(call.env.home).not.toBe(homedir());
    expect(call.env.npm_config_update_notifier).toBe('false');
    expect(call.env.npm_config_userconfig).toMatch(/aqe-npm-probe\.[^/]+\/user\.npmrc$/);
    if (command(call) === undefined) continue; // `npm --version`
    expect(call.args).toContain('--no-update-notifier');
    expect(flag(call, '--userconfig')).toEqual([call.env.npm_config_userconfig]);
    expect(flag(call, '--fetch-retries')).toEqual(['0']);
    // Any zero, negative, non-numeric, or over-long fetch timeout (argv or env) fails here.
    const timeouts = [...flag(call, '--fetch-timeout'), call.env.npm_config_fetch_timeout].filter((v) => v !== undefined);
    expect(timeouts.length, JSON.stringify(call.args)).toBeGreaterThan(0);
    for (const value of timeouts) {
      expect(value, JSON.stringify(call.args)).toMatch(/^[1-9][0-9]*$/);
      expect(Number(value)).toBeLessThanOrEqual(120_000);
    }
  }
  const packs = calls.filter((call) => command(call) === 'pack');
  for (const call of packs) {
    expect(call.args).toContain('--ignore-scripts');
    expect(call.args).not.toContain('--no-ignore-scripts');
    expect(flag(call, '--ignore-scripts').every((value) => value === '' || value === 'true')).toBe(true);
    expect(call.env.npm_config_ignore_scripts ?? 'true').toBe('true');
  }
  return packs;
}

const POLL_LINE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ poll \d+ \(\+\d+s\): /m;

describe('published tarball probe: phase 1, waiting for npm async processing', () => {
  it('waits while the packument lacks the version (ETARGET window), then downloads it', async () => {
    // Use the workflow's production deadline so the script must accept it.
    const workflowWait = steps.find((step) => step.id === 'probe')!.env!.AQE_NPM_WAIT_SECONDS;
    const result = await probeLocal({ hiddenPackuments: 3 }, { AQE_NPM_WAIT_SECONDS: workflowWait });
    expect(result.code, result.stderr).toBe(0);
    expect(result.summary).toMatch(POLL_LINE);
    const waiting = result.summary.match(/poll \d+ \(\+\d+s\): not available \(exit [1-9]/g) ?? [];
    expect(waiting.length, result.summary).toBeGreaterThanOrEqual(1);
    expect(result.summary).toMatch(/poll \d+ \(\+\d+s\): available \(3\.15\.1\)/);
    expect(result.outcome).toMatchObject({ stage: 'ok', wait_limit_seconds: workflowWait });
    expect(result.service.packumentRequests).toBeGreaterThan(3);
    expect(result.service.tarballRequests).toBe(1);
    const views = result.calls.filter((call) => command(call) === 'view');
    expect(views.length).toBe(waiting.length + 1);
    expectBoundedIsolatedNpm(result.calls);
  }, TEST_TIMEOUT);

  it('fails at the deadline with a distinct "not available" error when the version never appears', async () => {
    const result = await probeLocal({ hiddenPackuments: Number.POSITIVE_INFINITY }, { AQE_NPM_WAIT_SECONDS: '4' });
    expect(result.code, result.stderr).toBe(3);
    expect(result.stderr).toContain('npm did not make agentic-qe@3.15.1 available within 0m4s');
    expect(result.outcome).toMatchObject({ stage: 'availability', wait_limit_seconds: '4' });
    expect(Number(result.outcome.wait_seconds)).toBeGreaterThanOrEqual(4);
    expect(result.seconds).toBeLessThan(4 + SLACK_SECONDS);
    expect(result.service.tarballRequests).toBe(0);
    expect(existsSync(join(result.logs, 'attempt-1'))).toBe(false);
    expect(result.calls.some((call) => command(call) === 'pack')).toBe(false);
    expectBoundedIsolatedNpm(result.calls);
  }, TEST_TIMEOUT);

  it.each([
    ['a local registry that accepts connections and never replies', 'silent'],
    ['a blackholed address (10.255.255.1)', 'http://10.255.255.1/'],
  ])('respects the total deadline against %s', async (_label, target) => {
    const directory = cleanroom();
    const url = target === 'silent' ? await silentRegistry() : target;
    const result = await runProbe(url, directory, {
      AQE_NPM_WAIT_SECONDS: '6',
      AQE_NPM_VIEW_TIMEOUT_SECONDS: '5',
      AQE_NPM_POLL_INITIAL_SECONDS: '1',
    });
    expect(result.code, result.stderr).toBe(3);
    expect(result.seconds).toBeLessThan(6 + SLACK_SECONDS);
    expect(result.stderr).toContain('npm did not make agentic-qe@3.15.1 available within 0m6s');
    if (target === 'silent') expect(result.summary).toContain('npm view timed out');
    expectBoundedIsolatedNpm(result.calls);
  }, TEST_TIMEOUT);

  it('rejects out-of-range deadlines and malformed versions before touching the network', async () => {
    const directory = cleanroom();
    for (const env of <Array<Record<string, string>>>[
      { AQE_NPM_WAIT_SECONDS: '99999' },
      { AQE_NPM_WAIT_SECONDS: '0' },
      { AQE_NPM_PACK_TIMEOUT_SECONDS: '0' },
      { PACKAGE_VERSION: '3.15.1; touch pwned' },
    ]) {
      const result = await runProbe('http://127.0.0.1:9/', directory, env);
      expect(result.code, `${JSON.stringify(env)}: ${result.stderr}`).toBe(2);
      expect(result.calls).toEqual([]);
    }
    expect(existsSync(join(directory, 'pwned'))).toBe(false);
  }, TEST_TIMEOUT);
});

describe('published tarball probe: phase 2, bounded download (real npm, local HTTP registry)', () => {
  it('rejects available metadata when the actual tarball is unavailable', async () => {
    const result = await probeLocal({ missingTarballs: 1 }, { AQE_NPM_PROBE_ATTEMPTS: '1' });
    expect(result.code, result.stderr).toBe(1);
    expect(result.service.tarballRequests).toBe(1);
    expect(result.stderr).toContain('E404');
    expect(result.outcome).toMatchObject({ stage: 'pack' });
    diagnostics(result.logs, 1, 1);
    expect(readFileSync(join(result.logs, 'attempt-1/stderr.log'), 'utf8')).toContain('E404');
  }, TEST_TIMEOUT);

  it('recovers after a failed fetch with fresh caches, scripts disabled, and summarised output', async () => {
    const result = await probeLocal({ missingTarballs: 1 }, { AQE_NPM_PROBE_ATTEMPTS: '3' });
    expect(result.code, result.stderr).toBe(0);
    expect(result.service.tarballRequests).toBe(2);
    diagnostics(result.logs, 1, 1);
    diagnostics(result.logs, 2, 0);
    expect(existsSync(join(result.logs, 'attempt-3'))).toBe(false);
    expect(result.summary).toContain('Attempt 2/3: exit 0');
    expect(result.summary).toContain('attempt 2');
    const packed = JSON.parse(readFileSync(join(result.logs, 'attempt-2/stdout.log'), 'utf8'));
    expect(packed[0]).toMatchObject({ name: 'agentic-qe', version: '3.15.1' });
    // The ~100 KB pack JSON stays in the artifact; the console gets one identity line.
    expect(result.stdout).not.toContain('"files"');
    expect(result.stdout).toMatch(/agentic-qe@3\.15\.1 agentic-qe-3\.15\.1\.tgz size=\d+ shasum=[0-9a-f]{40}/);
    const packs = expectBoundedIsolatedNpm(result.calls);
    expect(packs).toHaveLength(2);
    const caches = packs.map((call) => call.args[call.args.indexOf('--cache') + 1]);
    expect(packs.every((call) => call.args.includes('--cache'))).toBe(true);
    expect(caches[0]).toBeTruthy();
    expect(caches[0]).not.toBe(caches[1]);
    for (const cache of caches) expect(existsSync(cache)).toBe(false);
    // Attempt 1's directory (and cache) is gone before attempt 2 starts.
    expect(packs[1].live).toEqual([resolve(caches[1], '..')]);
  }, TEST_TIMEOUT);

  it('exhausts its bounded attempts and retains every error, exit code, and npm debug log', async () => {
    const result = await probeLocal({ missingTarballs: 3 }, { AQE_NPM_PROBE_ATTEMPTS: '3' });
    expect(result.code, result.stderr).toBe(1);
    expect(result.service.tarballRequests).toBe(3);
    expect(result.stderr).toContain('after 3 attempts');
    for (const attempt of [1, 2, 3]) diagnostics(result.logs, attempt, 1);
    expect(result.summary).toContain('Attempt 3/3: exit 1');
  }, TEST_TIMEOUT);

  it('bounds a stalled tarball download by the download deadline', async () => {
    const result = await probeLocal({ hangTarball: true }, {
      AQE_NPM_PACK_SECONDS: '6',
      AQE_NPM_PACK_TIMEOUT_SECONDS: '3',
      AQE_NPM_PROBE_ATTEMPTS: '10',
    });
    expect(result.code, result.stderr).toBe(1);
    expect(result.seconds).toBeLessThan(6 + SLACK_SECONDS);
    expect(result.summary).toContain('npm pack timed out (attempt 1)');
    expect(result.outcome).toMatchObject({ stage: 'pack' });
    expectBoundedIsolatedNpm(result.calls);
  }, TEST_TIMEOUT);

  it('fails corrupt tarball bytes instead of accepting a successful HTTP response', async () => {
    const result = await probeLocal({ corrupt: true }, { AQE_NPM_PROBE_ATTEMPTS: '1' });
    expect(result.code, result.stderr).toBe(1);
    expect(result.service.tarballRequests).toBeGreaterThan(0);
    expect(readFileSync(join(result.logs, 'attempt-1/stderr.log'), 'utf8')).toContain('EINTEGRITY');
    diagnostics(result.logs, 1, 1);
  }, TEST_TIMEOUT);
});

describe('canary workflow evidence and reporting', () => {
  it('executes the pinned source only after a successful release from this repository', () => {
    const condition = String(workflow.jobs.canary.if).replace(/^\s*\$\{\{|\}\}\s*$/g, '');
    const evaluate = new Function('github', `return Boolean(${condition});`) as (github: unknown) => boolean;
    const context = (conclusion = 'success', event = 'release', repository = 'proffesor-for-testing/agentic-qe') => ({
      repository: 'proffesor-for-testing/agentic-qe',
      event: { workflow_run: { conclusion, event, head_repository: { full_name: repository } } },
    });
    expect(evaluate(context())).toBe(true);
    expect(evaluate(context('success', 'release', 'other-owner/agentic-qe'))).toBe(false);
    expect(evaluate(context('failure'))).toBe(false);
    expect(evaluate(context('cancelled'))).toBe(false);
    expect(evaluate(context('success', 'workflow_dispatch'))).toBe(false);
    expect(evaluate(context('success', 'pull_request'))).toBe(false);
  });

  it('pins the published source, runs the workflow-revision probe, and uploads diagnostics even on failure', () => {
    const checkout = steps.find((step) => step.id === 'checkout');
    expect(checkout?.with?.ref).toBe('${{ github.event.workflow_run.head_sha }}');
    const tools = steps.find((step) => step.id === 'checkout_tools');
    expect(tools?.with).toMatchObject({
      ref: '${{ github.sha }}', path: '.canary-tools', 'sparse-checkout': 'scripts/probe-npm-tarball.sh',
    });
    const probeStep = steps.find((step) => step.id === 'probe');
    expect(probeStep?.run).toBe('bash .canary-tools/scripts/probe-npm-tarball.sh');
    expect(probeStep?.env?.PACKAGE_VERSION).toBe('${{ steps.version.outputs.version }}');
    expect(probeStep?.env?.AQE_NPM_PROBE_LOG_DIR).toBe('${{ github.workspace }}/probe-logs');
    const upload = steps.find((step) => step.id === 'upload_probe');
    expect(upload?.if).toBe('always()');
    expect(upload?.with?.path).toBe('probe-logs/');
  });

  it('sizes the wait above the measured npm delay and inside the step and job timeouts', () => {
    const probeStep = steps.find((step) => step.id === 'probe')!;
    const waitSeconds = Number(probeStep.env?.AQE_NPM_WAIT_SECONDS);
    const script = readFileSync(probe, 'utf8');
    const packSeconds = Number(script.match(/AQE_NPM_PACK_SECONDS:-(\d+)/)?.[1]);
    // Longest measured publish-to-availability delay (3.14.5) was 16m14s.
    expect(waitSeconds).toBeGreaterThanOrEqual(974 + 300);
    const probeBudgetMinutes = (waitSeconds + packSeconds) / 60;
    expect(probeStep['timeout-minutes']).toBeGreaterThanOrEqual(probeBudgetMinutes + 3);
    // Leave room after the probe step's backstop for audit, corpus, init, and the issue step.
    expect(workflow.jobs.canary['timeout-minutes']).toBeGreaterThanOrEqual(probeStep['timeout-minutes']! + 10);
    expect(script).not.toMatch(/^\s*npm install --dry-run/m);
  });

  it('keeps the token out of .git/config, needs no actions scope, and installs without scripts for audit', () => {
    for (const step of steps.filter((entry) => String(entry.uses ?? '').startsWith('actions/checkout'))) {
      expect(step.with?.['persist-credentials'], step.name).toBe(false);
    }
    expect(workflow.permissions).toEqual({ contents: 'read', issues: 'write' });
    const audit = steps.find((step) => step.id === 'audit');
    const installs = (audit?.run ?? '').split('\n').filter((line) => /^\s*npm install\b/.test(line));
    expect(installs).toHaveLength(1);
    expect(installs[0]).toContain('--ignore-scripts');
  });

  const failureCases: Array<[string, Record<string, string>, (body: string) => void]> = [
    ['probe', { PROBE_STAGE: 'availability', PROBE_WAIT_SECONDS: '1501', PROBE_WAIT_LIMIT_SECONDS: '1500' }, (body) => {
      expect(body).toContain('**npm did not make v3.15.1 available within 25 min (waited 1501s).');
      expect(body).toContain('AQE_NPM_WAIT_SECONDS=2700 PACKAGE_VERSION=3.15.1 bash scripts/probe-npm-tarball.sh');
    }],
    ['probe', { PROBE_STAGE: 'pack', PROBE_WAIT_SECONDS: '612', PROBE_WAIT_LIMIT_SECONDS: '1500' }, (body) => {
      expect(body).toContain('**npm listed v3.15.1 after 612s, but downloading the tarball failed.**');
      expect(body).not.toContain('did not make');
    }],
    ['corpus_setup', { PROBE_STAGE: 'ok', PROBE_WAIT_SECONDS: '488', PROBE_WAIT_LIMIT_SECONDS: '1500' }, (body) => {
      expect(body).toContain('**Failed stage: corpus_setup (availability awaited 488s).**');
    }],
    ['init', { PROBE_STAGE: 'ok', PROBE_WAIT_SECONDS: '0', PROBE_WAIT_LIMIT_SECONDS: '1500' }, (body) => {
      expect(body).toContain('**Failed stage: init (availability awaited 0s).**');
    }],
  ];

  it.each(failureCases)('reports a %s failure (%o) with its stage and wait, without labels', async (stage, probeEnv, check) => {
    const step = steps.find((entry) => entry.name === 'Open issue on canary failure');
    expect(step?.env?.STEP_OUTCOMES).toBe('${{ toJSON(steps) }}');
    expect(step?.env?.PROBE_STAGE).toBe('${{ steps.probe.outputs.stage }}');
    expect(step?.run).not.toContain('--label');
    const directory = cleanroom();
    const argsFile = join(directory, 'gh-args.txt');
    const bodyFile = join(directory, 'captured-body.md');
    writeFileSync(join(directory, 'gh'), `#!/bin/sh
printf '%s\\n' "$@" > "$AQE_TEST_ARGS"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --label) exit 42 ;;
    --body-file) shift; cp "$1" "$AQE_TEST_BODY" ;;
  esac
  shift
done
`, { mode: 0o755 });
    const outcomes = {
      probe: { outcome: stage === 'probe' ? 'failure' : 'success' },
      audit: { outcome: stage === 'probe' ? 'skipped' : 'success' },
      corpus_setup: { outcome: stage === 'corpus_setup' ? 'failure' : stage === 'probe' ? 'skipped' : 'success' },
      init: { outcome: stage === 'init' ? 'failure' : 'skipped' },
    };
    const result = await run('/bin/bash', ['-e', '-c', step!.run!], directory, {
      ...cleanEnv(directory),
      PATH: `${directory}:${process.env.PATH}`,
      RUNNER_TEMP: directory,
      PACKAGE_VERSION: '3.15.1',
      RUN_URL: 'https://example.test/run/123',
      STEP_OUTCOMES: JSON.stringify(outcomes),
      AQE_TEST_ARGS: argsFile,
      AQE_TEST_BODY: bodyFile,
      ...probeEnv,
    });
    expect(result.code, result.stderr).toBe(0);
    const body = readFileSync(bodyFile, 'utf8');
    expect(body).toContain(`Failed steps: ${stage}`);
    expect(body).toContain(`Failed stage: ${stage}`);
    expect(body).toContain(`availability awaited: ${probeEnv.PROBE_WAIT_SECONDS}s`);
    expect(body).toContain(`| init | ${outcomes.init.outcome} |`);
    expect(body).toContain('canary-probe-3.15.1');
    expect(body).not.toContain('init corpus gate failed');
    check(body);
    expect(readFileSync(argsFile, 'utf8')).not.toContain('--label');
  });
});
