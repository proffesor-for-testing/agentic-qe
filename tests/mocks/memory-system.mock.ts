/**
 * Mock MemorySystem implementation for testing
 */

import { IMemorySystem, MemoryEntry, MemoryMetadata, MemoryQuery, AgentId } from '../../src/core/types';

export class MockMemorySystem implements IMemorySystem {
  private storage: Map<string, MemoryEntry> = new Map();
  public operationLog: Array<{
    operation: 'store' | 'retrieve' | 'query' | 'delete' | 'share';
    params: any;
    timestamp: number;
  }> = [];

  async store(key: string, value: any, metadata?: Partial<MemoryMetadata>): Promise<void> {
    this.operationLog.push({
      operation: 'store',
      params: { key, value, metadata },
      timestamp: Date.now()
    });

    const entry: MemoryEntry = {
      id: `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      key,
      value,
      type: metadata?.type || 'state',
      owner: metadata?.owner || this.getDefaultOwner(),
      permissions: {
        read: 'swarm',
        write: 'team',
        delete: 'private',
        share: 'team'
      },
      metadata: {
        tags: metadata?.tags || [],
        partition: metadata?.partition || 'default',
        consistency: metadata?.consistency || 'eventual',
        replication: metadata?.replication || 1,
        encryption: metadata?.encryption || false,
        compression: metadata?.compression || false,
        ...metadata
      },
      version: 1,
      created: new Date(),
      updated: new Date(),
      accessed: new Date(),
      ttl: metadata?.ttl
    };

    this.storage.set(key, entry);
  }

  async retrieve(key: string): Promise<any> {
    this.operationLog.push({
      operation: 'retrieve',
      params: { key },
      timestamp: Date.now()
    });

    const entry = this.storage.get(key);
    if (!entry) {
      return null;
    }

    // Check TTL
    if (entry.ttl && entry.created.getTime() + entry.ttl < Date.now()) {
      this.storage.delete(key);
      return null;
    }

    // Update access time
    entry.accessed = new Date();
    return entry.value;
  }

  async query(query: MemoryQuery): Promise<MemoryEntry[]> {
    this.operationLog.push({
      operation: 'query',
      params: { query },
      timestamp: Date.now()
    });

    let results = Array.from(this.storage.values());

    // Filter by type
    if (query.type) {
      results = results.filter(entry => entry.type === query.type);
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      results = results.filter(entry =>
        query.tags!.some(tag => entry.metadata.tags.includes(tag))
      );
    }

    // Filter by owner
    if (query.owner) {
      results = results.filter(entry => entry.owner.id === query.owner!.id);
    }

    // Filter by partition
    if (query.partition) {
      results = results.filter(entry => entry.metadata.partition === query.partition);
    }

    // Apply pagination
    const start = query.offset || 0;
    const end = start + (query.limit || results.length);

    return results.slice(start, end);
  }

  async delete(key: string): Promise<void> {
    this.operationLog.push({
      operation: 'delete',
      params: { key },
      timestamp: Date.now()
    });

    this.storage.delete(key);
  }

  async share(key: string, targets: AgentId[]): Promise<void> {
    this.operationLog.push({
      operation: 'share',
      params: { key, targets },
      timestamp: Date.now()
    });

    const entry = this.storage.get(key);
    if (!entry) {
      throw new Error(`Entry ${key} not found`);
    }

    // Mock sharing by creating shared copies
    for (const target of targets) {
      const sharedKey = `shared:${target.id}:${key}`;
      await this.store(sharedKey, entry.value, {
        ...entry.metadata,
        tags: [...entry.metadata.tags, 'shared', `from:${entry.owner.id}`, `to:${target.id}`]
      });
    }
  }

  // Test utilities
  reset(): void {
    this.storage.clear();
    this.operationLog = [];
  }

  getStorageSize(): number {
    return this.storage.size;
  }

  getAllKeys(): string[] {
    return Array.from(this.storage.keys());
  }

  getLastOperation(operation?: string): any {
    if (operation) {
      const ops = this.operationLog.filter(op => op.operation === operation);
      return ops[ops.length - 1];
    }
    return this.operationLog[this.operationLog.length - 1];
  }

  hasKey(key: string): boolean {
    return this.storage.has(key);
  }

  private getDefaultOwner(): AgentId {
    return {
      id: 'test-system',
      swarmId: 'test-swarm',
      type: 'context-orchestrator',
      instance: 0
    };
  }
}