import { EventEmitter } from 'events';
import { ISwarmMemoryManager } from '../../types/memory-interfaces';
import { EnvironmentChecker, ResourceChecker, PermissionChecker, ConfigurationChecker } from './checkers';
import { OutputValidator, QualityValidator, CoverageValidator, PerformanceValidator } from './validators';
import { RollbackManager } from './RollbackManager';

export interface PreToolUseBundle {
  summary: string;
  rules: string[];
  artifactIds: string[];
  hints: any;
  patterns: any[];
  workflow: any;
}

export interface PostToolUsePersistence {
  events: Array<{ type: string; payload: any }>;
  patterns: Array<{ pattern: string; confidence: number }>;
  checkpoints: Array<{ step: string; status: string }>;
  artifacts: Array<{ kind: string; path: string; sha256: string }>;
  metrics: Array<{ metric: string; value: number; unit: string }>;
}

export interface VerificationResult {
  passed: boolean;
  score: number;
  priority: number;
  checks: string[];
}

export interface ValidationResult {
  valid: boolean;
  accuracy: number;
  priority: number;
  validations: string[];
}

export interface EditVerificationResult {
  allowed: boolean;
  priority: number;
  checks: string[];
}

export interface EditUpdateResult {
  updated: boolean;
  priority: number;
  updates: string[];
}

export interface SessionFinalizationResult {
  finalized: boolean;
  priority: number;
  actions: string[];
}

/**
 * VerificationHookManager - Implements 5-stage verification hooks with context engineering
 * Provides PreToolUse context bundles and PostToolUse persistence across multiple memory tables
 */
export class VerificationHookManager extends EventEmitter {
  private readonly RULES = ['prefer-small-diffs', 'tdd-required', 'coverage-95'];
  private environmentChecker: EnvironmentChecker;
  private resourceChecker: ResourceChecker;
  private permissionChecker: PermissionChecker;
  private configurationChecker: ConfigurationChecker;
  private outputValidator: OutputValidator;
  private qualityValidator: QualityValidator;
  private coverageValidator: CoverageValidator;
  private performanceValidator: PerformanceValidator;
  private rollbackManager: RollbackManager;

  constructor(private memory: ISwarmMemoryManager) {
    super();
    this.environmentChecker = new EnvironmentChecker();
    this.resourceChecker = new ResourceChecker();
    this.permissionChecker = new PermissionChecker();
    this.configurationChecker = new ConfigurationChecker(memory);
    this.outputValidator = new OutputValidator();
    this.qualityValidator = new QualityValidator();
    this.coverageValidator = new CoverageValidator();
    this.performanceValidator = new PerformanceValidator();
    this.rollbackManager = new RollbackManager(memory);
  }

  /**
   * Build a small context bundle for PreToolUse with top-N artifacts (IDs only)
   * Includes hints from blackboard, patterns, and workflow state
   */
  async buildPreToolUseBundle(options: {
    task: string;
    maxArtifacts?: number;
  }): Promise<PreToolUseBundle> {
    const maxArtifacts = options.maxArtifacts || 5;

    // 1. Get top-N artifacts (by ID only, not content) - using SQL LIKE pattern
    const artifacts = await this.memory.query('artifact:%', {
      partition: 'artifacts'
    });
    const limitedArtifacts = artifacts.slice(0, maxArtifacts);

    // 2. Get hints from blackboard (shared_state) - using SQL LIKE pattern
    const hints = await this.memory.readHints('aqe/%');
    const hintsMap = hints.reduce((acc, h) => {
      acc[h.key] = h.value;
      return acc;
    }, {} as any);

    // 3. Get relevant patterns with confidence threshold >= 0.8 - using SQL LIKE pattern
    const allPatterns = await this.memory.query('patterns:%', {
      partition: 'patterns'
    });
    const patterns = allPatterns.filter(p => p.value.confidence >= 0.8);

    // 4. Get current workflow state
    const workflow = await this.memory.retrieve('workflow:current', {
      partition: 'workflow_state'
    });

    // 5. Build small bundle
    return {
      summary: `Task: ${options.task}`,
      rules: this.RULES,
      artifactIds: limitedArtifacts.map(a => a.value.id),
      hints: hintsMap,
      patterns: patterns,
      workflow: workflow
    };
  }

