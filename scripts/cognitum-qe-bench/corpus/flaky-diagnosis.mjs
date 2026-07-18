// flaky-diagnosis — LABELED oracle. Classify a flaky test's root-cause class from
// its symptom description + logs: timing | order-dependency | environment |
// network | randomness. Needs multi-signal reasoning over the evidence, where
// cheap models tend to default to "timing" for everything. v1 seed set: 6 cases.
import { gradeLabel } from '../lib/grade.mjs';

const CHOICES = ['timing', 'order-dependency', 'environment', 'network', 'randomness'];

const SAMPLES = [
  {
    id: 'shared-state',
    symptom: 'Test `updates count` passes when run alone but fails when the whole file runs. It reads a module-level `counter` that an earlier test in the file increments and never resets.',
    gold: 'order-dependency',
  },
  {
    id: 'sleep-race',
    symptom: 'Test asserts a value 50ms after firing an async job with `await sleep(50)`. Passes on a fast dev box, fails ~20% on the loaded CI runner where the job sometimes takes 70ms.',
    gold: 'timing',
  },
  {
    id: 'tz-dependent',
    symptom: "Test `formats date` asserts '2026-01-01 00:00'. Green in CI (UTC), red on a developer laptop set to PST where the same timestamp renders as the previous day.",
    gold: 'environment',
  },
  {
    id: 'live-endpoint',
    symptom: 'Integration test hits `https://api.example.com/health` directly. Fails intermittently with ECONNRESET / 503 when that third-party service has a blip; passes on retry.',
    gold: 'network',
  },
  {
    id: 'unseeded-rng',
    symptom: 'Test generates a value with `Math.random()` and asserts it is > 0.1. Fails roughly 1 run in 10 with no code change and no load correlation.',
    gold: 'randomness',
  },
  {
    id: 'db-port-env',
    symptom: 'Test suite passes in CI but fails locally with ECONNREFUSED on 5432 for developers who have not started the local Postgres container; the connection string is read from an env var that defaults to localhost.',
    gold: 'environment',
  },
];

export default {
  id: 'flaky-diagnosis',
  title: 'Diagnose a flaky test’s root-cause class',
  oracleType: 'labeled',
  maxTokens: 600,
  samples: SAMPLES.map((s) => ({ id: s.id, task: s.symptom, gold: s.gold, choices: CHOICES })),
  buildPrompt(sample) {
    return [
      { role: 'system', content: `You are a QE flaky-test analyst. Classify the root cause as exactly one of: ${CHOICES.join(', ')}. order-dependency = leaked state between tests; timing = real async/latency races; environment = machine/tz/config differences; network = external service calls; randomness = unseeded RNG. Your VERY FIRST line must be exactly "CLASSIFICATION: <label>"; then justify briefly.` },
      { role: 'user', content: sample.task },
    ];
  },
  async grade(sample, output) {
    return gradeLabel({ output, gold: sample.gold, choices: sample.choices });
  },
};
