/**
 * Test Generation Domain Tools
 *
 * Comprehensive test generation tools for unit, integration, and E2E testing
 * with AI-powered analysis, sublinear optimization, and quality metrics.
 *
 * @module tools/qe/test-generation
 * @version 1.0.0
 */

// Unit test generation
export {
  generateUnitTests,
  type GeneratedUnitTest,
  type UnitTestGenerationResult
} from './generate-unit-tests'

// Integration test generation
export {
  generateIntegrationTests,
  type GeneratedIntegrationTest,
  type IntegrationTestGenerationResult
} from './generate-integration-tests'

// Test suite optimization
export {
  optimizeTestSuite,
  type TestSuiteOptimizationParams,
  type TestInput,
  type OptimizedTest,
  type TestSuiteOptimizationResult
} from './optimize-test-suite'

// Test quality analysis
export {
  analyzeTestQuality,
  type TestQualityAnalysisParams,
  type TestQualityInput,
  type TestQualityAnalysisResult
} from './analyze-test-quality'

// Re-import for TestGenerationTools object
import { generateUnitTests } from './generate-unit-tests'
import { generateIntegrationTests } from './generate-integration-tests'
import { optimizeTestSuite } from './optimize-test-suite'
import { analyzeTestQuality } from './analyze-test-quality'

/**
 * Test Generation Tools API
 * Consolidated interface for all test generation operations
 */
export const TestGenerationTools = {
  generateUnitTests,
  generateIntegrationTests,
  optimizeTestSuite,
  analyzeTestQuality
} as const;

/**
 * Tool metadata
 */
export const TestGenerationMetadata = {
  domain: 'test-generation',
  version: '1.0.0',
  tools: [
    {
      name: 'generateUnitTests',
      description: 'AI-powered unit test generation with pattern recognition',
      complexity: 'O(n·log n)',
      features: [
        'AST-based code analysis',
        'Pattern-based test generation',
        'Mock generation',
        'Edge case coverage',
        'Multi-framework support'
      ]
    },
    {
      name: 'generateIntegrationTests',
      description: 'Integration test generation with dependency mocking and contract testing',
      complexity: 'O(n·m)',
      features: [
        'Dependency analysis',
        'Contract test generation',
        'Mock strategies (full/partial/none)',
        'Integration point detection',
        'Multi-framework support'
      ]
    },
    {
      name: 'optimizeTestSuite',
      description: 'Sublinear test suite optimization with Johnson-Lindenstrauss',
      complexity: 'O(log n / ε²)',
      features: [
        'Johnson-Lindenstrauss dimension reduction',
        'Temporal advantage prediction',
        'Redundancy detection',
        'Critical test preservation',
        'Coverage maintenance'
      ]
    },
    {
      name: 'analyzeTestQuality',
      description: 'Comprehensive test quality analysis with metrics and recommendations',
      complexity: 'O(n)',
      features: [
        'Pattern detection',
        'Anti-pattern detection',
        'Maintainability analysis',
        'Detailed test scoring',
        'Actionable recommendations'
      ]
    }
  ]
} as const;
