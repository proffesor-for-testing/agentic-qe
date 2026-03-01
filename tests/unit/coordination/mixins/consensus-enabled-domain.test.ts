/**
 * Agentic QE v3 - Consensus Enabled Domain Mixin Tests
 * CONSENSUS-MIXIN-001: Unit tests for the consensus mixin
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ConsensusEnabledMixin,
  createConsensusEnabledMixin,
  withConsensusEnabled,
  IConsensusEnabledDomain,
  ConsensusEnabledConfig,
  DEFAULT_CONSENSUS_ENABLED_CONFIG,
} from '../../../../src/coordination/mixins/consensus-enabled-domain';
import {
  DomainFinding,
  createDomainFinding,
  isHighStakesFinding,
  generateFindingId,
  FindingSeverity,
} from '../../../../src/coordination/consensus/domain-findings';
import {
  ConsensusResult,
  ConsensusStats,
  ModelVote,
} from '../../../../src/coordination/consensus';

// ============================================================================
// Mocks
// ============================================================================

// Mock the consensus module
vi.mock('../../../../src/coordination/consensus', async () => {
  const actual = await vi.importActual('../../../../src/coordination/consensus');

  return {
    ...actual,
    registerProvidersFromEnv: vi.fn(() => ({
      getAll: vi.fn(() => [
        {
          id: 'mock-claude',
          name: 'Mock Claude',
          type: 'claude',
          complete: vi.fn(),
          isAvailable: vi.fn().mockResolvedValue(true),
          healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
          getCostPerToken: vi.fn(() => ({ input: 0.01, output: 0.03 })),
          getSupportedModels: vi.fn(() => ['claude-3-opus']),
          dispose: vi.fn(),
        },
        {
          id: 'mock-openai',
          name: 'Mock OpenAI',
          type: 'openai',
          complete: vi.fn(),
          isAvailable: vi.fn().mockResolvedValue(true),
          healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
          getCostPerToken: vi.fn(() => ({ input: 0.01, output: 0.03 })),
          getSupportedModels: vi.fn(() => ['gpt-4']),
          dispose: vi.fn(),
        },
      ]),
    })),
    createConsensusEngine: vi.fn(() => ({
      verify: vi.fn().mockResolvedValue({
        success: true,
        value: createMockConsensusResult('verified'),
      }),
      verifyBatch: vi.fn().mockResolvedValue({
        success: true,
        value: [createMockConsensusResult('verified')],
      }),
      getStats: vi.fn(() => createMockStats()),
      dispose: vi.fn().mockResolvedValue(undefined),
      getThreshold: vi.fn(() => 0.67),
      setThreshold: vi.fn(),
      setModels: vi.fn(),
      getModels: vi.fn(() => ['mock-claude', 'mock-openai']),
      addModel: vi.fn(),
      removeModel: vi.fn(),
      getConfig: vi.fn(() => ({})),
      updateConfig: vi.fn(),
      resetStats: vi.fn(),
      requiresVerification: vi.fn(() => true),
    })),
  };
});

// Helper to create mock consensus result
function createMockConsensusResult(
  verdict: 'verified' | 'rejected' | 'disputed' = 'verified'
): ConsensusResult {
  return {
    verdict,
    finding: {
      id: 'test-finding-1',
      type: 'test-vulnerability',
      category: 'other',
      severity: 'high',
      description: 'Test finding',
      location: { file: 'test.ts' },
      evidence: [],
      detectedAt: new Date(),
      detectedBy: 'test-scanner',
    },
    confidence: 0.85,
    votes: [
      createMockVote('mock-claude', true),
      createMockVote('mock-openai', true),
    ],
    agreementRatio: 1.0,
    requiresHumanReview: false,
    reasoning: 'Models agree this is a valid finding',
    totalExecutionTime: 1500,
    completedAt: new Date(),
    correlationId: 'test-correlation-id',
  };
}

function createMockVote(modelId: string, agrees: boolean): ModelVote {
  return {
    modelId,
    agrees,
    assessment: agrees ? 'confirmed' : 'rejected',
    confidence: 0.85,
    reasoning: 'Test reasoning',
    executionTime: 750,
    votedAt: new Date(),
  };
}

function createMockStats(): ConsensusStats {
  return {
    totalVerifications: 10,
    byVerdict: {
      verified: 7,
      rejected: 2,
      disputed: 1,
      insufficient: 0,
      error: 0,
    },
    averageConfidence: 0.82,
    averageExecutionTime: 1200,
    totalCost: 0.50,
    humanReviewCount: 1,
    modelStats: {
      'mock-claude': {
        votes: 10,
        agreements: 8,
        averageConfidence: 0.85,
        averageExecutionTime: 800,
        errors: 0,
      },
      'mock-openai': {
        votes: 10,
        agreements: 9,
        averageConfidence: 0.80,
        averageExecutionTime: 600,
        errors: 0,
      },
    },
  };
}

// ============================================================================
// Test Data
// ============================================================================

function createTestFinding<T>(
  overrides: Partial<DomainFinding<T>> = {}
): DomainFinding<T> {
  return {
    id: generateFindingId('test'),
    type: 'test-vulnerability',
    confidence: 0.85,
    description: 'Test finding description',
    payload: {} as T,
    detectedAt: new Date(),
    detectedBy: 'test-scanner',
    severity: 'high' as FindingSeverity,
    ...overrides,
  };
}

// ============================================================================
// Tests: Domain Finding Types
// ============================================================================

describe('Domain Finding Types', () => {
  describe('createDomainFinding', () => {
    it('should create a domain finding with valid parameters', () => {
      const finding = createDomainFinding({
        id: 'test-1',
        type: 'vulnerability',
        confidence: 0.9,
        description: 'SQL injection detected',
        payload: { location: { file: 'api.ts', line: 42 } },
        detectedBy: 'security-scanner',
        severity: 'critical',
      });

      expect(finding.id).toBe('test-1');
      expect(finding.type).toBe('vulnerability');
      expect(finding.confidence).toBe(0.9);
      expect(finding.severity).toBe('critical');
      expect(finding.detectedAt).toBeInstanceOf(Date);
    });

    it('should throw error for invalid confidence', () => {
      expect(() =>
        createDomainFinding({
          id: 'test-1',
          type: 'vulnerability',
          confidence: 1.5, // Invalid
          description: 'Test',
          payload: {},
          detectedBy: 'scanner',
        })
      ).toThrow('Invalid confidence');
    });

    it('should throw error for negative confidence', () => {
      expect(() =>
        createDomainFinding({
          id: 'test-1',
          type: 'vulnerability',
          confidence: -0.1, // Invalid
          description: 'Test',
          payload: {},
          detectedBy: 'scanner',
        })
      ).toThrow('Invalid confidence');
    });
  });

  describe('isHighStakesFinding', () => {
    it('should return true for critical severity with high confidence', () => {
      const finding = createTestFinding({
        severity: 'critical',
        confidence: 0.8,
      });

      expect(isHighStakesFinding(finding)).toBe(true);
    });

    it('should return true for high severity with high confidence', () => {
      const finding = createTestFinding({
        severity: 'high',
        confidence: 0.75,
      });

      expect(isHighStakesFinding(finding)).toBe(true);
    });

    it('should return false for low severity', () => {
      const finding = createTestFinding({
        severity: 'low',
        confidence: 0.8,
      });

      expect(isHighStakesFinding(finding)).toBe(false);
    });

    it('should return true for very high confidence without severity', () => {
      const finding = createTestFinding({
        severity: undefined,
        confidence: 0.95,
      });

      expect(isHighStakesFinding(finding)).toBe(true);
    });

    it('should respect custom thresholds', () => {
      const finding = createTestFinding({
        severity: 'medium',
        confidence: 0.6,
      });

      // With custom thresholds including medium
      expect(
        isHighStakesFinding(finding, ['medium'], 0.5)
      ).toBe(true);
    });
  });

  describe('generateFindingId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateFindingId();
      const id2 = generateFindingId();

      expect(id1).not.toBe(id2);
    });

    it('should use custom prefix', () => {
      const id = generateFindingId('vuln');

      expect(id.startsWith('vuln-')).toBe(true);
    });
  });
});

// ============================================================================
// Tests: Default Configuration
// ============================================================================

describe('DEFAULT_CONSENSUS_ENABLED_CONFIG', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_CONSENSUS_ENABLED_CONFIG.enableConsensus).toBe(true);
    expect(DEFAULT_CONSENSUS_ENABLED_CONFIG.consensusThreshold).toBe(0.7);
    expect(DEFAULT_CONSENSUS_ENABLED_CONFIG.strategy).toBe('weighted');
    expect(DEFAULT_CONSENSUS_ENABLED_CONFIG.minModels).toBe(2);
    expect(DEFAULT_CONSENSUS_ENABLED_CONFIG.modelTimeout).toBe(60000);
    expect(DEFAULT_CONSENSUS_ENABLED_CONFIG.verifySeverities).toContain('critical');
    expect(DEFAULT_CONSENSUS_ENABLED_CONFIG.verifySeverities).toContain('high');
  });
});

// ============================================================================
// Tests: ConsensusEnabledMixin
// ============================================================================

describe('ConsensusEnabledMixin', () => {
  let mixin: ConsensusEnabledMixin;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (mixin) {
      await (mixin as any).disposeConsensus();
    }
  });

  describe('constructor', () => {
    it('should use default config when none provided', () => {
      mixin = new ConsensusEnabledMixin();

      expect((mixin as any).consensusConfig.enableConsensus).toBe(true);
      expect((mixin as any).consensusConfig.strategy).toBe('weighted');
    });

    it('should merge custom config with defaults', () => {
      mixin = new ConsensusEnabledMixin({
        consensusThreshold: 0.8,
        strategy: 'unanimous',
      });

      expect((mixin as any).consensusConfig.consensusThreshold).toBe(0.8);
      expect((mixin as any).consensusConfig.strategy).toBe('unanimous');
      expect((mixin as any).consensusConfig.enableConsensus).toBe(true); // Default
    });
  });

  describe('initializeConsensus', () => {
    it('should initialize consensus engine with providers', async () => {
      mixin = new ConsensusEnabledMixin();

      await (mixin as any).initializeConsensus();

      expect((mixin as any).consensusInitialized).toBe(true);
      expect((mixin as any).consensusEngine).toBeDefined();
    });

    it('should skip initialization when consensus disabled', async () => {
      mixin = new ConsensusEnabledMixin({ enableConsensus: false });

      await (mixin as any).initializeConsensus();

      expect((mixin as any).consensusInitialized).toBe(false);
      expect((mixin as any).consensusEngine).toBeUndefined();
    });
  });

  describe('disposeConsensus', () => {
    it('should dispose consensus engine', async () => {
      mixin = new ConsensusEnabledMixin();
      await (mixin as any).initializeConsensus();

      await (mixin as any).disposeConsensus();

      expect((mixin as any).consensusInitialized).toBe(false);
      expect((mixin as any).consensusEngine).toBeUndefined();
    });

    it('should handle dispose when not initialized', async () => {
      mixin = new ConsensusEnabledMixin();

      // Should not throw
      await expect((mixin as any).disposeConsensus()).resolves.toBeUndefined();
    });
  });

  describe('requiresConsensus', () => {
    beforeEach(() => {
      mixin = new ConsensusEnabledMixin({
        consensusThreshold: 0.7,
        verifyFindingTypes: ['vulnerability', 'defect'],
        verifySeverities: ['critical', 'high'],
      });
    });

    it('should return true for high severity finding', () => {
      const finding = createTestFinding({
        type: 'vulnerability',
        severity: 'critical',
        confidence: 0.5,
      });

      expect(mixin.requiresConsensus(finding)).toBe(true);
    });

    it('should return true for high confidence finding', () => {
      const finding = createTestFinding({
        type: 'vulnerability',
        severity: 'low',
        confidence: 0.85,
      });

      expect(mixin.requiresConsensus(finding)).toBe(true);
    });

    it('should return false for low confidence, low severity', () => {
      const finding = createTestFinding({
        type: 'vulnerability',
        severity: 'low',
        confidence: 0.5,
      });

      expect(mixin.requiresConsensus(finding)).toBe(false);
    });

    it('should return false for non-matching finding type', () => {
      const finding = createTestFinding({
        type: 'info-message', // Not in verifyFindingTypes
        severity: 'critical',
        confidence: 0.9,
      });

      expect(mixin.requiresConsensus(finding)).toBe(false);
    });

    it('should return true when verifyFindingTypes is empty (match all)', () => {
      mixin = new ConsensusEnabledMixin({
        verifyFindingTypes: [],
        verifySeverities: ['critical'],
      });

      const finding = createTestFinding({
        type: 'any-type',
        severity: 'critical',
      });

      expect(mixin.requiresConsensus(finding)).toBe(true);
    });

    it('should return false when consensus disabled', () => {
      mixin = new ConsensusEnabledMixin({ enableConsensus: false });

      const finding = createTestFinding({
        severity: 'critical',
        confidence: 0.95,
      });

      expect(mixin.requiresConsensus(finding)).toBe(false);
    });
  });

  describe('verifyFinding', () => {
    beforeEach(async () => {
      mixin = new ConsensusEnabledMixin({
        verifyFindingTypes: ['vulnerability'],
        verifySeverities: ['critical', 'high'],
      });
      await (mixin as any).initializeConsensus();
    });

    it('should verify finding and return result', async () => {
      const finding = createTestFinding({
        type: 'vulnerability',
        severity: 'critical',
      });

      const result = await mixin.verifyFinding(finding);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.verdict).toBe('verified');
        expect(result.value.confidence).toBe(0.85);
      }
    });

    it('should return error when not initialized', async () => {
      const uninitializedMixin = new ConsensusEnabledMixin();

      const finding = createTestFinding();
      const result = await uninitializedMixin.verifyFinding(finding);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('not initialized');
      }
    });

    it('should return error when finding does not require consensus', async () => {
      mixin = new ConsensusEnabledMixin({
        verifyFindingTypes: ['vulnerability'],
        verifySeverities: ['critical'],
        consensusThreshold: 0.99,
      });
      await (mixin as any).initializeConsensus();

      const finding = createTestFinding({
        type: 'other-type', // Not in verifyFindingTypes
        severity: 'low',
        confidence: 0.5,
      });

      const result = await mixin.verifyFinding(finding);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('does not require consensus');
      }
    });
  });

  describe('verifyFindings', () => {
    beforeEach(async () => {
      mixin = new ConsensusEnabledMixin({
        verifyFindingTypes: [],
        verifySeverities: ['critical', 'high'],
      });
      await (mixin as any).initializeConsensus();
    });

    it('should verify multiple findings in batch', async () => {
      const findings = [
        createTestFinding({ id: 'f1', severity: 'critical' }),
        createTestFinding({ id: 'f2', severity: 'high' }),
      ];

      const result = await mixin.verifyFindings(findings);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBeGreaterThan(0);
      }
    });

    it('should return empty array when no findings require consensus', async () => {
      const findings = [
        createTestFinding({
          id: 'f1',
          severity: 'low',
          confidence: 0.3,
        }),
      ];

      const result = await mixin.verifyFindings(findings);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveLength(0);
      }
    });

    it('should return error when not initialized', async () => {
      const uninitializedMixin = new ConsensusEnabledMixin();

      const result = await uninitializedMixin.verifyFindings([createTestFinding()]);

      expect(result.success).toBe(false);
    });
  });

  describe('getConsensusStats', () => {
    it('should return stats when initialized', async () => {
      mixin = new ConsensusEnabledMixin();
      await (mixin as any).initializeConsensus();

      const stats = mixin.getConsensusStats();

      expect(stats).toBeDefined();
      expect(stats?.totalVerifications).toBe(10);
      expect(stats?.byVerdict.verified).toBe(7);
    });

    it('should return undefined when not initialized', () => {
      mixin = new ConsensusEnabledMixin();

      const stats = mixin.getConsensusStats();

      expect(stats).toBeUndefined();
    });
  });
});

// ============================================================================
// Tests: Factory Function
// ============================================================================

describe('createConsensusEnabledMixin', () => {
  it('should create mixin with default config', () => {
    const mixin = createConsensusEnabledMixin();

    expect(mixin).toBeInstanceOf(ConsensusEnabledMixin);
    expect((mixin as any).consensusConfig.enableConsensus).toBe(true);
  });

  it('should create mixin with custom config', () => {
    const mixin = createConsensusEnabledMixin({
      strategy: 'unanimous',
      minModels: 3,
    });

    expect((mixin as any).consensusConfig.strategy).toBe('unanimous');
    expect((mixin as any).consensusConfig.minModels).toBe(3);
  });
});

// ============================================================================
// Tests: withConsensusEnabled Mixin Helper
// ============================================================================

describe('withConsensusEnabled', () => {
  class BaseCoordinator {
    public name = 'base';

    getName(): string {
      return this.name;
    }
  }

  it('should create mixed class with consensus capabilities', () => {
    const MixedClass = withConsensusEnabled(BaseCoordinator, {
      strategy: 'majority',
    });

    const instance = new MixedClass();

    // Should have base class methods
    expect(instance.getName()).toBe('base');

    // Should have consensus methods
    expect(instance.requiresConsensus).toBeDefined();
    expect(instance.verifyFinding).toBeDefined();
    expect(instance.verifyFindings).toBeDefined();
    expect(instance.getConsensusStats).toBeDefined();
  });

  it('should respect consensus config', () => {
    const MixedClass = withConsensusEnabled(BaseCoordinator, {
      verifySeverities: ['critical'],
      consensusThreshold: 0.9,
    });

    const instance = new MixedClass();

    // Should use config for requiresConsensus
    const lowSeverityFinding = createTestFinding({
      severity: 'low',
      confidence: 0.5,
    });

    expect(instance.requiresConsensus(lowSeverityFinding)).toBe(false);
  });
});

// ============================================================================
// Tests: Category Inference
// ============================================================================

describe('Category Inference', () => {
  it('should infer injection category', async () => {
    const mixin = new ConsensusEnabledMixin({
      verifyFindingTypes: [],
      verifySeverities: ['critical'],
    });
    await (mixin as any).initializeConsensus();

    const finding = createTestFinding({
      type: 'sql-injection',
      severity: 'critical',
    });

    // Verify the finding - the category inference happens internally
    const result = await mixin.verifyFinding(finding);
    expect(result.success).toBe(true);
  });

  it('should infer cryptography category for hardcoded secrets', async () => {
    const mixin = new ConsensusEnabledMixin({
      verifyFindingTypes: [],
      verifySeverities: ['high'],
    });
    await (mixin as any).initializeConsensus();

    const finding = createTestFinding({
      type: 'hardcoded-secret-key',
      severity: 'high',
    });

    const result = await mixin.verifyFinding(finding);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Tests: Integration Patterns
// ============================================================================

describe('Integration Patterns', () => {
  it('should work as a domain coordinator base class', async () => {
    class TestDomainCoordinator extends ConsensusEnabledMixin {
      private initialized = false;

      constructor() {
        super({
          enableConsensus: true,
          verifyFindingTypes: ['test-vulnerability'],
          verifySeverities: ['critical', 'high'],
        });
      }

      async initialize(): Promise<void> {
        await this.initializeConsensus();
        this.initialized = true;
      }

      async dispose(): Promise<void> {
        await this.disposeConsensus();
        this.initialized = false;
      }

      async processFinding(finding: DomainFinding<unknown>): Promise<string> {
        if (this.requiresConsensus(finding)) {
          const result = await this.verifyFinding(finding);
          if (result.success && result.value.verdict === 'verified') {
            return 'verified';
          }
          return 'unverified';
        }
        return 'skipped';
      }
    }

    const coordinator = new TestDomainCoordinator();
    await coordinator.initialize();

    const criticalFinding = createTestFinding({
      type: 'test-vulnerability',
      severity: 'critical',
    });

    const result = await coordinator.processFinding(criticalFinding);
    expect(result).toBe('verified');

    const lowFinding = createTestFinding({
      type: 'test-vulnerability',
      severity: 'low',
      confidence: 0.3,
    });

    const lowResult = await coordinator.processFinding(lowFinding);
    expect(lowResult).toBe('skipped');

    await coordinator.dispose();
  });
});
