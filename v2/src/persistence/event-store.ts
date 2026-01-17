/**
 * @fileoverview Event store for telemetry and event history persistence
 * @module persistence/event-store
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
  EventRecord,
  EventType,
  CreateEventInput,
  PersistenceConfig,
  DEFAULT_PERSISTENCE_CONFIG,
  createDatabase,
  closeDatabase,
} from './schema';

/**
 * Query options for retrieving events
 */
export interface EventQueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'timestamp' | 'agent_id' | 'event_type';
  orderDirection?: 'ASC' | 'DESC';
}

/**
 * Time range filter for events
 */
export interface TimeRange {
  start: string;
  end: string;
}

/**
 * EventStore provides persistence for telemetry events
 *
 * @example
 * ```typescript
 * const store = new EventStore({ dbPath: './data/events.db' });
 *
 * // Record an event
 * const event = await store.recordEvent({
 *   agent_id: 'test-generator',
 *   event_type: 'test_generated',
 *   payload: { testCount: 10, coverage: 85 },
 *   session_id: 'session-123'
 * });
 *
 * // Query events
 * const agentEvents = store.getEventsByAgent('test-generator');
 * ```
 */
export class EventStore {
  private db: Database.Database;
  private config: PersistenceConfig;
  private statements: {
    insert: Database.Statement;
    getById: Database.Statement;
    getByAgent: Database.Statement;
    getByType: Database.Statement;
    getByTimeRange: Database.Statement;
    getBySession: Database.Statement;
    getByCorrelation: Database.Statement;
    countByAgent: Database.Statement;
    countByType: Database.Statement;
    deleteOlderThan: Database.Statement;
  };

  /**
   * Create a new EventStore instance
   * @param config - Persistence configuration
   */
  constructor(config: Partial<PersistenceConfig> = {}) {
    this.config = { ...DEFAULT_PERSISTENCE_CONFIG, ...config };
    this.db = createDatabase(this.config);
    this.statements = this.prepareStatements();
  }

