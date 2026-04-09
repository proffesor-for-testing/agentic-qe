#!/usr/bin/env node
// qe-browser: semantic intent scoring for the current Vibium page.
//
// Ported from gsd-browser (MIT/Apache-2.0) — the scorer is pure JS heuristic,
// no LLM round-trip. We push the whole scoring function into `vibium eval --stdin`
// which runs it in the page context via WebDriver BiDi.
//
// Usage:
//   node intent-score.js --intent submit_form
//   node intent-score.js --intent accept_cookies --scope "#banner"
//   node intent-score.js --intent fill_email

'use strict';

const { vibiumEvalStdin, envelope, parseArgs, emit, fail } = require('./lib/vibium');

const VALID_INTENTS = [
  'submit_form',
  'close_dialog',
  'primary_cta',
  'search_field',
  'next_step',
  'dismiss',
  'auth_action',
  'back_navigation',
  'fill_email',
  'fill_password',
  'fill_username',
  'accept_cookies',
  'main_content',
  'pagination_next',
  'pagination_prev',
];

// The scoring function is a self-contained IIFE that runs in the page context.
// Derived from gsd-browser/cli/src/daemon/handlers/intent.rs:59-385.
const SCORER_JS = `
(function () {
  const intent = __INTENT__;
  const scopeSel = __SCOPE__;
  const root = scopeSel ? document.querySelector(scopeSel) : document;
  if (!root) throw new Error('scope element not found: ' + scopeSel);

  const interactiveSel =
    'a, button, input, select, textarea, [role=button], [role=link], [role=menuitem], ' +
    '[role=tab], [role=search], [role=searchbox], [tabindex], [onclick]';
  const contentSel = 'main, article, section, [role=main], [role=article], div';
  const sel = intent === 'main_content' ? interactiveSel + ', ' + contentSel : interactiveSel;
  const candidates = Array.from(root.querySelectorAll(sel));

  function isVisible(el) {
    if (el.hidden || el.disabled) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
    return true;
  }
  function getText(el) { return (el.textContent || '').trim().substring(0, 100).toLowerCase(); }
  function getAriaLabel(el) { return (el.getAttribute('aria-label') || '').toLowerCase(); }
  function getRole(el) { return (el.getAttribute('role') || '').toLowerCase(); }

  function buildSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const tag = el.tagName.toLowerCase();
    const testId = el.getAttribute('data-testid');
    if (testId) return tag + '[data-testid=' + JSON.stringify(testId) + ']';
    if (el.name) {
      const nsel = tag + '[name=' + JSON.stringify(el.name) + ']';
      if (document.querySelectorAll(nsel).length === 1) return nsel;
    }
    if (el.type) {
      const tsel = tag + '[type=' + JSON.stringify(el.type) + ']';
      if (document.querySelectorAll(tsel).length === 1) return tsel;
    }
    const all = Array.from(document.querySelectorAll(tag));
    const idx = all.indexOf(el);
    return tag + ':nth-of-type(' + (idx + 1) + ')';
  }

  const scorers = {
    submit_form(el, tag, type, text, role, aria) {
      let s = 0; const r = [];
      if (type === 'submit') { s += 0.5; r.push('type=submit'); }
      if (tag === 'button' && !el.type) { s += 0.2; r.push('button no-type'); }
      if (/submit|send|save|confirm|create|register|sign.?up|log.?in|continue|next|apply|ok/i.test(text || el.value || aria)) { s += 0.3; r.push('submit text'); }
      if (el.closest('form')) { s += 0.15; r.push('inside form'); }
      if (role === 'button') { s += 0.05; r.push('role=button'); }
      return { score: s, reasons: r };
    },
    close_dialog(el, tag, type, text, role, aria) {
      let s = 0; const r = [];
      if (/close|dismiss|cancel|\\u00d7|\\u2715|x/i.test(text || aria)) { s += 0.4; r.push('close text'); }
      if (el.closest('dialog, [role=dialog], [role=alertdialog], .modal')) { s += 0.3; r.push('in dialog'); }
      if (aria && /close|dismiss/i.test(aria)) { s += 0.2; r.push('aria close'); }
      if (tag === 'button') { s += 0.05; r.push('is button'); }
      return { score: s, reasons: r };
    },
    primary_cta(el, tag, type, text, role, aria) {
      let s = 0; const r = [];
      if (tag === 'button' || tag === 'a' || role === 'button') { s += 0.15; r.push('interactive'); }
      const rect = el.getBoundingClientRect();
      if (rect.width * rect.height > 3000) { s += 0.15; r.push('large area'); }
      const style = getComputedStyle(el);
      const bg = style.backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') { s += 0.2; r.push('has bg'); }
      if (/get.?started|sign.?up|try|buy|subscribe|download|start|learn.?more/i.test(text || aria)) { s += 0.3; r.push('CTA text'); }
      return { score: s, reasons: r };
    },
    search_field(el, tag, type, text, role, aria) {
      let s = 0; const r = [];
      if (role === 'search' || role === 'searchbox') { s += 0.5; r.push('search role'); }
      if (type === 'search') { s += 0.5; r.push('type=search'); }
      if (tag === 'input' && /search/i.test(aria || el.placeholder || el.name || '')) { s += 0.4; r.push('search attr'); }
      if (tag === 'input' || tag === 'textarea') { s += 0.05; r.push('is input'); }
      return { score: s, reasons: r };
    },
    next_step(el, tag, type, text, role, aria) {
      let s = 0; const r = [];
      if (/next|continue|proceed|forward|\\u2192|\\u203a|>>|step/i.test(text || aria)) { s += 0.4; r.push('next text'); }
      if (tag === 'button' || role === 'button') { s += 0.15; r.push('is button'); }
      if (type === 'submit') { s += 0.1; r.push('type=submit'); }
      return { score: s, reasons: r };
    },
    dismiss(el, tag, type, text, role, aria) {
      let s = 0; const r = [];
      if (/dismiss|close|cancel|no.?thanks|skip|later|not.?now|got.?it|ok|accept/i.test(text || aria)) { s += 0.4; r.push('dismiss text'); }
      if (el.closest('[class*=overlay], [class*=popup], [class*=banner], [class*=toast], [class*=notification]')) { s += 0.2; r.push('in overlay'); }
      if (tag === 'button') { s += 0.1; r.push('is button'); }
      return { score: s, reasons: r };
    },
    auth_action(el, tag, type, text, role, aria) {
      let s = 0; const r = [];
      if (/log.?in|sign.?in|sign.?up|register|auth|sso|forgot.?password/i.test(text || aria)) { s += 0.4; r.push('auth text'); }
      if (type === 'submit' && el.closest('form')) {
        const form = el.closest('form');
        if (form.querySelector('input[type=password]')) { s += 0.3; r.push('has password'); }
      }
      if (tag === 'button' || tag === 'a') { s += 0.1; r.push('interactive'); }
      return { score: s, reasons: r };
    },
    back_navigation(el, tag, type, text, role, aria) {
      let s = 0; const r = [];
      if (/back|previous|\\u2190|\\u2039|<<|return|go.?back/i.test(text || aria)) { s += 0.4; r.push('back text'); }
      if (tag === 'a' && el.href) {
        try {
          const url = new URL(el.href);
          if (url.pathname.length < location.pathname.length) { s += 0.2; r.push('shorter path'); }
        } catch (e) {}
      }
      if (role === 'navigation' || el.closest('nav')) { s += 0.1; r.push('in nav'); }
      return { score: s, reasons: r };
    },
    fill_email(el, tag, type, text, role, aria) {
      let s = 0; const r = [];
      if (type === 'email') { s += 0.6; r.push('type=email'); }
      if (/email|e-mail/i.test(el.name || el.placeholder || aria || '')) { s += 0.4; r.push('email attr'); }
      if (el.autocomplete === 'email') { s += 0.3; r.push('autocomplete=email'); }
      if (tag === 'input') { s += 0.05; r.push('is input'); }
      return { score: s, reasons: r };
    },
    fill_password(el, tag, type, text, role, aria) {
      let s = 0; const r = [];
      if (type === 'password') { s += 0.7; r.push('type=password'); }
      if (/password|passwd|pass/i.test(el.name || el.placeholder || aria || '')) { s += 0.3; r.push('password attr'); }
      if (el.autocomplete === 'current-password' || el.autocomplete === 'new-password') { s += 0.2; r.push('autocomplete=password'); }
      return { score: s, reasons: r };
    },
    fill_username(el, tag, type, text, role, aria) {
      let s = 0; const r = [];
      if (/user.?name|login|account/i.test(el.name || el.placeholder || aria || '')) { s += 0.5; r.push('username attr'); }
      if (el.autocomplete === 'username') { s += 0.4; r.push('autocomplete=username'); }
      if (type === 'text' && el.closest('form')) {
        if (el.closest('form').querySelector('input[type=password]')) { s += 0.2; r.push('text in login form'); }
      }
      if (tag === 'input') { s += 0.05; r.push('is input'); }
      return { score: s, reasons: r };
    },
    accept_cookies(el, tag, type, text, role, aria) {
      let s = 0; const r = [];
      if (/accept|agree|consent|allow|got.?it|ok|i.?understand/i.test(text || aria)) { s += 0.3; r.push('accept text'); }
      if (/cookie/i.test(text || aria)) { s += 0.2; r.push('mentions cookies'); }
      if (el.closest('[class*=cookie], [class*=consent], [class*=gdpr], [class*=privacy], [id*=cookie], [id*=consent]')) { s += 0.3; r.push('in cookie banner'); }
      if (tag === 'button' || role === 'button') { s += 0.1; r.push('is button'); }
      if (/reject|decline|settings|manage|customize/i.test(text || aria)) { s -= 0.3; r.push('reject penalty'); }
      return { score: s, reasons: r };
    },
    main_content(el, tag, type, text, role, aria) {
      let s = 0; const r = [];
      if (role === 'main') { s += 0.6; r.push('role=main'); }
      if (tag === 'main') { s += 0.6; r.push('<main>'); }
      if (tag === 'article') { s += 0.4; r.push('<article>'); }
      if (el.id && /content|main|article|body/i.test(el.id)) { s += 0.3; r.push('content id'); }
      if (el.className && /content|main|article|body/i.test(el.className)) { s += 0.2; r.push('content class'); }
      const rect = el.getBoundingClientRect();
      if (rect.width > 500 && rect.height > 300) { s += 0.15; r.push('large area'); }
      return { score: s, reasons: r };
    },
    pagination_next(el, tag, type, text, role, aria) {
      let s = 0; const r = [];
      if (/next|\\u203a|>>|\\u2192|older/i.test(text || aria)) { s += 0.4; r.push('next text'); }
      if (el.rel === 'next') { s += 0.5; r.push('rel=next'); }
      if (el.closest('nav, [role=navigation], [class*=paginat], [class*=pager]')) { s += 0.2; r.push('in pagination'); }
      if (tag === 'a' || tag === 'button') { s += 0.05; r.push('interactive'); }
      return { score: s, reasons: r };
    },
    pagination_prev(el, tag, type, text, role, aria) {
      let s = 0; const r = [];
      if (/prev|previous|\\u2039|<<|\\u2190|newer/i.test(text || aria)) { s += 0.4; r.push('prev text'); }
      if (el.rel === 'prev') { s += 0.5; r.push('rel=prev'); }
      if (el.closest('nav, [role=navigation], [class*=paginat], [class*=pager]')) { s += 0.2; r.push('in pagination'); }
      if (tag === 'a' || tag === 'button') { s += 0.05; r.push('interactive'); }
      return { score: s, reasons: r };
    },
  };

  const scorer = scorers[intent];
  if (!scorer) throw new Error('unknown intent: ' + intent + '. Valid: ' + Object.keys(scorers).join(', '));

  const scored = [];
  for (const el of candidates) {
    if (!isVisible(el)) continue;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    const text = getText(el);
    const role = getRole(el);
    const aria = getAriaLabel(el);
    const { score, reasons } = scorer(el, tag, type, text, role, aria);
    if (score <= 0) continue;
    const rect = el.getBoundingClientRect();
    scored.push({
      score: Math.round(score * 1000) / 1000,
      selector: buildSelector(el),
      tag,
      type: type || null,
      role: role || null,
      text: (el.textContent || '').trim().substring(0, 80) || null,
      reason: reasons.join(', '),
      bounds: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return {
    intent: intent,
    candidateCount: scored.length,
    candidates: scored.slice(0, 5),
    scope: scopeSel || 'document',
  };
})()
`;

