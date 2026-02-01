/**
 * AG-UI Event Adapter
 *
 * Maps AQE v3 events to AG-UI Protocol 1.0 event taxonomy.
 * Supports bidirectional event ID mapping and multi-agent scenarios.
 *
 * @module adapters/ag-ui/event-adapter
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type {
  AGUIEvent,
  AGUIEventType,
  AQEEvent,
  AQEToolProgress,
  AQEToolResult,
  AQEAgentStarted,
  AQEAgentCompleted,
  AQEAgentError,
  AQEDomainEvent,
  RunStartedEvent,
  RunFinishedEvent,
  RunErrorEvent,
  StepStartedEvent,
  StepFinishedEvent,
  TextMessageStartEvent,
  TextMessageContentEvent,
  TextMessageEndEvent,
  ToolCallStartEvent,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallResultEvent,
  StateSnapshotEvent,
  StateDeltaEvent,
  MessagesSnapshotEvent,
  ActivitySnapshotEvent,
  ActivityDeltaEvent,
  RawEvent,
  CustomEvent,
  JsonPatchOperation,
  ConversationMessage,
  ActivityMessage,
} from './event-types.js';
import {
  isAQEToolProgress,
  isAQEToolResult,
  isAQEAgentStarted,
  isAQEAgentCompleted,
  isAQEAgentError,
  isAQEDomainEvent,
} from './event-types.js';
import {
  EventBatcher,
  createEventBatcher,
  type EventBatcherConfig,
  type EventBatch,
  type BatcherMetrics,
} from './event-batcher.js';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Event adapter configuration
 */
export interface EventAdapterConfig {
  /** Default thread ID for events without explicit thread */
  defaultThreadId?: string;
  /** Whether to emit RAW events for unrecognized source events */
  emitRawForUnknown?: boolean;
  /** Whether to track message state for TEXT_MESSAGE events */
  trackMessageState?: boolean;
  /** Whether to track activity state */
  trackActivityState?: boolean;
  /** Custom event ID generator */
  eventIdGenerator?: () => string;
  /** Custom timestamp generator */
  timestampGenerator?: () => string;
  /** Whether to validate events before emission */
  validateEvents?: boolean;
  /** Maximum events to buffer for streaming */
  maxBufferSize?: number;
  /** Enable event batching for reduced network overhead */
  enableBatching?: boolean;
  /** Event batcher configuration */
  batcherConfig?: EventBatcherConfig;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<EventAdapterConfig> = {
  defaultThreadId: 'default',
  emitRawForUnknown: true,
  trackMessageState: true,
  trackActivityState: true,
  eventIdGenerator: () => uuidv4(),
  timestampGenerator: () => new Date().toISOString(),
  validateEvents: true,
  maxBufferSize: 1000,
  enableBatching: true,
  batcherConfig: {},
};

// ============================================================================
// ID Mapping Types
// ============================================================================

/**
 * Bidirectional ID mapping entry
 */
export interface IdMapping {
  /** AQE ID */
  aqeId: string;
  /** AG-UI ID */
  aguiId: string;
  /** Creation timestamp */
  createdAt: string;
  /** Event type for context */
  eventType: 'run' | 'step' | 'message' | 'tool_call';
}

/**
 * Run context for tracking active runs
 */
export interface RunContext {
  /** Run ID */
  runId: string;
  /** Thread ID */
  threadId: string;
  /** Started timestamp */
  startedAt: string;
  /** Agent ID if from agent event */
  agentId?: string;
  /** Domain if known */
  domain?: string;
  /** Active step IDs */
  activeSteps: Set<string>;
  /** Active message IDs */
  activeMessages: Set<string>;
  /** Active tool call IDs */
  activeToolCalls: Set<string>;
}

/**
 * Message state for tracking streaming messages
 */
export interface MessageState {
  /** Message ID */
  messageId: string;
  /** Accumulated content */
  content: string;
  /** Role */
  role: 'user' | 'assistant' | 'system' | 'tool';
  /** Started timestamp */
  startedAt: string;
  /** Whether message is complete */
  complete: boolean;
}

/**
 * Tool call state for tracking streaming tool calls
 */
export interface ToolCallState {
  /** Tool call ID */
  toolCallId: string;
  /** Tool name */
  toolName: string;
  /** Accumulated arguments JSON */
  argsJson: string;
  /** Parsed arguments */
  args?: Record<string, unknown>;
  /** Started timestamp */
  startedAt: string;
  /** Whether call is complete */
  complete: boolean;
  /** Result if available */
  result?: string;
}

// ============================================================================
// Event Adapter Implementation
// ============================================================================

/**
 * AG-UI Event Adapter
 *
 * Adapts AQE v3 events to AG-UI Protocol 1.0 event format.
 * Emits events via EventEmitter pattern for streaming support.
 */
export class EventAdapter extends EventEmitter {
  private config: Required<EventAdapterConfig>;

