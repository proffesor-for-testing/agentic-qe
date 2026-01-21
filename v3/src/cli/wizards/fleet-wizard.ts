/**
 * Fleet Initialization Wizard
 * ADR-041: V3 QE CLI Enhancement
 *
 * Interactive wizard for fleet initialization with step-by-step configuration.
 * Prompts for topology, max agents, domain focus, memory backend, lazy loading,
 * and pre-trained pattern loading.
 */

import { createInterface } from 'readline';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import * as readline from 'readline';

// ============================================================================
// Types
// ============================================================================

export interface FleetWizardOptions {
  /** Non-interactive mode with defaults */
  nonInteractive?: boolean;
  /** Default topology type */
  defaultTopology?: TopologyType;
  /** Default maximum agent count */
  defaultMaxAgents?: number;
  /** Default domain focus */
  defaultDomains?: DDDDomain[];
  /** Default memory backend */
  defaultMemoryBackend?: MemoryBackend;
  /** Default lazy loading setting */
  defaultLazyLoading?: boolean;
  /** Default pre-trained patterns setting */
  defaultLoadPatterns?: boolean;
}

export type TopologyType = 'hierarchical' | 'mesh' | 'ring' | 'adaptive' | 'hierarchical-mesh';

export type DDDDomain =
  | 'test-generation'
  | 'test-execution'
  | 'coverage-analysis'
  | 'quality-assessment'
  | 'defect-intelligence'
  | 'requirements-validation'
  | 'code-intelligence'
  | 'security-compliance'
  | 'contract-testing'
  | 'visual-accessibility'
  | 'chaos-resilience'
  | 'learning-optimization'
  | 'all';

export type MemoryBackend = 'sqlite' | 'agentdb' | 'hybrid';

export interface FleetWizardResult {
  /** Selected topology type */
  topology: TopologyType;
  /** Maximum number of agents */
  maxAgents: number;
  /** Selected DDD domains */
  domains: DDDDomain[];
  /** Memory backend type */
  memoryBackend: MemoryBackend;
  /** Whether to enable lazy loading */
  lazyLoading: boolean;
  /** Whether to load pre-trained patterns */
  loadPatterns: boolean;
  /** Whether the wizard was cancelled */
  cancelled: boolean;
}

// ============================================================================
// Domain Configuration
// ============================================================================

const DOMAIN_CONFIG: Record<Exclude<DDDDomain, 'all'>, { description: string; agentTypes: string[] }> = {
  'test-generation': {
    description: 'AI-powered test creation and generation',
    agentTypes: ['test-generator', 'mutation-tester'],
  },
  'test-execution': {
    description: 'Parallel execution, retry, flaky detection',
    agentTypes: ['test-executor', 'flaky-detector'],
  },
  'coverage-analysis': {
    description: 'Sublinear O(log n) gap detection',
    agentTypes: ['coverage-analyzer', 'gap-detector'],
  },
  'quality-assessment': {
    description: 'Quality gates and deployment decisions',
    agentTypes: ['quality-gate', 'deployment-validator'],
  },
  'defect-intelligence': {
    description: 'Prediction and root cause analysis',
    agentTypes: ['defect-predictor', 'rca-analyst'],
  },
  'requirements-validation': {
    description: 'BDD scenarios and testability scoring',
    agentTypes: ['requirements-validator', 'bdd-generator'],
  },
  'code-intelligence': {
    description: 'Knowledge graph and semantic search',
    agentTypes: ['code-indexer', 'semantic-searcher'],
  },
  'security-compliance': {
    description: 'SAST/DAST and compliance scanning',
    agentTypes: ['security-scanner', 'compliance-auditor'],
  },
  'contract-testing': {
    description: 'API contracts and GraphQL validation',
    agentTypes: ['contract-validator', 'api-tester'],
  },
  'visual-accessibility': {
    description: 'Visual regression and a11y testing',
    agentTypes: ['visual-tester', 'a11y-scanner'],
  },
  'chaos-resilience': {
    description: 'Chaos engineering and load testing',
    agentTypes: ['chaos-engineer', 'load-tester'],
  },
  'learning-optimization': {
    description: 'Cross-domain learning and optimization',
    agentTypes: ['learning-optimizer', 'pattern-recognizer'],
  },
};

