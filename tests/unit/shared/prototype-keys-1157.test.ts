/**
 * #1157 / #978: tables and records keyed by caller or file data must not
 * resolve `__proto__`, `constructor`, `toString` or `hasOwnProperty` through
 * Object.prototype. Each block reproduces one site with real inputs.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadOverlays } from '../../../src/agents/overlay-loader';
import { ToolLoopGuardrail } from '../../../src/cli/commands/hooks-handlers/tool-loop-guardrail';
import { CONSERVATIVE_TOOL_ANNOTATIONS, resolveToolAnnotations } from '../../../src/mcp/tool-annotations';
import { mergeHooksSmart } from '../../../src/init/settings-merge';
import { declaredDependencies, resolveFromRecord } from '../../../src/domains/security-compliance/services/scanners/dependency-resolver';
import { resolveFrameworkAlias } from '../../../src/shared/types/test-frameworks';
import { applyPatternTemplate } from '../../../src/learning/qe-patterns';
import { TrajectoryAdapter } from '../../../src/adapters/trajectory-adapter';
import { EvolutionPipelineIntegration } from '../../../src/governance/evolution-pipeline-integration';
import { MemoryCoherenceAuditor } from '../../../src/learning/memory-auditor';
import { ConsensusEngineImpl } from '../../../src/coordination/consensus/consensus-engine';
import { SecurityScanTool } from '../../../src/mcp/tools/security-compliance/scan';
import { GOAPPlanner } from '../../../src/planning/goap-planner';
import { evaluateFilter, field } from '../../../src/integrations/ruvector/filter-adapter';

vi.mock('../../../src/mcp/tools/base', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/mcp/tools/base')>();
  const memory = {
    get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined), search: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]), initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
  return { ...original, getSharedMemoryBackend: vi.fn().mockResolvedValue(memory), getMemoryBackend: vi.fn().mockResolvedValue(memory) };
});

const PROTO_KEYS = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'] as const;

/** Object.prototype and the Object constructor gained nothing. */
function expectNoPollution(): void {
  const probe = {} as Record<string, unknown>;
  for (const name of ['polluted', 'consecutiveFailures', 'lastFailureAt', 'votes', 'agreements']) {
    expect(probe[name], `Object.prototype.${name}`).toBeUndefined();
    expect((Object as unknown as Record<string, unknown>)[name], `Object.${name}`).toBeUndefined();
  }
  expect((Object.prototype.toString as unknown as Record<string, unknown>).polluted).toBeUndefined();
}