  // ID Mapping (bidirectional)
  private aqeToAgui: Map<string, string> = new Map();
  private aguiToAqe: Map<string, string> = new Map();
  private idMappings: IdMapping[] = [];

  // Run tracking
  private activeRuns: Map<string, RunContext> = new Map();
  private currentRunId: string | null = null;

  // Message tracking
  private messageStates: Map<string, MessageState> = new Map();

  // Tool call tracking
  private toolCallStates: Map<string, ToolCallState> = new Map();

  // Activity tracking
  private activities: ActivityMessage[] = [];

  // Event buffer for streaming
  private eventBuffer: AGUIEvent[] = [];

  // Step progress tracking (for ToolProgress -> STEP events)
  private stepProgress: Map<string, number> = new Map();

  // Event batcher for reduced network overhead
  private readonly eventBatcher: EventBatcher | null;

  constructor(config: EventAdapterConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize event batcher for batched event emission
    if (this.config.enableBatching) {
      this.eventBatcher = createEventBatcher({
        ...this.config.batcherConfig,
        onFlush: (batch: EventBatch) => this.handleBatchFlush(batch),
      });

      // Forward batcher events
      this.eventBatcher.on('batch', (batch: EventBatch) => {
        this.emit('batch', batch);
      });
      this.eventBatcher.on('single', (event: AGUIEvent) => {
        this.emit('single', event);
      });
    } else {
      this.eventBatcher = null;
    }
  }

  /**
   * Handle batch flush - emit batch to consumers
   */
  private handleBatchFlush(batch: EventBatch): void {
    // Emit the entire batch for consumers that support batching
    this.emit('batchFlush', batch);
    // Also emit individual events for backward compatibility
    for (const event of batch.events) {
      this.emit('event', event);
      this.emit(event.type, event);
    }
  }

  // ============================================================================
  // Main Adaptation Method
  // ============================================================================

  /**
   * Adapt an AQE event to AG-UI events
   *
   * @param event - Source AQE event
   * @returns Array of AG-UI events (may be empty or multiple)
   */
  adapt(event: AQEEvent): AGUIEvent[] {
    const events: AGUIEvent[] = [];

    try {
      if (isAQEToolProgress(event)) {
        events.push(...this.adaptToolProgress(event));
      } else if (isAQEToolResult(event)) {
        events.push(...this.adaptToolResult(event));
      } else if (isAQEAgentStarted(event)) {
        events.push(...this.adaptAgentStarted(event));
      } else if (isAQEAgentCompleted(event)) {
        events.push(...this.adaptAgentCompleted(event));
      } else if (isAQEAgentError(event)) {
        events.push(...this.adaptAgentError(event));
      } else if (isAQEDomainEvent(event)) {
        events.push(...this.adaptDomainEvent(event));
      } else if (this.config.emitRawForUnknown) {
        events.push(this.createRawEvent(event));
      }

      // Validate and emit events
      for (const aguiEvent of events) {
        if (this.config.validateEvents) {
          this.validateEvent(aguiEvent);
        }
        this.emitEvent(aguiEvent);
        this.bufferEvent(aguiEvent);
      }
    } catch (error) {
      this.emit('error', error);
    }

    return events;
  }

  // ============================================================================
  // Adaptation Methods by Event Type
  // ============================================================================

