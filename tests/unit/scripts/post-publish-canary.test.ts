import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Step {
  name: string;
  id?: string;
  if?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
}

const root = resolve(import.meta.dirname, '../../..');
const probe = join(root, 'scripts/probe-npm-tarball.sh');
const workflow = parse(readFileSync(join(root, '.github/workflows/post-publish-canary.yml'), 'utf8'));
const steps: Step[] = workflow.jobs.canary.steps;
const fixtures: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
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
  const child = spawn(command, args, { cwd: directory, env });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (data) => { stdout += data; });
  child.stderr.on('data', (data) => { stderr += data; });
  const code = await new Promise<number | null>((done, reject) => {
    child.once('error', reject);
    child.once('close', done);
  });
  return { code, stdout, stderr };
}

async function registry(directory: string, missingAttempts: number, corrupt = false) {
  const packageDir = join(directory, 'package');
  mkdirSync(packageDir);
  const manifest = {
    name: 'agentic-qe', version: '3.15.1',
    scripts: { prepack: 'node -e "require(\'fs\').writeFileSync(\'lifecycle-ran\',\'yes\')"' },
  };
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify(manifest));
  const archive = join(directory, 'package.tgz');
  expect(spawnSync('tar', ['-czf', archive, '-C', directory, 'package']).status).toBe(0);
  const bytes = readFileSync(archive);
  const requests: string[] = [];
  let tarballRequests = 0;
  let base = '';
  const server = createServer((request, response) => {
    const path = request.url ?? '';
    requests.push(path);
    if (path === '/agentic-qe' || path === '/agentic-qe/3.15.1') {
      const version = {
        ...manifest,
        dist: {
          tarball: `${base}/agentic-qe-3.15.1.tgz`,
          shasum: createHash('sha1').update(bytes).digest('hex'),
          integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
        },
      };
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(path.endsWith('/3.15.1') ? version : {
        name: 'agentic-qe', 'dist-tags': { latest: '3.15.1' }, versions: { '3.15.1': version },
      }));
    } else if (path === '/agentic-qe-3.15.1.tgz') {
      tarballRequests++;
      if (tarballRequests <= missingAttempts) {
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
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing registry port');
  base = `http://127.0.0.1:${address.port}`;
  return { base, requests, get tarballRequests() { return tarballRequests; } };
}

async function runProbe(missingAttempts: number, attempts: number, corrupt = false) {
  const directory = cleanroom();
  const service = await registry(directory, missingAttempts, corrupt);
  const logs = join(directory, 'retained logs');
  const result = await run('/bin/bash', [probe], directory, {
    ...cleanEnv(directory),
    PACKAGE_VERSION: '3.15.1',
    AQE_NPM_PROBE_ATTEMPTS: String(attempts),
    AQE_NPM_PROBE_DELAY_SECONDS: '0',
    AQE_NPM_PROBE_LOG_DIR: logs,
    npm_config_registry: service.base,
  });
  return { ...result, directory, logs, service };
}

function diagnostics(logs: string, attempt: number, code: number) {
  const directory = join(logs, `attempt-${attempt}`);
  expect(existsSync(join(directory, 'stdout.log'))).toBe(true);
  expect(existsSync(join(directory, 'stderr.log'))).toBe(true);
  expect(readFileSync(join(directory, 'exit-code.txt'), 'utf8').trim()).toBe(String(code));
  const debugLogs = readdirSync(join(directory, 'npm-logs'));
  expect(debugLogs.some((name) => name.endsWith('-debug-0.log'))).toBe(true);
  return debugLogs.map((name) => readFileSync(join(directory, 'npm-logs', name), 'utf8')).join('\n');
}

describe('published tarball availability probe (real npm, local HTTP registry)', () => {
  it('rejects available metadata when the actual tarball is unavailable', async () => {
    const result = await runProbe(1, 1);
    expect(result.code, result.stderr).toBe(1);
    expect(result.service.tarballRequests).toBe(1);
    expect(result.stderr).toContain('E404');
    expect(result.stderr).not.toContain('not yet on CDN');
    diagnostics(result.logs, 1, 1);
    expect(readFileSync(join(result.logs, 'attempt-1/stderr.log'), 'utf8')).toContain('E404');
  });

  it('recovers after a failed fetch, preserving both attempts and using fresh caches', async () => {
    const result = await runProbe(1, 3);
    expect(result.code, result.stderr).toBe(0);
    expect(result.service.tarballRequests).toBe(2);
    // npm may request both abbreviated and full metadata within one pack.
    expect(result.service.requests.filter((path) => path === '/agentic-qe').length).toBeGreaterThanOrEqual(2);
    const firstDebug = diagnostics(result.logs, 1, 1);
    const secondDebug = diagnostics(result.logs, 2, 0);
    const firstCache = firstDebug.match(/"--cache" "([^"]+)"/)?.[1];
    const secondCache = secondDebug.match(/"--cache" "([^"]+)"/)?.[1];
    expect(firstCache).toBeDefined();
    expect(secondCache).toBeDefined();
    expect(firstCache).not.toBe(secondCache);
    expect(existsSync(firstCache!)).toBe(false);
    expect(existsSync(secondCache!)).toBe(false);
    expect(existsSync(join(result.logs, 'attempt-3'))).toBe(false);
    expect(readFileSync(join(result.logs, 'summary.txt'), 'utf8')).toContain('attempt 2');
    const packed = JSON.parse(readFileSync(join(result.logs, 'attempt-2/stdout.log'), 'utf8'));
    expect(packed[0]).toMatchObject({ name: 'agentic-qe', version: '3.15.1' });
    expect(existsSync(join(result.directory, 'package/lifecycle-ran'))).toBe(false);
  });

  it('exhausts its bounded attempts and retains every error, exit code, and npm debug log', async () => {
    const result = await runProbe(3, 3);
    expect(result.code, result.stderr).toBe(1);
    expect(result.service.tarballRequests).toBe(3);
    expect(result.stderr).toContain('after 3 attempts');
    for (const attempt of [1, 2, 3]) diagnostics(result.logs, attempt, 1);
    expect(readFileSync(join(result.logs, 'summary.txt'), 'utf8')).toContain('Attempt 3/3: exit 1');
  });

  it('fails corrupt tarball bytes instead of accepting a successful HTTP response', async () => {
    const result = await runProbe(0, 1, true);
    expect(result.code, result.stderr).toBe(1);
    expect(result.service.tarballRequests).toBeGreaterThan(0);
    expect(readFileSync(join(result.logs, 'attempt-1/stderr.log'), 'utf8')).toContain('EINTEGRITY');
    diagnostics(result.logs, 1, 1);
  });
});

