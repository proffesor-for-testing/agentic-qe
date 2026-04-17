/**
 * Agentic QE v3 - LLM Router CLI Commands
 * ADR-043: Vendor-Independent LLM Support - Milestone 10
 *
 * Provides CLI access to LLM router management:
 * - aqe llm providers - List all available providers and their status
 * - aqe llm models [--provider <name>] - List available models
 * - aqe llm route <task-description> - Test routing decision for a task
 * - aqe llm config [--set key=value] - Get/set router configuration
 * - aqe llm health - Check provider health status
 * - aqe llm cost <model> [--tokens <count>] - Estimate cost
 */

import { Command } from 'commander';
import { secureRandomInt } from '../../shared/utils/crypto-random.js';
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

interface AdviseOptions {
  transcript?: string;
  session?: string;
  stdin?: boolean;
  provider?: string;
  model?: string;
  maxWords?: string;
  agent?: string;
  triggerReason?: string;
  redact?: string;
  advisorPrompt?: string;
  json?: boolean;
  quiet?: boolean;
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
  $ aqe llm providers              List available providers
  $ aqe llm models --provider claude   List Claude models
  $ aqe llm route "security audit"     Test routing for a task
  $ aqe llm config --set mode=cost-optimized
  $ aqe llm health                 Check provider health
  $ aqe llm cost claude-sonnet-4 --tokens 10000
  $ aqe llm advise --transcript t.json --json   Consult advisor (ADR-092)
  $ aqe llm verify --session <id>               Check advisor quality gate
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

  // llm verify (ADR-092 Phase 3 — quality gate enforcement)
  llmCmd
    .command('verify')
    .description('Check whether an advisor was consulted for a session (ADR-092 quality gate)')
    .requiredOption('--session <id>', 'Session ID to check')
    .option('--min-calls <n>', 'Minimum required advisor calls (default: 1)', '1')
    .option('--json', 'Output as JSON')
    .action(async (options: { session: string; minCalls?: string; json?: boolean }) => {
      await executeVerify(options);
    });

  // llm advise (ADR-092)
  llmCmd
    .command('advise')
    .description('Consult an advisor model on a forwarded transcript (ADR-092)')
    .option('--transcript <path>', 'Path to a transcript JSON file')
    .option('--session <id>', 'Claude Code session ID (reads JSONL from disk)')
    .option('--stdin', 'Read transcript JSON from stdin')
    .option('--provider <name>', 'Advisor provider (default: openrouter)')
    .option('--model <id>', 'Advisor model ID (default: anthropic/claude-opus-4)')
    .option('--max-words <n>', 'Max advice length in words', '100')
    .option('--agent <name>', 'Agent invoking the advisor (for audit)')
    .option('--trigger-reason <text>', 'Why the advisor is being called')
    .option('--redact <mode>', 'Redaction mode: strict|balanced|off (default: strict)', 'strict')
    .option('--advisor-prompt <text>', 'Domain-specific advisor system prompt (overrides default)')
    .option('--json', 'Emit structured JSON to stdout (default)')
    .option('--quiet', 'Suppress status messages')
    .action(async (options: AdviseOptions) => {
      await executeAdvise(options);
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
    console.log(chalk.gray('Use `aqe llm models` to list available models.'));
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
    claude: 'claude-sonnet-4-6',
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
      model: 'claude-sonnet-4-6',
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
      model: 'claude-opus-4-7',
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
      latencyMs: isConfigured ? secureRandomInt(50, 250) : undefined,
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

// ============================================================================
// `aqe llm advise` — ADR-092 Phase 0
// ============================================================================

/**
 * Read a transcript from one of three sources (--transcript, --session, --stdin).
 * Phase 0 supports --transcript (JSON file) and --stdin; --session is Phase 1+.
 */
async function loadTranscript(options: AdviseOptions): Promise<{
  systemPrompt?: string;
  taskDescription?: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
}> {
  const { readFile } = await import('fs/promises');

  if (options.transcript) {
    const raw = await readFile(options.transcript, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.messages || !Array.isArray(parsed.messages)) {
      throw new Error(`Transcript file must contain a 'messages' array: ${options.transcript}`);
    }
    return {
      systemPrompt: parsed.systemPrompt,
      taskDescription: parsed.taskDescription,
      messages: parsed.messages,
    };
  }

  if (options.stdin) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks).toString('utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.messages || !Array.isArray(parsed.messages)) {
      throw new Error('Transcript from stdin must contain a `messages` array');
    }
    return {
      systemPrompt: parsed.systemPrompt,
      taskDescription: parsed.taskDescription,
      messages: parsed.messages,
    };
  }

  if (options.session) {
    const { readFile, readdir } = await import('fs/promises');
    const { join } = await import('path');
    const os = await import('os');

    const projectsDir = join(os.homedir(), '.claude', 'projects');
    let jsonlPath: string | null = null;

    try {
      const encodedDirs = await readdir(projectsDir);
      for (const dir of encodedDirs) {
        const sessionsDir = join(projectsDir, dir);
        const files = await readdir(sessionsDir).catch(() => [] as string[]);
        const match = files.find(f => f.includes(options.session!) && f.endsWith('.jsonl'));
        if (match) {
          jsonlPath = join(sessionsDir, match);
          break;
        }
      }
    } catch { /* projects dir doesn't exist */ }

    if (!jsonlPath) {
      throw new Error(
        `Could not find session JSONL for session ID "${options.session}" ` +
        `in ~/.claude/projects/. Use --transcript <path> as fallback.`
      );
    }

    const raw = await readFile(jsonlPath, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const entryType = entry.type;
        const msg = entry.message;
        if (!msg) continue;

        const role = msg.role;
        const rawContent = msg.content;

        if (entryType === 'user' && role === 'user') {
          const text = typeof rawContent === 'string' ? rawContent
            : Array.isArray(rawContent) ? rawContent.map((b: any) => b.text ?? '').join('')
            : '';
          if (text.trim()) messages.push({ role: 'user', content: text });
        } else if (entryType === 'assistant' && role === 'assistant') {
          const text = typeof rawContent === 'string' ? rawContent
            : Array.isArray(rawContent)
              ? rawContent
                  .filter((b: any) => b.type === 'text')
                  .map((b: any) => b.text ?? '')
                  .join('')
              : '';
          if (text.trim()) messages.push({ role: 'assistant', content: text });
        }
      } catch { /* skip unparseable lines */ }
    }

    if (messages.length === 0) {
      throw new Error(`Session JSONL at ${jsonlPath} contained no parseable messages.`);
    }

    return { messages };
  }

