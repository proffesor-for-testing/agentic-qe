/**
 * Supabase Persistence Provider
 *
 * Cloud persistence provider using Supabase PostgreSQL with RuVector extension.
 * Supports multi-tenant data isolation via Row-Level Security and
 * vector similarity search for intelligent experience/pattern matching.
 *
 * @module persistence/SupabasePersistenceProvider
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  IPersistenceProvider,
  ProviderInfo,
  LearningExperience,
  ExperienceQuery,
  SharedExperienceQuery,
  StoredPattern,
  PatternQuery,
  NervousSystemComponent,
  PrivacyLevel,
  MemoryEntry,
  MemoryQuery,
  MemoryAccessLevel,
  EventRecord,
  EventQuery,
  CodeChunk,
  CodeChunkQuery,
  CodeSearchResult,
  CodeLanguage,
} from './IPersistenceProvider.js';
import {
  type SupabaseConfig,
  buildSupabaseConfig,
  SUPABASE_TABLES,
} from './SupabaseConfig.js';

// ============================================
// Types
// ============================================

/**
 * Database row types matching Supabase schema
 */
interface ExperienceRow {
  id: string;
  project_id: string;
  agent_id: string;
  agent_type: string;
  task_type: string;
  context: Record<string, unknown>;
  outcome: Record<string, unknown>;
  embedding: number[] | null;
  privacy_level: PrivacyLevel;
  is_anonymized: boolean;
  share_count: number;
  confidence: number;
  created_at: string;
  created_by: string | null;
}

interface PatternRow {
  id: string;
  project_id: string;
  type: string;
  domain: string;
  framework: string | null;
  content: string;
  embedding: number[] | null;
  confidence: number;
  usage_count: number;
  last_used: string | null;
  verdict: string | null;
  privacy_level: PrivacyLevel;
  is_anonymized: boolean;
  source_hash: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface NervousSystemRow {
  id: string;
  project_id: string;
  agent_id: string;
  component: NervousSystemComponent;
  state_data: string | null; // Base64 encoded
  state_json: Record<string, unknown> | null;
  version: number;
  updated_at: string;
}

interface MemoryEntryRow {
  id: string;
  project_id: string;
  key: string;
  partition: string;
  value: string;
  owner: string;
  access_level: MemoryAccessLevel;
  team_id: string | null;
  swarm_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  expires_at: string | null;
}

interface EventRow {
  id: string;
  project_id: string;
  type: string;
  payload: Record<string, unknown>;
  source: string;
  timestamp: string;
  ttl: number;
  created_at: string;
}

interface CodeChunkRow {
  id: string;
  project_id: string;
  file_path: string;
  start_line: number;
  end_line: number;
  chunk_type: string;
  name: string | null;
  language: string;
  content: string;
  embedding: number[] | null;
  metadata: Record<string, unknown> | null;
  commit_sha: string | null;
  indexed_at: string;
}

// ============================================
// Provider Implementation
// ============================================

/**
 * Supabase cloud persistence provider
 *
 * Implements IPersistenceProvider using Supabase PostgreSQL backend.
 * Features:
 * - Multi-tenant data isolation via RLS
 * - Vector similarity search via RuVector
 * - Automatic embedding generation (optional)
 * - Sharing between users/teams
 *
 * @example
 * ```typescript
 * const provider = new SupabasePersistenceProvider({
 *   connection: {
 *     url: 'https://xxx.supabase.co',
 *     anonKey: 'xxx',
 *   },
 *   project: { projectId: 'my-project' },
 * });
 *
 * await provider.initialize();
 *
 * // Store an experience
 * await provider.storeExperience({
 *   id: 'exp-1',
 *   agentId: 'test-gen',
 *   agentType: 'test-generator',
 *   taskType: 'unit-test-generation',
 *   context: { sourceFile: 'UserService.ts' },
 *   outcome: { result: 'success', confidence: 0.95 },
 *   privacyLevel: 'team',
 *   isAnonymized: false,
 *   shareCount: 0,
 *   createdAt: new Date(),
 * });
 *
 * // Search for similar experiences
 * const similar = await provider.searchSimilarExperiences(embedding, 10);
 * ```
 */
export class SupabasePersistenceProvider implements IPersistenceProvider {
  private client: SupabaseClient | null = null;
  private config: SupabaseConfig;
  private projectId: string | null = null;
  private initialized = false;

