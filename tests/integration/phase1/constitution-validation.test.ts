/**
 * Integration Tests for Constitution Validation
 * Tests that all base constitutions pass validation
 */

import * as fs from 'fs';
import * as path from 'path';

// Load fixtures
const validPath = path.join(__dirname, '../../fixtures/phase1/valid-constitution.json');
const invalidPath = path.join(__dirname, '../../fixtures/phase1/invalid-constitution.json');
const validFixture = JSON.parse(fs.readFileSync(validPath, 'utf-8'));
const invalidFixture = JSON.parse(fs.readFileSync(invalidPath, 'utf-8'));

// Mock integrated constitution system
interface Constitution {
  version: string;
  name: string;
  description?: string;
  principles: any[];
  constraints?: any[];
  behaviors?: Record<string, string[]>;
  capabilities?: string[];
  metadata?: Record<string, any>;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

class ConstitutionValidationSystem {
  private registry = new Map<string, Constitution>();
  private validationHistory: Array<{ agentId: string; result: ValidationResult; timestamp: string }> = [];

  validate(constitution: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required field validation
    if (!constitution.version) {
      errors.push('Missing required field: version');
    } else if (!this.isValidSemver(constitution.version)) {
      errors.push('Invalid version format');
    }

    if (!constitution.name) {
      errors.push('Missing required field: name');
    } else if (constitution.name.length === 0) {
      errors.push('Name cannot be empty');
    }

    if (!constitution.principles) {
      errors.push('Missing required field: principles');
    } else if (!Array.isArray(constitution.principles)) {
      errors.push('Principles must be an array');
    } else {
      // Validate each principle
      const ids = new Set<string>();
      for (const principle of constitution.principles) {
        if (!principle.id) {
          errors.push('Principle missing id');
        } else if (ids.has(principle.id)) {
          errors.push(`Duplicate principle ID: ${principle.id}`);
        } else {
          ids.add(principle.id);
        }

        if (!principle.name || !principle.description) {
          errors.push('Principle missing name or description');
        }

        if (principle.priority && !['high', 'medium', 'low'].includes(principle.priority)) {
          errors.push(`Invalid priority: ${principle.priority}`);
        }
      }

      // Warnings for empty principles
      if (constitution.principles.length === 0) {
        warnings.push('Constitution has no principles defined');
      }
    }

    // Validate constraints
    if (constitution.constraints) {
      const validTypes = ['coverage', 'performance', 'complexity', 'security', 'quality'];
      for (const constraint of constitution.constraints) {
        if (!validTypes.includes(constraint.type)) {
          errors.push(`Invalid constraint type: ${constraint.type}`);
        }
        if (!constraint.condition) {
          errors.push('Constraint missing condition');
        }
      }
    }

    // Validate behaviors
    if (constitution.behaviors && typeof constitution.behaviors !== 'object') {
      errors.push('Invalid behaviors structure');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  register(agentId: string, constitution: Constitution): ValidationResult {
    const result = this.validate(constitution);

    if (result.valid) {
      this.registry.set(agentId, constitution);
    }

    this.validationHistory.push({
      agentId,
      result,
      timestamp: new Date().toISOString()
    });

    return result;
  }

  validateAndMerge(agentId: string, base: Constitution, override: Constitution): ValidationResult {
    // Validate both constitutions
    const baseResult = this.validate(base);
    if (!baseResult.valid) {
      return {
        valid: false,
        errors: baseResult.errors.map(e => `Base: ${e}`),
        warnings: baseResult.warnings
      };
    }

    const overrideResult = this.validate(override);
    if (!overrideResult.valid) {
      return {
        valid: false,
        errors: overrideResult.errors.map(e => `Override: ${e}`),
        warnings: overrideResult.warnings
      };
    }

    // Merge
    const merged = this.merge(base, override);
    const mergedResult = this.validate(merged);

    if (mergedResult.valid) {
      this.registry.set(agentId, merged);
    }

    return mergedResult;
  }

  getForAgent(agentId: string): Constitution | null {
    return this.registry.get(agentId) || null;
  }

  getValidationHistory(): Array<{ agentId: string; result: ValidationResult; timestamp: string }> {
    return [...this.validationHistory];
  }

  listRegistered(): string[] {
    return Array.from(this.registry.keys());
  }

  clear(): void {
    this.registry.clear();
    this.validationHistory = [];
  }

  private merge(base: Constitution, override: Constitution): Constitution {
    const mergedPrinciples = [...base.principles];
    const baseIds = new Set(base.principles.map(p => p.id));

    for (const principle of override.principles) {
      if (baseIds.has(principle.id)) {
        const index = mergedPrinciples.findIndex(p => p.id === principle.id);
        mergedPrinciples[index] = { ...mergedPrinciples[index], ...principle };
      } else {
        mergedPrinciples.push(principle);
      }
    }

    return {
      version: override.version || base.version,
      name: override.name || base.name,
      description: override.description || base.description,
      principles: mergedPrinciples,
      constraints: override.constraints || base.constraints,
      behaviors: override.behaviors || base.behaviors,
      capabilities: override.capabilities || base.capabilities,
      metadata: { ...base.metadata, ...override.metadata }
    };
  }

  private isValidSemver(version: string): boolean {
    return /^\d+\.\d+\.\d+/.test(version);
  }
}

describe('Constitution Validation Integration', () => {
  let system: ConstitutionValidationSystem;

  beforeEach(() => {
    system = new ConstitutionValidationSystem();
  });

  afterEach(() => {
    system.clear();
  });

  describe('Base Constitution Validation', () => {
    test('should validate valid fixture constitution', () => {
      const result = system.validate(validFixture);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should register valid constitution', () => {
      const result = system.register('qe-test-generator', validFixture);

      expect(result.valid).toBe(true);
      expect(system.getForAgent('qe-test-generator')).toEqual(validFixture);
    });

    test('should reject all invalid fixture examples', () => {
      for (const invalid of invalidFixture.invalidExamples) {
        const result = system.validate(invalid.constitution);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    test('should not register invalid constitution', () => {
      const invalid = invalidFixture.invalidExamples[0].constitution;
      const result = system.register('invalid-agent', invalid);

      expect(result.valid).toBe(false);
      expect(system.getForAgent('invalid-agent')).toBeNull();
    });
  });

  describe('QE Agent Constitution Validation', () => {
    const baseQEConstitution: Constitution = {
      version: '1.0.0',
      name: 'qe-base',
      description: 'Base QE Fleet Constitution',
      principles: [
        {
          id: 'test-isolation',
          name: 'test_isolation',
          description: 'Tests must be independent and isolated',
          priority: 'high',
          enforceable: true
        },
        {
          id: 'meaningful-assertions',
          name: 'meaningful_assertions',
          description: 'Tests must have meaningful assertions',
          priority: 'high',
          enforceable: true
        },
        {
          id: 'appropriate-mocking',
          name: 'appropriate_mocking',
          description: 'Mock external dependencies appropriately',
          priority: 'medium',
          enforceable: true
        }
      ],
      constraints: [
        {
          id: 'min-coverage',
          type: 'coverage',
          description: 'Minimum coverage threshold',
          condition: 'coverage >= 70'
        },
        {
          id: 'max-duration',
          type: 'performance',
          description: 'Maximum test duration',
          condition: 'duration <= 30000'
        }
      ],
      capabilities: ['test_generation', 'coverage_analysis']
    };

    test('should validate base QE constitution', () => {
      const result = system.validate(baseQEConstitution);

      expect(result.valid).toBe(true);
    });

    test('should validate test generator constitution', () => {
      const testGenConstitution: Constitution = {
        version: '1.1.0',
        name: 'qe-test-generator',
        description: 'Test Generator Agent Constitution',
        principles: [
          ...baseQEConstitution.principles,
          {
            id: 'tdd-approach',
            name: 'tdd_approach',
            description: 'Follow TDD methodology',
            priority: 'high'
          }
        ],
        constraints: [
          {
            id: 'min-coverage',
            type: 'coverage',
            description: 'Higher coverage for test generator',
            condition: 'coverage >= 80'
          }
        ],
        capabilities: ['unit_test_generation', 'integration_test_generation', 'property_based_testing']
      };

      const result = system.register('qe-test-generator', testGenConstitution);

      expect(result.valid).toBe(true);
      expect(system.getForAgent('qe-test-generator')).toBeDefined();
    });

    test('should validate coverage analyzer constitution', () => {
      const coverageConstitution: Constitution = {
        version: '1.0.0',
        name: 'qe-coverage-analyzer',
        description: 'Coverage Analyzer Agent Constitution',
        principles: [
          {
            id: 'accuracy',
            name: 'accurate_analysis',
            description: 'Provide accurate coverage analysis',
            priority: 'high'
          },
          {
            id: 'gap-detection',
            name: 'gap_detection',
            description: 'Identify coverage gaps effectively',
            priority: 'high'
          }
        ],
        capabilities: ['coverage_analysis', 'gap_detection', 'trend_analysis']
      };

      const result = system.register('qe-coverage-analyzer', coverageConstitution);

      expect(result.valid).toBe(true);
    });

    test('should validate security scanner constitution', () => {
      const securityConstitution: Constitution = {
        version: '1.0.0',
        name: 'qe-security-scanner',
        description: 'Security Scanner Agent Constitution',
        principles: [
          {
            id: 'thorough-scanning',
            name: 'thorough_scanning',
            description: 'Perform thorough security scans',
            priority: 'high'
          },
          {
            id: 'false-positive-reduction',
            name: 'false_positive_reduction',
            description: 'Minimize false positives',
            priority: 'medium'
          }
        ],
        constraints: [
          {
            id: 'owasp-coverage',
            type: 'security',
            description: 'Cover OWASP top 10',
            condition: 'owasp_coverage >= 100'
          }
        ],
        capabilities: ['vulnerability_scanning', 'owasp_testing', 'dependency_audit']
      };

      const result = system.register('qe-security-scanner', securityConstitution);

      expect(result.valid).toBe(true);
    });
  });

  describe('Constitution Merging', () => {
    test('should validate and merge constitutions', () => {
      const base: Constitution = {
        version: '1.0.0',
        name: 'base',
        principles: [
          { id: 'p1', name: 'principle1', description: 'Base principle' }
        ]
      };

      const override: Constitution = {
        version: '2.0.0',
        name: 'override',
        principles: [
          { id: 'p2', name: 'principle2', description: 'Override principle' }
        ]
      };

      const result = system.validateAndMerge('test-agent', base, override);

      expect(result.valid).toBe(true);

      const merged = system.getForAgent('test-agent');
      expect(merged?.version).toBe('2.0.0');
      expect(merged?.principles).toHaveLength(2);
    });

    test('should reject merge when base is invalid', () => {
      const invalidBase = {
        name: 'invalid'
        // Missing version and principles
      } as Constitution;

      const validOverride: Constitution = {
        version: '1.0.0',
        name: 'valid',
        principles: []
      };

      const result = system.validateAndMerge('test-agent', invalidBase, validOverride);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Base:'))).toBe(true);
    });

    test('should reject merge when override is invalid', () => {
      const validBase: Constitution = {
        version: '1.0.0',
        name: 'valid',
        principles: []
      };

      const invalidOverride = {
        name: 'invalid'
        // Missing version and principles
      } as Constitution;

      const result = system.validateAndMerge('test-agent', validBase, invalidOverride);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Override:'))).toBe(true);
    });

    test('should override principles with same ID', () => {
      const base: Constitution = {
        version: '1.0.0',
        name: 'base',
        principles: [
          { id: 'p1', name: 'original', description: 'Original', priority: 'low' }
        ]
      };

      const override: Constitution = {
        version: '1.0.0',
        name: 'base',
        principles: [
          { id: 'p1', name: 'updated', description: 'Updated', priority: 'high' }
        ]
      };

      const result = system.validateAndMerge('test-agent', base, override);

      expect(result.valid).toBe(true);

      const merged = system.getForAgent('test-agent');
      expect(merged?.principles).toHaveLength(1);
      expect(merged?.principles[0].name).toBe('updated');
      expect(merged?.principles[0].priority).toBe('high');
    });
  });

  describe('Validation History', () => {
    test('should track validation history', () => {
      system.register('agent-1', validFixture);
      system.register('agent-2', validFixture);

      const history = system.getValidationHistory();

      expect(history).toHaveLength(2);
      expect(history[0].agentId).toBe('agent-1');
      expect(history[1].agentId).toBe('agent-2');
    });

    test('should record timestamps in history', () => {
      const before = new Date().toISOString();
      system.register('test-agent', validFixture);
      const after = new Date().toISOString();

      const history = system.getValidationHistory();

      expect(history[0].timestamp >= before).toBe(true);
      expect(history[0].timestamp <= after).toBe(true);
    });

    test('should record failed validations in history', () => {
      const invalid = invalidFixture.invalidExamples[0].constitution;
      system.register('invalid-agent', invalid);

      const history = system.getValidationHistory();

      expect(history).toHaveLength(1);
      expect(history[0].result.valid).toBe(false);
    });
  });

  describe('Fleet-wide Constitution Management', () => {
    test('should register all QE fleet agents', () => {
      const agents = [
        'qe-test-generator',
        'qe-coverage-analyzer',
        'qe-security-scanner',
        'qe-performance-tester',
        'qe-quality-gate'
      ];

      for (const agentId of agents) {
        const constitution: Constitution = {
          version: '1.0.0',
          name: agentId,
          principles: [
            { id: 'core', name: 'core_principle', description: 'Core' }
          ]
        };

        const result = system.register(agentId, constitution);
        expect(result.valid).toBe(true);
      }

      const registered = system.listRegistered();
      expect(registered).toHaveLength(agents.length);
    });

    test('should generate warnings for empty principles', () => {
      const constitution: Constitution = {
        version: '1.0.0',
        name: 'empty-principles',
        principles: []
      };

      const result = system.validate(constitution);

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('no principles'))).toBe(true);
    });
  });

  describe('Error Recovery', () => {
    test('should continue after validation failure', () => {
      // First attempt fails
      const invalid = invalidFixture.invalidExamples[0].constitution;
      const result1 = system.register('agent', invalid);
      expect(result1.valid).toBe(false);

      // Second attempt succeeds
      const result2 = system.register('agent', validFixture);
      expect(result2.valid).toBe(true);

      // Agent should have valid constitution
      expect(system.getForAgent('agent')).toEqual(validFixture);
    });

    test('should handle multiple validation errors gracefully', () => {
      const veryInvalid = {
        // Missing everything
      };

      const result = system.validate(veryInvalid);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});
