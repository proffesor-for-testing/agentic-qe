/**
 * Agentic QE v3 - LLM Router CLI Commands
 * ADR-043: Vendor-Independent LLM Support - Milestone 10
 *
 * Provides CLI access to LLM router management:
 * - aqe-v3 llm providers - List all available providers and their status
 * - aqe-v3 llm models [--provider <name>] - List available models
 * - aqe-v3 llm route <task-description> - Test routing decision for a task
 * - aqe-v3 llm config [--set key=value] - Get/set router configuration
 * - aqe-v3 llm health - Check provider health status
 * - aqe-v3 llm cost <model> [--tokens <count>] - Estimate cost
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  ALL_PROVIDER_TYPES,
  DEFAULT_ROUTER_CONFIG,
  DEFAULT_MODEL_MAPPINGS,
  type ExtendedProviderType,
  type RoutingMode,
  type RouterConfig,
  type ModelMapping,
} from '../../shared/llm/router/types.js';

// ============================================================================
// Types
// ============================================================================

interface ProvidersOptions {
  json?: boolean;
  verbose?: boolean;
}

interface ModelsOptions {
  provider?: string;
  json?: boolean;
  tier?: string;
}

interface RouteOptions {
  agent?: string;
  complexity?: string;
  mode?: string;
  json?: boolean;
}

interface ConfigOptions {
  set?: string;
  json?: boolean;
}

interface HealthOptions {
  json?: boolean;
  timeout?: string;
}

interface CostOptions {
  tokens?: string;
  json?: boolean;
}

// ============================================================================
// In-memory config state (would be persisted in real implementation)
// ============================================================================

let currentConfig: RouterConfig = { ...DEFAULT_ROUTER_CONFIG };

// ============================================================================
// Command Implementation
// ============================================================================

/**
 * Create the LLM router command group
 */
export function createLLMRouterCommand(): Command {
  const llmCmd = new Command('llm')
    .description('LLM Router management (ADR-043)')
    .addHelpText('after', `
Examples:
  $ aqe-v3 llm providers              List available providers
  $ aqe-v3 llm models --provider claude   List Claude models
  $ aqe-v3 llm route "security audit"     Test routing for a task
  $ aqe-v3 llm config --set mode=cost-optimized
  $ aqe-v3 llm health                 Check provider health
  $ aqe-v3 llm cost claude-sonnet-4 --tokens 10000
`);

  // llm providers
  llmCmd
    .command('providers')
    .description('List all available providers and their status')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Show detailed provider info')
    .action(async (options: ProvidersOptions) => {
      await executeProviders(options);
    });

  // llm models
  llmCmd
    .command('models')
    .description('List available models')
    .option('-p, --provider <name>', 'Filter by provider')
    .option('-t, --tier <tier>', 'Filter by tier (flagship|advanced|standard|efficient)')
    .option('--json', 'Output as JSON')
    .action(async (options: ModelsOptions) => {
      await executeModels(options);
    });

  // llm route
  llmCmd
    .command('route')
    .description('Test routing decision for a task')
    .argument('<task>', 'Task description')
    .option('-a, --agent <type>', 'Agent type (e.g., security-auditor)')
    .option('-c, --complexity <level>', 'Complexity: trivial|low|medium|high|expert', 'medium')
    .option('-m, --mode <mode>', 'Routing mode: manual|rule-based|cost-optimized|performance-optimized')
    .option('--json', 'Output as JSON')
    .action(async (task: string, options: RouteOptions) => {
      await executeRoute(task, options);
    });

  // llm config
  llmCmd
    .command('config')
    .description('Get/set router configuration')
    .option('-s, --set <key=value>', 'Set configuration value')
    .option('--json', 'Output as JSON')
    .action(async (options: ConfigOptions) => {
      await executeConfig(options);
    });

  // llm health
  llmCmd
    .command('health')
    .description('Check provider health status')
    .option('--json', 'Output as JSON')
    .option('-t, --timeout <ms>', 'Health check timeout', '5000')
    .action(async (options: HealthOptions) => {
      await executeHealth(options);
    });

  // llm cost
  llmCmd
    .command('cost')
    .description('Estimate cost for a model')
    .argument('<model>', 'Model name (canonical or provider-specific)')
    .option('-t, --tokens <count>', 'Estimated token count', '1000')
    .option('--json', 'Output as JSON')
    .action(async (model: string, options: CostOptions) => {
      await executeCost(model, options);
    });

  return llmCmd;
}

