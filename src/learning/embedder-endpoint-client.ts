/**
 * External Embedder Endpoint Client (ADR-097)
 *
 * OpenAI-compatible `/v1/embeddings` client over HTTP and HTTP-over-Unix-socket.
 * When `EmbeddingConfig.endpoint` is set, AQE skips loading `@huggingface/transformers`
 * entirely and routes feature-extraction through this client.
 *
 * Design choices per ADR-097 (revised after devil's-advocate audit):
 *   - OpenAI wire format with `encoding_format: 'float'` pinned (interop with TEI /
 *     vLLM / llama.cpp / Ollama / LocalAI / LM Studio — float pin avoids the
 *     base64 default some servers ship).
 *   - HTTP + HTTP-over-Unix (one protocol, two transports — no NDJSON fork).
 *   - Hard-fail with circuit breaker on errors (no silent hash fallback).
 *   - L2-renormalize on receive (don't trust server claims).
 *   - Bearer auth from env only; URL userinfo stripped + warned on construct.
 *   - Probe + identity fingerprint required before `embed()`; breaker recovery
 *     invalidates identity so re-probe runs against a fresh endpoint.
 *   - True TCP connect timeout via socket-level setTimeout (not req.setTimeout).
 *   - TLS knobs (ca / cert / key / rejectUnauthorized / servername) for self-hosted.
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
  /** Endpoint URL that produced this fingerprint (redacted — no userinfo) */
  endpoint: string;
}

/** TLS configuration knobs passed through to https.Agent. */
export interface EmbedderTlsOptions {
  /** Trusted CA bundle (PEM) or path-loaded buffer. */
  ca?: string | Buffer | Array<string | Buffer>;
  /** Client cert (PEM). */
  cert?: string | Buffer;
  /** Client key (PEM). */
  key?: string | Buffer;
  /** Default true — set false ONLY for explicit dev/test workflows. */
  rejectUnauthorized?: boolean;
  /** SNI override (e.g. for cert-pinned hosts behind an IP). */
  servername?: string;
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
  /** Connect timeout in ms (default 5000). True TCP connect timeout — not idle. */
  connectTimeoutMs?: number;
  /** Per-request timeout in ms (default 30000). Idle-after-connect. */
  requestTimeoutMs?: number;
  /** Circuit breaker: failures within window before tripping (default 3) */
  failureThreshold?: number;
  /** Circuit breaker: failure window in ms (default 60_000) */
  failureWindowMs?: number;
  /** TLS overrides for https transport. Ignored for http/unix. */
  tlsOptions?: EmbedderTlsOptions;
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
  /** URL with userinfo stripped, safe for logs. */
  safeUrl: string;
}

/**
 * Strip user:password@ from a URL for safe logging.
 * Returns the original string for non-URL inputs (unix paths).
 */
export function redactEndpoint(endpoint: string): string {
  if (endpoint.startsWith('unix:')) return endpoint;
  try {
    const u = new URL(endpoint);
    if (u.username || u.password) {
      u.username = '';
      u.password = '';
      return u.toString().replace(/\/$/, '');
    }
    return endpoint;
  } catch {
    return endpoint;
  }
}

export function parseEndpoint(endpoint: string): ParsedEndpoint {
  if (endpoint.startsWith('unix:')) {
    const socketPath = endpoint.slice('unix:'.length);
    if (!socketPath.startsWith('/')) {
      throw new Error(`unix endpoint must be an absolute path: ${endpoint}`);
    }
    return { transport: 'unix', socketPath, safeUrl: endpoint };
  }
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`unsupported embedder endpoint protocol: ${url.protocol}`);
  }
  const hadUserinfo = Boolean(url.username || url.password);
  if (hadUserinfo) {
    // Warn loudly — userinfo in the URL bypasses the env-only token convention
    // and leaks into Node's default error messages.
    console.warn(
      `[EmbedderEndpointClient] endpoint URL contained userinfo; stripping. ` +
        `Use AQE_EMBEDDER_TOKEN env var for credentials.`
    );
    url.username = '';
    url.password = '';
  }
  return {
    transport: url.protocol === 'https:' ? 'https' : 'http',
    host: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
    protocol: url.protocol,
    safeUrl: url.toString().replace(/\/$/, ''),
  };
}

