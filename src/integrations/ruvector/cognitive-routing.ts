/**
 * R13: Cognitive Routing — Predictive Coding for Agent Communication
 *
 * Bandwidth reduction via sliding-window prediction + delta-only transmission.
 * Oscillatory routing multiplexes concurrent message streams round-robin.
 * TypeScript-only; no external dependencies.
 *
 * @module integrations/ruvector/cognitive-routing
 */
import { getRuVectorFeatureFlags } from './feature-flags.js';

export interface CognitiveRoutingConfig {
  predictionWindowSize: number;   // default: 10
  compressionThreshold: number;   // default: 0.3
  maxConcurrentStreams: number;    // default: 8
  oscillationFrequencyMs: number; // default: 100
}

export interface RoutedMessage {
  streamId: string;
  senderId: string;
  receiverId: string;
  payload: unknown;
  compressed: boolean;
  originalSize: number;
  compressedSize: number;
  timestamp: number;
}

export interface RoutingStats {
  totalMessages: number;
  compressedMessages: number;
  bandwidthSavedBytes: number;
  bandwidthReductionPercent: number;
  activeStreams: number;
}

const DEFAULT_CONFIG: CognitiveRoutingConfig = {
  predictionWindowSize: 10, compressionThreshold: 0.3,
  maxConcurrentStreams: 8, oscillationFrequencyMs: 100,
};

function estimateSize(value: unknown): number {
  try { return JSON.stringify(value).length; } catch { return 0; }
}

function computeDelta(
  predicted: Record<string, unknown>,
  actual: Record<string, unknown>,
): Record<string, unknown> | null {
  const delta: Record<string, unknown> = {};
  let hasChanges = false;
  for (const key of Object.keys(actual)) {
    if (JSON.stringify(predicted[key]) !== JSON.stringify(actual[key])) {
      delta[key] = actual[key]; hasChanges = true;
    }
  }
  for (const key of Object.keys(predicted)) {
    if (!(key in actual)) { delta[key] = undefined; hasChanges = true; }
  }
  return hasChanges ? delta : null;
}

function applyDelta(
  predicted: Record<string, unknown>, delta: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...predicted };
  for (const [key, value] of Object.entries(delta)) {
    if (value === undefined) delete result[key]; else result[key] = value;
  }
  return result;
}

/** Sliding-window predictor: predicts next payload as copy of last seen. */
export class MessagePredictor {
  private readonly windowSize: number;
  private readonly windows: Map<string, unknown[]> = new Map();

  constructor(windowSize: number) { this.windowSize = Math.max(1, windowSize); }

  predict(streamId: string): Record<string, unknown> | null {
    const w = this.windows.get(streamId);
    if (!w || w.length === 0) return null;
    const last = w[w.length - 1];
    if (typeof last !== 'object' || last === null || Array.isArray(last)) return null;
    return { ...(last as Record<string, unknown>) };
  }

  record(streamId: string, payload: unknown): void {
    let w = this.windows.get(streamId);
    if (!w) { w = []; this.windows.set(streamId, w); }
    w.push(payload);
    if (w.length > this.windowSize) w.shift();
  }

  removeStream(streamId: string): void { this.windows.delete(streamId); }
}

/** Round-robin multiplexer for concurrent message streams. */
export class OscillatoryRouter {
  private readonly maxStreams: number;
  readonly cycleMs: number;
  private readonly streamIds: string[] = [];
  private currentIndex = 0;

  constructor(maxStreams: number, cycleMs: number) {
    this.maxStreams = Math.max(1, maxStreams);
    this.cycleMs = Math.max(1, cycleMs);
  }

  addStream(streamId: string): boolean {
    if (this.streamIds.includes(streamId) || this.streamIds.length >= this.maxStreams) return false;
    this.streamIds.push(streamId);
    return true;
  }

  removeStream(streamId: string): boolean {
    const idx = this.streamIds.indexOf(streamId);
    if (idx === -1) return false;
    this.streamIds.splice(idx, 1);
    if (this.currentIndex >= this.streamIds.length) this.currentIndex = 0;
    return true;
  }

