#!/usr/bin/env node
/**
 * Ruflo CLI command surface (#1417).
 *
 * The skills, commands and agents AQE ships tell agents to run
 * `npx ruflo@<RUFLO_PINNED_VERSION> <command> [subcommand] [flags]`. #1404 pinned the
 * version; this module checks that each call names a command, subcommand and flags
 * that the pinned release actually has.
 *
 * The surface is a committed snapshot (tests/fixtures/ruflo-cli-surface/<version>.json),
 * so the check runs offline. Regenerate it after bumping RUFLO_PINNED_VERSION:
 *
 *   npm install --prefix /tmp/rf ruflo@<version>
 *   node scripts/ruflo-cli-surface.mjs snapshot /tmp/rf/node_modules/.bin/ruflo \
 *     > tests/fixtures/ruflo-cli-surface/<version>.json
 *
 * Every `--help` runs in a new empty temporary directory: ruflo refreshes the
 * `.claude/helpers` of the directory it runs in, which must not be this repo.
 *
 * The snapshot is built from `--help` output: the commands ruflo registers
 * (`commandLoaders` in @claude-flow/cli, next to the binary; else the top-level help
 * plus HIDDEN_COMMANDS), their SUBCOMMANDS and OPTIONS. An alias is kept only when
 * `ruflo <parent> <alias> --help` prints the help of its target. `mcpTools` lists the
 * MCP tool names from `ruflo mcp tools --format json`.
 *
 * Two kinds of call are checked: shell commands in text (extractCalls, #1417) and
 * argv lists in src/ code that runs ruflo (extractArgvCalls, #1455), including the MCP
 * tools that code runs through `ruflo mcp exec`. An argv whose command path is not all
 * literal, or that a variable spread or push() can extend, is UNVERIFIABLE: a finding,
 * unless the call's lines (or the line above) carry `ruflo-argv-unverifiable: <reason>`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Commands not listed in `ruflo --help`, used when ruflo's command index is not found. */
export const HIDDEN_COMMANDS = ['verify'];

/** How deep subcommands are followed (`hooks transfer store search` is depth 4). */
const MAX_DEPTH = 4;

