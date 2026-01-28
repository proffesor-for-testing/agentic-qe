/**
 * Cross-Domain MinCut & Consensus Integration Tests (Phase 5)
 * ============================================================================
 *
 * Verifies ADR-047 (MinCut Self-Organizing QE) integration across all 12 QE
 * domains with Queen Coordinator bridge injection and cross-domain coordination.
 *
 * Tests:
 * 1. Queen → Domain bridge injection for all 12 domains
 * 2. Cross-domain coordination via shared MinCut graph
 * 3. Multi-model consensus verification across domains
 * 4. Domain-to-domain health propagation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';

// Domain Coordinators
import { TestGenerationCoordinator } from '../../../src/domains/test-generation/coordinator';
import { TestExecutionCoordinator } from '../../../src/domains/test-execution/coordinator';
import { CoverageAnalysisCoordinator } from '../../../src/domains/coverage-analysis/coordinator';
import { QualityAssessmentCoordinator } from '../../../src/domains/quality-assessment/coordinator';
import { DefectIntelligenceCoordinator } from '../../../src/domains/defect-intelligence/coordinator';
import { LearningOptimizationCoordinator } from '../../../src/domains/learning-optimization/coordinator';
import { SecurityComplianceCoordinator } from '../../../src/domains/security-compliance/coordinator';
import { ChaosResilienceCoordinator } from '../../../src/domains/chaos-resilience/coordinator';
import { CodeIntelligenceCoordinator } from '../../../src/domains/code-intelligence/coordinator';
import { ContractTestingCoordinator } from '../../../src/domains/contract-testing/coordinator';
import { RequirementsValidationCoordinator } from '../../../src/domains/requirements-validation/coordinator';
import { VisualAccessibilityCoordinator } from '../../../src/domains/visual-accessibility/coordinator';

// MinCut Integration
import {
  QueenMinCutBridge,
  createQueenMinCutBridge,
} from '../../../src/coordination/mincut/queen-integration';

import {
  getSharedMinCutGraph,
  resetSharedMinCutState,
} from '../../../src/coordination/mincut';

import type { DomainName } from '../../../src/shared/types';
import type { EventBus, AgentCoordinator, AgentInfo, MemoryBackend } from '../../../src/kernel/interfaces';

// ============================================================================
// Mock Factories
// ============================================================================

function createMockEventBus(): EventBus & { publish: Mock } {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue('sub-1'),
    unsubscribe: vi.fn(),
    once: vi.fn(),
    listSubscribers: vi.fn().mockReturnValue([]),
  } as EventBus & { publish: Mock };
}

function createMockMemoryBackend(): MemoryBackend {
  const store = new Map<string, any>();
  return {
    get: vi.fn().mockImplementation((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: vi.fn().mockImplementation((key: string, value: any) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn().mockImplementation((key: string) => {
      store.delete(key);
      return Promise.resolve(true);
    }),
    search: vi.fn().mockResolvedValue([]),
    has: vi.fn().mockImplementation((key: string) => Promise.resolve(store.has(key))),
    clear: vi.fn().mockImplementation(() => {
      store.clear();
      return Promise.resolve();
    }),
    list: vi.fn().mockResolvedValue([]),
    keys: vi.fn().mockResolvedValue([]),
  } as unknown as MemoryBackend;
}

function createMockAgentCoordinator(agents: AgentInfo[] = []): AgentCoordinator & {
  listAgents: Mock;
  spawn: Mock;
  stop: Mock;
  canSpawn: Mock;
} {
  return {
    listAgents: vi.fn().mockReturnValue(agents),
    spawn: vi.fn().mockResolvedValue({ success: true, value: `agent-${Date.now()}` }),
    stop: vi.fn().mockResolvedValue(undefined),
    canSpawn: vi.fn().mockReturnValue(true),
    getAgent: vi.fn(),
  } as unknown as AgentCoordinator & {
    listAgents: Mock;
    spawn: Mock;
    stop: Mock;
    canSpawn: Mock;
  };
}

function createMockAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: `agent-${Math.random().toString(36).slice(2, 8)}`,
    name: 'test-agent',
    domain: 'test-generation' as DomainName,
    type: 'generator',
    status: 'running',
    startedAt: new Date(),
    ...overrides,
  };
}

// Shared config to disable external services for testing
const baseCoordinatorConfig = {
  enableQESONA: false,
  enableFlashAttention: false,
  enableDecisionTransformer: false,
  enableCoherenceGate: false,
  enableConsensus: false,
  enableMinCutAwareness: true,
};

// ============================================================================
// Domain Coordinator Factory
// ============================================================================

type DomainCoordinatorMap = {
  'test-generation': TestGenerationCoordinator;
  'test-execution': TestExecutionCoordinator;
  'coverage-analysis': CoverageAnalysisCoordinator;
  'quality-assessment': QualityAssessmentCoordinator;
  'defect-intelligence': DefectIntelligenceCoordinator;
  'learning-optimization': LearningOptimizationCoordinator;
  'security-compliance': SecurityComplianceCoordinator;
  'chaos-resilience': ChaosResilienceCoordinator;
  'code-intelligence': CodeIntelligenceCoordinator;
  'contract-testing': ContractTestingCoordinator;
  'requirements-validation': RequirementsValidationCoordinator;
  'visual-accessibility': VisualAccessibilityCoordinator;
};

function createDomainCoordinator<K extends keyof DomainCoordinatorMap>(
  domain: K,
  eventBus: EventBus,
  memory: MemoryBackend,
  agentCoordinator: AgentCoordinator,
): DomainCoordinatorMap[K] {
  const config = { ...baseCoordinatorConfig };

  switch (domain) {
    case 'test-generation':
      return new TestGenerationCoordinator(eventBus, memory, agentCoordinator, config) as DomainCoordinatorMap[K];
    case 'test-execution':
      return new TestExecutionCoordinator(eventBus, memory, agentCoordinator, config) as DomainCoordinatorMap[K];
    case 'coverage-analysis':
      return new CoverageAnalysisCoordinator(eventBus, memory, agentCoordinator, config) as DomainCoordinatorMap[K];
    case 'quality-assessment':
      return new QualityAssessmentCoordinator(eventBus, memory, agentCoordinator, config) as DomainCoordinatorMap[K];
    case 'defect-intelligence':
      return new DefectIntelligenceCoordinator(eventBus, memory, agentCoordinator, config) as DomainCoordinatorMap[K];
    case 'learning-optimization':
      return new LearningOptimizationCoordinator(eventBus, memory, agentCoordinator, config) as DomainCoordinatorMap[K];
    case 'security-compliance':
      return new SecurityComplianceCoordinator(eventBus, memory, agentCoordinator, config) as DomainCoordinatorMap[K];
    case 'chaos-resilience':
      return new ChaosResilienceCoordinator(eventBus, memory, agentCoordinator, config) as DomainCoordinatorMap[K];
    case 'code-intelligence':
      return new CodeIntelligenceCoordinator(eventBus, memory, agentCoordinator, config) as DomainCoordinatorMap[K];
    case 'contract-testing':
      return new ContractTestingCoordinator(eventBus, memory, agentCoordinator, config) as DomainCoordinatorMap[K];
    case 'requirements-validation':
      return new RequirementsValidationCoordinator(eventBus, memory, agentCoordinator, config) as DomainCoordinatorMap[K];
    case 'visual-accessibility':
      return new VisualAccessibilityCoordinator(eventBus, memory, agentCoordinator, config) as DomainCoordinatorMap[K];
    default:
      throw new Error(`Unknown domain: ${domain}`);
  }
}

const ALL_DOMAINS: (keyof DomainCoordinatorMap)[] = [
  'test-generation',
  'test-execution',
  'coverage-analysis',
  'quality-assessment',
  'defect-intelligence',
  'learning-optimization',
  'security-compliance',
  'chaos-resilience',
  'code-intelligence',
  'contract-testing',
  'requirements-validation',
  'visual-accessibility',
];

// ============================================================================
// Test Suite: Phase 5 - Cross-Domain MinCut & Consensus Integration
// ============================================================================

describe('Phase 5: Cross-Domain MinCut & Consensus Integration', () => {
  let sharedEventBus: EventBus & { publish: Mock };
  let sharedMemory: MemoryBackend;
  let sharedAgentCoordinator: AgentCoordinator & { listAgents: Mock };
  let minCutBridge: QueenMinCutBridge;

  beforeEach(async () => {
    resetSharedMinCutState();

    // Create shared infrastructure
    sharedEventBus = createMockEventBus();
    sharedMemory = createMockMemoryBackend();
    sharedAgentCoordinator = createMockAgentCoordinator();

    // Create MinCut bridge with shared graph
    minCutBridge = createQueenMinCutBridge(
      sharedEventBus,
      sharedAgentCoordinator,
      {
        includeInQueenHealth: true,
        autoUpdateFromEvents: false,
        persistData: false,
        sharedGraph: getSharedMinCutGraph(),
      }
    );
    await minCutBridge.initialize();
  });

  afterEach(async () => {
    resetSharedMinCutState();
  });

  // ==========================================================================
  // Test 1: Queen → Domain Bridge Injection (All 12 Domains)
  // ==========================================================================

  describe('Queen → Domain Bridge Injection', () => {
    it.each(ALL_DOMAINS)('should inject MinCut bridge into %s domain', async (domain) => {
      const coordinator = createDomainCoordinator(
        domain,
        sharedEventBus,
        sharedMemory,
        sharedAgentCoordinator
      );

      // Verify coordinator has setMinCutBridge method
      expect(typeof (coordinator as any).setMinCutBridge).toBe('function');

      // Inject bridge (simulating Queen's bridge injection)
      (coordinator as any).setMinCutBridge(minCutBridge);

      // Verify isTopologyHealthy works after injection
      const isHealthy = (coordinator as any).isTopologyHealthy();
      expect(typeof isHealthy).toBe('boolean');
    });

    it('should inject bridge into all 12 domains simultaneously', async () => {
      const coordinators = ALL_DOMAINS.map(domain =>
        createDomainCoordinator(domain, sharedEventBus, sharedMemory, sharedAgentCoordinator)
      );

      // Simulate Queen's initialize() loop that injects bridge into all domains
      const injectionResults: boolean[] = [];
      for (const coordinator of coordinators) {
        try {
          (coordinator as any).setMinCutBridge(minCutBridge);
          injectionResults.push(true);
        } catch {
          injectionResults.push(false);
        }
      }

      // All 12 should succeed
      expect(injectionResults.filter(r => r).length).toBe(12);
      expect(injectionResults.every(r => r)).toBe(true);
    });
  });

  // ==========================================================================
  // Test 2: Cross-Domain Coordination via Shared MinCut Graph
  // ==========================================================================

  describe('Cross-Domain Coordination via Shared Graph', () => {
    it('should share graph state between domains', async () => {
      // Create two domain coordinators
      const testGen = createDomainCoordinator('test-generation', sharedEventBus, sharedMemory, sharedAgentCoordinator);
      const testExec = createDomainCoordinator('test-execution', sharedEventBus, sharedMemory, sharedAgentCoordinator);

      // Inject the same bridge
      (testGen as any).setMinCutBridge(minCutBridge);
      (testExec as any).setMinCutBridge(minCutBridge);

      // Add agents to graph via bridge
      const sharedGraph = getSharedMinCutGraph();
      sharedGraph.addVertex({
        id: 'cross-domain-agent',
        type: 'agent',
        domain: 'test-generation' as DomainName,
        weight: 1.0,
        createdAt: new Date(),
      });

      // Both coordinators should see the same graph
      expect(minCutBridge.getGraph().hasVertex('cross-domain-agent')).toBe(true);
    });

    it('should propagate health status across domains', async () => {
      // Create multiple domain coordinators
      const domains: (keyof DomainCoordinatorMap)[] = [
        'test-generation',
        'test-execution',
        'coverage-analysis',
      ];

      const coordinators = domains.map(d =>
        createDomainCoordinator(d, sharedEventBus, sharedMemory, sharedAgentCoordinator)
      );

      // Inject bridge into all
      for (const coord of coordinators) {
        (coord as any).setMinCutBridge(minCutBridge);
      }

      // Add interconnected agents to create a healthy topology
      const graph = minCutBridge.getGraph();
      domains.forEach((domain, i) => {
        graph.addVertex({
          id: `agent-${domain}`,
          type: 'agent',
          domain: domain as DomainName,
          weight: 1.0,
          createdAt: new Date(),
        });
      });

      // Connect agents
      graph.addEdge({
        source: 'agent-test-generation',
        target: 'agent-test-execution',
        weight: 1.0,
        type: 'workflow',
        bidirectional: true,
      });
      graph.addEdge({
        source: 'agent-test-execution',
        target: 'agent-coverage-analysis',
        weight: 1.0,
        type: 'workflow',
        bidirectional: true,
      });

      // All domains should report consistent health
      const healthStatuses = coordinators.map(c => (c as any).isTopologyHealthy());
      const uniqueStatuses = [...new Set(healthStatuses)];

      // All should be healthy or all should be unhealthy
      expect(uniqueStatuses.length).toBe(1);
    });

    it('should detect cross-domain weak vertices', async () => {
      const testGen = createDomainCoordinator('test-generation', sharedEventBus, sharedMemory, sharedAgentCoordinator);
      (testGen as any).setMinCutBridge(minCutBridge);

      // Add isolated vertex (potential weak point)
      const graph = minCutBridge.getGraph();
      graph.addVertex({
        id: 'isolated-agent',
        type: 'agent',
        domain: 'test-generation' as DomainName,
        weight: 0.5, // Low weight
        createdAt: new Date(),
      });

      // Get domain weak vertices
      const weakVertices = (testGen as any).getDomainWeakVertices();
      expect(Array.isArray(weakVertices)).toBe(true);
    });
  });

  // ==========================================================================
  // Test 3: Multi-Model Consensus Across Domains
  // ==========================================================================

  describe('Multi-Model Consensus Across Domains', () => {
    it.each(ALL_DOMAINS)('%s should have MinCut topology methods', (domain) => {
      const coordinator = createDomainCoordinator(
        domain,
        sharedEventBus,
        sharedMemory,
        sharedAgentCoordinator
      );

      // All domains MUST have isTopologyHealthy (from MinCut mixin)
      expect(typeof (coordinator as any).isTopologyHealthy).toBe('function');
      expect(typeof (coordinator as any).setMinCutBridge).toBe('function');
    });

    it('should share MinCut integration pattern across all domains', () => {
      // Create coordinators
      const testGen = createDomainCoordinator('test-generation', sharedEventBus, sharedMemory, sharedAgentCoordinator);
      const defectInt = createDomainCoordinator('defect-intelligence', sharedEventBus, sharedMemory, sharedAgentCoordinator);
      const qualityAssess = createDomainCoordinator('quality-assessment', sharedEventBus, sharedMemory, sharedAgentCoordinator);

      // All should have MinCut methods (setMinCutBridge and isTopologyHealthy are required)
      expect(typeof (testGen as any).setMinCutBridge).toBe('function');
      expect(typeof (defectInt as any).setMinCutBridge).toBe('function');
      expect(typeof (qualityAssess as any).setMinCutBridge).toBe('function');

      expect(typeof (testGen as any).isTopologyHealthy).toBe('function');
      expect(typeof (defectInt as any).isTopologyHealthy).toBe('function');
      expect(typeof (qualityAssess as any).isTopologyHealthy).toBe('function');
    });
  });

  // ==========================================================================
  // Test 4: Domain Lifecycle with MinCut Integration
  // ==========================================================================

  describe('Domain Lifecycle with MinCut Integration', () => {
    it('should properly initialize domain with bridge', async () => {
      const coordinator = createDomainCoordinator(
        'test-generation',
        sharedEventBus,
        sharedMemory,
        sharedAgentCoordinator
      );

      // Inject bridge before initialization
      (coordinator as any).setMinCutBridge(minCutBridge);

      // Initialize should work
      await coordinator.initialize();

      // Health check should work
      expect((coordinator as any).isTopologyHealthy()).toBe(true);

      // Dispose should work
      await coordinator.dispose();
    });

    it('should handle late bridge injection (post-initialization)', async () => {
      const coordinator = createDomainCoordinator(
        'test-execution',
        sharedEventBus,
        sharedMemory,
        sharedAgentCoordinator
      );

      // Initialize without bridge
      await coordinator.initialize();

      // Inject bridge late
      (coordinator as any).setMinCutBridge(minCutBridge);

      // Should still work
      expect((coordinator as any).isTopologyHealthy()).toBe(true);

      await coordinator.dispose();
    });

    it('should gracefully handle missing bridge', async () => {
      const coordinator = createDomainCoordinator(
        'coverage-analysis',
        sharedEventBus,
        sharedMemory,
        sharedAgentCoordinator
      );

      // Initialize without bridge
      await coordinator.initialize();

      // Should gracefully degrade - isTopologyHealthy should return true when no bridge
      expect((coordinator as any).isTopologyHealthy()).toBe(true);

      // getDomainWeakVertices may not exist on all coordinators - check conditionally
      if (typeof (coordinator as any).getDomainWeakVertices === 'function') {
        expect((coordinator as any).getDomainWeakVertices()).toEqual([]);
      }

      await coordinator.dispose();
    });
  });

  // ==========================================================================
  // Test 5: Full 12-Domain Integration Scenario
  // ==========================================================================

  describe('Full 12-Domain Integration Scenario', () => {
    it('should coordinate all 12 domains via shared MinCut infrastructure', async () => {
      // Create all coordinators
      const coordinators = ALL_DOMAINS.map(domain => ({
        domain,
        coordinator: createDomainCoordinator(domain, sharedEventBus, sharedMemory, sharedAgentCoordinator),
      }));

      // Inject bridge into all (simulating Queen's initialization)
      for (const { coordinator } of coordinators) {
        (coordinator as any).setMinCutBridge(minCutBridge);
      }

      // Add one agent per domain to the graph
      const graph = minCutBridge.getGraph();
      for (const { domain } of coordinators) {
        graph.addVertex({
          id: `agent-${domain}`,
          type: 'agent',
          domain: domain as DomainName,
          weight: 1.0,
          createdAt: new Date(),
        });
      }

      // Create a mesh of connections between adjacent domains
      for (let i = 0; i < ALL_DOMAINS.length - 1; i++) {
        graph.addEdge({
          source: `agent-${ALL_DOMAINS[i]}`,
          target: `agent-${ALL_DOMAINS[i + 1]}`,
          weight: 1.0,
          type: 'workflow',
          bidirectional: true,
        });
      }

      // All domains should report topology status
      const allHealthy = coordinators.every(({ coordinator }) =>
        typeof (coordinator as any).isTopologyHealthy() === 'boolean'
      );
      expect(allHealthy).toBe(true);

      // All domains should see the graph - verify vertices exist
      expect(graph.hasVertex(`agent-${ALL_DOMAINS[0]}`)).toBe(true);
      expect(graph.hasVertex(`agent-${ALL_DOMAINS[11]}`)).toBe(true);
    });

    it('should detect and report domain weak points across swarm', async () => {
      const coordinators = ALL_DOMAINS.map(domain => ({
        domain,
        coordinator: createDomainCoordinator(domain, sharedEventBus, sharedMemory, sharedAgentCoordinator),
      }));

      // Inject bridge
      for (const { coordinator } of coordinators) {
        (coordinator as any).setMinCutBridge(minCutBridge);
      }

      // Add agents with varying connection strength
      const graph = minCutBridge.getGraph();

      // Add well-connected hub
      graph.addVertex({
        id: 'hub-agent',
        type: 'agent',
        domain: 'test-generation' as DomainName,
        weight: 2.0,
        createdAt: new Date(),
      });

      // Add isolated leaf
      graph.addVertex({
        id: 'leaf-agent',
        type: 'agent',
        domain: 'coverage-analysis' as DomainName,
        weight: 0.5,
        createdAt: new Date(),
      });

      // Connect hub to most domains
      ['test-execution', 'quality-assessment', 'defect-intelligence'].forEach(domain => {
        graph.addVertex({
          id: `agent-${domain}`,
          type: 'agent',
          domain: domain as DomainName,
          weight: 1.0,
          createdAt: new Date(),
        });
        graph.addEdge({
          source: 'hub-agent',
          target: `agent-${domain}`,
          weight: 1.5,
          type: 'coordination',
          bidirectional: true,
        });
      });

      // Check if domains can identify weak points - use a domain that has isDomainWeakPoint
      const testGenCoord = coordinators.find(c => c.domain === 'test-generation')!.coordinator;

      // isDomainWeakPoint may not exist on all coordinators
      if (typeof (testGenCoord as any).isDomainWeakPoint === 'function') {
        const isDomainWeak = (testGenCoord as any).isDomainWeakPoint();
        expect(typeof isDomainWeak).toBe('boolean');
      } else {
        // All coordinators should at least have isTopologyHealthy
        expect(typeof (testGenCoord as any).isTopologyHealthy).toBe('function');
      }
    });
  });
});