  /**
   * Adapt ToolProgress to STEP_STARTED / TEXT_MESSAGE_CONTENT
   */
  private adaptToolProgress(event: AQEToolProgress): AGUIEvent[] {
    const events: AGUIEvent[] = [];
    const runId = this.currentRunId ?? this.createOrGetRunId();
    const stepId = event.stepId ?? this.generateId();

    // Check if this is a new step or continuation
    const existingProgress = this.stepProgress.get(stepId);
    const isNewStep = existingProgress === undefined;

    if (isNewStep) {
      // Emit STEP_STARTED for new steps
      const stepStarted: StepStartedEvent = {
        type: 'STEP_STARTED' as AGUIEventType.STEP_STARTED,
        eventId: this.generateEventId(),
        timestamp: this.generateTimestamp(),
        runId,
        stepId,
        name: event.toolName ?? 'Processing',
        metadata: {
          initialProgress: event.percent,
          message: event.message,
        },
      };
      events.push(stepStarted);

      // Track step in active run
      const runContext = this.activeRuns.get(runId);
      if (runContext) {
        runContext.activeSteps.add(stepId);
      }
    }

    // Update progress tracking
    this.stepProgress.set(stepId, event.percent);

    // Emit TEXT_MESSAGE_CONTENT for progress updates
    const messageId = this.getOrCreateMessageId(stepId);
    const contentEvent: TextMessageContentEvent = {
      type: 'TEXT_MESSAGE_CONTENT' as AGUIEventType.TEXT_MESSAGE_CONTENT,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      messageId,
      delta: event.message,
    };
    events.push(contentEvent);

    // Emit STEP_FINISHED if 100% complete
    if (event.percent >= 100) {
      const stepFinished: StepFinishedEvent = {
        type: 'STEP_FINISHED' as AGUIEventType.STEP_FINISHED,
        eventId: this.generateEventId(),
        timestamp: this.generateTimestamp(),
        runId,
        stepId,
        result: { message: event.message, percent: event.percent },
      };
      events.push(stepFinished);

      // Clean up tracking
      this.stepProgress.delete(stepId);
      const runContext = this.activeRuns.get(runId);
      if (runContext) {
        runContext.activeSteps.delete(stepId);
      }
    }

    return events;
  }

  /**
   * Adapt ToolResult to TOOL_CALL_RESULT
   */
  private adaptToolResult(event: AQEToolResult): AGUIEvent[] {
    const events: AGUIEvent[] = [];
    const toolCallId = event.metadata?.requestId ?? this.generateId();
    const messageId = this.generateId();

    // Create TOOL_CALL_RESULT
    const resultEvent: ToolCallResultEvent = {
      type: 'TOOL_CALL_RESULT' as AGUIEventType.TOOL_CALL_RESULT,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      runId: this.currentRunId ?? undefined,
      toolCallId,
      messageId,
      content: JSON.stringify(event.data ?? {}),
      success: event.success,
      error: event.error,
    };
    events.push(resultEvent);

    // Update tool call state
    const toolCallState = this.toolCallStates.get(toolCallId);
    if (toolCallState) {
      toolCallState.complete = true;
      toolCallState.result = resultEvent.content;
    }

    // Store ID mapping
    if (event.metadata?.requestId) {
      this.storeIdMapping(event.metadata.requestId, toolCallId, 'tool_call');
    }

    return events;
  }

  /**
   * Adapt AgentStarted to RUN_STARTED
   */
  private adaptAgentStarted(event: AQEAgentStarted): AGUIEvent[] {
    const runId = this.generateId();
    const threadId = this.config.defaultThreadId;

    // Create run context
    const runContext: RunContext = {
      runId,
      threadId,
      startedAt: event.timestamp,
      agentId: event.agentId,
      domain: event.domain,
      activeSteps: new Set(),
      activeMessages: new Set(),
      activeToolCalls: new Set(),
    };
    this.activeRuns.set(runId, runContext);
    this.currentRunId = runId;

    // Store ID mapping
    this.storeIdMapping(event.agentId, runId, 'run');

    // Create RUN_STARTED event
    const runStarted: RunStartedEvent = {
      type: 'RUN_STARTED' as AGUIEventType.RUN_STARTED,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      threadId,
      runId,
      input: event.task,
      metadata: {
        agentId: event.agentId,
        domain: event.domain,
      },
    };

    return [runStarted];
  }

  /**
   * Adapt AgentCompleted to RUN_FINISHED
   */
  private adaptAgentCompleted(event: AQEAgentCompleted): AGUIEvent[] {
    const runId = this.getAguiId(event.agentId) ?? this.currentRunId ?? this.generateId();

    // Create RUN_FINISHED event
    const runFinished: RunFinishedEvent = {
      type: 'RUN_FINISHED' as AGUIEventType.RUN_FINISHED,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      runId,
      outcome: 'success',
      result: event.result,
    };

    // Clean up run context
    this.activeRuns.delete(runId);
    if (this.currentRunId === runId) {
      this.currentRunId = null;
    }

    return [runFinished];
  }

