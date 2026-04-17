/**
 * Agentic QE v3 - Cyber Verification Pin
 * ADR-093: Opus 4.7 Migration
 *
 * Security and pentest agents may trip Opus 4.7's real-time cybersecurity
 * safeguards until the organization is enrolled in Anthropic's Cyber
 * Verification Program. This module pins those agents to a fallback model
 * until `AQE_CYBER_VERIFIED=true`.
 *
 * Applied in BOTH:
 *   - HybridRouter.chat() — catches direct routing calls
 *   - MultiModelExecutor.consult() — catches advisor escalations
 *
 * so security agents cannot reach 4.7 by any code path until verified.
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
 * Fallback advisor model for cyber-pinned agents. Sonnet 4.6 on OpenRouter.
 * Used by MultiModelExecutor.consult.
 */
export const CYBER_PIN_ADVISOR_FALLBACK = 'anthropic/claude-sonnet-4.6';

/**
 * Fallback chat model for cyber-pinned agents when targeting the Anthropic
 * provider directly. Used by HybridRouter.chat.
 */
export const CYBER_PIN_CHAT_FALLBACK = 'claude-sonnet-4-6';

/**
 * Returns true if the model ID targets Opus 4.7 in any known form:
 * canonical (claude-opus-4-7), OpenRouter (anthropic/claude-opus-4.7),
 * or Bedrock (anthropic.claude-opus-4-7-v1:0).
 */
export function isOpus47(modelId: string): boolean {
  return (
    modelId.includes('claude-opus-4-7') || modelId.includes('claude-opus-4.7')
  );
}

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
  if (!isOpus47(requestedModel)) return requestedModel;
  return fallback;
}