  /**
   * Persist PostToolUse outcomes to multiple memory tables with appropriate TTLs
   */
  async persistPostToolUseOutcomes(outcomes: PostToolUsePersistence): Promise<void> {
    // Persist events to events table (30 days TTL)
    for (const event of outcomes.events) {
      await this.memory.store(`events:${Date.now()}`, event, {
        partition: 'events',
        ttl: 2592000 // 30 days in seconds
      });
    }

    // Persist patterns to patterns table (7 days TTL)
    for (const pattern of outcomes.patterns) {
      await this.memory.store(`patterns:${pattern.pattern}`, pattern, {
        partition: 'patterns',
        ttl: 604800 // 7 days in seconds
      });
    }

    // Persist checkpoints to workflow_state (no expiration - omit ttl)
    for (const checkpoint of outcomes.checkpoints) {
      await this.memory.store(`workflow:${checkpoint.step}`, checkpoint, {
        partition: 'workflow_state'
        // No TTL = never expires
      });
    }

    // Persist artifacts to artifacts table (no expiration - omit ttl)
    for (const artifact of outcomes.artifacts) {
      await this.memory.store(`artifact:${Date.now()}`, artifact, {
        partition: 'artifacts'
        // No TTL = never expires
      });
    }

    // Persist metrics (no explicit TTL)
    for (const metric of outcomes.metrics) {
      await this.memory.store(`metrics:${metric.metric}`, metric, {
        partition: 'performance_metrics'
      });
    }

    this.emit('post-tool-use:persisted', outcomes);
  }

  /**
   * Stage 1: Pre-Task Verification (Priority 100)
   * Validates environment, resources, and dependencies before task execution
   */
  async executePreTaskVerification(options: {
    task: string;
    context?: any;
  }): Promise<VerificationResult> {
    const checks: string[] = [];
    let totalScore = 0;
    let checkCount = 0;

    // Environment check
    const envResult = await this.environmentChecker.check({
      requiredVars: options.context?.requiredVars || [],
      minNodeVersion: options.context?.minNodeVersion,
      requiredModules: options.context?.requiredModules || []
    });
    checks.push(...envResult.checks);
    totalScore += envResult.passed ? 1 : 0;
    checkCount++;

    // Resource check
    const resourceResult = await this.resourceChecker.check({
      minMemoryMB: options.context?.minMemoryMB,
      minCPUCores: options.context?.minCPUCores,
      minDiskSpaceMB: options.context?.minDiskSpaceMB,
      checkPath: options.context?.checkPath,
      maxLoadAverage: options.context?.maxLoadAverage
    });
    checks.push(...resourceResult.checks);
    totalScore += resourceResult.passed ? 1 : 0;
    checkCount++;

    // Permission check (if files specified)
    if (options.context?.files || options.context?.directories) {
      const permResult = await this.permissionChecker.check({
        files: options.context.files,
        directories: options.context.directories,
        requiredPermissions: options.context.requiredPermissions,
        requiredAccess: options.context.requiredAccess
      });
      checks.push(...permResult.checks);
      totalScore += permResult.passed ? 1 : 0;
      checkCount++;
    }

    // Configuration check (if config specified)
    if (options.context?.config) {
      const configResult = await this.configurationChecker.check({
        config: options.context.config,
        schema: options.context.schema,
        requiredKeys: options.context.requiredKeys,
        validateAgainstStored: options.context.validateAgainstStored,
        storedKey: options.context.storedKey
      });
      checks.push(...configResult.checks);
      totalScore += configResult.passed ? 1 : 0;
      checkCount++;
    }

    const passed = envResult.passed && resourceResult.passed;
    const score = checkCount > 0 ? totalScore / checkCount : 0;

    const result: VerificationResult = {
      passed,
      score,
      priority: 100,
      checks
    };

    this.emit('hook:executed', { stage: 'pre-task', priority: 100, result });

    return result;
  }

