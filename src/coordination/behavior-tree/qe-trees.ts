/**
 * Pre-built Behavior Trees for Common QE Workflows
 *
 * Provides ready-to-use behavior tree templates for:
 * - Test generation pipeline
 * - Regression suite execution
 * - Security audit workflow
 *
 * Each tree is constructed using the core nodes and decorators,
 * and can be serialized to JSON for persistence/transfer.
 */

import {
  type BehaviorNode,
  type NodeStatus,
  type ActionFunction,
  type ConditionPredicate,
  type SerializedNode,
  type NodeHandlerRegistry,
  SequenceNode,
  SelectorNode,
  ParallelNode,
  ActionNode,
  ConditionNode,
  deserializeNode,
} from './nodes.js';
import { RetryNode, TimeoutNode } from './decorators.js';

// ============================================================================
// QE Action/Condition IDs (used for serialization registry)
// ============================================================================

/** Well-known action IDs for QE behavior trees */
export const QEActionIds = {
  // Test Generation Pipeline
  ANALYZE_CODE: 'qe.analyze-code',
  GENERATE_TESTS: 'qe.generate-tests',
  VALIDATE_TESTS: 'qe.validate-tests',
  COMMIT_TESTS: 'qe.commit-tests',

  // Regression Suite
  LOAD_TESTS: 'qe.load-tests',
  EXECUTE_TESTS: 'qe.execute-tests',
  COLLECT_RESULTS: 'qe.collect-results',
  GENERATE_REPORT: 'qe.generate-report',

  // Security Audit
  SCAN_VULNERABILITIES: 'qe.scan-vulnerabilities',
  CLASSIFY_FINDINGS: 'qe.classify-findings',
  GENERATE_SECURITY_REPORT: 'qe.generate-security-report',
  REMEDIATE_ISSUES: 'qe.remediate-issues',
} as const;

/** Well-known condition IDs for QE behavior trees */
export const QEConditionIds = {
  HAS_SOURCE_FILES: 'qe.has-source-files',
  TESTS_ARE_VALID: 'qe.tests-are-valid',
  HAS_TEST_FILES: 'qe.has-test-files',
  ALL_TESTS_PASSED: 'qe.all-tests-passed',
  HAS_CRITICAL_FINDINGS: 'qe.has-critical-findings',
  SCAN_COMPLETE: 'qe.scan-complete',
} as const;

// ============================================================================
// Tree Builder Context
// ============================================================================

/**
 * Context for building QE behavior trees with injectable handlers.
 *
 * When building trees for actual execution, provide real action/condition
 * implementations. For testing or serialization, provide stubs.
 */
export interface QETreeHandlers {
  actions: Partial<Record<string, ActionFunction>>;
  conditions: Partial<Record<string, ConditionPredicate>>;
}

function getAction(handlers: QETreeHandlers, id: string): ActionFunction {
  const fn = handlers.actions[id];
  if (fn) return fn;
  return async () => 'SUCCESS' as NodeStatus;
}

function getCondition(
  handlers: QETreeHandlers,
  id: string
): ConditionPredicate {
  const fn = handlers.conditions[id];
  if (fn) return fn;
  return async () => true;
}

// ============================================================================
// Test Generation Pipeline
// ============================================================================

/**
 * Build a test generation pipeline behavior tree.
 *
 * Flow:
 *   Sequence("Test Generation Pipeline")
 *     Condition("Has Source Files")
 *     Retry("Analyze Code with Retry", maxRetries=2)
 *       Action("Analyze Code")
 *     Action("Generate Tests")
 *     Sequence("Validate and Commit")
 *       Action("Validate Tests")
 *       Condition("Tests Are Valid")
 *       Action("Commit Tests")
 */
export function buildTestGenerationPipeline(
  handlers: QETreeHandlers
): BehaviorNode {
  return new SequenceNode('Test Generation Pipeline', [
    new ConditionNode(
      'Has Source Files',
      getCondition(handlers, QEConditionIds.HAS_SOURCE_FILES),
      QEConditionIds.HAS_SOURCE_FILES
    ),
    new RetryNode(
      'Analyze Code with Retry',
      new ActionNode(
        'Analyze Code',
        getAction(handlers, QEActionIds.ANALYZE_CODE),
        QEActionIds.ANALYZE_CODE
      ),
      2
    ),
    new ActionNode(
      'Generate Tests',
      getAction(handlers, QEActionIds.GENERATE_TESTS),
      QEActionIds.GENERATE_TESTS
    ),
    new SequenceNode('Validate and Commit', [
      new ActionNode(
        'Validate Tests',
        getAction(handlers, QEActionIds.VALIDATE_TESTS),
        QEActionIds.VALIDATE_TESTS
      ),
      new ConditionNode(
        'Tests Are Valid',
        getCondition(handlers, QEConditionIds.TESTS_ARE_VALID),
        QEConditionIds.TESTS_ARE_VALID
      ),
      new ActionNode(
        'Commit Tests',
        getAction(handlers, QEActionIds.COMMIT_TESTS),
        QEActionIds.COMMIT_TESTS
      ),
    ]),
  ]);
}

// ============================================================================
// Regression Suite
// ============================================================================

