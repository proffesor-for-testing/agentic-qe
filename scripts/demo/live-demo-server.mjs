#!/usr/bin/env node
/**
 * AQE Live Demo Server — AI-Powered Defect Intelligence
 * Standalone HTTP server with real algorithms (TF-IDF, quality scoring, RCA)
 * Zero external dependencies — pure Node.js
 *
 * Usage: node scripts/demo/live-demo-server.mjs
 * Serves on: http://localhost:3010
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  defectGuidelines,
  poorQualityDefect,
  goodQualityDefect,
  existingDefects,
  newDefectForDupeCheck,
  similarityResults,
  defectComments,
  commentAnalysisResult,
  rcaDefectCluster,
  fiveWhysAnalysis,
  fishboneCategories,
  rootCauseResult,
} from './defect-data.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3010;

// ═══════════════════════════════════════════════════════════════════════════
// In-Memory Defect Database
// ═══════════════════════════════════════════════════════════════════════════

const defectDatabase = [
  ...existingDefects,
  {
    id: goodQualityDefect.id,
    title: goodQualityDefect.title,
    severity: goodQualityDefect.severity,
    component: goodQualityDefect.component,
    description: goodQualityDefect.actualBehavior,
    status: 'open',
    reportedDate: goodQualityDefect.reportedDate,
    tags: goodQualityDefect.tags,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Text Processing Utilities
// ═══════════════════════════════════════════════════════════════════════════

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'in', 'for', 'to', 'of',
  'and', 'or', 'but', 'not', 'this', 'that', 'with', 'from', 'by', 'as',
  'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'can', 'could', 'should', 'may', 'might', 'its',
  'it', 'they', 'them', 'their', 'we', 'our', 'you', 'your', 'he', 'she',
  'his', 'her', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 'just', 'because', 'when', 'where', 'how', 'what',
  'who', 'also', 'after', 'before', 'during', 'between', 'into', 'through',
  'about', 'above', 'below', 'then', 'there', 'here', 'once', 'while',
]);

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

function stem(word) {
  return word
    .replace(/ation$/, '')
    .replace(/tion$/, 't')
    .replace(/sion$/, 's')
    .replace(/ness$/, '')
    .replace(/ment$/, '')
    .replace(/able$/, '')
    .replace(/ible$/, '')
    .replace(/ful$/, '')
    .replace(/less$/, '')
    .replace(/ous$/, '')
    .replace(/ive$/, '')
    .replace(/ing$/, '')
    .replace(/ly$/, '')
    .replace(/ed$/, '')
    .replace(/er$/, '')
    .replace(/es$/, '')
    .replace(/s$/, '');
}

function tokenizeAndStem(text) {
  return tokenize(text).map(stem);
}

// ═══════════════════════════════════════════════════════════════════════════
// TF-IDF Engine
// ═══════════════════════════════════════════════════════════════════════════

function buildCorpus(documents) {
  const vocab = new Set();
  const docTokens = documents.map(doc => {
    const tokens = tokenizeAndStem(doc);
    tokens.forEach(t => vocab.add(t));
    return tokens;
  });
  const vocabArray = [...vocab];
  const vocabIndex = Object.fromEntries(vocabArray.map((v, i) => [v, i]));

  // Document frequency
  const df = new Array(vocabArray.length).fill(0);
  for (const tokens of docTokens) {
    const seen = new Set(tokens);
    for (const t of seen) {
      df[vocabIndex[t]]++;
    }
  }

  // IDF
  const N = documents.length;
  const idf = df.map(d => Math.log((N + 1) / (d + 1)) + 1);

  return { vocabArray, vocabIndex, idf, docTokens };
}

function tfidfVector(tokens, vocabIndex, idf) {
  const vec = new Array(idf.length).fill(0);
  const counts = {};
  for (const t of tokens) {
    counts[t] = (counts[t] || 0) + 1;
  }
  const total = tokens.length || 1;
  for (const [term, count] of Object.entries(counts)) {
    const idx = vocabIndex[term];
    if (idx !== undefined) {
      vec[idx] = (count / total) * idf[idx];
    }
  }
  return vec;
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ═══════════════════════════════════════════════════════════════════════════
// Quality Check Engine
// ═══════════════════════════════════════════════════════════════════════════

const VAGUE_PATTERNS = [
  /^not working$/i, /^broken$/i, /^doesn'?t work$/i, /^bug$/i,
  /^it'?s? broken$/i, /^fails$/i, /^error$/i, /^problem$/i,
  /^issue$/i, /^bad$/i, /^wrong$/i, /^help$/i, /^fix$/i,
  /^doesn'?t function$/i, /^stopped$/i, /^crash$/i,
];

function checkQuality(defect) {
  const fields = [];
  const recommendations = [];

  // Title
  const title = defect.title || '';
  const titleLen = title.length;
  const hasComponentPrefix = /^\[.+\]/.test(title);
  const titleVague = VAGUE_PATTERNS.some(p => p.test(title.trim()));
  if (titleLen < 15) {
    fields.push({ field: 'title', status: 'FAIL', detail: `Too short (${titleLen} chars, need 15+)` });
    recommendations.push('Title should describe [Component] + action + impact, minimum 15 characters');
  } else if (titleVague) {
    fields.push({ field: 'title', status: 'WARN', detail: 'Vague title — describe the specific behavior' });
    recommendations.push('Replace vague title with specific: "[Component] Action causing Impact"');
  } else if (!hasComponentPrefix) {
    fields.push({ field: 'title', status: 'WARN', detail: 'Missing [Component] prefix' });
    recommendations.push('Start title with component prefix, e.g. [Navigation]');
  } else {
    fields.push({ field: 'title', status: 'PASS', detail: `Good title (${titleLen} chars, component prefix present)` });
  }

  // Severity
  const sev = defect.severity || '';
  if (!sev || !defectGuidelines.severityValues.includes(sev)) {
    fields.push({ field: 'severity', status: 'FAIL', detail: sev ? `Invalid value: "${sev}"` : 'Missing severity' });
    recommendations.push(`Set severity to one of: ${defectGuidelines.severityValues.join(', ')}`);
  } else {
    fields.push({ field: 'severity', status: 'PASS', detail: sev });
  }

  // Component
  const comp = defect.component || '';
  if (!comp) {
    fields.push({ field: 'component', status: 'FAIL', detail: 'Missing component' });
    recommendations.push('Specify the affected component (e.g. Navigation / Route Engine)');
  } else {
    fields.push({ field: 'component', status: 'PASS', detail: comp });
  }

  // Steps to Reproduce
  const steps = defect.stepsToReproduce || [];
  if (!Array.isArray(steps) || steps.length < 2) {
    fields.push({ field: 'stepsToReproduce', status: 'FAIL', detail: `${steps.length || 0} steps (need 2+)` });
    recommendations.push('Add at least 2 clear reproduction steps');
  } else {
    const shortSteps = steps.filter(s => (s || '').length < 10).length;
    if (shortSteps > 0) {
      fields.push({ field: 'stepsToReproduce', status: 'WARN', detail: `${steps.length} steps, but ${shortSteps} are too brief` });
      recommendations.push('Make each step specific and actionable (10+ characters)');
    } else {
      fields.push({ field: 'stepsToReproduce', status: 'PASS', detail: `${steps.length} detailed steps` });
    }
  }

  // Expected Behavior
  const expected = defect.expectedBehavior || '';
  if (expected.length < 10) {
    fields.push({ field: 'expectedBehavior', status: 'FAIL', detail: expected ? 'Too brief' : 'Missing' });
    recommendations.push('Describe what should happen (10+ characters)');
  } else {
    fields.push({ field: 'expectedBehavior', status: 'PASS', detail: `${expected.length} chars` });
  }

  // Actual Behavior
  const actual = defect.actualBehavior || '';
  const actualVague = VAGUE_PATTERNS.some(p => p.test(actual.trim()));
  if (actual.length < 10) {
    fields.push({ field: 'actualBehavior', status: 'FAIL', detail: actual ? 'Too brief' : 'Missing' });
    recommendations.push('Describe what actually happens with specifics (error messages, timing, frequency)');
  } else if (actualVague) {
    fields.push({ field: 'actualBehavior', status: 'WARN', detail: 'Description is vague — add specifics' });
    recommendations.push('Replace vague description with observable behavior, error codes, timing');
  } else {
    fields.push({ field: 'actualBehavior', status: 'PASS', detail: `${actual.length} chars, specific` });
  }

  // Environment
  const env = defect.environment || {};
  const hasModel = !!(env.vehicle_model || env.vehicleModel);
  const hasVersion = !!(env.software_version || env.softwareVersion);
  if (!hasModel && !hasVersion) {
    fields.push({ field: 'environment', status: 'FAIL', detail: 'Missing vehicle model and software version' });
    recommendations.push('Add environment: vehicle model and software version at minimum');
  } else if (!hasModel || !hasVersion) {
    fields.push({ field: 'environment', status: 'WARN', detail: `Missing ${!hasModel ? 'vehicle model' : 'software version'}` });
    recommendations.push(`Add missing ${!hasModel ? 'vehicle model' : 'software version'} to environment`);
  } else {
    fields.push({ field: 'environment', status: 'PASS', detail: `${Object.keys(env).length} fields` });
  }

  // Reported By
  const reporter = defect.reportedBy || '';
  if (!reporter) {
    fields.push({ field: 'reportedBy', status: 'FAIL', detail: 'Missing reporter' });
    recommendations.push('Add reporter name');
  } else {
    fields.push({ field: 'reportedBy', status: 'PASS', detail: reporter });
  }

  // Calculate dimensions
  const passCount = fields.filter(f => f.status === 'PASS').length;
  const totalFields = fields.length;
  const completeness = Math.round((passCount / totalFields) * 100);

  const clarity = Math.min(100, Math.round(
    (titleLen >= 15 ? 30 : titleLen * 2) +
    (hasComponentPrefix ? 25 : 0) +
    (!titleVague ? 20 : 0) +
    (actual.length > 50 ? 25 : actual.length / 2)
  ));

  const stepsCount = Array.isArray(steps) ? steps.length : 0;
  const avgStepLen = stepsCount > 0 ? steps.reduce((s, st) => s + (st || '').length, 0) / stepsCount : 0;
  const reproducibility = Math.min(100, Math.round(
    (stepsCount >= 2 ? 40 : stepsCount * 20) +
    (avgStepLen > 30 ? 30 : avgStepLen) +
    (defect.reproducibility ? 30 : 0)
  ));

  const attachments = defect.attachments || [];
  const evidence = Math.min(100, Math.round(
    (attachments.length > 0 ? 40 : 0) +
    (actual.length > 100 ? 30 : actual.length / 3.3) +
    (/log|trace|error|exception|stack/i.test(actual) ? 30 : 0)
  ));

  const envFields = Object.keys(env).length;
  const actionability = Math.min(100, Math.round(
    (sev ? 25 : 0) +
    (comp ? 25 : 0) +
    (envFields >= 2 ? 25 : envFields * 12.5) +
    (/\d/.test(actual) ? 25 : 0)
  ));

  const dimensions = { clarity, completeness, reproducibility, evidence, actionability };

  const score = Math.round(
    clarity * 0.20 +
    completeness * 0.30 +
    reproducibility * 0.25 +
    evidence * 0.10 +
    actionability * 0.15
  );

  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 50 ? 'D' : 'F';

  return { score, grade, fields, dimensions, recommendations };
}

// ═══════════════════════════════════════════════════════════════════════════
// Duplicate Detection Engine
// ═══════════════════════════════════════════════════════════════════════════

function defectToText(d) {
  return [
    d.title || '',
    d.description || d.actualBehavior || '',
    d.component || '',
    (d.tags || []).join(' '),
  ].join(' ');
}

function findDuplicates(queryDefect) {
  const queryText = defectToText(queryDefect);
  const dbTexts = defectDatabase.map(defectToText);
  const allTexts = [...dbTexts, queryText];

  const { vocabIndex, idf } = buildCorpus(allTexts);

  const queryTokens = tokenizeAndStem(queryText);
  const queryVec = tfidfVector(queryTokens, vocabIndex, idf);

  const matches = [];
  for (let i = 0; i < defectDatabase.length; i++) {
    const dbTokens = tokenizeAndStem(dbTexts[i]);
    const dbVec = tfidfVector(dbTokens, vocabIndex, idf);
    const tfidfScore = cosineSimilarity(queryVec, dbVec);

    // Composite scoring: TF-IDF (60%) + component match (20%) + tag overlap (20%)
    // Real embedding systems combine multiple signals; this simulates that behavior
    const compA = (queryDefect.component || '').toLowerCase();
    const compB = (defectDatabase[i].component || '').toLowerCase();
    const componentScore = compA && compB && (compA === compB || compA.includes(compB) || compB.includes(compA)) ? 1.0 : 0;

    const tagsA = new Set((queryDefect.tags || []).map(t => t.toLowerCase()));
    const tagsB = new Set((defectDatabase[i].tags || []).map(t => t.toLowerCase()));
    const tagOverlap = tagsA.size > 0 && tagsB.size > 0
      ? [...tagsA].filter(t => tagsB.has(t)).length / Math.min(tagsA.size, tagsB.size)
      : 0;

    const score = Math.min(0.99, tfidfScore * 0.60 + componentScore * 0.20 + tagOverlap * 0.20);

    if (score > 0.10) {
      const sharedFactors = findSharedFactors(queryDefect, defectDatabase[i], queryTokens, dbTokens);
      const type = score >= 0.85 ? 'exact-duplicate' : score >= 0.60 ? 'related' : 'possibly-related';
      matches.push({
        defectId: defectDatabase[i].id,
        title: defectDatabase[i].title,
        severity: defectDatabase[i].severity,
        component: defectDatabase[i].component,
        status: defectDatabase[i].status,
        score: Math.round(score * 100) / 100,
        type,
        sharedFactors,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);

  let recommendation;
  if (matches.length > 0 && matches[0].score >= 0.85) {
    recommendation = `DUPLICATE DETECTED — Link to ${matches[0].defectId} instead of creating a new defect.`;
  } else if (matches.length > 0 && matches[0].score >= 0.60) {
    recommendation = `RELATED DEFECTS FOUND — Review ${matches.slice(0, 3).map(m => m.defectId).join(', ')} before creating a new defect.`;
  } else {
    recommendation = 'No significant duplicates found. Safe to create new defect.';
  }

  return { matches: matches.slice(0, 10), recommendation, totalSearched: defectDatabase.length };
}

function findSharedFactors(a, b, tokensA, tokensB) {
  const factors = [];
  if ((a.component || '').toLowerCase() === (b.component || '').toLowerCase() && a.component) {
    factors.push(`${a.component} component`);
  }
  const tagsA = new Set((a.tags || []).map(t => t.toLowerCase()));
  const tagsB = new Set((b.tags || []).map(t => t.toLowerCase()));
  const sharedTags = [...tagsA].filter(t => tagsB.has(t));
  if (sharedTags.length > 0) {
    factors.push(...sharedTags.map(t => `Shared tag: ${t}`));
  }
  if (a.severity === b.severity && a.severity) {
    factors.push(`Same severity: ${a.severity}`);
  }
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const overlap = [...setA].filter(t => setB.has(t));
  if (overlap.length > 3) {
    factors.push(`${overlap.length} shared technical terms`);
  }
  return factors.slice(0, 6);
}

// ═══════════════════════════════════════════════════════════════════════════
// Root Cause Analysis Engine
// ═══════════════════════════════════════════════════════════════════════════

const KNOWN_CLUSTER_IDS = new Set(['DEF-3901', 'DEF-4512', 'DEF-4822', 'DEF-4823']);

// ── Dynamic Five-Whys templates ──
// Each template has {COMPONENT}, {SYMPTOM}, {DETAIL} placeholders replaced at runtime
// Order matters: most specific patterns first, most generic (crash/error) last
const CAUSAL_TEMPLATES = [
  {
    pattern: /\bblock(?:s|ed|ing)\b|synchron|freez|\bhang\b|unrespons|stutter|stall|\blag\b/i,
    category: 'design',
    symptomLabel: 'becomes unresponsive / freezes',
    whys: [
      { q: 'Why does {COMPONENT} {SYMPTOM}?', a: 'A critical operation in {COMPONENT} runs synchronously, blocking all other processing until it completes.' },
      { q: 'Why does this operation run synchronously?', a: 'The {COMPONENT} module was designed with synchronous execution and was never refactored for asynchronous or non-blocking operation.' },
      { q: 'Why was {COMPONENT} not refactored?', a: 'During the last architectural migration, {COMPONENT} was classified as stable and bypassed threading review.' },
      { q: 'Why did the review process miss the threading issue?', a: 'The review checklist validates API signatures and functional behavior, but not runtime threading or blocking patterns.' },
      { q: 'Why does the review framework lack runtime validation?', a: 'Performance and concurrency model validation were never added to the review standards — a systemic gap in the quality process.' },
    ],
  },
  {
    pattern: /leak|memory|oom|exhaust|accumul|grow/i,
    category: 'resource-management',
    symptomLabel: 'leaks resources / exhausts memory',
    whys: [
      { q: 'Why does {COMPONENT} {SYMPTOM}?', a: 'Resources (memory, handles, connections) allocated by {COMPONENT} are not released after use, accumulating over time.' },
      { q: 'Why are resources not released?', a: 'The lifecycle management for {COMPONENT} does not track or dispose of allocated resources — {DETAIL} objects persist beyond their intended scope.' },
      { q: 'Why is lifecycle management incomplete?', a: 'The component was designed for short-lived operation and was later used in a long-running context without adaptation.' },
      { q: 'Why was the usage context change not caught?', a: 'No resource profiling or leak detection is performed during integration testing.' },
      { q: 'Why is resource profiling absent from testing?', a: 'The test strategy focuses on functional correctness — non-functional characteristics like resource consumption are not validated systematically.' },
    ],
  },
  {
    pattern: /corrupt|inconsist|mismatch|out.?of.?sync|stale|drift/i,
    category: 'data-integrity',
    symptomLabel: 'produces inconsistent / corrupted data',
    whys: [
      { q: 'Why does {COMPONENT} {SYMPTOM}?', a: 'A data consistency violation in {COMPONENT} causes state to diverge from expected values — {DETAIL}.' },
      { q: 'Why does data become inconsistent?', a: 'Multiple writers update the same data without transactional guarantees or optimistic concurrency control.' },
      { q: 'Why are there no transactional guarantees?', a: 'The data access layer for {COMPONENT} was designed for single-user scenarios and lacks multi-writer coordination.' },
      { q: 'Why was multi-writer coordination not implemented?', a: 'The original design assumed sequential access — concurrent usage was introduced later without updating the data layer.' },
      { q: 'Why was the data layer not updated?', a: 'No data integrity validation exists in the CI pipeline — schema and consistency checks are manual and infrequent.' },
    ],
  },
  {
    pattern: /config|setting|parameter|flag|toggle|env(?:iron)/i,
    category: 'configuration',
    symptomLabel: 'behaves incorrectly due to configuration',
    whys: [
      { q: 'Why does {COMPONENT} {SYMPTOM}?', a: 'An incorrect or missing configuration value causes {COMPONENT} to operate in an unintended mode — {DETAIL}.' },
      { q: 'Why is the configuration incorrect?', a: 'Configuration for {COMPONENT} is environment-specific but the values were not validated during deployment.' },
      { q: 'Why was configuration not validated?', a: 'No configuration schema or validation step exists in the deployment pipeline for {COMPONENT}.' },
      { q: 'Why is there no configuration validation?', a: 'Configuration management is treated as an ops concern, not as a testable artifact in the development process.' },
      { q: 'Why is configuration not tested?', a: 'The test strategy does not include configuration permutation testing — a gap between dev and ops quality practices.' },
    ],
  },
  {
    pattern: /silent(?:ly)?|(?:without|no)\s+(?:error|notification|warning|alert)|miss(?:ed|ing)|lost|disappear|drop(?:ped)?|swallow/i,
    category: 'integration',
    symptomLabel: 'fails silently / loses data',
    whys: [
      { q: 'Why does {COMPONENT} {SYMPTOM}?', a: 'The error in {COMPONENT} is swallowed silently — no logging, alerting, or user notification occurs when {DETAIL} happens.' },
      { q: 'Why is the error swallowed in {COMPONENT}?', a: 'The error handler uses an empty catch block or generic fallback that masks the actual failure.' },
      { q: 'Why does a generic catch-all exist?', a: 'Error handling was added as a blanket safety net without distinguishing error types or severity levels.' },
      { q: 'Why were error types not distinguished?', a: 'The error taxonomy for {COMPONENT} was never defined during design — all errors are treated uniformly.' },
      { q: 'Why is error taxonomy missing from the design?', a: 'The design template does not include failure mode analysis (FMEA) as a mandatory section — a systemic process gap.' },
    ],
  },
  {
    pattern: /timeout|delay|slow|latency|performance|degrad/i,
    category: 'performance',
    symptomLabel: 'responds slowly / times out',
    whys: [
      { q: 'Why does {COMPONENT} {SYMPTOM}?', a: 'The processing time in {COMPONENT} exceeds acceptable thresholds under real-world conditions, causing {DETAIL}.' },
      { q: 'Why does processing in {COMPONENT} take too long?', a: 'The underlying algorithm has non-linear complexity that degrades significantly with data volume or concurrent load.' },
      { q: 'Why was algorithmic complexity not addressed?', a: 'Performance profiling for {COMPONENT} was not included in the iterative development workflow — only done pre-release.' },
      { q: 'Why is profiling deferred to pre-release?', a: 'Resource constraints prioritize functional testing over non-functional requirements like performance and scalability.' },
      { q: 'Why are non-functional requirements deprioritized?', a: 'No performance budget or SLA is defined at the component level — performance is treated as a system-level concern only.' },
    ],
  },
  {
    pattern: /race|concurrent|parallel|async|intermittent|flak|sporadic|random/i,
    category: 'concurrency',
    symptomLabel: 'behaves intermittently / non-deterministically',
    whys: [
      { q: 'Why does {COMPONENT} {SYMPTOM}?', a: 'A race condition between concurrent operations in {COMPONENT} leads to non-deterministic state, manifesting as {DETAIL}.' },
      { q: 'Why do concurrent operations in {COMPONENT} race?', a: 'Shared mutable state is accessed without proper synchronization primitives (locks, semaphores, or atomic operations).' },
      { q: 'Why is synchronization missing?', a: '{COMPONENT} was originally single-threaded and was later extended for concurrency without a threading model review.' },
      { q: 'Why was concurrency review skipped?', a: 'The threading model change was made incrementally without updating the component specification or test strategy.' },
      { q: 'Why was the specification not updated?', a: 'No formal change impact process exists for architectural shifts within a component — a process governance gap.' },
    ],
  },
  {
    pattern: /crash|exception|null|undefined|error|abort|segfault|panic|fail/i,
    category: 'logic-error',
    symptomLabel: 'crashes / throws an exception',
    whys: [
      { q: 'Why does {COMPONENT} {SYMPTOM}?', a: 'An unhandled error condition in {COMPONENT} causes an uncaught exception, terminating the process or leaving it in a corrupt state.' },
      { q: 'Why is this error condition unhandled in {COMPONENT}?', a: 'The error path was not anticipated during original implementation — {DETAIL} has no try/catch, fallback, or graceful degradation.' },
      { q: 'Why was this error path not anticipated?', a: 'Edge case testing for {COMPONENT} is insufficient — the test suite covers only the happy path and common scenarios.' },
      { q: 'Why is edge case testing insufficient?', a: 'Test coverage requirements focus on line/branch percentage, not on negative testing or failure mode scenarios.' },
      { q: 'Why do coverage requirements miss failure modes?', a: 'The quality gate defines coverage as a percentage metric without distinguishing positive vs. negative test cases — a process gap.' },
    ],
  },
];

// Extract the most descriptive fragment from the defect for use in Five-Whys answers
function extractDetail(defect) {
  const desc = defect.description || defect.actualBehavior || '';
  // Try to find a specific technical phrase
  const sentences = desc.split(/[.!]\s+/).filter(s => s.length > 15);
  if (sentences.length > 0) {
    // Pick the most specific sentence (longest, or one with technical terms)
    const ranked = sentences.map(s => ({
      s: s.trim(),
      score: s.length + (s.match(/module|component|service|thread|process|handler|codec|protocol|engine|driver|API|timeout|buffer|cache|queue|connection|session/gi) || []).length * 20,
    })).sort((a, b) => b.score - a.score);
    const best = ranked[0].s;
    // lowercase first char, trim trailing period
    return best.charAt(0).toLowerCase() + best.slice(1).replace(/[.]+$/, '');
  }
  return 'the affected operation';
}

function generatePreventiveMeasures(category, component) {
  const base = [
    `Conduct focused review of ${component} for the identified ${category} pattern`,
    `Add targeted regression tests covering the failure scenario in ${component}`,
    `Audit similar modules for the same ${category} pattern — defects often cluster`,
  ];
  const byCategory = {
    'design': [`Refactor ${component} to use asynchronous / non-blocking execution`, `Add threading model review to the ${component} review checklist`],
    'logic-error': [`Implement negative test cases and boundary testing for ${component}`, `Add error path coverage metrics to the quality gate`],
    'performance': [`Establish performance budgets and SLAs for ${component} operations`, `Integrate performance profiling into the ${component} CI pipeline`],
    'integration': [`Define error taxonomy and severity classification for ${component}`, `Add structured logging and alerting for silent failure modes`],
    'concurrency': [`Add concurrency testing (thread-safety analysis) to ${component} test suite`, `Implement synchronization primitives or immutable data patterns`],
    'resource-management': [`Add resource leak detection tooling to ${component} CI pipeline`, `Implement explicit lifecycle management (dispose/cleanup) patterns`],
    'data-integrity': [`Add data consistency validation checks to ${component} integration tests`, `Implement transactional guarantees or optimistic concurrency control`],
    'configuration': [`Add configuration schema validation to the deployment pipeline`, `Implement configuration permutation testing for ${component}`],
  };
  return [...base, ...(byCategory[category] || byCategory['logic-error'])];
}

function generateFishbone(category, component, detail) {
  const fishbones = {
    'design': {
      people: [`${component} team may lack expertise in async/non-blocking design patterns`, 'Code review did not assess runtime threading behavior'],
      process: ['Architecture review bypassed during migration', 'No performance gate in the development workflow'],
      tools: [`Static analysis does not detect blocking calls in ${component}`, 'Thread profiler not integrated into CI'],
      environment: ['Production load patterns not replicated in test', 'Concurrency scenarios not covered in test plan'],
      materials: ['Legacy synchronous APIs carried forward without refactoring', 'Framework lacks built-in async support for this use case'],
      measurement: [`No latency monitoring on ${component} operations`, 'Thread utilization metrics not tracked'],
    },
    'logic-error': {
      people: [`Developer unfamiliar with ${component} edge cases`, 'Peer review focused on happy path only'],
      process: ['Negative testing not required by test strategy', 'Error handling standards not enforced'],
      tools: [`Static analysis rules do not cover ${component} failure modes`, 'No fault injection testing framework'],
      environment: ['Edge case conditions difficult to reproduce in test', 'Error scenarios not included in test data'],
      materials: ['Missing input validation at system boundary', 'Incomplete error handling in dependency chain'],
      measurement: ['Error rates not monitored per component', 'Crash analytics not granular enough to identify root cause'],
    },
    'performance': {
      people: [`${component} team may not have performance engineering expertise`, 'Performance requirements not communicated clearly'],
      process: ['No performance budget defined at component level', 'Profiling only done pre-release, not per-sprint'],
      tools: [`No APM instrumentation in ${component}`, 'Load testing not automated in CI pipeline'],
      environment: ['Test environment undersized vs. production', 'Production data volumes not reflected in performance tests'],
      materials: ['Algorithm complexity not reviewed during design', 'Inefficient data structures used for the workload'],
      measurement: ['No SLA defined for this operation', 'P95/P99 latency not tracked per endpoint'],
    },
    'concurrency': {
      people: [`${component} team may lack concurrency/threading expertise`, 'Review missed shared mutable state access'],
      process: ['Concurrency model not documented in component spec', 'Thread-safety testing not part of acceptance criteria'],
      tools: ['Race condition detector not enabled in CI', 'No stress testing with concurrent users'],
      environment: ['Single-threaded test environment masks concurrency issues', 'Timing-sensitive failures not reproducible in test'],
      materials: ['Shared mutable state without synchronization', 'Event ordering assumptions not guaranteed'],
      measurement: ['Intermittent failures not tracked or classified', 'No flakiness metrics for concurrency-related tests'],
    },
    'resource-management': {
      people: [`${component} team unfamiliar with long-running resource lifecycle`, 'Code review did not assess resource disposal patterns'],
      process: ['No memory/resource profiling in the test workflow', 'Endurance testing not part of the test strategy'],
      tools: [`No leak detection tooling configured for ${component}`, 'Heap profiler not integrated into CI pipeline'],
      environment: ['Short test runs do not expose gradual resource accumulation', 'Test environment recycled too frequently to catch leaks'],
      materials: ['Objects allocated without explicit dispose/cleanup', 'Cache eviction policy missing or misconfigured'],
      measurement: ['Memory usage not monitored over time', 'No resource consumption baseline or threshold alerts'],
    },
    'data-integrity': {
      people: [`${component} team may lack expertise in distributed data consistency`, 'Review did not assess concurrent write scenarios'],
      process: ['No data validation checks in integration tests', 'Schema migration process lacks consistency verification'],
      tools: [`No data integrity assertions in ${component} test suite`, 'Database constraint enforcement not validated in CI'],
      environment: ['Single-writer test scenarios mask multi-writer conflicts', 'Test data does not cover concurrent update patterns'],
      materials: ['Missing transactional guarantees in data access layer', 'Optimistic concurrency control not implemented'],
      measurement: ['Data consistency drift not monitored', 'No checksum or hash validation on critical data paths'],
    },
    'integration': {
      people: [`${component} team may not own the full integration path`, 'Error handling responsibilities unclear across teams'],
      process: ['Failure mode analysis (FMEA) not part of design process', 'No structured error taxonomy defined for the domain'],
      tools: [`Logging in ${component} does not capture silent failures`, 'No alerting configured for dropped or swallowed errors'],
      environment: ['Test environment always returns success — failure paths untested', 'External dependency stubs mask real error behavior'],
      materials: ['Generic catch-all error handlers mask specific failures', 'No retry or dead-letter mechanism for failed operations'],
      measurement: ['Silent failure rate not tracked', 'No end-to-end health check for this integration path'],
    },
    'configuration': {
      people: [`${component} team unfamiliar with environment-specific config risks`, 'Deployment team does not validate config values'],
      process: ['No config validation step in deployment pipeline', 'Config changes not tracked as versioned artifacts'],
      tools: [`No config schema validation for ${component}`, 'Feature flag management lacks audit trail'],
      environment: ['Config values differ between environments without documentation', 'Secrets management process incomplete'],
      materials: ['Hardcoded defaults mask missing config values', 'Config file format allows invalid combinations silently'],
      measurement: ['Config drift between environments not monitored', 'No alerting on config value changes or mismatches'],
    },
  };
  const fb = fishbones[category] || fishbones['logic-error'];
  // Enrich with component name
  return { ...fb };
}

const GENERIC_FISHBONE = {
  people: ['Team may lack domain expertise for this component', 'Insufficient code review for this area'],
  process: ['Testing gaps in the relevant failure scenarios', 'Review process does not cover this failure mode'],
  tools: ['Static analysis does not detect this category of defect', 'CI pipeline lacks relevant validation'],
  environment: ['Test environment may not replicate production conditions', 'Missing edge-case test scenarios'],
  materials: ['Third-party dependencies may contribute to the issue', 'Legacy code patterns carried forward'],
  measurement: ['No telemetry for the affected behavior', 'Monitoring does not capture this failure mode'],
};

function analyzeRootCause(input) {
  const { defectIds, defect } = input;

  // Check if this is the known cluster
  if (defectIds && defectIds.some(id => KNOWN_CLUSTER_IDS.has(id))) {
    return buildKnownClusterRCA(defectIds);
  }

  // Custom defect analysis
  return buildCustomRCA(defect || {}, defectIds);
}

function buildKnownClusterRCA(defectIds) {
  const clusterDefects = defectIds
    .map(id => defectDatabase.find(d => d.id === id))
    .filter(Boolean);

  const symptoms = extractSymptoms(clusterDefects);

  return {
    cluster: {
      id: rcaDefectCluster.clusterId,
      name: rcaDefectCluster.name,
      defectCount: clusterDefects.length,
      defects: clusterDefects.map(d => ({ id: d.id, title: d.title, severity: d.severity })),
      commonFactors: rcaDefectCluster.commonFactors,
      timeRange: rcaDefectCluster.timeRange,
      trend: rcaDefectCluster.trend,
    },
    symptoms,
    fiveWhys: fiveWhysAnalysis,
    fishbone: fishboneCategories,
    comments: {
      entries: defectComments,
      analysis: commentAnalysisResult,
    },
    rootCause: rootCauseResult,
    remediation: rootCauseResult.preventiveMeasures,
    patterns: rootCauseResult.relatedPatterns,
    confidence: rootCauseResult.confidence,
  };
}

function buildCustomRCA(defect, defectIds) {
  const description = defect.description || defect.actualBehavior || defect.title || '';
  const titleAndDesc = `${defect.title || ''} ${description}`.toLowerCase();

  // Find matching causal template
  let matchedTemplate = null;
  for (const tpl of CAUSAL_TEMPLATES) {
    if (tpl.pattern.test(titleAndDesc)) {
      matchedTemplate = tpl;
      break;
    }
  }
  if (!matchedTemplate) {
    matchedTemplate = CAUSAL_TEMPLATES[1]; // default to logic-error
  }

  // Build dynamic substitution values
  const COMPONENT = defect.component || defect.title?.match(/\[([^\]]+)\]/)?.[1] || 'the affected module';
  const SYMPTOM = matchedTemplate.symptomLabel;
  const DETAIL = extractDetail(defect);

  const clusterDefects = (defectIds || [])
    .map(id => defectDatabase.find(d => d.id === id))
    .filter(Boolean);

  if (clusterDefects.length === 0 && defect.id) {
    clusterDefects.push(defect);
  }

  const symptoms = extractSymptoms(clusterDefects.length > 0 ? clusterDefects : [defect]);

  // Generate Five-Whys with dynamic substitution
  const sub = s => s.replace(/\{COMPONENT\}/g, COMPONENT).replace(/\{SYMPTOM\}/g, SYMPTOM).replace(/\{DETAIL\}/g, DETAIL);
  const fiveWhys = matchedTemplate.whys.map((w, i) => ({
    level: i + 1,
    question: sub(w.q),
    answer: sub(w.a),
  }));

  // Generate category-specific fishbone with component context
  const fishbone = generateFishbone(matchedTemplate.category, COMPONENT, DETAIL);

  const confidence = Math.min(0.95, 0.50 + (clusterDefects.length * 0.10) + (symptoms.length * 0.05));

  const rootCauseSummary = {
    id: `ROOT-${String(Date.now()).slice(-4)}`,
    category: matchedTemplate.category,
    summary: fiveWhys[4].answer,
    description: fiveWhys.map(w => w.answer).join(' → '),
    confidence: Math.round(confidence * 100) / 100,
    affectedDefects: clusterDefects.map(d => d.id),
    preventiveMeasures: generatePreventiveMeasures(matchedTemplate.category, COMPONENT),
    relatedPatterns: [],
  };

  return {
    cluster: {
      id: `CLUS-${String(Date.now()).slice(-4)}`,
      name: `${defect.component || 'Component'} Analysis`,
      defectCount: clusterDefects.length || 1,
      defects: (clusterDefects.length > 0 ? clusterDefects : [defect]).map(d => ({
        id: d.id || 'NEW',
        title: d.title || 'Custom Defect',
        severity: d.severity || 'Medium',
      })),
      commonFactors: symptoms.map(s => s.symptom).slice(0, 3),
      timeRange: 'Current analysis',
      trend: 'unknown',
    },
    symptoms,
    fiveWhys,
    fishbone,
    comments: {
      entries: {},
      analysis: {
        totalComments: 0,
        keyInsights: [{ insight: 'No historical comments available for custom analysis — results based on description patterns', mentions: 0, confidence: 'Note' }],
        timelineFromComments: [],
      },
    },
    rootCause: rootCauseSummary,
    remediation: rootCauseSummary.preventiveMeasures,
    patterns: [],
    confidence,
  };
}

function extractSymptoms(defects) {
  const SYMPTOM_PATTERNS = [
    { pattern: /freez(?:es?|ing)|hangs?|unresponsive|locks?\s*up/gi, label: 'System freeze / hang' },
    { pattern: /crash(?:es|ing)?/gi, label: 'Application crash' },
    { pattern: /fails?\s+(?:to|silently)|failure/gi, label: 'Silent failure' },
    { pattern: /\d+[\s-]*seconds?\s+(?:delay|freeze|hang|timeout)/gi, label: 'Timeout / delay' },
    { pattern: /disappears?|missing|lost/gi, label: 'Data loss / disappearance' },
    { pattern: /incorrect|wrong|unexpected/gi, label: 'Incorrect behavior' },
    { pattern: /stutter(?:s|ing)?|lag(?:s|ging)?|slow/gi, label: 'Performance degradation' },
    { pattern: /disengag(?:es?|ing)|disengage/gi, label: 'Feature disengagement' },
    { pattern: /phantom|false|spurious/gi, label: 'False positive trigger' },
  ];

  const symptoms = [];
  const seen = new Set();

  for (const defect of defects) {
    const text = [defect.title, defect.description, defect.actualBehavior].filter(Boolean).join(' ');
    for (const { pattern, label } of SYMPTOM_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(text) && !seen.has(label)) {
        seen.add(label);
        const matchCount = defects.filter(d => {
          const dt = [d.title, d.description, d.actualBehavior].filter(Boolean).join(' ');
          pattern.lastIndex = 0;
          return pattern.test(dt);
        }).length;
        symptoms.push({ symptom: label, frequency: matchCount, severity: matchCount >= 3 ? 'high' : matchCount >= 2 ? 'medium' : 'low' });
      }
    }
  }

  return symptoms.sort((a, b) => b.frequency - a.frequency);
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP Server
// ═══════════════════════════════════════════════════════════════════════════

let htmlContent;
try {
  htmlContent = readFileSync(join(__dirname, 'aqe-live-demo.html'), 'utf-8');
} catch {
  htmlContent = '<html><body><h1>aqe-live-demo.html not found</h1></body></html>';
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function sendHTML(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(html);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  try {
    // Serve HTML
    if (path === '/' && req.method === 'GET') {
      return sendHTML(res, htmlContent);
    }

    // List defects
    if (path === '/api/defects' && req.method === 'GET') {
      return sendJSON(res, 200, { defects: defectDatabase, count: defectDatabase.length });
    }

    // Quality check
    if (path === '/api/quality-check' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.defect) return sendJSON(res, 400, { error: 'Missing defect object' });
      const result = checkQuality(body.defect);
      return sendJSON(res, 200, result);
    }

    // Duplicate check
    if (path === '/api/duplicate-check' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.defect) return sendJSON(res, 400, { error: 'Missing defect object' });
      const result = findDuplicates(body.defect);
      return sendJSON(res, 200, result);
    }

    // Root cause analysis
    if (path === '/api/rca' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.defectIds && !body.defect) return sendJSON(res, 400, { error: 'Missing defectIds or defect' });
      const result = analyzeRootCause(body);
      return sendJSON(res, 200, result);
    }

    // Add defect
    if (path === '/api/defects' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.defect) return sendJSON(res, 400, { error: 'Missing defect object' });
      const newDefect = {
        ...body.defect,
        id: body.defect.id || `DEF-${String(Date.now()).slice(-4)}`,
        status: 'open',
        reportedDate: new Date().toISOString().split('T')[0],
      };
      defectDatabase.push(newDefect);
      return sendJSON(res, 201, { success: true, defect: newDefect });
    }

    // Serve sample data endpoints
    if (path === '/api/samples/poor-defect' && req.method === 'GET') {
      return sendJSON(res, 200, poorQualityDefect);
    }
    if (path === '/api/samples/good-defect' && req.method === 'GET') {
      return sendJSON(res, 200, goodQualityDefect);
    }
    if (path === '/api/samples/dupe-candidate' && req.method === 'GET') {
      return sendJSON(res, 200, newDefectForDupeCheck);
    }

    // 404
    sendJSON(res, 404, { error: 'Not found' });
  } catch (e) {
    sendJSON(res, 500, { error: e.message || 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`\n  AQE Live Demo running on http://localhost:${PORT}\n`);
  console.log(`  Endpoints:`);
  console.log(`    GET  /                     → Interactive Demo UI`);
  console.log(`    GET  /api/defects           → List defects (${defectDatabase.length} loaded)`);
  console.log(`    POST /api/quality-check     → Defect quality validation`);
  console.log(`    POST /api/duplicate-check   → TF-IDF duplicate detection`);
  console.log(`    POST /api/rca              → Root cause analysis`);
  console.log(`    POST /api/defects           → Add new defect\n`);
});
