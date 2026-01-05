/**
 * Default Network Policies for QE Agents
 *
 * IMPORTANT: Network policy enforcement is OPT-IN, not opt-out.
 * By default, agents have unrestricted network access for flexibility.
 *
 * Enable restrictive policies only when:
 * - Deploying in security-sensitive environments
 * - Running untrusted agent code
 * - Compliance requirements mandate network isolation
 *
 * @module infrastructure/network/policies/default-policies
 * @see Issue #146 - Security Hardening: SP-3 Network Policy Enforcement
 */

import type { NetworkPolicy } from '../types.js';

/**
 * All known LLM provider domains that the multi-model router may access
 * Add new providers here as they're supported
 */
export const LLM_PROVIDER_DOMAINS = [
  // Anthropic (Claude)
  'api.anthropic.com',

  // OpenAI
  'api.openai.com',

  // OpenRouter (multi-provider gateway)
  'openrouter.ai',

  // Groq
  'api.groq.com',

  // Google (Gemini)
  'generativelanguage.googleapis.com',

  // Together AI
  'api.together.xyz',

  // GitHub Models
  'models.inference.ai.azure.com',

  // Azure OpenAI
  'openai.azure.com',

  // Fireworks AI
  'api.fireworks.ai',

  // Mistral AI
  'api.mistral.ai',

  // Cohere
  'api.cohere.ai',

  // Perplexity
  'api.perplexity.ai',

  // DeepSeek
  'api.deepseek.com',

  // Local inference (Ollama, ruvLLM, vLLM, etc.)
  'localhost',
  '127.0.0.1',
] as const;

/**
 * Development/testing domains that agents commonly need
 */
export const DEVELOPMENT_DOMAINS = [
  // Package registries
  'registry.npmjs.org',
  'pypi.org',

  // Code hosting
  'api.github.com',
  'github.com',
  'gitlab.com',
  'api.gitlab.com',
  'bitbucket.org',

  // Security databases (for security scanner)
  'nvd.nist.gov',
  'cve.mitre.org',
  'osv.dev',
  'security.snyk.io',
  'cvedetails.com',
] as const;

/**
 * Default permissive policy - agents can access any domain
 * This is the base policy when no restrictions are needed
 */
const PERMISSIVE_POLICY: NetworkPolicy = {
  agentType: 'default',
  allowedDomains: [], // Empty = no whitelist = allow all
  rateLimit: {
    requestsPerMinute: 120,
    requestsPerHour: 3000,
    burstSize: 20,
  },
  auditLogging: true,
  blockUnknownDomains: false, // OPT-IN: false = permissive by default
  timeoutMs: 60000,
};

/**
 * Restrictive policy template for security-sensitive deployments
 * Use this when you need to lock down agent network access
 */
export const RESTRICTIVE_POLICY_TEMPLATE: NetworkPolicy = {
  agentType: 'restrictive-template',
  allowedDomains: [...LLM_PROVIDER_DOMAINS, ...DEVELOPMENT_DOMAINS],
  rateLimit: {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    burstSize: 10,
  },
  auditLogging: true,
  blockUnknownDomains: true, // Restrictive: only allow whitelisted domains
  timeoutMs: 30000,
};

/**
 * Default network policies for all QE agent types
 *
 * DESIGN PRINCIPLE: Permissive by default (blockUnknownDomains: false)
 * - QE agents need to test arbitrary websites/APIs
 * - Multi-model router accesses multiple LLM providers
 * - Rate limiting still applies for protection
 *
 * To enable restrictive mode:
 * ```typescript
 * const policy = getNetworkPolicy('qe-test-generator');
 * policy.blockUnknownDomains = true;
 * policy.allowedDomains = [...LLM_PROVIDER_DOMAINS, 'my-api.example.com'];
 * ```
 */