  /**
   * Adapt AgentError to RUN_ERROR
   */
  private adaptAgentError(event: AQEAgentError): AGUIEvent[] {
    const runId = this.getAguiId(event.agentId) ?? this.currentRunId ?? this.generateId();

    // Create RUN_ERROR event
    const runError: RunErrorEvent = {
      type: 'RUN_ERROR' as AGUIEventType.RUN_ERROR,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      runId,
      message: event.error,
      code: event.code ?? 'AGENT_ERROR',
      recoverable: event.recoverable,
    };

    // Clean up run context
    this.activeRuns.delete(runId);
    if (this.currentRunId === runId) {
      this.currentRunId = null;
    }

    return [runError];
  }

  /**
   * Adapt DomainEvent to appropriate AG-UI events
   */
  private adaptDomainEvent(event: AQEDomainEvent): AGUIEvent[] {
    const events: AGUIEvent[] = [];

    // Map domain event types to AG-UI events
    const eventType = event.type.toLowerCase();

    if (eventType.includes('started') || eventType.includes('running')) {
      // Map to STEP_STARTED
      const stepId = event.id;
      const stepStarted: StepStartedEvent = {
        type: 'STEP_STARTED' as AGUIEventType.STEP_STARTED,
        eventId: this.generateEventId(),
        timestamp: this.generateTimestamp(),
        runId: this.currentRunId ?? this.createOrGetRunId(),
        stepId,
        name: event.type,
        metadata: event.payload as Record<string, unknown>,
      };
      events.push(stepStarted);
      this.storeIdMapping(event.id, stepId, 'step');
    } else if (eventType.includes('completed') || eventType.includes('finished')) {
      // Map to STEP_FINISHED
      const stepId = this.getAguiId(event.id) ?? event.id;
      const stepFinished: StepFinishedEvent = {
        type: 'STEP_FINISHED' as AGUIEventType.STEP_FINISHED,
        eventId: this.generateEventId(),
        timestamp: this.generateTimestamp(),
        runId: this.currentRunId ?? this.config.defaultThreadId,
        stepId,
        result: event.payload,
      };
      events.push(stepFinished);
    } else if (eventType.includes('error') || eventType.includes('failed')) {
      // Map to RUN_ERROR if no active run, otherwise STEP_FINISHED with error
      if (this.currentRunId) {
        const stepId = this.getAguiId(event.id) ?? event.id;
        const stepFinished: StepFinishedEvent = {
          type: 'STEP_FINISHED' as AGUIEventType.STEP_FINISHED,
          eventId: this.generateEventId(),
          timestamp: this.generateTimestamp(),
          runId: this.currentRunId,
          stepId,
          result: { error: event.payload },
        };
        events.push(stepFinished);
      }
    } else {
      // Default: emit as CUSTOM event
      const customEvent: CustomEvent = {
        type: 'CUSTOM' as AGUIEventType.CUSTOM,
        eventId: this.generateEventId(),
        timestamp: this.generateTimestamp(),
        runId: this.currentRunId ?? undefined,
        name: event.type,
        value: event.payload,
      };
      events.push(customEvent);
    }

    return events;
  }

  // ============================================================================
  // Direct Event Emission Methods
  // ============================================================================

  /**
   * Emit RUN_STARTED event directly
   */
  emitRunStarted(threadId: string, runId?: string, input?: unknown): RunStartedEvent {
    const id = runId ?? this.generateId();

    // Create run context
    const runContext: RunContext = {
      runId: id,
      threadId,
      startedAt: this.generateTimestamp(),
      activeSteps: new Set(),
      activeMessages: new Set(),
      activeToolCalls: new Set(),
    };
    this.activeRuns.set(id, runContext);
    this.currentRunId = id;

    const event: RunStartedEvent = {
      type: 'RUN_STARTED' as AGUIEventType.RUN_STARTED,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      threadId,
      runId: id,
      input,
    };

    this.emitEvent(event);
    this.bufferEvent(event);
    return event;
  }

  /**
   * Emit RUN_FINISHED event directly
   */
  emitRunFinished(
    runId: string,
    outcome: 'success' | 'interrupt' | 'cancelled' = 'success',
    result?: unknown
  ): RunFinishedEvent {
    const event: RunFinishedEvent = {
      type: 'RUN_FINISHED' as AGUIEventType.RUN_FINISHED,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      runId,
      outcome,
      result,
    };

    // Clean up
    this.activeRuns.delete(runId);
    if (this.currentRunId === runId) {
      this.currentRunId = null;
    }

    this.emitEvent(event);
    this.bufferEvent(event);
    return event;
  }

