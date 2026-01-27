/**
 * Agentic QE v3 - Requirements Validation Service
 * Validates requirement quality and completeness
 *
 * ADR-051: Added LLM-powered requirements analysis for enhanced validation
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types/index.js';
import { MemoryBackend } from '../../../kernel/interfaces.js';
import {
  IRequirementsValidationService,
  Requirement,
  ValidationError,
  ValidationCriteria,
  AmbiguityReport,
  AmbiguousTerm,
  DependencyGraph,
  RequirementNode,
  DependencyEdge,
} from '../interfaces.js';

// ADR-051: LLM Router for AI-enhanced requirements analysis
import type { HybridRouter, ChatResponse } from '../../../shared/llm';

/**
 * Configuration for the requirements validator
 */
export interface RequirementsValidatorConfig {
  enableAmbiguityDetection: boolean;
  minAcceptanceCriteria: number;
  strictMode: boolean;
  forbiddenTermsDefault: string[];
  /** ADR-051: Enable LLM-powered requirements analysis */
  enableLLMAnalysis?: boolean;
  /** ADR-051: Model tier for LLM calls (1=Haiku, 2=Sonnet, 4=Opus) */
  llmModelTier?: number;
  /** ADR-051: Max tokens for LLM responses */
  llmMaxTokens?: number;
}

/**
 * Dependencies for RequirementsValidatorService
 * ADR-051: Added LLM router for AI-enhanced analysis
 */
export interface RequirementsValidatorDependencies {
  memory: MemoryBackend;
  /** ADR-051: Optional LLM router for AI-enhanced requirements analysis */
  llmRouter?: HybridRouter;
}

const DEFAULT_CONFIG: RequirementsValidatorConfig = {
  enableAmbiguityDetection: true,
  minAcceptanceCriteria: 1,
  strictMode: false,
  forbiddenTermsDefault: [],
  enableLLMAnalysis: true, // On by default - opt-out (ADR-051)
  llmModelTier: 2, // Sonnet by default for requirements analysis
  llmMaxTokens: 2048,
};

/**
 * Common ambiguous terms in requirements
 */
const AMBIGUOUS_TERMS: Record<string, string[]> = {
  'fast': ['within 100ms', 'under 1 second', 'response time < 500ms'],
  'quickly': ['within 100ms', 'under 1 second', 'response time < 500ms'],
  'user-friendly': ['meets WCAG 2.1 AA', 'usability score > 80', 'task completion < 3 clicks'],
  'intuitive': ['no training required', 'task completion rate > 90%'],
  'secure': ['encrypted with AES-256', 'authenticated via OAuth2', 'passes OWASP Top 10'],
  'scalable': ['handles 10K concurrent users', 'horizontal scaling supported'],
  'reliable': ['99.9% uptime', 'MTBF > 1000 hours'],
  'efficient': ['O(n) complexity', 'memory usage < 100MB'],
  'easy': ['single click action', 'no training required'],
  'simple': ['single-page workflow', 'under 5 steps'],
  'flexible': ['configurable via settings', 'supports multiple formats'],
  'robust': ['handles edge cases', 'graceful degradation'],
  'appropriate': ['defined by business rules', 'within acceptable range'],
  'reasonable': ['defined threshold', 'measurable criteria'],
  'adequate': ['meets minimum requirements', 'specified capacity'],
  'good': ['measurable quality metric', 'defined acceptance criteria'],
  'better': ['defined improvement metric', 'baseline comparison'],
  'best': ['top-ranked by metric', 'optimal solution'],
  'several': ['specify count: 3-5', 'defined quantity'],
  'many': ['specify count: 10+', 'defined quantity'],
  'few': ['specify count: 2-3', 'defined quantity'],
  'some': ['specify percentage or count', 'defined subset'],
  'most': ['specify percentage > 50%', 'defined majority'],
  'etc': ['complete list', 'defined scope'],
  'and/or': ['specify condition', 'boolean logic'],
};

