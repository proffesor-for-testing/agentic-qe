# JSDoc Templates for Agentic QE v3

Quick reference templates for consistent documentation across the codebase.

---

## 1. Module Header

Use for new files and modules.

```typescript
/**
 * Agentic QE v3 - [Module Name]
 * [One-line summary of core responsibility]
 *
 * [Extended description of what this module provides, key algorithms,
 *  or important design decisions]
 *
 * Key Components:
 * - Component 1: [Brief description]
 * - Component 2: [Brief description]
 *
 * Integration:
 * - Used by: [which domains/services use this]
 * - Depends on: [key dependencies]
 *
 * @module [path/to/module]
 *
 * @example
 * ```typescript
 * import { SomeClass, someFunction } from './module';
 *
 * const instance = new SomeClass();
 * const result = await someFunction(input);
 * ```
 */
```

---

## 2. Class Documentation

Use for classes, especially coordinators and services.

```typescript
/**
 * [Class Name] Implementation
 * [What this class does and its primary responsibility]
 *
 * This class handles:
 * - Responsibility 1
 * - Responsibility 2
 * - Responsibility 3
 *
 * Features:
 * - Feature 1: [description]
 * - Feature 2: [description]
 *
 * @internal Internal implementation of [Interface]
 * @see [Interface] for public API
 *
 * @example
 * ```typescript
 * const service = new SomeService(dependencies);
 * const result = await service.method(request);
 * ```
 */
export class SomeService implements ISomeService {
  // ...
}
```

---

## 3. Interface Documentation

Use for public APIs and contracts.

```typescript
/**
 * [Interface Name]
 * [High-level description of what this interface represents]
 *
 * Implementations must provide:
 * - [key method 1]: [brief description]
 * - [key method 2]: [brief description]
 *
 * @see [Implementation] for concrete example
 */
export interface ISomething {
  // ...
}
```

---

## 4. Public Method with Full Documentation

Use for methods on coordinators and main service classes.

```typescript
/**
 * [Verb] [object] [optional: preposition + details]
 *
 * [Detailed explanation of what this method does, including:
 *  - The business purpose
 *  - Key side effects
 *  - Performance characteristics if relevant
 *  - Integration with other methods]
 *
 * @param request - [What data is passed in and its structure]
 * @param request.field1 - [Description of nested fields if complex]
 * @param request.field2 - [Description of nested fields if complex]
 * @param options - [Optional configuration object]
 * @param options.timeout - [Description of timeout option]
 *
 * @returns [Data structure returned, or Promise<Data> for async]
 * @returns [If complex object:] Object containing:
 *          - success: boolean indicating operation success
 *          - data: [type] with the actual result
 *          - errors: [type] with any errors encountered
 *
 * @throws [ErrorType] - [When this error occurs and how to handle]
 * @throws ValidationError - When input validation fails
 * @throws TimeoutError - When operation exceeds configured timeout
 *
 * @example
 * ```typescript
 * const result = await service.method({
 *   field1: 'value',
 *   options: { timeout: 5000 }
 * });
 *
 * if (result.success) {
 *   console.log('Result:', result.data);
 * }
 * ```
 *
 * @internal Implementation detail: [if relevant]
 * @see [RelatedMethod] for related operation
 */
async method(
  request: MethodRequest,
  options?: MethodOptions
): Promise<MethodResult> {
  // ...
}
```

---

## 5. Simple Method

Use for straightforward methods with obvious signatures.

```typescript
/**
 * [Brief verb phrase describing what the method does]
 *
 * @param input - [What this parameter represents]
 * @returns [What is returned]
 */
simpleMethod(input: string): number {
  // ...
}
```

---

## 6. Private/Internal Method

Use for helper methods and internal functions.

```typescript
/**
 * [Brief description of what this helper does]
 *
 * @internal Used internally by [public method names]
 * @param items - [Description of items being processed]
 * @returns [Description of return value]
 */
private helperMethod(items: Item[]): ProcessedItem[] {
  // ...
}
```

---

## 7. Complex Algorithm

Use for methods implementing non-obvious algorithms.

