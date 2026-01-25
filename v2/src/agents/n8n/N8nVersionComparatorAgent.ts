/**
 * N8nVersionComparatorAgent
 *
 * Version comparison and compatibility testing:
 * - Workflow version diff analysis
 * - Breaking change detection
 * - Migration path validation
 * - Backward compatibility checks
 */

import { N8nBaseAgent, N8nAgentConfig } from './N8nBaseAgent';
import {
  N8nWorkflow,
  N8nNode,
} from './types';
import { QETask, AgentCapability } from '../../types';

export interface VersionCompareTask extends QETask {
  type: 'version-compare';
  target: string; // workflowId
  options?: {
    compareVersionId?: string;
    compareWorkflow?: N8nWorkflow;
    checkBackwardCompatibility?: boolean;
    generateMigrationPath?: boolean;
    analyzeBreakingChanges?: boolean;
  };
}

export interface VersionCompareResult {
  workflowId: string;
  sourceVersion: WorkflowVersion;
  targetVersion: WorkflowVersion;
  differences: WorkflowDiff;
  breakingChanges: BreakingChange[];
  migrationPath?: MigrationPath;
  compatibility: CompatibilityReport;
  recommendations: string[];
}

export interface WorkflowVersion {
  id: string;
  name: string;
  createdAt?: Date;
  updatedAt?: Date;
  nodeCount: number;
  connectionCount: number;
  hash: string;
}

export interface WorkflowDiff {
  nodesAdded: N8nNode[];
  nodesRemoved: N8nNode[];
  nodesModified: NodeModification[];
  connectionsAdded: ConnectionChange[];
  connectionsRemoved: ConnectionChange[];
  settingsChanged: SettingChange[];
  summary: {
    totalChanges: number;
    addedCount: number;
    removedCount: number;
    modifiedCount: number;
    severity: 'none' | 'minor' | 'moderate' | 'major';
  };
}

export interface NodeModification {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  changes: PropertyChange[];
  severity: 'minor' | 'moderate' | 'major';
}

export interface PropertyChange {
  path: string;
  oldValue: unknown;
  newValue: unknown;
  type: 'added' | 'removed' | 'modified';
  breaking: boolean;
}

export interface ConnectionChange {
  fromNode: string;
  toNode: string;
  outputIndex: number;
  inputIndex: number;
}

export interface SettingChange {
  setting: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface BreakingChange {
  type: 'node-removed' | 'connection-broken' | 'parameter-removed' | 'type-changed' | 'required-added';
  severity: 'warning' | 'error' | 'critical';
  location: string;
  description: string;
  impact: string;
  remediation: string;
}

export interface MigrationPath {
  steps: MigrationStep[];
  estimatedEffort: 'trivial' | 'minor' | 'moderate' | 'significant' | 'major';
  automated: boolean;
  risks: string[];
}

export interface MigrationStep {
  order: number;
  action: string;
  target: string;
  details: string;
  automated: boolean;
}

export interface CompatibilityReport {
  isBackwardCompatible: boolean;
  isForwardCompatible: boolean;
  compatibilityScore: number; // 0-100
  issues: CompatibilityIssue[];
}

export interface CompatibilityIssue {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  affected: string[];
}

export class N8nVersionComparatorAgent extends N8nBaseAgent {
  private workflowVersions: Map<string, N8nWorkflow[]> = new Map();

  constructor(config: N8nAgentConfig) {
    const capabilities: AgentCapability[] = [
      {
        name: 'diff-analysis',
        version: '1.0.0',
        description: 'Analyze differences between workflow versions',
        parameters: {},
      },
      {
        name: 'breaking-change-detection',
        version: '1.0.0',
        description: 'Detect breaking changes between versions',
        parameters: {},
      },
      {
        name: 'migration-planning',
        version: '1.0.0',
        description: 'Generate migration paths between versions',
        parameters: {},
      },
      {
        name: 'compatibility-checking',
        version: '1.0.0',
        description: 'Check version compatibility',
        parameters: {},
      },
    ];

    super({
      ...config,
      type: 'n8n-version-comparator' as any,
      capabilities: [...capabilities, ...(config.capabilities || [])],
    });
  }

