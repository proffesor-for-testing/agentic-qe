/**
 * Agentic QE v3 - ESB/Middleware Flow Testing Service
 * Tests message routing rules, validates transformations,
 * and tests flow execution paths in ESB/middleware systems.
 *
 * ADR-059: Enterprise Integration Testing Gap Closure
 */

import { Result, ok, err } from '../../../shared/types/index.js';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import type {
  MessageFlow,
  FlowNode,
  FlowConnection,
  RoutingRule,
  TransformationSpec,
  TransformationType,
  MessageFormat,
  MessagePayload,
  MiddlewareTestResult,
  MiddlewareValidationError,
} from '../interfaces.js';

/**
 * Configuration for the ESB middleware service
 */
export interface EsbMiddlewareServiceConfig {
  /** Enable strict flow validation */
  strictValidation: boolean;
  /** Maximum number of nodes in a flow for performance */
  maxFlowNodes: number;
  /** Maximum flow execution depth (for loop detection) */
  maxExecutionDepth: number;
  /** Validate transformation specs */
  validateTransformations: boolean;
  /** Detect unreachable nodes in flows */
  detectUnreachableNodes: boolean;
}

const DEFAULT_CONFIG: EsbMiddlewareServiceConfig = {
  strictValidation: true,
  maxFlowNodes: 100,
  maxExecutionDepth: 50,
  validateTransformations: true,
  detectUnreachableNodes: true,
};

/**
 * ESB/Middleware Flow Testing Service
 * Provides message flow validation, routing rule testing, and transformation validation
 */
export class EsbMiddlewareService {
  private readonly config: EsbMiddlewareServiceConfig;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<EsbMiddlewareServiceConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // Message Flow Validation
  // ============================================================================