const ANSI = /\x1b\[[0-9;]*m/g;

function sections(helpText) {
  const out = {};
  let current = null;
  for (const raw of helpText.replace(ANSI, '').split(/\r?\n/)) {
    const header = /^([A-Z][A-Z0-9 ]*[A-Z0-9]):\s*$/.exec(raw.trim());
    if (header && !/^\s{2,}/.test(raw)) {
      current = header[1];
      out[current] = [];
      continue;
    }
    if (current) out[current].push(raw);
  }
  return out;
}

/** Names in a `SUBCOMMANDS:` / `... COMMANDS:` block, including `(alias)` suffix candidates. */
export function parseCommandList(lines) {
  const names = [];
  for (const line of lines) {
    const m = /^\s{2}([a-z][\w:-]*)\s+(.*)$/.exec(line);
    if (!m) continue;
    names.push(m[1]);
    const alias = /\(([a-z][\w-]*(?:,\s*[a-z][\w-]*)*)\)\s*$/.exec(m[2]);
    if (alias) for (const a of alias[1].split(/,\s*/)) names.push(`${a}=${m[1]}`);
  }
  return names;
}

/** Long and short flags in an `OPTIONS:` block. */
export function parseFlags(lines) {
  const flags = new Set();
  for (const line of lines) {
    const m = /^\s+((?:-[a-zA-Z0-9],\s+)?--?[a-zA-Z][\w-]*)/.exec(line);
    if (!m) continue;
    for (const f of m[1].split(/,\s+/)) flags.add(f.trim());
  }
  return [...flags].sort();
}

/** The first non-empty line of a help text, e.g. `ruflo hooks pre-task`. */
function helpHeader(text) {
  return text.replace(ANSI, '').split(/\r?\n/).map((l) => l.trim()).find((l) => /^ruflo\b/.test(l)) ?? '';
}

/** Command names registered in @claude-flow/cli's command index next to `bin`, or null. */
export function registeredCommands(bin) {
  let dir;
  try { dir = dirname(realpathSync(bin)); } catch { return null; }
  for (let i = 0; i < 8; i++) {
    for (const base of [join(dir, 'node_modules'), dir]) {
      const index = join(base, '@claude-flow', 'cli', 'dist', 'src', 'commands', 'index.js');
      if (existsSync(index)) {
        const src = readFileSync(index, 'utf8');
        const at = src.indexOf('commandLoaders');
        const block = at === -1 ? '' : src.slice(at, src.indexOf('};', at));
        const names = [...block.matchAll(/^\s*["']?([a-z][\w-]*)["']?\s*:\s*(?:async\s*)?\(\)/gm)].map((m) => m[1]);
        return names.length > 0 ? names : null;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function helpRunner(bin) {
  const cwd = mkdtempSync(join(tmpdir(), 'ruflo-surface-'));
  const raw = (args) => {
    const r = spawnSync(bin, args, {
      cwd,
      input: '', // `mcp start --help` starts the server, which exits when stdin closes
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };
  const run = (args) => {
    const r = raw([...args, '--help']);
    return `${r.stdout}${r.stderr}`;
  };
  return { run, raw, dispose: () => rmSync(cwd, { recursive: true, force: true }) };
}

/** Sorted MCP tool names from `ruflo mcp tools --format json`. */
function mcpToolNames(raw) {
  const { stdout } = raw(['mcp', 'tools', '--format', 'json']);
  const start = stdout.indexOf('[');
  const tools = start === -1 ? null : JSON.parse(stdout.slice(start, stdout.lastIndexOf(']') + 1));
  if (!Array.isArray(tools) || tools.length === 0) throw new Error('could not read `ruflo mcp tools --format json`');
  return [...new Set(tools.map((t) => t.name))].sort();
}

function describeNode(run, path, depth) {
  const text = run(path);
  if (/Unknown command/i.test(text)) return null;
  // Some commands ignore --help (`mcp start` starts the server). They exist, since
  // their parent lists them, but their flags are unknown and are not checked.
  if (helpHeader(text) !== `ruflo ${path.join(' ')}`) return { flags: [], helpUnavailable: true };
  const s = sections(text);
  const node = { flags: parseFlags(s.OPTIONS ?? []) };
  const subs = parseCommandList(s.SUBCOMMANDS ?? []);
  if (subs.length > 0 && depth < MAX_DEPTH) {
    node.subcommands = {};
    node.aliases = {};
    for (const entry of subs) {
      const [name, target] = entry.split('=');
      if (target) {
        // "(ls)" is an alias; "agent(s)" or "(code)" in a description is not.
        if (helpHeader(run([...path, name])) === `ruflo ${[...path, target].join(' ')}`) node.aliases[name] = target;
        continue;
      }
      const child = describeNode(run, [...path, name], depth + 1);
      if (child) node.subcommands[name] = child;
    }
    if (Object.keys(node.aliases).length === 0) delete node.aliases;
  }
  return node;
}

export function snapshot(bin) {
  const { run, raw, dispose } = helpRunner(bin);
  try {
    const top = run([]);
    const version = /ruflo v(\d+\.\d+\.\d+)/.exec(top.replace(ANSI, ''))?.[1];
    if (!version) throw new Error(`could not read the ruflo version from ${bin} --help`);
    const s = sections(top);
    const names = new Set(registeredCommands(bin) ?? HIDDEN_COMMANDS);
    for (const [title, lines] of Object.entries(s)) {
      if (/COMMANDS$/.test(title)) for (const n of parseCommandList(lines)) names.add(n.split('=')[0]);
    }
    const commands = {};
    for (const name of [...names].sort()) {
      const node = describeNode(run, [name], 1);
      if (node) commands[name] = node;
    }
    return { tool: 'ruflo', version, globalFlags: parseFlags(s['GLOBAL OPTIONS'] ?? []), commands, mcpTools: mcpToolNames(raw) };
  } finally {
    dispose();
  }
}

// ---------------------------------------------------------------------------
// Call extraction and checking
// ---------------------------------------------------------------------------

/**
 * Shell-ish tokens of the text after `ruflo@x.y.z`, up to the end of the command:
 * a pipe, `;`, `&&`, `||`, redirection, backtick, closing paren, comment, or end of line.
 * Quoted strings and `$(...)` are single tokens.
 */
export function tokenize(rest) {
  const tokens = [];
  let i = 0;
  let cur = '';
  let quotedToken = false;
  let startsQuoted = false;
  const push = () => {
    if (cur !== '' || quotedToken) tokens.push({ text: cur, quoted: quotedToken, startsQuoted });
    cur = '';
    quotedToken = false;
    startsQuoted = false;
  };
  while (i < rest.length) {
    const c = rest[i];
    if ((c === '"' || c === "'" || (c === '$' && rest[i + 1] === '(')) && cur === '' && !quotedToken) startsQuoted = true;
    // `<path>` is a placeholder in prose, not a redirection.
    const placeholder = c === '<' && cur === '' ? /^<[\w.:/|-]+>/.exec(rest.slice(i)) : null;
    if (placeholder) {
      cur = placeholder[0];
      i += placeholder[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = rest.indexOf(c, i + 1);
      if (end === -1) break;
      cur += rest.slice(i + 1, end);
      quotedToken = true;
      i = end + 1;
      continue;
    }
    if (c === '$' && rest[i + 1] === '(') {
      let depth = 0;
      let j = i + 1;
      for (; j < rest.length; j++) {
        if (rest[j] === '(') depth++;
        else if (rest[j] === ')' && --depth === 0) break;
      }
      cur += rest.slice(i, j + 1);
      quotedToken = true;
      i = j + 1;
      continue;
    }
    if (/\s/.test(c)) {
      push();
      i++;
      continue;
    }
    if ('|;&<>`)#'.includes(c) || (c === '\\' && rest[i + 1] === 'n')) break;
    cur += c;
    i++;
  }
  push();
  return tokens;
}

/**
 * A launched ruflo call: `npx [flags] ruflo@<version>` (or bunx, npm exec/x, pnpm/yarn dlx),
 * or `npx --no-install ruflo`, which runs the installed CLI. A bare mention such as
 * "requires ruflo@3.76.0 or later" is not a call. `\n` covers prompts embedded in JSON.
 */
const LAUNCH = /(?:^|[\s"'`(=;&|]|\\n)(?:npx|bunx|npm\s+(?:exec|x)|pnpm\s+dlx|yarn\s+dlx)((?:\s+-{1,2}[\w-]+)*)\s+ruflo(?:@([\w.-]+))?(?![\w@/.-])/g;

/** `npx -p ruflo@<v> ruflo <cmd>` / `npx --package=ruflo@<v> ruflo <cmd>`: the package is named by a flag. */
const LAUNCH_PACKAGE = /(?:^|[\s"'`(=;&|]|\\n)(?:npx|npm\s+(?:exec|x))((?:\s+-{1,2}[\w-]+)*)\s+(?:-p\s+|--package[=\s]+)ruflo@([\w.-]+)((?:\s+-{1,2}[\w-]+)*)\s+ruflo(?![\w@/.-])/g;

/**
 * Every launched ruflo call of the pinned `version` in `content` (see LAUNCH), with
 * `\` line continuations joined. Returns { line, text, tokens } per call.
 */
export function extractCalls(content, version) {
  const lines = content.split(/\r?\n/);
  const calls = [];
  lines.forEach((line, idx) => {
    const found = [];
    for (const m of line.matchAll(LAUNCH_PACKAGE)) found.push({ index: m.index, length: m[0].length, flags: '', got: m[2] });
    for (const m of line.matchAll(LAUNCH)) {
      // `-p ruflo@x ruflo`: the second `ruflo` is the binary, already found above.
      if (found.some((f) => m.index >= f.index && m.index < f.index + f.length)) continue;
      found.push({ index: m.index, length: m[0].length, flags: m[1], got: m[2] });
    }
    for (const m of found) {
      const { flags, got } = m;
      const noInstall = /(^|\s)--no-install\b/.test(flags);
      if (got === undefined ? !noInstall : got !== version) continue;
      let rest = line.slice(m.index + m.length);
      let j = idx;
      while (/\\\s*$/.test(rest) && j + 1 < lines.length) {
        j++;
        rest = `${rest.replace(/\\\s*$/, ' ')} ${lines[j].trim()}`;
      }
      const spec = got === undefined ? 'ruflo' : `ruflo@${got}`;
      calls.push({ line: idx + 1, text: `${spec}${rest}`.trim(), tokens: tokenize(rest) });
    }
  });
  return calls;
}

const looksLikeWord = (t) => !t.quoted && /^[a-z][a-z0-9-]*$/.test(t.text);

/** A placeholder such as `<command>` or `[options]` in prose: not checkable. */
const isPlaceholder = (t) => !t.quoted && /^[<[{]/.test(t.text);

/**
 * Check one call against the snapshot. Returns null when valid, or a reason string.
 * A call with no command word (prose such as "use `npx ruflo@x`") is valid.
 */
export function checkCall(tokens, surface) {
  if (tokens.length === 0 || isPlaceholder(tokens[0])) return null;
  const first = tokens[0];
  if (first.text.startsWith('-')) {
    const bad = tokens.filter((t) => !t.startsQuoted && /^--?[a-zA-Z]/.test(t.text)).map((t) => t.text.split('=')[0]);
    const unknown = bad.filter((f) => !surface.globalFlags.includes(f));
    return unknown.length ? `unknown flag(s) ${unknown.join(' ')}` : null;
  }
  if (!looksLikeWord(first)) return null;
  let node = surface.commands[first.text];
  if (!node) return `unknown command '${first.text}'`;
  const path = [first.text];
  let k = 1;
  while (node.subcommands && k < tokens.length && !isPlaceholder(tokens[k])) {
    const t = tokens[k];
    if (t.text.startsWith('-')) break;
    if (!looksLikeWord(t)) break;
    const name = node.aliases?.[t.text] ?? t.text;
    const child = node.subcommands[name];
    if (!child) {
      // ruflo prints the parent's help for a word that is not one of its subcommands,
      // at any depth. Positional arguments are quoted or follow a leaf command.
      if (Object.keys(node.subcommands).length > 0) return `unknown subcommand '${path.join(' ')} ${t.text}'`;
      break;
    }
    node = child;
    path.push(name);
    k++;
  }
  if (node.helpUnavailable) return null;
  const known = new Set([...node.flags, ...surface.globalFlags]);
  const unknown = [];
  for (const t of tokens.slice(k)) {
    // `"--x"` is a value; `--x="v"` is still the flag --x.
    if (t.startsQuoted || !/^--?[a-zA-Z]/.test(t.text)) continue;
    const flag = t.text.split('=')[0];
    const base = flag.replace(/^--no-/, '--');
    if (!known.has(flag) && !known.has(base)) unknown.push(flag);
  }
  return unknown.length ? `'${path.join(' ')}' has no flag ${[...new Set(unknown)].join(' ')}` : null;
}

/** All invalid calls in `content`: [{ line, text, reason }]. */
export function findInvalidCalls(content, surface) {
  return extractCalls(content, surface.version).flatMap((c) => {
    const reason = checkCall(c.tokens, surface);
    return reason ? [{ line: c.line, text: c.text, reason }] : [];
  });
}

// ---------------------------------------------------------------------------
// argv lists in source code (#1455)
// ---------------------------------------------------------------------------

/** A JS string literal starting at `i`: { text, interpolated, end } (end is past the quote), or null. */
function readString(src, i) {
  const q = src[i];
  if (q !== '"' && q !== "'" && q !== '`') return null;
  let j = i + 1;
  let text = '';
  let interpolated = false;
  while (j < src.length && src[j] !== q) {
    if (src[j] === '\\') {
      text += src[j + 1] ?? '';
      j += 2;
      continue;
    }
    if (q === '`' && src[j] === '$' && src[j + 1] === '{') interpolated = true;
    text += src[j];
    j++;
  }
  return { text, interpolated, end: j + 1 };
}

/** Index past the comment starting at `i`, or -1 when none starts there. */
function commentEnd(src, i) {
  if (src[i] !== '/') return -1;
  if (src[i + 1] === '/') {
    const nl = src.indexOf('\n', i);
    return nl === -1 ? src.length : nl;
  }
  if (src[i + 1] === '*') {
    const close = src.indexOf('*/', i + 2);
    return close === -1 ? src.length : close + 2;
  }
  return -1;
}

/**
 * The comma-separated elements of the list starting at `open` (just past `(` or `[`),
 * up to its matching close, with comments removed: { elements, end } (end is the close).
 */
function splitList(src, open) {
  const elements = [];
  let depth = 0;
  let cur = '';
  let i = open;
  for (; i < src.length; i++) {
    const c = src[i];
    const str = readString(src, i);
    if (str) {
      cur += src.slice(i, str.end);
      i = str.end - 1;
      continue;
    }
    const skip = commentEnd(src, i);
    if (skip !== -1) {
      cur += ' ';
      i = skip - 1;
      continue;
    }
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) {
      if (depth === 0) break;
      depth--;
    }
    if (c === ',' && depth === 0) {
      elements.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) elements.push(cur.trim());
  return { elements, end: i };
}

/** A plain string literal element: its text, else null. */
function literalText(el) {
  const str = readString(el, 0);
  return str && str.end === el.length && !str.interpolated ? str.text : null;
}

/** String literals inside an expression. */
function innerLiterals(el) {
  const out = [];
  for (let i = 0; i < el.length; i++) {
    const inner = readString(el, i);
    if (!inner) continue;
    if (!inner.interpolated) out.push(inner.text);
    i = inner.end - 1;
  }
  return out;
}

/**
 * Tokens of argv elements. A plain string literal is a word or flag as written. A
 * spread whose expression has no string literal (`...extra`) is `unverifiable`: it can
 * add any word or flag. Any other expression is a value, and the flag literals inside
 * it (`...(x ? ['--a', x] : [])`) are flags.
 */
function argvTokens(elements) {
  const tokens = [];
  for (const el of elements) {
    const text = literalText(el);
    if (text !== null) {
      tokens.push({ text, quoted: false, startsQuoted: false });
      continue;
    }
    const literals = innerLiterals(el);
    if (el.startsWith('...') && literals.length === 0) {
      tokens.push({ text: el, quoted: true, startsQuoted: true, unverifiable: true });
      continue;
    }
    tokens.push({ text: el, quoted: true, startsQuoted: true });
    for (const lit of literals) {
      if (/^--?[a-zA-Z][\w-]*$/.test(lit)) tokens.push({ text: lit, quoted: false, startsQuoted: false });
    }
  }
  return tokens;
}

const lineAt = (src, index) => src.slice(0, index).split('\n').length;

/** A ruflo package spec: `ruflo`, `claude-flow`, `@claude-flow/cli`, optionally `@<version>`. */
const RUFLO_SPEC = /^(?:ruflo|claude-flow|@claude-flow\/cli)(?:@[\w.-]+)?$/;
/** Identifiers that hold a ruflo package spec. */
const SPEC_IDENTIFIERS = new Set(['RUFLO_PINNED_SPEC']);
const isSpec = (el) => {
  const text = literalText(el);
  return text !== null ? RUFLO_SPEC.test(text) : SPEC_IDENTIFIERS.has(el);
};

/** `[..., '--no-install', <pkg>, ...]`: the package is resolved at run time. */
const NO_INSTALL_ARRAY = /(['"`])--no-install\1\s*,/g;
/** An array that may name a ruflo package spec (checked element by element). */
const SPEC_ARRAY = /\[\s*(?=(?:(['"`])-[\w-]*\1\s*,\s*)*(?:(['"`])(?:ruflo|claude-flow|@claude-flow\/cli)(?:@[\w.-]+)?\2|RUFLO_PINNED_SPEC)\s*[,\]])/g;
/** The ruflo binary run directly: `execFileSync('ruflo', [...])`. */
const DIRECT_BIN = /\b(?:execFileSync|execFile|spawnSync|spawn|execaSync|execa)\(\s*(['"`])(?:ruflo|claude-flow)\1\s*,\s*\[/g;
/** Helpers whose arguments are ruflo's argv (claude-flow-adapter.ts). */
const ARGV_HELPER = /\bcfCliArgs\(/g;
/** Calls naming the ruflo MCP tool they run through `ruflo mcp exec`. */
const TOOL_CALL = /\b(?:runRufloTool|rufloToolArgv|this\.tool)\(/g;
/** Flags added to an argv after it was built are not checked. */
const ARGV_MUTATION = /\b[\w$]+(?:\.[\w$]+)*\.(?:push|unshift)\(\s*(['"`])--?[a-zA-Z]/g;
/** An UNVERIFIABLE finding is accepted only with this marker and a reason, on the call's lines or the line above. */
const ALLOW = /ruflo-argv-unverifiable:\s*\S.{9,}/;

/**
 * Literal values ruflo accepts for a flag; from `ruflo hooks build-agents --format yaml`
 * on 3.76.0 and 3.80.7: "Invalid value for --format: yaml. Must be one of: text, json, table".
 */
const FLAG_VALUES = { '--format': ['text', 'json', 'table'] };

/** Elements of a `.concat(...)` chained after the list that closed at `end`, as more argv elements. */
function concatElements(src, end) {
  const out = [];
  let at = end + 1;
  for (;;) {
    const m = /^\s*\.concat\(/.exec(src.slice(at));
    if (!m) return { elements: out, end: at - 1 };
    const { elements, end: close } = splitList(src, at + m[0].length);
    for (const arg of elements) {
      if (arg.startsWith('[') && arg.endsWith(']')) out.push(...splitList(arg, 1).elements);
      else out.push(`...${arg}`);
    }
    at = close + 1;
  }
}

function makeCall(content, start, end, argv) {
  const startLine = lineAt(content, start);
  return { line: startLine, endLine: lineAt(content, end), text: argv.join(' '), tokens: argvTokens(argv) };
}

/**
 * ruflo argv lists in TypeScript/JavaScript source: arrays with `'--no-install', <pkg>`,
 * arrays that name a ruflo package spec (`['-y', RUFLO_PINNED_SPEC, ...]`,
 * `['ruflo', ...]`), arrays passed to the ruflo binary (`execFileSync('ruflo', [...])`),
 * `.concat(...)` chained onto any of these, and cfCliArgs(...) calls.
 * Returns { line, endLine, text, tokens } per call.
 */
export function extractArgvCalls(content) {
  const calls = [];
  const seen = new Set();
  const add = (start, open, pick) => {
    if (seen.has(open)) return;
    seen.add(open);
    const list = splitList(content, open);
    const argv = pick(list.elements);
    if (argv === null) return;
    const more = concatElements(content, list.end);
    calls.push(makeCall(content, start, more.end, [...argv, ...more.elements]));
  };
  for (const m of content.matchAll(DIRECT_BIN)) {
    add(m.index, m.index + m[0].length, (els) => els);
  }
  for (const m of content.matchAll(NO_INSTALL_ARRAY)) {
    const open = content.lastIndexOf('[', m.index) + 1;
    add(m.index, open, (els) => {
      const at = els.findIndex((el) => literalText(el) === '--no-install');
      return at === -1 ? null : els.slice(at + 2); // els[at + 1] is the package
    });
  }
  for (const m of content.matchAll(SPEC_ARRAY)) {
    add(m.index, m.index + 1, (els) => {
      const at = els.findIndex(isSpec);
      if (at === -1 || els.every(isSpec)) return null; // a list of package names
      const argv = els.slice(at + 1);
      return argv.length === 0 ? null : argv;
    });
  }
  for (const m of content.matchAll(ARGV_HELPER)) {
    const lineStart = content.lastIndexOf('\n', m.index) + 1;
    if (/^\s*(?:export\s+)?function\b/.test(content.slice(lineStart, m.index))) continue; // the definition
    add(m.index, m.index + m[0].length, (els) => els);
  }
  return calls.sort((a, b) => a.line - b.line);
}

/** MCP tools `content` runs through `ruflo mcp exec`: [{ line, tool }] (tool null when not a literal). */
export function extractToolCalls(content) {
  const out = [];
  for (const m of content.matchAll(TOOL_CALL)) {
    const lineStart = content.lastIndexOf('\n', m.index) + 1;
    if (/\bfunction\s*$|\bfunction\s+\w*$/.test(content.slice(lineStart, m.index))) continue;
    const [first] = splitList(content, m.index + m[0].length).elements;
    out.push({ line: lineAt(content, m.index), tool: first === undefined ? null : literalText(first) });
  }
  return out;
}

/**
 * Check one argv (tokens from extractArgvCalls) against the snapshot. Like checkCall, and:
 * - a command path that is not all literal words is UNVERIFIABLE, and so is a spread of a
 *   variable anywhere (either can hide any subcommand or flag);
 * - an unquoted word after a command with no subcommands is reported: ruflo ignores it,
 *   as `hooks intelligence trajectory-start` showed (#1455);
 * - literal values of flags in FLAG_VALUES, and `mcp exec --tool <literal>`, are checked.
 */
export function checkArgvCall(tokens, surface) {
  if (tokens.some((t) => t.unverifiable)) {
    return `UNVERIFIABLE: ${tokens.find((t) => t.unverifiable).text} can add any subcommand or flag`;
  }
  let node = { subcommands: surface.commands };
  const path = [];
  let k = 0;
  for (; k < tokens.length; k++) {
    const t = tokens[k];
    const subs = node.subcommands && Object.keys(node.subcommands).length > 0 ? node.subcommands : null;
    if (t.quoted) {
      if (subs) return `UNVERIFIABLE: the command path${path.length ? ` after '${path.join(' ')}'` : ''} is not a literal (${t.text})`;
      break; // a positional value after a leaf command
    }
    if (!looksLikeWord(t)) break;
    if (!subs) return `'${path.join(' ')}' has no subcommand '${t.text}'`;
    const name = node.aliases?.[t.text] ?? t.text;
    if (!subs[name]) break; // checkCall reports it
    node = subs[name];
    path.push(name);
  }
  const base = checkCall(tokens, surface);
  if (base) return base;
  for (let i = k; i < tokens.length - 1; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];
    if (next.quoted) continue;
    const allowed = FLAG_VALUES[t.text];
    if (allowed && !allowed.includes(next.text)) return `${t.text} must be one of ${allowed.join(', ')}, not '${next.text}'`;
    if (path.join(' ') === 'mcp exec' && (t.text === '--tool' || t.text === '-t')) {
      if (!Array.isArray(surface.mcpTools)) return 'the snapshot has no mcpTools list';
      if (!surface.mcpTools.includes(next.text)) return `unknown MCP tool '${next.text}'`;
    }
  }
  return null;
}

/** All invalid ruflo argv lists and MCP tool names in `content`: [{ line, text, reason }]. */
export function findInvalidArgvCalls(content, surface) {
  const lines = content.split('\n');
  const allowed = (from, to) => lines.slice(Math.max(0, from - 2), to).some((l) => ALLOW.test(l));
  const invalid = [];
  const report = (line, endLine, text, reason) => {
    if (reason.startsWith('UNVERIFIABLE') && allowed(line, endLine)) return;
    invalid.push({ line, text, reason });
  };
  const calls = extractArgvCalls(content);
  for (const c of calls) {
    const reason = checkArgvCall(c.tokens, surface);
    if (reason) report(c.line, c.endLine, c.text, reason);
  }
  for (const { line, tool } of extractToolCalls(content)) {
    if (tool === null) report(line, line, '(tool name)', 'UNVERIFIABLE: the MCP tool name is not a literal');
    else if (!Array.isArray(surface.mcpTools)) report(line, line, tool, 'the snapshot has no mcpTools list');
    else if (!surface.mcpTools.includes(tool)) report(line, line, tool, `unknown MCP tool '${tool}'`);
  }
  if (calls.length > 0) {
    for (const m of content.matchAll(ARGV_MUTATION)) {
      const line = lineAt(content, m.index);
      report(line, line, lines[line - 1].trim(), 'UNVERIFIABLE: flag added with push()/unshift() is not checked; put it in the argv list');
    }
  }
  return invalid.sort((a, b) => a.line - b.line);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, bin] = process.argv.slice(2);
  if (cmd !== 'snapshot' || !bin) {
    console.error('usage: node scripts/ruflo-cli-surface.mjs snapshot <path-to-ruflo-bin>');
    process.exit(2);
  }
  process.stdout.write(`${JSON.stringify(snapshot(bin), null, 2)}\n`);
}
