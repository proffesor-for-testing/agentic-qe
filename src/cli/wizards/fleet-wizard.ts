/**
 * Fleet Initialization Wizard
 * ADR-041: V3 QE CLI Enhancement
 *
 * Interactive wizard for fleet initialization with step-by-step configuration.
 * Refactored to use Command Pattern for reduced complexity and better reusability.
 */

import chalk from 'chalk';
import {
  BaseWizard,
  BaseWizardResult,
  IWizardCommand,
  SingleSelectStep,
  MultiSelectStep,
  BooleanStep,
  NumericStep,
  WizardPrompt,
  WizardFormat,
  WizardSuggestions,
} from './core/index.js';

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

export interface FleetWizardResult extends BaseWizardResult {
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
// Domain Selection Step (Custom)
// ============================================================================

/**
 * Custom step for domain selection with "all" option support
 */
class DomainSelectStep extends MultiSelectStep<DDDDomain> {
  constructor(defaultDomains: DDDDomain[]) {
    const domainList = Object.keys(DOMAIN_CONFIG) as Exclude<DDDDomain, 'all'>[];

    super({
      id: 'domains',
      stepNumber: '3/6',
      title: 'Domain Focus',
      description: 'Select which DDD domains to enable (comma-separated numbers or "all")',
      instructions: 'Each domain brings specialized agents and capabilities',
      options: [
        { key: '0', value: 'all' as DDDDomain, label: 'all', description: 'Enable all 12 domains' },
        ...domainList.map((domain, index) => ({
          key: String(index + 1),
          value: domain as DDDDomain,
          label: domain,
          description: DOMAIN_CONFIG[domain].description,
          isDefaultSelected: defaultDomains.includes(domain) || defaultDomains.includes('all'),
        })),
      ],
      defaultValue: defaultDomains,
      validValues: ['all', ...domainList] as DDDDomain[],
      allowEmpty: false,
    });
  }

  async execute(context: import('./core/wizard-command.js').WizardContext): Promise<import('./core/wizard-command.js').CommandResult<DDDDomain[]>> {
    // Override to handle "all" specially
    const result = await super.execute(context);

    // If "all" is selected (value 0 or string "all"), return just ['all']
    if (result.value.includes('all')) {
      return { value: ['all'], continue: true };
    }

    return result;
  }
}

// ============================================================================
// Wizard Implementation
// ============================================================================

export class FleetInitWizard extends BaseWizard<FleetWizardOptions, FleetWizardResult> {
  constructor(options: FleetWizardOptions = {}) {
    super(options);
  }

  protected getTitle(): string {
    return 'Fleet Initialization Wizard';
  }

  protected getSubtitle(): string {
    return 'Configure your AQE v3 multi-agent fleet';
  }

  protected getConfirmationPrompt(): string {
    return 'Initialize fleet with these settings?';
  }

  protected isNonInteractive(): boolean {
    return this.options.nonInteractive ?? false;
  }

