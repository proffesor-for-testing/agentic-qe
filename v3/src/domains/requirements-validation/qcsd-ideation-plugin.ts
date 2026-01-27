/**
 * Agentic QE v3 - QCSD Ideation Swarm Plugin
 *
 * Implements the QCSD (Quality Conscious Software Delivery) Ideation phase
 * using James Bach's HTSM v6.3 framework for shift-left quality engineering.
 *
 * This plugin registers workflow actions that enable the qcsd-ideation-swarm
 * workflow to orchestrate multi-agent quality assessment during PI/Sprint Planning.
 *
 * HTSM Quality Categories:
 * 1. Capability - Core functionality
 * 2. Reliability - Consistency under stress
 * 3. Usability - User experience
 * 4. Charisma - Aesthetics and appeal
 * 5. Security - Protection mechanisms
 * 6. Scalability - Growth handling
 * 7. Compatibility - Integration factors
 * 8. Performance - Speed and efficiency
 * 9. Installability - Deployment ease
 * 10. Supportability - Maintenance factors
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err, DomainName } from '../../shared/types/index.js';
import { MemoryBackend } from '../../kernel/interfaces.js';
import type { WorkflowOrchestrator, WorkflowContext } from '../../../src/coordination/workflow-orchestrator.js';

// ============================================================================
// Types
// ============================================================================

/**
 * HTSM v6.3 Quality Category
 */
export interface QualityCriterion {
  id: string;
  category: HTSMCategory;
  name: string;
  description: string;
  weight: number; // 1-10 importance
  testabilityScore: number; // 0-100
  risks: string[];
  testIdeas: string[];
}

/**
 * HTSM Categories
 */
export type HTSMCategory =
  | 'capability'
  | 'reliability'
  | 'usability'
  | 'charisma'
  | 'security'
  | 'scalability'
  | 'compatibility'
  | 'performance'
  | 'installability'
  | 'supportability';

/**
 * Testability Assessment using 10 Principles
 */
export interface TestabilityAssessment {
  id: string;
  targetId: string;
  overallScore: number; // 0-100
  principles: {
    controllability: number;
    observability: number;
    isolability: number;
    separationOfConcerns: number;
    simplicity: number;
    stability: number;
    informationCapture: number;
    automationSupport: number;
    selfDocumenting: number;
    independence: number;
  };
  blockers: string[];
  recommendations: string[];
}

/**
 * Risk Assessment
 */
export interface RiskAssessment {
  id: string;
  targetId: string;
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number; // 0-100
  factors: RiskFactor[];
  mitigations: string[];
}

export interface RiskFactor {
  category: string;
  description: string;
  likelihood: number; // 1-5
  impact: number; // 1-5
  score: number; // likelihood * impact
}

/**
 * Security Threat Model (STRIDE)
 */
export interface ThreatModel {
  id: string;
  targetId: string;
  threats: STRIDEThreat[];
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

export interface STRIDEThreat {
  category: 'spoofing' | 'tampering' | 'repudiation' | 'informationDisclosure' | 'denial' | 'elevation';
  name: string;
  description: string;
  likelihood: number;
  impact: number;
  mitigations: string[];
}

/**
 * Ideation Report (aggregate output)
 */
export interface IdeationReport {
  id: string;
  timestamp: string;
  targetId: string;
  targetType: 'epic' | 'feature' | 'story' | 'requirement';

  // Quality Analysis
  qualityCriteria: QualityCriterion[];
  qualityScore: number;

  // Testability
  testability: TestabilityAssessment;

  // Risk
  risk: RiskAssessment;

  // Security (optional)
  threatModel?: ThreatModel;

  // Aggregated Insights
  insights: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };

  // Recommendations
  recommendations: {
    priority: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    description: string;
    effort: 'low' | 'medium' | 'high';
  }[];

  // Test Strategy
  testStrategy: {
    approach: string;
    coverage: string[];
    riskAreas: string[];
    estimatedEffort: string;
  };

  // Decision
  readyForDevelopment: boolean;
  blockers: string[];
}

// ============================================================================
// QCSD Ideation Plugin
// ============================================================================

export class QCSDIdeationPlugin {
  private initialized = false;
  private memory: MemoryBackend;

  constructor(memory: MemoryBackend) {
    this.memory = memory;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
  }

