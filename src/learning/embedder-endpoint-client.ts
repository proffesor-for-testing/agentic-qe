/**
 * External Embedder Endpoint Client (ADR-097)
 *
 * OpenAI-compatible `/v1/embeddings` client over HTTP and HTTP-over-Unix-socket.
 * When `EmbeddingConfig.endpoint` is set, AQE skips loading `@huggingface/transformers`
 * entirely and routes feature-extraction through this client.
 *
 * Design choices per ADR-097:
 *   - OpenAI wire format (interop with TEI / vLLM / llama.cpp / Ollama / LocalAI / LM Studio)
 *   - HTTP + HTTP-over-Unix (one protocol, two transports — no NDJSON fork)
 *   - Hard-fail with circuit breaker on errors (no silent hash fallback)
 *   - L2-renormalize on receive (don't trust server claims)
 *   - Bearer auth from env only
 *   - Probe + identity fingerprint catches dim / model drift at the boundary
 */

import * as http from 'node:http';
import * as https from 'node:https';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import { normalize as l2Normalize } from '../shared/utils/vector-math.js';

/**
 * Endpoint identity fingerprint — a SHA-256 of the L2-normalized canary embedding,
 * truncated to the first 16 hex chars. Stable for a given (model, quantization, server)
 * tuple. Changes signal a configuration drift the operator must investigate.
 */
export interface EndpointIdentity {
  /** Embedding dimension reported by the endpoint */
  dim: number;
  /** Stable fingerprint of the canary embedding (model + quantization signature) */
  fingerprint: string;
  /** Endpoint URL that produced this fingerprint */
  endpoint: string;
}

export interface EmbedderEndpointClientOptions {
  /** Endpoint URL: http(s)://host:port or unix:/path/to.sock */
  endpoint: string;
  /** Bearer token for Authorization header (typically from AQE_EMBEDDER_TOKEN env) */
  token?: string;
  /** Model identifier sent in the OpenAI request body */
  model?: string;
  /** Expected embedding dimension; probe fails if mismatched */
  expectedDim?: number;
  /** Connect timeout in ms (default 5000) */
  connectTimeoutMs?: number;
  /** Per-request timeout in ms (default 30000) */
  requestTimeoutMs?: number;
  /** Circuit breaker: failures within window before tripping (default 3) */
  failureThreshold?: number;
  /** Circuit breaker: failure window in ms (default 60_000) */
  failureWindowMs?: number;
}

const DEFAULT_OPTIONS = {
  model: 'Xenova/all-MiniLM-L6-v2',
  expectedDim: 384,
  connectTimeoutMs: 5_000,
  requestTimeoutMs: 30_000,
  failureThreshold: 3,
  failureWindowMs: 60_000,
} as const;

const CANARY_TEXT = 'AQE embedder endpoint identity canary v1';
const EMBEDDINGS_PATH = '/v1/embeddings';

/**
 * Parsed endpoint — either an HTTP(S) URL or a Unix socket path.
 */
interface ParsedEndpoint {
  transport: 'http' | 'https' | 'unix';
  socketPath?: string;
  host?: string;
  port?: number;
  protocol?: 'http:' | 'https:';
}

export function parseEndpoint(endpoint: string): ParsedEndpoint {
  if (endpoint.startsWith('unix:')) {
    const socketPath = endpoint.slice('unix:'.length);
    if (!socketPath.startsWith('/')) {
      throw new Error(`unix endpoint must be an absolute path: ${endpoint}`);
    }
    return { transport: 'unix', socketPath };
  }
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`unsupported embedder endpoint protocol: ${url.protocol}`);
  }
  return {
    transport: url.protocol === 'https:' ? 'https' : 'http',
    host: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
    protocol: url.protocol,
  };
}

/**
 * Circuit breaker state.
 *
 * Tracks failure timestamps within `windowMs`. Opens when count reaches `threshold`.
 * While open, every request fast-fails until the window expires (no half-open probe yet —
 * the next successful manual call after the window clears resets the breaker).
 */
class CircuitBreaker {
  private failures: number[] = [];
  private trippedAt: number | null = null;
  constructor(
    private readonly threshold: number,
    private readonly windowMs: number
  ) {}

