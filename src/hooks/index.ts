/**
 * QE Hooks System - Event-driven architecture for test lifecycle management
 * Provides extensible hooks for agent coordination, monitoring, and automation
 */

import { EventEmitter } from 'events';
import { QEHookEvent, HookEventType, HookHandler } from '../types';
import { Logger } from '../utils/Logger';

/**
 * Hook execution context with additional metadata
 */
export interface HookContext {
  event: QEHookEvent;
  stopPropagation: () => void;
  getData: <T = unknown>() => T;
  setData: (data: unknown) => void;
}

/**
 * Hook execution result
 */
export interface HookExecutionResult {
  handler: string;
  success: boolean;
  duration: number;
  error?: Error;
  metadata?: Record<string, unknown>;
}

/**
 * Hook execution statistics
 */
export interface HookStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDuration: number;
  handlerStats: Record<string, {
    executions: number;
    successes: number;
    failures: number;
    totalDuration: number;
    averageDuration: number;
  }>;
}

/**
 * Predefined QE Hook Handlers
 */
class QEHookHandlers {
  /**
   * Session lifecycle hooks
   */
  static sessionStart(): HookHandler {
    return {
      name: 'session-lifecycle-start',
      events: ['session-start'],
      handler: async (event: QEHookEvent) => {
        console.log(`🚀 Test session started: ${event.sessionId}`);
        // Initialize session resources
        // Setup monitoring
        // Configure agents
      },
      priority: 10,
      enabled: true
    };
  }

  static sessionEnd(): HookHandler {
    return {
      name: 'session-lifecycle-end',
      events: ['session-end'],
      handler: async (event: QEHookEvent) => {
        console.log(`✅ Test session completed: ${event.sessionId}`);
        // Generate reports
        // Cleanup resources
        // Archive results
      },
      priority: 10,
      enabled: true
    };
  }

  /**
   * Test execution hooks
   */
  static testStart(): HookHandler {
    return {
      name: 'test-execution-start',
      events: ['test-start'],
      handler: async (event: QEHookEvent) => {
        const testId = event.testId || 'unknown';
        console.log(`🧪 Test started: ${testId}`);
        // Setup test environment
        // Initialize monitoring
        // Prepare test data
      },
      priority: 5,
      enabled: true
    };
  }

  static testEnd(): HookHandler {
    return {
      name: 'test-execution-end',
      events: ['test-end'],
      handler: async (event: QEHookEvent) => {
        const testId = event.testId || 'unknown';
        const result = event.data.result as any;
        const status = result?.status || 'unknown';
        
        console.log(`${status === 'passed' ? '✅' : '❌'} Test completed: ${testId} (${status})`);
        // Collect artifacts
        // Update metrics
        // Send notifications
      },
      priority: 5,
      enabled: true
    };
  }

  /**
   * Agent management hooks
   */
  static agentSpawn(): HookHandler {
    return {
      name: 'agent-management-spawn',
      events: ['agent-spawn'],
      handler: async (event: QEHookEvent) => {
        const agentId = event.agentId || 'unknown';
        const agentType = (event.data?.metadata && typeof event.data.metadata === 'object' && 'type' in event.data.metadata) ? event.data.metadata.type : 'unknown';
        console.log(`🤖 Agent spawned: ${agentId} (${agentType})`);
        // Register agent
        // Setup monitoring
        // Configure capabilities
      },
      priority: 8,
      enabled: true
    };
  }

  static agentDestroy(): HookHandler {
    return {
      name: 'agent-management-destroy',
      events: ['agent-destroy'],
      handler: async (event: QEHookEvent) => {
        const agentId = event.agentId || 'unknown';
        console.log(`🗑️ Agent destroyed: ${agentId}`);
        // Cleanup resources
        // Archive agent data
        // Update registry
      },
      priority: 8,
      enabled: true
    };
  }