export const DEFAULT_NETWORK_POLICIES: Record<string, NetworkPolicy> = {
  // ============================================
  // Core QE Agents - Permissive with audit logging
  // ============================================

  'qe-test-generator': {
    ...PERMISSIVE_POLICY,
    agentType: 'qe-test-generator',
    auditLogging: true,
  },

  'qe-coverage-analyzer': {
    ...PERMISSIVE_POLICY,
    agentType: 'qe-coverage-analyzer',
  },

  'qe-security-scanner': {
    ...PERMISSIVE_POLICY,
    agentType: 'qe-security-scanner',
    // Security scanner gets higher rate limits for vulnerability DB queries
    rateLimit: {
      requestsPerMinute: 180,
      requestsPerHour: 5000,
      burstSize: 30,
    },
    timeoutMs: 90000, // Longer timeout for security scans
  },

  'qe-performance-tester': {
    ...PERMISSIVE_POLICY,
    agentType: 'qe-performance-tester',
    // Performance testing may need high request rates
    rateLimit: {
      requestsPerMinute: 300,
      requestsPerHour: 10000,
      burstSize: 50,
    },
    timeoutMs: 120000, // Longer timeout for perf tests
  },

  'qe-flaky-test-hunter': {
    ...PERMISSIVE_POLICY,
    agentType: 'qe-flaky-test-hunter',
  },

  'qe-api-contract-validator': {
    ...PERMISSIVE_POLICY,
    agentType: 'qe-api-contract-validator',
    // Contract validation needs to hit various API endpoints
    rateLimit: {
      requestsPerMinute: 120,
      requestsPerHour: 3000,
      burstSize: 25,
    },
  },

  'qe-visual-tester': {
    ...PERMISSIVE_POLICY,
    agentType: 'qe-visual-tester',
    timeoutMs: 90000, // Screenshots take time
  },

  'qe-code-intelligence': {
    ...PERMISSIVE_POLICY,
    agentType: 'qe-code-intelligence',
  },

  'qe-quality-analyzer': {
    ...PERMISSIVE_POLICY,
    agentType: 'qe-quality-analyzer',
  },

  'qe-a11y-ally': {
    ...PERMISSIVE_POLICY,
    agentType: 'qe-a11y-ally',
    // A11y testing needs to fetch web pages
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerHour: 1500,
      burstSize: 15,
    },
  },

  'qe-chaos-engineer': {
    ...PERMISSIVE_POLICY,
    agentType: 'qe-chaos-engineer',
    // Chaos engineering may need to probe many endpoints
    rateLimit: {
      requestsPerMinute: 200,
      requestsPerHour: 5000,
      burstSize: 40,
    },
    timeoutMs: 90000,
  },

  'qe-deployment-readiness': {
    ...PERMISSIVE_POLICY,
    agentType: 'qe-deployment-readiness',
  },

  'qe-production-intelligence': {
    ...PERMISSIVE_POLICY,
    agentType: 'qe-production-intelligence',
  },

  'qx-partner': {
    ...PERMISSIVE_POLICY,
    agentType: 'qx-partner',
  },

  // ============================================
  // n8n Workflow Agents - Permissive
  // ============================================

  'n8n-workflow-executor': {
    ...PERMISSIVE_POLICY,
    agentType: 'n8n-workflow-executor',
    // Workflows may call arbitrary APIs
    rateLimit: {
      requestsPerMinute: 120,
      requestsPerHour: 3000,
      burstSize: 20,
    },
  },

  'n8n-security-auditor': {
    ...PERMISSIVE_POLICY,
    agentType: 'n8n-security-auditor',
  },

  'n8n-chaos-tester': {
    ...PERMISSIVE_POLICY,
    agentType: 'n8n-chaos-tester',
    rateLimit: {
      requestsPerMinute: 150,
      requestsPerHour: 4000,
      burstSize: 30,
    },
  },

  // ============================================
  // Default Policy - Applied to unknown agent types
  // ============================================

  default: {
    ...PERMISSIVE_POLICY,
    agentType: 'default',
  },
};

/**
 * Get policy for an agent type
 * Falls back to default if not found
 */
export function getNetworkPolicy(agentType: string): NetworkPolicy {
  return DEFAULT_NETWORK_POLICIES[agentType] || DEFAULT_NETWORK_POLICIES['default'];
}

/**
 * List all agent types with policies
 */
export function listPolicyAgentTypes(): string[] {
  return Object.keys(DEFAULT_NETWORK_POLICIES).filter((k) => k !== 'default');
}

/**
 * Merge custom policy with default
 */
export function mergePolicy(
  agentType: string,
  customPolicy: Partial<NetworkPolicy>
): NetworkPolicy {
  const basePolicy = getNetworkPolicy(agentType);
  return {
    ...basePolicy,
    ...customPolicy,
    rateLimit: {
      ...basePolicy.rateLimit,
      ...customPolicy.rateLimit,
    },
  };
}

/**
 * Create a restrictive policy for security-sensitive deployments
 *
 * @example
 * ```typescript
 * // Lock down an agent to only access LLM providers and specific APIs
 * const policy = createRestrictivePolicy('qe-test-generator', [
 *   'api.example.com',
 *   'staging.example.com'
 * ]);
 * manager.registerPolicy(policy);
 * ```
 */
export function createRestrictivePolicy(
  agentType: string,
  additionalDomains: string[] = []
): NetworkPolicy {
  const basePolicy = getNetworkPolicy(agentType);
  return {
    ...basePolicy,
    allowedDomains: [...LLM_PROVIDER_DOMAINS, ...DEVELOPMENT_DOMAINS, ...additionalDomains],
    blockUnknownDomains: true,
  };
}

/**
 * Enable restrictive mode for all default policies
 * Call this when deploying in a security-sensitive environment
 */
export function enableRestrictiveModeGlobally(): void {
  for (const policy of Object.values(DEFAULT_NETWORK_POLICIES)) {
    policy.allowedDomains = [...LLM_PROVIDER_DOMAINS, ...DEVELOPMENT_DOMAINS];
    policy.blockUnknownDomains = true;
  }
}
