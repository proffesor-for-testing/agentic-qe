/**
 * Agentic QE v3 - Security Scan Worker Unit Tests
 * ADR-014: Background Workers for QE Monitoring
 *
 * TDD Tests for SecurityScanWorker
 * Tests security vulnerability scanning functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecurityScanWorker } from '../../../../src/workers/workers/security-scan';
import { WorkerContext } from '../../../../src/workers/interfaces';

function createMockContext(): WorkerContext {
  return {
    eventBus: {
      publish: vi.fn().mockResolvedValue(undefined),
    },
    memory: {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue([]),
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    domains: {
      getDomainAPI: vi.fn().mockReturnValue({}),
      getDomainHealth: vi.fn().mockReturnValue({ status: 'healthy', errors: [] }),
    },
    signal: new AbortController().signal,
  };
}

describe('SecurityScanWorker', () => {
  let worker: SecurityScanWorker;

  beforeEach(() => {
    worker = new SecurityScanWorker();
  });

  describe('instantiation', () => {
    it('should be instantiated with correct config', () => {
      expect(worker.config.id).toBe('security-scan');
      expect(worker.config.name).toBe('Security Vulnerability Scanner');
      expect(worker.config.priority).toBe('critical');
      expect(worker.config.targetDomains).toContain('security-compliance');
    });

    it('should have 30 minute interval', () => {
      expect(worker.config.intervalMs).toBe(30 * 60 * 1000);
    });

    it('should have correct timeout and retry settings', () => {
      expect(worker.config.timeoutMs).toBe(300000);
      expect(worker.config.retryCount).toBe(3);
    });

    it('should be marked as critical priority', () => {
      expect(worker.config.priority).toBe('critical');
    });

    it('should start in idle status', () => {
      expect(worker.status).toBe('idle');
    });
  });

  describe('execute - successful scan', () => {
    it('should execute successfully', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.success).toBe(true);
      expect(result.workerId).toBe('security-scan');
    });

    it('should return security metrics', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.metrics.domainMetrics).toHaveProperty('dependencyVulnerabilities');
      expect(result.metrics.domainMetrics).toHaveProperty('codeSecurityIssues');
      expect(result.metrics.domainMetrics).toHaveProperty('secretsDetected');
      expect(result.metrics.domainMetrics).toHaveProperty('configurationIssues');
      expect(result.metrics.domainMetrics).toHaveProperty('scanDuration');
    });

    it('should store scan results in memory', async () => {
      const context = createMockContext();

      await worker.execute(context);

      expect(context.memory.set).toHaveBeenCalledWith('security:lastScan', expect.any(Object));
      expect(context.memory.set).toHaveBeenCalledWith('security:lastScanTime', expect.any(String));
    });

    it('should publish worker.executed event', async () => {
      const context = createMockContext();

      await worker.execute(context);

      expect(context.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'worker.executed',
          workerId: 'security-scan',
        })
      );
    });
  });

  describe('execute - vulnerability detection', () => {
    it('should detect critical vulnerabilities', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      // The mock returns critical vulnerabilities
      expect(result.findings.some(f => f.type === 'critical-vulnerability')).toBe(true);
    });

    it('should detect high severity vulnerabilities', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.findings.some(f => f.type === 'high-vulnerability')).toBe(true);
    });

    it('should include CVE information in vulnerability findings', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      const vulnFindings = result.findings.filter(f =>
        f.type.includes('vulnerability')
      );

      for (const finding of vulnFindings) {
        expect(finding.context).toHaveProperty('cve');
        expect(finding.context).toHaveProperty('currentVersion');
      }
    });

    it('should generate recommendations for critical vulnerabilities', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.recommendations.some(r =>
        r.priority === 'p0' && r.action.includes('Critical')
      )).toBe(true);
    });
  });

  describe('execute - code security issues', () => {
    it('should detect code security issues', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.findings.some(f => f.type.startsWith('code-security-'))).toBe(true);
    });

    it('should include file location in code security findings', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      const codeFindings = result.findings.filter(f =>
        f.type.startsWith('code-security-')
      );

      for (const finding of codeFindings) {
        expect(finding.resource).toBeDefined();
        expect(finding.resource).toContain(':'); // file:line format
      }
    });

    it('should generate recommendations for injection vulnerabilities', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.recommendations.some(r =>
        r.action.includes('Injection')
      )).toBe(true);
    });
  });

  describe('health score calculation', () => {
    it('should calculate health score between 0 and 100', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.metrics.healthScore).toBeGreaterThanOrEqual(0);
      expect(result.metrics.healthScore).toBeLessThanOrEqual(100);
    });

    it('should penalize health score for critical vulnerabilities', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      // With critical vulnerabilities, health score should be < 100
      expect(result.metrics.healthScore).toBeLessThan(100);
    });
  });

  describe('lifecycle methods', () => {
    it('should initialize correctly', async () => {
      await worker.initialize();
      expect(worker.status).toBe('idle');
      expect(worker.nextRunAt).toBeDefined();
    });

    it('should pause and resume', () => {
      worker.pause();
      expect(worker.status).toBe('paused');

      worker.resume();
      expect(worker.status).toBe('idle');
    });

    it('should stop', async () => {
      await worker.stop();
      expect(worker.status).toBe('stopped');
    });
  });

  describe('health tracking', () => {
    it('should track health after successful execution', async () => {
      const context = createMockContext();

      await worker.execute(context);
      const health = worker.getHealth();

      expect(health.totalExecutions).toBe(1);
      expect(health.successfulExecutions).toBe(1);
      expect(health.failedExecutions).toBe(0);
    });

    it('should track execution duration', async () => {
      const context = createMockContext();

      await worker.execute(context);
      const health = worker.getHealth();

      expect(health.avgDurationMs).toBeGreaterThanOrEqual(0);
      expect(health.recentResults.length).toBe(1);
    });
  });
});
