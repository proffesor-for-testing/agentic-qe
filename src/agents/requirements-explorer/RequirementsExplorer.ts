/**
 * Requirements Explorer Agent
 * Analyzes requirements for testability, ambiguity, and risk using RST heuristics
 */

import { QEAgent, AgentContext, AgentExecutionResult } from '../base/QEAgent';
import { QEAgentConfig } from '../../types';
import { QEMemory } from '../../memory/QEMemory';
import { HookManager } from '../../hooks';
import { Logger } from '../../utils/Logger';

/**
 * SFDIPOT heuristic categories
 */
export interface SFDIPOTAnalysis {
  structure: string[]; // How is it built?
  function: string[]; // What does it do?
  data: string[]; // What does it process?
  interfaces: string[]; // How does it connect?
  platform: string[]; // Where does it run?
  operations: string[]; // How is it used?
  time: string[]; // When does it act?
}

/**
 * FEW HICCUPPS heuristic analysis
 */
export interface FEWHICCUPPSAnalysis {
  familiar: string[]; // What's similar to past problems?
  explainable: string[]; // Can we understand it?
  world: string[]; // How does it fit the real world?
  history: string[]; // What happened before?
  image: string[]; // How does it appear?
  comparable: string[]; // How does it compare?
  claims: string[]; // What promises are made?
  usersDesires: string[]; // What do users want?
  product: string[]; // What is it supposed to be?
  purpose: string[]; // Why does it exist?
  statutes: string[]; // What regulations apply?
}

/**
 * Requirement analysis result
 */
export interface RequirementAnalysis {
  id: string;
  requirementText: string;
  timestamp: Date;
  ambiguityScore: number; // 0-1 scale, higher = more ambiguous
  testabilityScore: number; // 0-1 scale, higher = more testable
  riskScore: number; // 0-1 scale, higher = more risky
  sfdipot: SFDIPOTAnalysis;
  fewHiccupps: FEWHICCUPPSAnalysis;
  ambiguities: AmbiguityIssue[];
  testabilityIssues: TestabilityIssue[];
  risks: RequirementRisk[];
  suggestions: ImprovementSuggestion[];
  confidence: number; // 0-1 scale
}

/**
 * Ambiguity issue identification
 */
export interface AmbiguityIssue {
  id: string;
  type: 'vague_language' | 'missing_criteria' | 'unclear_scope' | 'multiple_interpretations' | 'undefined_terms';
  severity: 'low' | 'medium' | 'high' | 'critical';
  text: string;
  location: string; // where in the requirement
  description: string;
  suggestedClarification: string;
  examples: string[];
}

/**
 * Testability issue identification
 */
export interface TestabilityIssue {
  id: string;
  type: 'no_acceptance_criteria' | 'unmeasurable_outcome' | 'missing_preconditions' | 'undefined_behavior' | 'no_error_handling';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  suggestedFix: string;
  testingChallenges: string[];
}

/**
 * Requirement risk identification
 */
export interface RequirementRisk {
  id: string;
  type: 'technical' | 'business' | 'regulatory' | 'integration' | 'performance' | 'security' | 'usability';
  severity: 'low' | 'medium' | 'high' | 'critical';
  probability: number; // 0-1 scale
  impact: number; // 0-1 scale
  description: string;
  indicators: string[];
  mitigationStrategies: string[];
  testingImplications: string[];
}

/**
 * Improvement suggestion
 */
export interface ImprovementSuggestion {
  id: string;
  category: 'clarity' | 'testability' | 'completeness' | 'feasibility' | 'consistency';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  before: string;
  after: string;
  reasoning: string;
  benefits: string[];
}

/**
 * Testing charter for exploration
 */