  recordSuccess(): void {
    this.failures = [];
    this.trippedAt = null;
  }

  recordFailure(): void {
    const now = Date.now();
    this.failures = this.failures.filter((t) => now - t < this.windowMs);
    this.failures.push(now);
    if (this.failures.length >= this.threshold) {
      this.trippedAt = now;
    }
  }

  isOpen(): boolean {
    if (this.trippedAt === null) return false;
    if (Date.now() - this.trippedAt >= this.windowMs) {
      this.failures = [];
      this.trippedAt = null;
      return false;
    }
    return true;
  }

  /** For tests / observability */
  getState(): { open: boolean; failures: number; trippedAt: number | null } {
    return { open: this.isOpen(), failures: this.failures.length, trippedAt: this.trippedAt };
  }
}

/**
 * OpenAI-compatible embeddings client with keep-alive, circuit breaker, and identity probe.
 */
export class EmbedderEndpointClient {
  private readonly parsed: ParsedEndpoint;
  private readonly agent: http.Agent | https.Agent;
  private readonly breaker: CircuitBreaker;
  private readonly opts: Required<Omit<EmbedderEndpointClientOptions, 'token'>> & {
    token?: string;
    endpoint: string;
  };
  private cachedIdentity: EndpointIdentity | null = null;

  constructor(options: EmbedderEndpointClientOptions) {
    this.opts = {
      endpoint: options.endpoint,
      token: options.token,
      model: options.model ?? DEFAULT_OPTIONS.model,
      expectedDim: options.expectedDim ?? DEFAULT_OPTIONS.expectedDim,
      connectTimeoutMs: options.connectTimeoutMs ?? DEFAULT_OPTIONS.connectTimeoutMs,
      requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_OPTIONS.requestTimeoutMs,
      failureThreshold: options.failureThreshold ?? DEFAULT_OPTIONS.failureThreshold,
      failureWindowMs: options.failureWindowMs ?? DEFAULT_OPTIONS.failureWindowMs,
    };
    this.parsed = parseEndpoint(options.endpoint);
    this.agent =
      this.parsed.transport === 'https'
        ? new https.Agent({ keepAlive: true })
        : new http.Agent({ keepAlive: true });
    this.breaker = new CircuitBreaker(this.opts.failureThreshold, this.opts.failureWindowMs);
  }

