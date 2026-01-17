/**
 * PriorityQueue - Heap-based priority queue implementation
 *
 * Uses a binary min-heap for O(log n) enqueue/dequeue operations.
 * Higher priority values indicate higher priority (will be dequeued first).
 */

interface QueueItem<T> {
  item: T;
  priority: number;
}

export class PriorityQueue<T> {
  private heap: QueueItem<T>[] = [];

  /**
   * Add an item to the queue with the given priority
   * @param item Item to add
   * @param priority Priority value (higher = higher priority)
   */
  enqueue(item: T, priority: number): void {
    this.heap.push({ item, priority });
    this.bubbleUp(this.heap.length - 1);
  }

  /**
   * Remove and return the highest priority item
   * @returns The item with highest priority, or undefined if empty
   */
  dequeue(): T | undefined {
    if (this.heap.length === 0) {
      return undefined;
    }

    if (this.heap.length === 1) {
      return this.heap.pop()!.item;
    }

    const result = this.heap[0].item;
    this.heap[0] = this.heap.pop()!;
    this.bubbleDown(0);

    return result;
  }

  /**
   * View the highest priority item without removing it
   * @returns The item with highest priority, or undefined if empty
   */
  peek(): T | undefined {
    return this.heap.length > 0 ? this.heap[0].item : undefined;
  }

  /**
   * Check if the queue is empty
   */
  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Get the number of items in the queue
   */
  size(): number {
    return this.heap.length;
  }

  /**
   * Clear all items from the queue
   */
  clear(): void {
    this.heap = [];
  }

  /**
   * Convert queue to array (ordered by priority)
   */
  toArray(): T[] {
    // Create a copy and sort by priority (highest first)
    return [...this.heap]
      .sort((a, b) => b.priority - a.priority)
      .map(item => item.item);
  }

  // ============= PRIVATE HEAP OPERATIONS =============

  /**
   * Bubble up an element to maintain heap property
   */
  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);

      // Max heap: parent should have higher priority
      if (this.heap[parentIndex].priority >= this.heap[index].priority) {
        break;
      }

      this.swap(index, parentIndex);
      index = parentIndex;
    }
  }

  /**
   * Bubble down an element to maintain heap property
   */
  private bubbleDown(index: number): void {
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let largest = index;

      // Find largest among node and its children
      if (
        leftChild < this.heap.length &&
        this.heap[leftChild].priority > this.heap[largest].priority
      ) {
        largest = leftChild;
      }

      if (
        rightChild < this.heap.length &&
        this.heap[rightChild].priority > this.heap[largest].priority
      ) {
        largest = rightChild;
      }

      if (largest === index) {
        break;
      }

      this.swap(index, largest);
      index = largest;
    }
  }

  /**
   * Swap two elements in the heap
   */
  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }
}
