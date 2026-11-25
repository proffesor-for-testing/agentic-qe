/**
 * Run a ruflo MCP tool through the CLI (#1455).
 *
 * ruflo has no `hooks intelligence trajectory-*` or `pattern-*` CLI subcommands
 * (checked on 3.76.0, the pinned release, and 3.80.7): `hooks intelligence` takes no
 * subcommand, so those calls printed the intelligence status and exited 0. The
 * trajectory and pattern features exist only as MCP tools, which the CLI runs with
 * `ruflo mcp exec --tool <name> --params <json>` and prints as `Result:` followed by JSON.
 *
 * Every failure is returned as `{ ok: false, reason }`: a non-zero exit, a timeout,
 * output without a JSON result, or a result that reports `success: false`.
 */

import { resolve as resolvePath } from 'node:path';
import { resolveCliPackage } from './detect.js';
import { runCommandTree } from './process-tree.js';

/**
 * The ruflo MCP tools AQE runs. tests/unit/packaging/ruflo-argv-surface-1455.test.ts
 * checks each against `mcpTools` in the pinned release's CLI snapshot.
 */
export const RUFLO_TOOLS = [
  'hooks_intelligence_trajectory-start',
  'hooks_intelligence_trajectory-step',
  'hooks_intelligence_trajectory-end',
  'hooks_intelligence_pattern-store',
  'hooks_intelligence_pattern-search',
] as const;

export type RufloToolName = (typeof RUFLO_TOOLS)[number];

export type RufloToolResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; reason: string };

export interface RufloToolOptions {
  /** Directory ruflo runs in; ruflo keeps its state under `.claude-flow/` and `.swarm/` there. */
  cwd?: string;
  timeoutMs?: number;
  /** `ruflo` or `@claude-flow/cli`; resolved like the other bridges when omitted. */
  cliPkg?: string;
}

// eslint-disable-next-line no-control-regex -- ANSI colour codes in ruflo output
const ANSI = /\x1b\[[0-9;]*m/g;

/** `text` without ANSI colour codes. */
export const stripAnsi = (text: string): string => text.replace(ANSI, '');

/** `npx` arguments that run `tool` with `params` through the installed ruflo CLI. */
export function rufloToolArgv(tool: RufloToolName, params: Record<string, unknown>, cliPkg: string): string[] {
  return ['--no-install', cliPkg, 'mcp', 'exec', '--tool', tool, '--params', JSON.stringify(params)];
}

/** The first balanced `{...}` in `text` starting at `from`, or null. */
function balancedObject(text: string, from: number): string | null {
  const start = text.indexOf('{', from);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** The JSON object `ruflo mcp exec` prints after its `Result:` line, or null. */
export function parseMcpExecOutput(stdout: string): Record<string, unknown> | null {
  const text = stripAnsi(stdout);
  const marker = /^\s*Result:\s*$/m.exec(text);
  if (!marker) return null;
  const json = balancedObject(text, marker.index + marker[0].length);
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The `[ERROR]` line ruflo printed, else the first line of the error message. */
export function rufloErrorText(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { stderr?: unknown; stdout?: unknown; message?: unknown };
    const out = stripAnsi(`${typeof e.stderr === 'string' ? e.stderr : ''}${typeof e.stdout === 'string' ? e.stdout : ''}`)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /\[ERROR\]|No patterns|not found/i.test(l));
    if (out) return out;
    if (typeof e.message === 'string') return e.message.split(/\r?\n/)[0];
  }
  return String(error);
}

/**
 * Run one ruflo MCP tool via `npx --no-install <ruflo> mcp exec`, asynchronously.
 *
 * Every `mcp exec` reads and rewrites the same files in the project (`.claude-flow/`,
 * `.swarm/`), so concurrent calls lose each other's writes: 3 parallel trajectory starts
 * recorded 1 trajectory on ruflo 3.76.0. Calls for one project directory therefore run
 * one at a time, in call order (PROJECT_QUEUE). Other processes are not covered (#1492).
 *
 * Each call is a ruflo process: 1.1-1.5 s and about 350 MB RSS (3.76.0 and 3.80.7). On
 * timeout the whole process tree is killed (runCommandTree).
 */
export function runRufloTool(
  tool: RufloToolName,
  params: Record<string, unknown>,
  options: RufloToolOptions = {},
): Promise<RufloToolResult> {
  const cwd = resolvePath(options.cwd ?? process.cwd());
  const timeoutMs = options.timeoutMs ?? 15000;
  // ruflo-argv-unverifiable: `tool` is a RufloToolName; RUFLO_TOOLS is checked against the snapshot
  const argv = rufloToolArgv(tool, params, options.cliPkg ?? resolveCliPackage());
  // Queued synchronously, so calls run in the order they were made.
  return PROJECT_QUEUE.run(cwd, async (): Promise<RufloToolResult> => {
    let stdout: string;
    try {
      stdout = await runCommandTree('npx', argv, { cwd, timeoutMs });
    } catch (error) {
      return { ok: false, reason: `ruflo mcp exec ${tool} failed: ${rufloErrorText(error)}` };
    }
    const data = parseMcpExecOutput(stdout);
    if (!data) return { ok: false, reason: `ruflo mcp exec ${tool} printed no JSON result` };
    // ruflo reports a failed tool as `{ success: false, error | message }`. A bare
    // `success: false` is data: trajectory-end echoes the trajectory's own outcome.
    if (data.success === false && (data.error !== undefined || data.message !== undefined)) {
      const why = data.error ?? data.message;
      return { ok: false, reason: `ruflo ${tool} reported failure: ${String(why)}` };
    }
    return { ok: true, data };
  });
}

/** Runs tasks with the same key one after another, in call order; a rejection does not stop the queue. */
export class KeyedSerialQueue {
  private tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const next = prev.then(task, task);
    const tail = next.catch(() => undefined);
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return next;
  }
}

/** One queue per resolved project directory for every ruflo `mcp exec` in this process. */
const PROJECT_QUEUE = new KeyedSerialQueue();
