/**
 * SFDIPOT Analyzer
 *
 * Core analyzer implementing James Bach's HTSM Product Factors framework.
 * Analyzes input against all 7 SFDIPOT categories and their subcategories.
 */

import {
  HTSMCategory,
  HTSMSubcategory,
  SFDIPOT_SUBCATEGORIES,
  CATEGORY_DESCRIPTIONS,
  StructureSubcategory,
  FunctionSubcategory,
  DataSubcategory,
  InterfacesSubcategory,
  PlatformSubcategory,
  OperationsSubcategory,
  TimeSubcategory,
  ProjectContext,
  ExtractedEntities,
  CategoryAnalysis,
  TestIdea,
  ClarifyingQuestion,
} from '../types';

export interface AnalysisInput {
  rawText: string;
  entities: ExtractedEntities;
  context: ProjectContext;
}

export interface SubcategoryAnalysis {
  subcategory: string;
  covered: boolean;
  relevance: number; // 0-1
  hints: string[];
}

export interface CategoryAnalysisResult {
  category: HTSMCategory;
  description: string;
  subcategoryAnalysis: SubcategoryAnalysis[];
  coveragePercentage: number;
  relevantEntities: string[];
  suggestedTestAreas: string[];
}

/**
 * SFDIPOT Analyzer
 *
 * Analyzes input documentation against the 7 HTSM Product Factors:
 * - Structure: What the product IS
 * - Function: What the product DOES
 * - Data: What the product PROCESSES
 * - Interfaces: How the product CONNECTS
 * - Platform: What the product DEPENDS ON
 * - Operations: How the product is USED
 * - Time: WHEN things happen
 */
export class SFDIPOTAnalyzer {
  /**
   * Analyze input against all SFDIPOT categories
   */
  analyze(input: AnalysisInput): Map<HTSMCategory, CategoryAnalysisResult> {
    const results = new Map<HTSMCategory, CategoryAnalysisResult>();

    for (const category of Object.values(HTSMCategory)) {
      const result = this.analyzeCategory(category, input);
      results.set(category, result);
    }

    return results;
  }

  /**
   * Analyze a single category
   */
  analyzeCategory(category: HTSMCategory, input: AnalysisInput): CategoryAnalysisResult {
    const subcategories = SFDIPOT_SUBCATEGORIES[category];
    const subcategoryAnalysis: SubcategoryAnalysis[] = [];

    for (const subcategory of subcategories) {
      const analysis = this.analyzeSubcategory(category, subcategory, input);
      subcategoryAnalysis.push(analysis);
    }

    const coveredCount = subcategoryAnalysis.filter(s => s.covered).length;
    const coveragePercentage = Math.round((coveredCount / subcategories.length) * 100);

    return {
      category,
      description: CATEGORY_DESCRIPTIONS[category],
      subcategoryAnalysis,
      coveragePercentage,
      relevantEntities: this.getRelevantEntities(category, input.entities),
      suggestedTestAreas: this.getSuggestedTestAreas(category, subcategoryAnalysis, input),
    };
  }

  /**
   * Analyze a specific subcategory
   */
  private analyzeSubcategory(
    category: HTSMCategory,
    subcategory: string,
    input: AnalysisInput
  ): SubcategoryAnalysis {
    const textLower = input.rawText.toLowerCase();
    const hints: string[] = [];
    let relevance = 0;

    // Get keywords for this subcategory
    const keywords = this.getSubcategoryKeywords(category, subcategory);

    // Check for keyword matches
    for (const keyword of keywords) {
      if (textLower.includes(keyword.toLowerCase())) {
        hints.push(`Found reference to "${keyword}"`);
        relevance += 0.2;
      }
    }

    // Check entity matches
    const entityMatches = this.checkEntityMatches(category, subcategory, input.entities);
    if (entityMatches.length > 0) {
      hints.push(...entityMatches.map(e => `Entity match: ${e}`));
      relevance += 0.1 * entityMatches.length;
    }

    // Domain-specific relevance boost
    relevance += this.getDomainRelevance(category, subcategory, input.context);

    // Cap relevance at 1.0
    relevance = Math.min(relevance, 1.0);

    return {
      subcategory,
      covered: relevance >= 0.3,
      relevance,
      hints,
    };
  }

