/**
 * Single source of truth for resolving the local Ollama base URL.
 *
 * Precedence: AQE_OLLAMA_URL (project-namespaced) → OLLAMA_URL (generic) → the
 * call-site's own default. Trailing slashes are stripped. This lets a user
 * point every AQE local-model client (chat provider, consensus provider, local
 * judge, embeddings, free-tier) at a non-localhost Ollama — a Docker host
 * gateway (host.docker.internal), a remote GPU box — with ONE env var, while
 * changing nothing when the vars are unset (each call-site keeps its own
 * default via the `fallback` argument).
 *
 * The `env` parameter is injectable so resolution stays unit-testable without
 * mutating process.env.
 */
export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

export function resolveOllamaBaseUrl(
  fallback: string = DEFAULT_OLLAMA_BASE_URL,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env['AQE_OLLAMA_URL'] ?? env['OLLAMA_URL'] ?? fallback;
  return raw.replace(/\/+$/, '');
}
