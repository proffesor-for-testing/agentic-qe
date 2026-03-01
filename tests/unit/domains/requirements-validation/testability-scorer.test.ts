/**
 * Agentic QE v3 - Testability Scorer Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestabilityScorerService } from '../../../../src/domains/requirements-validation/services/testability-scorer';
import { MemoryBackend, StoreOptions } from '../../../../src/kernel/interfaces';
import { Requirement, TestabilityScore } from '../../../../src/domains/requirements-validation/interfaces';

/**
 * Mock MemoryBackend for testing
 */
function createMockMemoryBackend(): MemoryBackend {
  const store = new Map<string, unknown>();

  return {
    async initialize(): Promise<void> {},
    async dispose(): Promise<void> {},
    async set<T>(key: string, value: T, _options?: StoreOptions): Promise<void> {
      store.set(key, value);
    },
    async get<T>(key: string): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },
    async delete(key: string): Promise<boolean> {
      return store.delete(key);
    },
    async has(key: string): Promise<boolean> {
      return store.has(key);
    },
    async search(_pattern: string, _limit?: number): Promise<string[]> {
      return [];
    },
    async vectorSearch(_embedding: number[], _k: number): Promise<{ key: string; score: number; metadata?: unknown }[]> {
      return [];
    },
    async storeVector(_key: string, _embedding: number[], _metadata?: unknown): Promise<void> {},
  };
}

/**
 * Helper to create a valid requirement for testing
 */
function createRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: 'REQ-001',
    title: 'Implement user login with 2FA within 500ms response time',
    description: 'As a user, I want to log in to the system with two-factor authentication so that my account is more secure. The system must respond within 500ms.',
    acceptanceCriteria: [
      'Given a registered user with 2FA enabled, when they enter valid credentials and OTP, then they should be logged in within 500ms',
      'Given invalid credentials, when submitted, then an error message should be displayed',
    ],
    type: 'user-story',
    priority: 'high',
    status: 'draft',
    ...overrides,
  };
}

