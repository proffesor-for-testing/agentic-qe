// legacy-append-writer.mjs <db> <n> <tag>
//
// Reproduces the pre-v3.14.5 WitnessChain.append() (v3.14.4, issue #753)
// byte-for-byte: read the tail, then INSERT, with NO transaction around the
// two. Two of these running at once against one store fork the chain exactly
// like an MCP server + `aqe hooks` did in the field. Test fixture only.
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';

const GENESIS_PREV_HASH = '0'.repeat(64);
const shake256 = (data) => createHash('shake256', { outputLength: 32 }).update(data, 'utf-8').digest('hex');
const sha256 = (data) => createHash('sha256').update(data, 'utf-8').digest('hex');
const hashWith = (algo, data) => (algo === 'shake256' ? shake256(data) : sha256(data));
const serializeEntry = (e) => JSON.stringify({
  id: e.id, prev_hash: e.prev_hash, action_hash: e.action_hash,
  action_type: e.action_type, action_data: e.action_data,
  timestamp: e.timestamp, actor: e.actor,
});

const [dbPath, n, tag] = process.argv.slice(2);
const db = new Database(dbPath);
db.pragma('busy_timeout = 5000');
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS witness_chain (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prev_hash TEXT NOT NULL, action_hash TEXT NOT NULL, action_type TEXT NOT NULL,
  action_data TEXT, timestamp TEXT NOT NULL, actor TEXT NOT NULL,
  hash_algo TEXT DEFAULT 'sha256', signature TEXT, signer_key_id TEXT)`);

const tail = db.prepare('SELECT * FROM witness_chain ORDER BY id DESC LIMIT 1');
const insert = db.prepare(`INSERT INTO witness_chain
  (prev_hash, action_hash, action_type, action_data, timestamp, actor, hash_algo, signature, signer_key_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

for (let i = 0; i < Number(n); i++) {
  const timestamp = new Date().toISOString();
  const actionData = JSON.stringify({ patternId: `${tag}-${i}`, domain: 'test', confidence: 0.5, name: `p${i}` });
  const last = tail.get();
  const prevHash = last ? hashWith('shake256', serializeEntry(last)) : GENESIS_PREV_HASH;
  insert.run(prevHash, shake256(actionData), 'PATTERN_CREATE', actionData, timestamp, 'reasoning-bank', 'shake256', null, null);
}
db.close();
