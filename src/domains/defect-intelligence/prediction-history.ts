import type { MemoryBackend } from '../../kernel/interfaces.js';

export const MAX_PREDICTION_HISTORY = 32;
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

/** A recorded prediction run, or `null` when the record is not a usable one. */
export function parsePredictionRecord(raw: unknown, now: number):
  {
    id: string; timestamp: string; predictions: DomainFilePrediction[];
    predictionMethod?: 'static-code-indicators'; estimated?: true; filesSkipped?: number;
  } | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.timestamp !== 'string') return null;
  const t = Date.parse(raw.timestamp);
  if (!Number.isFinite(t) || t > now + 60_000 || now - t > MAX_PREDICTION_AGE_MS) return null;
  if (!Array.isArray(raw.predictions) || raw.predictions.length === 0) return null;
  const predictions = raw.predictions.map(parseFilePrediction);
  if (predictions.some((p) => p === null)) return null;
  return {
    id: raw.id, timestamp: raw.timestamp, predictions: predictions as DomainFilePrediction[],
    ...(raw.predictionMethod === 'static-code-indicators' ? {
      predictionMethod: 'static-code-indicators', estimated: true,
      filesSkipped: typeof raw.filesSkipped === 'number' && Number.isSafeInteger(raw.filesSkipped) && raw.filesSkipped >= 0
        ? raw.filesSkipped : 0,
    } : {}),
  };
}

/** Keep 32 usable immutable UUID runs, preserving tied-latest ambiguity. */
export async function prunePredictionHistory(
  memory: Pick<MemoryBackend, 'search' | 'get' | 'delete'>,
  modelNamespace = 'defect-intelligence:predictor',
): Promise<void> {
  const prefix = `${modelNamespace}:prediction:`;
  const keys = await memory.search(`${prefix}*`, Number.MAX_SAFE_INTEGER, { namespace: NAMESPACE });
  const now = Date.now();
  const records: { key: string; timestamp: number; id: string }[] = [];
  const invalid: string[] = [];
  for (const found of keys) {
    const key = found.startsWith(`${NAMESPACE}:${prefix}`) ? found.slice(NAMESPACE.length + 1) : found;
    if (!key.startsWith(prefix)) continue;
    const parsed = parsePredictionRecord(await memory.get<unknown>(key, { namespace: NAMESPACE }), now);
    if (parsed) records.push({ key, timestamp: Date.parse(parsed.timestamp), id: parsed.id });
    else invalid.push(key);
  }
  records.sort((a, b) => b.timestamp - a.timestamp || (a.id === b.id ? (a.key === b.key ? 0 : a.key > b.key ? -1 : 1) : a.id > b.id ? -1 : 1));
  // Only observed immutable keys are candidates; concurrent new runs are untouched.
  for (const key of [...invalid, ...records.slice(MAX_PREDICTION_HISTORY).map(record => record.key)]) {
    await memory.delete(key, { namespace: NAMESPACE });
  }
}
