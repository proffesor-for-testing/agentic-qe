/** Pure output-path conflict detection and payload-free composition hashing. */

import { createHash } from 'node:crypto';
import type { ParallelCompositionReceipt, WorkflowStepDefinition } from './workflow-types.js';

interface WritePath {
  stepId: string;
  path: string;
  segments: string[];
}

/** Include the implicit `results[step.id]` write as well as declared mappings. */
export function parallelWritePaths(step: WorkflowStepDefinition): WritePath[] {
  if (['__proto__', 'constructor', 'prototype'].includes(step.id)) {
    throw new Error(`parallel_output_invalid_path: unsafe step ID ${step.id}`);
  }
  const paths: WritePath[] = [{ stepId: step.id, path: step.id, segments: [step.id] }];
  for (const target of Object.values(step.outputMapping ?? {}).sort()) {
    const segments = target.split('.');
    if (segments.some(part => !part || ['__proto__', 'constructor', 'prototype'].includes(part))) {
      throw new Error(`parallel_output_invalid_path: ${step.id} maps to ${target}`);
    }
    paths.push({ stepId: step.id, path: target, segments });
  }
  return paths;
}

export function parallelOutputConflicts(
  steps: WorkflowStepDefinition[],
): ParallelCompositionReceipt['conflicts'] {
  const writes = steps.flatMap(parallelWritePaths);
  const conflicts: ParallelCompositionReceipt['conflicts'] = [];
  for (let i = 0; i < writes.length; i++) {
    for (let j = i + 1; j < writes.length; j++) {
      const a = writes[i];
      const b = writes[j];
      if (a.stepId === b.stepId) continue;
      const shared = Math.min(a.segments.length, b.segments.length);
      if (!a.segments.slice(0, shared).every((part, index) => part === b.segments[index])) continue;
      conflicts.push({
        pathA: a.path, stepA: a.stepId, pathB: b.path, stepB: b.stepId,
        kind: a.segments.length === b.segments.length ? 'exact' : 'ancestor-descendant',
      });
    }
  }
  return conflicts;
}

/** A declared read of a concurrently runnable sibling needs an explicit dependency. */
export function parallelUndeclaredReads(
  steps: WorkflowStepDefinition[],
): Array<{ stepId: string; sourcePath: string; otherStepId: string }> {
  const reads: Array<{ stepId: string; sourcePath: string; otherStepId: string }> = [];
  for (const step of steps) {
    const paths = [
      ...Object.values(step.inputMapping ?? {}),
      step.condition?.path,
      step.skipCondition?.path,
    ].filter((path): path is string => typeof path === 'string');
    for (const sourcePath of paths) {
      for (const sibling of steps) {
        if (sibling.id === step.id) continue;
        if (sourcePath === 'results') {
          reads.push({ stepId: step.id, sourcePath, otherStepId: sibling.id });
          continue;
        }
        if (!sourcePath.startsWith('results.')) continue;
        const readSegments = sourcePath.slice('results.'.length).split('.');
        const readsSiblingWrite = parallelWritePaths(sibling).some(write => {
          const shared = Math.min(readSegments.length, write.segments.length);
          return write.segments.slice(0, shared).every((segment, index) => segment === readSegments[index]);
        });
        if (readsSiblingWrite) {
          reads.push({ stepId: step.id, sourcePath, otherStepId: sibling.id });
        }
      }
    }
  }
  return reads;
}

/** Canonical, cycle-detecting representation of structured-cloneable values. */
function canonical(value: unknown, ancestors: Set<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return ['number', String(value)];
  if (typeof value === 'bigint') return ['bigint', String(value)];
  if (value === undefined) return ['undefined'];
  if (typeof value !== 'object') throw new Error('parallel_output_unhashable');
  if (ancestors.has(value)) throw new Error('parallel_output_cyclic');
  ancestors.add(value);
  try {
    if (value instanceof Date) return ['date', value.toISOString()];
    if (value instanceof ArrayBuffer) return ['bytes', Buffer.from(value).toString('base64')];
    if (ArrayBuffer.isView(value)) {
      return ['bytes', value.constructor.name, Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64')];
    }
    if (Array.isArray(value)) return ['array', value.map(item => canonical(item, ancestors))];
    if (value instanceof Set) {
      const entries = [...value].map(item => canonical(item, ancestors));
      return ['set', entries.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))];
    }
    if (value instanceof Map) {
      const entries = [...value].map(([key, item]) => [canonical(key, ancestors), canonical(item, ancestors)]);
      return ['map', entries.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))];
    }
    const record = value as Record<string, unknown>;
    return ['object', Object.keys(record).sort().map(key => [key, canonical(record[key], ancestors)])];
  } finally {
    ancestors.delete(value);
  }
}

export function hashWorkflowValue(value: unknown): string {
  const payload = JSON.stringify(canonical(value, new Set()));
  return createHash('sha256').update(payload).digest('hex');
}
