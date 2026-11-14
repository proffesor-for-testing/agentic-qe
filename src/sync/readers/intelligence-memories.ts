/**
 * #1408: `.ruvector/intelligence.json` memories as `aqe.intelligence_memories` rows.
 *
 * ruvector names a memory `mem_<epoch seconds>`, so memories made in the same
 * second share an id, and the cloud table's key is `id` alone. Uploaded under
 * that id, a later memory replaced an earlier one, and the same id from another
 * environment would too. The cloud id adds a hash of the environment and
 * every field, so distinct memories stay distinct and an exact repeat is
 * uploaded once.
 */
import { createHash } from 'crypto';

type JSONRecord = Record<string, unknown>;

export const INTELLIGENCE_MEMORIES_TABLE = 'aqe.intelligence_memories';

export interface MemoryRead {
  records: JSONRecord[];
  skipped: { count: number; reason: string } | null;
}

/** The cloud id of a memory: the ruvector id plus a hash of what it holds. */
export function memoryCloudId(environment: string, entry: JSONRecord): string {
  const hash = createHash('sha256')
    .update(JSON.stringify([environment, entry.memory_type, entry.content, entry.timestamp, entry.metadata ?? null, entry.embedding ?? null]))
    .digest('hex')
    .slice(0, 12);
  return `${String(entry.id)}-${hash}`;
}

export function toIntelligenceMemories(entries: JSONRecord[], environment: string): MemoryRead {
  const byId = new Map<string, JSONRecord>();
  let notMemories = 0;
  let repeats = 0;
  for (const entry of entries) {
    const memoryType = entry.memory_type ?? entry.type;
    if (typeof entry.id !== 'string' || typeof memoryType !== 'string') {
      notMemories++;
      continue;
    }
    const id = memoryCloudId(environment, { ...entry, memory_type: memoryType });
    if (byId.has(id)) {
      repeats++;
      continue;
    }
    // Only the cloud columns: a field ruvector adds later is not an unknown column.
    byId.set(id, {
      id,
      memory_type: memoryType,
      content: typeof entry.content === 'string' ? entry.content : null,
      embedding: Array.isArray(entry.embedding) ? entry.embedding : null,
      metadata: entry.metadata ?? null,
      timestamp: entry.timestamp ?? null,
    });
  }
  const reasons: string[] = [];
  if (repeats > 0) {
    reasons.push(`${repeats} ${repeats === 1 ? 'memory repeats' : 'memories repeat'} an earlier one exactly (every field the same) and ${repeats === 1 ? 'was' : 'were'} uploaded once`);
  }
  if (notMemories > 0) {
    reasons.push(`${notMemories} ${notMemories === 1 ? 'entry has' : 'entries have'} no string id or memory_type and ${notMemories === 1 ? 'was' : 'were'} skipped`);
  }
  return {
    records: [...byId.values()],
    skipped: reasons.length === 0 ? null : { count: repeats + notMemories, reason: reasons.join('; ') },
  };
}
