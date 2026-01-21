/**
 * Hole Puncher for @ruvector/edge P2P
 *
 * Implements UDP hole punching techniques for NAT traversal including
 * simultaneous open, port prediction, and fallback escalation.
 *
 * @module edge/p2p/nat/HolePuncher
 * @version 1.0.0
 */

import { PeerId, ICECandidate } from '../webrtc/types';
import {
  HolePunchResult,
  HolePunchConfig,
  HolePuncherConfig,
  PortPrediction,
  EscalationLevel,
  EscalationState,
  EscalationConfig,
  ConnectionPath,
  NATClassification,
  NATEventType,
  NATEvent,
  NATEventHandler,
  DEFAULT_HOLE_PUNCHER_CONFIG,
  DEFAULT_ESCALATION_CONFIG,
  TURNConfig,
} from './types';

/**
 * Hole punch coordination message
 */
interface CoordinationMessage {
  /** Message type */
  type: 'ready' | 'punch' | 'ack' | 'failed';
  /** Source peer ID */
  from: PeerId;
  /** Target peer ID */
  to: PeerId;
  /** Local endpoint information */
  endpoint?: { address: string; port: number };
  /** Predicted ports for symmetric NAT */
  predictedPorts?: number[];
  /** Attempt number */
  attempt: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Punch attempt tracking
 */
interface PunchAttempt {
  /** Attempt number */
  attempt: number;
  /** Start timestamp */
  startedAt: number;
  /** End timestamp */
  endedAt?: number;
  /** Whether attempt succeeded */
  success: boolean;
  /** Method used */
  method: 'simultaneous' | 'sequential' | 'predicted';
  /** Error if failed */
  error?: string;
}

/**
 * Hole Puncher - Implements NAT hole punching techniques
 *
 * @example
 * ```typescript
 * const holePuncher = new HolePuncher({
 *   maxAttempts: 10,
 *   enablePortPrediction: true,
 *   enableSimultaneousOpen: true,
 * });
 *
 * // Set up coordination channel
 * holePuncher.setCoordinationChannel({
 *   send: (msg) => signalingChannel.send(msg),
 *   onMessage: (handler) => signalingChannel.on('message', handler),
 * });
 *
 * // Attempt hole punch
 * const result = await holePuncher.punch(remotePeerId, {
 *   localCandidates: [...],
 *   remoteCandidates: [...],
 * });
 *
 * if (result.success) {
 *   console.log('Direct connection established!');
 * }
 * ```
 */
export class HolePuncher {
  private readonly config: HolePuncherConfig;
  private readonly escalationConfig: EscalationConfig;
  private escalationState: EscalationState | null = null;
  private eventHandlers: Map<NATEventType, Set<NATEventHandler>> = new Map();
  private coordinationChannel: {
    send: (msg: CoordinationMessage) => void;
    onMessage: (handler: (msg: CoordinationMessage) => void) => () => void;
  } | null = null;
  private localPeerId: PeerId = '';
  private currentPunch: {
    peerId: PeerId;
    attempts: PunchAttempt[];
    resolve: (result: HolePunchResult) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  } | null = null;

  /**
   * Create a new Hole Puncher
   *
   * @param config - Hole puncher configuration
   * @param escalationConfig - Escalation configuration
   */
  constructor(
    config: Partial<HolePuncherConfig> = {},
    escalationConfig: Partial<EscalationConfig> = {}
  ) {
    this.config = {
      ...DEFAULT_HOLE_PUNCHER_CONFIG,
      ...config,
    };
    this.escalationConfig = {
      ...DEFAULT_ESCALATION_CONFIG,
      ...escalationConfig,
    };
  }

  /**
   * Set local peer ID
   *
   * @param peerId - Local peer identifier
   */
  public setLocalPeerId(peerId: PeerId): void {
    this.localPeerId = peerId;
  }

  /**
   * Set coordination channel for peer signaling
   *
   * @param channel - Coordination channel interface
   */
  public setCoordinationChannel(channel: {
    send: (msg: CoordinationMessage) => void;
    onMessage: (handler: (msg: CoordinationMessage) => void) => () => void;
  }): void {
    this.coordinationChannel = channel;
  }

