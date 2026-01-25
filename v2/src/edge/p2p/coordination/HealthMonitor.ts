/**
 * Health Monitor for P2P Connection Health Tracking
 *
 * Monitors connection health through ping/pong measurements,
 * latency tracking, and connection quality assessment.
 *
 * @module edge/p2p/coordination/HealthMonitor
 * @version 1.0.0
 */

import type { PeerId } from '../webrtc/types';
import type { HealthStatus, HealthIssue, CoordinationMetrics } from './types';
import {
  HealthLevel,
  createDefaultHealthStatus,
  createDefaultMetrics,
  DEFAULT_PING_INTERVAL,
  HEALTH_RTT_WARNING_THRESHOLD,
  HEALTH_RTT_CRITICAL_THRESHOLD,
  HEALTH_PACKET_LOSS_WARNING,
  HEALTH_PACKET_LOSS_CRITICAL,
} from './types';

// ============================================
// Types
// ============================================

/**
 * Health monitor configuration
 */
export interface HealthMonitorConfig {
  /** Peer ID being monitored */
  peerId: PeerId;

  /** Ping interval in milliseconds */
  pingInterval?: number;

  /** Health check interval in milliseconds */
  healthCheckInterval?: number;

  /** Number of latency samples to keep */
  latencySampleSize?: number;

  /** Consecutive failed pings before marking unhealthy */
  maxFailedPings?: number;

  /** Ping timeout in milliseconds */
  pingTimeout?: number;

  /** Callback to send ping */
  onPing: (sequence: number) => Promise<void>;

  /** Callback when health changes */
  onHealthChange: (health: HealthStatus) => void;

  /** Enable logging */
  enableLogging?: boolean;
}

/**
 * Latency sample
 */
interface LatencySample {
  /** Sample timestamp */
  timestamp: number;

  /** Round-trip time in milliseconds */
  rttMs: number;

  /** Ping sequence number */
  sequence: number;
}

/**
 * Pending ping tracking
 */
interface PendingPing {
  /** Ping sequence number */
  sequence: number;

  /** Sent timestamp */
  sentAt: number;

  /** Timeout handle */
  timeout: ReturnType<typeof setTimeout>;
}

// ============================================
// Health Monitor Class
// ============================================

/**
 * HealthMonitor - Tracks connection health metrics
 *
 * @example
 * ```typescript
 * const monitor = new HealthMonitor({
 *   peerId: 'peer-123',
 *   onPing: async (sequence) => {
 *     await sendPing(sequence);
 *   },
 *   onHealthChange: (health) => {
 *     console.log('Health changed:', health.level);
 *   },
 * });
 *
 * monitor.start();
 *
 * // When pong received
 * monitor.recordPong(sequence, originalTimestamp, responseTimestamp);
 *
 * // Get current health
 * const health = monitor.getHealth();
 * console.log('Score:', health.score, 'Level:', health.level);
 * ```
 */
export class HealthMonitor {
  private readonly config: Required<HealthMonitorConfig>;
  private readonly latencySamples: LatencySample[] = [];
  private readonly pendingPings: Map<number, PendingPing> = new Map();

  private currentSequence = 0;
  private pingInterval?: ReturnType<typeof setInterval>;
  private healthCheckInterval?: ReturnType<typeof setInterval>;
  private isRunning = false;

  // State tracking
  private failedPings = 0;
  private totalPingsSent = 0;
  private totalPongsReceived = 0;
  private lastPingAt?: number;
  private lastPongAt?: number;
  private startTime?: number;

  // Current health state
  private currentHealth: HealthStatus;
  private metrics: CoordinationMetrics;

  // Logging
  private log: (...args: unknown[]) => void;

  /**
   * Create a new HealthMonitor
   */
  constructor(config: HealthMonitorConfig) {
    this.config = {
      pingInterval: config.pingInterval ?? DEFAULT_PING_INTERVAL,
      healthCheckInterval: config.healthCheckInterval ?? 10000,
      latencySampleSize: config.latencySampleSize ?? 100,
      maxFailedPings: config.maxFailedPings ?? 3,
      pingTimeout: config.pingTimeout ?? 5000,
      enableLogging: config.enableLogging ?? false,
      ...config,
    };

    this.currentHealth = createDefaultHealthStatus();
    this.metrics = createDefaultMetrics();

    this.log = this.config.enableLogging
      ? (...args) => console.log(`[HealthMonitor:${this.config.peerId}]`, ...args)
      : () => {};
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * Start health monitoring
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now();
    this.log('Starting health monitoring');

    // Start ping interval
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, this.config.pingInterval);

