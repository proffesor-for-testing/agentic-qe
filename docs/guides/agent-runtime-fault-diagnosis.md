# Agent runtime fault diagnosis benchmark

AQE ships a deterministic synthetic corpus for measuring whether a detector can
separate clean agent runs from operational faults, classify the fault, and
localize it. The corpus is a benchmark fixture. It does not inject faults into
real services.

```ts
import {
  AgentFaultDiagnosis,
} from 'agentic-qe';

const corpus = AgentFaultDiagnosis.createAgentFaultDiagnosisCorpus();
const report = AgentFaultDiagnosis.scoreAgentFaultDetector(
  corpus,
  AgentFaultDiagnosis.referenceAwareAqeDetector,
);
const qualification = AgentFaultDiagnosis.qualifyAgentFaultDetector(report);
```

The initial corpus pairs a clean trace with each of eight single-fault traces:
tool unavailability, tool timeout, plausible output corruption, context
truncation, delegation timeout, agent misrouting, delegation loops, and
guardrail bypass. Tool, model/context, guardrail, and inter-agent boundaries are
represented. Mixed faults are explicitly outside this corpus version.

Detector inputs contain versioned sanitized traces and deterministic structured
views. Spans retain timing, status, byte counts, hashes, intended and actual
destinations, policy references, retries, recovery, and terminal outcome. They
do not contain payloads, injection manifests, ground-truth labels, fixture
paths, or target labels. Provenance and truth remain under each case's
`heldOut` property and must be passed only to the scorer.

The scorer reports clean precision/recall and false-positive rate, fault recall,
type top-1/top-k, component and exact-span localization, joint type/location,
per-fault and per-boundary slices, parse and abstention rates, latency, tokens,
cost, and a Wilson 95% interval for recall. Per-case receipts keep injection,
observability, detection, localization, recovery, and final task success as
separate facts. A detector that always predicts the most common fault fails the
qualification gate.

`directSignalBaseline` recognizes only explicit runtime signals and abstains on
plausible output changes. `referenceAwareAqeDetector` additionally compares the
aligned clean output hash and applies the referenced policy decision. This
prevents successful task completion or a well-formed trace from certifying
silent corruption or a forged guardrail pass.
