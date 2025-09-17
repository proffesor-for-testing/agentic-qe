/**
 * Enhanced Mock Implementations for Claude Flow Integration Tests
 * Provides realistic mock implementations with state management and behavior simulation
 */

import { EventEmitter } from 'events';
import { QEAgent, QEMemoryEntry, MemoryType, TestResult, TestCase, AgentType, AgentMetrics } from '../../src/types';
import { TaskDefinition, ExecutionResult, ResourceMetrics } from '../../src/advanced/task-executor';
import { QEMemoryConfig, MemoryQueryOptions } from '../../src/memory/QEMemory';
import { Logger } from '../../src/utils/Logger';

// ============================================================================
// Enhanced Mock Memory Implementation with State Management
// ============================================================================

export class EnhancedMockMemory extends EventEmitter {
  private data = new Map<string, QEMemoryEntry>();
  private indices = {
    bySession: new Map<string, Set<string>>(),
    byAgent: new Map<string, Set<string>>(),
    byType: new Map<MemoryType, Set<string>>(),
    byTags: new Map<string, Set<string>>()
  };
  private operationDelay: number;
  private failureRate: number;
  private config: Required<QEMemoryConfig>;
  private operationHistory: Array<{
    operation: string;
    timestamp: Date;
    key?: string;
    success: boolean;
    duration: number;
  }> = [];

  constructor(options: {
    operationDelay?: number;
    failureRate?: number;
    config?: Partial<QEMemoryConfig>;
  } = {}) {
    super();
    this.operationDelay = options.operationDelay || 0;
    this.failureRate = options.failureRate || 0;
    this.config = {
      persistPath: '',
      maxEntries: 10000,
      defaultTTL: 3600000,
      autoCleanup: true,
      cleanupInterval: 300000,
      compression: false,
      encryption: { enabled: false },
      ...options.config
    };
  }

  async store(entry: QEMemoryEntry): Promise<void> {
    const startTime = Date.now();
    let success = true;
    
    try {
      await this.simulateDelay();
      this.maybeThrowError('store');

      // Check memory limits
      if (this.data.size >= this.config.maxEntries) {
        await this.evictOldestEntries(Math.floor(this.config.maxEntries * 0.1));
      }

      this.data.set(entry.key, { ...entry });
      this.updateIndices(entry, 'add');
      this.emit('entry-stored', entry);
    } catch (error) {
      success = false;
      throw error;
    } finally {
      this.recordOperation('store', startTime, entry.key, success);
    }
  }

  async get(key: string): Promise<QEMemoryEntry | null> {
    const startTime = Date.now();
    let success = true;
    
    try {
      await this.simulateDelay();
      this.maybeThrowError('get');

      const entry = this.data.get(key);
      if (!entry) return null;

      // Check TTL
      if (this.isExpired(entry)) {
        await this.delete(key);
        return null;
      }

      this.emit('entry-accessed', entry);
      return { ...entry };
    } catch (error) {
      success = false;
      throw error;
    } finally {
      this.recordOperation('get', startTime, key, success);
    }
  }

  async query(options: MemoryQueryOptions = {}): Promise<QEMemoryEntry[]> {
    const startTime = Date.now();
    let success = true;
    
    try {
      await this.simulateDelay();
      this.maybeThrowError('query');

      let results = Array.from(this.data.values());

      // Apply filters
      results = this.applyFilters(results, options);

      // Filter expired entries
      results = results.filter(entry => !this.isExpired(entry));

      // Sort and paginate
      results = this.sortAndPaginate(results, options);

      return results.map(entry => ({ ...entry }));
    } catch (error) {
      success = false;
      throw error;
    } finally {
      this.recordOperation('query', startTime, undefined, success);
    }
  }

  async update(key: string, updates: Partial<Omit<QEMemoryEntry, 'key'>>): Promise<boolean> {
    const startTime = Date.now();
    let success = true;
    
    try {
      await this.simulateDelay();
      this.maybeThrowError('update');

      const existing = this.data.get(key);
      if (!existing || this.isExpired(existing)) {
        return false;
      }

      const updated = {
        ...existing,
        ...updates,
        key,
        timestamp: new Date()
      };

      this.data.set(key, updated);
      this.emit('entry-updated', updated);
      return true;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      this.recordOperation('update', startTime, key, success);
    }
  }