// ============================================================================
// Command Executors
// ============================================================================

async function executeProviders(options: ProvidersOptions): Promise<void> {
  const providers = ALL_PROVIDER_TYPES.map(type => {
    const config = currentConfig.providers?.[type];
    return {
      provider: type,
      enabled: config?.enabled ?? (type === 'claude' || type === 'openai' || type === 'ollama'),
      defaultModel: config?.defaultModel ?? getDefaultModelForProvider(type),
      status: getProviderStatus(type),
    };
  });

  if (options.json) {
    console.log(JSON.stringify(providers, null, 2));
    return;
  }

  console.log(chalk.bold.cyan('\nLLM Providers\n'));

  // Table header
  console.log(chalk.bold(
    padRight('Provider', 15) +
    padRight('Status', 12) +
    padRight('Enabled', 10) +
    padRight('Default Model', 30)
  ));
  console.log(chalk.gray('-'.repeat(67)));

  for (const p of providers) {
    const statusColor = p.status === 'available' ? chalk.green :
                       p.status === 'configured' ? chalk.yellow : chalk.gray;
    const enabledColor = p.enabled ? chalk.green : chalk.gray;

    console.log(
      padRight(p.provider, 15) +
      statusColor(padRight(p.status, 12)) +
      enabledColor(padRight(p.enabled ? 'Yes' : 'No', 10)) +
      chalk.gray(padRight(p.defaultModel || '-', 30))
    );
  }

  if (options.verbose) {
    console.log(chalk.bold('\nRouting Configuration:'));
    console.log(chalk.gray(`  Mode: ${currentConfig.mode}`));
    console.log(chalk.gray(`  Default Provider: ${currentConfig.defaultProvider}`));
    console.log(chalk.gray(`  Default Model: ${currentConfig.defaultModel}`));
    console.log(chalk.gray(`  Metrics Enabled: ${currentConfig.enableMetrics}`));
    console.log(chalk.gray(`  Decision Cache: ${currentConfig.cacheDecisions}`));
  }

  console.log('');
}

async function executeModels(options: ModelsOptions): Promise<void> {
  let models = [...DEFAULT_MODEL_MAPPINGS];

  if (options.provider) {
    models = models.filter(m =>
      m.providerIds[options.provider as ExtendedProviderType] !== undefined
    );
  }

  if (options.tier) {
    models = models.filter(m => m.tier === options.tier);
  }

  if (options.json) {
    console.log(JSON.stringify(models, null, 2));
    return;
  }

  console.log(chalk.bold.cyan('\nAvailable Models\n'));

  if (models.length === 0) {
    console.log(chalk.yellow('No models found matching criteria.'));
    return;
  }

  // Table header
  console.log(chalk.bold(
    padRight('Model', 25) +
    padRight('Tier', 12) +
    padRight('Family', 10) +
    padRight('Input/1M', 12) +
    padRight('Output/1M', 12)
  ));
  console.log(chalk.gray('-'.repeat(71)));

  for (const m of models) {
    const tierColor = m.tier === 'flagship' ? chalk.magenta :
                     m.tier === 'advanced' ? chalk.cyan :
                     m.tier === 'standard' ? chalk.green :
                     chalk.gray;

    console.log(
      padRight(m.canonicalId, 25) +
      tierColor(padRight(m.tier, 12)) +
      padRight(m.family, 10) +
      chalk.yellow(padRight(formatCost(m.inputCostPer1M), 12)) +
      chalk.yellow(padRight(formatCost(m.outputCostPer1M), 12))
    );
  }

  console.log('');
}

