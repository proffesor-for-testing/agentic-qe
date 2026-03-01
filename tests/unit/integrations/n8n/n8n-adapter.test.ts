/**
 * N8n Platform Adapter Tests
 *
 * Tests for the n8n platform integration layer that bridges v2 agents
 * with v3 DDD domain architecture.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  N8nPlatformAdapter,
  createN8nAdapter,
  getDefaultAdapter,
  resetDefaultAdapter,
} from '../../../../src/integrations/n8n/n8n-adapter.js';
import {
  N8N_TO_V3_DOMAIN_MAP,
  getAgentsForDomain,
  getPrimaryDomain,
  getAllDomains,
  analyzeWorkflowForDomains,
  findAgentsByCapability,
  getAgentCapabilities,
  getAgentDescription,
} from '../../../../src/integrations/n8n/workflow-mapper.js';
import {
  N8nDomainRouter,
  createDomainRouter,
  getDefaultRouter,
  resetDefaultRouter,
} from '../../../../src/integrations/n8n/domain-router.js';
import {
  N8nAgentFactory,
  createAgentFactory,
  getDefaultFactory,
  resetDefaultFactory,
} from '../../../../src/integrations/n8n/agent-factory.js';
import type { N8nAgentType } from '../../../../src/integrations/n8n/types.js';

// ============================================================================
// Workflow Mapper Tests
// ============================================================================

describe('N8n Workflow Mapper', () => {
  describe('N8N_TO_V3_DOMAIN_MAP', () => {
    it('should have mappings for all 19 n8n agents', () => {
      const agentTypes = Object.keys(N8N_TO_V3_DOMAIN_MAP);
      expect(agentTypes.length).toBe(19);
    });

    it('should map security-auditor to security-compliance domain', () => {
      const mapping = N8N_TO_V3_DOMAIN_MAP['security-auditor'];
      expect(mapping).toBeDefined();
      expect(mapping.primaryDomain).toBe('security-compliance');
    });

    it('should map chaos-tester to chaos-resilience domain', () => {
      const mapping = N8N_TO_V3_DOMAIN_MAP['chaos-tester'];
      expect(mapping).toBeDefined();
      expect(mapping.primaryDomain).toBe('chaos-resilience');
    });

    it('should map contract-tester to contract-testing domain', () => {
      const mapping = N8N_TO_V3_DOMAIN_MAP['contract-tester'];
      expect(mapping).toBeDefined();
      expect(mapping.primaryDomain).toBe('contract-testing');
    });

    it('should have capabilities for each agent', () => {
      for (const [agentType, mapping] of Object.entries(N8N_TO_V3_DOMAIN_MAP)) {
        expect(mapping.capabilities).toBeDefined();
        expect(Array.isArray(mapping.capabilities)).toBe(true);
        expect(mapping.capabilities.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getAgentsForDomain', () => {
    it('should return agents for security-compliance domain', () => {
      const agents = getAgentsForDomain('security-compliance');
      expect(agents).toContain('security-auditor');
      expect(agents).toContain('secrets-hygiene-auditor');
      expect(agents).toContain('compliance-validator');
    });

    it('should return agents for chaos-resilience domain', () => {
      const agents = getAgentsForDomain('chaos-resilience');
      expect(agents).toContain('chaos-tester');
      expect(agents).toContain('failure-mode-tester');
    });

    it('should return empty array for unknown domain', () => {
      const agents = getAgentsForDomain('unknown-domain');
      expect(agents).toEqual([]);
    });
  });

  describe('getPrimaryDomain', () => {
    it('should return primary domain for agent type', () => {
      expect(getPrimaryDomain('security-auditor')).toBe('security-compliance');
      expect(getPrimaryDomain('workflow-executor')).toBe('test-execution');
      expect(getPrimaryDomain('bdd-scenario-tester')).toBe('requirements-validation');
    });

    // Note: TypeScript prevents passing invalid types at compile time
  });

  describe('getAllDomains', () => {
    it('should return all domains for agent type', () => {
      const domains = getAllDomains('secrets-hygiene-auditor');
      expect(domains).toContain('security-compliance');
      expect(domains).toContain('code-intelligence');
    });

    // Note: TypeScript prevents passing invalid types at compile time
  });

  describe('analyzeWorkflowForDomains', () => {
    it('should return WorkflowDomainContext for workflow with credentials', () => {
      const workflow = {
        nodes: [
          { type: 'n8n-nodes-base.httpRequest', name: 'HTTP', credentials: { apiKey: '...' } },
          { type: 'n8n-nodes-base.slack', name: 'Slack' },
        ],
        connections: {},
      };

      const context = analyzeWorkflowForDomains(workflow);
      expect(context).toBeDefined();
      expect(context.relevantDomains).toBeDefined();
      expect(Array.isArray(context.relevantDomains)).toBe(true);
      // Security concern should be detected
      expect(context.analysisHints.hasSecurityConcerns).toBe(true);
    });

    it('should return WorkflowDomainContext for workflow with triggers', () => {
      const workflow = {
        nodes: [
          { type: 'n8n-nodes-base.webhook', name: 'Webhook' },
          { type: 'n8n-nodes-base.set', name: 'Set' },
        ],
        connections: {},
      };

      const context = analyzeWorkflowForDomains(workflow);
      expect(context).toBeDefined();
      expect(context.relevantDomains).toContain('test-execution');
    });

    it('should handle empty workflows', () => {
      const workflow = {
        nodes: [],
        connections: {},
      };

      const context = analyzeWorkflowForDomains(workflow);
      expect(context).toBeDefined();
      expect(context.relevantDomains).toBeDefined();
    });
  });

  describe('findAgentsByCapability', () => {
    it('should find agents with credential scanning capability', () => {
      // Search for actual capability keywords in the mappings
      const agents = findAgentsByCapability('credential');
      expect(agents.length).toBeGreaterThan(0);
    });

    it('should find agents with load testing capability', () => {
      const agents = findAgentsByCapability('load');
      expect(agents.length).toBeGreaterThan(0);
      expect(agents).toContain('performance-tester');
    });
  });

  describe('getAgentCapabilities', () => {
    it('should return capabilities for agent', () => {
      const capabilities = getAgentCapabilities('security-auditor');
      expect(capabilities).toBeDefined();
      expect(capabilities.length).toBeGreaterThan(0);
    });

    it('should return empty array for unknown agent', () => {
      // TypeScript prevents this at compile time, but testing runtime behavior
      const capabilities = getAgentCapabilities('unknown' as N8nAgentType);
      // Should return empty array for unknown types (graceful degradation)
      expect(Array.isArray(capabilities)).toBe(true);
      expect(capabilities.length).toBe(0);
    });
  });

  describe('getAgentDescription', () => {
    it('should return description for agent', () => {
      const description = getAgentDescription('security-auditor');
      expect(description).toBeDefined();
      expect(description.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// N8n Platform Adapter Tests
// ============================================================================

describe('N8nPlatformAdapter', () => {
  let adapter: N8nPlatformAdapter;

  beforeEach(() => {
    resetDefaultAdapter();
    adapter = createN8nAdapter();
  });

  afterEach(() => {
    resetDefaultAdapter();
  });

  describe('constructor', () => {
    it('should create adapter with default config', () => {
      const adapter = new N8nPlatformAdapter();
      expect(adapter).toBeDefined();
    });

    it('should create adapter with custom config', () => {
      const adapter = new N8nPlatformAdapter({
        enableCache: false,
        cacheTTLMs: 1000,
      });
      expect(adapter).toBeDefined();
    });
  });

  describe('isAvailable', () => {
    it('should return boolean indicating v2 agents availability', () => {
      const available = adapter.isAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('routeAgentToDomain', () => {
    it('should route security-auditor to security-compliance', () => {
      const result = adapter.routeAgentToDomain('security-auditor');
      expect(result.primaryDomain).toBe('security-compliance');
    });

    it('should route workflow-executor to test-execution', () => {
      const result = adapter.routeAgentToDomain('workflow-executor');
      expect(result.primaryDomain).toBe('test-execution');
    });

    it('should include confidence score', () => {
      const result = adapter.routeAgentToDomain('security-auditor');
      expect(result.confidence).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should include explanation', () => {
      const result = adapter.routeAgentToDomain('security-auditor');
      expect(result.explanation).toBeDefined();
      expect(typeof result.explanation).toBe('string');
    });
  });

  describe('analyzeWorkflow', () => {
    it('should analyze workflow and return domain context', () => {
      const workflow = {
        id: 'test-1',
        name: 'Test Workflow',
        nodes: [
          { type: 'n8n-nodes-base.webhook', name: 'Webhook' },
          { type: 'n8n-nodes-base.set', name: 'Set' },
        ],
        connections: {},
      };

      const context = adapter.analyzeWorkflow(workflow);
      expect(context).toBeDefined();
      expect(context.workflowId).toBe('test-1');
      expect(context.relevantDomains).toBeDefined();
      expect(Array.isArray(context.relevantDomains)).toBe(true);
    });

    it('should detect complexity based on node count', () => {
      const simpleWorkflow = {
        nodes: [{ type: 'n8n-nodes-base.set', name: 'Set' }],
        connections: {},
      };

      const complexWorkflow = {
        nodes: Array.from({ length: 15 }, (_, i) => ({
          type: 'n8n-nodes-base.set',
          name: `Set ${i}`,
        })),
        connections: {},
      };

      const simpleContext = adapter.analyzeWorkflow(simpleWorkflow);
      const complexContext = adapter.analyzeWorkflow(complexWorkflow);

      expect(simpleContext.complexity).toBe('simple');
      expect(complexContext.complexity).toBe('complex');
    });
  });

  describe('getAgentsForDomain', () => {
    it('should return agents for a domain', () => {
      const agents = adapter.getAgentsForDomain('security-compliance');
      expect(Array.isArray(agents)).toBe(true);
      expect(agents.length).toBeGreaterThan(0);
    });
  });

  describe('getSupportedAgentTypes', () => {
    it('should return 19 supported agent types', () => {
      const types = adapter.getSupportedAgentTypes();
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBe(19);
    });
  });

  describe('singleton', () => {
    it('should return same instance from getDefaultAdapter', () => {
      const adapter1 = getDefaultAdapter();
      const adapter2 = getDefaultAdapter();
      expect(adapter1).toBe(adapter2);
    });

    it('should reset singleton with resetDefaultAdapter', () => {
      const adapter1 = getDefaultAdapter();
      resetDefaultAdapter();
      const adapter2 = getDefaultAdapter();
      expect(adapter1).not.toBe(adapter2);
    });
  });
});

// ============================================================================
// N8n Domain Router Tests
// ============================================================================

describe('N8nDomainRouter', () => {
  let router: N8nDomainRouter;

  beforeEach(() => {
    resetDefaultRouter();
    router = createDomainRouter();
  });

  afterEach(() => {
    resetDefaultRouter();
  });

  describe('routeTask', () => {
    it('should route task and return RoutedTask structure', () => {
      const task = {
        id: 'task-1',
        agentType: 'security-auditor' as N8nAgentType,
        workflowId: 'wf-1',
        payload: { action: 'scan' },
      };

      const routed = router.routeTask(task);
      expect(routed.task).toBe(task);
      expect(routed.routing).toBeDefined();
      expect(routed.routing.primaryDomain).toBe('security-compliance');
      expect(routed.domainTasks).toBeDefined();
      expect(Array.isArray(routed.domainTasks)).toBe(true);
    });

    it('should include routing information in result', () => {
      const task = {
        id: 'task-1',
        agentType: 'workflow-executor' as N8nAgentType,
        workflowId: 'wf-1',
        payload: {},
      };

      const routed = router.routeTask(task);
      expect(routed.routing.primaryDomain).toBe('test-execution');
      expect(routed.routing.confidence).toBeGreaterThan(0);
    });

    it('should create domain tasks for multi-domain routing', () => {
      const task = {
        id: 'task-1',
        agentType: 'security-auditor' as N8nAgentType,
        workflowId: 'wf-1',
        payload: {},
      };

      const routed = router.routeTask(task);
      expect(routed.domainTasks.length).toBeGreaterThan(0);
      expect(routed.domainTasks[0].domain).toBeDefined();
      expect(routed.domainTasks[0].operation).toBeDefined();
    });

    it('should handle unknown agent type with fallback', () => {
      const task = {
        id: 'task-1',
        agentType: 'unknown-agent' as N8nAgentType,
        workflowId: 'wf-1',
        payload: {},
      };

      // Should not throw, uses fallback
      const routed = router.routeTask(task);
      expect(routed.routing.primaryDomain).toBe('test-execution'); // Fallback domain
      expect(routed.routing.useV2Fallback).toBe(true);
    });
  });

  describe('singleton', () => {
    it('should return same instance from getDefaultRouter', () => {
      const router1 = getDefaultRouter();
      const router2 = getDefaultRouter();
      expect(router1).toBe(router2);
    });
  });
});

// ============================================================================
// N8n Agent Factory Tests
// ============================================================================

describe('N8nAgentFactory', () => {
  let factory: N8nAgentFactory;

  beforeEach(() => {
    resetDefaultFactory();
    factory = createAgentFactory();
  });

  afterEach(() => {
    resetDefaultFactory();
  });

  describe('getAvailableTypes', () => {
    it('should return all 19 agent types', () => {
      const types = factory.getAvailableTypes();
      expect(types.length).toBe(19);
    });
  });

  describe('isTypeSupported', () => {
    it('should return true for supported types', () => {
      expect(factory.isTypeSupported('security-auditor')).toBe(true);
      expect(factory.isTypeSupported('workflow-executor')).toBe(true);
      expect(factory.isTypeSupported('chaos-tester')).toBe(true);
    });

    it('should return false for unsupported types', () => {
      expect(factory.isTypeSupported('unknown-agent')).toBe(false);
    });
  });

  describe('getTypeMetadata', () => {
    it('should return metadata for supported types', () => {
      const metadata = factory.getTypeMetadata('security-auditor');
      expect(metadata).toBeDefined();
      expect(metadata?.primaryDomain).toBe('security-compliance');
      expect(metadata?.capabilities).toBeDefined();
      expect(metadata?.description).toBeDefined();
    });

    it('should return null for unsupported types', () => {
      const metadata = factory.getTypeMetadata('unknown' as N8nAgentType);
      expect(metadata).toBeNull();
    });
  });

  describe('getPoolStatus', () => {
    it('should return pool status', () => {
      const status = factory.getPoolStatus();
      expect(status).toBeDefined();
      expect(status.totalAgents).toBe(0);
      expect(status.activeAgents).toBe(0);
      expect(Array.isArray(status.availableTypes)).toBe(true);
    });
  });

  describe('clearPool', () => {
    it('should clear agent pool', () => {
      factory.clearPool();
      const status = factory.getPoolStatus();
      expect(status.totalAgents).toBe(0);
    });
  });

  describe('singleton', () => {
    it('should return same instance from getDefaultFactory', () => {
      const factory1 = getDefaultFactory();
      const factory2 = getDefaultFactory();
      expect(factory1).toBe(factory2);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('N8n Integration (End-to-End)', () => {
  beforeEach(() => {
    resetDefaultAdapter();
    resetDefaultRouter();
    resetDefaultFactory();
  });

  afterEach(() => {
    resetDefaultAdapter();
    resetDefaultRouter();
    resetDefaultFactory();
  });

  it('should analyze workflow and route to correct domain', () => {
    const adapter = getDefaultAdapter();
    const router = getDefaultRouter();

    // Analyze a workflow
    const workflow = {
      id: 'security-test-wf',
      name: 'Security Test',
      nodes: [
        { type: 'n8n-nodes-base.webhook', name: 'Webhook', credentials: { auth: '...' } },
        { type: 'n8n-nodes-base.httpRequest', name: 'HTTP' },
      ],
      connections: {},
    };

    const context = adapter.analyzeWorkflow(workflow);

    // Create a task based on analysis
    const task = {
      id: 'task-1',
      agentType: 'security-auditor' as N8nAgentType,
      workflowId: workflow.id!,
      payload: { workflowContext: context },
    };

    // Route the task
    const routed = router.routeTask(task);

    // Verify correct routing
    expect(routed.routing.primaryDomain).toBe('security-compliance');
    expect(context.analysisHints.hasSecurityConcerns).toBe(true);
  });

  it('should map all agent types to valid domains', () => {
    const factory = getDefaultFactory();
    const adapter = getDefaultAdapter();

    const allTypes = factory.getAvailableTypes();

    for (const type of allTypes) {
      const result = adapter.routeAgentToDomain(type);
      expect(result.primaryDomain).toBeDefined();
      expect(result.primaryDomain.length).toBeGreaterThan(0);
    }
  });
});