  /**
   * Create a new Supabase persistence provider
   *
   * @param configOverrides Configuration overrides
   */
  constructor(configOverrides: Partial<SupabaseConfig> = {}) {
    this.config = buildSupabaseConfig(configOverrides);
  }

  // ============================================
  // Lifecycle
  // ============================================

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Create Supabase client
    this.client = createClient(
      this.config.connection.url,
      this.config.connection.anonKey
    );

    // Get or create project
    this.projectId = await this.ensureProject();

    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    // Supabase client doesn't need explicit cleanup
    this.client = null;
    this.initialized = false;
  }

  // ============================================
  // Learning Experiences
  // ============================================

  async storeExperience(experience: LearningExperience): Promise<void> {
    this.ensureInitialized();

    const row: Partial<ExperienceRow> = {
      id: experience.id,
      project_id: this.projectId!,
      agent_id: experience.agentId,
      agent_type: experience.agentType,
      task_type: experience.taskType,
      context: experience.context,
      outcome: experience.outcome,
      embedding: experience.embedding ?? null,
      privacy_level: experience.privacyLevel,
      is_anonymized: experience.isAnonymized,
      share_count: experience.shareCount,
      confidence: experience.outcome.confidence,
      created_at: experience.createdAt.toISOString(),
      created_by: experience.createdBy ?? null,
    };

    const { error } = await this.client!
      .from(SUPABASE_TABLES.EXPERIENCES)
      .upsert(row, { onConflict: 'id' });

    if (error) {
      throw new Error(`Failed to store experience: ${error.message}`);
    }
  }

  async queryExperiences(query: ExperienceQuery): Promise<LearningExperience[]> {
    this.ensureInitialized();

    let queryBuilder = this.client!
      .from(SUPABASE_TABLES.EXPERIENCES)
      .select('*')
      .eq('project_id', this.projectId!);

    // Apply filters
    if (query.agentId) {
      queryBuilder = queryBuilder.eq('agent_id', query.agentId);
    }
    if (query.agentType) {
      queryBuilder = queryBuilder.eq('agent_type', query.agentType);
    }
    if (query.taskType) {
      queryBuilder = queryBuilder.eq('task_type', query.taskType);
    }
    if (query.outcome) {
      queryBuilder = queryBuilder.eq('outcome->result', query.outcome);
    }
    if (query.privacyLevel) {
      queryBuilder = queryBuilder.eq('privacy_level', query.privacyLevel);
    }
    if (query.minConfidence !== undefined) {
      queryBuilder = queryBuilder.gte('confidence', query.minConfidence);
    }
    if (query.startDate) {
      queryBuilder = queryBuilder.gte('created_at', query.startDate.toISOString());
    }
    if (query.endDate) {
      queryBuilder = queryBuilder.lte('created_at', query.endDate.toISOString());
    }

    // Apply pagination
    if (query.offset) {
      queryBuilder = queryBuilder.range(query.offset, query.offset + (query.limit ?? 50) - 1);
    } else if (query.limit) {
      queryBuilder = queryBuilder.limit(query.limit);
    }

    // Order by created_at descending
    queryBuilder = queryBuilder.order('created_at', { ascending: false });

    const { data, error } = await queryBuilder;

    if (error) {
      throw new Error(`Failed to query experiences: ${error.message}`);
    }

    return (data as ExperienceRow[]).map(this.rowToExperience);
  }

  async searchSimilarExperiences(
    embedding: number[],
    limit: number
  ): Promise<LearningExperience[]> {
    this.ensureInitialized();

    // Use RPC function for vector similarity search
    const { data, error } = await this.client!.rpc('search_similar_experiences', {
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: limit,
    });

    if (error) {
      throw new Error(`Failed to search experiences: ${error.message}`);
    }

    // The RPC returns a different shape, map it
    return (data as Array<ExperienceRow & { similarity: number }>).map((row) => ({
      ...this.rowToExperience(row),
      // Could add similarity score to metadata if needed
    }));
  }

  // ============================================
  // Patterns
  // ============================================