  /**
   * Emit RUN_ERROR event directly
   */
  emitRunError(runId: string, message: string, code: string, recoverable = false): RunErrorEvent {
    const event: RunErrorEvent = {
      type: 'RUN_ERROR' as AGUIEventType.RUN_ERROR,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      runId,
      message,
      code,
      recoverable,
    };

    // Clean up
    this.activeRuns.delete(runId);
    if (this.currentRunId === runId) {
      this.currentRunId = null;
    }

    this.emitEvent(event);
    this.bufferEvent(event);
    return event;
  }

  /**
   * Emit STEP_STARTED event directly
   */
  emitStepStarted(stepId: string, name: string, runId?: string): StepStartedEvent {
    const rid = runId ?? this.currentRunId ?? this.createOrGetRunId();

    const event: StepStartedEvent = {
      type: 'STEP_STARTED' as AGUIEventType.STEP_STARTED,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      runId: rid,
      stepId,
      name,
    };

    // Track in run context
    const runContext = this.activeRuns.get(rid);
    if (runContext) {
      runContext.activeSteps.add(stepId);
    }

    this.emitEvent(event);
    this.bufferEvent(event);
    return event;
  }

  /**
   * Emit STEP_FINISHED event directly
   */
  emitStepFinished(stepId: string, result?: unknown, runId?: string): StepFinishedEvent {
    const rid = runId ?? this.currentRunId ?? this.config.defaultThreadId;

    const event: StepFinishedEvent = {
      type: 'STEP_FINISHED' as AGUIEventType.STEP_FINISHED,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      runId: rid,
      stepId,
      result,
    };

    // Remove from run context
    const runContext = this.activeRuns.get(rid);
    if (runContext) {
      runContext.activeSteps.delete(stepId);
    }

    this.emitEvent(event);
    this.bufferEvent(event);
    return event;
  }

  /**
   * Emit TEXT_MESSAGE_START event directly
   */
  emitTextMessageStart(messageId: string, role: 'assistant' | 'user' | 'system' | 'tool' = 'assistant'): TextMessageStartEvent {
    const event: TextMessageStartEvent = {
      type: 'TEXT_MESSAGE_START' as AGUIEventType.TEXT_MESSAGE_START,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      runId: this.currentRunId ?? undefined,
      messageId,
      role,
    };

    // Track message state
    if (this.config.trackMessageState) {
      this.messageStates.set(messageId, {
        messageId,
        content: '',
        role,
        startedAt: event.timestamp,
        complete: false,
      });
    }

    this.emitEvent(event);
    this.bufferEvent(event);
    return event;
  }

  /**
   * Emit TEXT_MESSAGE_CONTENT event directly
   */
  emitTextMessageContent(messageId: string, delta: string): TextMessageContentEvent {
    const event: TextMessageContentEvent = {
      type: 'TEXT_MESSAGE_CONTENT' as AGUIEventType.TEXT_MESSAGE_CONTENT,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      messageId,
      delta,
    };

    // Update message state
    if (this.config.trackMessageState) {
      const state = this.messageStates.get(messageId);
      if (state) {
        state.content += delta;
      }
    }

    this.emitEvent(event);
    this.bufferEvent(event);
    return event;
  }

  /**
   * Emit TEXT_MESSAGE_END event directly
   */
  emitTextMessageEnd(messageId: string): TextMessageEndEvent {
    // Get accumulated content
    const state = this.messageStates.get(messageId);
    const content = state?.content;

    const event: TextMessageEndEvent = {
      type: 'TEXT_MESSAGE_END' as AGUIEventType.TEXT_MESSAGE_END,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      messageId,
      content,
    };

    // Update message state
    if (state) {
      state.complete = true;
    }

    this.emitEvent(event);
    this.bufferEvent(event);
    return event;
  }

