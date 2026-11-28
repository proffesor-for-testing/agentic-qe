/**
 * #1501 end to end with the built CLI (`dist/cli/bundle.js`, run
 * `npm run build` first) in a fresh `aqe init --auto` project.
 *
 * The installed PostToolUse hooks ran `post-edit ... --success` and
 * `post-command ... --success true` after every edit and Bash command, and
 * post-command defaulted `--success` to true. That constant must not create
 * a successful captured experience, a passing test_outcomes row, a
 * tool-loop reset, or a pattern through session-end consolidation.
 * `--outcome success|failure` still records.
 *
 * Also: post-task reads THIS task's pre-task bridge entry (by description),
 * not the newest one (#1501, left over from #1493).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';

const CLI_PATH = resolve(__dirname, '..', '..', '..', 'dist', 'cli', 'bundle.js');
const ENV_DROP = ['LOG_LEVEL', 'AQE_LOG_LEVEL', 'AQE_VERBOSE', 'AQE_PROJECT_ROOT', 'DEBUG'];
const MONTH = new Date().toISOString().slice(0, 7);

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

function hook(name: string, ...args: string[]): Record<string, unknown> {
  const res = cli('hooks', name, ...args, '--json');
  expect(res.status, res.stderr).toBe(0);
  return JSON.parse(res.stdout.slice(res.stdout.indexOf('{')));
}

/** Short-lived connection so the CLI subprocesses never see our lock. */
function withDb<T>(fn: (db: Database.Database) => T): T {
  const db = new Database(join(projectDir, '.agentic-qe', 'memory.db'));
  try { return fn(db); } finally { db.close(); }
}

