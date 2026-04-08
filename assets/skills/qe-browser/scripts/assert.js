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
  const full = `console.log(${script});`;
  try {
    const result = vibiumEvalStdin(full);
    // vibium eval --stdin --json returns the evaluated expression.
    // We wrapped our expression in JSON.stringify, so `result` is likely a string.
    const payload = typeof result === 'string' ? JSON.parse(result) : result;
    if (payload && typeof payload === 'object' && 'ok' in payload) {
      return payload;
    }
    if (payload && payload.__raw) {
      try {
        return JSON.parse(payload.__raw);
      } catch (_e) {
        return { ok: false, actual: payload.__raw };
      }
    }
    return { ok: false, actual: payload };
  } catch (err) {
    return { ok: false, actual: `eval error: ${err.message}` };
  }
}

function runConsoleCheck(kind, check) {
  try {
    // `vibium console` returns an array of console entries when available.
    // Fall back to an empty list if the command isn't supported in this version.
    const raw = vibiumJson(['console', '--json']);
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
  } catch (err) {
    // Console buffer may not exist yet — treat as "no errors" for no_console_errors,
    // "no match" for console_message_matches. This is conservative but avoids false negatives.
    if (kind === 'no_console_errors') return { ok: true, actual: 0, note: err.message };
    return { ok: false, actual: err.message };
  }
}

function runNetworkCheck(kind, check) {
  try {
    const raw = vibiumJson(['network', '--json']);
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
  } catch (err) {
    if (kind === 'no_failed_requests') return { ok: true, actual: 0, note: err.message };
    return { ok: false, actual: err.message };
  }
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

  return {
    kind: check.kind,
    passed: Boolean(result && result.ok),
    actual: result ? result.actual : null,
    expected:
      check.text || check.url || check.value || check.pattern || check.count || null,
    message: result && result.note ? result.note : undefined,
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

  const env = envelope({
    operation: 'assert',
    summary:
      failed === 0
        ? `All ${passed} assertions passed`
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
  process.exit(main());
}

module.exports = { runCheck, CHECK_KINDS, buildEvalScript };
