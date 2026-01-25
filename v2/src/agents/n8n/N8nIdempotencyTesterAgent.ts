/**
 * N8n Idempotency Tester Agent
 *
 * Tests workflows for idempotency, concurrency safety, and duplicate handling:
 * - Duplicate trigger detection and handling
 * - Parallel execution safety analysis
 * - Race condition detection patterns
 * - Locking/mutex pattern analysis
 * - Deduplication key validation
 * - Concurrent webhook handling
 */

import { N8nBaseAgent, N8nAgentConfig } from './N8nBaseAgent';
import { N8nWorkflow, N8nNode } from './types';
import { QETask, AgentCapability } from '../../types';
import {
  N8nTestHarness,
  ConcurrentExecutionConfig,
  ConcurrentExecutionResult,
  ExecutionDifference,
} from './N8nTestHarness';

/**
 * Types of idempotency issues
 */
export type IdempotencyIssueType =
  | 'no-dedup-key'
  | 'weak-dedup-key'
  | 'missing-lock'
  | 'race-condition-risk'
  | 'duplicate-side-effect'
  | 'concurrent-modification'
  | 'non-idempotent-operation'
  | 'missing-upsert'
  | 'counter-increment-unsafe'
  | 'timestamp-collision';

/**
 * Deduplication key analysis result
 */
export interface DedupKeyAnalysis {
  nodeId: string;
  nodeName: string;
  hasDedupKey: boolean;
  dedupKeyExpression?: string;
  keyStrength: 'strong' | 'weak' | 'none';
  issues: string[];
  recommendations: string[];
}

/**
 * Concurrency risk analysis
 */
export interface ConcurrencyRiskAnalysis {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  riskLevel: 'high' | 'medium' | 'low' | 'none';
  risks: ConcurrencyRisk[];
  mitigations: string[];
}

export interface ConcurrencyRisk {
  type: IdempotencyIssueType;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  pattern: string;
}

/**
 * Parallel execution analysis
 */
export interface ParallelExecutionAnalysis {
  hasParallelPaths: boolean;
  parallelBranches: ParallelBranch[];
  sharedStateRisks: SharedStateRisk[];
  recommendations: string[];
}

export interface ParallelBranch {
  branchId: string;
  nodes: string[];
  resourcesAccessed: string[];
}

