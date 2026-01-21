/**
 * Agentic QE v3 - Requirements Validation MCP Tool
 *
 * qe/requirements/validate - Validate requirements for testability
 *
 * This tool wraps the requirements-validation domain service.
 */

import { MCPToolBase, MCPToolConfig, MCPToolContext, MCPToolSchema } from '../base';
import { ToolResult } from '../../types';

// ============================================================================
// Types
// ============================================================================

export interface RequirementsValidateParams {
  requirements: RequirementInput[];
  generateBDD?: boolean;
  checkAmbiguity?: boolean;
  minTestability?: number;
  [key: string]: unknown;
}

export interface RequirementInput {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria?: string[];
  type?: 'user-story' | 'functional' | 'non-functional' | 'technical';
}

export interface RequirementsValidateResult {
  validationResults: ValidationResult[];
  summary: ValidationSummary;
  bddScenarios?: BDDScenario[];
  recommendations: string[];
}

export interface ValidationResult {
  requirementId: string;
  isValid: boolean;
  testabilityScore: TestabilityScore;
  errors: ValidationError[];
  ambiguityReport?: AmbiguityReport;
}

export interface TestabilityScore {
  value: number;
  category: 'excellent' | 'good' | 'fair' | 'poor';
  factors: { name: string; score: number; issues: string[] }[];
}

export interface ValidationError {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  suggestion?: string;
}

export interface AmbiguityReport {
  ambiguousTerms: { term: string; context: string; alternatives: string[] }[];
  overallScore: number;
  suggestions: string[];
}

export interface BDDScenario {
  id: string;
  feature: string;
  scenario: string;
  given: string[];
  when: string[];
  then: string[];
  tags: string[];
}

export interface ValidationSummary {
  total: number;
  valid: number;
  invalid: number;
  avgTestability: number;
  blockers: number;
}

// ============================================================================
// Tool Implementation
// ============================================================================