/**
 * Circuit breaker state.
 *
 * Tracks failure timestamps within `windowMs`. Opens when count reaches `threshold`.
 * While open, every request fast-fails until the window expires. On recovery
 * (window elapses), the breaker calls `onRecover` so the client can invalidate
 * cached endpoint identity — endpoint restarts often coincide with model swaps.
 */
class CircuitBreaker {
  private failures: number[] = [];
  private trippedAt: number | null = null;
  constructor(
    private readonly threshold: number,
    private readonly windowMs: number,
    private readonly onRecover: () => void = () => {}
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
      // Endpoint may have restarted with a different model — force re-probe.
      this.onRecover();
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
  private readonly opts: Required<
    Omit<EmbedderEndpointClientOptions, 'token' | 'tlsOptions'>
  > & {
    token?: string;
    tlsOptions?: EmbedderTlsOptions;
    endpoint: string;
  };
  private cachedIdentity: EndpointIdentity | null = null;
  /** True while a probe is in flight — prevents the embed() lazy-probe race. */
  private probeInFlight: Promise<EndpointIdentity> | null = null;

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
      tlsOptions: options.tlsOptions,
    };
    this.parsed = parseEndpoint(options.endpoint);
    if (this.parsed.transport === 'https') {
      // rejectUnauthorized defaults to true; explicit knobs allow self-hosted CAs.
      const tls = options.tlsOptions ?? {};
      this.agent = new https.Agent({
        keepAlive: true,
        ca: tls.ca,
        cert: tls.cert,
        key: tls.key,
        rejectUnauthorized: tls.rejectUnauthorized !== false,
        servername: tls.servername,
      });
    } else {
      this.agent = new http.Agent({ keepAlive: true });
    }
    this.breaker = new CircuitBreaker(
      this.opts.failureThreshold,
      this.opts.failureWindowMs,
      () => {
        // On breaker recovery, drop identity so the next embed() re-probes.
        // Endpoint restarts (the common cause of recovery) often change models.
        this.cachedIdentity = null;
      }
    );
  }

  /** Public, redacted endpoint URL for logs/metrics. */
  getSafeEndpoint(): string {
    return this.parsed.safeUrl;
  }

  /**
   * Embed an array of texts. Returns L2-normalized vectors in input order.
   *
   * Gated on `probe()` — if no cached identity exists, probe is run first so the
   * dim/identity boundary check fires on every cold path. Concurrent embed calls
   * share a single in-flight probe.
   *
   * Throws on error — callers MUST NOT fall back to hash embeddings, which would
   * poison the HNSW index with non-comparable vectors.
   */
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (this.breaker.isOpen()) {
      throw new Error(
        `[EmbedderEndpointClient] circuit breaker open for ${this.parsed.safeUrl} — fast-failing`
      );
    }
    // Identity gate: every embed call must have a verified identity behind it.
    if (this.cachedIdentity === null) {
      await this.ensureProbed();
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
   * Public so operators can re-probe on demand; idempotent under concurrency.
   */
  async probe(): Promise<EndpointIdentity> {
    if (this.probeInFlight) return this.probeInFlight;
    this.probeInFlight = this.doProbe().finally(() => {
      this.probeInFlight = null;
    });
    return this.probeInFlight;
  }

  private async ensureProbed(): Promise<EndpointIdentity> {
    if (this.cachedIdentity) return this.cachedIdentity;
    return this.probe();
  }

  private async doProbe(): Promise<EndpointIdentity> {
    // Direct HTTP call (NOT via embed()) so we don't recurse on the identity gate.
    let vec: number[];
    try {
      const data = await this.postEmbeddings([CANARY_TEXT]);
      const vectors = this.decodeAndNormalize(data, 1);
      vec = vectors[0];
      this.breaker.recordSuccess();
    } catch (err) {
      this.breaker.recordFailure();
      throw err;
    }
    if (!vec || vec.length !== this.opts.expectedDim) {
      throw new Error(
        `[EmbedderEndpointClient] dim mismatch: expected ${this.opts.expectedDim}, got ${
          vec?.length ?? 0
        } from ${this.parsed.safeUrl}`
      );
    }
    // Fingerprint = SHA-256 of the canary vector's quantized bytes (16 hex chars).
    // Quantize to int16 first so trivial fp noise between identical (model, server)
    // configurations doesn't shift the fingerprint.
    const buf = Buffer.alloc(vec.length * 2);
    for (let i = 0; i < vec.length; i++) {
      const q = Math.max(-32768, Math.min(32767, Math.round(vec[i] * 32767)));
      buf.writeInt16LE(q, i * 2);
    }
    const fingerprint = createHash('sha256').update(buf).digest('hex').slice(0, 16);
    this.cachedIdentity = {
      dim: vec.length,
      fingerprint,
      endpoint: this.parsed.safeUrl,
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
    const rawData = (json as { data: Array<{ embedding?: number[] | string; index?: number }> })
      .data;
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
      // We pinned encoding_format: 'float' in the request, so a base64 string
      // back means the server ignored our request. Fail loud rather than guess.
      if (typeof embedding === 'string') {
        throw new Error(
          `[EmbedderEndpointClient] received base64 embedding at position ${i} — ` +
            `server ignored encoding_format=float. Configure the server to return float arrays.`
        );
      }
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
    // Pin encoding_format=float so providers that default to base64 (newer
    // OpenAI/Azure for dims>100) don't silently return strings we'd have to
    // guess at. The decoder throws loud on string responses.
    const body = JSON.stringify({
      model: this.opts.model,
      input: texts,
      encoding_format: 'float',
    });
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

    const safeUrl = this.parsed.safeUrl;
    const connectTimeoutMs = this.opts.connectTimeoutMs;
    const requestTimeoutMs = this.opts.requestTimeoutMs;

    return new Promise<unknown>((resolve, reject) => {
      let settled = false;
      const safeResolve = (val: unknown) => {
        if (settled) return;
        settled = true;
        resolve(val);
      };
      const safeReject = (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      const req = requestFn(reqOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            safeReject(
              new Error(
                `[EmbedderEndpointClient] HTTP ${res.statusCode} from ${safeUrl}: ${text.slice(0, 200)}`
              )
            );
            return;
          }
          try {
            const parsed = JSON.parse(text);
            safeResolve(parsed);
          } catch (err) {
            safeReject(
              new Error(
                `[EmbedderEndpointClient] invalid JSON from ${safeUrl}: ${(err as Error).message}`
              )
            );
          }
        });
        res.on('error', (err) => safeReject(err));
      });

      // True TCP connect timeout: set on the socket itself, fires before any byte
      // is exchanged. req.setTimeout is an idle-after-write timeout — wrong tool
      // for SYN-drop scenarios. Once connected we clear it and let
      // requestTimeoutMs guard the request/response phase.
      req.on('socket', (socket) => {
        // Pre-connect phase: any idle period this long means the SYN handshake
        // is stuck (DNS, ACL drop, blackhole).
        socket.setTimeout(connectTimeoutMs);
        const onConnect = () => {
          // Switch to the post-connect (read/write idle) timeout budget.
          socket.setTimeout(requestTimeoutMs);
        };
        // For brand-new sockets we wait for 'connect'. Pooled (keep-alive)
        // sockets fire 'connect' synchronously already-connected or not at all —
        // for those, jump straight to the request timeout.
        if (socket.connecting) {
          socket.once('connect', onConnect);
        } else {
          onConnect();
        }
        socket.on('timeout', () => {
          // Distinguish phase for the error message.
          const phase = socket.connecting ? 'connect' : 'request';
          const limit = socket.connecting ? connectTimeoutMs : requestTimeoutMs;
          const err = new Error(`[EmbedderEndpointClient] ${phase} timeout after ${limit}ms`);
          // Reject FIRST, then destroy. If we destroy first, the 'error' event
          // races us and we might lose the timeout-specific message.
          safeReject(err);
          req.destroy(err);
        });
      });

      req.on('error', (err) => safeReject(err));
      req.write(body);
      req.end();
    });
  }
}
