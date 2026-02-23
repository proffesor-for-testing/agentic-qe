/**
 * Agentic QE v3 - Command Registry
 *
 * Central registry for all CLI command handlers.
 * Provides command routing and management.
 */

import { Command } from 'commander';
import {
  ICommandHandler,
  CLIContext,
  createInitHandler,
  createStatusHandler,
  createHealthHandler,
  createTaskHandler,
  createAgentHandler,
  createDomainHandler,
  createProtocolHandler,
  createBrainHandler,
} from './handlers/index.js';

// ============================================================================
// Command Registry
// ============================================================================

/**
 * Central registry for CLI commands
 */
export class CommandRegistry {
  private handlers: Map<string, ICommandHandler> = new Map();
  private context: CLIContext;
  private cleanupAndExit: (code: number) => Promise<never>;
  private ensureInitialized: () => Promise<boolean>;

  constructor(
    context: CLIContext,
    cleanupAndExit: (code: number) => Promise<never>,
    ensureInitialized: () => Promise<boolean>
  ) {
    this.context = context;
    this.cleanupAndExit = cleanupAndExit;
    this.ensureInitialized = ensureInitialized;
  }

  /**
   * Register a command handler
   */
  register(handler: ICommandHandler): void {
    this.handlers.set(handler.name, handler);
  }

  /**
   * Get a command handler by name
   */
  get(name: string): ICommandHandler | undefined {
    return this.handlers.get(name);
  }

  /**
   * Check if a handler exists
   */
  has(name: string): boolean {
    return this.handlers.has(name);
  }

  /**
   * Get all registered handler names
   */
  getNames(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get all registered handlers
   */
  getAll(): ICommandHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Register all handlers with the Commander program
   */
  registerAll(program: Command): void {
    const handlers = this.getAll();
    for (const handler of handlers) {
      handler.register(program, this.context);
    }
  }

  /**
   * Register all built-in command handlers
   */
  registerBuiltinHandlers(): void {
    // Core commands
    this.register(createInitHandler(this.cleanupAndExit));
    this.register(createStatusHandler(this.cleanupAndExit, this.ensureInitialized));
    this.register(createHealthHandler(this.cleanupAndExit, this.ensureInitialized));

    // Task management
    this.register(createTaskHandler(this.cleanupAndExit, this.ensureInitialized));

    // Agent management
    this.register(createAgentHandler(this.cleanupAndExit, this.ensureInitialized));

    // Domain management
    this.register(createDomainHandler(this.cleanupAndExit, this.ensureInitialized));

    // Protocol execution
    this.register(createProtocolHandler(this.cleanupAndExit, this.ensureInitialized));

    // Brain export/import
    this.register(createBrainHandler(this.cleanupAndExit, this.ensureInitialized));
  }

  /**
   * Get help for all commands
   */
  getAllHelp(): string {
    const sections: string[] = [];
    const handlers = this.getAll();

    for (const handler of handlers) {
      sections.push(`## ${handler.name}\n${handler.getHelp()}`);
    }

    return sections.join('\n\n');
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new command registry with built-in handlers
 */
export function createCommandRegistry(
  context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): CommandRegistry {
  const registry = new CommandRegistry(context, cleanupAndExit, ensureInitialized);
  registry.registerBuiltinHandlers();
  return registry;
}
