-- Migration 004: a sync key for aqe.learning_experiences
-- Issue: #1436. The table's key is `id SERIAL` with no unique constraint, and the
--   upload left out the local experience id, so every `aqe sync --full` (and every
--   incremental sync that re-read a row) inserted each captured experience again.
-- local_id holds the local captured_experiences id; UNIQUE(local_id, source_env)
--   makes a re-sync match the row instead of adding it again.
-- Safe to run more than once. Afterwards:
--   1. aqe sync --full                      (uploads every experience with its local_id)
--   2. aqe sync dedupe-experiences          (dry run: shows the duplicates it would delete)
--   3. aqe sync dedupe-experiences --apply  (backs them up, then deletes them)

ALTER TABLE aqe.learning_experiences ADD COLUMN IF NOT EXISTS local_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_experiences_local_id
    ON aqe.learning_experiences(local_id, source_env);