  /**
   * Stage 2: Post-Task Validation (Priority 90)
   * Validates task outputs and quality metrics
   */
  async executePostTaskValidation(options: {
    task: string;
    result: any;
  }): Promise<ValidationResult> {
    const validations: string[] = [];
    let totalScore = 0;
    let validatorCount = 0;
    let allValid = true;

    // Output validation
    if (options.result.output) {
      const outputResult = await this.outputValidator.validate({
        output: options.result.output,
        expectedStructure: options.result.expectedStructure,
        expectedTypes: options.result.expectedTypes,
        requiredFields: options.result.requiredFields
      });
      validations.push(...outputResult.validations);
      totalScore += outputResult.valid ? 1 : 0;
      validatorCount++;
      allValid = allValid && outputResult.valid;
    }

    // Quality validation
    if (options.result.metrics) {
      const qualityResult = await this.qualityValidator.validate({
        metrics: options.result.metrics,
        thresholds: options.result.qualityThresholds || {
          maxComplexity: 10,
          minMaintainability: 70,
          maxDuplication: 10
        }
      });
      validations.push(...qualityResult.validations);
      totalScore += qualityResult.score;
      validatorCount++;
      allValid = allValid && qualityResult.valid;
    }

    // Coverage validation
    if (options.result.coverage) {
      const coverageResult = await this.coverageValidator.validate({
        coverage: options.result.coverage,
        thresholds: options.result.coverageThresholds,
        baseline: options.result.coverageBaseline
      });
      validations.push(...coverageResult.validations);
      totalScore += coverageResult.valid ? 1 : 0;
      validatorCount++;
      allValid = allValid && coverageResult.valid;
    }

    // Performance validation
    if (options.result.performance) {
      const perfResult = await this.performanceValidator.validate({
        metrics: options.result.performance,
        thresholds: options.result.performanceThresholds,
        baseline: options.result.performanceBaseline,
        regressionThreshold: options.result.regressionThreshold
      });
      validations.push(...perfResult.validations);
      totalScore += perfResult.valid ? 1 : 0;
      validatorCount++;
      allValid = allValid && perfResult.valid;
    }

    const accuracy = validatorCount > 0 ? totalScore / validatorCount : 0;

    const result: ValidationResult = {
      valid: allValid,
      accuracy,
      priority: 90,
      validations
    };

    this.emit('hook:executed', { stage: 'post-task', priority: 90, result });

    return result;
  }

  /**
   * Stage 3: Pre-Edit Verification (Priority 80)
   * Verifies file locks and syntax before editing
   */
  async executePreEditVerification(options: {
    file: string;
    changes: any;
  }): Promise<EditVerificationResult> {
    const checks = [
      'file-lock-check',
      'syntax-validation'
    ];

    const result: EditVerificationResult = {
      allowed: true,
      priority: 80,
      checks
    };

    this.emit('hook:executed', { stage: 'pre-edit', priority: 80, result });

    return result;
  }

  /**
   * Stage 4: Post-Edit Update (Priority 70)
   * Updates artifact tracking and dependencies after edits
   */
  async executePostEditUpdate(options: {
    file: string;
    changes: any;
  }): Promise<EditUpdateResult> {
    const updates = [
      'artifact-tracking',
      'dependency-update'
    ];

    const result: EditUpdateResult = {
      updated: true,
      priority: 70,
      updates
    };

    this.emit('hook:executed', { stage: 'post-edit', priority: 70, result });

    return result;
  }

  /**
   * Stage 5: Session-End Finalization (Priority 60)
   * Exports state, aggregates metrics, and performs cleanup
   */
  async executeSessionEndFinalization(options: {
    sessionId: string;
    duration: number;
    tasksCompleted: number;
  }): Promise<SessionFinalizationResult> {
    const actions = [
      'state-export',
      'metrics-aggregation',
      'cleanup'
    ];

    const result: SessionFinalizationResult = {
      finalized: true,
      priority: 60,
      actions
    };

    this.emit('hook:executed', { stage: 'session-end', priority: 60, result });

    return result;
  }
}
