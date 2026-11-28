/**
 * #1493 end to end with the built CLI (`dist/cli/bundle.js`, run
 * `npm run build` first) in a fresh `aqe init --auto` project.
 *
 * The installed PostToolUse hook ran `post-task ... --success true` after
 * every Task/Agent call. That constant must not raise a pattern's success
 * rate, create a successful captured experience, or seed a pattern through
 * session-end consolidation. `--outcome success|failure` still records.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';

const CLI_PATH = resolve(__dirname, '..', '..', '..', 'dist', 'cli', 'bundle.js');
const ENV_DROP = ['LOG_LEVEL', 'AQE_LOG_LEVEL', 'AQE_VERBOSE', 'AQE_PROJECT_ROOT', 'DEBUG'];

let projectDir: string;
let homeDir: string;

function cli(...args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: homeDir };
  for (const key of ENV_DROP) delete env[key];
  const res = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: projectDir, encoding: 'utf-8', env, timeout: 90_000,
  });
  return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', status: res.status };
}

function postTask(...args: string[]): Record<string, unknown> {
  const res = cli('hooks', 'post-task', ...args, '--json');
  expect(res.status, res.stderr).toBe(0);
  return JSON.parse(res.stdout.slice(res.stdout.indexOf('{')));
}

/** Short-lived connection so the CLI subprocesses never see our lock. */
function withDb<T>(fn: (db: Database.Database) => T): T {
  const db = new Database(join(projectDir, '.agentic-qe', 'memory.db'));
  try { return fn(db); } finally { db.close(); }
}

/** The kv_store key pre-task writes for a description (task-hooks.ts taskBridgeKey). */
const bridgeKey = (description: string) =>
  `task:${createHash('sha256').update(description).digest('hex').slice(0, 16)}`;

function seedPatternAndBridge(id: string): void {
  withDb((db) => {
    db.prepare(`
      INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence,
        usage_count, successful_uses, success_rate, quality_score, tier, template_json, context_json)
      VALUES (?, 'test-template', 'test-generation', 'test-generation', ?, 'seeded', 0.7, 2, 2, 1.0, 0.7,
        'short-term', '{}', '{"tags":["seeded"]}')
    `).run(id, id);
    // #1501: post-task reads the entry pre-task wrote for the same description.
    db.prepare(`INSERT INTO kv_store (key, namespace, value, expires_at, created_at) VALUES (?, 'task-bridge', ?, ?, ?)`)
      .run(bridgeKey(`prompt ${id}`), JSON.stringify({
        selectedPatternIds: [id], agent: 'coder', description: 'd', taskType: 'test', priority: 'normal',
        domain: 'test-generation', complexityBucket: 1, estimatedTokenSavings: 0, ts: Date.now(),
      }), Date.now() + 600_000, Date.now());
  });
}

const patternRow = (id: string) => withDb((db) => db.prepare(
  `SELECT tier, usage_count, successful_uses FROM qe_patterns WHERE id = ?`,
).get(id));
const experiences = (agent: string) => withDb((db) => db.prepare(
  `SELECT source, success FROM captured_experiences WHERE agent = ? ORDER BY success`,
).all(agent));

describe('post-task with the built CLI (#1493)', { timeout: 300_000 }, () => {
  beforeAll(() => {
    if (!existsSync(CLI_PATH)) {
      throw new Error(`CLI bundle not found at ${CLI_PATH}. Run \`npm run build\` first.`);
    }
    projectDir = mkdtempSync(join(tmpdir(), 'aqe-1493-'));
    homeDir = mkdtempSync(join(tmpdir(), 'aqe-1493-home-'));
    writeFileSync(join(projectDir, 'package.json'), '{"name":"aqe-1493","version":"1.0.0"}\n');
    const init = cli('init', '--auto', '--minimal', '--skip-code-index');
    expect(init.status, init.stderr).toBe(0);
    // One observed run creates the lazily-built learning tables.
    postTask('--task-id', 'warmup', '--agent', 'warmup', '--outcome', 'success');
  });

  afterAll(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  });

  it('records nothing for the installed constant --success true', () => {
    seedPatternAndBridge('pat-unobserved');

    const out = postTask('--task-id', 'u1', '--agent', 'coder', '--description', 'prompt pat-unobserved', '--success', 'true');

    expect(out).toMatchObject({ success: true, taskSuccess: null, outcomeObserved: false });
    expect(patternRow('pat-unobserved')).toEqual({ tier: 'short-term', usage_count: 2, successful_uses: 2 });
    expect(experiences('coder')).toEqual([]);
    // The bridge was retired, so a later observed task cannot claim it.
    expect(withDb((db) => db.prepare(`SELECT COUNT(*) AS n FROM kv_store WHERE namespace = 'task-bridge'`).get()))
      .toEqual({ n: 0 });
  });

  it('builds no pattern from unobserved tasks at session-end', () => {
    for (const id of ['s1', 's2', 's3']) postTask('--task-id', id, '--agent', 'reviewer', '--success', 'true');

    expect(cli('hooks', 'session-end', '--json').status).toBe(0);

    expect(experiences('reviewer')).toEqual([]);
    expect(withDb((db) => db.prepare(`SELECT COUNT(*) AS n FROM qe_patterns WHERE name LIKE 'reviewer-%'`).get()))
      .toEqual({ n: 0 });
  });

  it('records an observed --outcome failure and success', () => {
    seedPatternAndBridge('pat-observed');

    expect(postTask('--task-id', 'o1', '--agent', 'tester', '--description', 'prompt pat-observed', '--outcome', 'success'))
      .toMatchObject({ taskSuccess: true });
    expect(postTask('--task-id', 'o2', '--agent', 'tester', '--outcome', 'failure')).toMatchObject({ taskSuccess: false });

    expect(experiences('tester')).toEqual([
      { source: 'cli-hook-post-task-observed', success: 0 },
      { source: 'cli-hook-post-task-observed', success: 1 },
    ]);
    // The observed success reached the bridged pattern and promoted it (3/3).
    expect(patternRow('pat-observed')).toEqual({ tier: 'long-term', usage_count: 3, successful_uses: 3 });
  });
});