export interface TestingCharter {
  id: string;
  riskArea: string;
  mission: string;
  timeBox: number; // minutes
  approach: string;
  targets: string[];
  risks: string[];
  resources: string[];
  deliverables: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Risk heatmap entry
 */
export interface RiskHeatmapEntry {
  requirementId: string;
  requirementText: string;
  riskScore: number;
  ambiguityScore: number;
  testabilityScore: number;
  priority: number; // calculated priority
  riskTypes: string[];
  recommendedActions: string[];
}

/**
 * Project context for analysis
 */
export interface ProjectContext {
  domain: string;
  teamExperience: 'junior' | 'mid' | 'senior' | 'expert';
  timeline: 'tight' | 'moderate' | 'flexible';
  budget: 'limited' | 'moderate' | 'flexible';
  riskTolerance: 'low' | 'medium' | 'high';
  complianceRequirements: string[];
  technicalConstraints: string[];
  stakeholders: string[];
}

/**
 * Requirements Explorer Agent
 * Applies RST heuristics to analyze requirements for quality engineering
 */
export class RequirementsExplorer extends QEAgent {
  private analyses: Map<string, RequirementAnalysis> = new Map();
  private charters: Map<string, TestingCharter> = new Map();
  private contextKnowledge: Map<string, any> = new Map();

  constructor(
    config: QEAgentConfig,
    memory: QEMemory,
    hooks: HookManager,
    logger?: Logger
  ) {
    super(config, memory, hooks, logger);
  }

  protected async doExecute(context: AgentContext): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const artifacts: string[] = [];
    const metrics: Record<string, number> = {};

    try {
      this.logger.info('Starting requirements exploration', { context });

      // Store execution context in memory
      await this.storeMemory('execution_context', context, ['requirements', 'exploration']);

      // Analyze a sample requirement
      const sampleRequirement = "As a user, I want to login quickly so that I can access my account";
      const projectContext: ProjectContext = {
        domain: 'web_application',
        teamExperience: 'mid',
        timeline: 'moderate',
        budget: 'moderate',
        riskTolerance: 'medium',
        complianceRequirements: [],
        technicalConstraints: [],
        stakeholders: ['users', 'product_team', 'development_team']
      };

      const analysis = await this.analyzeRequirement(sampleRequirement, projectContext);
      artifacts.push(`analysis:${analysis.id}`);
      metrics.requirements_analyzed = 1;
      metrics.ambiguity_score = analysis.ambiguityScore;
      metrics.testability_score = analysis.testabilityScore;
      metrics.risk_score = analysis.riskScore;

      return {
        success: true,
        status: 'passed',
        message: `Requirements analysis completed. Ambiguity: ${(analysis.ambiguityScore * 100).toFixed(1)}%, Testability: ${(analysis.testabilityScore * 100).toFixed(1)}%`,
        artifacts,
        metrics,
        duration: Date.now() - startTime,
        metadata: {
          analysisId: analysis.id,
          ambiguityScore: analysis.ambiguityScore,
          testabilityScore: analysis.testabilityScore,
          riskScore: analysis.riskScore
        }
      };

    } catch (error) {
      this.logger.error('Failed to execute requirements exploration', { error });

      return {
        success: false,
        status: 'failed',
        error: error instanceof Error ? error : new Error(String(error)),
        artifacts,
        metrics,
        duration: Date.now() - startTime,
        metadata: { error: true }
      };
    }
  }

