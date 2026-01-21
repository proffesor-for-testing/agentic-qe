/**
 * Agentic QE v3 - Requirements Validation Coordinator
 * Orchestrates the requirements validation workflow across services
 *
 * V3 Integration:
 * - PPO Algorithm: Optimizes BDD scenario generation and ordering
 * - QESONA: Learns and adapts requirement patterns for improved validation
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err, DomainEvent } from '../../shared/types/index.js';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
  AgentSpawnConfig,
} from '../../kernel/interfaces.js';
import { createEvent } from '../../shared/events/domain-events.js';
import {
  IRequirementsValidationCoordinator,
  Requirement,
  RequirementAnalysis,
  TestArtifacts,
  SprintValidation,
  ValidationBlocker,
  TestabilityScore,
  ValidationError,
  BDDScenario,
  GherkinFile,
  TestCaseOutline,
  IRequirementRepository,
} from './interfaces.js';
import { RequirementsValidatorService } from './services/requirements-validator.js';
import { BDDScenarioWriterService } from './services/bdd-scenario-writer.js';
import { TestabilityScorerService } from './services/testability-scorer.js';

// V3 Integration: RL Suite
import { PPOAlgorithm } from '../../integrations/rl-suite/algorithms/ppo.js';
import type { RLState, RLAction, RLExperience, RLPrediction } from '../../integrations/rl-suite/interfaces.js';

// V3 Integration: @ruvector wrappers (persistent patterns)
import {
  PersistentSONAEngine,
  createPersistentSONAEngine,
} from '../../integrations/ruvector/sona-persistence.js';
import {
  type QESONAPattern,
  type QEPatternType,
} from '../../integrations/ruvector/wrappers.js';

// ============================================================================
// Domain Events
// ============================================================================

export const RequirementsValidationEvents = {
  RequirementAnalyzed: 'requirements-validation.RequirementAnalyzed',
  BDDScenariosGenerated: 'requirements-validation.BDDScenariosGenerated',
  RequirementValidated: 'requirements-validation.RequirementValidated',
  SprintValidated: 'requirements-validation.SprintValidated',
  ValidationFailed: 'requirements-validation.ValidationFailed',
} as const;

// ============================================================================
// Coordinator Configuration
// ============================================================================

export interface CoordinatorConfig {
  maxConcurrentWorkflows: number;
  defaultTimeout: number;
  publishEvents: boolean;
  minTestabilityThreshold: number;
  // V3: Enable RL and SONA integrations
  enablePPO: boolean;
  enableSONA: boolean;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkflows: 5,
  defaultTimeout: 60000,
  publishEvents: true,
  minTestabilityThreshold: 60,
  enablePPO: true,
  enableSONA: true,
};

// ============================================================================
// Workflow Status
// ============================================================================

export interface WorkflowStatus {
  id: string;
  type: 'analyze' | 'generate-artifacts' | 'validate-sprint';
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  agentIds: string[];
  progress: number;
  error?: string;
}

// ============================================================================
// In-Memory Requirement Repository
// ============================================================================

class InMemoryRequirementRepository implements IRequirementRepository {
  private readonly requirements: Map<string, Requirement> = new Map();

  constructor(private readonly memory: MemoryBackend) {}

  async findById(id: string): Promise<Requirement | null> {
    // Check in-memory first
    if (this.requirements.has(id)) {
      return this.requirements.get(id) || null;
    }

    // Check persistent storage
    const stored = await this.memory.get<Requirement>(`requirement:${id}`);
    if (stored) {
      this.requirements.set(id, stored);
      return stored;
    }

    return null;
  }

  async findByStatus(status: Requirement['status']): Promise<Requirement[]> {
    return Array.from(this.requirements.values()).filter((r) => r.status === status);
  }

  async findByPriority(priority: Requirement['priority']): Promise<Requirement[]> {
    return Array.from(this.requirements.values()).filter((r) => r.priority === priority);
  }

  async save(requirement: Requirement): Promise<void> {
    this.requirements.set(requirement.id, requirement);
    await this.memory.set(`requirement:${requirement.id}`, requirement, {
      namespace: 'requirements-validation',
      persist: true,
    });
  }

  async delete(id: string): Promise<void> {
    this.requirements.delete(id);
    await this.memory.delete(`requirement:${id}`);
  }
}

// ============================================================================
// Coordinator Implementation
// ============================================================================

export class RequirementsValidationCoordinator implements IRequirementsValidationCoordinator {
  private readonly config: CoordinatorConfig;
  private readonly validator: RequirementsValidatorService;
  private readonly bddWriter: BDDScenarioWriterService;
  private readonly testabilityScorer: TestabilityScorerService;
  private readonly repository: IRequirementRepository;
  private readonly workflows: Map<string, WorkflowStatus> = new Map();
  private initialized = false;

  // V3: RL and SONA integrations
  private ppoAlgorithm?: PPOAlgorithm;
  private sonaEngine?: PersistentSONAEngine;
  private rlInitialized = false;

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<CoordinatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.validator = new RequirementsValidatorService(memory);
    this.bddWriter = new BDDScenarioWriterService(memory);
    this.testabilityScorer = new TestabilityScorerService(memory);
    this.repository = new InMemoryRequirementRepository(memory);
  }

  /**
   * Initialize the coordinator
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.subscribeToEvents();
    await this.loadWorkflowState();

    // V3: Initialize RL and SONA integrations
    if (this.config.enablePPO || this.config.enableSONA) {
      await this.initializeRLIntegrations();
    }

    this.initialized = true;
  }

  /**
   * Initialize V3 RL and SONA integrations
   */
  private async initializeRLIntegrations(): Promise<void> {
    try {
      // Initialize PPO for BDD scenario optimization
      if (this.config.enablePPO) {
        this.ppoAlgorithm = new PPOAlgorithm({
          stateSize: 10,
          actionSize: 5,
          actorHiddenLayers: [64, 64],
          criticHiddenLayers: [64, 64],
          clipEpsilon: 0.2,
          lambdaGAE: 0.95,
          epochs: 10,
          miniBatchSize: 32,
          entropyCoeff: 0.01,
        });
        // PPO is initialized via constructor, no separate initialize() call needed
      }

      // Initialize SONA for requirement pattern learning (persistent patterns)
      if (this.config.enableSONA) {
        try {
          this.sonaEngine = await createPersistentSONAEngine({
            domain: 'requirements-validation',
            loadOnInit: true,
            autoSaveInterval: 60000,
            maxPatterns: 5000,
            minConfidence: 0.6,
          });
          console.log('[RequirementsValidation] PersistentSONAEngine initialized for pattern learning');
        } catch (error) {
          console.error('[RequirementsValidation] Failed to initialize PersistentSONAEngine:', error);
          // Continue without SONA - it's optional
          this.sonaEngine = undefined;
        }
      }

      this.rlInitialized = true;
    } catch (error) {
      console.error('Failed to initialize RL integrations:', error);
      throw error;
    }
  }

  /**
   * Dispose and cleanup
   */
  async dispose(): Promise<void> {
    await this.saveWorkflowState();
    this.workflows.clear();

    // V3: Clean up SONA engine (persistent patterns)
    if (this.sonaEngine) {
      try {
        await this.sonaEngine.close();
        this.sonaEngine = undefined;
      } catch (error) {
        console.error('[RequirementsValidation] Error closing SONA engine:', error);
      }
    }

    this.initialized = false;
  }

  /**
   * Get active workflow statuses
   */
  getActiveWorkflows(): WorkflowStatus[] {
    return Array.from(this.workflows.values()).filter(
      (w) => w.status === 'running' || w.status === 'pending'
    );
  }

  // ============================================================================
  // IRequirementsValidationCoordinator Implementation
  // ============================================================================

  /**
   * Full requirements analysis workflow
   */
  async analyzeRequirement(requirementId: string): Promise<Result<RequirementAnalysis>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'analyze');

      // Fetch requirement
      const requirement = await this.repository.findById(requirementId);
      if (!requirement) {
        return err(new Error(`Requirement not found: ${requirementId}`));
      }

      // V3: Use SONA to adapt patterns from similar requirements
      if (this.config.enableSONA && this.sonaEngine) {
        const pattern = await this.adaptRequirementPattern(requirement);
        if (pattern.success && pattern.pattern) {
          console.log(`[SONA] Adapted pattern with ${pattern.similarity.toFixed(3)} similarity`);
        }
      }

      // Spawn analysis agent
      const agentResult = await this.spawnAnalysisAgent(workflowId, requirement);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);
      this.updateWorkflowProgress(workflowId, 10);

      // Run validation
      const validationResult = await this.validator.validate(requirement);
      if (!validationResult.success) {
        this.failWorkflow(workflowId, validationResult.error.message);
        return err(validationResult.error);
      }
      this.updateWorkflowProgress(workflowId, 30);

      // Run testability scoring
      const testabilityResult = await this.testabilityScorer.scoreRequirement(requirement);
      if (!testabilityResult.success) {
        this.failWorkflow(workflowId, testabilityResult.error.message);
        return err(testabilityResult.error);
      }
      this.updateWorkflowProgress(workflowId, 50);

      // Run ambiguity detection
      const ambiguityResult = await this.validator.detectAmbiguity(requirement);
      if (!ambiguityResult.success) {
        this.failWorkflow(workflowId, ambiguityResult.error.message);
        return err(ambiguityResult.error);
      }
      this.updateWorkflowProgress(workflowId, 70);

      // Generate improvement suggestions
      const suggestionsResult = await this.testabilityScorer.suggestImprovements(
        requirement,
        testabilityResult.value
      );
      this.updateWorkflowProgress(workflowId, 90);

      const analysis: RequirementAnalysis = {
        requirement,
        testabilityScore: testabilityResult.value,
        validationErrors: validationResult.value,
        ambiguityReport: ambiguityResult.value,
        suggestedImprovements: suggestionsResult.success ? suggestionsResult.value : [],
      };

      // V3: Store pattern in SONA for future learning
      if (this.config.enableSONA && this.sonaEngine) {
        await this.storeRequirementPattern(requirement, testabilityResult.value.value, analysis);
      }

      // Stop agent and complete workflow
      await this.agentCoordinator.stop(agentResult.value);
      this.completeWorkflow(workflowId);

      // Publish event
      if (this.config.publishEvents) {
        await this.publishRequirementAnalyzed(analysis);
      }

      return ok(analysis);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.failWorkflow(workflowId, err.message);
      if (this.config.publishEvents) {
        await this.publishValidationFailed(err, 'analyzeRequirement');
      }
      return { success: false, error: err };
    }
  }

  /**
   * Generate test artifacts from requirement
   */
  async generateTestArtifacts(requirementId: string): Promise<Result<TestArtifacts>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'generate-artifacts');

      // Fetch requirement
      const requirement = await this.repository.findById(requirementId);
      if (!requirement) {
        return err(new Error(`Requirement not found: ${requirementId}`));
      }

      // Spawn BDD generation agent
      const agentResult = await this.spawnBDDAgent(workflowId, requirement);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);
      this.updateWorkflowProgress(workflowId, 20);

      // V3: Use PPO to optimize BDD scenario generation
      let optimizedScenarioCount = 3;
      if (this.config.enablePPO && this.ppoAlgorithm) {
        const prediction = await this.optimizeScenarioGeneration(requirement);
        if (prediction.success && prediction.value) {
          optimizedScenarioCount = this.extractScenarioCount(prediction.value);
          console.log(`[PPO] Optimized scenario count to ${optimizedScenarioCount}`);
        }
      }

      // Generate BDD scenarios with optimized count
      const scenariosResult = await this.bddWriter.generateScenariosWithExamples(
        requirement,
        optimizedScenarioCount
      );

      if (!scenariosResult.success) {
        this.failWorkflow(workflowId, scenariosResult.error.message);
        return err(scenariosResult.error);
      }
      this.updateWorkflowProgress(workflowId, 50);

      // V3: Use PPO to optimize scenario ordering
      let scenarios = scenariosResult.value;
      if (this.config.enablePPO && this.ppoAlgorithm) {
        scenarios = await this.optimizeScenarioOrdering(requirement, scenarios);
      }

      // Generate Gherkin files
      const gherkinContent = this.bddWriter.toGherkin(scenarios);
      const gherkinFile: GherkinFile = {
        path: `features/${this.sanitizeFilename(requirement.title)}.feature`,
        content: gherkinContent,
        scenarioCount: scenarios.length,
      };
      this.updateWorkflowProgress(workflowId, 70);

      // Generate test case outlines
      const testCaseOutlines = this.generateTestCaseOutlines(
        requirement,
        scenarios
      );
      this.updateWorkflowProgress(workflowId, 90);

      const artifacts: TestArtifacts = {
        requirementId,
        bddScenarios: scenarios,
        gherkinFiles: [gherkinFile],
        testCaseOutlines,
      };

      // V3: Train PPO with feedback from scenario generation
      if (this.config.enablePPO && this.ppoAlgorithm) {
        await this.trainPPOWithScenarioFeedback(requirement, scenarios, artifacts);
      }

      // Stop agent and complete workflow
      await this.agentCoordinator.stop(agentResult.value);
      this.completeWorkflow(workflowId);

      // Publish event
      if (this.config.publishEvents) {
        await this.publishBDDScenariosGenerated(requirementId, scenarios);
      }

      return ok(artifacts);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.failWorkflow(workflowId, err.message);
      return { success: false, error: err };
    }
  }

  /**
   * Validate sprint requirements
   */
  async validateSprintRequirements(
    requirementIds: string[]
  ): Promise<Result<SprintValidation>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'validate-sprint');

      // Fetch all requirements
      const requirements: Requirement[] = [];
      for (const id of requirementIds) {
        const req = await this.repository.findById(id);
        if (req) {
          requirements.push(req);
        }
      }

      if (requirements.length === 0) {
        return err(new Error('No requirements found for the specified IDs'));
      }

      this.updateWorkflowProgress(workflowId, 10);

      // Score all requirements
      const scoresResult = await this.testabilityScorer.scoreRequirements(requirements);
      if (!scoresResult.success) {
        this.failWorkflow(workflowId, scoresResult.error.message);
        return err(scoresResult.error);
      }
      this.updateWorkflowProgress(workflowId, 40);

      // Validate all requirements
      const validationResults: Map<string, ValidationError[]> = new Map();
      for (const req of requirements) {
        const result = await this.validator.validate(req);
        if (result.success) {
          validationResults.set(req.id, result.value);
        }
      }
      this.updateWorkflowProgress(workflowId, 70);

      // Analyze dependencies
      const dependencyResult = await this.validator.analyzeDependencies(requirements);
      this.updateWorkflowProgress(workflowId, 80);

      // Calculate metrics and identify blockers
      const blockers: ValidationBlocker[] = [];
      let validCount = 0;
      let totalTestability = 0;

      for (const req of requirements) {
        const score = scoresResult.value.get(req.id);
        const errors = validationResults.get(req.id) || [];

        if (score) {
          totalTestability += score.value;

          // Check for blockers
          if (score.value < this.config.minTestabilityThreshold) {
            blockers.push({
              requirementId: req.id,
              reason: `Testability score (${score.value}) below threshold (${this.config.minTestabilityThreshold})`,
              severity: score.value < 30 ? 'critical' : 'high',
            });
          }
        }

        const criticalErrors = errors.filter((e) => e.severity === 'error');
        if (criticalErrors.length === 0) {
          validCount++;
        } else {
          blockers.push({
            requirementId: req.id,
            reason: `Has ${criticalErrors.length} validation error(s)`,
            severity: criticalErrors.length > 2 ? 'critical' : 'high',
          });
        }
      }

      // Generate recommendations
      const recommendations = this.generateSprintRecommendations(
        requirements,
        scoresResult.value,
        blockers,
        dependencyResult.success ? dependencyResult.value : undefined
      );

      const validation: SprintValidation = {
        totalRequirements: requirements.length,
        validRequirements: validCount,
        averageTestability: Math.round(totalTestability / requirements.length),
        blockers,
        recommendations,
      };

      this.completeWorkflow(workflowId);

      // Publish event
      if (this.config.publishEvents) {
        await this.publishSprintValidated(validation);
      }

      return ok(validation);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.failWorkflow(workflowId, err.message);
      return { success: false, error: err };
    }
  }

  // ============================================================================
  // V3: PPO Integration for BDD Scenario Optimization
  // ============================================================================

  /**
   * Use PPO to optimize scenario generation parameters
   */
  private async optimizeScenarioGeneration(
    requirement: Requirement
  ): Promise<Result<RLPrediction>> {
    if (!this.ppoAlgorithm || !this.rlInitialized) {
      return err(new Error('PPO not initialized'));
    }

    try {
      // Create state from requirement features
      const state: RLState = {
        id: `req-${requirement.id}`,
        features: this.extractRequirementFeatures(requirement),
      };

      const prediction = await this.ppoAlgorithm.predict(state);
      return ok(prediction);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Use PPO to optimize scenario ordering for maximum coverage
   */
  private async optimizeScenarioOrdering(
    requirement: Requirement,
    scenarios: BDDScenario[]
  ): Promise<BDDScenario[]> {
    if (!this.ppoAlgorithm || !this.rlInitialized) {
      return scenarios;
    }

    try {
      // Score each scenario based on PPO predictions
      const scored = await Promise.all(
        scenarios.map(async (scenario) => {
          // Calculate step count from given/when/then arrays
          const stepCount = scenario.given.length + scenario.when.length + scenario.then.length;
          const state: RLState = {
            id: `scenario-${scenario.scenario}`,
            features: [
              ...this.extractRequirementFeatures(requirement),
              stepCount,
              scenario.examples?.rows.length || 0,
            ],
          };

          const prediction = await this.ppoAlgorithm!.predict(state);
          return {
            scenario,
            score: prediction.value || 0,
          };
        })
      );

      // Sort by score (descending)
      scored.sort((a, b) => b.score - a.score);
      return scored.map((s) => s.scenario);
    } catch (error) {
      console.error('Failed to optimize scenario ordering:', error);
      return scenarios;
    }
  }

  /**
   * Train PPO with feedback from scenario generation
   */
  private async trainPPOWithScenarioFeedback(
    requirement: Requirement,
    scenarios: BDDScenario[],
    artifacts: TestArtifacts
  ): Promise<void> {
    if (!this.ppoAlgorithm || !this.rlInitialized) {
      return;
    }

    try {
      // Create experience from the generation outcome
      const state: RLState = {
        id: `req-${requirement.id}`,
        features: this.extractRequirementFeatures(requirement),
      };

      const action: RLAction = {
        type: 'generate-scenarios',
        value: scenarios.length,
      };

      // Reward based on scenario quality
      const reward = this.calculateScenarioReward(scenarios, artifacts);

      const experience: RLExperience = {
        state,
        action,
        reward,
        nextState: state,
        done: true,
      };

      await this.ppoAlgorithm.train(experience);
      console.log(`[PPO] Trained with reward: ${reward.toFixed(3)}`);
    } catch (error) {
      console.error('Failed to train PPO:', error);
    }
  }

  /**
   * Calculate reward for scenario generation
   */
  private calculateScenarioReward(
    scenarios: BDDScenario[],
    artifacts: TestArtifacts
  ): number {
    let reward = 0.5;

    // Reward scenario count (3-5 is optimal)
    const count = scenarios.length;
    if (count >= 3 && count <= 5) {
      reward += 0.2;
    } else if (count > 5) {
      reward -= 0.1;
    }

    // Reward test case outline coverage
    const outlineCount = artifacts.testCaseOutlines.length;
    reward += Math.min(0.3, outlineCount * 0.05);

    // Reward examples in scenarios
    const scenariosWithExamples = scenarios.filter((s) => s.examples && s.examples.rows.length > 0).length;
    reward += (scenariosWithExamples / scenarios.length) * 0.2;

    return Math.max(0, Math.min(1, reward));
  }

  /**
   * Extract scenario count from PPO prediction
   */
  private extractScenarioCount(prediction: RLPrediction): number {
    if (prediction.action.type === 'generate-scenarios' && typeof prediction.action.value === 'number') {
      return Math.max(1, Math.min(10, Math.round(prediction.action.value)));
    }
    return 3; // Default
  }

  /**
   * Extract features from requirement for RL state
   */
  private extractRequirementFeatures(requirement: Requirement): number[] {
    return [
      requirement.title.length,
      requirement.description.length,
      requirement.acceptanceCriteria.length,
      requirement.priority === 'critical' ? 1 : requirement.priority === 'high' ? 0.5 : 0,
      requirement.type === 'functional' ? 1 : 0,
      requirement.type === 'non-functional' ? 1 : 0,
      (requirement as { dependencies?: string[] }).dependencies?.length || 0,
      ((requirement as { tags?: string[] }).tags ?? []).length,
      (requirement as { estimatedComplexity?: number }).estimatedComplexity || 0.5,
      requirement.status === 'approved' ? 1 : 0,
    ];
  }

  // ============================================================================
  // V3: SONA Integration for Requirement Pattern Learning
  // ============================================================================

  /**
   * Adapt requirement pattern using SONA
   */
  private async adaptRequirementPattern(
    requirement: Requirement
  ): Promise<{ success: boolean; pattern: QESONAPattern | null; similarity: number }> {
    if (!this.sonaEngine || !this.rlInitialized) {
      return { success: false, pattern: null, similarity: 0 };
    }

    try {
      const state: RLState = {
        id: `req-${requirement.id}`,
        features: this.extractRequirementFeatures(requirement),
      };

      const result = await this.sonaEngine.adaptPattern(
        state,
        'test-generation' as QEPatternType,
        'requirements-validation'
      );

      return {
        success: result.success,
        pattern: result.pattern,
        similarity: result.similarity,
      };
    } catch (error) {
      console.error('Failed to adapt requirement pattern:', error);
      return { success: false, pattern: null, similarity: 0 };
    }
  }

  /**
   * Store requirement pattern in SONA for future learning
   */
  private async storeRequirementPattern(
    requirement: Requirement,
    testabilityScore: number,
    analysis: RequirementAnalysis
  ): Promise<void> {
    if (!this.sonaEngine || !this.rlInitialized) {
      return;
    }

    try {
      const state: RLState = {
        id: `req-${requirement.id}`,
        features: this.extractRequirementFeatures(requirement),
      };

      const action: RLAction = {
        type: 'validate',
        value: testabilityScore,
      };

      const outcome = {
        reward: testabilityScore / 100,
        success: testabilityScore >= this.config.minTestabilityThreshold,
        quality: testabilityScore / 100,
      };

      const pattern = this.sonaEngine.createPattern(
        state,
        action,
        outcome,
        'test-generation' as QEPatternType,
        'requirements-validation',
        {
          requirementId: requirement.id,
          requirementType: requirement.type,
          validationErrorCount: analysis.validationErrors.length,
          ambiguityScore: analysis.ambiguityReport.overallScore,
        }
      );

      console.log(`[SONA] Stored pattern ${pattern.id} for requirement ${requirement.id}`);
    } catch (error) {
      console.error('Failed to store requirement pattern:', error);
    }
  }

  // ============================================================================
  // Agent Spawning
  // ============================================================================

  private async spawnAnalysisAgent(
    workflowId: string,
    requirement: Requirement
  ): Promise<Result<string, Error>> {
    if (!this.agentCoordinator.canSpawn()) {
      return err(new Error('Agent limit reached'));
    }

    const config: AgentSpawnConfig = {
      name: `req-analyzer-${workflowId.slice(0, 8)}`,
      domain: 'requirements-validation',
      type: 'analyzer',
      capabilities: ['requirements-analysis', 'testability-scoring', 'ambiguity-detection'],
      config: {
        workflowId,
        requirementId: requirement.id,
        requirementType: requirement.type,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  private async spawnBDDAgent(
    workflowId: string,
    requirement: Requirement
  ): Promise<Result<string, Error>> {
    if (!this.agentCoordinator.canSpawn()) {
      return err(new Error('Agent limit reached'));
    }

    const config: AgentSpawnConfig = {
      name: `bdd-generator-${workflowId.slice(0, 8)}`,
      domain: 'requirements-validation',
      type: 'generator',
      capabilities: ['bdd-generation', 'gherkin', 'scenario-writing'],
      config: {
        workflowId,
        requirementId: requirement.id,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  // ============================================================================
  // Event Publishing
  // ============================================================================

  private async publishRequirementAnalyzed(analysis: RequirementAnalysis): Promise<void> {
    const event = createEvent(
      RequirementsValidationEvents.RequirementAnalyzed,
      'requirements-validation',
      {
        requirementId: analysis.requirement.id,
        testabilityScore: analysis.testabilityScore.value,
        testabilityCategory: analysis.testabilityScore.category,
        validationErrorCount: analysis.validationErrors.length,
        ambiguityScore: analysis.ambiguityReport.overallScore,
        suggestedImprovementsCount: analysis.suggestedImprovements.length,
      }
    );

    await this.eventBus.publish(event);
  }

  private async publishBDDScenariosGenerated(
    requirementId: string,
    scenarios: BDDScenario[]
  ): Promise<void> {
    const event = createEvent(
      RequirementsValidationEvents.BDDScenariosGenerated,
      'requirements-validation',
      {
        requirementId,
        scenarioCount: scenarios.length,
        tags: [...new Set(scenarios.flatMap((s) => s.tags))],
      }
    );

    await this.eventBus.publish(event);
  }

  private async publishSprintValidated(validation: SprintValidation): Promise<void> {
    const event = createEvent(
      RequirementsValidationEvents.SprintValidated,
      'requirements-validation',
      {
        totalRequirements: validation.totalRequirements,
        validRequirements: validation.validRequirements,
        averageTestability: validation.averageTestability,
        blockerCount: validation.blockers.length,
        criticalBlockers: validation.blockers.filter((b) => b.severity === 'critical').length,
      }
    );

    await this.eventBus.publish(event);
  }

  private async publishValidationFailed(error: Error, context: string): Promise<void> {
    const event = createEvent(
      RequirementsValidationEvents.ValidationFailed,
      'requirements-validation',
      {
        error: error.message,
        context,
        timestamp: new Date().toISOString(),
      }
    );

    await this.eventBus.publish(event);
  }

  // ============================================================================
  // Workflow Management
  // ============================================================================

  private startWorkflow(id: string, type: WorkflowStatus['type']): void {
    const activeWorkflows = this.getActiveWorkflows();
    if (activeWorkflows.length >= this.config.maxConcurrentWorkflows) {
      throw new Error(
        `Maximum concurrent workflows (${this.config.maxConcurrentWorkflows}) reached`
      );
    }

    this.workflows.set(id, {
      id,
      type,
      status: 'running',
      startedAt: new Date(),
      agentIds: [],
      progress: 0,
    });
  }

  private completeWorkflow(id: string): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.status = 'completed';
      workflow.completedAt = new Date();
      workflow.progress = 100;
    }
  }

  private failWorkflow(id: string, error: string): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.status = 'failed';
      workflow.completedAt = new Date();
      workflow.error = error;
    }
  }

  private addAgentToWorkflow(workflowId: string, agentId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.agentIds.push(agentId);
    }
  }

  private updateWorkflowProgress(id: string, progress: number): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.progress = Math.min(100, Math.max(0, progress));
    }
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  private subscribeToEvents(): void {
    // Listen for code changes that might impact requirements
    this.eventBus.subscribe(
      'code-intelligence.ImpactAnalysisCompleted',
      this.handleImpactAnalysis.bind(this)
    );

    // Listen for test generation requests
    this.eventBus.subscribe(
      'test-generation.TestGenerated',
      this.handleTestGenerated.bind(this)
    );
  }

  private async handleImpactAnalysis(_event: DomainEvent): Promise<void> {
    // Could trigger re-validation of affected requirements
    // Implementation depends on specific needs
  }

  private async handleTestGenerated(_event: DomainEvent): Promise<void> {
    // Could update requirement status when tests are generated
    // Implementation depends on specific needs
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private generateTestCaseOutlines(
    requirement: Requirement,
    scenarios: BDDScenario[]
  ): TestCaseOutline[] {
    return scenarios.map((scenario, index) => ({
      id: `TC-${requirement.id}-${index + 1}`,
      title: scenario.scenario,
      steps: [
        ...scenario.given.map((g) => `Setup: ${g}`),
        ...scenario.when.map((w) => `Action: ${w}`),
        ...scenario.then.map((t) => `Verify: ${t}`),
      ],
      expectedResults: scenario.then,
      testData: scenario.examples
        ? this.extractTestDataFromExamples(scenario.examples)
        : {},
    }));
  }

  private extractTestDataFromExamples(
    examples: { headers: string[]; rows: string[][] }
  ): Record<string, unknown> {
    const testData: Record<string, unknown> = {};

    for (let i = 0; i < examples.headers.length; i++) {
      const header = examples.headers[i];
      testData[header] = examples.rows.map((row) => row[i]);
    }

    return testData;
  }

  private generateSprintRecommendations(
    requirements: Requirement[],
    scores: Map<string, TestabilityScore>,
    blockers: ValidationBlocker[],
    dependencyGraph?: { edges: Array<{ from: string; to: string; type: string }> }
  ): string[] {
    const recommendations: string[] = [];

    // Critical blockers recommendation
    const criticalBlockers = blockers.filter((b) => b.severity === 'critical');
    if (criticalBlockers.length > 0) {
      recommendations.push(
        `Address ${criticalBlockers.length} critical blocker(s) before sprint planning`
      );
    }

    // Low testability recommendation
    const lowTestability = Array.from(scores.entries()).filter(
      ([, score]) => score.value < this.config.minTestabilityThreshold
    );
    if (lowTestability.length > 0) {
      recommendations.push(
        `Improve testability for ${lowTestability.length} requirement(s) scoring below ${this.config.minTestabilityThreshold}`
      );
    }

    // Dependency chain warning
    if (dependencyGraph) {
      const heavilyDependedOn = this.findHeavilyDependedRequirements(
        requirements,
        dependencyGraph.edges
      );
      if (heavilyDependedOn.length > 0) {
        recommendations.push(
          `Prioritize ${heavilyDependedOn.length} requirement(s) that block others`
        );
      }
    }

    // High priority items
    const criticalItems = requirements.filter((r) => r.priority === 'critical');
    if (criticalItems.length > 0) {
      recommendations.push(
        `Ensure ${criticalItems.length} critical priority requirement(s) are addressed first`
      );
    }

    // Average score recommendation
    const avgScore =
      Array.from(scores.values()).reduce((sum, s) => sum + s.value, 0) / scores.size;
    if (avgScore < 70) {
      recommendations.push(
        `Overall testability average (${Math.round(avgScore)}) is below recommended level of 70`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Sprint requirements are well-defined and ready for development');
    }

    return recommendations;
  }

  private findHeavilyDependedRequirements(
    _requirements: Requirement[],
    edges: Array<{ from: string; to: string; type: string }>
  ): string[] {
    const dependencyCount = new Map<string, number>();

    for (const edge of edges) {
      if (edge.type === 'depends-on') {
        const count = dependencyCount.get(edge.to) || 0;
        dependencyCount.set(edge.to, count + 1);
      }
    }

    return Array.from(dependencyCount.entries())
      .filter(([, count]) => count >= 2)
      .map(([id]) => id);
  }

  private sanitizeFilename(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
  }

  // ============================================================================
  // State Persistence
  // ============================================================================

  private async loadWorkflowState(): Promise<void> {
    const savedState = await this.memory.get<WorkflowStatus[]>(
      'requirements-validation:coordinator:workflows'
    );

    if (savedState) {
      for (const workflow of savedState) {
        if (workflow.status === 'running') {
          workflow.status = 'failed';
          workflow.error = 'Coordinator restarted';
          workflow.completedAt = new Date();
        }
        this.workflows.set(workflow.id, workflow);
      }
    }
  }

  private async saveWorkflowState(): Promise<void> {
    const workflows = Array.from(this.workflows.values());
    await this.memory.set(
      'requirements-validation:coordinator:workflows',
      workflows,
      { namespace: 'requirements-validation', persist: true }
    );
  }
}
