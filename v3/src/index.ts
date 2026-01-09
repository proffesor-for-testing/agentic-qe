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

// Coordination Layer - export coordination components
export * from './coordination';

// Domain Interfaces - export as namespaces
export * from './domains';

// MCP Server - Model Context Protocol integration
export * from './mcp';

// Learning Module - QE ReasoningBank for pattern learning (ADR-021)
export * from './learning';

// Feedback Module - Quality Feedback Loop (ADR-023)
export * from './feedback';

// Routing Module - QE Router for agent selection (ADR-022)
export * from './routing';

// Optimization Module - Self-Optimization Engine (ADR-024)
export * from './optimization';

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
