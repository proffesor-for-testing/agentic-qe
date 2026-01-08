/**
 * Agentic QE v3 - Code Intelligence Index Protocol
 * Cross-domain coordination for knowledge graph indexing
 *
 * Triggers: Code change, hourly, manual, git-commit
 * Participants: Code Intelligence, Semantic Analyzer, Dependency Mapper
 * Actions: Update KG, analyze impact, index dependencies
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Result,
  ok,
  err,
  DomainName,
  Severity,
} from '../../shared/types';
import { createEvent } from '../../shared/events/domain-events';
import { QEKernel } from '../../kernel/interfaces';
import {
  CodeIntelligenceAPI,
  IndexRequest,
  IndexResult,
  ImpactAnalysis,
  DependencyMap,
} from '../../domains/code-intelligence/interfaces';
import { GitAnalyzer } from '../../shared/git';
import { listFiles } from '../../shared/io';

// ============================================================================
// Protocol Types
// ============================================================================

/**
 * Trigger types for indexing
 */
export type IndexTriggerType =
  | 'code-change'    // Incremental index of changed files
  | 'hourly'         // Scheduled refresh of hot paths
  | 'manual'         // Full reindex on demand
  | 'git-commit';    // Post-commit hook integration

/**
 * Index trigger configuration
 */
export interface IndexTrigger {
  type: IndexTriggerType;
  files?: string[];        // Specific files (for code-change, git-commit)
  commitHash?: string;     // Git commit reference
  branch?: string;         // Git branch
  paths?: string[];        // Paths to scan (for manual full reindex)
  hotPathsOnly?: boolean;  // For hourly refresh
  correlationId?: string;  // For tracking
}

/**
 * Protocol execution result
 */
export interface IndexProtocolResult {
  protocolId: string;
  trigger: IndexTrigger;
  indexResult: IndexResult;
  impactAnalysis?: ImpactAnalysis;
  dependencyMap?: DependencyMap;
  notifiedDomains: DomainName[];
  duration: number;
  timestamp: Date;
}

/**
 * Protocol configuration
 */
export interface IndexProtocolConfig {
  /** Enable impact analysis for changes */
  analyzeImpact: boolean;
  /** Enable dependency graph updates */
  updateDependencies: boolean;
  /** Domains to notify of changes */
  notifyDomains: DomainName[];
  /** Maximum files per incremental index */
  maxIncrementalFiles: number;
  /** Hot paths for hourly refresh */
  hotPaths: string[];
  /** Languages to index */
  languages: string[];
  /** Include test files in index */
  includeTests: boolean;
  /** Memory namespace for protocol state */
  namespace: string;
  /** Track last index time per trigger type */
  trackIndexHistory: boolean;
}

const DEFAULT_CONFIG: IndexProtocolConfig = {
  analyzeImpact: true,
  updateDependencies: true,
  notifyDomains: [
    'test-generation',
    'coverage-analysis',
    'defect-intelligence',
  ],
  maxIncrementalFiles: 500,
  hotPaths: [
    'src/core/**',
    'src/api/**',
    'src/domains/**',
    'lib/**',
  ],
  languages: ['typescript', 'javascript', 'python'],
  includeTests: true,
  namespace: 'coordination:code-index-protocol',
  trackIndexHistory: true,
};

// ============================================================================
// Protocol Events
// ============================================================================

export const CodeIndexProtocolEvents = {
  CodeIndexStarted: 'coordination.CodeIndexStarted',
  KnowledgeGraphUpdated: 'coordination.KnowledgeGraphUpdated',
  ImpactAnalysisCompleted: 'coordination.ImpactAnalysisCompleted',
  DependenciesIndexed: 'coordination.DependenciesIndexed',
  CodeIndexCompleted: 'coordination.CodeIndexCompleted',
  DomainNotified: 'coordination.DomainNotified',
} as const;

export interface CodeIndexStartedPayload {
  protocolId: string;
  trigger: IndexTrigger;
  fileCount: number;
  startTime: Date;
}