export interface SharedStateRisk {
  resource: string;
  accessedBy: string[];
  riskType: 'read-write-conflict' | 'write-write-conflict' | 'lost-update';
  severity: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Webhook duplicate analysis
 */
export interface WebhookDuplicateAnalysis {
  webhookNodeId: string;
  hasDeliveryIdCheck: boolean;
  hasTimestampValidation: boolean;
  hasReplayProtection: boolean;
  duplicateHandlingStrategy: 'none' | 'ignore' | 'process' | 'queue';
  recommendations: string[];
}

/**
 * Idempotency test result
 */
export interface IdempotencyTestResult {
  workflowId: string;
  workflowName: string;
  overallScore: number;
  isIdempotent: boolean;
  dedupKeyAnalysis: DedupKeyAnalysis[];
  concurrencyRisks: ConcurrencyRiskAnalysis[];
  parallelExecution: ParallelExecutionAnalysis;
  webhookDuplicates: WebhookDuplicateAnalysis[];
  nonIdempotentOperations: NonIdempotentOperation[];
  lockingPatterns: LockingPatternAnalysis;
  recommendations: string[];
  testDuration: number;
  // NEW: Active concurrent test result
  concurrentTestResult?: ConcurrentTestResult;
}

export interface NonIdempotentOperation {
  nodeId: string;
  nodeName: string;
  operationType: string;
  reason: string;
  canBeMadeIdempotent: boolean;
  suggestion: string;
}

export interface LockingPatternAnalysis {
  hasLocking: boolean;
  lockType?: 'optimistic' | 'pessimistic' | 'advisory' | 'none';
  lockNodes: string[];
  lockScope: 'workflow' | 'node' | 'resource' | 'none';
  recommendations: string[];
}

/**
 * Idempotency test task
 */
export interface IdempotencyTestTask extends QETask {
  type: 'idempotency-test';
  target: string; // workflowId
  workflow?: N8nWorkflow;
  options?: {
    checkDedupKeys?: boolean;
    analyzeConcurrency?: boolean;
    checkParallelPaths?: boolean;
    analyzeWebhooks?: boolean;
    checkLocking?: boolean;
    simulateDuplicates?: boolean;
    // NEW: Active concurrent execution testing
    runConcurrentTest?: boolean; // Actually execute workflow concurrently
    concurrency?: number; // Number of concurrent executions (default: 3)
    testInput?: Record<string, unknown>; // Input data for test executions
    assertIdenticalOutput?: boolean; // Fail if outputs differ
  };
}

/**
 * Result of active concurrent execution test
 */
export interface ConcurrentTestResult {
  executed: boolean;
  concurrency: number;
  allSucceeded: boolean;
  allOutputsIdentical: boolean;
  executionResults: Array<{
    index: number;
    executionId: string;
    status: 'success' | 'error' | 'timeout';
    duration: number;
    outputHash: string;
    error?: string;
  }>;
  differences: ExecutionDifference[];
  sideEffectAnalysis: SideEffectAnalysis;
  summary: string;
}

/**
 * Analysis of side effects from concurrent execution
 */
export interface SideEffectAnalysis {
  duplicatesCreated: boolean;
  resourceConflicts: boolean;
  dataCorruption: boolean;
  details: string[];
}

// Non-idempotent operation patterns
const NON_IDEMPOTENT_PATTERNS: Record<string, { reason: string; suggestion: string }> = {
  // Counter operations
  'increment': {
    reason: 'Counter increments are not idempotent - repeated calls increase value',
    suggestion: 'Use SET with absolute value or implement idempotency key tracking',
  },
  'decrement': {
    reason: 'Counter decrements are not idempotent - repeated calls decrease value',
    suggestion: 'Use SET with absolute value or track processed requests',
  },
  // Append operations
  'append': {
    reason: 'Append operations add duplicate data on retry',
    suggestion: 'Use UPSERT with unique key or check existence before append',
  },
  'push': {
    reason: 'Push to array creates duplicates on retry',
    suggestion: 'Use SET with deduplication or addToSet operation',
  },
  // Insert operations
  'insert': {
    reason: 'INSERT creates duplicate records on retry without unique constraint',
    suggestion: 'Use UPSERT/INSERT...ON CONFLICT or add idempotency key',
  },
  'create': {
    reason: 'CREATE operations may fail or duplicate on retry',
    suggestion: 'Use UPSERT pattern or implement existence check',
  },
  // Send operations
  'sendEmail': {
    reason: 'Email sends are not idempotent - duplicates annoy recipients',
    suggestion: 'Track sent message IDs or use email service idempotency keys',
  },
  'sendMessage': {
    reason: 'Message sends create duplicates on retry',
    suggestion: 'Use message deduplication ID or track sent messages',
  },
  'sendNotification': {
    reason: 'Notifications duplicate on retry',
    suggestion: 'Implement notification deduplication by content hash or ID',
  },
  // Payment operations
  'charge': {
    reason: 'Payment charges are critically non-idempotent - double charges',
    suggestion: 'ALWAYS use payment provider idempotency key',
  },
  'transfer': {
    reason: 'Money transfers must be idempotent to prevent double-transfers',
    suggestion: 'Use transfer ID as idempotency key with payment provider',
  },
  // Queue operations
  'publish': {
    reason: 'Message publishing may create duplicates',
    suggestion: 'Use message deduplication ID in queue configuration',
  },
  'enqueue': {
    reason: 'Queue operations may duplicate messages',
    suggestion: 'Implement message-level deduplication',
  },
};

// Operations that typically support idempotent patterns
const IDEMPOTENT_OPERATIONS = [
  'get', 'read', 'fetch', 'lookup', 'search', 'query', 'list',
  'set', 'put', 'update', 'upsert', 'replace', 'patch',
  'delete', 'remove', // Delete by ID is idempotent
];

// Node types with high concurrency risk
const HIGH_CONCURRENCY_RISK_NODES = [
  'n8n-nodes-base.postgres',
  'n8n-nodes-base.mysql',
  'n8n-nodes-base.mongodb',
  'n8n-nodes-base.redis',
  'n8n-nodes-base.googleSheets',
  'n8n-nodes-base.airtable',
  'n8n-nodes-base.notion',
  'n8n-nodes-base.stripe',
  'n8n-nodes-base.shopify',
];

/**
 * N8n Idempotency Tester Agent
 *
 * Analyzes workflows for idempotency issues, concurrency risks,
 * and duplicate handling patterns.
 */
export class N8nIdempotencyTesterAgent extends N8nBaseAgent {
  constructor(config: N8nAgentConfig) {
    const capabilities: AgentCapability[] = [
      {
        name: 'idempotency-testing',
        version: '1.0.0',
        description: 'Test workflow idempotency and duplicate handling',
        parameters: {},
      },
      {
        name: 'concurrency-analysis',
        version: '1.0.0',
        description: 'Analyze concurrency risks and race conditions',
        parameters: {},
      },
      {
        name: 'duplicate-detection',
        version: '1.0.0',
        description: 'Detect duplicate trigger handling patterns',
        parameters: {},
      },
      {
        name: 'locking-pattern-analysis',
        version: '1.0.0',
        description: 'Analyze locking and mutex patterns',
        parameters: {},
      },
      {
        name: 'concurrent-execution-testing',
        version: '1.0.0',
        description: 'Execute workflow concurrently to verify idempotency',
        parameters: {},
      },
    ];

    super({
      ...config,
      type: 'n8n-idempotency-tester' as any,
      capabilities: [...capabilities, ...(config.capabilities || [])],
    });
  }

  protected async performTask(task: QETask): Promise<IdempotencyTestResult> {
    const idempotencyTask = task as IdempotencyTestTask;

    if (idempotencyTask.type !== 'idempotency-test') {
      throw new Error(`Unsupported task type: ${idempotencyTask.type}`);
    }

    return this.testIdempotency(idempotencyTask.target, idempotencyTask.workflow, idempotencyTask.options);
  }