  /**
   * Embed an array of texts. Returns L2-normalized vectors in input order.
   * Throws on error — callers should not silently swallow failures here.
   */
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (this.breaker.isOpen()) {
      throw new Error(
        `[EmbedderEndpointClient] circuit breaker open for ${this.opts.endpoint} — fast-failing`
      );
    }
    try {
      const data = await this.postEmbeddings(texts);
      const vectors = this.decodeAndNormalize(data, texts.length);
      this.breaker.recordSuccess();
      return vectors;
    } catch (err) {
      this.breaker.recordFailure();
      throw err;
    }
  }

  /**
   * Probe the endpoint by embedding a fixed canary. Returns identity fingerprint.
   * Asserts dim === expectedDim. Throws loud on mismatch.
   */
  async probe(): Promise<EndpointIdentity> {
    const [vec] = await this.embed([CANARY_TEXT]);
    if (!vec || vec.length !== this.opts.expectedDim) {
      throw new Error(
        `[EmbedderEndpointClient] dim mismatch: expected ${this.opts.expectedDim}, got ${vec?.length ?? 0} from ${this.opts.endpoint}`
      );
    }
    // Fingerprint = SHA-256 of the canary vector's quantized bytes (16 hex chars).
    // We quantize to int16 before hashing so trivial floating-point noise between
    // identical model+server configurations doesn't change the fingerprint.
    const buf = Buffer.alloc(vec.length * 2);
    for (let i = 0; i < vec.length; i++) {
      const q = Math.max(-32768, Math.min(32767, Math.round(vec[i] * 32767)));
      buf.writeInt16LE(q, i * 2);
    }
    const fingerprint = createHash('sha256').update(buf).digest('hex').slice(0, 16);
    this.cachedIdentity = {
      dim: vec.length,
      fingerprint,
      endpoint: this.opts.endpoint,
    };
    return this.cachedIdentity;
  }

  getCachedIdentity(): EndpointIdentity | null {
    return this.cachedIdentity;
  }

  getBreakerState(): { open: boolean; failures: number; trippedAt: number | null } {
    return this.breaker.getState();
  }

  /**
   * Close the underlying keep-alive agent. Tests should call this in afterEach.
   */
  close(): void {
    this.agent.destroy();
  }

  private decodeAndNormalize(json: unknown, expectedCount: number): number[][] {
    // OpenAI shape: { data: [{ embedding: [...], index: 0 }, ...] }
    if (
      !json ||
      typeof json !== 'object' ||
      !Array.isArray((json as { data?: unknown }).data)
    ) {
      throw new Error(`[EmbedderEndpointClient] response missing data array`);
    }
    const rawData = (json as { data: Array<{ embedding?: number[]; index?: number }> }).data;
    if (rawData.length !== expectedCount) {
      throw new Error(
        `[EmbedderEndpointClient] response count mismatch: expected ${expectedCount}, got ${rawData.length}`
      );
    }
    // OpenAI guarantees `index` field but ordering is not guaranteed — sort defensively.
    // Fall back to array position when index is absent.
    const indexed = rawData.map((item, i) => ({
      idx: typeof item.index === 'number' ? item.index : i,
      embedding: item.embedding,
    }));
    indexed.sort((a, b) => a.idx - b.idx);
    return indexed.map(({ embedding }, i) => {
      if (!Array.isArray(embedding)) {
        throw new Error(`[EmbedderEndpointClient] missing embedding at position ${i}`);
      }
      if (embedding.length !== this.opts.expectedDim) {
        throw new Error(
          `[EmbedderEndpointClient] dim mismatch at position ${i}: expected ${this.opts.expectedDim}, got ${embedding.length}`
        );
      }
      // Re-normalize regardless of server claim — cheap and correct.
      return l2Normalize(embedding);
    });
  }

  private postEmbeddings(texts: string[]): Promise<unknown> {
    const body = JSON.stringify({ model: this.opts.model, input: texts });
    return this.request(EMBEDDINGS_PATH, body);
  }

  private request(path: string, body: string): Promise<unknown> {
    const headers: http.OutgoingHttpHeaders = {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
      accept: 'application/json',
    };
    if (this.opts.token) {
      headers['authorization'] = `Bearer ${this.opts.token}`;
    }

    const baseOptions: http.RequestOptions = {
      method: 'POST',
      path,
      headers,
      agent: this.agent,
      timeout: this.opts.connectTimeoutMs,
    };

    let reqOptions: http.RequestOptions;
    let requestFn: typeof http.request;
    if (this.parsed.transport === 'unix') {
      reqOptions = { ...baseOptions, socketPath: this.parsed.socketPath };
      requestFn = http.request;
    } else {
      reqOptions = {
        ...baseOptions,
        host: this.parsed.host,
        port: this.parsed.port,
        protocol: this.parsed.protocol,
      };
      requestFn = this.parsed.transport === 'https' ? https.request : http.request;
    }

    return new Promise<unknown>((resolve, reject) => {
      const req = requestFn(reqOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(
              new Error(
                `[EmbedderEndpointClient] HTTP ${res.statusCode} from ${this.opts.endpoint}: ${text.slice(0, 200)}`
              )
            );
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch (err) {
            reject(
              new Error(
                `[EmbedderEndpointClient] invalid JSON from ${this.opts.endpoint}: ${(err as Error).message}`
              )
            );
          }
        });
        res.on('error', (err) => reject(err));
        // Request-level (post-connect) timeout
        res.setTimeout(this.opts.requestTimeoutMs, () => {
          req.destroy(
            new Error(
              `[EmbedderEndpointClient] response timeout after ${this.opts.requestTimeoutMs}ms`
            )
          );
        });
      });
      // Connect-level timeout
      req.setTimeout(this.opts.connectTimeoutMs, () => {
        req.destroy(
          new Error(
            `[EmbedderEndpointClient] connect timeout after ${this.opts.connectTimeoutMs}ms`
          )
        );
      });
      req.on('error', (err) => reject(err));
      req.write(body);
      req.end();
    });
  }
}
