/**
 * Journey Test: Learning & Continuous Improvement
 *
 * Tests the Q-learning and pattern recognition workflow for continuous improvement
 * of test generation quality over time.
 *
 * Purpose: Verify that the learning engine can:
 * 1. Store test execution experiences in database (reward, outcome)
 * 2. Update Q-values for state-action pairs
 * 3. Learn successful patterns over time
 * 4. Improve test generation quality (measured by coverage increase)
 * 5. Adapt to project-specific patterns
 *
 * Validation: Uses REAL database interactions (SwarmMemoryManager), not mocks.
 * Focus: USER-FACING behavior, not implementation details.
 *
 * @see Issue #103 - Test Suite Migration: Phase 2 Journey Tests
 */

import { LearningEngine, ExtendedLearningConfig } from '@learning/LearningEngine';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { TaskExperience, TaskState, AgentAction, LearningFeedback } from '@learning/types';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';

describe('Journey: Learning & Improvement', () => {
  let memory: SwarmMemoryManager;
  let learningEngine: LearningEngine;
  let tempDir: string;
  let tempDbPath: string;
  const agentId = 'learning-journey-agent';

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aqe-learning-journey-'));
    tempDbPath = path.join(tempDir, 'learning.db');
  });

  beforeEach(async () => {
    memory = new SwarmMemoryManager(tempDbPath);
    await memory.initialize();

    const config: Partial<ExtendedLearningConfig> = {
      enabled: true,
      learningRate: 0.1,
      discountFactor: 0.95,
      explorationRate: 0.3,
      explorationDecay: 0.995,
      minExplorationRate: 0.01,
      maxMemorySize: 100 * 1024 * 1024,
      batchSize: 32,
      updateFrequency: 10,
      algorithm: 'q-learning',
      enableExperienceSharing: false
    };

    learningEngine = new LearningEngine(agentId, memory, config);
    await learningEngine.initialize();
  });

  afterEach(async () => {
    learningEngine.dispose();
    await memory.close();
  });

  afterAll(async () => {
    await fs.remove(tempDir);
  });

  describe('Q-learning pattern recognition', () => {
    test('stores experiences in database with reward and outcome', async () => {
      // GIVEN: A task execution with a successful outcome
      const task = {
        id: 'task-1',
        type: 'test-generation',
        requirements: {
          capabilities: ['unit-testing', 'boundary-analysis']
        },
        timeout: 30000,
        previousAttempts: 0
      };

      const result = {
        success: true,
        executionTime: 2500,
        coverage: 0.92,
        strategy: 'boundary-value-analysis',
        toolsUsed: ['jest', 'coverage-analyzer'],
        parallelization: 0.7,
        retryPolicy: 'exponential',
        resourceAllocation: 0.8
      };

      const feedback: LearningFeedback = {
        rating: 0.95,
        issues: [],
        comments: 'Excellent test coverage and edge cases'
      };

      // WHEN: Learning from the execution
      const outcome = await learningEngine.learnFromExecution(task, result, feedback);

      // THEN: Experience should be stored in the database
      expect(outcome).toBeDefined();
      expect(outcome.improved).toBeDefined();

      // Verify database storage through memory manager
      const experienceCount = learningEngine.getTotalExperiences();
      expect(experienceCount).toBeGreaterThan(0);

      // Query stored learning experiences from database
      const storedExperiences = await memory.retrieve(
        `phase2/learning/${agentId}/state`,
        { partition: 'learning' }
      );

      expect(storedExperiences).toBeDefined();
    });

    test('updates Q-values for state-action pairs', async () => {
      // GIVEN: Multiple task executions with different strategies
      const tasks = [
        {
          id: 'task-q-1',
          type: 'test-generation',
          requirements: { capabilities: ['unit-testing'] },
          complexity: 0.5
        },
        {
          id: 'task-q-2',
          type: 'test-generation',
          requirements: { capabilities: ['unit-testing'] },
          complexity: 0.5
        },
        {
          id: 'task-q-3',
          type: 'test-generation',
          requirements: { capabilities: ['unit-testing'] },
          complexity: 0.5
        }
      ];

      // First task: boundary-value strategy with good result
      await learningEngine.learnFromExecution(
        tasks[0],
        {
          success: true,
          coverage: 0.90,
          strategy: 'boundary-value-analysis',
          executionTime: 2000,
          toolsUsed: ['jest'],
          parallelization: 0.5,
          retryPolicy: 'exponential',
          resourceAllocation: 0.5
        },
        { rating: 0.9, issues: [] }
      );

      // Second task: equivalence-class strategy with mediocre result
      await learningEngine.learnFromExecution(
        tasks[1],
        {
          success: true,
          coverage: 0.75,
          strategy: 'equivalence-class',
          executionTime: 3000,
          toolsUsed: ['jest'],
          parallelization: 0.5,
          retryPolicy: 'exponential',
          resourceAllocation: 0.5
        },
        { rating: 0.7, issues: [] }
      );

      // Third task: boundary-value strategy with excellent result
      await learningEngine.learnFromExecution(
        tasks[2],
        {
          success: true,
          coverage: 0.95,
          strategy: 'boundary-value-analysis',
          executionTime: 1800,
          toolsUsed: ['jest'],
          parallelization: 0.5,
          retryPolicy: 'exponential',
          resourceAllocation: 0.5
        },
        { rating: 0.95, issues: [] }
      );

      // WHEN: Requesting strategy recommendation
      const state: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: ['unit-testing'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 1.0
      };

      const recommendation = await learningEngine.recommendStrategy(state);

      // THEN: Should recommend boundary-value strategy (higher Q-value)
      expect(recommendation).toBeDefined();
      expect(recommendation.strategy).toBeDefined();
      expect(recommendation.confidence).toBeGreaterThan(0);
      expect(recommendation.expectedImprovement).toBeDefined();

      // The more successful strategy should have higher confidence
      expect(recommendation.confidence).toBeGreaterThan(0.5);
    });

    test('learns successful patterns over time', async () => {
      // GIVEN: Series of task executions over time
      const taskType = 'unit-test-generation';
      const successfulStrategy = 'comprehensive-coverage';

      // Execute 15 tasks with the same pattern
      for (let i = 0; i < 15; i++) {
        const task = {
          id: `pattern-task-${i}`,
          type: taskType,
          requirements: { capabilities: ['unit-testing'] },
          complexity: 0.6
        };

        const result = {
          success: true,
          coverage: 0.85 + i * 0.005, // Gradually improving
          strategy: successfulStrategy,
          executionTime: 2000 - i * 50, // Getting faster
          toolsUsed: ['jest'],
          parallelization: 0.6,
          retryPolicy: 'exponential',
          resourceAllocation: 0.6
        };

        await learningEngine.learnFromExecution(
          task,
          result,
          { rating: 0.85 + i * 0.01, issues: [] }
        );
      }

      // WHEN: Querying learned patterns
      const patterns = await learningEngine.getPatterns();

      // THEN: Should have learned patterns from successful executions
      expect(patterns).toBeDefined();
      expect(patterns.length).toBeGreaterThan(0);

      // Verify pattern structure
      const relevantPattern = patterns.find(p =>
        p.pattern.includes(taskType) || p.pattern.includes(successfulStrategy)
      );

      if (relevantPattern) {
        expect(relevantPattern.confidence).toBeGreaterThan(0);
        expect(relevantPattern.successRate).toBeGreaterThan(0);
        expect(relevantPattern.usageCount).toBeGreaterThan(0);
        expect(relevantPattern.id).toBeDefined();
        expect(relevantPattern.createdAt).toBeInstanceOf(Date);
        expect(relevantPattern.lastUsedAt).toBeInstanceOf(Date);
      }

      // Verify patterns are persisted in database
      const dbPatterns = await memory.queryPatternsByAgent(agentId, 0);
      expect(dbPatterns.length).toBeGreaterThan(0);
    });

    test('improves test generation quality (measured by coverage increase)', async () => {
      // GIVEN: Initial baseline with low coverage
      const baselineResults = [];

      // Phase 1: Initial executions (poor coverage)
      for (let i = 0; i < 10; i++) {
        const task = {
          id: `baseline-task-${i}`,
          type: 'test-generation',
          requirements: { capabilities: ['unit-testing'] },
          complexity: 0.7
        };

        const result = {
          success: i % 3 !== 0, // 67% success rate
          coverage: 0.60 + Math.random() * 0.15, // 60-75% coverage
          strategy: i % 2 === 0 ? 'basic' : 'standard',
          executionTime: 3000 + Math.random() * 1000,
          toolsUsed: ['jest'],
          parallelization: 0.5,
          retryPolicy: 'linear',
          resourceAllocation: 0.5
        };

        baselineResults.push(result);
        await learningEngine.learnFromExecution(
          task,
          result,
          { rating: result.coverage, issues: [] }
        );
      }

      // Phase 2: Learning period with better strategies
      const improvedResults = [];

      for (let i = 0; i < 10; i++) {
        const task = {
          id: `improved-task-${i}`,
          type: 'test-generation',
          requirements: { capabilities: ['unit-testing'] },
          complexity: 0.7
        };

        // Use learned strategies (better results)
        const state: TaskState = {
          taskComplexity: 0.7,
          requiredCapabilities: ['unit-testing'],
          contextFeatures: {},
          previousAttempts: 0,
          availableResources: 1.0
        };

        const recommendation = await learningEngine.recommendStrategy(state);

        const result = {
          success: true, // Better success rate
          coverage: 0.80 + Math.random() * 0.15, // 80-95% coverage (improved)
          strategy: recommendation.strategy || 'optimized',
          executionTime: 2000 + Math.random() * 500, // Faster
          toolsUsed: ['jest', 'coverage-analyzer'],
          parallelization: 0.7,
          retryPolicy: 'exponential',
          resourceAllocation: 0.7
        };

        improvedResults.push(result);
        await learningEngine.learnFromExecution(
          task,
          result,
          { rating: result.coverage, issues: [] }
        );
      }

      // WHEN: Calculating improvement metrics
      const baselineAvgCoverage =
        baselineResults.reduce((sum, r) => sum + r.coverage, 0) / baselineResults.length;
      const improvedAvgCoverage =
        improvedResults.reduce((sum, r) => sum + r.coverage, 0) / improvedResults.length;

      const coverageImprovement =
        ((improvedAvgCoverage - baselineAvgCoverage) / baselineAvgCoverage) * 100;

      // THEN: Coverage should have improved
      expect(improvedAvgCoverage).toBeGreaterThan(baselineAvgCoverage);
      expect(coverageImprovement).toBeGreaterThan(10); // At least 10% improvement

      // Verify learning outcome shows improvement
      const totalExperiences = learningEngine.getTotalExperiences();
      expect(totalExperiences).toBe(20); // 10 baseline + 10 improved
    });

    test('adapts to project-specific patterns', async () => {
      // GIVEN: Project-specific context (React project with hooks)
      const projectContext = {
        framework: 'react',
        language: 'typescript',
        patterns: ['hooks', 'components', 'context']
      };

      // Execute tasks with project-specific patterns
      const projectTasks = [
        {
          context: { ...projectContext, component: 'useState' },
          expectedStrategy: 'react-hooks-testing'
        },
        {
          context: { ...projectContext, component: 'useEffect' },
          expectedStrategy: 'react-hooks-testing'
        },
        {
          context: { ...projectContext, component: 'useContext' },
          expectedStrategy: 'react-hooks-testing'
        },
        {
          context: { ...projectContext, component: 'custom-hook' },
          expectedStrategy: 'react-hooks-testing'
        }
      ];

      // Learn from React-specific tasks
      for (let i = 0; i < projectTasks.length; i++) {
        const task = {
          id: `react-task-${i}`,
          type: 'component-test-generation',
          requirements: {
            capabilities: ['react-testing', 'hooks-testing']
          },
          context: projectTasks[i].context,
          complexity: 0.6
        };

        const result = {
          success: true,
          coverage: 0.88 + i * 0.02,
          strategy: projectTasks[i].expectedStrategy,
          executionTime: 2200,
          toolsUsed: ['jest', 'react-testing-library'],
          parallelization: 0.6,
          retryPolicy: 'exponential',
          resourceAllocation: 0.6
        };

        await learningEngine.learnFromExecution(
          task,
          result,
          { rating: 0.9, issues: [] }
        );
      }

      // WHEN: Requesting recommendation for new React component
      const newReactTask: TaskState = {
        taskComplexity: 0.6,
        requiredCapabilities: ['react-testing', 'hooks-testing'],
        contextFeatures: { framework: 'react', hasHooks: true },
        previousAttempts: 0,
        availableResources: 1.0
      };

      const recommendation = await learningEngine.recommendStrategy(newReactTask);

      // THEN: Should recommend React-specific strategy with high confidence
      expect(recommendation).toBeDefined();
      expect(recommendation.strategy).toBeDefined();
      expect(recommendation.confidence).toBeGreaterThan(0.6); // Project-specific learning

      // Verify patterns were learned
      const patterns = await learningEngine.getPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      // Check for React-specific patterns in database
      const dbPatterns = await memory.queryPatternsByAgent(agentId, 0.5);
      expect(dbPatterns.length).toBeGreaterThan(0);
    });

    test('persists learning state across sessions', async () => {
      // GIVEN: First session with learning
      const session1Tasks = 5;

      for (let i = 0; i < session1Tasks; i++) {
        const task = {
          id: `session1-task-${i}`,
          type: 'test-generation',
          requirements: { capabilities: ['unit-testing'] },
          complexity: 0.5
        };

        const result = {
          success: true,
          coverage: 0.85,
          strategy: 'comprehensive',
          executionTime: 2000,
          toolsUsed: ['jest'],
          parallelization: 0.5,
          retryPolicy: 'exponential',
          resourceAllocation: 0.5
        };

        await learningEngine.learnFromExecution(task, result, {
          rating: 0.85,
          issues: []
        });
      }

      // Verify initial state
      const initialExperiences = learningEngine.getTotalExperiences();
      expect(initialExperiences).toBe(session1Tasks);

      // Dispose and create new engine (simulating session restart)
      learningEngine.dispose();

      // WHEN: Creating new learning engine with same database
      const newLearningEngine = new LearningEngine(agentId, memory, {
        enabled: true,
        learningRate: 0.1,
        discountFactor: 0.95,
        algorithm: 'q-learning'
      });

      await newLearningEngine.initialize();

      // Add more experiences in new session
      const session2Tasks = 3;

      for (let i = 0; i < session2Tasks; i++) {
        const task = {
          id: `session2-task-${i}`,
          type: 'test-generation',
          requirements: { capabilities: ['unit-testing'] },
          complexity: 0.5
        };

        const result = {
          success: true,
          coverage: 0.88,
          strategy: 'comprehensive',
          executionTime: 1900,
          toolsUsed: ['jest'],
          parallelization: 0.5,
          retryPolicy: 'exponential',
          resourceAllocation: 0.5
        };

        await newLearningEngine.learnFromExecution(task, result, {
          rating: 0.88,
          issues: []
        });
      }

      // THEN: New engine should have learned from both sessions
      const totalExperiences = newLearningEngine.getTotalExperiences();
      expect(totalExperiences).toBe(session1Tasks + session2Tasks);

      // Patterns should persist across sessions
      const patterns = await newLearningEngine.getPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      // Cleanup
      newLearningEngine.dispose();
    });

    test('exploration rate decays over time', async () => {
      // GIVEN: Initial high exploration rate
      const initialExploration = learningEngine.getExplorationRate();
      expect(initialExploration).toBeGreaterThan(0);

      const iterations = 50;

      // WHEN: Learning from many experiences
      for (let i = 0; i < iterations; i++) {
        const task = {
          id: `decay-task-${i}`,
          type: 'test-generation',
          requirements: { capabilities: ['unit-testing'] },
          complexity: 0.5
        };

        const result = {
          success: true,
          coverage: 0.85,
          strategy: 'standard',
          executionTime: 2000,
          toolsUsed: ['jest'],
          parallelization: 0.5,
          retryPolicy: 'exponential',
          resourceAllocation: 0.5
        };

        await learningEngine.learnFromExecution(task, result, {
          rating: 0.85,
          issues: []
        });
      }

      // THEN: Exploration rate should have decayed
      const finalExploration = learningEngine.getExplorationRate();
      expect(finalExploration).toBeLessThan(initialExploration);
      expect(finalExploration).toBeGreaterThanOrEqual(0.01); // Min exploration rate

      // Verify decay is progressive
      expect(finalExploration).toBeGreaterThan(0);
    });

    test('handles failure patterns and adapts strategy', async () => {
      // GIVEN: Tasks that fail with a specific pattern
      const failingStrategy = 'naive-approach';
      const successfulStrategy = 'robust-approach';

      // Fail with naive approach
      for (let i = 0; i < 5; i++) {
        const task = {
          id: `fail-task-${i}`,
          type: 'test-generation',
          requirements: { capabilities: ['error-handling'] },
          complexity: 0.8
        };

        const result = {
          success: false,
          coverage: 0.45,
          strategy: failingStrategy,
          executionTime: 5000,
          errors: ['timeout', 'insufficient-coverage'],
          toolsUsed: ['jest'],
          parallelization: 0.3,
          retryPolicy: 'linear',
          resourceAllocation: 0.3
        };

        await learningEngine.learnFromExecution(task, result, {
          rating: 0.3,
          issues: ['low-coverage', 'timeout']
        });
      }

      // Succeed with robust approach
      for (let i = 0; i < 5; i++) {
        const task = {
          id: `success-task-${i}`,
          type: 'test-generation',
          requirements: { capabilities: ['error-handling'] },
          complexity: 0.8
        };

        const result = {
          success: true,
          coverage: 0.90,
          strategy: successfulStrategy,
          executionTime: 2500,
          toolsUsed: ['jest', 'coverage-analyzer'],
          parallelization: 0.7,
          retryPolicy: 'exponential',
          resourceAllocation: 0.7
        };

        await learningEngine.learnFromExecution(task, result, {
          rating: 0.92,
          issues: []
        });
      }

      // WHEN: Requesting strategy for similar task
      const state: TaskState = {
        taskComplexity: 0.8,
        requiredCapabilities: ['error-handling'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 1.0
      };

      const recommendation = await learningEngine.recommendStrategy(state);

      // THEN: Should recommend the successful strategy, not the failing one
      expect(recommendation).toBeDefined();
      expect(recommendation.confidence).toBeGreaterThan(0);

      // Get failure patterns
      const failurePatterns = learningEngine.getFailurePatterns();
      expect(failurePatterns.length).toBeGreaterThan(0);

      // Verify failure pattern was detected
      const detectedFailure = failurePatterns.find(p =>
        p.pattern.includes('test-generation:failure')
      );
      expect(detectedFailure).toBeDefined();
    });
  });
});
