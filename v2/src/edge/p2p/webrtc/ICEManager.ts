/**
 * ICE Manager for WebRTC Connections
 *
 * Manages ICE (Interactive Connectivity Establishment) for WebRTC peer connections.
 * Handles STUN/TURN server configuration, candidate gathering, trickling,
 * connection quality monitoring, and NAT type detection.
 *
 * @module edge/p2p/webrtc/ICEManager
 * @version 1.0.0
 */

import {
  ICECandidate,
  ICEServer,
  ICEManagerConfig,
  ICEGatheringState,
  ICECandidateType,
  NATType,
  ConnectionQuality,
  DEFAULT_ICE_SERVERS,
  generateId,
  parseICECandidateType,
  createDefaultConnectionQuality,
} from './types';

/**
 * Default ICE manager configuration
 */
const DEFAULT_CONFIG: Required<ICEManagerConfig> = {
  iceServers: DEFAULT_ICE_SERVERS,
  iceTransportPolicy: 'all',
  bundlePolicy: 'balanced',
  enableTrickle: true,
  gatheringTimeout: 10000,
  enableTurnFallback: true,
};

/**
 * ICE candidate event handler type
 */
export type ICECandidateHandler = (candidate: ICECandidate) => void;

/**
 * ICE gathering state change handler type
 */
export type ICEGatheringStateHandler = (state: RTCIceGatheringState) => void;

/**
 * ICE connection state change handler type
 */
export type ICEConnectionStateHandler = (state: RTCIceConnectionState) => void;

/**
 * ICE Manager - Handles ICE candidate gathering and connection establishment
 *
 * @example
 * ```typescript
 * const iceManager = new ICEManager({
 *   iceServers: [
 *     { urls: 'stun:stun.l.google.com:19302' },
 *     { urls: 'turn:turn.example.com', username: 'user', credential: 'pass' }
 *   ],
 *   enableTrickle: true,
 * });
 *
 * // Configure peer connection
 * const rtcConfig = iceManager.getRTCConfiguration();
 * const pc = new RTCPeerConnection(rtcConfig);
 *
 * // Set up ICE handling
 * iceManager.attachToPeerConnection(pc);
 * iceManager.onCandidate((candidate) => {
 *   // Send candidate to remote peer via signaling
 *   signaling.sendCandidate(remotePeerId, candidate);
 * });
 *
 * // Add remote candidates
 * await iceManager.addRemoteCandidate(remoteCandidate);
 * ```
 */
export class ICEManager {
  private readonly config: Required<ICEManagerConfig>;
  private peerConnection: RTCPeerConnection | null = null;
  private gatheringState: ICEGatheringState;
  private candidateHandlers: Set<ICECandidateHandler> = new Set();
  private gatheringStateHandlers: Set<ICEGatheringStateHandler> = new Set();
  private connectionStateHandlers: Set<ICEConnectionStateHandler> = new Set();
  private gatheringPromise: Promise<void> | null = null;
  private gatheringResolve: (() => void) | null = null;
  private gatheringTimeout: ReturnType<typeof setTimeout> | null = null;
  private detectedNATType: NATType = NATType.UNKNOWN;
  private connectionQuality: ConnectionQuality = createDefaultConnectionQuality();
  private qualityMonitorInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Create a new ICE Manager instance
   *
   * @param config - ICE manager configuration
   */
  constructor(config: Partial<ICEManagerConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      iceServers: config.iceServers ?? DEFAULT_CONFIG.iceServers,
    };

