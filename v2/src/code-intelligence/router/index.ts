/**
 * Code Intelligence Router Module
 *
 * Exports the CodeIntelligenceHybridRouter for code-specific LLM routing.
 */

export {
  CodeIntelligenceHybridRouter,
  CodeIntelligenceRouterConfig,
  EmbeddedChunk,
  DEFAULT_CODE_ROUTER_CONFIG,
  createDockerCodeIntelligenceRouter,
  createCodeIntelligenceRouterFromEnv,
} from './CodeIntelligenceHybridRouter.js';
