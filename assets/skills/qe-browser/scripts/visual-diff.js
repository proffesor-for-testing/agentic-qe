#!/usr/bin/env node
// qe-browser: visual regression against stored PNG baselines.
//
// Usage:
//   node visual-diff.js --name homepage
//   node visual-diff.js --name homepage --threshold 0.02
//   node visual-diff.js --name hero --selector "#hero"
//   node visual-diff.js --name homepage --update-baseline
//
// Baselines live in .aqe/visual-baselines/<sanitized-name>.png
// Diff images (if pixelmatch available) go to .aqe/visual-baselines/<name>.diff.png

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { vibium, envelope, parseArgs, emit, fail } = require('./lib/vibium');

const BASELINE_DIR = path.join(process.cwd(), '.aqe', 'visual-baselines');

function sanitize(name) {
  return String(name).replace(/[^A-Za-z0-9_-]/g, '_');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// NOTE on `--selector` support:
//   Scoped-region screenshots require passing a CSS selector to `vibium
//   screenshot`. The current Vibium CLI reference documents `--full-page`
//   and `-o` but does NOT document a `--selector` flag (as of v26.3.x). We
//   forward it anyway — if Vibium supports it, great; if not, the spawn
//   exits non-zero and we surface the error cleanly. We do NOT fake a
//   fallback path here: silently substituting a full-page capture would
//   produce wrong baselines. If your Vibium version rejects `--selector`,
//   capture a full page screenshot and crop via `vibium eval` before
//   calling visual-diff (documented in references/assertion-kinds.md).
function captureScreenshot(selector, outputPath) {
  const args = ['screenshot', '-o', outputPath, '--full-page'];
  if (selector) {
    args.push('--selector', selector);
  }
  const res = vibium(args);
  if (res.status !== 0) {
    const stderr = res.stderr.trim();
    const stdout = res.stdout.trim();
    // Give selector-mode callers a clearer error so they don't wonder why
    // the fallback they expected isn't there.
    if (selector && /unknown flag|unrecognized|unexpected argument|--selector/i.test(stderr + stdout)) {
      throw new Error(
        `vibium screenshot --selector not supported in this Vibium version. ` +
        `Capture full page and crop in qe-browser skill script instead. Upstream: ${stderr || stdout}`
      );
    }
    throw new Error(`vibium screenshot failed: ${stderr || stdout}`);
  }
  if (!fs.existsSync(outputPath)) {
    throw new Error(`screenshot output not created: ${outputPath}`);
  }
  return outputPath;
}

function tryLoadPixelmatch() {
  try {
    const pixelmatch = require('pixelmatch');
    const { PNG } = require('pngjs');
    return { pixelmatch, PNG };
  } catch (_err) {
    return null;
  }
}

function parsePngSize(buffer) {
  // PNG header: 8 bytes signature + 8 bytes IHDR chunk length/type + 4 width + 4 height
  if (buffer.length < 24) return null;
  const sig = buffer.slice(0, 8);
  const expected = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!sig.equals(expected)) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function compareWithPixelmatch(baselineBuf, currentBuf, diffPath) {
  const mod = tryLoadPixelmatch();
  if (!mod) return null;
  const { pixelmatch, PNG } = mod;
  const baseline = PNG.sync.read(baselineBuf);
  const current = PNG.sync.read(currentBuf);
  if (baseline.width !== current.width || baseline.height !== current.height) {
    return {
      similarity: 0,
      diffPixelCount: Math.max(
        baseline.width * baseline.height,
        current.width * current.height
      ),
      width: current.width,
      height: current.height,
      sizeMismatch: true,
    };
  }
  const { width, height } = baseline;
  const diff = new PNG({ width, height });
  const diffCount = pixelmatch(baseline.data, current.data, diff.data, width, height, {
    threshold: 0.1,
  });
  if (diffPath) {
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
  }
  const totalPixels = width * height;
  return {
    similarity: 1 - diffCount / totalPixels,
    diffPixelCount: diffCount,
    width,
    height,
    sizeMismatch: false,
  };
}

function compareFallback(baselineBuf, currentBuf) {
  // Exact-match fallback when pixelmatch is not installed.
  // Same hash = identical; otherwise we only know width/height and rough similarity from byte diff.
  const bSize = parsePngSize(baselineBuf);
  const cSize = parsePngSize(currentBuf);
  if (!bSize || !cSize) {
    return {
      similarity: 0,
      diffPixelCount: 0,
      width: cSize ? cSize.width : 0,
      height: cSize ? cSize.height : 0,
      sizeMismatch: true,
      note: 'pixelmatch not installed and PNG header unreadable',
    };
  }
  if (bSize.width !== cSize.width || bSize.height !== cSize.height) {
    return {
      similarity: 0,
      diffPixelCount: 0,
      width: cSize.width,
      height: cSize.height,
      sizeMismatch: true,
      note: 'pixelmatch not installed; size mismatch',
    };
  }
  const same = hashBuffer(baselineBuf) === hashBuffer(currentBuf);
  return {
    similarity: same ? 1 : 0,
    diffPixelCount: same ? 0 : bSize.width * bSize.height,
    width: cSize.width,
    height: cSize.height,
    sizeMismatch: false,
    note: same ? undefined : 'pixelmatch not installed; exact-hash fallback reports 0 similarity',
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = args.name;
  if (!name) return fail('visual-diff', 'missing --name argument');

  const threshold = args.threshold !== undefined ? parseFloat(args.threshold) : 0.1;
  if (Number.isNaN(threshold) || threshold < 0 || threshold > 1) {
    return fail('visual-diff', '--threshold must be between 0 and 1');
  }
  const updateBaseline = Boolean(args['update-baseline']);
  const selector = args.selector;

  try {
    ensureDir(BASELINE_DIR);
    const sanitized = sanitize(name);
    const baselinePath = path.join(BASELINE_DIR, `${sanitized}.png`);
    const currentPath = path.join(BASELINE_DIR, `${sanitized}.current.png`);
    const diffPath = path.join(BASELINE_DIR, `${sanitized}.diff.png`);

    const startedAt = Date.now();
    captureScreenshot(selector, currentPath);
    const currentBuf = fs.readFileSync(currentPath);

    if (!fs.existsSync(baselinePath) || updateBaseline) {
      fs.writeFileSync(baselinePath, currentBuf);
      const size = parsePngSize(currentBuf) || { width: 0, height: 0 };
      return emit(
        envelope({
          operation: 'visual-diff',
          summary: updateBaseline
            ? `Baseline "${name}" updated`
            : `Baseline "${name}" created`,
          status: 'success',
          details: {
            visualDiff: {
              name,
              status: updateBaseline ? 'baseline_updated' : 'baseline_created',
              similarity: 1,
              diffPixelCount: 0,
              width: size.width,
              height: size.height,
              threshold,
              baselinePath,
            },
          },
          metadata: { executionTimeMs: Date.now() - startedAt },
        })
      );
    }

    const baselineBuf = fs.readFileSync(baselinePath);
    let cmp = compareWithPixelmatch(baselineBuf, currentBuf, diffPath);
    if (cmp === null) cmp = compareFallback(baselineBuf, currentBuf);

    const passed = cmp.similarity >= 1 - threshold && !cmp.sizeMismatch;
    return emit(
      envelope({
        operation: 'visual-diff',
        summary: passed
          ? `Visual match for "${name}" (similarity ${cmp.similarity.toFixed(4)})`
          : `Visual mismatch for "${name}" (similarity ${cmp.similarity.toFixed(4)} below threshold ${1 - threshold})`,
        status: passed ? 'success' : 'failed',
        details: {
          visualDiff: {
            name,
            status: passed ? 'match' : 'mismatch',
            similarity: cmp.similarity,
            diffPixelCount: cmp.diffPixelCount,
            width: cmp.width,
            height: cmp.height,
            threshold,
            baselinePath,
            diffPath: fs.existsSync(diffPath) ? diffPath : undefined,
            note: cmp.note,
          },
        },
        metadata: { executionTimeMs: Date.now() - startedAt },
      })
    );
  } catch (err) {
    return fail('visual-diff', err.message);
  }
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { compareWithPixelmatch, compareFallback, parsePngSize };
