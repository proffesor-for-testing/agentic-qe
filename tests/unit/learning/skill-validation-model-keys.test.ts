import { describe, expect, it } from 'vitest';
import { SkillValidationLearner, type SkillValidationOutcome } from '../../../src/learning/skill-validation-learner.js';
import type { RealQEReasoningBank } from '../../../src/learning/real-qe-reasoning-bank.js';

describe('skill validation model identities (#978)', () => {
  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'prototype'])(
    'records and restores two eval outcomes for model %s', async (model) => {
      const patterns = new Map<string, { name: string; template: { content: string } }>();
      const bank = {
        storeQEPattern: async (pattern: { name: string; template: { content: string } }) => {
          patterns.set(pattern.name, pattern);
          return { success: true, value: pattern };
        },
        searchQEPatterns: async (name: string) => ({
          success: true,
          value: patterns.has(name) ? [{ pattern: patterns.get(name) }] : [],
        }),
      } as unknown as RealQEReasoningBank;
      const outcome: SkillValidationOutcome = {
        skillName: 'model-key-fixture', model, trustTier: 3, validationLevel: 'eval',
        passed: true, score: 0.95, testCaseResults: [], timestamp: new Date(),
      };

      await new SkillValidationLearner(bank).recordValidationOutcome(outcome);
      // The second learner must reload the JSON, rather than reuse a safe in-memory map.
      const restored = new SkillValidationLearner(bank);
      await restored.recordValidationOutcome({ ...outcome, passed: false, score: 0.5 });
      const analysis = await restored.getCrossModelAnalysis(outcome.skillName);

      expect(analysis).not.toBeNull();
      expect(Object.getPrototypeOf(analysis!.models)).toBeNull();
      expect(Object.hasOwn(analysis!.models, model)).toBe(true);
      expect(analysis!.models[model]).toMatchObject({
        scores: [0.95, 0.5], sampleCount: 2, passRate: 0.5,
      });
      const trends = await restored.getValidationTrends(outcome.skillName);
      expect(Object.hasOwn(trends!.byModel, model)).toBe(true);
      expect(trends!.byModel[model]).toBe('stable');
      expect(Object.hasOwn(Object.prototype, 'scores')).toBe(false);
      expect(Object.hasOwn(Object, 'scores')).toBe(false);
    },
  );

  it('keeps hostile parsed keys inert while preserving the model dictionary', async () => {
    const content = '{"__proto__":{"polluted":true},"models":{"__proto__":{"scores":[1],"passRate":1,"avgReasoningQuality":0,"sampleCount":1}},"variance":0,"hasAnomalies":false}';
    const bank = {
      searchQEPatterns: async () => ({ success: true, value: [{ pattern: { template: { content } } }] }),
    } as unknown as RealQEReasoningBank;
    const analysis = await new SkillValidationLearner(bank).getCrossModelAnalysis('fixture');
    expect(analysis!.models.__proto__.sampleCount).toBe(1);
    expect(Object.getPrototypeOf(analysis)).toBeNull();
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
    expect(Object.hasOwn({}, 'polluted')).toBe(false);
  });
});