  /**
   * Run idempotency tests on a workflow
   */
  async testIdempotency(
    workflowId: string,
    providedWorkflow?: N8nWorkflow,
    options?: IdempotencyTestTask['options']
  ): Promise<IdempotencyTestResult> {
    const startTime = Date.now();

    // Get workflow
    let workflow: N8nWorkflow;
    if (providedWorkflow) {
      workflow = providedWorkflow;
    } else {
      workflow = await this.getWorkflow(workflowId);
    }

    const opts = options || {};

    // Run all analyses
    const dedupKeyAnalysis = opts.checkDedupKeys !== false
      ? this.analyzeDedupKeys(workflow)
      : [];

    const concurrencyRisks = opts.analyzeConcurrency !== false
      ? this.analyzeConcurrencyRisks(workflow)
      : [];

    const parallelExecution = opts.checkParallelPaths !== false
      ? this.analyzeParallelExecution(workflow)
      : { hasParallelPaths: false, parallelBranches: [], sharedStateRisks: [], recommendations: [] };

    const webhookDuplicates = opts.analyzeWebhooks !== false
      ? this.analyzeWebhookDuplicates(workflow)
      : [];

    const nonIdempotentOperations = this.findNonIdempotentOperations(workflow);

    const lockingPatterns = opts.checkLocking !== false
      ? this.analyzeLockingPatterns(workflow)
      : { hasLocking: false, lockNodes: [], lockScope: 'none' as const, recommendations: [] };

    // NEW: Run concurrent execution test if requested
    let concurrentTestResult: ConcurrentTestResult | undefined;
    if (opts.runConcurrentTest) {
      concurrentTestResult = await this.runConcurrentExecutionTest(
        workflowId,
        opts.concurrency || 3,
        opts.testInput,
        opts.assertIdenticalOutput
      );

      // Update concurrency risks based on actual test results
      if (concurrentTestResult.sideEffectAnalysis.duplicatesCreated) {
        concurrencyRisks.push({
          nodeId: 'workflow',
          nodeName: 'Workflow',
          nodeType: 'workflow',
          riskLevel: 'high',
          risks: [{
            type: 'duplicate-side-effect',
            description: 'Concurrent execution created duplicate side effects',
            severity: 'critical',
            pattern: 'Observed during active testing',
          }],
          mitigations: ['Implement idempotency key tracking', 'Add deduplication at entry point'],
        });
      }

      if (concurrentTestResult.sideEffectAnalysis.resourceConflicts) {
        concurrencyRisks.push({
          nodeId: 'workflow',
          nodeName: 'Workflow',
          nodeType: 'workflow',
          riskLevel: 'high',
          risks: [{
            type: 'race-condition-risk',
            description: 'Concurrent execution caused resource conflicts',
            severity: 'critical',
            pattern: 'Observed during active testing',
          }],
          mitigations: ['Implement distributed locking', 'Use optimistic concurrency control'],
        });
      }
    }

    // Calculate overall score
    const overallScore = this.calculateIdempotencyScore(
      dedupKeyAnalysis,
      concurrencyRisks,
      parallelExecution,
      webhookDuplicates,
      nonIdempotentOperations,
      lockingPatterns
    );

    // Determine if workflow is idempotent
    const isIdempotent = overallScore >= 80 && nonIdempotentOperations.length === 0;

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      dedupKeyAnalysis,
      concurrencyRisks,
      parallelExecution,
      webhookDuplicates,
      nonIdempotentOperations,
      lockingPatterns
    );

    return {
      workflowId: workflow.id?.toString() || workflowId,
      workflowName: workflow.name,
      overallScore,
      isIdempotent,
      dedupKeyAnalysis,
      concurrencyRisks,
      parallelExecution,
      webhookDuplicates,
      nonIdempotentOperations,
      lockingPatterns,
      recommendations,
      testDuration: Date.now() - startTime,
      concurrentTestResult,
    };
  }

  /**
   * Analyze deduplication keys in workflow
   */
  private analyzeDedupKeys(workflow: N8nWorkflow): DedupKeyAnalysis[] {
    const results: DedupKeyAnalysis[] = [];

    for (const node of workflow.nodes) {
      // Check nodes that should have dedup keys
      if (this.shouldHaveDedupKey(node)) {
        const analysis = this.analyzeNodeDedupKey(node);
        results.push(analysis);
      }
    }

    return results;
  }

  private shouldHaveDedupKey(node: N8nNode): boolean {
    const nodeType = node.type.toLowerCase();
    // Webhook triggers and data modification nodes should have dedup
    return (
      nodeType.includes('webhook') ||
      nodeType.includes('trigger') ||
      HIGH_CONCURRENCY_RISK_NODES.some(t => nodeType.includes(t.replace('n8n-nodes-base.', '')))
    );
  }

