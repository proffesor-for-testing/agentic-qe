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
 * The snapshot is built from `--help` output only: every command listed in the top-level
 * help, plus the hidden commands named in HIDDEN_COMMANDS, their SUBCOMMANDS and OPTIONS.
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Commands that exist but are not listed in `ruflo --help`. */
export const HIDDEN_COMMANDS = ['verify'];

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

/** Names in a `SUBCOMMANDS:` / `... COMMANDS:` block, including `(alias)` suffixes. */
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

function runHelp(bin, args) {
  const r = spawnSync(bin, [...args, '--help'], {
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  return `${r.stdout ?? ''}${r.stderr ?? ''}`;
}

function describeNode(bin, path, depth) {
  const text = runHelp(bin, path);
  if (/Unknown command/i.test(text)) return null;
  const s = sections(text);
  const node = { flags: parseFlags(s.OPTIONS ?? []) };
  const subs = parseCommandList(s.SUBCOMMANDS ?? []);
  if (subs.length > 0 && depth < 3) {
    node.subcommands = {};
    node.aliases = {};
    for (const entry of subs) {
      const [name, target] = entry.split('=');
      if (target) {
        node.aliases[name] = target;
        continue;
      }
      const child = describeNode(bin, [...path, name], depth + 1);
      if (child) node.subcommands[name] = child;
    }
    if (Object.keys(node.aliases).length === 0) delete node.aliases;
  }
  return node;
}

export function snapshot(bin) {
  const top = runHelp(bin, []);
  const version = /ruflo v(\d+\.\d+\.\d+)/.exec(top.replace(ANSI, ''))?.[1];
  if (!version) throw new Error(`could not read the ruflo version from ${bin} --help`);
  const s = sections(top);
  const names = new Set(HIDDEN_COMMANDS);
  for (const [title, lines] of Object.entries(s)) {
    if (/COMMANDS$/.test(title)) for (const n of parseCommandList(lines)) names.add(n.split('=')[0]);
  }
  const commands = {};
  for (const name of [...names].sort()) {
    const node = describeNode(bin, [name], 1);
    if (node) commands[name] = node;
  }
  return { tool: 'ruflo', version, globalFlags: parseFlags(s['GLOBAL OPTIONS'] ?? []), commands };
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
  const push = () => {
    if (cur !== '' || quotedToken) tokens.push({ text: cur, quoted: quotedToken });
    cur = '';
    quotedToken = false;
  };
  while (i < rest.length) {
    const c = rest[i];
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
 * Every `ruflo@<version> ...` call in `content`, with `\` line continuations joined.
 * Returns { line, text, tokens } per call.
 */
export function extractCalls(content, version) {
  const spec = `ruflo@${version}`;
  const lines = content.split(/\r?\n/);
  const calls = [];
  lines.forEach((line, idx) => {
    let from = 0;
    for (;;) {
      const at = line.indexOf(spec, from);
      if (at === -1) break;
      from = at + spec.length;
      if (/[\w.-]/.test(line[from] ?? '')) continue; // ruflo@3.76.01 etc.
      let rest = line.slice(from);
      let j = idx;
      while (/\\\s*$/.test(rest) && j + 1 < lines.length) {
        j++;
        rest = `${rest.replace(/\\\s*$/, ' ')} ${lines[j].trim()}`;
      }
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
    const bad = tokens.filter((t) => !t.quoted && /^--?[a-zA-Z]/.test(t.text)).map((t) => t.text.split('=')[0]);
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
      // A command with subcommands that also takes a positional (e.g. `hive-mind spawn "task"`)
      // is only an error when the word cannot be an argument.
      if (Object.keys(node.subcommands).length > 0 && path.length === 1) {
        return `unknown subcommand '${path.join(' ')} ${t.text}'`;
      }
      break;
    }
    node = child;
    path.push(name);
    k++;
  }
  const known = new Set([...node.flags, ...surface.globalFlags]);
  const unknown = [];
  for (const t of tokens.slice(k)) {
    if (t.quoted || !/^--?[a-zA-Z]/.test(t.text)) continue;
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, bin] = process.argv.slice(2);
  if (cmd !== 'snapshot' || !bin) {
    console.error('usage: node scripts/ruflo-cli-surface.mjs snapshot <path-to-ruflo-bin>');
    process.exit(2);
  }
  process.stdout.write(`${JSON.stringify(snapshot(bin), null, 2)}\n`);
}
