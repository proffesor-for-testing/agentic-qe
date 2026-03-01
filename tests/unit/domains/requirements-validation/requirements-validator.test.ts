/**
 * Agentic QE v3 - Requirements Validator Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RequirementsValidatorService } from '../../../../src/domains/requirements-validation/services/requirements-validator';
import { MemoryBackend, StoreOptions } from '../../../../src/kernel/interfaces';
import { Requirement, ValidationCriteria } from '../../../../src/domains/requirements-validation/interfaces';

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
    title: 'Implement user login functionality',
    description: 'As a user, I want to log in to the system so that I can access my account',
    acceptanceCriteria: [
      'Given a registered user, when they enter valid credentials, then they should be logged in',
      'Given invalid credentials, when submitted, then an error message should be displayed',
    ],
    type: 'user-story',
    priority: 'high',
    status: 'draft',
    ...overrides,
  };
}

describe('RequirementsValidatorService', () => {
  let validator: RequirementsValidatorService;
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    mockMemory = createMockMemoryBackend();
    validator = new RequirementsValidatorService(mockMemory);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validate', () => {
    it('should return no errors for a well-formed requirement', async () => {
      const requirement = createRequirement();

      const result = await validator.validate(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const errors = result.value.filter((e) => e.severity === 'error');
        expect(errors).toHaveLength(0);
      }
    });

    it('should detect missing ID', async () => {
      const requirement = createRequirement({ id: '' });

      const result = await validator.validate(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const idError = result.value.find((e) => e.code === 'MISSING_ID');
        expect(idError).toBeDefined();
        expect(idError?.severity).toBe('error');
      }
    });

    it('should detect missing title', async () => {
      const requirement = createRequirement({ title: '' });

      const result = await validator.validate(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const titleError = result.value.find((e) => e.code === 'MISSING_TITLE');
        expect(titleError).toBeDefined();
        expect(titleError?.severity).toBe('error');
      }
    });

    it('should detect missing description', async () => {
      const requirement = createRequirement({ description: '' });

      const result = await validator.validate(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const descError = result.value.find((e) => e.code === 'MISSING_DESCRIPTION');
        expect(descError).toBeDefined();
        expect(descError?.severity).toBe('error');
      }
    });

    it('should warn about insufficient acceptance criteria', async () => {
      const requirement = createRequirement({ acceptanceCriteria: [] });

      const result = await validator.validate(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const acError = result.value.find((e) => e.code === 'INSUFFICIENT_AC');
        expect(acError).toBeDefined();
      }
    });

    it('should warn about too short acceptance criteria', async () => {
      const requirement = createRequirement({
        acceptanceCriteria: ['short'],
      });

      const result = await validator.validate(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const acError = result.value.find((e) => e.code === 'AC_TOO_SHORT');
        expect(acError).toBeDefined();
        expect(acError?.severity).toBe('warning');
      }
    });

    it('should warn about short description', async () => {
      const requirement = createRequirement({
        description: 'Too short',
      });

      const result = await validator.validate(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const descError = result.value.find((e) => e.code === 'DESC_TOO_SHORT');
        expect(descError).toBeDefined();
      }
    });

    it('should warn about short title', async () => {
      const requirement = createRequirement({ title: 'Hi' });

      const result = await validator.validate(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const titleError = result.value.find((e) => e.code === 'TITLE_TOO_SHORT');
        expect(titleError).toBeDefined();
        expect(titleError?.severity).toBe('warning');
      }
    });

    it('should warn about user stories not in proper format', async () => {
      const requirement = createRequirement({
        type: 'user-story',
        description: 'Login should work properly for users',
      });

      const result = await validator.validate(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const formatError = result.value.find((e) => e.code === 'NOT_USER_STORY_FORMAT');
        expect(formatError).toBeDefined();
      }
    });

    it('should store validation result in memory', async () => {
      const setSpy = vi.spyOn(mockMemory, 'set');
      const requirement = createRequirement();

      await validator.validate(requirement);

      expect(setSpy).toHaveBeenCalledWith(
        expect.stringContaining('requirements-validation:result:'),
        expect.objectContaining({
          requirementId: requirement.id,
        }),
        expect.any(Object)
      );
    });
  });

  describe('validateAgainstCriteria', () => {
    it('should validate acceptance criteria requirement', async () => {
      const requirement = createRequirement({ acceptanceCriteria: [] });
      const criteria: ValidationCriteria = {
        requireAcceptanceCriteria: true,
        minTestabilityScore: 60,
        forbiddenTerms: [],
        requiredTags: [],
      };

      const result = await validator.validateAgainstCriteria(requirement, criteria);

      expect(result.success).toBe(true);
      if (result.success) {
        const acError = result.value.find((e) => e.code === 'MISSING_AC');
        expect(acError).toBeDefined();
        expect(acError?.severity).toBe('error');
      }
    });

    it('should detect forbidden terms', async () => {
      const requirement = createRequirement({
        description: 'The system should be fast and simple to use',
      });
      const criteria: ValidationCriteria = {
        requireAcceptanceCriteria: false,
        minTestabilityScore: 60,
        forbiddenTerms: ['fast', 'simple'],
        requiredTags: [],
      };

      const result = await validator.validateAgainstCriteria(requirement, criteria);

      expect(result.success).toBe(true);
      if (result.success) {
        const forbiddenErrors = result.value.filter((e) => e.code === 'FORBIDDEN_TERM');
        expect(forbiddenErrors.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should check required tags', async () => {
      const requirement = createRequirement({
        description: 'Login functionality for the web portal',
        acceptanceCriteria: ['User can log in'],
      });
      const criteria: ValidationCriteria = {
        requireAcceptanceCriteria: false,
        minTestabilityScore: 60,
        forbiddenTerms: [],
        requiredTags: ['security', 'api'],
      };

      const result = await validator.validateAgainstCriteria(requirement, criteria);

      expect(result.success).toBe(true);
      if (result.success) {
        const missingTags = result.value.filter((e) => e.code === 'MISSING_TAG');
        expect(missingTags.length).toBeGreaterThan(0);
      }
    });
  });

  describe('detectAmbiguity', () => {
    it('should detect ambiguous terms', async () => {
      const requirement = createRequirement({
        description: 'The system should be fast, user-friendly, and scalable',
      });

      const result = await validator.detectAmbiguity(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.ambiguousTerms.length).toBeGreaterThan(0);
        const terms = result.value.ambiguousTerms.map((t) => t.term);
        expect(terms).toContain('fast');
        expect(terms).toContain('user-friendly');
        expect(terms).toContain('scalable');
      }
    });

    it('should report high score for clear requirements', async () => {
      const requirement = createRequirement({
        description: 'The login form must respond within 200ms under normal load conditions',
        acceptanceCriteria: [
          'Given a user with valid credentials, when they submit the login form, then they should be redirected within 200ms',
        ],
      });

      const result = await validator.detectAmbiguity(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.overallScore).toBeGreaterThan(80);
      }
    });

    it('should provide context for ambiguous terms', async () => {
      const requirement = createRequirement({
        description: 'The application should respond quickly to user input',
      });

      const result = await validator.detectAmbiguity(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const quicklyTerm = result.value.ambiguousTerms.find((t) => t.term === 'quickly');
        expect(quicklyTerm).toBeDefined();
        expect(quicklyTerm?.context).toBeDefined();
        expect(quicklyTerm?.alternatives).toBeDefined();
        expect(quicklyTerm?.alternatives.length).toBeGreaterThan(0);
      }
    });

    it('should provide suggestions for improvement', async () => {
      const requirement = createRequirement({
        description: 'Several users need easy access to the simple dashboard',
      });

      const result = await validator.detectAmbiguity(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.suggestions.length).toBeGreaterThan(0);
      }
    });

    it('should store ambiguity report in memory', async () => {
      const setSpy = vi.spyOn(mockMemory, 'set');
      const requirement = createRequirement();

      await validator.detectAmbiguity(requirement);

      expect(setSpy).toHaveBeenCalledWith(
        expect.stringContaining('requirements-validation:ambiguity:'),
        expect.objectContaining({
          ambiguousTerms: expect.any(Array),
          overallScore: expect.any(Number),
        }),
        expect.any(Object)
      );
    });
  });

  describe('analyzeDependencies', () => {
    it('should build dependency graph from requirements', async () => {
      const requirements: Requirement[] = [
        createRequirement({ id: 'REQ-001', title: 'User Authentication' }),
        createRequirement({
          id: 'REQ-002',
          title: 'User Dashboard',
          description: 'This feature depends on REQ-001 for authentication',
        }),
      ];

      const result = await validator.analyzeDependencies(requirements);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.nodes).toHaveLength(2);
        expect(result.value.edges.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should detect explicit depends-on relationships', async () => {
      const requirements: Requirement[] = [
        createRequirement({ id: 'REQ-001', title: 'Database Setup' }),
        createRequirement({
          id: 'REQ-002',
          title: 'User Registration',
          description: 'Requires database for storing user data. Depends on REQ-001.',
        }),
      ];

      const result = await validator.analyzeDependencies(requirements);

      expect(result.success).toBe(true);
      if (result.success) {
        const depEdge = result.value.edges.find(
          (e) => e.from === 'REQ-002' && e.type === 'depends-on'
        );
        expect(depEdge).toBeDefined();
      }
    });

    it('should handle empty requirements list', async () => {
      const result = await validator.analyzeDependencies([]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.nodes).toHaveLength(0);
        expect(result.value.edges).toHaveLength(0);
      }
    });

    it('should store dependency graph in memory', async () => {
      const setSpy = vi.spyOn(mockMemory, 'set');
      const requirements = [createRequirement()];

      await validator.analyzeDependencies(requirements);

      expect(setSpy).toHaveBeenCalledWith(
        expect.stringContaining('requirements-validation:dependency-graph:'),
        expect.objectContaining({
          nodes: expect.any(Array),
          edges: expect.any(Array),
        }),
        expect.any(Object)
      );
    });
  });

  describe('configuration', () => {
    it('should respect strict mode for acceptance criteria format', async () => {
      const strictValidator = new RequirementsValidatorService(mockMemory, {
        strictMode: true,
      });
      const requirement = createRequirement({
        acceptanceCriteria: ['User logs in successfully'], // No Given-When-Then
      });

      const result = await strictValidator.validate(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const formatError = result.value.find((e) => e.code === 'AC_NOT_GWT');
        expect(formatError).toBeDefined();
      }
    });

    it('should use custom minimum acceptance criteria count', async () => {
      const strictValidator = new RequirementsValidatorService(mockMemory, {
        minAcceptanceCriteria: 3,
      });
      const requirement = createRequirement({
        acceptanceCriteria: ['Criterion 1 with enough content', 'Criterion 2 with enough content'],
      });

      const result = await strictValidator.validate(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const acError = result.value.find((e) => e.code === 'INSUFFICIENT_AC');
        expect(acError).toBeDefined();
      }
    });
  });
});
