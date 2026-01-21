/**
 * Federated Round Coordinator
 *
 * Coordinates training rounds across peers in a federated learning session.
 * Handles participant selection, round lifecycle management, update collection,
 * timeout handling, and minimum participation thresholds.
 *
 * @module edge/p2p/federated/FederatedRound
 * @version 1.0.0
 */

import type {
  RoundState,
  Participant,
  ParticipantCapabilities,
  ModelUpdate,
  ModelWeights,
  RoundMetrics,
  RoundError,
  RoundAnnouncement,
  JoinRequest,
  JoinResponse,
  UpdateSubmission,
  AggregationBroadcast,
  LocalTrainingConfig,
  FederatedConfig,
  AggregationResult,
  FederatedEvent,
  FederatedEventHandler,
} from './types';
import {
  RoundStatus,
  SelectionStrategy,
  UpdateType,
  FederatedEventType,
  FederatedError,
  FederatedErrorCode,
  DEFAULT_ROUND_TIMEOUT,
  DEFAULT_MIN_PARTICIPATION,
  MAX_PARTICIPANTS_PER_ROUND,
} from './types';
import { GradientAggregator, type GradientAggregatorConfig } from './GradientAggregator';

// ============================================
// Types
// ============================================

/**
 * Round configuration
 */
export interface RoundConfig {
  /** Session identifier */
  sessionId: string;

  /** Round number */
  roundNumber: number;

  /** Federated learning configuration */
  federatedConfig: FederatedConfig;

  /** Global model at start of round */
  globalModel: ModelWeights;

  /** Available participants */
  availableParticipants: Map<string, ParticipantInfo>;

  /** Gradient aggregator */
  aggregator: GradientAggregator;

  /** Send message callback */
  sendMessage: (participantId: string, message: unknown) => Promise<void>;

  /** Broadcast message callback */
  broadcastMessage: (message: unknown) => Promise<void>;
}

/**
 * Participant info for selection
 */
export interface ParticipantInfo {
  /** Participant identifier */
  participantId: string;

  /** Channel ID for communication */
  channelId: string;

  /** Number of local samples */
  sampleCount: number;

  /** Participant capabilities */
  capabilities: ParticipantCapabilities;

  /** Historical performance */
  trustScore: number;

  /** Last participation round */
  lastParticipation?: number;

  /** Data diversity score */
  diversityScore?: number;
}

/**
 * Round event types
 */
export enum RoundEventType {
  STATUS_CHANGED = 'status_changed',
  PARTICIPANT_JOINED = 'participant_joined',
  PARTICIPANT_DROPPED = 'participant_dropped',
  UPDATE_RECEIVED = 'update_received',
  AGGREGATION_STARTED = 'aggregation_started',
  AGGREGATION_COMPLETED = 'aggregation_completed',
  ROUND_COMPLETED = 'round_completed',
  ROUND_FAILED = 'round_failed',
  ROUND_TIMED_OUT = 'round_timed_out',
}

/**
 * Round event
 */
export interface RoundEvent {
  type: RoundEventType;
  timestamp: number;
  details: unknown;
}

/**
 * Round event handler
 */
export type RoundEventHandler = (event: RoundEvent) => void;

// ============================================
// FederatedRound Class
// ============================================

/**
 * Manages a single federated learning round
 *
 * @example
 * ```typescript
 * const round = new FederatedRound({
 *   sessionId: 'session-1',
 *   roundNumber: 5,
 *   federatedConfig: config,
 *   globalModel: currentModel,
 *   availableParticipants: participants,
 *   aggregator: aggregator,
 *   sendMessage: async (id, msg) => channel.send(id, msg),
 *   broadcastMessage: async (msg) => channel.broadcast(msg),
 * });
 *
 * await round.start();
 *
 * // Handle join requests
 * round.handleJoinRequest(request);
 *
 * // Handle update submissions
 * round.handleUpdateSubmission(submission);
 *
 * // Wait for round completion
 * const result = await round.waitForCompletion();
 * ```
 */
