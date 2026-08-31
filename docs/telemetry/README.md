# Delivery-metric snapshots

`scripts/collect-production-telemetry.sh` is an explicit, maintainer-invoked
diagnostic. It is not production observability and must not run automatically
after a release.

The script reads repository metadata through the GitHub API and writes a local
JSON snapshot containing:

- release count per week;
- release creation-to-publication time;
- failed npm-publish workflow runs;
- lifecycle time for closed issues labelled `bug`; and
- open bug counts.

These values are only rough delivery-process proxies. In particular, they do
not measure commit-to-production lead time, production incidents, service
recovery time, availability, latency, errors, traffic, or user impact. Run the
script manually only when those limitations fit the question being asked, and
review its JSON before retaining or sharing it.

Generated snapshots belong under `docs/telemetry/production/` and are not
committed automatically, uploaded as workflow artifacts, turned into pull
requests, or used to create issues.
