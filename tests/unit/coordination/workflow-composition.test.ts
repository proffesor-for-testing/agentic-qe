import { describe, expect, it } from 'vitest';
import { getBuiltInWorkflows } from '../../../src/coordination/workflow-builtin.js';
import {
  hashWorkflowValue, parallelOutputConflicts, parallelUndeclaredReads,
} from '../../../src/coordination/workflow-composition.js';

describe('parallel composition compatibility', () => {
  it('does not reject the built-in workflows under the new path contract', () => {
    for (const workflow of getBuiltInWorkflows()) {
      const initialParallelGroup = workflow.steps.filter(step => !step.dependsOn?.length);
      expect(parallelOutputConflicts(initialParallelGroup), workflow.id).toEqual([]);
      expect(parallelUndeclaredReads(initialParallelGroup), workflow.id).toEqual([]);
    }
  });

  it('hashes the same combined state regardless of object insertion order', () => {
    expect(hashWorkflowValue({ left: { a: 1, b: 2 }, right: [3, 4] })).toBe(
      hashWorkflowValue({ right: [3, 4], left: { b: 2, a: 1 } }),
    );
  });
});
