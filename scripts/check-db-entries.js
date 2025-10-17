#!/usr/bin/env node
// Quick check of what's actually in the database
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), '.swarm/memory.db');
console.log('📊 Checking database:', dbPath);
console.log('');

try {
  const db = new Database(dbPath, { readonly: true });

  // Check what tables exist
  console.log('=== TABLES IN DATABASE ===');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  tables.forEach(t => console.log('  -', t.name));
  console.log('');

  // Check memory_entries
  console.log('=== MEMORY ENTRIES ===');
  try {
    const count = db.prepare('SELECT COUNT(*) as count FROM memory_entries').get();
    console.log(`Total entries: ${count.count}`);

    const entries = db.prepare('SELECT * FROM memory_entries ORDER BY rowid DESC LIMIT 10').all();
    entries.forEach((e, i) => {
      console.log(`${i+1}. Key: ${e.key || 'N/A'}`);
      console.log(`   Columns: ${Object.keys(e).join(', ')}`);
      console.log(`   Data: ${JSON.stringify(e).substring(0, 150)}...`);
      console.log('');
    });
  } catch (err) {
    console.log('Error reading memory_entries:', err.message);
  }
  console.log('');

  // Check events
  console.log('=== EVENTS ===');
  try {
    const count = db.prepare('SELECT COUNT(*) as count FROM events').get();
    console.log(`Total events: ${count.count}`);

    const events = db.prepare('SELECT * FROM events ORDER BY rowid DESC LIMIT 5').all();
    events.forEach((e, i) => {
      console.log(`${i+1}. ${JSON.stringify(e).substring(0, 200)}`);
    });
  } catch (err) {
    console.log('Error reading events:', err.message);
  }
  console.log('');

  // Check patterns
  console.log('=== PATTERNS ===');
  try {
    const count = db.prepare('SELECT COUNT(*) as count FROM patterns').get();
    console.log(`Total patterns: ${count.count}`);

    const patterns = db.prepare('SELECT * FROM patterns LIMIT 5').all();
    patterns.forEach((p, i) => {
      console.log(`${i+1}. ${JSON.stringify(p).substring(0, 200)}`);
    });
  } catch (err) {
    console.log('Error reading patterns:', err.message);
  }

  db.close();

  console.log('');
  console.log('✅ Database check complete');

} catch (error) {
  console.error('❌ Error:', error.message);
}