```typescript
/**
 * Detect coverage gaps using vector similarity search
 *
 * Algorithm: HNSW (Hierarchical Navigable Small World)
 * Creates a searchable index of coverage patterns using hierarchical layers.
 *
 * Time Complexity: O(log n) average case for search
 * Space Complexity: O(n) for index storage
 * Performance: ~1-2ms for 100,000 files
 *
 * The algorithm works by:
 * 1. Creating vector embeddings from coverage patterns
 * 2. Building hierarchical index layers (coarse to fine)
 * 3. Searching from top layer down to find similar patterns
 * 4. Returning k-nearest neighbors (gaps with similar risk)
 *
 * Reference: Malkov, Y., & Yashunin, D. (2018).
 * "Efficient and robust approximate nearest neighbor search in high dimensions"
 *
 * @param request - Coverage data and search parameters
 * @param request.coverageData - Raw coverage metrics for files
 * @param request.k - Number of similar gaps to return (default: 10)
 *
 * @returns Gaps sorted by similarity to input pattern
 * @throws IndexError if HNSW index is not initialized
 *
 * @see {ADR-003} for implementation rationale
 * @internal Core performance-critical method
 */
async detectGaps(request: GapDetectionRequest): Promise<CoverageGap[]> {
  // Algorithm implementation with key checkpoints documented
}
```

---

## 8. Configuration/Type Documentation

Use for complex configuration objects and types.

```typescript
/**
 * Configuration for [Service Name]
 *
 * @property field1 - [Description of field1, include units or valid values]
 * @property field1.nested - [Description of nested properties]
 * @property field2 - [Description of field2]
 * @property field2.required - [True if required, false if optional]
 *
 * @example
 * ```typescript
 * const config: ServiceConfig = {
 *   field1: 'value',
 *   field2: {
 *     nested: true,
 *     timeout: 5000 // milliseconds
 *   }
 * };
 * ```
 */
export interface ServiceConfig {
  field1: string;
  field2: {
    nested: boolean;
    timeout: number; // in milliseconds
  };
}
```

---

## 9. Factory Function

Use for factory and builder functions.

```typescript
/**
 * Create a [Class] instance with dependencies injected
 *
 * This factory:
 * - Validates configuration
 * - Initializes dependencies
 * - Returns ready-to-use instance
 *
 * @param config - Configuration for the service
 * @param dependencies - Optional dependency overrides for testing
 *
 * @returns Initialized [Class] instance ready for use
 *
 * @throws ConfigError if configuration is invalid
 * @throws DependencyError if required dependencies are missing
 *
 * @example
 * ```typescript
 * const instance = create[Class]({
 *   option1: 'value'
 * });
 *
 * await instance.initialize();
 * ```
 */
export function create[Class](
  config: Config,
  dependencies?: Dependencies
): [Class] {
  // ...
}
```

---

## 10. Async Operation

Use for async methods, especially those with side effects.

```typescript
/**
 * Initialize the service and all dependencies
 *
 * This method:
 * 1. Validates configuration
 * 2. Connects to memory backend
 * 3. Initializes child services
 * 4. Sets up event listeners
 *
 * Once initialized, the service is ready to handle requests.
 * Call {@link dispose} to clean up when done.
 *
 * @throws InitializationError if initialization fails
 *
 * @example
 * ```typescript
 * const service = new MyService(config);
 * await service.initialize();
 * // Service now ready for use
 * ```
 *
 * @see {@link dispose} for cleanup
 */
async initialize(): Promise<void> {
  // ...
}
```

---

## 11. Enum Values

Use for enumerating options.

```typescript
/**
 * Supported test framework types
 *
 * @enum {string}
 * @member JEST - Jest test framework (default)
 * @member VITEST - Vitest test framework (faster, ESM native)
 * @member MOCHA - Mocha test framework (for Node.js)
 * @member PYTEST - Pytest for Python projects
 */
export enum TestFramework {
  JEST = 'jest',
  VITEST = 'vitest',
  MOCHA = 'mocha',
  PYTEST = 'pytest',
}
```

---

## 12. ADR/Pattern References

Use when code implements a specific ADR or pattern.

```typescript
/**
 * Multi-model router with complexity analysis and budget enforcement
 *
 * Implements ADR-051: Enhanced Model Routing with Budget Enforcement
 *
 * The router:
 * 1. Analyzes task complexity (code, reasoning, scope)
 * 2. Recommends optimal model tier (0-4)
 * 3. Enforces budget constraints
 * 4. Caches decisions for performance
 *
 * See ADR-051 for full specification and decision rationale.
 *
 * @see ADR-051 {@link ../../docs/decisions/ADR-051.md}
 * @see {@link ComplexityAnalyzer} for complexity scoring
 * @see {@link BudgetEnforcer} for budget validation
 */
export class ModelRouter implements IModelRouter {
  // ...
}
```

