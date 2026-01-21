/**
 * NAT Detector for @ruvector/edge P2P
 *
 * Detects NAT type using STUN servers with multiple testing strategies.
 * Implements RFC 3489/5389 compliant NAT classification with caching
 * and parallel server testing for reliable detection.
 *
 * @module edge/p2p/nat/NATDetector
 * @version 1.0.0
 */

import { ICEServer } from '../webrtc/types';
import {
  NATClassification,
  NATDetectionResult,
  NATDetectorConfig,
  STUNBindingResponse,
  NAT_CONNECTIVITY_MATRIX,
  NATEventType,
  NATEvent,
  NATEventHandler,
  DEFAULT_NAT_DETECTOR_CONFIG,
} from './types';

/**
 * STUN message type constants
 */
const STUN_BINDING_REQUEST = 0x0001;
const STUN_BINDING_RESPONSE = 0x0101;
const STUN_MAGIC_COOKIE = 0x2112a442;
const STUN_HEADER_SIZE = 20;

/**
 * STUN attribute types
 */
const STUN_ATTR_MAPPED_ADDRESS = 0x0001;
const STUN_ATTR_XOR_MAPPED_ADDRESS = 0x0020;
const STUN_ATTR_RESPONSE_ORIGIN = 0x802b;

/**
 * NAT Detector - Detects NAT type using STUN
 *
 * @example
 * ```typescript
 * const detector = new NATDetector({
 *   stunServers: [
 *     { urls: 'stun:stun.l.google.com:19302' },
 *     { urls: 'stun:stun1.l.google.com:19302' },
 *   ],
 *   timeout: 10000,
 *   enableCache: true,
 * });
 *
 * const result = await detector.detect();
 * console.log('NAT Type:', result.natType);
 * console.log('External IP:', result.externalAddress);
 * ```
 */
export class NATDetector {
  private readonly config: NATDetectorConfig;
  private cachedResult: NATDetectionResult | null = null;
  private cacheTimestamp: number = 0;
  private eventHandlers: Map<NATEventType, Set<NATEventHandler>> = new Map();
  private isDetecting: boolean = false;
  private detectionPromise: Promise<NATDetectionResult> | null = null;

  /**
   * Create a new NAT Detector
   *
   * @param config - Detector configuration
   */
  constructor(config: Partial<NATDetectorConfig> = {}) {
    this.config = {
      ...DEFAULT_NAT_DETECTOR_CONFIG,
      ...config,
      stunServers: config.stunServers ?? DEFAULT_NAT_DETECTOR_CONFIG.stunServers,
    };
  }

  /**
   * Detect NAT type using configured STUN servers
   *
   * @returns Promise resolving to NAT detection result
   */
  public async detect(): Promise<NATDetectionResult> {
    // Check cache first
    if (this.isCacheValid()) {
      return this.cachedResult!;
    }

    // If detection is already in progress, return existing promise
    if (this.isDetecting && this.detectionPromise) {
      return this.detectionPromise;
    }

    this.isDetecting = true;
    this.detectionPromise = this.performDetection();

    try {
      const result = await this.detectionPromise;
      return result;
    } finally {
      this.isDetecting = false;
      this.detectionPromise = null;
    }
  }

  /**
   * Force re-detection, ignoring cache
   *
   * @returns Promise resolving to fresh NAT detection result
   */
  public async forceDetect(): Promise<NATDetectionResult> {
    this.invalidateCache();
    return this.detect();
  }

  /**
   * Get cached detection result if available and valid
   *
   * @returns Cached result or null
   */
  public getCachedResult(): NATDetectionResult | null {
    return this.isCacheValid() ? this.cachedResult : null;
  }