  async storePattern(pattern: StoredPattern): Promise<void> {
    this.ensureInitialized();

    const row: Partial<PatternRow> = {
      id: pattern.id,
      project_id: this.projectId!,
      type: pattern.type,
      domain: pattern.domain ?? 'general',
      framework: pattern.framework ?? null,
      content: pattern.content ?? '',
      embedding: pattern.embedding ?? null,
      confidence: pattern.confidence,
      usage_count: pattern.usageCount,
      last_used: pattern.lastUsed?.toISOString() ?? null,
      verdict: pattern.verdict ?? null,
      privacy_level: pattern.privacyLevel,
      is_anonymized: pattern.isAnonymized,
      source_hash: pattern.sourceHash ?? null,
      metadata: pattern.metadata,
      created_at: pattern.createdAt.toISOString(),
    };

    const { error } = await this.client!
      .from(SUPABASE_TABLES.PATTERNS)
      .upsert(row, { onConflict: 'id' });

    if (error) {
      throw new Error(`Failed to store pattern: ${error.message}`);
    }
  }

  async queryPatterns(query: PatternQuery): Promise<StoredPattern[]> {
    this.ensureInitialized();

    let queryBuilder = this.client!
      .from(SUPABASE_TABLES.PATTERNS)
      .select('*')
      .eq('project_id', this.projectId!);

    // Apply filters
    if (query.type) {
      queryBuilder = queryBuilder.eq('type', query.type);
    }
    if (query.domain) {
      queryBuilder = queryBuilder.eq('domain', query.domain);
    }
    if (query.framework) {
      queryBuilder = queryBuilder.eq('framework', query.framework);
    }
    if (query.privacyLevel) {
      queryBuilder = queryBuilder.eq('privacy_level', query.privacyLevel);
    }
    if (query.minConfidence !== undefined) {
      queryBuilder = queryBuilder.gte('confidence', query.minConfidence);
    }

    // Apply pagination
    if (query.offset) {
      queryBuilder = queryBuilder.range(query.offset, query.offset + (query.limit ?? 50) - 1);
    } else if (query.limit) {
      queryBuilder = queryBuilder.limit(query.limit);
    }

    // Order by usage_count descending (most used first)
    queryBuilder = queryBuilder.order('usage_count', { ascending: false });

    const { data, error } = await queryBuilder;

    if (error) {
      throw new Error(`Failed to query patterns: ${error.message}`);
    }

    return (data as PatternRow[]).map(this.rowToPattern);
  }

  async searchSimilarPatterns(
    embedding: number[],
    limit: number
  ): Promise<StoredPattern[]> {
    this.ensureInitialized();

    // Use RPC function for vector similarity search
    const { data, error } = await this.client!.rpc('search_similar_patterns', {
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: limit,
    });

    if (error) {
      throw new Error(`Failed to search patterns: ${error.message}`);
    }

    // Map RPC result to StoredPattern
    return (data as Array<PatternRow & { similarity: number }>).map(this.rowToPattern);
  }

  // ============================================
  // Nervous System State
  // ============================================

  async saveNervousSystemState(
    agentId: string,
    component: NervousSystemComponent,
    state: Uint8Array | Record<string, unknown>
  ): Promise<void> {
    this.ensureInitialized();

    const isBinary = state instanceof Uint8Array;

    const row: Partial<NervousSystemRow> = {
      project_id: this.projectId!,
      agent_id: agentId,
      component,
      state_data: isBinary ? this.uint8ArrayToBase64(state) : null,
      state_json: isBinary ? null : state,
      version: 1,
      updated_at: new Date().toISOString(),
    };

    const { error } = await this.client!
      .from(SUPABASE_TABLES.NERVOUS_SYSTEM)
      .upsert(row, {
        onConflict: 'project_id,agent_id,component',
      });

    if (error) {
      throw new Error(`Failed to save nervous system state: ${error.message}`);
    }
  }

