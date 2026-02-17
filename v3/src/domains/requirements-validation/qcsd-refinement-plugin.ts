/**
 * Agentic QE v3 - QCSD Refinement Swarm Plugin
 *
 * Implements the QCSD (Quality Conscious Software Delivery) Refinement phase
 * using SFDIPOT (San Francisco Depot) 7-factor test analysis framework
 * and BDD scenario generation for sprint-level story refinement.
 *
 * This plugin registers workflow actions that enable the qcsd-refinement-swarm
 * workflow to orchestrate multi-agent quality assessment during Sprint Refinement.
 *
 * SFDIPOT Quality Factors:
 * 1. Structure - Architecture, components, modules, layers, boundaries
 * 2. Function - Features, workflows, business rules, calculations, transformations
 * 3. Data - Input, output, storage, flow, formats, validation, migration
 * 4. Interfaces - APIs, UI, integration points, protocols, contracts
 * 5. Platform - OS, browsers, devices, infrastructure, cloud, containers
 * 6. Operations - Deployment, monitoring, logging, backup, scaling, maintenance
 * 7. Time - Scheduling, timeouts, concurrency, ordering, SLAs, TTL
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err, DomainName } from '../../shared/types/index.js';
import { MemoryBackend } from '../../kernel/interfaces.js';
import type { WorkflowOrchestrator, WorkflowContext } from '../../../src/coordination/workflow-orchestrator.js';
import { toError } from '../../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

/**
 * SFDIPOT Factor identifier
 */
export type SFDIPOTFactor = 'structure' | 'function' | 'data' | 'interfaces' | 'platform' | 'operations' | 'time';

/**
 * Subcategory analysis within a SFDIPOT factor
 */
export interface SubcategoryAnalysis {
  name: string;
  description: string;
  relevance: number; // 0-100
  testIdeas: string[];
}

/**
 * Analysis of a single SFDIPOT factor with subcategories
 */
export interface SFDIPOTFactorAnalysis {
  factor: SFDIPOTFactor;
  subcategories: SubcategoryAnalysis[];
  weight: number;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  testIdeas: string[];
}

/**
 * Complete SFDIPOT assessment across all 7 factors
 */
export interface SFDIPOTAssessment {
  id: string;
  targetId: string;
  factors: SFDIPOTFactorAnalysis[];
  overallScore: number;
  testIdeas: string[];
  clarifyingQuestions: string[];
}

/**
 * BDD Scenario in Gherkin format
 */
export interface BDDScenario {
  name: string;
  given: string[];
  when: string[];
  then: string[];
  examples?: Record<string, unknown>[];
  tags: string[];
  type: 'happy_path' | 'error' | 'boundary' | 'security';
}

/**
 * BDD Feature grouping scenarios
 */
export interface BDDFeature {
  name: string;
  description: string;
  scenarios: BDDScenario[];
  tags: string[];
}

/**
 * Complete BDD scenario set for a target
 */
export interface BDDScenarioSet {
  id: string;
  targetId: string;
  features: BDDFeature[];
  totalScenarios: number;
  coverage: { happyPath: number; errorPath: number; boundary: number; security: number };
}

/**
 * Refinement Report (aggregate output)
 */
export interface RefinementReport {
  id: string;
  timestamp: string;
  targetId: string;
  targetType: 'story' | 'feature' | 'epic';

  // SFDIPOT Analysis
  sfdipot: SFDIPOTAssessment;

  // BDD Scenarios
  bddScenarios: BDDScenarioSet;

  // Requirements Validation
  requirements: {
    valid: boolean;
    investScore: number;
    completeness: number;
    gaps: string[];
  };

  // Contract Validation (optional)
  contracts?: {
    valid: boolean;
    breakingChanges: string[];
    recommendations: string[];
  };

  // Impact Analysis (optional)
  impact?: {
    blastRadius: number;
    affectedServices: string[];
    testSelection: string[];
  };

  // Dependency Mapping (optional)
  dependencies?: {
    couplingScore: number;
    circularDeps: string[];
    metrics: Record<string, number>;
  };

  // Decision
  recommendation: 'READY' | 'CONDITIONAL' | 'NOT-READY';
  blockers: string[];
  testIdeas: string[];
  crossPhaseInsights: string[];
}

// ============================================================================
// QCSD Refinement Plugin
// ============================================================================

