/**
 * Agentic QE v3 - Claim Repository
 * Persistent storage for test task claims
 *
 * Uses memory backend with optional vector search for semantic matching.
 * Supports filtering, sorting, and expiry management.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Claim,
  ClaimMetadata,
  ClaimFilter,
  ClaimSortOptions,
  ClaimStatus,
  IClaimRepository,
} from './interfaces';
import { MemoryBackend, StoreOptions } from '../../kernel/interfaces';

// ============================================================================
// Constants
// ============================================================================

const CLAIM_PREFIX = 'claims:';
const CLAIM_INDEX_PREFIX = 'claims:index:';
const CLAIM_TTL_DEFAULT = 86400000 * 7; // 7 days

// ============================================================================
// In-Memory Claim Repository
// ============================================================================

/**
 * In-memory implementation of claim repository
 * Suitable for single-node deployments and testing
 */
export class InMemoryClaimRepository implements IClaimRepository {
  private readonly claims = new Map<string, Claim>();

  async create(claim: Claim): Promise<void> {
    if (this.claims.has(claim.id)) {
      throw new Error(`Claim already exists: ${claim.id}`);
    }
    this.claims.set(claim.id, claim);
  }

  async get(claimId: string): Promise<Claim | undefined> {
    return this.claims.get(claimId);
  }

  async update(claim: Claim): Promise<void> {
    if (!this.claims.has(claim.id)) {
      throw new Error(`Claim not found: ${claim.id}`);
    }
    this.claims.set(claim.id, {
      ...claim,
      updatedAt: new Date(),
    });
  }

  async delete(claimId: string): Promise<boolean> {
    return this.claims.delete(claimId);
  }