  /**
   * Analyze a requirement using RST heuristics
   */
  public async analyzeRequirement(
    requirementText: string,
    context: ProjectContext
  ): Promise<RequirementAnalysis> {
    const analysisId = `analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.logger.info('Starting requirement analysis', {
      analysisId,
      requirementLength: requirementText.length,
      domain: context.domain
    });

    // Apply SFDIPOT heuristic
    const sfdipot = this.applySFDIPOT(requirementText, context);

    // Apply FEW HICCUPPS heuristic
    const fewHiccupps = this.applyFEWHICCUPPS(requirementText, context);

    // Identify ambiguities
    const ambiguities = this.identifyAmbiguities(requirementText, context);

    // Assess testability
    const testabilityIssues = this.assessTestability(requirementText, context);

    // Identify risks
    const risks = this.identifyRisks(requirementText, context, sfdipot, fewHiccupps);

    // Generate improvement suggestions
    const suggestions = this.generateImprovementSuggestions(
      requirementText,
      ambiguities,
      testabilityIssues,
      risks,
      context
    );

    // Calculate scores
    const ambiguityScore = this.calculateAmbiguityScore(ambiguities);
    const testabilityScore = this.calculateTestabilityScore(testabilityIssues);
    const riskScore = this.calculateRiskScore(risks);
    const confidence = this.calculateConfidence(requirementText, context);

    const analysis: RequirementAnalysis = {
      id: analysisId,
      requirementText,
      timestamp: new Date(),
      ambiguityScore,
      testabilityScore,
      riskScore,
      sfdipot,
      fewHiccupps,
      ambiguities,
      testabilityIssues,
      risks,
      suggestions,
      confidence
    };

    this.analyses.set(analysisId, analysis);

    // Store analysis in memory
    await this.storeMemory(`analysis:${analysisId}`, analysis, ['requirements', 'analysis']);

    this.logger.info('Requirement analysis completed', {
      analysisId,
      ambiguityScore,
      testabilityScore,
      riskScore,
      issuesFound: ambiguities.length + testabilityIssues.length + risks.length
    });

    return analysis;
  }

  /**
   * Generate exploratory testing charters
   */
  public async generateTestCharter(
    riskArea: string,
    timeBox: number = 60
  ): Promise<TestingCharter> {
    const charterId = `charter-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const charter = this.createTestingCharter(charterId, riskArea, timeBox);

    this.charters.set(charterId, charter);

    // Store charter in memory
    await this.storeMemory(`charter:${charterId}`, charter, ['requirements', 'charter']);

    this.logger.info('Testing charter generated', {
      charterId,
      riskArea,
      timeBox,
      priority: charter.priority
    });

    return charter;
  }

  /**
   * Create risk heatmap for multiple requirements
   */
  public async createRiskHeatmap(
    requirements: { id: string; text: string }[]
  ): Promise<RiskHeatmapEntry[]> {
    const heatmapEntries: RiskHeatmapEntry[] = [];

    const defaultContext: ProjectContext = {
      domain: 'general',
      teamExperience: 'mid',
      timeline: 'moderate',
      budget: 'moderate',
      riskTolerance: 'medium',
      complianceRequirements: [],
      technicalConstraints: [],
      stakeholders: []
    };

    for (const requirement of requirements) {
      const analysis = await this.analyzeRequirement(requirement.text, defaultContext);

      const entry: RiskHeatmapEntry = {
        requirementId: requirement.id,
        requirementText: requirement.text,
        riskScore: analysis.riskScore,
        ambiguityScore: analysis.ambiguityScore,
        testabilityScore: analysis.testabilityScore,
        priority: this.calculatePriority(analysis),
        riskTypes: analysis.risks.map(r => r.type),
        recommendedActions: this.generateHeatmapActions(analysis)
      };

      heatmapEntries.push(entry);
    }

    // Sort by priority (highest first)
    heatmapEntries.sort((a, b) => b.priority - a.priority);

    // Store heatmap
    await this.storeMemory('risk_heatmap', heatmapEntries, ['requirements', 'heatmap']);

    this.logger.info('Risk heatmap created', {
      requirementCount: requirements.length,
      highRiskCount: heatmapEntries.filter(e => e.riskScore > 0.7).length,
      criticalCount: heatmapEntries.filter(e => e.priority > 0.8).length
    });

    return heatmapEntries;
  }

  /**
   * Apply SFDIPOT heuristic
   */
  private applySFDIPOT(requirementText: string, context: ProjectContext): SFDIPOTAnalysis {
    const text = requirementText.toLowerCase();

    return {
      structure: this.extractStructuralElements(text, context),
      function: this.extractFunctionalElements(text, context),
      data: this.extractDataElements(text, context),
      interfaces: this.extractInterfaceElements(text, context),
      platform: this.extractPlatformElements(text, context),
      operations: this.extractOperationalElements(text, context),
      time: this.extractTimeElements(text, context)
    };
  }

  /**
   * Apply FEW HICCUPPS heuristic
   */
  private applyFEWHICCUPPS(requirementText: string, context: ProjectContext): FEWHICCUPPSAnalysis {
    return {
      familiar: this.analyzeFamiliarity(requirementText, context),
      explainable: this.analyzeExplainability(requirementText, context),
      world: this.analyzeWorldFit(requirementText, context),
      history: this.analyzeHistory(requirementText, context),
      image: this.analyzeImage(requirementText, context),
      comparable: this.analyzeComparability(requirementText, context),
      claims: this.analyzeClaims(requirementText, context),
      usersDesires: this.analyzeUserDesires(requirementText, context),
      product: this.analyzeProduct(requirementText, context),
      purpose: this.analyzePurpose(requirementText, context),
      statutes: this.analyzeStatutes(requirementText, context)
    };
  }

