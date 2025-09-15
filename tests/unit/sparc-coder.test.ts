/**
 * Unit tests for SPARCCoderAgent
 */

import { SPARCCoderAgent } from '../../src/agents/sparc-coder';
import { createMockServices, createTestAgentId, createTestAgentConfig, createTestTask } from '../utils/test-helpers';
import { MockLogger } from '../mocks/logger.mock';
import { MockEventBus } from '../mocks/event-bus.mock';
import { MockMemorySystem } from '../mocks/memory-system.mock';

describe('SPARCCoderAgent', () => {
  let agent: SPARCCoderAgent;
  let logger: MockLogger;
  let eventBus: MockEventBus;
  let memory: MockMemorySystem;

  beforeEach(async () => {
    const services = createMockServices();
    logger = services.logger;
    eventBus = services.eventBus;
    memory = services.memory;

    const agentId = createTestAgentId({ type: 'sparc-coder' });
    const config = createTestAgentConfig({ type: 'sparc-coder' });

    agent = new SPARCCoderAgent(agentId, config, logger, eventBus, memory);
    await agent.initialize();
  });

  afterEach(() => {
    logger.reset();
    eventBus.reset();
    memory.reset();
  });

  describe('SPARC Context Analysis', () => {
    it('should analyze coding context with SPARC artifacts', async () => {
      const project = 'test-project';
      const feature = 'user-auth';

      // Pre-populate memory with SPARC artifacts
      await memory.store(`sparc_specification:${project}:${feature}`, {
        requirements: ['User authentication required'],
        acceptance_criteria: ['Login within 2 seconds']
      });

      await memory.store(`sparc_pseudocode:${project}:${feature}`, {
        algorithms: ['hash password', 'validate credentials'],
        flow: 'request -> validate -> response'
      });

      await memory.store(`sparc_architecture:${project}:${feature}`, {
        components: ['AuthController', 'UserService', 'TokenManager'],
        patterns: ['MVC', 'Repository']
      });

      const task = createTestTask({
        type: 'sparc-specification',
        context: {
          project,
          feature,
          test_framework: 'jest',
          target_coverage: 0.9
        }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      // Verify coding context was stored
      const contextKey = `sparc_coding_context:${project}:${feature}`;
      expect(memory.hasKey(contextKey)).toBe(true);

      const storedContext = await memory.retrieve(contextKey);
      expect(storedContext.specification).toBeDefined();
      expect(storedContext.pseudocode).toBeDefined();
      expect(storedContext.architecture).toBeDefined();
      expect(storedContext.test_framework).toBe('jest');
      expect(storedContext.target_coverage).toBe(0.9);
    });

    it('should handle missing SPARC artifacts gracefully', async () => {
      const task = createTestTask({
        type: 'sparc-specification',
        context: {
          project: 'new-project',
          feature: 'new-feature',
          specification: { requirements: ['Basic requirement'] },
          test_framework: 'mocha'
        }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);

      // Should use provided context when artifacts not in memory
      const contextKey = memory.getAllKeys().find(key => key.includes('sparc_coding_context'));
      expect(contextKey).toBeDefined();

      if (contextKey) {
        const context = await memory.retrieve(contextKey);
        expect(context.test_framework).toBe('mocha');
        expect(context.specification.requirements).toEqual(['Basic requirement']);
      }
    });
  });

  describe('TDD Cycle Management', () => {
    it('should start first TDD cycle correctly', async () => {
      const task = createTestTask({
        type: 'sparc-specification',
        context: {
          project: 'tdd-project',
          feature: 'calculator',
          specification: { requirements: ['Add two numbers'] },
          pseudocode: { steps: ['validate inputs', 'add', 'return result'] }
        }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('started');
      expect(result.data.cycle_number).toBe(1);
      expect(result.data.next_phase).toBe('red');

      // Verify action was stored
      const actionKey = memory.getAllKeys().find(key => key.includes('sparc_coding_action'));
      expect(actionKey).toBeDefined();
    });

    it('should execute RED phase of TDD cycle', async () => {
      // Setup: Start a TDD cycle first
      const startTask = createTestTask({
        type: 'sparc-specification',
        context: {
          project: 'red-phase-test',
          feature: 'validation',
          specification: { requirements: ['Input validation'] }
        }
      });

      await agent.executeTask(startTask);

      // Execute RED phase
      const redTask = createTestTask({
        type: 'sparc-specification',
        context: {
          project: 'red-phase-test',
          feature: 'validation'
        }
      });

      // Mock decision to return red phase
      const originalDecide = agent.decide;
      jest.spyOn(agent, 'decide').mockImplementationOnce(async (observation) => {
        const decision = await originalDecide.call(agent, observation);
        decision.action = 'tdd_red';
        decision.parameters = {
          projectKey: 'red-phase-test:validation',
          cycle_number: 1,
          current_cycle: {
            red_phase: { tests: [], failing_test_count: 0 },
            green_phase: { implementation: [], passing_test_count: 0 },
            refactor_phase: { refactored_code: [], quality_improvements: [] },
            cycle_number: 1,
            completed: false
          }
        };
        return decision;
      });

      const result = await agent.executeTask(redTask);

      expect(result.success).toBe(true);
      expect(result.data.phase).toBe('red');
      expect(result.data.tests_generated).toBeGreaterThan(0);
      expect(result.data.artifacts).toBeDefined();
      expect(result.data.artifacts.length).toBeGreaterThan(0);
    });

    it('should execute GREEN phase of TDD cycle', async () => {
      const task = createTestTask({
        type: 'sparc-specification',
        context: {
          project: 'green-phase-test',
          feature: 'implementation'
        }
      });

      // Mock decision to return green phase
      jest.spyOn(agent, 'decide').mockImplementationOnce(async (observation) => {
        return {
          id: 'green-decision',
          agentId: agent.getState().id.id,
          timestamp: new Date(),
          action: 'tdd_green',
          parameters: {
            projectKey: 'green-phase-test:implementation',
            cycle_number: 1,
            current_cycle: {
              red_phase: { tests: [{ type: 'test', content: 'test code' }], failing_test_count: 1 },
              green_phase: { implementation: [], passing_test_count: 0 },
              refactor_phase: { refactored_code: [], quality_improvements: [] },
              cycle_number: 1,
              completed: false
            }
          },
          reasoning: { factors: [], heuristics: [], evidence: [] },
          confidence: 0.8,
          alternatives: [],
          risks: [],
          recommendations: []
        };
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.data.phase).toBe('green');
      expect(result.data.implementation_generated).toBeGreaterThan(0);
      expect(result.data.passing_tests).toBeGreaterThan(0);
    });

    it('should execute REFACTOR phase of TDD cycle', async () => {
      const task = createTestTask({
        type: 'sparc-specification',
        context: {
          project: 'refactor-phase-test',
          feature: 'optimization'
        }
      });

      // Mock decision to return refactor phase
      jest.spyOn(agent, 'decide').mockImplementationOnce(async (observation) => {
        return {
          id: 'refactor-decision',
          agentId: agent.getState().id.id,
          timestamp: new Date(),
          action: 'tdd_refactor',
          parameters: {
            projectKey: 'refactor-phase-test:optimization',
            cycle_number: 1,
            current_cycle: {
              red_phase: { tests: [{ type: 'test', content: 'test' }], failing_test_count: 1 },
              green_phase: {
                implementation: [{ type: 'implementation', content: 'impl' }],
                passing_test_count: 1
              },
              refactor_phase: { refactored_code: [], quality_improvements: [] },
              cycle_number: 1,
              completed: false
            }
          },
          reasoning: { factors: [], heuristics: [], evidence: [] },
          confidence: 0.8,
          alternatives: [],
          risks: [],
          recommendations: []
        };
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.data.phase).toBe('refactor');
      expect(result.data.refactored_files).toBeGreaterThan(0);
      expect(result.data.quality_improvements).toBeDefined();
      expect(result.data.cycle_completed).toBe(true);
    });
  });

  describe('Code Quality Assessment', () => {
    it('should assess code quality and coverage', async () => {
      const task = createTestTask({
        type: 'sparc-specification',
        context: {
          project: 'quality-test',
          feature: 'assessment',
          target_coverage: 0.95,
          quality_gates: {
            min_test_coverage: 0.9,
            max_complexity: 8,
            min_code_quality: 0.85
          }
        }
      });

      // Mock decision for completion with quality metrics
      jest.spyOn(agent, 'decide').mockImplementationOnce(async (observation) => {
        return {
          id: 'complete-decision',
          agentId: agent.getState().id.id,
          timestamp: new Date(),
          action: 'complete_coding',
          parameters: {
            projectKey: 'quality-test:assessment',
            total_cycles: 2,
            final_coverage: 0.92,
            final_quality: 0.88,
            artifacts: [
              { type: 'test', filename: 'test.spec.ts', test_coverage: 0.9 },
              { type: 'implementation', filename: 'impl.ts', quality_score: 0.85 }
            ]
          },
          reasoning: { factors: [], heuristics: [], evidence: [] },
          confidence: 0.9,
          alternatives: [],
          risks: [],
          recommendations: []
        };
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.data.final_coverage).toBeGreaterThan(0.9);
      expect(result.data.final_quality).toBeGreaterThan(0.8);
      expect(result.data.total_cycles).toBeGreaterThan(0);

      // Verify artifacts were stored
      const artifactsKey = memory.getAllKeys().find(key => key.includes('sparc_coding_artifacts'));
      expect(artifactsKey).toBeDefined();
    });

    it('should require additional cycles when quality gates not met', async () => {
      const task = createTestTask({
        type: 'sparc-specification',
        context: {
          project: 'quality-fail-test',
          feature: 'improvement',
          target_coverage: 0.9,
          quality_gates: {
            min_code_quality: 0.8
          }
        }
      });

      // Mock decision for additional cycle needed
      jest.spyOn(agent, 'decide').mockImplementationOnce(async (observation) => {
        return {
          id: 'additional-cycle-decision',
          agentId: agent.getState().id.id,
          timestamp: new Date(),
          action: 'start_tdd_cycle',
          parameters: {
            projectKey: 'quality-fail-test:improvement',
            cycle_number: 2,
            focus_areas: ['code_quality'],
            previous_learnings: {
              successful_patterns: [],
              common_issues: ['complexity'],
              optimization_opportunities: ['refactoring']
            }
          },
          reasoning: {
            factors: [
              { name: 'quality_gap', weight: 0.5, value: 0.15, impact: 'negative', explanation: 'Quality below threshold' }
            ],
            heuristics: ['RCRCRC'],
            evidence: []
          },
          confidence: 0.75,
          alternatives: [],
          risks: [],
          recommendations: []
        };
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.data.cycle_number).toBe(2);
      expect(result.data.focus_areas).toContain('code_quality');
    });
  });

  describe('Learning and Adaptation', () => {
    it('should learn from test results feedback', async () => {
      const feedback = {
        test_results: {
          coverage: 0.75,  // Below threshold
          complexity: 12,  // Above threshold
          passed: 8,
          failed: 2
        }
      };

      const initialMetrics = { ...agent['qualityMetrics'] };

      await agent.learn(feedback);

      // Quality thresholds should be adjusted
      const updatedMetrics = agent['qualityMetrics'];
      expect(updatedMetrics.min_test_coverage).toBeGreaterThan(initialMetrics.min_test_coverage);
      expect(updatedMetrics.max_complexity).toBeLessThan(initialMetrics.max_complexity);

      // Learning should be stored
      const learningKey = memory.getAllKeys().find(key => key.includes('sparc_coder_learning'));
      expect(learningKey).toBeDefined();

      if (learningKey) {
        const learningData = await memory.retrieve(learningKey);
        expect(learningData.feedback).toEqual(feedback);
        expect(learningData.qualityMetrics).toBeDefined();
      }
    });

    it('should learn from code review feedback', async () => {
      const feedback = {
        code_review: {
          quality_score: 0.7,  // Below threshold
          issues: ['naming conventions', 'code duplication'],
          suggestions: ['extract methods', 'use constants']
        }
      };

      await agent.learn(feedback);

      // Quality thresholds should be adjusted
      const updatedMetrics = agent['qualityMetrics'];
      expect(updatedMetrics.min_code_quality).toBeGreaterThan(0.8);
    });
  });

  describe('Code Generation', () => {
    it('should generate test code for TDD red phase', async () => {
      // Access private method for testing
      const testCode = agent['generateTestCode']({
        cycle_number: 1,
        red_phase: { tests: [], failing_test_count: 0 },
        green_phase: { implementation: [], passing_test_count: 0 },
        refactor_phase: { refactored_code: [], quality_improvements: [] },
        completed: false
      });

      expect(testCode).toContain('describe');
      expect(testCode).toContain('test');
      expect(testCode).toContain('expect');
      expect(testCode.trim().length).toBeGreaterThan(0);
    });

    it('should generate implementation code for TDD green phase', async () => {
      const implementationCode = agent['generateImplementationCode']({
        cycle_number: 1,
        red_phase: { tests: [{ type: 'test', content: 'test' }], failing_test_count: 1 },
        green_phase: { implementation: [], passing_test_count: 0 },
        refactor_phase: { refactored_code: [], quality_improvements: [] },
        completed: false
      });

      expect(implementationCode).toContain('export');
      expect(implementationCode).toContain('class');
      expect(implementationCode).toContain('execute');
      expect(implementationCode.trim().length).toBeGreaterThan(0);
    });

    it('should refactor code for TDD refactor phase', async () => {
      const originalArtifact = {
        type: 'implementation' as const,
        filename: 'test.ts',
        content: 'export class Test { execute() { return true; } }',
        language: 'typescript',
        dependencies: []
      };

      const refactoredCode = agent['refactorCode'](originalArtifact);

      expect(refactoredCode).toContain('export');
      expect(refactoredCode).toContain('class');
      expect(refactoredCode).toContain('private'); // Should extract private methods
      expect(refactoredCode.length).toBeGreaterThan(originalArtifact.content.length);
    });
  });

  describe('Decision Logic', () => {
    it('should determine next TDD phase correctly', async () => {
      // Test empty cycle - should go to RED
      const emptyCycle = {
        cycle_number: 1,
        red_phase: { tests: [], failing_test_count: 0 },
        green_phase: { implementation: [], passing_test_count: 0 },
        refactor_phase: { refactored_code: [], quality_improvements: [] },
        completed: false
      };

      const nextPhase1 = agent['determineNextTDDPhase'](emptyCycle);
      expect(nextPhase1).toBe('red');

      // Test with RED complete - should go to GREEN
      const redCompleteCycle = {
        ...emptyCycle,
        red_phase: { tests: [{ type: 'test', content: 'test' }], failing_test_count: 1 }
      };

      const nextPhase2 = agent['determineNextTDDPhase'](redCompleteCycle);
      expect(nextPhase2).toBe('green');

      // Test with GREEN complete - should go to REFACTOR
      const greenCompleteCycle = {
        ...redCompleteCycle,
        green_phase: { implementation: [{ type: 'impl', content: 'impl' }], passing_test_count: 1 }
      };

      const nextPhase3 = agent['determineNextTDDPhase'](greenCompleteCycle);
      expect(nextPhase3).toBe('refactor');

      // Test with all phases complete
      const completeCycle = {
        ...greenCompleteCycle,
        refactor_phase: { refactored_code: [{ type: 'refactored', content: 'refactored' }], quality_improvements: ['improved'] }
      };

      const nextPhase4 = agent['determineNextTDDPhase'](completeCycle);
      expect(nextPhase4).toBe('complete');
    });

    it('should calculate overall coverage and quality correctly', async () => {
      const cycles = [
        {
          cycle_number: 1,
          red_phase: { tests: [{ type: 'test', test_coverage: 0.8, quality_score: 0.9 }], failing_test_count: 1 },
          green_phase: { implementation: [{ type: 'impl', test_coverage: 0.85, quality_score: 0.8 }], passing_test_count: 1 },
          refactor_phase: { refactored_code: [{ type: 'refactor', test_coverage: 0.9, quality_score: 0.85 }], quality_improvements: [] },
          completed: true
        }
      ];

      const coverage = agent['calculateOverallCoverage'](cycles);
      const quality = agent['calculateOverallQuality'](cycles);

      expect(coverage).toBeCloseTo(0.85, 1); // Average of 0.8, 0.85, 0.9
      expect(quality).toBeCloseTo(0.85, 1);  // Average of 0.9, 0.8, 0.85
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown actions gracefully', async () => {
      const task = createTestTask({
        type: 'sparc-specification',
        context: { project: 'error-test', feature: 'unknown' }
      });

      // Mock decision with unknown action
      jest.spyOn(agent, 'decide').mockImplementationOnce(async () => ({
        id: 'unknown-decision',
        agentId: agent.getState().id.id,
        timestamp: new Date(),
        action: 'unknown_action',
        parameters: {},
        reasoning: { factors: [], heuristics: [], evidence: [] },
        confidence: 0.5,
        alternatives: [],
        risks: [],
        recommendations: []
      }));

      const result = await agent.executeTask(task);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown action');
      expect(logger.warnCalls).toHaveLength(1);
    });

    it('should handle memory storage errors', async () => {
      // Mock memory to fail on store
      jest.spyOn(memory, 'store').mockRejectedValueOnce(new Error('Storage failed'));

      const task = createTestTask({
        type: 'sparc-specification',
        context: { project: 'memory-error', feature: 'test' }
      });

      await expect(agent.executeTask(task)).rejects.toThrow();
    });

    it('should handle missing context gracefully', async () => {
      const task = createTestTask({
        type: 'sparc-specification',
        context: {} // Empty context
      });

      const result = await agent.executeTask(task);

      // Should handle gracefully with defaults
      expect(result.success).toBe(true);
    });
  });

  describe('Integration with SPARC Phases', () => {
    it('should integrate with complete SPARC workflow', async () => {
      const project = 'integration-test';
      const feature = 'complete-flow';

      // Setup complete SPARC context
      const sparcData = {
        specification: {
          requirements: ['User authentication', 'Session management'],
          acceptance_criteria: ['Login succeeds within 2s', 'Session expires after 30min']
        },
        pseudocode: {
          algorithms: ['validate_credentials', 'create_session', 'expire_session'],
          data_structures: ['User', 'Session', 'Token']
        },
        architecture: {
          components: ['AuthController', 'SessionService', 'UserRepository'],
          patterns: ['MVC', 'Repository', 'Factory'],
          interfaces: ['IAuthService', 'IUserRepository']
        }
      };

      // Store SPARC artifacts
      await memory.store(`sparc_specification:${project}:${feature}`, sparcData.specification);
      await memory.store(`sparc_pseudocode:${project}:${feature}`, sparcData.pseudocode);
      await memory.store(`sparc_architecture:${project}:${feature}`, sparcData.architecture);

      const task = createTestTask({
        type: 'sparc-specification',
        context: {
          project,
          feature,
          test_framework: 'jest',
          coding_standards: ['typescript', 'clean-code', 'solid'],
          target_coverage: 0.95,
          quality_gates: {
            min_test_coverage: 0.9,
            max_complexity: 8,
            min_code_quality: 0.85
          }
        }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);

      // Verify coding context includes all SPARC data
      const contextKey = `sparc_coding_context:${project}:${feature}`;
      expect(memory.hasKey(contextKey)).toBe(true);

      const context = await memory.retrieve(contextKey);
      expect(context.specification).toEqual(sparcData.specification);
      expect(context.pseudocode).toEqual(sparcData.pseudocode);
      expect(context.architecture).toEqual(sparcData.architecture);
      expect(context.coding_standards).toContain('typescript');
      expect(context.coding_standards).toContain('clean-code');
    });
  });
});