  async find(filter: ClaimFilter, sort?: ClaimSortOptions): Promise<Claim[]> {
    let results = Array.from(this.claims.values());

    // Apply filters
    results = this.applyFilter(results, filter);

    // Apply sorting
    if (sort) {
      results = this.applySort(results, sort);
    } else {
      // Default sort by priority then createdAt
      results.sort((a, b) => {
        const priorityOrder = { p0: 0, p1: 1, p2: 2, p3: 3 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
    }

    // Apply pagination
    if (filter.offset) {
      results = results.slice(filter.offset);
    }
    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  async count(filter: ClaimFilter): Promise<number> {
    const results = this.applyFilter(Array.from(this.claims.values()), filter);
    return results.length;
  }

  async findExpired(): Promise<Claim[]> {
    const now = new Date();
    return Array.from(this.claims.values()).filter(
      claim => claim.expiresAt && claim.expiresAt < now && claim.status === 'claimed'
    );
  }

  async findStale(thresholdMs: number): Promise<Claim[]> {
    const threshold = new Date(Date.now() - thresholdMs);
    return Array.from(this.claims.values()).filter(
      claim =>
        claim.status === 'claimed' &&
        claim.updatedAt < threshold
    );
  }

  private applyFilter(claims: Claim[], filter: ClaimFilter): Claim[] {
    return claims.filter(claim => {
      // Type filter
      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        if (!types.includes(claim.type)) return false;
      }

      // Status filter
      if (filter.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        if (!statuses.includes(claim.status)) return false;
      }

      // Priority filter
      if (filter.priority) {
        const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
        if (!priorities.includes(claim.priority)) return false;
      }

      // Domain filter
      if (filter.domain) {
        const domains = Array.isArray(filter.domain) ? filter.domain : [filter.domain];
        if (!domains.includes(claim.domain)) return false;
      }

      // Claimant ID filter
      if (filter.claimantId && claim.claimant?.id !== filter.claimantId) {
        return false;
      }

      // Claimant type filter
      if (filter.claimantType && claim.claimant?.type !== filter.claimantType) {
        return false;
      }

      // Available filter
      if (filter.available === true && claim.status !== 'available') {
        return false;
      }

      // Expired filter
      if (filter.expired === true) {
        if (!claim.expiresAt || claim.expiresAt >= new Date()) {
          return false;
        }
      }

      // Tags filter (any match)
      if (filter.tags && filter.tags.length > 0) {
        const hasMatchingTag = filter.tags.some(tag => claim.tags.includes(tag));
        if (!hasMatchingTag) return false;
      }

      // Date filters
      if (filter.createdAfter && claim.createdAt < filter.createdAfter) {
        return false;
      }
      if (filter.createdBefore && claim.createdAt > filter.createdBefore) {
        return false;
      }
      if (filter.deadlineBefore && (!claim.deadline || claim.deadline > filter.deadlineBefore)) {
        return false;
      }

      // Search filter
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        const titleMatch = claim.title.toLowerCase().includes(searchLower);
        const descMatch = claim.description?.toLowerCase().includes(searchLower);
        if (!titleMatch && !descMatch) return false;
      }

      return true;
    });
  }

  private applySort(claims: Claim[], sort: ClaimSortOptions): Claim[] {
    const multiplier = sort.direction === 'asc' ? 1 : -1;

    return [...claims].sort((a, b) => {
      switch (sort.field) {
        case 'createdAt':
          return multiplier * (a.createdAt.getTime() - b.createdAt.getTime());
        case 'updatedAt':
          return multiplier * (a.updatedAt.getTime() - b.updatedAt.getTime());
        case 'priority': {
          const priorityOrder = { p0: 0, p1: 1, p2: 2, p3: 3 };
          return multiplier * (priorityOrder[a.priority] - priorityOrder[b.priority]);
        }
        case 'deadline': {
          const aDeadline = a.deadline?.getTime() ?? Infinity;
          const bDeadline = b.deadline?.getTime() ?? Infinity;
          return multiplier * (aDeadline - bDeadline);
        }
        case 'estimatedEffort': {
          const aEffort = a.estimatedEffort ?? Infinity;
          const bEffort = b.estimatedEffort ?? Infinity;
          return multiplier * (aEffort - bEffort);
        }
        default:
          return 0;
      }
    });
  }

  /** Clear all claims (for testing) */
  clear(): void {
    this.claims.clear();
  }
}

// ============================================================================
// Persistent Claim Repository
// ============================================================================

/**
 * Persistent implementation using MemoryBackend
 * Supports distributed deployments with shared storage
 */
export class PersistentClaimRepository implements IClaimRepository {
  constructor(
    private readonly memory: MemoryBackend,
    private readonly namespace: string = 'claims'
  ) {}

  async create(claim: Claim): Promise<void> {
    const key = this.getClaimKey(claim.id);
    const existing = await this.memory.get(key);

    if (existing) {
      throw new Error(`Claim already exists: ${claim.id}`);
    }

    const options: StoreOptions = {
      namespace: this.namespace,
      ttl: CLAIM_TTL_DEFAULT,
      persist: true,
    };

    await this.memory.set(key, this.serializeClaim(claim), options);

    // Update indexes
    await this.updateIndexes(claim);
  }

  async get(claimId: string): Promise<Claim | undefined> {
    const key = this.getClaimKey(claimId);
    const data = await this.memory.get<SerializedClaim>(key);

    if (!data) return undefined;

    return this.deserializeClaim(data);
  }

  async update(claim: Claim): Promise<void> {
    const key = this.getClaimKey(claim.id);
    const existing = await this.memory.get(key);

    if (!existing) {
      throw new Error(`Claim not found: ${claim.id}`);
    }

    const updated = {
      ...claim,
      updatedAt: new Date(),
    };

    const options: StoreOptions = {
      namespace: this.namespace,
      ttl: CLAIM_TTL_DEFAULT,
      persist: true,
    };

    await this.memory.set(key, this.serializeClaim(updated), options);

    // Update indexes
    await this.updateIndexes(updated);
  }

  async delete(claimId: string): Promise<boolean> {
    const key = this.getClaimKey(claimId);
    const claim = await this.get(claimId);

    if (!claim) return false;

    await this.memory.delete(key);

    // Remove from indexes
    await this.removeFromIndexes(claim);

    return true;
  }

  async find(filter: ClaimFilter, sort?: ClaimSortOptions): Promise<Claim[]> {
    // Get all claim keys
    const pattern = `${CLAIM_PREFIX}*`;
    const keys = await this.memory.search(pattern);

    // Load all claims
    const claims: Claim[] = [];
    for (const key of keys) {
      // Skip index keys
      if (key.includes(':index:')) continue;

      const data = await this.memory.get<SerializedClaim>(key);
      if (data) {
        claims.push(this.deserializeClaim(data));
      }
    }

    // Apply in-memory filtering and sorting
    // (In production, you'd want to use database-level queries)
    let results = this.applyFilter(claims, filter);

    if (sort) {
      results = this.applySort(results, sort);
    } else {
      results.sort((a, b) => {
        const priorityOrder = { p0: 0, p1: 1, p2: 2, p3: 3 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
    }

    if (filter.offset) {
      results = results.slice(filter.offset);
    }
    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  async count(filter: ClaimFilter): Promise<number> {
    const results = await this.find({ ...filter, limit: undefined, offset: undefined });
    return results.length;
  }

  async findExpired(): Promise<Claim[]> {
    const now = new Date();
    const all = await this.find({ status: 'claimed' });
    return all.filter(claim => claim.expiresAt && claim.expiresAt < now);
  }

  async findStale(thresholdMs: number): Promise<Claim[]> {
    const threshold = new Date(Date.now() - thresholdMs);
    const all = await this.find({ status: 'claimed' });
    return all.filter(claim => claim.updatedAt < threshold);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private getClaimKey(claimId: string): string {
    return `${CLAIM_PREFIX}${claimId}`;
  }

  private getIndexKey(indexType: string, value: string): string {
    return `${CLAIM_INDEX_PREFIX}${indexType}:${value}`;
  }

  private serializeClaim(claim: Claim): SerializedClaim {
    return {
      ...claim,
      createdAt: claim.createdAt.toISOString(),
      updatedAt: claim.updatedAt.toISOString(),
      claimedAt: claim.claimedAt?.toISOString(),
      expiresAt: claim.expiresAt?.toISOString(),
      deadline: claim.deadline?.toISOString(),
      metadata: this.serializeMetadata(claim.metadata),
    };
  }

  private deserializeClaim(data: SerializedClaim): Claim {
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      claimedAt: data.claimedAt ? new Date(data.claimedAt) : undefined,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
      metadata: this.deserializeMetadata(data.metadata),
    } as Claim;
  }

  private serializeMetadata(metadata: ClaimMetadata): SerializedMetadata {
    // Handle Date fields in metadata
    if ('lastFailure' in metadata && metadata.lastFailure) {
      return {
        ...metadata,
        lastFailure: (metadata.lastFailure as Date).toISOString(),
      };
    }
    if ('generatedAt' in metadata && metadata.generatedAt) {
      return {
        ...metadata,
        generatedAt: (metadata.generatedAt as Date).toISOString(),
      };
    }
    return metadata as unknown as SerializedMetadata;
  }

  private deserializeMetadata(data: SerializedMetadata): ClaimMetadata {
    if ('lastFailure' in data && data.lastFailure) {
      return {
        ...data,
        lastFailure: new Date(data.lastFailure as string),
      } as ClaimMetadata;
    }
    if ('generatedAt' in data && data.generatedAt) {
      return {
        ...data,
        generatedAt: new Date(data.generatedAt as string),
      } as ClaimMetadata;
    }
    return data as unknown as ClaimMetadata;
  }

  private async updateIndexes(claim: Claim): Promise<void> {
    const options: StoreOptions = {
      namespace: this.namespace,
      ttl: CLAIM_TTL_DEFAULT,
    };

    // Index by type
    const typeKey = this.getIndexKey('type', claim.type);
    const typeIndex = (await this.memory.get<string[]>(typeKey)) || [];
    if (!typeIndex.includes(claim.id)) {
      typeIndex.push(claim.id);
      await this.memory.set(typeKey, typeIndex, options);
    }

    // Index by status
    const statusKey = this.getIndexKey('status', claim.status);
    const statusIndex = (await this.memory.get<string[]>(statusKey)) || [];
    if (!statusIndex.includes(claim.id)) {
      statusIndex.push(claim.id);
      await this.memory.set(statusKey, statusIndex, options);
    }

    // Index by domain
    const domainKey = this.getIndexKey('domain', claim.domain);
    const domainIndex = (await this.memory.get<string[]>(domainKey)) || [];
    if (!domainIndex.includes(claim.id)) {
      domainIndex.push(claim.id);
      await this.memory.set(domainKey, domainIndex, options);
    }

    // Index by claimant if claimed
    if (claim.claimant) {
      const claimantKey = this.getIndexKey('claimant', claim.claimant.id);
      const claimantIndex = (await this.memory.get<string[]>(claimantKey)) || [];
      if (!claimantIndex.includes(claim.id)) {
        claimantIndex.push(claim.id);
        await this.memory.set(claimantKey, claimantIndex, options);
      }
    }
  }

  private async removeFromIndexes(claim: Claim): Promise<void> {
    const removeFromIndex = async (indexType: string, value: string) => {
      const key = this.getIndexKey(indexType, value);
      const index = (await this.memory.get<string[]>(key)) || [];
      const filtered = index.filter(id => id !== claim.id);
      if (filtered.length > 0) {
        await this.memory.set(key, filtered, { namespace: this.namespace });
      } else {
        await this.memory.delete(key);
      }
    };

    await removeFromIndex('type', claim.type);
    await removeFromIndex('status', claim.status);
    await removeFromIndex('domain', claim.domain);

    if (claim.claimant) {
      await removeFromIndex('claimant', claim.claimant.id);
    }
  }

  private applyFilter(claims: Claim[], filter: ClaimFilter): Claim[] {
    return claims.filter(claim => {
      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        if (!types.includes(claim.type)) return false;
      }

      if (filter.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        if (!statuses.includes(claim.status)) return false;
      }

      if (filter.priority) {
        const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
        if (!priorities.includes(claim.priority)) return false;
      }

      if (filter.domain) {
        const domains = Array.isArray(filter.domain) ? filter.domain : [filter.domain];
        if (!domains.includes(claim.domain)) return false;
      }

      if (filter.claimantId && claim.claimant?.id !== filter.claimantId) {
        return false;
      }

      if (filter.claimantType && claim.claimant?.type !== filter.claimantType) {
        return false;
      }

      if (filter.available === true && claim.status !== 'available') {
        return false;
      }

      if (filter.expired === true) {
        if (!claim.expiresAt || claim.expiresAt >= new Date()) {
          return false;
        }
      }

      if (filter.tags && filter.tags.length > 0) {
        const hasMatchingTag = filter.tags.some(tag => claim.tags.includes(tag));
        if (!hasMatchingTag) return false;
      }

      if (filter.createdAfter && claim.createdAt < filter.createdAfter) {
        return false;
      }
      if (filter.createdBefore && claim.createdAt > filter.createdBefore) {
        return false;
      }
      if (filter.deadlineBefore && (!claim.deadline || claim.deadline > filter.deadlineBefore)) {
        return false;
      }

      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        const titleMatch = claim.title.toLowerCase().includes(searchLower);
        const descMatch = claim.description?.toLowerCase().includes(searchLower);
        if (!titleMatch && !descMatch) return false;
      }

      return true;
    });
  }

  private applySort(claims: Claim[], sort: ClaimSortOptions): Claim[] {
    const multiplier = sort.direction === 'asc' ? 1 : -1;

    return [...claims].sort((a, b) => {
      switch (sort.field) {
        case 'createdAt':
          return multiplier * (a.createdAt.getTime() - b.createdAt.getTime());
        case 'updatedAt':
          return multiplier * (a.updatedAt.getTime() - b.updatedAt.getTime());
        case 'priority': {
          const priorityOrder = { p0: 0, p1: 1, p2: 2, p3: 3 };
          return multiplier * (priorityOrder[a.priority] - priorityOrder[b.priority]);
        }
        case 'deadline': {
          const aDeadline = a.deadline?.getTime() ?? Infinity;
          const bDeadline = b.deadline?.getTime() ?? Infinity;
          return multiplier * (aDeadline - bDeadline);
        }
        case 'estimatedEffort': {
          const aEffort = a.estimatedEffort ?? Infinity;
          const bEffort = b.estimatedEffort ?? Infinity;
          return multiplier * (aEffort - bEffort);
        }
        default:
          return 0;
      }
    });
  }
}

// ============================================================================
// Serialization Types
// ============================================================================

interface SerializedClaim {
  id: string;
  type: string;
  status: string;
  priority: string;
  domain: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  claimedAt?: string;
  expiresAt?: string;
  deadline?: string;
  metadata: SerializedMetadata;
  [key: string]: unknown;
}

type SerializedMetadata = Record<string, unknown>;

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an in-memory claim repository (for testing/single-node)
 */
export function createInMemoryClaimRepository(): IClaimRepository {
  return new InMemoryClaimRepository();
}

/**
 * Create a persistent claim repository
 */
export function createPersistentClaimRepository(
  memory: MemoryBackend,
  namespace?: string
): IClaimRepository {
  return new PersistentClaimRepository(memory, namespace);
}
