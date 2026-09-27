/**
 * Agentic QE v3 - Cyber Verification Pin
 * ADR-093: Opus 4.7 Migration
 *
 * Security and pentest agents may trip the real-time cybersecurity
 * safeguards that ship with Opus 4.7 and later Opus/Fable-class models until
 * the organization is enrolled in Anthropic's Cyber Verification Program.
 * This module pins those agents to a fallback model until
 * `AQE_CYBER_VERIFIED=true`.
 *
 * Applied in BOTH:
 *   - HybridRouter.chat() — catches direct routing calls
 *   - MultiModelExecutor.consult() — catches advisor escalations
 *
 * HybridRouter also re-pins its fallback candidates (default model and
 * fallback chain), so a failed primary cannot escalate a pinned agent. Scope:
 * the pin covers the Opus/Fable-class models that ship these safeguards; it
 * does NOT restrict ordinary Sonnet routing (security tasks may route to the
 * default Sonnet).

 *
 * 2026-09 model refresh: the gate was generalized from Opus 4.7 only to every
 * Opus/Fable model at or above 4.7, including the Claude Code aliases
 * `opus` / `fable` (see {@link isCyberGatedModel}). Routing tier 4 and the
 * default advisor now target Opus 5.5; matching 4.7 alone would have left the
 * pin unreachable.
 */


/**
 * Agent names subject to the cyber pin. These are the agents covered by
 * the Cyber Verification Program application at
 * docs/security/cyber-verification-application.md §3.
 *
 * KEEP IN SYNC with the application file. A cross-check test in
 * tests/routing/security/cyber-pin.test.ts enforces the match.
 */
export const CYBER_PINNED_AGENTS: readonly string[] = [
  'qe-pentest-validator',
  'qe-security-auditor',
  'qe-security-scanner',
  'qe-security-reviewer',
] as const;

/**
 * Fallback model for pinned requests. Deliberately Sonnet 4.6 — the model
 * docs/security/cyber-verification-application.md names for security agents —
 * rather than DEFAULT_SONNET_MODEL, so the pin's target stays the documented,
 * reviewed model across default bumps. (Claude Code maps model IDs to its
 * `sonnet` alias, so on that provider the fallback runs on the CLI's Sonnet.)
 * Sonnet 4.6 is served until at least 2027-02-17.
 */
const CYBER_PIN_SONNET = 'claude-sonnet-4-6';

/**
 * Fallback advisor model for cyber-pinned agents, in OpenRouter form.
 * Used by MultiModelExecutor.consult.
 */
export const CYBER_PIN_ADVISOR_FALLBACK = `anthropic/${CYBER_PIN_SONNET.replace('4-6', '4.6')}`;

/**
 * Fallback chat model for cyber-pinned agents when targeting the Anthropic
 * provider directly. Used by HybridRouter.chat.
 */
export const CYBER_PIN_CHAT_FALLBACK = CYBER_PIN_SONNET;

/**
 * Family + version in any known ID form: canonical (claude-opus-5-5),
 * OpenRouter (anthropic/claude-opus-5.5), Bedrock (anthropic.claude-opus-4-7-v1:0)
 * and dated snapshots (claude-opus-4-5-20251101). The minor version is at most
 * two digits so a date suffix (claude-opus-4-20250514) is not read as one.
 */
const CLI_GATED_ALIASES: ReadonlySet<string> = new Set(['opus', 'fable']);

const OPUS_FABLE_ID = /claude-(opus|fable)-(\d+)(?:[-.](\d{1,2})(?!\d))?/;

/** First Opus/Fable version that ships the cyber safeguards. */
const CYBER_GATE_MIN = { major: 4, minor: 7 } as const;

/**
 * Returns true if the model ID is an Opus- or Fable-class model at or above
 * 4.7 (claude-opus-4-7, claude-opus-4-8, claude-opus-5, claude-opus-5-5,
 * claude-fable-5, claude-fable-5-1, …) in canonical, OpenRouter or Bedrock
 * form. Sonnet, Haiku and Opus below 4.7 are not gated.
 */
export function isCyberGatedModel(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  // Claude Code CLI aliases resolve to the latest Opus/Fable (>= 4.7).
  if (CLI_GATED_ALIASES.has(id)) return true;
  const match = OPUS_FABLE_ID.exec(id);
  if (!match) return false;
  const major = Number(match[2]);
  const minor = match[3] === undefined ? 0 : Number(match[3]);
  return (
    major > CYBER_GATE_MIN.major ||
    (major === CYBER_GATE_MIN.major && minor >= CYBER_GATE_MIN.minor)
  );
}

/**
 * @deprecated Use {@link isCyberGatedModel}. Kept as an alias for existing
 * callers; it matches every cyber-gated model, not only Opus 4.7.
 */
export const isOpus47 = isCyberGatedModel;

/**
 * Returns true if the agent is cyber-pinned and env does not grant
 * Cyber Verification bypass. Case-sensitive "true" only — '1', 'yes',
 * etc. do not lift the pin.
 */
export function shouldCyberPin(
  agentName: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.AQE_CYBER_VERIFIED === 'true') return false;
  return CYBER_PINNED_AGENTS.includes(agentName);
}

/**
 * Resolve the model to actually use after applying the cyber pin.
 *
 * @param agentName - Agent identifier (e.g. 'qe-security-auditor').
 * @param requestedModel - The model the caller wanted.
 * @param fallback - Model to use if pin fires.
 * @param env - Process env (injectable for tests).
 * @returns `requestedModel` unchanged if pin does not apply,
 *          or `fallback` if pin fires.
 */
export function applyCyberPin(
  agentName: string,
  requestedModel: string,
  fallback: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!shouldCyberPin(agentName, env)) return requestedModel;
  if (!isCyberGatedModel(requestedModel)) return requestedModel;
  return fallback;
}

/**
 * The pinned Sonnet 4.6 fallback in the model-ID form a given provider
 * expects, so a pinned request stays routable (OpenRouter needs the dotted
 * `anthropic/…` slug, Bedrock the `anthropic.…-v1:0` form).
 */
export function cyberPinFallbackFor(provider: string): string {
  switch (provider) {
    case 'openrouter':
      return CYBER_PIN_ADVISOR_FALLBACK;
    case 'bedrock':
      return 'anthropic.claude-sonnet-4-6-v1:0';
    default:
      return CYBER_PIN_CHAT_FALLBACK;
  }
}
