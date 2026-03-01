/**
 * Agentic QE v3 - Collaborative Test Task Claims
 * ADR-016: Claim system for coordinating test work between agents and humans
 *
 * Provides:
 * - ClaimService: Core claim operations (create, claim, release, steal)
 * - ClaimRepository: Persistent storage (in-memory and backend-based)
 * - WorkStealingCoordinator: Load balancing via work stealing
 * - HandoffManager: Human <-> Agent transitions
 *
 * Usage:
 * ```typescript
 * import {
 *   createClaimService,
 *   createInMemoryClaimRepository,
 *   createWorkStealingCoordinator,
 *   createHandoffManager,
 * } from 'agentic-qe/coordination/claims';
 *
 * // Setup
 * const repository = createInMemoryClaimRepository();
 * const claimService = createClaimService(repository, eventBus);
 * const workStealing = createWorkStealingCoordinator(claimService, repository, eventBus);
 * const handoffManager = createHandoffManager(claimService, repository, eventBus);
 *
 * // Initialize
 * await claimService.initialize();
 * await workStealing.initialize();
 * await handoffManager.initialize();
 *
 * // Create a claim
 * const claim = await claimService.createClaim({
 *   type: 'coverage-gap',
 *   priority: 'p1',
 *   domain: 'test-generation',
 *   title: 'UserService needs tests for authentication methods',
 *   metadata: {
 *     filePath: 'src/services/user.service.ts',
 *     uncoveredLines: [45, 46, 47, 89, 90],
 *     currentCoverage: 65,
 *     targetCoverage: 80,
 *   },
 * });
 *
 * // Claim it
 * const claimed = await claimService.claim({
 *   claimId: claim.id,
 *   claimant: {
 *     id: 'agent-123',
 *     type: 'agent',
 *     name: 'Test Generator Agent',
 *     domain: 'test-generation',
 *     agentType: 'generator',
 *   },
 * });
 *
 * // Request human review when done
 * await handoffManager.requestHumanReview(claim.id, 'Tests generated, please review');
 * ```
 */

// ============================================================================
// Interfaces & Types
// ============================================================================

export type {
  // Core types
  ClaimType,
  ClaimStatus,
  ClaimantType,
  Claimant,
  Claim,
  ClaimResult,
  ClaimMetadata,

  // Metadata types
  CoverageGapMetadata,
  FlakyTestMetadata,
  DefectInvestigationMetadata,
  TestReviewMetadata,

  // Operation inputs
  CreateClaimInput,
  ClaimInput,
  ReleaseClaimInput,
  StealClaimInput,
  HandoffInput,

  // Query types
  ClaimFilter,
  ClaimSortOptions,

  // Events
  ClaimEventType,
  ClaimEvent,

  // Configuration
  ClaimExpiryConfig,
  WorkStealingConfig,
  ClaimServiceConfig,

  // Metrics
  ClaimMetrics,

  // Service interfaces
  IClaimRepository,
  IClaimService,
  IWorkStealingCoordinator,
  IHandoffManager,
  PendingHandoff,
} from './interfaces';

// ============================================================================
// Repository
// ============================================================================

export {
  InMemoryClaimRepository,
  PersistentClaimRepository,
  createInMemoryClaimRepository,
  createPersistentClaimRepository,
} from './claim-repository';

// ============================================================================
// Claim Service
// ============================================================================

export {
  ClaimService,
  createClaimService,
} from './claim-service';

// ============================================================================
// Work Stealing
// ============================================================================

export {
  WorkStealingCoordinator,
  createWorkStealingCoordinator,
  canAgentHandleClaimType,
  calculateStealPriority,
} from './work-stealing';

// ============================================================================
// Handoff Manager
// ============================================================================

export {
  HandoffManager,
  createHandoffManager,
  suggestClaimTypeForHandoff,
  calculateHandoffPriority,
} from './handoff-manager';

export type {
  HandoffManagerConfig,
  HandoffStatistics,
} from './handoff-manager';

// ============================================================================
// Factory: Complete Claims System
// ============================================================================

import { EventBus, MemoryBackend } from '../../kernel/interfaces';
import { IClaimService, IClaimRepository, IWorkStealingCoordinator, IHandoffManager, ClaimServiceConfig, WorkStealingConfig } from './interfaces';
import { createInMemoryClaimRepository, createPersistentClaimRepository } from './claim-repository';
import { createClaimService } from './claim-service';
import { createWorkStealingCoordinator } from './work-stealing';
import { createHandoffManager, HandoffManagerConfig } from './handoff-manager';

/**
 * Complete claims system configuration
 */
export interface ClaimsSystemConfig {
  /** Use persistent storage (requires memory backend) */
  persistent?: boolean;

  /** Memory backend for persistent storage */
  memory?: MemoryBackend;

  /** Namespace for storage */
  namespace?: string;

  /** Claim service configuration */
  claimService?: Partial<ClaimServiceConfig>;

  /** Work stealing configuration */
  workStealing?: Partial<WorkStealingConfig>;

  /** Handoff manager configuration */
  handoffManager?: Partial<HandoffManagerConfig>;
}

/**
 * Complete claims system components
 */
export interface ClaimsSystem {
  repository: IClaimRepository;
  service: IClaimService;
  workStealing: IWorkStealingCoordinator;
  handoffManager: IHandoffManager;

  /** Initialize all components */
  initialize(): Promise<void>;

  /** Dispose all components */
  dispose(): Promise<void>;
}

/**
 * Create a complete claims system with all components
 *
 * @example
 * ```typescript
 * const claimsSystem = createClaimsSystem(eventBus, {
 *   persistent: true,
 *   memory: memoryBackend,
 *   workStealing: { enabled: true },
 * });
 *
 * await claimsSystem.initialize();
 *
 * // Use the system
 * const claim = await claimsSystem.service.createClaim({ ... });
 *
 * // Cleanup
 * await claimsSystem.dispose();
 * ```
 */
export function createClaimsSystem(
  eventBus?: EventBus,
  config: ClaimsSystemConfig = {}
): ClaimsSystem {
  // Create repository
  const repository: IClaimRepository = config.persistent && config.memory
    ? createPersistentClaimRepository(config.memory, config.namespace)
    : createInMemoryClaimRepository();

  // Create service
  const service = createClaimService(repository, eventBus, config.claimService);

  // Create work stealing coordinator
  const workStealing = createWorkStealingCoordinator(
    service,
    repository,
    eventBus,
    config.workStealing
  );

  // Create handoff manager
  const handoffManager = createHandoffManager(
    service,
    repository,
    eventBus,
    config.handoffManager
  );

  return {
    repository,
    service,
    workStealing,
    handoffManager,

    async initialize(): Promise<void> {
      await service.initialize();
      await workStealing.initialize();
      await handoffManager.initialize();
    },

    async dispose(): Promise<void> {
      await handoffManager.dispose();
      await workStealing.dispose();
      await service.dispose();
    },
  };
}
