#!/usr/bin/env node
// qe-browser: typed assertions against the current Vibium page state.
//
// Usage:
//   node assert.js --checks '[{"kind": "url_contains", "text": "/dashboard"}]'
//   node assert.js --checks @checks.json
//
// Exit code: 0 if all passed, 1 if any failed or on error.
// Output:    JSON envelope matching schemas/output.json.

'use strict';

const {
  vibiumJson,
  vibiumEvalStdin,
  envelope,
  parseArgs,
  readInlineOrFile,
  emit,
  fail,
  runOrSkip,
  isVibiumUnavailable,
  rethrowIfUnavailable,
} = require('./lib/vibium');

const CHECK_KINDS = new Set([
  'url_contains',
  'url_equals',
  'text_visible',
  'text_hidden',
  'selector_visible',
  'selector_hidden',
  'value_equals',
  'attribute_equals',
  'no_console_errors',
  'no_failed_requests',
  'response_status',
  'request_url_seen',
  'console_message_matches',
  'element_count',
  'title_matches',
  'page_source_contains',
]);

function buildEvalScript(check) {
  const q = (v) => JSON.stringify(v);
  switch (check.kind) {
    case 'url_contains':
      return `JSON.stringify({ ok: location.href.includes(${q(check.text)}), actual: location.href })`;
    case 'url_equals':
      return `JSON.stringify({ ok: location.href === ${q(check.url)}, actual: location.href })`;
    case 'text_visible':
      return `(() => {
        const needle = ${q(check.text)};
        const body = document.body ? document.body.innerText : '';
        return JSON.stringify({ ok: body.includes(needle), actual: null });
      })()`;
    case 'text_hidden':
      return `(() => {
        const needle = ${q(check.text)};
        const body = document.body ? document.body.innerText : '';
        return JSON.stringify({ ok: !body.includes(needle), actual: null });
      })()`;
    case 'selector_visible':
      return `(() => {
        const el = document.querySelector(${q(check.selector)});
        if (!el) return JSON.stringify({ ok: false, actual: 'not found' });
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        const visible = r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0;
        return JSON.stringify({ ok: visible, actual: { width: r.width, height: r.height, display: s.display } });
      })()`;
    case 'selector_hidden':
      return `(() => {
        const el = document.querySelector(${q(check.selector)});
        if (!el) return JSON.stringify({ ok: true, actual: 'not found' });
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        const visible = r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0;
        return JSON.stringify({ ok: !visible, actual: { width: r.width, height: r.height, display: s.display } });
      })()`;
    case 'value_equals':
      return `(() => {
        const el = document.querySelector(${q(check.selector)});
        if (!el) return JSON.stringify({ ok: false, actual: 'not found' });
        return JSON.stringify({ ok: el.value === ${q(check.value)}, actual: el.value });
      })()`;
    case 'attribute_equals':
      return `(() => {
        const el = document.querySelector(${q(check.selector)});
        if (!el) return JSON.stringify({ ok: false, actual: 'not found' });
        const v = el.getAttribute(${q(check.attribute)});
        return JSON.stringify({ ok: v === ${q(check.value)}, actual: v });
      })()`;
    case 'element_count': {
      const op = check.op || '==';
      return `(() => {
        const n = document.querySelectorAll(${q(check.selector)}).length;
        const want = ${Number(check.count)};
        const ok = (${JSON.stringify(op)} === '==' ? n === want :
                    ${JSON.stringify(op)} === '>='  ? n >= want :
                    ${JSON.stringify(op)} === '<='  ? n <= want :
                    ${JSON.stringify(op)} === '>'   ? n > want :
                    ${JSON.stringify(op)} === '<'   ? n < want :
                    false);
        return JSON.stringify({ ok, actual: n });
      })()`;
    }
    case 'title_matches':
      return `(() => {
        const re = new RegExp(${q(check.pattern)});
        return JSON.stringify({ ok: re.test(document.title), actual: document.title });
      })()`;
    case 'page_source_contains':
      return `JSON.stringify({ ok: document.documentElement.outerHTML.includes(${q(check.text)}), actual: null })`;
    default:
      return null;
  }
}

function runBrowserSideCheck(check) {
  const script = buildEvalScript(check);
  if (!script) return null;
  // Pass the JSON.stringify expression directly — vibium eval returns the
  // last expression's value, NOT console.log output. lib/vibium.js's
  // unwrapEvalResult parses the {ok, result} envelope and JSON-decodes the
  // string for us, so `payload` is already our object.
  try {
    const payload = vibiumEvalStdin(script);
    if (payload && typeof payload === 'object' && 'ok' in payload) {
      return payload;
    }
    return { ok: false, actual: payload };
  } catch (err) {
    // F1: bubble VibiumUnavailableError past this catch so runOrSkip can
    // emit the documented skipped envelope. Other errors stay scoped to
    // the individual check (we still report them inside `actual`).
    rethrowIfUnavailable(err);
    return { ok: false, actual: `eval error: ${err.message}` };
  }
}