  /**
   * Emit TOOL_CALL_START event directly
   */
  emitToolCallStart(toolCallId: string, toolCallName: string, parentMessageId?: string): ToolCallStartEvent {
    const event: ToolCallStartEvent = {
      type: 'TOOL_CALL_START' as AGUIEventType.TOOL_CALL_START,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      runId: this.currentRunId ?? undefined,
      toolCallId,
      toolCallName,
      parentMessageId,
    };

    // Track tool call state
    this.toolCallStates.set(toolCallId, {
      toolCallId,
      toolName: toolCallName,
      argsJson: '',
      startedAt: event.timestamp,
      complete: false,
    });

    // Track in run context
    const runContext = this.activeRuns.get(this.currentRunId ?? '');
    if (runContext) {
      runContext.activeToolCalls.add(toolCallId);
    }

    this.emitEvent(event);
    this.bufferEvent(event);
    return event;
  }

  /**
   * Emit TOOL_CALL_ARGS event directly
   */
  emitToolCallArgs(toolCallId: string, delta: string): ToolCallArgsEvent {
    const event: ToolCallArgsEvent = {
      type: 'TOOL_CALL_ARGS' as AGUIEventType.TOOL_CALL_ARGS,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      toolCallId,
      delta,
    };

    // Update tool call state
    const state = this.toolCallStates.get(toolCallId);
    if (state) {
      state.argsJson += delta;
    }

    this.emitEvent(event);
    this.bufferEvent(event);
    return event;
  }

  /**
   * Emit TOOL_CALL_END event directly
   */
  emitToolCallEnd(toolCallId: string): ToolCallEndEvent {
    // Get accumulated args
    const state = this.toolCallStates.get(toolCallId);
    let args: Record<string, unknown> | undefined;

    if (state) {
      try {
        args = JSON.parse(state.argsJson);
        state.args = args;
      } catch {
        // Invalid JSON, leave args undefined
      }
    }

    const event: ToolCallEndEvent = {
      type: 'TOOL_CALL_END' as AGUIEventType.TOOL_CALL_END,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      toolCallId,
      args,
    };

    this.emitEvent(event);
    this.bufferEvent(event);
    return event;
  }

  /**
   * Emit TOOL_CALL_RESULT event directly
   */
  emitToolCallResult(toolCallId: string, content: string, messageId?: string, success = true): ToolCallResultEvent {
    const mid = messageId ?? this.generateId();

    const event: ToolCallResultEvent = {
      type: 'TOOL_CALL_RESULT' as AGUIEventType.TOOL_CALL_RESULT,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      toolCallId,
      messageId: mid,
      content,
      success,
    };

    // Update tool call state
    const state = this.toolCallStates.get(toolCallId);
    if (state) {
      state.complete = true;
      state.result = content;
    }

    // Remove from run context
    const runContext = this.activeRuns.get(this.currentRunId ?? '');
    if (runContext) {
      runContext.activeToolCalls.delete(toolCallId);
    }

    this.emitEvent(event);
    this.bufferEvent(event);
    return event;
  }

  /**
   * Emit STATE_SNAPSHOT event directly
   */
  emitStateSnapshot(state: Record<string, unknown>, version?: number): StateSnapshotEvent {
    const event: StateSnapshotEvent = {
      type: 'STATE_SNAPSHOT' as AGUIEventType.STATE_SNAPSHOT,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      runId: this.currentRunId ?? undefined,
      state,
      version,
    };

    this.emitEvent(event);
    this.bufferEvent(event);
    return event;
  }

  /**
   * Emit STATE_DELTA event directly
   */
  emitStateDelta(delta: JsonPatchOperation[], version?: number): StateDeltaEvent {
    const event: StateDeltaEvent = {
      type: 'STATE_DELTA' as AGUIEventType.STATE_DELTA,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      runId: this.currentRunId ?? undefined,
      delta,
      version,
    };

    this.emitEvent(event);
    this.bufferEvent(event);
    return event;
  }

  /**
   * Emit MESSAGES_SNAPSHOT event directly
   */
  emitMessagesSnapshot(messages: ConversationMessage[]): MessagesSnapshotEvent {
    const event: MessagesSnapshotEvent = {
      type: 'MESSAGES_SNAPSHOT' as AGUIEventType.MESSAGES_SNAPSHOT,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      runId: this.currentRunId ?? undefined,
      messages,
    };

    this.emitEvent(event);
    this.bufferEvent(event);
    return event;
  }

