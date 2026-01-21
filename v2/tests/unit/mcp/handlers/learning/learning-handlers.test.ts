/**
 * RED Phase Tests: Learning Handlers
 *
 * Combined tests for all 4 learning handlers:
 * - LearningStoreExperienceHandler
 * - LearningStoreQValueHandler
 * - LearningStorePatternHandler
 * - LearningQueryHandler
 *
 * Given-When-Then structure for learning persistence
 * Tests MUST fail until implementation is verified
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { LearningStoreExperienceHandler } from '@mcp/handlers/learning/learning-store-experience';
import { LearningStoreQValueHandler } from '@mcp/handlers/learning/learning-store-qvalue';
import { LearningStorePatternHandler } from '@mcp/handlers/learning/learning-store-pattern';
import { LearningQueryHandler } from '@mcp/handlers/learning/learning-query';
import { EventEmitter } from 'events';

describe('Learning Handlers - RED Phase', () => {
  let mockRegistry: any;
  let mockHookExecutor: any;
  let mockMemory: any;
  let mockEventBus: EventEmitter;
  let mockDb: any;

  beforeEach(() => {
    // Create mock objects for dependencies
    mockRegistry = {
      getAgent: jest.fn().mockReturnValue(null),
      registerAgent: jest.fn()
    };
    mockHookExecutor = {
      executePreHook: jest.fn().mockResolvedValue(undefined),
      executePostHook: jest.fn().mockResolvedValue(undefined),
      executeHook: jest.fn().mockResolvedValue(undefined)
    };

    mockDb = {
      prepare: jest.fn().mockReturnThis(),
      run: jest.fn().mockReturnValue({ lastInsertRowid: 1 }),
      get: jest.fn().mockReturnValue(null),
      all: jest.fn().mockReturnValue([])
    };

    mockMemory = {
      store: async () => true,
      retrieve: async () => null,
      query: async () => [],
      storeExperience: async () => ({ id: 'exp-1' }),
      storeQValue: async () => ({ id: 'qval-1' }),
      storePattern: async () => ({ id: 'pat-1' }),
      queryLearning: async () => [],
      db: mockDb
    };

    mockEventBus = new EventEmitter();
  });

  describe('LearningStoreExperienceHandler', () => {
    describe('handle - Basic Experience Storage', () => {
      it('should store experience with valid data', async () => {
        // GIVEN: Valid learning experience data
        const handler = new LearningStoreExperienceHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          agentId: 'test-agent',
          taskType: 'test-task',
          reward: 0.85,
          outcome: { success: true, metrics: { duration: 100 } }
        };

        // WHEN: Storing experience
        const result = await handler.handle(args);

        // THEN: Returns success with experience ID
        expect(result.success).toBe(true);
        expect(result.data.experienceId).toBeDefined();
        expect(result.data.experienceId).toMatch(/^exp-/);
      });

      it('should store experience with metadata', async () => {
        // GIVEN: Experience with custom metadata
        const handler = new LearningStoreExperienceHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          agentId: 'test-agent',
          taskType: 'test-task',
          reward: 0.9,
          outcome: { success: true },
          metadata: { environment: 'test', version: '1.0.0' }
        };

        // WHEN: Storing experience
        const result = await handler.handle(args);

        // THEN: Stores successfully with metadata
        expect(result.success).toBe(true);
        expect(mockDb.prepare).toHaveBeenCalled();
      });

      it('should store experience with custom timestamp', async () => {
        // GIVEN: Experience with specific timestamp
        const handler = new LearningStoreExperienceHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const customTimestamp = Date.now() - 1000;
        const args = {
          agentId: 'test-agent',
          taskType: 'test-task',
          reward: 0.75,
          outcome: { success: true },
          timestamp: customTimestamp
        };

        // WHEN: Storing experience
        const result = await handler.handle(args);

        // THEN: Uses custom timestamp
        expect(result.success).toBe(true);
      });
    });

    describe('handle - Validation', () => {
      it('should reject missing agentId', async () => {
        // GIVEN: Experience missing agentId
        const handler = new LearningStoreExperienceHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          taskType: 'test-task',
          reward: 0.85,
          outcome: { success: true }
        } as any;

        // WHEN: Attempting to store experience
        const result = await handler.handle(args);

        // THEN: Returns error
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should reject missing taskType', async () => {
        // GIVEN: Experience missing taskType
        const handler = new LearningStoreExperienceHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          agentId: 'test-agent',
          reward: 0.85,
          outcome: { success: true }
        } as any;

        // WHEN: Attempting to store experience
        const result = await handler.handle(args);

        // THEN: Returns error
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should reject missing reward', async () => {
        // GIVEN: Experience missing reward
        const handler = new LearningStoreExperienceHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          agentId: 'test-agent',
          taskType: 'test-task',
          outcome: { success: true }
        } as any;

        // WHEN: Attempting to store experience
        const result = await handler.handle(args);

        // THEN: Returns error
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should reject reward below 0', async () => {
        // GIVEN: Experience with negative reward
        const handler = new LearningStoreExperienceHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          agentId: 'test-agent',
          taskType: 'test-task',
          reward: -0.5,
          outcome: { success: false }
        };

        // WHEN: Attempting to store experience
        const result = await handler.handle(args);

        // THEN: Returns error
        expect(result.success).toBe(false);
        expect(result.error).toContain('between 0 and 1');
      });

      it('should reject reward above 1', async () => {
        // GIVEN: Experience with reward > 1
        const handler = new LearningStoreExperienceHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          agentId: 'test-agent',
          taskType: 'test-task',
          reward: 1.5,
          outcome: { success: true }
        };

        // WHEN: Attempting to store experience
        const result = await handler.handle(args);

        // THEN: Returns error
        expect(result.success).toBe(false);
        expect(result.error).toContain('between 0 and 1');
      });

      it('should reject non-object outcome', async () => {
        // GIVEN: Experience with invalid outcome type
        const handler = new LearningStoreExperienceHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          agentId: 'test-agent',
          taskType: 'test-task',
          reward: 0.85,
          outcome: 'invalid' as any
        };

        // WHEN: Attempting to store experience
        const result = await handler.handle(args);

        // THEN: Returns error
        expect(result.success).toBe(false);
        expect(result.error).toContain('must be an object');
      });
    });

    describe('Boundary Tests - Reward Values', () => {
      it('should handle minimum valid reward (0)', async () => {
        // GIVEN: Experience with reward = 0
        const handler = new LearningStoreExperienceHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          agentId: 'test-agent',
          taskType: 'test-task',
          reward: 0,
          outcome: { success: false }
        };

        // WHEN: Storing experience
        const result = await handler.handle(args);

        // THEN: Stores successfully
        expect(result.success).toBe(true);
      });

      it('should handle maximum valid reward (1)', async () => {
        // GIVEN: Experience with reward = 1
        const handler = new LearningStoreExperienceHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          agentId: 'test-agent',
          taskType: 'test-task',
          reward: 1,
          outcome: { success: true }
        };

        // WHEN: Storing experience
        const result = await handler.handle(args);

        // THEN: Stores successfully
        expect(result.success).toBe(true);
      });
    });

    describe('Event Emission', () => {
      it('should emit event when experience is stored', async () => {
        // GIVEN: Handler with event bus
        const handler = new LearningStoreExperienceHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        let eventReceived = false;
        mockEventBus.on('learning:experience:stored', () => { eventReceived = true; });

        const args = {
          agentId: 'test-agent',
          taskType: 'test-task',
          reward: 0.85,
          outcome: { success: true }
        };

        // WHEN: Storing experience
        await handler.handle(args);

        // THEN: Event was emitted
        expect(eventReceived).toBe(true);
      });
    });
  });

  describe('LearningStoreQValueHandler', () => {
    describe('handle - Basic Q-Value Storage', () => {
      it('should store Q-value with valid data', async () => {
        // GIVEN: Valid Q-value data
        const handler = new LearningStoreQValueHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          agentId: 'test-agent',
          stateKey: 'state-1',
          actionKey: 'action-1',
          qValue: 0.85
        };

        // WHEN: Storing Q-value
        const result = await handler.handle(args);

        // THEN: Returns success with Q-value ID
        expect(result.success).toBe(true);
        expect(result.data.qValueId).toBeDefined();
        expect(result.data.qValueId).toMatch(/^qval-/);
      });

      it('should update existing Q-value', async () => {
        // GIVEN: Existing Q-value in database
        const handler = new LearningStoreQValueHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        mockDb.get.mockReturnValue({
          id: 1,
          q_value: 0.7,
          update_count: 5
        });

        const args = {
          agentId: 'test-agent',
          stateKey: 'state-1',
          actionKey: 'action-1',
          qValue: 0.9
        };

        // WHEN: Storing Q-value
        const result = await handler.handle(args);

        // THEN: Updates existing value
        expect(result.success).toBe(true);
        expect(result.data.message).toContain('updated');
      });

      it('should store Q-value with metadata', async () => {
        // GIVEN: Q-value with custom metadata
        const handler = new LearningStoreQValueHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          agentId: 'test-agent',
          stateKey: 'state-1',
          actionKey: 'action-1',
          qValue: 0.85,
          metadata: { source: 'exploration', episode: 42 }
        };

        // WHEN: Storing Q-value
        const result = await handler.handle(args);

        // THEN: Stores successfully with metadata
        expect(result.success).toBe(true);
      });
    });

    describe('handle - Validation', () => {
      it('should reject missing agentId', async () => {
        // GIVEN: Q-value missing agentId
        const handler = new LearningStoreQValueHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          stateKey: 'state-1',
          actionKey: 'action-1',
          qValue: 0.85
        } as any;

        // WHEN: Attempting to store Q-value
        const result = await handler.handle(args);

        // THEN: Returns error
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should reject missing stateKey', async () => {
        // GIVEN: Q-value missing stateKey
        const handler = new LearningStoreQValueHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          agentId: 'test-agent',
          actionKey: 'action-1',
          qValue: 0.85
        } as any;

        // WHEN: Attempting to store Q-value
        const result = await handler.handle(args);

        // THEN: Returns error
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should reject non-number qValue', async () => {
        // GIVEN: Q-value with invalid type
        const handler = new LearningStoreQValueHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          agentId: 'test-agent',
          stateKey: 'state-1',
          actionKey: 'action-1',
          qValue: 'invalid' as any
        };

        // WHEN: Attempting to store Q-value
        const result = await handler.handle(args);

        // THEN: Returns error
        expect(result.success).toBe(false);
        expect(result.error).toContain('must be a number');
      });
    });

    describe('Event Emission', () => {
      it('should emit event when Q-value is stored', async () => {
        // GIVEN: Handler with event bus
        const handler = new LearningStoreQValueHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        let eventReceived = false;
        mockEventBus.on('learning:qvalue:stored', () => { eventReceived = true; });

        const args = {
          agentId: 'test-agent',
          stateKey: 'state-1',
          actionKey: 'action-1',
          qValue: 0.85
        };

        // WHEN: Storing Q-value
        await handler.handle(args);

        // THEN: Event was emitted
        expect(eventReceived).toBe(true);
      });
    });
  });

  describe('LearningStorePatternHandler', () => {
    describe('handle - Basic Pattern Storage', () => {
      it('should store pattern with valid data', async () => {
        // GIVEN: Valid pattern data
        const handler = new LearningStorePatternHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          pattern: 'singleton-pattern',
          confidence: 0.9
        };

        // WHEN: Storing pattern
        const result = await handler.handle(args);

        // THEN: Returns success with pattern ID
        expect(result.success).toBe(true);
        expect(result.data.patternId).toBeDefined();
        expect(result.data.patternId).toMatch(/^pattern-/);
      });

      it('should store pattern with agent ID', async () => {
        // GIVEN: Pattern associated with specific agent
        const handler = new LearningStorePatternHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          agentId: 'test-agent',
          pattern: 'factory-pattern',
          confidence: 0.85
        };

        // WHEN: Storing pattern
        const result = await handler.handle(args);

        // THEN: Stores successfully with agent ID
        expect(result.success).toBe(true);
      });

      it('should update existing pattern', async () => {
        // GIVEN: Existing pattern in database
        const handler = new LearningStorePatternHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        mockDb.get.mockReturnValue({
          id: 'pattern-123',
          usage_count: 10,
          success_rate: 0.8,
          confidence: 0.75
        });

        const args = {
          agentId: 'test-agent',
          pattern: 'observer-pattern',
          confidence: 0.95
        };

        // WHEN: Storing pattern
        const result = await handler.handle(args);

        // THEN: Updates existing pattern
        expect(result.success).toBe(true);
        expect(result.data.message).toContain('updated');
      });

      it('should store pattern with domain', async () => {
        // GIVEN: Pattern with specific domain
        const handler = new LearningStorePatternHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          pattern: 'mvc-pattern',
          confidence: 0.9,
          domain: 'web-architecture'
        };

        // WHEN: Storing pattern
        const result = await handler.handle(args);

        // THEN: Stores successfully with domain
        expect(result.success).toBe(true);
      });
    });

    describe('handle - Validation', () => {
      it('should reject missing pattern', async () => {
        // GIVEN: Pattern data missing pattern text
        const handler = new LearningStorePatternHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          confidence: 0.9
        } as any;

        // WHEN: Attempting to store pattern
        const result = await handler.handle(args);

        // THEN: Returns error
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should reject empty pattern string', async () => {
        // GIVEN: Pattern with empty string
        const handler = new LearningStorePatternHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          pattern: '   ',
          confidence: 0.9
        };

        // WHEN: Attempting to store pattern
        const result = await handler.handle(args);

        // THEN: Returns error
        expect(result.success).toBe(false);
        expect(result.error).toContain('non-empty string');
      });

      it('should reject confidence below 0', async () => {
        // GIVEN: Pattern with negative confidence
        const handler = new LearningStorePatternHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          pattern: 'test-pattern',
          confidence: -0.5
        };

        // WHEN: Attempting to store pattern
        const result = await handler.handle(args);

        // THEN: Returns error
        expect(result.success).toBe(false);
        expect(result.error).toContain('between 0 and 1');
      });

      it('should reject confidence above 1', async () => {
        // GIVEN: Pattern with confidence > 1
        const handler = new LearningStorePatternHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          pattern: 'test-pattern',
          confidence: 1.5
        };

        // WHEN: Attempting to store pattern
        const result = await handler.handle(args);

        // THEN: Returns error
        expect(result.success).toBe(false);
        expect(result.error).toContain('between 0 and 1');
      });
    });

    describe('Boundary Tests - Confidence Values', () => {
      it('should handle minimum valid confidence (0)', async () => {
        // GIVEN: Pattern with confidence = 0
        const handler = new LearningStorePatternHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          pattern: 'test-pattern',
          confidence: 0
        };

        // WHEN: Storing pattern
        const result = await handler.handle(args);

        // THEN: Stores successfully
        expect(result.success).toBe(true);
      });

      it('should handle maximum valid confidence (1)', async () => {
        // GIVEN: Pattern with confidence = 1
        const handler = new LearningStorePatternHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        const args = {
          pattern: 'test-pattern',
          confidence: 1
        };

        // WHEN: Storing pattern
        const result = await handler.handle(args);

        // THEN: Stores successfully
        expect(result.success).toBe(true);
      });
    });

    describe('Event Emission', () => {
      it('should emit event when pattern is stored', async () => {
        // GIVEN: Handler with event bus
        const handler = new LearningStorePatternHandler(
          mockRegistry, mockHookExecutor, mockMemory, mockEventBus
        );
        let eventReceived = false;
        mockEventBus.on('learning:pattern:stored', () => { eventReceived = true; });

        const args = {
          agentId: 'test-agent',
          pattern: 'test-pattern',
          confidence: 0.9
        };

        // WHEN: Storing pattern
        await handler.handle(args);

        // THEN: Event was emitted
        expect(eventReceived).toBe(true);
      });
    });
  });

  describe('LearningQueryHandler', () => {
    describe('handle - Query Experiences', () => {
      it('should query all experiences', async () => {
        // GIVEN: Handler with experience data
        const handler = new LearningQueryHandler(
          mockRegistry, mockHookExecutor, mockMemory
        );
        mockDb.all.mockReturnValue([
          { agent_id: 'agent-1', task_type: 'test', reward: 0.9, state: '{}', action: '{}', next_state: '{}', metadata: '{}' }
        ]);

        const args = {
          queryType: 'experiences' as const
        };

        // WHEN: Querying experiences
        const result = await handler.handle(args);

        // THEN: Returns experiences
        expect(result.success).toBe(true);
        expect(result.data.experiences).toBeDefined();
        expect(Array.isArray(result.data.experiences)).toBe(true);
      });

      it('should filter experiences by agentId', async () => {
        // GIVEN: Query for specific agent
        const handler = new LearningQueryHandler(
          mockRegistry, mockHookExecutor, mockMemory
        );
        mockDb.all.mockReturnValue([]);

        const args = {
          queryType: 'experiences' as const,
          agentId: 'test-agent'
        };

        // WHEN: Querying experiences
        const result = await handler.handle(args);

        // THEN: Queries with agent filter
        expect(result.success).toBe(true);
        expect(mockDb.prepare).toHaveBeenCalled();
      });

      it('should filter experiences by taskType', async () => {
        // GIVEN: Query for specific task type
        const handler = new LearningQueryHandler(
          mockRegistry, mockHookExecutor, mockMemory
        );
        mockDb.all.mockReturnValue([]);

        const args = {
          queryType: 'experiences' as const,
          taskType: 'test-task'
        };

        // WHEN: Querying experiences
        const result = await handler.handle(args);

        // THEN: Queries with task type filter
        expect(result.success).toBe(true);
      });

      it('should filter experiences by minimum reward', async () => {
        // GIVEN: Query for high-reward experiences
        const handler = new LearningQueryHandler(
          mockRegistry, mockHookExecutor, mockMemory
        );
        mockDb.all.mockReturnValue([]);

        const args = {
          queryType: 'experiences' as const,
          minReward: 0.8
        };

        // WHEN: Querying experiences
        const result = await handler.handle(args);

        // THEN: Queries with reward filter
        expect(result.success).toBe(true);
      });
    });

    describe('handle - Query Q-Values', () => {
      it('should query all Q-values', async () => {
        // GIVEN: Handler with Q-value data
        const handler = new LearningQueryHandler(
          mockRegistry, mockHookExecutor, mockMemory
        );
        mockDb.all.mockReturnValue([
          { agent_id: 'agent-1', state_key: 'state-1', action_key: 'action-1', q_value: 0.85, metadata: '{}' }
        ]);

        const args = {
          queryType: 'qvalues' as const
        };

        // WHEN: Querying Q-values
        const result = await handler.handle(args);

        // THEN: Returns Q-values
        expect(result.success).toBe(true);
        expect(result.data.qValues).toBeDefined();
        expect(Array.isArray(result.data.qValues)).toBe(true);
      });

      it('should filter Q-values by agentId', async () => {
        // GIVEN: Query for specific agent Q-values
        const handler = new LearningQueryHandler(
          mockRegistry, mockHookExecutor, mockMemory
        );
        mockDb.all.mockReturnValue([]);

        const args = {
          queryType: 'qvalues' as const,
          agentId: 'test-agent'
        };

        // WHEN: Querying Q-values
        const result = await handler.handle(args);

        // THEN: Queries with agent filter
        expect(result.success).toBe(true);
      });
    });

    describe('handle - Query Patterns', () => {
      it('should query all patterns', async () => {
        // GIVEN: Handler with pattern data
        const handler = new LearningQueryHandler(
          mockRegistry, mockHookExecutor, mockMemory
        );
        mockDb.all.mockImplementation((query: string) => {
          // Return schema for PRAGMA call, empty array for patterns
          if (query === 'PRAGMA table_info(patterns)') {
            return [{ name: 'id' }, { name: 'pattern' }, { name: 'agent_id' }];
          }
          return [];
        });

        const args = {
          queryType: 'patterns' as const
        };

        // WHEN: Querying patterns
        const result = await handler.handle(args);

        // THEN: Returns patterns
        expect(result.success).toBe(true);
        expect(result.data.patterns).toBeDefined();
        expect(Array.isArray(result.data.patterns)).toBe(true);
      });

      it('should handle patterns table without agent_id column', async () => {
        // GIVEN: Patterns table without agent_id
        const handler = new LearningQueryHandler(
          mockRegistry, mockHookExecutor, mockMemory
        );
        mockDb.all.mockImplementation((query: string) => {
          if (query === 'PRAGMA table_info(patterns)') {
            return [{ name: 'id' }, { name: 'pattern' }]; // No agent_id
          }
          return [];
        });

        const args = {
          queryType: 'patterns' as const,
          agentId: 'test-agent'
        };

        // WHEN: Querying patterns
        const result = await handler.handle(args);

        // THEN: Queries without agent_id filter
        expect(result.success).toBe(true);
      });
    });

    describe('handle - Query All Learning Data', () => {
      it('should query all learning data types', async () => {
        // GIVEN: Query for all data
        const handler = new LearningQueryHandler(
          mockRegistry, mockHookExecutor, mockMemory
        );
        mockDb.all.mockImplementation((query: string) => {
          if (query === 'PRAGMA table_info(patterns)') {
            return [{ name: 'id' }, { name: 'pattern' }];
          }
          return [];
        });
        mockDb.get.mockReturnValue({ count: 0, avg_reward: 0 });

        const args = {
          queryType: 'all' as const
        };

        // WHEN: Querying all data
        const result = await handler.handle(args);

        // THEN: Returns all data types with stats
        expect(result.success).toBe(true);
        expect(result.data.experiences).toBeDefined();
        expect(result.data.qValues).toBeDefined();
        expect(result.data.patterns).toBeDefined();
        expect(result.data.stats).toBeDefined();
      });

      it('should calculate statistics for all query', async () => {
        // GIVEN: Query for all data
        const handler = new LearningQueryHandler(
          mockRegistry, mockHookExecutor, mockMemory
        );
        mockDb.all.mockImplementation((query: string) => {
          if (query === 'PRAGMA table_info(patterns)') {
            return [{ name: 'id' }];
          }
          return [];
        });
        mockDb.get.mockReturnValue({ count: 100, avg_reward: 0.75 });

        const args = {
          queryType: 'all' as const
        };

        // WHEN: Querying all data
        const result = await handler.handle(args);

        // THEN: Returns statistics
        expect(result.success).toBe(true);
        expect(result.data.stats.totalExperiences).toBe(100);
        expect(result.data.stats.averageReward).toBe(0.75);
      });
    });

    describe('handle - Pagination', () => {
      it('should support limit parameter', async () => {
        // GIVEN: Query with limit
        const handler = new LearningQueryHandler(
          mockRegistry, mockHookExecutor, mockMemory
        );
        mockDb.all.mockReturnValue([]);

        const args = {
          queryType: 'experiences' as const,
          limit: 10
        };

        // WHEN: Querying with limit
        const result = await handler.handle(args);

        // THEN: Applies limit
        expect(result.success).toBe(true);
      });

      it('should support offset parameter', async () => {
        // GIVEN: Query with offset
        const handler = new LearningQueryHandler(
          mockRegistry, mockHookExecutor, mockMemory
        );
        mockDb.all.mockReturnValue([]);

        const args = {
          queryType: 'experiences' as const,
          offset: 20
        };

        // WHEN: Querying with offset
        const result = await handler.handle(args);

        // THEN: Applies offset
        expect(result.success).toBe(true);
      });

      it('should use default limit if not specified', async () => {
        // GIVEN: Query without limit
        const handler = new LearningQueryHandler(
          mockRegistry, mockHookExecutor, mockMemory
        );
        mockDb.all.mockReturnValue([]);

        const args = {
          queryType: 'experiences' as const
        };

        // WHEN: Querying without limit
        const result = await handler.handle(args);

        // THEN: Uses default limit (50)
        expect(result.success).toBe(true);
      });
    });

    describe('handle - Time Range Filtering', () => {
      it('should filter by start time', async () => {
        // GIVEN: Query with start time
        const handler = new LearningQueryHandler(
          mockRegistry, mockHookExecutor, mockMemory
        );
        mockDb.all.mockReturnValue([]);

        const args = {
          queryType: 'experiences' as const,
          timeRange: {
            start: Date.now() - 86400000 // 24 hours ago
          }
        };

        // WHEN: Querying with time range
        const result = await handler.handle(args);

        // THEN: Applies time filter
        expect(result.success).toBe(true);
      });

      it('should filter by end time', async () => {
        // GIVEN: Query with end time
        const handler = new LearningQueryHandler(
          mockRegistry, mockHookExecutor, mockMemory
        );
        mockDb.all.mockReturnValue([]);

        const args = {
          queryType: 'experiences' as const,
          timeRange: {
            end: Date.now()
          }
        };

        // WHEN: Querying with time range
        const result = await handler.handle(args);

        // THEN: Applies time filter
        expect(result.success).toBe(true);
      });

      it('should filter by time range (start and end)', async () => {
        // GIVEN: Query with time range
        const handler = new LearningQueryHandler(
          mockRegistry, mockHookExecutor, mockMemory
        );
        mockDb.all.mockReturnValue([]);

        const args = {
          queryType: 'experiences' as const,
          timeRange: {
            start: Date.now() - 86400000,
            end: Date.now()
          }
        };

        // WHEN: Querying with time range
        const result = await handler.handle(args);

        // THEN: Applies both time filters
        expect(result.success).toBe(true);
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty query results', async () => {
        // GIVEN: Query with no matching results
        const handler = new LearningQueryHandler(
          mockRegistry, mockHookExecutor, mockMemory
        );
        mockDb.all.mockReturnValue([]);

        const args = {
          queryType: 'experiences' as const
        };

        // WHEN: Querying
        const result = await handler.handle(args);

        // THEN: Returns empty array
        expect(result.success).toBe(true);
        expect(result.data.experiences).toEqual([]);
      });

      it('should handle malformed JSON in database', async () => {
        // GIVEN: Database with invalid JSON
        const handler = new LearningQueryHandler(
          mockRegistry, mockHookExecutor, mockMemory
        );
        mockDb.all.mockReturnValue([
          { agent_id: 'agent-1', state: 'invalid-json', action: '{}', next_state: '{}', metadata: null }
        ]);

        const args = {
          queryType: 'experiences' as const
        };

        // WHEN: Querying
        const result = await handler.handle(args);

        // THEN: Handles gracefully
        expect(result.success).toBe(true);
        expect(result.data.experiences[0].state).toBeDefined();
      });

      it('should handle patterns table query failure', async () => {
        // GIVEN: Patterns table query that fails
        const handler = new LearningQueryHandler(
          mockRegistry, mockHookExecutor, mockMemory
        );
        mockDb.all.mockImplementation((query: string) => {
          if (query.includes('patterns')) {
            throw new Error('Table does not exist');
          }
          return [];
        });

        const args = {
          queryType: 'patterns' as const
        };

        // WHEN: Querying patterns
        const result = await handler.handle(args);

        // THEN: Returns empty patterns array
        expect(result.success).toBe(true);
        expect(result.data.patterns).toEqual([]);
      });
    });
  });
});
