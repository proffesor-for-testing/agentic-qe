/**
 * #1350 (remaining reads): the security audit's SAST walk and dependency
 * manifest take the task's hardlink policy, the security posture accounts
 * for secrets and incomplete checks, pattern learning and the dormant
 * `qe/security/scan` tool refuse hardlinks. Real hardlinks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { performSASTScan } from '../../../../src/domains/security-compliance/services/security-auditor-sast';
import { SecurityAuditorService } from '../../../../src/domains/security-compliance/services/security-auditor';
import { generatePostureRecommendations } from '../../../../src/domains/security-compliance/services/security-auditor-reports';
import { resolveDependencies } from '../../../../src/domains/security-compliance/services/scanners/dependency-resolver';
import { PatternMatcherService } from '../../../../src/domains/test-generation/services/pattern-matcher';
import { SecurityScanTool } from '../../../../src/mcp/tools/security-compliance/scan';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
import type { SecurityAuditReport } from '../../../../src/domains/security-compliance/interfaces';

const CANARY = 'CANARY_1350_OUTSIDE';

const memory = (audits: SecurityAuditReport[] = []): MemoryBackend => ({
  get: vi.fn(async (key: string) => audits.find((a) => `security:audit:${a.auditId}` === key) ?? null),
  set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(true),
  exists: vi.fn().mockResolvedValue(false),
  search: vi.fn(async () => audits.map((a) => `security:audit:${a.auditId}`)),
  clear: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue([]),
  getStats: vi.fn().mockResolvedValue({ entries: 0, memoryUsage: 0 }),
}) as unknown as MemoryBackend;

describe('security audit and remaining reads (#1350)', () => {
  let base: string;
  let root: string;
  let leak: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1350-aud-')));
    root = path.join(base, 'proj');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(base, 'outside'));
    fs.writeFileSync(path.join(base, 'outside', 'secret.ts'),
      `export function run(userInput: string) { return eval(userInput + "${CANARY}"); }\n`);
    leak = path.join(root, 'src', 'leak.ts');
    fs.linkSync(path.join(base, 'outside', 'secret.ts'), leak);
    fs.writeFileSync(path.join(base, 'outside', 'package.json'),
      JSON.stringify({ name: 'outside', dependencies: { 'canary-1350-outside-dep': '1.2.3' } }));
    vi.stubEnv('AQE_PROJECT_ROOT', root);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(base, { recursive: true, force: true });
  });

  const walk = async (): Promise<string[]> => [leak];

  describe('audit SAST walk', () => {
    it('reads a hardlink by default (CLI)', async () => {
      const refused: string[] = [];
      const result = await performSASTScan(walk, () => false, { onRefusedHardlink: (f) => refused.push(f) });
      expect(result.coverage.filesScanned).toBe(1);
      expect(refused).toEqual([]);
    });

    it('refuses it under the MCP policy, reports it and scans nothing from it', async () => {
      const refused: string[] = [];
      const result = await performSASTScan(walk, () => false,
        { hardlinks: 'refuse-outside-node-modules', onRefusedHardlink: (f) => refused.push(f) });
      expect(result.coverage.filesScanned).toBe(0);
      expect(result.vulnerabilities).toEqual([]);
      expect(refused).toEqual([leak]);
      expect(JSON.stringify(result)).not.toContain(CANARY);
    });
  });

  describe('dependency manifest', () => {
    it('refuses a hardlinked package.json and reports it; reads it by default', async () => {
      const manifest = path.join(root, 'package.json');
      fs.linkSync(path.join(base, 'outside', 'package.json'), manifest);
      const refused: string[] = [];
      await expect(resolveDependencies(manifest, { hardlinks: 'refuse-outside-node-modules', onRefusedHardlink: (f) => refused.push(f) }))
        .rejects.toMatchObject({ reason: 'hardlinked' });
      expect(refused).toEqual([manifest]);
      const allowed = await resolveDependencies(manifest);
      expect(allowed.dependencies.map((d) => d.name)).toEqual(['canary-1350-outside-dep']);
    });
  });

  describe('security posture', () => {
    const audit = (extra: Partial<SecurityAuditReport>): SecurityAuditReport => ({
      auditId: 'a1', timestamp: new Date(),
      overallRiskScore: { overall: 0.1, level: 'low', factors: [] } as never,
      recommendations: [], ...extra,
    });

    it('counts exposed secrets as critical and does not call an incomplete audit good', async () => {
      const latest = audit({
        secretScanResults: { secretsFound: [{ type: 'password', location: { file: 'x' }, entropy: 4 } as never], filesScanned: 1 },
        incompleteChecks: ['Secret scan partial: 1 file(s) refused unread because they have more than one hardlink (x)'],
      });
      const posture = await new SecurityAuditorService(memory([latest])).getSecurityPosture();
      expect(posture.success).toBe(true);
      const value = posture.success ? posture.value : undefined;
      expect(value!.criticalIssues).toBe(1);
      expect(value!.incompleteChecks).toEqual(latest.incompleteChecks);
      expect(value!.recommendations.join('\n')).toMatch(/latest audit is incomplete/);
      expect(value!.recommendations.join('\n')).toMatch(/Remove 1 exposed secrets/);
      expect(value!.recommendations).not.toContain('Maintain current security practices');
    });

    it('keeps the good verdict for a complete clean audit', () => {
      expect(generatePostureRecommendations(0, 0, 100)).toContain('Maintain current security practices');
      expect(generatePostureRecommendations(0, 0, 100, { incompleteChecks: ['x'] })).not.toContain('Maintain current security practices');
    });
  });

  describe('pattern learning', () => {
    const matcher = (): PatternMatcherService => new PatternMatcherService(memory(), {
      embedder: { embed: async () => new Array(8).fill(0) } as never,
    });

    it('refuses a hardlinked test file when the request asks, and lists it', async () => {
      const result = await matcher().learnPatterns({ testFiles: [leak], depth: 'shallow', sourceHardlinks: 'refuse' });
      expect(result.success && result.value.refused).toEqual([{ path: leak, reason: 'hardlinked' }]);
    });

    it('reads it by default', async () => {
      const result = await matcher().learnPatterns({ testFiles: [leak], depth: 'shallow' });
      expect(result.success && result.value.refused).toBeUndefined();
    });
  });

  describe('dormant qe/security/scan', () => {
    it('refuses a hardlink under the target, lists it, and does not pass', async () => {
      const tool = new SecurityScanTool();
      const result = await tool.invoke({ target: path.join(root, 'src'), scanType: ['sast'] }, {
        requestId: 'r1', startTime: Date.now(), memory: memory(),
      } as never);
      expect(result.success, result.error).toBe(true);
      expect(JSON.stringify(result)).not.toContain(CANARY);
      expect(result.data!.refused).toEqual([{ path: leak, reason: 'hardlinked' }]);
      expect(result.data!.passed).toBe(false);
    });
  });
});