/**
 * LLM-enhanced requirements analysis result
 * ADR-051: Provides AI-powered insights into requirements quality
 */
export interface LLMRequirementsAnalysis {
  /** Overall completeness score (0-100) */
  completenessScore: number;
  /** Testability score (0-100) */
  testabilityScore: number;
  /** Detected ambiguities with clarification suggestions */
  ambiguities: Array<{
    text: string;
    issue: string;
    suggestion: string;
  }>;
  /** Missing acceptance criteria suggestions */
  missingCriteria: string[];
  /** Improvement recommendations */
  recommendations: string[];
  /** Whether analysis was enhanced by LLM */
  llmEnhanced: boolean;
}

/**
 * Requirements Validation Service Implementation
 * Validates requirement quality, detects ambiguity, and analyzes dependencies
 *
 * ADR-051: Added LLM-powered requirements analysis for enhanced validation
 */
export class RequirementsValidatorService implements IRequirementsValidationService {
  private readonly config: RequirementsValidatorConfig;
  private readonly memory: MemoryBackend;
  private readonly llmRouter?: HybridRouter;

  constructor(
    dependencies: RequirementsValidatorDependencies | MemoryBackend,
    config: Partial<RequirementsValidatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Support both old and new constructor signatures for backward compatibility
    if ('memory' in dependencies && typeof dependencies.memory === 'object') {
      this.memory = dependencies.memory;
      this.llmRouter = dependencies.llmRouter;
    } else {
      this.memory = dependencies as MemoryBackend;
    }
  }

  // ============================================================================
  // ADR-051: LLM Enhancement Methods
  // ============================================================================

  /**
   * Check if LLM analysis is available and enabled
   */
  private isLLMAnalysisAvailable(): boolean {
    return this.config.enableLLMAnalysis === true && this.llmRouter !== undefined;
  }

  /**
   * Get model ID for the configured tier
   */
  private getModelForTier(tier: number): string {
    switch (tier) {
      case 1: return 'claude-3-5-haiku-20241022';
      case 2: return 'claude-sonnet-4-20250514';
      case 3: return 'claude-sonnet-4-20250514';
      case 4: return 'claude-opus-4-5-20251101';
      default: return 'claude-sonnet-4-20250514';
    }
  }

