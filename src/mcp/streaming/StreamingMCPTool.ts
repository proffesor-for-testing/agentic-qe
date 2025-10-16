/**
 * StreamingMCPTool - Base class for streaming MCP tools
 *
 * Provides AsyncGenerator-based streaming with progress updates, error handling,
 * and resource cleanup for long-running MCP operations.
 *
 * @version 1.0.5
 * @author Agentic QE Team
 */

import { EventEmitter } from 'events';
import {
  StreamEvent,
  ToolProgress,
  ToolResult,
  ToolError,
  StreamingSession,
  StreamingConfig,
  DEFAULT_STREAMING_CONFIG,
  ProgressReporter,
  createProgress,
  createResult,
  createError
} from './types.js';

export interface StreamingToolContext {
  sessionId: string;
  memoryStore: Map<string, any>;
  eventBus: EventEmitter;
  config: StreamingConfig;
}

/**
 * Abstract base class for streaming MCP tools
 * Subclasses implement executeWithProgress to provide streaming functionality
 */
export abstract class StreamingMCPTool {
  protected readonly context: StreamingToolContext;
  protected session: StreamingSession | null = null;
  private lastProgressTime: number = 0;
  private progressBuffer: ToolProgress[] = [];
  private cancelled: boolean = false;

  constructor(
    memoryStore: Map<string, any>,
    eventBus: EventEmitter,
    config: Partial<StreamingConfig> = {}
  ) {
    this.context = {
      sessionId: this.generateSessionId(),
      memoryStore,
      eventBus,
      config: { ...DEFAULT_STREAMING_CONFIG, ...config }
    };
  }

