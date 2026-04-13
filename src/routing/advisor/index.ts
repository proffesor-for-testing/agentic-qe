/**
 * Advisor Strategy public exports.
 * ADR-092: Provider-Agnostic Advisor Strategy for QE Agents
 */

export type {
  AdvisorTranscript,
  ConsultOptions,
  AdvisorResult,
  AdvisorConsultation,
  IMultiModelExecutor,
} from './types.js';

export {
  MultiModelExecutor,
  createMultiModelExecutor,
  DEFAULT_ADVISOR_PROVIDER,
  DEFAULT_ADVISOR_MODEL,
  DEFAULT_MAX_WORDS,
} from './multi-model-executor.js';

export {
  redact,
  validateProviderForAgent,
  isSelfHosted,
  isSecurityAgentAllowed,
  isSecurityAgent,
  AdvisorRedactionError,
  type RedactionMode,
  type RedactionResult,
} from './redaction.js';

export {
  AdvisorCircuitBreaker,
  AdvisorCircuitBreakerError,
  type CircuitBreakerConfig,
  type CircuitBreakerState,
} from './circuit-breaker.js';

export {
  DOMAIN_ADVISOR_PROMPTS,
  getDomainAdvisorPrompt,
} from './domain-prompts.js';
