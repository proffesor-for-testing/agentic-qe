/**
 * Federated Learning Coordinator
 *
 * High-level API for federated learning that coordinates training rounds,
 * monitors convergence, handles participant failures, and integrates with
 * AgentChannel for peer communication.
 *
 * @module edge/p2p/federated/FederatedCoordinator
 * @version 1.0.0
 */

import type {
  FederatedConfig,
  ModelWeights,
  ModelCheckpoint,
  ModelUpdate,
  TrainingMetrics,
  PrivacyBudget,
  RoundMetrics,
  AggregationResult,
  FederatedEvent,
  FederatedEventHandler,
  ParticipantCapabilities,
  JoinRequest,
  JoinResponse,
  UpdateSubmission,
  RoundAnnouncement,
  AggregationBroadcast,
  ConvergenceCriteria,
} from './types';
import {
  RoundStatus,
  FederatedEventType,
  ConvergenceStatus,
  AggregationStrategy,
  SelectionStrategy,
  FederatedError,
  FederatedErrorCode,
  DEFAULT_FEDERATED_CONFIG,
  FL_DEFAULT_DP_CONFIG,
  DEFAULT_CONVERGENCE_CRITERIA,
} from './types';
import { GradientAggregator, type GradientAggregatorConfig } from './GradientAggregator';
import { FederatedRound, type RoundConfig, type ParticipantInfo, RoundEventType } from './FederatedRound';
import { ModelManager, type ModelManagerConfig, createModelArchitecture } from './ModelManager';

// ============================================
// Types
// ============================================

/**
 * Coordinator configuration
 */
export interface CoordinatorConfig {
  /** Federated learning configuration */
  federatedConfig: FederatedConfig;

  /** Model manager configuration */
  modelConfig: ModelManagerConfig;

  /** Gradient aggregator configuration */
  aggregatorConfig?: Partial<GradientAggregatorConfig>;

  /** Initial model weights */
  initialWeights?: ModelWeights;

  /** Message transport adapter */
  transport?: TransportAdapter;
}

/**
 * Transport adapter for peer communication
 */
export interface TransportAdapter {
  /** Send message to specific participant */
  send(participantId: string, message: unknown): Promise<void>;

  /** Broadcast message to all participants */
  broadcast(message: unknown): Promise<void>;

  /** Subscribe to incoming messages */
  onMessage(handler: (participantId: string, message: unknown) => void): void;

  /** Get available participants */
  getAvailableParticipants(): Promise<Map<string, ParticipantInfo>>;
}

/**
 * Coordinator state
 */
interface CoordinatorState {
  /** Session identifier */
  sessionId: string;

  /** Whether training is active */
  isTraining: boolean;

  /** Current round number */
  currentRound: number;

  /** Total planned rounds */
  totalRounds: number;

  /** Current federated round */
  activeRound: FederatedRound | null;

  /** Convergence status */
  convergenceStatus: ConvergenceStatus;

  /** Training start time */
  startTime: number | null;

  /** Training end time */
  endTime: number | null;

  /** Rounds without improvement */
  roundsWithoutImprovement: number;

  /** Best loss achieved */
  bestLoss: number;

  /** Best round number */
  bestRound: number;
}

/**
 * Training result
 */
export interface TrainingResult {
  /** Whether training completed successfully */
  success: boolean;

  /** Final model weights */
  finalModel: ModelWeights | null;

  /** Training metrics summary */
  metrics: TrainingMetrics;

  /** Final privacy budget status */
  privacyBudget?: PrivacyBudget;

  /** Checkpoints created */
  checkpoints: string[];

  /** Errors encountered */
  errors: string[];
}

// ============================================
// FederatedCoordinator Class
// ============================================

