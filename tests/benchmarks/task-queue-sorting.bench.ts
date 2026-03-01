/**
 * Benchmark: Task Queue Sorting Performance
 *
 * Compares O(n log n) sort approach vs O(log n) binary insertion
 * for the Queen Coordinator's task queue.
 *
 * Run with: npx vitest bench tests/benchmarks/task-queue-sorting.bench.ts
 */

import { describe, bench } from 'vitest';
import { binaryInsert, createdAtComparator } from '../../src/shared/utils/binary-insert';

interface QueenTask {
  id: string;
  priority: 'p0' | 'p1' | 'p2' | 'p3';
  createdAt: Date;
  type: string;
}

const taskComparator = createdAtComparator<QueenTask>();

function createTasks(count: number): QueenTask[] {
  const baseTime = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    id: `task_${i}`,
    priority: ['p0', 'p1', 'p2', 'p3'][i % 4] as QueenTask['priority'],
    createdAt: new Date(baseTime + Math.random() * 10000),
    type: 'test-task',
  }));
}

// Old approach: push + sort on every insertion
function enqueueWithSort(queue: QueenTask[], task: QueenTask): void {
  queue.push(task);
  queue.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

// New approach: binary insertion (O(log n) search + O(n) insert)
function enqueueWithBinaryInsert(queue: QueenTask[], task: QueenTask): void {
  binaryInsert(queue, task, taskComparator);
}

describe('Task Queue Enqueue Performance', () => {
  const sizes = [100, 500, 1000];

  for (const size of sizes) {
    describe(`${size} tasks`, () => {
      bench('OLD: push + sort (O(n log n) per insert)', () => {
        const queue: QueenTask[] = [];
        const tasks = createTasks(size);
        for (const task of tasks) {
          enqueueWithSort(queue, task);
        }
      });

      bench('NEW: binary insert (O(log n) search)', () => {
        const queue: QueenTask[] = [];
        const tasks = createTasks(size);
        for (const task of tasks) {
          enqueueWithBinaryInsert(queue, task);
        }
      });
    });
  }
});

describe('Single Insertion into Existing Queue', () => {
  const queueSizes = [100, 1000, 5000];

  for (const queueSize of queueSizes) {
    describe(`Queue size ${queueSize}`, () => {
      const baseTime = Date.now();
      const existingTasks = Array.from({ length: queueSize }, (_, i) => ({
        id: `task_${i}`,
        priority: 'p1' as const,
        createdAt: new Date(baseTime + i * 10),
        type: 'test-task',
      }));

      const newTask: QueenTask = {
        id: 'new_task',
        priority: 'p0',
        createdAt: new Date(baseTime + (queueSize / 2) * 10), // Insert in middle
        type: 'urgent-task',
      };

      bench('OLD: push + sort', () => {
        const queue = [...existingTasks];
        enqueueWithSort(queue, newTask);
      });

      bench('NEW: binary insert', () => {
        const queue = [...existingTasks];
        enqueueWithBinaryInsert(queue, newTask);
      });
    });
  }
});
