/**
 * AQE-owned structural types for a SQLite connection (#1443).
 *
 * AQE opens SQLite through `better-sqlite3` at runtime, but its type package
 * (`@types/better-sqlite3`) is a devDependency, so it is NOT installed for
 * library consumers. When our published declarations imported `Database` /
 * `Statement` from 'better-sqlite3', consumers saw TS7016 with
 * `skipLibCheck: false` and an untyped `any` with `skipLibCheck: true`.
 *
 * These interfaces mirror the better-sqlite3 `Database` / `Statement` API
 * (@types/better-sqlite3 7.6.13) member for member, so:
 *  - a real better-sqlite3 `Database` is assignable to `SqliteDatabase`, and
 *    the reverse holds for consumers who install @types/better-sqlite3
 *    (both checked in tests/unit/packaging/public-declarations-1443.test.ts);
 *  - public declarations reference only AQE types, never 'better-sqlite3'.
 *
 * Rule: type positions use these interfaces; only code that constructs a
 * connection (`new Database(...)`) imports the 'better-sqlite3' value.
 */

/** Variadic function accepted by `transaction()` and `function()`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SqliteVariadicFunction = (...params: any[]) => unknown;

/** Argument tuple of a transaction body (same shape better-sqlite3 uses). */
export type SqliteArgumentTypes<F extends SqliteVariadicFunction> = F extends (...args: infer A) => unknown
  ? A
  : never;

/** Result of `Statement.run()`. */
export interface SqliteRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

/** Column metadata returned by `Statement.columns()`. */
export interface SqliteColumnDefinition {
  name: string;
  column: string | null;
  table: string | null;
  database: string | null;
  type: string | null;
}

/** A prepared statement. */
export interface SqliteStatement<BindParameters extends unknown[] = unknown[], Result = unknown> {
  database: SqliteDatabase;
  source: string;
  reader: boolean;
  readonly: boolean;
  busy: boolean;

  run(...params: BindParameters): SqliteRunResult;
  get(...params: BindParameters): Result | undefined;
  all(...params: BindParameters): Result[];
  iterate(...params: BindParameters): IterableIterator<Result>;
  pluck(toggleState?: boolean): this;
  expand(toggleState?: boolean): this;
  raw(toggleState?: boolean): this;
  bind(...params: BindParameters): this;
  columns(): SqliteColumnDefinition[];
  safeIntegers(toggleState?: boolean): this;
}

/** A function wrapped by `Database.transaction()`. */
export interface SqliteTransaction<F extends SqliteVariadicFunction> {
  (...params: SqliteArgumentTypes<F>): ReturnType<F>;
  default(...params: SqliteArgumentTypes<F>): ReturnType<F>;
  deferred(...params: SqliteArgumentTypes<F>): ReturnType<F>;
  immediate(...params: SqliteArgumentTypes<F>): ReturnType<F>;
  exclusive(...params: SqliteArgumentTypes<F>): ReturnType<F>;
}

export interface SqlitePragmaOptions {
  simple?: boolean | undefined;
}

export interface SqliteFunctionOptions {
  varargs?: boolean | undefined;
  deterministic?: boolean | undefined;
  safeIntegers?: boolean | undefined;
  directOnly?: boolean | undefined;
}

export interface SqliteBackupMetadata {
  totalPages: number;
  remainingPages: number;
}

export interface SqliteBackupOptions {
  progress: (info: SqliteBackupMetadata) => number;
}

/** Options for `Database.aggregate()` (same shape as better-sqlite3). */
export type SqliteAggregateOptions<T> = SqliteFunctionOptions & {
  start?: T | (() => T);
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  step: (total: T, next: T extends Array<infer E> ? E : T) => T | void;
  inverse?: ((total: T, dropped: T) => T) | undefined;
  result?: ((total: T) => unknown) | undefined;
};

/** Options for `Database.table()` (a virtual table). */
export interface SqliteVirtualTableOptions {
  rows: (...params: unknown[]) => Generator;
  columns: string[];
  parameters?: string[] | undefined;
  safeIntegers?: boolean | undefined;
  directOnly?: boolean | undefined;
}

export interface SqliteSerializeOptions {
  attached?: string;
}

/** An open SQLite connection (structurally a better-sqlite3 `Database`). */
export interface SqliteDatabase {
  memory: boolean;
  readonly: boolean;
  name: string;
  open: boolean;
  inTransaction: boolean;

  // `{}` mirrors better-sqlite3's own signature; it keeps a real Database assignable.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  prepare<BindParameters extends unknown[] | {} = unknown[], Result = unknown>(
    source: string,
  ): BindParameters extends unknown[]
    ? SqliteStatement<BindParameters, Result>
    : SqliteStatement<[BindParameters], Result>;
  transaction<F extends SqliteVariadicFunction>(fn: F): SqliteTransaction<F>;
  exec(source: string): this;
  pragma(source: string, options?: SqlitePragmaOptions): unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function(name: string, cb: (...params: any[]) => any): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function(name: string, options: SqliteFunctionOptions, cb: (...params: any[]) => any): this;
  aggregate<T>(name: string, options: SqliteAggregateOptions<T>): this;
  loadExtension(path: string): this;
  close(): this;
  defaultSafeIntegers(toggleState?: boolean): this;
  backup(destinationFile: string, options?: SqliteBackupOptions): Promise<SqliteBackupMetadata>;
  table(name: string, options: SqliteVirtualTableOptions): this;
  unsafeMode(unsafe?: boolean): this;
  serialize(options?: SqliteSerializeOptions): Buffer;
}
