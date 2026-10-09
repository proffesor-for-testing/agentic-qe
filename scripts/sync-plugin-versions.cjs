#!/usr/bin/env node
/**
 * Keep the Claude Code plugin surfaces in lock-step with package.json.
 *
 * package.json "version" is the single source of truth. This script writes it to:
 *   - .claude-plugin/plugin.json                      (repo-root plugin manifest)
 *   - .claude-plugin/plugin.json mcpServers pin       (agentic-qe@<version>)
 *   - plugins/agentic-qe-fleet/.claude-plugin/plugin.json
 *   - plugins/agentic-qe-fleet/.mcp.json pin          (agentic-qe@<version>)
 *
 * It runs automatically as the npm "version" lifecycle script, so
 * `npm version <x.y.z> --no-git-tag-version` (release skill step 3) bumps
 * every plugin surface too.
 *
 *   node scripts/sync-plugin-versions.cjs          # write
 *   node scripts/sync-plugin-versions.cjs --check  # exit 1 on drift, write nothing
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PIN_RE = /^agentic-qe@(.+)$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Files whose top-level "version" must equal package.json. */
const VERSION_FILES = [
  '.claude-plugin/plugin.json',
  'plugins/agentic-qe-fleet/.claude-plugin/plugin.json',
];

/** Files whose mcpServers["agentic-qe"].args must pin agentic-qe@<version>. */
const PIN_FILES = [
  '.claude-plugin/plugin.json',
  'plugins/agentic-qe-fleet/.mcp.json',
];

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function writeJson(rel, data) {
  fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(data, null, 2) + '\n');
}

/** Returns the index of the agentic-qe@<x> arg, or -1. */
function pinIndex(server) {
  const args = Array.isArray(server && server.args) ? server.args : [];
  return args.findIndex((a) => typeof a === 'string' && PIN_RE.test(a));
}

function syncFile(rel, version, problems) {
  const data = readJson(rel);
  let changed = false;

  if (VERSION_FILES.includes(rel) && data.version !== version) {
    problems.push(`${rel}: version ${JSON.stringify(data.version)} != ${version}`);
    data.version = version;
    changed = true;
  }

  if (PIN_FILES.includes(rel)) {
    const server = data.mcpServers && data.mcpServers['agentic-qe'];
    const idx = pinIndex(server);
    if (idx < 0) {
      // Cannot repair structurally broken config automatically.
      problems.push(`${rel}: mcpServers["agentic-qe"].args has no agentic-qe@<version> pin`);
      return { changed, fatal: true, data };
    }
    const want = `agentic-qe@${version}`;
    if (server.args[idx] !== want) {
      problems.push(`${rel}: pin ${server.args[idx]} != ${want}`);
      server.args[idx] = want;
      changed = true;
    }
  }
  return { changed, fatal: false, data };
}

function main() {
  const check = process.argv.includes('--check');
  const version = readJson('package.json').version;
  if (typeof version !== 'string' || !SEMVER_RE.test(version)) {
    console.error(`sync-plugin-versions: invalid package.json version ${JSON.stringify(version)}`);
    process.exit(1);
  }

  const files = [...new Set([...VERSION_FILES, ...PIN_FILES])];
  const problems = [];
  let fatal = false;
  for (const rel of files) {
    const res = syncFile(rel, version, problems);
    fatal = fatal || res.fatal;
    if (res.changed && !check) writeJson(rel, res.data);
  }

  if (check) {
    if (problems.length) {
      console.error(`Plugin version drift (package.json = ${version}):`);
      for (const p of problems) console.error(`  - ${p}`);
      console.error('Fix: node scripts/sync-plugin-versions.cjs');
      process.exit(1);
    }
    console.log(`Plugin versions in sync with package.json (${version})`);
    return;
  }

  for (const p of problems) console.log(`synced: ${p}`);
  if (fatal) process.exit(1);
  if (!problems.length) console.log(`Plugin versions already at ${version}`);
}

main();
