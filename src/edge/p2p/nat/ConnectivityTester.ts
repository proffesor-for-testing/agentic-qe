/**
 * Connectivity Tester for @ruvector/edge P2P
 *
 * Tests connectivity between peers, measures RTT, ranks connection candidates,
 * and provides connectivity recommendations.
 *
 * @module edge/p2p/nat/ConnectivityTester
 * @version 1.0.0
 */

import { PeerId, ICECandidate, ICECandidateType } from '../webrtc/types';
import {
  ConnectivityTestResult,
  ConnectivityTestConfig,
  ConnectivityTesterConfig,
  CandidateRanking,
  ConnectivityRecommendation,
  ConnectionPath,
  NATClassification,
  TURNConfig,
  NATEventType,
  NATEvent,
  NATEventHandler,
  DEFAULT_CONNECTIVITY_TESTER_CONFIG,
  NAT_CONNECTIVITY_MATRIX,
} from './types';

/**
 * Ping measurement result
 */
interface PingResult {
  /** Sequence number */
  seq: number;
  /** Round-trip time in ms */
  rttMs: number;
  /** Whether ping succeeded */
  success: boolean;
  /** Timestamp */
  timestamp: number;
}

/**
 * Bandwidth measurement result
 */
interface BandwidthResult {
  /** Upload bandwidth in kbps */
  uploadKbps: number;
  /** Download bandwidth in kbps */
  downloadKbps: number;
  /** Test duration in ms */
  durationMs: number;
  /** Data transferred in bytes */
  bytesTransferred: number;
}

/**
 * Connectivity Tester - Tests and ranks peer connectivity
 *
 * @example
 * ```typescript
 * const tester = new ConnectivityTester({
 *   timeout: 15000,
 *   pingCount: 10,
 *   maxAcceptableRtt: 500,
 * });
 *
 * // Test connectivity to peer
 * const result = await tester.test(peerId, {
 *   dataChannel: rtcDataChannel,
 *   candidates: [...],
 * });
 *
 * console.log('Connected:', result.connected);
 * console.log('RTT:', result.rttMs);
 *
 * // Get recommendations
 * const recommendation = tester.getRecommendation(candidates, localNat, remoteNat);
 * ```
 */
export class ConnectivityTester {
  private readonly config: ConnectivityTesterConfig;
  private eventHandlers: Map<NATEventType, Set<NATEventHandler>> = new Map();
  private activeTests: Map<PeerId, AbortController> = new Map();

  /**
   * Create a new Connectivity Tester
   *
   * @param config - Tester configuration
   */
  constructor(config: Partial<ConnectivityTesterConfig> = {}) {
    this.config = {
      ...DEFAULT_CONNECTIVITY_TESTER_CONFIG,
      ...config,
    };
  }

  /**
   * Test connectivity to a peer
   *
   * @param peerId - Peer to test
   * @param options - Test options
   * @returns Promise resolving to test result
   */
  public async test(
    peerId: PeerId,
    options: {
      dataChannel: RTCDataChannel;
      candidates: ICECandidate[];
    }
  ): Promise<ConnectivityTestResult> {
    // Cancel any existing test to this peer
    this.cancelTest(peerId);

    const abortController = new AbortController();
    this.activeTests.set(peerId, abortController);

    const startTime = Date.now();

    try {
      // Wait for data channel to be open
      if (options.dataChannel.readyState !== 'open') {
        await this.waitForChannelOpen(options.dataChannel, abortController.signal);
      }

      // Perform ping tests
      const pingResults = await this.performPingTests(
        options.dataChannel,
        abortController.signal
      );

      // Calculate statistics
      const stats = this.calculateStats(pingResults);

      // Optional bandwidth test
      let bandwidthKbps: number | undefined;
      if (this.config.enableBandwidthTest) {
        const bandwidthResult = await this.measureBandwidth(
          options.dataChannel,
          abortController.signal
        );
        bandwidthKbps = (bandwidthResult.uploadKbps + bandwidthResult.downloadKbps) / 2;
      }

      // Determine connection path from candidates
      const path = this.determineConnectionPath(options.candidates);

      // Get successful candidates
      const successfulCandidates = options.candidates.filter(
        (c) => c.type === 'host' || c.type === 'srflx' || c.type === 'relay'
      );

      const result: ConnectivityTestResult = {
        peerId,
        connected: stats.successRate > 0.5,
        path,
        rttMs: stats.avgRtt,
        packetLossPercent: (1 - stats.successRate) * 100,
        jitterMs: stats.jitter,
        bandwidthKbps,
        successfulCandidates,
        durationMs: Date.now() - startTime,
        testedAt: Date.now(),
      };

      this.emitEvent(NATEventType.ConnectivityTestCompleted, result);
      return result;
    } catch (error) {
      return {
        peerId,
        connected: false,
        path: ConnectionPath.Failed,
        rttMs: 0,
        packetLossPercent: 100,
        jitterMs: 0,
        successfulCandidates: [],
        durationMs: Date.now() - startTime,
        testedAt: Date.now(),
      };
    } finally {
      this.activeTests.delete(peerId);
    }
  }

