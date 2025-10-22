const Database = require('better-sqlite3');
const path = require('path');

// Inspect memory.db
console.log('=== MEMORY.DB SCHEMA ===\n');
const memoryDb = new Database('.agentic-qe/memory.db', { readonly: true });

const memoryTables = memoryDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', memoryTables.map(t => t.name).join(', '));

memoryTables.forEach(table => {
  console.log(`\n--- Table: ${table.name} ---`);
  const schema = memoryDb.prepare(`PRAGMA table_info(${table.name})`).all();
  schema.forEach(col => {
    console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
  });

  const count = memoryDb.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
  console.log(`  Row count: ${count.count}`);
});

memoryDb.close();

// Inspect patterns.db
console.log('\n\n=== PATTERNS.DB SCHEMA ===\n');
const patternsDb = new Database('.agentic-qe/patterns.db', { readonly: true });

const patternTables = patternsDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', patternTables.map(t => t.name).join(', '));

patternTables.forEach(table => {
  console.log(`\n--- Table: ${table.name} ---`);
  const schema = patternsDb.prepare(`PRAGMA table_info(${table.name})`).all();
  schema.forEach(col => {
    console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
  });

  const count = patternsDb.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
  console.log(`  Row count: ${count.count}`);
});

patternsDb.close();

console.log('\n\n=== CHECKING FOR AGENTDB INTEGRATION ===\n');
// Check for AgentDB-related files
const fs = require('fs');
const configPath = '.agentic-qe/config.json';
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('Config version:', config.version);
  console.log('Phase 2 Learning enabled:', config.phase2?.learning?.enabled);
  console.log('Phase 2 Patterns enabled:', config.phase2?.patterns?.enabled);
  console.log('Phase 2 Improvement enabled:', config.phase2?.improvement?.enabled);
}

// Check for AgentDB data directory
if (fs.existsSync('.agentic-qe/data')) {
  console.log('\n.agentic-qe/data contents:');
  const walk = (dir, prefix = '') => {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        console.log(`  ${prefix}📁 ${file}/`);
        walk(filePath, prefix + '  ');
      } else {
        console.log(`  ${prefix}📄 ${file} (${stat.size} bytes)`);
      }
    });
  };
  walk('.agentic-qe/data');
}
