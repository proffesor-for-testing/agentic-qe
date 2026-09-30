# Deterministic behavior examples

`test_generate_enhanced` accepts caller-owned specification fixtures. Expected
values come from those fixtures, never from evaluating or translating the source
implementation. The generator does not decide whether a supplied specification
is correct; supply independently reviewed requirements or existing trusted data.

```json
{
  "filePath": "/project/src/calculator.js",
  "language": "javascript",
  "framework": "node-test",
  "aiEnhancement": false,
  "behaviorExamples": [
    {"functionName": "add", "args": [2, 3], "expected": 5},
    {"functionName": "add", "args": [-2, 0], "expected": -2}
  ]
}
```

The equivalent CLI accepts a JSON file containing the examples array:

```sh
aqe test generate src/calculator.js --framework node-test --behavior-examples examples.json
```

Supported scope: one JavaScript/TypeScript source file, unit tests, named directly
exported function declarations, arrow functions and function expressions, required
identifier parameters, synchronous or async JSON return values. Frameworks are
Vitest, Jest and Node's test runner. Run generated tests with that framework in a
project configured for the source language (TypeScript needs the project's usual
TS runner). Node ESM requires an ESM project or `.mjs` output; generated imports
preserve the source extension. Real source file imports are absolute paths.

Default exports, re-exports, classes, generators, `this`, rest/default/optional or
destructured parameters and expected exceptions are unsupported. Invalid examples,
unsupported exports/frameworks and multi-file example requests fail explicitly.
JSON fixtures cannot contain undefined, non-finite numbers, negative zero, cycles
or non-JSON objects. Fixtures assert deep strict equality, including object keys.
Examples never invoke an LLM, even if AI enhancement is enabled.

Without examples and without successful LLM enhancement, supported unit generation
returns a **skipped scaffold**, with zero assertions and `generationMode:
"scaffolding"`. It does not fabricate constructor calls or behavior expectations.
The CLI's existing quality gate rejects such a scaffold as having no assertions;
provide examples before using CLI output as executable quality evidence.

Each test reports `generationLimits`; supplied examples use `generationMode:
"behavior-examples"`. Coverage is **unmeasured**: coverage fields
are `null` (unknown), distinct from measured numeric zero. MCP coverage confidence is
zero whenever coverage is unmeasured, including AI-enhanced generation. Run coverage collection to obtain measurement.
Missing examples for other supported exports are listed explicitly. Unsupported
source shapes are not covered. Other languages/frameworks and integration/e2e
requests retain their existing template behavior and do not accept these fixtures.

Inline `sourceCode` without `filePath` uses `./module-under-test`: save the source
and correct that import before running. The result explicitly reports this limit.
