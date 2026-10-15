/**
 * #1049 review round 3, item 6: on the real in-memory kernel backend a
 * namespaced `search` returns `<namespace>:<key>`. The defect-predictor and
 * security-scan workers used to pass that straight to `get(key, { namespace })`,
 * double-prefixing it, so they never found a recorded prediction / scan and
 * reported "unmeasured". Both now strip the prefix (bareSearchKey).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { InMemoryBackend } from '../../../../src/kernel/memory-backend';
import { DefectPredictorWorker } from '../../../../src/workers/workers/defect-predictor';
import { SecurityScanWorker } from '../../../../src/workers/workers/security-scan';
import { bareSearchKey } from '../../../../src/workers/namespaced-keys';
import type { WorkerContext } from '../../../../src/workers/interfaces';

function contextOn(memory: InMemoryBackend): WorkerContext {
  return {
    eventBus: { publish: vi.fn().mockResolvedValue(undefined) },
    memory,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    domains: { getDomainAPI: vi.fn().mockReturnValue({}), getDomainHealth: vi.fn().mockReturnValue({ status: 'healthy', errors: [] }) },
    signal: new AbortController().signal,
  } as unknown as WorkerContext;
}

describe('#1049 item 6: workers read namespaced records on the in-memory kernel backend', () => {
  let root: string;
  const savedRoot = process.env.AQE_PROJECT_ROOT;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1049-nskeys-'));
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'risky.ts'), 'export const a = 1;\n');
    process.env.AQE_PROJECT_ROOT = root;
  });

  afterEach(() => {
    if (savedRoot === undefined) delete process.env.AQE_PROJECT_ROOT;
    else process.env.AQE_PROJECT_ROOT = savedRoot;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('the in-memory backend does return prefixed keys from a namespaced search (the condition being fixed)', async () => {
    const memory = new InMemoryBackend();
    await memory.set('a:b', 1, { namespace: 'ns' });
    expect(await memory.search('a:*', 10, { namespace: 'ns' })).toEqual(['ns:a:b']);
    expect(bareSearchKey('ns:a:b', 'ns', 'a:*')).toBe('a:b');
    expect(bareSearchKey('a:b', 'ns', 'a:*')).toBe('a:b');
    // A bare key that itself starts with the namespace name is left alone.
    expect(bareSearchKey('ns:x:1', 'ns', 'ns:x:*')).toBe('ns:x:1');
    expect(bareSearchKey('ns:ns:x:1', 'ns', 'ns:x:*')).toBe('ns:x:1');
  });

  it('defect-predictor finds a recorded prediction', async () => {
    const memory = new InMemoryBackend();
    await memory.set('defect-intelligence:predictor:prediction:p-1', {
      id: 'p-1', timestamp: new Date().toISOString(),
      predictions: [{ file: 'src/risky.ts', probability: 0.8, riskLevel: 'high', factors: [{ name: 'codeComplexity', contribution: 0.3 }], recommendations: ['Review'] }],
    }, { namespace: 'defect-intelligence' });

    const result = await new DefectPredictorWorker().execute(contextOn(memory));

    expect(result.findings).toContainEqual(expect.objectContaining({ type: 'high-defect-risk', resource: 'src/risky.ts' }));
    expect(result.findings.find((f) => f.type === 'defect-prediction-unmeasured')).toBeUndefined();
  });

  it('security-scan finds a recorded dependency scan', async () => {
    const memory = new InMemoryBackend();
    await memory.set('security:scan:s-1', {
      scanId: 's-1', scanType: 'dependency', advisorySource: 'osv', status: 'complete', measured: true,
      packagesRequested: 1, packagesChecked: 1, uncheckedPackages: [], timestamp: new Date().toISOString(),
      summary: { critical: 1, high: 0, medium: 0, low: 0, informational: 0, totalFiles: 1, scanDurationMs: 1 },
      vulnerabilities: [{ id: 'v', cveId: 'CVE-2019-10744', title: 'lodash: Prototype Pollution', description: 'x', severity: 'critical',
        category: 'vulnerable-components', location: { file: 'package.json', dependency: { name: 'lodash', version: '4.17.11', ecosystem: 'npm' } },
        remediation: { description: 'Update' }, references: [] }],
    }, { namespace: 'security-compliance' });

    const result = await new SecurityScanWorker().execute(contextOn(memory));

    expect(result.findings).toContainEqual(expect.objectContaining({ type: 'critical-vulnerability', resource: 'lodash' }));
    expect(result.metrics.domainMetrics).toMatchObject({ dependencyVulnerabilities: 1 });
  });
});
