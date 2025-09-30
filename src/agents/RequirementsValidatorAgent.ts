/**
 * RequirementsValidatorAgent - Validates requirements testability and generates BDD scenarios
 *
 * Core capabilities:
 * - Testability analysis using SMART/INVEST criteria
 * - BDD scenario generation in Gherkin format
 * - Risk assessment with heat mapping
 * - Acceptance criteria validation
 * - Traceability mapping
 * - Edge case identification
 * - Requirement completeness check
 *
 * Memory namespaces:
 * - aqe/requirements/* - Requirement validation data
 * - aqe/bdd-scenarios/* - Generated BDD scenarios
 * - aqe/risk-scores/* - Risk assessment results
 * - aqe/traceability/* - Traceability matrices
 */

import { BaseAgent, BaseAgentConfig } from './BaseAgent';
import { QETask, AgentCapability, QEAgentType, AgentContext, MemoryStore } from '../types';
import { EventEmitter } from 'events';

// ============================================================================
// Type Definitions
// ============================================================================

export interface RequirementsValidatorConfig extends BaseAgentConfig {
  /** Validation thresholds */
  thresholds?: {
    minTestabilityScore: number;
    maxHighRiskRequirements: number;
    minBddCoverage: number;
  };
  /** Validation rules to apply */
  validationRules?: string[];
  /** Output format for reports */
  reportFormat?: 'json' | 'markdown' | 'html';
}

export interface Requirement {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria?: string[];
  priority?: 'low' | 'medium' | 'high' | 'critical';
  type?: 'functional' | 'non-functional' | 'technical' | 'business';
  dependencies?: string[];
  metadata?: Record<string, any>;
}

export interface TestabilityScore {
  overall: number;
  specific: boolean;
  measurable: boolean;
  achievable: boolean;
  relevant: boolean;
  timeBound: boolean;
  issues: string[];
  recommendations: string[];
}

export interface BddScenario {
  feature: string;
  background?: string[];
  scenarios: {
    name: string;
    type: 'scenario' | 'scenario_outline';
    given: string[];
    when: string[];
    then: string[];
    examples?: {
      headers: string[];
      rows: string[][];
    };
  }[];
  metadata: {
    requirementId: string;
    generatedAt: Date;
    scenarioCount: number;
    testCaseProjection: number;
  };
}

export interface RiskAssessment {
  requirementId: string;
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  factors: {
    technicalComplexity: number;
    externalDependencies: number;
    performanceImpact: number;
    securityImplications: number;
    regulatoryCompliance: number;
  };
  mitigation: string[];
  testingPriority: number;
}

export interface TraceabilityMap {
  requirementId: string;
  businessRequirement?: string;
  epic?: string;
  userStory?: string;
  acceptanceCriteria: string[];
  bddScenarios: string[];
  testCases: string[];
  codeModules: string[];
  deployments: string[];
}

export interface ValidationReport {
  requirementId: string;
  testabilityScore: TestabilityScore;
  riskAssessment: RiskAssessment;
  bddScenarios: BddScenario;
  traceability: TraceabilityMap;
  edgeCases: string[];
  completeness: {
    who: boolean;
    what: boolean;
    when: boolean;
    where: boolean;
    why: boolean;
    how: boolean;
    score: number;
  };
  timestamp: Date;
}

// ============================================================================
// RequirementsValidatorAgent Implementation
// ============================================================================

export class RequirementsValidatorAgent extends BaseAgent {
  private readonly config: RequirementsValidatorConfig;
  private validationPatterns: Map<string, RegExp> = new Map();
  private riskRules: Map<string, number> = new Map();

  constructor(config: RequirementsValidatorConfig) {
    super({
      ...config,
      id: config.id || `requirements-validator-${Date.now()}`,
      type: QEAgentType.REQUIREMENTS_VALIDATOR,
      capabilities: [
        {
          name: 'testability-analysis',
          version: '1.0.0',
          description: 'Evaluate requirements against INVEST criteria'
        },
        {
          name: 'bdd-scenario-generation',
          version: '1.0.0',
          description: 'Generate comprehensive Gherkin scenarios'
        },
        {
          name: 'risk-assessment',
          version: '1.0.0',
          description: 'Score requirements based on complexity and impact'
        },
        {
          name: 'acceptance-criteria-validation',
          version: '1.0.0',
          description: 'Validate acceptance criteria using SMART framework'
        },
        {
          name: 'traceability-mapping',
          version: '1.0.0',
          description: 'Create bidirectional traceability matrices'
        },
        {
          name: 'edge-case-identification',
          version: '1.0.0',
          description: 'Identify edge cases using combinatorial testing'
        },
        {
          name: 'completeness-check',
          version: '1.0.0',
          description: 'Validate requirement completeness using 5Ws framework'
        }
      ]
    });

    this.config = {
      ...config,
      thresholds: config.thresholds || {
        minTestabilityScore: 8.0,
        maxHighRiskRequirements: 3,
        minBddCoverage: 100
      },
      validationRules: config.validationRules || [
        'SMART',
        'INVEST',
        'completeness',
        'clarity'
      ],
      reportFormat: config.reportFormat || 'json'
    };
  }

  // ============================================================================
  // BaseAgent Abstract Method Implementations
  // ============================================================================

