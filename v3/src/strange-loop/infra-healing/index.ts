/**
 * Infrastructure Self-Healing Module
 * ADR-056: Infrastructure Self-Healing Extension for Strange Loop
 *
 * Extends the Strange Loop self-awareness system to detect and recover from
 * infrastructure failures during test execution. Framework-agnostic via
 * YAML-driven recovery playbooks.
 *
 * @module strange-loop/infra-healing
 */

// Types
export type {
  TestOutputClassification,
  InfraErrorSignature,
  ClassifiedError,
  TestOutputObservation,
  CommandRunner,
  CommandResult,
  RecoveryCommand,
  ServiceRecoveryPlan,
  RecoveryPlaybookConfig,
  CoordinationLockEntry,
  LockAcquireResult,
  RecoveryAttemptResult,
  ServiceRecoveryResult,
  InfraHealingConfig,
  InfraHealingStats,
} from './types.js';

export { DEFAULT_INFRA_HEALING_CONFIG, createEmptyStats } from './types.js';

// Test Output Observer
export {
  TestOutputObserver,
  createTestOutputObserver,
  DEFAULT_ERROR_SIGNATURES,
} from './test-output-observer.js';

// Recovery Playbook
export {
  RecoveryPlaybook,
  createRecoveryPlaybook,
} from './recovery-playbook.js';

// Coordination Lock
export {
  CoordinationLock,
  createCoordinationLock,
} from './coordination-lock.js';

// Infrastructure Action Executor
export {
  InfraActionExecutor,
  createInfraActionExecutor,
  NoOpCommandRunner,
  ShellCommandRunner,
} from './infra-action-executor.js';

// Composite Action Executor
export {
  CompositeActionExecutor,
  createCompositeActionExecutor,
} from './composite-action-executor.js';

// Infrastructure-Aware Agent Provider
export {
  InfraAwareAgentProvider,
  createInfraAwareAgentProvider,
} from './infra-aware-agent-provider.js';

// Orchestrator
export {
  InfraHealingOrchestrator,
  createInfraHealingOrchestrator,
  createInfraHealingOrchestratorSync,
  type InfraHealingOrchestratorOptions,
} from './infra-healing-orchestrator.js';