  /**
   * Emit ACTIVITY_SNAPSHOT event directly
   */
  emitActivitySnapshot(activity: ActivityMessage[], replace = false): ActivitySnapshotEvent {
    const event: ActivitySnapshotEvent = {
      type: 'ACTIVITY_SNAPSHOT' as AGUIEventType.ACTIVITY_SNAPSHOT,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      runId: this.currentRunId ?? undefined,
      activity,
      replace,
    };

    // Update activity tracking
    if (this.config.trackActivityState) {
      if (replace) {
        this.activities = [...activity];
      } else {
        this.activities.push(...activity);
      }
    }

    this.emitEvent(event);
    this.bufferEvent(event);
    return event;
  }

  /**
   * Emit ACTIVITY_DELTA event directly
   */
  emitActivityDelta(delta: JsonPatchOperation[]): ActivityDeltaEvent {
    const event: ActivityDeltaEvent = {
      type: 'ACTIVITY_DELTA' as AGUIEventType.ACTIVITY_DELTA,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      runId: this.currentRunId ?? undefined,
      delta,
    };

    this.emitEvent(event);
    this.bufferEvent(event);
    return event;
  }

  /**
   * Emit RAW event directly
   */
  emitRaw(rawEvent: unknown, source?: string): RawEvent {
    const event: RawEvent = {
      type: 'RAW' as AGUIEventType.RAW,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      runId: this.currentRunId ?? undefined,
      event: rawEvent,
      source,
    };

    this.emitEvent(event);
    this.bufferEvent(event);
    return event;
  }

  /**
   * Emit CUSTOM event directly
   */
  emitCustom(name: string, value: unknown): CustomEvent {
    const event: CustomEvent = {
      type: 'CUSTOM' as AGUIEventType.CUSTOM,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      runId: this.currentRunId ?? undefined,
      name,
      value,
    };

    this.emitEvent(event);
    this.bufferEvent(event);
    return event;
  }

  // ============================================================================
  // ID Mapping Methods
  // ============================================================================

  /**
   * Get AG-UI ID for an AQE ID
   */
  getAguiId(aqeId: string): string | undefined {
    return this.aqeToAgui.get(aqeId);
  }

  /**
   * Get AQE ID for an AG-UI ID
   */
  getAqeId(aguiId: string): string | undefined {
    return this.aguiToAqe.get(aguiId);
  }

  /**
   * Get all ID mappings
   */
  getIdMappings(): readonly IdMapping[] {
    return [...this.idMappings];
  }

  /**
   * Store bidirectional ID mapping
   */
  private storeIdMapping(
    aqeId: string,
    aguiId: string,
    eventType: IdMapping['eventType']
  ): void {
    this.aqeToAgui.set(aqeId, aguiId);
    this.aguiToAqe.set(aguiId, aqeId);
    this.idMappings.push({
      aqeId,
      aguiId,
      createdAt: this.generateTimestamp(),
      eventType,
    });
  }

  // ============================================================================
  // State Accessors
  // ============================================================================

  /**
   * Get current run ID
   */
  getCurrentRunId(): string | null {
    return this.currentRunId;
  }

  /**
   * Get active runs
   */
  getActiveRuns(): Map<string, RunContext> {
    return new Map(this.activeRuns);
  }

  /**
   * Get message state
   */
  getMessageState(messageId: string): MessageState | undefined {
    return this.messageStates.get(messageId);
  }

  /**
   * Get all message states
   */
  getAllMessageStates(): Map<string, MessageState> {
    return new Map(this.messageStates);
  }

  /**
   * Get tool call state
   */
  getToolCallState(toolCallId: string): ToolCallState | undefined {
    return this.toolCallStates.get(toolCallId);
  }

  /**
   * Get all tool call states
   */
  getAllToolCallStates(): Map<string, ToolCallState> {
    return new Map(this.toolCallStates);
  }

  /**
   * Get current activities
   */
  getActivities(): readonly ActivityMessage[] {
    return [...this.activities];
  }

  /**
   * Get buffered events
   */
  getBufferedEvents(): readonly AGUIEvent[] {
    return [...this.eventBuffer];
  }

