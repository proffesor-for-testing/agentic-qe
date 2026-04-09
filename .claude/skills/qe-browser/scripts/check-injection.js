#!/usr/bin/env node
// qe-browser: prompt-injection scanner for the current Vibium page.
//
// Scans both visible text and optionally hidden/offscreen content for common
// prompt-injection patterns that might try to manipulate an LLM browsing the page.
// Pattern library ported from gsd-browser (MIT/Apache-2.0) with extensions.
//
// Usage:
//   node check-injection.js
//   node check-injection.js --include-hidden
//   node check-injection.js --json

'use strict';

const {
  vibiumEvalStdin,
  envelope,
  parseArgs,
  emit,
  fail,
} = require('./lib/vibium');

// Pattern list — each entry: { name, severity, regex, description }.
// Severities: info < low < medium < high < critical.
const PATTERNS = [
  {
    name: 'ignore_previous_instructions',
    severity: 'high',
    regex: /ignore\s+(all\s+)?(previous|prior|above|preceding)\s+(instructions|prompts|commands|directives)/i,
    description: 'Classic prompt override',
  },
  {
    name: 'new_instructions',
    severity: 'high',
    regex: /(new|updated|revised)\s+(instructions|system\s+prompt|directives)/i,
    description: 'Attempts to inject a new instruction set',
  },
  {
    name: 'system_prompt_leak',
    severity: 'critical',
    regex: /\b(show|reveal|print|output|display|repeat|share)\s+(me\s+|us\s+)?(your\s+|the\s+)?(system\s+)?(prompt|instructions|rules|guidelines)\b/i,
    description: 'Attempts to exfiltrate system prompt',
  },
  {
    name: 'role_override',
    severity: 'high',
    regex: /you\s+are\s+(now|actually)\s+(a|an)\s+[a-z]+/i,
    description: 'Role reassignment attempt',
  },
  {
    name: 'developer_mode',
    severity: 'high',
    regex: /(enable|activate|enter)\s+(developer|dev|debug|jailbreak|admin|root)\s+mode/i,
    description: 'Developer/jailbreak mode request',
  },
  {
    name: 'confidential_exfil',
    severity: 'critical',
    regex: /(send|post|leak|exfiltrate|upload|forward)\s+.*(api[_\s-]?key|password|secret|token|credential)/i,
    description: 'Credential exfiltration attempt',
  },
  {
    name: 'base64_directive',
    severity: 'medium',
    regex: /decode\s+(the\s+)?(following\s+)?base64\s+(and\s+(run|execute|follow))?/i,
    description: 'Base64-obfuscated instructions',
  },
  {
    name: 'dan_pattern',
    severity: 'high',
    regex: /do\s+anything\s+now|dan\s+(mode|jailbreak|prompt)/i,
    description: 'DAN (Do Anything Now) jailbreak',
  },
  {
    name: 'chain_of_trust',
    severity: 'medium',
    regex: /(this\s+is\s+anthropic|i\s+am\s+a\s+trusted|authorized\s+by\s+the\s+developer)/i,
    description: 'False authority / impersonation',
  },
  {
    name: 'exfil_via_url',
    severity: 'high',
    regex: /fetch\s*\(\s*['"`]https?:\/\/[^'"`]*\?(key|secret|token|data)=/i,
    description: 'URL-based data exfiltration',
  },
  {
    name: 'markdown_image_exfil',
    severity: 'high',
    regex: /!\[[^\]]*\]\(https?:\/\/[^)]+\?[^)]*=[^)]+\)/i,
    description: 'Markdown image exfiltration channel',
  },
  {
    name: 'tool_hijack',
    severity: 'high',
    regex: /(call|invoke|run|execute)\s+(the\s+)?(tool|function|command)\s*:?\s*['"`]?(bash|exec|shell|eval)/i,
    description: 'Tool-use hijacking',
  },
  {
    name: 'memory_poison',
    severity: 'medium',
    regex: /remember\s+(this|that)\s+.*(forever|permanently|always)/i,
    description: 'Attempts to poison persistent memory',
  },
  {
    name: 'instructions_in_html_comment',
    severity: 'medium',
    regex: /<!--\s*(instructions|system|prompt|note\s+to\s+ai|claude|gpt|llm)/i,
    description: 'Instructions hidden in HTML comments',
  },
];