export class FederatedRound {
  private config: RoundConfig;
  private state: RoundState;
  private eventHandlers: RoundEventHandler[] = [];
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private collectionTimer: ReturnType<typeof setTimeout> | null = null;
  private completionPromise: Promise<AggregationResult> | null = null;
  private completionResolve: ((result: AggregationResult) => void) | null = null;
  private completionReject: ((error: Error) => void) | null = null;

  constructor(config: RoundConfig) {
    this.config = config;

    // Initialize round state
    this.state = {
      roundId: `${config.sessionId}-round-${config.roundNumber}`,
      roundNumber: config.roundNumber,
      status: RoundStatus.PREPARING,
      participants: new Map(),
      updates: new Map(),
      startingModel: config.globalModel,
      startedAt: 0,
      targetParticipants: Math.min(
        config.federatedConfig.maxParticipants,
        config.availableParticipants.size
      ),
      minParticipants: Math.max(
        1,
        Math.ceil(
          config.availableParticipants.size * config.federatedConfig.minParticipation
        )
      ),
      timeoutAt: 0,
      metrics: this.createInitialMetrics(),
      errors: [],
    };
  }

  // ============================================
  // Lifecycle Methods
  // ============================================

  /**
   * Start the round
   */
  async start(): Promise<void> {
    if (this.state.status !== RoundStatus.PREPARING) {
      throw new FederatedError(
        'Round already started',
        FederatedErrorCode.ROUND_NOT_FOUND
      );
    }

    this.state.startedAt = Date.now();
    this.state.timeoutAt = this.state.startedAt + this.config.federatedConfig.roundTimeout;

    // Set up completion promise
    this.completionPromise = new Promise((resolve, reject) => {
      this.completionResolve = resolve;
      this.completionReject = reject;
    });

    // Select participants
    const selectedParticipants = this.selectParticipants();

    if (selectedParticipants.length < this.state.minParticipants) {
      this.fail(new FederatedError(
        `Insufficient participants: ${selectedParticipants.length} < ${this.state.minParticipants}`,
        FederatedErrorCode.INSUFFICIENT_PARTICIPANTS
      ));
      return;
    }

    // Transition to awaiting participants
    this.updateStatus(RoundStatus.AWAITING_PARTICIPANTS);

    // Create round announcement
    const announcement = this.createRoundAnnouncement();

    // Send announcements to selected participants
    await this.announceRound(selectedParticipants, announcement);

    // Start timeout timer
    this.startTimeoutTimer();

    // Start collection phase after brief delay
    setTimeout(() => {
      if (this.state.status === RoundStatus.AWAITING_PARTICIPANTS) {
        this.updateStatus(RoundStatus.ANNOUNCED);

        // Start collecting after announcement phase
        setTimeout(() => {
          if (this.state.status === RoundStatus.ANNOUNCED ||
              this.state.status === RoundStatus.AWAITING_PARTICIPANTS) {
            this.updateStatus(RoundStatus.COLLECTING);
          }
        }, 1000); // 1 second for announcements to propagate
      }
    }, 100);
  }

  /**
   * Cancel the round
   */
  cancel(reason: string = 'Round cancelled'): void {
    if (this.isFinished()) return;

    this.cleanup();
    this.updateStatus(RoundStatus.CANCELLED);
    this.addError('CANCELLED', reason, true);

    if (this.completionReject) {
      this.completionReject(new FederatedError(reason, FederatedErrorCode.ROUND_NOT_FOUND));
    }
  }

  /**
   * Wait for round completion
   */
  async waitForCompletion(): Promise<AggregationResult> {
    if (!this.completionPromise) {
      throw new FederatedError(
        'Round not started',
        FederatedErrorCode.ROUND_NOT_FOUND
      );
    }
    return this.completionPromise;
  }

