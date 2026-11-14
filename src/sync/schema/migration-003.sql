-- Migration 003: routing_outcomes columns added locally after migration 002
-- Issue: #1432. The local routing_outcomes table gained model_tier and
--   advisor_consultation_json (#334) and the ADR-095 exploration columns,
--   and `SELECT * FROM routing_outcomes` rejected every row in the cloud.
-- Safe to run more than once.

ALTER TABLE aqe.routing_outcomes ADD COLUMN IF NOT EXISTS model_tier TEXT;
ALTER TABLE aqe.routing_outcomes ADD COLUMN IF NOT EXISTS advisor_consultation_json JSONB;
ALTER TABLE aqe.routing_outcomes ADD COLUMN IF NOT EXISTS exploration INTEGER DEFAULT 0;
ALTER TABLE aqe.routing_outcomes ADD COLUMN IF NOT EXISTS criticality REAL;
ALTER TABLE aqe.routing_outcomes ADD COLUMN IF NOT EXISTS q_weight REAL;
