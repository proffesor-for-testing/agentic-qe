# Circular Dependency Detection with MinCut Analysis

The CircularDependencyDetector uses Tarjan's algorithm to find strongly connected components (SCCs) in your code dependency graph, then applies MinCut analysis to identify optimal break points for resolving circular dependencies.

## Overview

Circular dependencies are a common code smell that can lead to:
- Difficult-to-understand code
- Build system issues
- Runtime initialization problems
- Tight coupling between modules

The CircularDependencyDetector helps you:
1. **Find** all circular dependencies in your codebase
2. **Analyze** their severity based on cycle size and edge types
3. **Suggest** optimal break points using minimum cut analysis
4. **Recommend** specific refactoring strategies

## Quick Start

```typescript
import { CircularDependencyDetector } from '@agentic-qe/code-intelligence/analysis/mincut';
import { GraphBuilder } from '@agentic-qe/code-intelligence/graph';

// Build your code graph
const builder = new GraphBuilder();
// ... add files, nodes, edges ...

// Create detector
const detector = new CircularDependencyDetector(builder.exportGraph());

// Find all circular dependencies
const cycles = await detector.detectAll();

// Display results
for (const cycle of cycles) {
  console.log(`Cycle: ${cycle.cycle.join(' → ')}`);
  console.log(`Severity: ${cycle.severity}`);
  console.log('Break points:', cycle.breakPoints);
  console.log('Recommendations:', cycle.recommendations);
}
```

## Core Concepts

### Strongly Connected Components (SCCs)

An SCC is a set of nodes where every node is reachable from every other node. In code:
- If Class A imports Class B, and Class B imports Class A, they form an SCC
- Any SCC with more than one node represents a circular dependency

### Tarjan's Algorithm

We use Tarjan's algorithm to find SCCs efficiently:
- **Time Complexity**: O(V + E) where V = nodes, E = edges
- **Space Complexity**: O(V) for the recursion stack
- **Advantages**: Single pass, optimal performance

### MinCut Analysis

After identifying an SCC (cycle), we use MinCut to find the weakest link:
- Converts the cycle into an undirected graph
- Finds edges with minimum total weight
- These are the easiest edges to break

### Edge Type Weights

Different edge types have different coupling strengths:

| Edge Type | Weight | Meaning |
|-----------|--------|---------|
| `extends` | 1.0 | Strongest - inheritance creates tight coupling |
| `implements` | 0.9 | Very strong - interface implementation |
| `imports` | 0.8 | Strong - direct dependency |
| `calls` | 0.6 | Moderate - function calls |
| `uses` | 0.5 | Moderate - type usage |
| `contains` | 0.3 | Weak - parent-child containment |

MinCut considers these weights to identify edges that are easier to break.

## API Reference

### CircularDependencyDetector

```typescript
class CircularDependencyDetector {
  constructor(graph: CodeGraph);

  // Find all circular dependencies
  detectAll(): Promise<CircularDependencyResult[]>;

  // Check if a specific file is in a cycle
  checkFile(filePath: string): Promise<CircularDependencyResult | null>;

  // Get statistics about cycles
  getStats(): Promise<{
    totalCycles: number;
    bySeverity: { high: number; medium: number; low: number };
    largestCycle: number;
    avgCycleSize: number;
  }>;
}
```

### CircularDependencyResult

```typescript
interface CircularDependencyResult {
  // Files involved in the circular dependency
  cycle: string[];

  // Suggested break points (from MinCut)
  breakPoints: BreakPoint[];

  // Severity based on cycle size and edge types
  severity: 'low' | 'medium' | 'high';

  // Actionable recommendations
  recommendations: string[];
}
```

### BreakPoint

```typescript
interface BreakPoint {
  // Source file/entity
  source: string;

  // Target file/entity
  target: string;

  // Type of edge to break
  edgeType: string;

  // Estimated effort to break this dependency
  effort: 'low' | 'medium' | 'high';

  // Specific suggestion
  suggestion: string;
}
```

