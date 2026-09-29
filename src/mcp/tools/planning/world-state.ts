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
import {
  DEFAULT_V3_WORLD_STATE,
  QE_GOALS,
  getAllQEActions,
  type V3WorldState,
} from '../../../planning/index.js';
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

/**
 * Caller-supplied (partial) world state: any subset of each section's
 * fields, plus planner flag keys the action library uses (e.g.
 * `coverage.gapsIdentified`).
 */
export type WorldStatePatch = {
  [S in keyof V3WorldState]?: Partial<V3WorldState[S]> & Record<string, unknown>;
};

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

// ============================================================================
// Caller-state validation (system boundary)
// ============================================================================

type FieldCheck = (value: unknown) => string | null;

const percent: FieldCheck = (v) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? null : 'a number between 0 and 100';
const nonNegativeInt: FieldCheck = (v) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? null : 'a non-negative integer';
const nonNegative: FieldCheck = (v) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? null : 'a non-negative number';
const bool: FieldCheck = (v) => (typeof v === 'boolean' ? null : 'a boolean');
const stringList: FieldCheck = (v) =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? null : 'an array of strings';
const oneOf = (...allowed: string[]): FieldCheck => (v) =>
  typeof v === 'string' && allowed.includes(v) ? null : `one of ${allowed.join(', ')}`;

/** Schema of the known V3WorldState leaves. */
const FIELD_CHECKS: Record<string, FieldCheck> = {
  'coverage.line': percent,
  'coverage.branch': percent,
  'coverage.function': percent,
  'coverage.target': percent,
  'coverage.measured': bool,
  'quality.testsPassing': percent,
  'quality.totalTests': nonNegativeInt,
  'quality.securityScore': percent,
  'quality.performanceScore': percent,
  'fleet.activeAgents': nonNegativeInt,
  'fleet.availableAgents': stringList,
  'fleet.maxAgents': nonNegativeInt,
  'resources.timeRemaining': nonNegative,
  'resources.memoryAvailable': nonNegative,
  'resources.parallelSlots': nonNegativeInt,
  'context.environment': oneOf('development', 'staging', 'production'),
  'context.riskLevel': oneOf('low', 'medium', 'high'),
  'patterns.available': nonNegativeInt,
  'patterns.reusable': nonNegativeInt,
};

const SECTIONS = ['coverage', 'quality', 'fleet', 'resources', 'context', 'patterns'] as const;

let libraryFlagKeys: Set<string> | null = null;

/** Extra state keys the seeded action library / goals read or write. */
function plannerFlagKeys(): Set<string> {
  if (!libraryFlagKeys) {
    const keys = new Set<string>();
    for (const action of getAllQEActions()) {
      for (const k of Object.keys(action.preconditions)) keys.add(k);
      for (const k of Object.keys(action.effects)) keys.add(k);
    }
    for (const goal of QE_GOALS) {
      for (const k of Object.keys(goal.conditions)) keys.add(k);
    }
    libraryFlagKeys = keys;
  }
  return libraryFlagKeys;
}

/**
 * Validate a caller-supplied world state (issue #535, codex review): known
 * fields must match the V3WorldState schema (types, 0-100 percentages,
 * enums); other keys are accepted only if the action library or the goal
 * uses them (planner flags such as `coverage.gapsIdentified`) and hold a
 * boolean or finite number. Returns an error message, or null when valid.
 */
export function validateWorldStatePatch(
  provided: unknown,
  extraAllowedKeys: Iterable<string> = []
): string | null {
  if (typeof provided !== 'object' || provided === null || Array.isArray(provided)) {
    return 'currentState must be an object';
  }
  const flags = new Set([...plannerFlagKeys(), ...extraAllowedKeys]);
  for (const [section, patch] of Object.entries(provided)) {
    if (!(SECTIONS as readonly string[]).includes(section)) {
      return `currentState.${section} is not a world-state section (expected one of ${SECTIONS.join(', ')})`;
    }
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
      return `currentState.${section} must be an object`;
    }
    for (const [key, value] of Object.entries(patch)) {
      const field = `${section}.${key}`;
      const check = FIELD_CHECKS[field];
      if (check) {
        const expected = check(value);
        if (expected) return `currentState.${field} must be ${expected}, got ${JSON.stringify(value)}`;
        continue;
      }
      if (!flags.has(field)) {
        return `currentState.${field} is not a known world-state field`;
      }
      if (typeof value !== 'boolean' && !(typeof value === 'number' && Number.isFinite(value))) {
        return `currentState.${field} must be a boolean or finite number, got ${JSON.stringify(value)}`;
      }
    }
  }
  return null;
}

/**
 * Overlay a caller-supplied (possibly partial) world state onto a detected
 * one, section by section, marking every overridden leaf as 'caller'.
 * Callers must run validateWorldStatePatch() first; this only merges.
 */
export function overlayCallerState(
  detected: DetectedWorldState,
  provided: WorldStatePatch
): DetectedWorldState {
  const state = detected.state as unknown as Record<string, Record<string, unknown>>;
  const provenance = { ...detected.provenance };
  for (const section of SECTIONS) {
    const patch = (provided as Record<string, unknown>)[section];
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) continue;
    for (const [key, value] of Object.entries(patch)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
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
