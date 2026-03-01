/**
 * Unit tests for Binary Insert utilities
 * Tests O(log n) sorted insertion algorithms
 */

import { describe, it, expect } from 'vitest';
import {
  binarySearchInsertIndex,
  binaryInsert,
  binaryInsertUnique,
  binaryRemove,
  dateComparator,
  createdAtComparator,
  keyComparator,
  Comparator,
} from '../../../../src/shared/utils/binary-insert';

describe('binarySearchInsertIndex', () => {
  const numCompare: Comparator<number> = (a, b) => a - b;

  it('should find correct index in empty array', () => {
    expect(binarySearchInsertIndex([], 5, numCompare)).toBe(0);
  });

  it('should find correct index at beginning', () => {
    expect(binarySearchInsertIndex([3, 5, 7], 1, numCompare)).toBe(0);
  });

  it('should find correct index at end', () => {
    expect(binarySearchInsertIndex([3, 5, 7], 10, numCompare)).toBe(3);
  });

  it('should find correct index in middle', () => {
    expect(binarySearchInsertIndex([1, 3, 5, 7, 9], 4, numCompare)).toBe(2);
    expect(binarySearchInsertIndex([1, 3, 5, 7, 9], 6, numCompare)).toBe(3);
  });

  it('should handle duplicates (insert after)', () => {
    expect(binarySearchInsertIndex([1, 3, 3, 3, 5], 3, numCompare)).toBe(4);
  });

  it('should work with single element array', () => {
    expect(binarySearchInsertIndex([5], 3, numCompare)).toBe(0);
    expect(binarySearchInsertIndex([5], 7, numCompare)).toBe(1);
    expect(binarySearchInsertIndex([5], 5, numCompare)).toBe(1);
  });

  it('should work with large arrays', () => {
    const arr = Array.from({ length: 10000 }, (_, i) => i * 2); // [0, 2, 4, 6, ...]
    // 5000 is at index 2500, binary search returns insertion point AFTER equal elements
    expect(binarySearchInsertIndex(arr, 5000, numCompare)).toBe(2501); // Insert after 5000 (which is at index 2500)
    expect(binarySearchInsertIndex(arr, 5001, numCompare)).toBe(2501); // Insert between 5000 and 5002
    expect(binarySearchInsertIndex(arr, 4999, numCompare)).toBe(2500); // Insert between 4998 and 5000
    expect(binarySearchInsertIndex(arr, -1, numCompare)).toBe(0);
    expect(binarySearchInsertIndex(arr, 20000, numCompare)).toBe(10000);
  });
});

describe('binaryInsert', () => {
  const numCompare: Comparator<number> = (a, b) => a - b;

  it('should insert into empty array', () => {
    const arr: number[] = [];
    binaryInsert(arr, 5, numCompare);
    expect(arr).toEqual([5]);
  });

  it('should maintain sorted order', () => {
    const arr: number[] = [];
    binaryInsert(arr, 5, numCompare);
    binaryInsert(arr, 3, numCompare);
    binaryInsert(arr, 7, numCompare);
    binaryInsert(arr, 1, numCompare);
    binaryInsert(arr, 9, numCompare);
    expect(arr).toEqual([1, 3, 5, 7, 9]);
  });

  it('should handle duplicates', () => {
    const arr: number[] = [1, 3, 5];
    binaryInsert(arr, 3, numCompare);
    expect(arr).toEqual([1, 3, 3, 5]);
  });

  it('should return correct insertion index', () => {
    const arr: number[] = [1, 3, 5, 7, 9];
    expect(binaryInsert(arr, 4, numCompare)).toBe(2);
    expect(arr).toEqual([1, 3, 4, 5, 7, 9]);
  });

  it('should be efficient for many insertions', () => {
    const arr: number[] = [];
    const start = performance.now();

    // Insert 1000 random numbers
    for (let i = 0; i < 1000; i++) {
      binaryInsert(arr, Math.random() * 10000, numCompare);
    }

    const duration = performance.now() - start;

    // Should complete in reasonable time (< 100ms)
    expect(duration).toBeLessThan(100);

    // Array should be sorted
    for (let i = 1; i < arr.length; i++) {
      expect(arr[i]).toBeGreaterThanOrEqual(arr[i - 1]);
    }
  });
});