  async dispose(): Promise<void> {
    this.initialized = false;
  }

  /**
   * Register workflow actions with the orchestrator
   */
  registerWorkflowActions(orchestrator: WorkflowOrchestrator): void {
    if (!this.initialized) {
      throw new Error('QCSDIdeationPlugin must be initialized before registering workflow actions');
    }

    // Register analyzeQualityCriteria action
    orchestrator.registerAction(
      'requirements-validation',
      'analyzeQualityCriteria',
      this.analyzeQualityCriteria.bind(this)
    );

    // Register assessTestability action
    orchestrator.registerAction(
      'requirements-validation',
      'assessTestability',
      this.assessTestability.bind(this)
    );

    // Register assessRisks action
    orchestrator.registerAction(
      'requirements-validation',
      'assessRisks',
      this.assessRisks.bind(this)
    );

    // Register validateRequirements action
    orchestrator.registerAction(
      'requirements-validation',
      'validateRequirements',
      this.validateRequirements.bind(this)
    );

    // Register modelSecurityThreats action
    orchestrator.registerAction(
      'security-compliance',
      'modelSecurityThreats',
      this.modelSecurityThreats.bind(this)
    );

    // Register generateIdeationReport action
    orchestrator.registerAction(
      'requirements-validation',
      'generateIdeationReport',
      this.generateIdeationReport.bind(this)
    );

    // Register storeIdeationLearnings action
    orchestrator.registerAction(
      'learning-optimization',
      'storeIdeationLearnings',
      this.storeIdeationLearnings.bind(this)
    );
  }

  // ============================================================================
  // Workflow Actions
  // ============================================================================

