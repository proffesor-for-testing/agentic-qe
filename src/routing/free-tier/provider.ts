/**
 * Free-tier provider resolver + OpenAI-compatible chat (D7).
 *
 * Pure resolution (presets + env key) is split from the network call so the
 * config logic is unit-testable without a server. The chat call targets the
 * universal `/v1/chat/completions` shape (verified live against the M5 host
 * Ollama on 2026-06-19) and is reasoning-model aware.
 */

import type {
  FreeTierKind,
  FreeTierProviderConfig,
  ResolvedFreeTierProvider,
} from './types.js';
import { resolveOllamaBaseUrl } from '../../shared/llm/ollama-url.js';

interface Preset {
  baseUrl: string;
  apiKeyEnv?: string;
  /** True when this endpoint normally requires a key (→ missingKey flag). */
  requiresKey: boolean;
}

/**
 * Endpoint presets. `local-ollama` defaults to the Docker-Desktop host gateway
 * (the M5 host) — override baseUrl to 'http://localhost:11434/v1' for a same-box
 * Ollama. `openai-compatible` has no default URL (the caller must supply one).
 */
export const FREE_TIER_PRESETS: Record<FreeTierKind, Preset> = {
  'local-ollama': { baseUrl: 'http://host.docker.internal:11434/v1', requiresKey: false },
  'cloud-ollama': { baseUrl: 'https://ollama.com/v1', apiKeyEnv: 'OLLAMA_API_KEY', requiresKey: true },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiKeyEnv: 'OPENROUTER_API_KEY', requiresKey: true },
  'openai-compatible': { baseUrl: '', requiresKey: false },
};

/**
 * Merge a config with its preset, read the API key from the named env var, and
 * produce a ready-to-call provider. Pure except for the single `process.env`
 * read (injectable via `env` for testing). Throws only on a structural error
 * (openai-compatible without a baseUrl); a missing key is flagged, not thrown,
 * so the caller can decide (some local endpoints accept any/no key).
 */
export function resolveFreeTierProvider(
  cfg: FreeTierProviderConfig,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedFreeTierProvider {
  const preset = FREE_TIER_PRESETS[cfg.kind];
  if (!preset) throw new Error(`free-tier: unknown provider kind "${cfg.kind}"`);

  // For the local Ollama preset, honour AQE_OLLAMA_URL / OLLAMA_URL (keeping the
  // host.docker.internal default + the /v1 OpenAI-compat suffix) so the free
  // tier follows the same single knob as every other local client. An explicit
  // cfg.baseUrl still wins.
  const presetBaseUrl =
    cfg.kind === 'local-ollama' && !cfg.baseUrl
      ? `${resolveOllamaBaseUrl('http://host.docker.internal:11434', env)}/v1`
      : preset.baseUrl;
  const baseUrl = (cfg.baseUrl ?? presetBaseUrl).replace(/\/$/, '');
  if (!baseUrl) {
    throw new Error(`free-tier: kind "${cfg.kind}" requires an explicit baseUrl`);
  }

  const keyEnvName = cfg.apiKeyEnv ?? preset.apiKeyEnv;
  const apiKey = keyEnvName ? (env[keyEnvName] ?? '').trim() : '';

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  // OpenRouter etiquette headers (harmless elsewhere).
  if (cfg.kind === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/proffesor-for-testing/agentic-qe';
    headers['X-Title'] = 'agentic-qe';
  }

  return {
    kind: cfg.kind,
    model: cfg.model,
    baseUrl,
    headers,
    timeoutMs: cfg.timeoutMs ?? 120_000,
    maxTokens: cfg.maxTokens ?? 2048,
    temperature: cfg.temperature ?? 0.2,
    contentOnly: cfg.contentOnly ?? true,
    missingKey: preset.requiresKey && !apiKey,
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface FreeTierChatResult {
  ok: boolean;
  /** Assistant text (answer channel only when contentOnly). Empty on failure. */
  content: string;
  /** Reasoning channel, when the model exposes one separately. */
  reasoning?: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  error?: string;
  latencyMs: number;
}

/**
 * One OpenAI-compatible chat completion. Never throws — a transport/timeout/HTTP
 * error returns `{ ok:false, error }` so an escalation loop treats it as a tier
 * failure (and escalates) rather than crashing.
 */
export async function freeTierChat(
  provider: ResolvedFreeTierProvider,
  messages: ChatMessage[],
): Promise<FreeTierChatResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), provider.timeoutMs);
  try {
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: provider.headers,
      body: JSON.stringify({
        model: provider.model,
        messages,
        max_tokens: provider.maxTokens,
        temperature: provider.temperature,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, content: '', error: `HTTP ${res.status}: ${body.slice(0, 200)}`, latencyMs: Date.now() - started };
    }
    const j = (await res.json()) as {
      choices?: Array<{ message?: { content?: string; reasoning?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const msg = j.choices?.[0]?.message;
    const content = (msg?.content ?? '').trim();
    const reasoning = msg?.reasoning?.trim();
    const text = provider.contentOnly || !reasoning ? content : `${reasoning}\n${content}`.trim();
    return {
      ok: text.length > 0,
      content: text,
      reasoning,
      usage: j.usage
        ? { promptTokens: j.usage.prompt_tokens, completionTokens: j.usage.completion_tokens, totalTokens: j.usage.total_tokens }
        : undefined,
      error: text.length === 0 ? 'empty content' : undefined,
      latencyMs: Date.now() - started,
    };
  } catch (e) {
    return { ok: false, content: '', error: (e as Error).message, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/** Cheap liveness probe for a free-tier endpoint (Ollama /api/tags style or a tiny chat). */
export async function freeTierHealth(provider: ResolvedFreeTierProvider): Promise<boolean> {
  const r = await freeTierChat(provider, [{ role: 'user', content: 'ping' }]);
  // A transport success (ok OR an "empty content" non-error reply) counts as alive.
  return r.ok || r.error === 'empty content';
}