  nextStream(): string | null {
    if (this.streamIds.length === 0) return null;
    const s = this.streamIds[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.streamIds.length;
    return s;
  }

  getActiveStreams(): string[] { return [...this.streamIds]; }
  get activeCount(): number { return this.streamIds.length; }
}

/** Combines MessagePredictor + OscillatoryRouter for bandwidth-efficient routing. */
export class CognitiveRouter {
  private readonly config: CognitiveRoutingConfig;
  private readonly predictor: MessagePredictor;
  private readonly router: OscillatoryRouter;
  private readonly lastPayloads: Map<string, unknown> = new Map();
  private totalMessages = 0;
  private compressedMessages = 0;
  private totalOriginalBytes = 0;
  private totalCompressedBytes = 0;

  constructor(config?: Partial<CognitiveRoutingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.predictor = new MessagePredictor(this.config.predictionWindowSize);
    this.router = new OscillatoryRouter(this.config.maxConcurrentStreams, this.config.oscillationFrequencyMs);
  }

  send(streamId: string, senderId: string, receiverId: string, payload: unknown): RoutedMessage {
    this.totalMessages++;
    const originalSize = estimateSize(payload);
    this.totalOriginalBytes += originalSize;
    let compressed = false;
    let transmittedPayload: unknown = payload;
    let compressedSize = originalSize;

    if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
      const prediction = this.predictor.predict(streamId);
      if (prediction) {
        const delta = computeDelta(prediction, payload as Record<string, unknown>);
        if (delta) {
          const deltaSize = estimateSize(delta);
          if (1 - deltaSize / Math.max(originalSize, 1) >= this.config.compressionThreshold) {
            transmittedPayload = { __delta: true, __changes: delta };
            compressedSize = estimateSize(transmittedPayload);
            compressed = true;
            this.compressedMessages++;
          }
        } else {
          transmittedPayload = { __delta: true, __changes: {} };
          compressedSize = estimateSize(transmittedPayload);
          compressed = true;
          this.compressedMessages++;
        }
      }
    }
    this.totalCompressedBytes += compressedSize;
    this.predictor.record(streamId, payload);
    this.lastPayloads.set(streamId, payload);

    return { streamId, senderId, receiverId, payload: transmittedPayload,
      compressed, originalSize, compressedSize, timestamp: Date.now() };
  }

  receive(message: RoutedMessage): unknown {
    if (!message.compressed || typeof message.payload !== 'object' || message.payload === null) {
      this.lastPayloads.set(message.streamId, message.payload);
      this.predictor.record(message.streamId, message.payload);
      return message.payload;
    }
    const envelope = message.payload as Record<string, unknown>;
    if (!envelope.__delta) {
      this.lastPayloads.set(message.streamId, message.payload);
      this.predictor.record(message.streamId, message.payload);
      return message.payload;
    }
    const prediction = this.predictor.predict(message.streamId);
    const changes = (envelope.__changes ?? {}) as Record<string, unknown>;
    if (!prediction) return changes;
    const reconstructed = applyDelta(prediction, changes);
    this.predictor.record(message.streamId, reconstructed);
    this.lastPayloads.set(message.streamId, reconstructed);
    return reconstructed;
  }

  getStats(): RoutingStats {
    const saved = this.totalOriginalBytes - this.totalCompressedBytes;
    return {
      totalMessages: this.totalMessages, compressedMessages: this.compressedMessages,
      bandwidthSavedBytes: Math.max(0, saved),
      bandwidthReductionPercent: this.totalOriginalBytes > 0
        ? (Math.max(0, saved) / this.totalOriginalBytes) * 100 : 0,
      activeStreams: this.router.activeCount,
    };
  }

  addStream(streamId: string): void { this.router.addStream(streamId); }

  removeStream(streamId: string): void {
    this.router.removeStream(streamId);
    this.predictor.removeStream(streamId);
    this.lastPayloads.delete(streamId);
  }
}

/** Create a CognitiveRouter if the feature flag is enabled, otherwise null. */
export function createCognitiveRouter(
  config?: Partial<CognitiveRoutingConfig>,
): CognitiveRouter | null {
  if (!isCognitiveRoutingEnabled()) return null;
  return new CognitiveRouter(config);
}

/** Check if Cognitive Routing feature flag is enabled. */
export function isCognitiveRoutingEnabled(): boolean {
  return getRuVectorFeatureFlags().useCognitiveRouting;
}
