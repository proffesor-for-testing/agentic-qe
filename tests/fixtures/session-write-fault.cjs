// Explicit --require fixture: touches only this child's owned journal paths.
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.AQE_JOURNAL_FAULT_ROOT;
if (!root) throw new Error('Owned journal fault root is required');
const directory = path.join(path.resolve(root), '.agentic-qe', 'sessions');
const original = { openSync: fs.openSync, closeSync: fs.closeSync, writeSync: fs.writeSync, appendFileSync: fs.appendFileSync };
const descriptors = new Map();
let phase = 0;
const owned = file => typeof file === 'string' && path.dirname(path.resolve(file)) === directory && file.endsWith('.jsonl');
const fail = () => {
  process.stderr.write('OWNED_SESSION_PARTIAL_WRITE_INJECTED\n');
  throw Object.assign(new Error('Owned journal partial-write injection'), { code: 'ENOSPC' });
};
fs.openSync = function(file, ...args) {
  const fd = original.openSync.call(fs, file, ...args);
  if (owned(file) && fs.fstatSync(fd).size > 0) descriptors.set(fd, file);
  return fd;
};
fs.closeSync = function(fd) { try { return original.closeSync.call(fs, fd); } finally { descriptors.delete(fd); } };
fs.writeSync = function(fd, data, offset, length, ...rest) {
  if (descriptors.has(fd) && phase === 0) {
    phase = 1;
    return original.writeSync.call(fs, fd, data, offset, Math.max(1, Math.floor(length / 2)), ...rest);
  }
  if (descriptors.has(fd) && phase === 1) { phase = 2; return fail(); }
  return original.writeSync.call(fs, fd, data, offset, length, ...rest);
};
fs.appendFileSync = function(file, data, ...args) {
  if (owned(file) && phase === 0 && fs.existsSync(file) && fs.statSync(file).size > 0) {
    phase = 2;
    const bytes = Buffer.from(data);
    original.appendFileSync.call(fs, file, bytes.subarray(0, Math.max(1, Math.floor(bytes.length / 2))), ...args);
    return fail();
  }
  return original.appendFileSync.call(fs, file, data, ...args);
};

require("node:module").syncBuiltinESMExports();
