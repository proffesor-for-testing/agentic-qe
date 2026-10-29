import { createHash } from 'node:crypto';
import type { MemoryBackend } from '../../kernel/interfaces.js';

export const MAX_PREDICTION_HISTORY = 32;
/** Longest `target` a prediction run may name (Linux PATH_MAX) (#1137). */
export const MAX_PREDICTION_TARGET_LENGTH = 4096;
const MAX_PREDICTION_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const NAMESPACE = 'defect-intelligence';

type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';
const RISK_LEVELS: readonly RiskLevel[] = ['critical', 'high', 'medium', 'low', 'info'];

/** One file prediction as the defect-intelligence predictor recorded it. */
export interface DomainFilePrediction {
  file: string;
  probability: number;
  riskLevel: RiskLevel;
  factors: { name: string; contribution: number }[];
  recommendations: string[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function parseFilePrediction(raw: unknown): DomainFilePrediction | null {
  if (!isRecord(raw)) return null;
  const { file, probability, riskLevel } = raw;
  if (typeof file !== 'string' || file.length === 0) return null;
  if (typeof probability !== 'number' || !Number.isFinite(probability) || probability < 0 || probability > 1) return null;
  if (!RISK_LEVELS.includes(riskLevel as RiskLevel)) return null;
  const factors = Array.isArray(raw.factors)
    ? raw.factors.filter((f): f is { name: string; contribution: number } =>
      isRecord(f) && typeof f.name === 'string' && typeof f.contribution === 'number' && Number.isFinite(f.contribution))
    : [];
  const recommendations = Array.isArray(raw.recommendations)
    ? raw.recommendations.filter((r): r is string => typeof r === 'string')
    : [];
  return { file, probability, riskLevel: riskLevel as RiskLevel, factors, recommendations };
}

/**
 * #1137: the target a run for an explicit file list covers. A list too long
 * to store as a target is identified by its digest.
 */
export function predictionTargetForFiles(files: readonly string[]): string {
  const target = `files:${[...new Set(files)].sort().join(',')}`;
  return target.length <= MAX_PREDICTION_TARGET_LENGTH
    ? target
    : `files-sha256:${createHash('sha256').update(target).digest('hex')}`;
}

/** A recorded prediction run, or `null` when the record is not a usable one. */
export function parsePredictionRecord(raw: unknown, now: number):
  {
    id: string; timestamp: string; predictions: DomainFilePrediction[];
    /** What the run covered; '' for runs recorded before #1137. */
    target: string;
    predictionMethod?: 'static-code-indicators'; estimated?: true; filesSkipped?: number;
  } | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.timestamp !== 'string') return null;
  const t = Date.parse(raw.timestamp);
  if (!Number.isFinite(t) || t > now + 60_000 || now - t > MAX_PREDICTION_AGE_MS) return null;
  if (raw.target !== undefined && (typeof raw.target !== 'string' || raw.target.length > MAX_PREDICTION_TARGET_LENGTH)) return null;
  if (!Array.isArray(raw.predictions) || raw.predictions.length === 0) return null;
  const predictions = raw.predictions.map(parseFilePrediction);
  if (predictions.some((p) => p === null)) return null;
  return {
    id: raw.id, timestamp: raw.timestamp, predictions: predictions as DomainFilePrediction[],
    target: (raw.target as string | undefined) ?? '',
    ...(raw.predictionMethod === 'static-code-indicators' ? {
      predictionMethod: 'static-code-indicators', estimated: true,
      filesSkipped: typeof raw.filesSkipped === 'number' && Number.isSafeInteger(raw.filesSkipped) && raw.filesSkipped >= 0
        ? raw.filesSkipped : 0,
    } : {}),
  };
}

/** Milliseconds since the epoch the record claims, or `null` when it names no parseable time. */
function recordTime(raw: unknown): number | null {
  if (!isRecord(raw) || typeof raw.timestamp !== 'string') return null;
  const t = Date.parse(raw.timestamp);
  return Number.isFinite(t) ? t : null;
}

interface RetainedRun { key: string; timestamp: number; id: string; target: string }

/**
 * #1137: the latest run of every target stays (with any run tied with it, so
 * the worker still sees the ambiguity), most recently predicted targets first;
 * the newest other runs fill what is left. Never more than the cap in total.
 */
function selectRetained(newestFirst: readonly RetainedRun[]): Set<string> {
  const latestAt = new Map<string, number>();
  const latest: RetainedRun[] = [];
  for (const run of newestFirst) {
    const at = latestAt.get(run.target);
    if (at === undefined) latestAt.set(run.target, run.timestamp);
    if (at === undefined || at === run.timestamp) latest.push(run);
  }
  const keep = new Set(latest.slice(0, MAX_PREDICTION_HISTORY).map((run) => run.key));
  for (const run of newestFirst) {
    if (keep.size >= MAX_PREDICTION_HISTORY) break;
    keep.add(run.key);
  }
  return keep;
}

/**
 * Bound the stored prediction runs: delete runs older than 7 days and usable
 * runs beyond the cap. A row this version cannot parse (stamped ahead by
 * another host's clock, or a riskLevel from a newer release) is left to its
 * TTL rather than deleted on this version's schema (#1137).
 */
export async function prunePredictionHistory(
  memory: Pick<MemoryBackend, 'search' | 'get' | 'delete'>,
  modelNamespace = 'defect-intelligence:predictor',
): Promise<void> {
  const prefix = `${modelNamespace}:prediction:`;
  const keys = await memory.search(`${prefix}*`, Number.MAX_SAFE_INTEGER, { namespace: NAMESPACE });
  const now = Date.now();
  const records: RetainedRun[] = [];
  const expired: string[] = [];
  for (const found of keys) {
    const key = found.startsWith(`${NAMESPACE}:${prefix}`) ? found.slice(NAMESPACE.length + 1) : found;
    if (!key.startsWith(prefix)) continue;
    const raw = await memory.get<unknown>(key, { namespace: NAMESPACE });
    const t = recordTime(raw);
    if (t !== null && now - t > MAX_PREDICTION_AGE_MS) {
      expired.push(key);
      continue;
    }
    const parsed = parsePredictionRecord(raw, now);
    if (parsed) records.push({ key, timestamp: Date.parse(parsed.timestamp), id: parsed.id, target: parsed.target });
  }
  records.sort((a, b) => b.timestamp - a.timestamp || (a.id === b.id ? (a.key === b.key ? 0 : a.key > b.key ? -1 : 1) : a.id > b.id ? -1 : 1));
  const keep = selectRetained(records);
  // Only observed immutable keys are candidates; concurrent new runs are untouched.
  for (const key of [...expired, ...records.filter((record) => !keep.has(record.key)).map((record) => record.key)]) {
    await memory.delete(key, { namespace: NAMESPACE });
  }
}