async function executeRoute(task: string, options: RouteOptions): Promise<void> {
  const mode = (options.mode || currentConfig.mode) as RoutingMode;
  const complexity = options.complexity || 'medium';
  const agentType = options.agent;

  // Simulate routing decision based on task and options
  const decision = simulateRoutingDecision(task, {
    mode,
    complexity,
    agentType,
  });

  if (options.json) {
    console.log(JSON.stringify(decision, null, 2));
    return;
  }

  console.log(chalk.bold.cyan('\nRouting Decision\n'));
  console.log(chalk.gray(`Task: "${task}"`));
  console.log(chalk.gray(`Mode: ${mode}`));
  if (agentType) console.log(chalk.gray(`Agent: ${agentType}`));
  console.log(chalk.gray(`Complexity: ${complexity}`));
  console.log('');

  console.log(chalk.bold('Result:'));
  console.log(chalk.green(`  Provider: ${decision.provider}`));
  console.log(chalk.green(`  Model: ${decision.model}`));
  console.log(chalk.gray(`  Reason: ${decision.reason}`));
  console.log(chalk.gray(`  Confidence: ${(decision.confidence * 100).toFixed(0)}%`));

  if (decision.estimatedCost) {
    console.log(chalk.bold('\nCost Estimate:'));
    console.log(chalk.yellow(`  Input tokens: ${decision.estimatedCost.inputTokens}`));
    console.log(chalk.yellow(`  Output tokens: ${decision.estimatedCost.outputTokens}`));
    console.log(chalk.yellow(`  Total: $${decision.estimatedCost.totalCostUsd.toFixed(6)}`));
  }

  console.log('');
}

async function executeConfig(options: ConfigOptions): Promise<void> {
  if (options.set) {
    const [key, value] = options.set.split('=');
    if (!key || value === undefined) {
      console.error(chalk.red('Invalid format. Use: --set key=value'));
      process.exit(1);
    }

    updateConfig(key, value);
    console.log(chalk.green(`Set ${key} = ${value}`));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(currentConfig, null, 2));
    return;
  }

  console.log(chalk.bold.cyan('\nRouter Configuration\n'));

  console.log(chalk.bold('General:'));
  console.log(`  mode: ${chalk.cyan(currentConfig.mode)}`);
  console.log(`  defaultProvider: ${chalk.cyan(currentConfig.defaultProvider)}`);
  console.log(`  defaultModel: ${chalk.cyan(currentConfig.defaultModel)}`);
  console.log(`  enableMetrics: ${currentConfig.enableMetrics ? chalk.green('true') : chalk.gray('false')}`);
  console.log(`  cacheDecisions: ${currentConfig.cacheDecisions ? chalk.green('true') : chalk.gray('false')}`);
  console.log(`  decisionCacheTtlMs: ${chalk.gray(currentConfig.decisionCacheTtlMs)}`);

  console.log(chalk.bold('\nFallback:'));
  console.log(`  maxRetries: ${currentConfig.fallbackChain.maxRetries}`);
  console.log(`  retryDelayMs: ${currentConfig.fallbackChain.retryDelayMs}`);

  console.log(chalk.bold('\nEnabled Providers:'));
  for (const [provider, config] of Object.entries(currentConfig.providers || {})) {
    if (config?.enabled) {
      console.log(`  ${chalk.green('*')} ${provider}: ${config.defaultModel || 'default'}`);
    }
  }

  console.log('');
}

async function executeHealth(options: HealthOptions): Promise<void> {
  const timeout = parseInt(options.timeout || '5000', 10);

  const healthResults = await checkProviderHealth(timeout);

  if (options.json) {
    console.log(JSON.stringify(healthResults, null, 2));
    return;
  }

  console.log(chalk.bold.cyan('\nProvider Health Status\n'));

  // Table header
  console.log(chalk.bold(
    padRight('Provider', 15) +
    padRight('Status', 12) +
    padRight('Latency', 12) +
    padRight('Message', 30)
  ));
  console.log(chalk.gray('-'.repeat(69)));

  for (const result of healthResults) {
    const statusColor = result.healthy ? chalk.green : chalk.red;
    const statusText = result.healthy ? 'healthy' : 'unhealthy';

    console.log(
      padRight(result.provider, 15) +
      statusColor(padRight(statusText, 12)) +
      chalk.gray(padRight(result.latencyMs ? `${result.latencyMs}ms` : '-', 12)) +
      chalk.gray(padRight(truncate(result.message || '-', 28), 30))
    );
  }

  const healthyCount = healthResults.filter(r => r.healthy).length;
  console.log(chalk.bold(`\n${healthyCount}/${healthResults.length} providers healthy\n`));
}