  /**
   * Execute tool with streaming progress updates
   * Returns an AsyncGenerator that yields progress events and final result
   */
  async *execute(params: any): AsyncGenerator<StreamEvent, void, undefined> {
    const startTime = Date.now();

    try {
      // Initialize session
      this.session = this.createSession();
      await this.initializeSession(this.session);

      // Emit initial progress
      yield createProgress('Starting operation...', 0, {
        metadata: { sessionId: this.session.id }
      });

      // Create progress reporter
      const reporter = this.createProgressReporter();

      // Execute the actual streaming operation
      try {
        const result = await this.executeWithProgress(params, reporter);

        if (this.cancelled) {
          yield createError('Operation cancelled', {
            recoverable: true,
            details: { sessionId: this.session.id }
          });
          return;
        }

        // Update session to completed
        if (this.session) {
          this.session.status = 'completed';
          await this.persistSession(this.session);
        }

        // Emit final result
        const executionTime = Date.now() - startTime;
        yield createResult(result, {
          executionTime,
          metadata: { sessionId: this.session.id }
        });

        // Emit completion event
        this.context.eventBus.emit('streaming:completed', {
          sessionId: this.session.id,
          executionTime,
          result
        });

      } catch (error) {
        // Update session to failed
        if (this.session) {
          this.session.status = 'failed';
          await this.persistSession(this.session);
        }

        // Emit error event
        const errorMessage = error instanceof Error ? error.message : String(error);
        yield createError(errorMessage, {
          details: error instanceof Error ? { stack: error.stack } : undefined,
          recoverable: this.isRecoverableError(error)
        });

        // Emit error to event bus
        this.context.eventBus.emit('streaming:error', {
          sessionId: this.session.id,
          error: errorMessage
        });

        throw error;
      }

    } catch (error) {
      // Outer catch for initialization errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      yield createError(`Streaming execution failed: ${errorMessage}`, {
        recoverable: false
      });
    } finally {
      // Cleanup resources
      await this.cleanup();
    }
  }

  /**
   * Abstract method - subclasses implement actual streaming logic
   * Reporter is used to emit progress updates during execution
   */
  protected abstract executeWithProgress(
    params: any,
    reporter: ProgressReporter
  ): Promise<any>;

  /**
   * Create a progress reporter for emitting progress updates
   */
  protected createProgressReporter(): ProgressReporter {
    const self = this;
    let currentProgress: ToolProgress | null = null;

    return {
      async report(progress) {
        const now = Date.now();
        const timeSinceLastProgress = now - self.lastProgressTime;

        // Apply progress interval throttling
        if (timeSinceLastProgress < self.context.config.progressInterval) {
          // Buffer progress if buffering is enabled
          if (self.context.config.bufferEvents) {
            const progressEvent = createProgress(progress.message, progress.percent, progress);
            self.progressBuffer.push(progressEvent);

            // Flush buffer if it exceeds max size
            if (self.progressBuffer.length >= self.context.config.maxBufferSize) {
              await self.flushProgressBuffer();
            }
          }
          return;
        }

        // Create and store progress event
        const progressEvent = createProgress(progress.message, progress.percent, progress);
        currentProgress = progressEvent;

        // Update session state
        if (self.session) {
          self.session.progress = {
            percent: progressEvent.percent,
            message: progressEvent.message,
            itemsProcessed: progressEvent.itemsProcessed || 0,
            itemsTotal: progressEvent.itemsTotal || 0
          };
          await self.persistSession(self.session);
        }

        // Emit progress event to event bus
        self.context.eventBus.emit('streaming:progress', progressEvent);

        // Store progress in memory
        await self.context.memoryStore.set(
          `streaming/session-${self.context.sessionId}/progress`,
          progressEvent
        );

        self.lastProgressTime = now;
      },

      async complete(result) {
        // Flush any remaining buffered progress
        await self.flushProgressBuffer();

        const resultEvent = createResult(result.data, result);

        // Store result in memory
        await self.context.memoryStore.set(
          `streaming/session-${self.context.sessionId}/result`,
          resultEvent
        );
      },

      async error(error) {
        const errorEvent = createError(error.error, error);

        // Store error in memory
        await self.context.memoryStore.set(
          `streaming/session-${self.context.sessionId}/error`,
          errorEvent
        );

        // Emit error event
        self.context.eventBus.emit('streaming:error', errorEvent);
      },

      getProgress() {
        return currentProgress;
      },

      async cancel() {
        self.cancelled = true;

        if (self.session) {
          self.session.status = 'cancelled';
          await self.persistSession(self.session);
        }

        // Emit cancellation event
        self.context.eventBus.emit('streaming:cancelled', {
          sessionId: self.context.sessionId
        });
      }
    };
  }

  /**
   * Initialize streaming session
   */
  private createSession(): StreamingSession {
    return {
      id: this.context.sessionId,
      toolName: this.constructor.name,
      startedAt: new Date().toISOString(),
      status: 'active',
      progress: {
        percent: 0,
        message: 'Initializing...',
        itemsProcessed: 0,
        itemsTotal: 0
      }
    };
  }

  /**
   * Initialize session with memory storage and event emission
   */
  private async initializeSession(session: StreamingSession): Promise<void> {
    if (this.context.config.persistSession) {
      await this.context.memoryStore.set(
        `streaming/session-${session.id}`,
        session
      );
    }

    // Emit session started event
    this.context.eventBus.emit('streaming:started', { sessionId: session.id });
  }

  /**
   * Persist session state to memory
   */
  private async persistSession(session: StreamingSession): Promise<void> {
    if (this.context.config.persistSession) {
      await this.context.memoryStore.set(
        `streaming/session-${session.id}`,
        session
      );
    }
  }

  /**
   * Flush buffered progress events
   */
  private async flushProgressBuffer(): Promise<void> {
    if (this.progressBuffer.length === 0) return;

    // Emit all buffered progress events
    for (const progress of this.progressBuffer) {
      this.context.eventBus.emit('streaming:progress', progress);
    }

    // Store latest progress in memory
    const latestProgress = this.progressBuffer[this.progressBuffer.length - 1];
    await this.context.memoryStore.set(
      `streaming/session-${this.context.sessionId}/progress`,
      latestProgress
    );

    // Clear buffer
    this.progressBuffer = [];
    this.lastProgressTime = Date.now();
  }

  /**
   * Cleanup resources after streaming completes
   */
  private async cleanup(): Promise<void> {
    // Flush any remaining buffered progress
    await this.flushProgressBuffer();

    // Optional: Clean up old session data (can be configured)
    // This is commented out to allow session history retrieval
    // await this.context.memoryStore.delete(`streaming/session-${this.context.sessionId}`);
  }

  /**
   * Check if error is recoverable (e.g., network timeout)
   */
  private isRecoverableError(error: unknown): boolean {
    if (error instanceof Error) {
      const recoverablePatterns = [
        'TIMEOUT',
        'ECONNRESET',
        'ETIMEDOUT',
        'CANCELLED'
      ];
      return recoverablePatterns.some(pattern =>
        error.message.includes(pattern)
      );
    }
    return false;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current session
   */
  public getSession(): StreamingSession | null {
    return this.session;
  }

  /**
   * Check if operation is cancelled
   */
  public isCancelled(): boolean {
    return this.cancelled;
  }
}
