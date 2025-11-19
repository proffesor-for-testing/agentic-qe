/**
 * Unit Tests for Constitution Schema
 * Tests REAL implementation
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ConstitutionLoader,
  validateConstitution,
  loadConstitution,
  mergeConstitutions,
  getConstitutionForAgent,
  getBaseConstitutionsPath,
  listAvailableConstitutions
} from '../../../src/constitution/loader';

describe('Constitution Schema', () => {
  const constitutionDir = path.join(__dirname, '../../../src/constitution/base');
  let loader: ConstitutionLoader;

  beforeEach(() => {
    loader = new ConstitutionLoader();
  });

  describe('Schema Validation', () => {
    it('should validate a valid constitution', () => {
      const validConstitution = {
        id: 'test-constitution',
        name: 'Test Constitution',
        version: '1.0.0',
        description: 'A test constitution',
        principles: [
          {
            id: 'principle-1',
            name: 'Test Principle',
            description: 'A test principle',
            priority: 'high',
            category: 'testing',
          },
        ],
        rules: [],
        metrics: [],
        thresholds: [],
        metadata: {
          created: new Date().toISOString(),
          author: 'test',
          applicableTo: ['*'],
        },
      };

      const result = validateConstitution(validConstitution);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject constitution without required fields', () => {
      const invalidConstitution = {
        name: 'Missing ID',
      };

      const result = validateConstitution(invalidConstitution);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect orphaned rules', () => {
      const constitutionWithOrphanedRule = {
        id: 'orphan-test',
        name: 'Orphan Test',
        version: '1.0.0',
        description: 'Test',
        principles: [
          {
            id: 'principle-1',
            name: 'Principle 1',
            description: 'Desc',
            priority: 'high',
            category: 'test',
          },
        ],
        rules: [
          {
            id: 'rule-1',
            principleId: 'non-existent-principle',
            condition: { field: 'test', operator: 'equals', value: 'x' },
            action: { type: 'warn', message: 'test' },
            severity: 'warning',
          },
        ],
        metrics: [],
        thresholds: [],
        metadata: { created: new Date().toISOString(), applicableTo: ['*'] },
      };

      const result = validateConstitution(constitutionWithOrphanedRule);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'ORPHANED_RULE')).toBe(true);
    });

    it('should warn about missing metric descriptions', () => {
      const constitutionWithoutDesc = {
        id: 'no-desc-test',
        name: 'No Desc Test',
        version: '1.0.0',
        description: 'Test',
        principles: [],
        rules: [],
        metrics: [
          {
            id: 'metric-1',
            name: 'Test Metric',
            unit: 'count',
            aggregation: 'sum',
            // No description
          },
        ],
        thresholds: [],
        metadata: { created: new Date().toISOString(), applicableTo: ['*'] },
      };

      const result = validateConstitution(constitutionWithoutDesc);

      expect(result.warnings.some(w => w.code === 'MISSING_DESCRIPTION')).toBe(true);
    });
  });

  describe('Loading Constitutions', () => {
    it('should load default constitution from file', () => {
      const constitution = loadConstitution(
        path.join(constitutionDir, 'default.constitution.json')
      );

      expect(constitution).toBeDefined();
      expect(constitution.id).toBe('default');
      expect(constitution.name).toBe('Default Quality Constitution');
      expect(constitution.principles.length).toBeGreaterThan(0);
    });

    it('should load test-generation constitution', () => {
      const constitution = loadConstitution(
        path.join(constitutionDir, 'test-generation.constitution.json')
      );

      expect(constitution).toBeDefined();
      expect(constitution.id).toBe('test-generation');
      expect(constitution.metrics.length).toBeGreaterThan(0);
    });

    it('should load code-review constitution', () => {
      const constitution = loadConstitution(
        path.join(constitutionDir, 'code-review.constitution.json')
      );

      expect(constitution).toBeDefined();
      expect(constitution.id).toBe('code-review');
    });

    it('should load performance constitution', () => {
      const constitution = loadConstitution(
        path.join(constitutionDir, 'performance.constitution.json')
      );

      expect(constitution).toBeDefined();
      expect(constitution.id).toBe('performance');
    });

    it('should throw error for non-existent file', () => {
      expect(() => {
        loadConstitution('/non/existent/path.json');
      }).toThrow('Constitution file not found');
    });

    it('should cache loaded constitutions', () => {
      const filePath = path.join(constitutionDir, 'default.constitution.json');

      const constitution1 = loader.loadConstitution(filePath);
      const constitution2 = loader.loadConstitution(filePath);

      // Should be the same object reference due to caching
      expect(constitution1).toBe(constitution2);

      const stats = loader.getCacheStats();
      expect(stats.size).toBe(1);
    });
  });

  describe('Merging Constitutions', () => {
    it('should merge base and override constitutions', () => {
      const base = loadConstitution(
        path.join(constitutionDir, 'default.constitution.json')
      );
      const override = loadConstitution(
        path.join(constitutionDir, 'test-generation.constitution.json')
      );

      const merged = mergeConstitutions(base, override);

      // Override properties should take precedence
      expect(merged.id).toBe(override.id);
      expect(merged.name).toBe(override.name);

      // Should have principles from both
      expect(merged.principles.length).toBeGreaterThan(base.principles.length);
    });

    it('should preserve override metadata', () => {
      const base = loadConstitution(
        path.join(constitutionDir, 'default.constitution.json')
      );
      const override = loadConstitution(
        path.join(constitutionDir, 'test-generation.constitution.json')
      );

      const merged = mergeConstitutions(base, override);

      expect(merged.metadata).toEqual(override.metadata);
    });
  });

  describe('Agent Constitution Lookup', () => {
    it('should get constitution for qe-test-generator', () => {
      const constitution = getConstitutionForAgent('qe-test-generator');

      expect(constitution).toBeDefined();
      expect(constitution.name).toBeDefined();
    });

    it('should get constitution for qe-code-reviewer', () => {
      const constitution = getConstitutionForAgent('qe-code-reviewer');

      expect(constitution).toBeDefined();
    });

    it('should get constitution for qe-performance-tester', () => {
      const constitution = getConstitutionForAgent('qe-performance-tester');

      expect(constitution).toBeDefined();
    });

    it('should fall back to default for unknown agent', () => {
      const constitution = getConstitutionForAgent('unknown-agent-type');

      expect(constitution).toBeDefined();
      expect(constitution.id).toBe('default');
    });
  });

  describe('Utility Functions', () => {
    it('should get base constitutions path', () => {
      const basePath = getBaseConstitutionsPath();

      expect(basePath).toBeDefined();
      expect(fs.existsSync(basePath)).toBe(true);
    });

    it('should list available constitutions', () => {
      const available = listAvailableConstitutions();

      expect(available).toContain('default');
      expect(available).toContain('test-generation');
      expect(available).toContain('code-review');
      expect(available).toContain('performance');
    });

    it('should clear cache', () => {
      const filePath = path.join(constitutionDir, 'default.constitution.json');
      loader.loadConstitution(filePath);

      expect(loader.getCacheStats().size).toBe(1);

      loader.clearCache();

      expect(loader.getCacheStats().size).toBe(0);
    });
  });
});
