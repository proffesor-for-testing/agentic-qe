---
name: v3-cli-modernization
description: "Modernize claude-flow v3 CLI with modular commands, interactive prompts, enhanced hooks, and intelligent workflow automation. Decompose monolithic files, add context-aware UX, and achieve sub-200ms response times. Use when refactoring CLI architecture or adding interactive command features."
---

# V3 CLI Modernization

Modernizes claude-flow v3 CLI with modular command architecture, interactive prompts, deep hooks integration, and intelligent workflow automation.

## Quick Start

```bash
# Analyze current CLI structure
Task("CLI architecture", "Analyze current CLI structure and identify optimization opportunities", "cli-hooks-developer")

# Parallel modernization
Task("Command decomposition", "Break down large CLI files into focused modules", "cli-hooks-developer")
Task("Interactive prompts", "Implement intelligent interactive CLI experience", "cli-hooks-developer")
Task("Hooks enhancement", "Deep integrate hooks with CLI lifecycle", "cli-hooks-developer")
```

## Target Architecture

| Metric | Current | Target |
|--------|---------|--------|
| Command response | ~500ms | <200ms |
| index.ts size | 108KB | <10KB per module |
| Interactivity | Basic parsing | Context-aware prompts |
| Workflows | Manual chaining | Automated orchestration |
| Suggestions | Static help | Learning-based completion |

## Modular Command Registry

```typescript
// src/cli/core/command-registry.ts
interface CommandModule {
  name: string;
  description: string;
  category: CommandCategory;
  handler: CommandHandler;
  middleware: MiddlewareStack;
  permissions: Permission[];
}

export class ModularCommandRegistry {
  private commands = new Map<string, CommandModule>();

  async executeCommand(name: string, args: string[]): Promise<CommandResult> {
    const command = this.resolveCommand(name);
    if (!command) {
      throw new CommandNotFoundError(name, this.getSuggestions(name));
    }
    const context = await this.buildExecutionContext(command, args);
    return command.middleware.execute(context);
  }
}
```

## Command Decomposition

### Swarm Commands Module
```typescript
@Command({ name: 'swarm', description: 'Swarm coordination', category: 'orchestration' })
export class SwarmCommand {
  @SubCommand('init')
  @Option('--topology', 'Topology (mesh|hierarchical|adaptive)', 'hierarchical')
  @Option('--agents', 'Number of agents', 5)
  @Option('--interactive', 'Interactive configuration', false)
  async init(projectName: string, options: SwarmInitOptions): Promise<CommandResult> {
    if (options.interactive) return this.interactiveSwarmInit(projectName);
    return this.quickSwarmInit(projectName, options);
  }
}
```

### Learning Commands Module
```typescript
@Command({ name: 'learning', description: 'Learning system management', category: 'intelligence' })
export class LearningCommand {
  @SubCommand('start')
  @Option('--algorithm', 'RL algorithm', 'auto')
  async start(options: LearningStartOptions): Promise<CommandResult> {
    if (options.algorithm === 'auto') {
      const taskContext = await this.analyzeCurrentContext();
      options.algorithm = this.learningService.selectOptimalAlgorithm(taskContext);
    }
    return CommandResult.success({ algorithm: options.algorithm });
  }
}
```

## Interactive Prompt System

```typescript
// src/cli/services/interactive-prompt.service.ts
export class InteractivePromptService {
  async select<T>(options: SelectPromptOptions<T>): Promise<T> {
    const { default: inquirer } = await import('inquirer');
    const result = await inquirer.prompt([{
      type: 'list', name: 'selection',
      message: options.message, choices: options.choices
    }]);
    return result.selection;
  }

  async progressTask<T>(task: ProgressTask<T>, options: ProgressOptions): Promise<T> {
    const progressBar = new cliProgress.SingleBar({
      format: `${options.title} |{bar}| {percentage}% | {status}`
    });
    progressBar.start(100, 0, { status: 'Starting...' });
    const result = await task({ updateProgress: (p, s) => progressBar.update(p, { status: s }) });
    progressBar.stop();
    return result;
  }
}
```

## Enhanced Hooks Integration

```typescript
// src/cli/hooks/cli-hooks-manager.ts
export class CLIHooksManager {
  private setupDefaultHooks(): void {
    this.registerHook('command_start', async (event) => {
      await this.learningIntegration.recordCommandStart(event);
      const suggestions = await this.generateIntelligentSuggestions(event);
      if (suggestions.length > 0) this.displaySuggestions(suggestions);
    });

    this.registerHook('command_end', async (event) => {
      await this.learningIntegration.recordCommandSuccess(event);
      await this.recordPerformanceMetrics(event);
    });

    this.registerHook('command_error', async (event) => {
      await this.learningIntegration.recordCommandError(event);
    });
  }
}
```

## Workflow Automation

```typescript
export class WorkflowOrchestrator {
  async executeWorkflow(workflow: Workflow): Promise<WorkflowResult> {
    await this.displayWorkflowOverview(workflow);
    if (!await this.promptService.confirm('Execute this workflow?')) {
      return WorkflowResult.cancelled();
    }
    return this.promptService.progressTask(async ({ updateProgress }) => {
      const steps = this.sortStepsByDependencies(workflow.steps);
      for (let i = 0; i < steps.length; i++) {
        updateProgress((i / steps.length) * 100, `Executing ${steps[i].command}`);
        await this.executeStep(steps[i], context);
      }
      return WorkflowResult.success(context.getResults());
    }, { title: `Workflow: ${workflow.name}` });
  }
}
```

## Performance Monitoring

```typescript
export class CommandPerformanceMonitor {
  async measureCommand<T>(commandName: string, executor: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const memBefore = process.memoryUsage();
    const result = await executor();
    this.recordMetrics(commandName, {
      executionTime: performance.now() - start,
      memoryDelta: process.memoryUsage().heapUsed - memBefore.heapUsed,
      success: true
    });
    return result;
  }
}
```

## Success Metrics

- [ ] Command response: <200ms average
- [ ] File decomposition: index.ts (108KB) split to <10KB per module
- [ ] Interactive UX: Smart prompts with context awareness
- [ ] Hook integration: Deep lifecycle integration with learning
- [ ] Auto-completion: >90% accuracy for suggestions

## Usage Examples

```bash
# Interactive swarm initialization
claude-flow swarm init --interactive

# Guided learning session
claude-flow learning start --guided

# Intent-based workflow creation
claude-flow workflow create --from-intent "setup new project"
```