  async delete(key: string): Promise<boolean> {
    const startTime = Date.now();
    let success = true;
    
    try {
      await this.simulateDelay();
      this.maybeThrowError('delete');

      const entry = this.data.get(key);
      if (!entry) return false;

      this.data.delete(key);
      this.updateIndices(entry, 'remove');
      this.emit('entry-deleted', entry);
      return true;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      this.recordOperation('delete', startTime, key, success);
    }
  }

  async clear(options: MemoryQueryOptions = {}): Promise<number> {
    const entries = await this.query(options);
    let deleted = 0;

    for (const entry of entries) {
      if (await this.delete(entry.key)) {
        deleted++;
      }
    }

    return deleted;
  }

  getStats() {
    const stats = {
      totalEntries: this.data.size,
      entriesByType: {} as Record<MemoryType, number>,
      entriesBySession: {} as Record<string, number>,
      entriesByAgent: {} as Record<string, number>,
      memoryUsage: 0,
      oldestEntry: undefined as Date | undefined,
      newestEntry: undefined as Date | undefined,
      expiredEntries: 0,
      operationStats: this.getOperationStats()
    };

    for (const entry of this.data.values()) {
      stats.entriesByType[entry.type] = (stats.entriesByType[entry.type] || 0) + 1;
      stats.entriesBySession[entry.sessionId] = (stats.entriesBySession[entry.sessionId] || 0) + 1;
      
      if (entry.agentId) {
        stats.entriesByAgent[entry.agentId] = (stats.entriesByAgent[entry.agentId] || 0) + 1;
      }
      
      if (!stats.oldestEntry || entry.timestamp < stats.oldestEntry) {
        stats.oldestEntry = entry.timestamp;
      }
      if (!stats.newestEntry || entry.timestamp > stats.newestEntry) {
        stats.newestEntry = entry.timestamp;
      }
      
      if (this.isExpired(entry)) {
        stats.expiredEntries++;
      }
      
      stats.memoryUsage += JSON.stringify(entry).length;
    }

    return stats;
  }