  private analyzeNodeDedupKey(node: N8nNode): DedupKeyAnalysis {
    const params = node.parameters || {};
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Look for dedup key patterns
    let dedupKeyExpression: string | undefined;
    let hasDedupKey = false;
    let keyStrength: 'strong' | 'weak' | 'none' = 'none';

    // Check for common dedup key parameter names
    const dedupKeyParams = ['idempotencyKey', 'dedupKey', 'uniqueKey', 'requestId', 'messageId'];
    for (const param of dedupKeyParams) {
      if (params[param]) {
        hasDedupKey = true;
        dedupKeyExpression = String(params[param]);
        break;
      }
    }

    // Check webhook for headers that might be dedup keys
    if (node.type.toLowerCase().includes('webhook')) {
      const webhookParams = params as Record<string, unknown>;
      if (webhookParams.headerAuth || webhookParams.authentication) {
        // May have delivery ID in headers
        recommendations.push('Consider extracting X-Delivery-ID or similar header for deduplication');
      }
    }

    // Evaluate key strength
    if (hasDedupKey && dedupKeyExpression) {
      if (dedupKeyExpression.includes('$json') && dedupKeyExpression.includes('id')) {
        keyStrength = 'strong';
      } else if (dedupKeyExpression.includes('uuid') || dedupKeyExpression.includes('$execution')) {
        keyStrength = 'strong';
      } else if (dedupKeyExpression.includes('timestamp') || dedupKeyExpression.includes('Date')) {
        keyStrength = 'weak';
        issues.push('Timestamp-based dedup keys may have collision risk');
      } else {
        keyStrength = 'weak';
        issues.push('Dedup key expression may not be unique enough');
      }
    }

    if (!hasDedupKey) {
      issues.push('No deduplication key configured');
      recommendations.push('Add idempotency key using unique identifier from input data');
    }

    return {
      nodeId: node.id,
      nodeName: node.name,
      hasDedupKey,
      dedupKeyExpression,
      keyStrength,
      issues,
      recommendations,
    };
  }

  /**
   * Analyze concurrency risks in workflow
   */
  private analyzeConcurrencyRisks(workflow: N8nWorkflow): ConcurrencyRiskAnalysis[] {
    const results: ConcurrencyRiskAnalysis[] = [];

    for (const node of workflow.nodes) {
      const risks = this.analyzeNodeConcurrencyRisks(node, workflow);
      if (risks.risks.length > 0 || risks.riskLevel !== 'none') {
        results.push(risks);
      }
    }

    return results;
  }

  private analyzeNodeConcurrencyRisks(node: N8nNode, workflow: N8nWorkflow): ConcurrencyRiskAnalysis {
    const risks: ConcurrencyRisk[] = [];
    const mitigations: string[] = [];
    const params = node.parameters || {};

    // Check for high-risk node types
    const isHighRiskNode = HIGH_CONCURRENCY_RISK_NODES.some(
      t => node.type.toLowerCase().includes(t.replace('n8n-nodes-base.', ''))
    );

    // Check for write operations
    const operation = (params.operation as string)?.toLowerCase() || '';
    const resource = (params.resource as string)?.toLowerCase() || '';

    // Detect non-atomic operations
    if (operation === 'update' || operation === 'upsert') {
      if (!this.hasOptimisticLocking(params)) {
        risks.push({
          type: 'race-condition-risk',
          description: `Update operation without optimistic locking in ${node.name}`,
          severity: isHighRiskNode ? 'high' : 'medium',
          pattern: 'read-modify-write without version check',
        });
        mitigations.push('Add version field or ETag check for optimistic locking');
      }
    }

    // Check for counter operations
    if (operation.includes('increment') || operation.includes('decrement')) {
      risks.push({
        type: 'counter-increment-unsafe',
        description: `Counter operation may cause race condition in ${node.name}`,
        severity: 'high',
        pattern: 'concurrent counter modification',
      });
      mitigations.push('Use atomic increment operation or implement distributed lock');
    }

    // Check for insert without unique constraint
    if (operation === 'insert' || operation === 'create') {
      risks.push({
        type: 'duplicate-side-effect',
        description: `Insert may create duplicates on concurrent execution in ${node.name}`,
        severity: 'medium',
        pattern: 'insert without uniqueness guarantee',
      });
      mitigations.push('Use UPSERT or add unique constraint with ON CONFLICT handling');
    }

    // Determine risk level
    let riskLevel: 'high' | 'medium' | 'low' | 'none' = 'none';
    if (risks.some(r => r.severity === 'critical')) {
      riskLevel = 'high';
    } else if (risks.some(r => r.severity === 'high')) {
      riskLevel = 'high';
    } else if (risks.some(r => r.severity === 'medium')) {
      riskLevel = 'medium';
    } else if (risks.length > 0) {
      riskLevel = 'low';
    }

    return {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      riskLevel,
      risks,
      mitigations,
    };
  }

  private hasOptimisticLocking(params: Record<string, unknown>): boolean {
    // Check for version/etag fields in conditions
    const conditions = JSON.stringify(params).toLowerCase();
    return (
      conditions.includes('version') ||
      conditions.includes('etag') ||
      conditions.includes('_rev') ||
      conditions.includes('updatedAt')
    );
  }

