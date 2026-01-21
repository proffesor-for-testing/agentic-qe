/**
 * Agentic QE v3 - MCP Tool Registry
 * Manages tool registration, lazy loading, and dispatch
 */

import { v4 as uuidv4 } from 'uuid';
import { DomainName, ALL_DOMAINS } from '../shared/types';
import {
  ToolDefinition,
  ToolHandler,
  ToolResult,
  ToolCategory,
  ToolResultMetadata,
} from './types';

// ============================================================================
// Types
// ============================================================================

interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
  loaded: boolean;
  loadCount: number;
  lastUsed?: Date;
}

export interface ToolStats {
  totalTools: number;
  loadedTools: number;
  byCategory: Record<ToolCategory, number>;
  byDomain: Partial<Record<DomainName, number>>;
  invocations: number;
  errors: number;
}

// ============================================================================
// Domain Keywords for Lazy Loading Detection
// ============================================================================

const DOMAIN_KEYWORDS: Record<DomainName, string[]> = {
  'test-generation': [
    'test', 'generate', 'unit test', 'test case', 'tdd', 'spec', 'assertion',
    'mock', 'stub', 'fixture', 'describe', 'it(', 'expect(', 'jest', 'vitest',
    'pytest', 'junit', 'mocha',
  ],
  'test-execution': [
    'run test', 'execute test', 'test runner', 'parallel test', 'retry',
    'test suite', 'test report', 'CI/CD', 'continuous integration',
  ],
  'coverage-analysis': [
    'coverage', 'line coverage', 'branch coverage', 'function coverage',
    'uncovered', 'gap', 'istanbul', 'nyc', 'c8', 'lcov',
  ],
  'quality-assessment': [
    'quality', 'quality gate', 'code quality', 'technical debt', 'complexity',
    'maintainability', 'metric', 'sonar', 'lint',
  ],
  'defect-intelligence': [
    'defect', 'bug', 'predict', 'regression', 'risk', 'hotspot', 'prone',
  ],
  'requirements-validation': [
    'requirement', 'bdd', 'gherkin', 'cucumber', 'acceptance', 'user story',
    'feature file', 'scenario', 'given when then',
  ],
  'code-intelligence': [
    'semantic', 'knowledge graph', 'code search', 'symbol', 'reference',
    'call graph', 'dependency', 'impact analysis', 'ast',
  ],
  'security-compliance': [
    'security', 'vulnerability', 'owasp', 'sast', 'dast', 'injection', 'xss',
    'csrf', 'compliance', 'gdpr', 'hipaa', 'soc2', 'pci',
  ],
  'contract-testing': [
    'contract', 'api contract', 'pact', 'consumer driven', 'provider',
    'schema', 'breaking change', 'backward compatible',
  ],
  'visual-accessibility': [
    'visual', 'screenshot', 'accessibility', 'a11y', 'wcag', 'aria',
    'screen reader', 'color contrast', 'keyboard navigation',
  ],
  'chaos-resilience': [
    'chaos', 'resilience', 'fault injection', 'latency', 'failure',
    'circuit breaker', 'recovery', 'load test', 'stress test',
  ],
  'learning-optimization': [
    'learning', 'optimize', 'ml', 'pattern', 'improve', 'recommendation',
    'adaptive', 'experience', 'reinforcement',
  ],
  'coordination': [
    'coordinate', 'orchestrate', 'swarm', 'fleet', 'distributed', 'consensus',
    'agent', 'multi-agent', 'queen', 'worker', 'byzantine', 'raft',
  ],
};

