/**
 * ruflo argv lists in source code (#1455), for scripts/ruflo-cli-surface.mjs (which
 * re-exports these functions). Finds the argv lists src/ code passes to ruflo and checks
 * them against the committed `--help` snapshot with the rules of the #1417 checker plus:
 * literal command paths, MCP tool names, flag values, and UNVERIFIABLE findings for argv a
 * variable can extend (accepted only with a `ruflo-argv-unverifiable: <reason>` comment).
 */
import { checkCall, extractCalls, looksLikeWord } from './ruflo-cli-surface.mjs';

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
const SPEC_IDENTIFIERS = new Set(['RUFLO_PINNED_SPEC', 'cliPkg']);
const isSpec = (el) => {
  const text = literalText(el);
  return text !== null ? RUFLO_SPEC.test(text) : SPEC_IDENTIFIERS.has(el);
};

/** `[..., '--no-install', <pkg>, ...]`: the package is resolved at run time. */
const NO_INSTALL_ARRAY = /(['"`])--no-install\1\s*,/g;
/** An array that may name a ruflo package spec (checked element by element). */
const SPEC_ARRAY = /\[\s*(?=(?:(['"`])-[\w-]*\1\s*,\s*)*(?:(['"`])(?:ruflo|claude-flow|@claude-flow\/cli)(?:@[\w.-]+)?\2|RUFLO_PINNED_SPEC|cliPkg)\s*[,\]])/g;
/** The ruflo binary run directly: `execFileSync('ruflo', [...])`. */
const DIRECT_BIN = /\b(?:execFileSync|execFile|spawnSync|spawn|execaSync|execa)\(\s*(['"`])(?:ruflo|claude-flow)\1\s*,\s*\[/g;
/** Helpers whose arguments are ruflo's argv (claude-flow-adapter.ts). */
const ARGV_HELPER = /\bcfCliArgs\(/g;
/** Calls naming the ruflo MCP tool they run through `ruflo mcp exec`. */
const TOOL_CALL = /\b(?:runRufloTool|rufloToolArgv|this\.tool)\(/g;
/** Flags added to an argv after it was built are not checked: push/unshift/splice, `argv[i] = '--x'`. */
const ARGV_MUTATION =
  /\b[\w$]+(?:\.[\w$]+)*(?:\.(?:push|unshift)\(\s*|\.splice\([^)]*?|\[\s*[\w$]+\s*\]\s*=\s*)(['"`])--?[a-zA-Z]/g;
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
  const cut = tokens.findIndex((t) => t.unverifiable);
  if (cut !== -1) {
    // The literal part before the spread must be valid on its own; only then is the
    // call UNVERIFIABLE (which a marker may accept).
    const prefix = checkArgvCall(tokens.slice(0, cut), surface);
    return prefix ?? `UNVERIFIABLE: ${tokens[cut].text} can add any subcommand or flag`;
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
  // Flag values: `--flag value` with a literal value, or `--flag=value`.
  const pairs = [];
  for (let i = k; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.quoted || !/^--?[a-zA-Z]/.test(t.text)) continue;
    const eq = t.text.indexOf('=');
    if (eq !== -1) pairs.push([t.text.slice(0, eq), t.text.slice(eq + 1)]);
    else if (tokens[i + 1] && !tokens[i + 1].quoted) pairs.push([t.text, tokens[i + 1].text]);
  }
  for (const [flag, value] of pairs) {
    const allowed = FLAG_VALUES[flag];
    if (allowed && !allowed.includes(value)) return `${flag} must be one of ${allowed.join(', ')}, not '${value}'`;
    if (path.join(' ') === 'mcp exec' && (flag === '--tool' || flag === '-t')) {
      if (!Array.isArray(surface.mcpTools)) return 'the snapshot has no mcpTools list';
      if (!surface.mcpTools.includes(value)) return `unknown MCP tool '${value}'`;
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
  // Command strings in code (`execSync(\`npx --no-install ruflo ...\`)`, `npx ${RUFLO_PINNED_SPEC} ...`),
  // checked with the argv rules (the #1417 text check accepts a word after a leaf command).
  const pinned = content.replaceAll('${RUFLO_PINNED_SPEC}', `ruflo@${surface.version}`);
  for (const c of extractCalls(pinned, surface.version)) {
    const reason = checkArgvCall(c.tokens, surface);
    if (reason) report(c.line, c.line, c.text, reason);
  }
  for (const { line, tool } of extractToolCalls(content)) {
    if (tool === null) report(line, line, '(tool name)', 'UNVERIFIABLE: the MCP tool name is not a literal');
    else if (!Array.isArray(surface.mcpTools)) report(line, line, tool, 'the snapshot has no mcpTools list');
    else if (!surface.mcpTools.includes(tool)) report(line, line, tool, `unknown MCP tool '${tool}'`);
  }
  if (calls.length > 0) {
    for (const m of content.matchAll(ARGV_MUTATION)) {
      const line = lineAt(content, m.index);
      report(line, line, lines[line - 1].trim(), 'UNVERIFIABLE: flag added with push()/unshift()/splice() or by index is not checked; put it in the argv list');
    }
  }
  return invalid.sort((a, b) => a.line - b.line);
}

