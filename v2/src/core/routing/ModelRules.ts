/**
 * Model Selection Rules
 * Task-specific and complexity-based model selection rules
 */

import { AIModel, TaskComplexity, ModelCapability } from './types';

/**
 * Model capabilities and pricing
 */
export const MODEL_CAPABILITIES: Record<AIModel, ModelCapability> = {
  [AIModel.GPT_3_5_TURBO]: {
    model: AIModel.GPT_3_5_TURBO,
    maxTokens: 4096,
    costPerToken: 0.000002, // $0.002 per 1K tokens
    strengths: ['Fast', 'Cheap', 'Good for simple tasks'],
    weaknesses: ['Limited reasoning', 'Less accurate on complex tasks'],
    rateLimitPerMin: 3500,
  },
  [AIModel.CLAUDE_HAIKU]: {
    model: AIModel.CLAUDE_HAIKU,
    maxTokens: 8192,
    costPerToken: 0.000004, // $0.004 per 1K tokens
    strengths: ['Balanced speed/quality', 'Good reasoning', 'Cost-effective'],
    weaknesses: ['Not best for critical tasks'],
    rateLimitPerMin: 2000,
  },
  [AIModel.GPT_4]: {
    model: AIModel.GPT_4,
    maxTokens: 8192,
    costPerToken: 0.00003, // $0.03 per 1K tokens
    strengths: ['Excellent reasoning', 'Complex problem solving'],
    weaknesses: ['Expensive', 'Slower'],
    rateLimitPerMin: 500,
  },
  [AIModel.CLAUDE_SONNET_4_5]: {
    model: AIModel.CLAUDE_SONNET_4_5,
    maxTokens: 16384,
    costPerToken: 0.00005, // $0.05 per 1K tokens
    strengths: ['Best reasoning', 'Critical tasks', 'Security analysis'],
    weaknesses: ['Most expensive', 'Overkill for simple tasks'],
    rateLimitPerMin: 200,
  },
  // RuvLLM Local Models (Zero Cost)
  [AIModel.RUVLLM_LLAMA_3_2_1B]: {
    model: AIModel.RUVLLM_LLAMA_3_2_1B,
    maxTokens: 4096,
    costPerToken: 0, // Free - local inference
    strengths: ['Zero cost', 'Fast', 'Privacy-preserving', 'Low latency'],
    weaknesses: ['Limited reasoning', 'Smaller model size'],
    rateLimitPerMin: Infinity, // No cloud rate limits
  },
  [AIModel.RUVLLM_LLAMA_3_2_3B]: {
    model: AIModel.RUVLLM_LLAMA_3_2_3B,
    maxTokens: 4096,
    costPerToken: 0, // Free - local inference
    strengths: ['Zero cost', 'Good quality/speed balance', 'Privacy-preserving', 'TRM support'],
    weaknesses: ['Moderate reasoning', 'Resource intensive'],
    rateLimitPerMin: Infinity,
  },
  [AIModel.RUVLLM_LLAMA_3_1_8B]: {
    model: AIModel.RUVLLM_LLAMA_3_1_8B,
    maxTokens: 8192,
    costPerToken: 0, // Free - local inference
    strengths: ['Zero cost', 'Strong reasoning', 'Large context', 'SONA learning'],
    weaknesses: ['Slower inference', 'High memory usage'],
    rateLimitPerMin: Infinity,
  },
  [AIModel.RUVLLM_PHI_3_MINI]: {
    model: AIModel.RUVLLM_PHI_3_MINI,
    maxTokens: 4096,
    costPerToken: 0, // Free - local inference
    strengths: ['Zero cost', 'Very fast', 'Low resource usage', 'Good for code'],
    weaknesses: ['Limited context', 'Basic reasoning'],
    rateLimitPerMin: Infinity,
  },
  [AIModel.RUVLLM_MISTRAL_7B]: {
    model: AIModel.RUVLLM_MISTRAL_7B,
    maxTokens: 8192,
    costPerToken: 0, // Free - local inference
    strengths: ['Zero cost', 'Excellent reasoning', 'Multilingual', 'Fast inference'],
    weaknesses: ['High memory usage', 'GPU recommended'],
    rateLimitPerMin: Infinity,
  },
  [AIModel.RUVLLM_QWEN2_7B]: {
    model: AIModel.RUVLLM_QWEN2_7B,
    maxTokens: 8192,
    costPerToken: 0, // Free - local inference
    strengths: ['Zero cost', 'Strong reasoning', 'Multilingual', 'Code generation'],
    weaknesses: ['High memory usage', 'Slower on CPU'],
    rateLimitPerMin: Infinity,
  },
};

/**
 * Task-specific model selection rules by agent type and complexity
 */