  /**
   * Clear buffered events
   */
  clearBuffer(): void {
    this.eventBuffer = [];
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Reset adapter state
   */
  reset(): void {
    // Flush any pending batched events before reset
    if (this.eventBatcher) {
      this.eventBatcher.flush('manual');
      this.eventBatcher.resetMetrics();
    }

    this.aqeToAgui.clear();
    this.aguiToAqe.clear();
    this.idMappings = [];
    this.activeRuns.clear();
    this.currentRunId = null;
    this.messageStates.clear();
    this.toolCallStates.clear();
    this.activities = [];
    this.eventBuffer = [];
    this.stepProgress.clear();
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return this.config.eventIdGenerator();
  }

  /**
   * Generate event ID
   */
  private generateEventId(): string {
    return `evt_${this.config.eventIdGenerator()}`;
  }

  /**
   * Generate timestamp
   */
  private generateTimestamp(): string {
    return this.config.timestampGenerator();
  }

  /**
   * Create or get current run ID
   */
  private createOrGetRunId(): string {
    if (this.currentRunId) {
      return this.currentRunId;
    }

    const runId = this.generateId();
    const threadId = this.config.defaultThreadId;

    const runContext: RunContext = {
      runId,
      threadId,
      startedAt: this.generateTimestamp(),
      activeSteps: new Set(),
      activeMessages: new Set(),
      activeToolCalls: new Set(),
    };

    this.activeRuns.set(runId, runContext);
    this.currentRunId = runId;

    return runId;
  }

  /**
   * Get or create message ID for a step
   */
  private getOrCreateMessageId(stepId: string): string {
    // Check if we have an active message for this step
    const entries = Array.from(this.messageStates.entries());
    for (const [messageId, state] of entries) {
      if (!state.complete) {
        return messageId;
      }
    }

    // Create new message
    const messageId = this.generateId();
    if (this.config.trackMessageState) {
      this.messageStates.set(messageId, {
        messageId,
        content: '',
        role: 'assistant',
        startedAt: this.generateTimestamp(),
        complete: false,
      });
    }

    return messageId;
  }

  /**
   * Create RAW event for unknown source event
   */
  private createRawEvent(event: unknown): RawEvent {
    return {
      type: 'RAW' as AGUIEventType.RAW,
      eventId: this.generateEventId(),
      timestamp: this.generateTimestamp(),
      runId: this.currentRunId ?? undefined,
      event,
      source: 'aqe',
    };
  }

  /**
   * Emit event via EventEmitter (uses batcher if enabled)
   */
  private emitEvent(event: AGUIEvent): void {
    if (this.eventBatcher) {
      // Use batcher - it will handle batching and emit via handleBatchFlush
      this.eventBatcher.add(event);
    } else {
      // Direct emission without batching
      this.emit('event', event);
      this.emit(event.type, event);
    }
  }

  /**
   * Buffer event for streaming
   */
  private bufferEvent(event: AGUIEvent): void {
    this.eventBuffer.push(event);

    // Enforce max buffer size
    if (this.eventBuffer.length > this.config.maxBufferSize) {
      this.eventBuffer.shift();
    }
  }

  /**
   * Validate event structure
   */
  private validateEvent(event: AGUIEvent): void {
    if (!event.type) {
      throw new Error('Event missing required type field');
    }
    if (!event.eventId) {
      throw new Error('Event missing required eventId field');
    }
    if (!event.timestamp) {
      throw new Error('Event missing required timestamp field');
    }
  }

  // ============================================================================
  // Batcher Operations
  // ============================================================================

  /**
   * Get the event batcher instance (if enabled)
   */
  getEventBatcher(): EventBatcher | null {
    return this.eventBatcher;
  }

  /**
   * Check if event batching is enabled
   */
  isBatchingEnabled(): boolean {
    return this.eventBatcher !== null;
  }

  /**
   * Get batcher metrics (if batching is enabled)
   */
  getBatcherMetrics(): BatcherMetrics | null {
    return this.eventBatcher ? this.eventBatcher.getMetrics() : null;
  }

  /**
   * Manually flush any pending batched events
   */
  flushBatcher(): void {
    if (this.eventBatcher) {
      this.eventBatcher.flush('manual');
    }
  }

  /**
   * Enable or disable event batching at runtime
   */
  setBatchingEnabled(enabled: boolean): void {
    if (this.eventBatcher) {
      if (enabled) {
        this.eventBatcher.enable();
      } else {
        this.eventBatcher.disable();
      }
    }
  }

  /**
   * Reset batcher metrics
   */
  resetBatcherMetrics(): void {
    if (this.eventBatcher) {
      this.eventBatcher.resetMetrics();
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new EventAdapter instance
 *
 * @param config - Optional configuration
 * @returns EventAdapter instance
 */
export function createEventAdapter(config: EventAdapterConfig = {}): EventAdapter {
  return new EventAdapter(config);
}
