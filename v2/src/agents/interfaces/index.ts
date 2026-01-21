/**
 * Agent Interfaces - Public API contracts for agents
 *
 * Phase 1.2.2: Clean interfaces that agents depend on
 *
 * @module agents/interfaces
 */

// LLM Interface (Phase 1.2.2 - LLM Independence)
export type {
  IAgentLLM,
  AgentCompletionOptions,
  AgentUsageStats,
  AgentModelInfo,
} from './IAgentLLM';

export {
  AgentLLMError,
  isAgentLLMError,
} from './IAgentLLM';