export class QCSDRefinementPlugin {
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
      throw new Error('QCSDRefinementPlugin must be initialized before registering workflow actions');
    }

    // Register analyzeSFDIPOT action
    orchestrator.registerAction(
      'requirements-validation',
      'analyzeSFDIPOT',
      this.analyzeSFDIPOT.bind(this)
    );

    // Register generateBDDScenarios action
    orchestrator.registerAction(
      'requirements-validation',
      'generateBDDScenarios',
      this.generateBDDScenarios.bind(this)
    );

    // Register validateRefinementRequirements action
    orchestrator.registerAction(
      'requirements-validation',
      'validateRefinementRequirements',
      this.validateRefinementRequirements.bind(this)
    );

    // Register mapDependencies action
    orchestrator.registerAction(
      'code-intelligence',
      'mapDependencies',
      this.mapDependencies.bind(this)
    );

    // Register validateContracts action
    orchestrator.registerAction(
      'contract-testing',
      'validateContracts',
      this.validateContracts.bind(this)
    );

    // Register analyzeImpact action
    orchestrator.registerAction(
      'code-intelligence',
      'analyzeImpact',
      this.analyzeImpact.bind(this)
    );

    // Register rewriteTestIdeas action
    orchestrator.registerAction(
      'test-generation',
      'rewriteTestIdeas',
      this.rewriteTestIdeas.bind(this)
    );

    // Register generateRefinementReport action
    orchestrator.registerAction(
      'requirements-validation',
      'generateRefinementReport',
      this.generateRefinementReport.bind(this)
    );

    // Register storeRefinementLearnings action
    orchestrator.registerAction(
      'learning-optimization',
      'storeRefinementLearnings',
      this.storeRefinementLearnings.bind(this)
    );

    // Register consumeCrossPhaseSignals action
    orchestrator.registerAction(
      'requirements-validation',
      'consumeCrossPhaseSignals',
      this.consumeCrossPhaseSignals.bind(this)
    );
  }

  // ============================================================================
  // Workflow Actions
  // ============================================================================

  /**
   * Analyze all 7 SFDIPOT factors with subcategories
   * Each factor is scored based on keyword relevance in description and AC
   */
  private async analyzeSFDIPOT(
    input: Record<string, unknown>,
    context: WorkflowContext
  ): Promise<Result<SFDIPOTAssessment, Error>> {
    try {
      const targetId = input.targetId as string || context.input.targetId as string;
      const description = input.description as string || context.input.description as string || '';
      const acceptanceCriteria = input.acceptanceCriteria as string[] || context.input.acceptanceCriteria as string[] || [];

      const descLower = description.toLowerCase();
      const acJoined = acceptanceCriteria.join(' ').toLowerCase();
      const combinedText = `${descLower} ${acJoined}`;

      // Analyze all 7 SFDIPOT factors
      const factors: SFDIPOTFactorAnalysis[] = this.analyzeSFDIPOTFactors(combinedText);

      // Calculate overall score as weighted average
      const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
      const overallScore = totalWeight > 0
        ? Math.round(
            factors.reduce((sum, f) => {
              const avgRelevance = f.subcategories.length > 0
                ? f.subcategories.reduce((s, sc) => s + sc.relevance, 0) / f.subcategories.length
                : 0;
              return sum + (avgRelevance * f.weight) / totalWeight;
            }, 0)
          )
        : 0;

      // Aggregate test ideas from all factors
      const testIdeas = factors.flatMap(f => f.testIdeas);

      // Generate clarifying questions for low-relevance factors
      const clarifyingQuestions = this.generateClarifyingQuestions(factors);

      const assessment: SFDIPOTAssessment = {
        id: uuidv4(),
        targetId,
        factors,
        overallScore,
        testIdeas,
        clarifyingQuestions,
      };

      // Store intermediate result
      await this.memory.set(
        `qcsd-refinement:sfdipot:${targetId}`,
        assessment,
        { namespace: 'qcsd-refinement', ttl: 3600 }
      );

      return ok(assessment);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Generate BDD Given/When/Then scenarios from description and acceptance criteria
   * Creates scenarios for happy_path, error, boundary, and security types
   */
  private async generateBDDScenarios(
    input: Record<string, unknown>,
    context: WorkflowContext
  ): Promise<Result<BDDScenarioSet, Error>> {
    try {
      const targetId = input.targetId as string || context.input.targetId as string;
      const targetType = input.targetType as string || context.input.targetType as string || 'story';
      const description = input.description as string || context.input.description as string || '';
      const acceptanceCriteria = input.acceptanceCriteria as string[] || context.input.acceptanceCriteria as string[] || [];

      const descLower = description.toLowerCase();

      // Generate features and scenarios
      const features: BDDFeature[] = [];

      // Feature 1: Core Functionality (happy path scenarios from AC)
      const coreFeature = this.generateCoreFeature(targetId, description, acceptanceCriteria);
      features.push(coreFeature);

      // Feature 2: Error Handling
      const errorFeature = this.generateErrorFeature(targetId, description, acceptanceCriteria);
      features.push(errorFeature);

      // Feature 3: Boundary Conditions
      const boundaryFeature = this.generateBoundaryFeature(targetId, description, acceptanceCriteria);
      features.push(boundaryFeature);

      // Feature 4: Security (if relevant keywords detected)
      if (this.hasSecurityRelevance(descLower)) {
        const securityFeature = this.generateSecurityFeature(targetId, description);
        features.push(securityFeature);
      }

      // Calculate coverage breakdown
      const allScenarios = features.flatMap(f => f.scenarios);
      const totalScenarios = allScenarios.length;
      const coverage = {
        happyPath: allScenarios.filter(s => s.type === 'happy_path').length,
        errorPath: allScenarios.filter(s => s.type === 'error').length,
        boundary: allScenarios.filter(s => s.type === 'boundary').length,
        security: allScenarios.filter(s => s.type === 'security').length,
      };

      const scenarioSet: BDDScenarioSet = {
        id: uuidv4(),
        targetId,
        features,
        totalScenarios,
        coverage,
      };

      // Store intermediate result
      await this.memory.set(
        `qcsd-refinement:bdd-scenarios:${targetId}`,
        scenarioSet,
        { namespace: 'qcsd-refinement', ttl: 3600 }
      );

      return ok(scenarioSet);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Validate requirements using INVEST criteria with enhanced completeness scoring
   */
  private async validateRefinementRequirements(
    input: Record<string, unknown>,
    context: WorkflowContext
  ): Promise<Result<{ valid: boolean; investScore: number; completeness: number; gaps: string[]; suggestions: string[] }, Error>> {
    try {
      const targetId = input.targetId as string || context.input.targetId as string;
      const description = input.description as string || context.input.description as string || '';
      const acceptanceCriteria = input.acceptanceCriteria as string[] || context.input.acceptanceCriteria as string[] || [];

      const gaps: string[] = [];
      const suggestions: string[] = [];

      // INVEST assessment
      const investScores = this.assessINVESTCriteria(description, acceptanceCriteria);
      const investScore = Math.round(
        Object.values(investScores).reduce((sum, s) => sum + s, 0) / 6
      );

      // Completeness assessment
      const completeness = this.assessCompleteness(description, acceptanceCriteria);

      // Identify gaps
      if (description.length < 50) {
        gaps.push('Description is too short (< 50 characters)');
        suggestions.push('Add more context about the business value and user need');
      }

      if (acceptanceCriteria.length === 0) {
        gaps.push('No acceptance criteria defined');
        suggestions.push('Add Given/When/Then acceptance criteria for each scenario');
      } else if (acceptanceCriteria.length < 3) {
        gaps.push('Too few acceptance criteria (< 3)');
        suggestions.push('Consider adding criteria for happy path, error cases, and edge cases');
      }

      // Check for ambiguous language
      const ambiguousTerms = ['should', 'could', 'might', 'maybe', 'possibly', 'etc', 'and so on', 'appropriate', 'reasonable'];
      for (const term of ambiguousTerms) {
        if (description.toLowerCase().includes(term)) {
          gaps.push(`Ambiguous term detected: "${term}"`);
          suggestions.push(`Replace "${term}" with specific, measurable criteria`);
        }
      }

      // Check for missing non-functional requirements
      const nfrKeywords = ['performance', 'security', 'scalability', 'availability', 'reliability'];
      const hasNFR = nfrKeywords.some(kw => description.toLowerCase().includes(kw));
      if (!hasNFR) {
        gaps.push('No non-functional requirements specified');
        suggestions.push('Consider adding performance, security, or reliability requirements');
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

      // INVEST detail gaps
      if (investScores.independent < 60) {
        gaps.push('Story has implicit dependencies on other stories');
        suggestions.push('Make dependencies explicit or split into independent stories');
      }
      if (investScores.negotiable < 60) {
        gaps.push('Story is too prescriptive about implementation details');
        suggestions.push('Focus on the what and why, not the how');
      }
      if (investScores.valuable < 60) {
        gaps.push('Business value is not clearly stated');
        suggestions.push('Add explicit business value or user benefit statement');
      }
      if (investScores.estimable < 60) {
        gaps.push('Story is too vague to estimate');
        suggestions.push('Add more detail about scope and constraints');
      }
      if (investScores.small < 60) {
        gaps.push('Story may be too large for a single sprint');
        suggestions.push('Consider splitting into smaller, independently deliverable stories');
      }
      if (investScores.testable < 60) {
        gaps.push('Story lacks clear testability criteria');
        suggestions.push('Add explicit acceptance criteria with measurable outcomes');
      }

      const valid = gaps.length === 0;

      // Store intermediate result
      await this.memory.set(
        `qcsd-refinement:requirements:${targetId}`,
        { valid, investScore, completeness, gaps, suggestions, timestamp: new Date().toISOString() },
        { namespace: 'qcsd-refinement', ttl: 3600 }
      );

      return ok({ valid, investScore, completeness, gaps, suggestions });
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Map dependencies with coupling metrics (Ca, Ce, I)
   * Ca = Afferent Coupling (incoming dependencies)
   * Ce = Efferent Coupling (outgoing dependencies)
   * I  = Instability Index = Ce / (Ca + Ce)
   */
  private async mapDependencies(
    input: Record<string, unknown>,
    context: WorkflowContext
  ): Promise<Result<{ couplingScore: number; circularDeps: string[]; metrics: Record<string, number>; recommendations: string[] }, Error>> {
    try {
      const targetId = input.targetId as string || context.input.targetId as string;
      const description = input.description as string || context.input.description as string || '';
      const acceptanceCriteria = input.acceptanceCriteria as string[] || context.input.acceptanceCriteria as string[] || [];

      const descLower = description.toLowerCase();
      const acJoined = acceptanceCriteria.join(' ').toLowerCase();
      const combinedText = `${descLower} ${acJoined}`;

      // Detect dependency indicators
      const dependencyKeywords = [
        'api', 'service', 'database', 'queue', 'cache', 'external',
        'third-party', 'upstream', 'downstream', 'depends on', 'requires',
        'integration', 'webhook', 'event', 'message', 'bus', 'kafka',
        'rabbitmq', 'redis', 'postgres', 'mysql', 'mongodb', 'elasticsearch',
      ];

      const detectedDependencies = dependencyKeywords.filter(kw => combinedText.includes(kw));

      // Calculate afferent coupling (Ca) - things that depend on this
      const incomingKeywords = ['consumed by', 'used by', 'called by', 'subscribed', 'listener', 'handler', 'endpoint', 'public api'];
      const ca = incomingKeywords.filter(kw => combinedText.includes(kw)).length + 1;

      // Calculate efferent coupling (Ce) - things this depends on
      const outgoingKeywords = ['calls', 'sends', 'publishes', 'connects to', 'fetches', 'reads from', 'writes to', 'imports', 'requires'];
      const ce = outgoingKeywords.filter(kw => combinedText.includes(kw)).length + detectedDependencies.length;

      // Instability Index: I = Ce / (Ca + Ce)
      const instabilityIndex = (ca + ce) > 0 ? ce / (ca + ce) : 0.5;

      // Overall coupling score (0-100, lower is better)
      const couplingScore = Math.round(Math.min(100, (detectedDependencies.length * 12) + (instabilityIndex * 40)));

      // Detect potential circular dependencies
      const circularDeps: string[] = [];
      const circularPatterns = [
        { a: 'api', b: 'callback', msg: 'API call with callback pattern may create circular dependency' },
        { a: 'event', b: 'handler', msg: 'Event-handler pattern may create circular dependency if handler emits back' },
        { a: 'service', b: 'service', msg: 'Service-to-service calls may create circular dependency chain' },
        { a: 'database', b: 'trigger', msg: 'Database trigger may create circular update loop' },
        { a: 'cache', b: 'invalidat', msg: 'Cache invalidation chain may create circular dependency' },
      ];

      for (const pattern of circularPatterns) {
        if (combinedText.includes(pattern.a) && combinedText.includes(pattern.b)) {
          circularDeps.push(pattern.msg);
        }
      }

      // Metrics
      const metrics: Record<string, number> = {
        afferentCoupling: ca,
        efferentCoupling: ce,
        instabilityIndex: Math.round(instabilityIndex * 100) / 100,
        dependencyCount: detectedDependencies.length,
        circularRiskCount: circularDeps.length,
        couplingScore,
      };

      // Generate recommendations
      const recommendations: string[] = [];
      if (instabilityIndex > 0.7) {
        recommendations.push('High instability index - component depends on many external services. Consider introducing abstraction layers.');
      }
      if (instabilityIndex < 0.3 && ca > 3) {
        recommendations.push('Low instability with high afferent coupling - many components depend on this. Changes will have wide impact. Ensure thorough regression testing.');
      }
      if (detectedDependencies.length > 5) {
        recommendations.push('High number of dependencies detected. Consider applying Interface Segregation Principle to reduce coupling.');
      }
      if (circularDeps.length > 0) {
        recommendations.push('Potential circular dependencies detected. Introduce event-driven or mediator patterns to break cycles.');
      }
      if (ce > 5) {
        recommendations.push('High efferent coupling. Consider Dependency Inversion to depend on abstractions rather than concretions.');
      }

      if (recommendations.length === 0) {
        recommendations.push('Dependency profile appears manageable. Standard integration testing recommended.');
      }

      // Store intermediate result
      await this.memory.set(
        `qcsd-refinement:dependencies:${targetId}`,
        { couplingScore, circularDeps, metrics, recommendations, timestamp: new Date().toISOString() },
        { namespace: 'qcsd-refinement', ttl: 3600 }
      );

      return ok({ couplingScore, circularDeps, metrics, recommendations });
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Validate API contracts for breaking changes and consumer-driven patterns
   */
  private async validateContracts(
    input: Record<string, unknown>,
    context: WorkflowContext
  ): Promise<Result<{ valid: boolean; breakingChanges: string[]; recommendations: string[] }, Error>> {
    try {
      const targetId = input.targetId as string || context.input.targetId as string;
      const description = input.description as string || context.input.description as string || '';
      const acceptanceCriteria = input.acceptanceCriteria as string[] || context.input.acceptanceCriteria as string[] || [];

      const descLower = description.toLowerCase();
      const acJoined = acceptanceCriteria.join(' ').toLowerCase();
      const combinedText = `${descLower} ${acJoined}`;

      const breakingChanges: string[] = [];
      const recommendations: string[] = [];

      // Detect potential breaking change patterns
      const breakingPatterns: Array<{ pattern: RegExp; change: string }> = [
        { pattern: /remov(e|ing|ed)\s+(field|property|column|endpoint|parameter)/i, change: 'Removing a field/endpoint is a breaking change for consumers' },
        { pattern: /renam(e|ing|ed)\s+(field|property|column|endpoint|parameter)/i, change: 'Renaming a field/endpoint breaks existing consumers' },
        { pattern: /chang(e|ing|ed)\s+(type|format|schema|structure)/i, change: 'Changing data types or schema structure breaks serialization contracts' },
        { pattern: /requir(e|ing|ed)\s+new\s+(field|parameter|header)/i, change: 'Making a new field required breaks existing consumers' },
        { pattern: /deprecat(e|ing|ed)/i, change: 'Deprecation detected - ensure backward compatibility period is defined' },
        { pattern: /migrat(e|ing|ion)/i, change: 'Data migration may affect API response structure' },
        { pattern: /v[0-9]+\s+to\s+v[0-9]+/i, change: 'Version migration detected - ensure both versions are supported during transition' },
      ];

      for (const { pattern, change } of breakingPatterns) {
        if (pattern.test(combinedText)) {
          breakingChanges.push(change);
        }
      }

      // Contract validation recommendations
      if (combinedText.includes('api') || combinedText.includes('endpoint') || combinedText.includes('service')) {
        recommendations.push('Implement consumer-driven contract tests (Pact or similar)');
        recommendations.push('Ensure API versioning strategy is documented');
      }

      if (combinedText.includes('event') || combinedText.includes('message') || combinedText.includes('queue')) {
        recommendations.push('Validate event schema compatibility with Schema Registry');
        recommendations.push('Ensure event versioning follows Avro/Protobuf best practices');
      }

      if (combinedText.includes('graphql')) {
        recommendations.push('Use GraphQL schema diff tools to detect breaking changes');
        recommendations.push('Implement @deprecated directive before removing fields');
      }

      if (combinedText.includes('rest') || combinedText.includes('http')) {
        recommendations.push('Use OpenAPI spec diff to validate backward compatibility');
        recommendations.push('Implement content negotiation for format changes');
      }

      if (breakingChanges.length > 0) {
        recommendations.push('Create migration guide for consumers before deployment');
        recommendations.push('Consider feature flags to gradually roll out contract changes');
      }

      if (recommendations.length === 0) {
        recommendations.push('No API/contract concerns detected. Standard testing applies.');
      }

      const valid = breakingChanges.length === 0;

      // Store intermediate result
      await this.memory.set(
        `qcsd-refinement:contracts:${targetId}`,
        { valid, breakingChanges, recommendations, timestamp: new Date().toISOString() },
        { namespace: 'qcsd-refinement', ttl: 3600 }
      );

      return ok({ valid, breakingChanges, recommendations });
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Analyze blast radius and impact of changes
   * Identifies affected services and recommends test selection
   */
  private async analyzeImpact(
    input: Record<string, unknown>,
    context: WorkflowContext
  ): Promise<Result<{ blastRadius: number; affectedServices: string[]; testSelection: string[] }, Error>> {
    try {
      const targetId = input.targetId as string || context.input.targetId as string;
      const description = input.description as string || context.input.description as string || '';
      const acceptanceCriteria = input.acceptanceCriteria as string[] || context.input.acceptanceCriteria as string[] || [];

      const descLower = description.toLowerCase();
      const acJoined = acceptanceCriteria.join(' ').toLowerCase();
      const combinedText = `${descLower} ${acJoined}`;

      // Detect affected services from keywords
      const servicePatterns: Array<{ pattern: RegExp; service: string }> = [
        { pattern: /auth(entication|orization)?/i, service: 'Authentication Service' },
        { pattern: /user\s*(service|management|profile)/i, service: 'User Service' },
        { pattern: /payment|billing|invoice/i, service: 'Payment Service' },
        { pattern: /notification|email|sms|push/i, service: 'Notification Service' },
        { pattern: /search|elastic|solr/i, service: 'Search Service' },
        { pattern: /inventory|stock|warehouse/i, service: 'Inventory Service' },
        { pattern: /order|cart|checkout/i, service: 'Order Service' },
        { pattern: /catalog|product/i, service: 'Catalog Service' },
        { pattern: /analytics|tracking|metric/i, service: 'Analytics Service' },
        { pattern: /cache|redis|memcache/i, service: 'Cache Layer' },
        { pattern: /database|db|storage|persist/i, service: 'Data Layer' },
        { pattern: /gateway|proxy|load.?balanc/i, service: 'API Gateway' },
        { pattern: /queue|kafka|rabbit|message/i, service: 'Message Queue' },
        { pattern: /cdn|static|asset/i, service: 'CDN/Static Assets' },
        { pattern: /log(ging)?|monitor(ing)?|observ/i, service: 'Observability Stack' },
      ];

      const affectedServices: string[] = [];
      for (const { pattern, service } of servicePatterns) {
        if (pattern.test(combinedText)) {
          affectedServices.push(service);
        }
      }

      if (affectedServices.length === 0) {
        affectedServices.push('Primary Application Service');
      }

      // Calculate blast radius (0-100)
      // Based on number of affected services and scope indicators
      const scopeIndicators = [
        { keyword: 'all', weight: 20 },
        { keyword: 'every', weight: 15 },
        { keyword: 'global', weight: 20 },
        { keyword: 'cross-cutting', weight: 25 },
        { keyword: 'shared', weight: 15 },
        { keyword: 'common', weight: 10 },
        { keyword: 'core', weight: 15 },
        { keyword: 'foundation', weight: 20 },
        { keyword: 'infrastructure', weight: 20 },
        { keyword: 'platform', weight: 15 },
      ];

      let scopeWeight = 0;
      for (const { keyword, weight } of scopeIndicators) {
        if (combinedText.includes(keyword)) {
          scopeWeight += weight;
        }
      }

      const blastRadius = Math.min(100, Math.round(
        (affectedServices.length * 8) + scopeWeight
      ));

      // Recommend test selection based on blast radius and affected services
      const testSelection: string[] = [];

      if (blastRadius >= 70) {
        testSelection.push('Full regression test suite');
        testSelection.push('Cross-service integration tests');
        testSelection.push('End-to-end smoke tests for all critical paths');
        testSelection.push('Performance baseline comparison');
      } else if (blastRadius >= 40) {
        testSelection.push('Targeted integration tests for affected services');
        testSelection.push('Smoke tests for adjacent services');
        testSelection.push('Contract tests for changed interfaces');
      } else {
        testSelection.push('Unit tests for changed components');
        testSelection.push('Integration tests for directly affected service');
      }

      // Service-specific test recommendations
      for (const service of affectedServices) {
        switch (service) {
          case 'Authentication Service':
            testSelection.push('Auth flow regression tests (login, logout, token refresh, MFA)');
            break;
          case 'Payment Service':
            testSelection.push('Payment processing tests with sandbox transactions');
            break;
          case 'Data Layer':
            testSelection.push('Database migration rollback tests');
            break;
          case 'Cache Layer':
            testSelection.push('Cache invalidation and consistency tests');
            break;
          case 'Message Queue':
            testSelection.push('Message delivery and ordering tests');
            break;
        }
      }

      // Deduplicate test selection
      const uniqueTestSelection = [...new Set(testSelection)];

      // Store intermediate result
      await this.memory.set(
        `qcsd-refinement:impact:${targetId}`,
        { blastRadius, affectedServices, testSelection: uniqueTestSelection, timestamp: new Date().toISOString() },
        { namespace: 'qcsd-refinement', ttl: 3600 }
      );

      return ok({ blastRadius, affectedServices, testSelection: uniqueTestSelection });
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Rewrite test ideas: transform passive "Verify that..." to active verbs
   * Pattern: "Verify" -> "Confirm", "Check" -> "Validate", "Test" -> "Execute", etc.
   */
  private async rewriteTestIdeas(
    input: Record<string, unknown>,
    context: WorkflowContext
  ): Promise<Result<{ original: string[]; rewritten: string[]; transformCount: number }, Error>> {
    try {
      const targetId = input.targetId as string || context.input.targetId as string;
      const testIdeas = input.testIdeas as string[] || context.input.testIdeas as string[] || [];

      // Also pull test ideas from SFDIPOT if available
      const sfdipotData = await this.memory.get<SFDIPOTAssessment>(
        `qcsd-refinement:sfdipot:${targetId}`
      );
      const allTestIdeas = [...testIdeas];
      if (sfdipotData && sfdipotData.testIdeas) {
        allTestIdeas.push(...sfdipotData.testIdeas);
      }

      // Deduplicate
      const uniqueIdeas = [...new Set(allTestIdeas)];

      // Transformation rules: passive -> active
      const transformations: Array<{ pattern: RegExp; replacement: string }> = [
        { pattern: /^Verify\s+that\s+/i, replacement: 'Confirm ' },
        { pattern: /^Verify\s+/i, replacement: 'Confirm ' },
        { pattern: /^Check\s+that\s+/i, replacement: 'Validate ' },
        { pattern: /^Check\s+if\s+/i, replacement: 'Validate whether ' },
        { pattern: /^Check\s+/i, replacement: 'Validate ' },
        { pattern: /^Test\s+that\s+/i, replacement: 'Execute test confirming ' },
        { pattern: /^Test\s+if\s+/i, replacement: 'Execute test validating whether ' },
        { pattern: /^Test\s+/i, replacement: 'Execute ' },
        { pattern: /^Ensure\s+that\s+/i, replacement: 'Assert ' },
        { pattern: /^Ensure\s+/i, replacement: 'Assert ' },
        { pattern: /^Make\s+sure\s+that\s+/i, replacement: 'Assert ' },
        { pattern: /^Make\s+sure\s+/i, replacement: 'Assert ' },
        { pattern: /^Confirm\s+that\s+the\s+system\s+/i, replacement: 'Demonstrate the system ' },
        { pattern: /^Validate\s+that\s+/i, replacement: 'Prove ' },
        { pattern: /^See\s+if\s+/i, replacement: 'Determine whether ' },
        { pattern: /^Try\s+to\s+/i, replacement: 'Attempt to ' },
      ];

      let transformCount = 0;
      const rewritten = uniqueIdeas.map(idea => {
        let transformed = idea;
        for (const { pattern, replacement } of transformations) {
          if (pattern.test(transformed)) {
            transformed = transformed.replace(pattern, replacement);
            transformCount++;
            break; // Apply only the first matching transformation
          }
        }
        // Ensure first letter is capitalized
        transformed = transformed.charAt(0).toUpperCase() + transformed.slice(1);
        return transformed;
      });

      // Store intermediate result
      await this.memory.set(
        `qcsd-refinement:test-ideas:${targetId}`,
        { original: uniqueIdeas, rewritten, transformCount, timestamp: new Date().toISOString() },
        { namespace: 'qcsd-refinement', ttl: 3600 }
      );

      return ok({ original: uniqueIdeas, rewritten, transformCount });
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Generate aggregated refinement report from all intermediate results
   * Applies READY/CONDITIONAL/NOT-READY decision logic
   */
  private async generateRefinementReport(
    input: Record<string, unknown>,
    context: WorkflowContext
  ): Promise<Result<RefinementReport, Error>> {
    try {
      const targetId = input.targetId as string || context.input.targetId as string;
      const targetType = (input.targetType as string || context.input.targetType as string || 'story') as RefinementReport['targetType'];

      // Retrieve all intermediate results from memory
      const sfdipotData = await this.memory.get<SFDIPOTAssessment>(
        `qcsd-refinement:sfdipot:${targetId}`
      );
      const bddData = await this.memory.get<BDDScenarioSet>(
        `qcsd-refinement:bdd-scenarios:${targetId}`
      );
      const requirementsData = await this.memory.get<{ valid: boolean; investScore: number; completeness: number; gaps: string[] }>(
        `qcsd-refinement:requirements:${targetId}`
      );
      const contractsData = await this.memory.get<{ valid: boolean; breakingChanges: string[]; recommendations: string[] }>(
        `qcsd-refinement:contracts:${targetId}`
      );
      const impactData = await this.memory.get<{ blastRadius: number; affectedServices: string[]; testSelection: string[] }>(
        `qcsd-refinement:impact:${targetId}`
      );
      const dependenciesData = await this.memory.get<{ couplingScore: number; circularDeps: string[]; metrics: Record<string, number> }>(
        `qcsd-refinement:dependencies:${targetId}`
      );
      const testIdeasData = await this.memory.get<{ rewritten: string[] }>(
        `qcsd-refinement:test-ideas:${targetId}`
      );
      const crossPhaseData = await this.memory.get<{ insights: string[] }>(
        `qcsd-refinement:cross-phase:${targetId}`
      );

      // Use context results as fallback if memory doesn't have them
      const results = context.results as Record<string, Record<string, unknown>>;

      // Build SFDIPOT assessment (from memory or context)
      const sfdipot: SFDIPOTAssessment = sfdipotData || (results['sfdipot-analysis'] as unknown as SFDIPOTAssessment) || {
        id: uuidv4(),
        targetId,
        factors: [],
        overallScore: 0,
        testIdeas: [],
        clarifyingQuestions: [],
      };

      // Build BDD scenarios (from memory or context)
      const bddScenarios: BDDScenarioSet = bddData || (results['bdd-scenario-generation'] as unknown as BDDScenarioSet) || {
        id: uuidv4(),
        targetId,
        features: [],
        totalScenarios: 0,
        coverage: { happyPath: 0, errorPath: 0, boundary: 0, security: 0 },
      };

      // Build requirements validation
      const requirements = requirementsData || (results['requirements-validation'] as unknown as { valid: boolean; investScore: number; completeness: number; gaps: string[] }) || {
        valid: false,
        investScore: 0,
        completeness: 0,
        gaps: ['No requirements validation performed'],
      };

      // Optional sections
      const contracts = contractsData || (results['contract-validation'] as unknown as { valid: boolean; breakingChanges: string[]; recommendations: string[] } | undefined);
      const impact = impactData || (results['impact-analysis'] as unknown as { blastRadius: number; affectedServices: string[]; testSelection: string[] } | undefined);
      const dependencies = dependenciesData || (results['dependency-mapping'] as unknown as { couplingScore: number; circularDeps: string[]; metrics: Record<string, number> } | undefined);

      // Test ideas
      const testIdeas = testIdeasData?.rewritten || sfdipot.testIdeas || [];

      // Cross-phase insights
      const crossPhaseInsights = crossPhaseData?.insights || [];

      // Determine blockers
      const blockers = this.identifyRefinementBlockers(
        requirements,
        sfdipot,
        contracts,
        dependencies
      );

      // Determine recommendation
      const recommendation = this.determineRecommendation(
        requirements,
        sfdipot,
        blockers,
        contracts
      );

      const report: RefinementReport = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        targetId,
        targetType,
        sfdipot,
        bddScenarios,
        requirements,
        contracts,
        impact,
        dependencies,
        recommendation,
        blockers,
        testIdeas,
        crossPhaseInsights,
      };

      // Store final report
      await this.memory.set(
        `qcsd-refinement:report:${targetId}`,
        report,
        { namespace: 'qcsd-refinement', persist: true }
      );

      return ok(report);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Store refinement learnings for future pattern matching
   */
  private async storeRefinementLearnings(
    input: Record<string, unknown>,
    context: WorkflowContext
  ): Promise<Result<{ stored: boolean; patternId: string }, Error>> {
    try {
      const targetId = input.targetId as string || context.input.targetId as string;
      const report = input.report as RefinementReport || context.results['aggregate-refinement-report'] as RefinementReport;

      if (!report) {
        // Try loading from memory
        const storedReport = await this.memory.get<RefinementReport>(
          `qcsd-refinement:report:${targetId}`
        );
        if (!storedReport) {
          return err(new Error('No refinement report found to store'));
        }
        return this.persistLearningPattern(targetId, storedReport);
      }

      return this.persistLearningPattern(targetId, report);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Consume cross-phase signals from Loop 2 (tactical) and Loop 4 (quality criteria)
   * Searches memory for production defect patterns and testability patterns
   */
  private async consumeCrossPhaseSignals(
    input: Record<string, unknown>,
    context: WorkflowContext
  ): Promise<Result<{ tacticalSignals: unknown[]; qualitySignals: unknown[]; insights: string[] }, Error>> {
    try {
      const targetId = input.targetId as string || context.input.targetId as string;

      const insights: string[] = [];
      const tacticalSignals: unknown[] = [];
      const qualitySignals: unknown[] = [];

      // Search for Loop 2 tactical signals (production defect patterns)
      const tacticalKeys = await this.memory.search('cross-phase:tactical:*', 20);
      for (const key of tacticalKeys) {
        const signal = await this.memory.get(key);
        if (signal) {
          tacticalSignals.push(signal);
          insights.push(`Found tactical signal from production telemetry: ${key}`);
        }
      }

      // Search for Loop 4 quality criteria signals (testability patterns)
      const qualityKeys = await this.memory.search('cross-phase:quality-criteria:*', 20);
      for (const key of qualityKeys) {
        const signal = await this.memory.get(key);
        if (signal) {
          qualitySignals.push(signal);
          insights.push(`Found quality criteria signal from development: ${key}`);
        }
      }

      // Search for previous refinement patterns that may be relevant
      const patternKeys = await this.memory.search('qcsd-refinement:pattern:*', 10);
      for (const key of patternKeys) {
        const pattern = await this.memory.get<{ recommendation: string; investScore: number }>(key);
        if (pattern && pattern.recommendation === 'NOT-READY') {
          insights.push(`Previous refinement with NOT-READY found. INVEST score was ${pattern.investScore}.`);
        }
      }

      if (insights.length === 0) {
        insights.push('No cross-phase signals found. This may be the first refinement cycle.');
      }

      // Store cross-phase results
      await this.memory.set(
        `qcsd-refinement:cross-phase:${targetId}`,
        { tacticalSignals, qualitySignals, insights, timestamp: new Date().toISOString() },
        { namespace: 'qcsd-refinement', ttl: 3600 }
      );

      return ok({ tacticalSignals, qualitySignals, insights });
    } catch (error) {
      return err(toError(error));
    }
  }

  // ============================================================================
  // SFDIPOT Helper Methods
  // ============================================================================

  /**
   * Analyze all 7 SFDIPOT factors with their subcategories
   */
  private analyzeSFDIPOTFactors(combinedText: string): SFDIPOTFactorAnalysis[] {
    const factorDefinitions: Array<{
      factor: SFDIPOTFactor;
      subcategories: Array<{ name: string; description: string; keywords: string[] }>;
    }> = [
      {
        factor: 'structure',
        subcategories: [
          { name: 'Architecture', description: 'System architecture patterns and design', keywords: ['architecture', 'microservice', 'monolith', 'serverless', 'distributed'] },
          { name: 'Components', description: 'Individual components and their responsibilities', keywords: ['component', 'module', 'widget', 'plugin', 'extension'] },
          { name: 'Modules', description: 'Code module organization and boundaries', keywords: ['module', 'package', 'library', 'namespace', 'bundle'] },
          { name: 'Layers', description: 'Application layers (presentation, business, data)', keywords: ['layer', 'tier', 'presentation', 'business logic', 'data access'] },
          { name: 'Boundaries', description: 'System boundaries and contexts', keywords: ['boundary', 'context', 'domain', 'bounded context', 'aggregate'] },
        ],
      },
      {
        factor: 'function',
        subcategories: [
          { name: 'Features', description: 'User-facing feature functionality', keywords: ['feature', 'capability', 'function', 'ability', 'behavior'] },
          { name: 'Workflows', description: 'Business process workflows', keywords: ['workflow', 'process', 'flow', 'pipeline', 'sequence'] },
          { name: 'Business Rules', description: 'Domain-specific business logic', keywords: ['rule', 'policy', 'constraint', 'validation', 'condition'] },
          { name: 'Calculations', description: 'Mathematical and logical computations', keywords: ['calculate', 'compute', 'formula', 'algorithm', 'aggregate'] },
          { name: 'Transformations', description: 'Data transformation and mapping', keywords: ['transform', 'convert', 'map', 'translate', 'normalize'] },
        ],
      },
      {
        factor: 'data',
        subcategories: [
          { name: 'Input', description: 'Data input sources and validation', keywords: ['input', 'form', 'upload', 'import', 'ingest'] },
          { name: 'Output', description: 'Data output formats and destinations', keywords: ['output', 'report', 'export', 'download', 'display'] },
          { name: 'Storage', description: 'Data persistence and storage', keywords: ['store', 'persist', 'database', 'save', 'record'] },
          { name: 'Flow', description: 'Data movement between components', keywords: ['flow', 'stream', 'pipeline', 'transfer', 'sync'] },
          { name: 'Formats', description: 'Data serialization and formats', keywords: ['json', 'xml', 'csv', 'format', 'schema'] },
          { name: 'Validation', description: 'Data integrity and validation', keywords: ['validate', 'sanitize', 'verify', 'check', 'constraint'] },
          { name: 'Migration', description: 'Data migration and versioning', keywords: ['migrate', 'migration', 'upgrade', 'seed', 'backfill'] },
        ],
      },
      {
        factor: 'interfaces',
        subcategories: [
          { name: 'APIs', description: 'Application programming interfaces', keywords: ['api', 'rest', 'graphql', 'grpc', 'soap', 'endpoint'] },
          { name: 'UI', description: 'User interface elements', keywords: ['ui', 'interface', 'screen', 'page', 'view', 'form'] },
          { name: 'Integration Points', description: 'External system integrations', keywords: ['integration', 'webhook', 'callback', 'third-party', 'external', 'notification', 'downstream', 'upstream'] },
          { name: 'Protocols', description: 'Communication protocols', keywords: ['http', 'websocket', 'tcp', 'mqtt', 'amqp', 'protocol', 'json', 'xml', 'response', 'request'] },
          { name: 'Contracts', description: 'Interface contracts and schemas', keywords: ['contract', 'schema', 'specification', 'openapi', 'swagger'] },
        ],
      },
      {
        factor: 'platform',
        subcategories: [
          { name: 'OS', description: 'Operating system considerations', keywords: ['linux', 'windows', 'macos', 'os', 'operating system'] },
          { name: 'Browsers', description: 'Browser compatibility', keywords: ['browser', 'chrome', 'firefox', 'safari', 'edge'] },
          { name: 'Devices', description: 'Device compatibility', keywords: ['mobile', 'tablet', 'desktop', 'device', 'responsive'] },
          { name: 'Infrastructure', description: 'Infrastructure platform', keywords: ['aws', 'azure', 'gcp', 'cloud', 'on-premise'] },
          { name: 'Cloud', description: 'Cloud-native considerations', keywords: ['cloud', 'serverless', 'lambda', 'function', 'saas'] },
          { name: 'Containers', description: 'Container and orchestration', keywords: ['docker', 'kubernetes', 'k8s', 'container', 'pod'] },
        ],
      },
      {
        factor: 'operations',
        subcategories: [
          { name: 'Deployment', description: 'Deployment processes and strategies', keywords: ['deploy', 'release', 'rollout', 'blue-green', 'canary'] },
          { name: 'Monitoring', description: 'System monitoring and alerting', keywords: ['monitor', 'alert', 'metric', 'dashboard', 'observ'] },
          { name: 'Logging', description: 'Application logging', keywords: ['log', 'trace', 'audit', 'track', 'debug'] },
          { name: 'Backup', description: 'Backup and disaster recovery', keywords: ['backup', 'restore', 'recovery', 'disaster', 'snapshot'] },
          { name: 'Scaling', description: 'Horizontal and vertical scaling', keywords: ['scale', 'autoscal', 'horizontal', 'vertical', 'capacity'] },
          { name: 'Maintenance', description: 'Ongoing maintenance tasks', keywords: ['maintain', 'update', 'patch', 'upgrade', 'housekeep'] },
        ],
      },
      {
        factor: 'time',
        subcategories: [
          { name: 'Scheduling', description: 'Time-based scheduling', keywords: ['schedule', 'cron', 'timer', 'batch', 'periodic'] },
          { name: 'Timeouts', description: 'Timeout handling', keywords: ['timeout', 'deadline', 'expir', 'ttl', 'time-to-live'] },
          { name: 'Concurrency', description: 'Concurrent access and processing', keywords: ['concurrent', 'parallel', 'async', 'thread', 'race'] },
          { name: 'Ordering', description: 'Event and message ordering', keywords: ['order', 'sequence', 'fifo', 'priority', 'queue'] },
          { name: 'SLAs', description: 'Service level agreements', keywords: ['sla', 'latency', 'availability', 'uptime', '99.9'] },
          { name: 'TTL', description: 'Time-to-live and expiration', keywords: ['ttl', 'expir', 'cache', 'invalidat', 'stale'] },
        ],
      },
    ];

    return factorDefinitions.map(def => {
      const subcategoryResults: SubcategoryAnalysis[] = def.subcategories.map(sub => {
        const matchCount = sub.keywords.filter(kw => combinedText.includes(kw)).length;
        const relevance = Math.min(100, matchCount * 25);
        const testIdeas = this.generateSubcategoryTestIdeas(def.factor, sub.name, matchCount > 0);
        return {
          name: sub.name,
          description: sub.description,
          relevance,
          testIdeas,
        };
      });

      // Factor weight based on subcategory relevance
      const avgRelevance = subcategoryResults.length > 0
        ? subcategoryResults.reduce((sum, sc) => sum + sc.relevance, 0) / subcategoryResults.length
        : 0;
      const weight = Math.min(10, Math.round(3 + (avgRelevance / 20)));

      // Priority based on weight
      const priority: SFDIPOTFactorAnalysis['priority'] =
        weight >= 9 ? 'P0' :
        weight >= 7 ? 'P1' :
        weight >= 5 ? 'P2' : 'P3';

      // Aggregate test ideas from relevant subcategories
      const testIdeas = subcategoryResults
        .filter(sc => sc.relevance > 0)
        .flatMap(sc => sc.testIdeas);

      return {
        factor: def.factor,
        subcategories: subcategoryResults,
        weight,
        priority,
        testIdeas,
      };
    });
  }

  /**
   * Generate test ideas for a specific subcategory
   */
  private generateSubcategoryTestIdeas(factor: SFDIPOTFactor, subcategory: string, isRelevant: boolean): string[] {
    if (!isRelevant) {
      return [`Verify ${subcategory.toLowerCase()} requirements are defined for ${factor}`];
    }

    const testIdeaMap: Record<string, Record<string, string[]>> = {
      structure: {
        Architecture: ['Verify component boundaries are respected', 'Test inter-module communication paths', 'Validate architectural decision records are followed'],
        Components: ['Test each component in isolation', 'Verify component contracts', 'Test component lifecycle management'],
        Modules: ['Verify module encapsulation', 'Test module public APIs', 'Check module dependency direction'],
        Layers: ['Test layer separation enforcement', 'Verify cross-layer communication', 'Check layer-specific concerns are isolated'],
        Boundaries: ['Test bounded context integrity', 'Verify aggregate root invariants', 'Test context mapping contracts'],
      },
      function: {
        Features: ['Test happy path for each feature', 'Test feature toggle behavior', 'Verify feature interactions'],
        Workflows: ['Test complete workflow end-to-end', 'Test workflow interruption and resumption', 'Verify workflow state transitions'],
        'Business Rules': ['Test each business rule with boundary values', 'Verify rule combinations', 'Test rule precedence conflicts'],
        Calculations: ['Test calculation accuracy with known values', 'Test edge cases (zero, negative, overflow)', 'Verify rounding behavior'],
        Transformations: ['Test data transformation fidelity', 'Verify round-trip transformation', 'Test transformation error handling'],
      },
      data: {
        Input: ['Test input validation for all fields', 'Test malformed input handling', 'Verify input sanitization'],
        Output: ['Verify output format compliance', 'Test output encoding', 'Check output completeness'],
        Storage: ['Test data persistence across restarts', 'Verify storage consistency', 'Test storage capacity limits'],
        Flow: ['Test data flow through pipeline', 'Verify data integrity across hops', 'Test flow error propagation'],
        Formats: ['Test format parsing edge cases', 'Verify format conversion accuracy', 'Test unsupported format handling'],
        Validation: ['Test validation rules exhaustively', 'Check validation error messages', 'Test validation bypass attempts'],
        Migration: ['Test migration forward and rollback', 'Verify data integrity post-migration', 'Test migration idempotency'],
      },
      interfaces: {
        APIs: ['Test API response codes and bodies', 'Test API rate limiting', 'Verify API versioning'],
        UI: ['Test UI component rendering', 'Verify responsive behavior', 'Test accessibility compliance'],
        'Integration Points': ['Test integration connectivity', 'Test integration timeout handling', 'Verify integration error responses'],
        Protocols: ['Test protocol compliance', 'Verify handshake sequences', 'Test protocol error handling'],
        Contracts: ['Verify contract backward compatibility', 'Test contract schema validation', 'Run consumer-driven contract tests'],
      },
      platform: {
        OS: ['Test on all target operating systems', 'Verify file path handling', 'Test OS-specific behavior'],
        Browsers: ['Test on all target browsers', 'Verify cross-browser rendering', 'Test browser-specific APIs'],
        Devices: ['Test on mobile, tablet, desktop', 'Verify touch interactions', 'Test device orientation changes'],
        Infrastructure: ['Test infrastructure provisioning', 'Verify infrastructure as code', 'Test infrastructure failover'],
        Cloud: ['Test cloud service integration', 'Verify cloud auto-scaling', 'Test cloud region failover'],
        Containers: ['Test container image build', 'Verify container health checks', 'Test container resource limits'],
      },
      operations: {
        Deployment: ['Test deployment script end-to-end', 'Verify zero-downtime deployment', 'Test deployment rollback'],
        Monitoring: ['Verify metrics are emitted', 'Test alert thresholds', 'Check dashboard accuracy'],
        Logging: ['Verify log format compliance', 'Test log level configuration', 'Check sensitive data not logged'],
        Backup: ['Test backup creation', 'Verify backup restoration', 'Test backup scheduling'],
        Scaling: ['Test auto-scaling triggers', 'Verify scale-up and scale-down', 'Test under sustained load'],
        Maintenance: ['Test maintenance mode activation', 'Verify graceful degradation', 'Test maintenance window procedures'],
      },
      time: {
        Scheduling: ['Test scheduled job execution', 'Verify schedule conflict handling', 'Test missed schedule recovery'],
        Timeouts: ['Test timeout expiration behavior', 'Verify timeout error handling', 'Test timeout configuration changes'],
        Concurrency: ['Test concurrent access patterns', 'Verify race condition handling', 'Test deadlock prevention'],
        Ordering: ['Test message ordering guarantees', 'Verify sequence number handling', 'Test out-of-order processing'],
        SLAs: ['Test response time under load', 'Verify availability targets', 'Test SLA breach alerting'],
        TTL: ['Test cache expiration', 'Verify TTL enforcement', 'Test stale data handling'],
      },
    };

    const factorMap = testIdeaMap[factor];
    if (factorMap && factorMap[subcategory]) {
      return factorMap[subcategory];
    }

    return [`Test ${subcategory.toLowerCase()} behavior for ${factor}`];
  }

  /**
   * Generate clarifying questions for factors with low relevance
   */
  private generateClarifyingQuestions(factors: SFDIPOTFactorAnalysis[]): string[] {
    const questions: string[] = [];

    const questionMap: Record<SFDIPOTFactor, string> = {
      structure: 'What is the target architecture pattern? Are there specific component boundaries to respect?',
      function: 'What are the core business rules that must be validated? Are there any calculation-intensive workflows?',
      data: 'What data formats are expected for input/output? Are there any data migration requirements?',
      interfaces: 'What external APIs or integration points are involved? Are there API contract specifications?',
      platform: 'What target platforms (OS, browsers, devices) must be supported? Are there cloud infrastructure requirements?',
      operations: 'What are the deployment requirements? Is there monitoring and alerting in place?',
      time: 'Are there SLA requirements? Are there concurrency or scheduling concerns?',
    };

    for (const factor of factors) {
      const avgRelevance = factor.subcategories.length > 0
        ? factor.subcategories.reduce((s, sc) => s + sc.relevance, 0) / factor.subcategories.length
        : 0;

      if (avgRelevance < 25) {
        questions.push(`[${factor.factor.toUpperCase()}] ${questionMap[factor.factor]}`);
      }
    }

    return questions;
  }

  // ============================================================================
  // BDD Generation Helper Methods
  // ============================================================================

  /**
   * Generate core BDD feature with happy path scenarios
   */
  private generateCoreFeature(targetId: string, description: string, acceptanceCriteria: string[]): BDDFeature {
    const scenarios: BDDScenario[] = [];

    // Generate a happy path scenario for each acceptance criterion
    for (let i = 0; i < acceptanceCriteria.length; i++) {
      const ac = acceptanceCriteria[i];
      const acLower = ac.toLowerCase();

      // Try to parse Given/When/Then from AC
      const givenMatch = ac.match(/given\s+(.+?)(?:\s+when|\s+then|$)/i);
      const whenMatch = ac.match(/when\s+(.+?)(?:\s+then|$)/i);
      const thenMatch = ac.match(/then\s+(.+?)$/i);

      if (givenMatch || whenMatch || thenMatch) {
        scenarios.push({
          name: `AC ${i + 1}: ${this.truncate(ac, 60)}`,
          given: givenMatch ? [givenMatch[1].trim()] : ['the system is in its default state'],
          when: whenMatch ? [whenMatch[1].trim()] : ['the user performs the action'],
          then: thenMatch ? [thenMatch[1].trim()] : ['the expected outcome occurs'],
          tags: ['@happy-path', `@ac-${i + 1}`],
          type: 'happy_path',
        });
      } else {
        // Parse non-GWT acceptance criteria into scenarios
        scenarios.push({
          name: `AC ${i + 1}: ${this.truncate(ac, 60)}`,
          given: ['the system is operational', 'the user is authenticated'],
          when: [`the user performs: ${this.truncate(ac, 80)}`],
          then: ['the action completes successfully', 'the system state is updated accordingly'],
          tags: ['@happy-path', `@ac-${i + 1}`],
          type: 'happy_path',
        });
      }
    }

    // Add a default happy path if no AC provided
    if (scenarios.length === 0) {
      scenarios.push({
        name: 'Default happy path scenario',
        given: ['the system is in its initial state', 'the user has the required permissions'],
        when: ['the user performs the primary action described in the story'],
        then: ['the expected outcome is achieved', 'the system is in a valid state'],
        tags: ['@happy-path', '@generated'],
        type: 'happy_path',
      });
    }

    return {
      name: 'Core Functionality',
      description: `Happy path scenarios for: ${this.truncate(description, 100)}`,
      scenarios,
      tags: ['@core', '@happy-path'],
    };
  }

  /**
   * Generate error handling BDD feature
   */
  private generateErrorFeature(targetId: string, description: string, acceptanceCriteria: string[]): BDDFeature {
    const scenarios: BDDScenario[] = [];
    const descLower = description.toLowerCase();
    const acJoined = acceptanceCriteria.join(' ').toLowerCase();

    // Common error scenarios based on context
    if (descLower.includes('form') || descLower.includes('input') || acJoined.includes('form')) {
      scenarios.push({
        name: 'Invalid form input is rejected',
        given: ['the user is on the form page'],
        when: ['the user submits the form with invalid data'],
        then: ['the form displays validation error messages', 'the form data is not submitted', 'the user can correct the errors'],
        tags: ['@error', '@validation'],
        type: 'error',
      });
    }

    if (descLower.includes('api') || descLower.includes('service') || descLower.includes('request')) {
      scenarios.push({
        name: 'API service unavailable is handled gracefully',
        given: ['the dependent service is unavailable'],
        when: ['the system attempts to make an API call'],
        then: ['the system returns an appropriate error response', 'the error is logged', 'the user receives a friendly error message'],
        tags: ['@error', '@api'],
        type: 'error',
      });
    }

    if (descLower.includes('auth') || descLower.includes('login') || descLower.includes('permission')) {
      scenarios.push({
        name: 'Unauthorized access is prevented',
        given: ['the user does not have the required permissions'],
        when: ['the user attempts to access a restricted resource'],
        then: ['the system returns a 403 Forbidden response', 'the attempt is logged for security audit'],
        tags: ['@error', '@auth'],
        type: 'error',
      });
    }

    if (descLower.includes('data') || descLower.includes('save') || descLower.includes('create')) {
      scenarios.push({
        name: 'Duplicate data creation is prevented',
        given: ['a record with the same identifier already exists'],
        when: ['the user attempts to create a duplicate record'],
        then: ['the system returns a conflict error', 'the existing record is not modified', 'the user is informed of the conflict'],
        tags: ['@error', '@data-integrity'],
        type: 'error',
      });
    }

    // Always add a generic error scenario
    scenarios.push({
      name: 'Unexpected error is handled gracefully',
      given: ['the system encounters an unexpected error'],
      when: ['the error occurs during normal operation'],
      then: ['the system logs the error with context', 'the user receives a generic error message', 'the system remains operational'],
      tags: ['@error', '@resilience'],
      type: 'error',
    });

    return {
      name: 'Error Handling',
      description: 'Error scenarios and failure handling',
      scenarios,
      tags: ['@error-handling'],
    };
  }

  /**
   * Generate boundary condition BDD feature
   */
  private generateBoundaryFeature(targetId: string, description: string, acceptanceCriteria: string[]): BDDFeature {
    const scenarios: BDDScenario[] = [];
    const descLower = description.toLowerCase();
    const acJoined = acceptanceCriteria.join(' ').toLowerCase();

    // Data boundary scenarios
    if (descLower.includes('list') || descLower.includes('collection') || descLower.includes('results')) {
      scenarios.push({
        name: 'Empty collection is handled',
        given: ['there are no records matching the criteria'],
        when: ['the user requests the collection'],
        then: ['an empty collection is returned', 'the user sees an appropriate empty state message'],
        tags: ['@boundary', '@empty-state'],
        type: 'boundary',
      });

      scenarios.push({
        name: 'Large collection pagination works',
        given: ['there are more records than the page size limit'],
        when: ['the user requests the collection'],
        then: ['only the first page of results is returned', 'pagination metadata is included', 'the user can navigate to subsequent pages'],
        tags: ['@boundary', '@pagination'],
        type: 'boundary',
      });
    }

    if (descLower.includes('text') || descLower.includes('input') || descLower.includes('field') || descLower.includes('name')) {
      scenarios.push({
        name: 'Maximum length input is accepted',
        given: ['the user enters the maximum allowed number of characters'],
        when: ['the user submits the input'],
        then: ['the input is accepted and saved correctly', 'no truncation occurs'],
        tags: ['@boundary', '@max-length'],
        type: 'boundary',
      });

      scenarios.push({
        name: 'Empty input is handled appropriately',
        given: ['the user leaves a required field empty'],
        when: ['the user attempts to submit'],
        then: ['a validation message is displayed', 'the submission is prevented'],
        tags: ['@boundary', '@empty-input'],
        type: 'boundary',
      });
    }

    if (descLower.includes('number') || descLower.includes('amount') || descLower.includes('quantity') || descLower.includes('price')) {
      scenarios.push({
        name: 'Zero value is handled correctly',
        given: ['the numeric value is zero'],
        when: ['the system processes the value'],
        then: ['zero is treated as a valid value', 'calculations produce correct results'],
        tags: ['@boundary', '@zero-value'],
        type: 'boundary',
      });

      scenarios.push({
        name: 'Negative value is handled correctly',
        given: ['the numeric value is negative'],
        when: ['the system processes the value'],
        then: ['the value is either rejected with appropriate error or handled per business rules'],
        tags: ['@boundary', '@negative-value'],
        type: 'boundary',
      });
    }

    // Always add a concurrency boundary scenario
    scenarios.push({
      name: 'Concurrent access is handled safely',
      given: ['two users access the same resource simultaneously'],
      when: ['both users attempt to modify the resource'],
      then: ['the system applies optimistic or pessimistic locking', 'data integrity is maintained', 'the second user is notified of the conflict'],
      tags: ['@boundary', '@concurrency'],
      type: 'boundary',
    });

    return {
      name: 'Boundary Conditions',
      description: 'Edge cases and boundary value scenarios',
      scenarios,
      tags: ['@boundary'],
    };
  }

  /**
   * Generate security BDD feature (only when security keywords detected)
   */
  private generateSecurityFeature(targetId: string, description: string): BDDFeature {
    const scenarios: BDDScenario[] = [];
    const descLower = description.toLowerCase();

    if (descLower.includes('auth') || descLower.includes('login')) {
      scenarios.push({
        name: 'Brute force login is prevented',
        given: ['a user has failed to log in 5 times'],
        when: ['the user attempts another login'],
        then: ['the account is temporarily locked', 'the user is informed of the lockout', 'the lockout event is logged'],
        tags: ['@security', '@brute-force'],
        type: 'security',
      });
    }

    if (descLower.includes('input') || descLower.includes('form') || descLower.includes('data')) {
      scenarios.push({
        name: 'SQL injection is prevented',
        given: ['a malicious user crafts SQL injection input'],
        when: ['the input is submitted to the system'],
        then: ['the input is sanitized', 'the database query is parameterized', 'no data is leaked or corrupted'],
        tags: ['@security', '@injection'],
        type: 'security',
      });

      scenarios.push({
        name: 'XSS attack is prevented',
        given: ['a malicious user submits script tags in input'],
        when: ['the input is rendered in the page'],
        then: ['the script is escaped', 'no JavaScript is executed', 'the content is safely displayed'],
        tags: ['@security', '@xss'],
        type: 'security',
      });
    }

    if (descLower.includes('api') || descLower.includes('endpoint')) {
      scenarios.push({
        name: 'API rate limiting is enforced',
        given: ['a client exceeds the API rate limit'],
        when: ['the client makes another request'],
        then: ['the request is rejected with 429 Too Many Requests', 'the Retry-After header is set'],
        tags: ['@security', '@rate-limiting'],
        type: 'security',
      });
    }

    // Always add CSRF scenario for web applications
    scenarios.push({
      name: 'CSRF protection is active',
      given: ['a malicious site attempts a cross-site request'],
      when: ['the forged request reaches the server'],
      then: ['the CSRF token validation fails', 'the request is rejected', 'the attempt is logged'],
      tags: ['@security', '@csrf'],
      type: 'security',
    });

    return {
      name: 'Security',
      description: 'Security-related scenarios',
      scenarios,
      tags: ['@security'],
    };
  }

  /**
   * Check if description has security relevance
   */
  private hasSecurityRelevance(descLower: string): boolean {
    const securityKeywords = [
      'auth', 'login', 'password', 'token', 'session',
      'encrypt', 'secure', 'permission', 'role', 'access',
      'input', 'form', 'api', 'endpoint', 'data',
      'user', 'account', 'credential',
    ];
    return securityKeywords.some(kw => descLower.includes(kw));
  }

  // ============================================================================
  // INVEST Validation Helper Methods
  // ============================================================================

  /**
   * Assess INVEST criteria for a story
   */
  private assessINVESTCriteria(
    description: string,
    acceptanceCriteria: string[]
  ): Record<string, number> {
    const descLower = description.toLowerCase();
    const acCount = acceptanceCriteria.length;
    const acJoined = acceptanceCriteria.join(' ').toLowerCase();
    const descLength = description.length;

    // Independent: story can be developed independently
    const dependencyKeywords = ['depends on', 'blocked by', 'requires', 'after', 'once', 'prerequisite'];
    const dependencyCount = dependencyKeywords.filter(kw => descLower.includes(kw)).length;
    const independent = Math.max(20, 100 - (dependencyCount * 20));

    // Negotiable: story describes what, not how
    const implementationKeywords = ['use react', 'use sql', 'implement with', 'code should', 'database table', 'create endpoint', 'use library'];
    const implementationCount = implementationKeywords.filter(kw => descLower.includes(kw)).length;
    const negotiable = Math.max(20, 100 - (implementationCount * 15));

    // Valuable: clear business value
    const valueKeywords = ['user can', 'customer', 'business', 'value', 'benefit', 'revenue', 'save time', 'reduce', 'improve', 'enable'];
    const valueCount = valueKeywords.filter(kw => descLower.includes(kw)).length;
    const valuable = Math.min(100, 30 + (valueCount * 15));

    // Estimable: enough detail to estimate
    const estimable = Math.min(100, Math.round(
      (descLength > 100 ? 30 : 10) +
      (acCount * 12) +
      (descLength > 200 ? 20 : 0) +
      (acJoined.includes('given') ? 15 : 0)
    ));

    // Small: fits in a sprint
    const complexityIndicators = ['and', 'also', 'additionally', 'furthermore', 'moreover', 'plus'];
    const complexityCount = complexityIndicators.filter(kw => descLower.includes(kw)).length;
    const small = Math.max(20, 100 - (descLength / 15) - (complexityCount * 10));

    // Testable: can be verified
    const hasGWT = acJoined.includes('given') || acJoined.includes('when') || acJoined.includes('then');
    const hasMeasurable = acJoined.includes('must') || acJoined.includes('shall') || /\d+/.test(acJoined);
    const testable = Math.min(100, Math.round(
      (acCount > 0 ? 30 : 0) +
      (hasGWT ? 30 : 0) +
      (hasMeasurable ? 20 : 0) +
      (acCount >= 3 ? 20 : acCount * 7)
    ));

    return { independent, negotiable, valuable, estimable, small, testable };
  }

  /**
   * Assess overall completeness of a story (0-100)
   */
  private assessCompleteness(description: string, acceptanceCriteria: string[]): number {
    let score = 0;

    // Description quality (max 30)
    if (description.length >= 50) score += 10;
    if (description.length >= 100) score += 5;
    if (description.length >= 200) score += 5;
    if (description.toLowerCase().includes('as a') || description.toLowerCase().includes('user')) score += 5;
    if (description.toLowerCase().includes('so that') || description.toLowerCase().includes('in order to')) score += 5;

    // Acceptance criteria quality (max 40)
    score += Math.min(20, acceptanceCriteria.length * 5);
    const hasGWT = acceptanceCriteria.some(ac => {
      const lower = ac.toLowerCase();
      return lower.includes('given') || lower.includes('when') || lower.includes('then');
    });
    if (hasGWT) score += 10;
    const hasMeasurable = acceptanceCriteria.some(ac => /\d+/.test(ac) || ac.toLowerCase().includes('must'));
    if (hasMeasurable) score += 10;

    // Non-functional requirements (max 15)
    const nfrKeywords = ['performance', 'security', 'scalability', 'reliability', 'availability'];
    const nfrCount = nfrKeywords.filter(kw => description.toLowerCase().includes(kw)).length;
    score += Math.min(15, nfrCount * 5);

    // Dependencies and context (max 15)
    if (description.toLowerCase().includes('depend') || description.toLowerCase().includes('integrat')) score += 5;
    if (description.toLowerCase().includes('context') || description.toLowerCase().includes('background')) score += 5;
    if (acceptanceCriteria.length >= 5) score += 5;

    return Math.min(100, score);
  }

  // ============================================================================
  // Report Generation Helper Methods
  // ============================================================================

  /**
   * Identify blockers for refinement readiness
   */
  private identifyRefinementBlockers(
    requirements: { valid: boolean; investScore: number; completeness: number; gaps: string[] },
    sfdipot: SFDIPOTAssessment,
    contracts?: { valid: boolean; breakingChanges: string[]; recommendations: string[] },
    dependencies?: { couplingScore: number; circularDeps: string[]; metrics: Record<string, number> }
  ): string[] {
    const blockers: string[] = [];

    // Requirements blockers
    if (requirements.investScore < 40) {
      blockers.push(`INVEST score too low (${requirements.investScore}/100) - story is not well-defined`);
    }
    if (requirements.completeness < 30) {
      blockers.push(`Completeness too low (${requirements.completeness}/100) - insufficient detail for development`);
    }
    if (requirements.gaps.length > 5) {
      blockers.push(`Too many requirement gaps (${requirements.gaps.length}) - story needs significant refinement`);
    }

    // SFDIPOT blockers
    if (sfdipot.overallScore < 20) {
      blockers.push('SFDIPOT analysis score too low - story lacks testable scope definition');
    }
    if (sfdipot.clarifyingQuestions.length > 4) {
      blockers.push(`${sfdipot.clarifyingQuestions.length} SFDIPOT factors need clarification - too many unknowns`);
    }

    // Contract blockers
    if (contracts && !contracts.valid && contracts.breakingChanges.length > 0) {
      blockers.push(`${contracts.breakingChanges.length} breaking API changes detected - must be resolved before development`);
    }

    // Dependency blockers
    if (dependencies) {
      if (dependencies.circularDeps.length > 0) {
        blockers.push(`${dependencies.circularDeps.length} potential circular dependencies detected`);
      }
      if (dependencies.couplingScore > 80) {
        blockers.push(`High coupling score (${dependencies.couplingScore}/100) - refactoring needed before implementation`);
      }
    }

    return blockers;
  }

  /**
   * Determine overall recommendation (READY / CONDITIONAL / NOT-READY)
   */
  private determineRecommendation(
    requirements: { valid: boolean; investScore: number; completeness: number; gaps: string[] },
    sfdipot: SFDIPOTAssessment,
    blockers: string[],
    contracts?: { valid: boolean; breakingChanges: string[]; recommendations: string[] }
  ): RefinementReport['recommendation'] {
    // NOT-READY: Hard blockers present
    if (blockers.length > 0) {
      return 'NOT-READY';
    }

    // READY: All criteria met
    if (
      requirements.investScore >= 70 &&
      requirements.completeness >= 60 &&
      sfdipot.overallScore >= 40 &&
      requirements.gaps.length <= 2 &&
      (!contracts || contracts.valid)
    ) {
      return 'READY';
    }

    // CONDITIONAL: Some issues but no hard blockers
    return 'CONDITIONAL';
  }

  /**
   * Persist learning pattern to memory
   */
  private async persistLearningPattern(
    targetId: string,
    report: RefinementReport
  ): Promise<Result<{ stored: boolean; patternId: string }, Error>> {
    const patternId = `refinement-pattern-${Date.now()}`;

    // Create learning pattern
    const pattern = {
      id: patternId,
      timestamp: new Date().toISOString(),
      targetType: report.targetType,
      sfdipotScore: report.sfdipot.overallScore,
      investScore: report.requirements.investScore,
      completeness: report.requirements.completeness,
      recommendation: report.recommendation,
      blockerCount: report.blockers.length,
      bddScenarioCount: report.bddScenarios.totalScenarios,
      testIdeaCount: report.testIdeas.length,
      // Key characteristics for pattern matching
      features: {
        hasContractIssues: report.contracts ? !report.contracts.valid : false,
        hasCircularDeps: report.dependencies ? report.dependencies.circularDeps.length > 0 : false,
        blastRadius: report.impact ? report.impact.blastRadius : 0,
        gapCount: report.requirements.gaps.length,
        crossPhaseInsightCount: report.crossPhaseInsights.length,
      },
    };

    // Store pattern for learning
    await this.memory.set(
      `qcsd-refinement:pattern:${patternId}`,
      pattern,
      { namespace: 'learning', persist: true }
    );

    // Store in pattern index for search
    const patternIndex = await this.memory.get<string[]>('qcsd-refinement:patterns:index') || [];
    patternIndex.push(patternId);
    await this.memory.set('qcsd-refinement:patterns:index', patternIndex, { namespace: 'learning', persist: true });

    return ok({ stored: true, patternId });
  }

  // ============================================================================
  // Utility Helper Methods
  // ============================================================================

  /**
   * Truncate a string to a maximum length with ellipsis
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createQCSDRefinementPlugin(memory: MemoryBackend): QCSDRefinementPlugin {
  return new QCSDRefinementPlugin(memory);
}
