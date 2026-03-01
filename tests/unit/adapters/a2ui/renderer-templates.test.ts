/**
 * A2UI QE Surface Templates and Integration Tests
 * Split from renderer.test.ts
 *
 * Tests for QE surface templates (coverage, test results, security,
 * accessibility) and renderer integration scenarios.
 *
 * @module tests/unit/adapters/a2ui/renderer-templates
 */

import { describe, it, expect } from 'vitest';

import {
  literal,
  path,
} from '../../../../src/adapters/a2ui/renderer/message-types.js';

import {
  createComponentBuilder,
} from '../../../../src/adapters/a2ui/renderer/component-builder.js';

import {
  createSurfaceGenerator,
} from '../../../../src/adapters/a2ui/renderer/surface-generator.js';

import {
  createCoverageSurface,
  createCoverageDataUpdate,
  createCoverageSummarySurface,
  createTestResultsSurface,
  createTestResultsDataUpdate,
  createSecuritySurface,
  createSecurityDataUpdate,
  createAccessibilitySurface,
  createAccessibilityDataUpdate,
  type CoverageData,
  type TestResults,
  type SecurityFindings,
  type A11yAudit,
} from '../../../../src/adapters/a2ui/renderer/templates/index.js';

describe('QE Surface Templates', () => {
  describe('Coverage Surface Template', () => {
    const mockCoverageData: CoverageData = {
      total: 85.5,
      target: 80,
      lineCoverage: 88.0,
      branchCoverage: 75.0,
      functionCoverage: 92.0,
      modules: [
        { name: 'src/core', percentage: 90, fileCount: 10 },
        { name: 'src/utils', percentage: 78, fileCount: 5 },
      ],
      files: [
        {
          path: 'src/index.ts',
          lineCoverage: 95,
          branchCoverage: 80,
          functionCoverage: 100,
          coveredLines: 95,
          totalLines: 100,
        },
      ],
      gaps: [
        {
          id: 'gap-1',
          file: 'src/utils.ts',
          startLine: 10,
          endLine: 15,
          type: 'uncovered',
          description: 'Error handling not covered',
          suggestion: 'Add test for error case',
        },
      ],
      timestamp: '2026-01-30T12:00:00Z',
      summary: '85.5% coverage - meets target',
    };

    it('should create coverage surface', () => {
      const surface = createCoverageSurface(mockCoverageData);

      expect(surface.type).toBe('surfaceUpdate');
      expect(surface.surfaceId).toBe('coverage-dashboard');
      expect(surface.components.length).toBeGreaterThan(0);
    });

    it('should create coverage surface with custom ID', () => {
      const surface = createCoverageSurface(mockCoverageData, 'custom-coverage');
      expect(surface.surfaceId).toBe('custom-coverage');
    });

    it('should create coverage data update', () => {
      const update = createCoverageDataUpdate(mockCoverageData);

      expect(update.type).toBe('dataModelUpdate');
      expect(update.data.metrics).toBeDefined();
      expect((update.data.metrics as Record<string, unknown>).total).toBe(85.5);
      expect((update.data.metrics as Record<string, unknown>).status).toBe('passed');
    });

    it('should set status to failed when below target', () => {
      const lowCoverage: CoverageData = { ...mockCoverageData, total: 75 };
      const update = createCoverageDataUpdate(lowCoverage);

      expect((update.data.metrics as Record<string, unknown>).status).toBe('failed');
    });

    it('should create coverage summary surface', () => {
      const surface = createCoverageSummarySurface({
        total: 85.5,
        target: 80,
        summary: 'Good coverage',
        timestamp: '2026-01-30T12:00:00Z',
      });

      expect(surface.surfaceId).toBe('coverage-summary');
      expect(surface.components.length).toBeGreaterThan(0);
    });

    it('should include QE-specific components', () => {
      const surface = createCoverageSurface(mockCoverageData);
      const types = surface.components.map((c) => c.type);

      expect(types).toContain('qe:coverageGauge');
      expect(types).toContain('qe:qualityGateIndicator');
    });
  });

  describe('Test Results Surface Template', () => {
    const mockTestResults: TestResults = {
      total: 100,
      passed: 95,
      failed: 3,
      skipped: 2,
      duration: 45000,
      passDuration: 40000,
      failDuration: 5000,
      startTime: '2026-01-30T12:00:00Z',
      endTime: '2026-01-30T12:00:45Z',
      suites: [
        {
          name: 'Unit Tests',
          file: 'tests/unit.test.ts',
          total: 50,
          passed: 48,
          failed: 2,
          skipped: 0,
          duration: 20000,
        },
      ],
      tests: [
        {
          id: 'test-1',
          name: 'should work correctly',
          suite: 'Unit Tests',
          status: 'passed',
          duration: 100,
          startTime: '2026-01-30T12:00:00Z',
          endTime: '2026-01-30T12:00:00.1Z',
        },
        {
          id: 'test-2',
          name: 'should fail on error',
          suite: 'Unit Tests',
          status: 'failed',
          duration: 500,
          error: 'Expected true but got false',
          startTime: '2026-01-30T12:00:01Z',
        },
      ],
      summary: '95 of 100 tests passed',
      passRate: 95,
    };

    it('should create test results surface', () => {
      const surface = createTestResultsSurface(mockTestResults);

      expect(surface.type).toBe('surfaceUpdate');
      expect(surface.surfaceId).toBe('test-results');
      expect(surface.components.length).toBeGreaterThan(0);
    });

    it('should create test results data update', () => {
      const update = createTestResultsDataUpdate(mockTestResults);

      expect(update.type).toBe('dataModelUpdate');
      const results = update.data.results as Record<string, unknown>;
      expect(results.total).toBe(100);
      expect(results.passed).toBe(95);
      expect(results.passRateFormatted).toBe('95.0%');
    });

    it('should format duration correctly', () => {
      const update = createTestResultsDataUpdate(mockTestResults);
      const results = update.data.results as Record<string, unknown>;
      expect(results.durationFormatted).toBe('45.0s');
    });

    it('should compute pass rate color', () => {
      const update = createTestResultsDataUpdate(mockTestResults);
      const results = update.data.results as Record<string, unknown>;
      expect(results.passRateColor).toBe('#4CAF50');
    });

    it('should include QE-specific components', () => {
      const surface = createTestResultsSurface(mockTestResults);
      const types = surface.components.map((c) => c.type);

      expect(types).toContain('qe:testStatusBadge');
      expect(types).toContain('qe:testTimeline');
    });
  });

  describe('Security Surface Template', () => {
    const mockSecurityFindings: SecurityFindings = {
      total: 15,
      bySeverity: [
        { severity: 'critical', count: 2, color: '#9C27B0' },
        { severity: 'high', count: 5, color: '#F44336' },
        { severity: 'medium', count: 6, color: '#FF9800' },
        { severity: 'low', count: 2, color: '#FFC107' },
      ],
      findings: [
        {
          id: 'vuln-1',
          title: 'SQL Injection',
          severity: 'critical',
          cve: 'CVE-2026-1234',
          cwe: 'CWE-89',
          owasp: 'A03:2021-Injection',
          description: 'SQL injection vulnerability in login form',
          remediation: 'Use parameterized queries',
          file: 'src/auth.ts',
          line: 42,
          cvssScore: 9.8,
          confidence: 'high',
          detectedAt: '2026-01-30T12:00:00Z',
          status: 'open',
        },
      ],
      dependencies: [
        {
          package: 'lodash',
          currentVersion: '4.17.20',
          fixedVersion: '4.17.21',
          cve: 'CVE-2021-23337',
          severity: 'high',
          description: 'Prototype pollution',
        },
      ],
      timestamp: '2026-01-30T12:00:00Z',
      duration: 30000,
      scannerVersion: '2.5.0',
      summary: '15 vulnerabilities found',
      riskScore: 75,
      riskLevel: 'high',
    };

    it('should create security surface', () => {
      const surface = createSecuritySurface(mockSecurityFindings);

      expect(surface.type).toBe('surfaceUpdate');
      expect(surface.surfaceId).toBe('security-report');
      expect(surface.components.length).toBeGreaterThan(0);
    });

    it('should create security data update', () => {
      const update = createSecurityDataUpdate(mockSecurityFindings);

      expect(update.type).toBe('dataModelUpdate');
      const security = update.data.security as Record<string, unknown>;
      expect(security.total).toBe(15);
      expect(security.riskScore).toBe(75);
    });

    it('should compute severity counts', () => {
      const update = createSecurityDataUpdate(mockSecurityFindings);
      const counts = (update.data.security as Record<string, unknown>).counts as Record<string, number>;

      expect(counts.critical).toBe(1);
      expect(counts.high).toBe(0);
    });

    it('should set alert for critical findings', () => {
      const update = createSecurityDataUpdate(mockSecurityFindings);
      const security = update.data.security as Record<string, unknown>;

      expect(security.hasCritical).toBe(true);
      expect(security.alertVariant).toBe('error');
    });

    it('should include QE-specific components', () => {
      const surface = createSecuritySurface(mockSecurityFindings);
      const types = surface.components.map((c) => c.type);

      expect(types).toContain('qe:vulnerabilityCard');
      expect(types).toContain('qe:severityBadge');
      expect(types).toContain('qe:riskGauge');
    });
  });

  describe('Accessibility Surface Template', () => {
    const mockA11yAudit: A11yAudit = {
      total: 25,
      passed: 175,
      score: 87,
      targetLevel: 'AA',
      isCompliant: false,
      byImpact: [
        { impact: 'critical', count: 3, color: '#9C27B0' },
        { impact: 'serious', count: 8, color: '#F44336' },
        { impact: 'moderate', count: 10, color: '#FF9800' },
        { impact: 'minor', count: 4, color: '#FFC107' },
      ],
      byLevel: [
        { level: 'A', count: 10 },
        { level: 'AA', count: 15 },
        { level: 'AAA', count: 0 },
      ],
      byPrinciple: [
        { principle: 'perceivable', name: 'Perceivable', count: 12, color: '#2196F3' },
        { principle: 'operable', name: 'Operable', count: 8, color: '#4CAF50' },
        { principle: 'understandable', name: 'Understandable', count: 3, color: '#FF9800' },
        { principle: 'robust', name: 'Robust', count: 2, color: '#9C27B0' },
      ],
      findings: [
        {
          id: 'a11y-1',
          ruleId: 'image-alt',
          rule: 'Images must have alternate text',
          criterion: '1.1.1',
          wcagLevel: 'A',
          principle: 'perceivable',
          impact: 'critical',
          element: 'img.hero-image',
          html: '<img src="hero.jpg">',
          description: 'Image missing alt text',
          suggestion: 'Add alt attribute describing the image',
          helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-content',
          pageUrl: 'https://example.com/',
          instanceCount: 3,
        },
      ],
      pages: [
        {
          url: 'https://example.com/',
          title: 'Home',
          findingsCount: 15,
          passedCount: 85,
          score: 85,
        },
      ],
      timestamp: '2026-01-30T12:00:00Z',
      duration: 60000,
      toolVersion: '4.8.0',
      summary: '25 accessibility issues found',
    };

    it('should create accessibility surface', () => {
      const surface = createAccessibilitySurface(mockA11yAudit);

      expect(surface.type).toBe('surfaceUpdate');
      expect(surface.surfaceId).toBe('a11y-report');
      expect(surface.components.length).toBeGreaterThan(0);
    });

    it('should create accessibility data update', () => {
      const update = createAccessibilityDataUpdate(mockA11yAudit);

      expect(update.type).toBe('dataModelUpdate');
      const a11y = update.data.a11y as Record<string, unknown>;
      expect(a11y.total).toBe(25);
      expect(a11y.score).toBe(87);
      expect(a11y.isCompliant).toBe(false);
    });

    it('should compute impact counts', () => {
      const update = createAccessibilityDataUpdate(mockA11yAudit);
      const impacts = (update.data.a11y as Record<string, unknown>).impacts as Record<string, number>;

      expect(impacts.critical).toBe(1);
      expect(impacts.serious).toBe(0);
    });

    it('should compute level counts', () => {
      const update = createAccessibilityDataUpdate(mockA11yAudit);
      const levels = (update.data.a11y as Record<string, unknown>).levels as Record<string, number>;

      expect(levels.A).toBe(1);
      expect(levels.AA).toBe(0);
    });

    it('should generate compliance text', () => {
      const update = createAccessibilityDataUpdate(mockA11yAudit);
      const a11y = update.data.a11y as Record<string, unknown>;

      expect(a11y.complianceText).toContain('does not meet WCAG AA');
    });

    it('should include QE-specific components', () => {
      const surface = createAccessibilitySurface(mockA11yAudit);
      const types = surface.components.map((c) => c.type);

      expect(types).toContain('qe:a11yScoreGauge');
      expect(types).toContain('qe:complianceBadge');
      expect(types).toContain('qe:a11yFindingCard');
      expect(types).toContain('qe:a11yImpactBadge');
    });
  });
});

