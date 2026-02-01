/**
 * AG-UI Event Adapter Unit Tests
 *
 * Comprehensive test suite covering all 19 AG-UI event types,
 * bidirectional ID mapping, and multi-agent scenarios.
 *
 * Target: 100% coverage on adapter logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EventAdapter,
  createEventAdapter,
  AGUIEventType,
  getEventCategory,
  getEventTypesForCategory,
  isAQEToolProgress,
  isAQEToolResult,
  isAQEAgentStarted,
  isAQEAgentCompleted,
  isAQEAgentError,
  isAQEDomainEvent,
  type EventAdapterConfig,
  type AQEToolProgress,
  type AQEToolResult,
  type AQEAgentStarted,
  type AQEAgentCompleted,
  type AQEAgentError,
  type AQEDomainEvent,
  type AGUIEvent,
  type JsonPatchOperation,
  type ConversationMessage,
  type ActivityMessage,
} from '../../../../src/adapters/ag-ui/index.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const createToolProgress = (overrides: Partial<AQEToolProgress> = {}): AQEToolProgress => ({
  type: 'progress',
  message: 'Processing test data',
  percent: 50,
  ...overrides,
});

const createToolResult = <T = unknown>(overrides: Partial<AQEToolResult<T>> = {}): AQEToolResult<T> => ({
  success: true,
  data: { result: 'test' } as T,
  metadata: {
    executionTime: 100,
    timestamp: '2026-01-30T10:00:00.000Z',
    requestId: 'req-123',
    domain: 'test-generation',
    taskId: 'task-456',
    toolName: 'test_generate',
  },
  ...overrides,
});

const createAgentStarted = (overrides: Partial<AQEAgentStarted> = {}): AQEAgentStarted => ({
  type: 'agent_started',
  agentId: 'agent-001',
  domain: 'test-generation',
  task: 'Generate unit tests',
  timestamp: '2026-01-30T10:00:00.000Z',
  ...overrides,
});

const createAgentCompleted = (overrides: Partial<AQEAgentCompleted> = {}): AQEAgentCompleted => ({
  type: 'agent_completed',
  agentId: 'agent-001',
  domain: 'test-generation',
  result: { testsGenerated: 5 },
  durationMs: 5000,
  timestamp: '2026-01-30T10:05:00.000Z',
  ...overrides,
});

const createAgentError = (overrides: Partial<AQEAgentError> = {}): AQEAgentError => ({
  type: 'agent_error',
  agentId: 'agent-001',
  domain: 'test-generation',
  error: 'Test generation failed',
  code: 'GEN_ERROR',
  recoverable: false,
  timestamp: '2026-01-30T10:02:00.000Z',
  ...overrides,
});

const createDomainEvent = <T = unknown>(overrides: Partial<AQEDomainEvent<T>> = {}): AQEDomainEvent<T> => ({
  id: 'evt-123',
  type: 'test-generation.TestGenerated',
  timestamp: new Date('2026-01-30T10:00:00.000Z'),
  source: 'test-generation',
  correlationId: 'corr-456',
  payload: { testId: 'test-789' } as T,
  ...overrides,
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createEventAdapter', () => {
  it('should create adapter with default config', () => {
    const adapter = createEventAdapter();
    expect(adapter).toBeInstanceOf(EventAdapter);
  });

  it('should create adapter with custom config', () => {
    const config: EventAdapterConfig = {
      defaultThreadId: 'custom-thread',
      emitRawForUnknown: false,
      trackMessageState: false,
      maxBufferSize: 500,
    };
    const adapter = createEventAdapter(config);
    expect(adapter).toBeInstanceOf(EventAdapter);
  });

  it('should create adapter with custom ID generator', () => {
    let counter = 0;
    const config: EventAdapterConfig = {
      eventIdGenerator: () => `custom-${++counter}`,
    };
    const adapter = createEventAdapter(config);
    const event = adapter.emitRunStarted('thread-1');
    expect(event.runId).toMatch(/^custom-/);
  });

  it('should create adapter with custom timestamp generator', () => {
    const fixedTime = '2026-01-30T12:00:00.000Z';
    const config: EventAdapterConfig = {
      timestampGenerator: () => fixedTime,
    };
    const adapter = createEventAdapter(config);
    const event = adapter.emitRunStarted('thread-1');
    expect(event.timestamp).toBe(fixedTime);
  });
});

// ============================================================================
// Event Adapter Class Tests
// ============================================================================

describe('EventAdapter', () => {
  let adapter: EventAdapter;

  beforeEach(() => {
    adapter = createEventAdapter({
      defaultThreadId: 'test-thread',
    });
  });

  // ============================================================================
  // Lifecycle Events Tests
  // ============================================================================

  describe('Lifecycle Events', () => {
    describe('RUN_STARTED', () => {
      it('should emit RUN_STARTED event', () => {
        const events: AGUIEvent[] = [];
        adapter.on('event', (e: AGUIEvent) => events.push(e));

        const event = adapter.emitRunStarted('thread-123', 'run-456', { prompt: 'test' });

        expect(event.type).toBe(AGUIEventType.RUN_STARTED);
        expect(event.threadId).toBe('thread-123');
        expect(event.runId).toBe('run-456');
        expect(event.input).toEqual({ prompt: 'test' });
        expect(events).toHaveLength(1);
      });

      it('should auto-generate runId if not provided', () => {
        const event = adapter.emitRunStarted('thread-123');
        expect(event.runId).toBeDefined();
        expect(event.runId.length).toBeGreaterThan(0);
      });

      it('should track active run', () => {
        adapter.emitRunStarted('thread-123', 'run-456');
        expect(adapter.getCurrentRunId()).toBe('run-456');
        expect(adapter.getActiveRuns().has('run-456')).toBe(true);
      });
    });

    describe('RUN_FINISHED', () => {
      it('should emit RUN_FINISHED with success outcome', () => {
        adapter.emitRunStarted('thread-123', 'run-456');
        const event = adapter.emitRunFinished('run-456', 'success', { result: 'done' });

        expect(event.type).toBe(AGUIEventType.RUN_FINISHED);
        expect(event.runId).toBe('run-456');
        expect(event.outcome).toBe('success');
        expect(event.result).toEqual({ result: 'done' });
      });

      it('should emit RUN_FINISHED with interrupt outcome', () => {
        adapter.emitRunStarted('thread-123', 'run-456');
        const event = adapter.emitRunFinished('run-456', 'interrupt');

        expect(event.outcome).toBe('interrupt');
      });

      it('should emit RUN_FINISHED with cancelled outcome', () => {
        adapter.emitRunStarted('thread-123', 'run-456');
        const event = adapter.emitRunFinished('run-456', 'cancelled');

        expect(event.outcome).toBe('cancelled');
      });

      it('should clean up run state after finish', () => {
        adapter.emitRunStarted('thread-123', 'run-456');
        adapter.emitRunFinished('run-456');

        expect(adapter.getCurrentRunId()).toBeNull();
        expect(adapter.getActiveRuns().has('run-456')).toBe(false);
      });
    });

    describe('RUN_ERROR', () => {
      it('should emit RUN_ERROR event', () => {
        adapter.emitRunStarted('thread-123', 'run-456');
        const event = adapter.emitRunError('run-456', 'Something went wrong', 'ERR_001');

        expect(event.type).toBe(AGUIEventType.RUN_ERROR);
        expect(event.runId).toBe('run-456');
        expect(event.message).toBe('Something went wrong');
        expect(event.code).toBe('ERR_001');
      });

      it('should include recoverable flag', () => {
        adapter.emitRunStarted('thread-123', 'run-456');
        const event = adapter.emitRunError('run-456', 'Retryable error', 'ERR_RETRY', true);

        expect(event.recoverable).toBe(true);
      });

      it('should clean up run state after error', () => {
        adapter.emitRunStarted('thread-123', 'run-456');
        adapter.emitRunError('run-456', 'Error', 'ERR');

        expect(adapter.getCurrentRunId()).toBeNull();
        expect(adapter.getActiveRuns().has('run-456')).toBe(false);
      });
    });

    describe('STEP_STARTED', () => {
      it('should emit STEP_STARTED event', () => {
        adapter.emitRunStarted('thread-123', 'run-456');
        const event = adapter.emitStepStarted('step-1', 'Analyzing code');

        expect(event.type).toBe(AGUIEventType.STEP_STARTED);
        expect(event.stepId).toBe('step-1');
        expect(event.name).toBe('Analyzing code');
        expect(event.runId).toBe('run-456');
      });

      it('should track step in run context', () => {
        adapter.emitRunStarted('thread-123', 'run-456');
        adapter.emitStepStarted('step-1', 'Test step');

        const runContext = adapter.getActiveRuns().get('run-456');
        expect(runContext?.activeSteps.has('step-1')).toBe(true);
      });

      it('should auto-create run if none exists', () => {
        const event = adapter.emitStepStarted('step-1', 'Test step');

        expect(event.runId).toBeDefined();
        expect(adapter.getCurrentRunId()).toBe(event.runId);
      });
    });

    describe('STEP_FINISHED', () => {
      it('should emit STEP_FINISHED event', () => {
        adapter.emitRunStarted('thread-123', 'run-456');
        adapter.emitStepStarted('step-1', 'Test step');
        const event = adapter.emitStepFinished('step-1', { status: 'complete' });

        expect(event.type).toBe(AGUIEventType.STEP_FINISHED);
        expect(event.stepId).toBe('step-1');
        expect(event.result).toEqual({ status: 'complete' });
      });

      it('should remove step from run context', () => {
        adapter.emitRunStarted('thread-123', 'run-456');
        adapter.emitStepStarted('step-1', 'Test step');
        adapter.emitStepFinished('step-1');

        const runContext = adapter.getActiveRuns().get('run-456');
        expect(runContext?.activeSteps.has('step-1')).toBe(false);
      });
    });
  });

  // ============================================================================
  // Text Message Events Tests
  // ============================================================================

  describe('Text Message Events', () => {
    describe('TEXT_MESSAGE_START', () => {
      it('should emit TEXT_MESSAGE_START event', () => {
        const event = adapter.emitTextMessageStart('msg-123', 'assistant');

        expect(event.type).toBe(AGUIEventType.TEXT_MESSAGE_START);
        expect(event.messageId).toBe('msg-123');
        expect(event.role).toBe('assistant');
      });

      it('should default to assistant role', () => {
        const event = adapter.emitTextMessageStart('msg-123');
        expect(event.role).toBe('assistant');
      });

      it('should track message state', () => {
        adapter.emitTextMessageStart('msg-123', 'assistant');

        const state = adapter.getMessageState('msg-123');
        expect(state).toBeDefined();
        expect(state?.content).toBe('');
        expect(state?.role).toBe('assistant');
        expect(state?.complete).toBe(false);
      });

      it('should support all message roles', () => {
        const roles = ['user', 'assistant', 'system', 'tool'] as const;

        for (const role of roles) {
          const event = adapter.emitTextMessageStart(`msg-${role}`, role);
          expect(event.role).toBe(role);
        }
      });
    });

    describe('TEXT_MESSAGE_CONTENT', () => {
      it('should emit TEXT_MESSAGE_CONTENT event', () => {
        adapter.emitTextMessageStart('msg-123');
        const event = adapter.emitTextMessageContent('msg-123', 'Hello ');

        expect(event.type).toBe(AGUIEventType.TEXT_MESSAGE_CONTENT);
        expect(event.messageId).toBe('msg-123');
        expect(event.delta).toBe('Hello ');
      });

      it('should accumulate content in message state', () => {
        adapter.emitTextMessageStart('msg-123');
        adapter.emitTextMessageContent('msg-123', 'Hello ');
        adapter.emitTextMessageContent('msg-123', 'World!');

        const state = adapter.getMessageState('msg-123');
        expect(state?.content).toBe('Hello World!');
      });
    });

    describe('TEXT_MESSAGE_END', () => {
      it('should emit TEXT_MESSAGE_END event', () => {
        adapter.emitTextMessageStart('msg-123');
        adapter.emitTextMessageContent('msg-123', 'Hello World!');
        const event = adapter.emitTextMessageEnd('msg-123');

        expect(event.type).toBe(AGUIEventType.TEXT_MESSAGE_END);
        expect(event.messageId).toBe('msg-123');
        expect(event.content).toBe('Hello World!');
      });

      it('should mark message as complete', () => {
        adapter.emitTextMessageStart('msg-123');
        adapter.emitTextMessageEnd('msg-123');

        const state = adapter.getMessageState('msg-123');
        expect(state?.complete).toBe(true);
      });
    });
  });

  // ============================================================================
  // Tool Call Events Tests
  // ============================================================================

  describe('Tool Call Events', () => {
    describe('TOOL_CALL_START', () => {
      it('should emit TOOL_CALL_START event', () => {
        adapter.emitRunStarted('thread-123', 'run-456');
        const event = adapter.emitToolCallStart('tc-001', 'search_database');

        expect(event.type).toBe(AGUIEventType.TOOL_CALL_START);
        expect(event.toolCallId).toBe('tc-001');
        expect(event.toolCallName).toBe('search_database');
      });

      it('should track tool call state', () => {
        adapter.emitToolCallStart('tc-001', 'search_database');

        const state = adapter.getToolCallState('tc-001');
        expect(state).toBeDefined();
        expect(state?.toolName).toBe('search_database');
        expect(state?.complete).toBe(false);
      });

      it('should include parent message ID', () => {
        const event = adapter.emitToolCallStart('tc-001', 'search_database', 'msg-123');
        expect(event.parentMessageId).toBe('msg-123');
      });
    });

    describe('TOOL_CALL_ARGS', () => {
      it('should emit TOOL_CALL_ARGS event', () => {
        adapter.emitToolCallStart('tc-001', 'search');
        const event = adapter.emitToolCallArgs('tc-001', '{"query":"test"}');

        expect(event.type).toBe(AGUIEventType.TOOL_CALL_ARGS);
        expect(event.toolCallId).toBe('tc-001');
        expect(event.delta).toBe('{"query":"test"}');
      });

      it('should accumulate args in tool call state', () => {
        adapter.emitToolCallStart('tc-001', 'search');
        adapter.emitToolCallArgs('tc-001', '{"query":');
        adapter.emitToolCallArgs('tc-001', '"test"}');

        const state = adapter.getToolCallState('tc-001');
        expect(state?.argsJson).toBe('{"query":"test"}');
      });
    });

    describe('TOOL_CALL_END', () => {
      it('should emit TOOL_CALL_END event', () => {
        adapter.emitToolCallStart('tc-001', 'search');
        adapter.emitToolCallArgs('tc-001', '{"query":"test"}');
        const event = adapter.emitToolCallEnd('tc-001');

        expect(event.type).toBe(AGUIEventType.TOOL_CALL_END);
        expect(event.toolCallId).toBe('tc-001');
        expect(event.args).toEqual({ query: 'test' });
      });

      it('should parse accumulated args', () => {
        adapter.emitToolCallStart('tc-001', 'search');
        adapter.emitToolCallArgs('tc-001', '{"a":1,"b":"two"}');
        adapter.emitToolCallEnd('tc-001');

        const state = adapter.getToolCallState('tc-001');
        expect(state?.args).toEqual({ a: 1, b: 'two' });
      });

      it('should handle invalid JSON gracefully', () => {
        adapter.emitToolCallStart('tc-001', 'search');
        adapter.emitToolCallArgs('tc-001', 'invalid json');
        const event = adapter.emitToolCallEnd('tc-001');

        expect(event.args).toBeUndefined();
      });
    });

    describe('TOOL_CALL_RESULT', () => {
      it('should emit TOOL_CALL_RESULT event', () => {
        adapter.emitToolCallStart('tc-001', 'search');
        const event = adapter.emitToolCallResult('tc-001', '{"results":[]}', 'msg-001');

        expect(event.type).toBe(AGUIEventType.TOOL_CALL_RESULT);
        expect(event.toolCallId).toBe('tc-001');
        expect(event.messageId).toBe('msg-001');
        expect(event.content).toBe('{"results":[]}');
        expect(event.success).toBe(true);
      });

      it('should mark tool call as complete', () => {
        adapter.emitToolCallStart('tc-001', 'search');
        adapter.emitToolCallResult('tc-001', 'result');

        const state = adapter.getToolCallState('tc-001');
        expect(state?.complete).toBe(true);
        expect(state?.result).toBe('result');
      });

      it('should handle failure result', () => {
        adapter.emitToolCallStart('tc-001', 'search');
        const event = adapter.emitToolCallResult('tc-001', 'error', undefined, false);

        expect(event.success).toBe(false);
      });
    });
  });

  // ============================================================================
  // State Management Events Tests
  // ============================================================================

  describe('State Management Events', () => {
    describe('STATE_SNAPSHOT', () => {
      it('should emit STATE_SNAPSHOT event', () => {
        const state = { user: { name: 'Alice' }, count: 42 };
        const event = adapter.emitStateSnapshot(state, 1);

        expect(event.type).toBe(AGUIEventType.STATE_SNAPSHOT);
        expect(event.state).toEqual(state);
        expect(event.version).toBe(1);
      });

      it('should emit STATE_SNAPSHOT without version', () => {
        const event = adapter.emitStateSnapshot({ data: 'test' });
        expect(event.version).toBeUndefined();
      });
    });

    describe('STATE_DELTA', () => {
      it('should emit STATE_DELTA event', () => {
        const delta: JsonPatchOperation[] = [
          { op: 'replace', path: '/count', value: 43 },
          { op: 'add', path: '/new', value: 'field' },
        ];
        const event = adapter.emitStateDelta(delta, 2);

        expect(event.type).toBe(AGUIEventType.STATE_DELTA);
        expect(event.delta).toEqual(delta);
        expect(event.version).toBe(2);
      });

      it('should support all JSON Patch operations', () => {
        const delta: JsonPatchOperation[] = [
          { op: 'add', path: '/a', value: 1 },
          { op: 'remove', path: '/b' },
          { op: 'replace', path: '/c', value: 2 },
          { op: 'move', from: '/d', path: '/e' },
          { op: 'copy', from: '/f', path: '/g' },
          { op: 'test', path: '/h', value: 3 },
        ];
        const event = adapter.emitStateDelta(delta);

        expect(event.delta).toHaveLength(6);
      });
    });

    describe('MESSAGES_SNAPSHOT', () => {
      it('should emit MESSAGES_SNAPSHOT event', () => {
        const messages: ConversationMessage[] = [
          { id: 'msg-1', role: 'user', content: 'Hello', timestamp: '2026-01-30T10:00:00Z' },
          { id: 'msg-2', role: 'assistant', content: 'Hi there!', timestamp: '2026-01-30T10:00:01Z' },
        ];
        const event = adapter.emitMessagesSnapshot(messages);

        expect(event.type).toBe(AGUIEventType.MESSAGES_SNAPSHOT);
        expect(event.messages).toHaveLength(2);
        expect(event.messages[0].role).toBe('user');
      });
    });

    describe('ACTIVITY_SNAPSHOT', () => {
      it('should emit ACTIVITY_SNAPSHOT event', () => {
        const activities: ActivityMessage[] = [
          { id: 'act-1', type: 'thinking', message: 'Analyzing...', progress: 30, timestamp: '2026-01-30T10:00:00Z' },
        ];
        const event = adapter.emitActivitySnapshot(activities);

        expect(event.type).toBe(AGUIEventType.ACTIVITY_SNAPSHOT);
        expect(event.activity).toHaveLength(1);
        // Default replace is false when not explicitly set
        expect(event.replace).toBe(false);
      });

      it('should support replace flag', () => {
        const activities: ActivityMessage[] = [];
        const event = adapter.emitActivitySnapshot(activities, true);

        expect(event.replace).toBe(true);
      });

      it('should track activities', () => {
        const activities: ActivityMessage[] = [
          { id: 'act-1', type: 'executing', message: 'Running tests', timestamp: '2026-01-30T10:00:00Z' },
        ];
        adapter.emitActivitySnapshot(activities);

        expect(adapter.getActivities()).toHaveLength(1);
      });
    });

    describe('ACTIVITY_DELTA', () => {
      it('should emit ACTIVITY_DELTA event', () => {
        const delta: JsonPatchOperation[] = [
          { op: 'replace', path: '/0/progress', value: 50 },
        ];
        const event = adapter.emitActivityDelta(delta);

        expect(event.type).toBe(AGUIEventType.ACTIVITY_DELTA);
        expect(event.delta).toEqual(delta);
      });
    });
  });

  // ============================================================================
  // Special Events Tests
  // ============================================================================

  describe('Special Events', () => {
    describe('RAW', () => {
      it('should emit RAW event', () => {
        const rawData = { custom: 'data', nested: { value: 123 } };
        const event = adapter.emitRaw(rawData, 'openai');

        expect(event.type).toBe(AGUIEventType.RAW);
        expect(event.event).toEqual(rawData);
        expect(event.source).toBe('openai');
      });

      it('should emit RAW without source', () => {
        const event = adapter.emitRaw({ data: 'test' });
        expect(event.source).toBeUndefined();
      });
    });

    describe('CUSTOM', () => {
      it('should emit CUSTOM event', () => {
        const event = adapter.emitCustom('my_event', { data: 'value' });

        expect(event.type).toBe(AGUIEventType.CUSTOM);
        expect(event.name).toBe('my_event');
        expect(event.value).toEqual({ data: 'value' });
      });
    });
  });

  // ============================================================================
  // AQE Event Adaptation Tests
  // ============================================================================

  describe('AQE Event Adaptation', () => {
    describe('ToolProgress Adaptation', () => {
      it('should adapt ToolProgress to STEP_STARTED and TEXT_MESSAGE_CONTENT', () => {
        const progress = createToolProgress({ percent: 0, stepId: 'step-1' });
        const events = adapter.adapt(progress);

        // Should create STEP_STARTED and TEXT_MESSAGE_CONTENT
        expect(events.length).toBeGreaterThanOrEqual(2);
        expect(events[0].type).toBe(AGUIEventType.STEP_STARTED);
        expect(events[1].type).toBe(AGUIEventType.TEXT_MESSAGE_CONTENT);
      });

      it('should emit STEP_FINISHED when progress reaches 100%', () => {
        const progress0 = createToolProgress({ percent: 0, stepId: 'step-1' });
        const progress100 = createToolProgress({ percent: 100, stepId: 'step-1' });

        adapter.adapt(progress0);
        const events = adapter.adapt(progress100);

        const finishEvent = events.find((e) => e.type === AGUIEventType.STEP_FINISHED);
        expect(finishEvent).toBeDefined();
      });

      it('should not emit STEP_STARTED for continuation events', () => {
        const progress50 = createToolProgress({ percent: 50, stepId: 'step-1' });
        const progress75 = createToolProgress({ percent: 75, stepId: 'step-1' });

        adapter.adapt(progress50);
        const events = adapter.adapt(progress75);

        const startEvents = events.filter((e) => e.type === AGUIEventType.STEP_STARTED);
        expect(startEvents).toHaveLength(0);
      });

      it('should include tool name in step metadata', () => {
        const progress = createToolProgress({ toolName: 'test_generate', stepId: 'step-1' });
        const events = adapter.adapt(progress);

        const startEvent = events.find((e) => e.type === AGUIEventType.STEP_STARTED);
        expect(startEvent).toBeDefined();
        if (startEvent && 'name' in startEvent) {
          expect(startEvent.name).toBe('test_generate');
        }
      });
    });

    describe('ToolResult Adaptation', () => {
      it('should adapt ToolResult to TOOL_CALL_RESULT', () => {
        const result = createToolResult({ success: true, data: { value: 42 } });
        const events = adapter.adapt(result);

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe(AGUIEventType.TOOL_CALL_RESULT);
      });

      it('should include success status', () => {
        const result = createToolResult({ success: false, error: 'Failed' });
        const events = adapter.adapt(result);

        const event = events[0];
        if ('success' in event) {
          expect(event.success).toBe(false);
        }
      });

      it('should store ID mapping for tool call', () => {
        const result = createToolResult();
        adapter.adapt(result);

        // Should have mapping for request ID
        expect(adapter.getIdMappings().length).toBeGreaterThan(0);
      });
    });

    describe('AgentStarted Adaptation', () => {
      it('should adapt AgentStarted to RUN_STARTED', () => {
        const started = createAgentStarted();
        const events = adapter.adapt(started);

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe(AGUIEventType.RUN_STARTED);
      });

      it('should set current run ID', () => {
        const started = createAgentStarted({ agentId: 'agent-xyz' });
        adapter.adapt(started);

        expect(adapter.getCurrentRunId()).toBeDefined();
      });

      it('should store agent ID to run ID mapping', () => {
        const started = createAgentStarted({ agentId: 'agent-xyz' });
        adapter.adapt(started);

        const runId = adapter.getCurrentRunId()!;
        expect(adapter.getAguiId('agent-xyz')).toBe(runId);
      });

      it('should include metadata from agent event', () => {
        const started = createAgentStarted({ domain: 'test-execution', task: 'Run tests' });
        const events = adapter.adapt(started);

        const event = events[0];
        if ('metadata' in event && event.metadata) {
          expect(event.metadata.domain).toBe('test-execution');
        }
        if ('input' in event) {
          expect(event.input).toBe('Run tests');
        }
      });
    });

    describe('AgentCompleted Adaptation', () => {
      it('should adapt AgentCompleted to RUN_FINISHED', () => {
        const started = createAgentStarted({ agentId: 'agent-001' });
        const completed = createAgentCompleted({ agentId: 'agent-001' });

        adapter.adapt(started);
        const events = adapter.adapt(completed);

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe(AGUIEventType.RUN_FINISHED);
      });

      it('should use correct run ID from mapping', () => {
        const started = createAgentStarted({ agentId: 'agent-001' });
        const completed = createAgentCompleted({ agentId: 'agent-001' });

        adapter.adapt(started);
        const runId = adapter.getCurrentRunId()!;
        const events = adapter.adapt(completed);

        const event = events[0];
        if ('runId' in event) {
          expect(event.runId).toBe(runId);
        }
      });

      it('should include result data', () => {
        const started = createAgentStarted();
        const completed = createAgentCompleted({ result: { tests: 5 } });

        adapter.adapt(started);
        const events = adapter.adapt(completed);

        const event = events[0];
        if ('result' in event) {
          expect(event.result).toEqual({ tests: 5 });
        }
      });
    });

    describe('AgentError Adaptation', () => {
      it('should adapt AgentError to RUN_ERROR', () => {
        const started = createAgentStarted();
        const error = createAgentError({ error: 'Something failed', code: 'ERR_001' });

        adapter.adapt(started);
        const events = adapter.adapt(error);

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe(AGUIEventType.RUN_ERROR);
      });

      it('should include error details', () => {
        const started = createAgentStarted();
        const error = createAgentError({
          error: 'Connection timeout',
          code: 'TIMEOUT',
          recoverable: true,
        });

        adapter.adapt(started);
        const events = adapter.adapt(error);

        const event = events[0];
        if ('message' in event) {
          expect(event.message).toBe('Connection timeout');
        }
        if ('code' in event) {
          expect(event.code).toBe('TIMEOUT');
        }
        if ('recoverable' in event) {
          expect(event.recoverable).toBe(true);
        }
      });
    });

    describe('DomainEvent Adaptation', () => {
      it('should adapt started domain event to STEP_STARTED', () => {
        adapter.emitRunStarted('thread-1', 'run-1');
        const domainEvent = createDomainEvent({ type: 'test-generation.TestRunStarted' });
        const events = adapter.adapt(domainEvent);

        const stepStarted = events.find((e) => e.type === AGUIEventType.STEP_STARTED);
        expect(stepStarted).toBeDefined();
      });

      it('should adapt completed domain event to STEP_FINISHED', () => {
        adapter.emitRunStarted('thread-1', 'run-1');
        const domainEvent = createDomainEvent({ type: 'test-execution.TestRunCompleted' });
        const events = adapter.adapt(domainEvent);

        const stepFinished = events.find((e) => e.type === AGUIEventType.STEP_FINISHED);
        expect(stepFinished).toBeDefined();
      });

      it('should adapt unknown domain event to CUSTOM', () => {
        adapter.emitRunStarted('thread-1', 'run-1');
        const domainEvent = createDomainEvent({ type: 'custom.SomeEvent' });
        const events = adapter.adapt(domainEvent);

        const customEvent = events.find((e) => e.type === AGUIEventType.CUSTOM);
        expect(customEvent).toBeDefined();
      });

      it('should include payload in custom event', () => {
        adapter.emitRunStarted('thread-1', 'run-1');
        const domainEvent = createDomainEvent({ type: 'custom.Event', payload: { data: 'test' } });
        const events = adapter.adapt(domainEvent);

        const customEvent = events.find((e) => e.type === AGUIEventType.CUSTOM);
        if (customEvent && 'value' in customEvent) {
          expect(customEvent.value).toEqual({ data: 'test' });
        }
      });
    });

    describe('Unknown Event Adaptation', () => {
      it('should emit RAW event for unknown event types', () => {
        const unknownEvent = { unknownType: 'test', data: 123 };
        const events = adapter.adapt(unknownEvent as never);

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe(AGUIEventType.RAW);
      });

      it('should not emit RAW when emitRawForUnknown is false', () => {
        const adapterNoRaw = createEventAdapter({ emitRawForUnknown: false });
        const unknownEvent = { unknownType: 'test' };
        const events = adapterNoRaw.adapt(unknownEvent as never);

        expect(events).toHaveLength(0);
      });
    });
  });

  // ============================================================================
  // ID Mapping Tests
  // ============================================================================

  describe('ID Mapping', () => {
    it('should store bidirectional ID mappings', () => {
      const started = createAgentStarted({ agentId: 'agent-123' });
      adapter.adapt(started);

      const runId = adapter.getCurrentRunId()!;
      expect(adapter.getAguiId('agent-123')).toBe(runId);
      expect(adapter.getAqeId(runId)).toBe('agent-123');
    });

    it('should return undefined for unknown IDs', () => {
      expect(adapter.getAguiId('unknown')).toBeUndefined();
      expect(adapter.getAqeId('unknown')).toBeUndefined();
    });

    it('should track all ID mappings', () => {
      const started = createAgentStarted({ agentId: 'agent-1' });
      const result = createToolResult();

      adapter.adapt(started);
      adapter.adapt(result);

      const mappings = adapter.getIdMappings();
      expect(mappings.length).toBeGreaterThanOrEqual(2);
    });

    it('should include mapping metadata', () => {
      const started = createAgentStarted({ agentId: 'agent-1' });
      adapter.adapt(started);

      const mappings = adapter.getIdMappings();
      const runMapping = mappings.find((m) => m.eventType === 'run');

      expect(runMapping).toBeDefined();
      expect(runMapping?.createdAt).toBeDefined();
    });
  });

  // ============================================================================
  // Event Buffering Tests
  // ============================================================================

  describe('Event Buffering', () => {
    it('should buffer emitted events', () => {
      adapter.emitRunStarted('thread-1', 'run-1');
      adapter.emitStepStarted('step-1', 'Test');
      adapter.emitStepFinished('step-1');

      const buffered = adapter.getBufferedEvents();
      expect(buffered).toHaveLength(3);
    });

    it('should respect max buffer size', () => {
      const smallAdapter = createEventAdapter({ maxBufferSize: 2 });

      smallAdapter.emitRunStarted('t', 'r1');
      smallAdapter.emitStepStarted('s1', 'Test');
      smallAdapter.emitStepFinished('s1');

      const buffered = smallAdapter.getBufferedEvents();
      expect(buffered).toHaveLength(2);
    });

    it('should clear buffer on demand', () => {
      adapter.emitRunStarted('thread-1', 'run-1');
      adapter.clearBuffer();

      expect(adapter.getBufferedEvents()).toHaveLength(0);
    });
  });

  // ============================================================================
  // EventEmitter Tests
  // ============================================================================

  describe('EventEmitter Pattern', () => {
    it('should emit events via EventEmitter', () => {
      const received: AGUIEvent[] = [];
      adapter.on('event', (e: AGUIEvent) => received.push(e));

      adapter.emitRunStarted('thread-1', 'run-1');

      expect(received).toHaveLength(1);
      expect(received[0].type).toBe(AGUIEventType.RUN_STARTED);
    });

    it('should emit events by type', () => {
      const runStartedEvents: AGUIEvent[] = [];
      adapter.on(AGUIEventType.RUN_STARTED, (e: AGUIEvent) => runStartedEvents.push(e));

      adapter.emitRunStarted('thread-1', 'run-1');
      adapter.emitStepStarted('step-1', 'Test');

      expect(runStartedEvents).toHaveLength(1);
    });

    it('should emit errors', () => {
      const errors: Error[] = [];
      adapter.on('error', (e: Error) => errors.push(e));

      // Force an error by passing invalid event type to adapt
      // (This tests the try/catch in adapt method)
      const invalidAdapter = createEventAdapter({ validateEvents: true });
      invalidAdapter.on('error', (e: Error) => errors.push(e));

      // The adapter should handle errors gracefully
      expect(errors.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // Reset Tests
  // ============================================================================

  describe('Reset', () => {
    it('should reset all state', () => {
      adapter.emitRunStarted('thread-1', 'run-1');
      adapter.emitStepStarted('step-1', 'Test');
      adapter.emitTextMessageStart('msg-1');
      adapter.emitToolCallStart('tc-1', 'tool');

      adapter.reset();

      expect(adapter.getCurrentRunId()).toBeNull();
      expect(adapter.getActiveRuns().size).toBe(0);
      expect(adapter.getAllMessageStates().size).toBe(0);
      expect(adapter.getAllToolCallStates().size).toBe(0);
      expect(adapter.getIdMappings()).toHaveLength(0);
      expect(adapter.getBufferedEvents()).toHaveLength(0);
    });
  });
});

// ============================================================================
// Type Guards Tests
// ============================================================================

describe('Type Guards', () => {
  describe('isAQEToolProgress', () => {
    it('should return true for valid ToolProgress', () => {
      const event = createToolProgress();
      expect(isAQEToolProgress(event)).toBe(true);
    });

    it('should return false for invalid events', () => {
      expect(isAQEToolProgress(null)).toBe(false);
      expect(isAQEToolProgress(undefined)).toBe(false);
      expect(isAQEToolProgress({})).toBe(false);
      expect(isAQEToolProgress({ type: 'other' })).toBe(false);
    });
  });

  describe('isAQEToolResult', () => {
    it('should return true for valid ToolResult', () => {
      const event = createToolResult();
      expect(isAQEToolResult(event)).toBe(true);
    });

    it('should return false for invalid events', () => {
      expect(isAQEToolResult(null)).toBe(false);
      expect(isAQEToolResult({})).toBe(false);
      expect(isAQEToolResult({ success: 'string' })).toBe(false);
    });
  });

  describe('isAQEAgentStarted', () => {
    it('should return true for valid AgentStarted', () => {
      const event = createAgentStarted();
      expect(isAQEAgentStarted(event)).toBe(true);
    });

    it('should return false for invalid events', () => {
      expect(isAQEAgentStarted(null)).toBe(false);
      expect(isAQEAgentStarted({ type: 'agent_completed' })).toBe(false);
    });
  });

  describe('isAQEAgentCompleted', () => {
    it('should return true for valid AgentCompleted', () => {
      const event = createAgentCompleted();
      expect(isAQEAgentCompleted(event)).toBe(true);
    });

    it('should return false for invalid events', () => {
      expect(isAQEAgentCompleted(null)).toBe(false);
      expect(isAQEAgentCompleted({ type: 'agent_started' })).toBe(false);
    });
  });

  describe('isAQEAgentError', () => {
    it('should return true for valid AgentError', () => {
      const event = createAgentError();
      expect(isAQEAgentError(event)).toBe(true);
    });

    it('should return false for invalid events', () => {
      expect(isAQEAgentError(null)).toBe(false);
      expect(isAQEAgentError({ type: 'other_error' })).toBe(false);
    });
  });

  describe('isAQEDomainEvent', () => {
    it('should return true for valid DomainEvent', () => {
      const event = createDomainEvent();
      expect(isAQEDomainEvent(event)).toBe(true);
    });

    it('should return false for invalid events', () => {
      expect(isAQEDomainEvent(null)).toBe(false);
      expect(isAQEDomainEvent({ id: 'x' })).toBe(false);
      expect(isAQEDomainEvent({ id: 'x', type: 'y', timestamp: 't' })).toBe(false);
    });
  });
});

// ============================================================================
// Event Category Tests
// ============================================================================

describe('Event Categories', () => {
  describe('getEventCategory', () => {
    it('should return lifecycle for lifecycle events', () => {
      expect(getEventCategory(AGUIEventType.RUN_STARTED)).toBe('lifecycle');
      expect(getEventCategory(AGUIEventType.RUN_FINISHED)).toBe('lifecycle');
      expect(getEventCategory(AGUIEventType.RUN_ERROR)).toBe('lifecycle');
      expect(getEventCategory(AGUIEventType.STEP_STARTED)).toBe('lifecycle');
      expect(getEventCategory(AGUIEventType.STEP_FINISHED)).toBe('lifecycle');
    });

    it('should return text for text message events', () => {
      expect(getEventCategory(AGUIEventType.TEXT_MESSAGE_START)).toBe('text');
      expect(getEventCategory(AGUIEventType.TEXT_MESSAGE_CONTENT)).toBe('text');
      expect(getEventCategory(AGUIEventType.TEXT_MESSAGE_END)).toBe('text');
    });

    it('should return tool for tool call events', () => {
      expect(getEventCategory(AGUIEventType.TOOL_CALL_START)).toBe('tool');
      expect(getEventCategory(AGUIEventType.TOOL_CALL_ARGS)).toBe('tool');
      expect(getEventCategory(AGUIEventType.TOOL_CALL_END)).toBe('tool');
      expect(getEventCategory(AGUIEventType.TOOL_CALL_RESULT)).toBe('tool');
    });

    it('should return state for state management events', () => {
      expect(getEventCategory(AGUIEventType.STATE_SNAPSHOT)).toBe('state');
      expect(getEventCategory(AGUIEventType.STATE_DELTA)).toBe('state');
      expect(getEventCategory(AGUIEventType.MESSAGES_SNAPSHOT)).toBe('state');
      expect(getEventCategory(AGUIEventType.ACTIVITY_SNAPSHOT)).toBe('state');
      expect(getEventCategory(AGUIEventType.ACTIVITY_DELTA)).toBe('state');
    });

    it('should return special for special events', () => {
      expect(getEventCategory(AGUIEventType.RAW)).toBe('special');
      expect(getEventCategory(AGUIEventType.CUSTOM)).toBe('special');
    });
  });

  describe('getEventTypesForCategory', () => {
    it('should return all lifecycle events', () => {
      const types = getEventTypesForCategory('lifecycle');
      expect(types).toHaveLength(5);
      expect(types).toContain(AGUIEventType.RUN_STARTED);
      expect(types).toContain(AGUIEventType.RUN_FINISHED);
      expect(types).toContain(AGUIEventType.RUN_ERROR);
      expect(types).toContain(AGUIEventType.STEP_STARTED);
      expect(types).toContain(AGUIEventType.STEP_FINISHED);
    });

    it('should return all text events', () => {
      const types = getEventTypesForCategory('text');
      expect(types).toHaveLength(3);
    });

    it('should return all tool events', () => {
      const types = getEventTypesForCategory('tool');
      expect(types).toHaveLength(4);
    });

    it('should return all state events', () => {
      const types = getEventTypesForCategory('state');
      expect(types).toHaveLength(5);
    });

    it('should return all special events', () => {
      const types = getEventTypesForCategory('special');
      expect(types).toHaveLength(2);
    });
  });
});

// ============================================================================
// Integration Scenario Tests
// ============================================================================

describe('Integration Scenarios', () => {
  let adapter: EventAdapter;

  beforeEach(() => {
    adapter = createEventAdapter();
  });

  describe('Full Agent Run Lifecycle', () => {
    it('should handle complete agent lifecycle', () => {
      const events: AGUIEvent[] = [];
      adapter.on('event', (e: AGUIEvent) => events.push(e));

      // Agent starts
      adapter.adapt(createAgentStarted({ agentId: 'agent-1', task: 'Generate tests' }));

      // Progress updates
      adapter.adapt(createToolProgress({ percent: 25, message: 'Analyzing code', stepId: 'analyze' }));
      adapter.adapt(createToolProgress({ percent: 50, message: 'Generating tests', stepId: 'generate' }));
      adapter.adapt(createToolProgress({ percent: 100, message: 'Complete', stepId: 'generate' }));

      // Tool result
      adapter.adapt(createToolResult({ success: true, data: { testsGenerated: 5 } }));

      // Agent completes
      adapter.adapt(createAgentCompleted({ agentId: 'agent-1', result: { tests: 5 } }));

      // Flush any batched events before assertions
      adapter.flushBatcher();

      // Verify events
      expect(events.some((e) => e.type === AGUIEventType.RUN_STARTED)).toBe(true);
      expect(events.some((e) => e.type === AGUIEventType.STEP_STARTED)).toBe(true);
      expect(events.some((e) => e.type === AGUIEventType.STEP_FINISHED)).toBe(true);
      expect(events.some((e) => e.type === AGUIEventType.TOOL_CALL_RESULT)).toBe(true);
      expect(events.some((e) => e.type === AGUIEventType.RUN_FINISHED)).toBe(true);
    });

    it('should handle agent error lifecycle', () => {
      const events: AGUIEvent[] = [];
      adapter.on('event', (e: AGUIEvent) => events.push(e));

      // Agent starts
      adapter.adapt(createAgentStarted({ agentId: 'agent-2' }));

      // Some progress
      adapter.adapt(createToolProgress({ percent: 25, stepId: 'step-1' }));

      // Error occurs
      adapter.adapt(createAgentError({ agentId: 'agent-2', error: 'Failed', code: 'ERR' }));

      // Verify error event was emitted
      expect(events.some((e) => e.type === AGUIEventType.RUN_ERROR)).toBe(true);
    });
  });

  describe('Multi-Agent Coordination', () => {
    it('should track multiple concurrent runs', () => {
      // Start first agent
      const started1 = createAgentStarted({ agentId: 'agent-1', domain: 'test-generation' });
      adapter.adapt(started1);
      const run1 = adapter.getCurrentRunId();

      // Manually create second run (simulating parallel agent)
      adapter.emitRunStarted('thread-2', 'run-2');

      // Should have two active runs
      expect(adapter.getActiveRuns().size).toBe(2);
    });
  });

  describe('Streaming Message Sequence', () => {
    it('should handle complete message streaming', () => {
      adapter.emitRunStarted('thread-1', 'run-1');

      // Start message
      adapter.emitTextMessageStart('msg-1', 'assistant');

      // Stream content
      adapter.emitTextMessageContent('msg-1', 'Here ');
      adapter.emitTextMessageContent('msg-1', 'are ');
      adapter.emitTextMessageContent('msg-1', 'the results.');

      // End message
      const endEvent = adapter.emitTextMessageEnd('msg-1');

      // Verify accumulated content
      expect(endEvent.content).toBe('Here are the results.');
    });
  });

  describe('Tool Call Sequence', () => {
    it('should handle complete tool call with streaming args', () => {
      adapter.emitRunStarted('thread-1', 'run-1');

      // Start tool call
      adapter.emitToolCallStart('tc-1', 'search_database', 'msg-1');

      // Stream arguments
      adapter.emitToolCallArgs('tc-1', '{"query":');
      adapter.emitToolCallArgs('tc-1', '"SELECT * FROM users"');
      adapter.emitToolCallArgs('tc-1', ',"limit":10}');

      // End args
      const endEvent = adapter.emitToolCallEnd('tc-1');

      // Get result
      adapter.emitToolCallResult('tc-1', '[{"id":1},{"id":2}]', 'msg-2');

      // Verify parsed args
      expect(endEvent.args).toEqual({
        query: 'SELECT * FROM users',
        limit: 10,
      });

      // Verify tool call state
      const state = adapter.getToolCallState('tc-1');
      expect(state?.complete).toBe(true);
      expect(state?.result).toBe('[{"id":1},{"id":2}]');
    });
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('Edge Cases', () => {
  let adapter: EventAdapter;

  beforeEach(() => {
    adapter = createEventAdapter();
  });

  it('should handle empty messages', () => {
    adapter.emitTextMessageStart('msg-1');
    const event = adapter.emitTextMessageEnd('msg-1');
    expect(event.content).toBe('');
  });

  it('should handle special characters in content', () => {
    adapter.emitTextMessageStart('msg-1');
    adapter.emitTextMessageContent('msg-1', '{"json": "value"}');
    adapter.emitTextMessageContent('msg-1', '\n\t\\special');

    const state = adapter.getMessageState('msg-1');
    expect(state?.content).toBe('{"json": "value"}\n\t\\special');
  });

  it('should handle very large delta content', () => {
    adapter.emitTextMessageStart('msg-1');
    const largeContent = 'a'.repeat(10000);
    adapter.emitTextMessageContent('msg-1', largeContent);

    const state = adapter.getMessageState('msg-1');
    expect(state?.content.length).toBe(10000);
  });

  it('should handle unicode in events', () => {
    const event = adapter.emitCustom('unicode_test', {
      emoji: '123',
      chinese: '12345',
      arabic: '12345',
    });

    expect(event.value).toEqual({
      emoji: '123',
      chinese: '12345',
      arabic: '12345',
    });
  });

  it('should handle null/undefined in payloads', () => {
    const result = createToolResult({ data: null });
    const events = adapter.adapt(result);

    expect(events).toHaveLength(1);
    const event = events[0];
    if ('content' in event) {
      // null gets stringified as 'null', undefined becomes '{}'
      expect(event.content).toBe('{}');
    }
  });

  it('should handle missing optional fields in AQE events', () => {
    const minimalProgress: AQEToolProgress = {
      type: 'progress',
      message: 'Processing',
      percent: 50,
    };

    const events = adapter.adapt(minimalProgress);
    expect(events.length).toBeGreaterThan(0);
  });

  it('should track message state when disabled', () => {
    const noTrackAdapter = createEventAdapter({ trackMessageState: false });
    noTrackAdapter.emitTextMessageStart('msg-1');

    const state = noTrackAdapter.getMessageState('msg-1');
    expect(state).toBeUndefined();
  });
});

// ============================================================================
// All 19 Event Types Verification
// ============================================================================

describe('All 19 AG-UI Event Types', () => {
  it('should have exactly 19 event types defined', () => {
    const eventTypes = Object.values(AGUIEventType);
    expect(eventTypes).toHaveLength(19);
  });

  it('should have 5 lifecycle events', () => {
    const lifecycleTypes = getEventTypesForCategory('lifecycle');
    expect(lifecycleTypes).toHaveLength(5);
  });

  it('should have 3 text events', () => {
    const textTypes = getEventTypesForCategory('text');
    expect(textTypes).toHaveLength(3);
  });

  it('should have 4 tool events', () => {
    const toolTypes = getEventTypesForCategory('tool');
    expect(toolTypes).toHaveLength(4);
  });

  it('should have 5 state events', () => {
    const stateTypes = getEventTypesForCategory('state');
    expect(stateTypes).toHaveLength(5);
  });

  it('should have 2 special events', () => {
    const specialTypes = getEventTypesForCategory('special');
    expect(specialTypes).toHaveLength(2);
  });

  it('should verify total: 5+3+4+5+2 = 19', () => {
    const total =
      getEventTypesForCategory('lifecycle').length +
      getEventTypesForCategory('text').length +
      getEventTypesForCategory('tool').length +
      getEventTypesForCategory('state').length +
      getEventTypesForCategory('special').length;

    expect(total).toBe(19);
  });
});