  /**
   * Error handling hooks
   */
  static errorHandler(): HookHandler {
    return {
      name: 'error-handling',
      events: ['error'],
      handler: async (event: QEHookEvent) => {
        const error = event.data.error as Error;
        const agentId = event.agentId || 'system';
        
        console.error(`🚨 Error in ${agentId}: ${error?.message || 'Unknown error'}`);
        // Log error details
        // Send alerts
        // Trigger recovery actions
      },
      priority: 1, // High priority
      enabled: true
    };
  }

  /**
   * Metrics collection hooks
   */
  static metricsCollector(): HookHandler {
    return {
      name: 'metrics-collection',
      events: ['metric-collected', 'test-end', 'session-end'],
      handler: async (event: QEHookEvent) => {
        // Collect and aggregate metrics
        // Update dashboards
        // Check thresholds
        console.log(`📊 Metrics collected for ${event.type}`);
      },
      priority: 3,
      enabled: true
    };
  }

  /**
   * Artifact management hooks
   */
  static artifactManager(): HookHandler {
    return {
      name: 'artifact-management',
      events: ['artifact-created'],
      handler: async (event: QEHookEvent) => {
        const artifact = event.data.path as string;
        console.log(`📎 Artifact created: ${artifact}`);
        // Archive artifacts
        // Generate thumbnails
        // Update indexes
      },
      priority: 4,
      enabled: true
    };
  }

  /**
   * Report generation hooks
   */
  static reportGenerator(): HookHandler {
    return {
      name: 'report-generation',
      events: ['session-end', 'test-end'],
      handler: async (event: QEHookEvent) => {
        console.log(`📋 Generating reports for ${event.type}`);
        // Generate HTML reports
        // Create summaries
        // Send notifications
      },
      priority: 2,
      enabled: true
    };
  }

  /**
   * Get all default hooks
   */
  static getDefaultHooks(): HookHandler[] {
    return [
      this.sessionStart(),
      this.sessionEnd(),
      this.testStart(),
      this.testEnd(),
      this.agentSpawn(),
      this.agentDestroy(),
      this.errorHandler(),
      this.metricsCollector(),
      this.artifactManager(),
      this.reportGenerator()
    ];
  }
}

/**
 * Hook Manager - Manages registration and execution of hooks
 */
export class HookManager extends EventEmitter {
  private readonly handlers: Map<string, HookHandler> = new Map();
  private readonly eventMap: Map<HookEventType, Set<string>> = new Map();
  private readonly logger: Logger;
  private readonly stats: HookStats;
  private executionQueue: Array<{ event: QEHookEvent; resolve: Function; reject: Function }> = [];
  private processing = false;