  /**
   * Identify ambiguities in requirement text
   */
  private identifyAmbiguities(requirementText: string, context: ProjectContext): AmbiguityIssue[] {
    const ambiguities: AmbiguityIssue[] = [];

    // Check for vague language
    const vagueTerms = ['quickly', 'efficiently', 'user-friendly', 'robust', 'scalable', 'fast', 'easy'];
    for (const term of vagueTerms) {
      if (requirementText.toLowerCase().includes(term)) {
        ambiguities.push({
          id: `ambiguity-${Date.now()}-${term}`,
          type: 'vague_language',
          severity: 'high',
          text: term,
          location: `Contains "${term}"`,
          description: `The term "${term}" is subjective and lacks measurable criteria`,
          suggestedClarification: `Define specific metrics for "${term}" (e.g., response time < 2 seconds)`,
          examples: [`"quickly" could mean "within 2 seconds"`, `"user-friendly" could mean "completed in 3 clicks or less"`]
        });
      }
    }

    // Check for missing acceptance criteria
    if (!this.hasAcceptanceCriteria(requirementText)) {
      ambiguities.push({
        id: `ambiguity-${Date.now()}-criteria`,
        type: 'missing_criteria',
        severity: 'critical',
        text: requirementText,
        location: 'Entire requirement',
        description: 'No clear acceptance criteria or success conditions defined',
        suggestedClarification: 'Add specific, measurable acceptance criteria',
        examples: ['Given... When... Then... format', 'Acceptance Criteria: 1. User can... 2. System should...']
      });
    }

    // Check for undefined terms
    const potentiallyUndefinedTerms = this.extractDomainTerms(requirementText);
    for (const term of potentiallyUndefinedTerms) {
      if (!this.isTermDefined(term, context)) {
        ambiguities.push({
          id: `ambiguity-${Date.now()}-${term}`,
          type: 'undefined_terms',
          severity: 'medium',
          text: term,
          location: `Contains "${term}"`,
          description: `The term "${term}" may not be clearly defined for all stakeholders`,
          suggestedClarification: `Provide clear definition of "${term}" in glossary or requirement`,
          examples: [`"${term}" means...`, `"${term}" includes/excludes...`]
        });
      }
    }

    return ambiguities;
  }

  /**
   * Assess testability of requirement
   */
  private assessTestability(requirementText: string, context: ProjectContext): TestabilityIssue[] {
    const issues: TestabilityIssue[] = [];

    // Check for measurable outcomes
    if (!this.hasMeasurableOutcome(requirementText)) {
      issues.push({
        id: `testability-${Date.now()}-outcome`,
        type: 'unmeasurable_outcome',
        severity: 'high',
        description: 'Requirement lacks measurable success criteria',
        impact: 'Cannot verify if requirement is satisfied',
        suggestedFix: 'Add specific, measurable acceptance criteria',
        testingChallenges: ['Cannot determine pass/fail conditions', 'Subjective interpretation of success']
      });
    }

    // Check for preconditions
    if (!this.hasPreconditions(requirementText)) {
      issues.push({
        id: `testability-${Date.now()}-preconditions`,
        type: 'missing_preconditions',
        severity: 'medium',
        description: 'Missing or unclear preconditions for the requirement',
        impact: 'Test setup may be ambiguous or incomplete',
        suggestedFix: 'Define clear preconditions and system state requirements',
        testingChallenges: ['Uncertain test setup', 'Inconsistent starting conditions']
      });
    }

    // Check for error handling
    if (!this.hasErrorHandling(requirementText)) {
      issues.push({
        id: `testability-${Date.now()}-errors`,
        type: 'no_error_handling',
        severity: 'medium',
        description: 'No specification of error conditions or handling',
        impact: 'Negative test cases cannot be defined',
        suggestedFix: 'Specify error conditions and expected system behavior',
        testingChallenges: ['Cannot test failure scenarios', 'Undefined error behavior']
      });
    }

    return issues;
  }

