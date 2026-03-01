/**
 * Agentic QE v3 - BDD Scenario Writer Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BDDScenarioWriterService } from '../../../../src/domains/requirements-validation/services/bdd-scenario-writer';
import { MemoryBackend, StoreOptions } from '../../../../src/kernel/interfaces';
import { Requirement, BDDScenario } from '../../../../src/domains/requirements-validation/interfaces';

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
    ],
    type: 'user-story',
    priority: 'high',
    status: 'draft',
    ...overrides,
  };
}

describe('BDDScenarioWriterService', () => {
  let writer: BDDScenarioWriterService;
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    mockMemory = createMockMemoryBackend();
    writer = new BDDScenarioWriterService(mockMemory);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateScenarios', () => {
    it('should generate scenarios from acceptance criteria', async () => {
      const requirement = createRequirement();

      const result = await writer.generateScenarios(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBeGreaterThan(0);
        const scenario = result.value[0];
        expect(scenario.feature).toBeDefined();
        expect(scenario.scenario).toBeDefined();
        expect(scenario.given.length).toBeGreaterThan(0);
        expect(scenario.when.length).toBeGreaterThan(0);
        expect(scenario.then.length).toBeGreaterThan(0);
      }
    });

    it('should parse Given-When-Then formatted acceptance criteria', async () => {
      const requirement = createRequirement({
        acceptanceCriteria: [
          'Given a registered user When they enter valid credentials Then they should be logged in',
        ],
      });

      const result = await writer.generateScenarios(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const scenario = result.value[0];
        expect(scenario.given[0]).toContain('registered user');
        expect(scenario.when[0]).toContain('enter valid credentials');
        expect(scenario.then[0]).toContain('logged in');
      }
    });

    it('should generate scenarios from plain text criteria', async () => {
      const requirement = createRequirement({
        acceptanceCriteria: ['User should see the dashboard after clicking login button'],
      });

      const result = await writer.generateScenarios(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBeGreaterThan(0);
        // Should generate default structure when not GWT format
        expect(result.value[0].given.length).toBeGreaterThan(0);
      }
    });

    it('should generate negative scenarios when enabled', async () => {
      const writerWithNegative = new BDDScenarioWriterService(mockMemory, {
        generateNegativeScenarios: true,
      });
      const requirement = createRequirement();

      const result = await writerWithNegative.generateScenarios(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const negativeScenarios = result.value.filter((s) => s.tags.includes('negative'));
        expect(negativeScenarios.length).toBeGreaterThan(0);
      }
    });

    it('should limit scenarios to max configured amount', async () => {
      const writerWithLimit = new BDDScenarioWriterService(mockMemory, {
        maxScenariosPerRequirement: 3,
        generateNegativeScenarios: true,
      });
      const requirement = createRequirement({
        acceptanceCriteria: [
          'Given condition 1 when action 1 then result 1',
          'Given condition 2 when action 2 then result 2',
          'Given condition 3 when action 3 then result 3',
          'Given condition 4 when action 4 then result 4',
        ],
      });

      const result = await writerWithLimit.generateScenarios(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBeLessThanOrEqual(3);
      }
    });

    it('should infer tags from requirement type and priority', async () => {
      const requirement = createRequirement({
        type: 'user-story',
        priority: 'high',
      });

      const result = await writer.generateScenarios(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const scenario = result.value[0];
        expect(scenario.tags).toContain('user-story');
        expect(scenario.tags).toContain('priority-high');
      }
    });

    it('should infer context-specific tags from content', async () => {
      const requirement = createRequirement({
        title: 'Implement API endpoint for authentication',
        description: 'Create a secure API endpoint for user login',
      });

      const result = await writer.generateScenarios(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const scenario = result.value[0];
        expect(scenario.tags).toContain('api');
        expect(scenario.tags).toContain('security');
      }
    });

    it('should store generated scenarios in memory', async () => {
      const setSpy = vi.spyOn(mockMemory, 'set');
      const requirement = createRequirement();

      await writer.generateScenarios(requirement);

      expect(setSpy).toHaveBeenCalledWith(
        expect.stringContaining('requirements-validation:scenarios:'),
        expect.objectContaining({
          requirementId: requirement.id,
          scenarios: expect.any(Array),
        }),
        expect.any(Object)
      );
    });
  });

  describe('generateScenariosWithExamples', () => {
    it('should add examples table to scenarios', async () => {
      const requirement = createRequirement();

      const result = await writer.generateScenariosWithExamples(requirement, 3);

      expect(result.success).toBe(true);
      if (result.success) {
        const scenario = result.value[0];
        expect(scenario.examples).toBeDefined();
        expect(scenario.examples?.headers.length).toBeGreaterThan(0);
        expect(scenario.examples?.rows.length).toBe(3);
      }
    });

    it('should generate appropriate example values based on header names', async () => {
      const requirement = createRequirement({
        acceptanceCriteria: ['Given a user with <email> when they login then <result>'],
      });

      const result = await writer.generateScenariosWithExamples(requirement, 2);

      expect(result.success).toBe(true);
      if (result.success) {
        // Even without placeholders in parsed format, examples should be generated
        const scenario = result.value[0];
        expect(scenario.examples).toBeDefined();
      }
    });
  });

  describe('toGherkin', () => {
    it('should generate valid Gherkin format', () => {
      const scenarios: BDDScenario[] = [
        {
          id: '1',
          feature: 'User Login',
          scenario: 'Successful login',
          given: ['the user is on the login page'],
          when: ['they enter valid credentials'],
          then: ['they should be redirected to dashboard'],
          tags: ['authentication'],
        },
      ];

      const gherkin = writer.toGherkin(scenarios);

      expect(gherkin).toContain('Feature: User Login');
      expect(gherkin).toContain('Scenario: Successful login');
      expect(gherkin).toContain('Given the user is on the login page');
      expect(gherkin).toContain('When they enter valid credentials');
      expect(gherkin).toContain('Then they should be redirected to dashboard');
      expect(gherkin).toContain('@authentication');
    });

    it('should handle multiple Given/When/Then steps with And', () => {
      const scenarios: BDDScenario[] = [
        {
          id: '1',
          feature: 'User Login',
          scenario: 'Complex scenario',
          given: ['the user is on the login page', 'they have a valid account'],
          when: ['they enter valid credentials', 'they click submit'],
          then: ['they see a success message', 'they are redirected'],
          tags: [],
        },
      ];

      const gherkin = writer.toGherkin(scenarios);

      expect(gherkin).toContain('Given the user is on the login page');
      expect(gherkin).toContain('And they have a valid account');
      expect(gherkin).toContain('When they enter valid credentials');
      expect(gherkin).toContain('And they click submit');
      expect(gherkin).toContain('Then they see a success message');
      expect(gherkin).toContain('And they are redirected');
    });

    it('should generate Scenario Outline when examples present', () => {
      const scenarios: BDDScenario[] = [
        {
          id: '1',
          feature: 'User Login',
          scenario: 'Login with different users',
          given: ['a user with <role>'],
          when: ['they login'],
          then: ['they see <dashboard>'],
          tags: [],
          examples: {
            headers: ['role', 'dashboard'],
            rows: [
              ['admin', 'admin dashboard'],
              ['user', 'user dashboard'],
            ],
          },
        },
      ];

      const gherkin = writer.toGherkin(scenarios);

      expect(gherkin).toContain('Scenario Outline:');
      expect(gherkin).toContain('Examples:');
      expect(gherkin).toContain('| role | dashboard |');
      expect(gherkin).toContain('| admin | admin dashboard |');
    });

    it('should return empty string for empty scenarios', () => {
      const gherkin = writer.toGherkin([]);

      expect(gherkin).toBe('');
    });
  });

  describe('parseGherkin', () => {
    it('should parse valid Gherkin text', () => {
      const gherkinText = `
Feature: User Login

  @authentication
  Scenario: Successful login
    Given the user is on the login page
    When they enter valid credentials
    Then they should be redirected to dashboard
`;

      const result = writer.parseGherkin(gherkinText);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBe(1);
        const scenario = result.value[0];
        expect(scenario.feature).toBe('User Login');
        expect(scenario.scenario).toBe('Successful login');
        expect(scenario.tags).toContain('authentication');
        expect(scenario.given).toContain('the user is on the login page');
        expect(scenario.when).toContain('they enter valid credentials');
        expect(scenario.then).toContain('they should be redirected to dashboard');
      }
    });

    it('should parse multiple scenarios', () => {
      const gherkinText = `
Feature: User Login

  Scenario: Successful login
    Given the user has valid credentials
    When they login
    Then they are authenticated

  Scenario: Failed login
    Given the user has invalid credentials
    When they login
    Then they see an error
`;

      const result = writer.parseGherkin(gherkinText);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBe(2);
      }
    });

    it('should parse And and But steps', () => {
      const gherkinText = `
Feature: Test

  Scenario: Test scenario
    Given condition one
    And condition two
    But not condition three
    When action
    Then result
`;

      const result = writer.parseGherkin(gherkinText);

      expect(result.success).toBe(true);
      if (result.success) {
        const scenario = result.value[0];
        expect(scenario.given).toContain('condition one');
        expect(scenario.given).toContain('condition two');
        expect(scenario.given).toContain('not condition three');
      }
    });

    it('should parse Scenario Outline with Examples', () => {
      const gherkinText = `
Feature: Login

  Scenario Outline: Login with credentials
    Given a user with <username>
    When they enter <password>
    Then they should see <result>

    Examples:
      | username | password | result |
      | admin    | admin123 | success |
      | user     | wrong    | failure |
`;

      const result = writer.parseGherkin(gherkinText);

      expect(result.success).toBe(true);
      if (result.success) {
        const scenario = result.value[0];
        expect(scenario.examples).toBeDefined();
        expect(scenario.examples?.headers).toEqual(['username', 'password', 'result']);
        expect(scenario.examples?.rows).toHaveLength(2);
        expect(scenario.examples?.rows[0]).toEqual(['admin', 'admin123', 'success']);
      }
    });

    it('should skip comments in Gherkin', () => {
      const gherkinText = `
Feature: Test
# This is a comment

  Scenario: Test scenario
    # Another comment
    Given a condition
    When an action
    Then a result
`;

      const result = writer.parseGherkin(gherkinText);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBe(1);
      }
    });

    it('should handle empty Gherkin text', () => {
      const result = writer.parseGherkin('');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveLength(0);
      }
    });
  });

  describe('configuration', () => {
    it('should skip negative scenarios when disabled', async () => {
      const writerNoNegative = new BDDScenarioWriterService(mockMemory, {
        generateNegativeScenarios: false,
      });
      const requirement = createRequirement();

      const result = await writerNoNegative.generateScenarios(requirement);

      expect(result.success).toBe(true);
      if (result.success) {
        const negativeScenarios = result.value.filter((s) => s.tags.includes('negative'));
        expect(negativeScenarios.length).toBe(0);
      }
    });

    it('should use custom default example count', async () => {
      const writerWithExamples = new BDDScenarioWriterService(mockMemory, {
        defaultExampleCount: 5,
      });
      const requirement = createRequirement();

      const result = await writerWithExamples.generateScenariosWithExamples(requirement, 5);

      expect(result.success).toBe(true);
      if (result.success) {
        const scenario = result.value[0];
        expect(scenario.examples?.rows.length).toBe(5);
      }
    });
  });
});
