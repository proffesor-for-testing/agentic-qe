/**
 * Agentic QE v3 - Main Entry Point
 * Domain-Driven Design Architecture with 12 Bounded Contexts
 */

// Shared Kernel - export types and utilities
export * from './shared/types';
export * from './shared/value-objects';
export * from './shared/events';

// Entities - export as namespace to avoid collisions
export * as Entities from './shared/entities';

// Kernel - export core kernel components
export * from './kernel';

// Domain Interfaces - export as namespaces
export * from './domains';

// Version info
export const VERSION = '3.0.0-alpha';
export const ARCHITECTURE = 'DDD with 12 Bounded Contexts';
export const MAX_CONCURRENT_AGENTS = 15;

/**
 * Quick start example:
 *
 * ```typescript
 * import { createKernel } from '@agentic-qe/v3';
 *
 * const kernel = createKernel({
 *   maxConcurrentAgents: 15,
 *   memoryBackend: 'hybrid',
 *   hnswEnabled: true,
 * });
 *
 * await kernel.initialize();
 *
 * // Use domain APIs
 * const testGen = kernel.getDomainAPI<TestGenerationAPI>('test-generation');
 * const result = await testGen.generateTests({ ... });
 * ```
 */
