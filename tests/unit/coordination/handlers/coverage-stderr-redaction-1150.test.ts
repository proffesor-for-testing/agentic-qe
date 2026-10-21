/**
 * #1150: the coverage runner kept the first error line and the last ~2 KB of
 * the test runner's raw stderr and put them in provenance.notes of a SUCCESS
 * result, where the #1139 error backstop never sees them. A connection string
 * or token printed by the tests reached the MCP response. Stderr is now
 * redacted before it is sliced, so a secret cut by the slice boundary does
 * not leak its remainder either. Uses real processes (no mocks).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describeRunFailure, runProcessTree, summarizeStderr } from '../../../../src/coordination/handlers/coverage-runner';

const isWindows = process.platform === 'win32';
const TOKEN = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';
const TOKEN_END = 'M3n4O5p6Q7r8';
const PASSWORD = 'Sup3rS3cretPw';
const URL = `postgres://admin:${PASSWORD}@db.internal:5432/app`;

describe.skipIf(isWindows)('coverage runner stderr is redacted before it is sliced (#1150)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1150-')));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** Run a node script as the "runner" and return its summarised stderr. */
  async function stderrOf(script: string): Promise<string> {
    const file = path.join(dir, 'runner.cjs');
    fs.writeFileSync(file, script);
    const result = await runProcessTree(process.execPath, [file], { cwd: dir, timeoutMs: 10000 });
    expect(result.exitCode).toBe(1);
    return result.stderrTail;
  }

  it('redacts a connection string in short stderr', async () => {
    const tail = await stderrOf(`process.stderr.write(${JSON.stringify(`Error: connect failed for ${URL}\n`)}); process.exit(1);`);

    expect(tail).toContain('Error: connect failed');
    expect(tail).not.toContain(PASSWORD);
  });

  it('leaves no part of a token that the 2 KB tail boundary cuts through', async () => {
    // The last 2048 characters start 8 characters into the token.
    const tailPart = `Error: connect failed for ${URL}\n` + '.'.repeat(1500) + '\nend\n';
    const fill = 2048 - (TOKEN.length - 8) - 1 - tailPart.length;
    const text = 'x'.repeat(3000) + '\n' + TOKEN + '\n' + 'y'.repeat(fill) + tailPart;
    const tail = await stderrOf(`process.stderr.write(${JSON.stringify(text)}); process.exit(1);`);

    expect(tail).toMatch(/end$/);
    expect(tail).not.toContain(TOKEN_END);
    expect(tail).not.toContain(PASSWORD);
  });

  it('leaves no part of a token that the 512-byte head prefix cuts through', async () => {
    // No line looks like an error, so the head prefix is the first 512 bytes,
    // and a token straddles that boundary; a long stack follows.
    const text = 'h'.repeat(512 - 11) + ' ' + TOKEN + '\n' + 'z'.repeat(8000) + '\nend\n';
    const tail = await stderrOf(`process.stderr.write(${JSON.stringify(text)}); process.exit(1);`);

    expect(tail.startsWith('hhh')).toBe(true);
    expect(tail).toMatch(/end$/);
    expect(tail).not.toContain(TOKEN.slice(0, 10));
  });

  it('keeps the note that reaches provenance.notes free of the secret', async () => {
    const stderrTail = await stderrOf(`process.stderr.write(${JSON.stringify(`Error: ${URL} token=${TOKEN}\n`)}); process.exit(1);`);
    const note = describeRunFailure({
      runner: 'vitest', exitCode: 1, exitedCleanly: false, timedOut: false, missing: false,
      timeoutMs: 1000, data: null, numTotalTests: null, stderrTail,
    }, dir);

    expect(note).toContain('exited with code 1');
    expect(note).not.toContain(PASSWORD);
    expect(note).not.toContain(TOKEN_END);
  });

  it('summarizeStderr redacts both windows before slicing them', () => {
    const head = `Error: ${URL}\n` + 'a'.repeat(5000);
    const tail = 'b'.repeat(5000) + `\ntoken ${TOKEN}\n`;
    const out = summarizeStderr(head, tail, 200_000);

    expect(out.startsWith('Error: ')).toBe(true);
    expect(out).not.toContain(PASSWORD);
    expect(out).not.toContain(TOKEN_END);
  });
});