  /**
   * Get keywords for a subcategory
   */
  private getSubcategoryKeywords(category: HTSMCategory, subcategory: string): string[] {
    const keywordMap: Record<string, string[]> = {
      // STRUCTURE subcategories
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Code}`]: [
        'code', 'source', 'module', 'class', 'function', 'method', 'component',
        'library', 'framework', 'package', 'dependency'
      ],
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Hardware}`]: [
        'hardware', 'device', 'server', 'cpu', 'memory', 'disk', 'network',
        'infrastructure', 'machine', 'container'
      ],
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.NonPhysical}`]: [
        'configuration', 'settings', 'environment', 'variable', 'secret',
        'credential', 'license', 'permission'
      ],
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Dependencies}`]: [
        'dependency', 'import', 'require', 'library', 'package', 'module',
        'npm', 'pip', 'maven', 'nuget'
      ],
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Documentation}`]: [
        'documentation', 'readme', 'guide', 'manual', 'spec', 'requirement',
        'wiki', 'help', 'tutorial'
      ],

      // FUNCTION subcategories
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Application}`]: [
        'feature', 'functionality', 'capability', 'use case', 'workflow',
        'process', 'operation', 'action'
      ],
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Calculation}`]: [
        'calculate', 'compute', 'formula', 'algorithm', 'math', 'sum',
        'average', 'total', 'percentage', 'rate'
      ],
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.ErrorHandling}`]: [
        'error', 'exception', 'failure', 'fallback', 'retry', 'recovery',
        'validation', 'invalid', 'corrupt'
      ],
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.StateTransition}`]: [
        'state', 'status', 'transition', 'workflow', 'step', 'stage',
        'pending', 'active', 'complete', 'cancelled'
      ],
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Security}`]: [
        'security', 'auth', 'login', 'password', 'encrypt', 'token',
        'permission', 'role', 'access', 'oauth', 'jwt'
      ],
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Startup}`]: [
        'startup', 'initialize', 'boot', 'launch', 'start', 'begin',
        'setup', 'configure', 'load'
      ],
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Shutdown}`]: [
        'shutdown', 'stop', 'terminate', 'close', 'cleanup', 'dispose',
        'exit', 'end', 'teardown'
      ],

      // DATA subcategories
      [`${HTSMCategory.DATA}-${DataSubcategory.InputOutput}`]: [
        'input', 'output', 'request', 'response', 'payload', 'body',
        'parameter', 'argument', 'return'
      ],
      [`${HTSMCategory.DATA}-${DataSubcategory.Lifecycle}`]: [
        'create', 'read', 'update', 'delete', 'crud', 'lifecycle',
        'persist', 'store', 'archive', 'expire'
      ],
      [`${HTSMCategory.DATA}-${DataSubcategory.Cardinality}`]: [
        'one', 'many', 'multiple', 'single', 'list', 'collection',
        'array', 'set', 'empty', 'null'
      ],
      [`${HTSMCategory.DATA}-${DataSubcategory.Boundaries}`]: [
        'minimum', 'maximum', 'limit', 'boundary', 'range', 'size',
        'length', 'count', 'threshold', 'constraint'
      ],
      [`${HTSMCategory.DATA}-${DataSubcategory.Persistence}`]: [
        'database', 'storage', 'persist', 'save', 'cache', 'session',
        'file', 'disk', 'memory'
      ],
      [`${HTSMCategory.DATA}-${DataSubcategory.Types}`]: [
        'string', 'number', 'boolean', 'date', 'json', 'xml', 'binary',
        'integer', 'float', 'decimal'
      ],
      [`${HTSMCategory.DATA}-${DataSubcategory.Selection}`]: [
        'filter', 'search', 'query', 'select', 'find', 'match',
        'sort', 'order', 'group'
      ],

      // INTERFACES subcategories
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.UserInterface}`]: [
        'ui', 'screen', 'page', 'form', 'button', 'input', 'display',
        'view', 'component', 'widget', 'modal'
      ],
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.ApiSdk}`]: [
        'api', 'endpoint', 'rest', 'graphql', 'sdk', 'client',
        'http', 'request', 'response'
      ],
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.SystemInterface}`]: [
        'integration', 'service', 'microservice', 'external', 'third-party',
        'vendor', 'connector'
      ],
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.ImportExport}`]: [
        'import', 'export', 'upload', 'download', 'csv', 'excel',
        'pdf', 'file', 'migrate'
      ],
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.Messaging}`]: [
        'message', 'queue', 'event', 'notification', 'email', 'sms',
        'push', 'webhook', 'pubsub'
      ],

      // PLATFORM subcategories
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.Browser}`]: [
        'browser', 'chrome', 'firefox', 'safari', 'edge', 'mobile',
        'desktop', 'responsive', 'web'
      ],
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.OperatingSystem}`]: [
        'windows', 'linux', 'macos', 'ios', 'android', 'os',
        'operating system', 'platform'
      ],
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.Hardware}`]: [
        'cpu', 'memory', 'ram', 'disk', 'gpu', 'network',
        'bandwidth', 'latency'
      ],
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.ExternalSoftware}`]: [
        'database', 'redis', 'kafka', 'elasticsearch', 'aws', 'azure',
        'gcp', 'docker', 'kubernetes'
      ],
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.InternalComponents}`]: [
        'module', 'service', 'component', 'library', 'package',
        'microservice', 'container'
      ],

      // OPERATIONS subcategories
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.CommonUse}`]: [
        'typical', 'normal', 'common', 'standard', 'regular',
        'everyday', 'primary', 'main'
      ],
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.UncommonUse}`]: [
        'edge case', 'unusual', 'rare', 'uncommon', 'special',
        'alternative', 'secondary'
      ],
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.ExtremeUse}`]: [
        'stress', 'load', 'peak', 'maximum', 'extreme', 'heavy',
        'intensive', 'scale'
      ],
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.DisfavoredUse}`]: [
        'forbidden', 'restricted', 'blocked', 'denied', 'invalid',
        'unauthorized', 'abuse'
      ],
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.Users}`]: [
        'user', 'admin', 'customer', 'client', 'operator', 'manager',
        'role', 'persona', 'actor'
      ],
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.Environment}`]: [
        'production', 'staging', 'development', 'test', 'environment',
        'deployment', 'release'
      ],

      // TIME subcategories
      [`${HTSMCategory.TIME}-${TimeSubcategory.Timing}`]: [
        'timing', 'duration', 'delay', 'latency', 'response time',
        'performance', 'speed', 'fast', 'slow'
      ],
      [`${HTSMCategory.TIME}-${TimeSubcategory.Concurrency}`]: [
        'concurrent', 'parallel', 'simultaneous', 'race', 'lock',
        'mutex', 'thread', 'async'
      ],
      [`${HTSMCategory.TIME}-${TimeSubcategory.Scheduling}`]: [
        'schedule', 'cron', 'job', 'batch', 'periodic', 'recurring',
        'timer', 'interval'
      ],
      [`${HTSMCategory.TIME}-${TimeSubcategory.Timeout}`]: [
        'timeout', 'expire', 'deadline', 'ttl', 'session', 'idle',
        'inactive'
      ],
      [`${HTSMCategory.TIME}-${TimeSubcategory.Sequencing}`]: [
        'sequence', 'order', 'step', 'workflow', 'pipeline', 'chain',
        'before', 'after', 'first', 'last'
      ],
    };

    return keywordMap[`${category}-${subcategory}`] || [];
  }

  /**
   * Check for entity matches
   */
  private checkEntityMatches(
    category: HTSMCategory,
    subcategory: string,
    entities: ExtractedEntities
  ): string[] {
    const matches: string[] = [];

    switch (category) {
      case HTSMCategory.OPERATIONS:
        if (subcategory === OperationsSubcategory.Users) {
          matches.push(...entities.actors);
        }
        break;
      case HTSMCategory.FUNCTION:
        matches.push(...entities.actions.slice(0, 3));
        break;
      case HTSMCategory.DATA:
        matches.push(...entities.dataTypes.slice(0, 3));
        break;
      case HTSMCategory.INTERFACES:
        matches.push(...entities.integrations.slice(0, 3));
        break;
    }

    return matches;
  }

  /**
   * Get domain-specific relevance boost
   */
  private getDomainRelevance(
    category: HTSMCategory,
    subcategory: string,
    context: ProjectContext
  ): number {
    const domainBoosts: Record<string, Record<string, number>> = {
      ecommerce: {
        [`${HTSMCategory.DATA}-${DataSubcategory.Boundaries}`]: 0.3,
        [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Calculation}`]: 0.3,
        [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Security}`]: 0.2,
        [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.ApiSdk}`]: 0.2,
      },
      healthcare: {
        [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Security}`]: 0.4,
        [`${HTSMCategory.DATA}-${DataSubcategory.Persistence}`]: 0.3,
        [`${HTSMCategory.TIME}-${TimeSubcategory.Timeout}`]: 0.2,
      },
      finance: {
        [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Calculation}`]: 0.4,
        [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Security}`]: 0.4,
        [`${HTSMCategory.DATA}-${DataSubcategory.Boundaries}`]: 0.3,
        [`${HTSMCategory.TIME}-${TimeSubcategory.Concurrency}`]: 0.3,
      },
    };

    const domainKey = context.domain;
    const subcatKey = `${category}-${subcategory}`;

    return domainBoosts[domainKey]?.[subcatKey] || 0;
  }

  /**
   * Get relevant entities for a category
   */
  private getRelevantEntities(category: HTSMCategory, entities: ExtractedEntities): string[] {
    switch (category) {
      case HTSMCategory.STRUCTURE:
        return [...entities.features, ...entities.integrations].slice(0, 5);
      case HTSMCategory.FUNCTION:
        return [...entities.actions, ...entities.features].slice(0, 5);
      case HTSMCategory.DATA:
        return entities.dataTypes.slice(0, 5);
      case HTSMCategory.INTERFACES:
        return entities.integrations.slice(0, 5);
      case HTSMCategory.PLATFORM:
        return entities.integrations.slice(0, 5);
      case HTSMCategory.OPERATIONS:
        return entities.actors.slice(0, 5);
      case HTSMCategory.TIME:
        return entities.actions.filter(a =>
          ['schedule', 'sync', 'async', 'wait', 'delay'].some(k => a.includes(k))
        ).slice(0, 5);
      default:
        return [];
    }
  }

  /**
   * Get suggested test areas based on analysis
   */
  private getSuggestedTestAreas(
    category: HTSMCategory,
    subcategoryAnalysis: SubcategoryAnalysis[],
    input: AnalysisInput
  ): string[] {
    const suggestions: string[] = [];
    const uncovered = subcategoryAnalysis.filter(s => !s.covered);

    // Add suggestions for covered areas with high relevance
    for (const analysis of subcategoryAnalysis.filter(s => s.covered && s.relevance >= 0.5)) {
      suggestions.push(`Test ${analysis.subcategory} functionality`);
    }

    // Add warnings for uncovered areas
    for (const analysis of uncovered.slice(0, 3)) {
      suggestions.push(`Consider testing ${analysis.subcategory} (currently uncovered)`);
    }

    return suggestions;
  }

  /**
   * Get coverage summary across all categories
   */
  getCoverageSummary(results: Map<HTSMCategory, CategoryAnalysisResult>): {
    overallCoverage: number;
    categoryCoverage: Record<HTSMCategory, number>;
    gaps: string[];
  } {
    const categoryCoverage: Record<string, number> = {};
    const gaps: string[] = [];
    let totalCoverage = 0;

    for (const [category, result] of Array.from(results.entries())) {
      categoryCoverage[category] = result.coveragePercentage;
      totalCoverage += result.coveragePercentage;

      // Identify significant gaps
      const uncovered = result.subcategoryAnalysis.filter(s => !s.covered);
      if (uncovered.length > result.subcategoryAnalysis.length / 2) {
        gaps.push(`${category}: ${uncovered.map(u => u.subcategory).join(', ')}`);
      }
    }

    return {
      overallCoverage: Math.round(totalCoverage / Object.values(HTSMCategory).length),
      categoryCoverage: categoryCoverage as Record<HTSMCategory, number>,
      gaps,
    };
  }
}