/**
 * High-level federated learning coordinator
 *
 * @example
 * ```typescript
 * const coordinator = new FederatedCoordinator({
 *   federatedConfig: {
 *     sessionId: 'training-session-1',
 *     modelId: 'my-model',
 *     aggregationStrategy: AggregationStrategy.FED_AVG,
 *     selectionStrategy: SelectionStrategy.RANDOM,
 *     totalRounds: 100,
 *     minParticipation: 0.3,
 *   },
 *   modelConfig: {
 *     architecture: modelArchitecture,
 *     optimizer: { type: 'adam', learningRate: 0.001 },
 *   },
 *   transport: channelTransport,
 * });
 *
 * // Start training
 * coordinator.on(event => console.log(event));
 * const result = await coordinator.startTraining();
 * ```
 */
export class FederatedCoordinator {
  private config: CoordinatorConfig;
  private federatedConfig: FederatedConfig;
  private state: CoordinatorState;
  private modelManager: ModelManager;
  private aggregator: GradientAggregator;
  private transport: TransportAdapter | null;
  private eventHandlers: FederatedEventHandler[] = [];
  private checkpointIds: string[] = [];
  private errors: string[] = [];
  private lossHistory: number[] = [];
  private accuracyHistory: number[] = [];
  private roundHistory: RoundMetrics[] = [];

  constructor(config: CoordinatorConfig) {
    this.config = config;

    // Merge with defaults
    this.federatedConfig = {
      ...DEFAULT_FEDERATED_CONFIG,
      ...config.federatedConfig,
    } as FederatedConfig;

    // Initialize state
    this.state = {
      sessionId: this.federatedConfig.sessionId,
      isTraining: false,
      currentRound: 0,
      totalRounds: this.federatedConfig.totalRounds,
      activeRound: null,
      convergenceStatus: ConvergenceStatus.NOT_STARTED,
      startTime: null,
      endTime: null,
      roundsWithoutImprovement: 0,
      bestLoss: Infinity,
      bestRound: 0,
    };

    // Initialize components
    this.modelManager = new ModelManager(config.modelConfig);
    this.aggregator = new GradientAggregator({
      strategy: this.federatedConfig.aggregationStrategy,
      enableClipping: this.federatedConfig.enableGradientClipping,
      clipNorm: this.federatedConfig.gradientClipNorm,
      differentialPrivacy: this.federatedConfig.differentialPrivacy,
      secureAggregation: this.federatedConfig.secureAggregation,
      proximalMu: this.federatedConfig.proximalMu,
      ...config.aggregatorConfig,
    });

    this.transport = config.transport ?? null;

    // Set initial weights if provided
    if (config.initialWeights) {
      this.modelManager.setWeights(config.initialWeights);
    }

    // Setup message handling if transport provided
    if (this.transport) {
      this.setupMessageHandling();
    }
  }

  // ============================================
  // Training Lifecycle
  // ============================================

  /**
   * Start federated training
   */
  async startTraining(): Promise<TrainingResult> {
    if (this.state.isTraining) {
      throw new FederatedError(
        'Training already in progress',
        FederatedErrorCode.INVALID_CONFIG
      );
    }

    // Validate configuration
    this.validateConfiguration();

    // Initialize state
    this.state.isTraining = true;
    this.state.startTime = Date.now();
    this.state.currentRound = 0;
    this.state.convergenceStatus = ConvergenceStatus.TRAINING;
    this.errors = [];
    this.lossHistory = [];
    this.accuracyHistory = [];
    this.roundHistory = [];
    this.checkpointIds = [];

    this.emitEvent({
      type: FederatedEventType.SESSION_STARTED,
      timestamp: Date.now(),
      sessionId: this.state.sessionId,
      details: {
        totalRounds: this.state.totalRounds,
        config: this.federatedConfig,
      },
    });

    try {
      // Run training rounds
      await this.runTrainingLoop();

      // Training completed
      this.state.isTraining = false;
      this.state.endTime = Date.now();

      const result = this.buildTrainingResult(true);

      this.emitEvent({
        type: FederatedEventType.SESSION_ENDED,
        timestamp: Date.now(),
        sessionId: this.state.sessionId,
        details: { result },
      });

      return result;

    } catch (error) {
      this.state.isTraining = false;
      this.state.endTime = Date.now();
      this.state.convergenceStatus = ConvergenceStatus.DIVERGING;

      const errorMessage = error instanceof Error ? error.message : String(error);
      this.errors.push(errorMessage);

      this.emitEvent({
        type: FederatedEventType.SESSION_ENDED,
        timestamp: Date.now(),
        sessionId: this.state.sessionId,
        details: { error: errorMessage },
      });

      return this.buildTrainingResult(false);
    }
  }

