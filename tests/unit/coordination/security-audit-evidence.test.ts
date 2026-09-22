import { describe, expect, it, vi } from 'vitest';
import { SecurityAuditProtocol, type SecurityAuditConfig } from '../../../src/coordination/protocols/security-audit.js';
import { ok, err, type Result } from '../../../src/shared/types/index.js';
import type { EventBus, MemoryBackend, AgentCoordinator } from '../../../src/kernel/interfaces.js';

import type { DASTResult } from '../../../src/domains/security-compliance/interfaces.js';

const summary = { critical: 0, high: 0, medium: 0, low: 0, informational: 0, totalFiles: 1, scanDurationMs: 1 };
function setup(enableSecretScan = true, config: Partial<SecurityAuditConfig> = {}) {
  const memory = { set: vi.fn().mockResolvedValue(undefined) } as unknown as MemoryBackend;
  const events = { publish: vi.fn().mockResolvedValue(undefined) } as unknown as EventBus;
  const agents = {
    canSpawn: () => true, spawn: vi.fn().mockResolvedValue(ok('isolated-agent')),
    stop: vi.fn().mockResolvedValue(ok(undefined)),
  } as unknown as AgentCoordinator;
  const protocol = new SecurityAuditProtocol(events, memory, agents, {
    enableSecretScan, enableDAST: false, complianceStandards: [], sendNotifications: false, ...config,
  });
  vi.spyOn(protocol, 'scanVulnerabilities').mockResolvedValue(ok({
    scanId: 'fixture', vulnerabilities: [], summary,
    coverage: { filesScanned: 1, linesScanned: 1, rulesApplied: 1 },
    evidence: {
      schemaVersion: 1, completeness: 'complete', requestedFiles: 1, requestedPaths: ['/fixture.ts'],
      duplicateInputs: 0, files: [{ path: '/fixture.ts', engineId: 'patterns', status: 'analyzed', readLines: 1, analyzedLines: 1, sourceDigest: 'a'.repeat(64) }],
      engines: [{ id: 'patterns', requested: true, required: true, status: 'completed', scope: 'requested-files', analyzedFiles: 1, ruleIds: ['fixture-rule'], ruleCoverage: 'known', errors: [], limitations: [] }], limitations: [],
    },
  }));
  vi.spyOn(protocol, 'scanDependencies').mockResolvedValue(ok({ vulnerabilities: [], outdatedPackages: [], summary }));
  vi.spyOn(protocol, 'validateCompliance').mockResolvedValue(ok([]));
  return { protocol, memory, events };
}

describe('security audit execution evidence', () => {
  it('does not approve when no audit has run', async () => {
    const { protocol } = setup(false);
    expect((await protocol.generateReport()).deploymentDecision.allowed).toBe(false);
  });

  it('never reports the unimplemented secret scanner as a measured clean scan', async () => {
    const { protocol } = setup();
    const result = await protocol.auditSecrets();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toMatch(/unavailable|not implemented/i);
  });

  it('does not turn an unavailable secret check into deployment approval', async () => {
    const { protocol, memory } = setup();
    const result = await protocol.execute('manual');
    expect(result.success).toBe(true); // Keep usable findings in the audit receipt.
    if (!result.success) return;
    expect(result.value.deploymentDecision.allowed).toBe(false);
    expect(result.value.deploymentDecision.blockingIssues.join(' ')).toMatch(/secret/i);
    expect(result.value.recommendations.join(' ')).not.toContain('Security posture is good');
    expect(memory.set).toHaveBeenCalled();
  });

  it('preserves a verified healthy control when secret checking is not requested', async () => {
    const { protocol } = setup(false);
    const result = await protocol.execute('manual');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.deploymentDecision.allowed).toBe(true);
  });

  it.each(['partial', 'none'] as const)('does not approve %s SAST coverage', async (completeness) => {
    const { protocol } = setup(false);
    vi.mocked(protocol.scanVulnerabilities).mockResolvedValue(ok({
      scanId: 'fixture', vulnerabilities: [], summary,
      coverage: { filesScanned: 0, linesScanned: 0, rulesApplied: 0 },
      evidence: { schemaVersion: 1, completeness, requestedFiles: 1, requestedPaths: ['/fixture.ts'], duplicateInputs: 0, files: [], engines: [], limitations: [] },
    }));
    const result = await protocol.execute('manual');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.deploymentDecision.allowed).toBe(false);
  });

  it.each(['scanDependencies', 'validateCompliance'] as const)('does not ignore a failed %s check', async (method) => {
    const { protocol } = setup(false, method === 'validateCompliance' ? { complianceStandards: ['gdpr'] } : {});
    vi.mocked(protocol[method]).mockResolvedValue(err(new Error('fixture failure')));
    const result = await protocol.execute('manual');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.deploymentDecision.allowed).toBe(false);
  });

  it('does not approve requested DAST with no execution receipt', async () => {
    const { protocol } = setup(false, { enableDAST: true, targetUrl: 'https://fixture.invalid' });
    vi.spyOn(protocol as unknown as { runDASTScan: () => Promise<Result<DASTResult>> }, 'runDASTScan').mockResolvedValue(ok({ scanId: 'fixture', vulnerabilities: [], summary, crawledUrls: [] }));
    const result = await protocol.execute('manual');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.deploymentDecision.allowed).toBe(false);
      expect(result.value.incompleteChecks?.join(' ')).toMatch(/DAST coverage is unverified/);
    }
  });

  it.each(['gdpr', 'unknown-standard'])('does not approve placeholder %s compliance', async standard => {
    const { protocol } = setup(false, { complianceStandards: [standard] });
    vi.mocked(protocol.validateCompliance).mockRestore();
    const result = await protocol.execute('manual');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.complianceReports).toHaveLength(1);
      expect(result.value.deploymentDecision.allowed).toBe(false);
      expect(result.value.incompleteChecks?.join(' ')).toMatch(/compliance.*verified/);
    }
  });

  it('honors the pre-release trigger requiring secrets even when disabled for daily scans', async () => {
    const { protocol } = setup(false);
    const result = await protocol.execute('pre-release');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.deploymentDecision.blockingIssues.join(' ')).toMatch(/Secret scan/);
  });

  it('does not require unrequested SAST, DAST, or secret checks on dependency-update', async () => {
    const { protocol } = setup(true, { enableDAST: true });
    const result = await protocol.execute('dependency-update');
    expect(protocol.scanVulnerabilities).not.toHaveBeenCalled();
    expect(protocol.validateCompliance).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.deploymentDecision.allowed).toBe(true);
  });

  it('retains failed SAST as incomplete rather than fabricating zero-risk approval', async () => {
    const { protocol } = setup(false);
    vi.mocked(protocol.scanVulnerabilities).mockResolvedValue(err(new Error('fixture engine unavailable')));
    const result = await protocol.execute('manual');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.deploymentDecision.allowed).toBe(false);
  });
});