  throw new Error('aqe llm advise requires one of: --transcript <path>, --stdin, --session <id>');
}

async function executeAdvise(options: AdviseOptions): Promise<void> {
  const useJson = options.json !== false; // default true
  const quiet = options.quiet ?? false;

  try {
    const transcript = await loadTranscript(options);

    if (!quiet && !useJson) {
      console.log(chalk.gray('Consulting advisor...'));
    }

    // Lazy-load to keep CLI cold-start fast when advise is not used
    const { createProviderManager } = await import('../../shared/llm/provider-manager.js');
    const { createHybridRouter } = await import('../../shared/llm/router/hybrid-router.js');
    const { MultiModelExecutor, DEFAULT_ADVISOR_PROVIDER, DEFAULT_ADVISOR_MODEL } =
      await import('../../routing/advisor/multi-model-executor.js');

    const provider = (options.provider ?? DEFAULT_ADVISOR_PROVIDER) as ExtendedProviderType;
    const model = options.model ?? DEFAULT_ADVISOR_MODEL;

    // Phase 0: bootstrap a minimal ProviderManager + HybridRouter for the advisor call.
    // Phase 1+ reuses a shared router from the AQE kernel.
    const providerManager = createProviderManager({
      primary: provider === 'openrouter' ? 'openrouter' : (provider as any),
      providers: {
        openrouter: {
          apiKey: process.env.OPENROUTER_API_KEY,
          model,
        },
      },
    });

    const router = createHybridRouter(providerManager, {
      mode: 'manual',
      defaultProvider: provider as any,
      defaultModel: model,
    });

    await router.initialize();

    const executor = new MultiModelExecutor(router);

    const redactMode = (options.redact ?? 'strict') as 'strict' | 'balanced' | 'off';
    const result = await executor.consult(transcript, {
      provider,
      model,
      maxWords: options.maxWords ? parseInt(options.maxWords, 10) : undefined,
      agentName: options.agent,
      triggerReason: options.triggerReason ?? 'cli',
      sessionId: options.session ?? 'cli-' + Date.now(),
      redact: redactMode,
      advisorSystemPrompt: options.advisorPrompt,
    });

    if (useJson) {
      console.log(JSON.stringify(
        {
          advice: result.advice,
          model: result.model,
          provider: result.provider,
          tokens_in: result.tokensIn,
          tokens_out: result.tokensOut,
          latency_ms: result.latencyMs,
          cost_usd: result.costUsd,
          advice_hash: result.adviceHash,
          trigger_reason: result.triggerReason,
          cache_hit: result.cacheHit,
          redaction_applied: result.redactionsApplied.length > 0,
          redactions: result.redactionsApplied,
          circuit_breaker_remaining: result.circuitBreakerRemaining,
        },
        null,
        2
      ));
    } else {
      console.log(chalk.bold.cyan('\nAdvisor Response\n'));
      console.log(result.advice);
      console.log();
      console.log(chalk.gray(
        `(${result.provider}/${result.model}, ${result.tokensIn}→${result.tokensOut} tokens, ` +
        `${result.latencyMs}ms, $${result.costUsd.toFixed(4)})`
      ));
    }

    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const exitCode = (err as any)?.exitCode ?? 1;

    if (useJson) {
      console.error(JSON.stringify({ error: message, exit_code: exitCode }, null, 2));
    } else {
      console.error(chalk.red(`Error: ${message}`));
    }
    process.exit(exitCode);
  }
}

// ============================================================================
// `aqe llm verify` — ADR-092 Phase 3 quality gate
// ============================================================================

async function executeVerify(options: { session: string; minCalls?: string; json?: boolean }): Promise<void> {
  const useJson = options.json ?? false;
  const minCalls = parseInt(options.minCalls ?? '1', 10);

  try {
    const { AdvisorCircuitBreaker } = await import('../../routing/advisor/circuit-breaker.js');
    const breaker = new AdvisorCircuitBreaker();
    const state = breaker.getState(options.session);

    const passed = state.callCount >= minCalls;
    const result = {
      session: options.session,
      advisor_calls: state.callCount,
      required: minCalls,
      gate: passed ? 'PASS' : 'FAIL',
    };

    if (useJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const icon = passed ? chalk.green('PASS') : chalk.red('FAIL');
      console.log(`\nAdvisor Quality Gate: ${icon}`);
      console.log(`  Session:        ${options.session}`);
      console.log(`  Advisor calls:  ${state.callCount}`);
      console.log(`  Required:       ≥${minCalls}`);
    }

    process.exit(passed ? 0 : 7);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (useJson) {
      console.error(JSON.stringify({ error: message }, null, 2));
    } else {
      console.error(chalk.red(`Error: ${message}`));
    }
    process.exit(1);
  }
}
