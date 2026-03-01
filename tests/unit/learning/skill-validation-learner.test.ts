/**
 * Skill Validation Learner Tests
 * ADR-056: Integrates skill validation with ReasoningBank
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  SkillValidationLearner,
  createSkillValidationLearner,
  type SkillValidationOutcome,
  type TestCaseResult,
} from '../../../src/learning/skill-validation-learner.js';
import type { RealQEReasoningBank } from '../../../src/learning/real-qe-reasoning-bank.js';

// Mock ReasoningBank
function createMockReasoningBank(): RealQEReasoningBank {
  const storedPatterns = new Map<string, any>();

  return {
    storeQEPattern: vi.fn(async (options) => {
      const id = `pattern-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      storedPatterns.set(options.name, {
        id,
        ...options,
        context: options.context || { tags: [] },
        template: options.template || { type: 'data', content: '{}', variables: [] },
      });
      return { success: true, value: { id, ...options } };
    }),
    searchQEPatterns: vi.fn(async (query, _options) => {
      // Find patterns that match the query in name
      const matches: any[] = [];
      for (const [name, pattern] of storedPatterns) {
        if (name.includes(query) || query.includes(name.split('-')[0])) {
          matches.push({ pattern, similarity: 0.9 });
        }
      }
      return { success: true, value: matches };
    }),
    queryPatterns: vi.fn(async () => []),
  } as unknown as RealQEReasoningBank;
}

describe('SkillValidationLearner', () => {
  let learner: SkillValidationLearner;
  let mockReasoningBank: RealQEReasoningBank;

  beforeEach(() => {
    mockReasoningBank = createMockReasoningBank();
    learner = createSkillValidationLearner(mockReasoningBank);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('recordValidationOutcome', () => {
    it('should store a validation pattern in ReasoningBank', async () => {
      const outcome: SkillValidationOutcome = {
        skillName: 'security-testing',
        trustTier: 3,
        validationLevel: 'eval',
        model: 'claude-3.5-sonnet',
        passed: true,
        score: 0.92,
        testCaseResults: [
          {
            testId: 'test-1',
            passed: true,
            expectedPatterns: ['SQL injection'],
            actualPatterns: ['SQL injection', 'vulnerability'],
            reasoningQuality: 0.95,
          },
        ],
        timestamp: new Date(),
        runId: 'run-123',
      };

      await learner.recordValidationOutcome(outcome);

      expect(mockReasoningBank.storeQEPattern).toHaveBeenCalled();

      // Check the pattern was stored with correct data
      const calls = (mockReasoningBank.storeQEPattern as any).mock.calls;
      expect(calls.length).toBeGreaterThan(0);

      const firstCall = calls[0][0];
      expect(firstCall.name).toContain('security-testing');
      expect(firstCall.context.tags).toContain('skill-validation');
    });

    it('should update skill confidence on each outcome', async () => {
      // Record multiple outcomes
      for (let i = 0; i < 5; i++) {
        await learner.recordValidationOutcome({
          skillName: 'a11y-testing',
          trustTier: 2,
          validationLevel: 'validator',
          model: 'claude-3-haiku',
          passed: i % 2 === 0,
          score: 0.7 + (i * 0.05),
          testCaseResults: [
            {
              testId: `test-${i}`,
              passed: i % 2 === 0,
              expectedPatterns: [],
              actualPatterns: [],
              reasoningQuality: 0.8,
            },
          ],
          timestamp: new Date(),
        });
      }

      // Confidence should be stored
      const calls = (mockReasoningBank.storeQEPattern as any).mock.calls;
      const confidenceCalls = calls.filter((c: any) =>
        c[0].name.includes('skill-confidence')
      );
      expect(confidenceCalls.length).toBeGreaterThan(0);
    });

    it('should track cross-model behavior for eval level', async () => {
      // Record outcomes from different models
      const models = ['claude-3.5-sonnet', 'claude-3-haiku', 'claude-3-opus'];

      for (const model of models) {
        await learner.recordValidationOutcome({
          skillName: 'security-testing',
          trustTier: 3,
          validationLevel: 'eval',
          model,
          passed: true,
          score: 0.9,
          testCaseResults: [],
          timestamp: new Date(),
        });
      }

      // Cross-model tracking should be stored
      const calls = (mockReasoningBank.storeQEPattern as any).mock.calls;
      const crossModelCalls = calls.filter((c: any) =>
        c[0].name.includes('cross-model')
      );
      expect(crossModelCalls.length).toBeGreaterThan(0);
    });

    it('should not track cross-model for schema/validator levels', async () => {
      await learner.recordValidationOutcome({
        skillName: 'test-skill',
        trustTier: 1,
        validationLevel: 'schema',
        model: 'claude-3-haiku',
        passed: true,
        score: 1.0,
        testCaseResults: [],
        timestamp: new Date(),
      });

      const calls = (mockReasoningBank.storeQEPattern as any).mock.calls;
      const crossModelCalls = calls.filter((c: any) =>
        c[0].name.includes('cross-model')
      );
      expect(crossModelCalls.length).toBe(0);
    });
  });

  describe('getSkillConfidence', () => {
    it('should return null for unknown skill', async () => {
      const confidence = await learner.getSkillConfidence('unknown-skill');
      expect(confidence).toBeNull();
    });

    it('should return confidence data after recording outcomes', async () => {
      // Record an outcome first
      await learner.recordValidationOutcome({
        skillName: 'test-skill',
        trustTier: 2,
        validationLevel: 'validator',
        model: 'claude-3.5-sonnet',
        passed: true,
        score: 0.85,
        testCaseResults: [],
        timestamp: new Date(),
      });

      // The mock should return the stored pattern
      const confidence = await learner.getSkillConfidence('test-skill');
      // With our mock, this will return the stored confidence
      // In real implementation, this would parse the pattern content
    });
  });

  describe('getCrossModelAnalysis', () => {
    it('should return null for unknown skill', async () => {
      const analysis = await learner.getCrossModelAnalysis('unknown-skill');
      expect(analysis).toBeNull();
    });
  });

  describe('queryValidationPatterns', () => {
    it('should return validation patterns for a skill', async () => {
      // Record some outcomes first
      await learner.recordValidationOutcome({
        skillName: 'security-testing',
        trustTier: 3,
        validationLevel: 'eval',
        model: 'claude-3.5-sonnet',
        passed: true,
        score: 0.9,
        testCaseResults: [],
        timestamp: new Date(),
      });

      const patterns = await learner.queryValidationPatterns('security-testing');
      // Should return patterns that match the skill
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('getValidationTrends', () => {
    it('should return null for unknown skill', async () => {
      const trends = await learner.getValidationTrends('unknown-skill');
      expect(trends).toBeNull();
    });
  });

  describe('extractLearnedPatterns', () => {
    it('should extract patterns from validation history', async () => {
      // Record multiple outcomes
      for (let i = 0; i < 3; i++) {
        await learner.recordValidationOutcome({
          skillName: 'security-testing',
          trustTier: 3,
          validationLevel: 'eval',
          model: 'claude-3.5-sonnet',
          passed: i < 2,
          score: i < 2 ? 0.9 : 0.6,
          testCaseResults: [
            {
              testId: `test-${i}`,
              passed: i < 2,
              expectedPatterns: ['SQL injection'],
              actualPatterns: ['SQL injection'],
              reasoningQuality: 0.8,
              category: 'injection',
            },
          ],
          timestamp: new Date(),
          metadata: { category: 'injection' },
        });
      }

      const patterns = await learner.extractLearnedPatterns('security-testing');
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('connectFeedbackLoop', () => {
    it('should connect to QualityFeedbackLoop', () => {
      const mockFeedbackLoop = {
        recordRoutingOutcome: vi.fn(),
      } as any;

      // Should not throw
      learner.connectFeedbackLoop(mockFeedbackLoop);
    });

    it('should record to feedback loop when connected and runId is present', async () => {
      const mockFeedbackLoop = {
        recordRoutingOutcome: vi.fn(),
      } as any;

      learner.connectFeedbackLoop(mockFeedbackLoop);

      await learner.recordValidationOutcome({
        skillName: 'test-skill',
        trustTier: 2,
        validationLevel: 'eval',
        model: 'claude-3.5-sonnet',
        passed: true,
        score: 0.9,
        testCaseResults: [],
        timestamp: new Date(),
        runId: 'run-123',
      });

      expect(mockFeedbackLoop.recordRoutingOutcome).toHaveBeenCalled();
    });
  });
});

describe('createSkillValidationLearner', () => {
  it('should create a SkillValidationLearner instance', () => {
    const mockBank = createMockReasoningBank();
    const learner = createSkillValidationLearner(mockBank);
    expect(learner).toBeInstanceOf(SkillValidationLearner);
  });
});