export interface ProtocolKnowledgeGraphUpdatedPayload {
  protocolId: string;
  nodesCreated: number;
  edgesCreated: number;
  filesIndexed: number;
  duration: number;
}

export interface ImpactAnalysisCompletedPayload {
  protocolId: string;
  changedFiles: string[];
  directImpact: number;
  transitiveImpact: number;
  impactedTests: number;
  riskLevel: Severity;
}

export interface DependenciesIndexedPayload {
  protocolId: string;
  totalNodes: number;
  totalEdges: number;
  cyclesDetected: number;
}

export interface CodeIndexCompletedPayload {
  protocolId: string;
  trigger: IndexTrigger;
  success: boolean;
  filesIndexed: number;
  duration: number;
  notifiedDomains: DomainName[];
  error?: string;
}

export interface DomainNotifiedPayload {
  protocolId: string;
  domain: DomainName;
  notificationType: string;
  filesAffecting: string[];
}

// ============================================================================
// Protocol Interface
// ============================================================================

export interface ICodeIntelligenceIndexProtocol {
  /** Execute the protocol with given trigger */
  execute(trigger: IndexTrigger): Promise<Result<IndexProtocolResult, Error>>;

  /** Detect files changed since last index */
  detectChanges(): Promise<Result<string[], Error>>;

  /** Update knowledge graph with new/changed files */
  updateKnowledgeGraph(files: string[]): Promise<Result<IndexResult, Error>>;

  /** Analyze impact of changes */
  analyzeImpact(changedFiles: string[]): Promise<Result<ImpactAnalysis, Error>>;

  /** Index/update dependency graph */
  indexDependencies(files: string[]): Promise<Result<DependencyMap, Error>>;

  /** Notify affected domains of relevant changes */
  notifyAffectedDomains(
    impactAnalysis: ImpactAnalysis,
    changedFiles: string[]
  ): Promise<Result<DomainName[], Error>>;

  /** Get protocol statistics */
  getStats(): ProtocolStats;
}

export interface ProtocolStats {
  totalExecutions: number;
  lastExecution?: Date;
  lastExecutionByTrigger: Record<IndexTriggerType, Date | undefined>;
  averageDuration: number;
  successRate: number;
  totalFilesIndexed: number;
}

// ============================================================================
// Protocol Implementation
// ============================================================================

/**
 * Code Intelligence Index Protocol
 * Coordinates code indexing across domains
 */
export class CodeIntelligenceIndexProtocol implements ICodeIntelligenceIndexProtocol {
  private readonly config: IndexProtocolConfig;
  private readonly gitAnalyzer: GitAnalyzer;
  private executionCount = 0;
  private totalDuration = 0;
  private successCount = 0;
  private totalFilesIndexed = 0;
  private lastExecution?: Date;
  private lastExecutionByTrigger: Record<IndexTriggerType, Date | undefined> = {
    'code-change': undefined,
    hourly: undefined,
    manual: undefined,
    'git-commit': undefined,
  };

