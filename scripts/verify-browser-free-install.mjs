#!/usr/bin/env node
/** Verify a packed release with default npm lifecycle scripts and no browser opt-out. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const tarball = process.argv[2];
assert(tarball, 'Usage: node scripts/verify-browser-free-install.mjs <npm-pack.tgz>');
const root = mkdtempSync(join(tmpdir(), 'aqe-browser-free-'));
const prefix = join(root, 'prefix');
const project = join(root, 'project');
mkdirSync(project);
writeFileSync(join(project, 'package.json'), '{"name":"browser-free-consumer","version":"1.0.0"}');
const env = { ...process.env, npm_config_prefix: prefix, npm_config_cache: join(root, 'npm-cache'),
  XDG_CACHE_HOME: join(root, 'cache'), AQE_PROJECT_ROOT: project };
// The contract is the ordinary npm install, without either download suppression
// or lifecycle suppression. Vibium must not be in the installed dependency tree.
delete env.VIBIUM_SKIP_BROWSER_DOWNLOAD;
delete env.npm_config_ignore_scripts;
const run = (bin, args, options = {}) => execFileSync(bin, args, {
  cwd: project, env, encoding: 'utf8', timeout: 600000, maxBuffer: 16 * 1024 * 1024, ...options,
});
console.log(`Fresh consumer: ${root}`);
run('npm', ['install', '-g', '--prefix', prefix, resolve(tarball), '--foreground-scripts']);
let listing;
try { listing = run('npm', ['ls', '-g', '--prefix', prefix, 'vibium', '--json']); }
catch (error) { if (error.status !== 1) throw error; listing = error.stdout; }
const tree = JSON.parse(listing);
assert(!JSON.stringify(tree).includes('"vibium"'), 'Default install brought in Vibium');
assert(!existsSync(join(env.XDG_CACHE_HOME, 'vibium')), 'Default install created browser cache');
const pkg = join(prefix, 'lib', 'node_modules', 'agentic-qe');
const cli = join(pkg, 'dist', 'cli', 'bundle.js');
assert.match(run(process.execPath, [cli, '--version']), /\d+\.\d+\.\d+/);
const help = run(process.execPath, [cli, 'init', '--help']);
assert.match(help, /--browser-engine/);
assert.match(help, /--no-browser-engine/);
run(process.execPath, [cli, 'init', '--auto', '--no-database', '--skip-patterns', '--skip-code-index']);
assert(!existsSync(join(env.XDG_CACHE_HOME, 'vibium')), 'Default init downloaded browser');
await new Promise((resolveHandshake, reject) => {
  const child = spawn(process.execPath, [join(pkg, 'dist', 'mcp', 'bundle.js')], { cwd: project, env });
  let output = '';
  let errors = '';
  const timer = setTimeout(() => { child.kill(); reject(new Error(`MCP initialize timeout: ${errors}`)); }, 60000);
  child.stderr.on('data', data => { errors += data; });
  child.stdout.on('data', data => {
    output += data;
    for (const line of output.split('\n')) {
      try {
        const message = JSON.parse(line);
        if (message.id !== 1) continue;
        assert(message.result?.serverInfo, `MCP initialization failed: ${line}`);
        clearTimeout(timer); child.kill(); resolveHandshake();
      } catch (error) { if (error instanceof assert.AssertionError) { clearTimeout(timer); child.kill(); reject(error); } }
    }
  });
  child.on('error', error => { clearTimeout(timer); reject(error); });
  child.on('exit', code => { clearTimeout(timer); if (!output.includes('"serverInfo"')) reject(new Error(`MCP exited ${code}: ${errors}`)); });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'fresh-install-regression', version: '1.0.0' },
  } }) + '\n');
});
assert(!existsSync(join(env.XDG_CACHE_HOME, 'vibium')), 'MCP startup downloaded browser');
console.log('PASS: default npm install + aqe init + CLI + MCP initialize, no Vibium or browser download');
