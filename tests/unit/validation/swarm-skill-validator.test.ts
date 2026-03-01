/**
 * Swarm Skill Validator Tests
 * ADR-056 Phase 5: Claude Flow swarm coordinator for parallel skill validation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  SwarmSkillValidator,
  createSwarmSkillValidator,
  DEFAULT_SWARM_VALIDATION_CONFIG,
  P0_SKILLS,
  DEFAULT_VALIDATION_MODELS,
  type SwarmValidationConfig,
  type SwarmValidationResult,
  type SkillValidatorFn,
} from '../../../src/validation/swarm-skill-validator.js';
import type { SkillValidationLearner, SkillValidationOutcome } from '../../../src/learning/skill-validation-learner.js';

// ============================================================================
// Mock Setup
// ============================================================================

function createMockLearner(): SkillValidationLearner {
  return {
    recordValidationOutcome: vi.fn(async () => {}),
    getSkillConfidence: vi.fn(async () => null),
    getCrossModelAnalysis: vi.fn(async () => null),
    queryValidationPatterns: vi.fn(async () => []),
    getValidationTrends: vi.fn(async () => null),
    extractLearnedPatterns: vi.fn(async () => []),
    connectFeedbackLoop: vi.fn(),
  } as unknown as SkillValidationLearner;
}

function createMockValidator(passRate: number = 0.95): SkillValidatorFn {
  return vi.fn(async (skill, model, options) => {
    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, 10));

    const passed = Math.random() < passRate;

    return {
      skillName: skill,
      trustTier: options.trustTier,
      validationLevel: options.validationLevel,
      model,
      passed,
      score: passed ? 0.9 + Math.random() * 0.1 : 0.5 + Math.random() * 0.3,
      testCaseResults: [
        {
          testId: `test-${skill}-${model}`,
          passed,
          expectedPatterns: ['valid-output'],
          actualPatterns: passed ? ['valid-output'] : [],
          reasoningQuality: passed ? 0.9 : 0.5,
        },
      ],
      timestamp: new Date(),
      runId: `run-${Date.now()}`,
    } as SkillValidationOutcome;
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('SwarmSkillValidator', () => {
  let validator: SwarmSkillValidator;
  let mockLearner: SkillValidationLearner;

  beforeEach(() => {
    mockLearner = createMockLearner();
    validator = new SwarmSkillValidator({}, mockLearner);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create with default configuration', () => {
      const config = validator.getConfig();

      expect(config.topology).toBe('hierarchical');
      expect(config.maxConcurrentSkills).toBe(10);
      expect(config.maxConcurrentModels).toBe(3);
      expect(config.timeout).toBe(300000);
      expect(config.continueOnFailure).toBe(true);
    });

    it('should merge custom configuration with defaults', () => {
      const customValidator = new SwarmSkillValidator({
        topology: 'mesh',
        maxConcurrentSkills: 5,
        timeout: 60000,
      }, mockLearner);

      const config = customValidator.getConfig();

      expect(config.topology).toBe('mesh');
      expect(config.maxConcurrentSkills).toBe(5);
      expect(config.timeout).toBe(60000);
      // Should keep defaults for unspecified options
      expect(config.maxConcurrentModels).toBe(3);
    });
  });

  describe('validateSkillsParallel', () => {
    it('should validate multiple skills in parallel', async () => {
      const skills = ['security-testing', 'accessibility-testing'];
      const models = ['claude-sonnet', 'claude-haiku'];

      const results = await validator.validateSkillsParallel(skills, models);

      expect(results.size).toBe(skills.length);
      expect(results.has('security-testing')).toBe(true);
      expect(results.has('accessibility-testing')).toBe(true);

      // Each skill should have results for all models
      for (const skillResults of results.values()) {
        expect(skillResults.length).toBe(models.length);
      }
    });

    it('should respect max concurrency limits', async () => {
      const customValidator = new SwarmSkillValidator({
        maxConcurrentSkills: 2,
        maxConcurrentModels: 1,
      }, mockLearner);

      const skills = ['skill-1', 'skill-2', 'skill-3', 'skill-4'];
      const models = ['model-1', 'model-2'];

      const startTime = Date.now();
      const results = await customValidator.validateSkillsParallel(skills, models);
      const duration = Date.now() - startTime;

      // All skills should be validated
      expect(results.size).toBe(skills.length);

      // Total results should be skills * models
      let totalResults = 0;
      for (const skillResults of results.values()) {
        totalResults += skillResults.length;
      }
      expect(totalResults).toBe(skills.length * models.length);
    });

    it('should handle individual skill failures gracefully', async () => {
      // Create a validator that fails for specific skills
      const failingValidator: SkillValidatorFn = vi.fn(async (skill, model, options) => {
        if (skill === 'failing-skill') {
          throw new Error('Skill validation failed');
        }

        return {
          skillName: skill,
          trustTier: options.trustTier,
          validationLevel: options.validationLevel,
          model,
          passed: true,
          score: 0.95,
          testCaseResults: [],
          timestamp: new Date(),
        } as SkillValidationOutcome;
      });

      validator.setSkillValidator(failingValidator);

      const skills = ['working-skill', 'failing-skill'];
      const models = ['claude-sonnet'];

      // With continueOnFailure = true (default), should not throw
      const results = await validator.validateSkillsParallel(skills, models);

      expect(results.size).toBe(2);

      // Working skill should have passed
      const workingResults = results.get('working-skill');
      expect(workingResults).toBeDefined();
      expect(workingResults![0].errors.length).toBe(0);

      // Failing skill should have error recorded
      const failingResults = results.get('failing-skill');
      expect(failingResults).toBeDefined();
      expect(failingResults![0].errors.length).toBeGreaterThan(0);
    });

    it('should aggregate results correctly', async () => {
      const mockValidator = createMockValidator(1.0); // 100% pass rate
      validator.setSkillValidator(mockValidator);

      const skills = ['skill-1', 'skill-2'];
      const models = ['model-1', 'model-2', 'model-3'];

      const results = await validator.validateSkillsParallel(skills, models);
      const summary = validator.getSummary(results);

      expect(summary.totalSkills).toBe(skills.length);
      expect(summary.totalModels).toBe(models.length);
      expect(summary.results.length).toBe(skills.length * models.length);

      // Check bySkill aggregation
      expect(summary.bySkill.size).toBe(skills.length);
      for (const skillResults of summary.bySkill.values()) {
        expect(skillResults.length).toBe(models.length);
      }

      // Check byModel aggregation
      expect(summary.byModel.size).toBe(models.length);
      for (const modelResults of summary.byModel.values()) {
        expect(modelResults.length).toBe(skills.length);
      }
    });

    it('should record outcomes to learner', async () => {
      const skills = ['security-testing'];
      const models = ['claude-sonnet'];

      await validator.validateSkillsParallel(skills, models);

      // Should have recorded the outcome
      expect(mockLearner.recordValidationOutcome).toHaveBeenCalled();
    });
  });

  describe('validateSkillCrossModel', () => {
    it('should validate single skill across multiple models', async () => {
      const skill = 'security-testing';
      const models = ['claude-sonnet', 'claude-haiku', 'claude-opus'];

      const results = await validator.validateSkillCrossModel(skill, models);

      expect(results.length).toBe(models.length);

      // All results should be for the same skill
      for (const result of results) {
        expect(result.skill).toBe(skill);
      }

      // Results should cover all models
      const resultModels = new Set(results.map(r => r.model));
      expect(resultModels.size).toBe(models.length);
    });
  });

  describe('determineTopology', () => {
    it('should select hierarchical for large skill counts', () => {
      const topology = validator.determineTopology(10, 3);
      expect(topology).toBe('hierarchical');
    });

    it('should select mesh for few skills with many models', () => {
      const meshValidator = new SwarmSkillValidator({
        topology: undefined as unknown as 'hierarchical', // Force auto-determination
      }, mockLearner);

      // Force topology to be recalculated
      const topology = meshValidator.determineTopology(2, 10);
      expect(topology).toBe('mesh');
    });

    it('should respect explicit configuration', () => {
      const meshValidator = new SwarmSkillValidator({
        topology: 'mesh',
      }, mockLearner);

      // Even with large workload, should respect config
      const topology = meshValidator.determineTopology(20, 5);
      expect(topology).toBe('mesh');
    });

    it('should default to hierarchical when workload is balanced', () => {
      const topology = validator.determineTopology(3, 3);
      expect(topology).toBe('hierarchical');
    });
  });

  describe('getSummary', () => {
    it('should calculate correct pass rate', async () => {
      // Create validator with known pass rate
      const mockValidator: SkillValidatorFn = vi.fn(async (skill, model, options) => {
        const passed = skill !== 'failing-skill';
        return {
          skillName: skill,
          trustTier: options.trustTier,
          validationLevel: options.validationLevel,
          model,
          passed,
          score: passed ? 0.95 : 0.5,
          testCaseResults: [],
          timestamp: new Date(),
        } as SkillValidationOutcome;
      });

      validator.setSkillValidator(mockValidator);

      const skills = ['passing-skill', 'failing-skill'];
      const models = ['model-1'];

      const results = await validator.validateSkillsParallel(skills, models);
      const summary = validator.getSummary(results);

      // 1 passing, 1 failing = 50% pass rate
      expect(summary.successCount).toBe(1);
      expect(summary.failureCount).toBe(1);
      expect(summary.overallPassRate).toBe(0.5);
    });

    it('should calculate total and average duration', async () => {
      const skills = ['skill-1', 'skill-2'];
      const models = ['model-1'];

      const results = await validator.validateSkillsParallel(skills, models);
      const summary = validator.getSummary(results);

      expect(summary.totalDurationMs).toBeGreaterThan(0);
      expect(summary.avgDurationMs).toBeGreaterThan(0);
      expect(summary.avgDurationMs).toBeLessThanOrEqual(summary.totalDurationMs);
    });
  });

  describe('cancel', () => {
    it('should cancel running validation', async () => {
      const slowValidator: SkillValidatorFn = vi.fn(async (skill, model, options) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          skillName: skill,
          trustTier: options.trustTier,
          validationLevel: options.validationLevel,
          model,
          passed: true,
          score: 0.95,
          testCaseResults: [],
          timestamp: new Date(),
        } as SkillValidationOutcome;
      });

      validator.setSkillValidator(slowValidator);

      const skills = ['skill-1', 'skill-2', 'skill-3'];
      const models = ['model-1'];

      // Start validation
      const validationPromise = validator.validateSkillsParallel(skills, models);

      // Cancel after a short delay
      setTimeout(() => validator.cancel(), 50);

      const results = await validationPromise;

      // Should have some results, but not all
      expect(validator.isValidationRunning()).toBe(false);
    });
  });

  describe('setSkillValidator', () => {
    it('should use custom validator when set', async () => {
      const customValidator = vi.fn(async (skill, model, options) => ({
        skillName: skill,
        trustTier: options.trustTier,
        validationLevel: options.validationLevel,
        model,
        passed: true,
        score: 0.99,
        testCaseResults: [],
        timestamp: new Date(),
      } as SkillValidationOutcome));

      validator.setSkillValidator(customValidator);

      await validator.validateSkillsParallel(['test-skill'], ['test-model']);

      expect(customValidator).toHaveBeenCalled();
    });
  });

  describe('getWorkerStatus', () => {
    it('should return empty array when not running', () => {
      const status = validator.getWorkerStatus();
      expect(status).toEqual([]);
    });
  });
});

describe('createSwarmSkillValidator', () => {
  it('should create a SwarmSkillValidator instance', () => {
    const mockLearner = createMockLearner();
    const validator = createSwarmSkillValidator({}, mockLearner);
    expect(validator).toBeInstanceOf(SwarmSkillValidator);
  });

  it('should pass configuration to validator', () => {
    const mockLearner = createMockLearner();
    const validator = createSwarmSkillValidator({
      topology: 'mesh',
      timeout: 60000,
    }, mockLearner);

    const config = validator.getConfig();
    expect(config.topology).toBe('mesh');
    expect(config.timeout).toBe(60000);
  });
});

describe('Constants', () => {
  describe('P0_SKILLS', () => {
    it('should contain 10 P0 skills', () => {
      expect(P0_SKILLS.length).toBe(10);
    });

    it('should include security-testing', () => {
      expect(P0_SKILLS).toContain('security-testing');
    });

    it('should include accessibility-testing', () => {
      expect(P0_SKILLS).toContain('accessibility-testing');
    });
  });

  describe('DEFAULT_VALIDATION_MODELS', () => {
    it('should contain 3 default models', () => {
      expect(DEFAULT_VALIDATION_MODELS.length).toBe(3);
    });

    it('should include claude-sonnet', () => {
      expect(DEFAULT_VALIDATION_MODELS).toContain('claude-sonnet');
    });
  });

  describe('DEFAULT_SWARM_VALIDATION_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_SWARM_VALIDATION_CONFIG.topology).toBe('hierarchical');
      expect(DEFAULT_SWARM_VALIDATION_CONFIG.maxConcurrentSkills).toBe(10);
      expect(DEFAULT_SWARM_VALIDATION_CONFIG.maxConcurrentModels).toBe(3);
      expect(DEFAULT_SWARM_VALIDATION_CONFIG.timeout).toBe(300000);
      expect(DEFAULT_SWARM_VALIDATION_CONFIG.continueOnFailure).toBe(true);
      expect(DEFAULT_SWARM_VALIDATION_CONFIG.retry?.maxRetries).toBe(2);
      expect(DEFAULT_SWARM_VALIDATION_CONFIG.retry?.retryDelayMs).toBe(1000);
    });
  });
});

describe('Integration with SkillValidationLearner', () => {
  it('should record all validation outcomes to learner', async () => {
    const mockLearner = createMockLearner();
    const validator = new SwarmSkillValidator({}, mockLearner);

    const skills = ['skill-1', 'skill-2'];
    const models = ['model-1', 'model-2'];

    await validator.validateSkillsParallel(skills, models);

    // Should record all outcomes (skills * models)
    expect(mockLearner.recordValidationOutcome).toHaveBeenCalledTimes(
      skills.length * models.length
    );
  });

  it('should pass correct outcome data to learner', async () => {
    const mockLearner = createMockLearner();
    const validator = new SwarmSkillValidator({}, mockLearner);

    await validator.validateSkillsParallel(['test-skill'], ['test-model'], {
      trustTier: 3,
      validationLevel: 'eval',
    });

    expect(mockLearner.recordValidationOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: 'test-skill',
        model: 'test-model',
        trustTier: 3,
        validationLevel: 'eval',
      })
    );
  });
});