  /**
   * Identify risks in requirement
   */
  private identifyRisks(
    requirementText: string,
    context: ProjectContext,
    sfdipot: SFDIPOTAnalysis,
    fewHiccupps: FEWHICCUPPSAnalysis
  ): RequirementRisk[] {
    const risks: RequirementRisk[] = [];

    // Technical risks
    if (this.hasTechnicalComplexity(requirementText, sfdipot)) {
      risks.push({
        id: `risk-${Date.now()}-technical`,
        type: 'technical',
        severity: 'high',
        probability: 0.7,
        impact: 0.8,
        description: 'High technical complexity may lead to implementation challenges',
        indicators: ['Complex integrations', 'New technology stack', 'Performance requirements'],
        mitigationStrategies: ['Prototype early', 'Technical spikes', 'Expert consultation'],
        testingImplications: ['Extended testing timeline', 'Specialized test environments', 'Performance testing']
      });
    }

    // Business risks
    if (this.hasBusinessComplexity(requirementText, fewHiccupps)) {
      risks.push({
        id: `risk-${Date.now()}-business`,
        type: 'business',
        severity: 'medium',
        probability: 0.5,
        impact: 0.9,
        description: 'Business logic complexity may lead to misunderstandings',
        indicators: ['Multiple stakeholders', 'Changing requirements', 'Unclear business rules'],
        mitigationStrategies: ['Stakeholder workshops', 'Prototyping', 'Iterative feedback'],
        testingImplications: ['Business user testing', 'Acceptance testing', 'Scenario validation']
      });
    }

    // Integration risks
    if (this.hasIntegrationRisks(requirementText, sfdipot)) {
      risks.push({
        id: `risk-${Date.now()}-integration`,
        type: 'integration',
        severity: 'high',
        probability: 0.6,
        impact: 0.7,
        description: 'External system dependencies pose integration risks',
        indicators: ['Third-party APIs', 'Legacy systems', 'Real-time requirements'],
        mitigationStrategies: ['API contract testing', 'Mock services', 'Fallback mechanisms'],
        testingImplications: ['Integration testing', 'Contract testing', 'End-to-end testing']
      });
    }

    return risks;
  }

  /**
   * Generate improvement suggestions
   */
  private generateImprovementSuggestions(
    requirementText: string,
    ambiguities: AmbiguityIssue[],
    testabilityIssues: TestabilityIssue[],
    risks: RequirementRisk[],
    context: ProjectContext
  ): ImprovementSuggestion[] {
    const suggestions: ImprovementSuggestion[] = [];

    // Address major ambiguities
    const criticalAmbiguities = ambiguities.filter(a => a.severity === 'critical');
    for (const ambiguity of criticalAmbiguities) {
      suggestions.push({
        id: `suggestion-${Date.now()}-${ambiguity.id}`,
        category: 'clarity',
        priority: 'critical',
        description: 'Address critical ambiguity',
        before: ambiguity.text,
        after: ambiguity.suggestedClarification,
        reasoning: ambiguity.description,
        benefits: ['Reduced misunderstanding', 'Clear acceptance criteria', 'Better testability']
      });
    }

    // Address testability issues
    const criticalTestability = testabilityIssues.filter(t => t.severity === 'high' || t.severity === 'critical');
    for (const issue of criticalTestability) {
      suggestions.push({
        id: `suggestion-${Date.now()}-${issue.id}`,
        category: 'testability',
        priority: 'high',
        description: 'Improve testability',
        before: 'Current requirement lacks testable criteria',
        after: issue.suggestedFix,
        reasoning: issue.description,
        benefits: ['Clear test cases', 'Measurable outcomes', 'Reduced testing ambiguity']
      });
    }

    // Add completeness suggestions
    if (!this.hasUserStory(requirementText)) {
      suggestions.push({
        id: `suggestion-${Date.now()}-user-story`,
        category: 'completeness',
        priority: 'medium',
        description: 'Add user story format',
        before: requirementText,
        after: `As a [user type], I want [functionality] so that [benefit]`,
        reasoning: 'User story format provides context and motivation',
        benefits: ['Clear user context', 'Defined value proposition', 'Better prioritization']
      });
    }

    return suggestions;
  }