describe('binaryInsertUnique', () => {
  const numCompare: Comparator<number> = (a, b) => a - b;

  it('should insert unique values', () => {
    const arr: number[] = [];
    expect(binaryInsertUnique(arr, 5, numCompare)).toBe(0);
    expect(binaryInsertUnique(arr, 3, numCompare)).toBe(0);
    expect(binaryInsertUnique(arr, 7, numCompare)).toBe(2);
    expect(arr).toEqual([3, 5, 7]);
  });

  it('should reject duplicates', () => {
    const arr: number[] = [1, 3, 5, 7];
    expect(binaryInsertUnique(arr, 3, numCompare)).toBe(-1);
    expect(binaryInsertUnique(arr, 5, numCompare)).toBe(-1);
    expect(arr).toEqual([1, 3, 5, 7]);
  });

  it('should use custom equals function', () => {
    interface Item {
      id: number;
      value: number;
    }

    const items: Item[] = [
      { id: 1, value: 10 },
      { id: 2, value: 20 },
      { id: 3, value: 30 },
    ];

    const compare: Comparator<Item> = (a, b) => a.value - b.value;
    const equals = (a: Item, b: Item) => a.id === b.id;

    // Different value but same id - should reject
    expect(binaryInsertUnique(items, { id: 2, value: 25 }, compare, equals)).toBe(-1);

    // Different id - should insert
    expect(binaryInsertUnique(items, { id: 4, value: 25 }, compare, equals)).toBe(2);
    expect(items.length).toBe(4);
  });
});

describe('binaryRemove', () => {
  const numCompare: Comparator<number> = (a, b) => a - b;

  it('should remove existing value', () => {
    const arr = [1, 3, 5, 7, 9];
    expect(binaryRemove(arr, 5, numCompare)).toBe(true);
    expect(arr).toEqual([1, 3, 7, 9]);
  });

  it('should return false for non-existent value', () => {
    const arr = [1, 3, 5, 7, 9];
    expect(binaryRemove(arr, 4, numCompare)).toBe(false);
    expect(arr).toEqual([1, 3, 5, 7, 9]);
  });

  it('should handle edge cases', () => {
    const arr = [5];
    expect(binaryRemove(arr, 5, numCompare)).toBe(true);
    expect(arr).toEqual([]);
    expect(binaryRemove(arr, 5, numCompare)).toBe(false);
  });
});

describe('dateComparator', () => {
  it('should compare dates correctly', () => {
    const d1 = new Date('2024-01-01');
    const d2 = new Date('2024-06-15');
    const d3 = new Date('2024-12-31');

    expect(dateComparator(d1, d2)).toBeLessThan(0);
    expect(dateComparator(d2, d1)).toBeGreaterThan(0);
    expect(dateComparator(d1, d1)).toBe(0);

    const arr: Date[] = [];
    binaryInsert(arr, d2, dateComparator);
    binaryInsert(arr, d1, dateComparator);
    binaryInsert(arr, d3, dateComparator);
    expect(arr).toEqual([d1, d2, d3]);
  });
});

