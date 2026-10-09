/**
 * Tool calls that would destroy or overwrite AQE learning data. Every one must be refused.
 * Shared by `claude plugin test` (tests/corpus.test.ts) and the repo's vitest
 * (tests/unit/plugins/agentic-qe-fleet/aqe-mod-guard.test.ts).
 */
export type Case = { readonly name: string; readonly tool: string; readonly input: Readonly<Record<string, string>> }

const bash = (name: string, command: string): Case => ({ name, tool: 'Bash', input: { command } })

export const ATTACKS: readonly Case[] = [
  // delete
  bash('rm the store', 'rm .agentic-qe/memory.db'),
  bash('rm -f wal and shm', 'rm -f ./.agentic-qe/memory.db-wal .agentic-qe/memory.db-shm'),
  bash('rm -rf the directory', 'rm -rf .agentic-qe'),
  bash('rm -rf the directory, trailing slash', 'rm -rf .agentic-qe/'),
  bash('rm a db glob', 'rm .agentic-qe/*.db'),
  bash('rm everything in it', 'rm -f .agentic-qe/*'),
  bash('rm by absolute path', 'rm /home/dev/project/.agentic-qe/memory.db'),
  bash('rm through sudo with options', 'sudo -n rm -f /srv/app/.agentic-qe/memory.db'),
  bash('rm by full binary path', '/bin/rm .agentic-qe/memory.db'),
  bash('rm with dot segments', 'rm src/../.agentic-qe/./memory.db'),
  bash('rm quoted path', 'rm "./.agentic-qe/memory.db"'),
  bash('rm the brain store', 'rm .agentic-qe/brain.rvf'),
  bash('unlink', 'unlink .agentic-qe/memory.db'),
  bash('shred', 'shred -u .agentic-qe/memory.db'),
  bash('rm after a benign command', 'npm test && rm .agentic-qe/memory.db'),
  bash('rm after a semicolon', 'echo cleaning; rm -rf .agentic-qe'),
  bash('rm in a subshell', 'echo $(rm .agentic-qe/memory.db)'),
  bash('rm through bash -c', 'bash -c "rm -f .agentic-qe/memory.db"'),
  bash('rm through sh -c', "sh -c 'rm .agentic-qe/memory.db-wal'"),
  bash('rm through env and timeout', 'env FOO=1 timeout 30 rm .agentic-qe/memory.db'),
  bash('rm through xargs', 'echo .agentic-qe/memory.db | xargs rm -f'),
  bash('rm after cd', 'cd .agentic-qe && rm memory.db memory.db-wal'),
  bash('rm -rf . after cd', 'cd .agentic-qe && rm -rf .'),
  bash('find -delete', "find .agentic-qe -name '*.db' -delete"),
  bash('find -exec rm', 'find .agentic-qe -type f -exec rm {} \\;'),
  // move / overwrite
  bash('mv the store away', 'mv .agentic-qe/memory.db /tmp/old.db'),
  bash('mv over the store', 'mv backup.db .agentic-qe/memory.db'),
  bash('mv a backup over the store', 'mv .agentic-qe/memory.db.bak-1700000000 .agentic-qe/memory.db'),
  bash('cp over the store', 'cp backup.db .agentic-qe/memory.db'),
  bash('cp a db into the directory', 'cp /tmp/memory.db .agentic-qe/'),
  bash('ln -sf over the store', 'ln -sf /dev/null .agentic-qe/memory.db'),
  bash('rsync --delete into the directory', 'rsync -a --delete empty/ .agentic-qe/'),
  bash('install over the store', 'install -m 644 x.db .agentic-qe/memory.db'),
  // truncate / redirect
  bash('truncate', 'truncate -s 0 .agentic-qe/memory.db'),
  bash('colon redirect', ': > .agentic-qe/memory.db'),
  bash('echo redirect without space', 'echo "" >.agentic-qe/memory.db'),
  bash('append to the wal', 'cat junk >> .agentic-qe/memory.db-wal'),
  bash('clobber redirect', 'echo x >| .agentic-qe/memory.db'),
  bash('dd of=', 'dd if=/dev/zero of=.agentic-qe/memory.db bs=1k count=1'),
  bash('tee', 'echo x | tee .agentic-qe/memory.db'),
  // SQL
  bash('sqlite3 DROP TABLE', 'sqlite3 .agentic-qe/memory.db "DROP TABLE qe_patterns;"'),
  bash('sqlite3 delete from, lower case', "sqlite3 .agentic-qe/memory.db 'delete from qe_patterns'"),
  bash('sqlite3 DELETE FROM piped in', 'echo "DELETE FROM qe_patterns;" | sqlite3 .agentic-qe/memory.db'),
  bash('sqlite3 heredoc DROP', 'sqlite3 .agentic-qe/memory.db <<EOF\nDROP TABLE qe_patterns;\nEOF'),
  bash('sqlite3 TRUNCATE TABLE', 'sqlite3 .agentic-qe/memory.db "TRUNCATE TABLE qe_patterns"'),
  bash('sqlite3 .restore', 'sqlite3 .agentic-qe/memory.db ".restore old.db"'),
  bash('sqlite3 after cd', 'cd .agentic-qe && sqlite3 memory.db "DROP TABLE qe_patterns"'),
  bash('select then delete', 'sqlite3 .agentic-qe/memory.db "SELECT COUNT(*) FROM qe_patterns; DELETE FROM qe_patterns;"'),
  // scripts and git
  bash('node unlinkSync', "node -e \"require('fs').unlinkSync('.agentic-qe/memory.db')\""),
  bash('python os.remove', "python3 -c \"import os; os.remove('.agentic-qe/memory.db')\""),
  bash('git clean -fdx', 'git clean -fdx'),
  bash('git checkout over the store', 'git checkout -- .agentic-qe/memory.db'),
  bash('git rm the store', 'git rm .agentic-qe/memory.db'),
  // file tools
  { name: 'Write the store', tool: 'Write', input: { file_path: '.agentic-qe/memory.db', content: '' } },
  { name: 'Write the store, absolute', tool: 'Write', input: { file_path: '/home/dev/p/.agentic-qe/memory.db', content: '' } },
  { name: 'Edit the wal', tool: 'Edit', input: { file_path: '/home/dev/p/.agentic-qe/memory.db-wal', old_string: 'a', new_string: 'b' } },
  { name: 'MultiEdit the shm', tool: 'MultiEdit', input: { file_path: '.agentic-qe/memory.db-shm' } },
  { name: 'NotebookEdit a db', tool: 'NotebookEdit', input: { notebook_path: '.agentic-qe/memory.db', new_source: 'x' } },
]