describe('TestabilityScorerService', () => {
  let scorer: TestabilityScorerService;
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    mockMemory = createMockMemoryBackend();
    scorer = new TestabilityScorerService(mockMemory);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('scoreRequirement', () => {
    it('should return a score with all factors', async () => {
      const requirement = createRequirement();

      const result = await scorer.scoreRequirement(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.value).toBeGreaterThanOrEqual(0);
        expect(result.value.value).toBeLessThanOrEqual(100);
        expect(result.value.factors.length).toBe(6);

        const factorNames = result.value.factors.map((f) => f.name);
        expect(factorNames).toContain('Specificity');
        expect(factorNames).toContain('Measurability');
        expect(factorNames).toContain('Atomicity');
        expect(factorNames).toContain('Feasibility');
        expect(factorNames).toContain('Traceability');
        expect(factorNames).toContain('Independency');
      }
    });

    it('should score well-defined requirements highly', async () => {
      const requirement = createRequirement({
        description: 'The user login form must validate email format and respond within 200ms. Maximum 3 login attempts allowed per 5 minutes.',
        acceptanceCriteria: [
          '[AC-1] Given valid email and password, when user clicks login, then redirect to dashboard within 200ms',
          '[AC-2] Given invalid email format, when user enters email, then show validation error immediately',
          '[AC-3] Given 3 failed attempts, when user tries again, then block for 5 minutes',
        ],
      });

      const result = await scorer.scoreRequirement(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.value).toBeGreaterThan(60);
        expect(result.value.category).toMatch(/excellent|good/);
      }
    });

    it('should score ambiguous requirements lower than well-defined ones', async () => {
      const ambiguousRequirement = createRequirement({
        title: 'Make the system better',
        description: 'The system should be fast and user-friendly with good performance',
        acceptanceCriteria: ['It should work properly'],
      });

      const wellDefinedRequirement = createRequirement({
        title: 'Implement user authentication with 200ms response time',
        description: 'The user authentication API must respond within 200ms. Support 1000 concurrent users.',
        acceptanceCriteria: [
          '[AC-1] Given valid credentials, when user logs in, then response time is under 200ms',
        ],
      });

      const ambiguousResult = await scorer.scoreRequirement(ambiguousRequirement);
      const wellDefinedResult = await scorer.scoreRequirement(wellDefinedRequirement);

      expect(ambiguousResult.success).toBe(true);
      expect(wellDefinedResult.success).toBe(true);
      if (ambiguousResult.success && wellDefinedResult.success) {
        // Ambiguous should score lower than well-defined
        expect(ambiguousResult.value.value).toBeLessThan(wellDefinedResult.value.value);
        const specificityFactor = ambiguousResult.value.factors.find((f) => f.name === 'Specificity');
        expect(specificityFactor?.issues.length).toBeGreaterThan(0);
      }
    });

    it('should categorize scores correctly', async () => {
      // Test various score categories
      const poorRequirement = createRequirement({
        id: '',
        title: 'x',
        description: 'fast easy simple good etc several',
        acceptanceCriteria: [],
        type: 'technical',
      });

      const poorResult = await scorer.scoreRequirement(poorRequirement);
      expect(poorResult.success).toBe(true);
      if (poorResult.success) {
        // Score should be in lower categories due to missing ID, short title, ambiguous terms, no AC
        expect(['poor', 'fair', 'good']).toContain(poorResult.value.category);
        // At minimum, should have issues flagged
        const totalIssues = poorResult.value.factors.reduce((sum, f) => sum + f.issues.length, 0);
        expect(totalIssues).toBeGreaterThan(5);
      }
    });

    it('should detect ambiguous terms in specificity scoring', async () => {
      const requirement = createRequirement({
        description: 'The system should be fast, efficient, and user-friendly',
      });

      const result = await scorer.scoreRequirement(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const specificityFactor = result.value.factors.find((f) => f.name === 'Specificity');
        expect(specificityFactor).toBeDefined();
        expect(specificityFactor?.issues.some((i) => i.includes('ambiguous'))).toBe(true);
      }
    });

    it('should detect lack of measurable criteria', async () => {
      const requirement = createRequirement({
        description: 'Login should work properly for users',
        acceptanceCriteria: [],
      });

      const result = await scorer.scoreRequirement(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const measurabilityFactor = result.value.factors.find((f) => f.name === 'Measurability');
        expect(measurabilityFactor).toBeDefined();
        expect(measurabilityFactor?.issues.length).toBeGreaterThan(0);
      }
    });

    it('should detect compound requirements (atomicity issue)', async () => {
      const requirement = createRequirement({
        description: 'The system should handle login and registration and password reset and also email verification in addition to profile management',
      });

      const result = await scorer.scoreRequirement(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const atomicityFactor = result.value.factors.find((f) => f.name === 'Atomicity');
        expect(atomicityFactor).toBeDefined();
        expect(atomicityFactor?.issues.some((i) => i.includes('compound') || i.includes('splitting'))).toBe(true);
      }
    });

    it('should detect unrealistic feasibility requirements', async () => {
      const requirement = createRequirement({
        description: 'The system must have 100% uptime with zero defects and never fail under any circumstances',
      });

      const result = await scorer.scoreRequirement(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const feasibilityFactor = result.value.factors.find((f) => f.name === 'Feasibility');
        expect(feasibilityFactor).toBeDefined();
        expect(feasibilityFactor?.issues.some((i) => i.includes('unrealistic') || i.includes('impossible'))).toBe(true);
      }
    });

    it('should store score in memory', async () => {
      const setSpy = vi.spyOn(mockMemory, 'set');
      const requirement = createRequirement();

      await scorer.scoreRequirement(requirement);

      expect(setSpy).toHaveBeenCalledWith(
        expect.stringContaining('requirements-validation:testability:'),
        expect.objectContaining({
          requirementId: requirement.id,
          score: expect.any(Object),
        }),
        expect.any(Object)
      );
    });
  });

  describe('scoreRequirements', () => {
    it('should score multiple requirements', async () => {
      const requirements: Requirement[] = [
        createRequirement({ id: 'REQ-001' }),
        createRequirement({ id: 'REQ-002' }),
        createRequirement({ id: 'REQ-003' }),
      ];

      const result = await scorer.scoreRequirements(requirements);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.size).toBe(3);
        expect(result.value.has('REQ-001')).toBe(true);
        expect(result.value.has('REQ-002')).toBe(true);
        expect(result.value.has('REQ-003')).toBe(true);
      }
    });

    it('should handle empty requirements list', async () => {
      const result = await scorer.scoreRequirements([]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.size).toBe(0);
      }
    });
  });

  describe('suggestImprovements', () => {
    it('should provide suggestions for low-scoring factors', async () => {
      const requirement = createRequirement({
        description: 'Make login fast and easy',
        acceptanceCriteria: [],
      });

      const scoreResult = await scorer.scoreRequirement(requirement);
      expect(scoreResult.success).toBe(true);
      if (!scoreResult.success) return;

      const result = await scorer.suggestImprovements(requirement, scoreResult.value);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBeGreaterThan(0);
      }
    });

    it('should include factor-specific suggestions', async () => {
      const requirement = createRequirement({
        title: 'Hi',
        description: 'Fast system',
        acceptanceCriteria: [],
      });

      const scoreResult = await scorer.scoreRequirement(requirement);
      expect(scoreResult.success).toBe(true);
      if (!scoreResult.success) return;

      const result = await scorer.suggestImprovements(requirement, scoreResult.value);

      expect(result.success).toBe(true);
      if (result.success) {
        // Should have suggestions related to specificity and measurability
        expect(result.value.some((s) =>
          s.includes('measurable') ||
          s.includes('specific') ||
          s.includes('ambiguous')
        )).toBe(true);
      }
    });

    it('should include issues as fix suggestions', async () => {
      const requirement = createRequirement({
        description: 'The system should be fast',
        acceptanceCriteria: [],
      });

      const scoreResult = await scorer.scoreRequirement(requirement);
      expect(scoreResult.success).toBe(true);
      if (!scoreResult.success) return;

      const result = await scorer.suggestImprovements(requirement, scoreResult.value);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.some((s) => s.startsWith('Fix:'))).toBe(true);
      }
    });

    it('should limit suggestions to top 10', async () => {
      const requirement = createRequirement({
        title: 'x',
        description: 'fast easy simple good efficient etc several many',
        acceptanceCriteria: [],
      });

      const scoreResult = await scorer.scoreRequirement(requirement);
      expect(scoreResult.success).toBe(true);
      if (!scoreResult.success) return;

      const result = await scorer.suggestImprovements(requirement, scoreResult.value);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBeLessThanOrEqual(10);
      }
    });

    it('should deduplicate suggestions', async () => {
      const requirement = createRequirement();
      const scoreResult = await scorer.scoreRequirement(requirement);
      expect(scoreResult.success).toBe(true);
      if (!scoreResult.success) return;

      const result = await scorer.suggestImprovements(requirement, scoreResult.value);

      expect(result.success).toBe(true);
      if (result.success) {
        const uniqueSuggestions = new Set(result.value);
        expect(result.value.length).toBe(uniqueSuggestions.size);
      }
    });
  });

  describe('meetsThreshold', () => {
    it('should return true when score meets threshold', () => {
      const score: TestabilityScore = {
        value: 75,
        category: 'good',
        factors: [],
      };

      expect(scorer.meetsThreshold(score, 70)).toBe(true);
    });

    it('should return false when score is below threshold', () => {
      const score: TestabilityScore = {
        value: 55,
        category: 'fair',
        factors: [],
      };

      expect(scorer.meetsThreshold(score, 60)).toBe(false);
    });

    it('should return true when score equals threshold', () => {
      const score: TestabilityScore = {
        value: 60,
        category: 'good',
        factors: [],
      };

      expect(scorer.meetsThreshold(score, 60)).toBe(true);
    });
  });

  describe('factor weights', () => {
    it('should apply configured weights to factors', async () => {
      const customScorer = new TestabilityScorerService(mockMemory, {
        weights: {
          specificity: 0.50,
          measurability: 0.10,
          atomicity: 0.10,
          feasibility: 0.10,
          traceability: 0.10,
          independency: 0.10,
        },
      });

      const requirement = createRequirement();
      const result = await customScorer.scoreRequirement(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const specificityFactor = result.value.factors.find((f) => f.name === 'Specificity');
        expect(specificityFactor?.weight).toBe(0.50);
      }
    });
  });

  describe('traceability scoring', () => {
    it('should score missing requirement ID', async () => {
      const requirement = createRequirement({ id: '' });

      const result = await scorer.scoreRequirement(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const traceabilityFactor = result.value.factors.find((f) => f.name === 'Traceability');
        expect(traceabilityFactor?.issues.some((i) => i.includes('identifier'))).toBe(true);
      }
    });

    it('should score short title for traceability', async () => {
      const requirement = createRequirement({ title: 'Fix' });

      const result = await scorer.scoreRequirement(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const traceabilityFactor = result.value.factors.find((f) => f.name === 'Traceability');
        expect(traceabilityFactor?.issues.some((i) => i.includes('Title'))).toBe(true);
      }
    });
  });

  describe('independency scoring', () => {
    it('should detect explicit dependencies', async () => {
      const requirement = createRequirement({
        description: 'This feature depends on the authentication module being completed first',
      });

      const result = await scorer.scoreRequirement(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const independencyFactor = result.value.factors.find((f) => f.name === 'Independency');
        expect(independencyFactor?.issues.some((i) => i.includes('dependencies'))).toBe(true);
      }
    });

    it('should detect references to other requirements', async () => {
      const requirement = createRequirement({
        description: 'As described in REQ-100, the system should handle this case',
      });

      const result = await scorer.scoreRequirement(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const independencyFactor = result.value.factors.find((f) => f.name === 'Independency');
        expect(independencyFactor?.issues.some((i) => i.includes('References'))).toBe(true);
      }
    });

    it('should detect shared state concerns', async () => {
      const requirement = createRequirement({
        description: 'The feature should use global state to share data across all components',
      });

      const result = await scorer.scoreRequirement(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const independencyFactor = result.value.factors.find((f) => f.name === 'Independency');
        expect(independencyFactor?.issues.some((i) => i.includes('shared state'))).toBe(true);
      }
    });
  });

  describe('trend tracking', () => {
    it('should store score for trend analysis', async () => {
      const setSpy = vi.spyOn(mockMemory, 'set');
      const requirement = createRequirement();

      await scorer.scoreRequirement(requirement);

      // Should store both current score and trend
      expect(setSpy).toHaveBeenCalledWith(
        expect.stringContaining('requirements-validation:testability-trend:'),
        expect.objectContaining({
          scores: expect.any(Array),
        }),
        expect.any(Object)
      );
    });
  });
});
