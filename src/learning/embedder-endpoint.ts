/**
 * External Embedder Endpoint Client
 *
 * When `embedding.endpoint` is configured (see EmbeddingConfig in
 * real-embeddings.ts), AQE routes feature-extraction to an external embedder
 * service instead of loading its own in-process @huggingface/transformers
 * model. This lets a co-deployed toolchain (e.g. ruflo / ruvector, which
 * embeds with the identical all-MiniLM-L6-v2 stack) share a single warm model
 * rather than every AQE hook process cold-loading its own copy.
 *
 * Endpoint forms:
 *   http(s)://host:port   - POST application/json
 *   unix:/path/to.sock    - one newline-terminated JSON line
 *
 * Wire protocol (identical JSON in both directions):
 *   request : { "texts": string[] }
 *   response: { "embeddings": number[][] }   // mean-pooled, L2-normalized, 384-d
 *
 * The endpoint owns pooling/normalization; AQE only sends raw text.
 */
import net from 'node:net';

/** Feature-extraction tensor output — mirrors the @huggingface/transformers shape. */
export interface EmbeddingOutput {
  data: Float32Array;
  dims?: number[];
}

/** Drop-in replacement for the @huggingface/transformers feature-extraction pipeline. */
export interface FeatureExtractionPipeline {
  (
    input: string | string[],
    options?: { pooling?: string; normalize?: boolean }
  ): Promise<EmbeddingOutput>;
}

const REQUEST_TIMEOUT_MS = 120_000;

interface EmbeddingsReply {
  embeddings?: number[][];
}

async function requestHttp(endpoint: string, texts: string[]): Promise<number[][]> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ texts }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`embedder endpoint returned HTTP ${res.status}`);
  }
  const json = (await res.json()) as EmbeddingsReply;
  if (!Array.isArray(json.embeddings)) {
    throw new Error('embedder endpoint reply missing "embeddings" array');
  }
  return json.embeddings;
}

function requestUnixSocket(socketPath: string, texts: string[]): Promise<number[][]> {
  return new Promise<number[][]>((resolve, reject) => {
    const conn = net.connect(socketPath);
    let buf = '';
    let settled = false;
    const finish = (err: Error | null, value?: number[][]): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      conn.destroy();
      if (err) reject(err);
      else resolve(value as number[][]);
    };
    const timer = setTimeout(
      () => finish(new Error('embedder endpoint timed out')),
      REQUEST_TIMEOUT_MS
    );
    conn.on('connect', () => conn.write(JSON.stringify({ texts }) + '\n'));
    conn.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\n');
      if (nl < 0) return;
      try {
        const json = JSON.parse(buf.slice(0, nl)) as EmbeddingsReply;
        if (!Array.isArray(json.embeddings)) {
          throw new Error('embedder endpoint reply missing "embeddings" array');
        }
        finish(null, json.embeddings);
      } catch (e) {
        finish(e as Error);
      }
    });
    conn.on('error', (e: Error) => finish(e));
  });
}

/** Send texts to the configured endpoint and return their embeddings. */
async function requestEmbeddings(endpoint: string, texts: string[]): Promise<number[][]> {
  if (endpoint.startsWith('unix:')) {
    return requestUnixSocket(endpoint.slice('unix:'.length), texts);
  }
  if (/^https?:\/\//.test(endpoint)) {
    return requestHttp(endpoint, texts);
  }
  throw new Error(
    `unsupported embedder endpoint "${endpoint}" (expected http(s):// or unix:<path>)`
  );
}

/**
 * Build a feature-extraction pipeline backed by an external embedder endpoint.
 * The returned function matches the @huggingface/transformers extractor
 * signature, so it is a drop-in for the in-process model.
 */
export function createEndpointPipeline(endpoint: string): FeatureExtractionPipeline {
  return async (input: string | string[]): Promise<EmbeddingOutput> => {
    const texts = Array.isArray(input) ? input : [input];
    const embeddings = await requestEmbeddings(endpoint, texts);
    if (embeddings.length !== texts.length) {
      throw new Error(
        `embedder endpoint returned ${embeddings.length} embeddings for ${texts.length} texts`
      );
    }
    const dim = embeddings[0]?.length ?? 384;
    const data = new Float32Array(texts.length * dim);
    for (let i = 0; i < texts.length; i++) {
      data.set(embeddings[i], i * dim);
    }
    return { data, dims: [texts.length, dim] };
  };
}
