/**
 * Agentic QE v3 - Nagual Client
 *
 * REST client for a nagual self-learning pattern hub.
 * Defaults to a locally running nagual serve instance.
 *
 * Setup: run your own nagual instance from
 *   https://github.com/proffesor-for-testing/nagual-qe
 * then: nagual serve --port 3333
 *
 * Env vars:
 *   NAGUAL_URL          — base URL of your nagual instance (default: http://localhost:3333)
 *   NAGUAL_API_TOKEN    — API token if your instance requires one
 *   NAGUAL_CLOUD_KEY    — alias for NAGUAL_API_TOKEN, loaded from ~/.nagual/cloud-hooks.env
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { LoggerFactory } from '../logging/index.js';

const logger = LoggerFactory.create('nagual-client');

/** Load NAGUAL_CLOUD_KEY from ~/.nagual/cloud-hooks.env when not in process.env. */
function loadCloudKeyFromFile(): string | undefined {
  try {
    const envFile = readFileSync(`${homedir()}/.nagual/cloud-hooks.env`, 'utf8');
    for (const line of envFile.split('\n')) {
      const m = line.match(/^(?:export\s+)?NAGUAL_CLOUD_KEY=(.+)/);
      if (m) return m[1].trim().replace(/^['"]|['"]$/g, '');
    }
  } catch { /* file may not exist */ }
  return undefined;
}

const DEFAULT_URL = 'http://localhost:3333';
const REQUEST_TIMEOUT_MS = 3000;
const PROMOTE_TIMEOUT_MS = 5000;

export interface NagualPattern {
  id: string;
  problem: string;
  solution: string;
  domain: string;
  reward: number;
  tags: string[];
  use_count?: number;
  success_rate?: number;
  embedding_method?: string;
}

export type NagualOutcomeType = 'success' | 'partial_success' | 'failure';

export interface NagualOutcome {
  outcome: NagualOutcomeType;
  reward: number;
  feedback?: string;
}

export interface NagualPromotePayload {
  problem: string;
  solution: string;
  domain: string;
  reward: number;
  tags?: string[];
  source_project?: string;
}

/** Map AQE TestOutcome → nagual outcome + reward. */
export function mapTestOutcomeToNagual(
  testOutcome: string,
): { outcome: NagualOutcomeType; reward: number } {
  switch (testOutcome) {
    case 'catches-bug':    return { outcome: 'success',         reward: 0.9 };
    case 'new-coverage':   return { outcome: 'partial_success', reward: 0.7 };
    case 'neutral':        return { outcome: 'partial_success', reward: 0.5 };
    case 'redundant':      return { outcome: 'partial_success', reward: 0.3 };
    case 'code-smell':     return { outcome: 'failure',         reward: 0.2 };
    case 'flaky':          return { outcome: 'failure',         reward: 0.2 };
    case 'false-positive': return { outcome: 'failure',         reward: 0.1 };
    default:               return { outcome: 'partial_success', reward: 0.5 };
  }
}

/**
 * Thin REST client for the nagual pattern hub.
 * All methods are fire-and-forget safe — they never throw.
 */
export class NagualClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  readonly enabled: boolean;

  constructor() {
    this.baseUrl = process.env['NAGUAL_URL'] ?? DEFAULT_URL;
    this.token =
      process.env['NAGUAL_CLOUD_KEY'] ??
      process.env['NAGUAL_API_TOKEN'] ??
      loadCloudKeyFromFile();
    this.enabled = true; // always attempt; errors are swallowed
  }

  /**
   * Search nagual for patterns relevant to a task.
   * Returns empty array on any error — callers must not depend on results.
   */
  async search(query: string, domain?: string, limit = 5): Promise<NagualPattern[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/patterns/search`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ query, domain, limit }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return [];
      const data = await response.json() as { patterns?: NagualPattern[] };
      return data.patterns ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Record an outcome for a nagual pattern that was used in a task.
   * Fire-and-forget — never awaited by callers in the hot path.
   */
  async recordOutcome(patternId: string, outcome: NagualOutcome): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/patterns/${encodeURIComponent(patternId)}/outcome`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(outcome),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        logger.debug('nagual recordOutcome non-OK', { patternId, status: response.status });
      }
    } catch (err) {
      logger.debug('nagual recordOutcome failed (non-fatal)', { patternId, err });
    }
  }

  /**
   * Promote an AQE long-term pattern up to nagual as the cross-project hub.
   * Applies 0.8 confidence decay on the reward before storing.
   */
  async promotePattern(payload: NagualPromotePayload): Promise<void> {
    const body = {
      problem: payload.problem,
      solution: payload.solution,
      domain: payload.domain,
      reward: payload.reward * 0.8, // cross-domain confidence decay
      tags: [
        ...(payload.tags ?? []),
        'source:aqe',
        payload.source_project ? `project:${payload.source_project}` : null,
      ].filter((t): t is string => t !== null),
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/patterns`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(PROMOTE_TIMEOUT_MS),
      });
      if (!response.ok) {
        logger.debug('nagual promotePattern non-OK', { status: response.status });
      }
    } catch (err) {
      logger.debug('nagual promotePattern failed (non-fatal)', { err });
    }
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }
}

let _instance: NagualClient | undefined;

export function getNagualClient(): NagualClient {
  if (!_instance) _instance = new NagualClient();
  return _instance;
}