  /**
   * Stop training
   */
  stopTraining(reason: string = 'Training stopped by user'): void {
    if (!this.state.isTraining) return;

    if (this.state.activeRound) {
      this.state.activeRound.cancel(reason);
    }

    this.state.isTraining = false;
    this.state.endTime = Date.now();
    this.errors.push(reason);

    this.emitEvent({
      type: FederatedEventType.SESSION_ENDED,
      timestamp: Date.now(),
      sessionId: this.state.sessionId,
      details: { reason, stopped: true },
    });
  }

  /**
   * Pause training (can be resumed)
   */
  pauseTraining(): void {
    if (!this.state.isTraining) return;
    // Mark as paused - training loop will check this
    this.state.isTraining = false;
  }

  /**
   * Resume training after pause
   */
  async resumeTraining(): Promise<TrainingResult> {
    if (this.state.isTraining) {
      throw new FederatedError(
        'Training is already active',
        FederatedErrorCode.INVALID_CONFIG
      );
    }

    if (this.state.currentRound >= this.state.totalRounds) {
      throw new FederatedError(
        'Training already completed',
        FederatedErrorCode.INVALID_CONFIG
      );
    }

    this.state.isTraining = true;
    this.state.convergenceStatus = ConvergenceStatus.TRAINING;

    try {
      await this.runTrainingLoop();
      this.state.isTraining = false;
      this.state.endTime = Date.now();
      return this.buildTrainingResult(true);
    } catch (error) {
      this.state.isTraining = false;
      this.errors.push(error instanceof Error ? error.message : String(error));
      return this.buildTrainingResult(false);
    }
  }

  // ============================================
  // Training Loop
  // ============================================

  /**
   * Main training loop
   */
  private async runTrainingLoop(): Promise<void> {
    while (
      this.state.isTraining &&
      this.state.currentRound < this.state.totalRounds &&
      !this.shouldStopEarly()
    ) {
      // Check privacy budget
      if (this.federatedConfig.differentialPrivacy?.enabled) {
        if (this.aggregator.isPrivacyBudgetExhausted()) {
          this.emitEvent({
            type: FederatedEventType.PRIVACY_BUDGET_EXHAUSTED,
            timestamp: Date.now(),
            sessionId: this.state.sessionId,
            details: { budget: this.aggregator.getPrivacyBudget() },
          });
          break;
        }
      }

      // Run a round
      await this.runRound();

      // Check for convergence
      this.updateConvergenceStatus();

      // Create checkpoint if needed
      if (this.state.currentRound % this.federatedConfig.checkpointInterval === 0) {
        await this.createCheckpoint();
      }
    }
  }