const TOPOLOGY_CONFIG: Record<TopologyType, { description: string; recommended: string }> = {
  hierarchical: {
    description: 'Queen-led hierarchy with direct worker control',
    recommended: 'Large teams, clear task delegation',
  },
  mesh: {
    description: 'Fully connected peer network for collaboration',
    recommended: 'Small teams, equal peer collaboration',
  },
  ring: {
    description: 'Sequential message passing in a ring',
    recommended: 'Pipeline workflows, sequential processing',
  },
  adaptive: {
    description: 'Dynamic topology based on workload',
    recommended: 'Variable workloads, auto-scaling needs',
  },
  'hierarchical-mesh': {
    description: 'Hybrid combining hierarchy with peer connections',
    recommended: 'Most projects (best of both worlds)',
  },
};

const MEMORY_BACKEND_CONFIG: Record<MemoryBackend, { description: string; features: string[] }> = {
  sqlite: {
    description: 'SQLite-based persistent storage',
    features: ['Cross-platform', 'No setup required', 'Good for development'],
  },
  agentdb: {
    description: 'AgentDB with HNSW vector indexing',
    features: ['150x-12,500x faster search', 'Vector embeddings', 'Semantic queries'],
  },
  hybrid: {
    description: 'Combined SQLite + AgentDB',
    features: ['Best of both', 'Fallback support', 'Production recommended'],
  },
};

// ============================================================================
// Wizard Implementation
// ============================================================================

export class FleetInitWizard {
  private options: FleetWizardOptions;
  private cwd: string;

  constructor(options: FleetWizardOptions = {}) {
    this.options = options;
    this.cwd = process.cwd();
  }