## Severity Classification

The detector classifies circular dependencies by severity:

### High Severity
- **Large cycles**: More than 5 files
- **Inheritance cycles**: Contains `extends` edges
- **Impact**: Very difficult to break, high refactoring cost
- **Priority**: Fix immediately

### Medium Severity
- **Medium cycles**: 3-5 files
- **Interface cycles**: Contains `implements` edges
- **Impact**: Moderate refactoring required
- **Priority**: Fix soon

### Low Severity
- **Small cycles**: 2 files
- **Import-only cycles**: Only `imports` edges
- **Impact**: Easy to break with dependency injection
- **Priority**: Fix when convenient

## Break Point Effort Estimation

### Low Effort
- **Edge types**: `imports`, `calls`
- **Solution**: Extract to shared module or use dependency injection
- **Example**:
  ```typescript
  // Before: A imports B, B imports A
  // After: Both import SharedTypes
  ```

### Medium Effort
- **Edge types**: `uses`, `implements`
- **Solution**: Introduce an interface/abstraction layer
- **Example**:
  ```typescript
  // Before: A uses B, B uses A
  // After: A uses IB (interface), B implements IB
  ```

### High Effort
- **Edge types**: `extends`, `overrides`
- **Solution**: Restructure inheritance hierarchy
- **Example**:
  ```typescript
  // Before: A extends B, B extends A (impossible!)
  // After: Favor composition over inheritance
  ```

## Usage Examples

### Example 1: Simple Two-File Cycle

```typescript
// UserService.ts imports AuthService.ts
// AuthService.ts imports UserService.ts

const detector = new CircularDependencyDetector(graph);
const results = await detector.detectAll();

// Output:
// Cycle: UserService.ts → AuthService.ts
// Severity: low
// Break point: UserService → AuthService (imports)
// Effort: low
// Suggestion: Extract to shared module or use dependency injection
```

**Resolution**:
1. Extract common types to `types.ts`
2. Both services import from `types.ts`
3. Use dependency injection for runtime dependencies

### Example 2: Complex Cycle with Inheritance

```typescript
// BaseModel extends Repository
// Repository uses QueryBuilder
// QueryBuilder calls UserModel
// UserModel extends BaseModel

const results = await detector.detectAll();

// Output:
// Cycle: BaseModel → Repository → QueryBuilder → UserModel
// Severity: high (inheritance involved!)
// Break points:
//   1. QueryBuilder → UserModel (low effort)
//   2. Repository → QueryBuilder (medium effort)
```

**Resolution** (option 1 - easiest):
1. Break `QueryBuilder → UserModel`
2. Extract model interface: `IUserModel`
3. QueryBuilder depends on `IUserModel` instead of `UserModel`

### Example 3: Batch Analysis

```typescript
const detector = new CircularDependencyDetector(graph);
const stats = await detector.getStats();

console.log(`Found ${stats.totalCycles} cycles:`);
console.log(`  High severity: ${stats.bySeverity.high}`);
console.log(`  Medium severity: ${stats.bySeverity.medium}`);
console.log(`  Low severity: ${stats.bySeverity.low}`);
console.log(`Largest cycle: ${stats.largestCycle} files`);

// Prioritize high-severity cycles
const results = await detector.detectAll();
const highSeverity = results.filter(r => r.severity === 'high');

for (const cycle of highSeverity) {
  // Focus on these first
  console.log(`Fix: ${cycle.cycle.join(' → ')}`);
  console.log(`Easiest break point: ${cycle.breakPoints[0].suggestion}`);
}
```

### Example 4: CI/CD Integration