// Sentinel returned by console/network checks when the underlying vibium
// command fails. Tests and callers can distinguish "check actually passed"
// from "we couldn't tell" by looking at result.unavailable. assert.js treats
// unavailable as a FAIL — per feedback_no_unverified_failure_modes.md,
// silently reporting green when the signal is missing is a prohibited
// failure mode.
//
// F1 distinction: this `unavailable` sentinel is for "vibium ran but the
// `console`/`network` subcommand returned nothing useful" — NOT for "vibium
// itself isn't installed". The latter is handled by VibiumUnavailableError
// + runOrSkip + the skipped envelope. We re-throw the unavailable error so
// it surfaces correctly.
function unavailable(err) {
  return {
    ok: false,
    unavailable: true,
    actual: null,
    message: `vibium telemetry unavailable: ${err.message || err}`,
  };
}

function runConsoleCheck(kind, check) {
  let raw;
  try {
    raw = vibiumJson(['console', '--json']);
  } catch (err) {
    rethrowIfUnavailable(err);
    return unavailable(err);
  }
  const entries = Array.isArray(raw) ? raw : Array.isArray(raw && raw.entries) ? raw.entries : [];
  if (kind === 'no_console_errors') {
    const errors = entries.filter((e) =>
      ['error', 'severe'].includes(String(e.level || e.type || '').toLowerCase())
    );
    return { ok: errors.length === 0, actual: errors.length };
  }
  if (kind === 'console_message_matches') {
    const re = new RegExp(check.pattern);
    const match = entries.find((e) => re.test(String(e.message || e.text || '')));
    return { ok: Boolean(match), actual: match ? match.message || match.text : null };
  }
  return { ok: false, actual: 'unknown console kind' };
}

function runNetworkCheck(kind, check) {
  let raw;
  try {
    raw = vibiumJson(['network', '--json']);
  } catch (err) {
    rethrowIfUnavailable(err);
    return unavailable(err);
  }
  const entries = Array.isArray(raw) ? raw : Array.isArray(raw && raw.entries) ? raw.entries : [];
  if (kind === 'no_failed_requests') {
    const failed = entries.filter((e) => {
      const status = Number(e.status || 0);
      return status >= 400 || e.failed === true || e.error;
    });
    return { ok: failed.length === 0, actual: failed.length };
  }
  if (kind === 'response_status') {
    const hit = entries.find((e) => String(e.url || '').includes(check.url));
    if (!hit) return { ok: false, actual: 'url not seen' };
    return {
      ok: Number(hit.status) === Number(check.status),
      actual: Number(hit.status),
    };
  }
  if (kind === 'request_url_seen') {
    const hit = entries.find((e) => String(e.url || '').includes(check.url));
    return { ok: Boolean(hit), actual: hit ? hit.url : null };
  }
  return { ok: false, actual: 'unknown network kind' };
}

function runCheck(check) {
  if (!check || typeof check !== 'object') {
    return { kind: 'invalid', passed: false, message: 'check must be an object' };
  }
  if (!CHECK_KINDS.has(check.kind)) {
    return {
      kind: check.kind,
      passed: false,
      message: `unknown check kind: ${check.kind}`,
    };
  }

  let result;
  if (check.kind === 'no_console_errors' || check.kind === 'console_message_matches') {
    result = runConsoleCheck(check.kind, check);
  } else if (
    check.kind === 'no_failed_requests' ||
    check.kind === 'response_status' ||
    check.kind === 'request_url_seen'
  ) {
    result = runNetworkCheck(check.kind, check);
  } else {
    result = runBrowserSideCheck(check);
  }

  // Use ?? instead of || so falsy-but-valid values (count: 0, url: '',
  // value: '') are preserved in the expected field. The old || chain
  // silently converted them to null, which made debug output misleading.
  const expected =
    check.text ??
    check.url ??
    check.value ??
    check.pattern ??
    check.count ??
    null;

  return {
    kind: check.kind,
    passed: Boolean(result && result.ok),
    unavailable: Boolean(result && result.unavailable),
    actual: result ? result.actual : null,
    expected,
    message:
      result && result.message
        ? result.message
        : result && result.note
        ? result.note
        : undefined,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rawChecks = args.checks;
  if (!rawChecks) {
    return fail('assert', 'missing --checks argument');
  }
  let checks;
  try {
    checks = JSON.parse(readInlineOrFile(rawChecks));
  } catch (err) {
    return fail('assert', `invalid --checks JSON: ${err.message}`);
  }
  if (!Array.isArray(checks)) {
    return fail('assert', '--checks must be a JSON array');
  }

  const startedAt = Date.now();
  const results = checks.map(runCheck);
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const unavailable = results.filter((r) => r.unavailable).length;

  const env = envelope({
    operation: 'assert',
    summary:
      failed === 0
        ? `All ${passed} assertions passed`
        : unavailable > 0
        ? `${failed} of ${results.length} assertions failed (${unavailable} due to vibium telemetry unavailable)`
        : `${failed} of ${results.length} assertions failed`,
    status: failed === 0 ? 'success' : 'failed',
    details: {
      assert: { passed, failed, results },
    },
    metadata: { executionTimeMs: Date.now() - startedAt },
  });

  return emit(env);
}

if (require.main === module) {
  // F1: runOrSkip catches VibiumUnavailableError thrown anywhere inside
  // main() (including from nested vibium() / vibiumJson() / vibiumEval*
  // calls) and emits the documented skipped envelope with exit code 2.
  process.exit(runOrSkip('assert', main));
}

module.exports = { runCheck, CHECK_KINDS, buildEvalScript, unavailable };