  async loadNervousSystemState(
    agentId: string,
    component: NervousSystemComponent
  ): Promise<Uint8Array | Record<string, unknown> | null> {
    this.ensureInitialized();

    const { data, error } = await this.client!
      .from(SUPABASE_TABLES.NERVOUS_SYSTEM)
      .select('*')
      .eq('project_id', this.projectId!)
      .eq('agent_id', agentId)
      .eq('component', component)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null;
      }
      throw new Error(`Failed to load nervous system state: ${error.message}`);
    }

    const row = data as NervousSystemRow;

    if (row.state_data) {
      return this.base64ToUint8Array(row.state_data);
    }

    return row.state_json;
  }

  async deleteNervousSystemState(agentId: string): Promise<void> {
    this.ensureInitialized();

    const { error } = await this.client!
      .from(SUPABASE_TABLES.NERVOUS_SYSTEM)
      .delete()
      .eq('project_id', this.projectId!)
      .eq('agent_id', agentId);

    if (error) {
      throw new Error(`Failed to delete nervous system state: ${error.message}`);
    }
  }

  async listAgentsWithState(): Promise<string[]> {
    this.ensureInitialized();

    const { data, error } = await this.client!
      .from(SUPABASE_TABLES.NERVOUS_SYSTEM)
      .select('agent_id')
      .eq('project_id', this.projectId!);

    if (error) {
      throw new Error(`Failed to list agents: ${error.message}`);
    }

    // Get unique agent IDs
    const agentIds = new Set((data as { agent_id: string }[]).map((r) => r.agent_id));
    return Array.from(agentIds);
  }

  // ============================================
  // Sharing (Cloud-specific)
  // ============================================

  async shareExperience(experienceId: string, privacyLevel: PrivacyLevel): Promise<void> {
    this.ensureInitialized();

    const { error } = await this.client!
      .from(SUPABASE_TABLES.EXPERIENCES)
      .update({
        privacy_level: privacyLevel,
        share_count: this.client!.rpc('increment_share_count'),
      })
      .eq('id', experienceId)
      .eq('project_id', this.projectId!);

    if (error) {
      throw new Error(`Failed to share experience: ${error.message}`);
    }
  }

  async importSharedExperiences(query: SharedExperienceQuery): Promise<LearningExperience[]> {
    this.ensureInitialized();

    let queryBuilder = this.client!
      .from(SUPABASE_TABLES.EXPERIENCES)
      .select('*');

    // Build privacy filter
    const privacyFilters: string[] = [];
    if (query.includePublic) {
      privacyFilters.push('public');
    }
    if (query.includeTeam) {
      privacyFilters.push('team');
    }

    if (privacyFilters.length > 0) {
      queryBuilder = queryBuilder.in('privacy_level', privacyFilters);
    }

    // Exclude own project's experiences
    queryBuilder = queryBuilder.neq('project_id', this.projectId!);

    // Apply other filters
    if (query.agentType) {
      queryBuilder = queryBuilder.eq('agent_type', query.agentType);
    }
    if (query.taskType) {
      queryBuilder = queryBuilder.eq('task_type', query.taskType);
    }
    if (query.minQuality !== undefined) {
      queryBuilder = queryBuilder.gte('confidence', query.minQuality);
    }

    // Apply pagination
    if (query.limit) {
      queryBuilder = queryBuilder.limit(query.limit);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      throw new Error(`Failed to import shared experiences: ${error.message}`);
    }

    return (data as ExperienceRow[]).map(this.rowToExperience);
  }

  async sharePattern(patternId: string, privacyLevel: PrivacyLevel): Promise<void> {
    this.ensureInitialized();

    const { error } = await this.client!
      .from(SUPABASE_TABLES.PATTERNS)
      .update({ privacy_level: privacyLevel })
      .eq('id', patternId)
      .eq('project_id', this.projectId!);

    if (error) {
      throw new Error(`Failed to share pattern: ${error.message}`);
    }
  }

  async importSharedPatterns(
    query: PatternQuery & { includePublic?: boolean }
  ): Promise<StoredPattern[]> {
    this.ensureInitialized();

    let queryBuilder = this.client!
      .from(SUPABASE_TABLES.PATTERNS)
      .select('*');

    // Only public patterns for import
    if (query.includePublic) {
      queryBuilder = queryBuilder.eq('privacy_level', 'public');
    }

    // Exclude own project
    queryBuilder = queryBuilder.neq('project_id', this.projectId!);

    // Apply filters
    if (query.type) {
      queryBuilder = queryBuilder.eq('type', query.type);
    }
    if (query.domain) {
      queryBuilder = queryBuilder.eq('domain', query.domain);
    }
    if (query.framework) {
      queryBuilder = queryBuilder.eq('framework', query.framework);
    }
    if (query.minConfidence !== undefined) {
      queryBuilder = queryBuilder.gte('confidence', query.minConfidence);
    }

    // Apply pagination
    if (query.limit) {
      queryBuilder = queryBuilder.limit(query.limit);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      throw new Error(`Failed to import shared patterns: ${error.message}`);
    }

    return (data as PatternRow[]).map(this.rowToPattern);
  }

  // ============================================
  // Memory Entries
  // ============================================

  async storeMemoryEntry(entry: MemoryEntry): Promise<void> {
    this.ensureInitialized();

    const row: Partial<MemoryEntryRow> = {
      project_id: this.projectId!,
      key: entry.key,
      partition: entry.partition,
      value: entry.value,
      owner: entry.owner,
      access_level: entry.accessLevel,
      team_id: entry.teamId ?? null,
      swarm_id: entry.swarmId ?? null,
      metadata: entry.metadata ?? null,
      created_at: entry.createdAt.toISOString(),
      expires_at: entry.expiresAt?.toISOString() ?? null,
    };

    const { error } = await this.client!
      .from(SUPABASE_TABLES.MEMORY_ENTRIES)
      .upsert(row, { onConflict: 'project_id,partition,key' });

    if (error) {
      throw new Error(`Failed to store memory entry: ${error.message}`);
    }
  }

  async storeMemoryEntries(entries: MemoryEntry[]): Promise<void> {
    if (entries.length === 0) return;

    this.ensureInitialized();

    const rows = entries.map((entry) => ({
      project_id: this.projectId!,
      key: entry.key,
      partition: entry.partition,
      value: entry.value,
      owner: entry.owner,
      access_level: entry.accessLevel,
      team_id: entry.teamId ?? null,
      swarm_id: entry.swarmId ?? null,
      metadata: entry.metadata ?? null,
      created_at: entry.createdAt.toISOString(),
      expires_at: entry.expiresAt?.toISOString() ?? null,
    }));

    const { error } = await this.client!
      .from(SUPABASE_TABLES.MEMORY_ENTRIES)
      .upsert(rows, { onConflict: 'project_id,partition,key' });

    if (error) {
      throw new Error(`Failed to store memory entries: ${error.message}`);
    }
  }

  async getMemoryEntry(key: string, partition = 'default'): Promise<MemoryEntry | null> {
    this.ensureInitialized();

    const { data, error } = await this.client!
      .from(SUPABASE_TABLES.MEMORY_ENTRIES)
      .select('*')
      .eq('project_id', this.projectId!)
      .eq('partition', partition)
      .eq('key', key)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get memory entry: ${error.message}`);
    }

    return this.rowToMemoryEntry(data as MemoryEntryRow);
  }

  async queryMemoryEntries(query: MemoryQuery): Promise<MemoryEntry[]> {
    this.ensureInitialized();

    let queryBuilder = this.client!
      .from(SUPABASE_TABLES.MEMORY_ENTRIES)
      .select('*')
      .eq('project_id', this.projectId!);

    if (query.partition) {
      queryBuilder = queryBuilder.eq('partition', query.partition);
    }
    if (query.owner) {
      queryBuilder = queryBuilder.eq('owner', query.owner);
    }
    if (query.keyPattern) {
      queryBuilder = queryBuilder.ilike('key', query.keyPattern.replace('*', '%'));
    }
    if (query.accessLevel) {
      queryBuilder = queryBuilder.eq('access_level', query.accessLevel);
    }
    if (!query.includeExpired) {
      queryBuilder = queryBuilder.or('expires_at.is.null,expires_at.gt.now()');
    }

    if (query.offset) {
      queryBuilder = queryBuilder.range(query.offset, query.offset + (query.limit ?? 100) - 1);
    } else if (query.limit) {
      queryBuilder = queryBuilder.limit(query.limit);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      throw new Error(`Failed to query memory entries: ${error.message}`);
    }

    return (data as MemoryEntryRow[]).map(this.rowToMemoryEntry);
  }

  async deleteMemoryEntries(keyPattern: string, partition?: string): Promise<number> {
    this.ensureInitialized();

    let queryBuilder = this.client!
      .from(SUPABASE_TABLES.MEMORY_ENTRIES)
      .delete()
      .eq('project_id', this.projectId!)
      .ilike('key', keyPattern.replace('*', '%'));

    if (partition) {
      queryBuilder = queryBuilder.eq('partition', partition);
    }

    const { data, error } = await queryBuilder.select('id');

    if (error) {
      throw new Error(`Failed to delete memory entries: ${error.message}`);
    }

    return (data as { id: string }[]).length;
  }

  // ============================================
  // Events
  // ============================================

  async storeEvent(event: EventRecord): Promise<void> {
    this.ensureInitialized();

    const row = {
      id: event.id,
      project_id: this.projectId!,
      type: event.type,
      payload: event.payload,
      source: event.source,
      timestamp: event.timestamp.toISOString(),
      ttl: event.ttl,
    };

    const { error } = await this.client!
      .from(SUPABASE_TABLES.EVENTS)
      .insert(row);

    if (error) {
      throw new Error(`Failed to store event: ${error.message}`);
    }
  }

  async storeEvents(events: EventRecord[]): Promise<void> {
    if (events.length === 0) return;

    this.ensureInitialized();

    const rows = events.map((event) => ({
      id: event.id,
      project_id: this.projectId!,
      type: event.type,
      payload: event.payload,
      source: event.source,
      timestamp: event.timestamp.toISOString(),
      ttl: event.ttl,
    }));

    const { error } = await this.client!
      .from(SUPABASE_TABLES.EVENTS)
      .insert(rows);

    if (error) {
      throw new Error(`Failed to store events: ${error.message}`);
    }
  }

  async queryEvents(query: EventQuery): Promise<EventRecord[]> {
    this.ensureInitialized();

    let queryBuilder = this.client!
      .from(SUPABASE_TABLES.EVENTS)
      .select('*')
      .eq('project_id', this.projectId!);

    if (query.type) {
      queryBuilder = queryBuilder.eq('type', query.type);
    }
    if (query.source) {
      queryBuilder = queryBuilder.eq('source', query.source);
    }
    if (query.startTime) {
      queryBuilder = queryBuilder.gte('timestamp', query.startTime.toISOString());
    }
    if (query.endTime) {
      queryBuilder = queryBuilder.lte('timestamp', query.endTime.toISOString());
    }

    queryBuilder = queryBuilder.order('timestamp', { ascending: false });

    if (query.offset) {
      queryBuilder = queryBuilder.range(query.offset, query.offset + (query.limit ?? 100) - 1);
    } else if (query.limit) {
      queryBuilder = queryBuilder.limit(query.limit);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      throw new Error(`Failed to query events: ${error.message}`);
    }

    return (data as EventRow[]).map(this.rowToEvent);
  }

  async deleteOldEvents(olderThan: Date): Promise<number> {
    this.ensureInitialized();

    const { data, error } = await this.client!
      .from(SUPABASE_TABLES.EVENTS)
      .delete()
      .eq('project_id', this.projectId!)
      .lt('timestamp', olderThan.toISOString())
      .select('id');

    if (error) {
      throw new Error(`Failed to delete old events: ${error.message}`);
    }

    return (data as { id: string }[]).length;
  }

  // ============================================
  // Code Chunks
  // ============================================

  async storeCodeChunk(chunk: CodeChunk): Promise<void> {
    this.ensureInitialized();

    const row: Partial<CodeChunkRow> = {
      id: chunk.id,
      project_id: this.projectId!,
      file_path: chunk.filePath,
      start_line: chunk.startLine,
      end_line: chunk.endLine,
      chunk_type: chunk.chunkType,
      name: chunk.name ?? null,
      language: chunk.language,
      content: chunk.content,
      embedding: chunk.embedding ?? null,
      metadata: chunk.metadata ?? null,
      commit_sha: chunk.commitSha ?? null,
      indexed_at: chunk.indexedAt.toISOString(),
    };

    const { error } = await this.client!
      .from(SUPABASE_TABLES.CODE_CHUNKS)
      .upsert(row, { onConflict: 'project_id,file_path,start_line,end_line' });

    if (error) {
      throw new Error(`Failed to store code chunk: ${error.message}`);
    }
  }

  async storeCodeChunks(chunks: CodeChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    this.ensureInitialized();

    const rows = chunks.map((chunk) => ({
      id: chunk.id,
      project_id: this.projectId!,
      file_path: chunk.filePath,
      start_line: chunk.startLine,
      end_line: chunk.endLine,
      chunk_type: chunk.chunkType,
      name: chunk.name ?? null,
      language: chunk.language,
      content: chunk.content,
      embedding: chunk.embedding ?? null,
      metadata: chunk.metadata ?? null,
      commit_sha: chunk.commitSha ?? null,
      indexed_at: chunk.indexedAt.toISOString(),
    }));

    const { error } = await this.client!
      .from(SUPABASE_TABLES.CODE_CHUNKS)
      .upsert(rows, { onConflict: 'project_id,file_path,start_line,end_line' });

    if (error) {
      throw new Error(`Failed to store code chunks: ${error.message}`);
    }
  }

  async queryCodeChunks(query: CodeChunkQuery): Promise<CodeChunk[]> {
    this.ensureInitialized();

    let queryBuilder = this.client!
      .from(SUPABASE_TABLES.CODE_CHUNKS)
      .select('*')
      .eq('project_id', query.projectId ?? this.projectId!);

    if (query.filePattern) {
      queryBuilder = queryBuilder.ilike('file_path', query.filePattern.replace('*', '%'));
    }
    if (query.chunkType) {
      queryBuilder = queryBuilder.eq('chunk_type', query.chunkType);
    }
    if (query.language) {
      queryBuilder = queryBuilder.eq('language', query.language);
    }
    if (query.namePattern) {
      queryBuilder = queryBuilder.ilike('name', query.namePattern.replace('*', '%'));
    }

    if (query.offset) {
      queryBuilder = queryBuilder.range(query.offset, query.offset + (query.limit ?? 100) - 1);
    } else if (query.limit) {
      queryBuilder = queryBuilder.limit(query.limit);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      throw new Error(`Failed to query code chunks: ${error.message}`);
    }

    return (data as CodeChunkRow[]).map(this.rowToCodeChunk);
  }

  async searchSimilarCode(
    embedding: number[],
    options?: {
      limit?: number;
      minScore?: number;
      projectId?: string;
      language?: CodeLanguage;
    }
  ): Promise<CodeSearchResult[]> {
    this.ensureInitialized();

    const { data, error } = await this.client!.rpc('search_similar_code', {
      query_embedding: embedding,
      match_threshold: options?.minScore ?? 0.7,
      match_count: options?.limit ?? 10,
      filter_project_id: options?.projectId ?? this.projectId!,
      filter_language: options?.language ?? null,
    });

    if (error) {
      throw new Error(`Failed to search similar code: ${error.message}`);
    }

    return (data as Array<CodeChunkRow & { similarity: number }>).map((row) => ({
      chunk: this.rowToCodeChunk(row),
      score: row.similarity,
    }));
  }

  async deleteCodeChunksForFile(projectId: string, filePath: string): Promise<number> {
    this.ensureInitialized();

    const { data, error } = await this.client!
      .from(SUPABASE_TABLES.CODE_CHUNKS)
      .delete()
      .eq('project_id', projectId)
      .eq('file_path', filePath)
      .select('id');

    if (error) {
      throw new Error(`Failed to delete code chunks for file: ${error.message}`);
    }

    return (data as { id: string }[]).length;
  }

  async deleteCodeChunksForProject(projectId: string): Promise<number> {
    this.ensureInitialized();

    const { data, error } = await this.client!
      .from(SUPABASE_TABLES.CODE_CHUNKS)
      .delete()
      .eq('project_id', projectId)
      .select('id');

    if (error) {
      throw new Error(`Failed to delete code chunks for project: ${error.message}`);
    }

    return (data as { id: string }[]).length;
  }

  // ============================================
  // Info
  // ============================================

  getProviderInfo(): ProviderInfo {
    return {
      type: 'supabase',
      features: [
        'cloud-persistence',
        'vector-search',
        'multi-tenant',
        'rls-security',
        'experience-sharing',
        'pattern-sharing',
        'real-time-sync',
        'memory-sync',
        'event-sync',
        'code-intelligence-sync',
      ],
      initialized: this.initialized,
      location: this.config.connection.url,
    };
  }

  // ============================================
  // Private Methods
  // ============================================

  private ensureInitialized(): void {
    if (!this.initialized || !this.client) {
      throw new Error('SupabasePersistenceProvider not initialized. Call initialize() first.');
    }
  }

  /**
   * Get or create the project for this provider
   */
  private async ensureProject(): Promise<string> {
    // If project ID is configured, use it
    if (this.config.project.projectId) {
      return this.config.project.projectId;
    }

    // Try to get current user's default project
    const { data: user } = await this.client!.auth.getUser();

    if (user?.user) {
      const { data: projects } = await this.client!
        .from(SUPABASE_TABLES.PROJECTS)
        .select('id')
        .eq('owner_id', user.user.id)
        .limit(1);

      if (projects && projects.length > 0) {
        return projects[0].id;
      }

      // Create a default project
      const { data: newProject, error } = await this.client!
        .from(SUPABASE_TABLES.PROJECTS)
        .insert({
          name: 'Default Project',
          owner_id: user.user.id,
          settings: this.config.sharing,
        })
        .select('id')
        .single();

      if (error) {
        throw new Error(`Failed to create project: ${error.message}`);
      }

      return newProject.id;
    }

    // For anonymous usage, generate a local project ID
    return `local-${Date.now()}`;
  }

  /**
   * Convert database row to LearningExperience
   */
  private rowToExperience(row: ExperienceRow): LearningExperience {
    return {
      id: row.id,
      agentId: row.agent_id,
      agentType: row.agent_type,
      taskType: row.task_type,
      context: row.context,
      outcome: row.outcome as LearningExperience['outcome'],
      embedding: row.embedding ?? undefined,
      privacyLevel: row.privacy_level,
      isAnonymized: row.is_anonymized,
      shareCount: row.share_count,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by ?? undefined,
    };
  }

  /**
   * Convert database row to StoredPattern
   */
  private rowToPattern(row: PatternRow): StoredPattern {
    return {
      id: row.id,
      projectId: row.project_id,
      type: row.type,
      domain: row.domain,
      framework: row.framework ?? undefined,
      content: row.content,
      embedding: row.embedding ?? undefined,
      confidence: row.confidence,
      usageCount: row.usage_count,
      lastUsed: row.last_used ? new Date(row.last_used) : undefined,
      verdict: row.verdict ?? undefined,
      privacyLevel: row.privacy_level,
      isAnonymized: row.is_anonymized,
      sourceHash: row.source_hash ?? undefined,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Convert database row to MemoryEntry
   */
  private rowToMemoryEntry(row: MemoryEntryRow): MemoryEntry {
    return {
      key: row.key,
      value: row.value,
      partition: row.partition,
      owner: row.owner,
      accessLevel: row.access_level,
      teamId: row.team_id ?? undefined,
      swarmId: row.swarm_id ?? undefined,
      metadata: row.metadata ?? undefined,
      createdAt: new Date(row.created_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    };
  }

  /**
   * Convert database row to EventRecord
   */
  private rowToEvent(row: EventRow): EventRecord {
    return {
      id: row.id,
      type: row.type,
      payload: row.payload,
      source: row.source,
      timestamp: new Date(row.timestamp),
      ttl: row.ttl,
    };
  }

  /**
   * Convert database row to CodeChunk
   */
  private rowToCodeChunk(row: CodeChunkRow): CodeChunk {
    return {
      id: row.id,
      projectId: row.project_id,
      filePath: row.file_path,
      startLine: row.start_line,
      endLine: row.end_line,
      chunkType: row.chunk_type as CodeChunk['chunkType'],
      name: row.name ?? undefined,
      language: row.language as CodeLanguage,
      content: row.content,
      embedding: row.embedding ?? undefined,
      metadata: row.metadata ?? undefined,
      commitSha: row.commit_sha ?? undefined,
      indexedAt: new Date(row.indexed_at),
    };
  }

  /**
   * Convert Uint8Array to base64 string for storage
   */
  private uint8ArrayToBase64(data: Uint8Array): string {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(data).toString('base64');
    }
    // Browser fallback
    let binary = '';
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string back to Uint8Array
   */
  private base64ToUint8Array(base64: string): Uint8Array {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(base64, 'base64'));
    }
    // Browser fallback
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

/**
 * Factory function to create a Supabase persistence provider
 *
 * @param config Configuration overrides
 * @returns Configured provider instance
 */
export function createSupabasePersistenceProvider(
  config: Partial<SupabaseConfig> = {}
): SupabasePersistenceProvider {
  return new SupabasePersistenceProvider(config);
}