  protected async initializeComponents(): Promise<void> {
    console.log(`RequirementsValidatorAgent ${this.agentId.id} initializing components`);

    // Initialize validation patterns for detecting ambiguous language
    this.validationPatterns.set('vague', /\b(fast|slow|good|bad|nice|easy|hard|better|worse)\b/gi);
    this.validationPatterns.set('ambiguous', /\b(should|could|might|may|probably|possibly|perhaps)\b/gi);
    this.validationPatterns.set('subjective', /\b(user-friendly|intuitive|simple|complex|efficient)\b/gi);
    this.validationPatterns.set('passive', /\b(is|are|was|were|be|been|being)\s+\w+ed\b/gi);

    // Initialize risk scoring rules
    this.riskRules.set('external-api', 3);
    this.riskRules.set('database-migration', 4);
    this.riskRules.set('third-party-integration', 3);
    this.riskRules.set('authentication', 4);
    this.riskRules.set('payment-processing', 5);
    this.riskRules.set('data-privacy', 5);
    this.riskRules.set('performance-critical', 4);
    this.riskRules.set('real-time', 4);
    this.riskRules.set('distributed-system', 4);

    // Register for events from other agents
    this.registerEventHandler({
      eventType: 'test-generator.ready',
      handler: async (event) => {
        console.log('Test generator is ready, can start generating tests from BDD scenarios');
      }
    });

    this.registerEventHandler({
      eventType: 'requirements.updated',
      handler: async (event) => {
        console.log('Requirements updated, triggering revalidation');
        const requirements = event.data.requirements;
        for (const req of requirements) {
          await this.validateRequirement(req);
        }
      }
    });

    console.log('RequirementsValidatorAgent components initialized successfully');
  }

  protected async loadKnowledge(): Promise<void> {
    console.log('Loading requirements validator knowledge base');

    // Load historical validation patterns
    const historicalPatterns = await this.retrieveMemory('validation-patterns');
    if (historicalPatterns) {
      console.log('Loaded historical validation patterns');
    }

    // Load defect correlation data
    const defectCorrelations = await this.retrieveSharedMemory(
      QEAgentType.QUALITY_ANALYZER,
      'defect-correlations'
    );
    if (defectCorrelations) {
      console.log('Loaded defect correlation data for risk assessment');
    }

    // Load project-specific validation rules
    const projectRules = await this.memoryStore.retrieve('aqe/requirements/validation-rules');
    if (projectRules) {
      console.log('Loaded project-specific validation rules');
      this.config.validationRules = [...this.config.validationRules!, ...projectRules];
    }

    console.log('Requirements validator knowledge loaded successfully');
  }

  protected async cleanup(): Promise<void> {
    console.log(`RequirementsValidatorAgent ${this.agentId.id} cleaning up resources`);

    // Save validation patterns learned during session
    await this.storeMemory('validation-patterns', Array.from(this.validationPatterns.entries()));

    // Save risk scoring rules
    await this.storeMemory('risk-rules', Array.from(this.riskRules.entries()));

    // Clear temporary validation cache
    await this.memoryStore.delete('aqe/requirements/temp-validation', 'aqe');

    console.log('RequirementsValidatorAgent cleanup completed');
  }

  protected async performTask(task: QETask): Promise<any> {
    const taskType = task.type;
    const taskData = task.payload;

    switch (taskType) {
      case 'validate-requirement':
        return await this.validateRequirement(taskData.requirement);

      case 'generate-bdd':
        return await this.generateBddScenarios(taskData.requirement);

      case 'assess-risk':
        return await this.assessRisk(taskData.requirement);

      case 'validate-acceptance-criteria':
        return await this.validateAcceptanceCriteria(taskData.requirement);

      case 'create-traceability':
        return await this.createTraceabilityMap(taskData.requirement);

      case 'batch-validate':
        return await this.batchValidate(taskData.requirements);

      case 'generate-report':
        return await this.generateValidationReport(taskData.requirement);

      case 'identify-edge-cases':
        return await this.identifyEdgeCases(taskData.requirement);

      default:
        throw new Error(`Unsupported task type: ${taskType}`);
    }
  }

  // ============================================================================
  // Core Validation Capabilities
  // ============================================================================

  /**
   * Validate a requirement for testability using SMART/INVEST criteria
   */
  private async validateRequirement(requirement: Requirement): Promise<ValidationReport> {
    console.log(`Validating requirement: ${requirement.id}`);

    // Run all validation checks in parallel
    const [
      testabilityScore,
      riskAssessment,
      bddScenarios,
      traceability,
      edgeCases,
      completeness
    ] = await Promise.all([
      this.calculateTestabilityScore(requirement),
      this.assessRisk(requirement),
      this.generateBddScenarios(requirement),
      this.createTraceabilityMap(requirement),
      this.identifyEdgeCases(requirement),
      this.checkCompleteness(requirement)
    ]);

    const report: ValidationReport = {
      requirementId: requirement.id,
      testabilityScore,
      riskAssessment,
      bddScenarios,
      traceability,
      edgeCases,
      completeness,
      timestamp: new Date()
    };

    // Store validation report in memory
    await this.memoryStore.store(`aqe/requirements/validated/${requirement.id}`, report);

    // Emit validation complete event
    this.emitEvent('requirements.validated', {
      requirementId: requirement.id,
      testabilityScore: testabilityScore.overall,
      riskLevel: riskAssessment.overallRisk,
      bddScenarioCount: bddScenarios.scenarios.length
    }, 'high');

    console.log(`Requirement ${requirement.id} validated. Score: ${testabilityScore.overall}/10`);

    return report;
  }