export const MODEL_RULES: Record<string, Record<TaskComplexity, AIModel>> = {
  'qe-test-generator': {
    [TaskComplexity.SIMPLE]: AIModel.GPT_3_5_TURBO,      // Unit tests, basic logic
    [TaskComplexity.MODERATE]: AIModel.CLAUDE_HAIKU,     // Integration tests
    [TaskComplexity.COMPLEX]: AIModel.GPT_4,             // Property-based, edge cases
    [TaskComplexity.CRITICAL]: AIModel.CLAUDE_SONNET_4_5, // Security, performance
  },
  'qe-test-executor': {
    [TaskComplexity.SIMPLE]: AIModel.GPT_3_5_TURBO,
    [TaskComplexity.MODERATE]: AIModel.GPT_3_5_TURBO,
    [TaskComplexity.COMPLEX]: AIModel.CLAUDE_HAIKU,
    [TaskComplexity.CRITICAL]: AIModel.GPT_4,
  },
  'qe-coverage-analyzer': {
    [TaskComplexity.SIMPLE]: AIModel.CLAUDE_HAIKU,
    [TaskComplexity.MODERATE]: AIModel.CLAUDE_HAIKU,
    [TaskComplexity.COMPLEX]: AIModel.GPT_4,
    [TaskComplexity.CRITICAL]: AIModel.CLAUDE_SONNET_4_5,
  },
  'qe-quality-gate': {
    [TaskComplexity.SIMPLE]: AIModel.CLAUDE_HAIKU,
    [TaskComplexity.MODERATE]: AIModel.GPT_4,
    [TaskComplexity.COMPLEX]: AIModel.GPT_4,
    [TaskComplexity.CRITICAL]: AIModel.CLAUDE_SONNET_4_5,
  },
  'qe-performance-tester': {
    [TaskComplexity.SIMPLE]: AIModel.CLAUDE_HAIKU,
    [TaskComplexity.MODERATE]: AIModel.GPT_4,
    [TaskComplexity.COMPLEX]: AIModel.GPT_4,
    [TaskComplexity.CRITICAL]: AIModel.CLAUDE_SONNET_4_5,
  },
  'qe-security-scanner': {
    [TaskComplexity.SIMPLE]: AIModel.GPT_4,
    [TaskComplexity.MODERATE]: AIModel.GPT_4,
    [TaskComplexity.COMPLEX]: AIModel.CLAUDE_SONNET_4_5,
    [TaskComplexity.CRITICAL]: AIModel.CLAUDE_SONNET_4_5,
  },
  'default': {
    [TaskComplexity.SIMPLE]: AIModel.GPT_3_5_TURBO,
    [TaskComplexity.MODERATE]: AIModel.CLAUDE_HAIKU,
    [TaskComplexity.COMPLEX]: AIModel.GPT_4,
    [TaskComplexity.CRITICAL]: AIModel.CLAUDE_SONNET_4_5,
  },
};

/**
 * Fallback chain for each model (ordered by capability)
 */
export const FALLBACK_CHAINS: Record<AIModel, AIModel[]> = {
  [AIModel.GPT_3_5_TURBO]: [
    AIModel.CLAUDE_HAIKU,
    AIModel.GPT_4,
    AIModel.CLAUDE_SONNET_4_5,
  ],
  [AIModel.CLAUDE_HAIKU]: [
    AIModel.GPT_3_5_TURBO,
    AIModel.GPT_4,
    AIModel.CLAUDE_SONNET_4_5,
  ],
  [AIModel.GPT_4]: [
    AIModel.CLAUDE_SONNET_4_5,
    AIModel.CLAUDE_HAIKU,
    AIModel.GPT_3_5_TURBO,
  ],
  [AIModel.CLAUDE_SONNET_4_5]: [
    AIModel.GPT_4,
    AIModel.CLAUDE_HAIKU,
    AIModel.GPT_3_5_TURBO,
  ],
  // RuvLLM models fallback to cloud when local fails
  [AIModel.RUVLLM_LLAMA_3_2_1B]: [
    AIModel.RUVLLM_LLAMA_3_2_3B,
    AIModel.GPT_3_5_TURBO,
    AIModel.CLAUDE_HAIKU,
  ],
  [AIModel.RUVLLM_LLAMA_3_2_3B]: [
    AIModel.RUVLLM_LLAMA_3_1_8B,
    AIModel.GPT_3_5_TURBO,
    AIModel.CLAUDE_HAIKU,
  ],
  [AIModel.RUVLLM_LLAMA_3_1_8B]: [
    AIModel.RUVLLM_MISTRAL_7B,
    AIModel.GPT_4,
    AIModel.CLAUDE_HAIKU,
  ],
  [AIModel.RUVLLM_PHI_3_MINI]: [
    AIModel.RUVLLM_LLAMA_3_2_3B,
    AIModel.GPT_3_5_TURBO,
    AIModel.CLAUDE_HAIKU,
  ],
  [AIModel.RUVLLM_MISTRAL_7B]: [
    AIModel.RUVLLM_LLAMA_3_1_8B,
    AIModel.GPT_4,
    AIModel.CLAUDE_SONNET_4_5,
  ],
  [AIModel.RUVLLM_QWEN2_7B]: [
    AIModel.RUVLLM_MISTRAL_7B,
    AIModel.GPT_4,
    AIModel.CLAUDE_SONNET_4_5,
  ],
};

/**
 * Complexity detection keywords
 */
export const COMPLEXITY_KEYWORDS = {
  [TaskComplexity.SIMPLE]: [
    'unit test',
    'basic',
    'simple',
    'getter',
    'setter',
    'validation',
    'mock',
  ],
  [TaskComplexity.MODERATE]: [
    'integration',
    'api',
    'endpoint',
    'database',
    'middleware',
    'component',
  ],
  [TaskComplexity.COMPLEX]: [
    'property-based',
    'edge case',
    'algorithm',
    'concurrent',
    'race condition',
    'optimization',
    'complex logic',
  ],
  [TaskComplexity.CRITICAL]: [
    'security',
    'authentication',
    'authorization',
    'encryption',
    'performance',
    'memory leak',
    'critical path',
    'production',
  ],
};

/**
 * Default router configuration
 */
export const DEFAULT_ROUTER_CONFIG = {
  enabled: false, // Feature flag - off by default
  defaultModel: AIModel.CLAUDE_SONNET_4_5,
  enableCostTracking: true,
  enableFallback: true,
  maxRetries: 3,
  costThreshold: 0.50, // Max $0.50 per task
  preferLocal: true, // Prefer local RuvLLM models when available (zero cost)
  ruvllmEndpoint: process.env.RUVLLM_ENDPOINT || 'http://localhost:8080',
};