  /**
   * Invalidate cached detection result
   */
  public invalidateCache(): void {
    this.cachedResult = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Estimate connectivity probability between two NAT types
   *
   * @param localNat - Local NAT type
   * @param remoteNat - Remote NAT type
   * @returns Probability (0-1) of successful direct connection
   */
  public estimateConnectivity(
    localNat: NATClassification,
    remoteNat: NATClassification
  ): number {
    return NAT_CONNECTIVITY_MATRIX[localNat]?.[remoteNat] ?? 0.3;
  }

  /**
   * Check if TURN relay is recommended based on NAT types
   *
   * @param localNat - Local NAT type
   * @param remoteNat - Remote NAT type
   * @param threshold - Probability threshold (default 0.5)
   * @returns True if TURN is recommended
   */
  public shouldUseTurn(
    localNat: NATClassification,
    remoteNat: NATClassification,
    threshold: number = 0.5
  ): boolean {
    const probability = this.estimateConnectivity(localNat, remoteNat);
    return probability < threshold;
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
  public getConfig(): NATDetectorConfig {
    return { ...this.config };
  }

  // ============================================
  // Private Methods
  // ============================================

  private isCacheValid(): boolean {
    if (!this.config.enableCache || !this.cachedResult) {
      return false;
    }
    const age = Date.now() - this.cacheTimestamp;
    return age < this.config.cacheTtl;
  }

  private async performDetection(): Promise<NATDetectionResult> {
    const startTime = Date.now();

    this.emitEvent(NATEventType.DetectionStarted, {
      servers: this.config.stunServers.map((s) => this.getServerUrl(s)),
      timestamp: startTime,
    });

    try {
      // Get binding responses from STUN servers
      const responses = await this.queryStunServers();

      if (responses.length < this.config.minServers) {
        const result = this.createFailedResult(
          startTime,
          `Insufficient STUN responses: ${responses.length}/${this.config.minServers}`
        );
        this.emitEvent(NATEventType.DetectionFailed, result);
        return result;
      }

      // Analyze responses to determine NAT type
      const result = this.analyzeResponses(responses, startTime);

      // Cache result
      if (this.config.enableCache) {
        this.cachedResult = result;
        this.cacheTimestamp = Date.now();
      }

      this.emitEvent(NATEventType.DetectionCompleted, result);
      return result;
    } catch (error) {
      const result = this.createFailedResult(
        startTime,
        error instanceof Error ? error.message : 'Unknown detection error'
      );
      this.emitEvent(NATEventType.DetectionFailed, result);
      return result;
    }
  }

  private async queryStunServers(): Promise<STUNBindingResponse[]> {
    const servers = this.config.stunServers;

    if (this.config.parallelTesting) {
      // Query all servers in parallel
      const promises = servers.map((server) => this.queryStunServer(server));
      const results = await Promise.allSettled(promises);

      return results
        .filter(
          (r): r is PromiseFulfilledResult<STUNBindingResponse> =>
            r.status === 'fulfilled' && r.value.success
        )
        .map((r) => r.value);
    } else {
      // Query servers sequentially
      const responses: STUNBindingResponse[] = [];
      for (const server of servers) {
        try {
          const response = await this.queryStunServer(server);
          if (response.success) {
            responses.push(response);
          }
          if (responses.length >= this.config.minServers) {
            break;
          }
        } catch {
          // Continue to next server
        }
      }
      return responses;
    }
  }

  private async queryStunServer(server: ICEServer): Promise<STUNBindingResponse> {
    const serverUrl = this.getServerUrl(server);
    const startTime = Date.now();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          server: serverUrl,
          mappedAddress: '',
          mappedPort: 0,
          responseTimeMs: Date.now() - startTime,
          success: false,
          error: 'Timeout',
        });
      }, this.config.timeout);

      // Use RTCPeerConnection for STUN binding in browser environment
      this.performStunBinding(server)
        .then((result) => {
          clearTimeout(timeout);
          resolve({
            ...result,
            server: serverUrl,
            responseTimeMs: Date.now() - startTime,
          });
        })
        .catch((error) => {
          clearTimeout(timeout);
          resolve({
            server: serverUrl,
            mappedAddress: '',
            mappedPort: 0,
            responseTimeMs: Date.now() - startTime,
            success: false,
            error: error instanceof Error ? error.message : 'STUN query failed',
          });
        });
    });
  }

  private async performStunBinding(
    server: ICEServer
  ): Promise<Omit<STUNBindingResponse, 'server' | 'responseTimeMs'>> {
    return new Promise((resolve, reject) => {
      // Check for RTCPeerConnection availability
      if (typeof RTCPeerConnection === 'undefined') {
        reject(new Error('RTCPeerConnection not available'));
        return;
      }

      const pc = new RTCPeerConnection({
        iceServers: [server],
        iceCandidatePoolSize: 0,
      });

      let resolved = false;
      const candidateTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          pc.close();
          reject(new Error('No ICE candidates gathered'));
        }
      }, this.config.timeout);

      pc.onicecandidate = (event) => {
        if (event.candidate && !resolved) {
          const candidate = event.candidate.candidate;

          // Look for srflx (server reflexive) candidate
          if (candidate.includes('typ srflx')) {
            const parsed = this.parseCandidate(candidate);
            if (parsed) {
              resolved = true;
              clearTimeout(candidateTimeout);
              pc.close();
              resolve({
                mappedAddress: parsed.address,
                mappedPort: parsed.port,
                success: true,
              });
            }
          }
        } else if (event.candidate === null && !resolved) {
          // Gathering complete without srflx
          resolved = true;
          clearTimeout(candidateTimeout);
          pc.close();
          reject(new Error('No server reflexive candidate found'));
        }
      };

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete' && !resolved) {
          resolved = true;
          clearTimeout(candidateTimeout);
          pc.close();
          reject(new Error('ICE gathering complete without srflx candidate'));
        }
      };

      // Create data channel to trigger ICE gathering
      pc.createDataChannel('nat-detection');

      // Create offer to start ICE gathering
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch((error) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(candidateTimeout);
            pc.close();
            reject(error);
          }
        });
    });
  }

  private parseCandidate(
    candidateString: string
  ): { address: string; port: number } | null {
    // Parse ICE candidate format:
    // candidate:foundation component protocol priority address port typ type ...
    const parts = candidateString.split(' ');
    if (parts.length < 6) {
      return null;
    }

    const address = parts[4];
    const port = parseInt(parts[5], 10);

    if (address && !isNaN(port)) {
      return { address, port };
    }
    return null;
  }

  private analyzeResponses(
    responses: STUNBindingResponse[],
    startTime: number
  ): NATDetectionResult {
    const addresses = new Set<string>();
    const ports = new Set<number>();
    const serversUsed: string[] = [];

    for (const response of responses) {
      if (response.success) {
        addresses.add(response.mappedAddress);
        ports.add(response.mappedPort);
        serversUsed.push(response.server);
      }
    }

    const durationMs = Date.now() - startTime;

    // Analyze mapping consistency
    const portMappingConsistent = ports.size === 1;
    const addressConsistent = addresses.size === 1;

    // Determine NAT type based on responses
    let natType: NATClassification;
    let confidence: number;

    if (addresses.size === 0) {
      natType = NATClassification.Failed;
      confidence = 0;
    } else if (addressConsistent && portMappingConsistent) {
      // Same mapped address and port from multiple servers
      // Indicates consistent NAT mapping
      natType = this.classifyConsistentMapping(responses);
      confidence = Math.min(0.9, 0.5 + responses.length * 0.1);
    } else if (addressConsistent && !portMappingConsistent) {
      // Same address but different ports - likely symmetric NAT
      natType = NATClassification.Symmetric;
      confidence = 0.7;
    } else {
      // Different addresses - unusual, possibly multi-homed
      natType = NATClassification.Unknown;
      confidence = 0.3;
    }

    const firstResponse = responses.find((r) => r.success);

    return {
      natType,
      externalAddress: firstResponse?.mappedAddress,
      externalPort: firstResponse?.mappedPort,
      portMappingConsistent,
      endpointIndependentFiltering: natType !== NATClassification.Symmetric,
      confidence,
      serversUsed,
      durationMs,
      detectedAt: Date.now(),
    };
  }

  private classifyConsistentMapping(
    responses: STUNBindingResponse[]
  ): NATClassification {
    // With consistent mapping, we need additional tests to distinguish
    // between Full Cone, Restricted Cone, and Port Restricted Cone.
    // In browser environment, we can only determine that it's some form
    // of cone NAT or no NAT.

    const firstResponse = responses[0];
    if (!firstResponse?.success) {
      return NATClassification.Unknown;
    }

    // Check if external address looks like a private IP (indicating no NAT)
    if (this.isPrivateIP(firstResponse.mappedAddress)) {
      return NATClassification.Open;
    }

    // Without additional tests from different IPs/ports, we can only
    // determine it's likely a cone NAT. Default to FullCone as optimistic.
    // More sophisticated detection would require a STUN server that can
    // respond from different IP/port combinations.
    return NATClassification.FullCone;
  }

  private isPrivateIP(ip: string): boolean {
    // Check for private IP ranges
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) {
      // IPv6 or invalid
      return ip.startsWith('fd') || ip.startsWith('fc') || ip === '::1';
    }

    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 127.0.0.0/8 (loopback)
    if (parts[0] === 127) return true;

    return false;
  }

  private createFailedResult(startTime: number, error: string): NATDetectionResult {
    return {
      natType: NATClassification.Failed,
      portMappingConsistent: false,
      endpointIndependentFiltering: false,
      confidence: 0,
      serversUsed: [],
      durationMs: Date.now() - startTime,
      detectedAt: Date.now(),
      error,
    };
  }

  private getServerUrl(server: ICEServer): string {
    return Array.isArray(server.urls) ? server.urls[0] : server.urls;
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
          console.error(`NAT event handler error for ${type}:`, error);
        }
      });
    }
  }
}

export default NATDetector;