function scanText(text, hidden) {
  const findings = [];
  for (const pat of PATTERNS) {
    const match = text.match(pat.regex);
    if (match) {
      const idx = match.index || 0;
      const start = Math.max(0, idx - 40);
      const end = Math.min(text.length, idx + match[0].length + 40);
      findings.push({
        pattern: pat.name,
        severity: pat.severity,
        description: pat.description,
        snippet: text.slice(start, end).replace(/\s+/g, ' ').trim(),
        hidden,
      });
    }
  }
  return findings;
}

function aggregateSeverity(findings) {
  const order = { info: 1, low: 2, medium: 3, high: 4, critical: 5 };
  let top = 'none';
  let topRank = 0;
  for (const f of findings) {
    const rank = order[f.severity] || 0;
    if (rank > topRank) {
      topRank = rank;
      top = f.severity;
    }
  }
  return top;
}

function fetchPageText(includeHidden) {
  // Return both visible and (optionally) full text-content via vibium eval.
  // We pull both so we can tag findings with `hidden: true/false`.
  //
  // H2 (devil's-advocate finding): TreeWalker(SHOW_COMMENT) yields the
  // INNER text of each comment, stripping the `<!-- ... -->` delimiters.
  // The `instructions_in_html_comment` regex requires the literal `<!--`
  // prefix, so it could never fire against the unwrapped text. Fix: re-wrap
  // each comment in `<!-- ... -->` before adding it to the hidden bucket so
  // the comment-pattern actually matches.
  //
  // Vibium eval returns the LAST EXPRESSION's value, not console.log
  // output, so we wrap our payload in JSON.stringify and let
  // lib/vibium.js's unwrapEvalResult parse it back into an object.
  const script = `
    (function() {
      var visible = document.body ? document.body.innerText : '';
      var full = document.body ? document.body.textContent : '';
      var comments = [];
      var walker = document.createTreeWalker(document.body || document, NodeFilter.SHOW_COMMENT, null);
      var n;
      while ((n = walker.nextNode())) {
        comments.push('<!-- ' + n.textContent + ' -->');
      }
      var hidden = ${includeHidden ? 'full.replace(visible, "") + "\\n" + comments.join("\\n")' : '""'};
      return JSON.stringify({ visible: visible, hidden: hidden });
    })()
  `;
  return vibiumEvalStdin(script) || { visible: '', hidden: '' };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const includeHidden = Boolean(args['include-hidden']);
  const startedAt = Date.now();

  try {
    const { visible, hidden } = fetchPageText(includeHidden);
    const findings = [
      ...scanText(visible || '', false),
      ...scanText(hidden || '', true),
    ];
    const severity = findings.length === 0 ? 'none' : aggregateSeverity(findings);
    const status =
      severity === 'none' || severity === 'info' || severity === 'low' ? 'success' : 'failed';

    return emit(
      envelope({
        operation: 'check-injection',
        summary:
          findings.length === 0
            ? 'No prompt-injection patterns detected'
            : `Detected ${findings.length} prompt-injection pattern(s), highest severity: ${severity}`,
        status,
        details: {
          checkInjection: {
            findings,
            severity,
            scanned: {
              visibleChars: (visible || '').length,
              hiddenChars: (hidden || '').length,
            },
          },
        },
        metadata: { executionTimeMs: Date.now() - startedAt },
      })
    );
  } catch (err) {
    return fail('check-injection', err.message);
  }
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { scanText, PATTERNS, aggregateSeverity };