  protected async performTask(task: QETask): Promise<VersionCompareResult> {
    const compareTask = task as VersionCompareTask;

    if (compareTask.type !== 'version-compare') {
      throw new Error(`Unsupported task type: ${compareTask.type}`);
    }

    return this.compareVersions(compareTask.target, compareTask.options);
  }

  /**
   * Compare two workflow versions
   */
  async compareVersions(
    workflowId: string,
    options?: VersionCompareTask['options']
  ): Promise<VersionCompareResult> {
    const currentWorkflow = await this.getWorkflow(workflowId);

    // Get comparison workflow
    let compareWorkflow: N8nWorkflow;
    if (options?.compareWorkflow) {
      compareWorkflow = options.compareWorkflow;
    } else if (options?.compareVersionId) {
      compareWorkflow = await this.getWorkflow(options.compareVersionId);
    } else {
      // Get previous version from history
      compareWorkflow = this.getPreviousVersion(workflowId) || currentWorkflow;
    }

    // Calculate versions
    const sourceVersion = this.extractVersion(compareWorkflow);
    const targetVersion = this.extractVersion(currentWorkflow);

    // Generate diff
    const differences = this.generateDiff(compareWorkflow, currentWorkflow);

    // Detect breaking changes
    const breakingChanges = options?.analyzeBreakingChanges !== false
      ? this.detectBreakingChanges(differences)
      : [];

    // Generate migration path
    const migrationPath = options?.generateMigrationPath
      ? this.generateMigrationPath(differences, breakingChanges)
      : undefined;

    // Check compatibility
    const compatibility = options?.checkBackwardCompatibility !== false
      ? this.checkCompatibility(differences, breakingChanges)
      : this.getDefaultCompatibility();

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      differences,
      breakingChanges,
      compatibility
    );

    const result: VersionCompareResult = {
      workflowId,
      sourceVersion,
      targetVersion,
      differences,
      breakingChanges,
      migrationPath,
      compatibility,
      recommendations,
    };

    // Store version for history
    this.storeVersion(workflowId, currentWorkflow);

    // Store result
    await this.storeTestResult(`version-compare:${workflowId}`, result);

    // Emit event
    this.emitEvent('version.compare.completed', {
      workflowId,
      totalChanges: differences.summary.totalChanges,
      breakingChanges: breakingChanges.length,
      isCompatible: compatibility.isBackwardCompatible,
    });

    return result;
  }

  /**
   * Extract version info from workflow
   */
  private extractVersion(workflow: N8nWorkflow): WorkflowVersion {
    return {
      id: workflow.id,
      name: workflow.name,
      createdAt: workflow.createdAt ? new Date(workflow.createdAt) : undefined,
      updatedAt: workflow.updatedAt ? new Date(workflow.updatedAt) : undefined,
      nodeCount: workflow.nodes.length,
      connectionCount: Object.keys(workflow.connections).length,
      hash: this.hashWorkflow(workflow),
    };
  }