  /**
   * Check if round is finished
   */
  isFinished(): boolean {
    return [
      RoundStatus.COMPLETED,
      RoundStatus.FAILED,
      RoundStatus.CANCELLED,
      RoundStatus.TIMED_OUT,
    ].includes(this.state.status);
  }

  // ============================================
  // Participant Management
  // ============================================

  /**
   * Handle join request from participant
   */
  async handleJoinRequest(request: JoinRequest): Promise<JoinResponse> {
    // Validate request
    if (request.roundId !== this.state.roundId) {
      return {
        type: 'join_response',
        accepted: false,
        rejectionReason: 'Wrong round ID',
      };
    }

    // Check if still accepting participants
    if (this.state.status !== RoundStatus.AWAITING_PARTICIPANTS &&
        this.state.status !== RoundStatus.ANNOUNCED &&
        this.state.status !== RoundStatus.COLLECTING) {
      return {
        type: 'join_response',
        accepted: false,
        rejectionReason: 'Round not accepting participants',
      };
    }

    // Check if already joined
    if (this.state.participants.has(request.participantId)) {
      return {
        type: 'join_response',
        accepted: false,
        rejectionReason: 'Already joined',
      };
    }

    // Check participant limit
    if (this.state.participants.size >= this.config.federatedConfig.maxParticipants) {
      return {
        type: 'join_response',
        accepted: false,
        rejectionReason: 'Round at capacity',
      };
    }

    // Calculate participant weight
    const totalSamples = this.getTotalSamples() + request.sampleCount;
    const weight = request.sampleCount / totalSamples;

    // Create participant record
    const participant: Participant = {
      participantId: request.participantId,
      sampleCount: request.sampleCount,
      weight,
      hasSubmitted: false,
      joinedAt: Date.now(),
      capabilities: request.capabilities,
    };

    this.state.participants.set(request.participantId, participant);
    this.state.metrics.participantsJoined++;
    this.state.metrics.totalSamples += request.sampleCount;

    // Recalculate weights for all participants
    this.recalculateWeights();

    this.emitEvent({
      type: RoundEventType.PARTICIPANT_JOINED,
      timestamp: Date.now(),
      details: { participantId: request.participantId },
    });

    return {
      type: 'join_response',
      accepted: true,
      weight: participant.weight,
      model: this.state.startingModel,
    };
  }

  /**
   * Handle participant dropout
   */
  handleParticipantDropout(participantId: string): void {
    const participant = this.state.participants.get(participantId);
    if (!participant) return;

    // Remove participant
    this.state.participants.delete(participantId);
    this.state.updates.delete(participantId);

    // Recalculate weights
    this.recalculateWeights();

    // Update metrics
    this.state.metrics.totalSamples -= participant.sampleCount;

    this.emitEvent({
      type: RoundEventType.PARTICIPANT_DROPPED,
      timestamp: Date.now(),
      details: { participantId },
    });

    // Check if we still have minimum participants
    if (this.state.participants.size < this.state.minParticipants &&
        !this.isFinished()) {
      this.fail(new FederatedError(
        'Dropped below minimum participants',
        FederatedErrorCode.INSUFFICIENT_PARTICIPANTS
      ));
    }
  }

  // ============================================
  // Update Collection
  // ============================================

  /**
   * Handle update submission from participant
   */
  async handleUpdateSubmission(submission: UpdateSubmission): Promise<boolean> {
    // Validate submission
    if (submission.roundId !== this.state.roundId) {
      return false;
    }

    // Check if collecting
    if (this.state.status !== RoundStatus.COLLECTING &&
        this.state.status !== RoundStatus.ANNOUNCED) {
      return false;
    }

    // Check if participant joined
    const participant = this.state.participants.get(submission.update.participantId);
    if (!participant) {
      return false;
    }

    // Check if already submitted
    if (participant.hasSubmitted) {
      return false;
    }

    // Store update
    this.state.updates.set(submission.update.participantId, submission.update);
    participant.hasSubmitted = true;
    participant.submittedAt = Date.now();

    // Update metrics
    this.state.metrics.participantsSubmitted++;
    this.state.metrics.participationRate =
      this.state.metrics.participantsSubmitted / this.state.participants.size;

    this.emitEvent({
      type: RoundEventType.UPDATE_RECEIVED,
      timestamp: Date.now(),
      details: {
        participantId: submission.update.participantId,
        sampleCount: submission.update.sampleCount,
      },
    });

    // Check if we have enough updates to aggregate
    await this.checkAggregationTrigger();

    return true;
  }

