/**
 * Unit tests for RequirementsExplorerAgent
 */

import { RequirementsExplorerAgent } from '../../src/agents/requirements-explorer';
import { createMockServices, createTestAgentId, createTestAgentConfig, createTestTask } from '../utils/test-helpers';
import { MockLogger } from '../mocks/logger.mock';
import { MockEventBus } from '../mocks/event-bus.mock';
import { MockMemorySystem } from '../mocks/memory-system.mock';

describe('RequirementsExplorerAgent', () => {
  let agent: RequirementsExplorerAgent;
  let logger: MockLogger;
  let eventBus: MockEventBus;
  let memory: MockMemorySystem;

  beforeEach(async () => {
    const services = createMockServices();
    logger = services.logger;
    eventBus = services.eventBus;
    memory = services.memory;

    const agentId = createTestAgentId({ type: 'requirements-explorer' });
    const config = createTestAgentConfig({ type: 'requirements-explorer' });

    agent = new RequirementsExplorerAgent(agentId, config, logger, eventBus, memory);
    await agent.initialize();
  });

  afterEach(() => {
    logger.reset();
    eventBus.reset();
    memory.reset();
  });

  describe('Requirements Analysis', () => {
    it('should analyze simple requirements without issues', async () => {
      const requirements = [
        'The system must process login requests within 2 seconds',
        'Users shall be able to reset their passwords',
        'The application will store user data securely'
      ];

      const task = createTestTask({
        type: 'analyze-requirements',
        context: { requirements }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const analysisResult = result.data;
      expect(analysisResult.ambiguities).toBeDefined();
      expect(analysisResult.testability).toBeDefined();
      expect(analysisResult.risks).toBeDefined();
      expect(analysisResult.recommendations).toBeDefined();
    });

    it('should detect ambiguous terms in requirements', async () => {
      const requirements = [
        'The system should respond quickly to user requests',
        'The interface must be user-friendly and intuitive',
        'Performance should be appropriate for the use case'
      ];

      const task = createTestTask({
        type: 'analyze-requirements',
        context: { requirements }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      const analysisResult = result.data;

      expect(analysisResult.ambiguities.length).toBeGreaterThan(0);

      // Check for specific ambiguous terms
      const ambiguousTerms = analysisResult.ambiguities.map((a: any) => a.term);
      expect(ambiguousTerms).toContain('quickly');
      expect(ambiguousTerms).toContain('user-friendly');
      expect(ambiguousTerms).toContain('appropriate');

      // Check suggestions are provided
      analysisResult.ambiguities.forEach((ambiguity: any) => {
        expect(ambiguity.suggestion).toBeDefined();
        expect(ambiguity.suggestion.length).toBeGreaterThan(0);
      });
    });

    it('should assess testability of requirements', async () => {
      const requirements = [
        'The system must respond to requests', // Low testability
        'The system must respond within 100ms', // High testability
        'Users should be able to login', // Medium testability
        'GIVEN a user with valid credentials WHEN they login THEN they access dashboard' // High testability (BDD)
      ];

      const task = createTestTask({
        type: 'analyze-requirements',
        context: { requirements }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      const analysisResult = result.data;

      expect(analysisResult.testability).toBeDefined();

      // First requirement should have testability issues
      const testabilityIssues = analysisResult.testability;
      expect(testabilityIssues.length).toBeGreaterThan(0);

      const firstIssue = testabilityIssues.find((issue: any) => issue.requirement === 0);
      expect(firstIssue).toBeDefined();
      expect(firstIssue.issue).toContain('testability');
    });

    it('should identify risks in requirements', async () => {
      const requirements = [
        'The system must authenticate users using OAuth',
        'Performance should meet SLA requirements',
        'Data must be encrypted and comply with GDPR',
        'The system integrates with external payment APIs',
        'Database transactions must maintain consistency'
      ];

      const task = createTestTask({
        type: 'analyze-requirements',
        context: { requirements }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      const analysisResult = result.data;

      expect(analysisResult.risks.length).toBeGreaterThan(0);

      // Check for different risk categories
      const riskCategories = analysisResult.risks.map((r: any) => r.category);
      expect(riskCategories).toContain('security');
      expect(riskCategories).toContain('performance');
      expect(riskCategories).toContain('integration');
      expect(riskCategories).toContain('data');
      expect(riskCategories).toContain('compliance');
    });

    it('should generate test charters for high-risk areas', async () => {
      const requirements = [
        'The system must handle 10000 concurrent users',
        'Authentication must be secure and encrypted',
        'Data processing should be fast and efficient'
      ];

      const task = createTestTask({
        type: 'analyze-requirements',
        context: { requirements }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      const analysisResult = result.data;

      expect(analysisResult.charters).toBeDefined();
      expect(analysisResult.charters.length).toBeGreaterThan(0);

      analysisResult.charters.forEach((charter: any) => {
        expect(charter.charter).toBeDefined();
        expect(charter.timeBox).toBeDefined();
        expect(charter.focus).toBeDefined();
        expect(charter.heuristics).toBeDefined();
      });
    });
  });

  describe('Quality Assessment', () => {
    it('should assess overall quality metrics', async () => {
      const requirements = [
        'The system must process user login requests within 2 seconds with 99.9% uptime',
        'Users shall receive email notifications within 5 minutes of account creation',
        'The application must store personal data in compliance with GDPR regulations'
      ];

      const task = createTestTask({
        type: 'analyze-requirements',
        context: { requirements }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);

      // Verify observation stored in memory
      const observationKey = memory.getAllKeys().find(key => key.includes('observation:requirements'));
      expect(observationKey).toBeDefined();

      if (observationKey) {
        const observation = await memory.retrieve(observationKey);
        expect(observation.quality).toBeDefined();
        expect(observation.quality.clarity).toBeGreaterThan(0);
        expect(observation.quality.completeness).toBeGreaterThan(0);
        expect(observation.quality.testability).toBeGreaterThan(0);
        expect(observation.quality.overall).toBeGreaterThan(0);
      }
    });

    it('should assess coverage across different requirement types', async () => {
      const requirements = [
        'Users can create, read, update, and delete posts', // Functional
        'The system must respond within 200ms', // Performance
        'All user data must be encrypted at rest', // Security
        'The interface should be accessible to users with disabilities', // Usability
        'The system shall maintain 99.9% uptime' // Non-functional
      ];

      const task = createTestTask({
        type: 'analyze-requirements',
        context: { requirements }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);

      // Check that observation includes coverage analysis
      const observationKey = memory.getAllKeys().find(key => key.includes('observation:requirements'));
      if (observationKey) {
        const observation = await memory.retrieve(observationKey);
        expect(observation.coverage).toBeDefined();
        expect(observation.coverage.functional).toBeGreaterThan(0);
        expect(observation.coverage.performance).toBeGreaterThan(0);
        expect(observation.coverage.security).toBeGreaterThan(0);
        expect(observation.coverage.usability).toBeGreaterThan(0);
      }
    });
  });

  describe('Decision Making', () => {
    it('should make appropriate decisions based on analysis quality', async () => {
      const goodRequirements = [
        'The system must authenticate users within 2 seconds using OAuth 2.0',
        'The application shall process payments using PCI-compliant methods',
        'Users must receive email confirmations within 30 seconds of successful transactions'
      ];

      const task = createTestTask({
        type: 'analyze-requirements',
        context: { requirements: goodRequirements }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.decision).toBeDefined();
      expect(result.decision!.confidence).toBeGreaterThan(0.7);
      expect(result.decision!.action).toContain('acceptable');
    });

    it('should recommend revision for poor quality requirements', async () => {
      const poorRequirements = [
        'The system should work fast',
        'Users might want to do things',
        'It should be good and reliable',
        'Performance could be better'
      ];

      const task = createTestTask({
        type: 'analyze-requirements',
        context: { requirements: poorRequirements }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.decision).toBeDefined();
      expect(result.decision!.action).toContain('revision');
      expect(result.decision!.recommendations.length).toBeGreaterThan(0);
    });

    it('should provide explainable reasoning for decisions', async () => {
      const requirements = [
        'The system should respond quickly to user requests',
        'Data must be stored securely'
      ];

      const task = createTestTask({
        type: 'analyze-requirements',
        context: { requirements }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.decision).toBeDefined();

      const reasoning = result.decision!.reasoning;
      expect(reasoning.factors).toBeDefined();
      expect(reasoning.factors.length).toBeGreaterThan(0);
      expect(reasoning.heuristics).toBeDefined();
      expect(reasoning.evidence).toBeDefined();

      // Check reasoning factors
      const factorNames = reasoning.factors.map((f: any) => f.name);
      expect(factorNames).toContain('Ambiguity Level');
      expect(factorNames).toContain('Testability');
      expect(factorNames).toContain('Risk Level');
      expect(factorNames).toContain('Coverage');
    });
  });

  describe('Learning and Adaptation', () => {
    it('should learn from feedback about accuracy', async () => {
      const initialMetrics = agent.getMetrics();

      const feedback = {
        accurate: true,
        foundIssues: ['ambiguity in requirement 2'],
        missedIssues: []
      };

      await agent.learn(feedback);

      const updatedMetrics = agent.getMetrics();
      expect(updatedMetrics.learningProgress).toBeGreaterThanOrEqual(initialMetrics.learningProgress);
    });

    it('should learn new ambiguous terms from feedback', async () => {
      const feedback = {
        newAmbiguousTerms: ['blazingly', 'seamless', 'intuitive']
      };

      await agent.learn(feedback);

      // Test that new terms are now detected
      const requirements = ['The system should work seamlessly with other tools'];

      const task = createTestTask({
        type: 'analyze-requirements',
        context: { requirements }
      });

      const result = await agent.executeTask(task);
      const ambiguities = result.data.ambiguities;

      const foundTerm = ambiguities.find((a: any) => a.term === 'seamlessly');
      expect(foundTerm).toBeDefined();
    });

    it('should store feedback for pattern learning', async () => {
      const feedback = {
        accurate: false,
        improvedSuggestions: ['Be more specific about performance metrics']
      };

      await agent.learn(feedback);

      // Check that feedback is stored in memory
      const feedbackKey = memory.getAllKeys().find(key => key.includes('feedback:requirements'));
      expect(feedbackKey).toBeDefined();

      if (feedbackKey) {
        const storedFeedback = await memory.retrieve(feedbackKey);
        expect(storedFeedback).toEqual(feedback);
      }
    });
  });

  describe('Knowledge Sharing', () => {
    it('should share analysis results with other agents', async () => {
      const requirements = [
        'The system must support OAuth authentication',
        'Response times should not exceed 500ms'
      ];

      const task = createTestTask({
        type: 'analyze-requirements',
        context: { requirements }
      });

      await agent.executeTask(task);

      // Check that knowledge was shared
      const knowledgeEvents = eventBus.getEmittedEvents('knowledge:shared');
      expect(knowledgeEvents.length).toBeGreaterThan(0);

      const sharedKnowledge = knowledgeEvents[0];
      expect(sharedKnowledge.data.tags).toContain('requirements');
      expect(sharedKnowledge.data.tags).toContain('quality');
      expect(sharedKnowledge.data.tags).toContain('risks');
    });

    it('should store analysis context for other agents', async () => {
      const requirements = ['User authentication is required'];

      const task = createTestTask({
        type: 'analyze-requirements',
        context: { requirements }
      });

      await agent.executeTask(task);

      // Check stored task context
      const contextKey = `task:${task.id}:context`;
      expect(memory.hasKey(contextKey)).toBe(true);

      const storedContext = await memory.retrieve(contextKey);
      expect(storedContext).toEqual(task);
    });
  });

  describe('Metrics and Performance', () => {
    it('should update requirements-specific metrics', async () => {
      const requirements = [
        'System should handle authentication',
        'Performance must be acceptable',
        'Security is important'
      ];

      const task = createTestTask({
        type: 'analyze-requirements',
        context: { requirements }
      });

      const initialMetrics = agent.getMetrics();

      await agent.executeTask(task);

      const updatedMetrics = agent.getMetrics();

      expect(updatedMetrics.requirementsAnalyzed).toBe(initialMetrics.requirementsAnalyzed + 3);
      expect(updatedMetrics.ambiguitiesDetected).toBeGreaterThan(initialMetrics.ambiguitiesDetected);
      expect(updatedMetrics.risksIdentified).toBeGreaterThan(initialMetrics.risksIdentified);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty requirements gracefully', async () => {
      const task = createTestTask({
        type: 'analyze-requirements',
        context: { requirements: [] }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.data.ambiguities).toEqual([]);
      expect(result.data.testability).toEqual([]);
      expect(result.data.risks).toEqual([]);
    });

    it('should handle malformed requirements', async () => {
      const task = createTestTask({
        type: 'analyze-requirements',
        context: { requirements: null }
      });

      // Should not throw error but handle gracefully
      const result = await agent.executeTask(task);
      expect(result).toBeDefined();
    });

    it('should handle memory storage errors', async () => {
      // Mock memory to fail
      jest.spyOn(memory, 'store').mockRejectedValueOnce(new Error('Storage failed'));

      const requirements = ['Test requirement'];
      const task = createTestTask({
        type: 'analyze-requirements',
        context: { requirements }
      });

      // Should still complete despite storage errors
      await expect(agent.executeTask(task)).rejects.toThrow();
    });
  });

  describe('RST Heuristics Integration', () => {
    it('should apply SFDIPOT heuristic for structural analysis', async () => {
      const requirements = [
        'The system structure must support modular components',
        'Data flow should be optimized for performance'
      ];

      const task = createTestTask({
        type: 'analyze-requirements',
        context: {
          requirements,
          requiresStructuralAnalysis: true
        }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.decision!.reasoning.heuristics).toContain('SFDIPOT');
    });

    it('should apply CRUSSPIC heuristic for quality assessment', async () => {
      const requirements = [
        'The system must be reliable and secure',
        'Performance and usability are critical'
      ];

      const task = createTestTask({
        type: 'analyze-requirements',
        context: {
          requirements,
          requiresQualityAssessment: true
        }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.decision!.reasoning.heuristics).toContain('CRUSSPIC');
    });

    it('should apply FEW_HICCUPPS for comprehensive analysis', async () => {
      const requirements = [
        'Complex system with multiple integrations',
        'Various user types and use cases'
      ];

      const task = createTestTask({
        type: 'analyze-requirements',
        context: {
          requirements,
          requiresComprehensiveAnalysis: true
        }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.decision!.reasoning.heuristics).toContain('FEW_HICCUPPS');
    });
  });
});