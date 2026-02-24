/**
 * PostgreSQL Integration Tests
 *
 * Requires a real Postgres instance. Skipped when POSTGRES_URL is not set.
 *
 * Local:
 *   docker compose -f v3/tests/docker-compose.test.yml up -d
 *   POSTGRES_URL=postgresql://aqe_test:aqe_test@localhost:15432/aqe_test npx vitest run tests/integration/sync/
 *
 * CI: GitHub Actions `services:` provides the Postgres instance automatically.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const POSTGRES_URL = process.env.POSTGRES_URL;

// Graceful skip when no Postgres is available
const describeWithPg = POSTGRES_URL ? describe : describe.skip;

/** Dynamically load pg so the test file itself can be imported without pg present */
async function loadPg() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pg = await import('pg');
  const Client = pg.default?.Client ?? pg.Client;
  return Client as typeof import('pg').Client;
}

describeWithPg('PostgreSQL Integration (real DB)', () => {
  let Client: typeof import('pg').Client;
  let client: InstanceType<typeof import('pg').Client>;

  beforeAll(async () => {
    Client = await loadPg();
    client = new Client({ connectionString: POSTGRES_URL });
    await client.connect();

    // Create a test table
    await client.query(`
      CREATE TABLE IF NOT EXISTS integration_test (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        score DOUBLE PRECISION,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Clean slate
    await client.query('TRUNCATE integration_test');
  });

  afterAll(async () => {
    if (client) {
      await client.query('DROP TABLE IF EXISTS integration_test');
      await client.end();
    }
  });

  it('should connect and run a basic query', async () => {
    const result = await client.query('SELECT 1 AS val');
    expect(result.rows[0].val).toBe(1);
  });

  it('should insert and retrieve records', async () => {
    await client.query(
      `INSERT INTO integration_test (id, name, score) VALUES ($1, $2, $3)`,
      ['rec-1', 'Test Record', 0.95]
    );

    const result = await client.query(
      'SELECT * FROM integration_test WHERE id = $1',
      ['rec-1']
    );

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].name).toBe('Test Record');
    expect(result.rows[0].score).toBeCloseTo(0.95);
  });

  it('should handle upsert via ON CONFLICT', async () => {
    // Insert initial
    await client.query(
      `INSERT INTO integration_test (id, name, score)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, score = EXCLUDED.score`,
      ['rec-upsert', 'Original', 0.5]
    );

    // Upsert with updated values
    await client.query(
      `INSERT INTO integration_test (id, name, score)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, score = EXCLUDED.score`,
      ['rec-upsert', 'Updated', 0.99]
    );

    const result = await client.query(
      'SELECT * FROM integration_test WHERE id = $1',
      ['rec-upsert']
    );

    expect(result.rows[0].name).toBe('Updated');
    expect(result.rows[0].score).toBeCloseTo(0.99);
  });

  it('should handle transactions (commit)', async () => {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO integration_test (id, name, score) VALUES ($1, $2, $3)`,
      ['rec-tx-commit', 'Committed', 1.0]
    );
    await client.query('COMMIT');

    const result = await client.query(
      'SELECT * FROM integration_test WHERE id = $1',
      ['rec-tx-commit']
    );
    expect(result.rows.length).toBe(1);
  });

  it('should handle transactions (rollback)', async () => {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO integration_test (id, name, score) VALUES ($1, $2, $3)`,
      ['rec-tx-rollback', 'Should Not Exist', 0.0]
    );
    await client.query('ROLLBACK');

    const result = await client.query(
      'SELECT * FROM integration_test WHERE id = $1',
      ['rec-tx-rollback']
    );
    expect(result.rows.length).toBe(0);
  });

  it('should store and retrieve JSONB metadata', async () => {
    const metadata = { tags: ['test', 'integration'], nested: { key: 'value' } };

    await client.query(
      `INSERT INTO integration_test (id, name, metadata)
       VALUES ($1, $2, $3::jsonb)`,
      ['rec-jsonb', 'JSONB Test', JSON.stringify(metadata)]
    );

    const result = await client.query(
      'SELECT metadata FROM integration_test WHERE id = $1',
      ['rec-jsonb']
    );

    expect(result.rows[0].metadata).toEqual(metadata);
  });

  it('should handle batch inserts', async () => {
    const values: string[] = [];
    const params: unknown[] = [];
    const batchSize = 50;

    for (let i = 0; i < batchSize; i++) {
      const offset = i * 3;
      values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
      params.push(`batch-${i}`, `Batch Record ${i}`, i / batchSize);
    }

    await client.query(
      `INSERT INTO integration_test (id, name, score) VALUES ${values.join(', ')}
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, score = EXCLUDED.score`,
      params
    );

    const result = await client.query(
      `SELECT COUNT(*) AS cnt FROM integration_test WHERE id LIKE 'batch-%'`
    );
    expect(Number(result.rows[0].cnt)).toBe(batchSize);
  });

  it('should handle TIMESTAMPTZ serialization', async () => {
    const now = new Date();

    await client.query(
      `INSERT INTO integration_test (id, name, created_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET created_at = EXCLUDED.created_at`,
      ['rec-ts', 'Timestamp Test', now.toISOString()]
    );

    const result = await client.query(
      'SELECT created_at FROM integration_test WHERE id = $1',
      ['rec-ts']
    );

    const stored = new Date(result.rows[0].created_at);
    // Allow 1 second tolerance for rounding
    expect(Math.abs(stored.getTime() - now.getTime())).toBeLessThan(1000);
  });
});