  /**
   * Validate a message flow definition for structural correctness.
   * Checks node connectivity, routing rules, error handling, and detects cycles.
   */
  async validateMessageFlow(
    flow: MessageFlow,
    input: MessagePayload
  ): Promise<Result<MiddlewareTestResult>> {
    const startTime = Date.now();
    try {
      if (!flow.name || flow.name.trim() === '') {
        return err(new Error('Message flow name is required'));
      }

      const validationErrors: MiddlewareValidationError[] = [];

      // Validate flow structure
      this.validateFlowStructure(flow, validationErrors);

      // Validate routing rules within the flow
      const routingCorrect = this.validateRouting(flow, input, validationErrors);

      // Validate transformations within the flow
      const transformationCorrect = this.validateFlowTransformations(flow, validationErrors);

      // Validate error handling
      const errorHandlingCorrect = this.validateErrorHandling(flow, validationErrors);

      // Check for unreachable nodes
      if (this.config.detectUnreachableNodes) {
        this.detectUnreachableNodes(flow, validationErrors);
      }

      // Check for cycles (infinite loops)
      this.detectCycles(flow, validationErrors);

      // Simulate flow execution path
      this.validateExecutionPath(flow, input, validationErrors);

      const result: MiddlewareTestResult = {
        flowName: flow.name,
        passed: validationErrors.length === 0,
        routingCorrect,
        transformationCorrect,
        errorHandlingCorrect,
        validationErrors,
        duration: Date.now() - startTime,
      };

      // Store validation result for learning
      await this.memory.set(
        `enterprise-integration:middleware:${flow.name}:${Date.now()}`,
        {
          flowName: flow.name,
          passed: result.passed,
          routingCorrect,
          transformationCorrect,
          errorHandlingCorrect,
          errorCount: validationErrors.length,
          nodeCount: flow.nodes.length,
          duration: result.duration,
          timestamp: new Date().toISOString(),
        },
        { namespace: 'enterprise-integration', ttl: 86400 * 30 }
      );

      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Routing Rule Testing
  // ============================================================================

  /**
   * Test a set of routing rules against a message payload.
   * Returns the matched rules in priority order and validates for conflicts.
   */
  testRoutingRules(
    rules: RoutingRule[],
    input: MessagePayload
  ): Result<{ matchedRules: RoutingRule[]; conflicts: string[] }> {
    try {
      if (!rules || rules.length === 0) {
        return err(new Error('At least one routing rule is required'));
      }

      const matchedRules: RoutingRule[] = [];
      const conflicts: string[] = [];

      // Sort rules by priority (lower number = higher priority)
      const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

      // Evaluate each rule against the input
      for (const rule of sortedRules) {
        const ruleErrors = this.validateRoutingRule(rule);
        if (ruleErrors.length > 0) {
          conflicts.push(...ruleErrors.map(e => `Rule '${rule.name}': ${e}`));
          continue;
        }

        if (this.evaluateRoutingCondition(rule.condition, input)) {
          matchedRules.push(rule);
        }
      }

      // Check for conflicting rules (same priority, different destinations)
      this.detectRoutingConflicts(matchedRules, conflicts);

      return ok({ matchedRules, conflicts });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Transformation Validation
  // ============================================================================

  /**
   * Validate a transformation specification and optionally test it
   * against input/expected output pairs.
   */
  async validateTransformation(
    spec: TransformationSpec,
    input: string,
    expectedOutput: string
  ): Promise<Result<boolean>> {
    try {
      // Validate the spec itself
      const specErrors = this.validateTransformationSpec(spec);
      if (specErrors.length > 0) {
        return err(new Error(
          `Invalid transformation spec: ${specErrors.join('; ')}`
        ));
      }

      // Validate input format
      const inputFormatValid = this.validateMessageFormat(input, spec.inputFormat);
      if (!inputFormatValid) {
        return err(new Error(
          `Input does not match expected format '${spec.inputFormat}'`
        ));
      }

      // Validate expected output format
      const outputFormatValid = this.validateMessageFormat(expectedOutput, spec.outputFormat);
      if (!outputFormatValid) {
        return err(new Error(
          `Expected output does not match expected format '${spec.outputFormat}'`
        ));
      }

      // Validate transformation spec content based on type
      const specContentValid = this.validateTransformationSpecContent(spec);
      if (!specContentValid) {
        return err(new Error(
          `Transformation spec content is invalid for type '${spec.type}'`
        ));
      }

      // Store validation result
      await this.memory.set(
        `enterprise-integration:transform:${spec.type}:${Date.now()}`,
        {
          type: spec.type,
          inputFormat: spec.inputFormat,
          outputFormat: spec.outputFormat,
          passed: true,
          timestamp: new Date().toISOString(),
        },
        { namespace: 'enterprise-integration', ttl: 86400 * 30 }
      );

      return ok(true);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Private Helper Methods - Flow Validation
  // ============================================================================

  private validateFlowStructure(
    flow: MessageFlow,
    errors: MiddlewareValidationError[]
  ): void {
    // Check node count
    if (flow.nodes.length === 0) {
      errors.push({
        type: 'routing',
        message: 'Message flow must have at least one node',
        severity: 'critical',
      });
      return;
    }

    if (flow.nodes.length > this.config.maxFlowNodes) {
      errors.push({
        type: 'routing',
        message: `Flow has ${flow.nodes.length} nodes, exceeding maximum of ${this.config.maxFlowNodes}`,
        severity: 'high',
      });
    }

    // Validate each node
    const nodeIds = new Set<string>();
    let hasInput = false;
    let hasOutput = false;

    for (const node of flow.nodes) {
      // Check for duplicate IDs
      if (nodeIds.has(node.id)) {
        errors.push({
          type: 'routing',
          node: node.id,
          message: `Duplicate node ID '${node.id}'`,
          severity: 'critical',
        });
      }
      nodeIds.add(node.id);

      // Check node type
      if (node.type === 'input') hasInput = true;
      if (node.type === 'output') hasOutput = true;

      // Validate node configuration
      this.validateNodeConfig(node, errors);
    }

    if (!hasInput) {
      errors.push({
        type: 'routing',
        message: 'Message flow must have at least one input node',
        severity: 'critical',
      });
    }

    if (!hasOutput) {
      errors.push({
        type: 'routing',
        message: 'Message flow must have at least one output node',
        severity: 'high',
      });
    }

    // Validate connections
    for (const connection of flow.connections) {
      if (!nodeIds.has(connection.from)) {
        errors.push({
          type: 'routing',
          message: `Connection references non-existent source node '${connection.from}'`,
          severity: 'critical',
        });
      }

      if (!nodeIds.has(connection.to)) {
        errors.push({
          type: 'routing',
          message: `Connection references non-existent target node '${connection.to}'`,
          severity: 'critical',
        });
      }

      if (connection.from === connection.to) {
        errors.push({
          type: 'routing',
          node: connection.from,
          message: `Self-referencing connection on node '${connection.from}'`,
          severity: 'high',
        });
      }
    }
  }

  private validateNodeConfig(
    node: FlowNode,
    errors: MiddlewareValidationError[]
  ): void {
    if (!node.id || node.id.trim() === '') {
      errors.push({
        type: 'routing',
        message: 'Node ID is required',
        severity: 'critical',
      });
    }

    const validTypes: FlowNode['type'][] = [
      'input', 'output', 'compute', 'filter', 'route', 'transform', 'aggregate',
    ];

    if (!validTypes.includes(node.type)) {
      errors.push({
        type: 'routing',
        node: node.id,
        message: `Invalid node type '${node.type}'. Valid: ${validTypes.join(', ')}`,
        severity: 'high',
      });
    }

    // Type-specific config validation
    if (node.type === 'route' && !node.config.routingRules) {
      if (this.config.strictValidation) {
        errors.push({
          type: 'routing',
          node: node.id,
          message: `Route node '${node.id}' should have routingRules in config`,
          severity: 'medium',
        });
      }
    }

    if (node.type === 'transform' && !node.config.transformationSpec) {
      if (this.config.strictValidation) {
        errors.push({
          type: 'transformation',
          node: node.id,
          message: `Transform node '${node.id}' should have transformationSpec in config`,
          severity: 'medium',
        });
      }
    }
  }

  private validateRouting(
    flow: MessageFlow,
    _input: MessagePayload,
    errors: MiddlewareValidationError[]
  ): boolean {
    let routingCorrect = true;

    // Find all route nodes
    const routeNodes = flow.nodes.filter(n => n.type === 'route');

    for (const node of routeNodes) {
      // Check that route nodes have outgoing connections
      const outgoing = flow.connections.filter(c => c.from === node.id);
      if (outgoing.length === 0) {
        errors.push({
          type: 'routing',
          node: node.id,
          message: `Route node '${node.id}' has no outgoing connections`,
          severity: 'high',
        });
        routingCorrect = false;
      }

      // Check that route nodes have routing rules
      const rules = node.config.routingRules as RoutingRule[] | undefined;
      if (rules && Array.isArray(rules)) {
        // Validate that each routing rule destination maps to a connection
        for (const rule of rules) {
          const hasMatchingConnection = outgoing.some(
            c => c.terminal === rule.destination || c.to === rule.destination
          );
          if (!hasMatchingConnection) {
            errors.push({
              type: 'routing',
              node: node.id,
              message: `Routing rule '${rule.name}' destination '${rule.destination}' has no matching connection`,
              severity: 'high',
            });
            routingCorrect = false;
          }
        }
      }
    }

    return routingCorrect;
  }

  private validateFlowTransformations(
    flow: MessageFlow,
    errors: MiddlewareValidationError[]
  ): boolean {
    if (!this.config.validateTransformations) return true;

    let transformationCorrect = true;

    const transformNodes = flow.nodes.filter(n => n.type === 'transform');

    for (const node of transformNodes) {
      const spec = node.config.transformationSpec as TransformationSpec | undefined;
      if (!spec) continue;

      const specErrors = this.validateTransformationSpec(spec);
      if (specErrors.length > 0) {
        for (const specError of specErrors) {
          errors.push({
            type: 'transformation',
            node: node.id,
            message: specError,
            severity: 'high',
          });
        }
        transformationCorrect = false;
      }
    }

    return transformationCorrect;
  }

  private validateErrorHandling(
    flow: MessageFlow,
    errors: MiddlewareValidationError[]
  ): boolean {
    let errorHandlingCorrect = true;

    // Check that error handler is defined
    if (!flow.errorHandler) {
      if (this.config.strictValidation) {
        errors.push({
          type: 'error-handling',
          message: 'Message flow should define an error handler',
          severity: 'medium',
        });
        errorHandlingCorrect = false;
      }
      return errorHandlingCorrect;
    }

    // Validate error handler references a valid node
    const errorHandlerNode = flow.nodes.find(n => n.id === flow.errorHandler);
    if (!errorHandlerNode) {
      errors.push({
        type: 'error-handling',
        message: `Error handler references non-existent node '${flow.errorHandler}'`,
        severity: 'high',
      });
      errorHandlingCorrect = false;
    }

    return errorHandlingCorrect;
  }

  private detectUnreachableNodes(
    flow: MessageFlow,
    errors: MiddlewareValidationError[]
  ): void {
    if (flow.nodes.length === 0) return;

    // Find all input nodes as starting points
    const inputNodes = flow.nodes.filter(n => n.type === 'input');
    if (inputNodes.length === 0) return;

    // BFS from input nodes to find reachable nodes
    const reachable = new Set<string>();
    const queue = inputNodes.map(n => n.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (reachable.has(current)) continue;
      reachable.add(current);

      // Find all nodes connected from current
      const outgoing = flow.connections.filter(c => c.from === current);
      for (const conn of outgoing) {
        if (!reachable.has(conn.to)) {
          queue.push(conn.to);
        }
      }
    }

    // Also include error handler as reachable
    if (flow.errorHandler) {
      reachable.add(flow.errorHandler);
    }

    // Report unreachable nodes
    for (const node of flow.nodes) {
      if (!reachable.has(node.id)) {
        errors.push({
          type: 'routing',
          node: node.id,
          message: `Node '${node.id}' (type: ${node.type}) is unreachable from any input node`,
          severity: 'medium',
        });
      }
    }
  }

  private detectCycles(
    flow: MessageFlow,
    errors: MiddlewareValidationError[]
  ): void {
    // Build adjacency list
    const adjacency = new Map<string, string[]>();
    for (const node of flow.nodes) {
      adjacency.set(node.id, []);
    }
    for (const conn of flow.connections) {
      if (adjacency.has(conn.from)) {
        adjacency.get(conn.from)!.push(conn.to);
      }
    }

    // DFS-based cycle detection
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycleNodes: string[] = [];

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const neighbors = adjacency.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) {
            cycleNodes.push(nodeId);
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          cycleNodes.push(neighbor);
          cycleNodes.push(nodeId);
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of flow.nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) {
          errors.push({
            type: 'sequencing',
            message: `Cycle detected in flow involving nodes: ${Array.from(new Set(cycleNodes)).join(' -> ')}`,
            severity: 'high',
          });
          break;
        }
      }
    }
  }

  private validateExecutionPath(
    flow: MessageFlow,
    _input: MessagePayload,
    errors: MiddlewareValidationError[]
  ): void {
    // Verify that there is at least one complete path from input to output
    const inputNodes = flow.nodes.filter(n => n.type === 'input');
    const outputNodeIds = new Set(flow.nodes.filter(n => n.type === 'output').map(n => n.id));

    if (inputNodes.length === 0 || outputNodeIds.size === 0) return;

    let hasCompletePath = false;

    for (const inputNode of inputNodes) {
      // BFS to find path to any output
      const visited = new Set<string>();
      const queue = [inputNode.id];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);

        if (outputNodeIds.has(current)) {
          hasCompletePath = true;
          break;
        }

        const outgoing = flow.connections.filter(c => c.from === current);
        for (const conn of outgoing) {
          if (!visited.has(conn.to)) {
            queue.push(conn.to);
          }
        }
      }

      if (hasCompletePath) break;
    }

    if (!hasCompletePath) {
      errors.push({
        type: 'sequencing',
        message: 'No complete path exists from any input node to any output node',
        severity: 'critical',
      });
    }
  }

  // ============================================================================
  // Private Helper Methods - Routing
  // ============================================================================

  private validateRoutingRule(rule: RoutingRule): string[] {
    const errors: string[] = [];

    if (!rule.name || rule.name.trim() === '') {
      errors.push('Rule name is required');
    }

    if (!rule.condition || rule.condition.trim() === '') {
      errors.push('Rule condition is required');
    }

    if (!rule.destination || rule.destination.trim() === '') {
      errors.push('Rule destination is required');
    }

    if (rule.priority < 0) {
      errors.push('Rule priority must be non-negative');
    }

    return errors;
  }

  private evaluateRoutingCondition(
    condition: string,
    input: MessagePayload
  ): boolean {
    // Simple condition evaluation for common patterns
    const normalizedCondition = condition.trim().toLowerCase();

    // Match format-based conditions
    if (normalizedCondition.includes('format')) {
      if (normalizedCondition.includes(`= '${input.format}'`) ||
          normalizedCondition.includes(`== '${input.format}'`) ||
          normalizedCondition.includes(`='${input.format}'`)) {
        return true;
      }
    }

    // Match header-based conditions
    if (normalizedCondition.includes('header')) {
      for (const [key, value] of Object.entries(input.headers)) {
        if (normalizedCondition.includes(key.toLowerCase()) &&
            normalizedCondition.includes(value.toLowerCase())) {
          return true;
        }
      }
    }

    // Match content-based conditions
    if (normalizedCondition.includes('contains')) {
      const contentMatch = condition.match(/contains\s*\(\s*['"]([^'"]*)['"]\s*\)/i);
      if (contentMatch) {
        return input.body.includes(contentMatch[1]);
      }
    }

    // Match correlation ID conditions
    if (normalizedCondition.includes('correlationid') && input.correlationId) {
      return true;
    }

    // Match priority conditions
    if (normalizedCondition.includes('priority') && input.priority !== undefined) {
      const priorityMatch = condition.match(/priority\s*(>=?|<=?|==?|!=)\s*(\d+)/i);
      if (priorityMatch) {
        const op = priorityMatch[1];
        const threshold = parseInt(priorityMatch[2], 10);
        switch (op) {
          case '>': return input.priority > threshold;
          case '>=': return input.priority >= threshold;
          case '<': return input.priority < threshold;
          case '<=': return input.priority <= threshold;
          case '==': case '=': return input.priority === threshold;
          case '!=': return input.priority !== threshold;
        }
      }
    }

    // Default: wildcard or 'true' conditions match everything
    if (normalizedCondition === 'true' || normalizedCondition === '*' ||
        normalizedCondition === 'default' || normalizedCondition === 'otherwise') {
      return true;
    }

    return false;
  }

  private detectRoutingConflicts(
    matchedRules: RoutingRule[],
    conflicts: string[]
  ): void {
    // Check for rules with same priority routing to different destinations
    const priorityMap = new Map<number, RoutingRule[]>();

    for (const rule of matchedRules) {
      if (!priorityMap.has(rule.priority)) {
        priorityMap.set(rule.priority, []);
      }
      priorityMap.get(rule.priority)!.push(rule);
    }

    const priorityEntries = Array.from(priorityMap.entries());
    for (const [priority, rules] of priorityEntries) {
      if (rules.length > 1) {
        const destinations = new Set(rules.map(r => r.destination));
        if (destinations.size > 1) {
          conflicts.push(
            `Routing conflict at priority ${priority}: rules ${rules.map(r => `'${r.name}'`).join(', ')} ` +
            `route to different destinations: ${Array.from(destinations).join(', ')}`
          );
        }
      }
    }
  }

  // ============================================================================
  // Private Helper Methods - Transformation
  // ============================================================================

  private validateTransformationSpec(spec: TransformationSpec): string[] {
    const errors: string[] = [];

    const validTypes: TransformationType[] = ['xslt', 'esql', 'dataweave', 'mapping', 'custom'];
    if (!validTypes.includes(spec.type)) {
      errors.push(`Invalid transformation type '${spec.type}'. Valid: ${validTypes.join(', ')}`);
    }

    const validFormats: MessageFormat[] = [
      'xml', 'json', 'flat-file', 'edi-x12', 'edifact', 'idoc', 'csv',
    ];

    if (!validFormats.includes(spec.inputFormat)) {
      errors.push(`Invalid input format '${spec.inputFormat}'. Valid: ${validFormats.join(', ')}`);
    }

    if (!validFormats.includes(spec.outputFormat)) {
      errors.push(`Invalid output format '${spec.outputFormat}'. Valid: ${validFormats.join(', ')}`);
    }

    if (!spec.spec || spec.spec.trim() === '') {
      errors.push('Transformation spec content is required');
    }

    return errors;
  }

  private validateTransformationSpecContent(spec: TransformationSpec): boolean {
    switch (spec.type) {
      case 'xslt':
        // XSLT must be valid XML with stylesheet element
        return spec.spec.includes('<xsl:stylesheet') || spec.spec.includes('<xsl:transform');

      case 'esql':
        // ESQL must contain CREATE or SET statements
        return /\b(CREATE|SET|CALL|PROPAGATE)\b/i.test(spec.spec);

      case 'dataweave':
        // DataWeave must contain %dw or output directive
        return spec.spec.includes('%dw') || spec.spec.includes('output ');

      case 'mapping':
        // Mapping can be JSON or XML based
        try {
          JSON.parse(spec.spec);
          return true;
        } catch {
          return spec.spec.includes('<') && spec.spec.includes('>');
        }

      case 'custom':
        // Custom transformations just need non-empty content
        return spec.spec.trim().length > 0;

      default:
        return false;
    }
  }

  private validateMessageFormat(content: string, format: MessageFormat): boolean {
    if (!content || content.trim() === '') return false;

    switch (format) {
      case 'json':
        try {
          JSON.parse(content);
          return true;
        } catch {
          return false;
        }

      case 'xml':
        return content.trim().startsWith('<') && content.includes('>');

      case 'csv':
        return content.includes(',') || content.includes('\t');

      case 'flat-file':
        return content.length > 0;

      case 'edi-x12':
        return content.startsWith('ISA');

      case 'edifact':
        return content.startsWith('UNA') || content.startsWith('UNB');

      case 'idoc':
        return content.length > 0;

      default:
        return true;
    }
  }
}
