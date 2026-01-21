/**
 * Cross-Project Pattern Sharing Tests
 *
 * Tests pattern export/import functionality and framework adaptation
 * across different projects.
 *
 * @module tests/reasoning/cross-project
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { QEReasoningBank, TestPattern } from '../../src/reasoning/QEReasoningBank';
import { createSeededRandom } from '../../src/utils/SeededRandom';
import * as fs from 'fs-extra';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

describe('Cross-Project Pattern Sharing', () => {
  let projectA: QEReasoningBank;
  let projectB: QEReasoningBank;
  let tempDir: string;

  beforeEach(async () => {
    projectA = new QEReasoningBank();
    projectB = new QEReasoningBank();

    // Create temp directory for registry files
    tempDir = path.join(tmpdir(), `pattern-test-${Date.now()}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  describe('Pattern Export/Import', () => {
    it('should export patterns from Project A', async () => {
      // Store patterns in Project A
      const patterns = createSamplePatterns('jest', 5);
      for (const pattern of patterns) {
        await projectA.storePattern(pattern);
      }

      // Export patterns
      const exported = projectA.exportPatterns();

      expect(exported).toHaveLength(5);
      expect(exported[0].framework).toBe('jest');
    });

    it('should import patterns into Project B', async () => {
      // Create patterns in Project A
      const patterns = createSamplePatterns('jest', 5);
      for (const pattern of patterns) {
        await projectA.storePattern(pattern);
      }

      // Export and import
      const exported = projectA.exportPatterns();
      await projectB.importPatterns(exported);

      // Verify import
      const stats = await projectB.getStatistics();
      expect(stats.totalPatterns).toBe(5);
    });

    it('should save patterns to registry file', async () => {
      const patterns = createSamplePatterns('jest', 3);
      for (const pattern of patterns) {
        await projectA.storePattern(pattern);
      }

      const registryPath = path.join(tempDir, 'registry.json');
      await projectA.saveToRegistry(registryPath);

      const exists = await fs.pathExists(registryPath);
      expect(exists).toBe(true);

      const content = await fs.readJson(registryPath);
      expect(content.patterns).toHaveLength(3);
      expect(content.version).toBe('1.0.0');
      expect(content.statistics).toBeDefined();
    });

    it('should load patterns from registry file', async () => {
      // Save patterns from Project A
      const patterns = createSamplePatterns('jest', 4);
      for (const pattern of patterns) {
        await projectA.storePattern(pattern);
      }

      const registryPath = path.join(tempDir, 'registry.json');
      await projectA.saveToRegistry(registryPath);

      // Load into Project B
      const loadedCount = await projectB.loadFromRegistry(registryPath);

      expect(loadedCount).toBe(4);

      const stats = await projectB.getStatistics();
      expect(stats.totalPatterns).toBe(4);
    });

    it('should filter patterns during export', async () => {
      // Store patterns with different frameworks
      const jestPatterns = createSamplePatterns('jest', 3);
      const mochaPatterns = createSamplePatterns('mocha', 2);

      for (const pattern of [...jestPatterns, ...mochaPatterns]) {
        await projectA.storePattern(pattern);
      }

      // Export only Jest patterns
      const exported = projectA.exportPatterns({ framework: 'jest' });

      expect(exported).toHaveLength(3);
      expect(exported.every(p => p.framework === 'jest')).toBe(true);
    });

    it('should preserve pattern quality during export/import', async () => {
      const pattern: TestPattern = {
        id: 'quality-test',
        name: 'Quality Test Pattern',
        description: 'Pattern with quality score',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'test template',
        examples: ['example code'],
        confidence: 0.95,
        usageCount: 50,
        successRate: 0.92,
        quality: 0.88,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['quality', 'test']
        }
      };

      await projectA.storePattern(pattern);

      const exported = projectA.exportPatterns();
      await projectB.importPatterns(exported);

      const imported = await projectB.getPattern('quality-test');

      expect(imported).not.toBeNull();
      expect(imported!.quality).toBe(0.88);
      expect(imported!.successRate).toBe(0.92);
    });
  });

  describe('Framework Adaptation', () => {
    it('should adapt Jest patterns to Mocha', async () => {
      const jestPattern: TestPattern = {
        id: 'jest-to-mocha',
        name: 'Jest Unit Test',
        description: 'Jest test pattern',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'describe("{{name}}", () => { test("{{test}}", () => {}) })',
        examples: ['describe("User", () => { test("should validate", () => {}) })'],
        confidence: 0.9,
        usageCount: 10,
        successRate: 0.85,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['unit', 'jest']
        }
      };

      await projectA.storePattern(jestPattern);

      // Export and import
      const exported = projectA.exportPatterns();
      await projectB.importPatterns(exported);

      // Search for similar patterns in Mocha context
      const matches = await projectB.findMatchingPatterns({
        codeType: 'test',
        framework: 'mocha',
        keywords: ['unit']
      });

      // Should still find the pattern (framework adaptation)
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].pattern.id).toBe('jest-to-mocha');
    });

    it('should adapt patterns from Vitest to Jest', async () => {
      const vitestPattern = createTestPattern('vitest-pattern', 'vitest', 'typescript', ['unit', 'api']);

      await projectA.storePattern(vitestPattern);

      const exported = projectA.exportPatterns();
      await projectB.importPatterns(exported);

      // Search in Jest context
      const matches = await projectB.findMatchingPatterns({
        codeType: 'test',
        framework: 'jest',
        keywords: ['unit', 'api']
      });

      expect(matches.length).toBeGreaterThan(0);
    });

    it('should adapt patterns from TypeScript to JavaScript', async () => {
      const tsPattern = createTestPattern('ts-pattern', 'jest', 'typescript', ['unit']);

      await projectA.storePattern(tsPattern);

      const exported = projectA.exportPatterns();
      await projectB.importPatterns(exported);

      // Search in JavaScript context
      const matches = await projectB.findMatchingPatterns({
        codeType: 'test',
        language: 'javascript',
        keywords: ['unit']
      });

      expect(matches.length).toBeGreaterThan(0);
    });

    it('should maintain pattern effectiveness across frameworks', async () => {
      const pattern = createTestPattern('cross-fw', 'jest', 'typescript', ['api', 'controller']);
      pattern.successRate = 0.92;

      await projectA.storePattern(pattern);

      // Update metrics in Project A
      await projectA.updatePatternMetrics('cross-fw', true);
      await projectA.updatePatternMetrics('cross-fw', true);

      const exported = projectA.exportPatterns();
      await projectB.importPatterns(exported);

      const imported = await projectB.getPattern('cross-fw');

      // Success rate should be preserved
      expect(imported).not.toBeNull();
      expect(imported!.successRate).toBeGreaterThan(0.9);
    });
  });

  describe('Pattern Quality Preservation', () => {
    it('should preserve pattern metadata during transfer', async () => {
      const pattern: TestPattern = {
        id: 'metadata-test',
        name: 'Metadata Test',
        description: 'Test with metadata',
        category: 'integration',
        framework: 'jest',
        language: 'typescript',
        template: 'test template',
        examples: ['example'],
        confidence: 0.88,
        usageCount: 25,
        successRate: 0.90,
        metadata: {
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-15'),
          version: '2.0.0',
          tags: ['integration', 'database', 'api']
        }
      };

      await projectA.storePattern(pattern);

      const exported = projectA.exportPatterns();
      await projectB.importPatterns(exported);

      const imported = await projectB.getPattern('metadata-test');

      expect(imported).not.toBeNull();
      expect(imported!.metadata.version).toBe('2.0.0');
      expect(imported!.metadata.tags).toEqual(['integration', 'database', 'api']);
      expect(imported!.usageCount).toBe(25);
    });

    it('should handle large pattern transfers', async () => {
      // Create 50 patterns
      const patterns = createSamplePatterns('jest', 50);
      for (const pattern of patterns) {
        await projectA.storePattern(pattern);
      }

      const registryPath = path.join(tempDir, 'large-registry.json');
      await projectA.saveToRegistry(registryPath);

      const loadedCount = await projectB.loadFromRegistry(registryPath);

      expect(loadedCount).toBe(50);

      const statsB = await projectB.getStatistics();
      expect(statsB.totalPatterns).toBe(50);
    });

    it('should merge patterns from multiple projects', async () => {
      // Project A patterns
      const patternsA = createSamplePatterns('jest', 3);
      for (const pattern of patternsA) {
        await projectA.storePattern(pattern);
      }

      // Project B patterns (different IDs)
      const patternsB = createSamplePatterns('mocha', 2);
      for (const pattern of patternsB) {
        await projectB.storePattern(pattern);
      }

      // Export from A and import to B
      const exportedA = projectA.exportPatterns();
      await projectB.importPatterns(exportedA);

      const stats = await projectB.getStatistics();

      // Should have patterns from both projects
      expect(stats.totalPatterns).toBe(5);
      expect(stats.byFramework['jest']).toBe(3);
      expect(stats.byFramework['mocha']).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid registry files gracefully', async () => {
      const invalidPath = path.join(tempDir, 'invalid.json');
      await fs.writeFile(invalidPath, 'invalid json content');

      await expect(projectB.loadFromRegistry(invalidPath)).rejects.toThrow();
    });

    it('should handle missing registry files', async () => {
      const missingPath = path.join(tempDir, 'missing.json');

      await expect(projectB.loadFromRegistry(missingPath)).rejects.toThrow();
    });

    it('should validate imported patterns', async () => {
      const invalidPattern: any = {
        id: 'invalid',
        // Missing required fields
      };

      await expect(projectB.importPatterns([invalidPattern])).rejects.toThrow();
    });
  });
});

/**
 * Helper function to create sample patterns
 */
