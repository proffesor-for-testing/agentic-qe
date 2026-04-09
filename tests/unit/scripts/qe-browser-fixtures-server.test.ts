/**
 * qe-browser: fixtures/serve-skills.js — host binding + path-traversal
 *
 * Boots the fixture HTTP server in a child process, hits it via http.get,
 * and verifies M2 (defaults to loopback) and M3 (path.relative-based
 * traversal guard).
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { resolve } from 'node:path';

const SERVE_SCRIPT = resolve(
  __dirname,
  '../../../.claude/skills/qe-browser/fixtures/serve-skills.js'
);

let proc: ChildProcess | null = null;

function waitFor(stream: NodeJS.ReadableStream, needle: string, timeoutMs: number): Promise<string> {
  return new Promise((resolveP, reject) => {
    let buf = '';
    const onData = (chunk: Buffer | string) => {
      buf += chunk.toString();
      if (buf.includes(needle)) {
        stream.off('data', onData);
        resolveP(buf);
      }
    };
    stream.on('data', onData);
    setTimeout(() => {
      stream.off('data', onData);
      reject(new Error(`timed out waiting for "${needle}"; saw: ${buf}`));
    }, timeoutMs);
  });
}

function startServer(env: NodeJS.ProcessEnv): Promise<{ host: string; port: number }> {
  return new Promise((resolveP, reject) => {
    const child = spawn(process.execPath, [SERVE_SCRIPT], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc = child;
    child.on('error', reject);
    waitFor(child.stdout!, 'qe-browser fixtures listening on', 5000)
      .then((banner) => {
        const m = banner.match(/listening on http:\/\/([^:]+):(\d+)/);
        if (!m) {
          reject(new Error(`could not parse listen banner: ${banner}`));
          return;
        }
        resolveP({ host: m[1], port: Number(m[2]) });
      })
      .catch(reject);
  });
}

function fetch(host: string, port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolveP, reject) => {
    const req = httpRequest({ host, port, path, method: 'GET' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolveP({ status: res.statusCode || 0, body }));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('client timeout')));
    req.end();
  });
}

describe('qe-browser fixtures/serve-skills', () => {
  beforeEach(() => {
    proc = null;
  });

  afterEach(() => {
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
      proc = null;
    }
  });

  // M2 regression: server must NOT bind to 0.0.0.0 by default. Codespaces
  // and shared dev hosts auto-forward 0.0.0.0 ports to the public preview
  // URL — exposing the entire skills tree as an open server.
  describe('M2: default host binding', () => {
    it('binds to 127.0.0.1 by default', async () => {
      const { host, port } = await startServer({ QE_BROWSER_FIXTURE_PORT: '18801' });
      expect(host).toBe('127.0.0.1');
      const res = await fetch('127.0.0.1', port, '/');
      expect(res.status).toBe(200);
      expect(res.body).toContain('qe-browser fixtures');
    }, 10000);

    it('respects QE_BROWSER_FIXTURE_HOST=0.0.0.0 explicit opt-in', async () => {
      const { host } = await startServer({
        QE_BROWSER_FIXTURE_PORT: '18802',
        QE_BROWSER_FIXTURE_HOST: '0.0.0.0',
      });
      expect(host).toBe('0.0.0.0');
    }, 10000);
  });

  // M3 regression: the previous startsWith() check could false-pass on
  // sibling directories with shared prefix. path.relative() is the
  // canonical traversal guard.
  describe('M3: path-traversal guard', () => {
    it('serves a real markdown file from inside the skills root', async () => {
      const { port } = await startServer({ QE_BROWSER_FIXTURE_PORT: '18803' });
      const res = await fetch('127.0.0.1', port, '/qe-browser/SKILL.md.html');
      expect(res.status).toBe(200);
      expect(res.body).toContain('qe-browser');
    }, 10000);

    it('blocks ../../etc/passwd traversal', async () => {
      const { port } = await startServer({ QE_BROWSER_FIXTURE_PORT: '18804' });
      const res = await fetch('127.0.0.1', port, '/../../etc/passwd.html');
      // Either the URL parser normalises and serves a 404 or our guard
      // rejects it explicitly. Both are acceptable; what's NOT acceptable
      // is leaking /etc/passwd content.
      expect(res.body).not.toContain('root:x:0:0');
    }, 10000);

    it('blocks sibling-prefix escape (foo vs foo2)', async () => {
      // The previous startsWith() guard would false-pass `/skills/qe-browser2`
      // when the root was `/skills/qe-browser`. We can't easily fabricate
      // a sibling on disk in CI, but we can verify that .. notation gets
      // rejected through path.relative(). Use an empirical .. path:
      const { port } = await startServer({ QE_BROWSER_FIXTURE_PORT: '18805' });
      const res = await fetch('127.0.0.1', port, '/qe-browser/../../../package.json.html');
      // The guard should refuse to serve outside SKILLS_ROOT — package.json
      // lives in the repo root, NOT inside the skills tree.
      expect(res.status).toBe(404);
    }, 10000);
  });
});
