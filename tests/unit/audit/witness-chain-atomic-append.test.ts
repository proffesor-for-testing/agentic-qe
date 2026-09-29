import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createWitnessChain } from '../../../src/audit/witness-chain.js';

describe('WitnessChain atomic append', () => {
  const databases: Database.Database[] = [];

  afterEach(() => {
    for (const db of databases.splice(0)) db.close();
    vi.restoreAllMocks();
  });

  it('takes the SQLite write lock before reading the tail and holds it through insert', async () => {
    const db = new Database(':memory:');
    databases.push(db);
    const chain = createWitnessChain(db);
    await chain.initialize();

    const prepare = db.prepare.bind(db);
    const transactionalStatements: boolean[] = [];
    vi.spyOn(db, 'prepare').mockImplementation(((sql: string) => {
      if (sql.includes('SELECT * FROM witness_chain ORDER BY id DESC LIMIT 1') ||
          sql.includes('INSERT INTO witness_chain')) {
        transactionalStatements.push(db.inTransaction);
      }
      return prepare(sql);
    }) as typeof db.prepare);

    chain.append('PATTERN_CREATE', { patternId: 'first' }, 'test');
    chain.append('PATTERN_CREATE', { patternId: 'second' }, 'test');

    expect(transactionalStatements).toEqual([true, true, true, true]);
    expect(chain.verify()).toMatchObject({ valid: true, entriesChecked: 2 });
  });
});