function buildScript(intent, scope) {
  const intentJson = JSON.stringify(intent);
  const scopeJson = scope ? JSON.stringify(scope) : 'null';
  // Use split/join instead of String.prototype.replace because the second
  // argument of .replace is a *replacement string* where $&, $`, $', $1-$9
  // have special meaning. JSON.stringify output can contain those sequences
  // (e.g. a selector like `div[data-x="$amount"]`) which would otherwise
  // corrupt the generated script. split/join does a literal substitution.
  const body = SCORER_JS.split('__INTENT__').join(intentJson).split('__SCOPE__').join(scopeJson);
  // Vibium eval returns the last expression's value, not console.log output.
  // Wrap in JSON.stringify so lib/vibium.js's unwrapEvalResult can JSON-parse
  // the result string back into a real object on our side.
  return `JSON.stringify(${body})`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const intent = args.intent;
  if (!intent) return fail('intent-score', 'missing --intent argument');
  if (!VALID_INTENTS.includes(intent)) {
    return fail(
      'intent-score',
      `unknown intent "${intent}". Valid: ${VALID_INTENTS.join(', ')}`
    );
  }
  const scope = args.scope;
  const startedAt = Date.now();

  try {
    const payload = vibiumEvalStdin(buildScript(intent, scope));
    if (!payload || !Array.isArray(payload.candidates)) {
      throw new Error('scorer returned unexpected payload');
    }
    const top = payload.candidates[0];
    return emit(
      envelope({
        operation: 'intent-score',
        summary:
          payload.candidateCount > 0
            ? `Top candidate for "${intent}": score ${top.score}, selector ${top.selector}`
            : `No candidates found for intent "${intent}"`,
        status: payload.candidateCount > 0 ? 'success' : 'partial',
        details: { intentScore: payload },
        metadata: { executionTimeMs: Date.now() - startedAt },
      })
    );
  } catch (err) {
    return fail('intent-score', err.message);
  }
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { VALID_INTENTS, buildScript };