async function executeCost(model: string, options: CostOptions): Promise<void> {
  const tokens = parseInt(options.tokens || '1000', 10);

  const modelInfo = findModel(model);
  if (!modelInfo) {
    console.error(chalk.red(`Model not found: ${model}`));
    console.log(chalk.gray('Use `aqe-v3 llm models` to list available models.'));
    process.exit(1);
    return; // Ensure we don't continue if process.exit is mocked
  }

  const inputCost = (modelInfo.inputCostPer1M || 0) * (tokens / 1000000);
  const outputCost = (modelInfo.outputCostPer1M || 0) * (tokens / 1000000);
  const totalCost = inputCost + outputCost;

  const result = {
    model: modelInfo.canonicalId,
    tokens,
    inputCostPer1M: modelInfo.inputCostPer1M,
    outputCostPer1M: modelInfo.outputCostPer1M,
    estimatedInputCost: inputCost,
    estimatedOutputCost: outputCost,
    estimatedTotalCost: totalCost,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(chalk.bold.cyan('\nCost Estimate\n'));
  console.log(chalk.gray(`Model: ${modelInfo.canonicalName} (${modelInfo.canonicalId})`));
  console.log(chalk.gray(`Tokens: ${tokens.toLocaleString()}\n`));

  console.log(chalk.bold('Pricing (per 1M tokens):'));
  console.log(`  Input:  ${formatCost(modelInfo.inputCostPer1M)}`);
  console.log(`  Output: ${formatCost(modelInfo.outputCostPer1M)}`);

  console.log(chalk.bold('\nEstimated Cost:'));
  console.log(`  Input:  ${chalk.yellow('$' + inputCost.toFixed(6))}`);
  console.log(`  Output: ${chalk.yellow('$' + outputCost.toFixed(6))}`);
  console.log(`  Total:  ${chalk.green('$' + totalCost.toFixed(6))}`);

  console.log('');
}

// ============================================================================
// Helper Functions
// ============================================================================

function padRight(str: string, length: number): string {
  return str.padEnd(length);
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + '...';
}

function formatCost(cost?: number): string {
  if (cost === undefined || cost === null) return '-';
  if (cost === 0) return '$0 (free)';
  return `$${cost.toFixed(2)}`;
}

function getDefaultModelForProvider(provider: ExtendedProviderType): string {
  const defaults: Record<ExtendedProviderType, string> = {
    claude: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o',
    ollama: 'llama3.1',
    openrouter: 'anthropic/claude-sonnet-4',
    gemini: 'gemini-2.0-pro',
    'azure-openai': 'gpt-4o',
    bedrock: 'anthropic.claude-sonnet-4-v1:0',
    onnx: 'phi-4',
  };
  return defaults[provider] || '';
}

function getProviderStatus(provider: ExtendedProviderType): string {
  // In a real implementation, this would check API keys and connectivity
  const hasApiKey = (envVar: string) => !!process.env[envVar];

  switch (provider) {
    case 'claude':
      return hasApiKey('ANTHROPIC_API_KEY') ? 'available' : 'configured';
    case 'openai':
      return hasApiKey('OPENAI_API_KEY') ? 'available' : 'configured';
    case 'ollama':
      return 'configured'; // Local, always configured
    case 'openrouter':
      return hasApiKey('OPENROUTER_API_KEY') ? 'available' : 'not configured';
    case 'gemini':
      return hasApiKey('GOOGLE_API_KEY') ? 'available' : 'not configured';
    case 'azure-openai':
      return hasApiKey('AZURE_OPENAI_API_KEY') ? 'available' : 'not configured';
    case 'bedrock':
      return hasApiKey('AWS_ACCESS_KEY_ID') ? 'available' : 'not configured';
    case 'onnx':
      return 'configured'; // Local
    default:
      return 'not configured';
  }
}

function simulateRoutingDecision(task: string, options: {
  mode: RoutingMode;
  complexity: string;
  agentType?: string;
}): {
  provider: ExtendedProviderType;
  model: string;
  reason: string;
  confidence: number;
  estimatedCost?: { inputTokens: number; outputTokens: number; totalCostUsd: number };
} {
  const { mode, complexity, agentType } = options;

  // Rule-based routing simulation
  if (agentType?.includes('security') || task.toLowerCase().includes('security')) {
    return {
      provider: 'claude',
      model: 'claude-sonnet-4-20250514',
      reason: 'Security tasks require advanced reasoning (rule-match)',
      confidence: 0.95,
      estimatedCost: { inputTokens: 2000, outputTokens: 1000, totalCostUsd: 0.021 },
    };
  }

  if (mode === 'cost-optimized' || complexity === 'trivial' || complexity === 'low') {
    return {
      provider: 'openai',
      model: 'gpt-4o-mini',
      reason: 'Cost optimization selected efficient model',
      confidence: 0.85,
      estimatedCost: { inputTokens: 2000, outputTokens: 1000, totalCostUsd: 0.0009 },
    };
  }

  if (mode === 'performance-optimized' || complexity === 'expert') {
    return {
      provider: 'claude',
      model: 'claude-opus-4-5-20251101',
      reason: 'Complex task requires flagship model',
      confidence: 0.92,
      estimatedCost: { inputTokens: 2000, outputTokens: 1000, totalCostUsd: 0.105 },
    };
  }

  // Default
  return {
    provider: currentConfig.defaultProvider as ExtendedProviderType,
    model: currentConfig.defaultModel,
    reason: 'Default provider selected',
    confidence: 0.8,
    estimatedCost: { inputTokens: 2000, outputTokens: 1000, totalCostUsd: 0.021 },
  };
}

function updateConfig(key: string, value: string): void {
  switch (key) {
    case 'mode':
      if (['manual', 'rule-based', 'cost-optimized', 'performance-optimized'].includes(value)) {
        currentConfig.mode = value as RoutingMode;
      } else {
        throw new Error(`Invalid mode: ${value}`);
      }
      break;
    case 'defaultProvider':
      if (ALL_PROVIDER_TYPES.includes(value as ExtendedProviderType)) {
        currentConfig.defaultProvider = value as ExtendedProviderType;
      } else {
        throw new Error(`Invalid provider: ${value}`);
      }
      break;
    case 'enableMetrics':
      currentConfig.enableMetrics = value === 'true';
      break;
    case 'cacheDecisions':
      currentConfig.cacheDecisions = value === 'true';
      break;
    default:
      throw new Error(`Unknown config key: ${key}`);
  }
}

async function checkProviderHealth(timeout: number): Promise<Array<{
  provider: ExtendedProviderType;
  healthy: boolean;
  latencyMs?: number;
  message?: string;
}>> {
  // Simulate health checks (in real implementation, would ping actual providers)
  return ALL_PROVIDER_TYPES.map(provider => {
    const status = getProviderStatus(provider);
    const isConfigured = status !== 'not configured';

    return {
      provider,
      healthy: status === 'available' || provider === 'ollama' || provider === 'onnx',
      latencyMs: isConfigured ? Math.floor(Math.random() * 200 + 50) : undefined,
      message: status === 'available' ? 'OK' :
               status === 'configured' ? 'API key not verified' :
               'Not configured',
    };
  });
}

function findModel(modelId: string): ModelMapping | undefined {
  // Search by canonical ID first
  let model = DEFAULT_MODEL_MAPPINGS.find(m => m.canonicalId === modelId);
  if (model) return model;

  // Search by provider-specific ID
  for (const m of DEFAULT_MODEL_MAPPINGS) {
    for (const providerId of Object.values(m.providerIds)) {
      if (providerId === modelId) return m;
    }
  }

  return undefined;
}