  /**
   * Create testing charter for risk area
   */
  private createTestingCharter(id: string, riskArea: string, timeBox: number): TestingCharter {
    const priority = this.determineCharterPriority(riskArea);
    const approach = this.determineTestingApproach(riskArea);

    return {
      id,
      riskArea,
      mission: `Explore ${riskArea} to identify potential issues and validate requirements`,
      timeBox,
      approach,
      targets: this.generateTestTargets(riskArea),
      risks: this.generateTestRisks(riskArea),
      resources: this.generateRequiredResources(riskArea),
      deliverables: [
        'Test observations and findings',
        'Identified issues and questions',
        'Risk assessment update',
        'Follow-up testing recommendations'
      ],
      priority
    };
  }

  // Helper methods for SFDIPOT analysis
  private extractStructuralElements(text: string, context: ProjectContext): string[] {
    const elements: string[] = [];
    if (text.includes('component') || text.includes('module')) elements.push('Modular architecture');
    if (text.includes('database') || text.includes('storage')) elements.push('Data persistence layer');
    if (text.includes('api') || text.includes('service')) elements.push('Service architecture');
    return elements;
  }

  private extractFunctionalElements(text: string, context: ProjectContext): string[] {
    const elements: string[] = [];
    if (text.includes('login') || text.includes('authenticate')) elements.push('Authentication');
    if (text.includes('search') || text.includes('find')) elements.push('Search functionality');
    if (text.includes('create') || text.includes('add')) elements.push('Create operations');
    return elements;
  }

  private extractDataElements(text: string, context: ProjectContext): string[] {
    const elements: string[] = [];
    if (text.includes('user') || text.includes('account')) elements.push('User data');
    if (text.includes('personal') || text.includes('profile')) elements.push('Personal information');
    if (text.includes('transaction') || text.includes('payment')) elements.push('Transaction data');
    return elements;
  }

  private extractInterfaceElements(text: string, context: ProjectContext): string[] {
    const elements: string[] = [];
    if (text.includes('web') || text.includes('browser')) elements.push('Web interface');
    if (text.includes('mobile') || text.includes('app')) elements.push('Mobile interface');
    if (text.includes('api') || text.includes('rest')) elements.push('API interface');
    return elements;
  }

  private extractPlatformElements(text: string, context: ProjectContext): string[] {
    const elements: string[] = [];
    if (context.domain.includes('web')) elements.push('Web platform');
    if (context.domain.includes('mobile')) elements.push('Mobile platform');
    if (context.domain.includes('cloud')) elements.push('Cloud platform');
    return elements;
  }

  private extractOperationalElements(text: string, context: ProjectContext): string[] {
    const elements: string[] = [];
    if (text.includes('24/7') || text.includes('always')) elements.push('Continuous operation');
    if (text.includes('backup') || text.includes('recovery')) elements.push('Backup operations');
    if (text.includes('monitor') || text.includes('log')) elements.push('Monitoring operations');
    return elements;
  }

  private extractTimeElements(text: string, context: ProjectContext): string[] {
    const elements: string[] = [];
    if (text.includes('real-time') || text.includes('immediate')) elements.push('Real-time processing');
    if (text.includes('schedule') || text.includes('batch')) elements.push('Scheduled processing');
    if (text.includes('timeout') || text.includes('delay')) elements.push('Time constraints');
    return elements;
  }

  // Helper methods for FEW HICCUPPS analysis
  private analyzeFamiliarity(text: string, context: ProjectContext): string[] {
    return ['Similar login patterns in existing systems', 'Common user authentication flows'];
  }

  private analyzeExplainability(text: string, context: ProjectContext): string[] {
    return this.hasMeasurableOutcome(text) ? ['Clear success criteria'] : ['Vague success conditions'];
  }

  private analyzeWorldFit(text: string, context: ProjectContext): string[] {
    return ['Aligns with standard web practices', 'Meets user expectations'];
  }