  /**
   * Analyze parallel execution paths
   */
  private analyzeParallelExecution(workflow: N8nWorkflow): ParallelExecutionAnalysis {
    const parallelBranches: ParallelBranch[] = [];
    const sharedStateRisks: SharedStateRisk[] = [];
    const recommendations: string[] = [];

    // Find nodes with multiple outputs (split points)
    const splitNodes = workflow.nodes.filter(node => {
      const connections = workflow.connections[node.name];
      if (!connections || !connections.main) return false;
      // Check if node has multiple output branches
      return connections.main.length > 1 || connections.main.some(output => output && output.length > 1);
    });

    if (splitNodes.length === 0) {
      return {
        hasParallelPaths: false,
        parallelBranches: [],
        sharedStateRisks: [],
        recommendations: [],
      };
    }

    // Analyze each split point
    for (const splitNode of splitNodes) {
      const branches = this.traceBranches(splitNode, workflow);
      parallelBranches.push(...branches);
    }

    // Find shared state risks between branches
    const resourcesByBranch = new Map<string, Set<string>>();
    for (const branch of parallelBranches) {
      resourcesByBranch.set(branch.branchId, new Set(branch.resourcesAccessed));
    }

    // Check for overlapping resources
    const branchIds = Array.from(resourcesByBranch.keys());
    for (let i = 0; i < branchIds.length; i++) {
      for (let j = i + 1; j < branchIds.length; j++) {
        const branch1Resources = resourcesByBranch.get(branchIds[i])!;
        const branch2Resources = resourcesByBranch.get(branchIds[j])!;

        for (const resource of branch1Resources) {
          if (branch2Resources.has(resource)) {
            sharedStateRisks.push({
              resource,
              accessedBy: [branchIds[i], branchIds[j]],
              riskType: 'write-write-conflict',
              severity: 'high',
            });
          }
        }
      }
    }

    if (sharedStateRisks.length > 0) {
      recommendations.push('Consider serializing access to shared resources');
      recommendations.push('Implement distributed locking for concurrent resource access');
      recommendations.push('Use optimistic locking with retry for conflict resolution');
    }

    return {
      hasParallelPaths: parallelBranches.length > 0,
      parallelBranches,
      sharedStateRisks,
      recommendations,
    };
  }

  private traceBranches(splitNode: N8nNode, workflow: N8nWorkflow): ParallelBranch[] {
    const branches: ParallelBranch[] = [];
    const connections = workflow.connections[splitNode.name];

    if (!connections || !connections.main) return branches;

    let branchIndex = 0;
    for (const outputConnections of connections.main) {
      if (!outputConnections) continue;

      for (const connection of outputConnections) {
        const branchNodes: string[] = [];
        const resourcesAccessed: string[] = [];

        // Trace this branch
        this.traceBranchNodes(
          connection.node,
          workflow,
          branchNodes,
          resourcesAccessed,
          new Set()
        );

        if (branchNodes.length > 0) {
          branches.push({
            branchId: `${splitNode.name}-branch-${branchIndex++}`,
            nodes: branchNodes,
            resourcesAccessed,
          });
        }
      }
    }

    return branches;
  }

  private traceBranchNodes(
    nodeName: string,
    workflow: N8nWorkflow,
    nodes: string[],
    resources: string[],
    visited: Set<string>
  ): void {
    if (visited.has(nodeName)) return;
    visited.add(nodeName);

    const node = workflow.nodes.find(n => n.name === nodeName);
    if (!node) return;

    nodes.push(nodeName);

    // Extract resources accessed
    const params = node.parameters || {};
    if (params.table) resources.push(`table:${params.table}`);
    if (params.collection) resources.push(`collection:${params.collection}`);
    if (params.sheetName) resources.push(`sheet:${params.sheetName}`);
    if (params.database) resources.push(`database:${params.database}`);

    // Continue to next nodes
    const connections = workflow.connections[nodeName];
    if (!connections || !connections.main) return;

    for (const outputConnections of connections.main) {
      if (!outputConnections) continue;

      for (const connection of outputConnections) {
        this.traceBranchNodes(connection.node, workflow, nodes, resources, visited);
      }
    }
  }

  /**
   * Analyze webhook duplicate handling
   */
  private analyzeWebhookDuplicates(workflow: N8nWorkflow): WebhookDuplicateAnalysis[] {
    const results: WebhookDuplicateAnalysis[] = [];

    const webhookNodes = workflow.nodes.filter(
      node => node.type.toLowerCase().includes('webhook')
    );

    for (const webhook of webhookNodes) {
      const analysis = this.analyzeWebhookNode(webhook, workflow);
      results.push(analysis);
    }

    return results;
  }

  private analyzeWebhookNode(node: N8nNode, workflow: N8nWorkflow): WebhookDuplicateAnalysis {
    const params = node.parameters || {};
    const recommendations: string[] = [];

    // Check for delivery ID handling
    const hasDeliveryIdCheck = this.checkForDeliveryIdHandling(node, workflow);
    if (!hasDeliveryIdCheck) {
      recommendations.push('Extract and validate X-Delivery-ID or similar header for deduplication');
    }

    // Check for timestamp validation
    const hasTimestampValidation = this.checkForTimestampValidation(node, workflow);
    if (!hasTimestampValidation) {
      recommendations.push('Add timestamp validation to reject stale webhook deliveries');
    }

    // Check for replay protection
    const hasReplayProtection = hasDeliveryIdCheck || hasTimestampValidation;
    if (!hasReplayProtection) {
      recommendations.push('Implement replay protection using nonce or sliding window');
    }

    // Determine duplicate handling strategy
    let duplicateHandlingStrategy: 'none' | 'ignore' | 'process' | 'queue' = 'none';
    if (hasDeliveryIdCheck) {
      duplicateHandlingStrategy = 'ignore';
    }

    return {
      webhookNodeId: node.id,
      hasDeliveryIdCheck,
      hasTimestampValidation,
      hasReplayProtection,
      duplicateHandlingStrategy,
      recommendations,
    };
  }

