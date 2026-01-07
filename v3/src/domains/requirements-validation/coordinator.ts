/**
 * Agentic QE v3 - Requirements Validation Coordinator
 * Orchestrates the requirements validation workflow across services
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
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkflows: 5,
  defaultTimeout: 60000,
  publishEvents: true,
  minTestabilityThreshold: 60,
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

    this.initialized = true;
  }

  /**
   * Dispose and cleanup
   */
  async dispose(): Promise<void> {
    await this.saveWorkflowState();
    this.workflows.clear();
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

      // Generate BDD scenarios with examples
      const scenariosResult = await this.bddWriter.generateScenariosWithExamples(
        requirement,
        3
      );

      if (!scenariosResult.success) {
        this.failWorkflow(workflowId, scenariosResult.error.message);
        return err(scenariosResult.error);
      }
      this.updateWorkflowProgress(workflowId, 50);

      // Generate Gherkin files
      const gherkinContent = this.bddWriter.toGherkin(scenariosResult.value);
      const gherkinFile: GherkinFile = {
        path: `features/${this.sanitizeFilename(requirement.title)}.feature`,
        content: gherkinContent,
        scenarioCount: scenariosResult.value.length,
      };
      this.updateWorkflowProgress(workflowId, 70);

      // Generate test case outlines
      const testCaseOutlines = this.generateTestCaseOutlines(
        requirement,
        scenariosResult.value
      );
      this.updateWorkflowProgress(workflowId, 90);

      const artifacts: TestArtifacts = {
        requirementId,
        bddScenarios: scenariosResult.value,
        gherkinFiles: [gherkinFile],
        testCaseOutlines,
      };

      // Stop agent and complete workflow
      await this.agentCoordinator.stop(agentResult.value);
      this.completeWorkflow(workflowId);

      // Publish event
      if (this.config.publishEvents) {
        await this.publishBDDScenariosGenerated(requirementId, scenariosResult.value);
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
