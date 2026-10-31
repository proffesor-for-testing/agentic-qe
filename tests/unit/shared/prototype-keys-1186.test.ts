/**
 * #1186 follow-ups to #1157 / #1182:
 *   5. dream-engine getStats counted a stored concept type such as
 *      `constructor` onto the inherited member (string concatenation);
 *   6. the planners' state-path lookup stops at non-objects. That is now
 *      deliberate and pinned: `items.length` on an array resolves, `name.length`
 *      on a string does not.
 */
import { describe, it, expect } from 'vitest';
import { ConceptGraphAdapter } from '../../../src/learning/dream/dream-engine';
import { GOAPPlanner } from '../../../src/planning/goap-planner';
import { PlanExecutor } from '../../../src/planning/plan-executor';

const PROTO_KEYS = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'] as const;

describe('prototype-chain keys (#1186)', () => {
  it.each(PROTO_KEYS)('dream getStats counts a stored concept type %s as its own bucket', async (conceptType) => {
    const nodes = [
      { id: 'n1', conceptType, content: 'x', activationLevel: 0.5 },
      { id: 'n2', conceptType, content: 'y', activationLevel: 0.5 },
      { id: 'n3', conceptType: 'pattern', content: 'z', activationLevel: 0.5 },
    ];
    const graph = { getActiveNodes: async () => nodes, getNeighbors: async () => [] };
    const adapter = new ConceptGraphAdapter(graph as never);
    await adapter.loadIntoMemory();

    const stats = adapter.getStats();
    expect(Object.getOwnPropertyDescriptor(stats.byType, conceptType)?.value).toBe(2);
    expect(stats.byType.pattern).toBe(1);
    expect(stats.nodeCount).toBe(3);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  describe.each([
    ['GOAPPlanner', () => new GOAPPlanner()],
    ['PlanExecutor', () => new PlanExecutor({} as never)],
  ])('%s state paths stop at non-objects (deliberate)', (_name, make) => {
    const state = { name: 'abc', items: [1, 2, 3], nested: { count: 4 } };
    const lookup = (key: string): unknown =>
      (make() as unknown as { getStateValue(s: unknown, k: string): unknown }).getStateValue(state, key);

    it('resolves own properties of objects, including an array length', () => {
      expect(lookup('nested.count')).toBe(4);
      expect(lookup('items.length')).toBe(3);
    });

    it('does not resolve a member of a primitive, such as a string length', () => {
      expect(lookup('name.length')).toBeUndefined();
      expect(lookup('nested.count.toFixed')).toBeUndefined();
    });
  });
});