describe('A2UI Renderer Integration', () => {
  it('should create complete surface workflow', () => {
    const generator = createSurfaceGenerator();

    const builder = createComponentBuilder();
    builder
      .beginSurface('dashboard')
      .setTitle('QE Dashboard')
      .addComponent('root', { type: 'Column' })
      .addChild('root', 'coverage', { type: 'qe:coverageGauge', value: path('/coverage') })
      .addChild('root', 'tests', { type: 'qe:testStatusBadge', count: path('/tests/passed') });

    generator.applyBuilder(builder);

    generator.setData('dashboard', {
      coverage: 85.5,
      tests: { passed: 100, failed: 5 },
    });

    const messages = generator.getAllMessages('dashboard');

    expect(messages).not.toBeNull();
    expect(messages?.beginRendering.title).toBe('QE Dashboard');
    expect(messages?.surfaceUpdate.components).toHaveLength(3);
    expect(messages?.dataModelUpdate.data.coverage).toBe(85.5);
  });

  it('should handle incremental updates', () => {
    const generator = createSurfaceGenerator();
    generator.createSurface('test');

    generator.addComponents('test', [
      { id: 'gauge', type: 'qe:coverageGauge', properties: { value: 80 } },
      { id: 'badge', type: 'qe:testStatusBadge', properties: { count: 50 } },
    ]);

    generator.updateComponent('test', 'gauge', { properties: { value: 85 } });

    const update = generator.generateIncrementalUpdate('test', ['gauge']);

    expect(update?.components).toHaveLength(1);
    expect(update?.components[0].properties.value).toBe(85);
  });

  it('should emit proper version tracking', () => {
    const generator = createSurfaceGenerator();
    generator.createSurface('test');

    const v1 = generator.generateSurfaceUpdate('test')?.version;
    generator.addComponent('test', { id: 'a', type: 'Text', properties: {} });

    const v2 = generator.generateSurfaceUpdate('test')?.version;
    expect(v2).toBeGreaterThan(v1!);
  });

  it('should work with QE templates end-to-end', () => {
    const generator = createSurfaceGenerator();

    const coverageSurface = createCoverageSurface({
      total: 85,
      target: 80,
      lineCoverage: 88,
      branchCoverage: 75,
      functionCoverage: 92,
      modules: [],
      files: [],
      gaps: [],
      timestamp: '2026-01-30T12:00:00Z',
      summary: 'Coverage is good',
    });

    generator.createSurface(coverageSurface.surfaceId);
    generator.addComponents(coverageSurface.surfaceId, coverageSurface.components);

    const components = generator.getComponents(coverageSurface.surfaceId);
    expect(components.length).toBeGreaterThan(0);

    const beginMsg = generator.generateBeginRendering(coverageSurface.surfaceId);
    expect(beginMsg).not.toBeNull();
  });
});