describe('canary workflow evidence and reporting', () => {
  it('pins the published source and uploads probe diagnostics even on failure', () => {
    expect(steps.find((step) => step.id === 'checkout')?.with?.ref)
      .toBe('${{ github.event.workflow_run.head_sha }}');
    const probeStep = steps.find((step) => step.id === 'probe');
    expect(probeStep?.run).toBe('bash scripts/probe-npm-tarball.sh');
    expect(probeStep?.env?.PACKAGE_VERSION).toBe('${{ steps.version.outputs.version }}');
    expect(probeStep?.env?.AQE_NPM_PROBE_LOG_DIR).toBe('${{ github.workspace }}/probe-logs');
    const upload = steps.find((step) => step.id === 'upload_probe');
    expect(upload?.if).toBe('always()');
    expect(upload?.with?.path).toBe('probe-logs/');
  });

  it('uses real pack with scripts disabled and bounded network retries', () => {
    const script = readFileSync(probe, 'utf8');
    expect(script).toContain('npm pack --ignore-scripts --json');
    expect(script).toContain('--fetch-retries=0');
    expect(script).toContain('--fetch-timeout=15000');
    expect(script).not.toMatch(/^\s*npm install --dry-run/m);
  });

  it.each(['probe', 'corpus_setup', 'init'])('reports a %s failure without assuming init ran or requiring labels', async (stage) => {
    const step = steps.find((entry) => entry.name === 'Open issue on canary failure');
    expect(step?.env?.STEP_OUTCOMES).toBe('${{ toJSON(steps) }}');
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
    });
    expect(result.code).toBe(0);
    const body = readFileSync(bodyFile, 'utf8');
    expect(body).toContain(`Failed steps: ${stage}`);
    expect(body).toContain(`| init | ${outcomes.init.outcome} |`);
    expect(body).toContain('canary-probe-3.15.1');
    expect(body).not.toContain('init corpus gate failed');
    expect(readFileSync(argsFile, 'utf8')).not.toContain('--label');
  });
});
