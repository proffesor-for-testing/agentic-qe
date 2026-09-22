# Learning database backup and restore

`aqe learning backup` creates a standalone SQLite snapshot of the project's
`.agentic-qe/memory.db`. It includes committed transactions still in the SQLite
write-ahead log (WAL), even when another process keeps the database open. Copy
the resulting `.db` or `.db.gz` artifact to transport the backup; no companion
WAL is required.

```bash
aqe learning backup --output /backups/project-memory.db --verify --json
aqe learning backup --output /backups/project-memory.db --compress --verify --json
```

The compressed command appends `.gz` to the output path. Choose a dedicated
backup path, never another project's live database. The command verifies the
SQLite snapshot before publishing it and leaves an existing output artifact
intact if staging fails. With `--compress --verify`, it also decompresses and
verifies the staged archive before publishing it. Backup opens the source
read-only and does not initialize or migrate it. A missing source is an error.

## Restore a backup

Stop AQE processes using the destination project before restoring. SQLite
protects the replacement transaction, but this command does not coordinate
future writes from other processes or refresh their in-memory learning caches.

```bash
aqe learning restore --input /backups/project-memory.db.gz --force --json
```

Restore validates the input before writing the destination. `--force` is
required only when the destination database already exists. Before overwriting
an existing database, the command creates and verifies a timestamped
`.pre-restore-<timestamp>-<id>.db` safety snapshot alongside it; the JSON result
includes `safetyBackupPath`. Keep that snapshot until the restored project has
been checked. Restore always verifies integrity; the existing `--verify` flag
is accepted for compatibility.

A locked destination or an incompatible SQLite page size can cause restore to
fail. The command reports the failure and retains any completed safety
snapshot. It does not delete destination WAL or SHM files to force a restore.
An empty, uninitialized SQLite file is not accepted as a learning backup.

## Corrupt destinations and older backups

If the existing destination is corrupt and cannot be snapshotted, restore
refuses to overwrite it, even with `--force`. After stopping project processes,
preserve the original database and all its companion files in a separate
quarantine location, then restore a verified backup into the now-absent
destination. This command does not automatically discard or repair the corrupt
original.

An older uncompressed backup that still has its valid companion WAL can be
restored as a pair. Keep those files together until restoration completes.
An older gzip archive that already omitted WAL transactions cannot recover
those missing transactions; creating a new snapshot does not repair old
archives. Invalid backups are rejected rather than guessed at.