// ============================================================================
// Tool Registry Implementation
// ============================================================================

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();
  private readonly categoryTools = new Map<ToolCategory, Set<string>>();
  private readonly domainTools = new Map<DomainName, Set<string>>();
  private stats: ToolStats = {
    totalTools: 0,
    loadedTools: 0,
    byCategory: {} as Record<ToolCategory, number>,
    byDomain: {},
    invocations: 0,
    errors: 0,
  };

  constructor() {
    // Initialize category sets
    const categories: ToolCategory[] = [
      'core', 'task', 'agent', 'domain', 'coordination', 'memory', 'learning',
    ];
    for (const category of categories) {
      this.categoryTools.set(category, new Set());
      this.stats.byCategory[category] = 0;
    }

    // Initialize domain sets
    for (const domain of ALL_DOMAINS) {
      this.domainTools.set(domain, new Set());
      this.stats.byDomain[domain] = 0;
    }
  }

  /**
   * Register a tool
   */
  register(definition: ToolDefinition, handler: ToolHandler): void {
    const existing = this.tools.get(definition.name);
    if (existing) {
      // Update existing tool
      existing.definition = definition;
      existing.handler = handler;
      return;
    }

    // Register new tool
    const tool: RegisteredTool = {
      definition,
      handler,
      loaded: !definition.lazyLoad,
      loadCount: 0,
    };

    this.tools.set(definition.name, tool);
    this.stats.totalTools++;

    // Track by category
    this.categoryTools.get(definition.category)?.add(definition.name);
    this.stats.byCategory[definition.category]++;

    // Track by domain if specified
    if (definition.domain) {
      this.domainTools.get(definition.domain)?.add(definition.name);
      this.stats.byDomain[definition.domain] =
        (this.stats.byDomain[definition.domain] || 0) + 1;
    }

    if (!definition.lazyLoad) {
      this.stats.loadedTools++;
    }
  }

  /**
   * Register multiple tools
   */
  registerAll(tools: Array<{ definition: ToolDefinition; handler: ToolHandler }>): void {
    for (const { definition, handler } of tools) {
      this.register(definition, handler);
    }
  }

  /**
   * Get a tool by name
   */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all tool definitions
   */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /**
   * Get loaded tool definitions
   */
  getLoadedDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values())
      .filter((t) => t.loaded)
      .map((t) => t.definition);
  }

  /**
   * Get tools by category
   */
  getByCategory(category: ToolCategory): ToolDefinition[] {
    const names = this.categoryTools.get(category);
    if (!names) return [];

    return Array.from(names)
      .map((name) => this.tools.get(name)?.definition)
      .filter((d): d is ToolDefinition => d !== undefined);
  }

  /**
   * Get tools by domain
   */
  getByDomain(domain: DomainName): ToolDefinition[] {
    const names = this.domainTools.get(domain);
    if (!names) return [];

    return Array.from(names)
      .map((name) => this.tools.get(name)?.definition)
      .filter((d): d is ToolDefinition => d !== undefined);
  }

  /**
   * Invoke a tool
   */
  async invoke<TParams extends Record<string, unknown> = Record<string, unknown>, TResult = unknown>(
    name: string,
    params: TParams
  ): Promise<ToolResult<TResult>> {
    const startTime = Date.now();
    const requestId = uuidv4();

    const tool = this.tools.get(name);
    if (!tool) {
      this.stats.errors++;
      return {
        success: false,
        error: `Tool not found: ${name}`,
        metadata: this.createMetadata(startTime, requestId),
      };
    }

    // Mark as loaded on first use
    if (!tool.loaded) {
      tool.loaded = true;
      this.stats.loadedTools++;
    }
    tool.loadCount++;
    tool.lastUsed = new Date();
    this.stats.invocations++;

    try {
      const result = await tool.handler(params);
      return {
        ...result,
        metadata: {
          ...result.metadata,
          ...this.createMetadata(startTime, requestId, tool.definition.domain),
        },
      } as ToolResult<TResult>;
    } catch (error) {
      this.stats.errors++;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: this.createMetadata(startTime, requestId, tool.definition.domain),
      };
    }
  }

  /**
   * Load tools for domains detected in a message
   */
  loadForMessage(message: string): DomainName[] {
    const detectedDomains = this.detectDomainsFromMessage(message);

    for (const domain of detectedDomains) {
      this.loadDomain(domain);
    }

    return detectedDomains;
  }

  /**
   * Load all tools for a domain
   */
  loadDomain(domain: DomainName): void {
    const names = this.domainTools.get(domain);
    if (!names) return;

    for (const name of names) {
      const tool = this.tools.get(name);
      if (tool && !tool.loaded) {
        tool.loaded = true;
        this.stats.loadedTools++;
      }
    }
  }

  /**
   * Load all tools in a category
   */
  loadCategory(category: ToolCategory): void {
    const names = this.categoryTools.get(category);
    if (!names) return;

    for (const name of names) {
      const tool = this.tools.get(name);
      if (tool && !tool.loaded) {
        tool.loaded = true;
        this.stats.loadedTools++;
      }
    }
  }

  /**
   * Detect domains from message content
   */
  detectDomainsFromMessage(message: string): DomainName[] {
    const lowerMessage = message.toLowerCase();
    const detected = new Set<DomainName>();

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerMessage.includes(keyword.toLowerCase())) {
          detected.add(domain as DomainName);
          break;
        }
      }
    }

    return Array.from(detected);
  }

  /**
   * Get registry statistics
   */
  getStats(): ToolStats {
    return { ...this.stats };
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    for (const set of this.categoryTools.values()) {
      set.clear();
    }
    for (const set of this.domainTools.values()) {
      set.clear();
    }
    this.stats = {
      totalTools: 0,
      loadedTools: 0,
      byCategory: {} as Record<ToolCategory, number>,
      byDomain: {},
      invocations: 0,
      errors: 0,
    };
  }

  /**
   * Create result metadata
   */
  private createMetadata(
    startTime: number,
    requestId: string,
    domain?: DomainName
  ): ToolResultMetadata {
    return {
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      requestId,
      domain,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}