  /**
   * Attempt hole punch to remote peer
   *
   * @param remotePeerId - Remote peer to punch to
   * @param options - Punch options with candidates
   * @returns Promise resolving to punch result
   */
  public async punch(
    remotePeerId: PeerId,
    options: {
      localCandidates: ICECandidate[];
      remoteCandidates: ICECandidate[];
      localNatType?: NATClassification;
      remoteNatType?: NATClassification;
    }
  ): Promise<HolePunchResult> {
    if (!this.coordinationChannel) {
      return this.createFailedResult('No coordination channel configured');
    }

    if (!this.localPeerId) {
      return this.createFailedResult('Local peer ID not set');
    }

    // Initialize escalation state
    this.resetEscalation();
    const startTime = Date.now();

    this.emitEvent(NATEventType.HolePunchStarted, {
      peerId: remotePeerId,
      localNatType: options.localNatType,
      remoteNatType: options.remoteNatType,
    });

    return new Promise((resolve, reject) => {
      const totalTimeout = setTimeout(() => {
        if (this.currentPunch) {
          const result = this.createFailedResult('Hole punch timeout');
          this.currentPunch = null;
          this.emitEvent(NATEventType.HolePunchFailed, result);
          resolve(result);
        }
      }, this.config.maxAttempts * this.config.attemptTimeout);

      this.currentPunch = {
        peerId: remotePeerId,
        attempts: [],
        resolve: (result) => {
          clearTimeout(totalTimeout);
          if (result.success) {
            this.emitEvent(NATEventType.HolePunchSucceeded, result);
          } else {
            this.emitEvent(NATEventType.HolePunchFailed, result);
          }
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(totalTimeout);
          reject(error);
        },
        timeout: totalTimeout,
      };

      // Start punch process
      this.executePunchSequence(remotePeerId, options, startTime);
    });
  }

  /**
   * Cancel ongoing hole punch attempt
   */
  public cancel(): void {
    if (this.currentPunch) {
      clearTimeout(this.currentPunch.timeout);
      const result = this.createFailedResult('Hole punch cancelled');
      this.currentPunch.resolve(result);
      this.currentPunch = null;
    }
  }

  /**
   * Get fallback to TURN relay
   *
   * @param turnServers - Available TURN servers
   * @returns Recommended escalation action
   */
  public getFallbackAction(
    turnServers: TURNConfig[]
  ): {
    action: 'continue' | 'escalate' | 'abort';
    level: EscalationLevel;
    turnServer?: TURNConfig;
  } {
    if (!this.escalationState) {
      return { action: 'continue', level: EscalationLevel.Direct };
    }

    const nextLevel = this.getNextEscalationLevel();

    if (nextLevel === EscalationLevel.Exhausted) {
      return { action: 'abort', level: EscalationLevel.Exhausted };
    }

    // Check if we should escalate to TURN
    if (
      nextLevel >= EscalationLevel.TurnUdp &&
      nextLevel <= EscalationLevel.TurnTls
    ) {
      const turnServer = this.selectTurnServer(turnServers, nextLevel);
      if (turnServer) {
        return { action: 'escalate', level: nextLevel, turnServer };
      }
    }

    return { action: 'continue', level: nextLevel };
  }

  /**
   * Escalate to next level
   */
  public escalate(): void {
    if (!this.escalationState) return;

    const previousLevel = this.escalationState.level;
    const nextLevel = this.getNextEscalationLevel();

    this.escalationState.attemptedLevels.push(previousLevel);
    this.escalationState.level = nextLevel;
    this.escalationState.currentAttempts = 0;
    this.escalationState.lastEscalationAt = Date.now();

    // Track time spent at previous level
    const timeAtLevel = Date.now() - this.escalationState.startedAt;
    this.escalationState.timePerLevel.set(previousLevel, timeAtLevel);

    this.emitEvent(NATEventType.EscalationChanged, {
      from: previousLevel,
      to: nextLevel,
    });

    if (this.escalationConfig.onEscalation) {
      this.escalationConfig.onEscalation(previousLevel, nextLevel);
    }
  }