  async cleanup(): Promise<number> {
    let cleaned = 0;
    const keysToDelete = [];

    for (const [key, entry] of this.data.entries()) {
      if (this.isExpired(entry)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      if (await this.delete(key)) {
        cleaned++;
      }
    }

    return cleaned;
  }

  async persist(): Promise<void> {
    await this.simulateDelay();
    this.emit('memory-persisted', { entries: this.data.size });
  }

  async load(): Promise<void> {
    await this.simulateDelay();
    this.emit('memory-loaded', { entries: this.data.size });
  }

  async destroy(): Promise<void> {
    this.data.clear();
    this.clearIndices();
    this.operationHistory = [];
    this.removeAllListeners();
  }

  // Enhanced mock-specific methods
  setOperationDelay(delay: number): void {
    this.operationDelay = delay;
  }

  setFailureRate(rate: number): void {
    this.failureRate = Math.max(0, Math.min(1, rate));
  }

  getOperationHistory(): typeof this.operationHistory {
    return [...this.operationHistory];
  }

  getOperationStats() {
    const stats = {
      totalOperations: this.operationHistory.length,
      successfulOperations: this.operationHistory.filter(op => op.success).length,
      failedOperations: this.operationHistory.filter(op => !op.success).length,
      averageDuration: 0,
      operationsByType: {} as Record<string, number>
    };

    if (this.operationHistory.length > 0) {
      stats.averageDuration = this.operationHistory.reduce((sum, op) => sum + op.duration, 0) / this.operationHistory.length;
      
      for (const op of this.operationHistory) {
        stats.operationsByType[op.operation] = (stats.operationsByType[op.operation] || 0) + 1;
      }
    }

    return stats;
  }

  getDataSnapshot(): Map<string, QEMemoryEntry> {
    return new Map(this.data);
  }

  loadDataSnapshot(data: Map<string, QEMemoryEntry>): void {
    this.data.clear();
    this.clearIndices();

    for (const [key, entry] of data.entries()) {
      this.data.set(key, entry);
      this.updateIndices(entry, 'add');
    }
  }

  // Simulate realistic behavior patterns
  simulateMemoryPressure(pressure: 'low' | 'medium' | 'high'): void {
    const pressureLevels = {
      low: { delay: 10, failure: 0.01 },
      medium: { delay: 50, failure: 0.05 },
      high: { delay: 200, failure: 0.15 }
    };
    
    const level = pressureLevels[pressure];
    this.setOperationDelay(level.delay);
    this.setFailureRate(level.failure);
  }

  private async simulateDelay(): Promise<void> {
    if (this.operationDelay > 0) {
      const actualDelay = this.operationDelay + Math.random() * this.operationDelay * 0.2;
      await new Promise(resolve => setTimeout(resolve, actualDelay));
    }
  }

  private maybeThrowError(operation: string): void {
    if (Math.random() < this.failureRate) {
      throw new Error(`Mock ${operation} operation failed`);
    }
  }

  private isExpired(entry: QEMemoryEntry): boolean {
    if (!entry.ttl) return false;
    return Date.now() - entry.timestamp.getTime() > entry.ttl;
  }

  private async evictOldestEntries(count: number): Promise<void> {
    const entries = Array.from(this.data.values())
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .slice(0, count);
    
    for (const entry of entries) {
      await this.delete(entry.key);
    }
  }

  private applyFilters(results: QEMemoryEntry[], options: MemoryQueryOptions): QEMemoryEntry[] {
    if (options.sessionId) {
      results = results.filter(entry => entry.sessionId === options.sessionId);
    }
    if (options.agentId) {
      results = results.filter(entry => entry.agentId === options.agentId);
    }
    if (options.type) {
      results = results.filter(entry => entry.type === options.type);
    }
    if (options.tags) {
      results = results.filter(entry =>
        options.tags!.every(tag => entry.tags.includes(tag))
      );
    }
    if (options.startTime) {
      results = results.filter(entry => entry.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      results = results.filter(entry => entry.timestamp <= options.endTime!);
    }
    return results;
  }

  private sortAndPaginate(results: QEMemoryEntry[], options: MemoryQueryOptions): QEMemoryEntry[] {
    // Sort
    if (options.sortBy) {
      results.sort((a, b) => {
        let aVal: any, bVal: any;
        switch (options.sortBy) {
          case 'timestamp':
            aVal = a.timestamp.getTime();
            bVal = b.timestamp.getTime();
            break;
          case 'key':
            aVal = a.key;
            bVal = b.key;
            break;
          case 'type':
            aVal = a.type;
            bVal = b.type;
            break;
          default:
            return 0;
        }
        const order = options.sortOrder === 'desc' ? -1 : 1;
        return aVal < bVal ? -order : aVal > bVal ? order : 0;
      });
    }

    // Pagination
    const offset = options.offset || 0;
    const limit = options.limit;
    if (limit) {
      results = results.slice(offset, offset + limit);
    } else if (offset > 0) {
      results = results.slice(offset);
    }

    return results;
  }

  private updateIndices(entry: QEMemoryEntry, operation: 'add' | 'remove'): void {
    const { key, sessionId, agentId, type, tags } = entry;

    if (operation === 'add') {
      if (!this.indices.bySession.has(sessionId)) {
        this.indices.bySession.set(sessionId, new Set());
      }
      this.indices.bySession.get(sessionId)!.add(key);

      if (agentId) {
        if (!this.indices.byAgent.has(agentId)) {
          this.indices.byAgent.set(agentId, new Set());
        }
        this.indices.byAgent.get(agentId)!.add(key);
      }

      if (!this.indices.byType.has(type)) {
        this.indices.byType.set(type, new Set());
      }
      this.indices.byType.get(type)!.add(key);

      for (const tag of tags) {
        if (!this.indices.byTags.has(tag)) {
          this.indices.byTags.set(tag, new Set());
        }
        this.indices.byTags.get(tag)!.add(key);
      }
    } else {
      this.indices.bySession.get(sessionId)?.delete(key);
      if (agentId) {
        this.indices.byAgent.get(agentId)?.delete(key);
      }
      this.indices.byType.get(type)?.delete(key);
      for (const tag of tags) {
        this.indices.byTags.get(tag)?.delete(key);
      }
    }
  }

  private clearIndices(): void {
    this.indices.bySession.clear();
    this.indices.byAgent.clear();
    this.indices.byType.clear();
    this.indices.byTags.clear();
  }

  private recordOperation(operation: string, startTime: number, key?: string, success: boolean = true): void {
    this.operationHistory.push({
      operation,
      timestamp: new Date(),
      key,
      success,
      duration: Date.now() - startTime
    });

    // Keep only last 1000 operations
    if (this.operationHistory.length > 1000) {
      this.operationHistory = this.operationHistory.slice(-1000);
    }
  }
}

// ============================================================================
// Enhanced Mock Task Executor with Realistic Behavior
// ============================================================================

export class EnhancedMockTaskExecutor extends EventEmitter {
  private executionDelay: number;
  private failureRate: number;
  private activeExecutions = new Map<string, Promise<ExecutionResult>>();
  private executionHistory: Array<{
    taskId: string;
    agentId: string;
    startTime: Date;
    endTime: Date;
    duration: number;
    success: boolean;
    taskType: string;
  }> = [];
  private resourceUsage = {
    cpuUsage: 0,
    memoryUsage: 0,
    diskUsage: 0,
    networkUsage: 0
  };
  private metrics = {
    tasksExecuted: 0,
    tasksFailed: 0,
    totalExecutionTime: 0,
    averageExecutionTime: 0,
    concurrentTasks: 0,
    peakConcurrency: 0
  };

  constructor(options: {
    executionDelay?: number;
    failureRate?: number;
    maxConcurrency?: number;
  } = {}) {
    super();
    this.executionDelay = options.executionDelay || 100;
    this.failureRate = options.failureRate || 0;
  }

  async executeTask(task: TaskDefinition, agentId: string): Promise<ExecutionResult> {
    const startTime = Date.now();
    const execution = this.performEnhancedExecution(task, agentId, startTime);
    
    this.activeExecutions.set(task.id, execution);
    this.metrics.concurrentTasks++;
    this.metrics.peakConcurrency = Math.max(this.metrics.peakConcurrency, this.metrics.concurrentTasks);
    
    this.emit('taskStarted', { taskId: task.id, agentId, startTime: new Date(startTime) });

    try {
      const result = await execution;
      
      this.metrics.tasksExecuted++;
      this.metrics.totalExecutionTime += result.duration;
      this.metrics.averageExecutionTime = this.metrics.totalExecutionTime / this.metrics.tasksExecuted;
      
      this.recordExecution(task.id, agentId, startTime, result.duration, true, task.type);
      this.emit('taskCompleted', { taskId: task.id, agentId, result });
      
      return result;
    } catch (error: any) {
      this.metrics.tasksFailed++;
      const duration = Date.now() - startTime;
      
      this.recordExecution(task.id, agentId, startTime, duration, false, task.type);
      this.emit('taskFailed', { taskId: task.id, agentId, error: error.message });
      
      throw error;
    } finally {
      this.activeExecutions.delete(task.id);
      this.metrics.concurrentTasks--;
    }
  }

  private async performEnhancedExecution(task: TaskDefinition, agentId: string, startTime: number): Promise<ExecutionResult> {
    // Simulate resource consumption
    this.simulateResourceUsage(task);
    
    // Simulate execution time based on task complexity
    const baseDelay = this.getExecutionTimeForTask(task);
    const variabilityFactor = 0.3; // ±30% variability
    const actualDelay = baseDelay * (1 + (Math.random() - 0.5) * variabilityFactor);
    
    await new Promise(resolve => setTimeout(resolve, actualDelay));

    // Simulate random failures based on task type and retry count
    const adjustedFailureRate = this.calculateAdjustedFailureRate(task);
    if (Math.random() < adjustedFailureRate) {
      throw new Error(`Execution failed for task ${task.id}: ${this.generateFailureReason(task)}`);
    }

    const duration = Date.now() - startTime;
    
    return {
      success: true,
      output: this.generateRealisticOutput(task, agentId),
      duration,
      resourcesUsed: this.generateResourceMetrics(task, duration),
      retries: 0,
      artifacts: this.generateTaskArtifacts(task)
    };
  }

  private getExecutionTimeForTask(task: TaskDefinition): number {
    const baseDelays: Record<string, number> = {
      development: 1200,
      analysis: 800,
      research: 1000,
      optimization: 1500,
      testing: 600
    };
    
    const baseDelay = baseDelays[task.type] || this.executionDelay;
    
    // Adjust based on priority (higher priority = more resources = faster execution)
    const priorityMultiplier = {
      1: 1.5,  // Low priority, slower
      5: 1.0,  // Medium priority
      10: 0.7  // High priority, faster
    }[task.priority] || 1.0;
    
    // Adjust based on retry count (subsequent retries may be faster due to caching)
    const retryMultiplier = Math.max(0.5, 1 - (task.retryCount * 0.1));
    
    return baseDelay * priorityMultiplier * retryMultiplier;
  }

  private calculateAdjustedFailureRate(task: TaskDefinition): number {
    let adjustedRate = this.failureRate;
    
    // Some task types are more prone to failure
    const taskTypeMultipliers: Record<string, number> = {
      development: 1.2,
      testing: 0.8,
      analysis: 0.9,
      research: 1.0,
      optimization: 1.3
    };
    
    adjustedRate *= (taskTypeMultipliers[task.type] || 1.0);
    
    // Higher priority tasks get more resources and are less likely to fail
    if (task.priority >= 8) {
      adjustedRate *= 0.5;
    } else if (task.priority <= 3) {
      adjustedRate *= 1.5;
    }
    
    return Math.min(adjustedRate, 0.5); // Cap at 50% failure rate
  }

  private generateFailureReason(task: TaskDefinition): string {
    const reasons = {
      development: ['Build compilation failed', 'Dependency resolution error', 'Syntax error detected'],
      testing: ['Test assertion failed', 'Test timeout exceeded', 'Environment setup failed'],
      analysis: ['Data parsing error', 'Insufficient data quality', 'Analysis algorithm failed'],
      research: ['Information source unavailable', 'Research timeout', 'Conflicting information found'],
      optimization: ['Optimization did not converge', 'Resource constraints exceeded', 'Performance regression detected']
    };
    
    const taskReasons = reasons[task.type as keyof typeof reasons] || ['Unknown error occurred'];
    return taskReasons[Math.floor(Math.random() * taskReasons.length)];
  }

  private generateRealisticOutput(task: TaskDefinition, agentId: string): any {
    const outputs = {
      development: () => ({
        filesCreated: this.generateFileList(task.name),
        linesOfCode: Math.floor(Math.random() * 1000) + 200,
        testsCreated: Math.floor(Math.random() * 20) + 5,
        coverage: Math.floor(Math.random() * 30) + 70,
        buildTime: Math.floor(Math.random() * 30) + 10,
        dependencies: Math.floor(Math.random() * 15) + 5
      }),
      analysis: () => ({
        metricsAnalyzed: Math.floor(Math.random() * 50) + 20,
        issues: Math.floor(Math.random() * 10),
        criticalIssues: Math.floor(Math.random() * 3),
        recommendations: this.generateRecommendations(),
        confidence: Math.random() * 0.3 + 0.7, // 70-100% confidence
        dataQuality: Math.random() * 0.2 + 0.8  // 80-100% data quality
      }),
      testing: () => ({
        testsRun: Math.floor(Math.random() * 100) + 50,
        testsPassed: Math.floor(Math.random() * 95) + 45,
        testsFailed: Math.floor(Math.random() * 5),
        coverage: Math.floor(Math.random() * 25) + 75,
        performance: {
          averageExecutionTime: Math.floor(Math.random() * 1000) + 100,
          slowestTest: Math.floor(Math.random() * 5000) + 1000
        }
      }),
      research: () => ({
        sourcesReviewed: Math.floor(Math.random() * 20) + 10,
        keyFindings: this.generateFindings(),
        relevanceScore: Math.random() * 0.3 + 0.7,
        citationCount: Math.floor(Math.random() * 50) + 10,
        expertiseLevel: ['beginner', 'intermediate', 'advanced'][Math.floor(Math.random() * 3)]
      }),
      optimization: () => ({
        performanceImprovement: `${Math.floor(Math.random() * 50) + 10}%`,
        memoryReduction: `${Math.floor(Math.random() * 30) + 5}%`,
        optimizationsApplied: Math.floor(Math.random() * 15) + 5,
        benchmarkScore: Math.floor(Math.random() * 1000) + 500,
        bottlenecksResolved: Math.floor(Math.random() * 8) + 2
      })
    };
    
    const generator = outputs[task.type as keyof typeof outputs];
    return generator ? generator() : { status: 'completed', agentId, timestamp: new Date() };
  }

  private generateFileList(taskName: string): string[] {
    const baseName = taskName.toLowerCase().replace(/\s+/g, '-');
    const files = [];
    
    files.push(`${baseName}.js`);
    files.push(`${baseName}.test.js`);
    
    if (Math.random() > 0.5) {
      files.push(`${baseName}.config.js`);
    }
    if (Math.random() > 0.7) {
      files.push(`${baseName}.types.ts`);
    }
    
    return files;
  }

  private generateRecommendations(): string[] {
    const recommendations = [
      'Implement input validation',
      'Add error handling',
      'Optimize database queries',
      'Improve code documentation',
      'Add unit tests',
      'Implement caching strategy',
      'Review security practices',
      'Optimize memory usage',
      'Add performance monitoring',
      'Implement logging'
    ];
    
    const count = Math.floor(Math.random() * 5) + 1;
    return recommendations.sort(() => Math.random() - 0.5).slice(0, count);
  }

  private generateFindings(): string[] {
    const findings = [
      'Pattern A shows 23% better performance',
      'Library X provides better compatibility',
      'Approach Y reduces complexity by 40%',
      'Method Z has proven reliability in production',
      'Framework W offers better developer experience',
      'Tool V provides superior debugging capabilities'
    ];
    
    const count = Math.floor(Math.random() * 4) + 2;
    return findings.sort(() => Math.random() - 0.5).slice(0, count);
  }

  private generateResourceMetrics(task: TaskDefinition, duration: number): ResourceMetrics {
    // Base resource usage varies by task type
    const baseUsage = {
      development: { memory: 200, cpu: 800, disk: 50, network: 10 },
      analysis: { memory: 300, cpu: 600, disk: 20, network: 30 },
      testing: { memory: 150, cpu: 400, disk: 30, network: 5 },
      research: { memory: 100, cpu: 300, disk: 10, network: 100 },
      optimization: { memory: 400, cpu: 1200, disk: 40, network: 15 }
    };
    
    const usage = baseUsage[task.type as keyof typeof baseUsage] || baseUsage.development;
    
    // Add variability
    const variability = 0.3;
    
    return {
      peakMemory: Math.floor(usage.memory * 1024 * 1024 * (1 + (Math.random() - 0.5) * variability)),
      cpuTime: Math.floor(usage.cpu * (1 + (Math.random() - 0.5) * variability)),
      diskIO: Math.floor(usage.disk * 1024 * 1024 * (1 + (Math.random() - 0.5) * variability)),
      networkIO: Math.floor(usage.network * 1024 * 1024 * (1 + (Math.random() - 0.5) * variability)),
      agentsUsed: 1
    };
  }

  private generateTaskArtifacts(task: TaskDefinition): string[] {
    const artifactsByType: Record<string, string[]> = {
      development: ['build-output.log', 'source-maps.json', 'package-lock.json'],
      testing: ['test-report.html', 'coverage-report.xml', 'test-results.json'],
      analysis: ['analysis-report.pdf', 'metrics.json', 'charts.png'],
      research: ['research-notes.md', 'bibliography.bib', 'summary.pdf'],
      optimization: ['performance-report.html', 'benchmark-results.json', 'profiling-data.bin']
    };
    
    const artifacts = artifactsByType[task.type] || ['output.log'];
    
    // Return random subset of artifacts
    const count = Math.floor(Math.random() * artifacts.length) + 1;
    return artifacts.sort(() => Math.random() - 0.5).slice(0, count);
  }

  private simulateResourceUsage(task: TaskDefinition): void {
    // Simulate resource consumption during task execution
    const usage = this.generateResourceMetrics(task, 0);
    
    this.resourceUsage.cpuUsage += usage.cpuTime / 1000; // Convert to seconds
    this.resourceUsage.memoryUsage += usage.peakMemory;
    this.resourceUsage.diskUsage += usage.diskIO;
    this.resourceUsage.networkUsage += usage.networkIO;
    
    // Simulate resource cleanup after some time
    setTimeout(() => {
      this.resourceUsage.cpuUsage = Math.max(0, this.resourceUsage.cpuUsage - usage.cpuTime / 1000);
      this.resourceUsage.memoryUsage = Math.max(0, this.resourceUsage.memoryUsage - usage.peakMemory);
    }, 5000);
  }

  private recordExecution(taskId: string, agentId: string, startTime: number, duration: number, success: boolean, taskType: string): void {
    this.executionHistory.push({
      taskId,
      agentId,
      startTime: new Date(startTime),
      endTime: new Date(startTime + duration),
      duration,
      success,
      taskType
    });
    
    // Keep only last 1000 executions
    if (this.executionHistory.length > 1000) {
      this.executionHistory = this.executionHistory.slice(-1000);
    }
  }

  // Enhanced public methods
  async getQueueStatus(): Promise<any> {
    return {
      queued: 0,
      active: this.activeExecutions.size,
      maxConcurrent: 10,
      resourceUsage: { ...this.resourceUsage },
      metrics: { ...this.metrics }
    };
  }

  getExecutionHistory(): typeof this.executionHistory {
    return [...this.executionHistory];
  }

  getDetailedMetrics() {
    const history = this.executionHistory;
    const recentHistory = history.filter(h => Date.now() - h.startTime.getTime() < 3600000); // Last hour
    
    return {
      ...this.metrics,
      recentExecutions: recentHistory.length,
      successRate: history.length > 0 ? history.filter(h => h.success).length / history.length : 0,
      averageExecutionTimeByType: this.calculateAverageTimesByType(history),
      resourceEfficiency: this.calculateResourceEfficiency(),
      concurrencyUtilization: this.metrics.peakConcurrency > 0 ? this.metrics.concurrentTasks / this.metrics.peakConcurrency : 0
    };
  }

  private calculateAverageTimesByType(history: typeof this.executionHistory): Record<string, number> {
    const typeGroups = history.reduce((acc, h) => {
      if (!acc[h.taskType]) acc[h.taskType] = [];
      acc[h.taskType].push(h.duration);
      return acc;
    }, {} as Record<string, number[]>);
    
    const averages: Record<string, number> = {};
    for (const [type, durations] of Object.entries(typeGroups)) {
      averages[type] = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    }
    
    return averages;
  }

  private calculateResourceEfficiency(): number {
    // Simple efficiency metric based on resource usage vs task completion
    if (this.metrics.tasksExecuted === 0) return 0;
    
    const totalResourceUnits = this.resourceUsage.cpuUsage + this.resourceUsage.memoryUsage / (1024 * 1024);
    return this.metrics.tasksExecuted / Math.max(totalResourceUnits, 1);
  }

  async shutdown(): Promise<void> {
    const activePromises = Array.from(this.activeExecutions.values());
    await Promise.allSettled(activePromises);

    this.activeExecutions.clear();
    this.executionHistory = [];
    this.removeAllListeners();
  }

  // Mock control methods
  setExecutionDelay(delay: number): void {
    this.executionDelay = delay;
  }

  setFailureRate(rate: number): void {
    this.failureRate = Math.max(0, Math.min(1, rate));
  }

  simulateLoad(level: 'low' | 'medium' | 'high'): void {
    const loadLevels = {
      low: { delay: 100, failure: 0.02 },
      medium: { delay: 300, failure: 0.08 },
      high: { delay: 800, failure: 0.20 }
    };
    
    const config = loadLevels[level];
    this.setExecutionDelay(config.delay);
    this.setFailureRate(config.failure);
  }

  getMetrics() {
    return { ...this.metrics };
  }

  getActiveExecutions(): string[] {
    return Array.from(this.activeExecutions.keys());
  }

  getCurrentResourceUsage() {
    return { ...this.resourceUsage };
  }
}