function createSamplePatterns(
  framework: 'jest' | 'mocha' | 'vitest' | 'playwright' | 'cypress' | 'jasmine' | 'ava',
  count: number
): TestPattern[] {
  const patterns: TestPattern[] = [];

  for (let i = 0; i < count; i++) {
    patterns.push(createTestPattern(`pattern-${framework}-${i}`, framework, 'typescript', ['test', 'sample']));
  }

  return patterns;
}

// Seeded random instance for deterministic pattern creation
const crossProjectRng = createSeededRandom(15100);

/**
 * Helper to create a test pattern
 */
function createTestPattern(
  id: string,
  framework: 'jest' | 'mocha' | 'vitest' | 'playwright' | 'cypress' | 'jasmine' | 'ava',
  language: 'typescript' | 'javascript' | 'python',
  tags: string[]
): TestPattern {
  return {
    id,
    name: `Pattern ${id}`,
    description: `Test pattern ${id}`,
    category: 'unit',
    framework,
    language,
    template: `template-${id}`,
    examples: [`example-${id}`],
    confidence: 0.8 + crossProjectRng.random() * 0.2,
    usageCount: Math.floor(crossProjectRng.random() * 50),
    successRate: 0.7 + crossProjectRng.random() * 0.3,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0',
      tags
    }
  };
}