  /**
   * Get current escalation state
   */
  public getEscalationState(): EscalationState | null {
    return this.escalationState ? { ...this.escalationState } : null;
  }

  /**
   * Predict ports for symmetric NAT
   *
   * @param observedPorts - Previously observed port mappings
   * @returns Port prediction result
   */
  public predictPorts(observedPorts: number[]): PortPrediction {
    if (observedPorts.length < 2) {
      return {
        predictedPorts: [],
        confidence: 0,
        basePort: observedPorts[0] ?? 0,
        increment: 0,
        method: 'random',
      };
    }

    // Calculate increments between observed ports
    const increments: number[] = [];
    for (let i = 1; i < observedPorts.length; i++) {
      increments.push(observedPorts[i] - observedPorts[i - 1]);
    }

    // Check if increments are consistent (linear pattern)
    const avgIncrement = increments.reduce((a, b) => a + b, 0) / increments.length;
    const variance =
      increments.reduce((sum, inc) => sum + Math.pow(inc - avgIncrement, 2), 0) /
      increments.length;

    const lastPort = observedPorts[observedPorts.length - 1];
    let method: 'linear' | 'random' | 'hybrid' = 'random';
    let confidence = 0;
    const predictedPorts: number[] = [];

    if (variance < 10) {
      // Low variance indicates linear pattern
      method = 'linear';
      confidence = Math.max(0.3, 0.9 - variance / 10);

      // Predict next ports using linear pattern
      const roundedIncrement = Math.round(avgIncrement);
      for (let i = 1; i <= this.config.portPredictionRange; i++) {
        const predictedPort = lastPort + roundedIncrement * i;
        if (predictedPort > 0 && predictedPort < 65536) {
          predictedPorts.push(predictedPort);
        }
      }
    } else if (variance < 100) {
      // Medium variance - use hybrid approach
      method = 'hybrid';
      confidence = 0.3;

      // Use range around expected next port
      const roundedIncrement = Math.round(avgIncrement);
      const basePredict = lastPort + roundedIncrement;

      for (
        let offset = 0;
        offset <= this.config.portPredictionRange;
        offset++
      ) {
        if (basePredict + offset > 0 && basePredict + offset < 65536) {
          predictedPorts.push(basePredict + offset);
        }
        if (offset > 0 && basePredict - offset > 0) {
          predictedPorts.push(basePredict - offset);
        }
      }
    } else {
      // High variance - random ports, low confidence
      method = 'random';
      confidence = 0.1;

      // Generate random ports near last observed
      for (let i = 0; i < this.config.portPredictionRange; i++) {
        const randomOffset = Math.floor(Math.random() * 1000) - 500;
        const port = lastPort + randomOffset;
        if (port > 0 && port < 65536) {
          predictedPorts.push(port);
        }
      }
    }

    return {
      predictedPorts: predictedPorts.slice(0, this.config.portPredictionRange),
      confidence,
      basePort: lastPort,
      increment: Math.round(avgIncrement),
      method,
    };
  }