  private checkForDeliveryIdHandling(node: N8nNode, workflow: N8nWorkflow): boolean {
    // Check if there's a node after webhook that extracts delivery ID
    const connections = workflow.connections[node.name];
    if (!connections || !connections.main) return false;

    // Look for IF/Switch nodes checking for headers
    for (const outputConnections of connections.main) {
      if (!outputConnections) continue;

      for (const connection of outputConnections) {
        const nextNode = workflow.nodes.find(n => n.name === connection.node);
        if (nextNode) {
          const params = JSON.stringify(nextNode.parameters || {}).toLowerCase();
          if (
            params.includes('delivery') ||
            params.includes('idempotency') ||
            params.includes('x-request-id')
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private checkForTimestampValidation(node: N8nNode, workflow: N8nWorkflow): boolean {
    // Similar check for timestamp validation
    const connections = workflow.connections[node.name];
    if (!connections || !connections.main) return false;

    for (const outputConnections of connections.main) {
      if (!outputConnections) continue;

      for (const connection of outputConnections) {
        const nextNode = workflow.nodes.find(n => n.name === connection.node);
        if (nextNode) {
          const params = JSON.stringify(nextNode.parameters || {}).toLowerCase();
          if (
            params.includes('timestamp') &&
            (params.includes('compare') || params.includes('greater') || params.includes('less'))
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Find non-idempotent operations
   */
  private findNonIdempotentOperations(workflow: N8nWorkflow): NonIdempotentOperation[] {
    const results: NonIdempotentOperation[] = [];

    for (const node of workflow.nodes) {
      const params = node.parameters || {};
      const operation = (params.operation as string)?.toLowerCase() || '';
      const method = (params.method as string)?.toLowerCase() || '';

      // Check operation against non-idempotent patterns
      for (const [pattern, info] of Object.entries(NON_IDEMPOTENT_PATTERNS)) {
        if (operation.includes(pattern) || method.includes(pattern) || node.name.toLowerCase().includes(pattern)) {
          results.push({
            nodeId: node.id,
            nodeName: node.name,
            operationType: operation || method || pattern,
            reason: info.reason,
            canBeMadeIdempotent: true,
            suggestion: info.suggestion,
          });
          break;
        }
      }

      // Check for idempotent operations (no issue)
      const isIdempotent = IDEMPOTENT_OPERATIONS.some(
        op => operation.includes(op) || method.includes(op)
      );

      if (!isIdempotent && !results.some(r => r.nodeId === node.id)) {
        // Unknown operation - flag for review
        if (operation && !['execute', 'run', 'process'].includes(operation)) {
          // Don't flag generic operations, but flag specific ones we don't recognize
        }
      }
    }

    return results;
  }

  /**
   * Analyze locking patterns
   */
  private analyzeLockingPatterns(workflow: N8nWorkflow): LockingPatternAnalysis {
    const lockNodes: string[] = [];
    const recommendations: string[] = [];
    let hasLocking = false;
    let lockType: 'optimistic' | 'pessimistic' | 'advisory' | 'none' = 'none';
    let lockScope: 'workflow' | 'node' | 'resource' | 'none' = 'none';

    for (const node of workflow.nodes) {
      const params = node.parameters || {};
      const paramsStr = JSON.stringify(params).toLowerCase();

      // Check for Redis locks
      if (node.type.toLowerCase().includes('redis')) {
        if (paramsStr.includes('setnx') || paramsStr.includes('lock')) {
          hasLocking = true;
          lockType = 'pessimistic';
          lockScope = 'resource';
          lockNodes.push(node.name);
        }
      }

      // Check for optimistic locking patterns
      if (
        paramsStr.includes('version') ||
        paramsStr.includes('etag') ||
        paramsStr.includes('_rev')
      ) {
        hasLocking = true;
        lockType = 'optimistic';
        lockScope = 'resource';
        lockNodes.push(node.name);
      }

      // Check for database locks
      if (paramsStr.includes('for update') || paramsStr.includes('lock')) {
        hasLocking = true;
        lockType = 'pessimistic';
        lockScope = 'resource';
        lockNodes.push(node.name);
      }
    }

    if (!hasLocking) {
      recommendations.push('Consider implementing locking for concurrent workflow executions');
      recommendations.push('Use Redis SETNX for distributed locks');
      recommendations.push('Implement optimistic locking with version fields for database operations');
    } else {
      if (lockType === 'pessimistic') {
        recommendations.push('Ensure locks have TTL to prevent deadlocks');
        recommendations.push('Implement lock retry with exponential backoff');
      }
    }

    return {
      hasLocking,
      lockType: hasLocking ? lockType : undefined,
      lockNodes,
      lockScope,
      recommendations,
    };
  }

  /**
   * Calculate overall idempotency score
   */
  private calculateIdempotencyScore(
    dedupKeyAnalysis: DedupKeyAnalysis[],
    concurrencyRisks: ConcurrencyRiskAnalysis[],
    parallelExecution: ParallelExecutionAnalysis,
    webhookDuplicates: WebhookDuplicateAnalysis[],
    nonIdempotentOperations: NonIdempotentOperation[],
    lockingPatterns: LockingPatternAnalysis
  ): number {
    let score = 100;

    // Deduct for missing dedup keys
    for (const analysis of dedupKeyAnalysis) {
      if (!analysis.hasDedupKey) {
        score -= 10;
      } else if (analysis.keyStrength === 'weak') {
        score -= 5;
      }
    }

    // Deduct for concurrency risks
    for (const risk of concurrencyRisks) {
      if (risk.riskLevel === 'high') {
        score -= 15;
      } else if (risk.riskLevel === 'medium') {
        score -= 8;
      } else if (risk.riskLevel === 'low') {
        score -= 3;
      }
    }

    // Deduct for parallel execution without protection
    if (parallelExecution.hasParallelPaths) {
      score -= 5 * parallelExecution.sharedStateRisks.length;
    }

    // Deduct for webhook without duplicate handling
    for (const webhook of webhookDuplicates) {
      if (!webhook.hasReplayProtection) {
        score -= 10;
      }
    }

    // Deduct for non-idempotent operations
    score -= 10 * nonIdempotentOperations.length;

    // Bonus for having locking
    if (lockingPatterns.hasLocking) {
      score += 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    dedupKeyAnalysis: DedupKeyAnalysis[],
    concurrencyRisks: ConcurrencyRiskAnalysis[],
    parallelExecution: ParallelExecutionAnalysis,
    webhookDuplicates: WebhookDuplicateAnalysis[],
    nonIdempotentOperations: NonIdempotentOperation[],
    lockingPatterns: LockingPatternAnalysis
  ): string[] {
    const recommendations: string[] = [];

    // High-priority: non-idempotent operations
    if (nonIdempotentOperations.length > 0) {
      recommendations.push(
        `CRITICAL: ${nonIdempotentOperations.length} non-idempotent operations detected - fix before production`
      );
      for (const op of nonIdempotentOperations.slice(0, 3)) {
        recommendations.push(`  - ${op.nodeName}: ${op.suggestion}`);
      }
    }

    // Webhook handling
    const unprotectedWebhooks = webhookDuplicates.filter(w => !w.hasReplayProtection);
    if (unprotectedWebhooks.length > 0) {
      recommendations.push(
        `Add replay protection to ${unprotectedWebhooks.length} webhook trigger(s)`
      );
    }

    // Concurrency risks
    const highRisks = concurrencyRisks.filter(r => r.riskLevel === 'high');
    if (highRisks.length > 0) {
      recommendations.push(
        `Address ${highRisks.length} high concurrency risk node(s)`
      );
    }

    // Parallel execution
    if (parallelExecution.sharedStateRisks.length > 0) {
      recommendations.push(
        'Implement synchronization for shared resources in parallel branches'
      );
    }

    // Locking patterns
    recommendations.push(...lockingPatterns.recommendations);

    // Dedup keys
    const missingDedup = dedupKeyAnalysis.filter(d => !d.hasDedupKey);
    if (missingDedup.length > 0) {
      recommendations.push(
        `Add deduplication keys to ${missingDedup.length} node(s)`
      );
    }

    return [...new Set(recommendations)]; // Remove duplicates
  }

  // ============================================================================
  // Active Concurrent Execution Testing
  // ============================================================================

  /**
   * Run concurrent execution test to verify idempotency
   * This actually executes the workflow multiple times simultaneously
   */
  async runConcurrentExecutionTest(
    workflowId: string,
    concurrency: number,
    testInput?: Record<string, unknown>,
    assertIdenticalOutput?: boolean
  ): Promise<ConcurrentTestResult> {
    const harness = new N8nTestHarness(this.n8nConfig);

    try {
      // Configure concurrent execution
      const config: ConcurrentExecutionConfig = {
        concurrency,
        staggerMs: 0, // No stagger - true concurrent execution
        inputVariations: Array(concurrency).fill(testInput || {}),
        timeout: 60000,
      };

      // Execute concurrently
      const result = await harness.executeConcurrently(workflowId, config);

      // Analyze results
      const executionResults = result.executions.map(exec => ({
        index: exec.index,
        executionId: exec.executionId,
        status: exec.status,
        duration: exec.duration,
        outputHash: this.hashOutput(exec.output),
        error: exec.error,
      }));

      // Check for side effects
      const sideEffectAnalysis = this.analyzeSideEffects(result);

      // Check if all outputs are identical
      const allOutputsIdentical = result.allIdentical;

      // Generate summary
      const summary = this.generateConcurrentTestSummary(
        concurrency,
        result.executions.filter(e => e.status === 'success').length,
        allOutputsIdentical,
        sideEffectAnalysis,
        result.timing
      );

      // Emit event
      this.emitEvent('idempotency.concurrent-test.completed', {
        workflowId,
        concurrency,
        allSucceeded: result.executions.every(e => e.status === 'success'),
        allIdentical: allOutputsIdentical,
        differences: result.differences.length,
      });

      return {
        executed: true,
        concurrency,
        allSucceeded: result.executions.every(e => e.status === 'success'),
        allOutputsIdentical,
        executionResults,
        differences: result.differences,
        sideEffectAnalysis,
        summary,
      };
    } catch (error) {
      return {
        executed: false,
        concurrency,
        allSucceeded: false,
        allOutputsIdentical: false,
        executionResults: [],
        differences: [],
        sideEffectAnalysis: {
          duplicatesCreated: false,
          resourceConflicts: false,
          dataCorruption: false,
          details: [`Test execution failed: ${(error as Error).message}`],
        },
        summary: `Concurrent test failed: ${(error as Error).message}`,
      };
    } finally {
      await harness.cleanup();
    }
  }

  /**
   * Analyze side effects from concurrent execution
   */
  private analyzeSideEffects(result: ConcurrentExecutionResult): SideEffectAnalysis {
    const details: string[] = [];
    let duplicatesCreated = false;
    let resourceConflicts = false;
    let dataCorruption = false;

    // Check for duplicate outputs (same data created multiple times)
    const outputHashes = new Map<string, number>();
    for (const exec of result.executions) {
      const hash = this.hashOutput(exec.output);
      outputHashes.set(hash, (outputHashes.get(hash) || 0) + 1);
    }

    // If all outputs are identical, that's good for idempotency
    // But we need to check if they indicate duplicate side effects
    if (result.allIdentical && result.executions.length > 1) {
      // Check if outputs contain duplicate indicators
      const firstOutput = result.executions[0]?.output;
      if (firstOutput) {
        const outputStr = JSON.stringify(firstOutput);
        if (outputStr.includes('duplicate') || outputStr.includes('already exists')) {
          duplicatesCreated = true;
          details.push('Output indicates duplicate detection triggered');
        }
      }
    }

    // Check for errors that indicate conflicts
    for (const exec of result.executions) {
      if (exec.error) {
        if (exec.error.toLowerCase().includes('conflict') ||
            exec.error.toLowerCase().includes('locked') ||
            exec.error.toLowerCase().includes('deadlock')) {
          resourceConflicts = true;
          details.push(`Resource conflict detected: ${exec.error}`);
        }
        if (exec.error.toLowerCase().includes('corrupt') ||
            exec.error.toLowerCase().includes('invalid state')) {
          dataCorruption = true;
          details.push(`Data corruption detected: ${exec.error}`);
        }
      }
    }

    // Check for differences that indicate non-idempotent behavior
    if (result.differences.length > 0) {
      // Analyze types of differences
      const valueChanges = result.differences.filter(d => d.differenceType === 'value-changed');
      if (valueChanges.length > 0) {
        details.push(`${valueChanges.length} output value(s) differed between executions`);

        // Check if differences are in fields that should be idempotent
        for (const diff of valueChanges.slice(0, 5)) {
          const fieldLower = diff.fieldPath.toLowerCase();
          if (fieldLower.includes('count') ||
              fieldLower.includes('total') ||
              fieldLower.includes('sum')) {
            duplicatesCreated = true;
            details.push(`Counter field '${diff.fieldPath}' changed: may indicate duplicate processing`);
          }
          if (fieldLower.includes('id') && !fieldLower.includes('timestamp')) {
            duplicatesCreated = true;
            details.push(`ID field '${diff.fieldPath}' differs: may indicate duplicate record creation`);
          }
        }
      }
    }

    // If no issues detected, add positive message
    if (!duplicatesCreated && !resourceConflicts && !dataCorruption) {
      details.push('No side effect issues detected during concurrent execution');
    }

    return {
      duplicatesCreated,
      resourceConflicts,
      dataCorruption,
      details,
    };
  }

  /**
   * Generate summary of concurrent test
   */
  private generateConcurrentTestSummary(
    concurrency: number,
    successCount: number,
    allIdentical: boolean,
    sideEffects: SideEffectAnalysis,
    timing: { avgMs: number; minMs: number; maxMs: number }
  ): string {
    const parts: string[] = [];

    parts.push(`Executed ${concurrency} concurrent workflow instances`);
    parts.push(`${successCount}/${concurrency} succeeded`);

    if (allIdentical) {
      parts.push('All outputs were identical (good for idempotency)');
    } else {
      parts.push('⚠️ Outputs differed between executions');
    }

    if (sideEffects.duplicatesCreated) {
      parts.push('⚠️ Duplicate side effects detected');
    }
    if (sideEffects.resourceConflicts) {
      parts.push('⚠️ Resource conflicts occurred');
    }
    if (sideEffects.dataCorruption) {
      parts.push('❌ Data corruption detected');
    }

    parts.push(`Timing: avg ${timing.avgMs}ms, min ${timing.minMs}ms, max ${timing.maxMs}ms`);

    return parts.join('. ');
  }

  /**
   * Hash output for comparison
   */
  private hashOutput(output: Record<string, unknown>): string {
    const str = JSON.stringify(output, Object.keys(output).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Quick idempotency check - runs a fast concurrent test
   */
  async quickIdempotencyCheck(
    workflowId: string,
    testInput?: Record<string, unknown>
  ): Promise<{
    isIdempotent: boolean;
    concurrentTestPassed: boolean;
    issues: string[];
  }> {
    const result = await this.testIdempotency(workflowId, undefined, {
      runConcurrentTest: true,
      concurrency: 2,
      testInput,
      assertIdenticalOutput: true,
    });

    const issues: string[] = [];

    if (result.nonIdempotentOperations.length > 0) {
      issues.push(...result.nonIdempotentOperations.map(op => op.reason));
    }

    if (result.concurrentTestResult && !result.concurrentTestResult.allOutputsIdentical) {
      issues.push('Concurrent executions produced different outputs');
    }

    if (result.concurrentTestResult?.sideEffectAnalysis.duplicatesCreated) {
      issues.push('Concurrent execution created duplicate side effects');
    }

    return {
      isIdempotent: result.isIdempotent,
      concurrentTestPassed: result.concurrentTestResult?.allSucceeded && result.concurrentTestResult?.allOutputsIdentical || false,
      issues,
    };
  }
}