  constructor(
    private readonly kernel: QEKernel,
    config: Partial<IndexProtocolConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.gitAnalyzer = new GitAnalyzer({ enableCache: true });
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Execute the indexing protocol based on trigger type
   */
  async execute(trigger: IndexTrigger): Promise<Result<IndexProtocolResult, Error>> {
    const protocolId = uuidv4();
    const startTime = Date.now();
    const notifiedDomains: DomainName[] = [];

    try {
      // Publish start event
      await this.publishEvent(CodeIndexProtocolEvents.CodeIndexStarted, {
        protocolId,
        trigger,
        fileCount: trigger.files?.length ?? 0,
        startTime: new Date(),
      } satisfies CodeIndexStartedPayload);

      // Determine files to index based on trigger type
      const filesToIndex = await this.resolveFilesToIndex(trigger);
      if (!filesToIndex.success) {
        return err(filesToIndex.error);
      }

      const files = filesToIndex.value;
      if (files.length === 0) {
        // No files to index
        const result: IndexProtocolResult = {
          protocolId,
          trigger,
          indexResult: {
            filesIndexed: 0,
            nodesCreated: 0,
            edgesCreated: 0,
            duration: 0,
            errors: [],
          },
          notifiedDomains: [],
          duration: Date.now() - startTime,
          timestamp: new Date(),
        };

        await this.publishCompletedEvent(protocolId, trigger, true, result, notifiedDomains);
        this.updateStats(true, result.duration, 0);
        return ok(result);
      }

      // Step 1: Update Knowledge Graph
      const indexResult = await this.updateKnowledgeGraph(files);
      if (!indexResult.success) {
        await this.publishCompletedEvent(protocolId, trigger, false, undefined, [], indexResult.error.message);
        this.updateStats(false, Date.now() - startTime, 0);
        return err(indexResult.error);
      }

      await this.publishEvent(CodeIndexProtocolEvents.KnowledgeGraphUpdated, {
        protocolId,
        nodesCreated: indexResult.value.nodesCreated,
        edgesCreated: indexResult.value.edgesCreated,
        filesIndexed: indexResult.value.filesIndexed,
        duration: indexResult.value.duration,
      } satisfies ProtocolKnowledgeGraphUpdatedPayload);

      // Step 2: Analyze Impact (if enabled and relevant trigger)
      let impactAnalysis: ImpactAnalysis | undefined;
      if (this.config.analyzeImpact && this.shouldAnalyzeImpact(trigger)) {
        const impactResult = await this.analyzeImpact(files);
        if (impactResult.success) {
          impactAnalysis = impactResult.value;

          await this.publishEvent(CodeIndexProtocolEvents.ImpactAnalysisCompleted, {
            protocolId,
            changedFiles: files,
            directImpact: impactAnalysis.directImpact.length,
            transitiveImpact: impactAnalysis.transitiveImpact.length,
            impactedTests: impactAnalysis.impactedTests.length,
            riskLevel: impactAnalysis.riskLevel,
          } satisfies ImpactAnalysisCompletedPayload);
        }
      }

      // Step 3: Update Dependency Graph (if enabled)
      let dependencyMap: DependencyMap | undefined;
      if (this.config.updateDependencies) {
        const depResult = await this.indexDependencies(files);
        if (depResult.success) {
          dependencyMap = depResult.value;

          await this.publishEvent(CodeIndexProtocolEvents.DependenciesIndexed, {
            protocolId,
            totalNodes: dependencyMap.metrics.totalNodes,
            totalEdges: dependencyMap.metrics.totalEdges,
            cyclesDetected: dependencyMap.cycles.length,
          } satisfies DependenciesIndexedPayload);
        }
      }

      // Step 4: Notify affected domains
      if (impactAnalysis && this.config.notifyDomains.length > 0) {
        const notifyResult = await this.notifyAffectedDomains(impactAnalysis, files);
        if (notifyResult.success) {
          notifiedDomains.push(...notifyResult.value);
        }
      }

      const duration = Date.now() - startTime;
      const result: IndexProtocolResult = {
        protocolId,
        trigger,
        indexResult: indexResult.value,
        impactAnalysis,
        dependencyMap,
        notifiedDomains,
        duration,
        timestamp: new Date(),
      };

      // Publish completion event
      await this.publishCompletedEvent(protocolId, trigger, true, result, notifiedDomains);

      // Store protocol result
      await this.storeProtocolResult(result);

      // Update statistics
      this.updateStats(true, duration, indexResult.value.filesIndexed);

      return ok(result);
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      await this.publishCompletedEvent(protocolId, trigger, false, undefined, [], errorObj.message);
      this.updateStats(false, Date.now() - startTime, 0);
      return err(errorObj);
    }
  }

  /**
   * Detect changed files since last index
   */
  async detectChanges(): Promise<Result<string[], Error>> {
    try {
      const lastIndexTime = await this.getLastIndexTime();
      const changedFiles: string[] = [];

      // Check memory for pending changes
      const pendingKeys = await this.kernel.memory.search(
        'code-intelligence:pending-index:*',
        100
      );

      for (const key of pendingKeys) {
        const pending = await this.kernel.memory.get<{
          files: string[];
          timestamp: string;
        }>(key);

        if (pending && pending.files) {
          const pendingTime = new Date(pending.timestamp);
          if (!lastIndexTime || pendingTime > lastIndexTime) {
            changedFiles.push(...pending.files);
          }
        }
      }

      // Check for git changes if available (stub - would integrate with git)
      const gitChanges = await this.detectGitChanges(lastIndexTime);
      if (gitChanges.success) {
        changedFiles.push(...gitChanges.value);
      }

      // Deduplicate
      const uniqueFiles = [...new Set(changedFiles)];

      return ok(uniqueFiles);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Update knowledge graph with files
   */
  async updateKnowledgeGraph(files: string[]): Promise<Result<IndexResult, Error>> {
    try {
      const codeIntelligence = this.kernel.getDomainAPI<CodeIntelligenceAPI>('code-intelligence');
      if (!codeIntelligence) {
        return err(new Error('Code intelligence domain not available'));
      }

      const request: IndexRequest = {
        paths: files,
        incremental: true,
        includeTests: this.config.includeTests,
        languages: this.config.languages,
      };

      return codeIntelligence.index(request);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Analyze impact of changed files
   */
  async analyzeImpact(changedFiles: string[]): Promise<Result<ImpactAnalysis, Error>> {
    try {
      const codeIntelligence = this.kernel.getDomainAPI<CodeIntelligenceAPI>('code-intelligence');
      if (!codeIntelligence) {
        return err(new Error('Code intelligence domain not available'));
      }

      return codeIntelligence.analyzeImpact({
        changedFiles,
        depth: 5,
        includeTests: true,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Index dependencies for files
   */
  async indexDependencies(files: string[]): Promise<Result<DependencyMap, Error>> {
    try {
      const codeIntelligence = this.kernel.getDomainAPI<CodeIntelligenceAPI>('code-intelligence');
      if (!codeIntelligence) {
        return err(new Error('Code intelligence domain not available'));
      }

      return codeIntelligence.mapDependencies({
        files,
        direction: 'both',
        depth: 3,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Notify domains affected by changes
   */
  async notifyAffectedDomains(
    impactAnalysis: ImpactAnalysis,
    changedFiles: string[]
  ): Promise<Result<DomainName[], Error>> {
    const notifiedDomains: DomainName[] = [];

    try {
      for (const domain of this.config.notifyDomains) {
        const notification = this.buildDomainNotification(domain, impactAnalysis, changedFiles);
        if (notification) {
          await this.publishDomainNotification(domain, notification);
          notifiedDomains.push(domain);
        }
      }

      return ok(notifiedDomains);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get protocol statistics
   */
  getStats(): ProtocolStats {
    return {
      totalExecutions: this.executionCount,
      lastExecution: this.lastExecution,
      lastExecutionByTrigger: { ...this.lastExecutionByTrigger },
      averageDuration:
        this.executionCount > 0 ? this.totalDuration / this.executionCount : 0,
      successRate:
        this.executionCount > 0 ? this.successCount / this.executionCount : 0,
      totalFilesIndexed: this.totalFilesIndexed,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async resolveFilesToIndex(trigger: IndexTrigger): Promise<Result<string[], Error>> {
    switch (trigger.type) {
      case 'code-change':
        // Use provided files or detect changes
        if (trigger.files && trigger.files.length > 0) {
          return ok(trigger.files.slice(0, this.config.maxIncrementalFiles));
        }
        return this.detectChanges();

      case 'git-commit':
        // Use files from commit
        if (trigger.files && trigger.files.length > 0) {
          return ok(trigger.files);
        }
        // Fall back to detecting git changes
        return this.detectGitCommitFiles(trigger.commitHash);

      case 'hourly':
        // Refresh hot paths only
        if (trigger.hotPathsOnly) {
          return this.resolveHotPaths();
        }
        // Otherwise detect any accumulated changes
        return this.detectChanges();

      case 'manual':
        // Full reindex - use provided paths or default
        const paths = trigger.paths || ['src/**', 'lib/**'];
        return this.resolveGlobPatterns(paths);

      default:
        return err(new Error(`Unknown trigger type: ${(trigger as IndexTrigger).type}`));
    }
  }

  private shouldAnalyzeImpact(trigger: IndexTrigger): boolean {
    // Only analyze impact for change-based triggers
    return trigger.type === 'code-change' || trigger.type === 'git-commit';
  }

  private async detectGitChanges(since?: Date): Promise<Result<string[], Error>> {
    try {
      const changedFiles = await this.gitAnalyzer.getChangedFiles(since);
      // Filter to only include configured languages
      const filteredFiles = changedFiles.filter((f) => this.isRelevantFile(f));
      return ok(filteredFiles);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async detectGitCommitFiles(commitHash?: string): Promise<Result<string[], Error>> {
    if (!commitHash) {
      return ok([]);
    }
    try {
      const commitFiles = await this.gitAnalyzer.getCommitFiles(commitHash);
      // Filter to only include configured languages
      const filteredFiles = commitFiles.filter((f) => this.isRelevantFile(f));
      return ok(filteredFiles);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async resolveHotPaths(): Promise<Result<string[], Error>> {
    try {
      const allFiles: string[] = [];

      for (const pattern of this.config.hotPaths) {
        const result = await listFiles(pattern);
        if (result.success) {
          allFiles.push(...result.value);
        }
      }

      // Filter and deduplicate
      const filteredFiles = allFiles.filter((f) => this.isRelevantFile(f));
      return ok([...new Set(filteredFiles)]);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async resolveGlobPatterns(patterns: string[]): Promise<Result<string[], Error>> {
    try {
      const allFiles: string[] = [];

      for (const pattern of patterns) {
        const result = await listFiles(pattern);
        if (result.success) {
          allFiles.push(...result.value);
        }
      }

      // Filter and deduplicate
      const filteredFiles = allFiles.filter((f) => this.isRelevantFile(f));
      return ok([...new Set(filteredFiles)]);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private isRelevantFile(filePath: string): boolean {
    // Filter by configured languages
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const languageExtensions: Record<string, string[]> = {
      typescript: ['ts', 'tsx'],
      javascript: ['js', 'jsx', 'mjs', 'cjs'],
      python: ['py', 'pyw'],
    };

    for (const lang of this.config.languages) {
      const exts = languageExtensions[lang] || [];
      if (exts.includes(ext)) {
        // Optionally exclude test files if not configured
        if (!this.config.includeTests && this.isTestFile(filePath)) {
          return false;
        }
        return true;
      }
    }
    return false;
  }

  private buildDomainNotification(
    domain: DomainName,
    impact: ImpactAnalysis,
    changedFiles: string[]
  ): DomainNotification | null {
    switch (domain) {
      case 'test-generation':
        // Notify about files needing new tests
        const filesNeedingTests = changedFiles.filter(
          (f) => !this.isTestFile(f) && !impact.impactedTests.some((t) => this.isTestForFile(t, f))
        );
        if (filesNeedingTests.length === 0) return null;
        return {
          type: 'files-need-tests',
          files: filesNeedingTests,
          priority: this.mapRiskToPriority(impact.riskLevel),
          recommendations: ['Generate unit tests for new/changed files'],
        };

      case 'coverage-analysis':
        // Notify about coverage gap changes
        return {
          type: 'coverage-affected',
          files: changedFiles,
          impactedFiles: [
            ...impact.directImpact.map((i) => i.file),
            ...impact.transitiveImpact.map((i) => i.file),
          ],
          priority: this.mapRiskToPriority(impact.riskLevel),
          recommendations: ['Re-analyze coverage for impacted files'],
        };

      case 'defect-intelligence':
        // Notify for regression risk assessment
        const highRiskFiles = [
          ...impact.directImpact.filter((i) => i.riskScore >= 0.7),
          ...impact.transitiveImpact.filter((i) => i.riskScore >= 0.7),
        ];
        if (highRiskFiles.length === 0 && impact.riskLevel === 'info') return null;
        return {
          type: 'regression-risk',
          files: changedFiles,
          highRiskFiles: highRiskFiles.map((f) => f.file),
          riskLevel: impact.riskLevel,
          priority: this.mapRiskToPriority(impact.riskLevel),
          recommendations: impact.recommendations,
        };

      default:
        return null;
    }
  }

  private async publishDomainNotification(
    domain: DomainName,
    notification: DomainNotification
  ): Promise<void> {
    const event = createEvent(
      `coordination.${domain}.IndexNotification`,
      'code-intelligence',
      notification
    );
    await this.kernel.eventBus.publish(event);
  }

  private async publishEvent<T>(eventType: string, payload: T): Promise<void> {
    const event = createEvent(eventType, 'code-intelligence', payload);
    await this.kernel.eventBus.publish(event);
  }

  private async publishCompletedEvent(
    protocolId: string,
    trigger: IndexTrigger,
    success: boolean,
    result?: IndexProtocolResult,
    notifiedDomains: DomainName[] = [],
    error?: string
  ): Promise<void> {
    const payload: CodeIndexCompletedPayload = {
      protocolId,
      trigger,
      success,
      filesIndexed: result?.indexResult.filesIndexed ?? 0,
      duration: result?.duration ?? 0,
      notifiedDomains,
      error,
    };

    await this.publishEvent(CodeIndexProtocolEvents.CodeIndexCompleted, payload);
  }

  private async storeProtocolResult(result: IndexProtocolResult): Promise<void> {
    if (!this.config.trackIndexHistory) return;

    const key = `${this.config.namespace}:result:${result.protocolId}`;
    await this.kernel.memory.set(key, result, {
      namespace: this.config.namespace,
      ttl: 86400 * 7, // Keep for 7 days
    });

    // Update last index time for trigger type
    await this.kernel.memory.set(
      `${this.config.namespace}:last-index:${result.trigger.type}`,
      { timestamp: result.timestamp.toISOString() },
      { namespace: this.config.namespace, persist: true }
    );
  }

  private async getLastIndexTime(): Promise<Date | undefined> {
    const lastIndex = await this.kernel.memory.get<{ timestamp: string }>(
      `${this.config.namespace}:last-index:code-change`
    );
    return lastIndex ? new Date(lastIndex.timestamp) : undefined;
  }

  private updateStats(success: boolean, duration: number, filesIndexed: number): void {
    this.executionCount++;
    this.totalDuration += duration;
    this.totalFilesIndexed += filesIndexed;
    this.lastExecution = new Date();

    if (success) {
      this.successCount++;
    }
  }

  private isTestFile(path: string): boolean {
    const testPatterns = [
      /\.test\.[tj]sx?$/,
      /\.spec\.[tj]sx?$/,
      /_test\.[tj]sx?$/,
      /test_.*\.py$/,
      /.*_test\.py$/,
      /.*_test\.go$/,
    ];
    return testPatterns.some((p) => p.test(path));
  }

  private isTestForFile(testPath: string, sourcePath: string): boolean {
    const sourceBaseName = this.getBaseName(sourcePath);
    const testBaseName = this.getBaseName(testPath);
    return testBaseName.includes(sourceBaseName);
  }

  private getBaseName(path: string): string {
    const fileName = path.split(/[/\\]/).pop() || path;
    return fileName.replace(/\.[^.]+$/, '').replace(/\.(test|spec)$/, '');
  }

  private mapRiskToPriority(risk: Severity): 'low' | 'medium' | 'high' | 'critical' {
    switch (risk) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      default:
        return 'low';
    }
  }
}

// ============================================================================
// Helper Types
// ============================================================================

interface DomainNotification {
  type: string;
  files: string[];
  impactedFiles?: string[];
  highRiskFiles?: string[];
  riskLevel?: Severity;
  priority: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Code Intelligence Index Protocol instance
 */
export function createCodeIntelligenceIndexProtocol(
  kernel: QEKernel,
  config?: Partial<IndexProtocolConfig>
): ICodeIntelligenceIndexProtocol {
  return new CodeIntelligenceIndexProtocol(kernel, config);
}