  /**
   * Register event handler
   *
   * @param type - Event type to handle
   * @param handler - Event handler function
   * @returns Unsubscribe function
   */
  public on<T>(type: NATEventType, handler: NATEventHandler<T>): () => void {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, new Set());
    }
    this.eventHandlers.get(type)!.add(handler as NATEventHandler);
    return () => this.eventHandlers.get(type)?.delete(handler as NATEventHandler);
  }

  /**
   * Get current configuration
   */
  public getConfig(): HolePuncherConfig {
    return { ...this.config };
  }

  // ============================================
  // Private Methods
  // ============================================

  private resetEscalation(): void {
    this.escalationState = {
      level: EscalationLevel.Direct,
      attemptedLevels: [],
      currentAttempts: 0,
      maxAttemptsPerLevel: this.escalationConfig.maxAttemptsPerLevel,
      startedAt: Date.now(),
      lastEscalationAt: Date.now(),
      timePerLevel: new Map(),
    };
  }

  private getNextEscalationLevel(): EscalationLevel {
    if (!this.escalationState) return EscalationLevel.Exhausted;

    const currentLevel = this.escalationState.level;
    let nextLevel = currentLevel + 1;

    // Skip configured levels
    while (
      this.escalationConfig.skipLevels.includes(nextLevel as EscalationLevel) &&
      nextLevel < EscalationLevel.Exhausted
    ) {
      nextLevel++;
    }

    return Math.min(nextLevel, EscalationLevel.Exhausted) as EscalationLevel;
  }

  private selectTurnServer(
    servers: TURNConfig[],
    level: EscalationLevel
  ): TURNConfig | undefined {
    // Filter by transport based on escalation level
    const filtered = servers.filter((server) => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      switch (level) {
        case EscalationLevel.TurnUdp:
          return urls.some((url) => url.includes('turn:') && !url.includes('transport=tcp'));
        case EscalationLevel.TurnTcp:
          return urls.some(
            (url) => url.includes('turn:') && url.includes('transport=tcp')
          );
        case EscalationLevel.TurnTls:
          return urls.some((url) => url.includes('turns:'));
        default:
          return false;
      }
    });

    // Sort by priority and return first
    filtered.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    return filtered[0];
  }

  private async executePunchSequence(
    remotePeerId: PeerId,
    options: {
      localCandidates: ICECandidate[];
      remoteCandidates: ICECandidate[];
      localNatType?: NATClassification;
      remoteNatType?: NATClassification;
    },
    startTime: number
  ): Promise<void> {
    if (!this.currentPunch || !this.coordinationChannel) return;

    // Extract endpoints from candidates
    const localEndpoints = this.extractEndpoints(options.localCandidates);
    const remoteEndpoints = this.extractEndpoints(options.remoteCandidates);

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      if (!this.currentPunch) return;

      const attemptRecord: PunchAttempt = {
        attempt,
        startedAt: Date.now(),
        success: false,
        method: 'simultaneous',
      };
      this.currentPunch.attempts.push(attemptRecord);

      try {
        // Determine punch method based on NAT types
        const useSimultaneous =
          this.config.enableSimultaneousOpen &&
          options.localNatType !== NATClassification.Symmetric &&
          options.remoteNatType !== NATClassification.Symmetric;

        if (useSimultaneous) {
          attemptRecord.method = 'simultaneous';
          const success = await this.simultaneousPunch(
            remotePeerId,
            localEndpoints[0],
            remoteEndpoints[0],
            attempt
          );

          if (success) {
            attemptRecord.success = true;
            attemptRecord.endedAt = Date.now();

            this.currentPunch.resolve({
              success: true,
              method: 'simultaneous',
              attempts: attempt,
              localEndpoint: localEndpoints[0],
              remoteEndpoint: remoteEndpoints[0],
              durationMs: Date.now() - startTime,
              timestamp: Date.now(),
            });
            return;
          }
        } else if (this.config.enablePortPrediction) {
          // Use port prediction for symmetric NAT
          attemptRecord.method = 'predicted';
          const observedPorts = options.remoteCandidates
            .filter((c) => c.port)
            .map((c) => c.port!);

          const prediction = this.predictPorts(observedPorts);

          if (prediction.predictedPorts.length > 0) {
            const success = await this.predictedPunch(
              remotePeerId,
              localEndpoints[0],
              remoteEndpoints[0]?.address ?? '',
              prediction.predictedPorts,
              attempt
            );

            if (success) {
              attemptRecord.success = true;
              attemptRecord.endedAt = Date.now();

              this.currentPunch.resolve({
                success: true,
                method: 'predicted',
                attempts: attempt,
                localEndpoint: localEndpoints[0],
                durationMs: Date.now() - startTime,
                timestamp: Date.now(),
              });
              return;
            }
          }
        }

        attemptRecord.endedAt = Date.now();
        attemptRecord.error = 'Punch attempt failed';

        // Delay before next attempt
        await this.delay(this.config.attemptDelay);
      } catch (error) {
        attemptRecord.endedAt = Date.now();
        attemptRecord.error = error instanceof Error ? error.message : 'Unknown error';
        attemptRecord.success = false;
      }

      // Check for escalation
      if (this.escalationState) {
        this.escalationState.currentAttempts++;

        if (
          this.escalationState.currentAttempts >=
          this.escalationState.maxAttemptsPerLevel
        ) {
          if (this.escalationConfig.autoEscalate) {
            this.escalate();
          }
        }
      }
    }

    // All attempts failed
    if (this.currentPunch) {
      this.currentPunch.resolve({
        success: false,
        attempts: this.config.maxAttempts,
        durationMs: Date.now() - startTime,
        timestamp: Date.now(),
        error: 'All hole punch attempts failed',
      });
    }
  }

  private async simultaneousPunch(
    remotePeerId: PeerId,
    localEndpoint: { address: string; port: number } | undefined,
    remoteEndpoint: { address: string; port: number } | undefined,
    attempt: number
  ): Promise<boolean> {
    if (!this.coordinationChannel) return false;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        resolve(false);
      }, this.config.attemptTimeout);

      // Send ready message
      this.coordinationChannel!.send({
        type: 'ready',
        from: this.localPeerId,
        to: remotePeerId,
        endpoint: localEndpoint,
        attempt,
        timestamp: Date.now(),
      });

      // Wait for peer ready and then punch
      const unsubscribe = this.coordinationChannel!.onMessage((msg) => {
        if (msg.from === remotePeerId && msg.to === this.localPeerId) {
          if (msg.type === 'ready' && msg.attempt === attempt) {
            // Peer is ready, send punch
            this.coordinationChannel!.send({
              type: 'punch',
              from: this.localPeerId,
              to: remotePeerId,
              endpoint: localEndpoint,
              attempt,
              timestamp: Date.now(),
            });
          } else if (msg.type === 'ack' && msg.attempt === attempt) {
            // Punch acknowledged
            clearTimeout(timeout);
            unsubscribe();
            resolve(true);
          }
        }
      });

      // Also listen for their punch and acknowledge
      const punchListener = this.coordinationChannel!.onMessage((msg) => {
        if (
          msg.from === remotePeerId &&
          msg.to === this.localPeerId &&
          msg.type === 'punch' &&
          msg.attempt === attempt
        ) {
          // Send acknowledgment
          this.coordinationChannel!.send({
            type: 'ack',
            from: this.localPeerId,
            to: remotePeerId,
            endpoint: localEndpoint,
            attempt,
            timestamp: Date.now(),
          });

          // If we also receive ack, connection is established
          clearTimeout(timeout);
          unsubscribe();
          punchListener();
          resolve(true);
        }
      });
    });
  }

  private async predictedPunch(
    remotePeerId: PeerId,
    localEndpoint: { address: string; port: number } | undefined,
    remoteAddress: string,
    predictedPorts: number[],
    attempt: number
  ): Promise<boolean> {
    if (!this.coordinationChannel) return false;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        resolve(false);
      }, this.config.attemptTimeout);

      // Send punch with predicted ports
      this.coordinationChannel!.send({
        type: 'punch',
        from: this.localPeerId,
        to: remotePeerId,
        endpoint: localEndpoint,
        predictedPorts,
        attempt,
        timestamp: Date.now(),
      });

      // Wait for ack
      const unsubscribe = this.coordinationChannel!.onMessage((msg) => {
        if (
          msg.from === remotePeerId &&
          msg.to === this.localPeerId &&
          msg.type === 'ack' &&
          msg.attempt === attempt
        ) {
          clearTimeout(timeout);
          unsubscribe();
          resolve(true);
        }
      });
    });
  }

  private extractEndpoints(
    candidates: ICECandidate[]
  ): Array<{ address: string; port: number }> {
    return candidates
      .filter((c) => c.address && c.port)
      .map((c) => ({ address: c.address!, port: c.port! }));
  }

  private createFailedResult(error: string): HolePunchResult {
    return {
      success: false,
      attempts: this.currentPunch?.attempts.length ?? 0,
      durationMs: 0,
      timestamp: Date.now(),
      error,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private emitEvent<T>(type: NATEventType, data: T): void {
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      const event: NATEvent<T> = {
        type,
        timestamp: Date.now(),
        data,
      };
      handlers.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Hole punch event handler error for ${type}:`, error);
        }
      });
    }
  }
}

export default HolePuncher;