describe('createdAtComparator', () => {
  interface Task {
    id: string;
    createdAt: Date;
  }

  const comparator = createdAtComparator<Task>();

  it('should compare by createdAt field', () => {
    const tasks: Task[] = [];

    binaryInsert(tasks, { id: 'b', createdAt: new Date('2024-06-15') }, comparator);
    binaryInsert(tasks, { id: 'a', createdAt: new Date('2024-01-01') }, comparator);
    binaryInsert(tasks, { id: 'c', createdAt: new Date('2024-12-31') }, comparator);

    expect(tasks.map(t => t.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('keyComparator', () => {
  it('should create comparator from key function', () => {
    interface Item {
      priority: number;
      name: string;
    }

    const items: Item[] = [];
    const comparator = keyComparator<Item, number>(item => item.priority);

    binaryInsert(items, { priority: 2, name: 'medium' }, comparator);
    binaryInsert(items, { priority: 1, name: 'high' }, comparator);
    binaryInsert(items, { priority: 3, name: 'low' }, comparator);

    expect(items.map(i => i.name)).toEqual(['high', 'medium', 'low']);
  });

  it('should work with custom key comparator', () => {
    interface Item {
      name: string;
    }

    const items: Item[] = [];
    const comparator = keyComparator<Item, string>(
      item => item.name,
      (a, b) => a.localeCompare(b)
    );

    binaryInsert(items, { name: 'banana' }, comparator);
    binaryInsert(items, { name: 'apple' }, comparator);
    binaryInsert(items, { name: 'cherry' }, comparator);

    expect(items.map(i => i.name)).toEqual(['apple', 'banana', 'cherry']);
  });
});

describe('Performance: binaryInsert vs Array.sort', () => {
  const numCompare: Comparator<number> = (a, b) => a - b;

  it('should be faster than sort for many insertions', () => {
    const iterations = 1000;
    const values = Array.from({ length: iterations }, () => Math.random() * 10000);

    // Test binaryInsert
    const arr1: number[] = [];
    const start1 = performance.now();
    for (const val of values) {
      binaryInsert(arr1, val, numCompare);
    }
    const binaryTime = performance.now() - start1;

    // Test push + sort (simulating the old approach)
    const arr2: number[] = [];
    const start2 = performance.now();
    for (const val of values) {
      arr2.push(val);
      arr2.sort((a, b) => a - b);
    }
    const sortTime = performance.now() - start2;

    // Binary insert should be faster
    console.log(`Binary insert: ${binaryTime.toFixed(2)}ms, Sort: ${sortTime.toFixed(2)}ms`);
    expect(binaryTime).toBeLessThan(sortTime);

    // Both should produce same result
    expect(arr1).toEqual(arr2);
  });

  it('should maintain O(log n) search complexity', () => {
    // Create arrays of different sizes and measure search time
    const sizes = [100, 1000, 10000];
    const searchTimes: number[] = [];

    for (const size of sizes) {
      const arr = Array.from({ length: size }, (_, i) => i);
      const searchValue = size / 2;

      const start = performance.now();
      // Run 10000 searches to get measurable time
      for (let i = 0; i < 10000; i++) {
        binarySearchInsertIndex(arr, searchValue, numCompare);
      }
      searchTimes.push(performance.now() - start);
    }

    // Time should grow logarithmically, not linearly
    // ratio between 10x larger array should be close to log(10)/log(1) = ~3.32x not 10x
    const ratio1 = searchTimes[1] / searchTimes[0];
    const ratio2 = searchTimes[2] / searchTimes[1];

    console.log(`Search times: ${sizes.map((s, i) => `n=${s}: ${searchTimes[i].toFixed(2)}ms`).join(', ')}`);
    console.log(`Ratios: ${ratio1.toFixed(2)}, ${ratio2.toFixed(2)}`);

    // Ratios should be much less than 10 (linear would be ~10)
    expect(ratio1).toBeLessThan(5);
    expect(ratio2).toBeLessThan(5);
  });
});

describe('Queen Coordinator Task Queue Simulation', () => {
  interface QueenTask {
    id: string;
    priority: 'p0' | 'p1' | 'p2' | 'p3';
    createdAt: Date;
    type: string;
  }

  const taskComparator = createdAtComparator<QueenTask>();

  it('should efficiently maintain task queue order', () => {
    const queue: QueenTask[] = [];
    const numTasks = 500;

    // Simulate task submissions with varying timestamps
    const baseTime = Date.now();
    const tasks: QueenTask[] = Array.from({ length: numTasks }, (_, i) => ({
      id: `task_${i}`,
      priority: ['p0', 'p1', 'p2', 'p3'][i % 4] as QueenTask['priority'],
      createdAt: new Date(baseTime + Math.random() * 10000),
      type: 'test-task',
    }));

    const start = performance.now();

    for (const task of tasks) {
      binaryInsert(queue, task, taskComparator);
    }

    const duration = performance.now() - start;

    // Should complete quickly
    expect(duration).toBeLessThan(50);

    // Queue should be sorted by createdAt
    for (let i = 1; i < queue.length; i++) {
      expect(queue[i].createdAt.getTime()).toBeGreaterThanOrEqual(
        queue[i - 1].createdAt.getTime()
      );
    }

    console.log(`Enqueued ${numTasks} tasks in ${duration.toFixed(2)}ms (binary insert)`);
  });
});
