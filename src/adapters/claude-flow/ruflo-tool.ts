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

import { resolveCliPackage } from './detect.js';

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

/** stdout of `npx <args>`, run without a shell and without blocking the event loop. */
function execNpx(args: string[], cwd: string | undefined, timeoutMs: number): Promise<string> {
  return import('child_process').then(
    ({ execFile }) =>
      new Promise<string>((resolve, reject) => {
        execFile(
          'npx',
          args,
          { encoding: 'utf-8', timeout: timeoutMs, cwd, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
          (error, stdout, stderr) => {
            if (!error) return resolve(String(stdout));
            const killed = (error as { killed?: boolean }).killed === true;
            reject(
              Object.assign(error, {
                stdout: String(stdout ?? ''),
                stderr: String(stderr ?? ''),
                message: killed ? `timed out after ${timeoutMs} ms` : error.message,
              })
            );
          }
        );
      })
  );
}

/**
 * Run one ruflo MCP tool via `npx --no-install <ruflo> mcp exec`. Asynchronous: each call
 * is a ruflo process (about 1.4 s, 3 s cold, measured on 3.76.0).
 */
export async function runRufloTool(
  tool: RufloToolName,
  params: Record<string, unknown>,
  options: RufloToolOptions = {},
): Promise<RufloToolResult> {
  let stdout: string;
  try {
    // ruflo-argv-unverifiable: `tool` is a RufloToolName; RUFLO_TOOLS is checked against the snapshot
    stdout = await execNpx(rufloToolArgv(tool, params, options.cliPkg ?? resolveCliPackage()), options.cwd, options.timeoutMs ?? 15000);
  } catch (error) {
    return { ok: false, reason: `ruflo mcp exec ${tool} failed: ${rufloErrorText(error)}` };
  }
  const data = parseMcpExecOutput(stdout);
  if (!data) return { ok: false, reason: `ruflo mcp exec ${tool} printed no JSON result` };
  if (data.success === false) {
    const why = data.error ?? data.message ?? 'success: false';
    return { ok: false, reason: `ruflo ${tool} reported failure: ${String(why)}` };
  }
  return { ok: true, data };
}

/**
 * Runs tasks with the same key one after another (#1455). ruflo loses steps when
 * several `mcp exec` processes write one trajectory at once (5 parallel steps: 2
 * returned `recorded: false`, `totalSteps` 1, on 3.76.0).
 */
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