  /**
   * Calculate testability score using SMART criteria
   */
  private async calculateTestabilityScore(requirement: Requirement): Promise<TestabilityScore> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check Specific: Is the requirement clearly defined?
    const specific = this.checkSpecific(requirement, issues, recommendations);

    // Check Measurable: Are there quantifiable metrics?
    const measurable = this.checkMeasurable(requirement, issues, recommendations);

    // Check Achievable: Is it technically feasible?
    const achievable = this.checkAchievable(requirement, issues, recommendations);

    // Check Relevant: Is it aligned with business goals?
    const relevant = this.checkRelevant(requirement, issues, recommendations);

    // Check Time-bound: Are there performance/deadline expectations?
    const timeBound = this.checkTimeBound(requirement, issues, recommendations);

    // Calculate overall score (0-10 scale)
    const criteriaScores = [specific, measurable, achievable, relevant, timeBound];
    const overall = criteriaScores.reduce((sum, score) => sum + score, 0) / criteriaScores.length;

    return {
      overall: Math.round(overall * 10) / 10,
      specific: specific >= 1.8,
      measurable: measurable >= 1.8,
      achievable: achievable >= 1.8,
      relevant: relevant >= 1.8,
      timeBound: timeBound >= 1.8,
      issues,
      recommendations
    };
  }

  private checkSpecific(req: Requirement, issues: string[], recommendations: string[]): number {
    let score = 2.0;
    const text = `${req.title} ${req.description}`.toLowerCase();

    // Check for vague language
    const vagueMatches = text.match(this.validationPatterns.get('vague')!);
    if (vagueMatches && vagueMatches.length > 0) {
      score -= 0.5;
      issues.push(`Vague terms detected: ${vagueMatches.join(', ')}`);
      recommendations.push('Replace vague terms with specific, measurable criteria');
    }

    // Check for ambiguous modal verbs
    const ambiguousMatches = text.match(this.validationPatterns.get('ambiguous')!);
    if (ambiguousMatches && ambiguousMatches.length > 0) {
      score -= 0.5;
      issues.push(`Ambiguous language: ${ambiguousMatches.join(', ')}`);
      recommendations.push('Use definitive language: "must", "will", "shall" instead of "should", "could", "might"');
    }

    // Check for missing details
    if (req.description.length < 50) {
      score -= 0.5;
      issues.push('Description too brief, lacks sufficient detail');
      recommendations.push('Expand description with specific details about behavior, inputs, and outputs');
    }

    return Math.max(0, score);
  }

  private checkMeasurable(req: Requirement, issues: string[], recommendations: string[]): number {
    let score = 2.0;
    const text = `${req.title} ${req.description}`.toLowerCase();

    // Look for quantifiable metrics
    const hasNumbers = /\d+/.test(text);
    const hasMetrics = /(ms|seconds?|minutes?|hours?|%|percent|users?|requests?|MB|GB|KB)/i.test(text);
    const hasAcceptanceCriteria = req.acceptanceCriteria && req.acceptanceCriteria.length > 0;

    if (!hasNumbers && !hasMetrics) {
      score -= 0.7;
      issues.push('No quantifiable metrics defined');
      recommendations.push('Add specific metrics: response time <200ms, success rate >99%, support 1000 concurrent users');
    }

    if (!hasAcceptanceCriteria) {
      score -= 0.5;
      issues.push('Missing acceptance criteria');
      recommendations.push('Define clear acceptance criteria with measurable success conditions');
    }

    // Check for subjective terms
    const subjectiveMatches = text.match(this.validationPatterns.get('subjective')!);
    if (subjectiveMatches && subjectiveMatches.length > 0) {
      score -= 0.3;
      issues.push(`Subjective terms: ${subjectiveMatches.join(', ')}`);
      recommendations.push('Replace subjective terms with objective, measurable criteria');
    }

    return Math.max(0, score);
  }

  private checkAchievable(req: Requirement, issues: string[], recommendations: string[]): number {
    let score = 2.0;
    const text = `${req.title} ${req.description}`.toLowerCase();

    // Check for technical feasibility indicators
    const hasComplexity = /(complex|difficult|challenging|advanced)/i.test(text);
    const hasConstraints = /(constraint|limitation|restriction)/i.test(text);
    const hasRiskyKeywords = /(distributed|real-time|high-performance|scalable|fault-tolerant)/i.test(text);

    if (hasComplexity && !hasConstraints) {
      score -= 0.3;
      issues.push('High complexity without defined constraints');
      recommendations.push('Document technical constraints and feasibility analysis');
    }

    if (hasRiskyKeywords && !req.dependencies) {
      score -= 0.4;
      issues.push('Complex technical requirements without dependency analysis');
      recommendations.push('Identify technical dependencies and integration points');
    }

    return Math.max(0, score);
  }

  private checkRelevant(req: Requirement, issues: string[], recommendations: string[]): number {
    let score = 2.0;

    // Check if business value or user need is articulated
    const hasBusinessValue = /(value|benefit|improve|increase|reduce|enable|allow)/i.test(req.description);
    const hasUserStory = /(user|customer|client|stakeholder)/i.test(req.description);
    const hasType = req.type !== undefined;

    if (!hasBusinessValue && !hasUserStory) {
      score -= 0.7;
      issues.push('Business value or user need not articulated');
      recommendations.push('Add "As a [user], I want [feature] so that [benefit]" format');
    }

    if (!hasType) {
      score -= 0.3;
      issues.push('Requirement type not specified');
      recommendations.push('Classify as functional, non-functional, technical, or business requirement');
    }

    return Math.max(0, score);
  }

  private checkTimeBound(req: Requirement, issues: string[], recommendations: string[]): number {
    let score = 2.0;
    const text = `${req.title} ${req.description}`.toLowerCase();

    // Check for performance expectations
    const hasPerformance = /(response time|latency|throughput|duration|timeout|deadline)/i.test(text);
    const hasSchedule = /(sprint|release|version|phase|milestone)/i.test(text);

    if (!hasPerformance) {
      score -= 0.5;
      issues.push('No performance or timing expectations defined');
      recommendations.push('Define response time, timeout, or duration requirements');
    }

    if (!hasSchedule && req.priority === 'critical') {
      score -= 0.5;
      issues.push('Critical requirement without delivery timeline');
      recommendations.push('Specify target sprint, release, or milestone');
    }

    return Math.max(0, score);
  }

  /**
   * Generate BDD scenarios in Gherkin format
   */
  private async generateBddScenarios(requirement: Requirement): Promise<BddScenario> {
    console.log(`Generating BDD scenarios for requirement: ${requirement.id}`);

    const feature = this.extractFeatureName(requirement);
    const background = this.generateBackground(requirement);
    const scenarios = await this.generateScenarios(requirement);

    const bddScenario: BddScenario = {
      feature,
      background,
      scenarios,
      metadata: {
        requirementId: requirement.id,
        generatedAt: new Date(),
        scenarioCount: scenarios.length,
        testCaseProjection: scenarios.reduce((sum, s) => {
          if (s.type === 'scenario_outline' && s.examples) {
            return sum + s.examples.rows.length;
          }
          return sum + 1;
        }, 0)
      }
    };

    // Store BDD scenarios in memory
    await this.memoryStore.store(`aqe/bdd-scenarios/generated/${requirement.id}`, bddScenario);

    // Emit event for test generator
    this.emitEvent('bdd-scenarios.generated', {
      requirementId: requirement.id,
      scenarioCount: scenarios.length,
      feature
    }, 'high');

    return bddScenario;
  }

  private extractFeatureName(req: Requirement): string {
    // Extract feature name from title, cleaning up formatting
    return req.title
      .replace(/^(US|REQ|STORY|FEATURE)[-_\s]?\d+:?\s*/i, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim();
  }

  private generateBackground(req: Requirement): string[] | undefined {
    // Generate common preconditions
    const background: string[] = [];

    if (/(authentication|login|user)/i.test(req.description)) {
      background.push('Given the authentication service is available');
      background.push('And the user database is accessible');
    }

    if (/(api|endpoint|service)/i.test(req.description)) {
      background.push('Given the API service is running');
      background.push('And all dependencies are available');
    }

    return background.length > 0 ? background : undefined;
  }

  private async generateScenarios(req: Requirement): Promise<BddScenario['scenarios']> {
    const scenarios: BddScenario['scenarios'] = [];

    // Generate happy path scenario
    scenarios.push(this.generateHappyPathScenario(req));

    // Generate error scenarios
    scenarios.push(...this.generateErrorScenarios(req));

    // Generate edge case scenarios
    scenarios.push(...this.generateEdgeCaseScenarios(req));

    // Generate scenario outlines for data-driven tests
    const outlines = this.generateScenarioOutlines(req);
    if (outlines.length > 0) {
      scenarios.push(...outlines);
    }

    return scenarios;
  }

  private generateHappyPathScenario(req: Requirement): BddScenario['scenarios'][0] {
    return {
      name: `Successful ${this.extractActionVerb(req)}`,
      type: 'scenario',
      given: this.extractPreconditions(req),
      when: this.extractActions(req),
      then: this.extractExpectedOutcomes(req)
    };
  }

  private generateErrorScenarios(req: Requirement): BddScenario['scenarios'] {
    const scenarios: BddScenario['scenarios'] = [];

    // Generate common error scenarios
    if (/(input|data|parameter)/i.test(req.description)) {
      scenarios.push({
        name: 'Failed with invalid input',
        type: 'scenario',
        given: ['a request with invalid input data'],
        when: ['the request is submitted'],
        then: [
          'the system returns an error response',
          'the error message indicates invalid input',
          'no data is persisted'
        ]
      });
    }

    if (/(authentication|authorization|permission)/i.test(req.description)) {
      scenarios.push({
        name: 'Failed with unauthorized access',
        type: 'scenario',
        given: ['a user without proper permissions'],
        when: ['the user attempts to access the resource'],
        then: [
          'the system returns 403 Forbidden',
          'access is denied',
          'the attempt is logged'
        ]
      });
    }

    return scenarios;
  }

  private generateEdgeCaseScenarios(req: Requirement): BddScenario['scenarios'] {
    const scenarios: BddScenario['scenarios'] = [];

    // Boundary value scenarios
    if (/(limit|maximum|minimum|size|length)/i.test(req.description)) {
      scenarios.push({
        name: 'Handle boundary values',
        type: 'scenario',
        given: ['input at minimum boundary', 'input at maximum boundary'],
        when: ['the operation is performed'],
        then: ['the system handles boundary values correctly', 'no errors occur']
      });
    }

    // Concurrent operation scenarios
    if (/(concurrent|parallel|simultaneous|race)/i.test(req.description)) {
      scenarios.push({
        name: 'Handle concurrent operations',
        type: 'scenario',
        given: ['multiple concurrent requests'],
        when: ['operations are executed simultaneously'],
        then: [
          'all operations complete successfully',
          'data consistency is maintained',
          'no race conditions occur'
        ]
      });
    }

    return scenarios;
  }

  private generateScenarioOutlines(req: Requirement): BddScenario['scenarios'] {
    const scenarios: BddScenario['scenarios'] = [];

    // Generate scenario outlines for validation tests
    if (/(validation|validate|verify|check)/i.test(req.description)) {
      scenarios.push({
        name: 'Validation with various inputs',
        type: 'scenario_outline',
        given: ['a request with <input> data'],
        when: ['the validation is performed'],
        then: ['the system returns <result>', 'the error message is <message>'],
        examples: {
          headers: ['input', 'result', 'message'],
          rows: [
            ['valid data', 'success', 'none'],
            ['empty string', 'error', 'Input cannot be empty'],
            ['null value', 'error', 'Input is required'],
            ['invalid format', 'error', 'Invalid format']
          ]
        }
      });
    }

    return scenarios;
  }

  private extractActionVerb(req: Requirement): string {
    const verbs = ['create', 'update', 'delete', 'retrieve', 'process', 'validate', 'execute', 'submit'];
    const text = req.title.toLowerCase();

    for (const verb of verbs) {
      if (text.includes(verb)) {
        return verb;
      }
    }

    return 'operation';
  }

  private extractPreconditions(req: Requirement): string[] {
    const preconditions: string[] = [];

    if (/(user|account|profile)/i.test(req.description)) {
      preconditions.push('a registered user with valid credentials');
    }

    if (/(data|record|entity)/i.test(req.description)) {
      preconditions.push('the required data exists in the system');
    }

    if (preconditions.length === 0) {
      preconditions.push('the system is in a valid state');
    }

    return preconditions;
  }

  private extractActions(req: Requirement): string[] {
    const actions: string[] = [];
    const verb = this.extractActionVerb(req);

    actions.push(`the user initiates ${verb} operation`);

    if (/(submit|send|post)/i.test(req.description)) {
      actions.push('the request is submitted with valid data');
    }

    return actions;
  }

  private extractExpectedOutcomes(req: Requirement): string[] {
    const outcomes: string[] = [];

    if (/(success|complete|finish)/i.test(req.description)) {
      outcomes.push('the operation completes successfully');
    }

    if (/(return|response|result)/i.test(req.description)) {
      outcomes.push('the system returns a success response');
    }

    if (/(save|persist|store)/i.test(req.description)) {
      outcomes.push('the data is persisted correctly');
    }

    if (/(log|audit|track)/i.test(req.description)) {
      outcomes.push('the operation is logged for audit purposes');
    }

    if (outcomes.length === 0) {
      outcomes.push('the expected result is achieved');
    }

    return outcomes;
  }

  /**
   * Assess risk level of a requirement
   */
  private async assessRisk(requirement: Requirement): Promise<RiskAssessment> {
    console.log(`Assessing risk for requirement: ${requirement.id}`);

    const text = `${requirement.title} ${requirement.description}`.toLowerCase();

    // Calculate individual risk factors (0-10 scale)
    const technicalComplexity = this.assessTechnicalComplexity(text);
    const externalDependencies = this.assessExternalDependencies(text);
    const performanceImpact = this.assessPerformanceImpact(text);
    const securityImplications = this.assessSecurityImplications(text);
    const regulatoryCompliance = this.assessRegulatoryCompliance(text);

    // Calculate weighted risk score
    const riskScore = Math.round(
      (technicalComplexity * 0.25 +
       externalDependencies * 0.20 +
       performanceImpact * 0.20 +
       securityImplications * 0.25 +
       regulatoryCompliance * 0.10) * 10
    ) / 10;

    // Determine overall risk level
    let overallRisk: RiskAssessment['overallRisk'];
    if (riskScore >= 8) overallRisk = 'critical';
    else if (riskScore >= 6) overallRisk = 'high';
    else if (riskScore >= 4) overallRisk = 'medium';
    else overallRisk = 'low';

    // Generate mitigation strategies
    const mitigation = this.generateMitigationStrategies(
      technicalComplexity,
      externalDependencies,
      performanceImpact,
      securityImplications,
      regulatoryCompliance
    );

    // Calculate testing priority (1-10, higher = more testing needed)
    const testingPriority = Math.min(10, Math.round(riskScore * 1.2));

    const assessment: RiskAssessment = {
      requirementId: requirement.id,
      overallRisk,
      riskScore,
      factors: {
        technicalComplexity,
        externalDependencies,
        performanceImpact,
        securityImplications,
        regulatoryCompliance
      },
      mitigation,
      testingPriority
    };

    // Store risk assessment in memory
    await this.memoryStore.store(`aqe/risk-scores/requirements/${requirement.id}`, assessment);

    console.log(`Risk assessment complete. Level: ${overallRisk}, Score: ${riskScore}`);

    return assessment;
  }

  private assessTechnicalComplexity(text: string): number {
    let score = 2;

    // Check for complex technical patterns
    if (/(distributed|microservice|event-driven|async|concurrent)/i.test(text)) score += 2;
    if (/(algorithm|optimization|performance-critical|real-time)/i.test(text)) score += 2;
    if (/(machine learning|ai|neural|data science)/i.test(text)) score += 3;
    if (/(blockchain|cryptography|encryption|hashing)/i.test(text)) score += 2;

    return Math.min(10, score);
  }

  private assessExternalDependencies(text: string): number {
    let score = 1;

    // Check for external dependencies
    if (/(third-party|external api|integration|webhook)/i.test(text)) score += 3;
    if (/(payment|gateway|stripe|paypal)/i.test(text)) score += 3;
    if (/(aws|azure|gcp|cloud service)/i.test(text)) score += 2;
    if (/(database|redis|mongodb|postgresql)/i.test(text)) score += 1;

    return Math.min(10, score);
  }

  private assessPerformanceImpact(text: string): number {
    let score = 2;

    // Check for performance implications
    if (/(scale|scalability|high-volume|throughput)/i.test(text)) score += 3;
    if (/(latency|response time|performance|speed)/i.test(text)) score += 2;
    if (/(cache|caching|optimization|indexing)/i.test(text)) score += 1;
    if (/(batch|bulk|mass|large-scale)/i.test(text)) score += 2;

    return Math.min(10, score);
  }

  private assessSecurityImplications(text: string): number {
    let score = 1;

    // Check for security concerns
    if (/(authentication|authorization|security|access control)/i.test(text)) score += 4;
    if (/(password|credential|secret|token|key)/i.test(text)) score += 3;
    if (/(encryption|decrypt|cipher|ssl|tls|https)/i.test(text)) score += 3;
    if (/(pii|personal data|sensitive|confidential)/i.test(text)) score += 4;
    if (/(injection|xss|csrf|vulnerability)/i.test(text)) score += 5;

    return Math.min(10, score);
  }

  private assessRegulatoryCompliance(text: string): number {
    let score = 0;

    // Check for compliance requirements
    if (/(gdpr|privacy|data protection|right to erasure)/i.test(text)) score += 5;
    if (/(hipaa|healthcare|medical|patient)/i.test(text)) score += 5;
    if (/(pci|payment card|financial|banking)/i.test(text)) score += 5;
    if (/(sox|sarbanes|audit|compliance)/i.test(text)) score += 4;

    return Math.min(10, score);
  }

  private generateMitigationStrategies(
    technical: number,
    external: number,
    performance: number,
    security: number,
    compliance: number
  ): string[] {
    const strategies: string[] = [];

    if (technical >= 6) {
      strategies.push('Conduct architectural review and proof-of-concept');
      strategies.push('Implement comprehensive unit and integration tests');
    }

    if (external >= 5) {
      strategies.push('Create mock services for testing');
      strategies.push('Implement circuit breakers and fallback mechanisms');
      strategies.push('Add retry logic with exponential backoff');
    }

    if (performance >= 6) {
      strategies.push('Perform load testing and stress testing');
      strategies.push('Implement caching strategies');
      strategies.push('Add performance monitoring and alerting');
    }

    if (security >= 6) {
      strategies.push('Conduct security audit and penetration testing');
      strategies.push('Implement input validation and sanitization');
      strategies.push('Add authentication and authorization tests');
      strategies.push('Use security scanning tools (OWASP, Snyk)');
    }

    if (compliance >= 4) {
      strategies.push('Document compliance requirements and controls');
      strategies.push('Implement audit logging and data retention policies');
      strategies.push('Create compliance test scenarios');
    }

    if (strategies.length === 0) {
      strategies.push('Standard testing and code review practices');
    }

    return strategies;
  }

  /**
   * Validate acceptance criteria using SMART framework
   */
  private async validateAcceptanceCriteria(requirement: Requirement): Promise<{
    valid: boolean;
    score: number;
    issues: string[];
    enhanced: string[];
  }> {
    const issues: string[] = [];
    const enhanced: string[] = [];

    if (!requirement.acceptanceCriteria || requirement.acceptanceCriteria.length === 0) {
      issues.push('No acceptance criteria defined');
      enhanced.push('Define at least 3-5 acceptance criteria');
      return { valid: false, score: 0, issues, enhanced };
    }

    let validCount = 0;

    for (const criterion of requirement.acceptanceCriteria) {
      const isValid = this.isAcceptanceCriteriaValid(criterion);
      if (isValid.valid) {
        validCount++;
        enhanced.push(criterion);
      } else {
        issues.push(...isValid.issues);
        enhanced.push(isValid.enhanced);
      }
    }

    const score = (validCount / requirement.acceptanceCriteria.length) * 10;

    return {
      valid: score >= 7.0,
      score: Math.round(score * 10) / 10,
      issues,
      enhanced
    };
  }

  private isAcceptanceCriteriaValid(criterion: string): {
    valid: boolean;
    issues: string[];
    enhanced: string;
  } {
    const issues: string[] = [];
    let enhanced = criterion;

    // Check for measurability
    if (!/\d+/.test(criterion) && !/(complete|success|fail|error|valid|invalid)/i.test(criterion)) {
      issues.push('Criterion lacks measurable metric');
      enhanced = `${criterion} (Add specific metric or success condition)`;
    }

    // Check for clarity
    if (/(should|could|might|may)/i.test(criterion)) {
      issues.push('Criterion uses ambiguous language');
      enhanced = enhanced.replace(/should|could|might|may/gi, 'must');
    }

    // Check for testability
    if (criterion.length < 15) {
      issues.push('Criterion too brief, may lack sufficient detail');
    }

    return {
      valid: issues.length === 0,
      issues,
      enhanced
    };
  }

  /**
   * Create bidirectional traceability map
   */
  private async createTraceabilityMap(requirement: Requirement): Promise<TraceabilityMap> {
    const map: TraceabilityMap = {
      requirementId: requirement.id,
      businessRequirement: this.extractBusinessRequirement(requirement),
      epic: this.extractEpic(requirement),
      userStory: this.extractUserStory(requirement),
      acceptanceCriteria: requirement.acceptanceCriteria || [],
      bddScenarios: [],
      testCases: [],
      codeModules: [],
      deployments: []
    };

    // Link to BDD scenarios
    const bddScenarios = await this.memoryStore.retrieve(`aqe/bdd-scenarios/generated/${requirement.id}`);
    if (bddScenarios) {
      map.bddScenarios = bddScenarios.scenarios.map((s: any) => s.name);
    }

    // Store traceability map
    await this.memoryStore.store(`aqe/traceability/matrix/${requirement.id}`, map);

    return map;
  }

  private extractBusinessRequirement(req: Requirement): string | undefined {
    // Extract from metadata or parse from ID
    if (req.metadata?.businessRequirement) {
      return req.metadata.businessRequirement;
    }

    const match = req.id.match(/^(BR|BIZ)-(\d+)/i);
    return match ? match[0] : undefined;
  }

  private extractEpic(req: Requirement): string | undefined {
    if (req.metadata?.epic) {
      return req.metadata.epic;
    }

    const match = req.id.match(/^(EPIC|EP)-(\d+)/i);
    return match ? match[0] : undefined;
  }

  private extractUserStory(req: Requirement): string | undefined {
    if (req.metadata?.userStory) {
      return req.metadata.userStory;
    }

    const match = req.id.match(/^(US|STORY)-(\d+)/i);
    return match ? match[0] : undefined;
  }

  /**
   * Identify edge cases using combinatorial testing
   */
  private async identifyEdgeCases(requirement: Requirement): Promise<string[]> {
    const edgeCases: string[] = [];

    // Boundary value edge cases
    if (/(limit|size|length|count|number)/i.test(requirement.description)) {
      edgeCases.push('Minimum boundary value (0 or 1)');
      edgeCases.push('Maximum boundary value (at limit)');
      edgeCases.push('Just below maximum boundary');
      edgeCases.push('Just above minimum boundary');
    }

    // Null/empty edge cases
    if (/(input|data|parameter|field)/i.test(requirement.description)) {
      edgeCases.push('Null or undefined input');
      edgeCases.push('Empty string or collection');
      edgeCases.push('Whitespace-only input');
    }

    // Special character edge cases
    if (/(text|string|name|email)/i.test(requirement.description)) {
      edgeCases.push('Special characters (!@#$%)');
      edgeCases.push('Unicode and non-ASCII characters');
      edgeCases.push('SQL injection patterns');
      edgeCases.push('XSS attack patterns');
    }

    // Concurrent operation edge cases
    if (/(concurrent|parallel|simultaneous)/i.test(requirement.description)) {
      edgeCases.push('Race condition with simultaneous updates');
      edgeCases.push('Deadlock scenario');
      edgeCases.push('Resource contention');
    }

    // Network/error edge cases
    if (/(api|service|network|external)/i.test(requirement.description)) {
      edgeCases.push('Network timeout');
      edgeCases.push('Service unavailable (503)');
      edgeCases.push('Partial response');
      edgeCases.push('Malformed response');
    }

    return edgeCases;
  }

  /**
   * Check requirement completeness using 5Ws framework
   */
  private async checkCompleteness(requirement: Requirement): Promise<ValidationReport['completeness']> {
    const text = `${requirement.title} ${requirement.description}`.toLowerCase();

    const who = /(user|customer|admin|system|service|actor|role)/i.test(text);
    const what = /(create|update|delete|retrieve|process|validate|execute|perform)/i.test(text);
    const when = /(trigger|event|schedule|condition|after|before|during)/i.test(text) ||
                 requirement.acceptanceCriteria !== undefined;
    const where = /(environment|context|location|system|service|module)/i.test(text);
    const why = /(benefit|value|goal|purpose|enable|improve|reduce)/i.test(text);
    const how = /(via|through|using|by|with|mechanism|method)/i.test(text) ||
                requirement.acceptanceCriteria !== undefined;

    const completenessFactors = [who, what, when, where, why, how];
    const score = (completenessFactors.filter(f => f).length / completenessFactors.length) * 10;

    return {
      who,
      what,
      when,
      where,
      why,
      how,
      score: Math.round(score * 10) / 10
    };
  }

  /**
   * Batch validate multiple requirements
   */
  private async batchValidate(requirements: Requirement[]): Promise<{
    validated: number;
    passed: number;
    failed: number;
    reports: ValidationReport[];
    summary: {
      averageTestabilityScore: number;
      highRiskCount: number;
      totalBddScenarios: number;
    };
  }> {
    console.log(`Batch validating ${requirements.length} requirements`);

    const reports = await Promise.all(
      requirements.map(req => this.validateRequirement(req))
    );

    const passed = reports.filter(r => r.testabilityScore.overall >= this.config.thresholds!.minTestabilityScore).length;
    const failed = reports.length - passed;

    const averageTestabilityScore = reports.reduce((sum, r) => sum + r.testabilityScore.overall, 0) / reports.length;
    const highRiskCount = reports.filter(r => r.riskAssessment.overallRisk === 'high' || r.riskAssessment.overallRisk === 'critical').length;
    const totalBddScenarios = reports.reduce((sum, r) => sum + r.bddScenarios.scenarios.length, 0);

    return {
      validated: requirements.length,
      passed,
      failed,
      reports,
      summary: {
        averageTestabilityScore: Math.round(averageTestabilityScore * 10) / 10,
        highRiskCount,
        totalBddScenarios
      }
    };
  }

  /**
   * Generate comprehensive validation report
   */
  private async generateValidationReport(requirement: Requirement): Promise<string> {
    const report = await this.validateRequirement(requirement);
    const format = this.config.reportFormat || 'json';

    if (format === 'json') {
      return JSON.stringify(report, null, 2);
    }

    if (format === 'markdown') {
      return this.formatReportAsMarkdown(report);
    }

    if (format === 'html') {
      return this.formatReportAsHtml(report);
    }

    return JSON.stringify(report, null, 2);
  }

  private formatReportAsMarkdown(report: ValidationReport): string {
    return `# Requirement Validation Report

## Requirement: ${report.requirementId}

### Testability Score: ${report.testabilityScore.overall}/10

- ✅ Specific: ${report.testabilityScore.specific ? 'Yes' : 'No'}
- ✅ Measurable: ${report.testabilityScore.measurable ? 'Yes' : 'No'}
- ✅ Achievable: ${report.testabilityScore.achievable ? 'Yes' : 'No'}
- ✅ Relevant: ${report.testabilityScore.relevant ? 'Yes' : 'No'}
- ✅ Time-bound: ${report.testabilityScore.timeBound ? 'Yes' : 'No'}

### Issues Found
${report.testabilityScore.issues.map(i => `- ⚠️ ${i}`).join('\n')}

### Recommendations
${report.testabilityScore.recommendations.map(r => `- 💡 ${r}`).join('\n')}

### Risk Assessment: ${report.riskAssessment.overallRisk.toUpperCase()}

Risk Score: ${report.riskAssessment.riskScore}/10

**Risk Factors:**
- Technical Complexity: ${report.riskAssessment.factors.technicalComplexity}/10
- External Dependencies: ${report.riskAssessment.factors.externalDependencies}/10
- Performance Impact: ${report.riskAssessment.factors.performanceImpact}/10
- Security Implications: ${report.riskAssessment.factors.securityImplications}/10
- Regulatory Compliance: ${report.riskAssessment.factors.regulatoryCompliance}/10

### BDD Scenarios Generated: ${report.bddScenarios.scenarios.length}

### Edge Cases Identified: ${report.edgeCases.length}

${report.edgeCases.map(ec => `- ${ec}`).join('\n')}

---
*Generated: ${report.timestamp.toISOString()}*
`;
  }

  private formatReportAsHtml(report: ValidationReport): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>Requirement Validation Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    .score { font-size: 24px; font-weight: bold; color: ${report.testabilityScore.overall >= 8 ? 'green' : 'orange'}; }
    .risk-${report.riskAssessment.overallRisk} { color: ${report.riskAssessment.overallRisk === 'low' ? 'green' : report.riskAssessment.overallRisk === 'critical' ? 'red' : 'orange'}; }
    ul { line-height: 1.8; }
  </style>
</head>
<body>
  <h1>Requirement Validation Report</h1>
  <h2>Requirement: ${report.requirementId}</h2>

  <h3>Testability Score: <span class="score">${report.testabilityScore.overall}/10</span></h3>

  <h3>Risk Level: <span class="risk-${report.riskAssessment.overallRisk}">${report.riskAssessment.overallRisk.toUpperCase()}</span></h3>

  <h3>BDD Scenarios Generated: ${report.bddScenarios.scenarios.length}</h3>

  <p><em>Generated: ${report.timestamp.toISOString()}</em></p>
</body>
</html>`;
  }
}