/**
 * Build a regression suite execution behavior tree.
 *
 * Flow:
 *   Sequence("Regression Suite")
 *     Condition("Has Test Files")
 *     Action("Load Tests")
 *     Timeout("Execute Tests with Timeout", 300000ms)
 *       Parallel("Execute Tests in Parallel", threshold=all)
 *         Action("Execute Tests")
 *     Action("Collect Results")
 *     Action("Generate Report")
 */
export function buildRegressionSuite(
  handlers: QETreeHandlers,
  testTimeoutMs = 300000
): BehaviorNode {
  return new SequenceNode('Regression Suite', [
    new ConditionNode(
      'Has Test Files',
      getCondition(handlers, QEConditionIds.HAS_TEST_FILES),
      QEConditionIds.HAS_TEST_FILES
    ),
    new ActionNode(
      'Load Tests',
      getAction(handlers, QEActionIds.LOAD_TESTS),
      QEActionIds.LOAD_TESTS
    ),
    new TimeoutNode(
      'Execute Tests with Timeout',
      new ParallelNode(
        'Execute Tests in Parallel',
        [
          new ActionNode(
            'Execute Tests',
            getAction(handlers, QEActionIds.EXECUTE_TESTS),
            QEActionIds.EXECUTE_TESTS
          ),
        ],
        { successThreshold: 1 }
      ),
      testTimeoutMs
    ),
    new ActionNode(
      'Collect Results',
      getAction(handlers, QEActionIds.COLLECT_RESULTS),
      QEActionIds.COLLECT_RESULTS
    ),
    new ActionNode(
      'Generate Report',
      getAction(handlers, QEActionIds.GENERATE_REPORT),
      QEActionIds.GENERATE_REPORT
    ),
  ]);
}

// ============================================================================
// Security Audit
// ============================================================================

/**
 * Build a security audit behavior tree.
 *
 * Flow:
 *   Sequence("Security Audit")
 *     Retry("Scan with Retry", maxRetries=3)
 *       Action("Scan Vulnerabilities")
 *     Action("Classify Findings")
 *     Action("Generate Security Report")
 *     Selector("Handle Findings")
 *       Sequence("Remediate if Critical")
 *         Condition("Has Critical Findings")
 *         Action("Remediate Issues")
 *       Action("Generate Security Report")  // fallback: just report
 */
export function buildSecurityAudit(handlers: QETreeHandlers): BehaviorNode {
  return new SequenceNode('Security Audit', [
    new RetryNode(
      'Scan with Retry',
      new ActionNode(
        'Scan Vulnerabilities',
        getAction(handlers, QEActionIds.SCAN_VULNERABILITIES),
        QEActionIds.SCAN_VULNERABILITIES
      ),
      3
    ),
    new ActionNode(
      'Classify Findings',
      getAction(handlers, QEActionIds.CLASSIFY_FINDINGS),
      QEActionIds.CLASSIFY_FINDINGS
    ),
    new ActionNode(
      'Generate Security Report',
      getAction(handlers, QEActionIds.GENERATE_SECURITY_REPORT),
      QEActionIds.GENERATE_SECURITY_REPORT
    ),
    new SelectorNode('Handle Findings', [
      new SequenceNode('Remediate if Critical', [
        new ConditionNode(
          'Has Critical Findings',
          getCondition(handlers, QEConditionIds.HAS_CRITICAL_FINDINGS),
          QEConditionIds.HAS_CRITICAL_FINDINGS
        ),
        new ActionNode(
          'Remediate Issues',
          getAction(handlers, QEActionIds.REMEDIATE_ISSUES),
          QEActionIds.REMEDIATE_ISSUES
        ),
      ]),
      // Fallback: always succeed (no critical findings = no remediation needed)
      new ActionNode(
        'No Remediation Needed',
        async () => 'SUCCESS',
        'qe.no-remediation-needed'
      ),
    ]),
  ]);
}

// ============================================================================
// Serialization Utilities
// ============================================================================

/**
 * Create a NodeHandlerRegistry from QETreeHandlers.
 * Maps QE-specific handler maps to the generic deserialization registry.
 */
export function createQEHandlerRegistry(
  handlers: QETreeHandlers
): NodeHandlerRegistry {
  const actions = new Map<string, ActionFunction>();
  const conditions = new Map<string, ConditionPredicate>();

  for (const [id, fn] of Object.entries(handlers.actions)) {
    if (fn) actions.set(id, fn);
  }

  for (const [id, fn] of Object.entries(handlers.conditions)) {
    if (fn) conditions.set(id, fn);
  }

  // Add the no-remediation-needed fallback
  actions.set('qe.no-remediation-needed', async () => 'SUCCESS');

  return { actions, conditions };
}

/**
 * Serialize a QE behavior tree to a JSON string.
 */
export function serializeQETree(tree: BehaviorNode): string {
  return JSON.stringify(tree.serialize(), null, 2);
}

/**
 * Deserialize a QE behavior tree from a JSON string.
 */
export function deserializeQETree(
  json: string,
  handlers: QETreeHandlers
): BehaviorNode {
  const data: SerializedNode = JSON.parse(json);
  const registry = createQEHandlerRegistry(handlers);
  return deserializeNode(data, registry);
}
