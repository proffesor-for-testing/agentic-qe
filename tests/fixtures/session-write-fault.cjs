// Explicit --require preload for tests/integration/mcp/session-journal-stdio.test.ts.
// Adapted from Rudy Celekli's #956. It touches only the session journals under
// the child's own AQE_JOURNAL_FAULT_ROOT, and only once a journal already has
// content (the first, synchronous write always succeeds).
//
// AQE_JOURNAL_FAULT_MODE:
//   partial    (default) the first batch write puts half its bytes on disk, the
//              next write throws ENOSPC, and every later write succeeds.
//   persistent every batch write throws ENOSPC: a disk that stays full.
const fs = require('node:fs');
const path = require('node:path');

const root = process.env.AQE_JOURNAL_FAULT_ROOT;
if (!root) throw new Error('Owned journal fault root is required');
const mode = process.env.AQE_JOURNAL_FAULT_MODE || 'partial';
const directory = path.join(path.resolve(root), '.agentic-qe', 'sessions');
const original = { openSync: fs.openSync, closeSync: fs.closeSync, writeSync: fs.writeSync };
const descriptors = new Set();
let phase = 0;
let announced = false;

const owned = file => typeof file === 'string' && path.dirname(path.resolve(file)) === directory && file.endsWith('.jsonl');
const fail = () => {
  // The MCP entry filters stderr; "[AQE]" passes the filter.
  if (!announced) process.stderr.write(`[AQE] TEST journal fault injected (${mode})\n`);
  announced = true;
  throw Object.assign(new Error(`ENOSPC: owned journal ${mode}-write injection`), { code: 'ENOSPC' });
};

fs.openSync = function (file, ...args) {
  const fd = original.openSync.call(fs, file, ...args);
  if (owned(file) && fs.fstatSync(fd).size > 0) descriptors.add(fd);
  return fd;
};
fs.closeSync = function (fd) {
  try { return original.closeSync.call(fs, fd); } finally { descriptors.delete(fd); }
};
fs.writeSync = function (fd, data, offset, length, ...rest) {
  if (descriptors.has(fd)) {
    if (mode === 'persistent') return fail();
    if (phase === 0) {
      phase = 1;
      return original.writeSync.call(fs, fd, data, offset, Math.max(1, Math.floor(length / 2)), ...rest);
    }
    if (phase === 1) { phase = 2; return fail(); }
  }
  return original.writeSync.call(fs, fd, data, offset, length, ...rest);
};

require('node:module').syncBuiltinESMExports();