  /**
   * Generate hash for workflow
   */
  private hashWorkflow(workflow: N8nWorkflow): string {
    const content = JSON.stringify({
      nodes: workflow.nodes.map(n => ({
        type: n.type,
        name: n.name,
        parameters: n.parameters,
      })),
      connections: workflow.connections,
    });

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Generate diff between two workflows
   */
  private generateDiff(source: N8nWorkflow, target: N8nWorkflow): WorkflowDiff {
    const sourceNodeMap = new Map(source.nodes.map(n => [n.id, n]));
    const targetNodeMap = new Map(target.nodes.map(n => [n.id, n]));

    const nodesAdded: N8nNode[] = [];
    const nodesRemoved: N8nNode[] = [];
    const nodesModified: NodeModification[] = [];

    // Find added and modified nodes
    for (const [id, targetNode] of targetNodeMap) {
      const sourceNode = sourceNodeMap.get(id);
      if (!sourceNode) {
        nodesAdded.push(targetNode);
      } else {
        const changes = this.compareNodes(sourceNode, targetNode);
        if (changes.length > 0) {
          nodesModified.push({
            nodeId: id,
            nodeName: targetNode.name,
            nodeType: targetNode.type,
            changes,
            severity: this.calculateModificationSeverity(changes),
          });
        }
      }
    }

    // Find removed nodes
    for (const [id, sourceNode] of sourceNodeMap) {
      if (!targetNodeMap.has(id)) {
        nodesRemoved.push(sourceNode);
      }
    }

    // Compare connections
    const connectionsAdded = this.findAddedConnections(source, target);
    const connectionsRemoved = this.findRemovedConnections(source, target);

    // Compare settings
    const settingsChanged = this.compareSettings(source, target);

    // Calculate summary
    const totalChanges = nodesAdded.length + nodesRemoved.length +
      nodesModified.length + connectionsAdded.length +
      connectionsRemoved.length + settingsChanged.length;

    let severity: WorkflowDiff['summary']['severity'];
    if (nodesRemoved.length > 0 || connectionsRemoved.length > 0) {
      severity = 'major';
    } else if (nodesModified.some(m => m.severity === 'major')) {
      severity = 'major';
    } else if (nodesAdded.length > 0 || nodesModified.length > 0) {
      severity = 'moderate';
    } else if (settingsChanged.length > 0) {
      severity = 'minor';
    } else {
      severity = 'none';
    }

    return {
      nodesAdded,
      nodesRemoved,
      nodesModified,
      connectionsAdded,
      connectionsRemoved,
      settingsChanged,
      summary: {
        totalChanges,
        addedCount: nodesAdded.length + connectionsAdded.length,
        removedCount: nodesRemoved.length + connectionsRemoved.length,
        modifiedCount: nodesModified.length + settingsChanged.length,
        severity,
      },
    };
  }

  /**
   * Compare two nodes
   */
  private compareNodes(source: N8nNode, target: N8nNode): PropertyChange[] {
    const changes: PropertyChange[] = [];

    // Compare type
    if (source.type !== target.type) {
      changes.push({
        path: 'type',
        oldValue: source.type,
        newValue: target.type,
        type: 'modified',
        breaking: true,
      });
    }

    // Compare name
    if (source.name !== target.name) {
      changes.push({
        path: 'name',
        oldValue: source.name,
        newValue: target.name,
        type: 'modified',
        breaking: false,
      });
    }

    // Compare parameters
    this.compareObjects(
      source.parameters,
      target.parameters,
      'parameters',
      changes
    );

    // Compare credentials
    if (JSON.stringify(source.credentials) !== JSON.stringify(target.credentials)) {
      changes.push({
        path: 'credentials',
        oldValue: source.credentials,
        newValue: target.credentials,
        type: 'modified',
        breaking: true,
      });
    }

    return changes;
  }

  /**
   * Compare objects recursively
   */
  private compareObjects(
    source: Record<string, unknown>,
    target: Record<string, unknown>,
    basePath: string,
    changes: PropertyChange[]
  ): void {
    const sourceKeys = new Set(Object.keys(source || {}));
    const targetKeys = new Set(Object.keys(target || {}));

    // Check removed keys
    for (const key of sourceKeys) {
      if (!targetKeys.has(key)) {
        changes.push({
          path: `${basePath}.${key}`,
          oldValue: source[key],
          newValue: undefined,
          type: 'removed',
          breaking: true,
        });
      }
    }

    // Check added and modified keys
    for (const key of targetKeys) {
      const path = `${basePath}.${key}`;
      if (!sourceKeys.has(key)) {
        changes.push({
          path,
          oldValue: undefined,
          newValue: target[key],
          type: 'added',
          breaking: false,
        });
      } else if (JSON.stringify(source[key]) !== JSON.stringify(target[key])) {
        changes.push({
          path,
          oldValue: source[key],
          newValue: target[key],
          type: 'modified',
          breaking: this.isBreakingParameterChange(key),
        });
      }
    }
  }

  /**
   * Check if parameter change is breaking
   */
  private isBreakingParameterChange(paramName: string): boolean {
    const breakingParams = [
      'operation', 'resource', 'method', 'url', 'authentication',
      'credentials', 'mode', 'table', 'database',
    ];
    return breakingParams.includes(paramName.toLowerCase());
  }

  /**
   * Calculate modification severity
   */
  private calculateModificationSeverity(
    changes: PropertyChange[]
  ): NodeModification['severity'] {
    if (changes.some(c => c.breaking && c.type === 'removed')) {
      return 'major';
    }
    if (changes.some(c => c.breaking)) {
      return 'moderate';
    }
    return 'minor';
  }

  /**
   * Find added connections
   */
  private findAddedConnections(
    source: N8nWorkflow,
    target: N8nWorkflow
  ): ConnectionChange[] {
    const changes: ConnectionChange[] = [];
    const sourceConnStr = this.serializeConnections(source.connections);

    for (const [fromNode, outputs] of Object.entries(target.connections)) {
      for (const [outputType, connectionArrays] of Object.entries(outputs)) {
        for (let outputIndex = 0; outputIndex < connectionArrays.length; outputIndex++) {
          for (const conn of connectionArrays[outputIndex]) {
            const connKey = `${fromNode}->${conn.node}:${outputIndex}:${conn.index}`;
            if (!sourceConnStr.has(connKey)) {
              changes.push({
                fromNode,
                toNode: conn.node,
                outputIndex,
                inputIndex: conn.index,
              });
            }
          }
        }
      }
    }

    return changes;
  }

  /**
   * Find removed connections
   */
  private findRemovedConnections(
    source: N8nWorkflow,
    target: N8nWorkflow
  ): ConnectionChange[] {
    const changes: ConnectionChange[] = [];
    const targetConnStr = this.serializeConnections(target.connections);

    for (const [fromNode, outputs] of Object.entries(source.connections)) {
      for (const [outputType, connectionArrays] of Object.entries(outputs)) {
        for (let outputIndex = 0; outputIndex < connectionArrays.length; outputIndex++) {
          for (const conn of connectionArrays[outputIndex]) {
            const connKey = `${fromNode}->${conn.node}:${outputIndex}:${conn.index}`;
            if (!targetConnStr.has(connKey)) {
              changes.push({
                fromNode,
                toNode: conn.node,
                outputIndex,
                inputIndex: conn.index,
              });
            }
          }
        }
      }
    }

    return changes;
  }

  /**
   * Serialize connections to set
   */
  private serializeConnections(
    connections: N8nWorkflow['connections']
  ): Set<string> {
    const connSet = new Set<string>();

    for (const [fromNode, outputs] of Object.entries(connections)) {
      for (const [outputType, connectionArrays] of Object.entries(outputs)) {
        for (let outputIndex = 0; outputIndex < connectionArrays.length; outputIndex++) {
          for (const conn of connectionArrays[outputIndex]) {
            connSet.add(`${fromNode}->${conn.node}:${outputIndex}:${conn.index}`);
          }
        }
      }
    }

    return connSet;
  }

  /**
   * Compare settings
   */
  private compareSettings(
    source: N8nWorkflow,
    target: N8nWorkflow
  ): SettingChange[] {
    const changes: SettingChange[] = [];
    const sourceSettings = source.settings || {} as Record<string, unknown>;
    const targetSettings = target.settings || {} as Record<string, unknown>;

    const allKeys = new Set([
      ...Object.keys(sourceSettings),
      ...Object.keys(targetSettings),
    ]);

    for (const key of allKeys) {
      const oldVal = (sourceSettings as Record<string, unknown>)[key];
      const newVal = (targetSettings as Record<string, unknown>)[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({
          setting: key,
          oldValue: oldVal,
          newValue: newVal,
        });
      }
    }

    return changes;
  }

  /**
   * Detect breaking changes
   */
  private detectBreakingChanges(diff: WorkflowDiff): BreakingChange[] {
    const breakingChanges: BreakingChange[] = [];

    // Removed nodes are breaking
    for (const node of diff.nodesRemoved) {
      breakingChanges.push({
        type: 'node-removed',
        severity: 'error',
        location: node.name,
        description: `Node "${node.name}" (${node.type}) was removed`,
        impact: 'Workflow execution will fail if this node was required',
        remediation: 'Ensure all dependent nodes are updated or add replacement node',
      });
    }

    // Broken connections
    for (const conn of diff.connectionsRemoved) {
      breakingChanges.push({
        type: 'connection-broken',
        severity: 'error',
        location: `${conn.fromNode} -> ${conn.toNode}`,
        description: `Connection from "${conn.fromNode}" to "${conn.toNode}" was removed`,
        impact: 'Data flow between nodes is broken',
        remediation: 'Re-establish connection or update dependent node logic',
      });
    }

    // Breaking parameter changes
    for (const mod of diff.nodesModified) {
      const breakingParams = mod.changes.filter(
        c => c.breaking && (c.type === 'removed' || c.type === 'modified')
      );

      for (const change of breakingParams) {
        breakingChanges.push({
          type: change.type === 'removed' ? 'parameter-removed' : 'type-changed',
          severity: 'warning',
          location: `${mod.nodeName}.${change.path}`,
          description: `Parameter "${change.path}" was ${change.type}`,
          impact: 'Node behavior may change unexpectedly',
          remediation: 'Review and validate node configuration',
        });
      }
    }

    return breakingChanges;
  }

  /**
   * Generate migration path
   */
  private generateMigrationPath(
    diff: WorkflowDiff,
    breakingChanges: BreakingChange[]
  ): MigrationPath {
    const steps: MigrationStep[] = [];
    let order = 1;

    // Handle removed nodes first
    for (const node of diff.nodesRemoved) {
      steps.push({
        order: order++,
        action: 'review-removal',
        target: node.name,
        details: `Review removal of node "${node.name}" and update dependent workflows`,
        automated: false,
      });
    }

    // Handle broken connections
    for (const conn of diff.connectionsRemoved) {
      steps.push({
        order: order++,
        action: 'fix-connection',
        target: `${conn.fromNode} -> ${conn.toNode}`,
        details: 'Re-establish connection or update data flow',
        automated: false,
      });
    }

    // Handle modified nodes
    for (const mod of diff.nodesModified) {
      const hasBreaking = mod.changes.some(c => c.breaking);
      steps.push({
        order: order++,
        action: hasBreaking ? 'update-configuration' : 'validate-changes',
        target: mod.nodeName,
        details: `Review ${mod.changes.length} parameter changes`,
        automated: !hasBreaking,
      });
    }

    // Handle new nodes
    for (const node of diff.nodesAdded) {
      steps.push({
        order: order++,
        action: 'validate-new-node',
        target: node.name,
        details: `Validate new node "${node.name}" configuration`,
        automated: true,
      });
    }

    // Calculate effort
    let effort: MigrationPath['estimatedEffort'];
    if (breakingChanges.filter(c => c.severity === 'error').length > 3) {
      effort = 'major';
    } else if (breakingChanges.length > 5) {
      effort = 'significant';
    } else if (breakingChanges.length > 2) {
      effort = 'moderate';
    } else if (breakingChanges.length > 0) {
      effort = 'minor';
    } else {
      effort = 'trivial';
    }

    return {
      steps,
      estimatedEffort: effort,
      automated: steps.every(s => s.automated),
      risks: breakingChanges.map(bc => bc.impact),
    };
  }

  /**
   * Check compatibility
   */
  private checkCompatibility(
    diff: WorkflowDiff,
    breakingChanges: BreakingChange[]
  ): CompatibilityReport {
    const issues: CompatibilityIssue[] = [];

    // Check backward compatibility (can old version handle new data?)
    const hasRemovalsOrBreaking = diff.nodesRemoved.length > 0 ||
      diff.connectionsRemoved.length > 0 ||
      breakingChanges.some(bc => bc.severity === 'error');

    // Check forward compatibility (can new version handle old data?)
    const hasRequiredAdditions = diff.nodesModified.some(
      m => m.changes.some(c => c.type === 'added' && c.breaking)
    );

    // Generate issues
    if (hasRemovalsOrBreaking) {
      issues.push({
        type: 'backward-incompatible',
        severity: 'high',
        description: 'Changes break backward compatibility',
        affected: [
          ...diff.nodesRemoved.map(n => n.name),
          ...diff.connectionsRemoved.map(c => `${c.fromNode}->${c.toNode}`),
        ],
      });
    }

    if (hasRequiredAdditions) {
      issues.push({
        type: 'forward-incompatible',
        severity: 'medium',
        description: 'New required parameters may not work with old data',
        affected: diff.nodesModified
          .filter(m => m.changes.some(c => c.type === 'added' && c.breaking))
          .map(m => m.nodeName),
      });
    }

    // Calculate score
    let score = 100;
    for (const issue of issues) {
      if (issue.severity === 'high') score -= 30;
      else if (issue.severity === 'medium') score -= 15;
      else score -= 5;
    }

    return {
      isBackwardCompatible: !hasRemovalsOrBreaking,
      isForwardCompatible: !hasRequiredAdditions,
      compatibilityScore: Math.max(0, score),
      issues,
    };
  }

  /**
   * Get default compatibility report
   */
  private getDefaultCompatibility(): CompatibilityReport {
    return {
      isBackwardCompatible: true,
      isForwardCompatible: true,
      compatibilityScore: 100,
      issues: [],
    };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    diff: WorkflowDiff,
    breakingChanges: BreakingChange[],
    compatibility: CompatibilityReport
  ): string[] {
    const recommendations: string[] = [];

    if (breakingChanges.length > 0) {
      recommendations.push(
        `Review ${breakingChanges.length} breaking changes before deployment`
      );
    }

    if (!compatibility.isBackwardCompatible) {
      recommendations.push(
        'Consider versioning your workflow or providing migration scripts'
      );
    }

    if (diff.nodesRemoved.length > 0) {
      recommendations.push(
        'Verify all consumers are updated before removing nodes'
      );
    }

    if (diff.nodesAdded.length > 0) {
      recommendations.push(
        'Test new nodes thoroughly with production-like data'
      );
    }

    if (compatibility.compatibilityScore < 70) {
      recommendations.push(
        'Consider a phased rollout due to significant compatibility concerns'
      );
    }

    return recommendations;
  }

  /**
   * Store workflow version
   */
  private storeVersion(workflowId: string, workflow: N8nWorkflow): void {
    const versions = this.workflowVersions.get(workflowId) || [];
    versions.push({ ...workflow });
    // Keep last 10 versions
    if (versions.length > 10) {
      versions.shift();
    }
    this.workflowVersions.set(workflowId, versions);
  }

  /**
   * Get previous version
   */
  private getPreviousVersion(workflowId: string): N8nWorkflow | undefined {
    const versions = this.workflowVersions.get(workflowId);
    if (versions && versions.length > 1) {
      return versions[versions.length - 2];
    }
    return undefined;
  }

  /**
   * Get version history
   */
  getVersionHistory(workflowId: string): WorkflowVersion[] {
    const versions = this.workflowVersions.get(workflowId) || [];
    return versions.map(v => this.extractVersion(v));
  }
}
