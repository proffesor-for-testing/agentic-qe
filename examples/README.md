# TypeScript Examples

This directory contains TypeScript examples demonstrating the Agentic QE Framework capabilities. All examples have been converted from JavaScript to TypeScript with proper type annotations and imports.

## Available Examples

### Quick Start Examples

1. **`quick-test.ts`** - Simple verification that the framework is working
   ```bash
   npm run example:quick
   ```

2. **`basic-usage.ts`** - Demonstrates core QE capabilities
   ```bash
   npm run example:basic
   ```

### Advanced Examples

3. **`sparc-workflow.ts`** - Complete SPARC methodology with TDD
   ```bash
   npm run example:sparc
   ```

4. **`swarm-coordination.ts`** - Multi-agent swarm coordination with different topologies
   ```bash
   npm run example:swarm
   ```

5. **`consensus-protocols.ts`** - Distributed consensus mechanisms for QE workflows
   ```bash
   npm run example:consensus
   ```

6. **`github-integration.ts`** - Automated GitHub workflows with QE agents
   ```bash
   npm run example:github
   ```

7. **`test-all-agents.ts`** - Comprehensive test to verify all agents are working
   ```bash
   npm run example:test-all
   ```

## TypeScript Features

All examples now feature:

- ✅ **Proper TypeScript imports** from `../src/agents` and `../src/core/types`
- ✅ **Interface definitions** for complex data structures
- ✅ **Type annotations** for function parameters and return values
- ✅ **Generic type usage** for better type safety
- ✅ **Enum usage** where appropriate
- ✅ **Error handling** with typed error objects
- ✅ **Async/await** with proper Promise typing

## Running Examples

### Individual Examples
```bash
# Quick verification
npm run example:quick

# Basic usage patterns
npm run example:basic

# SPARC methodology
npm run example:sparc

# Swarm coordination
npm run example:swarm

# Consensus protocols
npm run example:consensus

# GitHub integration
npm run example:github

# Test all agents
npm run example:test-all
```

### Run Multiple Examples
```bash
# Run core examples
npm run examples:all
```

## TypeScript Configuration

The examples use the project's TypeScript configuration:

- **Target**: ES2020
- **Module**: CommonJS (for Node.js compatibility)
- **Strict**: Enabled for better type checking
- **Source Maps**: Enabled for debugging
- **Declaration**: Enabled for library usage

## Example Structure

Each example follows this TypeScript pattern:

```typescript
// Proper imports with type information
import { AgenticQE } from '../src/index';
import {
  SpecificAgent,
  AnotherAgent
} from '../src/agents';
import {
  TypeDefinition,
  InterfaceDefinition
} from '../src/core/types';

// Local interface definitions
interface ExampleData {
  property: string;
  value: number;
}

// Typed async function
async function exampleFunction(): Promise<void> {
  // Implementation with proper typing
  const aqe = new AgenticQE(config);
  const agent = aqe.createAgent('agent-type', agentConfig);

  // Typed operations
  const result: ExpectedType = await agent.performOperation(data);
}

// Export for reusability
export { exampleFunction };
```

## Migration Notes

The following changes were made during the JavaScript to TypeScript conversion:

1. **File Extensions**: All `.js` files renamed to `.ts`
2. **Import Statements**: Updated to use TypeScript imports
3. **Type Annotations**: Added throughout for better safety
4. **Interface Definitions**: Created for complex objects
5. **Error Handling**: Improved with typed error objects
6. **Package Scripts**: Updated to use `ts-node` for execution

## Dependencies

The examples require these TypeScript-related dependencies:

- `typescript` - TypeScript compiler
- `ts-node` - TypeScript execution for Node.js
- `@types/node` - Node.js type definitions
- `@types/jest` - Jest type definitions (for testing)

## Troubleshooting

If you encounter TypeScript compilation errors:

1. **Check imports**: Ensure all imports point to existing TypeScript files
2. **Verify types**: Make sure all type definitions are properly imported
3. **Update dependencies**: Ensure TypeScript and related packages are up to date
4. **Check configuration**: Verify `tsconfig.json` settings are correct

## Next Steps

After running these examples:

1. **Explore the source code** in `src/agents/` to understand agent implementations
2. **Read the documentation** in `docs/` for detailed guides
3. **Try customizing examples** for your specific use cases
4. **Create new examples** following the TypeScript patterns shown here