  constructor(logger?: Logger) {
    super();
    this.logger = logger || new Logger('HookManager');
    this.stats = this.initializeStats();
    
    // Register default hooks
    this.registerDefaultHooks();
    
    this.logger.info('Hook Manager initialized');
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Register a hook handler
   */
  public register(handler: HookHandler): void {
    if (this.handlers.has(handler.name)) {
      this.logger.warn(`Hook handler '${handler.name}' already exists, replacing`);
    }
    
    this.handlers.set(handler.name, handler);
    
    // Update event mapping
    for (const eventType of handler.events) {
      if (!this.eventMap.has(eventType)) {
        this.eventMap.set(eventType, new Set());
      }
      this.eventMap.get(eventType)!.add(handler.name);
    }
    
    this.logger.debug(`Registered hook handler: ${handler.name}`, {
      events: handler.events,
      priority: handler.priority,
      enabled: handler.enabled
    });
  }

  /**
   * Unregister a hook handler
   */
  public unregister(name: string): boolean {
    const handler = this.handlers.get(name);
    if (!handler) {
      return false;
    }
    
    this.handlers.delete(name);
    
    // Remove from event mapping
    for (const eventType of handler.events) {
      this.eventMap.get(eventType)?.delete(name);
      if (this.eventMap.get(eventType)?.size === 0) {
        this.eventMap.delete(eventType);
      }
    }
    
    this.logger.debug(`Unregistered hook handler: ${name}`);
    return true;
  }

  /**
   * Enable/disable a hook handler
   */
  public setEnabled(name: string, enabled: boolean): boolean {
    const handler = this.handlers.get(name);
    if (!handler) {
      return false;
    }
    
    handler.enabled = enabled;
    this.logger.debug(`Hook handler '${name}' ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }

  /**
   * Get a hook handler by name
   */
  public getHandler(name: string): HookHandler | undefined {
    return this.handlers.get(name);
  }

  /**
   * Get all registered handlers
   */
  public getHandlers(): HookHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Get handlers for a specific event type
   */
  public getHandlersForEvent(eventType: HookEventType): HookHandler[] {
    const handlerNames = this.eventMap.get(eventType) || new Set();
    return Array.from(handlerNames)
      .map(name => this.handlers.get(name)!)
      .filter(handler => handler.enabled)
      .sort((a, b) => b.priority - a.priority); // Higher priority first
  }

  /**
   * Emit a hook event
   */
  public async emitHook(event: QEHookEvent): Promise<HookExecutionResult[]> {
    return new Promise((resolve, reject) => {
      this.executionQueue.push({ event, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Emit a hook event synchronously (fire and forget)
   */
  public emitSync(event: QEHookEvent): void {
    setImmediate(() => {
      this.emitHook(event).catch(error => {
        this.logger.error('Async hook execution failed', { error, event });
      });
    });
  }

  /**
   * Get hook execution statistics
   */
  public getStats(): HookStats {
    return { ...this.stats };
  }

  /**
   * Reset hook statistics
   */
  public resetStats(): void {
    Object.assign(this.stats, this.initializeStats());
    this.logger.info('Hook statistics reset');
  }

  /**
   * Clear all handlers
   */
  public clear(): void {
    this.handlers.clear();
    this.eventMap.clear();
    this.logger.info('All hook handlers cleared');
  }

  /**
   * Destroy hook manager
   */
  public destroy(): void {
    this.clear();
    this.removeAllListeners();
    this.logger.info('Hook manager destroyed');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private registerDefaultHooks(): void {
    const defaultHooks = QEHookHandlers.getDefaultHooks();
    for (const hook of defaultHooks) {
      this.register(hook);
    }
    this.logger.info(`Registered ${defaultHooks.length} default hooks`);
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.executionQueue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    while (this.executionQueue.length > 0) {
      const { event, resolve, reject } = this.executionQueue.shift()!;
      
      try {
        const results = await this.executeHooks(event);
        resolve(results);
      } catch (error) {
        reject(error);
      }
    }
    
    this.processing = false;
  }

  private async executeHooks(event: QEHookEvent): Promise<HookExecutionResult[]> {
    const handlers = this.getHandlersForEvent(event.type);
    const results: HookExecutionResult[] = [];
    
    if (handlers.length === 0) {
      return results;
    }
    
    this.logger.debug(`Executing ${handlers.length} hooks for event: ${event.type}`, {
      sessionId: event.sessionId,
      agentId: event.agentId,
      testId: event.testId
    });
    
    let stopPropagation = false;
    let eventData = { ...event.data };
    
    for (const handler of handlers) {
      if (stopPropagation) {
        break;
      }
      
      const startTime = Date.now();
      
      try {
        // Create hook context
        const context: HookContext = {
          event: { ...event, data: eventData },
          stopPropagation: () => { stopPropagation = true; },
          getData: <T = unknown>() => eventData as T,
          setData: (data: unknown) => { eventData = { ...eventData, ...data as any }; }
        };
        
        // Execute handler
        await handler.handler(context.event);
        
        const duration = Date.now() - startTime;
        
        const result: HookExecutionResult = {
          handler: handler.name,
          success: true,
          duration,
          metadata: {
            priority: handler.priority,
            events: handler.events
          }
        };
        
        results.push(result);
        this.updateStats(handler.name, true, duration);
        
        this.logger.debug(`Hook executed successfully: ${handler.name}`, {
          duration,
          eventType: event.type
        });
        
      } catch (error) {
        const duration = Date.now() - startTime;
        const hookError = error instanceof Error ? error : new Error(String(error));
        
        const result: HookExecutionResult = {
          handler: handler.name,
          success: false,
          duration,
          error: hookError,
          metadata: {
            priority: handler.priority,
            events: handler.events
          }
        };
        
        results.push(result);
        this.updateStats(handler.name, false, duration);
        
        this.logger.error(`Hook execution failed: ${handler.name}`, {
          error: hookError,
          duration,
          eventType: event.type
        });
        
        // Emit error event for failed hooks
        this.emitSync({
          type: 'error',
          timestamp: new Date(),
          sessionId: event.sessionId,
          agentId: event.agentId,
          testId: event.testId,
          data: {
            hookName: handler.name,
            originalEvent: event,
            error: hookError
          }
        });
      }
    }
    
    this.emit('hooks-executed', {
      event,
      results,
      totalDuration: results.reduce((sum, r) => sum + r.duration, 0)
    });
    
    return results;
  }

  private updateStats(handlerName: string, success: boolean, duration: number): void {
    this.stats.totalExecutions++;
    
    if (success) {
      this.stats.successfulExecutions++;
    } else {
      this.stats.failedExecutions++;
    }
    
    // Update handler-specific stats
    if (!this.stats.handlerStats[handlerName]) {
      this.stats.handlerStats[handlerName] = {
        executions: 0,
        successes: 0,
        failures: 0,
        totalDuration: 0,
        averageDuration: 0
      };
    }
    
    const handlerStats = this.stats.handlerStats[handlerName];
    handlerStats.executions++;
    handlerStats.totalDuration += duration;
    handlerStats.averageDuration = handlerStats.totalDuration / handlerStats.executions;
    
    if (success) {
      handlerStats.successes++;
    } else {
      handlerStats.failures++;
    }
    
    // Update overall average
    this.stats.averageDuration = 
      Object.values(this.stats.handlerStats)
        .reduce((sum, stats) => sum + stats.totalDuration, 0) / this.stats.totalExecutions;
  }

  private initializeStats(): HookStats {
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageDuration: 0,
      handlerStats: {}
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a simple hook handler
 */
export function createHook(
  name: string,
  events: HookEventType[],
  handler: (event: QEHookEvent) => Promise<void> | void,
  options: {
    priority?: number;
    enabled?: boolean;
  } = {}
): HookHandler {
  return {
    name,
    events,
    handler,
    priority: options.priority ?? 5,
    enabled: options.enabled ?? true
  };
}

/**
 * Create a conditional hook that only executes if condition is met
 */
export function createConditionalHook(
  name: string,
  events: HookEventType[],
  condition: (event: QEHookEvent) => boolean,
  handler: (event: QEHookEvent) => Promise<void> | void,
  options: {
    priority?: number;
    enabled?: boolean;
  } = {}
): HookHandler {
  return createHook(
    name,
    events,
    async (event: QEHookEvent) => {
      if (condition(event)) {
        await handler(event);
      }
    },
    options
  );
}

/**
 * Create a throttled hook that limits execution frequency
 */
export function createThrottledHook(
  name: string,
  events: HookEventType[],
  handler: (event: QEHookEvent) => Promise<void> | void,
  throttleMs: number,
  options: {
    priority?: number;
    enabled?: boolean;
  } = {}
): HookHandler {
  let lastExecution = 0;
  
  return createHook(
    name,
    events,
    async (event: QEHookEvent) => {
      const now = Date.now();
      if (now - lastExecution >= throttleMs) {
        lastExecution = now;
        await handler(event);
      }
    },
    options
  );
}

/**
 * Create a debounced hook that delays execution
 */
export function createDebouncedHook(
  name: string,
  events: HookEventType[],
  handler: (event: QEHookEvent) => Promise<void> | void,
  debounceMs: number,
  options: {
    priority?: number;
    enabled?: boolean;
  } = {}
): HookHandler {
  let timeout: NodeJS.Timeout | null = null;
  
  return createHook(
    name,
    events,
    async (event: QEHookEvent) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      
      timeout = setTimeout(async () => {
        await handler(event);
        timeout = null;
      }, debounceMs);
    },
    options
  );
}

// Export everything
export { HookManager as default, QEHookHandlers as QEHooks };