  private analyzeHistory(text: string, context: ProjectContext): string[] {
    return ['Previous authentication implementations', 'User feedback from similar features'];
  }

  private analyzeImage(text: string, context: ProjectContext): string[] {
    return ['User-friendly interface', 'Professional appearance'];
  }

  private analyzeComparability(text: string, context: ProjectContext): string[] {
    return ['Similar to other login systems', 'Industry standard practices'];
  }

  private analyzeClaims(text: string, context: ProjectContext): string[] {
    const claims: string[] = [];
    if (text.includes('quick')) claims.push('Claims fast performance');
    if (text.includes('secure')) claims.push('Claims security');
    if (text.includes('easy')) claims.push('Claims ease of use');
    return claims;
  }

  private analyzeUserDesires(text: string, context: ProjectContext): string[] {
    return ['Quick access to account', 'Secure authentication', 'Minimal friction'];
  }

  private analyzeProduct(text: string, context: ProjectContext): string[] {
    return ['Authentication system', 'User management component'];
  }

  private analyzePurpose(text: string, context: ProjectContext): string[] {
    return ['Enable secure access', 'Protect user accounts'];
  }

  private analyzeStatutes(text: string, context: ProjectContext): string[] {
    return context.complianceRequirements.length > 0 ? context.complianceRequirements : ['Data protection regulations'];
  }

  // Scoring and calculation methods
  private calculateAmbiguityScore(ambiguities: AmbiguityIssue[]): number {
    if (ambiguities.length === 0) return 0;

    const severityWeights = { low: 0.25, medium: 0.5, high: 0.75, critical: 1.0 };
    const totalWeight = ambiguities.reduce((sum, a) => sum + severityWeights[a.severity], 0);
    return Math.min(totalWeight / ambiguities.length, 1.0);
  }

  private calculateTestabilityScore(issues: TestabilityIssue[]): number {
    if (issues.length === 0) return 1.0;

    const severityWeights = { low: 0.25, medium: 0.5, high: 0.75, critical: 1.0 };
    const totalWeight = issues.reduce((sum, i) => sum + severityWeights[i.severity], 0);
    return Math.max(1.0 - (totalWeight / issues.length), 0);
  }

  private calculateRiskScore(risks: RequirementRisk[]): number {
    if (risks.length === 0) return 0;

    const riskScores = risks.map(r => r.probability * r.impact);
    return riskScores.reduce((sum, score) => sum + score, 0) / risks.length;
  }

  private calculateConfidence(text: string, context: ProjectContext): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence for well-structured requirements
    if (this.hasUserStory(text)) confidence += 0.2;
    if (this.hasAcceptanceCriteria(text)) confidence += 0.2;
    if (text.length > 50) confidence += 0.1; // More detailed requirements

    // Adjust for context
    if (context.teamExperience === 'expert') confidence += 0.1;
    if (context.domain !== 'general') confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private calculatePriority(analysis: RequirementAnalysis): number {
    return (analysis.riskScore * 0.4) +
           (analysis.ambiguityScore * 0.3) +
           ((1 - analysis.testabilityScore) * 0.3);
  }

  // Utility methods for requirement analysis
  private hasAcceptanceCriteria(text: string): boolean {
    return text.includes('acceptance criteria') ||
           text.includes('given') && text.includes('when') && text.includes('then') ||
           text.includes('should') && text.includes('must');
  }

  private hasMeasurableOutcome(text: string): boolean {
    const measurableTerms = ['within', 'less than', 'more than', 'exactly', 'at least', 'seconds', 'minutes', 'percent'];
    return measurableTerms.some(term => text.toLowerCase().includes(term));
  }

  private hasPreconditions(text: string): boolean {
    return text.includes('given') || text.includes('when') || text.includes('prerequisite');
  }

  private hasErrorHandling(text: string): boolean {
    const errorTerms = ['error', 'fail', 'invalid', 'exception', 'timeout'];
    return errorTerms.some(term => text.toLowerCase().includes(term));
  }

  private hasUserStory(text: string): boolean {
    return text.includes('as a') && text.includes('i want') && text.includes('so that');
  }

  private extractDomainTerms(text: string): string[] {
    // Simple extraction - in real implementation, use NLP
    const words = text.split(/\s+/);
    return words.filter(word => word.length > 3 && !this.isCommonWord(word));
  }