  /**
   * Run a single training round
   */
  private async runRound(): Promise<void> {
    const roundNumber = this.state.currentRound;

    // Get available participants
    const participants = await this.getAvailableParticipants();

    if (participants.size < this.getMinParticipants()) {
      throw new FederatedError(
        'Insufficient participants available',
        FederatedErrorCode.INSUFFICIENT_PARTICIPANTS
      );
    }

    // Get current model
    const globalModel = this.modelManager.getWeights();
    if (!globalModel) {
      throw new FederatedError(
        'No model weights available',
        FederatedErrorCode.INVALID_CONFIG
      );
    }

    // Create round configuration
    const roundConfig: RoundConfig = {
      sessionId: this.state.sessionId,
      roundNumber,
      federatedConfig: this.federatedConfig,
      globalModel,
      availableParticipants: participants,
      aggregator: this.aggregator,
      sendMessage: this.sendMessage.bind(this),
      broadcastMessage: this.broadcastMessage.bind(this),
    };

    // Create and start round
    const round = new FederatedRound(roundConfig);
    this.state.activeRound = round;

    // Setup round event forwarding
    round.on((event) => {
      this.handleRoundEvent(event, round);
    });

    this.emitEvent({
      type: FederatedEventType.ROUND_STARTED,
      timestamp: Date.now(),
      sessionId: this.state.sessionId,
      roundId: round.getRoundId(),
      details: { roundNumber },
    });

    try {
      await round.start();
      const result = await round.waitForCompletion();

      // Apply aggregated model
      this.modelManager.applyUpdate(result.aggregatedWeights);

      // Update metrics
      const metrics = round.getMetrics();
      this.lossHistory.push(metrics.aggregatedLoss);
      if (metrics.aggregatedAccuracy !== undefined) {
        this.accuracyHistory.push(metrics.aggregatedAccuracy);
      }
      this.roundHistory.push(metrics);

      // Update best
      if (metrics.aggregatedLoss < this.state.bestLoss) {
        this.state.bestLoss = metrics.aggregatedLoss;
        this.state.bestRound = roundNumber;
        this.state.roundsWithoutImprovement = 0;
      } else {
        this.state.roundsWithoutImprovement++;
      }

      this.emitEvent({
        type: FederatedEventType.ROUND_COMPLETED,
        timestamp: Date.now(),
        sessionId: this.state.sessionId,
        roundId: round.getRoundId(),
        details: { metrics, result },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.errors.push(`Round ${roundNumber}: ${errorMessage}`);

      this.emitEvent({
        type: FederatedEventType.ROUND_FAILED,
        timestamp: Date.now(),
        sessionId: this.state.sessionId,
        roundId: round.getRoundId(),
        details: { error: errorMessage },
      });

      // Don't throw - continue to next round if possible
    }

    this.state.activeRound = null;
    this.state.currentRound++;
  }

  // ============================================
  // Convergence Monitoring
  // ============================================

  /**
   * Update convergence status based on training progress
   */
  private updateConvergenceStatus(): void {
    const criteria = this.federatedConfig.convergence ?? DEFAULT_CONVERGENCE_CRITERIA;

    // Check if target accuracy reached
    if (criteria.targetAccuracy !== undefined && this.accuracyHistory.length > 0) {
      const latestAccuracy = this.accuracyHistory[this.accuracyHistory.length - 1];
      if (latestAccuracy >= criteria.targetAccuracy) {
        this.state.convergenceStatus = ConvergenceStatus.CONVERGED;

        this.emitEvent({
          type: FederatedEventType.CONVERGENCE_DETECTED,
          timestamp: Date.now(),
          sessionId: this.state.sessionId,
          details: {
            reason: 'target_accuracy_reached',
            accuracy: latestAccuracy,
          },
        });
        return;
      }
    }

    // Check loss improvement
    if (this.lossHistory.length >= 2) {
      const prevLoss = this.lossHistory[this.lossHistory.length - 2];
      const currLoss = this.lossHistory[this.lossHistory.length - 1];
      const improvement = (prevLoss - currLoss) / prevLoss;

      if (improvement < criteria.minLossImprovement) {
        // Not improving much
        if (this.state.roundsWithoutImprovement >= criteria.patience) {
          this.state.convergenceStatus = ConvergenceStatus.PLATEAUED;
        }
      } else if (currLoss > prevLoss * 1.5) {
        // Loss increasing significantly - diverging
        this.state.convergenceStatus = ConvergenceStatus.DIVERGING;
      } else {
        // Making progress
        this.state.convergenceStatus = ConvergenceStatus.CONVERGING;
      }
    }

    // Check if converged (no improvement for extended period with low variance)
    if (this.state.roundsWithoutImprovement >= criteria.patience * 2) {
      const recentLosses = this.lossHistory.slice(-criteria.patience);
      const variance = this.computeVariance(recentLosses);

      if (variance < 0.001) {
        this.state.convergenceStatus = ConvergenceStatus.CONVERGED;

        this.emitEvent({
          type: FederatedEventType.CONVERGENCE_DETECTED,
          timestamp: Date.now(),
          sessionId: this.state.sessionId,
          details: {
            reason: 'loss_stabilized',
            variance,
          },
        });
      }
    }
  }

  /**
   * Check if early stopping should trigger
   */
  private shouldStopEarly(): boolean {
    const criteria = this.federatedConfig.convergence ?? DEFAULT_CONVERGENCE_CRITERIA;

    if (!criteria.earlyStoppingEnabled) return false;

    // Stop if converged
    if (this.state.convergenceStatus === ConvergenceStatus.CONVERGED) {
      return true;
    }

    // Stop if diverging badly
    if (this.state.convergenceStatus === ConvergenceStatus.DIVERGING) {
      return true;
    }

    // Stop if no improvement for too long
    if (this.state.roundsWithoutImprovement >= criteria.maxRoundsWithoutImprovement) {
      return true;
    }

    return false;
  }

  /**
   * Compute variance of an array of numbers
   */
  private computeVariance(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => (v - mean) ** 2);
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  // ============================================
  // Participant Management
  // ============================================

  /**
   * Get available participants
   */
  private async getAvailableParticipants(): Promise<Map<string, ParticipantInfo>> {
    if (this.transport) {
      return await this.transport.getAvailableParticipants();
    }

    // Return empty map if no transport
    return new Map();
  }

  /**
   * Get minimum required participants
   */
  private getMinParticipants(): number {
    return Math.max(1, Math.ceil(
      this.federatedConfig.maxParticipants * this.federatedConfig.minParticipation
    ));
  }

  // ============================================
  // Message Handling
  // ============================================

  /**
   * Setup message handling from transport
   */
  private setupMessageHandling(): void {
    this.transport!.onMessage((participantId, message) => {
      this.handleIncomingMessage(participantId, message);
    });
  }

  /**
   * Handle incoming message
   */
  private handleIncomingMessage(participantId: string, message: unknown): void {
    const msg = message as { type: string };

    switch (msg.type) {
      case 'join_request':
        this.handleJoinRequest(participantId, msg as JoinRequest);
        break;

      case 'update_submission':
        this.handleUpdateSubmission(participantId, msg as UpdateSubmission);
        break;

      default:
        // Unknown message type
        break;
    }
  }

  /**
   * Handle join request
   */
  private async handleJoinRequest(participantId: string, request: JoinRequest): Promise<void> {
    if (!this.state.activeRound) return;

    const response = await this.state.activeRound.handleJoinRequest(request);
    await this.sendMessage(participantId, response);
  }

  /**
   * Handle update submission
   */
  private async handleUpdateSubmission(participantId: string, submission: UpdateSubmission): Promise<void> {
    if (!this.state.activeRound) return;
    await this.state.activeRound.handleUpdateSubmission(submission);
  }

  /**
   * Send message to participant
   */
  private async sendMessage(participantId: string, message: unknown): Promise<void> {
    if (this.transport) {
      await this.transport.send(participantId, message);
    }
  }

  /**
   * Broadcast message to all participants
   */
  private async broadcastMessage(message: unknown): Promise<void> {
    if (this.transport) {
      await this.transport.broadcast(message);
    }
  }

  // ============================================
  // Checkpointing
  // ============================================

  /**
   * Create a checkpoint of current state
   */
  private async createCheckpoint(): Promise<void> {
    const metrics = this.buildTrainingMetrics();
    const checkpoint = this.modelManager.checkpoint(
      this.state.sessionId,
      this.state.currentRound,
      metrics
    );

    this.checkpointIds.push(checkpoint.checkpointId);

    this.emitEvent({
      type: FederatedEventType.CHECKPOINT_SAVED,
      timestamp: Date.now(),
      sessionId: this.state.sessionId,
      details: {
        checkpointId: checkpoint.checkpointId,
        roundNumber: checkpoint.roundNumber,
      },
    });
  }

  /**
   * Restore from checkpoint
   */
  restoreFromCheckpoint(checkpointId: string): void {
    this.modelManager.restoreCheckpoint(checkpointId);
    const checkpoints = this.modelManager.getCheckpoints();
    const restored = checkpoints.find((c) => c.checkpointId === checkpointId);

    if (restored) {
      this.state.currentRound = restored.roundNumber;
      this.lossHistory = restored.metrics.lossHistory;
      this.accuracyHistory = restored.metrics.accuracyHistory ?? [];
    }
  }

  /**
   * Rollback to previous round
   */
  rollback(): boolean {
    return this.modelManager.rollback();
  }

  // ============================================
  // Event Handling
  // ============================================

  /**
   * Handle round events
   */
  private handleRoundEvent(event: { type: RoundEventType; timestamp: number; details: unknown }, round: FederatedRound): void {
    // Forward relevant events
    switch (event.type) {
      case RoundEventType.PARTICIPANT_JOINED:
        this.emitEvent({
          type: FederatedEventType.PARTICIPANT_JOINED,
          timestamp: event.timestamp,
          sessionId: this.state.sessionId,
          roundId: round.getRoundId(),
          details: event.details,
        });
        break;

      case RoundEventType.UPDATE_RECEIVED:
        this.emitEvent({
          type: FederatedEventType.UPDATE_RECEIVED,
          timestamp: event.timestamp,
          sessionId: this.state.sessionId,
          roundId: round.getRoundId(),
          details: event.details,
        });
        break;

      case RoundEventType.AGGREGATION_STARTED:
        this.emitEvent({
          type: FederatedEventType.AGGREGATION_STARTED,
          timestamp: event.timestamp,
          sessionId: this.state.sessionId,
          roundId: round.getRoundId(),
          details: event.details,
        });
        break;

      case RoundEventType.AGGREGATION_COMPLETED:
        this.emitEvent({
          type: FederatedEventType.AGGREGATION_COMPLETED,
          timestamp: event.timestamp,
          sessionId: this.state.sessionId,
          roundId: round.getRoundId(),
          details: event.details,
        });
        break;

      case RoundEventType.PARTICIPANT_DROPPED:
        this.emitEvent({
          type: FederatedEventType.PARTICIPANT_DROPPED,
          timestamp: event.timestamp,
          sessionId: this.state.sessionId,
          roundId: round.getRoundId(),
          details: event.details,
        });
        break;

      case RoundEventType.ROUND_TIMED_OUT:
        this.emitEvent({
          type: FederatedEventType.ROUND_TIMED_OUT,
          timestamp: event.timestamp,
          sessionId: this.state.sessionId,
          roundId: round.getRoundId(),
          details: event.details,
        });
        break;
    }
  }

  /**
   * Add event handler
   */
  on(handler: FederatedEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Remove event handler
   */
  off(handler: FederatedEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index !== -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  /**
   * Emit event to handlers
   */
  private emitEvent(event: FederatedEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  // ============================================
  // Result Building
  // ============================================

  /**
   * Build training result
   */
  private buildTrainingResult(success: boolean): TrainingResult {
    return {
      success,
      finalModel: this.modelManager.getWeights(),
      metrics: this.buildTrainingMetrics(),
      privacyBudget: this.federatedConfig.differentialPrivacy?.enabled
        ? this.aggregator.getPrivacyBudget()
        : undefined,
      checkpoints: this.checkpointIds,
      errors: this.errors,
    };
  }

  /**
   * Build training metrics summary
   */
  private buildTrainingMetrics(): TrainingMetrics {
    const avgParticipation = this.roundHistory.length > 0
      ? this.roundHistory.reduce((sum, r) => sum + r.participationRate, 0) / this.roundHistory.length
      : 0;

    const totalCommBytes = this.roundHistory.reduce(
      (sum, r) => sum + r.communicationBytes, 0
    );

    return {
      currentRound: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      bestLoss: this.state.bestLoss,
      bestRound: this.state.bestRound,
      lossHistory: this.lossHistory,
      accuracyHistory: this.accuracyHistory.length > 0 ? this.accuracyHistory : undefined,
      convergenceStatus: this.state.convergenceStatus,
      startTime: this.state.startTime ?? Date.now(),
      totalTrainingTime: this.state.endTime
        ? this.state.endTime - (this.state.startTime ?? 0)
        : Date.now() - (this.state.startTime ?? Date.now()),
      totalCommunicationBytes: totalCommBytes,
      avgParticipationRate: avgParticipation,
    };
  }

  // ============================================
  // Validation
  // ============================================

  /**
   * Validate configuration
   */
  private validateConfiguration(): void {
    if (!this.federatedConfig.sessionId) {
      throw new FederatedError(
        'Session ID is required',
        FederatedErrorCode.INVALID_CONFIG
      );
    }

    if (!this.federatedConfig.modelId) {
      throw new FederatedError(
        'Model ID is required',
        FederatedErrorCode.INVALID_CONFIG
      );
    }

    if (this.federatedConfig.totalRounds < 1) {
      throw new FederatedError(
        'Total rounds must be at least 1',
        FederatedErrorCode.INVALID_CONFIG
      );
    }

    if (this.federatedConfig.minParticipation < 0 || this.federatedConfig.minParticipation > 1) {
      throw new FederatedError(
        'Min participation must be between 0 and 1',
        FederatedErrorCode.INVALID_CONFIG
      );
    }
  }

  // ============================================
  // Getters
  // ============================================

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.state.sessionId;
  }

  /**
   * Check if training is active
   */
  isTraining(): boolean {
    return this.state.isTraining;
  }

  /**
   * Get current round number
   */
  getCurrentRound(): number {
    return this.state.currentRound;
  }

  /**
   * Get convergence status
   */
  getConvergenceStatus(): ConvergenceStatus {
    return this.state.convergenceStatus;
  }

  /**
   * Get current model weights
   */
  getModel(): ModelWeights | null {
    return this.modelManager.getWeights();
  }

  /**
   * Get model manager
   */
  getModelManager(): ModelManager {
    return this.modelManager;
  }

  /**
   * Get aggregator
   */
  getAggregator(): GradientAggregator {
    return this.aggregator;
  }

  /**
   * Get active round
   */
  getActiveRound(): FederatedRound | null {
    return this.state.activeRound;
  }

  /**
   * Get training metrics
   */
  getMetrics(): TrainingMetrics {
    return this.buildTrainingMetrics();
  }

  /**
   * Get privacy budget
   */
  getPrivacyBudget(): PrivacyBudget | null {
    if (!this.federatedConfig.differentialPrivacy?.enabled) {
      return null;
    }
    return this.aggregator.getPrivacyBudget();
  }

  /**
   * Get checkpoints
   */
  getCheckpoints(): ModelCheckpoint[] {
    return this.modelManager.getCheckpoints();
  }

  /**
   * Get configuration
   */
  getConfig(): FederatedConfig {
    return { ...this.federatedConfig };
  }

  /**
   * Reset coordinator state
   */
  reset(): void {
    if (this.state.isTraining) {
      this.stopTraining('Reset requested');
    }

    this.state = {
      sessionId: this.federatedConfig.sessionId,
      isTraining: false,
      currentRound: 0,
      totalRounds: this.federatedConfig.totalRounds,
      activeRound: null,
      convergenceStatus: ConvergenceStatus.NOT_STARTED,
      startTime: null,
      endTime: null,
      roundsWithoutImprovement: 0,
      bestLoss: Infinity,
      bestRound: 0,
    };

    this.modelManager.reset();
    this.aggregator.reset();
    this.checkpointIds = [];
    this.errors = [];
    this.lossHistory = [];
    this.accuracyHistory = [];
    this.roundHistory = [];
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new federated coordinator
 */
export function createFederatedCoordinator(config: CoordinatorConfig): FederatedCoordinator {
  return new FederatedCoordinator(config);
}

/**
 * Create a minimal federated config
 */
export function createFederatedConfig(
  sessionId: string,
  modelId: string,
  totalRounds: number,
  options?: Partial<FederatedConfig>
): FederatedConfig {
  return {
    ...DEFAULT_FEDERATED_CONFIG,
    ...options,
    sessionId,
    modelId,
    totalRounds,
  } as FederatedConfig;
}
