import BetterSqlite3 from 'better-sqlite3';

/**
 * BaseDAO - Base class for all Data Access Objects
 *
 * Provides common database operations and query methods
 * All DAOs should extend this class to ensure consistent patterns
 */
export abstract class BaseDAO {
  protected db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
  }

  /**
   * Execute a SQL statement (INSERT, UPDATE, DELETE)
   */
  protected run(sql: string, params: any[] = []): void {
    this.db.prepare(sql).run(...params);
  }

  /**
   * Execute a SQL query and return a single row
   */
  protected queryOne<T>(sql: string, params: any[] = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  /**
   * Execute a SQL query and return all rows
   */
  protected queryAll<T>(sql: string, params: any[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  /**
   * Create the table schema for this DAO
   * Must be implemented by subclasses
   */
  abstract createTable(): Promise<void>;

  /**
   * Create indexes for this DAO's table
   * Must be implemented by subclasses
   */
  abstract createIndexes(): Promise<void>;
}