---

## 13. Error Handling

Document common error scenarios.

```typescript
/**
 * Execute tests with automatic retry for flaky failures
 *
 * Error Handling:
 * - Network timeout: Retried up to 3 times
 * - Flaky test failure: Detected and retried separately
 * - Test timeout: Fails immediately (non-retryable)
 * - Config error: Fails immediately with clear message
 *
 * @param request - Test execution request
 * @returns Execution result with detailed error information
 *
 * @throws ExecutionError - If tests cannot run at all
 * @throws ConfigError - If configuration is invalid (non-retryable)
 * @throws TimeoutError - If total execution time exceeds limit (non-retryable)
 *
 * @example
 * ```typescript
 * try {
 *   const result = await executor.execute(request);
 *   if (result.failed > 0) {
 *     console.log('Flaky tests:', result.flakyTests);
 *   }
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     // Handle timeout specially
 *   }
 * }
 * ```
 */
```

---

## 14. Exported Constant

Document exported constants and enums.

```typescript
/**
 * Default configuration for model router
 *
 * @type {ModelRouterConfig}
 *
 * Provides sensible defaults:
 * - Cache: enabled with 1000 entries, 5 minute TTL
 * - Fallback: Tier 2 (Sonnet) for error cases
 * - Budget: $1 per hour soft limit
 * - Metrics: enabled for performance tracking
 *
 * @see ModelRouterConfig for configuration structure
 * @see createModelRouter to customize
 */
export const DEFAULT_ROUTER_CONFIG: ModelRouterConfig = {
  // ...
};
```

---

## 15. Return Type with Structure

Document complex return structures.

```typescript
/**
 * Get comprehensive metrics for the routing system
 *
 * Returns detailed metrics including:
 * - Per-tier statistics (selection count, success rate, latency)
 * - Overall decision time percentiles (p95, p99)
 * - Budget utilization tracking
 * - Agent Booster performance stats
 *
 * @returns RouterMetrics object structured as:
 *          - byTier: Map<ModelTier, TierRoutingMetrics>
 *            - tier: Tier number
 *            - selectionCount: How many times selected
 *            - successRate: Percent of successful routing decisions
 *            - avgLatencyMs: Average decision time
 *            - p95LatencyMs: 95th percentile latency
 *          - totalDecisions: Total routing decisions made
 *          - fallbackRate: Percent of budget downgrades
 *          - agentBoosterStats: Agent Booster eligibility/usage stats
 *          - period: Time range for these metrics
 *
 * @example
 * ```typescript
 * const metrics = router.getMetrics();
 * console.log(`Tier 2 success rate: ${metrics.byTier[2].successRate * 100}%`);
 * console.log(`P95 latency: ${metrics.p95DecisionTimeMs}ms`);
 * ```
 */
getMetrics(): RouterMetrics {
  // ...
}
```

---

## Best Practices

1. **Be Specific**: Avoid vague descriptions like "does the thing"
2. **Show the Why**: Explain business purpose, not just technical what
3. **Include Examples**: Especially for public/complex APIs
4. **Link Related**: Use @see to connect related code
5. **Document Errors**: @throws is as important as @returns
6. **Performance Matters**: Note O(n), memory usage for important functions
7. **Keep DRY**: Refer to interfaces rather than repeating types
8. **Update Together**: When changing code, update JSDoc
9. **Be Consistent**: Use templates for similar code patterns
10. **Less is More**: One good example beats three vague paragraphs

---

## Quick Checklist

Before submitting code, verify:

- [ ] Module has top-level JSDoc with @module
- [ ] Public classes/interfaces documented
- [ ] All public methods have JSDoc with @param/@returns
- [ ] Complex algorithms explain time/space complexity
- [ ] Error cases documented (@throws)
- [ ] At least one @example for public APIs
- [ ] ADR references where applicable
- [ ] @see links to related code
- [ ] No orphaned helper functions without docs
- [ ] Typos and grammar checked

---

## Tools & Validation

**Generate documentation:**
```bash
npm run docs  # Generates TypeDoc HTML documentation
```

**Validate JSDoc:**
```bash
npm run lint:docs  # Checks JSDoc coverage
```

**Check specific file:**
```bash
eslint --plugin jsdoc src/domains/my-domain/service.ts
```

---

Generated for Agentic QE v3 Phase 3 Maintainability.
