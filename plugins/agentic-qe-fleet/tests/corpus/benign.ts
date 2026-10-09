/**
 * Tool calls the guard must let through: reads, backups, integrity checks,
 * unrelated deletes, and look-alikes. A refusal here is a false positive.
 */
import type { Case } from './attacks'

const bash = (name: string, command: string): Case => ({ name, tool: 'Bash', input: { command } })

export const BENIGN: readonly Case[] = [
  // backups (CLAUDE.md: always back up first)
  bash('backup with a timestamp', 'cp .agentic-qe/memory.db .agentic-qe/memory.db.bak-$(date +%s)'),
  bash('backup elsewhere', 'cp .agentic-qe/memory.db /tmp/memory.db.bak'),
  bash('copy the whole directory out', 'cp -r .agentic-qe /tmp/aqe-backup'),
  bash('rsync out', 'rsync -a .agentic-qe/ backup/aqe/'),
  bash('sqlite .backup', 'sqlite3 .agentic-qe/memory.db ".backup /tmp/memory-backup.db"'),
  // reads and checks
  bash('integrity check', 'sqlite3 .agentic-qe/memory.db "PRAGMA integrity_check; SELECT COUNT(*) FROM qe_patterns;"'),
  bash('select', 'sqlite3 .agentic-qe/memory.db "SELECT name FROM sqlite_master WHERE type=\'table\'"'),
  bash('select that mentions delete', "sqlite3 .agentic-qe/memory.db \"SELECT * FROM qe_patterns WHERE name LIKE '%delete%'\""),
  bash('list', 'ls -la .agentic-qe/'),
  bash('size', 'du -sh .agentic-qe/memory.db'),
  bash('wal size', 'wc -c .agentic-qe/memory.db-wal'),
  bash('hexdump', 'xxd .agentic-qe/memory.db | head'),
  bash('read config', 'cat .agentic-qe/config.yaml'),
  bash('find without delete', "find .agentic-qe -name '*.db'"),
  bash('git status', 'git status --short'),
  bash('git clean dry run', 'git clean -n -x'),
  bash('git clean without -x', 'git clean -fd'),
  bash('git clean excluding aqe', 'git clean -fdx -e .agentic-qe'),
  // deletes that do not touch learning data
  bash('remove an old backup', 'rm -f .agentic-qe/memory.db.bak-1700000000'),
  bash('remove a log', 'rm .agentic-qe/hooks-health.log'),
  bash('remove a subdirectory', 'rm -rf .agentic-qe/agents'),
  bash('find -delete of logs', "find .agentic-qe -name '*.log' -delete"),
  bash('remove node_modules', 'rm -rf node_modules dist'),
  bash('remove another db', 'rm -f /tmp/test.db test/fixtures/x.db'),
  bash('drop a table elsewhere', 'sqlite3 /tmp/scratch.db "DROP TABLE t"'),
  bash('restore a backup out of the directory', 'mv .agentic-qe/memory.db.bak-1 /tmp/'),
  bash('a commit message that names the store', 'git commit -m "docs: never rm memory.db"'),
  bash('write a file elsewhere', 'echo hi > notes.txt 2>&1'),
  bash('aqe health', 'aqe health'),
  bash('npm test', 'npm test -- --run tests/unit'),
  bash('empty command', ''),
  // file tools
  { name: 'Write source', tool: 'Write', input: { file_path: 'src/index.ts', content: 'x' } },
  { name: 'Edit aqe config', tool: 'Edit', input: { file_path: '.agentic-qe/config.yaml', old_string: 'a', new_string: 'b' } },
  { name: 'Write a backup copy', tool: 'Write', input: { file_path: '.agentic-qe/memory.db.bak-1', content: '' } },
  { name: 'Write a test fixture db', tool: 'Write', input: { file_path: 'tests/fixtures/sample.db', content: '' } },
  { name: 'Read the store', tool: 'Read', input: { file_path: '.agentic-qe/memory.db' } },
  { name: 'Grep the directory', tool: 'Grep', input: { pattern: 'x', path: '.agentic-qe' } },
]
