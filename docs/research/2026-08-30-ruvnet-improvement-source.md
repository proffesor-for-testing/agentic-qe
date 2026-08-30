# Research source ledger — RuvNet improvements (2026-08-30)

Research cutoff: 2026-08-30 UTC. Repository state was inspected at immutable
commits, with project documentation and source treated as primary evidence.

| Source | Pinned state | Use |
|---|---|---|
| [Dream Machine](https://github.com/ruvnet/dream-machine/tree/7933c3599abe22df5290f4609d1f93f598feb3de) | `7933c3599abe22df5290f4609d1f93f598feb3de` (2026-08-26) | Configuration compiler, staged proposal/evaluation/promotion, evidence pipeline |
| [Dream Machine v0.1.0](https://github.com/ruvnet/dream-machine/releases/tag/v0.1.0) | published 2026-08-13 | Shipped baseline; later work may still be unreleased |
| [MetaHarness](https://github.com/ruvnet/metaharness/tree/b611993d7088dff877f5713e41031a714e77bfc0) | `b611993d7088dff877f5713e41031a714e77bfc0` (2026-08-30) | Package-by-package comparison |
| [MetaHarness v0.4.4](https://github.com/ruvnet/metaharness/releases/tag/v0.4.4) | published 2026-08-10 | Latest published umbrella release at cutoff |
| [Horizon](https://github.com/ruvnet/metaharness/tree/b611993d7088dff877f5713e41031a714e77bfc0/packages/horizon) | pinned with MetaHarness | Flush-before-summarize, whole-command classification, halt/checkpoint primitives |
| [RedBlue](https://github.com/ruvnet/metaharness/tree/b611993d7088dff877f5713e41031a714e77bfc0/packages/redblue) | pinned with MetaHarness | Capability-contained adversarial adapter and non-vacuous target coverage |
| [Router](https://github.com/ruvnet/metaharness/tree/b611993d7088dff877f5713e41031a714e77bfc0/packages/router) | pinned with MetaHarness | Calibration/throughput benchmark patterns; overlaps AQE router runtime |
| [Flywheel](https://github.com/ruvnet/metaharness/tree/b611993d7088dff877f5713e41031a714e77bfc0/packages/flywheel) | pinned with MetaHarness | Frozen gates, holdout/anchor separation, replayable lineage |
| [Turn Credit](https://github.com/ruvnet/metaharness/tree/b611993d7088dff877f5713e41031a714e77bfc0/packages/turn-credit) | pinned with MetaHarness | Advisory credit attribution with explicit proxy limitations |

Notes:

- Claims in the recommendation report are limited to these pinned sources and
  the Agentic QE repository at `fb687f2b`.
- Package README benchmark numbers are upstream self-reports, not independently
  reproduced AQE results.
- Pre-1.0 APIs and draft/unreleased Dream Machine changes are treated as design
  evidence, not stable dependencies.
