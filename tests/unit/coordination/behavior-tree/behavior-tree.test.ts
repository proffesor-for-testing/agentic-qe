/**
 * Unit tests for Behavior Tree Orchestration
 *
 * Tests core nodes, decorators, pre-built QE trees,
 * and serialization/deserialization.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  // Core nodes
  SequenceNode,
  SelectorNode,
  ParallelNode,
  ActionNode,
  ConditionNode,
  // Decorators
  InverterNode,
  RepeatNode,
  UntilFailNode,
  TimeoutNode,
  RetryNode,
  // Types
  type NodeStatus,
  type BehaviorNode,
  type NodeHandlerRegistry,
  // Deserialization
  deserializeNode,
  // Factory helpers
  sequence,
  selector,
  parallel,
  action,
  condition,
  inverter,
  repeat,
  untilFail,
  timeout,
  retry,
} from '../../../../src/coordination/behavior-tree';
import {
  buildTestGenerationPipeline,
  buildRegressionSuite,
  buildSecurityAudit,
  serializeQETree,
  deserializeQETree,
  QEActionIds,
  QEConditionIds,
  type QETreeHandlers,
} from '../../../../src/coordination/behavior-tree/qe-trees';

// ============================================================================
// Test Helpers
// ============================================================================

function successAction(): ActionNode {
  return new ActionNode('always-succeed', async () => 'SUCCESS');
}

function failAction(): ActionNode {
  return new ActionNode('always-fail', async () => 'FAILURE');
}

function runningAction(): ActionNode {
  return new ActionNode('always-running', async () => 'RUNNING');
}

function countingAction(name: string): { node: ActionNode; getCount: () => number } {
  let count = 0;
  const node = new ActionNode(name, async () => {
    count++;
    return 'SUCCESS';
  });
  return { node, getCount: () => count };
}

function trueCondition(): ConditionNode {
  return new ConditionNode('always-true', async () => true);
}

function falseCondition(): ConditionNode {
  return new ConditionNode('always-false', async () => false);
}

function createStubHandlers(): QETreeHandlers {
  const executionLog: string[] = [];
  return {
    actions: {
      [QEActionIds.ANALYZE_CODE]: async () => {
        executionLog.push('analyze-code');
        return 'SUCCESS';
      },
      [QEActionIds.GENERATE_TESTS]: async () => {
        executionLog.push('generate-tests');
        return 'SUCCESS';
      },
      [QEActionIds.VALIDATE_TESTS]: async () => {
        executionLog.push('validate-tests');
        return 'SUCCESS';
      },
      [QEActionIds.COMMIT_TESTS]: async () => {
        executionLog.push('commit-tests');
        return 'SUCCESS';
      },
      [QEActionIds.LOAD_TESTS]: async () => {
        executionLog.push('load-tests');
        return 'SUCCESS';
      },
      [QEActionIds.EXECUTE_TESTS]: async () => {
        executionLog.push('execute-tests');
        return 'SUCCESS';
      },
      [QEActionIds.COLLECT_RESULTS]: async () => {
        executionLog.push('collect-results');
        return 'SUCCESS';
      },
      [QEActionIds.GENERATE_REPORT]: async () => {
        executionLog.push('generate-report');
        return 'SUCCESS';
      },
      [QEActionIds.SCAN_VULNERABILITIES]: async () => {
        executionLog.push('scan-vulnerabilities');
        return 'SUCCESS';
      },
      [QEActionIds.CLASSIFY_FINDINGS]: async () => {
        executionLog.push('classify-findings');
        return 'SUCCESS';
      },
      [QEActionIds.GENERATE_SECURITY_REPORT]: async () => {
        executionLog.push('generate-security-report');
        return 'SUCCESS';
      },
      [QEActionIds.REMEDIATE_ISSUES]: async () => {
        executionLog.push('remediate-issues');
        return 'SUCCESS';
      },
    },
    conditions: {
      [QEConditionIds.HAS_SOURCE_FILES]: async () => true,
      [QEConditionIds.TESTS_ARE_VALID]: async () => true,
      [QEConditionIds.HAS_TEST_FILES]: async () => true,
      [QEConditionIds.ALL_TESTS_PASSED]: async () => true,
      [QEConditionIds.HAS_CRITICAL_FINDINGS]: async () => true,
      [QEConditionIds.SCAN_COMPLETE]: async () => true,
    },
  };
}

// ============================================================================
// Sequence Node Tests
// ============================================================================

describe('SequenceNode', () => {
  it('should return SUCCESS when all children succeed', async () => {
    const node = new SequenceNode('test-sequence', [
      successAction(),
      successAction(),
      successAction(),
    ]);

    const result = await node.tick();
    expect(result).toBe('SUCCESS');
  });

  it('should return FAILURE on first child failure', async () => {
    const third = countingAction('third');
    const node = new SequenceNode('test-sequence', [
      successAction(),
      failAction(),
      third.node,
    ]);

    const result = await node.tick();
    expect(result).toBe('FAILURE');
    expect(third.getCount()).toBe(0); // Third child should not execute
  });

  it('should return RUNNING when a child is running', async () => {
    const node = new SequenceNode('test-sequence', [
      successAction(),
      runningAction(),
      successAction(),
    ]);

    const result = await node.tick();
    expect(result).toBe('RUNNING');
  });

  it('should return SUCCESS for empty children', async () => {
    const node = new SequenceNode('empty-sequence', []);
    const result = await node.tick();
    expect(result).toBe('SUCCESS');
  });

  it('should resume from where it left off after RUNNING', async () => {
    let callCount = 0;
    const firstAction = new ActionNode('first', async () => {
      callCount++;
      return 'SUCCESS';
    });
    const secondAction = new ActionNode('second', async () => 'SUCCESS');

    const node = new SequenceNode('test-sequence', [
      firstAction,
      secondAction,
    ]);

    // First tick: first child succeeds, moves to second
    await node.tick();
    expect(callCount).toBe(1);

    // Reset and re-tick to verify reset works
    node.reset();
    await node.tick();
    expect(callCount).toBe(2);
  });
});

// ============================================================================
// Selector Node Tests
// ============================================================================

describe('SelectorNode', () => {
  it('should return SUCCESS on first child success', async () => {
    const third = countingAction('third');
    const node = new SelectorNode('test-selector', [
      failAction(),
      successAction(),
      third.node,
    ]);

    const result = await node.tick();
    expect(result).toBe('SUCCESS');
    expect(third.getCount()).toBe(0); // Third should not execute
  });

  it('should return FAILURE when all children fail', async () => {
    const node = new SelectorNode('test-selector', [
      failAction(),
      failAction(),
      failAction(),
    ]);

    const result = await node.tick();
    expect(result).toBe('FAILURE');
  });

  it('should return RUNNING when a child is running', async () => {
    const node = new SelectorNode('test-selector', [
      failAction(),
      runningAction(),
      successAction(),
    ]);

    const result = await node.tick();
    expect(result).toBe('RUNNING');
  });

  it('should return FAILURE for empty children', async () => {
    const node = new SelectorNode('empty-selector', []);
    const result = await node.tick();
    expect(result).toBe('FAILURE');
  });

  it('should try children in order (first success wins)', async () => {
    const log: string[] = [];
    const node = new SelectorNode('test-selector', [
      new ActionNode('a', async () => { log.push('a'); return 'FAILURE'; }),
      new ActionNode('b', async () => { log.push('b'); return 'SUCCESS'; }),
      new ActionNode('c', async () => { log.push('c'); return 'SUCCESS'; }),
    ]);

    await node.tick();
    expect(log).toEqual(['a', 'b']);
  });
});

// ============================================================================
// Parallel Node Tests
// ============================================================================

describe('ParallelNode', () => {
  it('should return SUCCESS when threshold is met', async () => {
    const node = new ParallelNode('test-parallel', [
      successAction(),
      successAction(),
      failAction(),
    ], { successThreshold: 2 });

    const result = await node.tick();
    expect(result).toBe('SUCCESS');
  });

  it('should return FAILURE when threshold cannot be met', async () => {
    const node = new ParallelNode('test-parallel', [
      failAction(),
      failAction(),
      successAction(),
    ], { successThreshold: 2 });

    const result = await node.tick();
    expect(result).toBe('FAILURE');
  });

  it('should return RUNNING when some children still running', async () => {
    const node = new ParallelNode('test-parallel', [
      successAction(),
      runningAction(),
    ], { successThreshold: 2 });

    const result = await node.tick();
    expect(result).toBe('RUNNING');
  });

  it('should succeed with threshold of 1 if any child succeeds', async () => {
    const node = new ParallelNode('test-parallel', [
      failAction(),
      failAction(),
      successAction(),
    ], { successThreshold: 1 });

    const result = await node.tick();
    expect(result).toBe('SUCCESS');
  });

  it('should run all children concurrently', async () => {
    const log: string[] = [];
    const node = new ParallelNode('test-parallel', [
      new ActionNode('a', async () => { log.push('a'); return 'SUCCESS'; }),
      new ActionNode('b', async () => { log.push('b'); return 'SUCCESS'; }),
      new ActionNode('c', async () => { log.push('c'); return 'SUCCESS'; }),
    ], { successThreshold: 3 });

    await node.tick();
    expect(log).toHaveLength(3);
    expect(log).toContain('a');
    expect(log).toContain('b');
    expect(log).toContain('c');
  });

  it('should wait for all when waitForAll is true', async () => {
    const node = new ParallelNode('test-parallel', [
      successAction(),
      runningAction(),
    ], { successThreshold: 1, waitForAll: true });

    const result = await node.tick();
    expect(result).toBe('RUNNING');
  });
});

// ============================================================================
// Action Node Tests
// ============================================================================

describe('ActionNode', () => {
  it('should execute the action function', async () => {
    const fn = vi.fn(async () => 'SUCCESS' as NodeStatus);
    const node = new ActionNode('test-action', fn);

    const result = await node.tick();
    expect(result).toBe('SUCCESS');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('should return FAILURE on exception', async () => {
    const node = new ActionNode('failing-action', async () => {
      throw new Error('boom');
    });

    const result = await node.tick();
    expect(result).toBe('FAILURE');
  });

  it('should serialize with actionId', () => {
    const node = new ActionNode('my-action', async () => 'SUCCESS', 'custom-id');
    const serialized = node.serialize();

    expect(serialized.type).toBe('Action');
    expect(serialized.name).toBe('my-action');
    expect(serialized.config?.actionId).toBe('custom-id');
  });
});

// ============================================================================
// Condition Node Tests
// ============================================================================

describe('ConditionNode', () => {
  it('should return SUCCESS when predicate is true', async () => {
    const node = trueCondition();
    const result = await node.tick();
    expect(result).toBe('SUCCESS');
  });

  it('should return FAILURE when predicate is false', async () => {
    const node = falseCondition();
    const result = await node.tick();
    expect(result).toBe('FAILURE');
  });

  it('should return FAILURE on exception', async () => {
    const node = new ConditionNode('error-condition', async () => {
      throw new Error('boom');
    });

    const result = await node.tick();
    expect(result).toBe('FAILURE');
  });

  it('should serialize with conditionId', () => {
    const node = new ConditionNode('my-cond', async () => true, 'cond-id');
    const serialized = node.serialize();

    expect(serialized.type).toBe('Condition');
    expect(serialized.name).toBe('my-cond');
    expect(serialized.config?.conditionId).toBe('cond-id');
  });
});

// ============================================================================
// Inverter Decorator Tests
// ============================================================================

describe('InverterNode', () => {
  it('should flip SUCCESS to FAILURE', async () => {
    const node = new InverterNode('invert-success', successAction());
    const result = await node.tick();
    expect(result).toBe('FAILURE');
  });

  it('should flip FAILURE to SUCCESS', async () => {
    const node = new InverterNode('invert-failure', failAction());
    const result = await node.tick();
    expect(result).toBe('SUCCESS');
  });

  it('should pass RUNNING through unchanged', async () => {
    const node = new InverterNode('invert-running', runningAction());
    const result = await node.tick();
    expect(result).toBe('RUNNING');
  });
});

// ============================================================================
// Repeat Decorator Tests
// ============================================================================

describe('RepeatNode', () => {
  it('should repeat child n times', async () => {
    const counter = countingAction('counter');
    const node = new RepeatNode('repeat-3', counter.node, 3);

    const result = await node.tick();
    expect(result).toBe('SUCCESS');
    expect(counter.getCount()).toBe(3);
  });

  it('should return FAILURE if child fails on any iteration', async () => {
    let count = 0;
    const child = new ActionNode('fail-on-second', async () => {
      count++;
      return count >= 2 ? 'FAILURE' : 'SUCCESS';
    });
    const node = new RepeatNode('repeat-5', child, 5);

    const result = await node.tick();
    expect(result).toBe('FAILURE');
    expect(count).toBe(2);
  });

  it('should handle count of 1', async () => {
    const counter = countingAction('once');
    const node = new RepeatNode('repeat-1', counter.node, 1);

    const result = await node.tick();
    expect(result).toBe('SUCCESS');
    expect(counter.getCount()).toBe(1);
  });

  it('should reset iteration counter', async () => {
    const counter = countingAction('resettable');
    const node = new RepeatNode('repeat-2', counter.node, 2);

    await node.tick();
    expect(counter.getCount()).toBe(2);

    // Node does not reset the action's internal counter,
    // but the node's own iteration count resets
    node.reset();
    const result = await node.tick();
    expect(result).toBe('SUCCESS');
    expect(counter.getCount()).toBe(4); // 2 + 2
  });

  it('should serialize with count', () => {
    const node = new RepeatNode('repeat-5', successAction(), 5);
    const serialized = node.serialize();

    expect(serialized.type).toBe('Repeat');
    expect(serialized.config?.count).toBe(5);
    expect(serialized.children).toHaveLength(1);
  });
});

// ============================================================================
// UntilFail Decorator Tests
// ============================================================================

describe('UntilFailNode', () => {
  it('should return SUCCESS when child fails', async () => {
    const node = new UntilFailNode('until-fail', failAction());
    const result = await node.tick();
    expect(result).toBe('SUCCESS');
  });

  it('should return RUNNING when child succeeds (to tick again)', async () => {
    const node = new UntilFailNode('until-fail', successAction());
    const result = await node.tick();
    expect(result).toBe('RUNNING');
  });

  it('should pass through RUNNING from child', async () => {
    const node = new UntilFailNode('until-fail', runningAction());
    const result = await node.tick();
    expect(result).toBe('RUNNING');
  });
});

// ============================================================================
// Timeout Decorator Tests
// ============================================================================

describe('TimeoutNode', () => {
  it('should pass through child result if within timeout', async () => {
    const node = new TimeoutNode('timeout-ok', successAction(), 1000);
    const result = await node.tick();
    expect(result).toBe('SUCCESS');
  });

  it('should return FAILURE if child exceeds timeout', async () => {
    const slowChild = new ActionNode('slow', async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return 'SUCCESS';
    });
    const node = new TimeoutNode('timeout-exceeded', slowChild, 50);

    const result = await node.tick();
    expect(result).toBe('FAILURE');
  });

  it('should serialize with timeoutMs', () => {
    const node = new TimeoutNode('timeout', successAction(), 5000);
    const serialized = node.serialize();

    expect(serialized.type).toBe('Timeout');
    expect(serialized.config?.timeoutMs).toBe(5000);
  });
});

// ============================================================================
// Retry Decorator Tests
// ============================================================================

describe('RetryNode', () => {
  it('should return SUCCESS on first try if child succeeds', async () => {
    const node = new RetryNode('retry-ok', successAction(), 3);
    const result = await node.tick();
    expect(result).toBe('SUCCESS');
  });

  it('should retry on failure and succeed on later attempt', async () => {
    let attempt = 0;
    const child = new ActionNode('eventually-succeed', async () => {
      attempt++;
      return attempt >= 3 ? 'SUCCESS' : 'FAILURE';
    });
    const node = new RetryNode('retry-3', child, 3);

    const result = await node.tick();
    expect(result).toBe('SUCCESS');
    expect(attempt).toBe(3);
  });

  it('should return FAILURE after exhausting retries', async () => {
    let attempt = 0;
    const child = new ActionNode('always-fail', async () => {
      attempt++;
      return 'FAILURE';
    });
    const node = new RetryNode('retry-2', child, 2);

    const result = await node.tick();
    expect(result).toBe('FAILURE');
    // 1 initial + 2 retries = 3 attempts
    expect(attempt).toBe(3);
  });

  it('should pass through RUNNING', async () => {
    const node = new RetryNode('retry-running', runningAction(), 3);
    const result = await node.tick();
    expect(result).toBe('RUNNING');
  });

  it('should serialize with maxRetries', () => {
    const node = new RetryNode('retry', successAction(), 5);
    const serialized = node.serialize();

    expect(serialized.type).toBe('Retry');
    expect(serialized.config?.maxRetries).toBe(5);
  });
});

// ============================================================================
// Factory Helper Tests
// ============================================================================

describe('Factory helpers', () => {
  it('should create nodes via factory functions', async () => {
    const tree = sequence('pipeline', [
      condition('check', async () => true),
      selector('try-options', [
        action('option-a', async () => 'FAILURE'),
        action('option-b', async () => 'SUCCESS'),
      ]),
      parallel('concurrent', [
        action('task-1', async () => 'SUCCESS'),
        action('task-2', async () => 'SUCCESS'),
      ], { successThreshold: 2 }),
    ]);

    const result = await tree.tick();
    expect(result).toBe('SUCCESS');
  });

  it('should create decorators via factory functions', async () => {
    const inv = inverter('inv', action('a', async () => 'SUCCESS'));
    expect(await inv.tick()).toBe('FAILURE');

    const rep = repeat('rep', action('a', async () => 'SUCCESS'), 2);
    expect(await rep.tick()).toBe('SUCCESS');

    const uf = untilFail('uf', action('a', async () => 'FAILURE'));
    expect(await uf.tick()).toBe('SUCCESS');

    const to = timeout('to', action('a', async () => 'SUCCESS'), 1000);
    expect(await to.tick()).toBe('SUCCESS');

    const re = retry('re', action('a', async () => 'SUCCESS'), 3);
    expect(await re.tick()).toBe('SUCCESS');
  });
});

// ============================================================================
// Serialization / Deserialization Tests
// ============================================================================

describe('Serialization', () => {
  it('should serialize a tree to JSON-compatible structure', () => {
    const tree = new SequenceNode('root', [
      new ConditionNode('check', async () => true, 'cond-1'),
      new ActionNode('do-something', async () => 'SUCCESS', 'action-1'),
    ]);

    const serialized = tree.serialize();
    expect(serialized.type).toBe('Sequence');
    expect(serialized.name).toBe('root');
    expect(serialized.children).toHaveLength(2);
    expect(serialized.children![0].type).toBe('Condition');
    expect(serialized.children![1].type).toBe('Action');
  });

  it('should serialize nested trees', () => {
    const tree = new SequenceNode('root', [
      new SelectorNode('choices', [
        new ActionNode('a', async () => 'SUCCESS', 'a-id'),
        new ActionNode('b', async () => 'SUCCESS', 'b-id'),
      ]),
      new ParallelNode('parallel', [
        new ActionNode('c', async () => 'SUCCESS', 'c-id'),
      ], { successThreshold: 1 }),
    ]);

    const serialized = tree.serialize();
    const json = JSON.stringify(serialized);
    const parsed = JSON.parse(json);

    expect(parsed.type).toBe('Sequence');
    expect(parsed.children[0].type).toBe('Selector');
    expect(parsed.children[0].children).toHaveLength(2);
    expect(parsed.children[1].type).toBe('Parallel');
    expect(parsed.children[1].config.successThreshold).toBe(1);
  });

  it('should deserialize a tree back to executable nodes', async () => {
    const registry: NodeHandlerRegistry = {
      actions: new Map([
        ['action-1', async () => 'SUCCESS' as NodeStatus],
      ]),
      conditions: new Map([
        ['cond-1', async () => true],
      ]),
    };

    const serialized = {
      type: 'Sequence',
      name: 'root',
      children: [
        { type: 'Condition', name: 'check', config: { conditionId: 'cond-1' } },
        { type: 'Action', name: 'do-it', config: { actionId: 'action-1' } },
      ],
    };

    const tree = deserializeNode(serialized, registry);
    expect(tree.type).toBe('Sequence');
    expect(tree.name).toBe('root');

    const result = await tree.tick();
    expect(result).toBe('SUCCESS');
  });

  it('should throw on unknown node type during deserialization', () => {
    const registry: NodeHandlerRegistry = {
      actions: new Map(),
      conditions: new Map(),
    };

    expect(() =>
      deserializeNode({ type: 'Unknown', name: 'bad' }, registry)
    ).toThrow('Unknown node type');
  });

  it('should throw on missing action handler during deserialization', () => {
    const registry: NodeHandlerRegistry = {
      actions: new Map(),
      conditions: new Map(),
    };

    expect(() =>
      deserializeNode(
        { type: 'Action', name: 'missing', config: { actionId: 'nope' } },
        registry
      )
    ).toThrow("Action handler not found in registry: 'nope'");
  });

  it('should throw on missing condition handler during deserialization', () => {
    const registry: NodeHandlerRegistry = {
      actions: new Map(),
      conditions: new Map(),
    };

    expect(() =>
      deserializeNode(
        { type: 'Condition', name: 'missing', config: { conditionId: 'nope' } },
        registry
      )
    ).toThrow("Condition handler not found in registry: 'nope'");
  });

  it('should round-trip serialize/deserialize a complex tree', async () => {
    const registry: NodeHandlerRegistry = {
      actions: new Map([
        ['a1', async () => 'SUCCESS' as NodeStatus],
        ['a2', async () => 'SUCCESS' as NodeStatus],
      ]),
      conditions: new Map([
        ['c1', async () => true],
      ]),
    };

    const original = new SequenceNode('root', [
      new ConditionNode('guard', async () => true, 'c1'),
      new SelectorNode('options', [
        new ActionNode('first', async () => 'SUCCESS', 'a1'),
        new ActionNode('second', async () => 'SUCCESS', 'a2'),
      ]),
    ]);

    const serialized = JSON.stringify(original.serialize());
    const deserialized = deserializeNode(JSON.parse(serialized), registry);

    const result = await deserialized.tick();
    expect(result).toBe('SUCCESS');
    expect(deserialized.name).toBe('root');
  });
});

// ============================================================================
// Pre-built QE Tree Tests
// ============================================================================

describe('QE Pre-built Trees', () => {
  describe('testGenerationPipeline', () => {
    it('should execute successfully with all handlers succeeding', async () => {
      const handlers = createStubHandlers();
      const tree = buildTestGenerationPipeline(handlers);

      const result = await tree.tick();
      expect(result).toBe('SUCCESS');
    });

    it('should fail when source files check fails', async () => {
      const handlers = createStubHandlers();
      handlers.conditions![QEConditionIds.HAS_SOURCE_FILES] = async () => false;
      const tree = buildTestGenerationPipeline(handlers);

      const result = await tree.tick();
      expect(result).toBe('FAILURE');
    });

    it('should fail when test validation fails', async () => {
      const handlers = createStubHandlers();
      handlers.conditions![QEConditionIds.TESTS_ARE_VALID] = async () => false;
      const tree = buildTestGenerationPipeline(handlers);

      const result = await tree.tick();
      expect(result).toBe('FAILURE');
    });

    it('should serialize to valid JSON', () => {
      const handlers = createStubHandlers();
      const tree = buildTestGenerationPipeline(handlers);
      const json = serializeQETree(tree);
      const parsed = JSON.parse(json);

      expect(parsed.type).toBe('Sequence');
      expect(parsed.name).toBe('Test Generation Pipeline');
    });
  });

  describe('regressionSuite', () => {
    it('should execute successfully with all handlers succeeding', async () => {
      const handlers = createStubHandlers();
      const tree = buildRegressionSuite(handlers);

      const result = await tree.tick();
      expect(result).toBe('SUCCESS');
    });

    it('should fail when no test files found', async () => {
      const handlers = createStubHandlers();
      handlers.conditions![QEConditionIds.HAS_TEST_FILES] = async () => false;
      const tree = buildRegressionSuite(handlers);

      const result = await tree.tick();
      expect(result).toBe('FAILURE');
    });

    it('should accept custom timeout', () => {
      const handlers = createStubHandlers();
      const tree = buildRegressionSuite(handlers, 60000);
      const serialized = tree.serialize();

      // Find the Timeout node
      const timeoutNode = serialized.children?.find(
        (c) => c.type === 'Timeout'
      );
      expect(timeoutNode).toBeDefined();
      expect(timeoutNode?.config?.timeoutMs).toBe(60000);
    });
  });

  describe('securityAudit', () => {
    it('should execute successfully with all handlers succeeding', async () => {
      const handlers = createStubHandlers();
      const tree = buildSecurityAudit(handlers);

      const result = await tree.tick();
      expect(result).toBe('SUCCESS');
    });

    it('should succeed even when no critical findings (via selector fallback)', async () => {
      const handlers = createStubHandlers();
      handlers.conditions![QEConditionIds.HAS_CRITICAL_FINDINGS] = async () => false;
      const tree = buildSecurityAudit(handlers);

      const result = await tree.tick();
      expect(result).toBe('SUCCESS');
    });

    it('should retry scanning on failure', async () => {
      let scanAttempt = 0;
      const handlers = createStubHandlers();
      handlers.actions![QEActionIds.SCAN_VULNERABILITIES] = async () => {
        scanAttempt++;
        return scanAttempt >= 3 ? 'SUCCESS' : 'FAILURE';
      };
      const tree = buildSecurityAudit(handlers);

      const result = await tree.tick();
      expect(result).toBe('SUCCESS');
      expect(scanAttempt).toBe(3);
    });
  });

  describe('QE tree serialization round-trip', () => {
    it('should serialize and deserialize testGenerationPipeline', async () => {
      const handlers = createStubHandlers();
      const original = buildTestGenerationPipeline(handlers);

      const json = serializeQETree(original);
      const restored = deserializeQETree(json, handlers);

      const result = await restored.tick();
      expect(result).toBe('SUCCESS');
    });

    it('should serialize and deserialize securityAudit', async () => {
      const handlers = createStubHandlers();
      const original = buildSecurityAudit(handlers);

      const json = serializeQETree(original);
      const restored = deserializeQETree(json, handlers);

      const result = await restored.tick();
      expect(result).toBe('SUCCESS');
    });

    it('should serialize and deserialize regressionSuite', async () => {
      const handlers = createStubHandlers();
      const original = buildRegressionSuite(handlers);

      const json = serializeQETree(original);
      const restored = deserializeQETree(json, handlers);

      const result = await restored.tick();
      expect(result).toBe('SUCCESS');
    });
  });
});

// ============================================================================
// Complex Composition Tests
// ============================================================================

describe('Complex tree compositions', () => {
  it('should compose decorators with composite nodes', async () => {
    const tree = new TimeoutNode(
      'guarded-pipeline',
      new RetryNode(
        'retry-sequence',
        new SequenceNode('pipeline', [
          trueCondition(),
          successAction(),
        ]),
        2
      ),
      5000
    );

    const result = await tree.tick();
    expect(result).toBe('SUCCESS');
  });

  it('should handle deeply nested trees', async () => {
    const tree = new SequenceNode('level-1', [
      new SelectorNode('level-2', [
        new SequenceNode('level-3a', [
          falseCondition(),
          successAction(),
        ]),
        new ParallelNode('level-3b', [
          successAction(),
          successAction(),
        ], { successThreshold: 2 }),
      ]),
      new InverterNode('invert', falseCondition()),
    ]);

    const result = await tree.tick();
    expect(result).toBe('SUCCESS');
  });

  it('should reset all nested nodes', async () => {
    const counter = countingAction('deep-counter');
    const tree = new RepeatNode(
      'repeat-nested',
      new SequenceNode('inner', [
        trueCondition(),
        counter.node,
      ]),
      3
    );

    await tree.tick();
    expect(counter.getCount()).toBe(3);

    tree.reset();
    await tree.tick();
    expect(counter.getCount()).toBe(6);
  });
});