```typescript
import { CircularDependencyDetector } from '@agentic-qe/code-intelligence';

async function checkCircularDependencies() {
  const detector = new CircularDependencyDetector(graph);
  const results = await detector.detectAll();

  // Fail CI if high-severity cycles exist
  const highSeverity = results.filter(r => r.severity === 'high');
  if (highSeverity.length > 0) {
    console.error(`❌ Found ${highSeverity.length} high-severity circular dependencies`);
    highSeverity.forEach(cycle => {
      console.error(`   ${cycle.cycle.join(' → ')}`);
    });
    process.exit(1);
  }

  // Warn about medium/low severity
  const otherCycles = results.filter(r => r.severity !== 'high');
  if (otherCycles.length > 0) {
    console.warn(`⚠️  Found ${otherCycles.length} circular dependencies (non-critical)`);
  }

  console.log('✅ No critical circular dependencies');
}
```

## Common Refactoring Patterns

### Pattern 1: Extract Shared Types

**Before**:
```typescript
// A.ts
import { B } from './B';
export class A { b: B; }

// B.ts
import { A } from './A';
export class B { a: A; }
```

**After**:
```typescript
// types.ts
export interface IA { b: IB; }
export interface IB { a: IA; }

// A.ts
import { IA, IB } from './types';
export class A implements IA { b: IB; }

// B.ts
import { IA, IB } from './types';
export class B implements IB { a: IA; }
```

### Pattern 2: Dependency Injection

**Before**:
```typescript
// OrderService.ts
import { PaymentService } from './PaymentService';
class OrderService {
  payment = new PaymentService();
}

// PaymentService.ts
import { OrderService } from './OrderService';
class PaymentService {
  orders = new OrderService();
}
```

**After**:
```typescript
// IPaymentService.ts
export interface IPaymentService {
  processPayment(order: Order): Promise<void>;
}

// OrderService.ts
import { IPaymentService } from './IPaymentService';
class OrderService {
  constructor(private payment: IPaymentService) {}
}

// PaymentService.ts
import { IPaymentService } from './IPaymentService';
class PaymentService implements IPaymentService {
  async processPayment(order: Order): Promise<void> {
    // No need to reference OrderService
  }
}
```

### Pattern 3: Event-Driven Communication

**Before**:
```typescript
// A.ts
import { B } from './B';
class A {
  doSomething() { new B().notify(this); }
}

// B.ts
import { A } from './A';
class B {
  notify(a: A) { a.doSomething(); }
}
```

**After**:
```typescript
// EventBus.ts
export const eventBus = new EventEmitter();

// A.ts
import { eventBus } from './EventBus';
class A {
  doSomething() {
    eventBus.emit('something-happened', this);
  }
}

// B.ts
import { eventBus } from './EventBus';
class B {
  constructor() {
    eventBus.on('something-happened', this.onSomething);
  }
  onSomething(data: any) { }
}
```

## Best Practices

1. **Fix High-Severity First**: Start with inheritance cycles and large cycles
2. **Use Interfaces**: Abstract dependencies through interfaces
3. **Favor Composition**: Avoid inheritance cycles by using composition
4. **Dependency Injection**: Inject dependencies instead of creating them
5. **Event-Driven**: Use events for loose coupling
6. **Regular Checks**: Run detection in CI/CD to prevent new cycles

## Performance

- **Tarjan's Algorithm**: O(V + E) - very efficient even for large codebases
- **MinCut Analysis**: O(V³) worst case, but typically much faster for small cycles
- **Practical Performance**:
  - 1000-file codebase: < 5 seconds
  - 10,000-file codebase: < 30 seconds
  - 100,000-file codebase: < 5 minutes (mostly graph construction)

## Limitations

1. **Dynamic Dependencies**: Cannot detect runtime/reflection-based dependencies
2. **Conditional Imports**: May miss conditional or lazy imports
3. **External Modules**: Only analyzes your codebase, not node_modules
4. **Language-Specific**: Requires language-specific parsers (currently TypeScript/JavaScript)

## Related

- [MinCut Analysis](./mincut-analysis.md)
- [Graph Builder](./graph-builder.md)
- [Code Intelligence Guide](./code-intelligence-quickstart.md)
- [Module Coupling Analysis](./module-coupling.md)

## Examples

See `/examples/code-intelligence/circular-dependency-detection.ts` for complete working examples.
