#!/usr/bin/env node
/**
 * Ruflo Session Manager
 * Handles session lifecycle: start, restore, end
 *
 * Local patch (agentic-qe#837): current.json lives in the opened project and
 * is untrusted. Its contents must never decide where this helper writes, so
 * the archive name is validated, symlinks are never written through, and the
 * session directory must resolve inside the project.
 */

const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.join(process.cwd(), '.claude-flow', 'sessions');
const SESSION_FILE = path.join(SESSION_DIR, 'current.json');
const SESSION_ID = /^session-\d+$/;

/** Read current.json; a symlink, non-file or corrupt JSON counts as no session. */
function readSession() {
  let stat;
  try { stat = fs.lstatSync(SESSION_FILE); } catch { return null; }
  if (!stat.isFile()) return null;
  try {
    const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
    return session && typeof session === 'object' ? session : null;
  } catch {
    return null;
  }
}

/** The session directory must resolve inside the project (no symlinked escape). */
function assertSessionDirContained() {
  const root = fs.realpathSync(process.cwd());
  const relative = path.relative(root, fs.realpathSync(SESSION_DIR));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Session directory resolves outside the project');
  }
}

/** Write via an exclusive temp file and rename, which replaces a symlink instead of following it. */
function writeFile(file, data) {
  assertSessionDirContained();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data, { flag: 'wx' });
  fs.renameSync(tmp, file);
}

const commands = {
  start: () => {
    const sessionId = `session-${Date.now()}`;
    const session = {
      id: sessionId,
      startedAt: new Date().toISOString(),
      cwd: process.cwd(),
      context: {},
      metrics: {
        edits: 0,
        commands: 0,
        tasks: 0,
        errors: 0,
      },
    };

    fs.mkdirSync(SESSION_DIR, { recursive: true });
    writeFile(SESSION_FILE, JSON.stringify(session, null, 2));

    console.log(`Session started: ${sessionId}`);
    return session;
  },

  restore: () => {
    const session = readSession();
    if (!session) {
      console.log('No session to restore');
      return null;
    }

    session.restoredAt = new Date().toISOString();
    writeFile(SESSION_FILE, JSON.stringify(session, null, 2));

    console.log(`Session restored: ${session.id}`);
    return session;
  },

  end: () => {
    const session = readSession();
    if (!session) {
      console.log('No active session');
      return null;
    }

    session.endedAt = new Date().toISOString();
    session.duration = Date.now() - new Date(session.startedAt).getTime();

    // Archive session under a validated name only; a crafted id cannot pick the path.
    const archiveId = SESSION_ID.test(String(session.id)) ? session.id : `session-${Date.now()}`;
    writeFile(path.join(SESSION_DIR, `${archiveId}.json`), JSON.stringify(session, null, 2));
    fs.unlinkSync(SESSION_FILE);

    console.log(`Session ended: ${archiveId}`);
    console.log(`Duration: ${Math.round(session.duration / 1000 / 60)} minutes`);
    console.log(`Metrics: ${JSON.stringify(session.metrics)}`);

    return session;
  },

  status: () => {
    const session = readSession();
    if (!session) {
      console.log('No active session');
      return null;
    }

    const duration = Date.now() - new Date(session.startedAt).getTime();

    console.log(`Session: ${session.id}`);
    console.log(`Started: ${session.startedAt}`);
    console.log(`Duration: ${Math.round(duration / 1000 / 60)} minutes`);
    console.log(`Metrics: ${JSON.stringify(session.metrics)}`);

    return session;
  },

  update: (key, value) => {
    const session = readSession();
    if (!session) {
      console.log('No active session');
      return null;
    }

    if (!session.context || typeof session.context !== 'object') session.context = {};
    session.context[key] = value;
    session.updatedAt = new Date().toISOString();
    writeFile(SESSION_FILE, JSON.stringify(session, null, 2));

    return session;
  },

  metric: (name) => {
    const session = readSession();
    if (!session) {
      return null;
    }

    if (session.metrics && typeof session.metrics[name] === 'number') {
      session.metrics[name]++;
      writeFile(SESSION_FILE, JSON.stringify(session, null, 2));
    }

    return session;
  },
};

// CLI — only when run directly, never when require()d by hook-handler.cjs.
if (require.main === module) {
  const [,, command, ...args] = process.argv;

  if (command && commands[command]) {
    commands[command](...args);
  } else {
    console.log('Usage: session.cjs <start|restore|end|status|update|metric> [args]');
  }
}

module.exports = commands;