  /**
   * Cancel an ongoing test
   *
   * @param peerId - Peer ID of test to cancel
   */
  public cancelTest(peerId: PeerId): void {
    const controller = this.activeTests.get(peerId);
    if (controller) {
      controller.abort();
      this.activeTests.delete(peerId);
    }
  }

  /**
   * Cancel all ongoing tests
   */
  public cancelAllTests(): void {
    this.activeTests.forEach((controller) => {
      controller.abort();
    });
    this.activeTests.clear();
  }

  /**
   * Rank ICE candidates by quality
   *
   * @param candidates - Candidates to rank
   * @param rttMeasurements - Optional RTT measurements per candidate
   * @returns Ranked candidates
   */
  public rankCandidates(
    candidates: ICECandidate[],
    rttMeasurements?: Map<string, number>
  ): CandidateRanking[] {
    const rankings: CandidateRanking[] = [];

    for (const candidate of candidates) {
      const rtt = rttMeasurements?.get(candidate.candidate) ?? this.estimateRtt(candidate);
      const ranking = this.calculateCandidateRanking(candidate, rtt);
      rankings.push(ranking);
    }

    // Sort by score descending
    rankings.sort((a, b) => b.score - a.score);

    // Mark top candidate as recommended
    if (rankings.length > 0) {
      rankings[0].recommended = true;
    }

    return rankings;
  }

