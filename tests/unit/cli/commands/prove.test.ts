/**
 * Proof-of-Quality (PoQ) Command Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  hashAttestation,
  collectMetrics,
  collectUnboundFiles,
  buildAttestation,
  formatMarkdown,
  handleProve,
  createProveCommand,
  unavailableAttestationEvidence,
  type QualityAttestation,
} from '../../../../src/cli/commands/prove.js';

describe('Proof-of-Quality Command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poq-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // ---- hashAttestation ----

  describe('hashAttestation', () => {
    const sampleData: Omit<QualityAttestation, 'hash'> = {
      version: '1.0.0',
      timestamp: '2026-03-09T00:00:00.000Z',
      projectRoot: '/tmp/test',
      attestation: {
        testsExecuted: true,
        coverageChecked: false,
        securityScanned: true,
        qualityGatePassed: true,
      },
      evidence: unavailableAttestationEvidence('fixture'),
      unboundFiles: { junit: null, coverageSummary: null },
      metrics: {
        testCount: 42,
        passRate: 95.2,
        coveragePercent: 0,
        vulnerabilities: 0,
        qualityScore: 68,
        patternsUsed: 1,
      },
      generatedBy: 'agentic-qe prove',
    };

    it('should return a 64-char hex string (SHA-256)', () => {
      const hash = hashAttestation(sampleData);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should be deterministic (same input = same hash)', () => {
      const h1 = hashAttestation(sampleData);
      const h2 = hashAttestation(sampleData);
      expect(h1).toBe(h2);
    });

    it('should change when metrics change', () => {
      const altered = { ...sampleData, metrics: { ...sampleData.metrics, testCount: 100 } };
      const h1 = hashAttestation(sampleData);
      const h2 = hashAttestation(altered);
      expect(h1).not.toBe(h2);
    });
  });

  // ---- collectMetrics / collectUnboundFiles ----

  describe('collectMetrics', () => {
    it('should handle missing files gracefully', async () => {
      const metrics = await collectMetrics(tmpDir);
      // #1453: without evidence nothing is measured.
      expect(metrics.testCount).toBeNull();
      expect(metrics.passRate).toBeNull();
      expect(metrics.coveragePercent).toBeNull();
      // #1453: no recorded scan is no measurement, and earns no score.
      expect(metrics.vulnerabilities).toBeNull();
      expect(metrics.qualityScore).toBeNull();
    });

    it('should read junit.xml when present', async () => {
      const junit = `<?xml version="1.0"?>
<testsuites tests="50" failures="5">
</testsuites>`;
      fs.writeFileSync(path.join(tmpDir, 'junit.xml'), junit);

      const files = await collectUnboundFiles(tmpDir);
      expect(files.junit).toEqual({ testCount: 50, passRate: 90 }); // (50-5)/50 * 100
      // #1453: an unbound file never feeds the metrics.
      expect((await collectMetrics(tmpDir)).passRate).toBeNull();
    });

    it('should read coverage-summary.json when present', async () => {
      const covDir = path.join(tmpDir, 'coverage');
      fs.mkdirSync(covDir);
      fs.writeFileSync(
        path.join(covDir, 'coverage-summary.json'),
        JSON.stringify({ total: { lines: { pct: 82.5 } } }),
      );

      expect((await collectUnboundFiles(tmpDir)).coverageSummary).toEqual({ linesPct: 82.5 });
      expect((await collectMetrics(tmpDir)).coveragePercent).toBeNull();
    });

    it('should detect memory.db patterns', async () => {
      const aqeDir = path.join(tmpDir, '.agentic-qe');
      fs.mkdirSync(aqeDir);
      fs.writeFileSync(path.join(aqeDir, 'memory.db'), '');

      const metrics = await collectMetrics(tmpDir);
      expect(metrics.patternsUsed).toBe(1);
    });
  });

  // ---- buildAttestation ----

  describe('buildAttestation', () => {
    it('should return a valid attestation with hash', () => {
      const metrics: QualityAttestation['metrics'] = {
        testCount: 10,
        passRate: 100,
        coveragePercent: 80,
        vulnerabilities: 0,
        qualityScore: 94,
        patternsUsed: 0,
      };
      const att = buildAttestation('/tmp/proj', metrics);

      expect(att.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(att.version).toBe('2.0.0');
      expect(att.projectRoot).toBe('/tmp/proj');
      expect(att.generatedBy).toBe('agentic-qe prove');
    });

    // #1453: on-disk metrics and the heuristic score never set a flag.
    it('should not attest anything from metrics alone, whatever the score', () => {
      const att = buildAttestation('/tmp', {
        testCount: 10, passRate: 100, coveragePercent: 100,
        vulnerabilities: 0, qualityScore: 100, patternsUsed: 0,
      });
      expect(att.attestation).toEqual({
        testsExecuted: false, coverageChecked: false, securityScanned: false, qualityGatePassed: false,
      });
      expect(att.evidence.qualityGate.status).toBe('unmeasured');
    });

    it('should set qualityGatePassed=false when score < 70', () => {
      const att = buildAttestation('/tmp', {
        testCount: 1, passRate: 50, coveragePercent: 0,
        vulnerabilities: 3, qualityScore: 41, patternsUsed: 0,
      });
      expect(att.attestation.qualityGatePassed).toBe(false);
    });
  });

  // ---- formatMarkdown ----

  describe('formatMarkdown', () => {
    it('should produce valid Markdown with table separators', () => {
      const att = buildAttestation('/tmp/proj', {
        testCount: 20, passRate: 95, coveragePercent: 85,
        vulnerabilities: 0, qualityScore: 93, patternsUsed: 0,
      });
      const md = formatMarkdown(att);

      expect(md).toContain('# Proof of Quality');
      expect(md).toContain('|-------|--------|');
      expect(md).toContain('|--------|-------|');
      expect(md).toContain(`\`${att.hash}\``);
      expect(md).toContain('| Quality Score | 93/100 |');
    });

    it('should show unmeasured checks without evidence', () => {
      const att = buildAttestation('/tmp', {
        testCount: 0, passRate: 0, coveragePercent: 0,
        vulnerabilities: 0, qualityScore: 30, patternsUsed: 0,
      });
      const md = formatMarkdown(att);
      expect(md).toContain('| Tests Executed | UNMEASURED (evidence-store-unavailable: ');
      expect(md).toContain('| Quality Gate | NOT EVALUATED (insufficient evidence) |');
    });
  });

  // ---- handleProve ----

  describe('handleProve', () => {
    it('should return a valid attestation object', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const att = await handleProve({ projectRoot: tmpDir });

      expect(att).toHaveProperty('hash');
      expect(att).toHaveProperty('metrics');
      expect(att).toHaveProperty('attestation');
      expect(att).toHaveProperty('evidence');
      expect(att.version).toBe('2.0.0');
    });

    it('should produce parseable JSON by default', async () => {
      const logs: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
      });

      await handleProve({ projectRoot: tmpDir });
      const parsed = JSON.parse(logs.join('\n'));
      expect(parsed).toHaveProperty('hash');
      expect(parsed).toHaveProperty('metrics');
    });

    it('should write to file when output is specified', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const outFile = path.join(tmpDir, 'attestation.json');
      await handleProve({ output: outFile, projectRoot: tmpDir });

      expect(fs.existsSync(outFile)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
      expect(parsed.hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should write markdown when format=markdown and output specified', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const outFile = path.join(tmpDir, 'attestation.md');
      await handleProve({ format: 'markdown', output: outFile, projectRoot: tmpDir });

      const content = fs.readFileSync(outFile, 'utf-8');
      expect(content).toContain('# Proof of Quality');
    });
  });

  // ---- createProveCommand ----

  describe('createProveCommand', () => {
    it('should create a command named "prove"', () => {
      const mockContext = {} as any;
      const mockExit = vi.fn() as any;
      const mockInit = vi.fn() as any;
      const cmd = createProveCommand(mockContext, mockExit, mockInit);

      expect(cmd.name()).toBe('prove');
    });

    it('should have a description', () => {
      const cmd = createProveCommand({} as any, vi.fn() as any, vi.fn() as any);
      expect(cmd.description()).toBeTruthy();
    });
  });
});