  private isCommonWord(word: string): boolean {
    const commonWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'boy', 'did', 'she', 'use', 'way', 'why'];
    return commonWords.includes(word.toLowerCase());
  }

  private isTermDefined(term: string, context: ProjectContext): boolean {
    // Simplified check - in real implementation, check glossary/knowledge base
    return this.contextKnowledge.has(term.toLowerCase());
  }

  // Risk detection methods
  private hasTechnicalComplexity(text: string, sfdipot: SFDIPOTAnalysis): boolean {
    const complexityIndicators = ['integration', 'performance', 'real-time', 'scalable', 'distributed'];
    return complexityIndicators.some(indicator => text.toLowerCase().includes(indicator)) ||
           sfdipot.interfaces.length > 2;
  }

  private hasBusinessComplexity(text: string, fewHiccupps: FEWHICCUPPSAnalysis): boolean {
    return fewHiccupps.claims.length > 2 || fewHiccupps.statutes.length > 0;
  }

  private hasIntegrationRisks(text: string, sfdipot: SFDIPOTAnalysis): boolean {
    const integrationTerms = ['api', 'external', 'third-party', 'legacy', 'synchronize'];
    return integrationTerms.some(term => text.toLowerCase().includes(term)) ||
           sfdipot.interfaces.length > 1;
  }

  // Charter generation methods
  private determineCharterPriority(riskArea: string): TestingCharter['priority'] {
    const highPriorityAreas = ['security', 'payment', 'authentication', 'data'];
    return highPriorityAreas.some(area => riskArea.toLowerCase().includes(area)) ? 'high' : 'medium';
  }

  private determineTestingApproach(riskArea: string): string {
    const approaches = {
      security: 'Security-focused exploratory testing with attack scenarios',
      performance: 'Load and stress testing with performance monitoring',
      usability: 'User-centered exploratory testing with real user scenarios',
      integration: 'End-to-end testing with external system validation'
    };

    for (const [area, approach] of Object.entries(approaches)) {
      if (riskArea.toLowerCase().includes(area)) {
        return approach;
      }
    }

    return 'General exploratory testing with systematic coverage';
  }

  private generateTestTargets(riskArea: string): string[] {
    return [
      `Core functionality in ${riskArea}`,
      `Error conditions and edge cases`,
      `Integration points and interfaces`,
      `User workflows and scenarios`
    ];
  }

  private generateTestRisks(riskArea: string): string[] {
    return [
      'Limited time for thorough exploration',
      'Complex system interactions',
      'Unclear requirements or specifications',
      'Environmental dependencies'
    ];
  }

  private generateRequiredResources(riskArea: string): string[] {
    return [
      'Test environment access',
      'Test data and user accounts',
      'Monitoring and logging tools',
      'Domain expertise consultation'
    ];
  }

  private generateHeatmapActions(analysis: RequirementAnalysis): string[] {
    const actions: string[] = [];

    if (analysis.ambiguityScore > 0.7) {
      actions.push('Clarify ambiguous language');
    }

    if (analysis.testabilityScore < 0.5) {
      actions.push('Add measurable acceptance criteria');
    }

    if (analysis.riskScore > 0.6) {
      actions.push('Conduct risk assessment');
    }

    if (analysis.suggestions.length > 0) {
      actions.push('Implement improvement suggestions');
    }

    return actions.length > 0 ? actions : ['Review and validate requirement'];
  }

  protected async onInitialize(): Promise<void> {
    this.logger.info('Initializing Requirements Explorer');
    // Load domain knowledge and context
  }

  public async getAnalysis(analysisId: string): Promise<RequirementAnalysis | null> {
    return this.analyses.get(analysisId) ||
           await this.getMemory<RequirementAnalysis>(`analysis:${analysisId}`);
  }

  public async getCharter(charterId: string): Promise<TestingCharter | null> {
    return this.charters.get(charterId) ||
           await this.getMemory<TestingCharter>(`charter:${charterId}`);
  }

  public getAnalyses(): RequirementAnalysis[] {
    return Array.from(this.analyses.values());
  }
}