export class RequirementsValidateTool extends MCPToolBase<RequirementsValidateParams, RequirementsValidateResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/requirements/validate',
    description: 'Validate requirements for testability. Scores each requirement, detects ambiguity, and optionally generates BDD scenarios.',
    domain: 'requirements-validation',
    schema: REQUIREMENTS_VALIDATE_SCHEMA,
    streaming: true,
    timeout: 120000,
  };

  async execute(
    params: RequirementsValidateParams,
    context: MCPToolContext
  ): Promise<ToolResult<RequirementsValidateResult>> {
    const {
      requirements,
      generateBDD = false,
      checkAmbiguity = true,
      minTestability = 60,
    } = params;

    try {
      this.emitStream(context, {
        status: 'validating',
        message: `Validating ${requirements.length} requirements`,
      });

      if (this.isAborted(context)) {
        return { success: false, error: 'Operation aborted' };
      }

      const validationResults: ValidationResult[] = [];
      const bddScenarios: BDDScenario[] = [];

      for (const req of requirements) {
        this.emitStream(context, {
          status: 'processing',
          message: `Analyzing: ${req.title}`,
        });

        const testabilityScore = calculateTestability(req);
        const errors = validateRequirement(req, minTestability, testabilityScore);
        const ambiguityReport = checkAmbiguity ? analyzeAmbiguity(req) : undefined;

        validationResults.push({
          requirementId: req.id,
          isValid: errors.filter(e => e.severity === 'error').length === 0,
          testabilityScore,
          errors,
          ambiguityReport,
        });

        if (generateBDD && testabilityScore.value >= minTestability) {
          bddScenarios.push(...generateBDDScenarios(req));
        }
      }

      const summary: ValidationSummary = {
        total: requirements.length,
        valid: validationResults.filter(r => r.isValid).length,
        invalid: validationResults.filter(r => !r.isValid).length,
        avgTestability: validationResults.reduce((sum, r) => sum + r.testabilityScore.value, 0) / requirements.length,
        blockers: validationResults.filter(r => r.errors.some(e => e.severity === 'error')).length,
      };

      this.emitStream(context, {
        status: 'complete',
        message: `Validation complete: ${summary.valid}/${summary.total} valid`,
        progress: 100,
      });

      return {
        success: true,
        data: {
          validationResults,
          summary,
          bddScenarios: bddScenarios.length > 0 ? bddScenarios : undefined,
          recommendations: generateRecommendations(validationResults),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

// ============================================================================
// Schema
// ============================================================================

const REQUIREMENTS_VALIDATE_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    requirements: {
      type: 'array',
      description: 'Requirements to validate',
      items: {
        type: 'object',
        description: 'Requirement input',
        properties: {
          id: { type: 'string', description: 'Requirement ID' },
          title: { type: 'string', description: 'Requirement title' },
          description: { type: 'string', description: 'Requirement description' },
          acceptanceCriteria: {
            type: 'array',
            description: 'Acceptance criteria',
            items: { type: 'string', description: 'Criterion' },
          },
          type: {
            type: 'string',
            description: 'Requirement type',
            enum: ['user-story', 'functional', 'non-functional', 'technical'],
          },
        },
        required: ['id', 'title', 'description'],
      },
    },
    generateBDD: {
      type: 'boolean',
      description: 'Generate BDD scenarios from requirements',
      default: false,
    },
    checkAmbiguity: {
      type: 'boolean',
      description: 'Check for ambiguous language',
      default: true,
    },
    minTestability: {
      type: 'number',
      description: 'Minimum testability score (0-100)',
      minimum: 0,
      maximum: 100,
      default: 60,
    },
  },
  required: ['requirements'],
};

// ============================================================================
// Helper Functions
// ============================================================================

function calculateTestability(req: RequirementInput): TestabilityScore {
  const factors: { name: string; score: number; issues: string[] }[] = [];

  // Check for acceptance criteria
  const acScore = req.acceptanceCriteria && req.acceptanceCriteria.length > 0 ? 90 : 40;
  factors.push({
    name: 'Acceptance Criteria',
    score: acScore,
    issues: acScore < 70 ? ['Missing or incomplete acceptance criteria'] : [],
  });

  // Check description clarity
  const descLength = req.description.length;
  const descScore = descLength > 100 ? 85 : descLength > 50 ? 70 : 50;
  factors.push({
    name: 'Description Clarity',
    score: descScore,
    issues: descScore < 70 ? ['Description may be too brief'] : [],
  });

  // Check for measurability
  const measurableTerms = ['should', 'must', 'when', 'then', 'verify', 'validate'];
  const hasMeasurable = measurableTerms.some(t => req.description.toLowerCase().includes(t));
  const measScore = hasMeasurable ? 80 : 50;
  factors.push({
    name: 'Measurability',
    score: measScore,
    issues: measScore < 70 ? ['Requirement lacks measurable criteria'] : [],
  });

  const avgScore = Math.round(factors.reduce((sum, f) => sum + f.score, 0) / factors.length);

  return {
    value: avgScore,
    category: avgScore >= 80 ? 'excellent' : avgScore >= 70 ? 'good' : avgScore >= 50 ? 'fair' : 'poor',
    factors,
  };
}

function validateRequirement(
  req: RequirementInput,
  minTestability: number,
  score: TestabilityScore
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (score.value < minTestability) {
    errors.push({
      code: 'LOW_TESTABILITY',
      message: `Testability score ${score.value} is below minimum ${minTestability}`,
      severity: 'error',
      suggestion: 'Add clear acceptance criteria and measurable outcomes',
    });
  }

  if (!req.acceptanceCriteria || req.acceptanceCriteria.length === 0) {
    errors.push({
      code: 'MISSING_AC',
      message: 'No acceptance criteria defined',
      severity: 'warning',
      suggestion: 'Define specific, testable acceptance criteria',
    });
  }

  if (req.description.length < 30) {
    errors.push({
      code: 'BRIEF_DESC',
      message: 'Description is too brief',
      severity: 'warning',
      suggestion: 'Expand description with more context and details',
    });
  }

  return errors;
}

function analyzeAmbiguity(req: RequirementInput): AmbiguityReport {
  const ambiguousTerms: { term: string; context: string; alternatives: string[] }[] = [];
  const vagueWords = ['some', 'few', 'many', 'fast', 'slow', 'good', 'better', 'appropriate'];

  for (const word of vagueWords) {
    if (req.description.toLowerCase().includes(word)) {
      ambiguousTerms.push({
        term: word,
        context: `Found in: "${req.description.substring(0, 50)}..."`,
        alternatives: getAlternatives(word),
      });
    }
  }

  return {
    ambiguousTerms,
    overallScore: Math.max(0, 100 - ambiguousTerms.length * 15),
    suggestions: ambiguousTerms.length > 0
      ? ['Replace vague terms with specific, measurable criteria']
      : ['Requirement language is clear'],
  };
}

function getAlternatives(term: string): string[] {
  const alternatives: Record<string, string[]> = {
    'some': ['exactly N', 'at least N', 'between N and M'],
    'few': ['1-3', 'less than 5'],
    'many': ['more than 10', 'at least N'],
    'fast': ['within X milliseconds', 'response time < Xs'],
    'slow': ['longer than X seconds'],
    'good': ['score >= 80%', 'passes all criteria'],
    'better': ['improves by X%', 'exceeds baseline by N'],
    'appropriate': ['meets requirement X', 'validates against schema'],
  };
  return alternatives[term] || ['Be more specific'];
}

function generateBDDScenarios(req: RequirementInput): BDDScenario[] {
  const scenarios: BDDScenario[] = [];

  scenarios.push({
    id: `scenario-${req.id}-1`,
    feature: req.title,
    scenario: `Verify ${req.title}`,
    given: ['the system is initialized', 'the user is authenticated'],
    when: ['the user performs the action'],
    then: ['the expected outcome is observed', 'the system state is updated'],
    tags: ['@generated', `@${req.type || 'functional'}`],
  });

  if (req.acceptanceCriteria && req.acceptanceCriteria.length > 0) {
    req.acceptanceCriteria.forEach((ac, idx) => {
      scenarios.push({
        id: `scenario-${req.id}-ac${idx + 1}`,
        feature: req.title,
        scenario: `Acceptance Criteria: ${ac.substring(0, 50)}`,
        given: ['the preconditions are met'],
        when: ['the specified action is taken'],
        then: [ac],
        tags: ['@generated', '@acceptance'],
      });
    });
  }

  return scenarios;
}

function generateRecommendations(results: ValidationResult[]): string[] {
  const recommendations: string[] = [];
  const lowScoreCount = results.filter(r => r.testabilityScore.value < 60).length;
  const missingACCount = results.filter(r => r.errors.some(e => e.code === 'MISSING_AC')).length;

  if (lowScoreCount > 0) {
    recommendations.push(`${lowScoreCount} requirements have low testability scores. Consider adding acceptance criteria.`);
  }

  if (missingACCount > 0) {
    recommendations.push(`${missingACCount} requirements lack acceptance criteria. Define testable criteria for each.`);
  }

  if (results.every(r => r.isValid)) {
    recommendations.push('All requirements are valid and testable.');
  }

  return recommendations;
}
