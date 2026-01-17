/**
 * Test Recommendation Engine
 * Analyzes gaps and recommends specific tests prioritized by risk/complexity/change frequency
 *
 * @module coverage-tools/recommend-tests
 */

import type { CoverageGap } from '../../../types/analysis.js';
import { SecureRandom } from '../../../../utils/SecureRandom.js';

export interface TestRecommendation {
  id: string;
  testName: string;
  file: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimatedEffort: 'small' | 'medium' | 'large'; // Story points approximation
  coverageImpact: number; // Estimated coverage increase (0-100%)
  riskReduction: number; // Estimated risk reduction (0-100)
  testType: 'unit' | 'integration' | 'edge-case' | 'property-based';
  template: string; // Generated test template code
  reasoning: string;
  relatedGaps: string[]; // Gap IDs this test would cover
}

export interface TestRecommendationParams {
  gaps: CoverageGap[];
  maxRecommendations?: number;
  prioritizeBy?: 'risk' | 'complexity' | 'change-frequency' | 'coverage-impact';
  includeTemplates?: boolean;
  framework?: 'jest' | 'mocha' | 'vitest' | 'pytest';
  language?: 'typescript' | 'javascript' | 'python';
}

export interface TestRecommendationResult {
  recommendations: TestRecommendation[];
  totalRecommendations: number;
  estimatedCoverageIncrease: number;
  estimatedRiskReduction: number;
  summary: {
    byPriority: Record<string, number>;
    byEffort: Record<string, number>;
    byType: Record<string, number>;
  };
  timestamp: string;
}

/**
 * Determine test type based on gap characteristics
 */
function determineTestType(gap: CoverageGap): 'unit' | 'integration' | 'edge-case' | 'property-based' {
  switch (gap.type) {
    case 'edge-cases':
      return 'edge-case';
    case 'uncovered-functions':
      return gap.complexity > 5 ? 'property-based' : 'unit';
    case 'uncovered-branches':
      return gap.complexity > 7 ? 'integration' : 'unit';
    case 'uncovered-lines':
    default:
      return 'unit';
  }
}

/**
 * Estimate implementation effort
 */
function estimateEffort(
  testType: string,
  complexity: number,
  relatedGaps: number
): 'small' | 'medium' | 'large' {
  const effortScore = complexity * 10 + relatedGaps * 5 + (testType === 'property-based' ? 20 : 0);

  if (effortScore >= 60) return 'large';
  if (effortScore >= 30) return 'medium';
  return 'small';
}

/**
 * Calculate coverage impact (how much coverage this test would add)
 */
function calculateCoverageImpact(gap: CoverageGap, relatedGaps: CoverageGap[]): number {
  // Base impact from the primary gap
  let impact = 10; // Base 10% for any test

  // Add impact from gap type
  switch (gap.type) {
    case 'uncovered-functions':
      impact += 20;
      break;
    case 'uncovered-branches':
      impact += 15;
      break;
    case 'edge-cases':
      impact += 10;
      break;
    case 'uncovered-lines':
      impact += 5;
      break;
  }

  // Add impact from related gaps (each gap adds diminishing returns)
  relatedGaps.forEach((_, i) => {
    impact += 5 / (i + 1);
  });

  // Complexity multiplier (more complex = more coverage gained)
  impact *= 1 + (gap.complexity / 20);

  return Math.min(impact, 100);
}

/**
 * Calculate risk reduction from implementing test
 */
function calculateRiskReduction(gap: CoverageGap, coverageImpact: number): number {
  const baseRisk = gap.riskScore || 50;
  const severityMultiplier = {
    critical: 1.5,
    high: 1.2,
    medium: 1.0,
    low: 0.8
  }[gap.severity];

  const riskReduction = (coverageImpact / 100) * baseRisk * severityMultiplier;

  return Math.min(riskReduction, 100);
}

/**
 * Generate test template code
 */
function generateTestTemplate(
  testName: string,
  file: string,
  gap: CoverageGap,
  testType: string,
  framework: string,
  language: string
): string {
  const isTypeScript = language === 'typescript';
  const ext = isTypeScript ? 'ts' : 'js';
  const typeAnnotation = isTypeScript ? ': void' : '';

  let template = '';

  switch (framework) {
    case 'jest':
    case 'vitest':
      template = `describe('${testName}', () => {
  it('should cover ${gap.type.replace(/-/g, ' ')} in ${file}'${typeAnnotation}, async () => {
    // Arrange
    const testData = {}; // TODO: Setup test data

    // Act
    const result = await functionUnderTest(testData);

    // Assert
    expect(result).toBeDefined();
    // TODO: Add specific assertions for lines ${gap.location.start}-${gap.location.end}
  });
});`;
      break;

    case 'mocha':
      template = `describe('${testName}', function() {
  it('should cover ${gap.type.replace(/-/g, ' ')} in ${file}'${typeAnnotation}, async function() {
    // Arrange
    const testData = {}; // TODO: Setup test data

    // Act
    const result = await functionUnderTest(testData);

    // Assert
    assert.isDefined(result);
    // TODO: Add specific assertions for lines ${gap.location.start}-${gap.location.end}
  });
});`;
      break;

    case 'pytest':
      template = `def test_${testName.replace(/-/g, '_')}():
    """Cover ${gap.type.replace(/-/g, ' ')} in ${file}"""
    # Arrange
    test_data = {}  # TODO: Setup test data

    # Act
    result = function_under_test(test_data)

    # Assert
    assert result is not None
    # TODO: Add specific assertions for lines ${gap.location.start}-${gap.location.end}`;
      break;

    default:
      template = `// Test for ${testName}\n// File: ${file}\n// Lines: ${gap.location.start}-${gap.location.end}\n// Type: ${gap.type}`;
  }

  return template;
}