  /**
   * Get connectivity recommendation
   *
   * @param localCandidates - Local ICE candidates
   * @param remoteCandidates - Remote ICE candidates
   * @param localNat - Local NAT type
   * @param remoteNat - Remote NAT type
   * @param turnServers - Available TURN servers
   * @returns Connectivity recommendation
   */
  public getRecommendation(
    localCandidates: ICECandidate[],
    remoteCandidates: ICECandidate[],
    localNat: NATClassification,
    remoteNat: NATClassification,
    turnServers: TURNConfig[] = []
  ): ConnectivityRecommendation {
    // Estimate success probability
    const directProbability = NAT_CONNECTIVITY_MATRIX[localNat]?.[remoteNat] ?? 0.3;

    // Rank candidates
    const localRankings = this.rankCandidates(localCandidates);
    const remoteRankings = this.rankCandidates(remoteCandidates);

    // Separate by type
    const directCandidates = localCandidates.filter(
      (c) => c.type === 'host' || c.type === 'srflx'
    );
    const relayCandidates = localCandidates.filter((c) => c.type === 'relay');

    // Determine recommended approach
    let approach: 'direct' | 'turn' | 'hybrid' | 'abort';
    let reasoning: string;

    if (directProbability >= 0.7) {
      approach = 'direct';
      reasoning = `High direct connectivity probability (${Math.round(directProbability * 100)}%) based on NAT types`;
    } else if (directProbability >= 0.4) {
      approach = 'hybrid';
      reasoning = `Moderate connectivity probability (${Math.round(directProbability * 100)}%) - try direct first, fallback to TURN`;
    } else if (turnServers.length > 0 || relayCandidates.length > 0) {
      approach = 'turn';
      reasoning = `Low direct connectivity probability (${Math.round(directProbability * 100)}%) - TURN relay recommended`;
    } else {
      approach = 'abort';
      reasoning = `Low connectivity probability and no TURN servers available`;
    }

    // Select recommended TURN server
    const turnServer =
      turnServers.length > 0
        ? turnServers.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))[0]
        : undefined;

    return {
      approach,
      primaryCandidates:
        approach === 'turn'
          ? relayCandidates.length > 0
            ? relayCandidates
            : directCandidates
          : directCandidates,
      fallbackCandidates:
        approach === 'hybrid' ? relayCandidates : [],
      turnServer,
      successProbability:
        approach === 'turn' ? 0.95 : approach === 'hybrid' ? 0.85 : directProbability,
      reasoning,
    };
  }

  /**
   * Test RTT to a specific endpoint
   *
   * @param dataChannel - Data channel to use
   * @param pingCount - Number of pings
   * @returns Promise resolving to average RTT
   */
  public async measureRtt(
    dataChannel: RTCDataChannel,
    pingCount: number = this.config.pingCount
  ): Promise<number> {
    const results = await this.performPingTests(dataChannel);
    const successfulPings = results.filter((r) => r.success);

    if (successfulPings.length === 0) {
      return Infinity;
    }

    return successfulPings.reduce((sum, r) => sum + r.rttMs, 0) / successfulPings.length;
  }

  /**
   * Check if connectivity meets quality thresholds
   *
   * @param result - Test result to check
   * @returns Whether connectivity is acceptable
   */
  public isAcceptable(result: ConnectivityTestResult): boolean {
    return (
      result.connected &&
      result.rttMs <= this.config.maxAcceptableRtt &&
      result.packetLossPercent <= this.config.maxAcceptablePacketLoss
    );
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
  public getConfig(): ConnectivityTesterConfig {
    return { ...this.config };
  }

  // ============================================
  // Private Methods
  // ============================================

  private async waitForChannelOpen(
    channel: RTCDataChannel,
    signal?: AbortSignal
  ): Promise<void> {
    if (channel.readyState === 'open') return;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        channel.removeEventListener('open', onOpen);
        reject(new Error('Data channel open timeout'));
      }, this.config.timeout);

      const onOpen = () => {
        clearTimeout(timeout);
        resolve();
      };

      const onAbort = () => {
        clearTimeout(timeout);
        channel.removeEventListener('open', onOpen);
        reject(new Error('Test cancelled'));
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      channel.addEventListener('open', onOpen, { once: true });
    });
  }

  private async performPingTests(
    channel: RTCDataChannel,
    signal?: AbortSignal
  ): Promise<PingResult[]> {
    const results: PingResult[] = [];

    for (let seq = 0; seq < this.config.pingCount; seq++) {
      if (signal?.aborted) break;

      const result = await this.sendPing(channel, seq, signal);
      results.push(result);

      // Delay between pings
      if (seq < this.config.pingCount - 1) {
        await this.delay(this.config.pingInterval);
      }
    }

    return results;
  }

  private async sendPing(
    channel: RTCDataChannel,
    seq: number,
    signal?: AbortSignal
  ): Promise<PingResult> {
    return new Promise((resolve) => {
      const pingId = `ping-${seq}-${Date.now()}`;
      const startTime = performance.now();

      const timeout = setTimeout(() => {
        channel.removeEventListener('message', onMessage);
        resolve({
          seq,
          rttMs: Infinity,
          success: false,
          timestamp: Date.now(),
        });
      }, this.config.timeout / this.config.pingCount);

      const onMessage = (event: MessageEvent) => {
        try {
          const data =
            typeof event.data === 'string'
              ? JSON.parse(event.data)
              : event.data;

          if (data.type === 'pong' && data.id === pingId) {
            clearTimeout(timeout);
            channel.removeEventListener('message', onMessage);
            resolve({
              seq,
              rttMs: performance.now() - startTime,
              success: true,
              timestamp: Date.now(),
            });
          }
        } catch {
          // Ignore parse errors
        }
      };

      const onAbort = () => {
        clearTimeout(timeout);
        channel.removeEventListener('message', onMessage);
        resolve({
          seq,
          rttMs: Infinity,
          success: false,
          timestamp: Date.now(),
        });
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      channel.addEventListener('message', onMessage);

      // Send ping
      try {
        channel.send(
          JSON.stringify({
            type: 'ping',
            id: pingId,
            seq,
            timestamp: Date.now(),
          })
        );
      } catch {
        clearTimeout(timeout);
        channel.removeEventListener('message', onMessage);
        resolve({
          seq,
          rttMs: Infinity,
          success: false,
          timestamp: Date.now(),
        });
      }
    });
  }

  private async measureBandwidth(
    channel: RTCDataChannel,
    signal?: AbortSignal
  ): Promise<BandwidthResult> {
    const testSize = this.config.enableBandwidthTest ? 64 * 1024 : 0; // 64KB test
    const startTime = performance.now();

    // Generate test data
    const testData = new Uint8Array(testSize);
    for (let i = 0; i < testSize; i++) {
      testData[i] = i % 256;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          uploadKbps: 0,
          downloadKbps: 0,
          durationMs: performance.now() - startTime,
          bytesTransferred: 0,
        });
      }, 10000);

      let bytesReceived = 0;
      const uploadStart = performance.now();

      const onMessage = (event: MessageEvent) => {
        if (event.data instanceof ArrayBuffer) {
          bytesReceived += event.data.byteLength;
        } else if (typeof event.data === 'string') {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'bandwidth_ack') {
              clearTimeout(timeout);
              channel.removeEventListener('message', onMessage);

              const duration = performance.now() - uploadStart;
              const uploadKbps = (testSize * 8) / duration; // bits per ms = kbps

              resolve({
                uploadKbps,
                downloadKbps: uploadKbps, // Assume symmetric for simplicity
                durationMs: duration,
                bytesTransferred: testSize + bytesReceived,
              });
            }
          } catch {
            // Ignore
          }
        }
      };

      channel.addEventListener('message', onMessage);

      // Send test data
      try {
        channel.send(testData.buffer);
        channel.send(
          JSON.stringify({ type: 'bandwidth_test', size: testSize })
        );
      } catch {
        clearTimeout(timeout);
        channel.removeEventListener('message', onMessage);
        resolve({
          uploadKbps: 0,
          downloadKbps: 0,
          durationMs: performance.now() - startTime,
          bytesTransferred: 0,
        });
      }
    });
  }

  private calculateStats(results: PingResult[]): {
    avgRtt: number;
    minRtt: number;
    maxRtt: number;
    jitter: number;
    successRate: number;
  } {
    const successful = results.filter((r) => r.success);

    if (successful.length === 0) {
      return {
        avgRtt: Infinity,
        minRtt: Infinity,
        maxRtt: Infinity,
        jitter: 0,
        successRate: 0,
      };
    }

    const rtts = successful.map((r) => r.rttMs);
    const avgRtt = rtts.reduce((a, b) => a + b, 0) / rtts.length;
    const minRtt = Math.min(...rtts);
    const maxRtt = Math.max(...rtts);

    // Calculate jitter as average deviation from mean
    const jitter =
      rtts.reduce((sum, rtt) => sum + Math.abs(rtt - avgRtt), 0) / rtts.length;

    return {
      avgRtt,
      minRtt,
      maxRtt,
      jitter,
      successRate: successful.length / results.length,
    };
  }

  private determineConnectionPath(candidates: ICECandidate[]): ConnectionPath {
    // Check candidate types to determine path
    const hasRelay = candidates.some((c) => c.type === 'relay');
    const hasDirect = candidates.some(
      (c) => c.type === 'host' || c.type === 'srflx'
    );

    if (hasRelay && !hasDirect) {
      return ConnectionPath.Relay;
    } else if (hasDirect) {
      return ConnectionPath.Direct;
    }

    return ConnectionPath.Pending;
  }

  private calculateCandidateRanking(
    candidate: ICECandidate,
    rttMs: number
  ): CandidateRanking {
    // Calculate component scores (0-100)
    const rttScore = this.calculateRttScore(rttMs);
    const reliabilityScore = this.calculateReliabilityScore(candidate);
    const pathScore = this.calculatePathScore(candidate.type);

    // Weighted average
    const score = rttScore * 0.4 + reliabilityScore * 0.3 + pathScore * 0.3;

    return {
      candidate,
      score,
      rttScore,
      reliabilityScore,
      pathScore,
      recommended: false,
    };
  }

  private calculateRttScore(rttMs: number): number {
    if (rttMs === Infinity) return 0;
    // Score decreases with RTT, max 100 at 0ms, min ~0 at 1000ms
    return Math.max(0, 100 - (rttMs / 10));
  }

  private calculateReliabilityScore(candidate: ICECandidate): number {
    // Base score on candidate type and protocol
    let score = 50;

    // Prefer TCP for reliability
    if (candidate.protocol === 'tcp') {
      score += 20;
    }

    // Relay candidates are more reliable but slower
    if (candidate.type === 'relay') {
      score += 30;
    }

    // Host candidates may be less reliable in NAT scenarios
    if (candidate.type === 'host') {
      score -= 10;
    }

    return Math.min(100, Math.max(0, score));
  }

  private calculatePathScore(type: ICECandidateType): number {
    // Score based on path preference
    switch (type) {
      case 'host':
        return 100; // Best - direct connection
      case 'srflx':
        return 80; // Good - through STUN
      case 'prflx':
        return 70; // OK - peer reflexive
      case 'relay':
        return 30; // Lower - through TURN
      default:
        return 0;
    }
  }

  private estimateRtt(candidate: ICECandidate): number {
    // Estimate RTT based on candidate type
    switch (candidate.type) {
      case 'host':
        return 5; // Local network
      case 'srflx':
        return 30; // Through NAT
      case 'prflx':
        return 40; // Peer reflexive
      case 'relay':
        return 100; // Through TURN
      default:
        return 200;
    }
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
          console.error(`Connectivity tester event handler error for ${type}:`, error);
        }
      });
    }
  }
}

export default ConnectivityTester;