    this.gatheringState = {
      state: 'new',
      localCandidates: [],
      remoteCandidates: [],
      natType: NATType.UNKNOWN,
      isComplete: false,
    };
  }

  /**
   * Get RTCConfiguration for creating RTCPeerConnection
   */
  public getRTCConfiguration(): RTCConfiguration {
    return {
      iceServers: this.config.iceServers.map((server) => ({
        urls: server.urls,
        username: server.username,
        credential: server.credential,
        credentialType: server.credentialType,
      })),
      iceTransportPolicy: this.config.iceTransportPolicy,
      bundlePolicy: this.config.bundlePolicy,
      iceCandidatePoolSize: 0,
    };
  }

  /**
   * Attach ICE manager to a peer connection
   *
   * @param pc - RTCPeerConnection to manage
   */
  public attachToPeerConnection(pc: RTCPeerConnection): void {
    if (this.peerConnection) {
      this.detachFromPeerConnection();
    }

    this.peerConnection = pc;
    this.resetGatheringState();

    // Handle ICE candidate events
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidate = this.convertRTCIceCandidate(event.candidate);
        this.gatheringState.localCandidates.push(candidate);
        this.emitCandidate(candidate);
        this.analyzeCandidate(candidate);
      } else {
        // Null candidate signals gathering complete
        this.onGatheringComplete();
      }
    };

    // Handle ICE gathering state changes
    pc.onicegatheringstatechange = () => {
      const state = pc.iceGatheringState;
      this.gatheringState.state = state;
      this.emitGatheringStateChange(state);

      if (state === 'complete') {
        this.onGatheringComplete();
      }
    };

    // Handle ICE connection state changes
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      this.emitConnectionStateChange(state);

      if (state === 'connected' || state === 'completed') {
        this.startQualityMonitoring();
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.stopQualityMonitoring();
      }
    };
  }

  /**
   * Detach ICE manager from current peer connection
   */
  public detachFromPeerConnection(): void {
    if (this.peerConnection) {
      this.peerConnection.onicecandidate = null;
      this.peerConnection.onicegatheringstatechange = null;
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection = null;
    }
    this.stopQualityMonitoring();
    this.resetGatheringState();
  }

  /**
   * Add a remote ICE candidate
   *
   * @param candidate - Remote ICE candidate to add
   * @throws Error if no peer connection is attached
   */
  public async addRemoteCandidate(candidate: ICECandidate): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('No peer connection attached to ICE manager');
    }

    const rtcCandidate = new RTCIceCandidate({
      candidate: candidate.candidate,
      sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
      sdpMid: candidate.sdpMid ?? undefined,
      usernameFragment: candidate.usernameFragment ?? undefined,
    });

    await this.peerConnection.addIceCandidate(rtcCandidate);
    this.gatheringState.remoteCandidates.push(candidate);
  }

  /**
   * Wait for ICE gathering to complete
   *
   * @param timeout - Maximum time to wait in ms (default: config.gatheringTimeout)
   * @returns Promise that resolves when gathering is complete
   */
  public async waitForGatheringComplete(timeout?: number): Promise<void> {
    if (this.gatheringState.isComplete) {
      return;
    }

    if (this.gatheringPromise) {
      return this.gatheringPromise;
    }

    const timeoutMs = timeout ?? this.config.gatheringTimeout;

    this.gatheringPromise = new Promise<void>((resolve, reject) => {
      this.gatheringResolve = resolve;

      this.gatheringTimeout = setTimeout(() => {
        // Gathering timeout - proceed with what we have
        this.onGatheringComplete();
        resolve();
      }, timeoutMs);
    });

    return this.gatheringPromise;
  }

  /**
   * Register callback for ICE candidate events
   *
   * @param handler - Callback function
   * @returns Unsubscribe function
   */
  public onCandidate(handler: ICECandidateHandler): () => void {
    this.candidateHandlers.add(handler);
    return () => this.candidateHandlers.delete(handler);
  }

  /**
   * Register callback for ICE gathering state changes
   *
   * @param handler - Callback function
   * @returns Unsubscribe function
   */
  public onGatheringStateChange(handler: ICEGatheringStateHandler): () => void {
    this.gatheringStateHandlers.add(handler);
    return () => this.gatheringStateHandlers.delete(handler);
  }

  /**
   * Register callback for ICE connection state changes
   *
   * @param handler - Callback function
   * @returns Unsubscribe function
   */
  public onConnectionStateChange(handler: ICEConnectionStateHandler): () => void {
    this.connectionStateHandlers.add(handler);
    return () => this.connectionStateHandlers.delete(handler);
  }

  /**
   * Get current ICE gathering state
   */
  public getGatheringState(): ICEGatheringState {
    return { ...this.gatheringState };
  }

  /**
   * Get detected NAT type
   */
  public getNATType(): NATType {
    return this.detectedNATType;
  }

  /**
   * Get current connection quality metrics
   */
  public getConnectionQuality(): ConnectionQuality {
    return { ...this.connectionQuality };
  }

  /**
   * Detect NAT type using STUN servers
   * This is a simplified detection that classifies based on candidate types
   */
  public async detectNATType(): Promise<NATType> {
    const candidates = this.gatheringState.localCandidates;

    if (candidates.length === 0) {
      return NATType.UNKNOWN;
    }

    const hasHost = candidates.some((c) => c.type === 'host');
    const hasSrflx = candidates.some((c) => c.type === 'srflx');
    const hasRelay = candidates.some((c) => c.type === 'relay');

    // Analyze candidate types to infer NAT type
    if (hasHost && !hasSrflx && !hasRelay) {
      // Only host candidates - likely no NAT
      this.detectedNATType = NATType.NONE;
    } else if (hasSrflx) {
      // Server reflexive candidates found - some form of cone NAT
      // More detailed detection would require multiple STUN servers
      this.detectedNATType = NATType.FULL_CONE;
    } else if (hasRelay && !hasSrflx) {
      // Only relay candidates - likely symmetric NAT
      this.detectedNATType = NATType.SYMMETRIC;
    } else {
      this.detectedNATType = NATType.UNKNOWN;
    }

    this.gatheringState.natType = this.detectedNATType;
    return this.detectedNATType;
  }

  /**
   * Update connection quality metrics from RTCPeerConnection stats
   */
  public async updateConnectionQuality(): Promise<ConnectionQuality> {
    if (!this.peerConnection) {
      return this.connectionQuality;
    }

    try {
      const stats = await this.peerConnection.getStats();
      let candidatePairFound = false;

      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          candidatePairFound = true;
          this.connectionQuality.rttMs = report.currentRoundTripTime
            ? report.currentRoundTripTime * 1000
            : this.connectionQuality.rttMs;
          this.connectionQuality.availableBandwidth =
            report.availableOutgoingBitrate ?? this.connectionQuality.availableBandwidth;
        }

        if (report.type === 'local-candidate') {
          this.connectionQuality.localCandidateType = this.mapCandidateType(report.candidateType);
        }

        if (report.type === 'remote-candidate') {
          this.connectionQuality.remoteCandidateType = this.mapCandidateType(report.candidateType);
        }

        if (report.type === 'transport') {
          const packetsLost = report.packetsLost ?? 0;
          const packetsReceived = report.packetsReceived ?? 0;
          const totalPackets = packetsLost + packetsReceived;
          this.connectionQuality.packetLossPercent =
            totalPackets > 0 ? (packetsLost / totalPackets) * 100 : 0;
        }
      });

      this.connectionQuality.measuredAt = Date.now();
    } catch (error) {
      // Stats collection failed - keep existing quality
      console.warn('Failed to collect connection quality stats:', error);
    }

    return { ...this.connectionQuality };
  }

  /**
   * Check if TURN fallback is needed based on connection state
   */
  public needsTurnFallback(): boolean {
    if (!this.config.enableTurnFallback) {
      return false;
    }

    // Check if we only have relay candidates or connection is failing
    const hasOnlyRelay =
      this.gatheringState.localCandidates.length > 0 &&
      this.gatheringState.localCandidates.every((c) => c.type === 'relay');

    const connectionState = this.peerConnection?.iceConnectionState;
    const isFailing = connectionState === 'failed' || connectionState === 'disconnected';

    return hasOnlyRelay || isFailing;
  }

  /**
   * Get ICE servers with TURN servers for fallback
   */
  public getTurnFallbackServers(): ICEServer[] {
    return this.config.iceServers.filter(
      (server) =>
        (Array.isArray(server.urls) && server.urls.some((url) => url.startsWith('turn:'))) ||
        (typeof server.urls === 'string' && server.urls.startsWith('turn:'))
    );
  }

  /**
   * Restart ICE gathering
   */
  public async restartIce(): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('No peer connection attached');
    }

    this.resetGatheringState();
    this.peerConnection.restartIce();
  }

  /**
   * Cleanup and release resources
   */
  public destroy(): void {
    this.detachFromPeerConnection();
    this.candidateHandlers.clear();
    this.gatheringStateHandlers.clear();
    this.connectionStateHandlers.clear();
    this.clearGatheringTimeout();
  }

  // ============================================
  // Private Methods
  // ============================================

  private convertRTCIceCandidate(rtcCandidate: RTCIceCandidate): ICECandidate {
    return {
      candidate: rtcCandidate.candidate,
      sdpMLineIndex: rtcCandidate.sdpMLineIndex,
      sdpMid: rtcCandidate.sdpMid,
      usernameFragment: rtcCandidate.usernameFragment,
      type: parseICECandidateType(rtcCandidate.candidate),
      priority: this.extractPriority(rtcCandidate.candidate),
      address: rtcCandidate.address ?? undefined,
      port: rtcCandidate.port ?? undefined,
      protocol: rtcCandidate.protocol as 'udp' | 'tcp' | undefined,
    };
  }

  private extractPriority(candidateString: string): number {
    const match = candidateString.match(/priority\s+(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  private mapCandidateType(type: string | undefined): ICECandidateType {
    switch (type) {
      case 'host':
        return 'host';
      case 'srflx':
        return 'srflx';
      case 'prflx':
        return 'prflx';
      case 'relay':
        return 'relay';
      default:
        return 'unknown';
    }
  }

  private analyzeCandidate(candidate: ICECandidate): void {
    // Update NAT type analysis based on new candidate
    if (candidate.type === 'srflx' || candidate.type === 'relay') {
      // We're behind some form of NAT
      if (this.detectedNATType === NATType.UNKNOWN) {
        this.detectedNATType = candidate.type === 'relay' ? NATType.SYMMETRIC : NATType.FULL_CONE;
      }
    }
  }

  private onGatheringComplete(): void {
    if (this.gatheringState.isComplete) {
      return;
    }

    this.gatheringState.isComplete = true;
    this.clearGatheringTimeout();

    // Detect NAT type based on gathered candidates
    this.detectNATType();

    if (this.gatheringResolve) {
      this.gatheringResolve();
      this.gatheringResolve = null;
      this.gatheringPromise = null;
    }
  }

  private clearGatheringTimeout(): void {
    if (this.gatheringTimeout) {
      clearTimeout(this.gatheringTimeout);
      this.gatheringTimeout = null;
    }
  }

  private resetGatheringState(): void {
    this.clearGatheringTimeout();
    this.gatheringState = {
      state: 'new',
      localCandidates: [],
      remoteCandidates: [],
      natType: NATType.UNKNOWN,
      isComplete: false,
    };
    this.gatheringPromise = null;
    this.gatheringResolve = null;
  }

  private emitCandidate(candidate: ICECandidate): void {
    if (this.config.enableTrickle) {
      this.candidateHandlers.forEach((handler) => {
        try {
          handler(candidate);
        } catch (error) {
          console.error('ICE candidate handler error:', error);
        }
      });
    }
  }

  private emitGatheringStateChange(state: RTCIceGatheringState): void {
    this.gatheringStateHandlers.forEach((handler) => {
      try {
        handler(state);
      } catch (error) {
        console.error('ICE gathering state handler error:', error);
      }
    });
  }

  private emitConnectionStateChange(state: RTCIceConnectionState): void {
    this.connectionStateHandlers.forEach((handler) => {
      try {
        handler(state);
      } catch (error) {
        console.error('ICE connection state handler error:', error);
      }
    });
  }

  private startQualityMonitoring(): void {
    if (this.qualityMonitorInterval) {
      return;
    }

    // Update quality metrics every 5 seconds
    this.qualityMonitorInterval = setInterval(() => {
      this.updateConnectionQuality();
    }, 5000);

    // Initial quality check
    this.updateConnectionQuality();
  }

  private stopQualityMonitoring(): void {
    if (this.qualityMonitorInterval) {
      clearInterval(this.qualityMonitorInterval);
      this.qualityMonitorInterval = null;
    }
  }
}

export default ICEManager;
