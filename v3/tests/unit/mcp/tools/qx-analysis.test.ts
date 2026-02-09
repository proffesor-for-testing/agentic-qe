/**
 * QX Analysis Tools Unit Tests
 *
 * Tests for the programmatic QX analysis MCP tools.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { QXAnalyzeTool } from '../../../../src/mcp/tools/qx-analysis/analyze';
import { QXHeuristicsEngine } from '../../../../src/mcp/tools/qx-analysis/heuristics-engine';
import { OracleDetector } from '../../../../src/mcp/tools/qx-analysis/oracle-detector';
import { ImpactAnalyzer } from '../../../../src/mcp/tools/qx-analysis/impact-analyzer';
import { QXHeuristic, QXContext } from '../../../../src/mcp/tools/qx-analysis/types';

describe('QXHeuristicsEngine', () => {
  let engine: QXHeuristicsEngine;

  beforeEach(() => {
    engine = new QXHeuristicsEngine();
  });

  it('should apply all 23 heuristics by default', async () => {
    const context: QXContext = {
      url: 'https://example.com',
      title: 'Test Page',
      domMetrics: {
        totalElements: 100,
        interactiveElements: 20,
        forms: 1,
        inputs: 5,
        buttons: 10,
        semanticStructure: {
          hasNav: true,
          hasHeader: true,
          hasFooter: true,
          hasMain: true,
          hasAside: false,
          hasArticle: false,
          hasSection: true,
        },
      },
      accessibility: {
        altTextsCoverage: 85,
        focusableElementsCount: 15,
        ariaLabelsCount: 8,
      },
      performance: {
        loadTime: 1500,
      },
    };

    const problemAnalysis = {
      problemStatement: 'Evaluate quality experience of "Test Page"',
      complexity: 'moderate' as const,
      breakdown: ['Navigation structure', 'Form interactions'],
      potentialFailures: [
        { description: 'Test failure', severity: 'medium' as const, likelihood: 'possible' as const },
        { description: 'Test failure 2', severity: 'low' as const, likelihood: 'unlikely' as const },
        { description: 'Test failure 3', severity: 'medium' as const, likelihood: 'likely' as const },
      ],
      clarityScore: 75,
    };

    const userNeeds = {
      needs: [
        { description: 'Clear navigation', priority: 'must-have' as const, addressed: true },
      ],
      suitability: 'good' as const,
      challenges: [],
      alignmentScore: 80,
    };

    const businessNeeds = {
      primaryGoal: 'balanced' as const,
      kpisAffected: ['Page views', 'Engagement'],
      crossTeamImpact: [],
      compromisesUX: false,
      impactsKPIs: true,
      alignmentScore: 75,
    };

    const results = await engine.applyAll(context, problemAnalysis, userNeeds, businessNeeds);

    expect(results).toHaveLength(23);
    expect(results.every((r) => r.applied)).toBe(true);
    expect(results.every((r) => r.score >= 0 && r.score <= 100)).toBe(true);
  });

  it('should apply specific heuristics when configured', async () => {
    const customEngine = new QXHeuristicsEngine({
      enabledHeuristics: [QXHeuristic.RULE_OF_THREE, QXHeuristic.USER_FEELINGS_IMPACT],
    });

    const context: QXContext = { url: 'https://example.com', title: 'Test' };
    const problemAnalysis = {
      problemStatement: 'Test',
      complexity: 'simple' as const,
      breakdown: [],
      potentialFailures: [
        { description: 'F1', severity: 'low' as const, likelihood: 'unlikely' as const },
        { description: 'F2', severity: 'low' as const, likelihood: 'unlikely' as const },
        { description: 'F3', severity: 'low' as const, likelihood: 'unlikely' as const },
      ],
      clarityScore: 50,
    };
    const userNeeds = { needs: [], suitability: 'adequate' as const, challenges: [], alignmentScore: 50 };
    const businessNeeds = {
      primaryGoal: 'balanced' as const,
      kpisAffected: [],
      crossTeamImpact: [],
      compromisesUX: false,
      impactsKPIs: false,
      alignmentScore: 50,
    };

    const results = await customEngine.applyAll(context, problemAnalysis, userNeeds, businessNeeds);

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe(QXHeuristic.RULE_OF_THREE);
    expect(results[1].id).toBe(QXHeuristic.USER_FEELINGS_IMPACT);
  });
});

describe('OracleDetector', () => {
  it('should detect user vs business conflicts', () => {
    const detector = new OracleDetector('low');

    const context: QXContext = { url: 'https://example.com', title: 'E-commerce Shop' };
    const userNeeds = {
      needs: [],
      suitability: 'good' as const,
      challenges: [],
      alignmentScore: 90, // High user alignment
    };
    const businessNeeds = {
      primaryGoal: 'business-ease' as const,
      kpisAffected: ['Conversion rate'],
      crossTeamImpact: [],
      compromisesUX: false,
      impactsKPIs: true,
      alignmentScore: 60, // Low business alignment
    };

    const problems = detector.detect(context, userNeeds, businessNeeds);

    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((p) => p.type === 'user-vs-business')).toBe(true);
  });

  it('should detect domain-specific oracle problems for healthcare', () => {
    const detector = new OracleDetector('low');

    const context: QXContext = {
      url: 'https://healthcare.org',
      title: 'Northern Healthcare NHS',
      accessibility: { altTextsCoverage: 60 },
    };
    const userNeeds = {
      needs: [],
      suitability: 'good' as const,
      challenges: [],
      alignmentScore: 75,
    };
    const businessNeeds = {
      primaryGoal: 'balanced' as const,
      kpisAffected: [],
      crossTeamImpact: [],
      compromisesUX: false,
      impactsKPIs: false,
      alignmentScore: 70,
    };

    const problems = detector.detect(context, userNeeds, businessNeeds);

    // Healthcare sites should have compliance-related oracle problems
    expect(problems.some((p) => p.type === 'stakeholder-conflict')).toBe(true);
    expect(problems.some((p) => p.stakeholders?.includes('Patients'))).toBe(true);
  });
});

describe('ImpactAnalyzer', () => {
  it('should analyze visible and invisible impacts', () => {
    const analyzer = new ImpactAnalyzer();

    const context: QXContext = {
      url: 'https://example.com',
      title: 'Test Page',
      domMetrics: {
        totalElements: 100,
        interactiveElements: 25,
        forms: 2,
        inputs: 8,
        buttons: 10,
        semanticStructure: {
          hasNav: true,
          hasHeader: true,
          hasFooter: true,
          hasMain: true,
          hasAside: false,
          hasArticle: false,
          hasSection: false,
        },
      },
      accessibility: {
        altTextsCoverage: 75,
        focusableElementsCount: 20,
      },
      performance: {
        loadTime: 2500,
      },
    };

    const problemAnalysis = {
      problemStatement: 'Test',
      complexity: 'moderate' as const,
      breakdown: [],
      potentialFailures: [],
      clarityScore: 70,
    };

    const impact = analyzer.analyze(context, problemAnalysis);

    expect(impact.visible.guiFlow?.forEndUser.length).toBeGreaterThan(0);
    expect(impact.visible.userFeelings.length).toBeGreaterThan(0);
    expect(impact.invisible.performance.length).toBeGreaterThan(0);
    expect(impact.immutableRequirements.length).toBeGreaterThan(0);
    expect(impact.overallImpactScore).toBeGreaterThanOrEqual(0);
    expect(impact.overallImpactScore).toBeLessThanOrEqual(100);
  });
});

describe('QXAnalyzeTool', () => {
  let tool: QXAnalyzeTool;

  beforeEach(() => {
    tool = new QXAnalyzeTool();
  });

  it('should have correct configuration', () => {
    expect(tool.config.name).toBe('qe/qx/analyze');
    expect(tool.config.domain).toBe('quality-assessment');
  });

  it('should execute full QX analysis', async () => {
    const params = {
      target: 'https://example.com',
      context: {
        url: 'https://example.com',
        title: 'Example Domain',
        domMetrics: {
          totalElements: 50,
          interactiveElements: 10,
          forms: 0,
          inputs: 0,
          buttons: 5,
          semanticStructure: {
            hasNav: true,
            hasHeader: true,
            hasFooter: true,
            hasMain: true,
            hasAside: false,
            hasArticle: false,
            hasSection: false,
          },
        },
        accessibility: {
          altTextsCoverage: 80,
          focusableElementsCount: 12,
          ariaLabelsCount: 5,
        },
        performance: {
          loadTime: 1200,
        },
      },
    };

    const result = await tool.invoke(params);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.data?.overallScore).toBeLessThanOrEqual(100);
    expect(result.data?.grade).toMatch(/^[A-F]$/);
    expect(result.data?.heuristics).toHaveLength(23);
    expect(result.data?.problemAnalysis.potentialFailures.length).toBeGreaterThanOrEqual(3); // Rule of Three
    expect(result.data?.recommendations.length).toBeGreaterThan(0);
  });

  it('should work with minimal context', async () => {
    const params = {
      target: 'https://example.com',
    };

    const result = await tool.invoke(params);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.target).toBe('https://example.com');
  });
});
