/**
 * Requirements Validation Domain Tools
 *
 * Comprehensive requirements validation tools with INVEST criteria analysis,
 * SMART framework validation, and BDD scenario generation for Gherkin/Cucumber.
 *
 * @module tools/qe/requirements
 * @version 1.0.0
 */

// Requirements validation (INVEST criteria & SMART framework)
export {
  validateRequirements,
  type RequirementValidationResult,
  type BatchValidationResult,
  type ValidateRequirementsParams
} from './validate-requirements'

// BDD scenario generation (Gherkin/Cucumber)
export {
  generateBddScenarios,
  type GeneratedFeature,
  type BatchBddGenerationResult,
  type GenerateBddScenariosParams
} from './generate-bdd-scenarios'

// Re-import for RequirementsTools object
import { validateRequirements } from './validate-requirements'
import { generateBddScenarios } from './generate-bdd-scenarios'

import type { QEToolResponse } from '../shared/types'

/**
 * Requirements Validation Tools API
 * Consolidated interface for all requirements validation operations
 */
export const RequirementsTools = {
  validateRequirements,
  generateBddScenarios
} as const;

/**
 * Tool metadata
 */
export const RequirementsMetadata = {
  domain: 'requirements',
  version: '1.0.0',
  tools: [
    {
      name: 'validateRequirements',
      description: 'INVEST criteria validation with SMART framework analysis',
      complexity: 'O(n)',
      features: [
        'INVEST criteria evaluation (Independent, Negotiable, Valuable, Estimable, Small, Testable)',
        'SMART framework analysis (Specific, Measurable, Achievable, Relevant, Time-bound)',
        'Acceptance criteria validation',
        'Language clarity and ambiguity detection',
        'Testability scoring',
        'Risk assessment',
        'Batch validation support'
      ]
    },
    {
      name: 'generateBddScenarios',
      description: 'Gherkin/Cucumber scenario generation from requirements',
      complexity: 'O(n·m)',
      features: [
        'Feature file generation with narratives',
        'Scenario outline generation',
        'Background preconditions extraction',
        'Happy path scenarios',
        'Negative case scenarios',
        'Edge case scenario synthesis',
        'Data-driven test examples',
        'Test case count projection',
        'Traceability mapping'
      ]
    }
  ]
} as const;

// Helper response function for backward compatibility
const VERSION = '1.5.0';
function createResponse<T>(data: T, startTime: number): QEToolResponse<T> {
  return {
    success: true,
    data,
    metadata: {
      requestId: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      executionTime: Date.now() - startTime,
      version: VERSION,
      agent: 'requirements-validator'
    }
  };
}