const all = (sql: string, ...params: unknown[]) => withDb((db) => db.prepare(sql).all(...params));
const hookExperiences = () => all(
  `SELECT source, success FROM captured_experiences WHERE agent = 'cli-hook' ORDER BY source, success`,
);
const toolLoopState = (): Record<string, unknown> => {
  const file = join(projectDir, '.agentic-qe', 'tool-loop-state.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : {};
};

function seedPattern(id: string, opts: { name?: string; tags?: string[]; domain?: string } = {}): void {
  withDb((db) => db.prepare(`
    INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence,
      usage_count, successful_uses, success_rate, quality_score, tier, template_json, context_json)
    VALUES (?, 'workflow', ?, ?, ?, 'seeded', 0.7, 2, 2, 1.0, 0.7, 'short-term', '{}', ?)
  `).run(id, opts.domain ?? 'test-generation', opts.domain ?? 'test-generation', opts.name ?? id,
    JSON.stringify({ tags: opts.tags ?? ['seeded'] })));
}

/** The kv_store key pre-task writes for a description (task-hooks.ts taskBridgeKey). */
const bridgeKey = (description: string) =>
  `task:${createHash('sha256').update(description).digest('hex').slice(0, 16)}`;

function seedBridge(description: string, patternId: string, createdAt: number): void {
  withDb((db) => db.prepare(
    `INSERT INTO kv_store (key, namespace, value, expires_at, created_at) VALUES (?, 'task-bridge', ?, ?, ?)`,
  ).run(bridgeKey(description), JSON.stringify({
    selectedPatternIds: [patternId], agent: 'coder', description, taskType: 'test', priority: 'normal',
    domain: 'test-generation', complexityBucket: 1, estimatedTokenSavings: 0, ts: createdAt,
  }), Date.now() + 600_000, createdAt));
}

const usage = (id: string) => withDb((db) => db.prepare(
  `SELECT usage_count, successful_uses FROM qe_patterns WHERE id = ?`,
).get(id));
const bridges = () => (all(`SELECT key FROM kv_store WHERE namespace = 'task-bridge' ORDER BY key`) as Array<{ key: string }>)
  .map((r) => r.key);

describe('post-edit / post-command with the built CLI (#1501)', { timeout: 300_000 }, () => {
  beforeAll(() => {
    if (!existsSync(CLI_PATH)) {
      throw new Error(`CLI bundle not found at ${CLI_PATH}. Run \`npm run build\` first.`);
    }
    projectDir = mkdtempSync(join(tmpdir(), 'aqe-1501-'));
    homeDir = mkdtempSync(join(tmpdir(), 'aqe-1501-home-'));
    writeFileSync(join(projectDir, 'package.json'), '{"name":"aqe-1501","version":"1.0.0"}\n');
    const init = cli('init', '--auto', '--minimal', '--skip-code-index');
    expect(init.status, init.stderr).toBe(0);
    // One observed run creates the lazily-built learning tables.
    hook('post-task', '--task-id', 'warmup', '--agent', 'warmup', '--outcome', 'success');
  });

  afterAll(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  });

  it('installs post-edit and post-command hooks without a constant --success', () => {
    const settings = readFileSync(join(projectDir, '.claude', 'settings.json'), 'utf-8');
    expect(settings).toMatch(/post-edit --file \\"\$TOOL_INPUT_file_path\\" --json/);
    expect(settings).toMatch(/post-command --command \\"\$TOOL_INPUT_command\\" --json/);
    expect(settings).not.toMatch(/post-(edit|command)[^"]*--success/);
  });

  it('records nothing for the installed constant --success', () => {
    for (const f of ['a', 'b', 'c']) {
      expect(hook('post-edit', '--file', `src/${f}.ts`, '--success'))
        .toMatchObject({ success: true, editSuccess: null, outcomeObserved: false });
    }
    expect(hook('post-command', '--command', 'npx vitest run', '--success', 'true'))
      .toMatchObject({ commandSuccess: null, outcomeObserved: false, experienceRecorded: false, patternsLearned: 0 });
    // no flag at all used to default to success
    expect(hook('post-command', '--command', 'npm run build'))
      .toMatchObject({ commandSuccess: null, outcomeObserved: false, experienceRecorded: false });

    expect(hookExperiences()).toEqual([]);
    expect(all(`SELECT COUNT(*) AS n FROM test_outcomes`)).toEqual([{ n: 0 }]);
    expect(toolLoopState()).toEqual({});

    expect(cli('hooks', 'session-end', '--json').status).toBe(0);
    expect(all(`SELECT COUNT(*) AS n FROM qe_patterns WHERE name LIKE 'cli-hook-%'`)).toEqual([{ n: 0 }]);
  });

  it('records observed outcomes, and consolidates them apart from a legacy pattern', () => {
    // A pattern consolidated from legacy post-edit rows already holds the name.
    seedPattern('legacy-edit', {
      name: `cli-hook-code-intelligence-${MONTH}`, domain: 'code-intelligence', tags: ['cli-hook-post-edit'],
    });
    for (const f of ['d', 'e', 'f']) {
      expect(hook('post-edit', '--file', `src/${f}.ts`, '--outcome', 'success'))
        .toMatchObject({ editSuccess: true, outcomeObserved: true });
    }
    expect(hook('post-command', '--command', 'npx vitest run', '--outcome', 'failure', '--exit-code', '1'))
      .toMatchObject({ commandSuccess: false, outcomeObserved: true, exitCode: 1, experienceRecorded: true });

    expect(hookExperiences()).toEqual([
      { source: 'cli-hook-post-command-observed', success: 0 },
      { source: 'cli-hook-post-edit-observed', success: 1 },
      { source: 'cli-hook-post-edit-observed', success: 1 },
      { source: 'cli-hook-post-edit-observed', success: 1 },
    ]);
    expect(all(`SELECT generated_by, passed FROM test_outcomes`))
      .toEqual([{ generated_by: 'cli-hook-post-command-observed', passed: 0 }]);
    expect(toolLoopState()).toMatchObject({ 'npx vitest run': { consecutiveFailures: 1 } });

    expect(cli('hooks', 'session-end', '--json').status).toBe(0);
    expect(all(`SELECT id, name, usage_count, successful_uses FROM qe_patterns WHERE name LIKE 'cli-hook-%' ORDER BY name`))
      .toEqual([
        { id: 'legacy-edit', name: `cli-hook-code-intelligence-${MONTH}`, usage_count: 2, successful_uses: 2 },
        expect.objectContaining({ name: `cli-hook-code-intelligence-${MONTH}-observed` }),
      ]);
  });

  it('rejects an --outcome other than success or failure', () => {
    const res = cli('hooks', 'post-command', '--command', 'npm test', '--outcome', 'maybe', '--json');
    expect(JSON.parse(res.stdout.slice(res.stdout.indexOf('{')))).toMatchObject({ success: false });
  });

  it('post-task credits this task\'s bridge, not the newest one', () => {
    seedPattern('pat-a');
    seedPattern('pat-b');
    seedBridge('task A prompt', 'pat-a', Date.now() - 5_000);
    seedBridge('task B prompt', 'pat-b', Date.now());

    hook('post-task', '--task-id', 'ta', '--agent', 'coder', '--description', 'task A prompt', '--outcome', 'success');

    expect(usage('pat-a')).toEqual({ usage_count: 3, successful_uses: 3 });
    expect(usage('pat-b')).toEqual({ usage_count: 2, successful_uses: 2 });
    expect(bridges()).toEqual([bridgeKey('task B prompt')]);

    // An unobserved task retires only its own entry.
    seedBridge('task C prompt', 'pat-a', Date.now() + 1_000);
    hook('post-task', '--task-id', 'tb', '--agent', 'coder', '--description', 'task B prompt');
    expect(bridges()).toEqual([bridgeKey('task C prompt')]);
    // Without a description no entry is read or removed.
    hook('post-task', '--task-id', 'tc', '--agent', 'coder', '--outcome', 'success');
    expect(bridges()).toEqual([bridgeKey('task C prompt')]);
    expect(usage('pat-a')).toEqual({ usage_count: 3, successful_uses: 3 });
  });
});