  /**
   * Analyze quality criteria using HTSM v6.3 framework
   */
  private async analyzeQualityCriteria(
    input: Record<string, unknown>,
    context: WorkflowContext
  ): Promise<Result<{ qualityCriteria: QualityCriterion[]; qualityScore: number }, Error>> {
    try {
      const targetId = input.targetId as string || context.input.targetId as string;
      const targetType = input.targetType as string || context.input.targetType as string;
      const description = input.description as string || context.input.description as string || '';
      const acceptanceCriteria = input.acceptanceCriteria as string[] || context.input.acceptanceCriteria as string[] || [];

      // Analyze each HTSM category
      const criteria: QualityCriterion[] = this.analyzeHTSMCategories(
        targetId,
        targetType,
        description,
        acceptanceCriteria
      );

      // Calculate overall quality score
      const qualityScore = this.calculateQualityScore(criteria);

      // Store intermediate result
      await this.memory.set(
        `qcsd-ideation:quality-criteria:${targetId}`,
        { criteria, qualityScore, timestamp: new Date().toISOString() },
        { namespace: 'qcsd-ideation', ttl: 3600 }
      );

      return ok({ qualityCriteria: criteria, qualityScore });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Assess testability using 10 principles
   */
  private async assessTestability(
    input: Record<string, unknown>,
    context: WorkflowContext
  ): Promise<Result<TestabilityAssessment, Error>> {
    try {
      const targetId = input.targetId as string || context.input.targetId as string;
      const description = input.description as string || context.input.description as string || '';
      const acceptanceCriteria = input.acceptanceCriteria as string[] || context.input.acceptanceCriteria as string[] || [];

      // Assess each testability principle
      const principles = this.assessTestabilityPrinciples(description, acceptanceCriteria);

      // Calculate overall score
      const overallScore = Math.round(
        Object.values(principles).reduce((sum, score) => sum + score, 0) / 10
      );

      // Identify blockers and recommendations
      const { blockers, recommendations } = this.identifyTestabilityIssues(principles);

      const assessment: TestabilityAssessment = {
        id: uuidv4(),
        targetId,
        overallScore,
        principles,
        blockers,
        recommendations,
      };

      // Store intermediate result
      await this.memory.set(
        `qcsd-ideation:testability:${targetId}`,
        assessment,
        { namespace: 'qcsd-ideation', ttl: 3600 }
      );

      return ok(assessment);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Assess risks
   */
  private async assessRisks(
    input: Record<string, unknown>,
    context: WorkflowContext
  ): Promise<Result<RiskAssessment, Error>> {
    try {
      const targetId = input.targetId as string || context.input.targetId as string;
      const targetType = input.targetType as string || context.input.targetType as string;
      const description = input.description as string || context.input.description as string || '';

      // Analyze risk factors
      const factors = this.analyzeRiskFactors(targetType, description);

      // Calculate overall risk score
      const riskScore = Math.round(
        factors.reduce((sum, f) => sum + f.score, 0) / factors.length * 4
      );

      // Determine risk level
      const overallRisk = this.determineRiskLevel(riskScore);

      // Generate mitigations
      const mitigations = this.generateMitigations(factors);

      const assessment: RiskAssessment = {
        id: uuidv4(),
        targetId,
        overallRisk,
        riskScore,
        factors,
        mitigations,
      };

      // Store intermediate result
      await this.memory.set(
        `qcsd-ideation:risk:${targetId}`,
        assessment,
        { namespace: 'qcsd-ideation', ttl: 3600 }
      );

      return ok(assessment);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Validate requirements for completeness
   */
  private async validateRequirements(
    input: Record<string, unknown>,
    context: WorkflowContext
  ): Promise<Result<{ valid: boolean; issues: string[]; suggestions: string[] }, Error>> {
    try {
      const targetId = input.targetId as string || context.input.targetId as string;
      const description = input.description as string || context.input.description as string || '';
      const acceptanceCriteria = input.acceptanceCriteria as string[] || context.input.acceptanceCriteria as string[] || [];

      const issues: string[] = [];
      const suggestions: string[] = [];

      // Check description quality
      if (description.length < 50) {
        issues.push('Description is too short (< 50 characters)');
        suggestions.push('Add more context about the business value and user need');
      }

      // Check for ambiguous language
      const ambiguousTerms = ['should', 'could', 'might', 'maybe', 'possibly', 'etc', 'and so on'];
      for (const term of ambiguousTerms) {
        if (description.toLowerCase().includes(term)) {
          issues.push(`Ambiguous term detected: "${term}"`);
          suggestions.push(`Replace "${term}" with specific, measurable criteria`);
        }
      }

      // Check acceptance criteria
      if (acceptanceCriteria.length === 0) {
        issues.push('No acceptance criteria defined');
        suggestions.push('Add Given/When/Then acceptance criteria');
      } else if (acceptanceCriteria.length < 3) {
        issues.push('Too few acceptance criteria (< 3)');
        suggestions.push('Consider adding criteria for happy path, error cases, and edge cases');
      }

      // Check for testable criteria
      const hasTestable = acceptanceCriteria.some(
        ac => ac.toLowerCase().includes('given') ||
              ac.toLowerCase().includes('when') ||
              ac.toLowerCase().includes('then')
      );
      if (!hasTestable && acceptanceCriteria.length > 0) {
        suggestions.push('Consider using Given/When/Then format for clearer test scenarios');
      }

      const valid = issues.length === 0;

      return ok({ valid, issues, suggestions });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Model security threats using STRIDE
   */
  private async modelSecurityThreats(
    input: Record<string, unknown>,
    context: WorkflowContext
  ): Promise<Result<ThreatModel, Error>> {
    try {
      const targetId = input.targetId as string || context.input.targetId as string;
      const description = input.description as string || context.input.description as string || '';
      const securityCritical = input.securityCritical as boolean || context.input.securityCritical as boolean || false;

      // Analyze STRIDE threats
      const threats = this.analyzeSTRIDEThreats(description, securityCritical);

      // Calculate overall risk
      const maxScore = Math.max(...threats.map(t => t.likelihood * t.impact), 0);
      const overallRisk = this.determineRiskLevel(maxScore * 4);

      // Generate recommendations
      const recommendations = this.generateSecurityRecommendations(threats);

      const model: ThreatModel = {
        id: uuidv4(),
        targetId,
        threats,
        overallRisk,
        recommendations,
      };

      // Store intermediate result
      await this.memory.set(
        `qcsd-ideation:threat-model:${targetId}`,
        model,
        { namespace: 'qcsd-ideation', ttl: 3600 }
      );

      return ok(model);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate aggregated ideation report
   */
  private async generateIdeationReport(
    input: Record<string, unknown>,
    context: WorkflowContext
  ): Promise<Result<IdeationReport, Error>> {
    try {
      const targetId = input.targetId as string || context.input.targetId as string;
      const targetType = (input.targetType as string || context.input.targetType as string || 'requirement') as IdeationReport['targetType'];

      // Retrieve all intermediate results
      const qualityData = await this.memory.get<{ criteria: QualityCriterion[]; qualityScore: number }>(
        `qcsd-ideation:quality-criteria:${targetId}`
      );
      const testability = await this.memory.get<TestabilityAssessment>(
        `qcsd-ideation:testability:${targetId}`
      );
      const risk = await this.memory.get<RiskAssessment>(
        `qcsd-ideation:risk:${targetId}`
      );
      const threatModel = await this.memory.get<ThreatModel>(
        `qcsd-ideation:threat-model:${targetId}`
      );

      // Use context results if memory doesn't have them
      // Cast results to Record<string, unknown> to access dynamic step outputs
      const results = context.results as Record<string, Record<string, unknown>>;
      const qualityCriteria = qualityData?.criteria || (results['quality-criteria-analysis']?.qualityCriteria as QualityCriterion[] | undefined) || [];
      const qualityScore = qualityData?.qualityScore || (results['quality-criteria-analysis']?.qualityScore as number | undefined) || 0;
      const testabilityResult = testability || (results['testability-assessment'] as unknown as TestabilityAssessment);
      const riskResult = risk || (results['risk-assessment'] as unknown as RiskAssessment);
      const threatModelResult = threatModel || (results['security-threat-modeling'] as unknown as ThreatModel | undefined);

      // Generate SWOT insights
      const insights = this.generateSWOTInsights(
        qualityCriteria,
        testabilityResult,
        riskResult
      );

      // Generate prioritized recommendations
      const recommendations = this.generateRecommendations(
        qualityCriteria,
        testabilityResult,
        riskResult,
        threatModelResult
      );

      // Generate test strategy
      const testStrategy = this.generateTestStrategy(
        qualityCriteria,
        testabilityResult,
        riskResult
      );

      // Determine development readiness
      const blockers = this.identifyBlockers(
        testabilityResult,
        riskResult,
        threatModelResult
      );
      const readyForDevelopment = blockers.length === 0;

      const report: IdeationReport = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        targetId,
        targetType,
        qualityCriteria,
        qualityScore,
        testability: testabilityResult,
        risk: riskResult,
        threatModel: threatModelResult,
        insights,
        recommendations,
        testStrategy,
        readyForDevelopment,
        blockers,
      };

      // Store final report
      await this.memory.set(
        `qcsd-ideation:report:${targetId}`,
        report,
        { namespace: 'qcsd-ideation', persist: true }
      );

      return ok(report);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Store learnings for future pattern matching
   */
  private async storeIdeationLearnings(
    input: Record<string, unknown>,
    context: WorkflowContext
  ): Promise<Result<{ stored: boolean; patternId: string }, Error>> {
    try {
      const targetId = input.targetId as string || context.input.targetId as string;
      const report = input.report as IdeationReport || context.results['aggregate-ideation-report'] as IdeationReport;

      if (!report) {
        return err(new Error('No ideation report found to store'));
      }

      const patternId = `ideation-pattern-${Date.now()}`;

      // Create learning pattern
      const pattern = {
        id: patternId,
        timestamp: new Date().toISOString(),
        targetType: report.targetType,
        qualityScore: report.qualityScore,
        testabilityScore: report.testability.overallScore,
        riskLevel: report.risk.overallRisk,
        blockerCount: report.blockers.length,
        readyForDevelopment: report.readyForDevelopment,
        // Key characteristics for pattern matching
        features: {
          hasSecurityThreats: !!report.threatModel && report.threatModel.threats.length > 0,
          avgPrincipleScore: report.testability.overallScore,
          riskFactorCount: report.risk.factors.length,
          qualityCriteriaCount: report.qualityCriteria.length,
        },
      };

      // Store pattern for learning
      await this.memory.set(
        `qcsd-patterns:${patternId}`,
        pattern,
        { namespace: 'learning', persist: true }
      );

      // Store in pattern index for search
      const patternIndex = await this.memory.get<string[]>('qcsd-patterns:index') || [];
      patternIndex.push(patternId);
      await this.memory.set('qcsd-patterns:index', patternIndex, { namespace: 'learning', persist: true });

      return ok({ stored: true, patternId });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private analyzeHTSMCategories(
    targetId: string,
    targetType: string,
    description: string,
    acceptanceCriteria: string[]
  ): QualityCriterion[] {
    const categories: HTSMCategory[] = [
      'capability',
      'reliability',
      'usability',
      'charisma',
      'security',
      'scalability',
      'compatibility',
      'performance',
      'installability',
      'supportability',
    ];

    const descLower = description.toLowerCase();
    const acJoined = acceptanceCriteria.join(' ').toLowerCase();

    return categories.map(category => {
      const { weight, testabilityScore, risks, testIdeas } = this.analyzeCategory(
        category,
        descLower,
        acJoined
      );

      return {
        id: `${targetId}-${category}`,
        category,
        name: category.charAt(0).toUpperCase() + category.slice(1),
        description: this.getCategoryDescription(category),
        weight,
        testabilityScore,
        risks,
        testIdeas,
      };
    });
  }

  private analyzeCategory(
    category: HTSMCategory,
    description: string,
    acceptanceCriteria: string
  ): { weight: number; testabilityScore: number; risks: string[]; testIdeas: string[] } {
    const keywords: Record<HTSMCategory, string[]> = {
      capability: ['function', 'feature', 'ability', 'can', 'must', 'shall'],
      reliability: ['reliable', 'consistent', 'stable', 'fault', 'error', 'recover'],
      usability: ['user', 'easy', 'intuitive', 'accessible', 'ux', 'interface'],
      charisma: ['design', 'look', 'feel', 'brand', 'aesthetic', 'appeal'],
      security: ['secure', 'auth', 'encrypt', 'protect', 'permission', 'role'],
      scalability: ['scale', 'load', 'concurrent', 'throughput', 'capacity'],
      compatibility: ['integrate', 'api', 'browser', 'device', 'version', 'legacy'],
      performance: ['fast', 'response', 'latency', 'speed', 'efficient', 'optimize'],
      installability: ['install', 'deploy', 'setup', 'configure', 'provision'],
      supportability: ['log', 'monitor', 'debug', 'maintain', 'document', 'support'],
    };

    const categoryKeywords = keywords[category];
    const mentionCount = categoryKeywords.filter(
      kw => description.includes(kw) || acceptanceCriteria.includes(kw)
    ).length;

    // Weight based on relevance
    const weight = Math.min(10, 3 + mentionCount * 2);

    // Testability based on specificity
    const hasSpecificCriteria = categoryKeywords.some(kw => acceptanceCriteria.includes(kw));
    const testabilityScore = hasSpecificCriteria ? 70 + Math.random() * 20 : 40 + Math.random() * 30;

    // Generate risks
    const risks = this.generateCategoryRisks(category, mentionCount === 0);

    // Generate test ideas
    const testIdeas = this.generateCategoryTestIdeas(category);

    return { weight, testabilityScore: Math.round(testabilityScore), risks, testIdeas };
  }

  private getCategoryDescription(category: HTSMCategory): string {
    const descriptions: Record<HTSMCategory, string> = {
      capability: 'Core functionality and features the system must provide',
      reliability: 'Consistency and stability under various conditions',
      usability: 'Ease of use and user experience quality',
      charisma: 'Visual appeal and brand alignment',
      security: 'Protection against threats and unauthorized access',
      scalability: 'Ability to handle growth and increased load',
      compatibility: 'Integration with other systems and environments',
      performance: 'Speed, responsiveness, and resource efficiency',
      installability: 'Ease of deployment and configuration',
      supportability: 'Maintainability and operational support',
    };
    return descriptions[category];
  }

  private generateCategoryRisks(category: HTSMCategory, notMentioned: boolean): string[] {
    const risks: string[] = [];

    if (notMentioned) {
      risks.push(`${category.charAt(0).toUpperCase() + category.slice(1)} requirements not explicitly defined`);
    }

    const categoryRisks: Record<HTSMCategory, string[]> = {
      capability: ['Feature gaps may emerge late', 'Edge cases not covered'],
      reliability: ['System may fail under load', 'Error handling unclear'],
      usability: ['User confusion possible', 'Accessibility gaps'],
      charisma: ['Brand inconsistency risk', 'Visual regression possible'],
      security: ['Vulnerability exposure', 'Data breach risk'],
      scalability: ['Performance degradation at scale', 'Resource exhaustion'],
      compatibility: ['Integration failures', 'Version conflicts'],
      performance: ['Slow response times', 'Resource bottlenecks'],
      installability: ['Deployment complexity', 'Configuration errors'],
      supportability: ['Debugging difficulty', 'Maintenance burden'],
    };

    risks.push(...categoryRisks[category].slice(0, notMentioned ? 2 : 1));
    return risks;
  }

  private generateCategoryTestIdeas(category: HTSMCategory): string[] {
    const testIdeas: Record<HTSMCategory, string[]> = {
      capability: ['Happy path scenarios', 'Boundary value analysis', 'State transition tests'],
      reliability: ['Stress testing', 'Recovery testing', 'Long-running tests'],
      usability: ['User journey tests', 'Accessibility audits', 'Heuristic evaluation'],
      charisma: ['Visual regression tests', 'Brand guideline validation', 'A/B testing'],
      security: ['Penetration testing', 'Auth flow tests', 'Input validation'],
      scalability: ['Load testing', 'Capacity testing', 'Horizontal scaling tests'],
      compatibility: ['Cross-browser tests', 'API contract tests', 'Migration tests'],
      performance: ['Response time tests', 'Throughput tests', 'Resource monitoring'],
      installability: ['Deployment verification', 'Configuration tests', 'Rollback tests'],
      supportability: ['Log validation', 'Monitoring checks', 'Runbook validation'],
    };
    return testIdeas[category];
  }

  private calculateQualityScore(criteria: QualityCriterion[]): number {
    if (criteria.length === 0) return 0;

    const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
    const weightedScore = criteria.reduce(
      (sum, c) => sum + (c.testabilityScore * c.weight) / totalWeight,
      0
    );

    return Math.round(weightedScore);
  }

  private assessTestabilityPrinciples(
    description: string,
    acceptanceCriteria: string[]
  ): TestabilityAssessment['principles'] {
    const acCount = acceptanceCriteria.length;
    const descLength = description.length;
    const hasGivenWhenThen = acceptanceCriteria.some(
      ac => ac.toLowerCase().includes('given') || ac.toLowerCase().includes('when')
    );

    return {
      controllability: Math.min(100, 40 + acCount * 10),
      observability: hasGivenWhenThen ? 80 : 50,
      isolability: Math.min(100, 50 + Math.random() * 30),
      separationOfConcerns: Math.min(100, 40 + Math.random() * 40),
      simplicity: Math.max(30, 100 - descLength / 20),
      stability: Math.min(100, 60 + Math.random() * 20),
      informationCapture: hasGivenWhenThen ? 85 : 45,
      automationSupport: hasGivenWhenThen ? 90 : 40,
      selfDocumenting: Math.min(100, 30 + descLength / 10),
      independence: Math.min(100, 50 + Math.random() * 30),
    };
  }

  private identifyTestabilityIssues(
    principles: TestabilityAssessment['principles']
  ): { blockers: string[]; recommendations: string[] } {
    const blockers: string[] = [];
    const recommendations: string[] = [];

    if (principles.controllability < 50) {
      blockers.push('Low controllability - test setup may be difficult');
    }
    if (principles.observability < 50) {
      blockers.push('Low observability - verifying outcomes may be challenging');
    }
    if (principles.automationSupport < 50) {
      recommendations.push('Add explicit acceptance criteria in Given/When/Then format');
    }
    if (principles.isolability < 60) {
      recommendations.push('Consider breaking into smaller, isolated components');
    }
    if (principles.simplicity < 40) {
      recommendations.push('Simplify requirements - current description is complex');
    }

    return { blockers, recommendations };
  }

  private analyzeRiskFactors(targetType: string, description: string): RiskFactor[] {
    const factors: RiskFactor[] = [];
    const descLower = description.toLowerCase();

    // Complexity risk
    if (description.length > 500) {
      factors.push({
        category: 'Complexity',
        description: 'High description complexity increases misunderstanding risk',
        likelihood: 4,
        impact: 3,
        score: 12,
      });
    }

    // Integration risk
    if (descLower.includes('api') || descLower.includes('integrate')) {
      factors.push({
        category: 'Integration',
        description: 'External dependencies may cause integration issues',
        likelihood: 3,
        impact: 4,
        score: 12,
      });
    }

    // Security risk
    if (descLower.includes('user') || descLower.includes('data') || descLower.includes('auth')) {
      factors.push({
        category: 'Security',
        description: 'User data handling requires security considerations',
        likelihood: 3,
        impact: 5,
        score: 15,
      });
    }

    // Performance risk
    if (descLower.includes('real-time') || descLower.includes('fast') || descLower.includes('scale')) {
      factors.push({
        category: 'Performance',
        description: 'Performance requirements may be challenging to meet',
        likelihood: 3,
        impact: 3,
        score: 9,
      });
    }

    // Default risk if none identified
    if (factors.length === 0) {
      factors.push({
        category: 'General',
        description: 'Standard development risks apply',
        likelihood: 2,
        impact: 2,
        score: 4,
      });
    }

    return factors;
  }

  private determineRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  private generateMitigations(factors: RiskFactor[]): string[] {
    const mitigations: string[] = [];

    for (const factor of factors) {
      switch (factor.category) {
        case 'Complexity':
          mitigations.push('Break down into smaller, more manageable stories');
          break;
        case 'Integration':
          mitigations.push('Define API contracts early with contract testing');
          break;
        case 'Security':
          mitigations.push('Conduct threat modeling and security review');
          break;
        case 'Performance':
          mitigations.push('Establish performance baselines and monitoring');
          break;
        default:
          mitigations.push('Apply standard QE practices');
      }
    }

    return mitigations;
  }

  private analyzeSTRIDEThreats(description: string, securityCritical: boolean): STRIDEThreat[] {
    const threats: STRIDEThreat[] = [];
    const descLower = description.toLowerCase();

    // Spoofing
    if (descLower.includes('auth') || descLower.includes('login') || descLower.includes('user')) {
      threats.push({
        category: 'spoofing',
        name: 'Identity Spoofing',
        description: 'Attacker may impersonate legitimate users',
        likelihood: securityCritical ? 4 : 2,
        impact: 4,
        mitigations: ['Implement MFA', 'Use strong session management'],
      });
    }

    // Tampering
    if (descLower.includes('data') || descLower.includes('update') || descLower.includes('edit')) {
      threats.push({
        category: 'tampering',
        name: 'Data Tampering',
        description: 'Data may be modified maliciously',
        likelihood: securityCritical ? 3 : 2,
        impact: 4,
        mitigations: ['Implement input validation', 'Use integrity checks'],
      });
    }

    // Information Disclosure
    if (descLower.includes('personal') || descLower.includes('sensitive') || descLower.includes('private')) {
      threats.push({
        category: 'informationDisclosure',
        name: 'Information Disclosure',
        description: 'Sensitive information may be exposed',
        likelihood: securityCritical ? 4 : 3,
        impact: 5,
        mitigations: ['Encrypt data at rest and in transit', 'Implement access controls'],
      });
    }

    // Default low-risk threat
    if (threats.length === 0 && !securityCritical) {
      threats.push({
        category: 'denial',
        name: 'Service Denial',
        description: 'Service availability may be impacted',
        likelihood: 2,
        impact: 3,
        mitigations: ['Implement rate limiting', 'Add monitoring and alerts'],
      });
    }

    return threats;
  }

  private generateSecurityRecommendations(threats: STRIDEThreat[]): string[] {
    const recommendations = new Set<string>();

    for (const threat of threats) {
      for (const mitigation of threat.mitigations) {
        recommendations.add(mitigation);
      }
    }

    return Array.from(recommendations);
  }

  private generateSWOTInsights(
    qualityCriteria: QualityCriterion[],
    testability: TestabilityAssessment,
    risk: RiskAssessment
  ): IdeationReport['insights'] {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const opportunities: string[] = [];
    const threats: string[] = [];

    // Analyze strengths
    const highTestability = qualityCriteria.filter(c => c.testabilityScore >= 70);
    if (highTestability.length > 5) {
      strengths.push(`${highTestability.length}/10 quality categories have high testability`);
    }
    if (testability.overallScore >= 70) {
      strengths.push('Overall testability score is good');
    }
    if (risk.overallRisk === 'low') {
      strengths.push('Risk profile is manageable');
    }

    // Analyze weaknesses
    const lowTestability = qualityCriteria.filter(c => c.testabilityScore < 50);
    if (lowTestability.length > 0) {
      weaknesses.push(`${lowTestability.length} quality categories need more definition`);
    }
    if (testability.blockers.length > 0) {
      weaknesses.push(...testability.blockers.slice(0, 2));
    }

    // Analyze opportunities
    if (testability.principles.automationSupport >= 70) {
      opportunities.push('High automation potential for test coverage');
    }
    opportunities.push('Early quality assessment enables shift-left testing');

    // Analyze threats
    if (risk.factors.some(f => f.score >= 15)) {
      threats.push('High-severity risks require immediate attention');
    }
    threats.push(...risk.factors.filter(f => f.score >= 10).map(f => f.description).slice(0, 2));

    return { strengths, weaknesses, opportunities, threats };
  }

  private generateRecommendations(
    qualityCriteria: QualityCriterion[],
    testability: TestabilityAssessment,
    risk: RiskAssessment,
    threatModel?: ThreatModel
  ): IdeationReport['recommendations'] {
    const recommendations: IdeationReport['recommendations'] = [];

    // Testability recommendations
    if (testability.overallScore < 60) {
      recommendations.push({
        priority: 'high',
        category: 'Testability',
        description: 'Improve acceptance criteria with specific, measurable outcomes',
        effort: 'low',
      });
    }

    // Risk recommendations
    for (const factor of risk.factors.filter(f => f.score >= 12)) {
      recommendations.push({
        priority: factor.score >= 15 ? 'critical' : 'high',
        category: 'Risk Mitigation',
        description: risk.mitigations[0] || `Address ${factor.category} risk`,
        effort: 'medium',
      });
    }

    // Security recommendations
    if (threatModel && threatModel.threats.length > 0) {
      recommendations.push({
        priority: threatModel.overallRisk === 'critical' ? 'critical' : 'high',
        category: 'Security',
        description: threatModel.recommendations[0] || 'Implement security controls',
        effort: 'high',
      });
    }

    // Quality recommendations
    const lowCategories = qualityCriteria.filter(c => c.testabilityScore < 50);
    if (lowCategories.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'Quality Definition',
        description: `Define clearer criteria for: ${lowCategories.map(c => c.category).join(', ')}`,
        effort: 'low',
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  private generateTestStrategy(
    qualityCriteria: QualityCriterion[],
    testability: TestabilityAssessment,
    risk: RiskAssessment
  ): IdeationReport['testStrategy'] {
    // Determine approach based on risk and testability
    let approach = 'Standard test pyramid with unit, integration, and E2E tests';
    if (risk.overallRisk === 'high' || risk.overallRisk === 'critical') {
      approach = 'Risk-based testing with enhanced coverage for high-risk areas';
    }
    if (testability.overallScore >= 80) {
      approach += ' with high automation potential';
    }

    // Coverage areas from quality criteria
    const coverage = qualityCriteria
      .filter(c => c.weight >= 5)
      .flatMap(c => c.testIdeas.slice(0, 2));

    // Risk areas
    const riskAreas = risk.factors
      .filter(f => f.score >= 9)
      .map(f => `${f.category}: ${f.description}`);

    // Estimate effort based on complexity
    const totalWeight = qualityCriteria.reduce((sum, c) => sum + c.weight, 0);
    let estimatedEffort = 'Medium (3-5 days)';
    if (totalWeight > 60) {
      estimatedEffort = 'High (1-2 weeks)';
    } else if (totalWeight < 40) {
      estimatedEffort = 'Low (1-2 days)';
    }

    return {
      approach,
      coverage: [...new Set(coverage)].slice(0, 8),
      riskAreas: riskAreas.slice(0, 4),
      estimatedEffort,
    };
  }

  private identifyBlockers(
    testability: TestabilityAssessment,
    risk: RiskAssessment,
    threatModel?: ThreatModel
  ): string[] {
    const blockers: string[] = [];

    // Testability blockers
    if (testability.overallScore < 40) {
      blockers.push('Testability score too low - cannot verify acceptance criteria');
    }
    blockers.push(...testability.blockers);

    // Risk blockers
    if (risk.overallRisk === 'critical') {
      blockers.push('Critical risk level requires risk mitigation before development');
    }

    // Security blockers
    if (threatModel && threatModel.overallRisk === 'critical') {
      blockers.push('Critical security threats must be addressed before development');
    }

    return blockers;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createQCSDIdeationPlugin(memory: MemoryBackend): QCSDIdeationPlugin {
  return new QCSDIdeationPlugin(memory);
}
