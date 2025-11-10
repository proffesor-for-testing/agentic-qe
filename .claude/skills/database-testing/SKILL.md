---
name: database-testing
description: Database schema validation, data integrity testing, migration testing, transaction isolation, and query performance. Use when testing data persistence, ensuring referential integrity, or validating database migrations.
---

# Database Testing

## Core Principle

**Data is your most valuable asset. Database bugs cause data loss/corruption.**

Database testing ensures schema correctness, data integrity, transaction safety, and query performance. Critical for preventing catastrophic data issues.

## Schema Testing

**Validate database structure:**
```sql
-- Test schema exists
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'users';

-- Test column types
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users';

-- Test constraints
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'users';
```

**Test with code:**
```javascript
test('users table has correct schema', async () => {
  const schema = await db.raw(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'users'
  `);

  expect(schema).toContainEqual({
    column_name: 'id',
    data_type: 'integer',
    is_nullable: 'NO'
  });

  expect(schema).toContainEqual({
    column_name: 'email',
    data_type: 'character varying',
    is_nullable: 'NO'
  });
});
```

## Data Integrity Testing

**Test constraints:**
```javascript
test('email must be unique', async () => {
  await db.users.create({ email: 'test@example.com' });

  // Duplicate should fail
  await expect(
    db.users.create({ email: 'test@example.com' })
  ).rejects.toThrow('unique constraint violation');
});

test('foreign key prevents orphaned records', async () => {
  const user = await db.users.create({ email: 'test@example.com' });
  await db.orders.create({ userId: user.id, total: 100 });

  // Cannot delete user with orders
  await expect(
    db.users.delete({ id: user.id })
  ).rejects.toThrow('foreign key constraint');
});

test('check constraint validates data', async () => {
  // Age must be ≥ 18
  await expect(
    db.users.create({ email: 'minor@example.com', age: 17 })
  ).rejects.toThrow('check constraint violation');
});
```

## Migration Testing

**Test database migrations:**
```javascript
import { migrate, rollback } from './migrations';

test('migration adds users table', async () => {
  // Start fresh
  await rollback();

  // Run migration
  await migrate();

  // Verify table exists
  const tables = await db.raw(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
  `);

  expect(tables.map(t => t.table_name)).toContain('users');
});

test('migration is reversible', async () => {
  await migrate();
  await rollback();

  // Table should be gone
  const tables = await db.raw(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
  `);

  expect(tables.map(t => t.table_name)).not.toContain('users');
});

test('migration preserves existing data', async () => {
  // Create data before migration
  await db.users.create({ email: 'test@example.com' });

  // Run migration that adds 'age' column
  await migrate('add-age-column');

  // Data should still exist
  const user = await db.users.findOne({ email: 'test@example.com' });
  expect(user).toBeDefined();
  expect(user.age).toBeNull(); // New column, null default
});
```

## Transaction Isolation Testing

**Test ACID properties:**
```javascript
test('transaction rolls back on error', async () => {
  const initialCount = await db.users.count();

  try {
    await db.transaction(async (trx) => {
      await trx('users').insert({ email: 'user1@example.com' });
      await trx('users').insert({ email: 'user2@example.com' });

      // Force error
      throw new Error('Rollback test');
    });
  } catch (error) {
    // Expected
  }

  // No users should be inserted
  const finalCount = await db.users.count();
  expect(finalCount).toBe(initialCount);
});

test('concurrent transactions are isolated', async () => {
  const user = await db.users.create({ email: 'test@example.com', balance: 100 });

  // Two concurrent withdrawals
  const withdraw1 = db.transaction(async (trx) => {
    const current = await trx('users').where({ id: user.id }).first();
    await sleep(100); // Simulate delay
    await trx('users').where({ id: user.id }).update({ 
      balance: current.balance - 50 
    });
  });

  const withdraw2 = db.transaction(async (trx) => {
    const current = await trx('users').where({ id: user.id }).first();
    await sleep(100);
    await trx('users').where({ id: user.id }).update({ 
      balance: current.balance - 50 
    });
  });

  await Promise.all([withdraw1, withdraw2]);

  // With proper isolation, balance should be 0, not 50
  const final = await db.users.findOne({ id: user.id });
  expect(final.balance).toBe(0); // Not 50!
});
```

## Query Performance Testing

**Test slow queries:**
```javascript
test('user lookup by email is fast', async () => {
  // Seed 10,000 users
  await seedUsers(10000);

  const start = Date.now();
  await db.users.findOne({ email: 'user5000@example.com' });
  const duration = Date.now() - start;

  // Should use index on email
  expect(duration).toBeLessThan(10); // < 10ms
});

test('EXPLAIN shows index usage', async () => {
  const explain = await db.raw(`
    EXPLAIN SELECT * FROM users WHERE email = 'test@example.com'
  `);

  // Should show index scan, not sequential scan
  const plan = explain.rows[0]['QUERY PLAN'];
  expect(plan).toContain('Index Scan');
  expect(plan).not.toContain('Seq Scan');
});
```

## Related Skills

- [test-data-management](../test-data-management/) - Generate test data for DB
- [performance-testing](../performance-testing/) - DB performance testing
- [test-automation-strategy](../test-automation-strategy/) - Automate DB tests

## Remember

**Database bugs are catastrophic.**

- Data loss is unrecoverable
- Corruption spreads silently
- Performance issues compound
- Migrations must be reversible

**Test migrations before production:**
- Forward migration works
- Backward rollback works
- Data preserved/migrated correctly
- Performance acceptable

**With Agents:** `qe-test-data-architect` generates realistic test data with referential integrity. `qe-test-executor` runs DB migration tests automatically in CI/CD.