  /**
   * Check if we should trigger aggregation
   */
  private async checkAggregationTrigger(): Promise<void> {
    // All participants submitted
    if (this.state.updates.size >= this.state.participants.size) {
      await this.startAggregation();
      return;
    }

    // Enough participants and timeout approaching
    const timeRemaining = this.state.timeoutAt - Date.now();
    const enoughParticipants = this.state.updates.size >= this.state.minParticipants;
    const timeoutApproaching = timeRemaining < this.config.federatedConfig.roundTimeout * 0.2;

    if (enoughParticipants && timeoutApproaching) {
      await this.startAggregation();
    }
  }

  // ============================================
  // Aggregation
  // ============================================

  /**
   * Start aggregation phase
   */
  private async startAggregation(): Promise<void> {
    if (this.state.status === RoundStatus.AGGREGATING ||
        this.state.status === RoundStatus.DISTRIBUTING ||
        this.isFinished()) {
      return;
    }

    this.updateStatus(RoundStatus.AGGREGATING);

    this.emitEvent({
      type: RoundEventType.AGGREGATION_STARTED,
      timestamp: Date.now(),
      details: { updateCount: this.state.updates.size },
    });

    try {
      const aggregationStart = Date.now();

      // Get updates array
      const updates = Array.from(this.state.updates.values());

      // Perform aggregation
      const result = await this.config.aggregator.aggregate(
        updates,
        this.state.startingModel
      );

      // Update metrics
      this.state.metrics.aggregationTime = Date.now() - aggregationStart;
      this.state.metrics.aggregatedLoss = this.computeAggregatedLoss(updates);
      this.state.aggregatedModel = result.aggregatedWeights;

      this.emitEvent({
        type: RoundEventType.AGGREGATION_COMPLETED,
        timestamp: Date.now(),
        details: {
          aggregationTime: this.state.metrics.aggregationTime,
          updateCount: result.updateCount,
        },
      });

      // Distribute result
      await this.distributeResult(result);

      // Complete round
      this.complete(result);

    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Distribute aggregation result to participants
   */
  private async distributeResult(result: AggregationResult): Promise<void> {
    this.updateStatus(RoundStatus.DISTRIBUTING);

    const broadcast: AggregationBroadcast = {
      type: 'aggregation_result',
      sessionId: this.config.sessionId,
      roundId: this.state.roundId,
      model: result.aggregatedWeights,
      metrics: this.state.metrics,
    };

    try {
      await this.config.broadcastMessage(broadcast);
    } catch (error) {
      this.addError(
        'DISTRIBUTION_ERROR',
        `Failed to distribute result: ${error}`,
        true
      );
    }
  }

  /**
   * Complete the round successfully
   */
  private complete(result: AggregationResult): void {
    this.cleanup();

    this.state.endedAt = Date.now();
    this.state.metrics.duration = this.state.endedAt - this.state.startedAt;

    this.updateStatus(RoundStatus.COMPLETED);

    this.emitEvent({
      type: RoundEventType.ROUND_COMPLETED,
      timestamp: Date.now(),
      details: {
        roundNumber: this.state.roundNumber,
        metrics: this.state.metrics,
      },
    });

    if (this.completionResolve) {
      this.completionResolve(result);
    }
  }

  /**
   * Fail the round
   */
  private fail(error: Error): void {
    this.cleanup();

    this.state.endedAt = Date.now();
    this.state.metrics.duration = this.state.endedAt - this.state.startedAt;

    this.addError('ROUND_FAILED', error.message, false);
    this.updateStatus(RoundStatus.FAILED);

    this.emitEvent({
      type: RoundEventType.ROUND_FAILED,
      timestamp: Date.now(),
      details: { error: error.message },
    });

    if (this.completionReject) {
      this.completionReject(error);
    }
  }

  // ============================================
  // Participant Selection
  // ============================================

  /**
   * Select participants for this round
   */
  private selectParticipants(): ParticipantInfo[] {
    const available = Array.from(this.config.availableParticipants.values());
    const strategy = this.config.federatedConfig.selectionStrategy;
    const targetCount = Math.min(
      this.config.federatedConfig.maxParticipants,
      available.length
    );

    switch (strategy) {
      case SelectionStrategy.RANDOM:
        return this.randomSelection(available, targetCount);

      case SelectionStrategy.IMPORTANCE:
        return this.importanceSelection(available, targetCount);

      case SelectionStrategy.DIVERSITY:
        return this.diversitySelection(available, targetCount);

      case SelectionStrategy.ROUND_ROBIN:
        return this.roundRobinSelection(available, targetCount);

      case SelectionStrategy.ACTIVE:
        return this.activeSelection(available, targetCount);

      case SelectionStrategy.POWER_OF_CHOICE:
        return this.powerOfChoiceSelection(available, targetCount);

      default:
        return this.randomSelection(available, targetCount);
    }
  }

  /**
   * Random selection strategy
   */
  private randomSelection(
    available: ParticipantInfo[],
    targetCount: number
  ): ParticipantInfo[] {
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, targetCount);
  }

  /**
   * Importance sampling based on data size
   */
  private importanceSelection(
    available: ParticipantInfo[],
    targetCount: number
  ): ParticipantInfo[] {
    const totalSamples = available.reduce((sum, p) => sum + p.sampleCount, 0);

    // Calculate selection probabilities
    const probabilities = available.map((p) => ({
      participant: p,
      probability: p.sampleCount / totalSamples,
    }));

    // Weighted sampling without replacement
    const selected: ParticipantInfo[] = [];
    const remaining = [...probabilities];

    while (selected.length < targetCount && remaining.length > 0) {
      const totalProb = remaining.reduce((sum, p) => sum + p.probability, 0);
      let random = Math.random() * totalProb;

      for (let i = 0; i < remaining.length; i++) {
        random -= remaining[i].probability;
        if (random <= 0) {
          selected.push(remaining[i].participant);
          remaining.splice(i, 1);
          break;
        }
      }
    }

    return selected;
  }

  /**
   * Diversity-based selection
   */
  private diversitySelection(
    available: ParticipantInfo[],
    targetCount: number
  ): ParticipantInfo[] {
    // Sort by diversity score (descending)
    const sorted = [...available].sort((a, b) =>
      (b.diversityScore ?? 0) - (a.diversityScore ?? 0)
    );

    return sorted.slice(0, targetCount);
  }

  /**
   * Round-robin selection
   */
  private roundRobinSelection(
    available: ParticipantInfo[],
    targetCount: number
  ): ParticipantInfo[] {
    // Sort by last participation (oldest first)
    const sorted = [...available].sort((a, b) =>
      (a.lastParticipation ?? 0) - (b.lastParticipation ?? 0)
    );

    return sorted.slice(0, targetCount);
  }

  /**
   * Active learning-based selection
   */
  private activeSelection(
    available: ParticipantInfo[],
    targetCount: number
  ): ParticipantInfo[] {
    // Combine factors: trust score, diversity, recency
    const scored = available.map((p) => ({
      participant: p,
      score: p.trustScore * 0.4 +
        (p.diversityScore ?? 0.5) * 0.3 +
        (1 - Math.min(1, ((Date.now() - (p.lastParticipation ?? 0)) / (24 * 60 * 60 * 1000)))) * 0.3,
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, targetCount).map((s) => s.participant);
  }

  /**
   * Power-of-choice selection
   */
  private powerOfChoiceSelection(
    available: ParticipantInfo[],
    targetCount: number
  ): ParticipantInfo[] {
    // For each slot, pick best of d random candidates
    const d = 2; // Power of 2 choices
    const selected: ParticipantInfo[] = [];
    const remaining = [...available];

    while (selected.length < targetCount && remaining.length > 0) {
      // Pick d random candidates
      const candidates: ParticipantInfo[] = [];
      for (let i = 0; i < Math.min(d, remaining.length); i++) {
        const idx = Math.floor(Math.random() * remaining.length);
        candidates.push(remaining[idx]);
      }

      // Select best candidate (by sample count)
      const best = candidates.reduce((a, b) =>
        a.sampleCount > b.sampleCount ? a : b
      );

      selected.push(best);
      remaining.splice(remaining.indexOf(best), 1);
    }

    return selected;
  }

  // ============================================
  // Round Communication
  // ============================================

  /**
   * Create round announcement message
   */
  private createRoundAnnouncement(): RoundAnnouncement {
    const config = this.config.federatedConfig;

    const trainingConfig: LocalTrainingConfig = {
      epochs: config.localEpochs,
      batchSize: config.batchSize,
      learningRate: config.learningRate,
      updateType: UpdateType.GRADIENTS,
      applyDifferentialPrivacy: config.differentialPrivacy?.enabled ?? false,
      dpConfig: config.differentialPrivacy,
      compressionConfig: config.compression,
    };

    return {
      type: 'round_announcement',
      sessionId: this.config.sessionId,
      roundId: this.state.roundId,
      roundNumber: this.state.roundNumber,
      modelVersion: this.state.startingModel.version,
      modelChecksum: this.state.startingModel.checksum,
      trainingConfig,
      deadline: this.state.timeoutAt,
      minParticipants: this.state.minParticipants,
    };
  }

  /**
   * Send round announcements to selected participants
   */
  private async announceRound(
    participants: ParticipantInfo[],
    announcement: RoundAnnouncement
  ): Promise<void> {
    const sendPromises = participants.map(async (p) => {
      try {
        await this.config.sendMessage(p.participantId, announcement);
      } catch (error) {
        this.addError(
          'ANNOUNCEMENT_ERROR',
          `Failed to announce to ${p.participantId}: ${error}`,
          true
        );
      }
    });

    await Promise.all(sendPromises);
  }

  // ============================================
  // Timeout Handling
  // ============================================

  /**
   * Start the round timeout timer
   */
  private startTimeoutTimer(): void {
    const timeout = this.config.federatedConfig.roundTimeout;

    this.timeoutTimer = setTimeout(() => {
      this.handleTimeout();
    }, timeout);
  }

  /**
   * Handle round timeout
   */
  private handleTimeout(): void {
    if (this.isFinished()) return;

    // Check if we have minimum participants
    if (this.state.updates.size >= this.state.minParticipants) {
      // Proceed with aggregation
      this.startAggregation();
    } else {
      // Fail the round
      this.cleanup();
      this.state.endedAt = Date.now();
      this.state.metrics.duration = this.state.endedAt - this.state.startedAt;

      this.addError(
        'TIMEOUT',
        `Round timed out with only ${this.state.updates.size}/${this.state.minParticipants} updates`,
        false
      );
      this.updateStatus(RoundStatus.TIMED_OUT);

      this.emitEvent({
        type: RoundEventType.ROUND_TIMED_OUT,
        timestamp: Date.now(),
        details: {
          updatesReceived: this.state.updates.size,
          minRequired: this.state.minParticipants,
        },
      });

      if (this.completionReject) {
        this.completionReject(new FederatedError(
          'Round timed out',
          FederatedErrorCode.ROUND_TIMEOUT
        ));
      }
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Get total samples across joined participants
   */
  private getTotalSamples(): number {
    let total = 0;
    for (const p of this.state.participants.values()) {
      total += p.sampleCount;
    }
    return total;
  }

  /**
   * Recalculate weights for all participants
   */
  private recalculateWeights(): void {
    const totalSamples = this.getTotalSamples();
    if (totalSamples === 0) return;

    for (const participant of this.state.participants.values()) {
      participant.weight = participant.sampleCount / totalSamples;
    }
  }

  /**
   * Compute aggregated loss from updates
   */
  private computeAggregatedLoss(updates: ModelUpdate[]): number {
    if (updates.length === 0) return 0;

    const totalSamples = updates.reduce((sum, u) => sum + u.sampleCount, 0);
    let weightedLoss = 0;

    for (const update of updates) {
      const weight = update.sampleCount / totalSamples;
      weightedLoss += weight * update.localLoss;
    }

    return weightedLoss;
  }

  /**
   * Create initial metrics object
   */
  private createInitialMetrics(): RoundMetrics {
    return {
      participantsJoined: 0,
      participantsSubmitted: 0,
      participationRate: 0,
      totalSamples: 0,
      aggregatedLoss: 0,
      lossImprovement: 0,
      duration: 0,
      communicationBytes: 0,
    };
  }

  /**
   * Update round status
   */
  private updateStatus(status: RoundStatus): void {
    const previousStatus = this.state.status;
    this.state.status = status;

    this.emitEvent({
      type: RoundEventType.STATUS_CHANGED,
      timestamp: Date.now(),
      details: { from: previousStatus, to: status },
    });
  }

  /**
   * Add an error to the round
   */
  private addError(type: string, message: string, recoverable: boolean): void {
    this.state.errors.push({
      type,
      message,
      timestamp: Date.now(),
      recoverable,
    });
  }

  /**
   * Cleanup timers and resources
   */
  private cleanup(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }

    if (this.collectionTimer) {
      clearTimeout(this.collectionTimer);
      this.collectionTimer = null;
    }
  }

  // ============================================
  // Event Handling
  // ============================================

  /**
   * Add event handler
   */
  on(handler: RoundEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Remove event handler
   */
  off(handler: RoundEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index !== -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  /**
   * Emit event to handlers
   */
  private emitEvent(event: RoundEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  // ============================================
  // Getters
  // ============================================

  /**
   * Get round ID
   */
  getRoundId(): string {
    return this.state.roundId;
  }

  /**
   * Get round number
   */
  getRoundNumber(): number {
    return this.state.roundNumber;
  }

  /**
   * Get current status
   */
  getStatus(): RoundStatus {
    return this.state.status;
  }

  /**
   * Get round state
   */
  getState(): RoundState {
    return { ...this.state };
  }

  /**
   * Get round metrics
   */
  getMetrics(): RoundMetrics {
    return { ...this.state.metrics };
  }

  /**
   * Get participants
   */
  getParticipants(): Map<string, Participant> {
    return new Map(this.state.participants);
  }

  /**
   * Get updates received
   */
  getUpdates(): Map<string, ModelUpdate> {
    return new Map(this.state.updates);
  }

  /**
   * Get aggregated model
   */
  getAggregatedModel(): ModelWeights | undefined {
    return this.state.aggregatedModel;
  }

  /**
   * Get errors
   */
  getErrors(): RoundError[] {
    return [...this.state.errors];
  }

  /**
   * Get time remaining until timeout
   */
  getTimeRemaining(): number {
    if (this.isFinished()) return 0;
    return Math.max(0, this.state.timeoutAt - Date.now());
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new federated round
 */
export function createFederatedRound(config: RoundConfig): FederatedRound {
  return new FederatedRound(config);
}
