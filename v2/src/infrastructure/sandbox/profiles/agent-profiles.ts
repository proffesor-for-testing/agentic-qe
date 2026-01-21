/**
 * Agent Resource Profiles for Docker Sandboxing
 *
 * Defines resource limits and network policies for each QE agent type.
 * Profiles are designed for security (minimal access) and stability (OOM prevention).
 *
 * @module infrastructure/sandbox/profiles/agent-profiles
 * @see Issue #146 - Security Hardening: Docker Sandboxing
 */

import { SandboxConfig } from '../types.js';

/**
 * Agent profile with sandbox configuration and metadata
 */
export interface AgentProfile {
  /** Sandbox configuration */
  config: SandboxConfig;

  /** Profile description */
  description: string;

  /** Risk level for audit purposes */
  riskLevel: 'low' | 'medium' | 'high';

  /** Whether agent needs external network access */
  requiresNetwork: boolean;
}

/**
 * Resource profiles for all QE agents
 *
 * Each profile is tuned for the specific agent's requirements:
 * - CPU: Based on computational needs
 * - Memory: Based on data processing requirements
 * - Network: Minimal domains required for operation
 */
export const AGENT_PROFILES: Record<string, AgentProfile> = {
  // ============================================
  // Core QE Agents
  // ============================================

  'qe-test-generator': {
    description: 'AI-powered test generation with multi-framework support',
    riskLevel: 'medium',
    requiresNetwork: true,
    config: {
      cpuLimit: 2,
      memoryLimit: '2g',
      memorySwapLimit: '2g',
      diskLimit: '512m',
      networkMode: 'whitelisted',
      allowedDomains: [
        'api.anthropic.com',
        'registry.npmjs.org',
        'api.github.com',
      ],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  'qe-coverage-analyzer': {
    description: 'O(log n) coverage gap detection with sublinear algorithms',
    riskLevel: 'low',
    requiresNetwork: true,
    config: {
      cpuLimit: 1,
      memoryLimit: '1g',
      memorySwapLimit: '1g',
      diskLimit: '256m',
      networkMode: 'whitelisted',
      allowedDomains: ['api.anthropic.com'],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  'qe-security-scanner': {
    description: 'Multi-layer security analysis (SAST, DAST, dependencies)',
    riskLevel: 'high',
    requiresNetwork: true,
    config: {
      cpuLimit: 2,
      memoryLimit: '4g',
      memorySwapLimit: '4g',
      diskLimit: '1g',
      networkMode: 'whitelisted',
      allowedDomains: [
        'api.anthropic.com',
        'nvd.nist.gov',
        'cve.mitre.org',
        'osv.dev',
        'api.github.com',
      ],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  'qe-performance-tester': {
    description: 'Load testing and performance profiling',
    riskLevel: 'medium',
    requiresNetwork: true,
    config: {
      cpuLimit: 4,
      memoryLimit: '4g',
      memorySwapLimit: '4g',
      diskLimit: '1g',
      networkMode: 'whitelisted',
      allowedDomains: ['api.anthropic.com'],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  'qe-flaky-test-hunter': {
    description: 'Detects, analyzes, and stabilizes flaky tests',
    riskLevel: 'low',
    requiresNetwork: true,
    config: {
      cpuLimit: 2,
      memoryLimit: '2g',
      memorySwapLimit: '2g',
      diskLimit: '512m',
      networkMode: 'whitelisted',
      allowedDomains: ['api.anthropic.com'],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  'qe-api-contract-validator': {
    description: 'Validates API contracts and detects breaking changes',
    riskLevel: 'low',
    requiresNetwork: true,
    config: {
      cpuLimit: 1,
      memoryLimit: '1g',
      memorySwapLimit: '1g',
      diskLimit: '256m',
      networkMode: 'whitelisted',
      allowedDomains: ['api.anthropic.com'],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  'qe-visual-tester': {
    description: 'Visual regression testing with AI-powered comparison',
    riskLevel: 'medium',
    requiresNetwork: true,
    config: {
      cpuLimit: 2,
      memoryLimit: '4g',
      memorySwapLimit: '4g',
      diskLimit: '2g',
      networkMode: 'whitelisted',
      allowedDomains: ['api.anthropic.com'],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  'qe-code-intelligence': {
    description: 'Knowledge graph-based code understanding',
    riskLevel: 'low',
    requiresNetwork: true,
    config: {
      cpuLimit: 2,
      memoryLimit: '2g',
      memorySwapLimit: '2g',
      diskLimit: '1g',
      networkMode: 'whitelisted',
      allowedDomains: ['api.anthropic.com', 'localhost'],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  'qe-quality-analyzer': {
    description: 'Comprehensive quality metrics analysis',
    riskLevel: 'low',
    requiresNetwork: true,
    config: {
      cpuLimit: 1,
      memoryLimit: '1g',
      memorySwapLimit: '1g',
      diskLimit: '256m',
      networkMode: 'whitelisted',
      allowedDomains: ['api.anthropic.com'],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  'qe-a11y-ally': {
    description: 'Accessibility testing and WCAG compliance',
    riskLevel: 'low',
    requiresNetwork: true,
    config: {
      cpuLimit: 1,
      memoryLimit: '1g',
      memorySwapLimit: '1g',
      diskLimit: '256m',
      networkMode: 'whitelisted',
      allowedDomains: ['api.anthropic.com'],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  'qe-chaos-engineer': {
    description: 'Resilience testing with controlled fault injection',
    riskLevel: 'high',
    requiresNetwork: true,
    config: {
      cpuLimit: 2,
      memoryLimit: '2g',
      memorySwapLimit: '2g',
      diskLimit: '512m',
      networkMode: 'whitelisted',
      allowedDomains: ['api.anthropic.com'],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  'qe-deployment-readiness': {
    description: 'Deployment risk assessment and quality gates',
    riskLevel: 'low',
    requiresNetwork: true,
    config: {
      cpuLimit: 1,
      memoryLimit: '1g',
      memorySwapLimit: '1g',
      diskLimit: '256m',
      networkMode: 'whitelisted',
      allowedDomains: ['api.anthropic.com'],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  'qe-production-intelligence': {
    description: 'Converts production data into test scenarios',
    riskLevel: 'medium',
    requiresNetwork: true,
    config: {
      cpuLimit: 2,
      memoryLimit: '2g',
      memorySwapLimit: '2g',
      diskLimit: '512m',
      networkMode: 'whitelisted',
      allowedDomains: ['api.anthropic.com'],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  'qx-partner': {
    description: 'Quality Experience analysis combining QA and UX perspectives',
    riskLevel: 'low',
    requiresNetwork: true,
    config: {
      cpuLimit: 1,
      memoryLimit: '1g',
      memorySwapLimit: '1g',
      diskLimit: '256m',
      networkMode: 'whitelisted',
      allowedDomains: ['api.anthropic.com'],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  // ============================================
  // TDD Subagents
  // ============================================

  'qe-test-writer': {
    description: 'TDD RED phase - writes failing tests',
    riskLevel: 'low',
    requiresNetwork: true,
    config: {
      cpuLimit: 1,
      memoryLimit: '1g',
      memorySwapLimit: '1g',
      diskLimit: '256m',
      networkMode: 'whitelisted',
      allowedDomains: ['api.anthropic.com'],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  'qe-test-implementer': {
    description: 'TDD GREEN phase - implements minimal code',
    riskLevel: 'low',
    requiresNetwork: true,
    config: {
      cpuLimit: 1,
      memoryLimit: '1g',
      memorySwapLimit: '1g',
      diskLimit: '256m',
      networkMode: 'whitelisted',
      allowedDomains: ['api.anthropic.com'],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  'qe-test-refactorer': {
    description: 'TDD REFACTOR phase - improves code quality',
    riskLevel: 'low',
    requiresNetwork: true,
    config: {
      cpuLimit: 1,
      memoryLimit: '1g',
      memorySwapLimit: '1g',
      diskLimit: '256m',
      networkMode: 'whitelisted',
      allowedDomains: ['api.anthropic.com'],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  'qe-code-reviewer': {
    description: 'Enforces quality standards, linting, and security',
    riskLevel: 'low',
    requiresNetwork: true,
    config: {
      cpuLimit: 1,
      memoryLimit: '1g',
      memorySwapLimit: '1g',
      diskLimit: '256m',
      networkMode: 'whitelisted',
      allowedDomains: ['api.anthropic.com'],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  'qe-integration-tester': {
    description: 'Validates component interactions',
    riskLevel: 'medium',
    requiresNetwork: true,
    config: {
      cpuLimit: 2,
      memoryLimit: '2g',
      memorySwapLimit: '2g',
      diskLimit: '512m',
      networkMode: 'whitelisted',
      allowedDomains: ['api.anthropic.com'],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  // ============================================
  // n8n Workflow Testing Agents
  // ============================================

  'n8n-workflow-executor': {
    description: 'Execute and validate n8n workflows',
    riskLevel: 'medium',
    requiresNetwork: true,
    config: {
      cpuLimit: 2,
      memoryLimit: '2g',
      memorySwapLimit: '2g',
      diskLimit: '512m',
      networkMode: 'whitelisted',
      allowedDomains: ['api.anthropic.com', 'localhost'],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  'n8n-security-auditor': {
    description: 'Security vulnerability scanning for n8n workflows',
    riskLevel: 'high',
    requiresNetwork: true,
    config: {
      cpuLimit: 2,
      memoryLimit: '2g',
      memorySwapLimit: '2g',
      diskLimit: '512m',
      networkMode: 'whitelisted',
      allowedDomains: ['api.anthropic.com'],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  'n8n-chaos-tester': {
    description: 'Chaos engineering for n8n workflows',
    riskLevel: 'high',
    requiresNetwork: true,
    config: {
      cpuLimit: 2,
      memoryLimit: '2g',
      memorySwapLimit: '2g',
      diskLimit: '512m',
      networkMode: 'whitelisted',
      allowedDomains: ['api.anthropic.com'],
      readOnlyRootFs: true,
      user: 'node',
    },
  },

  // ============================================
  // Default Profile
  // ============================================

  default: {
    description: 'Default profile for unknown agent types',
    riskLevel: 'low',
    requiresNetwork: true,
    config: {
      cpuLimit: 1,
      memoryLimit: '512m',
      memorySwapLimit: '512m',
      diskLimit: '128m',
      networkMode: 'isolated',
      readOnlyRootFs: true,
      user: 'node',
    },
  },
};

/**
 * Get profile for an agent type
 * Falls back to default if not found
 */
export function getAgentProfile(agentType: string): AgentProfile {
  return AGENT_PROFILES[agentType] || AGENT_PROFILES['default'];
}

/**
 * Get sandbox config for an agent type
 */
export function getAgentSandboxConfig(agentType: string): SandboxConfig {
  return getAgentProfile(agentType).config;
}

/**
 * List all available agent profiles
 */
export function listAgentProfiles(): string[] {
  return Object.keys(AGENT_PROFILES).filter((k) => k !== 'default');
}

/**
 * Validate that a custom config doesn't exceed profile limits
 */
export function validateConfigAgainstProfile(
  agentType: string,
  config: Partial<SandboxConfig>
): { valid: boolean; violations: string[] } {
  const profile = getAgentProfile(agentType);
  const violations: string[] = [];

  if (config.cpuLimit && config.cpuLimit > profile.config.cpuLimit) {
    violations.push(
      `CPU limit ${config.cpuLimit} exceeds profile maximum ${profile.config.cpuLimit}`
    );
  }

  // Note: Memory comparison would need parsing - simplified here
  if (config.networkMode === 'host' && profile.config.networkMode !== 'host') {
    violations.push('Host network mode not allowed for this agent type');
  }

  if (config.readOnlyRootFs === false && profile.config.readOnlyRootFs) {
    violations.push('Read-only root filesystem is required for this agent type');
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