  protected getCommands(): IWizardCommand<unknown>[] {
    const patternsExist = WizardSuggestions.checkPatternsExist(this.cwd);

    return [
      // Step 1: Topology type
      new SingleSelectStep<TopologyType>({
        id: 'topology',
        stepNumber: '1/6',
        title: 'Topology Type',
        description: 'Select the coordination topology for your agent fleet',
        options: Object.entries(TOPOLOGY_CONFIG).map(([value, config], index) => ({
          key: String(index + 1),
          value: value as TopologyType,
          label: value,
          description: `${config.description}\n     Best for: ${config.recommended}`,
          isRecommended: value === 'hierarchical-mesh',
        })),
        defaultValue: this.options.defaultTopology || 'hierarchical-mesh',
        validValues: ['hierarchical', 'mesh', 'ring', 'adaptive', 'hierarchical-mesh'],
      }),

      // Step 2: Maximum agents
      new NumericStep({
        id: 'maxAgents',
        stepNumber: '2/6',
        title: 'Max agents',
        description: 'Set the maximum number of agents in your fleet (5-50). More agents = more parallelism, but higher resource usage.',
        presets: [
          { key: '1', value: 5, label: '5 agents - Minimal (development/testing)' },
          { key: '2', value: 10, label: '10 agents - Small team' },
          { key: '3', value: 15, label: '15 agents - Standard (recommended)' },
          { key: '4', value: 25, label: '25 agents - Large team' },
          { key: '5', value: 50, label: '50 agents - Maximum capacity' },
        ],
        defaultValue: this.options.defaultMaxAgents || 15,
        min: 5,
        max: 50,
      }),

      // Step 3: Domain focus
      new DomainSelectStep(this.options.defaultDomains || ['all']),

      // Step 4: Memory backend
      new SingleSelectStep<MemoryBackend>({
        id: 'memoryBackend',
        stepNumber: '4/6',
        title: 'Memory Backend',
        description: 'Select the memory storage backend for agent coordination',
        options: Object.entries(MEMORY_BACKEND_CONFIG).map(([value, config], index) => ({
          key: String(index + 1),
          value: value as MemoryBackend,
          label: value,
          description: `${config.description}\n     Features: ${config.features.join(', ')}`,
          isRecommended: value === 'hybrid',
        })),
        defaultValue: this.options.defaultMemoryBackend || 'hybrid',
        validValues: ['sqlite', 'agentdb', 'hybrid'],
      }),

      // Step 5: Lazy loading
      new BooleanStep({
        id: 'lazyLoading',
        stepNumber: '5/6',
        title: 'Enable lazy loading',
        description: 'Enable lazy loading for agents and domains',
        additionalInfo: 'Reduces startup time by loading components on-demand',
        defaultValue: this.options.defaultLazyLoading ?? true,
      }),

      // Step 6: Pre-trained patterns
      new BooleanStep({
        id: 'loadPatterns',
        stepNumber: '6/6',
        title: 'Load pre-trained patterns',
        description: 'Load pre-trained intelligence patterns from repository',
        additionalInfo: patternsExist
          ? 'Pre-trained patterns detected in project'
          : 'No pre-trained patterns found (will start fresh)',
        defaultValue: this.options.defaultLoadPatterns ?? patternsExist,
      }),
    ];
  }

  protected buildResult(results: Record<string, unknown>): FleetWizardResult {
    return {
      topology: results.topology as TopologyType,
      maxAgents: results.maxAgents as number,
      domains: results.domains as DDDDomain[],
      memoryBackend: results.memoryBackend as MemoryBackend,
      lazyLoading: results.lazyLoading as boolean,
      loadPatterns: results.loadPatterns as boolean,
      cancelled: false,
    };
  }

  protected printSummary(result: FleetWizardResult): void {
    WizardPrompt.printSummaryHeader();

    WizardPrompt.printSummaryField('Topology', result.topology);
    WizardPrompt.printSummaryField('Max Agents', String(result.maxAgents));

    // Format domains display
    const domainsDisplay = result.domains.includes('all')
      ? 'all (12 domains)'
      : result.domains.join(', ');
    WizardPrompt.printSummaryField('Domains', domainsDisplay);

    WizardPrompt.printSummaryField('Memory Backend', result.memoryBackend);
    WizardPrompt.printSummaryField('Lazy Loading', WizardFormat.enabledDisabled(result.lazyLoading));
    WizardPrompt.printSummaryField('Load Patterns', WizardFormat.yesNo(result.loadPatterns));

    // Show derived information
    const topologyConfig = TOPOLOGY_CONFIG[result.topology];
    const memoryConfig = MEMORY_BACKEND_CONFIG[result.memoryBackend];

    const derivedSettings: Record<string, string> = {
      'Topology style': topologyConfig.description,
      'Memory features': memoryConfig.features.slice(0, 2).join(', '),
    };

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
      const typesArray = Array.from(agentTypes);
      derivedSettings['Agent types'] = typesArray.slice(0, 4).join(', ') + (typesArray.length > 4 ? '...' : '');
    }

    WizardPrompt.printDerivedSettings(derivedSettings);
  }

  protected getDefaults(): FleetWizardResult {
    return {
      topology: this.options.defaultTopology || 'hierarchical-mesh',
      maxAgents: this.options.defaultMaxAgents || 15,
      domains: this.options.defaultDomains || ['all'],
      memoryBackend: this.options.defaultMemoryBackend || 'hybrid',
      lazyLoading: this.options.defaultLazyLoading ?? true,
      loadPatterns: this.options.defaultLoadPatterns ?? false,
      cancelled: false,
    };
  }

  protected getCancelled(): FleetWizardResult {
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
