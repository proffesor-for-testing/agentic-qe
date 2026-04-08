#!/usr/bin/env node
// qe-browser: multi-step batch executor. Reduces round-trips by dispatching
// a sequence of vibium commands from a single JSON plan.
//
// Usage:
//   node batch.js --steps '[{"action":"go","url":"https://example.com"}, ...]'
//   node batch.js --steps @flow.json --summary-only
//   node batch.js --steps @flow.json --continue-on-failure
//
// Supported actions (dispatch to the corresponding vibium subcommand):
//   go / navigate         — url
//   click                 — ref | selector
//   fill                  — ref | selector, text
//   type                  — ref | selector, text
//   press                 — key, [selector]
//   wait_url              — pattern, [timeoutMs]
//   wait_text             — text, [timeoutMs]
//   wait_selector         — selector, [state, timeoutMs]
//   wait_load             — [timeoutMs]
//   map                   — [selector]
//   screenshot            — [output, fullPage]
//   storage_save          — path
//   storage_restore       — path
//   assert                — checks (see assert.js)

'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  vibium,
  vibiumJson,
  envelope,
  parseArgs,
  readInlineOrFile,
  emit,
  fail,
} = require('./lib/vibium');

function runVibium(args) {
  const result = vibium(args);
  if (result.status !== 0) {
    throw new Error(
      `vibium ${args.join(' ')} exited ${result.status}: ${
        result.stderr.trim() || result.stdout.trim()
      }`
    );
  }
  return result.stdout.trim();
}

function dispatch(step) {
  const a = step.action;
  const target = step.ref || step.selector;

  switch (a) {
    case 'go':
    case 'navigate':
      if (!step.url) throw new Error(`${a}: missing url`);
      return runVibium(['go', step.url]);
    case 'click':
      if (!target) throw new Error('click: missing ref or selector');
      return runVibium(['click', target]);
    case 'fill':
      if (!target) throw new Error('fill: missing ref or selector');
      if (typeof step.text !== 'string') throw new Error('fill: missing text');
      return runVibium(['fill', target, step.text]);
    case 'type':
      if (!target) throw new Error('type: missing ref or selector');
      if (typeof step.text !== 'string') throw new Error('type: missing text');
      return runVibium(['type', target, step.text]);
    case 'press':
      if (!step.key) throw new Error('press: missing key');
      return runVibium(target ? ['press', step.key, target] : ['press', step.key]);
    case 'wait_url':
      if (!step.pattern) throw new Error('wait_url: missing pattern');
      return runVibium(
        step.timeoutMs
          ? ['wait', 'url', step.pattern, '--timeout', String(step.timeoutMs)]
          : ['wait', 'url', step.pattern]
      );
    case 'wait_text':
      if (!step.text) throw new Error('wait_text: missing text');
      return runVibium(
        step.timeoutMs
          ? ['wait', 'text', step.text, '--timeout', String(step.timeoutMs)]
          : ['wait', 'text', step.text]
      );
    case 'wait_selector': {
      if (!step.selector) throw new Error('wait_selector: missing selector');
      const args = ['wait', step.selector];
      if (step.state) args.push('--state', step.state);
      if (step.timeoutMs) args.push('--timeout', String(step.timeoutMs));
      return runVibium(args);
    }
    case 'wait_load':
      return runVibium(
        step.timeoutMs ? ['wait', 'load', '--timeout', String(step.timeoutMs)] : ['wait', 'load']
      );
    case 'map':
      return vibiumJson(step.selector ? ['map', '--selector', step.selector] : ['map']);
    case 'screenshot': {
      const args = ['screenshot'];
      if (step.output) args.push('-o', step.output);
      if (step.fullPage) args.push('--full-page');
      if (step.annotate) args.push('--annotate');
      return runVibium(args);
    }
    case 'storage_save':
      if (!step.path) throw new Error('storage_save: missing path');
      return runVibium(['storage', '-o', step.path]);
    case 'storage_restore':
      if (!step.path) throw new Error('storage_restore: missing path');
      return runVibium(['storage', 'restore', step.path]);
    case 'assert': {
      // Delegate to assert.js in the same directory.
      const assertScript = path.resolve(__dirname, 'assert.js');
      const checks = JSON.stringify(step.checks || []);
      const res = spawnSync('node', [assertScript, '--checks', checks], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      });
      if (res.status !== 0) {
        throw new Error(`assert step failed: ${res.stdout.trim() || res.stderr.trim()}`);
      }
      return res.stdout.trim();
    }
    default:
      throw new Error(`unknown batch action: ${a}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rawSteps = args.steps;
  if (!rawSteps) return fail('batch', 'missing --steps argument');

  let steps;
  try {
    steps = JSON.parse(readInlineOrFile(rawSteps));
  } catch (err) {
    return fail('batch', `invalid --steps JSON: ${err.message}`);
  }
  if (!Array.isArray(steps)) {
    return fail('batch', '--steps must be a JSON array');
  }

  const stopOnFailure = !args['continue-on-failure'];
  const summaryOnly = Boolean(args['summary-only']);
  const startedAt = Date.now();

  const results = [];
  let passed = 0;
  let failedStep = null;

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    try {
      dispatch(step);
      passed += 1;
      results.push({ index: i, action: step.action, status: 'pass' });
    } catch (err) {
      const info = { index: i, action: step.action, status: 'fail', error: err.message };
      results.push(info);
      failedStep = info;
      if (stopOnFailure) break;
    }
  }

  const env = envelope({
    operation: 'batch',
    summary:
      failedStep === null
        ? `All ${passed} steps passed`
        : `Failed at step ${failedStep.index} (${failedStep.action}): ${failedStep.error}`,
    status: failedStep === null ? 'success' : 'failed',
    details: {
      batch: {
        totalSteps: steps.length,
        passedSteps: passed,
        failedStep,
        steps: summaryOnly ? undefined : results,
      },
    },
    metadata: { executionTimeMs: Date.now() - startedAt },
  });

  return emit(env);
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { dispatch };
