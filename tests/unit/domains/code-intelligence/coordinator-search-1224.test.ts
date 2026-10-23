/**
 * #1224: the code-intelligence search answers only from indexed files. It
 * fails when nothing is indexed, never returns placeholder files (`file-0`)
 * with empty snippets, and its `total` matches its `results`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CodeIntelligenceCoordinator } from '../../../../src/domains/code-intelligence/coordinator';
import { NOTHING_INDEXED_FOR_SEARCH } from '../../../../src/domains/code-intelligence/services/semantic-analyzer';
import {
  createCoordinatorTestContext,
  resetTestContext,
  type CoordinatorTestContext,
} from '../coordinator-test-utils';

describe('CodeIntelligenceCoordinator.search (#1224)', () => {
  const cwd = process.cwd();
  let project: string;
  let ctx: CoordinatorTestContext;
  let coordinator: CodeIntelligenceCoordinator;

  beforeEach(async () => {
    project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1224-')));
    fs.mkdirSync(path.join(project, 'src'));
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"p"}\n');
    fs.writeFileSync(
      path.join(project, 'src', 'auth.ts'),
      '// Authentication helpers\nexport function login(user: string) { return { token: user }; }\n',
    );
    fs.writeFileSync(path.join(project, 'src', 'math.ts'), 'export function add(a: number, b: number) { return a + b; }\n');
    process.chdir(project);
    vi.stubEnv('AQE_PROJECT_ROOT', project);

    ctx = createCoordinatorTestContext();
    // GNN stays on (the default): it was the source of the placeholder hits.
    coordinator = new CodeIntelligenceCoordinator(ctx.eventBus, ctx.memory, ctx.agentCoordinator, {
      enableLearning: false,
      publishEvents: false,
      enableSONA: false,
      enableHypergraph: false,
      enableMinCutAwareness: false,
      enableConsensus: false,
      enableMetricCollector: false,
    } as never);
    await coordinator.initialize();
  });

  afterEach(async () => {
    await coordinator.dispose();
    resetTestContext(ctx);
    process.chdir(cwd);
    vi.unstubAllEnvs();
    fs.rmSync(project, { recursive: true, force: true });
  });

  const src = (name: string) => path.join(project, 'src', name);

  it('fails, saying nothing is indexed, before anything was indexed', async () => {
    const result = await coordinator.search({ query: 'login', type: 'exact' });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toBe(NOTHING_INDEXED_FOR_SEARCH);
  });

  it.each([
    ['exact', 'login'],
    ['fuzzy', 'login'],
    ['semantic', 'auth code'],
  ] as const)('a %s search names only real indexed files and a matching total', async (type, query) => {
    const indexed = await coordinator.index({ paths: [src('auth.ts'), src('math.ts')] });
    expect(indexed.success).toBe(true);

    const result = await coordinator.search({ query, type });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.results.length).toBeGreaterThan(0);
    expect(result.value.total).toBe(result.value.results.length);
    for (const hit of result.value.results) {
      expect([src('auth.ts'), src('math.ts')]).toContain(hit.file);
      expect(hit.snippet).not.toBe('');
    }
    expect(result.value.results[0].file).toBe(src('auth.ts'));
  });
});