describe('prototype-chain keys (#1157)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1157-')));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    try {
      expectNoPollution();
    } finally {
      // Undo any pollution so one failing site cannot fail the next test.
      for (const name of ['polluted', 'consecutiveFailures', 'lastFailureAt', 'votes', 'agreements', 'averageConfidence', 'averageExecutionTime', 'errors']) {
        delete (Object.prototype as Record<string, unknown>)[name];
        delete (Object as unknown as Record<string, unknown>)[name];
      }
      delete (Object.prototype.toString as unknown as Record<string, unknown>).polluted;
    }
  });

  it('overlay files cannot write onto Object.prototype or a built-in method', () => {
    const overrides = path.join(dir, '.claude', 'agent-overrides');
    fs.mkdirSync(overrides, { recursive: true });
    fs.writeFileSync(path.join(overrides, 'x.yaml'),
      'agent: qe-test-architect\n__proto__:\n  polluted: yes\nconstructor:\n  polluted: yes\ntoString:\n  polluted: yes\n');

    loadOverlays(dir);

    expectNoPollution();
  });

  it.each(PROTO_KEYS)('the tool-loop breaker counts a command named %s as its own entry', (command) => {
    const guardrail = new ToolLoopGuardrail({ statePath: path.join(dir, 'state.json'), warnThreshold: 2 });

    guardrail.record(command, false);
    guardrail.record(command, false);

    expectNoPollution();
    expect(guardrail.check(command)).toMatchObject({ verdict: 'warn', consecutiveFailures: 2 });
    expect(guardrail.check('npm test').consecutiveFailures).toBe(0);
  });

  it.each(PROTO_KEYS)('a dynamic tool named %s cannot self-assert optimistic annotations', (name) => {
    const resolved = resolveToolAnnotations(name, { readOnlyHint: true, destructiveHint: false });

    expect(resolved).toEqual(CONSERVATIVE_TOOL_ANNOTATIONS);
  });

  it('settings merge keeps user hook types named after Object.prototype members', () => {
    const existing = JSON.parse('{"__proto__":[{"x":1}],"constructor":[{"y":2}],"toString":[{"z":3}]}');

    const merged = mergeHooksSmart(existing, { PreToolUse: [{ aqe: true }] });

    expect(Object.keys(merged).sort()).toEqual(['PreToolUse', '__proto__', 'constructor', 'toString']);
    expect(Object.getOwnPropertyDescriptor(merged, '__proto__')?.value).toEqual([{ x: 1 }]);
    expect(Object.getOwnPropertyDescriptor(merged, 'constructor')?.value).toEqual([{ y: 2 }]);
  });

  it('dependency resolution treats packages named after Object.prototype members as packages', () => {
    const declared = declaredDependencies({ dependencies: JSON.parse('{"__proto__":"1.0.0","constructor":"^2.0.0","lodash":"4.17.20"}') });
    expect(Object.keys(declared).sort()).toEqual(['__proto__', 'constructor', 'lodash']);

    const resolved = resolveFromRecord({ constructor: '^2.0.0', toString: '^1.0.0' });
    expect(resolved.map(r => r.name).sort()).toEqual(['constructor', 'toString']);
  });

  it.each(PROTO_KEYS)('resolveFrameworkAlias(%s) is not a framework', (key) => {
    expect(resolveFrameworkAlias(key)).toBeUndefined();
  });

  it.each(['constructor', 'toString'])('a template variable named %s falls back to its default', (name) => {
    const content = applyPatternTemplate(
      { type: 'code', content: `value={{${name}}}`, variables: [{ name, type: 'string', required: false, defaultValue: 'DEFAULT' }] },
      {},
    );

    expect(content).toBe('value=DEFAULT');
  });

  it.each(PROTO_KEYS)('stored data grouped by %s does not throw or pollute', (key) => {
    const trajectory = { trajectoryId: 't', outcome: 'success', steps: [], context: { workflowType: key } };
    expect(() => new TrajectoryAdapter().extractActionSequences([trajectory as never])).not.toThrow();

    const groups = (new EvolutionPipelineIntegration() as unknown as {
      groupBy<T>(a: T[], k: (t: T) => string): Record<string, T[]>;
    }).groupBy([{ k: key }, { k: key }], item => item.k);
    expect(Object.getOwnPropertyDescriptor(groups, key)?.value).toHaveLength(2);

    const auditor = new MemoryCoherenceAuditor({} as never);
    const byDomain = (auditor as unknown as { groupByDomain(p: unknown[]): Record<string, unknown[]> })
      .groupByDomain([{ qeDomain: key }]);
    expect(Object.getOwnPropertyDescriptor(byDomain, key)?.value).toHaveLength(1);
  });

  it.each(PROTO_KEYS)('consensus stats keep a model id %s as its own entry', (modelId) => {
    const engine = new ConsensusEngineImpl({ getAll: () => [] } as never);
    (engine as unknown as { updateStats(r: unknown): void }).updateStats({
      verdict: 'verified', confidence: 1, totalExecutionTime: 1, requiresHumanReview: false,
      votes: [{ modelId, agrees: true, confidence: 1, executionTime: 1 }],
    });

    expectNoPollution();
    expect(Object.getOwnPropertyDescriptor(engine.getStats().modelStats, modelId)?.value).toMatchObject({ votes: 1, agreements: 1 });
  });

  it('GOAP state paths and pattern filters do not read inherited members', () => {
    const planner = new GOAPPlanner() as unknown as { getStateValue(s: unknown, k: string): unknown };
    expect(planner.getStateValue({ coverage: { line: 80 } }, 'coverage.constructor')).toBeUndefined();
    expect(planner.getStateValue({ coverage: { line: 80 } }, 'coverage.line')).toBe(80);

    const result = { pattern: { id: 'p', qeDomain: 'test-generation' }, score: 1 } as never;
    expect(evaluateFilter(result, field('constructor.name', 'eq', 'Object'))).toBe(false);
    expect(evaluateFilter(result, field('qeDomain', 'eq', 'test-generation'))).toBe(true);
  });

  it('the security scan tool still reports a real vulnerable dependency next to one named constructor', async () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { constructor: '1.0.0', lodash: '4.0.0' } }));
    fs.writeFileSync(path.join(dir, 'requirements.txt'), 'constructor\n__proto__\ntoString\n');

    const result = await new SecurityScanTool().invoke({ target: dir, scanType: ['dependency'] } as never);

    expect(result.success, JSON.stringify(result)).toBe(true);
    const ids = (result.data as { vulnerabilities: Array<{ id: string }> }).vulnerabilities.map(v => v.id);
    expect(ids).toContain('DEP-lodash-CVE-2021-23337');
    expect(ids.filter(id => /constructor|__proto__|toString/.test(id))).toEqual([]);
  });
});
