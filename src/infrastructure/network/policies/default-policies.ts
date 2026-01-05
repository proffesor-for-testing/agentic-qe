/**
 * Default Network Policies for QE Agents
 *
 * Defines security-conscious network access policies for each agent type.
 * Policies follow the principle of least privilege.
 *
 * @module infrastructure/network/policies/default-policies
 * @see Issue #146 - Security Hardening: SP-3 Network Policy Enforcement
 */

import type { NetworkPolicy } from '../types.js';

/**
 * Default network policies for all QE agent types
 */
export const DEFAULT_NETWORK_POLICIES: Record<string, NetworkPolicy> = {
  // ============================================
  // Core QE Agents
  // ============================================

  'qe-test-generator': {
    agentType: 'qe-test-generator',
    allowedDomains: [
      'api.anthropic.com',
      'registry.npmjs.org',
      'api.github.com',
    ],
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerHour: 1000,
      burstSize: 10,
    },
    auditLogging: true,
    blockUnknownDomains: true,
    timeoutMs: 30000,
  },

  'qe-coverage-analyzer': {
    agentType: 'qe-coverage-analyzer',
    allowedDomains: ['api.anthropic.com'],
    rateLimit: {
      requestsPerMinute: 30,
      requestsPerHour: 500,
      burstSize: 5,
    },
    auditLogging: true,
    blockUnknownDomains: true,
    timeoutMs: 30000,
  },

  'qe-security-scanner': {
    agentType: 'qe-security-scanner',
    allowedDomains: [
      'api.anthropic.com',
      'nvd.nist.gov',
      'cve.mitre.org',
      'osv.dev',
      'api.github.com',
      'security.snyk.io',
    ],
    rateLimit: {
      requestsPerMinute: 120,
      requestsPerHour: 2000,
      burstSize: 20,
    },
    auditLogging: true,
    blockUnknownDomains: true,
    timeoutMs: 60000,
  },

  'qe-performance-tester': {
    agentType: 'qe-performance-tester',
    allowedDomains: ['api.anthropic.com'],
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerHour: 1000,
      burstSize: 15,
    },
    auditLogging: true,
    blockUnknownDomains: true,
    timeoutMs: 120000, // Longer timeout for perf tests
  },

  'qe-flaky-test-hunter': {
    agentType: 'qe-flaky-test-hunter',
    allowedDomains: ['api.anthropic.com'],
    rateLimit: {
      requestsPerMinute: 30,
      requestsPerHour: 500,
      burstSize: 5,
    },
    auditLogging: true,
    blockUnknownDomains: true,
    timeoutMs: 30000,
  },

  'qe-api-contract-validator': {
    agentType: 'qe-api-contract-validator',
    allowedDomains: ['api.anthropic.com'],
    rateLimit: {
      requestsPerMinute: 30,
      requestsPerHour: 500,
      burstSize: 5,
    },
    auditLogging: true,
    blockUnknownDomains: true,
    timeoutMs: 30000,
  },

  'qe-visual-tester': {
    agentType: 'qe-visual-tester',
    allowedDomains: ['api.anthropic.com'],
    rateLimit: {
      requestsPerMinute: 30,
      requestsPerHour: 500,
      burstSize: 5,
    },
    auditLogging: true,
    blockUnknownDomains: true,
    timeoutMs: 60000,
  },

  'qe-code-intelligence': {
    agentType: 'qe-code-intelligence',
    allowedDomains: ['api.anthropic.com', 'localhost', '127.0.0.1'],
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerHour: 1000,
      burstSize: 10,
    },
    auditLogging: true,
    blockUnknownDomains: true,
    timeoutMs: 30000,
  },

  'qe-quality-analyzer': {
    agentType: 'qe-quality-analyzer',
    allowedDomains: ['api.anthropic.com'],
    rateLimit: {
      requestsPerMinute: 30,
      requestsPerHour: 500,
      burstSize: 5,
    },
    auditLogging: true,
    blockUnknownDomains: true,
    timeoutMs: 30000,
  },

  'qe-a11y-ally': {
    agentType: 'qe-a11y-ally',
    allowedDomains: ['api.anthropic.com'],
    rateLimit: {
      requestsPerMinute: 30,
      requestsPerHour: 500,
      burstSize: 5,
    },
    auditLogging: true,
    blockUnknownDomains: true,
    timeoutMs: 30000,
  },

  'qe-chaos-engineer': {
    agentType: 'qe-chaos-engineer',
    allowedDomains: ['api.anthropic.com'],
    rateLimit: {
      requestsPerMinute: 30,
      requestsPerHour: 500,
      burstSize: 5,
    },
    auditLogging: true,
    blockUnknownDomains: true,
    timeoutMs: 60000,
  },

  'qe-deployment-readiness': {
    agentType: 'qe-deployment-readiness',
    allowedDomains: ['api.anthropic.com'],
    rateLimit: {
      requestsPerMinute: 30,
      requestsPerHour: 500,
      burstSize: 5,
    },
    auditLogging: true,
    blockUnknownDomains: true,
    timeoutMs: 30000,
  },

  'qe-production-intelligence': {
    agentType: 'qe-production-intelligence',
    allowedDomains: ['api.anthropic.com'],
    rateLimit: {
      requestsPerMinute: 30,
      requestsPerHour: 500,
      burstSize: 5,
    },
    auditLogging: true,
    blockUnknownDomains: true,
    timeoutMs: 30000,
  },

  'qx-partner': {
    agentType: 'qx-partner',
    allowedDomains: ['api.anthropic.com'],
    rateLimit: {
      requestsPerMinute: 30,
      requestsPerHour: 500,
      burstSize: 5,
    },
    auditLogging: true,
    blockUnknownDomains: true,
    timeoutMs: 30000,
  },

  // ============================================
  // n8n Workflow Agents
  // ============================================

  'n8n-workflow-executor': {
    agentType: 'n8n-workflow-executor',
    allowedDomains: ['api.anthropic.com', 'localhost', '127.0.0.1'],
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerHour: 1000,
      burstSize: 10,
    },
    auditLogging: true,
    blockUnknownDomains: true,
    timeoutMs: 60000,
  },

  'n8n-security-auditor': {
    agentType: 'n8n-security-auditor',
    allowedDomains: ['api.anthropic.com'],
    rateLimit: {
      requestsPerMinute: 30,
      requestsPerHour: 500,
      burstSize: 5,
    },
    auditLogging: true,
    blockUnknownDomains: true,
    timeoutMs: 30000,
  },

  'n8n-chaos-tester': {
    agentType: 'n8n-chaos-tester',
    allowedDomains: ['api.anthropic.com'],
    rateLimit: {
      requestsPerMinute: 30,
      requestsPerHour: 500,
      burstSize: 5,
    },
    auditLogging: true,
    blockUnknownDomains: true,
    timeoutMs: 60000,
  },

  // ============================================
  // Default Policy (for unknown agent types)
  // ============================================

  default: {
    agentType: 'default',
    allowedDomains: ['api.anthropic.com'],
    rateLimit: {
      requestsPerMinute: 10,
      requestsPerHour: 100,
      burstSize: 3,
    },
    auditLogging: true,
    blockUnknownDomains: true,
    timeoutMs: 30000,
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