/**
 * Group gaps that should be covered by the same test
 */
function groupRelatedGaps(gaps: CoverageGap[]): Map<string, CoverageGap[]> {
  const grouped = new Map<string, CoverageGap[]>();

  gaps.forEach(gap => {
    // Group by file and proximity (within 20 lines)
    const key = `${gap.file}:${Math.floor(gap.location.start / 20)}`;

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(gap);
  });

  return grouped;
}

/**
 * Recommend specific tests based on coverage gaps
 * Prioritizes by risk, complexity, and change frequency
 */
export async function recommendTests(
  params: TestRecommendationParams
): Promise<TestRecommendationResult> {
  const {
    gaps,
    maxRecommendations = 10,
    prioritizeBy = 'risk',
    includeTemplates = true,
    framework = 'jest',
    language = 'typescript'
  } = params;

  // Group related gaps
  const groupedGaps = groupRelatedGaps(gaps);
  const recommendations: TestRecommendation[] = [];

  // Generate recommendations for each gap group
  for (const [groupKey, gapGroup] of groupedGaps.entries()) {
    // Use primary gap (highest severity) for recommendation
    const primaryGap = gapGroup.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    })[0];

    const testType = determineTestType(primaryGap);
    const relatedGaps = gapGroup.slice(1); // All except primary
    const effort = estimateEffort(testType, primaryGap.complexity, relatedGaps.length);
    const coverageImpact = calculateCoverageImpact(primaryGap, relatedGaps);
    const riskReduction = calculateRiskReduction(primaryGap, coverageImpact);

    const testName = `test-${primaryGap.file.split('/').pop()?.replace('.', '-')}-${primaryGap.type}-${primaryGap.location.start}`;

    const template = includeTemplates
      ? generateTestTemplate(testName, primaryGap.file, primaryGap, testType, framework, language)
      : '';

    const recommendation: TestRecommendation = {
      id: `rec-${groupKey}-${SecureRandom.randomInt(1000, 9999)}`,
      testName,
      file: primaryGap.file,
      priority: primaryGap.severity,
      estimatedEffort: effort,
      coverageImpact,
      riskReduction,
      testType,
      template,
      reasoning: `${primaryGap.context || 'Coverage gap detected'}. This test would cover ${gapGroup.length} related gap(s) and reduce risk by ${riskReduction.toFixed(1)}%.`,
      relatedGaps: gapGroup.map(g => `${g.file}:${g.location.start}-${g.location.end}`)
    };

    recommendations.push(recommendation);
  }

  // Sort by prioritization strategy
  let sortedRecommendations: TestRecommendation[];
  switch (prioritizeBy) {
    case 'risk':
      sortedRecommendations = recommendations.sort((a, b) => b.riskReduction - a.riskReduction);
      break;
    case 'complexity':
      sortedRecommendations = recommendations.sort((a, b) => {
        const effortOrder = { large: 3, medium: 2, small: 1 };
        return effortOrder[b.estimatedEffort] - effortOrder[a.estimatedEffort];
      });
      break;
    case 'coverage-impact':
      sortedRecommendations = recommendations.sort((a, b) => b.coverageImpact - a.coverageImpact);
      break;
    case 'change-frequency':
    default:
      // Use risk reduction as proxy for change frequency impact
      sortedRecommendations = recommendations.sort((a, b) => b.riskReduction - a.riskReduction);
      break;
  }

  // Limit to max recommendations
  const topRecommendations = sortedRecommendations.slice(0, maxRecommendations);

  // Calculate summary statistics
  const estimatedCoverageIncrease = topRecommendations.reduce(
    (sum, r) => sum + r.coverageImpact,
    0
  ) / topRecommendations.length;

  const estimatedRiskReduction = topRecommendations.reduce(
    (sum, r) => sum + r.riskReduction,
    0
  ) / topRecommendations.length;

  const summary = {
    byPriority: {
      critical: topRecommendations.filter(r => r.priority === 'critical').length,
      high: topRecommendations.filter(r => r.priority === 'high').length,
      medium: topRecommendations.filter(r => r.priority === 'medium').length,
      low: topRecommendations.filter(r => r.priority === 'low').length
    },
    byEffort: {
      small: topRecommendations.filter(r => r.estimatedEffort === 'small').length,
      medium: topRecommendations.filter(r => r.estimatedEffort === 'medium').length,
      large: topRecommendations.filter(r => r.estimatedEffort === 'large').length
    },
    byType: {
      unit: topRecommendations.filter(r => r.testType === 'unit').length,
      integration: topRecommendations.filter(r => r.testType === 'integration').length,
      'edge-case': topRecommendations.filter(r => r.testType === 'edge-case').length,
      'property-based': topRecommendations.filter(r => r.testType === 'property-based').length
    }
  };

  return {
    recommendations: topRecommendations,
    totalRecommendations: topRecommendations.length,
    estimatedCoverageIncrease,
    estimatedRiskReduction,
    summary,
    timestamp: new Date().toISOString()
  };
}