    // Start health check interval
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);

    // Send initial ping
    this.sendPing();
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.log('Stopping health monitoring');

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    // Clear pending pings
    this.pendingPings.forEach((pending) => {
      clearTimeout(pending.timeout);
    });
    this.pendingPings.clear();
  }

  /**
   * Record a pong response
   *
   * @param sequence - Ping sequence number
   * @param originalTimestamp - Original ping timestamp
   * @param responseTimestamp - Pong response timestamp
   */
  recordPong(sequence: number, originalTimestamp: number, responseTimestamp: number): void {
    const pending = this.pendingPings.get(sequence);
    if (!pending) {
      this.log(`Received pong for unknown sequence: ${sequence}`);
      return;
    }

    // Clear timeout
    clearTimeout(pending.timeout);
    this.pendingPings.delete(sequence);

    // Calculate RTT
    const now = Date.now();
    const rttMs = now - pending.sentAt;

    this.lastPongAt = now;
    this.totalPongsReceived++;
    this.failedPings = 0; // Reset failed pings on success

    // Record sample
    this.recordLatencySample(sequence, rttMs);

    // Update metrics
    this.updateMetrics(rttMs);

    this.log(`Pong received: seq=${sequence}, rtt=${rttMs}ms`);
  }

  /**
   * Get current health status
   */
  getHealth(): HealthStatus {
    return { ...this.currentHealth };
  }

  /**
   * Get current metrics
   */
  getMetrics(): CoordinationMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if connection is healthy
   */
  isHealthy(): boolean {
    return this.currentHealth.level === HealthLevel.HEALTHY;
  }

  /**
   * Check if connection is responsive
   */
  isResponsive(): boolean {
    return this.currentHealth.isResponsive;
  }

  /**
   * Get current latency
   */
  getCurrentLatency(): number {
    return this.currentHealth.currentRttMs;
  }

  /**
   * Get average latency
   */
  getAverageLatency(): number {
    return this.metrics.avgLatencyMs;
  }

  /**
   * Get packet loss percentage
   */
  getPacketLoss(): number {
    return this.currentHealth.packetLossPercent;
  }

  /**
   * Force a health check
   */
  forceHealthCheck(): HealthStatus {
    this.performHealthCheck();
    return this.getHealth();
  }

  /**
   * Reset health state
   */
  reset(): void {
    this.latencySamples.length = 0;
    this.pendingPings.clear();
    this.currentSequence = 0;
    this.failedPings = 0;
    this.totalPingsSent = 0;
    this.totalPongsReceived = 0;
    this.lastPingAt = undefined;
    this.lastPongAt = undefined;
    this.currentHealth = createDefaultHealthStatus();
    this.metrics = createDefaultMetrics();
    this.startTime = Date.now();
  }

  // ============================================
  // Private - Ping Management
  // ============================================

  private async sendPing(): Promise<void> {
    const sequence = ++this.currentSequence;
    const sentAt = Date.now();

    this.lastPingAt = sentAt;
    this.totalPingsSent++;

    // Set up timeout
    const timeout = setTimeout(() => {
      this.handlePingTimeout(sequence);
    }, this.config.pingTimeout);

    // Track pending ping
    this.pendingPings.set(sequence, { sequence, sentAt, timeout });

    try {
      await this.config.onPing(sequence);
      this.log(`Ping sent: seq=${sequence}`);
    } catch (error) {
      this.log(`Failed to send ping: ${error}`);
      clearTimeout(timeout);
      this.pendingPings.delete(sequence);
      this.handlePingTimeout(sequence);
    }
  }

  private handlePingTimeout(sequence: number): void {
    const pending = this.pendingPings.get(sequence);
    if (!pending) {
      return;
    }

    this.pendingPings.delete(sequence);
    this.failedPings++;

    this.log(`Ping timeout: seq=${sequence}, failed=${this.failedPings}`);

    // Perform health check to update status
    this.performHealthCheck();
  }

  // ============================================
  // Private - Latency Tracking
  // ============================================

  private recordLatencySample(sequence: number, rttMs: number): void {
    const sample: LatencySample = {
      timestamp: Date.now(),
      rttMs,
      sequence,
    };

    this.latencySamples.push(sample);

    // Trim old samples
    while (this.latencySamples.length > this.config.latencySampleSize) {
      this.latencySamples.shift();
    }
  }

  private updateMetrics(rttMs: number): void {
    this.metrics.latencyMs = rttMs;

    // Update min/max
    if (rttMs < this.metrics.minLatencyMs) {
      this.metrics.minLatencyMs = rttMs;
    }
    if (rttMs > this.metrics.maxLatencyMs) {
      this.metrics.maxLatencyMs = rttMs;
    }

    // Calculate average from samples
    if (this.latencySamples.length > 0) {
      const sum = this.latencySamples.reduce((acc, s) => acc + s.rttMs, 0);
      this.metrics.avgLatencyMs = sum / this.latencySamples.length;
    }

    // Calculate jitter (standard deviation)
    if (this.latencySamples.length > 1) {
      const avg = this.metrics.avgLatencyMs;
      const variance = this.latencySamples.reduce(
        (acc, s) => acc + Math.pow(s.rttMs - avg, 2),
        0
      ) / this.latencySamples.length;
      this.metrics.jitterMs = Math.sqrt(variance);
    }

    // Update uptime
    if (this.startTime) {
      this.metrics.uptimeMs = Date.now() - this.startTime;
    }

    this.metrics.lastActivityAt = Date.now();
    this.metrics.collectedAt = Date.now();
  }

  // ============================================
  // Private - Health Check
  // ============================================

  private performHealthCheck(): void {
    const issues: HealthIssue[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check responsiveness
    const isResponsive = this.failedPings < this.config.maxFailedPings;

    // Calculate packet loss
    const packetLossPercent = this.totalPingsSent > 0
      ? ((this.totalPingsSent - this.totalPongsReceived) / this.totalPingsSent) * 100
      : 0;

    // Get current RTT
    const currentRttMs = this.latencySamples.length > 0
      ? this.latencySamples[this.latencySamples.length - 1].rttMs
      : 0;

    // Check for high latency
    if (currentRttMs > HEALTH_RTT_CRITICAL_THRESHOLD) {
      issues.push({
        type: 'high_latency',
        severity: 'critical',
        message: `Very high latency: ${currentRttMs}ms`,
        detectedAt: Date.now(),
        value: currentRttMs,
        threshold: HEALTH_RTT_CRITICAL_THRESHOLD,
      });
      score -= 40;
      recommendations.push('Check network connectivity and try a closer server');
    } else if (currentRttMs > HEALTH_RTT_WARNING_THRESHOLD) {
      issues.push({
        type: 'high_latency',
        severity: 'warning',
        message: `High latency: ${currentRttMs}ms`,
        detectedAt: Date.now(),
        value: currentRttMs,
        threshold: HEALTH_RTT_WARNING_THRESHOLD,
      });
      score -= 15;
      recommendations.push('Consider reducing sync batch size');
    }

    // Check for packet loss
    if (packetLossPercent > HEALTH_PACKET_LOSS_CRITICAL) {
      issues.push({
        type: 'packet_loss',
        severity: 'critical',
        message: `Critical packet loss: ${packetLossPercent.toFixed(1)}%`,
        detectedAt: Date.now(),
        value: packetLossPercent,
        threshold: HEALTH_PACKET_LOSS_CRITICAL,
      });
      score -= 40;
      recommendations.push('Network connection is unstable, reconnect may be needed');
    } else if (packetLossPercent > HEALTH_PACKET_LOSS_WARNING) {
      issues.push({
        type: 'packet_loss',
        severity: 'warning',
        message: `Packet loss detected: ${packetLossPercent.toFixed(1)}%`,
        detectedAt: Date.now(),
        value: packetLossPercent,
        threshold: HEALTH_PACKET_LOSS_WARNING,
      });
      score -= 20;
      recommendations.push('Some messages may need retransmission');
    }

    // Check for no response
    if (!isResponsive) {
      issues.push({
        type: 'no_response',
        severity: 'critical',
        message: `No response for ${this.failedPings} consecutive pings`,
        detectedAt: Date.now(),
        value: this.failedPings,
        threshold: this.config.maxFailedPings,
      });
      score -= 50;
      recommendations.push('Peer may be offline, attempting reconnection');
    }

    // Check for high jitter
    if (this.metrics.jitterMs > 100) {
      issues.push({
        type: 'jitter',
        severity: 'warning',
        message: `High latency variance: ${this.metrics.jitterMs.toFixed(1)}ms`,
        detectedAt: Date.now(),
        value: this.metrics.jitterMs,
        threshold: 100,
      });
      score -= 10;
      recommendations.push('Connection quality is variable');
    }

    // Determine health level
    let level: HealthLevel;
    if (!isResponsive || score <= 20) {
      level = HealthLevel.UNHEALTHY;
    } else if (score <= 40) {
      level = HealthLevel.CRITICAL;
    } else if (score <= 70) {
      level = HealthLevel.WARNING;
    } else {
      level = HealthLevel.HEALTHY;
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    // Build health status
    const newHealth: HealthStatus = {
      level,
      score,
      isResponsive,
      lastPingAt: this.lastPingAt,
      lastPongAt: this.lastPongAt,
      failedPings: this.failedPings,
      currentRttMs,
      packetLossPercent,
      issues,
      recommendations,
      checkedAt: Date.now(),
    };

    // Check if health changed
    const healthChanged = this.currentHealth.level !== newHealth.level;
    this.currentHealth = newHealth;

    // Notify if health changed
    if (healthChanged) {
      this.log(`Health changed: ${level} (score: ${score})`);
      this.config.onHealthChange(newHealth);
    }
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new HealthMonitor instance
 */
export function createHealthMonitor(config: HealthMonitorConfig): HealthMonitor {
  return new HealthMonitor(config);
}