  /**
   * Prepare SQL statements for performance
   */
  private prepareStatements() {
    return {
      insert: this.db.prepare(`
        INSERT INTO events (id, timestamp, agent_id, event_type, payload, correlation_id, session_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),

      getById: this.db.prepare(`
        SELECT * FROM events WHERE id = ?
      `),

      getByAgent: this.db.prepare(`
        SELECT * FROM events WHERE agent_id = ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `),

      getByType: this.db.prepare(`
        SELECT * FROM events WHERE event_type = ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `),

      getByTimeRange: this.db.prepare(`
        SELECT * FROM events
        WHERE timestamp >= ? AND timestamp <= ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `),

      getBySession: this.db.prepare(`
        SELECT * FROM events WHERE session_id = ?
        ORDER BY timestamp ASC
      `),

      getByCorrelation: this.db.prepare(`
        SELECT * FROM events WHERE correlation_id = ?
        ORDER BY timestamp ASC
      `),

      countByAgent: this.db.prepare(`
        SELECT COUNT(*) as count FROM events WHERE agent_id = ?
      `),

      countByType: this.db.prepare(`
        SELECT COUNT(*) as count FROM events WHERE event_type = ?
      `),

      deleteOlderThan: this.db.prepare(`
        DELETE FROM events WHERE timestamp < ?
      `),
    };
  }

  /**
   * Deserialize event record from database row
   */
  private deserializeEvent(row: Record<string, unknown>): EventRecord {
    return {
      id: row.id as string,
      timestamp: row.timestamp as string,
      agent_id: row.agent_id as string,
      event_type: row.event_type as EventType,
      payload: JSON.parse(row.payload as string),
      correlation_id: row.correlation_id as string | null,
      session_id: row.session_id as string,
    };
  }

  /**
   * Record a new event
   * @param input - Event creation input
   * @returns Created event record
   */
  recordEvent(input: CreateEventInput): EventRecord {
    const id = uuidv4();
    const timestamp = new Date().toISOString();
    const payload = JSON.stringify(input.payload);

    let retries = this.config.maxRetries || 3;
    while (retries > 0) {
      try {
        this.statements.insert.run(
          id,
          timestamp,
          input.agent_id,
          input.event_type,
          payload,
          input.correlation_id || null,
          input.session_id
        );
        break;
      } catch (error: unknown) {
        retries--;
        if (retries === 0) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`Failed to record event after retries: ${errorMessage}`);
        }
        // Small delay before retry
        const start = Date.now();
        while (Date.now() - start < 100) {
          // Busy wait for synchronous retry
        }
      }
    }

    return {
      id,
      timestamp,
      agent_id: input.agent_id,
      event_type: input.event_type,
      payload: input.payload,
      correlation_id: input.correlation_id || null,
      session_id: input.session_id,
    };
  }

  /**
   * Get event by ID
   * @param id - Event ID
   * @returns Event record or null
   */
  getEventById(id: string): EventRecord | null {
    const row = this.statements.getById.get(id) as Record<string, unknown> | undefined;
    return row ? this.deserializeEvent(row) : null;
  }

  /**
   * Get events by agent ID
   * @param agentId - Agent identifier
   * @param options - Query options
   * @returns Array of event records
   */
  getEventsByAgent(agentId: string, options: EventQueryOptions = {}): EventRecord[] {
    const { limit = 100, offset = 0 } = options;
    const rows = this.statements.getByAgent.all(agentId, limit, offset) as Record<string, unknown>[];
    return rows.map(row => this.deserializeEvent(row));
  }

  /**
   * Get events by event type
   * @param eventType - Event type to filter
   * @param options - Query options
   * @returns Array of event records
   */
  getEventsByType(eventType: EventType, options: EventQueryOptions = {}): EventRecord[] {
    const { limit = 100, offset = 0 } = options;
    const rows = this.statements.getByType.all(eventType, limit, offset) as Record<string, unknown>[];
    return rows.map(row => this.deserializeEvent(row));
  }

  /**
   * Get events within a time range
   * @param timeRange - Start and end timestamps
   * @param options - Query options
   * @returns Array of event records
   */
  getEventsByTimeRange(timeRange: TimeRange, options: EventQueryOptions = {}): EventRecord[] {
    const { limit = 1000, offset = 0 } = options;
    const rows = this.statements.getByTimeRange.all(
      timeRange.start,
      timeRange.end,
      limit,
      offset
    ) as Record<string, unknown>[];
    return rows.map(row => this.deserializeEvent(row));
  }

  /**
   * Get all events for a session
   * @param sessionId - Session identifier
   * @returns Array of event records in chronological order
   */
  getEventsBySession(sessionId: string): EventRecord[] {
    const rows = this.statements.getBySession.all(sessionId) as Record<string, unknown>[];
    return rows.map(row => this.deserializeEvent(row));
  }

  /**
   * Get correlated events
   * @param correlationId - Correlation identifier
   * @returns Array of correlated events
   */
  getEventsByCorrelation(correlationId: string): EventRecord[] {
    const rows = this.statements.getByCorrelation.all(correlationId) as Record<string, unknown>[];
    return rows.map(row => this.deserializeEvent(row));
  }

  /**
   * Count events by agent
   * @param agentId - Agent identifier
   * @returns Event count
   */
  countEventsByAgent(agentId: string): number {
    const result = this.statements.countByAgent.get(agentId) as { count: number };
    return result.count;
  }

  /**
   * Count events by type
   * @param eventType - Event type
   * @returns Event count
   */
  countEventsByType(eventType: EventType): number {
    const result = this.statements.countByType.get(eventType) as { count: number };
    return result.count;
  }

  /**
   * Get event counts grouped by agent
   * @returns Map of agent ID to event count
   */
  getEventCountsByAgent(): Map<string, number> {
    const rows = this.db.prepare(`
      SELECT agent_id, COUNT(*) as count
      FROM events
      GROUP BY agent_id
      ORDER BY count DESC
    `).all() as Array<{ agent_id: string; count: number }>;

    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.agent_id, row.count);
    }
    return counts;
  }

  /**
   * Get event counts grouped by type
   * @returns Map of event type to count
   */
  getEventCountsByType(): Map<EventType, number> {
    const rows = this.db.prepare(`
      SELECT event_type, COUNT(*) as count
      FROM events
      GROUP BY event_type
      ORDER BY count DESC
    `).all() as Array<{ event_type: EventType; count: number }>;

    const counts = new Map<EventType, number>();
    for (const row of rows) {
      counts.set(row.event_type, row.count);
    }
    return counts;
  }

  /**
   * Get recent events with pagination
   * @param limit - Maximum number of events
   * @param offset - Number of events to skip
   * @returns Array of recent events
   */
  getRecentEvents(limit: number = 50, offset: number = 0): EventRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM events
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as Record<string, unknown>[];

    return rows.map(row => this.deserializeEvent(row));
  }

  /**
   * Search events by payload content
   * @param searchKey - Key to search in payload
   * @param searchValue - Value to match
   * @param limit - Maximum results
   * @returns Matching events
   */
  searchByPayload(searchKey: string, searchValue: string, limit: number = 100): EventRecord[] {
    // SQLite JSON extraction
    const pattern = `%"${searchKey}":${JSON.stringify(searchValue)}%`;
    const rows = this.db.prepare(`
      SELECT * FROM events
      WHERE payload LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(pattern, limit) as Record<string, unknown>[];

    return rows.map(row => this.deserializeEvent(row));
  }

  /**
   * Delete events older than specified date
   * @param olderThan - ISO timestamp cutoff
   * @returns Number of deleted events
   */
  deleteEventsOlderThan(olderThan: string): number {
    const result = this.statements.deleteOlderThan.run(olderThan);
    return result.changes;
  }

  /**
   * Get database statistics
   * @returns Statistics about stored events
   */
  getStatistics(): {
    totalEvents: number;
    uniqueAgents: number;
    uniqueSessions: number;
    oldestEvent: string | null;
    newestEvent: string | null;
  } {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as totalEvents,
        COUNT(DISTINCT agent_id) as uniqueAgents,
        COUNT(DISTINCT session_id) as uniqueSessions,
        MIN(timestamp) as oldestEvent,
        MAX(timestamp) as newestEvent
      FROM events
    `).get() as {
      totalEvents: number;
      uniqueAgents: number;
      uniqueSessions: number;
      oldestEvent: string | null;
      newestEvent: string | null;
    };

    return stats;
  }

  /**
   * Close database connection
   */
  close(): void {
    closeDatabase(this.db);
  }
}