  /**
   * Analyze requirements with LLM for deeper insights
   * ADR-051: Provides completeness assessment, ambiguity detection, and testability scoring
   *
   * @param requirements - Requirements to analyze
   * @param codebaseContext - Optional context about the codebase (file structure, existing tests)
   * @returns Enhanced analysis with LLM insights
   */
  async analyzeRequirementsWithLLM(
    requirements: Requirement[],
    codebaseContext?: string
  ): Promise<Result<LLMRequirementsAnalysis>> {
    // Return basic analysis if LLM is not available
    if (!this.isLLMAnalysisAvailable()) {
      return ok(this.getBasicAnalysis(requirements));
    }

    try {
      const modelId = this.getModelForTier(this.config.llmModelTier ?? 2);
      const prompt = this.buildRequirementsAnalysisPrompt(requirements, codebaseContext);

      const response: ChatResponse = await this.llmRouter!.chat({
        messages: [
          {
            role: 'system',
            content: `You are a senior requirements engineer and QA specialist. Analyze requirements for:
1. Completeness - Are all necessary details present?
2. Testability - Can acceptance criteria be converted to test cases?
3. Ambiguity - Are there vague terms that need clarification?
4. Missing criteria - What acceptance criteria should be added?

Return JSON with:
{
  "completenessScore": <0-100>,
  "testabilityScore": <0-100>,
  "ambiguities": [{ "text": "", "issue": "", "suggestion": "" }],
  "missingCriteria": ["suggested criterion 1", ...],
  "recommendations": ["recommendation 1", ...]
}

Be specific and actionable in your suggestions.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: modelId,
        maxTokens: this.config.llmMaxTokens ?? 2048,
        temperature: 0.3, // Low temperature for consistent analysis
      });

      if (response.content) {
        try {
          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const analysis = JSON.parse(jsonMatch[0]);
            const result: LLMRequirementsAnalysis = {
              completenessScore: analysis.completenessScore ?? 50,
              testabilityScore: analysis.testabilityScore ?? 50,
              ambiguities: analysis.ambiguities ?? [],
              missingCriteria: analysis.missingCriteria ?? [],
              recommendations: analysis.recommendations ?? [],
              llmEnhanced: true,
            };

            // Store analysis in memory for future reference
            await this.storeAnalysisResult(requirements, result);

            return ok(result);
          }
        } catch {
          // JSON parse failed - use basic analysis
          console.warn('[RequirementsValidator] LLM response parsing failed');
        }
      }

      return ok(this.getBasicAnalysis(requirements));
    } catch (error) {
      console.warn('[RequirementsValidator] LLM analysis failed:', error);
      return ok(this.getBasicAnalysis(requirements));
    }
  }

  /**
   * Build the prompt for requirements analysis
   */
  private buildRequirementsAnalysisPrompt(
    requirements: Requirement[],
    codebaseContext?: string
  ): string {
    let prompt = '## Requirements to Analyze\n\n';

    for (const req of requirements) {
      prompt += `### ${req.id}: ${req.title}\n`;
      prompt += `**Type:** ${req.type}\n`;
      prompt += `**Description:** ${req.description}\n`;

      if (req.acceptanceCriteria.length > 0) {
        prompt += `**Acceptance Criteria:**\n`;
        for (const ac of req.acceptanceCriteria) {
          prompt += `- ${ac}\n`;
        }
      } else {
        prompt += `**Acceptance Criteria:** None provided\n`;
      }
      prompt += '\n';
    }

    if (codebaseContext) {
      prompt += `## Codebase Context\n${codebaseContext}\n\n`;
    }

    prompt += `## Analysis Request
Please analyze these requirements for:
1. Completeness - score 0-100
2. Testability - score 0-100
3. Ambiguous terms that need clarification
4. Missing acceptance criteria
5. General recommendations for improvement`;

    return prompt;
  }

  /**
   * Get basic analysis without LLM (fallback)
   */
  private getBasicAnalysis(requirements: Requirement[]): LLMRequirementsAnalysis {
    // Calculate basic scores based on heuristics
    let totalCompleteness = 0;
    let totalTestability = 0;
    const ambiguities: LLMRequirementsAnalysis['ambiguities'] = [];
    const missingCriteria: string[] = [];

    for (const req of requirements) {
      // Completeness: check for title, description, AC
      let completeness = 0;
      if (req.title && req.title.length >= 5) completeness += 30;
      if (req.description && req.description.length >= 20) completeness += 30;
      if (req.acceptanceCriteria.length >= 1) completeness += 40;
      totalCompleteness += completeness;

      // Testability: based on AC quality
      let testability = req.acceptanceCriteria.length > 0 ? 50 : 0;
      for (const ac of req.acceptanceCriteria) {
        const hasGWT = ac.toLowerCase().includes('given') ||
                      ac.toLowerCase().includes('when') ||
                      ac.toLowerCase().includes('then');
        if (hasGWT) testability += 10;
      }
      testability = Math.min(100, testability);
      totalTestability += testability;

      // Check for ambiguous terms
      const textToCheck = `${req.title} ${req.description}`;
      for (const term of Object.keys(AMBIGUOUS_TERMS)) {
        if (textToCheck.toLowerCase().includes(term)) {
          ambiguities.push({
            text: term,
            issue: `Term "${term}" is ambiguous`,
            suggestion: `Replace with specific criteria like: ${AMBIGUOUS_TERMS[term].slice(0, 2).join(' or ')}`,
          });
        }
      }

      // Suggest missing criteria
      if (req.acceptanceCriteria.length === 0) {
        missingCriteria.push(`Add acceptance criteria for "${req.title}" using Given-When-Then format`);
      }
    }

    const avgCompleteness = requirements.length > 0
      ? Math.round(totalCompleteness / requirements.length)
      : 0;
    const avgTestability = requirements.length > 0
      ? Math.round(totalTestability / requirements.length)
      : 0;

    return {
      completenessScore: avgCompleteness,
      testabilityScore: avgTestability,
      ambiguities: ambiguities.slice(0, 5), // Limit to top 5
      missingCriteria: missingCriteria.slice(0, 5),
      recommendations: [
        'Use Given-When-Then format for acceptance criteria',
        'Replace ambiguous terms with measurable criteria',
        'Include both positive and negative test scenarios',
      ],
      llmEnhanced: false,
    };
  }

  /**
   * Store LLM analysis result in memory
   */
  private async storeAnalysisResult(
    requirements: Requirement[],
    analysis: LLMRequirementsAnalysis
  ): Promise<void> {
    const analysisId = uuidv4();
    await this.memory.set(
      `requirements-validation:llm-analysis:${analysisId}`,
      {
        requirementIds: requirements.map(r => r.id),
        analysis,
        analyzedAt: new Date().toISOString(),
      },
      { namespace: 'requirements-validation', ttl: 86400 * 7 } // 7 days
    );
  }

  /**
   * Validate a single requirement
   */
  async validate(requirement: Requirement): Promise<Result<ValidationError[]>> {
    try {
      const errors: ValidationError[] = [];

      // Validate required fields
      errors.push(...this.validateRequiredFields(requirement));

      // Validate acceptance criteria
      errors.push(...this.validateAcceptanceCriteria(requirement));

      // Validate description quality
      errors.push(...this.validateDescriptionQuality(requirement));

      // Validate title
      errors.push(...this.validateTitle(requirement));

      // Check for forbidden terms
      errors.push(
        ...this.checkForbiddenTerms(requirement, this.config.forbiddenTermsDefault)
      );

      // Store validation result
      await this.storeValidationResult(requirement.id, errors);

      return ok(errors);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Validate requirement against specific criteria
   */
  async validateAgainstCriteria(
    requirement: Requirement,
    criteria: ValidationCriteria
  ): Promise<Result<ValidationError[]>> {
    try {
      const errors: ValidationError[] = [];

      // Check acceptance criteria requirement
      if (criteria.requireAcceptanceCriteria) {
        if (requirement.acceptanceCriteria.length === 0) {
          errors.push({
            code: 'MISSING_AC',
            message: 'Acceptance criteria are required but not provided',
            severity: 'error',
            suggestion: 'Add at least one acceptance criterion using Given-When-Then format',
          });
        }
      }

      // Check forbidden terms
      errors.push(...this.checkForbiddenTerms(requirement, criteria.forbiddenTerms));

      // Check required tags (via acceptance criteria or description patterns)
      for (const tag of criteria.requiredTags) {
        const hasTag = this.checkForTag(requirement, tag);
        if (!hasTag) {
          errors.push({
            code: 'MISSING_TAG',
            message: `Required tag or keyword missing: ${tag}`,
            severity: 'warning',
            suggestion: `Include ${tag} in the requirement or acceptance criteria`,
          });
        }
      }

      // Testability score check (deferred to TestabilityScorer integration)
      // This would be checked at the coordinator level

      return ok(errors);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Check for ambiguity in requirement language
   */
  async detectAmbiguity(requirement: Requirement): Promise<Result<AmbiguityReport>> {
    try {
      const ambiguousTerms: AmbiguousTerm[] = [];
      const textToAnalyze = `${requirement.title} ${requirement.description} ${requirement.acceptanceCriteria.join(' ')}`;
      const lowerText = textToAnalyze.toLowerCase();

      // Check for known ambiguous terms
      for (const [term, alternatives] of Object.entries(AMBIGUOUS_TERMS)) {
        const regex = new RegExp(`\\b${term}\\b`, 'gi');
        const matches = lowerText.match(regex);

        if (matches) {
          // Find context around the term
          const termIndex = lowerText.indexOf(term.toLowerCase());
          const contextStart = Math.max(0, termIndex - 30);
          const contextEnd = Math.min(textToAnalyze.length, termIndex + term.length + 30);
          const context = textToAnalyze.slice(contextStart, contextEnd).trim();

          ambiguousTerms.push({
            term,
            context: `...${context}...`,
            alternatives,
          });
        }
      }

      // Calculate overall ambiguity score (0-100, lower is better)
      const wordCount = textToAnalyze.split(/\s+/).length;
      const ambiguityRatio = ambiguousTerms.length / wordCount;
      const overallScore = Math.round(Math.max(0, 100 - ambiguityRatio * 500));

      // Generate suggestions
      const suggestions = this.generateAmbiguitySuggestions(ambiguousTerms);

      const report: AmbiguityReport = {
        ambiguousTerms,
        overallScore,
        suggestions,
      };

      // Store analysis result
      await this.memory.set(
        `requirements-validation:ambiguity:${requirement.id}`,
        report,
        { namespace: 'requirements-validation', ttl: 86400 }
      );

      return ok(report);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Analyze requirement dependencies
   */
  async analyzeDependencies(requirements: Requirement[]): Promise<Result<DependencyGraph>> {
    try {
      const nodes: RequirementNode[] = requirements.map((req) => ({
        id: req.id,
        title: req.title,
        type: req.type,
      }));

      const edges: DependencyEdge[] = [];

      // Analyze each requirement for dependencies
      for (const req of requirements) {
        const dependencies = this.extractDependencies(req, requirements);
        edges.push(...dependencies);
      }

      const graph: DependencyGraph = {
        nodes,
        edges,
      };

      // Store graph for later use
      const graphId = uuidv4();
      await this.memory.set(
        `requirements-validation:dependency-graph:${graphId}`,
        graph,
        { namespace: 'requirements-validation', persist: true }
      );

      return ok(graph);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Private Validation Methods
  // ============================================================================

  private validateRequiredFields(requirement: Requirement): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!requirement.id) {
      errors.push({
        code: 'MISSING_ID',
        message: 'Requirement ID is missing',
        severity: 'error',
      });
    }

    if (!requirement.title || requirement.title.trim().length === 0) {
      errors.push({
        code: 'MISSING_TITLE',
        message: 'Requirement title is missing or empty',
        severity: 'error',
        suggestion: 'Add a clear, concise title that summarizes the requirement',
      });
    }

    if (!requirement.description || requirement.description.trim().length === 0) {
      errors.push({
        code: 'MISSING_DESCRIPTION',
        message: 'Requirement description is missing or empty',
        severity: 'error',
        suggestion: 'Add a detailed description of what should be implemented',
      });
    }

    return errors;
  }

  private validateAcceptanceCriteria(requirement: Requirement): ValidationError[] {
    const errors: ValidationError[] = [];

    if (requirement.acceptanceCriteria.length < this.config.minAcceptanceCriteria) {
      errors.push({
        code: 'INSUFFICIENT_AC',
        message: `Requirement has ${requirement.acceptanceCriteria.length} acceptance criteria, minimum is ${this.config.minAcceptanceCriteria}`,
        severity: this.config.strictMode ? 'error' : 'warning',
        suggestion: 'Add acceptance criteria using Given-When-Then format for testability',
      });
    }

    // Check each acceptance criterion for quality
    for (let i = 0; i < requirement.acceptanceCriteria.length; i++) {
      const ac = requirement.acceptanceCriteria[i];

      if (ac.length < 10) {
        errors.push({
          code: 'AC_TOO_SHORT',
          message: `Acceptance criterion ${i + 1} is too short to be meaningful`,
          severity: 'warning',
          suggestion: 'Expand the criterion with specific, testable conditions',
        });
      }

      // Check for Given-When-Then pattern (recommended but not required)
      const hasGWT =
        ac.toLowerCase().includes('given') ||
        ac.toLowerCase().includes('when') ||
        ac.toLowerCase().includes('then');

      if (!hasGWT && this.config.strictMode) {
        errors.push({
          code: 'AC_NOT_GWT',
          message: `Acceptance criterion ${i + 1} does not follow Given-When-Then format`,
          severity: 'info',
          suggestion: 'Consider using Given-When-Then format for better testability',
        });
      }
    }

    return errors;
  }

  private validateDescriptionQuality(requirement: Requirement): ValidationError[] {
    const errors: ValidationError[] = [];
    const description = requirement.description;

    // Check minimum length
    if (description.length < 20) {
      errors.push({
        code: 'DESC_TOO_SHORT',
        message: 'Description is too short to provide sufficient detail',
        severity: 'warning',
        suggestion: 'Expand the description to include context, purpose, and expected behavior',
      });
    }

    // Check for user story format for user-story type
    if (requirement.type === 'user-story') {
      const hasUserStoryFormat =
        description.toLowerCase().includes('as a') ||
        description.toLowerCase().includes('i want') ||
        description.toLowerCase().includes('so that');

      if (!hasUserStoryFormat) {
        errors.push({
          code: 'NOT_USER_STORY_FORMAT',
          message: 'User story does not follow "As a...I want...So that" format',
          severity: 'warning',
          suggestion: 'Use format: "As a [role], I want [feature] so that [benefit]"',
        });
      }
    }

    return errors;
  }

  private validateTitle(requirement: Requirement): ValidationError[] {
    const errors: ValidationError[] = [];
    const title = requirement.title;

    if (title.length < 5) {
      errors.push({
        code: 'TITLE_TOO_SHORT',
        message: 'Title is too short to be descriptive',
        severity: 'warning',
      });
    }

    if (title.length > 100) {
      errors.push({
        code: 'TITLE_TOO_LONG',
        message: 'Title is too long, consider summarizing',
        severity: 'info',
        suggestion: 'Keep title under 100 characters and move details to description',
      });
    }

    // Check for action verb
    const actionVerbs = [
      'add',
      'create',
      'implement',
      'enable',
      'allow',
      'support',
      'provide',
      'display',
      'show',
      'update',
      'delete',
      'remove',
      'fix',
      'improve',
      'optimize',
    ];

    const startsWithVerb = actionVerbs.some((verb) =>
      title.toLowerCase().startsWith(verb)
    );

    if (!startsWithVerb && this.config.strictMode) {
      errors.push({
        code: 'NO_ACTION_VERB',
        message: 'Title should start with an action verb',
        severity: 'info',
        suggestion: 'Start with verbs like: Add, Create, Implement, Enable, Support',
      });
    }

    return errors;
  }

  private checkForbiddenTerms(
    requirement: Requirement,
    forbiddenTerms: string[]
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const textToCheck = `${requirement.title} ${requirement.description} ${requirement.acceptanceCriteria.join(' ')}`;

    for (const term of forbiddenTerms) {
      if (textToCheck.toLowerCase().includes(term.toLowerCase())) {
        errors.push({
          code: 'FORBIDDEN_TERM',
          message: `Forbidden term found: "${term}"`,
          severity: 'error',
          suggestion: `Remove or replace the term "${term}" with a more specific alternative`,
        });
      }
    }

    return errors;
  }

  private checkForTag(requirement: Requirement, tag: string): boolean {
    const textToCheck = `${requirement.title} ${requirement.description} ${requirement.acceptanceCriteria.join(' ')}`;
    return textToCheck.toLowerCase().includes(tag.toLowerCase());
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private generateAmbiguitySuggestions(terms: AmbiguousTerm[]): string[] {
    const suggestions: string[] = [];

    if (terms.length === 0) {
      suggestions.push('Requirement language is clear and specific');
      return suggestions;
    }

    for (const term of terms.slice(0, 3)) {
      // Limit to top 3
      suggestions.push(
        `Replace "${term.term}" with specific criteria like: ${term.alternatives.slice(0, 2).join(' or ')}`
      );
    }

    if (terms.length > 3) {
      suggestions.push(
        `${terms.length - 3} additional ambiguous terms found. Consider reviewing the full ambiguity report.`
      );
    }

    return suggestions;
  }

  private extractDependencies(
    requirement: Requirement,
    allRequirements: Requirement[]
  ): DependencyEdge[] {
    const edges: DependencyEdge[] = [];
    const text = `${requirement.description} ${requirement.acceptanceCriteria.join(' ')}`;
    const lowerText = text.toLowerCase();

    // Look for explicit dependency keywords
    const dependsOnPatterns = [
      /depends on\s+(\w+[-\d]*)/gi,
      /requires\s+(\w+[-\d]*)/gi,
      /after\s+(\w+[-\d]*)/gi,
      /blocked by\s+(\w+[-\d]*)/gi,
    ];

    for (const pattern of dependsOnPatterns) {
      let match;
      while ((match = pattern.exec(lowerText)) !== null) {
        const potentialId = match[1];
        const targetReq = allRequirements.find(
          (r) =>
            r.id.toLowerCase() === potentialId ||
            r.title.toLowerCase().includes(potentialId)
        );

        if (targetReq && targetReq.id !== requirement.id) {
          edges.push({
            from: requirement.id,
            to: targetReq.id,
            type: 'depends-on',
          });
        }
      }
    }

    // Look for "related to" patterns
    const relatedPatterns = [/related to\s+(\w+[-\d]*)/gi, /see also\s+(\w+[-\d]*)/gi];

    for (const pattern of relatedPatterns) {
      let match;
      while ((match = pattern.exec(lowerText)) !== null) {
        const potentialId = match[1];
        const targetReq = allRequirements.find(
          (r) =>
            r.id.toLowerCase() === potentialId ||
            r.title.toLowerCase().includes(potentialId)
        );

        if (targetReq && targetReq.id !== requirement.id) {
          edges.push({
            from: requirement.id,
            to: targetReq.id,
            type: 'related-to',
          });
        }
      }
    }

    return edges;
  }

  private async storeValidationResult(
    requirementId: string,
    errors: ValidationError[]
  ): Promise<void> {
    await this.memory.set(
      `requirements-validation:result:${requirementId}`,
      {
        requirementId,
        errors,
        validatedAt: new Date().toISOString(),
        errorCount: errors.filter((e) => e.severity === 'error').length,
        warningCount: errors.filter((e) => e.severity === 'warning').length,
      },
      { namespace: 'requirements-validation', ttl: 86400 * 7 }
    );
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a RequirementsValidatorService instance with default dependencies
 * Maintains backward compatibility with existing code
 *
 * @param memory - Memory backend for storing validation results
 * @param config - Optional configuration overrides
 * @returns Configured RequirementsValidatorService instance
 */
export function createRequirementsValidatorService(
  memory: MemoryBackend,
  config: Partial<RequirementsValidatorConfig> = {}
): RequirementsValidatorService {
  return new RequirementsValidatorService({ memory }, config);
}

/**
 * Create a RequirementsValidatorService instance with custom dependencies
 * Used for testing or when custom implementations are needed (e.g., LLM router)
 *
 * ADR-051: This factory enables LLM-powered requirements analysis
 *
 * @param dependencies - All service dependencies including optional LLM router
 * @param config - Optional configuration overrides
 * @returns Configured RequirementsValidatorService instance
 *
 * @example
 * ```typescript
 * // Create with LLM support enabled
 * const validator = createRequirementsValidatorServiceWithDependencies(
 *   { memory, llmRouter },
 *   { enableLLMAnalysis: true, llmModelTier: 2 }
 * );
 *
 * // Analyze requirements with LLM
 * const analysis = await validator.analyzeRequirementsWithLLM(requirements);
 * ```
 */
export function createRequirementsValidatorServiceWithDependencies(
  dependencies: RequirementsValidatorDependencies,
  config: Partial<RequirementsValidatorConfig> = {}
): RequirementsValidatorService {
  return new RequirementsValidatorService(dependencies, config);
}