  /**
   * Run the interactive wizard
   */
  async run(): Promise<FleetWizardResult> {
    // Non-interactive mode returns defaults
    if (this.options.nonInteractive) {
      return this.getDefaults();
    }

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      // Print header
      this.printHeader();

      // Step 1: Topology type
      const topology = await this.promptTopology(rl);

      // Step 2: Maximum agents
      const maxAgents = await this.promptMaxAgents(rl);

      // Step 3: Domain focus
      const domains = await this.promptDomains(rl);

      // Step 4: Memory backend
      const memoryBackend = await this.promptMemoryBackend(rl);

      // Step 5: Lazy loading
      const lazyLoading = await this.promptLazyLoading(rl);

      // Step 6: Pre-trained patterns
      const loadPatterns = await this.promptLoadPatterns(rl);

      // Print summary
      const result: FleetWizardResult = {
        topology,
        maxAgents,
        domains,
        memoryBackend,
        lazyLoading,
        loadPatterns,
        cancelled: false,
      };

      this.printSummary(result);

      // Confirm
      const confirmed = await this.promptConfirmation(rl);
      if (!confirmed) {
        return this.getCancelled();
      }

      return result;
    } finally {
      rl.close();
    }
  }

  /**
   * Print wizard header
   */
  private printHeader(): void {
    console.log('');
    console.log(chalk.blue('========================================'));
    console.log(chalk.blue.bold('      Fleet Initialization Wizard'));
    console.log(chalk.blue('========================================'));
    console.log(chalk.gray('Configure your AQE v3 multi-agent fleet'));
    console.log(chalk.gray('Press Ctrl+C to cancel at any time'));
    console.log('');
  }

  /**
   * Step 1: Prompt for topology type
   */
  private async promptTopology(rl: readline.Interface): Promise<TopologyType> {
    console.log(chalk.cyan('Step 1/6: Topology Type'));
    console.log(chalk.gray('Select the coordination topology for your agent fleet'));
    console.log('');

    const options: Array<{ key: string; value: TopologyType }> = [
      { key: '1', value: 'hierarchical' },
      { key: '2', value: 'mesh' },
      { key: '3', value: 'ring' },
      { key: '4', value: 'adaptive' },
      { key: '5', value: 'hierarchical-mesh' },
    ];

    const defaultValue = this.options.defaultTopology || 'hierarchical-mesh';

    options.forEach(opt => {
      const config = TOPOLOGY_CONFIG[opt.value];
      const marker = opt.value === defaultValue ? chalk.green(' (recommended)') : '';
      console.log(chalk.white(`  ${opt.key}. ${opt.value}${marker}`));
      console.log(chalk.gray(`     ${config.description}`));
      console.log(chalk.gray(`     Best for: ${config.recommended}`));
    });
    console.log('');

    const input = await this.prompt(rl, `Select topology [${chalk.gray(defaultValue)}]: `);

    const value = input.trim();
    if (!value) return defaultValue;

    // Check if input is a number
    const numInput = parseInt(value, 10);
    if (numInput >= 1 && numInput <= options.length) {
      return options[numInput - 1].value;
    }

    // Check if input is a valid topology
    const validTopologies: TopologyType[] = ['hierarchical', 'mesh', 'ring', 'adaptive', 'hierarchical-mesh'];
    if (validTopologies.includes(value as TopologyType)) {
      return value as TopologyType;
    }

    console.log(chalk.yellow(`  Invalid input, using default: ${defaultValue}`));
    return defaultValue;
  }

  /**
   * Step 2: Prompt for maximum agent count
   */
  private async promptMaxAgents(rl: readline.Interface): Promise<number> {
    console.log('');
    console.log(chalk.cyan('Step 2/6: Maximum Agent Count'));
    console.log(chalk.gray('Set the maximum number of agents in your fleet (5-50)'));
    console.log(chalk.gray('More agents = more parallelism, but higher resource usage'));
    console.log('');

    const presets = [
      { key: '1', value: 5, label: '5 agents - Minimal (development/testing)' },
      { key: '2', value: 10, label: '10 agents - Small team' },
      { key: '3', value: 15, label: '15 agents - Standard (recommended)' },
      { key: '4', value: 25, label: '25 agents - Large team' },
      { key: '5', value: 50, label: '50 agents - Maximum capacity' },
    ];

    const defaultValue = this.options.defaultMaxAgents || 15;

    presets.forEach(preset => {
      const marker = preset.value === defaultValue ? chalk.green(' (default)') : '';
      console.log(chalk.gray(`  ${preset.key}. ${preset.label}${marker}`));
    });
    console.log(chalk.gray('  Or enter a custom number (5-50)'));
    console.log('');

    const input = await this.prompt(rl, `Max agents [${chalk.gray(String(defaultValue))}]: `);

    const value = input.trim();
    if (!value) return defaultValue;

    // Check if it's a preset number (1-5)
    const presetIndex = parseInt(value, 10);
    if (presetIndex >= 1 && presetIndex <= presets.length) {
      return presets[presetIndex - 1].value;
    }

    // Check if it's a valid custom number
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 5 && numValue <= 50) {
      return numValue;
    }

    console.log(chalk.yellow(`  Invalid input (must be 5-50), using default: ${defaultValue}`));
    return defaultValue;
  }

  /**
   * Step 3: Prompt for domain focus
   */
  private async promptDomains(rl: readline.Interface): Promise<DDDDomain[]> {
    console.log('');
    console.log(chalk.cyan('Step 3/6: Domain Focus'));
    console.log(chalk.gray('Select which DDD domains to enable (comma-separated numbers or "all")'));
    console.log(chalk.gray('Each domain brings specialized agents and capabilities'));
    console.log('');

    const domainList = Object.keys(DOMAIN_CONFIG) as Exclude<DDDDomain, 'all'>[];
    const defaultDomains = this.options.defaultDomains || ['all'];

    console.log(chalk.white(`  0. ${chalk.green('all')} - Enable all 12 domains`));
    domainList.forEach((domain, index) => {
      const config = DOMAIN_CONFIG[domain];
      const isDefault = defaultDomains.includes(domain) || defaultDomains.includes('all');
      const marker = isDefault ? chalk.green(' *') : '';
      console.log(chalk.white(`  ${index + 1}. ${domain}${marker}`));
      console.log(chalk.gray(`     ${config.description}`));
    });
    console.log('');
    console.log(chalk.gray('  * = included in default selection'));
    console.log('');

    const defaultDisplay = defaultDomains.includes('all') ? 'all' : defaultDomains.join(',');
    const input = await this.prompt(rl, `Select domains [${chalk.gray(defaultDisplay)}]: `);

    const value = input.trim().toLowerCase();
    if (!value) return defaultDomains;

    // Handle "all" or "0"
    if (value === 'all' || value === '0') {
      return ['all'];
    }

    // Parse comma-separated numbers/names
    const parts = value.split(',').map(p => p.trim()).filter(p => p.length > 0);
    const result: DDDDomain[] = [];

    for (const part of parts) {
      const numInput = parseInt(part, 10);
      if (numInput === 0) {
        return ['all'];
      }
      if (numInput >= 1 && numInput <= domainList.length) {
        result.push(domainList[numInput - 1]);
      } else if (domainList.includes(part as Exclude<DDDDomain, 'all'>)) {
        result.push(part as DDDDomain);
      }
    }

    if (result.length === 0) {
      console.log(chalk.yellow(`  Invalid input, using default: ${defaultDisplay}`));
      return defaultDomains;
    }

    // Remove duplicates
    return [...new Set(result)];
  }

  /**
   * Step 4: Prompt for memory backend
   */
  private async promptMemoryBackend(rl: readline.Interface): Promise<MemoryBackend> {
    console.log('');
    console.log(chalk.cyan('Step 4/6: Memory Backend'));
    console.log(chalk.gray('Select the memory storage backend for agent coordination'));
    console.log('');

    const options: Array<{ key: string; value: MemoryBackend }> = [
      { key: '1', value: 'sqlite' },
      { key: '2', value: 'agentdb' },
      { key: '3', value: 'hybrid' },
    ];

    const defaultValue = this.options.defaultMemoryBackend || 'hybrid';

    options.forEach(opt => {
      const config = MEMORY_BACKEND_CONFIG[opt.value];
      const marker = opt.value === defaultValue ? chalk.green(' (recommended)') : '';
      console.log(chalk.white(`  ${opt.key}. ${opt.value}${marker}`));
      console.log(chalk.gray(`     ${config.description}`));
      console.log(chalk.gray(`     Features: ${config.features.join(', ')}`));
    });
    console.log('');

    const input = await this.prompt(rl, `Select memory backend [${chalk.gray(defaultValue)}]: `);

    const value = input.trim();
    if (!value) return defaultValue;

    // Check if input is a number
    const numInput = parseInt(value, 10);
    if (numInput >= 1 && numInput <= options.length) {
      return options[numInput - 1].value;
    }

    // Check if input is a valid backend
    const validBackends: MemoryBackend[] = ['sqlite', 'agentdb', 'hybrid'];
    if (validBackends.includes(value as MemoryBackend)) {
      return value as MemoryBackend;
    }

    console.log(chalk.yellow(`  Invalid input, using default: ${defaultValue}`));
    return defaultValue;
  }

  /**
   * Step 5: Prompt for lazy loading
   */
  private async promptLazyLoading(rl: readline.Interface): Promise<boolean> {
    console.log('');
    console.log(chalk.cyan('Step 5/6: Lazy Loading'));
    console.log(chalk.gray('Enable lazy loading for agents and domains'));
    console.log(chalk.gray('Reduces startup time by loading components on-demand'));
    console.log('');

    const defaultValue = this.options.defaultLazyLoading !== undefined
      ? this.options.defaultLazyLoading
      : true;

    const defaultStr = defaultValue ? 'Y/n' : 'y/N';
    const input = await this.prompt(rl, `Enable lazy loading? [${chalk.gray(defaultStr)}]: `);

    const value = input.trim().toLowerCase();

    if (value === '') {
      return defaultValue;
    }

    if (value === 'n' || value === 'no') {
      return false;
    }
    if (value === 'y' || value === 'yes') {
      return true;
    }

    return defaultValue;
  }

  /**
   * Step 6: Prompt for pre-trained pattern loading
   */
  private async promptLoadPatterns(rl: readline.Interface): Promise<boolean> {
    console.log('');
    console.log(chalk.cyan('Step 6/6: Pre-trained Patterns'));
    console.log(chalk.gray('Load pre-trained intelligence patterns from repository'));
    console.log(chalk.gray('Enables faster learning with existing knowledge base'));
    console.log('');

    // Check if patterns exist
    const patternsExist = this.checkPatternsExist();
    if (patternsExist) {
      console.log(chalk.green('  Pre-trained patterns detected in project'));
    } else {
      console.log(chalk.yellow('  No pre-trained patterns found (will start fresh)'));
    }
    console.log('');

    const defaultValue = this.options.defaultLoadPatterns !== undefined
      ? this.options.defaultLoadPatterns
      : patternsExist;

    const defaultStr = defaultValue ? 'Y/n' : 'y/N';
    const input = await this.prompt(rl, `Load pre-trained patterns? [${chalk.gray(defaultStr)}]: `);

    const value = input.trim().toLowerCase();

    if (value === '') {
      return defaultValue;
    }

    if (value === 'n' || value === 'no' || value === 'skip') {
      return false;
    }
    if (value === 'y' || value === 'yes' || value === 'load') {
      return true;
    }

    return defaultValue;
  }

  /**
   * Prompt for final confirmation
   */
  private async promptConfirmation(rl: readline.Interface): Promise<boolean> {
    console.log('');
    const input = await this.prompt(
      rl,
      `${chalk.green('Initialize fleet with these settings?')} [${chalk.gray('Y/n')}]: `
    );

    const value = input.trim().toLowerCase();
    if (value === 'n' || value === 'no') {
      console.log(chalk.yellow('\nWizard cancelled.'));
      return false;
    }
    return true;
  }

  /**
   * Print configuration summary
   */
  private printSummary(result: FleetWizardResult): void {
    console.log('');
    console.log(chalk.blue('========================================'));
    console.log(chalk.blue.bold('       Configuration Summary'));
    console.log(chalk.blue('========================================'));
    console.log('');

    console.log(chalk.white(`  Topology:         ${chalk.cyan(result.topology)}`));
    console.log(chalk.white(`  Max Agents:       ${chalk.cyan(result.maxAgents)}`));

    // Format domains display
    const domainsDisplay = result.domains.includes('all')
      ? 'all (12 domains)'
      : result.domains.join(', ');
    console.log(chalk.white(`  Domains:          ${chalk.cyan(domainsDisplay)}`));

    console.log(chalk.white(`  Memory Backend:   ${chalk.cyan(result.memoryBackend)}`));
    console.log(chalk.white(`  Lazy Loading:     ${chalk.cyan(result.lazyLoading ? 'Enabled' : 'Disabled')}`));
    console.log(chalk.white(`  Load Patterns:    ${chalk.cyan(result.loadPatterns ? 'Yes' : 'No')}`));

    // Show derived information
    const topologyConfig = TOPOLOGY_CONFIG[result.topology];
    const memoryConfig = MEMORY_BACKEND_CONFIG[result.memoryBackend];

    console.log('');
    console.log(chalk.gray('  Derived configuration:'));
    console.log(chalk.gray(`    Topology style: ${topologyConfig.description}`));
    console.log(chalk.gray(`    Memory features: ${memoryConfig.features.slice(0, 2).join(', ')}`));

    // Estimate agent types if domains are specified
    if (!result.domains.includes('all')) {
      const agentTypes = new Set<string>();
      for (const domain of result.domains) {
        if (domain !== 'all') {
          const config = DOMAIN_CONFIG[domain as Exclude<DDDDomain, 'all'>];
          if (config) {
            config.agentTypes.forEach(t => agentTypes.add(t));
          }
        }
      }
      console.log(chalk.gray(`    Agent types: ${Array.from(agentTypes).slice(0, 4).join(', ')}${agentTypes.size > 4 ? '...' : ''}`));
    }
    console.log('');
  }

  /**
   * Generic prompt helper
   */
  private prompt(rl: readline.Interface, question: string): Promise<string> {
    return new Promise(resolve => {
      rl.question(question, answer => {
        resolve(answer);
      });
    });
  }

  /**
   * Check if pre-trained patterns exist in the project
   */
  private checkPatternsExist(): boolean {
    const patternLocations = [
      join(this.cwd, '.agentic-qe', 'patterns'),
      join(this.cwd, '.agentic-qe', 'memory.db'),
      join(this.cwd, '.aqe', 'patterns'),
      join(this.cwd, 'data', 'patterns'),
    ];

    return patternLocations.some(loc => existsSync(loc));
  }

  /**
   * Get default result for non-interactive mode
   */
  private getDefaults(): FleetWizardResult {
    return {
      topology: this.options.defaultTopology || 'hierarchical-mesh',
      maxAgents: this.options.defaultMaxAgents || 15,
      domains: this.options.defaultDomains || ['all'],
      memoryBackend: this.options.defaultMemoryBackend || 'hybrid',
      lazyLoading: this.options.defaultLazyLoading !== undefined
        ? this.options.defaultLazyLoading
        : true,
      loadPatterns: this.options.defaultLoadPatterns !== undefined
        ? this.options.defaultLoadPatterns
        : false,
      cancelled: false,
    };
  }

  /**
   * Get cancelled result
   */
  private getCancelled(): FleetWizardResult {
    return {
      topology: 'hierarchical-mesh',
      maxAgents: 15,
      domains: ['all'],
      memoryBackend: 'hybrid',
      lazyLoading: true,
      loadPatterns: false,
      cancelled: true,
    };
  }
}

/**
 * Factory function to create and run the fleet wizard
 */
export async function runFleetInitWizard(
  options: FleetWizardOptions = {}
): Promise<FleetWizardResult> {
  const wizard = new FleetInitWizard(options);
  return wizard.run();
}

/**
 * Get topology configuration for programmatic access
 */
export function getTopologyConfig(topology: TopologyType): {
  description: string;
  recommended: string;
} {
  return TOPOLOGY_CONFIG[topology];
}

/**
 * Get domain configuration for programmatic access
 */
export function getDomainConfig(domain: Exclude<DDDDomain, 'all'>): {
  description: string;
  agentTypes: string[];
} {
  return DOMAIN_CONFIG[domain];
}

/**
 * Get memory backend configuration for programmatic access
 */
export function getMemoryBackendConfig(backend: MemoryBackend): {
  description: string;
  features: string[];
} {
  return MEMORY_BACKEND_CONFIG[backend];
}

/**
 * Get all available domains
 */
export function getAllDomains(): Exclude<DDDDomain, 'all'>[] {
  return Object.keys(DOMAIN_CONFIG) as Exclude<DDDDomain, 'all'>[];
}

/**
 * Export types for external use
 */
export type { FleetWizardOptions as Options };
