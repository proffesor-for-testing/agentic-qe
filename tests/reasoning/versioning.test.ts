/**
 * Pattern Versioning and Evolution Tests
 *
 * Tests pattern version tracking, backward compatibility,
 * pattern evolution, and conflict resolution.
 *
 * @module tests/reasoning/versioning
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { QEReasoningBank, TestPattern } from '../../src/reasoning/QEReasoningBank';

describe('Pattern Versioning and Evolution', () => {
  let reasoningBank: QEReasoningBank;

  beforeEach(() => {
    reasoningBank = new QEReasoningBank();
  });

  describe('Version Tracking', () => {
    it('should track pattern version history', async () => {
      // Store v1
      const v1: TestPattern = createVersionedPattern('versioned-pattern', '1.0.0', 'Initial version');
      await reasoningBank.storePattern(v1);

      // Store v2 (update)
      const v2: TestPattern = createVersionedPattern('versioned-pattern', '2.0.0', 'Updated version');
      await reasoningBank.storePattern(v2);

      // Store v3 (update)
      const v3: TestPattern = createVersionedPattern('versioned-pattern', '3.0.0', 'Latest version');
      await reasoningBank.storePattern(v3);

      const history = await reasoningBank.getVersionHistory('versioned-pattern');

      expect(history).toHaveLength(2); // v1 and v2 in history
      expect(history[0].metadata.version).toBe('1.0.0');
      expect(history[1].metadata.version).toBe('2.0.0');

      // Current version should be v3
      const current = await reasoningBank.getPattern('versioned-pattern');
      expect(current?.metadata.version).toBe('3.0.0');
    });

    it('should preserve complete version information', async () => {
      const v1 = createVersionedPattern('pattern-v1', '1.0.0', 'Version 1');
      v1.confidence = 0.7;
      v1.successRate = 0.75;

      await reasoningBank.storePattern(v1);

      const v2 = createVersionedPattern('pattern-v1', '2.0.0', 'Version 2');
      v2.confidence = 0.85;
      v2.successRate = 0.90;

      await reasoningBank.storePattern(v2);

      const history = await reasoningBank.getVersionHistory('pattern-v1');

      expect(history[0].confidence).toBe(0.7);
      expect(history[0].successRate).toBe(0.75);

      const current = await reasoningBank.getPattern('pattern-v1');
      expect(current?.confidence).toBe(0.85);
      expect(current?.successRate).toBe(0.90);
    });

    it('should handle multiple version updates', async () => {
      const patternId = 'multi-version';

      // Create 10 versions
      for (let i = 1; i <= 10; i++) {
        const version = createVersionedPattern(patternId, `${i}.0.0`, `Version ${i}`);
        await reasoningBank.storePattern(version);
      }

      const history = await reasoningBank.getVersionHistory(patternId);

      expect(history).toHaveLength(9); // All except current
      expect(history[0].metadata.version).toBe('1.0.0');
      expect(history[8].metadata.version).toBe('9.0.0');

      const current = await reasoningBank.getPattern(patternId);
      expect(current?.metadata.version).toBe('10.0.0');
    });

    it('should track creation and update timestamps', async () => {
      const v1 = createVersionedPattern('timestamp-test', '1.0.0', 'V1');
      const createdAt = new Date('2024-01-01');
      v1.metadata.createdAt = createdAt;
      v1.metadata.updatedAt = createdAt;

      await reasoningBank.storePattern(v1);

      await new Promise(resolve => setTimeout(resolve, 10));

      const v2 = createVersionedPattern('timestamp-test', '2.0.0', 'V2');
      v2.metadata.createdAt = createdAt; // Same creation time
      v2.metadata.updatedAt = new Date(); // New update time

      await reasoningBank.storePattern(v2);

      const current = await reasoningBank.getPattern('timestamp-test');

      expect(current?.metadata.createdAt).toEqual(createdAt);
      expect(current?.metadata.updatedAt.getTime()).toBeGreaterThan(createdAt.getTime());
    });
  });

  describe('Backward Compatibility', () => {
    it('should read v1 patterns with v3 reader', async () => {
      // Store patterns with different version formats
      const v1Pattern = createVersionedPattern('compat-v1', '1.0.0', 'Old format');
      const v2Pattern = createVersionedPattern('compat-v2', '2.5.1', 'Newer format');
      const v3Pattern = createVersionedPattern('compat-v3', '3.0.0', 'Latest format');

      await reasoningBank.storePattern(v1Pattern);
      await reasoningBank.storePattern(v2Pattern);
      await reasoningBank.storePattern(v3Pattern);

      // All should be retrievable
      const retrieved1 = await reasoningBank.getPattern('compat-v1');
      const retrieved2 = await reasoningBank.getPattern('compat-v2');
      const retrieved3 = await reasoningBank.getPattern('compat-v3');

      expect(retrieved1).not.toBeNull();
      expect(retrieved2).not.toBeNull();
      expect(retrieved3).not.toBeNull();
    });

    it('should handle legacy patterns without quality scores', async () => {
      const legacyPattern: TestPattern = {
        id: 'legacy-pattern',
        name: 'Legacy Pattern',
        description: 'Pattern without quality score',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'test template',
        examples: ['example'],
        confidence: 0.8,
        usageCount: 10,
        successRate: 0.85,
        // quality field not present
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '0.9.0',
          tags: ['legacy']
        }
      };

      await reasoningBank.storePattern(legacyPattern);

      const retrieved = await reasoningBank.getPattern('legacy-pattern');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.quality).toBeDefined(); // Should be auto-calculated
    });

    it('should maintain compatibility with old template formats', async () => {
      const oldFormat: TestPattern = {
        id: 'old-template',
        name: 'Old Template Format',
        description: 'Pattern with old template structure',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'describe("{{name}}", () => {})', // Old string template
        examples: ['describe("Test", () => {})'],
        confidence: 0.9,
        usageCount: 5,
        successRate: 0.88,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '0.5.0',
          tags: ['old']
        }
      };

      await reasoningBank.storePattern(oldFormat);

      const retrieved = await reasoningBank.getPattern('old-template');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.template).toBeTruthy();
    });
  });

  describe('Pattern Evolution', () => {
    it('should improve pattern confidence over time with positive feedback', async () => {
      const pattern = createVersionedPattern('evolving', '1.0.0', 'Evolving pattern');
      pattern.confidence = 0.70;
      pattern.successRate = 0.75;

      await reasoningBank.storePattern(pattern);

      // Simulate 10 successful uses
      for (let i = 0; i < 10; i++) {
        await reasoningBank.updatePatternMetrics('evolving', true);
      }

      const updated = await reasoningBank.getPattern('evolving');

      expect(updated?.successRate).toBeGreaterThan(0.75);
      expect(updated?.usageCount).toBe(10);
    });

    it('should decrease confidence with negative feedback', async () => {
      const pattern = createVersionedPattern('declining', '1.0.0', 'Declining pattern');
      pattern.confidence = 0.90;
      pattern.successRate = 0.85;

      await reasoningBank.storePattern(pattern);

      // Simulate failures
      for (let i = 0; i < 5; i++) {
        await reasoningBank.updatePatternMetrics('declining', false);
      }

      const updated = await reasoningBank.getPattern('declining');

      expect(updated?.successRate).toBeLessThan(0.85);
    });

    it('should track pattern usage growth', async () => {
      const pattern = createVersionedPattern('popular', '1.0.0', 'Popular pattern');
      await reasoningBank.storePattern(pattern);

      const initialUsage = (await reasoningBank.getPattern('popular'))!.usageCount;

      // Simulate usage
      for (let i = 0; i < 20; i++) {
        await reasoningBank.updatePatternMetrics('popular', true);
      }

      const finalUsage = (await reasoningBank.getPattern('popular'))!.usageCount;

      expect(finalUsage).toBe(initialUsage + 20);
    });

    it('should reflect evolution in statistics', async () => {
      // Create patterns with different maturity levels
      const immature = createVersionedPattern('immature', '0.1.0', 'New');
      immature.usageCount = 1;
      immature.successRate = 0.60;

      const mature = createVersionedPattern('mature', '5.2.1', 'Mature');
      mature.usageCount = 100;
      mature.successRate = 0.95;

      await reasoningBank.storePattern(immature);
      await reasoningBank.storePattern(mature);

      const stats = await reasoningBank.getStatistics();

      expect(stats.averageSuccessRate).toBeGreaterThan(0.70);
      expect(stats.totalPatterns).toBe(2);
    });

    it('should maintain pattern quality through updates', async () => {
      const v1 = createVersionedPattern('quality-evolution', '1.0.0', 'V1');
      v1.examples = ['basic example'];

      await reasoningBank.storePattern(v1);

      const v2 = createVersionedPattern('quality-evolution', '2.0.0', 'V2');
      v2.examples = ['basic example', 'advanced example', 'edge case'];

      await reasoningBank.storePattern(v2);

      const current = await reasoningBank.getPattern('quality-evolution');

      // More examples should maintain or improve quality
      expect(current?.examples.length).toBe(3);
      expect(current?.quality).toBeDefined();
    });
  });

  describe('Conflict Resolution', () => {
    it('should resolve conflicts with same pattern ID and different versions', async () => {
      const version1 = createVersionedPattern('conflict', '1.0.0', 'Version 1');
      await reasoningBank.storePattern(version1);

      const version2 = createVersionedPattern('conflict', '2.0.0', 'Version 2');
      await reasoningBank.storePattern(version2);

      // Latest version should win
      const current = await reasoningBank.getPattern('conflict');
      expect(current?.metadata.version).toBe('2.0.0');

      // Old version should be in history
      const history = await reasoningBank.getVersionHistory('conflict');
      expect(history[0].metadata.version).toBe('1.0.0');
    });

    it('should handle concurrent updates gracefully', async () => {
      const base = createVersionedPattern('concurrent', '1.0.0', 'Base');
      await reasoningBank.storePattern(base);

      // Simulate concurrent updates
      const updates = [];
      for (let i = 0; i < 5; i++) {
        updates.push(
          reasoningBank.updatePatternMetrics('concurrent', i % 2 === 0)
        );
      }

      await Promise.all(updates);

      const final = await reasoningBank.getPattern('concurrent');

      // All updates should be reflected
      expect(final?.usageCount).toBe(5);
    });

    it('should merge similar patterns with different IDs', async () => {
      // Create two very similar patterns
      const pattern1 = createVersionedPattern('similar-1', '1.0.0', 'API Test Pattern');
      pattern1.metadata.tags = ['api', 'unit', 'controller'];

      const pattern2 = createVersionedPattern('similar-2', '1.0.0', 'API Test Pattern');
      pattern2.metadata.tags = ['api', 'unit', 'controller'];

      await reasoningBank.storePattern(pattern1);
      await reasoningBank.storePattern(pattern2);

      // Find similar patterns
      const similar = await reasoningBank.searchSimilarPatterns(pattern1, 5);

      // Should find pattern2 as highly similar
      const foundPattern2 = similar.find(m => m.pattern.id === 'similar-2');
      expect(foundPattern2).toBeDefined();
      expect(foundPattern2!.similarity).toBeGreaterThan(0.8);
    });

    it('should prevent version conflicts during export/import', async () => {
      const pattern = createVersionedPattern('export-import', '1.0.0', 'Original');
      await reasoningBank.storePattern(pattern);

      // Update to v2
      const v2 = createVersionedPattern('export-import', '2.0.0', 'Updated');
      await reasoningBank.storePattern(v2);

      // Export should get latest version
      const exported = reasoningBank.exportPatterns();
      const exportedPattern = exported.find(p => p.id === 'export-import');

      expect(exportedPattern?.metadata.version).toBe('2.0.0');
    });
  });

  describe('Version Query and Filtering', () => {
    it('should retrieve specific version from history', async () => {
      const id = 'version-query';

      // Create multiple versions
      for (let i = 1; i <= 5; i++) {
        await reasoningBank.storePattern(
          createVersionedPattern(id, `${i}.0.0`, `Version ${i}`)
        );
      }

      const history = await reasoningBank.getVersionHistory(id);

      // Get version 3 from history
      const v3 = history.find(p => p.metadata.version === '3.0.0');

      expect(v3).toBeDefined();
      expect(v3!.description).toBe('Version 3');
    });

    it('should compare versions across patterns', async () => {
      const oldPattern = createVersionedPattern('old', '1.0.0', 'Old');
      const newPattern = createVersionedPattern('new', '5.2.1', 'New');

      await reasoningBank.storePattern(oldPattern);
      await reasoningBank.storePattern(newPattern);

      const stats = await reasoningBank.getStatistics();

      expect(stats.totalPatterns).toBe(2);
    });
  });
});

/**
 * Helper to create versioned test pattern
 */
function createVersionedPattern(id: string, version: string, description: string): TestPattern {
  return {
    id,
    name: `Pattern ${id}`,
    description,
    category: 'unit',
    framework: 'jest',
    language: 'typescript',
    template: `template-${id}`,
    examples: [`example-${id}`],
    confidence: 0.8 + Math.random() * 0.2,
    usageCount: 0,
    successRate: 0.8,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      version,
      tags: ['test', 'versioned']
    }
  };
}
