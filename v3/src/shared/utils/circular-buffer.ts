/**
 * CircularBuffer - O(1) fixed-size buffer for metrics/history tracking
 * Replaces inefficient array.push() + array.shift() patterns
 */
export class CircularBuffer<T> {
  private buffer: (T | undefined)[];
  private head = 0;
  private tail = 0;
  private count = 0;

  constructor(private readonly capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
  }

  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity;
      result.push(this.buffer[idx] as T);
    }
    return result;
  }

  get length(): number {
    return this.count;
  }

  get size(): number {
    return this.count;
  }

  clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }

  // Get last N items (most recent)
  last(n: number): T[] {
    const result: T[] = [];
    const start = Math.max(0, this.count - n);
    for (let i = start; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity;
      result.push(this.buffer[idx] as T);
    }
    return result;
  }

  // Calculate percentile (useful for latency tracking)
  percentile(p: number): T | undefined {
    if (this.count === 0) return undefined;
    const sorted = this.toArray().sort((a, b) => (a as any) - (b as any));
    const idx = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[idx];
  }

  // Reduce over all items
  reduce<U>(fn: (acc: U, item: T) => U, initial: U): U {
    let acc = initial;
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity;
      acc = fn(acc, this.buffer[idx] as T);
    }
    return acc;
  }

  // Calculate average (for number buffers)
  average(): number {
    if (this.count === 0) return 0;
    const sum = this.reduce((acc, item) => acc + (item as unknown as number), 0);
    return sum / this.count;
  }
}
