/**
 * GOAP world-state detection for the planning MCP tools (issue #535).
 *
 * `goap_status {type:"world"}` and `goap_plan`'s auto-detected start state
 * used to return a static copy of DEFAULT_V3_WORLD_STATE (fleet frozen at
 * `activeAgents: 0`, coverage 0, securityScore 100, ...) and label it as real
 * data. This module builds the state from sources that are actually live in
 * the MCP server process and records, per field, where each value came from:
 *
 *   - 'live'     — read from the running fleet (the same queen/kernel state
 *                  `agent_list` reads)
 *   - 'measured' — read from a coverage report on disk
 *                  (`coverage/coverage-summary.json`, istanbul json-summary)
 *   - 'caller'   — supplied by the caller (goap_plan `currentState`)
 *   - 'default'  — not measured; the planner's DEFAULT_V3_WORLD_STATE value
 *                  is used as an assumption and must not be reported as real
 *
 * @module mcp/tools/planning/world-state
 */

import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_V3_WORLD_STATE, type V3WorldState } from '../../../planning/index.js';
import { findProjectRoot } from '../../../kernel/project-root.js';

// ============================================================================
// Types
// ============================================================================

export type WorldStateFieldSource = 'live' | 'measured' | 'caller' | 'default';

/** Dotted world-state field path -> where its value came from. */
export type WorldStateProvenance = Record<string, WorldStateFieldSource>;

/** Snapshot of the in-process fleet (queen + kernel). */
export interface FleetSnapshot {
  /** Agents with status 'running' (same definition as queen.getHealth()). */
  activeAgents: number;
  /** Kernel's configured concurrent-agent cap (fleet_init maxAgents). */
  maxAgents: number;
  /** Distinct agent types currently idle or running. */
  availableAgents: string[];
}

/** Line/branch/function coverage percentages read from a report file. */
export interface CoverageSnapshot {
  line: number;
  branch: number;
  function: number;
  /** Report path relative to the project root, for traceability. */
  source: string;
  /** Report file modification time (ISO). */
  measuredAt: string;
}

export interface DetectedWorldState {
  state: V3WorldState;
  provenance: WorldStateProvenance;
  /** True when a fleet is initialized in this process. */
  fleetInitialized: boolean;
  /** Coverage report the coverage fields came from, if any. */
  coverageReport?: { source: string; measuredAt: string };
}

export interface WorldStateSources {
  readFleet?: () => Promise<FleetSnapshot | null>;
  readCoverage?: () => CoverageSnapshot | null;
}

/** Every leaf field the planner's world state carries (for provenance). */
const TRACKED_FIELDS: readonly string[] = [
  'coverage.line',
  'coverage.branch',
  'coverage.function',
  'coverage.target',
  'coverage.measured',
  'quality.testsPassing',
  'quality.totalTests',
  'quality.securityScore',
  'quality.performanceScore',
  'fleet.activeAgents',
  'fleet.availableAgents',
  'fleet.maxAgents',
  'resources.timeRemaining',
  'resources.memoryAvailable',
  'resources.parallelSlots',
  'context.environment',
  'context.riskLevel',
  'patterns.available',
  'patterns.reusable',
];

const COVERAGE_SUMMARY_RELATIVE = path.join('coverage', 'coverage-summary.json');
const MAX_COVERAGE_SUMMARY_BYTES = 32 * 1024 * 1024;

// ============================================================================
// Live sources
// ============================================================================

/**
 * Read the in-process fleet via core-handlers' fleet state — the same queen
 * `agent_list` reads. Returns null when no fleet is initialized. Dynamic
 * import: core-handlers transitively imports the tool registry, which
 * imports this module's callers (a static import would be circular).
 */
export async function readLiveFleet(): Promise<FleetSnapshot | null> {
  try {
    const { getFleetState, isFleetInitialized } = await import('../../handlers/core-handlers.js');
    if (!isFleetInitialized()) return null;
    const { queen, kernel } = getFleetState();
    if (!queen || !kernel) return null;

    const agents = queen.listAllAgents();
    const availableAgents = [
      ...new Set(
        agents.filter((a) => a.status === 'running' || a.status === 'idle').map((a) => a.type)
      ),
    ].sort();

    return {
      activeAgents: agents.filter((a) => a.status === 'running').length,
      maxAgents: kernel.getConfig().maxConcurrentAgents,
      availableAgents,
    };
  } catch {
    return null;
  }
}

function isPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

/**
 * Read `coverage/coverage-summary.json` (istanbul/v8 json-summary reporter)
 * under the project root. Fixed relative path — no caller-controlled input
 * reaches the filesystem. Returns null when absent, oversized, or malformed.
 */
export function readCoverageSummary(projectRoot: string = findProjectRoot()): CoverageSnapshot | null {
  const file = path.join(projectRoot, COVERAGE_SUMMARY_RELATIVE);
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_COVERAGE_SUMMARY_BYTES) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as {
      total?: Record<string, { pct?: unknown } | undefined>;
    };
    const line = parsed.total?.lines?.pct;
    const branch = parsed.total?.branches?.pct;
    const fn = parsed.total?.functions?.pct;
    if (!isPercent(line) || !isPercent(branch) || !isPercent(fn)) return null;
    return {
      line,
      branch,
      function: fn,
      source: COVERAGE_SUMMARY_RELATIVE,
      measuredAt: stat.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Detection
// ============================================================================

function cloneDefaultState(): V3WorldState {
  const d = DEFAULT_V3_WORLD_STATE;
  return {
    coverage: { ...d.coverage },
    quality: { ...d.quality },
    fleet: { ...d.fleet, availableAgents: [...d.fleet.availableAgents] },
    resources: { ...d.resources },
    context: { ...d.context },
    patterns: { ...d.patterns },
  };
}

/**
 * Build the current world state from live/measured sources, falling back to
 * DEFAULT_V3_WORLD_STATE per field and recording which is which.
 */
export async function detectWorldState(sources: WorldStateSources = {}): Promise<DetectedWorldState> {
  const state = cloneDefaultState();
  const provenance: WorldStateProvenance = {};
  for (const field of TRACKED_FIELDS) provenance[field] = 'default';

  const fleet = await (sources.readFleet ?? readLiveFleet)();
  if (fleet) {
    state.fleet.activeAgents = fleet.activeAgents;
    state.fleet.maxAgents = fleet.maxAgents;
    state.fleet.availableAgents = [...fleet.availableAgents];
    provenance['fleet.activeAgents'] = 'live';
    provenance['fleet.maxAgents'] = 'live';
    provenance['fleet.availableAgents'] = 'live';
  }

  const coverage = (sources.readCoverage ?? (() => readCoverageSummary()))();
  let coverageReport: DetectedWorldState['coverageReport'];
  if (coverage) {
    state.coverage.line = coverage.line;
    state.coverage.branch = coverage.branch;
    state.coverage.function = coverage.function;
    state.coverage.measured = true;
    for (const f of ['coverage.line', 'coverage.branch', 'coverage.function', 'coverage.measured']) {
      provenance[f] = 'measured';
    }
    coverageReport = { source: coverage.source, measuredAt: coverage.measuredAt };
  }

  return { state, provenance, fleetInitialized: fleet !== null, coverageReport };
}

/** World-state leaves are finite numbers, booleans, strings, or string lists. */
function isAcceptableStateValue(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean' || typeof value === 'string') return true;
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/**
 * Overlay a caller-supplied (possibly partial) world state onto a detected
 * one, section by section, marking every overridden leaf as 'caller'.
 * Only the known top-level sections are merged; anything else is ignored so
 * a malformed payload can't replace whole sections with non-objects.
 */
export function overlayCallerState(
  detected: DetectedWorldState,
  provided: unknown
): DetectedWorldState {
  if (typeof provided !== 'object' || provided === null || Array.isArray(provided)) {
    return detected;
  }
  const state = detected.state as unknown as Record<string, Record<string, unknown>>;
  const provenance = { ...detected.provenance };
  for (const section of ['coverage', 'quality', 'fleet', 'resources', 'context', 'patterns']) {
    const patch = (provided as Record<string, unknown>)[section];
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) continue;
    for (const [key, value] of Object.entries(patch)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      if (!isAcceptableStateValue(value)) continue;
      state[section][key] = Array.isArray(value) ? [...value] : value;
      provenance[`${section}.${key}`] = 'caller';
    }
  }
  return { ...detected, provenance };
}

/** Field paths whose values are assumptions rather than observations. */
export function defaultedFields(provenance: WorldStateProvenance): string[] {
  return Object.entries(provenance)
    .filter(([, source]) => source === 'default')
    .map(([field]) => field)
    .sort();
}
