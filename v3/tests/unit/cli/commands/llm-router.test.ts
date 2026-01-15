/**
 * LLM Router CLI Commands Tests
 * ADR-043: Vendor-Independent LLM Support - Milestone 10
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createLLMRouterCommand } from '../../../../src/cli/commands/llm-router.js';
import type { Command } from 'commander';

// Mock console.log and console.error for output testing
let mockConsoleLog: ReturnType<typeof vi.spyOn>;
let mockConsoleError: ReturnType<typeof vi.spyOn>;
let mockExit: ReturnType<typeof vi.spyOn>;

// Helper to parse command and execute it
async function executeCommand(
  cmd: Command,
  args: string[],
): Promise<void> {
  // Configure commander to not exit on error
  cmd.exitOverride();
  cmd.configureOutput({
    writeOut: () => {},
    writeErr: () => {},
  });

  // Parse will trigger the action - use 'node' as default (first two items are node and script)
  await cmd.parseAsync(args, { from: 'user' });
}

describe('LLM Router CLI Commands', () => {
  let command: ReturnType<typeof createLLMRouterCommand>;

  beforeEach(() => {
    command = createLLMRouterCommand();
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createLLMRouterCommand', () => {
    it('should create a command with name "llm"', () => {
      expect(command.name()).toBe('llm');
    });

    it('should have a description', () => {
      expect(command.description()).toBeTruthy();
      expect(command.description()).toContain('LLM Router');
    });

    it('should have subcommands', () => {
      const subcommandNames = command.commands.map(c => c.name());
      expect(subcommandNames).toContain('providers');
      expect(subcommandNames).toContain('models');
      expect(subcommandNames).toContain('route');
      expect(subcommandNames).toContain('config');
      expect(subcommandNames).toContain('health');
      expect(subcommandNames).toContain('cost');
    });
  });

  describe('providers subcommand', () => {
    it('should exist and have correct options', () => {
      const providersCmd = command.commands.find(c => c.name() === 'providers');
      expect(providersCmd).toBeDefined();

      const options = providersCmd!.options.map(o => o.long);
      expect(options).toContain('--json');
      expect(options).toContain('--verbose');
    });

    it('should list all provider types via parse', async () => {
      await executeCommand(command, ['providers', '--json']);

      expect(mockConsoleLog).toHaveBeenCalled();

      // Get the JSON output
      const jsonOutput = mockConsoleLog.mock.calls[0][0];
      const providers = JSON.parse(jsonOutput);

      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);

      // Check for expected providers
      const providerNames = providers.map((p: { provider: string }) => p.provider);
      expect(providerNames).toContain('claude');
      expect(providerNames).toContain('openai');
      expect(providerNames).toContain('ollama');
    });
  });

  describe('models subcommand', () => {
    it('should exist and have correct options', () => {
      const modelsCmd = command.commands.find(c => c.name() === 'models');
      expect(modelsCmd).toBeDefined();

      const options = modelsCmd!.options.map(o => o.long);
      expect(options).toContain('--provider');
      expect(options).toContain('--tier');
      expect(options).toContain('--json');
    });

    it('should list models as JSON', async () => {
      await executeCommand(command, ['models', '--json']);

      expect(mockConsoleLog).toHaveBeenCalled();

      const jsonOutput = mockConsoleLog.mock.calls[0][0];
      const models = JSON.parse(jsonOutput);

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);

      // Check model structure
      const firstModel = models[0];
      expect(firstModel).toHaveProperty('canonicalId');
      expect(firstModel).toHaveProperty('tier');
      expect(firstModel).toHaveProperty('family');
    });

    it('should filter models by provider', async () => {
      await executeCommand(command, ['models', '--json', '--provider', 'claude']);

      const jsonOutput = mockConsoleLog.mock.calls[0][0];
      const models = JSON.parse(jsonOutput);

      expect(models.length).toBeGreaterThan(0);
      // All returned models should have Claude provider ID
      for (const model of models) {
        expect(model.providerIds).toHaveProperty('claude');
      }
    });

    it('should filter models by tier', async () => {
      await executeCommand(command, ['models', '--json', '--tier', 'flagship']);

      const jsonOutput = mockConsoleLog.mock.calls[0][0];
      const models = JSON.parse(jsonOutput);

      expect(models.length).toBeGreaterThan(0);
      // All returned models should be flagship tier
      for (const model of models) {
        expect(model.tier).toBe('flagship');
      }
    });
  });

  describe('route subcommand', () => {
    it('should exist and have correct arguments and options', () => {
      const routeCmd = command.commands.find(c => c.name() === 'route');
      expect(routeCmd).toBeDefined();

      // Check for task argument
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((routeCmd as any).registeredArguments.length).toBe(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((routeCmd as any).registeredArguments[0].name()).toBe('task');

      const options = routeCmd!.options.map(o => o.long);
      expect(options).toContain('--agent');
      expect(options).toContain('--complexity');
      expect(options).toContain('--mode');
      expect(options).toContain('--json');
    });

    it('should route a security task to Claude', async () => {
      await executeCommand(command, ['route', 'security vulnerability scan', '--json']);

      const jsonOutput = mockConsoleLog.mock.calls[0][0];
      const decision = JSON.parse(jsonOutput);

      expect(decision).toHaveProperty('provider');
      expect(decision).toHaveProperty('model');
      expect(decision).toHaveProperty('reason');
      expect(decision).toHaveProperty('confidence');
      expect(decision.provider).toBe('claude');
    });

    it('should route with agent type consideration', async () => {
      await executeCommand(command, ['route', 'analyze code', '--json', '--agent', 'security-auditor']);

      const jsonOutput = mockConsoleLog.mock.calls[0][0];
      const decision = JSON.parse(jsonOutput);

      expect(decision.provider).toBe('claude');
      expect(decision.reason).toContain('Security');
    });

    it('should route simple tasks to efficient models', async () => {
      await executeCommand(command, [
        'route',
        'simple formatting task',
        '--json',
        '--complexity',
        'trivial',
        '--mode',
        'cost-optimized',
      ]);

      const jsonOutput = mockConsoleLog.mock.calls[0][0];
      const decision = JSON.parse(jsonOutput);

      // Should select cost-effective model
      expect(decision.model).toContain('mini');
    });
  });

  describe('config subcommand', () => {
    it('should exist and have correct options', () => {
      const configCmd = command.commands.find(c => c.name() === 'config');
      expect(configCmd).toBeDefined();

      const options = configCmd!.options.map(o => o.long);
      expect(options).toContain('--set');
      expect(options).toContain('--json');
    });

    it('should output configuration as JSON', async () => {
      await executeCommand(command, ['config', '--json']);

      const jsonOutput = mockConsoleLog.mock.calls[0][0];
      const config = JSON.parse(jsonOutput);

      expect(config).toHaveProperty('mode');
      expect(config).toHaveProperty('defaultProvider');
      expect(config).toHaveProperty('defaultModel');
      expect(config).toHaveProperty('enableMetrics');
    });

    it('should set and persist configuration value', async () => {
      // Set mode to cost-optimized
      await executeCommand(command, ['config', '--set', 'mode=cost-optimized']);

      expect(mockConsoleLog).toHaveBeenCalled();

      // Verify the setting was applied
      mockConsoleLog.mockClear();
      // Create new command instance to verify persistence (in-memory for tests)
      const newCommand = createLLMRouterCommand();
      await executeCommand(newCommand, ['config', '--json']);

      const jsonOutput = mockConsoleLog.mock.calls[0][0];
      const config = JSON.parse(jsonOutput);
      expect(config.mode).toBe('cost-optimized');
    });
  });

  describe('health subcommand', () => {
    it('should exist and have correct options', () => {
      const healthCmd = command.commands.find(c => c.name() === 'health');
      expect(healthCmd).toBeDefined();

      const options = healthCmd!.options.map(o => o.long);
      expect(options).toContain('--json');
      expect(options).toContain('--timeout');
    });

    it('should return health status for all providers', async () => {
      await executeCommand(command, ['health', '--json']);

      const jsonOutput = mockConsoleLog.mock.calls[0][0];
      const healthResults = JSON.parse(jsonOutput);

      expect(Array.isArray(healthResults)).toBe(true);
      expect(healthResults.length).toBeGreaterThan(0);

      // Check structure of health result
      const firstResult = healthResults[0];
      expect(firstResult).toHaveProperty('provider');
      expect(firstResult).toHaveProperty('healthy');
    });
  });

  describe('cost subcommand', () => {
    it('should exist and have correct arguments and options', () => {
      const costCmd = command.commands.find(c => c.name() === 'cost');
      expect(costCmd).toBeDefined();

      // Check for model argument
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((costCmd as any).registeredArguments.length).toBe(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((costCmd as any).registeredArguments[0].name()).toBe('model');

      const options = costCmd!.options.map(o => o.long);
      expect(options).toContain('--tokens');
      expect(options).toContain('--json');
    });

    it('should estimate cost for a known model', async () => {
      await executeCommand(command, ['cost', 'claude-sonnet-4', '--json', '--tokens', '10000']);

      const jsonOutput = mockConsoleLog.mock.calls[0][0];
      const costEstimate = JSON.parse(jsonOutput);

      expect(costEstimate).toHaveProperty('model');
      expect(costEstimate).toHaveProperty('tokens');
      expect(costEstimate).toHaveProperty('inputCostPer1M');
      expect(costEstimate).toHaveProperty('outputCostPer1M');
      expect(costEstimate).toHaveProperty('estimatedTotalCost');
      expect(costEstimate.tokens).toBe(10000);
    });

    it('should error for unknown model', async () => {
      // Unknown model triggers console.error and process.exit
      await executeCommand(command, ['cost', 'unknown-model-xyz', '--json']);

      // Expected - console.error was called
      expect(mockConsoleError).toHaveBeenCalled();
    });
  });

  describe('command help', () => {
    it('should have help text with subcommands listed', () => {
      const helpText = command.helpInformation();

      expect(helpText).toContain('providers');
      expect(helpText).toContain('models');
      expect(helpText).toContain('route');
      expect(helpText).toContain('config');
      expect(helpText).toContain('health');
      expect(helpText).toContain('cost');
    });
  });
});

describe('LLM Router Integration', () => {
  beforeEach(() => {
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should support all 8 provider types', async () => {
    const expectedProviders = [
      'claude',
      'openai',
      'ollama',
      'openrouter',
      'gemini',
      'azure-openai',
      'bedrock',
      'onnx',
    ];

    const command = createLLMRouterCommand();
    await executeCommand(command, ['providers', '--json']);

    const jsonOutput = mockConsoleLog.mock.calls[0][0];
    const providers = JSON.parse(jsonOutput);

    const providerNames = providers.map((p: { provider: string }) => p.provider);
    for (const expected of expectedProviders) {
      expect(providerNames).toContain(expected);
    }
  });

  it('should support 4 routing modes', async () => {
    const modes = ['manual', 'rule-based', 'cost-optimized', 'performance-optimized'];

    for (const mode of modes) {
      mockConsoleLog.mockClear();
      const command = createLLMRouterCommand();
      await executeCommand(command, ['route', 'test task', '--json', '--mode', mode]);

      expect(mockConsoleLog).toHaveBeenCalled();
      const jsonOutput = mockConsoleLog.mock.calls[0][0];
      const decision = JSON.parse(jsonOutput);

      expect(decision).toHaveProperty('provider');
      expect(decision).toHaveProperty('model');
    }
  });

  it('should provide accurate cost estimates', async () => {
    const command = createLLMRouterCommand();
    await executeCommand(command, ['cost', 'gpt-4o-mini', '--json', '--tokens', '1000000']);

    const jsonOutput = mockConsoleLog.mock.calls[0][0];
    const costEstimate = JSON.parse(jsonOutput);

    // GPT-4o-mini pricing: $0.15 input, $0.6 output per 1M tokens
    expect(costEstimate.inputCostPer1M).toBe(0.15);
    expect(costEstimate.outputCostPer1M).toBe(0.6);
    // At 1M tokens, cost should be: 0.15 + 0.6 = 0.75
    expect(costEstimate.estimatedTotalCost).toBeCloseTo(0.75, 2);
  });
});
